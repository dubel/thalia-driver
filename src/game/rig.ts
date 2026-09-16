import {
  Box3,
  Group,
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
