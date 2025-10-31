// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import {
  AppCheck,
  getToken,
  initializeAppCheck,
  ReCaptchaV3Provider,
  setTokenAutoRefreshEnabled,
} from "firebase/app-check";
// FIX: Import initializeFirestore to allow passing configuration options
import { initializeFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { getAuth } from "firebase/auth";
import { getFunctions } from "firebase/functions";

// User-provided Firebase config
export const firebaseConfig = {
  apiKey: "AIzaSyDhvEuoA2qdnrF7TsmCLC3ewCv_tyaHLYU",
  authDomain: "punto-limpio-5a939.firebasestorage.app",
  projectId: "punto-limpio-5a939",
  storageBucket: "punto-limpio-5a939.appspot.com",
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
let functions = null;
let appCheckInstance: AppCheck | null = null;
let appCheckWarningLogged = false;

const APP_CHECK_SITE_KEY = import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY;
const APP_CHECK_DEBUG_TOKEN = import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN;
const APP_CHECK_FORCE_DISABLE = String(import.meta.env.VITE_FIREBASE_DISABLE_APPCHECK || '').toLowerCase() === 'true';

export let isAppCheckConfigured = Boolean(APP_CHECK_SITE_KEY) && !APP_CHECK_FORCE_DISABLE;

const logAppCheckMisconfiguration = (error?: unknown) => {
  if (appCheckWarningLogged) {
    return;
  }
  appCheckWarningLogged = true;
  const hint =
    APP_CHECK_FORCE_DISABLE
      ? "Firebase App Check está deshabilitado manualmente (VITE_FIREBASE_DISABLE_APPCHECK=true). Revertí el cambio para volver a proteger las funciones en la nube."
      : "Firebase App Check no está operativo. Verificá que VITE_FIREBASE_APPCHECK_SITE_KEY esté definido y que el dominio actual esté habilitado en la consola de reCAPTCHA v3.";
  if (error) {
    console.error(hint, error);
  } else {
    console.error(hint);
  }
};

const hydrateFunctions = () => {
  if (!functions && app && isAppCheckConfigured) {
    functions = getFunctions(app, "southamerica-east1");
  }
};

// Initialize Firebase only if the configuration has been changed from the default.
try {
    if (isFirebaseConfigured) {
        app = initializeApp(firebaseConfig);
        if (typeof window !== "undefined") {
            if (APP_CHECK_DEBUG_TOKEN) {
                (window as any).FIREBASE_APPCHECK_DEBUG_TOKEN = APP_CHECK_DEBUG_TOKEN;
            }

            if (APP_CHECK_FORCE_DISABLE) {
                isAppCheckConfigured = false;
                logAppCheckMisconfiguration();
            } else if (APP_CHECK_SITE_KEY) {
                try {
                    appCheckInstance = initializeAppCheck(app, {
                        provider: new ReCaptchaV3Provider(APP_CHECK_SITE_KEY),
                        isTokenAutoRefreshEnabled: true,
                    });

                    void getToken(appCheckInstance)
                        .then(() => {
                            hydrateFunctions();
                        })
                        .catch((error) => {
                            isAppCheckConfigured = false;
                            functions = null;
                            logAppCheckMisconfiguration(error);
                            if (appCheckInstance) {
                                setTokenAutoRefreshEnabled(appCheckInstance, false);
                            }
                        });
                } catch (error) {
                    isAppCheckConfigured = false;
                    logAppCheckMisconfiguration(error);
                }
            } else {
                isAppCheckConfigured = false;
                logAppCheckMisconfiguration();
            }
        }

        // 🔧 Clave: esta instancia soluciona el error de 'undefined'
        db = initializeFirestore(app, { ignoreUndefinedProperties: true });
        storage = getStorage(app);
        auth = getAuth(app);
        hydrateFunctions();
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
export { db, storage, auth, functions };
