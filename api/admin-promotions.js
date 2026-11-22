const SUPABASE_URL=process.env.SUPABASE_URL, SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY, ADMIN_TOKEN=process.env.TAWCO_ADMIN_TOKEN;
const crypto=require("crypto");
function authorized(req){const value=req.headers.authorization||"";if(!ADMIN_TOKEN)return false;const a=Buffer.from(value),b=Buffer.from("Bearer "+ADMIN_TOKEN);return a.length===b.length&&crypto.timingSafeEqual(a,b);}
async function db(path,options={}){return fetch(SUPABASE_URL+"/rest/v1/"+path,{...options,headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json",Prefer:"return=representation",...(options.headers||{})}});}
function json(res,status,body){return res.status(status).json(body);}
module.exports=async function handler(req,res){
 res.setHeader("Cache-Control","no-store");res.setHeader("X-Content-Type-Options","nosniff");
 if(!["GET","POST","PATCH"].includes(req.method)){res.setHeader("Allow","GET, POST, PATCH");return json(res,405,{error:"Méthode non autorisée."});}
 if(!authorized(req))return json(res,401,{error:"Accès refusé."});
 if(!SUPABASE_URL||!SERVICE_KEY)return json(res,503,{error:"Base de données non configurée."});
 try{
  if(req.method==="GET"){const r=await db("promotion_codes?select=id,code,discount_type,discount_value,minimum_amount,max_uses,uses_count,starts_at,expires_at,active&order=created_at.desc");const rows=await r.json();if(!r.ok)return json(res,502,{error:"Lecture des codes impossible."});return json(res,200,{codes:rows});}
  const b=req.body||{};
  if(req.method==="PATCH"){if(!/^[0-9a-f-]{36}$/i.test(String(b.id||""))||typeof b.active!=="boolean")return json(res,400,{error:"Identifiant ou statut invalide."});const r=await db("promotion_codes?id=eq."+encodeURIComponent(b.id),{method:"PATCH",body:JSON.stringify({active:b.active})});const rows=await r.json();if(!r.ok)return json(res,502,{error:"Mise à jour impossible."});return json(res,200,{code:rows[0]||null});}
  const code=String(b.code||"").trim().toUpperCase(),type=String(b.discount_type||"percent"),value=Number(b.discount_value),minimum=Number(b.minimum_amount||0),maxUses=b.max_uses==null||b.max_uses===""?null:Number(b.max_uses);
  const starts=b.starts_at?new Date(b.starts_at).toISOString():null,expires=b.expires_at?new Date(b.expires_at).toISOString():null;
  if(!/^[A-Z0-9_-]{3,40}$/.test(code)||!["percent","fixed"].includes(type)||!Number.isInteger(value)||value<1||(type==="percent"&&value>90)||(type==="fixed"&&value>100000)||!Number.isInteger(minimum)||minimum<0||(maxUses!==null&&(!Number.isInteger(maxUses)||maxUses<1))||(starts&&expires&&Date.parse(starts)>=Date.parse(expires)))return json(res,400,{error:"Paramètres de promotion invalides."});
  const payload={code,discount_type:type,discount_value:value,minimum_amount:minimum,max_uses:maxUses,active:true,starts_at:starts,expires_at:expires};
  const r=await db("promotion_codes",{method:"POST",body:JSON.stringify(payload)});const rows=await r.json();if(!r.ok)return json(res,r.status===409?409:502,{error:r.status===409?"Ce code existe déjà.":"Création du code impossible."});return json(res,201,{code:rows[0]});
 }catch(e){console.error("TAW promotion admin:",e.message);return json(res,400,{error:"Données de promotion invalides."});}
};
