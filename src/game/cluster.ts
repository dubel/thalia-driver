import {
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

const W = 512
const TACH_MAX = 70
const SPEED_MAX = 220
const IDLE_RPM = 850
const LEFT_DISC = 'polySurface97_Carro_Plastico_0'
const RIGHT_DISC = 'polySurface98_Carro_Plastico_0'

const RUBY = '#f06a28'
const RUBY_DIM = '#9a3e18'
const RUBY_GLOW = 'rgba(240, 90, 28, 0.55)'
const GREY = '#3c3a38'
const GREY_NIGHT = '#161514'
const NEEDLE_DIM = '#454240'
const NEEDLE_NIGHT = '#1c1b1a'
const GREEN = '#3dff6a'

const _look = new Vector3()

function clamp(n: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, n))
}

function mixHex(a: string, b: string, t: number): string {
  const k = clamp(t, 0, 1)
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const ch = (shift: number): number => {
    const ca = (pa >> shift) & 0xff
    const cb = (pb >> shift) & 0xff
    return Math.round(ca + (cb - ca) * k)
  }
  const n = (ch(16) << 16) | (ch(8) << 8) | ch(0)
  return `#${n.toString(16).padStart(6, '0')}`
}

/** 0 at ~7 o'clock, clockwise 270° — Clio II / Thalia Jaeger sweep. */
function sweepAngle(t: number): number {
  return (135 + clamp(t, 0, 1) * 270) * (Math.PI / 180)
}

function findMesh(root: Object3D, name: string): MeshType | undefined {
  let found: MeshType | undefined
  root.traverse((child) => {
    const mesh = child as MeshType
    if (mesh.isMesh && mesh.name === name) found = mesh
  })
  return found
}

type GaugeFace = {
  mesh: Mesh
  canvas: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
  map: CanvasTexture
}

function makeFace(name: string): GaugeFace {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = W
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Missing 2d canvas')
  const map = new CanvasTexture(canvas)
  map.colorSpace = SRGBColorSpace
  map.generateMipmaps = false
  map.minFilter = LinearFilter
  map.magFilter = LinearFilter
  const mat = new MeshBasicMaterial({
    map,
    transparent: true,
    alphaTest: 0.12,
    toneMapped: false,
    depthWrite: true,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -6,
    polygonOffsetUnits: -6,
  })
  const mesh = new Mesh(new PlaneGeometry(0.095, 0.095), mat)
  mesh.name = name
  mesh.renderOrder = 2
  mesh.castShadow = false
  mesh.receiveShadow = false
  return { mesh, canvas, ctx, map }
}

export class Cluster {
  private readonly tach: GaugeFace
  private readonly speed: GaugeFace
  private shownKmh = 0
  private shownTach = IDLE_RPM / 100
  private odoKm = 12840
  private tripKm = 0
  private lit = false
  private night = 0

  constructor(visual: Object3D, eye: { x: number; y: number; z: number }) {
    this.tach = makeFace('ClusterTach')
    this.speed = makeFace('ClusterSpeed')
    this.place(visual, eye)
    this.paint()
  }

  tick(speedMs: number, lightsOn: boolean, dt: number, night = 0): void {
    const kmh = Math.abs(speedMs) * 3.6
    const rpm = IDLE_RPM + kmh * 38
    const tach = rpm / 100
    const kSpeed = 1 - Math.exp(-12 * dt)
    const kTach = 1 - Math.exp(-10 * dt)
    this.shownKmh += (kmh - this.shownKmh) * kSpeed
    this.shownTach += (tach - this.shownTach) * kTach
    this.tripKm += (kmh * dt) / 3600
    this.odoKm += (kmh * dt) / 3600
    this.lit = lightsOn
    this.night = night
    this.paint()
  }

  private place(visual: Object3D, eye: { x: number; y: number; z: number }): void {
    const left = findMesh(visual, LEFT_DISC)
    const right = findMesh(visual, RIGHT_DISC)
    if (left) left.visible = false
    if (right) right.visible = false
    this.seatOnBinnacle(this.tach.mesh, visual, eye, -0.078)
    this.seatOnBinnacle(this.speed.mesh, visual, eye, 0.078)
  }

  private seatOnBinnacle(
    face: Mesh,
    visual: Object3D,
    eye: { x: number; y: number; z: number },
    localX: number,
  ): void {
    visual.add(face)
    const pos = new Vector3(eye.x, eye.y - 0.322, eye.z + 0.86)
    _look.set(eye.x, eye.y, eye.z)
    const root = visual.parent
    if (root) {
      root.localToWorld(pos)
      root.localToWorld(_look)
      visual.worldToLocal(pos)
    }
    face.position.copy(pos)
    face.updateMatrixWorld(true)
    face.lookAt(_look)
    face.translateX(localX)
  }

  private paint(): void {
    this.drawGauge(this.tach, this.shownTach / TACH_MAX, {
      max: TACH_MAX,
      step: 10,
      majors: [0, 10, 30, 50, 70],
      redFrom: 0.82,
      caption: 'rpm × 100',
      battery: true,
    })
    this.tach.map.needsUpdate = true
    this.drawGauge(this.speed, this.shownKmh / SPEED_MAX, {
      max: SPEED_MAX,
      step: 20,
      majors: [0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220],
      redFrom: 1,
      caption: 'km/h',
      lcd: true,
      lights: true,
    })
    this.speed.map.needsUpdate = true
  }

  private drawGauge(
    face: GaugeFace,
    t: number,
    spec: {
      max: number
      step: number
      majors: number[]
      redFrom: number
      caption: string
      lcd?: boolean
      lights?: boolean
      battery?: boolean
    },
  ): void {
    const ctx = face.ctx
    const cx = W / 2
    const cy = W / 2
    const r = 228
    const lit = this.lit
    const dusk = this.night
    const ink = lit ? RUBY : mixHex(GREY, GREY_NIGHT, dusk)
    const inkSoft = lit ? RUBY_DIM : mixHex('#2a2928', '#121110', dusk)
    const needle = lit ? '#ff4a18' : mixHex(NEEDLE_DIM, NEEDLE_NIGHT, dusk)
    ctx.clearRect(0, 0, W, W)
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, r + 8, 0, Math.PI * 2)
    ctx.fillStyle = lit ? '#0e0b09' : mixHex('#121212', '#080808', dusk)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(cx, cy, r, 0, Math.PI * 2)
    ctx.fillStyle = lit ? '#161210' : mixHex('#141414', '#0a0a0a', dusk)
    ctx.fill()
    if (lit) {
      const glow = ctx.createRadialGradient(cx, cy, r * 0.15, cx, cy, r)
      glow.addColorStop(0, 'rgba(240, 70, 20, 0.16)')
      glow.addColorStop(0.55, 'rgba(180, 40, 10, 0.05)')
      glow.addColorStop(1, 'rgba(0, 0, 0, 0)')
      ctx.fillStyle = glow
      ctx.fill()
    }

    for (let v = 0; v <= spec.max; v += spec.step / 2) {
      const u = v / spec.max
      const a = sweepAngle(u)
      const major = spec.majors.includes(v)
      const red = u >= spec.redFrom && spec.redFrom < 1
      const inner = r * (major ? 0.72 : 0.8)
      const outer = r * 0.92
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner)
      ctx.lineTo(cx + Math.cos(a) * outer, cy + Math.sin(a) * outer)
      ctx.strokeStyle = red ? (lit ? '#ff3a18' : mixHex('#4a2018', '#1a0e0c', dusk)) : major ? ink : inkSoft
      ctx.lineWidth = major ? 3.2 : 1.4
      ctx.stroke()
    }

    ctx.font = '600 26px "Segoe UI", system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (lit) {
      ctx.shadowColor = RUBY_GLOW
      ctx.shadowBlur = 10
    }
    ctx.fillStyle = ink
    for (const v of spec.majors) {
      if (v === 0) continue
      const a = sweepAngle(v / spec.max)
      const tr = r * 0.58
      ctx.fillText(String(v), cx + Math.cos(a) * tr, cy + Math.sin(a) * tr)
    }
    ctx.shadowBlur = 0
    ctx.font = '500 13px "Segoe UI", system-ui, sans-serif'
    ctx.fillStyle = lit ? '#c45a32' : mixHex('#3a3836', '#141312', dusk)
    ctx.fillText(spec.caption, cx, cy + r * 0.22)

    if (spec.lcd) {
      const boxW = 118
      const boxH = 44
      const bx = cx - boxW / 2
      const by = cy + 28
      ctx.fillStyle = lit ? '#2a0e06' : '#080808'
      ctx.fillRect(bx, by, boxW, boxH)
      ctx.strokeStyle = lit ? '#5a2210' : '#161616'
      ctx.lineWidth = 1
      ctx.strokeRect(bx + 0.5, by + 0.5, boxW - 1, boxH - 1)
      ctx.font = '600 15px ui-monospace, "Cascadia Mono", monospace'
      ctx.textAlign = 'right'
      ctx.fillStyle = lit ? '#ff7a30' : mixHex('#201810', '#0c0a08', dusk)
      if (lit) {
        ctx.shadowColor = 'rgba(255, 90, 20, 0.65)'
        ctx.shadowBlur = 8
      }
      ctx.fillText(this.tripKm.toFixed(1).padStart(6, ' '), bx + boxW - 8, by + 16)
      ctx.font = '700 18px ui-monospace, "Cascadia Mono", monospace'
      ctx.fillText(Math.floor(this.odoKm).toString().padStart(6, '0'), bx + boxW - 8, by + 34)
      ctx.shadowBlur = 0
    }

    if (spec.battery) {
      ctx.fillStyle = mixHex('#4a1410', '#1a0808', dusk)
      ctx.beginPath()
      ctx.roundRect(cx + r * 0.42, cy - 10, 18, 14, 2)
      ctx.fill()
    }

    if (spec.lights) {
      const gx = cx + r * 0.78
      const gy = cy + 4
      ctx.fillStyle = this.lit ? GREEN : mixHex('#1a2a1a', '#0c100c', dusk)
      ctx.beginPath()
      ctx.arc(gx, gy, 6, 0, Math.PI * 2)
      ctx.fill()
      if (this.lit) {
        ctx.shadowColor = 'rgba(80, 255, 120, 0.85)'
        ctx.shadowBlur = 12
        ctx.fill()
        ctx.shadowBlur = 0
      }
      ctx.strokeStyle = this.lit ? '#b8ffc8' : mixHex('#222', '#111', dusk)
      ctx.lineWidth = 1.6
      ctx.beginPath()
      ctx.arc(gx - 7, gy, 7, -0.7, 0.7)
      ctx.stroke()
    }

    const a = sweepAngle(t)
    const len = r * 0.82
    ctx.strokeStyle = needle
    ctx.fillStyle = needle
    if (lit) {
      ctx.shadowColor = 'rgba(255, 50, 10, 0.8)'
      ctx.shadowBlur = 14
    }
    ctx.lineWidth = 3.4
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(cx - Math.cos(a) * r * 0.16, cy - Math.sin(a) * r * 0.16)
    ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len)
    ctx.stroke()
    ctx.shadowBlur = 0
    ctx.beginPath()
    ctx.arc(cx, cy, 9, 0, Math.PI * 2)
    ctx.fillStyle = lit ? '#2a0c08' : mixHex('#161616', '#0a0a0a', dusk)
    ctx.fill()
    ctx.strokeStyle = lit ? '#ff5a20' : mixHex('#3a3836', '#181716', dusk)
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.restore()
  }
}

export function mountCluster(visual: Object3D, eye: { x: number; y: number; z: number }): Cluster {
  return new Cluster(visual, eye)
}
