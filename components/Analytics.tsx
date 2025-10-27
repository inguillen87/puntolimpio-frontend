import React, { useMemo, useRef, useEffect } from 'react';
import * as echarts from 'echarts';
import { Item, Transaction, AnalyticsData, TransactionType, ItemType, ControlRecord, ItemSize, Partner } from '../types';
import { normalizePartnerName } from '../utils/itemNormalization';

// --- Configuration Constants ---
const CHAPA_ESTIMATED_VALUE = 25; 
const MODULO_ESTIMATED_VALUE = 15;
const LEAD_TIME_DAYS = 7;
const SAFETY_STOCK_DAYS = 3; 
const STOCK_FLOW_DAYS = 30; // Analyze flow for the last 30 days


const calculateAnalytics = (items: Item[], transactions: Transaction[], controlRecords: ControlRecord[], partners: Partner[]): AnalyticsData => {
    if (items.length === 0) return {} as AnalyticsData;

    const stockMap = new Map<string, number>();
    items.forEach(item => stockMap.set(item.id, 0));
    transactions.forEach(tx => {
        const stock = stockMap.get(tx.itemId) || 0;
        stockMap.set(tx.itemId, stock + (tx.type === TransactionType.INCOME ? tx.quantity : -tx.quantity));
    });
    
    const itemMap = new Map(items.map(item => [item.id, item]));
    const today = new Date();
    const thirtyDaysAgo = new Date(new Date().setDate(today.getDate() - 30));

    const totalStock = Array.from(stockMap.values()).reduce((sum, stock) => sum + stock, 0);

    const getItemValue = (item?: Item) => item?.cost ?? (item?.type === ItemType.CHAPA ? CHAPA_ESTIMATED_VALUE : MODULO_ESTIMATED_VALUE);

    const totalValue = items.reduce((acc, item) => {
        const stock = stockMap.get(item.id) || 0;
        return acc + (stock * getItemValue(item));
    }, 0);
    
    // --- Historical Data for KPIs (30 days) ---
    const transactionsLast30Days = transactions.filter(tx => new Date(tx.createdAt) > thirtyDaysAgo);
    const stockLast30DaysStart = items.reduce((acc, item) => {
        const currentStock = stockMap.get(item.id) || 0;
        const netChange = transactionsLast30Days
            .filter(tx => tx.itemId === item.id)
            .reduce((sum, tx) => sum + (tx.type === TransactionType.INCOME ? tx.quantity : -tx.quantity), 0);
        return acc + (currentStock - netChange);
    }, 0);

    const valueLast30DaysStart = items.reduce((acc, item) => {
        const startStock = (stockMap.get(item.id) || 0) - transactionsLast30Days
            .filter(tx => tx.itemId === item.id)
            .reduce((sum, tx) => sum + (tx.type === TransactionType.INCOME ? tx.quantity : -tx.quantity), 0);
        return acc + (startStock * getItemValue(item));
    }, 0);

    const outcomeLast30Days = transactions
        .filter(tx => tx.type === TransactionType.OUTCOME && new Date(tx.createdAt) > thirtyDaysAgo)
        .reduce((sum, tx) => sum + tx.quantity, 0);
    
    const avgDailyConsumption = outcomeLast30Days / 30;
    const daysOnHand = avgDailyConsumption > 0 ? totalStock / avgDailyConsumption : 0;
    
    const outcomeLast60to30Days = transactions
        .filter(tx => tx.type === TransactionType.OUTCOME && new Date(tx.createdAt) < thirtyDaysAgo && new Date(tx.createdAt) > new Date(new Date().setDate(today.getDate() - 60)))
        .reduce((sum, tx) => sum + tx.quantity, 0);
    const avgDailyConsumptionPrev = outcomeLast60to30Days / 30;
    const daysOnHandPrev = avgDailyConsumptionPrev > 0 ? stockLast30DaysStart / avgDailyConsumptionPrev : 0;
    
    const calcChange = (current: number, previous: number) => previous > 0 ? ((current - previous) / previous) * 100 : (current > 0 ? 100 : 0);
    
    const kpiTrends: AnalyticsData['kpiTrends'] = {
        totalStock: { change: parseFloat(calcChange(totalStock, stockLast30DaysStart).toFixed(1)), direction: totalStock > stockLast30DaysStart ? 'up' : (totalStock < stockLast30DaysStart ? 'down' : 'steady') },
        stockValue: { change: parseFloat(calcChange(totalValue, valueLast30DaysStart).toFixed(1)), direction: totalValue > valueLast30DaysStart ? 'up' : (totalValue < valueLast30DaysStart ? 'down' : 'steady') },
        daysOnHand: { change: parseFloat(calcChange(daysOnHand, daysOnHandPrev).toFixed(1)), direction: daysOnHand > daysOnHandPrev ? 'up' : (daysOnHand < daysOnHandPrev ? 'down' : 'steady') },
    };
    
    const reorderPoints = items.map(item => {
        const itemOutcomesLast30 = transactions
            .filter(tx => tx.itemId === item.id && tx.type === TransactionType.OUTCOME && new Date(tx.createdAt) > thirtyDaysAgo)
            .reduce((sum, tx) => sum + tx.quantity, 0);
        const avgDaily = itemOutcomesLast30 / 30;
        const reorderPoint = Math.ceil((avgDaily * LEAD_TIME_DAYS) + (avgDaily * SAFETY_STOCK_DAYS));
        return { name: item.name, reorderPoint, currentStock: stockMap.get(item.id) || 0 };
    }).filter(item => item.currentStock < item.reorderPoint && item.reorderPoint > 0);
    
    const lowStockItems = items
        .map(item => ({...item, stock: stockMap.get(item.id) || 0}))
        .filter(item => item.stock <= (reorderPoints.find(rp => rp.name === item.name)?.reorderPoint || 0) || item.stock <= 5)
        .sort((a,b) => a.stock - b.stock);

    const itemFlow = items.map(item => {
        const income = transactions.filter(t => t.itemId === item.id && t.type === TransactionType.INCOME).reduce((s,t) => s + t.quantity, 0);
        const outcome = transactions.filter(t => t.itemId === item.id && t.type === TransactionType.OUTCOME).reduce((s,t) => s + t.quantity, 0);
        return { name: item.name, income, outcome };
    });
    
    const avgTotalIncome = itemFlow.length > 0 ? itemFlow.reduce((s,i) => s + i.income, 0) / itemFlow.length : 0;
    const avgTotalOutcome = itemFlow.length > 0 ? itemFlow.reduce((s,i) => s + i.outcome, 0) / itemFlow.length : 0;
    
    const productPerformance = {
        criticalMaterials: itemFlow.filter(i => i.income > avgTotalIncome && i.outcome > avgTotalOutcome).map(i => i.name),
        strategicAccumulation: itemFlow.filter(i => i.income > avgTotalIncome && i.outcome <= avgTotalOutcome).map(i => i.name),
        opportunities: itemFlow.filter(i => i.income <= avgTotalIncome && i.outcome > avgTotalOutcome).map(i => i.name),
        lowRotation: itemFlow.filter(i => i.income <= avgTotalIncome && i.outcome <= avgTotalOutcome).map(i => i.name),
    };

    // Stock Flow for Bar Chart
    const stockFlow: { date: string, income: number, outcome: number }[] = [];
    for (let i = STOCK_FLOW_DAYS - 1; i >= 0; i--) {
        const date = new Date();
        date.setDate(today.getDate() - i);
        const dateString = date.toISOString().split('T')[0];
        const income = transactions.filter(t => t.createdAt.startsWith(dateString) && t.type === 'INCOME').reduce((s,t) => s + t.quantity, 0);
        const outcome = transactions.filter(t => t.createdAt.startsWith(dateString) && t.type === 'OUTCOME').reduce((s,t) => s + t.quantity, 0);
        stockFlow.push({ date: date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }), income, outcome });
    }

    const partnerLookup = new Map(partners.map(p => [p.id, p.name]));

    const topDestinationsAccumulator = transactions
        .filter(tx => tx.type === 'OUTCOME')
        .reduce((acc, tx) => {
            const partnerName = tx.partnerId ? partnerLookup.get(tx.partnerId) : undefined;
            const destinationName = partnerName || tx.destination;
            if (!destinationName) {
                return acc;
            }
            const normalizedDestination = normalizePartnerName(destinationName);
            const key = normalizedDestination.toLowerCase();
            if (!acc[key]) {
                acc[key] = { destination: normalizedDestination, quantity: 0 };
            }
            acc[key].quantity += tx.quantity;
            return acc;
        }, {} as Record<string, { destination: string; quantity: number }>);

    const topDestinationsByVolume = Object.values(topDestinationsAccumulator)
        .sort((a, b) => b.quantity - a.quantity)
        .slice(0, 5);
    
    const stockByType = items.reduce((acc, item) => {
        const stock = stockMap.get(item.id) || 0;
        const value = stock * getItemValue(item);
        const current = acc.find(s => s.type === item.type);
        if (current) {
            current.quantity += stock;
            current.value += value;
        } else {
            acc.push({ type: item.type, quantity: stock, value });
        }
        return acc;
    }, [] as { type: ItemType; quantity: number; value: number }[]);

    const totalKitsSold = controlRecords.reduce((sum, record) => sum + record.quantity, 0);
    
    // Logistics Suggestions
    const itemRotation = items.map(item => {
        const rotation = transactions
            .filter(tx => tx.itemId === item.id && tx.type === TransactionType.OUTCOME && new Date(tx.createdAt) > thirtyDaysAgo)
            .reduce((sum, tx) => sum + tx.quantity, 0);
        return { ...item, rotation };
    });

    const logisticsSuggestions = itemRotation
        .filter(item => item.rotation > (avgTotalOutcome * 0.5) && (item.size === ItemSize.GRANDE || (item.weight || 0) > 10))
        .sort((a, b) => b.rotation - a.rotation)
        .map(item => ({
            itemName: item.name,
            reason: `Alta rotación y ${item.size === ItemSize.GRANDE ? 'gran tamaño' : 'peso elevado'}.`,
            rotation: item.rotation,
            size: item.size,
            weight: item.weight,
        }));
    
    const executiveSummary = `Análisis estratégico: Con un valor de inventario de $${totalValue.toLocaleString('es-ES', { maximumFractionDigits: 0 })} (${kpiTrends.stockValue.change > 0 ? '+' : ''}${kpiTrends.stockValue.change.toFixed(1)}% vs. período anterior), se identifican ${lowStockItems.length} artículos en niveles críticos que requieren reabastecimiento. La optimización logística sugiere reubicar ${logisticsSuggestions.length} artículos de alta rotación para mejorar la eficiencia del despacho. El principal consumidor de materiales es "${topDestinationsByVolume[0]?.destination || 'N/A'}".`;
    
    return {
        executiveSummary, totalStock, kpiTrends, totalValue, stockByType, daysOnHand,
        lowStockItems, reorderPoints, productPerformance, stockFlow, topDestinationsByVolume, totalKitsSold, logisticsSuggestions,
        avgItemValue: totalStock > 0 ? totalValue / totalStock : 0,
        monthlyGrowth: [], inventoryTurnover: 0, demandForecast: { total: outcomeLast30Days },
    };
};

const Card: React.FC<{ title: string, children: React.ReactNode, className?: string }> = ({ title, children, className }) => (
    <div className={`bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg ${className}`}>
        <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4">{title}</h3>
        {children}
    </div>
);

const KpiCard: React.FC<{ title: string, value: string, trend: { change: number, direction: 'up' | 'down' | 'steady' }, unit?: string, tooltip?: string }> = ({ title, value, trend, unit, tooltip }) => {
    const trendColor = trend.direction === 'up' ? 'text-green-600 dark:text-green-400' : trend.direction === 'down' ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400';
    const trendIcon = trend.direction === 'up' ? '▲' : trend.direction === 'down' ? '▼' : '▬';
    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-2xl shadow-lg">
            <div className="flex items-center justify-between">
                 <h4 className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</h4>
                 {tooltip && (
                    <div className="relative group">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400 dark:text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        <div className="absolute bottom-full mb-2 w-64 bg-gray-800 text-white text-xs rounded py-2 px-3 right-0 transform translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 z-10 pointer-events-none">
                            {tooltip}
                        </div>
                    </div>
                 )}
            </div>
            <p className="text-3xl font-semibold text-gray-900 dark:text-gray-100 mt-1">{value} <span className="text-base font-normal">{unit}</span></p>
            <p className={`text-sm font-semibold mt-2 ${trendColor}`}>{trendIcon} {Math.abs(trend.change)}% vs 30 días</p>
        </div>
    );
};

interface AnalyticsProps {
    items: Item[];
    transactions: Transaction[];
    controlRecords: ControlRecord[];
    partners: Partner[];
    isLoading: boolean;
    theme: 'light' | 'dark';
    onExportPdf: (data: AnalyticsData) => void;
    onExportExcel?: (data: AnalyticsData) => void;
}

const Analytics: React.FC<AnalyticsProps> = ({ items, transactions, controlRecords, partners, isLoading, theme, onExportPdf, onExportExcel }) => {
    const data = useMemo(() => calculateAnalytics(items, transactions, controlRecords, partners), [items, transactions, controlRecords, partners]);
    
    const stockFlowChartRef = useRef<HTMLDivElement>(null);
    const stockByTypeChartRef = useRef<HTMLDivElement>(null);
    const chartTheme = theme === 'dark' ? 'dark' : 'light';

    useEffect(() => {
        if (isLoading || !data.totalStock) return;

        const charts = [
             { ref: stockFlowChartRef, options: getStockFlowOptions(data.stockFlow) },
             { ref: stockByTypeChartRef, options: getStockByTypeOptions(data.stockByType) },
        ];
        
        let instances: any[] = [];
        charts.forEach(({ ref, options }) => {
            if (ref.current) {
                const chart = echarts.init(ref.current, chartTheme);
                chart.setOption(options);
                instances.push(chart);
            }
        });
        
        const resizeHandler = () => instances.forEach(chart => chart.resize());
        window.addEventListener('resize', resizeHandler);

        return () => {
            window.removeEventListener('resize', resizeHandler);
            instances.forEach(chart => chart.dispose());
        };
    }, [data, isLoading, theme]);

    if (isLoading) {
        return <div className="text-center p-8 text-gray-500 dark:text-gray-400">Calculando métricas...</div>;
    }
    
    if (!data.totalStock) {
        return <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-lg text-center text-gray-600 dark:text-gray-300">No hay suficientes datos para generar métricas. Por favor, registra algunas transacciones.</div>
    }

    return (
        <div className="space-y-8">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
                <h1 className="text-3xl font-bold text-gray-800 dark:text-gray-100">Métricas Clave</h1>
                <div className="mt-4 sm:mt-0 flex flex-col sm:flex-row gap-2">
                    <button onClick={() => onExportPdf(data)} className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v3.586l-1.293-1.293a1 1 0 10-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 11.586V8z" clipRule="evenodd" /></svg>
                        <span>Exportar PDF</span>
                    </button>
                    {onExportExcel && (
                        <button onClick={() => onExportExcel(data)} className="bg-green-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-green-700 transition-colors flex items-center space-x-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M4 3a1 1 0 00-1 1v12a1 1 0 001 1h12a1 1 0 001-1V4a1 1 0 00-1-1H4zm1 2h10v2H5V5zm0 4h4v2H5V9zm0 4h4v2H5v-2zm6-4h4v2h-4V9zm0 4h4v2h-4v-2z" /></svg>
                            <span>Exportar Excel</span>
                        </button>
                    )}
                </div>
            </div>
            
            <Card title="Resumen Ejecutivo (IA)">
                <p className="text-gray-600 dark:text-gray-300">{data.executiveSummary}</p>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <KpiCard title="Valor Total de Stock" value={`$${data.totalValue.toLocaleString('es-ES', { maximumFractionDigits: 0 })}`} trend={data.kpiTrends.stockValue} />
                <KpiCard title="Unidades Totales" value={data.totalStock.toLocaleString()} trend={data.kpiTrends.totalStock} unit="unidades" />
                <KpiCard title="Días de Inventario" value={data.daysOnHand.toFixed(0)} unit="días" trend={data.kpiTrends.daysOnHand} tooltip="Estimación de cuántos días durará el stock actual al ritmo de consumo de los últimos 30 días." />
                <KpiCard title="Kits Entregados (Control)" value={data.totalKitsSold.toLocaleString()} trend={{change: 0, direction: 'steady'}} unit="kits" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Card title={`Flujo de Stock (Últimos ${STOCK_FLOW_DAYS} días)`}>
                    <div ref={stockFlowChartRef} style={{ width: '100%', height: '300px' }}></div>
                </Card>
                <Card title="Distribución de Stock por Tipo">
                    <div ref={stockByTypeChartRef} style={{ width: '100%', height: '300px' }}></div>
                </Card>
            </div>

            <Card title="Optimización Logística (Slotting)">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Recomendación para ubicar artículos de alta rotación, pesados o voluminosos cerca de la zona de despacho para minimizar tiempos y esfuerzos.</p>
                <div className="overflow-x-auto max-h-80">
                     <table className="min-w-full">
                        <thead className="bg-gray-50 dark:bg-gray-700/50">
                            <tr>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Artículo a Mover</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Razón</th>
                                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Rotación (30d)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                           {data.logisticsSuggestions.length > 0 ? data.logisticsSuggestions.map(item => (
                                <tr key={item.itemName} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                    <td className="px-4 py-2 font-medium">{item.itemName}</td>
                                    <td className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300">{item.reason}</td>
                                    <td className="px-4 py-2 font-semibold">{item.rotation} unidades</td>
                                </tr>
                            )) : <tr><td colSpan={3} className="text-center py-4 text-gray-500 dark:text-gray-400">No hay sugerencias de optimización por el momento.</td></tr>}
                        </tbody>
                     </table>
                 </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                 <Card title="Ítems con Stock Bajo (Acción Requerida)">
                     <div className="overflow-x-auto max-h-80">
                         <table className="min-w-full">
                            <thead className="bg-gray-50 dark:bg-gray-700/50">
                                <tr>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Artículo</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Stock Actual</th>
                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-300">Punto de Reorden</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                {data.reorderPoints.length > 0 ? data.reorderPoints.map(item => (
                                    <tr key={item.name} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                                        <td className="px-4 py-2 font-medium">{item.name}</td>
                                        <td className="px-4 py-2 font-bold text-red-600 dark:text-red-400">{item.currentStock}</td>
                                        <td className="px-4 py-2">{item.reorderPoint}</td>
                                    </tr>
                                )) : <tr><td colSpan={3} className="text-center py-4 text-gray-500 dark:text-gray-400">¡Excelente! Ningún ítem por debajo del punto de reorden.</td></tr>}
                            </tbody>
                         </table>
                     </div>
                 </Card>
                 <Card title="Top 5 Destinos por Volumen">
                    <ul className="space-y-3">
                        {data.topDestinationsByVolume.map(dest => (
                             <li key={dest.destination} className="flex justify-between items-center">
                                <span className="font-medium text-gray-700 dark:text-gray-300">{dest.destination}</span>
                                <span className="font-bold text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/50 px-3 py-1 rounded-full text-sm">{dest.quantity} unidades</span>
                            </li>
                        ))}
                    </ul>
                 </Card>
            </div>
            
            <Card title="Clasificación Estratégica de Materiales">
                 <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Análisis del ciclo de vida del inventario para identificar el rol de cada material en la operación.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="bg-blue-50 dark:bg-blue-900/50 p-4 rounded-lg">
                        <h4 className="font-bold text-blue-800 dark:text-blue-200">Materiales Críticos</h4>
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 mb-2">Alta rotación y consumo. Vitales para la operación.</p>
                        <p className="text-xs text-blue-700 dark:text-blue-300 font-semibold">{data.productPerformance.criticalMaterials.join(', ') || 'Ninguno'}</p>
                    </div>
                    <div className="bg-green-50 dark:bg-green-900/50 p-4 rounded-lg">
                        <h4 className="font-bold text-green-800 dark:text-green-200">Acumulación Estratégica</h4>
                        <p className="text-xs text-green-600 dark:text-green-400 mt-1 mb-2">Ingresan en gran volumen, consumo moderado.</p>
                        <p className="text-xs text-green-700 dark:text-green-300 font-semibold">{data.productPerformance.strategicAccumulation.join(', ') || 'Ninguno'}</p>
                    </div>
                    <div className="bg-yellow-50 dark:bg-yellow-900/50 p-4 rounded-lg">
                        <h4 className="font-bold text-yellow-800 dark:text-yellow-200">Oportunidades</h4>
                        <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1 mb-2">Alto consumo pero bajo ingreso. Riesgo de quiebre.</p>
                        <p className="text-xs text-yellow-700 dark:text-yellow-300 font-semibold">{data.productPerformance.opportunities.join(', ') || 'Ninguno'}</p>
                    </div>
                    <div className="bg-red-50 dark:bg-red-900/50 p-4 rounded-lg">
                        <h4 className="font-bold text-red-800 dark:text-red-200">Baja Rotación</h4>
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1 mb-2">Poco movimiento. Capital y espacio inmovilizado.</p>
                        <p className="text-xs text-red-700 dark:text-red-300 font-semibold">{data.productPerformance.lowRotation.join(', ') || 'Ninguno'}</p>
                    </div>
                </div>
            </Card>

        </div>
    );
};

// --- ECharts Options ---
const getStockFlowOptions = (data: AnalyticsData['stockFlow']) => ({
    tooltip: { trigger: 'axis' },
    legend: { data: ['Ingresos', 'Egresos'] },
    xAxis: { type: 'category', data: data.map(d => d.date) },
    yAxis: { type: 'value' },
    series: [
        { name: 'Ingresos', type: 'bar', stack: 'total', data: data.map(d => d.income), itemStyle: { color: '#22c55e' } },
        { name: 'Egresos', type: 'bar', stack: 'total', data: data.map(d => d.outcome), itemStyle: { color: '#ef4444' } }
    ]
});

const getStockByTypeOptions = (data: AnalyticsData['stockByType']) => ({
    tooltip: {
        trigger: 'item',
        formatter: '{b}: {c} unidades ({d}%)'
    },
    legend: {
        orient: 'vertical',
        left: 'left',
        top: 'center',
        data: data.map(d => d.type),
    },
    series: [{
        name: 'Stock por Tipo',
        type: 'pie',
        radius: ['50%', '75%'], // Donut chart
        center: ['65%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: {
            borderRadius: 12,
            borderColor: 'rgba(255, 255, 255, 0.5)',
            borderWidth: 4,
            shadowBlur: 20,
            shadowColor: 'rgba(0, 0, 0, 0.3)'
        },
        label: {
            show: false,
            position: 'center'
        },
        emphasis: {
             label: {
                show: true,
                fontSize: 22,
                fontWeight: 'bold',
                formatter: '{b}\\n{c}',
            },
            itemStyle: {
                shadowBlur: 30,
                shadowOffsetX: 0,
                shadowOffsetY: 0,
                shadowColor: 'rgba(0, 0, 0, 0.5)'
            }
        },
        labelLine: {
            show: false
        },
        data: data.map(d => ({ value: d.quantity, name: d.type })),
    }]
});

export default Analytics;