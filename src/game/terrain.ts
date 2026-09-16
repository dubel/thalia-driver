import type { BufferGeometry } from 'three'
import { ARENA_HALF, ROAD_HALF, ROAD_STEP } from './config'

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

export function distToGrid(v: number, step: number): number {
  const t = ((v % step) + step) % step
  return Math.min(t, step - t)
}

export function distToRoad(x: number, z: number): number {
  return Math.min(distToGrid(x, ROAD_STEP), distToGrid(z, ROAD_STEP))
}

function roadFlatten(x: number, z: number): number {
  return 1 - smoothstep(ROAD_HALF, ROAD_HALF + 9, distToRoad(x, z))
}

/** Shallow bed the pavement follows — city streets stay nearly flat. */
export function roadBed(x: number, z: number): number {
  return 0.08 * Math.sin(x * 0.0048 + 0.35) + 0.06 * Math.sin(z * 0.0054 - 0.9)
}

/** Off-road ripples a few tens of centimetres. Streets sit on the bed. */
export function terrainHeight(x: number, z: number): number {
  const edge = Math.max(Math.abs(x), Math.abs(z))
  const wall = smoothstep(ARENA_HALF - 16, ARENA_HALF, edge)
  const hills =
    Math.sin(x * 0.016 + z * 0.012) * 0.22 +
    Math.sin(x * 0.028 - z * 0.021 + 1.7) * 0.12 +
    Math.sin(x * 0.007 + z * 0.009 + 4.2) * 0.16
  const bed = roadBed(x, z)
  const flatten = roadFlatten(x, z)
  const off = Math.max(0, hills) * (1 - flatten)
  return Math.max(0, (bed + off) * (1 - wall))
}

/** Extra sit height so the hull rests on the pavement top, not the tile underside. */
function roadDeck(x: number, z: number): number {
  return roadFlatten(x, z) * 0.48
}

/** Height the car sits on, including pavement thickness. */
export function surfaceHeight(x: number, z: number, _yaw = 0): number {
  return terrainHeight(x, z) + roadDeck(x, z)
}

export function displaceTerrain(geometry: BufferGeometry): void {
  const pos = geometry.attributes.position
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)))
  }
  pos.needsUpdate = true
  geometry.computeVertexNormals()
}

export function raycastTerrain(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
  pad = 0.55,
  start = 0.65,
  step = 0.35,
): number | null {
  for (let t = start; t <= maxDist; t += step) {
    const y = oy + dy * t
    if (y < terrainHeight(ox + dx * t, oz + dz * t) + pad) return t
  }
  return null
}
