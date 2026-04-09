# G93 — Godot 3.x to 4.x Migration

> **Category:** guide · **Engine:** Godot 4.x · **Related:** [G45 Advanced GDScript Patterns](./G45_advanced_gdscript_patterns.md) · [G67 C# Best Practices](./G67_csharp_best_practices.md) · [G65 Unity to Godot Migration](./G65_unity_to_godot_migration.md) · [G3 Signal Architecture](./G3_signal_architecture.md)

Godot 4.0 was a ground-up rewrite of core systems — rendering, physics, GDScript, the editor, and the module/plugin architecture. Migrating a Godot 3.x project is not a simple version bump. This guide covers the major breaking changes, the automated migration tool, and practical strategies for porting projects of different sizes.

---

## Table of Contents

1. [Should You Migrate?](#1-should-you-migrate)
2. [Before You Start](#2-before-you-start)
3. [The Automatic Conversion Tool](#3-the-automatic-conversion-tool)
4. [GDScript 2.0 Changes](#4-gdscript-20-changes)
5. [Node and Class Renames](#5-node-and-class-renames)
6. [Signal Syntax Changes](#6-signal-syntax-changes)
7. [Physics Changes](#7-physics-changes)
8. [Rendering and Shader Changes](#8-rendering-and-shader-changes)
9. [Input System Changes](#9-input-system-changes)
10. [Audio Changes](#10-audio-changes)
11. [Tween System Rewrite](#11-tween-system-rewrite)
12. [C# / Mono Changes](#12-c-mono-changes)
13. [Resource and File Format Changes](#13-resource-and-file-format-changes)
14. [Migration Strategy by Project Size](#14-migration-strategy-by-project-size)
15. [Post-Migration Checklist](#15-post-migration-checklist)
16. [Common Pitfalls](#16-common-pitfalls)

---

## 1. Should You Migrate?

**Migrate if:**

- Your project is in early/mid development and you want access to Vulkan rendering, typed arrays, improved GDScript, Jolt physics, GDExtension, and the growing 4.x addon ecosystem.
- You're starting a new project based on a 3.x prototype.
- Your 3.x dependencies (plugins, addons) have 4.x equivalents.

**Stay on 3.x if:**

- Your game is near release and stable. Migrating introduces risk with minimal benefit.
- You depend on GLES2 for extremely low-end hardware (Godot 4's Compatibility renderer covers most cases, but GLES2 is gone).
- Critical plugins have no 4.x port.

---

## 2. Before You Start

1. **Back up everything.** Use version control — create a migration branch.
2. **Upgrade to the latest Godot 3.x** (3.6+). This version includes compatibility helpers and warnings about deprecated APIs.
3. **Audit your addons.** Check the Godot Asset Library and addon repos for 4.x versions. List any without ports — you'll need to migrate or replace them.
4. **Run the 3.x project** and note any existing warnings. Fix them first — they often indicate deprecated APIs that won't convert cleanly.
5. **Document your project's architecture.** Migration is a good time to refactor, but you need to know what you have.

---

## 3. The Automatic Conversion Tool

Godot 4's editor includes a **Project Converter** that runs when you open a 3.x project.

### What It Does

- Renames classes, methods, properties, and signals to their 4.x equivalents.
- Updates `export` to `@export`, `onready` to `@onready`, `tool` to `@tool`.
- Converts `connect("signal_name", target, "method_name")` to the new callable syntax.
- Renames nodes in `.tscn` files (e.g., `Spatial` → `Node3D`).
- Updates shader language syntax.

### What It Doesn't Do

- Fix logic errors caused by behavioral changes (e.g., `move_and_slide` parameter removal).
- Migrate custom C++ modules to GDExtension.
- Handle complex signal connection patterns involving `binds` array.
- Convert `yield()` to `await` in all cases (some need manual rewriting).
- Fix `Tween` usage (the Tween system was completely rewritten).

### Running the Converter

1. Open Godot 4.x.
2. Use **Project → Import** and select your 3.x `project.godot`.
3. The converter dialog shows a preview of changes.
4. Review and confirm. **Changes are written in-place** — this is why you branch first.
5. After conversion, expect errors. The converter handles ~80% of renames; the rest is manual.

---

## 4. GDScript 2.0 Changes

### Annotations Replace Keywords

```gdscript
# Godot 3.x
tool
export var speed := 100.0
onready var sprite = $Sprite

# Godot 4.x
@tool
@export var speed := 100.0
@onready var sprite: Sprite2D = $Sprite2D
```

### Typed Arrays and Dictionaries

```gdscript
# Godot 3.x — no typed collections
var enemies = []
var scores = {}

# Godot 4.x — typed collections (4.0 for arrays, 4.4 for dictionaries)
var enemies: Array[Enemy] = []
var scores: Dictionary[String, int] = {}
```

### `setget` → Inline Properties

```gdscript
# Godot 3.x
var health := 100 setget set_health, get_health

func set_health(value):
    health = clamp(value, 0, max_health)
    emit_signal("health_changed", health)

func get_health():
    return health

# Godot 4.x
var health := 100:
    set(value):
        health = clampi(value, 0, max_health)
        health_changed.emit(health)
    get:
        return health
```

### `yield` → `await`

```gdscript
# Godot 3.x
yield(get_tree().create_timer(1.0), "timeout")
var result = yield(http_request, "request_completed")

# Godot 4.x
await get_tree().create_timer(1.0).timeout
var result = await http_request.request_completed
```

### `funcref` → `Callable`

```gdscript
# Godot 3.x
var callback = funcref(self, "my_method")
callback.call_func(arg1, arg2)

# Godot 4.x
var callback := my_method  # Direct reference
callback.call(arg1, arg2)

# Or with a Callable explicitly
var callback := Callable(self, "my_method")
```

### Random Number Changes

```gdscript
# Godot 3.x
randomize()  # Required to seed RNG
var r = rand_range(0.0, 10.0)

# Godot 4.x
# randomize() is no longer needed — auto-seeded
var r := randf_range(0.0, 10.0)  # Float version
var n := randi_range(0, 10)       # Integer version
```

### String Formatting

```gdscript
# Godot 3.x — still works but less common
var msg = "HP: %d/%d" % [current, max_val]

# Godot 4.x — same, but also supports:
var msg := "HP: %d/%d" % [current, max_val]  # Still valid
```

---

## 5. Node and Class Renames

Godot 4 standardized naming: all spatial nodes now have `3D` suffixes, matching the `2D` convention.

### Core Nodes

| Godot 3.x | Godot 4.x |
|-----------|-----------|
| `Spatial` | `Node3D` |
| `KinematicBody` | `CharacterBody3D` |
| `KinematicBody2D` | `CharacterBody2D` |
| `RigidBody` | `RigidBody3D` |
| `StaticBody` | `StaticBody3D` |
| `Area` | `Area3D` |
| `Sprite` | `Sprite2D` |
| `Camera` | `Camera3D` |
| `MeshInstance` | `MeshInstance3D` |
| `Light` / `OmniLight` / `SpotLight` / `DirectionalLight` | `OmniLight3D` / `SpotLight3D` / `DirectionalLight3D` |
| `Position2D` | `Marker2D` |
| `Position3D` | `Marker3D` |
| `Listener` | `AudioListener3D` |
| `Navigation` | `NavigationRegion3D` |
| `Popup` | `Window` (or `Popup` for simple cases) |
| `WindowDialog` | `Window` |
| `ToolButton` | `Button` (with flat theme) |
| `LineEdit.placeholder_text` | `LineEdit.placeholder_text` (same, but `placeholder_alpha` removed) |

### Properties

| Godot 3.x | Godot 4.x |
|-----------|-----------|
| `translation` (3D) | `position` |
| `global_translation` (3D) | `global_position` |
| `rect_position` (Control) | `position` |
| `rect_size` (Control) | `size` |
| `rect_min_size` (Control) | `custom_minimum_size` |
| `RectangleShape2D.extents` | `RectangleShape2D.size` (full size, not half) |

> **Warning on RectangleShape2D:** In 3.x, `extents` was half-width/half-height. In 4.x, `size` is the full width/height. If you had `extents = Vector2(16, 16)`, the equivalent is `size = Vector2(32, 32)`. The converter handles the rename but **does not double the values** — you must fix this manually.

---

## 6. Signal Syntax Changes

### Declaring Signals

```gdscript
# Godot 3.x
signal health_changed(new_value)

# Godot 4.x — same syntax, but now supports types
signal health_changed(new_value: int)
```

### Connecting Signals

```gdscript
# Godot 3.x — string-based
connect("health_changed", target, "_on_health_changed")
connect("health_changed", target, "_on_health_changed", [extra_arg], CONNECT_DEFERRED)

# Godot 4.x — callable-based
health_changed.connect(target._on_health_changed)
health_changed.connect(target._on_health_changed.bind(extra_arg), CONNECT_DEFERRED)
```

### Emitting Signals

```gdscript
# Godot 3.x
emit_signal("health_changed", new_value)

# Godot 4.x
health_changed.emit(new_value)
```

### Disconnecting

```gdscript
# Godot 3.x
disconnect("health_changed", target, "_on_health_changed")

# Godot 4.x
health_changed.disconnect(target._on_health_changed)
```

---

## 7. Physics Changes

### CharacterBody Movement

This is one of the biggest behavioral changes:

```gdscript
# Godot 3.x — KinematicBody2D
var velocity := Vector2.ZERO

func _physics_process(delta: float) -> void:
    velocity.y += gravity * delta
    velocity = move_and_slide(velocity, Vector2.UP, false, 4, 0.785, true)

# Godot 4.x — CharacterBody2D
# velocity is now a built-in property — do NOT declare it
func _physics_process(delta: float) -> void:
    velocity.y += gravity * delta
    # Parameters are now properties set in the inspector or code:
    #   up_direction = Vector2.UP (default)
    #   floor_max_angle = 0.785 (default)
    #   slide_on_ceiling = true
    #   max_slides = 4
    move_and_slide()
    # Access is_on_floor(), is_on_wall(), etc. after the call
```

### Physics Material

```gdscript
# Godot 3.x
physics_material.friction = 0.5
physics_material.bounce = 0.3

# Godot 4.x — same API, but absorbent was removed
# bounce values > 0 mean the surface is bouncy
```

### Jolt Physics (4.6 Default)

Godot 4.6 made Jolt the default 3D physics engine. If migrating from 3.x GodotPhysics:

- Most behavior is compatible, but **edge cases differ** (especially joint limits and soft bodies).
- You can switch back to GodotPhysics in Project Settings if Jolt causes issues.

---

## 8. Rendering and Shader Changes

### Renderer Selection

| Godot 3.x | Godot 4.x Equivalent |
|-----------|---------------------|
| GLES3 | Forward+ (Vulkan/Metal) |
| GLES2 | Compatibility (OpenGL 3.3 / OpenGL ES 3.0) |
| — | Mobile (Vulkan, optimized for mobile GPUs) |

### Shader Language Changes

```glsl
// Godot 3.x — Spatial shader
shader_type spatial;
void fragment() {
    ALBEDO = texture(TEXTURE, UV).rgb;
    // hint_color → source_color
}

// Godot 4.x
shader_type spatial;
uniform sampler2D base_texture : source_color;  // hint_color is now source_color
void fragment() {
    ALBEDO = texture(base_texture, UV).rgb;
}
```

Key shader changes:

- `hint_color` → `source_color`
- `hint_range` → `hint_range` (same, but uniform syntax changed)
- `SCREEN_TEXTURE` → must use a `uniform sampler2D` with `hint_screen_texture`
- `DEPTH_TEXTURE` → must use `hint_depth_texture`
- `NORMALMAP` → `NORMAL_MAP`
- `NORMALMAP_DEPTH` → `NORMAL_MAP_DEPTH`

```glsl
// Godot 3.x
vec4 screen = textureLod(SCREEN_TEXTURE, SCREEN_UV, 0.0);

// Godot 4.x
uniform sampler2D screen_texture : hint_screen_texture, filter_linear_mipmap;
// In fragment():
vec4 screen = textureLod(screen_texture, SCREEN_UV, 0.0);
```

### Environment and Lighting

- `GIProbe` → `VoxelGI`
- `BakedLightmap` → `LightmapGI`
- `Environment.background_mode` values changed
- `Environment.glow_hdr_threshold` → renamed

---

## 9. Input System Changes

```gdscript
# Godot 3.x
func _input(event):
    if event is InputEventKey and event.pressed and event.scancode == KEY_ESCAPE:
        get_tree().quit()

# Godot 4.x
func _input(event: InputEvent) -> void:
    if event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
        get_tree().quit()
```

- `scancode` → `keycode`
- `physical_scancode` → `physical_keycode`
- `InputEventKey.unicode` remains the same
- `Input.is_action_just_pressed()` works the same way

---

## 10. Audio Changes

```gdscript
# Godot 3.x
$AudioStreamPlayer.stream = preload("res://sfx/hit.wav")
$AudioStreamPlayer.play()

# Godot 4.x — same API, but:
# - AudioStreamSample → AudioStreamWAV
# - AudioEffectReverb parameters renamed
# - AudioServer.get_bus_peak_volume_left_db() → still available
```

- `AudioStreamSample` → `AudioStreamWAV`
- The audio bus system is unchanged.
- `AudioStreamRandomPitch` → `AudioStreamRandomizer` (more flexible, supports multiple streams)

---

## 11. Tween System Rewrite

This is a **complete rewrite**. In Godot 3, `Tween` was a node you added to the scene tree. In Godot 4, tweens are lightweight objects created on demand.

```gdscript
# Godot 3.x
var tween = $Tween
tween.interpolate_property(
    sprite, "modulate", Color.WHITE, Color.RED,
    0.5, Tween.TRANS_SINE, Tween.EASE_IN
)
tween.start()
yield(tween, "tween_completed")

# Godot 4.x
var tween := create_tween()
tween.tween_property(sprite, "modulate", Color.RED, 0.5) \
    .set_trans(Tween.TRANS_SINE) \
    .set_ease(Tween.EASE_IN)
await tween.finished
```

### Key Differences

| Godot 3.x Tween | Godot 4.x Tween |
|-----------------|-----------------|
| Is a node (`$Tween`) | Is an object (`create_tween()`) |
| Requires `start()` | Starts immediately on creation |
| `interpolate_property()` | `tween_property()` |
| `interpolate_method()` | `tween_method()` |
| `tween_completed` signal | `finished` signal |
| One tween node, multiple animations | One tween object per animation chain |
| Must be in the scene tree | Created from any node via `create_tween()` |

### Chaining and Parallel

```gdscript
# Godot 4.x — sequential by default
var tween := create_tween()
tween.tween_property(sprite, "position:x", 200.0, 0.5)  # First
tween.tween_property(sprite, "modulate:a", 0.0, 0.3)     # Then

# Parallel execution
var tween := create_tween().set_parallel(true)
tween.tween_property(sprite, "position:x", 200.0, 0.5)   # Simultaneous
tween.tween_property(sprite, "modulate:a", 0.0, 0.5)      # Simultaneous
```

---

## 12. C# / Mono Changes

Godot 4 moved from Mono to **.NET 6+** (now .NET 8 in 4.4+).

### Key Changes

| Godot 3.x (Mono) | Godot 4.x (.NET) |
|------------------|------------------|
| `Godot.Object` | `GodotObject` |
| `Export` attribute | `[Export]` attribute (same, but typed) |
| `GetNode<Type>("path")` | `GetNode<Type>("path")` (same) |
| Signals via strings | Signals via generated C# events |
| `GD.Print()` | `GD.Print()` (same) |
| `.mono` project files | Standard `.csproj` |
| Mono runtime | .NET 8 runtime |

### Signal Connection in C#

```csharp
// Godot 3.x (Mono)
GetNode("Button").Connect("pressed", this, nameof(OnButtonPressed));

// Godot 4.x (.NET)
GetNode<Button>("Button").Pressed += OnButtonPressed;
// Or:
GetNode<Button>("Button").Pressed += () => GD.Print("Clicked!");
```

### Exported Properties

```csharp
// Godot 3.x
[Export] public float Speed = 100f;

// Godot 4.x — same syntax, works with typed arrays
[Export] public float Speed { get; set; } = 100f;
[Export] public Godot.Collections.Array<Enemy> Enemies { get; set; } = new();
```

---

## 13. Resource and File Format Changes

- `.tres` and `.tscn` files are **not backward compatible**. The converter updates them.
- `.import` files are regenerated. Delete the `.godot/imported/` cache.
- `project.godot` format changed — many setting paths moved.
- Custom resources work the same way, but class registration syntax changed (see `class_name` and `@export`).

### File System

```
# Godot 3.x cache
.import/

# Godot 4.x cache
.godot/imported/
.godot/editor/
.godot/uid_cache.bin
```

Add `.godot/` to `.gitignore` (replaces the old `.import/` ignore).

---

## 14. Migration Strategy by Project Size

### Small Projects (< 50 scripts)

1. Back up and branch.
2. Open in Godot 4 — run the auto-converter.
3. Fix errors top-down (start with autoloads, then main scenes).
4. Test each system as you fix it.

### Medium Projects (50–200 scripts)

1. Back up and branch.
2. Run the auto-converter.
3. Create a **migration tracking document** — list every script and its status.
4. Fix in dependency order: autoloads → core systems → gameplay → UI → polish.
5. Write a test scene for each major system before moving to the next.

### Large Projects (200+ scripts)

1. Consider whether migration is worth it (see section 1).
2. If proceeding: **migrate incrementally by module.**
3. Isolate independent systems (inventory, dialogue, AI) and migrate them first — test in a minimal Godot 4 project.
4. Migrate the core scene tree last, once all systems are ported.
5. Budget 2–4 weeks of focused migration work for a team.

---

## 15. Post-Migration Checklist

After the auto-converter runs and you've fixed compile errors:

- [ ] All `@export` variables appear correctly in the inspector
- [ ] Signals connect without errors (check the Debugger → Misc → Connected Signals)
- [ ] Physics bodies collide correctly (check collision layers/masks — the system is the same but values may have reset)
- [ ] Shaders compile (check the Output panel for shader errors)
- [ ] Audio plays (check `AudioStreamWAV` references, bus routing)
- [ ] Tweens animate (all `$Tween` node references must become `create_tween()`)
- [ ] Save/load works (if you serialize with `var2str` / `str2var`, test round-trips)
- [ ] Input actions fire (check Project Settings → Input Map)
- [ ] `RectangleShape2D.size` values are correct (doubled from old `extents`)
- [ ] Navigation works (NavigationServer API changed significantly)
- [ ] Particles render (`CPUParticles` → `CPUParticles2D`/`CPUParticles3D`, `Particles` → `GPUParticles3D`)
- [ ] Export templates work for your target platforms

---

## 16. Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| `velocity` variable name conflicts with `CharacterBody2D.velocity` | Remove your custom `velocity` declaration — use the built-in property |
| `move_and_slide()` behaves differently | Parameters are now properties. Set `up_direction`, `floor_max_angle`, etc. in the inspector or `_ready()` |
| `yield` not fully converted to `await` | Manual fix: `yield(obj, "signal")` → `await obj.signal` |
| Tween code silently does nothing | `$Tween` nodes no longer exist. Replace with `create_tween()` pattern |
| `RectangleShape2D` collision boxes are half-size | Manually double `size` values (converter renames but doesn't adjust values) |
| Shader `SCREEN_TEXTURE` errors | Add `uniform sampler2D screen_texture : hint_screen_texture;` at the top of the shader |
| `is_connected` signature changed | `is_connected("sig", obj, "method")` → `sig.is_connected(obj.method)` |
| C# project won't build | Delete `.mono/` folder, update `.csproj` to .NET 8, regenerate solution |
| Addon/plugin not working | Check if the addon has a 4.x branch. If not, look for alternatives on the Asset Library. |
| `OS.get_ticks_msec()` → `Time.get_ticks_msec()` | Many `OS` utility methods moved to dedicated singletons (`Time`, `DisplayServer`, etc.) |
