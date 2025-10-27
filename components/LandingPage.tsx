import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import type { ECharts } from '../utils/echartsLoader';
import { loadEcharts } from '../utils/echartsLoader';

type Theme = 'light' | 'dark';

interface LandingPageProps {
  onLoginRequest: () => void;
  onRegisterRequest: () => void;
  theme: Theme;
  onToggleTheme: () => void;
}

const stats = [
  { label: 'Productos con trazabilidad optimizada', value: '325.000+' },
  { label: 'Artículos recuperados', value: '1.000.000' },
  { label: 'Botellas recicladas', value: '20.230.234' },
];

const features = [
  {
    title: 'Inventario inteligente',
    description:
      'Controla entradas, salidas y calidad con dashboards dinámicos, alertas automáticas y reportes listos para auditorías.',
    icon: (
      <svg
        className="h-8 w-8 text-emerald-500"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 3v1.5M3 21v-3m18 3v-6m0-5.25V3m-6 18v-3m0-5.25V9m0-6H3m18 0h-7.5M3 12h7.5M3 16.5h4.5"
        />
      </svg>
    ),
  },
  {
    title: 'Logística automatizada',
    description:
      'Coordiná rutas, flota y turnos con algoritmos predictivos y notificaciones inteligentes para cada punto de recolección.',
    icon: (
      <svg
        className="h-8 w-8 text-sky-500"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M2.25 15a4.5 4.5 0 019 0v1.125A2.625 2.625 0 009.375 18.75H8.25m-3 0h-.375A2.625 2.625 0 012.25 16.125V15zm0 0v-2.625c0-.621.504-1.125 1.125-1.125h7.5m9 5.25V18.75M18 9h3.375c.621 0 1.125.504 1.125 1.125v3.75c0 .621-.504 1.125-1.125 1.125H18m0-6V5.625C18 5.004 17.496 4.5 16.875 4.5h-5.25M18 9h-3.375c-.621 0-1.125-.504-1.125-1.125V4.5m0 0H9.375C8.754 4.5 8.25 5.004 8.25 5.625V9"
        />
      </svg>
    ),
  },
  {
    title: 'Infraestructura con IA',
    description:
      'Orquestamos sensores, visión por computadora y mantenimiento predictivo para maximizar disponibilidad y eficiencia.',
    icon: (
      <svg
        className="h-8 w-8 text-violet-500"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m6-6H6" />
      </svg>
    ),
  },
];

const impactHighlights = [
  {
    title: 'Municipios pioneros',
    description:
      'Junín (Mendoza) consolidó toda su operación de Punto Limpio en una única plataforma con indicadores en tiempo real.',
  },
  {
    title: 'Economía circular colaborativa',
    description:
      'Conectamos cooperativas, industrias y comercios para maximizar la recuperación y reducir costos logísticos.',
  },
  {
    title: 'Escalabilidad SaaS',
    description:
      'Implementación en días con onboarding asistido, roles multi-organización y soporte dedicado para gobiernos y empresas.',
  },
];

const navItems = [
  { id: 'solucion', label: 'Solución' },
  { id: 'impacto', label: 'Impacto' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'contacto', label: 'Contacto' },
];

const contactOptions: {
  label: string;
  href: string;
  description: React.ReactNode;
}[] = [
  {
    label: 'info@puntolimpio.ar',
    href: 'mailto:info@puntolimpio.ar',
    description: 'Escribinos para coordinar una demo o conocer los planes disponibles.',
  },
  {
    label: 'WhatsApp agente inteligente',
    href: 'https://wa.me/17432643718',
    description: '+1 (743) 264-3718 • Nuestro agente IA responde 24/7.',
  },
  {
    label: 'WhatsApp contrataciones',
    href: 'https://wa.me/5492613168608',
    description: (
      <span>
        +54 9 261 316 8608 • Ing. Marcelo Guillen,&nbsp;
        <a
          href="https://chatboc.ar"
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold underline decoration-emerald-500/70 decoration-2 underline-offset-2"
        >
          chatboc.ar
        </a>
        .
      </span>
    ),
  },
];

const RealtimeCharts: React.FC<{ theme: Theme }> = ({ theme }) => {
  const throughputRef = useRef<HTMLDivElement | null>(null);
  const recoveryRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let throughputChart: ECharts | undefined;
    let recoveryChart: ECharts | undefined;
    let throughputInterval: number | undefined;
    let recoveryInterval: number | undefined;

    const handleResize = () => {
      throughputChart?.resize();
      recoveryChart?.resize();
    };

    const setupCharts = async () => {
      try {
        const echarts = await loadEcharts();
        if (cancelled) {
          return;
        }

        const baseLabelColor = theme === 'dark' ? '#e2e8f0' : '#1f2937';
        const gridLineColor = theme === 'dark' ? '#1f2937' : '#e2e8f0';
        const secondaryText = theme === 'dark' ? '#94a3b8' : '#475569';
        const baseData = [420, 468, 510, 556, 590, 620, 675];

        if (throughputRef.current) {
          const existing = echarts.getInstanceByDom(throughputRef.current);
          existing?.dispose();

          throughputChart = echarts.init(throughputRef.current, undefined, { renderer: 'svg' });
          throughputChart.setOption({
            backgroundColor: 'transparent',
            textStyle: { color: baseLabelColor },
            tooltip: { trigger: 'axis' },
            grid: { top: 30, left: 45, right: 20, bottom: 35 },
            xAxis: {
              type: 'category',
              data: ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'],
              boundaryGap: false,
              axisLine: { lineStyle: { color: secondaryText } },
              axisLabel: { color: secondaryText },
            },
            yAxis: {
              type: 'value',
              axisLine: { lineStyle: { color: secondaryText } },
              splitLine: { lineStyle: { color: gridLineColor, type: 'dashed' } },
              axisLabel: { color: secondaryText },
            },
            series: [
              {
                name: 'Kg procesados',
                type: 'line',
                smooth: true,
                data: baseData,
                symbol: 'circle',
                symbolSize: 8,
                lineStyle: { width: 3, color: '#10b981' },
                areaStyle: {
                  color: theme === 'dark' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.2)',
                },
              },
            ],
          });

          let tick = 0;
          throughputInterval = window.setInterval(() => {
            if (!throughputChart) {
              return;
            }
            const next = baseData.map((value, index) => {
              const variation = Math.sin((tick + index) / 2) * 12;
              return Math.round(value + variation);
            });
            throughputChart.setOption({ series: [{ data: next }] });
            tick += 1;
          }, 4000);
        }

        if (recoveryRef.current) {
          const existing = echarts.getInstanceByDom(recoveryRef.current);
          existing?.dispose();

          recoveryChart = echarts.init(recoveryRef.current, undefined, { renderer: 'svg' });
          recoveryChart.setOption({
            backgroundColor: 'transparent',
            textStyle: { color: baseLabelColor },
            tooltip: { trigger: 'item' },
            series: [
              {
                name: 'Tasa de recuperación',
                type: 'gauge',
                startAngle: 180,
                endAngle: 0,
                center: ['50%', '65%'],
                radius: '100%',
                progress: { show: true, roundCap: true, width: 14 },
                axisLine: {
                  lineStyle: {
                    width: 14,
                    color: [
                      [0.4, theme === 'dark' ? '#334155' : '#e2e8f0'],
                      [0.7, '#22d3ee'],
                      [1, '#10b981'],
                    ],
                  },
                },
                pointer: { show: false },
                axisTick: { show: false },
                splitLine: { show: false },
                axisLabel: { color: secondaryText, distance: -20 },
                title: { offsetCenter: [0, '75%'], color: secondaryText },
                detail: {
                  valueAnimation: true,
                  formatter: '{value}%',
                  color: baseLabelColor,
                  fontSize: 28,
                  offsetCenter: [0, '10%'],
                },
                data: [{ value: 82, name: 'Recuperación' }],
              },
            ],
          });

          recoveryInterval = window.setInterval(() => {
            if (!recoveryChart) {
              return;
            }
            const value = 80 + Math.round(Math.random() * 8);
            recoveryChart.setOption({ series: [{ data: [{ value, name: 'Recuperación' }] }] });
          }, 5000);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('No se pudieron cargar los gráficos en tiempo real.', error);
      }
    };

    void setupCharts();
    window.addEventListener('resize', handleResize);

    return () => {
      cancelled = true;
      window.removeEventListener('resize', handleResize);
      if (throughputInterval !== undefined) {
        window.clearInterval(throughputInterval);
      }
      if (recoveryInterval !== undefined) {
        window.clearInterval(recoveryInterval);
      }
      throughputChart?.dispose();
      recoveryChart?.dispose();
    };
  }, [theme]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-3xl border border-transparent bg-emerald-500/10 p-6 backdrop-blur">
        <h4 className="text-sm font-semibold uppercase tracking-[0.3em] text-emerald-400">
          Flujo procesado semanal
        </h4>
        <div ref={throughputRef} className="mt-4 h-56 w-full" />
      </div>
      <div className="rounded-3xl border border-transparent bg-sky-500/10 p-6 backdrop-blur">
        <h4 className="text-sm font-semibold uppercase tracking-[0.3em] text-sky-300">
          Recuperación con IA
        </h4>
        <div ref={recoveryRef} className="mt-4 h-56 w-full" />
      </div>
    </div>
  );
};

const LandingPage: React.FC<LandingPageProps> = ({ onLoginRequest, onRegisterRequest, theme, onToggleTheme }) => {
  const isDark = theme === 'dark';

  const handleNavClick = useCallback((id: string) => {
    const section = document.getElementById(id);
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const navButtons = useMemo(
    () =>
      navItems.map((item) => (
        <button
          key={item.id}
          onClick={() => handleNavClick(item.id)}
          className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
            isDark
              ? 'text-slate-200 hover:bg-slate-800/80 hover:text-white'
              : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`}
        >
          {item.label}
        </button>
      )),
    [handleNavClick, isDark]
  );

  return (
    <div
      className={`scroll-smooth transition-colors duration-500 ${
        isDark ? 'bg-slate-950 text-slate-100' : 'bg-white text-slate-900'
      }`}
    >
      <header
        className={`sticky top-0 z-30 border-b backdrop-blur ${
          isDark ? 'border-slate-800/70 bg-slate-950/80' : 'border-slate-200 bg-white/80'
        }`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6">
          <div className="flex items-center space-x-3">
            <img
              src="https://chatboc-demo-widget-oigs.vercel.app/puntolimpio.png"
              alt="Punto Limpio"
              className="h-11 w-11"
            />
            <div>
              <p className="text-lg font-semibold tracking-tight">Punto Limpio Platform</p>
              <p className="text-xs uppercase tracking-[0.3em] text-emerald-400">Inteligencia en movimiento</p>
            </div>
          </div>
          <nav className="hidden items-center space-x-3 lg:flex">{navButtons}</nav>
          <div className="flex items-center space-x-3">
            <button
              onClick={onToggleTheme}
              className={`rounded-full p-2 transition-colors ${
                isDark
                  ? 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
              aria-label="Cambiar tema"
            >
              {isDark ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
                  />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
                  />
                </svg>
              )}
            </button>
            <button
              onClick={onLoginRequest}
              className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                isDark
                  ? 'border-slate-700 text-slate-200 hover:border-emerald-500 hover:text-white'
                  : 'border-slate-300 text-slate-700 hover:border-emerald-500 hover:text-emerald-700'
              }`}
            >
              Iniciar sesión
            </button>
            <button
              onClick={onRegisterRequest}
              className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-emerald-400"
            >
              Solicitar demo
            </button>
          </div>
        </div>
        <nav className="flex items-center space-x-2 overflow-x-auto px-4 pb-4 sm:px-6 lg:hidden">{navButtons}</nav>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div
            className={`absolute inset-0 ${
              isDark
                ? 'bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.35),_transparent_55%)]'
                : 'bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.2),_transparent_60%)]'
            }`}
          />
          <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-24 sm:px-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div className="space-y-8">
              <span
                className={`inline-flex items-center rounded-full border px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] ${
                  isDark
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : 'border-emerald-400/40 bg-emerald-400/10 text-emerald-600'
                }`}
              >
                Tecnología Punto Limpio creada en Junín, lista para el mundo
              </span>
              <h1 className="text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
                Plataforma SaaS para inventario circular, logística y analítica inteligente.
              </h1>
              <p className={`max-w-2xl text-lg ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                Nacimos dentro de la planta recicladora Punto Limpio de Junín, Mendoza, para resolver trazabilidad, producción y logística de una planta pública.{' '}
                Evolucionamos en una solución comercial que habilita a municipios, industrias, depósitos y operadores logísticos a medir impacto, optimizar recursos y tomar decisiones con datos en tiempo real.
              </p>
              <div className="flex flex-col space-y-3 sm:flex-row sm:space-x-4 sm:space-y-0">
                <button
                  onClick={onRegisterRequest}
                  className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-6 py-3 text-base font-semibold text-slate-900 transition hover:bg-emerald-400"
                >
                  Agendar una demo guiada
                </button>
                <button
                  onClick={onLoginRequest}
                  className={`inline-flex items-center justify-center rounded-full border px-6 py-3 text-base font-semibold transition-colors ${
                    isDark
                      ? 'border-slate-700 text-slate-200 hover:border-emerald-500 hover:text-white'
                      : 'border-slate-300 text-slate-700 hover:border-emerald-500 hover:text-emerald-700'
                  }`}
                >
                  Ingresar al panel en vivo
                </button>
              </div>
              <div className="grid gap-6 sm:grid-cols-3">
                {stats.map((stat) => (
                  <div
                    key={stat.label}
                    className={`rounded-2xl border p-5 shadow-lg ${
                      isDark
                        ? 'border-slate-800 bg-slate-900/70 shadow-emerald-500/10'
                        : 'border-slate-200 bg-white/80 shadow-emerald-500/10'
                    }`}
                  >
                    <p className="text-2xl font-semibold sm:text-3xl">{stat.value}</p>
                    <p className={`mt-2 text-xs uppercase tracking-[0.3em] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      {stat.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div
                className={`absolute -inset-6 rounded-3xl blur-3xl ${
                  isDark
                    ? 'bg-gradient-to-br from-emerald-500/30 via-slate-800 to-transparent'
                    : 'bg-gradient-to-br from-emerald-400/30 via-white to-transparent'
                }`}
              />
              <div
                className={`relative overflow-hidden rounded-3xl border shadow-2xl ${
                  isDark
                    ? 'border-slate-800 bg-slate-900/80 shadow-emerald-500/20'
                    : 'border-slate-200 bg-white/80 shadow-emerald-500/20'
                }`}
              >
                <div
                  className={`flex items-center justify-between border-b px-5 py-4 ${
                    isDark ? 'border-slate-800 text-slate-200' : 'border-slate-200 text-slate-600'
                  }`}
                >
                  <span className="text-sm font-semibold">Panel en vivo</span>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      isDark ? 'bg-emerald-500/20 text-emerald-300' : 'bg-emerald-500/15 text-emerald-600'
                    }`}
                  >
                    Demo
                  </span>
                </div>
                <div className={`space-y-6 p-6 text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  <div>
                    <p className={`text-xs uppercase tracking-[0.3em] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Inventario</p>
                    <p className="mt-2 text-2xl font-semibold">Lotes clasificados al 98% de precisión</p>
                    <p className="mt-3 text-sm">
                      Predicciones de demanda y simulaciones de stock que se actualizan con cada escaneo, factura o remito.
                    </p>
                  </div>
                  <div
                    className={`rounded-2xl border p-4 ${
                      isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <p className={`text-xs uppercase tracking-[0.3em] ${isDark ? 'text-emerald-300' : 'text-emerald-600'}`}>
                      Logística optimizada
                    </p>
                    <div className="mt-3 flex items-center justify-between">
                      <span>Rutas activas hoy</span>
                      <span className="text-lg font-semibold">12</span>
                    </div>
                    <div className={`mt-3 h-2 rounded-full ${isDark ? 'bg-slate-800' : 'bg-slate-200'}`}>
                      <div className="h-full w-4/5 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400" />
                    </div>
                  </div>
                  <div
                    className={`rounded-2xl border p-4 ${
                      isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs uppercase tracking-[0.3em] ${isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                        Botellas recuperadas
                      </span>
                      <span className={`text-sm ${isDark ? 'text-emerald-300' : 'text-emerald-600'}`}>+18% vs. mes anterior</span>
                    </div>
                    <p className="mt-3 text-3xl font-semibold">1.689.540</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="solucion" className={`border-y ${isDark ? 'border-slate-800 bg-slate-900/60' : 'border-slate-200 bg-slate-50'}`}>
          <div className="mx-auto grid max-w-7xl gap-12 px-4 py-20 sm:px-6 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className={`rounded-3xl border p-8 shadow-lg transition ${
                  isDark
                    ? 'border-slate-800 bg-slate-950/60 shadow-emerald-500/10'
                    : 'border-slate-200 bg-white shadow-emerald-500/10'
                }`}
              >
                <div
                  className={`flex h-14 w-14 items-center justify-center rounded-full ${
                    isDark ? 'bg-slate-900/70' : 'bg-emerald-500/10'
                  }`}
                >
                  {feature.icon}
                </div>
                <h3 className="mt-6 text-xl font-semibold">{feature.title}</h3>
                <p className={`mt-3 text-sm leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section id="impacto" className="py-20">
          <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div className="space-y-6">
              <p className={`text-xs uppercase tracking-[0.3em] ${isDark ? 'text-emerald-300' : 'text-emerald-600'}`}>Impacto real</p>
              <h2 className="text-3xl font-semibold sm:text-4xl">
                Desde la planta de Junín al mundo: trazabilidad, métricas y eficiencia para cada aliado circular.
              </h2>
              <p className={`text-base leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                Generamos reportes ambientales certificados, controlamos costos logísticos y demostramos impacto social y
                económico con tableros listos para compartir con gobiernos, empresas y ciudadanía.
              </p>
              <ul className="grid gap-6 sm:grid-cols-2">
                {impactHighlights.map((highlight) => (
                  <li
                    key={highlight.title}
                    className={`rounded-2xl border p-6 ${
                      isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <h3 className="text-lg font-semibold">{highlight.title}</h3>
                    <p className={`mt-3 text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{highlight.description}</p>
                  </li>
                ))}
              </ul>
            </div>
            <RealtimeCharts theme={theme} />
          </div>
        </section>

        <section
          id="clientes"
          className={`border-y ${isDark ? 'border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-900/40' : 'border-slate-200 bg-gradient-to-br from-white via-emerald-50 to-sky-50'}`}
        >
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div className="space-y-6">
              <p className={`text-xs uppercase tracking-[0.3em] ${isDark ? 'text-emerald-300' : 'text-emerald-600'}`}>
                Historias que inspiran
              </p>
              <h2 className="text-3xl font-semibold sm:text-4xl">Los pioneros de Punto Limpio marcan el camino.</h2>
              <p className={`text-base leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                Acompañamos a municipios, cooperativas y empresas que buscan digitalizar su operación y escalar modelos de
                economía circular con datos confiables.
              </p>
              <div
                className={`rounded-3xl border p-8 shadow-xl ${
                  isDark ? 'border-slate-800 bg-slate-950/60 shadow-emerald-500/15' : 'border-slate-200 bg-white shadow-emerald-500/20'
                }`}
              >
                <p className={`text-sm uppercase tracking-[0.3em] ${isDark ? 'text-emerald-300' : 'text-emerald-600'}`}>
                  Testimonio
                </p>
                <p className="mt-6 text-2xl font-semibold">
                  “Con Punto Limpio Platform dejamos de depender de planillas dispersas. Hoy sabemos qué entra, qué sale y
                  cuánto impacto generamos en tiempo real.”
                </p>
                <div className="mt-6 flex items-center space-x-4">
                  <div className={`h-12 w-12 rounded-full ${isDark ? 'bg-emerald-500/30' : 'bg-emerald-500/20'}`} />
                  <div>
                    <p className="text-sm font-semibold">Soledad Torres</p>
                    <p className={`text-xs uppercase tracking-[0.3em] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      Coordinadora Punto Limpio Junín
                    </p>
                  </div>
                </div>
              </div>
            </div>
            <div
              className={`rounded-3xl border p-8 ${
                isDark ? 'border-slate-800 bg-slate-950/70' : 'border-slate-200 bg-white/80'
              }`}
            >
              <h3 className="text-xl font-semibold">Qué ven tus equipos durante la prueba</h3>
              <ul className={`mt-4 space-y-3 text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                <li>• Circuitos completos de residuos con fotos, certificados y documentación respaldatoria.</li>
                <li>• Trazabilidad por organización, depósito y destino comercial.</li>
                <li>• Automatizaciones con IA para carga de facturas, remitos y controles operativos.</li>
              </ul>
              <div
                className={`mt-6 rounded-2xl border p-5 ${
                  isDark ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-200' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700'
                }`}
              >
                <h4 className="text-sm font-semibold uppercase tracking-[0.3em]">Acceso demo</h4>
                <p className="mt-3 text-sm">Usuario: <strong>demo@demo.com</strong></p>
                <p className="text-sm">Contraseña: <strong>demo123</strong></p>
                <p className="mt-3 text-xs leading-relaxed">
                  Incluye planillas reales de ejemplo cargadas por <strong>prueba@prueba.com</strong>. Por seguridad, el entorno de
                  evaluación admite hasta <strong>5</strong> archivos (facturas o remitos) cargados por organización.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section id="contacto" className="py-20">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <div>
              <p className={`text-xs uppercase tracking-[0.3em] ${isDark ? 'text-emerald-300' : 'text-emerald-600'}`}>Contacto</p>
              <h2 className="mt-4 text-3xl font-semibold">Conversemos sobre tu proyecto circular.</h2>
              <p className={`mt-3 text-base ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                Coordinamos pilotos, integraciones con ERP y capacitaciones específicas para plantas, depósitos, industrias y
                gobiernos.
              </p>
              <div className="mt-6 flex flex-col space-y-3 sm:flex-row sm:space-x-4 sm:space-y-0">
                <button
                  onClick={onRegisterRequest}
                  className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-6 py-3 text-base font-semibold text-slate-900 transition hover:bg-emerald-400"
                >
                  Reservar reunión
                </button>
                <button
                  onClick={onLoginRequest}
                  className={`inline-flex items-center justify-center rounded-full border px-6 py-3 text-base font-semibold transition-colors ${
                    isDark
                      ? 'border-slate-700 text-slate-200 hover:border-emerald-500 hover:text-white'
                      : 'border-slate-300 text-slate-700 hover:border-emerald-500 hover:text-emerald-700'
                  }`}
                >
                  Entrar a la plataforma
                </button>
              </div>
              <div className={`mt-10 rounded-3xl border p-6 ${isDark ? 'border-slate-800 bg-slate-950/60' : 'border-slate-200 bg-white'}`}>
                <p className="text-sm font-semibold uppercase tracking-[0.3em]">En sociedad con</p>
                <p className="mt-2 text-lg font-semibold">
                  <a
                    href="https://chatboc.ar"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-500 transition hover:text-emerald-400"
                  >
                    chatboc.ar
                  </a>{' '}
                  • Innovación y desarrollo tecnológico
                </p>
                <p className={`mt-2 text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                  Liderado por el Ing. Marcelo Guillen, potenciamos la inteligencia aplicada a inventario, logística e
                  infraestructura con agentes conversacionales y automatización avanzada.
                </p>
              </div>
            </div>
            <div className="grid gap-6">
              {contactOptions.map((option) => (
                <a
                  key={option.label}
                  href={option.href}
                  className={`group flex flex-col rounded-3xl border p-6 transition ${
                    isDark
                      ? 'border-slate-800 bg-slate-950/60 hover:border-emerald-400 hover:bg-slate-900'
                      : 'border-slate-200 bg-white hover:border-emerald-400 hover:bg-emerald-50'
                  }`}
                  target={option.href.startsWith('http') ? '_blank' : undefined}
                  rel={option.href.startsWith('http') ? 'noreferrer' : undefined}
                >
                  <span className="text-lg font-semibold">{option.label}</span>
                  <span className={`mt-2 text-sm ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>{option.description}</span>
                </a>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer
        className={`border-t text-sm ${
          isDark ? 'border-slate-800 bg-slate-950/90 text-slate-400' : 'border-slate-200 bg-slate-50 text-slate-600'
        }`}
      >
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-4 py-10 sm:flex-row sm:px-6">
          <p>© {new Date().getFullYear()} Punto Limpio • Inteligencia en movimiento</p>
          <div className="flex items-center space-x-6">
            <button
              onClick={onLoginRequest}
              className={`transition ${isDark ? 'hover:text-emerald-300' : 'hover:text-emerald-600'}`}
            >
              Ingreso clientes
            </button>
            <button
              onClick={onRegisterRequest}
              className={`transition ${isDark ? 'hover:text-emerald-300' : 'hover:text-emerald-600'}`}
            >
              Solicitar información
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
