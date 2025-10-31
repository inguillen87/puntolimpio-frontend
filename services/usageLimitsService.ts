import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable, HttpsCallable } from 'firebase/functions';
import { db, functions as cloudFunctions } from '../firebaseConfig';
import { UsageLimitsState } from '../types';

export type UsageServiceCategory = 'document' | 'assistant';

const ensureFunctions = () => {
  if (!cloudFunctions) {
    throw new Error('FUNCTIONS_NOT_CONFIGURED');
  }
  return cloudFunctions;
};

export const periodNowYYYYMM = (): string => {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}${month}`;
};

const normalizeResetAt = (value: unknown): string | null => {
  if (!value) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'object' && value !== null && 'toDate' in value) {
    try {
      const date = (value as { toDate: () => Date }).toDate();
      if (date instanceof Date && !Number.isNaN(date.getTime())) {
        return date.toISOString();
      }
    } catch (error) {
      console.warn('No se pudo normalizar resetAt desde Firestore.', error);
    }
  }
  return null;
};

const buildQuotaDocId = (organizationId: string, uid: string, period: string = periodNowYYYYMM()): string =>
  `${organizationId}__${uid}__${period}`;

export const loadUsageState = async (organizationId: string, uid: string): Promise<UsageLimitsState | null> => {
  if (!db) return null;
  const period = periodNowYYYYMM();
  const ref = doc(db, 'quota', buildQuotaDocId(organizationId, uid, period));
  const snapshot = await getDoc(ref);
  const nowIso = new Date().toISOString();

  if (!snapshot.exists()) {
    return {
      organizationId,
      userId: uid,
      period,
      chatRemaining: null,
      mediaRemaining: null,
      resetAt: null,
      lastSyncedAt: nowIso,
    };
  }

  const data = snapshot.data() as Record<string, unknown>;
  const chatRemaining = typeof data.chatRemaining === 'number' ? data.chatRemaining : null;
  const mediaRemaining = typeof data.mediaRemaining === 'number' ? data.mediaRemaining : null;
  const periodValue = typeof data.period === 'string' ? data.period : period;
  const resetAt = normalizeResetAt(data.resetAt);

  return {
    organizationId,
    userId: uid,
    period: periodValue,
    chatRemaining,
    mediaRemaining,
    resetAt,
    lastSyncedAt: nowIso,
  };
};

export const canUseRemoteAnalysis = (
  state: UsageLimitsState | null,
  category: UsageServiceCategory = 'document'
): boolean => {
  if (!state) return true;
  if (category === 'assistant') {
    return state.chatRemaining === null || state.chatRemaining > 0;
  }
  return state.mediaRemaining === null || state.mediaRemaining > 0;
};

let consumeChatCallable: HttpsCallable<unknown, { remaining: number }> | null = null;
let signedUploadCallable: HttpsCallable<{ contentType: string }, SignedUploadDetails> | null = null;

const ensureConsumeChatCallable = () => {
  if (!consumeChatCallable) {
    consumeChatCallable = httpsCallable<unknown, { remaining: number }>(ensureFunctions(), 'consumeChatCredit');
  }
  return consumeChatCallable;
};

const ensureSignedUploadCallable = () => {
  if (!signedUploadCallable) {
    signedUploadCallable = httpsCallable<{ contentType: string }, SignedUploadDetails>(
      ensureFunctions(),
      'getSignedUploadUrl'
    );
  }
  return signedUploadCallable;
};

export const consumeChatCredit = async (): Promise<number> => {
  const callable = ensureConsumeChatCallable();
  const result = await callable();
  const remaining = (result.data as { remaining?: unknown })?.remaining;
  if (typeof remaining !== 'number') {
    throw new Error('INVALID_RESPONSE');
  }
  return remaining;
};

export interface SignedUploadDetails {
  uploadUrl: string;
  path: string;
  contentType: string;
}

export const requestSignedUploadUrl = async (contentType: string): Promise<SignedUploadDetails> => {
  const callable = ensureSignedUploadCallable();
  const result = await callable({ contentType });
  const data = result.data as Partial<SignedUploadDetails> | null | undefined;
  if (!data || typeof data.uploadUrl !== 'string' || typeof data.path !== 'string') {
    throw new Error('INVALID_RESPONSE');
  }
  return {
    uploadUrl: data.uploadUrl,
    path: data.path,
    contentType: data.contentType ?? contentType,
  };
};
