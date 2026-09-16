export class Hud {
  private readonly overlay = document.getElementById('overlay')
  private readonly status = document.getElementById('overlay-status')
  private readonly playBtn = document.getElementById('play-btn') as HTMLButtonElement | null
  private readonly speed = document.getElementById('speed')
  private readonly fps = document.getElementById('fps')
  private playHandler: (() => void) | null = null

  constructor() {
    this.playBtn?.addEventListener('click', () => this.playHandler?.())
  }

  onPlay(handler: () => void): void {
    this.playHandler = handler
  }

  setLoadProgress(pct: number): void {
    if (this.status) this.status.textContent = `Loading car… ${Math.round(pct)}%`
  }

  readyToPlay(): void {
    if (this.status) this.status.textContent = 'Empty lot is ready.'
    if (this.playBtn) {
      this.playBtn.disabled = false
      this.playBtn.textContent = 'Drive'
    }
  }

  hideOverlay(): void {
    this.overlay?.classList.add('hidden')
  }

  setSpeed(kmh: number): void {
    if (this.speed) this.speed.textContent = `${Math.round(kmh)}`
  }

  setFps(fps: number): void {
    if (!this.fps) return
    this.fps.hidden = false
    this.fps.textContent = `${fps} FPS`
  }

  setStatus(message: string): void {
    if (this.status) this.status.textContent = message
  }
}
