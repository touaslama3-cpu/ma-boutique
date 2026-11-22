const { cj } = require("./_cj");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Méthode non autorisée." });
  }

  const body = req.body || {};
  const origin = String(body.origin || "CN").trim().toUpperCase();
  const zip = String(body.zip || "").trim();
  const products = body.products;
  const allowedOrigins = new Set(["CN", "FR", "US", "GB", "DE", "ES", "PL", "IT", "NL", "BE"]);
  if (!allowedOrigins.has(origin) || !Array.isArray(products) || !products.length || products.length > 10 ||
      products.some(item => !item || !/^[A-Za-z0-9-]{8,80}$/.test(String(item.vid || "")) ||
        !Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1 || Number(item.quantity) > 20)) {
    return res.status(400).json({ error: "Variantes, quantités ou entrepôt invalides." });
  }
  if (zip.length > 20 || (zip && !/^[A-Za-z0-9 -]+$/.test(zip))) {
    return res.status(400).json({ error: "Code postal invalide." });
  }

  try {
    const data = await cj("/logistic/freightCalculate", "POST", {
      startCountryCode: origin,
      endCountryCode: "FR",
      ...(zip ? { zip } : {}),
      products: products.map(item => ({ vid: String(item.vid), quantity: Number(item.quantity) }))
    });
    const options = Array.isArray(data) ? data : [];
    return res.status(200).json({
      destination: "FR",
      origin,
      currency: "USD",
      shipping: options.map(option => {
        const shipping = Number(option.totalPostageFee ?? option.logisticPrice ?? 0);
        const taxes = Number(option.taxesFee || 0);
        const customs = Number(option.clearanceOperationFee || 0);
        return {
          carrier: String(option.logisticName || ""),
          deliveryWindowDays: String(option.logisticAging || ""),
          shippingUsd: Number.isFinite(shipping) ? shipping : 0,
          taxesUsd: Number.isFinite(taxes) ? taxes : 0,
          customsFeeUsd: Number.isFinite(customs) ? customs : 0,
          totalUsd: Number((shipping + taxes + customs).toFixed(2))
        };
      }).filter(option => option.carrier)
    });
  } catch (error) {
    console.error("CJ freight calculation failed", error.code, error.requestId);
    return res.status(error.message === "CJ_API_KEY_MISSING" ? 503 : 502).json({
      error: error.message === "CJ_API_KEY_MISSING"
        ? "Connexion CJ non configurée."
        : "CJ n'a pas pu calculer les frais pour ces variantes."
    });
  }
};
