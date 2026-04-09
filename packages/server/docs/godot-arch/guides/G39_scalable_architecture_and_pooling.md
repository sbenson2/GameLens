# G39 — Scalable Architecture & Object Pooling

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#
> **Related:** [G1 Scene Composition](./G1_scene_composition.md) · [G3 Signal Architecture](./G3_signal_architecture.md) · [G18 Performance Profiling](./G18_performance_profiling.md) · [G34 Threading & Async](./G34_threading_and_async.md)

---

## What This Guide Covers

Godot's scene tree is flexible enough for small projects, but as entity counts grow — hundreds of bullets, thousands of enemies, dynamic spawning — naive patterns break down. Instantiating and freeing nodes every frame causes GC spikes and frame drops. Deeply coupled node references create fragile architectures that are hard to extend.

This guide covers **object pooling**, the **component pattern**, **service locator / dependency injection alternatives**, **entity management** at scale, and **data-oriented tips** for keeping Godot projects performant and maintainable as they grow.

---

## Table of Contents

1. [When Godot's Defaults Stop Scaling](#1-when-godots-defaults-stop-scaling)
2. [Object Pooling](#2-object-pooling)
3. [The Component Pattern](#3-the-component-pattern)
4. [Service Locator vs Autoloads](#4-service-locator-vs-autoloads)
5. [Entity Spawner / Manager Pattern](#5-entity-spawner--manager-pattern)
6. [Data-Oriented Techniques](#6-data-oriented-techniques)
7. [Signal Bus (Event Bus)](#7-signal-bus-event-bus)
8. [C# Equivalents](#8-c-equivalents)
9. [Architecture Decision Guide](#9-architecture-decision-guide)
10. [Common Mistakes](#10-common-mistakes)

---

## 1. When Godot's Defaults Stop Scaling

Godot's node/scene system is powerful, but these patterns start hurting at scale:

| Pattern | Problem at Scale |
|---------|------------------|
| `instantiate()` + `queue_free()` every frame | GC pressure, allocation spikes, frame drops |
| Deep node tree with `get_node()` paths | Brittle paths break when tree changes |
| Autoloads for everything | God-object anti-pattern, hard to test, tight coupling |
| Direct node references between systems | Circular dependencies, ordering nightmares |
| One big script per entity | 2000-line scripts, impossible to reuse behaviors |

The solutions below don't require abandoning Godot's node model — they work *with* the scene tree while adding structure.

---

## 2. Object Pooling

Object pooling pre-creates nodes and recycles them instead of allocating/freeing on demand. Critical for bullets, particles, enemies, and any frequently spawned entity.

### Generic Pool

```gdscript
# object_pool.gd
class_name ObjectPool
extends Node

## The scene to pool
@export var pooled_scene: PackedScene
## Initial pool size
@export var initial_size: int = 50
## Maximum pool growth (-1 = unlimited)
@export var max_size: int = -1

var _available: Array[Node] = []
var _active: Array[Node] = []
var _total_created: int = 0


func _ready() -> void:
	# Pre-warm the pool
	for i in initial_size:
		_create_instance()


## Get a node from the pool. Returns null if max_size reached.
func acquire() -> Node:
	var instance: Node
	
	if _available.size() > 0:
		instance = _available.pop_back()
	elif max_size < 0 or _total_created < max_size:
		instance = _create_instance()
	else:
		# Pool exhausted — recycle the oldest active node
		instance = _active.pop_front()
		_deactivate(instance)
	
	_activate(instance)
	_active.append(instance)
	return instance


## Return a node to the pool for reuse.
func release(instance: Node) -> void:
	if instance in _active:
		_active.erase(instance)
	_deactivate(instance)
	_available.append(instance)


## How many nodes are currently in use.
func active_count() -> int:
	return _active.size()


func _create_instance() -> Node:
	var instance := pooled_scene.instantiate()
	add_child(instance)
	_deactivate(instance)
	_total_created += 1
	return instance


func _activate(instance: Node) -> void:
	instance.visible = true
	instance.set_process(true)
	instance.set_physics_process(true)
	# Call a reset method if the pooled scene has one
	if instance.has_method("on_pool_acquire"):
		instance.on_pool_acquire()


func _deactivate(instance: Node) -> void:
	instance.visible = false
	instance.set_process(false)
	instance.set_physics_process(false)
	if instance.has_method("on_pool_release"):
		instance.on_pool_release()
```

### Pooled Bullet Example

```gdscript
# bullet.gd — Attach to the bullet scene
extends Area2D

var velocity := Vector2.ZERO
var damage := 10


func on_pool_acquire() -> void:
	## Called when pulled from pool. Reset state here.
	velocity = Vector2.ZERO
	damage = 10
	# Re-enable collision (may have been disabled)
	monitoring = true


func on_pool_release() -> void:
	## Called when returned to pool.
	monitoring = false


func fire(pos: Vector2, dir: Vector2, speed: float = 600.0) -> void:
	global_position = pos
	velocity = dir * speed
	rotation = dir.angle()


func _physics_process(delta: float) -> void:
	position += velocity * delta


func _on_body_entered(body: Node2D) -> void:
	if body.has_method("take_damage"):
		body.take_damage(damage)
	# Return to pool instead of queue_free()
	var pool := get_parent() as ObjectPool
	if pool:
		pool.release(self)
```

### Usage from a Weapon

```gdscript
# weapon.gd
extends Node2D

@export var bullet_pool: ObjectPool


func shoot() -> void:
	var bullet := bullet_pool.acquire()
	if bullet:
		bullet.fire(global_position, Vector2.RIGHT.rotated(rotation))
```

### When to Pool vs. When to Instantiate

| Scenario | Approach |
|----------|----------|
| Bullets, projectiles (high frequency) | **Pool** — dozens per second |
| Enemies (moderate frequency) | **Pool** if >10 alive at once |
| One-off UI popups | **Instantiate** — low frequency |
| Particle effects | Use `GPUParticles2D` — already pooled internally |
| Level geometry | **Instantiate** once at load time |

---

## 3. The Component Pattern

Instead of one monolithic script per entity, split behavior into reusable components. Each component is a child node with a focused script.

### Component Structure

```
Player (CharacterBody2D)
├── HealthComponent          ← tracks HP, emits died signal
├── HurtboxComponent (Area2D) ← detects incoming hits
├── HitboxComponent (Area2D)  ← deals damage to others
├── MovementComponent         ← handles velocity, acceleration
├── StateMachineComponent     ← manages state transitions
└── Sprite2D
```

### Health Component

```gdscript
# health_component.gd
class_name HealthComponent
extends Node

signal health_changed(current: float, maximum: float)
signal died

@export var max_health: float = 100.0
var current_health: float


func _ready() -> void:
	current_health = max_health


func take_damage(amount: float) -> void:
	current_health = maxf(current_health - amount, 0.0)
	health_changed.emit(current_health, max_health)
	if current_health <= 0.0:
		died.emit()


func heal(amount: float) -> void:
	current_health = minf(current_health + amount, max_health)
	health_changed.emit(current_health, max_health)


func is_alive() -> bool:
	return current_health > 0.0
```

### Hurtbox Component

```gdscript
# hurtbox_component.gd
class_name HurtboxComponent
extends Area2D

## The HealthComponent to forward damage to
@export var health: HealthComponent
## Invincibility frames duration (0 = no i-frames)
@export var invincibility_duration: float = 0.0

var _invincible: bool = false


func _on_area_entered(hitbox: Area2D) -> void:
	if _invincible:
		return
	if hitbox is HitboxComponent:
		health.take_damage(hitbox.damage)
		if invincibility_duration > 0.0:
			_start_invincibility()


func _start_invincibility() -> void:
	_invincible = true
	await get_tree().create_timer(invincibility_duration).timeout
	_invincible = false
```

### Why Components?

- **Reusable**: The same `HealthComponent` works on players, enemies, destructible crates
- **Testable**: Test health logic without spawning a full character scene
- **Composable**: Add/remove behaviors by adding/removing child nodes
- **No inheritance chains**: Avoids the "diamond of death" problem with deep class hierarchies

---

## 4. Service Locator vs Autoloads

Autoloads are Godot's built-in singleton pattern, but they create tight coupling. A service locator provides the same convenience with more flexibility.

### The Problem with Autoloads at Scale

```gdscript
# This creates a hard dependency on the AudioManager autoload.
# If AudioManager changes its API, every caller breaks.
# You can't swap in a mock for testing.
AudioManager.play_sfx("explosion")
```

### Service Locator Pattern

```gdscript
# service_locator.gd — Autoload (the ONE autoload you need)
extends Node

var _services: Dictionary[StringName, Node] = {}


func register(service_name: StringName, service: Node) -> void:
	_services[service_name] = service


func unregister(service_name: StringName) -> void:
	_services.erase(service_name)


func get_service(service_name: StringName) -> Node:
	if service_name in _services:
		return _services[service_name]
	push_warning("Service not found: %s" % service_name)
	return null
```

### Registration

```gdscript
# audio_manager.gd — NOT an autoload, just a regular node in the scene
extends Node

func _ready() -> void:
	Services.register(&"audio", self)

func _exit_tree() -> void:
	Services.unregister(&"audio")

func play_sfx(sfx_name: String) -> void:
	# ...
```

### Usage

```gdscript
# Anywhere:
var audio := Services.get_service(&"audio")
if audio:
	audio.play_sfx("explosion")
```

> **Trade-off:** Service locator adds one level of indirection. For small projects (<20 scripts), autoloads are fine. The service locator pays off when you have 50+ scripts or need to swap implementations (e.g., mock audio during tests).

---

## 5. Entity Spawner / Manager Pattern

For games with many dynamic entities (enemies, pickups, projectiles), a dedicated manager centralizes spawning, tracking, and bulk operations.

```gdscript
# enemy_manager.gd
class_name EnemyManager
extends Node

signal enemy_count_changed(count: int)

var _enemies: Array[Node2D] = []
var _enemy_pool: ObjectPool

@export var enemy_scene: PackedScene
@export var max_enemies: int = 100


func _ready() -> void:
	# Initialize pool
	_enemy_pool = ObjectPool.new()
	_enemy_pool.pooled_scene = enemy_scene
	_enemy_pool.initial_size = 20
	_enemy_pool.max_size = max_enemies
	add_child(_enemy_pool)


func spawn_enemy(position: Vector2, type: StringName = &"basic") -> Node2D:
	var enemy := _enemy_pool.acquire() as Node2D
	if not enemy:
		return null
	
	enemy.global_position = position
	if enemy.has_method("initialize"):
		enemy.initialize(type)
	
	# Track for bulk operations
	_enemies.append(enemy)
	enemy_count_changed.emit(_enemies.size())
	
	# Listen for death to return to pool
	if enemy.has_node("HealthComponent"):
		var health: HealthComponent = enemy.get_node("HealthComponent")
		# Use a callable to capture the enemy reference
		health.died.connect(_on_enemy_died.bind(enemy), CONNECT_ONE_SHOT)
	
	return enemy


func _on_enemy_died(enemy: Node2D) -> void:
	_enemies.erase(enemy)
	_enemy_pool.release(enemy)
	enemy_count_changed.emit(_enemies.size())


## Bulk operations — run on all active enemies
func get_nearest_enemy(to_position: Vector2) -> Node2D:
	var nearest: Node2D = null
	var nearest_dist := INF
	for enemy in _enemies:
		var dist := enemy.global_position.distance_squared_to(to_position)
		if dist < nearest_dist:
			nearest_dist = dist
			nearest = enemy
	return nearest


func get_enemies_in_radius(center: Vector2, radius: float) -> Array[Node2D]:
	var result: Array[Node2D] = []
	var radius_sq := radius * radius
	for enemy in _enemies:
		if enemy.global_position.distance_squared_to(center) <= radius_sq:
			result.append(enemy)
	return result


func despawn_all() -> void:
	for enemy in _enemies.duplicate():
		_enemy_pool.release(enemy)
	_enemies.clear()
	enemy_count_changed.emit(0)
```

---

## 6. Data-Oriented Techniques

When you need raw performance for thousands of entities, consider keeping hot data in arrays instead of scattered across node properties.

### Parallel Arrays for Bulk Processing

```gdscript
# bullet_system.gd — Manages 10,000+ bullets without individual nodes
extends Node2D

var positions: PackedVector2Array = []
var velocities: PackedVector2Array = []
var lifetimes: PackedFloat32Array = []

# Use a MultiMeshInstance2D for rendering — one draw call for all bullets
@onready var multi_mesh: MultiMeshInstance2D = $MultiMeshInstance2D


func spawn_bullet(pos: Vector2, vel: Vector2, lifetime: float = 3.0) -> void:
	positions.append(pos)
	velocities.append(vel)
	lifetimes.append(lifetime)


func _physics_process(delta: float) -> void:
	var i := 0
	while i < positions.size():
		# Update position
		positions[i] += velocities[i] * delta
		lifetimes[i] -= delta
		
		# Remove expired bullets (swap-and-pop for O(1) removal)
		if lifetimes[i] <= 0.0:
			var last := positions.size() - 1
			positions[i] = positions[last]
			velocities[i] = velocities[last]
			lifetimes[i] = lifetimes[last]
			positions.resize(last)
			velocities.resize(last)
			lifetimes.resize(last)
			continue  # Re-check this index (now has swapped element)
		i += 1
	
	_update_visuals()


func _update_visuals() -> void:
	var mm := multi_mesh.multimesh
	mm.instance_count = positions.size()
	for i in positions.size():
		var xform := Transform2D(velocities[i].angle(), positions[i])
		mm.set_instance_transform_2d(i, xform)
```

> **When to use this:** Only for extreme cases (bullet hell, massive particle simulations). For <500 entities, node-based pooling is simpler and fast enough.

### MultiMesh for Rendering

`MultiMeshInstance2D` / `MultiMeshInstance3D` renders thousands of identical meshes in a single draw call. Combine with parallel arrays for data and MultiMesh for rendering to get the best of both worlds.

---

## 7. Signal Bus (Event Bus)

A global event bus decouples systems that need to communicate without knowing about each other.

```gdscript
# event_bus.gd — Autoload
extends Node

## Game events
signal enemy_killed(enemy_type: StringName, position: Vector2)
signal item_collected(item_id: StringName, amount: int)
signal player_damaged(damage: float, source: StringName)
signal level_completed(level_id: String, time: float)
signal score_changed(new_score: int)

## UI events
signal show_notification(message: String, duration: float)
signal show_dialogue(dialogue_id: String)
```

### Emitting Events

```gdscript
# In enemy.gd:
func die() -> void:
	EventBus.enemy_killed.emit(&"goblin", global_position)
	# ... death animation, pool release, etc.
```

### Listening for Events

```gdscript
# In score_tracker.gd — knows nothing about enemies
func _ready() -> void:
	EventBus.enemy_killed.connect(_on_enemy_killed)

func _on_enemy_killed(type: StringName, _pos: Vector2) -> void:
	match type:
		&"goblin": score += 100
		&"dragon": score += 5000
	EventBus.score_changed.emit(score)
```

> **Rule of thumb:** Use direct signals for parent-child communication. Use the event bus for cross-system communication where nodes don't have a direct reference to each other.

---

## 8. C# Equivalents

### Object Pool

```csharp
using Godot;
using System.Collections.Generic;

public partial class ObjectPool : Node
{
    [Export] public PackedScene PooledScene { get; set; }
    [Export] public int InitialSize { get; set; } = 50;
    [Export] public int MaxSize { get; set; } = -1;

    private readonly Stack<Node> _available = new();
    private readonly List<Node> _active = new();
    private int _totalCreated;

    public override void _Ready()
    {
        for (int i = 0; i < InitialSize; i++)
            CreateInstance();
    }

    public Node Acquire()
    {
        Node instance;
        if (_available.Count > 0)
        {
            instance = _available.Pop();
        }
        else if (MaxSize < 0 || _totalCreated < MaxSize)
        {
            instance = CreateInstance();
        }
        else
        {
            // Recycle oldest
            instance = _active[0];
            _active.RemoveAt(0);
            Deactivate(instance);
        }

        Activate(instance);
        _active.Add(instance);
        return instance;
    }

    public void Release(Node instance)
    {
        _active.Remove(instance);
        Deactivate(instance);
        _available.Push(instance);
    }

    private Node CreateInstance()
    {
        var instance = PooledScene.Instantiate();
        AddChild(instance);
        Deactivate(instance);
        _totalCreated++;
        return instance;
    }

    private void Activate(Node instance)
    {
        if (instance is Node2D node2D) node2D.Visible = true;
        instance.SetProcess(true);
        instance.SetPhysicsProcess(true);
        if (instance.HasMethod("OnPoolAcquire"))
            instance.Call("OnPoolAcquire");
    }

    private void Deactivate(Node instance)
    {
        if (instance is Node2D node2D) node2D.Visible = false;
        instance.SetProcess(false);
        instance.SetPhysicsProcess(false);
        if (instance.HasMethod("OnPoolRelease"))
            instance.Call("OnPoolRelease");
    }
}
```

### Component Pattern with Interfaces

C# lets you use interfaces for stronger typing:

```csharp
public interface IDamageable
{
    void TakeDamage(float amount);
    bool IsAlive { get; }
}

public partial class HealthComponent : Node, IDamageable
{
    [Signal]
    public delegate void HealthChangedEventHandler(float current, float max);
    [Signal]
    public delegate void DiedEventHandler();

    [Export] public float MaxHealth { get; set; } = 100f;
    public float CurrentHealth { get; private set; }
    public bool IsAlive => CurrentHealth > 0f;

    public override void _Ready() => CurrentHealth = MaxHealth;

    public void TakeDamage(float amount)
    {
        CurrentHealth = Mathf.Max(CurrentHealth - amount, 0f);
        EmitSignal(SignalName.HealthChanged, CurrentHealth, MaxHealth);
        if (CurrentHealth <= 0f)
            EmitSignal(SignalName.Died);
    }
}
```

---

## 9. Architecture Decision Guide

| Project Size | Recommended Patterns |
|-------------|---------------------|
| **Jam / Prototype** (<50 nodes) | Autoloads + direct references. Keep it simple. |
| **Small game** (50–200 nodes) | Components, event bus, autoloads |
| **Medium game** (200–1000 nodes) | Components, service locator, object pools, entity manager |
| **Large game** (1000+ nodes) | All of the above + data-oriented for hot paths + MultiMesh |

### When NOT to Over-Architect

- Don't pool objects that are instantiated once per level
- Don't use an event bus for parent→child communication (direct signals are clearer)
- Don't build a full ECS in GDScript — if you need true ECS, use a GDExtension library
- Don't add patterns you don't need yet — YAGNI applies. Refactor when pain appears.

---

## 10. Common Mistakes

| Mistake | Fix |
|---------|-----|
| Pooled objects retaining state from previous use | Always reset state in `on_pool_acquire()` — signals, velocity, HP, timers |
| Freeing a pooled node instead of returning it | Never call `queue_free()` on pooled objects — call `pool.release()` |
| Component can't find sibling components | Use `@export` to wire references in the editor, or find in `_ready()` with `get_node()` |
| Event bus signals never disconnected | Disconnect in `_exit_tree()` or use `CONNECT_ONE_SHOT` for single-use listeners |
| MultiMesh instance count set every frame | Only update `instance_count` when bullets are added/removed, not every frame |
| Service locator hiding dependencies | Document which services each system expects — don't make it magic |
| Pool pre-warming causes load spike | Spread initialization over multiple frames with `await get_tree().process_frame` |
| Parallel arrays getting out of sync | Always add/remove from all arrays in the same function — never split across methods |
