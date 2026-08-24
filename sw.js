const CACHE_NAME = 'alcantara-diesel-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
  // Pass-through para permitir requisições dinâmicas do Supabase e CDN
});
