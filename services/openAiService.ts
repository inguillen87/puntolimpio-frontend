import { DocumentType, ItemType, ScannedControlSheetData, ScannedTransactionData } from '../types';
import { readFileAsDataUrl } from '../utils/imageProcessing';
import { normalizeItemName } from '../utils/itemNormalization';

const OPENAI_API_KEY =
  import.meta.env.VITE_OPENAI_API_KEY ??
  (typeof process !== 'undefined' ? (process.env.OPENAI_API_KEY as string | undefined) : undefined) ??
  '';

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = import.meta.env.VITE_OPENAI_MODEL ?? 'gpt-4o-mini';

const ASSISTANT_SYSTEM_PROMPT = `
Eres "Punto Limpio AI", un asistente experto en logística y gestión de inventario. Tu conocimiento se basa ÚNICAMENTE en el contexto de datos JSON proporcionado.

Reglas de interpretación del negocio:
- Una transacción de tipo "OUTCOME" es una venta, salida o egreso. El "partnerName" asociado a un "OUTCOME" es el cliente.
- Una transacción de tipo "INCOME" es una compra o ingreso. El "partnerName" asociado a un "INCOME" es el proveedor.
- Para preguntas sobre "¿a quién vendimos?", busca transacciones "OUTCOME" y reporta el "partnerName".
- Si no puedes responder con los datos proporcionados, indícalo claramente diciendo "No tengo suficiente información para responder a esa pregunta". No inventes datos.

Responde de forma concisa, profesional y directa. Usa Markdown para listas o tablas cuando ayude a la lectura. Nunca incorpores información externa al contexto JSON.`;

const getAuthorizationHeaders = () => ({
  'Content-Type': 'application/json',
  Authorization: `Bearer ${OPENAI_API_KEY}`,
});

const parseMessageContent = (message: any): string => {
  if (!message) return '';
  if (Array.isArray(message.content)) {
    const textPart = message.content.find((part: any) => part.type === 'text');
    return textPart?.text ?? '';
  }
  return message.content ?? '';
};

export const isOpenAiConfigured = Boolean(OPENAI_API_KEY);

export const getAiAssistantResponse = async (context: string, question: string): Promise<string> => {
  if (!isOpenAiConfigured) {
    throw new Error('La clave de OpenAI no está configurada.');
  }

  const body = {
    model: OPENAI_MODEL,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: ASSISTANT_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: `Contexto de Datos (JSON):\n${context}\n\nPregunta del Usuario:\n${question}`,
      },
    ],
  };

  const response = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: getAuthorizationHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI respondió con un error: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const message = data?.choices?.[0]?.message;
  return parseMessageContent(message) || 'No obtuve una respuesta del modelo.';
};

const transactionSchema = {
  name: 'TransactionExtraction',
  schema: {
    type: 'object',
    properties: {
      destination: { type: ['string', 'null'] },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            itemName: { type: 'string' },
            quantity: { type: 'number' },
            itemType: { type: 'string', enum: [ItemType.CHAPA, ItemType.MODULO] },
          },
          required: ['itemName', 'quantity', 'itemType'],
        },
      },
    },
    required: ['items'],
  },
};

const controlSchema = {
  name: 'ControlSheetExtraction',
  schema: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        deliveryDate: { type: 'string' },
        model: { type: 'string' },
        quantity: { type: 'number' },
        destination: { type: ['string', 'null'] },
      },
      required: ['deliveryDate', 'model', 'quantity'],
    },
  },
};

const buildJsonPrompt = (docType: DocumentType) => {
  if (docType === DocumentType.CONTROL) {
    return {
      instruction: `Analiza con extremo detalle la planilla de control horizontal adjunta. Cada FILA con datos debe convertirse en un objeto dentro de un ARRAY JSON. Lee con mucha atención la caligrafía para evitar confusiones.

Para cada fila extrae:
- deliveryDate: copia el valor de la columna "FECHA ENTREGA" en formato DD/MM o DD/MM/YY.
- quantity: el número exacto de la columna "CANTIDAD KITS". Si ves símbolos como comillas o espacios, interpreta el número real escrito.
- model: el texto completo de la columna "MODELO" manteniendo códigos como "LM200", "MRZ", "JEG" o "ATRIA". Evita confundir "LM" con "CM" o insertar espacios adicionales en códigos alfanuméricos.
- destination: toma el texto de la columna "DESTINO" cuando exista. Si la celda está vacía pero la fila anterior tiene destino, reutiliza ese valor. Si realmente no hay destino, omite la propiedad.

Reglas esenciales:
- No omitas filas que tengan modelo y cantidad válidos, incluso si el destino está en blanco o ilegible.
- Ignora completamente las columnas "REMITO HT", "ENTREGA", "RETIRA", "FIRMA" y "FECHA TERMINADO".
- Respeta el formato solicitado: devuelve ÚNICAMENTE un ARRAY JSON válido con los objetos descritos. No agregues texto adicional ni comentarios.`,
      schema: controlSchema,
    };
  }

  return {
    instruction: `Analiza con extrema atención el remito o factura adjunto. Debes leer la caligrafía con precisión para interpretar números y texto.

REGLAS CRÍTICAS PARA NÚMEROS ESCRITOS A MANO:
- Precisión total: si dudas, vuelve a revisar. Los totales escritos a mano deben leerse de forma exacta.
- Diferenciá "9" de "2": el 9 tiene un óvalo superior cerrado; el 2 tiene base plana o curva abierta.
- Diferenciá "1" de "7": el 7 suele tener un trazo horizontal cruzándolo.
- Diferenciá "0" de "6": el 0 es un óvalo completo; el 6 tiene un bucle inferior con un trazo ascendente.
- Conserva valores decimales como "2.5" cuando aparezcan; no los conviertas a enteros.

REGLAS PARA TEXTO Y CÓDIGOS:
- Respeta los códigos alfanuméricos tal como están escritos ("LM200", "MRZ", "JEG", "ATRIA"). No reemplaces "LM" por "CM" ni insertes espacios dentro de los códigos.
- Cuando un término aparezca en plural ("CHAPAS"), estandariza a singular ("Chapa") pero conserva la parte distintiva ("Chapa JEG Grande").
- Evita crear artículos nuevos combinando líneas distintas.

Objetivo de extracción (objeto JSON con { "destination": string|null, "items": [...] }):
1. destination: identifica el destinatario buscando campos como "Señor(es)", "Destino" u otros equivalentes. Devuelve null si no aparece claramente. Normaliza espacios extra.
2. items: recorre el detalle del documento y extrae cada línea como un artículo.
   - itemName: describe el artículo con el nombre más específico posible usando el texto del documento (ej. "Modulo LM200", "Chapa HEX", "Modulo 43 W (200 LED Cret 52 LED Samsung)").
   - quantity: toma el número exacto de la columna de cantidad correspondiente a esa línea aplicando las reglas de caligrafía. Respeta números grandes ("160") y valores con decimales ("2.5").
   - itemType: asigna "MODULO" si el nombre contiene "Modulo" y "CHAPA" si contiene "Chapa". Si no coincide con ninguna, dedúcelo cuidadosamente usando el contexto.
   - No inventes filas, no combines artículos distintos y no omitas unidades repetidas si están escritas varias veces.

Devuelve únicamente el JSON solicitado. No incluyas explicaciones, texto adicional ni comentarios fuera del JSON.`,
    schema: transactionSchema,
  };
};

const requestVisionJson = async <T>(file: File, prompt: string, schema: any): Promise<T> => {
  const imageUrl = await readFileAsDataUrl(file);
  const body = {
    model: OPENAI_MODEL,
    temperature: 0,
    response_format: {
      type: 'json_schema',
      json_schema: schema,
    },
    messages: [
      {
        role: 'system',
        content: prompt,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Analiza el documento y responde siguiendo el formato JSON solicitado.',
          },
          {
            type: 'image_url',
            image_url: {
              url: imageUrl,
            },
          },
        ],
      },
    ],
  };

  console.info('[OpenAI Vision] Enviando solicitud', {
    model: OPENAI_MODEL,
    schemaName: schema?.name ?? 'desconocido',
  });

  const response = await fetch(OPENAI_CHAT_URL, {
    method: 'POST',
    headers: getAuthorizationHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI vision falló: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const message = data?.choices?.[0]?.message;
  const raw = parseMessageContent(message);

  if (!raw) {
    throw new Error('OpenAI vision devolvió una respuesta vacía.');
  }

  try {
    const parsed = JSON.parse(raw) as T;
    console.info('[OpenAI Vision] Respuesta JSON recibida', raw.slice(0, 500));
    return parsed;
  } catch (error) {
    console.error('[OpenAI Vision] Error al parsear JSON', { error, raw });
    throw new Error(`OpenAI vision devolvió JSON inválido: ${(error as Error).message}`);
  }
};

export const scanDocument = async (file: File): Promise<ScannedTransactionData> => {
  const { instruction, schema } = buildJsonPrompt(DocumentType.INCOME);
  const result = await requestVisionJson<ScannedTransactionData>(file, instruction, schema);
  if (Array.isArray(result.items)) {
    result.items = result.items.map(item => ({
      ...item,
      itemName: normalizeItemName(item.itemName),
    }));
  }
  return result;
};

export const scanControlSheet = async (file: File): Promise<ScannedControlSheetData[]> => {
  const { instruction, schema } = buildJsonPrompt(DocumentType.CONTROL);
  const result = await requestVisionJson<ScannedControlSheetData[]>(file, instruction, schema);
  return Array.isArray(result)
    ? result.map(row => ({
        ...row,
        model: normalizeItemName(row.model),
      }))
    : [];
};
