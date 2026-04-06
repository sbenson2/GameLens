# G1 — Scene Composition
> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript  
> **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G3 Signal Architecture](./G3_signal_architecture.md) · [G4 Input Handling](./G4_input_handling.md)

---

## What This Guide Covers

Scene composition is Godot's primary architecture pattern — how you build complex game objects from simple, reusable parts. This guide covers how to structure scenes, when to nest vs inherit, and how to build a real project from composable pieces.

If you're coming from Unity: scenes replace prefabs, nested scenes replace component stacking, and the scene tree replaces the hierarchy panel.

If you're coming from ECS (MonoGame, Bevy): scenes replace entity archetypes, child nodes replace components, and scripts replace systems — but the thinking is different. Read [E1](../architecture/E1_architecture_overview.md) first.

---

## The Core Idea

Everything in Godot is a node. Nodes form trees. You save a tree as a scene (`.tscn`). You can put scenes inside other scenes. That's it — that's the architecture.

```
# A "Player" scene (player.tscn)
CharacterBody2D          ← Root node, physics body
├── Sprite2D             ← Visual representation
├── CollisionShape2D     ← Physics collision
├── AnimationPlayer      ← Sprite animations
├── CoyoteTimer (Timer)  ← Jump grace period
├── HurtboxArea (Area2D) ← Damage detection
│   └── CollisionShape2D
└── StateMachine (Node)  ← Behavior controller
    ├── Idle (Node)
    ├── Run (Node)
    ├── Jump (Node)
    └── Fall (Node)
```

This entire tree is saved as `player.tscn`. To add a player to a level, you instance this scene — all 10+ nodes come as one unit.

---

## Designing Scenes: The Three Questions

When creating a new game object, ask:

### 1. What is the physics behavior?

This determines the **root node type**:

| Root Node | Use When |
|-----------|----------|
| `CharacterBody2D` | Player, enemies, NPCs — things that move and collide |
| `RigidBody2D` | Physics-driven objects — crates, balls, ragdolls |
| `StaticBody2D` | Walls, floors, platforms — things that don't move |
| `Area2D` | Triggers, pickups, detection zones — things that detect overlap |
| `Node2D` | Visual-only objects, containers, organizational nodes |
| `Control` | UI elements — menus, HUD, panels |

### 2. What does it need to function?

Add child nodes for each capability:

| Capability | Node Type |
|-----------|-----------|
| Visible sprite | `Sprite2D` or `AnimatedSprite2D` |
| Physics collision | `CollisionShape2D` (child of physics body) |
| Animations | `AnimationPlayer` or `AnimationTree` |
| Damage detection | `Area2D` with `CollisionShape2D` |
| Sound effects | `AudioStreamPlayer2D` |
| Navigation | `NavigationAgent2D` |
| Light emission | `PointLight2D` |
| Particle effects | `GPUParticles2D` |
| Timer-based logic | `Timer` |

### 3. What reusable behaviors does it need?

This is where **nested scenes** (component scenes) come in:

```
# Instead of one giant enemy script, compose from reusable scenes:
Enemy (CharacterBody2D)         ← enemy.tscn
├── Sprite2D
├── CollisionShape2D
├── HealthComponent             ← health_component.tscn (reusable)
├── HitboxComponent             ← hitbox_component.tscn (reusable)
├── HurtboxComponent            ← hurtbox_component.tscn (reusable)
├── DropTableComponent          ← drop_table_component.tscn (reusable)
├── NavigationAgent2D
└── StateMachine                ← state_machine.tscn (reusable)
    ├── Idle
    ├── Patrol
    └── Chase
```

The `HealthComponent` scene can be dropped into any entity — player, enemy, destructible crate, boss. Write the health logic once, reuse everywhere.

---

## Building Component Scenes

A component scene is a small, focused scene that provides one capability.

### Health Component

```
# health_component.tscn
HealthComponent (Node)      ← Root, with script
```

```gdscript
# health_component.gd
class_name HealthComponent
extends Node

signal health_changed(new_health: int, max_health: int)
signal died

@export var max_health: int = 100

var current_health: int

func _ready() -> void:
    current_health = max_health

func take_damage(amount: int) -> void:
    current_health = maxi(current_health - amount, 0)
    health_changed.emit(current_health, max_health)
    if current_health <= 0:
        died.emit()

func heal(amount: int) -> void:
    current_health = mini(current_health + amount, max_health)
    health_changed.emit(current_health, max_health)

func is_alive() -> bool:
    return current_health > 0
```

### Hitbox Component (Deals Damage)

```
# hitbox_component.tscn
HitboxComponent (Area2D)    ← Root, with script
└── CollisionShape2D        ← Define the attack area
```

```gdscript
# hitbox_component.gd
class_name HitboxComponent
extends Area2D

@export var damage: int = 10

# Caller enables/disables the hitbox (e.g., during attack animation)
func _ready() -> void:
    area_entered.connect(_on_area_entered)

func _on_area_entered(area: Area2D) -> void:
    if area is HurtboxComponent:
        area.take_hit(damage, global_position)
```

### Hurtbox Component (Receives Damage)

```
# hurtbox_component.tscn
HurtboxComponent (Area2D)   ← Root, with script
└── CollisionShape2D         ← Define the vulnerable area
```

```gdscript
# hurtbox_component.gd
class_name HurtboxComponent
extends Area2D

signal hit_received(damage: int, from_direction: Vector2)

@export var health_component: HealthComponent
@export var invincibility_time: float = 0.5

var _invincible: bool = false

func take_hit(damage: int, from_position: Vector2) -> void:
    if _invincible:
        return
    var direction: Vector2 = (owner.global_position - from_position).normalized()
    hit_received.emit(damage, direction)
    if health_component:
        health_component.take_damage(damage)
    _start_invincibility()

func _start_invincibility() -> void:
    _invincible = true
    await get_tree().create_timer(invincibility_time).timeout
    _invincible = false
```

### Wiring Components Together

In the parent scene (`enemy.tscn`), wire child components via the editor or `_ready()`:

```gdscript
# enemy.gd — root script on the Enemy scene
extends CharacterBody2D

@onready var health: HealthComponent = $HealthComponent
@onready var hurtbox: HurtboxComponent = $HurtboxComponent
@onready var sprite: Sprite2D = $Sprite2D

func _ready() -> void:
    health.died.connect(_on_died)
    hurtbox.hit_received.connect(_on_hit)

func _on_hit(damage: int, from_direction: Vector2) -> void:
    # Flash red
    var tween: Tween = create_tween()
    tween.tween_property(sprite, "modulate", Color.RED, 0.05)
    tween.tween_property(sprite, "modulate", Color.WHITE, 0.1)
    # Knockback
    velocity = from_direction * 200.0

func _on_died() -> void:
    # Play death effect, drop loot, remove from tree
    queue_free()
```

---

## Scene Organization in the File System

```
project/
├── scenes/
│   ├── characters/
│   │   ├── player.tscn
│   │   ├── goblin.tscn
│   │   └── skeleton.tscn
│   ├── objects/
│   │   ├── chest.tscn
│   │   ├── door.tscn
│   │   └── coin.tscn
│   ├── components/          ← Reusable component scenes
│   │   ├── health_component.tscn
│   │   ├── hitbox_component.tscn
│   │   ├── hurtbox_component.tscn
│   │   ├── drop_table_component.tscn
│   │   └── state_machine.tscn
│   ├── ui/
│   │   ├── hud.tscn
│   │   ├── pause_menu.tscn
│   │   └── inventory.tscn
│   ├── effects/
│   │   ├── explosion.tscn
│   │   ├── damage_number.tscn
│   │   └── dust_particles.tscn
│   └── levels/
│       ├── main_menu.tscn
│       ├── level_01.tscn
│       └── level_02.tscn
├── scripts/
│   ├── characters/
│   ├── components/
│   ├── autoloads/
│   └── ui/
├── resources/               ← .tres data files
│   ├── items/
│   ├── enemies/
│   └── weapons/
└── assets/
    ├── sprites/
    ├── audio/
    └── fonts/
```

**Convention:** Scenes live in `scenes/`, scripts in `scripts/`, resources in `resources/`. Some developers co-locate scripts next to their scenes — both are valid, just be consistent.

---

## Instancing Scenes at Runtime

### Spawning Enemies

```gdscript
# enemy_spawner.gd
extends Node2D

@export var enemy_scene: PackedScene
@export var spawn_points: Array[Marker2D] = []

func spawn_wave(count: int) -> void:
    for i in count:
        var enemy: CharacterBody2D = enemy_scene.instantiate()
        var point: Marker2D = spawn_points[i % spawn_points.size()]
        enemy.global_position = point.global_position
        add_child(enemy)
```

### Spawning with Object Pooling

For frequently spawned/destroyed objects (bullets, particles, coins), use a pool:

```gdscript
# In the level scene:
@onready var bullet_pool: NodePool = $BulletPool  # NodePool scene (see godot-rules.md)

func fire_bullet(pos: Vector2, direction: Vector2) -> void:
    var bullet: Node2D = bullet_pool.get_instance()
    bullet.global_position = pos
    bullet.setup(direction)  # Custom init method on the bullet script
```

### Dynamic Scene Loading

```gdscript
# For procedural content or mod support — load scenes by path
func spawn_entity(scene_path: String, pos: Vector2) -> Node:
    var scene: PackedScene = load(scene_path)
    var instance: Node = scene.instantiate()
    instance.global_position = pos if instance is Node2D else Vector2.ZERO
    get_tree().current_scene.add_child(instance)
    return instance
```

**Performance note:** `preload()` is compile-time (fastest, use for known scenes). `load()` is runtime (use for dynamic/procedural content).

---

## Composition vs Inheritance: Decision Guide

### Use Composition (Default)

```
# Player and Enemy both need health → HealthComponent scene in both
Player (CharacterBody2D)
├── HealthComponent         ← Same scene as in Enemy
├── HurtboxComponent
└── ...

Enemy (CharacterBody2D)
├── HealthComponent         ← Same scene as in Player
├── HurtboxComponent
└── ...
```

Benefits: Maximum reuse, no coupling, easy to mix-and-match.

### Use Scene Inheritance (Rarely)

Only when you have a base layout with variants that **add** to it:

```
# base_enemy.tscn → goblin.tscn, skeleton.tscn, boss.tscn
# Each variant adds unique nodes/scripts but shares the base tree
```

Create: **Scene → New Inherited Scene → select base scene.**

Pitfalls:
- Inherited scenes can't remove base nodes (only hide or override).
- Changes to the base propagate to all children — this is powerful but dangerous.
- More than 2 levels of inheritance becomes hard to debug.

### Never Use Deep Class Inheritance

```gdscript
# WRONG: Deep inheritance chain
# Entity → Character → Enemy → RangedEnemy → GoblinArcher
# Hard to maintain, violates Godot's composition philosophy

# CORRECT: Flat composition
# GoblinArcher = CharacterBody2D + HealthComponent + RangedAttackComponent + AIComponent
```

---

## Common Composition Patterns

### The "Entity" Pattern (RPG/Action)

```
Entity (CharacterBody2D)
├── Sprite2D
├── CollisionShape2D
├── HealthComponent
├── HurtboxComponent
├── HitboxComponent
├── StateMachine
│   ├── Idle
│   ├── Walk
│   └── Attack
├── AnimationPlayer
└── AudioStreamPlayer2D
```

### The "Interactable" Pattern

```
Chest (StaticBody2D)
├── Sprite2D
├── CollisionShape2D
├── InteractionArea (Area2D)     ← Detects player proximity
│   └── CollisionShape2D
├── PromptLabel (Label)          ← "Press E to open"
├── AnimationPlayer              ← Open/close animation
└── DropTableComponent           ← What to drop when opened
```

### The "Projectile" Pattern

```
Bullet (Area2D)
├── Sprite2D
├── CollisionShape2D
├── VisibleOnScreenNotifier2D    ← Auto-cleanup when off-screen
└── GPUParticles2D               ← Trail effect
```

```gdscript
# bullet.gd
extends Area2D

var direction: Vector2 = Vector2.RIGHT
var speed: float = 500.0
var damage: int = 10

func setup(dir: Vector2, spd: float = 500.0, dmg: int = 10) -> void:
    direction = dir.normalized()
    speed = spd
    damage = dmg
    rotation = direction.angle()

func _physics_process(delta: float) -> void:
    position += direction * speed * delta

func _on_body_entered(body: Node2D) -> void:
    if body.has_node("HurtboxComponent"):
        body.get_node("HurtboxComponent").take_hit(damage, global_position)
    queue_free()  # Or return to pool

func _on_visible_on_screen_notifier_2d_screen_exited() -> void:
    queue_free()  # Or return to pool
```

### The "UI Panel" Pattern

```
InventoryPanel (PanelContainer)
├── VBoxContainer
│   ├── TitleLabel (Label)
│   ├── HSeparator
│   ├── ItemGrid (GridContainer)  ← Filled dynamically with InventorySlot scenes
│   └── HBoxContainer
│       ├── UseButton (Button)
│       └── DropButton (Button)
```

---

## Debugging Scene Composition

### Common Issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| "Node not found" error | `@onready` references a node removed from tree | Check node name matches exactly (case-sensitive) |
| Signal not received | Signal connected in code but node order changed | Move `connect()` calls to `_ready()`, verify node paths |
| Component has no owner | Using `owner` but the component is added at runtime | Set `owner` manually after `add_child()` if needed |
| CollisionShape2D warning | Shape is not a direct child of a physics body | Move CollisionShape2D to be a direct child |
| Scene changes break things | Hard-coded paths to nodes in other scenes | Use signals, groups, or the signal bus instead |

### Remote Scene Tree

While the game is running, the **Scene dock → Remote tab** shows the actual runtime node tree. Use this to:
- Verify instanced scenes are in the right place
- Check that components are properly nested
- Debug why signals aren't connecting (wrong node names)

---

## Checklist: Is Your Scene Well-Composed?

- [ ] Root node type matches the physics behavior needed
- [ ] Script on the root node is ≤200 lines (extract components if longer)
- [ ] Reusable behaviors are separate component scenes, not copy-pasted code
- [ ] No relative paths going up more than one level (`../../` is a smell)
- [ ] Children communicate to parents via signals, not direct references upward
- [ ] Parents wire children together in `_ready()` or via editor connections
- [ ] Scene can be tested in isolation (run the scene by pressing F6)
- [ ] Node names are `PascalCase` and descriptive (`HealthComponent`, not `Node3`)
