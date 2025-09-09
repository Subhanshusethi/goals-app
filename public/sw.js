const CACHE_NAME = 'goals-app-v1';
const APP_SHELL = ['/', '/offline.html', '/manifest.webmanifest'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys
      .filter(k => k !== CACHE_NAME)
      .map(k => caches.delete(k))))
  );
  self.clients.claim();
});

// cache strategies
async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request)
    .then((res) => { if (res && res.status === 200) cache.put(request, res.clone()); return res; })
    .catch(() => cached);
  return cached || fetchPromise;
}

async function networkFirst(request) {
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cache = await caches.open(CACHE_NAME);
    return (await cache.match(request)) || caches.match('/offline.html');
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // HTML navigations → network first, fall back offline
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
    return;
  }

  // static assets → stale-while-revalidate
  if (/\.(js|css|woff2?|ttf|otf|png|jpg|jpeg|gif|svg|webp)$/i.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // everything else
  event.respondWith(fetch(req).catch(() => caches.match('/offline.html')));
});

// Minimal placeholder service worker
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // cleanup old caches if any
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // passthrough network by default
});

