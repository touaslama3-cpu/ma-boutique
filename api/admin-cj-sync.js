const { cj } = require("./_cj");
const crypto = require("crypto");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_TOKEN = process.env.TAWCO_ADMIN_TOKEN;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const products = [
[101,"T-shirt essentiel femme","women basic cotton t shirt","women"],
[102,"Chemise oversize femme","women oversized button shirt","women"],
[103,"Robe casual","women casual dress","women"],
[104,"Ensemble détente femme","women lounge matching set","women"],
[105,"Jean coupe droite femme","women straight leg denim jeans","women"],
[106,"T-shirt basique homme","men basic cotton t shirt","men"],
[107,"Sweat à capuche homme","men hooded sweatshirt hoodie","men"],
[108,"Chemise casual homme","men casual button down shirt","men"],
[109,"Jean homme","men straight fit denim jeans","men"],
[110,"Veste légère unisexe","unisex lightweight casual jacket","unisex"],
[111,"Baskets lifestyle","lifestyle casual sneakers shoes","unisex"],
[112,"Sneakers minimalistes","minimalist casual sneakers shoes","unisex"],
[113,"Sac porté épaule","shoulder handbag","unisex"],
[114,"Lunettes de soleil","sunglasses fashion eyewear","unisex"],
[115,"Casquette urbaine","urban baseball cap","unisex"]
];
function authorized(req) {
 const value=req.headers.authorization||"", expected=Buffer.from("Bearer "+(ADMIN_TOKEN||"")), actual=Buffer.from(value);
 return !!ADMIN_TOKEN && actual.length===expected.length && crypto.timingSafeEqual(actual,expected);
}
async function db(path,options={}) {
 return fetch(SUPABASE_URL+"/rest/v1/"+path,{...options,headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json",Prefer:"return=representation",...(options.headers||{})}});
}
function score(p,item) {
 const name=(item.name||"").toLowerCase(), category=(item.category||"").toLowerCase(), hay=name+" "+category;
 const terms=p[2].toLowerCase().replace(/women's|men's|unisex/g,"").split(/[^a-z]+/).filter(x=>x.length>2);
 let n=terms.filter(t=>hay.includes(t)).length;
 const wrong=p[3]==="men"?/women|woman|lady|female|girls/.test(hay):p[3]==="women"?/men's|mens|\bmen\b|male/.test(hay):false;
 if(wrong)return 0;
 return Math.min(100,Math.round(n/Math.max(terms.length,1)*100));
}
module.exports=async function handler(req,res){
 res.setHeader("Cache-Control","no-store");res.setHeader("X-Content-Type-Options","nosniff");
 if(req.method!=="POST")return res.status(405).json({error:"Méthode non autorisée."});
 if(!authorized(req))return res.status(401).json({error:"Accès refusé."});
 if(!SUPABASE_URL||!SERVICE_KEY)return res.status(503).json({error:"Supabase non configuré."});
 const offset=Number(req.body?.offset??0),warehouse=String(req.body?.warehouse||"ALL").toUpperCase();
 if(!Number.isInteger(offset)||offset<0||offset>=15||!["ALL","FR","DE","ES","PL","CN","US","GB"].includes(warehouse))return res.status(400).json({error:"Paramètres invalides."});
 const batch=products.slice(offset,Math.min(offset+2,15)),summary=[];
 try {
  for(let i=0;i<batch.length;i++){
   const p=batch[i];
   const params=new URLSearchParams({page:"1",size:"24",keyWord:p[2],startWarehouseInventory:"1",verifiedWarehouse:"1",productType:"4",features:"enable_category",...(warehouse==="ALL"?{}:{countryCode:warehouse})});
   const data=await cj("/product/listV2?"+params.toString());
   const groups=Array.isArray(data?.content)?data.content:[];
   const raw=groups.flatMap(g=>Array.isArray(g.productList)?g.productList:[]).filter(x=>x&&x.id&&x.bigImage&&x.saleStatus==="3");
   const candidates=raw.map(x=>({id:String(x.id),sku:String(x.sku||""),name:String(x.nameEn||"Article").slice(0,180),image:String(x.bigImage),category:String(x.threeCategoryName||x.twoCategoryName||x.oneCategoryName||"Mode").slice(0,100),stock:Number(x.totalVerifiedInventory||x.warehouseInventoryNum||0)}))
    .map(x=>({...x,score:score(p,{name:x.name,category:x.category})}))
    .filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,12);
   if(candidates.length){
    const rows=candidates.map(x=>({store_product_id:p[0],store_product_name:p[1],cj_product_id:x.id,cj_product_name:x.name,cj_sku:x.sku,image_url:x.image,category:x.category,stock_available:x.stock,warehouse_filter:warehouse,match_score:x.score,match_status:"needs_review"}));
    const saved=await db("supplier_product_candidates?on_conflict=store_product_id,cj_product_id",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=representation"},body:JSON.stringify(rows)});
    if(!saved.ok)throw new Error("CANDIDATE_SAVE_FAILED");
   }
   summary.push({store_product_id:p[0],name:p[1],found:raw.length,saved:candidates.length});
   if(i<batch.length-1)await sleep(1400);
  }
  return res.status(200).json({ok:true,offset,next_offset:offset+batch.length,processed:batch.length,results:summary,done:offset+batch.length>=15});
 }catch(e){console.error("CJ automated sync failed",e.code||e.message);return res.status(502).json({error:"Synchronisation interrompue. Les résultats déjà enregistrés sont conservés.",details:e.message==="CANDIDATE_SAVE_FAILED"?"Enregistrement Supabase impossible.":"Le fournisseur CJ n'a pas répondu correctement.",next_offset:offset});}
};
