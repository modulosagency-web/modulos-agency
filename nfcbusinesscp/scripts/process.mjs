// Applies ONE queued request (create / edit / delete) and regenerates only that business page.
// Runs inside GitHub Actions. Any error => exit 1 => nothing is committed (DB never half-updated).
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'nfcbusinesscp', DB = 'data/businesses.json';
const fail = m => { console.error('::error::' + m); process.exit(1); };
const rid = process.env.REQUEST_ID || '';
if (!/^[a-f0-9-]{36}$/.test(rid)) fail('Invalid request id');
const reqFile = `incoming/${rid}.json`, logoFile = `incoming/${rid}.png`;
if (!fs.existsSync(reqFile)) fail('Request file not found');

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const LINKS = ['instagram', 'facebook', 'youtube', 'whatsapp', 'website', 'googleReview', 'linkedin'];

function safeUrl(v, k) {
  v = String(v || '').trim();
  if (!v) return '';
  if (k === 'whatsapp' && /^\+?[\d\s-]{8,16}$/.test(v)) return 'https://wa.me/' + v.replace(/\D/g, '');
  let u; try { u = new URL(v); } catch { fail(`${k}: invalid URL`); }
  if (u.protocol !== 'https:') fail(`${k}: only https:// links are allowed`);
  return u.href;
}
function cleanLinks(l = {}) {
  const out = {};
  for (const k of LINKS) { const u = safeUrl(l[k], k); if (u) out[k] = u; }
  out.other = (Array.isArray(l.other) ? l.other : []).slice(0, 5).map(o => ({
    label: String(o.label || '').trim().slice(0, 40), url: safeUrl(o.url, 'other')
  })).filter(o => o.url && o.label);
  return out;
}
function checkLogo() {
  if (!fs.existsSync(logoFile)) return null;
  const b = fs.readFileSync(logoFile);
  if (b.length > 2 * 1024 * 1024) fail('Logo too large (max 2 MB)');
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47 || b.readUInt32BE(4) !== 0x0d0a1a0a) fail('Logo is not a valid PNG');
  if (b.readUInt32BE(16) > 4000 || b.readUInt32BE(20) > 4000) fail('Logo dimensions too large (max 4000px)');
  return b;
}

function render(b) {
  const L = b.links, e = esc;
  const btn = (href, icon, text, cls = '') => href ? `<a class="btn ${cls}" href="${e(href)}" target="_blank" rel="noopener noreferrer"><i class="${icon}" aria-hidden="true"></i><span>${e(text)}</span></a>` : '';
  const social = [['instagram', 'fa-brands fa-instagram', 'Instagram'], ['facebook', 'fa-brands fa-facebook', 'Facebook'], ['youtube', 'fa-brands fa-youtube', 'YouTube'], ['linkedin', 'fa-brands fa-linkedin', 'LinkedIn']]
    .map(([k, i, t]) => btn(L[k], i, t)).join('');
  const other = (L.other || []).map(o => btn(o.url, 'fa-solid fa-link', o.label)).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(b.name)}</title><meta name="description" content="${e(b.description.slice(0, 150))}">
<link rel="icon" href="/${BASE}/${e(b.id)}/assets/logo.png">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css">
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;font:16px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:linear-gradient(160deg,#0f172a,#1e293b);color:#e2e8f0;display:flex;justify-content:center;padding:24px 16px}
main{width:100%;max-width:440px;text-align:center}
.logo{width:120px;height:120px;object-fit:contain;border-radius:24px;background:#fff;padding:8px;box-shadow:0 8px 30px #0006}
h1{margin:16px 0 6px;font-size:1.6rem}p.d{margin:0 0 20px;color:#cbd5e1;white-space:pre-line}
.btn{display:flex;align-items:center;justify-content:center;gap:10px;padding:14px 16px;margin:10px 0;border-radius:14px;background:#334155;color:#fff;text-decoration:none;font-weight:600}
.btn:hover,.btn:focus-visible{background:#475569;outline:2px solid #94a3b8}.btn.g{background:#f59e0b;color:#111;font-size:1.05rem}.btn.g:hover{background:#fbbf24}
.btn.w{background:#16a34a}.btn.w:hover{background:#22c55e}footer{margin-top:28px;font-size:.75rem;color:#64748b}
</style></head>
<body><main>
<img class="logo" src="/${BASE}/${e(b.id)}/assets/logo.png" alt="${e(b.name)} logo" width="120" height="120">
<h1>${e(b.name)}</h1><p class="d">${e(b.description)}</p>
${btn(L.googleReview, 'fa-solid fa-star', 'Leave a Google Review', 'g')}
${btn(L.website, 'fa-solid fa-globe', 'Website')}${btn(L.whatsapp, 'fa-brands fa-whatsapp', 'WhatsApp', 'w')}
${social}${other}
<footer>Powered by Modulos.in</footer></main></body></html>
`;
}

const req = JSON.parse(fs.readFileSync(reqFile, 'utf8'));
const db = JSON.parse(fs.readFileSync(DB, 'utf8'));
if (!Array.isArray(db.businesses)) fail('Database is malformed');
const id = String(req.id || '');
if (!/^[A-Za-z0-9-]{1,32}$/.test(id)) fail('Invalid QR ID');
const idx = db.businesses.findIndex(b => b.id === id);
const dir = path.join(BASE, id), now = new Date().toISOString();

if (req.op === 'delete') {
  if (idx < 0) fail('Business not found');
  db.businesses.splice(idx, 1);
  fs.rmSync(dir, { recursive: true, force: true });
} else if (req.op === 'create' || req.op === 'edit') {
  if (req.op === 'create' && idx >= 0) fail(`QR ID ${id} already exists`);
  if (req.op === 'edit' && idx < 0) fail('Business not found');
  const name = String(req.name || '').trim(), description = String(req.description || '').trim();
  if (!name || name.length > 80) fail('Business name is required (max 80 characters)');
  if (!description || description.length > 600) fail('Description is required (max 600 characters)');
  const logo = checkLogo();
  if (req.op === 'create' && !logo) fail('Logo PNG is required');
  const prev = idx >= 0 ? db.businesses[idx] : null;
  const rec = {
    id, name, description, logo: `${BASE}/${id}/assets/logo.png`, links: cleanLinks(req.links),
    status: prev?.status || 'active', createdAt: prev?.createdAt || now, updatedAt: now
  };
  fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
  if (logo) fs.writeFileSync(path.join(dir, 'assets/logo.png'), logo);
  fs.writeFileSync(path.join(dir, 'index.html'), render(rec));
  if (idx >= 0) db.businesses[idx] = rec; else db.businesses.push(rec);
} else fail('Unknown operation');

db.businesses.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
const text = JSON.stringify(db, null, 2) + '\n';
JSON.parse(text); // validate before writing
fs.writeFileSync(DB + '.tmp', text); fs.renameSync(DB + '.tmp', DB);
fs.rmSync(reqFile, { force: true }); fs.rmSync(logoFile, { force: true });
console.log(`OK: ${req.op} ${id}`);
