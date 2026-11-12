MODULOS NFC BUSINESS DASHBOARD
==============================

1. FIREBASE CONFIG
   Open js/firebase-config.js and replace every PASTE_... value with the values
   from your existing Firebase web app (Project settings > Your apps).
   databaseURL is required.

2. DATABASE RULES
   Publish the contents of database.rules.json in
   Firebase Console > Realtime Database > Rules.
   Only geeky1934@gmail.com with a verified email can write.

3. ADMIN ACCOUNT
   In Firebase Console > Authentication, enable Email/Password and make sure the
   user geeky1934@gmail.com exists. On first sign-in the dashboard asks you to verify
   the email address (a verification email is sent from the dashboard).
   Add your site's domain under Authentication > Settings > Authorized domains.

4. PUBLIC URLS
   Public pages live in nfcbusinesscp/ and use the URL
   https://modulos.in/nfcbusinesscp/<CardID>.
   Rewrite rules for that path are included (.htaccess, _redirects, firebase.json).
   The base URL can be changed in Dashboard > Settings.

Data layout
  businesses/<CardID>  business record (admin read/write)
  status/<CardID>      { active: true|false } (public read, admin write)
  settings             application settings (admin only)

Third-party libraries loaded from CDN: Firebase JS SDK 10.12.2 (gstatic),
qrcodejs 1.0.0 and html5-qrcode 2.3.8 (cdnjs).
