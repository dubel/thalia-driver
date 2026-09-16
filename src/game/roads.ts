import {
  Box3,
  BufferGeometry,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Scene,
} from 'three'
import { ARENA_HALF, ROAD_STEP, STREET_WIDTH } from './config'
import { stripJunk } from './rig'
import { distToGrid, terrainHeight } from './terrain'

const _dummy = new Object3D()

export type StreetTile = {
  mesh: InstancedMesh
  material: MeshStandardMaterial
}

export function addStreetGrid(scene: Scene, pack: Object3D): StreetTile {
  stripJunk(pack)
  pack.updateMatrixWorld(true)
  const source = findMesh(pack)
  if (!source) throw new Error('Street GLB has no mesh')

  const geo = source.geometry.clone()
  geo.applyMatrix4(source.matrixWorld)
  flattenToGround(geo)
  geo.computeBoundingBox()
  const fitted = geo.boundingBox ?? new Box3()
  const nativeWidth = Math.max(fitted.max.z - fitted.min.z, 0.001)
  const nativeLength = Math.max(fitted.max.x - fitted.min.x, 0.001)
  const scale = STREET_WIDTH / nativeWidth
  geo.scale(scale, 1, scale)
  geo.computeBoundingBox()
  geo.computeVertexNormals()

  const tileLength = nativeLength * scale
  const material = clonePavement(source.material)
  material.polygonOffset = true
  material.polygonOffsetFactor = -1
  material.polygonOffsetUnits = -1

  const placements = layoutTiles(tileLength)
  const mesh = new InstancedMesh(geo, material, placements.length)
  mesh.receiveShadow = true
  mesh.castShadow = false
  mesh.frustumCulled = false
  mesh.name = 'StreetGrid'

  for (let i = 0; i < placements.length; i++) {
    const p = placements[i]
    _dummy.position.set(p.x, terrainHeight(p.x, p.z) + 0.02, p.z)
    _dummy.rotation.set(0, p.yaw, 0)
    _dummy.updateMatrix()
    mesh.setMatrixAt(i, _dummy.matrix)
  }
  mesh.instanceMatrix.needsUpdate = true
  scene.add(mesh)
  return { mesh, material }
}

function flattenToGround(geo: BufferGeometry): void {
  geo.computeBoundingBox()
  const b = geo.boundingBox ?? new Box3()
  const sx = b.max.x - b.min.x
  const sy = b.max.y - b.min.y
  const sz = b.max.z - b.min.z
  if (sx <= sy && sx <= sz) geo.rotateZ(Math.PI / 2)
  else if (sz <= sx && sz <= sy) geo.rotateX(-Math.PI / 2)
  geo.computeBoundingBox()
  const f = geo.boundingBox ?? b
  geo.translate(-(f.min.x + f.max.x) * 0.5, -f.min.y, -(f.min.z + f.max.z) * 0.5)
}

function findMesh(root: Object3D): Mesh | null {
  let found: Mesh | null = null
  root.traverse((child) => {
    if (found) return
    const mesh = child as Mesh
    if (mesh.isMesh) found = mesh
  })
  return found
}

function clonePavement(src: Mesh['material']): MeshStandardMaterial {
  const first = Array.isArray(src) ? src[0] : src
  if (first instanceof MeshStandardMaterial) {
    const mat = first.clone()
    mat.roughness = Math.min(mat.roughness, 0.42)
    mat.metalness = Math.max(mat.metalness, 0.04)
    mat.envMapIntensity = 1.15
    return mat
  }
  return new MeshStandardMaterial({
    color: 0x4a4a4c,
    roughness: 0.38,
    metalness: 0.08,
  })
}

function layoutTiles(tileLength: number): { x: number; z: number; yaw: number }[] {
  const lines: number[] = []
  const start = -Math.floor(ARENA_HALF / ROAD_STEP) * ROAD_STEP
  for (let v = start; v <= ARENA_HALF + 0.01; v += ROAD_STEP) lines.push(v)

  const n = Math.ceil((ARENA_HALF * 2) / tileLength) + 1
  const origin = -((n * tileLength) / 2) + tileLength / 2
  const out: { x: number; z: number; yaw: number }[] = []
  const reach = ARENA_HALF + tileLength * 0.6

  for (const z of lines) {
    for (let i = 0; i < n; i++) {
      const x = origin + i * tileLength
      if (Math.abs(x) > reach) continue
      out.push({ x, z, yaw: 0 })
    }
  }
  for (const x of lines) {
    for (let i = 0; i < n; i++) {
      const z = origin + i * tileLength
      if (Math.abs(z) > reach) continue
      if (distToGrid(z, ROAD_STEP) < tileLength * 0.48) continue
      out.push({ x, z, yaw: Math.PI / 2 })
    }
  }
  return out
}
