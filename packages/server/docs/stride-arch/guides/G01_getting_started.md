# G01 — Getting Started with Stride

> **Category:** Guide · **Engine:** Stride · **Related:** [Stride Architecture Rules](../stride-arch-rules.md)

Stride is a free, open-source C# game engine with an integrated editor (Game Studio), PBR rendering, physics, and a full asset pipeline. This guide walks through installation, project creation, the entity-component-script model, and building your first interactive scene. Stride 4.3 targets .NET 10 with C# 14, uses Bepu Physics v2, and supports Vulkan, DirectX 11/12, and OpenGL backends.

---

## Table of Contents

1. [Installation](#1--installation)
2. [Creating a Project](#2--creating-a-project)
3. [Project Structure](#3--project-structure)
4. [Entity-Component Model](#4--entity-component-model)
5. [Script Types](#5--script-types)
6. [Your First Script — Player Movement](#6--your-first-script--player-movement)
7. [Working with Input](#7--working-with-input)
8. [Loading and Managing Scenes](#8--loading-and-managing-scenes)
9. [Code-Only Projects (No Editor)](#9--code-only-projects-no-editor)
10. [Building and Running](#10--building-and-running)
11. [Key Differences from MonoGame/FNA](#11--key-differences-from-monogamefna)
12. [Next Steps](#12--next-steps)

---

## 1 — Installation

### Prerequisites

- **Windows 10/11** (Game Studio editor is Windows-only; runtime is cross-platform)
- **.NET 10 SDK** (Stride 4.3 requirement)
- **Visual Studio 2022+**, **JetBrains Rider**, or **VS Code** with C# extension
- **GPU** supporting DirectX 11, Vulkan, or OpenGL 4.5+

### Install via Stride Launcher

1. Download the Stride Launcher from [stride3d.net/download](https://www.stride3d.net/download/).
2. Run the installer. The launcher manages Stride versions and prerequisites.
3. In the launcher, click **Install** next to the latest Stride version (4.3+).
4. Once installed, click **Start** to open Game Studio.

### Install via NuGet (code-only)

For projects that don't use the editor, add Stride packages directly:

```bash
dotnet new console -n MyStrideGame
cd MyStrideGame
dotnet add package Stride.Engine
dotnet add package Stride.CommunityToolkit
```

## 2 — Creating a Project

### From Game Studio

1. Open Stride Game Studio via the launcher.
2. Select **File → New** or use the welcome dialog.
3. Choose a template:
   - **New Game** — full project with a default scene, camera, directional light, and a basic script.
   - **Empty Project** — minimal scene with only a camera and light. Good for starting from scratch.
4. Name your project and choose a location.
5. Click **Create**.

Game Studio generates a Visual Studio solution with platform-specific projects.

### Project Templates

| Template | Contents | Best For |
|----------|----------|----------|
| New Game | Scene, camera, light, camera script | Learning, prototyping |
| Empty Project | Minimal scene, rendering pipeline | Starting clean |

## 3 — Project Structure

A newly created Stride project has this layout:

```
MyGame/
├── MyGame.sln                    # Visual Studio solution
├── MyGame/
│   ├── MyGame.csproj             # Main game project
│   ├── MyGame.sdpkg              # Stride package descriptor (asset DB root)
│   ├── Assets/
│   │   ├── Scenes/
│   │   │   └── MainScene.sdscene # Default scene
│   │   ├── Materials/            # PBR materials
│   │   ├── Models/               # 3D models (.fbx, .gltf imports)
│   │   ├── Textures/             # Texture assets
│   │   ├── Prefabs/              # Reusable entity templates
│   │   └── Scripts/              # C# scripts (compiled into game assembly)
│   ├── Effects/                  # Custom SDSL shaders
│   └── bin/                      # Build output
├── MyGame.Windows/               # Windows launcher project
│   └── MyGameApp.cs              # Entry point (calls Game.Run())
├── MyGame.Linux/                 # Linux launcher (optional)
└── MyGame.Android/               # Android launcher (optional)
```

### Key Files

- **`.sdpkg`** — the Stride package file. It tells Game Studio where assets live and what dependencies the project has. Don't edit manually.
- **`.sdscene`** — scene files, serialized as YAML. Edited in Game Studio's scene editor.
- **`.csproj`** — standard .NET project file. Stride NuGet packages are referenced here.

## 4 — Entity-Component Model

Stride uses a **component-based entity system** (similar to Unity). This is not a pure ECS like Arch — components in Stride can contain both data and behavior.

### Core Concepts

| Concept | Description |
|---------|-------------|
| **Entity** | A container with a `Transform` and a list of components. Every object in the scene is an Entity. |
| **Component** | A piece of functionality attached to an Entity. Can be built-in (ModelComponent, LightComponent) or custom (your scripts). |
| **Script** | A special Component that provides lifecycle methods (`Start`, `Update`, `Cancel`). This is where you write game logic. |

### Entity Hierarchy

Entities form a parent-child tree through their Transform component. A child entity's position, rotation, and scale are relative to its parent.

```csharp
// Creating entities in code
var parentEntity = new Entity("Player");
parentEntity.Transform.Position = new Vector3(0, 1, 0);

var childEntity = new Entity("Weapon");
childEntity.Transform.Position = new Vector3(0.5f, 0, 0); // Offset from parent

parentEntity.AddChild(childEntity);
SceneSystem.SceneInstance.RootScene.Entities.Add(parentEntity);
```

### Built-in Components

| Component | Purpose |
|-----------|---------|
| `TransformComponent` | Position, rotation, scale (always present) |
| `ModelComponent` | 3D model rendering |
| `LightComponent` | Point, directional, spot, or ambient light |
| `CameraComponent` | Scene camera |
| `SpriteComponent` | 2D sprite rendering |
| `AudioEmitterComponent` | 3D positional audio source |
| `RigidbodyComponent` | Physics body (Bepu in 4.3+) |
| `CharacterComponent` | Physics character controller |

## 5 — Script Types

Stride provides three script base classes for different use cases:

### SyncScript — Per-Frame Logic

Called every frame. Use for continuous gameplay logic like movement, input polling, and animation updates.

```csharp
using Stride.Engine;

public class RotateScript : SyncScript
{
    /// <summary>
    /// Rotation speed in degrees per second. Editable in Game Studio.
    /// </summary>
    public float Speed { get; set; } = 45f;

    public override void Start()
    {
        // Called once when the script is first activated
    }

    public override void Update()
    {
        var dt = (float)Game.UpdateTime.Elapsed.TotalSeconds;
        Entity.Transform.Rotation *= Quaternion.RotationY(
            MathUtil.DegreesToRadians(Speed * dt));
    }
}
```

### AsyncScript — Coroutine-Style Logic

Uses `async/await` for sequences, delays, and event-driven logic. The `Execute` method runs once and can await frame ticks, time delays, or custom conditions.

```csharp
using Stride.Engine;

public class SpawnWaveScript : AsyncScript
{
    public float DelayBetweenWaves { get; set; } = 5f;
    public Prefab EnemyPrefab { get; set; }

    public override async Task Execute()
    {
        while (Game.IsRunning)
        {
            // Wait before spawning next wave
            await Task.Delay(TimeSpan.FromSeconds(DelayBetweenWaves));

            // Spawn enemies from prefab
            if (EnemyPrefab != null)
            {
                var entities = EnemyPrefab.Instantiate();
                foreach (var entity in entities)
                {
                    Entity.Scene.Entities.Add(entity);
                }
            }

            // Wait one frame to avoid spawning multiple waves in the same frame
            await Script.NextFrame();
        }
    }
}
```

### StartupScript — One-Time Initialization

Runs once at startup. Use for scene setup, loading data, or registering services.

```csharp
using Stride.Engine;

public class GameInitScript : StartupScript
{
    public override void Start()
    {
        // One-time initialization
        Log.Info("Game initialized!");
    }

    public override void Cancel()
    {
        // Cleanup when the script is removed or the scene unloads
    }
}
```

## 6 — Your First Script — Player Movement

Create a new C# file in your project's script folder:

```csharp
using Stride.Core.Mathematics;
using Stride.Engine;
using Stride.Input;

public class PlayerMovement : SyncScript
{
    public float MoveSpeed { get; set; } = 5.0f;
    public float RotationSpeed { get; set; } = 180f;

    public override void Update()
    {
        var dt = (float)Game.UpdateTime.Elapsed.TotalSeconds;
        var moveDirection = Vector3.Zero;

        // Read input
        if (Input.IsKeyDown(Keys.W)) moveDirection += Entity.Transform.WorldMatrix.Forward;
        if (Input.IsKeyDown(Keys.S)) moveDirection -= Entity.Transform.WorldMatrix.Forward;
        if (Input.IsKeyDown(Keys.A)) moveDirection -= Entity.Transform.WorldMatrix.Right;
        if (Input.IsKeyDown(Keys.D)) moveDirection += Entity.Transform.WorldMatrix.Right;

        // Normalize to prevent faster diagonal movement
        if (moveDirection.LengthSquared() > 0.001f)
        {
            moveDirection.Normalize();
            Entity.Transform.Position += moveDirection * MoveSpeed * dt;
        }

        // Mouse rotation (horizontal only)
        if (Input.IsMouseButtonDown(MouseButton.Right))
        {
            var mouseDelta = Input.MouseDelta;
            Entity.Transform.Rotation *= Quaternion.RotationY(
                MathUtil.DegreesToRadians(-mouseDelta.X * RotationSpeed * dt));
        }
    }
}
```

### Attaching the Script

1. In Game Studio, select the entity you want to control.
2. In the **Property Grid**, click **Add component**.
3. Search for your script name (e.g., "PlayerMovement").
4. Adjust exposed properties (`MoveSpeed`, `RotationSpeed`) in the editor.

Public properties with `{ get; set; }` are automatically exposed in Game Studio's property editor.

## 7 — Working with Input

Stride's `Input` service (accessible as `this.Input` in scripts) provides keyboard, mouse, gamepad, and touch input.

### Keyboard

```csharp
// Held down (continuous)
if (Input.IsKeyDown(Keys.Space)) { /* jumping */ }

// Just pressed this frame
if (Input.IsKeyPressed(Keys.E)) { /* interact */ }

// Just released this frame
if (Input.IsKeyReleased(Keys.Escape)) { /* open menu */ }
```

### Mouse

```csharp
// Mouse position in normalized screen coordinates (0,0 = top-left, 1,1 = bottom-right)
Vector2 mousePos = Input.MousePosition;

// Mouse movement delta since last frame
Vector2 delta = Input.MouseDelta;

// Mouse buttons
if (Input.IsMouseButtonPressed(MouseButton.Left)) { /* fire */ }

// Lock cursor for FPS-style look
Input.LockMousePosition(true);
Game.IsMouseVisible = false;
```

### Gamepad

```csharp
// Check if a gamepad is connected
if (Input.GamePadCount > 0)
{
    var gamepad = Input.DefaultGamePad;
    var leftStick = gamepad.State.LeftThumb;
    var rightStick = gamepad.State.RightThumb;

    if (gamepad.IsButtonPressed(GamePadButton.A)) { /* jump */ }
}
```

## 8 — Loading and Managing Scenes

### Loading a Scene

```csharp
public class SceneLoader : AsyncScript
{
    public UrlReference<Scene> NextSceneUrl { get; set; }

    public override async Task Execute()
    {
        while (Game.IsRunning)
        {
            if (Input.IsKeyPressed(Keys.Enter) && NextSceneUrl != null)
            {
                // Load scene asset
                var nextScene = Content.Load(NextSceneUrl);

                // Replace current scene
                SceneSystem.SceneInstance.RootScene = nextScene;
            }

            await Script.NextFrame();
        }
    }
}
```

### Scene Composition

Stride supports **child scenes** — a scene can reference other scenes, which are loaded as sub-scenes. This is useful for:

- Persistent UI overlaid on gameplay scenes
- Streaming levels (load/unload sub-scenes as the player moves)
- Shared environment elements across multiple levels

## 9 — Code-Only Projects (No Editor)

Using the Stride Community Toolkit, you can create games without Game Studio:

```csharp
using Stride.CommunityToolkit.Engine;
using Stride.CommunityToolkit.Rendering.ProceduralModels;
using Stride.Core.Mathematics;
using Stride.Engine;

var game = new Game();

game.Run(start: (Scene rootScene) =>
{
    // Set up a basic 3D scene with camera, light, and skybox
    game.SetupBase3DScene();

    // Add a ground plane
    var ground = game.Create3DPrimitive(PrimitiveModelType.Plane);
    ground.Transform.Position = new Vector3(0, 0, 0);
    ground.Transform.Scale = new Vector3(10, 1, 10);
    rootScene.Entities.Add(ground);

    // Add a cube
    var cube = game.Create3DPrimitive(PrimitiveModelType.Cube);
    cube.Transform.Position = new Vector3(0, 0.5f, 0);
    rootScene.Entities.Add(cube);

    // Add a custom script to the cube
    cube.Add(new RotateScript { Speed = 90f });
});
```

Install the toolkit:

```bash
dotnet add package Stride.CommunityToolkit
```

Code-only projects are great for procedural content, tools, simulations, and developers who prefer full programmatic control.

## 10 — Building and Running

### From Game Studio

- Press **F5** or click the **Play** button to run in the editor.
- Game Studio compiles scripts automatically when it detects changes.

### From Command Line

```bash
# Build the solution
dotnet build MyGame.sln

# Run the Windows project
dotnet run --project MyGame.Windows

# Publish a release build for Linux
dotnet publish MyGame.Linux -c Release -r linux-x64 --self-contained

# Restore NuGet packages (first time or after adding dependencies)
dotnet restore MyGame.sln
```

### Hot Reload

Stride supports **script hot-reload** during Play mode in Game Studio. Edit a script in your IDE, save, and Game Studio recompiles and reloads it without restarting the game. This works for `SyncScript` and `AsyncScript` logic changes, though adding new components or changing serialized data structures requires a full restart.

## 11 — Key Differences from MonoGame/FNA

| Aspect | Stride | MonoGame / FNA |
|--------|--------|----------------|
| **Architecture** | Component-based with editor | Code-first framework |
| **Game loop** | Engine-managed; you write scripts | You own `Update()` and `Draw()` |
| **Rendering** | PBR pipeline, post-processing stack | SpriteBatch, custom shaders |
| **Physics** | Bepu Physics built-in | Integrate your own (Aether.Physics2D, etc.) |
| **Assets** | Editor-managed, auto-compiled | MGCB tool or raw loading |
| **Shaders** | SDSL (cross-compiles to HLSL/GLSL/SPIR-V) | HLSL with MGFX or FXC |
| **Scene management** | Built-in scene graph with prefabs | You build your own |
| **Async in game loop** | Supported (AsyncScript) | Not recommended |
| **UI** | Built-in UI system | You build or use a library |

### Coming from MonoGame?

- Your `Game1.Update()` logic goes into `SyncScript.Update()` methods, split across entities.
- Your `Game1.Draw()` is handled by the rendering pipeline. You configure materials and models rather than issuing draw calls.
- `ContentManager.Load<T>()` becomes `Content.Load<T>()` with URL-based asset references.
- Input API is similar but accessed via `this.Input` instead of static `Keyboard.GetState()`.

## 12 — Next Steps

With a project set up and your first script running, explore these areas:

- **Materials and PBR** — learn Stride's material system for realistic rendering
- **Bepu Physics** — add rigid bodies, colliders, and constraints for physical interaction
- **SDSL Shaders** — write custom visual effects using Stride's shader composition system
- **UI System** — build in-game HUDs and menus with Stride's built-in UI framework
- **Prefabs** — create reusable entity templates for enemies, pickups, and environment pieces
- **Audio** — attach `AudioEmitterComponent` for 3D positional sound
