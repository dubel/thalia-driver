import { BoxGeometry, Color, InstancedMesh, MeshLambertMaterial, Object3D, Scene } from 'three'
import type { Aabb } from './collision'
import { ROAD_STEP } from './config'
import { gridLines } from './streets'
import { terrainHeight } from './terrain'

const _dummy = new Object3D()
const _color = new Color()

/** Keep boxes off sidewalks and lamp grass. Road centerline ± this is empty. */
const ROAD_INSET = 14
const PALETTE = [0x8a8680, 0x6d6964, 0x9a948c, 0x5a5652, 0x7c766e, 0x4e524c]

function hash01(a: number, b: number): number {
  const n = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return n - Math.floor(n)
}

/** Dozens of untextured boxes in city blocks. One instanced draw, no shadows. */
export function addBlockBuildings(scene: Scene, obstacles: Aabb[], cameraBlockers: Aabb[]): number {
  const lines = gridLines()
  const poses: { x: number; y: number; z: number; sx: number; sy: number; sz: number; color: number }[] = []

  for (let i = 0; i < lines.length - 1; i++) {
    for (let j = 0; j < lines.length - 1; j++) {
      const x0 = lines[i]
      const x1 = lines[i + 1]
      const z0 = lines[j]
      const z1 = lines[j + 1]
      if (x0 === undefined || x1 === undefined || z0 === undefined || z1 === undefined) continue
      const cx = (x0 + x1) * 0.5
      const cz = (z0 + z1) * 0.5
      if (Math.abs(cx) < ROAD_STEP && Math.abs(cz) < ROAD_STEP) continue
      const h = hash01(i, j)
      if (h < 0.38) continue
      const innerW = x1 - x0 - ROAD_INSET * 2
      const innerD = z1 - z0 - ROAD_INSET * 2
      if (innerW < 16 || innerD < 16) continue
      const sx = 12 + h * 24
      const sz = 11 + hash01(j, i) * 22
      const sy = 7 + hash01(i + 3, j + 9) * 30
      const ox = (h - 0.5) * Math.max(0, innerW - sx) * 0.7
      const oz = (hash01(j + 1, i) - 0.5) * Math.max(0, innerD - sz) * 0.7
      const x = cx + ox
      const z = cz + oz
      const y0 = terrainHeight(x, z)
      poses.push({
        x,
        y: y0 + sy * 0.5,
        z,
        sx,
        sy,
        sz,
        color: PALETTE[Math.floor(hash01(i * 5, j * 7) * PALETTE.length)] ?? 0x7a766e,
      })
      const box: Aabb = {
        minX: x - sx * 0.5,
        maxX: x + sx * 0.5,
        minZ: z - sz * 0.5,
        maxZ: z + sz * 0.5,
        minY: y0,
        maxY: y0 + sy,
      }
      obstacles.push(box)
      cameraBlockers.push(box)
    }
  }

  if (!poses.length) return 0
  const geo = new BoxGeometry(1, 1, 1)
  const mat = new MeshLambertMaterial({ color: 0x888480 })
  const mesh = new InstancedMesh(geo, mat, poses.length)
  mesh.name = 'BlockBuildings'
  mesh.castShadow = false
  mesh.receiveShadow = false
  mesh.frustumCulled = true
  for (let i = 0; i < poses.length; i++) {
    const p = poses[i]
    if (!p) continue
    _dummy.position.set(p.x, p.y, p.z)
    _dummy.rotation.set(0, 0, 0)
    _dummy.scale.set(p.sx, p.sy, p.sz)
    _dummy.updateMatrix()
    mesh.setMatrixAt(i, _dummy.matrix)
    mesh.setColorAt(i, _color.setHex(p.color))
  }
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  mesh.computeBoundingSphere()
  scene.add(mesh)
  _dummy.scale.set(1, 1, 1)
  return poses.length
}
