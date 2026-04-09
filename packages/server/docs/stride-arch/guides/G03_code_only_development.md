# G03 — Code-Only Game Development with Stride Community Toolkit

> **Category:** Guide · **Engine:** Stride · **Related:** [G01 Getting Started](./G01_getting_started.md) · [G02 Bepu Physics](./G02_bepu_physics.md) · [Stride Architecture Rules](../stride-arch-rules.md)

Stride's editor-free, code-only development path lets you build full games using only C#, NuGet packages, and your preferred IDE. No Stride Game Studio installation required. This guide covers setup, the Community Toolkit API, scene construction, asset loading, physics integration, and when code-only is the right choice.

---

## Table of Contents

1. [Why Code-Only?](#1--why-code-only)
2. [Prerequisites](#2--prerequisites)
3. [Project Setup](#3--project-setup)
4. [The Game Bootstrap Pattern](#4--the-game-bootstrap-pattern)
5. [Scene Construction](#5--scene-construction)
6. [3D Primitives and Materials](#6--3d-primitives-and-materials)
7. [Input Handling](#7--input-handling)
8. [Camera and Lighting](#8--camera-and-lighting)
9. [Adding Physics with Bepu](#9--adding-physics-with-bepu)
10. [Custom Scripts in Code-Only](#10--custom-scripts-in-code-only)
11. [Loading External Assets](#11--loading-external-assets)
12. [UI in Code-Only Projects](#12--ui-in-code-only-projects)
13. [Limitations and Workarounds](#13--limitations-and-workarounds)
14. [When to Choose Code-Only vs. Editor](#14--when-to-choose-code-only-vs-editor)

---

## 1 — Why Code-Only?

Stride Game Studio is a powerful editor, but it requires a Windows machine and a substantial installation. The code-only approach offers several advantages:

- **No editor installation** — just NuGet packages and `dotnet new`
- **Cross-platform development** — write on Linux, macOS, or Windows
- **Familiar workflow** — IDE + terminal, like any .NET project
- **Fast iteration** — compile and run, no editor startup time
- **CI/CD friendly** — builds with `dotnet build`, no GUI required
- **Learning C# and game dev** — start with pure code, add the editor later if needed

### Who is code-only for?

- Developers who prefer code-first workflows (coming from MonoGame, FNA, Raylib, etc.)
- Rapid prototyping where editor overhead slows you down
- Jam games and experiments
- Headless servers or tools that use Stride's rendering without the editor
- Linux and macOS developers (Game Studio only runs on Windows)

## 2 — Prerequisites

- **.NET 10 SDK** (Stride 4.3 targets .NET 10)
- **A C# IDE** — Rider, VS Code with C# Dev Kit, or Visual Studio
- **NuGet access** — the Community Toolkit ships via NuGet
- **GPU with Vulkan, D3D11, or Metal support** (for rendering)

```bash
# Verify .NET 10 is installed
dotnet --list-sdks
# Should show 10.x.xxx

# Verify NuGet source
dotnet nuget list source
# Should include https://api.nuget.org/v3/index.json
```

## 3 — Project Setup

### Using the Community Toolkit template

```bash
# Install the Stride Community Toolkit templates (if not already installed)
dotnet new install Stride.CommunityToolkit.Templates

# Create a new code-only project
dotnet new stride-code-only -n MyGame
cd MyGame

# Build and run
dotnet run
```

### Manual setup (from scratch)

Create a new console project and add the toolkit NuGet package:

```bash
dotnet new console -n MyGame
cd MyGame
dotnet add package Stride.CommunityToolkit.Windows
# For Linux: dotnet add package Stride.CommunityToolkit.Linux
```

Your `.csproj` should reference the toolkit:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>WinExe</OutputType>
    <TargetFramework>net10.0</TargetFramework>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Stride.CommunityToolkit.Windows" Version="4.3.*" />
    <!-- For Bepu physics support: -->
    <PackageReference Include="Stride.CommunityToolkit.Bepu" Version="4.3.*" />
  </ItemGroup>
</Project>
```

**Note:** Use `WinExe` as the output type, not `Exe`. This prevents a console window from appearing alongside the game window on Windows.

## 4 — The Game Bootstrap Pattern

The Community Toolkit provides extension methods on `Game` that simplify startup:

```csharp
using Stride.CommunityToolkit.Engine;
using Stride.CommunityToolkit.Rendering.ProceduralModels;
using Stride.Engine;

var game = new Game();

game.Run(start: (Scene rootScene) =>
{
    // Called once when the game starts
    // Set up your initial scene here
    game.SetupBase3DScene();

    // Add a cube to the scene
    var cube = game.Create3DPrimitive(PrimitiveModelType.Cube);
    cube.Transform.Position = new Stride.Core.Mathematics.Vector3(0, 0.5f, 0);
    rootScene.Entities.Add(cube);
});
```

### Understanding `SetupBase3DScene()`

This helper method creates a standard 3D scene with:

- A **directional light** (simulating sunlight)
- A **camera** with default orbit/position
- A **skybox** (procedural)
- A **ground plane**

For full control, skip `SetupBase3DScene()` and create each element yourself.

### Game lifecycle callbacks

```csharp
game.Run(
    start: (Scene rootScene) =>
    {
        // One-time setup
    },
    update: (Scene rootScene, GameTime gameTime) =>
    {
        // Called every frame — put game logic here
        var dt = (float)gameTime.Elapsed.TotalSeconds;
    }
);
```

## 5 — Scene Construction

In code-only Stride, you build scenes by creating entities and adding them to the root scene.

### Entity creation pattern

```csharp
// Create an empty entity
var entity = new Entity("MyEntity");

// Set position
entity.Transform.Position = new Vector3(2, 0, -3);

// Add components
entity.Add(new ModelComponent { Model = myModel });

// Add to scene
rootScene.Entities.Add(entity);
```

### Hierarchical entities

```csharp
var parent = new Entity("Parent");
var child = new Entity("Child");

// Child's transform is relative to parent
child.Transform.Position = new Vector3(0, 1, 0); // 1 unit above parent

parent.AddChild(child);
rootScene.Entities.Add(parent);
```

### Removing entities

```csharp
rootScene.Entities.Remove(entity);
// or
entity.Scene = null;
```

## 6 — 3D Primitives and Materials

The Community Toolkit provides helpers for creating common 3D shapes:

```csharp
// Available primitive types
var cube = game.Create3DPrimitive(PrimitiveModelType.Cube);
var sphere = game.Create3DPrimitive(PrimitiveModelType.Sphere);
var cylinder = game.Create3DPrimitive(PrimitiveModelType.Cylinder);
var plane = game.Create3DPrimitive(PrimitiveModelType.Plane);
var capsule = game.Create3DPrimitive(PrimitiveModelType.Capsule);
var torus = game.Create3DPrimitive(PrimitiveModelType.Torus);
var cone = game.Create3DPrimitive(PrimitiveModelType.Cone);
```

### Custom materials

```csharp
using Stride.Rendering.Materials;
using Stride.Rendering.Materials.ComputeColors;

// Create a colored material
var material = Material.New(game.GraphicsDevice, new MaterialDescriptor
{
    Attributes =
    {
        Diffuse = new MaterialDiffuseMapFeature(
            new ComputeColor(new Color4(1.0f, 0.2f, 0.2f, 1.0f)) // Red
        ),
        DiffuseModel = new MaterialDiffuseLambertModelFeature()
    }
});

// Apply to entity
var entity = game.Create3DPrimitive(PrimitiveModelType.Sphere);
var modelComponent = entity.Get<ModelComponent>();
if (modelComponent != null)
{
    modelComponent.Materials[0] = material;
}
```

## 7 — Input Handling

Access input through the game's `Input` service:

```csharp
game.Run(
    start: (Scene rootScene) =>
    {
        game.SetupBase3DScene();
    },
    update: (Scene rootScene, GameTime gameTime) =>
    {
        var input = game.Input;

        // Keyboard
        if (input.IsKeyDown(Stride.Input.Keys.W))
        {
            // Move forward
        }

        if (input.IsKeyPressed(Stride.Input.Keys.Space))
        {
            // Jump (single press, not held)
        }

        // Mouse
        var mouseDelta = input.MouseDelta;
        var mousePosition = input.MousePosition; // Normalized 0-1

        if (input.IsMouseButtonDown(Stride.Input.MouseButton.Left))
        {
            // Left click held
        }

        // Gamepad
        if (input.GamePadCount > 0)
        {
            var leftStick = input.GetGamePadByIndex(0).State.LeftThumb;
        }
    }
);
```

### Key vs. KeyDown vs. KeyReleased

| Method | Fires |
|--------|-------|
| `IsKeyPressed(key)` | Once, on the frame the key is first pressed |
| `IsKeyDown(key)` | Every frame while the key is held |
| `IsKeyReleased(key)` | Once, on the frame the key is released |

## 8 — Camera and Lighting

### Manual camera setup (without `SetupBase3DScene`)

```csharp
// Create camera entity
var cameraEntity = new Entity("Camera");
var camera = new CameraComponent
{
    Projection = CameraProjectionMode.Perspective,
    NearClipPlane = 0.1f,
    FarClipPlane = 1000f,
    VerticalFieldOfView = 60 // degrees
};
cameraEntity.Add(camera);
cameraEntity.Transform.Position = new Vector3(0, 5, -10);
cameraEntity.Transform.Rotation = Quaternion.RotationX(
    MathUtil.DegreesToRadians(30)
);

// Set as active camera
var graphicsCompositor = game.SceneSystem.GraphicsCompositor;
// The compositor's camera slot must point to this camera

rootScene.Entities.Add(cameraEntity);
```

### Lighting

```csharp
// Directional light (sun)
var lightEntity = new Entity("Directional Light");
lightEntity.Add(new LightComponent
{
    Type = new LightDirectional
    {
        Color = new ColorRgbProvider(Color.White),
        Shadow = { Enabled = true }
    },
    Intensity = 1.0f
});
lightEntity.Transform.Rotation = Quaternion.RotationX(
    MathUtil.DegreesToRadians(-45)
);
rootScene.Entities.Add(lightEntity);

// Point light
var pointLight = new Entity("Point Light");
pointLight.Add(new LightComponent
{
    Type = new LightPoint
    {
        Color = new ColorRgbProvider(Color.Yellow),
        Radius = 10f
    },
    Intensity = 2.0f
});
pointLight.Transform.Position = new Vector3(3, 4, 0);
rootScene.Entities.Add(pointLight);
```

## 9 — Adding Physics with Bepu

The Community Toolkit provides Bepu physics helpers for code-only projects:

```bash
dotnet add package Stride.CommunityToolkit.Bepu
```

```csharp
using Stride.CommunityToolkit.Bepu;

game.Run(start: (Scene rootScene) =>
{
    game.SetupBase3DScene();

    // Create a static ground plane with physics
    var ground = game.Create3DPrimitive(PrimitiveModelType.Plane);
    // The toolkit can attach Bepu static bodies to primitives

    // Create a dynamic physics cube
    var cube = game.Create3DPrimitive(PrimitiveModelType.Cube, new()
    {
        PhysicsComponent = new RigidbodyComponent()
    });
    cube.Transform.Position = new Vector3(0, 5, 0); // Drop from height

    rootScene.Entities.Add(ground);
    rootScene.Entities.Add(cube);
});
```

### Manual Bepu body creation

For finer control, create physics bodies directly:

```csharp
using Stride.BepuPhysics;

// On an entity that already has a ModelComponent:
var rigidBody = new RigidbodyComponent
{
    // Bepu body configuration
    ColliderShape = new BoxColliderShape(new Vector3(1, 1, 1)),
    Mass = 1.0f,
    // Restitution, friction, etc.
};
entity.Add(rigidBody);
```

Refer to [G02 Bepu Physics Fundamentals](./G02_bepu_physics.md) for comprehensive physics coverage.

## 10 — Custom Scripts in Code-Only

You can still use Stride's script system (`SyncScript`, `AsyncScript`) in code-only projects:

```csharp
public class RotatorScript : SyncScript
{
    public float Speed { get; set; } = 1.0f;

    public override void Update()
    {
        var dt = (float)Game.UpdateTime.Elapsed.TotalSeconds;
        Entity.Transform.Rotation *= Quaternion.RotationY(Speed * dt);
    }
}

// Attach in your setup
game.Run(start: (Scene rootScene) =>
{
    game.SetupBase3DScene();

    var cube = game.Create3DPrimitive(PrimitiveModelType.Cube);
    cube.Add(new RotatorScript { Speed = 2.0f });
    rootScene.Entities.Add(cube);
});
```

### AsyncScript for sequences

```csharp
public class SpawnSequence : AsyncScript
{
    public override async Task Execute()
    {
        while (Game.IsRunning)
        {
            // Spawn an entity every 2 seconds
            var sphere = ((Game)Game).Create3DPrimitive(PrimitiveModelType.Sphere);
            sphere.Transform.Position = new Vector3(
                Random.Shared.NextSingle() * 10 - 5,
                5,
                Random.Shared.NextSingle() * 10 - 5
            );
            Entity.Scene.Entities.Add(sphere);

            // Wait 2 seconds (non-blocking)
            await Script.NextFrame(); // wait one frame
            // Or for time-based:
            // Use a frame-counting approach since Task.Delay isn't synced to game time
        }
    }
}
```

## 11 — Loading External Assets

Code-only projects can still load pre-built assets, but without the editor's asset pipeline you have several options:

### Procedural generation

Create everything in code — models, materials, textures. Best for prototyping and generated content.

### Raw file loading

```csharp
// Load a texture from a file
using var stream = File.OpenRead("Assets/myTexture.png");
var texture = Texture.Load(game.GraphicsDevice, stream);
```

### Using the asset compiler standalone

You can invoke Stride's asset compiler from the command line to process assets without the editor:

```bash
# Build assets from command line
dotnet stride-assets build -p MyGame.sdpkg
```

This produces `.bundle` files that `ContentManager` can load:

```csharp
var model = Content.Load<Model>("Models/MyModel");
```

### Hybrid approach

Start code-only for prototyping, then add the editor later for asset-heavy production work. The code-only bootstrap and editor-based projects can share the same game logic code.

## 12 — UI in Code-Only Projects

Stride's built-in UI system works in code-only mode:

```csharp
using Stride.UI;
using Stride.UI.Controls;
using Stride.UI.Panels;

// Create a simple UI
var canvas = new Canvas();

var textBlock = new TextBlock
{
    Text = "Score: 0",
    Font = game.Content.Load<SpriteFont>("Fonts/Default"),
    TextColor = Color.White,
    TextSize = 24
};

canvas.Children.Add(textBlock);

// Create UI entity
var uiEntity = new Entity("UI");
uiEntity.Add(new UIComponent
{
    Page = new UIPage { RootElement = canvas },
    Resolution = new Vector3(1920, 1080, 1000)
});
rootScene.Entities.Add(uiEntity);
```

For simpler UI needs (debug text, HUD), consider rendering text directly with `SpriteBatch` instead of the full UI system.

## 13 — Limitations and Workarounds

| Limitation | Workaround |
|-----------|-----------|
| No visual scene editor | Build scenes in code; use hot-reload for fast iteration |
| No material editor | Create materials programmatically (see Section 6) |
| No prefab system | Create factory methods/classes that build entity hierarchies |
| No visual asset import | Use standalone asset compiler or load raw files |
| No animation editor | Set up animation clips and state machines in code |
| Graphics compositor setup | Use `SetupBase3DScene()` or configure compositor in code |

### Creating a "prefab" pattern in code

```csharp
public static class EnemyPrefab
{
    public static Entity Create(Game game, Vector3 position)
    {
        var entity = new Entity("Enemy");
        entity.Transform.Position = position;

        var model = game.Create3DPrimitive(PrimitiveModelType.Capsule);
        // Copy model component to our entity
        entity.Add(model.Get<ModelComponent>());
        entity.Add(new EnemyAIScript());
        entity.Add(new HealthComponent { MaxHealth = 100 });

        return entity;
    }
}

// Usage
var enemy = EnemyPrefab.Create(game, new Vector3(5, 0, 3));
rootScene.Entities.Add(enemy);
```

## 14 — When to Choose Code-Only vs. Editor

### Choose code-only when

- You're on Linux or macOS (Game Studio is Windows-only)
- You want minimal installation — just `dotnet` and NuGet
- You're prototyping or game-jamming and want fast startup
- Your game is primarily procedural (generated levels, simulations)
- You're building a headless server or tool
- You prefer the MonoGame/FNA style workflow but want Stride's rendering and physics

### Choose the editor when

- Your game is asset-heavy (many models, materials, animations)
- You have artists or designers who need visual tools
- You want the scene graph, prefab system, and visual debugging
- You need the animation editor or particle editor
- Your project is large enough to justify the editor's organizational benefits

### Hybrid approach

Start code-only, migrate to editor when the project grows:

1. Keep all game logic in shared libraries
2. Use the code-only project for development and testing
3. Create an editor project that references the same game logic
4. Use the editor for asset management and scene composition
5. Game logic works identically in both contexts

---

> **Next steps:** For physics setup details, see [G02 Bepu Physics Fundamentals](./G02_bepu_physics.md). For general Stride architecture, see the [Stride Architecture Rules](../stride-arch-rules.md).
