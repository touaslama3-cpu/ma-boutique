const {cj}=require("./_cj");
module.exports=async function(req,res){
 res.setHeader("Cache-Control","no-store");res.setHeader("X-Content-Type-Options","nosniff");
 if(req.method!=="POST"){res.setHeader("Allow","POST");return res.status(405).json({error:"Méthode non autorisée."});}
 const body=req.body||{},products=body.products;
 const origin=String(body.origin||"CN").toUpperCase(),zip=String(body.zip||"").trim();
 if(!/^[A-Z]{2}$/.test(origin)||!Array.isArray(products)||!products.length||products.length>10||products.some(p=>!p||!/^[A-Za-z0-9-]{8,80}$/.test(String(p.vid||""))||!Number.isInteger(Number(p.quantity))||Number(p.quantity)<1||Number(p.quantity)>20)){
  return res.status(400).json({error:"Variantes, quantités ou entrepôt invalides."});
 }
 try{
  const data=await cj("/logistic/freightCalculate","POST",{startCountryCode:origin,endCountryCode:"FR",...(zip?{zip}:{}),products:products.map(p=>({vid:String(p.vid),quantity:Number(p.quantity)}))});
  const options=Array.isArray(data)?data:[];
  return res.status(200).json({destination:"FR",origin,shipping:options.map(x=>({carrier:x.logisticName,deliveryWindowDays:x.logisticAging,shippingUsd:Number(x.totalPostageFee??x.logisticPrice),taxesUsd:Number(x.taxesFee||0),customsFeeUsd:Number(x.clearanceOperationFee||0)}))});
 }catch(e){console.error("CJ freight error",e.code,e.requestId);return res.status(502).json({error:"CJ n'a pas pu calculer les frais de livraison pour ces variantes."});}
};