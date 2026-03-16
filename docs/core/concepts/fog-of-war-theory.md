# Fog of War -- Theory & Concepts

This document covers engine-agnostic fog of war and visibility system theory. For engine-specific implementations, see the relevant engine module.

---

## Visibility States

Every cell on the map exists in one of three states:

| State | Visual | Gameplay |
|-------|--------|----------|
| **Unexplored** | Solid black | Player has never seen this tile. No information |
| **Explored** | Dark / desaturated | Previously seen. Terrain visible, but entities hidden |
| **Visible** | Fully lit | Currently in line of sight. Everything revealed |

**Key invariant:** Visible implies Explored. Once a cell is explored, it never reverts to unexplored. The visibility layer is transient -- cleared and rebuilt every time vision sources move.

### Data Structure

Two boolean arrays per grid:

- `visible[]` -- current-frame visibility (cleared each update, rebuilt from scratch)
- `explored[]` -- persistent (once true, stays true forever)

---

## Line-of-Sight (Raycasting)

The simplest visibility approach: cast a ray from the viewer to every candidate tile using Bresenham's line algorithm. If the ray hits a wall before reaching the target, the target is not visible.

### Bresenham's Line

Walk from source to target using integer steps. At each step, check if the cell is opaque (wall). If opaque before reaching the target, the line of sight is blocked.

### Brute-Force Raycast FOV

Cast rays to every tile within the vision radius:

```
for each tile (dx, dy) within radius:
    if dx*dx + dy*dy > radius*radius: skip
    if line_of_sight(center, tile):
        reveal(tile)
```

**Performance:** O(r^3) -- for radius 10, about 1200 rays. Fine for a single player. Terrible for 50 RTS units.

### Symmetric vs Asymmetric Visibility

- **Asymmetric:** If A can see B, B might not see A (ray path differs). Default and cheaper
- **Symmetric:** If A sees B, then B sees A. Required for multiplayer fairness. Use shadowcasting

---

## Shadowcasting Algorithm

The gold standard for roguelike/strategy FOV. Processes the map in 8 octants, scanning row-by-row outward from the source. Walls create shadow regions that are skipped entirely.

### How It Works

1. Divide the circle around the viewer into 8 octants (45 degrees each)
2. For each octant, scan columns/rows moving outward from the source
3. Track a "slope window" [startSlope, endSlope] representing the visible arc
4. When hitting a wall, the visible arc shrinks
5. When a wall ends, recurse with the narrowed window

**Performance:** O(r^2) worst case (open field) but skips shadow regions. For a radius-20 source on a dungeon map, typically visits only 30--50% of cells. Fast enough for dozens of simultaneous sources.

---

## Vision Shapes

### Circular Vision

The default. Reveal everything within a radius. Handled by the radius parameter in shadowcasting.

### Cone-Shaped Vision (Stealth Games)

For enemies with a facing direction and limited field of view:

1. Compute full circular FOV into a temporary buffer
2. Filter: only reveal cells where the angle from the source to the cell falls within the cone's half-angle of the facing direction

```
angle = atan2(dy, dx)
diff = angle_difference(angle, facing_direction)
if abs(diff) <= half_angle:
    reveal(cell)
```

### Multiple Vision Sources

In party-based or strategy games, run shadowcasting once per source. The Reveal calls accumulate naturally since explored/visible arrays are combined.

---

## Dynamic Updates

### When to Recalculate

Fog updates are expensive. Only recalculate when a vision source moves to a new tile:

```
for each vision source:
    current_tile = world_to_tile(source.position)
    if current_tile != last_known_tile[source]:
        needs_update = true
```

### Update Throttling

For large maps with many units, throttle updates to every N frames or only when sources move.

**Practical advice:** Full clear + rebuild when something moves is correct and simple. On a 256x256 map with 20 vision sources of radius 12, shadowcasting takes about 0.5ms. Only optimize if profiling shows a bottleneck.

---

## Fog Rendering

### The Naive Approach (Avoid)

Drawing a semi-transparent black rectangle per tile creates hard grid edges that break immersion.

### The Good Approach: Fog Texture + Blur

1. Render fog state to a **low-resolution texture** (one pixel per tile or 2x for smoother results)
2. Apply a **Gaussian blur** to soften edges
3. Overlay the blurred fog texture on the world

### Fog Compositing

Encode visibility states into the fog texture:
- Visible: white (255)
- Explored: mid-gray (128) -- rendered darkened and desaturated
- Unexplored: black (0) -- rendered as solid black

Linear texture sampling naturally interpolates between states, producing smooth gradients at tile boundaries.

### Explored Rendering

Explored but not visible areas should be:
- **Darkened** -- multiply brightness by 0.3--0.4
- **Desaturated** -- blend toward grayscale (30% saturation)

This visually communicates "you saw this before but cannot see it now."

---

## Entity Visibility

Entities (enemies, items, NPCs) must respect the fog:

- **Visible state:** Render normally at actual position. Update last-known info
- **Explored state:** Show a "ghost" at last-known position (translucent, dimmed)
- **Unexplored state:** Do not render at all

### Last-Known Information

Track per-entity:
- Last known position (tile coordinates)
- Last known sprite/appearance
- Time last seen

This allows rendering ghost sprites in explored areas showing where enemies were last spotted.

---

## Strategy Game Patterns

### Team-Based Shared Vision

All allied units and buildings contribute to a shared fog grid per team. Each team has its own fog grid instance.

### Competitive Fog (Re-closing)

In StarCraft-style games, fog closes again when units leave. The three-state model handles this naturally:
- `ClearVisible()` resets all cells to explored-or-unexplored each frame
- Only current line of sight re-promotes cells to visible
- Enemies in explored-but-not-visible areas are hidden

### Building Sight Ranges

Different structures provide different vision radii (watchtower = 14, town hall = 10, wall = 3).

### AI That Respects Fog

Enemy AI should not cheat by knowing the player's position through fog. AI systems should query their own team's fog grid before making decisions based on target locations.

---

## Performance Budget

- Shadowcasting radius 12: approximately 50 microseconds per source
- 20 sources on a 256x256 map: approximately 1ms total
- Fog texture build + blur: approximately 0.3ms GPU
- Total is well within a 16.6ms (60fps) frame budget

---

*Implementation examples are available in engine-specific modules.*
