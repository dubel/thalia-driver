# Thalia Driver

Arcade driving prototype in the browser: a **2006 Renault Thalia** (Symbol / Clio sedan) on a city-grid lot eight times the surface of the Karaluch tank arena.

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
| mouse | look around (chase + cockpit); springs back when you stop |
| Space | handbrake |
| V | chase / cockpit |
| F | look-hold (off = spring back). Chase: free orbit around the car |
| L | headlights / taillights (also ruby cluster backlight) |
| Shift | horn |
| R | reset to spawn |
| Alt+R | radio (live stations + OFF) |

## URL flags

Boolean values: `true` / `1` / `yes`. Without `fixed`, `hour` / `weather` / `mist` are only the **start** — the day still runs (8 real minutes = 1 game day).

| Param | Effect |
| --- | --- |
| `hour` | `0`–`24` start hour (default `8`) |
| `weather` | `clear`, `clouds`, `overcast`, `rain`, `storm` |
| `mist` | force fog on / off |
| `fixed` | freeze whatever you also passed (`hour`, `weather`, `mist`) |
| `pauseday` | freeze the clock |
| `fps=true` / `fps=false` | FPS counter on / off |
| `describe=true` | label above the car |

Examples:

```
http://127.0.0.1:5173/thalia-driver/?hour=22&weather=rain&fixed=true
http://127.0.0.1:5173/thalia-driver/?hour=16&weather=storm&fixed=true
http://127.0.0.1:5173/thalia-driver/?fps=true
http://127.0.0.1:5173/thalia-driver/?fps=false
```

## Agent docs

Start at [AGENTS.md](AGENTS.md). That file maps sources and points to:

- [docs/architecture.md](docs/architecture.md) — layers, loop, rig
- [docs/map.md](docs/map.md) — lot + street grid
- [docs/decisions.md](docs/decisions.md) — why this way
- [docs/pitfalls.md](docs/pitfalls.md) — regressions not to repeat
