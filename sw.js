// Guarda la app en el dispositivo para que abra sin internet.
// Los datos no pasan por aquí: viven en IndexedDB y se sincronizan con GitHub desde la app.
const VERSION = 'v2-2026-10-27h';
const SHELL = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/sync.js',
  './js/github.js',
  './js/store.js',
  './js/ui.js',
  './js/prefs.js',
  './js/calc.js',
  './js/views/resumen.js',
  './js/views/lista.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' evita guardar archivos viejos del caché del navegador (GitHub Pages guarda 10 min).
  // La versión nueva entra sola al abrir la app (sin tener que tocar "Actualizar").
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Primero lo guardado (abre al instante y sin internet); la app nueva llega con un SW nuevo.
  event.respondWith(
    caches.match(event.request, { ignoreSearch: true }).then((hit) => hit || fetch(event.request).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(event.request, copy));
      }
      return res;
    }).catch(() => caches.match('./index.html'))),
  );
});
