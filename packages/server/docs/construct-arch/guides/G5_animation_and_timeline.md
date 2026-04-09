# G5 — Animation & Timeline Systems

> **Category:** guide · **Engine:** Construct · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [R1 Behaviors and Effects](../reference/R1_behaviors_and_effects.md) · [G1 Event Sheet Patterns](G1_event_sheet_patterns.md)

---

## Two Animation Systems

Construct 3 has two distinct animation systems that serve different purposes. Understanding when to use each is critical for clean project architecture.

| System | What It Animates | Authored In | Best For |
|--------|-----------------|-------------|----------|
| **Sprite Animations** | Frame-by-frame sprite images | Animation Editor (per sprite) | Character walk cycles, attacks, explosions — anything drawn frame by frame |
| **Timelines** | Any instance property over time | Timeline Editor (per layout) | Cutscenes, UI transitions, camera moves, coordinated multi-object choreography |

A third option — the **Tween behavior** — sits between the two: it animates properties like position, size, opacity, and angle from events, without a visual timeline. Use it for runtime reactions (e.g., a button scaling up on hover).

---

## Sprite Animations

### Animation Editor Basics

Each Sprite object contains an animation list. Each animation has:

- **Name** — referenced in events (case-sensitive)
- **Frames** — individual images, each with its own duration
- **Speed** — default playback rate (frames per second)
- **Loop** — whether the animation repeats, ping-pongs, or plays once
- **Repeat count** — how many times to loop (0 = forever)

### Importing Frames

Three import methods:

1. **Individual images** — drag multiple PNGs into the animation editor; each becomes one frame.
2. **Strip import** — import a horizontal or vertical sprite strip. Specify the number of columns/rows, and Construct slices automatically.
3. **Sprite sheet import** — import from a grid-based sheet by specifying frame width, height, count, and offset.

For all methods, set the **origin point** consistently across frames. Misaligned origins cause visual jitter during playback. Use "Set origin for all animations" in the Image Editor to batch-align.

### Controlling Animations from Events

```
Set animation to "Run" (play from beginning)
Set animation to "Run" (play from current frame)
Set animation speed to 15
Set animation frame to 0
```

Key conditions for animation-driven logic:

```
On animation "Attack" finished       → trigger damage, return to idle
Is animation "Jump" playing          → prevent re-jump
Compare animation frame ≥ 3          → enable hitbox on specific frame
```

### Animation State Machine Pattern

Construct has no built-in state machine, but the pattern emerges naturally from animation events:

```
── Event: Platform is on floor
   ── Sub: Platform speed = 0
      → Set animation "Idle"
   ── Sub: Platform speed > 0
      → Set animation "Run"
── Event: Platform is jumping
   → Set animation "Jump"
── Event: Platform is falling
   → Set animation "Fall"
── Event: On animation "Attack" finished
   → Set animation "Idle"
```

**Tip:** Always set the animation with "play from current frame" when the animation might already be playing. Using "play from beginning" every tick restarts the animation on every frame, causing a freeze on frame 0.

---

## Timeline System

Timelines let you choreograph changes to any instance property over time using keyframes, entirely in the visual editor — no events required for the animation itself.

### Core Concepts

| Term | Meaning |
|------|---------|
| **Timeline** | A named animation sequence attached to a layout |
| **Track** | A single instance (object) being animated within a timeline |
| **Property track** | A specific property (X, Y, Angle, Opacity, etc.) on a track |
| **Property keyframe** | A value for a property at a specific point in time |
| **Master keyframe** | A point in time that groups multiple property keyframes and can carry a tag |

### Creating a Timeline

1. Open the **Timeline Bar** (View → Timeline Bar)
2. Select one or more instances in the layout
3. Click **Add timeline** and name it
4. Move the playhead to a time, change instance properties in the Properties panel, and Construct auto-creates keyframes
5. Adjust easing curves per keyframe for polish

### Easing Functions

Each keyframe transition can use a different easing:

- **Linear** — constant speed (default)
- **Ease In / Out / InOut** — smooth acceleration/deceleration
- **Back** — overshoots the target, then snaps back
- **Bounce / Elastic** — playful, physics-flavored motion

Pick easing by right-clicking a keyframe in the Timeline Bar.

### Timeline Events

Timelines are controlled and monitored from events:

```
── Action: Play timeline "Intro"
── Action: Set timeline "Intro" playback rate to 0.5
── Condition: On timeline "Intro" finished
   → Action: Go to layout "Level1"
```

### Master Keyframe Tags

Tags on master keyframes fire events mid-timeline, enabling synchronization:

```
Timeline "BossEntrance":
  0.0s — boss slides in from off-screen
  1.2s — [Tag: "Roar"] 
  2.0s — camera shakes
  3.0s — [Tag: "FightStart"]

Events:
── On timeline "BossEntrance" reached tag "Roar"
   → Audio: Play "boss_roar.ogg"
── On timeline "BossEntrance" reached tag "FightStart"
   → Set global variable BossFightActive to true
```

This decouples audio and game logic from the animation timing — change the timeline visually without rewriting events.

---

## Tween Behavior

The Tween behavior animates properties programmatically from events. It is the right choice when animation parameters are determined at runtime.

### Adding Tweens

Attach the Tween behavior to any object, then use actions:

```
Tween: "FadeIn" property Opacity to 100 in 0.5 seconds (Ease Out Sine)
Tween: "MoveUp" property Y to Self.Y - 50 in 0.3 seconds (Ease In Quad)
Tween: "Grow" property Width to 200, Height to 200 in 1.0 seconds (Ease InOut Cubic)
```

Each tween has a **tag** (e.g., "FadeIn") so you can reference it in conditions:

```
On Tween "FadeIn" finished → Destroy
Is Tween "MoveUp" playing → skip new tween
```

### Tween Properties

| Property | What It Animates |
|----------|-----------------|
| Position | X, Y (or both) |
| Size | Width, Height |
| Angle | Rotation |
| Opacity | Alpha (0–100) |
| Value | A numeric instance variable (useful for health bars, counters) |
| Color | Tint color (RGB) |

### Tween vs. Timeline Decision Guide

| Choose Tween When... | Choose Timeline When... |
|----------------------|------------------------|
| Values are computed at runtime (e.g., "move to the player's position") | Exact positions and timing are authored visually |
| The animation is a one-off reaction (hover, damage flash) | Multiple objects need coordinated choreography |
| You need fire-and-forget simplicity | You want visual editing with easing curves |
| The same object does many different motions contextually | The sequence is a fixed cutscene or intro |

---

## Performance Notes

1. **Sprite animations** are GPU-friendly — frame switching costs almost nothing. Hundreds of animated sprites are fine.
2. **Timelines** are lightweight at runtime but author-time heavy. Complex timelines with many tracks can slow the editor on older machines.
3. **Tweens** create per-instance overhead. Avoid spawning hundreds of objects each with active tweens — batch similar animations or use sprite animations instead.
4. **Collision polygon per frame** — if your sprite frames have very different silhouettes, set per-frame collision polygons in the Image Editor. Animations that share a similar shape can reuse a single polygon (set via "Apply to all frames") for better picking performance.
