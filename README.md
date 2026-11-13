# MODULOS.IN Business QR Dashboard (No Firebase)

A static GitHub Pages directory and admin dashboard. Every business gets an independent landing page at:

`https://modulos.in/nfcbusinesscp/<ID>/`

Example: `https://modulos.in/nfcbusinesscp/1001/`.

## Important security design

- **Firebase is not used anywhere.**
- First visit shows a one-time setup screen. Admin email and a salted PBKDF2-SHA256 password hash are stored as a private JSON record named `admin-auth.json` in Cloudflare KV. The plaintext password is never stored.
- Cloudflare KV is private server-side storage, not the public `public/data/businesses.json` file.
- **The GitHub token is never stored in any JSON file or browser storage.** It is a Cloudflare Worker secret named `GITHUB_TOKEN`. Putting it in a public/static JSON file would expose full repository write access.
- First-time setup also requires a one-time `SETUP_KEY` Worker secret, preventing a random visitor from claiming the empty admin account.
- Forgot Password asks for the admin email, a GitHub token, and a new password. The Worker verifies the token against GitHub and checks that it has write access to the configured repository. The submitted token is used only for that verification and is not saved.
- Login sessions are signed by the Worker using `SESSION_SECRET`, expire after 8 hours, and are kept in `sessionStorage` in the browser.

## Project layout

- `public/index.html`: public homepage.
- `public/admin/`: dashboard, setup, login and reset UI.
- `public/data/businesses.json`: public business directory data only; never put secrets here.
- `public/nfcbusinesscp/<ID>/index.html`: generated unique page for each business.
- `public/nfcbusinesscp/<ID>/assets/logo.png`: that business's logo.
- `worker/`: Cloudflare Worker API and authentication.
- `scripts/apply_business.py`: GitHub Actions business page/JSON generator.
- `.github/workflows/business-publish.yml`: validates, commits and deploys changes to GitHub Pages.

## 1. GitHub repository

1. Create a GitHub repository and upload/push this complete project.
2. In **Settings → Pages**, select **GitHub Actions** as the deployment source.
3. Ensure Actions are enabled. The workflow needs `contents: write`, `pages: write`, and `id-token: write` permissions (already declared).
4. Create a fine-grained Personal Access Token with access to this repository and **Contents: Read and write**, **Actions: Read-only** and **Metadata: Read-only**. Keep it private; you will add it to Cloudflare Worker secrets only.
5. Set the custom domain in Pages and retain `public/CNAME` containing `modulos.in`.

## 2. Cloudflare KV and Worker

1. Install Node.js, then run:
   ```bash
   cd worker
   npm install
   npx wrangler login
   npx wrangler kv namespace create MODULOS_AUTH
   ```
2. Copy the KV namespace ID returned by Wrangler into `worker/wrangler.toml` in place of `REPLACE_WITH_CLOUDFLARE_KV_NAMESPACE_ID`.
3. Set `GITHUB_OWNER`, `GITHUB_REPO` and the repository default branch (`GITHUB_BRANCH`, normally `main`) in `worker/wrangler.toml`. `ALLOWED_ORIGINS` should include only your actual website origins.
4. Create strong random secrets and store them with Wrangler:
   ```bash
   npx wrangler secret put GITHUB_TOKEN
   npx wrangler secret put SESSION_SECRET
   npx wrangler secret put SETUP_KEY
   ```
   Use a different random value for `SESSION_SECRET` and `SETUP_KEY`. Keep the setup key private; you enter it only on the first setup screen.
5. Deploy:
   ```bash
   npx wrangler deploy
   ```
6. Copy the Worker URL into `API_BASE_URL` at the top of `public/admin/app.js`, then commit and push the updated file.

## 3. First-time admin setup

1. Open `https://modulos.in/admin/` after the Worker and website are deployed.
2. The page checks `/api/setup-status`. If no admin record exists, it displays **First-Time Setup**.
3. Enter the private `SETUP_KEY`, admin email and a strong password (minimum 12 characters), then complete setup.
4. The admin JSON record is saved in Cloudflare KV. Setup will not be offered again after that record exists; subsequent visits show normal email/password login.

If you intentionally need to recreate the first-time setup, delete the `admin-auth.json` key from the Cloudflare KV namespace using the Cloudflare dashboard. Do not delete it casually.

## 4. Forgot password

1. Select **Forgot password?** on the login screen.
2. Enter the admin email, a GitHub token with write access to the configured repository, and a new password of at least 12 characters.
3. The Worker validates the GitHub token against GitHub and checks repository write permission. If valid, it replaces the password hash in KV.
4. The submitted GitHub token is not persisted. Revoke the token in GitHub if you believe it has been exposed.

## 5. Add a business and create its QR page

1. Sign in, then select **Add Business**.
2. Enter a unique ID such as `1001`, business name, description, PNG logo (max 2 MB), Google Review link and any available social/business links.
3. Select **Create Business**. The Worker validates the session and payload, uploads the PNG directly to the repository through the GitHub Contents API (so a 2 MB image is not squeezed into GitHub’s small dispatch-payload limit), then triggers GitHub Actions with the logo path.
4. GitHub Actions updates `public/data/businesses.json`, saves the logo, generates `public/nfcbusinesscp/1001/index.html`, commits and deploys the `public/` directory.
5. After the workflow completes successfully, the page is available at `https://modulos.in/nfcbusinesscp/1001/`. Use the row’s **QR Code** action to open a 600×600 PNG QR image for that exact URL (generated by the QRServer image endpoint), or copy the URL and use your preferred QR generator.

The generated page shows the Google Review button first, followed by the available social links with icons. Each business page is generated independently using its own ID, logo, name, description and links. Add, edit and delete operations are serialized by the workflow concurrency group.

## 6. Configure custom domain

Set `modulos.in` as the GitHub Pages custom domain and configure DNS using the current values shown in GitHub Pages settings. Enable HTTPS after DNS verification. Do not rely on copied/stale DNS IP addresses.

## 7. Checks and limitations

Run:

```bash
python scripts/test_project.py
```

The included tests are structural/local checks only. This ZIP cannot be connected to your GitHub or Cloudflare accounts automatically. A live end-to-end test requires your own GitHub repository, KV namespace, Worker secrets, domain and successful Actions deployment. Do not paste GitHub tokens into chat or commit them to the repository.
