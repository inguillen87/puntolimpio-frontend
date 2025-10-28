import React, { useState, useMemo, useRef, useEffect } from 'react';
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

interface Message {
  sender: 'user' | 'ai';
  content: string;
  decoratedHtml?: string;
}

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
  baseResponse: string,
  snapshot: DemoUsageSnapshot | null,
  limitValue: number,
  getDemoResetLabel?: (isoDate?: string | null) => string
): { content: string; decoratedHtml?: string } => {
  if (!snapshot) {
    return { content: baseResponse };
  }

  const remaining = Math.max(snapshot.remaining, 0);
  const resetLabel = getDemoResetLabel ? getDemoResetLabel(snapshot.resetsOn) : 'el próximo ciclo';
  const footnote = `Demo: te quedan ${remaining} de ${limitValue} interacciones de IA hasta ${resetLabel}.`;

  return {
    content: `${baseResponse}\n\n${footnote}`,
    decoratedHtml: `${baseResponse}\n\n<span class="text-xs text-gray-500">${footnote}</span>`,
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

const formatTransactionsTable = (
  records: Transaction[],
  knowledge: KnowledgeBase,
  limit: number
): string => {
  if (records.length === 0) {
    return 'No hay transacciones registradas.';
  }

  const rows = records.slice(0, limit).map(tx => {
    const item = knowledge.itemsById.get(tx.itemId);
    const partner = tx.partnerId ? knowledge.partnersById.get(tx.partnerId) : undefined;
    const destination = partner
      ? normalizePartnerName(partner.name)
      : tx.destination
        ? normalizePartnerName(tx.destination)
        : 'Sin destino';
    return `| ${formatDate(tx.createdAt)} | ${item?.name ?? 'Artículo desconocido'} | ${tx.quantity} | ${destination} |`;
  });

  return ['| Fecha | Artículo | Cantidad | Destino |', '| --- | --- | --- | --- |', ...rows].join('\n');
};

const summarizePartnerActivity = (
  partnerQuery: string,
  knowledge: KnowledgeBase
): string | null => {
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
    return `No hay egresos asociados a ${normalizedName}.`;
  }
  const totalUnits = related.reduce((sum, tx) => sum + tx.quantity, 0);
  const table = formatTransactionsTable(related, knowledge, Math.min(related.length, 5));
  return `Resumen de ${normalizedName}: ${related.length} egresos por ${totalUnits} unidades.\n\n${table}`;
};

const resolveLocalAnswer = (question: string, knowledge: KnowledgeBase): string | null => {
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
    return `Stock disponible de ${maybeItem.item.name}: ${stock} unidad${stock === 1 ? '' : 'es'}.`;
  }

  if (/(egreso|venta)/.test(lowerQuestion)) {
    if (/ultimo|último|ultimas|últimas|ultimos|últimos/.test(lowerQuestion)) {
      const limitMatch = lowerQuestion.match(/(\d{1,2})/);
      const limit = limitMatch ? Math.min(parseInt(limitMatch[1], 10), 20) : 5;
      const table = formatTransactionsTable(knowledge.outcomesSorted, knowledge, limit);
      const { docs, totalUnits } = formatTotals(knowledge.outcomesSorted.slice(0, limit));
      return `Últimos ${docs} egresos (${totalUnits} unidades):\n\n${table}`;
    }

    if (/cu[aá]nt/.test(lowerQuestion) || /total/.test(lowerQuestion)) {
      const { docs, totalUnits } = formatTotals(knowledge.outcomesSorted);
      return `Se registraron ${docs} egresos recientes por un total de ${totalUnits} unidades.`;
    }
  }

  if (/(ingreso|compra)/.test(lowerQuestion)) {
    if (/ultimo|último|ultimas|últimas|ultimos|últimos/.test(lowerQuestion)) {
      const limitMatch = lowerQuestion.match(/(\d{1,2})/);
      const limit = limitMatch ? Math.min(parseInt(limitMatch[1], 10), 20) : 5;
      const table = formatTransactionsTable(knowledge.incomesSorted, knowledge, limit);
      const { docs, totalUnits } = formatTotals(knowledge.incomesSorted.slice(0, limit));
      return `Últimos ${docs} ingresos (${totalUnits} unidades):\n\n${table}`;
    }

    if (/cu[aá]nt/.test(lowerQuestion) || /total/.test(lowerQuestion)) {
      const { docs, totalUnits } = formatTotals(knowledge.incomesSorted);
      return `Se registraron ${docs} ingresos recientes por un total de ${totalUnits} unidades.`;
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
  
  const handleSend = async () => {
    if (!userInput.trim() || isLoading) return;

    const userMessage = userInput.trim();
    const historyTurns = mapMessagesToTurns(messages).slice(-MAX_MEMORY_TURNS);
    const newMessages: Message[] = [...messages, { sender: 'user', content: userMessage }];
    updateConversation(newMessages);
    setUserInput('');

    const localAnswer = resolveLocalAnswer(userMessage, knowledge);
    if (localAnswer) {
      updateConversation([...newMessages, { sender: 'ai', content: localAnswer }]);
      return;
    }

    if (!aiAvailable) {
      updateConversation([
        ...newMessages,
        {
          sender: 'ai',
          content: `La integración con ${providerLabel} no está configurada. Configura las credenciales correspondientes para habilitar el asistente.`,
        },
      ]);
      return;
    }

    if (!canUseRemoteAnalysis('assistant')) {
      const resetMessage = usageState?.resetsOn
        ? new Date(usageState.resetsOn).toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' })
        : 'el próximo ciclo';
      const reason = usageState?.degradeReason ?? 'El servicio remoto está deshabilitado temporalmente.';
      updateConversation([
        ...newMessages,
        {
          sender: 'ai',
          content: `${reason} Podés continuar con el QR y la carga manual hasta el reinicio (${resetMessage}).`,
        },
      ]);
      return;
    }

    const guardDemoUsage = Boolean(isDemoAccount && (demoLimit ?? null) !== null);
    const limitValue = demoLimit ?? DEMO_UPLOAD_LIMIT;
    let latestDemoSnapshot: DemoUsageSnapshot | null = demoUsage ?? null;

    const sendDemoLimitReached = (snapshot?: DemoUsageSnapshot | null) => {
      const resetLabel = getDemoResetLabel ? getDemoResetLabel(snapshot?.resetsOn) : 'el próximo ciclo';
      updateConversation([
        ...newMessages,
        {
          sender: 'ai',
          decoratedHtml: `Alcanzaste el máximo de ${limitValue} interacciones con IA disponibles en la experiencia demo. El cupo se restablece ${resetLabel}. Escribinos a <a href="mailto:info@puntolimpio.ar">info@puntolimpio.ar</a> para ampliar el acceso.`,
          content: `Alcanzaste el máximo de ${limitValue} interacciones con IA disponibles en la experiencia demo. El cupo se restablece ${resetLabel}. Escribinos a info@puntolimpio.ar para ampliar el acceso.`,
        },
      ]);
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

      const decoration = guardDemoUsage
        ? decorateAssistantResponse(baseResponse, latestDemoSnapshot, limitValue, getDemoResetLabel)
        : { content: baseResponse };

      updateConversation([
        ...newMessages,
        {
          sender: 'ai',
          content: decoration.content,
          decoratedHtml: decoration.decoratedHtml,
        },
      ]);
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
      updateConversation([
        ...newMessages,
        { sender: 'ai', content: 'Lo siento, ocurrió un error. Intenta de nuevo.' },
      ]);
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
                    {messages.map((msg, index) => (
                        <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-md p-3 rounded-2xl ${msg.sender === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-bl-none'}`}>
                                <div
                                  className="prose prose-sm dark:prose-invert"
                                  dangerouslySetInnerHTML={{
                                    __html: (msg.decoratedHtml ?? msg.content).replace(/\n/g, '<br />'),
                                  }}
                                />
                            </div>
                        </div>
                    ))}
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