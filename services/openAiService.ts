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
      instruction: `Analiza con extremo detalle la planilla de control horizontal adjunta. Cada FILA con datos debe convertirse en un objeto dentro de un ARRAY JSON. Lee la caligrafía con atención doble para no perder dígitos ni letras.

Para cada fila extrae obligatoriamente:
- deliveryDate: copia exactamente la fecha de la columna "FECHA ENTREGA" (formato DD/MM o DD/MM/YY).
- quantity: toma el número completo de la columna "CANTIDAD KITS". Si hay espacios entre dígitos ("1 30"), interprétalos como un único número ("130"). Si observas un punto pequeño o una coma entre dígitos altos ("2.50", "5,10") y no hay anotaciones decimales claras, trátalo como parte del entero continuo ("250", "510"). Ignora marcas como tilde, check o comillas que sólo indican repetición.
- model: transcribe el texto completo de la columna "MODELO" preservando códigos alfanuméricos ("LM200", "MRZ", "JEG", "ATRIA"). No conviertas "LM" en "CM", no cambies "Módulo" por "Modelo" ni agregues espacios internos. Respeta mayúsculas/minúsculas visibles y corrige únicamente errores evidentes de lectura.
- destination: toma el texto de la columna "DESTINO" cuando exista. Si la celda está vacía o contiene símbolos de repetición como comillas dobles (""), "〃" o "--", reutiliza el último destino válido leído anteriormente. Si nunca se declaró un destino, omite la propiedad.

Reglas esenciales:
- Extrae todas las filas con modelo y cantidad visibles, aunque el destino esté en blanco o tachado.
- Ignora por completo las columnas "REMITO HT", "ENTREGA", "RETIRA", "FIRMA" y "FECHA TERMINADO".
- Verifica la longitud de cada número: si la tinta sugiere un cero adicional apagado o trazos superpuestos, inclúyelo para evitar convertir "400" en "40".
- Devuelve ÚNICAMENTE un ARRAY JSON válido siguiendo el esquema. No agregues comentarios ni explicaciones.
- Antes de finalizar, vuelve a revisar cada cantidad y cada código letra por letra para confirmar que no falte ningún dígito ni se haya confundido una letra similar.`,
      schema: controlSchema,
    };
  }

  return {
    instruction: `Analiza con extrema atención el documento adjunto (puede ser remito, factura, nota de pedido o comprobante similar). Debes leer la caligrafía con precisión quirúrgica para interpretar números y texto.

REGLAS CRÍTICAS PARA NÚMEROS ESCRITOS A MANO:
- Precisión total: si dudas, vuelve a revisar la casilla completa y compara con otros renglones.
- Distingue "9" de "2" observando si el óvalo superior está totalmente cerrado (9) o abierto y apoyado en la base (2).
- Distingue "1" de "7": el 7 tiene un trazo horizontal o una pequeña barra central; el 1 suele ser un solo trazo vertical.
- Distingue "0" de "6": el 6 tiene un bucle inferior con cola; el 0 es un óvalo completo.
- Si ves espacios internos ("1 60") o un trazo débil entre dígitos, léelo como un número entero continuo ("160") salvo que haya un separador decimal claro (punto o coma bien marcado) acompañado de decimales pequeños.
- Cuando la columna es de unidades enteras (chapa, módulo, luminaria) y aparece algo como "2.50" o "5,10", revísalo como posible entero "250" o "510"; los puntos/ comas intermedios suelen ser parte del trazo del cero. Solo conserva decimales si el documento explícitamente usa fracciones (kg, metros, litros).
- Vigila ceros finales apagados o atravesados por tildes: confirma si el número es "400" y no "40".
- Ignora marcas de verificación, tildes o anotaciones que no formen parte del número.

REGLAS PARA TEXTO Y CÓDIGOS:
- Respeta los códigos alfanuméricos exactamente como aparecen ("LM200", "MRZ", "JEG", "ATRIA", "HEX"). No sustituyas letras, no agregues espacios y no cambies mayúsculas/minúsculas cuando estén claras.
- Cuando un término esté en plural ("CHAPAS"), estandariza a singular ("Chapa") pero conserva el resto del nombre. Mantén palabras como "Reconstruidos", "Garantía", "HEX".
- No combines descripciones de líneas diferentes ni inventes artículos ausentes. Cada renglón del detalle debe generar un item independiente.
- Mantén el orden original de las líneas para que la lectura coincida con el documento.
- Si la palabra escrita es "Módulo", transcribe "Módulo" o "Modulo" según aparezca. No lo reemplaces por "Modelo" salvo que el texto diga claramente "Modelo".

OBJETIVO (estructura JSON { "destination": string|null, "items": [...] }):
1. destination: identifica el destinatario en campos como "Señor(es)", "Cliente", "Destino" o similares. Prefiere el texto impreso en el formulario (por ejemplo "Municipalidad de Las Heras") antes que interpretaciones dudosas. Limpia espacios extra. Si no existe un destino claro, devuelve null.
2. items: recorre toda la sección de detalle y extrae cada renglón escrito.
   - itemName: utiliza el texto más específico posible del renglón, conservando números de potencia, material y aclaraciones entre paréntesis.
   - quantity: registra el número exacto de la columna de cantidad correspondiente a ese renglón, después de verificarlo con las reglas anteriores. Si el documento repite la misma descripción con cantidades distintas, mantén cada línea.
   - itemType: asigna "MODULO" cuando el nombre contenga "Modulo"/"Módulo" y "CHAPA" cuando contenga "Chapa". Si no hay ninguna palabra clave, determina el tipo con el contexto (por ejemplo "Luminaria" suele ser "MODULO").
   - No omitas unidades repetidas, no conviertas dos líneas en una sola y no cambies el tipo cuando el nombre ya lo indica.

Antes de devolver la respuesta, haz una última lectura de cada destino y cada artículo para confirmar que las letras y números coinciden exactamente con el documento.

Devuelve exclusivamente el JSON solicitado siguiendo el esquema indicado, sin comentarios ni texto adicional.`,
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
