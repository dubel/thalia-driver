export class Input {
  readonly keys = new Set<string>()
  mouseDx = 0
  mouseDy = 0
  pointerLocked = false
  restart = false

  private readonly canvas: HTMLCanvasElement
  private armed = false

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
    window.addEventListener('mousemove', this.onMouseMove)
    document.addEventListener('pointerlockchange', this.onLockChange)
  }

  lockPointer(): void {
    void this.canvas.requestPointerLock()
  }

  arm(): void {
    this.armed = true
    this.restart = false
    this.mouseDx = 0
    this.mouseDy = 0
  }

  consumeMouse(): { dx: number; dy: number } {
    const delta = { dx: this.mouseDx, dy: this.mouseDy }
    this.mouseDx = 0
    this.mouseDy = 0
    return delta
  }

  consumeRestart(): boolean {
    const restart = this.restart
    this.restart = false
    return restart
  }

  throttle(): number {
    let v = 0
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) v += 1
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) v -= 1
    return v
  }

  steer(): number {
    let v = 0
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) v += 1
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) v -= 1
    return v
  }

  handbrake(): boolean {
    return this.keys.has('Space')
  }

  private onKeyDown = (event: KeyboardEvent): void => {
    if (
      event.code === 'Space' ||
      event.code === 'ArrowUp' ||
      event.code === 'ArrowDown' ||
      event.code === 'ArrowLeft' ||
      event.code === 'ArrowRight' ||
      event.code === 'KeyW' ||
      event.code === 'KeyA' ||
      event.code === 'KeyS' ||
      event.code === 'KeyD'
    ) {
      event.preventDefault()
    }
    this.keys.add(event.code)
    if (event.repeat || !this.armed) return
    if (event.code === 'KeyR') this.restart = true
  }

  private onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code)
  }

  private onMouseMove = (event: MouseEvent): void => {
    if (!this.pointerLocked) return
    this.mouseDx += event.movementX
    this.mouseDy += event.movementY
  }

  private onLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.canvas
  }
}
