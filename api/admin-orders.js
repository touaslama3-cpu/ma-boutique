const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_TOKEN = process.env.TAWCO_ADMIN_TOKEN;
const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.ORDER_FROM_EMAIL;

function json(res, status, body) { return res.status(status).json(body); }
function authorized(req) {
  const value = req.headers.authorization || "";
  return ADMIN_TOKEN && value === "Bearer " + ADMIN_TOKEN;
}
async function db(path, options = {}) {
  return fetch(SUPABASE_URL + "/rest/v1/" + path, {
    ...options,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: "Bearer " + SERVICE_KEY,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {})
    }
  });
}
async function sendStatusEmail(order) {
  if (!RESEND_KEY || !FROM_EMAIL || !order.customer_email) return;
  const status = order.fulfillment_status || "mis à jour";
  const tracking = order.tracking_url
    ? '<p>Suivi : <a href="' + order.tracking_url + '">' + (order.tracking_number || "Suivre mon colis") + '</a></p>'
    : order.tracking_number ? "<p>Numéro de suivi : " + order.tracking_number + "</p>" : "";
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + RESEND_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [order.customer_email],
      subject: "Mise à jour de votre commande TAW.co",
      html: "<p>Bonjour " + (order.customer_name || "") + ",</p><p>Le statut de votre commande est maintenant : <strong>" + status + "</strong>.</p>" + tracking + "<p>Merci pour votre confiance — TAW.co</p>"
    })
  });
}
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (!["GET", "PATCH"].includes(req.method)) { res.setHeader("Allow", "GET, PATCH"); return json(res, 405, { error: "Méthode non autorisée." }); }
  if (!authorized(req)) return json(res, 401, { error: "Accès refusé." });
  if (!SUPABASE_URL || !SERVICE_KEY) return json(res, 503, { error: "Base de données non configurée." });
  try {
    if (req.method === "GET") {
      const response = await db("orders?select=*&order=created_at.desc&limit=200");
      const data = await response.json();
      if (!response.ok) return json(res, 502, { error: "Lecture des commandes impossible." });
      return json(res, 200, { orders: data });
    }
    const body = req.body || {};
    if (!body.id || !["à préparer", "en préparation", "expédiée", "livrée", "annulée", "remboursée"].includes(body.fulfillment_status)) return json(res, 400, { error: "Commande ou statut invalide." });
    const patch = { fulfillment_status: body.fulfillment_status };
    for (const key of ["tracking_number", "tracking_url", "carrier", "customer_note"]) {
      if (typeof body[key] === "string") patch[key] = body[key].slice(0, 500);
    }
    const response = await db("orders?id=eq." + encodeURIComponent(body.id) + "&select=*",
      { method: "PATCH", body: JSON.stringify(patch) });
    const rows = await response.json();
    if (!response.ok || !rows.length) return json(res, 404, { error: "Commande introuvable ou mise à jour impossible." });
    await sendStatusEmail(rows[0]).catch(error => console.error("Order email failed:", error.message));
    return json(res, 200, { order: rows[0] });
  } catch (error) {
    console.error("Admin orders error:", error.message);
    return json(res, 500, { error: "Erreur interne." });
  }
};
