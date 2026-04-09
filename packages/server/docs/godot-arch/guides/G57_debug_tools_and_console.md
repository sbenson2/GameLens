# G57 — Debug Tools & In-Game Console

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#
> **Related:** [G18 Performance Profiling](./G18_performance_profiling.md) · [G29 Testing & Quality Assurance](./G29_testing_and_quality_assurance.md) · [G35 Editor Tool Scripts](./G35_editor_tool_scripts.md) · [G9 UI Control Systems](./G9_ui_control_systems.md) · [G45 Advanced GDScript Patterns](./G45_advanced_gdscript_patterns.md)

---

## What This Guide Covers

Good debug tools save hours of development time. An in-game console lets you teleport, spawn items, toggle god mode, and inspect state without restarting. A debug overlay shows FPS, memory, entity counts, and physics stats at a glance. Together, they turn guesswork into immediate feedback.

This guide covers building a developer console with command registration, argument parsing, and autocomplete; a debug overlay HUD for real-time stats; cheat commands and feature flags; a debug draw system for visualizing collision shapes, paths, and raycasts; conditional compilation so debug tools are stripped from release builds; and integration with Godot's built-in performance monitors.

**Use this guide when:** you want to speed up your development workflow with runtime inspection and manipulation tools. Every project benefits from debug tooling — build it early, use it often.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Developer Console — Core](#2-developer-console--core)
3. [Command Registration](#3-command-registration)
4. [Argument Parsing and Validation](#4-argument-parsing-and-validation)
5. [Autocomplete](#5-autocomplete)
6. [Built-in Commands](#6-built-in-commands)
7. [Debug Overlay HUD](#7-debug-overlay-hud)
8. [Debug Draw System](#8-debug-draw-system)
9. [Feature Flags and Cheat Protection](#9-feature-flags-and-cheat-protection)
10. [Stripping Debug Tools from Release Builds](#10-stripping-debug-tools-from-release-builds)
11. [C# Examples](#11-c-examples)

---

## 1. Architecture Overview

```
DebugManager (AutoLoad)
├── DevConsole (CanvasLayer UI)
│   ├── Command input (LineEdit)
│   ├── Output log (RichTextLabel)
│   └── Autocomplete popup
│
├── DebugOverlay (CanvasLayer UI)
│   ├── FPS, frame time, memory
│   ├── Custom stat providers
│   └── Toggle with hotkey
│
├── DebugDraw (Node3D / Node2D)
│   ├── Draw shapes, lines, labels in world space
│   └── Auto-expire after duration
│
└── Command Registry
    ├── Dictionary of registered commands
    ├── Argument type validation
    └── Help text generation
```

All debug systems live under a single AutoLoad. The console and overlay are `CanvasLayer` nodes so they render above gameplay UI.

---

## 2. Developer Console — Core

```gdscript
## autoload: DebugManager
extends Node

var _console_ui: DevConsoleUI
var _overlay_ui: DebugOverlayUI
var _commands: Dictionary[StringName, DebugCommand] = {}
var _history: Array[String] = []
var _history_index: int = -1

const CONSOLE_TOGGLE_ACTION := &"debug_console"
const OVERLAY_TOGGLE_ACTION := &"debug_overlay"


func _ready() -> void:
	if not OS.is_debug_build():
		queue_free()
		return

	_setup_input_actions()
	_setup_console_ui()
	_setup_overlay_ui()
	_register_builtin_commands()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed(CONSOLE_TOGGLE_ACTION):
		_console_ui.toggle()
		get_viewport().set_input_as_handled()
	elif event.is_action_pressed(OVERLAY_TOGGLE_ACTION):
		_overlay_ui.toggle()
		get_viewport().set_input_as_handled()


func _setup_input_actions() -> void:
	# Register debug hotkeys if they don't exist in InputMap
	if not InputMap.has_action(CONSOLE_TOGGLE_ACTION):
		InputMap.add_action(CONSOLE_TOGGLE_ACTION)
		var ev := InputEventKey.new()
		ev.keycode = KEY_QUOTELEFT  # Backtick / tilde key
		InputMap.action_add_event(CONSOLE_TOGGLE_ACTION, ev)

	if not InputMap.has_action(OVERLAY_TOGGLE_ACTION):
		InputMap.add_action(OVERLAY_TOGGLE_ACTION)
		var ev := InputEventKey.new()
		ev.keycode = KEY_F3
		InputMap.action_add_event(OVERLAY_TOGGLE_ACTION, ev)


func _setup_console_ui() -> void:
	_console_ui = DevConsoleUI.new()
	_console_ui.command_submitted.connect(_execute_command)
	add_child(_console_ui)


func _setup_overlay_ui() -> void:
	_overlay_ui = DebugOverlayUI.new()
	add_child(_overlay_ui)
```

---

## 3. Command Registration

Commands are modular — any system can register its own debug commands.

```gdscript
class_name DebugCommand
extends RefCounted

var name: StringName
var description: String
var args: Array[DebugArg] = []
var callback: Callable

## For help text
func get_usage() -> String:
	var arg_str := ""
	for arg: DebugArg in args:
		if arg.required:
			arg_str += " <%s>" % arg.name
		else:
			arg_str += " [%s]" % arg.name
	return "%s%s — %s" % [name, arg_str, description]


class DebugArg:
	var name: String
	var type: Variant.Type  ## TYPE_STRING, TYPE_INT, TYPE_FLOAT, TYPE_BOOL
	var required: bool
	var default_value: Variant

	func _init(p_name: String, p_type: Variant.Type, p_required: bool = true, p_default: Variant = null) -> void:
		name = p_name
		type = p_type
		required = p_required
		default_value = p_default
```

### Registration API

```gdscript
## In DebugManager:

func register_command(
	cmd_name: StringName,
	callback: Callable,
	desc: String = "",
	args: Array[DebugCommand.DebugArg] = []
) -> void:
	var cmd := DebugCommand.new()
	cmd.name = cmd_name
	cmd.description = desc
	cmd.args = args
	cmd.callback = callback
	_commands[cmd_name] = cmd


func unregister_command(cmd_name: StringName) -> void:
	_commands.erase(cmd_name)


## Any system can register commands:
## DebugManager.register_command(&"god", _toggle_god_mode, "Toggle god mode")
## DebugManager.register_command(&"give", _give_item, "Give item to player", [
##     DebugCommand.DebugArg.new("item_id", TYPE_STRING),
##     DebugCommand.DebugArg.new("quantity", TYPE_INT, false, 1),
## ])
```

---

## 4. Argument Parsing and Validation

```gdscript
## In DebugManager:

func _execute_command(input: String) -> void:
	_history.append(input)
	_history_index = _history.size()

	var parts := input.strip_edges().split(" ", false)
	if parts.is_empty():
		return

	var cmd_name := StringName(parts[0])
	var raw_args := parts.slice(1)

	if not _commands.has(cmd_name):
		_console_ui.print_line("[color=red]Unknown command: %s[/color]" % cmd_name)
		_suggest_similar(cmd_name)
		return

	var cmd: DebugCommand = _commands[cmd_name]

	# Validate and convert arguments
	var parsed_args: Array[Variant] = []
	for i: int in cmd.args.size():
		var arg_def: DebugCommand.DebugArg = cmd.args[i]
		if i < raw_args.size():
			var converted := _convert_arg(raw_args[i], arg_def.type)
			if converted == null and arg_def.required:
				_console_ui.print_line("[color=red]Invalid %s for '%s': %s[/color]" % [
					_type_name(arg_def.type), arg_def.name, raw_args[i]])
				return
			parsed_args.append(converted)
		elif arg_def.required:
			_console_ui.print_line("[color=red]Missing required argument: %s[/color]" % arg_def.name)
			_console_ui.print_line("Usage: %s" % cmd.get_usage())
			return
		else:
			parsed_args.append(arg_def.default_value)

	# Execute
	var result: Variant = cmd.callback.callv(parsed_args)
	if result is String and result != "":
		_console_ui.print_line(str(result))


func _convert_arg(raw: String, type: Variant.Type) -> Variant:
	match type:
		TYPE_STRING:
			return raw
		TYPE_INT:
			return raw.to_int() if raw.is_valid_int() else null
		TYPE_FLOAT:
			return raw.to_float() if raw.is_valid_float() else null
		TYPE_BOOL:
			return raw.to_lower() in ["true", "1", "yes", "on"]
		_:
			return raw


func _type_name(type: Variant.Type) -> String:
	match type:
		TYPE_STRING: return "string"
		TYPE_INT: return "int"
		TYPE_FLOAT: return "float"
		TYPE_BOOL: return "bool"
		_: return "value"


func _suggest_similar(cmd_name: StringName) -> void:
	var suggestions: Array[StringName] = []
	var input_str := String(cmd_name).to_lower()
	for known: StringName in _commands:
		if String(known).to_lower().begins_with(input_str.left(3)):
			suggestions.append(known)
	if not suggestions.is_empty():
		_console_ui.print_line("[color=yellow]Did you mean: %s[/color]" % ", ".join(
			suggestions.map(func(s: StringName) -> String: return String(s))
		))
```

---

## 5. Autocomplete

```gdscript
## In DevConsoleUI:

func _on_input_text_changed(new_text: String) -> void:
	if new_text.is_empty():
		_hide_autocomplete()
		return

	var parts := new_text.split(" ", false)
	var prefix := parts[0].to_lower() if not parts.is_empty() else ""

	# Autocomplete command names
	var matches: Array[String] = []
	for cmd_name: StringName in DebugManager._commands:
		if String(cmd_name).to_lower().begins_with(prefix):
			matches.append(String(cmd_name))

	if matches.size() == 1 and matches[0] == prefix:
		_hide_autocomplete()
	elif not matches.is_empty():
		_show_autocomplete(matches)
	else:
		_hide_autocomplete()


func _on_input_tab_pressed() -> void:
	## Complete to the longest common prefix
	if _autocomplete_options.is_empty():
		return
	var common := _autocomplete_options[0]
	for option: String in _autocomplete_options:
		while not option.begins_with(common):
			common = common.left(common.length() - 1)
	_input.text = common + " "
	_input.caret_column = _input.text.length()
```

---

## 6. Built-in Commands

Register these in `_register_builtin_commands()`:

```gdscript
func _register_builtin_commands() -> void:
	register_command(&"help", _cmd_help, "List all commands or show help for a command", [
		DebugCommand.DebugArg.new("command", TYPE_STRING, false, ""),
	])
	register_command(&"clear", func() -> String: _console_ui.clear(); return "", "Clear console output")
	register_command(&"fps", func() -> String: return "FPS: %d" % Engine.get_frames_per_second(), "Show current FPS")
	register_command(&"timescale", _cmd_timescale, "Set engine time scale", [
		DebugCommand.DebugArg.new("scale", TYPE_FLOAT),
	])
	register_command(&"pause", func() -> String:
		get_tree().paused = not get_tree().paused
		return "Paused: %s" % get_tree().paused, "Toggle pause")
	register_command(&"quit", func() -> String: get_tree().quit(); return "", "Quit the game")
	register_command(&"scene", _cmd_scene, "Change to a scene by path", [
		DebugCommand.DebugArg.new("path", TYPE_STRING),
	])
	register_command(&"god", _cmd_god, "Toggle god mode (invincibility)")
	register_command(&"noclip", _cmd_noclip, "Toggle noclip (fly through walls)")
	register_command(&"give", _cmd_give, "Give item to player", [
		DebugCommand.DebugArg.new("item_id", TYPE_STRING),
		DebugCommand.DebugArg.new("quantity", TYPE_INT, false, 1),
	])
	register_command(&"teleport", _cmd_teleport, "Teleport player to coordinates", [
		DebugCommand.DebugArg.new("x", TYPE_FLOAT),
		DebugCommand.DebugArg.new("y", TYPE_FLOAT),
		DebugCommand.DebugArg.new("z", TYPE_FLOAT, false, 0.0),
	])
	register_command(&"stat", _cmd_stat, "Print a game statistic", [
		DebugCommand.DebugArg.new("stat_name", TYPE_STRING),
	])


func _cmd_help(command: String) -> String:
	if command.is_empty():
		var lines: Array[String] = ["[b]Available commands:[/b]"]
		var names := _commands.keys()
		names.sort()
		for cmd_name: StringName in names:
			lines.append("  %s" % _commands[cmd_name].get_usage())
		return "\n".join(lines)
	else:
		var cmd: DebugCommand = _commands.get(StringName(command))
		if cmd:
			return cmd.get_usage()
		return "[color=red]Unknown command: %s[/color]" % command


func _cmd_timescale(scale: float) -> String:
	Engine.time_scale = clampf(scale, 0.01, 10.0)
	return "Time scale: %.2f" % Engine.time_scale


func _cmd_scene(path: String) -> String:
	if not ResourceLoader.exists(path):
		return "[color=red]Scene not found: %s[/color]" % path
	get_tree().change_scene_to_file(path)
	return "Loading scene: %s" % path


func _cmd_god() -> String:
	var player := _get_player()
	if not player:
		return "[color=red]No player found[/color]"
	player.god_mode = not player.god_mode
	return "God mode: %s" % ("ON" if player.god_mode else "OFF")


func _cmd_noclip() -> String:
	var player := _get_player()
	if not player:
		return "[color=red]No player found[/color]"
	player.noclip = not player.noclip
	return "Noclip: %s" % ("ON" if player.noclip else "OFF")


func _cmd_give(item_id: String, quantity: int) -> String:
	if InventoryManager.add_item(StringName(item_id), quantity):
		return "Gave %d × %s" % [quantity, item_id]
	return "[color=red]Unknown item: %s[/color]" % item_id


func _cmd_teleport(x: float, y: float, z: float) -> String:
	var player := _get_player()
	if not player:
		return "[color=red]No player found[/color]"
	player.global_position = Vector3(x, y, z)
	return "Teleported to (%.1f, %.1f, %.1f)" % [x, y, z]


func _cmd_stat(stat_name: String) -> String:
	match stat_name:
		"memory":
			return "Static: %.1f MB | Dynamic: %.1f MB" % [
				Performance.get_monitor(Performance.MEMORY_STATIC) / 1048576.0,
				Performance.get_monitor(Performance.MEMORY_MESSAGE_BUFFER_MAX) / 1048576.0,
			]
		"objects":
			return "Objects: %d | Resources: %d | Nodes: %d" % [
				Performance.get_monitor(Performance.OBJECT_COUNT),
				Performance.get_monitor(Performance.OBJECT_RESOURCE_COUNT),
				Performance.get_monitor(Performance.OBJECT_NODE_COUNT),
			]
		"render":
			return "Draw calls: %d | Vertices: %d" % [
				Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),
				Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME),
			]
		_:
			return "[color=yellow]Known stats: memory, objects, render[/color]"


func _get_player() -> Node:
	return get_tree().get_first_node_in_group(&"player")
```

---

## 7. Debug Overlay HUD

```gdscript
class_name DebugOverlayUI
extends CanvasLayer

var _label: RichTextLabel
var _visible: bool = false
var _stat_providers: Array[Callable] = []


func _init() -> void:
	layer = 100  # Above everything
	_label = RichTextLabel.new()
	_label.bbcode_enabled = true
	_label.scroll_active = false
	_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_label.set_anchors_preset(Control.PRESET_TOP_LEFT)
	_label.custom_minimum_size = Vector2(400, 300)
	_label.add_theme_font_size_override("normal_font_size", 14)
	_label.visible = false
	add_child(_label)


func toggle() -> void:
	_visible = not _visible
	_label.visible = _visible


func add_stat_provider(provider: Callable) -> void:
	_stat_providers.append(provider)


func _process(_delta: float) -> void:
	if not _visible:
		return

	var lines: Array[String] = []
	lines.append("[b]Debug Overlay[/b]")
	lines.append("FPS: %d (%.1f ms)" % [
		Engine.get_frames_per_second(),
		1000.0 / maxf(Engine.get_frames_per_second(), 1),
	])
	lines.append("Objects: %d | Nodes: %d" % [
		Performance.get_monitor(Performance.OBJECT_COUNT),
		Performance.get_monitor(Performance.OBJECT_NODE_COUNT),
	])
	lines.append("Draw calls: %d" % Performance.get_monitor(
		Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME))
	lines.append("Physics bodies: %d" % Performance.get_monitor(
		Performance.PHYSICS_3D_ACTIVE_OBJECTS))

	# Custom stat providers
	for provider: Callable in _stat_providers:
		var stat: String = provider.call()
		if stat != "":
			lines.append(stat)

	_label.text = "\n".join(lines)
```

### Registering Custom Stats

Any system can add stats to the overlay:

```gdscript
## In your EnemyManager:
func _ready() -> void:
	DebugManager._overlay_ui.add_stat_provider(func() -> String:
		return "Enemies: %d / %d" % [active_count, max_count]
	)

## In your NetworkManager:
func _ready() -> void:
	DebugManager._overlay_ui.add_stat_provider(func() -> String:
		return "Ping: %d ms | Peers: %d" % [current_ping_ms, peer_count]
	)
```

---

## 8. Debug Draw System

Draw shapes in world space for visualizing AI, physics, paths, and more.

```gdscript
class_name DebugDraw3D
extends Node3D

## Singleton pattern — add as child of DebugManager

var _lines: Array[DebugLine] = []
var _spheres: Array[DebugSphere] = []
var _mesh: ImmediateMesh
var _material: StandardMaterial3D


func _ready() -> void:
	_mesh = ImmediateMesh.new()
	_material = StandardMaterial3D.new()
	_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_material.vertex_color_use_as_albedo = true
	_material.no_depth_test = true  # Always visible

	var mesh_instance := MeshInstance3D.new()
	mesh_instance.mesh = _mesh
	mesh_instance.material_override = _material
	add_child(mesh_instance)


func draw_line(from: Vector3, to: Vector3, color: Color = Color.GREEN, duration: float = 0.0) -> void:
	_lines.append(DebugLine.new(from, to, color, duration))


func draw_sphere(center: Vector3, radius: float = 0.5, color: Color = Color.CYAN, duration: float = 0.0) -> void:
	_spheres.append(DebugSphere.new(center, radius, color, duration))


func draw_ray(origin: Vector3, direction: Vector3, length: float = 10.0, color: Color = Color.RED, duration: float = 0.0) -> void:
	draw_line(origin, origin + direction.normalized() * length, color, duration)


func draw_box(center: Vector3, size: Vector3, color: Color = Color.YELLOW, duration: float = 0.0) -> void:
	var half := size * 0.5
	# Draw 12 edges of a box
	var corners: Array[Vector3] = [
		center + Vector3(-half.x, -half.y, -half.z),
		center + Vector3(half.x, -half.y, -half.z),
		center + Vector3(half.x, -half.y, half.z),
		center + Vector3(-half.x, -half.y, half.z),
		center + Vector3(-half.x, half.y, -half.z),
		center + Vector3(half.x, half.y, -half.z),
		center + Vector3(half.x, half.y, half.z),
		center + Vector3(-half.x, half.y, half.z),
	]
	# Bottom face
	for i: int in 4:
		draw_line(corners[i], corners[(i + 1) % 4], color, duration)
	# Top face
	for i: int in 4:
		draw_line(corners[i + 4], corners[((i + 1) % 4) + 4], color, duration)
	# Vertical edges
	for i: int in 4:
		draw_line(corners[i], corners[i + 4], color, duration)


func draw_path(points: PackedVector3Array, color: Color = Color.MAGENTA, duration: float = 0.0) -> void:
	for i: int in points.size() - 1:
		draw_line(points[i], points[i + 1], color, duration)


func _process(delta: float) -> void:
	_mesh.clear_surfaces()

	# Draw and expire lines
	if not _lines.is_empty():
		_mesh.surface_begin(Mesh.PRIMITIVE_LINES)
		var i := 0
		while i < _lines.size():
			var line: DebugLine = _lines[i]
			_mesh.surface_set_color(line.color)
			_mesh.surface_add_vertex(line.from)
			_mesh.surface_add_vertex(line.to)
			line.remaining -= delta
			if line.duration > 0.0 and line.remaining <= 0.0:
				_lines.remove_at(i)
			else:
				i += 1
		_mesh.surface_end()


class DebugLine:
	var from: Vector3
	var to: Vector3
	var color: Color
	var duration: float
	var remaining: float

	func _init(p_from: Vector3, p_to: Vector3, p_color: Color, p_duration: float) -> void:
		from = p_from
		to = p_to
		color = p_color
		duration = p_duration
		remaining = p_duration


class DebugSphere:
	var center: Vector3
	var radius: float
	var color: Color
	var duration: float
	var remaining: float

	func _init(p_center: Vector3, p_radius: float, p_color: Color, p_duration: float) -> void:
		center = p_center
		radius = p_radius
		color = p_color
		duration = p_duration
		remaining = p_duration
```

### Usage Examples

```gdscript
## Visualize AI navigation path
func _on_path_computed(path: PackedVector3Array) -> void:
	DebugDraw.draw_path(path, Color.CYAN, 2.0)

## Visualize raycast hit
func _on_raycast_hit(origin: Vector3, hit_point: Vector3) -> void:
	DebugDraw.draw_line(origin, hit_point, Color.RED, 1.0)
	DebugDraw.draw_sphere(hit_point, 0.2, Color.RED, 1.0)

## Visualize area of effect
func _on_aoe_triggered(center: Vector3, radius: float) -> void:
	DebugDraw.draw_sphere(center, radius, Color(1, 0.5, 0, 0.5), 3.0)
```

---

## 9. Feature Flags and Cheat Protection

### Feature Flags

Use feature flags to toggle debug features without recompiling:

```gdscript
class_name FeatureFlags
extends RefCounted

## Feature flags — set via console command or config file
static var flags: Dictionary[StringName, bool] = {
	&"debug_draw": false,
	&"show_hitboxes": false,
	&"infinite_ammo": false,
	&"free_camera": false,
	&"skip_tutorials": false,
}


static func is_enabled(flag: StringName) -> bool:
	return flags.get(flag, false)


static func set_flag(flag: StringName, enabled: bool) -> void:
	flags[flag] = enabled


static func toggle(flag: StringName) -> bool:
	flags[flag] = not flags.get(flag, false)
	return flags[flag]
```

Register a console command for toggling:

```gdscript
DebugManager.register_command(&"flag", func(name: String, value: String) -> String:
	if value.is_empty():
		return "%s: %s" % [name, FeatureFlags.is_enabled(StringName(name))]
	FeatureFlags.set_flag(StringName(name), value.to_lower() in ["true", "1", "on"])
	return "%s → %s" % [name, FeatureFlags.is_enabled(StringName(name))]
, "Get or set a feature flag", [
	DebugCommand.DebugArg.new("name", TYPE_STRING),
	DebugCommand.DebugArg.new("value", TYPE_STRING, false, ""),
])
```

### Cheat Protection for Multiplayer

In multiplayer games, debug commands must only execute on the server or in single-player mode:

```gdscript
func _execute_command(input: String) -> void:
	# Block cheats in multiplayer unless you're the server
	if multiplayer.has_multiplayer_peer() and not multiplayer.is_server():
		if cmd_name in [&"god", &"give", &"teleport", &"noclip"]:
			_console_ui.print_line("[color=red]Cheat commands disabled in multiplayer[/color]")
			return
	# ... normal execution
```

---

## 10. Stripping Debug Tools from Release Builds

### Using `OS.is_debug_build()`

The simplest approach — check at runtime:

```gdscript
func _ready() -> void:
	if not OS.is_debug_build():
		queue_free()  # Remove entire debug system in release
		return
```

### Using `@tool` and Export Features

For zero-overhead in release builds, use Godot's feature tags in your export preset:

```gdscript
## Only compiled into debug builds
func _ready() -> void:
	if OS.has_feature("debug"):
		add_child(preload("res://debug/debug_manager.tscn").instantiate())
```

### Preprocessor-Style Approach (GDScript)

GDScript doesn't have preprocessor directives, but you can use a build script to swap autoloads:

```ini
# project.godot — debug autoloads
[autoload]
DebugManager="*res://debug/debug_manager.tscn"

# For release: remove or replace with a stub that does nothing
# Use an export plugin or CI script to strip the autoload entry
```

---

## 11. C# Examples

### Command Registration (C#)

```csharp
using Godot;
using System;
using System.Collections.Generic;

public partial class DebugManager : Node
{
    private readonly Dictionary<StringName, DebugCommand> _commands = new();

    public void RegisterCommand(StringName name, Func<string[], string> callback, string description = "")
    {
        _commands[name] = new DebugCommand
        {
            Name = name,
            Description = description,
            Callback = callback,
        };
    }

    private void ExecuteCommand(string input)
    {
        var parts = input.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length == 0) return;

        StringName cmdName = parts[0];
        string[] args = parts.Length > 1 ? parts[1..] : Array.Empty<string>();

        if (_commands.TryGetValue(cmdName, out var cmd))
        {
            string result = cmd.Callback(args);
            if (!string.IsNullOrEmpty(result))
                PrintToConsole(result);
        }
        else
        {
            PrintToConsole($"[color=red]Unknown command: {cmdName}[/color]");
        }
    }

    public override void _Ready()
    {
        if (!OS.IsDebugBuild())
        {
            QueueFree();
            return;
        }

        RegisterCommand("fps", _ =>
            $"FPS: {Engine.GetFramesPerSecond()}", "Show current FPS");

        RegisterCommand("timescale", args =>
        {
            if (args.Length > 0 && float.TryParse(args[0], out float scale))
            {
                Engine.TimeScale = Mathf.Clamp(scale, 0.01, 10.0);
                return $"Time scale: {Engine.TimeScale:F2}";
            }
            return "Usage: timescale <float>";
        }, "Set engine time scale");
    }

    private record DebugCommand
    {
        public StringName Name;
        public string Description;
        public Func<string[], string> Callback;
    }
}
```

---

## Common Pitfalls

| Pitfall | Fix |
|---|---|
| Console captures gameplay input | Set `process_mode = PROCESS_MODE_ALWAYS` on console; pause tree or block input when open |
| Debug draw tanks FPS | Use duration-based auto-expiry; cap max visible lines |
| Commands crash in release builds | Gate everything behind `OS.is_debug_build()` |
| Autocomplete lags with many commands | Cache sorted command list; only filter on input change |
| Console text grows unbounded | Cap `RichTextLabel` text length; remove oldest lines |
| Cheats work in multiplayer | Validate cheat commands server-side; block on clients |
| Debug overlay obscures gameplay | Use semi-transparent background; position in corner; make toggle instant |
