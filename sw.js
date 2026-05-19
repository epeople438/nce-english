const CACHE_NAME = 'nce-english-v6';

// All files to cache for offline use
const CACHE_FILES = [
  './',
  './index.html',
  './manifest.json',
  './styles/nce-ipad.css',
  './styles/nce-lesson-shell.css',
  './scripts/lesson-data-1-144.js',
  './scripts/nce-lesson-shell.js',
  './icon-192.png',
  './icon-512.png',
  './lessons/lesson1.html',
];

// Install: cache all files
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(CACHE_FILES);
    })
  );
  self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: serve from cache, fallback to network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached => {
      return cached || fetch(event.request).then(response => {
        // Cache new lesson files dynamically
        if (event.request.url.includes('/lessons/')) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => {
        // Offline fallback for navigation
        if (event.request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
