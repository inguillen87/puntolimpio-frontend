import React, { useState, useEffect } from 'react';
import { Item, TransactionType, ScannedItem, ItemType, Location, ItemSize, Partner, PartnerType } from '../types';
import Spinner from './Spinner';

interface ManualEntryProps {
  items: Item[];
  locations: Location[];
  partners: Partner[];
  onConfirmTransaction: (items: ScannedItem[], type: TransactionType, documentFile?: File, locationId?: string, partnerId?: string, newPartnerName?: string) => Promise<void>;
  onDeleteAllData: () => void;
}

const ManualEntry: React.FC<ManualEntryProps> = ({ items, locations, partners, onConfirmTransaction, onDeleteAllData }) => {
  const [selectedItemId, setSelectedItemId] = useState<string>('NEW');
  const [newItemName, setNewItemName] = useState('');
  const [newItemType, setNewItemType] = useState<ItemType>(ItemType.CHAPA);
  const [newItemCost, setNewItemCost] = useState<number | ''>('');
  const [newItemSize, setNewItemSize] = useState<ItemSize>(ItemSize.PEQUENO);
  const [newItemWeight, setNewItemWeight] = useState<number | ''>('');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [transactionType, setTransactionType] = useState<TransactionType>(TransactionType.INCOME);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('');
  const [newPartnerName, setNewPartnerName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (locations.length > 0 && !selectedLocationId) {
      setSelectedLocationId(locations[0].id);
    }
  }, [locations, selectedLocationId]);
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    setError(null);

    if (locations.length > 0 && !selectedLocationId) {
        setError("Es obligatorio seleccionar un almacén.");
        return;
    }

    if (!quantity || quantity <= 0) {
      setError('Por favor, ingresa una cantidad válida.');
      return;
    }
    
    if (transactionType === TransactionType.OUTCOME && !selectedPartnerId) {
        setError('Es obligatorio seleccionar un cliente para los egresos.');
        return;
    }
    
    if (selectedPartnerId === 'NEW_PARTNER' && !newPartnerName.trim()) {
        setError('Por favor, ingresa un nombre para el nuevo socio logístico.');
        return;
    }

    let itemName = '';
    let itemType = newItemType;
    let itemCost = newItemCost !== '' ? Number(newItemCost) : undefined;
    let itemSize = newItemSize;
    let itemWeight = newItemWeight !== '' ? Number(newItemWeight) : undefined;

    if (selectedItemId === 'NEW') {
      if (!newItemName.trim()) {
        setError('Por favor, ingresa un nombre para el nuevo artículo.');
        return;
      }
      itemName = newItemName.trim();
    } else {
      const existingItem = items.find(i => i.id === selectedItemId);
      if (!existingItem) {
        setError('El artículo seleccionado no fue encontrado.');
        return;
      }
      itemName = existingItem.name;
      itemType = existingItem.type;
      itemCost = existingItem.cost;
      itemSize = existingItem.size || ItemSize.PEQUENO;
      itemWeight = existingItem.weight;
    }
    
    setIsSubmitting(true);
    try {
        const transactionItems: ScannedItem[] = [{ itemName, quantity: Number(quantity), itemType, cost: itemCost, size: itemSize, weight: itemWeight }];
        await onConfirmTransaction(
            transactionItems, 
            transactionType, 
            undefined, 
            selectedLocationId, 
            selectedPartnerId === 'NEW_PARTNER' ? undefined : selectedPartnerId || undefined,
            selectedPartnerId === 'NEW_PARTNER' ? newPartnerName : undefined
        ); 
        setSelectedItemId('NEW');
        setNewItemName('');
        setNewItemCost('');
        setNewItemSize(ItemSize.PEQUENO);
        setNewItemWeight('');
        setQuantity('');
        setSelectedPartnerId('');
        setNewPartnerName('');
    } catch (err: any) {
        setError(err.message || 'Ocurrió un error inesperado.');
    } finally {
        setIsSubmitting(false);
    }
  };

  const formElementClasses = "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm";

  if (locations.length === 0) {
    return (
        <div className="space-y-8">
            <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-2xl shadow-lg">
                <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4">Ingreso Manual Deshabilitado</h2>
                <div className="p-4 bg-yellow-100 dark:bg-yellow-900/50 border-l-4 border-yellow-500 text-yellow-800 dark:text-yellow-200 rounded-r-lg">
                    <p className="font-bold">Acción Requerida</p>
                    <p>Debes crear al menos un almacén en la pestaña de 'Config.' para poder registrar transacciones manuales.</p>
                </div>
            </div>
            <div className="bg-red-100 dark:bg-red-900/50 border-l-4 border-red-500 text-red-700 dark:text-red-200 p-6 rounded-lg shadow-lg">
                <h3 className="text-xl font-bold mb-2">Zona de Peligro</h3>
                <p className="mb-4">Esta acción es irreversible y eliminará permanentemente todo el inventario, las transacciones y los registros de control. Úsalo con extrema precaución.</p>
                <button onClick={onDeleteAllData} className="bg-red-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-700 transition-colors w-full sm:w-auto">
                    Borrar Todos los Datos de la Aplicación
                </button>
            </div>
        </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-2xl shadow-lg">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-6">Ingreso Manual</h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          
          {locations.length > 0 && (
            <div>
                <label htmlFor="location" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Almacén (Obligatorio)</label>
                <select id="location" value={selectedLocationId} onChange={e => setSelectedLocationId(e.target.value)} className={formElementClasses}>
                {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
                </select>
            </div>
          )}
          
          <div>
            <label htmlFor="item" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Artículo</label>
            <select
              id="item"
              value={selectedItemId}
              onChange={e => setSelectedItemId(e.target.value)}
              className={formElementClasses}
            >
              <option value="NEW">-- Registrar Nuevo Artículo --</option>
              {items.map(item => (
                <option key={item.id} value={item.id}>{item.name} ({item.type})</option>
              ))}
            </select>
          </div>

          {selectedItemId === 'NEW' && (
            <>
              <div>
                  <label htmlFor="newItemName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Nombre del Nuevo Artículo</label>
                  <input type="text" id="newItemName" value={newItemName} onChange={e => setNewItemName(e.target.value)} className={formElementClasses} placeholder="Ej: Chapa MRZ"/>
              </div>
              <div className="grid grid-cols-2 gap-4">
                 <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tipo</label>
                    <div className="mt-2 flex space-x-4 text-gray-900 dark:text-gray-200">
                        <label className="flex items-center"><input type="radio" value={ItemType.CHAPA} checked={newItemType === ItemType.CHAPA} onChange={() => setNewItemType(ItemType.CHAPA)} className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600" /><span className="ml-2">Chapa</span></label>
                        <label className="flex items-center"><input type="radio" value={ItemType.MODULO} checked={newItemType === ItemType.MODULO} onChange={() => setNewItemType(ItemType.MODULO)} className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600" /><span className="ml-2">Módulo</span></label>
                    </div>
                </div>
                 <div>
                    <label htmlFor="newItemCost" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Costo Unitario (Opcional)</label>
                    <input type="number" id="newItemCost" value={newItemCost} onChange={e => setNewItemCost(e.target.value === '' ? '' : Number(e.target.value))} min="0" step="0.01" className={formElementClasses} placeholder="Ej: 25.50"/>
                </div>
              </div>
               <div className="grid grid-cols-2 gap-4">
                <div>
                    <label htmlFor="newItemSize" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tamaño</label>
                    <select id="newItemSize" value={newItemSize} onChange={e => setNewItemSize(e.target.value as ItemSize)} className={formElementClasses}>
                        <option value={ItemSize.PEQUENO}>Pequeño</option>
                        <option value={ItemSize.MEDIANO}>Mediano</option>
                        <option value={ItemSize.GRANDE}>Grande</option>
                    </select>
                </div>
                <div>
                    <label htmlFor="newItemWeight" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Peso (kg) (Opcional)</label>
                    <input type="number" id="newItemWeight" value={newItemWeight} onChange={e => setNewItemWeight(e.target.value === '' ? '' : Number(e.target.value))} min="0" step="0.1" className={formElementClasses} placeholder="Ej: 1.5"/>
                </div>
              </div>
            </>
          )}

          <div>
            <label htmlFor="quantity" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Cantidad</label>
            <input type="number" id="quantity" value={quantity} onChange={e => setQuantity(e.target.value === '' ? '' : Number(e.target.value))} min="1" className={formElementClasses} placeholder="Ej: 250"/>
          </div>

          <div>
            <label htmlFor="transactionType" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Tipo de Transacción</label>
            <select id="transactionType" value={transactionType} onChange={e => setTransactionType(e.target.value as TransactionType)} className={formElementClasses}>
              <option value={TransactionType.INCOME}>Ingreso</option>
              <option value={TransactionType.OUTCOME}>Egreso</option>
            </select>
          </div>
          
          <div>
            <label htmlFor="partner" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Socio Logístico ({transactionType === TransactionType.INCOME ? 'Proveedor' : 'Cliente'})
            </label>
            <select
              id="partner"
              value={selectedPartnerId}
              onChange={e => setSelectedPartnerId(e.target.value)}
              className={formElementClasses}
            >
              <option value="">-- Opcional --</option>
              <option value="NEW_PARTNER">-- Agregar Nuevo Socio --</option>
              {partners
                .filter(p => transactionType === TransactionType.INCOME ? p.isSupplier : p.isCustomer)
                .map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          
          {selectedPartnerId === 'NEW_PARTNER' && (
              <div>
                  <label htmlFor="newPartnerName" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Nombre del Nuevo Socio</label>
                  <input type="text" id="newPartnerName" value={newPartnerName} onChange={e => setNewPartnerName(e.target.value)} className={formElementClasses} placeholder="Ej: Municipalidad de Las Heras"/>
              </div>
          )}


          {error && <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>}

          <div>
            <button type="submit" disabled={isSubmitting} className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 dark:disabled:bg-blue-800">
              {isSubmitting ? <Spinner /> : 'Registrar Transacción'}
            </button>
          </div>
        </form>
      </div>
      
      <div className="bg-red-100 dark:bg-red-900/50 border-l-4 border-red-500 text-red-700 dark:text-red-200 p-6 rounded-lg shadow-lg">
        <h3 className="text-xl font-bold mb-2">Zona de Peligro</h3>
        <p className="mb-4">Esta acción es irreversible y eliminará permanentemente todo el inventario, las transacciones y los registros de control. Úsalo con extrema precaución.</p>
        <button onClick={onDeleteAllData} className="bg-red-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-700 transition-colors w-full sm:w-auto">
            Borrar Todos los Datos de la Aplicación
        </button>
      </div>

    </div>
  );
};

export default ManualEntry;