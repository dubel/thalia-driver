# Pitfalls — do not repeat

Taken from Karaluch regressions that still apply here, plus car-specific ones.

## Terrain and lot

**Car floats.** `normalizeModel` zeros Y. Then `position.set(x, y, z)` wipes it. Assign `position.x` / `position.z`; let `sitOnTerrain()` set Y. Extra clearance is `position.y +=`.

**Invisible wall in the middle.** Rim AABBs must stay at `±ARENA_HALF`. Do not grow collision half-extents past the painted curb.

**Camera underground.** Follow arm must raycast the heightfield (`raycastTerrain`). If you raise `cameraHeight`, keep `MIN_ARM`.

## Car

**Nose on +X.** Longest bbox axis is length. If the mesh is along X, yaw the *visual* −90°, not the hull. Hull yaw `0` must remain +Z.

**Wheels spin the wrong way / around the car.** Pivots live at each `roda*` bbox center. Spin `pivot.rotation.x`. Steer `steer.rotation.y` only on `front` wheels (`local z > 0` after align).

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
