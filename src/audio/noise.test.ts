import { describe, expect, it, vi } from 'vitest'
import {
  generateBrownNoise,
  generateGreenNoise,
  generatePinkNoise,
  generateRainNoise,
  generateStreamNoise,
  generateWavesNoise,
  generateWhiteNoise,
  generateWindNoise,
  NOISE_BUFFER_SECONDS,
  renderNoiseBuffer,
} from './noise'
import { createMockAudioBuffer } from './test-support/mock-audio-context'

const SAMPLE_RATE = 48000
const LENGTH = 4800 // 0.1s — enough for sanity checks without a slow test

function rms(samples: Float32Array): number {
  let sumSq = 0
  for (let i = 0; i < samples.length; i++) sumSq += samples[i] * samples[i]
  return Math.sqrt(sumSq / samples.length)
}

describe.each([
  ['white', () => generateWhiteNoise(LENGTH)],
  ['pink', () => generatePinkNoise(LENGTH)],
  ['brown', () => generateBrownNoise(LENGTH)],
  ['green', () => generateGreenNoise(LENGTH, SAMPLE_RATE)],
  ['rain', () => generateRainNoise(LENGTH, SAMPLE_RATE)],
  ['wind', () => generateWindNoise(LENGTH, SAMPLE_RATE)],
  ['waves', () => generateWavesNoise(LENGTH, SAMPLE_RATE)],
  ['stream', () => generateStreamNoise(LENGTH, SAMPLE_RATE)],
] as const)('%s noise generator', (_name, generate) => {
  it('produces the requested length, finite samples within [-1, 1], and non-zero energy', () => {
    const samples = generate()
    expect(samples.length).toBe(LENGTH)
    for (let i = 0; i < samples.length; i++) {
      expect(Number.isFinite(samples[i])).toBe(true)
      expect(samples[i]).toBeGreaterThanOrEqual(-1)
      expect(samples[i]).toBeLessThanOrEqual(1)
    }
    expect(rms(samples)).toBeGreaterThan(0)
  })
})

describe('nature generators are RMS-matched to the existing noise colors (E3 §7 tuning requirement)', () => {
  // Mirrors noise.ts's internal NATURE_TARGET_RMS — duplicated here as the expected value under
  // test, not imported, so this catches the target drifting silently. See noise.ts for why 0.12
  // (not a straight PEAK_TARGET/sqrt(3) derivation off white noise).
  const NATURE_TARGET_RMS = 0.12
  const DEFAULT_SECONDS = 10 // matches sound-engine.ts's NOISE_SECONDS default (rain/stream use it)

  it.each([
    // wind/waves bake exactly one amplitude-swell cycle per buffer (see NOISE_BUFFER_SECONDS) —
    // a 1s slice always starts at the swell's trough (phase 0) and badly understates RMS, so
    // this measures each generator at its real deployed buffer length, same as production.
    ['rain', () => generateRainNoise(SAMPLE_RATE * DEFAULT_SECONDS, SAMPLE_RATE)],
    ['wind', () => generateWindNoise(SAMPLE_RATE * NOISE_BUFFER_SECONDS.wind!, SAMPLE_RATE)],
    ['waves', () => generateWavesNoise(SAMPLE_RATE * NOISE_BUFFER_SECONDS.waves!, SAMPLE_RATE)],
    ['stream', () => generateStreamNoise(SAMPLE_RATE * DEFAULT_SECONDS, SAMPLE_RATE)],
  ] as const)('%s RMS lands within 20%% of the shared nature-sound target at its real deployed buffer length', (_name, generate) => {
    const measured = rms(generate())
    expect(measured).toBeGreaterThan(NATURE_TARGET_RMS * 0.8)
    expect(measured).toBeLessThan(NATURE_TARGET_RMS * 1.2)
  })
})

describe('renderNoiseBuffer', () => {
  it('creates a mono buffer sized for the requested duration and copies samples into it', () => {
    const host = { createBuffer: vi.fn((channels: number, length: number, sr: number) => createMockAudioBuffer(length, sr, channels)) }
    const seconds = 2
    const buffer = renderNoiseBuffer(host, 'white', SAMPLE_RATE, seconds)

    expect(host.createBuffer).toHaveBeenCalledWith(1, SAMPLE_RATE * seconds, SAMPLE_RATE)
    expect(buffer.length).toBe(SAMPLE_RATE * seconds)
    expect(rms(buffer.getChannelData(0))).toBeGreaterThan(0)
  })
})
