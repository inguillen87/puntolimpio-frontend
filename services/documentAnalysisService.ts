import { BrowserQRCodeReader } from '@zxing/browser';
import { DocumentType, ItemType, ScannedControlSheetData, ScannedTransactionData } from '../types';
import { preprocessImage } from '../utils/imageProcessing';
import { computeFileHash } from '../utils/hash';
import { canonicalItemKey, normalizeItemName, normalizePartnerName } from '../utils/itemNormalization';
import { runLocalControlAnalysis, runLocalTransactionAnalysis } from './localOcrService';
import { getCachedAnalysis, setCachedAnalysis, recordAuditEntry, AnalysisSource } from './scanCacheService';
import { scanDocument as scanDocumentRemote, scanControlSheet as scanControlSheetRemote, isRemoteProviderConfigured, getProviderLabel } from './aiService';

interface BaseOutcome {
  hash: string;
  source: AnalysisSource;
  fromCache: boolean;
  usedRemote: boolean;
  processedFile: File;
  previewDataUrl: string;
}

export type TransactionAnalysisOutcome = BaseOutcome & { data: ScannedTransactionData };
export type ControlAnalysisOutcome = BaseOutcome & { data: ScannedControlSheetData[] };

export type AnalysisOutcome = TransactionAnalysisOutcome | ControlAnalysisOutcome;

const qrReader = new BrowserQRCodeReader();

const parseQrTransaction = (raw: string): ScannedTransactionData | null => {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.items)) {
      return {
        destination: parsed.destination ? normalizePartnerName(parsed.destination) : null,
        items: parsed.items.map((item: any) => ({
          itemName: normalizeItemName(String(item.itemName ?? item.name ?? '')),
          quantity: Number(item.quantity ?? 0),
          itemType: item.itemType === ItemType.CHAPA ? ItemType.CHAPA : ItemType.MODULO,
        })).filter(item => item.itemName && item.quantity > 0),
      };
    }
  } catch (error) {
    // Not JSON - try pipe separated format
    const parts = raw.split(/\n|;/).map(segment => segment.trim()).filter(Boolean);
    const items = parts.map(segment => {
      const [name, qty] = segment.split(/[:|,]/).map(value => value.trim());
      const quantity = parseInt(qty ?? '', 10);
      if (!name || Number.isNaN(quantity)) return null;
      const normalizedName = normalizeItemName(name);
      return {
        itemName: normalizedName,
        quantity,
        itemType: normalizedName.toLowerCase().includes('chapa') ? ItemType.CHAPA : ItemType.MODULO,
      };
    }).filter(Boolean) as ScannedTransactionData['items'];

    if (items.length > 0) {
      return { destination: null, items };
    }
  }
  return null;
};

const parseQrControl = (raw: string): ScannedControlSheetData[] | null => {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map(row => ({
        deliveryDate: row.deliveryDate,
        destination: row.destination ?? undefined,
        model: normalizeItemName(String(row.model ?? '')),
        quantity: Number(row.quantity ?? 0),
      })).filter(row => row.deliveryDate && row.model && row.quantity > 0);
    }
  } catch (error) {
    return null;
  }
  return null;
};

const tryDecodeQr = async (dataUrl: string): Promise<string | null> => {
  const image = new Image();
  image.src = dataUrl;
  return new Promise(resolve => {
    image.onload = async () => {
      try {
        const result = await qrReader.decodeFromImageElement(image);
        resolve(result.getText());
      } catch (error) {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
  });
};

const normalizeTransaction = (data: ScannedTransactionData): ScannedTransactionData => {
  const seen = new Map<string, ScannedTransactionData['items'][number]>();
  data.items.forEach(item => {
    const normalizedName = normalizeItemName(item.itemName);
    const key = canonicalItemKey(normalizedName);
    const existing = seen.get(key);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      seen.set(key, {
        itemName: normalizedName,
        quantity: item.quantity,
        itemType: item.itemType,
      });
    }
  });
  return {
    destination: data.destination ? normalizePartnerName(data.destination) : null,
    items: Array.from(seen.values()),
  };
};

const normalizeControlRows = (rows: ScannedControlSheetData[]): ScannedControlSheetData[] =>
  rows.map(row => ({
    deliveryDate: row.deliveryDate,
    destination: row.destination ? normalizePartnerName(row.destination) : undefined,
    model: normalizeItemName(row.model),
    quantity: row.quantity,
  }));

const buildOutcome = <T>(params: Omit<BaseOutcome, 'source'> & { source: AnalysisSource; data: T }): AnalysisOutcome => {
  const { data, ...rest } = params;
  return { ...rest, data } as AnalysisOutcome;
};

interface AnalyzeOptions {
  allowRemote: boolean;
}

export const analyzeDocument = async (
  originalFile: File,
  docType: DocumentType,
  options: AnalyzeOptions
): Promise<AnalysisOutcome> => {
  const { file: processedFile, dataUrl } = await preprocessImage(originalFile);
  const hash = await computeFileHash(processedFile);

  const cached = getCachedAnalysis<ScannedTransactionData | ScannedControlSheetData[]>(hash, docType);
  if (cached) {
    recordAuditEntry({
      hash,
      docType,
      source: cached.source,
      savedAt: Date.now(),
      sizeInBytes: processedFile.size,
    });
    if (docType === DocumentType.CONTROL) {
      return buildOutcome({
        data: cached.payload as ScannedControlSheetData[],
        hash,
        source: cached.source,
        fromCache: true,
        usedRemote: cached.source === 'remote',
        processedFile,
        previewDataUrl: dataUrl,
      });
    }
    return buildOutcome({
      data: cached.payload as ScannedTransactionData,
      hash,
      source: cached.source,
      fromCache: true,
      usedRemote: cached.source === 'remote',
      processedFile,
      previewDataUrl: dataUrl,
    });
  }

  let source: AnalysisSource = 'ocr';
  let usedRemote = false;
  let payload: ScannedTransactionData | ScannedControlSheetData[];

  const qrContent = await tryDecodeQr(dataUrl);
  if (qrContent) {
    if (docType === DocumentType.CONTROL) {
      const parsedControl = parseQrControl(qrContent);
      if (parsedControl && parsedControl.length > 0) {
        payload = normalizeControlRows(parsedControl);
        source = 'qr';
        usedRemote = false;
        setCachedAnalysis({ hash, docType, savedAt: Date.now(), source, payload });
        recordAuditEntry({ hash, docType, source, savedAt: Date.now(), sizeInBytes: processedFile.size });
        return buildOutcome({ data: payload, hash, source, fromCache: false, usedRemote, processedFile, previewDataUrl: dataUrl });
      }
    } else {
      const parsed = parseQrTransaction(qrContent);
      if (parsed && parsed.items.length > 0) {
        payload = normalizeTransaction(parsed);
        source = 'qr';
        usedRemote = false;
        setCachedAnalysis({ hash, docType, savedAt: Date.now(), source, payload });
        recordAuditEntry({ hash, docType, source, savedAt: Date.now(), sizeInBytes: processedFile.size });
        return buildOutcome({ data: payload, hash, source, fromCache: false, usedRemote, processedFile, previewDataUrl: dataUrl });
      }
    }
  }

  if (docType === DocumentType.CONTROL) {
    payload = normalizeControlRows(await runLocalControlAnalysis(processedFile));
  } else {
    payload = normalizeTransaction(await runLocalTransactionAnalysis(processedFile));
  }

  const hasData = docType === DocumentType.CONTROL
    ? (payload as ScannedControlSheetData[]).length > 0
    : (payload as ScannedTransactionData).items.length > 0;

  if (!hasData && options.allowRemote && isRemoteProviderConfigured()) {
    try {
      if (docType === DocumentType.CONTROL) {
        payload = normalizeControlRows(await scanControlSheetRemote(processedFile));
      } else {
        payload = normalizeTransaction(await scanDocumentRemote(processedFile));
      }
      source = 'remote';
      usedRemote = true;
    } catch (error: any) {
      console.error('Fallo el análisis remoto', error);
      throw new Error(`El proveedor remoto ${getProviderLabel()} devolvió un error: ${error.message || error}`);
    }
  } else if (!hasData && (!options.allowRemote || !isRemoteProviderConfigured())) {
    throw new Error('No se pudo extraer información con OCR local y el análisis remoto está deshabilitado. Usa el registro manual.');
  }

  if (docType === DocumentType.CONTROL && (payload as ScannedControlSheetData[]).length === 0) {
    throw new Error('No se pudo detectar ninguna fila en la planilla. Intenta con una imagen más clara.');
  }
  if (docType !== DocumentType.CONTROL && (payload as ScannedTransactionData).items.length === 0) {
    throw new Error('No se encontraron artículos válidos en el documento.');
  }

  setCachedAnalysis({ hash, docType, savedAt: Date.now(), source, payload });
  recordAuditEntry({ hash, docType, source, savedAt: Date.now(), sizeInBytes: processedFile.size });

  return buildOutcome({ data: payload, hash, source, fromCache: false, usedRemote, processedFile, previewDataUrl: dataUrl });
};
