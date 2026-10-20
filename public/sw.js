const CACHE = 'bahnometer-shell-v1';
const SHELL = ['/', '/index.html', '/styles.css', '/app.js', '/domain.js', '/demo.js', '/icon.svg', '/apple-touch-icon.png', '/icon-192.png', '/icon-512.png', '/manifest.webmanifest'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('bahnometer-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Never cache timetable/API responses, and never substitute a successful cached API response.
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request, { cache: 'no-store' }));
    return;
  }
  if (!SHELL.includes(url.pathname)) return;
  event.respondWith(fetch(event.request).catch(async () => {
    const cached = await caches.match(url.pathname);
    return cached || Response.error();
  }));
});
