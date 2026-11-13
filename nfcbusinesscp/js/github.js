// Minimal GitHub Contents API client used to read/write the JSON data files.
const API = "https://api.github.com";
const enc = new TextEncoder(), dec = new TextDecoder();
const toB64 = text => { const u = enc.encode(text); let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = b => dec.decode(Uint8Array.from(atob(b.replace(/\s/g, "")), c => c.charCodeAt(0)));

async function gh(path, token, method = "GET", body) {
  const r = await fetch(API + path, {
    method, cache: "no-store",
    headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + token, "X-GitHub-Api-Version": "2022-11-28", ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    const e = new Error(j.message || "GitHub error " + r.status); e.status = r.status; throw e;
  }
  return r.json();
}
const enP = p => p.split("/").map(encodeURIComponent).join("/");

export async function checkRepo(s) {
  const j = await gh(`/repos/${s.owner}/${s.repo}`, s.token);
  if (!j.permissions?.push) throw new Error("This token cannot write to the repository. Give it 'Contents: Read and write' access to this repo.");
  return j;
}
export async function readJSON(path, s) {
  const j = await gh(`/repos/${s.owner}/${s.repo}/contents/${enP(path)}?ref=${encodeURIComponent(s.branch)}`, s.token);
  let text;
  if (j.encoding === "base64" && j.content) text = fromB64(j.content);
  else text = fromB64((await gh(`/repos/${s.owner}/${s.repo}/git/blobs/${j.sha}`, s.token)).content);
  return { data: JSON.parse(text), sha: j.sha };
}
export async function writeJSON(path, data, sha, s, message) {
  const body = { message, content: toB64(JSON.stringify(data, null, 2) + "\n"), branch: s.branch };
  if (sha) body.sha = sha;
  return gh(`/repos/${s.owner}/${s.repo}/contents/${enP(path)}`, s.token, "PUT", body);
}
/* read -> change -> write, retrying if the file changed in between */
export async function mutateJSON(path, s, fn, message) {
  for (let i = 0; i < 4; i++) {
    const { data, sha } = await readJSON(path, s);
    const out = (await fn(data)) || data;
    try { await writeJSON(path, out, sha, s, message); return out; }
    catch (e) { if (e.status === 409 || e.status === 422) continue; throw e; }
  }
  throw new Error("The file keeps changing. Please try again.");
}
