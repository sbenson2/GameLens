# G96 — Animation Libraries, Blend Spaces & Retargeting

> **Category:** guide · **Engine:** Godot 4.x · **Related:** [G8 Animation Systems](./G8_animation_systems.md) · [G30 Advanced Animation & IK](./G30_advanced_animation_and_ik.md) · [G49 Tweening & Procedural Animation](./G49_tweening_and_procedural_animation.md) · [G64 Character Controller Patterns](./G64_character_controller_patterns.md)

Share animations across multiple characters using AnimationLibrary, build smooth locomotion with BlendSpace2D in AnimationTree, and retarget humanoid animations between different skeletons. This guide covers the full workflow from Blender export through runtime blending.

---

## Table of Contents

1. [Animation Libraries — Core Concepts](#1-animation-libraries--core-concepts)
2. [Creating and Loading Animation Libraries](#2-creating-and-loading-animation-libraries)
3. [AnimationTree and State Machines](#3-animationtree-and-state-machines)
4. [BlendSpace1D — Speed-Based Blending](#4-blendspace1d--speed-based-blending)
5. [BlendSpace2D — Directional Locomotion](#5-blendspace2d--directional-locomotion)
6. [Skeleton Retargeting](#6-skeleton-retargeting)
7. [Retargeting Workflow: Blender to Godot](#7-retargeting-workflow-blender-to-godot)
8. [Animation Callbacks and Events](#8-animation-callbacks-and-events)
9. [Layered Animation with Add/Blend Nodes](#9-layered-animation-with-addblend-nodes)
10. [Root Motion](#10-root-motion)
11. [Runtime Animation Sharing](#11-runtime-animation-sharing)
12. [Performance Considerations](#12-performance-considerations)
13. [Common Mistakes](#13-common-mistakes)

---

## 1. Animation Libraries — Core Concepts

Before Godot 4.0, each AnimationPlayer stored its own animations directly. Godot 4.0+ introduced **AnimationLibrary** — a Resource that holds a collection of named animations. This unlocks several workflows:

- **Shared animation packs** — One library file (`.tres`) with walk/run/idle used by multiple characters.
- **Hot-swappable sets** — Swap a character's animation library at runtime (e.g., equipping a different weapon changes the animation set).
- **Modular imports** — Import animations from separate GLTF/Blend files without reimporting the entire character.

### How It Fits Together

```
AnimationPlayer
  └── Libraries (Dictionary[StringName, AnimationLibrary])
       ├── "" (default library)
       │    ├── "idle"
       │    └── "jump"
       ├── "locomotion"
       │    ├── "walk"
       │    └── "run"
       └── "combat"
            ├── "attack_1"
            └── "block"
```

Animations are referenced as `"library_name/animation_name"`. The default (unnamed) library uses just the animation name: `"idle"` is shorthand for `"/idle"`.

---

## 2. Creating and Loading Animation Libraries

### GDScript — Creating a Library in Code

```gdscript
# animation_setup.gd
extends Node3D

@onready var anim_player: AnimationPlayer = $AnimationPlayer

func _ready() -> void:
    _load_animation_libraries()

func _load_animation_libraries() -> void:
    # Load a shared locomotion library
    var locomotion_lib: AnimationLibrary = load(
        "res://animations/locomotion_library.tres")
    anim_player.add_animation_library(&"locomotion", locomotion_lib)

    # Load weapon-specific animations
    var sword_lib: AnimationLibrary = load(
        "res://animations/sword_combat.tres")
    anim_player.add_animation_library(&"combat", sword_lib)

    # Play an animation from a named library
    anim_player.play(&"locomotion/walk")

func swap_weapon_anims(weapon_type: String) -> void:
    # Remove old combat library
    if anim_player.has_animation_library(&"combat"):
        anim_player.remove_animation_library(&"combat")

    # Load new one based on weapon
    var path: String = "res://animations/%s_combat.tres" % weapon_type
    var lib: AnimationLibrary = load(path)
    anim_player.add_animation_library(&"combat", lib)
```

### C# — Creating a Library in Code

```csharp
using Godot;

public partial class AnimationSetup : Node3D
{
    private AnimationPlayer _animPlayer;

    public override void _Ready()
    {
        _animPlayer = GetNode<AnimationPlayer>("AnimationPlayer");
        LoadAnimationLibraries();
    }

    private void LoadAnimationLibraries()
    {
        var locomotionLib = GD.Load<AnimationLibrary>(
            "res://animations/locomotion_library.tres");
        _animPlayer.AddAnimationLibrary("locomotion", locomotionLib);

        var swordLib = GD.Load<AnimationLibrary>(
            "res://animations/sword_combat.tres");
        _animPlayer.AddAnimationLibrary("combat", swordLib);

        _animPlayer.Play("locomotion/walk");
    }

    public void SwapWeaponAnims(string weaponType)
    {
        if (_animPlayer.HasAnimationLibrary("combat"))
            _animPlayer.RemoveAnimationLibrary("combat");

        string path = $"res://animations/{weaponType}_combat.tres";
        var lib = GD.Load<AnimationLibrary>(path);
        _animPlayer.AddAnimationLibrary("combat", lib);
    }
}
```

### Building a Library from Imported GLTF

When you import a `.glb` file containing only animations (no mesh), Godot creates an AnimationLibrary automatically. In the Import dock:

1. Set **Animation → Import** to **Animation Library**.
2. The imported file becomes an `.tres` AnimationLibrary resource.
3. Reference it from any AnimationPlayer with `add_animation_library()`.

---

## 3. AnimationTree and State Machines

AnimationTree drives complex animation logic. Its root can be a **BlendTree** (for manual blending) or an **AnimationNodeStateMachine** (for state-driven transitions).

### GDScript — State Machine Setup

```gdscript
# character_animation.gd
extends CharacterBody3D

@onready var anim_tree: AnimationTree = $AnimationTree
@onready var state_machine: AnimationNodeStateMachinePlayback = (
    anim_tree.get("parameters/playback"))

func _physics_process(_delta: float) -> void:
    var speed: float = velocity.length()

    if is_on_floor():
        if speed < 0.1:
            _travel("idle")
        elif speed < 4.0:
            _travel("walk")
        else:
            _travel("run")
    else:
        if velocity.y > 0:
            _travel("jump_up")
        else:
            _travel("fall")

func _travel(state_name: StringName) -> void:
    if state_machine.get_current_node() != state_name:
        state_machine.travel(state_name)

func play_attack() -> void:
    # OneShot node for attack overlay
    anim_tree.set("parameters/attack_shot/request",
        AnimationNodeOneShot.ONE_SHOT_REQUEST_FIRE)
```

### C# — State Machine Setup

```csharp
using Godot;

public partial class CharacterAnimation : CharacterBody3D
{
    private AnimationTree _animTree;
    private AnimationNodeStateMachinePlayback _stateMachine;

    public override void _Ready()
    {
        _animTree = GetNode<AnimationTree>("AnimationTree");
        _stateMachine = _animTree
            .Get("parameters/playback")
            .As<AnimationNodeStateMachinePlayback>();
    }

    public override void _PhysicsProcess(double delta)
    {
        float speed = Velocity.Length();

        if (IsOnFloor())
        {
            if (speed < 0.1f) Travel("idle");
            else if (speed < 4.0f) Travel("walk");
            else Travel("run");
        }
        else
        {
            Travel(Velocity.Y > 0 ? "jump_up" : "fall");
        }
    }

    private void Travel(StringName stateName)
    {
        if (_stateMachine.GetCurrentNode() != stateName)
            _stateMachine.Travel(stateName);
    }

    public void PlayAttack()
    {
        _animTree.Set("parameters/attack_shot/request",
            (int)AnimationNodeOneShot.OneShotRequest.Fire);
    }
}
```

---

## 4. BlendSpace1D — Speed-Based Blending

BlendSpace1D blends between animations along a single axis. Perfect for walk/run speed blending.

### Setup in AnimationTree (Editor)

1. In your AnimationTree, add an **AnimationNodeBlendSpace1D** node.
2. Add blend points: `idle` at 0.0, `walk` at 2.0, `run` at 6.0.
3. Set the parameter path (e.g., `parameters/locomotion/blend_position`).

### GDScript — Driving BlendSpace1D

```gdscript
@onready var anim_tree: AnimationTree = $AnimationTree

func _physics_process(_delta: float) -> void:
    var speed: float = velocity.length()
    # Feed ground speed into the blend space
    anim_tree.set("parameters/locomotion/blend_position", speed)
```

### C#

```csharp
public override void _PhysicsProcess(double delta)
{
    float speed = Velocity.Length();
    _animTree.Set("parameters/locomotion/blend_position", speed);
}
```

**Tip:** Enable **Snap** on blend points to prevent foot-sliding. Match the walk/run animation root motion speed to the blend point values.

---

## 5. BlendSpace2D — Directional Locomotion

BlendSpace2D blends across two axes — typically **direction** (X) and **speed** (Y). This creates smooth 8-directional movement from a set of directional animations.

### Setup in AnimationTree (Editor)

1. Add an **AnimationNodeBlendSpace2D** node.
2. Place animations at positions matching direction and speed:
   - `(0, 0)` → idle
   - `(0, 1)` → walk forward
   - `(0, 2)` → run forward
   - `(-1, 1)` → strafe left
   - `(1, 1)` → strafe right
   - `(0, -1)` → walk backward

3. Enable **Auto Triangles** for automatic triangle generation.

### GDScript — Driving BlendSpace2D

```gdscript
@onready var anim_tree: AnimationTree = $AnimationTree

func _physics_process(_delta: float) -> void:
    # Get local-space velocity (relative to character facing direction)
    var local_vel: Vector3 = global_transform.basis.inverse() * velocity
    var blend_pos := Vector2(local_vel.x, -local_vel.z)

    # Normalize to your animation's expected range
    # If your run animations are at distance 2.0 from center:
    var max_speed: float = 6.0
    blend_pos = blend_pos / max_speed * 2.0

    anim_tree.set(
        "parameters/locomotion_2d/blend_position", blend_pos)
```

### C#

```csharp
public override void _PhysicsProcess(double delta)
{
    // Local-space velocity for directional blending
    Vector3 localVel = GlobalTransform.Basis.Inverse() * Velocity;
    var blendPos = new Vector2(localVel.X, -localVel.Z);

    float maxSpeed = 6.0f;
    blendPos = blendPos / maxSpeed * 2.0f;

    _animTree.Set("parameters/locomotion_2d/blend_position", blendPos);
}
```

---

## 6. Skeleton Retargeting

Skeleton retargeting lets you play animations made for one skeleton on a different skeleton with different bone proportions. Godot 4.0+ includes a built-in retargeting system using **SkeletonProfile**.

### How Retargeting Works

1. **SkeletonProfile** defines a standard set of bone names and their roles (e.g., "Hips", "Spine", "LeftUpperArm").
2. **BoneMap** maps your skeleton's actual bone names to the profile's standard names.
3. At import time, Godot uses the BoneMap to remap animation tracks from the source skeleton naming to the target skeleton naming.

### Built-In Profile: SkeletonProfileHumanoid

Godot ships with `SkeletonProfileHumanoid` — a standard humanoid bone profile (56 bones). If both your source animations and target character map to this profile, retargeting works automatically.

### Setting Up Retargeting in the Editor

1. Select your imported 3D scene (`.glb`, `.blend`).
2. In the **Import** dock, open **Skeleton → Retarget**.
3. Set **Skeleton Profile** to `SkeletonProfileHumanoid`.
4. Open the **BoneMap** and map each skeleton bone to the corresponding profile bone.
5. Reimport — the animations now reference standardized bone names.

### GDScript — Runtime BoneMap Setup

```gdscript
# retarget_setup.gd
extends Node3D

@onready var skeleton: Skeleton3D = $Character/Skeleton3D

func setup_retargeting() -> void:
    var profile := SkeletonProfileHumanoid.new()
    var bone_map := BoneMap.new()
    bone_map.profile = profile

    # Map your skeleton's bone names to the humanoid profile
    # Only needed if your bones don't match the profile names exactly
    bone_map.set_skeleton_bone_name(&"Hips", &"mixamorig:Hips")
    bone_map.set_skeleton_bone_name(&"Spine", &"mixamorig:Spine")
    bone_map.set_skeleton_bone_name(&"Spine1", &"mixamorig:Spine1")
    bone_map.set_skeleton_bone_name(&"Spine2", &"mixamorig:Spine2")
    bone_map.set_skeleton_bone_name(&"Neck", &"mixamorig:Neck")
    bone_map.set_skeleton_bone_name(&"Head", &"mixamorig:Head")
    bone_map.set_skeleton_bone_name(&"LeftUpperArm", &"mixamorig:LeftArm")
    bone_map.set_skeleton_bone_name(&"LeftLowerArm", &"mixamorig:LeftForeArm")
    bone_map.set_skeleton_bone_name(&"LeftHand", &"mixamorig:LeftHand")
    bone_map.set_skeleton_bone_name(&"RightUpperArm", &"mixamorig:RightArm")
    bone_map.set_skeleton_bone_name(&"RightLowerArm", &"mixamorig:RightForeArm")
    bone_map.set_skeleton_bone_name(&"RightHand", &"mixamorig:RightHand")
    bone_map.set_skeleton_bone_name(&"LeftUpperLeg", &"mixamorig:LeftUpLeg")
    bone_map.set_skeleton_bone_name(&"LeftLowerLeg", &"mixamorig:LeftLeg")
    bone_map.set_skeleton_bone_name(&"LeftFoot", &"mixamorig:LeftFoot")
    bone_map.set_skeleton_bone_name(&"RightUpperLeg", &"mixamorig:RightUpLeg")
    bone_map.set_skeleton_bone_name(&"RightLowerLeg", &"mixamorig:RightLeg")
    bone_map.set_skeleton_bone_name(&"RightFoot", &"mixamorig:RightFoot")

    # Save for reuse
    ResourceSaver.save(bone_map, "res://retarget/mixamo_bone_map.tres")
```

### C# — Runtime BoneMap Setup

```csharp
using Godot;

public partial class RetargetSetup : Node3D
{
    public void SetupRetargeting()
    {
        var profile = new SkeletonProfileHumanoid();
        var boneMap = new BoneMap { Profile = profile };

        // Map Mixamo naming to Godot humanoid profile
        boneMap.SetSkeletonBoneName("Hips", "mixamorig:Hips");
        boneMap.SetSkeletonBoneName("Spine", "mixamorig:Spine");
        boneMap.SetSkeletonBoneName("Spine1", "mixamorig:Spine1");
        boneMap.SetSkeletonBoneName("Spine2", "mixamorig:Spine2");
        boneMap.SetSkeletonBoneName("Neck", "mixamorig:Neck");
        boneMap.SetSkeletonBoneName("Head", "mixamorig:Head");
        boneMap.SetSkeletonBoneName("LeftUpperArm", "mixamorig:LeftArm");
        boneMap.SetSkeletonBoneName("RightUpperArm", "mixamorig:RightArm");
        boneMap.SetSkeletonBoneName("LeftUpperLeg", "mixamorig:LeftUpLeg");
        boneMap.SetSkeletonBoneName("RightUpperLeg", "mixamorig:RightUpLeg");
        // ... continue for all bones

        ResourceSaver.Save(boneMap, "res://retarget/mixamo_bone_map.tres");
    }
}
```

---

## 7. Retargeting Workflow: Blender to Godot

### Recommended Pipeline

1. **Standardize rigs in Blender** — Use a consistent naming convention (Mixamo, Rigify, or your own). Export the rest pose in T-pose.

2. **Export character mesh as one `.glb`** — Include the skeleton and mesh, but not necessarily animations.

3. **Export animations as separate `.glb` files** — Each file contains just the Armature with animations, no mesh. This keeps files small and lets you manage animations independently.

4. **Import into Godot** — In the Import dock for each animation `.glb`:
   - Set **Animation → Import** to **Animation Library**.
   - Under **Skeleton → Retarget**, assign the `SkeletonProfileHumanoid` and your BoneMap.

5. **Load libraries at runtime** — Use `add_animation_library()` to attach imported libraries to any character's AnimationPlayer.

### Handling Mixamo Animations

Mixamo uses the `mixamorig:` prefix on all bones. Create a BoneMap once and reuse it:

```gdscript
# Save this as a .tres resource and reuse across all Mixamo imports
var mixamo_map: BoneMap = load("res://retarget/mixamo_bone_map.tres")
```

In the Import dock, assign this BoneMap under **Skeleton → Retarget → Bone Map**.

---

## 8. Animation Callbacks and Events

AnimationPlayer can call methods at specific keyframes. Use method tracks or the `animation_finished` signal:

```gdscript
func _ready() -> void:
    var anim_player: AnimationPlayer = $AnimationPlayer
    anim_player.animation_finished.connect(_on_animation_finished)

func _on_animation_finished(anim_name: StringName) -> void:
    match anim_name:
        &"locomotion/attack_1":
            _apply_damage()
        &"locomotion/death":
            queue_free()

# Method called from an animation method track
func spawn_vfx(vfx_path: String, bone_name: String) -> void:
    var vfx: GPUParticles3D = load(vfx_path).instantiate()
    var bone_idx: int = $Skeleton3D.find_bone(bone_name)
    var bone_transform: Transform3D = $Skeleton3D.get_bone_global_pose(bone_idx)
    vfx.global_transform = $Skeleton3D.global_transform * bone_transform
    get_tree().current_scene.add_child(vfx)
```

---

## 9. Layered Animation with Add/Blend Nodes

Use AnimationTree's **Add2**, **Blend2**, and **OneShot** nodes to layer animations:

### Upper-Body Override (Aiming While Running)

```gdscript
# In AnimationTree, set up:
# Root → Blend2 (filter: upper body bones only)
#   ├── Input 0: StateMachine (locomotion)
#   └── Input 1: AimPose

# Drive the blend amount from code:
func _process(_delta: float) -> void:
    var is_aiming: bool = Input.is_action_pressed("aim")
    var blend_amount: float = 1.0 if is_aiming else 0.0
    anim_tree.set("parameters/upper_blend/blend_amount", blend_amount)
```

### Filtering Bones

In the AnimationTree editor, select the Blend2/Add2 node and click **Edit Filters**. Check only the bones you want the second input to affect (e.g., Spine, Arms, Head for upper-body aiming).

---

## 10. Root Motion

Root motion extracts movement from the animation (hip displacement) and applies it to the character's transform instead of the skeleton.

### GDScript — Root Motion Setup

```gdscript
extends CharacterBody3D

@onready var anim_tree: AnimationTree = $AnimationTree

func _ready() -> void:
    # Tell AnimationTree which bone drives root motion
    # This is configured in the AnimationTree resource's root_motion_track
    pass

func _physics_process(delta: float) -> void:
    # Get root motion from AnimationTree
    var root_motion: Vector3 = anim_tree.get_root_motion_position()
    var root_rotation: Quaternion = anim_tree.get_root_motion_rotation()

    # Apply rotation
    var current_rotation: Quaternion = quaternion
    quaternion = current_rotation * root_rotation

    # Apply movement in world space
    velocity = (global_transform.basis * root_motion) / delta
    move_and_slide()
```

### C#

```csharp
public override void _PhysicsProcess(double delta)
{
    Vector3 rootMotion = _animTree.GetRootMotionPosition();
    Quaternion rootRotation = _animTree.GetRootMotionRotation();

    Quaternion currentRotation = Quaternion;
    Quaternion = currentRotation * rootRotation;

    Velocity = (GlobalTransform.Basis * rootMotion) / (float)delta;
    MoveAndSlide();
}
```

Set the root motion track in the AnimationTree inspector: **Root Motion Track** → select the hip/root bone track path (e.g., `Skeleton3D:Hips`).

---

## 11. Runtime Animation Sharing

Share one AnimationLibrary across multiple characters at runtime:

```gdscript
# animation_manager.gd — autoload singleton
extends Node

var _library_cache: Dictionary[String, AnimationLibrary] = {}

func get_library(path: String) -> AnimationLibrary:
    if not _library_cache.has(path):
        _library_cache[path] = load(path) as AnimationLibrary
    return _library_cache[path]

func apply_library(
    player: AnimationPlayer,
    library_name: StringName,
    library_path: String
) -> void:
    if player.has_animation_library(library_name):
        player.remove_animation_library(library_name)
    player.add_animation_library(library_name, get_library(library_path))
```

```csharp
using Godot;
using System.Collections.Generic;

public partial class AnimationManager : Node
{
    private readonly Dictionary<string, AnimationLibrary> _cache = new();

    public AnimationLibrary GetLibrary(string path)
    {
        if (!_cache.TryGetValue(path, out var lib))
        {
            lib = GD.Load<AnimationLibrary>(path);
            _cache[path] = lib;
        }
        return lib;
    }

    public void ApplyLibrary(
        AnimationPlayer player, StringName libraryName, string path)
    {
        if (player.HasAnimationLibrary(libraryName))
            player.RemoveAnimationLibrary(libraryName);
        player.AddAnimationLibrary(libraryName, GetLibrary(path));
    }
}
```

**Important:** AnimationLibrary is a Resource. If you share the same instance across multiple AnimationPlayers and modify it at runtime (add/remove animations), all players see the change. Use `duplicate()` if you need independent copies.

---

## 12. Performance Considerations

- **AnimationTree vs AnimationPlayer** — AnimationTree evaluates every frame even when the character is off-screen. Disable `active` on AnimationTree for distant characters and fall back to AnimationPlayer with simple `play()` calls.
- **Blend point count** — BlendSpace2D with more than ~12 points adds triangulation overhead. Keep it under 9 for locomotion; use a state machine to switch between blend spaces for different movement modes.
- **Library loading** — `load()` is synchronous. For large animation libraries, use `ResourceLoader.load_threaded_request()` to load in the background.
- **Retargeting at import vs runtime** — Always retarget at import time (via BoneMap in the Import dock). Runtime retargeting is not supported by the built-in system; the mapping happens during the import conversion step.
- **Shared libraries** — Sharing one AnimationLibrary instance across 50+ characters is fine. The library stores animation data; playback state lives in each AnimationPlayer.

---

## 13. Common Mistakes

| Mistake | Fix |
|---------|-----|
| Animation not found after adding library | Use the full path: `"library_name/animation_name"`. The default library uses no prefix. |
| BlendSpace jerky transitions | Ensure your animation clips are looping and have matching frame counts. Set `Blend Mode` to **Interpolated** in the BlendSpace inspector. |
| Retargeted animations have wrong proportions | The rest pose must match. Both source and target should be in T-pose (or A-pose — be consistent). Mismatched rest poses cause bone offsets. |
| BoneMap has unmapped bones | Unmapped bones won't receive animation data. Map at least all major bones (hips, spine chain, limbs). Fingers and face bones are optional. |
| Root motion drifting | Ensure the root bone track is set correctly in AnimationTree's `root_motion_track`. The animation itself must have actual root bone movement, not just visual offset. |
| `animation_finished` not firing with AnimationTree | `animation_finished` is an AnimationPlayer signal. When using AnimationTree, listen to `animation_finished` on the AnimationTree node instead, or use method call tracks. |
| Modifying a shared AnimationLibrary | Changes affect all users. Call `library.duplicate()` if a character needs modified animations (e.g., speed-adjusted clips). |
