import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Item, Transaction, TransactionType, ScannedItem, ControlRecord, DocumentType, ScannedControlSheetData, ScannedTransactionData, ItemType, Location, Organization, AnalyticsData, User, UserRole, UserOrInvitation, Partner, PartnerType } from './types';
import Dashboard from './components/Dashboard';
import ScanDocument from './components/ScanDocument';
import ManualEntry from './components/ManualEntry';
import WarehouseLog from './components/WarehouseLog';
import Analytics from './components/Analytics';
import Control from './components/Control';
import Settings from './components/Settings';
import SuperAdminDashboard from './components/SuperAdminDashboard';
import Login from './components/Login';
import Register from './components/Register';
import QrScanner from './components/QrScanner';
import AiAssistant from './components/AiAssistant';
import QrCodeBulkDisplayModal from './components/QrCodeBulkDisplayModal';
import { isFirebaseConfigured } from './firebaseConfig';
import * as db from './services/databaseService';
import * as mockDb from './services/mockDatabaseService';
import * as authService from './services/authService';
import { generateInventoryReport, generateAnalyticsReport } from './services/pdfService';
import Spinner from './components/Spinner';

const databaseService = isFirebaseConfigured ? db : mockDb;

type Tab = 'dashboard' | 'scan' | 'qrscan' | 'manual' | 'warehouse' | 'analytics' | 'control' | 'settings' | 'superadmin';
type Theme = 'light' | 'dark';
type AuthView = 'login' | 'register';

const TABS: { id: Tab; label: string; roles: UserRole[] }[] = [
    { id: 'superadmin', label: 'Plataforma', roles: [UserRole.SUPER_ADMIN] },
    { id: 'scan', label: 'Escanear Doc', roles: [UserRole.ORG_ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.OPERATOR] },
    { id: 'qrscan', label: 'Escanear QR', roles: [UserRole.ORG_ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.OPERATOR] },
    { id: 'dashboard', label: 'Panel', roles: [UserRole.ORG_ADMIN, UserRole.WAREHOUSE_MANAGER] },
    { id: 'control', label: 'Control', roles: [UserRole.ORG_ADMIN, UserRole.WAREHOUSE_MANAGER] },
    { id: 'warehouse', label: 'Almacén', roles: [UserRole.ORG_ADMIN, UserRole.WAREHOUSE_MANAGER] },
    { id: 'analytics', label: 'Métricas', roles: [UserRole.ORG_ADMIN] },
    { id: 'manual', label: 'Manual', roles: [UserRole.ORG_ADMIN, UserRole.WAREHOUSE_MANAGER, UserRole.OPERATOR] },
    { id: 'settings', label: 'Config.', roles: [UserRole.ORG_ADMIN, UserRole.SUPER_ADMIN] },
];

interface BeforeInstallPromptEvent extends Event {
    readonly platforms: string[];
    readonly userChoice: Promise<{
        outcome: 'accepted' | 'dismissed';
        platform: string;
    }>;
    prompt(): Promise<void>;
}

const LocationFilter: React.FC<{
    locations: Location[];
    selectedLocation: string;
    onLocationChange: (locationId: string) => void;
    className?: string;
}> = ({ locations, selectedLocation, onLocationChange, className }) => {
    if (locations.length <= 1) return null;
    return (
        <div className={`flex items-center space-x-2 ${className}`}>
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500 dark:text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
            </svg>
            <select
                value={selectedLocation}
                onChange={(e) => onLocationChange(e.target.value)}
                className="w-full sm:w-auto px-3 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm font-medium"
            >
                <option value="ALL">Todos los Almacenes</option>
                {locations.map(loc => (
                    <option key={loc.id} value={loc.id}>{loc.name}</option>
                ))}
            </select>
        </div>
    );
};

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authView, setAuthView] = useState<AuthView>('login');
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [usersInOrg, setUsersInOrg] = useState<UserOrInvitation[]>([]);
  const [activeTab, setActiveTab] = useState<Tab | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [controlRecords, setControlRecords] = useState<ControlRecord[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<string>('ALL');
  const [notification, setNotification] = useState<React.ReactNode | null>(null);
  const [isNotificationError, setIsNotificationError] = useState(false);
  const [theme, setTheme] = useState<Theme>('light');
  const [isLoading, setIsLoading] = useState(true);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [confirmation, setConfirmation] = useState<{ message: string; onConfirm: () => void; } | null>(null);
  const [viewingAsOrgId, setViewingAsOrgId] = useState<string | null>(null);
  const [itemsForQrModal, setItemsForQrModal] = useState<Item[] | null>(null);

  const showNotification = (message: React.ReactNode, isError: boolean = false) => {
    setNotification(message);
    setIsNotificationError(isError);
    setTimeout(() => {
      setNotification(null);
      setIsNotificationError(false);
    }, 8000); // Increased timeout for potentially longer messages
  }

  const loadOrganizationData = useCallback(async (organizationId: string) => {
    setIsLoading(true);
    try {
      const [orgDetails, loadedItems, loadedTransactions, loadedControlRecords, loadedLocations, loadedUsers, dbPartners] = await Promise.all([
        databaseService.getOrganization(organizationId),
        databaseService.getItems(organizationId),
        databaseService.getTransactions(organizationId),
        databaseService.getControlRecords(organizationId),
        databaseService.getLocations(organizationId),
        databaseService.getUsersByOrganization(organizationId),
        databaseService.getPartners(organizationId)
      ]);

      // Retroactively build partner list from all transactions to ensure complete data
      const partnerMap = new Map<string, Partner>();
      dbPartners.forEach(p => partnerMap.set(p.name.toLowerCase(), p));

      loadedTransactions.forEach(tx => {
        if (tx.destination && !tx.partnerId) {
          const cleanName = tx.destination.trim();
          const lowerCaseName = cleanName.toLowerCase();
          
          if (cleanName) {
            const existingPartner = partnerMap.get(lowerCaseName);
            if (!existingPartner) {
               partnerMap.set(lowerCaseName, {
                id: `implicit-${cleanName.replace(/\s+/g, '-')}`,
                organizationId: organizationId,
                name: cleanName,
                isCustomer: tx.type === TransactionType.OUTCOME,
                isSupplier: tx.type === TransactionType.INCOME,
              });
            } else {
              // Update existing partner roles if a transaction reveals a new role
              if (tx.type === TransactionType.OUTCOME && !existingPartner.isCustomer) {
                  existingPartner.isCustomer = true;
              }
              if (tx.type === TransactionType.INCOME && !existingPartner.isSupplier) {
                  existingPartner.isSupplier = true;
              }
            }
          }
        }
      });
      const combinedPartners = Array.from(partnerMap.values());

      setOrganization(orgDetails);
      setItems(loadedItems);
      setTransactions(loadedTransactions);
      setControlRecords(loadedControlRecords);
      setLocations(loadedLocations);
      setUsersInOrg(loadedUsers);
      setPartners(combinedPartners); // Use combined and enriched list
      if (loadedLocations.length > 0) {
        setSelectedLocation(loadedLocations[0].id);
      } else {
        setSelectedLocation('ALL');
      }
    } catch (error: any) {
      console.error("Failed to load data for org:", error.message);
      showNotification(`Error al cargar datos: ${error.message}.`, true);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);
  
   useEffect(() => {
    if (!isFirebaseConfigured) {
        setAuthChecked(true);
        setIsLoading(false);
        return;
    }
    
    const unsubscribe = authService.onAuthStateChangeObserver(async (firebaseUser) => {
        if (firebaseUser && firebaseUser.email) {
            try {
                let profileResult: { user: User; isNew: boolean } | null = null;
                // Retry mechanism to handle Firestore replication delay
                for (let i = 0; i < 5; i++) { 
                    profileResult = await databaseService.getOrCreateUserProfile(firebaseUser.uid, firebaseUser.email);
                    if (profileResult) break;
                    await new Promise(res => setTimeout(res, 1000));
                }
                
                if (profileResult) {
                    setCurrentUser(profileResult.user);
                    if (!viewingAsOrgId) {
                       await loadOrganizationData(profileResult.user.organizationId);
                    }
                } else {
                    showNotification('Error: Perfil no encontrado y no existe una invitación.', true);
                    authService.logout();
                }
            } catch (error: any) {
                console.error("Error fetching or creating user profile:", error);
                showNotification(`Error al cargar el perfil de usuario: ${error.message}`, true);
                authService.logout();
            }
        } else {
            setCurrentUser(null);
            setOrganization(null);
            setPartners([]);
            setViewingAsOrgId(null);
            setIsLoading(false);
        }
        setAuthChecked(true);
    });

    return () => unsubscribe();
  }, [loadOrganizationData, viewingAsOrgId]);

  useEffect(() => {
    const handler = (e: Event) => {
        e.preventDefault();
        setInstallPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as Theme | null;
    const userPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const initialTheme = savedTheme || (userPrefersDark ? 'dark' : 'light');
    setTheme(initialTheme);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', theme);
  }, [theme]);

  const filteredData = useMemo(() => {
    if (selectedLocation === 'ALL') {
        return { visibleTransactions: transactions, visibleControlRecords: controlRecords };
    }
    const visibleTransactions = transactions.filter(t => t.locationId === selectedLocation);
    const visibleControlRecords = controlRecords.filter(c => c.locationId === selectedLocation);
    return { visibleTransactions, visibleControlRecords };
  }, [transactions, controlRecords, selectedLocation]);

  const toggleTheme = () => {
    setTheme(prevTheme => (prevTheme === 'light' ? 'dark' : 'light'));
  };

  const handleInstallClick = async () => {
    setIsMenuOpen(false);
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    if (isIOS && !('standalone' in window.navigator && (window.navigator as any).standalone)) {
        showNotification('Para instalar: Toca el ícono de Compartir y luego "Agregar a inicio".', false);
        return;
    }
    if (!installPrompt) {
        showNotification('La app ya está instalada o el navegador no es compatible.', true);
        return;
    }
    installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    showNotification(outcome === 'accepted' ? '¡App instalada! Búscala en tu pantalla de inicio.' : 'Instalación cancelada.', false);
    setInstallPrompt(null);
  };
  
  const handleLogout = async () => {
    await authService.logout();
  };
  
  const createScopedHandler = (handler: (orgId: string, ...args: any[]) => any) => (...args: any[]) => {
    const orgId = viewingAsOrgId || currentUser?.organizationId;
    if (!orgId) {
        const message = "Operación fallida: no hay una organización seleccionada.";
        showNotification(message, true);
        return Promise.reject(new Error(message));
    }
    return Promise.resolve(handler(orgId, ...args));
  };
  
  const handleAddPartner = createScopedHandler(async (orgId, partnerData: Omit<Partner, 'id'|'organizationId'>) => {
    const newPartner = await databaseService.addPartner(orgId, partnerData);
    setPartners(prev => [...prev, newPartner]);
    showNotification('Socio logístico creado exitosamente.');
    return newPartner;
  });

  const handleUpdatePartner = createScopedHandler(async (orgId, partnerId, updatedFields) => {
    await databaseService.updatePartner(orgId, partnerId, updatedFields);
    setPartners(prev => prev.map(p => p.id === partnerId ? { ...p, ...updatedFields } : p));
    showNotification('Socio logístico actualizado.');
  });
  
  const handleConfirmUpload = useCallback(async (scannedData: ScannedTransactionData | ScannedControlSheetData[], type: DocumentType, documentFile?: File, locationId?: string, partnerIdFromManual?: string, newPartnerName?: string) => {
    const orgId = viewingAsOrgId || currentUser?.organizationId;
    if (!orgId) {
        throw new Error("No hay una organización seleccionada.");
    }

    let documentUrl = '';
    if (documentFile) {
        try {
            const fileName = `${orgId}/documents/${Date.now()}-${documentFile.name}`;
            documentUrl = await databaseService.uploadFile(documentFile, fileName);
        } catch (error: any) {
             showNotification(`Falló la subida del archivo: ${error.code || error.message}`, true);
             throw error;
        }
    }

    if (type === DocumentType.CONTROL) {
        if (!documentUrl) throw new Error("Las planillas de control requieren una imagen.");

        const scannedSheets = scannedData as ScannedControlSheetData[];
        const newRecords = scannedSheets.map(sheet => ({
            id: `cr-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            documentImageUrl: documentUrl,
            deliveryDate: sheet.deliveryDate,
            destination: sheet.destination,
            models: sheet.model,
            quantity: sheet.quantity,
            uploadedAt: new Date().toISOString(),
            locationId: locationId,
        }));

        const newTransactionsToSave: Omit<Transaction, 'id' | 'organizationId'>[] = [];
        const notFoundItems: string[] = [];
        let newPartners: Partner[] = []; 

        for (const sheet of scannedSheets) {
            let partnerId: string | undefined = undefined;
            if (sheet.destination) {
                const cleanPartnerName = sheet.destination.trim();
                const allPartners = [...partners, ...newPartners];
                const existingPartner = allPartners.find(p => p.name.toLowerCase() === cleanPartnerName.toLowerCase());

                if (existingPartner) {
                    partnerId = existingPartner.id;
                    if (!existingPartner.isCustomer) {
                        await handleUpdatePartner(existingPartner.id, { isCustomer: true });
                    }
                } else {
                    const partnerData = { name: cleanPartnerName, isCustomer: true, isSupplier: false };
                    const newPartner = await handleAddPartner(partnerData);
                    newPartners.push(newPartner);
                    partnerId = newPartner.id;
                }
            }
            
            const item = items.find(i => i.name.trim().toLowerCase() === sheet.model.trim().toLowerCase());

            if (item) {
                const newTransactionData: Omit<Transaction, 'id' | 'organizationId'> = {
                    itemId: item.id,
                    quantity: sheet.quantity,
                    type: TransactionType.OUTCOME,
                    documentName: `Planilla de Control: ${documentFile?.name || 'Registro'}`,
                    createdAt: new Date().toISOString(),
                    locationId: locationId,
                    imageUrl: documentUrl,
                    partnerId: partnerId,
                    destination: partnerId ? undefined : sheet.destination,
                };
                newTransactionsToSave.push(newTransactionData);
            } else {
                notFoundItems.push(sheet.model);
            }
        }

        await databaseService.addControlRecordsAndTransactions(orgId, newRecords, newTransactionsToSave);

        setControlRecords(prev => [...prev, ...newRecords.map(r => ({ ...r, organizationId: orgId }))]);
        const finalTransactions = newTransactionsToSave.map((tx, index) => ({
            ...tx,
            id: `tx-final-${Date.now()}-${index}`,
            organizationId: orgId
        }));
        setTransactions(prev => [...prev, ...finalTransactions]);
        
        let notificationMessage: React.ReactNode = (
            <div>
                <p>{newRecords.length} fila(s) de control procesada(s).</p>
                <p>{newTransactionsToSave.length} egreso(s) de stock registrado(s).</p>
            </div>
        );
        if (notFoundItems.length > 0) {
            notificationMessage = (
                <div>
                    {notificationMessage}
                    <p className="mt-2 font-bold text-yellow-300">Aviso: No se descontó stock para: {notFoundItems.join(', ')} (artículo no encontrado).</p>
                </div>
            )
        }
        showNotification(notificationMessage);
        setActiveTab('analytics'); // Go to analytics to see the changes
    } else {
        const { items: transactionItems, destination: destinationFromScan } = scannedData as ScannedTransactionData;
        const partnerName = newPartnerName || destinationFromScan;
        
        let partnerId: string | undefined = partnerIdFromManual;

        if (!partnerId && partnerName) {
            const cleanPartnerName = partnerName.trim();
            const existingPartner = partners.find(p => p.name.toLowerCase() === cleanPartnerName.toLowerCase());
            const isIncome = type === DocumentType.INCOME;

            if (existingPartner) {
                partnerId = existingPartner.id;
                const needsUpdate = (isIncome && !existingPartner.isSupplier) || (!isIncome && !existingPartner.isCustomer);
                if (needsUpdate) {
                    const updatedFields = isIncome ? { isSupplier: true } : { isCustomer: true };
                    await handleUpdatePartner(existingPartner.id, updatedFields);
                }
            } else {
                const partnerData = {
                    name: cleanPartnerName,
                    isSupplier: isIncome,
                    isCustomer: !isIncome,
                };
                const newPartner = await handleAddPartner(partnerData);
                partnerId = newPartner.id;
                showNotification(`Nuevo socio logístico "${cleanPartnerName}" creado.`, false);
            }
        }

        const newItemsToSave: Item[] = [];
        const newTransactionsToSave: Omit<Transaction, 'id' | 'organizationId'>[] = [];
        const currentItemsLookup = [...items];
        
        for (const scannedItem of transactionItems) {
            let item = currentItemsLookup.find(i => i.name.toLowerCase() === scannedItem.itemName.toLowerCase());
            if (!item) {
                const newItemData: Item = {
                    id: `item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    organizationId: orgId,
                    name: scannedItem.itemName,
                    type: scannedItem.itemType,
                    cost: scannedItem.cost,
                    size: scannedItem.size,
                    weight: scannedItem.weight,
                };
                newItemsToSave.push(newItemData);
                item = newItemData;
                currentItemsLookup.push(item);
            }

            const newTransactionData: Omit<Transaction, 'id' | 'organizationId'> = {
                itemId: item.id,
                quantity: scannedItem.quantity,
                type: type as unknown as TransactionType,
                documentName: documentFile?.name || 'Registro Manual',
                createdAt: new Date().toISOString(),
                locationId: locationId,
                imageUrl: documentUrl || undefined,
                partnerId: partnerId,
                destination: partnerId ? undefined : partnerName || undefined,
            };
            newTransactionsToSave.push(newTransactionData);
        }

        await databaseService.addItemsAndTransactions(orgId, newItemsToSave, newTransactionsToSave);
        setItems(prev => [...prev, ...newItemsToSave]);
        const finalTransactions = newTransactionsToSave.map((tx, index) => ({
            ...tx,
            id: `tx-final-${Date.now()}-${index}`,
            organizationId: orgId
        }));
        setTransactions(prev => [...prev, ...finalTransactions]);
        showNotification(`${transactionItems.length} artículo(s) procesado(s) como ${type === 'INCOME' ? 'Ingreso' : 'Egreso'}.`);
        setActiveTab('dashboard');

        if (newItemsToSave.length > 0) {
            setItemsForQrModal(newItemsToSave);
        }
    }
}, [items, partners, currentUser, viewingAsOrgId, handleAddPartner, handleUpdatePartner]);

  const handleConfirmManualTransaction = useCallback(async (transactionItems: ScannedItem[], type: TransactionType, documentFile?: File, locationId?: string, partnerId?: string, newPartnerName?: string) => {
    const scannedData: ScannedTransactionData = {
        items: transactionItems,
        destination: newPartnerName || null,
    };
    await handleConfirmUpload(scannedData, type as unknown as DocumentType, documentFile, locationId, partnerId, newPartnerName);
  }, [handleConfirmUpload]);
  
  const handleDeleteTransaction = createScopedHandler((orgId, transactionId) => {
    setConfirmation({
        message: '¿Estás seguro de que quieres eliminar esta transacción?',
        onConfirm: async () => {
            await databaseService.deleteTransaction(orgId, transactionId);
            setTransactions(prev => prev.filter(tx => tx.id !== transactionId));
            showNotification('Transacción eliminada.');
        }
    });
  });

  const handleDeleteSelectedTransactions = createScopedHandler((orgId, transactionIds) => {
    setConfirmation({
        message: `¿Estás seguro de que quieres eliminar ${transactionIds.length} transacciones?`,
        onConfirm: async () => {
            await databaseService.deleteTransactions(orgId, transactionIds);
            setTransactions(prev => prev.filter(tx => !transactionIds.includes(tx.id)));
            showNotification(`${transactionIds.length} transacciones eliminadas.`);
        }
    });
  });

  const handleDeleteControlRecord = createScopedHandler((orgId, recordId) => {
    setConfirmation({
        message: '¿Estás seguro de que quieres eliminar este registro?',
        onConfirm: async () => {
            await databaseService.deleteControlRecord(orgId, recordId);
            setControlRecords(prev => prev.filter(r => r.id !== recordId));
            showNotification('Registro de control eliminado.');
        }
    });
  });
  
  const handleDeleteSelectedControlRecords = createScopedHandler((orgId, recordIds) => {
    setConfirmation({
        message: `¿Estás seguro de que quieres eliminar ${recordIds.length} registros?`,
        onConfirm: async () => {
            await databaseService.deleteControlRecords(orgId, recordIds);
            setControlRecords(prev => prev.filter(r => !recordIds.includes(r.id)));
            showNotification(`${recordIds.length} registros eliminados.`);
        }
    });
  });

  const requestDeleteAllData = createScopedHandler((orgId) => {
    setConfirmation({
        message: 'CONFIRMACIÓN FINAL: Esta acción borrará permanentemente todo el inventario, transacciones y registros para la organización actual. ¿Continuar?',
        onConfirm: async () => {
            await databaseService.deleteAllData(orgId);
            setItems([]);
            setTransactions([]);
            setControlRecords([]);
            setLocations([]);
            setPartners([]);
            showNotification('Todos los datos de la organización han sido eliminados.');
        }
    });
  });
  
  const handleUpdateTransaction = createScopedHandler(async (orgId, transactionId, updatedFields) => {
    await databaseService.updateTransaction(orgId, transactionId, updatedFields);
    setTransactions(prev => prev.map(tx => tx.id === transactionId ? { ...tx, ...updatedFields } : tx));
    showNotification('Transacción actualizada.');
  });
  
  const handleUpdateControlRecord = createScopedHandler(async (orgId, recordId, updatedFields) => {
    await databaseService.updateControlRecord(orgId, recordId, updatedFields);
    setControlRecords(prev => prev.map(r => r.id === recordId ? { ...r, ...updatedFields } : r));
    showNotification('Registro de control actualizado.');
  });
  
  const handleUpdateItem = createScopedHandler(async (orgId, itemId, updatedFields) => {
    await databaseService.updateItem(orgId, itemId, updatedFields);
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, ...updatedFields } : i));
    showNotification('Artículo actualizado.');
  });

  const handleAddLocation = createScopedHandler(async (orgId, name) => {
    const newLocation = await databaseService.addLocation(orgId, { name });
    setLocations(prev => [...prev, newLocation]);
    showNotification('Almacén creado exitosamente.');
  });

  const handleUpdateLocation = createScopedHandler(async (orgId, locationId, updatedFields) => {
    await databaseService.updateLocation(orgId, locationId, updatedFields);
    setLocations(prev => prev.map(l => l.id === locationId ? { ...l, ...updatedFields } : l));
    showNotification('Almacén actualizado.');
  });
  
  const handleDeleteLocation = createScopedHandler((orgId, locationId) => {
    setConfirmation({
        message: '¿Estás seguro? Eliminar un almacén no borrará sus transacciones asociadas.',
        onConfirm: async () => {
            await databaseService.deleteLocation(orgId, locationId);
            setLocations(prev => prev.filter(l => l.id !== locationId));
            showNotification('Almacén eliminado.');
        }
    });
  });
  
  const handleDeletePartner = createScopedHandler((orgId, partnerId) => {
    setConfirmation({
        message: '¿Estás seguro? Eliminar un socio no afectará a las transacciones existentes.',
        onConfirm: async () => {
            await databaseService.deletePartner(orgId, partnerId);
            setPartners(prev => prev.filter(p => p.id !== partnerId));
            showNotification('Socio logístico eliminado.');
        }
    });
  });
  
  const handleUpdateUser = createScopedHandler(async (orgId, userId, updatedFields) => {
    await databaseService.updateUser(userId, updatedFields);
    setUsersInOrg(prev => prev.map(u => u.id === userId ? { ...u, ...updatedFields } as User : u));
    showNotification('Rol de usuario actualizado.');
  });

  const handleInviteUser = createScopedHandler(async (orgId, email, role) => {
    await databaseService.inviteUserToOrganization(orgId, email, role);
    const updatedUsers = await databaseService.getUsersByOrganization(orgId);
    setUsersInOrg(updatedUsers);
    showNotification(`Invitación enviada a ${email}.`);
  });

  const handleDeleteUser = createScopedHandler((orgId, userId) => {
    setConfirmation({
        message: '¿Estás seguro de que quieres eliminar este usuario de la organización?',
        onConfirm: async () => {
            await databaseService.deleteUser(userId);
            setUsersInOrg(prev => prev.filter(u => u.id !== userId));
            showNotification('Usuario eliminado de la organización.');
        }
    });
  });
  
  const handleCancelInvitation = createScopedHandler((orgId, invitationId) => {
    setConfirmation({
        message: '¿Estás seguro de que quieres cancelar esta invitación?',
        onConfirm: async () => {
            await databaseService.cancelInvitation(invitationId);
            setUsersInOrg(prev => prev.filter(u => u.id !== invitationId));
            showNotification('Invitación cancelada.');
        }
    });
  });
  
  const handleSetupNewOrganization = async (orgName: string, adminEmail: string) => {
    await databaseService.setupNewOrganization(orgName, adminEmail);
    showNotification(`Organización "${orgName}" creada. El administrador ${adminEmail} ya puede registrarse.`, false);
  }
  const handleUpdateOrganization = async (orgId: string, updatedFields: Partial<Organization>) => {
    await databaseService.updateOrganization(orgId, updatedFields);
    showNotification('Organización actualizada.');
  }
  const handleDeleteOrganization = (orgId: string) => {
    setConfirmation({
        message: '¿Estás seguro? Eliminar una organización también eliminará todos sus datos (ítems, usuarios, etc). Esta acción es irreversible.',
        onConfirm: async () => {
            await databaseService.deleteAllData(orgId);
            await databaseService.deleteOrganization(orgId);
            showNotification('Organización eliminada permanentemente.');
        }
    });
  }

  const handleViewOrganization = (orgId: string) => {
    setViewingAsOrgId(orgId);
    loadOrganizationData(orgId);
    setActiveTab('dashboard');
  }

  const handleReturnToSuperAdmin = () => {
    setViewingAsOrgId(null);
    if(currentUser) {
        setOrganization(null);
        setItems([]);
        setTransactions([]);
        setControlRecords([]);
        setLocations([]);
        setUsersInOrg([]);
        setPartners([]);
        loadOrganizationData(currentUser.organizationId);
    }
    setActiveTab('superadmin');
  }

  const handleExportInventory = (selectedItems: (Item & { stock: number })[]) => {
    if (selectedItems.length === 0) return showNotification("Selecciona al menos un artículo para exportar.", true);
    generateInventoryReport(selectedItems, organization?.name || 'Mi Organización');
  }
  
  const handleExportAnalytics = createScopedHandler(async (orgId: string, data: AnalyticsData) => {
      generateAnalyticsReport(data, organization?.name || 'Mi Organización');
  });

  const visibleTabs = useMemo(() => {
    if (!currentUser) return [];
    if (viewingAsOrgId && currentUser.role === UserRole.SUPER_ADMIN) {
        return TABS.filter(tab => tab.roles.includes(UserRole.ORG_ADMIN) && tab.id !== 'superadmin');
    }
    return TABS.filter(tab => tab.roles.includes(currentUser.role));
  }, [currentUser, viewingAsOrgId]);

  useEffect(() => {
    if (currentUser && (activeTab === null || !visibleTabs.find(t => t.id === activeTab))) {
        const defaultTab = currentUser.role === UserRole.SUPER_ADMIN && !viewingAsOrgId ? 'superadmin' : 'scan';
        setActiveTab(visibleTabs.find(t => t.id === defaultTab) ? defaultTab : (visibleTabs[0]?.id || null));
    }
  }, [currentUser, visibleTabs, activeTab, viewingAsOrgId]);

  if (!authChecked) {
    return <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center"><Spinner /></div>
  }
  if (!currentUser) {
    if (authView === 'login') return <Login onSwitchToRegister={() => setAuthView('register')} isFirebaseConfigured={isFirebaseConfigured} />;
    return <Register onSwitchToLogin={() => setAuthView('login')} />;
  }
  
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200">
      <header className={`bg-white dark:bg-gray-800 shadow-md sticky top-0 z-20`}>
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
              <div className="flex items-center">
                  <img src="https://chatboc-demo-widget-oigs.vercel.app/puntolimpio.png" alt="Punto Limpio Logo" className="h-10 w-10 mr-3" />
                  <div className='flex flex-col'>
                      <h1 className="text-xl md:text-2xl font-bold text-blue-600 dark:text-blue-500">Punto Limpio</h1>
                      {organization && <span className='text-xs font-semibold text-gray-500 dark:text-gray-400'>{organization.name} {viewingAsOrgId && '(Vista Super Admin)'}</span>}
                  </div>
                  {currentUser.role === UserRole.SUPER_ADMIN && viewingAsOrgId && (
                      <button onClick={handleReturnToSuperAdmin} className="ml-6 bg-yellow-500 text-white font-bold py-2 px-3 rounded-lg hover:bg-yellow-600 transition-colors flex items-center space-x-2 text-sm">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.707-10.293a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 011.414-1.414L9.414 11H13a1 1 0 100-2H9.414l1.293-1.293z" clipRule="evenodd" /></svg>
                          <span>Volver a Super Admin</span>
                      </button>
                  )}
                  {currentUser.role !== UserRole.SUPER_ADMIN && (
                    <LocationFilter locations={locations} selectedLocation={selectedLocation} onLocationChange={setSelectedLocation} className="ml-6 hidden lg:flex" />
                  )}
              </div>
              <div className="flex items-center space-x-2 md:space-x-4">
                <nav className="hidden md:flex space-x-1 bg-gray-100 dark:bg-gray-700 p-1 rounded-lg">
                    {visibleTabs.map(({ id, label }) => (
                        <button key={id} onClick={() => setActiveTab(id)} className={`px-3 py-2 text-sm font-medium rounded-md transition-all duration-300 ${activeTab === id ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
                            {label}
                        </button>
                    ))}
                </nav>
                 <button onClick={handleLogout} className="p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700" title="Cerrar Sesión">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                 </button>
                <button onClick={toggleTheme} className="p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700">
                    {theme === 'light' ? 
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" /></svg> : 
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                    }
                </button>
                <button onClick={() => setIsMenuOpen(true)} className="md:hidden p-2 rounded-full text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
                </button>
              </div>
          </div>
          {currentUser.role !== UserRole.SUPER_ADMIN && (
            <div className="container mx-auto px-4 sm:px-6 lg:px-8 pb-3 lg:hidden">
              <LocationFilter locations={locations} selectedLocation={selectedLocation} onLocationChange={setSelectedLocation} />
            </div>
          )}
      </header>

       {isMenuOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" onClick={() => setIsMenuOpen(false)}></div>
            <div className="fixed top-0 right-0 h-full w-4/5 max-w-xs bg-white dark:bg-gray-800 shadow-2xl p-6">
                <nav className="flex flex-col space-y-1 mt-8">
                    {visibleTabs.map(({ id, label }) => (
                        <button key={id} onClick={() => { setActiveTab(id); setIsMenuOpen(false); }} className={`w-full text-left px-4 py-3 text-lg font-medium rounded-lg transition-colors ${activeTab === id ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}>
                            {label}
                        </button>
                    ))}
                    <div className="my-2 border-t border-gray-200 dark:border-gray-700"></div>
                    {installPrompt && (
                        <button onClick={handleInstallClick} className="w-full text-left px-4 py-3 text-lg font-medium rounded-lg transition-colors text-white bg-green-600 hover:bg-green-700 flex items-center space-x-3">
                           <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                           <span>Instalar App</span>
                        </button>
                    )}
                </nav>
            </div>
        </div>
      )}
      
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isLoading || activeTab === null ? (
            <div className="flex justify-center items-center h-64"><Spinner /></div>
        ) : (
            <>
                {activeTab === 'dashboard' && <Dashboard items={items} transactions={filteredData.visibleTransactions} locations={locations} partners={partners} isLoading={isLoading} onExport={handleExportInventory} onUpdateItem={handleUpdateItem}/>}
                {activeTab === 'analytics' && <Analytics items={items} transactions={filteredData.visibleTransactions} controlRecords={filteredData.visibleControlRecords} isLoading={isLoading} theme={theme} onExport={(data) => handleExportAnalytics(data as AnalyticsData)} />}
                {activeTab === 'scan' && <ScanDocument onConfirmUpload={handleConfirmUpload} locations={locations} />}
                {activeTab === 'qrscan' && <QrScanner items={items} onConfirmTransaction={handleConfirmManualTransaction} locations={locations} partners={partners} selectedLocationId={selectedLocation === 'ALL' && locations.length > 0 ? locations[0].id : selectedLocation} />}
                {activeTab === 'manual' && <ManualEntry items={items} locations={locations} partners={partners} onConfirmTransaction={handleConfirmManualTransaction} onDeleteAllData={requestDeleteAllData} />}
                {activeTab === 'warehouse' && <WarehouseLog transactions={filteredData.visibleTransactions} items={items} locations={locations} partners={partners} isLoading={isLoading} onDeleteTransaction={handleDeleteTransaction} onDeleteSelected={handleDeleteSelectedTransactions} onUpdateTransaction={handleUpdateTransaction} />}
                {activeTab === 'control' && <Control controlRecords={filteredData.visibleControlRecords} isLoading={isLoading} onDeleteRecord={handleDeleteControlRecord} onDeleteSelected={handleDeleteSelectedControlRecords} onUpdateRecord={handleUpdateControlRecord}/>}
                {activeTab === 'settings' && currentUser && <Settings locations={locations} onAddLocation={handleAddLocation} onUpdateLocation={handleUpdateLocation} onDeleteLocation={handleDeleteLocation} partners={partners} onAddPartner={handleAddPartner} onUpdatePartner={handleUpdatePartner} onDeletePartner={handleDeletePartner} currentUser={currentUser} users={usersInOrg} onUpdateUser={handleUpdateUser} onDeleteUser={handleDeleteUser} onCancelInvitation={handleCancelInvitation} onInviteUser={handleInviteUser}/>}
                {activeTab === 'superadmin' && currentUser?.role === UserRole.SUPER_ADMIN && <SuperAdminDashboard onSetupNewOrganization={handleSetupNewOrganization} onUpdateOrganization={handleUpdateOrganization} onDeleteOrganization={handleDeleteOrganization} onViewOrganization={handleViewOrganization} currentUser={currentUser} onUpdateUser={handleUpdateUser} onDeleteUser={handleDeleteUser} onCancelInvitation={handleCancelInvitation} onInviteUser={handleInviteUser}/>}
            </>
        )}
      </main>
      
      {notification && (
        <div className={`fixed bottom-5 right-5 text-white py-3 px-6 rounded-lg shadow-xl z-50 transition-transform transform-gpu animate-bounce ${isNotificationError ? 'bg-red-600' : 'bg-green-600'}`} role="alert">
          {notification}
        </div>
      )}

      {confirmation && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50" aria-modal="true">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl p-6 md:p-8 m-4 max-w-sm w-full">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Confirmación Requerida</h3>
                <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">{confirmation.message}</p>
                <div className="mt-6 flex justify-end space-x-3">
                    <button onClick={() => setConfirmation(null)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-200 hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500 rounded-md">Cancelar</button>
                    <button onClick={() => { confirmation.onConfirm(); setConfirmation(null); }} className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md">Confirmar</button>
                </div>
            </div>
        </div>
      )}
      
      {!isLoading && currentUser && <AiAssistant items={items} transactions={transactions} partners={partners} />}

      {itemsForQrModal && <QrCodeBulkDisplayModal items={itemsForQrModal} onClose={() => setItemsForQrModal(null)} />}
    </div>
  );
};

export default App;