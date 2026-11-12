// ============================================================
//  MODULOS NFC BUSINESS DASHBOARD - Firebase configuration
//  Replace every PASTE_... value with the values from your
//  existing Firebase project (Project settings > Your apps > Web app).
//  databaseURL is required for Realtime Database.
// ============================================================
export const firebaseConfig = {
  apiKey: "PASTE_API_KEY",
  authDomain: "PASTE_PROJECT_ID.firebaseapp.com",
  databaseURL: "PASTE_DATABASE_URL",
  projectId: "PASTE_PROJECT_ID",
  storageBucket: "PASTE_PROJECT_ID.appspot.com",
  messagingSenderId: "PASTE_SENDER_ID",
  appId: "PASTE_APP_ID"
};

export const ADMIN_EMAIL = "geeky1934@gmail.com";
export const DEFAULT_PUBLIC_BASE_URL = "https://modulos.in/nfcbusinesscp/";

export function isConfigured() {
  return !!(firebaseConfig.apiKey && firebaseConfig.databaseURL && firebaseConfig.projectId) &&
    !Object.values(firebaseConfig).some(v => String(v).includes("PASTE_"));
}
