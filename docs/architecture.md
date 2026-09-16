# Architecture

Single-thread `requestAnimationFrame` loop in `Game.loop`. No ECS, React, or separate physics engine. Collisions are AABB / OBB against the lot curb and a heightfield sit.

```
main.ts
  new Game(canvas, hud).start()
    Arena (lot, sun, grid, curb)
    load Thalia GLB (LoadingManager → hud.setLoadProgress)
    player Car
    hud.readyToPlay
    beginPlay (pointer lock)
    loop → update → render
```

## Coordinates

- Unit ≈ 1 m.
- `ARENA_HALF = 168` — same playable square as Karaluch.
- **+Z north, +X east.** Yaw `0` = nose on +Z.
- Terrain: `terrainHeight` + `Car.sitOnTerrain()`.

## Car rig

`CarConfig` in `config.ts`. `rig.ts`:

- `stripJunk` — cameras/lights from the GLB.
- `normalizeModel` — scale to `targetLength` (**4.26 m**), **set Y so the underside is at 0**. Afterwards only `position.y += …`, never `position.set(x, y, z)` (that wipes Y).
- If the mesh is longer on X than Z, yaw the visual −90° so hull forward is +Z.
- Wheels `roda1`–`roda4` get a steer group + spin pivot at the bounding-box center.

Arcade drive (Karaluch hull, NFS inertia): accelerate / brake along heading, speed-scaled steer, slide along walls, clamp to the lot. Mouse yaw is the same as the tank hull.

## Camera

`FollowCamera` copies Karaluch lag: snappy while the hull is turning, tighter when straight. Arm shortens if a hill or curb is in the way.

## Build

`base: '/thalia-driver/'`. GLB via `new URL('../../assets/…', import.meta.url)`. `npm run build` = `tsc --noEmit && vite build`.
