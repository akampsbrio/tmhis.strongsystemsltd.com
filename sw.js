/**
 * TMHIS Service Worker - Offline Application Shell Cache
 */
const CACHE_NAME = 'tmhis-shell-v11';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/css/app.css',
    '/js/api.js',
    '/js/auth.js',
    '/js/app.js',
    '/manifest.json'
];

// Install Event: Pre-cache App Shell
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[TMHIS SW] Pre-caching application shell...');
            return cache.addAll(STATIC_ASSETS);
        }).then(() => self.skipWaiting())
    );
});

// Activate Event: Clear Old Caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((name) => {
                    if (name !== CACHE_NAME) {
                        console.log('[TMHIS SW] Removing old cache:', name);
                        return caches.delete(name);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch Event: Network-first for /api/, Cache-first with Network Fallback for App Shell Assets
self.addEventListener('fetch', (event) => {
    const requestUrl = new URL(event.request.url);

    // API requests are never served stale from shell cache (handled by IndexedDB sync engine in Module 07)
    if (requestUrl.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(event.request).catch(() => {
                return new Response(JSON.stringify({
                    success: false,
                    data: null,
                    message: 'You are currently offline. Changes will sync when connection returns.',
                    errors: ['offline_mode']
                }), {
                    headers: { 'Content-Type': 'application/json' },
                    status: 503
                });
            })
        );
        return;
    }

    // Static Assets & Shell: Stale-While-Revalidate Strategy
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            const fetchPromise = fetch(event.request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(() => {
                // If offline and request is HTML navigation, fallback to root index.html
                if (event.request.headers.get('accept')?.includes('text/html')) {
                    return caches.match('/index.html');
                }
            });

            return cachedResponse || fetchPromise;
        })
    );
});
