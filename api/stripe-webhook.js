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
  1: { name: "Organisateur de câbles adhésif", amount: 1290 },
  2: { name: "Support mural balais et serpillières", amount: 1790 },
  3: { name: "Filtre anti-cheveux pour douche", amount: 1290 },
  4: { name: "Sac de rangement transparent pour décorations", amount: 1690 },
  5: { name: "Crochets muraux adhésifs", amount: 990 },
  6: { name: "T-shirt essentiel homme", amount: 1990 },
  7: { name: "Sweat à capuche homme", amount: 3490 },
  8: { name: "Polo homme classique", amount: 2790 },
  9: { name: "Baskets urbaines", amount: 4490 },
  10: { name: "Montre connectée style sport", amount: 3990 },
  11: { name: "Lunettes de soleil polarisées sport", amount: 1890 },
  12: { name: "Portefeuille compact avec RFID", amount: 2290 },
  13: { name: "Sac à dos quotidien", amount: 3290 }
};
function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}
function parseOrderItems(raw) {
  if (typeof raw !== "string" || !raw || raw.length > 200) return [];
  const parts = raw.split(",");
  if (!parts.length || parts.length > 13) return [];
  const seen = new Set();
  const items = [];
  for (const part of parts) {
    const match = /^(\d{1,2}):(\d{1,2})$/.exec(part);
    if (!match) return [];
    const id = Number(match[1]), quantity = Number(match[2]), product = CATALOG[id];
    if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 20 || seen.has(id)) return [];
    seen.add(id);
    items.push({ id, name: product.name, quantity, unit_amount: product.amount });
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
        const details = session.shipping_details || session.customer_details || {};
        const address = details.address || {};
        const items = parseOrderItems(session.metadata?.order_items || "");
        const expectedTotal = items.reduce((sum, item) => sum + item.unit_amount * item.quantity, 0);
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
            !items.length || session.currency !== "eur" || Number(session.amount_total) !== expectedTotal) {
          console.error("Rejected paid Checkout session: invalid email, catalogue items, currency or total.");
          return res.status(400).json({ received: false, error: "Données de commande invalides." });
        }
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
