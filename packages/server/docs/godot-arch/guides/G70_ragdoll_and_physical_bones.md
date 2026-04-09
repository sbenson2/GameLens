# G70 — Ragdoll Physics & Physical Bones

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#
> **Related:** [G5 Physics & Collision](./G5_physics_and_collision.md) · [G23 Advanced Physics](./G23_advanced_physics.md) · [G30 Advanced Animation & IK](./G30_advanced_animation_and_ik.md) · [G8 Animation Systems](./G8_animation_systems.md)

---

## What This Guide Covers

Ragdoll physics let characters collapse realistically when they die, get knocked back, or react to explosions. Godot 4.x provides a purpose-built ragdoll system through `PhysicalBoneSimulator3D` and `PhysicalBone3D` nodes that integrate directly with `Skeleton3D`. This guide covers setting up ragdolls from scratch, configuring joints and collision, partial ragdolls for hit reactions, blending between animation and physics, active ragdolls, performance, and common pitfalls.

**Use this guide when:** you need death animations, hit reactions, physics-based characters, dangling equipment, or any scenario where a skeletal mesh should respond to physics forces.

**G23** covers physics backends (Jolt, Rapier). **G30** covers IK and AnimationTree. This guide focuses specifically on the ragdoll pipeline — PhysicalBone3D setup, simulation control, and the animation↔physics handoff.

---

## Table of Contents

1. [Ragdoll Architecture](#1-ragdoll-architecture)
2. [Setting Up a Ragdoll](#2-setting-up-a-ragdoll)
3. [Joint Types and Configuration](#3-joint-types-and-configuration)
4. [Starting and Stopping Simulation](#4-starting-and-stopping-simulation)
5. [Partial Ragdolls](#5-partial-ragdolls)
6. [Animation-to-Ragdoll Blending](#6-animation-to-ragdoll-blending)
7. [Active Ragdolls](#7-active-ragdolls)
8. [Applying Forces and Impulses](#8-applying-forces-and-impulses)
9. [Ragdolls with Jolt Physics](#9-ragdolls-with-jolt-physics)
10. [Performance and Optimization](#10-performance-and-optimization)
11. [Common Mistakes](#11-common-mistakes)
12. [C# Examples](#12-c-examples)

---

## 1. Ragdoll Architecture

Godot's ragdoll system maps physics bodies onto skeleton bones:

```
Skeleton3D
└── PhysicalBoneSimulator3D      ← Controls the simulation
    ├── PhysicalBone3D (Hips)    ← Each maps to one bone
    ├── PhysicalBone3D (Spine)
    ├── PhysicalBone3D (Head)
    ├── PhysicalBone3D (UpperArm_L)
    ├── PhysicalBone3D (LowerArm_L)
    └── ... (one per simulated bone)
```

**Key nodes:**

| Node | Role |
|------|------|
| `Skeleton3D` | Drives the mesh via bone transforms |
| `PhysicalBoneSimulator3D` | Parent of all physical bones; starts/stops simulation; controls influence blend |
| `PhysicalBone3D` | Wraps a single bone as a physics body with collision shape and joint |

When simulation is **off**, the `AnimationPlayer` or `AnimationTree` drives bones normally. When simulation is **on**, the `PhysicalBoneSimulator3D` overrides bone transforms with physics results.

---

## 2. Setting Up a Ragdoll

### Step 1 — Import a Rigged Model

Import a `.glb` or `.gltf` with a skeleton. Godot creates a `Skeleton3D` node automatically.

### Step 2 — Generate Physical Bones

Select the `Skeleton3D` in the scene tree. In the 3D viewport toolbar, click **Skeleton3D → Create Physical Skeleton**. This auto-generates:

- A `PhysicalBoneSimulator3D` child
- One `PhysicalBone3D` per bone, each with a default `CollisionShape3D` (capsule)
- Default pin joints between connected bones

### Step 3 — Prune Unnecessary Bones

Not every bone needs physics. Remove `PhysicalBone3D` nodes for:

- Finger bones (unless your game specifically needs them)
- Twist/roll bones (helper bones for smooth deformation)
- Accessory bones (hair bones, cloth bones handled by other systems)

**Rule of thumb:** 8–15 physical bones is the sweet spot for most humanoid characters. Each extra bone adds physics solver cost.

### Step 4 — Adjust Collision Shapes

The auto-generated capsules are rough approximations. For each `PhysicalBone3D`:

```
PhysicalBone3D (UpperArm_L)
└── CollisionShape3D
    └── shape: CapsuleShape3D (radius: 0.06, height: 0.28)
```

- Resize capsules to match the limb segment
- Use `BoxShape3D` for the torso/hips
- Use `SphereShape3D` for the head
- Avoid `ConvexPolygonShape3D` unless you need precise collision — it's much more expensive

### Step 5 — Set Collision Layers

Put ragdoll bones on a dedicated collision layer (e.g., layer 5 = "Ragdoll"):

```gdscript
# In a setup script or via the Inspector for each PhysicalBone3D
collision_layer = 1 << 4   # Layer 5
collision_mask = 1 << 0     # Collide with layer 1 (world geometry)
```

This prevents ragdoll bones from colliding with the character's own `CharacterBody3D` or other ragdolls unnecessarily.

---

## 3. Joint Types and Configuration

Each `PhysicalBone3D` has a **joint** connecting it to its parent bone. The joint constrains how far the bone can rotate relative to its parent.

### Available Joint Types

| Joint Type | Best For |
|-----------|----------|
| `JOINT_TYPE_PIN` | Default — allows rotation on all axes, no angular limits |
| `JOINT_TYPE_CONE` | Shoulders, hips — conical rotation limit |
| `JOINT_TYPE_HINGE` | Elbows, knees — single-axis rotation |
| `JOINT_TYPE_SLIDER` | Telescoping or sliding joints (rare in ragdolls) |
| `JOINT_TYPE_6DOF` | Full control — six degrees of freedom with per-axis limits |

### Recommended Joint Setup for Humanoids

```gdscript
# Example joint configuration (set via Inspector or script)

# Knees and elbows → Hinge (single axis, limited range)
# Inspector: Joint Type = Hinge
# joint_constraints/angular_limit_lower = -120  (degrees)
# joint_constraints/angular_limit_upper = 0

# Shoulders → Cone twist
# Inspector: Joint Type = Cone
# joint_constraints/swing_span = 80  (degrees)
# joint_constraints/twist_span = 40  (degrees)

# Spine segments → 6DOF with tight limits
# Inspector: Joint Type = 6DOF
# Per-axis angular limits: ±30 degrees
```

### Practical Tips

- **Start with Pin joints** (the default), verify the ragdoll collapses correctly, then tighten joints one by one
- **Knees bending backward** is the most common ragdoll bug — set hinge limits so the lower limit is negative (flexion) and upper limit is 0 or near 0
- **Test joint limits** by calling `physical_bones_start_simulation()` and dropping the character from a height

---

## 4. Starting and Stopping Simulation

### Basic Toggle

```gdscript
@onready var ragdoll: PhysicalBoneSimulator3D = $Skeleton3D/PhysicalBoneSimulator3D

func die() -> void:
    # Disable character controller so it doesn't fight the ragdoll
    $CharacterBody3D.set_physics_process(false)
    
    # Start ragdoll simulation
    ragdoll.physical_bones_start_simulation()

func respawn() -> void:
    # Stop ragdoll, return to animation-driven
    ragdoll.physical_bones_stop_simulation()
    $CharacterBody3D.set_physics_process(true)
```

### Preserving Momentum

When transitioning from animation to ragdoll (e.g., mid-jump death), the ragdoll should inherit the character's velocity. Apply an impulse immediately after starting simulation:

```gdscript
func die_with_momentum(velocity: Vector3) -> void:
    ragdoll.physical_bones_start_simulation()
    
    # Apply velocity to the root bone (usually hips)
    var hips_bone: PhysicalBone3D = ragdoll.get_node("Physical Bone Hips")
    hips_bone.apply_central_impulse(velocity * hips_bone.mass)
```

### Delayed Cleanup

Ragdolls left simulating forever waste CPU. Freeze them after they settle:

```gdscript
func _on_ragdoll_started() -> void:
    # Wait for the ragdoll to settle, then freeze
    await get_tree().create_timer(3.0).timeout
    _freeze_ragdoll()

func _freeze_ragdoll() -> void:
    for child in ragdoll.get_children():
        if child is PhysicalBone3D:
            child.freeze = true
```

---

## 5. Partial Ragdolls

You don't have to simulate the entire skeleton. Partial ragdolls are useful for:

- **Hit reactions** — ragdoll only the upper body when shot, legs keep walking
- **Dangling limbs** — a broken arm flops while the character keeps fighting
- **Equipment physics** — a cape or weapon on a bone chain

### Simulating Specific Bones

```gdscript
func ragdoll_upper_body() -> void:
    # Only simulate specific bones
    ragdoll.physical_bones_start_simulation([
        "Physical Bone Spine",
        "Physical Bone Head",
        "Physical Bone UpperArm_L",
        "Physical Bone LowerArm_L",
        "Physical Bone UpperArm_R",
        "Physical Bone LowerArm_R",
    ])
```

Pass an array of `PhysicalBone3D` node names to `physical_bones_start_simulation()` to limit which bones are simulated.

### Influence Blending

The `PhysicalBoneSimulator3D.influence` property (0.0–1.0) controls how much physics overrides the animation:

```gdscript
# Blend between animation and ragdoll
# 0.0 = fully animated, 1.0 = fully ragdoll
ragdoll.influence = 0.5  # 50/50 blend

# Tween influence for a smooth hit reaction
func hit_reaction(duration: float = 0.5) -> void:
    ragdoll.physical_bones_start_simulation()
    ragdoll.influence = 0.8
    
    var tween := create_tween()
    tween.tween_property(ragdoll, "influence", 0.0, duration)
    tween.tween_callback(ragdoll.physical_bones_stop_simulation)
```

---

## 6. Animation-to-Ragdoll Blending

Smooth transitions between animation and ragdoll require careful orchestration:

### Death Sequence Pattern

```gdscript
enum RagdollState { ANIMATED, BLENDING_TO_RAGDOLL, RAGDOLL, BLENDING_TO_ANIM }
var state: RagdollState = RagdollState.ANIMATED

func transition_to_ragdoll(blend_time: float = 0.3) -> void:
    state = RagdollState.BLENDING_TO_RAGDOLL
    ragdoll.physical_bones_start_simulation()
    
    var tween := create_tween()
    tween.tween_property(ragdoll, "influence", 1.0, blend_time)
    tween.tween_callback(func(): state = RagdollState.RAGDOLL)

func transition_to_animation(blend_time: float = 0.5) -> void:
    state = RagdollState.BLENDING_TO_ANIM
    
    # Record current ragdoll pose before blending back
    var tween := create_tween()
    tween.tween_property(ragdoll, "influence", 0.0, blend_time)
    tween.tween_callback(func():
        ragdoll.physical_bones_stop_simulation()
        state = RagdollState.ANIMATED
    )
```

### Get-Up Animation

After ragdolling, detect if the character is face-up or face-down, then play the matching get-up animation:

```gdscript
func get_up() -> void:
    var hips: PhysicalBone3D = ragdoll.get_node("Physical Bone Hips")
    var up_dot: float = hips.global_basis.y.dot(Vector3.UP)
    
    if up_dot > 0.0:
        animation_player.play("get_up_face_up")
    else:
        animation_player.play("get_up_face_down")
    
    transition_to_animation(0.4)
```

---

## 7. Active Ragdolls

Active ragdolls keep physics simulation running while applying forces to maintain a target pose — think of *Gang Beasts* or *Human: Fall Flat*.

### Approach 1: Influence-Based (Simple)

Use partial influence to blend animation forces with physics:

```gdscript
# Keep influence low so physics dominates but animation
# provides a "target" the character loosely follows
ragdoll.influence = 0.3  # Physics-heavy but animation-guided

func _physics_process(_delta: float) -> void:
    # Optionally apply corrective forces toward standing pose
    var hips: PhysicalBone3D = ragdoll.get_node("Physical Bone Hips")
    var up_force := Vector3.UP * 2.0 * hips.mass
    hips.apply_central_force(up_force)
```

### Approach 2: Joint Motor Targets (Advanced)

For full active ragdoll control, use `Generic6DOFJoint3D` nodes with motor targets set to match animation bone rotations. This approach is more complex but provides the best results for active ragdoll games:

```gdscript
# This approach uses separate RigidBody3D + Generic6DOFJoint3D
# instead of PhysicalBone3D — see the Godot Active Ragdolls plugin
# by R3X-G1L6AME5H for a reference implementation.

# The general pattern:
# 1. Create a parallel RigidBody3D chain matching the skeleton
# 2. Connect bodies with Generic6DOFJoint3D
# 3. Each frame, set joint motor targets to match animation pose
# 4. Physics solver blends between target pose and world forces
```

> **Note:** Godot's built-in `PhysicalBone3D` system is optimized for passive ragdolls (death, hit reactions). For game mechanics that depend on active ragdoll physics, consider the joint-motor approach or the community Active Ragdolls plugin.

---

## 8. Applying Forces and Impulses

### Directional Hit Knockback

```gdscript
func apply_hit(hit_position: Vector3, hit_direction: Vector3, force: float) -> void:
    ragdoll.physical_bones_start_simulation()
    
    # Find the closest physical bone to the hit point
    var closest_bone: PhysicalBone3D = null
    var closest_dist: float = INF
    
    for child in ragdoll.get_children():
        if child is PhysicalBone3D:
            var dist: float = child.global_position.distance_to(hit_position)
            if dist < closest_dist:
                closest_dist = dist
                closest_bone = child
    
    if closest_bone:
        closest_bone.apply_impulse(hit_direction.normalized() * force, 
                                    hit_position - closest_bone.global_position)
```

### Explosion Radial Force

```gdscript
func apply_explosion(origin: Vector3, radius: float, power: float) -> void:
    ragdoll.physical_bones_start_simulation()
    
    for child in ragdoll.get_children():
        if child is PhysicalBone3D:
            var direction: Vector3 = child.global_position - origin
            var distance: float = direction.length()
            if distance < radius and distance > 0.01:
                var falloff: float = 1.0 - (distance / radius)
                var impulse: Vector3 = direction.normalized() * power * falloff
                child.apply_central_impulse(impulse)
```

---

## 9. Ragdolls with Jolt Physics

Godot 4.6 makes Jolt the default 3D physics engine. Ragdolls benefit significantly:

- **Better joint stability** — fewer joint-separation artifacts at high forces
- **Improved stacking** — multiple ragdolls piling up is more stable
- **Continuous collision detection** — less limb-through-floor tunneling

No code changes are needed when switching from Godot Physics to Jolt — the `PhysicalBone3D` API is the same. However, you may need to:

1. **Re-tune joint limits** — Jolt's solver is stiffer, so overly tight limits may cause jitter
2. **Adjust damping** — Jolt ragdolls may settle faster; reduce damping if they feel too stiff
3. **Test at high framerates** — Jolt handles variable timesteps differently

```
# Project Settings → Physics → 3D → Physics Engine
# Set to "JoltPhysics3D" (default in 4.6+)
```

---

## 10. Performance and Optimization

### Cost Breakdown

| Factor | Impact |
|--------|--------|
| Physical bones per ragdoll | ~0.1ms per bone per ragdoll (CPU) |
| Collision shapes | Simple shapes (capsule/box) ≫ convex mesh |
| Active ragdolls | 2–3× cost of frozen ragdolls |
| Joint solver iterations | More iterations = more stable but slower |

### Optimization Strategies

```gdscript
# 1. Freeze ragdolls that have settled
func _physics_process(delta: float) -> void:
    if state == RagdollState.RAGDOLL:
        _settle_timer += delta
        if _settle_timer > 2.0 and _is_settled():
            _freeze_ragdoll()

func _is_settled() -> bool:
    for child in ragdoll.get_children():
        if child is PhysicalBone3D and not child.freeze:
            if child.linear_velocity.length() > 0.1:
                return false
    return true

# 2. LOD ragdolls — reduce bones at distance
func _update_ragdoll_lod(camera_dist: float) -> void:
    if camera_dist > 30.0:
        # Far away: don't ragdoll at all, just play death anim
        ragdoll.physical_bones_stop_simulation()
    elif camera_dist > 15.0:
        # Medium: only simulate spine + limbs (skip extremities)
        ragdoll.physical_bones_start_simulation(["Physical Bone Hips",
            "Physical Bone Spine", "Physical Bone Head"])

# 3. Pool ragdoll characters — reuse instead of instantiate
```

### Budget Guidelines

| Game Type | Max Simultaneous Ragdolls | Bones Per Ragdoll |
|-----------|--------------------------|-------------------|
| Action RPG | 3–5 active | 12–15 |
| Horde shooter | 8–10 active, freeze fast | 6–8 |
| Physics sandbox | 2–3 active | 15+ |

---

## 11. Common Mistakes

### Ragdoll Explodes on Start

**Cause:** Collision shapes overlap with world geometry or other ragdoll bones at the moment simulation starts.

**Fix:** Ensure collision shapes are slightly smaller than visual geometry. Use `collision_layer` / `collision_mask` to prevent self-collision between adjacent bones.

### Limbs Stretch or Separate

**Cause:** Forces too large for the joint solver to handle in one step.

**Fix:** Increase `PhysicsServer3D` solver iterations in Project Settings, or cap impulse magnitude:

```gdscript
const MAX_IMPULSE: float = 50.0
impulse = impulse.limit_length(MAX_IMPULSE)
```

### Ragdoll Falls Through Floor

**Cause:** Bones moving fast enough to tunnel through thin collision shapes.

**Fix:** Enable CCD (Continuous Collision Detection) on the `PhysicalBone3D`:

```gdscript
# In Inspector or via script
physical_bone.continuous_cd = true
```

### Character Pops When Returning to Animation

**Cause:** Animation pose differs significantly from ragdoll pose when blending back.

**Fix:** Use the `influence` tween approach from Section 6. Never snap `influence` from 1.0 to 0.0 instantly.

---

## 12. C# Examples

### Basic Ragdoll Toggle

```csharp
using Godot;

public partial class RagdollController : Node3D
{
    private PhysicalBoneSimulator3D _ragdoll;

    public override void _Ready()
    {
        _ragdoll = GetNode<PhysicalBoneSimulator3D>(
            "Skeleton3D/PhysicalBoneSimulator3D");
    }

    public void Die(Vector3 hitDirection, float force)
    {
        _ragdoll.PhysicalBonesStartSimulation();
        
        // Apply knockback to hips
        var hips = _ragdoll.GetNode<PhysicalBone3D>("Physical Bone Hips");
        hips.ApplyCentralImpulse(hitDirection.Normalized() * force);
    }

    public async void DieAndFreeze(Vector3 hitDirection, float force)
    {
        Die(hitDirection, force);
        
        // Wait then freeze
        await ToSignal(GetTree().CreateTimer(3.0), SceneTreeTimer.SignalName.Timeout);
        
        foreach (var child in _ragdoll.GetChildren())
        {
            if (child is PhysicalBone3D bone)
                bone.Freeze = true;
        }
    }
}
```

### Partial Ragdoll Hit Reaction

```csharp
public async void HitReaction(float duration = 0.5f)
{
    _ragdoll.PhysicalBonesStartSimulation();
    _ragdoll.Influence = 0.7f;

    var tween = CreateTween();
    tween.TweenProperty(_ragdoll, "influence", 0.0f, duration);
    
    await ToSignal(tween, Tween.SignalName.Finished);
    _ragdoll.PhysicalBonesStopSimulation();
}
```

---

## Next Steps

- **[G5 Physics & Collision](./G5_physics_and_collision.md)** — Collision layers, shapes, physics fundamentals
- **[G23 Advanced Physics](./G23_advanced_physics.md)** — Jolt configuration, CCD, physics interpolation
- **[G30 Advanced Animation & IK](./G30_advanced_animation_and_ik.md)** — IKModifier3D, AnimationTree blending
- **[G52 Combat & Damage Systems](./G52_combat_and_damage_systems.md)** — Damage → ragdoll trigger integration
