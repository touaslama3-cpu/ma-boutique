const { cj } = require("./_cj");
const crypto = require("crypto");
const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN_TOKEN = process.env.TAWCO_ADMIN_TOKEN;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const products = [
[101,"Robe de fêtes en velours","women velvet evening dress","women"],
[102,"Pull doux femme","women's soft knit pullover sweater","women"],
[103,"Cardigan femme","women's knitted cardigan button front","women"],
[104,"Manteau hiver femme","women's winter long padded coat","women"],
[105,"Ensemble jogging homme","men's tracksuit set sweatshirt jogger","men"],
[106,"Pull maille homme","men's knitted crew neck sweater","men"],
[107,"Sweat à capuche homme","men's hooded sweatshirt hoodie","men"],
[108,"Veste hiver homme","men's winter padded jacket","men"],
[109,"Chemise à carreaux homme","men's plaid flannel shirt","men"],
[110,"Pantalon homme","men's casual straight leg trousers","men"],
[111,"Polo homme","men's short sleeve polo shirt","men"],
[112,"T-shirt homme","men's basic cotton crew neck t shirt","men"],
[113,"Jean homme","men's denim jeans straight fit","men"],
[114,"Veste zippée homme","men's casual zip up jacket","men"],
[115,"Écharpe chaude unisexe","unisex winter knitted scarf","unisex"],
[116,"Chaussures homme","men's casual sneakers shoes","men"],
[117,"Chemise casual homme","men's casual button down shirt","men"],
[118,"Casquette homme","men's baseball cap","men"],
[119,"Lunettes homme","men's sunglasses","men"],
[120,"Montre homme","men's wrist watch","men"],
[121,"Pull hiver femme","women winter knitted sweater","women"],
[122,"Pull col roulé femme","women turtleneck knit sweater","women"],
[123,"Pantalon femme","women casual trousers pants","women"],
[124,"Jean femme","women denim jeans","women"],
[125,"Sweat femme","women fleece sweatshirt","women"],
[126,"Bottes hiver homme","men winter boots","men"],
[127,"Bottes hiver femme","women winter ankle boots","women"],
[128,"Bonnet hiver unisexe","winter knitted beanie hat","unisex"],
[129,"Gants hiver unisexe","winter thermal knitted gloves","unisex"],
[130,"Pull col roulé homme","men turtleneck winter sweater","men"]
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
 const wrong=p[3]==="men"?/women|woman|lady|female|girls/.test(hay):p[3]==="women"?/men's|mens|\\bmen\\b|male/.test(hay):false;
 if(wrong)return 0;
 return Math.min(100,Math.round(n/Math.max(terms.length,1)*100));
}
module.exports=async function handler(req,res){
 res.setHeader("Cache-Control","no-store");res.setHeader("X-Content-Type-Options","nosniff");
 if(req.method!=="POST")return res.status(405).json({error:"Méthode non autorisée."});
 if(!authorized(req))return res.status(401).json({error:"Accès refusé."});
 if(!SUPABASE_URL||!SERVICE_KEY)return res.status(503).json({error:"Supabase non configuré."});
 const offset=Number(req.body?.offset??0),warehouse=String(req.body?.warehouse||"ALL").toUpperCase();
 if(!Number.isInteger(offset)||offset<0||offset>=30||!["ALL","FR","DE","ES","PL","CN","US","GB"].includes(warehouse))return res.status(400).json({error:"Paramètres invalides."});
 const batch=products.slice(offset,Math.min(offset+2,30)),summary=[];
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
  return res.status(200).json({ok:true,offset,next_offset:offset+batch.length,processed:batch.length,results:summary,done:offset+batch.length>=30});
 }catch(e){console.error("CJ automated sync failed",e.code||e.message);return res.status(502).json({error:"Synchronisation interrompue. Les résultats déjà enregistrés sont conservés.",details:e.message==="CANDIDATE_SAVE_FAILED"?"Enregistrement Supabase impossible.":"Le fournisseur CJ n'a pas répondu correctement.",next_offset:offset});}
};
