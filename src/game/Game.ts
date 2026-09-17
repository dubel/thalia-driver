import {
  Clock,
  LoadingManager,
  PMREMGenerator,
  PointLight,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { Arena, configureRenderer } from './Arena'
import { FollowCamera } from './camera'
import { ARENA_HALF, LAMP_URL, PLAYER_CAR, PLAYER_SPAWN, SHOW_FPS, STREET_URL } from './config'
import { GameAudio, warmAudioFromGesture } from './audio'
import { Input } from './input'
import { Car } from './Car'
import { RadioPlayer, type RadioStationId } from './radio'
import type { Hud } from '../ui/hud'

export class Game {
  private readonly renderer: WebGLRenderer
  private readonly scene = new Scene()
  private readonly cameraRig = new FollowCamera()
  private readonly clock = new Clock()
  private readonly input: Input
  private readonly hud: Hud
  private arena!: Arena
  private player!: Car
  private readonly cabinLight = new PointLight(0xfff1dc, 0, 2.6)
  private readonly audio = new GameAudio()
  private readonly radio = new RadioPlayer()
  private playing = false
  private alive = true
  private raf = 0
  private fpsFrames = 0
  private fpsAcc = 0

  constructor(canvas: HTMLCanvasElement, hud: Hud) {
    this.hud = hud
    this.input = new Input(canvas)
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' })
    configureRenderer(this.renderer)
    const pmrem = new PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    this.scene.environmentIntensity = 0.85
    pmrem.dispose()
    this.resize()
    window.addEventListener('resize', this.onResize)
    canvas.addEventListener('click', this.onCanvasClick)
    this.hud.onPlay(() => this.beginPlay())
    this.hud.onRadioPick((id) => void this.tuneRadio(id))
    this.hud.onRadioClosed(() => {
      if (this.playing) this.input.lockPointer()
    })
  }

  async start(): Promise<void> {
    this.arena = new Arena(this.scene)
    const manager = new LoadingManager()
    manager.onProgress = (_url, loaded, total) => {
      this.hud.setLoadProgress(total === 0 ? 0 : (loaded / total) * 100)
    }
    const loader = new GLTFLoader(manager)
    let gltf
    let streetGltf
    let lampGltf
    try {
      ;[gltf, streetGltf, lampGltf] = await Promise.all([
        loader.loadAsync(PLAYER_CAR.url),
        loader.loadAsync(STREET_URL),
        loader.loadAsync(LAMP_URL),
        this.audio.load(),
      ])
    } catch (error) {
      throw new Error(`GLB: ${error instanceof Error ? error.message : String(error)}`)
    }
    this.arena.addStreets(streetGltf.scene, lampGltf.scene)
    this.player = new Car(
      gltf.scene,
      PLAYER_CAR,
      new Vector3(PLAYER_SPAWN.x, 0, PLAYER_SPAWN.z),
      PLAYER_SPAWN.yaw,
    )
    this.scene.add(this.player.object)
    this.cabinLight.position.set(0.18, 1.02, 0.22)
    this.player.object.add(this.cabinLight)
    this.arena.indexCollision()
    this.player.sitOnTerrain()
    this.cameraRig.reset(this.player)
    this.hud.readyToPlay()
    if (SHOW_FPS) this.hud.setFps(0)
    this.loop()
  }

  dispose(): void {
    this.alive = false
    cancelAnimationFrame(this.raf)
    window.removeEventListener('resize', this.onResize)
    this.renderer.domElement.removeEventListener('click', this.onCanvasClick)
    this.player?.mirrors.dispose()
    this.input.dispose()
    this.renderer.dispose()
  }

  private beginPlay(): void {
    this.playing = true
    this.hud.hideOverlay()
    this.input.arm()
    this.input.lockPointer()
    warmAudioFromGesture()
    void this.audio.unlock()
  }

  private loop = (): void => {
    if (!this.alive) return
    this.raf = requestAnimationFrame(this.loop)
    const raw = this.clock.getDelta()
    const dt = Math.min(raw, 0.08)
    this.update(dt)
    if (this.player && this.cameraRig.mode === 'cockpit') {
      this.player.mirrors.draw(
        this.renderer,
        this.scene,
        this.cameraRig.camera,
        this.arena.atmosphere,
      )
    }
    this.renderer.render(this.scene, this.cameraRig.camera)
    if (SHOW_FPS) this.tickFps(raw)
  }

  private update(dt: number): void {
    if (this.input.consumeRestart() && this.player && !this.hud.isRadioOpen()) {
      this.player.reset()
      this.cameraRig.reset(this.player)
      this.hud.hideOverlay()
      this.input.arm()
      this.playing = true
    }

    if (this.playing && this.input.consumeRadioToggle()) {
      const open = this.hud.toggleRadio(this.radio.station)
      if (open) {
        document.exitPointerLock()
        void import('hls.js')
      } else this.input.lockPointer()
    }
    if (this.input.consumeRadioEscape() && this.hud.isRadioOpen()) this.hud.hideRadio()

    const mouse = this.input.consumeMouse()
    if (this.input.consumeViewToggle() && this.player) this.cameraRig.toggle()
    if (this.input.consumeLookHoldToggle()) this.cameraRig.toggleLookHold()
    if (this.input.consumeLightsToggle() && this.player) this.player.toggleLights()
    if (this.input.consumeHorn()) void this.audio.unlock().then(() => this.audio.horn())
    if (this.playing && this.player) {
      this.player.drive(
        this.input.throttle(),
        this.input.steer(),
        this.input.handbrake(),
        dt,
        this.arena.obstacleIndex,
        ARENA_HALF,
        this.arena.atmosphere.wetness,
      )
      const crash = this.player.consumeCrash()
      if (crash > 0) void this.audio.unlock().then(() => this.audio.crash(crash))
      this.hud.setSpeed(Math.abs(this.player.speed) * 3.6)
      this.audio.setMotion(Math.abs(this.player.speed) / this.player.config.maxSpeed, this.radio.playing)
    } else {
      this.audio.setMotion(0)
    }

    if (this.player) {
      this.hud.setCockpit(this.cameraRig.mode === 'cockpit')
      this.player.mirrors.setCockpit(this.cameraRig.mode === 'cockpit')
      this.cabinLight.intensity = this.cameraRig.mode === 'cockpit' ? 0.42 : 0
      this.arena.tick(dt, this.cameraRig.camera, this.player.position)
      const night = this.arena.atmosphere.night
      const day = 1 - night
      this.player.syncLights(night)
      this.player.cluster.tick(
        this.player.speed,
        this.player.lightsOn,
        dt,
        night,
        this.cameraRig.mode === 'cockpit',
      )
      this.player.radioLcd.tick(this.arena.atmosphere.clockHour, this.radio.lcdLabel(), dt)
      this.scene.environmentIntensity = 0.04 + 0.82 * day ** 1.55
      this.renderer.toneMappingExposure = 0.36 + 0.66 * day
      this.hud.setAtmosphere(this.arena.atmosphere.label)
      this.audio.setWeather(this.arena.atmosphere.rain, this.arena.atmosphere.wind)
      const thunder = this.arena.atmosphere.consumeThunder()
      if (thunder) this.audio.thunder(thunder)
      this.audio.tickAmbience(dt, this.arena.atmosphere.clockHour, this.arena.atmosphere.rain)
      this.cameraRig.update(this.player, dt, this.arena.blockerIndex, mouse.dx, mouse.dy)
    }
  }

  private tickFps(rawDt: number): void {
    if (rawDt > 0.4) return
    this.fpsFrames += 1
    this.fpsAcc += rawDt
    if (this.fpsAcc < 0.25) return
    this.hud.setFps(Math.round(this.fpsFrames / this.fpsAcc))
    this.fpsFrames = 0
    this.fpsAcc = 0
  }

  private readonly onResize = (): void => this.resize()

  private readonly onCanvasClick = (): void => {
    if (this.hud.isRadioOpen()) return
    if (this.playing && !this.input.pointerLocked) this.input.lockPointer()
  }

  private resize(): void {
    const width = window.innerWidth
    const height = window.innerHeight
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25))
    this.renderer.setSize(width, height, false)
    this.cameraRig.resize(width, height)
  }

  private async tuneRadio(id: RadioStationId): Promise<void> {
    this.hud.markRadio(id)
    void this.audio.unlock()
    await this.radio.setStation(id)
    this.hud.markRadio(this.radio.station)
  }
}
