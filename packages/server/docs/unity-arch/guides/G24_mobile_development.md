# G24 — Mobile Development & Optimization in Unity 6

> **Category:** guide · **Engine:** Unity 6 (6000.x, URP 17+) · **Related:** [G10 Rendering Pipeline](G10_rendering_pipeline_urp_hdrp.md) · [G11 Debugging & Profiling](G11_debugging_profiling.md) · [G16 Performance & Memory](G16_performance_optimization_memory.md) · [Unity Rules](../unity-arch-rules.md)

Mobile remains the largest gaming platform by install base, and Unity 6 is the most mobile-optimized release yet. This guide covers platform setup, rendering strategies, memory management, input handling, Adaptive Performance, battery/thermal management, and publishing workflows for iOS and Android. Every code sample targets Unity 6 (6000.x) with URP.

---

## Platform Setup

### Build Profiles (Unity 6)

Unity 6 replaces the old Build Settings window with **Build Profiles** — a ScriptableObject-based system that stores per-platform configuration as assets.

```csharp
// Build Profiles live in Assets/ and can be switched via EditorUserBuildSettings
// In Unity 6, use Edit → Build Profiles to create iOS / Android profiles
// Each profile stores: scripting backend, architecture, compression, icons, splash
```

### Scripting Backend & Architecture

| Platform | Backend     | Architecture    | Notes |
|----------|-------------|-----------------|-------|
| Android  | IL2CPP      | ARM64           | Mono is deprecated for Android in Unity 6; ARM64 is required by Google Play |
| iOS      | IL2CPP      | ARM64           | IL2CPP is the only option; ARMv7 dropped in Unity 2023+ |

```csharp
// In Player Settings (or Build Profile):
// Scripting Backend → IL2CPP
// Target Architectures → ARM64
// API Compatibility Level → .NET Standard 2.1
//
// IL2CPP produces ahead-of-time (AOT) compiled C++ — no JIT on mobile.
// This means generic virtual methods and some reflection patterns may
// require explicit preservation via a link.xml file.
```

### Minimum API Levels

```
Android: API Level 24+ (Android 7.0) recommended for Vulkan support
iOS: iOS 16+ recommended for Metal 3 features
```

---

## Rendering for Mobile

### URP Mobile Configuration

URP is the default and recommended pipeline for mobile. Configure it for mobile hardware:

```csharp
// Create a URP Asset specifically for mobile via:
// Assets → Create → Rendering → URP Asset (with Universal Renderer)

// Key settings in the URP Asset for mobile:
// ┌─────────────────────────────────────────────┐
// │ Rendering                                    │
// │   Renderer: Forward (not Forward+)           │
// │   Depth Texture: Off (unless needed)         │
// │   Opaque Texture: Off (unless needed)        │
// │                                              │
// │ Quality                                      │
// │   HDR: Off on low-end, On for mid+           │
// │   Anti Aliasing: MSAA 2x or Off              │
// │   Render Scale: 0.75–1.0 (dynamic)           │
// │                                              │
// │ Lighting                                     │
// │   Main Light: Per Pixel                      │
// │   Additional Lights: Per Vertex or Disabled  │
// │   Max Additional Lights: 2–4                 │
// │   Shadows: 1 cascade, 1024–2048 resolution   │
// │                                              │
// │ Post Processing                              │
// │   Bloom: minimal iterations                  │
// │   Tone Mapping: ACES or Neutral              │
// │   Motion Blur: OFF on mobile                 │
// │   Depth of Field: OFF or Gaussian only       │
// └─────────────────────────────────────────────┘
```

### Graphics API Selection

```csharp
// Android: Vulkan (primary), OpenGL ES 3.2 (fallback)
// iOS: Metal (only option)
//
// In Player Settings → Other Settings → Graphics APIs:
// Android: [Vulkan, OpenGLES3] — Vulkan first for better performance
//
// Vulkan benefits on Android:
// - Lower driver overhead (thinner abstraction)
// - Better batching via Vulkan command buffers
// - Required for GPU Resident Drawer on Android
```

### GPU Resident Drawer

New in Unity 6, the GPU Resident Drawer batches draw calls automatically. Enable it in Project Settings → Graphics:

```csharp
// GPU Resident Drawer is ideal for scenes with many static meshes.
// On mobile, it reduces CPU-side draw call overhead significantly.
// Requirements:
// - URP or HDRP
// - Vulkan (Android) or Metal (iOS)
// - Compatible GPU (most 2020+ mobile GPUs)
```

### Draw Call Optimization

```csharp
// === SRP Batcher (enabled by default in URP) ===
// The SRP Batcher makes material data persistent in GPU memory,
// reducing the CPU cost of setting up each draw call.
// Works automatically with URP/Lit and URP/Simple Lit shaders.

// === GPU Instancing ===
// For rendering hundreds of identical objects (grass, trees, debris):
// 1. Enable "GPU Instancing" on the material
// 2. Objects must share the same mesh + material
// 3. Per-instance properties via MaterialPropertyBlock:

MaterialPropertyBlock props = new MaterialPropertyBlock();
// Set per-instance color variation
props.SetColor("_BaseColor", Random.ColorHSV());
renderer.SetPropertyBlock(props);

// === Static Batching ===
// Mark non-moving GameObjects as "Static" in the Inspector.
// Unity combines their meshes at build time into larger buffers.
// Trade-off: increased memory for reduced draw calls.

// === Dynamic Batching ===
// Auto-combines small meshes (<300 vertices) at runtime.
// WARNING: Can actually HURT performance if overused on mobile.
// Only enable if profiling shows draw-call-bound scenarios
// with many tiny meshes (e.g., particle debris).
```

---

## Memory Management

Mobile devices have strict memory budgets. Exceeding them causes OS-level kills (no crash log — the app just disappears).

### Memory Budgets

```
// Typical memory budgets (total app memory):
// Low-end Android (2-3 GB RAM): ~400–600 MB
// Mid-range Android (4-6 GB):   ~800 MB–1.2 GB
// High-end Android (8+ GB):     ~1.5–2 GB
// iPhone (3-4 GB RAM):          ~1–1.4 GB
// iPhone (6-8 GB RAM):          ~2–3 GB
//
// iOS is more aggressive with memory warnings.
// Android varies wildly by OEM and OS version.
```

### Texture Compression

```csharp
// Use ASTC compression for both platforms (Unity 6 default):
// - iOS: ASTC 6x6 (good quality/size balance)
// - Android: ASTC 6x6 (Vulkan) or ETC2 (OpenGL ES fallback)
//
// In Texture Import Settings:
// Format: ASTC 6x6 (or 8x8 for less important textures)
// Max Size: 1024 for most game textures, 2048 for hero assets
//
// ASTC advantages over ETC2:
// - Better quality at same file size
// - Supports alpha natively (no separate alpha texture)
// - Variable block sizes (4x4 to 12x12) for fine-tuned quality/size

// Verify texture memory at runtime:
long textureMemory = UnityEngine.Profiling.Profiler.GetAllocatedMemoryForGraphicsDriver();
Debug.Log($"GPU memory allocated: {textureMemory / (1024 * 1024)} MB");
```

### Addressables for Mobile

```csharp
using UnityEngine.AddressableAssets;
using UnityEngine.ResourceManagement.AsyncOperations;

// Load assets on demand instead of bundling everything in the install:
AsyncOperationHandle<GameObject> handle =
    Addressables.LoadAssetAsync<GameObject>("Prefabs/Boss_Dragon");

handle.Completed += (op) =>
{
    if (op.Status == AsyncOperationStatus.Succeeded)
    {
        // Instantiate only when needed — saves initial memory
        Instantiate(op.Result);
    }
};

// CRITICAL: Release when done to free memory
// Addressables.Release(handle);

// For mobile, configure Addressables groups:
// - "Local_Static" group: core assets shipped with the app
// - "Remote_Dynamic" group: DLC, seasonal content loaded from CDN
// This keeps initial install size under app store limits
// (Google Play: 200 MB AAB, Apple: 200 MB cellular download limit)
```

### Object Pooling

```csharp
using UnityEngine;
using UnityEngine.Pool;

// Unity 6 includes built-in ObjectPool<T> — no third-party needed.
// Pooling prevents GC spikes from frequent Instantiate/Destroy calls,
// which are the #1 cause of frame hitches on mobile.

public class BulletSpawner : MonoBehaviour
{
    [SerializeField] private GameObject bulletPrefab;

    // ObjectPool manages creation, retrieval, and return of objects.
    // collectionCheck: true warns if you return an object twice (editor only).
    // defaultCapacity: pre-allocate to avoid runtime allocations.
    // maxSize: cap prevents unbounded growth on low-memory devices.
    private ObjectPool<GameObject> _pool;

    void Awake()
    {
        _pool = new ObjectPool<GameObject>(
            createFunc: () => Instantiate(bulletPrefab),
            actionOnGet: (obj) => obj.SetActive(true),
            actionOnRelease: (obj) => obj.SetActive(false),
            actionOnDestroy: (obj) => Destroy(obj),
            collectionCheck: true,
            defaultCapacity: 20,   // Pre-warm 20 bullets
            maxSize: 100           // Hard cap for mobile memory
        );
    }

    public GameObject SpawnBullet()
    {
        return _pool.Get();
    }

    public void ReturnBullet(GameObject bullet)
    {
        _pool.Release(bullet);
    }
}
```

---

## Adaptive Performance

The Adaptive Performance package (`com.unity.adaptiveperformance` v5.x) dynamically adjusts quality settings based on device thermal state and performance headroom. Essential for Android where device diversity is extreme.

### Setup

```csharp
// Install via Package Manager:
// com.unity.adaptiveperformance (core)
// com.unity.adaptiveperformance.samsung.android (Samsung provider)
// com.unity.adaptiveperformance.google.android (Google ADPF provider)
//
// Google's Android Dynamic Performance Framework (ADPF) is supported
// on most Android 12+ devices, not just Samsung.
//
// Enable in Project Settings → Adaptive Performance → Initialize on Startup
```

### Scalers

```csharp
using UnityEngine.AdaptivePerformance;

// Adaptive Performance uses "Scalers" — components that automatically
// adjust quality dimensions when the device is under thermal pressure.

// Built-in scalers in v5.x:
// - AdaptiveResolution: lowers render resolution
// - AdaptiveBatching: adjusts batching strategy
// - AdaptiveFramerate: lowers target FPS
// - AdaptiveLOD: forces lower LOD levels
// - AdaptiveShadowDistance: reduces shadow range
// - AdaptiveShadowQuality: lowers shadow resolution
// - AdaptiveDecal: reduces decal quality
// - AdaptiveLayerCulling: culls additional layers

// Query thermal state at runtime:
var ap = Holder.Instance;
if (ap != null && ap.Active)
{
    // ThermalMetrics reports device temperature status
    var thermalStatus = ap.ThermalStatus;
    float temperatureLevel = thermalStatus.ThermalMetrics.TemperatureLevel;
    // 0.0 = cool, 1.0 = critical throttling

    // PerformanceMetrics reports CPU/GPU frame timing
    var perfStatus = ap.PerformanceStatus;
    float gpuTime = perfStatus.PerformanceMetrics.GpuFrameTime;
    float cpuTime = perfStatus.PerformanceMetrics.CpuFrameTime;
}
```

### Manual Quality Tiers

For games that need more control than automatic scalers:

```csharp
using UnityEngine;
using UnityEngine.Rendering.Universal;

/// <summary>
/// A manual quality tier system for mobile.
/// Detects device capability and sets rendering quality accordingly.
/// Works alongside (or instead of) Adaptive Performance.
/// </summary>
public class MobileQualityManager : MonoBehaviour
{
    // Define tiers based on SystemInfo queries
    public enum DeviceTier { Low, Medium, High }

    void Start()
    {
        DeviceTier tier = ClassifyDevice();
        ApplyQualityTier(tier);
    }

    DeviceTier ClassifyDevice()
    {
        int gpuMemMB = SystemInfo.graphicsMemorySize;
        int cpuCores = SystemInfo.processorCount;
        int ramMB = SystemInfo.systemMemorySize;

        // Heuristic classification — tune based on your target audience
        if (gpuMemMB < 2048 || cpuCores <= 4 || ramMB < 3072)
            return DeviceTier.Low;
        if (gpuMemMB < 4096 || cpuCores <= 6 || ramMB < 6144)
            return DeviceTier.Medium;
        return DeviceTier.High;
    }

    void ApplyQualityTier(DeviceTier tier)
    {
        // Switch Unity Quality Level (configured in Project Settings → Quality)
        QualitySettings.SetQualityLevel((int)tier, applyExpensiveChanges: true);

        // Adjust render scale on the URP asset
        var urpAsset = (UniversalRenderPipelineAsset)
            QualitySettings.renderPipeline;

        switch (tier)
        {
            case DeviceTier.Low:
                urpAsset.renderScale = 0.7f;
                Application.targetFrameRate = 30;
                break;
            case DeviceTier.Medium:
                urpAsset.renderScale = 0.85f;
                Application.targetFrameRate = 60;
                break;
            case DeviceTier.High:
                urpAsset.renderScale = 1.0f;
                Application.targetFrameRate = 60;
                break;
        }

        Debug.Log($"[MobileQuality] Tier={tier}, " +
                  $"RenderScale={urpAsset.renderScale}, " +
                  $"FPS={Application.targetFrameRate}");
    }
}
```

---

## Touch Input on Mobile

### New Input System for Touch

```csharp
using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.InputSystem.EnhancedTouch;

// Unity 6 uses the Input System package for touch.
// EnhancedTouch provides a higher-level API than raw Touchscreen.

public class TouchInputHandler : MonoBehaviour
{
    void OnEnable()
    {
        // Must explicitly enable EnhancedTouch
        EnhancedTouchSupport.Enable();
        UnityEngine.InputSystem.EnhancedTouch.Touch.onFingerDown += OnFingerDown;
        UnityEngine.InputSystem.EnhancedTouch.Touch.onFingerMove += OnFingerMove;
        UnityEngine.InputSystem.EnhancedTouch.Touch.onFingerUp += OnFingerUp;
    }

    void OnDisable()
    {
        UnityEngine.InputSystem.EnhancedTouch.Touch.onFingerDown -= OnFingerDown;
        UnityEngine.InputSystem.EnhancedTouch.Touch.onFingerMove -= OnFingerMove;
        UnityEngine.InputSystem.EnhancedTouch.Touch.onFingerUp -= OnFingerUp;
        EnhancedTouchSupport.Disable();
    }

    void OnFingerDown(Finger finger)
    {
        // finger.screenPosition gives pixel coordinates
        // Convert to world space for gameplay:
        Vector2 screenPos = finger.screenPosition;
        Vector3 worldPos = Camera.main.ScreenToWorldPoint(
            new Vector3(screenPos.x, screenPos.y, Camera.main.nearClipPlane));

        Debug.Log($"Touch down at world: {worldPos}");
    }

    void OnFingerMove(Finger finger)
    {
        // finger.currentTouch.delta gives frame-to-frame movement
        Vector2 delta = finger.currentTouch.delta;
        // Use delta for swipe gestures, camera pan, etc.
    }

    void OnFingerUp(Finger finger)
    {
        // Check tap vs swipe based on duration and distance
        float duration = (float)finger.currentTouch.time;
        float distance = Vector2.Distance(
            finger.currentTouch.startScreenPosition,
            finger.screenPosition);

        if (duration < 0.3f && distance < 50f)
        {
            Debug.Log("Tap detected!");
        }
    }
}
```

### Safe Area Handling

```csharp
using UnityEngine;

/// <summary>
/// Adjusts a RectTransform to fit within the device's safe area,
/// avoiding notches, rounded corners, and home indicators.
/// Attach to a full-screen Canvas RectTransform.
/// </summary>
public class SafeAreaHandler : MonoBehaviour
{
    private RectTransform _rectTransform;
    private Rect _lastSafeArea;

    void Awake()
    {
        _rectTransform = GetComponent<RectTransform>();
    }

    void Update()
    {
        // Screen.safeArea can change on orientation change
        if (Screen.safeArea != _lastSafeArea)
        {
            ApplySafeArea(Screen.safeArea);
            _lastSafeArea = Screen.safeArea;
        }
    }

    void ApplySafeArea(Rect safeArea)
    {
        // Convert safe area from pixel coordinates to anchor coordinates (0-1)
        Vector2 anchorMin = safeArea.position;
        Vector2 anchorMax = safeArea.position + safeArea.size;
        anchorMin.x /= Screen.width;
        anchorMin.y /= Screen.height;
        anchorMax.x /= Screen.width;
        anchorMax.y /= Screen.height;

        _rectTransform.anchorMin = anchorMin;
        _rectTransform.anchorMax = anchorMax;
    }
}
```

---

## Battery & Thermal Management

```csharp
// === Frame Rate Management ===
// Don't target 60fps by default on mobile — 30fps saves battery
// and thermal headroom. Use 60fps only for action-heavy gameplay.

// Set target frame rate:
Application.targetFrameRate = 30; // Menus, turn-based, puzzle
Application.targetFrameRate = 60; // Action, racing, FPS

// === On-Demand Rendering ===
// For menus or idle screens, reduce rendering to save battery:
using UnityEngine.Rendering;

// Render only every 3rd frame (effectively ~10fps from a 30fps target)
OnDemandRendering.renderFrameInterval = 3;

// Resume normal rendering for gameplay:
OnDemandRendering.renderFrameInterval = 1;

// === Screen Brightness ===
// Unity doesn't control brightness directly, but you can:
// - Use darker UI themes to reduce OLED power draw
// - Disable camera rendering during menus (camera.enabled = false)
// - Stop physics simulation when paused (Physics.simulationMode)
```

---

## Profiling on Device

```csharp
// === Remote Profiler Connection ===
// 1. Enable "Development Build" and "Autoconnect Profiler" in Build Profile
// 2. Build & run on device
// 3. In Unity Editor: Window → Analysis → Profiler
// 4. Select target device from the dropdown
//
// Can connect via:
// - USB (most reliable)
// - Wi-Fi (device and editor on same network)

// === Frame Debugger ===
// Works remotely in Unity 6 — see every draw call on the actual device.
// Window → Analysis → Frame Debugger → connect to device

// === Memory Profiler ===
// Install com.unity.memoryprofiler for detailed snapshots.
// Capture a snapshot from the device, then analyze in the Editor.
// Look for:
// - Duplicate textures (loaded from different paths)
// - Large uncompressed audio clips
// - Shader variants bloating GPU memory

// === Platform-Specific Tools ===
// Android: Android GPU Inspector (AGI) for Vulkan profiling
// iOS: Xcode Instruments (Metal System Trace, Allocations)
// Samsung: GameBench / GPUWatch for thermal analysis
```

---

## Publishing Checklist

### Android (Google Play)

```
☐ Scripting backend: IL2CPP, ARM64 only
☐ Build format: AAB (Android App Bundle) — not APK
☐ Target API level: 35+ (Google Play requirement for 2025+)
☐ Proguard/R8 minification enabled for Java code
☐ App size: <200 MB base, use Play Asset Delivery for large assets
☐ 64-bit compliance verified
☐ Adaptive icons configured (foreground + background layers)
☐ Keystore signed and backed up securely
☐ Google Play Console: staged rollout (5% → 20% → 100%)
```

### iOS (App Store)

```
☐ Scripting backend: IL2CPP (only option)
☐ Minimum iOS version: 16.0+
☐ App Transport Security: HTTPS for all network calls
☐ Privacy manifest (PrivacyInfo.xcprivacy) included — required since 2024
☐ Required device capabilities declared in Info.plist
☐ App Tracking Transparency prompt if using IDFA
☐ TestFlight beta testing before submission
☐ App size: <200 MB for cellular download
☐ App Store review guidelines compliance check
```

---

## Common Mobile Pitfalls

| Pitfall | Solution |
|---------|----------|
| App killed with no crash log | Exceeded memory budget — profile with Memory Profiler |
| Frame spikes every few seconds | GC allocation — use object pooling, avoid LINQ in Update() |
| Overheating after 10 minutes | Integrate Adaptive Performance; lower target FPS |
| Tiny text / buttons | Design UI for minimum 44pt touch targets; test on real devices |
| Black screen on some Androids | Missing Vulkan fallback — include OpenGL ES 3.x in Graphics APIs |
| Slow load times | Use Addressables async loading; show loading screen |
| Battery drain in menus | Use OnDemandRendering to reduce frame rate when idle |

---

## Quick Reference

```
Project Settings for Mobile:
├── Player
│   ├── Scripting Backend: IL2CPP
│   ├── Architecture: ARM64
│   └── API Compatibility: .NET Standard 2.1
├── Quality
│   ├── URP Asset (Mobile): Forward, MSAA 2x, 0.85 scale
│   └── Shadows: 1 cascade, 1024 resolution
├── Graphics
│   └── GPU Resident Drawer: Enabled (Vulkan/Metal)
└── Adaptive Performance
    └── Initialize on Startup: ✓
```
