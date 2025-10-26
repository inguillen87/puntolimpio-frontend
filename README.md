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
2. Configure el proveedor de IA remoto mediante `VITE_AI_PROVIDER` en [.env.local](.env.local). Valores disponibles:
   - `gemini` (por defecto): requiere `VITE_GEMINI_API_KEY`.
   - `openai`: requiere `VITE_OPENAI_API_KEY` (y opcionalmente `VITE_OPENAI_MODEL`, por defecto `gpt-4o-mini`).
   - `none`: deshabilita el LLM y fuerza el modo solo QR/OCR local.
   El pipeline redimensiona las imágenes a 1024 px, las convierte a WEBP, cachea los resultados por hash y ejecuta QR/Tesseract antes de consumir el LLM.
3. Run the app:
   `npm run dev`
