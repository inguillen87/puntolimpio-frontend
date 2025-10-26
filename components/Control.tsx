import React, { useState, useMemo, useEffect } from 'react';
import { ControlRecord } from '../types';
import EditableCell from './EditableCell';

interface ControlProps {
  controlRecords: ControlRecord[];
  isLoading: boolean;
  onDeleteRecord: (recordId: string) => void;
  onDeleteSelected: (recordIds: string[]) => void;
  onUpdateRecord: (recordId: string, updatedFields: Partial<ControlRecord>) => Promise<void>;
}

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


const Control: React.FC<ControlProps> = ({ controlRecords, isLoading, onDeleteRecord, onDeleteSelected, onUpdateRecord }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalImageSrc, setModalImageSrc] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const sortedRecords = useMemo(() => {
    return [...controlRecords].sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  }, [controlRecords]);
  
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
      setSelected(new Set(sortedRecords.map(r => r.id)));
    } else {
      setSelected(new Set());
    }
  };
  
  const handleDeleteSelected = () => {
    onDeleteSelected(Array.from(selected));
    setSelected(new Set());
  };


  return (
    <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-2xl shadow-lg">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Control y Fiscalización</h2>
        {selected.size > 0 && (
            <button onClick={handleDeleteSelected} className="bg-red-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-red-700 transition-colors flex-shrink-0">
                Eliminar ({selected.size})
            </button>
        )}
      </div>
      
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700/50">
            <tr>
              <th scope="col" className="p-4"><input type="checkbox" onChange={handleSelectAll} checked={sortedRecords.length > 0 && selected.size === sortedRecords.length} className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"/></th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Documento</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Fecha Entrega</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Destino</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Detalle</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Kits</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {isLoading ? (
                 <tr><td colSpan={7} className="text-center py-4 text-gray-500 dark:text-gray-400">Cargando registros...</td></tr>
            ) : sortedRecords.length > 0 ? (
              sortedRecords.map(record => {
                return (
                    <tr key={record.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-800 dark:text-gray-100">
                    <td className="p-4"><input type="checkbox" checked={selected.has(record.id)} onChange={() => handleSelect(record.id)} className="h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"/></td>
                    <td className="px-6 py-4">
                        <DocumentImage
                          // FIX: Removed non-existent 'documentData' property
                          src={record.documentImageUrl}
                          alt="Planilla de control"
                          // FIX: Removed non-existent 'documentData' property
                          onClick={() => handleViewDocument(record.documentImageUrl)}
                        />
                    </td>
                    <td className="px-6 py-4 font-medium">
                      <EditableCell 
                        value={record.deliveryDate}
                        onSave={(newValue) => onUpdateRecord(record.id, { deliveryDate: newValue as string })}
                        ariaLabel="Editar fecha de entrega"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <EditableCell 
                        value={record.destination}
                        onSave={(newValue) => onUpdateRecord(record.id, { destination: newValue as string })}
                        ariaLabel="Editar destino"
                      />
                    </td>
                    <td className="px-6 py-4">
                      <EditableCell 
                        value={record.models}
                        onSave={(newValue) => onUpdateRecord(record.id, { models: newValue as string })}
                        ariaLabel="Editar modelo"
                      />
                    </td>
                    <td className="px-6 py-4 font-bold">
                       <EditableCell 
                        value={record.quantity}
                        onSave={(newValue) => onUpdateRecord(record.id, { quantity: Number(newValue) })}
                        type="number"
                        ariaLabel="Editar cantidad de kits"
                      />
                    </td>
                    <td className="px-6 py-4 text-center">
                        <button onClick={() => onDeleteRecord(record.id)} className="text-gray-400 hover:text-red-600 dark:hover:text-red-500 p-1 rounded-full transition-colors">
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" /></svg>
                        </button>
                    </td>
                    </tr>
                )
              })
            ) : (
              <tr><td colSpan={7} className="text-center py-4 text-gray-500 dark:text-gray-400">No hay planillas de control registradas.</td></tr>
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

export default Control;
