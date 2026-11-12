// MODULOS NFC BUSINESS DASHBOARD
// Firebase project: modulos-3d5de

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

export const DEFAULT_PUBLIC_BASE_URL =
  "https://modulos.in/nfcbusinesscp/";

export function isConfigured() {
  return Boolean(
    firebaseConfig.apiKey &&
    firebaseConfig.authDomain &&
    firebaseConfig.databaseURL &&
    firebaseConfig.projectId &&
    firebaseConfig.appId &&
    !Object.values(firebaseConfig).some(
      value => String(value).includes("PASTE_")
    )
  );
}
