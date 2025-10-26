import { Item, Transaction, ControlRecord, Location, Organization, User, UserRole, Invitation, UserOrInvitation, DailyUsage, Partner, PartnerType } from '../types';

const ITEMS_KEY = 'punto-limpio-items';
const TRANSACTIONS_KEY = 'punto-limpio-transactions';
const CONTROL_RECORDS_KEY = 'punto-limpio-control-records';
const LOCATIONS_KEY = 'punto-limpio-locations';
const ORGANIZATIONS_KEY = 'punto-limpio-organizations';
const USERS_KEY = 'punto-limpio-users';
const INVITATIONS_KEY = 'punto-limpio-invitations';
const PARTNERS_KEY = 'punto-limpio-partners';


export const uploadFile = async (file: File, path: string): Promise<string> => {
    console.log(`Mock Upload: ${path} (returning data URL)`);
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(file);
    });
};

const initializeMockData = () => {
    if (!localStorage.getItem(ORGANIZATIONS_KEY)) {
        const mockOrgs: Organization[] = [
            {
                id: 'org-admin-platform',
                name: 'Plataforma de Administración',
                usagePlan: { planName: 'Administración', monthlyQuota: 0 },
            },
            {
                id: 'org-1',
                name: 'Punto Limpio Junín (Demo)',
                usagePlan: {
                    planName: 'Plan Demo 1K',
                    monthlyQuota: 1000,
                    dailyQuota: 200,
                    perMinuteQuota: 20,
                },
            },
        ];
        localStorage.setItem(ORGANIZATIONS_KEY, JSON.stringify(mockOrgs));
        
        const mockUsers: User[] = [
            { id: 'mock-super-admin-uid', email: 'demo@example.com', organizationId: 'org-admin-platform', role: UserRole.SUPER_ADMIN },
            { id: 'mock-org-admin-uid', email: 'admin@puntolimpio.com', organizationId: 'org-1', role: UserRole.ORG_ADMIN },
        ];
        localStorage.setItem(USERS_KEY, JSON.stringify(mockUsers));

        const mockInvitations: Invitation[] = [
            { id: 'operator@puntolimpio.com', email: 'operator@puntolimpio.com', organizationId: 'org-1', role: UserRole.OPERATOR, isInvitation: true },
        ];
        localStorage.setItem(INVITATIONS_KEY, JSON.stringify(mockInvitations));

        const mockPartners: Partner[] = [
            { id: 'partner-1', organizationId: 'org-1', name: 'Municipalidad de Las Heras', isCustomer: true, isSupplier: false },
            { id: 'partner-2', organizationId: 'org-1', name: 'Proveedor de Chapas SA', isCustomer: false, isSupplier: true },
        ];
        localStorage.setItem(PARTNERS_KEY, JSON.stringify(mockPartners));
    }
};
initializeMockData();

const getData = async <T>(key: string): Promise<T[]> => {
    try {
        const json = localStorage.getItem(key);
        return json ? JSON.parse(json) : [];
    } catch (error) {
        console.error(`Failed to parse ${key} from localStorage`, error);
        return [];
    }
}

const saveData = async <T>(key: string, data: T[]): Promise<void> => {
    localStorage.setItem(key, JSON.stringify(data));
}

// --- New User/Invitation Flow ---
export const findUserInvitationByEmail = async (email: string): Promise<Invitation | null> => {
    const invitations = await getData<Invitation>(INVITATIONS_KEY);
    return invitations.find(i => i.email.toLowerCase() === email.toLowerCase()) || null;
}

export const inviteUserToOrganization = async (organizationId: string, email: string, role: UserRole): Promise<void> => {
    const invitations = await getData<Invitation>(INVITATIONS_KEY);
    if (invitations.some(i => i.email.toLowerCase() === email.toLowerCase())) {
        throw new Error("Ya existe una invitación para este correo.");
    }
    const users = await getData<User>(USERS_KEY);
    if (users.some(u => u.email.toLowerCase() === email.toLowerCase())) {
        throw new Error("Un usuario con este correo ya existe.");
    }
    const newInvitation: Invitation = {
        id: email.toLowerCase(),
        email: email.toLowerCase(),
        organizationId,
        role,
        isInvitation: true,
    };
    await saveData(INVITATIONS_KEY, [...invitations, newInvitation]);
};

// FIX: Aligned the return type with the real database service to resolve the TypeScript error in App.tsx.
export const getOrCreateUserProfile = async (uid: string, email: string): Promise<{ user: User; isNew: boolean } | null> => {
    let users = await getData<User>(USERS_KEY);
    const existingProfile = users.find(u => u.id === uid);
    if (existingProfile) return { user: existingProfile, isNew: false };

    let invitations = await getData<Invitation>(INVITATIONS_KEY);
    const invitation = invitations.find(i => i.email.toLowerCase() === email.toLowerCase());

    if (invitation) {
        const newUserProfile: User = { 
            id: uid, 
            email: invitation.email, 
            organizationId: invitation.organizationId, 
            role: invitation.role 
        };
        const updatedUsers = [...users, newUserProfile];
        const updatedInvitations = invitations.filter(i => i.id.toLowerCase() !== email.toLowerCase());
        
        await saveData(USERS_KEY, updatedUsers);
        await saveData(INVITATIONS_KEY, updatedInvitations);
        return { user: newUserProfile, isNew: true };
    }
    
    // Auto-promote first user
    if (users.length === 0) {
        let orgs = await getData<Organization>(ORGANIZATIONS_KEY);
        const adminOrg = { id: 'org-admin-platform-mock', name: 'Plataforma de Administración' };
        orgs.push(adminOrg);
        
        const superAdmin: User = { id: uid, email: email, organizationId: adminOrg.id, role: UserRole.SUPER_ADMIN };
        users.push(superAdmin);

        await saveData(ORGANIZATIONS_KEY, orgs);
        await saveData(USERS_KEY, users);
        return { user: superAdmin, isNew: true };
    }

    return null;
}

// --- User Management ---
export const getUsersByOrganization = async (organizationId: string): Promise<UserOrInvitation[]> => {
    const users = (await getData<User>(USERS_KEY)).filter(u => u.organizationId === organizationId);
    const invitations = (await getData<Invitation>(INVITATIONS_KEY)).filter(i => i.organizationId === organizationId);
    return [...users, ...invitations];
}
export const updateUser = async (userId: string, updatedFields: Partial<User>): Promise<void> => {
    const users = await getData<User>(USERS_KEY);
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex > -1) {
        users[userIndex] = { ...users[userIndex], ...updatedFields };
        await saveData(USERS_KEY, users);
    }
}
export const deleteUser = async (userId: string): Promise<void> => {
    const users = await getData<User>(USERS_KEY);
    await saveData(USERS_KEY, users.filter(u => u.id !== userId));
}
export const cancelInvitation = async (invitationId: string): Promise<void> => {
    const invitations = await getData<Invitation>(INVITATIONS_KEY);
    await saveData(INVITATIONS_KEY, invitations.filter(i => i.id !== invitationId));
}

// Super Admin & Organization Management
export const getOrganizationsWithUsageStats = async (): Promise<Organization[]> => {
    const orgs = await getData<Organization>(ORGANIZATIONS_KEY);
    const users = await getData<User>(USERS_KEY);
    const items = await getData<Item>(ITEMS_KEY);
    const txs = await getData<Transaction>(TRANSACTIONS_KEY);
    
    return orgs.map(org => ({
        ...org,
        userCount: users.filter(u => u.organizationId === org.id).length,
        adminEmail: users.find(u => u.organizationId === org.id && u.role === UserRole.ORG_ADMIN)?.email || 'N/A',
        itemCount: items.filter(i => i.organizationId === org.id).length,
        transactions30d: txs.filter(t => t.organizationId === org.id).length, // simplified for mock
        iaScans30d: txs.filter(t => t.organizationId === org.id && t.imageUrl).length // simplified for mock
    }));
};
export const getDailyUsageForOrganization = async (organizationId: string): Promise<DailyUsage[]> => {
    const usage: DailyUsage[] = [];
    for (let i = 0; i < 30; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        usage.push({ date: date.toISOString().split('T')[0], count: Math.floor(Math.random() * 5) });
    }
    return usage.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}
export const getOrganization = async(organizationId: string): Promise<Organization | null> => {
    const orgs = await getData<Organization>(ORGANIZATIONS_KEY);
    return orgs.find(o => o.id === organizationId) || null;
}

export const setupNewOrganization = async (orgName: string, adminEmail: string): Promise<void> => {
    const orgs = await getData<Organization>(ORGANIZATIONS_KEY);
    const newOrg: Organization = {
        name: orgName,
        id: `org-${Date.now()}`,
        usagePlan: {
            planName: 'Plan Base 500',
            monthlyQuota: 500,
            dailyQuota: 100,
            perMinuteQuota: 10,
        }
    };
    await saveData(ORGANIZATIONS_KEY, [...orgs, newOrg]);
    await inviteUserToOrganization(newOrg.id, adminEmail, UserRole.ORG_ADMIN);
}
export const updateOrganization = async (organizationId: string, updatedFields: Partial<Organization>): Promise<void> => {
    const orgs = await getData<Organization>(ORGANIZATIONS_KEY);
    const index = orgs.findIndex(o => o.id === organizationId);
    if (index > -1) orgs[index] = { ...orgs[index], ...updatedFields };
    await saveData(ORGANIZATIONS_KEY, orgs);
};
export const deleteOrganization = (organizationId: string): Promise<void> => saveData(ORGANIZATIONS_KEY, []);
export const getItems = (organizationId: string): Promise<Item[]> => getScopedData<Item>(ITEMS_KEY, organizationId);
export const getTransactions = (organizationId: string): Promise<Transaction[]> => getScopedData<Transaction>(TRANSACTIONS_KEY, organizationId);
export const getControlRecords = (organizationId: string): Promise<ControlRecord[]> => getScopedData<ControlRecord>(CONTROL_RECORDS_KEY, organizationId);
export const getLocations = (organizationId: string): Promise<Location[]> => getScopedData<Location>(LOCATIONS_KEY, organizationId);
export const getPartners = (organizationId: string): Promise<Partner[]> => getScopedData<Partner>(PARTNERS_KEY, organizationId);
const getScopedData = async <T extends { organizationId: string; id: string }>(key: string, organizationId: string): Promise<T[]> => {
    const allData = await getData<T>(key);
    return allData.filter(d => d.organizationId === organizationId);
};
export const addItemsAndTransactions = async (organizationId: string, newItems: Omit<Item, 'organizationId'>[], newTransactions: Omit<Transaction, 'organizationId'>[]): Promise<void> => {
    const currentItems = await getData<Item>(ITEMS_KEY);
    const currentTransactions = await getData<Transaction>(TRANSACTIONS_KEY);
    await saveData(ITEMS_KEY, [...currentItems, ...newItems.map(i => ({...i, organizationId}))]);
    await saveData(TRANSACTIONS_KEY, [...currentTransactions, ...newTransactions.map(t=>({...t, organizationId}))]);
};
export const addControlRecordsAndTransactions = async (organizationId: string, newRecords: Omit<ControlRecord, 'organizationId'>[], newTransactions: Omit<Transaction, 'id' | 'organizationId'>[]): Promise<void> => {
    const currentRecords = await getData<ControlRecord>(CONTROL_RECORDS_KEY);
    await saveData(CONTROL_RECORDS_KEY, [...currentRecords, ...newRecords.map(r => ({...r, organizationId}))]);
    
    const currentTransactions = await getData<Transaction>(TRANSACTIONS_KEY);
    const finalNewTransactions = newTransactions.map(t => ({...t, id: `tx-mock-${Date.now()}-${Math.random()}`, organizationId}));
    await saveData(TRANSACTIONS_KEY, [...currentTransactions, ...finalNewTransactions]);
};
export const addControlRecords = async (organizationId: string, newRecords: Omit<ControlRecord, 'organizationId'>[]): Promise<void> => {
    const currentRecords = await getData<ControlRecord>(CONTROL_RECORDS_KEY);
    await saveData(CONTROL_RECORDS_KEY, [...currentRecords, ...newRecords.map(r=>({...r, organizationId}))]);
};
export const addLocation = async (organizationId: string, location: Omit<Location, 'id' | 'organizationId'>): Promise<Location> => {
    const currentLocations = await getData<Location>(LOCATIONS_KEY);
    const newLocation = { ...location, id: `loc-${Date.now()}`, organizationId };
    await saveData(LOCATIONS_KEY, [...currentLocations, newLocation]);
    return newLocation;
};
export const updateLocation = async (organizationId: string, locationId: string, updatedFields: Partial<Location>): Promise<void> => {
    const locations = await getData<Location>(LOCATIONS_KEY);
    const locationIndex = locations.findIndex(l => l.id === locationId);
    if (locationIndex > -1) locations[locationIndex] = { ...locations[locationIndex], ...updatedFields };
    await saveData(LOCATIONS_KEY, locations);
};
export const deleteLocation = async (organizationId: string, locationId: string): Promise<void> => {
    const locations = await getData<Location>(LOCATIONS_KEY);
    await saveData(LOCATIONS_KEY, locations.filter(l => l.id !== locationId));
};
export const addPartner = async (organizationId: string, partnerData: Omit<Partner, 'id' | 'organizationId'>): Promise<Partner> => {
    const currentPartners = await getData<Partner>(PARTNERS_KEY);
    const newPartner = { ...partnerData, id: `partner-${Date.now()}`, organizationId };
    await saveData(PARTNERS_KEY, [...currentPartners, newPartner]);
    return newPartner;
};
export const updatePartner = async (organizationId: string, partnerId: string, updatedFields: Partial<Partner>): Promise<void> => {
    const partners = await getData<Partner>(PARTNERS_KEY);
    const index = partners.findIndex(p => p.id === partnerId);
    if (index > -1) partners[index] = { ...partners[index], ...updatedFields };
    await saveData(PARTNERS_KEY, partners);
};
export const deletePartner = async (organizationId: string, partnerId: string): Promise<void> => {
    const partners = await getData<Partner>(PARTNERS_KEY);
    await saveData(PARTNERS_KEY, partners.filter(p => p.id !== partnerId));
};
export const deleteTransaction = async (organizationId: string, transactionId: string): Promise<void> => {
    const transactions = await getData<Transaction>(TRANSACTIONS_KEY);
    await saveData(TRANSACTIONS_KEY, transactions.filter(tx => tx.id !== transactionId));
};
export const deleteTransactions = async (organizationId: string, transactionIds: string[]): Promise<void> => {
    const transactions = await getData<Transaction>(TRANSACTIONS_KEY);
    const idsToDelete = new Set(transactionIds);
    await saveData(TRANSACTIONS_KEY, transactions.filter(tx => !idsToDelete.has(tx.id)));
};
export const deleteControlRecord = async (organizationId: string, recordId: string): Promise<void> => {
    const records = await getData<ControlRecord>(CONTROL_RECORDS_KEY);
    await saveData(CONTROL_RECORDS_KEY, records.filter(r => r.id !== recordId));
};
export const deleteControlRecords = async (organizationId: string, recordIds: string[]): Promise<void> => {
    const records = await getData<ControlRecord>(CONTROL_RECORDS_KEY);
    const idsToDelete = new Set(recordIds);
    await saveData(CONTROL_RECORDS_KEY, records.filter(r => !idsToDelete.has(r.id)));
};
export const deleteAllData = async (organizationId: string): Promise<void> => {
    await saveData(ITEMS_KEY, []);
    await saveData(TRANSACTIONS_KEY, []);
    await saveData(CONTROL_RECORDS_KEY, []);
    await saveData(LOCATIONS_KEY, []);
};
export const updateTransaction = async (organizationId: string, transactionId: string, updatedFields: Partial<Transaction>): Promise<void> => {
    const transactions = await getData<Transaction>(TRANSACTIONS_KEY);
    const transactionIndex = transactions.findIndex(tx => tx.id === transactionId);
    if (transactionIndex > -1) transactions[transactionIndex] = { ...transactions[transactionIndex], ...updatedFields };
    await saveData(TRANSACTIONS_KEY, transactions);
};
export const updateControlRecord = async (organizationId: string, recordId: string, updatedFields: Partial<ControlRecord>): Promise<void> => {
    const records = await getData<ControlRecord>(CONTROL_RECORDS_KEY);
    const recordIndex = records.findIndex(r => r.id === recordId);
    if (recordIndex > -1) records[recordIndex] = { ...records[recordIndex], ...updatedFields };
    await saveData(CONTROL_RECORDS_KEY, records);
};
export const updateItem = async (organizationId: string, itemId: string, updatedFields: Partial<Item>): Promise<void> => {
    const items = await getData<Item>(ITEMS_KEY);
    const itemIndex = items.findIndex(i => i.id === itemId);
    if (itemIndex > -1) items[itemIndex] = { ...items[itemIndex], ...updatedFields };
    await saveData(ITEMS_KEY, items);
};
// This function is defined but not used in mock service, as it's part of the Firebase-specific registration flow.
export const claimUserAccount = async (uid: string, email: string, organizationId: string, role: UserRole): Promise<void> => {};