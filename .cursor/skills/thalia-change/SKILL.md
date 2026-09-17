---
name: thalia-change
description: >-
  Implements lot, car, camera, and HUD changes in the Thalia Driver Three.js
  prototype. Use when editing src/game, the Renault GLB rig, chase camera,
  empty-lot terrain, or overlay.
---

# Thalia Driver — change in the lot

## Before code

1. Read `AGENTS.md` and `docs/pitfalls.md` (topic section).
2. Lot size / spawn → `docs/map.md`. Rig / loop → `docs/architecture.md`.
3. Do not introduce a “better” engine (ECS, R3F, Rapier). Attach to the `Game.ts` loop.

## Checklist by topic

**Lot / terrain**

- Keep `ARENA_HALF = 475` (8× Karaluch surface). Roads live on `ROAD_STEP`.
- Flatten or grade in `terrain.ts`. Streets are a nearly-flat city grid.
- Orthogonal tiles only: `Cube.001` at joins, `Cube` on spans. Lamps: sidewalk grass, skip crossings.
- Street instances are ~160 m chunks with frustum culling on. Do not set `frustumCulled = false` on the whole lot, and do not `receiveShadow` on sidewalk tiles.
- After a ground change, drive the rim and the spawn.

**GLB / car**

- Constants in `config.ts`. After `normalizeModel` only `position.y +=`.
- Wheels: `roda1`–`roda4`, pivot at bbox center, `?describe=true`.
- Forward is +Z. Fix with visual yaw, not hull spawn hacks.
- Steering: `Mesh15` + hub `Mesh14`, column through the driver eye. Cluster: two circles in the binnacle holes (`cluster.ts`), ruby only with `L`.
- Sit is four-wheel average over the sidewalk ramp — not `max()` / `min(center)`.
- Drive is bicycle + lateral grip in `Car.drive`. Do not go back to yaw-rate-only (tank) at speed. Handbrake drops rear grip.

**Camera**

- Chase lag is Karaluch’s (faster while turning). Keep terrain raycast on the arm.

**HUD**

- Overlay `pointer-events: none`, card `auto`, so Drive stays clickable.
- 2D speedo is chase-only; cockpit uses the binnacle cluster.
- Radio is Alt+R (R alone still resets). LCD on the center-stack DIN (not the column shroud), ruby clock / station.
- Wing mirrors are landscape ellipses filling `Mesh49` / `Mesh86` ovals (portrait reads as a circle). Interior stadium looks at the hull centerline, not the offset eye (that yaws the horizon). One 256×128 RT per frame, cockpit only. Do not Reflector-onBeforeRender (that is 2–3 full scene passes).

## Verify

- `npx tsc --noEmit`
- Dev: `http://127.0.0.1:5173/thalia-driver/`
- UI: click/tap the path, not only a screenshot
- Do not commit unless the user asked

## Refs

- `docs/architecture.md`
- `docs/map.md`
- `docs/decisions.md`
- `docs/pitfalls.md`
- `README.md`
