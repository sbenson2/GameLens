# G20 — Scene Management & Composition

> **Category:** guide · **Engine:** Stride · **Related:** [G01 Getting Started](./G01_getting_started.md) · [G03 Code-Only Development](./G03_code_only_development.md) · [G18 Scripting Patterns](./G18_scripting_patterns.md) · [G02 Bepu Physics](./G02_bepu_physics.md)

How to structure, load, and compose scenes in Stride 4.3. Covers the scene hierarchy, child scene loading and unloading, scene transitions, prefab instantiation, the `SceneSystem` API for code-only workflows, and architectural patterns for managing complex game worlds with multiple interconnected scenes.

## Scene Architecture Overview

In Stride, a `Scene` is a container for `Entity` objects. Scenes form a tree: every scene can have child scenes, and those children can have their own children, to arbitrary depth. The engine maintains a single **root scene** that anchors this hierarchy.

```
Root Scene
├── UI Scene (child)
├── Gameplay Scene (child)
│   ├── Level Geometry Scene (grandchild)
│   └── NPC Scene (grandchild)
└── Audio Scene (child)
```

Key rule: **a scene can only be loaded once at a time.** If you need the same content in multiple places, use prefabs instead of loading the same scene twice.

## Loading and Unloading Child Scenes

### Using UrlReference (Recommended)

`UrlReference<Scene>` is a type-safe reference that survives asset renames in Game Studio. Expose it as a public field on your script and assign it in the editor.

```csharp
public class LevelLoader : SyncScript
{
    // Assign in Game Studio's property grid
    public UrlReference<Scene> LevelScene;

    private Scene _loadedLevel;

    public override void Update()
    {
        if (Input.IsKeyPressed(Keys.L) && _loadedLevel == null)
        {
            LoadLevel();
        }

        if (Input.IsKeyPressed(Keys.U) && _loadedLevel != null)
        {
            UnloadLevel();
        }
    }

    private void LoadLevel()
    {
        // Content.Load resolves the UrlReference and deserializes the scene
        _loadedLevel = Content.Load(LevelScene);

        // Position the child scene relative to the parent
        _loadedLevel.Offset = new Vector3(0, 0, 0);

        // Attach to the current entity's scene as a child
        Entity.Scene.Children.Add(_loadedLevel);
    }

    private void UnloadLevel()
    {
        // Detach from the scene hierarchy first
        _loadedLevel.Parent = null;

        // Release the asset (frees memory)
        Content.Unload(_loadedLevel);
        _loadedLevel = null;
    }
}
```

### Using String Paths (Code-Only)

When working without Game Studio or when scene paths are determined at runtime:

```csharp
private Scene LoadSceneByName(string sceneName)
{
    var scene = Content.Load<Scene>(sceneName);
    Entity.Scene.Children.Add(scene);
    return scene;
}

// Usage
var level = LoadSceneByName("Scenes/Level_02");
```

### Attaching Child Scenes: Two Equivalent Approaches

```csharp
// Approach 1: Add to parent's Children collection
parentScene.Children.Add(childScene);

// Approach 2: Set the child's Parent property
childScene.Parent = parentScene;

// Both are equivalent — use whichever reads better in context
```

### Removing Child Scenes

```csharp
// Approach 1
parentScene.Children.Remove(childScene);

// Approach 2
childScene.Parent = null;
```

## Scene Offset and Positioning

Each child scene has an `Offset` property (`Vector3`) that shifts all entities in that scene relative to its parent. This is essential for composing tiled worlds or positioning separate scene chunks.

```csharp
// Load multiple chunks of a large world
for (int x = 0; x < worldWidth; x++)
{
    for (int z = 0; z < worldDepth; z++)
    {
        var chunk = Content.Load<Scene>($"Scenes/Chunk_{x}_{z}");
        chunk.Offset = new Vector3(x * chunkSize, 0, z * chunkSize);
        Entity.Scene.Children.Add(chunk);
    }
}
```

## Scene Transitions (Swapping the Root Scene)

For full scene transitions (e.g., main menu → gameplay, or restarting a level), replace the root scene entirely:

```csharp
public class SceneTransitioner : SyncScript
{
    public UrlReference<Scene> TargetScene;
    public Keys TransitionKey = Keys.Enter;

    public override void Update()
    {
        if (Input.IsKeyPressed(TransitionKey))
        {
            TransitionTo(TargetScene);
        }
    }

    private void TransitionTo(UrlReference<Scene> target)
    {
        // Unload the current root and all its children
        var currentRoot = SceneSystem.SceneInstance.RootScene;
        Content.Unload(currentRoot);

        // Load and set the new root
        SceneSystem.SceneInstance.RootScene = Content.Load(target);
    }
}
```

### Restart Current Scene

```csharp
public void RestartCurrentScene()
{
    var root = SceneSystem.SceneInstance.RootScene;
    // Store the URL before unloading (assumes you track it)
    var sceneUrl = currentSceneUrl;

    Content.Unload(root);
    SceneSystem.SceneInstance.RootScene = Content.Load<Scene>(sceneUrl);
}
```

**Warning:** Unloading the root scene destroys the entity running this script. Ensure the transition logic completes before the unload, or use a persistent manager entity in a scene that is not unloaded (see Persistent Scene Pattern below).

## Prefab Instantiation

Prefabs are reusable entity templates. Unlike scenes, the same prefab can be instantiated multiple times.

### Loading and Instantiating

```csharp
public class BulletSpawner : SyncScript
{
    public Prefab BulletPrefab;  // Assign in Game Studio

    public void SpawnBullet(Vector3 position, Vector3 direction)
    {
        // Instantiate returns a list of entities (prefab may contain multiple)
        var entities = BulletPrefab.Instantiate();

        foreach (var entity in entities)
        {
            entity.Transform.Position = position;
            entity.Transform.Rotation =
                Quaternion.LookRotation(direction, Vector3.UnitY);

            // Add to the current scene
            SceneSystem.SceneInstance.RootScene.Entities.Add(entity);
        }
    }
}
```

### Loading Prefabs from Code (Without Editor)

```csharp
// Load a prefab asset by URL
var prefab = Content.Load<Prefab>("Prefabs/Enemy");
var enemies = prefab.Instantiate();

foreach (var enemy in enemies)
{
    enemy.Transform.Position = spawnPoint;
    Entity.Scene.Entities.Add(enemy);
}
```

### Prefab Without Parent Entity

By default, Game Studio wraps prefab entities in a parent entity. If you need the raw entities without a wrapper (for example, when you want to position them independently), instantiate in code — `Prefab.Instantiate()` gives you the flat entity list.

## Architectural Patterns

### Pattern 1: Persistent Scene + Transient Scenes

Keep a persistent scene for managers (audio, UI, game state) that survives level transitions, and swap child scenes for gameplay content.

```csharp
public class GameManager : SyncScript
{
    // This script lives in the persistent root scene
    public UrlReference<Scene> MainMenuScene;
    public UrlReference<Scene> Level1Scene;
    public UrlReference<Scene> Level2Scene;

    private Scene _currentLevel;

    public void LoadLevel(UrlReference<Scene> levelUrl)
    {
        // Unload previous level if any
        if (_currentLevel != null)
        {
            _currentLevel.Parent = null;
            Content.Unload(_currentLevel);
        }

        // Load new level as child of root (persistent scene stays intact)
        _currentLevel = Content.Load(levelUrl);
        Entity.Scene.Children.Add(_currentLevel);
    }
}
```

**Structure:**
```
Root (Persistent) — GameManager, AudioManager, UIOverlay
└── Level Scene (swappable child) — terrain, NPCs, props
```

### Pattern 2: Additive Scene Composition

Load multiple scenes simultaneously for modular world building. Useful for open-world games or games with seamless indoor/outdoor transitions.

```csharp
public class WorldStreamer : SyncScript
{
    private readonly Dictionary<string, Scene> _loadedZones = new();

    public void StreamZone(string zoneName, Vector3 offset)
    {
        if (_loadedZones.ContainsKey(zoneName)) return;

        var zone = Content.Load<Scene>($"Zones/{zoneName}");
        zone.Offset = offset;
        Entity.Scene.Children.Add(zone);
        _loadedZones[zoneName] = zone;
    }

    public void UnstreamZone(string zoneName)
    {
        if (!_loadedZones.TryGetValue(zoneName, out var zone)) return;

        zone.Parent = null;
        Content.Unload(zone);
        _loadedZones.Remove(zoneName);
    }
}
```

### Pattern 3: Scene-Based State Machine

Map game states to scenes and transition between them:

```csharp
public enum GameState { MainMenu, Playing, Paused, GameOver }

public class GameStateMachine : SyncScript
{
    public UrlReference<Scene> MainMenuScene;
    public UrlReference<Scene> GameplayScene;
    public UrlReference<Scene> PauseOverlayScene;
    public UrlReference<Scene> GameOverScene;

    private GameState _currentState;
    private Scene _stateScene;

    public void ChangeState(GameState newState)
    {
        // Clean up current state scene
        if (_stateScene != null)
        {
            _stateScene.Parent = null;
            Content.Unload(_stateScene);
        }

        _currentState = newState;

        var sceneUrl = newState switch
        {
            GameState.MainMenu => MainMenuScene,
            GameState.Playing  => GameplayScene,
            GameState.Paused   => PauseOverlayScene,
            GameState.GameOver => GameOverScene,
            _ => throw new ArgumentOutOfRangeException()
        };

        _stateScene = Content.Load(sceneUrl);
        Entity.Scene.Children.Add(_stateScene);
    }
}
```

## Code-Only Scene Setup (No Game Studio)

For projects that do not use the Stride editor, build scenes entirely in code:

```csharp
public class CodeOnlyGame : Game
{
    protected override Task LoadContent()
    {
        // Create the root scene
        var scene = new Scene();

        // Add a camera
        var cameraEntity = new Entity("Camera")
        {
            new TransformComponent { Position = new Vector3(0, 5, -10) },
            new CameraComponent
            {
                Projection = CameraProjectionMode.Perspective,
                Slot = SceneSystem.GraphicsCompositor
                    .Cameras[0].ToSlotId()
            }
        };
        scene.Entities.Add(cameraEntity);

        // Add a directional light
        var lightEntity = new Entity("Light")
        {
            new TransformComponent
            {
                Rotation = Quaternion.RotationX(
                    MathUtil.DegreesToRadians(-45))
            },
            new LightComponent
            {
                Type = new LightDirectional(),
                Intensity = 1.0f
            }
        };
        scene.Entities.Add(lightEntity);

        // Set as root
        SceneSystem.SceneInstance = new SceneInstance(Services, scene);

        return Task.CompletedTask;
    }
}
```

## Performance Considerations

1. **Scene loading is synchronous.** `Content.Load<Scene>()` blocks the calling thread. For large scenes, show a loading screen or use Stride's async services to load on a background thread.

2. **Entity count matters.** Each entity with a `TransformComponent` participates in the transform hierarchy update every frame. Flatten hierarchies where deep nesting is not needed.

3. **Unload aggressively.** Child scenes that are detached but not unloaded still hold references to assets in memory. Always call `Content.Unload()` after setting `Parent = null`.

4. **Prefab instantiation allocates.** `Prefab.Instantiate()` creates new entity instances. For frequently spawned objects (bullets, particles, pickups), maintain an object pool and recycle entities instead of repeatedly instantiating.

5. **Scene.Offset is cheap.** The offset is applied as a root transform — it does not copy or move entity data. Use it freely for world streaming.

## Checklist

- [ ] Use `UrlReference<Scene>` for editor-assigned scene references (survives renames)
- [ ] Always `Content.Unload()` scenes after detaching — detaching alone does not free memory
- [ ] Keep a persistent root scene for managers to survive level transitions
- [ ] Use child scenes (not root replacement) for additive composition
- [ ] Use prefabs for reusable objects that need multiple simultaneous instances
- [ ] Pool frequently instantiated prefab entities to reduce allocation pressure
- [ ] Test that scene transition scripts are not destroyed mid-transition by living in the persistent scene
- [ ] Use `Scene.Offset` for positioning world chunks rather than moving individual entities
