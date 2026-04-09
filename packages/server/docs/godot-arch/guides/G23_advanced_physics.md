# G23 — Advanced Physics: Jolt, Rapier & Custom Integrations

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#  
> **Related:** [G5 Physics & Collision](./G5_physics_and_collision.md) · [G16 GDExtension & Native Code](./G16_gdextension_native_code.md) · [G18 Performance Profiling](./G18_performance_profiling.md) · [G13 Networking & Multiplayer](./G13_networking_and_multiplayer.md)

---

## What This Guide Covers

Godot 4.4 introduced the Jolt physics engine as a built-in alternative to Godot Physics for 3D. Meanwhile, the community-developed Rapier plugin provides a drop-in replacement for both 2D and 3D with deterministic simulation. This guide covers when to switch physics backends, how to configure Jolt and Rapier, advanced physics patterns (custom collision layers, continuous collision detection, physics interpolation), and how to build your own physics integration through GDExtension.

**Use this guide when:** the default Godot Physics engine has stability issues (ghost collisions, tunneling), you need deterministic physics for multiplayer or replays, you want better 3D physics performance, or you're integrating a custom physics engine.

**Don't switch engines blindly.** The default Godot Physics works well for most 2D games and many 3D projects. Profile first, and only swap backends when you have a specific problem to solve.

---

## Table of Contents

1. [Physics Backend Landscape](#1-physics-backend-landscape)
2. [Jolt Physics — Built-In Alternative (4.4+)](#2-jolt-physics--built-in-alternative-44)
3. [Rapier Physics — Community GDExtension](#3-rapier-physics--community-gdextension)
4. [Choosing a Physics Backend](#4-choosing-a-physics-backend)
5. [Physics Interpolation](#5-physics-interpolation)
6. [Continuous Collision Detection (CCD)](#6-continuous-collision-detection-ccd)
7. [Advanced Collision Layers and Masks](#7-advanced-collision-layers-and-masks)
8. [Custom Physics Materials](#8-custom-physics-materials)
9. [Deterministic Physics for Multiplayer](#9-deterministic-physics-for-multiplayer)
10. [Custom Physics via GDExtension](#10-custom-physics-via-gdextension)
11. [Common Mistakes](#11-common-mistakes)

---

## 1. Physics Backend Landscape

Godot 4 uses a **server-based** physics architecture. Physics bodies, shapes, and spaces are managed by a `PhysicsServer2D` or `PhysicsServer3D` singleton. The actual implementation behind this server can be swapped at project startup.

| Backend | Dimensions | Source | Deterministic | Status |
|---------|-----------|--------|---------------|--------|
| **Godot Physics** | 2D + 3D | Built-in | ❌ | Default, stable |
| **Jolt Physics** | 3D only | Built-in (4.4+) | ❌ | Experimental |
| **Rapier** | 2D + 3D | GDExtension | ✅ (optional) | Community, active |

All backends use the same node-based API (`RigidBody2D`, `CharacterBody3D`, etc.), so switching between them requires minimal code changes — mostly just project settings.

---

## 2. Jolt Physics — Built-In Alternative (4.4+)

### What Is Jolt?

Jolt is an open-source C++ physics library by Jorrit Rouwe, designed for games and VR. As of Godot 4.4, it's integrated as an engine module — no plugin installation needed.

### When to Use Jolt

- You're making a **3D** game (Jolt does not affect 2D physics).
- You experience ghost collisions, tunneling, or instability with Godot Physics 3D.
- You need better performance with many rigid bodies (Jolt is multithreaded internally).
- You want more predictable stacking, joints, and contact resolution.

### How to Enable Jolt

**Project Settings > General > Physics > 3D > Physics Engine:**

```
physics/3d/physics_engine = "JoltPhysics3D"
```

Restart the editor after changing this setting.

### Differences from Godot Physics 3D

| Behavior | Godot Physics | Jolt |
|----------|--------------|------|
| **Stacking stability** | Adequate | Better — substepping improves convergence |
| **Tunneling prevention** | Manual CCD setup | Better default CCD for fast objects |
| **Multithreading** | Single-threaded | Multi-threaded broad phase + solver |
| **Joint stability** | Can oscillate with heavy chains | More stable joint solver |
| **Ghost collisions** | Occasional on mesh edges | Significantly reduced |
| **Soft bodies** | Supported | ❌ Not supported yet |
| **Area gravity/damping overrides** | Full support | ⚠️ Some edge cases differ |
| **Custom integrators** | Supported | ⚠️ Limited support |

### Known Limitations (4.4)

Jolt is **experimental** in 4.4 and has these gaps:

- **No soft body support** — `SoftBody3D` nodes will not simulate.
- **No heightmap collision shape optimization** — uses generic mesh fallback.
- **Subtle behavioral differences** — physics results may differ slightly (object settling, bounce angles). Expect to retune physics materials.
- **2D is unaffected** — Jolt only replaces the 3D physics server.

### Jolt-Specific Project Settings

When Jolt is active, additional settings appear under **Physics > Jolt 3D**:

- `max_bodies` — Maximum number of physics bodies (default: 10240).
- `max_body_pairs` — Broad phase pair buffer size.
- `max_contact_constraints` — Solver constraint limit.
- `num_velocity_steps` — Solver iterations for velocity (default: 10).
- `num_position_steps` — Solver iterations for position (default: 2).

For most games, the defaults are fine. Increase solver steps if you need tighter joint/stacking accuracy at the cost of CPU time.

---

## 3. Rapier Physics — Community GDExtension

### What Is Rapier?

Rapier is a Rust-based physics engine offering both 2D and 3D simulation. The Godot Rapier plugin wraps it as a GDExtension, making it a drop-in replacement that uses the same node API.

### Key Features

- **Deterministic simulation** — cross-platform determinism when using the "slow" build.
- **No ghost collisions** — a persistent complaint with Godot Physics 2D.
- **State serialization** — save/restore the entire physics state (useful for rollback netcode).
- **Fluid simulation** — basic 2D/3D liquid via the Salva library.
- **1:1 API compatibility** — supports RigidBody, Area, CharacterBody, all shape types, joints.

### Installation

**From Asset Library:**
1. Open AssetLib tab in the Godot editor.
2. Search for "Rapier Physics 2D" or "Rapier Physics 3D".
3. Download and install to your project's `addons/` folder.
4. Choose between:
   - **Fast Version** — uses parallel SIMD solver, not deterministic across platforms.
   - **Cross-Platform Deterministic** — slower, but IEEE 754-compliant determinism.

**Manual Installation:**
1. Download the latest release from the GitHub repository.
2. Copy the `addons/` folder into your project root.

### Enabling Rapier

After installation, change the physics engine in **Project Settings > Physics**:

```
# For 2D
physics/2d/physics_engine = "Rapier2D"

# For 3D
physics/3d/physics_engine = "Rapier3D"
```

Restart the editor.

### Rapier-Specific Features

**Fluid Simulation:**

Rapier includes experimental fluid simulation. Add fluid particles to simulate water, lava, or other liquids:

```gdscript
# GDScript — basic Rapier fluid setup (requires Rapier plugin)
# Create a Fluid2D node in your scene
# Configure particle radius, density, and viscosity in the inspector
# Rapier handles particle-particle and particle-body interactions
```

**State Serialization:**

```gdscript
# Save physics state
var state: PackedByteArray = PhysicsServer2D.space_get_state(get_world_2d().space)

# Restore physics state (e.g., for rollback)
PhysicsServer2D.space_set_state(get_world_2d().space, state)
```

> **Note:** State serialization API is specific to the Rapier plugin and will error with other backends.

---

## 4. Choosing a Physics Backend

```
Do you need 2D physics improvements?
├─ YES → Rapier 2D (ghost collisions, determinism)
└─ NO
   ├─ Do you need 3D physics?
   │  ├─ YES
   │  │  ├─ Need determinism? → Rapier 3D (deterministic build)
   │  │  ├─ Need soft bodies? → Godot Physics (Jolt doesn't support them)
   │  │  ├─ Need better stability/performance? → Jolt
   │  │  └─ Default projects → Godot Physics (safe, well-tested)
   │  └─ NO → Godot Physics (default is fine for 2D)
   └─ Need cross-platform determinism for netcode? → Rapier (either dimension)
```

### Migration Checklist

When switching backends mid-project:

1. **Back up your project** — physics behavior will change.
2. Change the setting in Project Settings and restart.
3. Test all physics interactions — stacking, collisions, joints, character controllers.
4. Retune physics materials (friction, bounce) — different engines have different defaults.
5. Test performance — Jolt may be faster with many bodies; Rapier may add overhead for simple scenes.
6. Check edge cases — one-way platforms, area overlap detection, raycasts.

---

## 5. Physics Interpolation

Physics runs at a fixed tick rate (default: 60 Hz), but rendering runs at the display refresh rate. Without interpolation, physics objects stutter visibly at high frame rates or low physics rates.

### Enabling Physics Interpolation

```
# Project Settings
physics/common/physics_interpolation = true
```

This interpolates the visual transform of physics bodies between physics ticks, producing smooth motion at any frame rate.

### Per-Node Control

```gdscript
# Disable interpolation for a specific node (e.g., snapping objects)
$RigidBody3D.physics_interpolation_mode = Node.PHYSICS_INTERPOLATION_MODE_OFF

# Force interpolation even if the parent disables it
$Child.physics_interpolation_mode = Node.PHYSICS_INTERPOLATION_MODE_ON
```

### When to Disable

- **Teleportation:** After teleporting a body, call `reset_physics_interpolation()` to prevent it from visually lerping from its old position.
- **UI-attached objects:** Health bars following a character should read the interpolated position, not the physics position.

```gdscript
# GDScript — teleport with interpolation reset
func teleport_to(pos: Vector3) -> void:
    global_position = pos
    reset_physics_interpolation()
```

---

## 6. Continuous Collision Detection (CCD)

Fast-moving objects can tunnel through thin walls when they move farther than the wall's thickness in a single physics tick.

### Enabling CCD on RigidBody

```gdscript
# In the Inspector or via code
$RigidBody3D.continuous_cd = true   # 3D
$RigidBody2D.continuous_cd = RigidBody2D.CCD_MODE_CAST_RAY  # 2D
```

### CCD Modes (2D)

| Mode | How It Works | Cost |
|------|-------------|------|
| `CCD_MODE_DISABLED` | No CCD | Cheapest |
| `CCD_MODE_CAST_RAY` | Casts a ray along the motion vector | Low |
| `CCD_MODE_CAST_SHAPE` | Sweeps the full shape along motion | Higher, more accurate |

### When CCD Isn't Enough

For extremely fast objects (bullets), CCD may still miss at very low physics rates. Alternatives:
- Increase physics tick rate: `Engine.physics_ticks_per_second = 120`
- Use raycasts instead of physics bodies for projectiles.
- Use Jolt, which has more aggressive built-in tunneling prevention.

---

## 7. Advanced Collision Layers and Masks

### Layer Strategy for Complex Games

Godot supports 32 collision layers. Name them in **Project Settings > Layer Names > 2D Physics** (or 3D Physics):

```
Layer 1:  "world"        — Static geometry, terrain
Layer 2:  "player"       — Player character
Layer 3:  "enemies"      — Enemy characters
Layer 4:  "projectiles"  — Bullets, arrows
Layer 5:  "pickups"      — Collectibles, power-ups
Layer 6:  "triggers"     — Area2D/3D trigger zones
Layer 7:  "interactable" — Doors, switches, NPCs
Layer 8:  "debris"       — Non-gameplay physics objects
```

### Configuring Layers and Masks

- **Layer:** What this body **is** (its identity).
- **Mask:** What this body **collides with** (what it detects).

```gdscript
# GDScript — set layers and masks via code
func _ready() -> void:
    # This is a projectile that collides with world, enemies, and interactables
    collision_layer = 0  # Clear all
    set_collision_layer_value(4, true)   # Layer 4: projectiles

    collision_mask = 0
    set_collision_mask_value(1, true)    # Detects: world
    set_collision_mask_value(3, true)    # Detects: enemies
    set_collision_mask_value(7, true)    # Detects: interactable
```

### Performance Tip

Collision detection cost scales with the number of potential pairs. Use layers to eliminate impossible pairs early:
- Debris should not collide with pickups.
- Projectiles should not collide with other projectiles.
- Triggers should only detect players and enemies, not geometry.

---

## 8. Custom Physics Materials

### PhysicsMaterial Resource

Godot's `PhysicsMaterial` controls friction and bounce per-body:

```gdscript
# GDScript — creating a physics material
var ice_material := PhysicsMaterial.new()
ice_material.friction = 0.05   # Very slippery
ice_material.bounce = 0.1      # Barely bouncy
ice_material.rough = false      # Use minimum friction in contacts
ice_material.absorbent = false  # Use minimum bounce in contacts

$RigidBody3D.physics_material_override = ice_material
```

### Friction Combine Modes

When two bodies collide, Godot combines their friction values:
- `rough = false` → uses the **minimum** of the two frictions.
- `rough = true` → uses the **maximum** of the two frictions.

Same for bounce:
- `absorbent = false` → uses the **minimum** bounce.
- `absorbent = true` → uses the **maximum** bounce.

### Material Presets Pattern

```gdscript
# GDScript — reusable physics material library
class_name PhysicsMaterials

static var ICE: PhysicsMaterial:
    get:
        var mat := PhysicsMaterial.new()
        mat.friction = 0.05
        mat.bounce = 0.1
        return mat

static var RUBBER: PhysicsMaterial:
    get:
        var mat := PhysicsMaterial.new()
        mat.friction = 0.9
        mat.bounce = 0.8
        return mat

static var METAL: PhysicsMaterial:
    get:
        var mat := PhysicsMaterial.new()
        mat.friction = 0.4
        mat.bounce = 0.3
        return mat
```

> **Better approach:** Create `.tres` resource files for each material and reference them in the inspector. This avoids creating new instances every access and lets designers tweak values without code.

---

## 9. Deterministic Physics for Multiplayer

### Why Determinism Matters

Lockstep and rollback netcode architectures require that the same inputs produce the **exact same** simulation on every client. Floating-point non-determinism (different CPU, different OS, different compiler optimizations) breaks this.

### Godot Physics and Jolt Are Not Deterministic

Both use optimizations (SIMD, multithreading in Jolt) that can produce different results on different platforms. They are suitable for client-server architectures where the server is authoritative, but not for lockstep.

### Rapier's Deterministic Mode

The "Cross-Platform Deterministic" build of Rapier guarantees identical results on all IEEE 754-2008 compliant platforms:

1. Install the deterministic build from the Asset Library.
2. Enable Rapier as the physics engine.
3. Use fixed timestep (default `physics_ticks_per_second = 60`).
4. Ensure identical input ordering on all clients.

### Rollback with Rapier State Serialization

```gdscript
# GDScript — rollback netcode pattern with Rapier
var _state_history: Array[PackedByteArray] = []
const MAX_HISTORY: int = 120  # 2 seconds at 60 Hz

func _physics_process(_delta: float) -> void:
    # Save state before applying input
    var state: PackedByteArray = PhysicsServer2D.space_get_state(
        get_world_2d().space
    )
    _state_history.append(state)
    if _state_history.size() > MAX_HISTORY:
        _state_history.pop_front()

    # Apply local + remote inputs
    _apply_inputs(get_current_frame_inputs())

func rollback_to_frame(frame: int) -> void:
    var state: PackedByteArray = _state_history[frame]
    PhysicsServer2D.space_set_state(get_world_2d().space, state)
    # Re-simulate from frame to current with corrected inputs
```

> **Note:** This API is Rapier-specific. Calling `space_get_state` / `space_set_state` with Godot Physics or Jolt will fail.

---

## 10. Custom Physics via GDExtension

For specialized needs (vehicle physics, cloth, destruction), you can write a custom `PhysicsServer2DExtension` or `PhysicsServer3DExtension` in C++.

### Architecture

```
┌─────────────────────────────────┐
│  Your GDScript / C# game code  │
│  (RigidBody3D, Area3D, etc.)   │
└──────────┬──────────────────────┘
           │ calls
┌──────────▼──────────────────────┐
│  PhysicsServer3D (singleton)    │
│  Abstract interface             │
└──────────┬──────────────────────┘
           │ dispatches to
┌──────────▼──────────────────────┐
│  Your Custom Implementation     │
│  (GDExtension, C++)             │
│  Implements PhysicsServer3D     │
│  extension methods              │
└─────────────────────────────────┘
```

### Extension Approach

1. Create a GDExtension project (see [G16](./G16_gdextension_native_code.md)).
2. Subclass `PhysicsServer3DExtension` in C++.
3. Implement the required virtual methods (body creation, shape management, stepping).
4. Register your server in the `.gdextension` file.
5. Set `physics/3d/physics_engine` to your server's name.

This is advanced work — most games should use Jolt or Rapier rather than building a custom integration. But for niche needs (ocean buoyancy, planetary gravity, voxel physics), a custom server gives you total control.

### Simpler Alternative: Physics Process Override

For gameplay-level custom physics (not engine-level), use `_integrate_forces()`:

```gdscript
# GDScript — custom gravity per-body
extends RigidBody3D

@export var custom_gravity: Vector3 = Vector3(0, -15.0, 0)
@export var use_custom_gravity: bool = true

func _integrate_forces(state: PhysicsDirectBodyState3D) -> void:
    if use_custom_gravity:
        # Cancel default gravity and apply custom
        state.linear_velocity += (custom_gravity - ProjectSettings.get_setting(
            "physics/3d/default_gravity_vector"
        ) * ProjectSettings.get_setting(
            "physics/3d/default_gravity"
        )) * state.step
```

---

## 11. Common Mistakes

| Mistake | Why It Fails | Fix |
|---------|-------------|-----|
| Switching to Jolt expecting identical behavior | Different solver = different results | Retune physics materials and test all interactions |
| Using Rapier deterministic build and expecting speed | Deterministic build disables SIMD parallelism | Only use deterministic build when you need it (lockstep/rollback) |
| Enabling CCD on every body | Significant performance cost | Only enable on fast-moving or gameplay-critical bodies |
| Not restarting editor after changing physics engine | Setting doesn't take effect until restart | Always restart |
| Mixing Rapier-specific API with portable code | `space_get_state` fails on Godot Physics/Jolt | Gate Rapier-specific calls behind a backend check |
| 32+ collision layers | Godot only supports 32 per dimension | Use layer groups strategically; 32 is usually enough |
| Forgetting `reset_physics_interpolation()` after teleport | Object visually slides from old position | Call it immediately after setting the new position |
| Running physics at 120 Hz "for accuracy" | Doubles CPU cost | Only increase if you have measured tunneling issues |

---

## Further Reading

- [G5 Physics & Collision](./G5_physics_and_collision.md) — Fundamentals of Godot physics
- [G16 GDExtension & Native Code](./G16_gdextension_native_code.md) — Building C++ extensions
- [G13 Networking & Multiplayer](./G13_networking_and_multiplayer.md) — Netcode architectures
- [G18 Performance Profiling](./G18_performance_profiling.md) — Profiling physics performance
