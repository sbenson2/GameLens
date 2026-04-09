# G72 — MonoGame 3.8.5 Content Builder & Graphics Backend Migration

> **Category:** Guide · **Engine:** MonoGame · **Related:** [G7 Content Pipeline](./G7_content_pipeline.md) · [G2 Rendering Architecture](./G2_rendering_architecture.md) · [G28 Shader Systems](./G28_shader_systems.md) · [G36 Resolution & Viewports](./G36_resolution_and_viewports.md) · [G19 Window & Display Management](./G19_window_display_management.md)

> A migration guide for MonoGame 3.8.5's three major changes: the new Content Builder project system (replacing MGCB Editor), native Vulkan graphics support, and native DirectX 12 graphics support. Covers project conversion, content pipeline differences, graphics backend selection, and common migration pitfalls. If you're upgrading from 3.8.2–3.8.4, start here.

---

## Table of Contents

1. [What Changed in 3.8.5](#1--what-changed-in-385)
2. [Migration Path Overview](#2--migration-path-overview)
3. [Content Builder Migration](#3--content-builder-migration)
4. [Vulkan Graphics Backend](#4--vulkan-graphics-backend)
5. [DirectX 12 Graphics Backend](#5--directx-12-graphics-backend)
6. [Choosing a Graphics Backend](#6--choosing-a-graphics-backend)
7. [Shader Compatibility](#7--shader-compatibility)
8. [Content Pipeline Differences](#8--content-pipeline-differences)
9. [ECS Integration Notes](#9--ecs-integration-notes)
10. [Common Migration Pitfalls](#10--common-migration-pitfalls)
11. [Testing Your Migration](#11--testing-your-migration)
12. [Rollback Strategy](#12--rollback-strategy)

---

## 1 — What Changed in 3.8.5

MonoGame 3.8.5 (preview December 2025, with preview.2 in January 2026) introduced three headline features that affect every project:

| Feature | What It Replaces | Status (as of 3.8.5-preview.2) |
|---------|-----------------|-------------------------------|
| New Content Builder project | MGCB Editor + `dotnet-tools.json` | Preview — functional, docs in progress |
| Native Vulkan support | OpenGL (DesktopGL) | Preview — needs broad testing |
| Native DirectX 12 support | DirectX 11 (DesktopDX) | Preview — needs broad testing |

The MonoGame team committed to bi-monthly preview releases, with full stable releases every 6 months. This means 3.8.5 features will stabilize through the first half of 2026.

### Why This Matters for ECS Projects

If your game uses Arch ECS, the migration is mostly painless — your Systems, Components, and game logic don't change. The migration touches three areas: how assets are built, how graphics are initialized, and how shaders are compiled. Your ECS world, queries, and game loop remain identical.

---

## 2 — Migration Path Overview

### Pre-Migration Checklist

Before touching your project:

1. **Tag your current commit** — `git tag pre-385-migration` so you can roll back cleanly
2. **Verify your .NET version** — 3.8.5 targets .NET 8+. Run `dotnet --version` to confirm
3. **Inventory custom shaders** — if you have MGFX shaders, they'll need recompilation for Vulkan/DX12
4. **Back up your Content.mgcb file** — you won't need it after migration, but keep it for reference

### Migration Order

The safest order is:

```
1. Content Builder migration (no graphics changes yet)
2. Verify game runs identically on old graphics backend
3. Switch graphics backend (Vulkan or DX12)
4. Test rendering thoroughly
5. Remove old MGCB tooling artifacts
```

Don't change the content system and graphics backend at the same time. If something breaks, you want to know which change caused it.

---

## 3 — Content Builder Migration

### The Old Way (3.8.2–3.8.4)

Previously, content was managed through:
- A `.config/dotnet-tools.json` referencing `dotnet-mgcb-editor`
- A `Content.mgcb` file describing all assets
- A `MonoGameContentReference` in your `.csproj` pointing at the `.mgcb`
- The `MonoGame.Content.Builder.Task` NuGet package

### The New Way (3.8.5+)

The new Content Builder is a **Console Project** — a separate `.csproj` that builds your content as part of the solution build. No external tools, no MGCB Editor.

### Step-by-Step Conversion

**Step 1: Remove old tooling**

Delete the `.config` folder containing `dotnet-tools.json` (if it only contains MGCB references).

**Step 2: Remove old csproj references**

From your game's `.csproj`, remove:

```xml
<!-- REMOVE these -->
<ItemGroup>
  <MonoGameContentReference Include="Content\Content.mgcb" />
</ItemGroup>

<ItemGroup>
  <PackageReference Include="MonoGame.Content.Builder.Task" Version="3.8.x" />
</ItemGroup>
```

**Step 3: Create the Content Builder project**

Add a new Console Project to your solution. This project describes your content using standard MSBuild items instead of the `.mgcb` format. Refer to the MonoGame 3.8.5 documentation for the exact project template — the format was still being finalized during preview.

**Step 4: Reference content output from your game project**

Your game project references the built content output directory instead of using `MonoGameContentReference`.

### What Stays the Same

- `Content.RootDirectory = "Content"` in your `Game1` constructor — unchanged
- `Content.Load<T>("assetname")` calls — unchanged
- All your Arch ECS systems that reference loaded assets — unchanged
- The asset formats themselves (`.xnb` output) — unchanged

The Content Builder changes **how** assets are built, not **what** they produce. Your `ContentLoadingSystem`, `SpriteComponent`, `TextureAtlasComponent`, etc. don't need modification.

---

## 4 — Vulkan Graphics Backend

### What Vulkan Provides

- Modern graphics API with explicit GPU control
- Better multi-threaded rendering potential
- Required for some newer GPU features
- Cross-platform (Windows, Linux, macOS via MoltenVK)

### Switching to Vulkan

In 3.8.5, backend selection is done through the project platform target. The exact mechanism was still being finalized in preview — check the MonoGame 3.8.5 migration docs for the current NuGet package names.

### What Changes for Your Rendering Systems

If your Arch ECS rendering pipeline follows the standard pattern (a `RenderSystem` that calls `SpriteBatch.Begin/End` in Draw), Vulkan should work transparently. The `GraphicsDevice` API that MonoGame exposes is the same regardless of backend.

**Watch for:**
- Custom `Effect` files need recompilation for Vulkan's shader format
- `RenderTarget2D` behavior may have subtle timing differences in preview
- If you call `GraphicsDevice` methods directly (outside SpriteBatch), test those paths carefully

---

## 5 — DirectX 12 Graphics Backend

### What DX12 Provides

- Modern DirectX API for Windows
- Better CPU utilization through command lists
- Ray tracing support potential (future MonoGame versions)
- Required for Xbox platform support going forward

### When to Choose DX12

Choose DX12 when:
- Your game targets Windows exclusively (or Windows + Xbox)
- You need the latest DirectX features
- Your game is CPU-bound on draw calls and could benefit from DX12's lower overhead

DX12 is **not** the right choice if you need Linux or macOS support — use Vulkan for cross-platform.

---

## 6 — Choosing a Graphics Backend

| Factor | DesktopGL (Legacy) | Vulkan | DirectX 12 |
|--------|-------------------|--------|------------|
| Platform | Win/Mac/Linux | Win/Mac*/Linux | Windows only |
| Maturity | Stable | Preview | Preview |
| Shader format | GLSL (via MGFX) | SPIR-V | DXIL |
| Multi-thread rendering | Limited | Native | Native |
| Best for | Shipping now | Cross-platform future | Windows-focused |

*macOS Vulkan via MoltenVK translation layer — performance varies.

### Recommendation for Arch ECS Projects

If your game is in production or about to ship, **stay on DesktopGL/DesktopDX** until 3.8.5 goes stable. The preview backends are functional but haven't been battle-tested across the variety of hardware your players will have.

If you're starting a new project or early in development, targeting Vulkan is a good long-term bet for cross-platform reach.

---

## 7 — Shader Compatibility

### MGFX Shaders Need Recompilation

MonoGame's shader system (MGFX) compiles `.fx` files to platform-specific binaries. Switching from DesktopGL to Vulkan means your compiled `.mgfx` files won't work — you need to recompile from source `.fx` files for the new backend.

### Keeping Shaders Cross-Backend

If your game needs to support multiple backends (e.g., DX12 on Windows, Vulkan on Linux):

1. Keep your `.fx` source files in version control (never just the compiled output)
2. Use the Content Builder to compile shaders for each target platform
3. Structure your shader assets so the correct compiled version is loaded at runtime

### What This Means for Shader Components

If you have an Arch ECS `ShaderComponent` or `MaterialComponent`, the component data doesn't change. The `Effect` objects they reference are loaded through `Content.Load<Effect>()`, which handles the platform-specific format automatically. Your shader *systems* remain the same — only the *built artifacts* change.

---

## 8 — Content Pipeline Differences

### Format Changes

The new Content Builder produces the same `.xnb` output format. The change is in build orchestration, not output format. This means:

- Existing `.xnb` files from 3.8.4 will still load in 3.8.5
- You can migrate the build system without rebuilding all assets initially
- Content importers and processors you've written should work (test them)

### Custom Importers and Processors

If you wrote custom content importers or processors (e.g., for LDtk maps, Aseprite sprites, or FMOD banks), they'll need to be referenced by the new Content Builder project instead of the `.mgcb` file. The importer/processor code itself shouldn't need changes — just how it's registered.

---

## 9 — ECS Integration Notes

### Your Arch World Is Untouched

The migration is entirely at the infrastructure level. Your ECS components, systems, and queries don't change:

```csharp
// These are all identical before and after migration:
public readonly record struct Position(Vector2 Value);
public readonly record struct Sprite(Texture2D Texture, Rectangle Source);
public readonly record struct Velocity(Vector2 Value);

// Systems that query Arch entities — no changes needed
world.Query(in query, (ref Position pos, ref Velocity vel) =>
{
    pos = new Position(pos.Value + vel.Value * deltaTime);
});
```

### The Only System That Might Change

If you have a system that hot-reloads content or dynamically loads assets at runtime, verify that the content output paths haven't shifted. The `Content.RootDirectory` path is the same, but double-check that your build output ends up where expected.

---

## 10 — Common Migration Pitfalls

### Pitfall 1: Changing Everything at Once

Don't upgrade the content system, graphics backend, AND .NET version in one commit. Migrate one thing at a time and verify after each step.

### Pitfall 2: Forgetting to Remove Old Tool References

If `dotnet-tools.json` still references `dotnet-mgcb-editor` after migration, your CI might try to restore it and fail. Clean up old references.

### Pitfall 3: Shader Mismatch After Backend Switch

If you switch from DesktopGL to Vulkan but don't recompile your shaders, you'll get runtime errors on `Content.Load<Effect>()`. The error message should tell you about a format mismatch.

### Pitfall 4: Preview API Instability

The 3.8.5 preview API surface may change between preview releases. Pin your NuGet version and don't auto-update during active development. Check the MonoGame blog and GitHub Discussions before upgrading previews.

### Pitfall 5: MoltenVK on macOS

Vulkan on macOS runs through MoltenVK (a Vulkan-to-Metal translation layer). Performance and compatibility may differ from native Vulkan on Windows/Linux. Test on actual Mac hardware if you're targeting macOS.

---

## 11 — Testing Your Migration

### Minimum Test Matrix

After migration, verify:

1. **All assets load** — run the game and visit every screen/level that loads unique assets
2. **Shaders render correctly** — check custom effects, post-processing, lighting
3. **RenderTarget2D** — verify any render-to-texture workflows (minimaps, UI, shadows)
4. **SpriteBatch modes** — test all blend states, sort modes, and sampler states you use
5. **Content hot-reload** (if applicable) — ensure your development workflow still works

### Automated Verification

If you have rendering tests (screenshot comparison, render target validation), run them against both the old and new backend to verify visual parity.

---

## 12 — Rollback Strategy

If the migration causes issues:

1. `git checkout pre-385-migration` to return to your tagged state
2. Downgrade NuGet packages to 3.8.4.x
3. Restore your `Content.mgcb` and `dotnet-tools.json` from the tag
4. The 3.8.4 branch remains supported — you're not forced to migrate on any timeline

MonoGame's commitment to stable releases every 6 months means 3.8.5 stable should land mid-2026. If the preview isn't working for your project, waiting for stable is a valid strategy.

---

> **Next steps:** If you're building a new project on 3.8.5, start with [G7 Content Pipeline](./G7_content_pipeline.md) for content architecture patterns, then return here for backend-specific guidance. If you're optimizing rendering after migration, see [G33 Performance Profiling](./G33_performance_profiling.md) to verify you haven't introduced regressions.
