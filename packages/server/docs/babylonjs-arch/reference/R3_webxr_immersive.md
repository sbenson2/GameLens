# R3 — WebXR Immersive Experiences

> **Category:** reference · **Engine:** Babylon.js · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md), [Input & Cameras](../guides/G9_input_cameras.md), [Physics with Havok](../guides/G1_physics_havok.md), [Official WebXR Docs](https://doc.babylonjs.com/features/featuresDeepDive/webXR/introToWebXR)

Babylon.js has the most complete WebXR integration of any web 3D framework. It wraps the browser's WebXR Device API behind high-level helpers that handle session management, controller input, hand tracking, teleportation, and AR features — all in TypeScript. As of 2026, WebXR is production-ready across Chrome, Edge, Firefox, and Safari, with WebGPU support bringing near-native rendering quality to headsets like Meta Quest 3 and Apple Vision Pro.

This reference covers VR and AR setup, input handling, locomotion, hand tracking, and performance tuning for immersive games.

---

## Quick Start — VR in 10 Lines

The `WebXRDefaultExperience` helper is the fastest way to add VR to any Babylon.js scene. It configures controllers, teleportation, and an enter-VR button automatically.

```typescript
import { Engine, Scene, Vector3, HemisphericLight, MeshBuilder } from '@babylonjs/core';

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const engine = new Engine(canvas, true);
const scene = new Scene(engine);

new HemisphericLight('light', new Vector3(0, 1, 0), scene);
MeshBuilder.CreateGround('ground', { width: 20, height: 20 }, scene);

// This single call adds: enter-VR button, controllers, teleportation, pointer
const xr = await scene.createDefaultXRExperienceAsync({
  floorMeshes: [scene.getMeshByName('ground')!],
});

engine.runRenderLoop(() => scene.render());
```

The `floorMeshes` array tells the teleportation system which surfaces the player can land on. Any mesh can be a floor — ramps, platforms, and stairs all work.

---

## Session Management

### Session Types

| Mode | WebXR Session Type | Use Case |
|------|-------------------|----------|
| Immersive VR | `immersive-vr` | Full VR headset experience |
| Immersive AR | `immersive-ar` | Camera passthrough with virtual overlays |
| Inline | `inline` | 3D viewer in a regular browser tab (non-immersive) |

### Manual Session Control

For fine-grained control, use `WebXRExperienceHelper` directly instead of the default experience:

```typescript
import { WebXRExperienceHelper } from '@babylonjs/core';

const xrHelper = await WebXRExperienceHelper.CreateAsync(scene);

// Enter VR manually
await xrHelper.enterXRAsync('immersive-vr', 'local-floor');

// Listen for session state changes
xrHelper.onStateChangedObservable.add((state) => {
  switch (state) {
    case WebXRState.ENTERING_XR:
      console.log('Entering XR...');
      break;
    case WebXRState.IN_XR:
      console.log('Now in XR');
      break;
    case WebXRState.EXITING_XR:
      console.log('Exiting XR...');
      break;
    case WebXRState.NOT_IN_XR:
      console.log('Back to 2D');
      break;
  }
});
```

### Reference Spaces

- **`local-floor`** — origin at floor level, resets when session starts (most common for games)
- **`bounded-floor`** — player has a defined play area boundary
- **`local`** — origin at headset position at session start
- **`unbounded`** — large-scale AR, no fixed origin

---

## Controller Input

### Accessing Controllers

Babylon.js abstracts XR controllers through `WebXRInputSource`. Each controller exposes its button/axis state and a pointer ray for interaction.

```typescript
const xr = await scene.createDefaultXRExperienceAsync({
  floorMeshes: [ground],
});

xr.input.onControllerAddedObservable.add((controller) => {
  console.log(`Controller added: ${controller.uniqueId}`);

  // The motion controller wraps physical buttons/axes
  controller.onMotionControllerInitObservable.add((motionController) => {
    // Get the trigger component
    const trigger = motionController.getComponent('xr-standard-trigger');
    if (trigger) {
      trigger.onButtonStateChangedObservable.add((component) => {
        if (component.pressed) {
          console.log('Trigger pressed!');
          // Fire weapon, grab object, etc.
        }
      });
    }

    // Get the thumbstick
    const thumbstick = motionController.getComponent('xr-standard-thumbstick');
    if (thumbstick) {
      thumbstick.onAxisValueChangedObservable.add((axes) => {
        // axes.x and axes.y for smooth locomotion
        console.log(`Thumbstick: ${axes.x}, ${axes.y}`);
      });
    }
  });
});

xr.input.onControllerRemovedObservable.add((controller) => {
  console.log(`Controller removed: ${controller.uniqueId}`);
});
```

### Standard Controller Components

| Component ID | Description |
|-------------|-------------|
| `xr-standard-trigger` | Main trigger (index finger) |
| `xr-standard-squeeze` | Grip/squeeze button (middle finger) |
| `xr-standard-thumbstick` | Thumbstick with axes + click |
| `a-button` / `b-button` | Face buttons (Quest, Index) |
| `x-button` / `y-button` | Face buttons (left controller) |

---

## Hand Tracking

Hand tracking is a first-class feature in Babylon.js, enabled as a WebXR feature module. It provides a full hand skeleton (25 joints per hand) and works on Quest 2/3/Pro and Vision Pro.

```typescript
import { WebXRFeatureName, WebXRHandTracking } from '@babylonjs/core';

const xr = await scene.createDefaultXRExperienceAsync({
  floorMeshes: [ground],
});

// Enable hand tracking feature
const handTracking = xr.baseExperience.featuresManager.enableFeature(
  WebXRFeatureName.HAND_TRACKING,
  'latest',
  {
    xrInput: xr.input,
    jointMeshes: {
      // Render visible joint spheres for debugging
      enablePhysics: true,         // Add physics to hand joints
      physicsProps: {
        friction: 0.5,
        restitution: 0.3,
      },
    },
  }
) as WebXRHandTracking;

// React to hand events
handTracking.onHandAddedObservable.add((hand) => {
  console.log(`Hand detected: ${hand.xrController.uniqueId}`);
});

// Check for pinch gesture each frame
scene.onBeforeRenderObservable.add(() => {
  const hands = handTracking.getHandByHandedness('right');
  if (hands) {
    const thumbTip = hands.getJointMesh('thumb-tip');
    const indexTip = hands.getJointMesh('index-finger-tip');
    if (thumbTip && indexTip) {
      const distance = thumbTip.position.subtract(indexTip.position).length();
      if (distance < 0.02) {
        // Pinch detected — grab, select, or interact
      }
    }
  }
});
```

---

## Teleportation

The built-in teleportation feature handles arc visualization, floor detection, and snap/smooth turning.

### Default Setup (included with createDefaultXRExperienceAsync)

```typescript
const xr = await scene.createDefaultXRExperienceAsync({
  floorMeshes: [ground, ramp, platform], // All walkable surfaces
});

// Customize teleportation after creation
const teleportation = xr.teleportation;
teleportation.rotationAngle = Math.PI / 6;  // 30° snap turn increments
teleportation.backwardsMovementEnabled = true;
teleportation.parabolicRayEnabled = true;     // Arc trajectory (vs straight)
```

### Manual Teleportation Setup

```typescript
import { WebXRFeatureName, WebXRMotionControllerTeleportation } from '@babylonjs/core';

const teleportation = xr.baseExperience.featuresManager.enableFeature(
  WebXRFeatureName.TELEPORTATION,
  'stable',
  {
    xrInput: xr.input,
    floorMeshes: [ground],
    defaultTargetMeshOptions: {
      teleportationFillColor: '#55ff99',
      teleportationBorderColor: '#ffffff',
      torusArrowMaterial: undefined, // Use default
    },
    forceHandedness: 'left', // Only left controller triggers teleport
  }
) as WebXRMotionControllerTeleportation;
```

### Smooth Locomotion Alternative

For games that prefer smooth movement over teleportation:

```typescript
import { WebXRFeatureName } from '@babylonjs/core';

// Disable teleportation, enable movement
xr.baseExperience.featuresManager.disableFeature(WebXRFeatureName.TELEPORTATION);

const movement = xr.baseExperience.featuresManager.enableFeature(
  WebXRFeatureName.MOVEMENT,
  'latest',
  {
    xrInput: xr.input,
    movementSpeed: 0.5,               // Units per second
    rotationSpeed: 1.0,               // Radians per second
    movementOrientationFollowsViewerPose: true, // Move where you look
  }
);
```

---

## AR Features

### Hit Testing (Place Objects in Real World)

```typescript
import { WebXRFeatureName, WebXRHitTest } from '@babylonjs/core';

const xr = await scene.createDefaultXRExperienceAsync({
  uiOptions: { sessionMode: 'immersive-ar' },
});

const hitTest = xr.baseExperience.featuresManager.enableFeature(
  WebXRFeatureName.HIT_TEST,
  'latest',
  {
    xrInput: xr.input,
    entityTypes: ['plane'],   // Detect real-world planes
  }
) as WebXRHitTest;

hitTest.onHitTestResultObservable.add((results) => {
  if (results.length > 0) {
    // Position a reticle/marker at the hit point
    const hitResult = results[0];
    hitResult.transformationMatrix.decompose(
      reticle.scaling,
      reticle.rotationQuaternion!,
      reticle.position
    );
    reticle.isVisible = true;
  }
});
```

### Light Estimation

```typescript
const lightEstimation = xr.baseExperience.featuresManager.enableFeature(
  WebXRFeatureName.LIGHT_ESTIMATION,
  'latest',
  {
    setSceneEnvironmentTexture: true, // Auto-apply environment map
    createDirectionalLightSource: true, // Create directional light matching real world
  }
);
```

---

## Performance for XR Games

VR and AR have strict performance requirements — dropped frames cause motion sickness.

### Frame Rate Targets

| Headset | Required FPS | Notes |
|---------|-------------|-------|
| Meta Quest 2/3 | 72–120 Hz | 90 Hz default, 120 Hz optional |
| Apple Vision Pro | 90 Hz | Higher pixel density |
| Desktop PCVR | 90 Hz | SteamVR standard |

### Optimization Checklist

1. **Draw calls under 100** — Use instancing (`InstancedMesh`, `Mesh.thinInstanceAdd()`) for repeated objects.
2. **Stereo rendering** — Babylon.js uses multiview rendering when available (1 draw call for both eyes). Enable via `engine.getCaps().multiview`.
3. **Fixed foveated rendering** — Reduces pixel count in peripheral vision. Supported on Quest:
   ```typescript
   xr.baseExperience.featuresManager.enableFeature(
     WebXRFeatureName.LAYERS, 'latest', {
       preferMultiviewOnInit: true,
     }
   );
   ```
4. **LOD groups** — Use lower-poly models for distant objects. Babylon.js has built-in `addLODLevel()` on meshes.
5. **Bake lighting** — Real-time shadows are expensive in stereo. Use lightmaps where possible.
6. **Avoid garbage collection** — Pool temporary `Vector3`/`Quaternion` objects. GC pauses cause frame drops.
7. **Texture compression** — Use Basis Universal / KTX2 for textures (see [Asset Loading guide](../guides/G4_asset_loading_gltf.md)).

### Profiling in XR

```typescript
scene.onBeforeRenderObservable.add(() => {
  const fps = engine.getFps().toFixed(0);
  const drawCalls = scene.getEngine()._drawCalls.current;
  // Display in a 3D text panel attached to the controller
});
```

Use the [Inspector](../reference/R2_inspector_debugging.md) in desktop mode to identify bottlenecks before testing in the headset.

---

## Feature Detection

Always check for XR support before showing VR/AR UI:

```typescript
import { WebXRSessionManager } from '@babylonjs/core';

const supported = await WebXRSessionManager.IsSessionSupportedAsync('immersive-vr');
if (supported) {
  // Show "Enter VR" button
}

const arSupported = await WebXRSessionManager.IsSessionSupportedAsync('immersive-ar');
if (arSupported) {
  // Show "Enter AR" button
}
```

Provide a graceful fallback for non-XR browsers — desktop orbit controls or a flat-screen mode — so the game remains playable everywhere.
