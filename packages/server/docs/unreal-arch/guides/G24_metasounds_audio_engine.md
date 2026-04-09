# G24 — MetaSounds: Procedural Audio Engine in Unreal Engine 5

> **Category:** guide · **Engine:** Unreal Engine 5.5+ · **Related:** [G7 Audio System](G7_audio_system.md) · [G17 Niagara VFX System](G17_niagara_vfx_system.md) · [Architecture Overview](../architecture/E1_architecture_overview.md) · [Unreal Rules](../unreal-arch-rules.md)

MetaSounds is Unreal Engine's next-generation procedural audio system, replacing the legacy SoundCue node graph with a high-performance DSP (Digital Signal Processing) pipeline. Unlike SoundCues — which select and mix pre-recorded audio clips — MetaSounds can *synthesize* audio from scratch, process it with sample-accurate timing, and react to gameplay parameters in real time. This guide covers the asset hierarchy, the graph editor, core node types, gameplay integration, and practical patterns for common game audio needs.

---

## Why MetaSounds?

The legacy SoundCue system has served UE developers well, but it has fundamental limitations:

- **Sample-level timing is impossible** — SoundCue operates at the audio-buffer level, meaning you can't precisely control when a sound starts within a buffer
- **No synthesis** — SoundCues can only play, mix, and modulate pre-recorded WAV files. You can't generate audio procedurally
- **Limited real-time control** — changing parameters mid-playback requires awkward SoundCue parameter interfaces
- **No reusability model** — complex node graphs get duplicated across SoundCues instead of being shared

MetaSounds fixes all of these by providing a true DSP graph where:
- **Triggers are sample-accurate** — a gunshot sound starts on the exact sample, not "sometime within the next buffer"
- **Synthesis nodes** generate waveforms (sine, saw, square, noise) directly
- **Real-time parameters** are exposed as typed inputs that Blueprint or C++ can drive every frame
- **Patches** enable modular reuse — build a "random footstep" patch once, reference it everywhere

---

## Asset Hierarchy

MetaSounds has three asset types that work together:

```
┌─────────────────────────────────────────────────────┐
│  MetaSound Source                                    │
│                                                       │
│  A complete, playable audio generator.               │
│  This is what you place in the world or trigger      │
│  from Blueprint. It has its own DSP graph.           │
│                                                       │
│  Can reference MetaSound Patches for reusable logic  │
└──────────────────────┬──────────────────────────────┘
                       │ references
                       ▼
┌─────────────────────────────────────────────────────┐
│  MetaSound Patch                                     │
│                                                       │
│  A reusable DSP sub-graph — like a function.         │
│  Cannot be played directly. Referenced by Sources    │
│  or other Patches.                                   │
│                                                       │
│  Example: "RandomPitchPlayer" patch that picks a     │
│  random clip from an array and applies pitch shift   │
└─────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────┐
│  MetaSound Preset                                    │
│                                                       │
│  Inherits a parent Source or Patch's graph (read-    │
│  only) but overrides specific input default values.  │
│                                                       │
│  Example: "Footstep_Grass" preset overrides the      │
│  surface material input of a generic footstep Source │
└─────────────────────────────────────────────────────┘
```

### When to Use Each

| Asset Type | Use Case |
|-----------|----------|
| **Source** | Any sound you want to play in the world — weapons, ambient, music, UI |
| **Patch** | Reusable DSP logic shared across multiple Sources (randomization, filters, envelopes) |
| **Preset** | Variants of a Source/Patch with different default values (same gun, different calibers) |

---

## The Graph Editor

MetaSounds uses a node graph editor similar to Blueprints, but the execution model is fundamentally different:

- **Blueprints** are execution graphs — nodes fire in sequence when triggered
- **MetaSounds** are signal-flow graphs — audio data flows continuously from inputs through processing nodes to the output, like a modular synthesizer

### Creating Your First MetaSound Source

1. In the Content Browser: **Right-click → Sounds → MetaSound Source**
2. Open the asset to see the graph editor
3. Every Source starts with an **Output** node (stereo audio out) and an **On Play** trigger input

### Core Concepts

**Pins** connect nodes and carry typed data:
- **Audio** (thick blue lines) — continuous audio signal flowing at the sample rate
- **Trigger** (thin magenta lines) — sample-accurate event pulses
- **Float / Int / Bool / String** — control data for parameters
- **Time** — duration values
- **Wave Asset** — reference to a `USoundWave`

**Inputs** on the left side of the graph define the Source's public interface — values that Blueprint or C++ can set at runtime.

**Outputs** on the right side produce the final audio signal sent to the audio engine.

---

## Essential Node Types

### Playback Nodes

| Node | Purpose |
|------|---------|
| **Wave Player** | Plays a `USoundWave` asset. Accepts a Trigger input for sample-accurate start timing. Outputs audio + an "On Finished" trigger |
| **Wave Player Loop** | Like Wave Player but loops continuously until stopped |

```
[On Play] ──trigger──► [Wave Player] ──audio──► [Output]
                            │
                      (Wave Asset input)
```

### Synthesis Nodes

| Node | Purpose |
|------|---------|
| **Sine / Saw / Square / Triangle Oscillator** | Generate basic waveforms at a given frequency — the building blocks of procedural audio |
| **Noise Generator** | White, pink, or brown noise — useful for wind, rain, or as modulation sources |
| **LFO** | Low Frequency Oscillator — generates slow waveforms for modulating other parameters (vibrato, tremolo) |

### Envelope & Dynamics

| Node | Purpose |
|------|---------|
| **AD Envelope** | Attack-Decay envelope — good for percussive sounds (gunshots, footsteps) |
| **ADSR Envelope** | Attack-Decay-Sustain-Release — for sustained sounds (engine hum, held notes) |
| **Gain** | Multiplies an audio signal's amplitude. Use for volume control |
| **Compressor / Limiter** | Dynamic range control — prevent clipping on loud sounds |

### Filters & Effects

| Node | Purpose |
|------|---------|
| **Biquad Filter** | Low-pass, high-pass, band-pass, notch — shape the frequency content |
| **One-Pole Filter** | Simpler/cheaper filter for smoothing parameters |
| **Delay** | Adds echo/delay to a signal |
| **Reverb** | Convolution or algorithmic reverb within the MetaSound graph |

### Logic & Control

| Node | Purpose |
|------|---------|
| **Trigger Repeat** | Re-fires a trigger at a configurable interval — for looping events |
| **Trigger Random** | Randomly forwards a trigger to one of N outputs — for variation |
| **Random Get** (Float/Int) | Returns a random value in a range — for pitch/volume randomization |
| **Select** | Chooses between inputs based on an index — for surface-type switching |

---

## Practical Example: Randomized Footstep System

This is one of the most common MetaSounds use cases — a single Source that plays randomized footstep sounds with pitch variation.

```
Graph Layout:

[On Play trigger] ──► [Trigger Random (3 outputs)]
                           ├──► [Wave Player A] ──┐
                           ├──► [Wave Player B] ──┼──audio──► [Gain] ──► [Output]
                           └──► [Wave Player C] ──┘
                                                       ▲
                                                  [Random Float]
                                                  (0.9 — 1.1)
                                                  mapped to Gain

Input Parameters (exposed to Blueprint):
  - Surface Type (Int32) → drives a Select node for different clip arrays
  - Volume (Float, default 1.0) → drives the Gain node
  - Pitch Shift (Float, default 0.0) → offsets Wave Player pitch ratios
```

### Why This Design Works

- **No repetition**: The `Trigger Random` node ensures consecutive footsteps don't play the same clip
- **Subtle variation**: The `Random Float` feeding Gain adds ±10% volume variation, making each step feel organic
- **Surface-aware**: The `Surface Type` input lets gameplay code change the sound set without creating separate assets
- **Sample-accurate**: The footstep starts on the exact sample when the animation event fires the trigger

---

## Blueprint Integration

### Playing a MetaSound Source in the World

```
Blueprint: SpawnSound2D or SpawnSoundAtLocation

// In a Blueprint Actor:
// 1. Add an AudioComponent
// 2. Set its Sound to your MetaSound Source asset
// 3. Call Play / Stop on the AudioComponent

// To set parameters at runtime:
AudioComponent->SetFloatParameter("Speed", CurrentSpeed);
AudioComponent->SetIntParameter("SurfaceType", 2);
AudioComponent->SetBoolParameter("IsIndoors", true);
```

### C++ Integration

```cpp
#include "Components/AudioComponent.h"

// Spawn and play a MetaSound Source
void AMyActor::PlayEngineSound()
{
    // Create an audio component with the MetaSound Source
    UAudioComponent* EngineAudio = UGameplayStatics::SpawnSound2D(
        this,
        EngineMetaSoundSource, // USoundBase* — your MetaSound Source asset
        1.0f,  // Volume multiplier
        1.0f   // Pitch multiplier
    );

    if (EngineAudio)
    {
        // Set real-time parameters exposed in the MetaSound graph
        EngineAudio->SetFloatParameter(FName("RPM"), CurrentRPM);
        EngineAudio->SetFloatParameter(FName("Throttle"), ThrottleInput);
    }
}

// Update parameters every frame for dynamic audio
void AMyActor::Tick(float DeltaTime)
{
    Super::Tick(DeltaTime);

    if (EngineAudioComponent)
    {
        // The MetaSound graph uses these values to blend between
        // idle, mid-range, and high-rev audio layers
        EngineAudioComponent->SetFloatParameter(FName("RPM"), GetCurrentRPM());
        EngineAudioComponent->SetFloatParameter(FName("Load"), GetEngineLoad());
    }
}
```

---

## MetaSounds + Attenuation & Spatialization

MetaSounds inherits Unreal's standard audio attenuation system:

- **Sound Attenuation assets** control distance-based falloff, spatialization, and occlusion
- Set the Attenuation asset on the `AudioComponent` or pass it to `SpawnSoundAtLocation`
- MetaSounds runs *before* spatialization — it generates the dry signal, which the audio engine then spatializes

For advanced use cases, MetaSounds can output multi-channel audio that feeds into Ambisonics rendering pipelines.

---

## MetaSounds vs SoundCues: Migration Guide

| Feature | SoundCue | MetaSound |
|---------|----------|-----------|
| Play WAV files | Yes | Yes (Wave Player node) |
| Random selection | Random node | Trigger Random + multiple Wave Players |
| Crossfade | Crossfade by Parameter | Blend nodes with float inputs |
| Real-time params | Sound Parameter Interface | Native Input pins (typed, sample-accurate) |
| Synthesis | No | Yes (Oscillators, noise, envelopes) |
| Reusable sub-graphs | No | Yes (Patches) |
| Preset variants | No | Yes (Presets) |
| Sample-accurate triggers | No | Yes |
| Performance | Good for simple playback | Better for complex/dynamic audio |

### Migration Strategy

1. **Don't convert everything at once** — SoundCues still work and are simpler for basic one-shot sounds
2. **Start with dynamic sounds** — vehicle engines, weapons, ambient systems benefit most from MetaSounds
3. **Build a Patch library** — create reusable patches for randomization, filtering, and envelope patterns
4. **Use Presets for variants** — instead of duplicating Sources, create Presets that override specific inputs

---

## Common Pitfalls

| Pitfall | Why It Happens | Fix |
|---------|----------------|-----|
| **No sound plays** | Missing trigger connection to Wave Player | Ensure `On Play` connects to the Wave Player's Play trigger input |
| **Clicks and pops** | Abrupt signal starts/stops without envelope | Add an AD or ADSR Envelope before the Output to smooth transitions |
| **Parameter changes don't take effect** | Using the wrong parameter name | Parameter names are case-sensitive — match exactly what's in the graph's Input node |
| **High CPU usage** | Too many synthesis nodes running constantly | Use trigger gates to only process audio when needed; disable MetaSounds on distant actors |
| **Preset doesn't update** | Changed the parent graph but preset is stale | Re-save the Preset after modifying the parent Source or Patch |

---

## Performance Considerations

- **MetaSounds run on the audio render thread** — heavy graphs don't impact the game thread, but they can cause audio dropouts if too complex
- **Profile with Unreal Insights** → Audio thread shows MetaSound evaluation time
- **Budget**: aim for under 200 nodes per active Source on current-gen hardware
- **Inactive Sources**: MetaSounds attached to `AudioComponents` that aren't playing consume zero CPU
- **Virtualization**: Unreal's sound virtualization system works with MetaSounds — distant sounds are virtualized (silenced but tracked) and resumed when the listener approaches
