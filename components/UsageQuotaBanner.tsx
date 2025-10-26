import React from 'react';
import { useUsageLimits } from '../context/UsageLimitsContext';

const formatDate = (isoDate: string) => {
  try {
    const date = new Date(isoDate);
    if (Number.isNaN(date.getTime())) return 'próximo ciclo';
    return date.toLocaleDateString('es-AR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch (error) {
    console.warn('Invalid reset date received for usage banner', error);
    return 'próximo ciclo';
  }
};

const UsageQuotaBanner: React.FC = () => {
  const { usageState, requestUpgrade } = useUsageLimits();

  if (!usageState) return null;

  const { monthlyQuota, used, remaining, planName, resetsOn, degradeMode, degradeReason, counters, upgradeRequestedAt, dailyQuota, perMinuteQuota } = usageState;
  const usagePercentage = monthlyQuota === 0 ? 0 : Math.min((used / monthlyQuota) * 100, 100);
  const resetLabel = formatDate(resetsOn);
  const progressBarClass = degradeMode
    ? 'bg-red-500'
    : usagePercentage >= 90
      ? 'bg-orange-500'
      : 'bg-blue-500';

  const guardrailText: string[] = [];
  if (dailyQuota) {
    guardrailText.push(`Límite diario ${dailyQuota.toLocaleString('es-AR')} llamadas`);
  }
  if (perMinuteQuota) {
    guardrailText.push(`Máx ${perMinuteQuota.toLocaleString('es-AR')} req/min`);
  }

  return (
    <section
      className={`mx-auto mt-4 max-w-5xl rounded-2xl border ${degradeMode ? 'border-red-300 bg-red-50 dark:border-red-500/40 dark:bg-red-900/30' : 'border-blue-200 bg-white dark:border-blue-500/30 dark:bg-slate-900/60'} p-5 shadow-sm transition-all`}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-300">Plan de análisis remoto</p>
          <h3 className={`text-xl font-bold ${degradeMode ? 'text-red-600 dark:text-red-300' : 'text-blue-700 dark:text-blue-300'}`}>{planName}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {used.toLocaleString('es-AR')} de {monthlyQuota.toLocaleString('es-AR')} escaneos remotos usados · reinicia {resetLabel}
          </p>
          {guardrailText.length > 0 && (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{guardrailText.join(' · ')}</p>
          )}
        </div>
        <div className="flex flex-col gap-2 text-sm text-gray-600 dark:text-gray-200">
          <span>Escaneos de documentos: {counters.documentScans.toLocaleString('es-AR')}</span>
          <span>Sesiones del asistente: {counters.assistantSessions.toLocaleString('es-AR')}</span>
          <span>Saldo disponible: {Math.max(remaining, 0).toLocaleString('es-AR')}</span>
        </div>
      </div>
      <div className="mt-4 h-3 w-full rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className={`${progressBarClass} h-3 rounded-full transition-all`}
          style={{ width: `${usagePercentage}%` }}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={usagePercentage}
        />
      </div>

      {degradeMode ? (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-100/80 p-4 text-sm text-red-800 dark:border-red-400/40 dark:bg-red-900/40 dark:text-red-100 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-semibold">Modo degradado activo</p>
            <p>{degradeReason ?? 'El servicio remoto está pausado hasta el siguiente ciclo.'}</p>
            <p className="mt-1 text-xs text-red-700 dark:text-red-200">Continúa operando con QR local y carga manual hasta el reset.</p>
          </div>
          <button
            onClick={requestUpgrade}
            className="inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
          >
            Solicitar upgrade inmediato
          </button>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3 rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-800 dark:border-blue-400/40 dark:bg-blue-900/30 dark:text-blue-100 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-semibold">Protección activa</p>
            <p>Se detendrá el servicio remoto al llegar al 100 % del cupo mensual para evitar sobrecargos.</p>
            {upgradeRequestedAt && (
              <p className="mt-1 text-xs text-blue-600 dark:text-blue-200">Solicitud de upgrade enviada el {formatDate(upgradeRequestedAt)}.</p>
            )}
          </div>
          <button
            onClick={requestUpgrade}
            className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
          >
            Pedir upgrade
          </button>
        </div>
      )}
    </section>
  );
};

export default UsageQuotaBanner;
