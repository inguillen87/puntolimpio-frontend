import React, { useState, useMemo, useEffect } from 'react';
import { Item, Transaction, TransactionType, Location, Partner } from '../types';
import EditableCell from './EditableCell';

interface WarehouseLogProps {
  items: Item[];
  locations: Location[];
  partners: Partner[];
  transactions: Transaction[];
  isLoading: boolean;
  onDeleteTransaction: (transactionId: string) => void;
  onDeleteSelected: (transactionIds: string[]) => void;
  onUpdateTransaction: (transactionId: string, updatedFields: Partial<Transaction>) => Promise<void>;
}

type FilterType = 'ALL' | 'INCOME' | 'OUTCOME';

const DocumentIcon = () => (
    <div className="h-10 w-16 flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-md">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
    </div>
);

const DocumentImage: React.FC<{
    src?: string;
    alt: string;
    onClick: () => void;
}> = ({ src, alt, onClick }) => {
    const [imgError, setImgError] = useState(false);

    useEffect(() => {
        setImgError(false);
    }, [src]);

    if (!src || imgError) {
        return <DocumentIcon />;
    }

    return (
        <img 
            src={src} 
            alt={alt}
            className="h-10 w-16 object-cover rounded-md cursor-pointer hover:scale-105 transition-transform"
            onClick={onClick}
            onError={() => setImgError(true)}
        />
    );
};


const WarehouseLog: React.FC<WarehouseLogProps> = ({ items, locations, partners, transactions, isLoading, onDeleteTransaction, onDeleteSelected, onUpdateTransaction }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalImageSrc, setModalImageSrc] = useState<string | undefined>(undefined);
  const [filter, setFilter] = useState<FilterType>('ALL');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const itemMap = useMemo(() => new Map(items.map(item => [item.id, item.name])), [items]);
  const locationMap = useMemo(() => new Map(locations.map(loc => [loc.id, loc.name])), [locations]);
  const partnerMap = useMemo(() => new Map(partners.map(p => [p.id, p.name])), [partners]);


  const filteredAndSortedTransactions = useMemo(() => {
    const start = startDate ? new Date(startDate).setHours(0, 0, 0, 0) : null;
    const end = endDate ? new Date(endDate).setHours(23, 59, 59, 999) : null;

    return [...transactions]
      .filter(tx => {
        if (filter !== 'ALL' && tx.type !== filter) return false;

        const txDate = new Date(tx.createdAt).getTime();
        if (start && txDate < start) return false;
        if (end && txDate > end) return false;

        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [transactions, filter, startDate, endDate]);

  useEffect(() => {
    setSelected(new Set());
  }, [filter, startDate, endDate]);
  
  const handleViewDocument = (imageSrc?: string) => {
    if (imageSrc) {
        setModalImageSrc(imageSrc);
        setIsModalOpen(true);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setModalImageSrc(undefined);
  };

  const handleSelect = (id: string) => {
    setSelected(prev => {
        const newSet = new Set(prev);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        return newSet;
    });
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelected(new Set(filteredAndSortedTransactions.map(tx => tx.id)));
    } else {
      setSelected(new Set());
    }
  };

  const handleDeleteSelected = () => {
    onDeleteSelected(Array.from(selected));
    setSelected(new Set());
  }

  const handleExportCsv = () => {
    if (filteredAndSortedTransactions.length === 0) return;

    const headers = ['Fecha', 'Tipo', 'Artículo', 'Cantidad', 'Socio Logístico', 'Almacén', 'Documento', 'URL del Documento'];
    const data = filteredAndSortedTransactions.map(tx => [
        `"${new Date(tx.createdAt).toLocaleString('es-ES')}"`,
        tx.type === TransactionType.INCOME ? 'Ingreso' : 'Egreso',
        `"${itemMap.get(tx.itemId) || 'Desconocido'}"`,
        tx.quantity,
        `"${tx.partnerId ? partnerMap.get(tx.partnerId) : (tx.destination || '')}"`,
        `"${tx.locationId ? locationMap.get(tx.locationId) || 'General' : 'General'}"`,
        `"${tx.documentName || ''}"`,
        `"${tx.imageUrl || ''}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," 
        + headers.join(",") + "\n" 
        + data.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    const date = new Date().toISOString().split('T')[0];
    link.setAttribute("download", `reporte_movimientos_${date}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-2xl shadow-lg">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Almacén: Registro de Movimientos</h2>
            <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
                 {selected.size > 0 && (
                    <button onClick={handleDeleteSelected} className="bg-red-600 text-white font-bold py-2 px-3 rounded-lg hover:bg-red-700 transition-colors flex-shrink-0 text-sm">
                        Eliminar ({selected.size})
                    </button>
                )}
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} title="Fecha de inicio" className="px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"/>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} title="Fecha de fin" className="px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"/>
                <select value={filter} onChange={e => setFilter(e.target.value as FilterType)} className="w-full sm:w-auto px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm">
                    <option value="ALL">Todos</option>
                    <option value="INCOME">Ingresos</option>
                    <option value="OUTCOME">Egresos</option>
                </select>
                <button onClick={handleExportCsv} title="Exportar a CSV" className="bg-green-600 text-white font-bold py-2 px-3 rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2 text-sm">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                    <span>CSV</span>
                </button>
            </div>
        </div>
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700/50">
            <tr>
              <th scope="col" className="p-4"><input type="checkbox" onChange={handleSelectAll} checked={filteredAndSortedTransactions.length > 0 && selected.size === filteredAndSortedTransactions.length} className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"/></th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Fecha y Hora</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Tipo</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Artículo</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Cantidad</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Socio Logístico</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Ubicación</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Documento</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {isLoading ? (
                 <tr><td colSpan={9} className="text-center py-4 text-gray-500 dark:text-gray-400">Cargando transacciones...</td></tr>
            ) : filteredAndSortedTransactions.length > 0 ? (
              filteredAndSortedTransactions.map(tx => {
                return (
                  <tr key={tx.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                    <td className="p-4"><input type="checkbox" checked={selected.has(tx.id)} onChange={() => handleSelect(tx.id)} className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"/></td>
                    <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">{new Date(tx.createdAt).toLocaleString('es-ES')}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`font-semibold ${tx.type === TransactionType.INCOME ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{tx.type === TransactionType.INCOME ? 'Ingreso' : 'Egreso'}</span>
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900 dark:text-gray-100">{itemMap.get(tx.itemId) || 'Artículo Desconocido'}</td>
                    <td className="px-6 py-4 font-bold text-gray-900 dark:text-gray-100">
                      <EditableCell
                        value={tx.quantity}
                        onSave={(newValue) => onUpdateTransaction(tx.id, { quantity: Number(newValue) })}
                        type="number"
                        ariaLabel="Editar cantidad de transacción"
                      />
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700 dark:text-gray-300">
                        {tx.partnerId ? partnerMap.get(tx.partnerId) : (tx.destination || 'N/A')}
                    </td>
                     <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">{tx.locationId ? locationMap.get(tx.locationId) : 'General'}</td>
                    <td className="px-6 py-4">
                      <DocumentImage
                        src={tx.imageUrl}
                        alt={`Doc: ${tx.documentName || 'Documento adjunto'}`}
                        onClick={() => handleViewDocument(tx.imageUrl)}
                      />
                    </td>
                    <td className="px-6 py-4 text-center">
                        <button onClick={() => onDeleteTransaction(tx.id)} className="text-gray-400 hover:text-red-600 dark:hover:text-red-500 p-1 rounded-full transition-colors">
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
                        </button>
                    </td>
                  </tr>
                )
              })
            ) : (
              <tr><td colSpan={9} className="text-center py-4 text-gray-500 dark:text-gray-400">No hay transacciones registradas para este filtro.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4" onClick={handleCloseModal}>
            <div className="relative max-w-4xl max-h-full" onClick={(e) => e.stopPropagation()}>
                <img src={modalImageSrc} alt="Documento adjunto" className="max-w-full max-h-[90vh] object-contain rounded-lg"/>
                <button onClick={handleCloseModal} className="absolute -top-4 -right-4 bg-white text-black rounded-full h-8 w-8">&times;</button>
            </div>
        </div>
      )}
    </div>
  );
};

export default WarehouseLog;