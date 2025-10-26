import { 
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  User as FirebaseUser
} from "firebase/auth";
import { isFirebaseConfigured, auth } from '../firebaseConfig';
import * as db from './databaseService';

// Mock user para el modo demo
const MOCK_USER: FirebaseUser | null = isFirebaseConfigured ? null : {
  uid: 'mock-super-admin-uid',
  email: 'demo@example.com',
  emailVerified: true,
  isAnonymous: false,
  metadata: {},
  providerData: [],
  providerId: 'password',
  tenantId: null,
  displayName: 'Demo User',
  photoURL: null,
  phoneNumber: null,
  toJSON: () => ({})
} as any;

// Nuevo estado para manejar la sesión mock
let mockAuthListener: ((user: FirebaseUser | null) => void) | null = null;
let mockCurrentUser: FirebaseUser | null = null;

export const registerUser = async (email: string, password: string) => {
    if (!isFirebaseConfigured) {
        // Mock registration logic
        const invitation = await db.findUserInvitationByEmail(email);
        if (!invitation) throw new Error("Este correo no ha sido invitado.");
        
        const newUid = `mock-uid-${Date.now()}`;
        // The profile will be created on first login via getOrCreateUserProfile in the mock service
        return { user: { uid: newUid } };
    }

    // Real Firebase registration
    if (!auth) throw new Error("Firebase Auth no está inicializado.");
    
    // REMOVED INVITATION PRE-CHECK. We let Firebase Auth be the source of truth for email existence.
    // The profile will be created on first login by App.tsx, which handles the invitation check.
    
    try {
        return await createUserWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
        if (error.code === 'auth/email-already-in-use') {
            // This is a more helpful error message. It guides the user to the correct action.
            throw new Error("Un usuario con este correo ya existe. Por favor, intenta iniciar sesión.");
        }
        throw error; // Rethrow other auth errors (weak-password, etc.)
    }
}


export const login = (email: string, password: string) => {
  if (!isFirebaseConfigured) {
    if (email === 'demo@example.com' && password === 'password') {
        mockCurrentUser = MOCK_USER;
        if (mockAuthListener) {
            // Simula el comportamiento asíncrono de Firebase
            setTimeout(() => mockAuthListener!(mockCurrentUser), 100);
        }
        return Promise.resolve({ user: MOCK_USER! });
    }
    return Promise.reject(new Error("Credenciales inválidas para el modo demo."));
  }
  if (!auth) return Promise.reject(new Error("Firebase Auth no está inicializado."));
  return signInWithEmailAndPassword(auth, email, password);
};

export const logout = () => {
  if (!isFirebaseConfigured) {
    mockCurrentUser = null;
    if (mockAuthListener) {
        setTimeout(() => mockAuthListener!(null), 100);
    }
    return Promise.resolve();
  }
  if (!auth) return Promise.resolve();
  return signOut(auth);
};

export const onAuthStateChangeObserver = (callback: (user: FirebaseUser | null) => void) => {
  if (!isFirebaseConfigured) {
    mockAuthListener = callback;
    // En el modo demo, al iniciar, no hay ningún usuario logueado por defecto.
    setTimeout(() => callback(null), 0); 
    
    // Devuelve la función para desuscribirse
    return () => {
      mockAuthListener = null;
    };
  }
  if (!auth) {
    console.error("Firebase Auth no está disponible para onAuthStateChanged.");
    return () => {};
  }
  return onAuthStateChanged(auth, callback);
};