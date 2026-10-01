// GOODLIFE Progressive Web App Service Worker
const CACHE_NAME = 'goodlife-pwa-v1';

// Static assets to pre-cache
const PRECACHE_ASSETS = [
  '/icons/scanner-192.png',
  '/icons/scanner-512.png',
  '/icons/vendor-192.png',
  '/icons/vendor-512.png',
  '/icons/admin-192.png',
  '/icons/admin-512.png',
  '/icon.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('PWA Precache failed non-critically:', err);
      });
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // Skip dynamic backend API routes
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (
          response &&
          response.status === 200 &&
          (url.pathname.startsWith('/icons/') ||
           url.pathname.endsWith('.png') ||
           url.pathname.endsWith('.ttf') ||
           url.pathname.endsWith('.svg') ||
           url.pathname.startsWith('/_next/static/'))
        ) {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(event.request);
        if (cached) return cached;
        return new Response('Terminal Offline - Reconnecting...', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      })
  );
});
