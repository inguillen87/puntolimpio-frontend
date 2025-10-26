import React, { useState, useMemo } from 'react';
import { Item, Transaction, TransactionType, ItemType, ItemSize, Location, Partner } from '../types';
import EditableCell from './EditableCell';
import KardexModal from './KardexModal';
import QrDisplayModal from './QrDisplayModal';

interface DashboardProps {
  items: Item[];
  transactions: Transaction[];
  locations: Location[];
  partners: Partner[];
  isLoading: boolean;
  onExport: (selectedItems: (Item & { stock: number })[]) => void;
  onUpdateItem: (itemId: string, updatedFields: Partial<Item>) => Promise<void>;
}

const Dashboard: React.FC<DashboardProps> = ({ items, transactions, locations, partners, isLoading, onExport, onUpdateItem }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [editingSizeId, setEditingSizeId] = useState<string | null>(null);
  const [kardexItem, setKardexItem] = useState<(Item & { stock: number }) | null>(null);
  const [qrItem, setQrItem] = useState<Item | null>(null);

  const inventory = useMemo(() => {
    const stockMap = new Map<string, number>();
    items.forEach(item => stockMap.set(item.id, 0));

    transactions.forEach(tx => {
      const currentStock = stockMap.get(tx.itemId) || 0;
      if (tx.type === TransactionType.INCOME) {
        stockMap.set(tx.itemId, currentStock + tx.quantity);
      } else {
        stockMap.set(tx.itemId, currentStock - tx.quantity);
      }
    });

    return items
      .map(item => ({
        ...item,
        stock: stockMap.get(item.id) || 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items, transactions]);

  const locationMap = useMemo(() => new Map(locations.map(loc => [loc.id, loc.name])), [locations]);
  const partnerMap = useMemo(() => new Map(partners.map(p => [p.id, p.name])), [partners]);

  const filteredInventory = useMemo(() => {
    return inventory.filter(item =>
      item.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [inventory, searchTerm]);

  const handleSelect = (itemId: string) => {
    setSelectedItems(prev => {
        const newSet = new Set(prev);
        if(newSet.has(itemId)) {
            newSet.delete(itemId);
        } else {
            newSet.add(itemId);
        }
        return newSet;
    });
  }

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedItems(new Set(filteredInventory.map(i => i.id)));
    } else {
      setSelectedItems(new Set());
    }
  };

  const handleExportClick = () => {
    const itemsToExport = inventory.filter(item => selectedItems.has(item.id));
    onExport(itemsToExport);
  }

  const handleSizeChange = async (itemId: string, newSize: ItemSize) => {
    await onUpdateItem(itemId, { size: newSize });
    setEditingSizeId(null);
  }


  return (
    <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-2xl shadow-lg">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4 sm:mb-0">Panel de Inventario</h2>
        {selectedItems.size > 0 && (
            <button onClick={handleExportClick} className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2">
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v3.586l-1.293-1.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V8z" clipRule="evenodd" /></svg>
                <span>Exportar ({selectedItems.size})</span>
            </button>
        )}
      </div>
      <div className="mb-6">
        <input
          type="text"
          placeholder="Buscar un artículo..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 dark:placeholder-gray-400"
        />
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700/50">
            <tr>
              <th scope="col" className="p-4">
                <input type="checkbox" onChange={handleSelectAll} checked={filteredInventory.length > 0 && selectedItems.size === filteredInventory.length} className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"/>
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Artículo</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Tipo</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Costo</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Tamaño</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Peso (kg)</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Stock</th>
              <th scope="col" className="px-6 py-3 text-center text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">QR</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {isLoading ? (
                <tr><td colSpan={8} className="text-center py-4 text-gray-500 dark:text-gray-400">Cargando inventario...</td></tr>
            ) : filteredInventory.length > 0 ? (
              filteredInventory.map(item => (
                <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                  <td className="p-4">
                     <input type="checkbox" checked={selectedItems.has(item.id)} onChange={() => handleSelect(item.id)} className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500" />
                  </td>
                  <td className="px-6 py-4 font-medium text-gray-900 dark:text-gray-100">
                    <button onClick={() => setKardexItem(item)} className="text-blue-600 dark:text-blue-400 hover:underline font-semibold text-left">
                        {item.name}
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${item.type === ItemType.CHAPA ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300' : 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300'}`}>{item.type}</span>
                  </td>
                  <td className="px-6 py-4 text-gray-800 dark:text-gray-200">
                    <EditableCell 
                        value={item.cost || 0}
                        onSave={(newValue) => onUpdateItem(item.id, { cost: Number(newValue) })}
                        type="number"
                        ariaLabel={`Editar costo de ${item.name}`}
                    />
                  </td>
                  <td className="px-6 py-4 text-gray-800 dark:text-gray-200">
                    {editingSizeId === item.id ? (
                        <select
                            value={item.size || ''}
                            onChange={(e) => handleSizeChange(item.id, e.target.value as ItemSize)}
                            onBlur={() => setEditingSizeId(null)}
                            autoFocus
                            className="px-1 py-0.5 border border-blue-500 rounded-md bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                        >
                            <option value={ItemSize.PEQUENO}>Pequeño</option>
                            <option value={ItemSize.MEDIANO}>Mediano</option>
                            <option value={ItemSize.GRANDE}>Grande</option>
                        </select>
                    ) : (
                        <span onClick={() => setEditingSizeId(item.id)} className="cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 rounded px-1 py-0.5 transition-colors duration-200 block min-h-[22px]" title="Haz clic para editar">
                            {item.size || 'N/A'}
                        </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-gray-800 dark:text-gray-200">
                    <EditableCell 
                        value={item.weight || 0}
                        onSave={(newValue) => onUpdateItem(item.id, { weight: Number(newValue) })}
                        type="number"
                        ariaLabel={`Editar peso de ${item.name}`}
                    />
                  </td>
                  <td className="px-6 py-4 font-semibold text-gray-900 dark:text-gray-100">{item.stock}</td>
                  <td className="px-6 py-4 text-center">
                    <button onClick={() => setQrItem(item)} title={`Generar QR para ${item.name}`} className="text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400 p-1 rounded-full transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m12.728 12.728l-.707-.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                        <path d="M5 12h.01M12 12h.01M19 12h.01M12 5v.01M12 19v.01" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 4h2v2H4zM18 4h2v2h-2zM4 18h2v2H4zM18 18h2v2h-2z" />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={8} className="text-center py-4 text-gray-500 dark:text-gray-400">No se encontraron artículos.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {kardexItem && (
        <KardexModal 
            item={kardexItem}
            transactions={transactions}
            onClose={() => setKardexItem(null)}
            locationMap={locationMap}
            partnerMap={partnerMap}
        />
      )}
      {qrItem && (
        <QrDisplayModal
          item={qrItem}
          onClose={() => setQrItem(null)}
        />
      )}
    </div>
  );
};

export default Dashboard;