# G41 — Godot 4.4–4.6 Feature Guide

> **Category:** Guide · **Engine:** Godot 4.4–4.6 · **Language:** GDScript / C#
> **Related:** [E2 GDScript vs C#](../architecture/E2_gdscript_vs_csharp.md) · [G18 Performance Profiling](./G18_performance_profiling.md) · [G23 Advanced Physics](./G23_advanced_physics.md) · [G30 Advanced Animation & IK](./G30_advanced_animation_and_ik.md) · [G35 Editor Tool Scripts](./G35_editor_tool_scripts.md)

---

## What This Guide Covers

Godot 4.4 (March 2025), 4.5 (September 2025), and 4.6 (January 2026) introduced substantial new APIs, workflow improvements, and engine defaults that change how you build games. This guide covers the most impactful additions across all three releases with practical code examples, migration notes, and guidance on when to adopt each feature.

**Use this guide when:** you're starting a new project and want to take advantage of modern Godot features, or upgrading from an earlier 4.x release and need to know what changed.

---

## Table of Contents

1. [Typed Dictionaries (4.4)](#1-typed-dictionaries-44)
2. [@export_tool_button (4.4)](#2-export_tool_button-44)
3. [Async Navigation Maps (4.4)](#3-async-navigation-maps-44)
4. [Runtime WAV Loading (4.4)](#4-runtime-wav-loading-44)
5. [Stencil Buffer (4.5)](#5-stencil-buffer-45)
6. [Shader Baker (4.5)](#6-shader-baker-45)
7. [Screen Reader Accessibility (4.5)](#7-screen-reader-accessibility-45)
8. [Jolt Physics as Default (4.6)](#8-jolt-physics-as-default-46)
9. [IKModifier3D — Inverse Kinematics Returns (4.6)](#9-ikmodifier3d--inverse-kinematics-returns-46)
10. [LibGodot — Engine Embedding (4.6)](#10-libgodot--engine-embedding-46)
11. [ObjectDB Snapshots & Diffing (4.6)](#11-objectdb-snapshots--diffing-46)
12. [Modern Editor Theme & Dock Rewrite (4.6)](#12-modern-editor-theme--dock-rewrite-46)
13. [Other Notable Changes](#13-other-notable-changes)
14. [Migration Checklist](#14-migration-checklist)

---

## 1. Typed Dictionaries (4.4)

Godot 4.0 introduced typed arrays (`Array[int]`), but dictionaries remained untyped. Godot 4.4 adds **typed dictionaries** — one of the most requested features from the community.

### Syntax

```gdscript
# Typed dictionary declaration
var stats: Dictionary[String, int] = {}
var inventory: Dictionary[StringName, int] = {
    &"sword": 1,
    &"potion": 5,
}

# Export to Inspector with proper editing UI
@export var item_prices: Dictionary[String, float] = {}
@export var enemy_drops: Dictionary[StringName, PackedScene] = {}

# Nested typed collections
var level_data: Dictionary[int, Array[Vector2]] = {
    1: [Vector2(100, 200), Vector2(300, 400)],
    2: [Vector2(50, 50)],
}
```

### Type Safety

The engine enforces key and value types at runtime:

```gdscript
var scores: Dictionary[String, int] = {}
scores["player_1"] = 100     # OK
scores["player_2"] = "high"  # Runtime error — value must be int
scores[42] = 100             # Runtime error — key must be String
```

### When to Use Typed Dictionaries

| Situation | Recommendation |
|-----------|---------------|
| Config data with known key schema | Use typed dict — catches typos at insertion |
| Exported to Inspector | Use typed dict — improved Inspector UX with proper editors |
| Dynamic/heterogeneous data (JSON parsing) | Keep untyped `Dictionary` — flexible schema |
| Hot paths with thousands of lookups | Typed dicts have same performance — no overhead |

### C# Equivalent

C# already had typed dictionaries through `Godot.Collections.Dictionary<TKey, TValue>`. No changes needed — the C# API for typed dictionaries works the same as before, but now interops correctly with GDScript typed dictionaries across the language boundary.

```csharp
// C# already had this, now it round-trips with GDScript typed dicts
[Export]
public Godot.Collections.Dictionary<string, int> ItemPrices { get; set; } = new();
```

---

## 2. @export_tool_button (4.4)

A new annotation that creates a clickable button in the Inspector for `@tool` scripts — no custom `EditorPlugin` required.

### Basic Usage

```gdscript
@tool
extends Node

# Simple button that calls a callable
@export_tool_button("Generate Level", "Callable")
var generate_action: Callable = _generate_level

@export_tool_button("Clear All", "Clear")
var clear_action: Callable = _clear_all

func _generate_level() -> void:
    print("Generating level...")
    # Your level generation logic here

func _clear_all() -> void:
    for child in get_children():
        child.queue_free()
```

The first string is the **button label**. The second (optional) string is the **icon name** — it must match a filename from Godot's `editor/icons/` directory (case-sensitive, without the `.svg` extension).

### Practical Examples

```gdscript
@tool
extends TileMapLayer

# Regenerate a tilemap
@export_tool_button("Randomize Tiles", "RandomNumberGenerator")
var randomize_action: Callable = _randomize_tiles

@export var noise_seed: int = 0
@export var threshold: float = 0.5

func _randomize_tiles() -> void:
    var noise := FastNoiseLite.new()
    noise.seed = noise_seed
    for x in range(-20, 20):
        for y in range(-15, 15):
            var val: float = noise.get_noise_2d(float(x), float(y))
            if val > threshold:
                set_cell(Vector2i(x, y), 0, Vector2i(0, 0))  # ground tile
            else:
                erase_cell(Vector2i(x, y))
```

### Warning Suppression (4.4)

Related GDScript addition — suppress warnings across code blocks:

```gdscript
@warning_ignore_start("unused_variable")
var debug_a: int = 0
var debug_b: int = 0
var debug_c: int = 0
@warning_ignore_restore("unused_variable")
# Warnings re-enabled from here
```

---

## 3. Async Navigation Maps (4.4)

Navigation map synchronization now runs **asynchronously in a background thread** (previously it blocked the main thread). This improves framerate in scenes with many navigation agents.

### What Changed

In Godot < 4.4, calling `NavigationServer2D.map_force_sync()` or `NavigationServer3D.map_force_sync()` would stall the main thread while recomputing the navigation mesh. In 4.4+, the engine processes navigation map updates asynchronously by default.

### Impact

- Navigation queries (`NavigationAgent2D.get_next_path_position()`) return results from the most recent completed bake, which may be up to one frame behind.
- For most games, this is invisible. For games that need frame-perfect pathfinding after a map change, call `map_force_sync()` explicitly — it still blocks, but you choose when.

```gdscript
# Only force-sync when absolutely needed (e.g., after placing a building)
func on_building_placed() -> void:
    NavigationServer2D.map_force_sync(get_world_2d().navigation_map)
    # Now all agents will path around the new building immediately
```

---

## 4. Runtime WAV Loading (4.4)

Previously, only OGG Vorbis could be loaded at runtime. Godot 4.4 adds runtime WAV loading, useful for user-generated content, modding, and dynamic audio.

```gdscript
func load_wav_at_runtime(path: String) -> AudioStreamWAV:
    var file := FileAccess.open(path, FileAccess.READ)
    if file == null:
        push_error("Cannot open WAV file: %s" % path)
        return null
    
    var bytes: PackedByteArray = file.get_buffer(file.get_length())
    var stream := AudioStreamWAV.new()
    # The engine parses WAV headers automatically when data is assigned
    stream.data = bytes
    return stream
```

---

## 5. Stencil Buffer (4.5)

The **stencil buffer** is a per-pixel integer buffer (alongside the depth buffer) that you can read and write from shaders. It enables effects that were previously very difficult:

- X-ray / see-through-walls
- Portal rendering (render behind a cutout)
- Outline masking
- Multi-pass decal rendering
- Silhouette effects

### How It Works

Meshes write a value to the stencil buffer. Later passes compare against that value to decide whether to render each pixel.

```
┌────────────────────────────────────────────┐
│ Pass 1: Character writes stencil value = 1 │
│ Pass 2: Wall shader discards pixels where  │
│         stencil == 1 (character shows       │
│         through the wall)                   │
└────────────────────────────────────────────┘
```

### Renderer Support

| Renderer | Stencil Support |
|----------|----------------|
| Forward+ | Yes |
| Compatibility | Yes |
| Mobile | Check release notes |

### Usage in Spatial Shaders

```glsl
shader_type spatial;

// Write to stencil buffer
render_mode stencil_write;

void fragment() {
    // This mesh writes a stencil reference value
    STENCIL = 1;
    ALBEDO = vec3(1.0, 0.0, 0.0);
}
```

```glsl
shader_type spatial;

// Read stencil and conditionally discard
render_mode stencil_compare;

void fragment() {
    // Discard pixels where stencil was already written
    if (STENCIL == 1) {
        discard;
    }
    ALBEDO = vec3(0.5, 0.5, 0.5);
}
```

> **Note:** The stencil buffer API may evolve in point releases. Check the official documentation for your exact Godot version for current syntax.

---

## 6. Shader Baker (4.5)

Shader compilation on first use causes hitches (the "shader stutter" problem). The **shader baker** pre-compiles shaders offline so they're ready at startup.

### The Problem

When Godot encounters a shader + material combination for the first time, the GPU driver must compile it. This causes visible frame drops — especially on the first playthrough of a level.

### The Solution

The shader baker scans your scenes and resources for shader/material combinations and pre-compiles them into the platform's native format:

1. **In the Editor:** Project → Export → enable **Shader Baker** in export settings.
2. **Result:** The export process bakes all discovered shaders. First-launch performance improves dramatically.

### Performance Impact

On Metal (macOS/iOS) and D3D12 (Windows), the shader baker showed **up to 20× reduction in startup shader compilation time** in Godot's TPS demo.

### When to Use

- **Always enable** for release builds on desktop and mobile.
- Not needed during development (editor compiles shaders on the fly).
- Particularly important for visually complex games with many unique materials.

---

## 7. Screen Reader Accessibility (4.5)

Godot 4.5 adds experimental screen reader support via the **AccessKit** integration:

- **Control nodes** can announce their content to screen readers.
- The **Project Manager** has full screen reader support.
- Standard **UI nodes** (Button, Label, LineEdit, etc.) work with screen readers.
- The **Inspector** is partially accessible.

### For Game Developers

If your game has UI built with Godot's Control nodes, screen readers can interact with it. To maximize accessibility:

```gdscript
# Ensure interactive controls have meaningful names
$StartButton.tooltip_text = "Start a new game"

# Use accessibility-friendly node names
# Screen readers use the node name as fallback label
```

See [G21 Accessibility](./G21_accessibility.md) for comprehensive accessibility guidance.

---

## 8. Jolt Physics as Default (4.6)

Starting in Godot 4.6, **Jolt Physics** is the default 3D physics engine for **new projects**. Existing projects are not automatically migrated.

### What is Jolt?

Jolt is a third-party rigid body physics solver (originally developed at Guerrilla Games) known for:
- Deterministic simulation
- Better stability for stacking and contact scenarios
- Higher performance in complex scenes

### Migration Considerations

| Aspect | Godot Physics | Jolt |
|--------|--------------|------|
| Default in 4.6 | No (legacy) | Yes (new projects) |
| Determinism | Approximate | Deterministic |
| Stacking stability | Can be jittery | Very stable |
| Soft bodies | Supported | Limited support |
| Custom shapes | Full | Some limitations |
| GodotPhysics2D | Unchanged | Jolt is 3D only |

### Switching Between Engines

```
Project Settings → Physics → 3D → Physics Engine
  - "DEFAULT" = Jolt in 4.6+
  - "GodotPhysics3D" = legacy engine
```

**Existing projects:** if you upgrade to 4.6 and want Jolt, explicitly set the physics engine to "DEFAULT" in project settings. Be aware that physics behavior may differ — test collision responses, stacking, and joints thoroughly.

See [G23 Advanced Physics](./G23_advanced_physics.md) for details on advanced physics patterns.

---

## 9. IKModifier3D — Inverse Kinematics Returns (4.6)

IK was missing from early Godot 4.x releases. Godot 4.6 brings it back with a **new framework** centered on `IKModifier3D`:

### Architecture

```
Skeleton3D
└── IKModifier3D
    ├── Deterministic Solver  (exact solutions for 2-bone chains)
    └── Iterative Solver      (FABRIK/CCD for complex chains)
```

### Basic Setup

```gdscript
# IK target tracking — e.g., hand reaching for a weapon pickup
@onready var ik: IKModifier3D = $Skeleton3D/IKModifier3D

func _process(_delta: float) -> void:
    # Point the IK chain at the target position
    ik.target = $PickupTarget.global_transform
```

### Key Features

- **Deterministic solver** — exact analytical solution for 2-bone chains (e.g., arm = upper arm + forearm). Fast and stable.
- **Iterative solver** — FABRIK/CCD for chains with more than 2 bones (spine, tentacles, tails). Convergence-based.
- **Constraints** — angle limits, twist constraints for realistic joint behavior.
- **Blending** — blend between IK and animation with a weight parameter.

See [G30 Advanced Animation & IK](./G30_advanced_animation_and_ik.md) for full IK patterns.

---

## 10. LibGodot — Engine Embedding (4.6)

**LibGodot** lets you embed the Godot engine as a library inside another application — a native host app, a specialized editor, or a hybrid tool.

### Use Cases

- Embed a Godot viewport in a Qt or GTK application
- Build a custom level editor that hosts Godot rendering
- Run Godot simulations inside a testing harness
- Create hybrid applications (Godot for 3D view, native UI for menus)

### How It Works

LibGodot exposes the engine's initialization, main loop, and shutdown as callable functions from C/C++:

```cpp
// C++ host application using LibGodot
#include "godot_api.h"

int main() {
    // Initialize the engine
    godot_init(argc, argv);
    
    // Run the main loop (or step it manually)
    while (running) {
        godot_step();  // advance one frame
        // ... your host app logic ...
    }
    
    godot_shutdown();
    return 0;
}
```

> **Note:** LibGodot is new in 4.6 and the API may evolve. Check the official documentation for the latest integration guide.

---

## 11. ObjectDB Snapshots & Diffing (4.6)

A major debugging addition — capture the state of all live objects and compare snapshots over time.

### What It Solves

Memory leaks and orphaned nodes are common bugs in Godot:
- Nodes removed from the tree but not `queue_free()`d
- Resources loaded but never released
- Signals connected to freed objects

### How to Use

In the **Debugger** panel (bottom dock):
1. Click **Capture ObjectDB Snapshot** at a known-good state.
2. Play your game, trigger the suspected leak.
3. Click **Capture** again.
4. Click **Diff** to compare — see exactly what objects were created and not cleaned up.

### Programmatic Access

```gdscript
# In debug builds, you can query ObjectDB from GDScript
func _check_for_leaks() -> void:
    var count: int = Performance.get_monitor(Performance.OBJECT_COUNT)
    print("Live objects: ", count)
    
    # Track over time to detect growth
    if count > _last_object_count + 100:
        push_warning("Object count grew by %d — possible leak" % (count - _last_object_count))
    _last_object_count = count
```

---

## 12. Modern Editor Theme & Dock Rewrite (4.6)

Godot 4.6 introduces a **Modern theme** as the new default editor appearance, plus a complete dock rewrite:

- **Floating panels** — detach any dock and place it on a second monitor.
- **Flexible layouts** — dock panels can be arranged freely, not just in fixed positions.
- **GDScript profiler** — built-in profiler for GDScript function timing, complementing the existing visual profiler.

---

## 13. Other Notable Changes

### 4.4

- **KHR_animation_pointer glTF extension** — imported animations can target custom properties.
- **Extended curve domains** — Curve editor supports ranges beyond [0, 1].
- **`@warning_ignore_start` / `@warning_ignore_restore`** — block-level warning suppression.

### 4.5

- **visionOS export** — deploy to Apple Vision Pro.
- **Wayland native sub-window support** (Linux).
- **WebAssembly SIMD** — significant performance boost for web exports.

### 4.6

- **D3D12 default on Windows** — replaces Vulkan as the default rendering backend.
- **AGX tone mapping** — more natural, filmic color reproduction.
- **SSR rewrite** — cleaner screen-space reflections with half/full resolution modes.
- **Animation timeline retiming** — resize clips and keys directly in the editor.
- **OpenXR 1.1** — updated XR support with platform-agnostic Android XR export.
- **Node IDs** — persistent unique IDs for nodes, useful for networking and serialization.

---

## 14. Migration Checklist

When upgrading an existing project across these versions:

### From 4.3 → 4.4

- [ ] Adopt typed dictionaries for exported properties (improved Inspector UX)
- [ ] Replace custom EditorPlugin buttons with `@export_tool_button` where possible
- [ ] Test navigation-heavy scenes — async map sync may change timing slightly
- [ ] Review GDScript warnings — new warning types may surface

### From 4.4 → 4.5

- [ ] Enable shader baker in export presets for release builds
- [ ] Test screen reader with your game's UI if targeting accessibility
- [ ] Check stencil buffer availability if using custom rendering effects
- [ ] Test web export — SIMD support may change performance characteristics

### From 4.5 → 4.6

- [ ] **Critical:** Test 3D physics — Jolt is now default for new projects. Existing projects keep GodotPhysics3D unless you change the setting
- [ ] If upgrading physics to Jolt: test all collision, joints, and contact behavior
- [ ] Try the Modern theme — you can switch back to the classic theme in Editor Settings
- [ ] Use ObjectDB snapshots to audit for memory leaks
- [ ] If using IK: migrate from any workarounds to the new `IKModifier3D` system
- [ ] Review rendering — D3D12 is now default on Windows (Vulkan still available)
