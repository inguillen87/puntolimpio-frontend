import Tesseract from 'tesseract.js';
import { DocumentType, ItemType, ScannedControlSheetData, ScannedTransactionData } from '../types';
import { normalizeItemName } from '../utils/itemNormalization';

const OCR_LANGUAGES = ['spa', 'eng'];

const runOcr = async (file: File): Promise<string> => {
  for (const lang of OCR_LANGUAGES) {
    try {
      const { data } = await Tesseract.recognize(file, lang, {
        tessedit_pageseg_mode: 6,
      });
      if (data?.text?.trim()) {
        return data.text;
      }
    } catch (error) {
      console.warn(`OCR local falló con el idioma ${lang}`, error);
    }
  }
  return '';
};

const cleanLine = (line: string) => line.replace(/[^A-Za-z0-9ÁÉÍÓÚÜÑáéíóúüñ\/\-\s]/g, '').trim();

const extractDestination = (lines: string[]): string | null => {
  const destinationLine = lines.find(line => /destino|señor|sra|sr\.?/i.test(line));
  if (!destinationLine) return null;
  return destinationLine.replace(/destino:?/i, '').replace(/señor(es)?:?/i, '').trim() || null;
};

const detectItemType = (name: string): ItemType => {
  const lower = name.toLowerCase();
  if (lower.includes('chapa')) return ItemType.CHAPA;
  return ItemType.MODULO;
};

const parseQuantity = (line: string): number | null => {
  const match = line.match(/(-?\d{1,5})(?!.*\d)/);
  if (!match) return null;
  const value = parseInt(match[1], 10);
  return Number.isNaN(value) ? null : Math.abs(value);
};

const parseItems = (lines: string[]): ScannedTransactionData['items'] => {
  const items: ScannedTransactionData['items'] = [];
  lines.forEach(rawLine => {
    const line = cleanLine(rawLine);
    const quantity = parseQuantity(line);
    if (!quantity) return;
    const namePart = line.replace(/(-?\d{1,5})(?!.*\d)/, '').trim();
    if (!namePart || namePart.length < 3) return;
    const normalizedName = normalizeItemName(namePart);
    items.push({
      itemName: normalizedName,
      quantity,
      itemType: detectItemType(normalizedName),
    });
  });
  return items;
};

const parseControlSheets = (lines: string[]): ScannedControlSheetData[] => {
  const records: ScannedControlSheetData[] = [];
  let lastDestination: string | undefined;

  lines.forEach(rawLine => {
    const line = cleanLine(rawLine);
    if (line.length < 5) return;
    const dateMatch = line.match(/(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)/);
    const quantityMatch = line.match(/(\d{1,5})(?!.*\d)/);
    if (!dateMatch || !quantityMatch) return;

    const date = dateMatch[1];
    const quantity = parseInt(quantityMatch[1], 10);
    if (Number.isNaN(quantity)) return;

    const remainder = line
      .replace(dateMatch[1], ' ')
      .replace(quantityMatch[1], ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!remainder) return;

    let destination: string | undefined = undefined;
    let model = remainder;

    // Assume destination separated by hyphen or double spaces
    if (remainder.includes(' - ')) {
      const [dest, modelPart] = remainder.split(' - ');
      destination = dest.trim();
      model = modelPart.trim();
    } else if (remainder.includes('  ')) {
      const segments = remainder.split(/\s{2,}/);
      if (segments.length >= 2) {
        destination = segments[0].trim();
        model = segments.slice(1).join(' ').trim();
      }
    }

    if (!destination && /[A-Za-z]{3,}/.test(remainder)) {
      const parts = remainder.split(' ');
      if (parts.length > 2) {
        destination = parts.slice(0, parts.length - 2).join(' ');
        model = parts.slice(-2).join(' ');
      }
    }

    if (destination) {
      lastDestination = destination;
    } else if (lastDestination) {
      destination = lastDestination;
    }

    const normalizedModel = normalizeItemName(model);
    records.push({
      deliveryDate: date,
      destination,
      model: normalizedModel,
      quantity: Math.abs(quantity),
    });
  });

  return records;
};

export const runLocalTransactionAnalysis = async (file: File): Promise<ScannedTransactionData> => {
  const text = await runOcr(file);
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length === 0) {
    return { destination: null, items: [] };
  }
  const destination = extractDestination(lines);
  const items = parseItems(lines);
  return { destination, items };
};

export const runLocalControlAnalysis = async (file: File): Promise<ScannedControlSheetData[]> => {
  const text = await runOcr(file);
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  return parseControlSheets(lines);
};

export const supportsLocalOcr = () => true;

export const runLocalAnalysis = async (file: File, docType: DocumentType): Promise<ScannedTransactionData | ScannedControlSheetData[]> => {
  if (docType === DocumentType.CONTROL) {
    return runLocalControlAnalysis(file);
  }
  return runLocalTransactionAnalysis(file);
};
