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
import type { CarConfig } from './config'

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

export type CarRig = {
  root: Group
  visual: Group
  wheels: WheelRig[]
  halfWidth: number
  halfLength: number
  height: number
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

  const body = new Box3().setFromObject(visual)
  body.getSize(_size)
  return {
    root,
    visual,
    wheels,
    halfWidth: Math.max(_size.x * 0.5, 0.7),
    halfLength: Math.max(_size.z * 0.48, 1.4),
    height: _size.y,
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
      mat.envMapIntensity = 1.25
      mat.needsUpdate = true
    }
  })
}

const CABIN_GRAY = 0xc9cbce

function recodeCabinTrim(root: Object3D): void {
  const box = new Box3()
  root.traverse((child) => {
    const mesh = child as Mesh
    if (!mesh.isMesh) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    const paintable = mats.some(
      (mat) =>
        mat instanceof MeshStandardMaterial &&
        (/Interno/i.test(mat.name) || /Plastico/i.test(mat.name)),
    )
    if (!paintable) return
    box.setFromObject(mesh)
    if (!isCabinTrim(box)) return
    const next = mats.map((mat) => {
      if (!(mat instanceof MeshStandardMaterial)) return mat
      if (!/Interno/i.test(mat.name) && !/Plastico/i.test(mat.name)) return mat
      const clone = mat.clone()
      clone.color.setHex(CABIN_GRAY)
      clone.metalness = 0.08
      clone.roughness = 0.58
      clone.envMapIntensity = 0.55
      clone.needsUpdate = true
      return clone
    })
    mesh.material = next.length === 1 ? next[0] : next
  })
}

function isCabinTrim(box: Box3): boolean {
  const sx = box.max.x - box.min.x
  const sy = box.max.y - box.min.y
  const sz = box.max.z - box.min.z
  const cx = (box.min.x + box.max.x) * 0.5
  const cy = (box.min.y + box.max.y) * 0.5
  const cz = (box.min.z + box.max.z) * 0.5
  if (isHeadliner(box, sx, sy, sz)) return false
  if (box.max.y < 0.38) return false
  const dash =
    cy > 0.48 &&
    cy < 1.05 &&
    box.max.y < 1.1 &&
    cz > 0.18 &&
    cz < 1.15 &&
    sx > 0.7 &&
    sy < 0.62 &&
    Math.abs(cx) < 0.55
  const door =
    Math.abs(cx) > 0.42 && cy > 0.32 && cy < 1.12 && sx < 0.24 && sy > 0.22 && sz > 0.45 && box.max.y < 1.22
  const pillar =
    Math.abs(cx) > 0.28 &&
    box.max.y > 1.05 &&
    box.min.y < 0.95 &&
    sy > 0.42 &&
    sx < 0.28 &&
    sz < 0.42
  return dash || door || pillar
}

function isHeadliner(box: Box3, sx: number, sy: number, sz: number): boolean {
  const roofSheet = box.min.y > 0.95 && sy < 0.4 && sx > 0.45 && sz > 0.7
  const thinHigh = box.min.y > 1.02 && sy < 0.24 && Math.max(sx, sz) > 0.55
  return roofSheet || thinHigh
}
