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

Playable square: **±475 m** (`ARENA_HALF`). Surface is 8× Karaluch’s 336 m lot. The city grid is nearly flat; off-road ground ripples a few tens of centimetres.

## Roads

City grid, centerlines every **80 m** (`ROAD_STEP`). Pieces come from `assets/old_street_pack.glb`:

- **`Cube.002`** at every crossing — 4-way with curved corner sidewalks.
- **`Cube`** between crossings — sidewalk frames, overlapped into the plus so the curve meets the straight.
- Textured asphalt ribbon fills the `Cube` carriageway and **stops short** of `Cube.002`’s inner curve so it does not hit the far curb.

Street lamps (`assets/street_lamp.glb`) line the marked arterials (`x` or `z` in {0, ±160, ±320}). At dusk they go emissive; six cheap point lights hop to the nearest poles (brighter / longer reach than the first pass).

A low curb still marks the rim; driving past it is blocked.
