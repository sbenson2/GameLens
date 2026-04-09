# G120 — Adaptive & Dynamic Audio Systems

> **Category:** guide · **Engine:** MonoGame · **Related:** [G6 Audio](./G6_audio.md) · [G87 3D Spatial Audio](./G87_3d_spatial_audio.md) · [G38 Scene Management](./G38_scene_management.md) · [G64 Combat & Damage Systems](./G64_combat_damage_systems.md) · [G57 Weather Effects](./G57_weather_effects.md) · [G93 ECS Library Integration](./G93_ecs_library_integration.md) · [G77 ECS Event Messaging](./G77_ecs_event_messaging.md)

How to build adaptive music and dynamic audio systems in MonoGame. Covers layered music stems with crossfading, intensity-driven vertical orchestration, horizontal re-sequencing, ambient soundscapes, and integration with game state — using both MonoGame's built-in audio and FMOD via FmodForFoxes.

---

## Table of Contents

1. [When You Need Adaptive Audio](#1-when-you-need-adaptive-audio)
2. [MonoGame Audio Constraints](#2-monogame-audio-constraints)
3. [Layered Music System (Vertical Orchestration)](#3-layered-music-system-vertical-orchestration)
4. [Crossfading Between Tracks](#4-crossfading-between-tracks)
5. [Horizontal Re-Sequencing](#5-horizontal-re-sequencing)
6. [Ambient Soundscapes](#6-ambient-soundscapes)
7. [FMOD Integration for Advanced Audio](#7-fmod-integration-for-advanced-audio)
8. [Audio State Machine](#8-audio-state-machine)
9. [ECS Integration](#9-ecs-integration)
10. [Performance & Memory](#10-performance--memory)
11. [Checklist](#11-checklist)

---

## 1. When You Need Adaptive Audio

Static music loops work for many games. You need adaptive audio when:

```
✓ Gameplay has distinct intensity levels (explore → combat → boss)
✓ Music should react to player actions without hard cuts
✓ Environments have layered ambience (rain + wind + distant thunder)
✓ You want seamless transitions between game areas
✓ Stealth / tension mechanics need escalating audio cues
```

If your game has a single music track per level and a few sound effects, standard `MediaPlayer` + `SoundEffect` from [G6 Audio](./G6_audio.md) is sufficient. Adaptive audio adds real complexity — use it intentionally.

---

## 2. MonoGame Audio Constraints

Understanding MonoGame's built-in audio limitations shapes the architecture:

| Feature | `SoundEffect` / `SoundEffectInstance` | `Song` / `MediaPlayer` |
|---------|---------------------------------------|------------------------|
| Simultaneous playback | Many instances concurrently | **One song at a time** |
| Looping | Yes (`IsLooped = true`) | Yes (`IsRepeating`) |
| Volume control | Per-instance | Global only |
| Pitch control | Per-instance (`-1f` to `1f`) | No |
| Pan control | Per-instance (`-1f` to `1f`) | No |
| Seeking | No | Limited (platform-dependent) |
| Format | WAV (via content pipeline) | OGG, MP3 (streamed) |

**Key constraint:** `MediaPlayer` cannot layer multiple songs. For layered music, you must use `SoundEffectInstance` for all stems or switch to FMOD.

**Trade-off:** `SoundEffect` loads the entire file into memory. Long music stems (2+ minutes) as WAV can consume significant RAM. Mitigations:

- Compress stems to shorter loops (30–60 seconds) that tile seamlessly.
- Use lower sample rates for ambient layers (22 kHz instead of 44.1 kHz).
- For large projects, FMOD's streaming playback avoids this entirely.

---

## 3. Layered Music System (Vertical Orchestration)

Vertical orchestration plays multiple stems simultaneously and adjusts their volumes to change the music's feel without interrupting playback.

### Concept

```
Layer 3: Percussion  ▓▓▓░░░░▓▓▓▓▓▓▓  (combat only)
Layer 2: Strings     ▓▓▓▓▓▓▓▓▓▓▓▓▓▓  (tension + combat)
Layer 1: Pads        ▓▓▓▓▓▓▓▓▓▓▓▓▓▓  (always playing)
Layer 0: Bass Drone  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓  (always playing)
                     explore  tension  combat
```

All layers play from the start, synchronized. Volume is the only control — fading layers in/out changes the music's intensity without disrupting rhythm or harmony.

### Implementation

```csharp
public class LayeredMusicSystem
{
    public record MusicLayer(
        SoundEffectInstance Instance,
        float MinIntensity,  // layer fades in above this threshold
        float MaxIntensity   // layer is at full volume above this
    );

    private readonly List<MusicLayer> _layers = new();
    private float _targetIntensity;
    private float _currentIntensity;
    private float _fadeSpeed = 2f;

    /// <summary>
    /// Load stems that were prepared in your DAW at identical BPM and length.
    /// All stems must be the same duration for seamless looping.
    /// </summary>
    public void AddLayer(SoundEffect stem, float minIntensity, float maxIntensity)
    {
        var instance = stem.CreateInstance();
        instance.IsLooped = true;
        instance.Volume = 0f;
        instance.Play();
        _layers.Add(new MusicLayer(instance, minIntensity, maxIntensity));
    }

    /// <summary>
    /// Set the target intensity (0 = calm, 1 = maximum).
    /// The system smoothly fades layers to match.
    /// </summary>
    public void SetIntensity(float intensity)
    {
        _targetIntensity = MathHelper.Clamp(intensity, 0f, 1f);
    }

    public void Update(GameTime gameTime)
    {
        float dt = (float)gameTime.ElapsedGameTime.TotalSeconds;

        // Smooth intensity transitions
        _currentIntensity = MathHelper.Lerp(
            _currentIntensity, _targetIntensity,
            1f - MathF.Exp(-_fadeSpeed * dt));

        foreach (var layer in _layers)
        {
            // Map current intensity to layer volume
            float volume;
            if (_currentIntensity >= layer.MaxIntensity)
                volume = 1f;
            else if (_currentIntensity <= layer.MinIntensity)
                volume = 0f;
            else
                volume = (_currentIntensity - layer.MinIntensity)
                       / (layer.MaxIntensity - layer.MinIntensity);

            layer.Instance.Volume = volume;
        }
    }

    public void Stop()
    {
        foreach (var layer in _layers)
            layer.Instance.Stop();
    }
}
```

### Usage

```csharp
// In LoadContent:
var musicSystem = new LayeredMusicSystem();
musicSystem.AddLayer(Content.Load<SoundEffect>("music/explore_bass"),    0.0f, 0.1f);
musicSystem.AddLayer(Content.Load<SoundEffect>("music/explore_pads"),    0.0f, 0.2f);
musicSystem.AddLayer(Content.Load<SoundEffect>("music/tension_strings"), 0.3f, 0.5f);
musicSystem.AddLayer(Content.Load<SoundEffect>("music/combat_drums"),    0.6f, 0.8f);
musicSystem.AddLayer(Content.Load<SoundEffect>("music/combat_brass"),    0.8f, 1.0f);

// In Update — driven by game state:
float intensity = CalculateCombatIntensity(); // 0–1
musicSystem.SetIntensity(intensity);
musicSystem.Update(gameTime);
```

### Audio Preparation Tips

- **All stems must be the same BPM, length, and start point.** Export from your DAW with identical bar counts.
- **Use lossless WAV** for the content pipeline (it compresses to XNB).
- **Tail silence matters.** If stems are 32 bars, every stem must be exactly 32 bars — pad with silence if needed. Mismatched lengths cause drift.
- **Test with headphones.** Subtle phase issues between stems are audible on headphones but inaudible on speakers.

---

## 4. Crossfading Between Tracks

For switching between entirely different music tracks (e.g., exploring → boss fight), crossfade smoothly:

```csharp
public class MusicCrossfader
{
    private SoundEffectInstance? _current;
    private SoundEffectInstance? _next;
    private float _fadeProgress;    // 0 = current, 1 = next
    private float _fadeDuration;
    private bool _isFading;

    public void Play(SoundEffect track)
    {
        if (_current == null)
        {
            _current = track.CreateInstance();
            _current.IsLooped = true;
            _current.Volume = 1f;
            _current.Play();
            return;
        }

        // Start crossfade
        _next = track.CreateInstance();
        _next.IsLooped = true;
        _next.Volume = 0f;
        _next.Play();
        _fadeProgress = 0f;
        _fadeDuration = 2f; // seconds
        _isFading = true;
    }

    public void Update(GameTime gameTime)
    {
        if (!_isFading || _current == null || _next == null) return;

        float dt = (float)gameTime.ElapsedGameTime.TotalSeconds;
        _fadeProgress += dt / _fadeDuration;

        if (_fadeProgress >= 1f)
        {
            // Fade complete
            _current.Stop();
            _current.Dispose();
            _current = _next;
            _current.Volume = 1f;
            _next = null;
            _isFading = false;
        }
        else
        {
            // Equal-power crossfade (prevents volume dip in the middle)
            _current.Volume = MathF.Cos(_fadeProgress * MathHelper.PiOver2);
            _next.Volume    = MathF.Sin(_fadeProgress * MathHelper.PiOver2);
        }
    }
}
```

> **Equal-power crossfade:** Linear crossfade (A=1-t, B=t) dips ~3dB at the midpoint because audio energy is perceived logarithmically. The sin/cos curve (`cos(t*π/2)`, `sin(t*π/2)`) maintains constant perceived loudness through the transition.

---

## 5. Horizontal Re-Sequencing

Instead of layering, horizontal re-sequencing plays different musical segments in sequence, choosing the next segment based on game state:

```csharp
public class MusicSequencer
{
    public enum MusicMood { Calm, Tense, Combat, Victory }

    private readonly Dictionary<MusicMood, List<SoundEffect>> _segments = new();
    private SoundEffectInstance? _currentSegment;
    private MusicMood _currentMood = MusicMood.Calm;
    private MusicMood _requestedMood = MusicMood.Calm;

    public void RegisterSegment(MusicMood mood, SoundEffect segment)
    {
        if (!_segments.ContainsKey(mood))
            _segments[mood] = new List<SoundEffect>();
        _segments[mood].Add(segment);
    }

    public void SetMood(MusicMood mood) => _requestedMood = mood;

    public void Update(GameTime gameTime)
    {
        // Wait for current segment to finish before switching
        if (_currentSegment != null && _currentSegment.State == SoundState.Playing)
            return;

        // Pick a random segment from the requested mood
        _currentMood = _requestedMood;
        if (_segments.TryGetValue(_currentMood, out var segments) && segments.Count > 0)
        {
            var clip = segments[Random.Shared.Next(segments.Count)];
            _currentSegment = clip.CreateInstance();
            _currentSegment.IsLooped = false; // play once, then pick next
            _currentSegment.Play();
        }
    }
}
```

**When to use horizontal vs. vertical:**
- **Vertical (layering)** — music maintains continuity, just changes texture. Best for gradual intensity shifts.
- **Horizontal (sequencing)** — music can change melody, key, tempo. Best for distinct mood transitions.
- **Both combined** — the industry standard. Layers within each segment, with horizontal transitions between musical sections.

---

## 6. Ambient Soundscapes

Layered ambient audio that reacts to environment:

```csharp
public class AmbientSoundscape
{
    public record AmbientLayer(
        SoundEffectInstance Instance,
        string Tag   // e.g., "rain", "wind", "birds"
    );

    private readonly List<AmbientLayer> _layers = new();
    private readonly Dictionary<string, float> _targetVolumes = new();

    public void AddLayer(string tag, SoundEffect sound, bool looped = true)
    {
        var instance = sound.CreateInstance();
        instance.IsLooped = looped;
        instance.Volume = 0f;
        instance.Play();
        _layers.Add(new AmbientLayer(instance, tag));
        _targetVolumes[tag] = 0f;
    }

    /// <summary>
    /// Set a layer's target volume. Smoothing is applied in Update.
    /// </summary>
    public void SetLayerVolume(string tag, float volume)
    {
        _targetVolumes[tag] = MathHelper.Clamp(volume, 0f, 1f);
    }

    public void Update(GameTime gameTime)
    {
        float dt = (float)gameTime.ElapsedGameTime.TotalSeconds;
        foreach (var layer in _layers)
        {
            if (_targetVolumes.TryGetValue(layer.Tag, out float target))
            {
                float current = layer.Instance.Volume;
                layer.Instance.Volume = MathHelper.Lerp(current, target,
                    1f - MathF.Exp(-3f * dt));
            }
        }
    }
}

// Usage — driven by weather system:
ambientSoundscape.SetLayerVolume("rain", weatherSystem.RainIntensity);
ambientSoundscape.SetLayerVolume("wind", weatherSystem.WindStrength * 0.7f);
ambientSoundscape.SetLayerVolume("birds", weatherSystem.IsDaytime ? 0.4f : 0f);
```

---

## 7. FMOD Integration for Advanced Audio

For projects that need streaming playback, DSP effects, snapshot mixing, or timeline-based adaptive music, FMOD is the industry standard. MonoGame integrates via [FmodForFoxes](https://github.com/Martenfur/FmodForFoxes):

```bash
dotnet add package FmodForFoxes
# Download FMOD native libraries from fmod.com (free for budget < $200K)
```

### Setup

```csharp
using FmodForFoxes;
using FmodForFoxes.Studio;

protected override void Initialize()
{
    // Point to the directory containing FMOD native libraries
    FMODManager.Init(
        new DesktopNativePlatform("libs/fmod"),
        FMODMode.CoreAndStudio,
        "Content/fmod/Desktop" // path to FMOD Studio banks
    );
    base.Initialize();
}

protected override void Update(GameTime gameTime)
{
    FMODManager.Update(); // must call every frame
    base.Update(gameTime);
}
```

### FMOD Studio Events

```csharp
// Play a one-shot sound
CoreSystem.PlaySound("event:/SFX/Explosion");

// Music with parameters (designed in FMOD Studio)
var musicEvent = StudioSystem.GetEvent("event:/Music/Exploration");
musicEvent.Start();

// Drive adaptive music with a game parameter
musicEvent.SetParameterValue("intensity", combatIntensity); // 0–1
musicEvent.SetParameterValue("health", player.HealthPercent);
```

> **FMOD Studio workflow:** Design adaptive music in FMOD Studio (free tool), export banks, load in MonoGame. The Studio tool handles beat-synced transitions, layering, and parameter automation — you just set parameter values from code.

### When to Use FMOD vs. Built-In

| Scenario | Recommendation |
|----------|---------------|
| < 10 music tracks, basic SFX | MonoGame built-in |
| Layered music with 3–5 stems | MonoGame `SoundEffectInstance` (this guide) |
| Complex adaptive scores, DSP, streaming | FMOD via FmodForFoxes |
| Console targets (Xbox, PlayStation) | FMOD (handles platform audio APIs) |
| Budget-sensitive, small team | MonoGame built-in (zero licensing) |

---

## 8. Audio State Machine

Tie audio to game state with a dedicated state machine:

```csharp
public enum AudioState { Explore, Tension, Combat, Boss, Victory, Menu }

public class AudioStateMachine
{
    private readonly LayeredMusicSystem _music;
    private readonly AmbientSoundscape _ambience;
    private AudioState _state = AudioState.Menu;

    public void TransitionTo(AudioState newState)
    {
        if (_state == newState) return;
        _state = newState;

        switch (newState)
        {
            case AudioState.Explore:
                _music.SetIntensity(0.1f);
                _ambience.SetLayerVolume("nature", 0.6f);
                break;
            case AudioState.Tension:
                _music.SetIntensity(0.4f);
                _ambience.SetLayerVolume("nature", 0.3f);
                break;
            case AudioState.Combat:
                _music.SetIntensity(0.8f);
                _ambience.SetLayerVolume("nature", 0.1f);
                break;
            case AudioState.Boss:
                _music.SetIntensity(1.0f);
                _ambience.SetLayerVolume("nature", 0f);
                break;
        }
    }
}
```

> **Drive the state from gameplay, not timers.** Common intensity signals: enemy proximity, player health, number of active threats, time since last hit, stealth detection level.

---

## 9. ECS Integration

With Arch ECS, audio state can be driven by component queries:

```csharp
public record struct AudioIntensitySource(float Weight);
public record struct EnemyAggro(bool IsAggro, float DistanceToPlayer);

public class AudioIntensitySystem : BaseSystem<World, GameTime>
{
    private readonly QueryDescription _aggroQuery = new QueryDescription()
        .WithAll<EnemyAggro, Position>();

    private readonly AudioStateMachine _audioState;

    public override void Update(in GameTime gameTime)
    {
        float maxIntensity = 0f;
        int aggroCount = 0;

        World.Query(in _aggroQuery, (ref EnemyAggro aggro, ref Position pos) =>
        {
            if (aggro.IsAggro)
            {
                aggroCount++;
                float proximity = 1f - MathHelper.Clamp(
                    aggro.DistanceToPlayer / 30f, 0f, 1f);
                maxIntensity = MathF.Max(maxIntensity, proximity);
            }
        });

        // Determine audio state from gameplay signals
        if (aggroCount == 0)
            _audioState.TransitionTo(AudioState.Explore);
        else if (aggroCount < 3)
            _audioState.TransitionTo(AudioState.Tension);
        else
            _audioState.TransitionTo(AudioState.Combat);
    }
}
```

---

## 10. Performance & Memory

| Concern | Guidance |
|---------|----------|
| Memory per stem | `SoundEffect` holds the entire decoded PCM buffer. A 60-second stereo 44.1 kHz WAV ≈ 10 MB. Budget accordingly. |
| Max simultaneous instances | MonoGame caps at ~256 active `SoundEffectInstance` objects (platform-dependent). Reserve headroom for SFX. |
| CPU cost | Volume lerping per frame is negligible. The bottleneck is audio mixing — more active instances = more CPU. |
| Garbage collection | `SoundEffectInstance.Dispose()` when done. The `CreateInstance()` call allocates — pool instances if switching frequently. |
| Mobile | Reduce layer count (3 max). Use mono stems, not stereo. Lower sample rate (22 kHz). |

---

## 11. Checklist

```
□ Decide between vertical (layering) and horizontal (sequencing) approach
□ Export all stems at identical length, BPM, and sample rate from DAW
□ Use SoundEffectInstance for stems (not MediaPlayer — one-track limit)
□ Implement equal-power crossfade (sin/cos) for transitions
□ Drive intensity from gameplay signals, not arbitrary timers
□ Dispose SoundEffectInstances when switching tracks
□ Test on headphones — phase issues between layers are subtle
□ Budget memory: count stems × duration × channels × sample rate × 2 bytes
□ Consider FMOD for projects with >10 adaptive tracks or console targets
```

---

## See Also

- [G6 Audio](./G6_audio.md) — MonoGame built-in audio basics, FMOD setup
- [G87 3D Spatial Audio](./G87_3d_spatial_audio.md) — positional audio, HRTF, listener/emitter
- [G77 ECS Event Messaging](./G77_ecs_event_messaging.md) — event-driven triggers for audio state changes
- [G38 Scene Management](./G38_scene_management.md) — scene transitions that trigger music changes
- [FmodForFoxes GitHub](https://github.com/Martenfur/FmodForFoxes) — MonoGame FMOD wrapper
- [MonoGame Issue #8589](https://github.com/MonoGame/MonoGame/issues/8589) — Feature request for Song layering/looping improvements
