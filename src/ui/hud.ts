import type { RadioStationId } from '../game/radio'
import { RADIO_STATIONS } from '../game/radio'

export class Hud {
  private readonly overlay = document.getElementById('overlay')
  private readonly status = document.getElementById('overlay-status')
  private readonly playBtn = document.getElementById('play-btn') as HTMLButtonElement | null
  private readonly speed = document.getElementById('speed')
  private readonly fps = document.getElementById('fps')
  private readonly atmos = document.getElementById('atmos')
  private readonly radioModal = document.getElementById('radio-modal')
  private readonly radioList = document.getElementById('radio-list')
  private playHandler: (() => void) | null = null
  private radioPick: ((id: RadioStationId) => void) | null = null
  private radioClosed: (() => void) | null = null
  private radioOpen = false

  constructor() {
    this.playBtn?.addEventListener('click', () => this.playHandler?.())
    this.radioModal?.addEventListener('click', (event) => {
      if (event.target === this.radioModal) this.hideRadio()
    })
    this.buildRadioList()
  }

  onPlay(handler: () => void): void {
    this.playHandler = handler
  }

  onRadioPick(handler: (id: RadioStationId) => void): void {
    this.radioPick = handler
  }

  onRadioClosed(handler: () => void): void {
    this.radioClosed = handler
  }

  isRadioOpen(): boolean {
    return this.radioOpen
  }

  toggleRadio(selected: RadioStationId): boolean {
    if (this.radioOpen) this.hideRadio()
    else this.showRadio(selected)
    return this.radioOpen
  }

  showRadio(selected: RadioStationId): void {
    this.radioOpen = true
    this.radioModal?.classList.remove('hidden')
    this.markRadio(selected)
  }

  hideRadio(): void {
    const wasOpen = this.radioOpen
    this.radioOpen = false
    this.radioModal?.classList.add('hidden')
    if (wasOpen) this.radioClosed?.()
  }

  markRadio(selected: RadioStationId): void {
    const buttons = this.radioList?.querySelectorAll<HTMLButtonElement>('button[data-station]')
    buttons?.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.station === selected)
    })
  }

  setLoadProgress(pct: number): void {
    if (this.status) this.status.textContent = `Loading… ${Math.round(pct)}%`
  }

  readyToPlay(): void {
    if (this.status) this.status.textContent = 'Lot is ready.'
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

  setCockpit(on: boolean): void {
    const speedo = document.querySelector('.speedo')
    if (speedo instanceof HTMLElement) speedo.hidden = on
  }

  setFps(fps: number): void {
    if (!this.fps) return
    this.fps.hidden = false
    this.fps.textContent = `${fps} FPS`
  }

  setAtmosphere(text: string): void {
    if (this.atmos) this.atmos.textContent = text
  }

  setStatus(message: string): void {
    if (this.status) this.status.textContent = message
  }

  private buildRadioList(): void {
    if (!this.radioList) return
    this.radioList.replaceChildren()
    const off = document.createElement('button')
    off.type = 'button'
    off.dataset.station = 'off'
    off.textContent = 'OFF'
    off.addEventListener('click', () => this.radioPick?.('off'))
    this.radioList.append(off)
    for (const station of RADIO_STATIONS) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.dataset.station = station.id
      btn.textContent = station.name
      btn.addEventListener('click', () => this.radioPick?.(station.id))
      this.radioList.append(btn)
    }
  }
}
