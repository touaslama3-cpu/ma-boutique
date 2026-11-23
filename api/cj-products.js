// TAW.co — catalogue CJdropshipping (lecture seule).
// La clé CJ reste exclusivement côté serveur dans CJ_API_KEY.
let tokenCache = { value: null, expiresAt: 0 };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

async function cjJson(url, options, label) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));
    if (response.ok && payload.code === 200) return payload;
    if (Number(payload.code) === 1600200 && attempt < 3) {
      console.warn("CJ rate limit; retrying", label, attempt + 1);
      await sleep(1500 * (attempt + 1));
      continue;
    }
    console.error("CJ request failed", label, payload.code, payload.message, payload.requestId);
    const error = new Error(label === "authentication" ? "CJ_AUTH_FAILED" : "CJ_PRODUCT_QUERY_FAILED");
    error.code = payload.code;
    throw error;
  }
  throw new Error("CJ_RATE_LIMIT");
}

async function getAccessToken() {
  if (tokenCache.value && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.value;
  const apiKey = process.env.CJ_API_KEY;
  if (!apiKey) throw new Error("CJ_API_KEY_MISSING");
  const payload = await cjJson("https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apiKey })
  }, "authentication");
  if (!payload.data?.accessToken) throw new Error("CJ_AUTH_FAILED");
  const expiry = Date.parse(payload.data.accessTokenExpiryDate || "");
  tokenCache = {
    value: payload.data.accessToken,
    expiresAt: Number.isFinite(expiry) ? expiry : Date.now() + 6 * 60 * 60 * 1000
  };
  return tokenCache.value;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Méthode non autorisée." });
  }

  const keyword = String(req.query?.keyword || "women clothing")
    .trim().slice(0, 80);
  const warehouse = String(req.query?.warehouse || "FR").toUpperCase();
  if (!["FR", "CN", "US", "GB", "DE", "ES", "PL", "ALL"].includes(warehouse)) {
    return res.status(400).json({ error: "Entrepôt invalide." });
  }
  const allowed = /^[\p{L}\p{N} \-']+$/u.test(keyword);
  if (!allowed) return res.status(400).json({ error: "Recherche invalide." });

  try {
    const accessToken = await getAccessToken();
    // CJ applies one global request/second limit, including authentication.
    // Keep a gap between token creation and the catalogue request.
    await sleep(1300);
    const params = new URLSearchParams({
      page: "1",
      size: "24",
      keyWord: keyword,
      ...(warehouse === "ALL" ? {} : { countryCode: warehouse }),
      startWarehouseInventory: "1",
      verifiedWarehouse: "1",
      productType: "4",
      features: "enable_category"
    });
    const payload = await cjJson("https://developers.cjdropshipping.com/api2.0/v1/product/listV2?" + params.toString(), {
      headers: { "CJ-Access-Token": accessToken }
    }, "product");
    if (!payload.data) return res.status(502).json({ error: "Le catalogue fournisseur est temporairement indisponible." });

    const groups = Array.isArray(payload.data.content) ? payload.data.content : [];
    const products = groups.flatMap(group => Array.isArray(group.productList) ? group.productList : [])
      .filter(p => p && p.id && p.bigImage && p.saleStatus === "3")
      .map(p => ({
        supplier: "CJdropshipping",
        supplierProductId: String(p.id),
        sku: String(p.sku || ""),
        name: String(p.nameEn || "Article").slice(0, 180),
        image: String(p.bigImage),
        category: String(p.threeCategoryName || p.twoCategoryName || p.oneCategoryName || "Mode").slice(0, 100),
        stockAvailable: Number(p.totalVerifiedInventory || p.warehouseInventoryNum || 0),
        warehouseFilter: warehouse,
        freeShippingFlag: Number(p.addMarkStatus) === 1
      }));
    return res.status(200).json({
      supplier: "CJdropshipping",
      keyword,
      warehouse,
      count: products.length,
      page: 1,
      products
    });
  } catch (error) {
    if (error.message === "CJ_API_KEY_MISSING") {
      return res.status(503).json({ error: "Connexion CJ non configurée sur cet environnement." });
    }
    if (error.message === "CJ_AUTH_FAILED") {
      return res.status(502).json({ error: "CJ refuse l'authentification. Vérifie la clé API dans Vercel." });
    }
    console.error("TAW CJ endpoint error", error);
    return res.status(502).json({ error: "Impossible de contacter le fournisseur pour le moment." });
  }
};
