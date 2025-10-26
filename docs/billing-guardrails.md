# Políticas de uso para clientes empresariales

Este documento resume un plan de control de costos basado en cupos mensuales de escaneos de imagen y describe mecanismos de protección para evitar sobrecargos inesperados.

## Plan por uso con corte al 100 %

- Cada cliente grande contrata un cupo mensual de escaneos de imagen.
- Al alcanzar el 100 % del cupo se realiza un corte duro del servicio remoto y se ofrece un upgrade inmediato de plan.
- Cuando se excede el límite, el análisis cae a modo degradado: solo se procesa QR/OCR local (sin costos externos) hasta el próximo reset mensual.

## Eficiencia operativa

1. Redimensionar imágenes a ≤ 1024 px y convertir a WEBP (calidad ≈ 70) antes de subir.
2. Detectar QR con ZXing/ZBar en primera instancia.
3. Ejecutar OCR con Tesseract o PaddleOCR en segunda instancia.
4. Usar un LLM únicamente como fallback con recortes específicos y bajo conteo de tokens.
5. Cachear resultados por hash (SHA-256/pHash) para evitar reprocesos.
6. Habilitar presupuesto, Pub/Sub y una Cloud Function que deshabilite la API al alcanzar el umbral.
7. Configurar cuotas diarias/por minuto en GCP y mantener un proyecto por cada cliente grande.
8. Definir límites por _tenant_ en el backend (responder HTTP 429 al exceder).

## Auditoría y retención

- Mantener logs y auditoría por ID de remito/QR para detectar reprocesamientos.
- Borrar originales a las 24–72 horas para reducir costos de almacenamiento y egreso.

## Snippet de Cloud Function (Node.js 18)

La siguiente función se activa mediante un mensaje de Pub/Sub emitido por un presupuesto de Cloud Billing y deshabilita el servicio Vision API del proyecto cuando el gasto alcanza el umbral configurado.

```ts
import {ServiceUsageClient} from '@google-cloud/service-usage';
import type {BudgetNotificationMessage} from './types';

const client = new ServiceUsageClient();
const PROJECT_NUMBER = process.env.PROJECT_NUMBER!; // e.g. "123456789012"
const SERVICE_NAME = 'vision.googleapis.com';

export const handleBudgetAlert = async (event: {data: string}) => {
  const payload = JSON.parse(Buffer.from(event.data, 'base64').toString()) as BudgetNotificationMessage;
  const threshold = payload?.costAmount ?? 0;

  console.info(`Budget alert received at ${threshold} ${payload.currencyCode}`);

  if (threshold <= 0) {
    console.info('Threshold not reached, skipping.');
    return;
  }

  const name = `projects/${PROJECT_NUMBER}/services/${SERVICE_NAME}`;

  const [operation] = await client.disableService({
    name,
    disableDependentServices: true,
  });

  await operation.promise();
  console.info(`Service ${SERVICE_NAME} disabled for project ${PROJECT_NUMBER}.`);
};
```

### Despliegue

```bash
gcloud functions deploy handleBudgetAlert \ 
  --gen2 \ 
  --runtime=nodejs18 \ 
  --region=us-central1 \ 
  --entry-point=handleBudgetAlert \ 
  --trigger-topic=projects/$PROJECT_ID/topics/billing-budget \ 
  --set-env-vars=PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
```

> **Nota:** crea la suscripción Pub/Sub a partir de un presupuesto de Cloud Billing y apunta el mensaje JSON al tema `billing-budget`.

## Comandos para fijar cuotas

Ejemplo de cómo limitar peticiones por minuto y por día en Vision API para un proyecto específico.

```bash
# Habilita la API y establece la cuota de 1 000 solicitudes por minuto.
gcloud services enable vision.googleapis.com --project=$PROJECT_ID

gcloud alpha services quota update vision.googleapis.com \ 
  --project=$PROJECT_ID \ 
  --metric=vision.googleapis.com/requests \ 
  --unit='1/{min}' \ 
  --limit=1000

# Establece una cuota diaria de 50 000 solicitudes.
gcloud alpha services quota update vision.googleapis.com \ 
  --project=$PROJECT_ID \ 
  --metric=vision.googleapis.com/requests \ 
  --unit='1/{d}' \ 
  --limit=50000
```

Repite el procedimiento para cada proyecto dedicado a un cliente empresarial.

## Adaptadores de proveedores

Configura un adaptador que permita alternar entre OpenAI, Gemini u operar sin LLM mediante una variable de entorno. Esto facilita responder a incidentes o restricciones regulatorias sin intervenir el código base.

Con este esquema puedes vender a plantas industriales sin arriesgar otra factura inesperada de 15 000 USD.
