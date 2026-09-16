import {
  Box3,
  BoxGeometry,
  BufferGeometry,
  Color,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PointLight,
  RepeatWrapping,
  Scene,
} from 'three'
import type { Aabb } from './collision'
import { ARENA_HALF, FLY_X, FLY_Z, ROAD_HALF, ROAD_STEP } from './config'
import { stripJunk } from './rig'
import { configureFlyover, terrainHeight } from './terrain'

const _dummy = new Object3D()
const _box = new Box3()

const TILE_NAMES = new Set([
  'Cubo',
  'Cubo.001',
  'Cubo.002',
  'Cubo.003',
  'Cube',
  'Cube.001',
  'Cube.002',
  'Cube.003',
  'Cube.004',
])

const ARTERIAL = new Set([-320, -160, 0, 160, 320])
const LAMP_STEP = 28
const LAMP_SIDE = 6.15
const GLOW_LIGHTS = 6
const ASPHALT_W = 7.35
const ASPHALT_H = 0.12
const PAVEMENT = 0.48
const FLY_CLEAR = 24

type TilePart = {
  geo: BufferGeometry
  material: MeshStandardMaterial
}

type Tile = {
  name: string
  parts: TilePart[]
  sizeX: number
  sizeZ: number
  sizeY: number
  /** Yaw that puts the high end toward +Z (ramps). */
  highYaw: number
}

type Pose = { x: number; z: number; y?: number; yaw: number; sy?: number }

type StreetWorld = {
  materials: MeshStandardMaterial[]
  lampMats: MeshStandardMaterial[]
  lamps: { x: number; z: number; y: number }[]
  glow: PointLight[]
  setNight: (night: number) => void
  tickLamps: (followX: number, followZ: number) => void
}

export function addStreetCity(
  scene: Scene,
  pack: Object3D,
  lampRoot: Object3D,
  obstacles: Aabb[],
): StreetWorld {
  stripJunk(pack)
  stripJunk(lampRoot)
  pack.updateMatrixWorld(true)
  lampRoot.updateMatrixWorld(true)

  const tiles = gatherTiles(pack)
  const arterial = mustTile(tiles, 'Cube')
  const cross = mustTile(tiles, 'Cube.002')
  const minorCross = tiles.get('Cube.001') ?? cross
  const ramp = tiles.get('Cube.003') ?? arterial
  const bridge = tiles.get('Cubo') ?? tiles.get('Cubo.001') ?? arterial

  const byName = new Map<string, Pose[]>()
  const add = (tile: Tile, pose: Pose): void => {
    const list = byName.get(tile.name)
    const y = pose.y ?? tilePoseY(pose.x, pose.z)
    const ready = { ...pose, y }
    if (list) list.push(ready)
    else byName.set(tile.name, [ready])
  }

  const lines = gridLines()
  const asphalt: Pose[] = []

  for (const z of lines) {
    for (const x of lines) {
      if (isFlyover(x, z)) continue
      const tile = ARTERIAL.has(x) || ARTERIAL.has(z) ? cross : minorCross
      add(tile, { x, z, yaw: 0 })
    }
  }

  for (const z of lines) {
    fillSpan(lines, z, true, { arterial, cross, minorCross }, add, asphalt)
  }
  for (const x of lines) {
    fillSpan(lines, x, false, { arterial, cross, minorCross }, add, asphalt)
  }

  placeFlyover(add, { ramp, bridge })
  const asphaltMat = addAsphalt(scene, asphalt, arterial.parts[0]?.material)

  const materials: MeshStandardMaterial[] = asphaltMat ? [asphaltMat] : []
  for (const tile of uniqueTiles(tiles)) {
    const poses = byName.get(tile.name)
    if (!poses?.length) continue
    for (const part of tile.parts) {
      const mesh = new InstancedMesh(part.geo, part.material, poses.length)
      mesh.receiveShadow = true
      mesh.castShadow = false
      mesh.frustumCulled = false
      mesh.name = `Street:${tile.name}`
      for (let i = 0; i < poses.length; i++) {
        const p = poses[i]
        _dummy.position.set(p.x, p.y ?? 0, p.z)
        _dummy.rotation.set(0, p.yaw, 0)
        _dummy.scale.set(1, p.sy ?? 1, 1)
        _dummy.updateMatrix()
        mesh.setMatrixAt(i, _dummy.matrix)
      }
      mesh.instanceMatrix.needsUpdate = true
      scene.add(mesh)
      materials.push(part.material)
    }
  }

  const lamp = bakeLamp(lampRoot)
  const lampPoses = layoutLamps(lines)
  const lampMats: MeshStandardMaterial[] = []
  for (const part of lamp.parts) {
    if (!lampPoses.length) break
    const mesh = new InstancedMesh(part.geo, part.material, lampPoses.length)
    mesh.castShadow = false
    mesh.receiveShadow = true
    mesh.frustumCulled = false
    mesh.name = 'StreetLamp'
    for (let i = 0; i < lampPoses.length; i++) {
      const p = lampPoses[i]
      _dummy.position.set(p.x, p.y ?? 0, p.z)
      _dummy.rotation.set(0, p.yaw, 0)
      _dummy.scale.setScalar(lamp.scale)
      _dummy.updateMatrix()
      mesh.setMatrixAt(i, _dummy.matrix)
    }
    mesh.instanceMatrix.needsUpdate = true
    scene.add(mesh)
    lampMats.push(part.material)
  }
  _dummy.scale.set(1, 1, 1)

  const glow: PointLight[] = []
  for (let i = 0; i < GLOW_LIGHTS; i++) {
    const light = new PointLight(0xffc98a, 0, 32, 1.6)
    light.castShadow = false
    scene.add(light)
    glow.push(light)
  }

  const lift = 2.55
  const deck = lift + Math.max(bridge.sizeY - 0.4, 4.8)
  const span = Math.max(bridge.sizeZ, bridge.sizeX) * 0.48
  configureFlyover(deck, span, ramp.sizeZ * 0.92)
  addFlyoverPiers(obstacles)

  const lamps = lampPoses.map((p) => ({ x: p.x, z: p.z, y: (p.y ?? 0) + lamp.bulbY }))
  return {
    materials,
    lampMats,
    lamps,
    glow,
    setNight(night: number) {
      const on = night > 0.04
      for (const mat of lampMats) {
        const lampish = /lamp/i.test(mat.name)
        mat.emissiveIntensity = lampish ? 0.8 + night * 6.5 : night * 0.35
      }
      for (const light of glow) {
        light.intensity = on ? 4.5 + night * 14 : 0
        light.visible = on
      }
    },
    tickLamps(followX: number, followZ: number) {
      if (!lamps.length || glow[0].intensity <= 0.02) return
      const picked = nearestLamps(lamps, followX, followZ, GLOW_LIGHTS)
      for (let i = 0; i < glow.length; i++) {
        const p = picked[i]
        if (!p) {
          glow[i].visible = false
          continue
        }
        glow[i].visible = true
        glow[i].position.set(p.x, p.y, p.z)
      }
    },
  }
}

function tilePoseY(x: number, z: number): number {
  return terrainHeight(x, z)
}

function isFlyover(x: number, z: number): boolean {
  return x === FLY_X && z === FLY_Z
}

function along(tile: Tile): number {
  return tile.sizeZ >= tile.sizeX ? tile.sizeZ : tile.sizeX
}

function streetYaw(eastWest: boolean): number {
  return eastWest ? Math.PI / 2 : 0
}

function mustTile(tiles: Map<string, Tile>, name: string): Tile {
  const tile = tiles.get(name) ?? tiles.get(name.replaceAll('.', ''))
  if (!tile) {
    const have = [...tiles.keys()].join(', ')
    throw new Error(`Street pack missing ${name} (have: ${have})`)
  }
  return tile
}

function uniqueTiles(tiles: Map<string, Tile>): Tile[] {
  const seen = new Set<Tile>()
  const out: Tile[] = []
  for (const tile of tiles.values()) {
    if (seen.has(tile)) continue
    seen.add(tile)
    out.push(tile)
  }
  return out
}

function gridLines(): number[] {
  const lines: number[] = []
  const start = -Math.floor(ARENA_HALF / ROAD_STEP) * ROAD_STEP
  for (let v = start; v <= ARENA_HALF + 0.01; v += ROAD_STEP) lines.push(v)
  return lines
}

function crossAt(
  x: number,
  z: number,
  kinds: { cross: Tile; minorCross: Tile },
): Tile | null {
  if (isFlyover(x, z)) return null
  return ARTERIAL.has(x) || ARTERIAL.has(z) ? kinds.cross : kinds.minorCross
}

function crossInset(tile: Tile, eastWest: boolean): number {
  return (eastWest ? tile.sizeX : tile.sizeZ) * 0.5
}

function fillSpan(
  lines: number[],
  fixed: number,
  eastWest: boolean,
  kinds: { arterial: Tile; cross: Tile; minorCross: Tile },
  add: (tile: Tile, pose: Pose) => void,
  asphalt: Pose[],
): void {
  const yaw = streetYaw(eastWest)
  const skipFly = !eastWest && fixed === FLY_X
  for (let i = 0; i < lines.length - 1; i++) {
    const a = lines[i]
    const b = lines[i + 1]
    const nodeA = crossAt(eastWest ? a : fixed, eastWest ? fixed : a, kinds)
    const nodeB = crossAt(eastWest ? b : fixed, eastWest ? fixed : b, kinds)
    const cursor = a + (nodeA ? crossInset(nodeA, eastWest) : 0)
    const end = b - (nodeB ? crossInset(nodeB, eastWest) : 0)
    if (end - cursor < 4) continue
    packStraight(cursor, end, kinds.arterial, eastWest, fixed, yaw, skipFly, add, asphalt)
  }
}

function packStraight(
  cursor: number,
  end: number,
  tile: Tile,
  eastWest: boolean,
  fixed: number,
  yaw: number,
  skipFly: boolean,
  add: (tile: Tile, pose: Pose) => void,
  asphalt: Pose[],
): void {
  const span = end - cursor
  const len = along(tile)
  const n = Math.max(1, Math.round(span / len))
  const step = span / n
  for (let i = 0; i < n; i++) {
    const at = cursor + (i + 0.5) * step
    if (skipFly && Math.abs(at - FLY_Z) < FLY_CLEAR) continue
    if (eastWest) add(tile, { x: at, z: fixed, yaw })
    else add(tile, { x: fixed, z: at, yaw })
    const ax = eastWest ? at : fixed
    const az = eastWest ? fixed : at
    asphalt.push({
      x: ax,
      z: az,
      y: terrainHeight(ax, az) + PAVEMENT - ASPHALT_H * 0.5,
      yaw,
      sy: step + 0.55,
    })
  }
}

function placeFlyover(
  add: (tile: Tile, pose: Pose) => void,
  pieces: { ramp: Tile; bridge: Tile },
): void {
  const bridgeLen = along(pieces.bridge)
  const rampLen = pieces.ramp.sizeZ
  const ground = terrainHeight(FLY_X, FLY_Z)
  const lift = 2.55
  const deck = lift + pieces.bridge.sizeY - 0.4
  add(pieces.bridge, { x: FLY_X, z: FLY_Z, y: ground + lift, yaw: 0 })
  const offset = bridgeLen * 0.52 + rampLen * 0.5
  const sy = Math.max(0.35, deck / Math.max(pieces.ramp.sizeY, 0.2))
  add(pieces.ramp, { x: FLY_X, z: FLY_Z - offset, y: ground, yaw: pieces.ramp.highYaw, sy })
  add(pieces.ramp, { x: FLY_X, z: FLY_Z + offset, y: ground, yaw: pieces.ramp.highYaw + Math.PI, sy })
}

function addFlyoverPiers(obstacles: Aabb[]): void {
  const w = ROAD_HALF + 1.4
  const inset = 8.6
  const piers = [
    { x: FLY_X - w, z: FLY_Z - inset },
    { x: FLY_X + w, z: FLY_Z - inset },
    { x: FLY_X - w, z: FLY_Z + inset },
    { x: FLY_X + w, z: FLY_Z + inset },
  ]
  for (const p of piers) {
    obstacles.push({
      minX: p.x - 0.55,
      maxX: p.x + 0.55,
      minZ: p.z - 0.55,
      maxZ: p.z + 0.55,
      minY: 0,
      maxY: 2.8,
    })
  }
}

function addAsphalt(
  scene: Scene,
  poses: Pose[],
  src: MeshStandardMaterial | undefined,
): MeshStandardMaterial | null {
  if (!poses.length) return null
  const geo = new BoxGeometry(ASPHALT_W, ASPHALT_H, 1)
  const mat = src ? src.clone() : new MeshStandardMaterial({ color: 0x5a5b5e })
  mat.color.multiplyScalar(0.58)
  mat.roughness = 0.74
  mat.metalness = 0.04
  mat.envMapIntensity = 0.2
  mat.polygonOffset = true
  mat.polygonOffsetFactor = -2
  mat.polygonOffsetUnits = -2
  if (mat.map) {
    mat.map = mat.map.clone()
    mat.map.wrapS = RepeatWrapping
    mat.map.wrapT = RepeatWrapping
    mat.map.repeat.set(1.15, 1)
    mat.map.needsUpdate = true
  }
  const mesh = new InstancedMesh(geo, mat, poses.length)
  mesh.receiveShadow = true
  mesh.castShadow = false
  mesh.frustumCulled = false
  mesh.name = 'Street:asphalt'
  for (let i = 0; i < poses.length; i++) {
    const p = poses[i]
    _dummy.position.set(p.x, p.y ?? 0, p.z)
    _dummy.rotation.set(0, p.yaw, 0)
    _dummy.scale.set(1, 1, p.sy ?? 1)
    _dummy.updateMatrix()
    mesh.setMatrixAt(i, _dummy.matrix)
  }
  mesh.instanceMatrix.needsUpdate = true
  scene.add(mesh)
  _dummy.scale.set(1, 1, 1)
  return mat
}

function layoutLamps(lines: number[]): Pose[] {
  const out: Pose[] = []
  const reach = ARENA_HALF - 8
  for (const z of lines) {
    if (!ARTERIAL.has(z)) continue
    let side = 1
    for (let x = -reach; x <= reach; x += LAMP_STEP) {
      if (Math.abs(x - FLY_X) < 18 && Math.abs(z - FLY_Z) < 22) {
        side *= -1
        continue
      }
      out.push({
        x,
        z: z + side * LAMP_SIDE,
        y: terrainHeight(x, z + side * LAMP_SIDE),
        yaw: side > 0 ? -Math.PI / 2 : Math.PI / 2,
      })
      side *= -1
    }
  }
  for (const x of lines) {
    if (!ARTERIAL.has(x)) continue
    let side = 1
    for (let z = -reach; z <= reach; z += LAMP_STEP) {
      if (x === FLY_X && Math.abs(z - FLY_Z) < ROAD_STEP * 0.55) {
        side *= -1
        continue
      }
      if (Math.abs(distToEven(z, LAMP_STEP)) < 4) continue
      out.push({
        x: x + side * LAMP_SIDE,
        z,
        y: terrainHeight(x + side * LAMP_SIDE, z),
        yaw: side > 0 ? Math.PI : 0,
      })
      side *= -1
    }
  }
  return out
}

function distToEven(v: number, step: number): number {
  const t = ((v % step) + step) % step
  return Math.min(t, step - t)
}

function nearestLamps(
  lamps: { x: number; z: number; y: number }[],
  fx: number,
  fz: number,
  n: number,
): { x: number; z: number; y: number }[] {
  const scored = lamps.map((p) => ({ p, d: (p.x - fx) ** 2 + (p.z - fz) ** 2 }))
  scored.sort((a, b) => a.d - b.d)
  return scored.slice(0, n).map((s) => s.p)
}

function gatherTiles(root: Object3D): Map<string, Tile> {
  const out = new Map<string, Tile>()
  const hub = findHub(root)
  for (const child of hub.children) {
    if (!child.children.length) continue
    const key = packKey(child.name)
    const tile = bakeTile(child)
    out.set(key, tile)
    out.set(child.name, tile)
  }
  if (!out.size) {
    root.traverse((obj) => {
      const key = packKey(obj.name)
      if (!TILE_NAMES.has(key) || out.has(key)) return
      out.set(key, bakeTile(obj))
    })
  }
  return out
}

function packKey(name: string): string {
  const dotted = name.replaceAll('_', '.')
  return dotted.replace(/([A-Za-z])(\d+)$/, '$1.$2')
}

function findHub(root: Object3D): Object3D {
  let hub: Object3D | null = null
  root.traverse((obj) => {
    if (hub) return
    if (obj.name === 'RootNode' || obj.name === 'root') hub = obj
  })
  return hub ?? root
}

function bakeTile(obj: Object3D): Tile {
  _box.setFromObject(obj)
  const ox = (_box.min.x + _box.max.x) * 0.5
  const oy = _box.min.y
  const oz = (_box.min.z + _box.max.z) * 0.5
  const parts: TilePart[] = []
  obj.traverse((child) => {
    const mesh = child as Mesh
    if (!mesh.isMesh) return
    const geo = mesh.geometry.clone()
    geo.applyMatrix4(mesh.matrixWorld)
    geo.translate(-ox, -oy, -oz)
    geo.computeVertexNormals()
    parts.push({ geo, material: cloneStreetMat(mesh.material) })
  })
  const sizeX = _box.max.x - _box.min.x
  const sizeZ = _box.max.z - _box.min.z
  const sizeY = _box.max.y - _box.min.y
  return {
    name: obj.name,
    parts,
    sizeX,
    sizeZ,
    sizeY,
    highYaw: slopeHighYaw(parts[0]?.geo),
  }
}

function slopeHighYaw(geo: BufferGeometry | undefined): number {
  if (!geo) return 0
  const pos = geo.attributes.position
  let yPos = 0
  let nPos = 0
  let yNeg = 0
  let nNeg = 0
  for (let i = 0; i < pos.count; i++) {
    const z = pos.getZ(i)
    const y = pos.getY(i)
    if (z >= 0) {
      yPos += y
      nPos += 1
    } else {
      yNeg += y
      nNeg += 1
    }
  }
  if (!nPos || !nNeg) return 0
  return yPos / nPos >= yNeg / nNeg ? 0 : Math.PI
}

function bakeLamp(root: Object3D): { parts: TilePart[]; scale: number; bulbY: number } {
  _box.setFromObject(root)
  const height = Math.max(_box.max.y - _box.min.y, 0.001)
  const scale = 7.6 / height
  const ox = (_box.min.x + _box.max.x) * 0.12
  const oy = _box.min.y
  const oz = (_box.min.z + _box.max.z) * 0.5
  const parts: TilePart[] = []
  root.traverse((child) => {
    const mesh = child as Mesh
    if (!mesh.isMesh) return
    const geo = mesh.geometry.clone()
    geo.applyMatrix4(mesh.matrixWorld)
    geo.translate(-ox, -oy, -oz)
    geo.computeVertexNormals()
    const material = cloneStreetMat(mesh.material)
    if (/lamp/i.test(mesh.name) || /lamp/i.test(material.name)) {
      material.emissive = new Color(0xffe1b0)
      material.emissiveIntensity = 0.12
    }
    parts.push({ geo, material })
  })
  return { parts, scale, bulbY: 6.4 }
}

function cloneStreetMat(src: Mesh['material']): MeshStandardMaterial {
  const first = Array.isArray(src) ? src[0] : src
  if (first instanceof MeshStandardMaterial) {
    const mat = first.clone()
    mat.polygonOffset = true
    mat.polygonOffsetFactor = -1
    mat.roughness = Math.max(mat.roughness, 0.68)
    mat.envMapIntensity = 0.28
    return mat
  }
  return new MeshStandardMaterial({ color: 0x5a5a58, roughness: 0.72, envMapIntensity: 0.2 })
}
