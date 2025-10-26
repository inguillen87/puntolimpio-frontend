import React, { useState, useMemo } from 'react';
import { Location, User, UserOrInvitation, UserRole, Partner, PartnerType } from '../types';
import EditableCell from './EditableCell';
import Spinner from './Spinner';
import UserManagement from './UserManagement';

interface SettingsProps {
  locations: Location[];
  onAddLocation: (name: string) => Promise<void>;
  onUpdateLocation: (locationId: string, updatedFields: Partial<Location>) => Promise<void>;
  onDeleteLocation: (locationId: string) => void;
  partners: Partner[];
  onAddPartner: (partnerData: Omit<Partner, 'id'|'organizationId'>) => Promise<void>;
  onUpdatePartner: (partnerId: string, updatedFields: Partial<Partner>) => Promise<void>;
  onDeletePartner: (partnerId: string) => void;
  currentUser: User;
  users: UserOrInvitation[];
  onUpdateUser: (userId: string, updatedFields: Partial<User>) => Promise<void>;
  onDeleteUser: (userId: string) => void;
  onCancelInvitation: (invitationId: string) => void;
  onInviteUser: (email: string, role: UserRole) => Promise<void>;
}

const PartnerManagement: React.FC<{
    partners: Partner[];
    onAddPartner: (partnerData: Omit<Partner, 'id'|'organizationId'>) => Promise<void>;
    onUpdatePartner: (partnerId: string, updatedFields: Partial<Partner>) => Promise<void>;
    onDeletePartner: (partnerId: string) => void;
}> = ({ partners, onAddPartner, onUpdatePartner, onDeletePartner }) => {
    const [partnerType, setPartnerType] = useState<PartnerType>(PartnerType.CUSTOMER);
    const [newName, setNewName] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    
    const filteredPartners = useMemo(() => {
        return partners.filter(p => partnerType === PartnerType.CUSTOMER ? p.isCustomer : p.isSupplier);
    }, [partners, partnerType]);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newName.trim() || isSubmitting) return;
        setIsSubmitting(true);
        try {
            await onAddPartner({ 
                name: newName, 
                isCustomer: partnerType === PartnerType.CUSTOMER,
                isSupplier: partnerType === PartnerType.SUPPLIER
            });
            setNewName('');
        } catch (error) {
            console.error("Failed to add partner:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
      <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-2xl shadow-lg">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-4">Gestión de Socios Logísticos</h2>
        
        <div className="border-b border-gray-200 dark:border-gray-700 mb-4">
            <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                <button onClick={() => setPartnerType(PartnerType.CUSTOMER)} className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${partnerType === PartnerType.CUSTOMER ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>Clientes</button>
                <button onClick={() => setPartnerType(PartnerType.SUPPLIER)} className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${partnerType === PartnerType.SUPPLIER ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`}>Proveedores</button>
            </nav>
        </div>

        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row items-start gap-4 mb-8">
             <div className="w-full">
                <label htmlFor="newPartnerName" className="sr-only">Nombre</label>
                <input id="newPartnerName" type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={`Nombre del nuevo ${partnerType === 'CUSTOMER' ? 'cliente' : 'proveedor'}`} className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 rounded-lg focus:ring-2 focus:ring-blue-500"/>
            </div>
            <button type="submit" disabled={isSubmitting || !newName.trim()} className="w-full sm:w-auto flex justify-center items-center px-6 py-2 border border-transparent font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400">
                {isSubmitting ? <Spinner /> : `Agregar ${partnerType === 'CUSTOMER' ? 'Cliente' : 'Proveedor'}`}
            </button>
        </form>
         <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-700/50">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Nombre</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Rol Adicional</th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Acciones</th>
                    </tr>
                </thead>
                 <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredPartners.length > 0 ? filteredPartners.map(p => (
                        <tr key={p.id}>
                            <td className="px-6 py-4 text-sm font-medium"><EditableCell value={p.name} onSave={(val) => onUpdatePartner(p.id, { name: val as string })} /></td>
                            <td className="px-6 py-4 text-sm">
                                {partnerType === PartnerType.CUSTOMER && p.isSupplier && (
                                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                                        Proveedor
                                    </span>
                                )}
                                {partnerType === PartnerType.SUPPLIER && p.isCustomer && (
                                    <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200">
                                        Cliente
                                    </span>
                                )}
                            </td>
                            <td className="px-6 py-4 text-right text-sm"><button onClick={() => onDeletePartner(p.id)} className="text-red-600 hover:text-red-900 dark:text-red-400">Eliminar</button></td>
                        </tr>
                    )) : <tr><td colSpan={3} className="text-center py-4 text-gray-500 dark:text-gray-400">No hay {partnerType === 'CUSTOMER' ? 'clientes' : 'proveedores'} registrados.</td></tr>}
                 </tbody>
            </table>
        </div>
      </div>
    );
};


const Settings: React.FC<SettingsProps> = ({ 
    locations, onAddLocation, onUpdateLocation, onDeleteLocation,
    partners, onAddPartner, onUpdatePartner, onDeletePartner,
    currentUser, users, onUpdateUser, onDeleteUser, onCancelInvitation, onInviteUser
}) => {
  const [newLocationName, setNewLocationName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLocationName.trim() || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    try {
      await onAddLocation(newLocationName.trim());
      setNewLocationName('');
    } catch (err) {
      setError('No se pudo crear el almacén. Inténtalo de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const canManageOrg = currentUser?.role === UserRole.ORG_ADMIN;

  return (
    <div className="space-y-8">
        <UserManagement 
            currentUser={currentUser} 
            users={users} 
            onUpdateUser={onUpdateUser} 
            onDeleteUser={onDeleteUser}
            onCancelInvitation={onCancelInvitation}
            onInviteUser={onInviteUser}
        />
        
      {canManageOrg && (
        <>
            <PartnerManagement 
                partners={partners}
                onAddPartner={onAddPartner}
                onUpdatePartner={onUpdatePartner}
                onDeletePartner={onDeletePartner}
            />

            <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-2xl shadow-lg">
              <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-6">Configuración de Almacenes</h2>
              
              <form onSubmit={handleAddLocation} className="flex flex-col sm:flex-row items-start gap-4 mb-8">
                <div className="w-full">
                  <label htmlFor="newLocationName" className="sr-only">Nombre del nuevo almacén</label>
                  <input
                    id="newLocationName"
                    type="text"
                    value={newLocationName}
                    onChange={(e) => setNewLocationName(e.target.value)}
                    placeholder="Nombre del nuevo almacén"
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isSubmitting || !newLocationName.trim()}
                  className="w-full sm:w-auto flex justify-center items-center px-6 py-2 border border-transparent text-base font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 dark:disabled:bg-blue-800"
                >
                  {isSubmitting ? <Spinner /> : 'Agregar Almacén'}
                </button>
              </form>
              {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
              
              <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-300 mb-4">Almacenes Existentes</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-700/50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Nombre del Almacén</th>
                      <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {locations.length > 0 ? locations.map(location => (
                      <tr key={location.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                          <EditableCell
                            value={location.name}
                            onSave={(newValue) => onUpdateLocation(location.id, { name: newValue as string })}
                            ariaLabel={`Editar nombre de ${location.name}`}
                          />
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button onClick={() => onDeleteLocation(location.id)} className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300">
                            Eliminar
                          </button>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={2} className="text-center py-4 text-gray-500 dark:text-gray-400">
                          No hay almacenes configurados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
        </>
      )}
    </div>
  );
};

export default Settings;