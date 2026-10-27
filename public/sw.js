// GOODLIFE Progressive Web App Service Worker (v4)
// Strictly offline-capable with explicit security boundaries for financial transactions
const CACHE_VERSION = 'goodlife-v4';
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
    }).then(() => self.skipWaiting())
  );
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

  // 0. NEVER INTERCEPT CROSS-ORIGIN REQUESTS (e.g. YouTube, Catbox, Cloudflare R2, ImgBB, CDNs)
  // Let the browser handle external media natively at full bandwidth
  if (url.origin !== self.location.origin) {
    return;
  }

  // 1. NEVER INTERCEPT DYNAMIC / FINANCIAL / AUTH / NEXT.JS BUNDLES
  // Strictly bypass service worker for:
  // - /api/* (all dynamic backend endpoints, STK push, payments, webhooks, radio state)
  // - /_next/* (Next.js JS chunks, CSS, optimized images - let browser handle via HTTP/2 directly)
  // - /vendor/* (vendor operator POS and credentials)
  // - /admin/* (admin dashboard and session management)
  // - /scanner/* (gate scanner and session auth)
  // - /pay/* (tab remote self-pay)
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/_next/') ||
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

  // 3. Static Shell Assets (Icons, Fonts) -> Stale-While-Revalidate
  if (
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/favicon.svg' ||
    url.pathname === '/icon.png' ||
    url.pathname === '/apple-touch-icon.png' ||
    url.pathname === '/BebasNeue.ttf'
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

  // 4. Default: DO NOT INTERCEPT. Allow native browser fetch pipeline to handle request without SW overhead.
  return;
});
