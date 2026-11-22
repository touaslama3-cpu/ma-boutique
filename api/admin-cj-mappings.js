const crypto = require("crypto");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_TOKEN = process.env.TAWCO_ADMIN_TOKEN;

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
function json(res, status, body) { return res.status(status).json(body); }

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (!["GET", "POST", "PATCH"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST, PATCH");
    return json(res, 405, { error: "Méthode non autorisée." });
  }
  if (!authorized(req)) return json(res, 401, { error: "Accès refusé." });
  if (!SUPABASE_URL || !SERVICE_KEY) return json(res, 503, { error: "Base de données non configurée." });

  try {
    if (req.method === "GET") {
      const response = await db("supplier_variant_mappings?select=*&order=store_product_id.asc,variant_key.asc");
      const rows = await response.json();
      if (!response.ok) return json(res, 502, { error: "Lecture des références fournisseur impossible." });
      return json(res, 200, { mappings: rows });
    }

    const body = req.body || {};
    if (req.method === "PATCH") {
      const id = String(body.id || "");
      if (!/^[0-9a-f-]{36}$/i.test(id) || typeof body.is_active !== "boolean") {
        return json(res, 400, { error: "Identifiant ou statut invalide." });
      }
      const response = await db("supplier_variant_mappings?id=eq." + encodeURIComponent(id), {
        method: "PATCH", body: JSON.stringify({ is_active: body.is_active, updated_at: new Date().toISOString() })
      });
      const rows = await response.json();
      if (!response.ok) return json(res, 502, { error: "Mise à jour impossible." });
      return json(res, 200, { mapping: rows[0] || null });
    }

    const productId = Number(body.store_product_id);
    const variantKey = String(body.variant_key || "default").trim().toLowerCase();
    const cjProductId = String(body.cj_product_id || "").trim();
    const variantId = String(body.cj_variant_id || "").trim();
    const variantSku = String(body.cj_variant_sku || "").trim();
    const origin = String(body.origin_country_code || "CN").trim().toUpperCase();
    const logistic = String(body.logistic_name || "").trim();
    const cost = Number(body.unit_cost_usd);
    if (!Number.isInteger(productId) || productId < 101 || productId > 115 ||
        !variantKey || variantKey.length > 100 ||
        !/^[A-Za-z0-9-]{8,80}$/.test(cjProductId) ||
        !/^[A-Za-z0-9-]{8,80}$/.test(variantId) ||
        variantSku.length > 200 ||
        !/^[A-Z]{2}$/.test(origin) || !logistic || logistic.length > 100 ||
        !Number.isFinite(cost) || cost < 0 || cost > 10000) {
      return json(res, 400, { error: "Référence TAW ou informations CJ invalides." });
    }
    const payload = {
      store_product_id: productId,
      variant_key: variantKey,
      cj_product_id: cjProductId,
      cj_variant_id: variantId,
      cj_variant_sku: variantSku || null,
      origin_country_code: origin,
      logistic_name: logistic,
      unit_cost_usd: Number(cost.toFixed(2)),
      is_active: body.is_active !== false,
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const response = await db("supplier_variant_mappings?on_conflict=store_product_id,variant_key", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(payload)
    });
    const rows = await response.json();
    if (!response.ok) return json(res, 502, { error: "Enregistrement de la référence fournisseur impossible." });
    return json(res, 200, { mapping: rows[0] || null });
  } catch (error) {
    console.error("CJ mapping admin error", error.message);
    return json(res, 500, { error: "Erreur interne." });
  }
};
