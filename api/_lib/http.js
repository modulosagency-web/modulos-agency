import crypto from "node:crypto";
export const json=(res,status,body)=>{res.status(status).setHeader("Content-Type","application/json; charset=utf-8").send(JSON.stringify(body));};
export function cors(req,res){
 const origin=req.headers.origin; const allowed=process.env.ALLOWED_ORIGIN||"https://modulos.in";
 res.setHeader("Vary","Origin");res.setHeader("Access-Control-Allow-Origin",allowed);res.setHeader("Access-Control-Allow-Credentials","true");
 res.setHeader("Access-Control-Allow-Methods","GET,POST,PATCH,DELETE,OPTIONS");res.setHeader("Access-Control-Allow-Headers","Content-Type,X-CSRF-Token");
 res.setHeader("Cache-Control","no-store");res.setHeader("X-Frame-Options","DENY");res.setHeader("Referrer-Policy","strict-origin-when-cross-origin");res.setHeader("Content-Security-Policy","default-src 'none'; frame-ancestors 'none'");
 if(origin&&origin!==allowed)return false; if(req.method==="OPTIONS"){res.status(204).end();return false;}return true;
}
export function body(req){return req.body&&typeof req.body==="object"?req.body:{};}
export function randomToken(bytes=32){return crypto.randomBytes(bytes).toString("base64url");}
export function safeEqual(a,b){const x=Buffer.from(String(a||""));const y=Buffer.from(String(b||""));return x.length===y.length&&crypto.timingSafeEqual(x,y);}
export function cookie(req,name){const raw=req.headers.cookie||"";const item=raw.split(";").map(x=>x.trim()).find(x=>x.startsWith(name+"="));return item?decodeURIComponent(item.slice(name.length+1)):null;}
export function setCookie(res,name,value,maxAge){const secure=process.env.COOKIE_SECURE!=="false";res.setHeader("Set-Cookie",`${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure?"; Secure":""}`);}
export function clearCookie(res,name){res.setHeader("Set-Cookie",`${name}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${process.env.COOKIE_SECURE!=="false"?"; Secure":""}`);}
export function sessionSign(payload){const secret=process.env.SESSION_SECRET;if(!secret||secret.length<32)throw new Error("SESSION_SECRET must contain at least 32 characters.");const data=Buffer.from(JSON.stringify(payload)).toString("base64url");const sig=crypto.createHmac("sha256",secret).update(data).digest("base64url");return `${data}.${sig}`;}
export function sessionVerify(token){try{const [data,sig]=String(token||"").split(".");const expected=crypto.createHmac("sha256",process.env.SESSION_SECRET).update(data).digest("base64url");if(!safeEqual(sig,expected))return null;const p=JSON.parse(Buffer.from(data,"base64url").toString());if(!p.exp||p.exp<Date.now())return null;return p;}catch{return null;}}
export function csrf(req,res){const origin=req.headers.origin;const allowed=process.env.ALLOWED_ORIGIN||"https://modulos.in";if(origin!==allowed)return false;const token=cookie(req,"modulos_csrf");return !!token&&safeEqual(req.headers["x-csrf-token"],token);}
