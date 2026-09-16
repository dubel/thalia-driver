import type { BufferGeometry } from 'three'
import { ARENA_HALF, FLY_X, FLY_Z, ROAD_HALF, ROAD_STEP } from './config'

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
  return 1 - smoothstep(ROAD_HALF, ROAD_HALF + 7, distToRoad(x, z))
}

/** Gentle bed the pavement follows, so streets are not a perfect plane. */
export function roadBed(x: number, z: number): number {
  return 0.55 * Math.sin(x * 0.0065 + 0.35) + 0.42 * Math.sin(z * 0.0078 - 0.9)
}

let flyDeck = 6.2
let flySpan = 9
let flyRamp = 24

export function configureFlyover(deck: number, span: number, ramp: number): void {
  flyDeck = deck
  flySpan = span
  flyRamp = ramp
}

/** Extra height on the NS flyover (0 on the EW underpass). */
export function flyoverLift(x: number, z: number, yaw: number): number {
  const ns = Math.abs(Math.cos(yaw)) >= 0.48
  if (!ns) return 0
  if (Math.abs(x - FLY_X) > ROAD_HALF + 2.2) return 0
  const adz = Math.abs(z - FLY_Z)
  const rampEnd = flySpan + flyRamp
  if (adz > rampEnd) return 0
  if (adz <= flySpan) return flyDeck
  const t = 1 - (adz - flySpan) / flyRamp
  return flyDeck * t * t * (3 - 2 * t)
}

/** Off-road hills plus graded streets. No flyover — that is heading-dependent. */
export function terrainHeight(x: number, z: number): number {
  const edge = Math.max(Math.abs(x), Math.abs(z))
  const wall = smoothstep(ARENA_HALF - 16, ARENA_HALF, edge)
  const hills =
    Math.sin(x * 0.018 + z * 0.014) * 1.85 +
    Math.sin(x * 0.009 - z * 0.012 + 1.7) * 1.35 +
    Math.sin(x * 0.041 + z * 0.033 + 0.4) * 0.45 +
    Math.sin(x * 0.0055 + z * 0.007 + 4.2) * 1.2
  const bed = roadBed(x, z)
  const flatten = roadFlatten(x, z)
  const off = Math.max(0, hills) * (1 - flatten)
  return Math.max(0, (bed + off) * (1 - wall))
}

/** Extra sit height so the hull rests on the pavement top, not the tile underside. */
function roadDeck(x: number, z: number): number {
  return roadFlatten(x, z) * 0.48
}

/** Height the car sits on, including pavement thickness and the NS overpass. */
export function surfaceHeight(x: number, z: number, yaw = 0): number {
  const ground = terrainHeight(x, z)
  const fly = flyoverLift(x, z, yaw)
  if (fly > 0.05) return ground + fly
  return ground + roadDeck(x, z)
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
