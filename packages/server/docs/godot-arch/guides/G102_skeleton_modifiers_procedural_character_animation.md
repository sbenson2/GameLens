# G102 — Skeleton Modifiers & Procedural Character Animation

> **Category:** guide · **Engine:** Godot 4.4+ · **Related:** [G30 Advanced Animation & IK](./G30_advanced_animation_and_ik.md) · [G96 Animation Libraries, Blend Spaces & Retargeting](./G96_animation_libraries_blend_spaces_retargeting.md) · [G49 Tweening & Procedural Animation](./G49_tweening_and_procedural_animation.md) · [G41 Godot 4.4–4.6 Features](./G41_godot_44_to_46_features.md) · [G8 Animation Systems](./G8_animation_systems.md)

Godot 4.4 introduced the `SkeletonModifier3D` framework — a unified pipeline for procedurally modifying bone transforms after the `AnimationPlayer` has applied its keyframed data. This guide covers the three built-in modifier nodes (`LookAtModifier3D`, `SpringBoneSimulator3D`, `RetargetModifier3D`), how to stack and order them, and how to write custom modifiers for gameplay-driven bone control like weapon sway, breathing, and hit reactions.

---

## Table of Contents

1. [The SkeletonModifier3D Pipeline](#1-the-skeletonmodifier3d-pipeline)
2. [LookAtModifier3D — Procedural Aim and Head Tracking](#2-lookatmodifier3d--procedural-aim-and-head-tracking)
3. [SpringBoneSimulator3D — Physics-Driven Secondary Motion](#3-springbonesimulator3d--physics-driven-secondary-motion)
4. [RetargetModifier3D — Runtime Animation Retargeting](#4-retargetmodifier3d--runtime-animation-retargeting)
5. [Stacking Modifiers: Processing Order](#5-stacking-modifiers-processing-order)
6. [Custom SkeletonModifier3D in GDScript](#6-custom-skeletonmodifier3d-in-gdscript)
7. [Custom SkeletonModifier3D in C#](#7-custom-skeletonmodifier3d-in-c)
8. [Practical Recipes](#8-practical-recipes)
9. [Performance and Optimization](#9-performance-and-optimization)
10. [Migration from Legacy IK](#10-migration-from-legacy-ik)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. The SkeletonModifier3D Pipeline

Before 4.4, procedural bone manipulation required manual `Skeleton3D.set_bone_pose_*()` calls in `_process()`, which conflicted with `AnimationPlayer` writes and created ordering bugs. The `SkeletonModifier3D` system solves this by providing a well-defined processing pipeline:

```
AnimationPlayer writes keyframed poses
    ↓
SkeletonModifier3D nodes process (in tree order, top to bottom)
    ↓
Final bone transforms applied to mesh
```

### Key Properties (All Modifiers)

| Property | Type | Description |
|---|---|---|
| `active` | bool | Enable/disable this modifier at runtime |
| `influence` | float (0.0–1.0) | Blend between original pose (0) and modified pose (1) |

The `influence` property is essential for smooth transitions — lerp it over time to blend modifiers in and out instead of popping.

### Adding Modifiers in the Scene Tree

Modifiers are added as **children of the Skeleton3D node**:

```
CharacterBody3D
├── Skeleton3D
│   ├── AnimationPlayer
│   ├── LookAtModifier3D      ← processes first (head tracking)
│   ├── SpringBoneSimulator3D  ← processes second (hair/cloth jiggle)
│   └── RetargetModifier3D     ← processes third (if retargeting)
└── CollisionShape3D
```

---

## 2. LookAtModifier3D — Procedural Aim and Head Tracking

`LookAtModifier3D` rotates a bone to face a target position. Common uses: character head tracking, turret aiming, eye gaze, weapon pointing.

### Basic Setup — GDScript

```gdscript
extends CharacterBody3D

@onready var look_at_mod: LookAtModifier3D = $Skeleton3D/LookAtModifier3D

func _ready() -> void:
    # Configure which bone to rotate
    look_at_mod.bone_name = "Head"

    # Set the target node the bone should look at
    look_at_mod.target_node = $LookTarget.get_path()

    # Constrain rotation to prevent unnatural neck twisting
    # Angles are in radians — use deg_to_rad() for readability
    look_at_mod.primary_rotation_axis = Vector3.AXIS_Y
    look_at_mod.primary_limit_angle = deg_to_rad(70.0)
    look_at_mod.primary_damp_threshold = deg_to_rad(50.0)

    # Smooth transitions
    look_at_mod.influence = 1.0
```

### Basic Setup — C#

```csharp
using Godot;

public partial class Character : CharacterBody3D
{
    private LookAtModifier3D _lookAtMod;

    public override void _Ready()
    {
        _lookAtMod = GetNode<LookAtModifier3D>("Skeleton3D/LookAtModifier3D");

        _lookAtMod.BoneName = "Head";
        _lookAtMod.TargetNode = GetNode("LookTarget").GetPath();
        _lookAtMod.PrimaryRotationAxis = Vector3.Axis.Y;
        _lookAtMod.PrimaryLimitAngle = Mathf.DegToRad(70.0f);
        _lookAtMod.PrimaryDampThreshold = Mathf.DegToRad(50.0f);
        _lookAtMod.Influence = 1.0f;
    }
}
```

### Multi-Bone Look-At Chain (Head + Spine)

For natural-looking head tracking, distribute the rotation across multiple bones. Use separate `LookAtModifier3D` nodes with reduced influence:

```gdscript
# Scene tree order matters — spine processes before head
# Skeleton3D/
#   SpineLookAt (LookAtModifier3D) — bone: "Spine2", influence: 0.3
#   HeadLookAt  (LookAtModifier3D) — bone: "Head",   influence: 0.8

@onready var spine_look: LookAtModifier3D = $Skeleton3D/SpineLookAt
@onready var head_look: LookAtModifier3D = $Skeleton3D/HeadLookAt

func set_look_target(target: Node3D) -> void:
    var path := target.get_path()
    spine_look.target_node = path
    head_look.target_node = path

func disable_look_at() -> void:
    # Smoothly blend out over 0.3 seconds
    var tween := create_tween().set_parallel(true)
    tween.tween_property(spine_look, "influence", 0.0, 0.3)
    tween.tween_property(head_look, "influence", 0.0, 0.3)
```

### Important: Parent-Before-Child Ordering

When multiple `LookAtModifier3D` nodes target bones in a parent-child chain (e.g., Spine → Neck → Head), the modifier for the **parent bone must be listed above** the child bone modifier in the Scene tree. This ensures the parent rotation is applied before the child calculates its local rotation.

---

## 3. SpringBoneSimulator3D — Physics-Driven Secondary Motion

`SpringBoneSimulator3D` adds spring-based physics simulation to bone chains, creating realistic secondary motion for hair, capes, tails, antennas, clothing, and accessories without a full physics simulation.

### How It Works

Each configured bone chain acts as a series of spring-connected masses. Gravity, character movement, and external forces cause the chain to sway, bounce, and settle naturally. No `RigidBody3D` or `PhysicsServer` involvement — it's all computed in the modifier pipeline.

### Setup — GDScript

```gdscript
extends CharacterBody3D

@onready var spring_sim: SpringBoneSimulator3D = $Skeleton3D/SpringBoneSimulator3D

func _ready() -> void:
    # SpringBoneSimulator3D is primarily configured in the Inspector.
    # Each "spring bone set" defines a chain of bones with physics params.
    #
    # Inspector workflow:
    # 1. Add SpringBoneSimulator3D as child of Skeleton3D
    # 2. In Inspector, add entries to the "Settings" array
    # 3. For each entry:
    #    - Set root_bone (e.g., "Hair_Root")
    #    - Set end_bone (e.g., "Hair_Tip") — creates the chain automatically
    #    - Adjust stiffness (0.01–1.0), damping, gravity scale

    # Runtime adjustments via code:
    spring_sim.active = true
    spring_sim.influence = 1.0

func _on_hit_received(direction: Vector3) -> void:
    # Spring bones react to sudden movement automatically,
    # but you can amplify the effect by briefly increasing gravity
    # or applying a velocity impulse to the character
    pass
```

### Setup — C#

```csharp
using Godot;

public partial class Character : CharacterBody3D
{
    private SpringBoneSimulator3D _springSim;

    public override void _Ready()
    {
        _springSim = GetNode<SpringBoneSimulator3D>(
            "Skeleton3D/SpringBoneSimulator3D"
        );
        _springSim.Active = true;
        _springSim.Influence = 1.0f;
    }
}
```

### Configuration Properties Per Bone Set

| Property | Default | Description |
|---|---|---|
| `root_bone` | — | Starting bone of the chain |
| `end_bone` | — | Ending bone (all bones between root and end are simulated) |
| `stiffness` | 0.1 | How quickly bones return to rest pose (higher = stiffer) |
| `damping` | 0.1 | How quickly oscillation decays (higher = less bouncy) |
| `gravity` | Vector3(0, -1, 0) | Gravity direction and magnitude applied to the chain |
| `drag` | 0.0 | Air resistance (higher = slower movement) |
| `center_from` | — | Optional: bone that defines the "center" for rotation |

### Tuning Tips

- **Hair:** Low stiffness (0.05–0.15), moderate damping (0.1–0.3), full gravity.
- **Cape/Cloth:** Very low stiffness (0.02–0.08), low damping (0.05–0.15), full gravity.
- **Antenna/Ears:** High stiffness (0.3–0.6), moderate damping (0.2–0.4), reduced gravity.
- **Tail:** Medium stiffness (0.1–0.3), low damping (0.05–0.2), partial gravity.

### Collision Avoidance

`SpringBoneSimulator3D` supports basic collision shapes to prevent bones from clipping through the character body. Configure collision spheres and capsules in the Inspector under each bone set's collision settings.

---

## 4. RetargetModifier3D — Runtime Animation Retargeting

`RetargetModifier3D` allows playing animations created for one skeleton on a different skeleton at runtime, without baking retargeted animations. This is essential for games with multiple character models sharing an animation library.

### How It Works

Unlike the editor's retargeting tools (which modify the animation resource), `RetargetModifier3D` preserves the original bone rests of the target skeleton and applies a runtime transform correction. This means:

- Source animations play unmodified on the source skeleton.
- The modifier calculates the delta between source and target rest poses.
- The corrected pose is applied each frame.

### Setup — GDScript

```gdscript
extends Node3D

# Two characters with different skeletons sharing animations
@onready var source_skeleton: Skeleton3D = $SourceCharacter/Skeleton3D
@onready var target_skeleton: Skeleton3D = $TargetCharacter/Skeleton3D
@onready var retarget_mod: RetargetModifier3D = $TargetCharacter/Skeleton3D/RetargetModifier3D

func _ready() -> void:
    # The RetargetModifier3D needs a SkeletonProfile to map bones
    # between source and target skeletons.
    #
    # Use the built-in SkeletonProfileHumanoid for humanoid characters,
    # or create a custom SkeletonProfile for non-standard rigs.
    retarget_mod.profile = SkeletonProfileHumanoid.new()

    # Point to the source skeleton whose animations we want to copy
    retarget_mod.source_skeleton = source_skeleton.get_path()

    retarget_mod.active = true
    retarget_mod.influence = 1.0
```

### Setup — C#

```csharp
using Godot;

public partial class RetargetDemo : Node3D
{
    public override void _Ready()
    {
        var sourceSkele = GetNode<Skeleton3D>("SourceCharacter/Skeleton3D");
        var retargetMod = GetNode<RetargetModifier3D>(
            "TargetCharacter/Skeleton3D/RetargetModifier3D"
        );

        retargetMod.Profile = new SkeletonProfileHumanoid();
        retargetMod.SourceSkeleton = sourceSkele.GetPath();
        retargetMod.Active = true;
        retargetMod.Influence = 1.0f;
    }
}
```

### Custom SkeletonProfile for Non-Humanoid Rigs

```gdscript
func create_quadruped_profile() -> SkeletonProfile:
    var profile := SkeletonProfile.new()
    # Define bone groups and mappings
    profile.bone_size = 8
    profile.set_bone_name(0, "Hips")
    profile.set_bone_name(1, "Spine")
    profile.set_bone_name(2, "FrontLeftLeg")
    profile.set_bone_name(3, "FrontRightLeg")
    profile.set_bone_name(4, "BackLeftLeg")
    profile.set_bone_name(5, "BackRightLeg")
    profile.set_bone_name(6, "Neck")
    profile.set_bone_name(7, "Head")
    return profile
```

---

## 5. Stacking Modifiers: Processing Order

Modifiers process **top-to-bottom** in the Skeleton3D's child list. Order matters:

### Recommended Order

```
Skeleton3D
├── RetargetModifier3D     ← 1st: apply retargeted base pose
├── LookAtModifier3D       ← 2nd: override specific bones (head, eyes)
├── SpringBoneSimulator3D  ← 3rd: simulate secondary motion on top
└── CustomModifier3D       ← 4th: gameplay-specific adjustments
```

### Why Order Matters

- `RetargetModifier3D` writes the full-body base pose — it must run first.
- `LookAtModifier3D` overrides specific bones — it must run after the base pose is set.
- `SpringBoneSimulator3D` reacts to the final bone positions — it must run after look-at adjustments.

### Runtime Reordering

```gdscript
# Move a modifier to process last
var skeleton: Skeleton3D = $Skeleton3D
var modifier: SkeletonModifier3D = $Skeleton3D/MyModifier
skeleton.move_child(modifier, -1)  # Move to last child position
```

---

## 6. Custom SkeletonModifier3D in GDScript

For gameplay-specific bone manipulation (weapon sway, breathing, hit reactions), create a custom modifier:

```gdscript
@tool
extends SkeletonModifier3D
class_name BreathingModifier3D

## Bone name for the chest/spine bone that should breathe
@export var bone_name: StringName = &"Spine2"
## Breathing rate in cycles per second
@export var breath_rate: float = 0.25
## Scale of the breathing motion
@export var breath_scale: float = 0.02

var _bone_idx: int = -1
var _time: float = 0.0

func _process_modification() -> void:
    var skeleton := get_skeleton()
    if not skeleton:
        return

    # Cache bone index
    if _bone_idx < 0:
        _bone_idx = skeleton.find_bone(bone_name)
        if _bone_idx < 0:
            return

    _time += get_process_delta_time()

    # Get the current pose (after AnimationPlayer and earlier modifiers)
    var current_pose := skeleton.get_bone_pose(_bone_idx)

    # Apply a subtle sine-wave scale to simulate breathing
    var breath_offset := sin(_time * TAU * breath_rate) * breath_scale
    var breath_transform := Transform3D(
        Basis.IDENTITY.scaled(Vector3(
            1.0 + breath_offset * 0.5,
            1.0 + breath_offset,
            1.0 + breath_offset * 0.3
        )),
        Vector3.ZERO
    )

    # Blend based on influence
    var final_transform := current_pose.interpolate_with(
        current_pose * breath_transform,
        influence
    )
    skeleton.set_bone_pose(_bone_idx, final_transform)
```

### Hit Reaction Modifier

```gdscript
@tool
extends SkeletonModifier3D
class_name HitReactionModifier3D

@export var bone_name: StringName = &"Spine"
@export var recovery_speed: float = 5.0

var _bone_idx: int = -1
var _hit_rotation := Quaternion.IDENTITY
var _hit_strength: float = 0.0

func apply_hit(direction: Vector3, strength: float = 0.3) -> void:
    # Convert world hit direction to a bone-space rotation
    var skeleton := get_skeleton()
    if skeleton:
        _hit_rotation = Quaternion(
            direction.cross(Vector3.UP).normalized(),
            strength
        )
        _hit_strength = 1.0

func _process_modification() -> void:
    var skeleton := get_skeleton()
    if not skeleton or _hit_strength <= 0.01:
        return

    if _bone_idx < 0:
        _bone_idx = skeleton.find_bone(bone_name)
        if _bone_idx < 0:
            return

    # Decay the hit reaction
    _hit_strength = lerp(_hit_strength, 0.0,
        get_process_delta_time() * recovery_speed)

    var current_pose := skeleton.get_bone_pose(_bone_idx)
    var hit_transform := Transform3D(
        Basis(_hit_rotation.slerp(Quaternion.IDENTITY, 1.0 - _hit_strength)),
        Vector3.ZERO
    )

    var final_transform := current_pose.interpolate_with(
        current_pose * hit_transform,
        influence * _hit_strength
    )
    skeleton.set_bone_pose(_bone_idx, final_transform)
```

---

## 7. Custom SkeletonModifier3D in C#

```csharp
using Godot;

[Tool]
[GlobalClass]
public partial class BreathingModifier3D : SkeletonModifier3D
{
    [Export] public StringName BoneName { get; set; } = "Spine2";
    [Export] public float BreathRate { get; set; } = 0.25f;
    [Export] public float BreathScale { get; set; } = 0.02f;

    private int _boneIdx = -1;
    private float _time;

    public override void _ProcessModification()
    {
        var skeleton = GetSkeleton();
        if (skeleton == null) return;

        if (_boneIdx < 0)
        {
            _boneIdx = skeleton.FindBone(BoneName);
            if (_boneIdx < 0) return;
        }

        _time += (float)GetProcessDeltaTime();

        var currentPose = skeleton.GetBonePose(_boneIdx);
        var breathOffset = Mathf.Sin(_time * Mathf.Tau * BreathRate) * BreathScale;

        var breathBasis = Basis.Identity.Scaled(new Vector3(
            1.0f + breathOffset * 0.5f,
            1.0f + breathOffset,
            1.0f + breathOffset * 0.3f
        ));

        var breathTransform = new Transform3D(breathBasis, Vector3.Zero);
        var final_ = currentPose.InterpolateWith(
            currentPose * breathTransform,
            Influence
        );
        skeleton.SetBonePose(_boneIdx, final_);
    }
}
```

---

## 8. Practical Recipes

### Recipe: Weapon Sway

```gdscript
@tool
extends SkeletonModifier3D
class_name WeaponSwayModifier3D

@export var hand_bone: StringName = &"RightHand"
@export var sway_amount: float = 0.01
@export var sway_speed: float = 2.0

var _bone_idx: int = -1
var _prev_position := Vector3.ZERO

func _process_modification() -> void:
    var skeleton := get_skeleton()
    if not skeleton:
        return

    if _bone_idx < 0:
        _bone_idx = skeleton.find_bone(hand_bone)

    # Calculate velocity-based sway from character movement
    var char := skeleton.get_parent() as CharacterBody3D
    if not char:
        return

    var velocity := char.velocity
    var sway_offset := Vector3(
        -velocity.x * sway_amount,
        -abs(velocity.y) * sway_amount * 0.5,
        0.0
    )

    var current := skeleton.get_bone_pose(_bone_idx)
    var sway_transform := Transform3D(Basis.IDENTITY, sway_offset)
    var target := current * sway_transform

    skeleton.set_bone_pose(
        _bone_idx,
        current.interpolate_with(target, influence)
    )
```

### Recipe: Blend Modifiers During State Transitions

```gdscript
# Smoothly enable head tracking when entering dialogue
func enter_dialogue(npc: Node3D) -> void:
    var look_mod: LookAtModifier3D = $Skeleton3D/LookAtModifier3D
    look_mod.target_node = npc.get_path()
    look_mod.active = true
    var tween := create_tween()
    tween.tween_property(look_mod, "influence", 1.0, 0.4).set_ease(Tween.EASE_OUT)

func exit_dialogue() -> void:
    var look_mod: LookAtModifier3D = $Skeleton3D/LookAtModifier3D
    var tween := create_tween()
    tween.tween_property(look_mod, "influence", 0.0, 0.3).set_ease(Tween.EASE_IN)
    tween.tween_callback(func() -> void: look_mod.active = false)
```

---

## 9. Performance and Optimization

### Cost Breakdown

| Modifier | Cost | Notes |
|---|---|---|
| `LookAtModifier3D` | Very low | Single bone quaternion rotation per frame |
| `SpringBoneSimulator3D` | Low–Medium | Scales with chain length × number of chains |
| `RetargetModifier3D` | Medium | Full skeleton re-map every frame |
| Custom modifier | Varies | Depends on your logic complexity |

### Optimization Strategies

- **Disable when off-screen:** Set `active = false` on modifiers for characters outside the camera frustum.
- **Reduce spring chains on LOD:** For distant characters, disable `SpringBoneSimulator3D` entirely — the subtle motion isn't visible.
- **Cache bone indices:** Always cache `find_bone()` results rather than calling it every frame.
- **Use `influence = 0` vs `active = false`:** Setting `influence = 0` still runs the modifier logic (just blends to nothing). Set `active = false` to skip processing entirely.

```gdscript
# LOD-based modifier management
func _on_visibility_changed(is_visible: bool) -> void:
    $Skeleton3D/SpringBoneSimulator3D.active = is_visible
    $Skeleton3D/LookAtModifier3D.active = is_visible
```

---

## 10. Migration from Legacy IK

If you were using the deprecated `SkeletonIK3D` node (removed from the new modifier pipeline):

| Legacy (pre-4.4) | Modern (4.4+) |
|---|---|
| `SkeletonIK3D` | `LookAtModifier3D` for aim/look + `IKModifier3D` (4.6) for FABRIK/CCDIK |
| Manual `set_bone_pose_rotation()` in `_process` | Custom `SkeletonModifier3D` subclass |
| `BoneAttachment3D` + code | Still valid — `BoneAttachment3D` reads final modified poses |

### Migration Steps

1. Replace `SkeletonIK3D` nodes with `LookAtModifier3D` (for aim) or `IKModifier3D` (for full IK chains, available in 4.6).
2. Move manual `set_bone_pose_*()` code into a custom `SkeletonModifier3D._process_modification()` method.
3. Test modifier ordering — the processing pipeline may produce different results than your old `_process()` order.

---

## 11. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Modifier has no effect | `active` is false or `influence` is 0 | Check both properties in Inspector |
| Bone name not found | Bone name doesn't match skeleton | Print `skeleton.get_bone_name(i)` for all bones to find exact names |
| Head snaps instead of smooth | No blending on influence | Tween `influence` from 0→1 over 0.2–0.4 seconds |
| Spring bones jitter wildly | Stiffness too low, damping too low | Increase damping to 0.3+, increase stiffness |
| Child bone rotates wrong | Parent modifier runs after child | Move parent bone's `LookAtModifier3D` above child's in tree |
| RetargetModifier3D distorts mesh | SkeletonProfile mapping is wrong | Verify bone name mappings match both skeletons |
| Modifier conflicts with AnimationPlayer | AnimationPlayer overwrites every frame | Modifiers process AFTER AnimationPlayer — this should work; check tree order |
| Custom modifier not called | Missing `@tool` or not child of Skeleton3D | Add `@tool`, ensure node is direct child of Skeleton3D |
