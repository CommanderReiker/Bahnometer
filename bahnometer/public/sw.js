const BASE = new URL(self.registration.scope);
const CACHE_PREFIX = `bahnometer-shell:${BASE.pathname}:`;
const CACHE = `${CACHE_PREFIX}v1`;
const SHELL = ['', 'index.html', 'styles.css', 'app.js', 'domain.js', 'demo.js', 'icon.svg', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest'].map(path => new URL(path, BASE).href);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  // Never cache timetable/API responses, and never substitute a successful cached API response.
  if (url.pathname.slice(BASE.pathname.length).startsWith('api/')) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }
  const key = `${url.origin}${url.pathname}`;
  if (!SHELL.includes(key)) return;
  event.respondWith(fetch(event.request).catch(async () => {
    const cached = await caches.match(key);
    return cached || Response.error();
  }));
});
