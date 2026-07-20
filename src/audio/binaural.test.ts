import { describe, expect, it, vi } from 'vitest'
import { renderBinauralBuffer } from './binaural'
import { createMockAudioBuffer } from './test-support/mock-audio-context'

const SAMPLE_RATE = 48000

function countZeroCrossings(samples: Float32Array): number {
  let count = 0
  for (let i = 1; i < samples.length; i++) {
    if (samples[i - 1] < 0 !== samples[i] < 0) count++ // sign flip = one zero-crossing
  }
  return count
}

describe('renderBinauralBuffer', () => {
  it('creates a stereo buffer sized for the requested duration', () => {
    const host = { createBuffer: vi.fn((channels: number, length: number, sr: number) => createMockAudioBuffer(length, sr, channels)) }
    const seconds = 2
    const buffer = renderBinauralBuffer(host, 200, 6, SAMPLE_RATE, seconds)

    expect(host.createBuffer).toHaveBeenCalledWith(2, SAMPLE_RATE * seconds, SAMPLE_RATE)
    expect(buffer.length).toBe(SAMPLE_RATE * seconds)
  })

  it('encodes carrierHz on the left channel and carrierHz+beatHz on the right', () => {
    const host = { createBuffer: (channels: number, length: number, sr: number) => createMockAudioBuffer(length, sr, channels) }
    const buffer = renderBinauralBuffer(host, 200, 10, SAMPLE_RATE, 1) // 1s -> zero-crossings ~= 2*freq
    const left = buffer.getChannelData(0)
    const right = buffer.getChannelData(1)

    // sin(2*pi*f*t) crosses zero 2f times per second.
    expect(countZeroCrossings(left)).toBeCloseTo(400, -1) // 2 * 200Hz
    expect(countZeroCrossings(right)).toBeCloseTo(420, -1) // 2 * 210Hz
  })

  it('produces finite samples within the tone headroom, non-silent on both channels', () => {
    const host = { createBuffer: (channels: number, length: number, sr: number) => createMockAudioBuffer(length, sr, channels) }
    const buffer = renderBinauralBuffer(host, 200, 4, SAMPLE_RATE, 1)
    for (const channel of [buffer.getChannelData(0), buffer.getChannelData(1)]) {
      let sumSq = 0
      for (let i = 0; i < channel.length; i++) {
        expect(Number.isFinite(channel[i])).toBe(true)
        expect(Math.abs(channel[i])).toBeLessThanOrEqual(0.5)
        sumSq += channel[i] * channel[i]
      }
      expect(Math.sqrt(sumSq / channel.length)).toBeGreaterThan(0)
    }
  })
})
