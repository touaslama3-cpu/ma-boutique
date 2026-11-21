const PRODUCTS = {
  1: { name: "Organisateur de câbles adhésif", price: 1290 }, 2: { name: "Support mural balais et serpillières", price: 1790 },
  3: { name: "Filtre anti-cheveux pour douche", price: 1290 }, 4: { name: "Boîte de rangement transparente", price: 1690 },
  5: { name: "Crochets muraux adhésifs", price: 990 }, 6: { name: "T-shirt essentiel homme", price: 1990 },
  7: { name: "Sweat à capuche homme", price: 3490 }, 8: { name: "Polo homme classique", price: 2790 },
  9: { name: "Baskets urbaines", price: 4490 }, 10: { name: "Montre minimaliste", price: 3990 },
  11: { name: "Lunettes de soleil", price: 1890 }, 12: { name: "Portefeuille compact", price: 2290 },
  13: { name: "Sac à dos quotidien", price: 3290 }
};
function reply(res, status, body) { res.status(status).json(body); }
module.exports = async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return reply(res, 405, { error: "Méthode non autorisée." }); }
  const secret = process.env.STRIPE_SECRET_KEY, siteUrl = process.env.SITE_URL;
  if (!secret || !secret.startsWith("sk_test_") || !siteUrl || !/^https:\/\/[a-z0-9.-]+$/.test(siteUrl)) return reply(res, 503, { error: "Le paiement test n’est pas encore configuré. Aucun paiement n’a été effectué." });
  const body = req.body || {}, items = body.items, customer = body.customer;
  if (!Array.isArray(items) || items.length < 1 || items.length > 20 || !customer || typeof customer !== "object") return reply(res, 400, { error: "Panier ou coordonnées invalides." });
  const name = String(customer.name || "").trim().slice(0, 120), email = String(customer.email || "").trim().slice(0, 254), address = String(customer.address || "").trim().slice(0, 200), city = String(customer.city || "").trim().slice(0, 120);
  if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !address || !city) return reply(res, 400, { error: "Veuillez vérifier votre nom, e-mail et adresse de livraison." });
  const quantities = new Map();
  for (const item of items) { const id = Number(item && item.id), quantity = Number(item && item.quantity); if (!PRODUCTS[id] || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) return reply(res, 400, { error: "Un article du panier est invalide." }); quantities.set(id, (quantities.get(id) || 0) + quantity); }
  if ([...quantities.values()].some(quantity => quantity > 10)) return reply(res, 400, { error: "Quantité maximale dépassée." });
  const form = new URLSearchParams(); form.set("mode", "payment"); form.set("customer_email", email);
  form.set("success_url", siteUrl + "/?payment=success&session_id={CHECKOUT_SESSION_ID}"); form.set("cancel_url", siteUrl + "/?payment=cancelled");
  form.set("billing_address_collection", "required"); form.set("shipping_address_collection[allowed_countries][0]", "FR"); form.set("metadata[customer_name]", name); form.set("metadata[customer_city]", city); form.set("metadata[catalog_version]", "13-products-v1");
  let index = 0; for (const entry of quantities.entries()) { const product = PRODUCTS[entry[0]], prefix = "line_items[" + index + "]"; form.set(prefix + "[price_data][currency]", "eur"); form.set(prefix + "[price_data][unit_amount]", String(product.price)); form.set(prefix + "[price_data][product_data][name]", product.name); form.set(prefix + "[quantity]", String(entry[1])); index += 1; }
  try { const response = await fetch("https://api.stripe.com/v1/checkout/sessions", { method: "POST", headers: { Authorization: "Bearer " + secret, "Content-Type": "application/x-www-form-urlencoded" }, body: form.toString() }); const session = await response.json(); if (!response.ok || !session.url) { console.error("Stripe test checkout error:", session.error && session.error.type); return reply(res, 502, { error: "Impossible de créer la session de paiement test. Réessayez plus tard." }); } return reply(res, 200, { url: session.url }); }
  catch (error) { console.error("Checkout session request failed:", error && error.message); return reply(res, 502, { error: "Le service de paiement test est momentanément indisponible." }); }
};
