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

Playable square: **±475 m** (`ARENA_HALF`). Surface is 8× Karaluch’s 336 m lot. Between streets the ground rolls a few metres; pavement follows a gentler bed so the car sits on the tiles.

## Roads

City grid, centerlines every **80 m** (`ROAD_STEP`). Pieces come from `assets/old_street_pack.glb`: marked arterials (`Cube`) and 4-way tiles at crossings. Straight pack tiles are sidewalk frames; a textured asphalt ribbon (cloned from the pack albedo) fills the carriageway so the pavement does not drop to grass.

**Flyover** at **x = 160, z = 0**: the north–south arterial ramps onto a lifted pack bridge over the east–west road. Drive NS to stay on the deck; drive EW to pass under the opening. Sit height is heading-dependent so both are driveable. Four pier AABBs sit beside the underpass, not in the lanes.

Street lamps (`assets/street_lamp.glb`) line the marked arterials (`x` or `z` in {0, ±160, ±320}). At dusk they go emissive; four cheap point lights hop to the nearest poles — no per-lamp lights.

A low curb still marks the rim; driving past it is blocked.
