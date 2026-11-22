const crypto = require("crypto");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_TOKEN = process.env.TAWCO_ADMIN_TOKEN;
const QUOTE_MAX_AGE_MS = 24 * 60 * 60 * 1000;

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
function quoteFilter(value) { return encodeURIComponent(String(value)); }

async function findVerifiedFrenchQuote({ productId, variantKey, cjProductId, variantId }) {
  const filters = [
    "select=id,store_product_id,variant_key,cj_product_id,cj_variant_id,destination_country_code,currency,product_cost,shipping_cost,shipping_method_id,shipping_method_name,delivery_min_days,delivery_max_days,availability,checked_at,raw_quote",
    "store_product_id=eq." + productId,
    "variant_key=eq." + quoteFilter(variantKey),
    "cj_product_id=eq." + quoteFilter(cjProductId),
    "cj_variant_id=eq." + quoteFilter(variantId),
    "destination_country_code=eq.FR",
    "currency=eq.EUR",
    "availability=eq.true",
    "product_cost=not.is.null",
    "shipping_cost=not.is.null",
    "shipping_method_id=not.is.null",
    "order=checked_at.desc",
    "limit=1"
  ].join("&");
  const response = await db("supplier_quote_checks?" + filters);
  const rows = await response.json();
  if (!response.ok) throw new Error("Lecture du devis France impossible.");
  const quote = Array.isArray(rows) ? rows[0] : null;
  if (!quote) return null;
  const checkedAt = Date.parse(quote.checked_at || "");
  if (!Number.isFinite(checkedAt) || Date.now() - checkedAt > QUOTE_MAX_AGE_MS) return null;
  if (!Number.isFinite(Number(quote.shipping_cost)) || Number(quote.shipping_cost) < 0) return null;
  if (!quote.shipping_method_name) return null;
  return quote;
}

function verifiedFields(quote) {
  return {
    shipping_cost_eur: Number(Number(quote.shipping_cost).toFixed(2)),
    shipping_method_id: String(quote.shipping_method_id),
    shipping_method_name: String(quote.shipping_method_name),
    shipping_delivery_min_days: quote.delivery_min_days == null ? null : Number(quote.delivery_min_days),
    shipping_delivery_max_days: quote.delivery_max_days == null ? null : Number(quote.delivery_max_days),
    shipping_checked_at: quote.checked_at,
    product_cost_eur: quote.product_cost == null ? null : Number(Number(quote.product_cost).toFixed(2)),
    verified_at: quote.checked_at
  };
}

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
      const currentResponse = await db("supplier_variant_mappings?id=eq." + encodeURIComponent(id) + "&select=*");
      const currentRows = await currentResponse.json();
      if (!currentResponse.ok) return json(res, 502, { error: "Lecture de la référence impossible." });
      const current = currentRows[0];
      if (!current) return json(res, 404, { error: "Référence introuvable." });

      let update = { is_active: body.is_active, updated_at: new Date().toISOString() };
      if (body.is_active) {
        const quote = await findVerifiedFrenchQuote({
          productId: current.store_product_id,
          variantKey: current.variant_key,
          cjProductId: current.cj_product_id,
          variantId: current.cj_variant_id
        });
        if (!quote) return json(res, 409, { error: "Activation refusée : aucun devis France valide et récent (24 h) pour cette variante." });
        update = { ...update, ...verifiedFields(quote) };
      } else {
        update.verified_at = null;
      }
      const response = await db("supplier_variant_mappings?id=eq." + encodeURIComponent(id), {
        method: "PATCH", body: JSON.stringify(update)
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

    const requestedActive = body.is_active === true;
    let quote = null;
    if (requestedActive) {
      quote = await findVerifiedFrenchQuote({ productId, variantKey, cjProductId, variantId });
      if (!quote) return json(res, 409, { error: "Enregistrement actif refusé : vérifiez d'abord le stock et obtenez un devis France valide de moins de 24 h." });
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
      is_active: requestedActive,
      verified_at: quote ? quote.checked_at : null,
      updated_at: new Date().toISOString(),
      ...(quote ? verifiedFields(quote) : {})
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
