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

**Cockpit gauges unreadable / always glowing.** `cluster.ts` is two circular faces in `polySurface97` / `98`, not one slab over the whole binnacle (that hides the middle LCD / fuel window). Ruby backlight and the green sidelight telltale are **only** with `L`. Unlit ink is charcoal and goes almost black at night — do not paint bright white numbers when lights are off.

**Tank-speed car.** Karaluch cruise was ~9–11 m/s. The Thalia tops out at `maxSpeed` 32 m/s (~115 km/h) so the 950 m lot is usable. Do not copy `CRUISE` from the tank.

**Turn in place like a TKS.** Fine at walking speed (`lowSpeed` factor). Do not give full `turnSpeed` at 30 m/s — that reads as ice, not a sedan.

## Overlay / gestures

**Click Drive does not lock the mouse.** Overlay is `pointer-events: none`, card is `auto`. `beginPlay` must `lockPointer()` after `arm()`.

**First WASD after ESC does nothing visible.** Pointer lock is gone; steering keys still work. Click the canvas to lock again if you add that handler — do not require lock for WASD.

## Process

- Do not commit without being asked.
- UI: verify by clicking, not only a screenshot.
- `?describe=true` when debugging the rig. `?fps=true` for frame time.
- After a camera or hull change, drive a full lap of the curb (all four sides).
- Chase mouse looks; it does not yaw the hull. `F` in chase orbits the car.
