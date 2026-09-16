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

- Keep `ARENA_HALF = 168`.
- Flatten or grade in `terrain.ts`. Skip mounds until they have a map entry.
- After a ground change, drive the rim and the spawn.

**GLB / car**

- Constants in `config.ts`. After `normalizeModel` only `position.y +=`.
- Wheels: `roda1`–`roda4`, pivot at bbox center, `?describe=true`.
- Forward is +Z. Fix with visual yaw, not hull spawn hacks.

**Camera**

- Chase lag is Karaluch’s (faster while turning). Keep terrain raycast on the arm.

**HUD**

- Overlay `pointer-events: none`, card `auto`, so Drive stays clickable.

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
