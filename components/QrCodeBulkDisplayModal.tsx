import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Item } from '../types';

interface QrCodeBulkDisplayModalProps {
  items: Item[];
  onClose: () => void;
}

const QrCodeBulkDisplayModal: React.FC<QrCodeBulkDisplayModalProps> = ({ items, onClose }) => {
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const [errorItems, setErrorItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Ensure the refs array is the correct size
    canvasRefs.current = canvasRefs.current.slice(0, items.length);

    items.forEach((item, index) => {
      const canvas = canvasRefs.current[index];
      if (canvas) {
        QRCode.toCanvas(canvas, item.id, { width: 180, errorCorrectionLevel: 'H' }, function (error: any) {
          if (error) {
              console.error(`Failed to generate QR for item ${item.id}:`, error);
              setErrorItems(prev => new Set(prev).add(item.id));
          }
        });
      }
    });
  }, [items]);

  const handlePrint = () => {
    let printContent = `
        <!DOCTYPE html>
        <html>
            <head>
                <title>Imprimir Códigos QR de Nuevos Artículos</title>
                <style>
                    @media print {
                        body { -webkit-print-color-adjust: exact; }
                        .no-print { display: none; }
                    }
                    body { font-family: sans-serif; }
                    .qr-container { 
                        display: inline-flex; 
                        flex-direction: column;
                        align-items: center; 
                        text-align: center; 
                        margin: 15px; 
                        padding: 10px;
                        border: 1px solid #ccc;
                        border-radius: 8px;
                        page-break-inside: avoid;
                        width: 220px;
                    }
                    h3 { margin: 0 0 10px 0; font-size: 16px; word-break: break-word; }
                    p { font-family: monospace; font-size: 10px; color: #555; margin: 5px 0 0 0;}
                    img { width: 180px; height: 180px; }
                </style>
            </head>
            <body>
                <h1 class="no-print" style="text-align: center;">Vista Previa de Impresión</h1>
                <div style="text-align: center; padding: 20px;">
    `;

    items.forEach((item, index) => {
      const canvas = canvasRefs.current[index];
      if (canvas && !errorItems.has(item.id)) {
        const dataUrl = canvas.toDataURL("image/png");
        printContent += `
            <div class="qr-container">
                <h3>${item.name}</h3>
                <img src="${dataUrl}" />
                <p>ID: ${item.id}</p>
            </div>
        `;
      }
    });

    printContent += `
                </div>
                <script>
                    window.onload = function() {
                        window.print();
                        window.onafterprint = function() {
                           window.close();
                        }
                    }
                </script>
            </body>
        </html>
    `;

    const printWin = window.open('', '', 'width=800,height=600');
    printWin?.document.open();
    printWin?.document.write(printContent);
    printWin?.document.close();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl p-6 md:p-8 m-4 max-w-4xl w-full flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white">Nuevos Artículos Creados</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">Se detectaron y crearon estos nuevos artículos en el inventario. Imprime sus códigos QR para etiquetarlos.</p>
        
        <div className="flex-1 overflow-y-auto pr-4 -mr-4">
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {items.map((item, index) => (
                <div key={item.id} className="bg-gray-50 dark:bg-gray-700/50 p-4 rounded-lg text-center flex flex-col items-center">
                    <h4 className="text-lg font-semibold text-blue-600 dark:text-blue-400 mb-2 truncate w-full" title={item.name}>{item.name}</h4>
                    {errorItems.has(item.id) ? (
                         <div className="h-[180px] w-[180px] mx-auto flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-lg text-center">
                            <p className="text-red-500 dark:text-red-400 text-xs font-semibold p-2">
                                Error al generar QR.
                            </p>
                        </div>
                    ) : (
                        <canvas ref={el => { canvasRefs.current[index] = el; }} className="border dark:border-gray-600 rounded-lg"></canvas>
                    )}
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 font-mono break-all">{item.id}</p>
                </div>
                ))}
            </div>
        </div>
       
        <div className="mt-8 flex flex-col sm:flex-row gap-4 pt-6 border-t border-gray-200 dark:border-gray-700">
          <button onClick={handlePrint} disabled={items.length === 0} className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-400">Imprimir Todo</button>
          <button onClick={onClose} className="w-full bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-gray-200 font-bold py-3 px-4 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors">Cerrar</button>
        </div>
      </div>
    </div>
  );
};

export default QrCodeBulkDisplayModal;
