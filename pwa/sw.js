const CACHE = 'claudio-v8'
const PRECACHE = ['/', '/app.js']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)))
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ))
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  // Only cache GET, skip API/WS
  if (e.request.method !== 'GET') return
  if (e.request.url.includes('/api/') || e.request.url.includes('/stream')) return

  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  )
})
