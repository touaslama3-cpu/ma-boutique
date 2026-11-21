const Stripe = require("stripe");

module.exports.config = {
  api: { bodyParser: false }
};

async function readRawBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) {
      const error = new Error("Payload trop volumineux.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ received: false });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secretKey || !webhookSecret) {
    return res.status(503).json({ received: false, error: "Webhook Stripe non configuré." });
  }

  const signature = req.headers["stripe-signature"];
  if (!signature) {
    return res.status(400).json({ received: false, error: "Signature Stripe manquante." });
  }

  try {
    const rawBody = await readRawBody(req);
    const stripe = new Stripe(secretKey);
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);

    if (
      event.type === "checkout.session.completed" ||
      event.type === "checkout.session.async_payment_succeeded"
    ) {
      const session = event.data.object;
      if (session.mode === "payment" && session.payment_status === "paid") {
        // Stripe conserve l'événement et les métadonnées de commande dans son tableau de bord.
        // Aucune expédition automatique n'est déclenchée par ce webhook.
        console.info("TAWCO_PAID_ORDER", JSON.stringify({
          eventId: event.id,
          sessionId: session.id,
          amountTotal: session.amount_total,
          currency: session.currency,
          customerEmail: session.customer_details?.email || session.customer_email || null,
          orderItems: session.metadata?.order_items || null
        }));
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Stripe webhook error:", error && error.message);
    return res.status(error.statusCode || 400).json({ received: false });
  }
};
