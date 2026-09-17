import {
  CanvasTexture,
  DoubleSide,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from 'three'
import type HlsType from 'hls.js'

const LCD_W = 1024
const LCD_H = 256
const RUBY = '#f06a28'
const RUBY_GLOW = 'rgba(240, 90, 28, 0.85)'

const _look = new Vector3()
const _pos = new Vector3()
const _z = new Vector3(0, 0, 1)
const _face = new Vector3()
const _q = new Quaternion()

export type RadioStationId = 'off' | 'eska-rock' | 'antyradio' | 'tok-fm' | 'trojka' | 'rmf-fm' | 'zet'

export type RadioStation = {
  id: Exclude<RadioStationId, 'off'>
  name: string
  lcd: string
  urls: string[]
}

/** Public HTTPS Icecast / HLS endpoints the stations publish. */
export const RADIO_STATIONS: RadioStation[] = [
  {
    id: 'eska-rock',
    name: 'Eska Rock',
    lcd: 'ESKA RK',
    urls: ['https://ic2.smcdn.pl/5380-1.mp3', 'https://ic1.smcdn.pl/5380-1.mp3'],
  },
  {
    id: 'antyradio',
    name: 'Antyradio',
    lcd: 'ANTYRADIO',
    urls: ['https://an.cdn.eurozet.pl/ant-web.mp3', 'https://an02.cdn.eurozet.pl/ant-web.mp3'],
  },
  {
    id: 'tok-fm',
    name: 'TOK FM',
    lcd: 'TOK FM',
    urls: ['https://radiostream.pl/tuba10-1.mp3'],
  },
  {
    id: 'trojka',
    name: 'Trójka',
    lcd: 'TROJKA',
    urls: ['https://stream13.polskieradio.pl/pr3/pr3.sdp/playlist.m3u8'],
  },
  {
    id: 'rmf-fm',
    name: 'RMF FM',
    lcd: 'RMF FM',
    urls: [
      'https://rs6-krk-cyfronet.rmfstream.pl/rmf_fm',
      'https://rs202-krk-cyfronet.rmfstream.pl/rmf_fm',
      'https://rs102-krk.rmfstream.pl/RMFFM48',
    ],
  },
  {
    id: 'zet',
    name: 'Radio Zet',
    lcd: 'RADIO ZET',
    urls: [
      'https://zt01.cdn.eurozet.pl/zet-net.mp3?redirected=01',
      'https://zt02.cdn.eurozet.pl/zet-net.mp3?redirected=02',
    ],
  },
]

export type RadioStatus = 'off' | 'loading' | 'live' | 'error'

function isHlsUrl(url: string): boolean {
  return url.includes('.m3u8')
}

export class RadioPlayer {
  station: RadioStationId = 'off'
  status: RadioStatus = 'off'
  private readonly el: HTMLAudioElement
  private hls: HlsType | null = null
  private urlIndex = 0
  private playGen = 0

  constructor() {
    this.el = new Audio()
    this.el.preload = 'none'
    this.el.volume = 0.42
    this.el.addEventListener('playing', () => {
      this.status = 'live'
    })
    this.el.addEventListener('error', () => {
      if (this.station === 'off' || this.status === 'off') return
      void this.tryNext()
    })
  }

  get playing(): boolean {
    return this.station !== 'off' && this.status === 'live'
  }

  lcdLabel(): string {
    if (this.station === 'off') return ''
    if (this.status === 'loading') return '....'
    if (this.status === 'error') return 'NO SIGNAL'
    const spec = RADIO_STATIONS.find((row) => row.id === this.station)
    return spec?.lcd ?? ''
  }

  async setStation(id: RadioStationId): Promise<void> {
    this.playGen += 1
    const gen = this.playGen
    this.tearDown()
    this.station = id
    if (id === 'off') {
      this.status = 'off'
      return
    }
    this.urlIndex = 0
    this.status = 'loading'
    await this.start(gen)
  }

  private async start(gen: number): Promise<void> {
    const spec = RADIO_STATIONS.find((row) => row.id === this.station)
    const url = spec?.urls[this.urlIndex]
    if (!url) {
      this.status = 'error'
      return
    }
    try {
      if (isHlsUrl(url) && this.el.canPlayType('application/vnd.apple.mpegurl') !== 'probably') {
        await this.playHls(url, gen)
        return
      }
      this.el.src = url
      await this.el.play()
      if (gen !== this.playGen) return
      this.status = 'live'
    } catch {
      if (gen !== this.playGen) return
      await this.tryNext()
    }
  }

  private async playHls(url: string, gen: number): Promise<void> {
    const { default: Hls } = await import('hls.js')
    if (gen !== this.playGen) return
    if (!Hls.isSupported()) {
      this.el.src = url
      await this.el.play()
      return
    }
    this.hls = new Hls({ maxBufferLength: 18, enableWorker: true })
    this.hls.loadSource(url)
    this.hls.attachMedia(this.el)
    await new Promise<void>((resolve, reject) => {
      const hls = this.hls
      if (!hls) {
        reject(new Error('hls missing'))
        return
      }
      const ok = () => {
        hls.off(Hls.Events.ERROR, fail)
        resolve()
      }
      const fail = (_event: unknown, data: { fatal?: boolean }) => {
        if (!data.fatal) return
        hls.off(Hls.Events.MANIFEST_PARSED, ok)
        hls.off(Hls.Events.ERROR, fail)
        reject(new Error('hls fatal'))
      }
      hls.on(Hls.Events.MANIFEST_PARSED, ok)
      hls.on(Hls.Events.ERROR, fail)
    })
    if (gen !== this.playGen) return
    await this.el.play()
    if (gen !== this.playGen) return
    this.status = 'live'
  }

  private async tryNext(): Promise<void> {
    const spec = RADIO_STATIONS.find((row) => row.id === this.station)
    if (!spec || this.station === 'off') return
    this.urlIndex += 1
    if (this.urlIndex >= spec.urls.length) {
      this.status = 'error'
      this.tearDown()
      return
    }
    this.status = 'loading'
    await this.start(this.playGen)
  }

  private tearDown(): void {
    if (this.hls) {
      this.hls.destroy()
      this.hls = null
    }
    this.el.pause()
    this.el.removeAttribute('src')
    this.el.load()
  }
}

export class RadioLcd {
  readonly mesh: Mesh
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D
  private readonly map: CanvasTexture
  private blink = 0
  private lastKey = ''

  constructor(visual: Object3D, eye: { x: number; y: number; z: number }) {
    this.canvas = document.createElement('canvas')
    this.canvas.width = LCD_W
    this.canvas.height = LCD_H
    const ctx = this.canvas.getContext('2d')
    if (!ctx) throw new Error('Missing 2d canvas')
    this.ctx = ctx
    this.map = new CanvasTexture(this.canvas)
    this.map.colorSpace = SRGBColorSpace
    this.map.generateMipmaps = false
    this.map.minFilter = LinearFilter
    this.map.magFilter = LinearFilter
    const mat = new MeshBasicMaterial({
      map: this.map,
      transparent: false,
      toneMapped: false,
      depthTest: true,
      depthWrite: true,
      side: DoubleSide,
    })
    this.mesh = new Mesh(new PlaneGeometry(0.168, 0.048), mat)
    this.mesh.name = 'RadioLcd'
    this.mesh.renderOrder = 0
    this.mesh.castShadow = false
    this.mesh.receiveShadow = false
    this.place(visual, eye)
    this.paint('12:00', true)
  }

  tick(hour: number, label: string, dt: number): void {
    this.blink += dt
    const colon = Math.floor(this.blink * 2) % 2 === 0
    const key = `${label}|${hour.toFixed(3)}|${colon ? 1 : 0}`
    if (key === this.lastKey) return
    this.lastKey = key
    if (label) this.paint(label, false)
    else this.paint(formatClock(hour, colon), true)
    this.map.needsUpdate = true
  }

  private place(visual: Object3D, eye: { x: number; y: number; z: number }): void {
    visual.add(this.mesh)
    // Same seating as the cluster: hull-space offset from the driver eye, then
    // slide along the fascia onto the center-stack DIN. polySurface80 is the
    // steering-column shroud — do not bind to that mesh.
    _pos.set(eye.x, eye.y - 0.358, eye.z + 0.635)
    _look.set(eye.x, eye.y, eye.z)
    const root = visual.parent
    if (root) {
      root.localToWorld(_pos)
      root.localToWorld(_look)
      visual.worldToLocal(_pos)
    }
    this.mesh.position.copy(_pos)
    this.mesh.updateMatrixWorld(true)
    this.mesh.lookAt(_look)
    this.mesh.translateX(0.342)
    this.mesh.translateY(-0.014)
    this.mesh.translateZ(-0.018)
    // Face the fascia, not the driver: lookAt from the stack yaws the quad.
    _face.set(0, 0.18, -0.984).normalize()
    this.mesh.quaternion.copy(_q.setFromUnitVectors(_z, _face))
    this.mesh.rotateZ(Math.PI)
  }

  private paint(text: string, clock: boolean): void {
    const ctx = this.ctx
    ctx.fillStyle = '#1a0c08'
    ctx.fillRect(0, 0, LCD_W, LCD_H)
    ctx.fillStyle = '#2a120c'
    ctx.fillRect(18, 18, LCD_W - 36, LCD_H - 36)
    const glow = ctx.createLinearGradient(0, 0, 0, LCD_H)
    glow.addColorStop(0, 'rgba(240, 90, 28, 0.28)')
    glow.addColorStop(1, 'rgba(18, 8, 6, 0)')
    ctx.fillStyle = glow
    ctx.fillRect(18, 18, LCD_W - 36, LCD_H - 36)
    ctx.fillStyle = RUBY
    ctx.shadowColor = RUBY_GLOW
    ctx.shadowBlur = 28
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = clock
      ? '800 160px ui-monospace, "Cascadia Mono", monospace'
      : '800 118px ui-monospace, "Cascadia Mono", monospace'
    ctx.fillText(text, LCD_W / 2, LCD_H / 2 + 8)
    ctx.shadowBlur = 0
  }
}

function formatClock(hour: number, colon: boolean): string {
  const wrapped = ((hour % 24) + 24) % 24
  const hh = Math.floor(wrapped)
  const mm = Math.floor((wrapped - hh) * 60)
  const sep = colon ? ':' : ' '
  return `${String(hh).padStart(2, '0')}${sep}${String(mm).padStart(2, '0')}`
}

export function mountRadioLcd(visual: Object3D, eye: { x: number; y: number; z: number }): RadioLcd {
  return new RadioLcd(visual, eye)
}
