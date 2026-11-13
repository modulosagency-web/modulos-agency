const API_BASE_URL = "https://REPLACE_WITH_YOUR_WORKER.workers.dev";
const $ = id => document.getElementById(id);
let businesses = [], editingId = null, existingLogo = null, sessionToken = sessionStorage.getItem("modulos_admin_session") || "";
const fields = ["googleReview","instagram","facebook","youtube","whatsapp","website","linkedin"];
const authView=$("auth-view"), dashboard=$("dashboard-view");
function message(el,text,kind=""){el.textContent=text;el.className=`notice ${kind}`;}
function apiConfigured(){return !API_BASE_URL.includes("REPLACE_WITH");}
function cleanUrl(id){return `${location.origin}/nfcbusinesscp/${encodeURIComponent(id)}`;}
function setProgress(percent,text){$("progress").classList.remove("hidden");$("progress-bar").style.width=`${percent}%`;message($("operation-status"),text);}
function hideProgress(){setTimeout(()=>$ ("progress").classList.add("hidden"),900);}
async function request(path,payload,auth=false){if(!apiConfigured())throw new Error("Set API_BASE_URL in public/admin/app.js after deploying the Cloudflare Worker.");const headers={"Content-Type":"application/json"};if(auth){if(!sessionToken)throw new Error("Please sign in again.");headers.Authorization=`Bearer ${sessionToken}`;}const r=await fetch(`${API_BASE_URL}${path}`,{method:payload?"POST":"GET",headers,body:payload?JSON.stringify(payload):undefined});const d=await r.json().catch(()=>({error:"Invalid server response."}));if(!r.ok)throw new Error(d.error||`Request failed (${r.status})`);return d;}
function showAuth(mode){authView.classList.remove("hidden");dashboard.classList.add("hidden");$("setup-form").classList.toggle("hidden",mode!=="setup");$("login-form").classList.toggle("hidden",mode!=="login");$("forgot").classList.toggle("hidden",mode!=="login");$("reset-form").classList.add("hidden");$("auth-intro").textContent=mode==="setup"?"First visit detected. Create your administrator login once.":"Sign in to manage your business pages.";}
async function boot(){try{const d=await request("/api/setup-status");if(!d.configured){showAuth("setup");return;}if(sessionToken){try{const me=await request("/api/me",null,true);showDashboard(me.email);await loadBusinesses();return;}catch{sessionToken="";sessionStorage.removeItem("modulos_admin_session");}}showAuth("login");}catch(e){showAuth("login");message($("auth-message"),e.message,"error");}}
function showDashboard(email){authView.classList.add("hidden");dashboard.classList.remove("hidden");$("logout").classList.remove("hidden");$("admin-email").textContent=email||"Administrator";}
$("setup-form").addEventListener("submit",async e=>{e.preventDefault();message($("auth-message"),"Saving first-time setup…");try{await request("/api/setup",{email:$("setup-email").value,password:$("setup-password").value,setupKey:$("setup-key").value});message($("auth-message"),"Setup complete. You can now sign in.","success");showAuth("login");$("email").value=$("setup-email").value;}catch(err){message($("auth-message"),err.message,"error");}});
$("login-form").addEventListener("submit",async e=>{e.preventDefault();message($("auth-message"),"Signing in…");try{const d=await request("/api/login",{email:$("email").value,password:$("password").value});sessionToken=d.token;sessionStorage.setItem("modulos_admin_session",sessionToken);showDashboard(d.email);await loadBusinesses();}catch(err){message($("auth-message"),err.message,"error");}});
$("forgot").addEventListener("click",()=>{$("reset-form").classList.remove("hidden");$("login-form").classList.add("hidden");$("forgot").classList.add("hidden");$("reset-email").value=$("email").value;message($("auth-message"),"Enter your GitHub token to verify repository access and reset the admin password.");});
$("cancel-reset").addEventListener("click",()=>showAuth("login"));
$("reset-form").addEventListener("submit",async e=>{e.preventDefault();message($("auth-message"),"Verifying GitHub access and updating password…");try{await request("/api/reset-password",{email:$("reset-email").value,newPassword:$("new-password").value,githubToken:$("github-token").value});$("reset-form").reset();showAuth("login");message($("auth-message"),"Password updated. Sign in with your new password.","success");}catch(err){message($("auth-message"),err.message,"error");}});
$("logout").addEventListener("click",()=>{sessionToken="";sessionStorage.removeItem("modulos_admin_session");$("logout").classList.add("hidden");$("admin-email").textContent="";showAuth("login");});
async function loadBusinesses(){
  const tbody=$("business-list");tbody.innerHTML='<tr><td colspan="4" class="empty">Loading businesses…</td></tr>';
  try{const r=await fetch("../data/businesses.json?ts="+Date.now(),{cache:"no-store"});if(!r.ok)throw new Error("Could not load the public business database.");const data=await r.json();businesses=Array.isArray(data.businesses)?data.businesses:[];render();}
  catch(e){tbody.innerHTML=`<tr><td colspan="4" class="empty">${escapeHtml(e.message)}</td></tr>`;}
}
function escapeHtml(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function render(){
  $("total-count").textContent=businesses.length;$("active-count").textContent=businesses.filter(b=>b.status==="active").length;
  const since=Date.now()-30*86400000;$("recent-count").textContent=businesses.filter(b=>Date.parse(b.createdAt||"")>=since).length;
  const q=$("search").value.trim().toLowerCase();const rows=businesses.filter(b=>`${b.name} ${b.id}`.toLowerCase().includes(q));
  $("business-list").innerHTML=rows.length?rows.map(b=>`<tr><td><span class="biz-name">${escapeHtml(b.name)}</span><span class="biz-url">${escapeHtml(cleanUrl(b.id))}</span></td><td>${escapeHtml(b.id)}</td><td><span class="status-pill">${escapeHtml(b.status||"active")}</span></td><td><div class="actions"><button class="action" data-action="view" data-id="${escapeHtml(b.id)}">View</button><button class="action" data-action="copy" data-id="${escapeHtml(b.id)}">Copy URL</button><button class="action" data-action="qr" data-id="${escapeHtml(b.id)}">QR Code</button><button class="action" data-action="edit" data-id="${escapeHtml(b.id)}">Edit</button><button class="action danger" data-action="delete" data-id="${escapeHtml(b.id)}">Delete</button></div></td></tr>`).join(""):'<tr><td colspan="4" class="empty">No businesses found.</td></tr>';
}
$("search").addEventListener("input",render);
$("business-list").addEventListener("click",async e=>{
 const btn=e.target.closest("button[data-action]");if(!btn)return;const b=businesses.find(x=>x.id===btn.dataset.id);if(!b)return;
 if(btn.dataset.action==="view")window.open(cleanUrl(b.id),"_blank","noopener");
 if(btn.dataset.action==="qr")window.open(`https://api.qrserver.com/v1/create-qr-code/?size=600x600&format=png&data=${encodeURIComponent(cleanUrl(b.id))}`,"_blank","noopener");
 if(btn.dataset.action==="copy"){try{await navigator.clipboard.writeText(cleanUrl(b.id));btn.textContent="Copied";setTimeout(()=>btn.textContent="Copy URL",1200);}catch{alert("Clipboard access was blocked. Copy this URL: "+cleanUrl(b.id));}}
 if(btn.dataset.action==="edit")startEdit(b);
 if(btn.dataset.action==="delete"){if(!confirm(`Delete ${b.name} (${b.id}) and its page/logo? This cannot be undone.`))return;await perform({action:"delete",id:b.id},"Deleting business…");}
});
$("add-new").addEventListener("click",()=>{resetForm();$("editor-panel").scrollIntoView({behavior:"smooth"});});
$("cancel-edit").addEventListener("click",resetForm);
function startEdit(b){editingId=b.id;existingLogo=b.logoPath||null;$("form-title").textContent="Edit business";$("business-id").value=b.id;$("business-id").disabled=true;$("business-name").value=b.name;$("description").value=b.description;fields.forEach(k=>$ (k).value=b.links?.[k]||"");$("otherLinks").value=(b.links?.other||[]).join("\n");$("logo").required=false;$("logo-help").textContent=existingLogo?"Leave empty to keep the current logo.":"Upload a PNG logo."; $("save-business").textContent="Save Changes";$("cancel-edit").classList.remove("hidden");$("editor-panel").scrollIntoView({behavior:"smooth"});}
function resetForm(){editingId=null;existingLogo=null;$("business-form").reset();$("business-id").disabled=false;$("business-id").required=true;$("logo").required=true;$("logo-help").textContent="PNG only, maximum 2 MB. Required when creating a business.";$("form-title").textContent="Add a business";$("save-business").textContent="Create Business";$("cancel-edit").classList.add("hidden");$("logo-preview-wrap").classList.add("hidden");message($("operation-status"),"");}
$("logo").addEventListener("change",()=>{const f=$("logo").files[0];if(!f){$("logo-preview-wrap").classList.add("hidden");return;}if(f.type!=="image/png"||f.size>2*1024*1024){message($("operation-status"),"Choose a PNG image smaller than 2 MB.","error");$("logo").value="";return;}const url=URL.createObjectURL(f);$("logo-preview").src=url;$("logo-filename").textContent=f.name;$("logo-preview-wrap").classList.remove("hidden");});
async function fileBase64(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(",")[1]);r.onerror=reject;r.readAsDataURL(file);});}
function validateUrl(v){if(!v)return "";let u;try{u=new URL(v);}catch{throw new Error(`Invalid URL: ${v}`);}if(!["https:","http:"].includes(u.protocol))throw new Error("Only HTTP and HTTPS links are allowed.");return u.href;}
$("business-form").addEventListener("submit",async e=>{
 e.preventDefault();const id=$("business-id").value.trim();const name=$("business-name").value.trim();const description=$("description").value.trim();const file=$("logo").files[0];
 try{
  if(!/^[A-Za-z0-9_-]{1,50}$/.test(id))throw new Error("QR ID may contain letters, numbers, underscore and hyphen only.");
  if(!editingId&&businesses.some(b=>b.id.toLowerCase()===id.toLowerCase()))throw new Error("That QR ID already exists.");
  if(!editingId&&!file)throw new Error("Please upload a PNG logo.");
  if(file&&(file.type!=="image/png"||file.size>2*1024*1024))throw new Error("Logo must be a PNG smaller than 2 MB.");
  const links={};fields.forEach(k=>links[k]=validateUrl($(k).value.trim()));links.other=$("otherLinks").value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(validateUrl);
  let logoBase64=null;if(file)logoBase64=await fileBase64(file);
  const business={id,name,description,links,status:"active"};
  await perform({action:editingId?"update":"create",business,logoBase64},editingId?"Saving changes…":"Creating business…");
 }catch(err){message($("operation-status"),err.message,"error");}
});
async function perform(payload,label){
 const btn=$("save-business");btn.disabled=true;$("add-new").disabled=true;
 try{
  setProgress(12,"Preparing request…");const result=await request("/api/businesses",payload,true);
  setProgress(35,"Uploading and generating business page…");
  const runId=result.runId; if(!runId)throw new Error("Server did not return a workflow run ID.");
  await waitForWorkflow(runId);
  setProgress(100,"Successfully published.");message($("operation-status"),"Successfully published. Refreshing business list…","success");
  resetForm();await loadBusinesses();hideProgress();
 }catch(err){message($("operation-status"),err.message,"error");$("progress-bar").style.width="100%";hideProgress();}
 finally{btn.disabled=false;$("add-new").disabled=false;}
}
async function waitForWorkflow(runId){let attempts=0;while(attempts++<90){await new Promise(r=>setTimeout(r,4000));const d=await request(`/api/workflow/${encodeURIComponent(runId)}`,null,true);if(d.status==="completed"){if(d.conclusion!=="success")throw new Error(`Publishing failed (${d.conclusion||"unknown"}). Check GitHub Actions logs.`);return;}setProgress(Math.min(92,35+attempts*.6),`Publishing… ${d.status||"queued"}`);}throw new Error("Publishing is taking longer than expected. Check GitHub Actions before retrying.");}
boot();
