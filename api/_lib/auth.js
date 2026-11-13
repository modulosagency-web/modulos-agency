import crypto from "node:crypto";
import {cookie,sessionVerify,safeEqual,json} from "./http.js";
export function passwordHash(password,salt=crypto.randomBytes(16).toString("base64url")){const iterations=310000;const derived=crypto.pbkdf2Sync(password,salt,iterations,32,"sha256").toString("base64url");return `pbkdf2-sha256$${iterations}$${salt}$${derived}`;}
export function verifyPassword(password,encoded){try{const [alg,it,salt,hash]=encoded.split("$");if(alg!=="pbkdf2-sha256")return false;const candidate=crypto.pbkdf2Sync(password,salt,Number(it),32,"sha256").toString("base64url");return safeEqual(candidate,hash);}catch{return false;}}
export function requireAuth(req,res){const p=sessionVerify(cookie(req,"modulos_session"));if(!p){json(res,401,{error:"Your session has expired. Please sign in again."});return null;}return p;}
export function validatePassword(p){return typeof p==="string"&&p.length>=12&&p.length<=200;}
