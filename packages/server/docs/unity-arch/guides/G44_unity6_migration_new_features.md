# G44 — Unity 6 Migration & New Features Guide

> **Category:** guide · **Engine:** Unity 6 (6000.x) · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [G10 Rendering Pipeline](G10_rendering_pipeline_urp_hdrp.md) · [G21 Build Profiles](G21_build_profiles_cross_platform.md) · [Unity Rules](../unity-arch-rules.md)

Unity 6 (internal version 6000.x) launched October 2024 as the successor to Unity 2022 LTS. It consolidates features from the 2023.1 and 2023.2 tech streams into a long-term-supported release with a new versioning scheme. This guide covers the major new features, breaking API changes, and a practical migration checklist for projects upgrading from Unity 2022 LTS or 2023.x.

---

## Versioning Changes

Unity 6 drops the year-based naming:

| Old Name | New Name | Internal Version |
|----------|----------|-----------------|
| Unity 2022.3 LTS | (unchanged) | 2022.3.x |
| Unity 2023.2 | Unity 6 Preview | 6000.0.x |
| Unity 6 LTS | Unity 6 | 6000.1.x+ |

> **Why the jump to 6000?** Unity uses `major * 1000 + minor` internally. "6" maps to `6000.x`. This aligns with semantic versioning while signaling the generational shift.

---

## Major New Features

### 1. GPU Resident Drawer

The single biggest rendering performance improvement in Unity 6. It automatically uses the `BatchRendererGroup` API to batch draw calls on the GPU, dramatically reducing CPU overhead for complex scenes.

```csharp
// WHY: GPU Resident Drawer replaces per-object draw calls with GPU-driven
// instanced rendering. Scenes with 10K+ static objects see 2-5× frame rate gains.
// No code changes needed — it's a project-wide setting.

// Enable: Project Settings → Graphics → GPU Resident Drawer → Enabled
// Requires: Forward+ rendering path in URP
// Excludes: SkinnedMeshRenderers, particles, VFX Graph objects

// IMPORTANT: Disable Static Batching when using GPU Resident Drawer.
// They are mutually exclusive — Static Batching prevents BRG from working.

// IMPORTANT: Set BatchRendererGroup shader variants to "Keep All" in
// Project Settings → Graphics → Shader Stripping, or the feature silently
// falls back to CPU rendering with no warning.
```

**Verification:** Open the Frame Debugger and look for "Hybrid Batch Group" draw calls. If you don't see them, the setup is incomplete.

### 2. Build Profiles System

Build Profiles replace the old Build Settings window with a per-platform configuration system:

```csharp
// WHY: Build Profiles let you maintain multiple build configurations for the
// same platform — e.g., "Android Debug", "Android Release", "Android Demo".
// Each profile stores its own scenes list, scripting defines, and build options.

// Key changes for automation scripts:
// - BuildPipeline.BuildPlayer() still works but now reads from the active profile
// - Switch profiles via: EditorUserBuildSettings.activeBuildProfile
// - Profiles are assets stored in ProjectSettings/ — version-control friendly
```

### 3. Multiplayer Center & Netcode 2.0

A unified editor window for configuring multiplayer services:

```csharp
// Netcode for GameObjects 2.0 introduces Distributed Authority (Beta):
// - Clients have governed authority over their own spawned objects
// - Cloud state service announces object ownership to other clients
// - Reduces server load for physics-light multiplayer games

// New Session System manages player grouping across:
// - Peer-to-peer (P2P)
// - Dedicated server
// - Distributed authority

// WHY: The Multiplayer Center provides guided setup instead of requiring
// manual package installation. It recommends the right topology for your
// game type (turn-based, FPS, MMO, etc).
```

### 4. Rendering Improvements

```csharp
// Progressive GPU Lightmapper — now fully supported (out of preview)
// WHY: GPU lightmapper is 5-10× faster than CPU for light baking.
// Unity 6 adds async acceleration structure compilation.
// Falls back to CPU lightmapper on hardware without compute support.

// Probe Volumes (out of experimental) — replaces Light Probe Groups
// WHY: Automatic probe placement instead of manual Light Probe Group positioning.
// Better quality for dynamic objects moving through lit environments.

// Spatial-Temporal Post-Processing (STP) — new upscaler
// WHY: Renders at lower resolution and upscales to native quality.
// Similar to DLSS/FSR but built-in and cross-platform.
// Enable: URP Asset → Quality → STP Upscaler

// HDR Display Output — cross-platform HDR with tone mapping
// WHY: Works across URP, HDRP, and Built-in on all platforms that support HDR displays.

// Ray Tracing (DXR 1.1) — inline ray tracing in compute shaders
// WHY: Enables custom ray tracing effects without full RT pipeline.
// Limited to platforms with DXR 1.1 support (high-end NVIDIA/AMD GPUs).
```

### 5. UI Toolkit Improvements

```csharp
// Runtime Binding System — flexible data binding for UI Toolkit
// WHY: Connect data sources to UI properties without manual update loops.
// Configurable in UI Builder (visual) or C# code.

// New text engine — native implementation supporting RTL scripts
// WHY: Arabic, Hebrew, and other right-to-left languages now render correctly
// without third-party text solutions.

// New controls:
// - ToggleButtonGroup — radio-button-like selection groups
// - Tab / TabView — tabbed interface without custom implementation
// - Icon support on Button, ListView, TreeView

// UXML changes (migration note):
// - ExecuteDefaultAction → HandleEventBubbleUp
// - ExecuteDefaultActionAtTarget → HandleEventTrickleDown
// - AtTarget phase deprecated → use StopPropagation instead
// - UxmlTraits/UxmlFactory no longer required → use [UxmlElement] + [UxmlAttribute]
```

### 6. Audio Random Container

```csharp
// WHY: Replaces the common pattern of manually randomizing AudioClip selection
// with a built-in asset that handles variation automatically.

// Features:
// - Non-repetitive playback (avoid playing the same clip twice in a row)
// - Randomized volume, pitch, and timing offsets
// - Configurable trigger intervals
// - VU meter visualization in Editor

// Create: Assets → Create → Audio → Audio Random Container
// Use: Assign to AudioSource.resource instead of AudioSource.clip
```

### 7. Awaitable API Enhancements

```csharp
using UnityEngine;

// WHY: Unity 6 expands the Awaitable API (introduced in 2023.1) for
// async/await patterns that integrate with Unity's player loop.
// This replaces many coroutine use cases with cleaner syntax.

public class AsyncExample : MonoBehaviour
{
    async void Start()
    {
        // WHY: Awaitable.WaitForSecondsAsync integrates with Unity's time system
        // (respects Time.timeScale, pauses when game is paused).
        await Awaitable.WaitForSecondsAsync(2f);

        // WHY: NextFrameAsync yields until the next frame's Update,
        // replacing "yield return null" from coroutines.
        await Awaitable.NextFrameAsync();

        // WHY: EndOfFrameAsync waits until after rendering,
        // replacing "yield return new WaitForEndOfFrame()".
        await Awaitable.EndOfFrameAsync();

        // WHY: FixedUpdateAsync waits for the next FixedUpdate tick,
        // useful for physics-synced logic.
        await Awaitable.FixedUpdateAsync();

        Debug.Log("All awaits completed");
    }
}
```

---

## Breaking API Changes

### Object Discovery (Must Fix)

```csharp
// BEFORE (Unity 2022) — these generate compile ERRORS in Unity 6:
var enemies = FindObjectsOfType<Enemy>();
var player = FindObjectOfType<Player>();

// AFTER (Unity 6) — new APIs with explicit sort mode:
// WHY: The old API always sorted results by InstanceID, which was slow.
// The new API lets you choose: None (fast) or InstanceID (deterministic).
var enemies = FindObjectsByType<Enemy>(FindObjectsSortMode.None);
var player = FindFirstObjectByType<Player>(); // deterministic first match
var any = FindAnyObjectByType<Player>();       // fastest, non-deterministic
```

### Graphics Format Changes

```csharp
// BEFORE — compile errors in Unity 6:
if (format == GraphicsFormat.DepthAuto) { }
if (format == GraphicsFormat.ShadowAuto) { }
if (format == GraphicsFormat.VideoAuto) { }

// AFTER — check for depth-only rendering explicitly:
// WHY: Auto formats were ambiguous. Unity 6 requires explicit format selection.
if (rt.graphicsFormat == GraphicsFormat.None && rt.depthStencilFormat != GraphicsFormat.None)
{
    // This is a depth-only render texture
}
```

### Enlighten Removal

```csharp
// WHY: Enlighten Baked GI backend is removed in Unity 6.
// Projects using it are automatically migrated to Progressive Lightmapper:
// - Apple Silicon → GPU Lightmapper
// - Other platforms → CPU Lightmapper
//
// Enlighten Realtime GI is still supported through Unity 6 (but deprecated).
// Plan to migrate to Probe Volumes for dynamic GI.
```

### Render Pipeline API Changes

```csharp
// BEFORE:
[CustomEditorForRenderPipeline(typeof(MyComponent), typeof(UniversalRenderPipeline))]
public class MyComponentEditor : Editor { }

// AFTER:
// WHY: The pipeline-specific attribute was replaced with a composable pattern.
// SupportedOnRenderPipeline is more flexible — supports multiple pipelines.
[CustomEditor(typeof(MyComponent))]
[SupportedOnRenderPipeline(typeof(UniversalRenderPipelineAsset))]
public class MyComponentEditor : Editor { }
```

### Android Breaking Changes

```csharp
// GameActivity is now the default Android entry point (replaces Activity)
// WHY: GameActivity provides better input handling, game loop integration,
// and is Google's recommended entry point for games.

// Minimum Android version: 6.0 (API level 23) — up from 5.1

// Gradle version updates (affects custom build scripts):
// - Gradle: 8.4 (was 7.x)
// - Android Gradle Plugin: 8.3.0 (was 7.x)
// - JDK: 17 (was 11)

// UnityPlayer class refactored:
// BEFORE: public class MyActivity extends UnityPlayer { }
// AFTER:  public class MyActivity extends UnityPlayerForGameActivity { }
// WHY: UnityPlayer was split to support both Activity and GameActivity patterns.

// IMPORTANT: Gradle templates replaced with C# API
// Migrate: Player Settings → Publishing Settings → Build → "Upgrade templates to C#"
```

### Environment Lighting

```csharp
// WHY: Auto-generation of environment lighting is removed in Unity 6.
// Ambient probe and skybox reflection probes no longer bake automatically.
//
// BEFORE: Set "Auto Generate" in Lighting window → probes baked on change
// AFTER: Must manually click "Generate Lighting" or call API:
Lightmapping.Bake();       // Synchronous bake
Lightmapping.BakeAsync();  // Async bake (recommended)

// New scenes get a default Lighting Data Asset automatically.
```

---

## Platform Updates

### Web Platform (WebAssembly)

```csharp
// Unity 6 WebAssembly improvements:
// - WebAssembly 2023 spec: 4GB heap, native exceptions, SIMD
// - LocationService and Compass API now work on web
// - WebGPU support (experimental) — enables compute shaders on web

// WHY: The 4GB heap limit (up from 2GB) makes larger games viable on web.
// SIMD support means Unity.Mathematics and Burst-like patterns run faster.
```

### visionOS (Apple Vision Pro)

```csharp
// New platform: Apple Vision Pro with visionOS 2.0 support
// - Single-pass shader support for stereo rendering
// - Keyboard input and hand tracking
// - Shared Space and Full Space modes
```

### iOS

```csharp
// New: .xcframework plugin support
// WHY: Replaces .framework for plugins that need to support both device and
// simulator architectures (ARM64 + x86_64) in a single bundle.
```

---

## Migration Checklist

Use this checklist when upgrading from Unity 2022 LTS to Unity 6:

### Before Upgrading

- [ ] **Back up the project** — create a branch or copy before opening in Unity 6
- [ ] **Read the upgrade guide** — review platform-specific notes for your target platforms
- [ ] **Update packages** — ensure all packages have Unity 6-compatible versions
- [ ] **Check third-party assets** — verify Asset Store packages support Unity 6
- [ ] **Remove Enlighten references** — switch to Progressive Lightmapper if using Enlighten Baked GI

### During Upgrade

- [ ] **Fix Object.FindObjectsOfType** → `FindObjectsByType` / `FindFirstObjectByType` / `FindAnyObjectByType`
- [ ] **Fix GraphicsFormat.DepthAuto/ShadowAuto/VideoAuto** → explicit format checks
- [ ] **Fix UI Toolkit events** — `ExecuteDefaultAction` → `HandleEventBubbleUp`
- [ ] **Fix CustomEditorForRenderPipeline** → `CustomEditor` + `SupportedOnRenderPipeline`
- [ ] **Update Gradle templates** (Android) — use "Upgrade templates to C#" tool
- [ ] **Update UnityPlayer subclasses** (Android) → `UnityPlayerForGameActivity`
- [ ] **Re-bake lighting** — Auto Generate removed; use manual Generate Lighting
- [ ] **Test Metal buffer layouts** — min16float/half may behave differently in buffers

### After Upgrade

- [ ] **Enable GPU Resident Drawer** — Project Settings → Graphics (if using URP Forward+)
- [ ] **Disable Static Batching** if using GPU Resident Drawer
- [ ] **Enable Build Profiles** — migrate per-platform configs from Build Settings
- [ ] **Test Probe Volumes** — consider migrating from Light Probe Groups
- [ ] **Profile with Memory Profiler 1.1** — verify no VRAM regressions
- [ ] **Test on all target platforms** — especially Android (GameActivity change) and web

---

## Feature Adoption Priority

After a successful migration, consider adopting these features in order of impact:

| Priority | Feature | Impact | Effort |
|----------|---------|--------|--------|
| 1 | GPU Resident Drawer | 2-5× rendering perf | Low (toggle setting) |
| 2 | Build Profiles | Better CI/CD workflows | Low (migrate configs) |
| 3 | STP Upscaler | Higher visual quality at lower cost | Low (toggle in URP Asset) |
| 4 | Awaitable API | Cleaner async code | Medium (refactor coroutines) |
| 5 | Probe Volumes | Better dynamic GI | Medium (replace Light Probe Groups) |
| 6 | UI Toolkit Binding | Cleaner UI data flow | Medium (refactor UI controllers) |
| 7 | Audio Random Container | Better audio variety | Low (create assets, assign) |
| 8 | Distributed Authority | Reduced server costs | High (multiplayer architecture change) |

---

## Version Timeline

| Release | Date | Notes |
|---------|------|-------|
| Unity 6 Preview (6000.0) | March 2024 | Tech stream preview |
| Unity 6 (6000.1) | October 2024 | First LTS-track release |
| Unity 6.1 | 2025 | Render Graph required for URP custom passes |

---

## Further Reading

- [Architecture Overview](../architecture/E1_architecture_overview.md) — Unity project architecture fundamentals
- [G10 Rendering Pipeline](G10_rendering_pipeline_urp_hdrp.md) — URP and HDRP deep dive
- [G21 Build Profiles](G21_build_profiles_cross_platform.md) — Cross-platform build configuration
- [G30 Async & Awaitable](G30_async_awaitable.md) — Full Awaitable API reference
- [G40 GPU Rendering Optimization](G40_gpu_rendering_optimization.md) — GPU Resident Drawer setup
- [Unity Rules](../unity-arch-rules.md) — Engine-wide code generation rules
