import React, { useState, useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import { Organization, DailyUsage, UserOrInvitation, UserRole, User } from '../types';
import * as db from '../services/databaseService';
import Spinner from './Spinner';
import EditableCell from './EditableCell';
import UserManagement from './UserManagement';

const StatCard: React.FC<{ title: string, value: React.ReactNode, icon: React.ReactNode }> = ({ title, value, icon }) => (
    <div className="bg-gray-50 dark:bg-gray-700/50 p-6 rounded-xl flex items-center space-x-4">
        <div className="bg-blue-100 dark:bg-blue-900 p-3 rounded-full">
            {icon}
        </div>
        <div>
            <p className="text-sm text-gray-500 dark:text-gray-400 font-medium">{title}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
        </div>
    </div>
);

const OrganizationDetails: React.FC<{ 
    organization: Organization; 
    onBack: () => void;
    currentUser: User;
    onUpdateUser: (userId: string, updatedFields: Partial<User>) => Promise<void>;
    onDeleteUser: (userId: string) => void;
    onCancelInvitation: (invitationId: string) => void;
    onInviteUser: (email: string, role: UserRole) => Promise<void>;
}> = ({ organization, onBack, currentUser, ...userManagementProps }) => {
    const [dailyUsage, setDailyUsage] = useState<DailyUsage[] | null>(null);
    const [users, setUsers] = useState<UserOrInvitation[]>([]);
    const chartRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const fetchData = async () => {
            const [usage, userList] = await Promise.all([
                db.getDailyUsageForOrganization(organization.id),
                db.getUsersByOrganization(organization.id)
            ]);
            setDailyUsage(usage);
            setUsers(userList);
        };
        fetchData();
    }, [organization.id]);

    useEffect(() => {
        if (!dailyUsage || !chartRef.current) return;

        const chart = echarts.init(chartRef.current, 'dark');
        chart.setOption({
            tooltip: { trigger: 'axis' },
            xAxis: { type: 'category', data: dailyUsage.map(d => new Date(d.date).toLocaleDateString('es-ES', {day: '2-digit', month: '2-digit'})) },
            yAxis: { type: 'value', name: 'Escaneos' },
            series: [{ name: 'Escaneos IA', type: 'bar', data: dailyUsage.map(d => d.count), itemStyle: { color: '#3b82f6' } }],
            grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        });

        const resizeHandler = () => chart.resize();
        window.addEventListener('resize', resizeHandler);
        return () => {
            window.removeEventListener('resize', resizeHandler);
            chart.dispose();
        };
    }, [dailyUsage]);

    return (
        <div className="space-y-8">
            <button onClick={onBack} className="flex items-center space-x-2 text-blue-600 dark:text-blue-400 font-semibold hover:underline">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                <span>Volver a la lista</span>
            </button>
            <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">Detalles de: <span className="text-blue-600">{organization.name}</span></h1>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Artículos Gestionados" value={organization.itemCount ?? 0} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>} />
                <StatCard title="Usuarios Totales" value={organization.userCount ?? 0} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>} />
                <StatCard title="Uso de IA (30d)" value={organization.iaScans30d ?? 0} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m12.728 12.728l-.707-.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>} />
                <StatCard title="Transacciones (30d)" value={organization.transactions30d ?? 0} icon={<svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m-15.357-2a8.001 8.001 0 0115.357-2m0 0H15" /></svg>} />
            </div>

            <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-2xl shadow-lg">
                <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-6">Uso Diario de IA (Escaneos en los últimos 30 días)</h2>
                {dailyUsage ? (
                    <div ref={chartRef} style={{ width: '100%', height: '400px' }}></div>
                ) : (
                    <div className="flex justify-center items-center h-96"><Spinner /></div>
                )}
            </div>
            
            <UserManagement 
                currentUser={currentUser} 
                users={users} 
                {...userManagementProps}
            />

        </div>
    );
};

interface SuperAdminDashboardProps {
  onSetupNewOrganization: (orgName: string, adminEmail: string) => Promise<void>;
  onUpdateOrganization: (orgId: string, updatedFields: Partial<Organization>) => Promise<void>;
  onDeleteOrganization: (orgId: string) => void;
  onViewOrganization: (orgId: string) => void;
  currentUser: User;
  onUpdateUser: (userId: string, updatedFields: Partial<User>) => Promise<void>;
  onDeleteUser: (userId: string) => void;
  onCancelInvitation: (invitationId: string) => void;
  onInviteUser: (email: string, role: UserRole) => Promise<void>;
}

const SuperAdminDashboard: React.FC<SuperAdminDashboardProps> = ({ 
    onSetupNewOrganization, onUpdateOrganization, onDeleteOrganization, onViewOrganization, ...userManagementProps
}) => {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState<React.ReactNode | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [newOrgName, setNewOrgName] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);

  const fetchData = async () => {
    setIsLoading(true);
    setDashboardError(null);
    try {
      const orgs = await db.getOrganizationsWithUsageStats();
      setOrganizations(orgs);
    } catch (err: any) {
      console.error("Failed to fetch data:", err);
      const errorMessage = err.message || '';
      if (errorMessage.includes('index')) {
        const urlMatch = errorMessage.match(/https?:\/\/[^\s]+/);
        if (urlMatch) {
          setDashboardError(
            <div className="p-4 bg-red-100 dark:bg-red-900/50 border-l-4 border-red-500 text-red-800 dark:text-red-200 rounded-r-lg">
              <p className="font-bold">Acción Requerida: Falta un Índice en la Base de Datos</p>
              <p className="text-sm">Una consulta necesaria para las métricas de la plataforma falló. Por favor, crea el índice requerido en Firestore.</p>
              <a href={urlMatch[0]} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block font-bold text-blue-600 dark:text-blue-400 hover:underline">
                Haz clic aquí para crearlo
              </a>
            </div>
          );
        } else {
          setDashboardError("No se pudieron cargar los datos de la plataforma: se requiere un índice en la base de datos.");
        }
      } else {
        setDashboardError("No se pudieron cargar los datos de la plataforma.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedOrg) {
      fetchData();
    }
  }, [selectedOrg]);

  const handleAddSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newOrgName.trim() || !adminEmail.trim() || isSubmitting) return;
      
      setIsSubmitting(true);
      setFormError(null);
      try {
          await onSetupNewOrganization(newOrgName, adminEmail);
          setNewOrgName('');
          setAdminEmail('');
          await fetchData();
      } catch (err: any) {
          setFormError(err.message || 'No se pudo crear la organización.');
      } finally {
          setIsSubmitting(false);
      }
  }
  
  if (selectedOrg) {
    return <OrganizationDetails 
                organization={selectedOrg} 
                onBack={() => setSelectedOrg(null)} 
                {...userManagementProps}
            />;
  }

  return (
    <div className="space-y-8">
        <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">Panel de Control de la Plataforma</h1>

        {dashboardError && <div className="mt-4">{dashboardError}</div>}

        <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-2xl shadow-lg">
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 mb-6">Crear Nueva Organización</h2>
            <form onSubmit={handleAddSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <input type="text" value={newOrgName} onChange={e => setNewOrgName(e.target.value)} placeholder="Nombre de la nueva organización" className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"/>
                    <input type="email" value={adminEmail} onChange={e => setAdminEmail(e.target.value)} placeholder="Email del Administrador" required className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500"/>
                     <button type="submit" disabled={isSubmitting || !newOrgName.trim() || !adminEmail.trim()} className="w-full flex justify-center items-center px-6 py-2 border border-transparent text-base font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 dark:disabled:bg-blue-800 flex-shrink-0">
                        {isSubmitting ? <Spinner /> : 'Crear e Invitar'}
                     </button>
                </div>
            </form>
            {formError && <p className="text-red-500 mt-4">{formError}</p>}
        </div>

        <div className="bg-white dark:bg-gray-800 p-6 md:p-8 rounded-2xl shadow-lg">
        <h3 className="text-xl font-bold text-gray-700 dark:text-gray-300 mb-4">Organizaciones Registradas</h3>
        <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700/50">
                <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Nombre</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Artículos</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Uso IA (30d)</th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Transacciones (30d)</th>
                    <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Acciones</th>
                </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {isLoading && !dashboardError ? (
                <tr><td colSpan={5} className="text-center py-4"><Spinner /></td></tr>
                ) : organizations.filter(org => org.name !== 'Plataforma de Administración').length > 0 ? (
                organizations.filter(org => org.name !== 'Plataforma de Administración').map(org => (
                    <tr key={org.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                        <button onClick={() => setSelectedOrg(org)} className="text-blue-600 dark:text-blue-400 hover:underline font-semibold text-left">
                            {org.name}
                        </button>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{org.itemCount}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-gray-700 dark:text-gray-200">{org.iaScans30d}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{org.transactions30d}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-4">
                        <button onClick={() => onViewOrganization(org.id)} className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300 font-semibold">Entrar</button>
                        <button onClick={() => onDeleteOrganization(org.id)} className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300 font-semibold">Eliminar</button>
                    </td>
                    </tr>
                ))
                ) : (
                <tr><td colSpan={5} className="text-center py-4 text-gray-500 dark:text-gray-400">No se encontraron organizaciones.</td></tr>
                )}
            </tbody>
            </table>
        </div>
        </div>
    </div>
  );
};

export default SuperAdminDashboard;