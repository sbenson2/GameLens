# G3 — Signal Architecture

> **Engine:** Godot 4.4+ · **Language:** Typed GDScript  
> **Scope:** Signals, signal buses, groups, decoupled communication  
> **Tier:** Free (Sections 1-4) · Pro (Sections 5-8)  
> **Prerequisites:** [G1 Scene Composition](./G1_scene_composition.md), [E1 Architecture Overview](../architecture/E1_architecture_overview.md)

---

## Table of Contents

1. [Why Signals Matter](#1-why-signals-matter)
2. [Signal Fundamentals](#2-signal-fundamentals)
3. [Connection Patterns](#3-connection-patterns)
4. [The Signal Bus](#4-the-signal-bus)
5. [Groups — Broadcast Without Wiring](#5-groups--broadcast-without-wiring) *(Pro)*
6. [Advanced Signal Patterns](#6-advanced-signal-patterns) *(Pro)*
7. [Anti-Patterns & Debugging](#7-anti-patterns--debugging) *(Pro)*
8. [Architecture Decision Guide](#8-architecture-decision-guide) *(Pro)*

---

## 1. Why Signals Matter

Signals are Godot's built-in Observer pattern — the **primary decoupling mechanism** in the engine.

### The Coupling Problem

```gdscript
# ❌ Tightly coupled — Player knows about every other node
func take_damage(amount: int) -> void:
    health -= amount
    get_node("../../UI/HUD/HealthBar").value = health
    get_node("../../Audio/SFXPlayer").play_hurt()
    get_node("../../Camera").shake(0.3)
```

This breaks when you rename nodes, reuse the scene, or test in isolation.

### The Signal Solution

```gdscript
# ✅ Decoupled — Player announces, doesn't care who listens
signal damaged(amount: int, new_health: int)
signal died

func take_damage(amount: int) -> void:
    health -= amount
    damaged.emit(amount, health)
    if health <= 0:
        died.emit()
```

HUD, camera, audio, achievements — any node can subscribe without the Player knowing they exist.

### When to Use Each

| Use Signals | Use Direct Calls |
|---|---|
| Multiple listeners might care | Exactly one target, always present |
| Publisher shouldn't know subscriber | Parent calling known child |
| Notification: "this happened" | Command: "do this" |
| Reuse the scene elsewhere | Internal to the scene |

**Rule of thumb:** Call **down** the tree (parent → child), signal **up** (child → parent). Siblings communicate through their shared parent or a signal bus.

---

## 2. Signal Fundamentals

### 2.1 Declaring & Emitting

Signals go at the top of a script, after `class_name`, before variables:

```gdscript
class_name Chest
extends StaticBody2D

signal opened
signal item_dropped(item: ItemData, position: Vector2)
signal damage_dealt(target: Node2D, amount: int, type: StringName, is_critical: bool)
```

**Naming:** Past tense for events (`opened`, `died`, `health_changed`). Never prefix with `on_` — that's for handlers.

```gdscript
# Emitting — parameters must match declaration
opened.emit()
item_dropped.emit(loot_table.roll(), global_position)
```

Emitting with zero connections is essentially free — don't guard emits with connection checks.

### 2.2 Connecting in Code

```gdscript
func _ready() -> void:
    chest.opened.connect(_on_chest_opened)
    chest.item_dropped.connect(_on_item_dropped)

func _on_chest_opened() -> void:
    quest_tracker.mark_chest_found()

func _on_item_dropped(item: ItemData, pos: Vector2) -> void:
    inventory.try_add(item)
```

**Handler naming convention:** `_on_<emitter>_<signal_name>`.

### 2.3 Editor Connections

Select node → **Node** tab → **Signals** → double-click to connect. Editor connections appear as green icons and are stored in the `.tscn` file.

- **Editor:** Static relationships within a single scene (button → handler)
- **Code:** Dynamic relationships, cross-scene, runtime-spawned nodes

### 2.4 Key Built-in Signals

```gdscript
# Node lifecycle
ready / tree_entered / tree_exiting

# Timer
timeout

# Area2D
area_entered(area: Area2D) / body_entered(body: Node2D)

# Button
pressed / toggled(toggled_on: bool)

# AnimationPlayer
animation_finished(anim_name: StringName)

# LineEdit
text_changed(new_text: String) / text_submitted(new_text: String)
```

Always check docs for built-in signals before creating custom ones.

---

## 3. Connection Patterns

### 3.1 Lambda Connections

For simple 1-3 line reactions:

```gdscript
$Button.pressed.connect(func() -> void: visible = false)

$Slider.value_changed.connect(
    func(value: float) -> void:
        $Label.text = "Volume: %d%%" % int(value * 100)
)
```

**Caveat:** Lambdas are anonymous — you can't disconnect them by reference. Use named methods when you need to disconnect later.

### 3.2 One-Shot & Deferred

```gdscript
# Auto-disconnects after one fire
enemy.died.connect(_on_boss_first_kill, CONNECT_ONE_SHOT)

# Wait for animation then free
$AnimationPlayer.play("death")
$AnimationPlayer.animation_finished.connect(
    func(_name: StringName) -> void: queue_free(),
    CONNECT_ONE_SHOT
)

# Handler runs at end of frame — safe for tree modifications during physics
body_entered.connect(_on_body_entered, CONNECT_DEFERRED)
```

### 3.3 Binding Extra Arguments

```gdscript
# Pass slot index to handler
for i: int in range(slots.size()):
    slots[i].pressed.connect(_on_slot_pressed.bind(i))

func _on_slot_pressed(slot_index: int) -> void:
    select_slot(slot_index)
```

### 3.4 Awaiting Signals

Signals can pause execution like async/await:

```gdscript
$AnimationPlayer.play("intro_cutscene")
await $AnimationPlayer.animation_finished

await get_tree().create_timer(2.0).timeout

# Sequence multiple operations
func open_door_sequence() -> void:
    $AnimationPlayer.play("door_open")
    await $AnimationPlayer.animation_finished
    $AudioStreamPlayer.play()
    await $AudioStreamPlayer.finished
    door_fully_opened.emit()
```

**Caution:** The node can be freed during an await. Check `is_instance_valid(self)` after long waits. Never await inside `_process` or `_physics_process`.

### 3.5 Disconnecting

```gdscript
player.health_changed.disconnect(_on_player_health_changed)

# Check first
if player.health_changed.is_connected(_on_player_health_changed):
    player.health_changed.disconnect(_on_player_health_changed)
```

**When to disconnect:** Listener is freed but emitter persists. **When not to:** Both freed together, or listener is a child of emitter (Godot handles cleanup).

---

## 4. The Signal Bus

### 4.1 Why You Need One

Within a scene, signals flow through the tree. Across scene branches (Player → HUD, Enemy → QuestSystem), you need a global rendezvous point.

### 4.2 Implementation

```gdscript
# events.gd — Register as Autoload named "Events"
extends Node

# Player
signal player_died
signal player_health_changed(current: int, maximum: int)

# Combat
signal damage_dealt(source: Node2D, target: Node2D, amount: int)
signal entity_killed(entity: Node2D, killer: Node2D)

# Progression
signal experience_gained(amount: int)
signal level_up(new_level: int)
signal quest_completed(quest_id: StringName)

# Economy
signal coins_changed(new_total: int)
signal item_acquired(item: ItemData)

# Game flow
signal level_started(level_id: StringName)
signal level_completed(level_id: StringName)

# UI
signal dialog_started(dialog_id: StringName)
signal dialog_ended
signal notification_requested(message: String, duration: float)
```

Register in **Project → Project Settings → Autoload** as `Events`.

### 4.3 Usage

```gdscript
# Emitting (from any script)
func take_damage(amount: int) -> void:
    health -= amount
    Events.player_health_changed.emit(health, max_health)
    if health <= 0:
        Events.player_died.emit()

# Subscribing (from any script)
func _ready() -> void:
    Events.player_health_changed.connect(_on_health_changed)
    Events.coins_changed.connect(_on_coins_changed)

func _on_health_changed(current: int, maximum: int) -> void:
    $HealthBar.max_value = maximum
    $HealthBar.value = current
```

### 4.4 Bus vs Direct Signals

| | Direct Signal | Signal Bus |
|---|---|---|
| **Scope** | Within/between nearby scenes | Anywhere in the game |
| **Coupling** | Low (need emitter reference) | None (reference autoload only) |
| **Debugging** | Easier to trace | Need search/grep |
| **Use when** | Parent ↔ child, siblings | Cross-scene, cross-system |

**Guideline:** Start with direct signals. Promote to the bus when you chain signals through intermediaries or when unrelated systems react to the same event.

---

## 5. Groups — Broadcast Without Wiring

### 5.1 Basics

Groups are tags on nodes. Broadcast to all members without individual connections:

```gdscript
# Adding
func _ready() -> void:
    add_to_group("enemies")
    add_to_group("damageable")

# Broadcasting
get_tree().call_group("enemies", "alert", player.global_position)
get_tree().call_group("damageable", "take_damage", 50)

# Querying
var enemies: Array[Node] = get_tree().get_nodes_in_group("enemies")
var count: int = get_tree().get_nodes_in_group("enemies").size()
```

### 5.2 Groups as Game Logic Tags

```gdscript
# Hitbox detection without type checking
func _on_hurtbox_area_entered(hitbox: Area2D) -> void:
    if hitbox.is_in_group("player_attack"):
        take_damage(hitbox.get_meta("damage", 10))
    elif hitbox.is_in_group("environmental_hazard"):
        take_damage(hitbox.get_meta("damage", 5))

# Save system — serialize tagged nodes
func save_game() -> Dictionary:
    var save_data: Dictionary = {}
    for node: Node in get_tree().get_nodes_in_group("serializable"):
        if node.has_method("serialize"):
            save_data[node.get_path()] = node.serialize()
    return save_data

# Pause system
func pause_gameplay() -> void:
    get_tree().call_group("pauseable", "on_pause")
    get_tree().paused = true
```

### 5.3 Communication Method Comparison

| Mechanism | Direction | Coupling | Best For |
|---|---|---|---|
| Direct call | Known target | Tight | Parent → child |
| Signal | Emitter → subscribers | Loose | Events, state changes |
| Signal bus | Global emit → global subscribe | None | Cross-system events |
| Group call | Broadcast → all tagged | None (by name) | Mass commands, queries |

---

## 6. Advanced Signal Patterns

### 6.1 Signal Relay (Facade)

Parent scene exposes child signals as its own public interface:

```gdscript
class_name Player
extends CharacterBody2D

signal health_changed(current: int, maximum: int)
signal died

@onready var _health: HealthComponent = $HealthComponent

func _ready() -> void:
    # Shorthand: relay when signatures match
    _health.died.connect(died.emit)
    _health.health_changed.connect(health_changed.emit)
```

External code connects to `player.health_changed` without knowing about `HealthComponent`. Refactor internals freely.

### 6.2 Typed Event Objects

For complex events, pass a Resource instead of loose parameters:

```gdscript
class_name DamageEvent
extends RefCounted

var source: Node2D
var target: Node2D
var amount: int
var type: StringName = &"physical"
var is_critical: bool
var knockback_direction: Vector2

static func create(src: Node2D, tgt: Node2D, amt: int) -> DamageEvent:
    var e := DamageEvent.new()
    e.source = src
    e.target = tgt
    e.amount = amt
    return e
```

```gdscript
signal damage_processed(event: DamageEvent)

func process_hit(attacker: Node2D, base_damage: int) -> void:
    var event := DamageEvent.create(attacker, self, base_damage)
    event.is_critical = randf() < crit_chance
    if event.is_critical:
        event.amount = int(event.amount * crit_multiplier)
    event.knockback_direction = (global_position - attacker.global_position).normalized()
    health -= event.amount
    damage_processed.emit(event)
```

**Advantages:** Add fields without changing handler signatures. Same event flows to damage numbers, combat log, and achievements.

### 6.3 Reactive Data Model

Properties with signal-backed setters drive UI automatically:

```gdscript
# player_stats.gd — Autoload "PlayerStats"
extends Node

signal health_changed(current: int, maximum: int)
signal mana_changed(current: int, maximum: int)

var _max_health: int = 100
var _health: int = 100

var health: int:
    get: return _health
    set(value):
        _health = clampi(value, 0, _max_health)
        health_changed.emit(_health, _max_health)

var max_health: int:
    get: return _max_health
    set(value):
        _max_health = maxi(1, value)
        _health = mini(_health, _max_health)
        health_changed.emit(_health, _max_health)
```

```gdscript
# health_bar.gd — subscribes and animates
extends TextureProgressBar

func _ready() -> void:
    PlayerStats.health_changed.connect(_on_health_changed)
    _on_health_changed(PlayerStats.health, PlayerStats.max_health)

func _on_health_changed(current: int, maximum: int) -> void:
    max_value = maximum
    var tween := create_tween()
    tween.tween_property(self, "value", float(current), 0.3)\
        .set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
    if current < int(value):
        modulate = Color.RED
        tween.parallel().tween_property(self, "modulate", Color.WHITE, 0.5)
```

### 6.4 Async Signal Chains (Cutscenes)

```gdscript
func play_boss_intro() -> void:
    Events.dialog_started.emit(&"boss_intro")
    
    $Camera.pan_to(boss.global_position, 1.5)
    await $Camera.pan_finished
    if not is_instance_valid(self): return
    
    boss.play_intro_animation()
    await boss.intro_finished
    if not is_instance_valid(self): return
    
    $DialogBox.show_text("You dare challenge me?")
    await $DialogBox.text_dismissed
    if not is_instance_valid(self): return
    
    $Camera.pan_to(player.global_position, 1.0)
    await $Camera.pan_finished
    if not is_instance_valid(self): return
    
    Events.dialog_ended.emit()
    boss.start_fight()
```

Always check `is_instance_valid(self)` after long awaits — the scene may be freed mid-sequence.

---

## 7. Anti-Patterns & Debugging

### 7.1 Signal Spaghetti

**Symptom:** Every node connects to every other node. Changing one signal breaks five systems.

```gdscript
# ❌ One handler connects to everything
func _ready() -> void:
    player.health_changed.connect(_update_health_bar)
    player.health_changed.connect(_check_low_health_music)
    player.health_changed.connect(_update_damage_vignette)
    player.health_changed.connect(_log_analytics)
    # ... 20 more
```

**Fix:** Group related responses into dedicated handler nodes. Each system owns its domain.

### 7.2 Signal Ping-Pong

**Symptom:** Signal A triggers handler that emits signal B, which triggers handler that emits A. Infinite loop.

```gdscript
# ❌ Slider → Events.volume_changed → AudioManager → Events.settings_updated → Slider.value = ... → loop
```

**Fix:** Guard with a flag:

```gdscript
var _updating: bool = false

func _on_settings_updated() -> void:
    if _updating: return
    _updating = true
    $Slider.value = AudioManager.volume
    _updating = false
```

### 7.3 God Signal Bus

**Symptom:** 100+ signals, everything goes through the bus, even internal events.

**Fix:** Bus signals should be game-level, domain-crossing, meaningful to multiple subscribers. `enemy_1_position_updated` does not belong on the bus. Split into domain autoloads when exceeding ~30 signals.

### 7.4 Performance Characteristics

| Operation | Approximate Cost |
|---|---|
| `emit()` with 0 connections | ~0.1 μs |
| `emit()` with 1 connection | ~0.5 μs |
| Per additional connection | ~0.3 μs each |
| `call_group()` 100 members | ~30-50 μs |

**Practical:** 1,000 signals/frame at 60 FPS ≈ 0.5ms — fine. For per-frame updates on 500+ entities, iterate directly instead of signaling.

### 7.5 Debug Signal Log

```gdscript
# signal_debugger.gd — Autoload, dev builds only
extends CanvasLayer

var _log: Array[String] = []
var _max_entries: int = 20
@onready var _label: RichTextLabel = $Label

func log_signal(emitter: String, sig: String, args: Array = []) -> void:
    var ts: String = "%.2f" % (Time.get_ticks_msec() / 1000.0)
    var args_str: String = ", ".join(args.map(func(a: Variant) -> String: return str(a)))
    _log.append("[%s] [color=cyan]%s[/color].[color=yellow]%s[/color](%s)" % [
        ts, emitter, sig, args_str
    ])
    if _log.size() > _max_entries:
        _log.pop_front()
    _label.text = "\n".join(_log)

func _unhandled_input(event: InputEvent) -> void:
    if event.is_action_pressed("debug_signals"):
        _label.visible = not _label.visible
```

---

## 8. Architecture Decision Guide

### 8.1 Decision Tree

```
Need to communicate between nodes?
│
├─ Same scene?
│  ├─ Parent → Child ────────→ Direct method call
│  ├─ Child → Parent ────────→ Signal (child emits, parent connects)
│  └─ Sibling → Sibling ────→ Signal through parent
│
├─ Different scene branches?
│  ├─ One-to-one ────────────→ Signal bus or shared ancestor
│  ├─ One-to-many ───────────→ Signal bus
│  └─ Many-to-one ──────────→ Signal bus or groups
│
├─ Affect ALL of a type? ──→ Groups + call_group()
│
└─ Cross-system? ──────────→ Signal bus (Events autoload)
```

### 8.2 Scaling by Project Size

| Size | Strategy |
|---|---|
| **Jam** (< 20 scripts) | Direct signals only, no bus |
| **Small** (20-50) | Single `Events` autoload + direct signals |
| **Medium** (50-150) | Split bus by domain + groups |
| **Large** (150+) | Domain buses + typed event objects + relay facades |

### 8.3 Migration: Direct References → Signals

```gdscript
# Before: tight coupling
func kill_enemy() -> void:
    get_node("../../ScoreManager").add_score(100)
    get_node("../../UI/KillCounter").increment()
    get_node("../../Audio").play("enemy_death")
    queue_free()

# After: signal decoupling
signal killed(point_value: int)

func kill_enemy() -> void:
    killed.emit(point_value)
    queue_free()
# ScoreManager, KillCounter, Audio each connect independently
```

### 8.4 Migration: Inheritance → Signal Composition

```gdscript
# Before: BaseEnemy → MeleeEnemy → ShieldedMeleeEnemy → BossShieldedMeleeEnemy
# After: component scenes wired with signals

# Boss scene:
#   CharacterBody2D
#   ├── HealthComponent (emits: health_changed, died)
#   ├── MeleeAttackComponent (emits: attack_started)
#   ├── ShieldComponent (emits: shield_broken)
#   └── BossPhaseComponent (connects to HealthComponent)

# boss_phase_component.gd
func _ready() -> void:
    var hp: HealthComponent = get_parent().get_node("HealthComponent")
    hp.health_changed.connect(_on_health_changed)

func _on_health_changed(current: int, maximum: int) -> void:
    var ratio: float = float(current) / float(maximum)
    if ratio <= 0.5 and _phase == 1:
        _enter_phase_2()
    elif ratio <= 0.2 and _phase == 2:
        _enter_phase_3()
```

### 8.5 Quick Reference

```
DECLARE:    signal name(param: Type)
EMIT:       name.emit(value)
CONNECT:    node.name.connect(callable)
DISCONNECT: node.name.disconnect(callable)
ONE-SHOT:   node.name.connect(callable, CONNECT_ONE_SHOT)
DEFERRED:   node.name.connect(callable, CONNECT_DEFERRED)
BIND:       node.name.connect(callable.bind(extra))
AWAIT:      await node.name
GROUP ADD:  add_to_group("tag")
GROUP CALL: get_tree().call_group("tag", "method", args)
GROUP GET:  get_tree().get_nodes_in_group("tag")

FLOW: Call DOWN · Signal UP · Bus ACROSS · Group BROADCAST
```

---

*Guide version 1.0 · Godot 4.4+ · Typed GDScript throughout*  
*See also: [G1 Scene Composition](./G1_scene_composition.md) · [G2 State Machine](./G2_state_machine.md) · [E1 Architecture Overview](../architecture/E1_architecture_overview.md)*
