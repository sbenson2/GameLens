# G80 — Event Bus and Decoupled Messaging

> **Category:** guide · **Engine:** Godot 4.x · **Related:** [G3 Signal Architecture](./G3_signal_architecture.md) · [G39 Scalable Architecture & Pooling](./G39_scalable_architecture_and_pooling.md) · [G51 Entity Component Patterns](./G51_entity_component_patterns.md) · [G53 Data-Driven Design](./G53_data_driven_design.md)

Godot's built-in signals are excellent for parent-child and sibling communication, but they create tight coupling when distant systems need to talk — a health bar listening to a player three levels up the tree, or an achievement tracker reacting to events from any entity. The **event bus** pattern solves this: a single autoloaded script that holds signals anyone can emit or connect to, decoupling publishers from subscribers entirely. This guide covers when to use an event bus vs direct signals, implementation patterns, typed payloads, performance considerations, and how to avoid the "god object" trap.

---

## Table of Contents

1. [Direct Signals vs Event Bus — When to Use Each](#1-direct-signals-vs-event-bus--when-to-use-each)
2. [Basic Event Bus (Autoload)](#2-basic-event-bus-autoload)
3. [Typed Payloads with Resources](#3-typed-payloads-with-resources)
4. [Scoped Event Channels](#4-scoped-event-channels)
5. [One-Shot and Deferred Connections](#5-one-shot-and-deferred-connections)
6. [Event Bus in C#](#6-event-bus-in-c)
7. [Suppressing Editor Warnings (4.3+)](#7-suppressing-editor-warnings-43)
8. [Performance Considerations](#8-performance-considerations)
9. [Debugging Event Flow](#9-debugging-event-flow)
10. [Anti-Patterns and the God Object Trap](#10-anti-patterns-and-the-god-object-trap)
11. [Architecture Decision Matrix](#11-architecture-decision-matrix)

---

## 1. Direct Signals vs Event Bus — When to Use Each

| Scenario | Use direct signals | Use event bus |
|----------|-------------------|---------------|
| Button pressed → parent dialog | Yes | No |
| Player health changed → HUD health bar | Maybe | Yes — HUD shouldn't know the player's node path |
| Enemy killed → score tracker, achievement system, audio | No — too many subscribers | Yes |
| Animation finished → same node state machine | Yes | No |
| Level loaded → 6 different systems need to react | No | Yes |

**Rule of thumb:** If the emitter needs a `get_node()` path or `@export` reference to the subscriber (or vice versa), an event bus is probably cleaner.

---

## 2. Basic Event Bus (Autoload)

Create a script, register it as an Autoload with **Global Variable** enabled.

### GDScript — `events.gd`

```gdscript
## events.gd — Project > Autoload > "Events" (Global Variable: On)
extends Node

# ─── Player ───
signal player_spawned(player: CharacterBody2D)
signal player_died(position: Vector2)
signal player_health_changed(current: int, maximum: int)

# ─── Combat ───
signal damage_dealt(source: Node, target: Node, amount: float)
signal enemy_killed(enemy: Node, position: Vector2)

# ─── Progression ───
signal xp_gained(amount: int)
signal level_up(new_level: int)
signal achievement_unlocked(id: StringName)

# ─── World ───
signal level_loaded(level_name: String)
signal checkpoint_reached(checkpoint_id: StringName)
signal day_night_changed(is_night: bool)

# ─── UI ───
signal dialog_opened(dialog_id: StringName)
signal dialog_closed()
signal notification_requested(text: String, duration: float)
```

### Emitting from any script

```gdscript
## In enemy.gd — when the enemy dies
Events.enemy_killed.emit(self, global_position)
Events.xp_gained.emit(xp_value)
```

### Subscribing from any script

```gdscript
## In score_tracker.gd
func _ready() -> void:
    Events.enemy_killed.connect(_on_enemy_killed)

func _on_enemy_killed(_enemy: Node, _position: Vector2) -> void:
    score += 100
    Events.notification_requested.emit("Enemy defeated! +100", 2.0)
```

---

## 3. Typed Payloads with Resources

For events carrying complex data, define a `Resource` subclass instead of passing many loose parameters. This makes signals easier to extend without breaking existing subscribers.

### GDScript

```gdscript
## damage_event.gd
class_name DamageEvent
extends Resource

@export var source: Node
@export var target: Node
@export var amount: float
@export var damage_type: StringName  # &"physical", &"fire", etc.
@export var is_critical: bool
@export var position: Vector2
```

```gdscript
## In events.gd
signal damage_dealt(event: DamageEvent)
```

```gdscript
## In weapon.gd
var evt := DamageEvent.new()
evt.source = self
evt.target = target
evt.amount = 25.0
evt.damage_type = &"physical"
evt.is_critical = rng.randf() < crit_chance
evt.position = global_position
Events.damage_dealt.emit(evt)
```

```gdscript
## In damage_numbers_ui.gd — only reads the fields it cares about
func _on_damage_dealt(event: DamageEvent) -> void:
    spawn_number(event.position, event.amount, event.is_critical)
```

**Benefits:**

- Adding `knockback_force` to `DamageEvent` later doesn't break any existing subscriber.
- Subscribers only read the fields they need.
- Easy to serialize for replays or networking.

### C#

```csharp
using Godot;

[GlobalClass]
public partial class DamageEvent : Resource
{
    [Export] public Node Source { get; set; }
    [Export] public Node Target { get; set; }
    [Export] public float Amount { get; set; }
    [Export] public StringName DamageType { get; set; }
    [Export] public bool IsCritical { get; set; }
    [Export] public Vector2 Position { get; set; }
}
```

---

## 4. Scoped Event Channels

As your game grows, a single `Events` autoload can become unwieldy. Split into **domain-specific buses** — each is its own autoload.

```
Autoloads:
  CombatEvents    → damage_dealt, enemy_killed, buff_applied
  UIEvents        → dialog_opened, notification_requested, menu_toggled
  WorldEvents     → level_loaded, checkpoint_reached, day_night_changed
  PlayerEvents    → player_spawned, player_died, health_changed
```

### GDScript — `combat_events.gd`

```gdscript
extends Node

signal damage_dealt(event: DamageEvent)
signal enemy_killed(enemy: Node, position: Vector2)
signal buff_applied(target: Node, buff_id: StringName, duration: float)
signal projectile_hit(projectile: Node, target: Node)
```

**When to split:** Once your single bus exceeds ~15 signals, or when two unrelated systems (e.g., audio and networking) both need combat events and you want to reason about dependencies.

---

## 5. One-Shot and Deferred Connections

### One-shot connections

Use `CONNECT_ONE_SHOT` when a subscriber only needs to react once (e.g., a cutscene trigger).

```gdscript
## Wait for the player to reach the checkpoint, then trigger once.
Events.checkpoint_reached.connect(_on_first_checkpoint, CONNECT_ONE_SHOT)
```

### Deferred connections

Use `CONNECT_DEFERRED` when the handler modifies the scene tree (add/remove nodes). Deferred handlers run at the end of the frame, avoiding "modified while iterating" errors.

```gdscript
Events.enemy_killed.connect(_on_enemy_killed_spawn_loot, CONNECT_DEFERRED)
```

### Disconnecting

Always disconnect when a subscriber is freed, or use `CONNECT_REFERENCE_COUNTED` (default) so the connection is cleaned up automatically when the subscriber's reference count drops. For autoload signals connecting to scene nodes, the connection is automatically broken when the node is freed.

```gdscript
func _exit_tree() -> void:
    # Explicit disconnect — defensive but not strictly required for scene nodes
    if Events.enemy_killed.is_connected(_on_enemy_killed):
        Events.enemy_killed.disconnect(_on_enemy_killed)
```

---

## 6. Event Bus in C#

C# can use Godot signals (interoperable with GDScript) or native C# events. Using Godot signals keeps everything compatible across languages.

### C# — `Events.cs` (Autoload)

```csharp
using Godot;

public partial class Events : Node
{
    // Player
    [Signal] public delegate void PlayerDiedEventHandler(Vector2 position);
    [Signal] public delegate void PlayerHealthChangedEventHandler(int current, int max);

    // Combat
    [Signal] public delegate void EnemyKilledEventHandler(Node enemy, Vector2 position);
    [Signal] public delegate void XpGainedEventHandler(int amount);

    // World
    [Signal] public delegate void LevelLoadedEventHandler(string levelName);
}
```

### Emitting

```csharp
// In Enemy.cs
var events = GetNode<Events>("/root/Events");
events.EmitSignal(Events.SignalName.EnemyKilled, this, GlobalPosition);
```

### Subscribing

```csharp
// In ScoreTracker.cs
public override void _Ready()
{
    var events = GetNode<Events>("/root/Events");
    events.EnemyKilled += OnEnemyKilled;
}

private void OnEnemyKilled(Node enemy, Vector2 position)
{
    _score += 100;
}
```

### Alternative: Pure C# Events

For C#-only codebases, static events avoid Godot overhead:

```csharp
public static class GameEvents
{
    public static event Action<Node, Vector2> EnemyKilled;
    public static event Action<int, int> PlayerHealthChanged;

    public static void RaiseEnemyKilled(Node enemy, Vector2 pos)
        => EnemyKilled?.Invoke(enemy, pos);

    public static void RaisePlayerHealthChanged(int current, int max)
        => PlayerHealthChanged?.Invoke(current, max);
}
```

**Caveat:** Pure C# events are invisible to GDScript and the Godot debugger. Use Godot signals if you mix languages.

---

## 7. Suppressing Editor Warnings (4.3+)

Since Godot 4.3, unused signals in an autoload produce `UNUSED_SIGNAL` warnings. Event bus signals are intentionally unused at the declaration site.

### Option A: Per-signal annotation

```gdscript
@warning_ignore("unused_signal")
signal enemy_killed(enemy: Node, position: Vector2)
```

### Option B: File-level suppression

Add at the top of your event bus script:

```gdscript
@warning_ignore_start("unused_signal")
# ... all signals ...
@warning_ignore_restore("unused_signal")
```

### Option C: Project-level

**Project > Project Settings > Debug > GDScript > Ignore Warnings > Unused Signal** — not recommended, as it suppresses the warning everywhere.

---

## 8. Performance Considerations

- **Signal dispatch is fast.** Godot signals use direct Callable invocations — there is no string lookup at emit time. Thousands of emits per frame are fine.
- **Connection count matters more than emit count.** Each connection adds a Callable to the signal's subscriber list. If 200 enemies each connect to `player_health_changed`, that's 200 callables invoked per emit. Consider whether those enemies really need that signal.
- **Avoid allocating Resources per emit** in hot paths (e.g., per-frame damage ticks). Reuse a pooled `DamageEvent` or pass primitives directly for high-frequency events.
- **Deferred signals add a frame of latency.** Only use `CONNECT_DEFERRED` when you need it for tree-safety.

---

## 9. Debugging Event Flow

### Print-based tracing

Temporarily wrap emit calls:

```gdscript
## In events.gd — debug helper
func trace(signal_name: StringName, args: Array = []) -> void:
    if OS.is_debug_build():
        print("[Events] %s → %s" % [signal_name, args])
```

### Godot Debugger

The **Debugger > Misc > Signals** panel shows active signal connections at runtime. Use this to verify that your subscribers are connected and the signal names match.

### Logging autoload

For complex games, create a small `EventLogger` autoload that connects to every signal on the bus and logs emission with timestamps. Disable in release builds.

```gdscript
## event_logger.gd — autoload, load AFTER Events
extends Node

func _ready() -> void:
    if not OS.is_debug_build():
        return
    for sig: Dictionary in Events.get_signal_list():
        var sig_name: StringName = sig["name"]
        Events.connect(sig_name, _log.bind(sig_name))

func _log() -> void:
    # Last argument is the bound signal name
    var args := _get_args()  # Variadic workaround
    print("[%s] Event: %s" % [Time.get_ticks_msec(), args[-1]])
```

---

## 10. Anti-Patterns and the God Object Trap

### Too many responsibilities

If your event bus starts containing logic (filtering, transforming, routing), it's becoming a god object. The bus should **only declare signals** — zero logic.

```gdscript
## BAD — bus contains logic
signal enemy_killed(enemy: Node, position: Vector2)
func on_enemy_killed(enemy: Node, pos: Vector2) -> void:
    score += enemy.xp_value  # ← This belongs in ScoreTracker, not the bus
    enemy_killed.emit(enemy, pos)
```

### Circular dependencies

System A emits → System B reacts → System B emits → System A reacts. This creates hidden loops. Mitigate with:

- Clear ownership: decide which system "owns" each signal.
- Never emit the same signal from within its own handler.
- Use `call_deferred()` to break synchronous cycles.

### Over-bussing

Not every signal belongs on the bus. A button's `pressed` signal connecting to its parent dialog is fine as a direct connection. Reserve the bus for **cross-system** communication.

---

## 11. Architecture Decision Matrix

| Question | Answer → Pattern |
|----------|-----------------|
| Does the emitter know the subscriber? | Yes → direct signal or `get_node()` |
| Are emitter and subscriber in the same scene? | Yes → direct signal |
| Do multiple unrelated systems need to react? | Yes → event bus |
| Is the event high-frequency (every frame)? | Consider direct signal to avoid many connections |
| Does the payload need to evolve over time? | Yes → typed Resource payload |
| Do you mix GDScript and C#? | Use Godot signals (not pure C# events) |
| Is the signal only needed once? | Use `CONNECT_ONE_SHOT` |
| Does the handler add/remove nodes? | Use `CONNECT_DEFERRED` |
