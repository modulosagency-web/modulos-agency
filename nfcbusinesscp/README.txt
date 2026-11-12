MODULOS NFC BUSINESS DASHBOARD  (Firebase project: modulos-3d5de)
===============================================================

Upload all files to the root of your GitHub repo that is served at
https://modulos.in/nfcbusinesscp/

Dashboard (admin login):  https://modulos.in/nfcbusinesscp/
Public business page:     https://modulos.in/nfcbusinesscp/<CardID>
Fallback public page:     https://modulos.in/nfcbusinesscp/view.html?id=<CardID>

FIREBASE CONSOLE (one-time)
1. Authentication > Sign-in method: enable Email/Password.
2. Authentication > Users: add geeky1934@gmail.com with a password.
3. Authentication > Settings > Authorized domains: add modulos.in
   (and <your-github-username>.github.io if you test there).
4. Realtime Database > Rules: paste database.rules.json and Publish.
5. Open the dashboard, sign in, press "Send verification email", open the link
   in the email, then press "I have verified - continue".

Data layout
  businesses/<CardID>  business record (admin read/write)
  status/<CardID>      { active: true|false } (public read, admin write)
  settings             application settings (admin only)

Notes
  404.html is the public business page. GitHub Pages serves it for any
  /nfcbusinesscp/<CardID> address, so every card URL works.
  If modulos.in root is served by a DIFFERENT repo, copy 404.html into
  that repo too.
