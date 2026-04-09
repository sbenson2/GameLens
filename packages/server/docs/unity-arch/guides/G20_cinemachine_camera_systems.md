# G20 — Cinemachine & Camera Systems in Unity 6

> **Category:** guide · **Engine:** Unity 6 (6000.x, Cinemachine 3.1+) · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [G2 Input System](G2_input_system.md) · [G7 Animation System](G7_animation_system.md) · [Unity Rules](../unity-arch-rules.md)

Cinemachine (`com.unity.cinemachine`) is Unity's smart camera system — it manages camera position, rotation, lens settings, blending, and screen shake through data-driven components instead of manual scripting. Cinemachine 3 (shipped with Unity 6) is a significant rewrite of the Cinemachine 2.x API: the core concept remains the same (virtual cameras controlled by a brain), but class names, component architecture, and the procedural pipeline have all changed. This guide covers Cinemachine 3 concepts, setup, common camera rigs, transitions, and integration with the Input System.

---

## Why Cinemachine?

Hand-coding cameras sounds simple until you need:

- **Smooth follow** with damping that feels right across frame-rate ranges
- **Look-ahead** that anticipates player movement
- **Automatic transitions** between gameplay, cutscene, and UI cameras
- **Screen-space framing rules** (keep the player at the lower-third, for example)
- **Camera shake** that responds to explosions, impacts, or footsteps
- **Timeline integration** for cinematics

Cinemachine solves all of these declaratively — you configure behavior in the Inspector and Cinemachine handles interpolation, blending, and conflict resolution at runtime.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│                    Unity Camera                       │
│         + CinemachineBrain (one per scene)            │
│           Controls which virtual camera is "live"     │
└──────────────────────┬───────────────────────────────┘
                       │  drives transform + lens
                       ▼
┌──────────────────────────────────────────────────────┐
│            CinemachineCamera (virtual camera)         │
│                                                       │
│  ┌─────────────────────────────────────────────┐     │
│  │  Position Control (Body)                     │     │
│  │    Follow, Orbital Follow, Third Person,     │     │
│  │    Position Composer, Hard Lock, Spline Dolly │     │
│  ├─────────────────────────────────────────────┤     │
│  │  Rotation Control (Aim)                      │     │
│  │    Rotation Composer, Hard Look At,          │     │
│  │    Pan Tilt, Rotate With Follow Target       │     │
│  ├─────────────────────────────────────────────┤     │
│  │  Noise (procedural shake)                    │     │
│  │    Perlin-based profiles for handheld feel   │     │
│  ├─────────────────────────────────────────────┤     │
│  │  Extensions (post-processing, confiner, etc) │     │
│  └─────────────────────────────────────────────┘     │
│                                                       │
│  Priority: int  (higher = more important)             │
│  Blend Hint: how to interpolate during transitions    │
└──────────────────────────────────────────────────────┘
```

### Key Concepts

| Concept | Cinemachine 3 (Unity 6) | What it does |
|---------|------------------------|--------------|
| **CinemachineBrain** | Component on the Unity Camera | Evaluates all active virtual cameras and drives the real camera to match the highest-priority one |
| **CinemachineCamera** | Replaces `CinemachineVirtualCamera` from 2.x | Defines a camera viewpoint with procedural position, rotation, and noise behaviors |
| **Priority** | `int` property on CinemachineCamera | Determines which camera is live — highest priority wins. Equal priorities resolve by activation order |
| **Channel** | `int` property on CinemachineCamera | Routes cameras to specific Brains — enables split-screen by giving each player camera a different channel |
| **Blend Hint** | Enum on CinemachineCamera | Controls interpolation path: spherical, cylindrical, screen-space, or position/rotation inheritance |
| **Standby Update** | `Never`, `Always`, `RoundRobin` | Performance setting — controls whether non-live cameras keep updating their procedural state |

---

## Setup: Your First Cinemachine Camera

### Step 1 — Install the Package

Cinemachine is not included by default. Install via **Window → Package Manager → Unity Registry → Cinemachine**.

### Step 2 — Create a Virtual Camera

**GameObject → Cinemachine → Cinemachine Camera**

This creates a GameObject with a `CinemachineCamera` component. Unity automatically adds a `CinemachineBrain` to your Main Camera if one doesn't exist.

> **Important:** Your scene should have exactly **one** Unity Camera with a CinemachineBrain. Once the Brain is attached, the Camera's transform and lens become read-only — all control goes through Cinemachine.

### Step 3 — Assign a Target

Set the **Tracking Target** to the player GameObject. Optionally set a **Look At Target** if the camera should follow one object but look at another.

### Step 4 — Choose Procedural Behaviors

Add components to the CinemachineCamera to define its behavior:

```csharp
// You don't write this code — it's configured in the Inspector.
// But understanding the pipeline helps debug issues:
//
// Each frame, the CinemachineCamera pipeline runs:
// 1. Position Control (Body) — where should the camera be?
// 2. Rotation Control (Aim) — where should it look?
// 3. Noise — apply procedural shake on top
// 4. Extensions — post-processing, confining, etc.
```

---

## Common Camera Rigs

### Third-Person Follow Camera

The classic over-the-shoulder camera for 3D action games.

**Setup:**
1. Create a CinemachineCamera
2. Set **Tracking Target** to the player
3. Add **Third Person Follow** (Position Control)
4. Add **Rotation Composer** (Rotation Control)

```
Inspector Settings:
  Third Person Follow:
    Shoulder Offset: (0.5, 0.3, 0)    // Offset from target pivot
    Camera Distance: 4                  // Distance behind the target
    Damping: (0.1, 0.5, 0.3)          // Smooth follow response
    Camera Side: 0.6                    // 0 = left, 1 = right shoulder

  Rotation Composer:
    Tracked Object Offset: (0, 1.5, 0) // Look at head, not feet
    Lookahead Time: 0.2                 // Anticipate movement
    Dead Zone Width/Height: 0.1         // Area where target can move without camera rotating
    Soft Zone Width/Height: 0.8         // Gradual re-centering zone
```

### First-Person Camera

For FPS or exploration games where the camera IS the player's eyes.

**Setup:**
1. Create a CinemachineCamera as a **child** of the player's head bone or eye transform
2. Add **Hard Lock to Target** (Position Control) — locks position exactly to the target
3. Add **Pan Tilt** (Rotation Control) — mouse/stick input drives rotation directly
4. Wire the Input System to the Pan Tilt component

```csharp
using UnityEngine;
using Unity.Cinemachine;

// Cinemachine 3 integrates with the Input System natively.
// On the CinemachineCamera, add a CinemachineInputAxisController
// component and bind it to your Look action from an Input Action Asset.
//
// For manual control (advanced), you can drive the PanTilt axis:
public class FirstPersonInput : MonoBehaviour
{
    [SerializeField] private CinemachineCamera cinemachineCamera;

    private CinemachinePanTilt panTilt;

    private void Awake()
    {
        // GetCinemachineComponent retrieves pipeline components by type
        panTilt = cinemachineCamera.GetComponent<CinemachinePanTilt>();
    }

    // Normally you'd let CinemachineInputAxisController handle this,
    // but here's how manual control works if you need custom logic:
    public void ApplyLookDelta(Vector2 delta)
    {
        panTilt.PanAxis.Value += delta.x;
        panTilt.TiltAxis.Value -= delta.y; // Inverted Y
    }
}
```

### 2D Side-Scroller Camera

For platformers and side-scrollers using the 2D workflow.

**Setup:**
1. Create a CinemachineCamera (ensure your Unity Camera is set to Orthographic)
2. Set **Tracking Target** to the player
3. Add **Position Composer** (Position Control) — keeps the target in a screen-space zone
4. Add **CinemachineConfiner2D** extension — prevents the camera from showing areas outside the level

```
Inspector Settings:
  Position Composer:
    Tracked Object Offset: (0, 1, 0)
    Dead Zone Width: 0.2       // Player can move freely in this zone
    Dead Zone Height: 0.15
    Soft Zone Width: 0.7       // Camera gently re-centers in this zone
    Soft Zone Height: 0.6
    Damping: (0.5, 0.3, 0)    // X follows loosely, Y follows faster

  CinemachineConfiner2D:
    Bounding Shape 2D: (assign a PolygonCollider2D defining level bounds)
    Damping: 0.5               // Smooth transition at boundaries
```

### Orbital Follow (Isometric / Top-Down)

For RTS, ARPG, or isometric views where the player can orbit the camera.

**Setup:**
1. Create a CinemachineCamera
2. Add **Orbital Follow** (Position Control)
3. Add **Rotation Composer** (Rotation Control)
4. Add **CinemachineInputAxisController** and bind orbit input

---

## Camera Transitions & Blending

### Priority-Based Switching

The CinemachineBrain automatically blends to whichever CinemachineCamera has the highest **Priority** among all active cameras. To switch cameras:

```csharp
using Unity.Cinemachine;
using UnityEngine;

public class CameraSwitcher : MonoBehaviour
{
    [SerializeField] private CinemachineCamera explorationCam;
    [SerializeField] private CinemachineCamera combatCam;

    // Approach 1: Toggle activation (simplest)
    // The Brain picks the highest-priority ACTIVE camera.
    public void EnterCombat()
    {
        // Deactivate exploration, activate combat
        explorationCam.gameObject.SetActive(false);
        combatCam.gameObject.SetActive(true);
    }

    // Approach 2: Adjust priority (cameras stay active)
    // Useful when you want non-live cameras to keep updating.
    public void EnterCombatViaPriority()
    {
        explorationCam.Priority.Value = 0;
        combatCam.Priority.Value = 10;
    }
}
```

### Configuring Blends

On the **CinemachineBrain** component:

- **Default Blend** — applies to all transitions (e.g., "EaseInOut" over 2 seconds)
- **Custom Blends** — a `CinemachineBlenderSettings` asset that defines per-pair transition curves

```
Custom Blends Asset:
  From: ExplorationCam  → To: CombatCam    → Cut (instant)
  From: CombatCam       → To: ExplorationCam → EaseInOut, 1.5s
  From: *               → To: CutsceneCam   → EaseIn, 0.8s
```

### Blend Hints

Each CinemachineCamera's **Blend Hint** property tells the Brain HOW to interpolate:

| Blend Hint | Best For |
|------------|----------|
| `SphericalPosition` | Orbiting cameras — interpolates on a sphere around the target |
| `CylindricalPosition` | Blending between cameras at different heights |
| `ScreenSpaceAimWhenTargetsDiffer` | Keeps both targets visible during the blend |
| `InheritPosition` | The incoming camera starts from the outgoing camera's position |
| `FreezeWhenBlendingOut` | Outgoing camera stops updating during blend — avoids jitter |

---

## Screen Shake with Impulse

Cinemachine's impulse system provides physics-based screen shake without manually animating the camera.

### Setup

1. **Impulse Source** — add `CinemachineImpulseSource` to the object that generates shake (explosion, landing, weapon)
2. **Impulse Listener** — add `CinemachineImpulseListener` as an extension on your CinemachineCamera
3. Fire the impulse from code:

```csharp
using Unity.Cinemachine;
using UnityEngine;

public class ExplosionShake : MonoBehaviour
{
    [SerializeField] private CinemachineImpulseSource impulseSource;

    public void Explode()
    {
        // GenerateImpulse uses the signal shape and amplitude defined
        // in the Inspector. The velocity parameter controls direction
        // and additional force scaling.
        impulseSource.GenerateImpulse(Vector3.down * 2f);
    }

    // The impulse automatically attenuates over distance and time.
    // Configure the Impulse Definition in the Inspector:
    //   Signal Shape: choose from presets (6D Shake, Bump, etc.)
    //   Amplitude / Frequency: intensity and speed
    //   Dissipation Distance: how far the shake reaches
    //   Time Envelope: attack, sustain, decay curve
}
```

---

## Timeline Integration

For cutscenes, use Cinemachine with Unity's Timeline:

1. Create a **Timeline** asset on a director GameObject
2. Add a **Cinemachine Track**
3. Drag CinemachineCamera GameObjects onto the track as clips
4. Adjust clip durations and ease-in/ease-out for blending
5. The Brain automatically follows Timeline's camera choices while the Timeline is playing

```
Timeline Track:
  [0s ─── IntroCam ───── 3s] [3s ── DialogueCam ── 8s] [8s ─ ActionCam ─ 12s]
                          ↑ blend region (overlap = cross-fade)
```

> **Tip:** Set your gameplay cameras to a lower priority than your cutscene cameras. When the Timeline ends, the Brain naturally falls back to the highest-priority gameplay camera.

---

## Cinemachine 2.x → 3 Migration

If upgrading an existing project:

| Cinemachine 2.x | Cinemachine 3 |
|------------------|---------------|
| `CinemachineVirtualCamera` | `CinemachineCamera` |
| `CinemachineFreeLook` | `CinemachineCamera` + `OrbitalFollow` + `RotationComposer` |
| `CinemachineStateDrivenCamera` | Use Animator-driven priority switching |
| `CinemachineBrain.m_DefaultBlend` | `CinemachineBrain.DefaultBlend` |
| Body / Aim / Noise as sub-objects | Flat components on the same GameObject |
| `ICinemachineCamera` interface | Still exists but simplified |

Unity provides an **automatic upgrader** (Window → Cinemachine → Upgrade Project to Cinemachine 3) that handles most conversions, but complex rigs with custom extensions may need manual adjustment.

---

## Performance Tips

- **Standby Update = Never** for cameras that rarely go live (e.g., debug camera) — saves per-frame evaluation cost
- **Standby Update = Round Robin** when you have many cameras that need some updating but not every frame
- Avoid having dozens of active CinemachineCameras simultaneously — deactivate GameObjects for cameras that aren't needed in the current gameplay context
- **Noise profiles** have minimal cost but complex custom extensions can add up — profile with the Unity Profiler if you see camera-related spikes
- For 2D games, `CinemachineConfiner2D` recalculates its cache when the confining collider changes shape — avoid deforming confiner bounds every frame

---

## Common Pitfalls

| Problem | Cause | Fix |
|---------|-------|-----|
| Camera doesn't move | Missing CinemachineBrain on the Unity Camera | Add CinemachineBrain component |
| Camera snaps instead of blending | Default Blend set to "Cut" | Change to "EaseInOut" with a duration |
| Camera jitters when following rigidbody | CinemachineCamera updating in Update, physics in FixedUpdate | Set Brain's **Update Method** to `FixedUpdate` or use `SmartUpdate` |
| Camera shows outside level bounds (2D) | No confiner or wrong collider assigned | Add CinemachineConfiner2D with a PolygonCollider2D on a non-physics layer |
| Mouse look feels wrong | Input not connected to CinemachineInputAxisController | Add CinemachineInputAxisController and assign your Input Action Asset's Look action |
| Cinemachine 2.x scripts broken after upgrade | API renamed in Cinemachine 3 | Run the automatic upgrader, then fix remaining compile errors using the migration table above |

---

## Further Reading

- [Unity Cinemachine 3.1 Manual](https://docs.unity3d.com/Packages/com.unity.cinemachine@3.1/manual/)
- [G2 — Input System](G2_input_system.md) — wire mouse/gamepad input to camera controls
- [G7 — Animation System](G7_animation_system.md) — drive camera switches from Animator states
- [G1 — Scene Management](G1_scene_management.md) — camera persistence across scene loads
