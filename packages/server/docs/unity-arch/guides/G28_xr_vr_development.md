# G28 — XR & VR Development in Unity 6

> **Category:** guide · **Engine:** Unity 6 (6000.x, URP 17+) · **Related:** [G2 Input System](G2_input_system.md) · [G10 Rendering Pipeline](G10_rendering_pipeline_urp_hdrp.md) · [G20 Cinemachine](G20_cinemachine_camera_systems.md) · [G16 Performance & Memory](G16_performance_optimization_memory.md) · [Unity Rules](../unity-arch-rules.md)

Unity 6 is the foundation for modern XR development, supporting VR headsets (Meta Quest, PlayStation VR2, Apple Vision Pro), AR (iOS ARKit, Android ARCore), and mixed reality (Android XR, visionOS) through the **OpenXR** standard and the **XR Interaction Toolkit (XRI) 3.x**. This guide covers project setup, interaction design, locomotion, hand tracking, performance, and platform-specific considerations.

---

## Package Stack Overview

| Package | Version (Unity 6) | Purpose |
|---------|-------------------|---------|
| `com.unity.xr.management` | 4.5+ | XR Plug-in Management — runtime loader/lifecycle |
| `com.unity.xr.openxr` | 1.6+ | OpenXR provider — cross-platform XR standard |
| `com.unity.xr.interaction.toolkit` | 3.0+ | High-level interaction framework (grab, teleport, UI) |
| `com.unity.xr.hands` | 1.3+ | Hand tracking subsystem via OpenXR |
| `com.unity.xr.core-utils` | 2.3+ | XR Origin, utilities, rig components |

> **Key decision:** Always use **OpenXR** as your provider plugin. Platform-specific SDKs (Oculus XR Plugin, etc.) are being superseded by OpenXR. As of 2025, Meta recommends the Unity OpenXR Plugin for Quest development with SDK v74+.

---

## Project Setup

### Step 1 — Install Packages

```
Window → Package Manager → Unity Registry
```

Install: **XR Interaction Toolkit**, **OpenXR Plugin**, **XR Hands** (if using hand tracking).

The XR Interaction Toolkit will pull in its dependencies (`xr.core-utils`, `xr.management`, `input-system`) automatically.

### Step 2 — Configure XR Plug-in Management

```
Edit → Project Settings → XR Plug-in Management
```

```csharp
// Enable OpenXR under each target platform tab:
// - PC (Standalone): OpenXR ✅
// - Android: OpenXR ✅ (for Quest, Android XR)
//
// WHY: XR Plug-in Management controls which XR runtime loads at startup.
// OpenXR provides a single API that works across Meta Quest, SteamVR,
// Windows Mixed Reality, PlayStation VR2, and Apple platforms.
```

### Step 3 — Add Interaction Profiles

Under **XR Plug-in Management → OpenXR**, add the controller interaction profiles for your target devices:

| Device | Interaction Profile |
|--------|-------------------|
| Meta Quest | Oculus Touch Controller Profile |
| Valve Index | Valve Index Controller Profile |
| HTC Vive | HTC Vive Controller Profile |
| Generic | Khronos Simple Controller Profile |

### Step 4 — Enable Feature Groups

In the OpenXR settings panel, enable the feature groups needed for your project:

```csharp
// Common feature groups to enable:
// - Hand Tracking Subsystem (for hand tracking via XR Hands)
// - Meta Quest Support (Android tab — required for Quest builds)
// - Meta Hand Tracking Aim (Android tab — for Quest hand ray casting)
//
// WHY: Feature groups are OpenXR extensions. Only enable what you need
// to keep your runtime requirements minimal and compatible with more devices.
```

### Step 5 — Render Pipeline

Use **URP** with **Vulkan** as the Graphics API for Android XR (Quest, Android XR):

```csharp
// In Player Settings → Android → Other Settings:
// - Graphics APIs: Vulkan (remove OpenGLES)
// - Render Pipeline: URP Asset
//
// WHY: Vulkan is the official graphics API for Android since 2025.
// Unity 6 configures Vulkan automatically when using the Android XR
// build profile. Vulkan enables features like multiview rendering
// (single-pass stereo) which is critical for VR frame rates.
```

---

## The XR Origin (Camera Rig)

The **XR Origin** replaces the old `XR Rig` and is the root of your VR camera hierarchy:

```
XR Origin (XR Origin component)
├── Camera Offset (Transform)
│   ├── Main Camera (Camera + TrackedPoseDriver)
│   ├── Left Controller (XRController + ActionBasedController)
│   └── Right Controller (XRController + ActionBasedController)
└── Locomotion System (Locomotion components)
```

```csharp
using UnityEngine;
using UnityEngine.XR.Interaction.Toolkit;

// WHY: The XR Origin transforms tracking-space coordinates into Unity
// world space. It handles the offset between floor level and the
// camera, and is the target that locomotion systems move.

public class XRRigSetup : MonoBehaviour
{
    [SerializeField] private XRInteractionManager _interactionManager;

    void Awake()
    {
        // WHY: The Interaction Manager mediates all interactor-interactable
        // relationships. Exactly ONE should exist in the scene.
        // XRI 3.0 auto-creates one if missing, but explicit is better.
        if (_interactionManager == null)
        {
            _interactionManager = FindAnyObjectByType<XRInteractionManager>();
        }
    }
}
```

---

## Interaction Model — Interactors & Interactables

XRI uses a clean **Interactor → Interaction Manager → Interactable** pattern:

### Interactors (the hands/controllers)

| Interactor | Use Case |
|-----------|----------|
| `XRDirectInteractor` | Touch/grab objects within arm's reach |
| `XRRayInteractor` | Point at distant objects, UI interaction |
| `NearFarInteractor` (XRI 3.0) | Unified interactor — direct grab when close, ray when far |
| `XRPokeInteractor` | Press buttons, poke UI elements |

### Interactables (the objects)

| Interactable | Use Case |
|-------------|----------|
| `XRGrabInteractable` | Pickable objects (weapons, tools, items) |
| `XRSimpleInteractable` | Buttons, levers — respond to hover/select without movement |
| `TeleportationAnchor` | Fixed teleport destination |
| `TeleportationArea` | Free teleport anywhere on a surface |

### Grab Example

```csharp
using UnityEngine;
using UnityEngine.XR.Interaction.Toolkit;

// WHY: XRGrabInteractable provides physics-based grabbing out of the box.
// It handles attach points, velocity inheritance on throw, and works
// with both controllers and hand tracking.

[RequireComponent(typeof(Rigidbody))]
public class ThrowableObject : MonoBehaviour
{
    private XRGrabInteractable _grabInteractable;

    void Awake()
    {
        _grabInteractable = GetComponent<XRGrabInteractable>();

        // WHY: Listen to grab/release events to add custom behavior
        // (sound effects, visual feedback, scoring).
        _grabInteractable.selectEntered.AddListener(OnGrabbed);
        _grabInteractable.selectExited.AddListener(OnReleased);
    }

    private void OnGrabbed(SelectEnterEventArgs args)
    {
        // Object was picked up — play grab sound, highlight, etc.
        Debug.Log($"Grabbed by: {args.interactorObject.transform.name}");
    }

    private void OnReleased(SelectExitEventArgs args)
    {
        // Object was released — Rigidbody velocity is automatically set
        // by XRGrabInteractable for a natural throw arc.
        Debug.Log("Released — thrown with inherited velocity!");
    }

    void OnDestroy()
    {
        _grabInteractable.selectEntered.RemoveListener(OnGrabbed);
        _grabInteractable.selectExited.RemoveListener(OnReleased);
    }
}
```

---

## Locomotion

VR locomotion must balance freedom of movement with **comfort** to prevent motion sickness.

### Teleportation (Comfort: High)

```csharp
// Teleportation setup in the scene hierarchy:
//
// XR Origin
// └── Locomotion System
//     ├── Teleportation Provider     ← moves the XR Origin on teleport
//     └── Snap Turn Provider (Action Based) ← discrete rotation (45° snaps)
//
// On floor surfaces:
// Floor (Mesh Collider)
// └── TeleportationArea component   ← allows teleport anywhere on surface
//
// For fixed destinations:
// TeleportPad (Collider)
// └── TeleportationAnchor component ← snaps player to exact position/rotation

// Configure via Input Actions:
// - Teleport Mode Activate: right thumbstick touch
// - Teleport Select: right thumbstick release
// - Snap Turn: right thumbstick left/right
```

### Continuous Movement (Comfort: Low–Medium)

```csharp
using UnityEngine;
using UnityEngine.InputSystem;

// WHY: Continuous movement feels natural to experienced VR users
// but causes motion sickness for many. ALWAYS offer teleportation
// as an alternative in your settings menu.

public class ContinuousLocomotion : MonoBehaviour
{
    [SerializeField] private float _moveSpeed = 2f;
    [SerializeField] private InputActionReference _moveAction;
    [SerializeField] private Transform _headTransform; // Main Camera

    private CharacterController _characterController;

    void Awake()
    {
        _characterController = GetComponent<CharacterController>();
    }

    void Update()
    {
        var input = _moveAction.action.ReadValue<Vector2>();
        if (input.sqrMagnitude < 0.01f) return;

        // WHY: Move relative to where the player is looking (head direction),
        // not where the controller points. This is the most intuitive for
        // most players, though some prefer hand-relative movement.
        var headYaw = Quaternion.Euler(0, _headTransform.eulerAngles.y, 0);
        var direction = headYaw * new Vector3(input.x, 0, input.y);

        _characterController.Move(direction * (_moveSpeed * Time.deltaTime));
    }
}
```

### Comfort Best Practices

- **Offer multiple locomotion options** — teleport, snap turn, continuous move, smooth turn
- **Vignette during movement** — darken screen edges to reduce peripheral motion cues
- **Never move the camera without player input** — unexpected camera motion causes instant nausea
- **Target 90 FPS minimum** — 72 FPS is the Quest minimum; 90 FPS is recommended; 120 FPS is ideal
- **Use Fixed Foveated Rendering** on Quest to maintain frame rate

---

## Hand Tracking

Unity 6 supports hand tracking via the **XR Hands** package and OpenXR:

```csharp
using UnityEngine;
using UnityEngine.XR.Hands;

// WHY: Hand tracking lets players interact without controllers.
// The XR Hands package provides joint data through the OpenXR
// hand tracking subsystem — no vendor-specific SDK needed.

public class HandTrackingInfo : MonoBehaviour
{
    private XRHandSubsystem _handSubsystem;

    void Start()
    {
        // WHY: The subsystem loads at runtime through XR Management.
        // It may take a frame to become available — check for null.
        var subsystems = new System.Collections.Generic.List<XRHandSubsystem>();
        SubsystemManager.GetSubsystems(subsystems);

        if (subsystems.Count > 0)
        {
            _handSubsystem = subsystems[0];
            _handSubsystem.updatedHands += OnHandsUpdated;
            Debug.Log("Hand tracking subsystem active");
        }
        else
        {
            Debug.LogWarning("No hand tracking subsystem found");
        }
    }

    private void OnHandsUpdated(
        XRHandSubsystem subsystem,
        XRHandSubsystem.UpdateSuccessFlags updateSuccessFlags,
        XRHandSubsystem.UpdateType updateType)
    {
        // WHY: Check which hands have valid data this frame.
        // Tracking can be lost when hands leave camera view.
        if ((updateSuccessFlags & XRHandSubsystem.UpdateSuccessFlags.LeftHandJoints) != 0)
        {
            var leftHand = subsystem.leftHand;
            ProcessHand(leftHand, "Left");
        }

        if ((updateSuccessFlags & XRHandSubsystem.UpdateSuccessFlags.RightHandJoints) != 0)
        {
            var rightHand = subsystem.rightHand;
            ProcessHand(rightHand, "Right");
        }
    }

    private void ProcessHand(XRHand hand, string label)
    {
        // Access individual joint poses — e.g., index finger tip
        if (hand.GetJoint(XRHandJointID.IndexTip).TryGetPose(out var pose))
        {
            // pose.position and pose.rotation in XR Origin space
            Debug.Log($"{label} index tip at: {pose.position}");
        }
    }

    void OnDestroy()
    {
        if (_handSubsystem != null)
            _handSubsystem.updatedHands -= OnHandsUpdated;
    }
}
```

### Hand Tracking + XRI Integration

XRI 3.0 supports hand tracking through the same interactor components. When controllers are removed, XRI automatically switches to hand-tracked input if the `XR Hands` package is installed and the Hand Tracking Subsystem feature is enabled.

---

## VR Performance Guidelines

VR has the tightest performance budgets in game development — every dropped frame is felt physically.

| Metric | Target (Quest 3) | Target (PCVR) |
|--------|------------------|----------------|
| Frame rate | 72–120 FPS | 90–144 FPS |
| Draw calls | < 100 | < 300 |
| Triangles | < 750K/frame | < 2M/frame |
| Texture memory | < 1 GB | < 4 GB |

### Key Optimizations

```csharp
// 1. Single-Pass Instanced Rendering (critical for VR)
// In URP Asset → Rendering → Rendering Path: Forward+
// In XR Plug-in Management → OpenXR → Render Mode: Single Pass Instanced
//
// WHY: Renders both eyes in one pass using GPU instancing.
// Without this, Unity renders the scene TWICE — once per eye — halving
// your effective GPU budget.

// 2. Fixed Foveated Rendering (Quest)
// Reduces rendering resolution in peripheral vision where the eye
// can't perceive detail. Enable in Oculus settings or via script:
// OVRManager.foveatedRenderingLevel = OVRManager.FoveatedRenderingLevel.HighTop;

// 3. Occlusion Culling
// Bake occlusion data: Window → Rendering → Occlusion Culling → Bake
// Prevents rendering objects hidden behind walls.

// 4. LOD Groups
// Use LOD Groups aggressively — VR resolution makes LOD switches
// less noticeable than on a flat screen.

// 5. Avoid dynamic shadows on mobile VR
// Use baked lightmaps + Light Probes for indirect lighting.
// One real-time directional light is the budget for Quest.
```

---

## Platform-Specific Notes

### Meta Quest (3, 3S, Pro)

- Build target: **Android** with **ARM64** + **IL2CPP**
- Graphics API: **Vulkan** (OpenGLES is deprecated for XR)
- Enable **Meta Quest Support** feature group in OpenXR settings
- Use **Build Profiles** in Unity 6 to store Quest-specific settings

### SteamVR (PC)

- Build target: **Standalone (Windows)**
- Works with any SteamVR-compatible headset via OpenXR
- Higher graphics budget — can use HDRP for PCVR-only titles

### Apple Vision Pro (visionOS)

- Requires **Unity 6** with the visionOS build support module
- Uses **PolySpatial** framework for Shared Space apps
- Fully immersive apps use standard XRI with OpenXR

### PlayStation VR2

- Requires PlayStation Partners program and PS5 dev kit
- Unity 6 supports PSVR2 via platform-specific XR plugin

---

## Testing Without a Headset

The **XR Device Simulator** lets you test XR interactions using keyboard and mouse:

```
Window → Package Manager → XR Interaction Toolkit → Samples → XR Device Simulator
```

```csharp
// Add the XR Device Simulator prefab to your scene.
// Controls:
// - WASD: Move head position
// - Mouse: Look around
// - Left Shift + Mouse: Move left controller
// - Space + Mouse: Move right controller
// - G: Grip press
// - T: Trigger press
//
// WHY: You can iterate on interaction design 10x faster with the
// simulator than putting on a headset for every test. Use it for
// logic and layout, then validate on real hardware for comfort.
```

---

## Summary

Unity 6 + OpenXR + XRI 3.0 provides a mature, cross-platform XR development stack. Use OpenXR as your single provider, XRI for interactions and locomotion, and XR Hands for controller-free input. Always prioritize frame rate (90+ FPS), offer comfort options for locomotion, and use Single-Pass Instanced rendering. Test early and often on target hardware — VR comfort issues that don't appear on a flat screen will immediately appear in the headset.
