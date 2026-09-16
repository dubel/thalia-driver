import { PerspectiveCamera, Vector3 } from 'three'
import { raycastObstacles, type ObstacleSet } from './collision'
import { raycastTerrain, terrainHeight } from './terrain'
import type { Car } from './Car'

const _look = new Vector3()
const _pivot = new Vector3()
const _desired = new Vector3()
const _dir = new Vector3()

const MIN_ARM = 3.2
const LOOK_AHEAD = 9.5

function wrapPi(angle: number): number {
  let a = angle
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

export class FollowCamera {
  readonly camera: PerspectiveCamera
  private yaw = 0
  private ready = false
  private prevHullYaw = 0
  private shakeAmp = 0
  private shakePhase = 0

  constructor() {
    this.camera = new PerspectiveCamera(62, 1, 0.2, 920)
  }

  get facingYaw(): number {
    return this.yaw
  }

  reset(car: Car): void {
    this.yaw = car.hullYaw
    this.prevHullYaw = car.hullYaw
    this.ready = true
    this.shakeAmp = 0
  }

  shake(amount: number): void {
    this.shakeAmp = Math.min(1.4, this.shakeAmp + amount)
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / Math.max(height, 1)
    this.camera.updateProjectionMatrix()
  }

  update(car: Car, dt: number, blockers: ObstacleSet): void {
    if (!this.ready) this.reset(car)

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
