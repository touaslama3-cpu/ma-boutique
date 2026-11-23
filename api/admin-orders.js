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
  if (!RESEND_KEY || !FROM_EMAIL || !order.customer_email) return false;
  const status = order.fulfillment_status || "mis à jour";
  const safeTrackingUrl = typeof order.tracking_url === "string" && /^https:\/\//i.test(order.tracking_url)
    ? order.tracking_url : "";
  const tracking = safeTrackingUrl
    ? '<p>Suivi : <a href="' + escapeHtml(safeTrackingUrl) + '">' + escapeHtml(order.tracking_number || "Suivre mon colis") + '</a></p>'
    : order.tracking_number ? "<p>Numéro de suivi : " + escapeHtml(order.tracking_number) + "</p>" : "";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + RESEND_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [order.customer_email],
      subject: "Mise à jour de votre commande TAW.co",
      html: "<p>Bonjour " + escapeHtml(order.customer_name || "client") + ",</p><p>Le statut de votre commande est maintenant : <strong>" + escapeHtml(status) + "</strong>.</p>" + tracking + "<p>Merci pour votre confiance — TAW.co</p>"
    })
  });
  if (!response.ok) throw new Error("Resend returned HTTP " + response.status);
  return true;
}

async function handleAdminResource(req, res, resource) {
  try {
    if (resource === "reviews") {
      if (req.method === "GET") {
        const r = await db("product_reviews?select=id,user_id,product_id,order_id,rating,title,body,status,created_at&order=created_at.desc&limit=300");
        const rows = await r.json();
        if (!r.ok) return json(res, 502, { error: "Lecture des avis impossible." });
        return json(res, 200, { reviews: rows });
      }
      const b = req.body || {};
      if (!/^[0-9a-f-]{36}$/i.test(String(b.id || "")) || !["approved", "rejected"].includes(b.status)) {
        return json(res, 400, { error: "Avis ou statut invalide." });
      }
      const r = await db("product_reviews?id=eq." + encodeURIComponent(b.id), {
        method: "PATCH", body: JSON.stringify({ status: b.status })
      });
      const rows = await r.json();
      if (!r.ok) return json(res, 502, { error: "Mise à jour de l’avis impossible." });
      return json(res, 200, { review: rows[0] || null });
    }

    if (resource === "returns") {
      if (req.method === "GET") {
        const r = await db("return_requests?select=*,orders(customer_email,customer_name,amount_total,currency,fulfillment_status)&order=created_at.desc&limit=200");
        const rows = await r.json();
        if (!r.ok) return json(res, 502, { error: "Lecture des retours impossible." });
        return json(res, 200, { returns: rows });
      }
      const b = req.body || {};
      if (!/^[0-9a-f-]{36}$/i.test(String(b.id || "")) ||
          !["requested", "approved", "rejected", "received", "refunded", "closed"].includes(b.status)) {
        return json(res, 400, { error: "Demande ou statut invalide." });
      }
      const r = await db("return_requests?id=eq." + encodeURIComponent(b.id), {
        method: "PATCH",
        body: JSON.stringify({
          status: b.status,
          admin_note: typeof b.admin_note === "string" ? b.admin_note.slice(0, 1000) : null,
          updated_at: new Date().toISOString()
        })
      });
      const rows = await r.json();
      if (!r.ok) return json(res, 502, { error: "Mise à jour du retour impossible." });
      return json(res, 200, { return_request: rows[0] || null });
    }

    if (resource === "promotions") {
      if (req.method === "GET") {
        const r = await db("promotion_codes?select=id,code,discount_type,discount_value,minimum_amount,max_uses,uses_count,starts_at,expires_at,active&order=created_at.desc");
        const rows = await r.json();
        if (!r.ok) return json(res, 502, { error: "Lecture des codes impossible." });
        return json(res, 200, { codes: rows });
      }
      const b = req.body || {};
      if (req.method === "PATCH") {
        if (!/^[0-9a-f-]{36}$/i.test(String(b.id || "")) || typeof b.active !== "boolean") {
          return json(res, 400, { error: "Identifiant ou statut invalide." });
        }
        const r = await db("promotion_codes?id=eq." + encodeURIComponent(b.id), {
          method: "PATCH", body: JSON.stringify({ active: b.active })
        });
        const rows = await r.json();
        if (!r.ok) return json(res, 502, { error: "Mise à jour impossible." });
        return json(res, 200, { code: rows[0] || null });
      }
      const code = String(b.code || "").trim().toUpperCase();
      const type = String(b.discount_type || "percent");
      const value = Number(b.discount_value);
      const minimum = Number(b.minimum_amount || 0);
      const maxUses = b.max_uses == null || b.max_uses === "" ? null : Number(b.max_uses);
      const parseDate = value => {
        if (!value) return null;
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? new Date(parsed).toISOString() : "invalid";
      };
      const starts = parseDate(b.starts_at), expires = parseDate(b.expires_at);
      if (!/^[A-Z0-9_-]{3,40}$/.test(code) || !["percent", "fixed"].includes(type) ||
          !Number.isInteger(value) || value < 1 || (type === "percent" && value > 90) ||
          (type === "fixed" && value > 100000) || !Number.isInteger(minimum) || minimum < 0 ||
          (maxUses !== null && (!Number.isInteger(maxUses) || maxUses < 1)) ||
          starts === "invalid" || expires === "invalid" ||
          (starts && expires && Date.parse(starts) >= Date.parse(expires))) {
        return json(res, 400, { error: "Paramètres de promotion invalides." });
      }
      const payload = {
        code, discount_type: type, discount_value: value, minimum_amount: minimum,
        max_uses: maxUses, active: true, starts_at: starts, expires_at: expires
      };
      const r = await db("promotion_codes", { method: "POST", body: JSON.stringify(payload) });
      const rows = await r.json();
      if (!r.ok) return json(res, r.status === 409 ? 409 : 502, {
        error: r.status === 409 ? "Ce code existe déjà." : "Création du code impossible."
      });
      return json(res, 201, { code: rows[0] });
    }
    return json(res, 404, { error: "Ressource inconnue." });
  } catch (error) {
    console.error("Admin auxiliary resource error:", resource, error && error.message);
    return json(res, 500, { error: "Erreur interne." });
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  const resource = String(req.query?.resource || "");
  if (resource && !["promotions", "returns", "reviews"].includes(resource)) {
    return json(res, 404, { error: "Ressource inconnue." });
  }
  const allowedMethods = resource === "promotions" ? ["GET", "POST", "PATCH"] : ["GET", "PATCH"];
  if (!allowedMethods.includes(req.method)) {
    res.setHeader("Allow", allowedMethods.join(", "));
    return json(res, 405, { error: "Méthode non autorisée." });
  }
  if (!authorized(req)) return json(res, 401, { error: "Accès refusé." });
  if (!SUPABASE_URL || !SERVICE_KEY) return json(res, 503, { error: "Base de données non configurée." });
  if (resource) return handleAdminResource(req, res, resource);
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
        if (rawUrl.length > 500) return json(res, 400, { error: "Le lien de suivi est trop long (500 caractères maximum)." });
        try {
          const parsedUrl = new URL(rawUrl);
          if (parsedUrl.protocol !== "https:" || !parsedUrl.hostname || parsedUrl.username || parsedUrl.password) return json(res, 400, { error: "Le lien de suivi doit être une adresse HTTPS valide." });
          patch.tracking_url = parsedUrl.toString();
        } catch (_) {
          return json(res, 400, { error: "Lien de suivi invalide." });
        }
      } else {
        patch.tracking_url = "";
      }
    }
    // Re-check the financial state atomically in the UPDATE filter: a refund
    // webhook may arrive after the earlier read but before this PATCH.
    const updateFilter = "orders?id=eq." + encodeURIComponent(body.id) +
      "&payment_status=neq.refunded&fulfillment_status=neq." + encodeURIComponent("remboursée") + "&select=*";
    const response = await db(updateFilter, { method: "PATCH", body: JSON.stringify(patch) });
    const rows = await response.json();
    if (!response.ok) return json(res, 502, { error: "Mise à jour de la commande impossible." });
    if (!rows.length) return json(res, 409, { error: "La commande est introuvable ou vient d’être remboursée. Actualisez la liste." });
    let emailSent = false;
    try { emailSent = await sendStatusEmail(rows[0]); }
    catch (error) { console.error("Order email failed:", error.message); }
    return json(res, 200, { order: rows[0], email_sent: emailSent });
  } catch (error) {
    console.error("Admin orders error:", error.message);
    return json(res, 500, { error: "Erreur interne." });
  }
};
