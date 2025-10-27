const CACHE_NAME = 'punto-limpio-sgi-cache-v2';
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/puntolimpio.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      try {
        await cache.addAll(CORE_ASSETS);
        console.log('Service worker cache primed');
      } catch (error) {
        console.warn('Service worker cache priming failed', error);
      }
    }),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  if (request.method !== 'GET') {
    return;
  }

  let url;
  try {
    url = new URL(request.url);
  } catch (error) {
    return;
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    return;
  }

  if (url.hostname.includes('firebase') || url.hostname.includes('googleapis')) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html')),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(request).then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        const responseToCache = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(request, responseToCache));
        return response;
      });
    }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((cacheName) => cacheName !== CACHE_NAME)
          .map((cacheName) => caches.delete(cacheName)),
      ),
    ),
  );
});
