# Design decisions

Short: **what and why**, so old arguments stay closed. Karaluch lessons that still apply are called out.

## Genre

Need for Speed / Driver: chase cam, arcade acceleration, an empty lot you can actually *drive*. The Karaluch hull (WASD + mouse yaw, sit-on-terrain, wall slide) stays because that steering felt right. Inertia and a handbrake are the car layer on top of that hull, not a sim.

## No game engine

Same call as Karaluch: Three.js + our loop. The lot is small, the car is one body, heightfield sit is enough. ECS / Rapier / R3F is cost without gain at this scope.

## Lot size

Karaluch was `ARENA_HALF = 168`. This lot is **8× that surface** (`ARENA_HALF = 475`). Fog, sky sphere, and camera far plane scale with it. Do not resize it as a drive-feel tweak.

## Rig like the tank

Sketchfab GLBs ship with cameras, odd forward axes, and wheels not at origin. `normalizeModel` + visual yaw + named wheel pivots is the Karaluch recipe. Do not eyeball `position.y` on the whole mesh.

## Empty first

City, traffic, and cop chases come after the Thalia drives well on a blank lot. Do not fill the square to “look like NFS” before the car feels right.

## Orthogonal grid only

The old-street pack has curves (`Cube.002`). We do not use them. Crossings are `Cube.001` (four square corners), straights are `Cube`. Carriageway fill is the pack’s glossy `Materiais.*`, not sidewalk `Material`.

## Heightfield curb, not a physics engine

The pack sidewalk is a lip. The car climbs it because `surfaceHeight` adds a short ramp and sit uses four-wheel average (Karaluch). Do not add Rapier / extra colliders for that.

## Procedural cluster

The GLB binnacle is empty discs. Gauges are a canvas in `cluster.ts` (Clio II / Thalia Jaeger: tacho left, speedo right). Backlight is a cabin function of `L`, not of time of day.
