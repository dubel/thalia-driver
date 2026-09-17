import {
  BufferAttribute,
  CircleGeometry,
  DoubleSide,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PerspectiveCamera,
  Shape,
  ShapeGeometry,
  RepeatWrapping,
  SRGBColorSpace,
  Vector3,
  WebGLRenderTarget,
  type Scene,
  type WebGLRenderer,
} from 'three'
import type { Atmosphere } from './atmosphere'

const RT_W = 256
const RT_H = 128
const _center = new Vector3()
const _p = new Vector3()
const _fwd = new Vector3()
const _right = new Vector3()
const _up = new Vector3()
const _look = new Vector3()

/** Hull-local glass. Mesh12 chrome/plastic live at the windshield header, not the dash. */
const INNER_HULL = { x: 0, y: 1.26, z: 0.522 }
/** Cabin-facing face of the Mesh86 / Mesh49 oval — not the outboard bulb center. */
const LEFT_HULL = { x: -0.935, y: 0.952, z: 0.728 }
const RIGHT_HULL = { x: 0.935, y: 0.952, z: 0.728 }

type PadKind = 'left' | 'right' | 'inner'

type Pad = {
  kind: PadKind
  mesh: Mesh
  camera: PerspectiveCamera
  target: WebGLRenderTarget
  fov: number
}

function findMesh(root: Object3D, name: string): Mesh | undefined {
  let found: Mesh | undefined
  root.traverse((child) => {
    const mesh = child as Mesh
    if (mesh.isMesh && mesh.name === name) found = mesh
  })
  return found
}

function makeTarget(): WebGLRenderTarget {
  const target = new WebGLRenderTarget(RT_W, RT_H, {
    minFilter: LinearFilter,
    magFilter: LinearFilter,
    depthBuffer: true,
    stencilBuffer: false,
  })
  target.texture.colorSpace = SRGBColorSpace
  target.texture.generateMipmaps = false
  target.texture.wrapS = RepeatWrapping
  target.texture.repeat.x = -1
  target.texture.offset.x = 1
  return target
}

/** Capsule / stadium — interior Thalia glass is a wide rounded slab, not a rectangle. */
function stadiumGeometry(w: number, h: number): ShapeGeometry {
  const hw = w * 0.5
  const hh = h * 0.5
  const r = Math.min(hh, hw)
  const shape = new Shape()
  shape.moveTo(-hw + r, -hh)
  shape.lineTo(hw - r, -hh)
  shape.absarc(hw - r, 0, r, -Math.PI / 2, Math.PI / 2, false)
  shape.lineTo(-hw + r, hh)
  shape.absarc(-hw + r, 0, r, Math.PI / 2, (3 * Math.PI) / 2, false)
  const geo = new ShapeGeometry(shape, 16)
  const pos = geo.attributes.position
  const uvs = new Float32Array(pos.count * 2)
  for (let i = 0; i < pos.count; i++) {
    uvs[i * 2] = pos.getX(i) / w + 0.5
    uvs[i * 2 + 1] = pos.getY(i) / h + 0.5
  }
  geo.setAttribute('uv', new BufferAttribute(uvs, 2))
  return geo
}

function ellipseGeometry(w: number, h: number): CircleGeometry {
  const geo = new CircleGeometry(0.5, 48)
  geo.scale(w, h, 1)
  return geo
}

function makeGlass(
  name: string,
  w: number,
  h: number,
  target: WebGLRenderTarget,
  kind: PadKind,
): Mesh {
  const mat = new MeshBasicMaterial({
    map: target.texture,
    toneMapped: true,
    depthWrite: false,
    depthTest: false,
    side: DoubleSide,
  })
  const geometry = kind === 'inner' ? stadiumGeometry(w, h) : ellipseGeometry(w, h)
  const mesh = new Mesh(geometry, mat)
  mesh.name = name
  mesh.renderOrder = 12
  mesh.castShadow = false
  mesh.receiveShadow = false
  mesh.frustumCulled = false
  return mesh
}

export class MirrorRig {
  private readonly pads: Pad[] = []
  private readonly hull: Object3D
  private cursor = 0

  constructor(visual: Object3D, eye: { x: number; y: number; z: number }) {
    this.hull = visual.parent ?? visual
    const chrome = findMesh(visual, 'Mesh12_CHROME_0')
    if (chrome) chrome.visible = false
    this.addPad(visual, eye, 'inner', INNER_HULL, 0.222, 0.05, 48)
    this.addPad(visual, eye, 'left', LEFT_HULL, 0.152, 0.08, 62)
    this.addPad(visual, eye, 'right', RIGHT_HULL, 0.152, 0.08, 62)
  }

  setCockpit(on: boolean): void {
    for (const pad of this.pads) pad.mesh.visible = on
  }

  draw(renderer: WebGLRenderer, scene: Scene, _source: PerspectiveCamera, atmos: Atmosphere): void {
    if (!this.pads.length) return
    const pad = this.pads[this.cursor]
    this.cursor = (this.cursor + 1) % this.pads.length
    if (pad) this.capture(renderer, scene, atmos, pad)
  }

  dispose(): void {
    for (const pad of this.pads) {
      pad.target.dispose()
      pad.mesh.geometry.dispose()
      const mat = pad.mesh.material
      if (mat instanceof MeshBasicMaterial) mat.dispose()
    }
    this.pads.length = 0
  }

  private capture(
    renderer: WebGLRenderer,
    scene: Scene,
    atmos: Atmosphere,
    pad: Pad,
  ): void {
    aimRear(pad, this.hull)
    const shadows = renderer.shadowMap.enabled
    const rain = atmos.rainVisible()
    renderer.shadowMap.enabled = false
    atmos.setRainVisible(false)
    for (const other of this.pads) other.mesh.visible = false
    const prev = renderer.getRenderTarget()
    renderer.setRenderTarget(pad.target)
    const exposure = renderer.toneMappingExposure
    renderer.toneMappingExposure = exposure * 0.88
    renderer.render(scene, pad.camera)
    renderer.toneMappingExposure = exposure
    renderer.setRenderTarget(prev)
    renderer.shadowMap.enabled = shadows
    atmos.setRainVisible(rain)
    for (const other of this.pads) other.mesh.visible = true
  }

  private addPad(
    visual: Object3D,
    eye: { x: number; y: number; z: number },
    kind: PadKind,
    hullPos: { x: number; y: number; z: number },
    w: number,
    h: number,
    fov: number,
  ): void {
    const target = makeTarget()
    const mesh = makeGlass(`Mirror:${kind}`, w, h, target, kind)
    const camera = new PerspectiveCamera(fov, RT_W / RT_H, 0.2, 180)
    visual.add(mesh)
    _center.set(hullPos.x, hullPos.y, hullPos.z)
    // Interior: look at the hull centerline, not the offset eye — that yaws the
    // stadium so the horizon in the glass sits crooked in the frame.
    _look.set(kind === 'inner' ? 0 : eye.x, eye.y, eye.z)
    const root = visual.parent
    if (root) {
      root.localToWorld(_center)
      root.localToWorld(_look)
      visual.worldToLocal(_center)
    }
    mesh.position.copy(_center)
    mesh.updateMatrixWorld(true)
    mesh.lookAt(_look)
    if (kind === 'inner') mesh.translateX(0.01)
    if (kind === 'left') mesh.rotateZ(0.12)
    if (kind === 'right') mesh.rotateZ(-0.12)
    this.pads.push({ kind, mesh, camera, target, fov })
  }
}

/** Rear-facing camera at the glass — not a planar reflection of the cockpit eye. */
function aimRear(pad: Pad, hull: Object3D): void {
  hull.updateMatrixWorld(true)
  _fwd.set(0, 0, 1).transformDirection(hull.matrixWorld).normalize()
  _right.set(1, 0, 0).transformDirection(hull.matrixWorld).normalize()
  _up.set(0, 1, 0).transformDirection(hull.matrixWorld).normalize()
  const out = pad.kind === 'left' ? -1 : pad.kind === 'right' ? 1 : 0
  if (pad.kind === 'inner') {
    _p.set(0, 1.12, -2.7)
    hull.localToWorld(_p)
    pad.camera.position.copy(_p)
    _look.copy(_p)
    _look.addScaledVector(_fwd, -20)
    _look.addScaledVector(_up, -1.8)
  } else {
    _p.set(out * 1.18, 0.98, 0.42)
    hull.localToWorld(_p)
    pad.camera.position.copy(_p)
    _look.copy(_p)
    _look.addScaledVector(_fwd, -16)
    _look.addScaledVector(_right, out * 5.5)
    _look.addScaledVector(_up, -1.2)
  }
  pad.camera.up.copy(_up)
  pad.camera.lookAt(_look)
  pad.camera.fov = pad.fov
  pad.camera.aspect = RT_W / RT_H
  pad.camera.near = 0.2
  pad.camera.far = 180
  pad.camera.updateProjectionMatrix()
}

export function mountMirrors(
  visual: Object3D,
  eye: { x: number; y: number; z: number },
): MirrorRig {
  return new MirrorRig(visual, eye)
}
