# G19 — Procedural Content Generation in Unity 6

> **Category:** guide · **Engine:** Unity 6 (6000.x) · **Related:** [G1 Scene Management](G1_scene_management.md) · [G3 Physics & Collision](G3_physics_and_collision.md) · [G16 Performance Optimization](G16_performance_optimization_memory.md) · [Unity Rules](../unity-arch-rules.md)

Procedural Content Generation (PCG) lets you create game worlds, levels, items, and systems from algorithms and rules rather than hand-placing every element. This guide covers the core techniques — noise-based terrain, dungeon generation (BSP and WFC), runtime mesh generation, and modular placement systems — with Unity-specific implementations using `Mathf.PerlinNoise`, the Mesh API, Jobs + Burst for performance, and ScriptableObject-driven configuration.

---

## When to Use PCG

PCG isn't always the right choice. Use it when:

- **Replayability matters** — roguelikes, survival games, infinite runners need unique layouts per run
- **Content volume exceeds art budget** — open worlds with thousands of props placed algorithmically
- **Systemic variety** — loot tables, enemy wave composition, quest generation
- **Prototyping speed** — generate test levels faster than hand-building them

Avoid PCG for tightly authored narrative spaces (linear story levels, cutscene environments) where every detail is intentional.

---

## Noise-Based Terrain Generation

Perlin noise is the foundation of natural-looking procedural terrain, caves, and biome distribution.

### Heightmap Terrain

```csharp
using UnityEngine;

public class TerrainGenerator : MonoBehaviour
{
    [Header("Terrain Settings")]
    [SerializeField] private int width = 256;
    [SerializeField] private int depth = 256;
    [SerializeField] private float heightScale = 20f;

    [Header("Noise Settings")]
    [SerializeField] private float noiseScale = 50f;
    [SerializeField] private int octaves = 4;
    [SerializeField] private float persistence = 0.5f;
    [SerializeField] private float lacunarity = 2f;
    [SerializeField] private int seed = 42;

    private Terrain _terrain;

    void Start()
    {
        _terrain = GetComponent<Terrain>();
        GenerateTerrain();
    }

    void GenerateTerrain()
    {
        var terrainData = _terrain.terrainData;
        terrainData.heightmapResolution = width + 1;
        terrainData.size = new Vector3(width, heightScale, depth);

        float[,] heights = GenerateHeights();
        terrainData.SetHeights(0, 0, heights);
    }

    float[,] GenerateHeights()
    {
        var heights = new float[width, depth];

        // WHY: seed-based offset ensures the same seed always produces the same terrain
        // This is critical for multiplayer sync and reproducible testing
        var rng = new System.Random(seed);
        float offsetX = (float)rng.NextDouble() * 10000f;
        float offsetY = (float)rng.NextDouble() * 10000f;

        for (int x = 0; x < width; x++)
        {
            for (int z = 0; z < depth; z++)
            {
                heights[x, z] = CalculateHeight(x, z, offsetX, offsetY);
            }
        }
        return heights;
    }

    float CalculateHeight(int x, int z, float offsetX, float offsetY)
    {
        float amplitude = 1f;
        float frequency = 1f;
        float noiseHeight = 0f;

        // WHY: multiple octaves of noise layered together create natural-looking terrain
        // - Low frequency octaves = broad hills and valleys
        // - High frequency octaves = small bumps and details
        // - Persistence controls how quickly detail diminishes
        for (int i = 0; i < octaves; i++)
        {
            float sampleX = (x / noiseScale) * frequency + offsetX;
            float sampleZ = (z / noiseScale) * frequency + offsetY;

            // Mathf.PerlinNoise returns 0–1; remap to -1 to 1 for better layering
            float perlinValue = Mathf.PerlinNoise(sampleX, sampleZ) * 2f - 1f;
            noiseHeight += perlinValue * amplitude;

            amplitude *= persistence;   // each octave contributes less
            frequency *= lacunarity;    // each octave has finer detail
        }

        // Normalize to 0–1 range for Unity's terrain heightmap
        return Mathf.InverseLerp(-1f, 1f, noiseHeight);
    }
}
```

---

## Dungeon Generation with Binary Space Partitioning

BSP is ideal for grid-based dungeon layouts with rooms connected by corridors — the standard for roguelikes.

```csharp
using System.Collections.Generic;
using UnityEngine;

/// <summary>
/// Generates a 2D dungeon using Binary Space Partitioning.
/// WHY BSP: guarantees non-overlapping rooms with connected corridors,
/// and the recursive structure naturally creates interesting spatial hierarchies.
/// </summary>
public class BSPDungeonGenerator
{
    public int Width { get; }
    public int Height { get; }
    public int MinRoomSize { get; }

    // WHY: seeded random ensures the same seed produces the same dungeon
    // Critical for: multiplayer sync, replay systems, bug reproduction
    private System.Random _rng;

    public BSPDungeonGenerator(int width, int height, int minRoomSize, int seed)
    {
        Width = width;
        Height = height;
        MinRoomSize = minRoomSize;
        _rng = new System.Random(seed);
    }

    public DungeonData Generate()
    {
        // Step 1: Recursively partition the space into leaf nodes
        var root = new BSPNode(0, 0, Width, Height);
        SplitNode(root);

        // Step 2: Create rooms inside each leaf node
        var rooms = new List<RectInt>();
        CreateRooms(root, rooms);

        // Step 3: Connect rooms via corridors by walking the BSP tree
        var corridors = new List<RectInt>();
        ConnectRooms(root, corridors);

        return new DungeonData(rooms, corridors);
    }

    private void SplitNode(BSPNode node)
    {
        // Stop splitting when the node is too small for two rooms
        if (node.Width < MinRoomSize * 2 && node.Height < MinRoomSize * 2)
            return;

        // WHY: choose split direction based on aspect ratio to avoid long, thin rooms
        bool splitHorizontal;
        if (node.Width > node.Height * 1.25f)
            splitHorizontal = false; // too wide — split vertically
        else if (node.Height > node.Width * 1.25f)
            splitHorizontal = true;  // too tall — split horizontally
        else
            splitHorizontal = _rng.NextDouble() > 0.5;

        int max = (splitHorizontal ? node.Height : node.Width) - MinRoomSize;
        if (max <= MinRoomSize) return;

        int splitPos = _rng.Next(MinRoomSize, max);

        if (splitHorizontal)
        {
            node.Left = new BSPNode(node.X, node.Y, node.Width, splitPos);
            node.Right = new BSPNode(node.X, node.Y + splitPos, node.Width, node.Height - splitPos);
        }
        else
        {
            node.Left = new BSPNode(node.X, node.Y, splitPos, node.Height);
            node.Right = new BSPNode(node.X + splitPos, node.Y, node.Width - splitPos, node.Height);
        }

        SplitNode(node.Left);
        SplitNode(node.Right);
    }

    private void CreateRooms(BSPNode node, List<RectInt> rooms)
    {
        if (node.Left != null && node.Right != null)
        {
            CreateRooms(node.Left, rooms);
            CreateRooms(node.Right, rooms);
            return;
        }

        // Leaf node — create a room with some padding
        // WHY: padding prevents rooms from touching the partition boundary,
        // leaving space for walls and corridors
        int padding = 2;
        int roomW = _rng.Next(MinRoomSize, node.Width - padding);
        int roomH = _rng.Next(MinRoomSize, node.Height - padding);
        int roomX = node.X + _rng.Next(1, node.Width - roomW);
        int roomY = node.Y + _rng.Next(1, node.Height - roomH);

        var room = new RectInt(roomX, roomY, roomW, roomH);
        rooms.Add(room);
        node.Room = room;
    }

    private void ConnectRooms(BSPNode node, List<RectInt> corridors)
    {
        if (node.Left == null || node.Right == null) return;

        ConnectRooms(node.Left, corridors);
        ConnectRooms(node.Right, corridors);

        // Connect the closest rooms from each child subtree
        var leftCenter = GetRoomCenter(node.Left);
        var rightCenter = GetRoomCenter(node.Right);

        // L-shaped corridor: horizontal then vertical
        if (_rng.NextDouble() > 0.5)
        {
            corridors.Add(CreateHorizontalCorridor(leftCenter.x, rightCenter.x, leftCenter.y));
            corridors.Add(CreateVerticalCorridor(leftCenter.y, rightCenter.y, rightCenter.x));
        }
        else
        {
            corridors.Add(CreateVerticalCorridor(leftCenter.y, rightCenter.y, leftCenter.x));
            corridors.Add(CreateHorizontalCorridor(leftCenter.x, rightCenter.x, rightCenter.y));
        }
    }

    private Vector2Int GetRoomCenter(BSPNode node)
    {
        if (node.Room.HasValue)
        {
            var r = node.Room.Value;
            return new Vector2Int(r.x + r.width / 2, r.y + r.height / 2);
        }
        // Recurse to find a room in the subtree
        if (node.Left != null) return GetRoomCenter(node.Left);
        return GetRoomCenter(node.Right);
    }

    private RectInt CreateHorizontalCorridor(int x1, int x2, int y)
    {
        int minX = Mathf.Min(x1, x2);
        return new RectInt(minX, y, Mathf.Abs(x1 - x2) + 1, 1);
    }

    private RectInt CreateVerticalCorridor(int y1, int y2, int x)
    {
        int minY = Mathf.Min(y1, y2);
        return new RectInt(x, minY, 1, Mathf.Abs(y1 - y2) + 1);
    }
}

public class BSPNode
{
    public int X, Y, Width, Height;
    public BSPNode Left, Right;
    public RectInt? Room;

    public BSPNode(int x, int y, int w, int h)
    {
        X = x; Y = y; Width = w; Height = h;
    }
}

public class DungeonData
{
    public List<RectInt> Rooms { get; }
    public List<RectInt> Corridors { get; }

    public DungeonData(List<RectInt> rooms, List<RectInt> corridors)
    {
        Rooms = rooms;
        Corridors = corridors;
    }
}
```

---

## Wave Function Collapse for Tilemap Generation

WFC generates locally consistent patterns from a set of tiles with adjacency rules. It excels at creating seamless, varied 2D tilemaps.

```csharp
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

/// <summary>
/// Simplified Wave Function Collapse for 2D tile placement.
/// WHY WFC: unlike pure random placement, WFC guarantees that adjacent tiles
/// are always compatible — no broken seams or impossible transitions.
/// </summary>
[System.Serializable]
public class TileRule
{
    public GameObject tilePrefab;
    public string tileId;
    // Which tile IDs can appear in each cardinal direction
    public string[] allowedNorth;
    public string[] allowedSouth;
    public string[] allowedEast;
    public string[] allowedWest;
    public float weight = 1f;  // higher weight = more likely to be chosen
}

public class WFCGenerator : MonoBehaviour
{
    [SerializeField] private TileRule[] tileRules;
    [SerializeField] private int gridWidth = 20;
    [SerializeField] private int gridHeight = 20;
    [SerializeField] private float tileSize = 1f;
    [SerializeField] private int seed = 42;

    private HashSet<string>[][] _possibilities;
    private string[][] _collapsed;
    private System.Random _rng;

    public void Generate()
    {
        _rng = new System.Random(seed);
        InitializeGrid();

        // WHY: iterate until all cells are collapsed (have exactly one tile)
        // WFC picks the lowest-entropy cell each step to minimize backtracking
        while (TryCollapseNext()) { }

        InstantiateTiles();
    }

    private void InitializeGrid()
    {
        var allIds = tileRules.Select(r => r.tileId).ToHashSet();
        _possibilities = new HashSet<string>[gridWidth][];
        _collapsed = new string[gridWidth][];

        for (int x = 0; x < gridWidth; x++)
        {
            _possibilities[x] = new HashSet<string>[gridHeight];
            _collapsed[x] = new string[gridHeight];
            for (int y = 0; y < gridHeight; y++)
            {
                _possibilities[x][y] = new HashSet<string>(allIds);
            }
        }
    }

    private bool TryCollapseNext()
    {
        // Find the cell with the lowest entropy (fewest possibilities) that isn't collapsed
        // WHY: collapsing low-entropy cells first propagates the most constraints,
        // reducing the chance of contradictions later
        int bestX = -1, bestY = -1;
        int bestEntropy = int.MaxValue;

        for (int x = 0; x < gridWidth; x++)
        {
            for (int y = 0; y < gridHeight; y++)
            {
                if (_collapsed[x][y] != null) continue;
                int entropy = _possibilities[x][y].Count;
                if (entropy == 0) return false; // contradiction — no valid tile
                if (entropy < bestEntropy)
                {
                    bestEntropy = entropy;
                    bestX = x;
                    bestY = y;
                }
            }
        }

        if (bestX == -1) return false; // all collapsed

        // Collapse: pick a random tile weighted by preference
        var options = _possibilities[bestX][bestY].ToList();
        string chosen = PickWeighted(options);
        _collapsed[bestX][bestY] = chosen;
        _possibilities[bestX][bestY] = new HashSet<string> { chosen };

        // Propagate constraints to neighbors
        Propagate(bestX, bestY);
        return true;
    }

    private string PickWeighted(List<string> options)
    {
        float totalWeight = options.Sum(id => GetRule(id).weight);
        float roll = (float)_rng.NextDouble() * totalWeight;
        float cumulative = 0f;

        foreach (var id in options)
        {
            cumulative += GetRule(id).weight;
            if (roll <= cumulative) return id;
        }
        return options.Last();
    }

    private void Propagate(int x, int y)
    {
        // WHY: propagation is the core of WFC — when we collapse a cell,
        // we remove incompatible options from its neighbors, which may cascade further
        var stack = new Stack<Vector2Int>();
        stack.Push(new Vector2Int(x, y));

        while (stack.Count > 0)
        {
            var pos = stack.Pop();
            var rule = GetRule(_collapsed[pos.x]?[pos.y] ?? _possibilities[pos.x][pos.y].First());

            TryConstrain(pos.x, pos.y - 1, rule.allowedSouth, stack); // south neighbor
            TryConstrain(pos.x, pos.y + 1, rule.allowedNorth, stack); // north neighbor
            TryConstrain(pos.x - 1, pos.y, rule.allowedWest, stack);  // west neighbor
            TryConstrain(pos.x + 1, pos.y, rule.allowedEast, stack);  // east neighbor
        }
    }

    private void TryConstrain(int x, int y, string[] allowed, Stack<Vector2Int> stack)
    {
        if (x < 0 || x >= gridWidth || y < 0 || y >= gridHeight) return;
        if (_collapsed[x][y] != null) return;

        int before = _possibilities[x][y].Count;
        _possibilities[x][y].IntersectWith(allowed);

        if (_possibilities[x][y].Count < before)
            stack.Push(new Vector2Int(x, y));
    }

    private void InstantiateTiles()
    {
        for (int x = 0; x < gridWidth; x++)
        {
            for (int y = 0; y < gridHeight; y++)
            {
                if (_collapsed[x][y] == null) continue;
                var rule = GetRule(_collapsed[x][y]);
                Instantiate(rule.tilePrefab,
                    new Vector3(x * tileSize, 0, y * tileSize),
                    Quaternion.identity, transform);
            }
        }
    }

    private TileRule GetRule(string id) => tileRules.First(r => r.tileId == id);
}
```

---

## Runtime Mesh Generation

For caves, organic shapes, or voxel terrain, generate meshes at runtime:

```csharp
using UnityEngine;
using System.Collections.Generic;

/// <summary>
/// Generates a procedural mesh from a 2D grid of values (e.g., noise, cellular automata).
/// WHY: runtime mesh generation lets you create shapes that can't be pre-modeled,
/// like cave systems, destructible terrain, or infinite voxel worlds.
/// </summary>
public class ProceduralMeshBuilder
{
    private List<Vector3> _vertices = new();
    private List<int> _triangles = new();
    private List<Vector2> _uvs = new();

    /// <summary>
    /// Create a mesh from a heightmap grid.
    /// </summary>
    public Mesh BuildFromHeightmap(float[,] heightmap, float cellSize, float heightScale)
    {
        int width = heightmap.GetLength(0);
        int depth = heightmap.GetLength(1);

        _vertices.Clear();
        _triangles.Clear();
        _uvs.Clear();

        // Generate vertices
        for (int z = 0; z < depth; z++)
        {
            for (int x = 0; x < width; x++)
            {
                float y = heightmap[x, z] * heightScale;
                _vertices.Add(new Vector3(x * cellSize, y, z * cellSize));
                _uvs.Add(new Vector2((float)x / width, (float)z / depth));
            }
        }

        // Generate triangles (two per grid cell, forming a quad)
        for (int z = 0; z < depth - 1; z++)
        {
            for (int x = 0; x < width - 1; x++)
            {
                int topLeft = z * width + x;
                int topRight = topLeft + 1;
                int bottomLeft = (z + 1) * width + x;
                int bottomRight = bottomLeft + 1;

                // WHY: two triangles per cell, wound clockwise for correct face normals
                _triangles.Add(topLeft);
                _triangles.Add(bottomLeft);
                _triangles.Add(topRight);

                _triangles.Add(topRight);
                _triangles.Add(bottomLeft);
                _triangles.Add(bottomRight);
            }
        }

        var mesh = new Mesh();

        // WHY: IndexFormat.UInt32 supports meshes with >65535 vertices
        // UInt16 is the default and will silently corrupt large meshes
        if (_vertices.Count > 65535)
            mesh.indexFormat = UnityEngine.Rendering.IndexFormat.UInt32;

        mesh.SetVertices(_vertices);
        mesh.SetTriangles(_triangles, 0);
        mesh.SetUVs(0, _uvs);
        mesh.RecalculateNormals();
        mesh.RecalculateBounds();

        return mesh;
    }
}
```

---

## Performance Considerations

PCG algorithms can be expensive. Here's how to keep them fast in Unity:

### Use Jobs + Burst for Heavy Generation

```csharp
using Unity.Burst;
using Unity.Collections;
using Unity.Jobs;
using Unity.Mathematics;

// WHY: Burst-compiled jobs run 10–50x faster than managed C# for numeric work
// Noise generation is embarrassingly parallel — perfect for the Job System

[BurstCompile]
public struct NoiseJob : IJobParallelFor
{
    [ReadOnly] public int Width;
    [ReadOnly] public float Scale;
    [ReadOnly] public float OffsetX;
    [ReadOnly] public float OffsetY;

    [WriteOnly] public NativeArray<float> Heights;

    public void Execute(int index)
    {
        int x = index % Width;
        int z = index / Width;

        float sampleX = x / Scale + OffsetX;
        float sampleZ = z / Scale + OffsetY;

        // Unity.Mathematics.noise.cnoise = Burst-compatible Perlin noise
        Heights[index] = noise.cnoise(new float2(sampleX, sampleZ)) * 0.5f + 0.5f;
    }
}

// Usage:
// var heights = new NativeArray<float>(width * depth, Allocator.TempJob);
// var job = new NoiseJob { Width = width, Scale = 50f, ... Heights = heights };
// job.Schedule(width * depth, 64).Complete();
```

### Async Generation with Coroutines

For generators that take more than one frame, spread the work across frames to avoid freezing:

```csharp
using System.Collections;
using UnityEngine;

public class AsyncDungeonBuilder : MonoBehaviour
{
    // WHY: generating a large dungeon in one frame causes a noticeable freeze
    // Spreading it across frames keeps the game responsive during loading
    public IEnumerator GenerateAsync(BSPDungeonGenerator generator, int roomsPerFrame = 5)
    {
        var data = generator.Generate();
        int placed = 0;

        foreach (var room in data.Rooms)
        {
            PlaceRoomTiles(room);
            placed++;

            if (placed % roomsPerFrame == 0)
                yield return null;  // pause until next frame
        }

        foreach (var corridor in data.Corridors)
        {
            PlaceCorridorTiles(corridor);
            placed++;

            if (placed % roomsPerFrame == 0)
                yield return null;
        }
    }

    private void PlaceRoomTiles(RectInt room) { /* instantiate floor/wall tiles */ }
    private void PlaceCorridorTiles(RectInt corridor) { /* instantiate corridor tiles */ }
}
```

### ScriptableObject Configuration

```csharp
using UnityEngine;

/// <summary>
/// WHY ScriptableObject: stores PCG parameters as assets that designers can tweak
/// in the inspector without touching code. Swap configs to create different biomes,
/// difficulty levels, or level themes — all data-driven.
/// </summary>
[CreateAssetMenu(fileName = "DungeonConfig", menuName = "PCG/Dungeon Config")]
public class DungeonConfig : ScriptableObject
{
    [Header("Grid")]
    public int width = 64;
    public int height = 64;
    public int minRoomSize = 6;

    [Header("Seeding")]
    [Tooltip("0 = random seed each run")]
    public int seed = 0;

    [Header("Room Content")]
    public float enemyDensity = 0.3f;
    public float lootChance = 0.15f;
    public GameObject[] enemyPrefabs;
    public GameObject[] lootPrefabs;

    public int GetSeed() => seed == 0 ? Random.Range(1, int.MaxValue) : seed;
}
```

---

## Choosing an Algorithm

| Algorithm | Best For | Strengths | Weaknesses |
|-----------|----------|-----------|------------|
| **Perlin / Simplex Noise** | Terrain, caves, organic shapes | Smooth, natural-looking, fast | No structural awareness |
| **BSP** | Room-and-corridor dungeons | Guaranteed connectivity, no overlap | Rectangular rooms only |
| **Wave Function Collapse** | Tilemap levels, city blocks, patterns | Locally consistent, beautiful output | Slow for large grids, can fail (contradictions) |
| **Cellular Automata** | Caves, organic blobs | Simple rules, organic shapes | No guaranteed connectivity |
| **L-Systems** | Trees, plants, branching structures | Compact rules, natural branching | Hard to control precisely |
| **Poisson Disk Sampling** | Object placement (trees, props, spawns) | Even distribution with no clumping | Doesn't handle constraints |
