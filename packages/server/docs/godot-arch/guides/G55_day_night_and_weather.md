# G55 — Day/Night Cycles & Weather Systems

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#
> **Related:** [G12 Shaders & Visual Effects](./G12_shaders_and_visual_effects.md) · [G15 Particle Systems](./G15_particle_systems.md) · [G10 Audio Systems](./G10_audio_systems.md) · [G40 2D Lighting & Shadows](./G40_2D_lighting_and_shadows.md) · [G53 Data-Driven Design](./G53_data_driven_design.md)

---

## What This Guide Covers

Dynamic time-of-day and weather bring game worlds to life. A day/night cycle drives sun rotation, sky color, ambient lighting, and NPC schedules. A weather system layers precipitation, fog, wind, and post-processing on top. Both rely on the same core pattern: a **time manager** that ticks forward and broadcasts state changes to visual and gameplay systems.

This guide covers building a TimeManager AutoLoad, rotating a DirectionalLight3D sun with ProceduralSkyMaterial, 2D day/night with CanvasModulate, weather state machines with weighted transitions, particle-based rain/snow, volumetric fog integration, audio-reactive weather (thunder, wind ambience), and data-driven configuration so designers can tune without code.

**Use this guide when:** your game has an outdoor environment that changes over time — survival games, RPGs, farming sims, open-world adventures, or any project where the world should feel alive.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [TimeManager AutoLoad](#2-timemanager-autoload)
3. [3D Day/Night — Sun, Sky, and Ambient Light](#3-3d-daynight--sun-sky-and-ambient-light)
4. [2D Day/Night — CanvasModulate and Lighting](#4-2d-daynight--canvasmodulate-and-lighting)
5. [Weather State Machine](#5-weather-state-machine)
6. [Rain and Snow with GPUParticles3D](#6-rain-and-snow-with-gpuparticles3d)
7. [Volumetric Fog and Mist](#7-volumetric-fog-and-mist)
8. [Audio Integration](#8-audio-integration)
9. [Gameplay Hooks](#9-gameplay-hooks)
10. [Data-Driven Configuration](#10-data-driven-configuration)
11. [C# Examples](#11-c-examples)
12. [Performance Considerations](#12-performance-considerations)

---

## 1. Architecture Overview

```
TimeManager (AutoLoad)
├── Tracks in-game time (hours, minutes, day count)
├── Emits: time_tick(hour, minute), period_changed(period)
│
├──▶ DayNightController (per-scene)
│     ├── Rotates DirectionalLight3D (sun/moon)
│     ├── Interpolates ProceduralSkyMaterial colors
│     └── Adjusts Environment (ambient light, energy, fog)
│
├──▶ WeatherManager (AutoLoad or per-scene)
│     ├── State machine: Clear → Cloudy → Rain → Storm → ...
│     ├── Weighted random transitions
│     └── Emits: weather_changed(old, new)
│
└──▶ Gameplay listeners
      ├── NPC schedules
      ├── Crop growth
      └── Enemy spawn modifiers
```

The TimeManager is the single source of truth for in-game time. Other systems subscribe to its signals — they never track their own clocks.

---

## 2. TimeManager AutoLoad

```gdscript
## autoload: TimeManager
extends Node

## Signals
signal time_tick(hour: int, minute: int)
signal hour_changed(hour: int)
signal period_changed(period: StringName)

## Time scale: how many in-game seconds pass per real second
@export var time_scale: float = 60.0  # 1 real second = 1 in-game minute
@export var start_hour: int = 6
@export var start_minute: int = 0

## Current state
var day: int = 1
var hour: int = 6
var minute: int = 0
var total_minutes: int = 0

## Internal accumulator
var _elapsed: float = 0.0
var _current_period: StringName = &"dawn"

## Time periods — boundaries in hours
const PERIODS: Dictionary[StringName, Vector2i] = {
	&"dawn":      Vector2i(5, 7),
	&"morning":   Vector2i(7, 12),
	&"afternoon": Vector2i(12, 17),
	&"dusk":      Vector2i(17, 19),
	&"evening":   Vector2i(19, 22),
	&"night":     Vector2i(22, 5),   # wraps past midnight
}

var paused: bool = false


func _ready() -> void:
	hour = start_hour
	minute = start_minute
	total_minutes = hour * 60 + minute
	_current_period = _calc_period()


func _process(delta: float) -> void:
	if paused:
		return

	_elapsed += delta * time_scale
	while _elapsed >= 1.0:
		_elapsed -= 1.0
		_advance_minute()


func _advance_minute() -> void:
	minute += 1
	total_minutes += 1

	if minute >= 60:
		minute = 0
		hour += 1
		if hour >= 24:
			hour = 0
			day += 1
		hour_changed.emit(hour)

	time_tick.emit(hour, minute)

	var new_period := _calc_period()
	if new_period != _current_period:
		_current_period = new_period
		period_changed.emit(_current_period)


func _calc_period() -> StringName:
	for period_name: StringName in PERIODS:
		var bounds: Vector2i = PERIODS[period_name]
		if bounds.x < bounds.y:
			# Normal range (e.g., 7–12)
			if hour >= bounds.x and hour < bounds.y:
				return period_name
		else:
			# Wrapping range (e.g., 22–5)
			if hour >= bounds.x or hour < bounds.y:
				return period_name
	return &"day"


## Normalized time: 0.0 = midnight, 0.5 = noon, 1.0 = next midnight
func get_normalized_time() -> float:
	return float(total_minutes % 1440) / 1440.0


func get_period() -> StringName:
	return _current_period
```

### Why an AutoLoad?

Time must persist across scene transitions. A player entering a building and coming back out should not reset the clock. AutoLoads survive `SceneTree.change_scene_to_packed()`.

---

## 3. 3D Day/Night — Sun, Sky, and Ambient Light

### Scene Setup

```
WorldEnvironment
├── Environment resource
│   ├── Background: Sky
│   ├── Sky → ProceduralSkyMaterial
│   ├── Ambient Light: Sky color, energy curve
│   └── Volumetric Fog (optional)
│
DirectionalLight3D ("Sun")
├── Light energy: driven by time
├── Light color: driven by time
└── Shadow enabled
│
DirectionalLight3D ("Moon") [optional]
├── Low energy, blue-white
└── Rotates opposite to sun
```

`ProceduralSkyMaterial` automatically reads the direction, energy, and color from up to 4 `DirectionalLight3D` nodes in the scene. Rotating the sun node rotates the sky's sun disk.

### DayNightController Script

```gdscript
class_name DayNightController
extends Node

@export var sun: DirectionalLight3D
@export var moon: DirectionalLight3D
@export var world_env: WorldEnvironment

## Sun energy curve: X = normalized time (0–1), Y = energy
@export var sun_energy_curve: Curve
## Sun color gradient: left = midnight, right = next midnight
@export var sun_color_gradient: Gradient
## Ambient energy curve
@export var ambient_energy_curve: Curve

## Sun rotation: full 360° over one day around X axis
const SUN_AXIS := Vector3.RIGHT


func _ready() -> void:
	TimeManager.time_tick.connect(_on_time_tick)
	_on_time_tick(TimeManager.hour, TimeManager.minute)


func _on_time_tick(_hour: int, _minute: int) -> void:
	var t := TimeManager.get_normalized_time()

	# --- Sun rotation ---
	# t=0 → midnight (sun below horizon), t=0.25 → sunrise, t=0.5 → noon
	var sun_angle := t * 360.0 - 90.0  # -90 at midnight, 0 at 6am, 90 at noon
	sun.rotation_degrees.x = sun_angle

	# --- Sun energy and color ---
	if sun_energy_curve:
		sun.light_energy = sun_energy_curve.sample(t)
	if sun_color_gradient:
		sun.light_color = sun_color_gradient.sample(t)

	# --- Moon (opposite rotation) ---
	if moon:
		moon.rotation_degrees.x = sun_angle + 180.0
		# Moon visible only at night
		moon.light_energy = clampf(1.0 - sun_energy_curve.sample(t), 0.0, 0.3) if sun_energy_curve else 0.0

	# --- Ambient light ---
	if ambient_energy_curve and world_env:
		world_env.environment.ambient_light_energy = ambient_energy_curve.sample(t)
```

### Recommended Curve Values

| Time (normalized) | Sun Energy | Ambient Energy | Description |
|---|---|---|---|
| 0.0 (midnight) | 0.0 | 0.05 | Dark, moonlit |
| 0.2 (≈5 AM) | 0.0 | 0.1 | Pre-dawn |
| 0.25 (6 AM) | 0.3 | 0.3 | Sunrise |
| 0.35 (≈8 AM) | 0.8 | 0.6 | Morning |
| 0.5 (noon) | 1.0 | 0.8 | Full daylight |
| 0.75 (6 PM) | 0.3 | 0.3 | Sunset |
| 0.85 (≈8 PM) | 0.0 | 0.1 | Dusk |

---

## 4. 2D Day/Night — CanvasModulate and Lighting

For 2D games, use a `CanvasModulate` node to tint the entire scene, and `PointLight2D` / `DirectionalLight2D` for local light sources.

```gdscript
class_name DayNight2D
extends CanvasModulate

@export var color_gradient: Gradient  ## Left=midnight, Right=next midnight

func _ready() -> void:
	TimeManager.time_tick.connect(_on_time_tick)
	_on_time_tick(TimeManager.hour, TimeManager.minute)


func _on_time_tick(_hour: int, _minute: int) -> void:
	var t := TimeManager.get_normalized_time()
	color = color_gradient.sample(t)
```

### Recommended 2D Gradient

| Position | Color | Description |
|---|---|---|
| 0.0 | `#1a1a3e` | Deep night blue |
| 0.2 | `#2e2e5e` | Late night |
| 0.25 | `#ff8855` | Sunrise orange tint |
| 0.35 | `#ffffff` | Full daylight (no tint) |
| 0.5 | `#ffffff` | Noon |
| 0.7 | `#ffffff` | Afternoon |
| 0.75 | `#ff7744` | Sunset |
| 0.85 | `#3a2a5e` | Dusk |
| 1.0 | `#1a1a3e` | Midnight again |

Combine with `Light2D` nodes on torches, windows, and lamps that increase energy during night periods for atmospheric depth.

---

## 5. Weather State Machine

```gdscript
## autoload: WeatherManager (or per-scene node)
class_name WeatherManager
extends Node

signal weather_changed(old_weather: StringName, new_weather: StringName)
signal weather_intensity_changed(intensity: float)

## Weather type definitions as Resources for data-driven design
@export var weather_table: Array[WeatherConfig] = []
@export var transition_duration: float = 10.0  ## Seconds to blend between weather states
@export var min_weather_duration: float = 120.0  ## Min in-game seconds before change
@export var max_weather_duration: float = 600.0

var current_weather: StringName = &"clear"
var current_intensity: float = 0.0
var _target_intensity: float = 0.0
var _timer: float = 0.0
var _next_change: float = 0.0


func _ready() -> void:
	_schedule_next_change()
	TimeManager.hour_changed.connect(_on_hour_changed)


func _process(delta: float) -> void:
	# Blend intensity
	current_intensity = move_toward(current_intensity, _target_intensity, delta / transition_duration)

	# Timer for weather transitions
	_timer += delta * TimeManager.time_scale
	if _timer >= _next_change:
		_transition_weather()


func _transition_weather() -> void:
	var old := current_weather
	current_weather = _pick_weighted_weather()
	_target_intensity = randf_range(0.3, 1.0)
	_schedule_next_change()

	if old != current_weather:
		weather_changed.emit(old, current_weather)


func _pick_weighted_weather() -> StringName:
	## Sum all weights, pick randomly
	var total_weight: float = 0.0
	for config: WeatherConfig in weather_table:
		total_weight += config.weight

	var roll: float = randf() * total_weight
	var running: float = 0.0
	for config: WeatherConfig in weather_table:
		running += config.weight
		if roll <= running:
			return config.weather_name
	return &"clear"


func _schedule_next_change() -> void:
	_timer = 0.0
	_next_change = randf_range(min_weather_duration, max_weather_duration)


func _on_hour_changed(hour: int) -> void:
	# Optional: bias weather by time of day
	# e.g., fog more likely at dawn, storms more likely afternoon
	pass


func force_weather(weather_name: StringName, intensity: float = 1.0) -> void:
	var old := current_weather
	current_weather = weather_name
	_target_intensity = intensity
	_schedule_next_change()
	weather_changed.emit(old, current_weather)
```

### WeatherConfig Resource

```gdscript
class_name WeatherConfig
extends Resource

@export var weather_name: StringName = &"clear"
@export var weight: float = 1.0  ## Relative probability
@export var particle_scene: PackedScene  ## Rain, snow, etc.
@export var fog_density: float = 0.0
@export var fog_color: Color = Color.WHITE
@export var ambient_energy_modifier: float = 1.0  ## Multiply base ambient
@export var wind_strength: float = 0.0
@export var audio_stream: AudioStream  ## Ambient loop
@export var sky_cover: float = 0.0  ## 0 = clear, 1 = overcast
```

---

## 6. Rain and Snow with GPUParticles3D

Attach precipitation particles to the camera so they always fall around the player.

```gdscript
class_name PrecipitationController
extends GPUParticles3D

@export var follow_camera: bool = true


func _process(_delta: float) -> void:
	if follow_camera:
		var cam := get_viewport().get_camera_3d()
		if cam:
			global_position = cam.global_position + Vector3(0, 10, 0)
```

### Rain ParticleProcessMaterial Settings

| Property | Value | Notes |
|---|---|---|
| Direction | `(0, -1, 0)` | Straight down |
| Spread | `5°` | Slight variation |
| Initial Velocity Min/Max | `15 / 20` | Fast fall |
| Gravity | `(0, -9.8, 0)` | Natural acceleration |
| Emission Shape | Box | `30×0×30` meters around camera |
| Amount | `2000–5000` | Scale with intensity |
| Lifetime | `1.5` s | Short-lived drops |
| Scale Min/Max | `0.02 / 0.05` | Thin streaks |
| Draw Pass | QuadMesh | Billboard, stretched by velocity |

### Snow — Differences from Rain

| Property | Value |
|---|---|
| Initial Velocity Min/Max | `1 / 3` |
| Gravity | `(0, -1.5, 0)` |
| Spread | `45°` |
| Lifetime | `6` s |
| Turbulence Enabled | `true` |
| Turbulence Noise Strength | `2.0` |
| Amount | `500–1500` |
| Scale Min/Max | `0.03 / 0.08` |

### 2D Rain (GPUParticles2D)

For 2D games, parent a `GPUParticles2D` node to the camera with emission shape covering the viewport width. Use a small streak texture and high speed downward. Add a second particle system for splash impacts on the ground using a SubViewport collision mask or manual Y-threshold.

---

## 7. Volumetric Fog and Mist

Godot 4's volumetric fog integrates with the `Environment` resource and `FogVolume` nodes.

```gdscript
## Called by WeatherManager when weather changes
func apply_fog(env: Environment, config: WeatherConfig, intensity: float) -> void:
	env.volumetric_fog_enabled = config.fog_density > 0.0
	env.volumetric_fog_density = config.fog_density * intensity
	env.volumetric_fog_albedo = config.fog_color
	env.volumetric_fog_emission = config.fog_color * 0.1
	# Increase fog length for heavy fog
	env.volumetric_fog_length = lerpf(50.0, 200.0, intensity)
```

For localized fog (swamp mist, valley fog), place `FogVolume` nodes with a `FogMaterial`:

```gdscript
var fog_vol := FogVolume.new()
fog_vol.size = Vector3(50, 10, 50)
fog_vol.material = FogMaterial.new()
fog_vol.material.density = 0.5
fog_vol.material.albedo = Color(0.8, 0.85, 0.9)
add_child(fog_vol)
```

---

## 8. Audio Integration

Layer ambient audio to match weather and time of day.

```gdscript
class_name WeatherAudio
extends Node

@export var rain_player: AudioStreamPlayer
@export var wind_player: AudioStreamPlayer
@export var thunder_player: AudioStreamPlayer
@export var night_ambience: AudioStreamPlayer

var _rain_target_db: float = -80.0
var _wind_target_db: float = -80.0


func _ready() -> void:
	WeatherManager.weather_changed.connect(_on_weather_changed)
	TimeManager.period_changed.connect(_on_period_changed)


func _process(delta: float) -> void:
	rain_player.volume_db = move_toward(rain_player.volume_db, _rain_target_db, delta * 20.0)
	wind_player.volume_db = move_toward(wind_player.volume_db, _wind_target_db, delta * 20.0)


func _on_weather_changed(_old: StringName, new: StringName) -> void:
	match new:
		&"rain", &"storm":
			_rain_target_db = linear_to_db(WeatherManager.current_intensity)
			_wind_target_db = linear_to_db(WeatherManager.current_intensity * 0.5)
			if new == &"storm":
				_schedule_thunder()
		&"snow":
			_rain_target_db = -80.0
			_wind_target_db = linear_to_db(0.3)
		_:
			_rain_target_db = -80.0
			_wind_target_db = -80.0


func _on_period_changed(period: StringName) -> void:
	match period:
		&"night", &"evening":
			night_ambience.volume_db = -10.0
			if not night_ambience.playing:
				night_ambience.play()
		_:
			night_ambience.volume_db = -80.0


func _schedule_thunder() -> void:
	await get_tree().create_timer(randf_range(5.0, 30.0)).timeout
	if WeatherManager.current_weather == &"storm":
		thunder_player.play()
		_schedule_thunder()  # Repeat while storm persists
```

---

## 9. Gameplay Hooks

Weather and time should affect gameplay, not just visuals.

```gdscript
## Example: crop growth speed modifier
func get_growth_modifier() -> float:
	var modifier := 1.0
	match TimeManager.get_period():
		&"night":
			modifier *= 0.5  # Slower at night
	match WeatherManager.current_weather:
		&"rain":
			modifier *= 1.5  # Rain helps crops
		&"storm":
			modifier *= 0.0  # Storms pause growth
	return modifier

## Example: enemy spawn table modifiers
func get_spawn_weight_modifier(enemy_type: StringName) -> float:
	if TimeManager.get_period() in [&"night", &"evening"]:
		if enemy_type == &"undead":
			return 3.0  # Undead more common at night
	if WeatherManager.current_weather == &"storm":
		if enemy_type == &"flying":
			return 0.0  # No flying enemies in storms
	return 1.0
```

---

## 10. Data-Driven Configuration

Store time-of-day presets and weather tables as Resources for designer iteration:

```gdscript
class_name DayNightPreset
extends Resource

@export var name: StringName
@export var sun_energy_curve: Curve
@export var sun_color_gradient: Gradient
@export var ambient_energy_curve: Curve
@export var ambient_color_gradient: Gradient
@export var fog_base_density: float = 0.0

## Different biomes can have different lighting
## desert_preset.tres, forest_preset.tres, arctic_preset.tres
```

Load per-biome presets on area entry:

```gdscript
func _on_biome_entered(biome: BiomeArea) -> void:
	day_night_controller.apply_preset(biome.day_night_preset)
```

---

## 11. C# Examples

### TimeManager (C#)

```csharp
using Godot;

public partial class TimeManager : Node
{
    [Signal] public delegate void TimeTickEventHandler(int hour, int minute);
    [Signal] public delegate void PeriodChangedEventHandler(StringName period);

    [Export] public float TimeScale { get; set; } = 60.0f;
    [Export] public int StartHour { get; set; } = 6;

    public int Day { get; private set; } = 1;
    public int Hour { get; private set; }
    public int Minute { get; private set; }
    public int TotalMinutes { get; private set; }

    private float _elapsed;
    private StringName _currentPeriod = "dawn";

    public override void _Ready()
    {
        Hour = StartHour;
        TotalMinutes = Hour * 60;
    }

    public override void _Process(double delta)
    {
        _elapsed += (float)delta * TimeScale;
        while (_elapsed >= 1.0f)
        {
            _elapsed -= 1.0f;
            AdvanceMinute();
        }
    }

    private void AdvanceMinute()
    {
        Minute++;
        TotalMinutes++;
        if (Minute >= 60)
        {
            Minute = 0;
            Hour++;
            if (Hour >= 24)
            {
                Hour = 0;
                Day++;
            }
        }
        EmitSignal(SignalName.TimeTick, Hour, Minute);
    }

    public float GetNormalizedTime() => (TotalMinutes % 1440) / 1440.0f;
}
```

---

## 12. Performance Considerations

**Particle count scaling.** On lower-end hardware, reduce precipitation particle amount proportionally. Use a quality setting that multiplies the base amount:

```gdscript
rain_particles.amount = int(base_amount * Settings.particle_quality)  # 0.25, 0.5, 1.0
```

**Volumetric fog cost.** Volumetric fog is expensive on integrated GPUs. Provide a toggle or fall back to `Environment.fog_enabled` (non-volumetric, much cheaper) on low settings.

**Curve/gradient sampling.** `Curve.sample()` and `Gradient.sample()` are fast (O(n) on control point count), but avoid calling them every `_process` frame for many objects. Cache the result in `_on_time_tick` and share via a property.

**Directional shadow updates.** Moving the sun every frame forces shadow map recalculation. If shadow quality is a concern, update sun rotation only when the minute changes (via signal), not every frame.

---

## Common Pitfalls

| Pitfall | Fix |
|---|---|
| Sun "pops" at horizon | Use Curve for energy; ease in/out near 0 instead of linear |
| Sky goes black at night | Keep `ProceduralSkyMaterial.sky_top_color` at a dim blue, never pure black |
| Weather changes feel jarring | Always tween intensity over `transition_duration` seconds |
| Rain visible indoors | Disable precipitation particles or set visibility layers when entering interiors |
| Time breaks during pause | Set `TimeManager.paused = true` when `get_tree().paused` is set |
| Multiplayer time desync | Run TimeManager on server only; replicate `total_minutes` to clients |
