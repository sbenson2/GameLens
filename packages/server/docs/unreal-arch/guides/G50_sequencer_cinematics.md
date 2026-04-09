# G50 — Sequencer & Cinematics

> **Category:** guide · **Engine:** Unreal Engine 5.5+ · **Related:** [G4 Animation System](G4_animation_system.md) · [G9 Rendering — Nanite & Lumen](G9_rendering_nanite_lumen.md) · [G24 MetaSounds Audio Engine](G24_metasounds_audio_engine.md)

The **Sequencer** is Unreal Engine's non-linear cinematic editor for creating in-game cutscenes, trailers, and gameplay-driven camera sequences. It replaces the deprecated Matinee system and integrates tightly with the Level Sequence asset type, Camera Actors, skeletal animation, audio, and the Movie Render Queue for offline rendering. UE 5.5+ introduces improved Cinematic Assembly tools and better integration with MetaHuman rigs.

---

## Core Concepts

### Level Sequences vs. Master Sequences

A **Level Sequence** (`ULevelSequence`) is the fundamental Sequencer asset. It contains tracks that animate actors, cameras, and properties over time within a `UMovieScene`.

A **Master Sequence** composes multiple Level Sequences into a single timeline — useful for organizing complex cinematics into shots.

```
Master Sequence (acts as a container)
├── Shot_010  (Level Sequence — establishing wide)
├── Shot_020  (Level Sequence — close-up dialogue)
├── Shot_030  (Level Sequence — action beat)
└── Shot_040  (Level Sequence — resolution)
```

### Possessables vs. Spawnables

| Concept | What It Means | When to Use |
|---|---|---|
| **Possessable** | References an actor already placed in the level | Cutscenes that animate existing level actors |
| **Spawnable** | Sequencer spawns and owns the actor | Self-contained cinematics that don't depend on level placement |

Spawnables are stored inside the Level Sequence asset and are created/destroyed with playback, making them portable across levels.

---

## C++ Playback API

### Module Dependencies

Add these to your module's `.Build.cs`:

```csharp
// WHY: LevelSequence provides the sequence player and actor classes.
// MovieScene provides the underlying timeline/track data structures.
PublicDependencyModuleNames.AddRange(new string[]
{
    "LevelSequence",
    "MovieScene"
});

// WHY: MovieRenderPipelineCore is only needed if you trigger
// offline rendering from C++. Keep it private to avoid transitive deps.
PrivateDependencyModuleNames.Add("MovieRenderPipelineCore");
```

### Playing a Sequence at Runtime

```cpp
#include "LevelSequenceActor.h"
#include "LevelSequencePlayer.h"
#include "MovieSceneSequencePlaybackSettings.h"

// WHY: CreateLevelSequencePlayer is the canonical factory for runtime playback.
// It spawns the ALevelSequenceActor and returns the player in one call.
void AMyGameMode::PlayIntroCinematic()
{
    FMovieSceneSequencePlaybackSettings Settings;
    Settings.bAutoPlay = false;           // We'll call Play() manually
    Settings.bPauseAtEnd = true;          // Hold on last frame
    Settings.LoopCount.Value = 0;         // 0 = play once, -1 = loop forever
    Settings.PlayRate = 1.0f;
    Settings.bDisableMovementInput = true; // Block player input during cinematic
    Settings.bDisableLookAtInput = true;

    ALevelSequenceActor* SeqActor = nullptr;

    ULevelSequencePlayer* Player = ULevelSequencePlayer::CreateLevelSequencePlayer(
        GetWorld(),
        IntroCinematicSequence,  // UPROPERTY: TSoftObjectPtr<ULevelSequence>
        Settings,
        SeqActor                 // Output: the spawned sequence actor
    );

    if (Player)
    {
        // WHY: Bind to OnFinished so we can re-enable input and transition
        // to gameplay after the cinematic completes.
        Player->OnFinished.AddDynamic(this, &AMyGameMode::OnIntroCinematicFinished);
        Player->Play();
    }
}

void AMyGameMode::OnIntroCinematicFinished()
{
    // Re-enable input, start gameplay, etc.
}
```

### Controlling Playback

```cpp
// WHY: GetSequencePlayer() is the correct accessor since UE 5.4.
// The raw SequencePlayer property is deprecated.
ULevelSequencePlayer* Player = SeqActor->GetSequencePlayer();

Player->Play();                              // Play forward
Player->PlayReverse();                       // Play backward
Player->Pause();                             // Pause at current frame
Player->GoToEndAndStop();                    // Jump to last frame
Player->SetPlayRate(0.5f);                   // Slow-motion (independent of time dilation)
Player->SetPlaybackPosition(                 // Scrub to specific time
    FMovieSceneSequencePlaybackParams(
        FFrameTime(FFrameNumber(120)),       // Frame 120
        EUpdatePositionMethod::Scrub
    )
);
```

---

## Cine Camera Actor

The `ACineCameraActor` provides physically accurate camera simulation with real-world lens and filmback properties.

### Key Properties

| Property | Type | Description |
|---|---|---|
| `CurrentFocalLength` | `float` | Lens focal length in mm (e.g., 35mm, 50mm, 85mm) |
| `CurrentAperture` | `float` | f-stop for depth of field (lower = shallower DOF) |
| `FocusSettings` | `FCameraFocusSettings` | Manual, tracking, or no focus mode |
| `Filmback` | `FCameraFilmbackSettings` | Sensor size — controls FOV for a given focal length |

### Creating a Cine Camera in C++

```cpp
#include "CineCameraActor.h"
#include "CineCameraComponent.h"

ACineCameraActor* Camera = GetWorld()->SpawnActor<ACineCameraActor>(
    ACineCameraActor::StaticClass(),
    SpawnLocation,
    SpawnRotation
);

UCineCameraComponent* CineComp = Camera->GetCineCameraComponent();
CineComp->CurrentFocalLength = 50.0f;   // 50mm lens — natural perspective
CineComp->CurrentAperture = 2.8f;       // Shallow DOF for close-ups
CineComp->FocusSettings.FocusMethod = ECameraFocusMethod::Tracking;
CineComp->FocusSettings.TrackingFocusSettings.ActorToTrack = TargetActor;
```

---

## Event Tracks — Triggering Gameplay from Sequences

Event Tracks let you fire Blueprint or C++ events at specific frames during playback. This is the recommended way to synchronize gameplay with cinematics.

### Blueprint Workflow

1. Add an **Event Track** to any actor in the Sequence.
2. Add a key at the desired frame.
3. Open the **Director Blueprint** (Sequencer's built-in Blueprint layer).
4. Implement the event — call functions on the bound actor or world.

### C++ Event Receiver

```cpp
// WHY: The Director Blueprint calls into C++ via BlueprintCallable functions
// on the bound actor. This keeps the heavy logic in C++ while letting
// designers place the timing in Sequencer.
UCLASS()
class MYGAME_API ADialogueNPC : public ACharacter
{
    GENERATED_BODY()

public:
    // Called from the Sequencer Director Blueprint at a keyed frame
    UFUNCTION(BlueprintCallable, Category = "Cinematic")
    void StartDialogueLine(int32 LineIndex);

    UFUNCTION(BlueprintCallable, Category = "Cinematic")
    void TriggerExplosionEffect();
};
```

---

## Camera Cuts Track

The **Camera Cuts Track** switches the active camera during a sequence. It is the top-level track that controls which Cine Camera Actor (or Camera Component) the player views through.

Best practices:

- One Camera Cuts Track per Level Sequence — it defines the "edit" of the cinematic.
- Each key on the track references a camera actor within the sequence.
- Use **blending** between cuts for smooth transitions (pillow dissolves, fades).
- In Master Sequences, each shot sub-sequence typically has its own camera and Camera Cuts Track.

---

## Movie Render Queue — Offline Rendering

The **Movie Render Queue** (MRQ) is Unreal's production-quality offline renderer, replacing the legacy Movie Scene Capture system. It supports temporal anti-aliasing accumulation, high sample counts, and output to EXR, PNG, or video formats.

### Key Classes

| Class | Role |
|---|---|
| `UMoviePipelineQueue` | Holds a list of jobs to render |
| `UMoviePipelineExecutorBase` | Abstract executor — decides how/where rendering happens |
| `UMoviePipelineInProcessExecutor` | Renders in the current editor/game process |
| `UMoviePipelinePIEExecutor` | Renders in a PIE session |
| `UMovieRenderPipelineSettings` | Per-job render configuration |

### Triggering MRQ from C++

```cpp
#include "MoviePipelineQueue.h"
#include "MoviePipelineInProcessExecutor.h"

// WHY: Programmatic MRQ triggering is useful for automated content pipelines —
// e.g., rendering all cutscenes in a CI build or generating trailer footage.
void URenderAutomation::RenderAllCinematics(const TArray<ULevelSequence*>& Sequences)
{
    UMoviePipelineQueue* Queue = NewObject<UMoviePipelineQueue>(this);

    for (ULevelSequence* Seq : Sequences)
    {
        UMoviePipelineExecutorJob* Job = Queue->AllocateNewJob(
            UMoviePipelineExecutorJob::StaticClass());
        Job->Sequence = FSoftObjectPath(Seq);
        Job->Map = FSoftObjectPath(GetWorld()->GetCurrentLevel()->GetOutermost());

        // Add output settings — EXR for compositing
        // Configure anti-aliasing, spatial/temporal sample counts, etc.
    }

    UMoviePipelineInProcessExecutor* Executor =
        NewObject<UMoviePipelineInProcessExecutor>(this);
    Executor->Execute(Queue);
}
```

---

## Sequencer Workflow Best Practices

### Organize with Master Sequences

Break complex cinematics into individual shot sequences composed in a Master Sequence. This enables parallel work — one artist per shot — and non-destructive editing of the overall timeline.

### Use Sub-Sequences for Reusable Animation

Extract reusable animations (idle loops, common transitions) into their own Level Sequences and reference them via the **Subsequence Track**. Changes propagate to every cinematic that uses them.

### Cinematic Assembly Tips (UE 5.5+)

- **Track Groups**: Organize tracks by function (cameras, characters, FX, audio) for readability.
- **Curve Editor**: Fine-tune animation curves for natural easing — avoid linear interpolation for camera moves.
- **Pre-roll / Post-roll**: Give animations a few frames of pre-roll for physics and cloth simulation to settle before the visible cut starts.
- **Audio Sync**: Use the Audio Track to scrub audio waveforms directly in the timeline. MetaSounds integration (UE 5.5+) allows parameter-driven audio synchronized to sequence events.

### Performance in Gameplay Sequences

```cpp
// WHY: Gameplay cinematics run in real-time, not offline.
// Budget carefully — disable expensive post-process when not needed.
FMovieSceneSequencePlaybackSettings Settings;
Settings.bRestoreState = true;  // Restore actor state after sequence ends

// For gameplay sequences, consider:
// - Limiting Cine Camera DOF quality (r.DOF.Gather.RingCount)
// - Using camera cut fades to hide streaming/loading
// - Keeping sequences short (< 30 seconds) to maintain player engagement
```

---

## Common Pitfalls

1. **Using deprecated SequencePlayer property** — always call `GetSequencePlayer()` on `ALevelSequenceActor` (UE 5.4+).
2. **Forgetting to add module dependencies** — `LevelSequence` and `MovieScene` modules must be in your Build.cs or you get linker errors.
3. **Hard-referencing sequence assets** — use `TSoftObjectPtr<ULevelSequence>` to avoid loading all cinematic assets at startup.
4. **Not binding OnFinished** — if you disable input during a cinematic, always have a path to re-enable it when the sequence ends or is skipped.
5. **Ignoring bRestoreState** — without it, actors animated by the sequence remain in their final cinematic pose instead of returning to their gameplay state.
6. **Camera cuts with no blend** — hard cuts look jarring in gameplay; use short blends (0.25–0.5s) for smoother transitions.
