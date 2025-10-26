import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Item } from '../types';

interface QrDisplayModalProps {
  item: Item;
  onClose: () => void;
}

const QrDisplayModal: React.FC<QrDisplayModalProps> = ({ item, onClose }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (canvasRef.current && item) {
      QRCode.toCanvas(canvasRef.current, item.id, { width: 256, errorCorrectionLevel: 'H' }, function (err: any) {
        if (err) {
            console.error(err);
            setError("Error al generar el código QR.");
        }
      });
    }
  }, [item]);

  const handlePrint = () => {
    const canvas = canvasRef.current;
    if (!canvas || error) return;
    const dataUrl = canvas.toDataURL("image/png");
    const windowContent = `
        <!DOCTYPE html>
        <html>
            <head><title>Imprimir QR</title></head>
            <body style="text-align: center; margin-top: 50px;">
                <h2>${item.name} (${item.type})</h2>
                <img src="${dataUrl}" style="width: 300px; height: 300px;" />
                <p style="font-family: monospace; margin-top: 10px;">ID: ${item.id}</p>
                <script>
                    window.onload = function() {
                        window.print();
                        window.onafterprint = function() {
                           window.close();
                        }
                    }
                </script>
            </body>
        </html>`;
    const printWin = window.open('', '', 'width=400,height=450');
    printWin?.document.open();
    printWin?.document.write(windowContent);
    printWin?.document.close();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl p-6 md:p-8 m-4 max-w-sm w-full text-center" onClick={e => e.stopPropagation()}>
        <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Código QR para:</h3>
        <p className="text-2xl font-semibold text-blue-600 dark:text-blue-400 mb-4">{item.name}</p>
        
        {error ? (
          <div className="h-[256px] w-[256px] mx-auto flex items-center justify-center bg-gray-100 dark:bg-gray-700 rounded-lg text-center">
            <p className="text-red-500 dark:text-red-400 text-sm font-semibold p-4">
              {error}
            </p>
          </div>
        ) : (
          <canvas ref={canvasRef} className="mx-auto border dark:border-gray-600 rounded-lg"></canvas>
        )}
        
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 font-mono">{item.id}</p>
        <div className="mt-6 flex flex-col sm:flex-row gap-4">
          <button onClick={handlePrint} disabled={!!error} className="w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors disabled:bg-blue-400">Imprimir</button>
          <button onClick={onClose} className="w-full bg-gray-200 text-gray-800 dark:bg-gray-600 dark:text-gray-200 font-bold py-3 px-4 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors">Cerrar</button>
        </div>
      </div>
    </div>
  );
};

export default QrDisplayModal;