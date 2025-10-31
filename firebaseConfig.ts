// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import {
  AppCheck,
  getToken,
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
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

const APP_CHECK_SITE_KEY = (import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY ?? "").trim();
const APP_CHECK_DEBUG_TOKEN = (import.meta.env.VITE_FIREBASE_APPCHECK_DEBUG_TOKEN ?? "").trim();
const IS_PRODUCTION_BUNDLE = Boolean(import.meta.env.PROD || import.meta.env.MODE === "production");
const APP_CHECK_FORCE_DISABLE =
  String(import.meta.env.VITE_FIREBASE_DISABLE_APPCHECK || "").toLowerCase() === "true" &&
  !IS_PRODUCTION_BUNDLE;
const APP_CHECK_PROVIDER = String(
  import.meta.env.VITE_FIREBASE_APPCHECK_PROVIDER || "v3",
).toLowerCase();
const RESOLVED_APPCHECK_PROVIDER =
  APP_CHECK_PROVIDER === "enterprise" ? "enterprise" : "v3";
const APP_CHECK_PROVIDER_LABEL =
  RESOLVED_APPCHECK_PROVIDER === "enterprise"
    ? "reCAPTCHA Enterprise"
    : "reCAPTCHA v3";
export const appCheckProviderLabel = APP_CHECK_PROVIDER_LABEL;

if (
  typeof window !== "undefined" &&
  APP_CHECK_PROVIDER !== RESOLVED_APPCHECK_PROVIDER &&
  !appCheckWarningLogged
) {
  console.warn(
    `VITE_FIREBASE_APPCHECK_PROVIDER debe ser "v3" o "enterprise". Se recibió "${APP_CHECK_PROVIDER}" y se usará "${RESOLVED_APPCHECK_PROVIDER}" por defecto.`,
  );
}

export let isAppCheckConfigured = Boolean(APP_CHECK_SITE_KEY) && !APP_CHECK_FORCE_DISABLE;

const buildSiteKeyFix = () =>
  [
    "Definí VITE_FIREBASE_APPCHECK_SITE_KEY en Vercel con la site key v3 (formato 6Lxxxxxxxxxxxxxxxx).",
    "Volvé a desplegar marcando 'Clear build cache' para que Vite reempaquete la clave.",
    "Abrí la app en una ventana de incógnito, desregistrá el Service Worker y hacé un hard reload (Ctrl+F5) para limpiar tokens viejos.",
    "En la consola del navegador ejecutá console.log(import.meta.env.VITE_FIREBASE_APPCHECK_SITE_KEY) para confirmar que el bundle ve la clave.",
  ].join(" ");

const normalizeError = (error: unknown): { code?: string; message?: string } => {
  if (error && typeof error === "object") {
    const maybeError = error as { code?: unknown; message?: unknown };
    return {
      code: typeof maybeError.code === "string" ? maybeError.code : undefined,
      message: typeof maybeError.message === "string" ? maybeError.message : undefined,
    };
  }
  if (typeof error === "string") {
    return { message: error };
  }
  return {};
};

const buildAppCheckHint = (error?: unknown): string => {
  if (APP_CHECK_FORCE_DISABLE) {
    return "Firebase App Check está deshabilitado manualmente (VITE_FIREBASE_DISABLE_APPCHECK=true). Revertí el cambio para volver a proteger las funciones en la nube.";
  }

  const parts: string[] = [
    `Firebase App Check no está operativo. Proveedor configurado: ${APP_CHECK_PROVIDER_LABEL}.`,
    "Verificá que VITE_FIREBASE_APPCHECK_SITE_KEY esté definido y que el dominio actual figure como permitido en la consola de App Check.",
    "Tras actualizar la consola o las variables de entorno, redeployá la app y recargá la página en modo incógnito para limpiar tokens antiguos.",
  ];

  if (!APP_CHECK_SITE_KEY) {
    parts.push(buildSiteKeyFix());
  } else if (
    RESOLVED_APPCHECK_PROVIDER === "v3" &&
    !APP_CHECK_SITE_KEY.startsWith("6L")
  ) {
    parts.push(
      "La clave configurada no parece ser reCAPTCHA v3 (debe comenzar con '6L'). Reemplazala por la site key v3 obtenida en https://www.google.com/recaptcha/admin/create."
    );
  }

  const { code, message } = normalizeError(error);

  if (
    RESOLVED_APPCHECK_PROVIDER === "v3" &&
    ((code && code.includes("initial-throttle")) || message?.includes("exchangeRecaptchaV3Token"))
  ) {
    parts.push(
      "El error 400 en exchangeRecaptchaV3Token suele aparecer cuando la app web sigue registrada como reCAPTCHA Enterprise en Firebase App Check. Ingresá a Firebase → App Check → tu app web y elegí el proveedor 'reCAPTCHA' (no Enterprise), luego actualizá la site key v3 en Vercel.",
    );
  }

  if (
    RESOLVED_APPCHECK_PROVIDER === "enterprise" &&
    message?.includes("exchangeRecaptchaEnterpriseToken")
  ) {
    parts.push(
      "Estás usando ReCaptchaEnterpriseProvider en el front pero la consola de Firebase parece configurada con reCAPTCHA v3. Cambiá VITE_FIREBASE_APPCHECK_PROVIDER=v3 o ajustá Firebase App Check a reCAPTCHA Enterprise y usá una clave Enterprise.",
    );
  }

  return parts.join(" ");
};

const logAppCheckMisconfiguration = (error?: unknown) => {
  if (appCheckWarningLogged) {
    return;
  }
  appCheckWarningLogged = true;
  const hint = buildAppCheckHint(error);
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
                    const provider =
                        RESOLVED_APPCHECK_PROVIDER === "enterprise"
                            ? new ReCaptchaEnterpriseProvider(APP_CHECK_SITE_KEY)
                            : new ReCaptchaV3Provider(APP_CHECK_SITE_KEY);

                    appCheckInstance = initializeAppCheck(app, {
                        provider,
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
                logAppCheckMisconfiguration(
                    new Error(
                        RESOLVED_APPCHECK_PROVIDER === "enterprise"
                            ? "VITE_FIREBASE_APPCHECK_SITE_KEY es obligatorio para usar ReCaptchaEnterpriseProvider."
                            : "VITE_FIREBASE_APPCHECK_SITE_KEY es obligatorio para usar ReCaptchaV3Provider."
                    ),
                );
                if (IS_PRODUCTION_BUNDLE) {
                    console.error(buildSiteKeyFix());
                }
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
