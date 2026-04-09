# G111 — GDExtension Advanced Patterns: Lifecycle, Hot Reload & Editor Integration

> **Category:** guide · **Engine:** Godot 4.x · **Related:** [G16 GDExtension & Native C++](./G16_gdextension_native_code.md) · [G76 GDExtension with Rust](./G76_gdextension_with_rust.md) · [G35 Editor Tool Scripts](./G35_editor_tool_scripts.md) · [G100 Advanced Editor Plugin Development](./G100_advanced_editor_plugin_development.md) · [G41 Godot 4.4–4.6 Features](./G41_godot_44_to_46_features.md)

Advanced GDExtension patterns for Godot 4.4+: initialization lifecycle stages, main loop callbacks (4.5+), hot reload workflows, virtual method binding, editor tool integration, and production-ready project architecture. Builds on the fundamentals covered in [G16](./G16_gdextension_native_code.md).

---

## What This Guide Covers

[G16](./G16_gdextension_native_code.md) covers the basics of GDExtension — setting up godot-cpp, writing a custom node, exposing properties, and building for multiple platforms. This guide goes deeper into the patterns you need for production GDExtension development:

- The full initialization lifecycle and how to hook into engine startup/shutdown (4.5+ MainLoop stage)
- Hot reload during development and its current limitations
- Virtual method overrides — making your C++ methods overridable in GDScript
- Editor integration — tool mode, Inspector plugins, custom gizmos
- Multi-extension architecture — splitting a large project into multiple .gdextension libraries
- Debugging and profiling native code alongside Godot

**Use this guide when:** you've built your first GDExtension and need to handle real-world complexity — editor tools, lifecycle management, or a multi-library architecture.

**Prerequisites:** Familiarity with [G16](./G16_gdextension_native_code.md) (project setup, godot-cpp basics, building).

---

## Table of Contents

1. [Initialization Lifecycle](#1-initialization-lifecycle)
2. [Main Loop Callbacks (4.5+)](#2-main-loop-callbacks-45)
3. [Hot Reload Workflow](#3-hot-reload-workflow)
4. [Virtual Method Binding](#4-virtual-method-binding)
5. [Editor Tool Integration](#5-editor-tool-integration)
6. [Custom Inspector Plugins via GDExtension](#6-custom-inspector-plugins-via-gdextension)
7. [Multi-Extension Architecture](#7-multi-extension-architecture)
8. [Memory Management Patterns](#8-memory-management-patterns)
9. [Debugging Native Code](#9-debugging-native-code)
10. [Cross-Language Patterns — C++ ↔ GDScript ↔ C#](#10-cross-language-patterns--c--gdscript--c)
11. [Production Build Configuration](#11-production-build-configuration)
12. [Common Mistakes](#12-common-mistakes)

---

## 1. Initialization Lifecycle

### The Four (+1) Initialization Stages

GDExtension libraries are loaded in stages. Each stage corresponds to a `MODULE_INITIALIZATION_LEVEL_*` constant:

| Stage | Enum | What's Available | Use Case |
|-------|------|------------------|----------|
| **Core** | `MODULE_INITIALIZATION_LEVEL_CORE` | Basic types, memory allocators | Low-level types, math extensions |
| **Servers** | `MODULE_INITIALIZATION_LEVEL_SERVERS` | RenderingServer, PhysicsServer, etc. | Custom server implementations |
| **Scene** | `MODULE_INITIALIZATION_LEVEL_SCENE` | Node, Resource, all scene types | Custom nodes, resources (most extensions) |
| **Editor** | `MODULE_INITIALIZATION_LEVEL_EDITOR` | EditorPlugin, Inspector, etc. | Editor tools (only runs in editor) |
| **MainLoop** | (4.5+) | Everything, including singletons | Post-init setup, singleton access |

Stages are unloaded in **reverse order**: MainLoop → Editor → Scene → Servers → Core.

### Registering Multiple Stages

```cpp
// register_types.h
#ifndef MY_EXTENSION_REGISTER_TYPES_H
#define MY_EXTENSION_REGISTER_TYPES_H

#include <godot_cpp/core/class_db.hpp>

using namespace godot;

void initialize_my_extension(ModuleInitializationLevel p_level);
void uninitialize_my_extension(ModuleInitializationLevel p_level);

#endif
```

```cpp
// register_types.cpp
#include "register_types.h"

#include <gdextension_interface.h>
#include <godot_cpp/godot.hpp>
#include <godot_cpp/core/defs.hpp>
#include <godot_cpp/classes/engine.hpp>

// Your classes
#include "my_custom_node.h"
#include "my_editor_plugin.h"
#include "my_singleton.h"

using namespace godot;

void initialize_my_extension(ModuleInitializationLevel p_level) {
    if (p_level == MODULE_INITIALIZATION_LEVEL_SCENE) {
        // Register gameplay nodes and resources
        ClassDB::register_class<MyCustomNode>();
        ClassDB::register_class<MyCustomResource>();
    }

    if (p_level == MODULE_INITIALIZATION_LEVEL_EDITOR) {
        // Register editor-only classes
        ClassDB::register_class<MyEditorPlugin>();
        ClassDB::register_class<MyInspectorPlugin>();
    }
}

void uninitialize_my_extension(ModuleInitializationLevel p_level) {
    if (p_level == MODULE_INITIALIZATION_LEVEL_SCENE) {
        // Cleanup scene-level resources
        // Classes are unregistered automatically
    }

    if (p_level == MODULE_INITIALIZATION_LEVEL_EDITOR) {
        // Cleanup editor resources
    }
}

extern "C" {
GDExtensionBool GDE_EXPORT my_extension_init(
    GDExtensionInterfaceGetProcAddress p_get_proc_address,
    const GDExtensionClassLibraryPtr p_library,
    GDExtensionInitialization *r_initialization
) {
    GDExtensionBinding::InitObject init_obj(
        p_get_proc_address, p_library, r_initialization
    );

    // Register which levels we need
    init_obj.register_initializer(initialize_my_extension);
    init_obj.register_terminator(uninitialize_my_extension);

    // Minimum level required — Godot won't load this extension
    // unless it reaches at least this stage
    init_obj.set_minimum_library_initialization_level(
        MODULE_INITIALIZATION_LEVEL_SCENE
    );

    return init_obj.init();
}
}
```

### GDScript Equivalent — Why This Matters

In GDScript, you never think about initialization stages — your `_ready()` function runs after the scene tree is set up. In GDExtension, you register classes before any scene exists. Understanding the lifecycle prevents crashes from accessing singletons or scene tree nodes too early.

---

## 2. Main Loop Callbacks (4.5+)

### The Problem Before 4.5

Before Godot 4.5, GDExtension had no reliable way to know when the engine was fully initialized. Accessing engine singletons (like `Engine`, `OS`, or custom autoloads) during `MODULE_INITIALIZATION_LEVEL_SCENE` could crash or return null because those singletons weren't ready yet.

### The Solution — MainLoop Stage

Godot 4.5 added a new initialization stage that fires **after** the main loop has started. At this point, all singletons, autoloads, and the scene tree are fully available.

### Hooking into Startup and Shutdown

```cpp
// register_types.cpp (Godot 4.5+)
#include <godot_cpp/classes/engine.hpp>
#include <godot_cpp/classes/os.hpp>

void initialize_my_extension(ModuleInitializationLevel p_level) {
    if (p_level == MODULE_INITIALIZATION_LEVEL_SCENE) {
        ClassDB::register_class<MyCustomNode>();
    }

    // NEW in 4.5 — MainLoop stage
    // At this point, Engine singletons are fully available
    if (p_level == MODULE_INITIALIZATION_LEVEL_MAIN_LOOP) {
        // Safe to access Engine singleton
        Engine *engine = Engine::get_singleton();
        if (engine) {
            // Register a singleton that depends on engine state
            // or perform late initialization
        }

        // Safe to access OS
        OS *os = OS::get_singleton();
        if (os) {
            String data_dir = os->get_user_data_dir();
            // Initialize persistent storage, config files, etc.
        }
    }
}

void uninitialize_my_extension(ModuleInitializationLevel p_level) {
    // MainLoop deinit fires FIRST (before scene, servers, core)
    // All classes are still available at this point
    if (p_level == MODULE_INITIALIZATION_LEVEL_MAIN_LOOP) {
        // Flush caches, save state, close network connections
        // while engine singletons are still alive
    }

    if (p_level == MODULE_INITIALIZATION_LEVEL_SCENE) {
        // Classes are about to be unregistered
    }
}
```

### Per-Frame Callbacks (4.5+)

GDExtension can register callbacks that run every process frame, similar to `_process()` but at the native level:

```cpp
// This runs after all Node::_process() methods, before ScriptServer::frame()
// Useful for extension-wide per-frame logic without requiring a node in the tree
```

**When to use per-frame callbacks vs. Node `_process`:**

| Approach | Use When |
|----------|----------|
| Per-frame callback | Extension-wide logic (telemetry, pooling, global state) that shouldn't depend on a node being in the tree |
| `_process()` override | Node-specific per-frame behavior that participates in the scene tree lifecycle |

### C# Equivalent

C# scripts don't need the MainLoop stage — they run as scripts attached to nodes, so `_Ready()` already guarantees full initialization. However, if you're building a C# library that wraps GDExtension functionality, the lifecycle awareness helps you understand when your native code is safe to call.

---

## 3. Hot Reload Workflow

### Current State (Godot 4.4+)

GDExtension hot reload allows you to recompile your C++ library and see changes in the editor **without restarting Godot**. This is a significant productivity improvement over the Godot 3.x GDNative workflow.

### Enabling Hot Reload

In your `.gdextension` file, set `reloadable = true`:

```ini
[configuration]
entry_symbol = "my_extension_init"
compatibility_minimum = "4.4"
reloadable = true

[libraries]
linux.debug.x86_64 = "res://bin/libmyextension.linux.template_debug.x86_64.so"
linux.release.x86_64 = "res://bin/libmyextension.linux.template_release.x86_64.so"
windows.debug.x86_64 = "res://bin/libmyextension.windows.template_debug.x86_64.dll"
windows.release.x86_64 = "res://bin/libmyextension.windows.template_release.x86_64.dll"
macos.debug = "res://bin/libmyextension.macos.template_debug.framework"
macos.release = "res://bin/libmyextension.macos.template_release.framework"
```

### The Reload Cycle

1. Modify your C++ source
2. Rebuild the library (SCons, CMake, etc.)
3. Godot detects the file change and calls `uninitialize` on the old library
4. Godot loads the new library and calls `initialize`
5. Existing nodes in the scene tree are reconnected to the new class definitions

### Important Limitations

**What works:**

- Changing method implementations
- Adding new methods
- Modifying property defaults
- Updating signal definitions

**What doesn't work reliably:**

- Changing the class hierarchy (reparenting)
- Removing properties that existing nodes reference
- Changing the memory layout of objects (adding/removing member variables requires extra care)
- Callable pointers from the old library become invalid — a known source of crashes

**Best practices for hot reload:**

```cpp
// GOOD — Use Godot's property system for state
// Properties survive reload because Godot manages them
void MyNode::_bind_methods() {
    ClassDB::bind_method(D_METHOD("get_health"), &MyNode::get_health);
    ClassDB::bind_method(D_METHOD("set_health", "value"), &MyNode::set_health);
    ADD_PROPERTY(PropertyInfo(Variant::INT, "health"), "set_health", "get_health");
}

// CAUTION — Raw C++ state is lost on reload
// If you store state in member variables not exposed as properties,
// it will reset to defaults after reload
```

### GDScript Comparison

GDScript hot reload is seamless — you save a `.gd` file and changes are reflected immediately. GDExtension hot reload is closer to a "warm restart" of the native library. For rapid iteration, consider prototyping in GDScript and porting performance-critical code to GDExtension later.

---

## 4. Virtual Method Binding

### Making C++ Methods Overridable in GDScript

You can define virtual methods in your GDExtension class that GDScript (or C#) users can override. This is the same pattern Godot uses internally — `_process`, `_ready`, `_physics_process` are all virtual methods.

```cpp
// my_custom_node.h
#ifndef MY_CUSTOM_NODE_H
#define MY_CUSTOM_NODE_H

#include <godot_cpp/classes/node3d.hpp>

namespace godot {

class MyCustomNode : public Node3D {
    GDCLASS(MyCustomNode, Node3D)

protected:
    static void _bind_methods();

public:
    // Virtual method — overridable in GDScript
    // Prefix with _ by convention (like _process, _ready)
    virtual int _calculate_damage(int base_damage);

    // Non-virtual method — always runs C++ implementation
    void apply_damage(int amount);
};

}

#endif
```

```cpp
// my_custom_node.cpp
#include "my_custom_node.h"
#include <godot_cpp/core/class_db.hpp>
#include <godot_cpp/variant/utility_functions.hpp>

using namespace godot;

void MyCustomNode::_bind_methods() {
    // Bind the virtual method — GDVIRTUAL makes it overridable
    ClassDB::bind_method(
        D_METHOD("_calculate_damage", "base_damage"),
        &MyCustomNode::_calculate_damage
    );

    // Bind the regular method
    ClassDB::bind_method(
        D_METHOD("apply_damage", "amount"),
        &MyCustomNode::apply_damage
    );
}

int MyCustomNode::_calculate_damage(int base_damage) {
    // Default implementation — returned if GDScript doesn't override
    return base_damage;
}

void MyCustomNode::apply_damage(int amount) {
    // Call the virtual method — if GDScript overrides it, that version runs
    int final_damage = call("_calculate_damage", amount);
    UtilityFunctions::print("Applying damage: ", final_damage);
}
```

### Overriding in GDScript

```gdscript
extends MyCustomNode

# Override the virtual method defined in C++
func _calculate_damage(base_damage: int) -> int:
    # Custom logic — double damage on critical
    if _is_critical_hit():
        return base_damage * 2
    return base_damage
```

### Overriding in C#

```csharp
using Godot;

public partial class MyEnemy : MyCustomNode
{
    public override int _CalculateDamage(int baseDamage)
    {
        // C# override — apply armor reduction
        int armor = GetArmorValue();
        return Mathf.Max(baseDamage - armor, 0);
    }
}
```

### Known Caveats

- On Windows, combining virtual and non-virtual bindings for the same method name can cause editor errors in some Godot versions. Test on your target platform.
- Virtual method calls go through Godot's call dispatch, which is slower than direct C++ calls. Don't use virtual methods for per-pixel or per-particle hot loops.
- The `_` prefix convention signals "this is meant to be overridden" — follow it for consistency with Godot's built-in API.

---

## 5. Editor Tool Integration

### Making Your Node Work in the Editor

To make your GDExtension node run code in the editor (like `@tool` in GDScript), override `_get_configuration_warnings` and process callbacks:

```cpp
// tool_node.cpp
#include "tool_node.h"

void ToolNode::_bind_methods() {
    ClassDB::bind_method(D_METHOD("get_radius"), &ToolNode::get_radius);
    ClassDB::bind_method(D_METHOD("set_radius", "value"), &ToolNode::set_radius);
    ADD_PROPERTY(
        PropertyInfo(Variant::FLOAT, "radius", PROPERTY_HINT_RANGE, "0.1,100.0,0.1"),
        "set_radius", "get_radius"
    );
}

void ToolNode::_process(double delta) {
    // Check if running in editor
    if (Engine::get_singleton()->is_editor_hint()) {
        // Editor-only visualization updates
        _update_debug_mesh();
        return;
    }

    // Runtime logic
    _simulate(delta);
}

PackedStringArray ToolNode::_get_configuration_warnings() const {
    PackedStringArray warnings;
    if (radius <= 0.0) {
        warnings.push_back("Radius must be greater than 0.");
    }
    return warnings;
}

void ToolNode::set_radius(float p_radius) {
    radius = p_radius;
    // Trigger visual update in editor
    if (Engine::get_singleton()->is_editor_hint()) {
        _update_debug_mesh();
    }
    notify_property_list_changed();
}
```

### Registering an EditorPlugin

```cpp
// my_editor_plugin.h
#include <godot_cpp/classes/editor_plugin.hpp>

class MyEditorPlugin : public EditorPlugin {
    GDCLASS(MyEditorPlugin, EditorPlugin)

protected:
    static void _bind_methods();

public:
    void _enter_tree() override;
    void _exit_tree() override;
    String _get_plugin_name() const override;
    bool _has_main_screen() const override;
};
```

```cpp
// my_editor_plugin.cpp
void MyEditorPlugin::_bind_methods() {}

void MyEditorPlugin::_enter_tree() {
    // Add custom controls, docks, inspectors
    // This runs when the plugin is activated in the editor
}

void MyEditorPlugin::_exit_tree() {
    // Remove custom controls
}

String MyEditorPlugin::_get_plugin_name() const {
    return "My Extension Tools";
}

bool MyEditorPlugin::_has_main_screen() const {
    return false;  // true if you want a main editor tab
}
```

Register it at the `EDITOR` initialization level:

```cpp
if (p_level == MODULE_INITIALIZATION_LEVEL_EDITOR) {
    ClassDB::register_class<MyEditorPlugin>();
    // The plugin is auto-discovered by Godot if registered here
}
```

---

## 6. Custom Inspector Plugins via GDExtension

### Extending the Inspector

```cpp
// my_inspector_plugin.h
#include <godot_cpp/classes/editor_inspector_plugin.hpp>
#include <godot_cpp/classes/editor_property.hpp>

class MyInspectorPlugin : public EditorInspectorPlugin {
    GDCLASS(MyInspectorPlugin, EditorInspectorPlugin)

protected:
    static void _bind_methods();

public:
    bool _can_handle(Object *p_object) const override;
    bool _parse_property(Object *p_object, Variant::Type p_type,
        const String &p_name, PropertyHint p_hint,
        const String &p_hint_string, BitField<PropertyUsageFlags> p_usage,
        bool p_wide) override;
};
```

```cpp
// my_inspector_plugin.cpp
bool MyInspectorPlugin::_can_handle(Object *p_object) const {
    // Return true if this inspector should handle this object type
    return Object::cast_to<MyCustomNode>(p_object) != nullptr;
}

bool MyInspectorPlugin::_parse_property(Object *p_object, Variant::Type p_type,
    const String &p_name, PropertyHint p_hint,
    const String &p_hint_string, BitField<PropertyUsageFlags> p_usage,
    bool p_wide) {
    
    if (p_name == "custom_data") {
        // Add a custom property editor
        // Return true to indicate we handled this property
        add_custom_control(/* your Control node */);
        return true;
    }
    return false;  // Let default inspector handle it
}
```

---

## 7. Multi-Extension Architecture

### When to Split into Multiple Libraries

| Scenario | Architecture |
|----------|-------------|
| Single feature (pathfinding, audio DSP) | One `.gdextension` |
| Game engine layer (physics + AI + networking) | Multiple `.gdextension` files, one per domain |
| Editor tools + runtime code | One library, but register editor classes only at `EDITOR` level |
| Plugin distributed to other developers | Single self-contained `.gdextension` |

### Project Structure for Multiple Extensions

```
project/
├── extensions/
│   ├── pathfinding/
│   │   ├── src/
│   │   ├── SConstruct
│   │   └── pathfinding.gdextension
│   ├── ai/
│   │   ├── src/
│   │   ├── SConstruct
│   │   └── ai.gdextension
│   └── shared/           # Shared headers, no .gdextension
│       └── include/
├── bin/                   # All compiled libraries go here
│   ├── libpathfinding.*.so
│   └── libai.*.so
└── project.godot
```

### Sharing Code Between Extensions

Extensions can't directly link to each other. For shared code:

1. **Header-only libraries** — Put shared code in headers that both extensions include at compile time
2. **Godot signals/methods** — Extensions communicate through Godot's object system (signals, `call()`, groups)
3. **Shared static library** — Compile common code as a static lib that both extensions link against

```cpp
// Extension A emits a signal
emit_signal("pathfinding_complete", path_result);

// Extension B connects to it (via GDScript glue or direct connection)
// In GDScript:
// $PathfindingNode.pathfinding_complete.connect($AINode._on_path_found)
```

---

## 8. Memory Management Patterns

### Godot-Managed vs. Manual Memory

```cpp
// GOOD — Godot-managed (RefCounted or Node subclass)
// Automatically freed by reference counting or scene tree
Ref<MyResource> res;
res.instantiate();  // RefCounted — freed when no references remain

MyNode *node = memnew(MyNode);
add_child(node);  // Node — freed when removed from tree + queue_free()

// CAUTION — Manual memory (non-RefCounted, non-Node objects)
// You must free these yourself
MyHelper *helper = memnew(MyHelper);
// ... use helper ...
memdelete(helper);  // Must free manually
```

### The memnew/memdelete Rule

- **Always** use `memnew()` / `memdelete()` instead of `new` / `delete` for Godot objects
- `memnew` hooks into Godot's memory tracking — `new` bypasses it and causes leaks or crashes
- For arrays, use `memnew_arr()` / `memdelete_arr()`

```cpp
// GOOD
int *buffer = memnew_arr(int, 1024);
memdelete_arr(buffer);

// BAD — bypasses Godot's allocator
int *buffer = new int[1024];  // Don't do this
delete[] buffer;
```

### GDScript/C# Comparison

GDScript and C# handle memory automatically. In GDScript, `RefCounted` objects are freed by reference counting, and `Node` objects are freed with `queue_free()`. You never call `free()` on a `RefCounted`. The same principles apply in GDExtension — the difference is that C++ requires you to be explicit about ownership.

---

## 9. Debugging Native Code

### Attaching a Debugger

**VS Code (Linux/macOS):**

```json
// .vscode/launch.json
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Debug GDExtension",
            "type": "cppdbg",
            "request": "launch",
            "program": "/path/to/godot.editor",
            "args": ["--path", "${workspaceFolder}/project", "--editor"],
            "cwd": "${workspaceFolder}",
            "MIMode": "gdb",
            "setupCommands": [
                {
                    "text": "handle SIGPIPE nostop noprint pass",
                    "description": "Ignore SIGPIPE (Godot networking)"
                }
            ]
        }
    ]
}
```

**Visual Studio (Windows):**

1. Set Godot editor as the debug target executable
2. Pass `--path <project_dir> --editor` as command line arguments
3. Set breakpoints in your .cpp files
4. F5 to launch Godot under the debugger

### Print Debugging

```cpp
#include <godot_cpp/variant/utility_functions.hpp>

// These print to Godot's Output panel
UtilityFunctions::print("MyNode value: ", some_value);
UtilityFunctions::printerr("Error: unexpected state");
UtilityFunctions::push_warning("Performance warning: ", count, " objects");
```

### Debug vs. Release Builds

Always build with debug symbols during development:

```bash
# SCons — debug build (includes symbols, assertions, slower)
scons target=template_debug

# SCons — release build (optimized, no symbols)
scons target=template_release

# SCons — dev build (debug + extra checks)
scons target=template_debug dev_build=yes
```

---

## 10. Cross-Language Patterns — C++ ↔ GDScript ↔ C#

### Calling GDScript from C++

```cpp
// Call a method on any Godot object (resolved at runtime)
Variant result = some_node->call("gdscript_method", arg1, arg2);

// Emit a signal that GDScript is connected to
emit_signal("damage_dealt", damage_amount, target);
```

### Calling C++ from GDScript

```gdscript
# Your GDExtension class appears as a native class
var my_node := MyCustomNode.new()
my_node.set_health(100)

# Virtual methods work naturally
func _calculate_damage(base_damage: int) -> int:
    return base_damage * 2
```

### Calling C++ from C#

```csharp
// GDExtension classes appear in C# with PascalCase naming
var myNode = new MyCustomNode();
myNode.SetHealth(100);

// Access custom properties
int health = myNode.GetHealth();
```

### Type Marshaling

| C++ Type | GDScript Type | C# Type |
|----------|--------------|---------|
| `int` / `int64_t` | `int` | `int` / `long` |
| `double` | `float` | `double` |
| `String` | `String` | `string` |
| `Vector3` | `Vector3` | `Vector3` |
| `Ref<Resource>` | `Resource` | `Resource` |
| `TypedArray<int>` | `Array[int]` | `Godot.Collections.Array<int>` |
| `Dictionary` | `Dictionary` | `Godot.Collections.Dictionary` |

---

## 11. Production Build Configuration

### SCons Build File for Multiple Platforms

```python
# SConstruct — production-ready build
import os

env = SConscript("godot-cpp/SConstruct")

# Source files
sources = Glob("src/*.cpp")

# Platform-specific settings
if env["platform"] == "windows":
    env.Append(CPPDEFINES=["WINDOWS_EXPORT"])
elif env["platform"] == "linux":
    env.Append(CCFLAGS=["-fPIC"])
elif env["platform"] == "macos":
    env.Append(CCFLAGS=["-std=c++17"])

# Build the shared library
library = env.SharedLibrary(
    "project/bin/libmyextension{}{}".format(
        env["suffix"], env["SHLIBSUFFIX"]
    ),
    source=sources,
)

Default(library)
```

### CI/CD Integration

```yaml
# .gitlab-ci.yml — Build GDExtension for all platforms
stages:
  - build

build-linux:
  stage: build
  image: ubuntu:22.04
  script:
    - apt-get update && apt-get install -y scons gcc g++ python3
    - cd godot-cpp && scons target=template_release platform=linux
    - cd .. && scons target=template_release platform=linux
  artifacts:
    paths:
      - project/bin/*.so

build-windows:
  stage: build
  image: ubuntu:22.04
  script:
    - apt-get update && apt-get install -y scons mingw-w64 python3
    - cd godot-cpp && scons target=template_release platform=windows
    - cd .. && scons target=template_release platform=windows
  artifacts:
    paths:
      - project/bin/*.dll

build-macos:
  stage: build
  tags: [macos]
  script:
    - cd godot-cpp && scons target=template_release platform=macos
    - cd .. && scons target=template_release platform=macos
  artifacts:
    paths:
      - project/bin/*.framework
```

### .gdextension Compatibility Settings

```ini
[configuration]
entry_symbol = "my_extension_init"
# Minimum Godot version this extension supports
compatibility_minimum = "4.4"
# Maximum tested version (optional, for safety)
compatibility_maximum = "4.6"
reloadable = true

[dependencies]
# Declare shared library dependencies if needed
# linux.debug.x86_64 = {"libthirdparty.so": ""}

[libraries]
linux.debug.x86_64 = "res://bin/libmyextension.linux.template_debug.x86_64.so"
linux.release.x86_64 = "res://bin/libmyextension.linux.template_release.x86_64.so"
windows.debug.x86_64 = "res://bin/libmyextension.windows.template_debug.x86_64.dll"
windows.release.x86_64 = "res://bin/libmyextension.windows.template_release.x86_64.dll"
macos.debug = "res://bin/libmyextension.macos.template_debug.framework"
macos.release = "res://bin/libmyextension.macos.template_release.framework"
# Web export (if applicable)
web.debug.wasm32 = "res://bin/libmyextension.web.template_debug.wasm32.wasm"
web.release.wasm32 = "res://bin/libmyextension.web.template_release.wasm32.wasm"
```

---

## 12. Common Mistakes

### Accessing Singletons Too Early

```cpp
// BAD — crashes because Engine singleton isn't ready at SCENE level
void initialize_my_extension(ModuleInitializationLevel p_level) {
    if (p_level == MODULE_INITIALIZATION_LEVEL_SCENE) {
        Engine::get_singleton()->register_singleton(...);  // CRASH
    }
}

// GOOD — use MainLoop level (4.5+) for singleton access
if (p_level == MODULE_INITIALIZATION_LEVEL_MAIN_LOOP) {
    Engine::get_singleton()->register_singleton(...);  // Safe
}

// ALTERNATIVE (pre-4.5) — defer to _ready() or _enter_tree()
void MyNode::_ready() {
    Engine::get_singleton()->...;  // Always safe in _ready
}
```

### Using new Instead of memnew

```cpp
// BAD — Godot can't track this allocation
MyNode *node = new MyNode();

// GOOD — Godot tracks it for leak detection and proper cleanup
MyNode *node = memnew(MyNode);
```

### Forgetting to Check Editor Mode

```cpp
// BAD — runs expensive simulation in the editor
void MyNode::_process(double delta) {
    simulate_physics(delta);
}

// GOOD — skip runtime logic in editor
void MyNode::_process(double delta) {
    if (Engine::get_singleton()->is_editor_hint()) {
        _update_editor_preview();
        return;
    }
    simulate_physics(delta);
}
```

### Not Handling Hot Reload State Loss

```cpp
// BAD — internal C++ state is lost on hot reload
class MyNode : public Node3D {
    std::vector<Enemy*> active_enemies;  // Gone after reload!
};

// GOOD — persist important state through Godot properties
void MyNode::_bind_methods() {
    // Array property survives hot reload
    ClassDB::bind_method(D_METHOD("get_enemy_count"), &MyNode::get_enemy_count);
    ADD_PROPERTY(PropertyInfo(Variant::INT, "enemy_count", PROPERTY_HINT_NONE, "",
        PROPERTY_USAGE_STORAGE), "", "get_enemy_count");
}
```

### Circular Dependencies Between Extensions

Two `.gdextension` libraries cannot depend on each other. If extension A needs types from extension B, restructure to use signals, interfaces (virtual methods), or a shared header-only library.

---

## Summary

| Topic | Key Takeaway |
|-------|-------------|
| Initialization stages | Core → Servers → Scene → Editor → MainLoop (4.5+) |
| MainLoop stage | Safe to access singletons; fires after full engine init |
| Hot reload | Set `reloadable = true`; expose state as properties to survive reload |
| Virtual methods | Bind with `ClassDB`; prefix with `_`; callable from GDScript/C# |
| Editor integration | Check `is_editor_hint()`; register editor classes at `EDITOR` level |
| Memory | Always use `memnew` / `memdelete`; never raw `new` / `delete` |
| Multi-extension | Communicate via signals/methods; share code via headers or static libs |
