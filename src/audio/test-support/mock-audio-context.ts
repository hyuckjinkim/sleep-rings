// Minimal Web Audio mock for unit tests. jsdom ships no Web Audio API at all, so engine tests
// inject this instead — it satisfies the EngineAudioContext adapter surface from web-audio-types.ts.
import { vi } from 'vitest'
import type {
  EngineAudioBuffer,
  EngineAudioContext,
  EngineAudioParam,
  EngineBufferSourceNode,
  EngineDynamicsCompressorNode,
  EngineGainNode,
  EnginePannerNode,
  EngineStereoPannerNode,
} from '../web-audio-types'

function createParam(initial = 0): EngineAudioParam {
  const param: EngineAudioParam = {
    value: initial,
    setValueAtTime: vi.fn((v: number) => {
      param.value = v
    }),
    // ponytail: ramps resolve their target immediately (no simulated audio clock) — enough to
    // assert *what* the engine scheduled, not real-time interpolation.
    linearRampToValueAtTime: vi.fn((v: number) => {
      param.value = v
    }),
    cancelScheduledValues: vi.fn(),
  }
  return param
}

function createAudioNode() {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
  }
}

export function createMockAudioBuffer(
  length: number,
  sampleRate: number,
  channels = 1,
): EngineAudioBuffer & { channelData: Float32Array[] } {
  const channelData = Array.from({ length: channels }, () => new Float32Array(length))
  return {
    duration: length / sampleRate,
    length,
    numberOfChannels: channels,
    sampleRate,
    channelData,
    copyToChannel(source: Float32Array, channel: number) {
      channelData[channel].set(source)
    },
    getChannelData(channel: number) {
      return channelData[channel]
    },
  }
}

export function createMockAudioContext(sampleRate = 48000): EngineAudioContext {
  const ctx = {} as EngineAudioContext
  Object.assign(ctx, {
    currentTime: 0,
    sampleRate,
    destination: createAudioNode(),
    state: 'suspended',
    createGain: vi.fn(
      (): EngineGainNode => ({
        ...createAudioNode(),
        gain: createParam(1),
      }),
    ),
    createPanner: vi.fn(
      (): EnginePannerNode => ({
        ...createAudioNode(),
        panningModel: 'HRTF',
        distanceModel: 'inverse',
        refDistance: 1,
        maxDistance: 10,
        rolloffFactor: 1,
        positionX: createParam(0),
        positionY: createParam(0),
        positionZ: createParam(0),
      }),
    ),
    createStereoPanner: vi.fn(
      (): EngineStereoPannerNode => ({
        ...createAudioNode(),
        pan: createParam(0),
      }),
    ),
    createDynamicsCompressor: vi.fn(
      (): EngineDynamicsCompressorNode => ({
        ...createAudioNode(),
        threshold: createParam(-24),
        knee: createParam(30),
        ratio: createParam(12),
        attack: createParam(0.003),
        release: createParam(0.25),
      }),
    ),
    createBufferSource: vi.fn(
      (): EngineBufferSourceNode => ({
        ...createAudioNode(),
        buffer: null,
        loop: false,
        loopStart: 0,
        loopEnd: 0,
        start: vi.fn(),
        stop: vi.fn(),
      }),
    ),
    createBuffer: vi.fn((channels: number, length: number, sr: number) => createMockAudioBuffer(length, sr, channels)),
    decodeAudioData: vi.fn(async (data: ArrayBuffer) => createMockAudioBuffer(data.byteLength / 4, sampleRate)),
    resume: vi.fn(async () => {
      ctx.state = 'running'
    }),
    suspend: vi.fn(async () => {
      ctx.state = 'suspended'
    }),
    close: vi.fn(async () => {
      ctx.state = 'closed'
    }),
  } satisfies EngineAudioContext)
  return ctx
}
