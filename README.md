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

### Firebase App Check en entornos locales

La aplicación usa Firebase App Check para proteger las funciones Cloud y el acceso a Firestore. Si ejecutás el proyecto en un
dominio que no está autorizado en la consola de reCAPTCHA v3 (por ejemplo `localhost`), los intentos de obtener el token genera
rán errores 400 y verás mensajes como "FirebaseError: Missing or insufficient permissions" cuando intentes confirmar una carga.

Para evitar el ruido durante el desarrollo, podés desactivar App Check en el front-end agregando la siguiente variable a tu `.
env.local`:

```bash
VITE_FIREBASE_DISABLE_APPCHECK=true
```

Dejá este valor en `false` (o eliminá la variable) en los entornos donde tengas configurado el sitio en reCAPTCHA v3 para volver
a habilitar la protección.
