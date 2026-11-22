// Web-only offline support (public/sw.js). Never inside Capacitor: native ships its files in the app
// and iOS's capacitor:// scheme doesn't run service workers. Production builds only, so dev never
// serves a stale cached shell.
import { Capacitor } from '@capacitor/core'

export function registerServiceWorker(isProd: boolean = import.meta.env.PROD): void {
  if (!isProd || Capacitor.isNativePlatform() || !('serviceWorker' in navigator)) return
  navigator.serviceWorker
    .register(`${import.meta.env.BASE_URL}sw.js`)
    .catch((err: unknown) => console.warn('[pwa] service worker registration failed', err))
}
