// Password hashing + token encryption with the browser's Web Crypto API.
const enc = new TextEncoder(), dec = new TextDecoder();
export const b64e = u8 => { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
export const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
export const rand = n => crypto.getRandomValues(new Uint8Array(n));

async function derive(secret, saltB64, iter) {
  const km = await crypto.subtle.importKey("raw", enc.encode(secret), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: b64d(saltB64), iterations: iter }, km, 512));
  const key = await crypto.subtle.importKey("raw", bits.slice(0, 32), "AES-GCM", false, ["encrypt", "decrypt"]);
  const verifier = b64e(new Uint8Array(await crypto.subtle.digest("SHA-256", bits.slice(32))));
  return { key, verifier };
}

/* A credential = { salt, iter, verifier, tokenEnc }.  The GitHub token is only readable with the right secret. */
export async function makeCredential(secret, token, iter = 600000) {
  const salt = b64e(rand(16)), { key, verifier } = await derive(secret, salt, iter), iv = rand(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(token)));
  return { salt, iter, verifier, tokenEnc: { iv: b64e(iv), ct: b64e(ct) } };
}
export async function openCredential(secret, cred) {
  try {
    const { key, verifier } = await derive(secret, cred.salt, cred.iter);
    if (verifier !== cred.verifier) return null;
    return dec.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64d(cred.tokenEnc.iv) }, key, b64d(cred.tokenEnc.ct)));
  } catch { return null; }
}

export function newRecoveryCode() {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"; let s = "";
  rand(24).forEach(b => s += A[b & 31]);
  return s.match(/.{4}/g).join("-");
}
export const normCode = c => String(c || "").toUpperCase().replace(/[^A-Z2-7]/g, "");
export const RECOVERY_ITER = 150000;
