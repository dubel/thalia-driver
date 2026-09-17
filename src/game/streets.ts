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
import { ARENA_HALF, ROAD_HALF, ROAD_STEP } from './config'
import { stripJunk } from './rig'
import { distToGrid, terrainHeight } from './terrain'

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

const LAMP_STEP = 32
/** Split the 950 m grid so frustum culling can drop off-screen tiles. */
const STREET_CHUNK = 160
/** Outer sidewalk of Cube is ~5.03 m; sit on the grass just off the curb. */
const LAMP_SIDE = 5.85
const LAMP_CROSS_CLEAR = ROAD_HALF + 2.4
const GLOW_LIGHTS = 2
const LAMP_DISTANCE = 58
/** Inner hole of Cube / Cube.001 is 6 m. Stay inside the sidewalks. */
const ASPHALT_W = 5.92
const ASPHALT_H = 0.12
const PAVEMENT = 0.48
const SIDEWALK_OVERLAP = 0.12

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
}

type Pose = { x: number; z: number; y?: number; yaw: number; sx?: number; sy?: number; sz?: number }

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
  const straight = mustTile(tiles, 'Cube')
  const cross = mustTile(tiles, 'Cube.001')
  const crossSz = straight.sizeX / cross.sizeZ
  const crossHalf = straight.sizeX * 0.5

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
      add(cross, { x, z, yaw: 0, sz: crossSz })
      asphalt.push({
        x,
        z,
        y: terrainHeight(x, z) + PAVEMENT - ASPHALT_H * 0.5,
        yaw: 0,
        sy: ASPHALT_W,
      })
    }
  }

  for (const z of lines) {
    fillSpan(lines, z, true, straight, crossHalf, add, asphalt)
  }
  for (const x of lines) {
    fillSpan(lines, x, false, straight, crossHalf, add, asphalt)
  }

  const asphaltMat = addAsphalt(scene, asphalt, findAsphaltMat(straight, cross))

  const materials: MeshStandardMaterial[] = asphaltMat ? [asphaltMat] : []
  for (const tile of uniqueTiles(tiles)) {
    const poses = byName.get(tile.name)
    if (!poses?.length) continue
    for (const part of tile.parts) {
      addInstanced(scene, part.geo, part.material, poses, `Street:${tile.name}`, 'tile', {
        receiveShadow: false,
      })
      materials.push(part.material)
    }
  }

  const lamp = bakeLamp(lampRoot)
  const lampPoses = layoutLamps(lines)
  for (const p of lampPoses) {
    obstacles.push({
      minX: p.x - 0.22,
      maxX: p.x + 0.22,
      minZ: p.z - 0.22,
      maxZ: p.z + 0.22,
      minY: 0,
      maxY: 6.4,
    })
  }
  const lampMats: MeshStandardMaterial[] = []
  for (const part of lamp.parts) {
    if (!lampPoses.length) break
    addInstanced(scene, part.geo, part.material, lampPoses, 'StreetLamp', 'lamp', {
      receiveShadow: false,
      lampScale: lamp.scale,
    })
    lampMats.push(part.material)
  }
  _dummy.scale.set(1, 1, 1)

  const glow: PointLight[] = []
  for (let i = 0; i < GLOW_LIGHTS; i++) {
    const light = new PointLight(0xffc98a, 0, LAMP_DISTANCE, 1.25)
    light.castShadow = false
    scene.add(light)
    glow.push(light)
  }

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
        mat.emissiveIntensity = lampish ? 1.4 + night * 8.5 : night * 0.45
      }
      for (const light of glow) {
        light.intensity = on ? 16 + night * 36 : 0
        light.distance = LAMP_DISTANCE
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

export function gridLines(): number[] {
  const lines: number[] = []
  const start = -Math.floor(ARENA_HALF / ROAD_STEP) * ROAD_STEP
  for (let v = start; v <= ARENA_HALF + 0.01; v += ROAD_STEP) lines.push(v)
  return lines
}

function fillSpan(
  lines: number[],
  fixed: number,
  eastWest: boolean,
  straight: Tile,
  crossHalf: number,
  add: (tile: Tile, pose: Pose) => void,
  asphalt: Pose[],
): void {
  const yaw = streetYaw(eastWest)
  for (let i = 0; i < lines.length - 1; i++) {
    const a = lines[i]
    const b = lines[i + 1]
    const cursor = a + crossHalf - SIDEWALK_OVERLAP
    const end = b - crossHalf + SIDEWALK_OVERLAP
    if (end - cursor >= 4) {
      packStraight(cursor, end, straight, eastWest, fixed, yaw, add, asphalt)
    }
  }
}

function packStraight(
  cursor: number,
  end: number,
  tile: Tile,
  eastWest: boolean,
  fixed: number,
  yaw: number,
  add: (tile: Tile, pose: Pose) => void,
  asphalt: Pose[],
): void {
  const len = along(tile)
  const step = len * 0.88
  const first = cursor + len * 0.5
  const last = end - len * 0.5
  const positions: number[] = []
  if (last - first < 0.8) {
    positions.push((cursor + end) * 0.5)
  } else {
    for (let at = first; at < last - 0.15; at += step) positions.push(at)
    const prev = positions[positions.length - 1]
    if (prev === undefined || last - prev > 1.1) positions.push(last)
    else positions[positions.length - 1] = last
  }
  for (const at of positions) {
    const ax = eastWest ? at : fixed
    const az = eastWest ? fixed : at
    add(tile, { x: ax, z: az, yaw })
    asphalt.push({
      x: ax,
      z: az,
      y: terrainHeight(ax, az) + PAVEMENT - ASPHALT_H * 0.5,
      yaw,
      sy: step + 0.2,
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
  const mat = src ? src.clone() : new MeshStandardMaterial({ color: 0x3a3c40, roughness: 0.22 })
  mat.roughness = src?.userData.asphalt ? (src.userData.baseRough ?? 0.2) : 0.22
  mat.metalness = 0.04
  mat.envMapIntensity = 0.1
  mat.polygonOffset = true
  mat.polygonOffsetFactor = -2
  mat.polygonOffsetUnits = -2
  mat.userData.asphalt = true
  mat.userData.baseRough = mat.roughness
  if (mat.map) {
    mat.map = mat.map.clone()
    mat.map.wrapS = RepeatWrapping
    mat.map.wrapT = RepeatWrapping
    mat.map.repeat.set(1, 1)
    mat.map.needsUpdate = true
  }
  addInstanced(scene, geo, mat, poses, 'Street:asphalt', 'asphalt', { receiveShadow: true })
  return mat
}

function chunkKey(x: number, z: number): string {
  return `${Math.floor(x / STREET_CHUNK)}:${Math.floor(z / STREET_CHUNK)}`
}

function addInstanced(
  scene: Scene,
  geo: BufferGeometry,
  mat: MeshStandardMaterial,
  poses: Pose[],
  name: string,
  kind: 'tile' | 'asphalt' | 'lamp',
  opts: { receiveShadow: boolean; lampScale?: number },
): void {
  if (!poses.length) return
  geo.computeBoundingBox()
  geo.computeBoundingSphere()
  const buckets = new Map<string, Pose[]>()
  for (const pose of poses) {
    const key = chunkKey(pose.x, pose.z)
    const list = buckets.get(key)
    if (list) list.push(pose)
    else buckets.set(key, [pose])
  }
  for (const [key, list] of buckets) {
    const mesh = new InstancedMesh(geo, mat, list.length)
    mesh.receiveShadow = opts.receiveShadow
    mesh.castShadow = false
    mesh.frustumCulled = true
    mesh.name = `${name}:${key}`
    stampPoses(mesh, list, kind, opts.lampScale ?? 1)
    mesh.computeBoundingSphere()
    scene.add(mesh)
  }
}

function stampPoses(
  mesh: InstancedMesh,
  poses: Pose[],
  kind: 'tile' | 'asphalt' | 'lamp',
  lampScale: number,
): void {
  for (let i = 0; i < poses.length; i++) {
    const p = poses[i]
    _dummy.position.set(p.x, p.y ?? 0, p.z)
    _dummy.rotation.set(0, p.yaw, 0)
    if (kind === 'asphalt') _dummy.scale.set(p.sx ?? 1, 1, p.sy ?? 1)
    else if (kind === 'lamp') _dummy.scale.setScalar(lampScale)
    else _dummy.scale.set(p.sx ?? 1, p.sy ?? 1, p.sz ?? 1)
    _dummy.updateMatrix()
    mesh.setMatrixAt(i, _dummy.matrix)
  }
  mesh.instanceMatrix.needsUpdate = true
  _dummy.scale.set(1, 1, 1)
}

function layoutLamps(lines: number[]): Pose[] {
  const out: Pose[] = []
  const first = lines[0]
  const last = lines[lines.length - 1]
  if (first === undefined || last === undefined) return out

  const place = (along: number, fixed: number, eastWest: boolean, side: number): void => {
    if (along < first + 3 || along > last - 3) return
    if (distToGrid(along, ROAD_STEP) < LAMP_CROSS_CLEAR) return
    const x = eastWest ? along : fixed + side * LAMP_SIDE
    const z = eastWest ? fixed + side * LAMP_SIDE : along
    out.push({
      x,
      z,
      y: terrainHeight(x, z),
      yaw: eastWest ? (side > 0 ? -Math.PI / 2 : Math.PI / 2) : side > 0 ? Math.PI : 0,
    })
  }

  for (const z of lines) {
    let side = 1
    for (let x = first; x <= last + 0.01; x += LAMP_STEP) {
      place(x, z, true, side)
      side *= -1
    }
  }
  for (const x of lines) {
    let side = 1
    for (let z = first; z <= last + 0.01; z += LAMP_STEP) {
      place(z, x, false, side)
      side *= -1
    }
  }
  return out
}

function nearestLamps(
  lamps: { x: number; z: number; y: number }[],
  fx: number,
  fz: number,
  n: number,
): { x: number; z: number; y: number }[] {
  let first: { x: number; z: number; y: number } | undefined
  let second: { x: number; z: number; y: number } | undefined
  let firstD = Infinity
  let secondD = Infinity
  for (const lamp of lamps) {
    const d = (lamp.x - fx) ** 2 + (lamp.z - fz) ** 2
    if (d < firstD) {
      second = first
      secondD = firstD
      first = lamp
      firstD = d
    } else if (d < secondD) {
      second = lamp
      secondD = d
    }
  }
  const out: { x: number; z: number; y: number }[] = []
  if (first) out.push(first)
  if (n > 1 && second) out.push(second)
  return out
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
  }
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
    const asphalt = /Materiais/i.test(mat.name)
    mat.userData.asphalt = asphalt
    mat.userData.baseRough = mat.roughness
    mat.polygonOffset = true
    mat.polygonOffsetFactor = -1
    if (!asphalt) mat.roughness = Math.max(mat.roughness, 0.68)
    mat.envMapIntensity = asphalt ? 0.1 : 0.28
    return mat
  }
  return new MeshStandardMaterial({ color: 0x5a5a58, roughness: 0.72, envMapIntensity: 0.2 })
}

function findAsphaltMat(straight: Tile, cross: Tile): MeshStandardMaterial | undefined {
  for (const tile of [straight, cross]) {
    for (const part of tile.parts) {
      if (part.material.userData.asphalt) return part.material
    }
  }
  return straight.parts[1]?.material ?? straight.parts[0]?.material
}
