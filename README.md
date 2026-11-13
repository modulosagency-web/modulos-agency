# MODULOS Business QR Dashboard

A GitHub Pages + Vercel starter for managing business profiles while preserving existing QR destinations:

`https://modulos.in/nfcbusinesscp/ID`

No QR codes are generated. Existing IDs and paths are the canonical identifiers.

## Important implementation notes

This repository is a deployable foundation, not a turnkey hosted service. You must configure GitHub and Vercel, inspect the workflows, and run the deployment tests in your own accounts before production use.

- Static admin UI: `public/admin/`
- Public business profile template: `public/nfcbusinesscp/profile.*`
- Main JSON index: `public/data/businesses.json`
- Vercel API functions: `api/`
- GitHub Actions: `.github/workflows/`
- Tests: `tests/`

### Security and platform boundary

GitHub Pages cannot execute secure admin authentication or private repository writes. The admin browser talks to Vercel Functions. Vercel keeps the password hash, session signing secret and GitHub credential server-side. GitHub Actions secrets are a separate store and are not automatically visible to Vercel.

**The five requested GitHub Actions secrets** are `GITHUB_TOKEN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, and `SETUP_KEY`. Add them in GitHub → Settings → Secrets and variables → Actions. The backend also requires matching private environment variables in Vercel; set them independently in Vercel → Project → Settings → Environment Variables. Never put credentials in `public/`.

Vercel backend variables:
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD_HASH` (format: `pbkdf2-sha256$iterations$salt$derived`)
- `SESSION_SECRET` (32+ random characters)
- `SETUP_KEY` (long random one-time setup key; remove after setup)
- `GITHUB_TOKEN` (fine-grained PAT with repository Contents read/write and Actions read/write; keep server-side)
- `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH`
- `ALLOWED_ORIGIN=https://modulos.in`
- `COOKIE_SECURE=true`

The GitHub secret named `GITHUB_TOKEN` is not automatically injected into Vercel. The Vercel variable with the same name must be configured separately. Prefer a fine-grained PAT limited to this repository. GitHub's built-in `GITHUB_TOKEN` exists only inside Actions and has workflow-scoped permissions.

## Setup

1. Create a **public** GitHub repository and upload this project.
2. In repository Settings → Pages, set the source to **GitHub Actions**.
3. In repository Settings → Secrets and variables → Actions, add the five named secrets. Use a fine-grained token with the minimum permissions needed by the workflow. Do not commit the token.
4. In Vercel, import the same repository as a project. Set the project root to the repository root and deploy the Functions under `api/`.
5. Configure the Vercel environment variables listed above. Set `GITHUB_OWNER`, `GITHUB_REPO`, and `GITHUB_BRANCH=main`. Set `ALLOWED_ORIGIN` to the exact production origin.
6. Add the custom domain `modulos.in` to the GitHub Pages project and configure the DNS records shown by GitHub. Add `www` only if you intend to use it and configure a redirect. Wait for DNS verification and enforce HTTPS.
7. Configure the Vercel API domain separately (for example `api.modulos.in`) and update `API` in `public/admin/app.js` to that origin if the API is not served on the same origin. For same-origin `/api`, route `api.modulos.in` behind a reverse proxy or use a same-origin deployment architecture. GitHub Pages does not proxy `/api` to Vercel by itself.
8. For a production deployment, use an explicit API origin and update the frontend's `API` constant and `ALLOWED_ORIGIN`/cookie domain strategy accordingly. If frontend and API are on different subdomains, cross-site cookies require `SameSite=None; Secure`, CSRF origin validation and CORS credentials; review this before enabling it.
9. First-time setup: generate a PBKDF2 hash locally with `node -e "import('./api/_lib/auth.js').then(m=>console.log(m.passwordHash('YOUR_LONG_PASSWORD')))"`, set `ADMIN_EMAIL` and `ADMIN_PASSWORD_HASH` in Vercel, then redeploy. Set the same hash/email as GitHub Actions secrets. Set `SETUP_KEY` in both stores for the controlled initial setup process; remove/rotate it after use. Do not expose it in browser code.
10. Sign in at `https://modulos.in/admin/`. Add a business using the **existing** QR ID. The public URL is generated from the unchanged ID.
11. Check GitHub → Actions for workflow/deployment results. The dashboard displays the latest workflow status.

## Data structure

Each profile uses:
- `public/nfcbusinesscp/ID/index.html`
- `public/nfcbusinesscp/ID/data.json`
- `public/nfcbusinesscp/ID/assets/logo.png`

The main index is `public/data/businesses.json`. The profile page reads its sibling `data.json`, so direct directory navigation loads that exact business. Empty profile fields are omitted.

## Existing records

The supplied project starts with an empty `businesses.json`. Before connecting it to a live repository, import your existing business records and their IDs from your current data source. Do not overwrite the live repository with the empty starter file. Back up the repository first.

## Backup and recovery

- Before first deployment, clone or download a full repository backup.
- Before deleting a business, create a tagged release or repository backup.
- A workflow lock is stored at `.modulos/workflow-lock.json`; the lock is acquired by a GitHub Contents API create operation. If a workflow is demonstrably terminal but the lock remains, inspect the latest run and owner before deleting the lock file manually.
- A lock older than 20 minutes is treated as stale and intentionally blocks further writes until an administrator verifies the corresponding run. This avoids unsafe automatic lock theft.
- Restore `public/data/businesses.json` and the affected `public/nfcbusinesscp/ID/` folder from the backup, then run validation and deploy.
- GitHub Actions commits and Pages deployment are separate steps. A successful commit is not proof that the Pages deployment completed.

## Local development and tests

Requires Node.js 20+.

```bash
npm test
npm run validate
```

`npm run validate` validates the current main JSON. The initial empty JSON is valid. Run the deployment workflow in a test repository before using real QR IDs.

## Known limitations to resolve before production

This delivered source intentionally documents several hardening tasks rather than pretending they are complete:

1. GitHub Actions secret bootstrapping must be reviewed with a real repository; GitHub's built-in `GITHUB_TOKEN` cannot be used to update repository Actions secrets. The included setup workflow is a scaffold and requires a PAT with `secrets:write` plus a vetted libsodium dependency. The safer recommended path is to generate the hash locally and set the Vercel/GitHub secrets manually.
2. Password reset is administrator-assisted; the API does not email reset links. Rotate the PBKDF2 hash out-of-band and redeploy.
3. The current logo payload validation checks declared MIME and size but does not fully decode/re-encode image bytes. Add a maintained image decoder (e.g. `sharp`) in the backend and enforce decoded dimensions/pixel limits before production. The workflow currently writes supplied bytes as `logo.png`; JPG/WebP conversion is not implemented.
4. The workflow update path should be load-tested for GitHub API conflicts, branch protection, retry behavior and the lock lifecycle. A terminal workflow lock release step should be added using a dedicated narrowly-scoped credential or API callback. The current lock may require manual recovery after a run.
5. The dashboard's single-flight UI prevents accidental repeated clicks in one browser. Server-side lock acquisition is atomic at the GitHub Contents API level, but the API must be reviewed for simultaneous create/update conflicts in a real repository.
6. GitHub Pages custom domain and Vercel API origin must be configured deliberately. GitHub Pages cannot serve `/api` Functions. Do not assume `/api` routes to Vercel automatically.
7. The public business page and profile template use relative sibling `data.json` paths. If the current QR path has a trailing slash, the static host should resolve `index.html`; verify this with the exact existing DNS and Pages setup.
8. The GitHub Actions workflow uses a concurrency group to serialize deployments. GitHub concurrency can queue runs; the API lock is intended to reject a second update, but the lock lifecycle needs the production release callback described above.

## Security checklist before go-live

- Rotate any token ever pasted into chat, source, logs or a public repository.
- Use a fine-grained GitHub PAT scoped to this repository only.
- Configure HTTPS and secure cookies.
- Restrict Vercel production deployment access.
- Review API rate limiting at the edge; in-memory throttling is per serverless instance and is not a global rate limiter.
- Add audit logs without secrets or personal data.
- Add image decoding/re-encoding and malware scanning if required.
- Test all create/edit/delete flows with disposable records before importing live businesses.
