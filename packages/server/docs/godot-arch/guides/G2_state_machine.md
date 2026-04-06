# G2 — State Machines
> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript  
> **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Scene Composition](./G1_scene_composition.md) · [G3 Signal Architecture](./G3_signal_architecture.md)

---

## What This Guide Covers

State machines manage behavior complexity — character movement, AI, game flow, UI screens, weapons, combo systems. This guide covers three patterns from simple to advanced:

1. **Enum FSM** — One script, one enum, switch on state. Good for ≤5 states.
2. **Node-Based FSM** — States as child nodes. Godot's standard pattern. Scales to 10-20 states.
3. **Hierarchical State Machine (HSM)** — States contain sub-states. For complex characters with shared behavior (grounded → idle/run/crouch, airborne → jump/fall/wall-slide).
4. **Pushdown Automaton** — State stack for pausable/resumable states (menus, dialogue, cutscenes).

All code is typed GDScript targeting Godot 4.4+.

---

## When to Use Each Pattern

| Pattern | Best For | States | Complexity |
|---------|----------|--------|------------|
| Enum FSM | Simple objects, pickups, doors | 2–5 | Low |
| Node-Based FSM | Player characters, enemies | 5–15 | Medium |
| Hierarchical SM | Complex characters with shared logic | 10–30 | High |
| Pushdown Automaton | Game flow, UI, nested menus | Any | Medium |

**Rule of thumb:** Start with enum. When you add your 4th state, refactor to node-based. When you start duplicating logic across states ("both Idle and Run need to handle jump input"), go hierarchical.

---

## Pattern 1: Enum FSM

Best for simple objects with few states. One script, no extra nodes.

```gdscript
# door.gd
class_name Door
extends AnimatableBody2D

enum DoorState { CLOSED, OPENING, OPEN, CLOSING }

var current_state: DoorState = DoorState.CLOSED
var open_timer: float = 0.0

@export var open_duration: float = 5.0
@export var open_speed: float = 2.0
@export var open_offset: Vector2 = Vector2(0, -64)

var _closed_position: Vector2
var _open_position: Vector2


func _ready() -> void:
	_closed_position = position
	_open_position = _closed_position + open_offset


func _physics_process(delta: float) -> void:
	match current_state:
		DoorState.CLOSED:
			_state_closed()
		DoorState.OPENING:
			_state_opening(delta)
		DoorState.OPEN:
			_state_open(delta)
		DoorState.CLOSING:
			_state_closing(delta)


func _state_closed() -> void:
	# Wait for interaction — triggered externally
	pass


func _state_opening(delta: float) -> void:
	position = position.move_toward(_open_position, open_speed * 64.0 * delta)
	if position.distance_to(_open_position) < 1.0:
		position = _open_position
		open_timer = open_duration
		current_state = DoorState.OPEN


func _state_open(delta: float) -> void:
	open_timer -= delta
	if open_timer <= 0.0:
		current_state = DoorState.CLOSING


func _state_closing(delta: float) -> void:
	position = position.move_toward(_closed_position, open_speed * 64.0 * delta)
	if position.distance_to(_closed_position) < 1.0:
		position = _closed_position
		current_state = DoorState.CLOSED


func interact() -> void:
	if current_state == DoorState.CLOSED:
		current_state = DoorState.OPENING
```

### When Enum FSM Breaks Down

You know you've outgrown enum FSM when:
- The `match` block is over 50 lines
- States need `enter()`/`exit()` logic (play animation on enter, stop particles on exit)
- You're adding `if previous_state == X` checks
- Multiple objects need the same state logic with different parameters

---

## Pattern 2: Node-Based FSM

Godot's idiomatic state machine. Each state is a child node with its own script. The `StateMachine` node manages transitions.

### Scene Tree

```
Player (CharacterBody2D)
├── StateMachine (Node)           ← state_machine.gd
│   ├── Idle (Node)               ← idle_state.gd
│   ├── Run (Node)                ← run_state.gd
│   ├── Jump (Node)               ← jump_state.gd
│   ├── Fall (Node)               ← fall_state.gd
│   ├── WallSlide (Node)          ← wall_slide_state.gd
│   └── Attack (Node)             ← attack_state.gd
├── Sprite2D
├── AnimationPlayer
├── CollisionShape2D
├── HurtboxArea (Area2D)
│   └── CollisionShape2D
└── CoyoteTimer (Timer)
```

### Base State Class

```gdscript
# state.gd — All states extend this
class_name State
extends Node

## Reference to the state machine managing this state.
var state_machine: StateMachine

## Reference to the character body (set automatically by StateMachine).
var character: CharacterBody2D

## Reference to the animation player (set automatically by StateMachine).
var anim: AnimationPlayer


## Called when this state becomes active.
func enter() -> void:
	pass


## Called when this state is replaced by another.
func exit() -> void:
	pass


## Called every frame while this state is active. Return a State to transition.
func update(_delta: float) -> State:
	return null


## Called every physics frame while active. Return a State to transition.
func physics_update(_delta: float) -> State:
	return null


## Called for unhandled input while active. Return a State to transition.
func handle_input(_event: InputEvent) -> State:
	return null
```

### State Machine Manager

```gdscript
# state_machine.gd
class_name StateMachine
extends Node

## Assign in the inspector — which state starts active.
@export var initial_state: State

## The currently active state. Read-only externally.
var current_state: State

## Emitted on every transition for debugging and analytics.
signal transitioned(from_state: StringName, to_state: StringName)


func _ready() -> void:
	# Wait one frame so sibling nodes (AnimationPlayer, etc.) are ready
	await owner.ready

	var character := owner as CharacterBody2D
	var anim := owner.get_node_or_null("AnimationPlayer") as AnimationPlayer

	for child in get_children():
		if child is State:
			child.state_machine = self
			child.character = character
			child.anim = anim

	if initial_state == null:
		push_error("StateMachine has no initial_state assigned!")
		return

	current_state = initial_state
	current_state.enter()


func _process(delta: float) -> void:
	var next: State = current_state.update(delta)
	if next:
		_transition(next)


func _physics_process(delta: float) -> void:
	var next: State = current_state.physics_update(delta)
	if next:
		_transition(next)


func _unhandled_input(event: InputEvent) -> void:
	var next: State = current_state.handle_input(event)
	if next:
		_transition(next)


## Force a transition from outside (e.g., damage triggers Hurt state).
func force_transition(target_state: State) -> void:
	_transition(target_state)


func _transition(new_state: State) -> void:
	if new_state == current_state:
		return

	var old_name: StringName = current_state.name
	current_state.exit()
	current_state = new_state
	current_state.enter()
	transitioned.emit(old_name, new_state.name)
```

### Concrete State Examples

```gdscript
# idle_state.gd
class_name IdleState
extends State

@export var move_state: State
@export var jump_state: State
@export var fall_state: State
@export var attack_state: State


func enter() -> void:
	anim.play("idle")


func physics_update(_delta: float) -> State:
	# Fall off ledge
	if not character.is_on_floor():
		return fall_state

	# Movement
	var input_dir: float = Input.get_axis("move_left", "move_right")
	if not is_zero_approx(input_dir):
		return move_state

	# Apply friction
	character.velocity.x = move_toward(character.velocity.x, 0.0, 800.0 * _delta)
	character.move_and_slide()
	return null


func handle_input(event: InputEvent) -> State:
	if event.is_action_pressed("jump"):
		return jump_state
	if event.is_action_pressed("attack"):
		return attack_state
	return null
```

```gdscript
# run_state.gd
class_name RunState
extends State

@export var idle_state: State
@export var jump_state: State
@export var fall_state: State

@export var speed: float = 200.0
@export var acceleration: float = 1200.0


func enter() -> void:
	anim.play("run")


func physics_update(delta: float) -> State:
	if not character.is_on_floor():
		return fall_state

	var input_dir: float = Input.get_axis("move_left", "move_right")
	if is_zero_approx(input_dir):
		return idle_state

	# Accelerate toward target speed
	var target_velocity: float = input_dir * speed
	character.velocity.x = move_toward(
		character.velocity.x, target_velocity, acceleration * delta
	)

	# Flip sprite
	if not is_zero_approx(input_dir):
		character.get_node("Sprite2D").flip_h = input_dir < 0.0

	character.move_and_slide()
	return null


func handle_input(event: InputEvent) -> State:
	if event.is_action_pressed("jump"):
		return jump_state
	return null
```

```gdscript
# jump_state.gd
class_name JumpState
extends State

@export var idle_state: State
@export var fall_state: State
@export var wall_slide_state: State

@export var jump_velocity: float = -350.0
@export var gravity: float = 980.0
@export var air_speed: float = 200.0
@export var air_acceleration: float = 600.0

var _jump_released: bool = false


func enter() -> void:
	character.velocity.y = jump_velocity
	_jump_released = false
	anim.play("jump")


func physics_update(delta: float) -> State:
	# Variable jump height — release early for short hop
	if not _jump_released and Input.is_action_just_released("jump"):
		_jump_released = true
		if character.velocity.y < jump_velocity * 0.5:
			character.velocity.y = jump_velocity * 0.5

	# Gravity
	character.velocity.y += gravity * delta

	# Air control
	var input_dir: float = Input.get_axis("move_left", "move_right")
	character.velocity.x = move_toward(
		character.velocity.x, input_dir * air_speed, air_acceleration * delta
	)

	character.move_and_slide()

	# Landed
	if character.is_on_floor():
		return idle_state

	# Started falling
	if character.velocity.y > 0.0:
		return fall_state

	# Wall slide check
	if character.is_on_wall() and not is_zero_approx(input_dir):
		if wall_slide_state:
			return wall_slide_state

	return null
```

```gdscript
# fall_state.gd
class_name FallState
extends State

@export var idle_state: State
@export var run_state: State
@export var jump_state: State
@export var wall_slide_state: State

@export var gravity: float = 980.0
@export var max_fall_speed: float = 600.0
@export var air_speed: float = 200.0
@export var air_acceleration: float = 600.0

## Coyote time — allow jumping for a few frames after leaving a ledge.
@export var coyote_time: float = 0.1
var _coyote_timer: float = 0.0


func enter() -> void:
	anim.play("fall")
	_coyote_timer = coyote_time


func physics_update(delta: float) -> State:
	_coyote_timer -= delta

	# Gravity with terminal velocity
	character.velocity.y = minf(
		character.velocity.y + gravity * delta,
		max_fall_speed
	)

	# Air control
	var input_dir: float = Input.get_axis("move_left", "move_right")
	character.velocity.x = move_toward(
		character.velocity.x, input_dir * air_speed, air_acceleration * delta
	)

	character.move_and_slide()

	# Landed
	if character.is_on_floor():
		if is_zero_approx(input_dir):
			return idle_state
		return run_state

	# Wall slide
	if character.is_on_wall() and not is_zero_approx(input_dir):
		if wall_slide_state:
			return wall_slide_state

	return null


func handle_input(event: InputEvent) -> State:
	# Coyote jump — still allowed briefly after leaving a ledge
	if event.is_action_pressed("jump") and _coyote_timer > 0.0:
		return jump_state
	return null
```

```gdscript
# wall_slide_state.gd
class_name WallSlideState
extends State

@export var idle_state: State
@export var fall_state: State
@export var jump_state: State

@export var slide_gravity: float = 200.0
@export var max_slide_speed: float = 100.0
@export var wall_jump_velocity: Vector2 = Vector2(250.0, -350.0)

var _wall_normal: Vector2 = Vector2.ZERO


func enter() -> void:
	anim.play("wall_slide")
	character.velocity.y = 0.0


func exit() -> void:
	_wall_normal = Vector2.ZERO


func physics_update(delta: float) -> State:
	# Slide down slowly
	character.velocity.y = minf(
		character.velocity.y + slide_gravity * delta,
		max_slide_speed
	)
	character.velocity.x = 0.0
	character.move_and_slide()

	# Track which wall we're on
	if character.is_on_wall():
		_wall_normal = character.get_wall_normal()
	else:
		return fall_state

	# Landed
	if character.is_on_floor():
		return idle_state

	# Let go of wall (stopped pressing toward it)
	var input_dir: float = Input.get_axis("move_left", "move_right")
	if is_zero_approx(input_dir) or signf(input_dir) == signf(_wall_normal.x):
		return fall_state

	return null


func handle_input(event: InputEvent) -> State:
	if event.is_action_pressed("jump"):
		# Wall jump — push away from wall
		character.velocity = Vector2(
			_wall_normal.x * wall_jump_velocity.x,
			wall_jump_velocity.y
		)
		return jump_state
	return null
```

### Wiring States in the Inspector

States reference each other via `@export var` — you drag-and-drop in the Inspector:

1. Select the `Idle` node → in the Inspector, drag `Run` into `move_state`, `Jump` into `jump_state`, etc.
2. Select `StateMachine` → drag `Idle` into `initial_state`.
3. Done. No hardcoded node paths, no string-based lookups.

**Why `@export` instead of `get_node()`:** Inspector refs survive renames, are visible in the editor, and fail loudly (null) instead of silently (wrong path string). If you rename "Jump" to "JumpState", Inspector refs still work. `get_node("Jump")` breaks silently.

---

## Pattern 3: Hierarchical State Machine (HSM)

When states share logic — "both Idle and Run apply gravity and handle jump input" — you're duplicating code. HSM solves this with parent states that handle shared behavior while children handle specifics.

### Scene Tree

```
Player (CharacterBody2D)
├── StateMachine (Node)              ← hierarchical_state_machine.gd
│   ├── Grounded (Node)              ← grounded_state.gd (parent state)
│   │   ├── Idle (Node)              ← idle_state.gd
│   │   ├── Run (Node)               ← run_state.gd
│   │   └── Crouch (Node)            ← crouch_state.gd
│   ├── Airborne (Node)              ← airborne_state.gd (parent state)
│   │   ├── Jump (Node)              ← jump_state.gd
│   │   ├── Fall (Node)              ← fall_state.gd
│   │   └── WallSlide (Node)         ← wall_slide_state.gd
│   └── Hurt (Node)                  ← hurt_state.gd (standalone)
├── Sprite2D
├── AnimationPlayer
└── CollisionShape2D
```

### Hierarchical Base State

```gdscript
# hierarchical_state.gd — Replaces state.gd for HSM
class_name HierarchicalState
extends Node

var state_machine: Node  # The root StateMachine
var character: CharacterBody2D
var anim: AnimationPlayer

## The currently active child state (only for parent states).
var active_child: HierarchicalState = null

## Default child to enter when this parent state is entered.
@export var default_child: HierarchicalState


func enter() -> void:
	# If this state has children, enter the default child
	if default_child:
		active_child = default_child
		active_child.enter()


func exit() -> void:
	if active_child:
		active_child.exit()
		active_child = null


func update(delta: float) -> HierarchicalState:
	# Process active child first — child transitions take priority
	if active_child:
		var child_next: HierarchicalState = active_child.update(delta)
		if child_next:
			_transition_child(child_next)
	return null


func physics_update(delta: float) -> HierarchicalState:
	if active_child:
		var child_next: HierarchicalState = active_child.physics_update(delta)
		if child_next:
			_transition_child(child_next)
	return null


func handle_input(event: InputEvent) -> HierarchicalState:
	# Let child handle input first
	if active_child:
		var child_next: HierarchicalState = active_child.handle_input(event)
		if child_next:
			_transition_child(child_next)
			return null
	return null


func _transition_child(new_child: HierarchicalState) -> void:
	if active_child:
		active_child.exit()
	active_child = new_child
	active_child.enter()
```

### Parent State: Grounded

```gdscript
# grounded_state.gd — Handles all shared grounded behavior
class_name GroundedState
extends HierarchicalState

@export var airborne_state: HierarchicalState
@export var hurt_state: HierarchicalState

@export var gravity: float = 980.0


func physics_update(delta: float) -> HierarchicalState:
	# Shared: Apply gravity snap (keep grounded)
	if not character.is_on_floor():
		character.velocity.y += gravity * delta
		character.move_and_slide()
		if not character.is_on_floor():
			return airborne_state

	# Process the active child (Idle, Run, or Crouch)
	super.physics_update(delta)
	return null


func handle_input(event: InputEvent) -> HierarchicalState:
	# Shared: Jump from any grounded state
	if event.is_action_pressed("jump") and character.is_on_floor():
		# Transition to Airborne, which will enter Jump sub-state
		return airborne_state

	# Let child handle remaining input
	super.handle_input(event)
	return null
```

### Parent State: Airborne

```gdscript
# airborne_state.gd — Handles all shared air behavior
class_name AirborneState
extends HierarchicalState

@export var grounded_state: HierarchicalState

@export var gravity: float = 980.0
@export var max_fall_speed: float = 600.0
@export var air_speed: float = 200.0
@export var air_acceleration: float = 600.0


func physics_update(delta: float) -> HierarchicalState:
	# Shared: Gravity
	character.velocity.y = minf(
		character.velocity.y + gravity * delta,
		max_fall_speed
	)

	# Shared: Air control
	var input_dir: float = Input.get_axis("move_left", "move_right")
	character.velocity.x = move_toward(
		character.velocity.x, input_dir * air_speed, air_acceleration * delta
	)

	character.move_and_slide()

	# Shared: Landing detection
	if character.is_on_floor():
		return grounded_state

	# Process child (Jump, Fall, WallSlide)
	super.physics_update(delta)
	return null
```

### HSM Manager

```gdscript
# hierarchical_state_machine.gd
class_name HierarchicalStateMachine
extends Node

@export var initial_state: HierarchicalState

var current_state: HierarchicalState

signal transitioned(from_name: StringName, to_name: StringName)


func _ready() -> void:
	await owner.ready

	var character := owner as CharacterBody2D
	var anim := owner.get_node_or_null("AnimationPlayer") as AnimationPlayer

	_init_children(self, character, anim)

	if initial_state:
		current_state = initial_state
		current_state.enter()


func _init_children(node: Node, character: CharacterBody2D, anim: AnimationPlayer) -> void:
	for child in node.get_children():
		if child is HierarchicalState:
			child.state_machine = self
			child.character = character
			child.anim = anim
			_init_children(child, character, anim)


func _process(delta: float) -> void:
	var next: HierarchicalState = current_state.update(delta)
	if next:
		_transition(next)


func _physics_process(delta: float) -> void:
	var next: HierarchicalState = current_state.physics_update(delta)
	if next:
		_transition(next)


func _unhandled_input(event: InputEvent) -> void:
	var next: HierarchicalState = current_state.handle_input(event)
	if next:
		_transition(next)


func force_transition(target: HierarchicalState) -> void:
	_transition(target)


func _transition(new_state: HierarchicalState) -> void:
	if new_state == current_state:
		return

	var old_name: StringName = current_state.name
	current_state.exit()
	current_state = new_state
	current_state.enter()
	transitioned.emit(old_name, new_state.name)


## Get the deepest active state name for debugging.
func get_active_state_path() -> String:
	var parts: PackedStringArray = []
	var state: HierarchicalState = current_state
	parts.append(state.name)
	while state.active_child:
		state = state.active_child
		parts.append(state.name)
	return "/".join(parts)
```

### HSM Benefit Summary

Without HSM (flat FSM), jump handling is duplicated in Idle, Run, and Crouch:
```
Idle   → handle_input: if jump → Jump
Run    → handle_input: if jump → Jump
Crouch → handle_input: if jump → Jump    ← 3x duplication
```

With HSM, Grounded handles it once:
```
Grounded → handle_input: if jump → Airborne    ← 1x, all children inherit
  ├── Idle
  ├── Run
  └── Crouch
```

Same for gravity, landing detection, and air control — written once in the parent state.

---

## Pattern 4: Pushdown Automaton (State Stack)

For game flow where states pause and resume — opening a menu during gameplay, dialogue interrupting exploration, a cutscene during combat.

### The Stack Concept

```
# Normal gameplay:
Stack: [Gameplay]

# Player opens inventory:
Stack: [Gameplay, Inventory]  ← Gameplay is paused, Inventory is active

# Player opens a confirmation dialog from inventory:
Stack: [Gameplay, Inventory, ConfirmDialog]

# Player closes dialog:
Stack: [Gameplay, Inventory]  ← Back to inventory, no state was lost

# Player closes inventory:
Stack: [Gameplay]  ← Back to gameplay, position/state preserved
```

### Implementation

```gdscript
# game_state.gd — Base class for game flow states
class_name GameState
extends Node

var game_state_machine: GameStateMachine


## Called when this state becomes the top of the stack (entered or resumed).
func enter() -> void:
	pass


## Called when this state is removed from the stack.
func exit() -> void:
	pass


## Called when a state above this one is popped — we're active again.
func resume() -> void:
	pass


## Called when a new state is pushed on top — we're paused.
func pause() -> void:
	pass


func update(_delta: float) -> void:
	pass


func physics_update(_delta: float) -> void:
	pass


func handle_input(_event: InputEvent) -> void:
	pass
```

```gdscript
# game_state_machine.gd — Stack-based state manager
class_name GameStateMachine
extends Node

@export var initial_state: GameState

var _stack: Array[GameState] = []

signal state_pushed(state_name: StringName)
signal state_popped(state_name: StringName)


func _ready() -> void:
	for child in get_children():
		if child is GameState:
			child.game_state_machine = self
			child.process_mode = Node.PROCESS_MODE_DISABLED

	if initial_state:
		push_state(initial_state)


func _process(delta: float) -> void:
	if not _stack.is_empty():
		_stack.back().update(delta)


func _physics_process(delta: float) -> void:
	if not _stack.is_empty():
		_stack.back().physics_update(delta)


func _unhandled_input(event: InputEvent) -> void:
	if not _stack.is_empty():
		_stack.back().handle_input(event)


## Push a new state onto the stack. Current state is paused.
func push_state(state: GameState) -> void:
	if not _stack.is_empty():
		_stack.back().pause()
		_stack.back().process_mode = Node.PROCESS_MODE_DISABLED

	_stack.push_back(state)
	state.process_mode = Node.PROCESS_MODE_INHERIT
	state.enter()
	state_pushed.emit(state.name)


## Pop the top state. Previous state resumes.
func pop_state() -> void:
	if _stack.is_empty():
		push_warning("GameStateMachine: Tried to pop from empty stack!")
		return

	var removed: GameState = _stack.pop_back()
	removed.exit()
	removed.process_mode = Node.PROCESS_MODE_DISABLED
	state_popped.emit(removed.name)

	if not _stack.is_empty():
		_stack.back().process_mode = Node.PROCESS_MODE_INHERIT
		_stack.back().resume()


## Replace the top state without affecting states below.
func swap_state(state: GameState) -> void:
	if not _stack.is_empty():
		var removed: GameState = _stack.pop_back()
		removed.exit()
		removed.process_mode = Node.PROCESS_MODE_DISABLED

	_stack.push_back(state)
	state.process_mode = Node.PROCESS_MODE_INHERIT
	state.enter()


## Check current active state name.
func current_state_name() -> StringName:
	if _stack.is_empty():
		return &""
	return _stack.back().name


## Check if a specific state is anywhere in the stack.
func has_state(state: GameState) -> bool:
	return state in _stack


## Get the stack depth.
func depth() -> int:
	return _stack.size()
```

### Usage: Game Flow

```gdscript
# gameplay_state.gd
class_name GameplayState
extends GameState

func enter() -> void:
	get_tree().paused = false
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


func pause() -> void:
	# Freeze gameplay while menu/dialogue is open
	get_tree().paused = true


func resume() -> void:
	get_tree().paused = false
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


func handle_input(event: InputEvent) -> void:
	if event.is_action_pressed("pause"):
		var pause_menu: GameState = game_state_machine.get_node("PauseMenu")
		game_state_machine.push_state(pause_menu)
		get_viewport().set_input_as_handled()
```

```gdscript
# pause_menu_state.gd
class_name PauseMenuState
extends GameState

@onready var menu_ui: Control = $PauseMenuUI


func enter() -> void:
	menu_ui.visible = true
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE


func exit() -> void:
	menu_ui.visible = false


func handle_input(event: InputEvent) -> void:
	if event.is_action_pressed("pause"):
		game_state_machine.pop_state()
		get_viewport().set_input_as_handled()
```

---

## Debugging State Machines

State machines are invisible by default — you can't tell what state a character is in without logging. Add visibility.

### Debug Overlay

```gdscript
# state_debug_label.gd — Attach to a Label node as a child of the character
class_name StateDebugLabel
extends Label

@export var state_machine: StateMachine
@export var show_in_release: bool = false


func _ready() -> void:
	if not OS.is_debug_build() and not show_in_release:
		queue_free()
		return

	if state_machine:
		state_machine.transitioned.connect(_on_transitioned)
		text = state_machine.current_state.name if state_machine.current_state else "None"

	# Position above the character
	position = Vector2(-40, -50)


func _on_transitioned(_from: StringName, to: StringName) -> void:
	text = to
```

### Transition History

```gdscript
# state_history.gd — Track transitions for debugging. Add as sibling of StateMachine.
class_name StateHistory
extends Node

@export var state_machine: StateMachine
@export var max_entries: int = 20

var history: Array[Dictionary] = []


func _ready() -> void:
	if state_machine:
		state_machine.transitioned.connect(_on_transitioned)


func _on_transitioned(from_state: StringName, to_state: StringName) -> void:
	var entry: Dictionary = {
		"from": from_state,
		"to": to_state,
		"time": Time.get_ticks_msec(),
		"frame": Engine.get_process_frames(),
	}
	history.push_back(entry)
	if history.size() > max_entries:
		history.pop_front()


## Print the last N transitions to the console.
func dump(count: int = 10) -> void:
	var start: int = maxi(0, history.size() - count)
	for i in range(start, history.size()):
		var e: Dictionary = history[i]
		print("[%d] Frame %d: %s → %s" % [
			e["time"], e["frame"], e["from"], e["to"]
		])
```

---

## State Machine + Animation Integration

Animations and states should be 1:1. Each state plays exactly one animation on enter. Never call `anim.play()` from outside a state.

### Animation State Sync

```gdscript
# animated_state.gd — State that auto-plays a matching animation
class_name AnimatedState
extends State

## The animation to play when entering this state.
## If empty, uses the node name in snake_case (e.g., "WallSlide" → "wall_slide").
@export var animation_name: StringName = &""

## Blend time for smooth animation transitions.
@export var blend_time: float = 0.1


func enter() -> void:
	var anim_key: StringName = animation_name
	if anim_key == &"":
		anim_key = StringName(_pascal_to_snake(name))

	if anim and anim.has_animation(anim_key):
		anim.play(anim_key, blend_time)
	else:
		push_warning("AnimatedState '%s': Animation '%s' not found" % [name, anim_key])


static func _pascal_to_snake(pascal: String) -> String:
	var result: String = ""
	for i in pascal.length():
		var c: String = pascal[i]
		if c == c.to_upper() and i > 0:
			result += "_"
		result += c.to_lower()
	return result
```

### Waiting for Animation to Finish

Some states (Attack, Hurt, Death) should wait for their animation to complete before transitioning.

```gdscript
# attack_state.gd
class_name AttackState
extends State

@export var idle_state: State
@export var fall_state: State

var _attack_finished: bool = false


func enter() -> void:
	_attack_finished = false
	anim.play("attack")
	# Connect to animation_finished for this entry only
	anim.animation_finished.connect(_on_animation_finished, CONNECT_ONE_SHOT)


func exit() -> void:
	# Safety cleanup — disconnect if we exit early (e.g., took damage)
	if anim.animation_finished.is_connected(_on_animation_finished):
		anim.animation_finished.disconnect(_on_animation_finished)


func physics_update(delta: float) -> State:
	# Apply gravity even during attack
	character.velocity.y += 980.0 * delta
	character.velocity.x = move_toward(character.velocity.x, 0.0, 600.0 * delta)
	character.move_and_slide()

	if not character.is_on_floor():
		return fall_state

	if _attack_finished:
		return idle_state

	return null


func _on_animation_finished(_anim_name: StringName) -> void:
	_attack_finished = true
```

---

## Combining Patterns: Character FSM + Game Flow Stack

Real games use multiple state machines for different concerns:

```
Game (Node)
├── GameStateMachine (pushdown)     ← Game flow (gameplay, menus, cutscenes)
│   ├── MainMenu
│   ├── Gameplay
│   ├── PauseMenu
│   ├── Inventory
│   └── GameOver
│
└── World (Node2D)
    └── Player (CharacterBody2D)
        ├── StateMachine (node-based)   ← Character behavior (idle, run, jump)
        │   ├── Idle
        │   ├── Run
        │   ├── Jump
        │   ├── Fall
        │   └── Attack
        ├── Sprite2D
        ├── AnimationPlayer
        └── CollisionShape2D
```

These are independent — the game flow machine doesn't know about character states, and vice versa. The game flow machine pauses the tree (which freezes the character FSM), but they never directly interact.

---

## Common Mistakes

### 1. Checking State from Outside

```gdscript
# ❌ Bad — External code checking state name
if player.state_machine.current_state.name == "Attack":
    # Do something

# ✅ Good — State exposes what you actually need
if player.is_attacking:
    # Do something
```

The character should expose booleans or signals, not its internal state structure. Other systems shouldn't know or care about state names.

### 2. Circular Transitions

```gdscript
# ❌ Causes infinite loop on the same frame
func physics_update(delta: float) -> State:
    if character.velocity.y > 0:
        return fall_state  # Fall immediately checks is_on_floor...
    return null            # ...which sends back to Idle, which falls again
```

Fix: Add minimum time in state, or use `enter()` to set initial conditions that prevent immediate re-transition.

### 3. Forgetting Exit Cleanup

```gdscript
# ❌ Timer keeps running after state exits
func enter() -> void:
    $CooldownTimer.start()

# ✅ Always clean up in exit()
func exit() -> void:
    $CooldownTimer.stop()
```

### 4. Physics in `_process`, Logic in `_physics_process`

```gdscript
# ❌ Movement in update() — frame-rate dependent, inconsistent
func update(delta: float) -> State:
    character.velocity.x = input_dir * speed
    character.move_and_slide()
    return null

# ✅ Movement always in physics_update()
func physics_update(delta: float) -> State:
    character.velocity.x = input_dir * speed
    character.move_and_slide()
    return null
```

`move_and_slide()` should only be called from `_physics_process` (which calls `physics_update`). Use `update()` for visual-only logic like UI updates or particle effects.

### 5. God States

If a state script is over 100 lines, it's doing too much. Split shared logic into the character script or a parent state (HSM). States should handle transitions and state-specific behavior — not character-wide systems like health, inventory, or dialogue.

---

## State Machine Anti-Patterns in Godot

### Don't Use AnimationTree as a State Machine

Godot has `AnimationNodeStateMachine` in AnimationTree. It's for blending animations, not game logic. Never put gameplay code in animation transitions.

```gdscript
# ❌ Using AnimationTree for game logic
animation_tree["parameters/StateMachine/playback"].travel("attack")
# Where does the damage happen? When does the state end?
# It's buried in animation callbacks. Unmaintainable.

# ✅ State machine drives animations, not the other way around
func enter() -> void:
    anim.play("attack")
    # Game logic is HERE, in the state script
```

### Don't Store State as Strings

```gdscript
# ❌ Stringly-typed state
var state: String = "idle"

func _process(delta: float) -> void:
    if state == "idel":  # Typo — silent bug, no error
        pass

# ✅ Enum or node reference — compiler catches errors
var state: DoorState = DoorState.IDLE  # Typo = compile error
```

---

## Real-World Example: Enemy AI State Machine

Enemies use the same patterns but with different transition logic — typically driven by detection ranges rather than input.

```gdscript
# enemy_idle_state.gd
class_name EnemyIdleState
extends State

@export var patrol_state: State
@export var chase_state: State
@export var detection_area: Area2D

var _player_in_range: bool = false


func enter() -> void:
	anim.play("idle")
	if detection_area:
		detection_area.body_entered.connect(_on_body_entered)
		detection_area.body_exited.connect(_on_body_exited)
	_player_in_range = false


func exit() -> void:
	if detection_area:
		if detection_area.body_entered.is_connected(_on_body_entered):
			detection_area.body_entered.disconnect(_on_body_entered)
		if detection_area.body_exited.is_connected(_on_body_exited):
			detection_area.body_exited.disconnect(_on_body_exited)


func physics_update(_delta: float) -> State:
	if _player_in_range:
		return chase_state
	return null


func _on_body_entered(body: Node2D) -> void:
	if body is CharacterBody2D and body.is_in_group("player"):
		_player_in_range = true


func _on_body_exited(body: Node2D) -> void:
	if body is CharacterBody2D and body.is_in_group("player"):
		_player_in_range = false
```

```gdscript
# enemy_chase_state.gd
class_name EnemyChaseState
extends State

@export var idle_state: State
@export var attack_state: State

@export var chase_speed: float = 120.0
@export var attack_range: float = 40.0
@export var give_up_range: float = 300.0
@export var gravity: float = 980.0

var _target: CharacterBody2D = null


func enter() -> void:
	anim.play("run")
	# Find the player (there's only one)
	var players: Array[Node] = character.get_tree().get_nodes_in_group("player")
	if not players.is_empty():
		_target = players[0] as CharacterBody2D


func physics_update(delta: float) -> State:
	if _target == null or not is_instance_valid(_target):
		return idle_state

	var distance: float = character.global_position.distance_to(_target.global_position)

	# Close enough to attack
	if distance < attack_range:
		return attack_state

	# Too far — give up
	if distance > give_up_range:
		return idle_state

	# Chase
	var direction: float = signf(_target.global_position.x - character.global_position.x)
	character.velocity.x = direction * chase_speed
	character.velocity.y += gravity * delta

	# Flip sprite
	character.get_node("Sprite2D").flip_h = direction < 0.0

	character.move_and_slide()
	return null
```

---

## Performance Considerations

- **Node-based FSM** adds ~1 node per state. For 10 states, that's 10 extra nodes — negligible. Even 100 enemies with 5-state FSMs = 500 nodes. Godot handles thousands.
- **`_process` / `_physics_process` cost**: Only the active state runs per-frame logic. Inactive states do nothing (no processing cost). The `StateMachine` delegates to one state, which runs one function.
- **Signal connections**: Connect in `enter()`, disconnect in `exit()`. Never leave signals connected on inactive states — they'll fire and cause bugs.
- **HSM overhead**: Minimal — one extra function call per parent state in the hierarchy. Even 3-level deep HSM adds ~2 extra function calls per frame.
- **State stack (Pushdown)**: Use `process_mode = DISABLED` on paused states to prevent any processing. The stack itself is just an array — O(1) push/pop.

---

## Choosing Your Pattern: Decision Flowchart

```
Is behavior simple (≤4 states, no enter/exit logic)?
├── YES → Enum FSM
└── NO → Do states share logic (e.g., all grounded states handle jump)?
    ├── YES → Hierarchical State Machine
    └── NO → Do states pause and resume (menus, dialogue)?
        ├── YES → Pushdown Automaton
        └── NO → Node-Based FSM
```

---

## File Organization

```
scripts/
├── state_machines/
│   ├── state.gd                    # Base State class
│   ├── state_machine.gd            # FSM manager
│   ├── hierarchical_state.gd       # HSM base (if using)
│   ├── game_state.gd               # Pushdown base (if using)
│   └── game_state_machine.gd       # Pushdown manager (if using)
├── player/
│   ├── states/
│   │   ├── idle_state.gd
│   │   ├── run_state.gd
│   │   ├── jump_state.gd
│   │   ├── fall_state.gd
│   │   ├── wall_slide_state.gd
│   │   └── attack_state.gd
│   └── player.gd
└── enemies/
    ├── states/
    │   ├── enemy_idle_state.gd
    │   ├── enemy_chase_state.gd
    │   └── enemy_attack_state.gd
    └── slime.gd
```

---

## What's Next

- **[G3 Signal Architecture](./G3_signal_architecture.md)** — How states communicate with the rest of the game without tight coupling
- **[G1 Scene Composition](./G1_scene_composition.md)** — Building the scenes that state machines control
- **[E1 Architecture Overview](../architecture/E1_architecture_overview.md)** — How state machines fit into Godot's overall architecture
