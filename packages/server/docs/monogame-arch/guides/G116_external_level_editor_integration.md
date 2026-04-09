# G116 — External Level Editor Integration (LDtk, Tiled, Ogmo)

> **Category:** guide · **Engine:** MonoGame · **Related:** [G37 Tilemap Systems](./G37_tilemap_systems.md) · [G75 MonoGame Extended](./G75_monogame_extended.md) · [G8 Content Pipeline](./G8_content_pipeline.md) · [G108 Custom Content Pipeline Extensions](./G108_custom_content_pipeline_extensions.md) · [G38 Scene Management](./G38_scene_management.md) · [G109 MonoGame.Extended 4.x/5.x Migration](./G109_monogame_extended_4x_5x_migration.md)

How to load, render, and interact with levels authored in external 2D level editors — **LDtk**, **Tiled**, and **Ogmo Editor** — inside a MonoGame project. Covers three integration paths: the standalone **LDtkMonogame** library, the format-agnostic **MonoGame.Extended 6.0 tilemap system**, and a manual JSON-loading approach for full control.

---

## Table of Contents

1. [Why Use an External Level Editor?](#1-why-use-an-external-level-editor)
2. [Editor Comparison](#2-editor-comparison)
3. [Path A — LDtkMonogame (Standalone)](#3-path-a--ldtkmonogame-standalone)
4. [Path B — MonoGame.Extended 6.0 Tilemaps](#4-path-b--monogameextended-60-tilemaps)
5. [Path C — Manual JSON Loading](#5-path-c--manual-json-loading)
6. [Entity & Object Mapping](#6-entity--object-mapping)
7. [Collision from Editor Layers](#7-collision-from-editor-layers)
8. [Hot-Reload Workflow](#8-hot-reload-workflow)
9. [Content Pipeline vs. Runtime Loading](#9-content-pipeline-vs-runtime-loading)
10. [Common Pitfalls](#10-common-pitfalls)

---

## 1. Why Use an External Level Editor?

Building a custom level editor is a multi-month detour. External editors give you:

- **Visual tile painting** with auto-tiling rules
- **Entity placement** with typed fields (enums, ints, strings, colors)
- **Multi-level worlds** with spatial relationships between rooms/maps
- **Collaboration** — designers can build levels without touching code

The integration challenge is bridging the editor's data format into your MonoGame rendering and game logic.

---

## 2. Editor Comparison

| Feature | LDtk | Tiled | Ogmo Editor |
|---------|-------|-------|-------------|
| **Format** | `.ldtk` (JSON) | `.tmx` (XML) / `.tmj` (JSON) | `.ogmo` / `.json` |
| **Auto-tiling** | Rule-based, powerful | Terrain tool | Basic |
| **Entity system** | Built-in, strongly typed | Object layers | Entity layers |
| **Multi-world** | Native (project = world) | `.world` files | Manual |
| **Active development** | Yes (2024+) | Yes (mature) | Community maintained |
| **MonoGame support** | LDtkMonogame NuGet | MonoGame.Extended | MonoGame.Extended 6.0 |

**Recommendation:** LDtk for new 2D projects (strongest entity system, modern tooling). Tiled if you have existing `.tmx` content or need isometric/hexagonal maps. Ogmo for lightweight prototyping.

---

## 3. Path A — LDtkMonogame (Standalone)

**LDtkMonogame** is a dedicated importer, renderer, and optional code generator for LDtk projects. Current version: **1.8.1** (supports LDtk 1.5.3, MonoGame ≥ 3.8.4.1).

### Installation

Add the NuGet packages to your `.csproj`:

```xml
<ItemGroup>
  <PackageReference Include="LDtkMonogame" Version="1.8.1" />
  <!-- Optional: content pipeline extension for .mgcb integration -->
  <PackageReference Include="LDtkMonogame.ContentPipeline" Version="1.8.1" />
  <!-- Optional: compile-time code generator for type-safe entity access -->
  <PackageReference Include="LDtkMonogame.Codegen" Version="0.6.5" />
</ItemGroup>
```

### Loading a World

```csharp
// In Initialize() or LoadContent()
LDtkFile file = LDtkFile.FromFile("Data/World.ldtk");

// Using codegen IIDs (recommended — compile-time checked):
LDtkWorld world = file.LoadWorld(Worlds.World.Iid);

// Or by file path without codegen:
// LDtkFile file = LDtkFile.FromFile("World", Content);
```

### Rendering Levels

```csharp
// Load a specific level
LDtkLevel level = world.LoadLevel("Level_0");

// In Draw():
spriteBatch.Begin(samplerState: SamplerState.PointClamp);
foreach (LDtkLevel level in loadedLevels)
{
    level.Render(spriteBatch);
}
spriteBatch.End();
```

### Accessing Entities

With the codegen tool, LDtk entities become strongly typed C# classes:

```csharp
// Entities defined in LDtk become generated classes
foreach (PlayerSpawn spawn in level.GetEntities<PlayerSpawn>())
{
    player.Position = spawn.Position;
    player.Health = spawn.InitialHealth; // Typed custom field
}
```

### Codegen Setup

Install the `LDtkMonogame.Codegen` package, then add to your `.csproj`:

```xml
<PropertyGroup>
  <LDtkProjectPath>Data/World.ldtk</LDtkProjectPath>
</PropertyGroup>
```

Entity definitions, enums, and level IIDs are generated at compile time. Renaming an entity in LDtk produces a compile error in C# — no runtime surprises.

---

## 4. Path B — MonoGame.Extended 6.0 Tilemaps

MonoGame.Extended 6.0 introduces a **format-agnostic tilemap system**. The same runtime API works regardless of source editor.

### Key Concepts

```
Tiled .tmx ──┐
LDtk .ldtk ──┼──→ Tilemap ──→ TilemapRenderer ──→ Screen
Ogmo .ogmo ──┘
```

All three editors produce a unified `Tilemap` type at runtime. Layers, tiles, objects, and properties share the same API.

### Installation

```xml
<PackageReference Include="MonoGame.Extended.Tilemaps" Version="6.0.0-preview.1" />
```

> **Note:** The old `MonoGame.Extended.Tiled` namespace is gone in 6.0. See the migration guide if upgrading from 4.x/5.x.

### Loading

```csharp
// Via content pipeline (importer auto-detects format)
Tilemap tilemap = Content.Load<Tilemap>("maps/dungeon");
```

### Rendering

Two renderer options:

```csharp
// Option 1: SpriteBatch integration (CPU-side, simpler)
// Performs frustum culling automatically.
var renderer = new TilemapSpriteBatchRenderer(GraphicsDevice);
renderer.Draw(tilemap, spriteBatch, viewMatrix);

// Option 2: Direct GPU renderer (pre-bakes geometry into GPU buffers)
// Better for large, static maps.
var renderer = new TilemapRenderer(GraphicsDevice);
renderer.Draw(tilemap, viewMatrix, projectionMatrix);
```

### Accessing Objects and Properties

```csharp
// Read objects from an "Entities" object layer
TilemapObjectLayer objectLayer = tilemap.GetLayer<TilemapObjectLayer>("Entities");
foreach (TilemapObject obj in objectLayer.Objects)
{
    string type = obj.Type;              // e.g., "PlayerSpawn"
    Vector2 pos = obj.Position;
    int hp = obj.Properties.Get<int>("health");
}
```

### World Maps

```csharp
// Tiled .world and LDtk projects load as TilemapWorld
TilemapWorld world = Content.Load<TilemapWorld>("maps/overworld");
foreach (TilemapWorldEntry entry in world.Entries)
{
    Tilemap map = entry.Tilemap;
    Vector2 offset = entry.Position; // World-space offset
}
```

---

## 5. Path C — Manual JSON Loading

For maximum control or non-standard editors, load the JSON yourself. This avoids any library dependency.

```csharp
// LDtk files are plain JSON
string json = File.ReadAllText("Content/World.ldtk");
JsonDocument doc = JsonDocument.Parse(json);

JsonElement levels = doc.RootElement.GetProperty("levels");
foreach (JsonElement level in levels.EnumerateArray())
{
    string identifier = level.GetProperty("identifier").GetString();
    int worldX = level.GetProperty("worldX").GetInt32();
    int worldY = level.GetProperty("worldY").GetInt32();
    
    // Parse layer instances, tile data, entity instances...
}
```

**Trade-offs:** Full control over memory layout and rendering, but you maintain the parser as the editor format evolves. Use `System.Text.Json` source generators for AOT-safe deserialization (see [G99](./G99_source_generators_aot_serialization.md)).

---

## 6. Entity & Object Mapping

The bridge between editor-placed objects and game code is a **spawn factory** pattern:

```csharp
public class EntityFactory
{
    private readonly Dictionary<string, Func<Vector2, Dictionary<string, object>, Entity>> _creators;

    public EntityFactory()
    {
        _creators = new Dictionary<string, Func<Vector2, Dictionary<string, object>, Entity>>
        {
            ["PlayerSpawn"] = (pos, props) => new Player(pos),
            ["Enemy"]       = (pos, props) => new Enemy(pos, (EnemyType)props["enemyType"]),
            ["Chest"]       = (pos, props) => new Chest(pos, (string)props["lootTable"]),
            ["Trigger"]     = (pos, props) => new TriggerZone(pos, (string)props["event"]),
        };
    }

    public Entity Create(string type, Vector2 position, Dictionary<string, object> properties)
    {
        if (_creators.TryGetValue(type, out var creator))
            return creator(position, properties);
        
        // Log unknown type — catches editor/code drift early
        Debug.WriteLine($"Unknown entity type: {type}");
        return null;
    }
}
```

---

## 7. Collision from Editor Layers

Most editors support a dedicated collision layer or tile properties:

```
Approach 1: Dedicated "Collision" tile layer
  → Read tile flags (solid, one-way, ladder) from tile custom properties
  → Build a collision grid from the layer data

Approach 2: Object layer with collision shapes
  → Rectangles, polygons, polylines placed over tiles
  → Parse into your physics system directly

Approach 3: IntGrid layers (LDtk-specific)
  → Each cell has an integer value (0=empty, 1=solid, 2=platform)
  → Compact, fast to parse, designed for collision
```

LDtk's IntGrid layers are the most efficient for collision — they're a flat array of integers with no object overhead.

---

## 8. Hot-Reload Workflow

Re-load levels without restarting the game for fast iteration:

```csharp
// Watch the level file for changes
FileSystemWatcher watcher = new("Content/maps");
watcher.Changed += (_, e) =>
{
    // Queue reload on next Update() — don't reload mid-frame
    _pendingReload = e.FullPath;
};
watcher.EnableRaisingEvents = true;

// In Update():
if (_pendingReload != null)
{
    ReloadLevel(_pendingReload);
    _pendingReload = null;
}
```

Pair this with LDtk's "save on every change" option for near-instant feedback while painting levels.

---

## 9. Content Pipeline vs. Runtime Loading

| Approach | Pros | Cons |
|----------|------|------|
| **Content Pipeline** (`.mgcb` importer) | Pre-processed, faster load times, validated at build | Slower iteration, harder to debug import errors |
| **Runtime loading** (direct file read) | Hot-reload, simpler setup, easier debugging | Slower first load, raw file included in build |

**Recommended:** Use runtime loading during development for hot-reload, then switch to content pipeline for release builds. LDtkMonogame supports both paths.

---

## 10. Common Pitfalls

### Coordinate system mismatch
LDtk and Tiled use **top-left origin with Y-down**. If your game uses Y-up coordinates, flip Y when converting positions: `gameY = worldHeight - editorY`.

### Tileset texture paths
Editors store tileset image paths relative to the project file. Ensure these paths resolve correctly in your MonoGame content directory. LDtkMonogame handles this automatically; manual loaders need path fixup logic.

### Layer draw order
Editors typically list layers top-to-bottom in the UI but store them in array order. Verify your rendering order matches what the editor shows. Draw from back to front (highest index first, or check the editor's convention).

### Large worlds — don't load everything
For multi-level worlds, load only visible/nearby levels. Unload levels the player has moved away from. See [G116's sister guide G117](./G117_chunk_based_world_streaming.md) for streaming patterns.

### MonoGame.Extended 6.0 breaking changes
The entire `MonoGame.Extended.Tiled` namespace was removed. If upgrading from 4.x/5.x, the new tilemap API has different class names, different content pipeline importers, and a different rendering approach. Plan for a full migration, not a drop-in upgrade.

---

## Summary

| Path | Best for | Key package |
|------|----------|-------------|
| **LDtkMonogame** | LDtk-only projects, type-safe codegen | `LDtkMonogame` 1.8.1 |
| **Extended 6.0** | Multi-editor support, unified API | `MonoGame.Extended.Tilemaps` 6.0.0-preview.1 |
| **Manual JSON** | Maximum control, no dependencies | `System.Text.Json` (built-in) |

Choose the path that matches your project's editor choice and dependency tolerance. All three can coexist if needed — e.g., LDtkMonogame for levels, manual parsing for custom configuration files.
