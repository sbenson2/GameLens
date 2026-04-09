# G30 — Advanced Animation & Inverse Kinematics

> **Category:** Guide · **Engine:** Godot 4.4–4.6+ · **Language:** GDScript / C#  
> **Related:** [G8 Animation Systems](./G8_animation_systems.md) · [G5 Physics & Collision](./G5_physics_and_collision.md) · [G14 Navigation & Pathfinding](./G14_navigation_and_pathfinding.md) · [G23 Advanced Physics](./G23_advanced_physics.md)

---

## What This Guide Covers

G8 covers Godot's animation fundamentals — AnimationPlayer, basic AnimationTree, tweens, and sprite animation. This guide goes deeper into advanced AnimationTree patterns, the SkeletonModifier3D system, inverse kinematics (IK) introduced across Godot 4.4–4.6, procedural animation techniques, and combining authored animation with runtime bone modification.

**Version notes:** The SkeletonModifier3D framework was introduced in stages:
- **4.4** — `SkeletonModifier3D` base class, `LookAtModifier3D`, `RetargetModifier3D`
- **4.5** — `SpringBoneSimulator3D`, `BoneConstraint3D`, physics-based secondary motion
- **4.6** — Full IK solver suite: `TwoBoneIK3D`, `FABRIK3D`, `CCDIK3D`, `SplineIK3D`, `JacobianIK3D`

`SkeletonIK3D` is **deprecated** as of 4.5. New projects should use the `SkeletonModifier3D` family.

---

## Table of Contents

1. [AnimationTree Deep Dive](#1-animationtree-deep-dive)
2. [Advanced Blend Spaces](#2-advanced-blend-spaces)
3. [Animation Layers & Masking](#3-animation-layers--masking)
4. [Root Motion in Practice](#4-root-motion-in-practice)
5. [SkeletonModifier3D Architecture](#5-skeletonmodifier3d-architecture)
6. [LookAt & Aim Modifiers](#6-lookat--aim-modifiers)
7. [Inverse Kinematics: The Solver Suite](#7-inverse-kinematics-the-solver-suite)
8. [TwoBoneIK3D — Limb IK](#8-twoboneik3d--limb-ik)
9. [FABRIK3D — Chain IK](#9-fabrik3d--chain-ik)
10. [Foot Placement on Uneven Ground](#10-foot-placement-on-uneven-ground)
11. [Spring Bones & Secondary Motion](#11-spring-bones--secondary-motion)
12. [Animation Retargeting](#12-animation-retargeting)
13. [Procedural Animation Techniques](#13-procedural-animation-techniques)
14. [Combining Authored + Procedural Animation](#14-combining-authored--procedural-animation)
15. [Performance Considerations](#15-performance-considerations)
16. [Common Mistakes & Fixes](#16-common-mistakes--fixes)

---

## 1. AnimationTree Deep Dive

AnimationTree is Godot's blend graph — it mixes multiple animations based on parameters. G8 introduces it; here we cover advanced patterns.

### Node types

```
AnimationTree
├── AnimationNodeBlendTree      ← Manual blend graph with Add, Blend2, OneShot, etc.
├── AnimationNodeStateMachine   ← States with transitions (most common for characters)
├── AnimationNodeBlendSpace1D   ← 1D blend by one parameter (e.g. speed)
└── AnimationNodeBlendSpace2D   ← 2D blend by two parameters (e.g. move direction)
```

### Nested state machines

Complex characters benefit from hierarchical state machines:

```
Root StateMachine
├── Locomotion (sub-StateMachine)
│   ├── Idle
│   ├── Walk  ─── BlendSpace1D (speed)
│   └── Run   ─── BlendSpace1D (speed)
├── Combat (sub-StateMachine)
│   ├── Attack1
│   ├── Attack2
│   └── Block
├── Air (sub-StateMachine)
│   ├── Jump
│   ├── Fall
│   └── Land
└── Death
```

```gdscript
# Accessing nested state machine travel
var state_machine: AnimationNodeStateMachinePlayback = anim_tree.get(
    "parameters/playback"
)
state_machine.travel("Locomotion")

# Access sub-state playback
var locomotion_playback: AnimationNodeStateMachinePlayback = anim_tree.get(
    "parameters/Locomotion/playback"
)
locomotion_playback.travel("Run")
```

### Transition types

| Type | Behavior | Use Case |
|------|----------|----------|
| `TRANSITION_TYPE_IMMEDIATE` | Snap to new state instantly | Hit reactions, death |
| `TRANSITION_TYPE_SYNC` | Sync playback position | Walk → Run (keep stride sync) |
| `TRANSITION_TYPE_AT_END` | Wait for current to finish | Attack combo chains |

---

## 2. Advanced Blend Spaces

### BlendSpace2D for 8-direction movement

```gdscript
# In _physics_process — drive blend space from movement input
var move_input: Vector2 = Input.get_vector("left", "right", "up", "down")

# Transform to local character space for the blend
var local_move: Vector2 = move_input.rotated(-global_rotation)

anim_tree.set("parameters/Locomotion/blend_position", local_move)
```

### Placing animations in 2D space

```
      Forward (0, -1)
         Walk_F
        /      \
   Walk_FL    Walk_FR
      |          |
Left (-1,0) Idle (0,0) Right (1,0)
      |          |
   Walk_BL    Walk_BR
        \      /
         Walk_B
      Backward (0, 1)
```

**Tip:** Set `auto_triangles = true` on BlendSpace2D for automatic Delaunay triangulation. For fine control, disable it and define triangles manually.

### BlendSpace1D for speed interpolation

```gdscript
# Blend between walk and run based on speed
var speed: float = velocity.length()
var blend_value: float = clampf(speed / max_speed, 0.0, 1.0)
anim_tree.set("parameters/speed_blend/blend_position", blend_value)
```

---

## 3. Animation Layers & Masking

Layers let different body parts play different animations simultaneously — e.g. legs walk while arms aim a weapon.

### Setting up in AnimationTree

Use `AnimationNodeAdd2` or `AnimationNodeBlend2` with a filter (bone mask):

```gdscript
# BlendTree approach: Add2 node with upper body filter
# In the editor:
# 1. Create an Add2 node in BlendTree
# 2. Enable "Filter" on the Add2 node
# 3. Check upper body bones: Spine, Chest, Neck, Head, Arms
# 4. Connect: Base animation → Input 0, Upper body anim → Input 1
# 5. Control blend amount in code:

anim_tree.set("parameters/upper_body_add/add_amount", 1.0)  # full upper body override
```

### OneShot for temporary overlays

```gdscript
# Play a reload animation on top of locomotion
var oneshot: AnimationNodeOneShot = anim_tree.tree_root.get_node("reload_oneshot")

# Trigger via parameter
anim_tree.set("parameters/reload_oneshot/request", 
    AnimationNodeOneShot.ONE_SHOT_REQUEST_FIRE)

# To abort early
anim_tree.set("parameters/reload_oneshot/request",
    AnimationNodeOneShot.ONE_SHOT_REQUEST_ABORT)
```

---

## 4. Root Motion in Practice

Root motion extracts movement from the animation itself (the character moves because the animation says so, not because code moves them).

### Enabling root motion

1. Set `AnimationTree.root_motion_track` to the root bone path (e.g. `Armature/Skeleton3D:Hips`)
2. In code, apply the root motion delta:

```gdscript
# CharacterBody3D with root motion
func _physics_process(delta: float) -> void:
    # Get root motion from AnimationTree
    var root_motion: Vector3 = anim_tree.get_root_motion_position()
    var root_rotation: Quaternion = anim_tree.get_root_motion_rotation()
    
    # Apply rotation
    global_transform.basis = global_transform.basis * Basis(root_rotation)
    
    # Apply movement (transform to global space)
    velocity = (global_transform.basis * root_motion) / delta
    
    # Still apply gravity
    if not is_on_floor():
        velocity.y -= 9.8 * delta
    
    move_and_slide()
```

### C# equivalent

```csharp
public override void _PhysicsProcess(double delta)
{
    Vector3 rootMotion = _animTree.GetRootMotionPosition();
    Quaternion rootRotation = _animTree.GetRootMotionRotation();
    
    GlobalTransform = new Transform3D(
        GlobalTransform.Basis * new Basis(rootRotation),
        GlobalTransform.Origin
    );
    
    Velocity = (GlobalTransform.Basis * rootMotion) / (float)delta;
    
    if (!IsOnFloor())
        Velocity = new Vector3(Velocity.X, Velocity.Y - 9.8f * (float)delta, Velocity.Z);
    
    MoveAndSlide();
}
```

---

## 5. SkeletonModifier3D Architecture

`SkeletonModifier3D` is the base class for all runtime bone modification in Godot 4.4+. It replaces the deprecated `SkeletonIK3D` with a modular, composable system.

### Class hierarchy (as of Godot 4.6)

```
SkeletonModifier3D (base)
├── LookAtModifier3D          ── Head/eye tracking (4.4)
├── RetargetModifier3D        ── Animation retargeting (4.4)
├── SpringBoneSimulator3D     ── Physics-based jiggle/sway (4.5)
├── BoneConstraint3D          ── Bone-to-bone constraints (4.5)
├── AimModifier3D             ── Directional aiming (4.5)
├── ConvertTransformModifier3D ── Transform space conversion (4.5)
├── CopyTransformModifier3D   ── Copy transforms between bones (4.5)
├── LimitAngularVelocityModifier3D ── Smoothing (4.6)
├── BoneTwistDisperser3D      ── Twist distribution (4.6)
└── IKModifier3D (base for IK solvers) (4.6)
    ├── TwoBoneIK3D            ── Two-bone limb IK
    └── ChainIK3D (base)
        ├── SplineIK3D         ── Spline-based chain
        └── IterateIK3D (base)
            ├── FABRIK3D       ── Forward and Backward Reaching IK
            ├── CCDIK3D        ── Cyclic Coordinate Descent
            └── JacobianIK3D   ── Jacobian matrix solver
```

### How modifiers compose

Modifiers are children of `Skeleton3D` and process in tree order. This lets you chain them:

```
Skeleton3D
├── AnimationPlayer          ← Authored animation (runs first)
├── LookAtModifier3D         ← Head tracks a target
├── TwoBoneIK3D              ← Arms reach for weapon
├── TwoBoneIK3D              ← Feet planted on ground
├── SpringBoneSimulator3D    ← Hair/cloth physics (runs last)
└── LimitAngularVelocityModifier3D ← Smooth any jitter
```

Each modifier reads the current bone poses, applies its modification, and writes back. Later modifiers see the results of earlier ones.

### Enabling/disabling at runtime

```gdscript
# Toggle IK on/off
@onready var foot_ik: TwoBoneIK3D = $Skeleton3D/FootIK

func set_foot_ik_enabled(enabled: bool) -> void:
    foot_ik.active = enabled
```

---

## 6. LookAt & Aim Modifiers

### LookAtModifier3D (4.4+)

Makes a bone (typically head or eyes) track a target node:

```gdscript
# Scene setup:
# Skeleton3D
#   └── LookAtModifier3D
#        bone_name = "Head"
#        target_node = NodePath to target

@onready var look_at: LookAtModifier3D = $Skeleton3D/LookAtModifier3D

func _process(_delta: float) -> void:
    # Point the head at the current interaction target
    if current_target:
        look_at.target_node = current_target.get_path()
        look_at.active = true
    else:
        look_at.active = false
```

### AimModifier3D (4.5+)

For weapon aiming — rotates a bone chain toward a target:

```gdscript
@onready var aim_mod: AimModifier3D = $Skeleton3D/AimModifier

func aim_at(target_pos: Vector3) -> void:
    aim_mod.target = target_pos
    aim_mod.active = true
```

---

## 7. Inverse Kinematics: The Solver Suite

Godot 4.6 introduces a complete IK solver suite. Choose based on your use case:

| Solver | Bones | Deterministic | Best For |
|--------|-------|---------------|----------|
| `TwoBoneIK3D` | Exactly 2 | Always | Arms, legs (elbow/knee) |
| `FABRIK3D` | N-bone chain | Configurable | Tentacles, tails, spines |
| `CCDIK3D` | N-bone chain | No | Organic chains, reaching |
| `SplineIK3D` | N-bone chain | Always | Spines, snakes, ropes |
| `JacobianIK3D` | N-bone chain | No | Complex multi-target setups |

**Deterministic** means the solver produces the same result regardless of the previous frame's pose. Deterministic solvers are preferred for authored-animation blending because they don't accumulate drift.

---

## 8. TwoBoneIK3D — Limb IK

The most common IK use case: making arms reach targets or feet plant on ground.

### Setup

```
Skeleton3D
└── TwoBoneIK3D
     bone_name = "LeftFoot"        # tip bone
     target_node = @"../../FootTarget"  # Node3D target
```

The solver automatically finds the two-bone chain ending at `bone_name` and positions the intermediate joint (knee/elbow) using the pole vector.

### Pole vector (knee/elbow direction)

```gdscript
@onready var arm_ik: TwoBoneIK3D = $Skeleton3D/ArmIK

func _ready() -> void:
    # Pole node controls elbow direction
    arm_ik.pole_node = $ElbowPoleTarget.get_path()
```

Without a pole target, the solver picks a default plane — which can cause knees to bend sideways. Always set a pole target for limbs.

### GDScript: dynamic hand IK

```gdscript
@onready var hand_ik: TwoBoneIK3D = $Skeleton3D/HandIK
@onready var hand_target: Node3D = $HandTarget

func grab_object(obj: Node3D) -> void:
    hand_target.global_position = obj.global_position
    hand_ik.active = true

func release_object() -> void:
    hand_ik.active = false
```

### C# equivalent

```csharp
[Export] private TwoBoneIk3D _handIk;
[Export] private Node3D _handTarget;

public void GrabObject(Node3D obj)
{
    _handTarget.GlobalPosition = obj.GlobalPosition;
    _handIk.Active = true;
}

public void ReleaseObject()
{
    _handIk.Active = false;
}
```

---

## 9. FABRIK3D — Chain IK

FABRIK (Forward And Backward Reaching Inverse Kinematics) solves N-bone chains iteratively. Good for tails, tentacles, and spines.

### Setup

```
Skeleton3D
└── FABRIK3D
     root_bone = "Spine"
     tip_bone = "Tail_End"
     target_node = @"../../TailTarget"
     iterations = 10
```

### Key properties

```gdscript
@onready var tail_ik: FABRIK3D = $Skeleton3D/TailIK

func _ready() -> void:
    tail_ik.iterations = 10      # More iterations = more accurate, slower
    tail_ik.tolerance = 0.01     # Stop early if tip is within tolerance
```

### When to use FABRIK vs CCDIK

- **FABRIK** — more natural results for chains that should maintain bone lengths. Configurable determinism.
- **CCDIK** — faster per iteration, better for stylized/exaggerated motion. Always non-deterministic.
- **SplineIK** — best when you want smooth curves (snakes, ropes). Deterministic.

---

## 10. Foot Placement on Uneven Ground

A common use case combining raycasts with TwoBoneIK3D:

```gdscript
extends CharacterBody3D

@onready var skeleton: Skeleton3D = $Model/Skeleton3D
@onready var left_foot_ik: TwoBoneIK3D = $Model/Skeleton3D/LeftFootIK
@onready var right_foot_ik: TwoBoneIK3D = $Model/Skeleton3D/RightFootIK
@onready var left_target: Node3D = $LeftFootTarget
@onready var right_target: Node3D = $RightFootTarget
@onready var ray_left: RayCast3D = $RayLeft
@onready var ray_right: RayCast3D = $RayRight

@export var foot_offset: float = 0.05  # Small offset above ground
@export var max_step_height: float = 0.5

func _physics_process(_delta: float) -> void:
    _update_foot_ik(ray_left, left_target, left_foot_ik)
    _update_foot_ik(ray_right, right_target, right_foot_ik)

func _update_foot_ik(ray: RayCast3D, target: Node3D, ik: TwoBoneIK3D) -> void:
    if ray.is_colliding():
        var hit_point: Vector3 = ray.get_collision_point()
        var hit_normal: Vector3 = ray.get_collision_normal()
        
        # Check if the step is within reachable range
        var height_diff: float = absf(hit_point.y - global_position.y)
        if height_diff < max_step_height:
            target.global_position = hit_point + Vector3.UP * foot_offset
            
            # Align foot to surface normal
            var foot_basis: Basis = Basis.looking_at(-hit_normal, Vector3.FORWARD)
            target.global_basis = foot_basis
            
            ik.active = true
        else:
            ik.active = false
    else:
        ik.active = false
```

### Smoothing IK transitions

Snapping feet instantly looks robotic. Use `LimitAngularVelocityModifier3D` (4.6) or interpolate the target:

```gdscript
# Smooth target position over time
var target_pos: Vector3 = hit_point + Vector3.UP * foot_offset
left_target.global_position = left_target.global_position.lerp(
    target_pos, 10.0 * delta
)
```

---

## 11. Spring Bones & Secondary Motion

`SpringBoneSimulator3D` (4.5+) adds physics-based secondary animation — hair swaying, capes fluttering, antenna bobbing — without rigid body simulation.

### Setup

```
Skeleton3D
└── SpringBoneSimulator3D
     # Configure in inspector or code
```

```gdscript
@onready var spring: SpringBoneSimulator3D = $Skeleton3D/SpringBones

func _ready() -> void:
    # Configure spring parameters per bone chain
    # Properties configured in the editor inspector:
    # - Bones to simulate (e.g. Hair_01, Hair_02, Hair_03)
    # - Stiffness: higher = stiffer (less sway)
    # - Damping: higher = less oscillation
    # - Gravity direction and strength
    # - Wind influence
    pass
```

### Typical use cases

| Element | Stiffness | Damping | Notes |
|---------|-----------|---------|-------|
| Long hair | 0.1–0.3 | 0.3–0.5 | Low stiffness for flow |
| Short ponytail | 0.5–0.7 | 0.4–0.6 | Moderate stiffness |
| Cape/cloak | 0.2–0.4 | 0.3–0.5 | Needs wind influence |
| Antenna/feather | 0.3–0.5 | 0.2–0.4 | Light and bouncy |
| Weapon on back | 0.7–0.9 | 0.6–0.8 | Stiff, minimal sway |

---

## 12. Animation Retargeting

`RetargetModifier3D` (4.4+) lets you play animations made for one skeleton on a differently-proportioned skeleton.

### Use case

You downloaded a walk animation from Mixamo but your character has different arm lengths. RetargetModifier3D maps bone transforms proportionally.

### Setup

1. Both source and target skeletons need a `SkeletonProfile` (e.g. `SkeletonProfileHumanoid`)
2. Add `RetargetModifier3D` as child of target `Skeleton3D`
3. Assign the source skeleton reference

```gdscript
@onready var retarget: RetargetModifier3D = $Skeleton3D/Retarget

func apply_animation_from(source_skeleton: Skeleton3D) -> void:
    retarget.source_skeleton = source_skeleton.get_path()
    retarget.active = true
```

**Tip:** Godot's import pipeline can also retarget during import — see the "Retarget" tab in the Advanced Import Settings for `.glb`/`.gltf` files.

---

## 13. Procedural Animation Techniques

Not all animation needs to be keyframed. Some is better generated at runtime.

### Look-at with body lean

```gdscript
# Lean the spine slightly toward the look target
func _process(delta: float) -> void:
    if not target:
        return
    var to_target: Vector3 = (target.global_position - global_position).normalized()
    var forward: Vector3 = -global_transform.basis.z
    var dot: float = forward.dot(to_target)
    var cross: float = forward.cross(to_target).y
    
    # Lean spine based on angle to target
    var lean_amount: float = clampf(cross * 0.3, -0.15, 0.15)
    var spine_idx: int = skeleton.find_bone("Spine1")
    var spine_pose: Transform3D = skeleton.get_bone_pose(spine_idx)
    spine_pose.basis = spine_pose.basis.rotated(Vector3.FORWARD, lean_amount)
    skeleton.set_bone_pose(spine_idx, spine_pose)
```

### Breathing animation

```gdscript
var breath_time: float = 0.0

func _process(delta: float) -> void:
    breath_time += delta
    var chest_idx: int = skeleton.find_bone("Chest")
    var chest_pose: Transform3D = skeleton.get_bone_pose(chest_idx)
    
    # Subtle scale oscillation
    var breath: float = sin(breath_time * 1.5) * 0.005
    chest_pose.basis = chest_pose.basis.scaled(
        Vector3(1.0 + breath, 1.0 + breath * 2.0, 1.0 + breath)
    )
    skeleton.set_bone_pose(chest_idx, chest_pose)
```

---

## 14. Combining Authored + Procedural Animation

The modifier stack makes this natural. Process order matters:

```
1. AnimationPlayer plays walk cycle          ← Authored keyframes
2. RetargetModifier3D adjusts proportions    ← If using shared anims
3. LookAtModifier3D rotates head             ← Procedural head tracking
4. TwoBoneIK3D plants feet                   ← Procedural foot IK
5. SpringBoneSimulator3D jiggles hair        ← Physics simulation
6. LimitAngularVelocityModifier3D smooths    ← Polish pass
```

### Blending IK influence

To prevent IK from completely overriding animation, use the modifier's influence property:

```gdscript
# Partial IK influence — 70% IK, 30% authored animation
foot_ik.influence = 0.7

# Animate influence for smooth transitions
var tween := create_tween()
tween.tween_property(foot_ik, "influence", 1.0, 0.3)
```

---

## 15. Performance Considerations

| Technique | Cost | Notes |
|-----------|------|-------|
| AnimationTree evaluation | Low | One blend graph per character |
| BlendSpace2D | Low | Triangulation is cached |
| TwoBoneIK3D | Very low | Analytical solver, O(1) |
| FABRIK3D (10 iterations) | Low-Medium | O(iterations × bones) |
| JacobianIK3D | Medium | Matrix math per iteration |
| SpringBoneSimulator3D | Low per bone | Scales linearly with bone count |
| LookAtModifier3D | Very low | Single bone rotation |

### Optimization tips

- **Disable IK when off-screen:** `ik_modifier.active = skeleton.is_visible_in_frustum()`
- **Reduce FABRIK iterations** for distant characters (2–3 is often fine)
- **LOD for animation:** Simplify blend trees for distant characters
- **Share AnimationTree resources** across identical characters (set `resource_local_to_scene = true` for parameters)
- **Limit spring bone count** — 5–10 spring bones per character is usually plenty

---

## 16. Common Mistakes & Fixes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| No pole target on TwoBoneIK3D | Knee/elbow bends sideways | Always set `pole_node` for limb IK |
| IK overrides animation completely | Character slides, no walk animation visible | Set `influence < 1.0` or ensure AnimationTree runs before IK |
| SkeletonModifier3D wrong order | Head tracking ignores foot IK results | Reorder modifiers in the scene tree (top processes first) |
| Using deprecated SkeletonIK3D | API removed in future versions | Migrate to TwoBoneIK3D (see migration guide below) |
| FABRIK too few iterations | Chain doesn't reach target | Increase `iterations` (10–20 for long chains) |
| Spring bones explode on teleport | Bones stretch wildly after position change | Temporarily disable SpringBoneSimulator3D during teleport, then re-enable |
| Root motion + manual velocity | Character moves double speed | Don't add velocity manually when using root motion — use only `get_root_motion_position()` |
| Blend space not updating | Character stuck in one animation | Verify `AnimationTree.active = true` and parameter paths are correct |

### Migrating from SkeletonIK3D

```gdscript
# OLD (deprecated)
var ik := SkeletonIK3D.new()
ik.root_bone = "UpperArm"
ik.tip_bone = "Hand"
ik.target = target_transform
skeleton.add_child(ik)
ik.start()

# NEW (4.6+)
var ik := TwoBoneIK3D.new()
ik.bone_name = "Hand"  # tip bone — solver finds the chain automatically
ik.target_node = target_node.get_path()
skeleton.add_child(ik)
ik.active = true
```

---

## Quick Reference

```gdscript
# AnimationTree blend space
anim_tree.set("parameters/blend_position", Vector2(x, y))

# OneShot fire
anim_tree.set("parameters/oneshot/request", AnimationNodeOneShot.ONE_SHOT_REQUEST_FIRE)

# Root motion
var motion: Vector3 = anim_tree.get_root_motion_position()

# TwoBoneIK3D
foot_ik.active = true
foot_ik.influence = 0.8

# LookAtModifier3D
look_at.target_node = target.get_path()

# SpringBoneSimulator3D — configure in editor, toggle in code
spring_bones.active = is_visible
```

**Next steps:** Combine IK foot placement with [G14 Navigation & Pathfinding](./G14_navigation_and_pathfinding.md) for characters that navigate terrain naturally. Use [G23 Advanced Physics](./G23_advanced_physics.md) for ragdoll transitions from animated to physics-driven.
