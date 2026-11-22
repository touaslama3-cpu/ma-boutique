// Routeur CJ autonome : évite les dépendances de fichiers privés non résolues au runtime.
let tokenCache = { value: null, expiresAt: 0 };
async function accessToken() {
  if (tokenCache.value && tokenCache.expiresAt > Date.now() + 60000) return tokenCache.value;
  const apiKey = process.env.CJ_API_KEY;
  if (!apiKey) throw new Error("CJ_API_KEY_MISSING");
  const r = await fetch("https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ apiKey })
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.code !== 200 || !j.data?.accessToken) throw new Error("CJ_AUTH_FAILED");
  const expiry = Date.parse(j.data.accessTokenExpiryDate || "");
  tokenCache = { value: j.data.accessToken, expiresAt: Number.isFinite(expiry) ? expiry : Date.now() + 21600000 };
  return tokenCache.value;
}
async function cj(path, method = "GET", body) {
  const token = await accessToken();
  const r = await fetch("https://developers.cjdropshipping.com/api2.0/v1" + path, {
    method, headers: { "CJ-Access-Token": token, "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.code !== 200) { const e = new Error("CJ_API_ERROR"); e.code = j.code; e.requestId = j.requestId; throw e; }
  return j.data;
}
function fail(res, e) {
  if (e.message === "CJ_API_KEY_MISSING") return res.status(503).json({ error: "Connexion CJ non configurée sur cet environnement." });
  if (e.message === "CJ_AUTH_FAILED") return res.status(502).json({ error: "CJ refuse l'authentification. Vérifie la clé API dans Vercel." });
  console.error("TAW CJ router error", e.code, e.requestId, e.message);
  return res.status(502).json({ error: "Le service CJ est temporairement indisponible." });
}
async function products(req, res) {
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "Méthode non autorisée." }); }
  const keyword = String(req.query?.keyword || "women clothing").trim().slice(0, 80);
  const warehouse = String(req.query?.warehouse || "FR").toUpperCase();
  if (!["FR","CN","US","GB","DE","ES","PL","ALL"].includes(warehouse)) return res.status(400).json({ error: "Entrepôt invalide." });
  if (!/^[\p{L}\p{N} \-']+$/u.test(keyword)) return res.status(400).json({ error: "Recherche invalide." });
  try {
    const params = new URLSearchParams({ page:"1", size:"24", keyWord:keyword,
      ...(warehouse === "ALL" ? {} : { countryCode:warehouse }),
      startWarehouseInventory:"1", verifiedWarehouse:"1", productType:"4", features:"enable_category" });
    const payload = await cj("/product/listV2?" + params.toString());
    const groups = Array.isArray(payload?.content) ? payload.content : [];
    const list = groups.flatMap(g => Array.isArray(g.productList) ? g.productList : [])
      .filter(p => p && p.id && p.bigImage && p.saleStatus === "3")
      .map(p => ({ supplier:"CJdropshipping", supplierProductId:String(p.id), sku:String(p.sku||""),
        name:String(p.nameEn||"Article").slice(0,180), image:String(p.bigImage),
        category:String(p.threeCategoryName||p.twoCategoryName||p.oneCategoryName||"Mode").slice(0,100),
        stockAvailable:Number(p.totalVerifiedInventory||p.warehouseInventoryNum||0), warehouseFilter:warehouse }));
    return res.status(200).json({ supplier:"CJdropshipping", keyword, warehouse, count:list.length, page:1, products:list });
  } catch(e) { return fail(res,e); }
}
async function product(req,res) {
  if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).json({error:"Méthode non autorisée."});}
  const pid=String(req.query?.pid||"").trim();
  if(!/^[A-Za-z0-9-]{8,80}$/.test(pid))return res.status(400).json({error:"Identifiant produit CJ invalide."});
  try{
    const [detail,variantData,inventoryData]=await Promise.all([
      cj("/product/productDetail/query","POST",{id:pid}),
      cj("/product/variant/query?pid="+encodeURIComponent(pid)),
      cj("/product/stock/getInventoryByPid?pid="+encodeURIComponent(pid))
    ]);
    const d=detail?.product||detail||{};
    const variants=Array.isArray(variantData)?variantData:(Array.isArray(variantData?.list)?variantData.list:[]);
    const merged=variants.length?variants:(Array.isArray(d.variants)?d.variants:[]);
    const inventory=inventoryData||{};
    const byVid=new Map((Array.isArray(inventory.variantInventories)?inventory.variantInventories:[]).map(v=>[String(v.vid),Array.isArray(v.inventory)?v.inventory:[]]));
    const warehouses=(Array.isArray(inventory.inventories)?inventory.inventories:[]).map(i=>({country:String(i.countryCode||""),name:String(i.countryNameEn||i.areaEn||""),available:Number(i.totalInventoryNum||0),cjStock:Number(i.cjInventoryNum||0),factoryStock:Number(i.factoryInventoryNum||0)}));
    return res.status(200).json({supplier:"CJdropshipping",productId:pid,product:{
      name:d.nameEn||d.productNameEn||"",description:d.description||"",images:Array.isArray(d.productImageSet)?d.productImageSet:(Array.isArray(d.img)?d.img:[]),
      mainImage:d.bigImage||d.bigImg||"",sku:d.productSku||d.sku||"",category:d.categoryName||"",currency:"USD",warehouses,
      variants:merged.map(x=>{const vid=String(x.vid||x.variantId||x.id||""),inv=byVid.get(vid)||[];
        return {variantId:vid,sku:x.variantSku||x.sku||"",name:x.variantNameEn||x.nameEn||x.variantName||"",
          options:String(x.variantKey||x.childsku||"").split("-").filter(Boolean),image:x.variantImage||x.img||"",
          priceUsd:Number(x.variantSellPrice??x.sellPrice??0),weightGrams:Number(x.variantWeight||0),
          stockByCountry:inv.map(i=>({country:String(i.countryCode||""),available:Number(i.totalInventory||0),cjStock:Number(i.cjInventory||0),factoryStock:Number(i.factoryInventory||0),verifiedWarehouse:Number(i.verifiedWarehouse||0)}))};
      })
    }});
  }catch(e){return fail(res,e);}
}
async function freight(req,res){
  if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Méthode non autorisée."});}
  const body=req.body||{}, items=body.products, origin=String(body.origin||"CN").toUpperCase(),zip=String(body.zip||"").trim();
  if(!/^[A-Z]{2}$/.test(origin)||!Array.isArray(items)||!items.length||items.length>10||items.some(p=>!p||!/^[A-Za-z0-9-]{8,80}$/.test(String(p.vid||""))||!Number.isInteger(Number(p.quantity))||Number(p.quantity)<1||Number(p.quantity)>20))
    return res.status(400).json({error:"Variantes, quantités ou entrepôt invalides."});
  try{
    const data=await cj("/logistic/freightCalculate","POST",{startCountryCode:origin,endCountryCode:"FR",...(zip?{zip}:{}),products:items.map(p=>({vid:String(p.vid),quantity:Number(p.quantity)}))});
    const options=Array.isArray(data)?data:[];
    return res.status(200).json({destination:"FR",origin,shipping:options.map(x=>({carrier:x.logisticName,deliveryWindowDays:x.logisticAging,shippingUsd:Number(x.totalPostageFee??x.logisticPrice),taxesUsd:Number(x.taxesFee||0),customsFeeUsd:Number(x.clearanceOperationFee||0)}))});
  }catch(e){return fail(res,e);}
}
async function track(req,res){
  if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).json({error:"Méthode non autorisée."});}
  const number=String(req.query?.number||"").trim();
  if(!/^[A-Za-z0-9-]{6,60}$/.test(number))return res.status(400).json({error:"Numéro de suivi invalide."});
  try{const rows=await cj("/logistic/trackInfo?trackNumber="+encodeURIComponent(number));const list=Array.isArray(rows)?rows:[];
    return res.status(200).json({tracking:list.map(x=>({number:x.trackingNumber,carrier:x.logisticName,status:x.trackingStatus,origin:x.trackingFrom,destination:x.trackingTo,deliveryDay:x.deliveryDay,lastMileCarrier:x.lastMileCarrier,lastMileNumber:x.lastTrackNumber,lastUpdate:x.deliveryTime}))});
  }catch(e){return fail(res,e);}
}
module.exports=async function(req,res){
  res.setHeader("X-Content-Type-Options","nosniff");
  const route=String(req.query?.route||"");
  if(route==="products"){res.setHeader("Cache-Control","s-maxage=300, stale-while-revalidate=600");return products(req,res);}
  if(route==="product"){res.setHeader("Cache-Control","no-store");return product(req,res);}
  if(route==="freight"){res.setHeader("Cache-Control","no-store");return freight(req,res);}
  if(route==="track"){res.setHeader("Cache-Control","no-store");return track(req,res);}
  return res.status(404).json({error:"Route CJ inconnue."});
};