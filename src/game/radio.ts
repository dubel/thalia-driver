import {
  Box3,
  CanvasTexture,
  DoubleSide,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
  type Mesh as MeshType,
} from 'three'
import type HlsType from 'hls.js'

const LCD_W = 512
const LCD_H = 128
const RADIO_HOUSING = 'polySurface80_Carro_Plastico_0'

const _box = new Box3()
const _size = new Vector3()
const _center = new Vector3()
const _look = new Vector3()

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

function findMesh(root: Object3D, name: string): MeshType | undefined {
  let found: MeshType | undefined
  root.traverse((child) => {
    const mesh = child as MeshType
    if (mesh.isMesh && mesh.name === name) found = mesh
  })
  return found
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
      depthWrite: true,
      side: DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    })
    this.mesh = new Mesh(new PlaneGeometry(0.122, 0.03), mat)
    this.mesh.name = 'RadioLcd'
    this.mesh.renderOrder = 2
    this.mesh.castShadow = false
    this.mesh.receiveShadow = false
    this.place(visual, eye)
    this.paint('12:00', false)
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
    const housing = findMesh(visual, RADIO_HOUSING)
    if (housing) {
      housing.updateMatrixWorld(true)
      _box.setFromObject(housing)
      _box.getSize(_size)
      _box.getCenter(_center)
      _center.y += _size.y * 0.28
      _center.z -= _size.z * 0.48
      visual.worldToLocal(_center)
      this.mesh.position.copy(_center)
    } else {
      this.mesh.position.set(eye.x - 0.004, eye.y - 0.33, eye.z + 0.64)
    }
    _look.set(eye.x, eye.y, eye.z)
    const root = visual.parent
    if (root) root.localToWorld(_look)
    this.mesh.updateMatrixWorld(true)
    this.mesh.lookAt(_look)
    this.mesh.translateZ(0.012)
  }

  private paint(text: string, clock: boolean): void {
    const ctx = this.ctx
    ctx.fillStyle = '#07140a'
    ctx.fillRect(0, 0, LCD_W, LCD_H)
    const glow = ctx.createLinearGradient(0, 0, 0, LCD_H)
    glow.addColorStop(0, 'rgba(40, 90, 48, 0.35)')
    glow.addColorStop(1, 'rgba(8, 22, 12, 0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, LCD_W, LCD_H)
    ctx.fillStyle = '#6ef56a'
    ctx.shadowColor = 'rgba(90, 255, 110, 0.65)'
    ctx.shadowBlur = 12
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = clock
      ? '700 72px ui-monospace, "Cascadia Mono", monospace'
      : '700 56px ui-monospace, "Cascadia Mono", monospace'
    ctx.fillText(text, LCD_W / 2, LCD_H / 2 + 4)
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
