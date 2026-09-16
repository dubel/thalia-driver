import { PerspectiveCamera, Vector3 } from 'three'
import { raycastObstacles, type ObstacleSet } from './collision'
import { raycastTerrain, terrainHeight } from './terrain'
import type { Car } from './Car'

const _look = new Vector3()
const _pivot = new Vector3()
const _desired = new Vector3()
const _dir = new Vector3()
const _eye = new Vector3()

const MIN_ARM = 3.2
const LOOK_AHEAD = 9.5
const LOOK_YAW_LIMIT = 1.15
const LOOK_PITCH_MIN = -0.42
const LOOK_PITCH_MAX = 0.38
const LOOK_RETURN = 5.4

export type CameraMode = 'chase' | 'cockpit'

function wrapPi(angle: number): number {
  let a = angle
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

export class FollowCamera {
  readonly camera: PerspectiveCamera
  mode: CameraMode = 'chase'
  lookHold = false
  private yaw = 0
  private ready = false
  private prevHullYaw = 0
  private shakeAmp = 0
  private shakePhase = 0
  private lookYaw = 0
  private lookPitch = 0

  constructor() {
    this.camera = new PerspectiveCamera(62, 1, 0.2, 2200)
  }

  get facingYaw(): number {
    return this.yaw
  }

  toggle(): CameraMode {
    this.mode = this.mode === 'chase' ? 'cockpit' : 'chase'
    this.lookYaw = 0
    this.lookPitch = 0
    this.applyLens()
    return this.mode
  }

  toggleLookHold(): boolean {
    this.lookHold = !this.lookHold
    return this.lookHold
  }

  reset(car: Car): void {
    this.yaw = car.hullYaw
    this.prevHullYaw = car.hullYaw
    this.ready = true
    this.shakeAmp = 0
    this.lookYaw = 0
    this.lookPitch = 0
    this.applyLens()
  }

  shake(amount: number): void {
    this.shakeAmp = Math.min(1.4, this.shakeAmp + amount)
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(height, 1)
    this.camera.updateProjectionMatrix()
  }

  update(car: Car, dt: number, blockers: ObstacleSet, mouseDx: number, mouseDy: number): void {
    if (!this.ready) this.reset(car)
    if (this.mode === 'cockpit') this.updateCockpit(car, dt, mouseDx, mouseDy)
    else this.updateChase(car, dt, blockers)
  }

  private applyLens(): void {
    if (this.mode === 'cockpit') {
      this.camera.fov = 74
      this.camera.near = 0.05
    } else {
      this.camera.fov = 62
      this.camera.near = 0.2
    }
    this.camera.updateProjectionMatrix()
  }

  private updateCockpit(car: Car, dt: number, mouseDx: number, mouseDy: number): void {
    const moving = Math.abs(mouseDx) + Math.abs(mouseDy) > 0.35
    if (moving) {
      this.lookYaw -= mouseDx * 0.0024
      this.lookPitch -= mouseDy * 0.0021
      this.lookYaw = Math.max(-LOOK_YAW_LIMIT, Math.min(LOOK_YAW_LIMIT, this.lookYaw))
      this.lookPitch = Math.max(LOOK_PITCH_MIN, Math.min(LOOK_PITCH_MAX, this.lookPitch))
    } else if (!this.lookHold) {
      const k = 1 - Math.exp(-LOOK_RETURN * dt)
      this.lookYaw += (0 - this.lookYaw) * k
      this.lookPitch += (0 - this.lookPitch) * k
      if (Math.abs(this.lookYaw) < 1e-4) this.lookYaw = 0
      if (Math.abs(this.lookPitch) < 1e-4) this.lookPitch = 0
    }

    const eye = car.config.cockpitEye
    const yaw = this.lookYaw
    const pitch = car.config.cockpitPitch + this.lookPitch
    const ahead = car.config.cockpitLookAhead
    _eye.set(eye.x, eye.y, eye.z)
    car.object.updateMatrixWorld()
    car.object.localToWorld(_eye)
    this.camera.position.copy(_eye)
    _look.set(
      eye.x + Math.sin(yaw) * Math.cos(pitch) * ahead,
      eye.y + Math.sin(pitch) * ahead,
      eye.z + Math.cos(yaw) * Math.cos(pitch) * ahead,
    )
    car.object.localToWorld(_look)
    this.camera.lookAt(_look)
  }

  private updateChase(car: Car, dt: number, blockers: ObstacleSet): void {
    const hullRate = wrapPi(car.hullYaw - this.prevHullYaw) / Math.max(dt, 1 / 120)
    this.prevHullYaw = car.hullYaw

    const error = wrapPi(car.hullYaw - this.yaw)
    if (Math.abs(error) < 0.012 && Math.abs(hullRate) < 0.25) {
      this.yaw = car.hullYaw
    } else {
      const turning = Math.abs(hullRate) > 0.35
      const follow = turning ? 3.4 : 9.2
      this.yaw += error * (1 - Math.exp(-follow * dt))
    }

    const sin = Math.sin(this.yaw)
    const cos = Math.cos(this.yaw)
    _pivot.set(car.position.x, car.position.y + 1.15, car.position.z)

    const back = car.config.cameraDistance
    _desired.set(
      car.position.x - sin * back,
      car.position.y + car.config.cameraHeight,
      car.position.z - cos * back,
    )

    _dir.subVectors(_desired, _pivot)
    const maxArm = _dir.length()
    let arm = maxArm
    if (maxArm > 1e-4) {
      _dir.multiplyScalar(1 / maxArm)
      const wallHit = raycastObstacles(_pivot.x, _pivot.y, _pivot.z, _dir.x, _dir.y, _dir.z, maxArm, blockers)
      const hillHit = raycastTerrain(_pivot.x, _pivot.y, _pivot.z, _dir.x, _dir.y, _dir.z, maxArm)
      const hit = nearer(wallHit, hillHit)
      arm = hit === null ? maxArm : Math.max(MIN_ARM, hit - 0.55)
      this.camera.position.set(
        _pivot.x + _dir.x * arm,
        _pivot.y + _dir.y * arm,
        _pivot.z + _dir.z * arm,
      )
    } else {
      this.camera.position.copy(_desired)
    }

    const lookDist = LOOK_AHEAD * (0.38 + 0.62 * (arm / Math.max(maxArm, 1e-4)))
    _look.set(
      car.position.x + sin * lookDist,
      terrainHeight(car.position.x + sin * lookDist, car.position.z + cos * lookDist) + 1.05,
      car.position.z + cos * lookDist,
    )
    this.camera.lookAt(_look)
    this.shakeAmp *= Math.exp(-5.8 * dt)
    if (this.shakeAmp > 0.004) {
      this.shakePhase += dt * 36
      const s = this.shakeAmp
      this.camera.position.x += Math.sin(this.shakePhase) * s * 0.85
      this.camera.position.y += Math.cos(this.shakePhase * 1.55) * s * 0.52
      this.camera.position.z += Math.sin(this.shakePhase * 0.82 + 1.1) * s * 0.85
    }
  }
}

function nearer(a: number | null, b: number | null): number | null {
  if (a === null) return b
  if (b === null) return a
  return Math.min(a, b)
}
