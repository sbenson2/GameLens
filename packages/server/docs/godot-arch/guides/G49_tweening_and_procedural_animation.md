# G49 — Tweening and Procedural Animation

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#
> **Related:** [G8 Animation Systems](./G8_animation_systems.md) · [G30 Advanced Animation & IK](./G30_advanced_animation_and_ik.md) · [G38 Game Feel & Juice](./G38_game_feel_and_juice.md) · [G45 Advanced GDScript Patterns](./G45_advanced_gdscript_patterns.md)

---

## What This Guide Covers

Godot 4's `Tween` API is a lightweight, code-driven animation system that complements `AnimationPlayer` for cases where final values aren't known at edit time — camera zooms, UI transitions, procedural knockback, score counters, and every other "animate this value from A to B" scenario. Unlike AnimationPlayer, tweens are created entirely in code, require no node in the scene tree, and are garbage-collected automatically when they finish.

This guide covers the full Tween API (creation, chaining, parallel execution, easing), common procedural animation recipes, integrating tweens with signals and coroutines, performance considerations, and patterns for building reusable tween-based animation libraries.

**Use this guide when:** you need runtime-driven animations, want to add juice/polish to gameplay, or are building UI transitions, screen effects, or any animation where the target values are computed at runtime.

---

## Table of Contents

1. [Tween Fundamentals](#1-tween-fundamentals)
2. [Tweener Types](#2-tweener-types)
3. [Sequential vs Parallel Execution](#3-sequential-vs-parallel-execution)
4. [Easing and Transition Curves](#4-easing-and-transition-curves)
5. [Common Recipes](#5-common-recipes)
6. [Tween Lifecycle and Management](#6-tween-lifecycle-and-management)
7. [Procedural Animation Patterns](#7-procedural-animation-patterns)
8. [Integrating with Signals and Coroutines](#8-integrating-with-signals-and-coroutines)
9. [Reusable Tween Libraries](#9-reusable-tween-libraries)
10. [C# Examples](#10-c-examples)
11. [Performance Considerations](#11-performance-considerations)
12. [Common Pitfalls](#12-common-pitfalls)

---

## 1. Tween Fundamentals

### Creating a Tween

In Godot 4.x, tweens are created via `create_tween()` on any `Node` (which binds the tween to that node's lifetime) or via `get_tree().create_tween()` (which binds it to the SceneTree and survives node removal).

```gdscript
# Bound to this node — killed if node is freed
var tween := create_tween()

# Bound to the SceneTree — survives node removal
var tween := get_tree().create_tween()
```

**Key principle:** A tween starts executing immediately after creation. There is no `play()` call needed. Add all your tweeners before the next frame if you want them to run from the start.

### Tween vs AnimationPlayer

| Aspect | Tween | AnimationPlayer |
|--------|-------|-----------------|
| Defined in | Code | Editor (resource) |
| Final values | Dynamic / computed | Fixed at edit time |
| Scene tree node | No | Yes (required) |
| Visual editing | No | Yes (timeline) |
| Best for | Procedural, runtime-driven | Authored, complex sequences |
| Memory | Lightweight, auto-freed | Persistent node |

Use tweens for gameplay-driven animations. Use AnimationPlayer for hand-authored cinematic sequences, character animations, and anything a designer needs to tweak visually.

---

## 2. Tweener Types

Godot 4 provides four tweener types, each added via a method on the `Tween` object:

### tween_property()

Interpolates a property from its current value to a target value.

```gdscript
var tween := create_tween()
# Fade sprite to red over 1 second
tween.tween_property($Sprite2D, "modulate", Color.RED, 1.0)

# Animate a sub-property using `:` notation
tween.tween_property($Sprite2D, "position:x", 500.0, 0.5)
```

**Relative values** — use `as_relative()` to add to the current value instead of setting an absolute target:

```gdscript
# Move 200 pixels to the right from current position
tween.tween_property(self, "position:x", 200.0, 0.3).as_relative()
```

**From a specific value** — use `from()` to override the starting value:

```gdscript
# Flash from white back to normal color
tween.tween_property($Sprite2D, "modulate", Color.WHITE, 0.0)
tween.tween_property($Sprite2D, "modulate", Color(1, 1, 1, 1), 0.3).from(Color.WHITE)
```

### tween_interval()

Inserts a delay (in seconds) between tweeners.

```gdscript
tween.tween_property($Label, "modulate:a", 1.0, 0.3)
tween.tween_interval(2.0)  # Wait 2 seconds
tween.tween_property($Label, "modulate:a", 0.0, 0.3)
```

### tween_callback()

Calls a function at a specific point in the sequence.

```gdscript
tween.tween_property($Sprite2D, "scale", Vector2.ZERO, 0.5)
tween.tween_callback($Sprite2D.queue_free)

# With arguments — use a lambda
tween.tween_callback(func(): spawn_particles(global_position))
```

### tween_method()

Calls a method repeatedly with an interpolated value — useful for custom properties or functions that aren't direct node properties.

```gdscript
# Animate a shader parameter
tween.tween_method(
    func(val: float): material.set_shader_parameter("dissolve", val),
    0.0, 1.0, 1.5
)

# Animate a custom setter
tween.tween_method(set_health_display, current_hp, target_hp, 0.5)
```

---

## 3. Sequential vs Parallel Execution

By default, tweeners execute **sequentially** — each one starts after the previous one finishes.

### Sequential (default)

```gdscript
var tween := create_tween()
tween.tween_property(self, "position:x", 500.0, 0.5)  # Runs first
tween.tween_property(self, "position:y", 300.0, 0.5)   # Runs second
tween.tween_callback(queue_free)                         # Runs third
```

### Parallel with `set_parallel()`

Makes **all** subsequent tweeners start at the same time:

```gdscript
var tween := create_tween().set_parallel(true)
tween.tween_property(self, "position:x", 500.0, 0.5)   # Starts at t=0
tween.tween_property(self, "modulate:a", 0.0, 0.5)      # Also starts at t=0
```

### Mixing with `parallel()` and `chain()`

For fine-grained control, use `.parallel()` on individual tweeners to run them alongside the previous one, and `.chain()` to resume sequential execution:

```gdscript
var tween := create_tween()
# Step 1: Move right AND fade out simultaneously
tween.tween_property(self, "position:x", 500.0, 0.5)
tween.parallel().tween_property(self, "modulate:a", 0.0, 0.5)
# Step 2: After both finish, call queue_free
tween.tween_callback(queue_free)
```

With `set_parallel(true)`, use `chain()` to insert a sequential break:

```gdscript
var tween := create_tween().set_parallel(true)
tween.tween_property(self, "position:x", 500.0, 1.0)
tween.tween_property(self, "scale", Vector2(2, 2), 1.0)
# After the parallel group finishes, run this sequentially:
tween.chain().tween_property(self, "modulate:a", 0.0, 0.3)
```

---

## 4. Easing and Transition Curves

Every tweener supports `.set_ease()` and `.set_trans()` to control the interpolation curve.

### Transition Types (`TransitionType`)

| Constant | Effect |
|----------|--------|
| `TRANS_LINEAR` | Constant speed |
| `TRANS_SINE` | Gentle acceleration (good default) |
| `TRANS_QUAD` | Moderate acceleration |
| `TRANS_CUBIC` | Stronger acceleration |
| `TRANS_QUART` | Even stronger |
| `TRANS_QUINT` | Very strong acceleration |
| `TRANS_EXPO` | Exponential |
| `TRANS_CIRC` | Circular curve |
| `TRANS_ELASTIC` | Springy overshoot |
| `TRANS_BOUNCE` | Bouncing ball |
| `TRANS_BACK` | Slight overshoot before settling |
| `TRANS_SPRING` | Spring physics (Godot 4.3+) |

### Ease Types (`EaseType`)

| Constant | Effect |
|----------|--------|
| `EASE_IN` | Slow start, fast end |
| `EASE_OUT` | Fast start, slow end |
| `EASE_IN_OUT` | Slow start and end |
| `EASE_OUT_IN` | Fast start and end, slow middle |

### Applying Easing

```gdscript
# Bouncy entrance
tween.tween_property(self, "position:y", target_y, 0.6) \
    .set_ease(Tween.EASE_OUT) \
    .set_trans(Tween.TRANS_ELASTIC)

# Smooth deceleration (most natural for UI)
tween.tween_property($Panel, "position:x", 0.0, 0.4) \
    .set_ease(Tween.EASE_OUT) \
    .set_trans(Tween.TRANS_CUBIC)
```

### Setting Default Easing

Apply easing to ALL tweeners in a tween:

```gdscript
var tween := create_tween() \
    .set_ease(Tween.EASE_OUT) \
    .set_trans(Tween.TRANS_CUBIC)
```

### Custom Curves

For non-standard easing, use `tween_method()` with a `Curve` resource:

```gdscript
@export var custom_curve: Curve

func animate_with_curve() -> void:
    var tween := create_tween()
    tween.tween_method(
        func(t: float):
            position.y = lerpf(start_y, end_y, custom_curve.sample(t)),
        0.0, 1.0, 0.5
    )
```

---

## 5. Common Recipes

### Screen Shake

```gdscript
func screen_shake(intensity: float = 10.0, duration: float = 0.3) -> void:
    var camera := get_viewport().get_camera_2d()
    if not camera:
        return
    var tween := create_tween()
    var shake_count := int(duration / 0.05)
    for i in shake_count:
        var offset := Vector2(
            randf_range(-intensity, intensity),
            randf_range(-intensity, intensity)
        )
        tween.tween_property(camera, "offset", offset, 0.05)
    tween.tween_property(camera, "offset", Vector2.ZERO, 0.05)
```

### Hit Flash

```gdscript
func hit_flash(sprite: CanvasItem, duration: float = 0.15) -> void:
    var tween := create_tween()
    tween.tween_property(sprite, "modulate", Color(10, 10, 10, 1), 0.0)
    tween.tween_property(sprite, "modulate", Color.WHITE, duration)
```

### Score Counter

```gdscript
var _displayed_score: int = 0

func animate_score(new_score: int) -> void:
    var tween := create_tween()
    tween.tween_method(
        func(val: int):
            _displayed_score = val
            $ScoreLabel.text = str(val),
        _displayed_score, new_score, 0.5
    ).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
```

### UI Slide-In

```gdscript
func slide_in_panel(panel: Control, from_direction: Vector2 = Vector2.RIGHT) -> void:
    var target_pos := panel.position
    panel.position = target_pos + from_direction * 400.0
    panel.modulate.a = 0.0

    var tween := create_tween().set_parallel(true)
    tween.tween_property(panel, "position", target_pos, 0.4) \
        .set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_BACK)
    tween.tween_property(panel, "modulate:a", 1.0, 0.3)
```

### Floating / Bobbing Effect

```gdscript
func start_floating(node: Node2D, amplitude: float = 8.0, period: float = 2.0) -> void:
    var base_y := node.position.y
    var tween := create_tween().set_loops()
    tween.tween_property(node, "position:y", base_y - amplitude, period / 2.0) \
        .set_ease(Tween.EASE_IN_OUT).set_trans(Tween.TRANS_SINE)
    tween.tween_property(node, "position:y", base_y + amplitude, period / 2.0) \
        .set_ease(Tween.EASE_IN_OUT).set_trans(Tween.TRANS_SINE)
```

### Damage Number Popup

```gdscript
func spawn_damage_number(value: int, world_pos: Vector2) -> void:
    var label := Label.new()
    label.text = str(value)
    label.global_position = world_pos
    label.z_index = 100
    add_child(label)

    var tween := create_tween().set_parallel(true)
    tween.tween_property(label, "position:y", world_pos.y - 60.0, 0.8) \
        .set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
    tween.tween_property(label, "modulate:a", 0.0, 0.4) \
        .set_delay(0.4)
    tween.chain().tween_callback(label.queue_free)
```

---

## 6. Tween Lifecycle and Management

### Automatic Cleanup

Tweens bound to a node (via `create_tween()`) are automatically killed when the node exits the tree. Tweens bound to the SceneTree persist until they finish or are manually killed.

### Killing Active Tweens

A common bug is stacking tweens — e.g., calling a tween animation every frame. Always kill previous tweens before creating new ones on the same property:

```gdscript
var _active_tween: Tween

func animate_to(target: Vector2) -> void:
    if _active_tween and _active_tween.is_valid():
        _active_tween.kill()
    _active_tween = create_tween()
    _active_tween.tween_property(self, "position", target, 0.3)
```

### Looping

```gdscript
# Loop forever
var tween := create_tween().set_loops()

# Loop 3 times
var tween := create_tween().set_loops(3)
```

### Pausing and Resuming

```gdscript
tween.pause()
tween.play()

# Process mode — tweens respect pause by default
# Use set_process_mode to run during pause (for pause menus):
var tween := create_tween()
tween.set_process_mode(Tween.TWEEN_PROCESS_IDLE)  # Pauses with tree (default)
tween.set_process_mode(Tween.TWEEN_PROCESS_PHYSICS)  # Runs in physics step
```

### Tween Signals

```gdscript
var tween := create_tween()
tween.tween_property(self, "position:x", 500.0, 1.0)
tween.finished.connect(on_tween_finished)

# Or with a lambda
tween.finished.connect(func(): print("Animation complete!"))

# Each step also emits step_finished(idx: int)
tween.step_finished.connect(func(idx): print("Step %d done" % idx))
```

---

## 7. Procedural Animation Patterns

### Spring Animation

For physics-like spring motion that responds to changing targets:

```gdscript
class_name SpringAnimation
extends Node

@export var stiffness: float = 300.0
@export var damping: float = 20.0

var velocity: float = 0.0
var current: float = 0.0
var target: float = 0.0

func _physics_process(delta: float) -> void:
    var force := stiffness * (target - current) - damping * velocity
    velocity += force * delta
    current += velocity * delta
```

### Smooth Damp (Unity-style)

```gdscript
## Attempt a smooth-damp towards a target value. Returns [new_value, new_velocity].
static func smooth_damp(
    current: float, target: float, velocity: float,
    smooth_time: float, delta: float, max_speed: float = INF
) -> Array[float]:
    smooth_time = maxf(0.0001, smooth_time)
    var omega := 2.0 / smooth_time
    var x := omega * delta
    var exp_factor := 1.0 / (1.0 + x + 0.48 * x * x + 0.235 * x * x * x)
    var change := current - target
    var max_change := max_speed * smooth_time
    change = clampf(change, -max_change, max_change)
    var temp := (velocity + omega * change) * delta
    velocity = (velocity - omega * temp) * exp_factor
    var output := (current - change) + (change + temp) * exp_factor
    return [output, velocity]
```

### Squash and Stretch

```gdscript
func squash_and_stretch(node: Node2D, impact_direction: Vector2 = Vector2.DOWN) -> void:
    var tween := create_tween()
    var squash: Vector2
    var stretch: Vector2

    if abs(impact_direction.x) > abs(impact_direction.y):
        squash = Vector2(0.7, 1.3)
        stretch = Vector2(1.1, 0.95)
    else:
        squash = Vector2(1.3, 0.7)
        stretch = Vector2(0.95, 1.1)

    tween.tween_property(node, "scale", squash, 0.05)
    tween.tween_property(node, "scale", stretch, 0.1) \
        .set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_ELASTIC)
    tween.tween_property(node, "scale", Vector2.ONE, 0.15) \
        .set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
```

---

## 8. Integrating with Signals and Coroutines

### Awaiting Tweens

Tweens emit `finished` when all tweeners complete, making them ideal for `await`:

```gdscript
func death_animation() -> void:
    var tween := create_tween().set_parallel(true)
    tween.tween_property($Sprite2D, "modulate:a", 0.0, 0.5)
    tween.tween_property($Sprite2D, "scale", Vector2.ZERO, 0.5) \
        .set_ease(Tween.EASE_IN).set_trans(Tween.TRANS_BACK)
    await tween.finished
    queue_free()
```

### Chaining Multiple Awaited Sequences

```gdscript
func cutscene_sequence() -> void:
    # Phase 1: Character walks in
    var walk_tween := create_tween()
    walk_tween.tween_property($NPC, "position:x", 400.0, 2.0)
    await walk_tween.finished

    # Phase 2: Dialogue
    $DialogueBox.show_text("Hello!")
    await $DialogueBox.dialogue_finished

    # Phase 3: Character walks out
    var exit_tween := create_tween()
    exit_tween.tween_property($NPC, "position:x", -100.0, 1.5)
    await exit_tween.finished
```

---

## 9. Reusable Tween Libraries

### Autoload Pattern

Create an autoload `FX` for common animations:

```gdscript
# fx.gd — Add as autoload "FX"
extends Node

func flash(node: CanvasItem, color: Color = Color.WHITE, duration: float = 0.15) -> Tween:
    var tween := node.create_tween()
    tween.tween_property(node, "modulate", color, 0.0)
    tween.tween_property(node, "modulate", Color.WHITE, duration)
    return tween

func pop_scale(node: Node2D, target: Vector2 = Vector2(1.2, 1.2), duration: float = 0.2) -> Tween:
    var tween := node.create_tween()
    tween.tween_property(node, "scale", target, duration * 0.4) \
        .set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_BACK)
    tween.tween_property(node, "scale", Vector2.ONE, duration * 0.6) \
        .set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
    return tween

func fade_out(node: CanvasItem, duration: float = 0.3, free_after: bool = false) -> Tween:
    var tween := node.create_tween()
    tween.tween_property(node, "modulate:a", 0.0, duration)
    if free_after:
        tween.tween_callback(node.queue_free)
    return tween

func slide_to(node: Control, target_pos: Vector2, duration: float = 0.3) -> Tween:
    var tween := node.create_tween()
    tween.tween_property(node, "position", target_pos, duration) \
        .set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
    return tween
```

Usage:

```gdscript
await FX.flash($Sprite2D).finished
FX.pop_scale($CoinIcon)
FX.fade_out($DeadEnemy, 0.5, true)
```

---

## 10. C# Examples

### Basic Tween in C#

```csharp
public partial class Player : CharacterBody2D
{
    private Tween _activeTween;

    public void AnimateTo(Vector2 target)
    {
        _activeTween?.Kill();
        _activeTween = CreateTween();
        _activeTween.TweenProperty(this, "position", target, 0.5f)
            .SetEase(Tween.EaseType.Out)
            .SetTrans(Tween.TransitionType.Cubic);
    }

    public async void DeathAnimation()
    {
        var tween = CreateTween().SetParallel(true);
        tween.TweenProperty(GetNode("Sprite2D"), "modulate:a", 0.0f, 0.5f);
        tween.TweenProperty(GetNode("Sprite2D"), "scale", Vector2.Zero, 0.5f)
            .SetEase(Tween.EaseType.In)
            .SetTrans(Tween.TransitionType.Back);
        await ToSignal(tween, Tween.SignalName.Finished);
        QueueFree();
    }
}
```

### Reusable Extension Methods

```csharp
public static class TweenExtensions
{
    public static Tween Flash(this Node node, Color? color = null, float duration = 0.15f)
    {
        var flashColor = color ?? Colors.White;
        var tween = node.CreateTween();
        tween.TweenProperty(node, "modulate", flashColor, 0.0f);
        tween.TweenProperty(node, "modulate", Colors.White, duration);
        return tween;
    }

    public static Tween PopScale(this Node2D node, float scale = 1.2f, float duration = 0.2f)
    {
        var tween = node.CreateTween();
        tween.TweenProperty(node, "scale", Vector2.One * scale, duration * 0.4f)
            .SetEase(Tween.EaseType.Out)
            .SetTrans(Tween.TransitionType.Back);
        tween.TweenProperty(node, "scale", Vector2.One, duration * 0.6f)
            .SetEase(Tween.EaseType.Out)
            .SetTrans(Tween.TransitionType.Cubic);
        return tween;
    }
}
```

---

## 11. Performance Considerations

### Tween Count

Each active tween has minimal overhead, but thousands of simultaneous tweens (e.g., tweening every particle individually) will degrade performance. For mass animations, prefer:
- **GPUParticles2D/3D** for visual effects
- **Shader-based animation** for uniform property changes
- **MultiMeshInstance2D** with a shader for thousands of instances

### Process Mode

- `TWEEN_PROCESS_IDLE` (default) — runs in `_process()`, affected by time scale
- `TWEEN_PROCESS_PHYSICS` — runs in `_physics_process()`, better for gameplay-affecting animations

### Avoiding Tween Stacking

The most common performance issue is creating new tweens without killing old ones. Every `create_tween()` call allocates a new tween. If called every frame, you'll have 60+ tweens fighting over the same property:

```gdscript
# BAD — creates a new tween every _process call
func _process(_delta: float) -> void:
    var tween := create_tween()
    tween.tween_property(self, "position", target, 0.3)

# GOOD — reuse or kill the previous tween
var _move_tween: Tween
func move_to(target: Vector2) -> void:
    if _move_tween and _move_tween.is_valid():
        _move_tween.kill()
    _move_tween = create_tween()
    _move_tween.tween_property(self, "position", target, 0.3)
```

---

## 12. Common Pitfalls

### Tween on Freed Node

If a node is freed while its tween is running, the tween is automatically killed (if created with `node.create_tween()`). But a tween created with `get_tree().create_tween()` will **error** if it references a freed node. Always bind tweens to the node they animate unless you have a specific reason not to.

### `from()` Must Be Called on the PropertyTweener

```gdscript
# WRONG — from() is on Tween, not PropertyTweener
tween.from(Color.WHITE).tween_property(...)

# CORRECT — from() is chained on the tweener
tween.tween_property($Sprite, "modulate", Color.WHITE, 0.3).from(Color.RED)
```

### Tweening Physics Properties

Tweening `position` on a `CharacterBody2D` or `RigidBody2D` bypasses the physics engine. For physics bodies, tween a velocity or target variable and apply it in `_physics_process()`.

### Loop + Parallel Gotcha

When using `set_loops()` with `set_parallel(true)`, ALL parallel tweeners must have the same duration, or the loop will restart when the shortest one finishes. Use `tween_interval()` to pad shorter animations.

---

## Summary

Godot 4's Tween API is one of the most versatile tools for adding life to your game. The key patterns to remember:

- **Create → chain tweeners → let it run.** Tweens auto-start and auto-free.
- **Kill before recreating** to avoid stacking bugs.
- **`parallel()` and `chain()`** give you fine-grained control over timing.
- **`await tween.finished`** integrates cleanly with GDScript coroutines.
- **Build a reusable FX autoload** to standardize your animation language.

For hand-authored animations, reach for AnimationPlayer. For everything dynamic — tweens are your tool.
