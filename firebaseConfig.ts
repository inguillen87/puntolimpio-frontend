// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// FIX: Import initializeFirestore to allow passing configuration options
import { initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";

// User-provided Firebase config
export const firebaseConfig = {
  apiKey: "AIzaSyDhvEuoA2qdnrF7TsmCLC3ewCv_tyaHLYU",
  authDomain: "punto-limpio-5a939.firebaseapp.com",
  projectId: "punto-limpio-5a939",
  storageBucket: "punto-limpio-5a939.firebasestorage.app",
  messagingSenderId: "1085395296235",
  appId: "1:1085395296235:web:bc1f776549e16d0ee443ae",
  measurementId: "G-YB4S9KVSDN"
};


// Revisa si la configuración ha sido cambiada de los valores por defecto
export const isFirebaseConfigured = 
    firebaseConfig.apiKey &&
    !firebaseConfig.apiKey.startsWith("TU_");


let app = null;
let db = null;
let storage = null;
let auth = null;

// Initialize Firebase only if the configuration has been changed from the default.
try {
    if (isFirebaseConfigured) {
        app = initializeApp(firebaseConfig);
        // 🔧 Clave: esta instancia soluciona el error de 'undefined'
        db = initializeFirestore(app, { ignoreUndefinedProperties: true });
        storage = getStorage(app);
        auth = getAuth(app);
    }
} catch (e) {
    console.error("Error al inicializar Firebase. Por favor, verifica tu configuración.", e);
}


if (!isFirebaseConfigured) {
    console.warn(`
      ********************************************************************************
      * ATENCIÓN: La configuración de Firebase no ha sido establecida.                *
      * La aplicación funcionará en "Modo Demo" usando el almacenamiento local.      *
      * Para habilitar la persistencia en la nube, edita el archivo 'firebaseConfig.ts'. *
      ********************************************************************************
    `);
}

// Exporta las instancias (pueden ser null si no está configurado)
export { db, storage, auth };