import React, { useState } from 'react';
import { login } from '../services/authService';
import Spinner from './Spinner';

interface LoginProps {
  onSwitchToRegister: () => void;
  isFirebaseConfigured: boolean;
  onBackToLanding?: () => void;
}

const Login: React.FC<LoginProps> = ({ onSwitchToRegister, isFirebaseConfigured, onBackToLanding }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      await login(email, password);
      // onLoginSuccess will be called by the onAuthStateChanged observer in App.tsx
    } catch (err: any) {
      if (err.code) {
        switch (err.code) {
          case 'auth/user-not-found':
          case 'auth/wrong-password':
          case 'auth/invalid-credential':
            setError('El correo electrónico o la contraseña son incorrectos.');
            break;
          default:
            setError('Ocurrió un error inesperado. Por favor, inténtalo de nuevo.');
            break;
        }
      } else {
          setError(err.message || 'Ocurrió un error inesperado.');
      }
      setIsLoading(false);
    }
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
            Iniciar Sesión
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
            Inteligencia en movimiento.
          </p>
        </div>
        <form className="space-y-6" onSubmit={handleLogin}>
          <input type="hidden" name="remember" value="true" />
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email-address" className="sr-only">Correo Electrónico</label>
              <input
                id="email-address"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-gray-200 bg-white dark:bg-gray-700 rounded-t-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Correo Electrónico"
              />
            </div>
            <div>
              <label htmlFor="password" className="sr-only">Contraseña</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 placeholder-gray-500 dark:placeholder-gray-400 text-gray-900 dark:text-gray-200 bg-white dark:bg-gray-700 rounded-b-md focus:outline-none focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm"
                placeholder="Contraseña"
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
              {isLoading ? <Spinner /> : 'Ingresar'}
            </button>
          </div>
        </form>
         {!isFirebaseConfigured && (
            <p className="mt-2 text-center text-xs text-gray-500 dark:text-gray-400">
                Modo Demo: <b className="text-gray-700 dark:text-gray-300">demo@example.com</b> / <b className="text-gray-700 dark:text-gray-300">password</b>
            </p>
         )}
         <p className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
            ¿No tienes una cuenta?{' '}
            <button onClick={onSwitchToRegister} className="font-medium text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300">
                Crear Cuenta
            </button>
         </p>
      </div>
    </div>
  );
};

export default Login;