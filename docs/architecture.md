# Architecture

Single-thread `requestAnimationFrame` loop in `Game.loop`. No ECS, React, or separate physics engine. Collisions are AABB / OBB against the lot curb and a heightfield sit.

```
main.ts
  new Game(canvas, hud).start()
    Arena (lot, atmosphere, curb)
    load Thalia + street pack + lamp GLBs + SFX
    player Car
    hud.readyToPlay
    beginPlay (pointer lock + audio unlock)
    loop → update (drive, atmosphere.tick, audio) → render
```

## Coordinates

- Unit ≈ 1 m.
- `ARENA_HALF = 475` — 8× Karaluch’s surface (950 m square).
- **+Z north, +X east.** Yaw `0` = nose on +Z.
- Terrain: `terrainHeight` + `Car.sitOnTerrain()`.

## Car rig

`CarConfig` in `config.ts`. `rig.ts`:

- `stripJunk` — cameras/lights from the GLB.
- `normalizeModel` — scale to `targetLength` (**4.26 m**), **set Y so the underside is at 0**. Afterwards only `position.y += …`, never `position.set(x, y, z)` (that wipes Y).
- If the mesh is longer on X than Z, yaw the visual −90° so hull forward is +Z.
- Wheels `roda1`–`roda4` get a steer group + spin pivot at the bounding-box center. The steering wheel mesh is found by bbox (cabin plastic near `cockpitEye`) and yaws with `steerAngle`.
- `L` toggles head / tail emissive plus two SpotLights per lamp that throw a cone along +Z.

Arcade drive (Karaluch hull, NFS inertia): accelerate / brake along heading, speed-scaled steer, slide along walls, clamp to the lot. Mouse yaw is the same as the tank hull. `Shift` honks. Diesel loop plays while moving.

Weather SFX (rain, thunder, birds) live in `audio.ts`, copied from Karaluch. `?fps=true` / `?fps=false` shows or hides the overlay counter.

## Camera

`FollowCamera` chase copies Karaluch lag: snappy while the hull is turning, tighter when straight. Arm shortens if a hill or curb is in the way. `V` toggles cockpit (driver-eye in `config.cockpitEye`); mouse look springs back unless `F` has toggled look-hold. Day cycle, rain, and storm live in `atmosphere.ts` (same URL flags as Karaluch: `hour`, `weather`, `mist`, `fixed`, `pauseday`).

## Build

`base: '/thalia-driver/'`. GLB via `new URL('../../assets/…', import.meta.url)`. `npm run build` = `tsc --noEmit && vite build`.
