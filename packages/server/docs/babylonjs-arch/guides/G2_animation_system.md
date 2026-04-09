# G2 — Animation System

> **Category:** guide · **Engine:** Babylon.js · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md), [Physics with Havok](G1_physics_havok.md), [Animation Docs](https://doc.babylonjs.com/features/featuresDeepDive/animation/)

Babylon.js has a comprehensive built-in animation system covering property animation, skeletal animation, animation blending, masking, and (as of v9.0) animation retargeting. For games, the key classes are `Animation`, `AnimationGroup`, and `Skeleton`.

This guide covers the animation pipeline from loading glTF animations through blending and state management for game characters.

---

## Animation Architecture

```
Scene
├── AnimationGroup "Run"          ← groups multiple target animations
│   ├── TargetedAnimation (Hips → position)
│   ├── TargetedAnimation (LeftLeg → rotation)
│   └── TargetedAnimation (RightLeg → rotation)
├── AnimationGroup "Idle"
│   └── ...
└── Mesh "Character"
    └── Skeleton
        ├── Bone "Hips"
        ├── Bone "Spine"
        ├── Bone "LeftLeg"
        └── ...
```

**AnimationGroup** is the primary API for game animation. It wraps multiple per-bone animations into a single playable unit with play/pause/stop, speed, weight, and blending controls.

---

## Loading Animations from glTF

Most game animations come from glTF/GLB files. Babylon.js automatically creates `AnimationGroup` instances for each animation clip:

```typescript
import { SceneLoader } from '@babylonjs/core/Loading/sceneLoader';
import '@babylonjs/loaders/glTF'; // side-effect import for glTF support

const result = await SceneLoader.ImportMeshAsync(
  '',                    // mesh names (empty = all)
  '/models/',            // root URL
  'character.glb',       // filename
  scene
);

// All animations from the glTF file
const animationGroups = result.animationGroups;
console.log('Loaded animations:', animationGroups.map(ag => ag.name));
// e.g. ["Idle", "Run", "Jump", "Attack"]

// Play an animation
const idle = animationGroups.find(ag => ag.name === 'Idle')!;
idle.start(true); // true = loop
```

### AnimationGroup Key Methods

| Method | Description |
|--------|-------------|
| `start(loop?, from?, to?)` | Play from start (optionally loop, set range) |
| `stop()` | Stop and reset to frame 0 |
| `pause()` | Pause at current frame |
| `play(loop?)` | Resume from current frame |
| `reset()` | Reset to start without stopping |
| `setWeightForAllAnimatables(weight)` | Set blend weight (0–1) |
| `speedRatio` | Playback speed multiplier (1.0 = normal, -1.0 = reverse) |

---

## Animation Blending

Blending allows smooth transitions between animation states (e.g., idle → run) and layering multiple animations simultaneously (e.g., run + aim weapon).

### Crossfade Between Two Animations

```typescript
class AnimationController {
  private currentGroup: AnimationGroup | null = null;

  crossfade(target: AnimationGroup, duration: number = 0.3, loop = true): void {
    // Fade out current
    if (this.currentGroup && this.currentGroup !== target) {
      const outgoing = this.currentGroup;
      outgoing.setWeightForAllAnimatables(1.0);

      // Animate weight from 1 → 0
      const fadeOut = new Animation(
        'fadeOut', 'weight', 60,
        Animation.ANIMATIONTYPE_FLOAT,
        Animation.ANIMATIONLOOPMODE_CONSTANT
      );
      fadeOut.setKeys([
        { frame: 0, value: 1.0 },
        { frame: duration * 60, value: 0.0 },
      ]);
      // Use scene.beginDirectAnimation or manual update
      scene.registerBeforeRender(function fadeOutTick() {
        const w = outgoing.animatables[0]?.weight ?? 0;
        if (w <= 0.01) {
          outgoing.stop();
          scene.unregisterBeforeRender(fadeOutTick);
        }
      });
    }

    // Fade in target
    target.start(loop);
    target.setWeightForAllAnimatables(0.0);

    // Animate weight from 0 → 1 over duration
    const startTime = performance.now();
    scene.registerBeforeRender(function fadeInTick() {
      const elapsed = (performance.now() - startTime) / 1000;
      const t = Math.min(elapsed / duration, 1.0);
      target.setWeightForAllAnimatables(t);
      if (t >= 1.0) {
        scene.unregisterBeforeRender(fadeInTick);
      }
    });

    this.currentGroup = target;
  }
}
```

### Additive Blending (v7+)

Additive blending layers an animation on top of a base pose. Useful for hit reactions, breathing, and weapon sway:

```typescript
// Base locomotion at full weight
runAnimation.start(true);
runAnimation.setWeightForAllAnimatables(1.0);

// Additive hit reaction at partial weight
hitReaction.start(false);
hitReaction.setWeightForAllAnimatables(0.5);
hitReaction.enableBlending = true;
hitReaction.blendingSpeed = 0.05;
```

---

## Animation Masks (v7+)

Masks let you apply an animation to specific bones only. This is critical for games — e.g., upper body plays an aim animation while lower body plays a run animation.

```typescript
// Create a mask that targets only upper body bones
const upperBodyMask = new AnimationGroupMask(skeleton, {
  // Specify bones to INCLUDE
  includeFrom: 'Spine', // include Spine and all children
});

// Apply mask to the animation group
aimAnimation.mask = upperBodyMask;

// Now upper body aims while lower body runs
runAnimation.start(true);
runAnimation.setWeightForAllAnimatables(1.0);

aimAnimation.start(true);
aimAnimation.setWeightForAllAnimatables(1.0);
// Only Spine, Chest, Arms, Head are affected by aim
```

---

## Animation Retargeting (v9.0)

Animation retargeting lets you share animations across characters with different skeletons — a huge workflow win for games with multiple character models.

```typescript
import { AnimationRetargeting } from '@babylonjs/core/Animations/animationRetargeting';

// Source: the character the animation was authored for
const sourceResult = await SceneLoader.ImportMeshAsync('', '/models/', 'source_character.glb', scene);
const sourceAnims = sourceResult.animationGroups;
const sourceSkeleton = sourceResult.skeletons[0];

// Target: a different character you want to apply the animation to
const targetResult = await SceneLoader.ImportMeshAsync('', '/models/', 'target_character.glb', scene);
const targetSkeleton = targetResult.skeletons[0];

// Create retargeting instance
const retargeting = new AnimationRetargeting(
  sourceSkeleton,
  targetSkeleton,
  { adjustPosition: true }  // compensate for different bone lengths
);

// Retarget a specific animation group
const retargetedRun = retargeting.retargetAnimationGroup(
  sourceAnims.find(ag => ag.name === 'Run')!
);

// Play retargeted animation on the target character
retargetedRun.start(true);
```

### How Retargeting Works

The system mathematically remaps each bone transform from the source skeleton to the target, compensating for differences in reference pose, bone length, and hierarchy. This means you can build a single animation library (e.g., from Mixamo) and apply it across all your game characters.

**Limitations:**
- Source and target skeletons must have a similar bone hierarchy (same number of major joints).
- Extreme proportion differences (e.g., humanoid → quadruped) won't produce good results.
- An interactive **Animation Retargeting Tool** in the Babylon.js playground lets you test mappings visually.

---

## Programmatic Animations

For UI, camera moves, and simple tweens, use `Animation` directly:

```typescript
import { Animation, CubicEase, EasingFunction } from '@babylonjs/core';

// Animate a mesh's position.y from 0 → 3 over 60 frames
const jumpAnim = new Animation(
  'jump',                              // name
  'position.y',                        // target property (dot-path)
  60,                                  // frames per second
  Animation.ANIMATIONTYPE_FLOAT,       // value type
  Animation.ANIMATIONLOOPMODE_CONSTANT // hold last frame
);

jumpAnim.setKeys([
  { frame: 0, value: 0 },
  { frame: 15, value: 3 },  // peak
  { frame: 30, value: 0 },  // land
]);

// Easing
const ease = new CubicEase();
ease.setEasingMode(EasingFunction.EASINGMODE_EASEOUT);
jumpAnim.setEasingFunction(ease);

// Play on a mesh
scene.beginDirectAnimation(mesh, [jumpAnim], 0, 30, false, 1.0, () => {
  console.log('Jump animation complete');
});
```

### Common Easing Functions

| Class | Game Use |
|-------|----------|
| `CubicEase` | UI transitions, smooth movement |
| `BounceEase` | Item drops, impact feedback |
| `ElasticEase` | Squash-and-stretch, popup UI |
| `SineEase` | Gentle oscillation, idle bob |
| `BackEase` | Overshoot-and-settle (menus) |

---

## Game Animation State Machine Pattern

For managing complex character states, build a simple state machine on top of AnimationGroups:

```typescript
type AnimState = 'idle' | 'run' | 'jump' | 'attack';

class CharacterAnimator {
  private state: AnimState = 'idle';
  private groups: Map<AnimState, AnimationGroup>;
  private controller: AnimationController;

  constructor(animationGroups: AnimationGroup[]) {
    this.groups = new Map();
    for (const ag of animationGroups) {
      this.groups.set(ag.name.toLowerCase() as AnimState, ag);
    }
    this.controller = new AnimationController();
    this.controller.crossfade(this.groups.get('idle')!, 0, true);
  }

  transition(newState: AnimState): void {
    if (newState === this.state) return;

    const group = this.groups.get(newState);
    if (!group) return;

    // Determine crossfade duration and loop based on state
    const loop = newState !== 'jump' && newState !== 'attack';
    const fadeTime = newState === 'attack' ? 0.1 : 0.25;

    this.controller.crossfade(group, fadeTime, loop);
    this.state = newState;
  }

  update(velocity: number, isGrounded: boolean, isAttacking: boolean): void {
    if (isAttacking) {
      this.transition('attack');
    } else if (!isGrounded) {
      this.transition('jump');
    } else if (velocity > 0.1) {
      this.transition('run');
    } else {
      this.transition('idle');
    }
  }
}
```

---

## Performance Considerations

| Concern | Guideline |
|---------|-----------|
| **Bone count** | Keep under 65 bones per skeleton for mobile. 100+ works on desktop. |
| **Active AnimationGroups** | Each playing group evaluates every frame. Stop groups you don't need. |
| **Blending overhead** | Each blended layer multiplies per-bone work. Limit to 2-3 simultaneous layers. |
| **Baked vs. sampled** | Baked texture animations offload skeletal evaluation to the GPU — ideal for crowds (100+ characters). |
| **Animation compression** | Use glTF with Draco or meshopt compression to reduce animation data size 60-80%. |
| **Retargeting cost** | `retargetAnimationGroup()` is a one-time cost at load. Cache the result — don't retarget every frame. |

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Not stopping unused AnimationGroups | Call `animGroup.stop()` when off-screen or irrelevant |
| Playing the same AnimationGroup on multiple meshes | Clone the group with `animGroup.clone()` — sharing causes conflicts |
| Forgetting `enableBlending` for smooth transitions | Set `enableBlending = true` and `blendingSpeed` on animatables |
| Using `scene.beginAnimation` for complex characters | Use `AnimationGroup` — it coordinates multiple bones automatically |
| Retargeting at runtime every frame | Retarget once at load time and cache the resulting AnimationGroup |
