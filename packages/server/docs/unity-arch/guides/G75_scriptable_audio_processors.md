# G75 — Scriptable Audio Processors

> **Category:** guide · **Engine:** Unity 6.3 LTS+ (6000.3+) · **Related:** [G4 Audio System](G4_audio_system.md) · [G65 Audio Middleware](G65_audio_middleware_fmod_wwise.md) · [G42 Burst Compiler & Jobs](G42_burst_compiler_jobs_system.md) · [Unity Rules](../unity-arch-rules.md)

Unity 6.3 LTS introduces the **Scriptable Audio Pipeline** — a framework for extending the Unity audio engine with custom, Burst-compiled C# processors that run at specific integration points in the audio signal chain. This replaces the legacy `OnAudioFilterRead` approach with a high-performance, job-system-friendly architecture that can handle real-time audio processing without blocking the main thread.

Use cases include custom synthesizers, procedural sound effects, spatial audio post-processing, audio middleware integration, and offline rendering pipelines.

---

## Architecture Overview

Every scriptable processor is split into two halves:

| Part | Thread | Responsibility |
|---|---|---|
| **Control** (`IControl<TRealtime>`) | Main thread | Creates, configures, and manages the processor. Handles game logic, parameter changes, and lifecycle. |
| **Real-time** (`IRealtime`) | Audio thread / Job System | Generates or processes audio samples. Must be Burst-compatible — no managed allocations, no GC. |

This split ensures that audio processing never stalls on main-thread game logic, and game logic never blocks on audio rendering.

### Processor Types

Unity 6.3 ships with two integration points:

| Type | Interface | Where it runs | Purpose |
|---|---|---|---|
| **Generator** | `GeneratorInstance.IRealtime` / `IControl` | At an AudioSource | Produces audio samples — custom synthesizers, procedural SFX, audio-from-data |
| **Root Output** | `RootOutputInstance.IRealtime` / `IControl` | At the engine's final mix output | Processes the master audio bus — custom mastering, middleware bridges, spatial output |

> **Note:** Additional integration points (inserts, sends) are on the Unity roadmap but not yet available as of 6.3 LTS.

---

## Communication Between Control & Real-time

Since the two halves run on different threads, direct method calls are unsafe. Unity provides two mechanisms:

### Pipes (Real-time Safe)

Lock-free channels that carry serializable value-type payloads within a single frame/mix cycle. Use pipes for frequent, low-latency parameter updates (e.g., changing a synth's frequency every frame).

### Messages (Structured, Blocking)

Structured commands from the processor to the control part. Support bidirectional field modification for queries. Use messages for infrequent operations (e.g., "has the sound finished?").

---

## Example 1: Sine Wave Generator

A minimal procedural synthesizer that emits a sine tone through an AudioSource.

### Real-time Part (Audio Thread)

```csharp
using Unity.Burst;
using Unity.Audio.Scriptable;

// WHY: BurstCompile is critical — without it, this code runs as
// managed C# on the audio thread, which can cause GC stalls and
// audio glitches. Burst compiles it to native SIMD code.
[BurstCompile(CompileSynchronously = true)]
public struct SineGeneratorRealtime : GeneratorInstance.IRealtime
{
    // WHY: Phase accumulator tracks our position in the sine wave.
    // Stored as normalized [0, 1) so it wraps cleanly without
    // floating-point precision loss over long playback times.
    public float phase;
    public float phaseIncrement;

    // WHY: isFinite = false means this generator runs indefinitely
    // (like an oscillator). Set to true for one-shot samples.
    public bool isFinite => false;

    // WHY: isRealtime = true tells Unity this generates live audio,
    // not pre-rendered data. Affects scheduling priority.
    public bool isRealtime => true;

    // WHY: length is only used when isFinite = true.
    public long length => 0;

    public void Update(ref GeneratorInstance.UpdateData data)
    {
        // WHY: Update is called once per mix cycle before Process.
        // Read pipe messages here to receive parameter changes
        // from the control part without allocations.
    }

    public void Process(ref GeneratorInstance.ProcessData data)
    {
        // WHY: data.output is a NativeArray<float> representing
        // interleaved audio samples (L, R, L, R, ...).
        // We write directly into it — no intermediate buffers needed.
        var output = data.output;
        int channels = data.format.numChannels;

        for (int i = 0; i < output.Length; i += channels)
        {
            // WHY: Unity.Mathematics.math.sin is Burst-compatible.
            // Standard System.Math.Sin would break Burst compilation.
            float sample = Unity.Mathematics.math.sin(
                2.0f * Unity.Mathematics.math.PI * phase);

            // WHY: Write the same sample to all channels (mono source).
            for (int ch = 0; ch < channels; ch++)
                output[i + ch] = sample;

            // WHY: Advance and wrap phase. The modulo keeps phase
            // in [0, 1) preventing float precision drift.
            phase = (phase + phaseIncrement) % 1.0f;
        }
    }
}
```

### Control Part (Main Thread)

```csharp
using Unity.Audio.Scriptable;

public struct SineGeneratorControl
    : GeneratorInstance.IControl<SineGeneratorRealtime>
{
    private const float k_Frequency = 440.0f; // A4 concert pitch

    public void Dispose() { }

    public void Update(ref GeneratorInstance.ControlUpdateData data) { }

    public void OnMessage(in MessageData msg) { }

    public void Configure(
        ref SineGeneratorRealtime realtime,
        ref GeneratorInstance.ConfigureData data)
    {
        // WHY: phaseIncrement = frequency / sampleRate converts
        // a Hz frequency into the per-sample phase step.
        // At 48 kHz, 440 Hz → increment of ~0.00917.
        realtime.phaseIncrement = k_Frequency / data.format.sampleRate;
        realtime.phase = 0.0f;
    }
}
```

### MonoBehaviour Driver

```csharp
using UnityEngine;
using Unity.Audio.Scriptable;

/// <summary>
/// WHY: The driver bridges the Unity component system (MonoBehaviour)
/// with the scriptable audio pipeline. Attach this to a GameObject
/// with an AudioSource to hear the generated tone.
/// </summary>
[RequireComponent(typeof(AudioSource))]
public class SineGeneratorDriver : MonoBehaviour, IAudioGenerator
{
    // WHY: IAudioGenerator tells Unity this MonoBehaviour can
    // provide a generator instance to an AudioSource.
    public bool isFinite => false;
    public bool isRealtime => true;
    public long length => 0;

    public GeneratorInstance CreateInstance()
    {
        // WHY: CreateInstance is called by the AudioSource when it
        // starts playing. We return a new instance pairing our
        // control and real-time structs together.
        return GeneratorInstance
            .Create<SineGeneratorControl, SineGeneratorRealtime>();
    }

    private void Start()
    {
        // WHY: Assign this driver as the AudioSource's generator.
        // The AudioSource will call CreateInstance() when Play() is invoked.
        var source = GetComponent<AudioSource>();
        source.clip = null; // No AudioClip — we generate samples
        source.Play();
    }
}
```

---

## Example 2: Root Output (Master Bus Processing)

A root output processor that attaches to the engine's final audio mix — useful for master-bus effects, loudness metering, or routing audio to an external middleware.

```csharp
using Unity.Burst;
using Unity.Collections;
using Unity.Jobs;
using Unity.Audio.Scriptable;

// WHY: Root outputs process the FINAL mixed audio before it reaches
// the hardware. This is where you'd add a limiter, loudness meter,
// or bridge to an external audio system.
[BurstCompile(CompileSynchronously = true)]
public struct MasterLimiterRealtime : RootOutputInstance.IRealtime
{
    public AudioFormat format;
    public NativeArray<float> buffer;
    public JobHandle jobHandle;

    public void Process(ref RootOutputInstance.ProcessData data)
    {
        // WHY: Schedule a Burst-compiled job to process audio
        // off the audio thread's critical path. This is important
        // for expensive DSP — keeps the audio callback lean.
        var job = new LimiterJob
        {
            input = data.input,
            output = buffer,
            threshold = 0.9f  // -0.9 dB soft clip
        };
        jobHandle = job.Schedule();
    }

    public void EndProcessing(ref RootOutputInstance.EndProcessingData data)
    {
        // WHY: Complete the job and copy results to the final output.
        // EndProcessing is guaranteed to run after Process, giving
        // the job time to execute on worker threads.
        jobHandle.Complete();
        NativeArray<float>.Copy(buffer, data.output);
    }

    [BurstCompile(CompileSynchronously = true)]
    private struct LimiterJob : IJob
    {
        [ReadOnly] public NativeArray<float> input;
        public NativeArray<float> output;
        public float threshold;

        public void Execute()
        {
            // WHY: Soft clipping with tanh prevents harsh digital
            // distortion while keeping peaks under control.
            for (int i = 0; i < input.Length; i++)
            {
                float sample = input[i];
                if (Unity.Mathematics.math.abs(sample) > threshold)
                {
                    // WHY: tanh provides smooth saturation curve.
                    sample = Unity.Mathematics.math.tanh(sample);
                }
                output[i] = sample;
            }
        }
    }
}

public struct MasterLimiterControl
    : RootOutputInstance.IControl<MasterLimiterRealtime>
{
    public void Dispose() { }
    public void Update(ref RootOutputInstance.ControlUpdateData data) { }
    public void OnMessage(in MessageData msg) { }

    public void Configure(
        ref MasterLimiterRealtime realtime,
        ref RootOutputInstance.ConfigureData data)
    {
        // WHY: Allocate the working buffer to match the audio format.
        // Persistent allocation avoids per-frame GC pressure.
        realtime.format = data.format;
        realtime.buffer = new NativeArray<float>(
            data.format.numChannels * data.format.numSamples,
            Allocator.Persistent);
    }
}
```

### Lifecycle Driver for Root Output

```csharp
using UnityEngine;
using Unity.Audio.Scriptable;

public class MasterLimiterDriver : MonoBehaviour
{
    private RootOutputInstance _instance;

    private void Start()
    {
        // WHY: AllocateRootOutput attaches our processor to the
        // engine's final mix point. Audio flows through it automatically.
        _instance = ControlContext.builtIn.AllocateRootOutput<
            MasterLimiterControl, MasterLimiterRealtime>();
    }

    private void OnDestroy()
    {
        // WHY: Always dispose to free the NativeArray and
        // unregister from the audio signal chain.
        _instance.Dispose();
    }
}
```

---

## Dynamic Parameters with Pipes

For real-time parameter changes (e.g., a player-controlled synth), use pipes to send data from the control part to the real-time part without allocations:

```csharp
// WHY: FrequencyEvent is a simple value type that travels through
// the lock-free pipe. Keep pipe payloads small and blittable.
public struct FrequencyEvent
{
    public float value;
}

// In the real-time Update():
public void Update(ref GeneratorInstance.UpdateData data)
{
    // WHY: ReadPipe drains all pending messages since last cycle.
    // Multiple sends per frame are batched — only the latest matters
    // for continuous parameters like frequency.
    while (data.pipe.TryRead(out FrequencyEvent evt))
    {
        phaseIncrement = evt.value / sampleRate;
    }
}

// In the control Update():
public void Update(ref GeneratorInstance.ControlUpdateData data)
{
    // WHY: WritePipe sends a value-type message to the real-time
    // part. This is lock-free and allocation-free.
    data.pipe.Write(new FrequencyEvent { value = currentFrequency });
}
```

---

## When to Use Scriptable Processors vs. Alternatives

| Approach | Best For | Thread Safety | Performance |
|---|---|---|---|
| **Scriptable Processors** (Unity 6.3+) | Custom synthesis, DSP, middleware bridges | Burst-compiled, job-friendly | Excellent |
| **OnAudioFilterRead** (legacy) | Simple per-source effects | Runs on audio thread, no Burst | Poor for complex DSP |
| **FMOD / Wwise** (middleware) | Full audio engine replacement | External thread model | Excellent (dedicated engine) |
| **Native Audio Plugins** (C++) | Platform-specific DSP | Manual thread management | Excellent |

**Use scriptable processors when:** you need custom audio generation or processing that is tightly integrated with Unity's audio engine, want Burst performance without writing native plugins, or need to bridge Unity audio with custom systems.

**Use middleware instead when:** you need a full-featured audio authoring environment (sound designers working in FMOD Studio / Wwise), or your project already depends on middleware.

---

## Best Practices

1. **Always use `[BurstCompile]`** on real-time structs. Without it, you get managed C# on the audio thread — GC pauses will cause audible glitches.
2. **Use `Unity.Mathematics`** types (`float`, `math.sin`, `math.PI`) instead of `System.Math` or `UnityEngine.Mathf` for Burst compatibility.
3. **Keep real-time structs blittable** — no managed references, strings, or class fields. Only value types and `NativeArray`.
4. **Dispose NativeArrays** in the control part's lifecycle (typically `OnDestroy`). Leaking native memory is a common bug.
5. **Schedule jobs in `Process`, complete in `EndProcessing`** — this gives the job system maximum time to execute on worker threads.
6. **Profile with the Audio Profiler** (Window → Analysis → Audio Profiler) to verify your processor's CPU cost per mix cycle.

---

## Version History

| Version | Change |
|---|---|
| Unity 6.3 LTS (6000.3) | Scriptable Audio Pipeline introduced with Generator and Root Output integration points |
| Unity 6.4+ | Additional integration points (inserts, sends) planned — check Unity roadmap |
