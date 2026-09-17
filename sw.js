/**
 * TMHIS Service Worker - Offline Application Shell Cache (Network-First Strategy)
 * 
 * Rules:
 * 1. When Online: Always fetch the latest, updated assets directly from the network
 *    and update the local cache in the background.
 * 2. When Offline: Automatically fall back to the cached copy of the application shell.
 */

const CACHE_NAME = 'tmhis-shell-v50';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/css/app.css',
    '/js/api.js',
    '/js/auth.js',
    '/js/guides.js',
    '/js/schedule.js',
    '/js/assessments.js',
    '/js/exams.js',
    '/js/app.js',
    '/manifest.json'
];

// Install Event: Pre-cache App Shell & activate immediately
self.addEventListener('install', (event) => {
    console.log('[TMHIS SW] Installing updated shell cache...');
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        }).then(() => self.skipWaiting())
    );
});

// Activate Event: Purge old cache versions & claim all open clients immediately
self.addEventListener('activate', (event) => {
    console.log('[TMHIS SW] Activating new shell cache...');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((name) => {
                    if (name !== CACHE_NAME) {
                        console.log('[TMHIS SW] Purging obsolete cache version:', name);
                        return caches.delete(name);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch Event: Network-First for online devices, Cache-Fallback when offline
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const requestUrl = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // 1. API requests: Direct network with offline JSON status fallback
    if (requestUrl.pathname.startsWith('/api/')) {
        event.respondWith(
            fetch(request).catch(() => {
                return new Response(JSON.stringify({
                    success: false,
                    data: null,
                    message: 'You are currently offline. Changes will sync when network connection returns.',
                    errors: ['offline_mode']
                }), {
                    headers: { 'Content-Type': 'application/json' },
                    status: 503
                });
            })
        );
        return;
    }

    // 2. Navigation & App Shell Assets (HTML, CSS, JS): NETWORK-FIRST
    // When connected to the network, ALWAYS load the updated copy from the server first!
    event.respondWith(
        fetch(request)
            .then((networkResponse) => {
                // If received valid response from network, update cache with fresh asset
                if (networkResponse && networkResponse.status === 200 && (networkResponse.type === 'basic' || networkResponse.type === 'cors')) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseClone);
                    });
                }
                return networkResponse;
            })
            .catch(async () => {
                // Network unavailable (Device is offline or disconnected) -> Fallback to Cache
                console.warn('[TMHIS SW] Device is offline. Serving resource from local cache:', request.url);
                const cachedResponse = await caches.match(request);
                if (cachedResponse) {
                    return cachedResponse;
                }

                // If navigation request and not in cache, fallback to root index.html
                if (request.headers.get('accept')?.includes('text/html') || request.mode === 'navigate') {
                    const indexCached = await caches.match('/index.html');
                    if (indexCached) {
                        return indexCached;
                    }
                }

                return new Response('Offline: Requested resource is not available in local cache.', {
                    status: 503,
                    statusText: 'Service Unavailable',
                    headers: { 'Content-Type': 'text/plain' }
                });
            })
    );
});
