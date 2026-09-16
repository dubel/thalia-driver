const RAIN_OGG = new URL('../../assets/sfx/rain_loop.ogg', import.meta.url).href
const RAIN_AAC = new URL('../../assets/sfx/rain_loop.m4a', import.meta.url).href
const THUNDER_NEAR_OGG = new URL('../../assets/sfx/thunder_near.ogg', import.meta.url).href
const THUNDER_NEAR_AAC = new URL('../../assets/sfx/thunder_near.m4a', import.meta.url).href
const THUNDER_FAR_OGG = new URL('../../assets/sfx/thunder_far.ogg', import.meta.url).href
const THUNDER_FAR_AAC = new URL('../../assets/sfx/thunder_far.m4a', import.meta.url).href
const BIRD_OGG = new URL('../../assets/sfx/bird_robin.ogg', import.meta.url).href
const BIRD_AAC = new URL('../../assets/sfx/bird_robin.m4a', import.meta.url).href
/** Early-00s Skoda TDI idle (Freesound / Mihacappy, CC0) — same era as the 1.5 dCi Thalia. */
const DIESEL_URL = new URL('../../assets/sfx/diesel_loop.mp3', import.meta.url).href
/** Denis Chardonnet / BigSoundBank, CC0. */
const HORN_URL = new URL('../../assets/sfx/car_horn.mp3', import.meta.url).href

const SILENT_WAV =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'

function preferAac(): boolean {
  const probe = document.createElement('audio')
  return probe.canPlayType('audio/ogg; codecs="vorbis"') !== 'probably'
}

function pick(ogg: string, aac: string): string {
  return preferAac() ? aac : ogg
}

let sharedCtx: AudioContext | null = null
let sharedMaster: GainNode | null = null
let watchingVisibility = false

function makeAudioContext(): AudioContext {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  return new Ctor()
}

function kickHtmlAudio(): void {
  const el = new Audio()
  el.src = SILENT_WAV
  el.preload = 'auto'
  el.volume = 0.01
  void el.play().catch(() => undefined)
}

function ensureContext(): AudioContext {
  if (!sharedCtx) {
    sharedCtx = makeAudioContext()
    sharedMaster = sharedCtx.createGain()
    sharedMaster.gain.value = 0.7
    sharedMaster.connect(sharedCtx.destination)
  }
  if (!watchingVisibility) {
    watchingVisibility = true
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') resumeSharedContext()
    })
  }
  return sharedCtx
}

function resumeSharedContext(): void {
  const ctx = sharedCtx
  if (!ctx || ctx.state === 'running') return
  void ctx.resume().catch(() => undefined)
}

/** Call from a tap/key so Web Audio is unlocked before the pads start. */
export function warmAudioFromGesture(): void {
  kickHtmlAudio()
  ensureContext()
  resumeSharedContext()
}

async function decodeBuffer(ctx: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  const copy = data.slice(0)
  try {
    return await ctx.decodeAudioData(copy)
  } catch {
    const again = data.slice(0)
    return await new Promise((resolve, reject) => {
      const ok = ctx.decodeAudioData(again, resolve, reject)
      if (ok && typeof (ok as Promise<AudioBuffer>).then === 'function') {
        void (ok as Promise<AudioBuffer>).then(resolve, reject)
      }
    })
  }
}

export class GameAudio {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private engineSrc: AudioBufferSourceNode | null = null
  private engineGain: GainNode | null = null
  private engineFilter: BiquadFilterNode | null = null
  private readonly raw = new Map<string, ArrayBuffer>()
  private readonly decoded = new Map<string, AudioBuffer>()
  private engineVol = 0
  private rainGain: GainNode | null = null
  private windGain: GainNode | null = null
  private birdCd = 2
  private ready = false
  private unlocking: Promise<void> | null = null

  async load(): Promise<void> {
    const jobs: [string, string][] = [
      ['rain', pick(RAIN_OGG, RAIN_AAC)],
      ['thunderNear', pick(THUNDER_NEAR_OGG, THUNDER_NEAR_AAC)],
      ['thunderFar', pick(THUNDER_FAR_OGG, THUNDER_FAR_AAC)],
      ['bird', pick(BIRD_OGG, BIRD_AAC)],
      ['engine', DIESEL_URL],
      ['horn', HORN_URL],
    ]
    await Promise.all(
      jobs.map(async ([name, url]) => {
        try {
          const res = await fetch(url)
          if (!res.ok) return
          this.raw.set(name, await res.arrayBuffer())
        } catch {
          /* synth fallback after unlock */
        }
      }),
    )
  }

  prime(): void {
    warmAudioFromGesture()
    this.ctx = ensureContext()
    this.master = sharedMaster
    resumeSharedContext()
  }

  async unlock(): Promise<void> {
    this.prime()
    if (this.ready) {
      await this.ctx?.resume().catch(() => undefined)
      return
    }
    if (this.unlocking) {
      await this.unlocking
      return
    }
    this.unlocking = this.finishUnlock()
    try {
      await this.unlocking
    } finally {
      this.unlocking = null
    }
  }

  private async finishUnlock(): Promise<void> {
    const ctx = this.ctx
    if (!ctx) return
    await ctx.resume()
    await Promise.all(
      [...this.raw].map(async ([name, buf]) => {
        if (this.decoded.has(name)) return
        try {
          this.decoded.set(name, await decodeBuffer(ctx, buf))
        } catch {
          /* skip a bad file instead of killing all audio */
        }
      }),
    )
    if (!this.decoded.has('engine')) this.decoded.set('engine', makeDieselBuffer(ctx))
    if (!this.decoded.has('thunderNear')) this.decoded.set('thunderNear', makeThunderCrackBuffer(ctx))
    if (!this.engineSrc) this.startEngine()
    if (!this.rainGain) this.startWeatherPads()
    this.ready = true
    await ctx.resume()
  }

  setMotion(amount: number): void {
    if (!this.ctx || !this.engineGain || !this.engineSrc) return
    const moving = Math.max(0, Math.min(1, amount))
    this.engineVol += (moving - this.engineVol) * 0.14
    this.engineGain.gain.setTargetAtTime(this.engineVol * 0.52, this.ctx.currentTime, 0.08)
    this.engineSrc.playbackRate.setTargetAtTime(0.86 + this.engineVol * 0.42, this.ctx.currentTime, 0.1)
    if (this.engineFilter) {
      this.engineFilter.frequency.setTargetAtTime(380 + this.engineVol * 920, this.ctx.currentTime, 0.12)
    }
  }

  horn(): void {
    this.play('horn', 0.78, 0.98 + Math.random() * 0.04)
  }

  setWeather(rain: number, wind: number): void {
    if (!this.ctx || !this.rainGain || !this.windGain) return
    const t = this.ctx.currentTime
    this.rainGain.gain.setTargetAtTime(Math.max(0, rain) * 0.34, t, 0.4)
    this.windGain.gain.setTargetAtTime(Math.max(0, wind) * 0.07, t, 0.4)
  }

  thunder(event: { volume: number; far: boolean }): void {
    if (this.ctx && !this.decoded.has('thunderNear')) {
      this.decoded.set('thunderNear', makeThunderCrackBuffer(this.ctx))
    }
    this.play('thunderNear', event.volume, 0.92 + Math.random() * 0.1, 0, 0.55)
    if (event.far) this.play('thunderFar', event.volume * 0.55, 0.88 + Math.random() * 0.12, 0.08, 0.3)
  }

  tickAmbience(dt: number, hour: number, rain: number): void {
    if (!this.ready) return
    this.birdCd -= dt
    const morning = hour >= 5.4 && hour < 11.2
    if (!morning || rain > 0.38 || this.birdCd > 0) return
    if (Math.random() >= 1 - Math.exp(-dt * 0.22)) return
    this.play('bird', 0.14 + Math.random() * 0.16, 0.88 + Math.random() * 0.28)
    this.birdCd = 2.8 + Math.random() * 8.5
  }

  private startEngine(): void {
    const ctx = this.ctx
    const buf = this.decoded.get('engine')
    if (!ctx || !this.master || !buf) return
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    if (buf.duration > 2.4) {
      src.loopStart = 0.35
      src.loopEnd = buf.duration - 0.25
    }
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 420
    const gain = ctx.createGain()
    gain.gain.value = 0
    src.connect(filter)
    filter.connect(gain)
    gain.connect(this.master)
    src.start()
    this.engineSrc = src
    this.engineGain = gain
    this.engineFilter = filter
  }

  private startWeatherPads(): void {
    const ctx = this.ctx
    if (!ctx || !this.master) return
    const rainBuf = this.decoded.get('rain') ?? makeRainBuffer(ctx)
    this.rainGain = loopPad(ctx, this.master, rainBuf, 0, 1, 7200)
    this.windGain = loopPad(ctx, this.master, makeWindBuffer(ctx), 0, 0.92, 760)
  }

  private play(name: string, volume: number, rate: number, delay = 0, offset = 0): void {
    const ctx = this.ctx
    const buf = this.decoded.get(name)
    if (!ctx || !this.master || !buf) return
    if (ctx.state !== 'running') void ctx.resume().catch(() => undefined)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = rate
    const gain = ctx.createGain()
    gain.gain.value = volume
    src.connect(gain)
    gain.connect(this.master)
    const off = offset > 0 && buf.duration > offset + 0.4 ? offset : 0
    src.start(ctx.currentTime + delay, off)
  }
}

function loopPad(
  ctx: AudioContext,
  dest: GainNode,
  buf: AudioBuffer,
  volume: number,
  rate: number,
  cutoff: number,
): GainNode {
  const src = ctx.createBufferSource()
  src.buffer = buf
  src.loop = true
  src.playbackRate.value = rate
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = cutoff
  const gain = ctx.createGain()
  gain.gain.value = volume
  src.connect(filter)
  filter.connect(gain)
  gain.connect(dest)
  src.start()
  return gain
}

function makeRainBuffer(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate
  const n = sr * 2
  const buf = ctx.createBuffer(1, n, sr)
  const data = buf.getChannelData(0)
  for (let i = 0; i < n; i++) {
    const hiss = Math.random() * 2 - 1
    const drip = Math.random() < 0.012 ? (Math.random() * 2 - 1) * 0.9 : 0
    data[i] = hiss * 0.22 + drip
  }
  return buf
}

function makeWindBuffer(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate
  const n = sr * 3
  const buf = ctx.createBuffer(1, n, sr)
  const data = buf.getChannelData(0)
  let brown = 0
  for (let i = 0; i < n; i++) {
    brown = clampAudio(brown + (Math.random() * 2 - 1) * 0.02, -0.4, 0.4)
    data[i] = brown
  }
  return buf
}

function clampAudio(n: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, n))
}

function makeDieselBuffer(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate
  const n = sr * 2
  const buf = ctx.createBuffer(1, n, sr)
  const data = buf.getChannelData(0)
  let brown = 0
  for (let i = 0; i < n; i++) {
    const t = i / sr
    brown = clampAudio(brown + (Math.random() * 2 - 1) * 0.04, -0.55, 0.55)
    const knock = Math.sin(2 * Math.PI * 27 * t) * 0.38 + Math.sin(2 * Math.PI * 54 * t) * 0.16
    const clatter = Math.sin(2 * Math.PI * 81 * t) * 0.1
    data[i] = brown * 0.62 + knock * 0.48 + clatter
  }
  return buf
}

function makeThunderCrackBuffer(ctx: AudioContext): AudioBuffer {
  const sr = ctx.sampleRate
  const n = Math.floor(sr * 1.6)
  const buf = ctx.createBuffer(1, n, sr)
  const data = buf.getChannelData(0)
  let brown = 0
  for (let i = 0; i < n; i++) {
    const t = i / sr
    const crack = Math.min(1, t / 0.012) * Math.exp(-t * 9)
    const rumble = Math.min(1, t / 0.08) * Math.exp(-t * 1.6)
    brown = clampAudio(brown + (Math.random() * 2 - 1) * 0.04, -0.55, 0.55)
    const snap = (Math.random() * 2 - 1) * crack * 0.7
    const boom = Math.sin(2 * Math.PI * (48 + t * 18) * t) * rumble * 0.45
    data[i] = snap + brown * rumble * 0.85 + boom
  }
  return buf
}
