// MODULOS NFC BUSINESS DASHBOARD - Firebase configuration (project: modulos-3d5de)
export const firebaseConfig = {
  apiKey: "AIzaSyBL32KwCkJqSe2KBAO1sbuWLl83s4Cn8lo",
  authDomain: "modulos-3d5de.firebaseapp.com",
  databaseURL: "https://modulos-3d5de-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "modulos-3d5de",
  storageBucket: "modulos-3d5de.firebasestorage.app",
  messagingSenderId: "803636782488",
  appId: "1:803636782488:web:736eef934ac4c08ee177ed",
  measurementId: "G-79YXV1JXY5"
};

export const ADMIN_EMAIL = "geeky1934@gmail.com";
export const DEFAULT_PUBLIC_BASE_URL = "https://modulos.in/nfcbusinesscp/";

export function isConfigured() {
  return !!(firebaseConfig.apiKey && firebaseConfig.databaseURL && firebaseConfig.projectId) &&
    !Object.values(firebaseConfig).some(v => String(v).includes("PASTE_"));
}
