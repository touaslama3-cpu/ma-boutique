const { cj } = require("./_cj");
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Méthode non autorisée." });
  }
  const pid = String(req.query?.pid || "").trim();
  if (!/^[A-Za-z0-9-]{8,80}$/.test(pid)) {
    return res.status(400).json({ error: "Identifiant produit CJ invalide." });
  }

  try {
    // CJ impose une limite globale d'environ une requête par seconde.
    // Les appels doivent donc être séquentiels, jamais lancés en parallèle.
    const detailResponse = await cj("/product/productDetail/query", "POST", { id: pid });
    await sleep(1300);
    const variantResponse = await cj("/product/variant/query?pid=" + encodeURIComponent(pid));
    await sleep(1300);
    const inventoryResponse = await cj("/product/stock/getInventoryByPid?pid=" + encodeURIComponent(pid));

    const d = detailResponse?.product || detailResponse || {};
    const variants = Array.isArray(variantResponse) ? variantResponse
      : Array.isArray(variantResponse?.list) ? variantResponse.list
      : Array.isArray(d.variants) ? d.variants : [];
    const inventory = inventoryResponse || {};
    const byVid = new Map(
      (Array.isArray(inventory.variantInventories) ? inventory.variantInventories : [])
        .map(v => [String(v.vid), Array.isArray(v.inventory) ? v.inventory : []])
    );
    const warehouses = (Array.isArray(inventory.inventories) ? inventory.inventories : []).map(i => ({
      country: String(i.countryCode || ""),
      name: String(i.countryNameEn || i.areaEn || ""),
      available: Number(i.totalInventoryNum || 0),
      cjStock: Number(i.cjInventoryNum || 0),
      factoryStock: Number(i.factoryInventoryNum || 0)
    }));

    return res.status(200).json({
      supplier: "CJdropshipping",
      productId: pid,
      product: {
        name: d.nameEn || d.nameen || d.productNameEn || "",
        description: d.description || "",
        images: Array.isArray(d.productImageSet) ? d.productImageSet
          : Array.isArray(d.img) ? d.img : [],
        mainImage: d.bigImage || d.bigImg || d.bigimg || "",
        sku: d.productSku || d.productsku || d.sku || "",
        category: d.categoryName || "",
        currency: "USD",
        warehouses,
        variants: variants.map(x => {
          const vid = String(x.vid || x.variantId || x.id || "");
          const inv = byVid.get(vid) || [];
          return {
            variantId: vid,
            sku: x.variantSku || x.variantSku || x.sku || "",
            name: x.variantNameEn || x.variantName || x.nameEn || "",
            options: String(x.variantKey || x.variantKeyEn || "").split("-").filter(Boolean),
            image: x.variantImage || x.img || "",
            priceUsd: Number(x.variantSellPrice ?? x.sellPrice ?? 0),
            weightGrams: Number(x.variantWeight || 0),
            stockByCountry: inv.map(i => ({
              country: String(i.countryCode || ""),
              available: Number(i.totalInventory ?? i.totalInventoryNum ?? 0),
              cjStock: Number(i.cjInventory ?? i.cjInventoryNum ?? 0),
              factoryStock: Number(i.factoryInventory ?? i.factoryInventoryNum ?? 0),
              verifiedWarehouse: Number(i.verifiedWarehouse || 0),
              subWarehouses: Array.isArray(i.stock) ? i.stock.map(s => ({
                stockId: s.stockId,
                available: Number(s.inventory || 0),
                factoryStock: Number(s.factoryInventory || 0)
              })) : []
            }))
          };
        })
      }
    });
  } catch (e) {
    console.error("CJ detail/inventory error", e.code, e.requestId, e.message);
    return res.status(502).json({
      error: e.code === 1600200
        ? "CJ limite temporairement les requêtes. Réessaie dans quelques secondes."
        : "CJ n'a pas pu fournir les détails, variantes et stocks de cet article."
    });
  }
};
