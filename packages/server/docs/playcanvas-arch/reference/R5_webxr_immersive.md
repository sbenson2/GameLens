# R5 — WebXR Immersive Experiences

> **Category:** reference · **Engine:** PlayCanvas · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md), [Input Handling](../guides/G6_input_handling.md), [Optimization & Performance](../guides/G7_optimization_performance.md), [Camera Systems](./R4_camera_systems.md)

PlayCanvas has deep, first-party WebXR integration supporting VR, AR, and Mixed Reality across headsets, mobile devices, and desktop browsers. The engine wraps the WebXR Device API into its component system — session management, input sources, hand tracking, hit testing, anchors, depth sensing, mesh detection, plane detection, and light estimation are all accessible through the `XrManager` and related classes. This reference covers the full capability set for game developers.

---

## Platform Support

| Platform | VR | AR | Notes |
|----------|----|----|-------|
| Meta Quest (2/3/Pro) | Yes | Yes | Full WebXR support in Meta Browser |
| Apple Vision Pro | Yes | Limited | VR via Safari (must enable in settings); AR limited |
| Android (Chrome) | Yes | Yes | ARCore required for AR features |
| Desktop (Chrome/Edge) | Yes | No | Via SteamVR / OpenXR runtime |
| iOS Safari | No | No | WebXR not supported as of 2026 |

> **Testing tip:** Use the [Immersive Web Emulator](https://chromewebstore.google.com/detail/immersive-web-emulator) Chrome extension for development without hardware. Avoid the older "WebXR API Emulator" extension — it has compatibility issues with current PlayCanvas.

---

## Session Lifecycle

### Starting a Session

```typescript
const app: pc.AppBase = /* your app */;
const cameraEntity: pc.Entity = /* entity with CameraComponent */;

// Check support before offering XR to the player
if (app.xr.supported) {
  // VR session
  if (app.xr.isAvailable(pc.XRTYPE_VR)) {
    app.xr.start(cameraEntity.camera!, pc.XRTYPE_VR, pc.XRSPACE_LOCALFLOOR, {
      callback: (err: Error | null) => {
        if (err) console.error('VR session failed:', err.message);
      },
    });
  }

  // AR session
  if (app.xr.isAvailable(pc.XRTYPE_AR)) {
    app.xr.start(cameraEntity.camera!, pc.XRTYPE_AR, pc.XRSPACE_LOCALFLOOR, {
      optionalFeatures: ['hit-test', 'anchors', 'light-estimation'],
      callback: (err: Error | null) => {
        if (err) console.error('AR session failed:', err.message);
      },
    });
  }
}
```

### Session Types

| Constant | Purpose |
|----------|---------|
| `pc.XRTYPE_VR` | Immersive VR — full headset rendering |
| `pc.XRTYPE_AR` | Immersive AR — camera passthrough with virtual objects |
| `pc.XRTYPE_INLINE` | Non-immersive — renders XR content in a standard browser window |

### Reference Space Types

| Constant | Origin | Use Case |
|----------|--------|----------|
| `pc.XRSPACE_LOCAL` | Device position at session start | Seated / cockpit games |
| `pc.XRSPACE_LOCALFLOOR` | Floor level at session start | Standing / room-scale games |
| `pc.XRSPACE_BOUNDEDFLOOR` | Floor with play area bounds | Room-scale with guardian |
| `pc.XRSPACE_UNBOUNDED` | Real-world coordinates | Large-scale AR experiences |
| `pc.XRSPACE_VIEWER` | Head position | HUD elements, gaze-based UI |

### Ending a Session

```typescript
app.xr.end((err?: Error) => {
  if (err) console.error('Failed to end session:', err.message);
});

// Listen for session events
app.xr.on('start', () => console.log('XR session started'));
app.xr.on('end', () => console.log('XR session ended'));
app.xr.on('available:' + pc.XRTYPE_VR, (available: boolean) => {
  // Update UI button visibility
});
```

---

## Input Sources

XR input sources represent controllers, hands, screen taps, or gaze — unified under `XrInputSource`.

```typescript
app.xr.input.on('add', (inputSource: pc.XrInputSource) => {
  console.log('Input added:', inputSource.handedness); // 'left', 'right', 'none'
  console.log('Target ray mode:', inputSource.targetRayMode);
  // 'tracked-pointer' (controller), 'gaze', 'screen'
});

app.xr.input.on('remove', (inputSource: pc.XrInputSource) => {
  console.log('Input removed:', inputSource.handedness);
});

// Per-frame input state
app.on('update', () => {
  const sources = app.xr.input.inputSources;
  for (const source of sources) {
    // Ray for pointing / aiming
    const ray = source.getOrigin(); // pc.Vec3
    const dir = source.getDirection(); // pc.Vec3

    // Grip pose (where the controller physically is)
    if (source.grip) {
      const gripPos = source.getLocalPosition();
      const gripRot = source.getLocalRotation();
    }

    // Gamepad buttons and axes
    if (source.gamepad) {
      const trigger = source.gamepad.buttons[0]?.value ?? 0;
      const grip = source.gamepad.buttons[1]?.value ?? 0;
      const thumbstickX = source.gamepad.axes[2] ?? 0;
      const thumbstickY = source.gamepad.axes[3] ?? 0;
    }
  }
});

// Button events
app.xr.input.on('select', (inputSource: pc.XrInputSource) => {
  // Primary action (trigger pull)
});

app.xr.input.on('squeeze', (inputSource: pc.XrInputSource) => {
  // Grip button
});
```

---

## Hand Tracking

Optical hand tracking exposes 25 joints per hand (wrist + 4 joints per finger).

```typescript
// Check availability
if (app.xr.isAvailable(pc.XRTYPE_VR)) {
  app.xr.start(cameraEntity.camera!, pc.XRTYPE_VR, pc.XRSPACE_LOCALFLOOR, {
    optionalFeatures: ['hand-tracking'],
  });
}

// Access hand data from input sources
app.xr.input.on('add', (inputSource: pc.XrInputSource) => {
  if (inputSource.hand) {
    const hand: pc.XrHand = inputSource.hand;

    // Iterate fingers
    for (const finger of hand.fingers) {
      // finger.index: 0=thumb, 1=index, 2=middle, 3=ring, 4=little
      for (const joint of finger.joints) {
        const pos: pc.Vec3 = joint.getPosition();
        const rot: pc.Quat = joint.getRotation();
        const radius: number = joint.radius; // approximate joint size
      }
    }

    // Wrist joint directly
    const wrist = hand.wrist;
    if (wrist) {
      const wristPos = wrist.getPosition();
    }

    // Track/lose events
    hand.on('tracking', () => console.log('Hand tracking acquired'));
    hand.on('trackinglost', () => console.log('Hand tracking lost'));
  }
});
```

### Pinch Detection (Game Interaction)

```typescript
// Simple pinch detection using thumb-index distance
function isPinching(hand: pc.XrHand, threshold: number = 0.02): boolean {
  const thumbTip = hand.fingers[0]?.joints[3]; // thumb tip
  const indexTip = hand.fingers[1]?.joints[3]; // index tip
  if (!thumbTip || !indexTip) return false;

  const distance = thumbTip.getPosition().distance(indexTip.getPosition());
  return distance < threshold;
}
```

---

## Hit Testing (AR)

Cast rays against real-world geometry to place virtual objects on floors, walls, and tables.

```typescript
app.xr.start(cameraEntity.camera!, pc.XRTYPE_AR, pc.XRSPACE_LOCALFLOOR, {
  optionalFeatures: ['hit-test'],
});

// Start a hit test source from the viewer's gaze
app.xr.on('start', () => {
  app.xr.hitTest.start({
    spaceType: pc.XRSPACE_VIEWER,
    callback: (err: Error | null, hitTestSource: pc.XrHitTestSource | null) => {
      if (err || !hitTestSource) return;

      hitTestSource.on('result', (position: pc.Vec3, rotation: pc.Quat) => {
        // Move a placement indicator to the hit point
        placementMarker.setPosition(position);
        placementMarker.setRotation(rotation);
      });
    },
  });
});
```

### Controller-Based Hit Testing

```typescript
app.xr.input.on('add', (inputSource: pc.XrInputSource) => {
  app.xr.hitTest.start({
    inputSource: inputSource, // ray from this controller
    callback: (err, hitTestSource) => {
      if (!hitTestSource) return;
      hitTestSource.on('result', (position, rotation) => {
        // Place object where controller points at real geometry
      });
    },
  });
});
```

---

## Anchors

Anchors pin virtual objects to real-world positions that persist even as the device's spatial understanding improves.

```typescript
app.xr.start(cameraEntity.camera!, pc.XRTYPE_AR, pc.XRSPACE_LOCALFLOOR, {
  optionalFeatures: ['anchors'],
});

// Create an anchor at a hit test result
app.xr.anchors.create(position, rotation, (err, anchor) => {
  if (err || !anchor) return;

  // Anchor tracks real-world position
  app.on('update', () => {
    const anchorPos = anchor.getPosition();
    const anchorRot = anchor.getRotation();
    gameObject.setPosition(anchorPos);
    gameObject.setRotation(anchorRot);
  });

  // Clean up
  anchor.on('destroy', () => {
    console.log('Anchor lost');
  });
});

// Persistent anchors (survive between sessions)
if (app.xr.anchors.persistence) {
  // Restore anchors from previous session
  const uuids = app.xr.anchors.persistence.uuids;
  for (const uuid of uuids) {
    app.xr.anchors.persistence.restore(uuid);
  }
}
```

---

## Depth Sensing (AR)

Access depth information from the AR camera for occlusion and physics interactions with the real world.

```typescript
app.xr.start(cameraEntity.camera!, pc.XRTYPE_AR, pc.XRSPACE_LOCALFLOOR, {
  optionalFeatures: ['depth-sensing'],
  depthSensing: {
    usagePreference: pc.XRDEPTHSENSINGUSAGE_CPU, // or GPU
    dataFormatPreference: pc.XRDEPTHSENSINGFORMAT_L8A8,
  },
});

// CPU path — query depth at specific coordinates
app.on('update', () => {
  if (app.xr.views.list.length > 0) {
    const view = app.xr.views.list[0];
    if (view.depthInfo) {
      // Get depth at screen center (normalized 0-1 coordinates)
      const depthAtCenter = view.depthInfo.getDepth(0.5, 0.5);
      console.log('Depth at center:', depthAtCenter, 'meters');
    }
  }
});
```

> **GPU vs CPU path:** The GPU path provides a depth texture for shader-based occlusion (virtual objects hidden behind real furniture). The CPU path is better for gameplay logic (measuring distances, floor detection). Performance varies by device — Quest prefers GPU, Android phones typically support both.

---

## Mesh Detection & Plane Detection (MR)

### Plane Detection

Detects flat surfaces (floors, walls, tables) as oriented rectangles:

```typescript
app.xr.start(cameraEntity.camera!, pc.XRTYPE_AR, pc.XRSPACE_LOCALFLOOR, {
  optionalFeatures: ['plane-detection'],
});

app.xr.planeDetection.on('add', (plane: pc.XrPlane) => {
  console.log('Plane detected:', plane.orientation); // 'horizontal' or 'vertical'
  const pos = plane.getPosition();
  const rot = plane.getRotation();
  const points = plane.points; // boundary polygon vertices

  // Create a visual representation
  // Use points to build a mesh matching the plane shape
});

app.xr.planeDetection.on('remove', (plane: pc.XrPlane) => {
  // Clean up associated visuals
});
```

### Mesh Detection

Provides triangle meshes of real-world geometry (furniture, room structure):

```typescript
app.xr.start(cameraEntity.camera!, pc.XRTYPE_AR, pc.XRSPACE_LOCALFLOOR, {
  optionalFeatures: ['mesh-detection'],
});

app.xr.meshDetection.on('add', (xrMesh: pc.XrMesh) => {
  // xrMesh provides vertices and indices for a triangle mesh
  // representing detected real-world geometry
  const pos = xrMesh.getPosition();
  const rot = xrMesh.getRotation();
});

app.xr.meshDetection.on('remove', (xrMesh: pc.XrMesh) => {
  // Clean up
});
```

---

## Light Estimation (AR)

Estimates real-world illumination so virtual objects match their environment:

```typescript
app.xr.start(cameraEntity.camera!, pc.XRTYPE_AR, pc.XRSPACE_LOCALFLOOR, {
  optionalFeatures: ['light-estimation'],
});

app.on('update', () => {
  const lightEst = app.xr.lightEstimation;

  if (lightEst.available) {
    // Dominant directional light
    const intensity = lightEst.intensity;   // number (lux-based)
    const color = lightEst.color;           // pc.Color
    const rotation = lightEst.rotation;     // pc.Quat — light direction

    // Apply to your scene's directional light
    directionalLight.light!.intensity = intensity;
    directionalLight.light!.color = color;
    directionalLight.setRotation(rotation);
  }
});
```

---

## DOM Overlay (AR)

Renders HTML UI elements on top of the AR camera feed — useful for menus, HUDs, and buttons.

```typescript
app.xr.start(cameraEntity.camera!, pc.XRTYPE_AR, pc.XRSPACE_LOCALFLOOR, {
  optionalFeatures: ['dom-overlay'],
  domOverlay: {
    root: document.getElementById('ar-overlay')!, // your HTML container
  },
});
```

```html
<!-- HTML overlay content -->
<div id="ar-overlay" style="pointer-events: none;">
  <button id="place-btn" style="pointer-events: auto; position: fixed; bottom: 20px;">
    Place Object
  </button>
</div>
```

---

## Performance Considerations for XR Games

### Frame Budget

| Target | Per-Frame Budget | Per-Eye Budget |
|--------|-----------------|----------------|
| Quest (72 Hz) | 13.8 ms | ~7 ms |
| Quest (90 Hz) | 11.1 ms | ~5.5 ms |
| PCVR (90 Hz) | 11.1 ms | ~5.5 ms |

### Optimization Tips

1. **Reduce draw calls** — use instancing, merge static geometry, batch materials.
2. **Lower resolution** — `app.graphicsDevice.maxPixelRatio = 1.0` on mobile headsets.
3. **Simplify shaders** — avoid real-time shadows in XR; bake lighting where possible.
4. **Limit transparent objects** — overdraw is expensive on mobile GPUs.
5. **Use single-pass stereo** when available — renders both eyes in one pass:
   ```typescript
   // PlayCanvas handles this automatically when the device supports it
   ```
6. **Foveated rendering** — Quest supports fixed foveated rendering, reducing peripheral resolution. This is typically handled at the browser/OS level.
7. **Avoid allocations in the render loop** — pre-allocate `Vec3`, `Quat`, and `Mat4` objects.

### Common Pitfalls

- **Don't move the XR camera directly** — the headset controls camera position. Move a parent entity instead.
- **Test on real hardware** — emulators don't reflect actual GPU/thermal constraints.
- **Handle session loss gracefully** — sessions can end unexpectedly (user removes headset, battery dies).
- **Request only needed features** — each optional feature has a performance cost. Don't request `mesh-detection` if you only need `hit-test`.
