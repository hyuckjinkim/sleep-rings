// Runtime engine selection: real SoundEngine in the browser, mock under test.
// ponytail: jsdom (vitest) has no AudioContext global, so feature-detecting it is enough
// to keep store.test.ts working unmodified while the real app gets real audio.
import { SoundEngine as RealSoundEngine } from '../../audio'
import { createMockSoundEngine } from './mockSoundEngine'
import type { SoundEngine } from './SoundEngine'

export const soundEngine: SoundEngine =
  typeof AudioContext !== 'undefined' ? new RealSoundEngine() : createMockSoundEngine()
