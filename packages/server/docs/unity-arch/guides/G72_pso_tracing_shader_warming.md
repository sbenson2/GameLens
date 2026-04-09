# G72 — PSO Tracing & Shader Warming

> **Category:** guide · **Engine:** Unity 6.0+ (6000.0+, experimental API) · **Related:** [G10 Rendering Pipeline](G10_rendering_pipeline_urp_hdrp.md) · [G11 Debugging & Profiling](G11_debugging_profiling.md) · [G16 Performance & Memory](G16_performance_optimization_memory.md) · [G21 Build Profiles](G21_build_profiles_cross_platform.md) · [Unity Rules](../unity-arch-rules.md)

Shader compilation stutters are one of the most common complaints in shipped Unity games. The first time a shader variant is used at runtime, the graphics driver must compile GPU bytecode and create a **Pipeline State Object (PSO)** — a frozen snapshot of the shader, blend state, depth state, vertex layout, and render target format. This compilation can take 5–200 ms per variant, causing visible frame hitches. Unity 6 introduces the experimental **`GraphicsStateCollection`** API to **trace** which PSOs your game uses and **warm them up** at load time, eliminating stutters before gameplay begins.

---

## The Problem: First-Use Compilation Stutters

```
Frame N:  Player turns corner → new material visible for first time
          ├─ GPU needs PSO for (ShaderVariant + BlendState + DepthState + VertexLayout + RTFormat)
          ├─ Driver compiles shader → 15–200 ms stall
          └─ Visible hitch / dropped frames

Frame N+1: Same material → PSO cached → no stall
```

This affects **every platform** but is most noticeable on:
- **DirectX 12 / Vulkan** — explicit PSO model means compilation is visible to the app
- **Metal** — similar explicit pipeline state
- **DirectX 11 / OpenGL** — driver hides PSO creation but still stutters; the API falls back to legacy shader warm-up on these backends

---

## How PSO Tracing and Warming Works

The workflow has two phases:

```
DEVELOPMENT TIME                          RUNTIME (Shipped Game)
─────────────────                         ──────────────────────
1. Play through game                      1. Load .graphicsstate asset
2. GraphicsStateCollection traces          2. Call WarmUp() or
   every PSO the GPU creates                 WarmUpProgressively()
3. Save as .graphicsstate file            3. All PSOs pre-compiled
4. Include in build                          before gameplay starts
                                          4. Zero first-use stutters
```

### Phase 1: Tracing (Development)

During development or QA playthroughs, you enable tracing to record every unique PSO your game triggers.

```csharp
using UnityEngine;
using UnityEngine.Rendering;

// WHY: This MonoBehaviour runs in development builds or the editor.
// It records every PSO the GPU creates during gameplay so you can
// save the collection and ship it with your build.
public class PSOTracer : MonoBehaviour
{
    [Tooltip("Assign an existing .graphicsstate asset, or leave null to create a new collection")]
    [SerializeField] private GraphicsStateCollection _collection;

    private GraphicsStateCollection _activeCollection;

    void Start()
    {
        // WHY: Create a new collection if none was assigned.
        // The collection accumulates PSOs across multiple sessions.
        _activeCollection = _collection != null
            ? _collection
            : new GraphicsStateCollection();

        // WHY: BeginTrace starts recording. Every draw call that
        // triggers a new PSO compilation is captured automatically.
        _activeCollection.BeginTrace();

        Debug.Log("[PSO Tracer] Tracing started");
    }

    void OnDestroy()
    {
        // WHY: EndTrace stops recording and finalizes the collection.
        _activeCollection.EndTrace();

        // WHY: SendToEditor serializes the collection as a
        // .graphicsstate asset in your project. This only works
        // in the editor or development builds.
#if UNITY_EDITOR
        _activeCollection.SendToEditor();
        Debug.Log("[PSO Tracer] Collection saved to project");
#endif
    }
}
```

**Best practices for tracing sessions:**

1. **Play through every level, menu, and loading screen** — PSOs are specific to the combination of shader variant + render state, so a material seen in Level 1 may produce a different PSO than the same material under Level 3's post-processing stack
2. **Cover all quality tiers** — different graphics settings (shadow quality, MSAA, HDR on/off) produce different PSOs
3. **Test on each target graphics API** — a DirectX 12 collection is useless on Vulkan; trace separately per API
4. **Accumulate across sessions** — run tracing multiple times and merge collections to maximize coverage
5. **Automate with play-mode tests** — write automated camera flythrough tests that visit every scene and trigger every VFX

### Phase 2: Warming (Runtime)

At load time, warm up all traced PSOs so the driver compiles and caches them before the player sees any gameplay.

```csharp
using UnityEngine;
using UnityEngine.Rendering;
using Unity.Jobs;

public class PSOWarmer : MonoBehaviour
{
    [Tooltip("The .graphicsstate asset(s) to warm up")]
    [SerializeField] private GraphicsStateCollection[] _collections;

    [Tooltip("Use progressive warming to avoid blocking the main thread")]
    [SerializeField] private bool _useProgressive = true;

    [Tooltip("PSOs to compile per frame in progressive mode")]
    [SerializeField] private int _psosPerFrame = 50;

    [Tooltip("Track PSOs that weren't in the collection (cache misses)")]
    [SerializeField] private bool _trackCacheMisses = true;

    private GraphicsStateCollection _cacheMissCollection;

    public async void WarmUpAllCollections()
    {
        foreach (var collection in _collections)
        {
            if (collection == null) continue;

            if (_useProgressive)
            {
                // WHY: WarmUpProgressively compiles a fixed number of
                // PSOs per call, spreading the work across frames.
                // This keeps the loading screen responsive and allows
                // you to update a progress bar.
                await WarmUpProgressiveAsync(collection);
            }
            else
            {
                // WHY: WarmUp compiles ALL PSOs in one batch.
                // Returns a JobHandle so you can schedule it
                // asynchronously via the Job System.
                var handle = collection.WarmUp(
                    traceCacheMisses: _trackCacheMisses,
                    out _cacheMissCollection);

                // WHY: Complete() blocks until all PSOs are compiled.
                // Use this during a loading screen where a brief
                // freeze (0.5–2 seconds) is acceptable.
                handle.Complete();
            }
        }

        Debug.Log($"[PSO Warmer] All collections warmed up");
    }

    private async Awaitable WarmUpProgressiveAsync(
        GraphicsStateCollection collection)
    {
        int totalPSOs = collection.Count;
        int warmedUp = 0;

        while (warmedUp < totalPSOs)
        {
            // WHY: Each call to WarmUpProgressively compiles up to
            // _psosPerFrame PSOs and returns a JobHandle for that batch.
            var handle = collection.WarmUpProgressively(
                _psosPerFrame,
                traceCacheMisses: _trackCacheMisses,
                out _cacheMissCollection);

            handle.Complete();
            warmedUp += _psosPerFrame;

            // WHY: Yield to let the loading screen render a frame.
            // Update your progress bar here.
            float progress = Mathf.Clamp01((float)warmedUp / totalPSOs);
            OnProgressChanged?.Invoke(progress);

            await Awaitable.NextFrameAsync();
        }
    }

    public System.Action<float> OnProgressChanged;
}
```

---

## Cache Miss Tracking

Even thorough tracing sessions can miss some PSOs — rare VFX, edge-case material combinations, or new content added after the last trace. Cache miss tracking catches these gaps.

```csharp
// WHY: When traceCacheMisses is true, the WarmUp/WarmUpProgressively
// methods populate a separate collection with any PSO that was
// compiled at runtime but NOT found in the pre-warmed collection.
// Ship this back to your build pipeline to fill gaps.

void OnApplicationQuit()
{
    if (_cacheMissCollection != null && _cacheMissCollection.Count > 0)
    {
        Debug.LogWarning(
            $"[PSO Warmer] {_cacheMissCollection.Count} cache misses detected! " +
            "Run another tracing session to capture them.");

#if UNITY_EDITOR
        // WHY: In editor/dev builds, send misses back so they're
        // included in the next build's .graphicsstate asset.
        _cacheMissCollection.SendToEditor();
#endif
    }
}
```

---

## Profiling Shader Compilation

Use the Unity Profiler to detect runtime shader compilation even after warming:

| Profiler Marker | What It Means |
|----------------|---------------|
| `Shader.CreateGPUProgram` | A shader variant is being compiled for the first time |
| `CreateGraphicsPipelineImpl` | A PSO is being created (the actual stutter source) |
| `GraphicsStateCollection.WarmUp` | Your warm-up code is running (expected during loading) |

```csharp
// WHY: In development builds, log any shader compilation that
// happens outside the warm-up phase. This reveals missed PSOs
// that need to be added to your tracing sessions.

#if DEVELOPMENT_BUILD || UNITY_EDITOR
[RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
static void EnableShaderCompilationLogging()
{
    // Use the Profiler API to detect Shader.CreateGPUProgram
    // markers during gameplay (not during loading)
    Debug.Log("[PSO Debug] Monitoring for runtime shader compilation...");
}
#endif
```

---

## Supported Graphics APIs

| Graphics API | PSO Tracing | PSO Warming | Notes |
|-------------|-------------|-------------|-------|
| DirectX 12 | Yes | Yes | Full support — most benefit |
| Vulkan | Yes | Yes | Full support |
| Metal | Yes | Yes | Full support |
| DirectX 11 | Fallback | Fallback | Automatically uses legacy `ShaderVariantCollection.WarmUp()` |
| OpenGL / OpenGLES | Fallback | Fallback | Same legacy fallback |
| WebGL / WebGPU | Fallback | Fallback | Same legacy fallback |

---

## Build Pipeline Integration

### Per-Platform Collections

PSO data is **graphics-API-specific**. A collection traced on DirectX 12 won't work on Vulkan. Organize your collections by platform:

```
Assets/
└── GraphicsStateCollections/
    ├── Windows_DX12.graphicsstate
    ├── Windows_Vulkan.graphicsstate
    ├── macOS_Metal.graphicsstate
    ├── PS5_GNM.graphicsstate
    └── Switch_NVN.graphicsstate
```

### Stripping Collections at Build Time

Use `IPreprocessBuildWithReport` or a custom build processor to include only the relevant collection for the target platform, reducing build size:

```csharp
// WHY: Ship only the collection matching the build's graphics API.
// A DX12 collection is ~50 KB–2 MB depending on shader complexity;
// including all platforms wastes space on console builds.

using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;

public class PSOCollectionStripper : IPreprocessBuildWithReport
{
    public int callbackOrder => 0;

    public void OnPreprocessBuild(BuildReport report)
    {
        // Strip collections that don't match the target platform
        // by toggling their asset bundle inclusion or using
        // Addressables labels per platform
        var target = report.summary.platform;
        Debug.Log($"[PSO Stripper] Building for {target} — " +
            "stripping non-matching GraphicsStateCollections");
    }
}
```

### Combining Collections

After multiple tracing sessions, merge collections to create a comprehensive warm-up set:

```csharp
// WHY: Multiple QA testers may trace different play paths.
// Combining their collections ensures maximum PSO coverage.

var combined = new GraphicsStateCollection();
combined.Merge(collection1);
combined.Merge(collection2);
combined.Merge(collection3);

// The merged collection contains the union of all unique PSOs
```

---

## Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| Tracing only one quality tier | Trace at every quality level — PSOs differ per render state |
| Forgetting to retrace after shader changes | Any shader edit invalidates existing PSO data; retrace after material / shader updates |
| Warming synchronously on the main thread without a loading screen | Use `WarmUpProgressively` or schedule `WarmUp` with `JobHandle` during a loading screen |
| Not stripping per platform | Ship only the collection for the target graphics API |
| Ignoring cache misses in dev builds | Enable `traceCacheMisses` and feed misses back into your collection |
| Using PSO warming for compute / RT shaders | `GraphicsStateCollection` does **not** support compute shaders or ray tracing shaders — only rasterization PSOs |

---

## Complete Loading Screen Integration

```csharp
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;

// WHY: This is a practical loading screen that warms PSOs
// progressively while showing a progress bar, then loads
// the gameplay scene.
public class LoadingScreen : MonoBehaviour
{
    [SerializeField] private GraphicsStateCollection[] _psoCollections;
    [SerializeField] private string _nextScene = "Gameplay";
    [SerializeField] private UnityEngine.UIElements.UIDocument _uiDoc;

    private async void Start()
    {
        var progressBar = _uiDoc.rootVisualElement.Q<UnityEngine.UIElements.ProgressBar>("progress");

        // Phase 1: Warm up PSOs
        progressBar.title = "Preparing graphics...";
        int totalPSOs = 0;
        foreach (var c in _psoCollections) totalPSOs += c.Count;

        int warmed = 0;
        foreach (var collection in _psoCollections)
        {
            int remaining = collection.Count;
            while (remaining > 0)
            {
                int batch = Mathf.Min(32, remaining);
                var handle = collection.WarmUpProgressively(batch,
                    traceCacheMisses: true, out _);
                handle.Complete();

                remaining -= batch;
                warmed += batch;
                progressBar.value = (float)warmed / totalPSOs * 50f; // 0–50%

                await Awaitable.NextFrameAsync();
            }
        }

        // Phase 2: Load gameplay scene
        progressBar.title = "Loading level...";
        var sceneOp = SceneManager.LoadSceneAsync(_nextScene);
        sceneOp.allowSceneActivation = false;

        while (sceneOp.progress < 0.9f)
        {
            progressBar.value = 50f + sceneOp.progress / 0.9f * 50f; // 50–100%
            await Awaitable.NextFrameAsync();
        }

        progressBar.value = 100f;
        sceneOp.allowSceneActivation = true;
    }
}
```

---

## Checklist

- [ ] Trace PSOs for every level, menu, and VFX on every target graphics API
- [ ] Save `.graphicsstate` assets per platform in `Assets/GraphicsStateCollections/`
- [ ] Warm up collections during loading screens using `WarmUpProgressively`
- [ ] Enable `traceCacheMisses` in development builds
- [ ] Feed cache miss collections back into tracing data
- [ ] Retrace after shader or material changes
- [ ] Strip non-matching collections per platform at build time
- [ ] Profile with `Shader.CreateGPUProgram` marker to verify zero runtime compilation
- [ ] Remember: this API is experimental and may change in future Unity versions
