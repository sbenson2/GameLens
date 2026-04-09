# G23 — Timeline & Cinematic Sequencing in Unity 6

> **Category:** guide · **Engine:** Unity 6 (6000.x, Timeline 1.8+) · **Related:** [G7 Animation System](G7_animation_system.md) · [G4 Audio System](G4_audio_system.md) · [G20 Cinemachine Camera Systems](G20_cinemachine_camera_systems.md) · [Unity Rules](../unity-arch-rules.md)

Unity Timeline (`com.unity.timeline`) is a visual sequencing tool for authoring cutscenes, gameplay sequences, audio compositions, and complex particle choreography. It replaces ad-hoc coroutine chains with a declarative, scrubable timeline where every track, clip, and marker is data — rewindable in the Editor, serializable as an asset, and triggerable from code. This guide covers the full architecture, every built-in track type, the Signal system for gameplay integration, custom tracks, and production patterns for shipping cutscenes.

---

## Why Timeline?

Before Timeline, cutscenes in Unity typically meant:

- **Coroutine spaghetti** — `yield return new WaitForSeconds(2f)` chains that can't be previewed, scrubbed, or edited by non-programmers
- **Animation-only workflows** — Animator state machines are great for character states, but poor for orchestrating multi-object sequences with audio, cameras, and particles
- **No visual authoring** — designers had to rely on engineers for every timing tweak

Timeline solves this by providing a non-linear editing (NLE) interface directly in the Unity Editor, where designers can drag clips, adjust timing, and preview results in real time — without writing code.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│               Timeline Asset (.playable)             │
│                                                       │
│  Contains: Track definitions, clip data, markers     │
│  Lives in: Project as a reusable ScriptableObject    │
│  Shared across: Multiple scenes / GameObjects        │
└──────────────────────┬──────────────────────────────┘
                       │  referenced by
                       ▼
┌─────────────────────────────────────────────────────┐
│          PlayableDirector (MonoBehaviour)             │
│                                                       │
│  Bindings: Maps abstract tracks → scene objects      │
│  Controls: Play, Pause, Stop, Resume, time, speed    │
│  Wrap Mode: None, Loop, Hold                         │
│  Update Method: GameTime, UnscaledGameTime, Manual   │
└──────────────────────┬──────────────────────────────┘
                       │  drives
                       ▼
┌─────────────────────────────────────────────────────┐
│            Playable Graph (Runtime)                   │
│                                                       │
│  Built from the asset at runtime. Evaluates tracks   │
│  in parallel. Each track outputs a Playable that     │
│  feeds the Unity Playable system.                    │
└─────────────────────────────────────────────────────┘
```

### Key Separation: Asset vs Instance

A **Timeline Asset** is a reusable template — it defines tracks, clips, and timing but contains no references to specific scene objects. A **Timeline Instance** is created when a PlayableDirector references that asset and binds its tracks to concrete GameObjects. This lets you reuse the same cutscene asset across multiple scenes with different actors.

---

## The PlayableDirector Component

The `PlayableDirector` is the bridge between your Timeline asset and the scene.

```csharp
using UnityEngine;
using UnityEngine.Playables;
using UnityEngine.Timeline;

public class CutsceneManager : MonoBehaviour
{
    [SerializeField] private PlayableDirector director;

    void Start()
    {
        // Subscribe to lifecycle events
        director.played += OnCutscenePlayed;
        director.paused += OnCutscenePaused;
        director.stopped += OnCutsceneStopped;
    }

    public void PlayCutscene()
    {
        // Play from the beginning
        director.time = 0;
        director.Play();
    }

    public void SkipCutscene()
    {
        // Jump to end — useful for skip buttons
        director.time = director.duration;
        director.Evaluate(); // Force evaluation at this time
        director.Stop();
    }

    private void OnCutscenePlayed(PlayableDirector d)
    {
        // Disable player input during cutscene
        Debug.Log("Cutscene started — disabling player controls");
    }

    private void OnCutsceneStopped(PlayableDirector d)
    {
        // Re-enable player input
        Debug.Log("Cutscene ended — restoring player controls");
    }

    private void OnCutscenePaused(PlayableDirector d) { }
}
```

### Update Modes

| Mode | Time Source | Use Case |
|------|-----------|----------|
| `GameTime` | `Time.time` | Standard cutscenes — respects `Time.timeScale` so they slow/pause with gameplay |
| `UnscaledGameTime` | `Time.unscaledTime` | UI sequences, pause-menu animations — ignores `timeScale` |
| `Manual` | You call `director.Evaluate()` | Frame-by-frame control, replay systems, or syncing to external clocks |

---

## Built-In Track Types

### Animation Track

Drives an `Animator` component. You can drag existing AnimationClips onto the track, or record new animations in-place.

- **Blending**: Overlapping clips crossfade automatically — the overlap region defines the blend duration
- **Avatar Masks**: Apply masks to tracks to animate only upper body / lower body independently
- **Override Tracks**: Sub-tracks that layer on top of the parent, enabling additive animations (e.g., a "breathing" layer over a walk cycle)
- **Root Motion**: Controlled per-clip; enable "Apply Track Offsets" to maintain continuity between clips

```
Timeline:
  ├── Animation Track (Character_Animator)
  │     ├── [Idle_clip]────[Walk_clip]────[Sit_clip]
  │     └── Override Track (Upper Body Mask)
  │           └── [Wave_clip]
```

### Audio Track

Plays `AudioClip` assets through an `AudioSource` component.

- **Waveform Preview**: Shows the audio waveform directly in the Timeline for visual sync
- **Volume & Pitch Curves**: Right-click a clip to edit easing curves for fade-in / fade-out
- **Spatial Audio**: The bound `AudioSource` handles 3D spatialization — Timeline just controls timing and volume
- **Multiple Tracks**: Use separate audio tracks for dialogue, SFX, and music to control independently

### Activation Track

Toggles a GameObject's active state over a time range.

- **Active during clip**: The bound GameObject is `SetActive(true)` while the clip is playing, `SetActive(false)` otherwise
- **Post-playback state**: Configure whether the object stays active, reverts, or uses the state from before the Timeline started
- Use for: showing/hiding VFX, UI overlays, trigger volumes, temporary lights

### Signal Track

The communication bridge between Timeline and your game systems.

```csharp
// 1. Create a SignalAsset (ScriptableObject) in the Project:
//    Right-click → Create → Signal

// 2. On the Timeline, add a Signal Track and place Signal Emitters
//    at the desired times, referencing your SignalAsset

// 3. On the bound GameObject, add a SignalReceiver component
//    and map each signal to a UnityEvent

// Example: triggering dialogue from a cutscene signal
public class DialogueSignalHandler : MonoBehaviour
{
    // Called by SignalReceiver's UnityEvent when the signal fires
    public void OnDialogueSignal()
    {
        DialogueManager.Instance.ShowNext();
    }

    public void OnScreenShake()
    {
        // Trigger screen shake at an exact frame in the cutscene
        CameraShaker.Instance.Shake(intensity: 0.5f, duration: 0.3f);
    }
}
```

Signals are the recommended way to trigger gameplay events at precise moments in a cutscene — they're cleaner than Animation Events and more explicit than checking `director.time` in Update.

### Control Track

Takes control of time-related elements on a child GameObject:

- **Nested PlayableDirectors**: Play a sub-timeline (e.g., a reusable "explosion sequence") at a specific point
- **Particle Systems**: Start / stop particle effects synchronized to the cutscene
- **Prefab Instances**: Spawn a prefab at clip start, destroy it at clip end
- **Speed control**: The parent timeline controls the child's time progression

### Playable Track

Hosts custom `PlayableAsset` / `PlayableBehaviour` clips — this is the extension point for custom track logic (see Custom Tracks below).

---

## Cinemachine Integration

Timeline and Cinemachine are designed to work together. When the Cinemachine package is installed, Timeline gains a **Cinemachine Track** that controls which virtual camera is live at any given moment.

```
Timeline:
  ├── Cinemachine Track (CinemachineBrain)
  │     ├── [VCam_Wide]──blend──[VCam_CloseUp]──blend──[VCam_OverShoulder]
  │
  ├── Animation Track (Character)
  │     └── [Dialogue_anim]──────────────────────────────
  │
  ├── Audio Track (Dialogue AudioSource)
  │     └── [Voiceline_01.wav]─────[Voiceline_02.wav]──
  │
  └── Signal Track (Events)
        └── ●[StartDialogue]──────●[EndDialogue]────────
```

- **Blending**: Overlap two Cinemachine clips to create a camera blend — the overlap duration becomes the blend time
- **Cinemachine 3.x** (Unity 6): Use `CinemachineCamera` components. The Cinemachine Track binds to a `CinemachineBrain`
- **Look-at and Follow targets** are set on the virtual cameras, not in the timeline — the timeline only controls *which* camera is active

---

## Custom Tracks and Clips

When built-in tracks aren't enough, Timeline's extensibility model lets you create custom tracks.

```csharp
using UnityEngine;
using UnityEngine.Playables;
using UnityEngine.Timeline;

// Step 1: Define the clip data (serialized settings)
[System.Serializable]
public class SubtitleClip : PlayableAsset, ITimelineClipAsset
{
    public string subtitleText;
    public Color textColor = Color.white;

    // Declare supported clip features
    public ClipCaps clipCaps => ClipCaps.Blending;

    public override Playable CreatePlayable(PlayableGraph graph, GameObject owner)
    {
        var playable = ScriptPlayable<SubtitleBehaviour>.Create(graph);
        var behaviour = playable.GetBehaviour();
        behaviour.subtitleText = subtitleText;
        behaviour.textColor = textColor;
        return playable;
    }
}

// Step 2: Define the runtime behaviour
[System.Serializable]
public class SubtitleBehaviour : PlayableBehaviour
{
    public string subtitleText;
    public Color textColor;

    // Called each frame the clip is active
    public override void ProcessFrame(Playable playable, FrameData info, object playerData)
    {
        // playerData is the bound object from the track binding
        var subtitleUI = playerData as SubtitleDisplay;
        if (subtitleUI == null) return;

        // info.weight handles blending between overlapping clips
        float alpha = info.weight;
        subtitleUI.SetSubtitle(subtitleText, textColor, alpha);
    }
}

// Step 3: Define the track (tells Timeline what clip type it holds)
[TrackColor(0.9f, 0.8f, 0.2f)] // Yellow in the Timeline window
[TrackClipType(typeof(SubtitleClip))]
[TrackBindingType(typeof(SubtitleDisplay))] // What this track binds to
public class SubtitleTrack : TrackAsset { }
```

This pattern gives you:
- **Visual authoring** — drag subtitle clips onto the timeline, set text in the Inspector
- **Blending** — overlapping clips fade smoothly via `info.weight`
- **Data-driven** — the subtitle text, color, and timing are all serialized in the asset

---

## Production Patterns

### Pattern 1: Cutscene-Per-Prefab

Keep each cutscene as a self-contained prefab with its own PlayableDirector, cameras, and actors.

```
Assets/
  Cutscenes/
    Intro/
      Intro_Timeline.playable    ← Timeline asset
      Intro_Prefab.prefab        ← Contains Director + bindings
    BossFight/
      Boss_Timeline.playable
      Boss_Prefab.prefab
```

This keeps cutscenes modular and avoids polluting your gameplay scenes with cutscene-only objects.

### Pattern 2: Additive Scene Loading

For complex cutscenes with many unique assets:

```csharp
// Load cutscene scene additively, play it, then unload
public async void PlayCutsceneScene(string sceneName)
{
    var op = SceneManager.LoadSceneAsync(sceneName, LoadSceneMode.Additive);
    await op; // or use a coroutine

    var director = FindObjectOfType<PlayableDirector>();
    director.stopped += (_) => SceneManager.UnloadSceneAsync(sceneName);
    director.Play();
}
```

### Pattern 3: Skip Support

Every shipped cutscene should be skippable. The simplest reliable approach:

```csharp
public void SkipToEnd()
{
    // Jump to the last frame and evaluate so all signals fire
    director.time = director.duration;
    director.Evaluate();
    director.Stop();

    // Manually trigger any critical end-state signals
    // that must fire even when skipping
    OnCutsceneComplete();
}
```

> **Warning**: Skipping does NOT fire intermediate signals. If your cutscene signals trigger state changes (e.g., unlocking a door at the 30-second mark), you need to handle those in your skip logic.

---

## Common Pitfalls

| Pitfall | Why It Happens | Fix |
|---------|----------------|-----|
| **Animator state resets after Timeline stops** | Timeline takes full control of the Animator during playback | Set the Director's wrap mode to **Hold** to keep the final pose |
| **Audio doesn't play in builds** | The bound `AudioSource` reference is lost | Ensure PlayableDirector bindings are set in the prefab, not just the scene |
| **Signals fire multiple times** | Timeline loops and re-triggers | Guard signal handlers with a `bool hasFired` flag or use Director wrap mode **None** |
| **Performance spikes on Play** | Timeline builds its Playable Graph on first play | Call `director.RebuildGraph()` during a loading screen, or pre-warm with `director.Evaluate()` |
| **Can't scrub in Play mode** | The Director is controlling time | Set Update Method to **Manual** and drive `director.time` yourself |

---

## Performance Considerations

- **Graph building cost**: The Playable Graph is allocated when the Director first plays. For complex timelines (20+ tracks), pre-build during loading
- **Track count**: Each track adds to the graph's evaluation cost per frame. Disable tracks you don't need via `track.muted = true` in the Timeline window
- **Audio memory**: Audio clips on the Timeline load into memory when the Director is active. Use `AudioClip.LoadInBackground` for large voiceover files
- **Animator evaluation**: Animation tracks evaluate the full Animator each frame — combine with Animator Culling to skip off-screen characters

---

## Quick Reference: When to Use What

| Need | Tool |
|------|------|
| Orchestrate multiple objects over time | **Timeline** |
| Control a single character's state machine | **Animator** |
| Dynamic camera blending during gameplay | **Cinemachine** (standalone) |
| Scripted camera sequence in a cutscene | **Cinemachine + Timeline** |
| One-off sound effect at a moment | **AudioSource.PlayOneShot** |
| Synchronized audio with visual sequence | **Timeline Audio Track** |
| Trigger a gameplay event at a specific frame | **Signal Track** |
| Complex animation blending / IK | **Animation Rigging + Timeline** |
