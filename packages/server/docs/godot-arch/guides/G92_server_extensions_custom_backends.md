# G92 — Server Extensions & Custom Backends

> **Category:** guide · **Engine:** Godot 4.x · **Related:** [G16 GDExtension Native Code](./G16_gdextension_native_code.md) · [G76 GDExtension with Rust](./G76_gdextension_with_rust.md) · [G23 Advanced Physics](./G23_advanced_physics.md) · [G47 RenderingServer & Low-Level Graphics](./G47_rendering_server_and_low_level_graphics.md)

Godot 4 uses a **server architecture** — singletons like `PhysicsServer3D`, `RenderingServer`, and `AudioServer` handle engine subsystems behind an abstract API. Starting in Godot 4.0, most servers expose `*Extension` base classes that let you implement your own backend via GDExtension. This is how Godot Jolt replaced GodotPhysics, how community projects bring Box2D to Godot, and how you can plug in custom physics, audio, or text-shaping engines without forking the engine.

This guide covers the architecture, walks through building a custom `PhysicsServer2DExtension`, and provides practical guidance for when and how to extend the server layer.

---

## Table of Contents

1. [Server Architecture Overview](#1-server-architecture-overview)
2. [Available Extension Classes](#2-available-extension-classes)
3. [When to Write a Custom Server](#3-when-to-write-a-custom-server)
4. [Building a PhysicsServer2DExtension (C++)](#4-building-a-physicsserver2dextension-c)
5. [Registering Your Server Backend](#5-registering-your-server-backend)
6. [GDScript Interaction with Custom Servers](#6-gdscript-interaction-with-custom-servers)
7. [PhysicsServer3DExtension Overview](#7-physicsserver3dextension-overview)
8. [C# Integration](#8-c-integration)
9. [Testing Your Custom Server](#9-testing-your-custom-server)
10. [Real-World Examples](#10-real-world-examples)
11. [Performance Considerations](#11-performance-considerations)
12. [Common Mistakes](#12-common-mistakes)

---

## 1. Server Architecture Overview

Godot's server singletons provide the backend for node-based APIs:

```
Scene Tree (Nodes)             Server Layer (Singletons)
──────────────────             ─────────────────────────
RigidBody3D, Area3D     →     PhysicsServer3D
CharacterBody2D, Area2D →     PhysicsServer2D
MeshInstance3D, Light3D  →     RenderingServer
AudioStreamPlayer        →     AudioServer
Label, RichTextLabel     →     TextServer
NavigationAgent3D        →     NavigationServer3D
```

**Why this matters:** Nodes are convenience wrappers. The server does the real work. When you replace a server, every node that depends on it automatically uses your implementation — no changes to game code needed.

**RID-based API:** Servers use `RID` (Resource ID) handles instead of direct object references. You create a body with `PhysicsServer2D.body_create()`, get back a `RID`, and all subsequent operations reference that RID. This keeps the server layer decoupled from the scene tree.

---

## 2. Available Extension Classes

Godot 4.x provides these extension base classes (all usable from GDExtension):

| Extension Class | Replaces | Typical Use |
|----------------|----------|-------------|
| `PhysicsServer2DExtension` | `PhysicsServer2D` | Custom 2D physics (Box2D, Chipmunk) |
| `PhysicsServer3DExtension` | `PhysicsServer3D` | Custom 3D physics (Jolt, Rapier, PhysX) |
| `PhysicsDirectBodyState2DExtension` | `PhysicsDirectBodyState2D` | Body state queries for your 2D engine |
| `PhysicsDirectBodyState3DExtension` | `PhysicsDirectBodyState3D` | Body state queries for your 3D engine |
| `PhysicsDirectSpaceState2DExtension` | `PhysicsDirectSpaceState2D` | Raycasts and queries for your 2D engine |
| `PhysicsDirectSpaceState3DExtension` | `PhysicsDirectSpaceState3D` | Raycasts and queries for your 3D engine |
| `TextServerExtension` | `TextServer` | Custom text shaping/rendering |
| `AudioEffectExtension` | `AudioEffect` | Custom audio effects |
| `AudioStreamExtension` | `AudioStream` | Custom audio stream sources |

> **Note:** `RenderingServer` and `NavigationServer3D` do not currently have public extension classes. Rendering customization goes through `CompositorEffect` (see [G36](./G36_compositor_effects.md)), and navigation uses the built-in implementation.

---

## 3. When to Write a Custom Server

**Good reasons:**

- You need a proven physics engine for your genre (Box2D for platformers, Jolt for 3D action games).
- You're building a deterministic simulation (custom physics with fixed-point math for rollback netcode).
- You need specialized audio processing (custom DSP chain, middleware integration beyond FMOD/Wwise).
- You need a text shaping engine for a specific language or script not well-served by ICU/HarfBuzz.

**Bad reasons:**

- You want to tweak a few physics parameters → use `ProjectSettings` and `PhysicsServer2D` calls from GDScript instead.
- You want custom collision shapes → use `PhysicsServer2D.body_add_shape()` with custom geometry.
- You want physics on a background thread → Godot already does threaded physics in 4.x.

---

## 4. Building a PhysicsServer2DExtension (C++)

This walkthrough covers the GDExtension (C++) approach, which is the standard way to implement custom servers.

### Project Setup

Use the `godot-cpp` bindings. Your `SConstruct` or CMake project links against `godot-cpp` and produces a shared library (`.so`, `.dll`, `.dylib`).

```
my_physics_extension/
├── src/
│   ├── register_types.cpp
│   ├── register_types.h
│   ├── my_physics_server_2d.h
│   └── my_physics_server_2d.cpp
├── SConstruct
└── my_physics.gdextension
```

### Extension Header

```cpp
// my_physics_server_2d.h
#pragma once

#include <godot_cpp/classes/physics_server2d_extension.hpp>
#include <godot_cpp/templates/hash_map.hpp>

using namespace godot;

class MyPhysicsServer2D : public PhysicsServer2DExtension {
    GDCLASS(MyPhysicsServer2D, PhysicsServer2DExtension);

protected:
    static void _bind_methods();

public:
    // --- Space ---
    virtual RID _space_create() override;
    virtual void _space_set_active(const RID &p_space, bool p_active) override;
    virtual bool _space_is_active(const RID &p_space) const override;

    // --- Body ---
    virtual RID _body_create() override;
    virtual void _body_set_space(const RID &p_body, const RID &p_space) override;
    virtual void _body_set_mode(const RID &p_body,
        PhysicsServer2D::BodyMode p_mode) override;
    virtual void _body_add_shape(const RID &p_body, const RID &p_shape,
        const Transform2D &p_transform, bool p_disabled) override;

    // --- Shape ---
    virtual RID _shape_create(PhysicsServer2D::ShapeType p_shape) override;
    virtual void _shape_set_data(const RID &p_shape,
        const Variant &p_data) override;

    // --- Step ---
    virtual void _step(double p_step) override;
    virtual void _sync() override;
    virtual void _flush_queries() override;

    // --- Lifecycle ---
    virtual void _init() override;
    virtual void _finish() override;

    // You must implement ~40 virtual methods total.
    // See PhysicsServer2DExtension docs for the full list.
};
```

### Minimal Implementation

```cpp
// my_physics_server_2d.cpp
#include "my_physics_server_2d.h"

void MyPhysicsServer2D::_bind_methods() {
    // No additional methods to bind for a pure server replacement
}

// --- Space ---

RID MyPhysicsServer2D::_space_create() {
    // Allocate your internal space data structure
    // Return a RID that maps to it
    MySpace *space = memnew(MySpace);
    RID rid = _make_rid(space);  // Helper to generate RIDs
    return rid;
}

void MyPhysicsServer2D::_space_set_active(const RID &p_space, bool p_active) {
    MySpace *space = _get_space(p_space);
    if (space) {
        space->active = p_active;
    }
}

// --- Step (called every physics tick) ---

void MyPhysicsServer2D::_step(double p_step) {
    // Run your physics simulation for one timestep.
    // This is where your engine (Box2D, custom solver, etc.)
    // does its work.
    for (auto &space : _active_spaces) {
        space->step(p_step);
    }
}

void MyPhysicsServer2D::_sync() {
    // Sync physics results back to the scene tree.
    // Called after _step, before rendering.
}

void MyPhysicsServer2D::_flush_queries() {
    // Process collision callbacks, body state queries.
}
```

### Registration

```cpp
// register_types.cpp
#include "register_types.h"
#include "my_physics_server_2d.h"
#include <godot_cpp/classes/physics_server2d_manager.hpp>

using namespace godot;

static MyPhysicsServer2D *physics_server = nullptr;

// Factory function called by the engine
static PhysicsServer2D *_create_my_physics_server() {
    physics_server = memnew(MyPhysicsServer2D);
    return physics_server;
}

void initialize_my_physics(ModuleInitializationLevel p_level) {
    if (p_level == MODULE_INITIALIZATION_LEVEL_SERVERS) {
        ClassDB::register_class<MyPhysicsServer2D>();
        PhysicsServer2DManager::get_singleton()->register_server(
            "MyPhysics", callable_mp_static(_create_my_physics_server)
        );
    }
}

void uninitialize_my_physics(ModuleInitializationLevel p_level) {
    // Cleanup handled by engine freeing the server
}
```

---

## 5. Registering Your Server Backend

After building your GDExtension, two things need to happen:

### 1. The `.gdextension` File

```ini
; my_physics.gdextension
[configuration]
entry_symbol = "my_physics_init"
compatibility_minimum = "4.4"

[libraries]
linux.x86_64 = "res://bin/libmy_physics.linux.x86_64.so"
windows.x86_64 = "res://bin/my_physics.windows.x86_64.dll"
macos.universal = "res://bin/libmy_physics.macos.universal.dylib"
```

### 2. The Project Setting

In `project.godot`, set the physics engine:

```ini
[physics]
2d/physics_engine="MyPhysics"
```

Or change it in the editor: **Project → Project Settings → Physics → 2D → Physics Engine** — your registered name appears in the dropdown alongside "GodotPhysics2D".

---

## 6. GDScript Interaction with Custom Servers

The beauty of the server architecture is that **game code doesn't change**. All node-based APIs (`RigidBody2D`, `Area2D`, `CharacterBody2D`) automatically delegate to your server.

You can also call the server directly for advanced use:

### GDScript

```gdscript
# Direct server calls work regardless of which backend is active.
func create_physics_body_manually() -> RID:
    var body := PhysicsServer2D.body_create()
    PhysicsServer2D.body_set_mode(body, PhysicsServer2D.BODY_MODE_DYNAMIC)

    var shape := PhysicsServer2D.rectangle_shape_create()
    PhysicsServer2D.shape_set_data(shape, Vector2(32, 32))
    PhysicsServer2D.body_add_shape(body, shape)

    # Attach to the default space
    var space := get_viewport().world_2d.space
    PhysicsServer2D.body_set_space(body, space)

    return body
```

### Detecting the Active Backend

```gdscript
func check_physics_engine() -> void:
    var engine_name := ProjectSettings.get_setting("physics/2d/physics_engine")
    print("Active 2D physics: %s" % engine_name)

    # Feature-specific branching (if your backend exposes extra methods)
    if engine_name == "MyPhysics":
        print("Using custom deterministic physics")
```

---

## 7. PhysicsServer3DExtension Overview

The 3D extension follows the same pattern but with a larger API surface (3D shapes, joints, soft bodies, etc.). This is how **Godot Jolt** (now the default in 4.6) is implemented.

### Key Differences from 2D

- More shape types: `ConvexPolygonShape3D`, `ConcavePolygonShape3D`, `HeightMapShape3D`
- Soft body support: `_soft_body_create()`, `_soft_body_set_mesh()`
- 6DOF joints: `_joint_make_generic_6dof()`
- Area detection includes `_area_set_monitorable()` for trigger zones

### Minimal 3D Registration

```cpp
void initialize_my_physics_3d(ModuleInitializationLevel p_level) {
    if (p_level == MODULE_INITIALIZATION_LEVEL_SERVERS) {
        ClassDB::register_class<MyPhysicsServer3D>();
        PhysicsServer3DManager::get_singleton()->register_server(
            "MyPhysics3D", callable_mp_static(_create_my_physics_3d_server)
        );
    }
}
```

---

## 8. C# Integration

C# game code interacts with custom servers transparently — you don't need to know which backend is active.

### Using PhysicsServer2D from C#

```csharp
using Godot;

public partial class DirectPhysicsExample : Node2D
{
    private Rid _body;
    private Rid _shape;

    public override void _Ready()
    {
        // These calls are dispatched to whatever backend is registered
        _body = PhysicsServer2D.BodyCreate();
        PhysicsServer2D.BodySetMode(_body, PhysicsServer2D.BodyMode.Dynamic);

        _shape = PhysicsServer2D.RectangleShapeCreate();
        PhysicsServer2D.ShapeSetData(_shape, new Vector2(32, 32));
        PhysicsServer2D.BodyAddShape(_body, _shape);

        Rid space = GetViewport().World2D.Space;
        PhysicsServer2D.BodySetSpace(_body, space);
    }

    public override void _ExitTree()
    {
        PhysicsServer2D.FreeRid(_body);
        PhysicsServer2D.FreeRid(_shape);
    }
}
```

### Detecting the Backend in C#

```csharp
public static string GetPhysicsEngineName()
{
    return ProjectSettings.GetSetting("physics/2d/physics_engine").AsString();
}
```

> **Note:** Writing the server extension itself must be done in C++ (via godot-cpp) or Rust (via gdext). C# cannot currently subclass `PhysicsServer2DExtension` because the extension API requires native bindings.

---

## 9. Testing Your Custom Server

### Strategy

1. **Unit test your physics engine in isolation** — don't involve Godot. Test your solver, broadphase, and shape intersection code with a standalone test harness.
2. **Integration test with Godot's test scenes** — Godot's source includes physics test projects. Run them with your backend to check compatibility.
3. **Use `PhysicsServer2D` API calls in a test script** — create bodies, apply forces, step, and assert positions.

### GDScript Integration Test

```gdscript
# test_custom_physics.gd — run as a tool script or from the editor
extends Node

func _ready() -> void:
    # Create a body and drop it
    var space := PhysicsServer2D.space_create()
    PhysicsServer2D.space_set_active(space, true)

    var body := PhysicsServer2D.body_create()
    PhysicsServer2D.body_set_space(body, space)
    PhysicsServer2D.body_set_mode(body, PhysicsServer2D.BODY_MODE_DYNAMIC)
    PhysicsServer2D.body_set_state(
        body, PhysicsServer2D.BODY_STATE_TRANSFORM, Transform2D.IDENTITY
    )

    var shape := PhysicsServer2D.rectangle_shape_create()
    PhysicsServer2D.shape_set_data(shape, Vector2(10, 10))
    PhysicsServer2D.body_add_shape(body, shape)

    # Step the simulation
    for i in 60:
        PhysicsServer2D.space_step(space, 1.0 / 60.0)

    # Check that gravity moved the body
    var transform: Transform2D = PhysicsServer2D.body_get_state(
        body, PhysicsServer2D.BODY_STATE_TRANSFORM
    )
    assert(transform.origin.y > 0.0, "Body should have fallen due to gravity")
    print("Test passed: body at %s" % transform.origin)

    # Cleanup
    PhysicsServer2D.free_rid(body)
    PhysicsServer2D.free_rid(shape)
    PhysicsServer2D.free_rid(space)
```

---

## 10. Real-World Examples

| Project | What It Does | Approach |
|---------|-------------|----------|
| **Godot Jolt** | Replaces GodotPhysics3D with Jolt Physics. Default engine in Godot 4.6. | `PhysicsServer3DExtension` via GDExtension (C++) |
| **physics_server_box2d** | Brings Box2D to Godot 4 as a 2D physics backend. | `PhysicsServer2DExtension` via GDExtension (C++) |
| **godot-rapier-2d** | Rust-based Rapier physics for Godot 4. | `PhysicsServer2DExtension` via gdext (Rust) |

These are excellent references for understanding the full API surface and implementation patterns.

---

## 11. Performance Considerations

1. **`_step()` is the hot path.** This runs every physics tick (default 60Hz). Optimize your solver, broadphase, and memory allocations here.
2. **Minimize RID lookups.** Use hash maps for RID → internal object mapping. The engine calls your methods frequently with RIDs.
3. **`_sync()` must be fast.** It runs between physics and rendering, on the main thread. Push heavy work into `_step()` on the physics thread.
4. **Avoid allocations in the step loop.** Pre-allocate contact buffers, broadphase pair arrays, and result lists.
5. **Profile with Godot's built-in profiler.** Physics server time shows up in the profiler under "Physics Process" regardless of which backend is active.

---

## 12. Common Mistakes

| Mistake | Fix |
|---------|-----|
| Missing virtual method implementations | `PhysicsServer2DExtension` has ~40 virtual methods. Unimplemented ones crash at runtime. Implement stubs that return safe defaults for any method you don't need. |
| Registering at the wrong initialization level | Server registration must happen at `MODULE_INITIALIZATION_LEVEL_SERVERS`, not `SCENE` or `EDITOR`. |
| Forgetting `_flush_queries()` | If you don't process callbacks here, collision signals (`body_entered`, `area_entered`) never fire on nodes. |
| RID leaks | Track all allocated RIDs. Implement `_free_rid()` to clean up when the engine requests it. |
| Not handling `body_set_state` for TRANSFORM | Nodes call this to teleport bodies (e.g., setting `global_position`). If you don't handle it, node positions and physics positions diverge. |
| Breaking node compatibility | Nodes like `CharacterBody2D` depend on specific `move_and_collide` behavior. Test with Godot's built-in demo projects to ensure compatibility. |
