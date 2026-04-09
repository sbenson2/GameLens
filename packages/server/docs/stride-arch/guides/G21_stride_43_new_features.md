# G21 — Stride 4.3: .NET 10, Interface Processing & Cross-Platform Builds

> **Category:** guide · **Engine:** Stride · **Related:** [G08 Stride 4.3 Migration](./G08_stride_43_migration.md) · [G02 Bepu Physics](./G02_bepu_physics.md) · [G03 Code-Only Development](./G03_code_only_development.md) · [G14 .NET 10 & C# 14 Performance](./G14_dotnet10_csharp14_performance.md) · [G10 Custom Assets Pipeline](./G10_custom_assets_pipeline.md)

A practical overview of the major new capabilities in Stride 4.3 (November 2025) beyond the items covered in existing guides. This guide focuses on three features that change how you architect Stride games: the new interface-based component processing system, cross-platform asset compilation, and IDE integration improvements. For .NET 10 performance specifics see [G14](./G14_dotnet10_csharp14_performance.md); for Bepu Physics see [G02](./G02_bepu_physics.md); for the 4.2 → 4.3 migration path see [G08](./G08_stride_43_migration.md).

---

## Interface-Based Component Processing

Stride 4.3 introduces a flexible processing system that lets you define update behavior through interfaces rather than inheritance. This replaces the pattern of subclassing `SyncScript` or `AsyncScript` for every behavior and enables cross-cutting concerns that span multiple component types.

### The Problem It Solves

In Stride 4.2 and earlier, if you wanted a custom update loop, you subclassed `SyncScript`:

```csharp
// Old pattern: every updatable thing is a SyncScript
public class HealthDisplay : SyncScript
{
    public override void Update() { /* redraw HP bar */ }
}

public class DamageFlash : SyncScript
{
    public override void Update() { /* flash on hit */ }
}
```

This works but forces every behavior into the script hierarchy. You can't easily iterate over "all things that need a physics tick" vs. "all things that need a render tick" without manual bookkeeping.

### Interface-Driven Updates

With 4.3, you define interfaces for your update contracts and register processors that iterate over entities implementing them:

```csharp
// Define an interface for anything that needs a fixed-rate physics update
public interface IPhysicsTickable
{
    void PhysicsTick(float fixedDt);
}

// Define an interface for anything that needs a render-rate update
public interface IRenderTickable
{
    void RenderTick(float dt);
}
```

Components implement the interfaces they care about:

```csharp
public class PlayerController : SyncScript, IPhysicsTickable, IRenderTickable
{
    public void PhysicsTick(float fixedDt)
    {
        // Movement, collision response at fixed rate
    }

    public void RenderTick(float dt)
    {
        // Camera smoothing, animation blending at render rate
    }

    public override void Update() { }  // Can leave empty or remove
}

public class Projectile : SyncScript, IPhysicsTickable
{
    public void PhysicsTick(float fixedDt)
    {
        // Ballistics at fixed rate
    }

    public override void Update() { }
}
```

### Registering Custom Processors

Create an `EntityProcessor` that queries by interface:

```csharp
public class PhysicsTickProcessor : EntityProcessor<ScriptComponent>
{
    protected override void ProcessItem(ScriptComponent item)
    {
        if (item is IPhysicsTickable tickable)
        {
            tickable.PhysicsTick(FixedTimeStep);
        }
    }
}
```

Register it in your game setup:

```csharp
// In your Game class or startup script
SceneSystem.SceneInstance.Processors.Add(new PhysicsTickProcessor());
```

### When to Use This Pattern

- **Multiple update rates:** Separate fixed-tick physics from variable-rate rendering.
- **Cross-cutting concerns:** Apply damage-over-time, status effects, or AI ticking to any entity that opts in via interface, regardless of script hierarchy.
- **Performance-sensitive iteration:** Processors iterate only over entities that implement the interface, avoiding wasted cycles on entities that don't need a particular update.

For simple games with a single update loop, `SyncScript.Update()` remains perfectly fine.

## Cross-Platform Asset Compilation

Stride 4.3 makes significant progress toward building games natively on Linux and macOS, not just Windows.

### What Changed

The asset compiler historically depended on Windows-only tools:

| Dependency | 4.2 (Windows-only) | 4.3 (Cross-platform) |
|-----------|--------------------|--------------------|
| FBX import | Custom C++/CLI FBX SDK wrapper | Assimp (cross-platform) |
| Texture processing | DirectXTex (Windows) | Adjusted for Linux/macOS |
| Model physics | VHACD (Windows builds) | Cross-platform builds |
| Image loading | FreeImage (Windows) | Cross-platform builds |

### Building on Linux/macOS

For simpler projects (no FBX assets, standard textures), you can now build entirely on Linux or macOS:

```bash
# On Linux or macOS
dotnet build MyStrideGame.sln
dotnet run --project MyStrideGame
```

### Limitations

- Complex FBX files may still have import differences between Assimp and the old FBX SDK parser. Test your models after migration.
- GameStudio (the visual editor) still requires Windows. The Avalonia-based cross-platform editor is in development but not yet shipped.
- Some shader compilation paths may require the Windows DirectX shader compiler for D3D targets. Vulkan/OpenGL shader compilation works cross-platform.

### Practical Approach

A common workflow for cross-platform teams:

1. **Author** content on Windows using GameStudio
2. **Build and test** on Linux/macOS CI using `dotnet build`
3. **Ship** platform-specific builds from CI

This lets artists use the full editor while developers work on their preferred OS.

## IDE Integration: Rider and VSCode Support

GameStudio 4.3 can launch projects directly in Rider and VSCode, not just Visual Studio. This is configured in GameStudio's settings:

### Setting Up

1. Open GameStudio → **Edit** → **Settings** → **External IDE**
2. Select your preferred IDE: Visual Studio, Rider, or VSCode
3. Double-clicking a script in GameStudio now opens it in the selected IDE

### Rider-Specific Notes

- Stride's custom MSBuild targets are compatible with Rider's project model
- The Stride Rider plugin (community-maintained) provides additional integration for asset references and shader editing
- Hot reload of scripts works when launched from Rider, same as Visual Studio

### VSCode-Specific Notes

- The C# extension (powered by OmniSharp or the C# Dev Kit) handles Stride projects
- For shader editing (`.sdsl` files), the Stride SDSL syntax highlighting extension is available on the VSCode marketplace
- Debugging requires the C# extension's launch configuration; GameStudio can attach to the running process

## HDR Rendering Support

Stride 4.3 adds HDR output support for the Direct3D rendering path on Windows:

```csharp
// Enable HDR output in your graphics compositor
var compositor = SceneSystem.GraphicsCompositor;
// HDR is configured through the graphics compositor's
// output format settings in GameStudio or code
```

HDR is currently Direct3D-only on Windows. Vulkan HDR support is planned for a future release. Games targeting HDR should implement a tone mapping fallback for SDR displays.

## User-Defined Gizmos

The editor now supports custom gizmos — visual handles rendered in the GameStudio viewport for your custom components:

```csharp
[GizmoComponent(typeof(PatrolPathComponent), isMainGizmo: false)]
public class PatrolPathGizmo : IEntityGizmo
{
    public void Draw(IGraphicsContext context)
    {
        // Draw waypoint markers and path lines
        // in the editor viewport
    }

    // ... required interface members
}
```

This is useful for level design tools: visualizing AI patrol routes, trigger volumes, spawn areas, or any spatial data that benefits from in-editor visualization.

## OpenXR Enhancements

For VR developers (see [G12 VR/OpenXR Development](./G12_vr_openxr_development.md)):

- **Haptic feedback** is now accessible through the OpenXR runtime, enabling controller vibration in response to game events
- **Passthrough API** support for mixed-reality headsets (Meta Quest Pro, Quest 3) allows rendering game content composited over the real-world camera feed

## Summary: What to Adopt First

| Feature | Effort | Impact | Adopt When |
|---------|--------|--------|-----------|
| Interface processing | Medium | High for complex games | Multiple update rates or cross-cutting concerns |
| Cross-platform builds | Low | High for teams | Any non-Windows developer on the team |
| IDE integration | Trivial | Medium | Immediately if not using Visual Studio |
| HDR rendering | Medium | Niche | Targeting HDR displays |
| Custom gizmos | Medium | High for level design | Building custom editor tools |
| OpenXR haptics/passthrough | Low | High for VR | Any VR project |
