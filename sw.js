const CACHE_NAME = 'punto-limpio-sgi-cache-v1';
// Lista de archivos que componen la "cáscara" de la aplicación.
const urlsToCache = [
  '/',
  './index.html',
  './index.js', 
  // Agrega aquí otros recursos estáticos importantes si los tuvieras (CSS, imágenes, etc.)
];

// Evento de instalación: se abre el caché y se añaden los archivos de la app shell.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

// Evento fetch: intercepta las peticiones de red.
// Estrategia: "Cache first". Primero busca en el caché. Si no lo encuentra, va a la red.
// Esto hace que la app cargue muy rápido y funcione offline.
self.addEventListener('fetch', event => {
  // No cacheamos las peticiones a Firebase ni a las APIs de Google.
  if (event.request.url.includes('firebase') || event.request.url.includes('googleapis')) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Si la respuesta está en el caché, la devuelve.
        if (response) {
          return response;
        }
        // Si no, hace la petición a la red.
        return fetch(event.request);
      }
    )
  );
});

// Evento de activación: limpia cachés antiguos si la versión cambia.
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});