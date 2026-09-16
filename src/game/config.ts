export type CarConfig = {
  url: string
  targetLength: number
  /** Extra yaw so model forward matches hull +Z. */
  visualYaw?: number
  maxSpeed: number
  reverseSpeed: number
  accel: number
  brake: number
  coast: number
  turnSpeed: number
  cameraDistance: number
  cameraHeight: number
  wheelNames: string[]
  /** Body paint (`Carro_Pintura`). Leave unset to keep the GLB colour. */
  paintColor?: number
  paintMetalness?: number
  paintRoughness?: number
  label?: string
}

function parseFlag(value: string | null): boolean {
  if (!value) return false
  const n = value.trim().toLowerCase()
  return n === '1' || n === 'true' || n === 'yes'
}

const query = new URLSearchParams(window.location.search)
export const SHOW_FPS = parseFlag(query.get('fps'))
export const DESCRIBE = parseFlag(query.get('describe'))

/** Playable half-extent; same 336 m square as Karaluch (`ARENA_HALF = 168`). */
export const ARENA_HALF = 168

/** 2006 Renault Thalia / Symbol / Clio sedan, overall length ~4.26 m. */
export const THALIA_LENGTH = 4.26

export const PLAYER_SPAWN = { x: 0, z: 0, yaw: 0 }

const carUrl = new URL(
  '../../assets/2006_renault_symbol_-_clio_sedan_-_thalia.glb',
  import.meta.url,
).href

export const PLAYER_CAR: CarConfig = {
  url: carUrl,
  targetLength: THALIA_LENGTH,
  maxSpeed: 32,
  reverseSpeed: 11,
  accel: 18,
  brake: 28,
  coast: 7,
  turnSpeed: 2.55,
  cameraDistance: 8.6,
  cameraHeight: 2.55,
  wheelNames: ['roda1', 'roda2', 'roda3', 'roda4'],
  paintColor: 0xc6ccd2,
  paintMetalness: 0.68,
  paintRoughness: 0.2,
  label: 'Thalia',
}
