# Godot 4.x — AI Code Generation Rules

Engine-specific rules for Godot 4.4+ projects using GDScript. These supplement the engine-agnostic rules in `docs/core/ai-workflow/gamedev-rules.md`.

---

## ⚠️ Godot 3 vs 4 — Critical Differences

Godot 4 was a ground-up rewrite. Most online tutorials, StackOverflow answers, and AI training data contain Godot 3 code. **Always use Godot 4 syntax.**

### Renames That Break Everything

| Godot 3 (WRONG) | Godot 4 (CORRECT) |
|------------------|--------------------|
| `KinematicBody2D` | `CharacterBody2D` |
| `KinematicBody` | `CharacterBody3D` |
| `Spatial` | `Node3D` |
| `MeshInstance` | `MeshInstance3D` |
| `RigidBody` | `RigidBody3D` |
| `StaticBody` | `StaticBody3D` |
| `Area` | `Area3D` |
| `RayCast` | `RayCast3D` |
| `Camera` | `Camera3D` |
| `Light` | `Light3D` (and subtypes) |
| `TileMap` | `TileMapLayer` (4.3+) |
| `Navigation2DServer` | `NavigationServer2D` |
| `VisualServer` | `RenderingServer` |
| `export var` | `@export var` |
| `onready var` | `@onready var` |
| `yield(...)` | `await ...` |
| `connect("signal", obj, "method")` | `signal_name.connect(callable)` |
| `move_and_slide(velocity, up)` | `move_and_slide()` (uses `velocity` property) |
| `instance()` | `instantiate()` |

### Syntax Patterns That Changed

```gdscript
# GODOT 3 (WRONG):
export var speed = 200
onready var sprite = $Sprite
yield(get_tree().create_timer(1.0), "timeout")
var velocity = move_and_slide(velocity, Vector2.UP)
var enemy = enemy_scene.instance()
connect("body_entered", self, "_on_body_entered")

# GODOT 4 (CORRECT):
@export var speed: float = 200.0
@onready var sprite: Sprite2D = $Sprite2D
await get_tree().create_timer(1.0).timeout
velocity.x = speed  # set the built-in velocity property
move_and_slide()     # uses self.velocity automatically
var enemy: CharacterBody2D = enemy_scene.instantiate()
body_entered.connect(_on_body_entered)
```

---

## Architecture Rules

### Node Tree Structure

Every scene should follow a predictable structure:

```
CharacterBody2D (root — physics body)
├── Sprite2D (or AnimatedSprite2D)
├── CollisionShape2D (required for physics)
├── AnimationPlayer (optional)
├── [Functional child nodes]
└── [Component scenes]
```

**Rules:**
- The root node type determines the scene's physics behavior.
- `CollisionShape2D`/`CollisionShape3D` must be a direct child of the physics body.
- One script per root node (logic), additional scripts on child components only.

### Scene Composition

```gdscript
# CORRECT: Compose functionality via child scenes
# player.tscn contains:
#   CharacterBody2D (player.gd)
#     ├── HealthComponent (health_component.tscn)
#     ├── HitboxComponent (hitbox_component.tscn)
#     └── StateMachine (state_machine.tscn)

# WRONG: Giant monolithic script with all logic
# player.gd with 800 lines handling health, combat, movement, animation, inventory...
```

**Rule:** If a script exceeds ~200 lines, extract subsystems into component scenes.

### Signals Over Direct References

```gdscript
# CORRECT: Signal-driven communication
# health_component.gd
signal died
signal health_changed(new_health: int)

# In parent scene wiring:
func _ready() -> void:
    $HealthComponent.died.connect(_on_died)

# WRONG: Tight coupling via node paths
func take_damage(amount: int) -> void:
    get_node("../../UI/HealthBar").value -= amount  # Fragile!
    get_node("/root/Main/GameManager").check_death()  # Global path = brittle
```

**Rules:**
- Never use absolute paths (`/root/...`) except for Autoloads.
- Minimize relative paths that go up (`../../`). If you need to reach a distant node, use signals or groups.
- Children emit signals upward. Parents connect children together. This is the Godot communication flow.

### Autoloads (Singletons)

```gdscript
# CORRECT: Lean autoload with focused responsibility
# events.gd (Autoload: "Events")
extends Node

signal player_died
signal score_changed(new_score: int)
signal item_collected(item: ItemData)
```

**Rules:**
- Maximum 5 autoloads for most projects.
- Autoload scripts should be short — they're coordination points, not dumping grounds.
- Register in Project Settings → Autoload, access by name: `Events.player_died.emit()`.

---

## GDScript Code Standards

### Type Hints (Mandatory)

Always use static typing. It catches errors at parse time, enables autocompletion, and improves GDScript performance.

```gdscript
# CORRECT: Fully typed
var speed: float = 200.0
var health: int = 100
var is_alive: bool = true
var target: CharacterBody2D = null
var items: Array[ItemData] = []
var stats: Dictionary = {}

func take_damage(amount: int) -> void:
    health -= amount

func get_direction() -> Vector2:
    return Input.get_vector("move_left", "move_right", "move_up", "move_down")

func find_nearest_enemy(radius: float) -> CharacterBody2D:
    # ...
    return nearest

# WRONG: Untyped (Godot 3 style)
var speed = 200
var health = 100
func take_damage(amount):
    health -= amount
```

### Export Variables

```gdscript
# Use typed exports with hints for editor usability
@export var max_health: int = 100
@export var move_speed: float = 200.0
@export var jump_force: float = -400.0
@export var damage: int = 10
@export var attack_cooldown: float = 0.5

# Range hints for the Inspector slider
@export_range(0.0, 1.0, 0.05) var friction: float = 0.2
@export_range(1, 10) var level: int = 1

# Resource references
@export var weapon_data: WeaponData
@export var death_effect: PackedScene
@export var hit_sound: AudioStream

# Enum exports
@export_enum("Idle", "Patrol", "Chase", "Attack") var default_state: String = "Idle"

# Category grouping
@export_group("Movement")
@export var walk_speed: float = 100.0
@export var run_speed: float = 200.0
@export_group("Combat")
@export var attack_damage: int = 10
@export var attack_range: float = 50.0
```

### Naming Conventions

| Element | Convention | Example |
|---------|-----------|---------|
| Variables, functions | `snake_case` | `move_speed`, `take_damage()` |
| Constants | `UPPER_SNAKE_CASE` | `MAX_HEALTH`, `GRAVITY` |
| Classes | `PascalCase` | `HealthComponent`, `StateMachine` |
| Signals | `snake_case` (past tense) | `health_changed`, `died`, `item_picked_up` |
| Nodes in editor | `PascalCase` | `Player`, `HealthBar`, `SpawnPoint` |
| File names | `snake_case` | `player.gd`, `health_component.gd` |
| Scene files | `snake_case` | `player.tscn`, `main_menu.tscn` |
| Resource files | `snake_case` | `iron_sword.tres`, `goblin_data.tres` |
| Folders | `snake_case` | `characters/`, `ui/`, `levels/` |

### Signal Callback Naming

```gdscript
# Convention: _on_<NodeName>_<signal_name>
func _on_player_health_changed(new_health: int) -> void:
    pass

func _on_enemy_died() -> void:
    pass

# For self-connections (same node): _on_<signal_name>
func _on_body_entered(body: Node2D) -> void:
    pass
```

---

## Movement Patterns

### Platformer (CharacterBody2D)

```gdscript
extends CharacterBody2D

@export var speed: float = 200.0
@export var jump_force: float = -400.0
@export var gravity: float = 980.0

func _physics_process(delta: float) -> void:
    # Gravity
    if not is_on_floor():
        velocity.y += gravity * delta

    # Jump
    if Input.is_action_just_pressed("jump") and is_on_floor():
        velocity.y = jump_force

    # Horizontal movement
    var direction: float = Input.get_axis("move_left", "move_right")
    velocity.x = direction * speed

    move_and_slide()
```

### Top-Down (CharacterBody2D)

```gdscript
extends CharacterBody2D

@export var speed: float = 150.0

func _physics_process(_delta: float) -> void:
    var direction: Vector2 = Input.get_vector(
        "move_left", "move_right", "move_up", "move_down"
    )
    velocity = direction * speed
    move_and_slide()
```

**Rules:**
- Always use `_physics_process()` for movement, never `_process()`.
- Always call `move_and_slide()` with no arguments (Godot 4 uses the `velocity` property).
- Use `is_on_floor()`, `is_on_wall()`, `is_on_ceiling()` AFTER `move_and_slide()`.
- Use `Input.get_axis()` and `Input.get_vector()` — they handle dead zones and normalization.

---

## Custom Resources

```gdscript
# Define a resource class
class_name WeaponData
extends Resource

@export var weapon_name: String
@export var damage: int = 10
@export var attack_speed: float = 1.0
@export var projectile_scene: PackedScene
@export var swing_sound: AudioStream
@export var icon: Texture2D
```

**Rules:**
- Save as `.tres` (text format, VCS-friendly) during development.
- Use `class_name` so the resource appears in the editor's "New Resource" menu.
- Reference resources via `@export var data: WeaponData` on nodes — drag-and-drop in Inspector.
- Never hardcode data that could be a resource. If you're writing `var damage = 10` in a weapon script, it should be `weapon_data.damage`.

---

## Common Patterns

### Timer Usage

```gdscript
# One-shot timer (preferred for simple delays)
await get_tree().create_timer(1.5).timeout

# Reusable Timer node (for recurring events)
@onready var attack_timer: Timer = $AttackTimer

func _ready() -> void:
    attack_timer.timeout.connect(_on_attack_timer_timeout)

func attack() -> void:
    if attack_timer.is_stopped():
        # perform attack
        attack_timer.start()

func _on_attack_timer_timeout() -> void:
    can_attack = true
```

### Tweens

```gdscript
# Programmatic animation — fire and forget
func flash_red() -> void:
    var tween: Tween = create_tween()
    tween.tween_property($Sprite2D, "modulate", Color.RED, 0.1)
    tween.tween_property($Sprite2D, "modulate", Color.WHITE, 0.1)

func move_to(target: Vector2) -> void:
    var tween: Tween = create_tween()
    tween.tween_property(self, "global_position", target, 0.5) \
        .set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
```

### Groups

```gdscript
# Add nodes to groups in editor or code
add_to_group("enemies")

# Call method on all group members
get_tree().call_group("enemies", "take_damage", 50)

# Get all nodes in group
var enemies: Array[Node] = get_tree().get_nodes_in_group("enemies")
```

### Object Pooling

```gdscript
# pool.gd — Simple node pool
class_name NodePool
extends Node

@export var scene: PackedScene
@export var initial_size: int = 20

var _available: Array[Node] = []

func _ready() -> void:
    for i in initial_size:
        var instance: Node = scene.instantiate()
        instance.set_process(false)
        instance.hide()
        add_child(instance)
        _available.append(instance)

func get_instance() -> Node:
    if _available.is_empty():
        var instance: Node = scene.instantiate()
        add_child(instance)
        return instance
    var instance: Node = _available.pop_back()
    instance.set_process(true)
    instance.show()
    return instance

func release(instance: Node) -> void:
    instance.set_process(false)
    instance.hide()
    _available.append(instance)
```

---

## File Boundaries

| Directory | Contains | AI Should NOT |
|-----------|----------|---------------|
| `scenes/` | `.tscn` scene files | Create scenes via code (use editor or `instantiate()`) |
| `scripts/` | `.gd` script files | Put data in scripts (use resources) |
| `resources/` | `.tres` data files | Hardcode data that belongs in resources |
| `assets/` | Art, audio, fonts | Modify binary assets |
| `addons/` | Third-party plugins | Edit addon internals |
| `autoloads/` | Global singleton scripts | Put game logic in autoloads |
| `project.godot` | Project settings | Edit manually (use Project Settings UI) |

---

## Build and Run Commands

```bash
# Run the project from command line (useful for CI)
godot --path /path/to/project

# Run a specific scene
godot --path /path/to/project res://scenes/levels/main_menu.tscn

# Export (requires export presets configured in editor)
godot --headless --export-release "Linux/X11" builds/game.x86_64
godot --headless --export-release "Windows Desktop" builds/game.exe
godot --headless --export-release "Web" builds/index.html

# Run tests (with GdUnit4 or GUT)
godot --headless --script res://addons/gut/gut_cmdln.gd

# Validate project (check for errors without running)
godot --headless --check-only --script res://scripts/main.gd
```

---

## Performance Rules

- Use `_physics_process()` for gameplay logic (fixed timestep). Use `_process()` for visual-only updates (camera smoothing, UI animations).
- Use `StringName` for frequently compared strings: `const IDLE: StringName = &"idle"`.
- Prefer `@onready` over `get_node()` in `_ready()` — same result, cleaner code.
- Avoid `get_node()` in `_process()` or `_physics_process()` — cache node references.
- Use typed arrays (`Array[Enemy]`) when possible — faster iteration.
- For heavy computation (pathfinding 100+ agents, procedural generation): consider `WorkerThreadPool`, C# scripts, or GDExtension.
- Don't create new `Tween` objects every frame — check if one is running first.
- Use object pooling for anything spawned/destroyed frequently (bullets, particles, effects).

---

## Integration with Core Rules

These Godot rules build on top of the core rules. Specifically:

- **Code generation principles** from core rules apply — small scripts, focused scenes, one concern per script.
- **Art pipeline rules** from core rules apply — Godot imports from `assets/` automatically, use `.import` files for settings.
- **Scope control** from core rules applies — use built-in nodes before writing custom solutions.
- **Task structure** from core rules applies — tasks should be completable in one session.

When core rules and Godot rules could conflict, Godot rules take precedence for Godot projects.
