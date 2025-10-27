const STORAGE_KEY = 'punto-limpio-demo-uploads-v1';
export const DEMO_ACCOUNT_EMAIL = 'demo@demo.com';
export const DEMO_UPLOAD_LIMIT = 5;

interface DemoUsageRecord {
  used: number;
  resetsOn: string;
}

type DemoUsageStorage = Record<string, DemoUsageRecord>;

const isBrowser = typeof window !== 'undefined';

const computeNextReset = (reference: Date): string => {
  const next = new Date(reference);
  next.setHours(0, 0, 0, 0);
  next.setMonth(next.getMonth() + 1, 1);
  return next.toISOString();
};

const readStorage = (): DemoUsageStorage => {
  if (!isBrowser) return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DemoUsageStorage) : {};
  } catch (error) {
    console.error('No se pudo leer el almacenamiento de límites demo.', error);
    return {};
  }
};

const writeStorage = (storage: DemoUsageStorage) => {
  if (!isBrowser) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
  } catch (error) {
    console.error('No se pudo persistir el almacenamiento de límites demo.', error);
  }
};

const ensureFreshRecord = (record: DemoUsageRecord | undefined): DemoUsageRecord => {
  const now = new Date();
  if (!record) {
    return { used: 0, resetsOn: computeNextReset(now) };
  }

  const resetDate = new Date(record.resetsOn);
  if (Number.isNaN(resetDate.getTime()) || now >= resetDate) {
    return { used: 0, resetsOn: computeNextReset(now) };
  }
  return record;
};

export interface DemoUsageSnapshot {
  used: number;
  remaining: number;
  resetsOn: string;
}

export const getDemoUsageSnapshot = (
  organizationId: string,
  limit: number = DEMO_UPLOAD_LIMIT
): DemoUsageSnapshot => {
  const storage = readStorage();
  const freshRecord = ensureFreshRecord(storage[organizationId]);
  storage[organizationId] = freshRecord;
  writeStorage(storage);

  const remaining = Math.max(limit - freshRecord.used, 0);
  return {
    used: freshRecord.used,
    remaining,
    resetsOn: freshRecord.resetsOn,
  };
};

export const recordDemoUpload = (
  organizationId: string,
  amount: number = 1,
  limit: number = DEMO_UPLOAD_LIMIT
): DemoUsageSnapshot => {
  const storage = readStorage();
  const freshRecord = ensureFreshRecord(storage[organizationId]);

  const updatedUsed = Math.min(limit, freshRecord.used + amount);
  const updatedRecord: DemoUsageRecord = {
    used: updatedUsed,
    resetsOn: freshRecord.resetsOn,
  };

  storage[organizationId] = updatedRecord;
  writeStorage(storage);

  const remaining = Math.max(limit - updatedRecord.used, 0);
  return {
    used: updatedRecord.used,
    remaining,
    resetsOn: updatedRecord.resetsOn,
  };
};
