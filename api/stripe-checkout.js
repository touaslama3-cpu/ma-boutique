const Stripe = require("stripe");

const CATALOG = {
  1: { name: "Organisateur de câbles adhésif", amount: 1290 },
  2: { name: "Support mural balais et serpillières", amount: 1790 },
  3: { name: "Filtre anti-cheveux pour douche", amount: 1290 },
  4: { name: "Sac de rangement transparent pour décorations", amount: 1690 },
  5: { name: "Crochets muraux adhésifs", amount: 990 },
  6: { name: "T-shirt essentiel homme", amount: 1990 },
  7: { name: "Sweat à capuche homme", amount: 3490 },
  8: { name: "Polo Maroc homme", amount: 2790 },
  9: { name: "Baskets urbaines", amount: 4490 },
  10: { name: "Montre connectée style sport", amount: 3990 },
  11: { name: "Lunettes de soleil polarisées sport", amount: 1890 },
  12: { name: "Portefeuille compact avec RFID", amount: 2290 },
  13: { name: "Sac à dos quotidien", amount: 3290 }
};

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Méthode non autorisée." }); }
  const secret = process.env.STRIPE_SECRET_KEY;
  const siteUrl = process.env.SITE_URL;
  if (!secret || !siteUrl || !/^https:\/\/[a-z0-9.-]+$/i.test(siteUrl)) {
    return res.status(503).json({ error: "Le paiement est en attente de configuration sécurisée. Aucun paiement n’a été effectué." });
  }
  try {
    const { items, email } = req.body || {};
    if (!Array.isArray(items) || items.length < 1 || items.length > 13) return res.status(400).json({ error: "Panier invalide." });
    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) return res.status(400).json({ error: "Adresse e-mail invalide." });
    const quantities = new Map();
    for (const item of items) {
      const id = Number(item && item.id), quantity = Number(item && item.quantity);
      if (!CATALOG[id] || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) return res.status(400).json({ error: "Un article du panier est invalide." });
      quantities.set(id, (quantities.get(id) || 0) + quantity);
    }
    if ([...quantities.values()].some(q => q > 20)) return res.status(400).json({ error: "Quantité maximale dépassée." });
    const orderItems = [...quantities.entries()].map(([id, quantity]) => ({
      id, name: CATALOG[id].name, quantity, unit_amount: CATALOG[id].amount
    }));
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
      billing_address_collection: "auto",
      metadata: { order_source: "TAW.co", order_items: JSON.stringify(orderItems) },
      payment_intent_data: { metadata: { order_source: "TAW.co" } },
      success_url: siteUrl + "/?payment=success&session_id={CHECKOUT_SESSION_ID}",
      cancel_url: siteUrl + "/?payment=cancelled"
    });
    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error("Stripe Checkout error:", error && error.message);
    return res.status(502).json({ error: "Impossible de créer la session de paiement. Réessayez plus tard." });
  }
};
