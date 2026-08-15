import { describe, expect, it, vi } from 'vitest'
import {
  generateBrookNoise,
  generateBrownNoise,
  generateCampfireNoise,
  generateFanNoise,
  generateGreenNoise,
  generateHeartbeatNoise,
  generateLofiNoise,
  generatePinkNoise,
  generateRainNoise,
  generateStreamNoise,
  generateThunderNoise,
  generateUmbrellaRainNoise,
  generateWavesNoise,
  generateWhiteNoise,
  generateWindNoise,
  generateWombNoise,
  NOISE_BUFFER_SECONDS,
  renderNoiseBuffer,
} from './noise'
import { createMockAudioBuffer } from './test-support/mock-audio-context'

const SAMPLE_RATE = 48000
const LENGTH = 4800 // 0.1s — enough for sanity checks without a slow test
// Envelope-level statistics (RMS, peak) are rendered at a reduced rate over the full duration:
// they're properties of the amplitude envelope over seconds and every filter is parameterised in
// Hz, so the numbers are sample-rate independent — but 48kHz full-length renders are millions of
// samples of per-sample filtering, slow enough that vitest kills the worker as unresponsive.
const RMS_RATE = 8000

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
  ['campfire', () => generateCampfireNoise(LENGTH, SAMPLE_RATE)],
  ['fan', () => generateFanNoise(LENGTH, SAMPLE_RATE)],
  ['thunder', () => generateThunderNoise(LENGTH, SAMPLE_RATE)],
  ['brook', () => generateBrookNoise(LENGTH, SAMPLE_RATE)],
  ['umbrella-rain', () => generateUmbrellaRainNoise(LENGTH, SAMPLE_RATE)],
  ['lofi', () => generateLofiNoise(LENGTH, SAMPLE_RATE)],
  ['heartbeat', () => generateHeartbeatNoise(LENGTH, SAMPLE_RATE)],
  ['womb', () => generateWombNoise(LENGTH, SAMPLE_RATE)],
] as const)('%s noise generator', (_name, generate) => {
  it('produces the requested length, finite samples within [-1, 1], and non-zero energy', () => {
    const samples = generate()
    expect(samples.length).toBe(LENGTH)
    // Aggregate in a plain loop and assert once: a per-sample expect() is ~4800x3x12 calls across
    // this table, slow enough that the worker stops answering the pool's ping and vitest kills it
    // as unresponsive ("Failed to start threads worker"). Same coverage, one assertion.
    let allFinite = true
    let min = Infinity
    let max = -Infinity
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i]
      if (!Number.isFinite(s)) allFinite = false
      if (s < min) min = s
      if (s > max) max = s
    }
    expect({ allFinite, inRange: min >= -1 && max <= 1 }).toEqual({ allFinite: true, inRange: true })
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
    ['rain', () => generateRainNoise(RMS_RATE * DEFAULT_SECONDS, RMS_RATE)],
    ['wind', () => generateWindNoise(RMS_RATE * NOISE_BUFFER_SECONDS.wind!, RMS_RATE)],
    ['waves', () => generateWavesNoise(RMS_RATE * NOISE_BUFFER_SECONDS.waves!, RMS_RATE)],
    ['stream', () => generateStreamNoise(RMS_RATE * DEFAULT_SECONDS, RMS_RATE)],
    // B1 (v0.3.0) additions. campfire/thunder/heartbeat/womb are the highest-crest-factor
    // generators in the module (sparse bursts / single strike / gated pulses) — exactly the
    // shape that can silently undershoot the target via normalizeRms's clip clamp (see noise.ts's
    // NATURE_TARGET_RMS comment). Their gain/rate/decay constants were tuned via a 25-trial Monte
    // Carlo sweep (0/25 failures, no run at the clamp threshold) before being set in noise.ts —
    // this single-run assertion is a regression guard, not the tuning evidence itself.
    ['campfire', () => generateCampfireNoise(RMS_RATE * DEFAULT_SECONDS, RMS_RATE)],
    ['fan', () => generateFanNoise(RMS_RATE * NOISE_BUFFER_SECONDS.fan!, RMS_RATE)],
    ['thunder', () => generateThunderNoise(RMS_RATE * NOISE_BUFFER_SECONDS.thunder!, RMS_RATE)],
    ['brook', () => generateBrookNoise(RMS_RATE * DEFAULT_SECONDS, RMS_RATE)],
    ['umbrella-rain', () => generateUmbrellaRainNoise(RMS_RATE * DEFAULT_SECONDS, RMS_RATE)],
    ['lofi', () => generateLofiNoise(RMS_RATE * NOISE_BUFFER_SECONDS.lofi!, RMS_RATE)],
    ['heartbeat', () => generateHeartbeatNoise(RMS_RATE * NOISE_BUFFER_SECONDS.heartbeat!, RMS_RATE)],
    ['womb', () => generateWombNoise(RMS_RATE * NOISE_BUFFER_SECONDS.womb!, RMS_RATE)],
  ] as const)('%s RMS lands within 20%% of the shared nature-sound target at its real deployed buffer length', (_name, generate) => {
    const measured = rms(generate())
    expect(measured).toBeGreaterThan(NATURE_TARGET_RMS * 0.8)
    expect(measured).toBeLessThan(NATURE_TARGET_RMS * 1.2)
  })
})

describe('B1 synth generators never clip regardless of random seed', () => {
  // campfire/thunder push raw peaks well past the RMS-matching scale factor before normalizeRms's
  // clamp brings them back — a single run wouldn't catch a clamp bug that only clips on some
  // seeds. 25 trials mirrors the sweep used to tune the constants in noise.ts.
  it.each([
    ['campfire', () => generateCampfireNoise(RMS_RATE * 10, RMS_RATE)],
    ['thunder', () => generateThunderNoise(RMS_RATE * NOISE_BUFFER_SECONDS.thunder!, RMS_RATE)],
    ['heartbeat', () => generateHeartbeatNoise(RMS_RATE * NOISE_BUFFER_SECONDS.heartbeat!, RMS_RATE)],
    ['womb', () => generateWombNoise(RMS_RATE * NOISE_BUFFER_SECONDS.womb!, RMS_RATE)],
  ] as const)('%s stays within [-1, 1] across 25 random trials', (_name, generate) => {
    // Track the extreme across all trials and assert once. Per-sample expect() here was ~48M
    // assertion calls, which hung the vitest worker past the pool's liveness timeout.
    let min = Infinity
    let max = -Infinity
    for (let trial = 0; trial < 25; trial++) {
      const samples = generate()
      for (let i = 0; i < samples.length; i++) {
        if (samples[i] < min) min = samples[i]
        if (samples[i] > max) max = samples[i]
      }
    }
    expect({ min: min >= -1, max: max <= 1 }).toEqual({ min: true, max: true })
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
