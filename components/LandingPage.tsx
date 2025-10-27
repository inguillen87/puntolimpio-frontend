import React from 'react';

interface LandingPageProps {
  onLoginRequest: () => void;
  onRegisterRequest: () => void;
}

const stats = [
  { label: 'Productos con trazabilidad optimizada', value: '325.000+' },
  { label: 'Artículos recuperados en la planta', value: '1.000.000' },
  { label: 'Botellas recicladas con IA', value: '20.230.234' },
];

const features = [
  {
    title: 'Inventario inteligente',
    description:
      'Seguimiento en tiempo real de cada residuo y materia prima con dashboards dinámicos, alertas y reportes automatizados.',
    icon: (
      <svg
        className="w-8 h-8 text-emerald-500"
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
      'Coordina recolección, traslado y entrega con algoritmos que priorizan rutas y disponibilidad de flota.',
    icon: (
      <svg
        className="w-8 h-8 text-sky-500"
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
      'Automatizamos clasificación y trazabilidad con modelos de visión y predicción de demanda para cada flujo.',
    icon: (
      <svg
        className="w-8 h-8 text-violet-500"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 6v12m6-6H6"
        />
      </svg>
    ),
  },
];

const highlights = [
  {
    title: 'Municipios pioneros',
    description:
      'Junín (Mendoza) optimizó su Punto Limpio con trazabilidad completa y reportes listos para auditorías ambientales.',
  },
  {
    title: 'Economía circular',
    description:
      'Conectamos cooperativas, industrias y comercios para maximizar recuperación de materiales y reducir costos operativos.',
  },
  {
    title: 'Listo para SaaS',
    description:
      'Implementación en días, con onboarding asistido, roles multi-organización y soporte dedicado para gobiernos y empresas.',
  },
];

const LandingPage: React.FC<LandingPageProps> = ({ onLoginRequest, onRegisterRequest }) => {
  return (
    <div className="bg-slate-950 text-slate-100 min-h-screen">
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="container mx-auto flex items-center justify-between px-6 py-5">
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
          <nav className="hidden items-center space-x-10 text-sm font-medium text-slate-300 lg:flex">
            <span className="hover:text-white transition">Solución</span>
            <span className="hover:text-white transition">Impacto</span>
            <span className="hover:text-white transition">Clientes</span>
            <span className="hover:text-white transition">Contacto</span>
          </nav>
          <div className="flex items-center space-x-3">
            <button
              onClick={onLoginRequest}
              className="rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-emerald-500 hover:text-white"
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
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.35),_transparent_55%)]" />
          <div className="container relative mx-auto grid gap-12 px-6 py-24 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div className="space-y-8">
              <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-emerald-300">
                Plataforma SaaS de gestión circular
              </span>
              <h1 className="text-4xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl">
                Ponemos la inteligencia en movimiento para cada residuo recuperado.
              </h1>
              <p className="max-w-xl text-lg text-slate-300">
                Gestiona inventario, logística e infraestructura de reciclaje desde una sola app.
                Controla cada material desde la recepción hasta la venta, con analítica avanzada y automatizaciones con IA.
              </p>
              <div className="flex flex-col space-y-3 sm:flex-row sm:space-x-4 sm:space-y-0">
                <button
                  onClick={onRegisterRequest}
                  className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-6 py-3 text-base font-semibold text-slate-900 transition hover:bg-emerald-400"
                >
                  Empezar con Punto Limpio
                </button>
                <button
                  onClick={onLoginRequest}
                  className="inline-flex items-center justify-center rounded-full border border-slate-700 px-6 py-3 text-base font-semibold text-slate-200 transition hover:border-emerald-500 hover:text-white"
                >
                  Ver la plataforma
                </button>
              </div>
              <div className="grid gap-6 sm:grid-cols-3">
                {stats.map((stat) => (
                  <div key={stat.label} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-5 shadow-lg shadow-emerald-500/5">
                    <p className="text-2xl font-semibold text-white sm:text-3xl">{stat.value}</p>
                    <p className="mt-2 text-xs uppercase tracking-[0.3em] text-slate-400">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="absolute -inset-6 rounded-3xl bg-gradient-to-br from-emerald-500/30 via-slate-800 to-transparent blur-3xl" />
              <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/80 shadow-2xl shadow-emerald-500/20">
                <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
                  <span className="text-sm font-semibold text-slate-200">Panel en vivo</span>
                  <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300">Demo</span>
                </div>
                <div className="space-y-6 p-6 text-sm text-slate-300">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Inventario</p>
                    <p className="mt-2 text-2xl font-semibold text-white">Lotes clasificados al 98% de precisión</p>
                    <p className="mt-3 text-sm text-slate-400">
                      Indicadores predictivos con IA para anticipar la demanda de insumos y los flujos de salida por cliente.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                    <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">Logística optimizada</p>
                    <div className="mt-3 flex items-center justify-between text-slate-200">
                      <span>Rutas activas hoy</span>
                      <span className="text-lg font-semibold text-white">12</span>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-slate-800">
                      <div className="h-full w-4/5 rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400" />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs uppercase tracking-[0.3em] text-slate-500">Botellas recuperadas</span>
                      <span className="text-sm text-emerald-300">+18% vs. mes anterior</span>
                    </div>
                    <p className="mt-3 text-3xl font-semibold text-white">1.689.540</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-b border-slate-800 bg-slate-900/60 py-20">
          <div className="container mx-auto grid gap-12 px-6 lg:grid-cols-3">
            {features.map((feature) => (
              <div key={feature.title} className="rounded-3xl border border-slate-800 bg-slate-950/60 p-8 shadow-lg shadow-emerald-500/10">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-900/70">
                  {feature.icon}
                </div>
                <h3 className="mt-6 text-xl font-semibold text-white">{feature.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">{feature.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="py-20">
          <div className="container mx-auto grid gap-10 px-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
            <div className="space-y-6">
              <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">Impacto real</p>
              <h2 className="text-3xl font-semibold text-white sm:text-4xl">
                Desde Junín para el mundo: tecnología circular lista para escalar.
              </h2>
              <p className="text-base leading-relaxed text-slate-300">
                Nacimos dentro de la planta de reciclaje de Junín, Mendoza, y hoy ponemos nuestra inteligencia en movimiento para municipios y empresas que quieren ver resultados concretos.
              </p>
              <div className="grid gap-6 sm:grid-cols-3">
                {highlights.map((highlight) => (
                  <div key={highlight.title} className="rounded-2xl border border-slate-800 bg-slate-950/60 p-6">
                    <h3 className="text-lg font-semibold text-white">{highlight.title}</h3>
                    <p className="mt-3 text-sm text-slate-400">{highlight.description}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-900/40 p-10 text-slate-200">
              <p className="text-sm uppercase tracking-[0.3em] text-emerald-300">Testimonio</p>
              <p className="mt-6 text-2xl font-semibold text-white">
                “Con Punto Limpio dejamos de depender de planillas dispersas. Hoy sabemos qué entra, qué sale y cuánto impacto generamos en tiempo real.”
              </p>
              <div className="mt-6 flex items-center space-x-4">
                <div className="h-12 w-12 rounded-full bg-emerald-500/30" />
                <div>
                  <p className="text-sm font-semibold text-white">Soledad Torres</p>
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Coordinadora Punto Limpio Junín</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-slate-800 bg-slate-900/80">
          <div className="container mx-auto flex flex-col items-center justify-between gap-6 px-6 py-16 text-center lg:flex-row lg:text-left">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-emerald-300">Listo para implementar</p>
              <h3 className="mt-4 text-3xl font-semibold text-white">Conecta tu operación en días, no en meses.</h3>
              <p className="mt-3 max-w-2xl text-sm text-slate-300">
                Onboarding guiado, soporte dedicado y un equipo que ya opera plantas de reciclaje. Sumá tu organización al movimiento de la inteligencia circular.
              </p>
            </div>
            <div className="flex flex-col space-y-3 sm:flex-row sm:space-x-4 sm:space-y-0">
              <button
                onClick={onRegisterRequest}
                className="inline-flex items-center justify-center rounded-full bg-emerald-500 px-6 py-3 text-base font-semibold text-slate-900 transition hover:bg-emerald-400"
              >
                Agendar demo SaaS
              </button>
              <button
                onClick={onLoginRequest}
                className="inline-flex items-center justify-center rounded-full border border-slate-700 px-6 py-3 text-base font-semibold text-slate-200 transition hover:border-emerald-500 hover:text-white"
              >
                Ingresar si ya soy cliente
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-800 bg-slate-950/90">
        <div className="container mx-auto flex flex-col items-center justify-between gap-6 px-6 py-10 text-sm text-slate-500 sm:flex-row">
          <p>© {new Date().getFullYear()} Punto Limpio • Inteligencia en movimiento</p>
          <div className="flex items-center space-x-6">
            <button onClick={onLoginRequest} className="transition hover:text-emerald-400">Ingreso clientes</button>
            <button onClick={onRegisterRequest} className="transition hover:text-emerald-400">Solicitar información</button>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
