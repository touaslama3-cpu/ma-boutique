const crypto = require("crypto");
const { cj } = require("./_cj");
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

    if (body.action === "quote") {
      const productId = Number(body.store_product_id);
      const variantKey = String(body.variant_key || "").trim().toLowerCase();
      const cjProductId = String(body.cj_product_id || "").trim();
      const variantId = String(body.cj_variant_id || "").trim();
      const origin = String(body.origin_country_code || "CN").trim().toUpperCase();
      const zip = String(body.destination_zip || "").trim();
      const quantity = Number(body.quantity || 1);
      const productCost = Number(body.unit_cost_usd || 0);
      if (!Number.isInteger(productId) || productId < 101 || productId > 115 ||
          !variantKey || variantKey.length > 100 ||
          !/^[A-Za-z0-9-]{8,80}$/.test(cjProductId) ||
          !/^[A-Za-z0-9-]{8,80}$/.test(variantId) ||
          !/^[A-Z]{2}$/.test(origin) ||
          (zip && !/^\d{5}$/.test(zip)) ||
          !Number.isInteger(quantity) || quantity < 1 || quantity > 20 ||
          !Number.isFinite(productCost) || productCost < 0 || productCost > 10000) {
        return json(res, 400, { error: "Données de variante ou de livraison invalides. Le code postal français doit contenir 5 chiffres." });
      }
      try {
        const quoteData = await cj("/logistic/freightCalculate", "POST", {
          startCountryCode: origin,
          endCountryCode: "FR",
          ...(zip ? { zip } : {}),
          products: [{ vid: variantId, quantity }]
        });
        const options = Array.isArray(quoteData) ? quoteData : [];
        const normalized = options.map(option => {
          const rawShipping = option.totalPostageFee ?? option.logisticPrice;
          const shipping = Number(rawShipping);
          if (rawShipping == null || !Number.isFinite(shipping) || shipping < 0) return null;
          const aging = String(option.logisticAging || "");
          const days = aging.match(/(\d{1,3})\s*(?:-|~|à)\s*(\d{1,3})/i);
          return {
            carrier: String(option.logisticName || "Transporteur CJ").slice(0, 160),
            methodId: String(option.logisticId || option.logisticCode || "").slice(0, 120),
            deliveryWindowDays: aging,
            deliveryMinDays: days ? Number(days[1]) : null,
            deliveryMaxDays: days ? Number(days[2]) : null,
            shippingUsd: Number(shipping.toFixed(2)),
            taxesUsd: Number(option.taxesFee || 0),
            customsFeeUsd: Number(option.clearanceOperationFee || 0),
            raw: option
          };
        }).filter(Boolean);
        if (!normalized.length) {
          return json(res, 200, { quotes: [], message: "CJ n'a renvoyé aucun tarif de transport exploitable pour cette variante." });
        }
        const checkedAt = new Date().toISOString();
        const records = normalized.map(option => ({
          store_product_id: productId,
          variant_key: variantKey,
          cj_product_id: cjProductId,
          cj_variant_id: variantId,
          destination_country_code: "FR",
          currency: "USD",
          product_cost: Number(productCost.toFixed(2)),
          shipping_cost: option.shippingUsd,
          shipping_method_id: option.methodId,
          shipping_method_name: option.carrier,
          delivery_min_days: option.deliveryMinDays,
          delivery_max_days: option.deliveryMaxDays,
          availability: true,
          raw_quote: option.raw,
          checked_at: checkedAt
        }));
        const saved = await db("supplier_quote_checks", {
          method: "POST",
          body: JSON.stringify(records),
          headers: { Prefer: "return=representation" }
        });
        const savedRows = await saved.json();
        if (!saved.ok) {
          console.error("CJ quote history insert failed", saved.status, savedRows);
          return json(res, 502, { error: "Devis reçu, mais son enregistrement dans l'historique Supabase a échoué." });
        }
        return json(res, 200, {
          checked_at: checkedAt,
          quotes: normalized.map(({ raw, ...option }) => option)
        });
      } catch (error) {
        console.error("CJ admin freight quote error", error.code, error.requestId);
        return json(res, 502, { error: "CJ n'a pas pu calculer les frais de livraison pour cette variante." });
      }
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
      shipping_method_id: typeof body.shipping_method_id === "string" && body.shipping_method_id.trim() ? body.shipping_method_id.trim().slice(0, 120) : null,
      shipping_method_name: typeof body.shipping_method_name === "string" && body.shipping_method_name.trim() ? body.shipping_method_name.trim().slice(0, 160) : null,
      shipping_delivery_min_days: body.shipping_delivery_min_days != null && Number.isInteger(Number(body.shipping_delivery_min_days)) && Number(body.shipping_delivery_min_days) >= 0 ? Number(body.shipping_delivery_min_days) : null,
      shipping_delivery_max_days: body.shipping_delivery_max_days != null && Number.isInteger(Number(body.shipping_delivery_max_days)) && Number(body.shipping_delivery_max_days) >= 0 ? Number(body.shipping_delivery_max_days) : null,
      shipping_checked_at: typeof body.shipping_checked_at === "string" && Number.isFinite(Date.parse(body.shipping_checked_at)) ? new Date(body.shipping_checked_at).toISOString() : null,
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
