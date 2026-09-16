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

Playable square: **±475 m** (`ARENA_HALF`). Surface is 8× Karaluch’s 336 m lot. Between streets the ground is a gentle grass/dirt roll; under pavement `terrainHeight` is graded to 0 so the car sits on the tiles.

## Roads

City grid, centerlines every **80 m** (`ROAD_STEP`). Pavement is the Sketchfab tile `assets/modular_street__pavement_wet_lp.glb`, instanced along each corridor (~9 m wide). Intersections are covered by the east–west run.

A low curb still marks the rim; driving past it is blocked.

No village, chapel, or pond yet. Keep extra landmarks off this square until they have entries here and in `config.ts`.
