# G45 — Advanced GDScript Patterns

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript (C# equivalents noted)
> **Related:** [E2 GDScript vs C#](../architecture/E2_gdscript_vs_csharp.md) · [G2 State Machine](./G2_state_machine.md) · [G3 Signal Architecture](./G3_signal_architecture.md) · [G41 Godot 4.4–4.6 Features](./G41_godot_44_to_46_features.md)

---

## What This Guide Covers

GDScript has evolved significantly through Godot 4.x — typed collections, lambdas, coroutines, annotations, and static typing enforcement turn it from a "scripting glue" into a capable language for large projects. But most tutorials stop at the basics. This guide covers the patterns and idioms that experienced GDScript developers use to write cleaner, safer, and more maintainable code.

**Use this guide when:** you're comfortable with GDScript fundamentals and want to level up — writing more robust code, using the type system effectively, structuring complex logic with coroutines, and applying patterns that scale to larger projects.

---

## Table of Contents

1. [Static Typing as a Development Strategy](#1-static-typing-as-a-development-strategy)
2. [Typed Collections: Arrays and Dictionaries](#2-typed-collections-arrays-and-dictionaries)
3. [Lambdas and First-Class Functions](#3-lambdas-and-first-class-functions)
4. [Coroutines and Await](#4-coroutines-and-await)
5. [Custom Annotations and Metadata](#5-custom-annotations-and-metadata)
6. [The Signal Bus Pattern](#6-the-signal-bus-pattern)
7. [Resource-Based Data Objects](#7-resource-based-data-objects)
8. [Command Pattern](#8-command-pattern)
9. [Object Pooling in GDScript](#9-object-pooling-in-gdscript)
10. [Builder and Configuration Patterns](#10-builder-and-configuration-patterns)
11. [Error Handling Patterns](#11-error-handling-patterns)
12. [Enum-Driven Architecture](#12-enum-driven-architecture)
13. [Static Typing Enforcement](#13-static-typing-enforcement)
14. [C# Equivalents](#14-c-equivalents)
15. [Common Mistakes](#15-common-mistakes)

---

## 1. Static Typing as a Development Strategy

GDScript's type system is **gradual** — you can mix typed and untyped code. The best strategy is to type everything at the boundaries (function signatures, class variables) and let inference handle the rest.

### Why Bother

- **Catch bugs at write-time:** The editor underlines type errors instantly
- **Better autocompletion:** The editor knows the type, so it can suggest methods
- **Performance:** Typed code generates faster bytecode (Godot can skip runtime type checks)
- **Documentation:** Types are self-documenting

### Type Everything That Matters

```gdscript
# BAD — no type info, editor can't help you
var health = 100
var items = []
func take_damage(amount):
    health -= amount

# GOOD — typed, self-documenting, catches errors
var health: int = 100
var items: Array[Item] = []
func take_damage(amount: int) -> void:
    health -= amount
```

### Return Type Annotations

Always annotate return types. `-> void` is not optional noise — it tells the compiler (and your team) that the function doesn't return anything:

```gdscript
func get_damage() -> int:
    return base_damage + bonus_damage

func apply_effect(effect: StatusEffect) -> void:
    active_effects.append(effect)

func find_nearest_enemy() -> Enemy:  # Can return null
    # ...
    return nearest

func try_find_nearest_enemy() -> Enemy:  # Nullable return
    if enemies.is_empty():
        return null
    return enemies[0]
```

### Type Inference with `:=`

Use `:=` when the type is obvious from the right-hand side:

```gdscript
# Type is inferred as float
var speed := 200.0

# Type is inferred as PackedScene
var bullet_scene := preload("res://bullet.tscn")

# Type is inferred as Array[int]
var scores := [100, 200, 300]

# DON'T use := when the type isn't obvious
var data := get_data()  # What type is this? Use explicit annotation
var data: PlayerData = get_data()  # Clear
```

---

## 2. Typed Collections: Arrays and Dictionaries

### Typed Arrays (Godot 4.0+)

Typed arrays enforce element types at runtime and enable better editor support:

```gdscript
var enemies: Array[Enemy] = []
var scores: Array[int] = []
var waypoints: Array[Vector2] = []

# Compile-time error: can't append a String to Array[int]
scores.append("hello")  # ERROR

# Works with custom classes
class_name Inventory
var items: Array[Item] = []

func add_item(item: Item) -> void:
    items.append(item)

func get_weapons() -> Array[Item]:
    return items.filter(func(i: Item) -> bool: return i.type == Item.Type.WEAPON)
```

### Typed Dictionaries (Godot 4.4+)

One of the most requested features — dictionaries can now enforce key and value types:

```gdscript
# String keys, int values
var score_table: Dictionary[String, int] = {}

# StringName keys (faster lookups), Resource values
var asset_cache: Dictionary[StringName, Resource] = {}

# Enum keys for type-safe lookups
enum Stat { HEALTH, MANA, STRENGTH, AGILITY }
var stats: Dictionary[Stat, int] = {
    Stat.HEALTH: 100,
    Stat.MANA: 50,
    Stat.STRENGTH: 10,
    Stat.AGILITY: 8,
}

# Compile-time error: wrong value type
stats[Stat.HEALTH] = "full"  # ERROR — expected int
```

### When to Use Which

| Use Case | Collection | Why |
|----------|-----------|-----|
| Ordered list of same-type items | `Array[T]` | Type safety + index access |
| Key-value lookup with known types | `Dictionary[K, V]` | Type safety on both sides |
| Heterogeneous data (JSON-like) | `Dictionary` (untyped) | Flexibility for dynamic data |
| Fixed-size numeric data | `PackedFloat64Array` etc. | Memory efficient, fast iteration |

---

## 3. Lambdas and First-Class Functions

GDScript treats functions as first-class values. Lambdas are anonymous functions defined inline.

### Basic Lambdas

```gdscript
# Simple lambda
var double := func(x: int) -> int: return x * 2

# Multi-line lambda
var process_item := func(item: Item) -> void:
    item.durability -= 1
    if item.durability <= 0:
        item.queue_free()

# Call a lambda
var result: int = double.call(5)  # 10
```

### Lambdas with Collection Methods

Lambdas shine with `filter()`, `map()`, `reduce()`, and `any()`:

```gdscript
var enemies: Array[Enemy] = get_all_enemies()

# Filter to alive enemies within range
var nearby_alive: Array[Enemy] = enemies.filter(
    func(e: Enemy) -> bool:
        return e.is_alive() and e.global_position.distance_to(position) < 200.0
)

# Map to health values
var health_values: Array[int] = enemies.map(
    func(e: Enemy) -> int: return e.health
)

# Check if any enemy is aggro'd
var any_aggro: bool = enemies.any(
    func(e: Enemy) -> bool: return e.state == Enemy.State.AGGRO
)

# Sum all damage
var total_damage: int = damage_numbers.reduce(
    func(acc: int, val: int) -> int: return acc + val, 0
)
```

### Named Lambdas for Debugging

Lambda stack traces show `<anonymous lambda>` by default. Name them for better debugging:

```gdscript
# Named lambda — shows "damage_filter" in stack traces
var damage_filter := func damage_filter(e: Enemy) -> bool:
    return e.health < e.max_health
```

### Capturing Variables

Lambdas capture variables from their enclosing scope by reference:

```gdscript
func create_damage_dealer(base_damage: int) -> Callable:
    var multiplier := 1.0
    return func(target: Enemy) -> void:
        # Captures base_damage and multiplier
        target.take_damage(int(base_damage * multiplier))

var deal_fire_damage := create_damage_dealer(25)
deal_fire_damage.call(some_enemy)
```

> **Caveat:** Captured variables are references. If the outer scope changes the variable, the lambda sees the new value. This can cause subtle bugs in loops.

### Connecting Signals with Lambdas

```gdscript
# Instead of a dedicated method for a one-off connection
button.pressed.connect(func() -> void:
    print("Button pressed!")
    menu.visible = false
)

# With arguments
health_bar.value_changed.connect(func(new_value: float) -> void:
    if new_value <= 0.0:
        die()
)
```

---

## 4. Coroutines and Await

Any function containing `await` becomes a coroutine. Coroutines pause execution and resume when the awaited signal fires or the awaited coroutine completes.

### Awaiting Signals

```gdscript
func play_death_animation() -> void:
    animation_player.play("death")
    await animation_player.animation_finished  # Pauses here
    queue_free()  # Runs after animation completes

func show_dialogue(text: String) -> void:
    dialogue_label.text = text
    dialogue_panel.visible = true
    await dialogue_panel.confirmed  # Custom signal
    dialogue_panel.visible = false
```

### Awaiting Other Coroutines

```gdscript
func cutscene_intro() -> void:
    await camera_pan_to(landmark)
    await show_dialogue("Welcome to the dungeon...")
    await fade_out(0.5)
    start_gameplay()

func camera_pan_to(target: Vector2) -> void:
    var tween := create_tween()
    tween.tween_property(camera, "global_position", target, 1.5)
    await tween.finished
```

### Awaiting Timers

```gdscript
func flash_damage() -> void:
    modulate = Color.RED
    await get_tree().create_timer(0.1).timeout
    modulate = Color.WHITE

# Reusable delay helper
func delay(seconds: float) -> void:
    await get_tree().create_timer(seconds).timeout
```

### Parallel Coroutines

`await` is sequential by default. For parallel operations, fire signals and await them:

```gdscript
func load_level() -> void:
    # Start both operations simultaneously
    var music_loaded := load_music_async()
    var scene_loaded := load_scene_async()
    
    # Wait for both (await the slower one)
    await music_loaded
    await scene_loaded
    
    start_level()
```

### Coroutine Gotchas

```gdscript
# GOTCHA: The caller doesn't wait unless it also uses await
func _ready() -> void:
    play_intro()  # This returns immediately! The coroutine runs in background.
    start_game()  # This runs BEFORE play_intro finishes!
    
    # Fix: await the coroutine
    await play_intro()
    start_game()  # Now this waits

# GOTCHA: Node freed during await
func long_operation() -> void:
    await get_tree().create_timer(5.0).timeout
    # If this node was freed during the 5 seconds, this line crashes!
    position = Vector2.ZERO  # ERROR: node is freed
    
    # Fix: Guard with is_instance_valid
    if not is_instance_valid(self):
        return
    position = Vector2.ZERO
```

---

## 5. Custom Annotations and Metadata

### Export Annotations

Godot 4.x uses `@export` annotations extensively:

```gdscript
@export var speed: float = 200.0
@export_range(0.0, 1.0, 0.01) var friction: float = 0.5
@export var damage_type: DamageType  # Enum dropdown in inspector
@export_file("*.tscn") var next_level: String
@export_dir var save_directory: String
@export_multiline var description: String
@export_color_no_alpha var team_color: Color
@export_node_path("CharacterBody2D") var player_path: NodePath
@export_flags("Fire", "Ice", "Lightning", "Poison") var elements: int

# Export groups organize the inspector
@export_group("Combat")
@export var attack_power: int = 10
@export var defense: int = 5

@export_group("Movement")
@export var move_speed: float = 100.0
@export var jump_height: float = 200.0

@export_subgroup("Advanced")
@export var acceleration: float = 50.0
@export var air_control: float = 0.3
```

### @export_tool_button (Godot 4.4+)

Run editor actions with a single button click in the inspector:

```gdscript
@tool
extends Node3D

@export_tool_button("Generate Terrain") var _gen_terrain = _generate_terrain
@export_tool_button("Clear All") var _clear = _clear_terrain

func _generate_terrain() -> void:
    # Runs in the editor when the button is clicked
    for x in range(100):
        for z in range(100):
            place_tile(x, z, noise.get_noise_2d(x, z))

func _clear_terrain() -> void:
    for child in get_children():
        child.queue_free()
```

### @onready

Defer initialization until the node enters the tree:

```gdscript
# These run AFTER _ready() equivalent — node is in the tree
@onready var sprite: Sprite2D = $Sprite2D
@onready var collision: CollisionShape2D = $CollisionShape2D
@onready var anim: AnimationPlayer = %AnimationPlayer  # Unique name
@onready var health_bar: ProgressBar = %HealthBar

# Pattern: computed @onready
@onready var half_size: Vector2 = sprite.texture.get_size() / 2.0
```

---

## 6. The Signal Bus Pattern

For decoupled communication across unrelated systems, use an autoload as a signal bus:

```gdscript
# events.gd — Autoload (Project Settings → Autoload → Add)
extends Node

signal player_died(player: Player)
signal score_changed(new_score: int)
signal item_collected(item: Item, collector: Node)
signal level_completed(level_id: int, time_seconds: float)
signal dialogue_started(dialogue_id: String)
signal dialogue_ended(dialogue_id: String)
```

```gdscript
# player.gd — Emits events
func die() -> void:
    Events.player_died.emit(self)

# ui.gd — Listens to events (no reference to Player needed)
func _ready() -> void:
    Events.player_died.connect(_on_player_died)
    Events.score_changed.connect(_on_score_changed)

func _on_player_died(player: Player) -> void:
    game_over_screen.show()
```

### When to Use Signals vs. Direct Calls

| Pattern | Use When |
|---------|----------|
| Direct method call | Caller knows the receiver, tight coupling is fine (parent → child) |
| Node signal | One-to-many communication within a scene tree branch |
| Signal bus | Cross-system communication (UI ↔ gameplay, audio ↔ events) |
| `Callable` / lambda | Passing behavior as data (strategies, callbacks) |

---

## 7. Resource-Based Data Objects

Custom `Resource` subclasses are GDScript's equivalent of data classes / scriptable objects:

```gdscript
# item_data.gd
class_name ItemData
extends Resource

enum Rarity { COMMON, UNCOMMON, RARE, EPIC, LEGENDARY }

@export var name: String
@export var icon: Texture2D
@export_multiline var description: String
@export var rarity: Rarity = Rarity.COMMON
@export var stack_size: int = 1
@export var value: int = 0
@export var tags: Array[StringName] = []
```

Create instances in the editor (right-click in FileSystem → New Resource → ItemData) or in code:

```gdscript
var sword := ItemData.new()
sword.name = "Iron Sword"
sword.rarity = ItemData.Rarity.UNCOMMON
sword.value = 50

# Save to disk
ResourceSaver.save(sword, "res://data/items/iron_sword.tres")

# Load from disk
var loaded_sword: ItemData = load("res://data/items/iron_sword.tres")
```

### Nested Resources

```gdscript
# loot_table.gd
class_name LootTable
extends Resource

@export var entries: Array[LootEntry] = []

func roll() -> ItemData:
    var total_weight: float = entries.reduce(
        func(acc: float, e: LootEntry) -> float: return acc + e.weight, 0.0
    )
    var roll := randf() * total_weight
    for entry in entries:
        roll -= entry.weight
        if roll <= 0.0:
            return entry.item
    return entries[-1].item

# loot_entry.gd
class_name LootEntry
extends Resource

@export var item: ItemData
@export_range(0.0, 100.0) var weight: float = 1.0
```

---

## 8. Command Pattern

Useful for undo/redo, input replay, and decoupled action execution:

```gdscript
# command.gd
class_name Command
extends RefCounted

func execute() -> void:
    pass

func undo() -> void:
    pass

# move_command.gd
class_name MoveCommand
extends Command

var entity: Node2D
var direction: Vector2
var distance: float

func _init(p_entity: Node2D, p_direction: Vector2, p_distance: float) -> void:
    entity = p_entity
    direction = p_direction
    distance = p_distance

func execute() -> void:
    entity.position += direction * distance

func undo() -> void:
    entity.position -= direction * distance

# command_history.gd — Autoload or component
class_name CommandHistory
extends Node

var history: Array[Command] = []
var redo_stack: Array[Command] = []

func execute(command: Command) -> void:
    command.execute()
    history.append(command)
    redo_stack.clear()

func undo() -> void:
    if history.is_empty():
        return
    var command := history.pop_back()
    command.undo()
    redo_stack.append(command)

func redo() -> void:
    if redo_stack.is_empty():
        return
    var command := redo_stack.pop_back()
    command.execute()
    history.append(command)
```

---

## 9. Object Pooling in GDScript

Avoid `instantiate()` / `queue_free()` churn for frequently spawned objects (bullets, particles, pickups):

```gdscript
class_name ObjectPool
extends Node

@export var scene: PackedScene
@export var initial_size: int = 20

var _available: Array[Node] = []

func _ready() -> void:
    for i in initial_size:
        var obj := scene.instantiate()
        obj.set_process(false)
        obj.visible = false
        add_child(obj)
        _available.append(obj)

func acquire() -> Node:
    var obj: Node
    if _available.is_empty():
        # Pool exhausted — grow by 1
        obj = scene.instantiate()
        add_child(obj)
    else:
        obj = _available.pop_back()
    obj.set_process(true)
    obj.visible = true
    return obj

func release(obj: Node) -> void:
    obj.set_process(false)
    obj.visible = false
    # Reset state as needed
    if obj is CharacterBody2D:
        obj.velocity = Vector2.ZERO
    _available.append(obj)
```

See [G39 Scalable Architecture & Pooling](./G39_scalable_architecture_and_pooling.md) for more advanced pooling patterns.

---

## 10. Builder and Configuration Patterns

### Fluent Builder

```gdscript
class_name TweenBuilder
extends RefCounted

var _node: Node
var _tween: Tween
var _duration: float = 0.3
var _ease: Tween.EaseType = Tween.EASE_OUT
var _trans: Tween.TransitionType = Tween.TRANS_CUBIC

func _init(node: Node) -> void:
    _node = node

func duration(d: float) -> TweenBuilder:
    _duration = d
    return self

func ease(e: Tween.EaseType) -> TweenBuilder:
    _ease = e
    return self

func transition(t: Tween.TransitionType) -> TweenBuilder:
    _trans = t
    return self

func fade_in() -> Tween:
    _tween = _node.create_tween()
    _tween.tween_property(_node, "modulate:a", 1.0, _duration) \
        .set_ease(_ease).set_trans(_trans) \
        .from(0.0)
    return _tween

func slide_in_from(offset: Vector2) -> Tween:
    _tween = _node.create_tween()
    var target: Vector2 = _node.position
    _node.position = target + offset
    _tween.tween_property(_node, "position", target, _duration) \
        .set_ease(_ease).set_trans(_trans)
    return _tween

# Usage:
# await TweenBuilder.new(panel).duration(0.5).ease(Tween.EASE_IN_OUT).slide_in_from(Vector2(0, 100)).finished
```

---

## 11. Error Handling Patterns

GDScript doesn't have exceptions. Use return values and assertions strategically:

### Assert for Development, Guard for Production

```gdscript
func set_health(value: int) -> void:
    # Fails loudly in debug builds — catches programming errors
    assert(value >= 0, "Health cannot be negative: %d" % value)
    # Fails silently in release builds — guards against edge cases
    health = maxi(value, 0)

func get_item(index: int) -> Item:
    assert(index >= 0 and index < items.size(),
        "Item index out of range: %d (size: %d)" % [index, items.size()])
    if index < 0 or index >= items.size():
        return null
    return items[index]
```

### Result Pattern (for operations that can fail)

```gdscript
class_name Result
extends RefCounted

var value: Variant
var error: String
var ok: bool

static func success(val: Variant = null) -> Result:
    var r := Result.new()
    r.value = val
    r.ok = true
    return r

static func failure(err: String) -> Result:
    var r := Result.new()
    r.error = err
    r.ok = false
    return r

# Usage:
func load_save_file(path: String) -> Result:
    if not FileAccess.file_exists(path):
        return Result.failure("Save file not found: %s" % path)
    var file := FileAccess.open(path, FileAccess.READ)
    if file == null:
        return Result.failure("Cannot open file: %s" % FileAccess.get_open_error())
    var data := file.get_var()
    return Result.success(data)

# Caller:
var result := load_save_file("user://save.dat")
if not result.ok:
    push_warning(result.error)
    return
var save_data = result.value
```

---

## 12. Enum-Driven Architecture

Enums are surprisingly powerful for game state management:

```gdscript
enum State { IDLE, WALK, RUN, JUMP, FALL, ATTACK, HURT, DEAD }

# Transition table — declarative state machine
const TRANSITIONS: Dictionary[State, Array] = {
    State.IDLE: [State.WALK, State.RUN, State.JUMP, State.ATTACK, State.HURT],
    State.WALK: [State.IDLE, State.RUN, State.JUMP, State.ATTACK, State.HURT],
    State.JUMP: [State.FALL, State.HURT],
    State.FALL: [State.IDLE, State.HURT],
    State.ATTACK: [State.IDLE, State.HURT],
    State.HURT: [State.IDLE, State.DEAD],
    State.DEAD: [],
}

var current_state: State = State.IDLE

func transition_to(new_state: State) -> void:
    if new_state not in TRANSITIONS[current_state]:
        push_warning("Invalid transition: %s → %s" % [
            State.keys()[current_state],
            State.keys()[new_state],
        ])
        return
    var old_state := current_state
    current_state = new_state
    _on_state_changed(old_state, new_state)
```

### Flags with Enums

```gdscript
# Bitwise flags for combinable properties
enum DamageType {
    PHYSICAL = 1,
    FIRE = 2,
    ICE = 4,
    LIGHTNING = 8,
    POISON = 16,
}

var resistances: int = DamageType.FIRE | DamageType.ICE

func is_resistant_to(damage_type: int) -> bool:
    return (resistances & damage_type) != 0

func apply_damage(amount: int, type: int) -> void:
    if is_resistant_to(type):
        amount = int(amount * 0.5)
    health -= amount
```

---

## 13. Static Typing Enforcement

### Project-Wide Enforcement

In **Project Settings → GDScript**, configure warnings to enforce static typing:

| Setting | Recommended Value | Effect |
|---------|------------------|--------|
| `Untyped Declaration` | **Warning** or **Error** | Flags `var x = 5` (should be `var x: int = 5`) |
| `Inferred Declaration` | Allow | Permits `var x := 5` |
| `Unsafe Property Access` | **Warning** | Flags property access on untyped variables |
| `Unsafe Method Access` | **Warning** | Flags method calls on untyped variables |
| `Unsafe Cast` | **Warning** | Flags unchecked type casts |
| `Unsafe Call Argument` | **Warning** | Flags wrong-type arguments |
| `Return Value Discarded` | **Warning** | Flags ignored return values |

### Gradual Adoption

For existing projects, enable warnings (not errors) first. Fix the easy ones, then tighten over time:

1. **Week 1:** Set `Untyped Declaration` to Warning. Add types to new code.
2. **Week 2:** Fix warnings in core systems (player, combat, inventory).
3. **Week 3:** Promote to Error. Remaining untyped code breaks the build.

---

## 14. C# Equivalents

| GDScript Pattern | C# Equivalent |
|------------------|--------------|
| `Array[Enemy]` | `Godot.Collections.Array<Enemy>` or `List<Enemy>` |
| `Dictionary[String, int]` | `Godot.Collections.Dictionary<string, int>` |
| Lambda `func(x): return x * 2` | `x => x * 2` |
| `await signal` | `await ToSignal(obj, "signal_name")` |
| `@export` | `[Export]` attribute |
| `@onready` | Lazy initialization in `_Ready()` |
| Signal bus autoload | Static events class or dependency injection |
| `class_name Resource` | `partial class MyResource : Resource` |

---

## 15. Common Mistakes

| Mistake | Why It's Bad | Fix |
|---------|-------------|-----|
| Untyped collections everywhere | No editor help, runtime errors | Use `Array[T]` and `Dictionary[K, V]` |
| Lambdas capturing loop variables | All lambdas share the same variable | Capture via parameter default or intermediate variable |
| `await` without validity check | Node freed during await → crash | Guard with `is_instance_valid(self)` after await |
| Forgetting `-> void` return types | Compiler can't verify you don't accidentally return | Always annotate return types |
| Giant autoload scripts | God objects that everything depends on | Split into focused autoloads or use signal bus pattern |
| Nested signals (`signal.connect(func(): signal2.connect(...))`) | Hard to debug, potential memory leaks | Use intermediate methods with clear names |
| Using `Variant` when a concrete type works | Loses all type safety | Only use `Variant` at serialization boundaries |
| `@onready` with `@tool` scripts | `@onready` doesn't run in `_init()` — tool scripts may access before ready | Guard with null checks in tool mode |
