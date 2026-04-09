# G38 — Game Feel & Juice Patterns

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#
> **Related:** [G8 Animation Systems](./G8_animation_systems.md) · [G6 Camera Systems](./G6_camera_systems.md) · [G15 Particle Systems](./G15_particle_systems.md) · [G9 UI & Control Systems](./G9_ui_control_systems.md)

---

## What This Guide Covers

"Game feel" — often called "juice" — is the collection of small, layered effects that make a game feel responsive and satisfying. A hit that triggers screen shake, hitstop, a particle burst, and a knockback tween *feels* powerful, even if the underlying mechanics are simple. None of these effects change gameplay, but they change how the game **feels** to play.

This guide covers the core juice techniques — screen shake, hitstop/freeze frames, squash-and-stretch, Tween-based animations, impact effects, and UI polish — with practical Godot 4.x implementations you can drop into any project.

---

## Table of Contents

1. [The Juice Toolkit](#1-the-juice-toolkit)
2. [Screen Shake (Trauma System)](#2-screen-shake-trauma-system)
3. [Hitstop / Freeze Frames](#3-hitstop--freeze-frames)
4. [Squash and Stretch](#4-squash-and-stretch)
5. [Tweens for Everything](#5-tweens-for-everything)
6. [Impact Effects Stack](#6-impact-effects-stack)
7. [UI Juice](#7-ui-juice)
8. [Chromatic Aberration and Post-Processing Pulses](#8-chromatic-aberration-and-post-processing-pulses)
9. [C# Equivalents](#9-c-equivalents)
10. [Guidelines: How Much Juice?](#10-guidelines-how-much-juice)
11. [Common Mistakes](#11-common-mistakes)

---

## 1. The Juice Toolkit

Every juice effect fits into one of these categories:

```
┌──────────────────────────────────────────────────────┐
│  TIMING       │ Hitstop, slow-mo, speed-up           │
│  MOVEMENT     │ Screen shake, knockback, recoil       │
│  DEFORMATION  │ Squash/stretch, scale pulses          │
│  PARTICLES    │ Sparks, dust, debris, trails           │
│  AUDIO        │ Pitch variation, layered SFX           │
│  VISUAL       │ Flash, chromatic aberration, bloom      │
│  UI           │ Number pop-ups, bar shake, bounce-in   │
└──────────────────────────────────────────────────────┘
```

The key principle: **layer multiple small effects** for a single game event. A sword hit is not just damage — it is screen shake + hitstop + particle burst + SFX + flash + knockback, all triggered in the same frame.

---

## 2. Screen Shake (Trauma System)

The trauma-based screen shake system is the gold standard. Instead of triggering isolated shakes, you maintain a `trauma` value that decays over time. The actual camera offset is derived from `trauma²` (or `trauma³`), which makes small hits subtle and big hits dramatic.

### Camera Script

```gdscript
# shake_camera.gd — Attach to a Camera2D (or Camera3D with adjustments)
extends Camera2D

## Maximum horizontal/vertical shake in pixels
@export var max_offset := Vector2(16.0, 12.0)
## Maximum rotation shake in radians
@export var max_roll := 0.05
## How quickly trauma decays (per second)
@export var decay_rate := 2.0
## Power curve: 2 = quadratic (smooth), 3 = cubic (punchier)
@export var trauma_power := 2.0

var trauma: float = 0.0
var _noise := FastNoiseLite.new()
var _noise_y: int = 0


func _ready() -> void:
	# Configure noise for smooth, non-repeating shake
	_noise.seed = randi()
	_noise.frequency = 4.0
	_noise.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH


func add_trauma(amount: float) -> void:
	## Call this from anywhere: ShakeCamera.add_trauma(0.5)
	trauma = clampf(trauma + amount, 0.0, 1.0)


func _process(delta: float) -> void:
	if trauma <= 0.0:
		offset = Vector2.ZERO
		rotation = 0.0
		return
	
	# Advance noise sampling position
	_noise_y += 1
	
	# Shake intensity = trauma ^ power
	var shake := pow(trauma, trauma_power)
	
	# Sample noise for smooth, organic movement (not jerky random)
	offset.x = max_offset.x * shake * _noise.get_noise_2d(_noise.seed, _noise_y)
	offset.y = max_offset.y * shake * _noise.get_noise_2d(_noise.seed + 100, _noise_y)
	rotation = max_roll * shake * _noise.get_noise_2d(_noise.seed + 200, _noise_y)
	
	# Decay trauma over time
	trauma = maxf(trauma - decay_rate * delta, 0.0)
```

### Triggering Shake

```gdscript
# Anywhere in your game:
func _on_enemy_hit() -> void:
	camera.add_trauma(0.4)  # Medium hit

func _on_explosion() -> void:
	camera.add_trauma(0.8)  # Big hit

func _on_footstep() -> void:
	camera.add_trauma(0.05)  # Subtle rumble
```

> **Why noise instead of random?** `randf()` produces discontinuous jumps — the camera teleports each frame. Noise produces smooth curves that feel like physical vibration.

---

## 3. Hitstop / Freeze Frames

Hitstop briefly pauses the game (2–6 frames) on a big impact, giving the player's brain time to register the hit. It is one of the most impactful juice techniques.

### Engine.time_scale Approach

```gdscript
# hitstop.gd — Autoload or utility
extends Node

var _timer: SceneTreeTimer = null


## Freeze the game for `duration` seconds, then resume.
func trigger(duration: float = 0.05) -> void:
	Engine.time_scale = 0.0
	
	# SceneTreeTimer respects time_scale=0 only if process_always=true
	_timer = get_tree().create_timer(duration, true, false, true)
	await _timer.timeout
	
	Engine.time_scale = 1.0
```

> **Note:** The 4th argument `true` in `create_timer()` (Godot 4.4+) makes the timer use real time, ignoring `time_scale`. In older versions, use `process_always = true` on a Timer node.

### Per-Node Approach (More Control)

If you only want certain nodes to freeze (e.g., the attacker and target but not the background):

```gdscript
# Freeze a specific node's animation and movement
func freeze_node(node: Node, duration: float = 0.05) -> void:
	if node is AnimatedSprite2D:
		node.speed_scale = 0.0
	node.set_physics_process(false)
	node.set_process(false)
	
	await get_tree().create_timer(duration, true, false, true).timeout
	
	if is_instance_valid(node):
		if node is AnimatedSprite2D:
			node.speed_scale = 1.0
		node.set_physics_process(true)
		node.set_process(true)
```

### Slow-Motion Variant

```gdscript
## Slow time to `scale` for `duration` real seconds, then ease back.
func slow_motion(scale: float = 0.2, duration: float = 0.3) -> void:
	Engine.time_scale = scale
	await get_tree().create_timer(duration, true, false, true).timeout
	
	# Ease back to normal over 0.2 real seconds
	var tween := create_tween().set_process_mode(Tween.TWEEN_PROCESS_PHYSICS)
	tween.tween_property(Engine, "time_scale", 1.0, 0.2)
```

---

## 4. Squash and Stretch

Squash and stretch makes characters feel alive and weighty. The core principle: **volume stays constant** — when you squash on one axis, stretch on the other.

```gdscript
# juicy_sprite.gd — Attach to any Node2D with a sprite child
extends Node2D

## The sprite node to deform
@export var sprite: Node2D

## Squash on land (wide + short)
func squash(intensity: float = 0.3, duration: float = 0.15) -> void:
	var tween := create_tween().set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_ELASTIC)
	sprite.scale = Vector2(1.0 + intensity, 1.0 - intensity)
	tween.tween_property(sprite, "scale", Vector2.ONE, duration)

## Stretch on jump (tall + narrow)
func stretch(intensity: float = 0.3, duration: float = 0.15) -> void:
	var tween := create_tween().set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_ELASTIC)
	sprite.scale = Vector2(1.0 - intensity * 0.5, 1.0 + intensity)
	tween.tween_property(sprite, "scale", Vector2.ONE, duration)

## Generic punch-scale (good for pickups, UI elements)
func punch(intensity: float = 0.2, duration: float = 0.2) -> void:
	var tween := create_tween().set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_ELASTIC)
	sprite.scale = Vector2.ONE * (1.0 + intensity)
	tween.tween_property(sprite, "scale", Vector2.ONE, duration)
```

### Integration with Character Controller

```gdscript
func _on_landed() -> void:
	juicy_sprite.squash(0.35)
	# Kick up dust particles
	dust_particles.restart()

func _on_jump() -> void:
	juicy_sprite.stretch(0.3)

func _on_dash() -> void:
	juicy_sprite.stretch(0.5, 0.1)
```

---

## 5. Tweens for Everything

Godot 4's `Tween` system is the backbone of juice. Key patterns:

### Chaining and Parallel Execution

```gdscript
# Sequential: scale up → wait → scale down
var tween := create_tween()
tween.tween_property(sprite, "scale", Vector2(1.3, 1.3), 0.1)
tween.tween_interval(0.05)
tween.tween_property(sprite, "scale", Vector2.ONE, 0.2)

# Parallel: move and fade at the same time
var tween := create_tween()
tween.tween_property(node, "position:y", -50.0, 0.5)
tween.parallel().tween_property(node, "modulate:a", 0.0, 0.5)
```

### Ease and Transition Types

```gdscript
# Bouncy landing
tween.set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_BOUNCE)

# Smooth deceleration (most natural for movement)
tween.set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)

# Elastic spring (great for UI and squash/stretch)
tween.set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_ELASTIC)

# Snappy punch (overshoots then settles)
tween.set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_BACK)
```

### Flash on Hit

```gdscript
## Flash a sprite white for a brief moment
func flash_white(sprite: CanvasItem, duration: float = 0.1) -> void:
	sprite.modulate = Color.WHITE * 3.0  # Overbright white flash
	var tween := create_tween()
	tween.tween_property(sprite, "modulate", Color.WHITE, duration)

## Alternatively, use a shader for a true white-out effect:
# In a shader: uniform float flash_amount : hint_range(0,1);
# COLOR.rgb = mix(COLOR.rgb, vec3(1.0), flash_amount);
```

### Damage Number Pop-Up

```gdscript
func spawn_damage_number(value: int, world_pos: Vector2) -> void:
	var label := Label.new()
	label.text = str(value)
	label.position = world_pos
	label.z_index = 100
	add_child(label)
	
	var tween := create_tween()
	# Float up and fade out
	tween.tween_property(label, "position:y", world_pos.y - 40.0, 0.6) \
		.set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
	tween.parallel().tween_property(label, "modulate:a", 0.0, 0.6) \
		.set_delay(0.3)
	# Scale punch on spawn
	label.scale = Vector2.ZERO
	tween.parallel().tween_property(label, "scale", Vector2.ONE, 0.15) \
		.set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_BACK)
	
	tween.tween_callback(label.queue_free)
```

---

## 6. Impact Effects Stack

A single impact event should trigger multiple layered effects. Here is a reusable pattern:

```gdscript
# impact_effects.gd — Autoload or attached to a manager node
extends Node

@export var camera: Camera2D  # The shake camera from Section 2


## Call this for any combat hit. Customize parameters per weapon/attack.
func combat_hit(
	target: Node2D,
	damage: int,
	hit_position: Vector2,
	intensity: float = 0.5  # 0.0 = light tap, 1.0 = massive slam
) -> void:
	# 1. Hitstop — scales with intensity
	Hitstop.trigger(lerpf(0.02, 0.08, intensity))
	
	# 2. Screen shake
	camera.add_trauma(intensity * 0.6)
	
	# 3. Flash the target white
	if target is CanvasItem:
		flash_white(target, 0.1)
	
	# 4. Spawn particles at hit position
	_spawn_hit_particles(hit_position, intensity)
	
	# 5. Damage number
	spawn_damage_number(damage, hit_position + Vector2(0, -20))
	
	# 6. Knockback (via tween, not physics — more controllable)
	if target is CharacterBody2D:
		var direction := (target.global_position - hit_position).normalized()
		var knockback_dist := lerpf(20.0, 80.0, intensity)
		var tween := create_tween()
		tween.tween_property(
			target, "position",
			target.position + direction * knockback_dist, 0.15
		).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)


func _spawn_hit_particles(pos: Vector2, intensity: float) -> void:
	# Reuse a GPUParticles2D from a pool, or instance one
	var particles := preload("res://effects/hit_sparks.tscn").instantiate()
	particles.global_position = pos
	particles.amount = int(lerpf(8.0, 32.0, intensity))
	particles.emitting = true
	add_child(particles)
	# Auto-free after particles finish
	await get_tree().create_timer(particles.lifetime * 2.0).timeout
	particles.queue_free()
```

---

## 7. UI Juice

### Health Bar with Delayed Drain

The "white bar" pattern — health drops instantly (red) but a ghost bar (white/yellow) drains slowly behind it, showing how much damage was taken.

```gdscript
# health_bar.gd
extends Control

@onready var red_bar: ProgressBar = $RedBar
@onready var ghost_bar: ProgressBar = $GhostBar

var _drain_tween: Tween


func update_health(current: float, max_health: float) -> void:
	var percent := (current / max_health) * 100.0
	
	# Red bar drops instantly
	red_bar.value = percent
	
	# Ghost bar drains after a delay
	if _drain_tween and _drain_tween.is_running():
		_drain_tween.kill()
	
	_drain_tween = create_tween()
	_drain_tween.tween_interval(0.4)  # Delay before drain starts
	_drain_tween.tween_property(ghost_bar, "value", percent, 0.6) \
		.set_ease(Tween.EASE_IN_OUT).set_trans(Tween.TRANS_CUBIC)
```

### Button Hover Bounce

```gdscript
func _on_button_mouse_entered() -> void:
	var tween := create_tween().set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_BACK)
	tween.tween_property(button, "scale", Vector2(1.05, 1.05), 0.15)

func _on_button_mouse_exited() -> void:
	var tween := create_tween().set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
	tween.tween_property(button, "scale", Vector2.ONE, 0.1)
```

---

## 8. Chromatic Aberration and Post-Processing Pulses

For intense moments (boss hits, explosions), briefly pulse a post-processing effect:

```gdscript
# chromatic_pulse.gdshader — Apply to a ColorRect covering the viewport
shader_type canvas_item;

uniform float aberration_amount : hint_range(0.0, 0.05) = 0.0;
uniform sampler2D screen_texture : hint_screen_texture, filter_linear;

void fragment() {
	vec2 uv = SCREEN_UV;
	float r = texture(screen_texture, uv + vec2(aberration_amount, 0.0)).r;
	float g = texture(screen_texture, uv).g;
	float b = texture(screen_texture, uv - vec2(aberration_amount, 0.0)).b;
	COLOR = vec4(r, g, b, 1.0);
}
```

```gdscript
# Trigger from code:
func pulse_aberration(intensity: float = 0.02, duration: float = 0.15) -> void:
	var mat: ShaderMaterial = aberration_rect.material
	mat.set_shader_parameter("aberration_amount", intensity)
	var tween := create_tween()
	tween.tween_method(
		func(val: float): mat.set_shader_parameter("aberration_amount", val),
		intensity, 0.0, duration
	).set_ease(Tween.EASE_OUT)
```

---

## 9. C# Equivalents

### Trauma-Based Screen Shake

```csharp
using Godot;

public partial class ShakeCamera : Camera2D
{
    [Export] public Vector2 MaxOffset = new(16f, 12f);
    [Export] public float MaxRoll = 0.05f;
    [Export] public float DecayRate = 2f;
    [Export] public float TraumaPower = 2f;

    public float Trauma { get; private set; }
    private FastNoiseLite _noise = new();
    private int _noiseY;

    public override void _Ready()
    {
        _noise.Seed = (int)GD.Randi();
        _noise.Frequency = 4f;
        _noise.NoiseType = FastNoiseLite.NoiseTypeEnum.SimplexSmooth;
    }

    public void AddTrauma(float amount)
    {
        Trauma = Mathf.Clamp(Trauma + amount, 0f, 1f);
    }

    public override void _Process(double delta)
    {
        if (Trauma <= 0f)
        {
            Offset = Vector2.Zero;
            Rotation = 0f;
            return;
        }

        _noiseY++;
        float shake = Mathf.Pow(Trauma, TraumaPower);

        Offset = new Vector2(
            MaxOffset.X * shake * _noise.GetNoise2D(_noise.Seed, _noiseY),
            MaxOffset.Y * shake * _noise.GetNoise2D(_noise.Seed + 100, _noiseY)
        );
        Rotation = MaxRoll * shake * _noise.GetNoise2D(_noise.Seed + 200, _noiseY);

        Trauma = Mathf.Max(Trauma - DecayRate * (float)delta, 0f);
    }
}
```

### Hitstop

```csharp
public partial class Hitstop : Node
{
    public async void Trigger(float duration = 0.05f)
    {
        Engine.TimeScale = 0.0;
        await ToSignal(
            GetTree().CreateTimer(duration, true, false, true),
            SceneTreeTimer.SignalName.Timeout
        );
        Engine.TimeScale = 1.0;
    }
}
```

---

## 10. Guidelines: How Much Juice?

- **Start without juice.** Get gameplay working first. Juice is polish, not design.
- **Layer 3–5 effects per major event**, 1–2 for minor events. More than 5 starts to feel noisy.
- **Keep durations short.** Most juice effects should be 0.05–0.3 seconds. Longer effects feel sluggish.
- **Scale with intensity.** A light sword slash gets less shake/hitstop than a heavy hammer slam.
- **Let the player disable it.** Some players are sensitive to screen shake or flash effects. Provide options in your accessibility settings.
- **Audio completes the illusion.** Visual juice without matching audio feels hollow. Always pair effects with sound.

---

## 11. Common Mistakes

| Mistake | Fix |
|---------|-----|
| Screen shake using `randf()` instead of noise | Use `FastNoiseLite` for smooth, organic shake |
| Hitstop freezes UI/menus too | Use `process_mode = PROCESS_MODE_ALWAYS` on UI nodes |
| Tweens stacking and fighting | Kill the previous tween before creating a new one |
| Squash/stretch on the physics body | Apply scale to the **sprite child**, not the `CharacterBody2D` — scaling the body changes collision shapes |
| Flash effect not visible on dark sprites | Use a shader white-out instead of `modulate` overbright |
| Too much hitstop makes game unresponsive | Cap at ~0.08s for normal hits, ~0.12s for big boss slams |
| Particles not auto-freeing | Use `one_shot = true` and connect to a free timer |
| No accessibility options for shake/flash | Add toggle and intensity sliders in settings |
