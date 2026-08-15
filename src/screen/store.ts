// Screen-dim idle timer: independent of the sleep timer in src/mixer/store.ts. The sleep timer
// stops audio; this only blacks out the display after N minutes of no pointer/key input. Audio
// keeps playing straight through a dim — this module never touches soundEngine.
import { create } from 'zustand'
import { acquireWakeLock, releaseWakeLock } from './wake-lock'
import { loadDimMinutes, saveDimMinutes } from './persistence'

export type DimMinutes = 5 | 10 | 30 | null // null = "사용 안 함" / off

// ponytail: e2e-only threshold override so tests don't have to wait out real minutes. Set via
// page.addInitScript() before the app boots — see e2e/screen-dim.spec.ts. No real user ever
// defines this global, so it never changes production behavior.
declare global {
  interface Window {
    __SO_TEST_DIM_MS__?: number
  }
}

function dimDelayMs(minutes: DimMinutes): number | null {
  if (minutes === null) return null
  if (typeof window !== 'undefined' && window.__SO_TEST_DIM_MS__ != null) return window.__SO_TEST_DIM_MS__
  return minutes * 60_000
}

interface ScreenStore {
  dimAfterMinutes: DimMinutes
  dimmed: boolean
  setDimAfterMinutes(minutes: DimMinutes): void
  /** Call on any pointer/key activity, on mount, and on visibilitychange. Resets the idle
   * countdown and, if the screen was dimmed, wakes it back up immediately. */
  noteActivity(): void
}

let idleTimer: ReturnType<typeof setTimeout> | undefined

function scheduleIdle(minutes: DimMinutes): void {
  clearTimeout(idleTimer)
  const delay = dimDelayMs(minutes)
  if (delay === null) return
  idleTimer = setTimeout(() => {
    useScreenStore.setState({ dimmed: true })
    releaseWakeLock() // let the OS screen-off timer help too, on panels where it can (OLED)
  }, delay)
}

export const useScreenStore = create<ScreenStore>((set, get) => ({
  dimAfterMinutes: loadDimMinutes(),
  dimmed: false,

  setDimAfterMinutes(minutes) {
    saveDimMinutes(minutes)
    set({ dimAfterMinutes: minutes })
    get().noteActivity()
  },

  noteActivity() {
    const { dimAfterMinutes, dimmed } = get()
    if (dimmed) set({ dimmed: false })
    if (dimAfterMinutes === null) {
      clearTimeout(idleTimer)
      releaseWakeLock() // no dim configured — nothing to hold a lock for
      return
    }
    void acquireWakeLock() // no-op if already held
    scheduleIdle(dimAfterMinutes)
  },
}))
