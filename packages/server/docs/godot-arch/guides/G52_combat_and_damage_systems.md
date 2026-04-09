# G52 — Combat & Damage Systems

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#
> **Related:** [G5 Physics & Collision](./G5_physics_and_collision.md) · [G3 Signal Architecture](./G3_signal_architecture.md) · [G8 Animation Systems](./G8_animation_systems.md) · [G38 Game Feel & Juice](./G38_game_feel_and_juice.md) · [G51 Entity-Component Patterns](./G51_entity_component_patterns.md)

---

## What This Guide Covers

Nearly every action game needs a combat system — a structured way to detect when attacks connect with targets, calculate how much damage to deal, handle invincibility windows, and propagate knockback and status effects. Godot's `Area2D`/`Area3D` collision system provides the foundation, but building a robust combat pipeline on top of it requires careful architecture.

This guide covers the hitbox/hurtbox pattern (the standard approach for separating "things that deal damage" from "things that receive damage"), damage data modeling with custom resources, invincibility frames (i-frames), knockback and hit reactions, damage types and resistances, health components, melee and ranged attack patterns, and how to wire it all together with signals.

**Use this guide when:** you're building any game with combat — action RPGs, platformers, fighting games, shooters, or strategy games with real-time combat. The patterns here work for both 2D and 3D.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [The Hitbox / Hurtbox Pattern](#2-the-hitbox--hurtbox-pattern)
3. [Damage Data Resource](#3-damage-data-resource)
4. [Health Component](#4-health-component)
5. [Invincibility Frames](#5-invincibility-frames)
6. [Knockback and Hit Reactions](#6-knockback-and-hit-reactions)
7. [Melee Attack Pipeline](#7-melee-attack-pipeline)
8. [Ranged / Projectile Attacks](#8-ranged--projectile-attacks)
9. [Damage Types and Resistances](#9-damage-types-and-resistances)
10. [Status Effects](#10-status-effects)
11. [C# Examples](#11-c-examples)
12. [Common Pitfalls](#12-common-pitfalls)

---

## 1. Architecture Overview

A clean combat system separates concerns into distinct, reusable components:

```
┌─────────────────────────────────────────────────────────┐
│  ATTACKER (CharacterBody2D)                             │
│  ├── Hitbox (Area2D) ← deals damage                    │
│  │   └── CollisionShape2D (disabled by default)         │
│  └── AnimationPlayer ← enables hitbox during attack     │
├─────────────────────────────────────────────────────────┤
│  DEFENDER (CharacterBody2D)                             │
│  ├── Hurtbox (Area2D) ← receives damage                │
│  │   └── CollisionShape2D                               │
│  ├── HealthComponent (Node) ← tracks HP, emits signals  │
│  └── InvincibilityComponent (Node) ← manages i-frames   │
├─────────────────────────────────────────────────────────┤
│  DATA                                                   │
│  ├── DamageData (Resource) ← amount, type, knockback    │
│  └── ResistanceData (Resource) ← type → multiplier map  │
└─────────────────────────────────────────────────────────┘
```

**Key principle:** hitboxes know nothing about health. Hurtboxes know nothing about attack animations. Damage data flows through signals — the hitbox says "I hit something with this damage data," the hurtbox says "I received damage data," and the health component applies it.

---

## 2. The Hitbox / Hurtbox Pattern

### Collision Layer Setup

Dedicate specific physics layers to combat:

| Layer | Name       | Purpose                    |
|-------|------------|----------------------------|
| 5     | hitbox     | Attack collision areas      |
| 6     | hurtbox    | Damageable collision areas  |

Hitboxes **scan** (mask) layer 6 and **exist on** layer 5.
Hurtboxes **exist on** layer 6 and **do not scan** anything — they are passive receivers.

### Hitbox Component

```gdscript
# hitbox.gd — attach to an Area2D
class_name Hitbox
extends Area2D

## The damage this hitbox deals when it connects.
@export var damage_data: DamageData

## Owner of this hitbox (to prevent self-damage).
var source: Node

func _ready() -> void:
	# Hitboxes detect hurtboxes, not the other way around.
	# Monitoring = true: this node detects overlaps.
	# Monitorable = false: other nodes don't need to detect us.
	monitoring = true
	monitorable = false
	
	# Start with collision disabled — animation enables it.
	_set_collision_enabled(false)
	
	# Connect overlap detection.
	area_entered.connect(_on_area_entered)

func _on_area_entered(area: Area2D) -> void:
	if area is Hurtbox:
		# Pass damage data and our source to the hurtbox.
		area.receive_hit(damage_data, source)

func enable() -> void:
	_set_collision_enabled(true)

func disable() -> void:
	_set_collision_enabled(false)

func _set_collision_enabled(enabled: bool) -> void:
	for child in get_children():
		if child is CollisionShape2D or child is CollisionPolygon2D:
			child.set_deferred("disabled", not enabled)
```

### Hurtbox Component

```gdscript
# hurtbox.gd — attach to an Area2D
class_name Hurtbox
extends Area2D

## Emitted when this hurtbox receives a hit.
signal hit_received(damage_data: DamageData, source: Node)

## When true, hits are ignored (invincibility frames).
var is_invincible: bool = false

func _ready() -> void:
	# Hurtboxes are passive — they exist on their layer
	# but don't scan for anything.
	monitoring = false
	monitorable = true

## Called by a Hitbox when it overlaps us.
func receive_hit(damage_data: DamageData, source: Node) -> void:
	if is_invincible:
		return
	
	# Emit signal so the parent entity can respond.
	hit_received.emit(damage_data, source)
```

**Why Area2D overlap instead of body collision?** Area2D overlaps are non-physical — they detect contact without pushing bodies around. Combat detection should be separate from movement physics. You don't want a sword swing to physically push characters through walls.

---

## 3. Damage Data Resource

Instead of passing a raw integer for damage, use a custom Resource that carries all the information a hit needs:

```gdscript
# damage_data.gd
class_name DamageData
extends Resource

enum DamageType {
	PHYSICAL,
	FIRE,
	ICE,
	LIGHTNING,
	POISON,
	TRUE  ## Ignores all resistances.
}

## Base damage amount before resistances.
@export var amount: float = 10.0

## Type of damage (determines which resistance applies).
@export var type: DamageType = DamageType.PHYSICAL

## Knockback force applied to the target.
@export var knockback_force: float = 200.0

## Whether this hit causes hitstun (brief freeze on the target).
@export var causes_hitstun: bool = true

## Duration of hitstun in seconds.
@export var hitstun_duration: float = 0.1

## Optional status effect to apply on hit.
@export var status_effect: StatusEffect

## Critical hit multiplier (1.0 = no crit).
@export var crit_multiplier: float = 1.0
```

**Why a Resource?** You can create `.tres` files in the editor for each weapon or attack, tweak values visually, and reuse them across different hitboxes. A "Fire Sword" hitbox just references a different `DamageData` resource than a "Basic Punch."

---

## 4. Health Component

A reusable node that any damageable entity attaches as a child:

```gdscript
# health_component.gd
class_name HealthComponent
extends Node

signal health_changed(new_health: float, max_health: float)
signal damage_taken(amount: float, type: DamageData.DamageType)
signal healed(amount: float)
signal died

@export var max_health: float = 100.0
@export var resistance_data: ResistanceData

var current_health: float

func _ready() -> void:
	current_health = max_health

func take_damage(damage_data: DamageData) -> float:
	# Apply resistance multiplier.
	var multiplier := 1.0
	if resistance_data and damage_data.type != DamageData.DamageType.TRUE:
		multiplier = resistance_data.get_multiplier(damage_data.type)
	
	var final_damage := damage_data.amount * damage_data.crit_multiplier * multiplier
	final_damage = maxf(final_damage, 0.0)  # No negative damage.
	
	current_health = maxf(current_health - final_damage, 0.0)
	
	damage_taken.emit(final_damage, damage_data.type)
	health_changed.emit(current_health, max_health)
	
	if current_health <= 0.0:
		died.emit()
	
	return final_damage

func heal(amount: float) -> void:
	var old_health := current_health
	current_health = minf(current_health + amount, max_health)
	var actual_heal := current_health - old_health
	
	if actual_heal > 0.0:
		healed.emit(actual_heal)
		health_changed.emit(current_health, max_health)

func get_health_ratio() -> float:
	return current_health / max_health if max_health > 0.0 else 0.0
```

### Wiring It Together on an Entity

```gdscript
# enemy.gd
extends CharacterBody2D

@onready var hurtbox: Hurtbox = $Hurtbox
@onready var health: HealthComponent = $HealthComponent

func _ready() -> void:
	hurtbox.hit_received.connect(_on_hit_received)
	health.died.connect(_on_died)

func _on_hit_received(damage_data: DamageData, source: Node) -> void:
	var actual_damage := health.take_damage(damage_data)
	
	# Apply knockback.
	if damage_data.knockback_force > 0.0:
		var direction := (global_position - source.global_position).normalized()
		velocity = direction * damage_data.knockback_force

func _on_died() -> void:
	# Play death animation, drop loot, etc.
	queue_free()
```

---

## 5. Invincibility Frames

After taking a hit, characters often get a brief window of invincibility. This prevents a single sword swing from hitting every physics frame.

```gdscript
# invincibility_component.gd
class_name InvincibilityComponent
extends Node

signal invincibility_started
signal invincibility_ended

@export var duration: float = 0.5
@export var flash_interval: float = 0.08

## The Hurtbox to disable during i-frames.
@export var hurtbox: Hurtbox

## Optional: a Sprite2D or AnimatedSprite2D to flash.
@export var sprite: CanvasItem

var _timer: Timer
var _flash_timer: Timer

func _ready() -> void:
	_timer = Timer.new()
	_timer.one_shot = true
	_timer.timeout.connect(_on_invincibility_ended)
	add_child(_timer)
	
	_flash_timer = Timer.new()
	_flash_timer.timeout.connect(_on_flash_tick)
	add_child(_flash_timer)

func start() -> void:
	if hurtbox:
		hurtbox.is_invincible = true
	
	_timer.start(duration)
	
	if sprite:
		_flash_timer.start(flash_interval)
	
	invincibility_started.emit()

func _on_invincibility_ended() -> void:
	if hurtbox:
		hurtbox.is_invincible = false
	
	_flash_timer.stop()
	if sprite:
		sprite.visible = true  # Ensure visible when i-frames end.
	
	invincibility_ended.emit()

func _on_flash_tick() -> void:
	if sprite:
		sprite.visible = not sprite.visible
```

### Usage in the Player

```gdscript
# player.gd
extends CharacterBody2D

@onready var hurtbox: Hurtbox = $Hurtbox
@onready var health: HealthComponent = $HealthComponent
@onready var invincibility: InvincibilityComponent = $InvincibilityComponent

func _ready() -> void:
	hurtbox.hit_received.connect(_on_hit_received)

func _on_hit_received(damage_data: DamageData, source: Node) -> void:
	health.take_damage(damage_data)
	invincibility.start()  # Begin i-frames immediately after taking damage.
```

---

## 6. Knockback and Hit Reactions

Knockback should feel responsive. A common pattern is to apply an impulse and let it decay:

```gdscript
# knockback_component.gd
class_name KnockbackComponent
extends Node

## How quickly knockback decays (higher = snappier).
@export var friction: float = 800.0

var knockback_velocity: Vector2 = Vector2.ZERO

func apply(direction: Vector2, force: float) -> void:
	knockback_velocity = direction.normalized() * force

func process_knockback(delta: float) -> Vector2:
	knockback_velocity = knockback_velocity.move_toward(Vector2.ZERO, friction * delta)
	return knockback_velocity
```

In the character's `_physics_process`:

```gdscript
func _physics_process(delta: float) -> void:
	# Normal movement velocity.
	var movement := _get_input_velocity()
	
	# Add knockback on top.
	var kb := knockback_component.process_knockback(delta)
	velocity = movement + kb
	
	move_and_slide()
```

### Hitstop (Freeze Frames)

For impactful hits, briefly pause the game (or just the attacker and defender):

```gdscript
# hitstop_manager.gd — AutoLoad singleton
extends Node

func freeze(duration: float) -> void:
	# Freeze the entire scene tree briefly.
	get_tree().paused = true
	await get_tree().create_timer(duration, true, false, true).timeout
	get_tree().paused = false
```

> **Note:** For selective hitstop (freeze only combatants, not the UI), set `process_mode = PROCESS_MODE_ALWAYS` on nodes that should keep running during the pause. See [G38 Game Feel & Juice](./G38_game_feel_and_juice.md) for advanced hitstop patterns.

---

## 7. Melee Attack Pipeline

A complete melee attack flow, driven by AnimationPlayer:

```
Input (attack pressed)
  → State machine enters ATTACK state
    → AnimationPlayer plays "slash" animation
      → Animation keyframe calls hitbox.enable() at frame 3
      → Animation keyframe calls hitbox.disable() at frame 6
        → During active frames, Hitbox overlaps Hurtbox
          → Hurtbox.receive_hit() → signal emitted
            → HealthComponent.take_damage()
            → KnockbackComponent.apply()
            → InvincibilityComponent.start()
            → HitstopManager.freeze()
```

### AnimationPlayer Method Calls

In the AnimationPlayer, add **Call Method** tracks to enable/disable the hitbox at precise frames:

```
Track: "Hitbox" → Method Call
  - Time 0.1s: enable()
  - Time 0.3s: disable()
```

This ensures the hitbox is only active during the "active frames" of the attack animation, matching the visual swing.

### Attack State Example

```gdscript
# Inside a state machine (see G2).
class AttackState extends State:
	var can_combo: bool = false
	
	func enter() -> void:
		can_combo = false
		owner.animation_player.play("attack_1")
		# Connect to animation finished to return to idle.
		owner.animation_player.animation_finished.connect(_on_animation_finished)
	
	func exit() -> void:
		owner.hitbox.disable()  # Safety: always disable on exit.
		owner.animation_player.animation_finished.disconnect(_on_animation_finished)
	
	func handle_input(event: InputEvent) -> State:
		if event.is_action_pressed("attack") and can_combo:
			# Queue next attack in combo chain.
			return combo_state
		return null
	
	func _on_animation_finished(_anim_name: String) -> void:
		transition_to("Idle")
```

---

## 8. Ranged / Projectile Attacks

Projectiles are scenes with their own Hitbox:

```gdscript
# projectile.gd
class_name Projectile
extends Area2D

@export var speed: float = 600.0
@export var damage_data: DamageData
@export var lifetime: float = 3.0

var direction: Vector2 = Vector2.RIGHT
var source: Node

func _ready() -> void:
	# Self-destruct after lifetime.
	var timer := get_tree().create_timer(lifetime)
	timer.timeout.connect(queue_free)
	
	# Detect hurtboxes.
	area_entered.connect(_on_area_entered)
	# Detect walls.
	body_entered.connect(_on_body_entered)

func _physics_process(delta: float) -> void:
	position += direction * speed * delta

func _on_area_entered(area: Area2D) -> void:
	if area is Hurtbox:
		area.receive_hit(damage_data, source)
		_impact()

func _on_body_entered(_body: Node2D) -> void:
	_impact()

func _impact() -> void:
	# Spawn impact particles, play sound, then remove.
	# (Disable collision immediately to prevent multi-hit.)
	set_deferred("monitoring", false)
	# Optional: play impact animation before freeing.
	queue_free()
```

### Spawning Projectiles

```gdscript
# In the player or weapon script:
func fire_projectile() -> void:
	var bullet: Projectile = preload("res://scenes/projectile.tscn").instantiate()
	bullet.global_position = muzzle_marker.global_position
	bullet.direction = (get_global_mouse_position() - global_position).normalized()
	bullet.damage_data = weapon_damage_data
	bullet.source = self
	# Add to the scene tree (not as child of player, so it persists independently).
	get_tree().current_scene.add_child(bullet)
```

---

## 9. Damage Types and Resistances

```gdscript
# resistance_data.gd
class_name ResistanceData
extends Resource

## Maps DamageType → multiplier.
## 0.0 = immune, 0.5 = resistant, 1.0 = normal, 1.5 = weak, 2.0 = very weak.
@export var physical: float = 1.0
@export var fire: float = 1.0
@export var ice: float = 1.0
@export var lightning: float = 1.0
@export var poison: float = 1.0

func get_multiplier(type: DamageData.DamageType) -> float:
	match type:
		DamageData.DamageType.PHYSICAL: return physical
		DamageData.DamageType.FIRE: return fire
		DamageData.DamageType.ICE: return ice
		DamageData.DamageType.LIGHTNING: return lightning
		DamageData.DamageType.POISON: return poison
		_: return 1.0
```

Create `.tres` files per enemy type: a fire elemental might have `fire = 0.0` (immune) and `ice = 2.0` (double damage).

---

## 10. Status Effects

Status effects are time-limited modifiers applied on hit:

```gdscript
# status_effect.gd
class_name StatusEffect
extends Resource

enum EffectType { BURN, FREEZE, POISON, STUN }

@export var effect_type: EffectType
@export var duration: float = 3.0
@export var tick_interval: float = 1.0  ## How often the effect triggers.
@export var tick_damage: float = 5.0    ## Damage per tick (for DoT effects).
@export var speed_multiplier: float = 1.0  ## < 1.0 for slows, 0.0 for stun.
```

```gdscript
# status_effect_manager.gd — child node on any entity that can receive effects
class_name StatusEffectManager
extends Node

signal effect_applied(effect: StatusEffect)
signal effect_removed(effect: StatusEffect)

## Currently active effects: EffectType → { effect, timer, tick_timer }
var _active_effects: Dictionary = {}

## The HealthComponent to apply tick damage to.
@export var health_component: HealthComponent

func apply_effect(effect: StatusEffect) -> void:
	if effect == null:
		return
	
	# If already active, refresh duration.
	if _active_effects.has(effect.effect_type):
		_active_effects[effect.effect_type]["timer"].start(effect.duration)
		return
	
	# Duration timer.
	var duration_timer := Timer.new()
	duration_timer.one_shot = true
	duration_timer.timeout.connect(_remove_effect.bind(effect.effect_type))
	add_child(duration_timer)
	duration_timer.start(effect.duration)
	
	# Tick timer (for damage-over-time).
	var tick_timer: Timer = null
	if effect.tick_damage > 0.0 and effect.tick_interval > 0.0:
		tick_timer = Timer.new()
		tick_timer.timeout.connect(_on_tick.bind(effect))
		add_child(tick_timer)
		tick_timer.start(effect.tick_interval)
	
	_active_effects[effect.effect_type] = {
		"effect": effect,
		"timer": duration_timer,
		"tick_timer": tick_timer,
	}
	
	effect_applied.emit(effect)

func _on_tick(effect: StatusEffect) -> void:
	if health_component:
		var tick_data := DamageData.new()
		tick_data.amount = effect.tick_damage
		tick_data.type = _effect_to_damage_type(effect.effect_type)
		tick_data.knockback_force = 0.0
		tick_data.causes_hitstun = false
		health_component.take_damage(tick_data)

func _remove_effect(type: StatusEffect.EffectType) -> void:
	if not _active_effects.has(type):
		return
	var entry: Dictionary = _active_effects[type]
	entry["timer"].queue_free()
	if entry["tick_timer"]:
		entry["tick_timer"].queue_free()
	var effect: StatusEffect = entry["effect"]
	_active_effects.erase(type)
	effect_removed.emit(effect)

func get_speed_multiplier() -> float:
	var multiplier := 1.0
	for entry: Dictionary in _active_effects.values():
		var effect: StatusEffect = entry["effect"]
		multiplier *= effect.speed_multiplier
	return multiplier

func has_effect(type: StatusEffect.EffectType) -> bool:
	return _active_effects.has(type)

func _effect_to_damage_type(type: StatusEffect.EffectType) -> DamageData.DamageType:
	match type:
		StatusEffect.EffectType.BURN: return DamageData.DamageType.FIRE
		StatusEffect.EffectType.POISON: return DamageData.DamageType.POISON
		StatusEffect.EffectType.FREEZE: return DamageData.DamageType.ICE
		_: return DamageData.DamageType.TRUE
```

---

## 11. C# Examples

### DamageData

```csharp
using Godot;

[GlobalClass]
public partial class DamageData : Resource
{
    public enum DamageType { Physical, Fire, Ice, Lightning, Poison, True }

    [Export] public float Amount { get; set; } = 10f;
    [Export] public DamageType Type { get; set; } = DamageType.Physical;
    [Export] public float KnockbackForce { get; set; } = 200f;
    [Export] public bool CausesHistun { get; set; } = true;
    [Export] public float HitstunDuration { get; set; } = 0.1f;
    [Export] public float CritMultiplier { get; set; } = 1f;
}
```

### Hitbox

```csharp
using Godot;

[GlobalClass]
public partial class Hitbox : Area2D
{
    [Export] public DamageData DamageData { get; set; }
    public Node Source { get; set; }

    public override void _Ready()
    {
        Monitoring = true;
        Monitorable = false;
        SetCollisionEnabled(false);
        AreaEntered += OnAreaEntered;
    }

    private void OnAreaEntered(Area2D area)
    {
        if (area is Hurtbox hurtbox)
            hurtbox.ReceiveHit(DamageData, Source);
    }

    public void Enable() => SetCollisionEnabled(true);
    public void Disable() => SetCollisionEnabled(false);

    private void SetCollisionEnabled(bool enabled)
    {
        foreach (var child in GetChildren())
        {
            if (child is CollisionShape2D shape)
                shape.SetDeferred("disabled", !enabled);
        }
    }
}
```

### HealthComponent

```csharp
using Godot;

[GlobalClass]
public partial class HealthComponent : Node
{
    [Signal] public delegate void HealthChangedEventHandler(float newHealth, float maxHealth);
    [Signal] public delegate void DiedEventHandler();

    [Export] public float MaxHealth { get; set; } = 100f;
    public float CurrentHealth { get; private set; }

    public override void _Ready() => CurrentHealth = MaxHealth;

    public float TakeDamage(DamageData data)
    {
        float finalDamage = Mathf.Max(data.Amount * data.CritMultiplier, 0f);
        CurrentHealth = Mathf.Max(CurrentHealth - finalDamage, 0f);

        EmitSignal(SignalName.HealthChanged, CurrentHealth, MaxHealth);
        if (CurrentHealth <= 0f) EmitSignal(SignalName.Died);

        return finalDamage;
    }
}
```

---

## 12. Common Pitfalls

### Hitbox stays active after animation

**Problem:** Switching states mid-animation leaves the hitbox enabled.
**Solution:** Always call `hitbox.disable()` in the attack state's `exit()` method, not just at animation end.

### Self-damage

**Problem:** An entity's own hitbox overlaps its own hurtbox.
**Solution:** Pass the `source` node through the damage pipeline and check `if source == owner: return` in the hurtbox, or put the entity's hitbox and hurtbox on separate collision layers that don't interact.

### Multi-hit on a single swing

**Problem:** A hitbox touching a hurtbox for multiple physics frames triggers damage every frame.
**Solution:** Track which hurtboxes have already been hit during this attack activation. Clear the list when the hitbox is disabled:

```gdscript
# In hitbox.gd
var _hit_targets: Array[Hurtbox] = []

func _on_area_entered(area: Area2D) -> void:
	if area is Hurtbox and area not in _hit_targets:
		_hit_targets.append(area)
		area.receive_hit(damage_data, source)

func disable() -> void:
	_set_collision_enabled(false)
	_hit_targets.clear()
```

### Modifying collision shapes during physics callbacks

**Problem:** Calling `disabled = true` on a CollisionShape2D inside `_on_area_entered` causes errors because the physics engine is mid-step.
**Solution:** Always use `set_deferred("disabled", true)` to delay the change until after the physics step completes.

### Damage numbers don't match expectations

**Problem:** Resistance multipliers or crit multipliers compound unexpectedly.
**Solution:** Define a clear damage formula and document it:

```
final_damage = base_amount × crit_multiplier × resistance_multiplier
```

Keep the formula in one place (`HealthComponent.take_damage()`) so every damage source goes through the same calculation.
