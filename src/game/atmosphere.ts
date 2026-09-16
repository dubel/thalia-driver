import {
  BackSide,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
  Mesh,
  Points,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type PerspectiveCamera,
} from 'three'

export type WindClock = {
  value: number
  strength: { value: number }
  dirX: { value: number }
  dirZ: { value: number }
}

export const atmosWetness = { value: 0 }

export type WeatherId = 'clear' | 'clouds' | 'overcast' | 'rain' | 'storm'

type Range = readonly [number, number]

type WeatherSpec = {
  cover: Range
  rain: Range
  wind: Range
  dark: Range
  weight: number
}

type WeatherSample = {
  id: WeatherId
  cover: number
  rain: number
  wind: number
  dark: number
}

const WEATHER: Record<WeatherId, WeatherSpec> = {
  clear: { cover: [0.02, 0.2], rain: [0, 0], wind: [0.2, 0.62], dark: [0, 0.08], weight: 44 },
  clouds: { cover: [0.26, 0.6], rain: [0, 0.04], wind: [0.38, 0.9], dark: [0.04, 0.2], weight: 30 },
  overcast: { cover: [0.62, 0.88], rain: [0, 0.14], wind: [0.5, 1.05], dark: [0.22, 0.46], weight: 14 },
  rain: { cover: [0.78, 0.96], rain: [0.42, 0.88], wind: [0.85, 1.45], dark: [0.38, 0.58], weight: 8 },
  storm: { cover: [0.9, 1], rain: [0.82, 1], wind: [1.45, 2.15], dark: [0.55, 0.78], weight: 4 },
}

const IDS = Object.keys(WEATHER) as WeatherId[]
/** Real seconds that map to one in-game day. */
export const GAME_DAY_SECONDS = 8 * 60
const DAY_LENGTH_SEC = GAME_DAY_SECONDS
const LAT = (50.1 * Math.PI) / 180
const SUN_DEC = (3.4 * Math.PI) / 180
const MOON_DEC = (-9.5 * Math.PI) / 180
const RAIN_COUNT = 7200

const _sunDir = new Vector3()
const _moonDir = new Vector3()
const _zenith = new Color()
const _horizon = new Color()
const _ground = new Color()
const _sunCol = new Color()
const _moonCol = new Color()
const _hemiSky = new Color()
const _hemiGround = new Color()
const _fog = new Color()
const _tmp = new Color()

function clamp(n: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, n))
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function smooth(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

function wrapHour(hour: number): number {
  return ((hour % 24) + 24) % 24
}

function flagOn(v: string | null): boolean {
  if (!v) return false
  const n = v.trim().toLowerCase()
  return n === '1' || n === 'true' || n === 'yes'
}

function parseQuery(): {
  hour: number
  weather: WeatherId | null
  freeze: boolean
  mist: number | null
  lockWeather: boolean
  lockMist: boolean
} {
  const q = new URLSearchParams(window.location.search)
  const rawHour = Number(q.get('hour'))
  const hourSet = q.has('hour') && Number.isFinite(rawHour)
  const weather = q.get('weather') as WeatherId | null
  const weatherSet = Boolean(weather && weather in WEATHER)
  const mistRaw = q.get('mist')
  const mist =
    flagOn(mistRaw) ? 1 : mistRaw === '0' || mistRaw?.toLowerCase() === 'false' ? 0 : null
  const fixed = flagOn(q.get('fixed'))
  return {
    hour: hourSet ? wrapHour(rawHour) : 8,
    weather: weatherSet ? weather : null,
    freeze: flagOn(q.get('pauseday')) || (fixed && hourSet),
    mist,
    lockWeather: fixed && weatherSet,
    lockMist: fixed && mist !== null,
  }
}

function sample(range: Range): number {
  return range[0] + Math.random() * (range[1] - range[0])
}

function pickWeather(exclude: WeatherId | null): WeatherId {
  const pool = IDS.filter((id) => id !== exclude)
  let total = 0
  for (const id of pool) total += WEATHER[id].weight
  let roll = Math.random() * total
  for (const id of pool) {
    roll -= WEATHER[id].weight
    if (roll <= 0) return id
  }
  return 'clouds'
}

function rollWeather(exclude: WeatherId | null, forced?: WeatherId): WeatherSample {
  const id = forced ?? pickWeather(exclude)
  const spec = WEATHER[id]
  return {
    id,
    cover: sample(spec.cover),
    rain: sample(spec.rain),
    wind: sample(spec.wind),
    dark: sample(spec.dark),
  }
}

function weatherLabel(id: WeatherId, rain: number, mist: number): string {
  const foggy = mist > 0.42
  if (foggy && rain > 0.45) return id === 'storm' ? 'storm · fog' : 'rain · fog'
  if (foggy) return 'fog'
  return id
}

function bodyDir(hour: number, decl: number, into: Vector3): number {
  const H = ((hour - 12) * 15 * Math.PI) / 180
  const sinAlt = Math.sin(LAT) * Math.sin(decl) + Math.cos(LAT) * Math.cos(decl) * Math.cos(H)
  const alt = Math.asin(clamp(sinAlt, -1, 1)) + 0.055
  const az = Math.atan2(
    Math.sin(H),
    Math.cos(H) * Math.sin(LAT) - Math.tan(decl) * Math.cos(LAT),
  )
  const cosAlt = Math.cos(alt)
  into.set(Math.sin(az) * cosAlt, Math.sin(alt), -Math.cos(az) * cosAlt)
  if (into.lengthSq() < 1e-8) into.set(0, -1, 0)
  else into.normalize()
  return alt
}

export class Atmosphere {
  label = ''
  wetness = 0
  rain = 0
  wind = 0.5
  /** 0 at day, 1 in full night — used to wake street lamps. */
  night = 0
  private readonly scene: Scene
  private readonly windClock: WindClock
  private readonly freeze: boolean
  private readonly lockWeather: boolean
  private readonly lockMist: boolean
  private readonly fog: FogExp2
  private readonly hemi: HemisphereLight
  private readonly sun: DirectionalLight
  private readonly moon: DirectionalLight
  private readonly skyMat: ShaderMaterial
  private readonly rainMat: ShaderMaterial
  private readonly sky: Mesh
  private readonly rainPts: Points
  private hour: number
  private readonly bootHour: number
  private from: WeatherSample
  private to: WeatherSample
  private blend = 1
  private blendDur = 12
  private hold = 8
  private mist = 0
  private mistGoal = 0
  private mistPhase: 'idle' | 'in' | 'hold' | 'out' = 'idle'
  private mistTimer = 0
  private mistCd = 18
  private flash = 0
  private flashCd = 4
  private flashFollow = 0
  private time = 0
  private thunderWait = 0
  private thunderClose = false
  private thunderEvent: { volume: number; far: boolean } | null = null
  private readonly flashDir = new Vector3(1, 0.08, 0)

  get clockHour(): number {
    return this.hour
  }

  resetMissionClock(): void {
    this.hour = this.bootHour
  }

  consumeThunder(): { volume: number; far: boolean } | null {
    const event = this.thunderEvent
    this.thunderEvent = null
    return event
  }

  constructor(scene: Scene, wind: WindClock) {
    this.scene = scene
    this.windClock = wind
    const boot = parseQuery()
    this.hour = boot.hour
    this.bootHour = boot.hour
    this.freeze = boot.freeze
    this.lockWeather = boot.lockWeather
    this.lockMist = boot.lockMist
    this.from = rollWeather(null, boot.weather ?? undefined)
    this.to = this.from
    this.hold = 10 + Math.random() * 22
    this.mistCd = 14 + Math.random() * 28
    if (boot.mist !== null) {
      this.mist = boot.mist
      this.mistGoal = boot.mist
      this.mistPhase = boot.mist > 0.2 ? 'hold' : 'idle'
      this.mistTimer = 14 + Math.random() * 20
    }

    scene.background = new Color(0x6b7c8a)
    this.fog = new FogExp2(0x6b7c8a, 0.0034)
    scene.fog = this.fog

    this.hemi = new HemisphereLight(0xc5d4e0, 0x4a4030, 0.85)
    scene.add(this.hemi)

    this.sun = new DirectionalLight(0xffe2b8, 1.45)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(1024, 1024)
    this.sun.shadow.camera.near = 8
    this.sun.shadow.camera.far = 320
    this.sun.shadow.camera.left = -48
    this.sun.shadow.camera.right = 48
    this.sun.shadow.camera.top = 48
    this.sun.shadow.camera.bottom = -48
    this.sun.shadow.bias = -0.0004
    scene.add(this.sun)
    scene.add(this.sun.target)

    this.moon = new DirectionalLight(0xc5d4ee, 0)
    this.moon.castShadow = false
    scene.add(this.moon)
    scene.add(this.moon.target)

    this.skyMat = makeSkyMaterial()
    this.sky = new Mesh(new SphereGeometry(1600, 24, 16), this.skyMat)
    this.sky.frustumCulled = false
    this.sky.renderOrder = -20
    scene.add(this.sky)

    this.rainMat = makeRainMaterial()
    this.rainPts = new Points(makeRainGeometry(), this.rainMat)
    this.rainPts.frustumCulled = false
    this.rainPts.renderOrder = 6
    scene.add(this.rainPts)
  }

  tick(dt: number, camera: PerspectiveCamera, follow: Vector3): void {
    this.time += dt
    if (!this.freeze) this.hour = wrapHour(this.hour + (dt * 24) / DAY_LENGTH_SEC)
    this.stepWeather(dt)

    const k = this.blend
    const coverDrift = 0.045 * Math.sin(this.time * 0.13 + 1.4) + 0.03 * Math.sin(this.time * 0.31)
    const cover = clamp(lerp(this.from.cover, this.to.cover, k) + coverDrift, 0, 1)
    const rain = lerp(this.from.rain, this.to.rain, k)
    const wind = lerp(this.from.wind, this.to.wind, k)
    const dark = lerp(this.from.dark, this.to.dark, k)
    const weatherId = k > 0.45 ? this.to.id : this.from.id
    this.rain = rain
    this.wind = wind
    this.stepMist(dt, this.hour, rain)
    this.wetness += (rain - this.wetness) * Math.min(1, dt * 0.45)
    atmosWetness.value = this.wetness

    const gust = 1 + 0.16 * Math.sin(this.time * 0.63) + 0.1 * Math.sin(this.time * 1.7 + 2.1)
    const ang = 0.7 + this.time * 0.027
    this.windClock.value += dt * (0.55 + wind * 0.9)
    this.windClock.strength.value = wind * gust
    this.windClock.dirX.value = Math.cos(ang)
    this.windClock.dirZ.value = Math.sin(ang)

    this.stepLightning(dt, rain, wind, weatherId)

    const sunAlt = bodyDir(this.hour, SUN_DEC, _sunDir)
    const moonAlt = bodyDir(this.hour + 13.2, MOON_DEC, _moonDir)
    const night = smooth(-0.02, -0.28, sunAlt)
    this.night = night
    const day = 1 - night
    const golden = Math.exp(-(((sunAlt - 0.06) / 0.12) ** 2)) * (1 - night * 0.7)
    const twilight = smooth(0.18, -0.04, sunAlt) * smooth(-0.38, -0.02, sunAlt)

    paintSky(sunAlt, night, golden, twilight, cover, dark, this.flash, this.mist)
    const occ = cover * (0.5 + 0.25 * (0.5 + 0.5 * Math.sin(this.time * 0.17)))
    const sunLit =
      smooth(-0.12, 0.1, sunAlt) * (1 - occ * 0.72) * (1 - dark * 0.18) * (1 - this.mist * 0.28)
    const moonLit = smooth(-0.04, 0.14, moonAlt) * night * (0.45 + 0.55 * (1 - cover * 0.5))

    this.sun.color.copy(_sunCol)
    this.sun.intensity = sunLit * 1.48 + this.flash * 1.8
    this.sun.castShadow = this.sun.intensity > 0.1
    this.moon.color.copy(_moonCol)
    this.moon.intensity = (moonLit * 0.55 + night * 0.06) * (1 - this.mist * 0.35)
    this.hemi.color.copy(_hemiSky)
    this.hemi.groundColor.copy(_hemiGround)
    this.hemi.intensity =
      0.28 +
      day * 0.62 * (1 - dark * 0.4) +
      twilight * 0.32 +
      moonLit * 0.34 +
      this.mist * 0.1 +
      this.flash * 1.4

    this.placeLight(this.sun, _sunDir, follow, 210)
    this.placeLight(this.moon, _moonDir, follow, 180)

    this.fog.color.copy(_fog)
    this.scene.background = this.fog.color
    const fogPull = 0.28 + cover * 0.2 + rain * 0.3 + night * 0.1
    this.fog.density = 0.0009 + fogPull * 0.0022 + this.mist * 0.0055

    this.sky.position.copy(camera.position)
    const u = this.skyMat.uniforms
    u.uSunDir.value.copy(_sunDir)
    u.uMoonDir.value.copy(_moonDir)
    u.uZenith.value.copy(_zenith)
    u.uHorizon.value.copy(_horizon)
    u.uGround.value.copy(_ground)
    u.uSunColor.value.copy(_sunCol)
    u.uMoonColor.value.copy(_moonCol)
    u.uCloudCover.value = cover
    u.uStorm.value = dark
    u.uNight.value = night
    u.uTime.value = this.time
    u.uFlash.value = this.flash
    u.uFlashDir.value.copy(this.flashDir)
    u.uMist.value = this.mist
    u.uWind.value.set(this.windClock.dirX.value, 0, this.windClock.dirZ.value)
    u.uMoonGlow.value = moonLit

    const ru = this.rainMat.uniforms
    ru.uCam.value.copy(camera.position)
    ru.uTime.value = this.time
    ru.uRain.value = rain
    ru.uWind.value.set(this.windClock.dirX.value * wind, 0, this.windClock.dirZ.value * wind)
    this.rainPts.visible = rain > 0.02

    const hh = Math.floor(this.hour)
    const mm = Math.floor((this.hour - hh) * 60)
    this.label = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')} · ${weatherLabel(weatherId, rain, this.mist)}`
  }

  private placeLight(light: DirectionalLight, dir: Vector3, follow: Vector3, dist: number): void {
    const y = Math.max(dir.y, 0.18)
    const len = Math.hypot(dir.x, y, dir.z) || 1
    light.target.position.copy(follow)
    light.target.updateMatrixWorld()
    light.position.set(
      follow.x + (dir.x / len) * dist,
      follow.y + (y / len) * dist,
      follow.z + (dir.z / len) * dist,
    )
  }

  private stepWeather(dt: number): void {
    if (this.lockWeather) return
    if (this.blend < 1) {
      this.blend = clamp(this.blend + dt / this.blendDur, 0, 1)
      if (this.blend >= 1) {
        this.from = this.to
        this.hold = 16 + Math.random() * 38
      }
      return
    }
    this.hold -= dt
    if (this.hold > 0) return
    this.to = rollWeather(this.from.id)
    this.blend = 0
    this.blendDur = 7 + Math.random() * 12
  }

  private stepMist(dt: number, hour: number, rain: number): void {
    if (this.lockMist) {
      return
    }
    if (this.mistPhase === 'idle') {
      this.mistCd -= dt
      this.mist += (0 - this.mist) * Math.min(1, dt * 0.55)
      if (this.mistCd > 0) return
      const dawn = hour > 5.2 && hour < 8.8
      const dusk = hour > 17 && hour < 20.2
      const chance = 0.38 + rain * 0.28 + (dawn ? 0.32 : 0) + (dusk ? 0.18 : 0)
      if (Math.random() < chance) {
        this.mistPhase = 'in'
        this.mistGoal = 0.52 + Math.random() * 0.48
        this.mistTimer = 8 + Math.random() * 10
      } else {
        this.mistCd = 16 + Math.random() * 42
      }
      return
    }
    if (this.mistPhase === 'in') {
      this.mistTimer -= dt
      this.mist += (this.mistGoal - this.mist) * Math.min(1, dt * 0.28)
      if (this.mistTimer > 0) return
      this.mistPhase = 'hold'
      this.mistTimer = 14 + Math.random() * 28
      return
    }
    if (this.mistPhase === 'hold') {
      this.mistTimer -= dt
      this.mist += (this.mistGoal - this.mist) * Math.min(1, dt * 0.2)
      if (this.mistTimer > 0) return
      this.mistPhase = 'out'
      this.mistTimer = 10 + Math.random() * 12
      return
    }
    this.mistTimer -= dt
    this.mist += (0 - this.mist) * Math.min(1, dt * 0.22)
    if (this.mistTimer > 0) return
    this.mistPhase = 'idle'
    this.mist = 0
    this.mistCd = 22 + Math.random() * 48
  }

  private stepLightning(dt: number, rain: number, wind: number, id: WeatherId): void {
    this.flash *= Math.exp(-dt * 5.8)
    this.flashCd -= dt
    if (this.flashFollow > 0) {
      this.flashFollow -= dt
      if (this.flashFollow <= 0) this.flash = Math.max(this.flash, 0.35 + Math.random() * 0.45)
    }
    if (this.thunderWait > 0) {
      this.thunderWait -= dt
      if (this.thunderWait <= 0) {
        const close = this.thunderClose
        this.thunderEvent = {
          volume: close ? 0.84 + Math.random() * 0.16 : 0.5 + Math.random() * 0.22,
          far: !close,
        }
      }
    }
    const stormy = id === 'storm' || (rain > 0.7 && wind > 1.05)
    const rainy = rain > 0.48
    if ((!stormy && !rainy) || this.flashCd > 0) return
    const rate = stormy ? 0.28 : 0.07
    if (Math.random() >= 1 - Math.exp(-dt * rate)) return
    const az = Math.random() * Math.PI * 2
    this.flashDir.set(Math.sin(az), 0.04 + Math.random() * 0.1, Math.cos(az)).normalize()
    this.flash = stormy ? 0.7 + Math.random() * 0.7 : 0.35 + Math.random() * 0.4
    const close = stormy && this.flash > 0.9
    this.flashFollow = 0.06 + Math.random() * 0.1
    this.flashCd = stormy ? 2.4 + Math.random() * 7 : 8 + Math.random() * 16
    this.thunderWait = close ? 0.16 + Math.random() * 0.4 : 0.55 + Math.random() * 1.5
    this.thunderClose = close
  }
}

function paintSky(
  sunAlt: number,
  night: number,
  golden: number,
  twilight: number,
  cover: number,
  dark: number,
  flash: number,
  mist: number,
): void {
  _zenith.set(0x3a6aa6)
  _horizon.set(0xb9cce0)
  _ground.set(0x6a7460)
  _sunCol.set(0xfff1c4)
  _moonCol.set(0xd7e2f5)
  _hemiSky.set(0xc5d4e0)
  _hemiGround.set(0x4a4030)

  _tmp.set(0x2e4e86)
  _zenith.lerp(_tmp, clamp(1 - (sunAlt + 0.05) / 0.7, 0, 1))
  _tmp.set(0x0b1020)
  _zenith.lerp(_tmp, night)
  _tmp.set(0x1a2748)
  _zenith.lerp(_tmp, twilight * 0.55)

  _tmp.set(0xf0b07a)
  _horizon.lerp(_tmp, golden * 0.85)
  _tmp.set(0xe07040)
  _horizon.lerp(_tmp, twilight * 0.9)
  _tmp.set(0x12192c)
  _horizon.lerp(_tmp, night * 0.92)
  _tmp.set(0x6a88aa)
  _horizon.lerp(_tmp, night * (1 - cover) * 0.22)

  _tmp.set(0x3a3428)
  _ground.lerp(_tmp, night)

  _tmp.set(0xff9a4a)
  _sunCol.lerp(_tmp, golden * 0.75 + twilight * 0.55)
  _sunCol.multiplyScalar(1 - night)

  _tmp.set(0x7a889c)
  _zenith.lerp(_tmp, cover * (1 - night) * 0.72)
  _tmp.set(0x12151c)
  _zenith.lerp(_tmp, cover * night * 0.55)
  _tmp.set(0x8a97a4)
  _horizon.lerp(_tmp, cover * (1 - night) * 0.7)
  _tmp.set(0x1a2030)
  _horizon.lerp(_tmp, cover * night * 0.45)
  _zenith.multiplyScalar(1 - dark * 0.35)
  _horizon.multiplyScalar(1 - dark * 0.28)

  _tmp.set(0xdce8ff)
  _zenith.lerp(_tmp, flash * 0.12)
  _horizon.lerp(_tmp, flash * 0.28)

  _hemiSky.copy(_horizon).lerp(_zenith, 0.35)
  _hemiGround.set(0x4a4030).lerp(_tmp.set(0x14161c), night)
  _tmp.set(night > 0.45 ? 0x1c2430 : 0x5a6570)
  _fog.copy(_horizon).lerp(_tmp, mist)
  _horizon.lerp(_fog, mist * 0.8)
  _zenith.lerp(_fog, mist * 0.2)
  _fog.copy(_horizon)
  _ground.copy(_horizon).multiplyScalar(0.62)
}

function makeSkyMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    name: 'september-sky',
    side: BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: false,
    uniforms: {
      uSunDir: { value: new Vector3(0, 1, 0) },
      uMoonDir: { value: new Vector3(0, 1, 0) },
      uZenith: { value: new Color(0x3a6aa6) },
      uHorizon: { value: new Color(0xb9cce0) },
      uGround: { value: new Color(0x6a7460) },
      uSunColor: { value: new Color(0xfff1c4) },
      uMoonColor: { value: new Color(0xd7e2f5) },
      uCloudCover: { value: 0.3 },
      uStorm: { value: 0 },
      uNight: { value: 0 },
      uTime: { value: 0 },
      uFlash: { value: 0 },
      uFlashDir: { value: new Vector3(1, 0.08, 0) },
      uMist: { value: 0 },
      uMoonGlow: { value: 0 },
      uWind: { value: new Vector3(1, 0, 0) },
    },
    vertexShader: /* glsl */ `
varying vec3 vDir;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vDir = world.xyz - cameraPosition;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`,
    fragmentShader: /* glsl */ `
varying vec3 vDir;
uniform vec3 uSunDir;
uniform vec3 uMoonDir;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunColor;
uniform vec3 uMoonColor;
uniform float uCloudCover;
uniform float uStorm;
uniform float uNight;
uniform float uTime;
uniform float uFlash;
uniform vec3 uFlashDir;
uniform float uMist;
uniform float uMoonGlow;
uniform vec3 uWind;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float noise2(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise2(p);
    p = p * 2.11 + vec2(17.2, 9.1);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y;
  float t = pow(clamp((h + 0.08) / 0.95, 0.0, 1.0), 0.62);
  vec3 col = mix(uHorizon, uZenith, t);
  col = mix(uGround, col, smoothstep(-0.12, 0.03, h));

  float mu = clamp(dot(dir, uSunDir), -1.0, 1.0);
  float sunAng = acos(mu);
  float mie = pow(max(mu, 0.0), 12.0) * (1.0 - uCloudCover * 0.75);
  col += uSunColor * mie * (0.55 + 0.9 * (1.0 - uNight));
  float disk = smoothstep(0.02, 0.008, sunAng) * (1.0 - uCloudCover * 0.88);
  col += uSunColor * disk * 1.35;

  float mm = clamp(dot(dir, uMoonDir), -1.0, 1.0);
  float moonAng = acos(mm);
  float halo = pow(max(mm, 0.0), 6.0) * uMoonGlow;
  float bloom = pow(max(mm, 0.0), 22.0) * uMoonGlow;
  col += uMoonColor * halo * 0.38;
  col += uMoonColor * bloom * 0.7;
  float moonDisk = smoothstep(0.022, 0.013, moonAng);
  float crater = 0.78 + 0.22 * noise2(dir.xy * 18.0 + dir.z * 6.0);
  col += uMoonColor * moonDisk * crater * (0.85 + uMoonGlow * 0.9);
  col += uMoonColor * smoothstep(0.045, 0.018, moonAng) * uMoonGlow * 0.22;

  float star = step(0.9986, hash12(dir.xz * 96.0 + dir.y * 48.0));
  float twinkle = 0.82 + 0.18 * hash12(dir.zy * 22.0 + vec2(uTime * 0.05, dir.x));
  col += star * uNight * (1.0 - uCloudCover * 0.85) * twinkle * vec3(0.82, 0.88, 1.0);

  vec2 cuv = dir.xz / max(h + 0.2, 0.05);
  cuv += uWind.xz * uTime * 0.006;
  float n = fbm(cuv * 0.52 + 3.1);
  n = n * 0.72 + fbm(cuv * 1.15 - uTime * 0.01) * 0.28;
  float edge = mix(0.62, 0.18, uCloudCover);
  float clouds = smoothstep(edge, edge + 0.28, n);
  clouds *= smoothstep(0.0, 0.1, h) * (1.0 - smoothstep(0.82, 1.0, h) * 0.35);
  vec3 cloudCol = mix(vec3(0.93, 0.94, 0.96), uHorizon, 0.22);
  cloudCol = mix(cloudCol, vec3(0.18, 0.2, 0.24), uStorm * 0.85 + uNight * 0.55);
  cloudCol += uMoonColor * uMoonGlow * 0.12;
  cloudCol += uSunColor * mie * 0.15;
  col = mix(col, cloudCol, clouds * mix(0.72, 0.94, uCloudCover));
  col = mix(col, uHorizon, uMist * (1.0 - smoothstep(0.0, 0.22, h)) * 0.55);

  vec3 flashAim = normalize(uFlashDir);
  float cone = pow(max(dot(dir, flashAim), 0.0), 14.0);
  float band = exp(-pow((h - 0.03) / 0.11, 2.0));
  col += uFlash * vec3(0.82, 0.88, 1.0) * (cone * 2.1 + band * 0.42);
  gl_FragColor = vec4(col, 1.0);
}
`,
  })
}

function makeRainGeometry(): BufferGeometry {
  const seeds = new Float32Array(RAIN_COUNT * 3)
  for (let i = 0; i < RAIN_COUNT; i++) {
    seeds[i * 3] = Math.random()
    seeds[i * 3 + 1] = Math.random()
    seeds[i * 3 + 2] = Math.random()
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(seeds, 3))
  return geo
}

function makeRainTexture(): CanvasTexture {
  const w = 16
  const h = 48
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Brak canvas 2d')
  const g = ctx.createLinearGradient(w / 2, 0, w / 2, h)
  g.addColorStop(0, 'rgba(210, 225, 240, 0)')
  g.addColorStop(0.25, 'rgba(210, 225, 240, 0.55)')
  g.addColorStop(1, 'rgba(180, 200, 220, 0)')
  ctx.fillStyle = g
  ctx.fillRect(w * 0.46, 0, w * 0.08, h)
  const tex = new CanvasTexture(canvas)
  tex.needsUpdate = true
  return tex
}

function makeRainMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    name: 'september-rain',
    transparent: true,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    uniforms: {
      uCam: { value: new Vector3() },
      uTime: { value: 0 },
      uRain: { value: 0 },
      uWind: { value: new Vector3() },
      uMap: { value: makeRainTexture() },
    },
    vertexShader: /* glsl */ `
uniform vec3 uCam;
uniform float uTime;
uniform float uRain;
uniform vec3 uWind;
varying float vAlpha;
void main() {
  vec3 seed = position;
  vec3 drift = vec3(
    seed.x + uTime * (0.12 * uWind.x),
    seed.y - uTime * (0.7 + seed.x * 0.5),
    seed.z + uTime * (0.12 * uWind.z)
  );
  vec3 q = fract(drift);
  vec3 world = uCam + (q - 0.5) * vec3(34.0, 22.0, 34.0);
  world.y += 5.0;
  vec4 mv = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = mix(7.0, 13.0, uRain) * (70.0 / max(-mv.z, 1.0));
  vAlpha = uRain * (0.18 + 0.42 * seed.z);
}
`,
    fragmentShader: /* glsl */ `
uniform sampler2D uMap;
varying float vAlpha;
void main() {
  vec4 drop = texture2D(uMap, gl_PointCoord);
  float a = drop.a * vAlpha;
  if (a < 0.02) discard;
  gl_FragColor = vec4(drop.rgb, a);
}
`,
  })
}
