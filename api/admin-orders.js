const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_TOKEN = process.env.TAWCO_ADMIN_TOKEN;
const RESEND_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.ORDER_FROM_EMAIL;
const crypto = require("crypto");

function escapeHtml(value) {
  return String(value || "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
}
function json(res, status, body) { return res.status(status).json(body); }
function authorized(req) {
  const value = req.headers.authorization || "";
  if (!ADMIN_TOKEN) return false;
  const expected = Buffer.from("Bearer " + ADMIN_TOKEN);
  const actual = Buffer.from(value);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
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
  const safeTrackingUrl = typeof order.tracking_url === "string" && /^https:\/\//i.test(order.tracking_url)
    ? order.tracking_url : "";
  const tracking = safeTrackingUrl
    ? '<p>Suivi : <a href="' + escapeHtml(safeTrackingUrl) + '">' + escapeHtml(order.tracking_number || "Suivre mon colis") + '</a></p>'
    : order.tracking_number ? "<p>Numéro de suivi : " + escapeHtml(order.tracking_number) + "</p>" : "";
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + RESEND_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [order.customer_email],
      subject: "Mise à jour de votre commande TAW.co",
      html: "<p>Bonjour " + escapeHtml(order.customer_name || "client") + ",</p><p>Le statut de votre commande est maintenant : <strong>" + escapeHtml(status) + "</strong>.</p>" + tracking + "<p>Merci pour votre confiance — TAW.co</p>"
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
    if (!body.id || !["à préparer", "en préparation", "expédiée", "livrée", "annulée"].includes(body.fulfillment_status)) return json(res, 400, { error: "Commande ou statut invalide." });

    // A refunded order is financially closed: never let fulfillment edits
    // overwrite its refund status or send a misleading shipment update.
    const currentResponse = await db("orders?id=eq." + encodeURIComponent(body.id) + "&select=id,payment_status,fulfillment_status");
    const currentRows = await currentResponse.json();
    if (!currentResponse.ok) return json(res, 502, { error: "Vérification de la commande impossible." });
    if (!currentRows.length) return json(res, 404, { error: "Commande introuvable." });
    if (currentRows[0].payment_status === "refunded" || currentRows[0].fulfillment_status === "remboursée") {
      return json(res, 409, { error: "Cette commande est remboursée et ne peut plus être modifiée depuis le suivi des expéditions." });
    }

    const patch = { fulfillment_status: body.fulfillment_status, updated_at: new Date().toISOString() };
    for (const key of ["tracking_number", "carrier", "customer_note"]) {
      if (typeof body[key] === "string") patch[key] = body[key].trim().slice(0, 200);
    }
    if (typeof body.tracking_url === "string") {
      const rawUrl = body.tracking_url.trim();
      if (rawUrl) {
        try {
          const parsedUrl = new URL(rawUrl);
          if (parsedUrl.protocol !== "https:") return json(res, 400, { error: "Le lien de suivi doit utiliser HTTPS." });
          patch.tracking_url = parsedUrl.toString().slice(0, 500);
        } catch (_) {
          return json(res, 400, { error: "Lien de suivi invalide." });
        }
      } else {
        patch.tracking_url = "";
      }
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
