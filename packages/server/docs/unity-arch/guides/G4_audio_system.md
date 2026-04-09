# G4 — Audio System in Unity 6

> **Category:** guide · **Engine:** Unity 6 (6000.x) · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Scene Management](G1_scene_management.md) · [G3 Physics & Collision](G3_physics_and_collision.md) · [Unity Rules](../unity-arch-rules.md)

Unity's audio system is built on three pillars: **AudioSource** (plays sound), **AudioListener** (receives sound), and **AudioMixer** (routes, groups, and processes audio). This guide covers the full pipeline from clip import through spatial audio, mixer routing, snapshots, and performance optimization. Getting audio architecture right early prevents the chaotic "everything is an AudioSource on the same channel" problem that plagues many projects.

---

## Core Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────────┐
│  AudioClip   │────▶│ AudioSource  │────▶│    AudioMixer        │
│ (.wav/.ogg)  │     │ (per-object) │     │                      │
└──────────────┘     └──────┬───────┘     │  ┌────────────────┐  │
                            │             │  │  Master Group   │  │
                            │ output to   │  │  ├── Music      │  │
                            └────────────▶│  │  ├── SFX        │  │
                                          │  │  │   ├── Weapons│  │
                                          │  │  │   ├── Ambient│  │
                                          │  │  │   └── UI     │  │
┌──────────────┐                          │  │  └── Voice      │  │
│AudioListener │◀──── receives all ───────│  └────────────────┘  │
│ (on Camera)  │      mixed audio         │  Effects, Snapshots  │
└──────────────┘                          └──────────────────────┘
```

---

## AudioSource and AudioListener

Every sound in Unity comes from an `AudioSource` component. The `AudioListener` (typically on the main camera) determines what the player hears and from which direction.

### Basic Setup

```csharp
// WHY AudioSource on a separate child object: Keeps audio concerns separate
// from gameplay logic. You can also position the source independently
// (e.g., a character's footstep sounds come from their feet, not their center).

public class SFXPlayer : MonoBehaviour
{
    [SerializeField] private AudioSource _source;
    [SerializeField] private AudioClip[] _footstepClips;
    
    // WHY an array of clips: Playing the same sound repeatedly causes
    // "machine gun effect" — the brain notices the repetition immediately.
    // Randomly picking from a pool of variations sounds natural.
    public void PlayFootstep()
    {
        if (_footstepClips.Length == 0) return;
        
        // WHY PlayOneShot instead of Play: PlayOneShot lets multiple sounds
        // overlap on the same AudioSource. Play() stops the current sound first.
        // For rapid-fire sounds (footsteps, gunshots), PlayOneShot is correct.
        AudioClip clip = _footstepClips[Random.Range(0, _footstepClips.Length)];
        
        // WHY random pitch variation: Even with multiple clips, slight pitch
        // variation (±5%) prevents the brain from detecting patterns.
        _source.pitch = Random.Range(0.95f, 1.05f);
        _source.PlayOneShot(clip);
    }
}
```

### One-Shot Audio Without a Persistent Source

For sounds that don't need a persistent AudioSource (explosions, pickups):

```csharp
// WHY AudioSource.PlayClipAtPoint: Creates a temporary AudioSource, plays
// the clip, then auto-destroys the GameObject. Zero setup, no cleanup needed.
// The downside: you can't control it after creation (no stop, no fade).
AudioSource.PlayClipAtPoint(explosionClip, transform.position, 1.0f);

// For more control over one-shot sounds, use an object pool approach:
public class AudioPool : MonoBehaviour
{
    [SerializeField] private int _poolSize = 16;
    [SerializeField] private AudioMixerGroup _defaultGroup;
    
    private AudioSource[] _pool;
    private int _nextIndex;
    
    void Awake()
    {
        // WHY an object pool: PlayClipAtPoint creates and destroys GameObjects,
        // which causes GC pressure. A pool reuses a fixed set of AudioSources.
        _pool = new AudioSource[_poolSize];
        for (int i = 0; i < _poolSize; i++)
        {
            var go = new GameObject($"AudioPool_{i}");
            go.transform.SetParent(transform);
            _pool[i] = go.AddComponent<AudioSource>();
            _pool[i].outputAudioMixerGroup = _defaultGroup;
            _pool[i].playOnAwake = false;
        }
    }
    
    public AudioSource Play(AudioClip clip, Vector3 position, float volume = 1f)
    {
        // WHY round-robin: Simple and predictable. If all 16 sources are busy,
        // the oldest sound gets interrupted — which is usually the least
        // noticeable one since it's been playing the longest.
        AudioSource source = _pool[_nextIndex];
        _nextIndex = (_nextIndex + 1) % _poolSize;
        
        source.transform.position = position;
        source.clip = clip;
        source.volume = volume;
        source.Play();
        return source;
    }
}
```

---

## Spatial Audio (3D Sound)

The `Spatial Blend` property on AudioSource controls whether a sound is 2D (heard equally everywhere) or 3D (positioned in space with distance falloff and directional panning).

```csharp
// WHY Spatial Blend = 1.0 for world sounds: Without it, an explosion across
// the map sounds just as loud as one next to you. Spatial Blend enables
// distance-based attenuation, stereo panning, and Doppler effects.

[RequireComponent(typeof(AudioSource))]
public class SpatialSFX : MonoBehaviour
{
    void Awake()
    {
        var source = GetComponent<AudioSource>();
        
        // WHY these specific values:
        source.spatialBlend = 1.0f;    // Fully 3D
        source.minDistance = 1f;        // Full volume within 1 meter
        source.maxDistance = 30f;       // Inaudible beyond 30 meters
        source.rolloffMode = AudioRolloffMode.Custom;
        
        // WHY Custom rolloff: The default Logarithmic rolloff drops volume
        // very fast and then has a long quiet tail. A custom curve lets you
        // design exactly how the sound fades — e.g., linear for a campfire,
        // steep then flat for a gunshot.
    }
}
```

### Rolloff Modes

| Mode | Behavior | Best For |
|------|----------|----------|
| `Logarithmic` | Realistic, drops fast near source then gradually | Realistic sims |
| `Linear` | Even falloff from min to max distance | Most game sounds |
| `Custom` | Designer-defined curve | Fine-tuned game feel |

### Spatial Audio for 2D Games

Even in 2D games, spatial audio adds depth. Set `Spatial Blend` to a partial value (0.5–0.8) for world sounds — the player hears stereo panning (left/right) without full 3D distance attenuation.

---

## AudioMixer

The AudioMixer is Unity's mixing console. Route AudioSources through mixer groups to control volume, apply effects, and create snapshots.

### Setting Up a Mixer Hierarchy

Create via: Assets → Create → AudioMixer

Recommended group structure:

```
Master
├── Music          ← background music, layers
├── SFX            ← all gameplay sound effects
│   ├── Weapons    ← gunshots, impacts, explosions
│   ├── Ambient    ← wind, rain, wildlife
│   ├── Character  ← footsteps, voices, grunts
│   └── UI         ← button clicks, notifications
└── Voice          ← dialogue, narration (ducking target)
```

```csharp
// Assigning an AudioSource to a mixer group:
// 1. In the Inspector: drag the mixer group to AudioSource.Output
// 2. In code:
[SerializeField] private AudioMixerGroup _weaponsGroup;

void Awake()
{
    GetComponent<AudioSource>().outputAudioMixerGroup = _weaponsGroup;
}
```

### Exposed Parameters (Volume Sliders)

To control mixer parameters from code (e.g., settings menu volume sliders):

```csharp
// Step 1: In the AudioMixer window, right-click "Volume" on a group
//         → "Expose 'Volume' to script"
//         → Rename the exposed parameter (e.g., "MusicVolume")

// Step 2: Control it from code:
public class AudioSettings : MonoBehaviour
{
    [SerializeField] private AudioMixer _masterMixer;
    
    public void SetMusicVolume(float sliderValue)
    {
        // WHY Mathf.Log10 * 20: AudioMixer volume is in decibels, not linear.
        // A slider from 0.0001 to 1.0 maps to -80dB to 0dB.
        // Without this conversion, the slider feels wrong — most of the
        // audible range is crammed into the last 10% of the slider.
        float dB = Mathf.Log10(Mathf.Max(sliderValue, 0.0001f)) * 20f;
        _masterMixer.SetFloat("MusicVolume", dB);
    }
    
    public float GetMusicVolume()
    {
        _masterMixer.GetFloat("MusicVolume", out float dB);
        // Convert back to linear for the UI slider
        return Mathf.Pow(10f, dB / 20f);
    }
}
```

### Snapshots

Snapshots capture the entire state of a mixer (all volumes, effects, sends) and let you transition between them at runtime. Use cases: underwater muffling, pause menu, combat intensity.

```csharp
// WHY Snapshots over setting individual parameters: A snapshot transitions
// ALL mixer settings at once with a single call. This is much simpler than
// manually tweening 10+ parameters and guarantees consistency.

public class AudioSnapshotManager : MonoBehaviour
{
    [SerializeField] private AudioMixerSnapshot _normalSnapshot;
    [SerializeField] private AudioMixerSnapshot _underwaterSnapshot;
    [SerializeField] private AudioMixerSnapshot _pausedSnapshot;
    
    public void EnterUnderwater()
    {
        // WHY 0.5f transition time: An instant switch sounds jarring.
        // A half-second crossfade feels natural, like your ears adjusting.
        _underwaterSnapshot.TransitionTo(0.5f);
    }
    
    public void ExitUnderwater()
    {
        _normalSnapshot.TransitionTo(0.5f);
    }
    
    public void Pause()
    {
        // WHY a pause snapshot: Rather than muting everything, a pause snapshot
        // can lower Music to -10dB, mute SFX completely, and add a low-pass
        // filter — creating a "world is muffled" feel that's more polished.
        _pausedSnapshot.TransitionTo(0.2f);
    }
    
    // Blending between multiple snapshots simultaneously:
    public void SetCombatIntensity(float intensity)
    {
        // WHY weighted snapshot blending: Smoothly transitions between calm
        // and combat audio profiles based on a gameplay value (0 = peaceful,
        // 1 = intense combat). The mixer interpolates between ALL settings.
        AudioMixerSnapshot[] snaps = { _normalSnapshot, _combatSnapshot };
        float[] weights = { 1f - intensity, intensity };
        _masterMixer.TransitionToSnapshots(snaps, weights, 0.3f);
    }
}
```

### Ducking with Send Effects

Ducking automatically lowers one group's volume when another plays — the classic example is lowering music when dialogue plays.

Setup in the AudioMixer:
1. Add a **Send** effect to the Voice group, targeting a **Duck Volume** effect on the Music group
2. Configure the Duck Volume: Threshold, Ratio, Attack Time, Release Time
3. When voice audio plays, it sends signal to the ducker, which compresses the music volume

```
// No code needed — this is entirely configured in the AudioMixer UI.
// WHY ducking: Manually fading music for every dialogue line is tedious
// and error-prone. Ducking handles it automatically and smoothly, and
// the music returns to full volume naturally when dialogue stops.
```

---

## Audio Clip Import Settings

Import settings dramatically affect both quality and memory:

| Setting | Recommendation | Why |
|---------|---------------|-----|
| **Load Type** | `Decompress on Load` for short SFX; `Streaming` for music/ambient | Short clips benefit from instant playback; long clips would waste too much RAM if fully loaded |
| **Compression Format** | `Vorbis` for most; `ADPCM` for short, frequent SFX | Vorbis has best quality/size ratio; ADPCM decompresses faster (good for rapid playback) |
| **Quality** | 70–80% for SFX; 50–60% for music | Most players can't tell the difference above 70% for SFX |
| **Sample Rate** | `Optimize Sample Rate` or 22050 Hz for SFX | Full 44100 Hz is overkill for most sound effects |
| **Force Mono** | Enable for 3D spatial sounds | 3D sounds are panned by the engine — stereo data is wasted memory |

```csharp
// WHY Force Mono for 3D sounds: A stereo clip stores left/right channels
// separately, doubling memory. But the spatialization system overrides the
// stereo field anyway — it pans a mono source based on the listener's
// position. So the stereo data is thrown away at runtime. Force Mono halves
// memory and the clip sounds identical in-game.
```

---

## Common Patterns

### Background Music with Crossfade

```csharp
public class MusicManager : MonoBehaviour
{
    // WHY two AudioSources: Cross-fading requires one source fading out
    // while the other fades in. A single source would have a gap.
    [SerializeField] private AudioSource _sourceA;
    [SerializeField] private AudioSource _sourceB;
    [SerializeField] private float _fadeDuration = 2f;
    
    private AudioSource _active;
    
    void Awake() => _active = _sourceA;
    
    public void CrossfadeTo(AudioClip newTrack)
    {
        AudioSource next = (_active == _sourceA) ? _sourceB : _sourceA;
        next.clip = newTrack;
        next.volume = 0f;
        next.Play();
        
        StartCoroutine(Crossfade(_active, next));
        _active = next;
    }
    
    private IEnumerator Crossfade(AudioSource from, AudioSource to)
    {
        float elapsed = 0f;
        float fromStartVol = from.volume;
        
        while (elapsed < _fadeDuration)
        {
            elapsed += Time.unscaledDeltaTime;
            float t = elapsed / _fadeDuration;
            
            // WHY unscaledDeltaTime: Music should crossfade even when the
            // game is paused (Time.timeScale = 0). UnscaledDeltaTime ignores
            // timeScale, so the fade continues during pause menus.
            from.volume = Mathf.Lerp(fromStartVol, 0f, t);
            to.volume = Mathf.Lerp(0f, 1f, t);
            
            yield return null;
        }
        
        from.Stop();
        from.volume = fromStartVol;
    }
}
```

### Ambient Sound Zones

```csharp
// WHY trigger-based ambient zones: Rather than manually scripting audio
// for each area, place trigger colliders in the scene. When the player
// enters, the zone's ambient audio fades in. Clean, designer-friendly.

[RequireComponent(typeof(AudioSource))]
public class AmbientZone : MonoBehaviour
{
    [SerializeField] private float _fadeTime = 1.5f;
    
    private AudioSource _source;
    private Coroutine _fadeCoroutine;
    
    void Awake()
    {
        _source = GetComponent<AudioSource>();
        _source.loop = true;
        _source.volume = 0f;
        _source.Play(); // Start playing at zero volume
    }
    
    void OnTriggerEnter(Collider other)
    {
        if (!other.CompareTag("Player")) return;
        if (_fadeCoroutine != null) StopCoroutine(_fadeCoroutine);
        _fadeCoroutine = StartCoroutine(FadeVolume(1f));
    }
    
    void OnTriggerExit(Collider other)
    {
        if (!other.CompareTag("Player")) return;
        if (_fadeCoroutine != null) StopCoroutine(_fadeCoroutine);
        _fadeCoroutine = StartCoroutine(FadeVolume(0f));
    }
    
    private IEnumerator FadeVolume(float target)
    {
        float start = _source.volume;
        float elapsed = 0f;
        while (elapsed < _fadeTime)
        {
            elapsed += Time.deltaTime;
            _source.volume = Mathf.Lerp(start, target, elapsed / _fadeTime);
            yield return null;
        }
        _source.volume = target;
    }
}
```

---

## Performance Checklist

- [ ] Set `Force Mono` on all 3D spatial AudioClips to halve memory
- [ ] Use `Streaming` load type for music and long ambient loops
- [ ] Use `Decompress on Load` for short, frequently-played SFX
- [ ] Route all AudioSources through AudioMixer groups (never leave on "None")
- [ ] Limit simultaneous voices — Unity's default is 32; set `AudioSettings.SetMaxRealVoicesCount()` based on your target platform
- [ ] Use an AudioSource pool instead of `PlayClipAtPoint` for frequently played one-shots
- [ ] Set `AudioSource.priority` (0 = highest, 256 = lowest) so important sounds are never culled
- [ ] Disable `Doppler Level` on AudioSources unless you specifically want the Doppler effect
- [ ] Use `AudioSource.spatialize = true` only when a spatializer plugin (Resonance, Steam Audio) is installed — otherwise it's wasted processing

---

## Further Reading

- [Unity Manual: Audio Overview](https://docs.unity3d.com/Manual/AudioOverview.html)
- [Unity Manual: AudioMixer](https://docs.unity3d.com/Manual/AudioMixer.html)
- [Unity Manual: AudioSource](https://docs.unity3d.com/Manual/class-AudioSource.html)
- [Unity Manual: Audio Spatializer SDK](https://docs.unity3d.com/Manual/AudioSpatializerSDK.html)
