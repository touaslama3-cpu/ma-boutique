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
async function sendEmail(to, subject, html) {
  const key = process.env.RESEND_API_KEY, from = process.env.ORDER_FROM_EMAIL;
  if (!key || !from || !to) return;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [to], subject, html })
  });
  if (!response.ok) console.error("Resend error:", response.status);
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
      if (session.mode === "payment" && session.payment_status === "paid") {
        const email = session.customer_details?.email || session.customer_email || "";
        const details = session.shipping_details || session.customer_details || {};
        const address = details.address || {};
        const items = JSON.parse(session.metadata?.order_items || "[]");
        if (!email || !items.length) return res.status(400).json({ received: false, error: "Données de commande manquantes." });
        const payload = {
          stripe_session_id: session.id,
          stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id || null,
          customer_email: email,
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
          await sendEmail(email, "Confirmation de votre commande TAW.co",
            "<p>Bonjour " + (payload.customer_name || "") + ",</p><p>Nous avons bien reçu votre paiement et votre commande est enregistrée.</p><p>Montant : " + ((payload.amount_total / 100).toFixed(2)) + " €</p><p>Nous vous informerons dès l’expédition.</p><p>Merci pour votre confiance — TAW.co</p>");
        }
      }
    }
    if (event.type === "charge.refunded") {
      const charge = event.data.object;
      const paymentIntent = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
      if (paymentIntent) {
        const response = await supabase("orders?stripe_payment_intent_id=eq." + encodeURIComponent(paymentIntent), {
          method: "PATCH", body: JSON.stringify({ payment_status: "refunded", fulfillment_status: "remboursée" })
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
