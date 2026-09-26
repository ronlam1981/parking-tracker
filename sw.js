const CACHE_NAME = 'parking-v9';
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
        // Network-first，但有以下保護，避免出現白畫面：
        //  1. 5 秒收唔到就改用快取（網絡好慢／掛住嘅情況）
        //  2. 網絡回應唔係 200 OK（502、超時頁、酒店/商場 Wi-Fi 攔截頁）一律棄用，改用快取
        //  3. 快取都搵唔到先至用網絡回應，最後兜底用 './index.html'
        e.respondWith((async () => {
            const cached = async () =>
                (await caches.match(e.request, { ignoreSearch: true })) ||
                (await caches.match('./index.html')) ||
                (await caches.match('./'));

            let response = null;
            try {
                response = await Promise.race([
                    fetch(e.request),
                    new Promise(resolve => setTimeout(() => resolve(null), 5000))
                ]);
            } catch (err) {
                response = null;
            }

            if (response && response.ok && response.status === 200) {
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put('./index.html', clone)).catch(() => {});
                return response;
            }

            const fallback = await cached();
            if (fallback) return fallback;
            if (response) return response;
            return new Response(
                '<!DOCTYPE html><meta charset="utf-8"><body style="font-family:-apple-system,sans-serif;padding:40px;text-align:center"><h3>暫時連唔到網絡</h3><p>請檢查網絡後再開一次。</p><button onclick="location.reload()" style="padding:10px 20px;font-size:16px">重新載入</button></body>',
                { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
            );
        })());
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
