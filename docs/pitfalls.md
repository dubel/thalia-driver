# Pitfalls — do not repeat

Taken from Karaluch regressions that still apply here, plus car-specific ones.

## Terrain and lot

**Car floats.** `normalizeModel` zeros Y. Then `position.set(x, y, z)` wipes it. Assign `position.x` / `position.z`; let `sitOnTerrain()` set Y. Extra clearance is `position.y +=`.

**Invisible wall in the middle.** Rim AABBs must stay at `±ARENA_HALF`. Do not grow collision half-extents past the painted curb.

**Camera underground.** Follow arm must raycast the heightfield (`raycastTerrain`). If you raise `cameraHeight`, keep `MIN_ARM`.

**Hull pops on the sidewalk.** `sitOnTerrain` is the Karaluch four-corner **average**, not `max()` of the high wheel (that launches the sedan) and not `min(center, avg)` (that keeps the hull on the asphalt so it clips the lip). The visual curb is sharp; the heightfield is a ~2 m ramp (`sidewalkStep` in `terrain.ts`). Sample at the wheel track (`halfWidth * 0.82`).

**Lamps in the grass / in the asphalt.** Poles follow every grid line, ~5.85 m off the centerline, and stop at the last `ROAD_STEP` line. Skip when `distToGrid(along)` is inside `ROAD_HALF + ~2.4` or the pole sits in the perpendicular carriageway. Do not stride to `ARENA_HALF` — roads end at the last grid line (~±400 m).

## Car

**Nose on +X.** Longest bbox axis is length. If the mesh is along X, yaw the *visual* −90°, not the hull. Hull yaw `0` must remain +Z.

**Wheels spin the wrong way / around the car.** Pivots live at each `roda*` bbox center. Spin `pivot.rotation.x`. Steer `steer.rotation.y` only on `front` wheels (`local z > 0` after align).

**Steering wheel tilts toward the driver.** Do not Euler-rotate a tilted rim around world Z, and do not use the rim AABB as the column. Pivot is `Mesh15` plus chrome hub `Mesh14`; axis is driver-eye through the hub into the dash (`rotateOnAxis`).

**Front bulbs glow red.** `Carro_Refletor_Lanterna` is shared by front and rear. Clone per mesh and classify by local Z; do not remap one material onto both ends.

**Cockpit gauges unreadable / always glowing.** `cluster.ts` is two circular faces over the binnacle holes, placed from the cockpit eye (same pose that worked for the old slab) then shifted along the plane — not at the disc AABB center (that buries them in Mesh8). Leave the middle rectangle free. Ruby backlight and the green sidelight telltale are **only** with `L`. Unlit ink is charcoal and goes almost black at night — do not paint bright white numbers when lights are off.

**Tank-speed car.** Karaluch cruise was ~9–11 m/s. The Thalia tops out at `maxSpeed` 32 m/s (~115 km/h) so the 950 m lot is usable. Do not copy `CRUISE` from the tank.

**Turn in place like a TKS.** Fine at walking speed (`lowSpeed` factor). Do not give full `turnSpeed` at 30 m/s — that reads as ice, not a sedan.

## Overlay / gestures

**Click Drive does not lock the mouse.** Overlay is `pointer-events: none`, card is `auto`. `beginPlay` must `lockPointer()` after `arm()`.

**First WASD after ESC does nothing visible.** Pointer lock is gone; steering keys still work. Click the canvas to lock again if you add that handler — do not require lock for WASD.

**Alt+R vs R.** `R` alone resets. `event.altKey` on `KeyR` opens the radio modal and must not set `restart`. Unlock the pointer for the modal; do not re-lock on canvas clicks while it is open.

**Radio LCD crooked / upside-down on the DIN.** After `translateX` onto the center stack, do not `lookAt` the driver — that yaws the quad toward the seat. Keep the slide, set the plane to the fascia, then `rotateZ(π)` so the ruby clock is upright. Nudge right/down into the window. `polySurface80` is the column shroud.

## Performance

**FPS halves and the lot “krzaczy” after a long edit session.** `Game.loop` is a rAF chain. Vite HMR used to mount a second `Game` without cancelling the first, so two loops, two input handlers. `main.ts` must `game.dispose()` on `import.meta.hot.dispose` (cancel rAF, drop window listeners, `renderer.dispose()`). Hard-refresh if a tab has already stacked.

**Whole 950 m street grid drawn every frame.** One `InstancedMesh` per tile part with `frustumCulled = false` never drops off-screen blocks. Chunk poses on a ~160 m grid, `computeBoundingSphere()`, leave culling on. Sidewalk tiles do not `receiveShadow` — PCF on every curb triangle is the fill-rate killer; asphalt + lot ground still take the car shadow.

**Cockpit canvases stall the chase cam.** Cluster `paint()` uploads two 512² textures. Skip it in chase; in cockpit skip when needles / lights / night did not change. Radio LCD keys on the *shown* string, not raw `hour` (that re-uploaded every frame with a live station).

**Shadow map realloc hitch at dusk.** Do not assign `sun.castShadow = intensity > 0.1` every tick. Hysteresis: on above 0.14, off below 0.06.

## Process

- Do not commit without being asked.
- UI: verify by clicking, not only a screenshot.
- `?describe=true` when debugging the rig. `?fps=true` for frame time.
- After a camera or hull change, drive a full lap of the curb (all four sides).
- Chase mouse looks; it does not yaw the hull. `F` in chase orbits the car.
