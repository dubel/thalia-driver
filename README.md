# Thalia Driver

Arcade driving prototype in the browser: a **2006 Renault Thalia** (Symbol / Clio sedan) on an empty lot the same size as the Karaluch tank arena.

Vite + TypeScript + Three.js r180. Path is always `/thalia-driver/`.

Locally:

```bash
npx vite --host 127.0.0.1 --port 5173
```

→ [http://127.0.0.1:5173/thalia-driver/](http://127.0.0.1:5173/thalia-driver/)

Live: [https://dubel.dev/thalia-driver/](https://dubel.dev/thalia-driver/)

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | drive |
| mouse L/R | hull yaw (Karaluch-style) |
| Space | handbrake |
| R | reset to spawn |

## URL flags

Boolean values: `true` / `1` / `yes`.

| Param | Effect |
| --- | --- |
| `fps=true` | FPS counter |
| `describe=true` | label above the car |

Example: `http://127.0.0.1:5173/thalia-driver/?fps=true`

## Agent docs

Start at [AGENTS.md](AGENTS.md). That file maps sources and points to:

- [docs/architecture.md](docs/architecture.md) — layers, loop, rig
- [docs/map.md](docs/map.md) — empty lot
- [docs/decisions.md](docs/decisions.md) — why this way
- [docs/pitfalls.md](docs/pitfalls.md) — regressions not to repeat
