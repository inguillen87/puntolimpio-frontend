import { DocumentType, ScannedControlSheetData, ScannedTransactionData } from '../types';
import * as gemini from './geminiService';
import * as openai from './openAiService';

export type AiProviderName = 'gemini' | 'openai' | 'none';

const getConfiguredProvider = (): AiProviderName => {
  const raw = (import.meta.env.VITE_AI_PROVIDER ?? (typeof process !== 'undefined' ? process.env.AI_PROVIDER : undefined) ?? 'gemini').toString();
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'openai') return 'openai';
  if (normalized === 'none' || normalized === 'disabled') return 'none';
  return 'gemini';
};

const activeProvider: AiProviderName = getConfiguredProvider();

export const getActiveProvider = () => activeProvider;

export const isRemoteProviderConfigured = (): boolean => {
  if (activeProvider === 'openai') return openai.isOpenAiConfigured;
  if (activeProvider === 'none') return false;
  return gemini.isGeminiConfigured;
};

export const getAiAssistantResponse = async (context: string, question: string): Promise<string> => {
  if (activeProvider === 'none' || !isRemoteProviderConfigured()) {
    throw new Error('No hay un proveedor de IA configurado.');
  }
  if (activeProvider === 'openai') {
    return openai.getAiAssistantResponse(context, question);
  }
  return gemini.getAiAssistantResponse(context, question);
};

export const scanDocument = async (file: File): Promise<ScannedTransactionData> => {
  if (activeProvider === 'none' || !isRemoteProviderConfigured()) {
    throw new Error('El proveedor de IA está deshabilitado.');
  }
  if (activeProvider === 'openai') {
    return openai.scanDocument(file);
  }
  return gemini.scanDocument(file);
};

export const scanControlSheet = async (file: File): Promise<ScannedControlSheetData[]> => {
  if (activeProvider === 'none' || !isRemoteProviderConfigured()) {
    throw new Error('El proveedor de IA está deshabilitado.');
  }
  if (activeProvider === 'openai') {
    return openai.scanControlSheet(file);
  }
  return gemini.scanControlSheet(file);
};

export const getProviderLabel = (): string => {
  switch (activeProvider) {
    case 'openai':
      return 'OpenAI';
    case 'none':
      return 'Modo sin LLM';
    default:
      return 'Gemini';
  }
};
