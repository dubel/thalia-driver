import {
  Box3,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector3,
  type Camera,
  type Light,
} from 'three'
import { DESCRIBE, type CarConfig } from './config'

const _size = new Vector3()
const _center = new Vector3()
const _world = new Vector3()

function isLight(obj: Object3D): obj is Light {
  return (obj as Light).isLight === true
}

function isCamera(obj: Object3D): obj is Camera {
  return (obj as Camera).isCamera === true
}

export function stripJunk(root: Object3D): void {
  const remove: Object3D[] = []
  root.traverse((obj) => {
    if (isLight(obj) || isCamera(obj)) {
      remove.push(obj)
      return
    }
    if (/^(Area|Camera|Light|Sun)(\.|$)/i.test(obj.name)) {
      remove.push(obj)
    }
  })
  for (const obj of remove) {
    obj.removeFromParent()
  }
}

export function normalizeModel(root: Object3D, targetLength: number): void {
  root.updateMatrixWorld(true)
  const box = new Box3().setFromObject(root)
  box.getSize(_size)
  const length = Math.max(_size.x, _size.z, 0.001)
  root.scale.multiplyScalar(targetLength / length)
  root.updateMatrixWorld(true)
  box.setFromObject(root)
  box.getCenter(_center)
  root.position.x -= _center.x
  root.position.z -= _center.z
  root.position.y -= box.min.y
  root.updateMatrixWorld(true)
}

function nameCandidates(name: string): string[] {
  const nodot = name.replaceAll('.', '')
  const underscored = name.replaceAll(' ', '_')
  return [...new Set([name, nodot, underscored, nodot.replaceAll(' ', '_')])]
}

function findNamed(root: Object3D, name: string): Object3D | undefined {
  for (const candidate of nameCandidates(name)) {
    const obj = root.getObjectByName(candidate)
    if (obj) return obj
  }
  return undefined
}

export type WheelRig = {
  pivot: Group
  steer: Group
  radius: number
  front: boolean
}

export type LightMats = {
  head: MeshStandardMaterial[]
  tail: MeshStandardMaterial[]
}

export type SteeringWheel = {
  pivot: Group
  axis: 'x' | 'y' | 'z'
}

export type CarRig = {
  root: Group
  visual: Group
  wheels: WheelRig[]
  halfWidth: number
  halfLength: number
  height: number
  lights: LightMats
  steering: SteeringWheel | null
}

export function applyCarRig(model: Object3D, config: CarConfig): CarRig {
  stripJunk(model)
  if (config.visualYaw) {
    model.rotation.y += config.visualYaw
    model.updateMatrixWorld(true)
  }
  normalizeModel(model, config.targetLength)

  const root = new Group()
  root.name = 'CarRoot'
  const visual = new Group()
  visual.name = 'Visual'
  root.add(visual)
  visual.add(model)

  visual.updateMatrixWorld(true)
  const aligned = new Box3().setFromObject(visual)
  aligned.getSize(_size)
  if (_size.x > _size.z * 1.15) {
    visual.rotation.y -= Math.PI / 2
    visual.updateMatrixWorld(true)
  }

  const fitted = new Box3().setFromObject(visual)
  fitted.getSize(_size)
  fitted.getCenter(_center)
  visual.position.x -= _center.x
  visual.position.z -= _center.z
  visual.position.y -= fitted.min.y
  visual.updateMatrixWorld(true)

  const wheels: WheelRig[] = []
  for (const name of config.wheelNames) {
    const part = findNamed(model, name)
    if (!part) continue
    part.updateMatrixWorld(true)
    const box = new Box3().setFromObject(part)
    box.getCenter(_world)
    box.getSize(_size)
    const steer = new Group()
    steer.name = `Steer:${name}`
    visual.add(steer)
    visual.worldToLocal(_world)
    steer.position.copy(_world)
    const pivot = new Group()
    pivot.name = `Spin:${name}`
    steer.add(pivot)
    pivot.attach(part)
    wheels.push({
      pivot,
      steer,
      radius: Math.max(_size.y, _size.z) * 0.5,
      front: steer.position.z > 0.15,
    })
  }

  if (config.paintColor !== undefined) recodePaint(visual, config)
  recodeCabinTrim(visual)
  const lights = collectLightMats(visual)
  const steering = findSteeringWheel(visual, config.cockpitEye)

  const body = new Box3().setFromObject(visual)
  body.getSize(_size)
  return {
    root,
    visual,
    wheels,
    halfWidth: Math.max(_size.x * 0.5, 0.7),
    halfLength: Math.max(_size.z * 0.48, 1.4),
    height: _size.y,
    lights,
    steering,
  }
}

function recodePaint(root: Object3D, config: CarConfig): void {
  const seen = new Set<MeshStandardMaterial>()
  root.traverse((child) => {
    const mesh = child as Mesh
    if (!mesh.isMesh) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const mat of mats) {
      if (!(mat instanceof MeshStandardMaterial)) continue
      if (!/Pintura/i.test(mat.name)) continue
      if (seen.has(mat)) continue
      seen.add(mat)
      mat.color.setHex(config.paintColor ?? 0xc6ccd2)
      if (config.paintMetalness !== undefined) mat.metalness = config.paintMetalness
      if (config.paintRoughness !== undefined) mat.roughness = config.paintRoughness
      mat.envMapIntensity = 0.72
      mat.needsUpdate = true
    }
  })
}

const CABIN_GRAY = 0x3a3c3f

function recodeCabinTrim(root: Object3D): void {
  const box = new Box3()
  root.traverse((child) => {
    const mesh = child as Mesh
    if (!mesh.isMesh) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const hasInterno = mats.some((mat) => mat instanceof MeshStandardMaterial && /Interno/i.test(mat.name))
    const hasPlastico = mats.some(
      (mat) => mat instanceof MeshStandardMaterial && /Plastico/i.test(mat.name),
    )
    if (!hasInterno && !hasPlastico) return
    box.setFromObject(mesh)
    const sx = box.max.x - box.min.x
    const sy = box.max.y - box.min.y
    const sz = box.max.z - box.min.z
    if (hasInterno && isHeadliner(box, sx, sy, sz)) return
    if (hasPlastico && !hasInterno && !isDoorCard(box)) return
    const next = mats.map((mat) => {
      if (!(mat instanceof MeshStandardMaterial)) return mat
      const interno = /Interno/i.test(mat.name)
      const plastico = /Plastico/i.test(mat.name)
      if (!interno && !plastico) return mat
      if (plastico && !interno && !isDoorCard(box)) return mat
      const clone = mat.clone()
      clone.color.setHex(CABIN_GRAY)
      clone.metalness = 0.04
      clone.roughness = 0.72
      clone.envMapIntensity = 0.22
      clone.needsUpdate = true
      return clone
    })
    mesh.material = next.length === 1 ? next[0] : next
  })
}

function isDoorCard(box: Box3): boolean {
  const sx = box.max.x - box.min.x
  const sy = box.max.y - box.min.y
  const sz = box.max.z - box.min.z
  const cx = (box.min.x + box.max.x) * 0.5
  const cy = (box.min.y + box.max.y) * 0.5
  return Math.abs(cx) > 0.42 && cy > 0.32 && cy < 1.12 && sx < 0.24 && sy > 0.22 && sz > 0.45
}

function isHeadliner(box: Box3, sx: number, sy: number, sz: number): boolean {
  const roofSheet = box.min.y > 0.95 && sy < 0.4 && sx > 0.45 && sz > 0.7
  const thinHigh = box.min.y > 1.02 && sy < 0.24 && Math.max(sx, sz) > 0.55
  return roofSheet || thinHigh
}

function collectLightMats(root: Object3D): LightMats {
  const head: MeshStandardMaterial[] = []
  const tail: MeshStandardMaterial[] = []
  const remap = new Map<MeshStandardMaterial, MeshStandardMaterial>()
  const box = new Box3()
  root.traverse((child) => {
    const mesh = child as Mesh
    if (!mesh.isMesh) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    box.setFromObject(mesh)
    const span = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z)
    const next = mats.map((mat) => {
      if (!(mat instanceof MeshStandardMaterial)) return mat
      const mapped = remap.get(mat)
      if (mapped) return mapped
      const farol = /Farol/i.test(mat.name)
      const lantern = /Lanterna/i.test(mat.name)
      const frontColor = /FrontColor/i.test(mat.name)
      if (!farol && !lantern && !frontColor) return mat
      if (frontColor && span > 0.55) return mat
      const clone = mat.clone()
      clone.emissiveIntensity = 0
      clone.needsUpdate = true
      remap.set(mat, clone)
      if (farol || frontColor) head.push(clone)
      if (lantern) tail.push(clone)
      return clone
    })
    mesh.material = next.length === 1 ? next[0] : next
  })
  return { head, tail }
}

function findSteeringWheel(visual: Object3D, eye: { x: number; y: number; z: number }): SteeringWheel | null {
  const box = new Box3()
  let best: Mesh | null = null
  let bestScore = Infinity
  visual.traverse((child) => {
    const mesh = child as Mesh
    if (!mesh.isMesh) return
    if (/roda|pneu|vidro|tire|wheel/i.test(mesh.name)) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const cabin = mats.some(
      (mat) => mat instanceof MeshStandardMaterial && /Plastico|Interno/i.test(mat.name),
    )
    if (!cabin) return
    box.setFromObject(mesh)
    visual.worldToLocal(_center.copy(box.getCenter(new Vector3())))
    box.getSize(_size)
    const cx = _center.x
    const cy = _center.y
    const cz = _center.z
    const dims = [_size.x, _size.y, _size.z].sort((a, b) => a - b)
    const thin = dims[0]
    const mid = dims[1]
    const wide = dims[2]
    if (wide < 0.22 || wide > 0.55 || thin > 0.22 || mid < 0.18) return
    if (Math.abs(cx - eye.x) > 0.42) return
    if (cy < 0.62 || cy > 1.32) return
    if (cz < 0.08 || cz > 0.92) return
    const score =
      (cx - eye.x) ** 2 + (cy - (eye.y - 0.22)) ** 2 + (cz - 0.42) ** 2 + thin * 0.4
    if (score < bestScore) {
      bestScore = score
      best = mesh
    }
  })
  if (!best) return null
  const wheel: Mesh = best
  box.setFromObject(wheel)
  visual.worldToLocal(_world.copy(box.getCenter(new Vector3())))
  box.getSize(_size)
  const pivot = new Group()
  pivot.name = 'SteerWheel'
  visual.add(pivot)
  pivot.position.copy(_world)
  pivot.attach(wheel)
  const axis: 'x' | 'y' | 'z' =
    _size.z <= _size.x && _size.z <= _size.y ? 'z' : _size.x <= _size.y ? 'x' : 'y'
  if (DESCRIBE) console.info('Steering wheel', wheel.name, axis)
  return { pivot, axis }
}
