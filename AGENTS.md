# Thalia Driver — agent context

Browser driving prototype (Need for Speed / Driver feel) with a 2006 Renault Thalia. TypeScript + Three.js, no React / R3F. **Do not commit** until the user asks.

Before changing the lot, the car, camera, or controls, read [docs/pitfalls.md](docs/pitfalls.md). Architecture: [docs/architecture.md](docs/architecture.md). World layout: [docs/map.md](docs/map.md). Decisions: [docs/decisions.md](docs/decisions.md).

This project inherits coordinate, rig, and loop rules that worked in **Karaluch**.

## Hard rules

1. **+Z = north.** +X east. Yaw `0` looks at +Z.
2. After `normalizeModel`, never `position.set(x, y, z)` on the car — that wipes the grounded Y. Use `position.x` / `position.z` assignment and `position.y +=` only when you mean it. `sitOnTerrain()` owns Y.
3. **No extra engine.** Three.js + the `Game` loop. Do not add ECS, Rapier, or React Three Fiber for this scope.
4. Arena half-extent is **475 m** (950 m square) — 8× Karaluch’s surface. Do not silently resize the lot.
5. After UI changes, verify in the browser (behavior, not just a screenshot).
6. Dev server: `http://127.0.0.1:5173/thalia-driver/` (`vite.config.ts` → `base: '/thalia-driver/'`).

## File map

| Path | Role |
| --- | --- |
| `src/main.ts` | boot → `Game.start()` |
| `src/game/Game.ts` | loop, load GLB, input, render |
| `src/game/config.ts` | URL flags, spawn, speeds, GLB URL |
| `src/game/Arena.ts` | lot, atmosphere lights, curb, street grid |
| `src/game/atmosphere.ts` | day cycle, weather, rain, storm |
| `src/game/roads.ts` | instanced wet-pavement tiles |
| `src/game/terrain.ts` | gentle heightfield, flattened under roads |
| `src/game/rig.ts` | `normalizeModel`, wheel pivots, cabin trim |
| `src/game/Car.ts` | arcade hull physics, sit-on-terrain |
| `src/game/camera.ts` | chase follow + cockpit look (`F` hold) |
| `src/game/input.ts` | WASD, mouse yaw, space, V, F, R |
| `src/ui/hud.ts` | overlay + speedo + clock |

## Skill

When implementing features in this lot, use `.cursor/skills/thalia-change/SKILL.md`.
