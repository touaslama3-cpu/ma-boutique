let cache={token:null,until:0};
async function token(){
 if(cache.token&&cache.until>Date.now()+60000)return cache.token;
 const key=process.env.CJ_API_KEY;if(!key)throw new Error("CJ_API_KEY_MISSING");
 const r=await fetch("https://developers.cjdropshipping.com/api2.0/v1/authentication/getAccessToken",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({apiKey:key})});
 const j=await r.json().catch(()=>({}));
 if(!r.ok||j.code!==200||!j.data?.accessToken)throw new Error("CJ_AUTH_FAILED");
 cache={token:j.data.accessToken,until:Date.parse(j.data.accessTokenExpiryDate||"")||Date.now()+21600000};return cache.token;
}
async function cj(path,method="GET",body){
 const t=await token();const r=await fetch("https://developers.cjdropshipping.com/api2.0/v1"+path,{method,headers:{"CJ-Access-Token":t,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
 const j=await r.json().catch(()=>({}));if(!r.ok||j.code!==200) {const e=new Error("CJ_API_ERROR");e.code=j.code;e.requestId=j.requestId;throw e;}return j.data;
}
module.exports={cj};