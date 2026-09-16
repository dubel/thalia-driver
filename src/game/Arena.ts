import {
  ACESFilmicToneMapping,
  CanvasTexture,
  InstancedMesh,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PCFShadowMap,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  SRGBColorSpace,
  Vector3,
  type PerspectiveCamera,
} from 'three'
import { AabbIndex, type Aabb } from './collision'
import { ARENA_HALF } from './config'
import { Atmosphere, type WindClock } from './atmosphere'
import { addStreetCity } from './streets'
import { displaceTerrain, terrainHeight } from './terrain'

const _dummy = new Object3D()

export class Arena {
  readonly obstacles: Aabb[] = []
  readonly cameraBlockers: Aabb[] = []
  obstacleIndex = new AabbIndex([])
  blockerIndex = new AabbIndex([])
  readonly atmosphere: Atmosphere
  readonly wind: WindClock = {
    value: 0,
    strength: { value: 0.5 },
    dirX: { value: 0.85 },
    dirZ: { value: 0.35 },
  }
  private readonly scene: Scene
  private readonly groundMat: MeshStandardMaterial
  private readonly groundBase = 0x6e6c5e
  private streetMats: MeshStandardMaterial[] = []
  private streets: ReturnType<typeof addStreetCity> | null = null
  private streetWet = -1
  private streetNight = -1

  constructor(scene: Scene) {
    this.scene = scene
    this.atmosphere = new Atmosphere(scene, this.wind)

    const groundGeo = new PlaneGeometry(ARENA_HALF * 2.18, ARENA_HALF * 2.18, 64, 64)
    groundGeo.rotateX(-Math.PI / 2)
    displaceTerrain(groundGeo)
    this.groundMat = makeLotMaterial()
    const ground = new Mesh(groundGeo, this.groundMat)
    ground.receiveShadow = true
    scene.add(ground)

    this.addCurb()
  }

  addStreets(pack: Object3D, lamps: Object3D): void {
    this.streets = addStreetCity(this.scene, pack, lamps, this.obstacles)
    this.streetMats = this.streets.materials
  }

  indexCollision(): void {
    this.obstacleIndex = new AabbIndex(this.obstacles)
    this.blockerIndex = new AabbIndex(this.cameraBlockers)
  }

  tick(dt: number, camera: PerspectiveCamera, follow: Vector3): void {
    this.atmosphere.tick(dt, camera, follow)
    const wet = this.atmosphere.wetness
    const night = this.atmosphere.night
    this.groundMat.roughness = 0.94 - wet * 0.28
    this.groundMat.metalness = 0.02 + wet * 0.08
    this.groundMat.color.setHex(this.groundBase).multiplyScalar(1 - night * 0.72)
    const wetChanged = Math.abs(wet - this.streetWet) > 0.01
    const nightChanged = Math.abs(night - this.streetNight) > 0.01
    if (wetChanged || nightChanged) {
      this.streetWet = wet
      this.streetNight = night
      for (const mat of this.streetMats) {
        const asphalt = !!mat.userData.asphalt
        const base = Number(mat.userData.baseRough ?? (asphalt ? 0.2 : 0.7))
        mat.roughness = asphalt ? Math.max(0.1, base - wet * 0.08) : 0.7 - wet * 0.2
        mat.metalness = asphalt ? 0.03 + wet * 0.06 : 0.03 + wet * 0.06
        mat.envMapIntensity = asphalt
          ? 0.08 + (1 - night) * 0.1 + wet * 0.06
          : 0.08 + (1 - night) * 0.22
      }
    }
    if (this.streets) {
      this.streets.setNight(this.atmosphere.night)
      this.streets.tickLamps(follow.x, follow.z)
    }
  }

  private addCurb(): void {
    const perSide = 96
    const count = 4 * perSide
    const geo = new PlaneGeometry(7.6, 0.55).rotateX(-Math.PI / 2)
    const mat = new MeshStandardMaterial({
      color: 0xc9b48a,
      roughness: 0.78,
      metalness: 0.04,
    })
    const mesh = new InstancedMesh(geo, mat, count)
    mesh.castShadow = false
    mesh.receiveShadow = false
    const inset = ARENA_HALF - 1.1
    let i = 0
    for (let s = 0; s < 4; s++) {
      for (let k = 0; k < perSide; k++) {
        const t = (k / perSide) * 2 - 1
        const along = t * inset
        if (s === 0) _dummy.position.set(along, 0, inset)
        else if (s === 1) _dummy.position.set(along, 0, -inset)
        else if (s === 2) _dummy.position.set(inset, 0, along)
        else _dummy.position.set(-inset, 0, along)
        _dummy.position.y = terrainHeight(_dummy.position.x, _dummy.position.z) + 0.03
        _dummy.rotation.set(0, s < 2 ? 0 : Math.PI / 2, 0)
        _dummy.updateMatrix()
        mesh.setMatrixAt(i, _dummy.matrix)
        i++
      }
    }
    this.scene.add(mesh)
    const wall = 1.15
    const h = ARENA_HALF
    const rim: Aabb[] = [
      { minX: -h, maxX: h, minZ: h - wall, maxZ: h + 2, minY: 0, maxY: 1.4 },
      { minX: -h, maxX: h, minZ: -h - 2, maxZ: -h + wall, minY: 0, maxY: 1.4 },
      { minX: h - wall, maxX: h + 2, minZ: -h, maxZ: h, minY: 0, maxY: 1.4 },
      { minX: -h - 2, maxX: -h + wall, minZ: -h, maxZ: h, minY: 0, maxY: 1.4 },
    ]
    this.obstacles.push(...rim)
    this.cameraBlockers.push(...rim)
  }
}

export function configureRenderer(renderer: import('three').WebGLRenderer): void {
  renderer.outputColorSpace = SRGBColorSpace
  renderer.toneMapping = ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.02
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFShadowMap
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5))
}

function makeLotMaterial(): MeshStandardMaterial {
  const map = makeLotMap()
  return new MeshStandardMaterial({
    color: 0x6e6c5e,
    map,
    roughness: 0.92,
    metalness: 0.03,
  })
}

function makeLotMap(): CanvasTexture {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Missing 2d canvas')
  const image = ctx.createImageData(size, size)
  const data = image.data
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      const n = fract(Math.sin(x * 12.9898 + y * 78.233) * 43758.5453)
      const n2 = fract(Math.sin(x * 3.71 + y * 9.13) * 24634.6345)
      const asphalt = 0.35 + n * 0.12 + n2 * 0.08
      const grassMix = smooth01((n2 - 0.42) * 1.6)
      const r = (72 + n * 28) * (1 - grassMix) + (86 + n * 22) * grassMix
      const g = (74 + n * 22) * (1 - grassMix) + (102 + n * 28) * grassMix
      const b = (68 + n * 16) * (1 - grassMix) + (48 + n * 14) * grassMix
      data[i] = r * asphalt * 1.15
      data[i + 1] = g * asphalt * 1.15
      data[i + 2] = b * asphalt * 1.15
      data[i + 3] = 255
    }
  }
  ctx.putImageData(image, 0, 0)
  const map = new CanvasTexture(canvas)
  map.colorSpace = SRGBColorSpace
  map.wrapS = RepeatWrapping
  map.wrapT = RepeatWrapping
  map.repeat.set(92, 92)
  map.anisotropy = 8
  return map
}

function fract(n: number): number {
  return n - Math.floor(n)
}

function smooth01(x: number): number {
  const t = Math.max(0, Math.min(1, x))
  return t * t * (3 - 2 * t)
}
