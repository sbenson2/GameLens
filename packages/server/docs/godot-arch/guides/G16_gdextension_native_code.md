# G16 — GDExtension & Native C++ Integration

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** C++ / GDScript  
> **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [E2 GDScript vs C#](../architecture/E2_gdscript_vs_csharp.md) · [G2 State Machine](./G2_state_machine.md)

---

## What This Guide Covers

GDExtension is Godot 4's system for writing engine-level code in C, C++, Rust, or other native languages — without recompiling the engine. It replaces the old GDNative system from Godot 3.x with a cleaner ABI, better compatibility guarantees, and tighter editor integration.

This guide covers when and why to use GDExtension, project setup with godot-cpp, writing custom nodes in C++, exposing properties and methods to the editor, building for multiple platforms, debugging, and how GDExtension fits alongside GDScript and C# in a real project.

**Use GDExtension when:** you need performance-critical inner loops (pathfinding, physics, procedural generation), want to wrap an existing C/C++ library (physics engines, audio DSP, networking), or need functionality Godot doesn't expose to scripting.

**Don't use GDExtension when:** GDScript or C# performance is adequate. The development overhead of C++ is significant — profile first, optimize second.

---

## Table of Contents

1. [How GDExtension Works](#1-how-gdextension-works)
2. [Project Setup with godot-cpp](#2-project-setup-with-godot-cpp)
3. [Your First Extension — A Custom Node](#3-your-first-extension--a-custom-node)
4. [Exposing Properties to the Editor](#4-exposing-properties-to-the-editor)
5. [Methods, Signals, and Constants](#5-methods-signals-and-constants)
6. [The .gdextension File](#6-the-gdextension-file)
7. [Building for Multiple Platforms](#7-building-for-multiple-platforms)
8. [Calling GDExtension from GDScript](#8-calling-gdextension-from-gdscript)
9. [Calling GDScript from GDExtension](#9-calling-gdscript-from-gdextension)
10. [Debugging GDExtension Code](#10-debugging-gdextension-code)
11. [Performance Patterns](#11-performance-patterns)
12. [API Compatibility and Versioning](#12-api-compatibility-and-versioning)
13. [Common Mistakes](#13-common-mistakes)
14. [When to Use What — Decision Matrix](#14-when-to-use-what--decision-matrix)

---

## 1. How GDExtension Works

GDExtension is a C-level ABI that lets shared libraries (`.dll`, `.so`, `.dylib`) register new classes, methods, properties, and signals with the Godot engine at runtime. The engine loads your library, calls your initialization function, and from that point your C++ classes behave identically to built-in engine classes.

```
┌─────────────────────────────────┐
│         Godot Engine            │
│  ┌───────────┐  ┌────────────┐ │
│  │ GDScript   │  │ C# (Mono)  │ │
│  └─────┬─────┘  └─────┬──────┘ │
│        │               │        │
│  ┌─────┴───────────────┴──────┐ │
│  │   ClassDB / ObjectDB       │ │
│  └─────────────┬──────────────┘ │
│                │                │
│  ┌─────────────┴──────────────┐ │
│  │   GDExtension Interface    │ │
│  └─────────────┬──────────────┘ │
└────────────────┼────────────────┘
                 │  (C ABI)
     ┌───────────┴───────────┐
     │  Your .dll / .so      │
     │  (godot-cpp bindings) │
     └───────────────────────┘
```

### Key Concepts

- **godot-cpp**: The official C++ binding library. Wraps the raw C interface with ergonomic C++ classes mirroring Godot's class hierarchy (`Node`, `Sprite2D`, `Resource`, etc.).
- **Extension classes**: Your C++ classes inherit from godot-cpp wrapper classes and register themselves with Godot's ClassDB — just like built-in types.
- **Compatibility**: A GDExtension built targeting Godot 4.3 works in 4.4+. A GDExtension targeting 4.4 will NOT work in 4.3. Always target the oldest version you need to support.

---

## 2. Project Setup with godot-cpp

### Prerequisites

- Godot 4.4+ editor
- C++17 compiler (GCC 9+, Clang 10+, MSVC 2019+)
- SCons build system (`pip install scons`)
- Python 3.8+

### Directory Structure

```
my_game/
├── project.godot               # Godot project
├── bin/                         # Compiled .dll/.so output
│   └── my_extension.gdextension
├── src/                         # Your C++ source files
│   ├── register_types.h
│   ├── register_types.cpp
│   └── my_custom_node.h
│   └── my_custom_node.cpp
├── godot-cpp/                   # Git submodule
└── SConstruct                   # Build configuration
```

### Step-by-Step Setup

```bash
# 1. Create project directory
mkdir -p my_extension/src my_extension/bin

# 2. Initialize git and add godot-cpp as submodule
cd my_extension
git init
git submodule add -b 4.4 https://github.com/godotengine/godot-cpp.git
cd godot-cpp
git submodule update --init  # Pulls godot-headers
cd ..

# 3. Build godot-cpp bindings (do this once)
cd godot-cpp
scons platform=<your_platform> target=template_debug
cd ..
```

### SConstruct File

```python
#!/usr/bin/env python
import os

env = SConscript("godot-cpp/SConstruct")

# Add your source files
env.Append(CPPPATH=["src/"])
sources = Glob("src/*.cpp")

# Build the shared library
library = env.SharedLibrary(
    "bin/libmy_extension{}{}".format(env["suffix"], env["SHLIBSUFFIX"]),
    source=sources,
)

Default(library)
```

Build with:

```bash
# Debug build (includes symbols, editor support)
scons platform=<platform> target=template_debug

# Release build (optimized, for export)
scons platform=<platform> target=template_release
```

Valid platforms: `linux`, `windows`, `macos`, `android`, `ios`, `web`.

---

## 3. Your First Extension — A Custom Node

### Header — `src/my_custom_node.h`

```cpp
#ifndef MY_CUSTOM_NODE_H
#define MY_CUSTOM_NODE_H

#include <godot_cpp/classes/node2d.hpp>
#include <godot_cpp/core/class_db.hpp>

namespace godot {

class MyCustomNode : public Node2D {
    GDCLASS(MyCustomNode, Node2D)  // Required macro — registers class

private:
    double speed = 100.0;
    double amplitude = 50.0;
    double time_elapsed = 0.0;

protected:
    // Bind methods/properties to Godot's reflection system
    static void _bind_methods();

public:
    MyCustomNode();
    ~MyCustomNode();

    // Override engine virtual methods
    void _process(double delta) override;

    // Custom getters/setters for editor properties
    void set_speed(double p_speed);
    double get_speed() const;

    void set_amplitude(double p_amplitude);
    double get_amplitude() const;
};

}  // namespace godot

#endif  // MY_CUSTOM_NODE_H
```

### Implementation — `src/my_custom_node.cpp`

```cpp
#include "my_custom_node.h"
#include <godot_cpp/variant/utility_functions.hpp>

using namespace godot;

MyCustomNode::MyCustomNode() {}
MyCustomNode::~MyCustomNode() {}

void MyCustomNode::_bind_methods() {
    // Bind methods so GDScript can call them
    ClassDB::bind_method(D_METHOD("get_speed"), &MyCustomNode::get_speed);
    ClassDB::bind_method(D_METHOD("set_speed", "speed"), &MyCustomNode::set_speed);

    ClassDB::bind_method(D_METHOD("get_amplitude"), &MyCustomNode::get_amplitude);
    ClassDB::bind_method(D_METHOD("set_amplitude", "amplitude"), &MyCustomNode::set_amplitude);

    // Expose as editor properties (Inspector panel)
    ADD_PROPERTY(
        PropertyInfo(Variant::FLOAT, "speed", PROPERTY_HINT_RANGE, "0,500,1"),
        "set_speed", "get_speed"
    );
    ADD_PROPERTY(
        PropertyInfo(Variant::FLOAT, "amplitude", PROPERTY_HINT_RANGE, "0,200,1"),
        "set_amplitude", "get_amplitude"
    );
}

void MyCustomNode::_process(double delta) {
    time_elapsed += delta;
    // Sine-wave bobbing effect
    Vector2 pos = get_position();
    pos.y = sin(time_elapsed * speed * 0.01) * amplitude;
    set_position(pos);
}

void MyCustomNode::set_speed(double p_speed) {
    speed = p_speed;
}

double MyCustomNode::get_speed() const {
    return speed;
}

void MyCustomNode::set_amplitude(double p_amplitude) {
    amplitude = p_amplitude;
}

double MyCustomNode::get_amplitude() const {
    return amplitude;
}
```

### Registration — `src/register_types.cpp`

```cpp
#include "register_types.h"
#include "my_custom_node.h"

#include <gdextension_interface.h>
#include <godot_cpp/core/class_db.hpp>
#include <godot_cpp/core/defs.hpp>
#include <godot_cpp/godot.hpp>

using namespace godot;

void initialize_my_extension(ModuleInitializationLevel p_level) {
    if (p_level != MODULE_INITIALIZATION_LEVEL_SCENE) {
        return;
    }
    // Register your classes here
    ClassDB::register_class<MyCustomNode>();
}

void uninitialize_my_extension(ModuleInitializationLevel p_level) {
    if (p_level != MODULE_INITIALIZATION_LEVEL_SCENE) {
        return;
    }
    // Cleanup if needed
}

extern "C" {
    // Entry point — called by Godot when loading the extension
    GDExtensionBool GDE_EXPORT my_extension_init(
        GDExtensionInterfaceGetProcAddress p_get_proc_address,
        const GDExtensionClassLibraryPtr p_library,
        GDExtensionInitialization *r_initialization
    ) {
        godot::GDExtensionBinding::InitObject init_obj(
            p_get_proc_address, p_library, r_initialization
        );

        init_obj.register_initializer(initialize_my_extension);
        init_obj.register_terminator(uninitialize_my_extension);
        init_obj.set_minimum_library_initialization_level(
            MODULE_INITIALIZATION_LEVEL_SCENE
        );

        return init_obj.init();
    }
}
```

### Registration Header — `src/register_types.h`

```cpp
#ifndef REGISTER_TYPES_H
#define REGISTER_TYPES_H

void initialize_my_extension();
void uninitialize_my_extension();

#endif  // REGISTER_TYPES_H
```

---

## 4. Exposing Properties to the Editor

Properties appear in the Inspector panel. Use `ADD_PROPERTY` with `PropertyInfo` for type-safe editor integration:

```cpp
void MyCustomNode::_bind_methods() {
    // --- Basic types ---
    ADD_PROPERTY(
        PropertyInfo(Variant::STRING, "display_name"),
        "set_display_name", "get_display_name"
    );

    // --- Numeric with range slider ---
    ADD_PROPERTY(
        PropertyInfo(Variant::FLOAT, "health", PROPERTY_HINT_RANGE, "0,100,0.5"),
        "set_health", "get_health"
    );

    // --- Enum dropdown ---
    ADD_PROPERTY(
        PropertyInfo(Variant::INT, "element_type", PROPERTY_HINT_ENUM, "Fire,Water,Earth,Air"),
        "set_element_type", "get_element_type"
    );

    // --- File path picker ---
    ADD_PROPERTY(
        PropertyInfo(Variant::STRING, "sprite_path", PROPERTY_HINT_FILE, "*.png,*.svg"),
        "set_sprite_path", "get_sprite_path"
    );

    // --- Resource reference (e.g., drag-drop a Texture2D) ---
    ADD_PROPERTY(
        PropertyInfo(Variant::OBJECT, "custom_texture",
                     PROPERTY_HINT_RESOURCE_TYPE, "Texture2D"),
        "set_custom_texture", "get_custom_texture"
    );

    // --- Grouped properties (collapsible in Inspector) ---
    ADD_GROUP("Movement", "movement_");
    ADD_PROPERTY(
        PropertyInfo(Variant::FLOAT, "movement_speed"),
        "set_movement_speed", "get_movement_speed"
    );
    ADD_PROPERTY(
        PropertyInfo(Variant::FLOAT, "movement_friction"),
        "set_movement_friction", "get_movement_friction"
    );
}
```

---

## 5. Methods, Signals, and Constants

### Exposing Methods

```cpp
void MyCustomNode::_bind_methods() {
    // Method with arguments
    ClassDB::bind_method(
        D_METHOD("take_damage", "amount", "source"),
        &MyCustomNode::take_damage
    );

    // Method with default argument
    ClassDB::bind_method(
        D_METHOD("heal", "amount"),
        &MyCustomNode::heal,
        DEFVAL(10.0)  // Default value for "amount"
    );

    // Static method
    ClassDB::bind_static_method(
        "MyCustomNode",
        D_METHOD("calculate_dps", "damage", "attack_speed"),
        &MyCustomNode::calculate_dps
    );
}
```

### Defining Signals

```cpp
void MyCustomNode::_bind_methods() {
    // Signal with no arguments
    ADD_SIGNAL(MethodInfo("died"));

    // Signal with arguments
    ADD_SIGNAL(MethodInfo(
        "health_changed",
        PropertyInfo(Variant::FLOAT, "old_value"),
        PropertyInfo(Variant::FLOAT, "new_value")
    ));
}

// Emitting from C++:
void MyCustomNode::take_damage(double amount, Node *source) {
    double old_health = health;
    health -= amount;
    emit_signal("health_changed", old_health, health);

    if (health <= 0.0) {
        emit_signal("died");
    }
}
```

### Enums and Constants

```cpp
void MyCustomNode::_bind_methods() {
    // Integer constants
    BIND_CONSTANT(MAX_LEVEL);

    // Enum values (accessible as MyCustomNode.ELEMENT_FIRE in GDScript)
    BIND_ENUM_CONSTANT(ELEMENT_FIRE);
    BIND_ENUM_CONSTANT(ELEMENT_WATER);
    BIND_ENUM_CONSTANT(ELEMENT_EARTH);
    BIND_ENUM_CONSTANT(ELEMENT_AIR);
}
```

---

## 6. The .gdextension File

This manifest tells Godot where to find your compiled libraries. Place it in your project's `bin/` directory (or wherever you want — the path is relative to `project.godot`).

```ini
[configuration]

entry_symbol = "my_extension_init"
compatibility_minimum = 4.3     ; Oldest Godot version supported
reloadable = true               ; Hot-reload in editor (debug builds)

[libraries]

; Format: platform.target = "path/to/library"
macos.debug = "res://bin/libmy_extension.macos.template_debug.framework"
macos.release = "res://bin/libmy_extension.macos.template_release.framework"
windows.debug.x86_64 = "res://bin/libmy_extension.windows.template_debug.x86_64.dll"
windows.release.x86_64 = "res://bin/libmy_extension.windows.template_release.x86_64.dll"
linux.debug.x86_64 = "res://bin/libmy_extension.linux.template_debug.x86_64.so"
linux.release.x86_64 = "res://bin/libmy_extension.linux.template_release.x86_64.so"

[icons]

MyCustomNode = "res://addons/my_extension/icons/my_custom_node.svg"
```

### Key Fields

| Field | Purpose |
|-------|---------|
| `entry_symbol` | Name of the C entry-point function in your library |
| `compatibility_minimum` | Lowest Godot version. Set to `4.3` to support 4.3, 4.4, 4.5, etc. |
| `reloadable` | If `true`, the editor can unload/reload the library when you rebuild (debug only) |
| `[icons]` | Map class names to SVG icons for the scene tree |

---

## 7. Building for Multiple Platforms

```bash
# Linux (x86_64)
scons platform=linux target=template_debug arch=x86_64
scons platform=linux target=template_release arch=x86_64

# Windows (x86_64) — cross-compile or native
scons platform=windows target=template_debug arch=x86_64
scons platform=windows target=template_release arch=x86_64

# macOS (universal — arm64 + x86_64)
scons platform=macos target=template_debug arch=universal
scons platform=macos target=template_release arch=universal

# Android (arm64)
scons platform=android target=template_release arch=arm64

# Web (Emscripten)
scons platform=web target=template_release
```

**CI/CD tip**: Use GitHub Actions or GitLab CI to build all platforms in parallel. The godot-cpp repository includes example CI configurations. Store artifacts per platform and assemble the `.gdextension` file pointing to all of them.

---

## 8. Calling GDExtension from GDScript

Once your extension is compiled and the `.gdextension` file is in place, your C++ classes appear in GDScript exactly like built-in types:

```gdscript
# GDScript — your extension node works identically to built-in nodes
extends Node2D

@onready var custom: MyCustomNode = $MyCustomNode

func _ready() -> void:
    # Set properties (calls your C++ setter)
    custom.speed = 200.0
    custom.amplitude = 75.0

    # Connect signals (emitted from C++)
    custom.health_changed.connect(_on_health_changed)
    custom.died.connect(_on_died)

    # Call methods
    custom.take_damage(25.0, self)

func _on_health_changed(old_val: float, new_val: float) -> void:
    print("Health: %s → %s" % [old_val, new_val])

func _on_died() -> void:
    print("Entity died!")
```

---

## 9. Calling GDScript from GDExtension

Your C++ code can call methods on any Godot object, including GDScript nodes:

```cpp
void MyCustomNode::interact_with_gdscript_node() {
    // Get a sibling node that has a GDScript attached
    Node *ui_node = get_node<Node>(NodePath("../UIManager"));

    if (ui_node != nullptr) {
        // Call a GDScript method
        Variant result = ui_node->call("show_damage_number", 42.0, get_position());

        // Check signals
        if (ui_node->has_signal("ui_closed")) {
            ui_node->connect("ui_closed", Callable(this, "on_ui_closed"));
        }
    }
}
```

---

## 10. Debugging GDExtension Code

### IDE Debugger Attach

1. Build with `target=template_debug` (includes debug symbols)
2. Launch Godot editor (or your exported debug build)
3. In your IDE (VS Code, CLion, Visual Studio), attach the debugger to the Godot process
4. Set breakpoints in your C++ source — they will hit when Godot calls your code

### Print Debugging

```cpp
#include <godot_cpp/variant/utility_functions.hpp>

// These appear in Godot's Output panel
UtilityFunctions::print("Position: ", get_position());
UtilityFunctions::printerr("Error: health below zero!");
UtilityFunctions::push_warning("Performance: frame took ", delta, "s");
```

### Hot Reload

With `reloadable = true` in your `.gdextension` file and a debug build, the Godot editor will attempt to reload your library when the `.dll`/`.so` changes. This works for many changes but may crash on:
- Changing class inheritance hierarchies
- Removing properties that are referenced in saved scenes
- Changing signal signatures that are already connected in the editor

**Safe workflow**: Rebuild → Godot auto-reloads → Test. If the editor crashes, restart it — your project files are fine.

---

## 11. Performance Patterns

### When GDExtension Wins Big

| Pattern | GDScript | GDExtension | Speedup |
|---------|----------|-------------|---------|
| Tight numeric loops (10M iterations) | ~2.5s | ~0.03s | ~80x |
| Array sorting (1M elements) | ~1.8s | ~0.05s | ~35x |
| Pathfinding (A* on large grid) | ~150ms | ~5ms | ~30x |
| String parsing (large files) | ~500ms | ~15ms | ~33x |

### Object Pooling in C++

```cpp
// Pre-allocate objects to avoid runtime allocation
class BulletPool : public Node {
    GDCLASS(BulletPool, Node)

    static constexpr int POOL_SIZE = 500;
    std::vector<Bullet*> available;
    std::vector<Bullet*> active;

public:
    Bullet* acquire() {
        if (available.empty()) return nullptr;
        Bullet* b = available.back();
        available.pop_back();
        active.push_back(b);
        b->set_visible(true);
        b->set_process(true);
        return b;
    }

    void release(Bullet* b) {
        b->set_visible(false);
        b->set_process(false);
        auto it = std::find(active.begin(), active.end(), b);
        if (it != active.end()) {
            active.erase(it);
            available.push_back(b);
        }
    }
};
```

### Batch Processing

```cpp
// Process many entities in a single C++ call instead of per-frame GDScript
void EnemyManager::_physics_process(double delta) {
    // One C++ loop replaces hundreds of individual GDScript _physics_process calls
    for (auto& enemy : enemies) {
        enemy.velocity += enemy.acceleration * delta;
        enemy.position += enemy.velocity * delta;

        // Simple AABB collision check — pure math, no Godot overhead
        if (check_bounds(enemy.position)) {
            enemy.velocity *= -0.8;
        }
    }

    // Only update Godot nodes once per frame with final positions
    for (size_t i = 0; i < enemy_nodes.size(); ++i) {
        enemy_nodes[i]->set_position(
            Vector2(enemies[i].position.x, enemies[i].position.y)
        );
    }
}
```

---

## 12. API Compatibility and Versioning

GDExtension has a forward-compatible ABI: extensions built for an older version work in newer Godot versions, but not the reverse.

| Your `.gdextension` `compatibility_minimum` | Works in Godot 4.3 | Works in Godot 4.4 | Works in Godot 4.5+ |
|----------------------------------------------|--------------------|--------------------|---------------------|
| `4.3` | Yes | Yes | Yes |
| `4.4` | No | Yes | Yes |
| `4.5` | No | No | Yes |

**Best practice**: Set `compatibility_minimum` to the oldest version you need. Only bump it when you use APIs that were added in a newer version.

### godot-cpp Versioning

- The `4.4` branch of godot-cpp targets Godot 4.4 APIs
- godot-cpp v10.x (master) targets Godot 4.3+ with the latest API surface
- Always match your godot-cpp branch to your target Godot version

---

## 13. Common Mistakes

### Forgetting `GDCLASS` Macro
Every extension class MUST include `GDCLASS(ClassName, ParentClass)` as the first line inside the class body. Without it, nothing registers and you get cryptic linker errors.

### Mismatched `_bind_methods`
If you declare a property getter/setter in `_bind_methods` but the C++ function signature doesn't match, the build will succeed but the property will silently fail in the editor.

### Not Handling `nullptr` from `get_node`
`get_node<T>(path)` returns `nullptr` if the node doesn't exist or isn't the expected type. Always null-check.

### Building Release for Editor Testing
The editor needs `template_debug` builds. `template_release` builds only work in exported games.

### Changing Class Names After Scenes Reference Them
If you rename a C++ class, existing `.tscn` files that reference the old name will break. Update scenes manually or use find-and-replace in the `.tscn` text files.

### Ignoring Thread Safety
If your GDExtension runs background threads, never call Godot scene tree APIs from those threads. Use `call_deferred()` or Godot's `WorkerThreadPool` to safely communicate results back to the main thread.

---

## 14. When to Use What — Decision Matrix

| Criteria | GDScript | C# | GDExtension (C++) |
|----------|----------|----|-------------------|
| **Prototyping speed** | Fastest | Fast | Slow |
| **Runtime performance** | Adequate for most games | ~2-5x GDScript | ~30-80x GDScript |
| **Editor integration** | Native | Good | Full (with binding work) |
| **Third-party library access** | Limited | NuGet packages | Any C/C++ library |
| **Platform coverage** | All | No iOS/Web | All |
| **Team familiarity** | Godot-specific | Broad | Niche |
| **Build complexity** | None | .NET SDK | SCons + C++ toolchain |
| **Hot reload** | Instant | Fast | Partial (debug only) |
| **Best for** | Gameplay, UI, glue | Large codebases, enterprise | Performance hotspots, native libraries |

**The hybrid approach**: Write your game in GDScript. Profile. Move only the bottlenecks to GDExtension. A 2D platformer might have 100% GDScript. A city-builder with 10,000 simulated entities might move its simulation loop to C++ while keeping UI and game flow in GDScript.

---

## Tuning Reference

| Setting | Recommended | Notes |
|---------|-------------|-------|
| `compatibility_minimum` | `4.3` | Unless using 4.4+-only APIs |
| `reloadable` | `true` for debug | Disable for release builds |
| SCons `target` | `template_debug` for dev | `template_release` for exports |
| godot-cpp branch | Match your target Godot | e.g., `4.4` branch for Godot 4.4 |
| C++ standard | C++17 | Required by godot-cpp |
