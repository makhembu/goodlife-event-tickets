// GOODLIFE Progressive Web App Service Worker (v3)
// Strictly offline-capable with explicit security boundaries for financial transactions
const CACHE_VERSION = 'goodlife-v3';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// Shell assets to pre-cache immediately upon install
const PRECACHE_ASSETS = [
  '/offline.html',
  '/site.webmanifest',
  '/icons/scanner-192.png',
  '/icons/scanner-512.png',
  '/icons/vendor-192.png',
  '/icons/vendor-512.png',
  '/icons/admin-192.png',
  '/icons/admin-512.png',
  '/icons/icon-512.png',
  '/icon.png',
  '/apple-touch-icon.png',
  '/favicon.svg',
  '/BebasNeue.ttf'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('PWA Precache failed non-critically:', err);
      });
    })
  );
  // Do NOT self.skipWaiting() here automatically if active payment might be in flight!
  // Wait for postMessage skipWaiting triggered by UI when safe.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      );
    }).then(() => self.clients.claim())
  );
});

// Listen for explicit message from client to skip waiting
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  // Only handle GET requests
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // 0. NEVER INTERCEPT CROSS-ORIGIN REQUESTS (e.g. YouTube thumbnails, external CDNs, third-party media)
  // Let the browser handle external assets natively without Service Worker thread choking
  if (url.origin !== self.location.origin) {
    return;
  }

  // 1. NEVER INTERCEPT OR CACHE FINANCIAL / AUTHENTICATED PATHS
  // Strictly bypass service worker for:
  // - /api/* (all dynamic backend endpoints, STK push, payments, webhooks, callbacks)
  // - /vendor/* (vendor operator POS and credentials)
  // - /admin/* (admin dashboard and session management)
  // - /scanner/* (gate scanner and session auth)
  // - /pay/* (tab remote self-pay)
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/vendor') ||
    url.pathname.startsWith('/admin') ||
    url.pathname.startsWith('/scanner') ||
    url.pathname.startsWith('/pay/')
  ) {
    return;
  }

  // 2. HTML Navigations -> Network-First with /offline.html fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(RUNTIME_CACHE).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          // Check runtime cache for previously loaded page
          const cachedPage = await caches.match(event.request);
          if (cachedPage) return cachedPage;

          // Otherwise serve dedicated offline fallback page
          const offlineFallback = await caches.match('/offline.html');
          if (offlineFallback) return offlineFallback;

          return new Response('Offline - No connection available', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          });
        })
    );
    return;
  }

  // 3. Static Next.js Bundles (/_next/static/*) -> Cache-First (content-hashed, immutable)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(STATIC_CACHE).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // 4. Static Images, Fonts, Icons -> Stale-While-Revalidate
  if (
    url.pathname.startsWith('/icons/') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.jpeg') ||
    url.pathname.endsWith('.webp') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.ttf')
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(STATIC_CACHE).then((cache) => {
                cache.put(event.request, responseClone);
              });
            }
            return networkResponse;
          })
          .catch(() => cached);

        return cached || fetchPromise;
      })
    );
    return;
  }

  // 5. Default fallback to standard fetch
  event.respondWith(fetch(event.request));
});
