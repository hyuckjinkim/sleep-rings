// Which mixer layout is active — four ways to keep the orbit in view while using the controls
// below it, selectable in Settings so they can be compared on a real device
// (docs/research/floating-transition.md). Same fail-safe storage pattern as src/plan/store.ts.
import { create } from 'zustand'

export type MixerLayout = 'sheet' | 'collapse' | 'minibar' | 'floating'
export const MIXER_LAYOUTS: readonly MixerLayout[] = ['sheet', 'collapse', 'minibar', 'floating']

const LAYOUT_KEY = 'so.layout'

function readStoredLayout(): MixerLayout {
  try {
    const v = localStorage.getItem(LAYOUT_KEY)
    return (MIXER_LAYOUTS as readonly string[]).includes(v ?? '') ? (v as MixerLayout) : 'sheet'
  } catch {
    return 'sheet'
  }
}

interface LayoutStore {
  layout: MixerLayout
  setLayout(layout: MixerLayout): void
}

export const useLayoutStore = create<LayoutStore>((set) => ({
  layout: readStoredLayout(),
  setLayout(layout) {
    try {
      localStorage.setItem(LAYOUT_KEY, layout)
    } catch {
      /* storage unavailable — the choice just won't survive a reload */
    }
    set({ layout })
  },
}))
