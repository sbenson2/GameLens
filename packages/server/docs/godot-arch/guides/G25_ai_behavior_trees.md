# G25 — AI & Behavior Trees

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#  
> **Related:** [G14 Navigation & Pathfinding](./G14_navigation_and_pathfinding.md) · [G2 State Machine](./G2_state_machine.md) · [G3 Signal Architecture](./G3_signal_architecture.md) · [G18 Performance Profiling](./G18_performance_profiling.md)

---

## What This Guide Covers

State machines (G2) are great for player characters and simple NPCs, but they collapse under complexity — an enemy that patrols, investigates sounds, calls allies, flanks, retreats when hurt, and picks up health packs needs dozens of states with exponential transitions. Behavior trees solve this by decomposing AI into small, reusable tasks composed hierarchically.

This guide covers behavior tree fundamentals, building a custom BT system in GDScript, using the LimboAI and Beehave addons, blackboard data sharing, utility AI for decision-making, Goal-Oriented Action Planning (GOAP), and integration with Godot's NavigationServer and signal systems.

**Use behavior trees when:** your NPCs need more than 4-5 states, behaviors should be reusable across enemy types, or you need visual debugging of AI decision flow.

**Don't use behavior trees when:** a simple state machine (G2) handles the job. A patrol-chase-attack enemy doesn't need a BT. Profile complexity, not cleverness.

---

## Table of Contents

1. [Why Not Just State Machines?](#1-why-not-just-state-machines)
2. [Behavior Tree Fundamentals](#2-behavior-tree-fundamentals)
3. [Node Types — The Building Blocks](#3-node-types--the-building-blocks)
4. [Blackboard — Sharing Data Between Tasks](#4-blackboard--sharing-data-between-tasks)
5. [Building a Minimal BT in GDScript](#5-building-a-minimal-bt-in-gdscript)
6. [LimboAI — Production-Grade Behavior Trees](#6-limboai--production-grade-behavior-trees)
7. [Beehave — GDScript-Native Behavior Trees](#7-beehave--gdscript-native-behavior-trees)
8. [Common AI Patterns](#8-common-ai-patterns)
9. [Utility AI — Scoring Decisions](#9-utility-ai--scoring-decisions)
10. [Goal-Oriented Action Planning (GOAP)](#10-goal-oriented-action-planning-goap)
11. [Integration with Navigation](#11-integration-with-navigation)
12. [Performance Considerations](#12-performance-considerations)
13. [Debugging AI](#13-debugging-ai)
14. [Common Mistakes & Fixes](#14-common-mistakes--fixes)

---

## 1. Why Not Just State Machines?

State machines work when transitions are predictable:

```
Idle → detect player → Chase → in range → Attack → target lost → Idle
```

But add "retreat when health < 30%", "call for backup", "investigate sound", and "pick up health pack" and you get:

```
States: 7+
Transitions: 20+
Every new behavior multiplies transitions
```

**Behavior trees** flip the model: instead of defining transitions between states, you define **priority-ordered tasks** that the AI evaluates each tick. Adding a new behavior means adding a branch — existing branches don't change.

| Criteria | State Machine | Behavior Tree |
|---|---|---|
| Complexity scaling | O(n²) transitions | O(n) branches |
| Adding behaviors | Touch existing states | Add new branch |
| Reusability | Low (states are context-specific) | High (tasks are composable) |
| Visual debugging | State diagram | Tree hierarchy |
| Best for | Player characters, simple NPCs | Complex NPCs, bosses, squads |

---

## 2. Behavior Tree Fundamentals

A behavior tree is a directed acyclic graph (a tree) evaluated **top-down, left-to-right** every tick. Each node returns one of three statuses:

| Status | Meaning |
|---|---|
| `SUCCESS` | Task completed successfully |
| `FAILURE` | Task failed (not an error — just "can't do this") |
| `RUNNING` | Task is in progress, check again next tick |

The root ticks its child. That child ticks its children. Leaf nodes do the actual work (check conditions, perform actions). Internal nodes control flow.

```
        [Selector]              ← Try each child until one succeeds
       /     |      \
  [Sequence]  [Sequence]  [Action: Idle]
  /    \       /    \
[Cond]  [Act]  [Cond]  [Act]
CanSee  Chase  IsHurt  Flee
```

**Tick frequency:** Don't tick the full tree every `_process` frame. Use a timer (0.1–0.5s) or tick only on events. Most AI decisions don't need 60Hz evaluation.

---

## 3. Node Types — The Building Blocks

### Composite Nodes (have children)

**Sequence** — AND logic. Runs children left-to-right. Fails on first failure. Succeeds when all succeed.
```
[Sequence]
├── CanSeeTarget?     → SUCCESS
├── IsInRange?        → SUCCESS  
└── Attack            → SUCCESS
Result: SUCCESS (all passed)
```

**Selector (Fallback)** — OR logic. Runs children left-to-right. Succeeds on first success. Fails when all fail.
```
[Selector]
├── [Sequence: Attack]  → FAILURE (can't see target)
├── [Sequence: Patrol]  → SUCCESS
└── Idle                → (not reached)
Result: SUCCESS (patrol worked)
```

**Parallel** — Runs all children simultaneously. Policy determines success/failure (require all, require one, etc.).

### Decorator Nodes (one child, modify behavior)

| Decorator | Effect |
|---|---|
| **Inverter** | Flips SUCCESS ↔ FAILURE |
| **Repeater** | Runs child N times or until failure |
| **AlwaysSucceed** | Returns SUCCESS regardless |
| **AlwaysFail** | Returns FAILURE regardless |
| **Cooldown** | Prevents re-execution for N seconds |
| **TimeLimit** | Forces FAILURE after N seconds |
| **Condition** | Guards child with a boolean check |

### Leaf Nodes (no children, do the work)

**Conditions** — Check world state. Pure functions, no side effects.
```gdscript
# Is the target visible?
# Is health below threshold?
# Is the path clear?
```

**Actions** — Do things. Move, attack, play animation, set blackboard values.
```gdscript
# Move to position
# Fire weapon
# Play alert animation
# Set "last_seen_position" on blackboard
```

---

## 4. Blackboard — Sharing Data Between Tasks

The **blackboard** is a shared key-value store that tasks read from and write to. It replaces direct coupling between tasks.

```gdscript
# Instead of this (tightly coupled):
chase_task.target = detection_task.detected_enemy

# Use a blackboard (loosely coupled):
blackboard.set_value("target", detected_enemy)  # detection writes
var target = blackboard.get_value("target")      # chase reads
```

### Blackboard Architecture

```gdscript
class_name Blackboard
extends RefCounted

var _data: Dictionary = {}

func set_value(key: StringName, value: Variant) -> void:
    _data[key] = value

func get_value(key: StringName, default: Variant = null) -> Variant:
    return _data.get(key, default)

func has_value(key: StringName) -> bool:
    return _data.has(key)

func erase(key: StringName) -> void:
    _data.erase(key)
```

### Common Blackboard Keys

| Key | Type | Set By | Read By |
|---|---|---|---|
| `target` | `Node2D` | Detection | Chase, Attack, Aim |
| `target_last_position` | `Vector2` | Detection | Investigate, Search |
| `health_ratio` | `float` | Health component | Flee, Heal decisions |
| `home_position` | `Vector2` | Spawn setup | Patrol, Return |
| `allies_nearby` | `int` | Perception | Call backup, Formation |
| `current_cover` | `Node2D` | Cover search | Take cover, Peek |

---

## 5. Building a Minimal BT in GDScript

Here's a complete, minimal behavior tree system you can build from scratch — no addons needed.

### Core Types

```gdscript
# bt_status.gd
class_name BTStatus

enum { SUCCESS, FAILURE, RUNNING }
```

### Base Task

```gdscript
# bt_task.gd
class_name BTTask
extends Resource

var actor: Node  # The entity this AI controls
var blackboard: Blackboard

func setup(p_actor: Node, p_blackboard: Blackboard) -> void:
    actor = p_actor
    blackboard = p_blackboard
    for child in get_children():
        child.setup(p_actor, p_blackboard)

func tick(_delta: float) -> int:
    return BTStatus.FAILURE

func get_children() -> Array[BTTask]:
    return []
```

### Composite: Sequence

```gdscript
# bt_sequence.gd
class_name BTSequence
extends BTTask

@export var children: Array[BTTask] = []
var _running_child: int = 0

func tick(delta: float) -> int:
    for i in range(_running_child, children.size()):
        var status := children[i].tick(delta)
        match status:
            BTStatus.RUNNING:
                _running_child = i
                return BTStatus.RUNNING
            BTStatus.FAILURE:
                _running_child = 0
                return BTStatus.FAILURE
    _running_child = 0
    return BTStatus.SUCCESS

func get_children() -> Array[BTTask]:
    return children
```

### Composite: Selector

```gdscript
# bt_selector.gd
class_name BTSelector
extends BTTask

@export var children: Array[BTTask] = []
var _running_child: int = 0

func tick(delta: float) -> int:
    for i in range(_running_child, children.size()):
        var status := children[i].tick(delta)
        match status:
            BTStatus.RUNNING:
                _running_child = i
                return BTStatus.RUNNING
            BTStatus.SUCCESS:
                _running_child = 0
                return BTStatus.SUCCESS
    _running_child = 0
    return BTStatus.FAILURE

func get_children() -> Array[BTTask]:
    return children
```

### Example Action: Chase Target

```gdscript
# bt_chase_target.gd
class_name BTChaseTarget
extends BTTask

@export var arrive_distance: float = 32.0

func tick(_delta: float) -> int:
    var target: Node2D = blackboard.get_value(&"target")
    if not is_instance_valid(target):
        return BTStatus.FAILURE
    
    var agent: NavigationAgent2D = actor.get_node("NavigationAgent2D")
    agent.target_position = target.global_position
    
    if actor.global_position.distance_to(target.global_position) < arrive_distance:
        return BTStatus.SUCCESS
    
    var next_pos := agent.get_next_path_position()
    var direction := actor.global_position.direction_to(next_pos)
    actor.velocity = direction * actor.move_speed
    actor.move_and_slide()
    return BTStatus.RUNNING
```

### Example Condition: Can See Target

```gdscript
# bt_can_see_target.gd
class_name BTCanSeeTarget
extends BTTask

@export var sight_range: float = 300.0
@export var sight_angle: float = 120.0  # degrees

func tick(_delta: float) -> int:
    var target: Node2D = blackboard.get_value(&"target")
    if not is_instance_valid(target):
        return BTStatus.FAILURE
    
    var distance := actor.global_position.distance_to(target.global_position)
    if distance > sight_range:
        return BTStatus.FAILURE
    
    var to_target := (target.global_position - actor.global_position).normalized()
    var facing := Vector2.from_angle(actor.rotation)
    if rad_to_deg(facing.angle_to(to_target)) > sight_angle / 2.0:
        return BTStatus.FAILURE
    
    # Raycast for line of sight
    var space := actor.get_world_2d().direct_space_state
    var query := PhysicsRayQueryParameters2D.create(
        actor.global_position, target.global_position,
        actor.collision_mask
    )
    query.exclude = [actor.get_rid()]
    var result := space.intersect_ray(query)
    
    if result.is_empty() or result.collider == target:
        blackboard.set_value(&"target_last_position", target.global_position)
        return BTStatus.SUCCESS
    
    return BTStatus.FAILURE
```

### Tree Runner

```gdscript
# bt_runner.gd
class_name BTRunner
extends Node

@export var behavior_tree: BTTask
@export var tick_rate: float = 0.1  # seconds between ticks

var blackboard := Blackboard.new()
var _tick_timer: float = 0.0

func _ready() -> void:
    behavior_tree.setup(get_parent(), blackboard)

func _process(delta: float) -> void:
    _tick_timer += delta
    if _tick_timer >= tick_rate:
        _tick_timer = 0.0
        behavior_tree.tick(delta)
```

---

## 6. LimboAI — Production-Grade Behavior Trees

[LimboAI](https://github.com/limbonaut/limboai) is a C++-based addon that provides editor-integrated behavior trees with visual debugging, blackboard plans, and a rich task library. It reached version 1.0 in February 2026 and supports Godot 4.4+.

### Installation

Install from the Godot Asset Library or download the GDExtension build from GitHub releases. LimboAI ships as a C++ module but fully supports GDScript for custom tasks.

### Key Components

| Component | Purpose |
|---|---|
| `BehaviorTree` | Resource — the tree definition |
| `BTPlayer` | Node — executes a BehaviorTree on its parent |
| `BTAction` | Base class for action tasks |
| `BTCondition` | Base class for condition tasks |
| `BTDecorator` | Base class for decorator tasks |
| `BTComposite` | Base class for composite tasks |
| `Blackboard` | Key-value data store |
| `BlackboardPlan` | Editor-defined blackboard schema |

### Creating a Custom Action

```gdscript
# In GDScript, extend BTAction:
@tool
extends BTAction

@export var speed: float = 200.0

func _generate_name() -> String:
    return "MoveToTarget (speed: %s)" % speed

func _tick(delta: float) -> Status:
    var target: Node2D = blackboard.get_var(&"target")
    if not is_instance_valid(target):
        return FAILURE
    
    var agent: NavigationAgent2D = agent.get_node("NavigationAgent2D")
    agent.target_position = target.global_position
    
    if agent.is_navigation_finished():
        return SUCCESS
    
    var next_pos := agent.get_next_path_position()
    var direction := agent.global_position.direction_to(next_pos)
    agent.velocity = direction * speed
    agent.move_and_slide()
    return RUNNING
```

### Creating a Custom Condition

```gdscript
@tool
extends BTCondition

@export var range_key: StringName = &"detection_range"

func _generate_name() -> String:
    return "IsTargetInRange [%s]" % range_key

func _tick(_delta: float) -> Status:
    var target: Node2D = blackboard.get_var(&"target")
    if not is_instance_valid(target):
        return FAILURE
    
    var detection_range: float = blackboard.get_var(range_key, 300.0)
    var distance := agent.global_position.distance_to(target.global_position)
    
    return SUCCESS if distance <= detection_range else FAILURE
```

### Blackboard Plans

LimboAI's BlackboardPlan lets you define expected variables with types and defaults in the editor:

| Variable | Type | Default | Description |
|---|---|---|---|
| `target` | Object (Node2D) | null | Current pursuit target |
| `detection_range` | float | 300.0 | How far the NPC can detect |
| `health_ratio` | float | 1.0 | Current HP / Max HP |
| `home_position` | Vector2 | (0, 0) | Spawn/patrol origin |

Each `BTPlayer` can override BlackboardPlan values per-instance without modifying the shared BehaviorTree resource.

---

## 7. Beehave — GDScript-Native Behavior Trees

[Beehave](https://github.com/bitbrain/beehave) is a pure GDScript addon — lighter than LimboAI, easier to read and modify, and sufficient for many projects.

### Key Differences from LimboAI

| Feature | LimboAI | Beehave |
|---|---|---|
| Implementation | C++ (GDExtension) | Pure GDScript |
| Editor integration | Custom BT editor panel | Scene tree based |
| Performance | Higher (native code) | Good (GDScript) |
| Learning curve | Steeper (custom UI) | Lower (familiar scene tree) |
| Blackboard | Built-in with plans | Dictionary-based |
| Visual debugger | Yes (custom) | Yes (tree view) |

### Tree Setup in Beehave

In Beehave, the behavior tree IS the scene tree. You add nodes as children:

```
BeehaveTree (root)
└── SelectorComposite
    ├── SequenceComposite
    │   ├── CanSeePlayerCondition (custom Leaf)
    │   └── ChasePlayerAction (custom Leaf)
    ├── SequenceComposite
    │   ├── IsHurtCondition (custom Leaf)
    │   └── FleeAction (custom Leaf)
    └── PatrolAction (custom Leaf)
```

### Custom Beehave Action

```gdscript
# chase_player_action.gd
class_name ChasePlayerAction
extends ActionLeaf

func tick(actor: Node, blackboard: Blackboard) -> int:
    var target: Node2D = blackboard.get_value("target")
    if not is_instance_valid(target):
        return FAILURE
    
    var nav_agent: NavigationAgent2D = actor.get_node("NavigationAgent2D")
    nav_agent.target_position = target.global_position
    
    if nav_agent.is_navigation_finished():
        return SUCCESS
    
    var next_pos := nav_agent.get_next_path_position()
    actor.velocity = actor.global_position.direction_to(next_pos) * actor.speed
    actor.move_and_slide()
    return RUNNING
```

---

## 8. Common AI Patterns

### Patrol Pattern

```
[Sequence]
├── GetNextPatrolPoint   → writes "patrol_target" to blackboard
├── MoveTo               → reads "patrol_target", walks there
└── Wait (2-4 seconds)   → idle at patrol point
```

### Alert & Investigate

```
[Sequence]
├── HeardSound?          → checks blackboard "heard_sound_position"
├── SetAlertState        → plays alert animation, sets "alert" flag
├── MoveTo               → moves to sound position
├── LookAround           → rotates, raycasts for player
└── [Selector]
    ├── [Sequence: CanSee → Chase]
    └── ReturnToPatrol
```

### Coordinated Squad AI

```
[Selector]
├── [Sequence: Has orders from squad leader]
│   ├── HasSquadOrder?
│   └── ExecuteSquadOrder  (flank left, suppress, advance)
├── [Sequence: Self-directed combat]
│   ├── CanSeeTarget?
│   ├── SelectCoverPosition
│   └── [Selector]
│       ├── [Sequence: Peek & Shoot]
│       └── [Sequence: Advance to better cover]
└── [Sequence: Regroup]
    ├── TooFarFromSquad?
    └── MoveToSquadLeader
```

### Boss Phase Transitions

```
[Selector]
├── [Decorator: health < 30%]  → Phase 3 tree
├── [Decorator: health < 60%]  → Phase 2 tree
└── Phase 1 tree (default)
```

---

## 9. Utility AI — Scoring Decisions

Utility AI scores each possible action and picks the highest. It's excellent for NPCs that need to balance competing needs (hunger, safety, curiosity).

```gdscript
class_name UtilityAI
extends Node

class ActionScore:
    var action: Callable
    var name: String
    var score: float

var _actions: Array[ActionScore] = []

func add_action(name: String, scorer: Callable, action: Callable) -> void:
    var a := ActionScore.new()
    a.name = name
    a.action = action
    a.score = 0.0
    # scorer is called each evaluation to update the score
    _actions.append(a)

func evaluate(context: Dictionary) -> void:
    var best_score: float = -1.0
    var best_action: ActionScore = null
    
    for action in _actions:
        action.score = action.scorer.call(context)
        if action.score > best_score:
            best_score = action.score
            best_action = action
    
    if best_action:
        best_action.action.call()
```

### Scoring Functions

Design scoring functions as **response curves** that map a world value (0-1) to a desirability (0-1):

```gdscript
# Linear: more hungry → more desire to eat
func score_eat(context: Dictionary) -> float:
    return 1.0 - context.hunger_ratio  # 0=full, 1=starving

# Exponential: only flee when health is critically low
func score_flee(context: Dictionary) -> float:
    var health_ratio: float = context.health_ratio
    return pow(1.0 - health_ratio, 3)  # spikes below 30%

# Logistic: sharp transition at threshold
func score_attack(context: Dictionary) -> float:
    var distance_ratio: float = context.target_distance / context.attack_range
    return 1.0 / (1.0 + exp(10.0 * (distance_ratio - 0.5)))
```

### Combining BT + Utility AI

Use utility AI to **select which behavior tree to run**, not to replace trees:

```gdscript
# Utility AI picks the goal
var goal := utility_ai.evaluate(context)  # Returns "combat", "explore", "heal"

# Behavior tree executes the goal
match goal:
    "combat": bt_player.set_behavior_tree(combat_tree)
    "explore": bt_player.set_behavior_tree(explore_tree)
    "heal": bt_player.set_behavior_tree(heal_tree)
```

---

## 10. Goal-Oriented Action Planning (GOAP)

GOAP works backwards from a desired world state to find a sequence of actions that achieves it. Each action has preconditions and effects.

```gdscript
class_name GOAPAction
extends Resource

@export var name: String
@export var cost: float = 1.0
var preconditions: Dictionary = {}  # key → required value
var effects: Dictionary = {}        # key → resulting value

func is_valid(world_state: Dictionary) -> bool:
    for key in preconditions:
        if world_state.get(key) != preconditions[key]:
            return false
    return true

func apply(world_state: Dictionary) -> Dictionary:
    var new_state := world_state.duplicate()
    new_state.merge(effects, true)
    return new_state
```

### Example GOAP Actions

| Action | Preconditions | Effects | Cost |
|---|---|---|---|
| AttackEnemy | has_weapon=true, target_visible=true | target_dead=true | 2 |
| PickUpWeapon | weapon_nearby=true | has_weapon=true | 1 |
| MoveToWeapon | knows_weapon_location=true | weapon_nearby=true | 3 |
| Heal | has_potion=true | health_full=true | 1 |
| SearchArea | — | knows_weapon_location=true | 4 |

**Goal:** `target_dead=true`  
**Planner finds:** SearchArea → MoveToWeapon → PickUpWeapon → AttackEnemy (cost: 10)

GOAP is powerful but expensive to plan. Cache plans and replan only when the world state changes significantly.

---

## 11. Integration with Navigation

Behavior trees and navigation (G14) work together constantly. Key patterns:

### NavigationAgent2D in BT Actions

```gdscript
# Standard "move to" action used by many behaviors
extends BTAction

func _tick(delta: float) -> Status:
    var target_pos: Vector2 = blackboard.get_var(&"move_target")
    var nav: NavigationAgent2D = agent.get_node("NavigationAgent2D")
    nav.target_position = target_pos
    
    if nav.is_navigation_finished():
        return SUCCESS
    
    # Use NavigationAgent's avoidance
    var next := nav.get_next_path_position()
    var desired_velocity := agent.global_position.direction_to(next) * agent.speed
    nav.velocity = desired_velocity  # triggers velocity_computed signal
    return RUNNING
```

### Connecting Avoidance

```gdscript
func _ready() -> void:
    var nav: NavigationAgent2D = $NavigationAgent2D
    nav.velocity_computed.connect(_on_velocity_computed)
    nav.avoidance_enabled = true

func _on_velocity_computed(safe_velocity: Vector2) -> void:
    velocity = safe_velocity
    move_and_slide()
```

---

## 12. Performance Considerations

| Issue | Impact | Fix |
|---|---|---|
| Ticking every frame | 60 ticks/s × 100 NPCs = 6000 ticks | Use timer (0.1–0.5s per NPC) |
| All NPCs tick same frame | Frame spike | Stagger ticks across frames |
| Deep trees | More nodes to evaluate | Keep trees under 30 nodes; use subtrees |
| Raycasts in conditions | Physics queries per tick | Cache results for 0.1–0.2s |
| Pathfinding per tick | NavigationServer load | Only request new path when target moves significantly |

### Staggered Ticking

```gdscript
# Distribute NPC ticks across frames
var _npc_pool: Array[BTRunner] = []
var _tick_index: int = 0
var _npcs_per_frame: int = 10

func _process(delta: float) -> void:
    for i in range(_npcs_per_frame):
        if _tick_index >= _npc_pool.size():
            _tick_index = 0
        _npc_pool[_tick_index].manual_tick(delta)
        _tick_index += 1
```

### LOD for AI

Reduce AI complexity based on distance from the camera:

| Distance | AI Level | Tick Rate | Pathfinding |
|---|---|---|---|
| < 20m | Full BT | 0.1s | NavigationAgent |
| 20–50m | Simplified BT | 0.3s | Direct movement |
| 50–100m | State machine only | 0.5s | Waypoint lerp |
| > 100m | Frozen | None | None |

---

## 13. Debugging AI

### Visual Debug Overlay

```gdscript
# Draw AI state above the NPC
func _draw() -> void:
    if not OS.is_debug_build():
        return
    
    var state_text := blackboard.get_value(&"current_state", "unknown")
    var target: Node2D = blackboard.get_value(&"target")
    
    draw_string(ThemeDB.fallback_font, Vector2(0, -40), state_text,
        HORIZONTAL_ALIGNMENT_CENTER, -1, 12, Color.YELLOW)
    
    if is_instance_valid(target):
        draw_line(Vector2.ZERO, to_local(target.global_position), Color.RED, 1.0)
```

### LimboAI Visual Debugger

LimboAI includes a built-in visual debugger accessible from the Godot editor's bottom panel. It shows:
- Current tree execution path (highlighted nodes)
- Task return values per tick
- Blackboard variable values in real-time
- Execution time per node

### Print-Based Debugging

```gdscript
# Add to any BTTask for quick debugging
func _tick(delta: float) -> Status:
    var result := _do_tick(delta)
    if OS.is_debug_build():
        print("[%s] %s → %s" % [
            agent.name,
            _generate_name(),
            ["SUCCESS", "FAILURE", "RUNNING"][result]
        ])
    return result
```

---

## 14. Common Mistakes & Fixes

| Mistake | Problem | Fix |
|---|---|---|
| Ticking the full tree every `_process` | Wasted CPU for decisions that don't change at 60Hz | Tick at 0.1–0.5s intervals |
| Conditions with side effects | Conditions should only READ state, never modify it | Move side effects to Actions |
| Not handling `RUNNING` in composites | Child returns RUNNING but parent restarts from child 0 | Track running child index |
| Forgetting to invalidate blackboard refs | Target gets `queue_free()`, blackboard still holds reference | Check `is_instance_valid()` before use |
| Overly deep trees | Hard to debug, slow to evaluate | Flatten with subtrees; max ~3-4 levels |
| No fallback behavior | Tree returns FAILURE at root → NPC freezes | Always end Selector with a safe fallback (Idle) |
| Coupling tasks to specific enemy types | Can't reuse tasks across enemy variants | Read all context from blackboard, not hardcoded refs |
| Raycasting every tick for LOS | Performance death with many NPCs | Cache LOS results with a cooldown timer |

---

## C# Equivalents

### Custom BT Task in C#

```csharp
// For LimboAI with C#:
using Godot;
using LimboAI;

[Tool]
public partial class MoveToTarget : BTAction
{
    [Export] public float Speed = 200f;
    
    public override string _GenerateName() => $"MoveToTarget (speed: {Speed})";
    
    public override Status _Tick(double delta)
    {
        var target = Blackboard.GetVar<Node2D>("target");
        if (!GodotObject.IsInstanceValid(target))
            return Status.Failure;
        
        var nav = Agent.GetNode<NavigationAgent2D>("NavigationAgent2D");
        nav.TargetPosition = target.GlobalPosition;
        
        if (nav.IsNavigationFinished())
            return Status.Success;
        
        var nextPos = nav.GetNextPathPosition();
        var direction = Agent.GlobalPosition.DirectionTo(nextPos);
        Agent.Velocity = direction * Speed;
        ((CharacterBody2D)Agent).MoveAndSlide();
        return Status.Running;
    }
}
```

### Simple Utility AI in C#

```csharp
using Godot;
using System.Collections.Generic;
using System.Linq;

public partial class UtilityAI : Node
{
    private record struct ScoredAction(string Name, float Score, System.Action Execute);
    private List<System.Func<Dictionary, ScoredAction>> _evaluators = new();
    
    public void Evaluate(Dictionary context)
    {
        var best = _evaluators
            .Select(e => e(context))
            .OrderByDescending(a => a.Score)
            .FirstOrDefault();
        
        best.Execute?.Invoke();
    }
}
```

---

## Decision Framework: Which AI System?

| Game Type | Recommended Approach |
|---|---|
| Simple platformer enemies | State machine (G2) |
| Stealth game guards | Behavior tree (this guide) |
| RPG companions | BT + Utility AI for need balancing |
| RTS units | Utility AI for role selection + BT for execution |
| Open-world NPCs | GOAP for high-level goals + BT for execution |
| Boss fights | Phased state machine OR phased BT |
| Puzzle game AI | State machine or scripted sequences |

Start simple. Add complexity only when the AI feels "dumb" despite correct navigation. Most games ship with state machines and basic BTs — GOAP is rarely needed outside strategy/simulation games.
