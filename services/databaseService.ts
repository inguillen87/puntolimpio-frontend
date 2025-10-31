import { collection, getDocs, writeBatch, doc, deleteDoc, updateDoc, addDoc, query, where, getDoc, setDoc, limit } from 'firebase/firestore';
import { getStorage, ref, getDownloadURL } from 'firebase/storage';
import { appCheckProviderLabel, db } from '../firebaseConfig'; // Importa la configuración de Firebase
import { Item, Transaction, ControlRecord, Location, Organization, User, UserRole, Invitation, UserOrInvitation, DailyUsage, Partner, PartnerType } from '../types';
import { requestSignedUploadUrl } from './usageLimitsService';

const ITEMS_COLLECTION = 'items';
const TRANSACTIONS_COLLECTION = 'transactions';
const CONTROL_RECORDS_COLLECTION = 'controlRecords';
const LOCATIONS_COLLECTION = 'locations';
const ORGANIZATIONS_COLLECTION = 'organizations';
const USERS_COLLECTION = 'users';
const INVITATIONS_COLLECTION = 'invitations';
const LOGISTIC_PARTNERS_COLLECTION = 'partners';


// Helper function to remove undefined fields from an object recursively
const removeUndefinedFields = (obj: any): any => {
    if (obj === null || obj === undefined) {
        return obj;
    }

    if (Array.isArray(obj)) {
        return obj.map(item => removeUndefinedFields(item)).filter(item => item !== undefined);
    }

    if (typeof obj === 'object' && obj.constructor === Object) {
        const newObj: { [key: string]: any } = {};
        for (const key in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, key)) {
                const value = obj[key];
                if (value !== undefined) {
                    const cleanedValue = removeUndefinedFields(value);
                    if (cleanedValue !== undefined) {
                       newObj[key] = cleanedValue;
                    }
                }
            }
        }
        return newObj;
    }

    return obj;
};


// --- Firebase Storage Integration ---
const storage = getStorage();

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export const uploadFile = async (file: File, path: string, organizationId: string): Promise<string> => {
    if (!organizationId) {
        throw new Error('MISSING_ORG');
    }

    console.log(`[DB Service] Intentando subir archivo a: ${path} (org=${organizationId})`);
    try {
        const contentType = file.type || 'application/octet-stream';
        const { uploadUrl, path: remotePath } = await requestSignedUploadUrl(contentType, organizationId);
        const response = await fetch(uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': contentType },
            body: file,
        });

        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            throw new Error(`UPLOAD_FAILED_${response.status}${errorText ? `: ${errorText}` : ''}`);
        }

        const storageRef = ref(storage, remotePath);
        const maxAttempts = 3;
        let lastError: unknown = null;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const downloadURL = await getDownloadURL(storageRef);
                console.log(`[DB Service] Archivo subido con éxito. URL: ${downloadURL}`);
                return downloadURL;
            } catch (error) {
                lastError = error;
                if (attempt < maxAttempts - 1) {
                    const backoff = 200 * (attempt + 1);
                    console.warn(`getDownloadURL falló, reintentando en ${backoff}ms...`, error);
                    await wait(backoff);
                    continue;
                }
                throw error;
            }
        }

        throw lastError instanceof Error ? lastError : new Error('UNKNOWN_DOWNLOAD_URL_ERROR');
    } catch (error: any) {
        if (error?.code === 'appcheck/not-configured') {
            error.message =
                `Firebase App Check no está operativo en el front (proveedor configurado: ${appCheckProviderLabel}). Definí VITE_FIREBASE_APPCHECK_SITE_KEY, verificá que el dominio esté autorizado en la consola de ${appCheckProviderLabel} y que el proveedor de App Check coincida con el configurado en Firebase.`;
        }
        console.error("[DB Service] ERROR CRÍTICO AL SUBIR:", {
            message: error.message,
            code: error.code,
            name: error.name,
            fullError: error
        });
        throw error; // Re-lanza el error para que sea manejado por el componente
    }
}

// --- New Robust User/Invitation Flow ---
export const findUserInvitationByEmail = async (email: string): Promise<Invitation | null> => {
    const invitationRef = doc(db, INVITATIONS_COLLECTION, email.toLowerCase());
    const invitationSnap = await getDoc(invitationRef);
    if (invitationSnap.exists()) {
        return { ...invitationSnap.data(), id: invitationSnap.id, isInvitation: true } as Invitation;
    }
    return null;
}

export const hasAnyUsers = async (): Promise<boolean> => {
    const usersSnapshot = await getDocs(query(collection(db, USERS_COLLECTION), limit(1)));
    return !usersSnapshot.empty;
}

export const inviteUserToOrganization = async (organizationId: string, email: string, role: UserRole): Promise<void> => {
    const normalizedEmail = email.toLowerCase();
    const invitationRef = doc(db, INVITATIONS_COLLECTION, normalizedEmail);
    const existingInvitation = await getDoc(invitationRef);
    if (existingInvitation.exists()) {
        throw new Error("Ya existe una invitación pendiente para este correo electrónico.");
    }
    
    const usersQuery = query(collection(db, USERS_COLLECTION), where("email", "==", normalizedEmail));
    const existingUser = await getDocs(usersQuery);
    if (!existingUser.empty) {
        throw new Error("Un usuario con este correo electrónico ya está registrado.");
    }

    const invitation: Omit<Invitation, 'isInvitation' | 'id'> = {
        email: normalizedEmail,
        organizationId,
        role,
    };
    await setDoc(invitationRef, removeUndefinedFields(invitation));
};

export const getOrCreateUserProfile = async (uid: string, email: string): Promise<{ user: User; isNew: boolean } | null> => {
    const userRef = doc(db, USERS_COLLECTION, uid);
    const userSnap = await getDoc(userRef);
    if (userSnap.exists()) {
        return { user: { ...userSnap.data(), id: userSnap.id } as User, isNew: false };
    }

    const normalizedEmail = email.toLowerCase();
    const invitationRef = doc(db, INVITATIONS_COLLECTION, normalizedEmail);
    const invitationSnap = await getDoc(invitationRef);

    if (invitationSnap.exists()) {
        const invitationData = invitationSnap.data() as Omit<Invitation, 'id' | 'isInvitation'>;
        const batch = writeBatch(db);
        
        const newUserProfile: User = { 
            id: uid, 
            email: invitationData.email, 
            organizationId: invitationData.organizationId, 
            role: invitationData.role 
        };
        batch.set(userRef, removeUndefinedFields(newUserProfile));
        batch.delete(invitationRef);

        await batch.commit();
        console.log(`User profile created for ${email} from invitation.`);
        return { user: newUserProfile, isNew: true };
    }
    
     // Special case: Auto-promote the very first user to SUPER_ADMIN
    const existingUsersSnapshot = await getDocs(query(collection(db, USERS_COLLECTION), limit(1)));
    if (existingUsersSnapshot.empty) {
        console.log("First user detected. Promoting to SUPER_ADMIN.");
        const batch = writeBatch(db);

        // 1. Create the admin organization
        const orgRef = doc(collection(db, ORGANIZATIONS_COLLECTION));
        batch.set(orgRef, { name: "Plataforma de Administración", id: orgRef.id });

        // 2. Create the SUPER_ADMIN user profile
        const superAdminProfile: User = {
            id: uid,
            email: normalizedEmail,
            organizationId: orgRef.id,
            role: UserRole.SUPER_ADMIN
        };
        batch.set(userRef, removeUndefinedFields(superAdminProfile));

        await batch.commit();
        return { user: superAdminProfile, isNew: true };
    }


    console.error(`No profile or invitation found for user ${email} (UID: ${uid})`);
    return null;
}


// User Management
export const getUsersByOrganization = async (organizationId: string): Promise<UserOrInvitation[]> => {
    const usersQuery = query(collection(db, USERS_COLLECTION), where("organizationId", "==", organizationId));
    const usersSnapshot = await getDocs(usersQuery);
    const users = usersSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }) as User);

    const invitationsQuery = query(collection(db, INVITATIONS_COLLECTION), where("organizationId", "==", organizationId));
    const invitationsSnapshot = await getDocs(invitationsQuery);
    const invitations = invitationsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, isInvitation: true }) as Invitation);

    return [...users, ...invitations];
}
export const updateUser = async (userId: string, updatedFields: Partial<User>): Promise<void> => {
    const docRef = doc(db, USERS_COLLECTION, userId);
    await updateDoc(docRef, removeUndefinedFields(updatedFields) as { [x: string]: any });
}
export const deleteUser = async (userId: string): Promise<void> => {
    const docRef = doc(db, USERS_COLLECTION, userId);
    await deleteDoc(docRef);
}
export const cancelInvitation = async (invitationId: string): Promise<void> => {
    const docRef = doc(db, INVITATIONS_COLLECTION, invitationId);
    await deleteDoc(docRef);
}


// Super Admin & Organization Management
export const getOrganizationsWithUsageStats = async (): Promise<Organization[]> => {
    const orgsSnapshot = await getDocs(collection(db, ORGANIZATIONS_COLLECTION));
    const orgs = orgsSnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }) as Organization);

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const orgDetailsPromises = orgs.map(async (org) => {
        const usersQuery = query(collection(db, USERS_COLLECTION), where("organizationId", "==", org.id));
        const itemsQuery = query(collection(db, ITEMS_COLLECTION), where("organizationId", "==", org.id));
        const transactions30dQuery = query(collection(db, TRANSACTIONS_COLLECTION), where("organizationId", "==", org.id), where("createdAt", ">=", thirtyDaysAgo.toISOString()));
        
        const [usersSnapshot, itemsCount, transactions30dSnapshot] = await Promise.all([
            getDocs(usersQuery),
            getCountFromServer(itemsQuery),
            getDocs(transactions30dQuery)
        ]);

        const transactionsLast30d = transactions30dSnapshot.docs.map(doc => doc.data() as Transaction);
        const iaScans30d = transactionsLast30d.filter(tx => tx.imageUrl && tx.imageUrl.trim() !== "").length;

        const admin = usersSnapshot.docs.find(doc => doc.data().role === "ORG_ADMIN")?.data().email;

        return {
            ...org,
            userCount: usersSnapshot.size,
            adminEmail: admin || 'N/A',
            itemCount: itemsCount.data().count,
            transactions30d: transactionsLast30d.length,
            iaScans30d: iaScans30d,
        };
    });

    return Promise.all(orgDetailsPromises);
};

export const getDailyUsageForOrganization = async (organizationId: string): Promise<DailyUsage[]> => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const transactionsQuery = query(
        collection(db, TRANSACTIONS_COLLECTION),
        where("organizationId", "==", organizationId),
        where("createdAt", ">=", thirtyDaysAgo.toISOString())
    );

    const querySnapshot = await getDocs(transactionsQuery);
    const transactions = querySnapshot.docs.map(doc => doc.data() as Transaction);
    const iaScans = transactions.filter(tx => tx.imageUrl && tx.imageUrl.trim() !== "");

    const usageMap = new Map<string, number>();
    for (let i = 0; i < 30; i++) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        usageMap.set(date.toISOString().split('T')[0], 0);
    }
    
    iaScans.forEach(tx => {
        const date = new Date(tx.createdAt).toISOString().split('T')[0];
        usageMap.set(date, (usageMap.get(date) || 0) + 1);
    });

    return Array.from(usageMap.entries())
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
};

export const getOrganization = async(organizationId: string): Promise<Organization | null> => {
    const docRef = doc(db, ORGANIZATIONS_COLLECTION, organizationId);
    const docSnap = await getDoc(docRef);
    if(docSnap.exists()){
        return { ...docSnap.data(), id: docSnap.id } as Organization;
    }
    return null;
}

export const setupNewOrganization = async (orgName: string, adminEmail: string): Promise<void> => {
    const normalizedEmail = adminEmail.toLowerCase();
    
    // Check if user or invitation already exists
    const invitation = await findUserInvitationByEmail(normalizedEmail);
    if (invitation) throw new Error("Ya existe una invitación para este correo.");
    const usersQuery = query(collection(db, USERS_COLLECTION), where("email", "==", normalizedEmail));
    const existingUser = await getDocs(usersQuery);
    if (!existingUser.empty) throw new Error("Un usuario con este correo ya existe.");

    // Create the organization and invitation in a batch
    const batch = writeBatch(db);
    const orgRef = doc(collection(db, ORGANIZATIONS_COLLECTION));
    batch.set(orgRef, { name: orgName, id: orgRef.id });

    const invitationRef = doc(db, INVITATIONS_COLLECTION, normalizedEmail);
    const newInvitation: Omit<Invitation, 'isInvitation' | 'id'> = {
        email: normalizedEmail,
        organizationId: orgRef.id,
        role: UserRole.ORG_ADMIN,
    };
    batch.set(invitationRef, removeUndefinedFields(newInvitation));
    
    await batch.commit();
}

export const updateOrganization = async (organizationId: string, updatedFields: Partial<Organization>): Promise<void> => {
    const docRef = doc(db, ORGANIZATIONS_COLLECTION, organizationId);
    await updateDoc(docRef, removeUndefinedFields(updatedFields) as { [x: string]: any });
}

export const deleteOrganization = async (organizationId: string): Promise<void> => {
    // Note: This is a simplified delete. For production, you'd use a Cloud Function
    // to recursively delete all sub-collections and associated users.
    const orgRef = doc(db, ORGANIZATIONS_COLLECTION, organizationId);
    await deleteDoc(orgRef);
}


// Scoped data access
const getScopedData = async <T extends {id: string}>(collectionName: string, organizationId: string): Promise<T[]> => {
    const q = query(collection(db, collectionName), where("organizationId", "==", organizationId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }) as T);
}

export const getItems = (organizationId: string): Promise<Item[]> => getScopedData<Item>(ITEMS_COLLECTION, organizationId);
export const getTransactions = (organizationId: string): Promise<Transaction[]> => getScopedData<Transaction>(TRANSACTIONS_COLLECTION, organizationId);
export const getControlRecords = (organizationId: string): Promise<ControlRecord[]> => getScopedData<ControlRecord>(CONTROL_RECORDS_COLLECTION, organizationId);
export const getLocations = (organizationId: string): Promise<Location[]> => getScopedData<Location>(LOCATIONS_COLLECTION, organizationId);
export const getPartners = (organizationId: string): Promise<Partner[]> => getScopedData<Partner>(LOGISTIC_PARTNERS_COLLECTION, organizationId);

export const addPartner = async (organizationId: string, partnerData: Omit<Partner, 'id' | 'organizationId'>): Promise<Partner> => {
    const docRef = await addDoc(collection(db, LOGISTIC_PARTNERS_COLLECTION), removeUndefinedFields({ ...partnerData, organizationId }));
    return { ...partnerData, id: docRef.id, organizationId };
}
export const updatePartner = async (organizationId: string, partnerId: string, updatedFields: Partial<Partner>): Promise<void> => {
    const docRef = doc(db, LOGISTIC_PARTNERS_COLLECTION, partnerId);
    await updateDoc(docRef, removeUndefinedFields(updatedFields) as { [x: string]: any });
}
export const deletePartner = async (organizationId: string, partnerId: string): Promise<void> => {
    const docRef = doc(db, LOGISTIC_PARTNERS_COLLECTION, partnerId);
    await deleteDoc(docRef);
}


export const addItemsAndTransactions = async (organizationId: string, newItems: Item[], newTransactions: Omit<Transaction, 'id' | 'organizationId'>[]): Promise<void> => {
    const batch = writeBatch(db);

    newItems.forEach(item => {
        const docRef = doc(db, ITEMS_COLLECTION, item.id);
        batch.set(docRef, removeUndefinedFields(item));
    });

    newTransactions.forEach(transaction => {
        const docRef = doc(collection(db, TRANSACTIONS_COLLECTION));
        batch.set(docRef, removeUndefinedFields({ ...transaction, organizationId }));
    });
    
    console.log("[DB Service] Intentando guardar en la base de datos (batch.commit)...");
    try {
        await batch.commit();
        console.log("[DB Service] ¡Guardado exitoso!");
    } catch (error) {
        console.error("[DB Service] ERROR CRÍTICO DURANTE batch.commit():", error);
        throw error; // Re-throw the error to be caught by the UI
    }
};

export const addControlRecordsAndTransactions = async (organizationId: string, newRecords: Omit<ControlRecord, 'organizationId'>[], newTransactions: Omit<Transaction, 'id' | 'organizationId'>[]): Promise<void> => {
    const batch = writeBatch(db);

    newRecords.forEach(record => {
        const recordRef = doc(db, CONTROL_RECORDS_COLLECTION, record.id);
        batch.set(recordRef, removeUndefinedFields({ ...record, organizationId }));
    });

    newTransactions.forEach(transaction => {
        const docRef = doc(collection(db, TRANSACTIONS_COLLECTION));
        batch.set(docRef, removeUndefinedFields({ ...transaction, organizationId }));
    });
    
    await batch.commit();
};

export const addControlRecords = async (organizationId: string, newRecords: Omit<ControlRecord, 'organizationId'>[]): Promise<void> => {
    const batch = writeBatch(db);
    newRecords.forEach(record => {
        const recordRef = doc(db, CONTROL_RECORDS_COLLECTION, record.id);
        batch.set(recordRef, removeUndefinedFields({ ...record, organizationId }));
    });
    await batch.commit();
}

export const addLocation = async (organizationId: string, location: Omit<Location, 'id' | 'organizationId'>): Promise<Location> => {
    const docRef = await addDoc(collection(db, LOCATIONS_COLLECTION), removeUndefinedFields({ ...location, organizationId }));
    return { ...location, id: docRef.id, organizationId };
}

export const updateLocation = async (organizationId: string, locationId: string, updatedFields: Partial<Location>): Promise<void> => {
    const docRef = doc(db, LOCATIONS_COLLECTION, locationId);
    await updateDoc(docRef, removeUndefinedFields(updatedFields) as { [x: string]: any });
}

export const deleteLocation = async (organizationId: string, locationId: string): Promise<void> => {
    const docRef = doc(db, LOCATIONS_COLLECTION, locationId);
    await deleteDoc(docRef);
}

const deleteScopedDocs = async (collectionName: string, docIds: string[]) => {
    const batch = writeBatch(db);
    docIds.forEach(id => {
        const docRef = doc(db, collectionName, id);
        batch.delete(docRef);
    });
    await batch.commit();
}

export const deleteTransaction = (organizationId: string, transactionId: string): Promise<void> => deleteScopedDocs(TRANSACTIONS_COLLECTION, [transactionId]);
export const deleteTransactions = (organizationId: string, transactionIds: string[]): Promise<void> => deleteScopedDocs(TRANSACTIONS_COLLECTION, transactionIds);
export const deleteControlRecord = (organizationId: string, recordId: string): Promise<void> => deleteScopedDocs(CONTROL_RECORDS_COLLECTION, [recordId]);
export const deleteControlRecords = (organizationId: string, recordIds: string[]): Promise<void> => deleteScopedDocs(CONTROL_RECORDS_COLLECTION, recordIds);

export const deleteAllData = async (organizationId: string): Promise<void> => {
    const collectionsToDelete = [ITEMS_COLLECTION, TRANSACTIONS_COLLECTION, CONTROL_RECORDS_COLLECTION, LOCATIONS_COLLECTION, LOGISTIC_PARTNERS_COLLECTION];
    const batch = writeBatch(db);

    for (const collectionName of collectionsToDelete) {
        const q = query(collection(db, collectionName), where("organizationId", "==", organizationId));
        const querySnapshot = await getDocs(q);
        querySnapshot.docs.forEach(document => {
            batch.delete(document.ref);
        });
    }

    await batch.commit();
};

export const updateTransaction = async (organizationId: string, transactionId: string, updatedFields: Partial<Transaction>): Promise<void> => {
    const docRef = doc(db, TRANSACTIONS_COLLECTION, transactionId);
    await updateDoc(docRef, removeUndefinedFields(updatedFields) as { [x: string]: any });
};

export const updateControlRecord = async (organizationId: string, recordId: string, updatedFields: Partial<ControlRecord>): Promise<void> => {
    const docRef = doc(db, CONTROL_RECORDS_COLLECTION, recordId);
    await updateDoc(docRef, removeUndefinedFields(updatedFields) as { [x: string]: any });
};

export const updateItem = async (organizationId: string, itemId: string, updatedFields: Partial<Item>): Promise<void> => {
    const docRef = doc(db, ITEMS_COLLECTION, itemId);
    await updateDoc(docRef, removeUndefinedFields(updatedFields) as { [x: string]: any });
};