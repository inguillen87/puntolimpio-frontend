import { doc, runTransaction } from 'firebase/firestore';
import { db, isFirebaseConfigured } from '../firebaseConfig';

const STORAGE_KEY = 'punto-limpio-demo-uploads-v2';
const COLLECTION = 'demoUsageLimits';

export const DEMO_UPLOAD_LIMIT = 5;

export interface DemoAccountConfig {
  email: string;
  limit: number;
  label: string;
}

const LIMITED_ACCOUNTS: Record<string, DemoAccountConfig> = {
  'demo@demo.com': {
    email: 'demo@demo.com',
    limit: DEMO_UPLOAD_LIMIT,
    label: 'Demo público',
  },
  'prueba@prueba.com': {
    email: 'prueba@prueba.com',
    limit: DEMO_UPLOAD_LIMIT,
    label: 'Piloto Junín',
  },
};

export const getDemoAccountConfig = (email?: string | null): DemoAccountConfig | null => {
  if (!email) return null;
  return LIMITED_ACCOUNTS[email.toLowerCase()] ?? null;
};

export interface DemoUsageScope {
  organizationId: string;
  userId: string;
  email?: string | null;
}

interface DemoUsageRecord {
  organizationId: string;
  userId: string;
  email?: string | null;
  limit: number;
  used: number;
  resetsOn: string;
  updatedAt?: string;
}

type DemoUsageStorage = Record<string, DemoUsageRecord>;

type RecordMutator = (record: DemoUsageRecord, limit: number) => DemoUsageRecord;

export interface DemoUsageSnapshot {
  used: number;
  remaining: number;
  resetsOn: string;
}

const buildScopeKey = (scope: DemoUsageScope): string => {
  const userKey = scope.userId || scope.email || 'anon';
  return `${scope.organizationId}__${userKey}`;
};

const computeNextReset = (reference: Date): string => {
  const next = new Date(reference);
  next.setHours(0, 0, 0, 0);
  next.setMonth(next.getMonth() + 1, 1);
  return next.toISOString();
};

const clampUsage = (value: number, limit: number): number => {
  if (Number.isNaN(value)) return 0;
  return Math.min(Math.max(value, 0), Math.max(limit, 0));
};

const refreshRecord = (
  record: DemoUsageRecord | undefined,
  scope: DemoUsageScope,
  limit: number,
  now: Date
): DemoUsageRecord => {
  const nextLimit = limit > 0 ? limit : DEMO_UPLOAD_LIMIT;
  const base: DemoUsageRecord = record
    ? { ...record }
    : {
        organizationId: scope.organizationId,
        userId: scope.userId,
        email: scope.email ? scope.email.toLowerCase() : undefined,
        limit: nextLimit,
        used: 0,
        resetsOn: computeNextReset(now),
      };

  base.limit = nextLimit;
  if (scope.email) {
    base.email = scope.email.toLowerCase();
  }

  if (!base.resetsOn) {
    base.resetsOn = computeNextReset(now);
  }

  const resetDate = new Date(base.resetsOn);
  if (Number.isNaN(resetDate.getTime()) || now >= resetDate) {
    base.used = 0;
    base.resetsOn = computeNextReset(now);
  }

  base.used = clampUsage(base.used, nextLimit);
  return base;
};

const applyMutator = (
  record: DemoUsageRecord,
  limit: number,
  mutator?: RecordMutator
): DemoUsageRecord => {
  if (!mutator) {
    return record;
  }
  const mutated = mutator({ ...record }, limit);
  mutated.limit = limit;
  if (!mutated.resetsOn) {
    mutated.resetsOn = record.resetsOn;
  }
  mutated.used = clampUsage(mutated.used, limit);
  return mutated;
};

const toSnapshot = (record: DemoUsageRecord, limit: number): DemoUsageSnapshot => {
  const effectiveLimit = limit > 0 ? limit : DEMO_UPLOAD_LIMIT;
  const remaining = Math.max(effectiveLimit - clampUsage(record.used, effectiveLimit), 0);
  return {
    used: clampUsage(record.used, effectiveLimit),
    remaining,
    resetsOn: record.resetsOn,
  };
};

const readStorage = (): DemoUsageStorage => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DemoUsageStorage) : {};
  } catch (error) {
    console.error('No se pudo leer el almacenamiento de límites demo.', error);
    return {};
  }
};

const writeStorage = (storage: DemoUsageStorage) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
  } catch (error) {
    console.error('No se pudo persistir el almacenamiento de límites demo.', error);
  }
};

const ensureLocalSnapshot = (
  scope: DemoUsageScope,
  limit: number,
  mutator?: RecordMutator
): DemoUsageSnapshot => {
  const storage = readStorage();
  const key = buildScopeKey(scope);
  const now = new Date();
  const refreshed = refreshRecord(storage[key], scope, limit, now);
  const mutated = applyMutator(refreshed, refreshed.limit, mutator);
  storage[key] = { ...mutated, updatedAt: now.toISOString() };
  writeStorage(storage);
  return toSnapshot(mutated, mutated.limit);
};

const ensureRemoteSnapshot = async (
  scope: DemoUsageScope,
  limit: number,
  mutator?: RecordMutator
): Promise<DemoUsageSnapshot> => {
  if (!db) {
    throw new Error('Firestore no está configurado.');
  }

  const docRef = doc(db, COLLECTION, buildScopeKey(scope));
  return runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(docRef);
    const now = new Date();
    const refreshed = refreshRecord(
      snapshot.exists() ? (snapshot.data() as DemoUsageRecord) : undefined,
      scope,
      limit,
      now
    );
    const mutated = applyMutator(refreshed, refreshed.limit, mutator);
    transaction.set(docRef, {
      ...mutated,
      organizationId: scope.organizationId,
      userId: scope.userId,
      email: scope.email ? scope.email.toLowerCase() : mutated.email,
      updatedAt: now.toISOString(),
    });
    return toSnapshot(mutated, mutated.limit);
  });
};

const ensureSnapshot = async (
  scope: DemoUsageScope,
  limit: number,
  mutator?: RecordMutator
): Promise<DemoUsageSnapshot> => {
  if (isFirebaseConfigured) {
    try {
      return await ensureRemoteSnapshot(scope, limit, mutator);
    } catch (error) {
      console.warn('Fallo el control remoto de cuota demo, se usará almacenamiento local.', error);
    }
  }
  return ensureLocalSnapshot(scope, limit, mutator);
};

export const getDemoUsageSnapshot = async (
  scope: DemoUsageScope,
  limit: number = DEMO_UPLOAD_LIMIT
): Promise<DemoUsageSnapshot> => {
  return ensureSnapshot(scope, limit);
};

export const recordDemoUpload = async (
  scope: DemoUsageScope,
  amount: number = 1,
  limit: number = DEMO_UPLOAD_LIMIT
): Promise<DemoUsageSnapshot> => {
  const mutator: RecordMutator = (record, activeLimit) => {
    const increment = Number.isFinite(amount) ? amount : 0;
    return {
      ...record,
      used: clampUsage(record.used + increment, activeLimit),
    };
  };
  return ensureSnapshot(scope, limit, mutator);
};
