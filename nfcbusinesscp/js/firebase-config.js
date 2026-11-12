
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyBL32KwCkJqSe2KBAO1sbuWLl83s4Cn8lo",
  authDomain: "modulos-3d5de.firebaseapp.com",
  databaseURL: "https://modulos-3d5de-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "modulos-3d5de",
  storageBucket: "modulos-3d5de.firebasestorage.app",
  messagingSenderId: "803636782488",
  appId: "1:803636782488:web:736eef934ac4c08ee177ed",
  measurementId: "G-79YXV1JXY5"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getDatabase(app);
export default app;
