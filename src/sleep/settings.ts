// Playback preferences (start fade-in, sleep-timer fade-out, volume cap). Same shape as src/screen/store.ts:
// a tiny store that persists itself and pushes its values into the engine. The mixer store never
// imports this — startSleepTimer() takes the fade length as an argument instead.
import { create } from 'zustand'
import { soundEngine } from '../mixer/engine/instance'
import { loadPlaybackSettings, savePlaybackSettings } from './persistence'
import type { PlaybackSettings } from './persistence'

interface PlaybackSettingsStore extends PlaybackSettings {
  setFadeInSec(sec: number): void
  setSleepFadeSec(sec: number): void
  setVolumeCap(cap: number): void
}

function persist(patch: Partial<PlaybackSettings>): void {
  const { fadeInSec, sleepFadeSec, volumeCap } = { ...usePlaybackSettings.getState(), ...patch }
  try {
    savePlaybackSettings({ fadeInSec, sleepFadeSec, volumeCap })
  } catch {
    // ponytail: storage full/blocked — the setting still applies for this session
  }
}

const initial = loadPlaybackSettings()
soundEngine.setStartFade(initial.fadeInSec)
soundEngine.setVolumeCap(initial.volumeCap)

export const usePlaybackSettings = create<PlaybackSettingsStore>((set) => ({
  ...initial,

  setFadeInSec(fadeInSec) {
    persist({ fadeInSec })
    soundEngine.setStartFade(fadeInSec)
    set({ fadeInSec })
  },

  setSleepFadeSec(sleepFadeSec) {
    persist({ sleepFadeSec })
    set({ sleepFadeSec })
  },

  setVolumeCap(volumeCap) {
    persist({ volumeCap })
    soundEngine.setVolumeCap(volumeCap)
    set({ volumeCap })
  },
}))
