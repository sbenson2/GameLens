# G65 — Audio Middleware Integration: FMOD & Wwise

> **Category:** guide · **Engine:** Unity 6 (6000.x) · **Related:** [G4 Audio System](G4_audio_system.md) · [G10 Rendering Pipeline](G10_rendering_pipeline_urp_hdrp.md) · [G16 Performance Optimization](G16_performance_optimization_memory.md) · [Unity Rules](../unity-arch-rules.md)

Unity's built-in audio system (AudioSource/AudioMixer) works for simple projects, but professional game audio demands middleware. **FMOD** and **Wwise** (Audiokinetic) are the industry-standard solutions that replace Unity's audio pipeline with designer-driven tools for adaptive music, spatial audio, and runtime mixing. This guide covers architecture, integration, and production patterns for both.

---

## Why Audio Middleware?

| Concern | Unity Built-in (AudioSource) | FMOD / Wwise |
|---------|------------------------------|--------------|
| Adaptive music | Manual scripting | Visual timeline, parameters, transitions |
| Sound variation | Random clip arrays | Randomization containers, scatterer instruments |
| Mixing control | AudioMixer groups | Buses with sidechaining, ducking, dynamic range |
| Spatial audio | Basic 3D rolloff | Full HRTF, occlusion, diffraction, reverb zones |
| Designer workflow | Inspector-only | Standalone authoring tool with live preview |
| Memory management | Per-clip settings | Bank-based streaming with voice virtualization |
| Profiling | Limited | Live session profiling with CPU/voice/memory views |

> **Decision point:** FMOD is free for projects under $200K revenue (as of 2025) and has a simpler learning curve. Wwise is free under $150K (limited to 500 media assets in free tier) but offers more granular control and is standard in AAA. Both support Unity 6.

---

## Architecture Overview

Both middleware solutions follow the same high-level pattern: a **standalone authoring tool** where audio designers build events and soundbanks, and a **Unity integration plugin** that loads banks and triggers events at runtime.

```
┌──────────────────────┐          ┌───────────────────────────┐
│  Authoring Tool      │          │  Unity Project            │
│  (FMOD Studio /      │  build   │                           │
│   Wwise Authoring)   │──banks──▶│  StreamingAssets/          │
│                      │          │    ├── Master.bank         │
│  Events, Buses,      │          │    ├── Music.bank          │
│  Parameters,         │          │    └── SFX.bank            │
│  Spatial Settings    │          │                           │
└──────────────────────┘          │  ┌───────────────────────┐│
                                  │  │ Runtime Integration    ││
                                  │  │ (RuntimeManager /     ││
                                  │  │  AkSoundEngine)       ││
                                  │  │                       ││
                                  │  │ Events ←→ Parameters  ││
                                  │  │ Banks  ←→ Memory      ││
                                  │  │ Buses  ←→ Mixing      ││
                                  │  └───────────────────────┘│
                                  └───────────────────────────┘
```

---

## FMOD Integration

### Installation (FMOD for Unity 2.03+)

1. Download **FMOD for Unity** from [fmod.com/unity](https://www.fmod.com/unity) or via the Unity Asset Store
2. Import the `.unitypackage` into your project
3. Open **FMOD > Edit Settings** and set the **Studio Project Path** to your `.fspro` file
4. FMOD builds banks to `Assets/StreamingAssets/` automatically

```
Project Settings (FMOD)
├── Studio Project Path:  ../FMODProject/MyGame.fspro
├── Bank Output:          StreamingAssets
├── Live Update:          Enabled (Editor only)
└── Platforms:            Desktop, Mobile, Console
```

### Core API: RuntimeManager

```csharp
using FMODUnity;
using FMOD.Studio;

public class AudioManager : MonoBehaviour
{
    // WHY RuntimeManager: This is FMOD's singleton that manages the Studio System.
    // It handles bank loading, event creation, and the update loop automatically.
    // You should NOT call FMOD.Studio.System directly in most cases.

    // --- Fire-and-Forget (short SFX) ---
    public void PlayFootstep(Vector3 position)
    {
        // WHY PlayOneShot: Creates a temporary instance, plays it, and auto-releases.
        // Perfect for one-off sounds that don't need parameter changes mid-play.
        RuntimeManager.PlayOneShot("event:/SFX/Footstep", position);
    }

    // --- Persistent Instance (music, ambient, looping) ---
    private EventInstance _musicInstance;

    public void StartCombatMusic()
    {
        // WHY CreateInstance: Returns a handle you keep alive to control parameters,
        // pause, or stop later. Essential for music and ambient loops.
        _musicInstance = RuntimeManager.CreateInstance("event:/Music/Combat");
        _musicInstance.start();
    }

    public void SetCombatIntensity(float intensity)
    {
        // WHY setParameterByName: Parameters are the bridge between gameplay and
        // audio design. The designer sets up intensity-driven layers in FMOD Studio;
        // code just sends the value. No audio logic in C#.
        _musicInstance.setParameterByName("Intensity", Mathf.Clamp01(intensity));
    }

    public void StopCombatMusic()
    {
        // WHY ALLOWFADEOUT: Lets the designer's fade-out timeline play.
        // IMMEDIATE would cut the sound instantly (useful for scene transitions).
        _musicInstance.stop(FMOD.Studio.STOP_MODE.ALLOWFADEOUT);
        _musicInstance.release();
    }
}
```

### StudioEventEmitter Component

For designers who prefer Inspector workflows over code:

```csharp
using FMODUnity;
using UnityEngine;

public class AmbientZone : MonoBehaviour
{
    // WHY StudioEventEmitter: Designer-friendly component that replaces AudioSource.
    // Drag an FMOD event reference in the Inspector — no code needed for basic playback.
    // Supports Play on Awake, Stop on Destroy, and trigger-based play/stop.

    [SerializeField] private StudioEventEmitter _emitter;

    // For dynamic parameter control, access the emitter's instance:
    public void SetWeatherIntensity(float rain)
    {
        _emitter.SetParameter("RainIntensity", rain);
    }
}
```

### 3D Spatial Audio

```csharp
public class EnemyAudio : MonoBehaviour
{
    private EventInstance _growlInstance;

    void Start()
    {
        _growlInstance = RuntimeManager.CreateInstance("event:/SFX/EnemyGrowl");

        // WHY AttachInstanceToGameObject: Automatically updates the event's 3D
        // position every frame based on the transform. Without this, you'd need
        // to call set3DAttributes manually in Update().
        RuntimeManager.AttachInstanceToGameObject(
            _growlInstance, transform, GetComponent<Rigidbody>()
        );

        _growlInstance.start();
    }

    void OnDestroy()
    {
        _growlInstance.stop(FMOD.Studio.STOP_MODE.IMMEDIATE);
        _growlInstance.release();
    }
}
```

---

## Wwise Integration

### Installation (Wwise Unity Integration 2024+)

1. Install **Wwise Launcher** → Integrate with your Unity project version
2. Wwise creates `Assets/Wwise/` with runtime scripts and editor tools
3. Open the **Wwise Picker** window in Unity to browse events
4. SoundBanks are generated from the Wwise Authoring Tool and placed in `StreamingAssets/Audio/GeneratedSoundBanks/`

### Core API: AkSoundEngine

```csharp
using AK.Wwise;

public class AudioManager : MonoBehaviour
{
    // WHY AkSoundEngine: The static class that wraps the entire Wwise SDK.
    // It replaces AK::SoundEngine, AK::MusicEngine, and other C++ namespaces
    // into a single Unity-friendly API.

    // --- Event Posting (fire-and-forget) ---
    public void PlayFootstep()
    {
        // WHY PostEvent with string: Simple but fragile — typos fail silently.
        // Prefer the AK.Wwise.Event type (Inspector-assignable) for safety.
        AkSoundEngine.PostEvent("Play_Footstep", gameObject);
    }

    // --- Inspector-Safe Event Reference ---
    [SerializeField] private AK.Wwise.Event _combatMusicEvent;

    public void StartCombatMusic()
    {
        // WHY AK.Wwise.Event.Post: Uses the Event's internal ID, avoiding
        // string typos. The Inspector shows a dropdown of all Wwise events.
        _combatMusicEvent.Post(gameObject);
    }

    // --- RTPC (Real-Time Parameter Control) ---
    public void SetCombatIntensity(float intensity)
    {
        // WHY SetRTPCValue: RTPCs are Wwise's equivalent of FMOD parameters.
        // The designer maps intensity ranges to mix behaviors in the authoring tool.
        AkSoundEngine.SetRTPCValue("CombatIntensity", intensity, gameObject);
    }

    // --- Switches (surface types, weapon types) ---
    public void SetFootstepSurface(string surface)
    {
        // WHY SetSwitch: Switches select between audio variations without
        // code knowing about the actual clips. The designer maps "Wood",
        // "Metal", "Grass" to different sound containers in Wwise.
        AkSoundEngine.SetSwitch("FootstepSurface", surface, gameObject);
    }

    // --- States (global mix snapshots) ---
    public void EnterUnderwaterState()
    {
        // WHY SetState: Global state changes affect all playing sounds
        // simultaneously. The designer sets up low-pass filters, reverb,
        // and volume changes on the "Underwater" state in Wwise.
        AkSoundEngine.SetState("Environment", "Underwater");
    }
}
```

### AkEvent Component

The component-based alternative to scripted posting:

```csharp
// WHY AkEvent component: Drag from the Wwise Picker onto a GameObject.
// Supports trigger callbacks (Awake, Start, Destroy, Trigger Enter/Exit).
// The component automatically adds AkGameObj for 3D positioning.

// For script control, get the component reference:
[SerializeField] private AkEvent _ambientEvent;

void OnEnable()
{
    // HandleEvent triggers the configured Wwise event
    _ambientEvent.HandleEvent(gameObject);
}
```

---

## Adaptive Music Patterns

Both FMOD and Wwise support the same fundamental adaptive music techniques:

### Vertical Layering (Intensity Stacking)

```
Parameter: "Intensity" [0.0 → 1.0]

0.0 ─ 0.3:   Base layer (ambient pads)
0.3 ─ 0.6:   + Rhythm layer (percussion)
0.6 ─ 0.8:   + Melody layer (strings)
0.8 ─ 1.0:   + Full orchestra + brass hits
```

```csharp
// WHY smooth interpolation: Abrupt parameter jumps cause audible pops
// in layered music. Lerp the value over time for natural transitions.
private float _targetIntensity;
private float _currentIntensity;

void Update()
{
    _currentIntensity = Mathf.MoveTowards(
        _currentIntensity, _targetIntensity, Time.deltaTime * 0.5f
    );
    // Works with both FMOD and Wwise parameter APIs
    SetMusicIntensity(_currentIntensity);
}
```

### Horizontal Resequencing (Section Transitions)

```
Sections:  [Explore] → [Tension] → [Combat] → [Victory]
                ↑                                   │
                └───────────────────────────────────┘

Transition rules (set in authoring tool):
  - Explore → Tension:  on next bar
  - Tension → Combat:   on next beat
  - Combat  → Victory:  immediate with stinger
  - Victory → Explore:  after Victory section ends
```

```csharp
// WHY trigger via parameter, not direct section control:
// Let the authoring tool handle transition timing and musical quantization.
// Code says WHAT state to be in; the designer says HOW to get there musically.
public void OnCombatStart() => SetMusicParameter("GameState", 2f); // Combat
public void OnCombatEnd()   => SetMusicParameter("GameState", 3f); // Victory
```

---

## Audio Occlusion & Obstruction

### Raycast-Based Occlusion

```csharp
public class AudioOcclusion : MonoBehaviour
{
    [SerializeField] private LayerMask _occlusionMask;
    [SerializeField] private float _updateInterval = 0.1f;

    private Transform _listener;
    private float _timer;

    // WHY separate occlusion from the audio API: This script works with both
    // FMOD and Wwise. It calculates an occlusion value and sends it to
    // whichever middleware you're using via a parameter/RTPC.

    void Update()
    {
        _timer += Time.deltaTime;
        if (_timer < _updateInterval) return;
        _timer = 0f;

        if (_listener == null)
            _listener = Camera.main.transform;

        Vector3 direction = _listener.position - transform.position;
        float distance = direction.magnitude;

        // WHY multiple raycasts: A single ray misses partial occlusion.
        // Cast from source to listener and count how many walls are hit.
        int hits = 0;
        RaycastHit[] results = new RaycastHit[4];
        int count = Physics.RaycastNonAlloc(
            transform.position, direction.normalized, results,
            distance, _occlusionMask
        );

        // WHY normalize to 0-1: Both FMOD parameters and Wwise RTPCs
        // work best with normalized ranges. The designer maps 0-1 to
        // filter curves in the authoring tool.
        float occlusion = Mathf.Clamp01(count / 3f);

        // FMOD: eventInstance.setParameterByName("Occlusion", occlusion);
        // Wwise: AkSoundEngine.SetRTPCValue("Occlusion", occlusion, gameObject);
        ApplyOcclusion(occlusion);
    }

    protected virtual void ApplyOcclusion(float value) { }
}
```

---

## Bank / SoundBank Management

### FMOD Bank Strategy

```
Banks (FMOD Studio → Build):
├── Master.bank           ← Always loaded (bus routing, metadata)
├── Master.strings.bank   ← Event name lookups (Editor/debug only)
├── SFX_Common.bank       ← Loaded at boot (UI clicks, footsteps)
├── Music_Explore.bank    ← Loaded per-level
├── Music_Combat.bank     ← Loaded when combat starts
└── VO_Chapter1.bank      ← Loaded per-chapter (streaming recommended)
```

```csharp
// WHY explicit bank loading: The Master bank loads automatically, but
// additional banks should be loaded/unloaded based on game state to
// control memory. A 4GB game can't keep all audio in RAM on mobile.

public async void LoadLevelAudio(string levelName)
{
    // FMOD loads banks asynchronously by default
    RuntimeManager.LoadBank($"Music_{levelName}", loadSamples: true);

    // WHY loadSamples: Forces sample data into memory immediately.
    // Without it, first playback may stutter as data streams in.
    // Set false for banks with streaming assets (long music/VO).
}

public void UnloadLevelAudio(string levelName)
{
    RuntimeManager.UnloadBank($"Music_{levelName}");
}
```

### Wwise SoundBank Strategy

```csharp
// WHY AkBankManager: Wwise's Unity integration includes a bank manager
// that handles async loading. You can also use the AkBank component
// on GameObjects for level-scoped bank lifetime.

public void LoadLevelBanks(string levelName)
{
    AkBankManager.LoadBank($"SFX_{levelName}");
    AkBankManager.LoadBank($"Music_{levelName}");
}

public void UnloadLevelBanks(string levelName)
{
    AkBankManager.UnloadBank($"Music_{levelName}");
    AkBankManager.UnloadBank($"SFX_{levelName}");
}
```

---

## Performance Budget

| Platform | Voice Limit | Streaming Voices | Memory Budget |
|----------|-------------|------------------|---------------|
| PC / Console | 64–128 | 8–16 | 256–512 MB |
| Mobile | 24–48 | 4–8 | 64–128 MB |
| Switch | 32–64 | 4–8 | 96–192 MB |

### Compression Guidelines

| Content Type | FMOD Codec | Wwise Codec | Notes |
|-------------|------------|-------------|-------|
| Music | Vorbis (quality 40-60%) | Vorbis | Stream from disk, don't decompress |
| SFX (short) | FADPCM | ADPCM | Fast decode, low CPU |
| SFX (long) | Vorbis | Vorbis | Stream if >500KB |
| Voice/VO | Vorbis (quality 30-50%) | Vorbis | Stream, lowest quality acceptable |
| UI | PCM (uncompressed) | PCM | Instant playback, tiny files |

---

## Migration from Unity AudioSource

When moving from built-in audio to middleware:

1. **Audit existing AudioSources** — List every AudioSource in the project. FMOD's migration tool can identify them automatically.
2. **Rebuild in the authoring tool** — Don't just import clips. Recreate sounds with proper randomization, layering, and parameter control.
3. **Replace components** — Swap `AudioSource` for `StudioEventEmitter` (FMOD) or `AkEvent` (Wwise) on each GameObject.
4. **Remove AudioListener** — FMOD and Wwise have their own listener components (`StudioListener` / `AkAudioListener`).
5. **Disable Unity audio** — In Project Settings → Audio, set **Disable Unity Audio** to avoid conflicts and save CPU.

```csharp
// WHY disable Unity Audio: The built-in audio system still runs its
// update loop even if you're not using AudioSources. Disabling it
// frees ~0.5ms of CPU per frame on mobile devices.
// Project Settings → Audio → Disable Unity Audio: ✓
```

---

## Common Pitfalls

| Pitfall | Fix |
|---------|-----|
| Event strings are typo-prone | Use `[FMODUnity.EventRef]` attribute or `AK.Wwise.Event` Inspector type |
| Forgetting to release instances | Always call `release()` (FMOD) after stopping persistent instances |
| Banks not built before Play | Set up auto-build in FMOD settings or Wwise project pre-build |
| Occlusion not updating | Use `AttachInstanceToGameObject` (FMOD) or ensure `AkGameObj` is present (Wwise) |
| Memory spikes on level load | Stagger bank loads across frames; use streaming for large assets |
| Live Update left on in builds | Disable Live Update in build profiles — it opens a network socket |

---

## Choosing Between FMOD and Wwise

| Factor | FMOD | Wwise |
|--------|------|-------|
| **Free tier** | Revenue < $200K | Revenue < $150K (500 asset limit) |
| **Learning curve** | Moderate (timeline-based) | Steep (powerful but complex) |
| **Designer autonomy** | High | Very high |
| **Spatial audio** | Good (built-in spatializer) | Excellent (geometry-aware diffraction) |
| **Profiling** | Live Update profiler | Advanced profiler with capture sessions |
| **Community** | Strong indie community | AAA industry standard |
| **Platform support** | All Unity platforms | All Unity platforms + proprietary engines |

> **Recommendation:** Start with FMOD for indie/small teams. Consider Wwise if your audio team has middleware experience or if your game requires advanced spatial audio with geometry-based diffraction.
