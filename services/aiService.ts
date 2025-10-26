import { ScannedControlSheetData, ScannedTransactionData } from '../types';
import * as gemini from './geminiService';
import * as openai from './openAiService';

type RemoteAiProvider = 'gemini' | 'openai';
export type AiProviderName = RemoteAiProvider | 'none';

const PROVIDER_LABELS: Record<RemoteAiProvider, string> = {
  gemini: 'Gemini',
  openai: 'OpenAI',
};

type ProviderPreference = AiProviderName[];

const parseProviderPreference = (): ProviderPreference => {
  const rawPreference = (import.meta.env.VITE_AI_PROVIDER ??
    (typeof process !== 'undefined' ? process.env.AI_PROVIDER : undefined) ??
    'openai,gemini'
  ).toString();

  const tokens = rawPreference
    .split(',')
    .map(token => token.trim().toLowerCase())
    .filter(Boolean) as AiProviderName[];

  if (tokens.length === 0) {
    return ['openai', 'gemini'];
  }

  const seen = new Set<AiProviderName>();
  const preference: AiProviderName[] = [];
  for (const token of tokens) {
    if ((token === 'openai' || token === 'gemini' || token === 'none') && !seen.has(token)) {
      preference.push(token);
      seen.add(token);
      if (token === 'none') break;
    }
  }

  return preference.length > 0 ? preference : ['openai', 'gemini'];
};

const providerPreference = parseProviderPreference();
const remoteDisabled = providerPreference.length === 1 && providerPreference[0] === 'none';

const preferredRemoteProviders = providerPreference.filter(
  (provider): provider is RemoteAiProvider => provider !== 'none'
);

const configuredProviders: RemoteAiProvider[] = preferredRemoteProviders.filter(provider => {
  if (provider === 'openai') return openai.isOpenAiConfigured;
  return gemini.isGeminiConfigured;
});

let lastSuccessfulProvider: RemoteAiProvider | null = configuredProviders[0] ?? null;

export const getActiveProvider = (): AiProviderName => {
  if (remoteDisabled) return 'none';
  if (configuredProviders.length > 0) return configuredProviders[0];
  return preferredRemoteProviders[0] ?? 'none';
};

export const isRemoteProviderConfigured = (): boolean => configuredProviders.length > 0;

const ensureRemoteAvailable = () => {
  if (remoteDisabled) {
    throw new Error('El proveedor de IA está deshabilitado.');
  }
  if (!isRemoteProviderConfigured()) {
    throw new Error('No hay proveedores remotos configurados.');
  }
};

const runWithProviders = async <T>(executor: (provider: RemoteAiProvider) => Promise<T>): Promise<T> => {
  ensureRemoteAvailable();

  const errors: string[] = [];
  for (const provider of configuredProviders) {
    try {
      const result = await executor(provider);
      lastSuccessfulProvider = provider;
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${PROVIDER_LABELS[provider]}: ${message}`);
      console.warn(`[AI Service] ${PROVIDER_LABELS[provider]} falló`, error);
    }
  }

  throw new Error(errors.join(' | '));
};

export const getAiAssistantResponse = async (context: string, question: string): Promise<string> =>
  runWithProviders(provider =>
    provider === 'openai'
      ? openai.getAiAssistantResponse(context, question)
      : gemini.getAiAssistantResponse(context, question)
  );

export const scanDocument = async (file: File): Promise<ScannedTransactionData> =>
  runWithProviders(provider =>
    provider === 'openai' ? openai.scanDocument(file) : gemini.scanDocument(file)
  );

export const scanControlSheet = async (file: File): Promise<ScannedControlSheetData[]> =>
  runWithProviders(provider =>
    provider === 'openai' ? openai.scanControlSheet(file) : gemini.scanControlSheet(file)
  );

export const getProviderLabel = (): string => {
  if (remoteDisabled) return 'Modo sin LLM';
  if (isRemoteProviderConfigured()) {
    return configuredProviders.map(provider => PROVIDER_LABELS[provider]).join(' → ');
  }
  if (preferredRemoteProviders.length > 0) {
    return preferredRemoteProviders.map(provider => PROVIDER_LABELS[provider]).join(' → ');
  }
  return 'Proveedor remoto no configurado';
};

export const getLastSuccessfulProvider = (): RemoteAiProvider | null => lastSuccessfulProvider;
