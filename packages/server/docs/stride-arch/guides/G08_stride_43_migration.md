# G08 — Stride 4.3 Migration & .NET 10 Upgrade

> **Category:** guide · **Engine:** Stride · **Related:** [G01 Getting Started](./G01_getting_started.md) · [G02 Bepu Physics](./G02_bepu_physics.md) · [G03 Code-Only Development](./G03_code_only_development.md) · [G07 Custom Render Features](./G07_custom_render_features.md)

How to migrate a Stride project from 4.2 (.NET 8) to 4.3 (.NET 10, C# 14). Covers the .NET SDK upgrade, Bepu Physics migration from Bullet, Vulkan compute shader changes, new custom asset support, Rider/VSCode integration, and breaking changes to watch for.

---

## What Changed in 4.3

Stride 4.3 (released November 2025) is a major release that modernizes the engine's runtime and toolchain:

| Area | 4.2 | 4.3 |
|---|---|---|
| Runtime | .NET 8, C# 12 | .NET 10, C# 14 |
| Physics (default) | Bullet (C++ interop) | Bullet (default), Bepu available |
| Physics (recommended) | Bullet | **Bepu** (C# native, feature parity reached) |
| Compute shaders | D3D11 only | D3D11 + **Vulkan** |
| IDE support | Visual Studio | Visual Studio + **Rider** + **VSCode** |
| Custom assets | Not supported | **Custom asset types** in editor |
| Build system | Windows-only MSBuild | **Cross-platform build** support |

---

## Step 1: Update the .NET SDK

Stride 4.3 requires .NET 10 SDK. Check your installed version:

```bash
dotnet --version
# Must be 10.0.100 or later
```

If you need to install it, download from [dot.net](https://dot.net/download) or update via your package manager.

Update your project's `TargetFramework`:

```xml
<!-- Before (4.2) -->
<TargetFramework>net8.0</TargetFramework>

<!-- After (4.3) -->
<TargetFramework>net10.0</TargetFramework>
```

---

## Step 2: Update Stride NuGet Packages

Update all Stride package references to 4.3.x:

```bash
# Update all Stride packages at once
dotnet list package --outdated | grep Stride
dotnet add package Stride.Engine --version 4.3.*
dotnet add package Stride.Graphics --version 4.3.*
dotnet add package Stride.Physics --version 4.3.*  # Bullet
# ... repeat for all Stride.* packages
```

Or edit your `.csproj` directly:

```xml
<PackageReference Include="Stride.Engine" Version="4.3.*" />
<PackageReference Include="Stride.Graphics" Version="4.3.*" />
```

Run `dotnet restore` to pull the updated packages.

---

## Step 3: Migrate Physics from Bullet to Bepu

Bullet Physics remains the default in 4.3, but the Stride team has announced that **Bepu is the recommended path forward**. Bullet will receive no new features and is planned for deprecation. Bepu's feature set is now slightly ahead of Bullet's.

### Why Migrate

- **Performance:** Bepu is written entirely in C#, eliminating the C++ interop overhead that Bullet requires. Multi-threaded simulation out of the box.
- **Maintainability:** Single-language stack means the community can contribute physics fixes and features without a C++ toolchain.
- **Future-proof:** Stride's physics development effort is focused exclusively on Bepu.

### Package Changes

```xml
<!-- Remove Bullet -->
<!-- <PackageReference Include="Stride.Physics" Version="4.3.*" /> -->

<!-- Add Bepu -->
<PackageReference Include="Stride.BepuPhysics" Version="4.3.*" />
```

If using the Community Toolkit for code-only development:

```bash
dotnet add package Stride.CommunityToolkit.Bepu --prerelease
```

### Component Migration

The core concepts map directly, but class names and namespaces change:

| Bullet (Stride.Physics) | Bepu (Stride.BepuPhysics) |
|---|---|
| `RigidbodyComponent` | `BodyComponent` |
| `StaticColliderComponent` | `StaticComponent` |
| `CharacterComponent` | `CharacterComponent` (new implementation) |
| `ColliderShape` (BoxShape, SphereShape) | `ColliderShape` (similar API, Bepu types) |
| `Simulation.Raycast()` | `BepuSimulation.Raycast()` |
| `PhysicsComponent.LinearVelocity` | `BodyComponent.LinearVelocity` |

### Code Example: Before and After

**Bullet (4.2):**

```csharp
// Adding a rigid body in Bullet
var rigidBody = new RigidbodyComponent();
rigidBody.ColliderShape = new BoxColliderShape(new Vector3(1, 1, 1));
rigidBody.Mass = 10f;
rigidBody.Restitution = 0.3f;
entity.Add(rigidBody);

// Raycasting
var result = this.GetSimulation().Raycast(origin, direction, maxDistance);
if (result.Succeeded)
{
    var hitEntity = result.Collider.Entity;
}
```

**Bepu (4.3):**

```csharp
// Adding a rigid body in Bepu
var body = new BodyComponent();
body.ColliderShape = new BoxColliderShape(new Vector3(1, 1, 1));
body.Mass = 10f;
body.SpringFrequency = 30f;  // Bepu uses spring-based contact model
entity.Add(body);

// Raycasting
var simulation = this.GetBepuSimulation();
if (simulation.Raycast(origin, direction, maxDistance, out var hit))
{
    var hitEntity = hit.Collider.Entity;
}
```

### Key Bepu Differences

- **Contact model:** Bepu uses a spring-damper contact model rather than impulse-based. Tune `SpringFrequency` and `SpringDampingRatio` instead of `Restitution` alone.
- **Determinism:** Bepu is deterministic by default when using fixed timesteps — important for networked physics or replays.
- **Constraints:** Bepu constraints have different configuration (e.g., `BallSocketConstraint`, `HingeConstraint`). See [G02 Bepu Physics](./G02_bepu_physics.md) for detailed constraint setup.

---

## Step 4: Vulkan Compute Shaders

Stride 4.2.1 added Vulkan compute shader support. In 4.3 this is fully stable. If your project uses compute shaders that previously only ran on D3D11, they now work on Vulkan without code changes — the SDSL compiler generates the correct GLSL compute intrinsics automatically.

### What the Compiler Handles

When targeting Vulkan, Stride's shader compiler translates SDSL compute shaders to GLSL with:

- `gl_GlobalInvocationID`, `gl_LocalInvocationID`, `gl_WorkGroupID` mapped from SDSL semantics
- Memory barriers (`groupMemoryBarrier`, `allMemoryBarrier`)
- `RWTexture2D` / `RWBuffer` translated to `image2D` / `imageBuffer` with load/store
- `std430` layout for non-constant storage buffers
- Correct descriptor types: `StorageImage`, `StorageTexelBuffer`, `StorageBuffer`

### If You Had D3D11-Only Compute Shaders

No migration needed for standard SDSL compute shaders — the cross-compilation is automatic. If you used raw HLSL injected via `[shader("compute")]`, test on Vulkan to verify the translation handles your specific patterns.

```csharp
// This SDSL compute shader now works on both D3D11 and Vulkan
shader MyComputeShader : ComputeShaderBase
{
    RWTexture2D<float4> OutputTexture;

    override void Compute()
    {
        uint2 id = Streams.DispatchThreadId.xy;
        float2 uv = (float2)id / float2(1920, 1080);
        OutputTexture[id] = float4(uv, 0, 1);
    }
};
```

---

## Step 5: IDE Setup (Rider / VSCode)

Stride 4.3 adds first-class support for JetBrains Rider and Visual Studio Code alongside Visual Studio.

### Rider

1. Install the Stride plugin from the JetBrains Marketplace
2. Open the `.sln` file — Rider recognizes Stride project types automatically
3. SDSL shader files (`.sdsl`) get syntax highlighting and basic completion

### VSCode

1. Install the Stride extension from the VS Marketplace
2. Open the project folder
3. Use the integrated terminal for `dotnet build` and `dotnet run`

**Note:** Game Studio (the Stride editor) is still Windows-only and requires Visual Studio build tools for asset compilation. Rider and VSCode are supported for code editing and debugging, but you'll still use Game Studio for scene editing, material setup, and asset import.

---

## Step 6: Custom Asset Types

Stride 4.3 introduces the ability to define custom asset types that appear in Game Studio's asset browser. This is useful for game-specific data (quest definitions, dialogue trees, loot tables) that you want to edit visually.

```csharp
[DataContract]
[AssetDescription(".quest")]
public class QuestAsset : Asset
{
    public string QuestName { get; set; } = "New Quest";
    public string Description { get; set; } = "";
    public int RequiredLevel { get; set; } = 1;
    public List<string> Objectives { get; set; } = new();
}
```

After defining the asset type, rebuild the project. Game Studio will recognize `.quest` files and provide a property editor for them.

---

## Breaking Changes Checklist

Review these before migrating:

- [ ] **TargetFramework** → `net10.0`
- [ ] **C# 14 language features** — new keywords may conflict with existing identifiers (rare but check `field` keyword in property accessors)
- [ ] **Bullet → Bepu** — not required in 4.3, but plan for it; Bullet is on deprecation path
- [ ] **NuGet packages** — all `Stride.*` packages must be the same 4.3.x version; mixing 4.2 and 4.3 packages will fail at runtime
- [ ] **Asset database** — open your project in Game Studio 4.3 to trigger automatic asset migration; back up first
- [ ] **Build tools** — ensure MSBuild 17.12+ is installed (ships with VS 2022 17.12 or .NET 10 SDK)

---

## Performance Improvements in 4.3

Beyond new features, 4.3 includes significant performance work:

- **UI batching** — GPU stalls eliminated in the UI rendering pipeline
- **Memory copy path** — engine avoids a slow memory copy path that previously affected draw-call-heavy scenes, reducing CPU frame prep time by ~40%
- **Bepu threading** — physics simulation automatically distributes across available cores

If you were bottlenecked on CPU frame time in 4.2, benchmark after migrating — the improvement may be significant without any code changes.

---
