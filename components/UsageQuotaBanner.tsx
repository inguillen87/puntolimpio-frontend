import React from 'react';
import { useUsageLimits } from '../context/UsageLimitsContext';
import { DEMO_UPLOAD_LIMIT } from '../services/demoUsageService';

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
  const isDemoPlan = planName?.toLowerCase().includes('demo') ?? false;
  const demoCap = Math.max(DEMO_UPLOAD_LIMIT, 1);
  const effectiveLimit = isDemoPlan ? (monthlyQuota > 0 ? Math.min(monthlyQuota, demoCap) : demoCap) : monthlyQuota;
  const effectiveUsed = isDemoPlan ? Math.min(used, effectiveLimit) : used;
  const effectiveRemaining = isDemoPlan ? Math.max(effectiveLimit - effectiveUsed, 0) : remaining;
  const usagePercentage = effectiveLimit === 0 ? 0 : Math.min((effectiveUsed / effectiveLimit) * 100, 100);
  const resetLabel = formatDate(resetsOn);
  const progressBarClass = degradeMode
    ? 'bg-red-500'
    : usagePercentage >= 90
      ? 'bg-orange-500'
      : 'bg-blue-500';

  const guardrailText: string[] = [];
  if (!isDemoPlan) {
    if (dailyQuota) {
      guardrailText.push(`Límite diario ${dailyQuota.toLocaleString('es-AR')} llamadas`);
    }
    if (perMinuteQuota) {
      guardrailText.push(`Máx ${perMinuteQuota.toLocaleString('es-AR')} req/min`);
    }
  }

  const upgradeMailSubject = encodeURIComponent('Solicitud de upgrade Punto Limpio');
  const upgradeMailBody = encodeURIComponent(
    'Hola equipo Punto Limpio,\n\nMe gustaría coordinar un upgrade de la experiencia demo para continuar con la implementación.\n\nGracias.'
  );
  const upgradeMailHref = `mailto:info@puntolimpio.ar?subject=${upgradeMailSubject}&body=${upgradeMailBody}`;
  const upgradeWhatsHref = 'https://wa.me/5492613168608?text=Hola%20Ing.%20Marcelo%20Guillen%2C%20quisiera%20coordinar%20un%20upgrade%20de%20la%20demo%20de%20Punto%20Limpio.';

  const contactButtons = (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
      <a
        href={upgradeMailHref}
        onClick={requestUpgrade}
        className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
      >
        Escribir a Punto Limpio
      </a>
      <a
        href={upgradeWhatsHref}
        target="_blank"
        rel="noopener noreferrer"
        onClick={requestUpgrade}
        className="inline-flex items-center justify-center rounded-lg border border-blue-300 px-4 py-2 text-sm font-semibold text-blue-700 transition hover:border-blue-400 hover:text-blue-800 dark:border-blue-400/70 dark:text-blue-100 dark:hover:border-blue-300 dark:hover:text-white"
      >
        Hablar con Ing. Marcelo Guillen
      </a>
    </div>
  );

  if (isDemoPlan) {
    return (
      <section
        className={`mx-auto mt-4 max-w-5xl rounded-2xl border ${
          degradeMode ? 'border-blue-300 bg-blue-50 dark:border-blue-500/40 dark:bg-blue-900/30' : 'border-blue-200 bg-white dark:border-blue-500/30 dark:bg-slate-900/60'
        } p-5 shadow-sm transition-all`}
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-3">
            <p className="text-sm font-semibold uppercase tracking-wide text-blue-500 dark:text-blue-300">Demo corporativa protegida</p>
            <h3 className="text-2xl font-bold text-blue-900 dark:text-blue-100">{planName}</h3>
            <p className="text-sm leading-relaxed text-blue-900/80 dark:text-blue-100/80">
              Las credenciales demo compartidas permiten hasta {effectiveLimit} análisis guiados por ciclo seguro. Quedan {effectiveRemaining} envíos disponibles hasta {resetLabel}.
            </p>
            <p className="text-sm leading-relaxed text-blue-900/70 dark:text-blue-200/80">
              El equipo de Punto Limpio y{' '}
              <a
                href="https://chatboc.ar"
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold underline decoration-blue-300 decoration-2 underline-offset-4"
              >
                chatboc.ar
              </a>{' '}
              acompaña cada evaluación para garantizar un onboarding confiable.
            </p>
          </div>
          <div className="rounded-2xl border border-blue-200/70 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-900 shadow-inner dark:border-blue-500/40 dark:bg-blue-900/40 dark:text-blue-100">
            <p className="text-xs uppercase tracking-widest text-blue-500 dark:text-blue-200">Estado del cupo</p>
            <p className="mt-2 text-3xl font-bold">{effectiveUsed}/{effectiveLimit}</p>
            <p className="text-xs text-blue-800/80 dark:text-blue-200/80">Próximo reinicio {resetLabel}</p>
          </div>
        </div>
        <div className="mt-4 h-3 w-full rounded-full bg-blue-100 dark:bg-blue-900/60">
          <div
            className={`${progressBarClass} h-3 rounded-full transition-all`}
            style={{ width: `${usagePercentage}%` }}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={usagePercentage}
          />
        </div>
        <div
          className={`mt-4 flex flex-col gap-4 rounded-xl border ${
            degradeMode
              ? 'border-blue-200 bg-blue-100/70 p-4 text-sm text-blue-900 dark:border-blue-400/40 dark:bg-blue-900/50 dark:text-blue-100'
              : 'border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-900 dark:border-blue-400/40 dark:bg-blue-900/40 dark:text-blue-100'
          } md:flex-row md:items-center md:justify-between`}
        >
          <div>
            <p className="font-semibold">{degradeMode ? 'Cupo demo pausado temporalmente' : 'Protección activa'}</p>
            <p>
              {degradeMode
                ? degradeReason ?? 'El análisis remoto se reactivará al iniciar el próximo ciclo demo o ante un upgrade.'
                : 'Cortamos automáticamente el análisis remoto al alcanzar el límite demo para resguardar la infraestructura de IA.'}
            </p>
          </div>
          {contactButtons}
        </div>
      </section>
    );
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
        <div className="mt-4 flex flex-col gap-4 rounded-xl border border-red-200 bg-red-100/80 p-4 text-sm text-red-800 dark:border-red-400/40 dark:bg-red-900/40 dark:text-red-100 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-semibold">Modo degradado activo</p>
            <p>{degradeReason ?? 'El servicio remoto está pausado hasta el siguiente ciclo.'}</p>
            <p className="mt-1 text-xs text-red-700 dark:text-red-200">Continúa operando con QR local y carga manual hasta el reset.</p>
          </div>
          {contactButtons}
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4 rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-800 dark:border-blue-400/40 dark:bg-blue-900/30 dark:text-blue-100 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-semibold">Protección activa</p>
            <p>Se detendrá el servicio remoto al llegar al 100 % del cupo mensual para evitar sobrecargos.</p>
            {upgradeRequestedAt && (
              <p className="mt-1 text-xs text-blue-600 dark:text-blue-200">Solicitud de upgrade enviada el {formatDate(upgradeRequestedAt)}.</p>
            )}
          </div>
          {contactButtons}
        </div>
      )}
    </section>
  );
};

export default UsageQuotaBanner;
