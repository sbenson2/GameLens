# G35 — Terrain & Large World Environments in Unity 6

> **Category:** guide · **Engine:** Unity 6 (6000.x, Terrain Tools 5.1+, URP/HDRP 17+) · **Related:** [G10 Rendering Pipeline](G10_rendering_pipeline_urp_hdrp.md) · [G16 Performance & Memory](G16_performance_optimization_memory.md) · [G19 Procedural Content Generation](G19_procedural_content_generation.md) · [G26 Splines & World Building](G26_splines_world_building.md) · [Unity Rules](../unity-arch-rules.md)

Unity's terrain system combines a height-map-based landscape editor with detail object scattering, tree placement, and texture painting — all integrated with the rendering pipeline. Unity 6 extends this with the **GPU Resident Drawer** for high-performance instanced rendering, **SpeedTree 9** shader support, **Terrain Quality Settings**, and the optional **Terrain Tools** package for advanced sculpting. This guide covers terrain setup, performance optimization, procedural workflows, and strategies for building large open worlds.

---

## Terrain System Overview

The terrain system consists of two core pieces:

| Component | Purpose |
|-----------|---------|
| `Terrain` (MonoBehaviour) | Renders the terrain mesh, manages LOD, exposes painting tools in the Inspector |
| `TerrainData` (ScriptableObject asset) | Stores heightmap, splat maps (texture layers), detail density maps, and tree instance data |

A single `TerrainData` asset can be referenced by one `Terrain` component. For large worlds, you tile multiple `Terrain` objects and connect them via `Terrain.SetNeighbors()` for seamless LOD transitions at edges.

```csharp
// WHY SetNeighbors: without neighbor connections, adjacent terrain tiles
// have independent LOD levels. At tile boundaries this creates visible
// seams (T-junctions) where one tile has more vertices than its neighbor.
// SetNeighbors ensures matching LOD at shared edges.
terrain_00.SetNeighbors(left: null, top: terrain_01, right: terrain_10, bottom: null);
terrain_01.SetNeighbors(left: null, top: null, right: terrain_11, bottom: terrain_00);
terrain_10.SetNeighbors(left: terrain_00, top: terrain_11, right: null, bottom: null);
terrain_11.SetNeighbors(left: terrain_01, top: null, right: null, bottom: terrain_10);
```

---

## Setting Up Terrain

### Creating a Terrain

In the Editor: **GameObject → 3D Object → Terrain**. This creates a `Terrain` component with a default `TerrainData` asset.

Key settings on the `Terrain` component:

| Setting | Recommended Value | Why |
|---------|------------------|-----|
| **Heightmap Resolution** | 513 or 1025 | Must be 2^N + 1. Higher = more detail but more memory. 1025 is a good default for 1km² tiles. |
| **Detail Resolution** | 1024 | Controls grass/detail density map resolution per tile. |
| **Detail Resolution Per Patch** | 16 | Subdivisions for detail culling. 16 balances culling granularity vs. draw calls. |
| **Base Map Distance** | 500–1000 | Distance beyond which terrain uses a low-res composited base map instead of blending layers in real time. |
| **Pixel Error** | 5–8 | Controls terrain mesh LOD. Lower = more triangles (sharper but slower). |

### Terrain Layers (Textures)

Terrain Layers define the textures painted onto the terrain surface. Each layer is a `TerrainLayer` asset:

```csharp
using UnityEngine;

/// <summary>
/// Programmatically create and assign terrain layers.
/// Useful for procedural terrain generation pipelines.
/// </summary>
public static class TerrainLayerFactory
{
    public static TerrainLayer CreateLayer(
        Texture2D diffuse,
        Texture2D normalMap,
        Vector2 tileSize,
        float metallic = 0f,
        float smoothness = 0.5f)
    {
        // WHY TerrainLayer asset: terrain layers are shared across tiles.
        // Reusing the same TerrainLayer asset on adjacent tiles ensures
        // consistent painting and avoids redundant texture memory.
        var layer = new TerrainLayer
        {
            diffuseTexture = diffuse,
            normalMapTexture = normalMap,
            tileSize = tileSize,
            metallic = metallic,
            smoothness = smoothness
        };
        return layer;
    }
}
```

**Performance note:** URP/HDRP terrain shaders support up to **8 texture layers** per terrain tile with weight-map blending. Exceeding 4 layers adds an extra rendering pass. Stay at 4 or fewer layers for mobile.

---

## Terrain Tools Package

The optional **Terrain Tools** package (`com.unity.terrain-tools`) adds advanced sculpting and painting features beyond the built-in editor:

| Feature | Description |
|---------|-------------|
| **Erosion brushes** | Hydraulic, thermal, and wind erosion for realistic landscape shaping |
| **Noise brushes** | Perlin, Worley, and billow noise for procedural heightmap variation |
| **Brush Mask Filters** | Stack filters (slope, height, convexity) to constrain painting |
| **Terrain Toolbox** | Batch operations: split, merge, import/export heightmaps, create from preset |
| **Clone brush** | Copy terrain features from one area to another |

Install via Package Manager: `com.unity.terrain-tools` (version 5.1+ for Unity 6).

---

## Detail Objects (Grass and Small Props)

Detail objects are lightweight instances scattered across the terrain — grass, flowers, rocks, mushrooms. They are NOT full GameObjects; the terrain system manages their rendering via instancing.

### Detail Types

| Type | Rendering | Use Case |
|------|-----------|----------|
| **Detail Mesh** | GPU-instanced mesh | Small rocks, mushrooms, debris |
| **Detail Texture (Billboard)** | Camera-facing quad with texture | Grass blades, flowers |

```csharp
using UnityEngine;

/// <summary>
/// Procedurally scatter detail objects (grass) on a terrain.
/// Useful for runtime terrain generation or biome painting.
/// </summary>
public class DetailScatterer : MonoBehaviour
{
    [SerializeField] private Terrain _terrain;
    [SerializeField] private float _grassDensity = 0.7f;

    public void ScatterGrass(int detailLayerIndex)
    {
        TerrainData data = _terrain.terrainData;
        int resolution = data.detailResolution;

        // WHY int[,] map: the detail map is a 2D grid where each cell value
        // represents the number of detail instances at that position.
        // Values range from 0 (none) to ~15 (max density).
        int[,] map = new int[resolution, resolution];

        for (int y = 0; y < resolution; y++)
        {
            for (int x = 0; x < resolution; x++)
            {
                // Get normalized position on terrain (0-1)
                float normX = (float)x / resolution;
                float normY = (float)y / resolution;

                // Sample terrain height to avoid placing grass underwater or on cliffs
                float height = data.GetInterpolatedHeight(normX, normY);
                float steepness = data.GetSteepness(normX, normY);

                // WHY slope check: grass doesn't grow on steep cliff faces.
                // Height check: avoid placing below water level.
                if (height > 5f && steepness < 30f)
                {
                    map[y, x] = Random.value < _grassDensity
                        ? Random.Range(1, 8)
                        : 0;
                }
            }
        }

        // Apply the density map to the specified detail layer
        data.SetDetailLayer(0, 0, detailLayerIndex, map);
    }
}
```

### Detail Performance Settings

| Setting | Effect |
|---------|--------|
| `Terrain.detailObjectDistance` | Max distance for detail rendering (default 80m). Lower for mobile. |
| `Terrain.detailObjectDensity` | Global multiplier for detail density (0–1). Use 0.5 on mobile. |
| `QualitySettings` terrain overrides | Unity 6 lets you set detail distance/density per quality level. |

---

## Tree Placement and SpeedTree 9

Trees placed on terrain tiles use a specialized instanced renderer that handles LOD, wind animation, and billboarding automatically.

### SpeedTree 9 Integration (Unity 6)

Unity 6 ships the `SpeedTree9Importer` which supports `.st9` files from SpeedTree Modeler 9:

- **SpeedTree Games Wind** — GPU-based wind simulation, cheaper than legacy vertex animation
- **SpeedTree 9 shaders** for Built-in RP, URP, and HDRP
- **Automatic LOD** — smooth transition from full 3D mesh → billboard at distance

```csharp
// Programmatically add trees to terrain
TreePrototype[] prototypes = new TreePrototype[]
{
    new TreePrototype { prefab = oakPrefab },
    new TreePrototype { prefab = pinePrefab }
};
terrainData.treePrototypes = prototypes;

// Place tree instances
// WHY TreeInstance struct: trees are not GameObjects. They're stored as
// lightweight structs in TerrainData for efficient batched rendering.
// Thousands of trees have minimal per-instance overhead.
var instances = new List<TreeInstance>();
for (int i = 0; i < 500; i++)
{
    instances.Add(new TreeInstance
    {
        // Position is normalized 0-1 relative to terrain bounds
        position = new Vector3(Random.value, 0f, Random.value),
        prototypeIndex = Random.Range(0, 2),
        widthScale = Random.Range(0.8f, 1.2f),
        heightScale = Random.Range(0.8f, 1.2f),
        color = Color.white,
        lightmapColor = Color.white,
        rotation = Random.Range(0f, Mathf.PI * 2f)
    });
}
terrainData.SetTreeInstances(instances.ToArray(), snapToHeightmap: true);
```

### Tree Performance Tips

- **Tree Distance** (`Terrain.treeDistance`): default 2000m. Reduce for mobile (500–1000m).
- **Billboard Start** (`Terrain.treeBillboardDistance`): distance where 3D trees switch to billboards. Lower = better FPS but more obvious pop-in.
- **Max Mesh Trees** (`Terrain.treeMaximumFullLODCount`): caps the number of trees rendered as full 3D meshes. Default 50; raise for PC, lower for mobile.

---

## GPU Resident Drawer

Unity 6 introduces the **GPU Resident Drawer** — an automatic batching system that uses the `BatchRendererGroup` API under the hood. It dramatically reduces CPU draw-call overhead for large scenes.

### Enabling GPU Resident Drawer

**URP:** Project Settings → Graphics → URP Global Settings → enable "GPU Resident Drawer"

**HDRP:** Project Settings → Graphics → HDRP Global Settings → Frame Settings → enable "GPU Resident Drawer"

### How It Works

```
Traditional Rendering                  GPU Resident Drawer
──────────────────                     ────────────────────
CPU iterates every renderer            GPU holds persistent buffer of all
CPU issues draw call per batch         instance transforms + material data
CPU bound on complex scenes            GPU handles instancing + culling

10,000 trees = ~500 draw calls         10,000 trees = ~10 draw calls
(CPU bound)                            (GPU instanced, CPU nearly free)
```

### Requirements and Limitations

- Works with **static meshes** and **terrain tree instances** automatically
- Requires URP 17+ or HDRP 17+ (included with Unity 6)
- Materials must use **Lit** or **Complex Lit** shaders (custom shaders need SRP Batcher compatibility)
- Does NOT work with: skinned meshes, particle systems, or legacy Built-in RP
- Terrain detail objects use their own instancing path (separate from GPU Resident Drawer)

### Combining with Terrain

The GPU Resident Drawer works especially well for environment props placed *around* the terrain — rocks, buildings, fences, barrels. For best results:

1. Mark static environment props as **Static** (Batching Static + Occludee/Occluder Static)
2. Use shared materials across prop variants (same shader + same textures = same batch)
3. Enable GPU Resident Drawer in project settings
4. Profile with Frame Debugger to verify batching

---

## Large World Strategies

### Terrain Tiling

For worlds larger than 2km², split the terrain into tiles:

```csharp
using UnityEngine;
using System.Collections.Generic;

/// <summary>
/// Manages a grid of terrain tiles. Loads/unloads tiles based on
/// camera proximity for open-world streaming.
/// </summary>
public class TerrainTileManager : MonoBehaviour
{
    [SerializeField] private int _gridSize = 4;          // 4x4 grid = 16 tiles
    [SerializeField] private float _tileSize = 1000f;    // 1km per tile
    [SerializeField] private int _loadRadius = 2;         // Load tiles within 2 tiles of camera
    [SerializeField] private Transform _camera;

    // WHY Dictionary: terrain tiles are keyed by grid coordinate.
    // This allows O(1) lookup when checking which tiles to load/unload.
    private readonly Dictionary<Vector2Int, Terrain> _activeTiles = new();

    private void Update()
    {
        Vector2Int cameraCell = WorldToGrid(_camera.position);

        // Load tiles near camera
        for (int x = -_loadRadius; x <= _loadRadius; x++)
        {
            for (int z = -_loadRadius; z <= _loadRadius; z++)
            {
                Vector2Int cell = cameraCell + new Vector2Int(x, z);
                if (!_activeTiles.ContainsKey(cell) && IsValidCell(cell))
                {
                    LoadTile(cell);
                }
            }
        }

        // Unload distant tiles
        var toUnload = new List<Vector2Int>();
        foreach (var kvp in _activeTiles)
        {
            if (Vector2Int.Distance(kvp.Key, cameraCell) > _loadRadius + 1)
                toUnload.Add(kvp.Key);
        }
        foreach (var cell in toUnload)
            UnloadTile(cell);
    }

    private Vector2Int WorldToGrid(Vector3 worldPos)
    {
        return new Vector2Int(
            Mathf.FloorToInt(worldPos.x / _tileSize),
            Mathf.FloorToInt(worldPos.z / _tileSize)
        );
    }

    private bool IsValidCell(Vector2Int cell)
    {
        return cell.x >= 0 && cell.x < _gridSize
            && cell.y >= 0 && cell.y < _gridSize;
    }

    private void LoadTile(Vector2Int cell)
    {
        // WHY Addressables for tile loading: terrain data assets can be large
        // (heightmaps, splat maps). Addressables load asynchronously and
        // support streaming from disk without blocking the main thread.
        // See G9 for Addressables patterns.
        string key = $"Terrain_{cell.x}_{cell.y}";
        // Addressables.LoadAssetAsync<TerrainData>(key)...
        // For simplicity, showing synchronous placeholder:
        Debug.Log($"Loading terrain tile {cell}");
    }

    private void UnloadTile(Vector2Int cell)
    {
        if (_activeTiles.TryGetValue(cell, out var terrain))
        {
            Destroy(terrain.gameObject);
            _activeTiles.Remove(cell);
        }
    }
}
```

### Additive Scene Streaming

For worlds with non-terrain content (buildings, dungeons, cities), use additive scene loading with trigger volumes:

```csharp
using UnityEngine;
using UnityEngine.SceneManagement;

/// <summary>
/// Trigger volume that loads/unloads a scene additively when the
/// player enters or exits the area.
/// </summary>
[RequireComponent(typeof(Collider))]
public class SceneStreamTrigger : MonoBehaviour
{
    [SerializeField] private string _sceneName;
    [SerializeField] private bool _isLoaded;

    // WHY trigger-based streaming: loading everything at once causes
    // massive memory usage and long load times. Streaming loads only
    // what's near the player, keeping memory bounded.
    private void OnTriggerEnter(Collider other)
    {
        if (other.CompareTag("Player") && !_isLoaded)
        {
            SceneManager.LoadSceneAsync(_sceneName, LoadSceneMode.Additive);
            _isLoaded = true;
        }
    }

    private void OnTriggerExit(Collider other)
    {
        if (other.CompareTag("Player") && _isLoaded)
        {
            SceneManager.UnloadSceneAsync(_sceneName);
            _isLoaded = false;
        }
    }
}
```

---

## Procedural Terrain Generation

For runtime-generated worlds, modify `TerrainData` programmatically:

```csharp
using UnityEngine;

/// <summary>
/// Generates terrain heightmap from layered Perlin noise.
/// Call during loading to create a procedural landscape.
/// </summary>
public class ProceduralTerrainGenerator : MonoBehaviour
{
    [SerializeField] private Terrain _terrain;
    [SerializeField] private float _maxHeight = 200f;

    [Header("Noise Settings")]
    [SerializeField] private int _octaves = 4;
    [SerializeField] private float _baseFrequency = 0.005f;
    [SerializeField] private float _persistence = 0.5f;  // Amplitude decay per octave
    [SerializeField] private int _seed = 42;

    public void Generate()
    {
        TerrainData data = _terrain.terrainData;
        int res = data.heightmapResolution;

        // WHY float[,] normalized 0-1: TerrainData.SetHeights expects values
        // in [0, 1] range. Actual world height = value * terrainData.size.y.
        float[,] heights = new float[res, res];

        Random.InitState(_seed);
        float offsetX = Random.Range(0f, 10000f);
        float offsetZ = Random.Range(0f, 10000f);

        for (int z = 0; z < res; z++)
        {
            for (int x = 0; x < res; x++)
            {
                float amplitude = 1f;
                float frequency = _baseFrequency;
                float height = 0f;

                // WHY octave layering: a single Perlin sample produces smooth,
                // boring terrain. Layering multiple frequencies (octaves) at
                // decreasing amplitude creates realistic large-scale mountains
                // with small-scale roughness.
                for (int o = 0; o < _octaves; o++)
                {
                    float nx = (x + offsetX) * frequency;
                    float nz = (z + offsetZ) * frequency;
                    height += Mathf.PerlinNoise(nx, nz) * amplitude;

                    amplitude *= _persistence;
                    frequency *= 2f;
                }

                heights[z, x] = Mathf.Clamp01(height / _octaves);
            }
        }

        data.size = new Vector3(data.size.x, _maxHeight, data.size.z);
        data.SetHeights(0, 0, heights);
    }
}
```

---

## Performance Checklist

- [ ] Use **4 or fewer terrain layers** per tile (avoids extra texture blending pass)
- [ ] Set **detail distance** to 60–100m (not the default 250m) and tune per quality level
- [ ] Enable **GPU Resident Drawer** for environment prop batching (URP/HDRP)
- [ ] Mark static props as **Batching Static**
- [ ] Use **SpeedTree 9** trees with Games Wind for cheaper wind animation
- [ ] Set **billboard distance** appropriately — 3D trees are expensive beyond ~200 on screen
- [ ] For mobile: reduce heightmap resolution to 257 or 513, detail density to 0.3–0.5
- [ ] Tile large worlds and stream terrain + scenes based on camera proximity
- [ ] Profile with **Frame Debugger** (draw calls) and **Profiler** (terrain rendering time)
- [ ] Use **Terrain Quality Settings** (Unity 6) to auto-adjust LOD per quality tier

---

## Further Reading

- [Unity Manual: Terrain (6000.x)](https://docs.unity3d.com/6000.2/Documentation/Manual/TerrainTools.html)
- [Unity Scripting API: TerrainData (6000.x)](https://docs.unity3d.com/6000.3/Documentation/ScriptReference/TerrainData.html)
- [Unity Manual: Terrain Layers](https://docs.unity3d.com/6000.2/Documentation/Manual/class-TerrainLayer.html)
- [Unity Manual: GPU Resident Drawer (URP)](https://docs.unity3d.com/6000.0/Documentation/Manual/urp/gpu-resident-drawer.html)
- [GPU Resident Drawer (HDRP)](https://docs.unity3d.com/Packages/com.unity.render-pipelines.high-definition@17.0/manual/gpu-resident-drawer.html)
