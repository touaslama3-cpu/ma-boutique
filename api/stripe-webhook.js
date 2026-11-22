const Stripe = require("stripe");

module.exports.config = { api: { bodyParser: false } };

async function readRawBody(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) { const error = new Error("Payload trop volumineux."); error.statusCode = 413; throw error; }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
async function supabase(path, options = {}) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase non configuré");
  return fetch(url + "/rest/v1/" + path, {
    ...options,
    headers: {
      apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json",
      Prefer: "resolution=ignore-duplicates,return=representation", ...(options.headers || {})
    }
  });
}
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
function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}
function parseOrderItems(raw) {
  if (typeof raw !== "string" || !raw || raw.length > 500) return [];
  const parts = raw.split(",");
  if (!parts.length || parts.length > 15) return [];
  const seen = new Set();
  const items = [];
  for (const part of parts) {
    const match = /^(\d{3}):(\d{1,2}):([a-z0-9-]{1,100})$/.exec(part);
    if (!match) return [];
    const id = Number(match[1]), quantity = Number(match[2]), variant_key = match[3], product = CATALOG[id];
    const itemKey = id + ":" + variant_key;
    if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 20 || seen.has(itemKey)) return [];
    seen.add(itemKey);
    items.push({ id, name: product.name, quantity, unit_amount: product.amount, variant_key });
  }
  return items;
}
async function sendEmail(to, subject, html) {
  const key = process.env.RESEND_API_KEY, from = process.env.ORDER_FROM_EMAIL;
  if (!key || !from || !to) { console.error("Order confirmation email skipped: Resend configuration or recipient missing."); return false; }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html })
  });
  if (!response.ok) { console.error("Resend confirmation email failed:", response.status); return false; }
  return true;
}
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ received: false }); }
  const secretKey = process.env.STRIPE_SECRET_KEY, webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey || !webhookSecret) return res.status(503).json({ received: false, error: "Webhook Stripe non configuré." });
  const signature = req.headers["stripe-signature"];
  if (!signature) return res.status(400).json({ received: false, error: "Signature Stripe manquante." });
  try {
    const rawBody = await readRawBody(req);
    const stripe = new Stripe(secretKey);
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      const session = event.data.object;
      if (session.mode === "payment" && session.payment_status === "paid" && session.metadata?.order_source === "TAW.co") {
        const email = session.customer_details?.email || session.customer_email || "";
        const phone = typeof session.customer_details?.phone === "string" ? session.customer_details.phone.trim() : "";
        const details = session.shipping_details || session.customer_details || {};
        const address = details.address || {};
        const items = parseOrderItems(session.metadata?.order_items || "");
        const expectedTotal = items.reduce((sum, item) => sum + item.unit_amount * item.quantity, 0);
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
            !phone || phone.length > 40 || !items.length || session.currency !== "eur" || Number(session.amount_total) !== expectedTotal) {
          console.error("Rejected paid Checkout session: invalid email, catalogue items, currency or total.");
          return res.status(400).json({ received: false, error: "Données de commande invalides." });
        }
        const payload = {
          stripe_session_id: session.id,
          user_id: typeof session.metadata?.customer_user_id === "string" && /^[0-9a-f-]{36}$/i.test(session.metadata.customer_user_id) ? session.metadata.customer_user_id : null,
          stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null,
          customer_email: email,
          customer_phone: phone,
          customer_name: details.name || session.customer_details?.name || null,
          shipping_address: {
            line1: address.line1 || null, line2: address.line2 || null, postal_code: address.postal_code || null,
            city: address.city || null, state: address.state || null, country: address.country || null
          },
          items, amount_total: session.amount_total || 0, currency: session.currency || "eur",
          payment_status: "paid", fulfillment_status: "à préparer"
        };
        const response = await supabase("orders?on_conflict=stripe_session_id", { method: "POST", body: JSON.stringify(payload) });
        const rows = await response.json();
        if (!response.ok) { console.error("Supabase order insert failed:", response.status, rows); return res.status(503).json({ received: false }); }
        if (Array.isArray(rows) && rows.length) {
          try {
            const emailSent = await sendEmail(email, "Confirmation de votre commande TAW.co",
              "<p>Bonjour " + escapeHtml(payload.customer_name || "client") + ",</p><p>Nous avons bien reçu votre paiement et votre commande est enregistrée.</p><p>Montant : " + ((payload.amount_total / 100).toFixed(2)) + " €</p><p>Nous vous informerons dès l’expédition.</p><p>Merci pour votre confiance — TAW.co</p>");
            if (!emailSent) console.error("Order confirmation email was not accepted by Resend.");
          } catch (emailError) {
            console.error("Order confirmation email failed:", emailError && emailError.message);
          }
        }
      }
    }
    if (event.type === "charge.refunded") {
      const charge = event.data.object;
      const paymentIntent = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
      if (paymentIntent) {
        const amount = Number(charge.amount || 0);
        const refundedAmount = Number(charge.amount_refunded || 0);
        const fullyRefunded = amount > 0 && refundedAmount >= amount;
        const patch = {
          refunded_amount: refundedAmount,
          payment_status: fullyRefunded ? "refunded" : "partially_refunded",
          updated_at: new Date().toISOString()
        };
        if (fullyRefunded) patch.fulfillment_status = "remboursée";
        const response = await supabase("orders?stripe_payment_intent_id=eq." + encodeURIComponent(paymentIntent), {
          method: "PATCH", body: JSON.stringify(patch)
        });
        if (!response.ok) return res.status(503).json({ received: false });
      }
    }
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Stripe webhook error:", error && error.message);
    return res.status(error.statusCode || 400).json({ received: false });
  }
};
