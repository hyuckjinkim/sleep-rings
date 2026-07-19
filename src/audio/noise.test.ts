import { describe, expect, it, vi } from 'vitest'
import { generateBrownNoise, generateGreenNoise, generatePinkNoise, generateWhiteNoise, renderNoiseBuffer } from './noise'
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
