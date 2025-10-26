import { DocumentType } from '../types';

export type AnalysisSource = 'qr' | 'ocr' | 'remote';

interface CacheRecord<T> {
  hash: string;
  docType: DocumentType;
  savedAt: number;
  source: AnalysisSource;
  payload: T;
}

interface AuditEntry {
  hash: string;
  docType: DocumentType;
  source: AnalysisSource;
  savedAt: number;
  sizeInBytes?: number;
}

const CACHE_KEY = 'punto-limpio-scan-cache-v1';
const AUDIT_KEY = 'punto-limpio-scan-audit-v1';
const MAX_CACHE_AGE_MS = 1000 * 60 * 60 * 24 * 30; // 30 días
const MAX_AUDIT_ENTRIES = 200;

const readStorage = <T>(key: string): T[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    return JSON.parse(raw) as T[];
  } catch (error) {
    console.warn(`No se pudo leer ${key} desde localStorage`, error);
    return [];
  }
};

const writeStorage = <T>(key: string, data: T[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.warn(`No se pudo guardar ${key} en localStorage`, error);
  }
};

export const getCachedAnalysis = <T>(hash: string, docType: DocumentType): CacheRecord<T> | null => {
  const records = readStorage<CacheRecord<T>>(CACHE_KEY);
  const now = Date.now();
  const validRecords = records.filter(record => now - record.savedAt <= MAX_CACHE_AGE_MS);
  if (validRecords.length !== records.length) {
    writeStorage(CACHE_KEY, validRecords);
  }
  return validRecords.find(record => record.hash === hash && record.docType === docType) || null;
};

export const setCachedAnalysis = <T>(record: CacheRecord<T>) => {
  const records = readStorage<CacheRecord<T>>(CACHE_KEY);
  const filtered = records.filter(existing => existing.hash !== record.hash || existing.docType !== record.docType);
  filtered.push(record);
  writeStorage(CACHE_KEY, filtered);
};

export const recordAuditEntry = (entry: AuditEntry) => {
  const records = readStorage<AuditEntry>(AUDIT_KEY);
  records.push(entry);
  const trimmed = records.slice(-MAX_AUDIT_ENTRIES);
  writeStorage(AUDIT_KEY, trimmed);
};

export const clearScanCaches = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(CACHE_KEY);
  window.localStorage.removeItem(AUDIT_KEY);
};

export type { CacheRecord, AuditEntry };
