# Lot

Top-down, **top of this doc = +Z = north**.

```
                    +Z north
                         ^
                         |
                         |
    west  --------------+--------------  east +X
                         |
                    spawn (0, 0)
                    yaw 0 (nose +Z)
                         |
                    south
```

Playable square: **±475 m** (`ARENA_HALF`). Surface is 8× Karaluch’s 336 m lot. The city grid is nearly flat; off-road ground ripples a few tens of centimetres. Sidewalks sit ~0.34 m above the asphalt on a short ramp so the car pitches onto the curb instead of popping up.

## Roads

Orthogonal city grid, centerlines every **80 m** (`ROAD_STEP`). Only axis-aligned pack tiles — **no curves**:

- **`Cube.001`** at every crossing — sidewalk frame with four square corner pads (scaled to a 10.06 m square so it matches the straight).
- **`Cube`** between crossings, NS and EW (yaw 0 / 90°) — two parallel sidewalks, same 10.06 m width.
- Carriageway uses the pack’s glossy `Materiais.*` asphalt (cracked dark grey), not the sidewalk concrete.

Street lamps (`assets/street_lamp.glb`) sit on the grass just outside every sidewalk (~5.85 m off the centerline), every 32 m, skipped at crossings so poles never land in the perpendicular carriageway or past the last grid line. At dusk they go emissive; two cheap point lights hop to the nearest poles. Tile / asphalt / lamp instances are stamped in ~160 m chunks so the camera frustum can drop the far side of the lot.

A low curb still marks the rim; driving past it is blocked.
