import React from 'react';
import { useUsageLimits } from '../context/UsageLimitsContext';

const formatDate = (isoDate: string) => {
  try {
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return 'el próximo ciclo';
    return date.toLocaleDateString('es-AR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch (error) {
    console.warn('Invalid reset date received for usage banner', error);
    return 'el próximo ciclo';
  }
};

const UsageQuotaBanner: React.FC = () => {
  const { usageState } = useUsageLimits();

  if (!usageState) return null;

  const { chatRemaining, mediaRemaining, resetAt, period } = usageState;
  const hasChatInfo = typeof chatRemaining === 'number';
  const hasMediaInfo = typeof mediaRemaining === 'number';

  if (!hasChatInfo && !hasMediaInfo) {
    return null;
  }

  const chatLabel = hasChatInfo ? chatRemaining : '—';
  const mediaLabel = hasMediaInfo ? mediaRemaining : '—';
  const isChatDepleted = hasChatInfo && chatRemaining <= 0;
  const isMediaDepleted = hasMediaInfo && mediaRemaining <= 0;
  const resetLabel = resetAt ? formatDate(resetAt) : 'el próximo ciclo';

  const buildStatusClass = (depleted: boolean) =>
    depleted
      ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-400/40 dark:bg-red-900/40 dark:text-red-100'
      : 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-400/40 dark:bg-blue-900/40 dark:text-blue-100';

  return (
    <section className="mx-auto mt-4 max-w-5xl rounded-2xl border border-blue-200 bg-white p-5 shadow-sm transition-all dark:border-blue-500/30 dark:bg-slate-900/60">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-300">Protección de créditos IA</p>
          <h3 className="text-xl font-bold text-blue-700 dark:text-blue-200">Período {period}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-300">El saldo se reinicia {resetLabel}.</p>
        </div>
        <div className="grid w-full gap-3 sm:grid-cols-2">
          <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${buildStatusClass(isChatDepleted)}`}>
            <p className="text-xs uppercase tracking-wide">Asistente (texto)</p>
            <p className="mt-1 text-2xl font-bold">{chatLabel}</p>
            <p className="text-xs text-inherit/80">Créditos restantes</p>
          </div>
          <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${buildStatusClass(isMediaDepleted)}`}>
            <p className="text-xs uppercase tracking-wide">Análisis de imágenes</p>
            <p className="mt-1 text-2xl font-bold">{mediaLabel}</p>
            <p className="text-xs text-inherit/80">Créditos restantes</p>
          </div>
        </div>
      </div>
      {(isChatDepleted || isMediaDepleted) && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-400/40 dark:bg-red-900/40 dark:text-red-100">
          <p className="font-semibold">Créditos agotados</p>
          <p>El análisis remoto se reactivará automáticamente al inicio del próximo ciclo o al asignar nuevos créditos.</p>
        </div>
      )}
    </section>
  );
};

export default UsageQuotaBanner;
