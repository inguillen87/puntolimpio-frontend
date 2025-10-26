import React, { useState } from 'react';
import { User, UserRole, UserOrInvitation } from '../types';
import Spinner from './Spinner';

interface UserManagementProps {
  currentUser: User;
  users: UserOrInvitation[];
  onUpdateUser: (userId: string, updatedFields: Partial<User>) => Promise<void>;
  onDeleteUser: (userId: string) => void;
  onCancelInvitation: (invitationId: string) => void;
  onInviteUser: (email: string, role: UserRole) => Promise<void>;
}

const UserManagement: React.FC<UserManagementProps> = ({ 
    currentUser, users, onUpdateUser, onDeleteUser, onCancelInvitation, onInviteUser 
}) => {
  const isSuperAdminView = currentUser.role === UserRole.SUPER_ADMIN;

  const getDefaultRole = () => {
    return isSuperAdminView ? UserRole.SUPER_ADMIN : UserRole.OPERATOR;
  };
  
  const [newEmail, setNewEmail] = useState('');
  const [newRole, setNewRole] = useState<UserRole>(getDefaultRole());
  const [isInviting, setIsInviting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRoleChange = (userId: string, newRole: UserRole) => {
    onUpdateUser(userId, { role: newRole });
  };
  
  const handleInvite = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newEmail.trim() || isInviting) return;

      setIsInviting(true);
      setError(null);
      try {
          await onInviteUser(newEmail, newRole);
          setNewEmail('');
          setNewRole(getDefaultRole());
      } catch (err: any) {
          setError(err.message || 'No se pudo enviar la invitación.');
      } finally {
          setIsInviting(false);
      }
  }

  return (
    <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-2xl shadow-lg">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 mb-2">
        {isSuperAdminView ? 'Gestión de Administradores' : 'Gestión de Usuarios'}
      </h2>
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">
        {isSuperAdminView 
            ? 'Administra los super administradores de la plataforma.'
            : 'Administra los miembros y los roles de tu organización.'}
      </p>
      
       <div className="bg-blue-50 dark:bg-gray-700/50 p-4 rounded-lg mb-6">
        <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">Invitar Nuevo Usuario</h4>
        <form onSubmit={handleInvite} className="space-y-4">
            <div className="flex flex-col sm:flex-row items-center gap-4">
                 <input
                    type="email"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    placeholder="Email del nuevo usuario"
                    required
                    className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                 <select
                    value={newRole}
                    onChange={e => setNewRole(e.target.value as UserRole)}
                    className="w-full sm:w-64 px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {isSuperAdminView ? (
                    <option value={UserRole.SUPER_ADMIN}>Super Admin</option>
                  ) : (
                    <>
                      <option value={UserRole.OPERATOR}>Operador</option>
                      <option value={UserRole.WAREHOUSE_MANAGER}>Gerente de Almacén</option>
                      <option value={UserRole.ORG_ADMIN}>Org Admin</option>
                    </>
                  )}
                 </select>
                 <button
                    type="submit"
                    disabled={isInviting || !newEmail.trim()}
                    className="w-full sm:w-auto flex justify-center items-center px-6 py-2 border border-transparent font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 dark:disabled:bg-blue-800 flex-shrink-0"
                >
                    {isInviting ? <Spinner /> : 'Invitar Usuario'}
                 </button>
            </div>
             {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
        </form>
       </div>

      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-700/50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Usuario</th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Rol</th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Acciones</th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {users.map(userOrInvite => {
              const { id, email, role } = userOrInvite;
              const isInvitation = 'isInvitation' in userOrInvite && userOrInvite.isInvitation;
              const isCurrentUser = !isInvitation && id === currentUser.id;
              
              const canEdit = isSuperAdminView || (currentUser.role === UserRole.ORG_ADMIN && role !== UserRole.ORG_ADMIN && role !== UserRole.SUPER_ADMIN);

              return (
                <tr key={id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">{email} {isCurrentUser && '(Tú)'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                    {isInvitation ? (
                        <span className="px-2 inline-flex text-xs leading-5 font-semibold rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                            Invitación Pendiente ({role})
                        </span>
                    ) : canEdit && !isCurrentUser ? (
                      <select
                        value={role}
                        onChange={(e) => handleRoleChange(id, e.target.value as UserRole)}
                        className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                      >
                        {isSuperAdminView ? (
                          <>
                            <option value={UserRole.SUPER_ADMIN}>Super Admin</option>
                            <option value={UserRole.ORG_ADMIN}>Org Admin</option>
                          </>
                        ) : (
                          <>
                            <option value={UserRole.WAREHOUSE_MANAGER}>Gerente de Almacén</option>
                            <option value={UserRole.OPERATOR}>Operador</option>
                            <option value={UserRole.ORG_ADMIN}>Org Admin</option>
                          </>
                        )}
                      </select>
                    ) : (
                      <span className="px-2 py-1">{role}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    {!isCurrentUser && (canEdit || isInvitation) && (
                      <button 
                        onClick={() => isInvitation ? onCancelInvitation(id) : onDeleteUser(id)} 
                        className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                      >
                        {isInvitation ? 'Cancelar Invitación' : 'Eliminar'}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default UserManagement;