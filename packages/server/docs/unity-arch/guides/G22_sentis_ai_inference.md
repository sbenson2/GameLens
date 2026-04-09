# Sentis: On-Device AI/ML Inference

> **Category:** guide · **Engine:** Unity 6+ · **Related:** [G16 Performance & Memory](G16_performance_optimization_memory.md), [G13 ECS/DOTS](G13_ecs_dots.md), [R2 Library Stack](../reference/R2_library_stack.md)

Sentis (package `com.unity.ai.inference`, formerly `com.unity.sentis`) is Unity's neural network inference library. It lets you import trained ONNX models and run them at runtime on CPU or GPU — no Python runtime, no cloud round-trip. This guide covers the end-to-end workflow: model import, backend selection, tensor management, async readback, and optimization patterns for real-time games.

---

## Why On-Device Inference Matters for Games

Traditional ML workflows send data to a server and wait for results. That adds latency, requires connectivity, and leaks player data. Sentis runs the model locally on the player's device, which means:

- **Zero network latency** — critical for real-time gameplay (NPC behavior, animation, vision)
- **Offline support** — mobile, console, and VR titles work without connectivity
- **Privacy** — player data never leaves the device
- **Determinism** — same hardware produces same results, important for replays

Common game use cases: smart NPC decision-making, style transfer on player photos, voice classification, object detection in AR/VR, procedural animation, and player behavior prediction.

---

## Installation

```
// Unity Package Manager — add by name
com.unity.ai.inference
```

Sentis 2.x ships with Unity 6. For Unity 2022 LTS, use the `com.unity.sentis` package (v1.x) instead — the API surface is similar but some method names differ.

> **Version note:** This guide targets Sentis 2.1+ (Unity 6 LTS) through 2.5 (Unity 6.1+). The package was renamed from `com.unity.sentis` to `com.unity.ai.inference` starting in 2.3.

---

## Core Workflow

The Sentis pipeline has four stages: **Load → Create Worker → Execute → Read Output**.

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│  .onnx   │───▶│  Model   │───▶│  Worker  │───▶│  Tensor  │
│  asset   │    │  Loader  │    │ (engine) │    │  Output  │
└──────────┘    └──────────┘    └──────────┘    └──────────┘
```

### Step 1: Import an ONNX Model

Drop a `.onnx` file into your Assets folder. Unity's importer converts it to a `.sentis` asset automatically. You can configure import settings in the Inspector:

- **Optimize** — fuse operators, constant-fold where possible
- **Quantization** — reduce precision (float16) to shrink model size and improve GPU throughput

```csharp
using Unity.Sentis;

public class InferenceManager : MonoBehaviour
{
    // Drag your imported model asset here in the Inspector
    [SerializeField] private ModelAsset modelAsset;

    private Model runtimeModel;
    private Worker worker;

    void Start()
    {
        // Load converts the asset into an executable graph representation.
        // This is relatively expensive — do it once at startup or level load,
        // not every frame.
        runtimeModel = ModelLoader.Load(modelAsset);
    }
}
```

### Step 2: Create a Worker (Inference Engine)

A `Worker` compiles the model graph into executable operations for a specific backend.

```csharp
void Start()
{
    runtimeModel = ModelLoader.Load(modelAsset);

    // BackendType.GPUCompute — fastest on desktop/console, uses compute shaders
    // BackendType.CPU         — fallback, runs on all platforms
    // BackendType.GPUPixel    — for platforms without compute shader support (WebGL, older mobile)
    worker = new Worker(runtimeModel, BackendType.GPUCompute);
}
```

**Backend selection strategy:**

| Platform | Recommended Backend | Why |
|----------|-------------------|-----|
| Desktop (Windows/Mac/Linux) | `GPUCompute` | Compute shaders are universally supported |
| Modern mobile (iOS 14+, Android Vulkan) | `GPUCompute` | Metal/Vulkan compute is fast |
| Older mobile / WebGL | `GPUPixel` | No compute shader support |
| Server / headless | `CPU` | No GPU available |
| Fallback | `CPU` | Works everywhere, just slower |

### Step 3: Prepare Input and Execute

```csharp
void RunInference(float[] inputData)
{
    // Create a tensor matching your model's expected input shape.
    // Shape must match exactly — check your ONNX model's input spec.
    // For a model expecting [batch=1, features=10]:
    using var inputTensor = new Tensor<float>(new TensorShape(1, 10), inputData);

    // Schedule() queues the work — it does NOT block the main thread.
    // The GPU processes the model graph asynchronously.
    worker.Schedule(inputTensor);
}
```

> **Common mistake:** Creating tensors every frame without disposing them. Tensors are unmanaged resources — always use `using` statements or call `Dispose()` explicitly.

### Step 4: Read the Output

```csharp
void ReadOutput()
{
    // PeekOutput returns a reference to the output tensor.
    // The tensor data may still be on the GPU at this point.
    var outputTensor = worker.PeekOutput() as Tensor<float>;

    // ReadbackAndClone() copies GPU data to CPU so you can read values.
    // This is a synchronous GPU→CPU copy — use sparingly in hot paths.
    using var cpuTensor = outputTensor.ReadbackAndClone();

    // Now you can read individual values
    float result = cpuTensor[0];
    Debug.Log($"Model output: {result}");
}
```

---

## Async Readback (Recommended for Real-Time Games)

Synchronous `ReadbackAndClone()` stalls the GPU pipeline. For frame-rate-sensitive code, use the async path:

```csharp
using System.Collections;
using Unity.Sentis;

public class AsyncInference : MonoBehaviour
{
    [SerializeField] private ModelAsset modelAsset;
    private Worker worker;

    IEnumerator Start()
    {
        var model = ModelLoader.Load(modelAsset);
        worker = new Worker(model, BackendType.GPUCompute);

        // Prepare input
        var input = new Tensor<float>(new TensorShape(1, 10));
        // ... fill input data ...

        worker.Schedule(input);

        var outputTensor = worker.PeekOutput() as Tensor<float>;

        // ReadbackAndCloneAsync returns an awaitable that completes
        // when the GPU→CPU copy finishes — no main-thread stall.
        var request = outputTensor.ReadbackAndCloneAsync();
        yield return request;

        // Safe to read now
        using var cpuOutput = request.Result;
        float prediction = cpuOutput[0];

        input.Dispose();
    }

    void OnDestroy()
    {
        // Always dispose the worker to free GPU resources
        worker?.Dispose();
    }
}
```

---

## Practical Example: NPC Threat Assessment

A small neural network that takes game-state features and outputs a threat score for NPC decision-making:

```csharp
using Unity.Sentis;
using UnityEngine;

/// <summary>
/// Uses a trained ML model to assess how threatening a situation is
/// for an NPC, replacing hand-tuned heuristics with learned behavior.
/// </summary>
public class NPCThreatModel : MonoBehaviour
{
    [SerializeField] private ModelAsset threatModel;

    // Model input: [playerDistance, playerHealth, npcHealth, allyCount,
    //               enemyCount, hasWeapon, isInCover, timeOfDay, alertLevel, ammoRatio]
    // Model output: [threatScore] in range [0, 1]

    private Worker worker;
    private const int FeatureCount = 10;

    void Awake()
    {
        var model = ModelLoader.Load(threatModel);
        worker = new Worker(model, BackendType.GPUCompute);
    }

    /// <summary>
    /// Evaluate threat level. Call this periodically (e.g., every 0.5s),
    /// not every frame — inference has a cost even on GPU.
    /// </summary>
    public float EvaluateThreat(float[] features)
    {
        if (features.Length != FeatureCount)
        {
            Debug.LogError($"Expected {FeatureCount} features, got {features.Length}");
            return 0.5f; // Safe default — medium threat
        }

        using var input = new Tensor<float>(new TensorShape(1, FeatureCount), features);
        worker.Schedule(input);

        var output = worker.PeekOutput() as Tensor<float>;
        using var cpu = output.ReadbackAndClone();
        return Mathf.Clamp01(cpu[0]);
    }

    void OnDestroy() => worker?.Dispose();
}
```

---

## Model Warm-Up

The first inference call compiles shaders and allocates GPU buffers. This causes a visible hitch if it happens during gameplay.

```csharp
void Start()
{
    var model = ModelLoader.Load(modelAsset);
    worker = new Worker(model, BackendType.GPUCompute);

    // Warm up with a dummy tensor during loading screen.
    // This forces shader compilation and buffer allocation NOW
    // rather than during the first real inference call.
    using var dummy = new Tensor<float>(new TensorShape(1, 10));
    worker.Schedule(dummy);
    worker.FlushSchedule(); // Block until complete — fine during loading
}
```

---

## Performance Guidelines

### Model Size and Complexity

| Guideline | Recommendation |
|-----------|---------------|
| Parameter count | Keep under 5M for mobile, 50M for desktop |
| Input resolution (vision models) | 224×224 or smaller for real-time |
| Inference frequency | Every 0.1–1.0s for gameplay AI, not every frame |
| Quantization | Use float16 for 2× smaller models with minimal accuracy loss |
| Batch size | Batch multiple NPCs into one call when possible |

### Memory Management Checklist

1. **Dispose all tensors** — use `using` or explicit `Dispose()`
2. **Dispose the Worker** in `OnDestroy()`
3. **Reuse input tensors** when shape doesn't change — call `Tensor.Upload()` instead of creating new tensors
4. **Profile with Unity Profiler** — Sentis operations appear under the "Sentis" profiler category

### Choosing Between CPU and GPU

```csharp
// Runtime backend selection based on platform capabilities
BackendType ChooseBackend()
{
    // SystemInfo.supportsComputeShaders is the key check.
    // On platforms where it's false (WebGL 1.0, very old mobile),
    // fall back to GPUPixel or CPU.
    if (SystemInfo.supportsComputeShaders)
        return BackendType.GPUCompute;

    // GPUPixel uses fragment shaders — works on WebGL 2.0+
    if (SystemInfo.graphicsDeviceType != UnityEngine.Rendering.GraphicsDeviceType.Null)
        return BackendType.GPUPixel;

    return BackendType.CPU;
}
```

---

## Supported Model Sources

Sentis supports ONNX format (opset versions 7–15). You can export models from:

- **PyTorch** — `torch.onnx.export()`
- **TensorFlow/Keras** — `tf2onnx` converter
- **Hugging Face Hub** — many models available in ONNX format directly
- **ONNX Model Zoo** — pre-trained models for common tasks

> **Operator coverage:** Not every ONNX operator is supported. Check the [Sentis supported operators](https://docs.unity3d.com/Packages/com.unity.ai.inference@latest) page before committing to a model architecture. If an operator is unsupported, you may need to simplify the model or implement a custom layer.

---

## Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| "Tensor data cannot be read from" error | Call `ReadbackAndClone()` or `ReadbackAndCloneAsync()` before accessing values |
| First inference causes frame spike | Warm up with a dummy tensor during loading |
| Model too slow on mobile | Quantize to float16, reduce input resolution, lower inference frequency |
| Memory leak over time | Ensure every `Tensor` and `Worker` is disposed |
| Different results on CPU vs GPU | Expected — floating point order-of-operations differs; validate that accuracy is acceptable on target platform |

---

## Next Steps

- **[G16 Performance & Memory](G16_performance_optimization_memory.md)** — Profile Sentis overhead alongside your game systems
- **[G13 ECS/DOTS](G13_ecs_dots.md)** — Combine Sentis with DOTS for thousands of ML-driven entities
- **[G14 ScriptableObject Architecture](G14_scriptable_object_architecture.md)** — Store model configuration as ScriptableObjects
- Unity's official [Sentis samples repository](https://github.com/Unity-Technologies/sentis-samples) for complete project examples
