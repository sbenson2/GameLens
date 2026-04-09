# Audio System (MetaSounds & Sound Management)

> **Category:** guide · **Engine:** Unreal Engine 5.5+ · **Related:** [G1 Gameplay Framework](G1_gameplay_framework.md), [E1 Architecture Overview](../architecture/E1_architecture_overview.md)

Unreal Engine 5's audio system centers on **MetaSounds** — a node-based DSP (Digital Signal Processing) graph that replaces legacy Sound Cues for procedural, high-performance audio. This guide covers MetaSounds fundamentals, spatial audio and attenuation, Sound Classes/Mixes, C++ integration, and performance optimization.

## Audio Architecture Overview

UE5's audio stack has three layers:

```
MetaSounds / Sound Cues          ← Audio source definition (what to play)
       │
Sound Attenuation / Spatialization  ← Spatial behavior (how it sounds in 3D)
       │
Audio Components / Audio Engine     ← Playback management (when/where to play)
       │
Submixes / Sound Classes            ← Mixing and categorization (volume control)
```

**MetaSounds vs Sound Cues:** MetaSounds are the modern replacement for Sound Cues. Sound Cues evaluated on the game thread, causing CPU contention. MetaSounds push all DSP work onto the dedicated audio render thread, eliminating game-thread audio hitches.

## MetaSounds Fundamentals

A MetaSound is a node graph that generates or processes audio. It's similar to a material graph but for sound.

### Core Concepts

| Concept | What it is | Analogy |
|---------|-----------|---------|
| **MetaSound Source** | A standalone playable audio asset | Like a Sound Cue, but fully procedural |
| **MetaSound Patch** | A reusable sub-graph (macro) | Like a Material Function |
| **Input** | A parameter exposed to gameplay code | Like a Material Parameter |
| **Trigger** | A pulse input that fires an event | Like an animation notify |
| **Interface** | Predefined inputs the engine connects automatically | UE.Source, UE.Attenuation |

### Key Interfaces

MetaSounds use **Interfaces** to receive engine-level data automatically:

- **UE.Source** — provides `On Play` trigger, `On Finished` trigger, `Is Preview` bool
- **UE.Attenuation** — provides `Distance` float (listener-to-source distance)

These interfaces are how the engine communicates with your MetaSound graph without manual wiring.

### Building a Basic MetaSound

1. **Content Browser** → Right-click → **Sounds** → **MetaSound Source**
2. Add a **Wave Player** node → assign an audio asset
3. Connect the **On Play** trigger (from UE.Source interface) to the Wave Player's Play input
4. Connect the Wave Player's **Audio Out** to the graph's **Output** node
5. Connect the Wave Player's **On Finished** to the graph's **On Finished** trigger

```
[On Play] ──trigger──► [Wave Player] ──audio──► [Output]
                              │
                        [On Finished] ──trigger──► [On Finished]
```

> **Why On Finished matters:** Without connecting On Finished, the engine doesn't know when playback ends. This prevents proper voice recycling and can lead to voice count exhaustion.

### Randomization Pattern

A common pattern for variety — randomly select from multiple wave assets:

```
[On Play] ──► [Random Get (Audio)] ──► [Wave Player] ──► [Output]
                     │
              Wave 1, Wave 2, Wave 3
              (no repeats enabled)
```

Enable **No Repeats** on the Random node to prevent the same sound from playing twice in a row, which players perceive as unnatural.

## Spatial Audio and Attenuation

### Sound Attenuation Settings

Attenuation controls how sound volume and spatialization change with distance. Create an **Attenuation Settings** asset for reuse across many sounds.

**Key parameters:**

| Parameter | What it controls | Recommended starting values |
|-----------|-----------------|----------------------------|
| Inner Radius | Distance where sound is at full volume | 200–500 cm (dialogue/footsteps) |
| Falloff Distance | Distance where sound fades to silence | 2000–5000 cm (SFX), 10000+ (ambient) |
| Attenuation Function | Falloff curve shape | `Natural Sound` (physically accurate) |
| Spatialization Method | How direction is rendered | `Binaural` for headphones, `Panning` for speakers |
| Occlusion | Whether geometry blocks sound | Enable for important SFX, disable for ambient |

### Applying Attenuation in C++

```cpp
#include "Components/AudioComponent.h"
#include "Sound/SoundAttenuation.h"
#include "Kismet/GameplayStatics.h"

// Playing a spatialized sound at a world location.
// PlaySoundAtLocation is fire-and-forget — ideal for one-shot SFX
// like explosions, footsteps, and impacts.
void AMyActor::PlayImpactSound()
{
    if (ImpactMetaSound)
    {
        UGameplayStatics::PlaySoundAtLocation(
            this,
            ImpactMetaSound,      // USoundBase* (MetaSound Source)
            GetActorLocation(),
            FRotator::ZeroRotator,
            1.0f,                 // Volume multiplier
            1.0f,                 // Pitch multiplier
            0.0f,                 // Start time
            AttenuationSettings,  // USoundAttenuation* (nullptr = 2D)
            nullptr,              // USoundConcurrency*
            nullptr               // AActor* owning actor
        );
    }
}
```

### Persistent Audio with AudioComponent

For looping or long-running sounds (engine hum, ambient fire), use an AudioComponent:

```cpp
UCLASS()
class AFirePit : public AActor
{
    GENERATED_BODY()

    UPROPERTY(VisibleAnywhere)
    UAudioComponent* FireAudio;

    UPROPERTY(EditDefaultsOnly)
    USoundBase* FireMetaSound;

    UPROPERTY(EditDefaultsOnly)
    USoundAttenuation* FireAttenuation;

public:
    AFirePit()
    {
        // Create the audio component as a default sub-object.
        // Using CreateDefaultSubobject means it's created once at
        // CDO (Class Default Object) time, not every spawn.
        FireAudio = CreateDefaultSubobject<UAudioComponent>(
            TEXT("FireAudio"));
        FireAudio->SetupAttachment(RootComponent);

        // bAutoActivate = false means the sound won't play until
        // we explicitly call Play(). This prevents sounds firing
        // during level load before gameplay systems are ready.
        FireAudio->bAutoActivate = false;
    }

    void Ignite()
    {
        FireAudio->SetSound(FireMetaSound);
        FireAudio->AttenuationSettings = FireAttenuation;
        FireAudio->Play();
    }

    void Extinguish()
    {
        // FadeOut provides a smooth audio transition instead of
        // an abrupt stop, which sounds more natural
        FireAudio->FadeOut(0.5f, 0.0f);
    }
};
```

### Setting MetaSound Parameters from C++

MetaSounds expose **Inputs** that you can drive from gameplay code:

```cpp
// Drive a "Danger" float parameter on a MetaSound to make
// the music more intense as the player takes damage.
void AMyCharacter::UpdateMusicIntensity(float DangerLevel)
{
    if (MusicAudioComponent)
    {
        // SetFloatParameter maps to a Float Input node in the
        // MetaSound graph. The parameter name must match exactly.
        MusicAudioComponent->SetFloatParameter(
            FName("Danger"), DangerLevel);
    }
}
```

## Sound Classes and Sound Mixes

### Sound Classes

Sound Classes categorize audio for volume control (like audio channels in a mixer):

```
Master
├── Music
├── SFX
│   ├── Weapons
│   ├── Footsteps
│   └── Ambient
├── UI
└── Dialogue
```

Assign a Sound Class when playing audio:

```cpp
// Each USoundBase asset can have a SoundClassObject assigned
// in its properties, or you can override at play time.
// This lets players adjust "Music" and "SFX" volumes independently
// in the options menu.
```

### Sound Mixes

Sound Mixes are temporary volume/pitch modifiers applied on top of Sound Classes. Use them for context-dependent ducking:

```cpp
// When the player opens a dialogue, push a mix that ducks music/SFX
void ADialogueManager::StartDialogue()
{
    // Push a Sound Mix that reduces Music to 30% and SFX to 50%
    // while Dialogue stays at 100%
    UGameplayStatics::PushSoundMixModifier(this, DialogueDuckMix);
}

void ADialogueManager::EndDialogue()
{
    // Pop the mix to restore normal volumes
    UGameplayStatics::PopSoundMixModifier(this, DialogueDuckMix);
}
```

## Sound Concurrency

Sound Concurrency limits how many instances of the same sound can play simultaneously. Without it, rapid-fire weapons or footsteps on gravel can spawn dozens of overlapping voices, exhausting the audio engine.

```cpp
// In your USoundConcurrency asset:
// Max Count: 3          — at most 3 instances of this sound
// Resolution Rule: Stop Lowest Priority — oldest/quietest gets killed
// Voice Steal Fadeout Time: 0.05  — short fade to avoid clicks
```

**Rules of thumb:**
- Gunshots: 3–5 concurrent voices
- Footsteps: 2–3
- UI clicks: 1–2
- Ambient loops: 1 per emitter

## MetaSounds Pages (UE 5.5+)

MetaSounds Pages let you create platform-specific variations within a single MetaSound. A page can swap inputs, change node parameters, or simplify the graph for weaker hardware.

**Use case:** On mobile, bypass expensive reverb and use a simpler delay instead; on PC/console, use the full convolution reverb chain.

## Performance Best Practices

### 1. Voice Budget

Set a global voice limit in **Project Settings → Audio → Max Channels** (default 32). The audio engine will automatically cull the least important sounds when the limit is hit.

### 2. Virtualization

UE5's audio engine can **virtualize** sounds — tracking their state without rendering audio. When the listener moves closer, the sound seamlessly resumes. This is far cheaper than rendering inaudible audio.

Enable virtualization on your Attenuation Settings: set `Virtualize when Silent = true`.

### 3. Audio Thread Performance

MetaSounds run entirely on the audio render thread. This is a major performance advantage over Sound Cues, but be aware:
- **Don't block the audio thread** with extremely complex MetaSound graphs (100+ nodes)
- Use **MetaSound Relative Render Cost** (UE 5.5+) to let the engine dynamically scale voice count based on platform capability

### 4. Attenuation Optimization

- Set reasonable **Max Distance** values — sounds beyond this are culled entirely
- Use **Focus** settings to reduce audio quality for sounds behind the listener
- Enable **Air Absorption** sparingly — it adds per-voice FFT cost

### 5. Preloading

For sounds that must play instantly (UI feedback, weapon fire), preload them:

```cpp
// Preload a sound asset to avoid a hitch on first playback.
// This loads the compressed audio data into memory ahead of time.
void AMyGameMode::PreloadCriticalAudio()
{
    if (CriticalSound)
    {
        // LoadObject or preloading via asset manager ensures the
        // data is resident before the first PlaySound call
        CriticalSound->AddToRoot(); // Prevent GC
    }
}
```

## Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| Sound doesn't attenuate | Ensure you assigned an Attenuation Settings asset |
| Voice count exhaustion | Set Sound Concurrency limits on frequent sounds |
| Audio hitch on first play | Preload critical sounds during level load |
| MetaSound not finishing | Connect `On Finished` output to the interface's On Finished |
| Sound plays during load | Set `bAutoActivate = false` on AudioComponents |
| Mixing imbalance | Use Sound Classes with player-adjustable volume sliders |

## Further Reading

- [Epic: MetaSounds in UE](https://dev.epicgames.com/documentation/en-us/unreal-engine/metasounds-in-unreal-engine)
- [Epic: MetaSounds Quick Start](https://dev.epicgames.com/documentation/en-us/unreal-engine/metasounds-quick-start)
- [Epic: MetaSounds Reference Guide](https://dev.epicgames.com/documentation/en-us/unreal-engine/metasounds-reference-guide-in-unreal-engine)
- [UE 5.5 Audio Updates (CDM)](https://cdm.link/unreal-engine-5-5-for-sound/)
