const CACHE_NAME = 'parking-v3';
const ASSETS = [
    './',
    './index.html',
    './manifest.json'
];

// Install: cache core files
self.addEventListener('install', e => {
    e.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', e => {
    e.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
        )
    );
    self.clients.claim();
});

// Fetch: HTML uses network-first (always get latest when online),
//        other assets use cache-first for speed
self.addEventListener('fetch', e => {
    const url = new URL(e.request.url);
    const isHtml = e.request.mode === 'navigate' ||
        url.pathname.endsWith('.html') ||
        url.pathname === '/' ||
        url.pathname.endsWith('/');

    if (isHtml) {
        // Network-first for HTML: ensures latest code is served
        e.respondWith(
            fetch(e.request).then(response => {
                if (response && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
                }
                return response;
            }).catch(() => caches.match(e.request))
        );
        return;
    }

    // Cache-first for other assets (icons, manifest)
    e.respondWith(
        caches.match(e.request).then(cached => {
            if (cached) {
                fetch(e.request).then(response => {
                    if (response && response.status === 200) {
                        caches.open(CACHE_NAME).then(cache => cache.put(e.request, response));
                    }
                }).catch(() => {});
                return cached;
            }
            return fetch(e.request).then(response => {
                if (response && response.status === 200) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(e.request, clone));
                }
                return response;
            });
        })
    );
});
