# G27 — WebGPU & Web Deployment in Unity 6

> **Category:** guide · **Engine:** Unity 6 (6000.1+, URP 17+) · **Related:** [G10 Rendering Pipeline](G10_rendering_pipeline_urp_hdrp.md) · [G16 Performance & Memory](G16_performance_optimization_memory.md) · [G21 Build Profiles](G21_build_profiles_cross_platform.md) · [Unity Rules](../unity-arch-rules.md)

WebGPU is Unity's next-generation graphics backend for the Web platform, introduced as **experimental** in Unity 6.1 (6000.1). It succeeds WebGL 2 and exposes modern GPU capabilities — compute shaders, indirect rendering, GPU skinning, and VFX Graph — inside the browser. This guide covers setup, capabilities, limitations, fallback strategies, and optimization for shipping web games with Unity 6.

---

## What WebGPU Unlocks

WebGL 2 maps to OpenGL ES 3.0, a ~2012-era API. WebGPU maps to **Vulkan / Metal / Direct3D 12**, enabling features that were impossible in the browser before:

| Feature | WebGL 2 | WebGPU |
|---------|---------|--------|
| Compute shaders | ❌ | ✅ |
| Indirect rendering | ❌ | ✅ |
| GPU skinning | ❌ | ✅ |
| VFX Graph | ❌ | ✅ |
| Structured buffers (RWStructuredBuffer) | ❌ | ✅ |
| GPU Resident Drawer batching | ❌ | ✅ |
| Async GPU readback | ❌ | ❌ (not yet) |
| Wave intrinsics | ❌ | ❌ (not yet) |

> **Key insight:** WebGPU doesn't just make existing content faster — it unlocks entire categories of rendering techniques (particle compute, GPU-driven rendering) that were simply unavailable on the web.

---

## Browser Support (as of early 2026)

| Browser | Status | Notes |
|---------|--------|-------|
| Chrome 113+ | ✅ Shipped | Enabled by default since May 2023 |
| Edge 113+ | ✅ Shipped | Chromium-based, mirrors Chrome support |
| Firefox 139+ | ✅ Shipped | Enabled by default since late 2025 |
| Safari 18+ | ✅ Shipped | macOS and iOS support |

All major browsers now ship WebGPU by default, but older browser versions and some mobile browsers may not support it. **Always include WebGL 2 as a fallback.**

---

## Enabling WebGPU in Your Project

### Step 1 — Verify Unity Version

WebGPU requires **Unity 6.1 (6000.1)** or later. Earlier Unity 6.0 builds do not include the WebGPU backend.

### Step 2 — Configure Graphics APIs

```
Edit → Project Settings → Player → Web → Other Settings → Graphics APIs
```

Add **WebGPU** to the graphics API list. Unity tries APIs in list order, falling back to the next if the browser doesn't support the first.

```csharp
// Recommended API order for broad compatibility:
// 1. WebGPU    ← modern browsers use this
// 2. WebGL2    ← fallback for older browsers
//
// WHY: Unity automatically selects the first supported API at runtime.
// Keeping both ensures your game works everywhere while using the
// best available backend on modern browsers.
```

### Step 3 — Set URP as Render Pipeline

WebGPU works with **URP only** in Unity 6. HDRP is not supported for Web builds.

```csharp
// In Project Settings → Graphics:
// Scriptable Render Pipeline Settings → assign your URP Asset
//
// WHY: The Web platform targets a wide range of hardware. URP is designed
// for scalability across performance tiers — exactly what web deployment needs.
```

### Step 4 — Build a Web Player

```
Edit → Build Profiles → Web → Build
```

Or from script:

```csharp
#if UNITY_EDITOR
using UnityEditor;

public static class WebBuildHelper
{
    // Automate web builds for CI/CD pipelines
    [MenuItem("Build/Web (WebGPU + WebGL2 Fallback)")]
    public static void BuildWeb()
    {
        var options = new BuildPlayerOptions
        {
            scenes = new[] { "Assets/_Project/Scenes/Bootstrap.unity" },
            locationPathName = "Builds/Web",
            target = BuildTarget.WebGL, // WebGPU uses the same build target
            options = BuildOptions.None
        };

        BuildPipeline.BuildPlayer(options);
    }
}
#endif
```

---

## Detecting WebGPU at Runtime

```csharp
using UnityEngine;
using UnityEngine.Rendering;

public class GraphicsBackendInfo : MonoBehaviour
{
    void Start()
    {
        // SystemInfo.graphicsDeviceType tells you which API is active
        // WHY: You may want to enable/disable features based on the backend.
        // For example, enable compute-shader particle systems only on WebGPU.
        var api = SystemInfo.graphicsDeviceType;

        if (api == GraphicsDeviceType.WebGPU)
        {
            Debug.Log("Running on WebGPU — compute shaders available!");
            EnableAdvancedParticles();
        }
        else
        {
            Debug.Log($"Running on {api} — using fallback rendering");
            EnableSimpleParticles();
        }
    }

    void EnableAdvancedParticles()
    {
        // Enable VFX Graph or compute-shader-driven particle systems
    }

    void EnableSimpleParticles()
    {
        // Use CPU-based Particle System (Shuriken) for WebGL2 fallback
    }
}
```

---

## Compute Shaders on WebGPU

One of the biggest wins with WebGPU is compute shader support. Here's a minimal example:

### Compute Shader (ParticleCompute.compute)

```hlsl
// Each #pragma kernel declares a compute function that can be dispatched from C#
#pragma kernel UpdateParticles

// WHY: StructuredBuffer is the correct buffer type for WebGPU.
// RWBuffer<T> is NOT supported on WebGPU — always use RWStructuredBuffer.
struct Particle
{
    float3 position;
    float3 velocity;
    float life;
};

RWStructuredBuffer<Particle> particles;
float deltaTime;

[numthreads(64, 1, 1)]
void UpdateParticles(uint3 id : SV_DispatchThreadID)
{
    Particle p = particles[id.x];

    // Simple Euler integration for particle physics
    p.position += p.velocity * deltaTime;
    p.life -= deltaTime;

    // Gravity pull
    p.velocity.y -= 9.81 * deltaTime;

    particles[id.x] = p;
}
```

### C# Dispatcher

```csharp
using UnityEngine;

public class ComputeParticleSystem : MonoBehaviour
{
    [SerializeField] private ComputeShader _computeShader;
    [SerializeField] private int _particleCount = 1024;

    private ComputeBuffer _particleBuffer;
    private int _kernelId;

    struct Particle
    {
        public Vector3 position;
        public Vector3 velocity;
        public float life;
    }

    void Start()
    {
        // WHY: Check for compute shader support at runtime.
        // On WebGL2 fallback, compute shaders are unavailable.
        if (!SystemInfo.supportsComputeShaders)
        {
            Debug.LogWarning("Compute shaders not supported — disabling GPU particles");
            enabled = false;
            return;
        }

        _kernelId = _computeShader.FindKernel("UpdateParticles");

        // Stride = size of Particle struct in bytes (3+3+1 floats = 28 bytes)
        _particleBuffer = new ComputeBuffer(_particleCount, sizeof(float) * 7);

        // Initialize particles with random positions and velocities
        var particles = new Particle[_particleCount];
        for (int i = 0; i < _particleCount; i++)
        {
            particles[i] = new Particle
            {
                position = Random.insideUnitSphere * 5f,
                velocity = Random.insideUnitSphere * 2f,
                life = Random.Range(1f, 5f)
            };
        }
        _particleBuffer.SetData(particles);

        _computeShader.SetBuffer(_kernelId, "particles", _particleBuffer);
    }

    void Update()
    {
        // WHY: Dispatch the compute shader every frame to update particle positions.
        // Thread groups = particleCount / threadsPerGroup (64 defined in .compute).
        _computeShader.SetFloat("deltaTime", Time.deltaTime);
        _computeShader.Dispatch(_kernelId, _particleCount / 64, 1, 1);
    }

    void OnDestroy()
    {
        // IMPORTANT: Always release GPU buffers to prevent memory leaks
        _particleBuffer?.Release();
    }
}
```

---

## Known Limitations (Unity 6.1–6.3)

These limitations are specific to the WebGPU backend and may be resolved in future Unity releases:

1. **No `RWBuffer<T>` in compute shaders** — use `RWStructuredBuffer<T>` instead
2. **No async compute** — all compute dispatches run on the main GPU queue
3. **No synchronous GPU readback** — `AsyncGPUReadback` is the only path; `Texture2D.ReadPixels()` does not work
4. **No Wave Intrinsics** — wave-level operations (`WaveActiveSum`, etc.) are unavailable
5. **HDRP is not supported** — URP only for web builds
6. **Experimental status** — unexpected shader compilation failures or driver quirks may occur
7. **Mobile browser support varies** — WebGPU on mobile Safari and Chrome for Android is still maturing

---

## Optimization Tips for Web Builds

### Reduce Build Size

```csharp
// In Player Settings → Web → Publishing Settings:
// - Compression Format: Brotli (best compression, requires HTTPS)
// - Data Caching: Enabled (caches asset bundles in IndexedDB)
// - Name Files As Hashes: Enabled (better CDN caching)
//
// WHY: Web games must download before playing. Every megabyte saved
// directly improves conversion rates. Brotli gives ~15-20% better
// compression than Gzip for Unity builds.
```

### Strip Unused Code

```csharp
// In Player Settings → Other Settings:
// - Managed Stripping Level: High
// - IL2CPP Code Generation: Faster (smaller) runtime
//
// WHY: IL2CPP is required for Web. High stripping removes unused
// .NET code paths, which can reduce WASM binary size by 30-50%.
// Test thoroughly — aggressive stripping can remove code accessed
// only via reflection. Use a link.xml to preserve critical types.
```

### Memory Budget

```csharp
// In Player Settings → Web → Publishing Settings:
// - Initial Memory Size: 32 MB (start low, let it grow)
// - Maximum Memory Size: 512 MB (browser tab limit)
//
// WHY: Web builds run inside a browser tab with limited memory.
// Starting low and growing on demand prevents the browser from
// pre-allocating more than needed, which can cause tab crashes
// on low-memory devices.
```

### Texture Compression

```csharp
// Use Build Profiles to set texture compression for Web:
// - ASTC: Best quality on modern mobile GPUs
// - DXT/BCn: Best for desktop browsers
// - ETC2: Fallback for older Android-based browsers
//
// Unity 6 can select the correct format at runtime via the
// "Use Player Settings" texture compression option in Build Profiles.
```

---

## Dual-Path Architecture Pattern

For games targeting both WebGPU and WebGL 2, structure your rendering code with a clean abstraction layer:

```csharp
// WHY: A dual-path approach lets you ship one build that
// uses advanced features on capable browsers while gracefully
// degrading on older ones.

public interface IParticleRenderer
{
    void Initialize(int count);
    void UpdateParticles(float deltaTime);
    void Render();
}

// GPU compute path — used when WebGPU is active
public class ComputeParticleRenderer : IParticleRenderer
{
    public void Initialize(int count) { /* Setup compute buffers */ }
    public void UpdateParticles(float dt) { /* Dispatch compute shader */ }
    public void Render() { /* DrawProceduralIndirect */ }
}

// CPU fallback path — used on WebGL 2
public class CpuParticleRenderer : IParticleRenderer
{
    public void Initialize(int count) { /* Allocate managed arrays */ }
    public void UpdateParticles(float dt) { /* C# loop on main thread */ }
    public void Render() { /* Standard Mesh + MaterialPropertyBlock */ }
}

// Factory selects the right implementation at startup
public static class ParticleRendererFactory
{
    public static IParticleRenderer Create(int count)
    {
        if (SystemInfo.supportsComputeShaders)
            return new ComputeParticleRenderer();

        return new CpuParticleRenderer();
    }
}
```

---

## Testing WebGPU Builds

1. **Build → Run locally** with Unity's built-in server, or use `python3 -m http.server` (must serve over HTTPS for some features)
2. **Test in multiple browsers** — Chrome, Firefox, Safari all have slightly different WebGPU implementations
3. **Use `--enable-unsafe-webgpu`** Chrome flag if testing bleeding-edge features
4. **Check the browser console** for WGSL shader compilation errors — these are more common than with WebGL
5. **Profile with Chrome DevTools** → Performance tab → check GPU utilization and frame timing
6. **Test fallback** by disabling WebGPU in browser flags to verify your WebGL 2 path works

---

## Summary

WebGPU brings desktop-class GPU features to the browser. In Unity 6.1+, it enables compute shaders, VFX Graph, and GPU-driven rendering for web games — a major leap over WebGL 2. Keep WebGL 2 as a fallback, structure your rendering with dual-path abstractions, and test across browsers. As browser support matures through 2026, WebGPU will become the default for serious web game development.
