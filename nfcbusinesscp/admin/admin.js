'use strict';
const API = window.MODULOS_CONFIG.apiBase, BASE = 'nfcbusinesscp';
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let csrf = '', businesses = [], editing = null;

async function api(path, method = 'GET', body) {
  let r;
  try {
    r = await fetch(API + path, { method, credentials: 'include', headers: { 'content-type': 'application/json', 'x-csrf-token': csrf }, body: body ? JSON.stringify(body) : undefined });
  } catch { throw new Error('Cannot reach the server. Check your connection and the API address in config.js.'); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(d.error || 'Error ' + r.status), { status: r.status });
  return d;
}
const show = id => document.querySelectorAll('.view').forEach(v => v.hidden = v.id !== id);
const note = (el, t, ok) => { el.textContent = t || ''; el.className = 'msg ' + (ok ? 'ok' : 'err'); el.hidden = !t; };
const pageUrl = id => `${location.origin}/${BASE}/${id}`;

async function boot() {
  try {
    const s = await api('/api/state');
    if (!s.setup) return show('v-setup');
    try { const u = await api('/api/session'); csrf = u.csrf; enter(u.email); } catch { show('v-login'); }
  } catch (e) { $('#v-load').textContent = e.message; }
}
function enter(email) { $('#who').textContent = email; show('v-dash'); load(); }

function wire(form, fn) {
  $(form).addEventListener('submit', async ev => {
    ev.preventDefault();
    const msg = $(form + ' .msg'), btn = $(form + ' button:not([type=button])');
    btn.disabled = true; note(msg, '');
    try { await fn(); } catch (e) { note(msg, e.message); } finally { btn.disabled = false; }
  });
}
wire('#f-setup', async () => {
  await api('/api/setup', 'POST', { email: $('#s-email').value, password: $('#s-pw').value, setupKey: $('#s-key').value });
  $('#s-pw').value = $('#s-key').value = ''; show('v-login');
});
wire('#f-login', async () => {
  const u = await api('/api/login', 'POST', { email: $('#l-email').value, password: $('#l-pw').value });
  csrf = u.csrf; $('#l-pw').value = ''; enter(u.email);
});
wire('#f-forgot', async () => {
  await api('/api/forgot', 'POST', { setupKey: $('#r-key').value, newPassword: $('#r-pw').value });
  $('#r-key').value = $('#r-pw').value = ''; show('v-login'); note($('#f-login .msg'), 'Password updated. Please log in.', true);
});
$('#to-forgot').onclick = () => show('v-forgot');
$('#back-login').onclick = () => show('v-login');
$('#logout').onclick = async () => { try { await api('/api/logout', 'POST'); } catch {} csrf = ''; show('v-login'); };
function expired() { csrf = ''; show('v-login'); note($('#f-login .msg'), 'Session expired. Please log in again.'); }

async function load() {
  try {
    const d = await fetch(`/data/businesses.json?t=${Date.now()}`, { cache: 'no-store' }).then(r => r.json());
    businesses = d.businesses || [];
  } catch { note($('#dash-msg'), 'Could not load the business list.'); }
  draw();
}
function draw() {
  $('#st-total').textContent = $('#st-pages').textContent = businesses.length;
  const q = $('#search').value.trim().toLowerCase();
  const list = businesses.filter(b => !q || b.name.toLowerCase().includes(q) || b.id.toLowerCase().includes(q));
  $('#rows').innerHTML = list.length ? list.map(b => `<tr><td>${esc(b.name)}</td><td>${esc(b.id)}</td><td>${esc(b.status)}</td>
    <td><a href="${esc(pageUrl(b.id))}" target="_blank" rel="noopener">${esc(pageUrl(b.id))}</a></td>
    <td class="act"><a href="${esc(pageUrl(b.id))}" target="_blank" rel="noopener">View Page</a><button class="sec" data-a="qr" data-id="${esc(b.id)}">QR</button>
    <button class="sec" data-a="edit" data-id="${esc(b.id)}">Edit</button><button class="danger" data-a="del" data-id="${esc(b.id)}">Delete</button></td></tr>`).join('')
    : '<tr><td colspan="5">No businesses found.</td></tr>';
}
$('#search').oninput = draw;
$('#rows').onclick = ev => {
  const b = ev.target.closest('button[data-a]'); if (!b) return;
  const biz = businesses.find(x => x.id === b.dataset.id); if (!biz) return;
  if (b.dataset.a === 'edit') openForm(biz);
  if (b.dataset.a === 'qr') showQr(biz);
  if (b.dataset.a === 'del' && confirm(`Delete "${biz.name}" (ID ${biz.id})? This removes its page and logo permanently.`)) runOp({ op: 'delete', id: biz.id }, 'Deleting', 'Successfully Deleted');
};

const FIELDS = ['googleReview', 'instagram', 'facebook', 'youtube', 'whatsapp', 'website', 'linkedin'];
function openForm(b) {
  editing = b || null;
  $('#form-title').textContent = b ? 'Edit Business' : 'Add Business';
  $('#form-submit').textContent = b ? 'Save Changes' : 'Create Business';
  $('#b-id').value = b?.id || ''; $('#b-id').readOnly = !!b;
  $('#b-name').value = b?.name || ''; $('#b-desc').value = b?.description || '';
  $('#b-logo').value = ''; $('#b-logo').required = !b; $('#logo-opt').textContent = b ? '(leave empty to keep current)' : '*';
  FIELDS.forEach(k => $('#b-' + k).value = b?.links?.[k] || '');
  $('#b-other').value = (b?.links?.other || []).map(o => `${o.label} | ${o.url}`).join('\n');
  note($('#form-err'), ''); $('#dlg-form').showModal();
}
$('#add').onclick = () => openForm(null);
$('#form-cancel').onclick = () => $('#dlg-form').close();

const readB64 = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = () => rej(new Error('Could not read the logo file')); r.readAsDataURL(f); });
const httpsOk = v => { try { return new URL(v).protocol === 'https:'; } catch { return false; } };

$('#f-biz').addEventListener('submit', async ev => {
  ev.preventDefault();
  const err = $('#form-err');
  try {
    const id = $('#b-id').value.trim(), links = {};
    for (const k of FIELDS) {
      const v = $('#b-' + k).value.trim(); links[k] = v;
      if (v && !(k === 'whatsapp' && /^\+?[\d\s-]{8,16}$/.test(v)) && !httpsOk(v)) throw new Error(`${k}: please enter a valid https:// link`);
    }
    links.other = $('#b-other').value.split('\n').map(l => l.trim()).filter(Boolean).map(l => {
      const [label, ...u] = l.split('|'); const url = u.join('|').trim();
      if (!label.trim() || !httpsOk(url)) throw new Error(`Other link "${l}" must be "Label | https://url"`);
      return { label: label.trim(), url };
    });
    if (!editing && businesses.some(b => b.id === id)) throw new Error(`QR ID ${id} already exists. Choose a different ID.`);
    const f = $('#b-logo').files[0];
    if (f && (f.type !== 'image/png' || f.size > 2 * 1024 * 1024)) throw new Error('Logo must be a PNG up to 2 MB');
    const payload = { op: editing ? 'edit' : 'create', id, name: $('#b-name').value.trim(), description: $('#b-desc').value.trim(), links };
    if (f) payload.logo = await readB64(f);
    $('#dlg-form').close();
    runOp(payload, editing ? 'Saving changes' : 'Creating business', editing ? 'Successfully Updated' : 'Successfully Created');
  } catch (e) { note(err, e.message); }
});

const STAGES = ['Preparing', 'Uploading', 'Generating Page', 'Publishing'];
function stage(i, last, bad) {
  $('#steps').innerHTML = [...STAGES, last].map((s, n) =>
    `<li class="${bad === n ? 'bad' : n < i ? 'done' : n === i ? 'now' : ''}">${bad === n ? 'Failed - ' : ''}${esc(s)}</li>`).join('');
}
async function runOp(payload, title, last) {
  $('#prog-title').textContent = title + '...'; note($('#prog-err'), ''); $('#prog-close').hidden = true;
  if (!$('#dlg-prog').open) $('#dlg-prog').showModal();
  let cur = 0; stage(0, last);
  try {
    cur = 1; stage(1, last);
    const { requestId } = await api('/api/business', 'POST', payload);
    const t0 = Date.now();
    for (;;) {
      await sleep(4000);
      const s = await api('/api/status?id=' + requestId);
      if (s.state === 'generating') { cur = 2; stage(2, last); }
      else if (s.state === 'publishing') { cur = 3; stage(3, last); }
      else if (s.state === 'success') { stage(4, last); $('#prog-title').textContent = last; break; }
      else if (s.state === 'failed') throw new Error(s.detail);
      if (Date.now() - t0 > 600000) throw new Error('Timed out. Check the Actions tab on GitHub, then retry.');
    }
    await sleep(3000); await load();
  } catch (e) {
    if (e.status === 401) { $('#dlg-prog').close(); return expired(); }
    stage(cur, last, cur); $('#prog-title').textContent = 'Failed'; note($('#prog-err'), e.message + ' You can safely retry.');
  }
  $('#prog-close').hidden = false;
}
$('#prog-close').onclick = () => $('#dlg-prog').close();
$('#dlg-prog').addEventListener('cancel', ev => { if ($('#prog-close').hidden) ev.preventDefault(); });

let qrSvg = '', qrId = '';
function showQr(b) {
  const q = qrcode(0, 'M'); q.addData(pageUrl(b.id)); q.make();
  qrSvg = q.createSvgTag(8, 16); qrId = b.id;
  $('#qr-title').textContent = `QR - ${b.name}`; $('#qr-box').innerHTML = qrSvg; $('#qr-url').textContent = pageUrl(b.id);
  $('#dlg-qr').showModal();
}
$('#qr-close').onclick = () => $('#dlg-qr').close();
$('#qr-dl').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([qrSvg], { type: 'image/svg+xml' })); a.download = `qr-${qrId}.svg`; a.click(); URL.revokeObjectURL(a.href);
};
boot();
