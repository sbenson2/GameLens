# G36 — VR Haptics & OpenXR Passthrough

> **Category:** Guide · **Engine:** Stride · **Related:** [Stride Architecture Rules](../stride-arch-rules.md), [G12 — VR & OpenXR Development](G12_vr_openxr_development.md), [G19 — Input System](G19_input_system.md)

Stride 4.3 adds two VR features that improve immersion: haptic feedback integration for VR controllers and an API for OpenXR Passthrough (mixed reality). This guide covers how to trigger controller vibrations from game events and how to enable camera passthrough for augmented/mixed reality experiences. For foundational VR setup (stereo rendering, headset configuration, VR providers), see [G12](G12_vr_openxr_development.md).

---

## Table of Contents

1. [Haptic Feedback Overview](#1--haptic-feedback-overview)
2. [Triggering Haptics from Scripts](#2--triggering-haptics-from-scripts)
3. [Haptic Design Patterns](#3--haptic-design-patterns)
4. [OpenXR Passthrough Overview](#4--openxr-passthrough-overview)
5. [Enabling Passthrough](#5--enabling-passthrough)
6. [Mixed Reality Rendering](#6--mixed-reality-rendering)
7. [Platform Compatibility](#7--platform-compatibility)

---

## 1 — Haptic Feedback Overview

Haptic feedback (controller vibration) provides tactile confirmation of in-game events: the recoil of a weapon, the resistance of pulling a bowstring, or the rumble of an engine. Modern VR controllers (Meta Quest Touch, Valve Index, HTC Vive) expose haptic actuators through the OpenXR standard.

Stride 4.3 integrates haptic feedback into the VR runtime layer. When running on an OpenXR-compatible runtime, scripts can request vibrations on specific controllers with control over amplitude, duration, and frequency.

### How It Works

1. The VR provider (OpenXR runtime) exposes haptic output paths for each controller
2. Stride's VR input system maps these to the left and right controller devices
3. Scripts call haptic methods on the controller, specifying vibration parameters
4. The runtime translates the request to the hardware's actuator capabilities

---

## 2 — Triggering Haptics from Scripts

### Basic Haptic Pulse

The simplest use is a single-shot vibration triggered by a game event:

```csharp
using Stride.Engine;
using Stride.VirtualReality;

public class WeaponRecoil : SyncScript
{
    /// <summary>Which hand holds the weapon.</summary>
    public VRHand Hand { get; set; } = VRHand.Right;

    /// <summary>Vibration intensity (0.0 to 1.0).</summary>
    public float HapticAmplitude { get; set; } = 0.7f;

    /// <summary>Duration in seconds.</summary>
    public float HapticDuration { get; set; } = 0.1f;

    public override void Update()
    {
        if (Input.IsKeyPressed(Keys.Space)) // placeholder for trigger pull
        {
            FireHapticPulse();
        }
    }

    private void FireHapticPulse()
    {
        var vrDevice = Game.Services.GetService<VRDeviceSystem>()?.Device;
        if (vrDevice == null) return;

        var controller = Hand == VRHand.Right
            ? vrDevice.RightHand
            : vrDevice.LeftHand;

        // Send a haptic pulse: amplitude, frequency (Hz), duration (seconds)
        controller?.Vibrate(HapticAmplitude, 160f, HapticDuration);
    }
}
```

### Haptic Parameters

| Parameter | Range | Effect |
|-----------|-------|--------|
| **Amplitude** | 0.0 – 1.0 | Vibration intensity. 0.0 = no vibration, 1.0 = maximum. |
| **Frequency** | 0 – 3200 Hz (device-dependent) | Higher values feel like a buzz; lower values feel like a rumble. Many controllers only support a single actuator and ignore this. |
| **Duration** | 0.0 – 5.0 seconds (recommended) | How long the vibration lasts. Very short pulses (< 0.05s) may be imperceptible; very long pulses annoy users. |

### Async Haptic Patterns

For complex vibration patterns (engine rumble, heartbeat), use an `AsyncScript` to sequence multiple pulses:

```csharp
using Stride.Engine;
using Stride.VirtualReality;

public class HeartbeatHaptic : AsyncScript
{
    public override async Task Execute()
    {
        var vrDevice = Game.Services.GetService<VRDeviceSystem>()?.Device;
        if (vrDevice == null) return;

        while (Game.IsRunning)
        {
            // Double-beat pattern: thump-thump ... pause
            vrDevice.LeftHand?.Vibrate(0.8f, 80f, 0.08f);
            await Script.NextFrame();
            await Task.Delay(TimeSpan.FromMilliseconds(100));

            vrDevice.LeftHand?.Vibrate(0.5f, 80f, 0.06f);
            await Script.NextFrame();
            await Task.Delay(TimeSpan.FromMilliseconds(600));
        }
    }
}
```

---

## 3 — Haptic Design Patterns

### Match Haptics to Visual/Audio Events

Haptics should reinforce what the player sees and hears, never contradict it. A heavy sword swing needs a strong, low-frequency rumble that starts at the apex of the swing, not at the button press.

### Use Amplitude and Duration, Not Frequency

Most VR controllers have a single haptic actuator with limited frequency response. Varying amplitude and duration produces more perceptible differences than varying frequency. Design haptics primarily through these two axes.

### Keep Vibrations Brief

Sustained vibration causes sensory adaptation — players stop feeling it after 1–2 seconds. For continuous effects (engine rumble, rainfall), use intermittent pulsing with small gaps:

```csharp
// Intermittent rumble pattern (engine idle)
while (engineRunning)
{
    controller?.Vibrate(0.3f, 60f, 0.05f);
    await Task.Delay(TimeSpan.FromMilliseconds(80));
}
```

### Offer a Haptic Intensity Setting

Some players find vibration distracting; others want maximum feedback. Expose a global haptic intensity multiplier in your settings menu:

```csharp
// Global scaling factor (0.0 = off, 1.0 = full)
public static float HapticScale { get; set; } = 1.0f;

private void Vibrate(VRHandController controller,
    float amplitude, float frequency, float duration)
{
    if (HapticScale <= 0f) return;
    controller?.Vibrate(amplitude * HapticScale, frequency, duration);
}
```

### Haptic Feedback Table (Suggested Starting Points)

| Event | Amplitude | Duration | Frequency | Notes |
|-------|-----------|----------|-----------|-------|
| Button click | 0.2 | 0.03s | 200 Hz | Light, crisp tap |
| Weapon fire (pistol) | 0.6 | 0.08s | 160 Hz | Short, punchy |
| Weapon fire (shotgun) | 1.0 | 0.15s | 80 Hz | Heavy, low rumble |
| Collision/impact | 0.8 | 0.12s | 100 Hz | Proportional to force |
| Object pickup | 0.15 | 0.05s | 250 Hz | Subtle confirmation |
| Heartbeat | 0.7 + 0.4 | 0.08s + 0.06s | 80 Hz | Double pulse with 100ms gap |
| Engine idle | 0.25 | 0.05s (repeating) | 60 Hz | Intermittent, low |

---

## 4 — OpenXR Passthrough Overview

OpenXR Passthrough enables the headset's cameras to feed a live view of the real world into the VR scene. This enables mixed reality (MR) and augmented reality (AR) experiences where virtual objects overlay the physical environment.

Stride 4.3 exposes the OpenXR Passthrough extension through its VR API. When enabled, the headset's background switches from a rendered skybox to the live camera feed, and your game renders virtual geometry on top.

### Supported Hardware

Passthrough requires headsets with external cameras and OpenXR runtime support:

- **Meta Quest 2, Quest 3, Quest Pro** — color passthrough (Quest 3/Pro), grayscale (Quest 2)
- **Valve Index** — grayscale passthrough via SteamVR
- **Varjo XR-3, XR-4** — high-fidelity color passthrough
- **Lynx R-1** — native AR/MR support

The feature availability depends on the OpenXR runtime and headset capabilities.

---

## 5 — Enabling Passthrough

### In Game Studio

1. Open the **Graphics Compositor** asset
2. Select the **Forward Renderer** node
3. Expand **VR Settings**
4. Enable the **Passthrough** option (requires OpenXR provider with passthrough extension)

### In Code

```csharp
using Stride.Engine;
using Stride.VirtualReality;

public class PassthroughToggle : SyncScript
{
    private VRDevice _vrDevice;

    public override void Start()
    {
        _vrDevice = Game.Services.GetService<VRDeviceSystem>()?.Device;

        if (_vrDevice?.SupportsPassthrough == true)
        {
            _vrDevice.EnablePassthrough(true);
            Log.Info("OpenXR Passthrough enabled");
        }
        else
        {
            Log.Warning("Passthrough not supported on this device/runtime");
        }
    }

    public override void Update()
    {
        // Toggle passthrough with a button press
        if (Input.IsKeyPressed(Keys.P))
        {
            var current = _vrDevice?.IsPassthroughEnabled ?? false;
            _vrDevice?.EnablePassthrough(!current);
        }
    }
}
```

### Passthrough Lifecycle

1. **Check support:** query `VRDevice.SupportsPassthrough` before enabling
2. **Enable:** call `EnablePassthrough(true)` — the runtime requests camera access and begins streaming
3. **Render:** Stride clears the background to transparent; the passthrough layer composites behind your scene
4. **Disable:** call `EnablePassthrough(false)` to return to the normal VR skybox

---

## 6 — Mixed Reality Rendering

With passthrough active, your scene rendering needs adjustments:

### Transparent Background

When passthrough is enabled, the clear color of your camera should be fully transparent so the real-world feed shows through. Stride handles this automatically when passthrough is active, but if you have custom render features that write to the background, ensure they respect the passthrough state.

### Occlusion of Real-World Objects

By default, all virtual geometry renders on top of the passthrough feed. For more convincing MR, you may want real-world objects (tables, walls) to occlude virtual objects. This requires:

1. **Depth estimation** — some headsets (Quest 3, Varjo) provide a depth map of the real world
2. **Scene understanding** — the runtime may provide mesh representations of detected surfaces
3. **Depth compositing** — blend real-world depth with virtual depth to determine visibility

This is an advanced topic that depends heavily on the headset's scene understanding capabilities and is not fully standardized across OpenXR runtimes.

### Lighting Considerations

Virtual objects should match the real-world lighting for convincing MR. Consider:

- **Ambient light estimation:** some runtimes provide an estimate of the real-world ambient light
- **Shadow casting:** virtual objects casting shadows on real surfaces (requires a shadow-receiving plane at the detected floor level)
- **Consistent color temperature:** match your virtual light color to the real-world environment

---

## 7 — Platform Compatibility

| Feature | OpenXR Required | Quest 2 | Quest 3/Pro | Valve Index | Varjo XR |
|---------|----------------|---------|-------------|-------------|----------|
| Haptic pulse | Yes | Yes | Yes | Yes | Yes |
| Haptic frequency control | Yes | Limited | Limited | Full (per-finger) | Yes |
| Passthrough (grayscale) | Yes | Yes | Yes | Yes | N/A |
| Passthrough (color) | Yes | No | Yes | No | Yes |
| Depth estimation | Extension | No | Yes | No | Yes |
| Scene understanding | Extension | Limited | Yes | No | Yes |

### Graceful Degradation

Always check capability before using these features. A game designed for MR should fall back to full VR when passthrough is unavailable:

```csharp
public override void Start()
{
    var vr = Game.Services.GetService<VRDeviceSystem>()?.Device;

    if (vr?.SupportsPassthrough == true)
    {
        // Mixed reality mode: enable passthrough, anchor to real floor
        vr.EnablePassthrough(true);
        SetupMRAnchors();
    }
    else
    {
        // Pure VR mode: render virtual environment
        SetupVREnvironment();
    }
}
```

Haptics degrade naturally — if a controller does not support haptics (e.g., hand tracking mode), the `Vibrate()` call is a no-op. No error handling required, but you should provide visual/audio feedback as a fallback so the player still receives confirmation of their actions.
