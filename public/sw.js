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
// Quoted file references in HTML/JS: index.html's `/assets/…` and the entry's lazy `./web-….js` chunks.
const FILE_REF = /["'`]((?:\.{1,2}\/|\/)?[\w./-]+\.(?:js|css|svg))["'`]/g

// Precache the shell plus every /assets/ file it reaches (scripts are scanned for their lazy chunks),
// so the very next load works offline, including code paths the first visit never ran.
async function precache() {
  const cache = await caches.open(CACHE)
  const shell = await fetch(SHELL)
  if (!shell.ok) throw new Error(`sw: shell fetch failed (${shell.status})`)
  await cache.put(SHELL, shell.clone())
  const seen = new Set()
  const queue = [[await shell.text(), new URL(SHELL, self.location.href)]]
  while (queue.length > 0) {
    const [text, base] = queue.shift()
    for (const [, ref] of text.matchAll(FILE_REF)) {
      const url = new URL(ref, base)
      if (url.origin !== self.location.origin || !url.pathname.startsWith('/assets/') || seen.has(url.href)) continue
      seen.add(url.href)
      try {
        const res = await fetch(url.href)
        if (!isCacheable(res)) continue
        if (url.pathname.endsWith('.js')) queue.push([await res.clone().text(), url])
        await cache.put(url.href, res)
      } catch {
        // one missing file must not block install — it gets cached on its next use instead
      }
    }
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()))
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
// worker's own precache fetch didn't — a hashed file is the same bytes either way.
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
