# G12 — VR & OpenXR Development in Stride

> **Category:** guide · **Engine:** Stride · **Related:** [G01 Getting Started](./G01_getting_started.md) · [G07 Custom Render Features](./G07_custom_render_features.md) · [G02 Bepu Physics](./G02_bepu_physics.md) · [G03 Code-Only Development](./G03_code_only_development.md)

How to build VR applications with Stride, covering the built-in VR rendering pipeline, supported headsets (Oculus Rift, HTC Vive), OpenVR integration, performance requirements, VR-specific input handling, and the current state of OpenXR support. Stride has shipped VR support since its Xenko days and remains one of the few open-source C# engines with integrated VR rendering.

---

## VR Architecture in Stride

Stride's VR support is built into the **Graphics Compositor** — the same rendering pipeline system that handles forward/deferred rendering, post-processing, and camera management. VR doesn't require a separate rendering path; instead, you configure the existing forward renderer to output stereo views.

The key components:

- **VRRendererSettings** — compositor-level toggle that enables stereo rendering
- **VR API providers** — pluggable backends (Oculus SDK, OpenVR) that handle headset communication
- **VR Device** — runtime abstraction for head tracking, controller input, and display parameters
- **Dummy provider** — development tool that renders dual side-by-side cameras without VR hardware

---

## Enabling VR in Game Studio

### Step-by-Step Setup

1. **Open the Graphics Compositor** — in the Asset View, find and double-click the Graphics Compositor asset (usually `GraphicsCompositor.sdgfxcomp`)

2. **Select the Forward Renderer** — click the forward renderer node in the compositor graph

3. **Enable VR Settings** — in the Property Grid, expand **VR Settings** and toggle it on

4. **Add VR APIs** — click the green `+` button under the API list to add providers:
   - **Oculus** — native Oculus SDK integration (best for Meta Quest via Link, Rift)
   - **OpenVR** — SteamVR-compatible (Vive, Index, any SteamVR headset, also works with Oculus)
   - **Dummy** — renders stereo side-by-side on a flat monitor for development without hardware

5. **Order matters** — Stride tries APIs in list order. Recommended: Oculus first (for native Rift performance), then OpenVR as fallback. This way Rift users get the native SDK path while Vive/Index users fall through to OpenVR.

6. **Reload the project** — VR API changes require a project reload to take effect at runtime.

### Configuration Properties

| Property | Purpose | Recommended Value |
|----------|---------|------------------|
| **Enabled** | Master VR toggle | `true` |
| **Required APIs** | Which VR runtimes to try | Oculus + OpenVR |
| **Ignore Camera Rotation** | Blocks non-VR rotation input | `true` (reduces VR sickness) |
| **Resolution Scale** | Multiplier on per-eye render resolution | `1.0` (increase for clarity, decrease for performance) |

---

## Performance Requirements

VR has strict performance constraints. Both Oculus and SteamVR require **90 FPS** minimum (some headsets target 120 FPS). Dropped frames cause visible judder and player nausea.

### Mandatory Game Loop Settings

```csharp
// In your Game class or startup code — these are NOT optional for VR
game.IsFixedTimeStep = true;
game.IsDrawDesynchronized = true;
game.GraphicsDeviceManager.SynchronizeWithVerticalRetrace = false;
game.TargetElapsedTime = TimeSpan.FromSeconds(1.0 / 90.0);
```

Why each setting matters:

- **`IsFixedTimeStep = true`** — ensures consistent physics/logic tick rate independent of render frame rate
- **`IsDrawDesynchronized = true`** — decouples draw calls from the game loop, allowing the VR runtime to manage frame timing and reprojection
- **`SynchronizeWithVerticalRetrace = false`** — disables VSync; the VR runtime handles its own synchronization with the headset display
- **`TargetElapsedTime = 1/90s`** — targets 90 FPS, the standard VR refresh rate

### Rendering Optimizations for VR

VR renders the scene **twice** (once per eye), so you effectively need to maintain 90 FPS at 2× the fill rate of a flat-screen game.

**Enable MSAA** — VR headsets magnify aliasing because the lenses act as magnifiers. MSAA (4x minimum) is strongly recommended over post-process AA (FXAA/TAA produce smearing artifacts in VR).

**Reduce draw calls** — stereo rendering doubles draw call overhead. Use instancing, LODs, and aggressive frustum culling. Stride's built-in instancing support helps here.

**Avoid heavy post-processing** — bloom, depth of field, and screen-space reflections are expensive at VR resolution and can cause discomfort. Use them sparingly.

**Forward rendering preferred** — deferred rendering in VR requires two G-buffer passes. Stride's forward renderer is typically more efficient for VR workloads.

---

## VR Input Handling

### Head Tracking

Head position and rotation come from the VR runtime automatically. The camera entity in your scene tracks the headset. You don't need to manually read head tracking data for basic rendering.

For gameplay logic that needs head pose:

```csharp
public class VRHeadTracker : SyncScript
{
    public override void Update()
    {
        // The entity this script is attached to receives head tracking
        // Position = headset world position
        // Rotation = headset world orientation
        Vector3 headPosition = Entity.Transform.WorldMatrix.TranslationVector;
        Quaternion headRotation = Entity.Transform.Rotation;
        
        // Use head direction for gaze-based interaction
        Vector3 gazeDirection = Vector3.Transform(Vector3.UnitZ, headRotation);
        
        // Raycast from head position along gaze for UI interaction
        var result = this.GetSimulation()?.Raycast(
            headPosition, 
            headPosition + gazeDirection * 10f
        );
        
        if (result.Succeeded)
        {
            OnGazeHit(result.Collider.Entity);
        }
    }
}
```

### Controller Input

VR controller input (Vive wands, Oculus Touch) comes through the standard Stride `Input` system plus VR-specific APIs:

```csharp
public class VRControllerInput : SyncScript
{
    public override void Update()
    {
        // Access VR-specific input through the Input manager
        var vrDevice = Input.VirtualReality;
        
        if (vrDevice != null && vrDevice.State == DeviceState.Valid)
        {
            // Left/right controller transforms
            var leftHand = vrDevice.LeftHand;
            var rightHand = vrDevice.RightHand;
            
            if (leftHand != null)
            {
                Vector3 leftPos = leftHand.Position;
                Quaternion leftRot = leftHand.Rotation;
                // Use for hand presence in scene
            }
        }
    }
}
```

---

## The Dummy VR Provider

The Dummy provider is invaluable during development — it renders two side-by-side camera views on your monitor without requiring VR hardware. This lets you:

- Test stereo rendering and eye separation
- Debug VR UI layout and interaction distances
- Develop on machines without headsets (CI servers, laptops)
- Profile VR rendering cost without VR runtime overhead

To use: add `Dummy` as the only API in VR Settings. The game window shows left/right eye views.

---

## OpenXR Status

OpenXR is the Khronos Group standard that unifies VR/AR runtime APIs across headsets. It replaces vendor-specific APIs (Oculus SDK, OpenVR) with a single interface.

### Current State in Stride (as of 4.3)

OpenXR support in Stride is **in development** but not yet part of the official release:

- [GitHub issue #957](https://github.com/stride3d/stride/issues/957) tracks OpenXR integration
- The **vvvv** visual programming environment (built on Stride) has contributed OpenXR support that works in their fork
- The **FocusEngine** community fork (by phr00t) has more complete OpenXR and Vulkan VR support, optimized for standalone VR development

### What This Means for New Projects

For production VR projects starting today on Stride 4.3:

| Headset | Recommended API | Notes |
|---------|----------------|-------|
| Meta Quest (via Link) | Oculus | Best performance, native SDK |
| HTC Vive / Vive Pro | OpenVR | SteamVR required |
| Valve Index | OpenVR | SteamVR required |
| Any SteamVR headset | OpenVR | Broadest compatibility |
| Oculus + SteamVR users | Oculus + OpenVR | List both, Oculus first |

If you need OpenXR specifically (for future-proofing or headsets that only support OpenXR):

1. **Watch** the Stride GitHub for OpenXR merge progress
2. **Consider FocusEngine** if you need OpenXR today — it's a maintained fork with VR-first priorities
3. **OpenVR covers most headsets** in practice — SteamVR acts as a bridge for nearly all PC VR hardware

---

## VR Comfort Best Practices

VR sickness is a real concern that affects game design decisions:

### Camera Movement

```csharp
// GOOD: Teleport locomotion — no continuous camera movement
public void TeleportTo(Vector3 target)
{
    // Instant position change, let the headset handle orientation
    Entity.Transform.Position = target;
}

// CAUTION: Smooth locomotion — add comfort options
public void SmoothMove(Vector3 direction, float speed, GameTime time)
{
    // Always move relative to head orientation, not controller
    // Add vignette during movement to reduce peripheral motion
    Entity.Transform.Position += direction * speed * (float)time.Elapsed.TotalSeconds;
}
```

### Comfort Settings to Ship

Every VR game should include these player-facing options:

- **Locomotion type** — teleport vs. smooth movement
- **Snap turning** — 30°/45°/90° increments vs. smooth rotation
- **Vignette during motion** — darkens screen edges during movement
- **Seated/standing mode** — adjusts world scale and interaction height
- **IPD adjustment** — if not handled by the headset runtime

### Scale and Distance

In VR, distances and object sizes must be physically accurate or the experience feels wrong:

- 1 Stride unit = 1 meter (maintain this consistently)
- Player eye height: ~1.6m standing, ~1.2m seated
- Comfortable interaction distance: 0.5m–2m from the player
- UI panels: 1.5m–3m away, angled slightly toward the player
- Text minimum size: ~2cm tall at 1.5m distance for readability

---

## Summary

| Topic | Key Takeaway |
|-------|-------------|
| Setup | Configure VR in Graphics Compositor, add Oculus + OpenVR APIs |
| Performance | 90 FPS mandatory, use `IsDrawDesynchronized`, enable MSAA, forward rendering |
| Input | Head tracking is automatic; controllers via `Input.VirtualReality` |
| OpenXR | In development — use OpenVR for broad compatibility today |
| Comfort | Ship teleport option, snap turning, vignette; maintain 1:1 meter scale |
| Development | Use Dummy provider for headset-free testing |
