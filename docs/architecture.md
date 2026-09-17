# Architecture

Single-thread `requestAnimationFrame` loop in `Game.loop`. No ECS, React, or separate physics engine. Collisions are AABB / OBB against the lot curb and a heightfield sit. Vite HMR calls `Game.dispose()` so the previous rAF / input listeners do not keep running.

```
main.ts
  new Game(canvas, hud).start()
    Arena (lot, atmosphere, curb)
    load Thalia + street pack + lamp + SFX
    player Car
    hud.readyToPlay
    beginPlay (pointer lock + audio unlock)
    loop → update (drive, atmosphere.tick, audio) → render
```

## Coordinates

- Unit ≈ 1 m.
- `ARENA_HALF = 475` — 8× Karaluch’s surface (950 m square).
- **+Z north, +X east.** Yaw `0` = nose on +Z.
- Terrain: `terrainHeight` + `roadDeck` + sidewalk ramp, then `Car.sitOnTerrain()` (four-wheel average, short lerp).

## Car rig

`CarConfig` in `config.ts`. `rig.ts`:

- `stripJunk` — cameras/lights from the GLB.
- `normalizeModel` — scale to `targetLength` (**4.26 m**), **set Y so the underside is at 0**. Afterwards only `position.y += …`, never `position.set(x, y, z)` (that wipes Y).
- If the mesh is longer on X than Z, yaw the visual −90° so hull forward is +Z.
- Wheels `roda1`–`roda4` get a steer group + spin pivot at the bounding-box center. The steering wheel is `Mesh15_Carro_Plastico_0` plus the chrome Renault hub (`Mesh14`); it spins around the column (driver-eye through the hub), opposite `steerAngle`.
- `L` toggles head / tail emissive plus two SpotLights that throw a cone along +Z. Front `Lanterna` meshes are cloned separately from the rear so they stay white.

Arcade drive: bicycle yaw (`v · tan(δ) / wheelbase`) plus a crawl mix so parking still turns, lateral grip that damps sideways velocity, handbrake that *drops* rear grip (oversteer) instead of raising yaw gain. Mouse never yaws the hull — chase and cockpit both look with the mouse. `Shift` honks. Diesel loop plays while moving. Body paint + wheels cast shadows; asphalt and ground receive them (sidewalk tiles do not). Cockpit cluster is two circular canvases (`cluster.ts`) seated in the stock binnacle holes: tacho left, speedo right, green sidelight telltale; ruby backlight only with `L` (unlit faces stay dim, especially at night). Cluster canvases skip upload in chase and when needles have not moved. The middle rectangle stays free for a later fuel / trip graphic. The 2D km/h overlay hides in cockpit. Headlight cones still throw ~80 m; they aim a bit steeper so the pool on the asphalt sits closer to the hull. Cockpit mirrors (`mirrors.ts`) overlay the wing housings and interior pad: cameras look hull −Z from the glass, one 256×128 pass per frame, no shadows or rain.

Weather SFX (rain, thunder, birds) live in `audio.ts`, copied from Karaluch. `?fps=true` / `?fps=false` shows or hides the overlay counter. **Alt+R** opens a radio modal (pointer unlocks so you can click). Public HTTPS Icecast/HLS streams play through `HTMLAudio` (`radio.ts`); Trójka uses `hls.js`. The head-unit LCD shows the game clock when OFF and the station name when live, in ruby like the cluster.

## Camera

`FollowCamera` chase copies Karaluch lag: snappy while the hull is turning, tighter when straight. Arm shortens if a hill or curb is in the way. Mouse looks around the car (springs back); `F` holds the look — in chase that is a free orbit around the hull. `V` toggles cockpit (driver-eye in `config.cockpitEye`). Day cycle, rain, and storm live in `atmosphere.ts` (same URL flags as Karaluch: `hour`, `weather`, `mist`, `fixed`, `pauseday`).

## Build

`base: '/thalia-driver/'`. GLB via `new URL('../../assets/…', import.meta.url)`. `npm run build` = `tsc --noEmit && vite build`.
