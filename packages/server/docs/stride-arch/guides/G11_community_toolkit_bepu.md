# G11 — Stride Community Toolkit & Bepu Physics

> **Category:** guide · **Engine:** Stride · **Related:** [G01 Getting Started](./G01_getting_started.md) · [G02 Bepu Physics](./G02_bepu_physics.md) · [G03 Code-Only Development](./G03_code_only_development.md)

How to use the Stride Community Toolkit for rapid code-only game development with Bepu physics in Stride 4.3+. Covers project setup, the toolkit's helper extensions, scene composition without Game Studio, Bepu rigid body creation through toolkit primitives, and practical patterns for building complete games entirely in C#. The Community Toolkit is the recommended way to do code-only Stride development as of 2025 — it wraps the verbose Stride entity/component APIs into concise builder-pattern helpers.

---

## Why the Community Toolkit?

Stride's default workflow centers on Game Studio — a visual editor for scenes, assets, and entity composition. This works well for artists and level designers, but many C# developers prefer a code-first approach where the game is defined entirely in `.cs` files with no editor dependency.

Stride has always supported code-only development (see [G03](./G03_code_only_development.md)), but the raw APIs are verbose. Creating a simple 3D capsule with physics requires manually assembling an Entity, attaching ModelComponent, adding collision shapes, configuring rigid body parameters, and wiring everything to the scene graph. The Community Toolkit provides extension methods that collapse this into single-line calls while remaining fully customizable.

The toolkit also standardizes Bepu physics integration — Stride 4.3's major new physics backend — with ready-made helpers that handle the Bepu setup that would otherwise require understanding the engine's internal physics pipeline.

## Project Setup

### 1. Create a Console Application

Start with a standard .NET console project targeting .NET 10 (Stride 4.3's runtime):

```bash
dotnet new console -n MyStrideGame
cd MyStrideGame
```

### 2. Add NuGet Packages

The toolkit is distributed as NuGet pre-release packages:

```bash
dotnet add package Stride.CommunityToolkit.Bepu --prerelease
dotnet add package Stride.CommunityToolkit.Skyboxes --prerelease
dotnet add package Stride.CommunityToolkit.Windows --prerelease
```

These pull in the full Stride runtime as transitive dependencies. No Game Studio installation required for code-only projects.

### 3. Minimal Entry Point

```csharp
using Stride.CommunityToolkit.Bepu;
using Stride.CommunityToolkit.Engine;
using Stride.CommunityToolkit.Skyboxes;
using Stride.Engine;

using var game = new Game();

game.Run(start: Start);

void Start(Scene rootScene)
{
    game.SetupBase3DScene();
    game.AddSkybox();

    var capsule = game.Create3DPrimitive(PrimitiveModelType.Capsule);
    capsule.Transform.Position = new Stride.Core.Mathematics.Vector3(0, 8, 0);
    capsule.Scene = rootScene;
}
```

This creates a window with a 3D scene (camera, directional light, ground plane), a skybox, and a capsule that falls under Bepu gravity. Under 15 lines of code.

## Toolkit Extension Methods

The Community Toolkit adds extension methods to the `Game` class. These are the most frequently used:

### Scene Setup

```csharp
// Creates camera, directional light, and a ground plane with Bepu physics
game.SetupBase3DScene();

// Adds a procedural skybox (no asset file needed)
game.AddSkybox();

// Sets up a base 2D scene with orthographic camera
game.SetupBase2DScene();
```

### Primitive Creation

```csharp
// Create primitives with automatic Bepu rigid body and collider
var box = game.Create3DPrimitive(PrimitiveModelType.Box);
var sphere = game.Create3DPrimitive(PrimitiveModelType.Sphere);
var capsule = game.Create3DPrimitive(PrimitiveModelType.Capsule);
var cylinder = game.Create3DPrimitive(PrimitiveModelType.Cylinder);
var plane = game.Create3DPrimitive(PrimitiveModelType.Plane);
var torus = game.Create3DPrimitive(PrimitiveModelType.Torus);

// Create a primitive without physics (static decoration)
var staticBox = game.Create3DPrimitive(
    PrimitiveModelType.Box,
    new() { IncludeCollider = false }
);
```

Each primitive comes with:
- A `ModelComponent` with a procedural mesh and default material
- A Bepu `RigidbodyComponent` (dynamic by default)
- A matching Bepu collider shape
- Proper entity transform

### Primitive Options

Customize primitives through `PrimitiveCreationOptions`:

```csharp
var customBox = game.Create3DPrimitive(PrimitiveModelType.Box, new()
{
    Size = new Vector3(2, 0.5f, 2),       // Custom dimensions
    IncludeCollider = true,                 // Include Bepu physics (default: true)
    Material = myMaterial,                  // Custom material
    RenderGroup = RenderGroup.Group0,       // Render layer
});
```

## Adding Gameplay Logic

### Script Components

Stride uses `ScriptComponent` subclasses for entity behavior. Attach them to toolkit-created entities:

```csharp
using Stride.Engine;
using Stride.Input;
using Stride.Core.Mathematics;

public class PlayerController : SyncScript
{
    public float Speed = 5.0f;

    public override void Update()
    {
        var move = Vector3.Zero;

        if (Input.IsKeyDown(Keys.W)) move.Z -= 1;
        if (Input.IsKeyDown(Keys.S)) move.Z += 1;
        if (Input.IsKeyDown(Keys.A)) move.X -= 1;
        if (Input.IsKeyDown(Keys.D)) move.X += 1;

        if (move.Length() > 0)
        {
            move.Normalize();
            Entity.Transform.Position += move * Speed * (float)Game.UpdateTime.Elapsed.TotalSeconds;
        }
    }
}
```

Attach it in the Start callback:

```csharp
void Start(Scene rootScene)
{
    game.SetupBase3DScene();

    var player = game.Create3DPrimitive(PrimitiveModelType.Capsule);
    player.Transform.Position = new Vector3(0, 2, 0);
    player.Add(new PlayerController());
    player.Scene = rootScene;
}
```

### Async Scripts for Sequenced Logic

Use `AsyncScript` for logic that spans multiple frames (cutscenes, spawning waves, timed events):

```csharp
public class SpawnerScript : AsyncScript
{
    public override async Task Execute()
    {
        while (Game.IsRunning)
        {
            // Wait 2 seconds
            await Script.NextFrame();
            var elapsed = 0.0;
            while (elapsed < 2.0)
            {
                elapsed += Game.UpdateTime.Elapsed.TotalSeconds;
                await Script.NextFrame();
            }

            // Spawn a falling box
            var box = ((Game)Game).Create3DPrimitive(PrimitiveModelType.Box);
            box.Transform.Position = new Vector3(
                Random.Shared.NextSingle() * 10 - 5,
                15,
                Random.Shared.NextSingle() * 10 - 5
            );
            box.Scene = Entity.Scene;
        }
    }
}
```

## Bepu Physics Interaction

### Applying Forces

Access the Bepu rigid body component to apply forces and impulses:

```csharp
using Stride.BepuPhysics;

public class JumpScript : SyncScript
{
    public override void Update()
    {
        if (Input.IsKeyPressed(Keys.Space))
        {
            var body = Entity.Get<RigidbodyComponent>();
            if (body != null)
            {
                body.ApplyLinearImpulse(new Vector3(0, 10, 0));
            }
        }
    }
}
```

### Collision Detection

Bepu collision events are accessed through the simulation:

```csharp
public class CollisionReporter : SyncScript
{
    public override void Update()
    {
        var body = Entity.Get<RigidbodyComponent>();
        if (body == null) return;

        // Check contacts this frame
        var contacts = body.Contacts;
        foreach (var contact in contacts)
        {
            Log.Info($"Hit entity: {contact.Other?.Entity?.Name}");
        }
    }
}
```

### Static vs Dynamic Bodies

By default, toolkit primitives are dynamic (affected by gravity and forces). For static geometry like walls and floors:

```csharp
var wall = game.Create3DPrimitive(PrimitiveModelType.Box, new()
{
    Size = new Vector3(10, 5, 0.5f),
});

// Change to static after creation
var rigidBody = wall.Get<RigidbodyComponent>();
if (rigidBody != null)
{
    rigidBody.Kinematic = true;  // Won't be affected by physics forces
}

wall.Transform.Position = new Vector3(0, 2.5f, -5);
wall.Scene = rootScene;
```

## Scene Composition Patterns

### Factory Functions

Organize entity creation into factory functions for reuse:

```csharp
static class EntityFactory
{
    public static Entity CreatePlayer(Game game, Scene scene)
    {
        var player = game.Create3DPrimitive(PrimitiveModelType.Capsule);
        player.Name = "Player";
        player.Transform.Position = new Vector3(0, 2, 0);
        player.Add(new PlayerController { Speed = 8.0f });
        player.Add(new JumpScript());
        player.Scene = scene;
        return player;
    }

    public static Entity CreateWall(Game game, Scene scene, Vector3 position, Vector3 size)
    {
        var wall = game.Create3DPrimitive(PrimitiveModelType.Box, new()
        {
            Size = size,
        });
        wall.Name = "Wall";
        var body = wall.Get<RigidbodyComponent>();
        if (body != null) body.Kinematic = true;
        wall.Transform.Position = position;
        wall.Scene = scene;
        return wall;
    }
}
```

### Game State in Start Callback

```csharp
void Start(Scene rootScene)
{
    game.SetupBase3DScene();
    game.AddSkybox();

    // Level geometry
    EntityFactory.CreateWall(game, rootScene, new Vector3(0, 2.5f, -10), new Vector3(20, 5, 0.5f));
    EntityFactory.CreateWall(game, rootScene, new Vector3(-10, 2.5f, 0), new Vector3(0.5f, 5, 20));
    EntityFactory.CreateWall(game, rootScene, new Vector3(10, 2.5f, 0), new Vector3(0.5f, 5, 20));

    // Player
    EntityFactory.CreatePlayer(game, rootScene);
}
```

## When to Use Code-Only vs Game Studio

**Code-only with toolkit is best when:**
- You're a programmer working solo or in a small team
- Your game is procedurally generated or data-driven
- You want fast iteration with hot reload (dotnet watch)
- You don't need visual scene editing
- You're prototyping and want minimal project ceremony

**Game Studio is better when:**
- Artists and designers need to place and tweak objects visually
- You're building large hand-crafted levels
- You need the material editor, animation preview, or physics debugger
- Your team workflow depends on WYSIWYG editing

The two approaches are not mutually exclusive — you can start code-only and migrate scenes to Game Studio later, or use Game Studio for assets while assembling scenes in code.

## Bepu vs Bullet: Which Physics Backend?

Stride 4.3 ships with both Bullet (legacy) and Bepu (new). The Community Toolkit defaults to Bepu. Key differences:

| Feature | Bullet (Legacy) | Bepu (New) |
|---------|-----------------|------------|
| Language | C++ with C# wrapper | Pure C# |
| NativeAOT | Requires native binaries | Works out of the box |
| Performance | Good for most games | Better for complex simulations |
| Cross-platform | Requires per-platform native libs | .NET anywhere |
| Stride integration | Mature, full editor support | Toolkit support, editor catching up |
| Recommended for | Existing projects | New projects |

For new code-only projects, Bepu is the clear choice — it simplifies deployment, works with NativeAOT, and is the future direction of Stride's physics support.
