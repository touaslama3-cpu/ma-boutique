const {cj}=require("./_cj");
module.exports=async function(req,res){
 res.setHeader("Cache-Control","s-maxage=120, stale-while-revalidate=300");
 res.setHeader("X-Content-Type-Options","nosniff");
 if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).json({error:"Méthode non autorisée."});}
 const pid=String(req.query?.pid||"").trim();
 if(!/^[A-Za-z0-9-]{8,80}$/.test(pid))return res.status(400).json({error:"Identifiant produit CJ invalide."});
 const country=String(req.query?.country||"FR").toUpperCase();
 if(!/^[A-Z]{2}$/.test(country))return res.status(400).json({error:"Pays invalide."});
 try{
  const [detail,variants]=await Promise.all([
   cj("/product/productDetail/query","POST",{id:pid}),
   cj("/product/variant/query?pid="+encodeURIComponent(pid)+"&countryCode="+encodeURIComponent(country))
  ]);
  const v=Array.isArray(variants)?variants:(variants?.list||variants?.items||[]);
  const d=detail?.product||detail;
  return res.status(200).json({supplier:"CJdropshipping",productId:pid,country,product:{
   name:d?.nameEn||d?.productName||"",description:d?.description||"",images:d?.productImageSet||d?.images||[],mainImage:d?.bigImage||"",
   sku:d?.sku||"",category:d?.categoryName||"",currency:"USD",priceRange:d?.sellPrice||"",
   variants:v.map(x=>({variantId:x.vid,sku:x.variantSku,name:x.variantNameEn||x.variantName||"",options:String(x.variantKey||"").split("-").filter(Boolean),image:x.variantImage||"",priceUsd:Number(x.variantSellPrice||0),weightGrams:Number(x.variantWeight||0),inventory:Array.isArray(x.inventories)?x.inventories.map(i=>({country:i.countryCode,available:Number(i.totalInventory||0),verifiedWarehouse:i.verifiedWarehouse})):[]})),
  }});
 }catch(e){console.error("CJ detail error",e.code,e.requestId);return res.status(502).json({error:e.message==="CJ_API_ERROR"?"CJ n'a pas pu fournir les détails de cet article.":"Connexion CJ indisponible."});}
};