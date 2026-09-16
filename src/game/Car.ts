import {
  CanvasTexture,
  Group,
  LinearFilter,
  Mesh,
  Object3D,
  SpotLight,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from 'three'
import { DESCRIBE, type CarConfig } from './config'
import { applyCarRig, type LightMats, type SteeringWheel, type WheelRig } from './rig'
import { clampToBounds, collidesAny, type ObstacleSet } from './collision'
import { surfaceHeight } from './terrain'

const _forward = new Vector3()

function wrapPi(angle: number): number {
  let a = angle
  while (a > Math.PI) a -= Math.PI * 2
  while (a < -Math.PI) a += Math.PI * 2
  return a
}

function clampTilt(angle: number): number {
  return Math.max(-0.38, Math.min(0.38, angle))
}

function labelMaterial(text: string): SpriteMaterial {
  const dpr = 2
  const fontSize = 22
  const padX = 10
  const padY = 5
  const probe = document.createElement('canvas').getContext('2d')
  if (!probe) throw new Error('Missing 2d canvas')
  probe.font = `600 ${fontSize}px "Segoe UI", system-ui, sans-serif`
  const textW = Math.ceil(probe.measureText(text).width)
  const w = textW + padX * 2
  const h = fontSize + padY * 2
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(w * dpr)
  canvas.height = Math.ceil(h * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Missing 2d canvas')
  ctx.scale(dpr, dpr)
  ctx.font = probe.font
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = 'rgba(10, 12, 8, 0.78)'
  ctx.beginPath()
  ctx.roundRect(0.5, 0.5, w - 1, h - 1, 6)
  ctx.fill()
  ctx.strokeStyle = 'rgba(232, 196, 138, 0.7)'
  ctx.lineWidth = 1
  ctx.stroke()
  ctx.fillStyle = '#f3e6c0'
  ctx.fillText(text, w / 2, h / 2 + 0.5)
  const map = new CanvasTexture(canvas)
  map.colorSpace = SRGBColorSpace
  map.generateMipmaps = false
  map.minFilter = LinearFilter
  map.magFilter = LinearFilter
  const mat = new SpriteMaterial({
    map,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    sizeAttenuation: true,
    toneMapped: false,
    fog: false,
  })
  mat.userData.aspect = w / h
  return mat
}

export class Car {
  readonly config: CarConfig
  readonly object: Group
  readonly halfWidth: number
  readonly halfLength: number
  readonly height: number

  hullYaw = 0
  speed = 0
  vx = 0
  vz = 0
  steerAngle = 0
  lightsOn = false

  private readonly spawn = new Vector3()
  private readonly spawnYaw: number
  private readonly wheels: WheelRig[]
  private readonly lightMats: LightMats
  private readonly steering: SteeringWheel | null
  private readonly headlamps: SpotLight[] = []
  private terrainPitch = 0
  private terrainRoll = 0

  constructor(model: Object3D, config: CarConfig, spawn: Vector3, spawnYaw: number) {
    this.config = config
    const rig = applyCarRig(model, config)
    this.object = rig.root
    this.wheels = rig.wheels
    this.lightMats = rig.lights
    this.steering = rig.steering
    this.halfWidth = rig.halfWidth
    this.halfLength = rig.halfLength
    this.height = rig.height
    this.spawn.copy(spawn)
    this.spawnYaw = spawnYaw
    this.object.position.copy(spawn)
    this.hullYaw = spawnYaw
    this.sitOnTerrain()
    this.object.traverse((child) => {
      const mesh = child as Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = /Pintura|roda|Roda|pneu/i.test(mesh.name)
      mesh.receiveShadow = false
    })
    if (DESCRIBE) this.attachLabel()
    this.mountHeadlights()
    if (DESCRIBE && !this.steering) console.warn('Steering wheel mesh not found')
  }

  get position(): Vector3 {
    return this.object.position
  }

  reset(): void {
    this.speed = 0
    this.vx = 0
    this.vz = 0
    this.steerAngle = 0
    this.object.position.copy(this.spawn)
    this.hullYaw = this.spawnYaw
    for (const wheel of this.wheels) {
      wheel.pivot.rotation.x = 0
      wheel.steer.rotation.y = 0
    }
    if (this.steering) this.steering.pivot.quaternion.copy(this.steering.rest)
    this.sitOnTerrain()
  }

  drive(
    throttle: number,
    steer: number,
    handbrake: boolean,
    dt: number,
    obstacles: ObstacleSet,
    halfArena: number,
  ): void {
    const cfg = this.config
    if (throttle > 0) {
      this.speed += cfg.accel * throttle * dt
    } else if (throttle < 0) {
      if (this.speed > 0.8) this.speed += cfg.brake * throttle * dt
      else this.speed += cfg.accel * 0.62 * throttle * dt
    } else {
      const drag = handbrake ? cfg.brake * 1.35 : cfg.coast
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), drag * dt)
    }
    if (handbrake) {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), cfg.brake * 0.85 * dt)
    }
    this.speed = Math.max(-cfg.reverseSpeed, Math.min(cfg.maxSpeed, this.speed))

    const speedAbs = Math.abs(this.speed)
    const steerTarget = steer * 0.55
    this.steerAngle += (steerTarget - this.steerAngle) * (1 - Math.exp(-14 * dt))
    const grip = handbrake ? 1.55 : 1
    const lowSpeed = speedAbs < 0.45 ? 0.42 : 1
    const highSpeed = 1 / (1 + speedAbs / 24)
    const moving = Math.sign(this.speed || (Math.abs(steer) > 0.05 ? 1 : 0))
    const turn =
      this.steerAngle * cfg.turnSpeed * grip * lowSpeed * highSpeed * moving * dt
    const nextYaw = wrapPi(this.hullYaw + turn)

    _forward.set(Math.sin(nextYaw), 0, Math.cos(nextYaw))
    const dist = this.speed * dt
    const nextX = this.object.position.x + _forward.x * dist
    const nextZ = this.object.position.z + _forward.z * dist

    const blockedYaw = collidesAny(
      this.object.position.x,
      this.object.position.z,
      nextYaw,
      this.halfWidth,
      this.halfLength,
      obstacles,
    )
    const yaw = blockedYaw ? this.hullYaw : nextYaw
    const prevX = this.object.position.x
    const prevZ = this.object.position.z

    const tryPos = (x: number, z: number, y: number): boolean =>
      !collidesAny(x, z, y, this.halfWidth, this.halfLength, obstacles)

    const bounded = clampToBounds(nextX, nextZ, this.halfWidth, this.halfLength, halfArena)
    if (tryPos(bounded.x, bounded.z, yaw)) {
      this.object.position.x = bounded.x
      this.object.position.z = bounded.z
    } else {
      const onlyX = clampToBounds(
        bounded.x,
        this.object.position.z,
        this.halfWidth,
        this.halfLength,
        halfArena,
      )
      if (tryPos(onlyX.x, this.object.position.z, yaw)) {
        this.object.position.x = onlyX.x
      } else {
        const onlyZ = clampToBounds(
          this.object.position.x,
          bounded.z,
          this.halfWidth,
          this.halfLength,
          halfArena,
        )
        if (tryPos(this.object.position.x, onlyZ.z, yaw)) {
          this.object.position.z = onlyZ.z
        } else {
          this.speed *= 0.35
        }
      }
      this.speed *= 0.72
    }

    this.hullYaw = yaw
    this.vx = dt > 1e-5 ? (this.object.position.x - prevX) / dt : 0
    this.vz = dt > 1e-5 ? (this.object.position.z - prevZ) / dt : 0
    this.sitOnTerrain(dt)
    this.spinWheels(dt)
  }

  nudgeYaw(delta: number): void {
    if (Math.abs(delta) < 1e-6) return
    this.hullYaw = wrapPi(this.hullYaw + delta)
  }

  toggleLights(): void {
    this.lightsOn = !this.lightsOn
  }

  syncLights(night: number): void {
    const on = this.lightsOn
    for (const mat of this.lightMats.head) {
      mat.color.setHex(0xffffff)
      mat.emissive.setHex(0xf4f7ff)
      mat.emissiveIntensity = on ? 3.2 + night * 10 : 0
    }
    for (const mat of this.lightMats.tail) {
      mat.emissive.setHex(0xff2a12)
      mat.emissiveIntensity = on ? 1.8 + night * 7.5 : 0
    }
    const throwI = on ? 40 + night * 280 : 0
    for (const lamp of this.headlamps) {
      lamp.intensity = throwI
      lamp.visible = on
    }
  }

  sitOnTerrain(dt = 0): void {
    const x = this.object.position.x
    const z = this.object.position.z
    const yaw = this.hullYaw
    const sin = Math.sin(yaw)
    const cos = Math.cos(yaw)
    const along = this.halfLength * 0.88
    const across = this.halfWidth * 0.82
    const hFR = surfaceHeight(x + sin * along + cos * across, z + cos * along - sin * across, yaw)
    const hFL = surfaceHeight(x + sin * along - cos * across, z + cos * along + sin * across, yaw)
    const hBR = surfaceHeight(x - sin * along + cos * across, z - cos * along - sin * across, yaw)
    const hBL = surfaceHeight(x - sin * along - cos * across, z - cos * along + sin * across, yaw)
    const hF = (hFR + hFL) * 0.5
    const hB = (hBR + hBL) * 0.5
    const hR = (hFR + hBR) * 0.5
    const hL = (hFL + hBL) * 0.5
    const targetY = (hFR + hFL + hBR + hBL) * 0.25
    const targetPitch = clampTilt(Math.atan2(hB - hF, along * 2))
    const targetRoll = clampTilt(Math.atan2(hL - hR, across * 2))
    if (dt <= 0) {
      this.object.position.y = targetY
      this.terrainPitch = targetPitch
      this.terrainRoll = targetRoll
    } else {
      const k = 1 - Math.exp(-11 * dt)
      this.object.position.y += (targetY - this.object.position.y) * k
      this.terrainPitch += (targetPitch - this.terrainPitch) * k
      this.terrainRoll += (targetRoll - this.terrainRoll) * k
    }
    this.applyHullPose()
  }

  private applyHullPose(): void {
    this.object.rotation.order = 'YXZ'
    this.object.rotation.y = this.hullYaw
    this.object.rotation.x = this.terrainPitch
    this.object.rotation.z = this.terrainRoll
  }

  private spinWheels(dt: number): void {
    const travel = this.speed * dt
    for (const wheel of this.wheels) {
      const radius = Math.max(wheel.radius, 0.28)
      wheel.pivot.rotation.x += travel / radius
      wheel.steer.rotation.y = wheel.front ? this.steerAngle : this.steerAngle * 0.08
    }
    if (this.steering) {
      this.steering.pivot.quaternion.copy(this.steering.rest)
      this.steering.pivot.rotateOnAxis(this.steering.axis, -this.steerAngle * 8.4)
    }
  }

  private mountHeadlights(): void {
    const sides = [-0.58, 0.58]
    for (const x of sides) {
      const throwBeam = new SpotLight(0xf4f7ff, 0, 82, 0.28, 0.42, 1.15)
      throwBeam.position.set(x, 0.72, 1.92)
      throwBeam.target.position.set(x * 0.28, -0.35, 38)
      throwBeam.castShadow = false
      this.object.add(throwBeam)
      this.object.add(throwBeam.target)
      this.headlamps.push(throwBeam)
    }
  }

  private attachLabel(): void {
    const text = this.config.label
    if (!text) return
    const sprite = new Sprite(labelMaterial(text))
    const worldH = 0.22
    const aspect = Number(sprite.material.userData.aspect) || 4
    sprite.scale.set(worldH * aspect, worldH, 1)
    sprite.center.set(0.5, 0)
    sprite.position.y = this.height * 0.58 + 0.28
    sprite.name = `Describe:${text}`
    sprite.renderOrder = 8
    sprite.frustumCulled = false
    this.object.add(sprite)
  }
}
