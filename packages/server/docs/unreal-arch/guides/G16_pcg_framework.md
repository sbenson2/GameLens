# G16 — Procedural Content Generation (PCG) Framework

> **Category:** guide · **Engine:** Unreal Engine 5.x (5.2+) · **Related:** [G12 World Partition & Streaming](G12_world_partition_streaming.md) · [G15 Blueprint/C++ Workflow](G15_blueprint_cpp_workflow.md) · [E1 Architecture Overview](../architecture/E1_architecture_overview.md)

The PCG Framework is Unreal Engine's built-in toolset for procedural content generation. It provides a node-based graph editor for generating, filtering, and placing assets in your levels — from scattering trees across a landscape to building entire biomes with layered vegetation, rocks, and details. This guide covers the PCG graph architecture, core nodes, practical patterns, and performance best practices.

---

## Why PCG Matters for Game Dev

Manual level dressing is one of the biggest time sinks in game development. Placing thousands of trees, rocks, grass clumps, and props by hand is tedious and fragile — any terrain change invalidates hours of placement work. PCG solves this by making placement *procedural and reactive*:

- **Terrain changes?** Regenerate the PCG graph and everything re-scatters correctly.
- **New biome?** Swap the asset tables and rules, keep the same graph structure.
- **Performance tuning?** Adjust density with a single parameter instead of manually deleting instances.

PCG was introduced experimentally in UE 5.2 and has matured significantly through 5.3–5.5+. As of UE 5.5+, it includes GPU-accelerated processing and the Biome Core plugin for large-world biome systems.

---

## Core Concepts

### PCG Graph

A PCG Graph is a node-based blueprint-like asset where you define your procedural generation logic. Data flows left-to-right through nodes. The fundamental data type is a **Point Cloud** — a set of 3D points with attributes (position, rotation, scale, density, color, custom metadata).

```
┌──────────────┐    ┌──────────┐    ┌────────────┐    ┌───────────────┐
│   Generate   │ ──►│  Filter  │ ──►│  Modify    │ ──►│    Spawn      │
│   Points     │    │  Points  │    │  Points    │    │    Assets     │
└──────────────┘    └──────────┘    └────────────┘    └───────────────┘
 Surface Sampler     Density Filter   Transform Point   Static Mesh
 Spline Sampler      Bounds Filter    Copy Points       Spawner
 Landscape Data      Self-Pruning     Point Operations

// WHY this flow matters: By separating generation from spawning,
// you can reuse the same point cloud through multiple branches —
// e.g., one branch spawns trees, another spawns undergrowth at
// the same points but with different density settings.
```

### PCG Component

To use PCG in a level, add a **PCG Component** to an Actor. The component holds a reference to a PCG Graph asset and defines the generation volume (typically a box). When you click "Generate" in the editor (or trigger at runtime), the component executes the graph and spawns the results.

```
Level Actor
├── PCG Component
│   ├── Graph: PG_ForestBiome
│   ├── Generation Trigger: In Editor / On Load / Manual
│   └── Volume: Box (defines the area PCG operates on)
└── Generated Actors (managed by PCG)
```

### PCG Data Types

| Data Type | Description | Common Source |
|-----------|-------------|---------------|
| **Point Data** | Collection of points with attributes | Surface Sampler, Spline Sampler |
| **Landscape Data** | Height and layer weight information from Landscape | Get Landscape Data node |
| **Spline Data** | Points along a spline curve | Spline Sampler, Get Spline Data |
| **Volume Data** | 3D region information | Volume Sampler |
| **Attribute Set** | Named collection of attributes on points | Any node can add attributes |

---

## Essential Nodes

### Generation Nodes — Creating Point Clouds

#### Surface Sampler
The workhorse node. Generates a grid of points distributed across a surface (typically the Landscape). Key parameters:

| Parameter | What It Controls |
|-----------|-----------------|
| **Points Per Sq. Meter** | Density of the generated grid — start low (0.1) for trees, higher (1–5) for grass |
| **Point Extents** | Size of the area each point "claims" — used for self-pruning/overlap checks |
| **Looseness** | How much random jitter to apply to the grid (0 = rigid grid, 1 = fully random) |

```
// WHY Looseness matters: A grid of 0.0 produces visible rows of trees.
// 0.5-0.8 gives natural-looking scatter while maintaining even spacing.
// 1.0 is fully random but may cluster points together.
```

#### Spline Sampler
Generates points along a spline component. Perfect for roads, rivers, fences, and paths. Points can be sampled along the spline or across its surface (for road-width scatter).

#### Get Landscape Data
Reads Landscape paint layers (e.g., "Grass", "Dirt", "Rock") and height data. Use this to drive biome-specific placement — only spawn pine trees on the "Forest" paint layer.

### Filter Nodes — Refining the Point Cloud

#### Density Filter
Removes points based on their Density attribute. After a Surface Sampler, apply noise-based density to break up the uniform grid:

```
Surface Sampler ──► Density Noise ──► Density Filter (Min: 0.3, Max: 1.0)

// WHY: Without density filtering, vegetation looks unnaturally uniform.
// Density Noise adds Perlin-like variation, and the filter removes
// points below 0.3 — creating natural clumps and clearings.
```

#### Bounds Filter
Removes points outside or inside a specified volume. Use to exclude PCG from buildings, roads, or water bodies.

#### Self-Pruning
Removes points that are too close to each other. This is critical for preventing tree trunks from overlapping. Set a minimum distance based on your asset's footprint.

```
// WHY Self-Pruning over just reducing density:
// Density controls how many points exist on average.
// Self-Pruning enforces a minimum distance between any two points.
// You need both — density for overall count, self-pruning for spacing.
```

#### Difference / Intersection
Set operations between two point clouds. Example: generate scatter points, then *difference* them against road spline points to clear vegetation from paths.

### Modification Nodes — Transforming Points

#### Transform Points
Apply random rotation, scale, and offset to points before spawning. Essential for natural variation:

```
Transform Points Settings:
  Rotation: Min(0,0,0) Max(0,360,0)    // Random Y-axis rotation
  Scale:    Min(0.8) Max(1.4)           // ±30% size variation
  Offset:   (0, 0, 0)                  // Usually keep at zero

// WHY random rotation on only Y-axis: Trees and rocks should spin
// around their vertical axis, not tilt sideways. Full 3-axis rotation
// on organic assets looks broken.
```

#### Copy Points
Duplicates a point cloud for branching. Feed the same base scatter to multiple downstream branches (trees, bushes, ground cover) with different density multipliers.

#### Attribute Operation
Modify point attributes with math operations — multiply density by landscape layer weight, remap scale based on height, etc.

### Output Nodes — Spawning Assets

#### Static Mesh Spawner
The primary output node. Converts points into Static Mesh Instances (using Hierarchical Instanced Static Meshes for performance). Key settings:

| Setting | Purpose |
|---------|---------|
| **Mesh Entries** | List of static meshes to spawn, with optional weight for random selection |
| **Collision** | Per-entry collision profile overrides |
| **Culling Distance** | Max draw distance per entry (critical for performance) |

```
// WHY HISM (Hierarchical Instanced Static Mesh):
// PCG uses HISM by default because it batches identical meshes
// into single draw calls AND supports distance-based culling.
// A forest of 10,000 trees might be only 5-10 draw calls.
```

#### Spawn Actor
For more complex objects that need their own Actor (NPCs, interactables, buildings with interiors). More expensive than Static Mesh Spawner — use sparingly.

---

## Subgraphs — Reusable PCG Logic

Like Blueprint functions, you can collapse a group of PCG nodes into a **Subgraph** for reuse:

```
Right-click selected nodes → Collapse to Subgraph
```

Or create a standalone PCG Graph asset and reference it as a subgraph node. This is essential for building a modular biome system:

```
PG_ForestBiome (Main Graph)
├── [Subgraph] SG_TreeScatter      ← Reused in multiple biomes
├── [Subgraph] SG_UndergrowthLayer ← Shared ground cover logic
├── [Subgraph] SG_RockPlacement    ← Shared rock scatter
└── [Custom]   Road exclusion       ← Biome-specific
```

---

## Blueprint Integration

### Execute Blueprint Node

The **Execute Blueprint** node lets you run custom Blueprint logic as part of your PCG graph. Create a Blueprint that inherits from `PCGBlueprintElement`:

```cpp
// WHY you'd use this: PCG's built-in nodes cover common cases,
// but game-specific logic (e.g., "only spawn treasure chests
// if difficulty > 3 and player hasn't found this area yet")
// needs custom code. Execute Blueprint bridges PCG and gameplay.
```

The Blueprint receives input point data, can modify it, and passes it downstream. Common uses:

- **Gameplay-driven placement** — spawn based on game state, quest progress, difficulty
- **Custom attribute generation** — compute biome blend weights from your own data sources
- **Validation** — check placed assets against collision or navmesh constraints

### C++ Custom Nodes

For performance-critical custom logic, create a C++ class inheriting from `UPCGSettings`:

```cpp
// MyCustomPCGNode.h
UCLASS()
class UMyCustomPCGSettings : public UPCGSettings
{
    GENERATED_BODY()
    
protected:
    // Define input/output pins
    virtual TArray<FPCGPinProperties> InputPinProperties() const override;
    virtual TArray<FPCGPinProperties> OutputPinProperties() const override;
    
    // The execution logic
    virtual FPCGElementPtr CreateElement() const override;
};

// WHY C++ over Blueprint for custom nodes:
// Blueprint PCG elements run per-point in the graph.
// For operations on thousands of points (custom noise,
// distance queries, gameplay database lookups), C++ is
// 10-100x faster and avoids Blueprint VM overhead.
```

---

## GPU Processing (UE 5.5+)

Starting in UE 5.5, PCG supports GPU-accelerated execution for compute-heavy operations. This is particularly important for:

- **Runtime generation** — procedurally generating content as the player moves through the world
- **Large-scale scatter** — millions of points across open-world landscapes
- **Ground scatter** — dense grass and small details that need to regenerate per-frame based on camera position

GPU PCG uses compute shaders to process point clouds in parallel. To enable it, set the execution mode on compatible nodes to "GPU" in the node properties.

```
// WHY GPU matters for PCG:
// A Surface Sampler generating 1 million points on CPU might take 200ms.
// The same operation on GPU can complete in under 5ms.
// This makes runtime/streaming PCG viable for open worlds.
```

---

## Biome Core Plugin

The **PCG Biome Core** plugin (experimental, shipping with UE 5.4+) provides a higher-level system built on top of PCG for biome-scale content generation:

- **Biome definitions** — declare what assets, density curves, and rules define each biome (forest, desert, snow, etc.)
- **Biome blending** — smooth transitions between biomes using landscape paint layers or data-driven rules
- **Attribute Set Tables** — data tables that map biome types to asset lists, allowing designers to swap content without editing graphs
- **Feedback loops** — iterative generation where one pass's output informs the next (e.g., place large trees first, then scatter undergrowth avoiding tree trunks)
- **Runtime scatter** — GPU-accelerated near-camera ground detail that streams as the player moves

```
Biome System Architecture:
─────────────────────────
Landscape Paint Layers
    │
    ▼
Biome Definition Data Assets
    │
    ▼
PCG Biome Graph (per-biome scatter rules)
    │
    ├──► Large Features (trees, rocks) — HISM, far cull distance
    ├──► Medium Features (bushes, logs) — HISM, medium cull distance
    └──► Ground Scatter (grass, flowers) — GPU runtime, near camera only
```

---

## Performance Best Practices

### 1. Use HISM and Set Cull Distances

Every Static Mesh Spawner should have cull distances appropriate to the asset size. Large trees render to 5000+ units; small rocks and grass should cull at 1000–2000 units. HISM handles this per-instance automatically.

### 2. Partition Your Generation Volumes

Don't use one massive PCG volume for the entire world. Break it into grid-aligned volumes that match your World Partition grid. This allows:

- Incremental regeneration (only dirty volumes re-execute)
- Streaming compatibility (PCG results load/unload with World Partition cells)

### 3. Minimize Spawn Actor Usage

`Spawn Actor` creates full UE Actors with components, collision, tick — expensive. Use `Static Mesh Spawner` (HISM) for anything that doesn't need gameplay logic. Reserve Spawn Actor for interactive objects, NPCs, or items the player can pick up.

### 4. Self-Prune Early in the Graph

Apply Self-Pruning and Density Filters as early as possible. Every downstream node processes fewer points, reducing total graph execution time.

```
BAD:  Surface Sampler → Transform → Mesh Spawner → (too many meshes!)
GOOD: Surface Sampler → Density Filter → Self-Prune → Transform → Mesh Spawner

// WHY: Filtering 100,000 points down to 5,000 before transform
// is much cheaper than transforming all 100,000 then culling meshes.
```

### 5. Use Deterministic Seeds

PCG graphs use seeds for randomization. Set explicit seeds on your PCG Components to ensure reproducible results across builds. This prevents "pop" artifacts when World Partition cells load — the same seed always produces the same scatter.

### 6. Profile with PCG Debug Visualization

In the editor, select your PCG Component and enable debug visualization to see:

- Point clouds before spawning (colored by density, biome type, etc.)
- Execution time per node
- Point counts at each stage

```
Editor → Select PCG Component → Details → Debug → Toggle Debug Display
```

---

## Common Patterns

### Pattern: Forest Floor (Multi-Layer Scatter)

```
[Surface Sampler (0.05 pts/m²)]
    │
    ├──► [Density Noise] → [Self-Prune: 5m] → [Static Mesh Spawner: Large Trees]
    │
    ├──► [Density Noise] → [Self-Prune: 2m] → [Static Mesh Spawner: Bushes]
    │
    └──► [Density Noise] → [Self-Prune: 0.5m] → [Static Mesh Spawner: Ground Cover]

// WHY three layers from one sampler:
// Each branch applies different density noise and self-pruning distance.
// Large trees are sparse (5m apart), bushes medium (2m), ground cover dense (0.5m).
// All share the same base scatter, so they naturally coordinate.
```

### Pattern: Road Exclusion Zone

```
[Spline Sampler: Road Spline (width=6m)]
    │
    └──► Exclusion Zone Points

[Surface Sampler: Full Landscape]
    │
    └──► [Difference: exclude Road points] → [Static Mesh Spawner]

// WHY: The Difference node removes any landscape scatter points
// that fall within 6m of the road spline, creating a natural
// cleared area along roads without manual editing.
```

### Pattern: Landscape Layer-Driven Biomes

```
[Get Landscape Data]
    │
    ├──► [Filter: Grass Layer Weight > 0.5] → [Subgraph: Meadow Scatter]
    ├──► [Filter: Forest Layer Weight > 0.5] → [Subgraph: Forest Scatter]
    └──► [Filter: Rock Layer Weight > 0.5] → [Subgraph: Rocky Scatter]

// WHY: Artists paint biome regions on the Landscape using standard
// paint tools. PCG reads those paint layers and drives scatter rules.
// Change the painted regions → regenerate → instant biome update.
```

---

## Quick Reference

| Task | Node(s) | Notes |
|------|---------|-------|
| Scatter on terrain | Surface Sampler → Static Mesh Spawner | Set Points Per Sq. Meter for density |
| Path/road placement | Spline Sampler → Static Mesh Spawner | Use spline width for road-edge scatter |
| Clear vegetation from areas | Difference node with exclusion volume | Works with splines, boxes, or custom shapes |
| Natural variation | Transform Points + Density Noise | Random rotation/scale + clustered density |
| Prevent overlaps | Self-Pruning node | Set min distance ≥ largest asset radius |
| Biome-specific assets | Get Landscape Data + Filter by layer | Paint layers drive what spawns where |
| Custom game logic | Execute Blueprint (PCGBlueprintElement) | Bridge PCG with gameplay state |
| Runtime ground detail | GPU Processing + Biome Core plugin | Camera-relative regeneration |

---

## Further Reading

- [PCG Framework Overview (Epic Docs)](https://dev.epicgames.com/documentation/en-us/unreal-engine/procedural-content-generation-overview)
- [PCG Node Reference](https://dev.epicgames.com/documentation/en-us/unreal-engine/procedural-content-generation-framework-node-reference-in-unreal-engine)
- [PCG Biome Core Plugin Guide](https://dev.epicgames.com/documentation/en-us/unreal-engine/procedural-content-generation-pcg-biome-core-and-sample-plugins-overview-guide-in-unreal-engine)
- [GPU Processing with PCG](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-pcg-with-gpu-processing-in-unreal-engine)
- [A Tech Artist's Guide to PCG](https://dev.epicgames.com/community/learning/knowledge-base/KP2D/unreal-engine-a-tech-artists-guide-to-pcg)
