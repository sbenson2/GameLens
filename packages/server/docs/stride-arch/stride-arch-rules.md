# Stride Architecture Rules

> **Module:** stride-arch · **Engine:** Stride (formerly Xenko) · **Version:** 4.3+

## Architecture Context

Stride is a free, open-source, cross-platform C# game engine with an integrated editor, PBR rendering pipeline, and full .NET runtime. Unlike MonoGame and FNA (which are frameworks you build on), Stride is a complete engine with a visual editor, scene management, asset pipeline, and built-in physics.

### Tech Stack

- **Engine:** Stride 4.3+ (.NET 10, C# 14)
- **Rendering:** Custom rendering pipeline (Vulkan, DirectX 11/12, OpenGL)
- **Physics:** Bepu Physics v2 (replacing Bullet Physics)
- **Scripting:** C# with hot-reload support
- **Shader language:** SDSL (Stride Shading Language, HLSL-based)
- **Editor:** Stride Game Studio (WPF-based, Windows only for editor; runtime is cross-platform). Supports user-defined gizmos for custom component visualization.
- **Platforms:** Windows, Linux, macOS (runtime), Android, iOS

### Key Differences from Framework-Based Engines

| Aspect | Stride | MonoGame/FNA |
|--------|--------|-------------|
| Architecture | Component-based engine with editor | Code-first framework |
| Scene management | Built-in scene graph, prefabs | You build your own |
| Asset pipeline | Integrated in editor + build | MGCB / manual |
| Physics | Bepu Physics (built-in) | You integrate (e.g., Aether.Physics2D) |
| Rendering | PBR pipeline, post-processing stack | SpriteBatch, custom shaders |
| UI | Built-in UI system | You build or use library |
| Scripting | SyncScript, AsyncScript, StartupScript | Game1 lifecycle |

## Project Structure Conventions

Stride projects created through the editor follow this structure:

```
MyGame/
├── MyGame.sln                    # Solution file
├── MyGame/
│   ├── MyGame.csproj             # Game project
│   ├── MyGame.sdpkg              # Stride package descriptor
│   ├── Assets/                   # All game assets (managed by editor)
│   │   ├── Scenes/               # Scene files (.sdscene)
│   │   ├── Materials/            # PBR materials
│   │   ├── Models/               # 3D models
│   │   ├── Textures/             # Texture assets
│   │   ├── Prefabs/              # Reusable entity prefabs
│   │   └── Scripts/              # C# script assets
│   ├── Effects/                  # Custom SDSL shaders
│   └── bin/                      # Build output
├── MyGame.Windows/               # Windows platform project
├── MyGame.Linux/                 # Linux platform project (optional)
└── MyGame.Android/               # Android platform project (optional)
```

### Code-Only Projects

Stride also supports code-only projects (no editor) via the Stride Community Toolkit:

```csharp
using Stride.CommunityToolkit.Engine;
using Stride.Engine;

var game = new Game();
game.Run(start: (Scene rootScene) =>
{
    // Add entities, set up scene programmatically
    game.SetupBase3DScene();
});
```

## Entity-Component System

Stride uses a component-based entity system (not a pure ECS like Arch):

- **Entity:** Container with a transform and a list of components
- **Component:** Data + behavior (unlike pure ECS, Stride components can contain logic)
- **Script:** A special component type that provides `Update()`, `Start()`, and async lifecycle

### Script Types

| Script Type | Base Class | Use Case |
|-------------|-----------|----------|
| Synchronous | `SyncScript` | Per-frame logic (Update called every frame) |
| Asynchronous | `AsyncScript` | Coroutine-style logic (await, delays, sequences) |
| Startup | `StartupScript` | One-time initialization |

```csharp
public class PlayerController : SyncScript
{
    public float Speed { get; set; } = 5.0f;
    
    public override void Update()
    {
        var dt = (float)Game.UpdateTime.Elapsed.TotalSeconds;
        
        if (Input.IsKeyDown(Keys.W))
            Entity.Transform.Position += Entity.Transform.WorldMatrix.Forward * Speed * dt;
    }
}
```

### Key Architectural Difference

In MonoGame + Arch ECS: components are pure data structs, systems contain all logic, and you query entities by component archetype.

In Stride: components can contain both data and behavior. Scripts (a type of component) have their own `Update()` method. The entity system is closer to Unity's MonoBehaviour pattern than to a pure ECS.

## Physics — Bepu Physics v2

Stride 4.3 transitions from Bullet Physics to Bepu Physics v2. Bepu is a high-performance, multi-threaded C# physics library.

### Key Bepu Concepts in Stride

- **StaticDescription** — immovable colliders (floors, walls)
- **BodyDescription** — dynamic or kinematic rigid bodies
- **Collidable shapes** — Box, Sphere, Capsule, ConvexHull, Mesh, Compound
- **Simulation** — the physics world, stepped in sync with game update

### Migration from Bullet

If upgrading from Stride 4.2 (Bullet) to 4.3 (Bepu):

- Replace `RigidbodyComponent` with Bepu body equivalents
- Replace `StaticColliderComponent` with Bepu static descriptions
- Collision groups and filtering use Bepu's `CollidableDescription` system
- Raycast API changes — consult Stride 4.3 migration docs
- Bepu's constraint system differs significantly from Bullet's

### Code-Only Bepu Setup

Via the Community Toolkit:

```csharp
// Add Stride.CommunityToolkit.Bepu NuGet package (pre-release)
game.Run(start: (Scene rootScene) =>
{
    game.SetupBase3DScene();
    
    // Add a ground plane with Bepu physics
    var ground = game.Create3DPrimitive(PrimitiveModelType.Plane);
    ground.Transform.Position = new Vector3(0, 0, 0);
    // Bepu static body is configured through the toolkit helpers
    
    rootScene.Entities.Add(ground);
});
```

## Rendering Pipeline

Stride uses a modern PBR (Physically Based Rendering) pipeline:

- **Forward+ rendering** with clustered lighting
- **Post-processing stack:** bloom, ambient occlusion, depth of field, tone mapping, color grading
- **Shadow mapping:** cascaded shadow maps, omnidirectional shadows
- **Global illumination:** light probes, reflection probes
- **Custom render features:** extend the pipeline with C# code

### Stride Shading Language (SDSL)

SDSL is Stride's shader language, built on HLSL with composition via mixins:

```hlsl
shader MyCustomEffect : SpriteBase
{
    stage override float4 Shading()
    {
        float4 color = base.Shading();
        // Custom post-processing
        return color;
    }
};
```

SDSL compiles to the appropriate backend (HLSL for DX, GLSL for OpenGL, SPIR-V for Vulkan) automatically. You write one shader; Stride handles cross-compilation.

## Build Commands

```bash
# Build from command line
dotnet build MyGame.sln

# Run the game (Windows)
dotnet run --project MyGame.Windows

# Build for Linux
dotnet publish MyGame.Linux -c Release -r linux-x64

# Restore Stride NuGet packages
dotnet restore MyGame.sln
```

### Editor Workflow

Most Stride development happens through Stride Game Studio:

1. Open `.sln` in Game Studio
2. Edit scenes, materials, assets visually
3. Write scripts in external editor (VS, Rider, VS Code)
4. Game Studio detects changes and hot-reloads scripts
5. Play mode runs the game within the editor

## When to Choose Stride

Choose Stride when:
- **You want a Unity-like experience in open-source C#** — editor, scene management, asset pipeline included
- **3D game development** — Stride's PBR pipeline, lighting, and physics are production-ready
- **You prefer visual editing** — scene composition, material editing, prefab management in the editor
- **Team collaboration** — the editor workflow is familiar to artists and designers, not just programmers
- **VR development** — Stride has built-in VR support with OpenXR, haptic feedback, and passthrough (mixed reality)
- **HDR rendering** — native HDR display output on Direct3D/Windows for high-dynamic-range monitors

Choose MonoGame/FNA when:
- **You want full control** — no engine opinions, you build everything
- **2D game development** — MonoGame's SpriteBatch is simpler for 2D
- **Minimal dependencies** — smaller footprint, fewer moving parts
- **You prefer code-only** — no editor dependency in the workflow

## C# Conventions

- **PascalCase** for all public members (matches .NET conventions)
- **Properties with `{ get; set; }`** for script parameters exposed in editor
- **`[DataMember]` / `[DataMemberIgnore]`** attributes control serialization
- **Async/await is supported** in `AsyncScript` (unlike MonoGame's game loop restriction)
- **.NET 10 / C# 14** features available — record types, pattern matching, primary constructors

## Module Coverage Plan

This documentation module will cover:

- `architecture/` — Stride's rendering pipeline, entity system, asset pipeline, editor architecture
- `guides/` — Implementation patterns for common game systems using Stride's APIs
- `reference/` — API quick-reference, shader reference, Bepu Physics API surface
