# G37 — Scene Management, Transitions & Loading Screens

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#
> **Related:** [G34 Threading & Async](./G34_threading_and_async.md) · [G1 Scene Composition](./G1_scene_composition.md) · [G9 UI & Control Systems](./G9_ui_control_systems.md) · [G3 Signal Architecture](./G3_signal_architecture.md)

---

## What This Guide Covers

Every game needs to move between scenes — title screen to gameplay, level 1 to level 2, gameplay to pause menu. Godot offers several mechanisms for scene switching, from one-line convenience methods to fully asynchronous loading pipelines with progress bars and animated transitions. Getting this right means no freezes, no orphaned nodes, and smooth visual transitions that feel polished.

This guide covers the built-in scene-change APIs, the autoload-based scene manager pattern, async loading with `ResourceLoader`, transition animations with `ColorRect` / shaders, and additive scene loading for overlays and sub-levels.

---

## Table of Contents

1. [Scene Switching Fundamentals](#1-scene-switching-fundamentals)
2. [The SceneManager Autoload Pattern](#2-the-scenemanager-autoload-pattern)
3. [Async Loading with Progress](#3-async-loading-with-progress)
4. [Transition Animations](#4-transition-animations)
5. [Additive Scene Loading](#5-additive-scene-loading)
6. [Passing Data Between Scenes](#6-passing-data-between-scenes)
7. [Pattern: Full Loading Screen](#7-pattern-full-loading-screen)
8. [C# Equivalents](#8-c-equivalents)
9. [Common Mistakes](#9-common-mistakes)

---

## 1. Scene Switching Fundamentals

Godot provides two built-in methods on `SceneTree`:

```gdscript
# Simplest approach — loads and switches in one call.
# Freezes the game while loading. Fine for tiny scenes.
get_tree().change_scene_to_file("res://scenes/level_02.tscn")

# Switch to a pre-loaded PackedScene instance.
var next_scene: PackedScene = preload("res://scenes/level_02.tscn")
get_tree().change_scene_to_packed(next_scene)
```

**What happens internally:**
1. The current scene's `_exit_tree()` callbacks fire
2. The current scene is freed
3. The new scene is instantiated and added as the SceneTree's current scene
4. `_ready()` fires on all new nodes

> **Caution:** `change_scene_to_file()` blocks the main thread during loading. For anything larger than a UI screen, use async loading instead.

### preload vs load

```gdscript
# preload — resolved at parse time, embedded in the script resource.
# Use for small, always-needed scenes (UI overlays, particle effects).
const PauseMenu := preload("res://ui/pause_menu.tscn")

# load — resolved at runtime, on demand.
# Use when the path is dynamic or the resource is large.
var level_scene: PackedScene = load("res://levels/" + level_name + ".tscn")
```

---

## 2. The SceneManager Autoload Pattern

A dedicated autoload node centralizes scene switching, guarantees transitions play, and provides a clean API for the rest of your game.

### Setup

1. Create `scene_manager.gd` and attach it to a Node
2. Add a `CanvasLayer` child with a `ColorRect` (or `TextureRect`) for fading
3. Register as an autoload in **Project → Project Settings → Autoload**

### Implementation

```gdscript
# scene_manager.gd — Autoload
extends Node

signal scene_changed(scene_path: String)

@onready var transition_layer: CanvasLayer = $TransitionLayer
@onready var fade_rect: ColorRect = $TransitionLayer/FadeRect

var _target_scene_path: String = ""
var _is_transitioning: bool = false


func change_scene(scene_path: String, transition_duration: float = 0.5) -> void:
	if _is_transitioning:
		return  # Prevent double-transitions
	_is_transitioning = true
	_target_scene_path = scene_path
	
	# Phase 1: Fade out
	var tween := create_tween()
	tween.tween_property(fade_rect, "color:a", 1.0, transition_duration)
	await tween.finished
	
	# Phase 2: Switch scene
	get_tree().change_scene_to_file(scene_path)
	
	# Phase 3: Fade in (next frame, after new scene is ready)
	await get_tree().process_frame
	var tween_in := create_tween()
	tween_in.tween_property(fade_rect, "color:a", 0.0, transition_duration)
	await tween_in.finished
	
	_is_transitioning = false
	scene_changed.emit(scene_path)
```

### Usage from anywhere

```gdscript
# Any script in your game:
SceneManager.change_scene("res://scenes/level_02.tscn")

# With custom duration:
SceneManager.change_scene("res://scenes/boss_arena.tscn", 1.0)
```

> **Why autoload?** The autoload persists across scene changes, so the fade overlay remains visible during the switch. A node inside the departing scene would be freed mid-transition.

---

## 3. Async Loading with Progress

For scenes that take more than ~100ms to load (large levels, many sub-resources), use `ResourceLoader`'s threaded loading API.

### The Three-Step Pattern

```gdscript
# Step 1: Start the background load
ResourceLoader.load_threaded_request("res://levels/world_03.tscn", "", true)
# Args: path, type_hint, use_sub_threads (true = faster on multi-core)

# Step 2: Poll progress each frame
func _process(_delta: float) -> void:
	var progress: Array = []
	var status := ResourceLoader.load_threaded_get_status(
		"res://levels/world_03.tscn", progress
	)
	
	match status:
		ResourceLoader.THREAD_LOAD_IN_PROGRESS:
			# progress[0] is a float 0.0 → 1.0
			loading_bar.value = progress[0] * 100.0
		ResourceLoader.THREAD_LOAD_LOADED:
			_on_scene_loaded()
		ResourceLoader.THREAD_LOAD_FAILED:
			push_error("Failed to load scene!")

# Step 3: Retrieve the loaded resource
func _on_scene_loaded() -> void:
	var scene: PackedScene = ResourceLoader.load_threaded_get(
		"res://levels/world_03.tscn"
	)
	get_tree().change_scene_to_packed(scene)
```

### Important Rules

- **Never call `load_threaded_request()` twice** for the same path without retrieving or checking status first — it will error.
- **Check status before requesting** if multiple systems might trigger the same load:

```gdscript
var status := ResourceLoader.load_threaded_get_status(path)
if status == ResourceLoader.THREAD_LOAD_INVALID_RESOURCE:
	ResourceLoader.load_threaded_request(path)
```

- **Web exports** have limited threading support. On web, `use_sub_threads` may not work. Test your loading screen in web builds separately.

---

## 4. Transition Animations

### Simple Fade (ColorRect)

```gdscript
# FadeRect setup: ColorRect covering full viewport
# Color: Color(0, 0, 0, 0)  — starts transparent
# Mouse filter: MOUSE_FILTER_IGNORE — don't block input

func fade_to_black(duration: float = 0.5) -> Signal:
	var tween := create_tween()
	tween.tween_property(fade_rect, "color:a", 1.0, duration)
	return tween.finished

func fade_from_black(duration: float = 0.5) -> Signal:
	var tween := create_tween()
	tween.tween_property(fade_rect, "color:a", 0.0, duration)
	return tween.finished
```

### Shader-Based Transitions (Dissolve, Wipe, Circle)

For more sophisticated transitions, use a shader on a `TextureRect` with a gradient mask:

```gdscript
# transition_shader.gdshader
shader_type canvas_item;

uniform float progress : hint_range(0.0, 1.0) = 0.0;
uniform float edge_softness : hint_range(0.0, 0.5) = 0.1;
uniform sampler2D mask_texture;  // Gradient texture driving the pattern

void fragment() {
	float mask_value = texture(mask_texture, UV).r;
	float alpha = smoothstep(progress - edge_softness, progress + edge_softness, mask_value);
	COLOR = vec4(0.0, 0.0, 0.0, 1.0 - alpha);
}
```

```gdscript
# Drive it with a tween:
func dissolve_transition(duration: float = 0.8) -> void:
	var mat: ShaderMaterial = transition_rect.material
	mat.set_shader_parameter("progress", 0.0)
	var tween := create_tween()
	tween.tween_method(
		func(val: float): mat.set_shader_parameter("progress", val),
		0.0, 1.0, duration
	)
	await tween.finished
```

> **Tip:** Use different gradient textures (radial, horizontal, diamond, noise) with the same shader to get wildly different transition effects.

---

## 5. Additive Scene Loading

Not every scene change replaces the entire tree. Overlays (pause menus, dialogue boxes), HUDs, and sub-levels are **additive** — loaded on top of or alongside the current scene.

```gdscript
# Add an overlay scene without removing the current scene
func show_pause_menu() -> void:
	var pause_scene := preload("res://ui/pause_menu.tscn")
	var pause_instance := pause_scene.instantiate()
	# Add to a UI layer so it renders above gameplay
	get_tree().current_scene.add_child(pause_instance)
	get_tree().paused = true

# Remove overlay when done
func hide_pause_menu(menu_node: Node) -> void:
	get_tree().paused = false
	menu_node.queue_free()
```

### Sub-Level Streaming

For open-world games, load level chunks additively:

```gdscript
# Load a sub-level and parent it under a Marker3D
func load_chunk(chunk_path: String, anchor: Marker3D) -> void:
	ResourceLoader.load_threaded_request(chunk_path)
	# ... poll until loaded ...
	var chunk_scene: PackedScene = ResourceLoader.load_threaded_get(chunk_path)
	var chunk := chunk_scene.instantiate()
	anchor.add_child(chunk)

# Unload when the player moves away
func unload_chunk(chunk_node: Node) -> void:
	chunk_node.queue_free()
```

---

## 6. Passing Data Between Scenes

Scenes are independent by design. Here are the main approaches for sharing data across transitions:

### Autoload (Global State)

```gdscript
# game_state.gd — Autoload
extends Node

var current_level: int = 1
var player_health: float = 100.0
var inventory: Array[StringName] = []

# Access from any scene:
# GameState.current_level = 3
```

### Scene Metadata via meta

```gdscript
# Before switching:
var data := { "spawn_point": "entrance_b", "from_cutscene": true }
SceneManager.change_scene_with_data("res://levels/castle.tscn", data)

# In SceneManager:
var _pending_data: Dictionary = {}

func change_scene_with_data(path: String, data: Dictionary) -> void:
	_pending_data = data
	change_scene(path)

func get_pending_data() -> Dictionary:
	var data := _pending_data
	_pending_data = {}
	return data

# In the new scene's _ready():
func _ready() -> void:
	var data := SceneManager.get_pending_data()
	if data.has("spawn_point"):
		_move_player_to(data["spawn_point"])
```

### Typed Dictionaries (Godot 4.4+)

Godot 4.4 introduced typed dictionaries for better type safety:

```gdscript
# Declare typed dictionaries for scene transition data
var level_scores: Dictionary[String, int] = {}
var spawn_points: Dictionary[StringName, Vector3] = {}

# The type system catches incorrect key/value types at parse time
level_scores["castle"] = 2500  # ✓
level_scores[42] = 100         # ✗ Error: key must be String
```

---

## 7. Pattern: Full Loading Screen

Combining everything into a production-ready loading screen:

```gdscript
# loading_screen.gd — Instantiated by SceneManager
extends Control

@onready var progress_bar: ProgressBar = $ProgressBar
@onready var tip_label: Label = $TipLabel
@onready var animation_player: AnimationPlayer = $AnimationPlayer

var _target_path: String = ""

const TIPS: Array[String] = [
	"Hold jump for a higher leap!",
	"Talk to NPCs twice — they might say something new.",
	"Save often. Trust us.",
]


func start_loading(scene_path: String) -> void:
	_target_path = scene_path
	tip_label.text = TIPS.pick_random()
	
	# Start async load
	ResourceLoader.load_threaded_request(scene_path, "", true)
	
	# Play entrance animation
	animation_player.play("fade_in")
	await animation_player.animation_finished
	
	set_process(true)


func _process(_delta: float) -> void:
	var progress: Array = []
	var status := ResourceLoader.load_threaded_get_status(_target_path, progress)
	
	match status:
		ResourceLoader.THREAD_LOAD_IN_PROGRESS:
			# Smooth the progress bar to avoid jarring jumps
			progress_bar.value = lerpf(progress_bar.value, progress[0] * 100.0, 0.1)
		
		ResourceLoader.THREAD_LOAD_LOADED:
			set_process(false)
			progress_bar.value = 100.0
			_finish_loading()
		
		ResourceLoader.THREAD_LOAD_FAILED:
			set_process(false)
			push_error("Load failed: %s" % _target_path)


func _finish_loading() -> void:
	# Small delay so the player can read the tip
	await get_tree().create_timer(0.5).timeout
	
	# Play exit animation
	animation_player.play("fade_out")
	await animation_player.animation_finished
	
	# Switch to loaded scene
	var scene: PackedScene = ResourceLoader.load_threaded_get(_target_path)
	get_tree().change_scene_to_packed(scene)
	
	# Self-destruct (we're an autoload child, not the scene itself)
	queue_free()
```

### Integrating with SceneManager

```gdscript
# In scene_manager.gd:
const LoadingScreen := preload("res://ui/loading_screen.tscn")

func change_scene_async(scene_path: String) -> void:
	if _is_transitioning:
		return
	_is_transitioning = true
	
	var loader := LoadingScreen.instantiate()
	add_child(loader)  # Autoload child persists across scene change
	loader.start_loading(scene_path)
	
	await scene_changed  # Emitted when loading_screen finishes
	_is_transitioning = false
```

---

## 8. C# Equivalents

```csharp
using Godot;

public partial class SceneManager : Node
{
    [Signal]
    public delegate void SceneChangedEventHandler(string scenePath);

    private ColorRect _fadeRect;
    private bool _isTransitioning;

    public override void _Ready()
    {
        _fadeRect = GetNode<ColorRect>("TransitionLayer/FadeRect");
    }

    public async void ChangeScene(string scenePath, float duration = 0.5f)
    {
        if (_isTransitioning) return;
        _isTransitioning = true;

        // Fade out
        var tween = CreateTween();
        tween.TweenProperty(_fadeRect, "color:a", 1.0f, duration);
        await ToSignal(tween, Tween.SignalName.Finished);

        // Switch
        GetTree().ChangeSceneToFile(scenePath);
        await ToSignal(GetTree(), SceneTree.SignalName.ProcessFrame);

        // Fade in
        var tweenIn = CreateTween();
        tweenIn.TweenProperty(_fadeRect, "color:a", 0.0f, duration);
        await ToSignal(tweenIn, Tween.SignalName.Finished);

        _isTransitioning = false;
        EmitSignal(SignalName.SceneChanged, scenePath);
    }
}
```

### Async Loading in C#

```csharp
public override void _Process(double delta)
{
    var progress = new Godot.Collections.Array();
    var status = ResourceLoader.LoadThreadedGetStatus(_targetPath, progress);
    
    switch (status)
    {
        case ResourceLoader.ThreadLoadStatus.InProgress:
            _progressBar.Value = (float)progress[0] * 100f;
            break;
        case ResourceLoader.ThreadLoadStatus.Loaded:
            SetProcess(false);
            OnSceneLoaded();
            break;
        case ResourceLoader.ThreadLoadStatus.Failed:
            SetProcess(false);
            GD.PushError($"Failed to load: {_targetPath}");
            break;
    }
}
```

---

## 9. Common Mistakes

| Mistake | Fix |
|---------|-----|
| Transition node is inside the departing scene | Put transitions in an **autoload** so they survive scene changes |
| Calling `change_scene_to_file()` for large levels | Use `ResourceLoader.load_threaded_request()` + loading screen |
| Not awaiting `process_frame` after scene switch | The new scene isn't ready until the next frame — await before fade-in |
| Forgetting to set `mouse_filter = IGNORE` on fade rect | The invisible overlay eats all clicks after fading out |
| Double-triggering scene changes | Guard with an `_is_transitioning` flag |
| Using `preload()` for heavy scenes | `preload` embeds the resource in the script — use `load()` or async for large assets |
| Not testing web export loading | `use_sub_threads` may not work in WASM builds — always test |
| Orphaned nodes after additive loading | Track added nodes and `queue_free()` them during cleanup |
