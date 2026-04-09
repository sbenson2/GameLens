# PlayCanvas Animation System — State Graphs, Layers, and Blend Trees

> **Category:** guide · **Engine:** PlayCanvas v2+ · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md), [Scripting System](G1_scripting_system.md), [PlayCanvas Rules](../playcanvas-rules.md)

PlayCanvas uses a state-machine-based animation system built on the `AnimComponent`. You define states (Idle, Walk, Jump), connect them with conditional transitions, and the engine handles blending. Layers let you animate different body parts independently (e.g., upper body attack while lower body walks), and blend trees create smooth parameter-driven transitions between animation clips.

## Core Concepts

### AnimComponent

The `AnimComponent` is attached to any entity with a model/render component. It drives animation playback through a state graph:

```typescript
// Access the anim component on an entity
const anim = this.entity.anim;

// Playback controls
anim.speed = 1.0;    // global speed multiplier (0 = paused)
anim.playing = true;  // play/pause all layers
```

### AnimStateGraph Asset

An `AnimStateGraph` defines the state machine — a JSON asset describing states, transitions, parameters, and layers. You can create it visually in the PlayCanvas Editor or define it in code via `loadStateGraph()`.

### Animation Assets

Individual animation clips (imported from FBX or glTF) that are assigned to states in the graph. Each state plays one clip or drives a blend tree.

## Setting Up Animations

### Step 1 — Assign a State Graph

In the PlayCanvas Editor, add an `Anim` component to your entity and assign an `AnimStateGraph` asset. Or in code:

```typescript
// Load a state graph programmatically
this.entity.anim.loadStateGraph({
  layers: [
    {
      name: "Base",
      states: [
        { name: "START" },
        { name: "Idle", speed: 1, loop: true },
        { name: "Walk", speed: 1, loop: true },
        { name: "Jump", speed: 1, loop: false }
      ],
      transitions: [
        { from: "START", to: "Idle", time: 0, conditions: [] },
        {
          from: "Idle", to: "Walk", time: 0.2,
          conditions: [{ parameterName: "isMoving", predicate: "EQUAL_TO", value: true }]
        },
        {
          from: "Walk", to: "Idle", time: 0.2,
          conditions: [{ parameterName: "isMoving", predicate: "EQUAL_TO", value: false }]
        },
        {
          from: "ANY", to: "Jump", time: 0.1,
          conditions: [{ parameterName: "jump", predicate: "EQUAL_TO", value: true }]
        },
        { from: "Jump", to: "Idle", time: 0.2, exitTime: 0.9, conditions: [] }
      ]
    }
  ],
  parameters: {
    isMoving: { type: "BOOLEAN", value: false },
    jump: { type: "TRIGGER", value: false }
  }
});
```

### Step 2 — Assign Animation Clips to States

```typescript
// Assign animation track assets to state graph states
this.entity.anim.assignAnimation("Idle", idleAnimTrack);
this.entity.anim.assignAnimation("Walk", walkAnimTrack);
this.entity.anim.assignAnimation("Jump", jumpAnimTrack);
```

### Step 3 — Drive Parameters from Game Logic

```typescript
// In your movement script's update():
update(dt: number): void {
  const isMoving = this.entity.rigidbody.linearVelocity.length() > 0.1;
  this.entity.anim.setBoolean("isMoving", isMoving);

  if (this.app.keyboard.wasPressed(pc.KEY_SPACE)) {
    this.entity.anim.setTrigger("jump");
  }
}
```

## Parameters

Parameters are the bridge between game logic and animation state. Four types are available:

| Type | API Methods | Use Case |
|------|------------|----------|
| `BOOLEAN` | `setBoolean()` / `getBoolean()` | Toggle states (isGrounded, isAiming) |
| `INTEGER` | `setInteger()` / `getInteger()` | Indexed states (weapon type, stance) |
| `FLOAT` | `setFloat()` / `getFloat()` | Blend tree weights (speed, direction) |
| `TRIGGER` | `setTrigger()` / `resetTrigger()` | One-shot events (jump, attack, hit) |

Triggers automatically reset after the transition fires. Use `setTrigger(name, true)` to make a trigger last only a single frame (useful for rapid inputs).

## Transitions

Transitions connect states and fire when conditions are met:

| Property | Description |
|----------|-------------|
| `time` (duration) | Blend time in seconds between source and destination clips |
| `exitTime` | Normalized time (0–1) at which the source state is allowed to exit |
| `offset` | Start the destination animation at this normalized time |
| `interruption` | Whether other transitions can cut in during this blend |

The `ANY` state allows a transition from every state — use it for globally available actions like Jump, Hurt, or Die.

## Layers — Animating Body Parts Independently

Layers let you overlay animations. A base layer drives full-body locomotion while an upper-body layer handles aiming or reloading:

### Creating Layers

```typescript
// Add an upper-body layer with a bone mask
const mask = {
  // Include only spine and arm bones
  "Spine": { children: true },
  "LeftArm": { children: true },
  "RightArm": { children: true }
};

this.entity.anim.addLayer("UpperBody", 1.0, mask, "Additive");
```

### Blend Modes

- **Override:** The layer completely replaces bone transforms for masked bones. Use when the upper-body animation is self-contained (e.g., a reload animation).
- **Additive:** The layer's animation is added on top of lower layers. Use for subtle overlays (e.g., a breathing animation, head-look offset).

### Adjusting Layer Weight at Runtime

```typescript
// Smoothly blend in the aiming layer
const aimLayer = this.entity.anim.findAnimationLayer("UpperBody");
if (aimLayer) {
  aimLayer.weight = pc.math.lerp(aimLayer.weight, isAiming ? 1.0 : 0.0, dt * 5);
}
```

### Weight Normalization

Enable `normalizeWeights` on the AnimComponent to automatically normalize layer weights so they sum to 1.0 — useful when dynamically blending multiple additive layers:

```typescript
this.entity.anim.normalizeWeights = true;
```

## Blend Trees — Parameter-Driven Animation Mixing

Blend trees replace a single clip in a state with a weighted mix of clips driven by parameters. Use them for smooth locomotion (idle → walk → run based on speed).

### Assigning Blend Tree Nodes

Blend tree node paths use dot notation: `StateName.NodeName`:

```typescript
// A locomotion state with a 1D blend tree
this.entity.anim.assignAnimation("Locomotion.Idle", idleTrack);
this.entity.anim.assignAnimation("Locomotion.Walk", walkTrack);
this.entity.anim.assignAnimation("Locomotion.Run", runTrack);

// Drive the blend with a float parameter
this.entity.anim.setFloat("speed", currentSpeed);
```

### Blend Tree Types

| Type | Parameters | Use Case |
|------|-----------|----------|
| **1D** | 1 float | Speed-based locomotion (idle → walk → run) |
| **2D Directional** | 2 floats | Directional movement (forward/back + strafe) |
| **2D Cartesian** | 2 floats | Same as directional but with different interpolation |

Define blend trees in the AnimStateGraph asset (Editor or JSON) and assign clips to leaf nodes via `assignAnimation()`.

## Animation Events

Fire callbacks at specific points in an animation (footsteps, attack hits, effect spawns):

```typescript
// Listen for anim events on the entity
this.entity.anim.on("footstep", () => {
  this.playFootstepSound();
  this.spawnDustParticle();
});
```

Events are defined in the animation asset or added in the PlayCanvas Editor's animation event timeline.

## Common Game Patterns

### Locomotion Controller

```typescript
update(dt: number): void {
  const velocity = this.entity.rigidbody.linearVelocity;
  const speed = new pc.Vec3(velocity.x, 0, velocity.z).length();

  this.entity.anim.setFloat("speed", speed);
  this.entity.anim.setBoolean("isGrounded", this.isGrounded());

  if (this.app.keyboard.wasPressed(pc.KEY_SPACE) && this.isGrounded()) {
    this.entity.anim.setTrigger("jump");
  }
}
```

### Hit Reaction with Layer Override

```typescript
onDamage(): void {
  // Play hit reaction on upper body without interrupting legs
  const hitLayer = this.entity.anim.findAnimationLayer("UpperBody");
  if (hitLayer) {
    hitLayer.weight = 1.0;
    // Transition to hit state via parameter
    this.entity.anim.setTrigger("hit");
  }
}
```

### Root Motion

PlayCanvas does not have built-in root motion extraction. To implement it, sample the root bone's delta transform each frame and apply it to the entity's position:

```typescript
update(dt: number): void {
  const rootBone = this.entity.findByName("RootBone");
  if (rootBone) {
    const delta = rootBone.getLocalPosition();
    this.entity.translateLocal(delta.x, 0, delta.z);
    rootBone.setLocalPosition(0, delta.y, 0); // zero out XZ on bone
  }
}
```

## Performance Notes

- **Animation clip count:** Each active layer evaluates its state graph every frame. Keep layer count under 4 for characters with complex state graphs.
- **Blend tree evaluation:** Blend trees add interpolation cost per leaf node. A 2D blend tree with 9 clips is more expensive than a 1D tree with 3.
- **Crowd animation:** For large crowds, consider reducing animation update frequency on distant entities by setting `anim.speed = 0` and manually advancing on a timer.
- **Clip compression:** Use glTF/GLB with quantized animation data to reduce memory. PlayCanvas handles compressed clips natively through its asset pipeline.
