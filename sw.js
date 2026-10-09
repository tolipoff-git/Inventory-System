const CACHE_PREFIX = 'inv-inventory-';
const CACHE_VERSION = 'v128-1dda552';
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;
const ASSETS_TO_CACHE = [
  './', './index.html', './manifest.webmanifest', './favicon.ico',
  './icon-32.png', './icon-48.png', './icon-72.png', './icon-96.png',
  './icon-128.png', './icon-144.png', './icon-192.png', './icon-256.png', './icon-512.png'
];
// Vite fills this with the entire generated asset graph at build time.
const BUNDLE_ASSETS = [/* __BUNDLE_ASSETS__ */];
const ALL_ASSETS = ASSETS_TO_CACHE.concat(BUNDLE_ASSETS);
const ASSET_PATHS = new Set(ALL_ASSETS.map(path => new URL(path, self.location.href).pathname));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ALL_ASSETS)));
  // Let an existing session finish; explicit Update PWA already reloads safely.
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  // Never cache sync API data, POSTs, or third-party relay responses.
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cached = () => caches.open(CACHE_NAME).then(cache => cache.match('./index.html', { ignoreVary: true }));
      try {
        const response = await fetch(request);
        // Keep the installation's coherent shell: a new navigation HTML could
        // refer to bundles that have not yet been cached by a new worker.
        return response.ok ? response : (await cached()) || response;
      } catch {
        return (await cached()) || Response.error();
      }
    })());
    return;
  }
  if (!ASSET_PATHS.has(url.pathname)) return;
  // Preloaded public assets can carry Vary: Origin (e.g. preview/CDN CORS).
  // Module requests and install requests use different Origin headers; these
  // same-origin, explicitly listed static files have one public representation.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      const response = await fetch(request);
      if (!response.ok) return (await cache.match(request, { ignoreVary: true })) || response;
      try { await cache.put(request, response.clone()); } catch { /* cache quota must not break online use */ }
      return response;
    } catch {
      return (await cache.match(request, { ignoreVary: true })) || Response.error();
    }
  })());
});
