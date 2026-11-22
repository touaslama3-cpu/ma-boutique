const { cj } = require("./_cj");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
async function db(path) {
  return fetch(SUPABASE_URL + "/rest/v1/" + path, {
    headers: { apikey: SERVICE_KEY, Authorization: "Bearer " + SERVICE_KEY, "Content-Type": "application/json" }
  });
}
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=300");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "Méthode non autorisée." }); }
  if (!SUPABASE_URL || !SERVICE_KEY) return res.status(503).json({ error: "Catalogue temporairement indisponible." });
  try {
    const response = await db("supplier_variant_mappings?select=store_product_id,variant_key,cj_product_id,cj_variant_id,cj_variant_sku,shipping_method_name,shipping_delivery_min_days,shipping_delivery_max_days,shipping_checked_at&is_active=eq.true&order=store_product_id.asc,variant_key.asc");
    const mappings = await response.json();
    if (!response.ok) return res.status(502).json({ error: "Lecture du catalogue impossible." });
    const groups = new Map();
    for (const m of mappings) {
      const key = Number(m.store_product_id);
      if (!groups.has(key)) groups.set(key, { storeProductId: key, cjProductId: String(m.cj_product_id), variants: [] });
      if (groups.get(key).cjProductId !== String(m.cj_product_id)) continue;
      groups.get(key).variants.push({
        variantKey: String(m.variant_key),
        variantId: String(m.cj_variant_id),
        sku: String(m.cj_variant_sku || ""),
        shippingMethod: m.shipping_method_name || null,
        deliveryMinDays: m.shipping_delivery_min_days == null ? null : Number(m.shipping_delivery_min_days),
        deliveryMaxDays: m.shipping_delivery_max_days == null ? null : Number(m.shipping_delivery_max_days),
        shippingCheckedAt: m.shipping_checked_at || null,
      });
    }
    const catalog = await Promise.all([...groups.values()].map(async group => {
      const [detail, variantData] = await Promise.all([
        cj("/product/productDetail/query", "POST", { id: group.cjProductId }),
        cj("/product/variant/query?pid=" + encodeURIComponent(group.cjProductId))
      ]);
      const d = detail?.product || detail || {};
      const raw = Array.isArray(variantData) ? variantData : (Array.isArray(variantData?.list) ? variantData.list : []);
      const sourceVariants = raw.length ? raw : (Array.isArray(d.variants) ? d.variants : []);
      const byId = new Map(sourceVariants.map(v => [String(v.vid || v.variantId || v.id), v]));
      const variants = group.variants.map(m => {
        const v = byId.get(m.variantId);
        if (!v) return null;
        const options = String(v.variantKey || v.childsku || "").split("-").filter(Boolean);
        return { ...m, options, image: String(v.variantImage || v.img || "") };
      }).filter(Boolean);
      const images = Array.isArray(d.productImageSet) ? d.productImageSet : (Array.isArray(d.img) ? d.img : []);
      return {
        storeProductId: group.storeProductId,
        mainImage: String(d.bigImage || d.bigImg || ""),
        images: images.map(x => typeof x === "string" ? x : String(x?.imageUrl || x?.url || "")).filter(Boolean).slice(0, 8),
        variants
      };
    }));
    return res.status(200).json({ catalog });
  } catch (error) {
    console.error("Public CJ catalogue error", error.code, error.requestId);
    return res.status(502).json({ error: "Les détails fournisseur sont temporairement indisponibles." });
  }
};
