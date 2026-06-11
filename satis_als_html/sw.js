const CACHE_NAME = 'satis-calc-v1';
const ASSETS_TO_CACHE = [
  'index.html',
  'frontend.js',
  'style/style.css',
  'hintergrund.png'
];

// 1. Service Worker installieren und Dateien in den Handy-Cache laden
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('PWA: Dateien werden für den Offline-Modus gecacht...');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// 2. Aktivieren und alte Cache-Versionen aufräumen
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('PWA: Altem Cache gelöscht:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Netzwerkanfragen abfangen und Dateien direkt aus dem lokalen Cache laden
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      // Wenn die Datei im Cache existiert, lade sie offline, ansonsten lade sie aus dem Netz
      return cachedResponse || fetch(event.request);
    })
  );
});