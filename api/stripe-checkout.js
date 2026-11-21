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
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Méthode non autorisée." });
  }
  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(503).json({ error: "Le paiement Stripe est en attente de configuration de la clé secrète." });
  }
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const { items, email } = req.body || {};
    if (!Array.isArray(items) || items.length < 1 || items.length > 13) {
      return res.status(400).json({ error: "Panier invalide." });
    }
    if (typeof email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return res.status(400).json({ error: "Adresse e-mail invalide." });
    }
    const seen = new Set();
    const line_items = [];
    for (const item of items) {
      const id = Number(item && item.id);
      const quantity = Number(item && item.quantity);
      const product = CATALOG[id];
      if (!product || seen.has(id) || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
        return res.status(400).json({ error: "Un article du panier est invalide." });
      }
      seen.add(id);
      line_items.push({
        quantity,
        price_data: {
          currency: "eur",
          unit_amount: product.amount,
          product_data: { name: product.name }
        }
      });
    }
    const origin = "https://www.taw.co";
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: email,
      line_items,
      billing_address_collection: "auto",
      success_url: origin + "/?payment=success&session_id={CHECKOUT_SESSION_ID}",
      cancel_url: origin + "/?payment=cancelled"
    });
    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error("Stripe Checkout error:", error && error.message);
    return res.status(500).json({ error: "Impossible de créer la session de paiement. Réessayez plus tard." });
  }
};
