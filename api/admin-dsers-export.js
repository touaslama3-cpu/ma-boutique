const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_TOKEN = process.env.TAWCO_ADMIN_TOKEN;
const crypto = require("crypto");

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
function csv(value) {
  const text = String(value == null ? "" : value);
  return '"' + text.replace(/"/g, '""') + '"';
}
const COUNTRIES = { FR: "France" };
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return json(res, 405, { error: "Méthode non autorisée." }); }
  if (!authorized(req)) return json(res, 401, { error: "Accès refusé." });
  if (!SUPABASE_URL || !SERVICE_KEY) return json(res, 503, { error: "Base de données non configurée." });
  if (req.body && req.body.action === "confirm") {
    const ids = req.body.order_ids;
    if (!Array.isArray(ids) || !ids.length || ids.length > 200 || ids.some(id => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))) {
      return json(res, 400, { error: "Liste de commandes invalide." });
    }
    try {
      const filter = "orders?id=in.(" + ids.map(encodeURIComponent).join(",") + ")&dsers_exported_at=is.null&payment_status=eq.paid&refunded_amount=eq.0";
      const marked = await db(filter, { method: "PATCH", body: JSON.stringify({ dsers_exported_at: new Date().toISOString() }) });
      const rows = await marked.json();
      if (!marked.ok || !Array.isArray(rows) || rows.length !== ids.length) return json(res, 409, { error: "Certaines commandes n’ont pas pu être confirmées comme exportées. Actualisez la liste." });
      return json(res, 200, { marked: rows.length });
    } catch (error) {
      console.error("DSers export confirmation error:", error && error.message);
      return json(res, 500, { error: "Confirmation d’export impossible." });
    }
  }
  try {
    const response = await db("orders?select=id,created_at,customer_phone,shipping_address,items,payment_status,fulfillment_status,dsers_exported_at&payment_status=eq.paid&refunded_amount=eq.0&dsers_exported_at=is.null&fulfillment_status=neq.remboursée&order=created_at.asc&limit=200");
    const orders = await response.json();
    if (!response.ok || !Array.isArray(orders)) return json(res, 502, { error: "Lecture des commandes à exporter impossible." });
    if (!orders.length) return json(res, 200, { exported_orders: 0, csv: null, message: "Aucune commande payée en attente d’export DSers." });

    const rows = [["Date", "Country", "Product ID", "SKU", "Product Count", "Mobile No", "Address"]];
    for (const order of orders) {
      const a = order.shipping_address || {};
      const phone = typeof order.customer_phone === "string" ? order.customer_phone.trim() : "";
      const country = COUNTRIES[String(a.country || "").toUpperCase()];
      const address = [a.line1, a.line2, a.postal_code, a.city, a.state].filter(v => typeof v === "string" && v.trim()).join(", ");
      if (!phone || !country || !address || !Array.isArray(order.items) || !order.items.length) {
        return json(res, 409, { error: "Une commande est incomplète (téléphone, adresse ou articles). Aucune commande n’a été exportée.", order_id: order.id });
      }
      for (const item of order.items) {
        const id = Number(item.id), quantity = Number(item.quantity);
        if (!Number.isInteger(id) || id < 1 || id > 13 || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
          return json(res, 409, { error: "Une commande contient un article non reconnu. Aucune commande n’a été exportée.", order_id: order.id });
        }
        rows.push([
          new Date(order.created_at).toISOString().slice(0, 10),
          country,
          String(id),
          "TAW-" + String(id).padStart(3, "0"),
          String(quantity),
          phone,
          address
        ]);
      }
    }

    const content = "\uFEFF" + rows.map(row => row.map(csv).join(",")).join("\r\n");
    res.setHeader("X-TAW-Export-Order-Ids", orders.map(order => order.id).join(","));
    res.setHeader("Access-Control-Expose-Headers", "X-TAW-Export-Order-Ids");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="TAWco_commandes_DSerS.csv"');
    return res.status(200).send(content);
  } catch (error) {
    console.error("DSers export error:", error && error.message);
    return json(res, 500, { error: "Erreur interne pendant la préparation de l’export." });
  }
};
