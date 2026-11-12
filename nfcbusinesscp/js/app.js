import { auth, db, configured } from "./firebase.js";
import { ADMIN_EMAIL, DEFAULT_PUBLIC_BASE_URL } from "./firebase-config.js";
import {
  signInWithEmailAndPassword, signOut, sendPasswordResetEmail, sendEmailVerification,
  onAuthStateChanged, setPersistence, browserLocalPersistence, browserSessionPersistence
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { ref, get, set, update, onValue } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

/* ---------- helpers ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtDate = t => t ? new Date(t).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—";
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "business";
const isHttpUrl = v => { try { const u = new URL(v); return /^https?:$/.test(u.protocol) && u.hostname.includes("."); } catch { return false; } };

const FIELDS = ["name", "description", "logo", "whatsapp", "instagram", "facebook", "youtube", "googleReview", "location"];
const URL_FIELDS = ["logo", "instagram", "facebook", "youtube", "googleReview"];
const LABELS = { name: "Business name", description: "Description", logo: "Logo URL", whatsapp: "WhatsApp number", instagram: "Instagram URL", facebook: "Facebook URL", youtube: "YouTube URL", googleReview: "Google Review URL", location: "Location" };

const state = {
  user: null, businesses: {}, loaded: false, unsub: null, view: "dashboard", scanner: null,
  plans: {},
  settings: { publicBaseUrl: DEFAULT_PUBLIC_BASE_URL, defaultActive: true, idleMinutes: 30 }
};

/* ---------- UI primitives ---------- */
let loaderCount = 0;
function busy(on) { loaderCount = Math.max(0, loaderCount + (on ? 1 : -1)); $("#loader").hidden = loaderCount === 0; }
async function withLoader(fn) { busy(true); try { return await fn(); } finally { busy(false); } }

function toast(msg, type = "info", ms = 4200) {
  const t = document.createElement("div");
  t.className = "toast " + type; t.textContent = msg;
  $("#toasts").append(t);
  setTimeout(() => t.remove(), ms);
}

function openModal({ title, html, actions = [], wide = false, onClose }) {
  const back = document.createElement("div");
  back.className = "modal-back";
  back.innerHTML = `<div class="modal ${wide ? "wide" : ""}" role="dialog" aria-modal="true"><div class="modal-h"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="Close">✕</button></div><div class="modal-b"></div><div class="modal-f"></div></div>`;
  const body = $(".modal-b", back);
  body.innerHTML = html || "";
  const onKey = e => { if (e.key === "Escape") api.close(); };
  const api = {
    el: back, body, closed: false,
    close() { if (api.closed) return; api.closed = true; back.remove(); document.removeEventListener("keydown", onKey); onClose && onClose(); }
  };
  actions.forEach(a => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "btn " + (a.cls || ""); b.textContent = a.label;
    b.onclick = async () => {
      let r;
      if (a.onClick) { b.disabled = true; try { r = await a.onClick(api); } finally { b.disabled = false; } }
      if (!a.keepOpen && r !== false) api.close();
    };
    $(".modal-f", back).append(b);
  });
  back.addEventListener("mousedown", e => { if (e.target === back) api.close(); });
  $("[data-close]", back).onclick = () => api.close();
  document.addEventListener("keydown", onKey);
  $("#modalRoot").append(back);
  return api;
}

function confirmDialog({ title = "Please confirm", message, confirmLabel = "Confirm", danger = false }) {
  return new Promise(res => {
    let done = false; const fin = v => { if (!done) { done = true; res(v); } };
    openModal({
      title, html: `<p style="margin:0">${message}</p>`, onClose: () => fin(false),
      actions: [{ label: "Cancel", onClick: () => fin(false) }, { label: confirmLabel, cls: danger ? "danger" : "primary", onClick: () => fin(true) }]
    });
  });
}

async function copyText(t) {
  let ok = false;
  try { await navigator.clipboard.writeText(t); ok = true; } catch {
    const ta = document.createElement("textarea"); ta.value = t; ta.style.cssText = "position:fixed;opacity:0";
    document.body.append(ta); ta.select(); try { ok = document.execCommand("copy"); } catch { } ta.remove();
  }
  toast(ok ? "Copied to clipboard" : "Copy failed - please copy manually", ok ? "success" : "error");
}

function setMsg(el, text, type = "info") { el.textContent = text || ""; el.className = "msg " + type; }

function friendlyError(err) {
  const code = err?.code || "", m = String(err?.message || err || "");
  if (/auth\/(invalid-credential|wrong-password|user-not-found|invalid-email|missing-password)/.test(code)) return "Incorrect email or password.";
  if (code === "auth/too-many-requests") return "Too many attempts. Please wait a few minutes and try again.";
  if (code === "auth/network-request-failed") return "Network error. Check your internet connection.";
  if (code === "auth/user-disabled") return "This account has been disabled.";
  if (/permission[_ ]denied/i.test(m + code)) return "Permission denied by Firebase rules. Sign in with the verified admin account and publish database.rules.json.";
  return m || "Something went wrong.";
}

/* ---------- business model ---------- */
const businessUrl = id => state.settings.publicBaseUrl.replace(/\/*$/, "/") + id;
const initial = n => (String(n).trim()[0] || "?").toUpperCase();
const avatar = (b, lg) => `<span class="avatar ${lg ? "lg" : ""}">${esc(initial(b.name))}${isHttpUrl(b.logo) ? `<img src="${esc(b.logo)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ""}</span>`;

function normalize(raw) {
  const d = {};
  FIELDS.forEach(k => d[k] = String(raw?.[k] ?? "").trim());
  d.whatsapp = d.whatsapp.replace(/\D/g, "");
  return d;
}

function validateBusiness(d, strict = true) {
  const e = {};
  if (d.name.length < 2) e.name = "Business name is required (at least 2 characters).";
  else if (d.name.length > 100) e.name = "Business name must be 100 characters or fewer.";
  if (strict && d.description.length < 5) e.description = "Description is required (at least 5 characters).";
  if (d.description.length > 1000) e.description = "Description must be 1000 characters or fewer.";
  URL_FIELDS.forEach(k => {
    if (d[k] && !isHttpUrl(d[k])) e[k] = "Enter a valid URL starting with http:// or https://";
    else if (d[k].length > 500) e[k] = "URL is too long (max 500 characters).";
  });
  if (d.whatsapp && (d.whatsapp.length < 8 || d.whatsapp.length > 15)) e.whatsapp = "Enter a valid number with country code (8–15 digits), e.g. 919876543210.";
  if (d.location.length > 300) e.location = "Location must be 300 characters or fewer.";
  return e;
}

async function generateCardId() {
  for (let i = 0; i < 40; i++) {
    const len = i < 25 ? 5 : 6, min = 10 ** (len - 1), span = 9 * 10 ** (len - 1);
    const id = String(min + Math.floor(crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32 * span));
    if (state.businesses[id]) continue;
    const s = await get(ref(db, "status/" + id));
    if (!s.exists()) return id;
  }
  throw new Error("Could not generate a unique Card ID. Please try again.");
}

const writeBusiness = rec => update(ref(db), { [`businesses/${rec.cardId}`]: rec, [`status/${rec.cardId}`]: { active: rec.active } });

/* ---------- form ---------- */
function formHTML(p, b = {}, edit = false) {
  const f = (n, o = {}) => {
    const v = esc(b[n] ?? ""), id = `${p}_${n}`;
    const input = o.area ? `<textarea id="${id}" name="${n}" rows="3" maxlength="${o.max || 1000}" placeholder="${esc(o.ph || "")}">${v}</textarea>`
      : `<input id="${id}" name="${n}" type="${o.type || "text"}" maxlength="${o.max || 500}" placeholder="${esc(o.ph || "")}" value="${v}" ${o.mode ? `inputmode="${o.mode}"` : ""}>`;
    return `<div class="field ${o.full ? "full" : ""}"><label for="${id}">${LABELS[n]}${o.req ? ' <span class="req">*</span>' : ""}</label>${input}${o.hint ? `<small class="hint">${o.hint}</small>` : ""}<small class="err" data-err="${n}"></small></div>`;
  };
  const active = edit ? b.active !== false : state.settings.defaultActive;
  return `<div class="form-grid">
    ${edit ? `<div class="field full"><label>Card ID</label><input value="${esc(b.cardId)}" disabled></div>` : ""}
    ${f("name", { req: 1, max: 100, ph: "e.g. Sunrise Cafe", full: 1 })}
    ${f("description", { req: 1, area: 1, full: 1, ph: "Tell customers about the business" })}
    ${f("logo", { type: "url", ph: "https://example.com/logo.png" })}
    ${f("whatsapp", { type: "tel", mode: "tel", max: 20, ph: "919876543210", hint: "Country code + number, digits only." })}
    ${f("instagram", { type: "url", ph: "https://instagram.com/yourbusiness" })}
    ${f("facebook", { type: "url", ph: "https://facebook.com/yourbusiness" })}
    ${f("youtube", { type: "url", ph: "https://youtube.com/@yourbusiness" })}
    ${f("googleReview", { type: "url", ph: "https://g.page/r/.../review" })}
    ${f("location", { full: 1, max: 300, ph: "Address or Google Maps link" })}
    <div class="field full"><label class="check"><input type="checkbox" name="active" ${active ? "checked" : ""}> Business is active (public page visible)</label></div>
  </div>`;
}
function readForm(form) {
  const raw = {}; FIELDS.forEach(k => raw[k] = form.elements[k].value);
  const d = normalize(raw); d.active = form.elements.active.checked; return d;
}
function showErrors(form, errs) {
  $$("[data-err]", form).forEach(el => el.textContent = "");
  $$(".invalid", form).forEach(el => el.classList.remove("invalid"));
  const keys = Object.keys(errs);
  keys.forEach(k => { const el = $(`[data-err="${k}"]`, form); if (el) el.textContent = errs[k]; form.elements[k]?.classList.add("invalid"); });
  if (keys.length) form.elements[keys[0]]?.focus();
  return keys.length > 0;
}

function renderCreateForm() {
  const form = $("#createForm");
  form.innerHTML = formHTML("c") + `<div class="form-actions"><button class="btn primary" type="submit">Create business</button><button class="btn" type="reset" id="createReset">Clear form</button></div>`;
}

async function onCreate(ev) {
  ev.preventDefault();
  const form = ev.target, d = readForm(form);
  if (showErrors(form, validateBusiness(d))) return toast("Please fix the highlighted fields.", "error");
  const btn = $("button[type=submit]", form); btn.disabled = true;
  try {
    const rec = await withLoader(async () => {
      const id = await generateCardId(), now = Date.now();
      const r = { cardId: id, ...pickFields(d), active: d.active, createdAt: now, updatedAt: now };
      await writeBusiness(r); return r;
    });
    toast(`Business created. Card ID ${rec.cardId}`, "success");
    renderCreateForm();
    showQR(rec, "Business created successfully");
  } catch (err) { toast("Could not create business: " + friendlyError(err), "error", 7000); }
  finally { btn.disabled = false; }
}
const pickFields = d => Object.fromEntries(FIELDS.map(k => [k, d[k]]));

/* ---------- QR ---------- */
function qrCanvas(text, size = 480) {
  if (typeof QRCode === "undefined") throw new Error("QR library failed to load. Check your internet connection.");
  const holder = document.createElement("div");
  holder.style.cssText = "position:fixed;left:-9999px;top:0";
  document.body.append(holder);
  try {
    new QRCode(holder, { text, width: size, height: size, correctLevel: QRCode.CorrectLevel.M });
    const src = holder.querySelector("canvas"), pad = Math.round(size * 0.06);
    const out = document.createElement("canvas"); out.width = out.height = size + pad * 2;
    const c = out.getContext("2d"); c.fillStyle = "#fff"; c.fillRect(0, 0, out.width, out.height); c.drawImage(src, pad, pad);
    return out;
  } finally { holder.remove(); }
}
const qrDataURL = text => qrCanvas(text).toDataURL("image/png");

function downloadQR(b) {
  try {
    const a = document.createElement("a");
    a.href = qrDataURL(businessUrl(b.cardId)); a.download = `QR_${slug(b.name)}_${b.cardId}.png`;
    document.body.append(a); a.click(); a.remove();
  } catch (e) { toast(e.message, "error"); }
}
function printQR(b) {
  let data; try { data = qrDataURL(businessUrl(b.cardId)); } catch (e) { return toast(e.message, "error"); }
  const f = document.createElement("iframe");
  f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
  document.body.append(f);
  const w = f.contentWindow, d = w.document;
  d.open();
  d.write(`<!doctype html><html><head><title>QR ${esc(b.cardId)}</title><style>body{font-family:Arial,sans-serif;text-align:center;margin:0;padding:40px}img{width:380px;height:380px}h1{font-size:26px;margin:0 0 18px}p{color:#444;word-break:break-all;margin:10px 0}</style></head><body><h1>${esc(b.name)}</h1><img id="q" src="${data}"><p><b>Card ID: ${esc(b.cardId)}</b></p><p>${esc(businessUrl(b.cardId))}</p></body></html>`);
  d.close();
  const go = () => { w.focus(); w.print(); setTimeout(() => f.remove(), 30000); };
  const img = d.getElementById("q"); img.complete ? go() : (img.onload = go);
}

function showQR(b, title = "QR code") {
  const url = businessUrl(b.cardId);
  let img = ""; try { img = qrDataURL(url); } catch (e) { img = ""; toast(e.message, "error"); }
  const m = openModal({
    title, html: `<div class="detail-head">${avatar(b)}<div><b>${esc(b.name)}</b><br><small class="muted">Card ID ${esc(b.cardId)}</small></div></div>
      <div class="qr-box">${img ? `<img src="${img}" alt="QR code for ${esc(b.name)}">` : ""}</div>
      <div class="url-box"><input readonly value="${esc(url)}" aria-label="Business URL"><button class="btn" data-a="copy">Copy</button></div>
      <div class="btn-row"><button class="btn primary" data-a="dl">Download PNG</button><button class="btn" data-a="print">Print</button><button class="btn" data-a="share">Share</button><button class="btn" data-a="open">Open page</button></div>`,
    actions: [{ label: "Close" }]
  });
  m.el.addEventListener("click", e => { const a = e.target.closest("[data-a]")?.dataset.a; if (a) bizAction(a, b.cardId, m); });
}

/* ---------- share / actions ---------- */
async function shareBiz(b) {
  const url = businessUrl(b.cardId), text = `${b.name} - digital business card`;
  if (navigator.share) { try { await navigator.share({ title: b.name, text, url }); return; } catch (e) { if (e.name === "AbortError") return; } }
  const q = encodeURIComponent, links = [
    ["WhatsApp", `https://wa.me/?text=${q(text + " " + url)}`], ["Telegram", `https://t.me/share/url?url=${q(url)}&text=${q(text)}`],
    ["Email", `mailto:?subject=${q(b.name)}&body=${q(text + "\n" + url)}`], ["Facebook", `https://www.facebook.com/sharer/sharer.php?u=${q(url)}`],
    ["X / Twitter", `https://twitter.com/intent/tweet?text=${q(text)}&url=${q(url)}`]];
  const m = openModal({
    title: "Share business", html: `<div class="url-box" style="margin-top:0"><input readonly value="${esc(url)}"><button class="btn" data-a="copy">Copy</button></div>
    <div class="btn-row">${links.map(([n, h]) => `<a class="btn" target="_blank" rel="noopener noreferrer" href="${esc(h)}">${n}</a>`).join("")}</div>`, actions: [{ label: "Close" }]
  });
  m.el.addEventListener("click", e => { if (e.target.closest("[data-a=copy]")) copyText(url); });
}

async function bizAction(act, id, ctx) {
  const b = state.businesses[id]; if (!b) return toast("That business no longer exists.", "error");
  switch (act) {
    case "view": return showDetails(id);
    case "edit": ctx?.close(); return editBusiness(id);
    case "qr": return showQR(b);
    case "copy": return copyText(businessUrl(id));
    case "share": return shareBiz(b);
    case "open": return void window.open(businessUrl(id), "_blank", "noopener");
    case "dl": return downloadQR(b);
    case "print": return printQR(b);
    case "toggle": return toggleActive(id, !b.active);
    case "delete": ctx?.close(); return deleteBusiness(id);
  }
}

async function toggleActive(id, active) {
  try {
    await withLoader(() => update(ref(db), { [`businesses/${id}/active`]: active, [`businesses/${id}/updatedAt`]: Date.now(), [`status/${id}/active`]: active }));
    toast(`Business ${active ? "activated" : "deactivated"}.`, "success");
  } catch (e) { toast(friendlyError(e), "error"); renderList(); }
}

async function deleteBusiness(id) {
  const b = state.businesses[id]; if (!b) return;
  const ok = await confirmDialog({ title: "Delete business", danger: true, confirmLabel: "Delete permanently", message: `Delete <b>${esc(b.name)}</b> (Card ID ${esc(id)})? Its public page and QR code will stop working. This cannot be undone.` });
  if (!ok) return;
  try { await withLoader(() => update(ref(db), { [`businesses/${id}`]: null, [`status/${id}`]: null })); toast("Business deleted.", "success"); }
  catch (e) { toast("Delete failed: " + friendlyError(e), "error"); }
}

function editBusiness(id) {
  const b = state.businesses[id]; if (!b) return;
  const m = openModal({
    title: "Edit business", wide: true, html: `<form id="editForm" novalidate>${formHTML("e", b, true)}</form>`,
    actions: [{ label: "Cancel" }, { label: "Save changes", cls: "primary", onClick: save }]
  });
  const form = $("#editForm", m.el);
  form.addEventListener("submit", e => { e.preventDefault(); save().then(r => r !== false && m.close()); });
  async function save() {
    const d = readForm(form);
    if (showErrors(form, validateBusiness(d))) { toast("Please fix the highlighted fields.", "error"); return false; }
    try { await withLoader(() => writeBusiness({ ...b, ...pickFields(d), active: d.active, updatedAt: Date.now() })); toast("Business updated.", "success"); }
    catch (e) { toast("Update failed: " + friendlyError(e), "error"); return false; }
  }
}

function showDetails(id) {
  const b = state.businesses[id]; if (!b) return;
  const link = (u, t) => isHttpUrl(u) ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(t || u)}</a>` : "—";
  const loc = b.location ? (isHttpUrl(b.location) ? link(b.location) : `${esc(b.location)} · <a target="_blank" rel="noopener noreferrer" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.location)}">Map</a>`) : "—";
  let img = ""; try { img = qrDataURL(businessUrl(id)); } catch { }
  const rows = [["Card ID", esc(b.cardId)], ["Status", `<span class="badge ${b.active ? "ok" : "off"}">${b.active ? "Active" : "Inactive"}</span>`], ["Description", esc(b.description) || "—"],
  ["WhatsApp", b.whatsapp ? link("https://wa.me/" + b.whatsapp, "+" + b.whatsapp) : "—"], ["Instagram", link(b.instagram)], ["Facebook", link(b.facebook)], ["YouTube", link(b.youtube)],
  ["Google Review", link(b.googleReview)], ["Location", loc], ["Logo URL", link(b.logo)], ["Public URL", link(businessUrl(id))], ["Created", fmtDate(b.createdAt)], ["Updated", fmtDate(b.updatedAt)]];
  const m = openModal({
    title: "Business details", wide: true,
    html: `<div class="detail-head">${avatar(b, true)}<h4>${esc(b.name)}</h4></div>
    <div class="detail-grid"><dl class="dl">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
    <div class="qr-box">${img ? `<img src="${img}" alt="QR code">` : ""}</div></div>
    <div class="btn-row"><button class="btn" data-a="copy">Copy URL</button><button class="btn" data-a="share">Share</button><button class="btn" data-a="open">Open page</button><button class="btn" data-a="dl">Download QR</button><button class="btn" data-a="print">Print QR</button></div>`,
    actions: [{ label: "Delete", cls: "danger", keepOpen: true, onClick: ctx => bizAction("delete", id, ctx) }, { label: "Edit", cls: "primary", keepOpen: true, onClick: ctx => bizAction("edit", id, ctx) }, { label: "Close" }]
  });
  m.el.addEventListener("click", e => { const a = e.target.closest("[data-a]")?.dataset.a; if (a) bizAction(a, id, m); });
}

/* ---------- render: dashboard & list ---------- */
const bizList = () => Object.values(state.businesses);
function renderDashboard() {
  const l = bizList(), active = l.filter(b => b.active).length;
  $("#statTotal").textContent = l.length; $("#statActive").textContent = active;
  $("#statInactive").textContent = l.length - active; $("#statCards").textContent = l.length;
  const recent = [...l].sort((a, b) => b.createdAt - a.createdAt).slice(0, 6);
  $("#recentList").innerHTML = recent.length ? recent.map(b => `<div class="item" data-id="${esc(b.cardId)}">${avatar(b)}<div class="meta"><b>${esc(b.name)}</b><small>Card ID ${esc(b.cardId)} · ${fmtDate(b.createdAt)}</small></div><span class="badge ${b.active ? "ok" : "off"}">${b.active ? "Active" : "Inactive"}</span></div>`).join("")
    : `<div class="empty">No businesses yet. Create your first one to get started.</div>`;
}

function renderList() {
  const q = $("#searchInput").value.trim().toLowerCase(), st = $("#statusFilter").value, so = $("#sortSelect").value;
  let l = bizList().filter(b => (st === "all" || (st === "active") === b.active) && (!q || b.name.toLowerCase().includes(q) || b.cardId.includes(q)));
  const sorters = { newest: (a, b) => b.createdAt - a.createdAt, oldest: (a, b) => a.createdAt - b.createdAt, az: (a, b) => a.name.localeCompare(b.name), za: (a, b) => b.name.localeCompare(a.name), id: (a, b) => Number(a.cardId) - Number(b.cardId) };
  l.sort(sorters[so]);
  $("#listCount").textContent = `${l.length} of ${bizList().length} businesses`;
  $("#listBody").innerHTML = l.length ? l.map(b => `<tr data-id="${esc(b.cardId)}">
    <td data-label="Card ID"><code>${esc(b.cardId)}</code></td>
    <td data-label="Business"><div class="biz">${avatar(b)}<div><b>${esc(b.name)}</b><small>${esc(b.location).slice(0, 60)}</small></div></div></td>
    <td data-label="Status"><div class="status-cell"><label class="switch" title="Activate / deactivate"><input type="checkbox" data-act="toggle" ${b.active ? "checked" : ""}><span></span></label><span class="badge ${b.active ? "ok" : "off"}">${b.active ? "Active" : "Inactive"}</span></div></td>
    <td data-label="Created">${fmtDate(b.createdAt)}</td>
    <td class="actions"><button class="btn sm" data-act="view">View</button><button class="btn sm" data-act="edit">Edit</button><button class="btn sm" data-act="qr">QR</button><button class="btn sm" data-act="copy">Copy URL</button><button class="btn sm" data-act="share">Share</button><button class="btn sm danger" data-act="delete">Delete</button></td></tr>`).join("")
    : `<tr><td colspan="5"><div class="empty">${bizList().length ? "No businesses match your search or filters." : "No businesses yet."}</div></td></tr>`;
}
const renderAll = () => { renderDashboard(); renderList(); };

/* ---------- scanner ---------- */
function extractCardId(text) {
  const t = String(text).trim();
  if (/^\d{4,9}$/.test(t)) return t;
  try {
    const u = new URL(t), q = u.searchParams.get("id");
    if (q && /^\d{4,9}$/.test(q)) return q;
    const m = u.pathname.match(/\/(\d{4,9})\/?$/); if (m) return m[1];
  } catch { }
  return null;
}
function handleScanned(text) {
  const out = $("#scanResult"), id = extractCardId(text), b = id && state.businesses[id];
  const urlOk = isHttpUrl(String(text).trim());
  if (b) {
    out.innerHTML = `<div class="result-box"><div class="detail-head">${avatar(b)}<div><b>${esc(b.name)}</b><br><small class="muted">Card ID ${esc(id)} · <span class="badge ${b.active ? "ok" : "off"}">${b.active ? "Active" : "Inactive"}</span></small></div></div>
      <div class="btn-row"><button class="btn primary" data-a="open">Open business page</button><button class="btn" data-a="view">View details</button><button class="btn" data-a="edit">Edit</button></div></div>`;
    $$("[data-a]", out).forEach(el => el.onclick = () => bizAction(el.dataset.a, id));
    toast(`Found: ${b.name}`, "success");
  } else {
    out.innerHTML = `<div class="result-box"><p style="margin:0"><b>${id ? `No business with Card ID ${esc(id)} exists in this dashboard.` : "No Card ID found in that code."}</b></p><p class="muted" style="word-break:break-all">Scanned: ${esc(String(text).slice(0, 300))}</p>${urlOk ? `<button class="btn" id="openRaw">Open scanned link</button>` : ""}</div>`;
    $("#openRaw")?.addEventListener("click", () => window.open(String(text).trim(), "_blank", "noopener"));
  }
}
async function startScanner() {
  if (typeof Html5Qrcode === "undefined") return toast("Scanner library failed to load. Check your internet connection.", "error");
  if (state.scanner) return;
  const s = new Html5Qrcode("qrReader"); state.scanner = s;
  try {
    await s.start({ facingMode: "environment" }, { fps: 10, qrbox: (w, h) => { const z = Math.floor(Math.min(w, h) * .7); return { width: z, height: z }; } },
      txt => { stopScanner(); handleScanned(txt); }, () => { });
    $("#scanStart").disabled = true; $("#scanStop").disabled = false;
  } catch (err) { state.scanner = null; toast("Could not start the camera: " + (err?.message || err) + " Allow camera access, or use manual input / image scan.", "error", 7500); }
}
async function stopScanner() {
  const s = state.scanner; if (!s) return; state.scanner = null;
  try { await s.stop(); } catch { } try { s.clear(); } catch { }
  $("#scanStart").disabled = false; $("#scanStop").disabled = true;
}
async function scanImage(file) {
  if (!file) return;
  if (typeof Html5Qrcode === "undefined") return toast("Scanner library failed to load.", "error");
  await stopScanner();
  const s = new Html5Qrcode("qrReader");
  try { handleScanned(await s.scanFile(file, false)); } catch { toast("No QR code could be read from that image.", "error"); }
  finally { try { s.clear(); } catch { } }
}

/* ---------- import / export / backup ---------- */
function downloadJSON(obj, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" })); a.download = name;
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function exportData(kind) {
  const list = bizList().sort((a, b) => a.createdAt - b.createdAt);
  const payload = { app: "MODULOS_NFC_BUSINESS_DASHBOARD", version: 1, type: kind, exportedAt: new Date().toISOString(), count: list.length, businesses: list };
  if (kind === "backup") payload.settings = state.settings;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  downloadJSON(payload, kind === "backup" ? `modulos-backup-${stamp}.json` : `modulos-businesses-${stamp}.json`);
  toast(`${kind === "backup" ? "Backup" : "Export"} downloaded (${list.length} businesses).`, "success");
}

function analyzeImport(text) {
  let data; try { data = JSON.parse(text); } catch { throw new Error("The file is not valid JSON."); }
  let arr = Array.isArray(data) ? data : Array.isArray(data?.businesses) ? data.businesses
    : (data?.businesses && typeof data.businesses === "object") ? Object.entries(data.businesses).map(([k, v]) => ({ cardId: k, ...v })) : null;
  if (!arr) throw new Error("No businesses found. Expected an array or a { businesses: [...] } object.");
  if (arr.length > 5000) throw new Error("File contains too many records (max 5000).");
  const seen = new Set(), valid = [], invalid = [], dupFile = [], dupExisting = [];
  arr.forEach((raw, i) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return invalid.push({ row: i + 1, why: "Not a business object" });
    const cardId = String(raw.cardId ?? "").trim(), d = normalize(raw), errs = validateBusiness(d, false);
    if (!/^\d{4,9}$/.test(cardId)) errs.cardId = "Card ID must be 4–9 digits";
    if (Object.keys(errs).length) return invalid.push({ row: i + 1, id: cardId, why: Object.values(errs).join(" ") });
    if (seen.has(cardId)) return dupFile.push({ row: i + 1, id: cardId });
    seen.add(cardId);
    const rec = { cardId, ...pickFields(d), active: typeof raw.active === "boolean" ? raw.active : true, createdAt: Number.isFinite(raw.createdAt) ? raw.createdAt : Date.now(), updatedAt: Date.now() };
    valid.push(rec); if (state.businesses[cardId]) dupExisting.push(rec);
  });
  const settings = data?.settings && typeof data.settings === "object" ? data.settings : null;
  return { total: arr.length, valid, invalid, dupFile, dupExisting, settings };
}

function bindImport(inputId, reportId, getMode) {
  const input = $("#" + inputId), report = $("#" + reportId);
  input.addEventListener("change", async () => {
    const file = input.files[0]; input.value = ""; if (!file) return;
    report.innerHTML = "";
    if (file.size > 20 * 1024 * 1024) return toast("File too large (max 20 MB).", "error");
    try {
      const plan = analyzeImport(await file.text()), mode = getMode();
      const willWrite = mode === "skip" ? plan.valid.filter(r => !state.businesses[r.cardId]).length : plan.valid.length;
      const keep = new Set(plan.valid.map(r => r.cardId));
      const removed = mode === "replace" ? Object.keys(state.businesses).filter(id => !keep.has(id)).length : 0;
      const list = (arr, f) => arr.length ? `<ul>${arr.slice(0, 20).map(f).join("")}${arr.length > 20 ? `<li>…and ${arr.length - 20} more</li>` : ""}</ul>` : "";
      report.innerHTML = `<div class="report"><b>${esc(file.name)}</b> - ${plan.total} records<div style="margin-top:8px">
        <span class="badge ok pill">${plan.valid.length} valid</span><span class="badge ${plan.invalid.length ? "off" : "ok"} pill">${plan.invalid.length} invalid</span>
        <span class="badge ${plan.dupExisting.length ? "warn" : "ok"} pill">${plan.dupExisting.length} duplicate Card IDs in database</span><span class="badge ${plan.dupFile.length ? "warn" : "ok"} pill">${plan.dupFile.length} repeated inside file</span></div>
        ${list(plan.invalid, x => `<li>Row ${x.row}${x.id ? ` (ID ${esc(x.id)})` : ""}: ${esc(x.why)}</li>`)}${list(plan.dupFile, x => `<li>Row ${x.row}: Card ID ${esc(x.id)} repeated - ignored</li>`)}
        ${list(plan.dupExisting, x => `<li>Card ID ${esc(x.cardId)} (${esc(x.name)}) already exists - ${mode === "skip" ? "will be skipped" : "will be overwritten"}</li>`)}
        <p style="margin:12px 0 0">${mode === "replace" ? `Restore will write <b>${willWrite}</b> businesses and delete <b>${removed}</b> not in the backup.` : `<b>${willWrite}</b> businesses will be written.`}</p>
        <div class="btn-row"><button class="btn primary" data-go-import ${willWrite || removed ? "" : "disabled"}>${mode === "replace" ? "Restore now" : "Import now"}</button><button class="btn" data-cancel-import>Cancel</button></div></div>`;
      $("[data-cancel-import]", report).onclick = () => report.innerHTML = "";
      $("[data-go-import]", report).onclick = async () => {
        if (mode === "replace" && !await confirmDialog({ title: "Restore backup", danger: true, confirmLabel: "Replace everything", message: `This replaces all current data: <b>${willWrite}</b> businesses will be written and <b>${removed}</b> existing ones deleted.` })) return;
        try {
          await withLoader(() => applyImport(plan, mode));
          report.innerHTML = ""; toast(mode === "replace" ? "Backup restored." : `Import complete: ${willWrite} businesses written.`, "success", 6000);
        } catch (e) { toast("Import failed: " + friendlyError(e), "error", 8000); }
      };
    } catch (e) { toast(e.message, "error", 6000); }
  });
}

async function applyImport(plan, mode) {
  const ops = [], toWrite = mode === "skip" ? plan.valid.filter(r => !state.businesses[r.cardId]) : plan.valid;
  toWrite.forEach(r => ops.push([`businesses/${r.cardId}`, r], [`status/${r.cardId}`, { active: r.active }]));
  if (mode === "replace") {
    const keep = new Set(plan.valid.map(r => r.cardId));
    Object.keys(state.businesses).forEach(id => { if (!keep.has(id)) ops.push([`businesses/${id}`, null], [`status/${id}`, null]); });
  }
  for (let i = 0; i < ops.length; i += 200) await update(ref(db), Object.fromEntries(ops.slice(i, i + 200)));
  if (mode === "replace" && plan.settings) {
    const s = sanitizeSettings({ ...state.settings, ...plan.settings });
    if (s) { await set(ref(db, "settings"), s); state.settings = s; renderSettings(); }
  }
}

/* ---------- settings ---------- */
function sanitizeSettings(s) {
  const base = String(s.publicBaseUrl || "").trim(), idle = Number(s.idleMinutes);
  if (!isHttpUrl(base) || !(idle >= 5 && idle <= 240)) return null;
  return { publicBaseUrl: base.replace(/\/*$/, "/"), defaultActive: !!s.defaultActive, idleMinutes: Math.round(idle) };
}
async function loadSettings() {
  try {
    const snap = await get(ref(db, "settings"));
    if (snap.exists()) { const s = sanitizeSettings({ ...state.settings, ...snap.val() }); if (s) state.settings = s; }
  } catch (e) { toast("Could not load settings: " + friendlyError(e), "error"); }
}
function renderSettings() {
  const u = state.user; if (!u) return;
  $("#accountInfo").innerHTML = [["Email", esc(u.email)], ["Role", "Administrator"],
  ["Email verified", `<span class="badge ${u.emailVerified ? "ok" : "off"}">${u.emailVerified ? "Verified" : "Not verified"}</span>`],
  ["Account created", fmtDate(Date.parse(u.metadata.creationTime))], ["Last sign-in", fmtDate(Date.parse(u.metadata.lastSignInTime))]]
    .map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
  $("#setVerify").hidden = u.emailVerified;
  $("#setBaseUrl").value = state.settings.publicBaseUrl; $("#setIdle").value = state.settings.idleMinutes; $("#setDefaultActive").checked = state.settings.defaultActive;
}
async function onSaveSettings(ev) {
  ev.preventDefault();
  const url = $("#setBaseUrl").value.trim(), idle = Number($("#setIdle").value);
  $("#errBaseUrl").textContent = isHttpUrl(url) ? "" : "Enter a valid http(s) URL.";
  $("#errIdle").textContent = idle >= 5 && idle <= 240 ? "" : "Enter a value between 5 and 240.";
  if ($("#errBaseUrl").textContent || $("#errIdle").textContent) return;
  const s = sanitizeSettings({ publicBaseUrl: url, idleMinutes: idle, defaultActive: $("#setDefaultActive").checked });
  try { await withLoader(() => set(ref(db, "settings"), s)); state.settings = s; renderSettings(); resetIdle(); renderCreateForm(); toast("Settings saved.", "success"); }
  catch (e) { toast("Could not save settings: " + friendlyError(e), "error"); }
}

/* ---------- navigation ---------- */
const TITLES = { dashboard: "Dashboard", create: "Create Business", list: "All Businesses", scanner: "QR Scanner", data: "Import / Export", settings: "Settings" };
function showView(name) {
  if (state.view === "scanner" && name !== "scanner") stopScanner();
  state.view = name;
  $$(".view").forEach(v => v.hidden = v.id !== "view-" + name);
  $$(".nav-item[data-view]").forEach(n => n.classList.toggle("active", n.dataset.view === name));
  $("#viewTitle").textContent = TITLES[name];
  if (name === "settings") renderSettings();
  if (name === "list") renderList();
  closeSidebar(); window.scrollTo(0, 0);
}
const openSidebar = () => { $("#sidebar").classList.add("open"); $("#overlay").classList.add("show"); };
const closeSidebar = () => { $("#sidebar").classList.remove("open"); $("#overlay").classList.remove("show"); };

/* ---------- auth & session ---------- */
function showAuth(pane) {
  $("#appShell").hidden = true; $("#authScreen").hidden = false;
  $("#loginForm").hidden = pane !== "login"; $("#forgotForm").hidden = pane !== "forgot"; $("#verifyPane").hidden = pane !== "verify";
}
let idleT, lastReset = 0;
function resetIdle(force) {
  if (!state.user) return;
  const now = Date.now(); if (!force && now - lastReset < 1000) return; lastReset = now;
  clearTimeout(idleT); idleT = setTimeout(() => { toast("Signed out due to inactivity.", "info", 6000); logout(); }, state.settings.idleMinutes * 60000);
}
["click", "keydown", "touchstart", "mousemove", "scroll"].forEach(ev => window.addEventListener(ev, () => resetIdle(), { passive: true }));

async function handleUser(user) {
  if (!user) { stopApp(); showAuth("login"); return; }
  if ((user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    await signOut(auth); showAuth("login"); setMsg($("#loginMsg"), "Access denied: this dashboard is only for the authorized administrator.", "error"); return;
  }
  try { await user.reload(); } catch { }
  if (!auth.currentUser) return;
  if (!user.emailVerified) { $("#verifyEmail").textContent = user.email; showAuth("verify"); return; }
  try { await user.getIdToken(true); } catch { }
  if (state.user?.uid === user.uid && state.unsub) return;
  startApp(user);
}

async function startApp(user) {
  state.user = user; $("#authScreen").hidden = true; $("#appShell").hidden = false;
  $("#sideUser").textContent = user.email; $("#topUser").textContent = user.email;
  busy(true);
  try { await loadSettings(); } finally { busy(false); }
  renderCreateForm(); renderSettings(); resetIdle(true);
  state.unsub = onValue(ref(db, "businesses"), snap => { state.businesses = snap.val() || {}; state.loaded = true; renderAll(); },
    err => toast("Could not load businesses: " + friendlyError(err), "error", 8000));
  showView("dashboard");
}

function stopApp() {
  clearTimeout(idleT); stopScanner();
  if (state.unsub) { state.unsub(); state.unsub = null; }
  state.user = null; state.businesses = {}; state.loaded = false;
  state.settings = { publicBaseUrl: DEFAULT_PUBLIC_BASE_URL, defaultActive: true, idleMinutes: 30 };
  $("#modalRoot").innerHTML = ""; $("#listBody").innerHTML = ""; $("#recentList").innerHTML = "";
  ["statTotal", "statActive", "statInactive", "statCards"].forEach(i => $("#" + i).textContent = "…");
  $("#loginPassword").value = ""; $("#scanResult").innerHTML = ""; $("#importReport").innerHTML = ""; $("#restoreReport").innerHTML = "";
  $("#createForm").innerHTML = "";
}

async function logout() { try { await signOut(auth); } catch (e) { toast(friendlyError(e), "error"); } }

async function onLogin(ev) {
  ev.preventDefault();
  const email = $("#loginEmail").value.trim(), pw = $("#loginPassword").value, msg = $("#loginMsg");
  if (!email || !pw) return setMsg(msg, "Enter your email and password.", "error");
  setMsg(msg, ""); busy(true);
  try {
    await setPersistence(auth, $("#rememberMe").checked ? browserLocalPersistence : browserSessionPersistence);
    await signInWithEmailAndPassword(auth, email, pw);
  } catch (e) { setMsg(msg, friendlyError(e), "error"); }
  finally { busy(false); }
}
async function onForgot(ev) {
  ev.preventDefault();
  const email = $("#forgotEmail").value.trim(), msg = $("#forgotMsg");
  if (!email) return setMsg(msg, "Enter the admin email.", "error");
  busy(true);
  try {
    if (email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) await sendPasswordResetEmail(auth, email);
    setMsg(msg, "If this email belongs to the administrator account, a password reset link has been sent. Check your inbox and spam folder.", "success");
  } catch (e) { setMsg(msg, friendlyError(e), "error"); }
  finally { busy(false); }
}

let verifyCooldown = 0;
async function sendVerification(btn, msgEl) {
  const u = auth.currentUser; if (!u) return;
  if (Date.now() < verifyCooldown) return toast("Please wait a minute before requesting another email.", "info");
  busy(true);
  try { await sendEmailVerification(u); verifyCooldown = Date.now() + 60000; const t = "Verification email sent to " + u.email + ". Open the link, then continue."; msgEl ? setMsg(msgEl, t, "success") : toast(t, "success", 6000); }
  catch (e) { msgEl ? setMsg(msgEl, friendlyError(e), "error") : toast(friendlyError(e), "error"); }
  finally { busy(false); }
}
async function checkVerified() {
  const u = auth.currentUser; if (!u) return;
  busy(true);
  try {
    await u.reload();
    if (u.emailVerified) { await u.getIdToken(true); await startApp(u); } else setMsg($("#verifyMsg"), "Your email is not verified yet. Open the link in the verification email first.", "error");
  } catch (e) { setMsg($("#verifyMsg"), friendlyError(e), "error"); }
  finally { busy(false); }
}

/* ---------- init ---------- */
function bindStatic() {
  $("#loginForm").addEventListener("submit", onLogin);
  $("#forgotForm").addEventListener("submit", onForgot);
  $("#toForgot").addEventListener("click", e => { e.preventDefault(); $("#forgotEmail").value = $("#loginEmail").value; setMsg($("#forgotMsg"), ""); showAuth("forgot"); });
  $$(".toLogin").forEach(a => a.addEventListener("click", e => { e.preventDefault(); showAuth("login"); }));
  $$("[data-toggle]").forEach(b => b.addEventListener("click", () => { const i = $("#" + b.dataset.toggle); i.type = i.type === "password" ? "text" : "password"; b.textContent = i.type === "password" ? "Show" : "Hide"; }));
  $("#sendVerifyBtn").addEventListener("click", () => sendVerification(null, $("#verifyMsg")));
  $("#checkVerifyBtn").addEventListener("click", checkVerified);
  $("#verifyLogout").addEventListener("click", e => { e.preventDefault(); logout(); });

  $("#nav").addEventListener("click", e => { const n = e.target.closest(".nav-item"); if (n?.dataset.view) showView(n.dataset.view); });
  $("#navLogout").addEventListener("click", logout); $("#setLogout").addEventListener("click", logout);
  $("#menuBtn").addEventListener("click", openSidebar); $("#overlay").addEventListener("click", closeSidebar);
  document.addEventListener("click", e => { const g = e.target.closest("[data-go]"); if (g) showView(g.dataset.go); });

  $("#createForm").addEventListener("submit", onCreate);
  $("#createForm").addEventListener("reset", () => setTimeout(() => showErrors($("#createForm"), {}), 0));
  $("#recentList").addEventListener("click", e => { const i = e.target.closest(".item"); if (i) showDetails(i.dataset.id); });

  ["searchInput", "statusFilter", "sortSelect"].forEach(id => $("#" + id).addEventListener("input", renderList));
  $("#listBody").addEventListener("click", e => { const b = e.target.closest("button[data-act]"); if (b) bizAction(b.dataset.act, b.closest("tr").dataset.id); });
  $("#listBody").addEventListener("change", e => { const t = e.target.closest("input[data-act=toggle]"); if (t) toggleActive(t.closest("tr").dataset.id, t.checked); });

  $("#scanStart").addEventListener("click", startScanner); $("#scanStop").addEventListener("click", stopScanner);
  $("#scanFile").addEventListener("change", e => { scanImage(e.target.files[0]); e.target.value = ""; });
  $("#manualForm").addEventListener("submit", e => { e.preventDefault(); const v = $("#manualInput").value.trim(); if (!v) return toast("Enter a URL or Card ID.", "error"); handleScanned(v); });

  $("#exportBtn").addEventListener("click", () => exportData("export")); $("#backupBtn").addEventListener("click", () => exportData("backup"));
  bindImport("importFile", "importReport", () => $("#importMode").value); bindImport("restoreFile", "restoreReport", () => "replace");

  $("#settingsForm").addEventListener("submit", onSaveSettings);
  $("#setResetPw").addEventListener("click", async () => { busy(true); try { await sendPasswordResetEmail(auth, state.user.email); toast("Password reset email sent to " + state.user.email, "success", 6000); } catch (e) { toast(friendlyError(e), "error"); } finally { busy(false); } });
  $("#setVerify").addEventListener("click", () => sendVerification());
}

function init() {
  bindStatic();
  if (!configured) { $("#loader").hidden = true; $("#configNotice").hidden = false; return; }
  busy(true); let first = true;
  onAuthStateChanged(auth, async user => {
    try { await handleUser(user); } finally { if (first) { first = false; busy(false); } }
  });
}
init();
