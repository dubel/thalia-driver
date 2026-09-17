export class Input {
  readonly keys = new Set<string>()
  mouseDx = 0
  mouseDy = 0
  pointerLocked = false
  restart = false
  viewToggle = false
  lookHoldToggle = false
  lightsToggle = false
  hornPulse = false
  radioToggle = false
  radioEscape = false

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
    this.viewToggle = false
    this.lookHoldToggle = false
    this.lightsToggle = false
    this.hornPulse = false
    this.radioToggle = false
    this.radioEscape = false
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

  consumeViewToggle(): boolean {
    const toggled = this.viewToggle
    this.viewToggle = false
    return toggled
  }

  consumeLookHoldToggle(): boolean {
    const toggled = this.lookHoldToggle
    this.lookHoldToggle = false
    return toggled
  }

  consumeLightsToggle(): boolean {
    const toggled = this.lightsToggle
    this.lightsToggle = false
    return toggled
  }

  consumeHorn(): boolean {
    const honk = this.hornPulse
    this.hornPulse = false
    return honk
  }

  consumeRadioToggle(): boolean {
    const toggled = this.radioToggle
    this.radioToggle = false
    return toggled
  }

  consumeRadioEscape(): boolean {
    const escaped = this.radioEscape
    this.radioEscape = false
    return escaped
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
      event.code === 'KeyD' ||
      event.code === 'KeyV' ||
      event.code === 'KeyF' ||
      event.code === 'KeyL' ||
      event.code === 'KeyR' ||
      event.code === 'ShiftLeft' ||
      event.code === 'ShiftRight'
    ) {
      event.preventDefault()
    }
    this.keys.add(event.code)
    if (event.repeat) return
    if (!this.armed) return
    if (event.code === 'Escape') this.radioEscape = true
    if (event.code === 'KeyR' && event.altKey) {
      this.radioToggle = true
      return
    }
    if (event.code === 'KeyR') this.restart = true
    if (event.code === 'KeyV' || event.key === 'v' || event.key === 'V') this.viewToggle = true
    if (event.code === 'KeyF' || event.key === 'f' || event.key === 'F') this.lookHoldToggle = true
    if (event.code === 'KeyL' || event.key === 'l' || event.key === 'L') this.lightsToggle = true
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') this.hornPulse = true
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

  dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    window.removeEventListener('mousemove', this.onMouseMove)
    document.removeEventListener('pointerlockchange', this.onLockChange)
  }
}
