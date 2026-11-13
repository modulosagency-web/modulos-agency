import bcrypt from 'bcryptjs';

const te = new TextEncoder();
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const sha = async s => hex(await crypto.subtle.digest('SHA-256', te.encode(s)));
const rnd = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const ctEq = async (a, b) => !!a && !!b && (await sha(String(a))) === (await sha(String(b)));
const E = (m, s = 400) => Object.assign(new Error(m), { status: s, expose: true });
const TTL = 8 * 3600, ID_RE = /^[A-Za-z0-9-]{1,32}$/, UUID_RE = /^[a-f0-9-]{36}$/;
const LINKS = ['instagram', 'facebook', 'youtube', 'whatsapp', 'website', 'googleReview', 'linkedin'];

export default {
  async fetch(req, env) {
    const o = req.headers.get('Origin');
    const h = o && o === env.ALLOWED_ORIGIN ? {
      'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'content-type,x-csrf-token', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', Vary: 'Origin'
    } : {};
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const out = (d, s = 200, x = {}) => new Response(JSON.stringify(d), { status: s, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...h, ...x } });
    try { return await route(req, env, out); }
    catch (e) { return out({ error: e.expose ? e.message : 'Server error' }, e.expose ? e.status : 500); }
  }
};

async function gh(env, path, method = 'GET', body) {
  const r = await fetch(`https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}${path}`, {
    method, body: body ? JSON.stringify(body) : undefined,
    headers: { Authorization: 'Bearer ' + env.GH_TOKEN, 'User-Agent': 'modulos-dashboard', Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' }
  });
  if (!r.ok) throw E(`GitHub request failed (${r.status})`, 502);
  return r.status === 204 ? null : r.json();
}

async function session(req, env, csrf) {
  const sid = /(?:^|; )sid=([a-f0-9]{64})/.exec(req.headers.get('Cookie') || '')?.[1];
  const s = sid && await env.KV.get('s:' + await sha(sid), 'json');
  if (!s) throw E('Session expired. Please log in again.', 401);
  if (csrf && req.headers.get('x-csrf-token') !== s.csrf) throw E('Security check failed (CSRF).', 403);
  return { ...s, sid };
}
const checkEmail = e => { e = String(e || '').trim().toLowerCase(); if (!/^[^@\s]{1,64}@[^@\s]{1,255}$/.test(e)) throw E('Enter a valid email'); return e; };
const checkPw = p => { if (typeof p !== 'string' || p.length < 12 || p.length > 128) throw E('Password must be 12-128 characters'); return p; };

function httpsOnly(v, k) {
  v = String(v || '').trim().slice(0, 300);
  if (!v) return '';
  if (k === 'whatsapp' && /^\+?[\d\s-]{8,16}$/.test(v)) return v;
  let u; try { u = new URL(v); } catch { throw E(`${k}: invalid URL`); }
  if (u.protocol !== 'https:') throw E(`${k}: only https:// links are allowed`);
  return u.href;
}
function clean(b) {
  const op = b.op, id = String(b.id || '');
  if (!['create', 'edit', 'delete'].includes(op)) throw E('Invalid operation');
  if (!ID_RE.test(id)) throw E('QR ID must be 1-32 letters, digits or hyphens');
  const rec = { op, id };
  if (op !== 'delete') {
    rec.name = String(b.name || '').trim(); rec.description = String(b.description || '').trim();
    if (!rec.name || rec.name.length > 80) throw E('Business name is required (max 80 chars)');
    if (!rec.description || rec.description.length > 600) throw E('Description is required (max 600 chars)');
    const l = b.links || {}; rec.links = {};
    for (const k of LINKS) rec.links[k] = httpsOnly(l[k], k);
    rec.links.other = (Array.isArray(l.other) ? l.other : []).slice(0, 5).map(o => ({ label: String(o.label || '').slice(0, 40), url: httpsOnly(o.url, 'other') }));
  }
  let logo = null;
  if (op !== 'delete' && b.logo) {
    if (typeof b.logo !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(b.logo) || b.logo.length > 2.8e6) throw E('Logo must be a PNG up to 2 MB');
    if (!b.logo.startsWith('iVBORw0KGgo')) throw E('Logo must be a PNG file');
    logo = b.logo;
  }
  return { rec, logo };
}
const b64 = s => btoa(String.fromCharCode(...te.encode(s)));

async function route(req, env, out) {
  const url = new URL(req.url), p = url.pathname, m = req.method;
  if (m !== 'GET' && req.headers.get('Origin') !== env.ALLOWED_ORIGIN) throw E('Bad origin', 403);
  const admin = await env.KV.get('admin', 'json');
  const body = m === 'POST' ? await req.json().catch(() => ({})) : {};

  if (p === '/api/state') return out({ setup: !!admin });

  if (p === '/api/setup') {
    if (admin) throw E('Already configured', 409);
    if (!(await ctEq(body.setupKey, env.SETUP_KEY))) throw E('Invalid setup key', 403);
    await env.KV.put('admin', JSON.stringify({ email: checkEmail(body.email), hash: await bcrypt.hash(checkPw(body.password), 10) }));
    return out({ ok: true });
  }
  if (!admin) throw E('Setup required', 409);

  if (p === '/api/login') {
    const rk = 'rl:' + (req.headers.get('CF-Connecting-IP') || 'x');
    const n = +(await env.KV.get(rk)) || 0;
    if (n >= 8) throw E('Too many attempts. Try again in 15 minutes.', 429);
    const ok = String(body.email || '').trim().toLowerCase() === admin.email && await bcrypt.compare(String(body.password || ''), admin.hash);
    if (!ok) { await env.KV.put(rk, String(n + 1), { expirationTtl: 900 }); throw E('Invalid email or password', 401); }
    const sid = rnd(32), csrf = rnd(16);
    await env.KV.put('s:' + await sha(sid), JSON.stringify({ csrf }), { expirationTtl: TTL });
    return out({ email: admin.email, csrf }, 200, { 'Set-Cookie': `sid=${sid}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${TTL}` });
  }
  if (p === '/api/forgot') { // recovery via the SETUP_KEY secret (no email service needed)
    if (!(await ctEq(body.setupKey, env.SETUP_KEY))) throw E('Invalid recovery key', 403);
    await env.KV.put('admin', JSON.stringify({ ...admin, hash: await bcrypt.hash(checkPw(body.newPassword), 10) }));
    for (const k of (await env.KV.list({ prefix: 's:' })).keys) await env.KV.delete(k.name);
    return out({ ok: true });
  }
  if (p === '/api/session') { const s = await session(req, env); return out({ email: admin.email, csrf: s.csrf }); }
  if (p === '/api/logout') {
    const s = await session(req, env, true); await env.KV.delete('s:' + await sha(s.sid));
    return out({ ok: true }, 200, { 'Set-Cookie': 'sid=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0' });
  }

  if (p === '/api/business') {
    await session(req, env, true);
    const { rec, logo } = clean(body);
    if (await env.KV.get('lock')) throw E('Another change is still publishing. Please wait and retry.', 409);
    if (rec.op === 'create') { // fast pre-check; the workflow re-checks authoritatively
      const db = await fetch(`${env.SITE_URL}/data/businesses.json?t=${Date.now()}`).then(r => r.json()).catch(() => ({ businesses: [] }));
      if (db.businesses.some(x => x.id === rec.id)) throw E(`QR ID ${rec.id} already exists`, 409);
      if (!logo) throw E('Logo PNG is required');
    }
    const id = crypto.randomUUID(), branch = env.GH_BRANCH || 'main';
    await gh(env, `/contents/incoming/${id}.json`, 'PUT', { message: 'queue ' + id, content: b64(JSON.stringify(rec)), branch });
    if (logo) await gh(env, `/contents/incoming/${id}.png`, 'PUT', { message: 'queue logo ' + id, content: logo, branch });
    await gh(env, '/actions/workflows/manage.yml/dispatches', 'POST', { ref: branch, inputs: { request_id: id } });
    await env.KV.put('lock', id, { expirationTtl: 600 });
    return out({ requestId: id });
  }

  if (p === '/api/status') {
    await session(req, env);
    const id = url.searchParams.get('id') || '';
    if (!UUID_RE.test(id)) throw E('Bad id');
    const d = await gh(env, '/actions/workflows/manage.yml/runs?event=workflow_dispatch&per_page=20');
    const run = d.workflow_runs.find(r => (r.display_title || '').includes(id));
    if (!run) return out({ state: 'queued' });
    const jobs = (await gh(env, `/actions/runs/${run.id}/jobs`)).jobs;
    if (run.status !== 'completed') return out({ state: jobs.find(j => j.name === 'deploy' && j.status !== 'queued') ? 'publishing' : 'generating' });
    await env.KV.delete('lock');
    if (run.conclusion === 'success') return out({ state: 'success' });
    let detail = 'The publishing workflow failed. Nothing was changed - you can retry safely.';
    try {
      const j = jobs.find(x => x.conclusion === 'failure');
      const a = await gh(env, `/check-runs/${j.id}/annotations`);
      const msg = a.find(x => x.annotation_level === 'failure' && !/^Process completed/.test(x.message));
      if (msg) detail = msg.message;
    } catch { /* annotations optional */ }
    return out({ state: 'failed', detail });
  }
  throw E('Not found', 404);
}
