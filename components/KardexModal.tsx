import React, { useMemo } from 'react';
import { Item, Transaction, TransactionType, Location, Partner } from '../types';

interface KardexModalProps {
  item: Item & { stock: number };
  transactions: Transaction[];
  onClose: () => void;
  locationMap: Map<string, string>;
  partnerMap: Map<string, string>;
}

const KardexModal: React.FC<KardexModalProps> = ({ item, transactions, onClose, locationMap, partnerMap }) => {
    const itemTransactions = useMemo(() => {
        return transactions
            .filter(tx => tx.itemId === item.id)
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()); // Ascending for calculation
    }, [item, transactions]);

    const finalTransactions = useMemo(() => {
        let runningStock = 0;
        return itemTransactions.map(tx => {
            runningStock += (tx.type === TransactionType.INCOME ? tx.quantity : -tx.quantity);
            return { ...tx, runningStock };
        });
    }, [itemTransactions]);

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl p-6 md:p-8 m-4 max-w-4xl w-full" onClick={e => e.stopPropagation()}>
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">Historial de Movimientos: <span className="text-blue-600 dark:text-blue-400">{item.name}</span></h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                </div>
                <div className="overflow-y-auto max-h-[70vh]">
                     <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700/50 sticky top-0">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Fecha</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Tipo</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Cantidad</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Stock Resultante</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Socio Logístico</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Almacén</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                           {finalTransactions.length > 0 ? [...finalTransactions].reverse().map(tx => ( // Reverse for descending order view
                                <tr key={tx.id}>
                                    <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">{new Date(tx.createdAt).toLocaleString('es-ES')}</td>
                                    <td className="px-6 py-4 text-sm">
                                         <span className={`font-semibold ${tx.type === TransactionType.INCOME ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{tx.type === TransactionType.INCOME ? 'Ingreso' : 'Egreso'}</span>
                                    </td>
                                    <td className={`px-6 py-4 text-sm font-semibold ${tx.type === TransactionType.INCOME ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{tx.type === TransactionType.INCOME ? '+' : '-'}{tx.quantity}</td>
                                    <td className="px-6 py-4 font-bold text-gray-900 dark:text-gray-100">{tx.runningStock}</td>
                                    <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">{tx.partnerId ? partnerMap.get(tx.partnerId) : (tx.destination || 'N/A')}</td>
                                    <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">{tx.locationId ? locationMap.get(tx.locationId) : 'General'}</td>
                                </tr>
                           )) : (
                               <tr><td colSpan={6} className="text-center py-4 text-gray-500 dark:text-gray-400">No hay movimientos para este artículo.</td></tr>
                           )}
                        </tbody>
                     </table>
                </div>
            </div>
        </div>
    );
};
export default KardexModal;