# Procedural Generation -- Theory & Concepts

This document covers engine-agnostic procedural content generation theory for 2D games. For engine-specific implementations, see the relevant engine module.

---

## Seeded Random

Every procedural system must be deterministic. Same seed produces the same world. This enables seed sharing, replays, and reproducible bugs.

**Key rule:** Each subsystem (dungeon layout, loot, enemy placement) should derive its own child seed from a master seed so they remain independent. Changing one subsystem does not affect others.

```
child_seed = master_seed * 31 + channel_id
```

---

## Noise Functions

Noise provides smooth, continuous randomness for terrain, biomes, and organic shapes.

### Perlin Noise

Gradient noise producing smooth, continuous values. Uses a permutation table and gradient vectors at grid points, with smooth interpolation between them.

### Fractal / Octave Noise

Layer multiple frequencies for natural-looking results:

```
function fractal_noise(x, y, octaves=4, lacunarity=2, persistence=0.5):
    value = 0, amplitude = 1, frequency = 1, max_amp = 0
    for i in range(octaves):
        value += perlin(x * frequency, y * frequency) * amplitude
        max_amp += amplitude
        amplitude *= persistence      // each octave is quieter
        frequency *= lacunarity       // each octave is higher frequency
    return value / max_amp
```

### Noise Type Guide

| Noise | Best For |
|-------|----------|
| **Perlin** | Terrain heightmaps, smooth gradients |
| **Simplex** | Higher dimensions, fewer directional artifacts |
| **Value** | Blockier results, retro aesthetics |
| **Cellular/Voronoi** | Biome borders, crystal patterns, cracked ground |

---

## BSP Dungeon Generation

Binary Space Partitioning recursively splits space into rooms, producing well-distributed dungeon layouts.

### Algorithm

```
1. Start with full map rectangle as root node
2. Recursively split nodes (alternating horizontal/vertical):
   - Stop when node is smaller than minimum size
   - Bias split direction by aspect ratio
3. Create a room within each leaf node (random size, padded from edges)
4. Connect sibling rooms with L-shaped corridors
```

**Properties:** Guarantees no overlapping rooms. Room distribution is even across the map. Corridor structure follows the BSP tree.

---

## Cellular Automata

Produces organic cave systems by simulating simple growth rules on a random grid.

### Algorithm

```
1. Fill grid randomly (each cell ~48% chance of being wall)
2. Borders are always walls
3. Repeat 4-5 iterations:
   For each cell:
     Count wall neighbors (8-connected)
     If walls >= 5: become wall
     If walls <= 3: become floor
     Otherwise: keep current state
4. Ensure connectivity (flood fill, connect isolated regions)
```

**Tuning:** Higher initial fill chance = more walls, smaller caves. More iterations = smoother caves.

---

## Wave Function Collapse (WFC)

Generates content from a set of tiles with adjacency rules. Each cell starts with all tiles as possibilities; constraints propagate to collapse the grid.

### Algorithm

```
1. Initialize: every cell can be any tile
2. Find cell with lowest entropy (fewest possibilities)
3. Collapse: randomly pick one tile for that cell (weighted by frequency)
4. Propagate: remove incompatible tiles from neighbors based on adjacency rules
5. Repeat until all cells are collapsed or a contradiction is found
6. On contradiction: backtrack or restart
```

### Adjacency Rules

Define which tiles can be adjacent in each direction. Rules can be:
- **Hand-authored** -- designer specifies valid neighbors
- **Extracted from example** -- analyze an example map to learn valid adjacencies

---

## Room Templates and Handcrafted Chunks

Mix procedural layout with hand-designed content:

1. Create a library of pre-designed room templates (spawn room, treasure room, boss room)
2. Use BSP or graph-based generation to determine layout structure
3. Place templates into the generated slots
4. Connect with procedural corridors

**Benefits:** Guarantees quality for critical rooms while maintaining variety.

---

## Random Walk / Drunkard's Walk

Simple algorithm for organic cave/path generation:

```
1. Start at a point
2. Move in a random cardinal direction
3. Carve the current cell to floor
4. Repeat for N steps
```

**Variations:** Weighted directions (prefer forward), multiple walkers, bounded area.

---

## Terrain Generation

### Height-Based

Use fractal noise as a heightmap. Threshold values determine terrain type:

```
height = fractal_noise(x * scale, y * scale)
if height < -0.3: water
elif height < 0.0: sand
elif height < 0.5: grass
elif height < 0.8: rock
else: snow
```

### Multi-Noise Biomes

Use separate noise channels for different properties:
- **Elevation noise** -- terrain height
- **Moisture noise** -- wet vs dry
- **Temperature noise** -- hot vs cold

Map the combination to biome types (desert = hot+dry, jungle = hot+wet, tundra = cold+dry).

---

## Validation and Guarantees

Procedural content must be playable. Always validate:

- **Connectivity** -- all rooms/areas are reachable (flood fill from start)
- **Path exists** -- A* from start to goal succeeds
- **Minimum room count** -- enough space for required content
- **Required content placed** -- entrance, exit, key items all present

If validation fails, regenerate with a different seed or modify the result.

---

## Loot and Item Generation

### Weighted Random Selection

```
function weighted_pick(items, weights):
    total = sum(weights)
    roll = random() * total
    accumulated = 0
    for i, weight in enumerate(weights):
        accumulated += weight
        if roll < accumulated:
            return items[i]
```

### Rarity Tiers

Define probability distributions per context (early game, late game, boss drop). Higher tiers appear less frequently but scale with progression.

---

## Enemy Placement

- **Density by distance** -- more enemies farther from the start
- **Type by region** -- different biomes spawn different enemy types
- **Minimum spacing** -- prevent enemy clusters from being too dense
- **Safe zones** -- no enemies near spawn points or save locations

---

## Related Engine Guides

### MonoGame
- [G37 Tilemap Systems](../../monogame-arch/guides/G37_tilemap_systems.md) — Tilemap rendering, chunked worlds, auto-tiling, and tile data management
- [G66 Building & Placement Systems](../../monogame-arch/guides/G66_building_placement_systems.md) — Grid-based placement validation, construction queues, wall auto-connect bitmask
- [G54 Fog of War](../../monogame-arch/guides/G54_fog_of_war.md) — Exploration tracking for procedurally generated maps
- [G67 Object Pooling](../../monogame-arch/guides/G67_object_pooling.md) — Efficient entity recycling for spawned procedural content
- [G64 Combat & Damage Systems](../../monogame-arch/guides/G64_combat_damage_systems.md) — Loot tables, weighted random drops referenced in the Loot section

### Godot
- [G7 TileMap & Terrain](../../godot-arch/guides/G7_tilemap_and_terrain.md) — BSP dungeon generator, cellular automata caves, simplified WFC, chunk-based infinite worlds, A* pathfinding — all implemented in GDScript for Godot 4.4+

### Core
- [Fog of War Theory](./fog-of-war-theory.md) — Exploration and visibility systems that layer on top of procedurally generated maps
