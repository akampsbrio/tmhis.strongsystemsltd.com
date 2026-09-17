/**
 * TMHIS Service Worker - Offline Application Shell Cache (Network-First Strategy)
 * 
 * Rules:
 * 1. When Online: Always fetch the latest, updated assets directly from the network
 *    and update the local cache in the background.
 * 2. When Offline: Automatically fall back to the cached copy of the application shell.
 */

const CACHE_NAME = 'tmhis-shell-v53';
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/css/app.css',
    '/js/api.js',
    '/js/auth.js',
    '/js/db.js',
    '/js/sync.js',
    '/js/guides.js',
    '/js/schedule.js',
    '/js/assessments.js',
    '/js/exams.js',
    '/js/app.js',
    '/manifest.json'
];

// Helper: fetch with strict timeout
function fetchWithTimeout(request, timeoutMs = 2500) {
    return new Promise((resolve, reject) => {
        const controller = new AbortController();
        const timer = setTimeout(() => {
            controller.abort();
            reject(new Error('Network timeout'));
        }, timeoutMs);

        fetch(request, { signal: controller.signal })
            .then(res => {
                clearTimeout(timer);
                resolve(res);
            })
            .catch(err => {
                clearTimeout(timer);
                reject(err);
            });
    });
}

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

// Fetch Event: Fast-Network with Instant Offline Fallback
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const requestUrl = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }

    // 1. API requests: Instant offline response if offline, or fast 2500ms timeout
    if (requestUrl.pathname.startsWith('/api/')) {
        // If browser reports offline, don't even attempt network
        if (!navigator.onLine) {
            event.respondWith(
                new Response(JSON.stringify({
                    success: false,
                    data: null,
                    message: 'Device is offline. Served by local store.',
                    errors: ['offline_mode']
                }), {
                    headers: { 'Content-Type': 'application/json' },
                    status: 503
                })
            );
            return;
        }

        event.respondWith(
            fetchWithTimeout(request, 2500).catch(() => {
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

    // 2. Navigation & App Shell Assets (HTML, CSS, JS): Fast network with instant cache fallback
    event.respondWith(
        (async () => {
            // If offline, serve directly from cache immediately
            if (!navigator.onLine) {
                const cached = await caches.match(request);
                if (cached) return cached;
                if (request.headers.get('accept')?.includes('text/html') || request.mode === 'navigate') {
                    const indexCached = await caches.match('/index.html');
                    if (indexCached) return indexCached;
                }
            }

            try {
                const networkResponse = await fetchWithTimeout(request, 2500);
                if (networkResponse && networkResponse.status === 200 && (networkResponse.type === 'basic' || networkResponse.type === 'cors')) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, responseClone);
                    });
                }
                return networkResponse;
            } catch (err) {
                // Fallback to cache immediately
                const cachedResponse = await caches.match(request);
                if (cachedResponse) {
                    return cachedResponse;
                }

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
            }
        })()
    );
});
