# G60 — Utility AI & Goal-Oriented Action Planning (GOAP)

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#
> **Related:** [G25 AI & Behavior Trees](./G25_ai_behavior_trees.md) · [G2 State Machines](./G2_state_machine.md) · [G14 Navigation & Pathfinding](./G14_navigation_and_pathfinding.md) · [G53 Data-Driven Design](./G53_data_driven_design.md) · [G3 Signal Architecture](./G3_signal_architecture.md)

---

## What This Guide Covers

Behavior trees (covered in G25) are the most common AI architecture in games, but they aren't the only option. Two powerful alternatives are **Utility AI** (score-based decision making where NPCs pick the highest-scoring action from a set of options) and **GOAP** (Goal-Oriented Action Planning, where NPCs plan sequences of actions to achieve goals by searching a state space).

Utility AI excels when NPCs need to weigh multiple competing priorities smoothly — a survival game NPC deciding whether to eat, sleep, fight, or flee based on continuous needs. GOAP excels when NPCs need to chain multi-step plans — an NPC that decides "I'm hungry → I need food → food is in the chest → the chest is locked → I need a key → the key is on the guard → I need to defeat the guard."

This guide covers both systems: when to choose each, how to implement them in Godot 4.x, and how they integrate with navigation, animation, and the scene tree.

**Use this guide when:** your AI needs are more dynamic than a behavior tree can express cleanly — lots of competing priorities, emergent multi-step plans, or NPCs that should feel like they're "thinking" rather than following a script.

---

## Table of Contents

1. [Choosing Your AI Architecture](#1-choosing-your-ai-architecture)
2. [Utility AI — Concepts](#2-utility-ai--concepts)
3. [Response Curves](#3-response-curves)
4. [Implementing Utility AI in Godot](#4-implementing-utility-ai-in-godot)
5. [Utility AI — Practical Example: Survival NPC](#5-utility-ai--practical-example-survival-npc)
6. [GOAP — Concepts](#6-goap--concepts)
7. [World State and Actions](#7-world-state-and-actions)
8. [The GOAP Planner](#8-the-goap-planner)
9. [GOAP Agent and Action Execution](#9-goap-agent-and-action-execution)
10. [GOAP — Practical Example: Village NPC](#10-goap--practical-example-village-npc)
11. [Hybrid Approaches](#11-hybrid-approaches)
12. [C# Examples](#12-c-examples)
13. [Common Pitfalls](#13-common-pitfalls)

---

## 1. Choosing Your AI Architecture

| Architecture | Best For | Complexity | Emergent Behavior | Authoring Effort |
|-------------|----------|------------|-------------------|-----------------|
| **State Machine** (G2) | Simple AI (2–5 states) | Low | None | Low |
| **Behavior Tree** (G25) | Structured, reactive AI | Medium | Limited | Medium (tree editing) |
| **Utility AI** | Smooth priority balancing | Medium | Moderate | Medium (tuning curves) |
| **GOAP** | Multi-step planning | High | High | High (defining actions/preconditions) |

**Rules of thumb:**

- If your NPC has fewer than 6 actions, a behavior tree is simpler and sufficient.
- If your NPC must weigh 8+ competing priorities with continuous values (hunger, health, fear, morale), Utility AI avoids the combinatorial explosion of behavior tree branches.
- If your NPC needs to chain 3+ actions into a plan that varies based on world state, GOAP produces more emergent behavior with less hand-authored logic.
- Hybrid is common: use Utility AI to pick the current goal, then GOAP or a behavior tree to execute it.

---

## 2. Utility AI — Concepts

Utility AI works by scoring every possible action and choosing the one with the highest score. Each action's score is computed by evaluating one or more **considerations** — functions that map a world value (like hunger level) to a utility score between 0 and 1 through a **response curve**.

```
Action: "Eat Food"
├── Consideration: Hunger Level → Exponential curve (higher hunger = much higher score)
├── Consideration: Food Available → Boolean (0 if no food, 1 if food nearby)
├── Consideration: Safety → Linear curve (safer = higher score)
└── Final Score = product of all considerations × action weight
```

The NPC evaluates all actions each tick (or at intervals) and picks the highest scorer.

---

## 3. Response Curves

Response curves are the heart of Utility AI. They transform a raw input value (0–1 normalized) into a utility score (0–1). Common curve types:

```gdscript
class_name ResponseCurve

enum CurveType { LINEAR, QUADRATIC, EXPONENTIAL, LOGISTIC, STEP }

@export var type: CurveType = CurveType.LINEAR
@export var slope: float = 1.0
@export var exponent: float = 2.0
@export var x_shift: float = 0.0
@export var y_shift: float = 0.0

func evaluate(x: float) -> float:
    x = clampf(x, 0.0, 1.0)
    var result: float
    
    match type:
        CurveType.LINEAR:
            result = slope * (x - x_shift) + y_shift
        CurveType.QUADRATIC:
            result = slope * pow(x - x_shift, exponent) + y_shift
        CurveType.EXPONENTIAL:
            # Rises slowly then steeply — good for "urgent when critical"
            result = slope * (exp(exponent * x) - 1.0) / (exp(exponent) - 1.0) + y_shift
        CurveType.LOGISTIC:
            # S-curve — threshold behavior with smooth transition
            result = slope / (1.0 + exp(-exponent * (x - x_shift))) + y_shift
        CurveType.STEP:
            # Binary: 0 below threshold, 1 above
            result = 1.0 if x >= x_shift else 0.0
    
    return clampf(result, 0.0, 1.0)
```

### When to Use Each Curve

- **Linear** — proportional response (distance to target → flee urgency)
- **Quadratic** — accelerating importance (health below 30% gets increasingly urgent)
- **Exponential** — nearly zero until critical, then spikes (starvation)
- **Logistic (S-curve)** — soft threshold (becomes relevant around a trigger point)
- **Step** — hard requirement (must have ammo to shoot)

---

## 4. Implementing Utility AI in Godot

### Core Classes

```gdscript
class_name UtilityConsideration
extends Resource

@export var description: String = ""
@export var curve: ResponseCurve
@export var input_key: String  # Key into the agent's blackboard

func score(blackboard: Dictionary) -> float:
    var raw_value: float = blackboard.get(input_key, 0.0)
    return curve.evaluate(raw_value)
```

```gdscript
class_name UtilityAction
extends Resource

@export var action_name: String = ""
@export var weight: float = 1.0
@export var considerations: Array[UtilityConsideration] = []
@export var cooldown: float = 0.0

var _cooldown_remaining: float = 0.0

func score(blackboard: Dictionary) -> float:
    if _cooldown_remaining > 0.0:
        return 0.0
    
    if considerations.is_empty():
        return 0.0
    
    # Multiplicative scoring — all considerations must contribute
    var total := weight
    for consideration in considerations:
        var s := consideration.score(blackboard)
        total *= s
        if total <= 0.0:
            return 0.0  # Early exit — one zero kills the action
    
    # Compensation factor: prevent actions with more considerations
    # from scoring systematically lower due to multiplication
    var mod_factor := 1.0 - (1.0 / considerations.size())
    var make_up := (1.0 - total) * mod_factor
    total += make_up * total
    
    return total

func start_cooldown() -> void:
    _cooldown_remaining = cooldown

func tick_cooldown(delta: float) -> void:
    _cooldown_remaining = max(0.0, _cooldown_remaining - delta)
```

### The Decision Maker

```gdscript
class_name UtilityBrain
extends Node

@export var actions: Array[UtilityAction] = []
@export var evaluation_interval: float = 0.2  # Don't re-evaluate every frame

var blackboard: Dictionary = {}
var current_action: UtilityAction = null

var _eval_timer: float = 0.0

signal action_changed(new_action: UtilityAction)

func _physics_process(delta: float) -> void:
    # Tick cooldowns
    for action in actions:
        action.tick_cooldown(delta)
    
    # Periodic evaluation
    _eval_timer += delta
    if _eval_timer >= evaluation_interval:
        _eval_timer = 0.0
        _evaluate()

func _evaluate() -> void:
    var best_action: UtilityAction = null
    var best_score: float = 0.0
    
    for action in actions:
        var score := action.score(blackboard)
        if score > best_score:
            best_score = score
            best_action = action
    
    if best_action != current_action:
        if current_action:
            current_action.start_cooldown()
        current_action = best_action
        action_changed.emit(best_action)

func update_blackboard(key: String, value: float) -> void:
    blackboard[key] = value
```

---

## 5. Utility AI — Practical Example: Survival NPC

An NPC in a survival game that decides between eating, sleeping, fighting, fleeing, and gathering:

```gdscript
extends CharacterBody3D

@onready var brain: UtilityBrain = $UtilityBrain
@onready var nav_agent: NavigationAgent3D = $NavigationAgent3D

var health: float = 1.0
var hunger: float = 0.3
var energy: float = 0.8
var nearest_enemy_distance: float = 100.0
var nearest_food_distance: float = 50.0

func _ready() -> void:
    brain.action_changed.connect(_on_action_changed)

func _physics_process(delta: float) -> void:
    # Update blackboard with normalized values
    brain.update_blackboard("health", health)
    brain.update_blackboard("hunger", hunger)
    brain.update_blackboard("energy", energy)
    brain.update_blackboard("threat", 1.0 - clampf(nearest_enemy_distance / 20.0, 0.0, 1.0))
    brain.update_blackboard("food_nearby", 1.0 - clampf(nearest_food_distance / 30.0, 0.0, 1.0))
    
    # Needs increase over time
    hunger = min(hunger + delta * 0.02, 1.0)
    energy = max(energy - delta * 0.01, 0.0)

func _on_action_changed(action: UtilityAction) -> void:
    match action.action_name:
        "eat":
            _go_eat()
        "sleep":
            _go_sleep()
        "fight":
            _engage_enemy()
        "flee":
            _flee_from_enemy()
        "gather":
            _gather_resources()

func _go_eat() -> void:
    var food := _find_nearest_food()
    if food:
        nav_agent.target_position = food.global_position
        # Navigate, then eat when arrived

func _go_sleep() -> void:
    var shelter := _find_nearest_shelter()
    if shelter:
        nav_agent.target_position = shelter.global_position

func _engage_enemy() -> void:
    pass  # Navigate to enemy, start combat

func _flee_from_enemy() -> void:
    var away_dir := (global_position - _nearest_enemy.global_position).normalized()
    nav_agent.target_position = global_position + away_dir * 20.0

func _gather_resources() -> void:
    pass  # Navigate to resource node, harvest
```

### Action Configuration (in the editor via Resources)

```
"eat":
  weight: 1.0
  considerations:
    - hunger → Exponential (spikes when hunger > 0.7)
    - food_nearby → Step (0 if no food nearby)

"sleep":
  weight: 0.9
  considerations:
    - energy (inverted: 1.0 - energy) → Quadratic
    - threat (inverted: 1.0 - threat) → Linear (won't sleep if danger)

"fight":
  weight: 1.1
  considerations:
    - threat → Logistic (triggers around 0.5 threat)
    - health → Linear (more health = more willing to fight)

"flee":
  weight: 1.3
  considerations:
    - threat → Exponential (extreme urgency at high threat)
    - health (inverted) → Quadratic (low health = more likely to flee)

"gather":
  weight: 0.5
  considerations:
    - hunger (inverted) → Linear (gather when not hungry)
    - threat (inverted) → Step (won't gather if threatened)
    - energy → Linear (need energy to gather)
```

---

## 6. GOAP — Concepts

GOAP models the AI decision space as a planning problem:

- **World State** — a set of boolean or numeric properties describing the current situation (`has_weapon: true`, `enemy_alive: true`, `is_hungry: true`)
- **Goals** — desired world states the agent wants to achieve (`enemy_alive: false`, `is_hungry: false`)
- **Actions** — operations that transform world state, each with preconditions and effects:
  - `attack_enemy`: requires `has_weapon: true`, `near_enemy: true` → produces `enemy_alive: false`
  - `pick_up_weapon`: requires `near_weapon: true` → produces `has_weapon: true`
  - `move_to_weapon`: requires nothing → produces `near_weapon: true`

The **planner** searches backward from the goal, finding a chain of actions whose effects satisfy the goal and whose preconditions are met (or can be met by preceding actions).

---

## 7. World State and Actions

```gdscript
class_name GoapWorldState
extends RefCounted

## World state is a dictionary of string keys to boolean values.
var state: Dictionary = {}  # Dictionary[String, bool]

func duplicate_state() -> GoapWorldState:
    var copy := GoapWorldState.new()
    copy.state = state.duplicate()
    return copy

func satisfies(goal: Dictionary) -> bool:
    ## Returns true if this state satisfies all goal conditions.
    for key: String in goal:
        if not state.has(key) or state[key] != goal[key]:
            return false
    return true

func apply_effects(effects: Dictionary) -> void:
    for key: String in effects:
        state[key] = effects[key]

func get_unsatisfied(goal: Dictionary) -> Dictionary:
    ## Returns the subset of goal conditions not met by this state.
    var unmet: Dictionary = {}
    for key: String in goal:
        if not state.has(key) or state[key] != goal[key]:
            unmet[key] = goal[key]
    return unmet
```

```gdscript
class_name GoapAction
extends Resource

@export var action_name: String = ""
@export var cost: float = 1.0
@export var preconditions: Dictionary = {}  # Dictionary[String, bool]
@export var effects: Dictionary = {}        # Dictionary[String, bool]

## Override in subclass to check dynamic runtime conditions.
func is_valid(agent: Node) -> bool:
    return true

## Override to perform the actual action. Return true when done.
func execute(agent: Node, delta: float) -> bool:
    return true  # Override in subclass

## Called when the action starts.
func enter(agent: Node) -> void:
    pass

## Called when the action is interrupted or completed.
func exit(agent: Node) -> void:
    pass
```

---

## 8. The GOAP Planner

The planner uses **backward search** (A* or breadth-first) from the goal state, finding the cheapest sequence of actions to reach it:

```gdscript
class_name GoapPlanner
extends RefCounted

class PlannerNode:
    var state: GoapWorldState
    var action: GoapAction  # Action that LED to this state (null for start)
    var parent: PlannerNode
    var running_cost: float
    
    func _init(s: GoapWorldState, a: GoapAction, p: PlannerNode, c: float) -> void:
        state = s
        action = a
        parent = p
        running_cost = c

static func plan(
    current_state: GoapWorldState,
    goal: Dictionary,
    available_actions: Array[GoapAction],
    agent: Node
) -> Array[GoapAction]:
    ## Returns an ordered array of actions to achieve the goal, or empty if no plan found.
    
    # Filter to valid actions
    var usable: Array[GoapAction] = []
    for action in available_actions:
        if action.is_valid(agent):
            usable.append(action)
    
    # Build graph via forward search from current state
    var start := PlannerNode.new(current_state.duplicate_state(), null, null, 0.0)
    var open_list: Array[PlannerNode] = [start]
    var best_plan: Array[GoapAction] = []
    var best_cost: float = INF
    
    var iterations := 0
    var max_iterations := 1000  # Safety limit
    
    while not open_list.is_empty() and iterations < max_iterations:
        iterations += 1
        
        # Pop cheapest node
        var current: PlannerNode = open_list.pop_front()
        
        # Check if goal is satisfied
        if current.state.satisfies(goal):
            if current.running_cost < best_cost:
                best_cost = current.running_cost
                best_plan = _extract_plan(current)
            continue
        
        # Prune: if already more expensive than best known, skip
        if current.running_cost >= best_cost:
            continue
        
        # Try each action
        for action in usable:
            # Can this action run in the current state?
            if not current.state.satisfies(action.preconditions):
                continue
            
            # Apply action effects
            var new_state := current.state.duplicate_state()
            new_state.apply_effects(action.effects)
            
            var new_cost := current.running_cost + action.cost
            var node := PlannerNode.new(new_state, action, current, new_cost)
            
            # Insert sorted by cost (poor man's priority queue)
            var inserted := false
            for i in open_list.size():
                if new_cost < open_list[i].running_cost:
                    open_list.insert(i, node)
                    inserted = true
                    break
            if not inserted:
                open_list.append(node)
    
    return best_plan

static func _extract_plan(node: PlannerNode) -> Array[GoapAction]:
    var plan: Array[GoapAction] = []
    var current := node
    while current.action != null:
        plan.push_front(current.action)
        current = current.parent
    return plan
```

---

## 9. GOAP Agent and Action Execution

The agent ties world state sensing, planning, and action execution together:

```gdscript
class_name GoapAgent
extends Node

@export var available_actions: Array[GoapAction] = []
@export var replan_interval: float = 1.0

var world_state: GoapWorldState = GoapWorldState.new()
var current_goal: Dictionary = {}
var current_plan: Array[GoapAction] = []
var current_action_index: int = 0

var _replan_timer: float = 0.0

signal plan_found(plan: Array[GoapAction])
signal plan_failed
signal action_started(action: GoapAction)
signal action_completed(action: GoapAction)
signal goal_achieved

func set_goal(goal: Dictionary) -> void:
    current_goal = goal
    _replan()

func _physics_process(delta: float) -> void:
    # Periodically re-check if plan is still valid
    _replan_timer += delta
    if _replan_timer >= replan_interval:
        _replan_timer = 0.0
        _validate_plan()
    
    # Execute current action
    if current_plan.is_empty():
        return
    
    if current_action_index >= current_plan.size():
        goal_achieved.emit()
        current_plan.clear()
        return
    
    var action: GoapAction = current_plan[current_action_index]
    var done := action.execute(get_parent(), delta)
    
    if done:
        action.exit(get_parent())
        action_completed.emit(action)
        current_action_index += 1
        
        if current_action_index < current_plan.size():
            current_plan[current_action_index].enter(get_parent())
            action_started.emit(current_plan[current_action_index])

func _replan() -> void:
    current_plan = GoapPlanner.plan(
        world_state, current_goal, available_actions, get_parent()
    )
    current_action_index = 0
    
    if current_plan.is_empty():
        plan_failed.emit()
    else:
        plan_found.emit(current_plan)
        current_plan[0].enter(get_parent())
        action_started.emit(current_plan[0])

func _validate_plan() -> void:
    ## Check if the current plan is still achievable.
    if current_plan.is_empty():
        return
    
    # If current action's preconditions are no longer met, replan
    if current_action_index < current_plan.size():
        var action: GoapAction = current_plan[current_action_index]
        if not world_state.satisfies(action.preconditions):
            action.exit(get_parent())
            _replan()
```

---

## 10. GOAP — Practical Example: Village NPC

A villager that can chop wood, cook food, eat, sleep, and trade — dynamically planning based on world state:

### Define Actions as Resources

```gdscript
# res://ai/actions/chop_wood.gd
class_name ChopWoodAction
extends GoapAction

func _init() -> void:
    action_name = "chop_wood"
    cost = 2.0
    preconditions = { "has_axe": true, "near_tree": true }
    effects = { "has_wood": true }

func is_valid(agent: Node) -> bool:
    # Check if there are trees in the world
    return not agent.get_tree().get_nodes_in_group("trees").is_empty()

func enter(agent: Node) -> void:
    agent.get_node("AnimationPlayer").play("chop")

func execute(agent: Node, delta: float) -> bool:
    # Wait for animation to finish (simplified)
    return not agent.get_node("AnimationPlayer").is_playing()

func exit(agent: Node) -> void:
    agent.get_node("AnimationPlayer").play("idle")
```

```gdscript
# res://ai/actions/go_to_tree.gd
class_name GoToTreeAction
extends GoapAction

func _init() -> void:
    action_name = "go_to_tree"
    cost = 1.0
    preconditions = {}
    effects = { "near_tree": true }

func execute(agent: Node, delta: float) -> bool:
    var trees := agent.get_tree().get_nodes_in_group("trees")
    if trees.is_empty():
        return false
    
    var nearest: Node3D = trees[0]
    var nav: NavigationAgent3D = agent.get_node("NavigationAgent3D")
    nav.target_position = nearest.global_position
    
    if nav.is_navigation_finished():
        return true
    
    # Move toward target
    var next_pos := nav.get_next_path_position()
    var dir := (next_pos - agent.global_position).normalized()
    agent.velocity = dir * 3.0
    agent.move_and_slide()
    return false
```

```gdscript
# res://ai/actions/cook_food.gd
class_name CookFoodAction
extends GoapAction

func _init() -> void:
    action_name = "cook_food"
    cost = 3.0
    preconditions = { "has_wood": true, "near_campfire": true }
    effects = { "has_food": true, "has_wood": false }
```

```gdscript
# res://ai/actions/eat_food.gd
class_name EatFoodAction
extends GoapAction

func _init() -> void:
    action_name = "eat_food"
    cost = 1.0
    preconditions = { "has_food": true }
    effects = { "is_hungry": false, "has_food": false }
```

### The Villager NPC

```gdscript
extends CharacterBody3D

@onready var goap_agent: GoapAgent = $GoapAgent

func _ready() -> void:
    # Register all available actions
    goap_agent.available_actions = [
        GoToTreeAction.new(),
        ChopWoodAction.new(),
        GoToCampfireAction.new(),
        CookFoodAction.new(),
        EatFoodAction.new(),
        GoToShelterAction.new(),
        SleepAction.new(),
    ]
    
    # Set initial world state
    goap_agent.world_state.state = {
        "has_axe": true,
        "has_wood": false,
        "has_food": false,
        "near_tree": false,
        "near_campfire": false,
        "near_shelter": false,
        "is_hungry": true,
        "is_tired": false,
    }
    
    # Set goal: don't be hungry
    goap_agent.set_goal({ "is_hungry": false })
    
    # When goal achieved, pick a new one
    goap_agent.goal_achieved.connect(_pick_next_goal)

func _physics_process(delta: float) -> void:
    # Update world state from sensors
    goap_agent.world_state.state["near_tree"] = _is_near_group("trees", 3.0)
    goap_agent.world_state.state["near_campfire"] = _is_near_group("campfires", 3.0)
    goap_agent.world_state.state["near_shelter"] = _is_near_group("shelters", 3.0)

func _pick_next_goal() -> void:
    # Simple priority: hungry > tired > gather wood
    if goap_agent.world_state.state.get("is_hungry", false):
        goap_agent.set_goal({ "is_hungry": false })
    elif goap_agent.world_state.state.get("is_tired", false):
        goap_agent.set_goal({ "is_tired": false })
    else:
        goap_agent.set_goal({ "has_wood": true })

func _is_near_group(group_name: String, radius: float) -> bool:
    for node: Node3D in get_tree().get_nodes_in_group(group_name):
        if global_position.distance_to(node.global_position) < radius:
            return true
    return false
```

The planner will automatically generate plans like:
- **Goal: not hungry** → `go_to_tree → chop_wood → go_to_campfire → cook_food → eat_food`
- **Goal: not hungry (already has wood)** → `go_to_campfire → cook_food → eat_food`
- **Goal: not tired** → `go_to_shelter → sleep`

---

## 11. Hybrid Approaches

In practice, the most effective AI systems combine multiple architectures:

### Utility AI for Goal Selection + GOAP for Execution

```gdscript
# UtilityBrain picks the best goal, GoapAgent plans how to achieve it
func _on_utility_action_changed(action: UtilityAction) -> void:
    match action.action_name:
        "survive":
            goap_agent.set_goal({ "is_hungry": false })
        "rest":
            goap_agent.set_goal({ "is_tired": false })
        "defend":
            goap_agent.set_goal({ "enemy_alive": false })
        "gather":
            goap_agent.set_goal({ "has_wood": true })
```

### Behavior Tree with Utility Selector

Replace a behavior tree's selector node with a utility-scored selector that evaluates children by score rather than left-to-right priority:

```gdscript
class_name UtilitySelector
extends BTNode  # Your behavior tree base class

var children_with_scores: Array[Dictionary] = []

func tick(blackboard: Dictionary) -> int:
    var best_child: BTNode = null
    var best_score: float = -1.0
    
    for child_data in children_with_scores:
        var child: BTNode = child_data["node"]
        var scorer: Callable = child_data["scorer"]
        var score: float = scorer.call(blackboard)
        if score > best_score:
            best_score = score
            best_child = child
    
    if best_child:
        return best_child.tick(blackboard)
    return FAILURE
```

---

## 12. C# Examples

### Utility Brain in C#

```csharp
using Godot;
using System.Collections.Generic;
using System.Linq;

public partial class UtilityBrain : Node
{
    [Export] public float EvaluationInterval { get; set; } = 0.2f;
    
    private List<UtilityAction> _actions = new();
    private Dictionary<string, float> _blackboard = new();
    private UtilityAction _currentAction;
    private float _evalTimer = 0f;
    
    [Signal] public delegate void ActionChangedEventHandler(string actionName);
    
    public void AddAction(UtilityAction action) => _actions.Add(action);
    
    public void UpdateBlackboard(string key, float value) => _blackboard[key] = value;
    
    public override void _PhysicsProcess(double delta)
    {
        _evalTimer += (float)delta;
        if (_evalTimer < EvaluationInterval) return;
        _evalTimer = 0f;
        
        var best = _actions
            .Select(a => (action: a, score: a.Score(_blackboard)))
            .OrderByDescending(x => x.score)
            .FirstOrDefault();
        
        if (best.action != null && best.action != _currentAction)
        {
            _currentAction = best.action;
            EmitSignal(SignalName.ActionChanged, best.action.ActionName);
        }
    }
}
```

### GOAP Planner in C#

```csharp
using Godot;
using System.Collections.Generic;
using System.Linq;

public static class GoapPlanner
{
    private class PlanNode
    {
        public Dictionary<string, bool> State;
        public GoapAction Action;
        public PlanNode Parent;
        public float Cost;
    }
    
    public static List<GoapAction> Plan(
        Dictionary<string, bool> currentState,
        Dictionary<string, bool> goal,
        List<GoapAction> actions,
        Node agent)
    {
        var usable = actions.Where(a => a.IsValid(agent)).ToList();
        var start = new PlanNode
        {
            State = new Dictionary<string, bool>(currentState),
            Action = null, Parent = null, Cost = 0
        };
        
        var open = new List<PlanNode> { start };
        List<GoapAction> bestPlan = new();
        float bestCost = float.PositiveInfinity;
        int iterations = 0;
        
        while (open.Count > 0 && iterations++ < 1000)
        {
            var current = open[0];
            open.RemoveAt(0);
            
            if (Satisfies(current.State, goal))
            {
                if (current.Cost < bestCost)
                {
                    bestCost = current.Cost;
                    bestPlan = ExtractPlan(current);
                }
                continue;
            }
            
            if (current.Cost >= bestCost) continue;
            
            foreach (var action in usable)
            {
                if (!Satisfies(current.State, action.Preconditions))
                    continue;
                
                var newState = new Dictionary<string, bool>(current.State);
                foreach (var kv in action.Effects)
                    newState[kv.Key] = kv.Value;
                
                var node = new PlanNode
                {
                    State = newState,
                    Action = action,
                    Parent = current,
                    Cost = current.Cost + action.Cost
                };
                
                int idx = open.FindIndex(n => n.Cost > node.Cost);
                if (idx >= 0) open.Insert(idx, node);
                else open.Add(node);
            }
        }
        
        return bestPlan;
    }
    
    private static bool Satisfies(
        Dictionary<string, bool> state, Dictionary<string, bool> conditions)
    {
        return conditions.All(kv =>
            state.ContainsKey(kv.Key) && state[kv.Key] == kv.Value);
    }
    
    private static List<GoapAction> ExtractPlan(PlanNode node)
    {
        var plan = new List<GoapAction>();
        while (node.Action != null)
        {
            plan.Insert(0, node.Action);
            node = node.Parent;
        }
        return plan;
    }
}
```

---

## 13. Common Pitfalls

**Utility AI: score multiplication kills actions silently.** If any consideration returns 0, the entire action scores 0. Use the compensation factor shown above, or switch to additive scoring for less aggressive pruning.

**Utility AI: all actions score nearly the same.** This means your curves aren't differentiated enough. Add more considerations or widen the curve parameters. Debug by logging scores each evaluation.

**GOAP: planner runs too long.** GOAP planning is a search problem — with many actions and complex preconditions, it can be slow. Limit `max_iterations`, reduce the action set, or cache plans and only replan when world state changes meaningfully.

**GOAP: infinite loops.** An action with effects that re-enable its own preconditions (e.g., "eat food" produces `is_hungry: false`, but later `is_hungry` becomes `true` again) can cause the planner to loop. The planner should track visited states and prune duplicates.

**GOAP: boolean-only state is too coarse.** Pure boolean world state can't represent "I have 3 wood" or "health is 0.5." Extend `GoapWorldState` to support integers or floats, and update `satisfies()` to handle comparisons (e.g., `wood >= 3`).

**Not updating world state from sensors.** GOAP and Utility AI both depend on accurate world state. Update it every frame (or at evaluation intervals) from actual game state — distance checks, inventory counts, health values.

**Mixing up planner state and real state.** The planner operates on a copy of world state to simulate action chains. Never modify the agent's real world state during planning — only during action execution.

---

*Next steps:* [G25 AI & Behavior Trees](./G25_ai_behavior_trees.md) for simpler reactive AI · [G14 Navigation & Pathfinding](./G14_navigation_and_pathfinding.md) for movement execution · [G2 State Machines](./G2_state_machine.md) for action-level state management
