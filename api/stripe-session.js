const Stripe = require("stripe");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Méthode non autorisée." });
  }
  const sessionId = typeof req.query.session_id === "string" ? req.query.session_id : "";
  if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(sessionId)) {
    return res.status(400).json({ paid: false, error: "Référence de paiement invalide." });
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(503).json({ paid: false, error: "Vérification du paiement indisponible." });
  }
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.mode !== "payment" || session.payment_status !== "paid" || session.metadata?.order_source !== "TAW.co") {
      return res.status(200).json({ paid: false });
    }
    // The storefront only needs a paid/not-paid result. Never expose customer
    // email or other Checkout session details through this public endpoint.
    return res.status(200).json({ paid: true });
  } catch (error) {
    console.error("Stripe session verification error:", error && error.message);
    return res.status(500).json({ paid: false, error: "Impossible de vérifier le paiement." });
  }
};
