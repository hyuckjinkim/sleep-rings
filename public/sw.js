// Offline support for the web build only — registered from src/app/pwa.ts, never inside Capacitor
// (native ships its files in the app, and iOS's custom scheme doesn't run service workers).
// Bump VERSION to drop every older cache on the next activate.
const VERSION = 'v1'
const CACHE = `sleeprings-${VERSION}`
const SHELL = '/' // every navigation is the same SPA shell, so one fixed key serves them all offline

// Real files only: an SPA host answers a missing file with index.html + 200 (same rule as
// src/audio/loader.ts), and a cache-first entry would keep that forever.
const isCacheable = (res) => res.ok && !(res.headers.get('content-type') || '').includes('text/html')
const isSound = (path) => /^\/sounds\/[^/]+\.m4a$/.test(path)

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(SHELL))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('sleeprings-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

// Network first so a deploy shows up on the next online load; the cached shell only when offline.
async function shellNetworkFirst(request) {
  try {
    const res = await fetch(request)
    if (res.ok) await (await caches.open(CACHE)).put(SHELL, res.clone())
    return res
  } catch (err) {
    const cached = await caches.match(SHELL)
    if (cached) return cached
    throw err
  }
}

// Hashed /assets/* never change under one name; sounds are cached the first time they're played.
// ponytail: superseded hashed assets stay until VERSION is bumped — prune on activate if that grows.
// ignoreVary: hosts send `Vary: Origin`, and crossorigin module scripts carry an Origin header the
// worker's own prefetch below didn't — a hashed file is the same bytes either way.
async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreVary: true })
  if (cached) return cached
  const res = await fetch(request)
  if (isCacheable(res)) await (await caches.open(CACHE)).put(request, res.clone())
  return res
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (request.mode === 'navigate') event.respondWith(shellNetworkFirst(request))
  else if (url.pathname.startsWith('/assets/') || isSound(url.pathname)) event.respondWith(cacheFirst(request))
})

// The page loaded its first-visit assets before this worker existed; it posts their URLs here
// (src/app/pwa.ts) so the next offline load has them. Same-origin /assets/ only, never re-fetched.
self.addEventListener('message', (event) => {
  const urls = Array.isArray(event.data) ? event.data : []
  event.waitUntil(
    caches.open(CACHE).then((cache) =>
      Promise.all(
        urls.map(async (raw) => {
          try {
            const url = new URL(String(raw), self.location.href)
            if (url.origin !== self.location.origin || !url.pathname.startsWith('/assets/')) return
            if (await cache.match(url.href, { ignoreVary: true })) return
            const res = await fetch(url.href)
            if (isCacheable(res)) await cache.put(url.href, res)
          } catch {
            // offline or gone — it gets cached on its next use instead
          }
        }),
      ),
    ),
  )
})
