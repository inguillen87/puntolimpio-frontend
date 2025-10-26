import { GoogleGenAI, Type } from "@google/genai";
import { ItemType, ScannedTransactionData, ScannedControlSheetData } from '../types';

const GEMINI_API_KEY =
  import.meta.env.VITE_GEMINI_API_KEY ??
  // Support existing build-time replacement
  (process.env.GEMINI_API_KEY as string | undefined) ??
  '';

export const isGeminiConfigured = Boolean(GEMINI_API_KEY);

let aiClient: GoogleGenAI | null = null;

const getClient = () => {
  if (!isGeminiConfigured) {
    throw new Error('La clave de la API de Gemini no está configurada.');
  }

  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  }

  return aiClient;
};

const fileToGenerativePart = async (file: File) => {
  const base64EncodedDataPromise = new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(file);
  });
  return {
    inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
  };
};

export const getAiAssistantResponse = async (context: string, question: string): Promise<string> => {
    const model = 'gemini-2.5-flash';
    const prompt = `
        **System**: Eres "Punto Limpio AI", un asistente experto en logística y gestión de inventario. Tu conocimiento se basa ÚNICAMENTE en el contexto de datos JSON proporcionado. Responde de forma concisa, profesional y directa a la pregunta del usuario. Formatea las listas y tablas de forma clara usando Markdown para fácil lectura.

        **Reglas de Interpretación del Negocio**:
        - Una transacción de tipo "OUTCOME" es una venta, salida o egreso. El "partnerName" asociado a un "OUTCOME" es el **cliente**.
        - Una transacción de tipo "INCOME" es una compra o ingreso. El "partnerName" asociado a un "INCOME" es el **proveedor**.
        - Para preguntas sobre "¿a quién vendimos?", debes buscar las transacciones "OUTCOME" y reportar el "partnerName".
        - Si no puedes responder con los datos proporcionados, indícalo claramente diciendo "No tengo suficiente información para responder a esa pregunta". No inventes datos.

        **Contexto de Datos (JSON)**:
        ${context}

        **Pregunta del Usuario**:
        ${question}
    `;
    try {
        const ai = getClient();
        const response = await ai.models.generateContent({
            model: model,
            contents: prompt,
        });
        return response.text;
    } catch (error) {
        console.error("Error getting AI assistant response:", error);
        return "Lo siento, tuve un problema al procesar tu solicitud. Por favor, inténtalo de nuevo.";
    }
};


export const scanDocument = async (imageFile: File): Promise<ScannedTransactionData> => {
  const model = 'gemini-2.5-flash';
  const imagePart = await fileToGenerativePart(imageFile);

  const prompt = `
    Analiza con extrema atención el documento adjunto (remito, factura), prestando especial atención a la caligrafía para interpretar correctamente los números y texto. Tu objetivo es extraer el DESTINO y una lista precisa de ARTÍCULOS.

    **REGLAS CRÍTICAS PARA NÚMEROS ESCRITOS A MANO:**
    - **Precisión Extrema:** Los números pueden ser ambiguos. Verifica dos veces.
    - **Diferenciar '9' de '2':** Un '9' tiene un círculo SUPERIOR completamente CERRADO. Un '2' tiene una base PLANA o una curva abierta en la parte INFERIOR. Por ejemplo, en un remito, "190" es correcto, no "120", si el círculo del 9 está cerrado.
    - **Diferenciar '1' de '7':** Un '1' es a menudo un palo vertical. Un '7' usualmente tiene una línea horizontal que lo cruza.
    - **Diferenciar '0' de '6':** Un '0' es un óvalo. Un '6' tiene un bucle inferior y un trazo ascendente.

    1.  **DESTINO**: Identifica el destinatario. Busca campos como "Señor(es):", "Destino:", etc. Estandarízalo (ej: "Municipalidad de Las Heras"). Si no se encuentra, devuelve null.

    2.  **ARTÍCULOS**: Enfócate en la sección "DETALLE". Extrae cada línea como un artículo separado.
        -   **No asumas.** No inventes artículos. Si dice "Luminarias... Modulo Lm200", el artículo es "Modulo Lm200". **No debes agregar una "Chapa Lm200" a menos que esté explícitamente escrita en otra línea.**
        -   **Nombre del Artículo (itemName)**: Extrae el nombre más específico posible. "Modulo Lm200", "Chapa Hex", "Modulo 43W". Estandariza plurales ("CHAPAS" -> "Chapa").
        -   **Cantidad (quantity)**: Lee el número de la columna "CANTIDAD" para esa fila. **Aplica las reglas de números a mano para ser muy preciso.**
        -   **Tipo de Artículo (itemType)**: Clasifica como "CHAPA" o "MODULO". Si el nombre contiene "Modulo", es "MODULO". Si contiene "Chapa", es "CHAPA".

    Devuelve SÓLO un objeto JSON válido con la estructura { "destination": "string|null", "items": [...] }. No incluyas explicaciones ni texto adicional fuera del JSON.
  `;

  try {
    const ai = getClient();
    const result = await ai.models.generateContent({
        model: model,
        contents: { parts: [{ text: prompt }, imagePart] },
        config: {
            responseMimeType: "application/json",
            responseSchema: {
                type: Type.OBJECT,
                properties: {
                    destination: {
                        type: Type.STRING,
                        description: 'El destinatario del documento (ej: "Municipalidad de Las Heras"). Puede ser null.',
                        nullable: true,
                    },
                    items: {
                        type: Type.ARRAY,
                        items: {
                            type: Type.OBJECT,
                            properties: {
                                itemName: { type: Type.STRING, description: 'El nombre estandarizado del artículo (ej: "Chapa JC250").' },
                                quantity: { type: Type.NUMBER, description: 'La cantidad del artículo.' },
                                itemType: { type: Type.STRING, enum: [ItemType.CHAPA, ItemType.MODULO], description: 'El tipo de artículo, debe ser "CHAPA" o "MODULO".' }
                            },
                            required: ["itemName", "quantity", "itemType"]
                        }
                    }
                },
                required: ["items"]
            }
        }
    });

    const jsonString = result.text.trim();
    const parsedResult = JSON.parse(jsonString);
    
    if (parsedResult && Array.isArray(parsedResult.items)) {
        return parsedResult as ScannedTransactionData;
    }
    return { items: [], destination: null };

  } catch (error) {
    console.error("Error procesando el documento con la API de Gemini:", error);
    throw new Error("Falló el análisis del documento. El formato puede no ser compatible o la imagen no es clara.");
  }
};

export const scanControlSheet = async (imageFile: File): Promise<ScannedControlSheetData[]> => {
    const model = 'gemini-2.5-flash';
    const imagePart = await fileToGenerativePart(imageFile);

    const prompt = `
        Analiza la planilla de control horizontal. Tu tarea es extraer CADA FILA que contenga datos como un objeto separado dentro de un array JSON. Presta especial atención a la caligrafía.

        Para cada fila, extrae la siguiente información:
        -   fecha_entrega: La fecha en la columna "FECHA ENTREGA". Formato "DD/MM" o "DD/MM/YY".
        -   cantidad_kits: El número en la columna "CANTIDAD KITS".
        -   modelo: El texto en la columna "MODELO".
        -   destino: El texto en la columna "DESTINO". Este campo es opcional. Si está vacío, tiene un símbolo de repetición (como " o ,,) o es ilegible, puedes omitir la propiedad 'destino'. Si una fila no tiene destino pero la fila anterior sí, asume que es el mismo destino.

        **Reglas Importantes:**
        - **No omitas filas:** Extrae todas las filas que tengan al menos un modelo y una cantidad, incluso si el destino falta.
        - **Ignora columnas irrelevantes:** No proceses "REMITO HT", "ENTREGA", "RETIRA", "FIRMA" y "FECHA TERMINADO".
        - **Formato estricto:** Devuelve SÓLAMENTE un array JSON válido. No incluyas explicaciones.
    `;

    try {
        const ai = getClient();
        const result = await ai.models.generateContent({
            model: model,
            contents: { parts: [{ text: prompt }, imagePart] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.ARRAY,
                    items: {
                        type: Type.OBJECT,
                        properties: {
                            fecha_entrega: { type: Type.STRING, description: 'Fecha de entrega, ej: "21/5"' },
                            cantidad_kits: { type: Type.NUMBER, description: 'Cantidad de kits' },
                            modelo: { type: Type.STRING, description: 'Modelo del kit' },
                            destino: { type: Type.STRING, description: 'Destino de la entrega. Puede ser nulo o no estar presente.', nullable: true }
                        },
                        required: ["fecha_entrega", "cantidad_kits", "modelo"]
                    }
                }
            }
        });

        const jsonString = result.text.trim();
        const parsedResult = JSON.parse(jsonString);

        return (parsedResult as any[]).map(item => ({
            deliveryDate: item.fecha_entrega,
            quantity: item.cantidad_kits,
            model: item.modelo,
            destination: item.destino
        }));
    } catch (error) {
        console.error("Error procesando la planilla de control:", error);
        throw new Error("Falló el análisis de la planilla de control. Asegúrate de que la imagen sea clara y esté bien orientada.");
    }
}