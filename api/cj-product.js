const {cj}=require("./_cj");
module.exports=async function(req,res){
 res.setHeader("Cache-Control","no-store");
 res.setHeader("X-Content-Type-Options","nosniff");
 if(req.method!=="GET"){res.setHeader("Allow","GET");return res.status(405).json({error:"Méthode non autorisée."});}
 const pid=String(req.query?.pid||"").trim();
 if(!/^[A-Za-z0-9-]{8,80}$/.test(pid))return res.status(400).json({error:"Identifiant produit CJ invalide."});
 try{
  const detail=await cj("/product/productDetail/query","POST",{id:pid});
  const variantData=await cj("/product/variant/query?pid="+encodeURIComponent(pid));
  const d=detail?.product||detail||{};
  const variants=Array.isArray(variantData)?variantData:(Array.isArray(variantData?.list)?variantData.list:[]);
  const productVariants=Array.isArray(d.variants)?d.variants:[];
  const merged=variants.length?variants:productVariants;
  return res.status(200).json({supplier:"CJdropshipping",productId:pid,product:{
   name:d.nameEn||d.productNameEn||"",description:d.description||"",images:Array.isArray(d.productImageSet)?d.productImageSet:(Array.isArray(d.img)?d.img:[]),mainImage:d.bigImage||d.bigImg||"",
   sku:d.productSku||d.sku||"",category:d.categoryName||"",currency:"USD",
   variants:merged.map(x=>({variantId:x.vid||x.variantId||x.id,sku:x.variantSku||x.sku||"",name:x.variantNameEn||x.nameEn||x.variantName||"",options:String(x.variantKey||x.childsku||"").split("-").filter(Boolean),image:x.variantImage||x.img||"",priceUsd:Number(x.variantSellPrice??x.sellPrice??0),weightGrams:Number(x.variantWeight||0),stockByCountry:Array.isArray(x.inventories)?x.inventories.map(i=>({country:i.countryCode,available:Number(i.totalInventory||0),verifiedWarehouse:Number(i.verifiedWarehouse||0)})):[]}))
  }});
 }catch(e){console.error("CJ detail error",e.code,e.requestId,e.message);return res.status(502).json({error:"CJ n'a pas pu fournir les détails et variantes de cet article."});}
};