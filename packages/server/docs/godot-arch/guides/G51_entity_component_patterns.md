# G51 — Entity-Component Patterns and Composition

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#
> **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Scene Composition](./G1_scene_composition.md) · [G3 Signal Architecture](./G3_signal_architecture.md) · [G39 Scalable Architecture & Pooling](./G39_scalable_architecture_and_pooling.md) · [G45 Advanced GDScript Patterns](./G45_advanced_gdscript_patterns.md)

---

## What This Guide Covers

As Godot projects grow, developers face the classic question: should entities use deep inheritance trees or composable components? Godot's scene-tree architecture already favors composition, but the idiomatic patterns for building a true component system — where behaviors are snap-on nodes, data lives in resources, and entities are assembled from interchangeable parts — are not always obvious.

This guide covers the entity-component pattern adapted for Godot's node system (NOT a traditional ECS with contiguous memory), when to use inheritance vs composition, building reusable behavior components, data-driven entities with custom resources, the component communication problem (signals vs direct reference vs groups), and when you actually need a full ECS framework.

**Use this guide when:** your game has many entity types sharing overlapping behaviors (e.g., "some enemies can fly, some can swim, some can do both"), your inheritance tree is becoming unwieldy, or you want a modular architecture where designers can assemble entities from building blocks.

---

## Table of Contents

1. [Inheritance vs Composition in Godot](#1-inheritance-vs-composition-in-godot)
2. [The Entity-Component Pattern](#2-the-entity-component-pattern)
3. [Building Behavior Components](#3-building-behavior-components)
4. [Data Components with Custom Resources](#4-data-components-with-custom-resources)
5. [Component Communication](#5-component-communication)
6. [Entity Assembly Patterns](#6-entity-assembly-patterns)
7. [The System Layer](#7-the-system-layer)
8. [When to Use a Full ECS Framework](#8-when-to-use-a-full-ecs-framework)
9. [C# Examples](#9-c-examples)
10. [Performance Considerations](#10-performance-considerations)
11. [Real-World Architecture Examples](#11-real-world-architecture-examples)
12. [Common Pitfalls](#12-common-pitfalls)

---

## 1. Inheritance vs Composition in Godot

### The Inheritance Approach

```
CharacterBody2D
  └─ Enemy
       ├─ FlyingEnemy
       ├─ SwimmingEnemy
       ├─ FlyingSwimmingEnemy  ← Problem starts here
       └─ ShootingFlyingEnemy  ← Combinatorial explosion
```

Inheritance works well when your hierarchy is a clean tree: each subclass adds one responsibility and nothing overlaps. It breaks down when behaviors are **orthogonal** — an entity needs to be both "flying" and "shooting" and "poisonous," and those capabilities aren't a linear chain.

### The Composition Approach

```
CharacterBody2D (Entity)
  ├─ HealthComponent
  ├─ FlyingComponent
  ├─ ShootingComponent
  └─ PoisonComponent
```

Each component is a self-contained node that adds a single capability. The entity is defined by which components are attached. Designers can create new enemy types by combining components in the editor — no code needed.

### When to Use Each

| Use Inheritance When | Use Composition When |
|---------------------|---------------------|
| Few entity types with clear IS-A relationships | Many entity types with mix-and-match behaviors |
| Behavior doesn't overlap across branches | Behaviors are orthogonal (flying, shooting, poison) |
| You need deep access to the base class | You want designer-friendly entity assembly |
| Small project with < 10 entity variants | Medium-to-large project with 20+ entity variants |
| Prototype / game jam | Production codebase that needs to scale |

### The Pragmatic Middle Ground

Most Godot projects use **both**: a shallow inheritance tree for broad categories (Player, Enemy, NPC) with components for specific behaviors. Don't go fully flat just because composition is "better" — a `CharacterBody2D` subclass that handles basic movement is still useful as a base for attaching components to.

---

## 2. The Entity-Component Pattern

### Core Concepts (Godot-Adapted)

| ECS Concept | Godot Equivalent |
|-------------|-----------------|
| **Entity** | A Node (usually CharacterBody2D, Node2D, etc.) that serves as a container |
| **Component** | A child Node that adds data and/or behavior |
| **System** | An autoload, a group-based processor, or logic in `_process`/`_physics_process` |

**Important distinction:** This is the *entity-component pattern* (structural), not ECS (data-oriented). We're using Godot's node tree for composition, not storing data in contiguous memory arrays. The goal is code organization and reusability, not cache-line optimization.

### Base Component Class

```gdscript
class_name Component
extends Node

## The entity this component is attached to.
## Cached on _ready for fast access.
var entity: Node

func _ready() -> void:
    entity = get_parent()
    assert(entity != null, "%s must be a child of an entity node" % name)
    _initialize()

## Override in subclasses for component-specific setup.
func _initialize() -> void:
    pass
```

---

## 3. Building Behavior Components

### Health Component

```gdscript
class_name HealthComponent
extends Component

signal died
signal health_changed(new_health: float, max_health: float)
signal damage_taken(amount: float, source: Node)

@export var max_health: float = 100.0
@export var invincibility_duration: float = 0.0

var current_health: float
var is_invincible: bool = false

func _initialize() -> void:
    current_health = max_health

func take_damage(amount: float, source: Node = null) -> void:
    if is_invincible or current_health <= 0.0:
        return

    current_health = maxf(current_health - amount, 0.0)
    health_changed.emit(current_health, max_health)
    damage_taken.emit(amount, source)

    if current_health <= 0.0:
        died.emit()
    elif invincibility_duration > 0.0:
        _start_invincibility()

func heal(amount: float) -> void:
    current_health = minf(current_health + amount, max_health)
    health_changed.emit(current_health, max_health)

func _start_invincibility() -> void:
    is_invincible = true
    await get_tree().create_timer(invincibility_duration).timeout
    is_invincible = false
```

### Movement Component

```gdscript
class_name MovementComponent
extends Component

@export var speed: float = 200.0
@export var acceleration: float = 1500.0
@export var friction: float = 1200.0

var velocity: Vector2 = Vector2.ZERO
var direction: Vector2 = Vector2.ZERO

func _physics_process(delta: float) -> void:
    if not entity is CharacterBody2D:
        return

    var body: CharacterBody2D = entity as CharacterBody2D

    if direction.length() > 0.01:
        velocity = velocity.move_toward(direction.normalized() * speed, acceleration * delta)
    else:
        velocity = velocity.move_toward(Vector2.ZERO, friction * delta)

    body.velocity = velocity
    body.move_and_slide()
    velocity = body.velocity
```

### Hitbox / Hurtbox Component

```gdscript
class_name HitboxComponent
extends Area2D

@export var damage: float = 10.0
@export var knockback_force: float = 200.0

func _ready() -> void:
    area_entered.connect(_on_area_entered)

func _on_area_entered(area: Area2D) -> void:
    if area is HurtboxComponent:
        var hurtbox: HurtboxComponent = area
        hurtbox.receive_hit(damage, knockback_force, global_position)
```

```gdscript
class_name HurtboxComponent
extends Area2D

signal hit_received(damage: float, knockback: float, source_pos: Vector2)

func receive_hit(damage: float, knockback: float, source_pos: Vector2) -> void:
    hit_received.emit(damage, knockback, source_pos)
```

---

## 4. Data Components with Custom Resources

### Separating Data from Behavior

Use custom `Resource` classes for data that components operate on. This lets designers edit stats in the Inspector without touching code:

```gdscript
class_name EnemyStats
extends Resource

@export var display_name: String = "Enemy"
@export var max_health: float = 100.0
@export var move_speed: float = 150.0
@export var damage: float = 10.0
@export var attack_range: float = 50.0
@export var detection_range: float = 200.0
@export var xp_reward: int = 10
@export var loot_table: Array[LootEntry] = []
```

```gdscript
class_name LootEntry
extends Resource

@export var item: Resource  # Your item resource type
@export_range(0.0, 1.0) var drop_chance: float = 0.5
@export var min_count: int = 1
@export var max_count: int = 1
```

### Using Data Resources in Components

```gdscript
class_name StatsComponent
extends Component

@export var stats: EnemyStats

func _initialize() -> void:
    if not stats:
        push_warning("%s has no stats resource assigned" % entity.name)
        return

    # Initialize sibling components from stats
    var health := entity.get_node_or_null("HealthComponent") as HealthComponent
    if health:
        health.max_health = stats.max_health
        health.current_health = stats.max_health

    var movement := entity.get_node_or_null("MovementComponent") as MovementComponent
    if movement:
        movement.speed = stats.move_speed
```

### Variant Entities via Swapped Resources

Create a "Skeleton" enemy scene once, then make variants by saving different `.tres` files:

```
enemies/
  skeleton.tscn          ← Base scene with components
  stats/
    skeleton_basic.tres  ← max_health=50, speed=100
    skeleton_elite.tres  ← max_health=200, speed=150, damage=25
    skeleton_boss.tres   ← max_health=1000, speed=80, damage=50
```

Swap the resource at spawn time:

```gdscript
func spawn_enemy(scene: PackedScene, stats: EnemyStats, pos: Vector2) -> Node2D:
    var enemy := scene.instantiate() as Node2D
    enemy.global_position = pos
    var stats_comp := enemy.get_node("StatsComponent") as StatsComponent
    stats_comp.stats = stats
    add_child(enemy)
    return enemy
```

---

## 5. Component Communication

The biggest design decision in a component system is how components talk to each other. There are three main approaches:

### A. Signals (Loosely Coupled)

Components emit signals; other components or the entity connect to them. No direct references needed.

```gdscript
# In entity _ready() or via @onready wiring
func _ready() -> void:
    $HurtboxComponent.hit_received.connect(_on_hit)

func _on_hit(damage: float, knockback: float, source_pos: Vector2) -> void:
    $HealthComponent.take_damage(damage)
    $MovementComponent.apply_knockback(knockback, source_pos)
    $VFXComponent.play_hit_effect()
```

**Pros:** Maximum decoupling, components are reusable across projects.
**Cons:** Wiring logic lives somewhere (entity script, or in `_ready`).

### B. Direct Node Access (Tightly Coupled)

Components find siblings by name or type:

```gdscript
class_name ShootingComponent
extends Component

var _health: HealthComponent

func _initialize() -> void:
    _health = entity.get_node_or_null("HealthComponent")

func try_shoot() -> void:
    if _health and _health.current_health <= 0:
        return  # Dead entities don't shoot
    _fire_projectile()
```

**Pros:** Simple, fast.
**Cons:** Implicit dependency — if `HealthComponent` is missing, you need null checks everywhere.

### C. Component Registry (Middle Ground)

The entity maintains a typed dictionary of its components:

```gdscript
class_name Entity
extends CharacterBody2D

var _components: Dictionary = {}  # Dictionary[StringName, Component]

func register_component(comp: Component) -> void:
    _components[comp.get_class()] = comp

func get_component(type: StringName) -> Component:
    return _components.get(type)

func has_component(type: StringName) -> bool:
    return type in _components
```

```gdscript
# In Component base class
func _initialize() -> void:
    if entity.has_method("register_component"):
        entity.register_component(self)
```

**Pros:** Structured access, easy to check capabilities.
**Cons:** Relies on `get_class()` which returns the script class name (works with `class_name`).

### Recommended Approach

Use **signals for events** (damage taken, died, state changed) and **direct access for queries** (check health, get stats). The entity script acts as a thin coordinator that wires signals in `_ready()`.

---

## 6. Entity Assembly Patterns

### Scene Inheritance

Create a base entity scene, then use Godot's scene inheritance to create variants:

```
base_enemy.tscn
  ├─ CollisionShape2D
  ├─ Sprite2D
  ├─ HealthComponent
  ├─ MovementComponent
  └─ StatsComponent

flying_enemy.tscn (inherits base_enemy.tscn)
  └─ FlyingComponent  ← Added
```

### Scene Composition (Nested Scenes)

Create component scenes and instantiate them as sub-scenes:

```
components/
  health_component.tscn
  movement_component.tscn
  shooting_component.tscn

entities/
  turret.tscn
    ├─ Sprite2D
    ├─ health_component.tscn (instance)
    └─ shooting_component.tscn (instance)
```

### Runtime Assembly

For procedurally generated entities or modding support:

```gdscript
func build_entity(config: Dictionary) -> Node2D:
    var entity := CharacterBody2D.new()

    if config.has("health"):
        var health := HealthComponent.new()
        health.max_health = config["health"]
        entity.add_child(health)

    if config.has("movement"):
        var movement := MovementComponent.new()
        movement.speed = config["movement"]["speed"]
        entity.add_child(movement)

    if config.has("shooting"):
        var shooting := ShootingComponent.new()
        shooting.damage = config["shooting"]["damage"]
        entity.add_child(shooting)

    return entity
```

---

## 7. The System Layer

In a full ECS, systems are pure functions that process all entities with matching components. In Godot, you can approximate this with groups or autoloads:

### Group-Based Systems

```gdscript
# poison_system.gd — Autoload
extends Node

func _physics_process(delta: float) -> void:
    for node in get_tree().get_nodes_in_group("poisoned"):
        var health: HealthComponent = node.get_node_or_null("HealthComponent")
        if health:
            health.take_damage(5.0 * delta)
```

### When Systems Make Sense

Use a system pattern when many entities share the same per-frame logic (e.g., all "burnable" entities tick down a burn timer). For entity-specific behavior, keep the logic in the component itself.

---

## 8. When to Use a Full ECS Framework

Godot's node-based composition handles most games well. You should consider a true ECS framework (like GECS, godot-ecs, or a GDExtension wrapper around flecs/entt) only when:

- You have **10,000+ active entities** and need cache-coherent iteration
- You need **parallel system processing** for CPU-bound simulations
- Your game is a **simulation-heavy** genre (factory builder, colony sim, large-scale RTS)
- You're willing to step outside Godot's node paradigm and build a parallel architecture

### Available ECS Frameworks for Godot 4

| Framework | Language | Notes |
|-----------|----------|-------|
| **GECS** | GDScript | Lightweight, uses Godot nodes as entity containers |
| **godot-ecs** | GDScript | Pure GDScript, focuses on decoupling |
| **GDScript ECS 4.x** | GDScript | Minimal, array-based storage |
| **Bevy ECS (via GDExtension)** | Rust/C++ | High-performance, bridges Bevy's ECS into Godot |

**Reality check:** An ECS written in GDScript won't give you the memory-layout performance benefits that make ECS fast in C++/Rust. If performance is the primary motivation, use a GDExtension-based ECS or optimize at the RenderingServer/PhysicsServer level instead.

---

## 9. C# Examples

### Component Base Class

```csharp
public partial class GameComponent : Node
{
    protected Node Entity { get; private set; }

    public override void _Ready()
    {
        Entity = GetParent();
        System.Diagnostics.Debug.Assert(Entity != null,
            $"{Name} must be a child of an entity node");
        Initialize();
    }

    protected virtual void Initialize() { }
}
```

### Health Component

```csharp
public partial class HealthComponent : GameComponent
{
    [Signal] public delegate void DiedEventHandler();
    [Signal] public delegate void HealthChangedEventHandler(float newHealth, float maxHealth);

    [Export] public float MaxHealth { get; set; } = 100f;
    public float CurrentHealth { get; private set; }
    public bool IsInvincible { get; set; }

    protected override void Initialize()
    {
        CurrentHealth = MaxHealth;
    }

    public void TakeDamage(float amount, Node source = null)
    {
        if (IsInvincible || CurrentHealth <= 0f) return;

        CurrentHealth = Mathf.Max(CurrentHealth - amount, 0f);
        EmitSignal(SignalName.HealthChanged, CurrentHealth, MaxHealth);

        if (CurrentHealth <= 0f)
            EmitSignal(SignalName.Died);
    }

    public void Heal(float amount)
    {
        CurrentHealth = Mathf.Min(CurrentHealth + amount, MaxHealth);
        EmitSignal(SignalName.HealthChanged, CurrentHealth, MaxHealth);
    }
}
```

### Interface-Based Component Discovery

C# can use interfaces for component queries, which is more type-safe than string-based lookups:

```csharp
public interface IDamageable
{
    void TakeDamage(float amount, Node source);
}

public interface IKnockbackable
{
    void ApplyKnockback(Vector2 force);
}

// Finding components by interface
public static T FindComponent<T>(Node entity) where T : class
{
    foreach (var child in entity.GetChildren())
    {
        if (child is T component)
            return component;
    }
    return null;
}
```

---

## 10. Performance Considerations

### Node Count

Each component adds a node to the tree. For entities with 5-10 components, this is fine. If you have 500 enemies each with 8 components, that's 4,000 nodes — still acceptable for Godot, but monitor with the Performance monitor.

### Signal Overhead

Signals have a small overhead per connection. For hot paths (called every frame), direct method calls are faster than signal emissions. Use signals for events, direct calls for per-frame queries.

### Component Lookup Caching

Don't call `get_node()` every frame — cache references in `_ready()`:

```gdscript
# BAD — node lookup every frame
func _physics_process(delta: float) -> void:
    var health := entity.get_node("HealthComponent") as HealthComponent
    if health.current_health > 0:
        _do_stuff()

# GOOD — cached in _initialize
var _health: HealthComponent
func _initialize() -> void:
    _health = entity.get_node("HealthComponent") as HealthComponent
```

### When Composition Hurts Performance

If your bottleneck is iterating over thousands of entities per frame, the node-tree overhead (virtual calls, signal checks, node traversal) matters. At that scale, consider flat arrays processed in a single system — or move the hot loop to GDExtension (C++).

---

## 11. Real-World Architecture Examples

### Action RPG

```
Player (CharacterBody2D)
  ├─ Sprite2D
  ├─ CollisionShape2D
  ├─ HealthComponent (max=100, invincibility=0.5s)
  ├─ MovementComponent (speed=250, accel=2000)
  ├─ StatsComponent → player_stats.tres
  ├─ InventoryComponent
  ├─ AbilityComponent
  │   ├─ SlashAbility.tres
  │   └─ DashAbility.tres
  ├─ HurtboxComponent (Area2D)
  ├─ InteractionComponent (Area2D — detects NPCs, chests)
  └─ VFXComponent (manages hit flashes, particles)
```

### Tower Defense Tower

```
Tower (StaticBody2D)
  ├─ Sprite2D
  ├─ RangeDetector (Area2D — finds enemies in range)
  ├─ ShootingComponent (rate=0.5s, damage=15)
  ├─ TargetingComponent (strategy=NEAREST/STRONGEST/FIRST)
  ├─ UpgradeComponent → tower_upgrades.tres
  └─ StatsComponent → archer_tower_stats.tres
```

### Platformer Pickup

```
Pickup (Area2D)
  ├─ Sprite2D
  ├─ CollisionShape2D
  ├─ FloatingComponent (bobbing animation)
  ├─ PickupComponent (on_collected signal)
  └─ EffectComponent → health_potion_effect.tres
```

---

## 12. Common Pitfalls

### Over-Engineering Small Games

A game jam game with 3 enemy types doesn't need a component system. Simple inheritance or even a single script with `match` statements is fine. Reach for components when you feel the pain of combinatorial explosion.

### Components That Know Too Much

A component that references 5 siblings is no longer composable — it's a monolith split across files. If a component needs many siblings, consider whether it should be the entity's main script instead.

### Initialization Order

Components call `_ready()` in tree order (top to bottom). If `ShootingComponent` needs `HealthComponent` to be initialized first, either:
- Arrange them in the correct order in the scene tree
- Use `call_deferred()` or `await owner.ready` for cross-component initialization
- Use a two-phase init: `_ready()` for self-setup, `_initialize()` deferred for cross-component wiring

### Missing Components at Runtime

Always handle the case where an optional component is absent:

```gdscript
func try_apply_poison() -> void:
    var health := entity.get_node_or_null("HealthComponent") as HealthComponent
    if not health:
        return  # Entity is immune (no health component)
    health.take_damage(poison_dps * get_physics_process_delta_time())
```

---

## Summary

The entity-component pattern in Godot is about using the node tree for what it's good at — composition. Keep components small and focused on a single responsibility. Use signals for events and cached references for queries. Start with inheritance for broad categories, then reach for components when behaviors become orthogonal. Don't chase a full ECS unless you have thousands of entities and a genuine performance need — Godot's nodes are already components, and the engine is designed around them.
