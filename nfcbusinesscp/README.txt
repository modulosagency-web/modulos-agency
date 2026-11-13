MODULOS NFC BUSINESS DASHBOARD  (GitHub JSON version - no Firebase)
====================================================================

Upload ALL files of this folder (including .nojekyll and the data/ folder) to the
root of the GitHub repo that is served at https://modulos.in/nfcbusinesscp/

FILES THAT ACT AS THE DATABASE
  data/auth.json        admin username, password HASH, encrypted GitHub token,
                        encrypted recovery blob. No plain-text password anywhere.
  data/businesses.json  all businesses + app settings (public information).

1) CREATE A GITHUB TOKEN (once)
   GitHub > Settings > Developer settings > Personal access tokens > Fine-grained tokens
   - Repository access: ONLY this repository
   - Permissions: Contents = Read and write
   - Expiration: choose the longest you are comfortable with
   Never paste this token into any file or commit it. You type it only in the
   dashboard's setup screen.

2) FIRST-TIME SETUP
   Open https://modulos.in/nfcbusinesscp/ -> "First-time setup".
   Enter owner, repository, branch, token, and choose admin username + password.
   The dashboard writes data/auth.json for you and shows a RECOVERY CODE once.
   Save that code - it is the "forgot password" key.

3) SIGN IN / FORGOT PASSWORD
   Sign in with username + password. The password unlocks the stored token; that token
   is what allows editing (saving businesses = a commit to data/businesses.json).
   Forgot password: use "Forgot password?" with username + recovery code + new password.

4) TOKEN EXPIRED + FORGOT PASSWORD (manual reset)
   Edit data/auth.json on github.com and change  "meta": {...}, "user": {...}
   to  "meta": null, "user": null  then commit. Open the dashboard and run
   First-time setup again with a new token. Business data is not affected.

PUBLIC PAGES
   https://modulos.in/nfcbusinesscp/<CardID>   (served through 404.html)
   https://modulos.in/nfcbusinesscp/view.html?id=<CardID>   (always works)
   If modulos.in root is a different repo, copy 404.html into that repo too.
   After a save, GitHub Pages can take ~1 minute to publish the new JSON.

SECURITY NOTES
   - Anyone can download data/auth.json. Use a LONG password (12+ characters):
     the hash uses PBKDF2-SHA256 (600,000 rounds) but a weak password can still be
     guessed offline.
   - Without the password or recovery code nobody can decrypt the token, so nobody
     can edit your data.
   - Inactive businesses are still inside the public JSON file (only hidden on the page).
