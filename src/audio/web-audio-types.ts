// Minimal structural subset of the Web Audio API that SoundEngine actually touches.
// jsdom has no Web Audio API at all, so tests inject a lightweight mock satisfying this
// shape instead of a real AudioContext. Real browser AudioContext/GainNode/etc. instances
// satisfy these interfaces structurally — no adapter/wrapper code needed in production.

export interface EngineAudioParam {
  value: number
  setValueAtTime(value: number, time: number): void
  linearRampToValueAtTime(value: number, time: number): void
  cancelScheduledValues(time: number): void
}

export interface EngineAudioNode {
  connect(destination: EngineAudioNode): void
  disconnect(): void
}

export interface EngineGainNode extends EngineAudioNode {
  gain: EngineAudioParam
}

export interface EnginePannerNode extends EngineAudioNode {
  panningModel: 'HRTF' | 'equalpower'
  distanceModel: 'inverse' | 'linear' | 'exponential'
  refDistance: number
  maxDistance: number
  rolloffFactor: number
  positionX: EngineAudioParam
  positionY: EngineAudioParam
  positionZ: EngineAudioParam
}

export interface EngineStereoPannerNode extends EngineAudioNode {
  pan: EngineAudioParam
}

export interface EngineDynamicsCompressorNode extends EngineAudioNode {
  threshold: EngineAudioParam
  knee: EngineAudioParam
  ratio: EngineAudioParam
  attack: EngineAudioParam
  release: EngineAudioParam
}

export interface EngineBiquadFilterNode extends EngineAudioNode {
  type: BiquadFilterType
  frequency: EngineAudioParam
  gain: EngineAudioParam
}

export interface EngineAudioBuffer {
  readonly duration: number
  readonly length: number
  readonly numberOfChannels: number
  readonly sampleRate: number
  copyToChannel(source: Float32Array, channelNumber: number): void
  getChannelData(channel: number): Float32Array
}

export interface EngineBufferSourceNode extends EngineAudioNode {
  buffer: EngineAudioBuffer | null
  loop: boolean
  loopStart: number
  loopEnd: number
  start(when?: number): void
  stop(): void
}

export interface EngineAudioContext {
  currentTime: number
  readonly sampleRate: number
  readonly destination: EngineAudioNode
  state: 'suspended' | 'running' | 'closed'
  createGain(): EngineGainNode
  createPanner(): EnginePannerNode
  createStereoPanner(): EngineStereoPannerNode
  createDynamicsCompressor(): EngineDynamicsCompressorNode
  createBiquadFilter(): EngineBiquadFilterNode
  createBufferSource(): EngineBufferSourceNode
  createBuffer(numberOfChannels: number, length: number, sampleRate: number): EngineAudioBuffer
  decodeAudioData(data: ArrayBuffer): Promise<EngineAudioBuffer>
  resume(): Promise<void>
  suspend(): Promise<void>
  close(): Promise<void>
}
