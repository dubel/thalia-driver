import './style.css'
import { Game } from './game/Game'
import { Hud } from './ui/hud'

const canvas = document.querySelector<HTMLCanvasElement>('#game')
if (!canvas) {
  throw new Error('Missing #game canvas')
}

const hud = new Hud()
const game = new Game(canvas, hud)
game.start().catch((error: unknown) => {
  console.error(error)
  const message = error instanceof Error ? error.message : String(error)
  hud.setStatus(`Failed to load: ${message}`)
})

if (import.meta.hot) {
  import.meta.hot.dispose(() => game.dispose())
}
