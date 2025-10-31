<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/drive/1ioutoX5Po34K12pehTbK_k4QFC_MK_st

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Configura el proveedor de IA remoto mediante `VITE_AI_PROVIDER` en [.env.local](.env.local). El valor por defecto es `gemini,openai`, lo que activa Gemini como primera opción y OpenAI como respaldo automático. También puedes usar:
   - `openai` o `gemini` para forzar un único proveedor (requieren `VITE_OPENAI_API_KEY` o `VITE_GEMINI_API_KEY`).
   - Listas separadas por comas para definir la prioridad manualmente (por ejemplo, `openai,gemini`).
   - `none` para deshabilitar completamente el LLM y trabajar solo con QR/OCR local.
   El pipeline redimensiona las imágenes a 1024 px, las convierte a WEBP, cachea los resultados por hash y ejecuta QR/Tesseract antes de consumir el LLM.
3. Run the app:
   `npm run dev`

### Firebase App Check

Firebase App Check debe estar activo tanto en producción como en los despliegues de preview. Elegí un único proveedor y asegurate de que coincida con el configurado en la consola de Firebase:

1. **reCAPTCHA v3 (recomendado):**
   - En Firebase → App Check → tu app web, seleccioná **reCAPTCHA** como proveedor.
   - En [Google reCAPTCHA v3](https://www.google.com/recaptcha/admin/create) generá una site key v3 e incluí los dominios `puntolimpio.ar`, `www.puntolimpio.ar` y `*.vercel.app`.
   - Configurá la variable `VITE_FIREBASE_APPCHECK_SITE_KEY` en Vercel con esa clave y redeployá.
   - (Opcional) `VITE_FIREBASE_APPCHECK_PROVIDER` puede quedar vacío o en `v3` (valor por defecto).

2. **reCAPTCHA Enterprise:**
   - En Firebase → App Check → tu app web, dejá **reCAPTCHA Enterprise** como proveedor.
   - En Google Cloud → reCAPTCHA Enterprise creá una site key *Web (score-based)* con los mismos dominios y habilitá la API de reCAPTCHA Enterprise en el proyecto.
   - Configurá `VITE_FIREBASE_APPCHECK_SITE_KEY` y `VITE_FIREBASE_APPCHECK_PROVIDER=enterprise` en Vercel antes de redeployar.

La aplicación inicializa App Check antes de tocar Firestore, Storage o Functions. Solo en desarrollo local (`npm run dev`) podés establecer `VITE_FIREBASE_DISABLE_APPCHECK=true` para depurar en dominios no autorizados; la bandera se ignora automáticamente en producción.
