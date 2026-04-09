# G06 — Animation System

> **Category:** Guide · **Engine:** Stride · **Related:** [G01 Getting Started](./G01_getting_started.md) · [G02 Bepu Physics](./G02_bepu_physics.md) · [Stride Architecture Rules](../stride-arch-rules.md)

Stride's animation system handles skeletal animation, property animation, blending, crossfading, additive layers, and procedural animation — all through the `AnimationComponent` API. Animations are defined as clips containing curves, where each curve maps a keyframe timeline to a property path (bone transform, light color, material parameter, etc.). This guide covers the full animation pipeline from importing clips to building runtime blend trees and procedural motion.

---

## Table of Contents

1. [Architecture Overview](#1--architecture-overview)
2. [Animation Clips and Curves](#2--animation-clips-and-curves)
3. [AnimationComponent API](#3--animationcomponent-api)
4. [Playing Animations](#4--playing-animations)
5. [Crossfading](#5--crossfading)
6. [Blending and Additive Layers](#6--blending-and-additive-layers)
7. [Playback Control](#7--playback-control)
8. [Animation Scripts Pattern](#8--animation-scripts-pattern)
9. [Procedural Animation](#9--procedural-animation)
10. [Animation Events and Callbacks](#10--animation-events-and-callbacks)
11. [Root Motion](#11--root-motion)
12. [Performance Considerations](#12--performance-considerations)
13. [Common Pitfalls](#13--common-pitfalls)

---

## 1 — Architecture Overview

Stride's animation pipeline has three layers:

- **Animation Clips** — Data assets containing curves (keyframes over time) for any animatable property. Imported from FBX/glTF or created in code.
- **AnimationComponent** — The entity component that holds a dictionary of named clips and manages a runtime blend stack of `PlayingAnimation` instances.
- **Animation Processor** — The engine system that evaluates the blend stack each frame, interpolates curves, and writes results to entity properties (transforms, material params, etc.).

### How It Works

```
AnimationClip ("Walk")        AnimationClip ("Run")
    │                              │
    ▼                              ▼
┌─────────────────────────────────────────┐
│          AnimationComponent              │
│  Blend Stack:                            │
│   [0] Walk  weight=0.3  LinearBlend      │
│   [1] Run   weight=0.7  LinearBlend      │
└─────────────────────────────────────────┘
    │
    ▼
Animation Processor evaluates & blends
    │
    ▼
Skeleton bones / TransformComponent / properties updated
```

### Comparison with MonoGame

| Aspect | Stride | MonoGame/FNA |
|--------|--------|-------------|
| Built-in animation | Full system with blending | None — implement from scratch |
| Skeletal animation | Import from FBX/glTF, auto-skinning | Manual skeleton + skinning code |
| Property animation | Animate any component property by path | N/A |
| Blend trees | Runtime blend stack with weights | N/A |
| Editor support | Animation preview in Game Studio | N/A |

## 2 — Animation Clips and Curves

An `AnimationClip` contains one or more curves. Each curve maps a **property path** to a set of **keyframes** with interpolation.

### Curve Interpolation Types

| Mode | Behavior | Use Case |
|------|----------|----------|
| Linear | Straight line between keyframes | Smooth motion, light color changes |
| Cubic | Bezier curve through keyframes | Organic motion, camera paths |
| Constant | Jump to next value, no interpolation | Sprite frame switching, on/off toggles |

### Property Path Format

Curves target properties via a string path that navigates the component hierarchy:

```
[TransformComponent.Key].Position        → Entity's local position
[TransformComponent.Key].Rotation        → Entity's local rotation (Quaternion)
[TransformComponent.Key].Scale           → Entity's local scale
[LightComponent.Key].Type.(ColorLightBase)Color.(ColorRgbProvider)Value → Light color
[ModelComponent.Key].Materials[0].Passes[0].Parameters.MyParam → Material parameter
```

For skeletal animation, bone curves use the skeleton's bone hierarchy path — these are set up automatically when importing FBX/glTF animations through the asset pipeline.

### Importing Animations

In Game Studio:

1. Import an FBX or glTF file containing animations
2. Stride creates `AnimationClip` assets for each take/action in the file
3. The model's skeleton is matched to clip curves automatically
4. Assign clips to the `AnimationComponent`'s `Animations` dictionary in the property grid

## 3 — AnimationComponent API

The `AnimationComponent` is the primary interface for animation playback. Add it to any entity with a `ModelComponent` (for skeletal animation) or use it standalone for property animation.

### Key Properties

| Property | Type | Description |
|----------|------|-------------|
| `Animations` | `Dictionary<string, AnimationClip>` | Named clip library — populated in editor or code |
| `PlayingAnimations` | `IList<PlayingAnimation>` | Current blend stack (read-only enumeration) |

### Core Methods

```csharp
// Play — instantly replaces all current animations
PlayingAnimation Play(string name)

// Crossfade — blend from current animation(s) to a new one over time
PlayingAnimation Crossfade(string name, TimeSpan fadeTimeSpan)

// Blend — add a new animation at a target weight, fading in over time
PlayingAnimation Blend(string name, float desiredWeight, TimeSpan fadeTimeSpan)

// Add — add a clip to the blend stack with full parameter control
PlayingAnimation Add(
    AnimationClip clip,
    double startTime = 0,
    AnimationBlendOperation blend = AnimationBlendOperation.LinearBlend,
    float timeScale = 1f,
    float weight = 1f,
    AnimationRepeatMode? repeatMode = null
)

// IsPlaying — check if a named animation is in the blend stack
bool IsPlaying(string name)

// Ended — await completion of a playing animation (for AsyncScript)
Task Ended(PlayingAnimation animation)
```

### PlayingAnimation Properties

Each `PlayingAnimation` in the blend stack exposes runtime control:

| Property | Type | Description |
|----------|------|-------------|
| `Weight` | `float` | Blend weight (0.0–1.0) |
| `TimeFactor` | `float` | Playback speed multiplier (1.0 = normal, 0.5 = half speed, -1.0 = reverse) |
| `CurrentTime` | `TimeSpan` | Current playback position |
| `RepeatMode` | `AnimationRepeatMode` | `PlayOnce`, `LoopInfinite` |
| `BlendOperation` | `AnimationBlendOperation` | `LinearBlend`, `Add` |
| `IsPlaying` | `bool` | Whether this animation is active |

## 4 — Playing Animations

### Simple Playback

```csharp
public class SimpleAnimator : SyncScript
{
    private AnimationComponent anim;

    public override void Start()
    {
        anim = Entity.Get<AnimationComponent>();

        // Play immediately — stops all other animations
        anim.Play("Idle");
    }

    public override void Update()
    {
        if (Input.IsKeyPressed(Keys.Space))
        {
            anim.Play("Jump");
        }
    }
}
```

### Guarded Playback (Avoid Restarting)

```csharp
private void PlayIfNotPlaying(string name)
{
    if (!anim.IsPlaying(name))
    {
        anim.Play(name);
    }
}
```

`Play()` restarts the animation from the beginning every time it is called. Without the `IsPlaying()` guard, calling `Play("Walk")` every frame would reset the walk animation to frame 0 each frame, resulting in a frozen first frame.

## 5 — Crossfading

Crossfade smoothly transitions from the current animation(s) to a new one over a specified duration:

```csharp
public class CharacterAnimator : SyncScript
{
    private AnimationComponent anim;
    private string currentState = "Idle";

    public override void Start()
    {
        anim = Entity.Get<AnimationComponent>();
        anim.Play("Idle");
    }

    public override void Update()
    {
        string newState = DetermineState();

        if (newState != currentState)
        {
            // Crossfade over 200ms
            anim.Crossfade(newState, TimeSpan.FromMilliseconds(200));
            currentState = newState;
        }
    }

    private string DetermineState()
    {
        float speed = GetMovementSpeed();
        if (speed < 0.1f) return "Idle";
        if (speed < 3.0f) return "Walk";
        return "Run";
    }

    private float GetMovementSpeed() => /* movement system */ 0f;
}
```

### How Crossfade Works Internally

When you call `Crossfade("Run", 200ms)`:

1. All existing animations begin fading their weight toward 0 over 200ms
2. "Run" is added to the blend stack with weight starting at 0, fading toward 1.0
3. During the 200ms transition, both old and new animations contribute to the pose
4. After 200ms, old animations are removed from the blend stack

## 6 — Blending and Additive Layers

### Weight-Based Blending

`Blend()` adds an animation at a target weight without removing existing ones — useful for locomotion blend spaces:

```csharp
// Blend walk and run based on speed
public override void Update()
{
    float speed = GetMovementSpeed();
    float runBlend = MathUtil.Clamp((speed - 2f) / 3f, 0f, 1f);

    // Ensure both animations are playing
    if (!anim.IsPlaying("Walk"))
        anim.Blend("Walk", 1f - runBlend, TimeSpan.FromMilliseconds(100));
    if (!anim.IsPlaying("Run"))
        anim.Blend("Run", runBlend, TimeSpan.FromMilliseconds(100));

    // Update weights each frame
    foreach (var playing in anim.PlayingAnimations)
    {
        if (playing.Name == "Walk")
            playing.Weight = 1f - runBlend;
        else if (playing.Name == "Run")
            playing.Weight = runBlend;
    }
}
```

### Additive Animation

Additive animations layer on top of the base pose — for breathing, hit reactions, or aiming offsets:

```csharp
// Add a breathing animation on top of any base animation
var breathing = anim.Add(
    breathingClip,
    startTime: 0,
    blend: AnimationBlendOperation.Add,  // Additive, not replace
    timeScale: 1f,
    weight: 0.3f,                         // Subtle overlay
    repeatMode: AnimationRepeatMode.LoopInfinite
);
```

### AnimationBlendOperation Values

| Value | Behavior |
|-------|----------|
| `LinearBlend` | Weighted average of all animations at this level (default) |
| `Add` | Adds this animation's delta on top of the current blended result |

## 7 — Playback Control

### Speed Control

```csharp
var playing = anim.Play("Walk");

// Slow motion
playing.TimeFactor = 0.5f;

// Double speed
playing.TimeFactor = 2.0f;

// Reverse playback
playing.TimeFactor = -1.0f;

// Pause
playing.TimeFactor = 0.0f;
```

### Seeking

```csharp
// Jump to a specific time
playing.CurrentTime = TimeSpan.FromSeconds(1.5);

// Jump to normalized position (0.0 = start, 1.0 = end)
playing.CurrentTime = TimeSpan.FromTicks(
    (long)(playing.Clip.Duration.Ticks * 0.5) // 50% through
);
```

### Repeat Modes

```csharp
// Play once and stop at the last frame
playing.RepeatMode = AnimationRepeatMode.PlayOnce;

// Loop forever
playing.RepeatMode = AnimationRepeatMode.LoopInfinite;
```

### Awaiting Completion (AsyncScript)

In an `AsyncScript`, await the end of a one-shot animation:

```csharp
public class CutsceneAnimator : AsyncScript
{
    public override async Task Execute()
    {
        var anim = Entity.Get<AnimationComponent>();

        // Play intro animation and wait for it to finish
        var intro = anim.Play("IntroSequence");
        intro.RepeatMode = AnimationRepeatMode.PlayOnce;
        await anim.Ended(intro);

        // Intro is done — transition to idle
        anim.Crossfade("Idle", TimeSpan.FromMilliseconds(300));
    }
}
```

## 8 — Animation Scripts Pattern

A common pattern for character animation is a state-machine-driven script that crossfades between states:

```csharp
public class CharacterAnimationController : SyncScript
{
    public float WalkSpeedThreshold { get; set; } = 0.5f;
    public float RunSpeedThreshold { get; set; } = 3.0f;
    public float CrossfadeDuration { get; set; } = 0.2f;

    private AnimationComponent anim;
    private string currentAnim = "";

    public override void Start()
    {
        anim = Entity.Get<AnimationComponent>();
        TransitionTo("Idle");
    }

    public override void Update()
    {
        float speed = GetCharacterSpeed();
        bool isGrounded = IsCharacterGrounded();
        bool isAttacking = IsAttackTriggered();

        // Determine target animation
        string target;
        if (!isGrounded)
            target = "Fall";
        else if (isAttacking)
            target = "Attack";
        else if (speed > RunSpeedThreshold)
            target = "Run";
        else if (speed > WalkSpeedThreshold)
            target = "Walk";
        else
            target = "Idle";

        TransitionTo(target);
    }

    private void TransitionTo(string animName)
    {
        if (animName == currentAnim) return;
        if (!anim.Animations.ContainsKey(animName)) return;

        if (string.IsNullOrEmpty(currentAnim))
            anim.Play(animName);
        else
            anim.Crossfade(animName, TimeSpan.FromSeconds(CrossfadeDuration));

        currentAnim = animName;
    }

    private float GetCharacterSpeed() => /* physics/movement system */ 0f;
    private bool IsCharacterGrounded() => /* ground check */ true;
    private bool IsAttackTriggered() => Input.IsKeyPressed(Keys.F);
}
```

## 9 — Procedural Animation

Create animations entirely in code — useful for rotating pickups, pulsing UI elements, or any motion that does not come from a DCC tool.

### Rotating an Entity

```csharp
public class SpinningPickup : SyncScript
{
    public override void Start()
    {
        // Create a clip that rotates 360° over 2 seconds
        var clip = new AnimationClip
        {
            Duration = TimeSpan.FromSeconds(2),
            RepeatMode = AnimationRepeatMode.LoopInfinite
        };

        // Build a rotation curve with keyframes
        var curve = new AnimationCurve<Quaternion>();
        curve.KeyFrames.Add(new KeyFrameData<Quaternion>(
            CompressedTimeSpan.Zero,
            Quaternion.Identity
        ));
        curve.KeyFrames.Add(new KeyFrameData<Quaternion>(
            new CompressedTimeSpan(TimeSpan.FromSeconds(0.5).Ticks),
            Quaternion.RotationY(MathUtil.PiOverTwo)
        ));
        curve.KeyFrames.Add(new KeyFrameData<Quaternion>(
            new CompressedTimeSpan(TimeSpan.FromSeconds(1.0).Ticks),
            Quaternion.RotationY(MathUtil.Pi)
        ));
        curve.KeyFrames.Add(new KeyFrameData<Quaternion>(
            new CompressedTimeSpan(TimeSpan.FromSeconds(1.5).Ticks),
            Quaternion.RotationY(MathUtil.Pi + MathUtil.PiOverTwo)
        ));
        curve.KeyFrames.Add(new KeyFrameData<Quaternion>(
            new CompressedTimeSpan(TimeSpan.FromSeconds(2.0).Ticks),
            Quaternion.RotationY(MathUtil.TwoPi)
        ));

        // Register the curve targeting the entity's rotation
        clip.AddCurve("[TransformComponent.Key].Rotation", curve);

        // Optimize for runtime performance (interleaved format)
        clip.Optimize();

        // Add to the animation component and play
        var animComponent = Entity.GetOrCreate<AnimationComponent>();
        animComponent.Animations.Add("Spin", clip);

        var playing = animComponent.Play("Spin");
        playing.RepeatMode = AnimationRepeatMode.LoopInfinite;
    }

    public override void Update() { }
}
```

### Animating Non-Skeleton Properties

Procedural clips can target any component property — not just transforms:

```csharp
// Animate a light's color from red to blue over 3 seconds
var colorClip = new AnimationClip { Duration = TimeSpan.FromSeconds(3) };

var colorCurve = new AnimationCurve<Color3>();
colorCurve.KeyFrames.Add(new KeyFrameData<Color3>(
    CompressedTimeSpan.Zero,
    new Color3(1f, 0f, 0f) // Red
));
colorCurve.KeyFrames.Add(new KeyFrameData<Color3>(
    new CompressedTimeSpan(TimeSpan.FromSeconds(3).Ticks),
    new Color3(0f, 0f, 1f) // Blue
));

colorClip.AddCurve(
    "[LightComponent.Key].Type.(ColorLightBase)Color.(ColorRgbProvider)Value",
    colorCurve
);
colorClip.Optimize();
```

## 10 — Animation Events and Callbacks

Stride does not have a built-in animation event/notify system (unlike Unity's Animation Events). To trigger gameplay logic at specific animation times, check the `CurrentTime` in your update loop:

```csharp
public class AttackAnimationHandler : SyncScript
{
    private AnimationComponent anim;
    private bool damageApplied;

    public override void Start()
    {
        anim = Entity.Get<AnimationComponent>();
    }

    public override void Update()
    {
        if (!anim.IsPlaying("Attack")) return;

        var playing = anim.PlayingAnimations
            .FirstOrDefault(p => p.Name == "Attack");
        if (playing == null) return;

        // Apply damage at 40% through the attack animation
        float progress = (float)(playing.CurrentTime.TotalSeconds
            / playing.Clip.Duration.TotalSeconds);

        if (progress >= 0.4f && !damageApplied)
        {
            ApplyDamage();
            damageApplied = true;
        }

        // Reset flag when animation restarts or changes
        if (progress < 0.1f)
        {
            damageApplied = false;
        }
    }

    private void ApplyDamage() => /* damage logic */ { };
}
```

## 11 — Root Motion

Root motion extracts movement from the animation's root bone and applies it to the entity's world position, so that animated locomotion drives actual movement rather than sliding in place.

Stride supports root motion through the `AnimationComponent`:

```csharp
public class RootMotionCharacter : SyncScript
{
    private AnimationComponent anim;

    public override void Start()
    {
        anim = Entity.Get<AnimationComponent>();
    }

    public override void Update()
    {
        // After the animation processor runs, root motion delta is available
        // Apply it to the entity's transform
        if (anim.PlayingAnimations.Count > 0)
        {
            // Read root motion from the animation component's output
            var rootMotion = Entity.Transform.Position;
            // Root motion is applied automatically when the model skeleton
            // has root motion enabled in the asset settings
        }
    }
}
```

Enable root motion in the model asset's skeleton settings in Game Studio. The animation processor will then extract root bone translation and apply it to the entity's transform rather than the skeleton.

## 12 — Performance Considerations

- **Clip optimization matters.** Always call `clip.Optimize()` on procedural clips. This converts curves to an interleaved format that evaluates significantly faster at runtime.
- **Limit active blend stack size.** Each playing animation is evaluated every frame. A blend stack with more than 3–4 active animations becomes expensive — crossfade old animations out promptly.
- **Share AnimationClip assets.** Multiple entities can reference the same `AnimationClip` asset without duplicating memory. The `AnimationComponent` stores per-instance playback state, not per-instance clip data.
- **Use `PlayOnce` for one-shots.** Animations set to `PlayOnce` automatically remove themselves from the blend stack when complete. `LoopInfinite` animations stay in the stack until explicitly removed.
- **Bone count affects cost.** Skeletal animation cost scales linearly with the number of bones being animated. Reduce bone counts on characters that appear small or far from the camera.

## 13 — Common Pitfalls

### Pitfall 1: Animation Frozen on First Frame

**Problem:** `Play("Walk")` is called every frame in `Update()`, restarting the animation each time.
**Solution:** Guard with `IsPlaying()`:
```csharp
if (!anim.IsPlaying("Walk"))
    anim.Play("Walk");
```

### Pitfall 2: Crossfade Pops to New Animation

**Problem:** Crossfade duration is too short — animation snaps instead of blending.
**Solution:** Use at least 100–300ms for locomotion transitions. Very short crossfades (under 50ms) are visually indistinguishable from `Play()`.

### Pitfall 3: Animation Clip Not Found

**Problem:** `Play("Walk")` throws or does nothing.
**Solution:** Ensure the clip is registered in `AnimationComponent.Animations` dictionary — either assigned in the editor or added in code with `anim.Animations.Add("Walk", walkClip)`. Check for typos in the name string.

### Pitfall 4: Additive Animation Produces Wild Results

**Problem:** Additive layer produces exaggerated or broken poses.
**Solution:** Additive clips should represent a *delta* from a reference pose, not a full pose. The additive clip's values are added to the base animation's values. If the additive clip contains full bone rotations (not deltas), the result will be double-rotated. Create additive clips as the difference between the desired pose and the reference pose.

### Pitfall 5: Procedural Clip Duration Mismatch

**Problem:** Procedural animation plays incorrectly — keyframes seem skipped or timing is off.
**Solution:** Ensure the `AnimationClip.Duration` matches or exceeds the last keyframe's time. If the last keyframe is at 2.0s but `Duration` is set to 1.0s, keyframes beyond 1.0s are never reached.

### Pitfall 6: Awaiting Ended() on a Looping Animation

**Problem:** `await anim.Ended(playingAnim)` never completes.
**Solution:** `Ended()` only resolves when the animation is removed from the blend stack. A `LoopInfinite` animation never removes itself. Set `RepeatMode = PlayOnce` before awaiting, or manually remove the animation.
