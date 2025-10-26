import React, { useState } from 'react';
import { registerUser } from '../services/authService';
import Spinner from './Spinner';

interface RegisterProps {
  onSwitchToLogin: () => void;
}

const Register: React.FC<RegisterProps> = ({ onSwitchToLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

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
      await registerUser(email, password);
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

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 space-y-8">
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
    </div>
  );
};

export default Register;