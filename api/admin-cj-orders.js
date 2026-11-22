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
function text(value, max = 200) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (!["GET", "POST"].includes(req.method)) {
    res.setHeader("Allow", "GET, POST");
    return json(res, 405, { error: "Méthode non autorisée." });
  }
  if (!authorized(req)) return json(res, 401, { error: "Accès refusé." });
  if (!SUPABASE_URL || !SERVICE_KEY) return json(res, 503, { error: "Base de données non configurée." });

  try {
    if (req.method === "GET") {
      const response = await db("orders?select=id,created_at,customer_name,customer_email,items,amount_total,payment_status,fulfillment_status,cj_order_id,cj_order_status,cj_submission_status,cj_last_error&order=created_at.desc&limit=100");
      const rows = await response.json();
      if (!response.ok) return json(res, 502, { error: "Lecture des commandes impossible." });
      return json(res, 200, { orders: rows });
    }

    const body = req.body || {};
    const orderId = String(body.order_id || "");
    if (!/^[0-9a-f-]{36}$/i.test(orderId)) return json(res, 400, { error: "Identifiant de commande invalide." });
    if (body.confirm !== true) return json(res, 400, { error: "Confirmation explicite requise avant de créer une commande CJ." });

    const orderResponse = await db("orders?id=eq." + encodeURIComponent(orderId) + "&select=*");
    const orderRows = await orderResponse.json();
    if (!orderResponse.ok) return json(res, 502, { error: "Lecture de la commande impossible." });
    const order = orderRows[0];
    if (!order) return json(res, 404, { error: "Commande introuvable." });
    if (order.payment_status !== "paid" || order.fulfillment_status === "remboursée") {
      return json(res, 409, { error: "Seules les commandes payées et non remboursées peuvent être transmises à CJ." });
    }
    if (order.cj_order_id) return json(res, 200, { already_submitted: true, cj_order_id: order.cj_order_id, cj_order_status: order.cj_order_status });
    if (!Array.isArray(order.items) || !order.items.length) return json(res, 400, { error: "La commande ne contient aucun article." });
    if (order.items.some(item => !item.variant_key)) return json(res, 409, { error: "Les variantes client ne sont pas encore enregistrées sur cette commande. Transmission CJ bloquée pour éviter une mauvaise taille ou couleur." });

    const productIds = [...new Set(order.items.map(item => Number(item.id)).filter(Number.isInteger))];
    if (!productIds.length) return json(res, 400, { error: "Articles de commande non reconnus." });
    const mappingResponse = await db("supplier_variant_mappings?select=*&is_active=eq.true&store_product_id=in.(" + productIds.join(",") + ")");
    const mappings = await mappingResponse.json();
    if (!mappingResponse.ok) return json(res, 502, { error: "Lecture des références CJ impossible." });

    const selected = [];
    const missing = [];
    for (const item of order.items) {
      const productId = Number(item.id);
      const key = text(item.variant_key, 100).toLowerCase();
      const matches = mappings.filter(mapping => Number(mapping.store_product_id) === productId &&
        String(mapping.variant_key).toLowerCase() === key);
      if (!key || matches.length !== 1) {
        missing.push({ product_id: productId, variant_key: key });
        continue;
      }
      selected.push({ mapping: matches[0], quantity: Number(item.quantity) });
    }
    if (missing.length) {
      await db("orders?id=eq." + encodeURIComponent(orderId), {
        method: "PATCH",
        body: JSON.stringify({ cj_submission_status: "awaiting_mapping", cj_last_error: "Référence fournisseur manquante ou ambiguë.", updated_at: new Date().toISOString() })
      });
      return json(res, 409, { error: "Certaines variantes n'ont pas encore de correspondance CJ.", missing });
    }
    if (selected.some(item => !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20)) {
      return json(res, 400, { error: "Quantités invalides." });
    }
    const origins = new Set(selected.map(item => item.mapping.origin_country_code));
    const logistics = new Set(selected.map(item => item.mapping.logistic_name));
    if (origins.size !== 1 || logistics.size !== 1) {
      return json(res, 409, { error: "Tous les articles d'une même commande doivent partager le même pays d'expédition et le même transporteur CJ." });
    }

    const lockResponse = await db("orders?id=eq." + encodeURIComponent(orderId) +
      "&cj_order_id=is.null&payment_status=eq.paid&fulfillment_status=neq." + encodeURIComponent("remboursée") +
      "&or=(cj_submission_status.is.null,cj_submission_status.eq.awaiting_mapping,cj_submission_status.eq.failed)", {
        method: "PATCH",
        body: JSON.stringify({ cj_submission_status: "creating", cj_last_error: null, updated_at: new Date().toISOString() })
      });
    const locked = await lockResponse.json();
    if (!lockResponse.ok) return json(res, 502, { error: "Verrouillage de la commande impossible." });
    if (!locked.length) return json(res, 409, { error: "Cette commande est déjà en cours de transmission ou a déjà été traitée. Vérifiez son état avant toute nouvelle tentative." });

    const address = order.shipping_address || {};
    const country = text(address.country, 2).toUpperCase();
    if (country !== "FR" || !text(address.line1) || !text(address.city) || !text(address.postal_code)) {
      await db("orders?id=eq." + encodeURIComponent(orderId), {
        method: "PATCH",
        body: JSON.stringify({ cj_submission_status: "awaiting_address", cj_last_error: "Adresse française incomplète.", updated_at: new Date().toISOString() })
      });
      return json(res, 400, { error: "Adresse française incomplète : rue, ville et code postal obligatoires." });
    }

    const origin = [...origins][0];
    const logisticName = [...logistics][0];
    const fullAddress = [text(address.line1), text(address.line2)].filter(Boolean).join(", ").slice(0, 200);
    const payload = {
      orderNumber: ("TAW-" + order.id).slice(0, 50),
      shippingZip: text(address.postal_code, 20),
      shippingCountryCode: "FR",
      shippingCountry: "France",
      shippingProvince: text(address.state || address.city, 50),
      shippingCity: text(address.city, 50),
      shippingPhone: text(order.customer_phone, 20),
      shippingCustomerName: text(order.customer_name, 50),
      shippingAddress: fullAddress,
      email: text(order.customer_email, 50),
      remark: "Commande TAW.co " + order.id,
      logisticName,
      fromCountryCode: origin,
      shopLogisticsType: 2,
      payType: 3,
      platform: "Api",
      products: selected.map(item => ({ vid: item.mapping.cj_variant_id, quantity: item.quantity }))
    };

    let result;
    try {
      result = await cj("/shopping/order/createOrderV2", "POST", payload);
    } catch (error) {
      console.error("CJ order creation failed", error.code, error.requestId);
      await db("orders?id=eq." + encodeURIComponent(orderId), {
        method: "PATCH",
        body: JSON.stringify({
          cj_submission_status: "needs_review",
          cj_last_error: "CJ n'a pas confirmé la création. Vérifier dans CJ avec la référence TAW-" + order.id + " avant toute nouvelle tentative.",
          updated_at: new Date().toISOString()
        })
      });
      return json(res, 502, { error: "CJ n'a pas confirmé la création. Vérifiez la commande dans votre compte CJ avant de réessayer." });
    }

    const cjOrderId = text(result?.orderId || result?.id || result?.cjOrderId, 100);
    const cjOrderStatus = text(result?.orderStatus || result?.status || "CREATED", 80);
    if (!cjOrderId) {
      await db("orders?id=eq." + encodeURIComponent(orderId), {
        method: "PATCH",
        body: JSON.stringify({ cj_submission_status: "needs_review", cj_last_error: "Réponse CJ reçue sans identifiant de commande.", updated_at: new Date().toISOString() })
      });
      return json(res, 502, { error: "Réponse CJ incomplète. Vérifiez la commande dans votre compte CJ." });
    }

    const saveResponse = await db("orders?id=eq." + encodeURIComponent(orderId), {
      method: "PATCH",
      body: JSON.stringify({
        cj_order_id: cjOrderId,
        cj_order_status: cjOrderStatus,
        cj_submission_status: "created_unpaid",
        cj_submitted_at: new Date().toISOString(),
        cj_logistic_name: logisticName,
        cj_origin_country_code: origin,
        cj_last_error: null,
        fulfillment_status: "en préparation",
        updated_at: new Date().toISOString()
      })
    });
    const saved = await saveResponse.json();
    if (!saveResponse.ok) {
      console.error("CJ order created but Supabase persistence failed", order.id, cjOrderId);
      return json(res, 502, { error: "La commande CJ existe, mais son identifiant n'a pas pu être enregistré. Ne la recréez pas; vérifiez CJ et Supabase.", cj_order_id: cjOrderId });
    }
    return json(res, 201, {
      created: true,
      cj_order_id: cjOrderId,
      cj_order_status: cjOrderStatus,
      supplier_payment: "not_paid",
      note: "Commande créée chez CJ sans débit du solde fournisseur. La confirmation et le paiement restent à effectuer dans CJ."
    });
  } catch (error) {
    console.error("Admin CJ order handler failed", error.message);
    return json(res, 500, { error: "Erreur interne." });
  }
};
