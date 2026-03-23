# G8 — Animation Systems

> **Engine:** Godot 4.4+ · **Level:** Intermediate–Advanced  
> **Typed GDScript** · **Estimated read:** 25 min

Complete guide to Godot's animation pipeline: AnimationPlayer for keyframe animation, AnimationTree for blending and state machines, Tweens for procedural motion, and AnimatedSprite2D for frame-by-frame sprites. Covers integration with state machines (G2), physics (G5), and combat systems.

---

## Table of Contents

1. [Animation Pipeline Overview](#1-animation-pipeline-overview)
2. [AnimationPlayer Fundamentals](#2-animationplayer-fundamentals)
3. [Keyframing Anything](#3-keyframing-anything)
4. [Animation Callbacks & Signals](#4-animation-callbacks--signals)
5. [AnimatedSprite2D — Frame-by-Frame](#5-animatedsprite2d--frame-by-frame)
6. [AnimationTree — Blend Trees](#6-animationtree--blend-trees)
7. [AnimationTree — State Machines](#7-animationtree--state-machines)
8. [Blend Spaces (1D & 2D)](#8-blend-spaces-1d--2d)
9. [Root Motion & Transform Tracks](#9-root-motion--transform-tracks)
10. [Tween System — Procedural Animation](#10-tween-system--procedural-animation)
11. [Tween Chaining & Parallel Execution](#11-tween-chaining--parallel-execution)
12. [Hit Effects — Flash, Shake, Freeze](#12-hit-effects--flash-shake-freeze)
13. [Sprite Sheet Animation Pipeline](#13-sprite-sheet-animation-pipeline)
14. [State Machine Integration](#14-state-machine-integration)
15. [Animation Layers & Overrides](#15-animation-layers--overrides)
16. [Cutscene & Dialogue Animation](#16-cutscene--dialogue-animation)
17. [Performance Considerations](#17-performance-considerations)
18. [Common Mistakes & Fixes](#18-common-mistakes--fixes)
19. [Tuning Reference Tables](#19-tuning-reference-tables)

---

## 1. Animation Pipeline Overview

Godot provides four animation systems, each suited to different needs:

```
┌─────────────────────────────────────────────────────┐
│                ANIMATION PIPELINE                    │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐                 │
│  │AnimationPlayer│  │AnimatedSprite│                 │
│  │  (keyframes) │  │  (frames)    │                 │
│  └──────┬───────┘  └──────┬───────┘                 │
│         │                  │                         │
│         ▼                  ▼                         │
│  ┌──────────────┐  ┌──────────────┐                 │
│  │AnimationTree │  │   Direct     │                 │
│  │(blend/state) │  │  Playback    │                 │
│  └──────┬───────┘  └──────────────┘                 │
│         │                                            │
│         ▼                                            │
│  ┌──────────────┐  ┌──────────────┐                 │
│  │  Scene Tree  │◄─┤    Tweens    │                 │
│  │ (final pose) │  │ (procedural) │                 │
│  └──────────────┘  └──────────────┘                 │
└─────────────────────────────────────────────────────┘
```

### Which System to Use

| System | Best For | Not For |
|--------|----------|---------|
| **AnimationPlayer** | Sprite animation, property animation, cutscenes, complex timelines | Simple position/scale tweens |
| **AnimatedSprite2D** | Simple frame-by-frame sprites (coins, pickups, decorations) | Complex characters with multiple tracks |
| **AnimationTree** | Character animation with blending, directional movement, combo systems | Simple single-animation objects |
| **Tweens** | UI animation, juice effects, procedural motion, one-shot transitions | Looping character animation |

### Execution Order

```
_physics_process()     → Game logic updates velocity, state
AnimationPlayer        → Plays/advances keyframe animations
AnimationTree          → Blends animation outputs
Tweens                 → Applies procedural property changes (last wins)
Rendering              → Final visual frame
```

**Critical rule:** AnimationPlayer and Tweens both write to properties. If both target the same property (e.g., `modulate`), the last one to execute wins. Tweens execute after AnimationPlayer, so a Tween will override an AnimationPlayer track on the same property.

---

## 2. AnimationPlayer Fundamentals

AnimationPlayer is Godot's most powerful animation tool. It keyframes *any* property on *any* node in the scene.

### Basic Setup

```
Player (CharacterBody2D)
├── Sprite2D
├── CollisionShape2D
├── AnimationPlayer        ← Animates siblings and children
└── StateMachine
```

### Playing Animations

```gdscript
class_name PlayerCharacter
extends CharacterBody2D

@onready var anim_player: AnimationPlayer = $AnimationPlayer
@onready var sprite: Sprite2D = $Sprite2D

func _ready() -> void:
	# Play immediately
	anim_player.play("idle")

func _physics_process(delta: float) -> void:
	if velocity.length() > 10.0:
		anim_player.play("run")
	else:
		anim_player.play("idle")
	
	# Flip sprite based on direction
	if velocity.x != 0.0:
		sprite.flip_h = velocity.x < 0.0
```

### Playback Control

```gdscript
# Play from start
anim_player.play("attack")

# Play backwards
anim_player.play_backwards("attack")

# Play from specific position (seconds)
anim_player.play("run")
anim_player.seek(0.5)

# Queue animation (plays after current finishes)
anim_player.queue("idle")

# Stop (freezes at current frame)
anim_player.stop()

# Pause / resume
anim_player.pause()
anim_player.play()  # Resumes from paused position

# Speed scale (2.0 = double speed, -1.0 = reverse)
anim_player.speed_scale = 1.5

# Check current state
var is_playing: bool = anim_player.is_playing()
var current: String = anim_player.current_animation
var position: float = anim_player.current_animation_position
var length: float = anim_player.current_animation_length
```

### RESET Animation (Critical Pattern)

Every AnimationPlayer should have a `RESET` animation. This defines the default property values — Godot uses it to restore properties when animations stop.

```gdscript
# Create RESET in the editor:
# 1. Add animation named "RESET" (exact spelling, all caps)
# 2. Set length to 0.0 (or minimal)
# 3. Add keyframes for ALL animated properties at their default values
#    - Sprite modulate: Color(1, 1, 1, 1)
#    - Sprite frame: 0
#    - Position offset: Vector2.ZERO
#    - Scale: Vector2.ONE
```

Without a RESET animation, stopping an animation mid-playback leaves the node in whatever state the animation was in at that frame. This causes visual artifacts (stuck in red tint, wrong frame, offset position).

---

## 3. Keyframing Anything

AnimationPlayer can animate any property accessible via a NodePath. This is its superpower.

### Property Tracks

```gdscript
# In the Animation editor, you can keyframe:

# Sprite frame (for sprite sheet animation)
# Path: Sprite2D:frame
# Values: 0, 1, 2, 3, 4, 5 (integer frames)

# Color modulation (for flash effects)
# Path: Sprite2D:modulate
# Values: Color(1,1,1,1) → Color(1,0,0,1) → Color(1,1,1,1)

# Position (for screen shake, recoil, bobbing)
# Path: Sprite2D:position
# Values: Vector2(0, 0) → Vector2(2, -1) → Vector2(-1, 2) → Vector2(0, 0)

# Scale (for squash & stretch)
# Path: Sprite2D:scale
# Values: Vector2(1,1) → Vector2(1.2, 0.8) → Vector2(0.9, 1.1) → Vector2(1,1)

# Visibility
# Path: Sprite2D:visible
# Values: true / false

# Shader parameters
# Path: Sprite2D:material:shader_parameter/flash_amount
# Values: 0.0 → 1.0 → 0.0
```

### Method Call Tracks

Trigger functions at specific points during animation:

```gdscript
# In Animation editor: Add Track → Call Method Track
# Select target node, then add keyframes with method name + args

# Example: Play sound effect at frame 3 of attack animation
# Path: ../../AudioManager
# Method: play_sfx("sword_swing")

# Example: Spawn particles at impact frame
# Method: spawn_hit_particles()

# Example: Enable/disable hitbox during attack
# Method: set_hitbox_active(true)   # at frame 3
# Method: set_hitbox_active(false)  # at frame 5

func set_hitbox_active(active: bool) -> void:
	$HitboxComponent/CollisionShape2D.disabled = not active
```

### Bezier Tracks

For smooth easing on individual properties:

```gdscript
# In Animation editor: Add Track → Bezier Track
# Allows per-keyframe easing curves with handles
# Best for: camera movements, UI transitions, smooth position changes

# Alternatively, set interpolation mode per keyframe:
# - Nearest (snap, no interpolation)
# - Linear
# - Cubic (smooth curves)
```

### Audio Tracks

```gdscript
# In Animation editor: Add Track → Audio Playback Track
# Keyframe AudioStreamPlayer nodes to play specific sounds at specific times
# Automatically handles stopping previous audio
# Great for: footstep sounds synced to walk cycle, attack whooshes
```

---

## 4. Animation Callbacks & Signals

### Built-in Signals

```gdscript
@onready var anim_player: AnimationPlayer = $AnimationPlayer

func _ready() -> void:
	anim_player.animation_finished.connect(_on_animation_finished)
	anim_player.animation_started.connect(_on_animation_started)
	anim_player.animation_changed.connect(_on_animation_changed)

func _on_animation_finished(anim_name: StringName) -> void:
	match anim_name:
		&"attack":
			# Return to idle after attack completes
			anim_player.play("idle")
		&"death":
			queue_free()
		&"land":
			anim_player.play("idle")

func _on_animation_started(anim_name: StringName) -> void:
	if anim_name == &"attack":
		can_move = false

func _on_animation_changed(old_name: StringName, new_name: StringName) -> void:
	# Fires when animation is interrupted by another
	pass
```

### Await Pattern

```gdscript
func play_attack() -> void:
	anim_player.play("attack_windup")
	await anim_player.animation_finished
	
	anim_player.play("attack_strike")
	await anim_player.animation_finished
	
	anim_player.play("attack_recovery")
	await anim_player.animation_finished
	
	anim_player.play("idle")
```

**Warning:** If the animation is interrupted (another `play()` call), the `await` resolves immediately with the interrupted animation's name. Always check the name:

```gdscript
func play_attack() -> void:
	anim_player.play("attack")
	var finished_anim: StringName = await anim_player.animation_finished
	
	if finished_anim != &"attack":
		return  # Animation was interrupted, don't continue chain
	
	anim_player.play("idle")
```

### Frame-Accurate Events via Method Tracks

For precise timing (hitbox activation, particle spawning), prefer method call tracks over signal-based approaches:

```gdscript
# In the attack animation, add method call keyframes:
# Frame 0.0s: _on_attack_start()
# Frame 0.2s: _on_attack_active()     ← Hitbox ON
# Frame 0.4s: _on_attack_recovery()   ← Hitbox OFF
# Frame 0.6s: _on_attack_end()

func _on_attack_start() -> void:
	can_cancel = false

func _on_attack_active() -> void:
	$HitboxComponent/CollisionShape2D.disabled = false
	$AttackVFX.emitting = true

func _on_attack_recovery() -> void:
	$HitboxComponent/CollisionShape2D.disabled = true
	can_cancel = true

func _on_attack_end() -> void:
	attack_finished.emit()
```

---

## 5. AnimatedSprite2D — Frame-by-Frame

For simpler objects that just cycle through sprite frames without needing property animation.

### Setup

```gdscript
class_name Coin
extends Area2D

@onready var sprite: AnimatedSprite2D = $AnimatedSprite2D

func _ready() -> void:
	sprite.play("spin")
	# AnimatedSprite2D manages its own SpriteFrames resource
	# Configure in Inspector: SpriteFrames → Add animation → Add frames
```

### SpriteFrames Resource

```
SpriteFrames (resource)
├── "spin"      → 8 frames, 12 FPS, loop: true
├── "collected" → 4 frames, 16 FPS, loop: false
└── "idle"      → 1 frame (static)
```

### Playback

```gdscript
# Play animation
sprite.play("spin")

# Play from specific frame
sprite.play("spin")
sprite.frame = 3

# One-shot (don't loop)
sprite.play("collected")  # Set loop=false in SpriteFrames

# Speed
sprite.speed_scale = 2.0

# Signals
sprite.animation_finished.connect(_on_sprite_animation_finished)
sprite.frame_changed.connect(_on_frame_changed)

func _on_sprite_animation_finished() -> void:
	if sprite.animation == &"collected":
		queue_free()

func _on_frame_changed() -> void:
	# Useful for footstep sounds on specific frames
	if sprite.animation == &"run" and sprite.frame in [2, 6]:
		play_footstep_sound()
```

### When to Use AnimatedSprite2D vs AnimationPlayer

| AnimatedSprite2D | AnimationPlayer |
|------------------|-----------------|
| Simple frame cycling | Complex multi-track timelines |
| Coins, pickups, decorations | Player characters, enemies |
| One sprite, one animation set | Multiple properties animated together |
| No property animation needed | Needs scale/position/color changes |
| Quick prototyping | Production quality |

**Rule of thumb:** If you need to animate anything besides the sprite frame (color, scale, position, enable/disable nodes), use AnimationPlayer.

---

## 6. AnimationTree — Blend Trees

AnimationTree sits on top of AnimationPlayer and provides blending, transitions, and state machine logic.

### Setup

```
Player (CharacterBody2D)
├── Sprite2D
├── AnimationPlayer        ← Has all animations defined
├── AnimationTree          ← Controls which animation plays and blending
│   └── tree_root: AnimationNodeBlendTree
└── StateMachine
```

```gdscript
@onready var anim_tree: AnimationTree = $AnimationTree

func _ready() -> void:
	# AnimationTree must reference an AnimationPlayer
	# Set in Inspector: Anim Player → select ../AnimationPlayer
	anim_tree.active = true
```

### BlendTree Nodes

```
┌─────────────────────────────────────────────┐
│              BLEND TREE                      │
│                                              │
│  ┌────────┐                                 │
│  │  idle   │──┐                             │
│  └────────┘  │  ┌──────────┐                │
│              ├──│ Blend2    │──► Output      │
│  ┌────────┐  │  │blend:0..1│                │
│  │  run   │──┘  └──────────┘                │
│  └────────┘                                  │
└─────────────────────────────────────────────┘
```

```gdscript
# Control blend amount from code
func _physics_process(delta: float) -> void:
	var speed_ratio: float = velocity.length() / max_speed
	anim_tree.set("parameters/idle_run_blend/blend_amount", speed_ratio)
```

### Common Blend Tree Patterns

```gdscript
# Blend2: Mix two animations (0.0 = first, 1.0 = second)
anim_tree.set("parameters/blend/blend_amount", 0.5)

# Add2: Additive blend (layer animation on top)
# Useful for: breathing on top of idle, aim offset
anim_tree.set("parameters/add/add_amount", 1.0)

# OneShot: Play once over current animation, then return
# Useful for: attack, hurt reactions, emotes
anim_tree.set("parameters/oneshot/request", AnimationNodeOneShot.ONE_SHOT_REQUEST_FIRE)

# Check if OneShot is active
var is_active: bool = anim_tree.get("parameters/oneshot/active")

# TimeScale: Speed multiplier for a sub-tree
anim_tree.set("parameters/timescale/scale", 2.0)

# Seek: Jump to specific time in animation
anim_tree.set("parameters/seek/seek_request", 0.5)
```

---

## 7. AnimationTree — State Machines

The most common AnimationTree setup for game characters. Each state plays an animation, transitions define how to move between them.

### Setup

```
AnimationTree
└── tree_root: AnimationNodeStateMachine
    ├── idle (AnimationNodeAnimation)
    ├── run (AnimationNodeAnimation)
    ├── jump (AnimationNodeAnimation)
    ├── fall (AnimationNodeAnimation)
    ├── attack (AnimationNodeAnimation → OneShot)
    └── Transitions:
        ├── idle ↔ run    (auto, blend: 0.1s)
        ├── idle → jump   (auto, blend: 0.05s)
        ├── run → jump    (auto, blend: 0.05s)
        ├── jump → fall   (auto, blend: 0.1s)
        ├── fall → idle   (auto, blend: 0.1s)
        └── fall → run    (auto, blend: 0.1s)
```

### Controlling the State Machine

```gdscript
@onready var anim_tree: AnimationTree = $AnimationTree
var state_machine: AnimationNodeStateMachinePlayback

func _ready() -> void:
	anim_tree.active = true
	state_machine = anim_tree.get("parameters/playback")

func _physics_process(delta: float) -> void:
	update_animation_state()

func update_animation_state() -> void:
	if not is_on_floor():
		if velocity.y < 0.0:
			state_machine.travel("jump")
		else:
			state_machine.travel("fall")
	elif velocity.length() > 10.0:
		state_machine.travel("run")
	else:
		state_machine.travel("idle")

func play_attack() -> void:
	# travel() follows transitions; start() forces immediate
	state_machine.travel("attack")

func get_current_animation() -> StringName:
	return state_machine.get_current_node()
```

### travel() vs start()

```gdscript
# travel() — follows defined transitions, respects blend times
# Use for normal gameplay flow
state_machine.travel("run")

# start() — immediately jumps to state, no transition
# Use for hard cuts (death, teleport, respawn)
state_machine.start("death")

# next() — queue the next state after current finishes
state_machine.next("idle")
```

### Transition Configuration

Configure in the AnimationTree editor:

| Property | Description | Typical Value |
|----------|-------------|---------------|
| **Switch Mode** | `AtEnd` (wait for current to finish) or `Immediate` | `Immediate` for responsive controls |
| **Advance Mode** | `Auto` (uses advance conditions) or `Disabled` | `Auto` for most |
| **Xfade Time** | Crossfade duration in seconds | 0.05–0.2s |
| **Priority** | Higher = preferred path when multiple transitions valid | 0–10 |
| **Advance Condition** | Boolean parameter name that enables this transition | `"is_running"` |

### Advance Conditions (Parameter-Driven Transitions)

```gdscript
# Set conditions that transitions evaluate automatically
func _physics_process(delta: float) -> void:
	anim_tree.set("parameters/conditions/is_running", velocity.length() > 10.0)
	anim_tree.set("parameters/conditions/is_grounded", is_on_floor())
	anim_tree.set("parameters/conditions/is_attacking", is_attacking)
```

In the editor, set each transition's Advance Condition to match:
- `idle → run` transition: condition = `is_running`
- `run → idle` transition: condition = (leave empty, becomes the "else" path)
- `any → attack`: condition = `is_attacking`

---

## 8. Blend Spaces (1D & 2D)

### 1D Blend Space — Speed-Based

Blend between animations based on a single parameter:

```
       0.0        0.5        1.0
        │          │          │
      idle      walk        run
```

```gdscript
func _physics_process(delta: float) -> void:
	var speed_ratio: float = velocity.length() / max_speed
	anim_tree.set("parameters/blend_space_1d/blend_position", speed_ratio)
```

### 2D Blend Space — Directional Movement

Blend between animations based on two parameters (common for top-down movement):

```
              Up (0, -1)
               │
    UpLeft     │     UpRight
         ·     │     ·
               │
Left ──────────┼────────── Right
(-1, 0)        │          (1, 0)
               │
   DownLeft    │    DownRight
         ·     │     ·
               │
            Down (0, 1)
```

```gdscript
# Top-down character with 8-directional animation
func _physics_process(delta: float) -> void:
	if velocity.length() > 10.0:
		var direction: Vector2 = velocity.normalized()
		anim_tree.set("parameters/move/blend_position", direction)
		anim_tree.set("parameters/idle_move_blend/blend_amount", 1.0)
	else:
		anim_tree.set("parameters/idle_move_blend/blend_amount", 0.0)
		# Keep last direction for idle facing
```

### Practical: 4-Direction Top-Down Character

```gdscript
class_name TopDownCharacter
extends CharacterBody2D

@export var speed: float = 200.0

@onready var anim_tree: AnimationTree = $AnimationTree
@onready var sprite: Sprite2D = $Sprite2D

var last_direction: Vector2 = Vector2.DOWN

func _physics_process(delta: float) -> void:
	var input_dir: Vector2 = Input.get_vector("left", "right", "up", "down")
	velocity = input_dir * speed
	
	if input_dir != Vector2.ZERO:
		last_direction = input_dir.normalized()
		anim_tree.set("parameters/walk/blend_position", last_direction)
		anim_tree.set("parameters/idle/blend_position", last_direction)
		anim_tree.set("parameters/conditions/is_moving", true)
	else:
		anim_tree.set("parameters/conditions/is_moving", false)
	
	move_and_slide()
```

AnimationTree state machine setup:
- **idle** state: BlendSpace2D with idle_down, idle_up, idle_left, idle_right
- **walk** state: BlendSpace2D with walk_down, walk_up, walk_left, walk_right
- Transition `idle → walk`: condition = `is_moving`
- Transition `walk → idle`: condition = (not `is_moving`)

---

## 9. Root Motion & Transform Tracks

### Root Motion (3D Primarily)

Root motion extracts movement from the animation itself rather than code. In 2D, this is less common but useful for precise attack lunges.

```gdscript
# 3D root motion setup
@onready var anim_tree: AnimationTree = $AnimationTree

func _physics_process(delta: float) -> void:
	# Get root motion from animation
	var root_motion: Vector3 = anim_tree.get_root_motion_position()
	
	# Apply to character
	velocity = root_motion / delta
	move_and_slide()
```

### 2D Position Animation for Attack Lunges

Rather than root motion, 2D games typically animate position directly:

```gdscript
# In AnimationPlayer, create "attack_lunge" animation:
# Track: .:position
# Frame 0.0s: Vector2(0, 0)        ← Start position
# Frame 0.1s: Vector2(30, 0)       ← Lunge forward
# Frame 0.3s: Vector2(35, 0)       ← Hold
# Frame 0.5s: Vector2(0, 0)        ← Return

# The animation directly moves the CharacterBody2D
# Important: This doesn't use move_and_slide, so it ignores physics
# For physics-aware lunges, animate velocity in code instead:

func attack_lunge(direction: Vector2) -> void:
	var tween: Tween = create_tween()
	tween.tween_property(self, "velocity",
		direction * lunge_speed, 0.1)
	tween.tween_property(self, "velocity",
		Vector2.ZERO, 0.3).set_ease(Tween.EASE_OUT)
```

---

## 10. Tween System — Procedural Animation

Tweens are code-driven animations. They're ideal for:
- UI transitions (fade, slide, scale)
- Juice effects (bounce, pulse, flash)
- One-shot procedural effects
- Value interpolation

### Basic Tweens

```gdscript
# Create a tween — automatically freed when finished
var tween: Tween = create_tween()

# Move to position over 0.5 seconds
tween.tween_property(sprite, "position", Vector2(100, 50), 0.5)

# Scale with easing
tween.tween_property(sprite, "scale", Vector2(2.0, 2.0), 0.3) \
	.set_ease(Tween.EASE_OUT) \
	.set_trans(Tween.TRANS_ELASTIC)

# Fade out
tween.tween_property(sprite, "modulate:a", 0.0, 0.5)

# Rotate
tween.tween_property(sprite, "rotation", TAU, 1.0)  # Full rotation
```

### Easing & Transitions

```gdscript
# Transition types (shape of the curve)
Tween.TRANS_LINEAR    # Constant speed
Tween.TRANS_SINE      # Smooth sinusoidal
Tween.TRANS_QUAD      # Quadratic (gentle)
Tween.TRANS_CUBIC     # Cubic (medium)
Tween.TRANS_QUART     # Quartic (aggressive)
Tween.TRANS_QUINT     # Quintic (very aggressive)
Tween.TRANS_EXPO      # Exponential (extreme)
Tween.TRANS_ELASTIC   # Springy overshoot
Tween.TRANS_BOUNCE    # Bouncing ball
Tween.TRANS_BACK      # Overshoot and return
Tween.TRANS_SPRING    # Spring oscillation

# Ease types (where the easing applies)
Tween.EASE_IN         # Slow start, fast end
Tween.EASE_OUT        # Fast start, slow end (most common for UI)
Tween.EASE_IN_OUT     # Slow start and end
Tween.EASE_OUT_IN     # Fast start and end

# Common combinations for game feel:
# Pop-in:    EASE_OUT + TRANS_BACK     (overshoot, settle)
# Bounce:    EASE_OUT + TRANS_BOUNCE   (bouncing ball)
# Smooth:    EASE_OUT + TRANS_CUBIC    (natural deceleration)
# Punchy:    EASE_OUT + TRANS_EXPO     (fast start, soft landing)
# Springy:   EASE_OUT + TRANS_ELASTIC  (rubber band)
```

### Relative & Incremental Tweens

```gdscript
# as_relative() — adds to current value instead of replacing
var tween: Tween = create_tween()
tween.tween_property(sprite, "position", Vector2(50, 0), 0.3) \
	.as_relative()  # Move 50px right from current position

# from() — start from a specific value, tween TO current
tween.tween_property(sprite, "modulate:a", 0.0, 0.3) \
	.from(1.0)  # Fade from 1.0 to current alpha

# from_current() — capture current value as start (default behavior)
tween.tween_property(sprite, "scale", Vector2(1.5, 1.5), 0.2) \
	.from_current()
```

### Tween Callbacks & Method Interpolation

```gdscript
var tween: Tween = create_tween()

# Call a method at a specific point
tween.tween_callback(play_sound.bind("coin_collect"))

# Interpolate a method (call repeatedly with changing value)
tween.tween_method(set_health_bar, 0.0, 1.0, 1.0)

func set_health_bar(value: float) -> void:
	health_bar.value = value

# Delay
tween.tween_interval(0.5)  # Wait 0.5 seconds
```

---

## 11. Tween Chaining & Parallel Execution

### Sequential (Default)

```gdscript
var tween: Tween = create_tween()

# These run one after another
tween.tween_property(sprite, "position:y", -20.0, 0.2) \
	.as_relative().set_ease(Tween.EASE_OUT)
tween.tween_property(sprite, "position:y", 20.0, 0.2) \
	.as_relative().set_ease(Tween.EASE_IN)
# Result: hop up, then land
```

### Parallel

```gdscript
var tween: Tween = create_tween()

# set_parallel() makes ALL subsequent tweeners start together
tween.set_parallel(true)
tween.tween_property(sprite, "scale", Vector2(1.3, 1.3), 0.2)
tween.tween_property(sprite, "modulate", Color(1, 1, 0), 0.2)
tween.tween_property(sprite, "rotation", 0.1, 0.1)

# Or use .parallel() on individual tweeners
tween.set_parallel(false)  # Reset to sequential
tween.tween_property(sprite, "position:y", -10.0, 0.1).as_relative()
tween.parallel().tween_property(sprite, "scale", Vector2(1.2, 0.8), 0.1)
```

### Looping

```gdscript
# Loop forever
var tween: Tween = create_tween().set_loops()
tween.tween_property(sprite, "modulate:a", 0.5, 0.5)
tween.tween_property(sprite, "modulate:a", 1.0, 0.5)
# Result: pulsing alpha

# Loop N times
var tween2: Tween = create_tween().set_loops(3)
tween2.tween_property(sprite, "position:x", 5.0, 0.05).as_relative()
tween2.tween_property(sprite, "position:x", -5.0, 0.05).as_relative()
# Result: shake 3 times
```

### Killing & Managing Tweens

```gdscript
var active_tween: Tween

func flash_red() -> void:
	# Kill previous tween to prevent conflicts
	if active_tween and active_tween.is_running():
		active_tween.kill()
	
	active_tween = create_tween()
	active_tween.tween_property(sprite, "modulate", Color.RED, 0.05)
	active_tween.tween_property(sprite, "modulate", Color.WHITE, 0.15)

# Process mode — tweens can run during pause
var tween: Tween = create_tween()
tween.set_process_mode(Tween.TWEEN_PROCESS_PHYSICS)  # Run in physics step
tween.set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)       # Continue during pause
```

### Practical: Collect Item Animation

```gdscript
func collect() -> void:
	# Disable collision immediately
	$CollisionShape2D.disabled = true
	
	var tween: Tween = create_tween()
	tween.set_parallel(true)
	
	# Float up
	tween.tween_property(self, "position:y", -30.0, 0.4) \
		.as_relative().set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_QUAD)
	
	# Scale up then down
	tween.chain().tween_property(sprite, "scale", Vector2(1.5, 1.5), 0.15) \
		.set_ease(Tween.EASE_OUT)
	tween.tween_property(sprite, "scale", Vector2.ZERO, 0.25) \
		.set_ease(Tween.EASE_IN)
	
	# Fade out
	tween.tween_property(sprite, "modulate:a", 0.0, 0.4)
	
	# Cleanup
	tween.set_parallel(false)
	tween.tween_callback(queue_free)
```

---

## 12. Hit Effects — Flash, Shake, Freeze

### White Flash (Shader-Based)

The most professional hit effect. Uses a shader to flash the sprite white.

```gdscript
# flash.gdshader — attach to Sprite2D material
shader_type canvas_item;

uniform float flash_amount : hint_range(0.0, 1.0) = 0.0;
uniform vec4 flash_color : source_color = vec4(1.0, 1.0, 1.0, 1.0);

void fragment() {
	vec4 tex_color = texture(TEXTURE, UV);
	COLOR = mix(tex_color, flash_color, flash_amount);
	COLOR.a = tex_color.a;  // Preserve original alpha
}
```

```gdscript
# In the character script:
func flash_white(duration: float = 0.1) -> void:
	var material: ShaderMaterial = sprite.material as ShaderMaterial
	if not material:
		return
	
	material.set_shader_parameter("flash_amount", 1.0)
	
	var tween: Tween = create_tween()
	tween.tween_property(material, "shader_parameter/flash_amount",
		0.0, duration)

# Alternative without shader (simple modulate):
func flash_modulate(color: Color = Color.WHITE, duration: float = 0.1) -> void:
	sprite.modulate = color
	var tween: Tween = create_tween()
	tween.tween_property(sprite, "modulate", Color.WHITE, duration)
```

### Hit Freeze (Frame Pause)

Pause the game briefly on hit for impact:

```gdscript
## Freezes the scene tree for [param duration] seconds.
## Uses [method SceneTree.create_timer] which respects [code]process_always[/code].
func hit_freeze(duration: float = 0.05) -> void:
	Engine.time_scale = 0.0
	await get_tree().create_timer(duration, true, false, true).timeout
	Engine.time_scale = 1.0
```

**Important:** `Engine.time_scale` affects everything. For selective freeze (only freeze the hit target, not the attacker), use a per-node approach:

```gdscript
## Freezes this node and its children for [param duration] seconds.
func freeze_node(duration: float = 0.05) -> void:
	process_mode = Node.PROCESS_MODE_DISABLED
	# Use a SceneTree timer so it fires even when we're disabled
	await get_tree().create_timer(duration).timeout
	process_mode = Node.PROCESS_MODE_INHERIT
```

### Knockback Flash + Shake Combo

```gdscript
func take_hit(damage: int, knockback_dir: Vector2) -> void:
	# 1. Flash white
	flash_white(0.1)
	
	# 2. Brief freeze
	await hit_freeze(0.04)
	
	# 3. Screen shake (via camera — see G6)
	CameraManager.shake(0.15, 4.0)
	
	# 4. Knockback velocity
	velocity = knockback_dir * knockback_force
	
	# 5. I-frames with blinking
	start_invincibility(1.0)

func start_invincibility(duration: float) -> void:
	is_invincible = true
	
	# Blink effect
	var tween: Tween = create_tween().set_loops(int(duration / 0.1))
	tween.tween_property(sprite, "modulate:a", 0.3, 0.05)
	tween.tween_property(sprite, "modulate:a", 1.0, 0.05)
	
	await get_tree().create_timer(duration).timeout
	is_invincible = false
	sprite.modulate.a = 1.0
```

---

## 13. Sprite Sheet Animation Pipeline

### Importing Sprite Sheets

Godot can import individual frames or atlas sheets:

```gdscript
# Method 1: Individual frame files (walk_01.png, walk_02.png, etc.)
# → Drag into SpriteFrames editor for AnimatedSprite2D
# → Or create AnimationPlayer with frame track

# Method 2: Sprite sheet atlas (one PNG, frames in grid)
# → Use AtlasTexture to define regions
# → Or set Sprite2D.hframes/vframes for grid sheets

# Grid sheet setup:
@onready var sprite: Sprite2D = $Sprite2D

func _ready() -> void:
	# If sprite sheet is 8 columns × 4 rows
	sprite.hframes = 8
	sprite.vframes = 4
	sprite.frame = 0  # Top-left frame
```

### AnimationPlayer with Sprite Sheets

```gdscript
# In AnimationPlayer, animate the Sprite2D:frame property:
# Animation "idle":
#   Frame 0.00s → sprite.frame = 0
#   Frame 0.15s → sprite.frame = 1
#   Frame 0.30s → sprite.frame = 2
#   Frame 0.45s → sprite.frame = 3
#   Loop: true
#   Length: 0.60s

# Animation "run":
#   Frame 0.00s → sprite.frame = 8
#   Frame 0.10s → sprite.frame = 9
#   Frame 0.20s → sprite.frame = 10
#   Frame 0.30s → sprite.frame = 11
#   Frame 0.40s → sprite.frame = 12
#   Frame 0.50s → sprite.frame = 13
#   Loop: true
#   Length: 0.60s
```

### Aseprite Integration

For Aseprite users (most common pixel art tool):

```gdscript
# Option 1: Export from Aseprite as individual PNGs with tags
# File → Export Sprite Sheet → Output: Individual files + JSON
# Tag names become animation names

# Option 2: Use AsepriteWizard addon (godot-asset-library)
# Automatically imports .aseprite files and creates:
# - SpriteFrames for AnimatedSprite2D
# - OR AnimationPlayer tracks
# Preserves tags as animation names, respects frame durations

# Option 3: Manual import of sheet + JSON
# Aseprite exports JSON with frame data:
# { "frames": { "idle_0": { "frame": { "x": 0, "y": 0, "w": 32, "h": 32 } } } }
```

### Variable Frame Timing

Not all frames should be equal length. Attack animations often have faster startup and slower recovery:

```gdscript
# In AnimationPlayer, vary the time between keyframes:
# "attack" animation (0.5s total):
#   0.00s → frame 0  (windup: 100ms per frame — slow)
#   0.10s → frame 1
#   0.20s → frame 2  (strike: 50ms per frame — fast)
#   0.25s → frame 3
#   0.30s → frame 4  (recovery: 100ms per frame — slow)
#   0.40s → frame 5
#   0.50s → frame 6

# This creates the classic "slow windup → fast strike → slow recovery" feel
# that makes attacks readable and impactful
```

---

## 14. State Machine Integration

Connecting the animation system with the state machine pattern from G2.

### State-Driven Animation

```gdscript
## Base state class with animation support.
class_name CharacterState
extends Node

var character: CharacterBody2D
var anim_player: AnimationPlayer
var anim_tree: AnimationTree
var state_machine_playback: AnimationNodeStateMachinePlayback

func enter() -> void:
	pass

func exit() -> void:
	pass

func update(_delta: float) -> void:
	pass

func physics_update(_delta: float) -> void:
	pass

## Play animation with optional blend override.
func play_animation(anim_name: StringName) -> void:
	if anim_tree and state_machine_playback:
		state_machine_playback.travel(anim_name)
	elif anim_player:
		anim_player.play(anim_name)
```

### Example: Platformer States with Animation

```gdscript
class_name IdleState
extends CharacterState

func enter() -> void:
	play_animation(&"idle")

func physics_update(delta: float) -> void:
	# Transition to run
	if character.velocity.x != 0.0:
		state_machine.transition_to("Run")
	
	# Transition to fall
	if not character.is_on_floor():
		state_machine.transition_to("Fall")
```

```gdscript
class_name RunState
extends CharacterState

func enter() -> void:
	play_animation(&"run")

func physics_update(delta: float) -> void:
	if character.velocity.x == 0.0 and character.is_on_floor():
		state_machine.transition_to("Idle")
	elif not character.is_on_floor():
		state_machine.transition_to("Fall")
```

```gdscript
class_name AttackState
extends CharacterState

var can_combo: bool = false
var combo_requested: bool = false

func enter() -> void:
	play_animation(&"attack_1")
	can_combo = false
	combo_requested = false
	character.velocity.x = 0.0
	
	# Connect animation signals for this state
	anim_player.animation_finished.connect(_on_animation_finished)

func exit() -> void:
	anim_player.animation_finished.disconnect(_on_animation_finished)

func update(_delta: float) -> void:
	# Buffer combo input during attack
	if Input.is_action_just_pressed("attack") and can_combo:
		combo_requested = true

func _on_animation_finished(anim_name: StringName) -> void:
	if combo_requested and anim_name == &"attack_1":
		play_animation(&"attack_2")
		combo_requested = false
		can_combo = false
	else:
		state_machine.transition_to("Idle")
```

### Animation Events → State Transitions

Use animation method tracks to communicate with the state machine:

```gdscript
# In AttackState, called by animation method track:
func _on_combo_window_open() -> void:
	can_combo = true

func _on_combo_window_close() -> void:
	can_combo = false

func _on_hitbox_activate() -> void:
	character.hitbox.enable()

func _on_hitbox_deactivate() -> void:
	character.hitbox.disable()
```

---

## 15. Animation Layers & Overrides

### Upper/Lower Body Split (2D Approach)

In 2D, "layers" are typically separate sprites or animation overrides:

```gdscript
# Two Sprite2D nodes, each with their own AnimationPlayer
Player (CharacterBody2D)
├── LowerBody (Sprite2D)
│   └── LowerAnimPlayer (AnimationPlayer)    ← legs: idle, run, jump
├── UpperBody (Sprite2D)
│   └── UpperAnimPlayer (AnimationPlayer)    ← torso: idle, aim, attack
└── StateMachine
```

```gdscript
# Control independently
func _physics_process(delta: float) -> void:
	# Lower body follows movement
	if velocity.length() > 10.0:
		lower_anim.play("run")
	else:
		lower_anim.play("idle")
	
	# Upper body follows combat state
	if is_attacking:
		upper_anim.play("attack")
	elif is_aiming:
		upper_anim.play("aim")
	else:
		upper_anim.play("idle")
```

### AnimationTree with OneShot Overlay

A single AnimationTree can layer animations using OneShot:

```
AnimationTree (StateMachine root)
├── Movement (BlendSpace2D)   ← idle/walk/run
└── OneShot                    ← plays attack/hurt OVER movement
    ├── Input: Movement output
    └── Shot: attack animation
```

```gdscript
# Fire the one-shot attack over current movement
func attack() -> void:
	anim_tree.set("parameters/oneshot/request",
		AnimationNodeOneShot.ONE_SHOT_REQUEST_FIRE)

# Abort the one-shot (e.g., player got stunned)
func interrupt_attack() -> void:
	anim_tree.set("parameters/oneshot/request",
		AnimationNodeOneShot.ONE_SHOT_REQUEST_ABORT)

# Check if one-shot is active
func is_attack_playing() -> bool:
	return anim_tree.get("parameters/oneshot/active")
```

### Animation Override for Variants

Same character, different weapons/outfits via AnimationLibrary:

```gdscript
# AnimationPlayer can hold multiple AnimationLibraries
# Default library: ""
# Weapon libraries: "sword", "bow", "staff"

func equip_weapon(weapon_type: String) -> void:
	# Load the weapon's animation library
	var lib: AnimationLibrary = load(
		"res://animations/%s_animations.tres" % weapon_type
	)
	
	# Replace or add the library
	if anim_player.has_animation_library("weapon"):
		anim_player.remove_animation_library("weapon")
	anim_player.add_animation_library("weapon", lib)
	
	# Now play weapon-specific animations:
	anim_player.play("weapon/attack")  # Library/AnimationName format
```

---

## 16. Cutscene & Dialogue Animation

### AnimationPlayer as Cutscene Director

AnimationPlayer can orchestrate entire cutscenes by animating multiple nodes:

```gdscript
class_name CutscenePlayer
extends Node

@onready var anim_player: AnimationPlayer = $AnimationPlayer
@onready var camera: Camera2D = $Camera2D
@onready var dialogue_box: Control = $UI/DialogueBox

signal cutscene_finished

func play_cutscene(cutscene_name: String) -> void:
	# Disable player control
	Events.cutscene_started.emit()
	
	anim_player.play(cutscene_name)
	await anim_player.animation_finished
	
	Events.cutscene_ended.emit()
	cutscene_finished.emit()
```

### Cutscene Animation Tracks

```gdscript
# "intro_cutscene" animation (10 seconds):
# Track 1: Camera2D:position — pan across the scene
# Track 2: Camera2D:zoom — zoom in on character
# Track 3: NPC1:position — NPC walks into frame
# Track 4: NPC1/AnimationPlayer:play — NPC wave animation
# Track 5: DialogueBox:visible — show/hide dialogue
# Track 6: DialogueBox/Label:text — change dialogue text
# Track 7: AudioStreamPlayer:play — background music
# Track 8: Method track — call show_dialogue("Hello!") at 3.0s
```

### Dialogue with Typewriter Effect

```gdscript
class_name DialogueBox
extends Control

@onready var label: RichTextLabel = $RichTextLabel
@onready var name_label: Label = $NameLabel

@export var chars_per_second: float = 30.0

signal dialogue_finished

var is_typing: bool = false

func show_dialogue(speaker: String, text: String) -> void:
	name_label.text = speaker
	label.text = text
	label.visible_ratio = 0.0
	visible = true
	is_typing = true
	
	var duration: float = float(text.length()) / chars_per_second
	var tween: Tween = create_tween()
	tween.tween_property(label, "visible_ratio", 1.0, duration)
	tween.tween_callback(func() -> void:
		is_typing = false
	)

func skip_typing() -> void:
	if is_typing:
		label.visible_ratio = 1.0
		is_typing = false

func _input(event: InputEvent) -> void:
	if event.is_action_pressed("ui_accept"):
		if is_typing:
			skip_typing()
		else:
			visible = false
			dialogue_finished.emit()
```

---

## 17. Performance Considerations

### AnimationPlayer vs Tween Overhead

| System | Overhead | Best for |
|--------|----------|----------|
| AnimationPlayer | Low per-player, but allocates tracks | Persistent animated objects |
| AnimationTree | Moderate (blend calculations each frame) | Characters with complex blending |
| Tweens | Very low, auto-freed | Temporary effects, UI |
| AnimatedSprite2D | Minimal | Simple frame cycling |

### Optimization Tips

```gdscript
# 1. Disable AnimationPlayer when offscreen
func _on_visibility_changed() -> void:
	anim_player.active = is_visible_in_tree()

# 2. Use AnimationPlayer.playback_process_mode
# Set to PHYSICS for gameplay animation (syncs with physics)
# Set to IDLE for UI animation (smoother visually)
anim_player.playback_process_mode = AnimationPlayer.ANIMATION_PROCESS_PHYSICS

# 3. Avoid creating tweens every frame
# BAD:
func _process(delta: float) -> void:
	create_tween().tween_property(sprite, "rotation", target_rot, 0.1)

# GOOD:
func _process(delta: float) -> void:
	sprite.rotation = lerp_angle(sprite.rotation, target_rot, 10.0 * delta)

# 4. Batch similar animations
# For 100 coins, use one AnimatedSprite2D's SpriteFrames resource
# (shared by reference, not duplicated per instance)

# 5. AnimationTree state machine: avoid rapid travel() calls
# Cache the current state and only call travel() when it changes:
var _last_anim_state: StringName = &""

func set_animation_state(state: StringName) -> void:
	if state != _last_anim_state:
		state_machine_playback.travel(state)
		_last_anim_state = state

# 6. Reduce AnimationTree blend computations
# Set unused blend spaces to 0 weight
# Use simpler trees (fewer blend nodes) when possible
```

### Animation LOD

For large numbers of animated entities:

```gdscript
## Reduce animation quality for distant/offscreen entities.
func update_animation_lod() -> void:
	var distance_to_camera: float = global_position.distance_to(
		get_viewport().get_camera_2d().global_position
	)
	
	if distance_to_camera > 800.0:
		# Far away: skip animation entirely
		anim_player.active = false
	elif distance_to_camera > 400.0:
		# Medium distance: half speed (reduces processing)
		anim_player.active = true
		anim_player.speed_scale = 0.5
	else:
		# Close: full quality
		anim_player.active = true
		anim_player.speed_scale = 1.0
```

---

## 18. Common Mistakes & Fixes

### Mistake 1: Calling play() Every Frame

```gdscript
# ❌ BAD — restarts animation every frame
func _process(delta: float) -> void:
	anim_player.play("idle")  # Resets to frame 0 every frame!

# ✅ GOOD — only play if not already playing this animation
func _process(delta: float) -> void:
	if anim_player.current_animation != "idle":
		anim_player.play("idle")

# ✅ ALSO GOOD — let the state machine handle transitions
```

### Mistake 2: Tween Stacking

```gdscript
# ❌ BAD — multiple tweens fight over the same property
func take_damage() -> void:
	var tween: Tween = create_tween()
	tween.tween_property(sprite, "modulate", Color.RED, 0.1)
	tween.tween_property(sprite, "modulate", Color.WHITE, 0.1)
	# If called rapidly, old tweens still running → flickering

# ✅ GOOD — kill previous tween first
var damage_tween: Tween

func take_damage() -> void:
	if damage_tween and damage_tween.is_running():
		damage_tween.kill()
	
	damage_tween = create_tween()
	damage_tween.tween_property(sprite, "modulate", Color.RED, 0.1)
	damage_tween.tween_property(sprite, "modulate", Color.WHITE, 0.1)
```

### Mistake 3: AnimationTree Not Active

```gdscript
# ❌ AnimationTree does nothing
func _ready() -> void:
	# Forgot to activate!
	pass

# ✅ Must be activated
func _ready() -> void:
	$AnimationTree.active = true
	# Also verify: AnimationTree.Anim Player property is set in Inspector
```

### Mistake 4: Wrong Process Mode

```gdscript
# ❌ Animation jitters because it runs in _process
# but movement runs in _physics_process

# ✅ Match animation to movement processing:
# For gameplay: AnimationPlayer.playback_process_mode = PHYSICS
# For UI: AnimationPlayer.playback_process_mode = IDLE
```

### Mistake 5: No RESET Animation

```gdscript
# ❌ Stopping attack animation leaves sprite red-tinted
anim_player.stop()  # Properties stay at their last animated value

# ✅ Create a RESET animation with all properties at defaults
# RESET animation restores properties when any animation stops

# Alternative: explicitly restore in code
func _on_animation_finished(anim_name: StringName) -> void:
	sprite.modulate = Color.WHITE
	sprite.scale = Vector2.ONE
```

### Mistake 6: AnimationTree travel() to Non-Existent State

```gdscript
# ❌ Crashes or silently fails
state_machine_playback.travel("nonexistent_state")

# ✅ Check before traveling (debug builds)
func safe_travel(state: StringName) -> void:
	if OS.is_debug_build():
		# Verify state exists in the state machine
		var anim_state_machine: AnimationNodeStateMachine = \
			anim_tree.tree_root as AnimationNodeStateMachine
		if not anim_state_machine.has_node(state):
			push_warning("Animation state '%s' not found" % state)
			return
	state_machine_playback.travel(state)
```

### Mistake 7: Tween on Freed Node

```gdscript
# ❌ Node gets freed while tween is running → error
func die() -> void:
	var tween: Tween = create_tween()
	tween.tween_property(sprite, "modulate:a", 0.0, 0.5)
	queue_free()  # Node freed before tween finishes!

# ✅ Wait for tween, or bind to SceneTree
func die() -> void:
	# Option A: await the tween
	var tween: Tween = create_tween()
	tween.tween_property(sprite, "modulate:a", 0.0, 0.5)
	await tween.finished
	queue_free()
	
	# Option B: use tween_callback for cleanup
	var tween2: Tween = create_tween()
	tween2.tween_property(sprite, "modulate:a", 0.0, 0.5)
	tween2.tween_callback(queue_free)
```

---

## 19. Tuning Reference Tables

### Animation Speed by Genre

| Genre | Idle FPS | Run FPS | Attack Duration | Blend Time |
|-------|----------|---------|-----------------|------------|
| Platformer (responsive) | 6–8 | 10–12 | 0.2–0.4s | 0.02–0.05s |
| Platformer (floaty) | 4–6 | 8–10 | 0.3–0.6s | 0.05–0.1s |
| Top-down RPG | 4–6 | 8–10 | 0.4–0.8s | 0.1–0.15s |
| Action (fast-paced) | 8–10 | 12–16 | 0.15–0.3s | 0.02–0.04s |
| Metroidvania | 6–8 | 10–12 | 0.2–0.5s | 0.03–0.06s |
| Turn-based | 4–6 | 6–8 | 0.5–1.0s | 0.1–0.2s |

### Hit Effect Timing

| Effect | Duration | Notes |
|--------|----------|-------|
| White flash | 0.05–0.1s | Shorter = snappier, longer = more visible |
| Red tint | 0.1–0.2s | On damaged entity |
| Hit freeze | 0.03–0.06s | Global time scale, keep very short |
| Screen shake | 0.1–0.3s | Intensity matters more than duration |
| Knockback | 0.15–0.3s | Must exceed i-frame flash duration |
| I-frame blink | 0.5–2.0s | Genre-dependent (platformer: 1s, Souls-like: 0.5s) |

### Squash & Stretch Values

| Action | Scale X | Scale Y | Duration | Easing |
|--------|---------|---------|----------|--------|
| Land (light) | 1.2 | 0.8 | 0.08s | EASE_OUT + ELASTIC |
| Land (heavy) | 1.4 | 0.6 | 0.12s | EASE_OUT + ELASTIC |
| Jump anticipation | 0.85 | 1.15 | 0.05s | EASE_IN + QUAD |
| Jump launch | 1.1 | 0.9 | 0.1s | EASE_OUT + QUAD |
| Hurt recoil | 0.8 | 1.2 | 0.06s | EASE_OUT + BACK |
| Collect pop | 1.3 | 1.3 | 0.1s | EASE_OUT + BACK |
| Coin bounce | 1.1 | 0.9 | 0.05s | EASE_OUT + SINE |
| Button press | 0.95 | 0.95 | 0.05s | EASE_OUT + QUAD |
| Button release | 1.05 | 1.05 | 0.08s | EASE_OUT + ELASTIC |

### Tween Presets for Common Effects

| Effect | Transition | Easing | Duration |
|--------|-----------|--------|----------|
| UI slide in | TRANS_BACK | EASE_OUT | 0.3–0.5s |
| UI fade in | TRANS_CUBIC | EASE_OUT | 0.2–0.3s |
| Pop-in scale | TRANS_ELASTIC | EASE_OUT | 0.3–0.5s |
| Bounce | TRANS_BOUNCE | EASE_OUT | 0.4–0.6s |
| Smooth move | TRANS_CUBIC | EASE_IN_OUT | 0.3–0.5s |
| Snap to position | TRANS_EXPO | EASE_OUT | 0.1–0.2s |
| Pulse (loop) | TRANS_SINE | EASE_IN_OUT | 0.8–1.2s |
| Damage number float | TRANS_QUAD | EASE_OUT | 0.8–1.2s |
| Menu item hover | TRANS_QUAD | EASE_OUT | 0.1–0.15s |

---

## Related Guides

- **[G1 — Scene Composition](G1_scene_composition.md)** — Component scene structure for animated entities
- **[G2 — State Machine](G2_state_machine.md)** — FSM patterns that drive animation states
- **[G3 — Signal Architecture](G3_signal_architecture.md)** — Signal bus for animation events
- **[G4 — Input Handling](G4_input_handling.md)** — Input buffering + combo detection
- **[G5 — Physics & Collision](G5_physics_and_collision.md)** — Hitbox/hurtbox activation during attacks
- **[G6 — Camera Systems](G6_camera_systems.md)** — Screen shake and trauma system
- **[E1 — Architecture Overview](../architecture/E1_architecture_overview.md)** — Node tree and scene model

---

*Godot 4.4+ · Typed GDScript · Last updated: 2026-03-23*
