import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { Item, Transaction, Partner, TransactionType } from '../types';
import {
  getAiAssistantResponse,
  isRemoteProviderConfigured,
  getProviderLabel,
  AssistantConversationTurn,
} from '../services/aiService';
import { DEMO_UPLOAD_LIMIT, DemoUsageSnapshot } from '../services/demoUsageService';
import { canonicalItemKey, normalizePartnerName } from '../utils/itemNormalization';
import Spinner from './Spinner';
import { useUsageLimits } from '../context/UsageLimitsContext';

interface AiAssistantProps {
  items: Item[];
  transactions: Transaction[];
  partners: Partner[];
  demoLimit?: number | null;
  demoUsage?: DemoUsageSnapshot | null;
  onRefreshDemoUsage?: () => Promise<DemoUsageSnapshot | null>;
  onConsumeDemoUsage?: () => Promise<DemoUsageSnapshot | null>;
  isDemoAccount?: boolean;
  getDemoResetLabel?: (isoDate?: string | null) => string;
}

interface SummaryBadge {
  label: string;
  value: string;
}

interface TableData {
  title: string;
  caption?: string;
  columns: string[];
  previewRows: string[][];
  allRows: string[][];
  csvFileName: string;
  summaryBadges?: SummaryBadge[];
  numericColumnIndexes?: number[];
}

interface Message {
  id: string;
  sender: 'user' | 'ai';
  content: string;
  decoratedHtml?: string;
  tableData?: TableData;
  footnote?: string;
}

type AssistantMessagePayload = Omit<Message, 'id' | 'sender'>;

interface KnowledgeBase {
  contextJson: string;
  signature: string;
  stockByItemId: Map<string, number>;
  itemsById: Map<string, Item>;
  partnersById: Map<string, Partner>;
  outcomesSorted: Transaction[];
  incomesSorted: Transaction[];
  itemSearchIndex: { search: string; canonical: string; item: Item }[];
  partnerSearchIndex: { search: string; partnerName: string; partnerId?: string }[];
}

const sanitizeForSearch = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]/g, '');

const formatDate = (isoString: string) => {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) {
    return isoString;
  }
  return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

const MAX_MEMORY_TURNS = 8;
const MAX_SUMMARY_LENGTH = 1400;

const compactWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim();

const buildMarkdownTable = (headers: string[], rows: string[][]): string => {
  if (rows.length === 0) {
    return '';
  }

  const headerLine = `| ${headers.join(' | ')} |`;
  const separator = `| ${headers.map(() => '---').join(' | ')} |`;
  const body = rows.map(row => `| ${row.join(' | ')} |`);
  return [headerLine, separator, ...body].join('\n');
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const buildHtmlTable = (
  headers: string[],
  rows: string[][],
  numericColumnIndexes: number[] = []
): string => {
  if (rows.length === 0) {
    return '<p class="text-sm text-gray-600 dark:text-gray-300">No hay datos disponibles.</p>';
  }

  const headerHtml = headers
    .map(
      header =>
        `<th scope="col" class="px-3 py-2 font-semibold uppercase tracking-wide text-xs">${escapeHtml(header)}</th>`
    )
    .join('');

  const bodyHtml = rows
    .map(row => {
      const cells = row
        .map((value, index) => {
          const alignmentClass = numericColumnIndexes.includes(index) ? 'text-right' : 'text-left';
          const basePadding = index === row.length - 1 ? 'py-1 pl-3 pr-2' : 'py-1 pr-3';
          const emphasis = index === 0 ? 'font-medium' : '';
          return `<td class="${basePadding} ${alignmentClass} ${emphasis}">${escapeHtml(value)}</td>`;
        })
        .join('');
      return `<tr class="border-b border-gray-200 dark:border-gray-700">${cells}</tr>`;
    })
    .join('');

  return `
    <div class="overflow-x-auto">
      <table class="min-w-full text-sm text-left">
        <thead class="bg-gray-100 dark:bg-gray-700/60 text-gray-700 dark:text-gray-100">
          <tr>${headerHtml}</tr>
        </thead>
        <tbody class="text-gray-700 dark:text-gray-100">
          ${bodyHtml}
        </tbody>
      </table>
    </div>
  `.trim();
};

const formatNumber = (value: number): string => {
  if (!Number.isFinite(value)) {
    return String(value);
  }
  return new Intl.NumberFormat('es-AR').format(value);
};

const buildCsvFilename = (base: string): string => {
  const slug = sanitizeForSearch(base) || 'reporte';
  const date = new Date().toISOString().slice(0, 10);
  return `${slug}-${date}.csv`;
};

const detectNumericColumns = (headers: string[]): number[] =>
  headers.reduce<number[]>((acc, header, index) => {
    if (/(cantidad|unidad|units|total|docs)/i.test(header)) {
      acc.push(index);
    }
    return acc;
  }, []);

const createMessageId = (() => {
  let counter = 0;
  return () => {
    counter += 1;
    return `msg-${Date.now()}-${counter}`;
  };
})();

const mapMessagesToTurns = (messages: Message[]): AssistantConversationTurn[] =>
  messages.map(message => ({
    role: message.sender === 'user' ? 'user' : 'assistant',
    content: compactWhitespace(message.content),
  }));

const truncateText = (value: string, limit: number) =>
  value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;

const summarizeConversation = (messages: Message[]): string => {
  if (messages.length === 0) {
    return '';
  }

  const normalized = messages.map(entry =>
    `${entry.sender === 'user' ? 'Usuario' : 'Asistente'}: ${compactWhitespace(entry.content)}`
  );

  const joined = normalized.join('\n');
  if (joined.length <= MAX_SUMMARY_LENGTH) {
    return joined;
  }

  const latest = normalized.slice(-6);
  const earlier = normalized.slice(0, -6);

  const userHighlights = earlier
    .map((line, index) => ({ line, index }))
    .filter(({ index }) => messages[index].sender === 'user')
    .slice(-3)
    .map(({ line }) => `• Usuario preguntó: ${truncateText(line.replace(/^Usuario:\s*/, ''), 160)}`);

  const assistantHighlights = earlier
    .map((line, index) => ({ line, index }))
    .filter(({ index }) => messages[index].sender === 'ai')
    .slice(-3)
    .map(({ line }) => `• Asistente respondió: ${truncateText(line.replace(/^Asistente:\s*/, ''), 160)}`);

  return [
    'Ideas clave previas:',
    ...userHighlights,
    ...assistantHighlights,
    '',
    'Intercambios recientes:',
    ...latest,
  ]
    .filter(Boolean)
    .join('\n');
};

const decorateAssistantResponse = (
  payload: AssistantMessagePayload,
  snapshot: DemoUsageSnapshot | null,
  limitValue: number,
  getDemoResetLabel?: (isoDate?: string | null) => string
): AssistantMessagePayload => {
  if (!snapshot) {
    return payload;
  }

  const remaining = Math.max(snapshot.remaining, 0);
  const resetLabel = getDemoResetLabel ? getDemoResetLabel(snapshot.resetsOn) : 'el próximo ciclo';
  const footnote = `Demo: te quedan ${remaining} de ${limitValue} interacciones de IA hasta ${resetLabel}.`;
  const baseHtml = payload.decoratedHtml ?? payload.content.replace(/\n/g, '<br />');

  return {
    ...payload,
    decoratedHtml: payload.tableData
      ? payload.decoratedHtml
      : `${baseHtml}<br /><span class="text-xs text-gray-500">${escapeHtml(footnote)}</span>`,
    footnote,
  };
};

const CACHE_HISTORY_TURNS = 4;

const buildCacheKey = (
  signature: string,
  history: AssistantConversationTurn[],
  question: string
): string => {
  const historySignature = history
    .slice(-CACHE_HISTORY_TURNS)
    .map(turn => `${turn.role}:${sanitizeForSearch(turn.content)}`)
    .join('|');
  return `${signature}::${historySignature}::${sanitizeForSearch(question)}`;
};

const interpretAssistantResponse = (raw: string): AssistantMessagePayload => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return {
      content: 'No obtuve una respuesta del modelo.',
      decoratedHtml:
        '<p class="text-sm text-gray-700 dark:text-gray-200">No obtuve una respuesta del modelo.</p>',
    };
  }

  try {
    const data = JSON.parse(trimmed);
    if (data && typeof data === 'object') {
      const columns: string[] = Array.isArray((data as any).columns) && (data as any).columns.length
        ? (data as any).columns.map((col: unknown) => String(col))
        : ['Fecha', 'Detalle', 'Cantidad', 'Destino'];

      const rawRows: any[] = Array.isArray((data as any).rows) ? (data as any).rows : [];
      const normalizedRows = rawRows
        .map(row => {
          if (Array.isArray(row)) {
            const values = row.map(value => (value === null || value === undefined ? '' : String(value)));
            const padded = values.length >= columns.length
              ? values.slice(0, columns.length)
              : [...values, ...Array(columns.length - values.length).fill('')];
            return { values: padded, quantity: null as number | null };
          }
          if (row && typeof row === 'object') {
            const getValue = (keys: string[], fallback = '') => {
              for (const key of keys) {
                if (key in row && row[key] !== undefined && row[key] !== null) {
                  return row[key];
                }
              }
              return fallback;
            };

            const rawDate = getValue(['date', 'fecha', 'day'], '');
            const rawItem = getValue(['item', 'article', 'articulo', 'product', 'producto', 'detalle', 'detail', 'name'], '');
            const rawQuantity = getValue(['quantity', 'qty', 'cantidad', 'units', 'unidades'], '');
            const rawDestination = getValue(['destination', 'destino', 'partner', 'cliente', 'customer'], '');

            const quantityNumber = Number(rawQuantity);
            const quantityLabel = Number.isFinite(quantityNumber)
              ? formatNumber(quantityNumber)
              : rawQuantity === null || rawQuantity === undefined
                ? ''
                : String(rawQuantity);

            return {
              values: [String(rawDate ?? ''), String(rawItem ?? ''), quantityLabel, String(rawDestination ?? '')],
              quantity: Number.isFinite(quantityNumber) ? quantityNumber : null,
            };
          }
          return { values: [String(row ?? '')], quantity: null };
        })
        .map(entry => {
          if (entry.values.length >= columns.length) {
            return { ...entry, values: entry.values.slice(0, columns.length) };
          }
          return {
            ...entry,
            values: [...entry.values, ...Array(columns.length - entry.values.length).fill('')],
          };
        });

      const allRows = normalizedRows.map(entry => entry.values);
      const previewLimitRaw = typeof (data as any).previewLimit === 'number' ? (data as any).previewLimit : undefined;
      const previewLimit = previewLimitRaw && Number.isFinite(previewLimitRaw)
        ? Math.max(1, Math.min(Math.floor(previewLimitRaw), allRows.length || 5, 20))
        : Math.min(5, allRows.length || 5);
      const previewRows = allRows.slice(0, previewLimit);

      const docsValue = typeof (data as any).docs === 'number' ? (data as any).docs : allRows.length;
      const unitsValue = typeof (data as any).units === 'number'
        ? (data as any).units
        : (() => {
            const quantities = normalizedRows.map(entry => entry.quantity).filter(value => value !== null) as number[];
            if (quantities.length === 0) return null;
            return quantities.reduce((sum, value) => sum + value, 0);
          })();

      const summaryTextRaw = typeof (data as any).summary === 'string' ? (data as any).summary.trim() : '';
      const titleRaw = typeof (data as any).title === 'string' ? (data as any).title.trim() : '';
      const summaryText = summaryTextRaw
        ? summaryTextRaw
        : `Resumen: ${formatNumber(docsValue)} movimientos${
            typeof unitsValue === 'number' ? ` · ${formatNumber(unitsValue)} unidades` : ''
          }.`;
      const tableMarkdown = previewRows.length ? buildMarkdownTable(columns, previewRows) : '';
      const htmlTable = previewRows.length ? buildHtmlTable(columns, previewRows, detectNumericColumns(columns)) : '';

      const captionRaw =
        typeof (data as any).caption === 'string'
          ? (data as any).caption.trim()
          : typeof (data as any).subtitle === 'string'
            ? (data as any).subtitle.trim()
            : '';
      const hasMore = allRows.length > previewRows.length;
      const caption = captionRaw || (hasMore ? `Mostrando ${previewRows.length} de ${allRows.length} registros.` : undefined);

      const csvNameRaw =
        typeof (data as any).csvFileName === 'string' && (data as any).csvFileName.trim()
          ? (data as any).csvFileName
          : typeof (data as any).csvName === 'string' && (data as any).csvName.trim()
            ? (data as any).csvName
            : titleRaw || summaryText;

      const numericColumnIndexesRaw = Array.isArray((data as any).numericColumns)
        ? (data as any).numericColumns
        : [];
      const numericColumnIndexes = Array.isArray(numericColumnIndexesRaw)
        ? numericColumnIndexesRaw
            .map((entry: unknown) => {
              if (typeof entry === 'number' && Number.isFinite(entry)) return Math.max(0, Math.floor(entry));
              if (typeof entry === 'string') {
                const index = columns.findIndex(col => col.toLowerCase() === entry.toLowerCase());
                if (index >= 0) return index;
              }
              return null;
            })
            .filter((value): value is number => value !== null)
        : detectNumericColumns(columns);

      const tableData: TableData | undefined = allRows.length
        ? {
            title: titleRaw || summaryText,
            caption,
            columns,
            previewRows,
            allRows,
            csvFileName: buildCsvFilename(csvNameRaw || 'respuesta_asistente'),
            summaryBadges: [
              { label: 'Movimientos', value: formatNumber(docsValue) },
              ...(typeof unitsValue === 'number'
                ? [{ label: 'Unidades', value: formatNumber(unitsValue) }]
                : []),
            ],
            numericColumnIndexes,
          }
        : undefined;

      const content = tableMarkdown ? `${summaryText}\n\n${tableMarkdown}` : summaryText;
      const decoratedHtml = htmlTable
        ? `
          <div class="space-y-3">
            <p class="text-sm text-gray-700 dark:text-gray-200">${escapeHtml(summaryText)}</p>
            ${htmlTable}
          </div>
        `.trim()
        : `<p class="text-sm text-gray-700 dark:text-gray-200">${escapeHtml(summaryText)}</p>`;

      return {
        content,
        decoratedHtml,
        tableData,
      };
    }
  } catch (error) {
    // Not JSON, fall through to plain text handling.
  }

  return {
    content: trimmed,
    decoratedHtml: `<p class="text-sm text-gray-700 dark:text-gray-200">${escapeHtml(trimmed).replace(/\n/g, '<br />')}</p>`,
  };
};

const formatTransactionsTable = (
  records: Transaction[],
  knowledge: KnowledgeBase,
  previewLimit: number
): {
  text: string;
  html: string;
  columns: string[];
  previewRows: string[][];
  allRows: string[][];
} => {
  const headers = ['Fecha', 'Artículo', 'Cantidad', 'Destino'];

  const allRows = records.map(tx => {
    const item = knowledge.itemsById.get(tx.itemId);
    const partner = tx.partnerId ? knowledge.partnersById.get(tx.partnerId) : undefined;
    const destination = partner
      ? normalizePartnerName(partner.name)
      : tx.destination
        ? normalizePartnerName(tx.destination)
        : 'Sin destino';
    const quantityLabel = formatNumber(tx.quantity);
    return [
      formatDate(tx.createdAt),
      item?.name ?? 'Artículo desconocido',
      quantityLabel,
      destination,
    ];
  });

  const previewRows = allRows.slice(0, previewLimit);

  if (allRows.length === 0) {
    return {
      text: 'No hay transacciones registradas.',
      html: '<p class="text-sm text-gray-600 dark:text-gray-300">No hay transacciones registradas.</p>',
      columns: headers,
      previewRows,
      allRows,
    };
  }

  const text = buildMarkdownTable(headers, previewRows);
  const html = buildHtmlTable(headers, previewRows, [2]);

  return { text, html, columns: headers, previewRows, allRows };
};

const summarizePartnerActivity = (
  partnerQuery: string,
  knowledge: KnowledgeBase
): AssistantMessagePayload | null => {
  const sanitizedQuery = sanitizeForSearch(partnerQuery);
  const match = knowledge.partnerSearchIndex.find(entry =>
    sanitizedQuery.includes(entry.search) || entry.search.includes(sanitizedQuery)
  );
  if (!match) return null;

  const normalizedName = normalizePartnerName(match.partnerName);
  const related = knowledge.outcomesSorted.filter(tx => {
    if (match.partnerId && tx.partnerId === match.partnerId) {
      return true;
    }
    if (!match.partnerId && tx.partnerId) {
      const partner = knowledge.partnersById.get(tx.partnerId);
      if (partner && sanitizeForSearch(partner.name) === match.search) {
        return true;
      }
    }
    return tx.destination ? sanitizeForSearch(tx.destination) === match.search : false;
  });
  if (related.length === 0) {
    const content = `No hay egresos asociados a ${normalizedName}.`;
    return {
      content,
      decoratedHtml: `<p class="text-sm text-gray-700 dark:text-gray-200">${content}</p>`,
    };
  }

  const totalUnits = related.reduce((sum, tx) => sum + tx.quantity, 0);
  const previewLimit = Math.min(related.length, 5);
  const table = formatTransactionsTable(related, knowledge, previewLimit);

  const header = `Resumen para ${normalizedName}: ${related.length} entregas registradas, ${formatNumber(totalUnits)} unidades en total.`;
  const hasMoreRows = table.allRows.length > table.previewRows.length;
  const caption = hasMoreRows
    ? `Mostrando ${table.previewRows.length} de ${table.allRows.length} movimientos.`
    : undefined;

  const tableData: TableData | undefined = table.previewRows.length
    ? {
        title: `Entregas a ${normalizedName}`,
        caption,
        columns: table.columns,
        previewRows: table.previewRows,
        allRows: table.allRows,
        csvFileName: buildCsvFilename(`entregas_${normalizedName}`),
        summaryBadges: [
          { label: 'Entregas', value: formatNumber(related.length) },
          { label: 'Unidades', value: formatNumber(totalUnits) },
        ],
        numericColumnIndexes: [2],
      }
    : undefined;

  return {
    content: table.previewRows.length ? `${header}\n\n${table.text}` : header,
    decoratedHtml: `
      <div class="space-y-3">
        <p class="text-sm text-gray-700 dark:text-gray-200"><strong>Resumen para ${normalizedName}</strong>: ${formatNumber(related.length)} entregas registradas, ${formatNumber(totalUnits)} unidades en total.</p>
        ${table.previewRows.length ? table.html : ''}
      </div>
    `.trim(),
    tableData,
  };
};

const resolveLocalAnswer = (
  question: string,
  knowledge: KnowledgeBase
): AssistantMessagePayload | null => {
  const trimmedQuestion = question.trim();
  if (!trimmedQuestion) return null;

  const lowerQuestion = trimmedQuestion.toLowerCase();
  const sanitizedQuestion = sanitizeForSearch(trimmedQuestion);

  const formatTotals = (records: Transaction[]) => {
    const docs = records.length;
    const totalUnits = records.reduce((sum, tx) => sum + tx.quantity, 0);
    return { docs, totalUnits };
  };

  const maybeItem = knowledge.itemSearchIndex.find(entry => {
    if (sanitizedQuestion.includes(entry.search) || entry.search.includes(sanitizedQuestion)) {
      return true;
    }
    const canonicalSearch = entry.canonical.toLowerCase();
    if (canonicalSearch && (sanitizedQuestion.includes(canonicalSearch) || canonicalSearch.includes(sanitizedQuestion))) {
      return true;
    }
    return false;
  });

  if (maybeItem && /stock|inventario|quedo|hay/.test(lowerQuestion)) {
    const stock = knowledge.stockByItemId.get(maybeItem.item.id) ?? 0;
    const content = `Stock disponible de ${maybeItem.item.name}: ${formatNumber(stock)} unidad${stock === 1 ? '' : 'es'}.`;
    return {
      content,
      decoratedHtml: `<p class="text-sm text-gray-700 dark:text-gray-200"><strong>${escapeHtml(
        maybeItem.item.name
      )}</strong>: ${formatNumber(stock)} unidad${stock === 1 ? '' : 'es'} disponibles en inventario.</p>`,
    };
  }

  if (/(egreso|venta)/.test(lowerQuestion)) {
    if (/ultimo|último|ultimas|últimas|ultimos|últimos/.test(lowerQuestion)) {
      const limitMatch = lowerQuestion.match(/(\d{1,2})/);
      const limit = limitMatch ? Math.max(1, Math.min(parseInt(limitMatch[1], 10), 20)) : 5;

      if (knowledge.outcomesSorted.length === 0) {
        const message = 'No hay salidas registradas.';
        return {
          content: message,
          decoratedHtml: `<p class="text-sm text-gray-700 dark:text-gray-200">${message}</p>`,
        };
      }

      const table = formatTransactionsTable(knowledge.outcomesSorted, knowledge, limit);
      if (!table.previewRows.length) {
        const message = 'No hay salidas registradas.';
        return {
          content: message,
          decoratedHtml: `<p class="text-sm text-gray-700 dark:text-gray-200">${message}</p>`,
        };
      }

      const { docs, totalUnits } = formatTotals(knowledge.outcomesSorted.slice(0, limit));
      const intro = `Últimas ${formatNumber(docs)} salidas registradas (${formatNumber(totalUnits)} unidades en total):`;
      const hasMore = table.allRows.length > table.previewRows.length;
      const caption = hasMore
        ? `Mostrando ${table.previewRows.length} de ${table.allRows.length} movimientos.`
        : undefined;

      const tableData: TableData = {
        title: 'Últimas salidas registradas',
        caption,
        columns: table.columns,
        previewRows: table.previewRows,
        allRows: table.allRows,
        csvFileName: buildCsvFilename('salidas_recientes'),
        summaryBadges: [
          { label: 'Movimientos', value: formatNumber(docs) },
          { label: 'Unidades', value: formatNumber(totalUnits) },
        ],
        numericColumnIndexes: [2],
      };

      return {
        content: table.text ? `${intro}\n\n${table.text}` : intro,
        decoratedHtml: `
          <div class="space-y-3">
            <p class="text-sm text-gray-700 dark:text-gray-200">${escapeHtml(intro)}</p>
            ${table.html}
          </div>
        `.trim(),
        tableData,
      };
    }

    if (/cu[aá]nt/.test(lowerQuestion) || /total/.test(lowerQuestion)) {
      const { docs, totalUnits } = formatTotals(knowledge.outcomesSorted);
      const content = `Se registraron ${formatNumber(docs)} salidas recientes por un total de ${formatNumber(
        totalUnits
      )} unidades.`;
      return {
        content,
        decoratedHtml: `<p class="text-sm text-gray-700 dark:text-gray-200">${content}</p>`,
      };
    }
  }

  if (/(ingreso|compra)/.test(lowerQuestion)) {
    if (/ultimo|último|ultimas|últimas|ultimos|últimos/.test(lowerQuestion)) {
      const limitMatch = lowerQuestion.match(/(\d{1,2})/);
      const limit = limitMatch ? Math.max(1, Math.min(parseInt(limitMatch[1], 10), 20)) : 5;

      if (knowledge.incomesSorted.length === 0) {
        const message = 'No hay entradas registradas.';
        return {
          content: message,
          decoratedHtml: `<p class="text-sm text-gray-700 dark:text-gray-200">${message}</p>`,
        };
      }

      const table = formatTransactionsTable(knowledge.incomesSorted, knowledge, limit);
      if (!table.previewRows.length) {
        const message = 'No hay entradas registradas.';
        return {
          content: message,
          decoratedHtml: `<p class="text-sm text-gray-700 dark:text-gray-200">${message}</p>`,
        };
      }

      const { docs, totalUnits } = formatTotals(knowledge.incomesSorted.slice(0, limit));
      const intro = `Últimas ${formatNumber(docs)} entradas registradas (${formatNumber(totalUnits)} unidades en total):`;
      const hasMore = table.allRows.length > table.previewRows.length;
      const caption = hasMore
        ? `Mostrando ${table.previewRows.length} de ${table.allRows.length} movimientos.`
        : undefined;

      const tableData: TableData = {
        title: 'Últimas entradas registradas',
        caption,
        columns: table.columns,
        previewRows: table.previewRows,
        allRows: table.allRows,
        csvFileName: buildCsvFilename('entradas_recientes'),
        summaryBadges: [
          { label: 'Movimientos', value: formatNumber(docs) },
          { label: 'Unidades', value: formatNumber(totalUnits) },
        ],
        numericColumnIndexes: [2],
      };

      return {
        content: table.text ? `${intro}\n\n${table.text}` : intro,
        decoratedHtml: `
          <div class="space-y-3">
            <p class="text-sm text-gray-700 dark:text-gray-200">${escapeHtml(intro)}</p>
            ${table.html}
          </div>
        `.trim(),
        tableData,
      };
    }

    if (/cu[aá]nt/.test(lowerQuestion) || /total/.test(lowerQuestion)) {
      const { docs, totalUnits } = formatTotals(knowledge.incomesSorted);
      const content = `Se registraron ${formatNumber(docs)} entradas recientes por un total de ${formatNumber(
        totalUnits
      )} unidades.`;
      return {
        content,
        decoratedHtml: `<p class="text-sm text-gray-700 dark:text-gray-200">${content}</p>`,
      };
    }
  }

  if (/cliente|destino|municipalidad|lasheras/.test(lowerQuestion)) {
    const partnerSummary = summarizePartnerActivity(trimmedQuestion, knowledge);
    if (partnerSummary) {
      return partnerSummary;
    }
  }

  return null;
};



const AiAssistant: React.FC<AiAssistantProps> = ({
  items,
  transactions,
  partners,
  demoLimit,
  demoUsage,
  onRefreshDemoUsage,
  onConsumeDemoUsage,
  isDemoAccount = false,
  getDemoResetLabel,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [expandedMessages, setExpandedMessages] = useState<Set<string>>(() => new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { canUseRemoteAnalysis, recordRemoteUsage, usageState } = useUsageLimits();
  const aiAvailable = isRemoteProviderConfigured();
  const providerLabel = getProviderLabel();

  const conversationSummaryRef = useRef<string>('');
  const cachedAnswersRef = useRef<Map<string, string>>(new Map());

  const updateConversation = (nextMessages: Message[]) => {
    setMessages(nextMessages);
    conversationSummaryRef.current = summarizeConversation(nextMessages);
  };

  const knowledge = useMemo<KnowledgeBase>(() => {
    const stockMap = new Map<string, number>();
    items.forEach(item => stockMap.set(item.id, 0));
    transactions.forEach(tx => {
      const current = stockMap.get(tx.itemId) || 0;
      stockMap.set(tx.itemId, current + (tx.type === TransactionType.INCOME ? tx.quantity : -tx.quantity));
    });

    const itemsById = new Map(items.map(item => [item.id, item]));
    const partnersById = new Map(partners.map(partner => [partner.id, partner]));

    const transactionsSorted = [...transactions].sort((a, b) => {
      const aDate = new Date(a.createdAt).getTime();
      const bDate = new Date(b.createdAt).getTime();
      return Number.isNaN(bDate) ? -1 : Number.isNaN(aDate) ? 1 : bDate - aDate;
    });

    const outcomesSorted = transactionsSorted.filter(tx => tx.type === TransactionType.OUTCOME);
    const incomesSorted = transactionsSorted.filter(tx => tx.type === TransactionType.INCOME);

    const itemsWithStock = items.map(item => ({
      id: item.id,
      name: item.name,
      type: item.type,
      stock: stockMap.get(item.id) || 0,
    }));

    const partnersPayload = partners.map(partner => ({
      id: partner.id,
      name: normalizePartnerName(partner.name),
      isCustomer: Boolean(partner.isCustomer),
      isSupplier: Boolean(partner.isSupplier),
    }));

    const recentTransactions = transactionsSorted.slice(0, 20).map(tx => {
      const hasIsoDate = typeof tx.createdAt === 'string' && tx.createdAt.includes('T');
      const datePart = hasIsoDate ? tx.createdAt.split('T')[0] : tx.createdAt;
      return {
        itemName: itemsById.get(tx.itemId)?.name || 'Desconocido',
        type: tx.type,
        quantity: tx.quantity,
        date: datePart,
        partnerName: tx.partnerId
          ? partnersById.get(tx.partnerId)?.name ?? null
          : tx.destination ?? null,
      };
    });

    const totals = {
      outcomes: {
        docs: outcomesSorted.length,
        units: outcomesSorted.reduce((sum, tx) => sum + tx.quantity, 0),
      },
      incomes: {
        docs: incomesSorted.length,
        units: incomesSorted.reduce((sum, tx) => sum + tx.quantity, 0),
      },
    };

    const contextPayload = {
      inventory: itemsWithStock,
      partners: partnersPayload,
      metrics: totals,
      recentTransactions,
    };

    const itemSearchIndex = items.map(item => ({
      item,
      canonical: canonicalItemKey(item.name),
      search: sanitizeForSearch(item.name),
    }));

    const partnerSearchIndexMap = new Map<string, { partnerName: string; partnerId?: string }>();
    partners.forEach(partner => {
      const normalizedName = normalizePartnerName(partner.name);
      const searchKey = sanitizeForSearch(normalizedName);
      if (!partnerSearchIndexMap.has(searchKey)) {
        partnerSearchIndexMap.set(searchKey, { partnerName: normalizedName, partnerId: partner.id });
      }
    });
    transactions.forEach(tx => {
      if (tx.destination) {
        const normalizedName = normalizePartnerName(tx.destination);
        const searchKey = sanitizeForSearch(normalizedName);
        if (!partnerSearchIndexMap.has(searchKey)) {
          partnerSearchIndexMap.set(searchKey, { partnerName: normalizedName });
        }
      }
    });

    const contextJson = JSON.stringify(contextPayload);

    return {
      contextJson,
      signature: contextJson,
      stockByItemId: stockMap,
      itemsById,
      partnersById,
      outcomesSorted,
      incomesSorted,
      itemSearchIndex,
      partnerSearchIndex: Array.from(partnerSearchIndexMap.entries()).map(([search, value]) => ({
        search,
        ...value,
      })),
    };
  }, [items, transactions, partners]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const toggleMessageExpansion = useCallback((id: string) => {
    setExpandedMessages(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleExportCsv = useCallback((table: TableData) => {
    if (typeof window === 'undefined') return;
    const rowsForExport = table.allRows.length > 0 ? table.allRows : table.previewRows;
    if (rowsForExport.length === 0 && table.columns.length === 0) {
      return;
    }

    const csvLines = [table.columns, ...rowsForExport].map(row =>
      row
        .map(cell => {
          const value = cell ?? '';
          return `"${String(value).replace(/"/g, '""')}"`;
        })
        .join(';')
    );

    const csvContent = csvLines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', table.csvFileName || buildCsvFilename('reporte'));
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);
  
  const handleSend = async () => {
    if (!userInput.trim() || isLoading) return;

    const userMessage = userInput.trim();
    const historyTurns = mapMessagesToTurns(messages).slice(-MAX_MEMORY_TURNS);
    const userEntry: Message = { id: createMessageId(), sender: 'user', content: userMessage };
    const newMessages: Message[] = [...messages, userEntry];
    updateConversation(newMessages);
    setUserInput('');

    const localAnswer = resolveLocalAnswer(userMessage, knowledge);
    if (localAnswer) {
      const localMessage: Message = { id: createMessageId(), sender: 'ai', ...localAnswer };
      updateConversation([...newMessages, localMessage]);
      return;
    }

    if (!aiAvailable) {
      const warningMessage: Message = {
        id: createMessageId(),
        sender: 'ai',
        content: `La integración con ${providerLabel} no está configurada. Configura las credenciales correspondientes para habilitar el asistente.`,
      };
      updateConversation([...newMessages, warningMessage]);
      return;
    }

    if (!canUseRemoteAnalysis('assistant')) {
      const resetMessage = usageState?.resetsOn
        ? new Date(usageState.resetsOn).toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' })
        : 'el próximo ciclo';
      const reason = usageState?.degradeReason ?? 'El servicio remoto está deshabilitado temporalmente.';
      const degradeMessage: Message = {
        id: createMessageId(),
        sender: 'ai',
        content: `${reason} Podés continuar con el QR y la carga manual hasta el reinicio (${resetMessage}).`,
      };
      updateConversation([...newMessages, degradeMessage]);
      return;
    }

    const guardDemoUsage = Boolean(isDemoAccount && (demoLimit ?? null) !== null);
    const limitValue = demoLimit ?? DEMO_UPLOAD_LIMIT;
    let latestDemoSnapshot: DemoUsageSnapshot | null = demoUsage ?? null;

    const sendDemoLimitReached = (snapshot?: DemoUsageSnapshot | null) => {
      const resetLabel = getDemoResetLabel ? getDemoResetLabel(snapshot?.resetsOn) : 'el próximo ciclo';
      const limitMessage: Message = {
        id: createMessageId(),
        sender: 'ai',
        content: `Alcanzaste el máximo de ${limitValue} interacciones con IA disponibles en la experiencia demo. El cupo se restablece ${resetLabel}. Escribinos a info@puntolimpio.ar para ampliar el acceso.`,
        decoratedHtml: `Alcanzaste el máximo de ${limitValue} interacciones con IA disponibles en la experiencia demo. El cupo se restablece ${resetLabel}. Escribinos a <a href="mailto:info@puntolimpio.ar">info@puntolimpio.ar</a> para ampliar el acceso.`,
      };
      updateConversation([...newMessages, limitMessage]);
    };

    if (guardDemoUsage) {
      if (latestDemoSnapshot && latestDemoSnapshot.remaining <= 0) {
        sendDemoLimitReached(latestDemoSnapshot);
        return;
      }

      if (onRefreshDemoUsage) {
        try {
          const refreshed = await onRefreshDemoUsage();
          if (refreshed) {
            latestDemoSnapshot = refreshed;
          }
          if (latestDemoSnapshot && latestDemoSnapshot.remaining <= 0) {
            sendDemoLimitReached(latestDemoSnapshot);
            return;
          }
        } catch (error) {
          console.warn('No se pudo verificar el límite demo para el asistente.', error);
        }
      }
    }

    const cacheKey = buildCacheKey(knowledge.signature, historyTurns, userMessage);
    const cached = cachedAnswersRef.current.get(cacheKey);

    const deliverResponse = async (baseResponse: string, consumeDemo: boolean) => {
      if (guardDemoUsage && consumeDemo && onConsumeDemoUsage) {
        try {
          const updatedSnapshot = await onConsumeDemoUsage();
          if (updatedSnapshot) {
            latestDemoSnapshot = updatedSnapshot;
          } else if (latestDemoSnapshot) {
            latestDemoSnapshot = {
              ...latestDemoSnapshot,
              remaining: Math.max(latestDemoSnapshot.remaining - 1, 0),
            };
          }
        } catch (error) {
          console.warn('No se pudo actualizar el consumo demo para el asistente.', error);
        }
      }

      recordRemoteUsage('assistant');

      const parsedPayload = interpretAssistantResponse(baseResponse);
      const decoratedPayload = guardDemoUsage
        ? decorateAssistantResponse(parsedPayload, latestDemoSnapshot, limitValue, getDemoResetLabel)
        : parsedPayload;

      const aiMessage: Message = { id: createMessageId(), sender: 'ai', ...decoratedPayload };
      updateConversation([...newMessages, aiMessage]);
    };

    if (cached) {
      setIsLoading(true);
      try {
        await deliverResponse(cached, guardDemoUsage);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    setIsLoading(true);

    try {
      const aiResponse = await getAiAssistantResponse(
        knowledge.contextJson,
        userMessage,
        historyTurns,
        conversationSummaryRef.current
      );
      cachedAnswersRef.current.set(cacheKey, aiResponse);
      await deliverResponse(aiResponse, guardDemoUsage);
    } catch (error) {
      console.error('AI Assistant error:', error);
      const errorMessage: Message = {
        id: createMessageId(),
        sender: 'ai',
        content: 'Lo siento, ocurrió un error. Intenta de nuevo.',
      };
      updateConversation([...newMessages, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 bg-blue-600 text-white rounded-full p-4 shadow-lg hover:bg-blue-700 transition-transform transform hover:scale-110 z-30"
        aria-label="Abrir asistente de IA"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m12.728 12.728l-.707-.707M6.343 17.657l-.707.707M12 21a9 9 0 110-18 9 9 0 010 18z" /></svg>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => setIsOpen(false)}></div>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl h-[80vh] flex flex-col z-50">
                <header className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-bold text-blue-600 dark:text-blue-400">Punto Limpio AI</h3>
                    <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                         <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </header>
                <main className="flex-1 overflow-y-auto p-4 space-y-4">
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/50 text-blue-800 dark:text-blue-200 text-sm rounded-lg">
                        <p className="font-bold mb-1">¡Hola! Soy tu asistente de inventario.</p>
                        <p>Puedes preguntarme cosas como:</p>
                        <ul className="list-disc list-inside mt-1">
                            <li>¿Cuánto stock hay de Modulo Hex?</li>
                            <li>¿Cuáles fueron los últimos 5 egresos?</li>
                            <li>¿Qué artículos tienen stock bajo?</li>
                        </ul>
                    </div>
                    {(!aiAvailable || !canUseRemoteAnalysis('assistant')) && (
                        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-900/30 dark:text-red-200">
                            <p className="font-semibold">Modo degradado</p>
                            <p className="text-xs mt-1">
                                {!aiAvailable
                                    ? `La integración con ${providerLabel} no está configurada. Configura las credenciales correspondientes para habilitar el asistente.`
                                    : 'La cuota remota está agotada. Usa el QR y la carga manual hasta el próximo reinicio o solicita un upgrade.'}
                            </p>
                        </div>
                    )}
                    {messages.map(msg => {
                        const isUser = msg.sender === 'user';
                        const bubbleTone = isUser
                          ? 'bg-blue-600 text-white rounded-br-none'
                          : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-bl-none';
                        const isExpanded = msg.tableData ? expandedMessages.has(msg.id) : false;
                        const rowsToRender = msg.tableData
                          ? (isExpanded ? msg.tableData.allRows : msg.tableData.previewRows)
                          : [];
                        const hasMoreRows = msg.tableData
                          ? msg.tableData.allRows.length > msg.tableData.previewRows.length
                          : false;

                        return (
                          <div key={msg.id} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-md p-3 rounded-2xl ${bubbleTone}`}>
                              {msg.tableData ? (
                                <div className="space-y-3">
                                  {msg.tableData.summaryBadges && msg.tableData.summaryBadges.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                      {msg.tableData.summaryBadges.map(badge => (
                                        <span
                                          key={`${msg.id}-${badge.label}`}
                                          className="inline-flex items-center rounded-full bg-blue-100 text-blue-800 px-3 py-1 text-xs font-semibold dark:bg-blue-900/40 dark:text-blue-200"
                                        >
                                          <span className="mr-1">{badge.label}:</span>
                                          <span>{badge.value}</span>
                                        </span>
                                      ))}
                                    </div>
                                  )}

                                  <div>
                                    <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{msg.tableData.title}</p>
                                    {msg.tableData.caption && (
                                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{msg.tableData.caption}</p>
                                    )}
                                  </div>

                                  {rowsToRender.length > 0 ? (
                                    <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
                                      <table className="min-w-full text-sm text-left">
                                        <thead className="bg-gray-100 dark:bg-gray-700/60 text-gray-700 dark:text-gray-100">
                                          <tr>
                                            {msg.tableData.columns.map((column, index) => (
                                              <th
                                                key={`${msg.id}-col-${index}`}
                                                scope="col"
                                                className="px-3 py-2 font-semibold uppercase tracking-wide text-xs"
                                              >
                                                {column}
                                              </th>
                                            ))}
                                          </tr>
                                        </thead>
                                        <tbody className="text-gray-700 dark:text-gray-100">
                                          {rowsToRender.map((row, rowIndex) => (
                                            <tr
                                              key={`${msg.id}-row-${rowIndex}`}
                                              className="border-b border-gray-200 dark:border-gray-700"
                                            >
                                              {row.map((cell, cellIndex) => {
                                                const isNumeric = msg.tableData?.numericColumnIndexes?.includes(cellIndex);
                                                const alignment = isNumeric ? 'text-right' : 'text-left';
                                                const padding = cellIndex === row.length - 1 ? 'py-2 pl-3 pr-4' : 'py-2 px-3';
                                                const emphasis = cellIndex === 0 ? 'font-medium' : '';
                                                return (
                                                  <td
                                                    key={`${msg.id}-cell-${rowIndex}-${cellIndex}`}
                                                    className={`${padding} ${alignment} ${emphasis}`}
                                                  >
                                                    {cell}
                                                  </td>
                                                );
                                              })}
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  ) : (
                                    <p className="text-sm text-gray-500 dark:text-gray-400">No hay registros para mostrar.</p>
                                  )}

                                  <div className="flex flex-wrap gap-2 text-xs text-blue-700 dark:text-blue-300">
                                    {hasMoreRows && (
                                      <button
                                        type="button"
                                        onClick={() => toggleMessageExpansion(msg.id)}
                                        className="inline-flex items-center rounded-full border border-blue-200 px-3 py-1 font-semibold hover:bg-blue-50 dark:border-blue-500/50 dark:hover:bg-blue-500/10"
                                      >
                                        {isExpanded
                                          ? 'Ver menos'
                                          : `Ver todo (${msg.tableData.allRows.length})`}
                                      </button>
                                    )}
                                    {msg.tableData.allRows.length > 0 && (
                                      <button
                                        type="button"
                                        onClick={() => handleExportCsv(msg.tableData!)}
                                        className="inline-flex items-center rounded-full border border-blue-200 px-3 py-1 font-semibold hover:bg-blue-50 dark:border-blue-500/50 dark:hover:bg-blue-500/10"
                                      >
                                        Exportar CSV
                                      </button>
                                    )}
                                  </div>

                                  {msg.footnote && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400">{msg.footnote}</p>
                                  )}
                                </div>
                              ) : (
                                <div
                                  className="prose prose-sm dark:prose-invert"
                                  dangerouslySetInnerHTML={{
                                    __html: msg.decoratedHtml ?? msg.content.replace(/\n/g, '<br />'),
                                  }}
                                />
                              )}
                            </div>
                          </div>
                        );
                    })}
                    {isLoading && (
                        <div className="flex justify-start">
                             <div className="max-w-md p-3 rounded-2xl bg-gray-200 dark:bg-gray-700 rounded-bl-none">
                                <Spinner />
                             </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </main>
                <footer className="p-4 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex items-center space-x-2">
                        <input
                            type="text"
                            value={userInput}
                            onChange={(e) => setUserInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                            placeholder="Escribe tu pregunta..."
                            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500"
                            disabled={isLoading || !aiAvailable}
                        />
                        <button onClick={handleSend} disabled={isLoading || !userInput.trim() || !aiAvailable} className="bg-blue-600 text-white rounded-lg p-3 disabled:bg-blue-400">
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" /></svg>
                        </button>
                    </div>
                </footer>
            </div>
        </div>
      )}
    </>
  );
};

export default AiAssistant;