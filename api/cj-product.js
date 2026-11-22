const { cj } = require("./_cj");

function list(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.list)) return value.list;
  if (Array.isArray(value?.variants)) return value.variants;
  return [];
}
function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Méthode non autorisée." });
  }
  const pid = String(req.query?.pid || "").trim();
  const countryCode = String(req.query?.countryCode || "").trim().toUpperCase();
  if (!/^[A-Za-z0-9-]{8,80}$/.test(pid)) {
    return res.status(400).json({ error: "Identifiant produit CJ invalide." });
  }
  if (countryCode && !/^[A-Z]{2}$/.test(countryCode)) {
    return res.status(400).json({ error: "Code pays invalide." });
  }

  try {
    const query = new URLSearchParams({ pid });
    if (countryCode) query.set("countryCode", countryCode);
    const [detail, variantData] = await Promise.all([
      cj("/product/query?" + query.toString()),
      cj("/product/variant/query?" + query.toString())
    ]);
    const variants = list(variantData);
    const detailedVariants = list(detail?.variants);
    const detailById = new Map(detailedVariants.map(item => [String(item.vid || ""), item]));
    const merged = variants.length ? variants : detailedVariants;
    const productVariants = merged.map(item => {
      const extra = detailById.get(String(item.vid || "")) || {};
      const inventories = Array.isArray(item.inventories) ? item.inventories :
        (Array.isArray(extra.inventories) ? extra.inventories : []);
      const key = String(item.variantKey || extra.variantKey || "");
      return {
        variantId: String(item.vid || item.variantId || ""),
        productId: String(item.pid || pid),
        sku: String(item.variantSku || item.sku || extra.variantSku || ""),
        name: String(item.variantNameEn || item.variantName || extra.variantNameEn || ""),
        options: key ? key.split("-").map(part => part.trim()).filter(Boolean) : [],
        optionKey: key,
        image: String(item.variantImage || extra.variantImage || detail.bigImage || ""),
        priceUsd: number(item.variantSellPrice ?? extra.variantSellPrice),
        weightGrams: number(item.variantWeight ?? extra.variantWeight),
        stockByCountry: inventories.map(stock => ({
          country: String(stock.countryCode || ""),
          available: number(stock.totalInventory) ?? 0,
          verifiedWarehouse: number(stock.verifiedWarehouse)
        }))
      };
    }).filter(item => item.variantId);

    return res.status(200).json({
      supplier: "CJdropshipping",
      productId: pid,
      product: {
        name: String(detail.productNameEn || detail.nameEn || ""),
        description: String(detail.description || ""),
        images: Array.isArray(detail.productImageSet) ? detail.productImageSet : [],
        mainImage: String(detail.bigImage || ""),
        sku: String(detail.productSku || ""),
        category: String(detail.categoryName || ""),
        currency: "USD",
        variants: productVariants
      }
    });
  } catch (error) {
    console.error("CJ product lookup failed", error.code, error.requestId);
    const status = error.message === "CJ_API_KEY_MISSING" ? 503 : 502;
    return res.status(status).json({
      error: status === 503 ? "Connexion CJ non configurée." : "CJ n'a pas pu fournir les détails et variantes de cet article."
    });
  }
};
