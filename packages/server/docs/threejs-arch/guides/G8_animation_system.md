# Animation System

> **Category:** guide · **Engine:** Three.js · **Related:** [Camera Systems](G4_camera_systems.md), [Asset Loading](G3_asset_loading_gltf.md)

Three.js provides a complete keyframe animation system built around four core classes: `KeyframeTrack`, `AnimationClip`, `AnimationMixer`, and `AnimationAction`. This system handles skeletal animations from glTF models, morph target animations, procedural keyframes, and blending between multiple clips.

## Core Architecture

The animation pipeline flows in one direction: raw keyframe data is stored in `KeyframeTrack` instances, grouped into an `AnimationClip`, played through an `AnimationMixer` bound to an object, and controlled via `AnimationAction` handles.

```typescript
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// 1. Load a model with embedded animations
const loader = new GLTFLoader();
const gltf = await loader.loadAsync('/models/character.glb');
const model = gltf.scene;
scene.add(model);

// 2. Create a mixer bound to the model's root
const mixer = new THREE.AnimationMixer(model);

// 3. Create actions from the loaded clips
const idleAction = mixer.clipAction(gltf.animations[0]);
const walkAction = mixer.clipAction(gltf.animations[1]);
const runAction  = mixer.clipAction(gltf.animations[2]);

// 4. Play the idle animation
idleAction.play();
```

**Important:** You must call `mixer.update(deltaTime)` every frame for animations to advance.

```typescript
const clock = new THREE.Clock();

function animate(): void {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  mixer.update(delta);
  renderer.render(scene, camera);
}
animate();
```

## KeyframeTrack and AnimationClip

A `KeyframeTrack` stores times and values for a single animated property. Multiple tracks are grouped into an `AnimationClip`.

```typescript
// Procedural animation: bob up and down over 2 seconds
const positionKF = new THREE.VectorKeyframeTrack(
  '.position',            // property path
  [0, 0.5, 1.0, 1.5, 2], // times in seconds
  [
    0, 0, 0,              // start position
    0, 1, 0,              // peak
    0, 0, 0,              // return
    0, 1, 0,              // peak again
    0, 0, 0,              // end
  ]
);

const scaleKF = new THREE.VectorKeyframeTrack(
  '.scale',
  [0, 1, 2],
  [1, 1, 1, 1.2, 1.2, 1.2, 1, 1, 1]
);

const clip = new THREE.AnimationClip('bob', 2, [positionKF, scaleKF]);
```

### Track Types

| Track Class | Animated Property Type |
|---|---|
| `VectorKeyframeTrack` | Position, scale (Vector3) |
| `QuaternionKeyframeTrack` | Rotation (Quaternion) |
| `NumberKeyframeTrack` | Opacity, morph influence (scalar) |
| `BooleanKeyframeTrack` | Visibility (boolean) |
| `ColorKeyframeTrack` | Material color (Color) |
| `StringKeyframeTrack` | Texture filename swap |

## Crossfading Between Animations

Smooth transitions between clips use `crossFadeTo()` or `crossFadeFrom()` on an `AnimationAction`.

```typescript
function switchToWalk(duration: number = 0.4): void {
  // Ensure walk action is ready
  walkAction.reset();
  walkAction.setEffectiveTimeScale(1);
  walkAction.setEffectiveWeight(1);
  walkAction.play();

  // Crossfade from idle to walk
  idleAction.crossFadeTo(walkAction, duration, true);
}

function switchToIdle(duration: number = 0.4): void {
  idleAction.reset();
  idleAction.setEffectiveTimeScale(1);
  idleAction.setEffectiveWeight(1);
  idleAction.play();

  walkAction.crossFadeTo(idleAction, duration, true);
}
```

The third parameter (`warp`) synchronizes the time scales of both actions during the transition so they match duration. This prevents jarring speed changes mid-crossfade.

## Additive Animation Blending

Additive blending layers an animation on top of a base pose rather than replacing it. This is useful for layering expressions, breathing, or hit reactions onto a locomotion cycle.

```typescript
// Convert a clip to additive form
THREE.AnimationUtils.makeClipAdditive(breathingClip);

const breathingAction = mixer.clipAction(breathingClip);
breathingAction.blendMode = THREE.AdditiveAnimationBlendMode;
breathingAction.setEffectiveWeight(0.6);
breathingAction.play();

// Base locomotion plays simultaneously
walkAction.play();
// Result: walking + subtle breathing layered on top
```

### Weight Control for Additive Layers

Fade additive layers in and out smoothly:

```typescript
// Gradually layer in a "wounded" additive animation
function applyWounded(action: THREE.AnimationAction, targetWeight: number = 0.8): void {
  action.enabled = true;
  action.setEffectiveTimeScale(1);
  action.setEffectiveWeight(0);
  action.play();
  action.fadeIn(0.5); // ramp weight from 0 to 1 over 0.5s

  // Clamp at target weight after fade
  setTimeout(() => {
    action.setEffectiveWeight(targetWeight);
  }, 500);
}
```

## Animation State Machine Pattern

For games, a state machine is the standard approach to managing animation transitions:

```typescript
type AnimState = 'idle' | 'walk' | 'run' | 'jump';

class CharacterAnimator {
  private mixer: THREE.AnimationMixer;
  private actions: Map<AnimState, THREE.AnimationAction> = new Map();
  private currentState: AnimState = 'idle';

  constructor(model: THREE.Object3D, clips: Map<AnimState, THREE.AnimationClip>) {
    this.mixer = new THREE.AnimationMixer(model);

    for (const [state, clip] of clips) {
      const action = this.mixer.clipAction(clip);
      action.setEffectiveWeight(0);
      this.actions.set(state, action);
    }

    // Start in idle
    const idle = this.actions.get('idle')!;
    idle.setEffectiveWeight(1);
    idle.play();
  }

  transition(newState: AnimState, duration: number = 0.3): void {
    if (newState === this.currentState) return;

    const prevAction = this.actions.get(this.currentState)!;
    const nextAction = this.actions.get(newState)!;

    nextAction.reset();
    nextAction.setEffectiveWeight(1);
    nextAction.setEffectiveTimeScale(1);
    nextAction.play();

    prevAction.crossFadeTo(nextAction, duration, true);
    this.currentState = newState;
  }

  update(delta: number): void {
    this.mixer.update(delta);
  }
}
```

## Morph Target Animation

Morph targets (blend shapes) animate facial expressions, damage states, or shape deformations:

```typescript
// glTF models export morph targets on the mesh geometry
const face = model.getObjectByName('FaceMesh') as THREE.Mesh;
const morphDict = face.morphTargetDictionary!;

// Animate a smile via morph target influence
const smileTrack = new THREE.NumberKeyframeTrack(
  `${face.name}.morphTargetInfluences[${morphDict['smile']}]`,
  [0, 0.5, 1.5, 2.0],
  [0, 1, 1, 0] // smile ramps up, holds, then fades
);

const smileClip = new THREE.AnimationClip('smile', 2, [smileTrack]);
const smileAction = mixer.clipAction(smileClip);
smileAction.setLoop(THREE.LoopOnce, 1);
smileAction.clampWhenFinished = true;
smileAction.play();
```

## Loop Modes and Playback Control

```typescript
const action = mixer.clipAction(clip);

// Loop modes
action.setLoop(THREE.LoopRepeat, Infinity);    // default: loop forever
action.setLoop(THREE.LoopOnce, 1);              // play once and stop
action.setLoop(THREE.LoopPingPong, Infinity);   // alternate forward/backward

// Clamp at last frame instead of resetting
action.clampWhenFinished = true;

// Playback speed
action.setEffectiveTimeScale(1.5);  // 1.5x speed
action.setEffectiveTimeScale(-1);   // play backwards

// Jump to specific time
action.time = 0.75;

// Listen for completion
mixer.addEventListener('finished', (e: THREE.Event) => {
  console.log('Animation finished:', (e.action as THREE.AnimationAction).getClip().name);
});
```

## Performance Considerations

- **One mixer per animated object.** Each mixer evaluates all its active actions every frame. Avoid creating mixers for objects that are never animated.
- **Disable unused actions.** Call `action.stop()` or set `action.enabled = false` when an animation is not needed. Stopped actions cost zero CPU.
- **Cache clip actions.** `mixer.clipAction()` caches internally — calling it twice with the same clip returns the same action. Do not create new actions every frame.
- **Limit concurrent blends.** Blending 3+ actions simultaneously is expensive. In practice, one base + one additive layer covers most game scenarios.
- **Use `AnimationObjectGroup`** to share a single mixer across multiple identical meshes (e.g., crowd NPCs playing the same walk cycle).
- **Dispose when done.** Call `mixer.stopAllAction()` and `mixer.uncacheRoot(model)` when removing animated objects from the scene to free memory.

## WebGPU Notes

The Three.js animation system works identically with the `WebGPURenderer` — animations are computed on the CPU and applied to the scene graph before rendering. No animation code changes are required when migrating from `WebGLRenderer` to `WebGPURenderer`.
