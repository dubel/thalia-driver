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

Street lamps (`assets/street_lamp.glb`) line the marked arterials (`x` or `z` in {0, ±160, ±320}). At dusk they go emissive; two cheap point lights hop to the nearest poles.

A low curb still marks the rim; driving past it is blocked.
