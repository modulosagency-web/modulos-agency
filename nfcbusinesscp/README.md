# Modulos.in – Business QR Dashboard

Har business ko apna alag page milta hai: `https://modulos.in/nfcbusinesscp/<ID>` (file: `nfcbusinesscp/<ID>/index.html`).

```
Browser (modulos.in/admin)  ──►  Cloudflare Worker (api.modulos.in)  ──►  GitHub API
   login / dashboard            login, session, CSRF, validation         commit request + start workflow
                                secrets yahin rehte hain                      │
                                                                              ▼
                                      GitHub Actions: scripts/process.mjs → data/businesses.json
                                      → nfcbusinesscp/<ID>/index.html + assets/logo.png → deploy to GitHub Pages
```
Public site = static HTML/CSS/JS (no PHP/Node/MySQL server). Koi secret frontend, public JSON ya localStorage me nahi hai.

## Setup (ek baar)

### 1. GitHub repo + Pages
1. Naya repo banao, is poore folder ko push karo (branch `main`).
2. **Settings → Pages → Source = "GitHub Actions"**. Custom domain = `modulos.in`, "Enforce HTTPS" ON.
3. **Settings → Actions → General → Workflow permissions = Read and write**.
4. **Settings → Environments → github-pages**: branch rule me `main` allow ho.

### 2. DNS (domain registrar)
- Apex `modulos.in`: A records → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
- (optional) `www` CNAME → `<github-username>.github.io`
- `api` subdomain ko Cloudflare Worker ke liye use karenge (step 4). Sabse aasan: domain ke DNS Cloudflare par rakho (API record Worker custom domain khud bana deta hai).
- DNS propagate hone me kuch ghante lag sakte hain; HTTPS certificate GitHub khud deta hai.

### 3. GitHub token (sirf Worker ke liye)
**Settings → Developer settings → Fine-grained tokens** → sirf is ek repo ko select karo. Permissions: **Contents: Read & write, Actions: Read & write, Checks: Read, Metadata: Read**. Is token ko kahin paste mat karo, sirf step 4 me secret me daalo.

### 4. Cloudflare Worker (secure backend)
```bash
cd worker && npm install
npx wrangler login
npx wrangler kv namespace create KV        # jo id mile use wrangler.toml me daalo
# wrangler.toml me GH_OWNER, GH_REPO, ALLOWED_ORIGIN, SITE_URL edit karo
npx wrangler secret put GH_TOKEN           # step 3 ka token
npx wrangler secret put SETUP_KEY          # koi lamba random string (first-time setup + password recovery key)
npx wrangler deploy
```
Phir Cloudflare dashboard → Workers → `modulos-api` → Settings → Triggers → **Custom Domain: `api.modulos.in`**.
> bcrypt hashing ke liye Workers **Paid plan ($5/month)** chahiye (free plan ki 10 ms CPU limit kam padti hai). Free plan par chalana ho to `bcrypt.hash(..., 10)` ko `8` karke try karo ya PBKDF2 use karo.

`admin/config.js` me `apiBase` check karo (`https://api.modulos.in`). Commit + push → site deploy ho jayegi.

### 5. First-time admin setup
`https://modulos.in/admin/` kholo → "First-time setup" dikhega → email, password (12+ chars), aur SETUP_KEY daalo. Uske baad sirf Email + Password login dikhega.
**Forgot password**: login page par link → SETUP_KEY (recovery key) + naya password.

## Daily use
Add Business → QR ID, naam, description, PNG logo, links → **Create Business**. Progress: Preparing → Uploading → Generating Page → Publishing → Successfully Created. Success tabhi dikhta hai jab GitHub Actions deploy complete ho. QR button se QR (SVG) download karo; Edit / Delete bhi isi dashboard se.

## Security summary
- Passwords bcrypt hash; session = random token, KV me sirf SHA-256 hash; cookie `HttpOnly; Secure; SameSite=Strict`, 8 ghante expiry.
- CSRF: har state-changing request par `X-CSRF-Token` + Origin check. Login par 8 galat attempts → 15 min block.
- Har create/edit/delete server-side validate hota hai (Worker me aur dobara Actions me). Sirf `https://` links; PNG magic-bytes, ≤ 2 MB, ≤ 4000 px; business text HTML-escape hoke page me jata hai.
- Workflow `concurrency` (ek time par ek write) + Worker lock; failure par database commit hi nahi hota.

## Known limits (seedhi baat)
- **Clean URL**: GitHub Pages `/nfcbusinesscp/1001` ko `/nfcbusinesscp/1001/` (trailing slash) par le jata hai aur `index.html` serve karta hai. Address bar me `index.html` kabhi nahi aata. Deploy ke baad QR scan, refresh, direct open test karo (README checklist neeche).
- Ek time par ek hi change publish hota hai; doosra admin "Another change is still publishing" dekhega, thodi der baad retry kare.
- Logo resize/optimise nahi hota (sirf validate). Chahein to Actions me `sharp` add kar sakte hain.
- Ye project sandbox me bana; GitHub/Cloudflare par live deploy yahan se test nahi ho sakta. Local test (neeche) hua hai, live checklist aapko deploy ke baad chalani hai.

## Test checklist (deploy ke baad)
Setup → login → logout → forgot password · view-source / Network tab me koi token na ho · 3 businesses (1001, 1002, 1003) · duplicate ID error · har page par apna logo/naam/links · Google Review + icons · ek edit karo, baaki page same rahe · ek delete karo, baaki chalte rahe · mobile + desktop · QR scan, refresh, new tab.

## Local generator test
`incoming/<uuid>.json` (+ `.png`) banao, phir `REQUEST_ID=<uuid> node scripts/process.mjs`.
JSON example: `{"op":"create","id":"1001","name":"Cafe","description":"Chai","links":{"googleReview":"https://..."}}`
