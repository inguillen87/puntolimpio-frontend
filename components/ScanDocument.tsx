import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { analyzeDocument } from '../services/documentAnalysisService';
import { AnalysisSource } from '../services/scanCacheService';
import { getProviderLabel, isRemoteProviderConfigured } from '../services/aiService';
import { ScannedItem, DocumentType, ScannedControlSheetData, ScannedTransactionData, Location } from '../types';
import { useUsageLimits } from '../context/UsageLimitsContext';
import Spinner from './Spinner';

interface ScanDocumentProps {
  onConfirmUpload: (data: ScannedTransactionData | ScannedControlSheetData[], type: DocumentType, documentFile: File, locationId?: string) => Promise<void>;
  locations: Location[];
}

const ScanDocument: React.FC<ScanDocumentProps> = ({ onConfirmUpload, locations }) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisNotice, setAnalysisNotice] = useState<string | null>(null);
  const [analysisSource, setAnalysisSource] = useState<AnalysisSource | null>(null);
  const [analysisFromCache, setAnalysisFromCache] = useState(false);
  const [scannedData, setScannedData] = useState<ScannedTransactionData | ScannedControlSheetData[] | null>(null);
  const [documentType, setDocumentType] = useState<DocumentType>(DocumentType.INCOME);
  const [selectedLocationId, setSelectedLocationId] = useState<string>('');
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const { canUseRemoteAnalysis, recordRemoteUsage, usageState } = useUsageLimits();
  const providerLabel = useMemo(() => getProviderLabel(), []);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const analysisSourceLabel = useMemo(() => {
    if (!analysisSource) return null;
    const base = analysisSource === 'qr'
      ? 'QR local'
      : analysisSource === 'ocr'
        ? 'OCR local'
        : `IA remota (${providerLabel})`;
    return analysisFromCache ? `${base} · cacheado` : base;
  }, [analysisSource, analysisFromCache, providerLabel]);

  useEffect(() => {
    if (locations.length > 0 && !selectedLocationId) {
      setSelectedLocationId(locations[0].id);
    }
  }, [locations, selectedLocationId]);

  useEffect(() => {
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    };
  }, []);

  const startScan = useCallback(async (fileToScan: File) => {
    if (!fileToScan) return;

    const providerConfigured = isRemoteProviderConfigured();
    const allowRemote = providerConfigured && canUseRemoteAnalysis('document');

    setIsLoading(true);
    setError(null);
    setScannedData(null);
    setAnalysisSource(null);
    setAnalysisFromCache(false);

    if (!providerConfigured) {
      setAnalysisNotice(`Proveedor ${providerLabel} no configurado. Operando con QR y OCR local sin costos externos.`);
    } else if (!allowRemote) {
      const resetMessage = usageState?.resetsOn ? new Date(usageState.resetsOn).toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' }) : 'el próximo ciclo';
      const reason = usageState?.degradeReason ?? 'La cuota remota está agotada.';
      setAnalysisNotice(`${reason} Se ejecutará únicamente QR/OCR local hasta ${resetMessage}.`);
    } else {
      setAnalysisNotice(null);
    }

    try {
      const outcome = await analyzeDocument(fileToScan, documentType, { allowRemote });
      setFile(outcome.processedFile);
      setPreview(outcome.previewDataUrl);
      if (documentType === DocumentType.CONTROL) {
        setScannedData(outcome.data as ScannedControlSheetData[]);
      } else {
        setScannedData(outcome.data as ScannedTransactionData);
      }
      setAnalysisSource(outcome.source);
      setAnalysisFromCache(outcome.fromCache);
      if (outcome.usedRemote && !outcome.fromCache) {
        recordRemoteUsage('document');
      }
    } catch (err: any) {
      console.error('Error durante el escaneo:', err);
      setError(err.message || 'Ocurrió un error al procesar el documento.');
      setScannedData(null);
      setPreview(null);
    } finally {
      setIsLoading(false);
    }
  }, [documentType, canUseRemoteAnalysis, usageState, recordRemoteUsage]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) startScan(selectedFile);
  };
  
  const resetState = () => {
    setFile(null);
    setPreview(null);
    setScannedData(null);
    setError(null);
    setIsLoading(false);
    setAnalysisNotice(null);
    setAnalysisSource(null);
    setAnalysisFromCache(false);
    setDocumentType(DocumentType.INCOME);
  };

  const handleConfirm = async () => {
    if (scannedData && file && !isConfirming) {
        if(locations.length > 0 && !selectedLocationId) {
            setError("Es obligatorio seleccionar un almacén para registrar la operación.");
            return;
        }
      setIsConfirming(true);
      setError(null);
      try {
        await onConfirmUpload(scannedData, documentType, file, selectedLocationId);
        resetState();
      } catch (err: any) {
        console.error("Confirmation failed:", err);
        setError(err.message || 'Ocurrió un error inesperado.');
      } finally {
        setIsConfirming(false);
      }
    }
  };
  
  const handleOpenCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setIsCameraOpen(true);
      setError(null);
    } catch (err) {
      console.error("Error al acceder a la cámara:", err);
      setError("No se pudo acceder a la cámara. Asegúrate de haber otorgado los permisos necesarios.");
    }
  };

  const handleCloseCamera = () => {
    if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
    setIsCameraOpen(false);
  };

  const handleTakePicture = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d')?.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
      handleCloseCamera();
      canvas.toBlob((blob) => {
        if (blob) {
          const capturedFile = new File([blob], `captura-${Date.now()}.jpg`, { type: 'image/jpeg' });
          startScan(capturedFile);
        }
      }, 'image/jpeg');
    }
  };

  const renderScannedData = () => {
    if (!scannedData) return null;
    
    if (documentType === DocumentType.CONTROL) {
        const sheets = scannedData as ScannedControlSheetData[];
        return sheets.length > 0 && (
            <div className="space-y-2">
                {sheets.map((sheet, index) => (
                    <div key={index} className="grid grid-cols-3 gap-2 text-sm bg-gray-50 dark:bg-gray-700/50 p-2 rounded-lg">
                        <span className="font-medium text-gray-800 dark:text-gray-100 truncate">Destino: {sheet.destination}</span>
                        <span className="text-gray-600 dark:text-gray-300 truncate">Modelo: {sheet.model}</span>
                        <span className="font-bold text-blue-600 dark:text-blue-400 text-right">{sheet.quantity} kits</span>
                    </div>
                ))}
            </div>
        );
    }
    
    const { items, destination } = scannedData as ScannedTransactionData;
    return items.length > 0 && (
        <>
            {destination && <p className="mb-3 text-sm font-semibold text-gray-600 dark:text-gray-300">Destino detectado: <span className="text-blue-600 dark:text-blue-400">{destination}</span></p>}
            <div className="space-y-4">
                {items.map((item, index) => (
                    <div key={index} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 p-3 rounded-lg">
                        <div>
                            <span className="font-medium text-gray-800 dark:text-gray-100">{item.itemName}</span>
                            <span className={`ml-2 px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${item.itemType === 'CHAPA' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' : 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'}`}>{item.itemType}</span>
                        </div>
                        <span className="font-bold text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/50 px-3 py-1 rounded-full text-sm">{item.quantity} unidades</span>
                    </div>
                ))}
            </div>
        </>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-2xl shadow-lg">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-6">Escanear Documento (IA)</h2>

      {analysisNotice && (
        <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-500/40 dark:bg-yellow-900/30 dark:text-yellow-200">
          {analysisNotice}
        </div>
      )}
      
      {isCameraOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex flex-col items-center justify-center z-50 p-4">
            <video ref={videoRef} autoPlay playsInline className="max-w-full max-h-[70vh] rounded-lg mb-4 border-4 border-gray-600"></video>
            <canvas ref={canvasRef} className="hidden"></canvas>
            <div className="flex items-center space-x-4">
            <button onClick={handleTakePicture} className="bg-blue-600 text-white font-bold py-3 px-6 rounded-full hover:bg-blue-700 transition-colors duration-300 shadow-lg flex items-center space-x-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                <span>Tomar Foto</span>
            </button>
            <button onClick={handleCloseCamera} className="bg-gray-600 text-white font-bold py-3 px-6 rounded-full hover:bg-gray-700 transition-colors duration-300">Cancelar</button>
            </div>
        </div>
      )}

      {!file && !isLoading ? (
        <div className="space-y-4">
            <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">1. Selecciona el tipo de documento</label>
                <select value={documentType} onChange={e => setDocumentType(e.target.value as DocumentType)} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition">
                    <option value={DocumentType.INCOME}>Ingreso (Remito de compra, Factura)</option>
                    <option value={DocumentType.OUTCOME}>Egreso (Remito de entrega, Venta)</option>
                    <option value={DocumentType.CONTROL}>Planilla de Control (Fiscalización)</option>
                </select>
            </div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">2. Sube o toma una foto del documento</label>
            <div className="flex items-center justify-center w-full">
            <label htmlFor="dropzone-file" className="flex flex-col items-center justify-center w-full h-52 border-2 border-gray-300 dark:border-gray-600 border-dashed rounded-lg cursor-pointer bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <svg className="w-8 h-8 mb-4 text-gray-500 dark:text-gray-400" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 20 16"><path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 13h3a3 3 0 0 0 0-6h-.025A5.56 5.56 0 0 0 16 6.5 5.5 5.5 0 0 0 5.207 5.021C5.137 5.017 5.071 5 5 5a4 4 0 0 0 0 8h2.167M10 15V6m0 0L8 8m2-2 2 2"/></svg>
                    <p className="mb-2 text-sm text-gray-500 dark:text-gray-400"><span className="font-semibold">Haz clic para subir</span> o arrastra</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">PNG, JPG</p>
                </div>
                <input id="dropzone-file" type="file" className="hidden" onChange={handleFileChange} accept="image/png, image/jpeg" />
            </label>
            </div>
            <div className="relative flex py-2 items-center"><div className="flex-grow border-t border-gray-300 dark:border-gray-600"></div><span className="flex-shrink mx-4 text-gray-400 dark:text-gray-500 text-sm font-semibold">O</span><div className="flex-grow border-t border-gray-300 dark:border-gray-600"></div></div>
            <button onClick={handleOpenCamera} className="w-full bg-gray-700 text-white font-bold py-3 px-6 rounded-lg hover:bg-gray-800 dark:bg-indigo-600 dark:hover:bg-indigo-700 transition-colors duration-300 shadow-md flex items-center justify-center space-x-2">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                <span>Usar Cámara</span>
            </button>
        </div>
      ) : (
        <div>
            {preview && <div className="mb-6"><p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Vista Previa:</p><img src={preview} alt="Vista Previa" className="max-h-80 w-auto mx-auto rounded-lg shadow-md" /></div>}
            {isLoading && <Spinner />}
            {error && <p className="text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/50 p-3 rounded-lg mt-4 text-center">{error}</p>}
            
            {!isLoading && scannedData && (
                <div className="mt-6">
                <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-4">Datos Detectados por la IA:</h3>
                <div className="space-y-4 mb-6">
                    {renderScannedData()}
                </div>

                {analysisSourceLabel && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 text-right mb-4">Origen del análisis: {analysisSourceLabel}</p>
                )}

                {locations.length > 0 ? (
                     <div className="mb-6">
                        <label htmlFor="location" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Seleccionar Almacén (Obligatorio)</label>
                        <select
                        id="location"
                        value={selectedLocationId}
                        onChange={e => setSelectedLocationId(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                        >
                        {locations.map(loc => (
                            <option key={loc.id} value={loc.id}>{loc.name}</option>
                        ))}
                        </select>
                    </div>
                ) : (
                  <div className="mb-6 p-4 bg-yellow-100 dark:bg-yellow-900/50 border-l-4 border-yellow-500 text-yellow-800 dark:text-yellow-200 rounded-r-lg">
                    <p className="font-bold">Acción Requerida</p>
                    <p className="text-sm">No hay almacenes configurados. Debes crear al menos uno en 'Config.' para poder registrar este movimiento.</p>
                  </div>
                )}

                <button onClick={handleConfirm} disabled={isConfirming || locations.length === 0} className="w-full bg-green-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-green-700 transition-colors duration-300 shadow-md flex items-center justify-center disabled:bg-green-400 dark:disabled:bg-green-800">
                  {isConfirming ? <Spinner /> : 'Confirmar y Registrar'}
                </button>
                </div>
            )}
            
            {!isLoading && file && (
                <button onClick={resetState} className="w-full mt-4 bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-200 font-bold py-3 px-6 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors duration-300">
                    Escanear Otro Documento
                </button>
            )}
        </div>
      )}
    </div>
  );
};

export default ScanDocument;