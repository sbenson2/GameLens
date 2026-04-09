# G16 — Audio System & Spatial Sound

> **Category:** guide · **Engine:** Stride · **Related:** [G01 Getting Started](./G01_getting_started.md) · [G06 Animation System](./G06_animation_system.md) · [G03 Code-Only Development](./G03_code_only_development.md) · [G05 UI System](./G05_ui_system.md)

Stride's audio subsystem provides sound playback, 3D spatialization, streaming, and real-time parameter control through a component-based architecture. Sound assets are imported in the editor, attached to entities via `AudioEmitterComponent`, and controlled at runtime through `AudioEmitterSoundController`. This guide covers the full audio pipeline from asset import to 3D spatial playback, music management, and dynamic sound generation.

---

## Audio Architecture Overview

Stride's audio system is built on three layers:

1. **AudioEngine** — the low-level mixer that manages device output, master volume, and listener state. Created automatically by the `Game` class on startup.
2. **Sound / SoundEffect** — asset types that hold loaded audio data. `Sound` supports streaming for long tracks; `SoundEffect` loads entirely into memory for low-latency playback.
3. **AudioEmitterComponent + AudioEmitterSoundController** — the ECS integration. An `AudioEmitterComponent` on an entity acts as a spatial sound source. Each sound attached to the emitter gets its own `AudioEmitterSoundController` for independent play/pause/stop and parameter control.

The `AudioListenerComponent` marks which entity (typically the camera) receives spatialized audio. The `AudioEmitterProcessor` runs each frame to update 3D positions, apply distance attenuation, and calculate panning.

---

## Importing Audio Assets

Stride supports `.wav`, `.ogg`, and `.mp3` audio files. Import through the editor:

1. Drag an audio file into the **Asset View** panel
2. Stride creates a `Sound` asset with default import settings
3. In the **Property Grid**, configure:
   - **Sample Rate** — resample if needed (default: keep original)
   - **Compression** — choose between PCM (uncompressed, low latency) or compressed (smaller memory footprint)
   - **Streaming** — enable for music/ambient tracks over ~10 seconds; disable for short SFX

Short effects (gunshots, footsteps, UI clicks) should use uncompressed PCM with streaming disabled. Music and ambient loops should use compressed + streaming to avoid loading entire files into memory.

---

## Setting Up 3D Audio in the Editor

### 1. Add an Audio Listener

Attach an `AudioListenerComponent` to your camera entity. Only one listener should be active at a time. The listener defines the "ear" position and orientation for 3D audio calculations.

### 2. Create an Audio Emitter

On any entity that produces sound:

1. Add an `AudioEmitterComponent` in the **Property Grid**
2. In the **Sounds** dictionary, click **+** to add entries
3. Assign each entry a key (e.g., `"Footstep"`, `"Engine"`) and a `Sound` asset as the value
4. Configure per-sound settings:
   - **Use HRTF** — enables Head-Related Transfer Function for more accurate spatial perception (headphone-optimized)
   - **Directional Factor** — 0.0 for omnidirectional, 1.0 for fully directional cone
   - **Environment** — reverb preset (`Small`, `Medium`, `Large`, `Outdoors`)

---

## Runtime Sound Control

At runtime, retrieve sound controllers from the emitter component and control playback:

```csharp
using Stride.Audio;
using Stride.Engine;

public class EnemyAudio : SyncScript
{
    // Assigned in the editor
    private AudioEmitterComponent emitter;
    private AudioEmitterSoundController growlController;
    private AudioEmitterSoundController deathController;

    public override void Start()
    {
        emitter = Entity.Get<AudioEmitterComponent>();
        growlController = emitter["Growl"];
        deathController = emitter["Death"];

        // Configure the growl to loop
        growlController.IsLooping = true;
        growlController.Volume = 0.6f;
        growlController.Pitch = 1.0f;  // 1.0 = normal pitch
        growlController.Play();
    }

    public override void Update()
    {
        // Adjust pitch based on enemy speed for Doppler-like effect
        var velocity = Entity.Get<RigidbodyComponent>()?.LinearVelocity.Length() ?? 0f;
        growlController.Pitch = 1.0f + (velocity * 0.01f);
    }

    public void OnDeath()
    {
        growlController.Stop();
        deathController.Play();
    }
}
```

### Key AudioEmitterSoundController API

| Property / Method | Description |
|---|---|
| `Play()` | Start or resume playback |
| `Pause()` | Pause without resetting position |
| `Stop()` | Stop and reset to beginning |
| `PlayAndForget()` | Fire-and-forget for short one-shot sounds (gunshots, impacts) |
| `IsLooping` | Whether the sound loops after finishing |
| `Volume` | 0.0 (silent) to 1.0 (full volume) |
| `Pitch` | Playback speed/pitch multiplier. 1.0 = normal, 2.0 = octave up |
| `PlayState` | Current state: `Playing`, `Paused`, `Stopped` |

---

## Music and Non-Spatial Audio

For music and UI sounds that should not be spatialized, use `SoundInstance` directly without an emitter:

```csharp
public class MusicManager : SyncScript
{
    public Sound BackgroundMusic;  // Assign in editor

    private SoundInstance musicInstance;

    public override void Start()
    {
        musicInstance = BackgroundMusic.CreateInstance();
        musicInstance.IsLooping = true;
        musicInstance.Volume = 0.4f;
        musicInstance.Play();
    }

    public void CrossfadeTo(Sound newTrack, float duration)
    {
        // Simple crossfade — fade out current, fade in new
        var newInstance = newTrack.CreateInstance();
        newInstance.Volume = 0f;
        newInstance.IsLooping = true;
        newInstance.Play();

        // Use a coroutine or tween system for the actual fade
        // This is a simplified synchronous example
        musicInstance.Volume = 0f;
        musicInstance.Stop();
        musicInstance.Dispose();

        newInstance.Volume = 0.4f;
        musicInstance = newInstance;
    }

    public override void Cancel()
    {
        musicInstance?.Stop();
        musicInstance?.Dispose();
    }
}
```

**Important:** Always `Dispose()` `SoundInstance` objects when done to release native audio resources. Emitter-managed controllers handle this automatically.

---

## 3D Spatialization Details

### Distance Attenuation

Stride uses inverse-distance attenuation by default. The volume of a spatialized sound decreases as the distance between the `AudioEmitterComponent` entity and the `AudioListenerComponent` entity increases. The attenuation model parameters are configured on the emitter.

### HRTF (Head-Related Transfer Function)

When `UseHRTF` is enabled on a sound entry, Stride applies frequency-dependent filtering that simulates how human ears perceive sound direction. This provides significantly better spatial accuracy through headphones but has higher CPU cost. Use HRTF for:

- Important gameplay cues (enemy footsteps, item pickups)
- VR/AR applications where accurate spatialization is critical

Skip HRTF for ambient sounds, music, and distant background effects.

### Apply3D Manual Control

For sounds not attached to emitters (played via raw `SoundInstance`), you can manually apply 3D positioning:

```csharp
var listener = new AudioListener
{
    Position = cameraEntity.Transform.WorldMatrix.TranslationVector,
    Forward = cameraEntity.Transform.WorldMatrix.Forward,
    Up = cameraEntity.Transform.WorldMatrix.Up,
    Velocity = Vector3.Zero
};

var emitterData = new AudioEmitter
{
    Position = soundSourcePosition,
    Velocity = Vector3.Zero
};

soundInstance.Apply3D(emitterData);
```

Note: `Apply3D` only works on mono (single-channel) sounds. Stereo sounds play without spatialization.

---

## Dynamic Sound Sources

For procedural audio (synthesized effects, voice chat, audio visualization), implement `DynamicSoundSource`:

```csharp
using Stride.Audio;

public class SineWaveSource : DynamicSoundSource
{
    private float frequency = 440f;
    private float phase = 0f;
    private readonly int sampleRate;

    public SineWaveSource(AudioEngine engine, int sampleRate, int channels)
        : base(engine, sampleRate, channels)
    {
        this.sampleRate = sampleRate;
    }

    protected override void ExtractAndFillData(
        Span<short> buffer, int samplesNeeded)
    {
        float increment = 2f * MathF.PI * frequency / sampleRate;

        for (int i = 0; i < samplesNeeded; i++)
        {
            buffer[i] = (short)(MathF.Sin(phase) * short.MaxValue * 0.5f);
            phase += increment;
            if (phase > 2f * MathF.PI) phase -= 2f * MathF.PI;
        }
    }
}
```

`DynamicSoundSource` is useful for runtime-generated audio like engine noise synthesis, procedural music, or voice-over-IP playback.

---

## Performance Considerations

- **Limit simultaneous sounds** — each playing `SoundInstance` consumes a mixing channel. Aim for fewer than 32 concurrent sounds on mobile, 64+ on desktop.
- **Use streaming for long audio** — music and ambient tracks over 10 seconds should always use streaming to avoid large memory allocations.
- **Pool one-shot sounds** — `PlayAndForget()` handles cleanup automatically, but if you fire hundreds of short sounds per frame (e.g., rain), batch them into fewer overlapping loops instead.
- **Disable HRTF for non-critical sounds** — HRTF processing adds CPU overhead per source. Reserve it for gameplay-critical spatialized cues.
- **Dispose sound instances** — undisposed instances leak native audio resources. Use `Cancel()` or `Dispose()` in script lifecycle methods.

---

## Common Patterns

### Audio Bus / Category Volumes

Stride does not have a built-in audio bus system, but you can implement one by tracking sound controllers by category:

```csharp
public static class AudioBus
{
    private static readonly Dictionary<string, List<AudioEmitterSoundController>> buses = new();

    public static void Register(string bus, AudioEmitterSoundController controller)
    {
        if (!buses.ContainsKey(bus)) buses[bus] = new List<AudioEmitterSoundController>();
        buses[bus].Add(controller);
    }

    public static void SetBusVolume(string bus, float volume)
    {
        if (!buses.TryGetValue(bus, out var controllers)) return;
        foreach (var c in controllers) c.Volume = volume;
    }
}

// Usage in a script:
AudioBus.Register("SFX", emitter["Footstep"]);
AudioBus.Register("Music", emitter["BGM"]);
AudioBus.SetBusVolume("SFX", 0.8f);
```

### Trigger-Based Audio

Combine with physics to play sounds on collision:

```csharp
public class CollisionSound : SyncScript
{
    public override void Start()
    {
        var rb = Entity.Get<RigidbodyComponent>();
        var emitter = Entity.Get<AudioEmitterComponent>();
        var impactSound = emitter["Impact"];

        rb.Collisions.CollectionChanged += (sender, args) =>
        {
            if (args.Action == System.Collections.Specialized.NotifyCollectionChangedAction.Add)
            {
                var collision = (Collision)args.Item;
                float impactForce = collision.Contacts[0].Normal.Length();
                impactSound.Volume = Math.Clamp(impactForce / 10f, 0.1f, 1.0f);
                impactSound.PlayAndForget();
            }
        };
    }
}
```

---

## Next Steps

- Add audio to your scene following the editor setup above, then experiment with HRTF and distance attenuation
- For adaptive music that responds to gameplay, combine `MusicManager` with game state events
- Explore `DynamicSoundSource` for procedural engine sounds in racing or flight games
- See [G06 Animation System](./G06_animation_system.md) for synchronizing audio cues with animation events
