# G110 — Hierarchical Scene Lifecycle with Arch ECS

> **Category:** guide · **Engine:** MonoGame · **Related:** [G38 Scene & Game State Management](./G38_scene_management.md) · [G42 Screen Transitions](./G42_screen_transitions.md) · [G93 ECS Library Integration](./G93_ecs_library_integration.md) · [G77 ECS Event & Messaging](./G77_ecs_event_messaging.md) · [G88 Dependency Injection](./G88_dependency_injection.md) · [G26 Resource Loading & Caching](./G26_resource_loading_caching.md)

Advanced patterns for managing multiple Arch ECS worlds across a scene hierarchy. Covers world-per-scene ownership, shared service injection, async scene preloading, overlay scenes with independent worlds, and safe world disposal. Builds on G38's fundamentals with production-ready patterns for games with complex state flows (RPG town→battle→cutscene→menu stacks).

---

## Table of Contents

1. [World-Per-Scene Ownership Model](#1-world-per-scene-ownership-model)
2. [Scene Stack with Independent Worlds](#2-scene-stack-with-independent-worlds)
3. [Shared Services Across Scenes](#3-shared-services-across-scenes)
4. [Async Scene Preloading](#4-async-scene-preloading)
5. [Overlay Scenes with Transparent Worlds](#5-overlay-scenes-with-transparent-worlds)
6. [Safe World Disposal and Entity Cleanup](#6-safe-world-disposal-and-entity-cleanup)
7. [Scene Transitions with World Handoff](#7-scene-transitions-with-world-handoff)
8. [Practical Example: RPG Scene Flow](#8-practical-example-rpg-scene-flow)

---

## 1. World-Per-Scene Ownership Model

Each scene owns exactly one Arch `World`. This is the fundamental rule — it ensures clean lifecycle management, prevents cross-scene entity leaks, and makes disposal predictable.

### Why One World Per Scene

| Approach | Pros | Cons |
|----------|------|------|
| **One world per scene** ✅ | Clean lifecycle, no cross-scene leaks, simple disposal | Entities can't be shared directly between scenes |
| Single global world | Entities persist across scenes | Disposal nightmare, system conflicts, memory leaks |
| Multiple worlds per scene | Flexible | Complexity explosion, unclear ownership |

### Scene Base with World Ownership

```csharp
using Arch.Core;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Content;
using Microsoft.Xna.Framework.Graphics;

/// <summary>
/// Base class for all scenes. Each scene owns one Arch World.
/// The world is created in Initialize and disposed in UnloadContent.
/// </summary>
public abstract class Scene : IDisposable
{
    public World World { get; private set; } = null!;
    public bool IsInitialized { get; private set; }
    public bool IsOverlay { get; protected set; }

    protected ContentManager Content { get; private set; } = null!;
    protected GameServices Services { get; private set; } = null!;

    private readonly List<Action<World>> _deferredActions = new();
    private bool _disposed;

    /// <summary>
    /// Called by the SceneManager. Do not call directly.
    /// </summary>
    public void InternalInitialize(GameServices services)
    {
        Services = services;
        Content = new ContentManager(services.ContentServiceProvider, "Content");

        // Create the Arch world for this scene.
        // World.Create() is cheap — don't pre-allocate unless you know your entity count.
        World = World.Create();

        Initialize();
        IsInitialized = true;
    }

    protected abstract void Initialize();
    public abstract void Update(GameTime gameTime);
    public abstract void Draw(SpriteBatch spriteBatch, GameTime gameTime);

    /// <summary>
    /// Queue a structural change (entity create/destroy, add/remove component)
    /// to run after all systems finish the current frame. This prevents
    /// iterator invalidation.
    /// </summary>
    public void Defer(Action<World> action) => _deferredActions.Add(action);

    /// <summary>
    /// Called by SceneManager at the end of each frame to flush deferred changes.
    /// </summary>
    public void FlushDeferred()
    {
        foreach (var action in _deferredActions)
            action(World);
        _deferredActions.Clear();
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;

        UnloadContent();

        // Arch worlds MUST be explicitly disposed to free native memory.
        World?.Dispose();
        World = null!;

        Content?.Dispose();
        GC.SuppressFinalize(this);
    }

    protected virtual void UnloadContent() { }
}
```

> **Key point:** `World.Dispose()` is not optional. Arch allocates unmanaged memory for archetype chunks. Failing to dispose a world leaks memory that the GC cannot reclaim.

---

## 2. Scene Stack with Independent Worlds

A stack-based scene manager allows pushing overlay scenes (pause menu, dialog, inventory) on top of the active gameplay scene. Each scene in the stack has its own world.

```csharp
/// <summary>
/// Manages a stack of scenes, each with independent Arch worlds.
/// Top scene gets input. All visible scenes draw (bottom to top).
/// Only the top scene and scenes marked IsOverlay receive Update calls.
/// </summary>
public class SceneManager : IDisposable
{
    private readonly Stack<Scene> _sceneStack = new();
    private readonly Queue<SceneCommand> _pendingCommands = new();
    private readonly GameServices _services;

    public Scene? ActiveScene => _sceneStack.Count > 0 ? _sceneStack.Peek() : null;

    public SceneManager(GameServices services)
    {
        _services = services;
    }

    // --- Commands are queued and applied between frames to avoid mutation during iteration ---

    public void Push(Scene scene) =>
        _pendingCommands.Enqueue(new SceneCommand(SceneOp.Push, scene));

    public void Pop() =>
        _pendingCommands.Enqueue(new SceneCommand(SceneOp.Pop, null));

    public void Replace(Scene scene) =>
        _pendingCommands.Enqueue(new SceneCommand(SceneOp.Replace, scene));

    public void Update(GameTime gameTime)
    {
        ApplyPendingCommands();

        // Walk the stack from bottom to top. Only update scenes that are
        // either the top scene or flagged as overlay (which updates alongside
        // the scene below it).
        var scenesArray = _sceneStack.ToArray();
        Array.Reverse(scenesArray); // bottom-first

        bool topReached = false;
        for (int i = scenesArray.Length - 1; i >= 0; i--)
        {
            var scene = scenesArray[i];
            if (!topReached)
            {
                topReached = true;
                scene.Update(gameTime);
                scene.FlushDeferred();
            }
            else if (scene.IsOverlay)
            {
                scene.Update(gameTime);
                scene.FlushDeferred();
            }
            // Non-overlay scenes below the top are frozen (not updated).
        }
    }

    public void Draw(SpriteBatch spriteBatch, GameTime gameTime)
    {
        // Draw all scenes bottom to top so overlays render on top.
        var scenesArray = _sceneStack.ToArray();
        Array.Reverse(scenesArray);

        foreach (var scene in scenesArray)
            scene.Draw(spriteBatch, gameTime);
    }

    private void ApplyPendingCommands()
    {
        while (_pendingCommands.Count > 0)
        {
            var cmd = _pendingCommands.Dequeue();
            switch (cmd.Op)
            {
                case SceneOp.Push:
                    cmd.Scene!.InternalInitialize(_services);
                    _sceneStack.Push(cmd.Scene);
                    break;
                case SceneOp.Pop:
                    if (_sceneStack.Count > 0)
                        _sceneStack.Pop().Dispose(); // disposes world + content
                    break;
                case SceneOp.Replace:
                    if (_sceneStack.Count > 0)
                        _sceneStack.Pop().Dispose();
                    cmd.Scene!.InternalInitialize(_services);
                    _sceneStack.Push(cmd.Scene);
                    break;
            }
        }
    }

    public void Dispose()
    {
        while (_sceneStack.Count > 0)
            _sceneStack.Pop().Dispose();
    }

    private enum SceneOp { Push, Pop, Replace }
    private record SceneCommand(SceneOp Op, Scene? Scene);
}
```

---

## 3. Shared Services Across Scenes

Since each scene has its own world, you need a mechanism for cross-scene state (audio manager, player save data, global settings). Use a service container injected into every scene.

```csharp
/// <summary>
/// Holds services shared across all scenes. Scenes never own these —
/// the Game class does.
/// </summary>
public class GameServices
{
    public IServiceProvider ContentServiceProvider { get; init; } = null!;
    public GraphicsDevice GraphicsDevice { get; init; } = null!;
    public AudioManager Audio { get; init; } = null!;
    public InputManager Input { get; init; } = null!;
    public PlayerSaveData SaveData { get; init; } = null!;

    /// <summary>
    /// Global event bus for cross-scene communication.
    /// Scenes subscribe on init, unsubscribe on dispose.
    /// Do NOT use this for per-frame gameplay events — use Arch queries for those.
    /// </summary>
    public EventBus GlobalEvents { get; init; } = null!;
}
```

### When to use the global EventBus vs. Arch queries

| Use Case | Mechanism |
|----------|-----------|
| Player finished a battle → notify town scene to update NPC state | `GlobalEvents.Publish(new BattleWonEvent(...))` |
| Move all enemies with `Velocity` component | `World.Query(...)` inside a system |
| Pause button pressed → push pause scene | `SceneManager.Push(new PauseScene())` |
| Achievement unlocked | `GlobalEvents.Publish(new AchievementEvent(...))` |

---

## 4. Async Scene Preloading

Loading a scene blocks the game loop unless you preload assets on a background thread. The pattern: create the scene's world and load content asynchronously, then swap in the scene once ready.

```csharp
/// <summary>
/// Loads a scene's content in the background while the current scene
/// remains interactive. Shows a loading screen as an overlay.
/// </summary>
public class AsyncSceneLoader
{
    private readonly SceneManager _sceneManager;
    private readonly GameServices _services;

    public AsyncSceneLoader(SceneManager sceneManager, GameServices services)
    {
        _sceneManager = sceneManager;
        _services = services;
    }

    /// <summary>
    /// Begin loading a scene in the background.
    /// The loadingScene is pushed immediately as an overlay.
    /// When the target scene finishes loading, the loading overlay is popped
    /// and the target scene replaces the current scene.
    /// </summary>
    public async Task TransitionAsync(
        Scene targetScene,
        LoadingScene loadingScene,
        CancellationToken ct = default)
    {
        // Show loading overlay immediately.
        _sceneManager.Push(loadingScene);

        // Preload content on a background thread.
        // IMPORTANT: MonoGame's ContentManager is NOT thread-safe.
        // We load raw data (file bytes, JSON) on the background thread,
        // then finalize GPU resources on the main thread.
        var preloadData = await Task.Run(
            () => targetScene.PreloadAsync(ct), ct);

        // Back on the main thread: finalize GPU resources and initialize the world.
        targetScene.FinalizeLoad(preloadData, _services);

        // Swap scenes.
        _sceneManager.Pop();                  // remove loading overlay
        _sceneManager.Replace(targetScene);   // replace gameplay scene
    }
}
```

> **Thread safety rule:** Never call `GraphicsDevice`, `ContentManager.Load<T>()`, `Texture2D.SetData()`, or any GPU API from a background thread. Load raw bytes/JSON off-thread, create GPU resources on-thread.

---

## 5. Overlay Scenes with Transparent Worlds

Overlay scenes (pause menu, HUD, dialog boxes) have their own Arch world but draw on top of the scene below. The gameplay scene's world is frozen (not updated) but still drawn.

```csharp
public class PauseScene : Scene
{
    public PauseScene()
    {
        IsOverlay = true; // SceneManager will continue drawing scenes below
    }

    protected override void Initialize()
    {
        // Pause menu entities live in their own world.
        // This keeps them completely isolated from gameplay entities.
        var menuQuery = new QueryDescription().WithAll<MenuItem, UITransform>();

        // Create menu entities...
        World.Create(
            new MenuItem { Label = "Resume", Action = MenuAction.Resume },
            new UITransform { Position = new Vector2(400, 200) }
        );
        World.Create(
            new MenuItem { Label = "Settings", Action = MenuAction.Settings },
            new UITransform { Position = new Vector2(400, 260) }
        );
        World.Create(
            new MenuItem { Label = "Quit", Action = MenuAction.Quit },
            new UITransform { Position = new Vector2(400, 320) }
        );
    }

    public override void Update(GameTime gameTime)
    {
        // Process input against menu entities in THIS world only.
        // The gameplay world below is frozen — its Update is not called.
    }

    public override void Draw(SpriteBatch spriteBatch, GameTime gameTime)
    {
        // Draw a semi-transparent overlay, then render menu entities.
        spriteBatch.Begin();
        // Darken background
        spriteBatch.Draw(Services.PixelTexture,
            new Rectangle(0, 0, 1920, 1080), Color.Black * 0.6f);
        spriteBatch.End();

        // Draw menu items from this scene's world...
    }
}
```

---

## 6. Safe World Disposal and Entity Cleanup

When a scene is popped, its world must be disposed cleanly. This section covers common pitfalls.

### Disposal Checklist

```
✅ Unsubscribe from GlobalEvents in UnloadContent() — prevents dangling callbacks
✅ Cancel any async operations (CancellationTokenSource.Cancel())
✅ Dispose Content (textures, sounds loaded by this scene)
✅ Dispose World (frees Arch's unmanaged archetype memory)
✅ Null out references to prevent use-after-dispose
```

### Common Mistakes

```csharp
// ❌ BAD: Querying a disposed world
scene.Dispose();
scene.World.Query(...); // NullReferenceException or access violation

// ❌ BAD: Forgetting to unsubscribe from global events
protected override void Initialize()
{
    Services.GlobalEvents.Subscribe<BattleWonEvent>(OnBattleWon);
}
// Missing: UnloadContent should call Services.GlobalEvents.Unsubscribe(...)

// ❌ BAD: Disposing during iteration
World.Query(in query, (Entity entity) =>
{
    if (ShouldRemove(entity))
        World.Destroy(entity); // Undefined behavior — modifying during iteration
});

// ✅ GOOD: Use Defer() to batch destruction after the frame
World.Query(in query, (Entity entity) =>
{
    if (ShouldRemove(entity))
        Defer(w => w.Destroy(entity));
});
```

---

## 7. Scene Transitions with World Handoff

Sometimes entities need to persist across a scene transition (e.g., the player entity moving from an overworld scene to a dungeon scene). Since worlds are separate, you serialize the entity's components and recreate it in the new world.

```csharp
/// <summary>
/// Transfers a set of component values from one world to another.
/// Does NOT move the Entity reference — creates a new entity in the target.
/// </summary>
public static class EntityTransfer
{
    /// <summary>
    /// Copy the player entity's components to a new world.
    /// Explicitly list which components to transfer — don't blindly copy everything.
    /// </summary>
    public static Entity TransferPlayer(World source, Entity player, World target)
    {
        // Read components from the source world.
        ref var stats = ref source.Get<PlayerStats>(player);
        ref var inventory = ref source.Get<Inventory>(player);
        ref var position = ref source.Get<Position>(player);

        // Create a fresh entity in the target world with copied values.
        // Position may need remapping (e.g., dungeon entrance coordinates).
        var newPlayer = target.Create(
            stats,              // value copy — not a reference
            inventory,          // value copy
            new Position { X = 100, Y = 200 } // spawn point in new scene
        );

        return newPlayer;
    }
}
```

> **Design note:** Prefer explicit component-by-component transfer over generic reflection-based copying. You almost always need to transform some values (position, scene-specific state) during the transfer.

---

## 8. Practical Example: RPG Scene Flow

A complete flow showing how these patterns compose in a typical RPG:

```
MainMenuScene          →  Push GameplayScene
  World: menu UI           World: overworld entities

GameplayScene          →  Push BattleScene (via async loader)
  World: overworld         World: battle entities + transferred player

BattleScene            →  Push PauseScene (overlay)
  World: battle            World: pause menu UI
  (frozen)                 (draws on top)

PauseScene             →  Pop (resume battle)
BattleScene            →  Pop (battle won → transfer loot back)
GameplayScene          →  Replace with CutsceneScene
  (disposed)               World: cutscene entities

CutsceneScene          →  Replace with GameplayScene
  (disposed)               World: overworld entities (freshly loaded)
```

### Integration in Game1.cs

```csharp
public class Game1 : Game
{
    private SceneManager _sceneManager = null!;
    private SpriteBatch _spriteBatch = null!;

    protected override void Initialize()
    {
        var services = new GameServices
        {
            ContentServiceProvider = Content.ServiceProvider,
            GraphicsDevice = GraphicsDevice,
            Audio = new AudioManager(),
            Input = new InputManager(),
            SaveData = PlayerSaveData.Load(),
            GlobalEvents = new EventBus()
        };

        _sceneManager = new SceneManager(services);
        _sceneManager.Push(new MainMenuScene());

        base.Initialize();
    }

    protected override void LoadContent()
    {
        _spriteBatch = new SpriteBatch(GraphicsDevice);
    }

    protected override void Update(GameTime gameTime)
    {
        _sceneManager.Update(gameTime);
        base.Update(gameTime);
    }

    protected override void Draw(GameTime gameTime)
    {
        GraphicsDevice.Clear(Color.Black);
        _sceneManager.Draw(_spriteBatch, gameTime);
        base.Draw(gameTime);
    }

    protected override void UnloadContent()
    {
        _sceneManager.Dispose();
    }
}
```

---

## Summary

| Pattern | When to Use | Key Rule |
|---------|-------------|----------|
| World-per-scene | Always | One world per scene, dispose on exit |
| Scene stack | Overlays (pause, dialog, HUD) | Top scene gets input, all visible scenes draw |
| Shared services | Cross-scene state (audio, saves) | Inject via `GameServices`, never store in a world |
| Async preloading | Heavy scenes (levels, towns) | Raw data off-thread, GPU resources on main thread |
| Entity transfer | Player persisting across scenes | Explicit component copy, remap positions |
| Deferred actions | Structural changes during frame | Queue via `Defer()`, flush after systems run |
