/* PLANEL service worker — простой offline-first для статики, network-first для /api/* */

const CACHE = 'planel-v1';
const STATIC_ASSETS = [
  '/app',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(STATIC_ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  // API: только сеть, без кэша (mутируют данные)
  if (url.pathname.startsWith('/api/')) return;
  // Внешние ресурсы (CDN, шрифты) — пусть браузер кэширует сам
  if (url.origin !== location.origin) return;
  // GET only
  if (e.request.method !== 'GET') return;

  // Стратегия для HTML: network-first с фолбеком на кэш
  if (e.request.mode === 'navigate' || e.request.destination === 'document') {
    e.respondWith(
      fetch(e.request).then(r => {
        const clone = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
        return r;
      }).catch(() => caches.match(e.request).then(r => r || caches.match('/app')))
    );
    return;
  }

  // Прочая статика: cache-first
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(resp => {
      if (resp.ok) {
        const clone = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone)).catch(() => {});
      }
      return resp;
    }))
  );
});
