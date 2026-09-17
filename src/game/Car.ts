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
import { mountCluster, type Cluster } from './cluster'
import { mountRadioLcd, type RadioLcd } from './radio'
import { mountMirrors, type MirrorRig } from './mirrors'
import { clampToBounds, collidesAny, type ObstacleSet } from './collision'
import { surfaceHeight } from './terrain'

const MAX_STEER = 0.5
const MAX_YAW_RATE = 2.6
const MAX_BODY_ROLL = 0.038

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
  readonly cluster: Cluster
  readonly radioLcd: RadioLcd
  readonly mirrors: MirrorRig

  private readonly spawn = new Vector3()
  private readonly spawnYaw: number
  private readonly wheels: WheelRig[]
  private readonly lightMats: LightMats
  private readonly steering: SteeringWheel | null
  private readonly headlamps: SpotLight[] = []
  private terrainPitch = 0
  private terrainRoll = 0
  private gForceRoll = 0

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
    this.cluster = mountCluster(rig.visual, config.cockpitEye)
    this.radioLcd = mountRadioLcd(rig.visual, config.cockpitEye)
    this.mirrors = mountMirrors(rig.visual, config.cockpitEye)
    this.mirrors.setCockpit(false)
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
    this.gForceRoll = 0
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
    wetness = 0,
  ): void {
    const cfg = this.config
    const yaw = this.hullYaw
    const fwdX = Math.sin(yaw)
    const fwdZ = Math.cos(yaw)
    const rightX = Math.cos(yaw)
    const rightZ = -Math.sin(yaw)

    let forward = this.vx * fwdX + this.vz * fwdZ
    let lateral = this.vx * rightX + this.vz * rightZ

    if (throttle > 0) {
      forward += cfg.accel * throttle * dt
    } else if (throttle < 0) {
      if (forward > 0.8) forward += cfg.brake * throttle * dt
      else forward += cfg.accel * 0.62 * throttle * dt
    } else {
      const drag = handbrake ? cfg.brake * 1.35 : cfg.coast
      forward -= Math.sign(forward) * Math.min(Math.abs(forward), drag * dt)
    }
    if (handbrake) {
      forward -= Math.sign(forward) * Math.min(Math.abs(forward), cfg.brake * 0.85 * dt)
    }
    forward = Math.max(-cfg.reverseSpeed, Math.min(cfg.maxSpeed, forward))

    const speedAbs = Math.abs(forward)
    const steerTarget = steer * MAX_STEER
    this.steerAngle += (steerTarget - this.steerAngle) * (1 - Math.exp(-14 * dt))

    const wet = 1 - 0.42 * Math.min(1, wetness)
    const rearGrip = handbrake ? 0.2 : 1
    const grip = cfg.latGrip * wet * rearGrip
    lateral *= Math.exp(-grip * dt)

    const understeer = 1 / (1 + speedAbs / 16)
    const delta = this.steerAngle * understeer
    const bicycle = speedAbs > 0.12 ? (forward / cfg.wheelbase) * Math.tan(delta) : 0
    const crawlMix = 1 - Math.min(1, speedAbs / 3.2)
    const crawl = this.steerAngle * cfg.turnSpeed * 0.38 * (forward >= 0 ? 1 : -1)
    let yawRate = bicycle * (1 - crawlMix) + crawl * crawlMix
    if (handbrake && speedAbs > 1) {
      yawRate += this.steerAngle * speedAbs * 0.18
      yawRate += lateral * 0.28
    }
    yawRate = Math.max(-MAX_YAW_RATE, Math.min(MAX_YAW_RATE, yawRate))

    const nextYaw = wrapPi(yaw + yawRate * dt)
    const yawBlocked = collidesAny(
      this.object.position.x,
      this.object.position.z,
      nextYaw,
      this.halfWidth,
      this.halfLength,
      obstacles,
    )
    const poseYaw = yawBlocked ? yaw : nextYaw
    const poseSin = Math.sin(poseYaw)
    const poseCos = Math.cos(poseYaw)
    this.vx = poseSin * forward + poseCos * lateral
    this.vz = poseCos * forward - poseSin * lateral

    const nextX = this.object.position.x + this.vx * dt
    const nextZ = this.object.position.z + this.vz * dt
    const tryPos = (x: number, z: number): boolean =>
      !collidesAny(x, z, poseYaw, this.halfWidth, this.halfLength, obstacles)

    const bounded = clampToBounds(nextX, nextZ, this.halfWidth, this.halfLength, halfArena)
    if (tryPos(bounded.x, bounded.z)) {
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
      const onlyZ = clampToBounds(
        this.object.position.x,
        bounded.z,
        this.halfWidth,
        this.halfLength,
        halfArena,
      )
      if (tryPos(onlyX.x, this.object.position.z)) {
        this.object.position.x = onlyX.x
        this.vz *= 0.08
      } else if (tryPos(this.object.position.x, onlyZ.z)) {
        this.object.position.z = onlyZ.z
        this.vx *= 0.08
      } else {
        this.vx *= 0.18
        this.vz *= 0.18
      }
    }

    this.hullYaw = poseYaw
    this.speed = this.vx * poseSin + this.vz * poseCos
    const lean = -(yawRate * speedAbs) * 0.0012 - lateral * 0.004
    const leanTarget = Math.max(-MAX_BODY_ROLL, Math.min(MAX_BODY_ROLL, lean))
    this.gForceRoll += (leanTarget - this.gForceRoll) * (1 - Math.exp(-5 * dt))
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
    this.object.rotation.z = clampTilt(this.terrainRoll + this.gForceRoll)
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
      // Same long throw; aim the cone down so the pool sits closer to the bumper.
      throwBeam.target.position.set(x * 0.28, -0.95, 38)
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
