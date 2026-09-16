import type { BufferGeometry } from 'three'
import { ARENA_HALF } from './config'

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/** Gentle empty-lot roll. Same world size as Karaluch, no landmarks yet. */
export function terrainHeight(x: number, z: number): number {
  const edge = Math.max(Math.abs(x), Math.abs(z))
  const wall = smoothstep(ARENA_HALF - 14, ARENA_HALF, edge)
  const n =
    Math.sin(x * 0.024 + z * 0.018) * 0.2 +
    Math.sin(x * 0.013 - z * 0.016 + 1.7) * 0.14 +
    Math.sin(x * 0.052 + z * 0.041 + 0.4) * 0.05 +
    Math.sin(x * 0.008 + z * 0.011 + 4.2) * 0.1
  return Math.max(0, n) * (1 - wall) * 0.55
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
