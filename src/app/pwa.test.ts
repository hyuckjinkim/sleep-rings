import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Capacitor } from '@capacitor/core'
import { registerServiceWorker } from './pwa'

describe('registerServiceWorker', () => {
  const register = vi.fn(() => Promise.resolve({}))

  beforeEach(() => {
    Object.defineProperty(navigator, 'serviceWorker', {
      value: { register },
      configurable: true,
    })
  })
  afterEach(() => {
    register.mockClear()
    vi.restoreAllMocks()
    Reflect.deleteProperty(navigator, 'serviceWorker')
  })

  it('registers /sw.js in a production web build', () => {
    registerServiceWorker(true)
    expect(register).toHaveBeenCalledWith('/sw.js')
  })

  it('never registers in development', () => {
    registerServiceWorker(false)
    expect(register).not.toHaveBeenCalled()
  })

  it('never registers inside Capacitor', () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)
    registerServiceWorker(true)
    expect(register).not.toHaveBeenCalled()
  })

  it('is a no-op where service workers are unsupported', () => {
    Reflect.deleteProperty(navigator, 'serviceWorker')
    expect(() => registerServiceWorker(true)).not.toThrow()
  })
})

// public/sw.js runs in a fake worker scope: listeners captured, caches and fetch faked in memory.
describe('public/sw.js', () => {
  const ORIGIN = 'https://app.test'
  const code = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')
  type Handler = (event: unknown) => void
  type Req = { url: string; method: string; mode?: string }
  let listeners: Record<string, Handler>
  let stores: Map<string, Map<string, Response>>
  let network: (url: string) => Response | null // null = offline

  const keyOf = (r: string | Req) => new URL(typeof r === 'string' ? r : r.url, ORIGIN).href
  const fetchFake = vi.fn(async (r: string | Req) => {
    const res = network(keyOf(r))
    if (!res) throw new TypeError('Failed to fetch')
    return res
  })
  const cacheOf = (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map())
    const map = stores.get(name)!
    return {
      put: async (r: string | Req, res: Response) => {
        map.set(keyOf(r), res)
      },
      match: async (r: string | Req, opts?: { ignoreVary?: boolean }) => varyAware(map.get(keyOf(r)), opts),
    }
  }
  // Real caches compare Vary'd request headers; the fake just misses unless told to ignore Vary.
  const varyAware = (res: Response | undefined, opts?: { ignoreVary?: boolean }) =>
    res && (!res.headers.has('vary') || opts?.ignoreVary) ? res : undefined
  const cachesFake = {
    open: async (name: string) => cacheOf(name),
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    match: async (r: string | Req, opts?: { ignoreVary?: boolean }) => {
      for (const map of stores.values()) if (map.has(keyOf(r))) return varyAware(map.get(keyOf(r)), opts)
      return undefined
    },
  }
  const ok = (body: string, type: string) => new Response(body, { status: 200, headers: { 'content-type': type } })

  async function dispatch(type: string, data: Record<string, unknown> = {}) {
    let responded: Promise<Response> | undefined
    const pending: Promise<unknown>[] = []
    listeners[type]({ ...data, respondWith: (p: Promise<Response>) => (responded = p), waitUntil: (p: Promise<unknown>) => pending.push(p) })
    await Promise.all(pending)
    return responded
  }
  const request = (path: string, mode = 'cors'): Req => ({ url: `${ORIGIN}${path}`, method: 'GET', mode })
  const SHELL_HTML = '<html><link href="./assets/icon-1.svg"><script src="/assets/index-abc.js"></script>v1</html>'
  const defaultNetwork = (url: string): Response | null => {
    const path = new URL(url).pathname
    if (path === '/') return ok(SHELL_HTML, 'text/html')
    if (path === '/assets/index-abc.js') return ok('import(`./web-lazy.js`);fetch("/sw.js");x("https://cdn.example/a.js")', 'text/javascript')
    if (path === '/assets/web-lazy.js') return ok('import(`./web-missing.js`)', 'text/javascript')
    if (path === '/assets/web-missing.js') return new Response('nope', { status: 404 })
    return ok('data', 'application/javascript')
  }
  const cachedPaths = () => [...stores.get('sleeprings-v1')!.keys()].map((k) => new URL(k).pathname).sort()

  beforeEach(async () => {
    listeners = {}
    stores = new Map()
    fetchFake.mockClear()
    network = defaultNetwork
    const self = {
      location: new URL(`${ORIGIN}/sw.js`),
      addEventListener: (type: string, fn: Handler) => (listeners[type] = fn),
      skipWaiting: async () => {},
      clients: { claim: async () => {} },
    }
    new Function('self', 'caches', 'fetch', code)(self, cachesFake, fetchFake)
    await dispatch('install')
  })

  it('caches the app shell on install and drops older versions on activate', async () => {
    stores.set('sleeprings-v0', new Map())
    stores.set('someone-else', new Map())
    await dispatch('activate')
    expect([...stores.keys()].sort()).toEqual(['sleeprings-v1', 'someone-else'])
    expect(stores.get('sleeprings-v1')!.has(`${ORIGIN}/`)).toBe(true)
  })

  it('precaches the shell and every /assets/ file it reaches, lazy chunks included', () => {
    // web-missing.js 404s and is skipped without failing install; /sw.js and other origins are ignored
    expect(cachedPaths()).toEqual(['/', '/assets/icon-1.svg', '/assets/index-abc.js', '/assets/web-lazy.js'])
  })

  it('navigations are network-first, then fall back to the cached shell offline (any URL)', async () => {
    network = () => ok('<html>v2</html>', 'text/html')
    expect(await (await dispatch('fetch', { request: request('/', 'navigate') }))!.text()).toBe('<html>v2</html>')
    network = () => null
    const offline = await dispatch('fetch', { request: request('/?utm=x', 'navigate') })
    expect(await offline!.text()).toBe('<html>v2</html>')
  })

  it('assets and sounds are cache-first after the first successful fetch', async () => {
    await dispatch('fetch', { request: request('/assets/later-x.js') })
    await dispatch('fetch', { request: request('/sounds/seaside.m4a') })
    network = () => null
    expect(await (await dispatch('fetch', { request: request('/assets/later-x.js') }))!.text()).toBe('data')
    expect(await (await dispatch('fetch', { request: request('/sounds/seaside.m4a') }))!.text()).toBe('data')
  })

  it('never caches an HTML fallback or an error as an asset or sound', async () => {
    network = () => ok('<html>spa</html>', 'text/html')
    await dispatch('fetch', { request: request('/sounds/missing.m4a') })
    network = () => new Response('nope', { status: 404 })
    await dispatch('fetch', { request: request('/assets/gone.js') })
    const cache = stores.get('sleeprings-v1')!
    expect(cache.has(`${ORIGIN}/sounds/missing.m4a`)).toBe(false)
    expect(cache.has(`${ORIGIN}/assets/gone.js`)).toBe(false)
  })

  it('leaves other requests alone', async () => {
    expect(await dispatch('fetch', { request: { ...request('/assets/a.js'), method: 'POST' } })).toBeUndefined()
    expect(await dispatch('fetch', { request: { url: 'https://cdn.example/x.js', method: 'GET' } })).toBeUndefined()
    expect(await dispatch('fetch', { request: request('/mobile/silence.wav') })).toBeUndefined()
  })

  it('serves a cached asset offline even when the host sent Vary: Origin', async () => {
    network = (url) => {
      const res = defaultNetwork(url)!
      return new Response(res.body, { status: res.status, headers: { 'content-type': res.headers.get('content-type')!, vary: 'Origin' } })
    }
    stores.clear()
    await dispatch('install')
    network = () => null
    expect(await (await dispatch('fetch', { request: request('/assets/web-lazy.js') }))!.text()).toBe('import(`./web-missing.js`)')
  })
})
