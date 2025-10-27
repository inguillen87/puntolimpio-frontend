import React, { useState } from 'react';
import { registerUser } from '../services/authService';
import { isFirebaseConfigured } from '../firebaseConfig';
import * as databaseService from '../services/databaseService';
import * as mockDatabaseService from '../services/mockDatabaseService';
import Spinner from './Spinner';

interface RegisterProps {
  onSwitchToLogin: () => void;
  onBackToLanding?: () => void;
}

const dbService = isFirebaseConfigured ? databaseService : mockDatabaseService;

const Register: React.FC<RegisterProps> = ({ onSwitchToLogin, onBackToLanding }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showInviteRequiredModal, setShowInviteRequiredModal] = useState(false);
  const [pendingEmail, setPendingEmail] = useState('');

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const normalizedEmail = email.trim().toLowerCase();
      const invitation = await dbService.findUserInvitationByEmail(normalizedEmail);
      if (!invitation) {
        setPendingEmail(email.trim());
        setShowInviteRequiredModal(true);
        setIsLoading(false);
        return;
      }

      await registerUser(normalizedEmail, password);
      // Success will be handled by the onAuthStateChanged observer in App.tsx
      // It will automatically log the user in.
    } catch (err: any) {
      console.error(err);
      if (err.code) {
        switch (err.code) {
          case 'auth/email-already-in-use':
            setError('Este correo electrónico ya está en uso por otra cuenta.');
            break;
          case 'auth/weak-password':
            setError('La contraseña debe tener al menos 6 caracteres.');
            break;
          default:
            setError('Ocurrió un error inesperado al registrar la cuenta.');
            break;
        }
      } else {
          setError(err.message || 'Ocurrió un error inesperado.');
      }
      setIsLoading(false);
    }
  };

  const closeInviteModal = () => {
    setShowInviteRequiredModal(false);
  };

  const handleDemoLoginRedirect = () => {
    closeInviteModal();
    onSwitchToLogin();
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 space-y-8">
        {onBackToLanding && (
          <button
            onClick={onBackToLanding}
            className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-blue-600 dark:text-gray-400 dark:hover:text-blue-400"
          >
            <span aria-hidden className="mr-2">←</span>
            Volver a la landing
          </button>
        )}
        <div>
          <img src="https://chatboc-demo-widget-oigs.vercel.app/puntolimpio.png" alt="Punto Limpio Logo" className="mx-auto h-20 w-auto" />
          <h2 className="mt-6 text-center text-3xl font-bold text-gray-900 dark:text-white">
            Crear Nueva Cuenta
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            Completa tus datos para activar tu cuenta de administrador.
          </p>
        </div>
        <form className="space-y-6" onSubmit={handleRegister}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email-address-reg" className="sr-only">Correo Electrónico</label>
              <input
                id="email-address-reg"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-gray-200 bg-white dark:bg-gray-700 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Correo Electrónico (el que fue invitado)"
              />
            </div>
            <div>
              <label htmlFor="password-reg" className="sr-only">Contraseña</label>
              <input
                id="password-reg"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-gray-200 bg-white dark:bg-gray-700 focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Contraseña (mínimo 6 caracteres)"
              />
            </div>
             <div>
              <label htmlFor="confirm-password-reg" className="sr-only">Confirmar Contraseña</label>
              <input
                id="confirm-password-reg"
                name="confirm-password"
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-gray-200 bg-white dark:bg-gray-700 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Confirmar Contraseña"
              />
            </div>
          </div>
          
          {error && <p className="text-sm text-center text-red-600 dark:text-red-400">{error}</p>}

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-blue-400 dark:disabled:bg-blue-800"
            >
              {isLoading ? <Spinner /> : 'Crear Cuenta y Entrar'}
            </button>
          </div>
        </form>
         <p className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
            ¿Ya tienes una cuenta?{' '}
            <button onClick={onSwitchToLogin} className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300">
                Inicia Sesión
            </button>
         </p>
      </div>
      {showInviteRequiredModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 text-gray-900 shadow-2xl dark:bg-gray-800 dark:text-gray-100">
            <h3 className="text-xl font-semibold">Se requiere una invitación</h3>
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-300">
              Para crear una cuenta nueva necesitamos confirmar una invitación previa. No encontramos ninguna invitación activa para
              {pendingEmail ? ` ${pendingEmail}` : ' este correo'}.
            </p>
            <div className="mt-4 space-y-2 text-sm text-gray-600 dark:text-gray-300">
              <p>
                ¿Querés explorar la plataforma? Podés ingresar con la cuenta demo desde la opción de iniciar sesión.
              </p>
              <p>
                Si necesitás acceso administrativo, escribinos a{' '}
                <a
                  href="mailto:info@puntolimpio.ar?subject=Solicitud%20de%20invitaci%C3%B3n%20-%20Punto%20Limpio&body=Hola%20equipo%20de%20Punto%20Limpio,%0A%0AMe%20gustar%C3%ADa%20solicitar%20una%20invitaci%C3%B3n%20para%20acceder%20a%20la%20plataforma.%0A%0AGracias!"
                  className="font-semibold text-blue-600 hover:underline dark:text-blue-400"
                >
                  info@puntolimpio.ar
                </a>
                 y coordinamos el alta de tu organización.
              </p>
            </div>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                onClick={handleDemoLoginRedirect}
                className="inline-flex w-full items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-800"
              >
                Ir a Iniciar Sesión (Cuenta Demo)
              </button>
              <button
                onClick={closeInviteModal}
                className="inline-flex w-full items-center justify-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-white dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700 dark:focus:ring-offset-gray-800"
              >
                Seguir editando correo
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Register;