const Stripe = require("stripe");

// Catalogue TAW actuel. Le paiement reste bloqué tant que
// TAWCO_CHECKOUT_ENABLED n'est pas explicitement défini à "true".
const CATALOG = {
  101: { name: "T-shirt essentiel femme", amount: 1990 },
  102: { name: "Chemise oversize femme", amount: 2990 },
  103: { name: "Robe casual", amount: 3490 },
  104: { name: "Ensemble détente femme", amount: 3990 },
  105: { name: "Jean coupe droite femme", amount: 3490 },
  106: { name: "T-shirt basique homme", amount: 1990 },
  107: { name: "Sweat à capuche homme", amount: 3490 },
  108: { name: "Chemise casual homme", amount: 3290 },
  109: { name: "Jean homme", amount: 3990 },
  110: { name: "Veste légère unisexe", amount: 4490 },
  111: { name: "Baskets lifestyle", amount: 4990 },
  112: { name: "Sneakers minimalistes", amount: 5490 },
  113: { name: "Sac porté épaule", amount: 2990 },
  114: { name: "Lunettes de soleil", amount: 1990 },
  115: { name: "Casquette urbaine", amount: 1790 }
};

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Méthode non autorisée." }); }
  if (process.env.TAWCO_CHECKOUT_ENABLED !== "true") {
    return res.status(503).json({ error: "Le paiement en ligne sera ouvert après validation finale de la boutique." });
  }
  const secret = process.env.STRIPE_SECRET_KEY;
  const siteUrl = process.env.SITE_URL;
  if (!secret || !siteUrl || !/^https:\/\/[a-z0-9.-]+$/i.test(siteUrl)) {
    return res.status(503).json({ error: "Le paiement est en attente de configuration sécurisée. Aucun paiement n’a été effectué." });
  }
  try {
    const { items, email } = req.body || {};
    const supabaseUrl = process.env.SUPABASE_URL, serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) return res.status(503).json({ error: "Validation des variantes indisponible." });
    let customerUserId = null;
    const authHeader = req.headers.authorization || "";
    if (authHeader.startsWith("Bearer ")) {
      const accessToken = authHeader.slice(7).trim();
      if (!accessToken || accessToken.length > 8192) return res.status(401).json({ error: "Session client invalide. Reconnectez-vous." });
      const authResponse = await fetch(supabaseUrl + "/auth/v1/user", {
        headers: { apikey: serviceKey, Authorization: "Bearer " + accessToken }
      });
      const authUser = await authResponse.json().catch(() => null);
      if (!authResponse.ok || !authUser || !authUser.id || String(authUser.email || "").toLowerCase() !== String(email || "").toLowerCase()) {
        return res.status(401).json({ error: "Votre session ne correspond pas à l’adresse e-mail de commande." });
      }
      customerUserId = authUser.id;
    }
    if (!Array.isArray(items) || items.length < 1 || items.length > 15) return res.status(400).json({ error: "Panier invalide." });
    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ error: "Adresse e-mail invalide." });
    const quantities = new Map();
    for (const item of items) {
      const id = Number(item && item.id), quantity = Number(item && item.quantity);
      const variantKey = String(item && item.variant_key || "").trim().toLowerCase();
      if (!CATALOG[id] || !Number.isInteger(quantity) || quantity < 1 || quantity > 20 ||
          !/^[a-z0-9-]{1,100}$/.test(variantKey)) {
        return res.status(400).json({ error: "Chaque article doit inclure une variante vérifiée." });
      }
      const key = id + ":" + variantKey;
      quantities.set(key, (quantities.get(key) || 0) + quantity);
    }
    if ([...quantities.values()].some(q => q > 20)) return res.status(400).json({ error: "Quantité maximale dépassée." });
    const orderItems = await Promise.all([...quantities.entries()].map(async ([key, quantity]) => {
      const [idText, variantKey] = key.split(":");
      const id = Number(idText);
      const url = supabaseUrl + "/rest/v1/supplier_variant_mappings?select=store_product_id,variant_key,cj_variant_id&store_product_id=eq." +
        id + "&variant_key=eq." + encodeURIComponent(variantKey) + "&is_active=eq.true&limit=2";
      const response = await fetch(url, { headers: { apikey: serviceKey, Authorization: "Bearer " + serviceKey } });
      const rows = await response.json().catch(() => []);
      if (!response.ok || !Array.isArray(rows) || rows.length !== 1 || !rows[0].cj_variant_id) {
        throw Object.assign(new Error("VARIANT_NOT_VERIFIED"), { statusCode: 409 });
      }
      return { id, variant_key: variantKey, name: CATALOG[id].name, quantity, unit_amount: CATALOG[id].amount };
    }));
    const encodedOrderItems = orderItems.map(item => `${item.id}:${item.quantity}:${item.variant_key}`).join(",");
    if (encodedOrderItems.length > 500) return res.status(400).json({ error: "Le panier contient trop de variantes pour être traité en une seule commande." });
    const stripe = new Stripe(secret);
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: email,
      customer_creation: "always",
      line_items: orderItems.map(item => ({
        quantity: item.quantity,
        price_data: { currency: "eur", unit_amount: item.unit_amount, product_data: { name: item.name } }
      })),
      shipping_address_collection: { allowed_countries: ["FR"] },
      phone_number_collection: { enabled: true },
      billing_address_collection: "auto",
      metadata: { order_source: "TAW.co", order_items: encodedOrderItems, ...(customerUserId ? { customer_user_id: customerUserId } : {}) },
      payment_intent_data: { metadata: { order_source: "TAW.co" } },
      success_url: siteUrl + "/?payment=success&session_id={CHECKOUT_SESSION_ID}",
      cancel_url: siteUrl + "/?payment=cancelled"
    });
    return res.status(200).json({ url: session.url });
  } catch (error) {
    if (error && error.statusCode === 409) return res.status(409).json({ error: "Une variante du panier n’est plus validée. Actualisez la boutique avant de continuer." });
    console.error("Stripe Checkout error:", error && error.message);
    return res.status(502).json({ error: "Impossible de créer la session de paiement. Réessayez plus tard." });
  }
};
