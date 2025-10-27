import { UsageCounters, UsageLimitsState, UsagePlanSeed } from '../types';

export type UsageServiceCategory = 'document' | 'assistant';

const STORAGE_KEY = 'punto-limpio-usage-limits-v1';
const DEFAULT_MONTHLY_QUOTA = 1000;

interface StoredUsageRecord {
  organizationId: string;
  planName: string;
  monthlyQuota: number;
  dailyQuota?: number;
  perMinuteQuota?: number;
  used: number;
  resetsOn: string;
  degradeMode: boolean;
  degradeReason?: string;
  lastUpdated: string;
  counters: UsageCounters;
  upgradeRequestedAt?: string;
}

type UsageStorage = Record<string, StoredUsageRecord>;

const getNow = () => new Date();

const readStorage = (): UsageStorage => {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as UsageStorage;
  } catch (error) {
    console.error('Failed to read usage limits storage', error);
    return {};
  }
};

const writeStorage = (storage: UsageStorage) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(storage));
  } catch (error) {
    console.error('Failed to persist usage limits storage', error);
  }
};

const createDefaultCounters = (): UsageCounters => ({
  documentScans: 0,
  assistantSessions: 0,
});

const computeNextReset = (reference: Date): string => {
  const next = new Date(reference);
  next.setUTCDate(reference.getUTCDate());
  next.setUTCHours(0, 0, 0, 0);
  // Move to first day of next month for hard monthly reset
  next.setUTCMonth(reference.getUTCMonth() + 1, 1);
  return next.toISOString();
};

const ensureCycleFreshness = (record: StoredUsageRecord): StoredUsageRecord => {
  const now = getNow();
  const resetDate = new Date(record.resetsOn);
  if (Number.isNaN(resetDate.getTime())) {
    record.resetsOn = computeNextReset(now);
    record.used = 0;
    record.counters = createDefaultCounters();
    record.degradeMode = false;
    record.degradeReason = undefined;
    record.lastUpdated = now.toISOString();
    return record;
  }

  if (now >= resetDate) {
    record.resetsOn = computeNextReset(now);
    record.used = 0;
    record.counters = createDefaultCounters();
    record.degradeMode = false;
    record.degradeReason = undefined;
  }
  record.lastUpdated = now.toISOString();
  return record;
};

const buildRecordFromSeed = (organizationId: string, seed?: UsagePlanSeed): StoredUsageRecord => {
  const now = getNow();
  const counters = createDefaultCounters();
  const monthlyQuota = seed?.monthlyQuota ?? DEFAULT_MONTHLY_QUOTA;
  return {
    organizationId,
    planName: seed?.planName ?? 'Plan Demo Corporativo',
    monthlyQuota,
    dailyQuota: seed?.dailyQuota,
    perMinuteQuota: seed?.perMinuteQuota,
    used: 0,
    resetsOn: seed?.resetsOn ?? computeNextReset(now),
    degradeMode: false,
    lastUpdated: now.toISOString(),
    counters,
  };
};

const toState = (record: StoredUsageRecord): UsageLimitsState => ({
  organizationId: record.organizationId,
  planName: record.planName,
  monthlyQuota: record.monthlyQuota,
  dailyQuota: record.dailyQuota,
  perMinuteQuota: record.perMinuteQuota,
  used: record.used,
  remaining: Math.max(record.monthlyQuota - record.used, 0),
  resetsOn: record.resetsOn,
  degradeMode: record.degradeMode,
  degradeReason: record.degradeReason,
  lastUpdated: record.lastUpdated,
  counters: record.counters,
  upgradeRequestedAt: record.upgradeRequestedAt,
});

export const loadUsageState = (organizationId: string, seed?: UsagePlanSeed): UsageLimitsState => {
  const storage = readStorage();
  let record = storage[organizationId];
  if (!record) {
    record = buildRecordFromSeed(organizationId, seed);
    storage[organizationId] = record;
    writeStorage(storage);
  }

  if (seed) {
    let requiresPersist = false;
    if (seed.planName && seed.planName !== record.planName) {
      record.planName = seed.planName;
      requiresPersist = true;
    }
    if (seed.monthlyQuota && seed.monthlyQuota !== record.monthlyQuota) {
      record.monthlyQuota = seed.monthlyQuota;
      requiresPersist = true;
    }
    if (seed.dailyQuota !== undefined && seed.dailyQuota !== record.dailyQuota) {
      record.dailyQuota = seed.dailyQuota;
      requiresPersist = true;
    }
    if (seed.perMinuteQuota !== undefined && seed.perMinuteQuota !== record.perMinuteQuota) {
      record.perMinuteQuota = seed.perMinuteQuota;
      requiresPersist = true;
    }
    if (seed.resetsOn && seed.resetsOn !== record.resetsOn) {
      record.resetsOn = seed.resetsOn;
      requiresPersist = true;
    }
    if (requiresPersist) {
      storage[organizationId] = record;
      writeStorage(storage);
    }
  }

  const refreshed = ensureCycleFreshness(record);
  storage[organizationId] = refreshed;
  writeStorage(storage);
  return toState(refreshed);
};

const persistRecord = (record: StoredUsageRecord) => {
  const storage = readStorage();
  storage[record.organizationId] = record;
  writeStorage(storage);
};

const updateCounters = (record: StoredUsageRecord, category: UsageServiceCategory, amount: number) => {
  if (category === 'document') {
    record.counters.documentScans += amount;
  } else if (category === 'assistant') {
    record.counters.assistantSessions += amount;
  }
};

export const recordUsage = (
  organizationId: string,
  category: UsageServiceCategory,
  amount: number = 1
): UsageLimitsState => {
  const storage = readStorage();
  let record = storage[organizationId];
  if (!record) {
    record = buildRecordFromSeed(organizationId);
  }

  record = ensureCycleFreshness(record);
  updateCounters(record, category, amount);
  record.used += amount;

  if (record.used >= record.monthlyQuota) {
    record.degradeMode = true;
    record.degradeReason = 'Límite mensual alcanzado. Se habilita modo degradado (solo QR/OCR local).';
  }

  record.lastUpdated = getNow().toISOString();
  storage[organizationId] = record;
  writeStorage(storage);
  return toState(record);
};

export const markDegraded = (
  organizationId: string,
  reason: string = 'Servicio remoto deshabilitado temporalmente.'
): UsageLimitsState => {
  const storage = readStorage();
  let record = storage[organizationId];
  if (!record) {
    record = buildRecordFromSeed(organizationId);
  }
  record = ensureCycleFreshness(record);
  record.degradeMode = true;
  record.degradeReason = reason;
  record.lastUpdated = getNow().toISOString();
  storage[organizationId] = record;
  writeStorage(storage);
  return toState(record);
};

export const clearDegraded = (organizationId: string): UsageLimitsState => {
  const storage = readStorage();
  let record = storage[organizationId];
  if (!record) {
    record = buildRecordFromSeed(organizationId);
  }
  record = ensureCycleFreshness(record);
  record.degradeMode = false;
  record.degradeReason = undefined;
  record.lastUpdated = getNow().toISOString();
  storage[organizationId] = record;
  writeStorage(storage);
  return toState(record);
};

export const requestUpgrade = (organizationId: string): UsageLimitsState => {
  const storage = readStorage();
  let record = storage[organizationId];
  if (!record) {
    record = buildRecordFromSeed(organizationId);
  }
  record = ensureCycleFreshness(record);
  record.upgradeRequestedAt = getNow().toISOString();
  storage[organizationId] = record;
  writeStorage(storage);
  return toState(record);
};

export const clearUpgradeRequest = (organizationId: string): UsageLimitsState => {
  const storage = readStorage();
  let record = storage[organizationId];
  if (!record) {
    record = buildRecordFromSeed(organizationId);
  }
  record = ensureCycleFreshness(record);
  record.upgradeRequestedAt = undefined;
  storage[organizationId] = record;
  writeStorage(storage);
  return toState(record);
};

export const setPlan = (organizationId: string, seed: UsagePlanSeed): UsageLimitsState => {
  const storage = readStorage();
  let record = storage[organizationId];
  if (!record) {
    record = buildRecordFromSeed(organizationId, seed);
  } else {
    record.planName = seed.planName ?? record.planName;
    record.monthlyQuota = seed.monthlyQuota ?? record.monthlyQuota;
    record.dailyQuota = seed.dailyQuota ?? record.dailyQuota;
    record.perMinuteQuota = seed.perMinuteQuota ?? record.perMinuteQuota;
    record.resetsOn = seed.resetsOn ?? record.resetsOn;
  }
  storage[organizationId] = record;
  writeStorage(storage);
  return toState(record);
};

export const canUseRemoteAnalysis = (state: UsageLimitsState | null): boolean => {
  if (!state) return false;
  if (state.degradeMode) return false;
  return state.used < state.monthlyQuota;
};
