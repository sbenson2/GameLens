# G99 — ObjectDB Profiling & Advanced Debugging

> **Category:** guide · **Engine:** Godot 4.x · **Related:** [G57 Debug Tools & Console](./G57_debug_tools_and_console.md) · [G84 Memory Management & Optimization](./G84_memory_management_and_optimization.md) · [G18 Performance Profiling](./G18_performance_profiling.md) · [G41 Godot 4.4–4.6 Features](./G41_godot_44_to_46_features.md)

Godot 4.6 introduced the ObjectDB Profiler — a debugger tool that captures snapshots of every live object in your game, lets you diff snapshots to find memory leaks, and identifies orphaned nodes and unintended object growth. This guide covers the ObjectDB Profiler workflow, programmatic memory debugging techniques, common leak patterns, and advanced debugging strategies using the remote debugger, monitors, and GDScript/C# introspection APIs.

---

## Table of Contents

1. [The Memory Leak Problem](#1-the-memory-leak-problem)
2. [ObjectDB Profiler Overview (4.6+)](#2-objectdb-profiler-overview-46)
3. [Taking and Viewing Snapshots](#3-taking-and-viewing-snapshots)
4. [Diffing Snapshots to Find Leaks](#4-diffing-snapshots-to-find-leaks)
5. [Common Leak Patterns & Fixes](#5-common-leak-patterns--fixes)
6. [Programmatic Object Tracking in GDScript](#6-programmatic-object-tracking-in-gdscript)
7. [Programmatic Object Tracking in C#](#7-programmatic-object-tracking-in-c)
8. [Remote Debugger & Performance Monitors](#8-remote-debugger--performance-monitors)
9. [Debugging Orphaned Nodes](#9-debugging-orphaned-nodes)
10. [Signal Connection Debugging](#10-signal-connection-debugging)
11. [Advanced: Custom Debug Overlays](#11-advanced-custom-debug-overlays)
12. [Debugging in Exported Builds](#12-debugging-in-exported-builds)
13. [Workflow Checklists](#13-workflow-checklists)

---

## 1. The Memory Leak Problem

In Godot, "memory leak" typically means one of:

- **Orphaned nodes** — nodes removed from the scene tree but never `queue_free()`d, sitting in memory indefinitely.
- **Unreleased Resources** — dynamically created resources (textures, meshes, materials) with lingering references.
- **Signal connections keeping objects alive** — an object connected to a signal on a persistent node prevents garbage collection.
- **Unbounded collections** — arrays or dictionaries that grow every frame without cleanup.

Before Godot 4.6, finding these required print-debugging or external tools. The ObjectDB Profiler changes that.

---

## 2. ObjectDB Profiler Overview (4.6+)

The ObjectDB Profiler is a new tab in the **Debugger** bottom panel (next to the existing Profiler, Network Profiler, and Visual Profiler tabs).

### What It Does

- Captures a **snapshot** of every object tracked by Godot's internal ObjectDB — nodes, resources, references, and core objects
- Lists objects by class with instance counts and total memory
- **Diffs two snapshots** to show what was created, destroyed, or leaked between them
- Saves snapshots to `user://objectdb_snapshots/` for later analysis

### When to Use It

- After a level transition: take a snapshot before and after to verify cleanup
- During gameplay: periodic snapshots to catch slow leaks
- Before shipping: final leak audit on each major scene

---

## 3. Taking and Viewing Snapshots

### Step-by-Step Workflow

1. Run your game from the editor (F5 or the Play button)
2. Open the **Debugger** panel at the bottom of the editor
3. Click the **ObjectDB Profiler** tab
4. Play your game to the state you want to inspect
5. Click **"Take ObjectDB Snapshot"**
6. The snapshot appears in the snapshot list on the left

### Reading a Snapshot

Each snapshot shows a table of object classes:

| Class | Count | Size (approx) |
|-------|-------|---------------|
| `Node2D` | 342 | 164 KB |
| `Sprite2D` | 128 | 89 KB |
| `ImageTexture` | 45 | 2.3 MB |
| `GDScriptInstance` | 210 | 42 KB |
| `PackedScene` | 12 | 156 KB |

Click any class to see individual instances with their properties and references.

### Snapshot Storage

Snapshots are saved to `user://objectdb_snapshots/` as binary files. You can:

- **Right-click** a snapshot to rename, delete, or open in file browser
- Compare snapshots from different sessions (they persist between runs)
- Share snapshot files with teammates for collaborative debugging

---

## 4. Diffing Snapshots to Find Leaks

The diff workflow is the core leak-detection tool:

### The Two-Snapshot Method

```
1. Take Snapshot A (baseline — e.g., at main menu)
2. Play through a level, return to main menu
3. Take Snapshot B (should be similar to A if cleanup is correct)
4. Select Snapshot B, then use the Diff dropdown to select Snapshot A
5. Review the diff — anything in B that wasn't in A is a potential leak
```

### Reading the Diff

The diff view shows:

- **Created (+)** — objects that exist in B but not in A. If these are unexpected after returning to the same game state, they are leaks.
- **Destroyed (−)** — objects that existed in A but were cleaned up by B. This is healthy.
- **Unchanged** — objects present in both snapshots.

### What to Look For

- **Growing `Node` counts** — nodes not being freed after scene transitions
- **Accumulating `Resource` subclasses** — dynamically created materials, meshes, or textures not released
- **`RefCounted` objects with no apparent owner** — often from closures or lambdas capturing references

---

## 5. Common Leak Patterns & Fixes

### Pattern 1: Forgotten queue_free()

```gdscript
## BAD — node removed from tree but never freed
func despawn_enemy(enemy: Node2D) -> void:
    remove_child(enemy)
    # enemy is now orphaned — still in memory, processing signals

## GOOD — always free nodes you're done with
func despawn_enemy(enemy: Node2D) -> void:
    enemy.queue_free()
```

### Pattern 2: Signal Connections Preventing Cleanup

```gdscript
## BAD — enemy connects to a global signal, preventing GC
func _ready() -> void:
    GameEvents.wave_started.connect(_on_wave_started)
    # Even after queue_free(), the connection to GameEvents
    # may keep a reference alive until the signal fires

## GOOD — use CONNECT_ONE_SHOT or disconnect explicitly
func _ready() -> void:
    GameEvents.wave_started.connect(_on_wave_started)

func _exit_tree() -> void:
    if GameEvents.wave_started.is_connected(_on_wave_started):
        GameEvents.wave_started.disconnect(_on_wave_started)

## ALSO GOOD — use Object.CONNECT_REFERENCE_COUNTED flag (4.x)
## or simply use the node's tree_exiting signal for cleanup
```

### Pattern 3: Lambda / Callable Capturing

```gdscript
## BAD — lambda captures 'self', preventing garbage collection
func setup_timer() -> void:
    var timer := get_tree().create_timer(5.0)
    timer.timeout.connect(func():
        # 'self' is implicitly captured here
        do_something()
    )
    # If this node is freed before the timer fires,
    # the lambda still holds a reference

## GOOD — check validity or use a WeakRef pattern
func setup_timer() -> void:
    var weak_self := weakref(self)
    var timer := get_tree().create_timer(5.0)
    timer.timeout.connect(func():
        var obj = weak_self.get_ref()
        if obj:
            obj.do_something()
    )
```

### Pattern 4: Unbounded Array Growth

```gdscript
## BAD — history grows forever
var position_history: Array[Vector2] = []

func _physics_process(delta: float) -> void:
    position_history.append(position)
    # Never trimmed — eats memory over long sessions

## GOOD — ring buffer with fixed capacity
const HISTORY_SIZE := 120  # 2 seconds at 60 Hz
var position_history: Array[Vector2] = []
var _history_index: int = 0

func _physics_process(delta: float) -> void:
    if position_history.size() < HISTORY_SIZE:
        position_history.append(position)
    else:
        position_history[_history_index] = position
    _history_index = (_history_index + 1) % HISTORY_SIZE
```

### Pattern 5: Dynamic Resource Duplication

```gdscript
## BAD — creates a new material every frame
func _process(delta: float) -> void:
    var mat := StandardMaterial3D.new()
    mat.albedo_color = Color(randf(), randf(), randf())
    mesh_instance.material_override = mat
    # Previous material has no references? Maybe. Maybe not.

## GOOD — create once, modify in place
var _material: StandardMaterial3D

func _ready() -> void:
    _material = StandardMaterial3D.new()
    mesh_instance.material_override = _material

func _process(delta: float) -> void:
    _material.albedo_color = Color(randf(), randf(), randf())
```

---

## 6. Programmatic Object Tracking in GDScript

For automated leak detection in tests or CI, track objects programmatically:

```gdscript
## memory_tracker.gd — Runtime leak detector
class_name MemoryTracker
extends Node

## Captures object counts by class name
static func snapshot() -> Dictionary[String, int]:
    var counts: Dictionary[String, int] = {}
    # Performance.get_monitor gives total object count
    # For per-class breakdown, iterate known classes:
    for class_name in ClassDB.get_class_list():
        # Note: there's no direct API to count instances of a class.
        # Use this approach for your OWN tracked objects instead.
        pass
    return counts

## Track specific objects you create
var _tracked: Dictionary[String, Array] = {}

func track(label: String, object: Object) -> void:
    if not _tracked.has(label):
        _tracked[label] = []
    _tracked[label].append(weakref(object))

func get_alive_count(label: String) -> int:
    if not _tracked.has(label):
        return 0
    var alive := 0
    for wr: WeakRef in _tracked[label]:
        if wr.get_ref() != null:
            alive += 1
    return alive

func report() -> void:
    print("=== Memory Tracker Report ===")
    for label in _tracked:
        var alive := get_alive_count(label)
        var total := _tracked[label].size()
        if alive > 0:
            print("  %s: %d alive / %d total%s" % [
                label, alive, total,
                " ⚠ LEAK?" if alive == total else ""
            ])
    print("=== End Report ===")

## Use Performance monitors for aggregate data
static func print_engine_stats() -> void:
    print("Object count: %d" % Performance.get_monitor(
        Performance.OBJECT_COUNT))
    print("Resource count: %d" % Performance.get_monitor(
        Performance.OBJECT_RESOURCE_COUNT))
    print("Node count: %d" % Performance.get_monitor(
        Performance.OBJECT_NODE_COUNT))
    print("Orphan nodes: %d" % Performance.get_monitor(
        Performance.OBJECT_ORPHAN_NODE_COUNT))
```

### Using the Tracker

```gdscript
## In your game manager
@onready var tracker := MemoryTracker.new()

func spawn_enemy(pos: Vector2) -> void:
    var enemy := enemy_scene.instantiate()
    enemy.position = pos
    add_child(enemy)
    tracker.track("enemies", enemy)

## Call periodically or after scene transitions
func check_for_leaks() -> void:
    tracker.report()
    # Also check engine-level stats
    MemoryTracker.print_engine_stats()
```

---

## 7. Programmatic Object Tracking in C\#

```csharp
using Godot;
using System.Collections.Generic;

/// <summary>
/// Tracks object lifetimes using WeakReference to detect leaks.
/// </summary>
public partial class MemoryTracker : Node
{
    private readonly Dictionary<string, List<WeakReference<GodotObject>>> _tracked = new();

    public void Track(string label, GodotObject obj)
    {
        if (!_tracked.ContainsKey(label))
            _tracked[label] = new List<WeakReference<GodotObject>>();
        _tracked[label].Add(new WeakReference<GodotObject>(obj));
    }

    public int GetAliveCount(string label)
    {
        if (!_tracked.TryGetValue(label, out var list)) return 0;
        int alive = 0;
        foreach (var wr in list)
        {
            if (wr.TryGetTarget(out var target) && GodotObject.IsInstanceValid(target))
                alive++;
        }
        return alive;
    }

    public void Report()
    {
        GD.Print("=== Memory Tracker Report ===");
        foreach (var (label, list) in _tracked)
        {
            int alive = GetAliveCount(label);
            if (alive > 0)
            {
                string warning = alive == list.Count ? " ⚠ LEAK?" : "";
                GD.Print($"  {label}: {alive} alive / {list.Count} total{warning}");
            }
        }
        GD.Print("=== End Report ===");
    }

    public static void PrintEngineStats()
    {
        GD.Print($"Object count: {Performance.GetMonitor(Performance.Monitor.ObjectCount)}");
        GD.Print($"Resource count: {Performance.GetMonitor(Performance.Monitor.ObjectResourceCount)}");
        GD.Print($"Node count: {Performance.GetMonitor(Performance.Monitor.ObjectNodeCount)}");
        GD.Print($"Orphan nodes: {Performance.GetMonitor(Performance.Monitor.ObjectOrphanNodeCount)}");
    }
}
```

---

## 8. Remote Debugger & Performance Monitors

### Built-In Performance Monitors

Godot exposes real-time metrics via `Performance.get_monitor()`. Key monitors for memory debugging:

| Monitor | What It Tracks |
|---------|---------------|
| `OBJECT_COUNT` | Total live objects in ObjectDB |
| `OBJECT_RESOURCE_COUNT` | Live Resource instances |
| `OBJECT_NODE_COUNT` | Live nodes (in-tree and orphaned) |
| `OBJECT_ORPHAN_NODE_COUNT` | Nodes not in any tree — likely leaks |
| `MEMORY_STATIC` | Static memory usage |
| `MEMORY_MESSAGE_BUFFER_MAX` | Peak message buffer usage |
| `RENDER_TOTAL_OBJECTS_IN_FRAME` | Objects rendered this frame |

### Custom Performance Monitors

Register your own monitors that appear in the editor's Debugger → Monitors tab:

```gdscript
## Register in _ready() of an autoload
func _ready() -> void:
    Performance.add_custom_monitor(
        "game/active_enemies",
        _get_enemy_count
    )
    Performance.add_custom_monitor(
        "game/pooled_bullets",
        _get_pooled_bullet_count
    )

func _get_enemy_count() -> float:
    return get_tree().get_nodes_in_group("enemies").size()

func _get_pooled_bullet_count() -> float:
    return BulletPool.available_count if BulletPool else 0.0
```

### Remote Debugging

When running on a device (mobile, web), connect the remote debugger:

1. In Project Settings → Debug → Remote, set the remote host/port
2. Run the export on the target device
3. The editor connects and all debugger tabs work — including ObjectDB Profiler

---

## 9. Debugging Orphaned Nodes

Orphaned nodes are the most common "leak" in Godot. The `OBJECT_ORPHAN_NODE_COUNT` monitor tracks them.

```gdscript
## orphan_detector.gd — Autoload that warns about orphan growth
extends Node

var _last_orphan_count: int = 0
const CHECK_INTERVAL := 5.0  # Check every 5 seconds
const ORPHAN_THRESHOLD := 10  # Warn if orphans grew by this much

func _ready() -> void:
    var timer := Timer.new()
    timer.wait_time = CHECK_INTERVAL
    timer.autostart = true
    timer.timeout.connect(_check_orphans)
    add_child(timer)

func _check_orphans() -> void:
    var current := int(Performance.get_monitor(
        Performance.OBJECT_ORPHAN_NODE_COUNT))
    var delta_orphans := current - _last_orphan_count
    if delta_orphans > ORPHAN_THRESHOLD:
        push_warning("Orphan node spike: %d new orphans (total: %d)" % [
            delta_orphans, current])
    _last_orphan_count = current
```

### Finding the Culprit

When you detect orphans growing:

1. **Take an ObjectDB snapshot** in the profiler
2. Sort by class — look for unexpected Node subclasses
3. **Diff against a clean baseline** — the new orphans will appear as created objects
4. Check your `remove_child()` calls — every one should be paired with `queue_free()` unless you're explicitly reparenting

---

## 10. Signal Connection Debugging

Dangling signal connections are subtle. Inspect them programmatically:

```gdscript
## Print all outgoing signal connections for an object
static func debug_signals(obj: Object) -> void:
    for signal_info in obj.get_signal_list():
        var sig_name: String = signal_info.name
        var connections := obj.get_signal_connection_list(sig_name)
        if connections.size() > 0:
            print("  Signal '%s' (%d connections):" % [sig_name, connections.size()])
            for conn in connections:
                print("    → %s.%s (flags: %d)" % [
                    conn.callable.get_object(),
                    conn.callable.get_method(),
                    conn.flags
                ])
```

```csharp
// C# — inspect signal connections
public static void DebugSignals(GodotObject obj)
{
    foreach (var signalInfo in obj.GetSignalList())
    {
        string sigName = signalInfo["name"].AsString();
        var connections = obj.GetSignalConnectionList(sigName);
        if (connections.Count > 0)
        {
            GD.Print($"  Signal '{sigName}' ({connections.Count} connections):");
            foreach (var conn in connections)
            {
                var callable = conn["callable"].AsCallable();
                GD.Print($"    → {callable.GetObject()}.{callable.GetMethod()}");
            }
        }
    }
}
```

---

## 11. Advanced: Custom Debug Overlays

Build an in-game debug overlay for live memory stats:

```gdscript
## debug_overlay.gd — Press F3 to toggle
extends CanvasLayer

var _label: Label
var _visible := false

func _ready() -> void:
    layer = 100
    _label = Label.new()
    _label.position = Vector2(10, 10)
    _label.add_theme_font_size_override("font_size", 14)
    _label.add_theme_color_override("font_color", Color.YELLOW)
    _label.visible = false
    add_child(_label)

func _input(event: InputEvent) -> void:
    if event.is_action_pressed("toggle_debug"):  # Map to F3
        _visible = not _visible
        _label.visible = _visible

func _process(_delta: float) -> void:
    if not _visible:
        return
    var text := "=== Debug Overlay ===\n"
    text += "FPS: %d\n" % Engine.get_frames_per_second()
    text += "Objects: %d\n" % Performance.get_monitor(
        Performance.OBJECT_COUNT)
    text += "Nodes: %d\n" % Performance.get_monitor(
        Performance.OBJECT_NODE_COUNT)
    text += "Orphans: %d\n" % Performance.get_monitor(
        Performance.OBJECT_ORPHAN_NODE_COUNT)
    text += "Resources: %d\n" % Performance.get_monitor(
        Performance.OBJECT_RESOURCE_COUNT)
    text += "Static Mem: %.1f MB\n" % (
        Performance.get_monitor(Performance.MEMORY_STATIC) / 1048576.0)
    text += "Draw Calls: %d\n" % Performance.get_monitor(
        Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME)
    _label.text = text
```

---

## 12. Debugging in Exported Builds

### Debug Template

Export with `template_debug` to keep debugger connections and assertions active:

```gdscript
# Assertions are stripped in template_release but active in template_debug
assert(health > 0, "Entity spawned with zero health")
```

### Logging to File

```gdscript
## file_logger.gd — Captures push_error/push_warning to a log file
extends Node

var _log_file: FileAccess

func _ready() -> void:
    var log_path := "user://game.log"
    _log_file = FileAccess.open(log_path, FileAccess.WRITE)
    if _log_file:
        _log_file.store_line("=== Session started: %s ===" %
            Time.get_datetime_string_from_system())

func log_message(level: String, msg: String) -> void:
    if _log_file:
        var timestamp := Time.get_datetime_string_from_system()
        _log_file.store_line("[%s] %s: %s" % [timestamp, level, msg])
        _log_file.flush()

func _notification(what: int) -> void:
    if what == NOTIFICATION_WM_CLOSE_REQUEST and _log_file:
        _log_file.close()
```

### Crash Dumps

Enable OS-level crash reporting:

```gdscript
# In Project Settings → Debug → Settings:
# "Max Errors Per Second" — increase for debugging
# "Max Warnings Per Second" — increase for debugging

# On Windows, set up minidump collection:
# Environment variable: GODOT_CRASH_DUMP_DIR=C:\CrashDumps
```

---

## 13. Workflow Checklists

### Pre-Release Leak Audit

1. Start game, navigate to main menu → **Take Snapshot A**
2. Play a full level from start to completion → return to main menu
3. **Take Snapshot B** → Diff against A
4. Fix any unexpected object growth
5. Repeat for each level/scene transition
6. Check `OBJECT_ORPHAN_NODE_COUNT` is zero (or stable) at main menu

### Continuous Integration Leak Check

```gdscript
## ci_leak_test.gd — Run with --headless for automated testing
extends SceneTree

func _init() -> void:
    # Run game logic for N frames
    var initial_objects := Performance.get_monitor(Performance.OBJECT_COUNT)

    # Simulate gameplay...
    for i in range(1000):
        # Process frames
        pass

    var final_objects := Performance.get_monitor(Performance.OBJECT_COUNT)
    var growth := final_objects - initial_objects

    if growth > 50:  # Threshold for acceptable growth
        push_error("Potential memory leak: object count grew by %d" % growth)
        quit(1)
    else:
        print("Leak check passed: object growth = %d" % growth)
        quit(0)
```

### Quick Triage Flowchart

```
Orphan count growing?
├─ YES → Find which nodes aren't being freed
│   ├─ Check remove_child() calls → add queue_free()
│   └─ Check signal connections holding references
├─ NO, but object count growing?
│   ├─ Check Resource creation → reuse or cache
│   └─ Check array/dictionary unbounded growth
└─ NO, but memory growing?
    ├─ Check texture/audio loading → use ResourceLoader streaming
    └─ Check native allocations → profile with external tools (Valgrind, Instruments)
```
