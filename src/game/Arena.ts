import {
  ACESFilmicToneMapping,
  CanvasTexture,
  Color,
  DirectionalLight,
  FogExp2,
  HemisphereLight,
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
} from 'three'
import { AabbIndex, type Aabb } from './collision'
import { ARENA_HALF } from './config'
import { displaceTerrain, terrainHeight } from './terrain'

const _dummy = new Object3D()

export class Arena {
  readonly obstacles: Aabb[] = []
  readonly cameraBlockers: Aabb[] = []
  obstacleIndex = new AabbIndex([])
  blockerIndex = new AabbIndex([])
  readonly sun: DirectionalLight
  private readonly scene: Scene
  private readonly hemi: HemisphereLight
  private readonly fog: FogExp2

  constructor(scene: Scene) {
    this.scene = scene
    scene.background = new Color(0x87a0b4)
    this.fog = new FogExp2(0x87a0b4, 0.0026)
    scene.fog = this.fog

    this.hemi = new HemisphereLight(0xd7e6f4, 0x4a4030, 0.9)
    scene.add(this.hemi)

    this.sun = new DirectionalLight(0xffe2b8, 1.55)
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(1024, 1024)
    this.sun.shadow.camera.near = 4
    this.sun.shadow.camera.far = 220
    this.sun.shadow.camera.left = -42
    this.sun.shadow.camera.right = 42
    this.sun.shadow.camera.top = 42
    this.sun.shadow.camera.bottom = -42
    this.sun.shadow.bias = -0.00035
    scene.add(this.sun)
    scene.add(this.sun.target)

    const groundGeo = new PlaneGeometry(ARENA_HALF * 2.18, ARENA_HALF * 2.18, 180, 180)
    groundGeo.rotateX(-Math.PI / 2)
    displaceTerrain(groundGeo)
    const ground = new Mesh(groundGeo, makeLotMaterial())
    ground.receiveShadow = true
    scene.add(ground)

    this.addMarks()
    this.addCurb()
  }

  indexCollision(): void {
    this.obstacleIndex = new AabbIndex(this.obstacles)
    this.blockerIndex = new AabbIndex(this.cameraBlockers)
  }

  followSun(follow: Vector3): void {
    this.sun.position.set(follow.x + 48, 86, follow.z + 22)
    this.sun.target.position.copy(follow)
    this.sun.target.updateMatrixWorld()
  }

  private addMarks(): void {
    const geo = new PlaneGeometry(ARENA_HALF * 2, ARENA_HALF * 2, 180, 180)
    geo.rotateX(-Math.PI / 2)
    displaceTerrain(geo)
    const pos = geo.attributes.position
    for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) + 0.05)
    pos.needsUpdate = true
    const mesh = new Mesh(geo, makeGridMaterial())
    mesh.receiveShadow = true
    this.scene.add(mesh)
  }

  private addCurb(): void {
    const count = 4 * 42
    const geo = new PlaneGeometry(7.6, 0.55).rotateX(-Math.PI / 2)
    const mat = new MeshStandardMaterial({
      color: 0xc9b48a,
      roughness: 0.78,
      metalness: 0.04,
    })
    const mesh = new InstancedMesh(geo, mat, count)
    mesh.castShadow = false
    mesh.receiveShadow = true
    const inset = ARENA_HALF - 1.1
    let i = 0
    const perSide = count / 4
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
  renderer.toneMappingExposure = 1.08
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = PCFShadowMap
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
}

function makeLotMaterial(): MeshStandardMaterial {
  const map = makeLotMap()
  return new MeshStandardMaterial({
    color: 0xb7b3a4,
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
  map.repeat.set(36, 36)
  map.anisotropy = 8
  return map
}

function makeGridMaterial(): MeshStandardMaterial {
  const size = 1024
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Missing 2d canvas')
  ctx.clearRect(0, 0, size, size)
  ctx.strokeStyle = 'rgba(236, 214, 150, 0.22)'
  ctx.lineWidth = 3
  const step = size / 8
  for (let i = 1; i < 8; i++) {
    ctx.beginPath()
    ctx.moveTo(i * step, 0)
    ctx.lineTo(i * step, size)
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(0, i * step)
    ctx.lineTo(size, i * step)
    ctx.stroke()
  }
  ctx.strokeStyle = 'rgba(236, 214, 150, 0.55)'
  ctx.lineWidth = 6
  ctx.strokeRect(10, 10, size - 20, size - 20)
  const map = new CanvasTexture(canvas)
  map.colorSpace = SRGBColorSpace
  map.anisotropy = 8
  const mat = new MeshStandardMaterial({
    map,
    transparent: true,
    depthWrite: false,
    roughness: 1,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  })
  return mat
}

function fract(n: number): number {
  return n - Math.floor(n)
}

function smooth01(x: number): number {
  const t = Math.max(0, Math.min(1, x))
  return t * t * (3 - 2 * t)
}
