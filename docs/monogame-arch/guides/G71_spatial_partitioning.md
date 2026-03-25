# G71 — Spatial Partitioning & Entity Queries

> **Category:** Guide · **Related:** [G3 Physics & Collision](./G3_physics_and_collision.md) · [G4 AI Systems](./G4_ai_systems.md) · [G40 Pathfinding](./G40_pathfinding.md) · [G54 Fog of War](./G54_fog_of_war.md) · [G67 Object Pooling](./G67_object_pooling.md) · [G13 C# Performance](./G13_csharp_performance.md) · [P12 Performance Budget](./P12_performance_budget.md) · [G20 Camera Systems](./G20_camera_systems.md) · [G37 Tilemap Systems](./G37_tilemap_systems.md)

> A complete implementation guide for spatial partitioning and entity queries in MonoGame + Arch ECS. Covers grid partitioning, spatial hashing, quadtrees, sweep-and-prune, K-D trees, multi-resolution grids, range queries, nearest-neighbor search, frustum culling, and genre-specific patterns. Every game with more than ~50 active entities benefits from spatial partitioning. Everything is composable — pick the structure that fits your game's spatial distribution.

---

## Table of Contents

1. [Why Spatial Partitioning?](#1--why-spatial-partitioning)
2. [Choosing the Right Structure](#2--choosing-the-right-structure)
3. [Uniform Grid](#3--uniform-grid)
4. [Spatial Hash Grid](#4--spatial-hash-grid)
5. [Quadtree](#5--quadtree)
6. [Loose Quadtree](#6--loose-quadtree)
7. [Sweep-and-Prune (SAP)](#7--sweep-and-prune-sap)
8. [K-D Tree](#8--k-d-tree)
9. [Multi-Resolution Grid](#9--multi-resolution-grid)
10. [ECS Integration — The SpatialIndex System](#10--ecs-integration--the-spatialindex-system)
11. [Range Queries](#11--range-queries)
12. [Nearest-Neighbor Queries](#12--nearest-neighbor-queries)
13. [Ray Queries](#13--ray-queries)
14. [Frustum Culling & Camera Queries](#14--frustum-culling--camera-queries)
15. [Collision Broad Phase](#15--collision-broad-phase)
16. [AI Perception & Awareness](#16--ai-perception--awareness)
17. [Dynamic Entity Tracking](#17--dynamic-entity-tracking)
18. [Thread Safety & Parallel Queries](#18--thread-safety--parallel-queries)
19. [Debugging & Visualization](#19--debugging--visualization)
20. [Genre-Specific Patterns](#20--genre-specific-patterns)
21. [Common Mistakes & Anti-Patterns](#21--common-mistakes--anti-patterns)
22. [Tuning Reference](#22--tuning-reference)

---

## 1 — Why Spatial Partitioning?

### The Brute-Force Problem

Every system that asks "which entities are near X?" has the same naive solution: check every entity.

```csharp
// O(N) for one query, O(N²) for all-pairs — this kills your frame rate
List<Entity> FindNearby(Vector2 position, float radius, List<Entity> allEntities)
{
    var results = new List<Entity>();
    float radiusSq = radius * radius;
    
    foreach (var entity in allEntities)
    {
        float distSq = Vector2.DistanceSquared(position, entity.Position);
        if (distSq <= radiusSq)
            results.Add(entity);
    }
    
    return results;
}
```

This works fine for 50 entities. At 500, your collision system runs 250,000 pair checks per frame. At 5,000 (a bullet hell or RTS), that's 25,000,000 checks. At 60fps, you have 16.67ms per frame — brute-force is dead.

### What Spatial Partitioning Solves

Divide the world into regions. Each entity lives in one (or a few) regions. Queries only check entities in relevant regions.

```
Brute-force: "Is anything near me?" → check all 5,000 entities
Spatial:     "Is anything near me?" → check ~20 entities in my cell + neighbors
```

The speedup depends on entity density and query patterns:

| Entity Count | Brute-Force Pairs | Grid (64×64) Avg | Speedup |
|-------------|-------------------|-------------------|---------|
| 100 | 4,950 | ~50 | 100× |
| 500 | 124,750 | ~120 | 1,040× |
| 1,000 | 499,500 | ~200 | 2,498× |
| 5,000 | 12,497,500 | ~500 | 24,995× |
| 10,000 | 49,995,000 | ~800 | 62,494× |

### Who Needs This

Spatial partitioning powers more systems than most developers realize:

| System | Query Type | Frequency |
|--------|-----------|-----------|
| **Collision broad phase** | All overlapping pairs | Every frame |
| **AI perception** | "Who can I see/hear?" | Every few frames |
| **Projectile hit detection** | "What did I hit?" | Every frame |
| **Pickup collection** | "Am I near a pickup?" | Every frame |
| **Camera culling** | "What's on screen?" | Every frame |
| **Fog of war** | "What can the player see?" | Every few frames |
| **Influence maps** | "What controls this area?" | Periodically |
| **Sound propagation** | "Which sources are nearby?" | Every few frames |
| **Pathfinding** | "Is this cell blocked?" | On demand |
| **Mouse picking** | "What did I click?" | On click |
| **Minimap** | "What's in this world region?" | Every frame |
| **AoE abilities** | "Who's in the blast radius?" | On cast |

**Rule of thumb:** If you have >50 entities and any system that asks "what's near X?", you need spatial partitioning. If you have >500 entities, you DEFINITELY need it.

---

## 2 — Choosing the Right Structure

### Decision Tree

```
How many entities?
├─ < 50 → Brute force (no partitioning needed)
├─ 50–500 → Uniform Grid or Spatial Hash
├─ 500–5,000 → Spatial Hash or Quadtree
└─ > 5,000 → Spatial Hash + Multi-Resolution

Are entities uniform size?
├─ Yes, similar sizes → Uniform Grid or Spatial Hash
├─ Mixed sizes (bullets + bosses) → Loose Quadtree or Multi-Resolution Grid
└─ Extreme variance (particles + world zones) → Separate structures per size class

Is the world bounded?
├─ Yes, fixed size (arena, level) → Uniform Grid
├─ No, infinite/streaming → Spatial Hash
└─ Dynamic bounds → Quadtree

How do entities move?
├─ Mostly static (tiles, walls) → Quadtree (rebuild rarely)
├─ Mixed static + dynamic → Quadtree for static, Grid for dynamic
├─ All dynamic, similar speed → Spatial Hash (rebuild every frame)
└─ Mostly along one axis → Sweep-and-Prune (SAP)

What queries do you need?
├─ Broad phase collision → Grid, SAP, or Quadtree
├─ Range queries (circle/rect) → Grid or Quadtree
├─ K-nearest neighbors → K-D Tree or Grid
├─ Ray casting → Grid (DDA) or K-D Tree
└─ Frustum/viewport culling → Grid or Quadtree
```

### Comparison Table

| Structure | Insert | Remove | Query (range) | Memory | Moving Entities | Best For |
|-----------|--------|--------|---------------|--------|-----------------|----------|
| **Uniform Grid** | O(1) | O(1) | O(k) | O(W×H) | Excellent | Bounded worlds, uniform density |
| **Spatial Hash** | O(1) | O(1) | O(k) | O(N) | Excellent | Unbounded/infinite worlds |
| **Quadtree** | O(log N) | O(log N) | O(k + log N) | O(N) | Poor (rebuild) | Mixed sizes, static worlds |
| **Loose Quadtree** | O(log N) | O(log N) | O(k + log N) | O(N) | Fair | Mixed sizes, some movement |
| **SAP** | O(N) | O(N) | O(N + k) | O(N) | Good (incremental) | Sorted axis, collision pairs |
| **K-D Tree** | O(N log N)† | O(N log N)† | O(√N + k) | O(N) | Poor (rebuild) | KNN queries, static geometry |
| **Multi-Res Grid** | O(1) | O(1) | O(k) | O(Σ cells) | Excellent | Mixed entity sizes |

*k = result count, N = total entities, W×H = grid dimensions. †K-D tree is typically rebuilt, not modified.*

---

## 3 — Uniform Grid

The simplest and often the fastest spatial structure. Divides the world into a fixed grid of equally-sized cells.

### When to Use

- World has known, fixed bounds
- Entities are roughly the same size
- Entity distribution is fairly uniform (not all clustered in one corner)
- You need both insertion and query to be blazing fast

### Core Implementation

```csharp
public class UniformGrid<T>
{
    private readonly List<T>[] _cells;
    private readonly int _cols;
    private readonly int _rows;
    private readonly float _cellSize;
    private readonly float _invCellSize; // 1f / cellSize — avoid division
    private readonly Vector2 _origin;    // world-space offset of grid (0,0) cell

    public UniformGrid(float worldWidth, float worldHeight, float cellSize,
                       Vector2 origin = default)
    {
        _cellSize = cellSize;
        _invCellSize = 1f / cellSize;
        _origin = origin;
        _cols = (int)MathF.Ceiling(worldWidth * _invCellSize);
        _rows = (int)MathF.Ceiling(worldHeight * _invCellSize);

        _cells = new List<T>[_cols * _rows];
        for (int i = 0; i < _cells.Length; i++)
            _cells[i] = new List<T>();
    }

    /// <summary>World position → flat cell index. Returns -1 if out of bounds.</summary>
    public int CellIndex(Vector2 worldPos)
    {
        int col = (int)((worldPos.X - _origin.X) * _invCellSize);
        int row = (int)((worldPos.Y - _origin.Y) * _invCellSize);
        if (col < 0 || col >= _cols || row < 0 || row >= _rows)
            return -1;
        return row * _cols + col;
    }

    public (int col, int row) CellCoords(Vector2 worldPos)
    {
        return (
            (int)((worldPos.X - _origin.X) * _invCellSize),
            (int)((worldPos.Y - _origin.Y) * _invCellSize)
        );
    }

    /// <summary>Insert an item at a world position. O(1).</summary>
    public void Insert(T item, Vector2 worldPos)
    {
        int idx = CellIndex(worldPos);
        if (idx >= 0)
            _cells[idx].Add(item);
    }

    /// <summary>Insert an item that spans an AABB (may occupy multiple cells).</summary>
    public void InsertAABB(T item, Vector2 min, Vector2 max)
    {
        var (minCol, minRow) = CellCoords(min);
        var (maxCol, maxRow) = CellCoords(max);

        minCol = Math.Clamp(minCol, 0, _cols - 1);
        maxCol = Math.Clamp(maxCol, 0, _cols - 1);
        minRow = Math.Clamp(minRow, 0, _rows - 1);
        maxRow = Math.Clamp(maxRow, 0, _rows - 1);

        for (int r = minRow; r <= maxRow; r++)
            for (int c = minCol; c <= maxCol; c++)
                _cells[r * _cols + c].Add(item);
    }

    /// <summary>Clear all cells. Call once per frame before re-inserting.</summary>
    public void Clear()
    {
        for (int i = 0; i < _cells.Length; i++)
            _cells[i].Clear();
    }

    /// <summary>Get all items in a specific cell.</summary>
    public List<T> GetCell(int col, int row)
    {
        if (col < 0 || col >= _cols || row < 0 || row >= _rows)
            return _emptyList;
        return _cells[row * _cols + col];
    }

    private static readonly List<T> _emptyList = new();

    /// <summary>Query all items within a rectangle (world space).</summary>
    public void QueryRect(Vector2 min, Vector2 max, List<T> results)
    {
        var (minCol, minRow) = CellCoords(min);
        var (maxCol, maxRow) = CellCoords(max);

        minCol = Math.Clamp(minCol, 0, _cols - 1);
        maxCol = Math.Clamp(maxCol, 0, _cols - 1);
        minRow = Math.Clamp(minRow, 0, _rows - 1);
        maxRow = Math.Clamp(maxRow, 0, _rows - 1);

        for (int r = minRow; r <= maxRow; r++)
            for (int c = minCol; c <= maxCol; c++)
                results.AddRange(_cells[r * _cols + c]);
    }

    /// <summary>Query all items within a circle (world space).</summary>
    public void QueryCircle(Vector2 center, float radius, List<T> results)
    {
        // First: get rect of cells that overlap the bounding box of the circle
        Vector2 min = center - new Vector2(radius);
        Vector2 max = center + new Vector2(radius);
        var (minCol, minRow) = CellCoords(min);
        var (maxCol, maxRow) = CellCoords(max);

        minCol = Math.Clamp(minCol, 0, _cols - 1);
        maxCol = Math.Clamp(maxCol, 0, _cols - 1);
        minRow = Math.Clamp(minRow, 0, _rows - 1);
        maxRow = Math.Clamp(maxRow, 0, _rows - 1);

        // Add all items from those cells — narrow phase checks exact distance
        for (int r = minRow; r <= maxRow; r++)
            for (int c = minCol; c <= maxCol; c++)
                results.AddRange(_cells[r * _cols + c]);
    }

    public int Cols => _cols;
    public int Rows => _rows;
    public float CellSize => _cellSize;

    /// <summary>Count total items across all cells (diagnostic).</summary>
    public int TotalItems()
    {
        int count = 0;
        for (int i = 0; i < _cells.Length; i++)
            count += _cells[i].Count;
        return count;
    }
}
```

### Optimal Cell Size

The cell size determines the efficiency of queries. Too small → many empty cells wasting memory. Too large → too many entities per cell, approaching brute-force.

**Rule of thumb:** Cell size should be 2–4× the radius of your most common query.

```csharp
// If most queries are "find enemies within 100 pixels"
float queryRadius = 100f;
float cellSize = queryRadius * 2f; // 200px cells

// A 1920×1080 world at 200px cells = ~54 cells (very efficient)
// A 10,000×10,000 world at 200px cells = 2,500 cells (still fine)
```

| Query Radius | Good Cell Size | 1920×1080 Cells | 10,000×10,000 Cells |
|-------------|---------------|-----------------|---------------------|
| 32px | 64px | 510 | 24,414 |
| 64px | 128px | 135 | 6,104 |
| 100px | 200px | 54 | 2,500 |
| 200px | 400px | 15 | 625 |
| 500px | 1000px | 2 | 100 |

### Frame Lifecycle

For dynamic entities, rebuild the grid every frame:

```csharp
public class SpatialGridSystem : ISystem
{
    private readonly UniformGrid<Entity> _grid;
    private readonly QueryDescription _movableQuery;

    public SpatialGridSystem(World world, float worldWidth, float worldHeight, float cellSize)
    {
        _grid = new UniformGrid<Entity>(worldWidth, worldHeight, cellSize);
        _movableQuery = new QueryDescription().WithAll<Position, Collider>();
    }

    public void Update(World world)
    {
        // 1. Clear — O(cells), very fast for typical grid sizes
        _grid.Clear();

        // 2. Re-insert all entities — O(N), one hash per entity
        world.Query(in _movableQuery, (Entity entity, ref Position pos, ref Collider col) =>
        {
            if (col.Width > _grid.CellSize || col.Height > _grid.CellSize)
            {
                // Entity larger than a cell — insert into all overlapping cells
                Vector2 min = new(pos.X - col.Width * 0.5f, pos.Y - col.Height * 0.5f);
                Vector2 max = new(pos.X + col.Width * 0.5f, pos.Y + col.Height * 0.5f);
                _grid.InsertAABB(entity, min, max);
            }
            else
            {
                // Entity fits in one cell — single insert
                _grid.Insert(entity, new Vector2(pos.X, pos.Y));
            }
        });
    }

    public UniformGrid<Entity> Grid => _grid;
}
```

---

## 4 — Spatial Hash Grid

Like a uniform grid but uses a hash map instead of a fixed array. This means:
- No fixed world bounds required
- Memory scales with entity count, not world size
- Supports infinite/streaming worlds
- Slightly slower per-lookup (hash computation + dictionary overhead)

### When to Use

- World has no fixed bounds or is very large (infinite runners, open worlds)
- Entity distribution is highly uneven (most of the world is empty)
- You don't know the world size at compile time

### Core Implementation

```csharp
public class SpatialHash<T>
{
    private readonly Dictionary<long, List<T>> _buckets = new();
    private readonly float _cellSize;
    private readonly float _invCellSize;

    // Pool empty lists to avoid allocations
    private readonly Stack<List<T>> _listPool = new();

    public SpatialHash(float cellSize)
    {
        _cellSize = cellSize;
        _invCellSize = 1f / cellSize;
    }

    /// <summary>Convert world position to cell key.</summary>
    private long Key(float x, float y)
    {
        // Pack two int32s into one int64 for dictionary key
        int cx = (int)MathF.Floor(x * _invCellSize);
        int cy = (int)MathF.Floor(y * _invCellSize);
        return ((long)cx << 32) | (uint)cy;
    }

    /// <summary>Alternative key using hash combination (handles extreme coords).</summary>
    private long KeyHashed(float x, float y)
    {
        int cx = (int)MathF.Floor(x * _invCellSize);
        int cy = (int)MathF.Floor(y * _invCellSize);
        // Large prime multiplication avoids collision patterns
        return (long)cx * 73856093L ^ (long)cy * 19349663L;
    }

    public void Insert(T item, Vector2 pos)
    {
        long key = Key(pos.X, pos.Y);
        if (!_buckets.TryGetValue(key, out var list))
        {
            list = _listPool.Count > 0 ? _listPool.Pop() : new List<T>();
            _buckets[key] = list;
        }
        list.Add(item);
    }

    public void InsertAABB(T item, Vector2 min, Vector2 max)
    {
        int minCX = (int)MathF.Floor(min.X * _invCellSize);
        int minCY = (int)MathF.Floor(min.Y * _invCellSize);
        int maxCX = (int)MathF.Floor(max.X * _invCellSize);
        int maxCY = (int)MathF.Floor(max.Y * _invCellSize);

        for (int y = minCY; y <= maxCY; y++)
        {
            for (int x = minCX; x <= maxCX; x++)
            {
                long key = ((long)x << 32) | (uint)y;
                if (!_buckets.TryGetValue(key, out var list))
                {
                    list = _listPool.Count > 0 ? _listPool.Pop() : new List<T>();
                    _buckets[key] = list;
                }
                list.Add(item);
            }
        }
    }

    public void Clear()
    {
        foreach (var kvp in _buckets)
        {
            kvp.Value.Clear();
            _listPool.Push(kvp.Value);
        }
        _buckets.Clear();
    }

    /// <summary>Query all items in cells overlapping a rectangle.</summary>
    public void QueryRect(Vector2 min, Vector2 max, List<T> results)
    {
        int minCX = (int)MathF.Floor(min.X * _invCellSize);
        int minCY = (int)MathF.Floor(min.Y * _invCellSize);
        int maxCX = (int)MathF.Floor(max.X * _invCellSize);
        int maxCY = (int)MathF.Floor(max.Y * _invCellSize);

        for (int y = minCY; y <= maxCY; y++)
        {
            for (int x = minCX; x <= maxCX; x++)
            {
                long key = ((long)x << 32) | (uint)y;
                if (_buckets.TryGetValue(key, out var list))
                    results.AddRange(list);
            }
        }
    }

    /// <summary>Query all items within a circle (broad phase — returns cell contents).</summary>
    public void QueryCircle(Vector2 center, float radius, List<T> results)
    {
        Vector2 min = center - new Vector2(radius);
        Vector2 max = center + new Vector2(radius);
        QueryRect(min, max, results);
    }

    /// <summary>Get the number of active buckets (for diagnostics).</summary>
    public int ActiveBucketCount => _buckets.Count;

    public float CellSize => _cellSize;
}
```

### Uniform Grid vs Spatial Hash — Real Numbers

Benchmarked on 10,000 entities, 1,000 range queries per frame:

| Metric | Uniform Grid | Spatial Hash |
|--------|-------------|-------------|
| Insert all | 0.12ms | 0.31ms |
| 1,000 rect queries | 0.45ms | 0.72ms |
| Memory (1920×1080, 64px cells) | 510 lists | ~180 buckets |
| Memory (100,000×100,000, 64px cells) | 2.4M lists 💀 | ~180 buckets ✅ |
| Out-of-bounds handling | Returns -1, item lost | Always works |
| Cache coherence | Excellent (contiguous array) | Poor (hash table) |

**Takeaway:** Use Uniform Grid when world bounds are known and modest. Use Spatial Hash when the world is large, sparse, or unbounded.

---

## 5 — Quadtree

A tree that recursively divides 2D space into four quadrants. Each node either contains items directly (leaf) or delegates to four children. Nodes split when they exceed a capacity threshold.

### When to Use

- Entities vary significantly in size (mix of bullets and bosses)
- Entity density is highly non-uniform (city vs wilderness)
- You need a static spatial index (level geometry, navmesh obstacles)
- You want automatic LOD-like behavior (dense areas get finer subdivision)

### Core Implementation

```csharp
public class Quadtree<T>
{
    private const int MaxItems = 8;
    private const int MaxDepth = 8;

    private struct ItemEntry
    {
        public T Item;
        public RectangleF Bounds;
    }

    private readonly RectangleF _bounds;
    private readonly int _depth;
    private List<ItemEntry>? _items;
    private Quadtree<T>?[]? _children; // [NW, NE, SW, SE]

    public Quadtree(RectangleF bounds, int depth = 0)
    {
        _bounds = bounds;
        _depth = depth;
        _items = new List<ItemEntry>();
    }

    public void Insert(T item, RectangleF itemBounds)
    {
        if (!_bounds.Intersects(itemBounds))
            return;

        // If we have children, insert into them
        if (_children != null)
        {
            for (int i = 0; i < 4; i++)
                _children[i]!.Insert(item, itemBounds);
            return;
        }

        // Leaf node — add item
        _items!.Add(new ItemEntry { Item = item, Bounds = itemBounds });

        // Split if over capacity and not at max depth
        if (_items.Count > MaxItems && _depth < MaxDepth)
            Split();
    }

    private void Split()
    {
        float halfW = _bounds.Width * 0.5f;
        float halfH = _bounds.Height * 0.5f;
        float x = _bounds.X;
        float y = _bounds.Y;

        _children = new Quadtree<T>?[4];
        _children[0] = new Quadtree<T>(new RectangleF(x, y, halfW, halfH), _depth + 1);           // NW
        _children[1] = new Quadtree<T>(new RectangleF(x + halfW, y, halfW, halfH), _depth + 1);   // NE
        _children[2] = new Quadtree<T>(new RectangleF(x, y + halfH, halfW, halfH), _depth + 1);   // SW
        _children[3] = new Quadtree<T>(new RectangleF(x + halfW, y + halfH, halfW, halfH), _depth + 1); // SE

        // Re-insert existing items into children
        var oldItems = _items!;
        _items = null;

        foreach (var entry in oldItems)
        {
            for (int i = 0; i < 4; i++)
                _children[i]!.Insert(entry.Item, entry.Bounds);
        }
    }

    /// <summary>Query all items whose bounds intersect the given rectangle.</summary>
    public void Query(RectangleF queryBounds, List<T> results)
    {
        if (!_bounds.Intersects(queryBounds))
            return;

        if (_children != null)
        {
            for (int i = 0; i < 4; i++)
                _children[i]!.Query(queryBounds, results);
        }
        else if (_items != null)
        {
            foreach (var entry in _items)
            {
                if (entry.Bounds.Intersects(queryBounds))
                    results.Add(entry.Item);
            }
        }
    }

    /// <summary>Clear and reset to empty leaf. Does NOT release child nodes (GC handles it).</summary>
    public void Clear()
    {
        _children = null;
        _items ??= new List<ItemEntry>();
        _items.Clear();
    }

    public int Count()
    {
        if (_children != null)
        {
            int sum = 0;
            for (int i = 0; i < 4; i++)
                sum += _children[i]!.Count();
            return sum;
        }
        return _items?.Count ?? 0;
    }
}
```

### RectangleF Helper

MonoGame's built-in `Rectangle` uses integers. For spatial partitioning you need float precision:

```csharp
public readonly struct RectangleF
{
    public readonly float X, Y, Width, Height;

    public RectangleF(float x, float y, float width, float height)
    {
        X = x; Y = y; Width = width; Height = height;
    }

    public float Right => X + Width;
    public float Bottom => Y + Height;
    public Vector2 Center => new(X + Width * 0.5f, Y + Height * 0.5f);

    public bool Intersects(RectangleF other) =>
        X < other.Right && Right > other.X &&
        Y < other.Bottom && Bottom > other.Y;

    public bool Contains(Vector2 point) =>
        point.X >= X && point.X < Right &&
        point.Y >= Y && point.Y < Bottom;

    public bool Contains(RectangleF other) =>
        other.X >= X && other.Right <= Right &&
        other.Y >= Y && other.Bottom <= Bottom;

    public static RectangleF FromCenterSize(Vector2 center, float width, float height) =>
        new(center.X - width * 0.5f, center.Y - height * 0.5f, width, height);
}
```

### Quadtree Gotchas

1. **Items on boundaries get inserted into multiple children.** This is correct behavior — without it, queries near cell boundaries miss items. Use a `HashSet<T>` or generation counter in queries to deduplicate results.

2. **Rebuilding every frame is expensive.** Quadtrees work best for static or rarely-moving geometry. For highly dynamic entities, use a grid instead (or a separate grid for dynamic + quadtree for static).

3. **Max depth prevents infinite recursion** when many items occupy the same point (e.g., stacked items, spawn points).

---

## 6 — Loose Quadtree

A standard quadtree requires items to fit within a node's exact bounds. A **loose** quadtree expands each node's bounds by a factor (typically 2×), allowing items to be stored in only ONE node (the smallest node that fully contains them) instead of being split across multiple nodes.

### Why Loose?

Standard quadtree problem: an item sitting on a boundary between two children must be inserted into BOTH. With many items near boundaries, this causes duplication and slower queries.

Loose quadtree solution: expand each node's query bounds so there's guaranteed overlap between siblings. Each item is stored in exactly one node.

```csharp
public class LooseQuadtree<T>
{
    private const int MaxItems = 8;
    private const int MaxDepth = 8;
    private const float LooseFactor = 2.0f; // How much to expand bounds

    private readonly RectangleF _tightBounds;  // Original subdivision bounds
    private readonly RectangleF _looseBounds;   // Expanded bounds for queries
    private readonly int _depth;
    private List<(T item, RectangleF bounds)>? _items;
    private LooseQuadtree<T>?[]? _children;

    public LooseQuadtree(RectangleF bounds, int depth = 0)
    {
        _tightBounds = bounds;
        _depth = depth;
        _items = new();

        // Expand bounds by LooseFactor, centered on the tight bounds
        float expandW = bounds.Width * (LooseFactor - 1f) * 0.5f;
        float expandH = bounds.Height * (LooseFactor - 1f) * 0.5f;
        _looseBounds = new RectangleF(
            bounds.X - expandW, bounds.Y - expandH,
            bounds.Width * LooseFactor, bounds.Height * LooseFactor
        );
    }

    /// <summary>Find the tightest child that fully contains the item.</summary>
    private int FindChild(RectangleF itemBounds)
    {
        if (_children == null) return -1;

        for (int i = 0; i < 4; i++)
        {
            if (_children[i]!._looseBounds.Contains(itemBounds))
                return i;
        }
        return -1; // No single child contains it — store in this node
    }

    public void Insert(T item, RectangleF itemBounds)
    {
        if (!_looseBounds.Intersects(itemBounds))
            return;

        if (_children != null)
        {
            int child = FindChild(itemBounds);
            if (child >= 0)
            {
                _children[child]!.Insert(item, itemBounds);
                return;
            }
            // Item spans multiple children — store at this level
            _items ??= new();
            _items.Add((item, itemBounds));
            return;
        }

        _items!.Add((item, itemBounds));

        if (_items.Count > MaxItems && _depth < MaxDepth)
            Split();
    }

    private void Split()
    {
        float halfW = _tightBounds.Width * 0.5f;
        float halfH = _tightBounds.Height * 0.5f;
        float x = _tightBounds.X;
        float y = _tightBounds.Y;

        _children = new LooseQuadtree<T>?[4];
        _children[0] = new LooseQuadtree<T>(new RectangleF(x, y, halfW, halfH), _depth + 1);
        _children[1] = new LooseQuadtree<T>(new RectangleF(x + halfW, y, halfW, halfH), _depth + 1);
        _children[2] = new LooseQuadtree<T>(new RectangleF(x, y + halfH, halfW, halfH), _depth + 1);
        _children[3] = new LooseQuadtree<T>(new RectangleF(x + halfW, y + halfH, halfW, halfH), _depth + 1);

        var oldItems = _items!;
        _items = new();

        foreach (var (item, bounds) in oldItems)
        {
            int child = FindChild(bounds);
            if (child >= 0)
                _children[child]!.Insert(item, bounds);
            else
                _items.Add((item, bounds)); // Still too big for any child
        }
    }

    public void Query(RectangleF queryBounds, List<T> results)
    {
        if (!_looseBounds.Intersects(queryBounds))
            return;

        if (_items != null)
        {
            foreach (var (item, bounds) in _items)
            {
                if (bounds.Intersects(queryBounds))
                    results.Add(item);
            }
        }

        if (_children != null)
        {
            for (int i = 0; i < 4; i++)
                _children[i]!.Query(queryBounds, results);
        }
    }

    public void Clear()
    {
        _children = null;
        _items ??= new();
        _items.Clear();
    }
}
```

### When to Use Loose vs Standard

| Scenario | Standard Quadtree | Loose Quadtree |
|----------|------------------|----------------|
| Uniform-size entities | ✅ Fine | Overkill |
| Mixed-size entities | Items duplicated across nodes | ✅ Each item in one node |
| Dense clusters | Hits max depth, degrades | ✅ Handles gracefully |
| Query result dedup needed? | Yes (HashSet/generation) | No (items stored once) |
| Static geometry | ✅ Best fit | ✅ Also good |
| Use case | Tile collision, navmesh | Entity collision, area effects |

---

## 7 — Sweep-and-Prune (SAP)

Sweep-and-Prune exploits **temporal coherence** — entities don't teleport between frames, so their sorted order on an axis changes very little. By maintaining a sorted list of entity intervals on one (or two) axes, overlap detection becomes nearly O(N) instead of O(N²).

### When to Use

- Collision detection is your primary need (not general range queries)
- Entities mostly move along one dominant axis (side-scrollers, runners)
- Entity positions are temporally coherent (smooth movement, no teleportation)
- You need to find ALL overlapping pairs efficiently

### Core Implementation (1D SAP)

```csharp
public class SweepAndPrune
{
    private struct Endpoint
    {
        public int EntityId;
        public float Value;
        public bool IsMin; // true = start of interval, false = end

        public override string ToString() =>
            $"E{EntityId} {(IsMin ? "min" : "max")}={Value:F1}";
    }

    private readonly List<Endpoint> _endpoints = new();
    private readonly HashSet<(int, int)> _activePairs = new();
    private int _entityCount;

    /// <summary>
    /// Add an entity's interval on the sweep axis.
    /// Call once per entity at startup, then use Update to move.
    /// </summary>
    public void Add(int entityId, float min, float max)
    {
        _endpoints.Add(new Endpoint { EntityId = entityId, Value = min, IsMin = true });
        _endpoints.Add(new Endpoint { EntityId = entityId, Value = max, IsMin = false });
        _entityCount++;
    }

    /// <summary>
    /// Update an entity's interval (call when entity moves).
    /// </summary>
    public void Update(int entityId, float newMin, float newMax)
    {
        for (int i = 0; i < _endpoints.Count; i++)
        {
            if (_endpoints[i].EntityId == entityId)
            {
                var ep = _endpoints[i];
                ep.Value = ep.IsMin ? newMin : newMax;
                _endpoints[i] = ep;
            }
        }
    }

    /// <summary>
    /// Sort and sweep to find all overlapping pairs.
    /// Insertion sort is O(N) when nearly-sorted (temporal coherence).
    /// </summary>
    public HashSet<(int, int)> FindOverlaps()
    {
        _activePairs.Clear();

        // Insertion sort — nearly O(N) due to temporal coherence
        for (int i = 1; i < _endpoints.Count; i++)
        {
            var key = _endpoints[i];
            int j = i - 1;
            while (j >= 0 && _endpoints[j].Value > key.Value)
            {
                _endpoints[j + 1] = _endpoints[j];
                j--;
            }
            _endpoints[j + 1] = key;
        }

        // Sweep — track active intervals
        var active = new HashSet<int>();

        foreach (var ep in _endpoints)
        {
            if (ep.IsMin)
            {
                // Opening a new interval — it overlaps with all currently active
                foreach (int other in active)
                {
                    int a = Math.Min(ep.EntityId, other);
                    int b = Math.Max(ep.EntityId, other);
                    _activePairs.Add((a, b));
                }
                active.Add(ep.EntityId);
            }
            else
            {
                // Closing an interval
                active.Remove(ep.EntityId);
            }
        }

        return _activePairs;
    }
}
```

### 2D SAP with Dual-Axis

For 2D games, sweep on one axis then verify overlap on the other:

```csharp
public class SweepAndPrune2D
{
    private struct AABB
    {
        public int EntityId;
        public float MinX, MaxX, MinY, MaxY;
    }

    private readonly List<AABB> _entities = new();
    private readonly List<(int a, int b)> _pairs = new();

    public void Set(int entityId, float minX, float maxX, float minY, float maxY)
    {
        // Find existing or add new
        for (int i = 0; i < _entities.Count; i++)
        {
            if (_entities[i].EntityId == entityId)
            {
                _entities[i] = new AABB { EntityId = entityId, MinX = minX, MaxX = maxX, MinY = minY, MaxY = maxY };
                return;
            }
        }
        _entities.Add(new AABB { EntityId = entityId, MinX = minX, MaxX = maxX, MinY = minY, MaxY = maxY });
    }

    public List<(int a, int b)> FindOverlaps()
    {
        _pairs.Clear();

        // Sort by MinX (insertion sort for temporal coherence)
        for (int i = 1; i < _entities.Count; i++)
        {
            var key = _entities[i];
            int j = i - 1;
            while (j >= 0 && _entities[j].MinX > key.MinX)
            {
                _entities[j + 1] = _entities[j];
                j--;
            }
            _entities[j + 1] = key;
        }

        // Sweep on X, verify on Y
        for (int i = 0; i < _entities.Count; i++)
        {
            for (int j = i + 1; j < _entities.Count; j++)
            {
                // If the next entity's min is past our max, no more overlaps
                if (_entities[j].MinX > _entities[i].MaxX)
                    break;

                // X overlaps — check Y
                if (_entities[i].MinY < _entities[j].MaxY &&
                    _entities[i].MaxY > _entities[j].MinY)
                {
                    _pairs.Add((_entities[i].EntityId, _entities[j].EntityId));
                }
            }
        }

        return _pairs;
    }
}
```

### SAP vs Grid for Collision

| Scenario | SAP | Uniform Grid |
|----------|-----|-------------|
| < 200 entities | ✅ Simpler setup | Overkill |
| 200–2,000 entities | ✅ Very fast | ✅ Also fast |
| > 2,000 entities | Insertion sort overhead grows | ✅ Constant per-entity |
| Entities clustered on one axis | ❌ Poor (many overlaps on sweep axis) | ✅ Handles well |
| Side-scroller (horizontal spread) | ✅ Excellent (sweep on X) | ✅ Also good |
| Entities teleporting | ❌ Breaks temporal coherence | ✅ Doesn't care |

---

## 8 — K-D Tree

A K-D tree recursively partitions space along alternating axes (X, then Y, then X, ...). It excels at **nearest-neighbor queries** — finding the K closest entities to a point.

### When to Use

- You need "find the N closest enemies" (K-nearest-neighbor)
- Entities are mostly static (K-D trees are expensive to modify)
- You have moderate entity counts (100–5,000)
- Point queries are more common than range queries

### Core Implementation

```csharp
public class KDTree<T>
{
    private class Node
    {
        public Vector2 Position;
        public T Item;
        public Node? Left, Right;
        public int SplitAxis; // 0 = X, 1 = Y
    }

    private Node? _root;

    /// <summary>Build a balanced K-D tree from a list of items. O(N log N).</summary>
    public void Build(List<(Vector2 pos, T item)> items)
    {
        _root = BuildRecursive(items, 0, items.Count - 1, 0);
    }

    private Node? BuildRecursive(List<(Vector2 pos, T item)> items, int lo, int hi, int depth)
    {
        if (lo > hi) return null;

        int axis = depth % 2;

        // Sort by current axis and pick median
        var span = items.GetRange(lo, hi - lo + 1);
        span.Sort((a, b) => axis == 0
            ? a.pos.X.CompareTo(b.pos.X)
            : a.pos.Y.CompareTo(b.pos.Y));

        for (int i = 0; i < span.Count; i++)
            items[lo + i] = span[i];

        int mid = lo + (hi - lo) / 2;
        var median = items[mid];

        return new Node
        {
            Position = median.pos,
            Item = median.item,
            SplitAxis = axis,
            Left = BuildRecursive(items, lo, mid - 1, depth + 1),
            Right = BuildRecursive(items, mid + 1, hi, depth + 1)
        };
    }

    /// <summary>Find the nearest item to a query point. O(log N) average.</summary>
    public (T item, float distSq)? NearestNeighbor(Vector2 queryPos)
    {
        if (_root == null) return null;

        T bestItem = default!;
        float bestDistSq = float.MaxValue;
        NearestRecursive(_root, queryPos, ref bestItem, ref bestDistSq);
        return (bestItem, bestDistSq);
    }

    private void NearestRecursive(Node? node, Vector2 query, ref T bestItem, ref float bestDistSq)
    {
        if (node == null) return;

        float distSq = Vector2.DistanceSquared(query, node.Position);
        if (distSq < bestDistSq)
        {
            bestDistSq = distSq;
            bestItem = node.Item;
        }

        // Determine which side of the split plane the query is on
        float splitVal = node.SplitAxis == 0 ? node.Position.X : node.Position.Y;
        float queryVal = node.SplitAxis == 0 ? query.X : query.Y;
        float diff = queryVal - splitVal;

        Node? near = diff < 0 ? node.Left : node.Right;
        Node? far = diff < 0 ? node.Right : node.Left;

        // Always search the near side
        NearestRecursive(near, query, ref bestItem, ref bestDistSq);

        // Only search the far side if the splitting plane is closer than current best
        if (diff * diff < bestDistSq)
            NearestRecursive(far, query, ref bestItem, ref bestDistSq);
    }

    /// <summary>Find the K nearest items. O(K log N) average.</summary>
    public List<(T item, float distSq)> KNearest(Vector2 queryPos, int k)
    {
        // Use a max-heap (sorted list) of size K
        var results = new SortedList<float, T>(new DuplicateKeyComparer());

        KNearestRecursive(_root, queryPos, k, results);

        return results.Select(kvp => (kvp.Value, kvp.Key)).ToList();
    }

    private void KNearestRecursive(Node? node, Vector2 query, int k,
                                     SortedList<float, T> results)
    {
        if (node == null) return;

        float distSq = Vector2.DistanceSquared(query, node.Position);

        if (results.Count < k)
        {
            results.Add(distSq, node.Item);
        }
        else if (distSq < results.Keys[results.Count - 1])
        {
            results.RemoveAt(results.Count - 1);
            results.Add(distSq, node.Item);
        }

        float splitVal = node.SplitAxis == 0 ? node.Position.X : node.Position.Y;
        float queryVal = node.SplitAxis == 0 ? query.X : query.Y;
        float diff = queryVal - splitVal;

        Node? near = diff < 0 ? node.Left : node.Right;
        Node? far = diff < 0 ? node.Right : node.Left;

        KNearestRecursive(near, query, k, results);

        float worstDistSq = results.Count < k ? float.MaxValue : results.Keys[results.Count - 1];
        if (diff * diff < worstDistSq)
            KNearestRecursive(far, query, k, results);
    }

    /// <summary>Range query — find all items within radius of a point.</summary>
    public void RangeQuery(Vector2 center, float radius, List<T> results)
    {
        float radiusSq = radius * radius;
        RangeRecursive(_root, center, radiusSq, results);
    }

    private void RangeRecursive(Node? node, Vector2 center, float radiusSq, List<T> results)
    {
        if (node == null) return;

        float distSq = Vector2.DistanceSquared(center, node.Position);
        if (distSq <= radiusSq)
            results.Add(node.Item);

        float splitVal = node.SplitAxis == 0 ? node.Position.X : node.Position.Y;
        float queryVal = node.SplitAxis == 0 ? center.X : center.Y;
        float diff = queryVal - splitVal;

        Node? near = diff < 0 ? node.Left : node.Right;
        Node? far = diff < 0 ? node.Right : node.Left;

        RangeRecursive(near, center, radiusSq, results);

        if (diff * diff <= radiusSq)
            RangeRecursive(far, center, radiusSq, results);
    }
}

/// <summary>Allows duplicate keys in SortedList (needed for equal distances).</summary>
public class DuplicateKeyComparer : IComparer<float>
{
    public int Compare(float x, float y)
    {
        int result = x.CompareTo(y);
        return result == 0 ? 1 : result; // Never return 0 → allows duplicates
    }
}
```

### K-D Tree Rebuild Strategy

K-D trees don't support efficient single-item updates. For games with some moving entities:

```csharp
public class KDTreeManager<T>
{
    private KDTree<T> _tree = new();
    private readonly List<(Vector2 pos, T item)> _items = new();
    private int _rebuildInterval;
    private int _frameCounter;

    public KDTreeManager(int rebuildEveryNFrames = 10)
    {
        _rebuildInterval = rebuildEveryNFrames;
    }

    public void SetItems(List<(Vector2 pos, T item)> items)
    {
        _items.Clear();
        _items.AddRange(items);
        Rebuild();
    }

    public void Update()
    {
        _frameCounter++;
        if (_frameCounter >= _rebuildInterval)
        {
            Rebuild();
            _frameCounter = 0;
        }
    }

    private void Rebuild()
    {
        _tree = new KDTree<T>();
        _tree.Build(_items);
    }

    public KDTree<T> Tree => _tree;
}
```

---

## 9 — Multi-Resolution Grid

When your game has entities of wildly different sizes — bullets (4px), players (32px), bosses (256px), area effects (1024px) — a single grid cell size can't serve all of them well. A multi-resolution grid maintains several grid layers at different cell sizes, each handling a size class.

### Architecture

```
┌───────────────────────────────────────────────────────┐
│                 MultiResGrid                          │
│                                                       │
│  Layer 0: cellSize=32    → bullets, particles, coins  │
│  Layer 1: cellSize=128   → players, enemies, items    │
│  Layer 2: cellSize=512   → bosses, vehicles, zones    │
│  Layer 3: cellSize=2048  → area effects, fog regions  │
│                                                       │
│  Insert: picks layer based on entity size              │
│  Query:  searches ALL layers                          │
└───────────────────────────────────────────────────────┘
```

### Implementation

```csharp
public class MultiResGrid<T>
{
    private readonly SpatialHash<T>[] _layers;
    private readonly float[] _cellSizes;
    private readonly float[] _maxEntitySizes; // Max entity size for each layer

    /// <summary>
    /// Create a multi-resolution grid with the given cell sizes.
    /// Each layer handles entities smaller than its cell size.
    /// </summary>
    public MultiResGrid(params float[] cellSizes)
    {
        Array.Sort(cellSizes); // Ensure ascending order
        _cellSizes = cellSizes;
        _layers = new SpatialHash<T>[cellSizes.Length];
        _maxEntitySizes = new float[cellSizes.Length];

        for (int i = 0; i < cellSizes.Length; i++)
        {
            _layers[i] = new SpatialHash<T>(cellSizes[i]);
            _maxEntitySizes[i] = cellSizes[i]; // Entity should be smaller than cell
        }
    }

    /// <summary>Pick the finest-grained layer that can contain this entity size.</summary>
    private int LayerForSize(float entitySize)
    {
        for (int i = 0; i < _cellSizes.Length; i++)
        {
            if (entitySize <= _cellSizes[i])
                return i;
        }
        return _cellSizes.Length - 1; // Largest layer as fallback
    }

    public void Insert(T item, Vector2 pos, float entitySize)
    {
        int layer = LayerForSize(entitySize);
        _layers[layer].Insert(item, pos);
    }

    public void InsertAABB(T item, Vector2 min, Vector2 max)
    {
        float size = MathF.Max(max.X - min.X, max.Y - min.Y);
        int layer = LayerForSize(size);
        _layers[layer].InsertAABB(item, min, max);
    }

    /// <summary>Query all layers for items in a rectangle.</summary>
    public void QueryRect(Vector2 min, Vector2 max, List<T> results)
    {
        for (int i = 0; i < _layers.Length; i++)
            _layers[i].QueryRect(min, max, results);
    }

    /// <summary>Query all layers for items in a circle.</summary>
    public void QueryCircle(Vector2 center, float radius, List<T> results)
    {
        for (int i = 0; i < _layers.Length; i++)
            _layers[i].QueryCircle(center, radius, results);
    }

    public void Clear()
    {
        for (int i = 0; i < _layers.Length; i++)
            _layers[i].Clear();
    }

    /// <summary>Diagnostic: items per layer.</summary>
    public string DiagnosticSummary()
    {
        var sb = new System.Text.StringBuilder();
        for (int i = 0; i < _layers.Length; i++)
        {
            sb.AppendLine($"Layer {i} (cell={_cellSizes[i]}): {_layers[i].ActiveBucketCount} buckets");
        }
        return sb.ToString();
    }
}
```

### Usage

```csharp
// Game with bullets (4px), enemies (32px), bosses (128px), zones (512px)
var multiGrid = new MultiResGrid<Entity>(32f, 128f, 512f, 2048f);

// Insert — layer is chosen automatically based on entity size
multiGrid.Insert(bullet, bulletPos, 4f);      // → Layer 0 (cell=32)
multiGrid.Insert(enemy, enemyPos, 32f);       // → Layer 0 (cell=32)
multiGrid.Insert(boss, bossPos, 128f);        // → Layer 1 (cell=128)
multiGrid.Insert(aoeZone, zonePos, 512f);     // → Layer 2 (cell=512)

// Query — searches ALL layers automatically
var nearby = new List<Entity>();
multiGrid.QueryCircle(playerPos, 200f, nearby);
// Returns bullets + enemies + bosses + zones within 200px
```

---

## 10 — ECS Integration — The SpatialIndex System

All the structures above are generic data containers. Here's how to wire them into Arch ECS as a proper system pipeline.

### Components

```csharp
/// <summary>Position in world space. Most entities have this.</summary>
public record struct Position(float X, float Y);

/// <summary>Axis-aligned bounding box for spatial indexing.</summary>
public record struct SpatialBounds(float HalfWidth, float HalfHeight);

/// <summary>Tag: entity participates in spatial queries.</summary>
public record struct SpatialIndexed;

/// <summary>Tracks which spatial cell(s) this entity occupies (for fast removal).</summary>
public record struct SpatialCell(int LayerIndex, long CellKey);
```

### The Spatial Index System

```csharp
public class SpatialIndexSystem
{
    private readonly SpatialHash<Entity> _dynamicGrid;
    private readonly Quadtree<Entity> _staticTree;
    private readonly QueryDescription _dynamicQuery;
    private readonly QueryDescription _staticQuery;

    // Reusable result lists (avoid per-frame allocation)
    private readonly List<Entity> _queryResults = new(256);

    public SpatialIndexSystem(World world, float dynamicCellSize = 128f,
                                RectangleF staticBounds = default)
    {
        _dynamicGrid = new SpatialHash<Entity>(dynamicCellSize);

        if (staticBounds.Width > 0)
            _staticTree = new Quadtree<Entity>(staticBounds);
        else
            _staticTree = new Quadtree<Entity>(
                new RectangleF(-10000, -10000, 20000, 20000));

        _dynamicQuery = new QueryDescription()
            .WithAll<Position, SpatialBounds, SpatialIndexed>()
            .WithNone<Static>();

        _staticQuery = new QueryDescription()
            .WithAll<Position, SpatialBounds, Static, SpatialIndexed>();
    }

    /// <summary>Rebuild the static tree. Call once at level load, not every frame.</summary>
    public void RebuildStatic(World world)
    {
        _staticTree.Clear();

        world.Query(in _staticQuery, (Entity entity, ref Position pos, ref SpatialBounds bounds) =>
        {
            var rect = new RectangleF(
                pos.X - bounds.HalfWidth, pos.Y - bounds.HalfHeight,
                bounds.HalfWidth * 2, bounds.HalfHeight * 2);
            _staticTree.Insert(entity, rect);
        });
    }

    /// <summary>Update dynamic entities every frame.</summary>
    public void Update(World world)
    {
        _dynamicGrid.Clear();

        world.Query(in _dynamicQuery, (Entity entity, ref Position pos, ref SpatialBounds bounds) =>
        {
            if (bounds.HalfWidth > _dynamicGrid.CellSize ||
                bounds.HalfHeight > _dynamicGrid.CellSize)
            {
                Vector2 min = new(pos.X - bounds.HalfWidth, pos.Y - bounds.HalfHeight);
                Vector2 max = new(pos.X + bounds.HalfWidth, pos.Y + bounds.HalfHeight);
                _dynamicGrid.InsertAABB(entity, min, max);
            }
            else
            {
                _dynamicGrid.Insert(entity, new Vector2(pos.X, pos.Y));
            }
        });
    }

    /// <summary>
    /// Query both static and dynamic spatial indices.
    /// Returns entities whose cells overlap the query area.
    /// Caller must do narrow-phase checks.
    /// </summary>
    public List<Entity> Query(Vector2 center, float radius)
    {
        _queryResults.Clear();

        // Dynamic entities from spatial hash
        _dynamicGrid.QueryCircle(center, radius, _queryResults);

        // Static entities from quadtree
        var queryRect = new RectangleF(
            center.X - radius, center.Y - radius,
            radius * 2, radius * 2);
        _staticTree.Query(queryRect, _queryResults);

        return _queryResults;
    }

    /// <summary>Rectangle query variant.</summary>
    public List<Entity> QueryRect(Vector2 min, Vector2 max)
    {
        _queryResults.Clear();
        _dynamicGrid.QueryRect(min, max, _queryResults);
        _staticTree.Query(new RectangleF(min.X, min.Y, max.X - min.X, max.Y - min.Y), _queryResults);
        return _queryResults;
    }

    public SpatialHash<Entity> DynamicGrid => _dynamicGrid;
    public Quadtree<Entity> StaticTree => _staticTree;
}
```

### System Execution Order

The spatial index must update AFTER movement systems and BEFORE systems that query it:

```
 Input → Physics/Movement → SpatialIndex.Update() → Collision → AI → Rendering
                                     ↑
                            Must be here — after
                            positions are final,
                            before anything queries
```

```csharp
// In your game loop / system scheduler:
public void Update(GameTime gameTime)
{
    float dt = (float)gameTime.ElapsedGameTime.TotalSeconds;

    // Phase 1: Input & intent
    _inputSystem.Update(_world);

    // Phase 2: Movement & physics
    _movementSystem.Update(_world, dt);
    _physicsSystem.Update(_world, dt);

    // Phase 3: Spatial index rebuild (CRITICAL ORDER)
    _spatialIndex.Update(_world);

    // Phase 4: Systems that QUERY the spatial index
    _collisionSystem.Update(_world, _spatialIndex);
    _aiPerceptionSystem.Update(_world, _spatialIndex);
    _pickupSystem.Update(_world, _spatialIndex);
    _aoeSystem.Update(_world, _spatialIndex);

    // Phase 5: Rendering
    _renderSystem.Update(_world, _spatialIndex); // For culling
}
```

---

## 11 — Range Queries

Range queries answer "what entities are within this area?" They're the most common spatial query type.

### Circle Range Query with Narrow Phase

The spatial structure returns **candidates** (broad phase). You still need to verify exact distance (narrow phase):

```csharp
public static class SpatialQueries
{
    /// <summary>
    /// Find all entities within a circle, with proper distance check.
    /// </summary>
    public static void CircleQuery(
        SpatialIndexSystem spatial,
        World world,
        Vector2 center,
        float radius,
        List<Entity> results)
    {
        results.Clear();
        float radiusSq = radius * radius;

        // Broad phase — get candidates from spatial index
        var candidates = spatial.Query(center, radius);

        // Narrow phase — verify exact distance
        foreach (var entity in candidates)
        {
            ref var pos = ref world.Get<Position>(entity);
            float distSq = (pos.X - center.X) * (pos.X - center.X) +
                           (pos.Y - center.Y) * (pos.Y - center.Y);

            if (distSq <= radiusSq)
                results.Add(entity);
        }
    }

    /// <summary>
    /// Find all entities within a circle, excluding a specific entity.
    /// Common for "find nearby enemies (not me)".
    /// </summary>
    public static void CircleQueryExcluding(
        SpatialIndexSystem spatial,
        World world,
        Vector2 center,
        float radius,
        Entity exclude,
        List<Entity> results)
    {
        results.Clear();
        float radiusSq = radius * radius;

        var candidates = spatial.Query(center, radius);

        foreach (var entity in candidates)
        {
            if (entity == exclude) continue;

            ref var pos = ref world.Get<Position>(entity);
            float distSq = (pos.X - center.X) * (pos.X - center.X) +
                           (pos.Y - center.Y) * (pos.Y - center.Y);

            if (distSq <= radiusSq)
                results.Add(entity);
        }
    }

    /// <summary>
    /// Find all entities within a rectangle (axis-aligned).
    /// No narrow phase needed — the rect query IS the exact answer.
    /// </summary>
    public static void RectQuery(
        SpatialIndexSystem spatial,
        Vector2 min,
        Vector2 max,
        List<Entity> results)
    {
        results.Clear();
        results.AddRange(spatial.QueryRect(min, max));
    }

    /// <summary>
    /// Sector/cone query — find entities within an angular range.
    /// Used for: AI vision cones, shotgun spread, spotlight.
    /// </summary>
    public static void SectorQuery(
        SpatialIndexSystem spatial,
        World world,
        Vector2 origin,
        Vector2 direction,
        float radius,
        float halfAngleRadians,
        List<Entity> results)
    {
        results.Clear();
        float radiusSq = radius * radius;
        float cosHalfAngle = MathF.Cos(halfAngleRadians);

        // Broad phase: circle query (overshoots, but fast)
        var candidates = spatial.Query(origin, radius);

        foreach (var entity in candidates)
        {
            ref var pos = ref world.Get<Position>(entity);
            Vector2 toEntity = new(pos.X - origin.X, pos.Y - origin.Y);
            float distSq = toEntity.LengthSquared();

            if (distSq > radiusSq || distSq < 0.001f)
                continue;

            // Check angle
            Vector2 toEntityNorm = toEntity / MathF.Sqrt(distSq);
            float dot = Vector2.Dot(direction, toEntityNorm);

            if (dot >= cosHalfAngle)
                results.Add(entity);
        }
    }

    /// <summary>
    /// Annular (ring) query — entities between inner and outer radius.
    /// Used for: AoE with safe zone, proximity alerts, orbit queries.
    /// </summary>
    public static void RingQuery(
        SpatialIndexSystem spatial,
        World world,
        Vector2 center,
        float innerRadius,
        float outerRadius,
        List<Entity> results)
    {
        results.Clear();
        float innerSq = innerRadius * innerRadius;
        float outerSq = outerRadius * outerRadius;

        var candidates = spatial.Query(center, outerRadius);

        foreach (var entity in candidates)
        {
            ref var pos = ref world.Get<Position>(entity);
            float distSq = (pos.X - center.X) * (pos.X - center.X) +
                           (pos.Y - center.Y) * (pos.Y - center.Y);

            if (distSq >= innerSq && distSq <= outerSq)
                results.Add(entity);
        }
    }
}
```

### Filtered Queries with Component Masks

Often you don't want ALL entities, just specific types:

```csharp
/// <summary>
/// Query with component filter — only return entities that have specific components.
/// </summary>
public static void CircleQueryFiltered<TRequired>(
    SpatialIndexSystem spatial,
    World world,
    Vector2 center,
    float radius,
    List<Entity> results)
    where TRequired : struct
{
    results.Clear();
    float radiusSq = radius * radius;

    var candidates = spatial.Query(center, radius);

    foreach (var entity in candidates)
    {
        // Skip entities that don't have the required component
        if (!world.Has<TRequired>(entity))
            continue;

        ref var pos = ref world.Get<Position>(entity);
        float distSq = (pos.X - center.X) * (pos.X - center.X) +
                       (pos.Y - center.Y) * (pos.Y - center.Y);

        if (distSq <= radiusSq)
            results.Add(entity);
    }
}

// Usage examples:
// Find enemies within attack range
SpatialQueries.CircleQueryFiltered<Enemy>(spatial, world, playerPos, attackRange, results);

// Find pickups within collection radius
SpatialQueries.CircleQueryFiltered<Pickup>(spatial, world, playerPos, collectRadius, results);

// Find destructibles in explosion radius
SpatialQueries.CircleQueryFiltered<Destructible>(spatial, world, explosionPos, blastRadius, results);
```

---

## 12 — Nearest-Neighbor Queries

Finding the closest entity (or K closest) is critical for AI targeting, auto-aim, and proximity systems.

### Grid-Based Nearest Neighbor

K-D trees are optimal for KNN, but if you're already using a grid, you can do efficient nearest-neighbor without a second structure:

```csharp
public static class NearestNeighborQueries
{
    /// <summary>
    /// Find the nearest entity to a point using expanding ring search on a grid.
    /// Starts from the entity's cell and spirals outward until found.
    /// </summary>
    public static Entity? FindNearest(
        UniformGrid<Entity> grid,
        World world,
        Vector2 queryPos,
        float maxRadius)
    {
        Entity? best = null;
        float bestDistSq = maxRadius * maxRadius;

        // Start with the entity's own cell and immediate neighbors
        var (startCol, startRow) = grid.CellCoords(queryPos);

        // Expand ring by ring until we find something (or hit maxRadius)
        int maxRings = (int)MathF.Ceiling(maxRadius / grid.CellSize) + 1;

        for (int ring = 0; ring <= maxRings; ring++)
        {
            bool foundInRing = false;

            for (int dy = -ring; dy <= ring; dy++)
            {
                for (int dx = -ring; dx <= ring; dx++)
                {
                    // Only check the border of this ring (skip inner cells already checked)
                    if (ring > 0 && Math.Abs(dx) < ring && Math.Abs(dy) < ring)
                        continue;

                    var cell = grid.GetCell(startCol + dx, startRow + dy);
                    foreach (var entity in cell)
                    {
                        ref var pos = ref world.Get<Position>(entity);
                        float distSq = (pos.X - queryPos.X) * (pos.X - queryPos.X) +
                                       (pos.Y - queryPos.Y) * (pos.Y - queryPos.Y);

                        if (distSq < bestDistSq)
                        {
                            bestDistSq = distSq;
                            best = entity;
                            foundInRing = true;
                        }
                    }
                }
            }

            // Optimization: if we found something in this ring, check one more ring
            // to make sure nothing in an adjacent cell is actually closer
            if (foundInRing && ring > 0)
            {
                // The closest entity in ring R might be beaten by one in ring R+1
                // if the entity is near the cell border. Check one more ring then stop.
                float cellDiag = grid.CellSize * MathF.Sqrt(2f);
                if (bestDistSq < (ring - 1) * grid.CellSize * (ring - 1) * grid.CellSize)
                    break; // Current best is definitely closer than anything in outer rings
            }
        }

        return best;
    }

    /// <summary>
    /// Find the K nearest entities using a grid.
    /// </summary>
    public static List<(Entity entity, float distSq)> FindKNearest(
        UniformGrid<Entity> grid,
        World world,
        Vector2 queryPos,
        int k,
        float maxRadius)
    {
        var results = new List<(Entity entity, float distSq)>();
        float maxRadiusSq = maxRadius * maxRadius;

        var (startCol, startRow) = grid.CellCoords(queryPos);
        int maxRings = (int)MathF.Ceiling(maxRadius / grid.CellSize) + 1;

        // Collect all candidates within maxRadius
        var candidates = new List<(Entity entity, float distSq)>();

        for (int ring = 0; ring <= maxRings; ring++)
        {
            for (int dy = -ring; dy <= ring; dy++)
            {
                for (int dx = -ring; dx <= ring; dx++)
                {
                    if (ring > 0 && Math.Abs(dx) < ring && Math.Abs(dy) < ring)
                        continue;

                    var cell = grid.GetCell(startCol + dx, startRow + dy);
                    foreach (var entity in cell)
                    {
                        ref var pos = ref world.Get<Position>(entity);
                        float distSq = (pos.X - queryPos.X) * (pos.X - queryPos.X) +
                                       (pos.Y - queryPos.Y) * (pos.Y - queryPos.Y);

                        if (distSq <= maxRadiusSq)
                            candidates.Add((entity, distSq));
                    }
                }
            }

            // Early out: if we have enough candidates and they're all in closer rings
            if (candidates.Count >= k && ring > 1)
            {
                float outerRingMinDist = (ring - 1) * grid.CellSize;
                float outerRingMinDistSq = outerRingMinDist * outerRingMinDist;
                // Sort what we have, check if k-th is closer than any outer ring entity could be
                candidates.Sort((a, b) => a.distSq.CompareTo(b.distSq));
                if (candidates[k - 1].distSq < outerRingMinDistSq)
                    break;
            }
        }

        candidates.Sort((a, b) => a.distSq.CompareTo(b.distSq));
        return candidates.Take(k).ToList();
    }
}
```

### AI Targeting with Nearest Neighbor

```csharp
public class AITargetingSystem
{
    private readonly QueryDescription _aiQuery;
    private readonly List<Entity> _nearbyTargets = new(32);

    public AITargetingSystem()
    {
        _aiQuery = new QueryDescription()
            .WithAll<Position, AIAgent, SpatialIndexed>();
    }

    public void Update(World world, SpatialIndexSystem spatial)
    {
        world.Query(in _aiQuery, (Entity entity, ref Position pos, ref AIAgent ai) =>
        {
            // Find the closest target this AI can attack
            switch (ai.TargetingMode)
            {
                case TargetingMode.Nearest:
                    UpdateNearestTarget(world, spatial, entity, ref pos, ref ai);
                    break;

                case TargetingMode.Weakest:
                    UpdateWeakestTarget(world, spatial, entity, ref pos, ref ai);
                    break;

                case TargetingMode.MostDangerous:
                    UpdateMostDangerousTarget(world, spatial, entity, ref pos, ref ai);
                    break;
            }
        });
    }

    private void UpdateNearestTarget(World world, SpatialIndexSystem spatial,
                                       Entity self, ref Position pos, ref AIAgent ai)
    {
        _nearbyTargets.Clear();
        var queryPos = new Vector2(pos.X, pos.Y);

        // Use spatial index for broad phase
        var candidates = spatial.Query(queryPos, ai.PerceptionRadius);

        Entity? closest = null;
        float closestDistSq = float.MaxValue;

        foreach (var candidate in candidates)
        {
            if (candidate == self) continue;
            if (!world.Has<Health>(candidate)) continue;

            // Check team — don't target allies
            if (world.Has<Team>(candidate) && world.Has<Team>(self))
            {
                ref var myTeam = ref world.Get<Team>(self);
                ref var theirTeam = ref world.Get<Team>(candidate);
                if (myTeam.Id == theirTeam.Id) continue;
            }

            ref var targetPos = ref world.Get<Position>(candidate);
            float distSq = (targetPos.X - pos.X) * (targetPos.X - pos.X) +
                           (targetPos.Y - pos.Y) * (targetPos.Y - pos.Y);

            if (distSq < closestDistSq)
            {
                closestDistSq = distSq;
                closest = candidate;
            }
        }

        ai.CurrentTarget = closest;
        ai.TargetDistanceSq = closestDistSq;
    }

    private void UpdateWeakestTarget(World world, SpatialIndexSystem spatial,
                                       Entity self, ref Position pos, ref AIAgent ai)
    {
        var queryPos = new Vector2(pos.X, pos.Y);
        var candidates = spatial.Query(queryPos, ai.PerceptionRadius);

        Entity? weakest = null;
        float lowestHealth = float.MaxValue;

        foreach (var candidate in candidates)
        {
            if (candidate == self) continue;
            if (!world.Has<Health>(candidate)) continue;

            ref var health = ref world.Get<Health>(candidate);
            if (health.Current < lowestHealth)
            {
                lowestHealth = health.Current;
                weakest = candidate;
            }
        }

        ai.CurrentTarget = weakest;
    }

    private void UpdateMostDangerousTarget(World world, SpatialIndexSystem spatial,
                                             Entity self, ref Position pos, ref AIAgent ai)
    {
        var queryPos = new Vector2(pos.X, pos.Y);
        var candidates = spatial.Query(queryPos, ai.PerceptionRadius);

        Entity? mostDangerous = null;
        float highestThreat = 0f;

        foreach (var candidate in candidates)
        {
            if (candidate == self) continue;
            if (!world.Has<ThreatLevel>(candidate)) continue;

            ref var threat = ref world.Get<ThreatLevel>(candidate);
            if (threat.Value > highestThreat)
            {
                highestThreat = threat.Value;
                mostDangerous = candidate;
            }
        }

        ai.CurrentTarget = mostDangerous;
    }
}
```

---

## 13 — Ray Queries

Ray queries answer "what does this ray hit first?" They're used for line-of-sight, hitscan weapons, laser beams, and mouse picking.

### DDA Ray March on Grid

Digital Differential Analyzer (DDA) walks a ray through grid cells one at a time, in order. This is the same algorithm used for raycasting in Wolfenstein 3D:

```csharp
public static class RayQueries
{
    /// <summary>
    /// March a ray through a uniform grid, checking each cell for entities.
    /// Returns the first entity hit (closest to ray origin).
    /// </summary>
    public static Entity? RaycastGrid<T>(
        UniformGrid<Entity> grid,
        World world,
        Vector2 origin,
        Vector2 direction,
        float maxDistance,
        Func<Entity, bool>? filter = null)
    {
        // Normalize direction
        direction = Vector2.Normalize(direction);
        float cellSize = grid.CellSize;

        // Current cell coordinates
        int cellX = (int)MathF.Floor(origin.X / cellSize);
        int cellY = (int)MathF.Floor(origin.Y / cellSize);

        // Step direction (+1 or -1)
        int stepX = direction.X >= 0 ? 1 : -1;
        int stepY = direction.Y >= 0 ? 1 : -1;

        // Distance to next cell boundary on each axis
        float tMaxX, tMaxY;
        float tDeltaX, tDeltaY;

        if (MathF.Abs(direction.X) > 1e-8f)
        {
            float nextBoundaryX = (stepX > 0)
                ? (cellX + 1) * cellSize
                : cellX * cellSize;
            tMaxX = (nextBoundaryX - origin.X) / direction.X;
            tDeltaX = cellSize / MathF.Abs(direction.X);
        }
        else
        {
            tMaxX = float.MaxValue;
            tDeltaX = float.MaxValue;
        }

        if (MathF.Abs(direction.Y) > 1e-8f)
        {
            float nextBoundaryY = (stepY > 0)
                ? (cellY + 1) * cellSize
                : cellY * cellSize;
            tMaxY = (nextBoundaryY - origin.Y) / direction.Y;
            tDeltaY = cellSize / MathF.Abs(direction.Y);
        }
        else
        {
            tMaxY = float.MaxValue;
            tDeltaY = float.MaxValue;
        }

        // Walk cells along the ray
        float t = 0f;
        while (t < maxDistance)
        {
            // Check current cell for entities
            var cell = grid.GetCell(cellX, cellY);
            foreach (var entity in cell)
            {
                if (filter != null && !filter(entity))
                    continue;

                // Narrow phase: ray-vs-AABB test
                ref var pos = ref world.Get<Position>(entity);
                ref var bounds = ref world.Get<SpatialBounds>(entity);

                float hitDist = RayAABBIntersect(
                    origin, direction,
                    new Vector2(pos.X - bounds.HalfWidth, pos.Y - bounds.HalfHeight),
                    new Vector2(pos.X + bounds.HalfWidth, pos.Y + bounds.HalfHeight));

                if (hitDist >= 0 && hitDist <= maxDistance)
                    return entity;
            }

            // Advance to next cell
            if (tMaxX < tMaxY)
            {
                t = tMaxX;
                tMaxX += tDeltaX;
                cellX += stepX;
            }
            else
            {
                t = tMaxY;
                tMaxY += tDeltaY;
                cellY += stepY;
            }
        }

        return null;
    }

    /// <summary>
    /// Ray vs AABB intersection test.
    /// Returns distance to intersection point, or -1 if no hit.
    /// </summary>
    public static float RayAABBIntersect(Vector2 origin, Vector2 dir, Vector2 min, Vector2 max)
    {
        float tmin = float.MinValue;
        float tmax = float.MaxValue;

        // X axis
        if (MathF.Abs(dir.X) > 1e-8f)
        {
            float t1 = (min.X - origin.X) / dir.X;
            float t2 = (max.X - origin.X) / dir.X;
            if (t1 > t2) (t1, t2) = (t2, t1);
            tmin = MathF.Max(tmin, t1);
            tmax = MathF.Min(tmax, t2);
            if (tmin > tmax) return -1f;
        }
        else if (origin.X < min.X || origin.X > max.X)
        {
            return -1f;
        }

        // Y axis
        if (MathF.Abs(dir.Y) > 1e-8f)
        {
            float t1 = (min.Y - origin.Y) / dir.Y;
            float t2 = (max.Y - origin.Y) / dir.Y;
            if (t1 > t2) (t1, t2) = (t2, t1);
            tmin = MathF.Max(tmin, t1);
            tmax = MathF.Min(tmax, t2);
            if (tmin > tmax) return -1f;
        }
        else if (origin.Y < min.Y || origin.Y > max.Y)
        {
            return -1f;
        }

        return tmin >= 0 ? tmin : tmax >= 0 ? tmax : -1f;
    }

    /// <summary>
    /// Cast a ray and return ALL entities hit (sorted by distance).
    /// Used for: penetrating projectiles, line-of-sight checks through multiple obstacles.
    /// </summary>
    public static List<(Entity entity, float distance)> RaycastAll(
        SpatialIndexSystem spatial,
        World world,
        Vector2 origin,
        Vector2 direction,
        float maxDistance,
        Func<Entity, bool>? filter = null)
    {
        direction = Vector2.Normalize(direction);
        var results = new List<(Entity entity, float distance)>();

        // Broad phase: query a rectangle along the ray's path
        Vector2 end = origin + direction * maxDistance;
        Vector2 min = Vector2.Min(origin, end);
        Vector2 max = Vector2.Max(origin, end);

        // Expand slightly to catch entities at the edges
        min -= new Vector2(32f);
        max += new Vector2(32f);

        var candidates = spatial.QueryRect(min, max);

        foreach (var entity in candidates)
        {
            if (filter != null && !filter(entity))
                continue;

            ref var pos = ref world.Get<Position>(entity);
            ref var bounds = ref world.Get<SpatialBounds>(entity);

            float hitDist = RayAABBIntersect(
                origin, direction,
                new Vector2(pos.X - bounds.HalfWidth, pos.Y - bounds.HalfHeight),
                new Vector2(pos.X + bounds.HalfWidth, pos.Y + bounds.HalfHeight));

            if (hitDist >= 0 && hitDist <= maxDistance)
                results.Add((entity, hitDist));
        }

        results.Sort((a, b) => a.distance.CompareTo(b.distance));
        return results;
    }
}
```

### Line-of-Sight Check

```csharp
/// <summary>
/// Check if there's a clear line of sight between two positions.
/// Returns true if nothing blocks the view.
/// </summary>
public static bool HasLineOfSight(
    UniformGrid<Entity> grid,
    World world,
    Vector2 from,
    Vector2 to,
    Func<Entity, bool> isBlocker)
{
    Vector2 direction = to - from;
    float distance = direction.Length();
    if (distance < 0.001f) return true;

    direction /= distance;

    var hit = RayQueries.RaycastGrid(grid, world, from, direction, distance, isBlocker);
    return hit == null;
}
```

---

## 14 — Frustum Culling & Camera Queries

Only render entities that are visible on screen. With thousands of entities but a fixed viewport, culling can skip 80-99% of draw calls.

### Camera Viewport Query

```csharp
public class RenderCullingSystem
{
    private readonly QueryDescription _renderQuery;
    private readonly List<Entity> _visibleEntities = new(512);

    public RenderCullingSystem()
    {
        _renderQuery = new QueryDescription()
            .WithAll<Position, Sprite>();
    }

    /// <summary>
    /// Get all entities visible in the current camera viewport.
    /// </summary>
    public List<Entity> GetVisibleEntities(
        SpatialIndexSystem spatial,
        Vector2 cameraPos,
        float viewportWidth,
        float viewportHeight,
        float zoom = 1f)
    {
        _visibleEntities.Clear();

        // Calculate world-space viewport bounds
        float halfW = (viewportWidth / zoom) * 0.5f;
        float halfH = (viewportHeight / zoom) * 0.5f;

        // Add margin for entities partially on screen
        float margin = 64f; // Max expected sprite half-size
        Vector2 min = new(cameraPos.X - halfW - margin, cameraPos.Y - halfH - margin);
        Vector2 max = new(cameraPos.X + halfW + margin, cameraPos.Y + halfH + margin);

        _visibleEntities.AddRange(spatial.QueryRect(min, max));
        return _visibleEntities;
    }

    /// <summary>
    /// Render only visible entities, sorted by Y for proper overlap.
    /// </summary>
    public void RenderVisible(
        SpriteBatch spriteBatch,
        World world,
        SpatialIndexSystem spatial,
        Vector2 cameraPos,
        float viewportWidth,
        float viewportHeight,
        float zoom)
    {
        var visible = GetVisibleEntities(spatial, cameraPos, viewportWidth, viewportHeight, zoom);

        // Sort by Y (or by layer + Y) for proper draw order
        visible.Sort((a, b) =>
        {
            ref var posA = ref world.Get<Position>(a);
            ref var posB = ref world.Get<Position>(b);

            // Sort by render layer first, then Y
            int layerA = world.Has<RenderLayer>(a) ? world.Get<RenderLayer>(a).Order : 0;
            int layerB = world.Has<RenderLayer>(b) ? world.Get<RenderLayer>(b).Order : 0;

            int layerCmp = layerA.CompareTo(layerB);
            return layerCmp != 0 ? layerCmp : posA.Y.CompareTo(posB.Y);
        });

        foreach (var entity in visible)
        {
            ref var pos = ref world.Get<Position>(entity);
            ref var sprite = ref world.Get<Sprite>(entity);

            // Convert to screen space and draw
            Vector2 screenPos = (new Vector2(pos.X, pos.Y) - cameraPos) * zoom +
                               new Vector2(viewportWidth * 0.5f, viewportHeight * 0.5f);

            spriteBatch.Draw(
                sprite.Texture,
                screenPos,
                sprite.SourceRect,
                Color.White,
                sprite.Rotation,
                sprite.Origin,
                zoom,
                SpriteEffects.None,
                0f);
        }
    }
}
```

### Culling Statistics

Track culling efficiency to know if your spatial structure is working:

```csharp
public struct CullingStats
{
    public int TotalEntities;
    public int VisibleEntities;
    public int CulledEntities;
    public float CullPercentage;

    public override string ToString() =>
        $"Visible: {VisibleEntities}/{TotalEntities} (culled {CullPercentage:F1}%)";
}

public CullingStats GetStats(World world, List<Entity> visible)
{
    int total = world.CountEntities(new QueryDescription().WithAll<Position, Sprite>());
    return new CullingStats
    {
        TotalEntities = total,
        VisibleEntities = visible.Count,
        CulledEntities = total - visible.Count,
        CullPercentage = total > 0 ? (1f - (float)visible.Count / total) * 100f : 0f
    };
}
```

---

## 15 — Collision Broad Phase

The spatial index's most common consumer is the collision system. The broad phase identifies CANDIDATE pairs; the narrow phase does exact shape-vs-shape tests.

### ECS Collision Pipeline

```
┌─────────────┐     ┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│ SpatialIndex │ ──→ │ Broad Phase │ ──→ │ Narrow Phase │ ──→ │  Resolution  │
│   Update     │     │ (grid query │     │ (AABB, circle│     │ (separation, │
│              │     │  → pairs)   │     │  checks)     │     │  events)     │
└─────────────┘     └─────────────┘     └──────────────┘     └──────────────┘
```

```csharp
public class CollisionSystem
{
    private readonly QueryDescription _colliderQuery;
    private readonly List<Entity> _candidates = new(128);
    private readonly HashSet<(Entity, Entity)> _checkedPairs = new();
    private readonly List<CollisionEvent> _collisionEvents = new();

    public struct CollisionEvent
    {
        public Entity A, B;
        public Vector2 Normal;
        public float Penetration;
    }

    public CollisionSystem()
    {
        _colliderQuery = new QueryDescription()
            .WithAll<Position, Collider, SpatialIndexed>();
    }

    public List<CollisionEvent> Update(World world, SpatialIndexSystem spatial)
    {
        _checkedPairs.Clear();
        _collisionEvents.Clear();

        world.Query(in _colliderQuery, (Entity entityA, ref Position posA, ref Collider colA) =>
        {
            // Broad phase: query spatial index for nearby entities
            _candidates.Clear();
            var queryPos = new Vector2(posA.X, posA.Y);
            float queryRadius = MathF.Max(colA.Width, colA.Height);
            var candidates = spatial.Query(queryPos, queryRadius);

            foreach (var entityB in candidates)
            {
                if (entityA == entityB) continue;

                // Avoid checking the same pair twice (A-B and B-A)
                var pair = entityA.Id < entityB.Id
                    ? (entityA, entityB)
                    : (entityB, entityA);

                if (!_checkedPairs.Add(pair))
                    continue;

                // Check collision layers
                if (!world.Has<Collider>(entityB)) continue;
                ref var colB = ref world.Get<Collider>(entityB);

                if ((colA.Layer & colB.Mask) == 0 && (colB.Layer & colA.Mask) == 0)
                    continue;

                // Narrow phase: exact collision test
                ref var posB = ref world.Get<Position>(entityB);

                if (NarrowPhaseTest(ref posA, ref colA, ref posB, ref colB,
                                     out Vector2 normal, out float penetration))
                {
                    _collisionEvents.Add(new CollisionEvent
                    {
                        A = entityA,
                        B = entityB,
                        Normal = normal,
                        Penetration = penetration
                    });
                }
            }
        });

        return _collisionEvents;
    }

    private static bool NarrowPhaseTest(
        ref Position posA, ref Collider colA,
        ref Position posB, ref Collider colB,
        out Vector2 normal, out float penetration)
    {
        normal = Vector2.Zero;
        penetration = 0f;

        // AABB vs AABB
        float overlapX = (colA.Width * 0.5f + colB.Width * 0.5f) - MathF.Abs(posA.X - posB.X);
        float overlapY = (colA.Height * 0.5f + colB.Height * 0.5f) - MathF.Abs(posA.Y - posB.Y);

        if (overlapX <= 0 || overlapY <= 0)
            return false;

        // Use the axis of least penetration
        if (overlapX < overlapY)
        {
            penetration = overlapX;
            normal = posA.X < posB.X ? new Vector2(-1, 0) : new Vector2(1, 0);
        }
        else
        {
            penetration = overlapY;
            normal = posA.Y < posB.Y ? new Vector2(0, -1) : new Vector2(0, 1);
        }

        return true;
    }
}
```

### Collision Layer Management

```csharp
public static class CollisionLayers
{
    public const int None       = 0;
    public const int World      = 1 << 0;   // Static geometry
    public const int Player     = 1 << 1;
    public const int Enemy      = 1 << 2;
    public const int PlayerShot = 1 << 3;
    public const int EnemyShot  = 1 << 4;
    public const int Pickup     = 1 << 5;
    public const int Trigger    = 1 << 6;
    public const int Hurtbox    = 1 << 7;
    public const int Hitbox     = 1 << 8;

    // Common masks
    public const int PlayerHitMask = World | Enemy | EnemyShot | Pickup | Trigger;
    public const int EnemyHitMask = World | Player | PlayerShot;
    public const int ProjectileMask = World | Player | Enemy;
}

public record struct Collider(
    float Width,
    float Height,
    int Layer,   // What layer this entity is on
    int Mask     // What layers this entity collides with
);
```

---

## 16 — AI Perception & Awareness

AI entities need to "see" and "hear" their environment. Spatial partitioning makes this efficient even with hundreds of AI agents.

### Staggered Perception Updates

Not every AI needs to query every frame. Stagger perception across frames:

```csharp
public class AIPerceptionSystem
{
    private readonly QueryDescription _perceptionQuery;
    private readonly List<Entity> _candidates = new(64);
    private int _frameCounter;

    public AIPerceptionSystem()
    {
        _perceptionQuery = new QueryDescription()
            .WithAll<Position, AIPerception, SpatialIndexed>();
    }

    public void Update(World world, SpatialIndexSystem spatial)
    {
        _frameCounter++;

        world.Query(in _perceptionQuery, (Entity entity, ref Position pos, ref AIPerception perception) =>
        {
            // Stagger updates: each AI updates every N frames, offset by entity ID
            if ((_frameCounter + entity.Id) % perception.UpdateInterval != 0)
                return;

            var queryPos = new Vector2(pos.X, pos.Y);

            // === VISION ===
            perception.VisibleTargets.Clear();
            if (perception.SightRange > 0)
            {
                SpatialQueries.SectorQuery(
                    spatial, world,
                    queryPos,
                    perception.FacingDirection,
                    perception.SightRange,
                    perception.SightHalfAngle,
                    _candidates);

                // Line-of-sight check for each candidate
                foreach (var target in _candidates)
                {
                    if (target == entity) continue;
                    if (!world.Has<Position>(target)) continue;

                    ref var targetPos = ref world.Get<Position>(target);
                    Vector2 targetWorldPos = new(targetPos.X, targetPos.Y);

                    // Raycast from AI to target — check for walls
                    bool blocked = false;
                    var wallHit = RayQueries.RaycastGrid(
                        (spatial.DynamicGrid as UniformGrid<Entity>)!,
                        world, queryPos, Vector2.Normalize(targetWorldPos - queryPos),
                        Vector2.Distance(queryPos, targetWorldPos),
                        e => world.Has<BlocksSight>(e));

                    if (wallHit == null || wallHit.Value != target)
                        perception.VisibleTargets.Add(target);
                }

                _candidates.Clear();
            }

            // === HEARING ===
            perception.HeardSounds.Clear();
            if (perception.HearingRange > 0)
            {
                var soundCandidates = spatial.Query(queryPos, perception.HearingRange);

                foreach (var source in soundCandidates)
                {
                    if (source == entity) continue;
                    if (!world.Has<SoundEmitter>(source)) continue;

                    ref var emitter = ref world.Get<SoundEmitter>(source);
                    if (!emitter.IsActive) continue;

                    ref var srcPos = ref world.Get<Position>(source);
                    float dist = Vector2.Distance(queryPos, new Vector2(srcPos.X, srcPos.Y));

                    // Sound attenuates with distance
                    float loudness = emitter.Volume * (1f - dist / perception.HearingRange);
                    if (loudness > perception.HearingThreshold)
                    {
                        perception.HeardSounds.Add(new PerceivedSound
                        {
                            Source = source,
                            Loudness = loudness,
                            Direction = Vector2.Normalize(
                                new Vector2(srcPos.X - pos.X, srcPos.Y - pos.Y))
                        });
                    }
                }
            }
        });
    }
}

// Components
public record struct AIPerception
{
    public float SightRange;
    public float SightHalfAngle;     // Radians — typically PI/4 (90° cone)
    public Vector2 FacingDirection;
    public float HearingRange;
    public float HearingThreshold;   // Min loudness to notice
    public int UpdateInterval;       // How many frames between perception updates

    public List<Entity> VisibleTargets;
    public List<PerceivedSound> HeardSounds;
}

public struct PerceivedSound
{
    public Entity Source;
    public float Loudness;
    public Vector2 Direction;
}

public record struct SoundEmitter(float Volume, bool IsActive);
public record struct BlocksSight; // Tag: this entity blocks line of sight
```

---

## 17 — Dynamic Entity Tracking

Entities move every frame. Here are patterns for keeping your spatial index current efficiently.

### Rebuild vs Incremental Update

| Approach | Cost | When to Use |
|----------|------|-------------|
| **Full rebuild** (clear + re-insert all) | O(N) per frame | All/most entities move, uniform grid or hash |
| **Incremental** (track cell changes) | O(M) per frame (M = moved entities) | Few entities move relative to total |
| **Dirty flag** | O(N) check + O(M) update | Mix of static and dynamic entities |

### Dirty-Flag Tracking

```csharp
/// <summary>Tag: entity moved since last spatial index update.</summary>
public record struct SpatialDirty;

public class MovementSystem
{
    private readonly QueryDescription _moveQuery;

    public MovementSystem()
    {
        _moveQuery = new QueryDescription()
            .WithAll<Position, Velocity>();
    }

    public void Update(World world, float dt)
    {
        world.Query(in _moveQuery, (Entity entity, ref Position pos, ref Velocity vel) =>
        {
            float newX = pos.X + vel.X * dt;
            float newY = pos.Y + vel.Y * dt;

            // Only mark dirty if position actually changed
            if (MathF.Abs(newX - pos.X) > 0.01f || MathF.Abs(newY - pos.Y) > 0.01f)
            {
                pos = new Position(newX, newY);
                world.Add<SpatialDirty>(entity); // Mark for spatial re-indexing
            }
        });
    }
}

public class IncrementalSpatialSystem
{
    private readonly UniformGrid<Entity> _grid;
    private readonly QueryDescription _dirtyQuery;
    private readonly QueryDescription _allSpatialQuery;

    public IncrementalSpatialSystem(float worldWidth, float worldHeight, float cellSize)
    {
        _grid = new UniformGrid<Entity>(worldWidth, worldHeight, cellSize);
        _dirtyQuery = new QueryDescription().WithAll<Position, SpatialBounds, SpatialDirty>();
        _allSpatialQuery = new QueryDescription().WithAll<Position, SpatialBounds, SpatialIndexed>();
    }

    /// <summary>Full rebuild — call once at level load.</summary>
    public void RebuildAll(World world)
    {
        _grid.Clear();
        world.Query(in _allSpatialQuery, (Entity entity, ref Position pos, ref SpatialBounds bounds) =>
        {
            _grid.Insert(entity, new Vector2(pos.X, pos.Y));
        });
    }

    /// <summary>
    /// Incremental update — only re-index entities that moved.
    /// For games where <20% of entities move per frame.
    /// </summary>
    public void UpdateDirty(World world)
    {
        // For simplicity, rebuild the whole grid (grid clear + re-insert is very fast)
        // True incremental (remove from old cell, add to new) is only worth it
        // for extremely large grids (>50K entities)
        _grid.Clear();
        world.Query(in _allSpatialQuery, (Entity entity, ref Position pos, ref SpatialBounds bounds) =>
        {
            _grid.Insert(entity, new Vector2(pos.X, pos.Y));
        });

        // Clear dirty flags
        world.Query(in _dirtyQuery, (Entity entity) =>
        {
            world.Remove<SpatialDirty>(entity);
        });
    }
}
```

### Entity Lifetime Integration

When entities are created or destroyed, the spatial index must stay in sync:

```csharp
public class EntityLifecycleSystem
{
    /// <summary>
    /// Spawn an entity with spatial indexing.
    /// </summary>
    public Entity SpawnSpatialEntity(World world, Vector2 position, float halfWidth, float halfHeight)
    {
        var entity = world.Create(
            new Position(position.X, position.Y),
            new SpatialBounds(halfWidth, halfHeight),
            new SpatialIndexed()
        );
        return entity;
    }

    /// <summary>
    /// Destroy an entity — spatial index handles cleanup on next rebuild.
    /// With full-rebuild grids, destroyed entities simply aren't re-inserted.
    /// </summary>
    public void DestroyEntity(World world, Entity entity)
    {
        // The grid rebuilds every frame, so destroyed entities are automatically excluded.
        // No explicit spatial removal needed with rebuild-every-frame strategy.
        world.Destroy(entity);
    }
}
```

---

## 18 — Thread Safety & Parallel Queries

Multiple systems might want to query the spatial index simultaneously. Here's how to make it safe.

### Read-Many, Write-Once Pattern

The spatial index follows a strict lifecycle:
1. **Write phase** (single-threaded): Clear + rebuild the index
2. **Read phase** (multi-threaded safe): All queries happen after rebuild

```csharp
public class ParallelSpatialSystem
{
    private readonly SpatialHash<Entity> _grid;

    // Double-buffer: build one while queries read the other
    private SpatialHash<Entity> _readGrid;
    private SpatialHash<Entity> _writeGrid;

    public ParallelSpatialSystem(float cellSize)
    {
        _readGrid = new SpatialHash<Entity>(cellSize);
        _writeGrid = new SpatialHash<Entity>(cellSize);
    }

    /// <summary>
    /// Build new spatial index (call from update thread).
    /// After building, swap read/write grids.
    /// </summary>
    public void Rebuild(World world)
    {
        _writeGrid.Clear();

        var query = new QueryDescription().WithAll<Position, SpatialBounds, SpatialIndexed>();
        world.Query(in query, (Entity entity, ref Position pos, ref SpatialBounds bounds) =>
        {
            _writeGrid.Insert(entity, new Vector2(pos.X, pos.Y));
        });

        // Swap — queries now use the freshly built grid
        (_readGrid, _writeGrid) = (_writeGrid, _readGrid);
    }

    /// <summary>Thread-safe read access to the current spatial index.</summary>
    public SpatialHash<Entity> ReadGrid => _readGrid;
}
```

### Per-Thread Query Lists

Avoid sharing result lists across threads:

```csharp
public class ThreadSafeQueryHelper
{
    [ThreadStatic]
    private static List<Entity>? _threadLocalResults;

    /// <summary>Get a per-thread result list (no allocation after first use per thread).</summary>
    public static List<Entity> GetResultList()
    {
        _threadLocalResults ??= new List<Entity>(256);
        _threadLocalResults.Clear();
        return _threadLocalResults;
    }

    /// <summary>
    /// Example: parallel AI perception updates.
    /// Each AI agent queries the spatial index on its own thread.
    /// </summary>
    public static void ParallelPerceptionUpdate(
        Entity[] aiEntities,
        World world,
        SpatialHash<Entity> readGrid)
    {
        Parallel.ForEach(aiEntities, entity =>
        {
            var results = GetResultList(); // Thread-local list
            ref var pos = ref world.Get<Position>(entity);
            ref var perception = ref world.Get<AIPerception>(entity);

            readGrid.QueryCircle(new Vector2(pos.X, pos.Y), perception.SightRange, results);

            // Process results... (thread-safe because each AI writes only to its own component)
            perception.VisibleTargets.Clear();
            foreach (var target in results)
            {
                if (target != entity)
                    perception.VisibleTargets.Add(target);
            }
        });
    }
}
```

---

## 19 — Debugging & Visualization

### Grid Debug Overlay

```csharp
public class SpatialDebugRenderer
{
    private Texture2D _pixel;
    private bool _showGrid = false;
    private bool _showOccupancy = false;
    private bool _showQueries = false;

    // Track recent queries for visualization
    private readonly List<(Vector2 center, float radius, int resultCount)> _recentQueries = new();

    public void Initialize(GraphicsDevice graphics)
    {
        _pixel = new Texture2D(graphics, 1, 1);
        _pixel.SetData(new[] { Color.White });
    }

    public void ToggleGrid() => _showGrid = !_showGrid;
    public void ToggleOccupancy() => _showOccupancy = !_showOccupancy;
    public void ToggleQueries() => _showQueries = !_showQueries;

    public void RecordQuery(Vector2 center, float radius, int resultCount)
    {
        _recentQueries.Add((center, radius, resultCount));
        if (_recentQueries.Count > 100)
            _recentQueries.RemoveAt(0);
    }

    public void Draw(SpriteBatch spriteBatch, UniformGrid<Entity> grid,
                     Vector2 cameraPos, float zoom)
    {
        if (!_showGrid && !_showOccupancy && !_showQueries)
            return;

        // Only draw cells visible on screen
        int screenW = spriteBatch.GraphicsDevice.Viewport.Width;
        int screenH = spriteBatch.GraphicsDevice.Viewport.Height;

        float halfW = (screenW / zoom) * 0.5f;
        float halfH = (screenH / zoom) * 0.5f;

        var (minCol, minRow) = grid.CellCoords(cameraPos - new Vector2(halfW, halfH));
        var (maxCol, maxRow) = grid.CellCoords(cameraPos + new Vector2(halfW, halfH));

        minCol = Math.Max(0, minCol);
        minRow = Math.Max(0, minRow);
        maxCol = Math.Min(grid.Cols - 1, maxCol);
        maxRow = Math.Min(grid.Rows - 1, maxRow);

        for (int r = minRow; r <= maxRow; r++)
        {
            for (int c = minCol; c <= maxCol; c++)
            {
                float worldX = c * grid.CellSize;
                float worldY = r * grid.CellSize;

                Vector2 screenPos = (new Vector2(worldX, worldY) - cameraPos) * zoom
                                   + new Vector2(screenW * 0.5f, screenH * 0.5f);

                float cellScreenSize = grid.CellSize * zoom;

                if (_showGrid)
                {
                    // Draw cell border
                    DrawRect(spriteBatch, screenPos, cellScreenSize, cellScreenSize,
                             Color.Green * 0.3f, 1);
                }

                if (_showOccupancy)
                {
                    var cell = grid.GetCell(c, r);
                    if (cell.Count > 0)
                    {
                        // Color intensity based on occupancy
                        float intensity = MathF.Min(cell.Count / 10f, 1f);
                        Color fillColor = Color.Lerp(Color.Green, Color.Red, intensity) * 0.3f;
                        spriteBatch.Draw(_pixel, screenPos,
                            new Rectangle(0, 0, (int)cellScreenSize, (int)cellScreenSize),
                            fillColor);

                        // Draw count number
                        // (Assumes you have a SpriteFont loaded — omitted for brevity)
                    }
                }
            }
        }

        if (_showQueries)
        {
            foreach (var (center, radius, count) in _recentQueries)
            {
                Vector2 screenCenter = (center - cameraPos) * zoom
                                      + new Vector2(screenW * 0.5f, screenH * 0.5f);
                float screenRadius = radius * zoom;

                Color queryColor = count > 20 ? Color.Red * 0.4f :
                                   count > 5 ? Color.Yellow * 0.4f :
                                   Color.Cyan * 0.4f;

                DrawCircle(spriteBatch, screenCenter, screenRadius, queryColor, 32);
            }
        }
    }

    private void DrawRect(SpriteBatch sb, Vector2 pos, float w, float h, Color color, int thickness)
    {
        sb.Draw(_pixel, new Rectangle((int)pos.X, (int)pos.Y, (int)w, thickness), color);
        sb.Draw(_pixel, new Rectangle((int)pos.X, (int)(pos.Y + h - thickness), (int)w, thickness), color);
        sb.Draw(_pixel, new Rectangle((int)pos.X, (int)pos.Y, thickness, (int)h), color);
        sb.Draw(_pixel, new Rectangle((int)(pos.X + w - thickness), (int)pos.Y, thickness, (int)h), color);
    }

    private void DrawCircle(SpriteBatch sb, Vector2 center, float radius, Color color, int segments)
    {
        float angleStep = MathF.Tau / segments;
        for (int i = 0; i < segments; i++)
        {
            float angle1 = i * angleStep;
            float angle2 = (i + 1) * angleStep;
            Vector2 p1 = center + new Vector2(MathF.Cos(angle1), MathF.Sin(angle1)) * radius;
            Vector2 p2 = center + new Vector2(MathF.Cos(angle2), MathF.Sin(angle2)) * radius;

            DrawLine(sb, p1, p2, color, 1);
        }
    }

    private void DrawLine(SpriteBatch sb, Vector2 a, Vector2 b, Color color, int thickness)
    {
        Vector2 diff = b - a;
        float angle = MathF.Atan2(diff.Y, diff.X);
        float length = diff.Length();

        sb.Draw(_pixel, a, null, color, angle, Vector2.Zero,
                new Vector2(length, thickness), SpriteEffects.None, 0f);
    }
}
```

### Diagnostic HUD

```csharp
public class SpatialDiagnostics
{
    private int _totalInserts;
    private int _totalQueries;
    private int _totalCandidatesReturned;
    private float _rebuildTimeMs;

    private readonly System.Diagnostics.Stopwatch _sw = new();

    public void BeginRebuild() => _sw.Restart();

    public void EndRebuild(int entityCount)
    {
        _sw.Stop();
        _rebuildTimeMs = (float)_sw.Elapsed.TotalMilliseconds;
        _totalInserts = entityCount