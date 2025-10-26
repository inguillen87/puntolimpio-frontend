import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { BrowserQRCodeReader, IScannerControls } from '@zxing/browser';
import { Item, TransactionType, ScannedItem, Location, Partner } from '../types';
import Spinner from './Spinner';

interface QrScannerProps {
  items: Item[];
  locations: Location[];
  partners: Partner[];
  selectedLocationId: string;
  onConfirmTransaction: (items: ScannedItem[], type: TransactionType, documentFile?: File, locationId?: string, partnerId?: string, newPartnerName?: string) => Promise<void>;
}

const QrScanner: React.FC<QrScannerProps> = ({ items, onConfirmTransaction, locations, partners, selectedLocationId }) => {
  const [scannedItem, setScannedItem] = useState<Item | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quantity, setQuantity] = useState<number | ''>(1);
  const [transactionType, setTransactionType] = useState<TransactionType>(TransactionType.OUTCOME);
  const [selectedPartnerId, setSelectedPartnerId] = useState<string>('');
  const [newPartnerName, setNewPartnerName] = useState('');
  const [scannerInput, setScannerInput] = useState('');
  const [shouldRestartScan, setShouldRestartScan] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const zxingControlsRef = useRef<IScannerControls | null>(null);

  const filteredPartners = useMemo(() => {
    return partners.filter(p => transactionType === TransactionType.INCOME ? p.isSupplier : p.isCustomer);
  }, [partners, transactionType]);

  const stopScanning = useCallback(() => {
    if (zxingControlsRef.current) {
        zxingControlsRef.current.stop();
        zxingControlsRef.current = null;
    }
  }, []);

  const processScannedCode = useCallback((code: string) => {
    if (isProcessing) return;
    setIsProcessing(true);
    stopScanning(); // Stop camera scanning once a code is found
    const foundItem = items.find(i => i.id === code.trim());
    if (foundItem) {
      setScannedItem(foundItem);
      setError(null);
    } else {
      setError(`Código inválido. Artículo con ID: ${code.trim()} no encontrado.`);
      setTimeout(() => {
        setError(null);
        setIsProcessing(false);
        setScannerInput('');
        inputRef.current?.focus(); // Re-focus for next laser scan
        setShouldRestartScan(true); // Signal to restart scanning
      }, 3000);
    }
  }, [items, isProcessing, stopScanning]);

  const startScanning = useCallback(async () => {
    if (isProcessing || zxingControlsRef.current) return;
    setError(null);

    try {
        const codeReader = new BrowserQRCodeReader();
        if (videoRef.current) {
            const controls = await codeReader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
                if (result && !isProcessing) {
                    processScannedCode(result.getText());
                }
            });
            zxingControlsRef.current = controls;
        }
    } catch (err) {
        console.error("Error starting camera:", err);
        setError("No se pudo acceder a la cámara. Revisa los permisos.");
    }
  }, [isProcessing, processScannedCode]);

  useEffect(() => {
    if (shouldRestartScan) {
      startScanning();
      setShouldRestartScan(false);
    }
  }, [shouldRestartScan, startScanning]);

  const resetState = useCallback(() => {
    setScannedItem(null);
    setQuantity(1);
    setTransactionType(TransactionType.OUTCOME);
    setSelectedPartnerId('');
    setNewPartnerName('');
    setIsProcessing(false);
    setIsSubmitting(false);
    setScannerInput('');
    setError(null);
    setShouldRestartScan(true);
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    startScanning();
    inputRef.current?.focus();
    return () => stopScanning();
  }, [startScanning, stopScanning]);
  
  const handleSubmit = async () => {
    if (isSubmitting || !scannedItem || !quantity || quantity <= 0) return;

    if (transactionType === TransactionType.OUTCOME && !selectedPartnerId) {
        setError('Es obligatorio seleccionar un cliente para los egresos.');
        return;
    }
    
    if (selectedPartnerId === 'NEW_PARTNER' && !newPartnerName.trim()) {
        setError('Por favor, ingresa un nombre para el nuevo socio logístico.');
        return;
    }
    
    if (!selectedLocationId) {
        setError("Error: No hay un almacén seleccionado. Ve a otra pestaña y selecciona uno.");
        setIsSubmitting(false);
        return;
    }
    
    setIsSubmitting(true);
    setError(null);

    try {
        const transactionItem: ScannedItem = {
            itemName: scannedItem.name,
            quantity: Number(quantity),
            itemType: scannedItem.type,
            cost: scannedItem.cost,
            size: scannedItem.size,
            weight: scannedItem.weight,
        };
        await onConfirmTransaction(
            [transactionItem], 
            transactionType, 
            undefined, 
            selectedLocationId, 
            selectedPartnerId === 'NEW_PARTNER' ? undefined : selectedPartnerId || undefined,
            selectedPartnerId === 'NEW_PARTNER' ? newPartnerName : undefined
        );
        resetState();
    } catch (err: any) {
        setError(err.message || 'Ocurrió un error inesperado.');
        setIsSubmitting(false);
    }
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        processScannedCode(scannerInput);
    }
  };

  const formElementClasses = "mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm";


  return (
    <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-2xl shadow-lg relative overflow-hidden">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4">Escanear Código QR</h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">Apunta la cámara o usa un escáner láser para registrar un movimiento.</p>

      {/* Hidden input for laser scanners */}
      <input
        ref={inputRef}
        type="text"
        value={scannerInput}
        onChange={(e) => setScannerInput(e.target.value)}
        onKeyDown={handleInputKeyDown}
        aria-label="Entrada de escáner de código de barras"
        className="absolute top-0 left-0 w-px h-px border-0 p-0 m-0 overflow-hidden"
        style={{ clip: 'rect(0, 0, 0, 0)' }}
        autoFocus
      />

      <div className="relative w-full aspect-video bg-gray-900 rounded-lg overflow-hidden border-4 border-gray-300 dark:border-gray-600">
        <video ref={videoRef} playsInline className="w-full h-full object-cover" />
        <div className="absolute inset-0 flex items-center justify-center p-8">
            <div className="w-full h-full border-4 border-dashed border-white/50 rounded-xl" />
        </div>
      </div>
      
      {error && !scannedItem && (
        <div className="mt-4 p-4 text-center bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-200 rounded-lg">{error}</div>
      )}

      {scannedItem && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4" onClick={(e) => e.target === e.currentTarget && resetState()}>
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 w-full max-w-lg space-y-6" onClick={e => e.stopPropagation()}>
                <div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Artículo Detectado</p>
                    <h3 className="text-3xl font-bold text-blue-600 dark:text-blue-400">{scannedItem.name}</h3>
                </div>
                
                <div className="space-y-4">
                     <div>
                        <label htmlFor="quantity" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Cantidad</label>
                        <input type="number" id="quantity" value={quantity} onChange={e => setQuantity(e.target.value === '' ? '' : Number(e.target.value))} min="1" className={formElementClasses} autoFocus/>
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
                            <option value="">{transactionType === TransactionType.OUTCOME ? '-- Obligatorio --' : '-- Opcional --'}</option>
                            <option value="NEW_PARTNER">-- Agregar Nuevo Socio --</option>
                            {filteredPartners.map(p => (
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
                </div>
                
                {error && <p className="text-sm text-center text-red-600 dark:text-red-400">{error}</p>}

                <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                    <button onClick={resetState} disabled={isSubmitting} className="w-full bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-gray-200 font-bold py-3 px-4 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500">Cancelar</button>
                    <button onClick={handleSubmit} disabled={isSubmitting || !quantity} className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 disabled:bg-blue-400">
                        {isSubmitting ? <Spinner /> : 'Confirmar'}
                    </button>
                </div>
            </div>
        </div>
      )}

    </div>
  );
};

export default QrScanner;
