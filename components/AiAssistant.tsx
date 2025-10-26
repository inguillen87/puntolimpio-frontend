import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Item, Transaction, Partner, TransactionType } from '../types';
import { getAiAssistantResponse, isGeminiConfigured } from '../services/geminiService';
import Spinner from './Spinner';
import { useUsageLimits } from '../context/UsageLimitsContext';

interface AiAssistantProps {
  items: Item[];
  transactions: Transaction[];
  partners: Partner[];
}

interface Message {
  sender: 'user' | 'ai';
  text: string;
}

const AiAssistant: React.FC<AiAssistantProps> = ({ items, transactions, partners }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { canUseRemoteAnalysis, recordRemoteUsage, usageState } = useUsageLimits();
  const aiAvailable = isGeminiConfigured;

  const inventoryContext = useMemo(() => {
    const stockMap = new Map<string, number>();
    items.forEach(item => stockMap.set(item.id, 0));
    transactions.forEach(tx => {
      const stock = stockMap.get(tx.itemId) || 0;
      stockMap.set(tx.itemId, stock + (tx.type === TransactionType.INCOME ? tx.quantity : -tx.quantity));
    });
    
    const itemsWithStock = items.map(item => ({
      id: item.id,
      name: item.name,
      type: item.type,
      stock: stockMap.get(item.id) || 0,
    }));
    
    const recentTransactions = transactions
        .slice(-20) // Limit to last 20 for context size
        .map(tx => ({
            itemName: items.find(i => i.id === tx.itemId)?.name || 'Desconocido',
            type: tx.type,
            quantity: tx.quantity,
            date: tx.createdAt.split('T')[0],
            partnerName: partners.find(p => p.id === tx.partnerId)?.name
        }));

    return JSON.stringify({
      inventory: itemsWithStock,
      partners,
      recentTransactions,
    });
  }, [items, transactions, partners]);
  
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  const handleSend = async () => {
    if (!userInput.trim() || isLoading) return;

    const newMessages: Message[] = [...messages, { sender: 'user', text: userInput }];
    setMessages(newMessages);
    setUserInput('');
    if (!aiAvailable) {
        setMessages([
            ...newMessages,
            { sender: 'ai', text: 'La integración con Gemini no está configurada. Agrega la variable VITE_GEMINI_API_KEY para habilitar el asistente.' },
        ]);
        return;
    }
    if (!canUseRemoteAnalysis('assistant')) {
        const resetMessage = usageState?.resetsOn ? new Date(usageState.resetsOn).toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' }) : 'el próximo ciclo';
        const reason = usageState?.degradeReason ?? 'El servicio remoto está deshabilitado temporalmente.';
        setMessages([
            ...newMessages,
            { sender: 'ai', text: `${reason} Podés continuar con el QR y la carga manual hasta el reinicio (${resetMessage}).` }
        ]);
        return;
    }

    setIsLoading(true);

    try {
        const aiResponse = await getAiAssistantResponse(inventoryContext, userInput);
        recordRemoteUsage('assistant');
        setMessages([...newMessages, { sender: 'ai', text: aiResponse }]);
    } catch (error) {
        console.error("AI Assistant error:", error);
        setMessages([...newMessages, { sender: 'ai', text: "Lo siento, ocurrió un error. Intenta de nuevo." }]);
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
                                    ? 'La integración con Gemini no está configurada. Agrega la clave VITE_GEMINI_API_KEY para habilitar el asistente.'
                                    : 'La cuota remota está agotada. Usa el QR y la carga manual hasta el próximo reinicio o solicita un upgrade.'}
                            </p>
                        </div>
                    )}
                    {messages.map((msg, index) => (
                        <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-md p-3 rounded-2xl ${msg.sender === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-100 rounded-bl-none'}`}>
                                <div className="prose prose-sm dark:prose-invert" dangerouslySetInnerHTML={{ __html: msg.text.replace(/\n/g, '<br />') }} />
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