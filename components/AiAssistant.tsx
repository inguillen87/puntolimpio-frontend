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

const SUGGESTED_PROMPTS: { label: string; prompt: string }[] = [
  {
    label: 'Alertas de stock',
    prompt: '¿Qué artículos tienen stock bajo y cuáles son sus cantidades actuales?',
  },
  {
    label: 'Últimos movimientos',
    prompt: 'Mostrame los últimos egresos registrados con destino y unidades.',
  },
  {
    label: 'Resumen diario',
    prompt: 'Generá un resumen de entradas y salidas de inventario del día.',
  },
];

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
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const { canUseRemoteAnalysis, recordRemoteUsage, usageState } = useUsageLimits();
  const aiAvailable = isRemoteProviderConfigured();
  const providerLabel = getProviderLabel();
  const effectiveDemoLimit = demoLimit ?? DEMO_UPLOAD_LIMIT;

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

  const inventoryPulse = useMemo(
    () => {
      const stockValues = Array.from(knowledge.stockByItemId.values());
      const totalUnits = stockValues.reduce((acc, value) => acc + value, 0);
      const activeItems = items.filter(item => (knowledge.stockByItemId.get(item.id) ?? 0) > 0).length;
      const lowStockThreshold = 10;
      const lowStockCount = items.filter(item => {
        const stock = knowledge.stockByItemId.get(item.id) ?? 0;
        return stock > 0 && stock <= lowStockThreshold;
      }).length;
      const latestTransaction = knowledge.outcomesSorted[0] ?? knowledge.incomesSorted[0] ?? null;
      const lastMovementLabel = latestTransaction
        ? `${formatDate(latestTransaction.createdAt)} • ${
            latestTransaction.type === TransactionType.OUTCOME ? 'Egreso' : 'Ingreso'
          }`
        : 'Sin movimientos recientes';

      return {
        totalUnits,
        activeItems,
        lowStockCount,
        lowStockThreshold,
        lastMovementLabel,
      };
    },
    [knowledge, items]
  );

  const demoUsageSummary = useMemo(() => {
    if (!isDemoAccount) {
      return null;
    }

    const limit = effectiveDemoLimit > 0 ? effectiveDemoLimit : DEMO_UPLOAD_LIMIT;
    const remaining = Math.min(limit, Math.max(0, demoUsage?.remaining ?? limit));
    const used = Math.min(limit, Math.max(0, limit - remaining));
    const progress = limit > 0 ? Math.round((used / limit) * 100) : 0;
    const resetLabel = getDemoResetLabel ? getDemoResetLabel(demoUsage?.resetsOn ?? null) : null;

    return {
      limit,
      remaining,
      used,
      progress,
      resetLabel,
    };
  }, [demoUsage, effectiveDemoLimit, getDemoResetLabel, isDemoAccount]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen) {
      const frame = requestAnimationFrame(() => {
        inputRef.current?.focus();
      });
      return () => cancelAnimationFrame(frame);
    }
    return undefined;
  }, [isOpen]);

  useEffect(() => {
    if (!inputRef.current) return;
    const element = inputRef.current;
    element.style.height = 'auto';
    element.style.minHeight = '3rem';
    element.style.height = `${element.scrollHeight}px`;
  }, [userInput, isOpen]);

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

  const handleSuggestedPrompt = useCallback((prompt: string) => {
    setUserInput(prompt);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(prompt.length, prompt.length);
    });
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
    const limitValue = effectiveDemoLimit;
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

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="group fixed bottom-6 right-6 z-30 flex h-16 w-16 items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
        aria-label="Abrir asistente de IA"
      >
        <span className="absolute inset-0 -z-10 rounded-full bg-blue-500/40 blur-xl opacity-0 transition-opacity duration-300 group-hover:opacity-80" aria-hidden="true" />
        <span className="relative flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-blue-600 via-cyan-500 to-blue-700 text-white shadow-lg shadow-blue-900/30 transition-transform duration-300 group-hover:scale-105">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m12.728 12.728l-.707-.707M6.343 17.657l-.707.707M12 21a9 9 0 110-18 9 9 0 010 18z"
            />
          </svg>
        </span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm animate-overlay-fade"
            onClick={() => setIsOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-50 flex h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-200/60 bg-white/95 shadow-2xl shadow-slate-900/30 backdrop-blur-xl animate-panel-in dark:border-slate-700/60 dark:bg-slate-900/90">
            <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
              <div className="absolute -top-24 -left-20 h-64 w-64 rounded-full bg-blue-400/20 blur-3xl animate-soft-glow dark:bg-blue-500/15" />
              <div className="absolute bottom-[-88px] right-[-60px] h-72 w-72 rounded-full bg-cyan-400/10 blur-3xl animate-soft-glow [animation-delay:2s] dark:bg-cyan-400/15" />
              <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 via-transparent to-purple-500/10" />
            </div>
            <header className="relative z-10 flex items-center justify-between gap-4 border-b border-slate-200/60 bg-white/70 px-6 py-4 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/50">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-400 text-white shadow-lg">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-7 w-7"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.8}
                      d="M12 6v6l4 2"
                    />
                  </svg>
                </span>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Punto Limpio AI</h3>
                  <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-300">
                    <span className={`h-2 w-2 rounded-full ${aiAvailable ? 'bg-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.25)]' : 'bg-amber-400 shadow-[0_0_0_4px_rgba(251,191,36,0.25)]'}`} />
                    <span>
                      {aiAvailable
                        ? 'Disponible para consultas en tiempo real'
                        : 'Modo offline: usa las guías manuales'}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {demoUsageSummary && (
                  <div className="hidden sm:flex w-48 flex-col gap-1 rounded-2xl border border-blue-200/70 bg-blue-50/70 px-3 py-2 text-xs text-blue-800 shadow-inner backdrop-blur dark:border-blue-500/40 dark:bg-blue-900/20 dark:text-blue-100">
                    <div className="flex items-center justify-between font-semibold">
                      <span>Demo IA</span>
                      <span>
                        {demoUsageSummary.remaining}/{demoUsageSummary.limit}
                      </span>
                    </div>
                    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-blue-100/70 dark:bg-blue-900/40">
                      <span
                        className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-300"
                        style={{ width: `${Math.min(100, Math.max(0, demoUsageSummary.progress))}%` }}
                      />
                    </div>
                    {demoUsageSummary.resetLabel && (
                      <span className="text-[10px] text-blue-600/80 dark:text-blue-200/80">
                        Se reinicia {demoUsageSummary.resetLabel}
                      </span>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:text-slate-300 dark:hover:bg-slate-800/80 dark:hover:text-white"
                  aria-label="Cerrar asistente"
                >
                  <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </header>

            <main className="relative z-10 flex-1 space-y-6 overflow-y-auto px-6 py-6 [scrollbar-width:thin]">
              <section className="rounded-3xl border border-blue-100/60 bg-gradient-to-br from-blue-50 via-indigo-50 to-cyan-50 p-5 text-sm text-slate-700 shadow-inner dark:border-blue-500/40 dark:from-slate-800/80 dark:via-slate-900/80 dark:to-slate-900/80 dark:text-slate-200">
                <p className="text-sm font-semibold tracking-wide text-blue-800 dark:text-blue-200">Hola, soy tu asistente de inventario</p>
                <p className="mt-1 text-sm">Podés preguntarme sobre niveles de stock, movimientos recientes o generar reportes inmediatos.</p>
              </section>

              <section className="grid gap-3 sm:grid-cols-3" aria-label="Pulso del inventario">
                <article className="group relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white/80 px-4 py-4 text-sm shadow-sm backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/60">
                  <span className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br from-blue-500/20 via-transparent to-emerald-400/20 opacity-0 blur-xl transition duration-500 group-hover:opacity-100" aria-hidden="true" />
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Stock disponible</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{formatNumber(Math.max(0, inventoryPulse.totalUnits))}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">Unidades actualmente en inventario</p>
                </article>

                <article className="relative overflow-hidden rounded-2xl border border-slate-200/60 bg-white/80 px-4 py-4 text-sm shadow-sm backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/60">
                  <span className="pointer-events-none absolute inset-x-4 -top-8 h-16 rounded-full bg-blue-500/20 blur-2xl" aria-hidden="true" />
                  <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Artículos activos</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">{formatNumber(inventoryPulse.activeItems)}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-300">{inventoryPulse.lowStockCount} en alerta (≤ {inventoryPulse.lowStockThreshold} u.)</p>
                </article>

                <article className="relative overflow-hidden rounded-2xl border border-blue-200/60 bg-gradient-to-br from-blue-500/10 via-sky-500/5 to-indigo-500/10 px-4 py-4 text-sm shadow-sm backdrop-blur dark:border-blue-500/40 dark:from-blue-900/30 dark:via-slate-900/30 dark:to-indigo-900/30">
                  <span className="pointer-events-none absolute -right-12 top-1/2 h-28 w-28 -translate-y-1/2 rounded-full bg-blue-500/20 blur-3xl" aria-hidden="true" />
                  <p className="text-xs font-semibold uppercase tracking-widest text-blue-700 dark:text-blue-200">Último movimiento</p>
                  <p className="mt-2 text-base font-semibold text-slate-900 dark:text-white">{inventoryPulse.lastMovementLabel}</p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Actualizado automáticamente con las últimas cargas</p>
                </article>
              </section>

              <section className="space-y-3" aria-label="Sugerencias rápidas">
                <h4 className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">Sugerencias inteligentes</h4>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTED_PROMPTS.map((item, index) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => handleSuggestedPrompt(item.prompt)}
                      title={item.prompt}
                      className="group inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/80 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-all hover:-translate-y-0.5 hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 dark:border-slate-700/70 dark:bg-slate-800/70 dark:text-slate-200 dark:hover:border-blue-400 dark:hover:bg-blue-500/20 dark:hover:text-blue-100 animate-chip-enter"
                      style={{ animationDelay: `${index * 80}ms` }}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-500 transition group-hover:bg-blue-600 dark:bg-blue-300" />
                      {item.label}
                    </button>
                  ))}
                </div>
              </section>

              {(!aiAvailable || !canUseRemoteAnalysis('assistant')) && (
                <section className="rounded-2xl border border-amber-200/80 bg-amber-50/90 p-4 text-sm text-amber-800 shadow-sm dark:border-amber-500/50 dark:bg-amber-900/30 dark:text-amber-100">
                  <p className="font-semibold">Modo degradado</p>
                  <p className="mt-1 text-xs leading-relaxed">
                    {!aiAvailable
                      ? `La integración con ${providerLabel} no está configurada. Configurá las credenciales correspondientes para habilitar el asistente.`
                      : 'La cuota remota se agotó. Usá el QR y la carga manual hasta el próximo reinicio o solicitá un upgrade.'}
                  </p>
                </section>
              )}

              <section className="space-y-4" aria-live="polite">
                {messages.map(msg => {
                  const isUser = msg.sender === 'user';
                  const bubbleTone = isUser
                    ? 'bg-gradient-to-br from-blue-600 via-blue-500 to-sky-500 text-white ring-blue-400/30'
                    : 'bg-white/85 text-slate-900 ring-slate-200/70 backdrop-blur-sm dark:bg-slate-800/80 dark:text-slate-100 dark:ring-slate-700/70';
                  const isExpanded = msg.tableData ? expandedMessages.has(msg.id) : false;
                  const rowsToRender = msg.tableData
                    ? isExpanded
                      ? msg.tableData.allRows
                      : msg.tableData.previewRows
                    : [];
                  const hasMoreRows = Boolean(
                    msg.tableData && msg.tableData.allRows.length > msg.tableData.previewRows.length
                  );

                  return (
                    <div
                      key={msg.id}
                      className={`flex ${isUser ? 'justify-end' : 'justify-start'} animate-message-entry`}
                    >
                      <div className="group relative max-w-xl">
                        <span
                          className={`pointer-events-none absolute -inset-1 rounded-[28px] opacity-0 blur-lg transition duration-500 group-hover:opacity-100 ${
                            isUser
                              ? 'bg-gradient-to-br from-blue-500/50 via-cyan-400/30 to-transparent'
                              : 'bg-gradient-to-br from-slate-400/30 via-blue-500/20 to-transparent'
                          }`}
                          aria-hidden="true"
                        />
                        <div
                          className={`relative overflow-hidden rounded-3xl px-5 py-4 text-sm leading-relaxed shadow-lg ring-1 ring-inset transition-all duration-300 ${bubbleTone}`}
                        >
                          {msg.tableData ? (
                            <div className="space-y-4">
                              {msg.tableData.summaryBadges && msg.tableData.summaryBadges.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                  {msg.tableData.summaryBadges.map(badge => (
                                    <span
                                      key={`${msg.id}-${badge.label}`}
                                      className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold backdrop-blur group-hover:bg-white/30 dark:bg-slate-900/30"
                                    >
                                      <span className="text-xs uppercase tracking-wider opacity-75">{badge.label}</span>
                                      <span className="text-sm font-bold">{badge.value}</span>
                                    </span>
                                  ))}
                                </div>
                              )}

                              <div>
                                <p className="text-sm font-semibold text-slate-900 dark:text-white">{msg.tableData.title}</p>
                                {msg.tableData.caption && (
                                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{msg.tableData.caption}</p>
                                )}
                              </div>

                              {rowsToRender.length > 0 ? (
                                <div className="overflow-x-auto rounded-2xl border border-slate-200/70 bg-white/70 shadow-sm backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/40">
                                  <table className="min-w-full text-sm text-left">
                                    <thead className="bg-slate-100/80 text-slate-600 dark:bg-slate-800/80 dark:text-slate-100">
                                      <tr>
                                        {msg.tableData.columns.map((column, index) => (
                                          <th
                                            key={`${msg.id}-col-${index}`}
                                            scope="col"
                                            className="px-4 py-2 text-xs font-semibold uppercase tracking-wide"
                                          >
                                            {column}
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-200/70 text-slate-700 dark:divide-slate-700/60 dark:text-slate-100">
                                      {rowsToRender.map((row, rowIndex) => (
                                        <tr key={`${msg.id}-row-${rowIndex}`}>
                                          {row.map((cell, cellIndex) => {
                                            const isNumeric = msg.tableData?.numericColumnIndexes?.includes(cellIndex);
                                            const alignment = isNumeric ? 'text-right' : 'text-left';
                                            const padding = cellIndex === row.length - 1 ? 'py-2 pl-4 pr-5' : 'py-2 px-4';
                                            const emphasis = cellIndex === 0 ? 'font-medium text-slate-900 dark:text-white' : '';
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
                                <p className="text-sm text-slate-600 dark:text-slate-300">No hay registros para mostrar.</p>
                              )}

                              <div className="flex flex-wrap gap-2 text-xs font-semibold text-blue-700 dark:text-blue-300">
                                {hasMoreRows && (
                                  <button
                                    type="button"
                                    onClick={() => toggleMessageExpansion(msg.id)}
                                    className="inline-flex items-center gap-2 rounded-full border border-blue-200/80 bg-white/50 px-3 py-1 transition hover:bg-blue-50 hover:text-blue-800 dark:border-blue-500/50 dark:bg-slate-900/40 dark:hover:bg-blue-500/20"
                                  >
                                    {isExpanded ? 'Ver menos' : `Ver todo (${msg.tableData.allRows.length})`}
                                  </button>
                                )}
                                {msg.tableData.allRows.length > 0 && (
                                  <button
                                    type="button"
                                    onClick={() => handleExportCsv(msg.tableData!)}
                                    className="inline-flex items-center gap-2 rounded-full border border-blue-200/80 bg-white/50 px-3 py-1 transition hover:bg-blue-50 hover:text-blue-800 dark:border-blue-500/50 dark:bg-slate-900/40 dark:hover:bg-blue-500/20"
                                  >
                                    Exportar CSV
                                  </button>
                                )}
                              </div>

                              {msg.footnote && (
                                <p className="text-xs text-slate-500 dark:text-slate-300">{msg.footnote}</p>
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
                    </div>
                  );
                })}

                {isLoading && (
                  <div className="flex justify-start animate-message-entry">
                    <div className="max-w-[60%] rounded-3xl bg-white/80 px-5 py-3 text-slate-500 shadow-inner ring-1 ring-slate-200/60 backdrop-blur dark:bg-slate-800/70 dark:text-slate-200 dark:ring-slate-700/60">
                      <div className="flex items-center gap-2">
                        <span className="typing-indicator-dot" />
                        <span className="typing-indicator-dot animation-delay-200" />
                        <span className="typing-indicator-dot animation-delay-400" />
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </section>
            </main>

            <footer className="relative z-10 border-t border-slate-200/60 bg-white/70 px-6 py-4 backdrop-blur-sm dark:border-slate-700/60 dark:bg-slate-900/50">
              <div className="flex items-end gap-3">
                <div className="relative flex-1">
                  <textarea
                    ref={inputRef}
                    rows={1}
                    value={userInput}
                    onChange={event => setUserInput(event.target.value)}
                    onKeyDown={handleComposerKeyDown}
                    placeholder="Escribí tu consulta... (Enter para enviar, Shift+Enter para una nueva línea)"
                    className="min-h-[3rem] w-full resize-none rounded-2xl border border-slate-200/70 bg-white/90 px-4 py-3 text-sm text-slate-800 shadow-inner transition focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-400/40 dark:border-slate-700/70 dark:bg-slate-800/80 dark:text-slate-100 dark:focus:border-blue-400 dark:focus:ring-blue-500/30"
                    disabled={isLoading || !aiAvailable}
                    aria-label="Escribe tu consulta para el asistente"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={isLoading || !userInput.trim() || !aiAvailable}
                  className="group relative inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 via-blue-500 to-cyan-500 text-white shadow-lg shadow-blue-900/30 transition-all duration-200 hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Enviar mensaje"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-6 w-6"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
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