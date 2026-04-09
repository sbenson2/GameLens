# G31 — Scene Streaming & Large Worlds

> **Category:** Guide · **Engine:** Stride · **Related:** [Stride Architecture Rules](../stride-arch-rules.md), [G20 — Scene Management](G20_scene_management_composition.md)

Stride's scene streaming system lets you break a game world into smaller sub-scenes and load/unload them at runtime, keeping memory and draw calls manageable for open-world or large-level games. This guide covers the built-in streaming infrastructure, child-scene architecture, and community terrain approaches.

---

## Table of Contents

1. [Scene Hierarchy & Child Scenes](#1--scene-hierarchy--child-scenes)
2. [Scene Streaming at Runtime](#2--scene-streaming-at-runtime)
3. [Streaming Scripts — Load/Unload on Trigger](#3--streaming-scripts--loadunload-on-trigger)
4. [Texture & Resource Streaming](#4--texture--resource-streaming)
5. [Community Terrain Solutions](#5--community-terrain-solutions)
6. [Performance Considerations](#6--performance-considerations)
7. [Practical Pattern — Zone-Based Streaming](#7--practical-pattern--zone-based-streaming)
8. [Common Pitfalls](#8--common-pitfalls)

---

## 1 — Scene Hierarchy & Child Scenes

Stride scenes can contain **child scenes** — references to other `.sdscene` assets that are merged into the parent at load time or streamed on demand.

In Game Studio:

- Right-click the scene tree → **Add child scene**
- The child scene appears as a node under the parent
- Entities in child scenes keep their own transforms (relative to the child scene root)

In code, a scene's children are accessed via `Scene.Children`:

```csharp
// Iterate child scenes already loaded
foreach (var childScene in Entity.Scene.Children)
{
    Log.Info($"Child scene entity count: {childScene.Entities.Count}");
}
```

### When to Use Child Scenes

- **Level sections** — corridor A, corridor B, boss arena
- **Layer separation** — gameplay entities vs. environment vs. lighting rigs
- **Team workflow** — multiple designers edit separate child scenes without merge conflicts

---

## 2 — Scene Streaming at Runtime

To stream a child scene in and out at runtime, load it through `Content` and attach/detach it from the scene graph:

```csharp
public class SceneStreamer : AsyncScript
{
    /// <summary>URL of the scene asset to stream (e.g., "Scenes/ForestZone").</summary>
    public string SceneUrl { get; set; }

    private Scene loadedScene;

    public async Task LoadZone()
    {
        if (loadedScene != null) return; // already loaded

        // Content.LoadAsync returns a Scene; loading happens off the main thread
        loadedScene = await Content.LoadAsync<Scene>(SceneUrl);

        // Attach to the current scene graph — entities become active
        Entity.Scene.Children.Add(loadedScene);
    }

    public void UnloadZone()
    {
        if (loadedScene == null) return;

        // Detach from the scene graph — entities deactivated
        Entity.Scene.Children.Remove(loadedScene);

        // Release the asset
        Content.Unload(loadedScene);
        loadedScene = null;
    }

    public override async Task Execute()
    {
        // Example: keep running, respond to game events
        while (Game.IsRunning)
        {
            await Script.NextFrame();
        }
    }
}
```

Key points:

- `Content.LoadAsync<Scene>` loads the scene asset asynchronously — the game keeps running during the load.
- Adding the scene to `Scene.Children` activates all its entities (scripts start, renderers register, physics bodies appear).
- Removing and unloading reverses the process.
- Stride's `StreamingManager` (a `GameSystemBase`) handles texture and resource streaming levels automatically in the background.

---

## 3 — Streaming Scripts — Load/Unload on Trigger

A common pattern is to trigger streaming when the player enters or exits a volume:

```csharp
public class StreamTrigger : AsyncScript
{
    public string ZoneSceneUrl { get; set; }

    private Scene zone;
    private bool isLoaded;

    public override async Task Execute()
    {
        // Assumes this entity has a physics trigger collider (Bepu or Bullet)
        var trigger = Entity.Get<PhysicsComponent>();

        while (Game.IsRunning)
        {
            // Wait for any collision start
            var collision = await trigger.NewCollision();

            // Check if the other entity is the player
            var other = collision.ColliderA.Entity == Entity
                ? collision.ColliderB.Entity
                : collision.ColliderA.Entity;

            if (other.Get<PlayerTag>() != null && !isLoaded)
            {
                zone = await Content.LoadAsync<Scene>(ZoneSceneUrl);
                Entity.Scene.Children.Add(zone);
                isLoaded = true;
            }

            await Script.NextFrame();
        }
    }
}
```

For unloading, use a similar pattern with a larger "unload radius" trigger so scenes stay loaded while the player is nearby.

---

## 4 — Texture & Resource Streaming

Stride's `StreamingManager` automatically manages texture mip-level streaming:

- Textures marked as **streamable** load low-resolution mips first, then stream higher mips as the camera gets closer.
- The streaming budget is configurable via `StreamingManager.TargetMemoryBudget`.
- The manager runs as a background `GameSystemBase`, checking distances each frame.

To configure streaming in Game Studio:

- Select a texture asset → Properties → **Stream** checkbox
- Adjust **Max Residency** to control how many mip levels to keep resident

In code:

```csharp
// Access the streaming manager
var streaming = Game.Services.GetService<ITexturesStreamingProvider>();
// The streaming manager self-manages; typically you don't need manual calls
```

---

## 5 — Community Terrain Solutions

Stride does not include a built-in terrain editor. The community has developed terrain systems:

### StrideTerrain (johang88/StrideTerrain)

- Heightmap-based terrain with automatic tile splitting
- Level-of-detail (LOD) mesh generation per tile
- Texture splatting with configurable layers
- Integrates with Game Studio as a custom asset
- Dynamic loading of nearest terrain tiles based on camera position

### Integration Pattern

```
1. Install StrideTerrain NuGet package
2. Import heightmap and splat textures as assets
3. Add TerrainComponent to an entity in Game Studio
4. Configure tile size, LOD distances, and material layers
5. The terrain system handles LOD transitions and tile streaming at runtime
```

This is a community project — check its repository for the latest API and compatibility with Stride 4.3.

---

## 6 — Performance Considerations

| Factor | Guidance |
|--------|----------|
| Scene granularity | Split world into zones of ~500–2000 entities each |
| Load budget | Load at most 1–2 scenes per frame to avoid hitches |
| Async loading | Always use `Content.LoadAsync`, never `Content.Load` for large scenes |
| Physics | Bepu bodies in unloaded scenes are removed from the simulation automatically |
| Draw calls | Child scenes share the same render pipeline — no extra overhead for scene boundaries |
| Memory | Call `Content.Unload` on removed scenes to release GPU and CPU resources |

---

## 7 — Practical Pattern — Zone-Based Streaming

A complete zone-based streaming setup:

```
World (root scene)
├── Persistent/        ← always loaded: player, UI, global systems
├── Zone_Town/         ← child scene, loaded when player is near town
├── Zone_Forest/       ← child scene, loaded when player enters forest
├── Zone_Dungeon/      ← child scene, loaded on dungeon entrance trigger
└── StreamManager      ← entity with script that tracks player position
                         and loads/unloads zones by distance
```

The `StreamManager` script maintains a list of zone definitions (scene URL + center position + load radius + unload radius) and checks the player's position each frame:

```csharp
public class ZoneManager : SyncScript
{
    public List<ZoneDefinition> Zones { get; set; } = new();
    public TransformComponent PlayerTransform { get; set; }

    private readonly Dictionary<string, Scene> loadedZones = new();

    public override void Update()
    {
        var playerPos = PlayerTransform.WorldMatrix.TranslationVector;

        foreach (var zone in Zones)
        {
            var dist = Vector3.Distance(playerPos, zone.Center);
            var isLoaded = loadedZones.ContainsKey(zone.SceneUrl);

            if (dist < zone.LoadRadius && !isLoaded)
            {
                // Fire-and-forget async load
                LoadZoneAsync(zone.SceneUrl);
            }
            else if (dist > zone.UnloadRadius && isLoaded)
            {
                UnloadZone(zone.SceneUrl);
            }
        }
    }

    private async void LoadZoneAsync(string url)
    {
        // Guard against double-load
        if (loadedZones.ContainsKey(url)) return;
        loadedZones[url] = null; // placeholder while loading

        var scene = await Content.LoadAsync<Scene>(url);
        Entity.Scene.Children.Add(scene);
        loadedZones[url] = scene;
    }

    private void UnloadZone(string url)
    {
        if (loadedZones.TryGetValue(url, out var scene) && scene != null)
        {
            Entity.Scene.Children.Remove(scene);
            Content.Unload(scene);
        }
        loadedZones.Remove(url);
    }
}
```

---

## 8 — Common Pitfalls

1. **Forgetting to unload** — removing a child scene from `Scene.Children` does NOT release its assets. You must also call `Content.Unload(scene)`.
2. **Synchronous loads** — `Content.Load<Scene>` blocks the main thread. Always use the async variant for scenes.
3. **Physics ghost collisions** — if you load a zone while the player overlaps a collider, you may get a burst of collision events on the first frame. Add a cooldown or ignore first-frame collisions in streamed zones.
4. **Script initialization order** — scripts in a newly loaded child scene run their `Start()` on the frame after attachment. Don't assume cross-scene references are valid on the same frame you add the child scene.
5. **Editor vs. runtime** — in Game Studio, child scenes are always loaded for editing. The streaming behavior only applies at runtime.
