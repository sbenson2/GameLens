# G59 — Replay & Rewind Systems

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#
> **Related:** [G11 Save & Load Systems](./G11_save_load_systems.md) · [G5 Physics & Collision](./G5_physics_and_collision.md) · [G34 Threading & Async](./G34_threading_and_async.md) · [G43 Rollback Netcode](./G43_rollback_netcode.md) · [G53 Data-Driven Design](./G53_data_driven_design.md)

---

## What This Guide Covers

Replay systems record game state so it can be played back later — for kill cams, instant replays, time-rewind mechanics, ghost runs in racing games, or demo recording. The challenge is capturing enough data to reproduce the game faithfully without consuming excessive memory or breaking determinism.

This guide covers two fundamental approaches: **input recording** (capture player inputs and re-simulate — lightweight but requires deterministic physics) and **state recording** (snapshot positions, rotations, and animations every frame — heavier but works with any physics setup). It also covers time-rewind mechanics (rewinding state in real time), ghost replay systems, memory management, and serialization for replay files.

**Use this guide when:** you're building a racing game with ghost runs, a puzzle game with time rewind, a competitive game with kill cams, or any project where players should be able to review past actions.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [State Recording — The Snapshot Approach](#2-state-recording--the-snapshot-approach)
3. [FrameData and RecordingManager](#3-framedata-and-recordingmanager)
4. [Playback System](#4-playback-system)
5. [Time-Rewind Mechanics](#5-time-rewind-mechanics)
6. [Input Recording — The Deterministic Approach](#6-input-recording--the-deterministic-approach)
7. [Ghost Replay System](#7-ghost-replay-system)
8. [Memory Management](#8-memory-management)
9. [Serialization and Replay Files](#9-serialization-and-replay-files)
10. [C# Examples](#10-c-examples)
11. [Common Pitfalls](#11-common-pitfalls)

---

## 1. Architecture Overview

```
RecordingManager (AutoLoad)
├── Captures FrameData every physics tick
├── Stores circular buffer of snapshots
├── Manages recording / playback / rewind states
│
FrameData (Resource)
├── frame_index: int
├── timestamp: float
├── entity_states: Dictionary[int, EntitySnapshot]
│
EntitySnapshot
├── position: Vector3 / Vector2
├── rotation: float / Vector3
├── velocity: Vector3 / Vector2
├── animation_name: String
├── animation_position: float
├── custom_data: Dictionary
│
Rewindable (component / group)
├── Attached to any node that should be recorded
├── Provides get_snapshot() → EntitySnapshot
├── Provides apply_snapshot(EntitySnapshot)
```

### Choosing Your Approach

| Approach | Memory | Determinism Required | Complexity | Best For |
|----------|--------|---------------------|------------|----------|
| State recording | Higher (snapshots per frame) | No | Lower | Rewind, kill cams, most games |
| Input recording | Lower (inputs only) | **Yes** — identical results every replay | Higher | Racing ghosts, competitive replays, demo files |

**Recommendation:** Start with state recording. It works reliably with any physics engine and doesn't require deterministic simulation.

---

## 2. State Recording — The Snapshot Approach

Every physics frame, capture the state of all tracked entities into a `FrameData` object.

### Marking Entities as Rewindable

Use Godot's group system — any node in the `rewindable` group gets recorded:

```gdscript
# In the editor, add nodes to the "rewindable" group,
# or do it in code:
func _ready() -> void:
    add_to_group("rewindable")
```

### The Rewindable Interface

Each rewindable node must implement snapshot capture and application:

```gdscript
class_name RewindableComponent
extends Node

## Attach as a child of any node you want to record.

func get_snapshot() -> Dictionary:
    var parent := get_parent()
    var snapshot := {
        "position": parent.global_position,
        "rotation": parent.global_rotation if parent is Node3D else parent.rotation,
    }
    
    # Capture velocity for physics bodies
    if parent is CharacterBody3D or parent is RigidBody3D:
        snapshot["velocity"] = parent.velocity if parent is CharacterBody3D else parent.linear_velocity
    
    # Capture animation state
    var anim_player := parent.get_node_or_null("AnimationPlayer") as AnimationPlayer
    if anim_player and anim_player.is_playing():
        snapshot["anim_name"] = anim_player.current_animation
        snapshot["anim_pos"] = anim_player.current_animation_position
    
    return snapshot

func apply_snapshot(snapshot: Dictionary) -> void:
    var parent := get_parent()
    parent.global_position = snapshot["position"]
    
    if parent is Node3D:
        parent.global_rotation = snapshot["rotation"]
    else:
        parent.rotation = snapshot["rotation"]
    
    # Restore animation
    if snapshot.has("anim_name"):
        var anim_player := parent.get_node_or_null("AnimationPlayer") as AnimationPlayer
        if anim_player:
            anim_player.play(snapshot["anim_name"])
            anim_player.seek(snapshot["anim_pos"], true)
```

---

## 3. FrameData and RecordingManager

```gdscript
class_name ReplayFrameData
extends RefCounted

var frame_index: int
var timestamp: float
var entity_states: Dictionary = {}  # node instance_id → snapshot dict

class_name RecordingManager
extends Node

## Maximum frames to keep in memory (at 60fps = ~5 minutes).
@export var max_frames: int = 18000

var _frames: Array[ReplayFrameData] = []
var _is_recording: bool = false
var _current_frame: int = 0

enum State { IDLE, RECORDING, PLAYING_BACK, REWINDING }
var state: State = State.IDLE

func start_recording() -> void:
    _frames.clear()
    _current_frame = 0
    _is_recording = true
    state = State.RECORDING

func stop_recording() -> void:
    _is_recording = false
    state = State.IDLE

func _physics_process(_delta: float) -> void:
    if state == State.RECORDING:
        _capture_frame()

func _capture_frame() -> void:
    var frame := ReplayFrameData.new()
    frame.frame_index = _current_frame
    frame.timestamp = Time.get_ticks_msec() / 1000.0
    
    for node: Node in get_tree().get_nodes_in_group("rewindable"):
        var comp := _get_rewindable_component(node)
        if comp:
            frame.entity_states[node.get_instance_id()] = comp.get_snapshot()
    
    _frames.append(frame)
    
    # Enforce circular buffer limit
    if _frames.size() > max_frames:
        _frames.pop_front()
    
    _current_frame += 1

func _get_rewindable_component(node: Node) -> RewindableComponent:
    for child in node.get_children():
        if child is RewindableComponent:
            return child
    return null

func get_frame(index: int) -> ReplayFrameData:
    if index >= 0 and index < _frames.size():
        return _frames[index]
    return null

func get_frame_count() -> int:
    return _frames.size()
```

---

## 4. Playback System

For kill cams and instant replays — play back recorded frames at a controlled speed:

```gdscript
class_name ReplayPlayback
extends Node

@export var playback_speed: float = 1.0

var _playback_frame: int = 0
var _playback_accumulator: float = 0.0
var _is_playing: bool = false

signal playback_finished

func start_playback(from_frame: int = 0) -> void:
    _playback_frame = from_frame
    _playback_accumulator = 0.0
    _is_playing = true
    
    # Disable physics on rewindable objects during playback
    _set_physics_enabled(false)
    RecordingManager.state = RecordingManager.State.PLAYING_BACK

func stop_playback() -> void:
    _is_playing = false
    _set_physics_enabled(true)
    RecordingManager.state = RecordingManager.State.IDLE
    playback_finished.emit()

func _physics_process(delta: float) -> void:
    if not _is_playing:
        return
    
    _playback_accumulator += delta * playback_speed
    var frames_to_advance := int(_playback_accumulator / (1.0 / Engine.physics_ticks_per_second))
    _playback_accumulator -= frames_to_advance * (1.0 / Engine.physics_ticks_per_second)
    
    _playback_frame += frames_to_advance
    
    if _playback_frame >= RecordingManager.get_frame_count():
        stop_playback()
        return
    
    _apply_frame(_playback_frame)

func _apply_frame(index: int) -> void:
    var frame := RecordingManager.get_frame(index)
    if not frame:
        return
    
    for node: Node in get_tree().get_nodes_in_group("rewindable"):
        var id := node.get_instance_id()
        if frame.entity_states.has(id):
            var comp := RecordingManager._get_rewindable_component(node)
            if comp:
                comp.apply_snapshot(frame.entity_states[id])

func _set_physics_enabled(enabled: bool) -> void:
    for node: Node in get_tree().get_nodes_in_group("rewindable"):
        if node is CharacterBody3D or node is RigidBody3D:
            node.set_physics_process(enabled)
```

### Slow Motion Replay

```gdscript
# Play last 3 seconds at 0.25x speed for a kill cam
func play_kill_cam() -> void:
    var fps := Engine.physics_ticks_per_second
    var three_seconds_ago := RecordingManager.get_frame_count() - (fps * 3)
    playback_speed = 0.25
    start_playback(max(0, three_seconds_ago))
```

---

## 5. Time-Rewind Mechanics

For games like Braid or Prince of Persia where the player can rewind time in real-time:

```gdscript
class_name TimeRewindController
extends Node

@export var rewind_speed: float = 1.0
@export var max_rewind_energy: float = 5.0  # Seconds of rewind available

var rewind_energy: float = 5.0
var _rewind_frame: int = 0
var is_rewinding: bool = false

signal rewind_started
signal rewind_stopped
signal energy_changed(current: float, max_val: float)

func _physics_process(delta: float) -> void:
    if Input.is_action_pressed("rewind") and rewind_energy > 0.0 and RecordingManager.get_frame_count() > 0:
        if not is_rewinding:
            _start_rewind()
        _process_rewind(delta)
    elif is_rewinding:
        _stop_rewind()
    else:
        # Regenerate energy when not rewinding
        rewind_energy = min(rewind_energy + delta * 0.5, max_rewind_energy)
        energy_changed.emit(rewind_energy, max_rewind_energy)

func _start_rewind() -> void:
    is_rewinding = true
    _rewind_frame = RecordingManager.get_frame_count() - 1
    RecordingManager.state = RecordingManager.State.REWINDING
    
    # Pause forward physics
    _set_physics_enabled(false)
    
    # Visual effect: desaturate, reverse particles
    _apply_rewind_vfx(true)
    rewind_started.emit()

func _process_rewind(delta: float) -> void:
    rewind_energy -= delta * rewind_speed
    energy_changed.emit(rewind_energy, max_rewind_energy)
    
    # Step backward through frames
    var frames_back := int(rewind_speed * Engine.physics_ticks_per_second * delta)
    _rewind_frame = max(0, _rewind_frame - frames_back)
    
    var frame := RecordingManager.get_frame(_rewind_frame)
    if frame:
        _apply_frame_to_world(frame)
    
    # Trim future frames (they no longer exist in this timeline)
    # Optional: keep them for "re-rewind"
    
    if _rewind_frame <= 0 or rewind_energy <= 0.0:
        _stop_rewind()

func _stop_rewind() -> void:
    is_rewinding = false
    RecordingManager.state = RecordingManager.State.RECORDING
    
    # Trim frames after the rewind point
    RecordingManager._frames.resize(_rewind_frame + 1)
    RecordingManager._current_frame = _rewind_frame + 1
    
    _set_physics_enabled(true)
    _apply_rewind_vfx(false)
    rewind_stopped.emit()

func _apply_frame_to_world(frame: ReplayFrameData) -> void:
    for node: Node in get_tree().get_nodes_in_group("rewindable"):
        var id := node.get_instance_id()
        if frame.entity_states.has(id):
            var comp: RewindableComponent = RecordingManager._get_rewindable_component(node)
            if comp:
                comp.apply_snapshot(frame.entity_states[id])

func _apply_rewind_vfx(enabled: bool) -> void:
    # Apply a desaturation shader, reverse particle direction, etc.
    var env: WorldEnvironment = get_tree().current_scene.get_node_or_null("WorldEnvironment")
    if env and env.environment:
        env.environment.adjustment_saturation = 0.3 if enabled else 1.0

func _set_physics_enabled(enabled: bool) -> void:
    for node: Node in get_tree().get_nodes_in_group("rewindable"):
        if node is CharacterBody3D or node is RigidBody3D:
            node.set_physics_process(enabled)
```

### Rewind Energy UI

```gdscript
# Attach to a TextureProgressBar
class_name RewindEnergyBar
extends TextureProgressBar

func _ready() -> void:
    TimeRewindController.energy_changed.connect(_on_energy_changed)

func _on_energy_changed(current: float, max_val: float) -> void:
    value = (current / max_val) * 100.0
```

---

## 6. Input Recording — The Deterministic Approach

For racing games with ghost data or competitive replays where file size matters:

```gdscript
class_name InputFrame
extends RefCounted

var frame_index: int
var actions: Dictionary = {}  # action_name → { pressed: bool, strength: float }
var axis: Vector2 = Vector2.ZERO  # Movement axis

class_name InputRecorder
extends Node

var _frames: Array[InputFrame] = []
var _current_frame: int = 0
var _is_recording: bool = false

## Actions to record — configure per game
@export var tracked_actions: Array[String] = [
    "move_left", "move_right", "move_up", "move_down",
    "jump", "attack", "dash"
]

func start_recording() -> void:
    _frames.clear()
    _current_frame = 0
    _is_recording = true

func _physics_process(_delta: float) -> void:
    if not _is_recording:
        return
    
    var frame := InputFrame.new()
    frame.frame_index = _current_frame
    
    for action in tracked_actions:
        if Input.is_action_pressed(action):
            frame.actions[action] = {
                "pressed": true,
                "strength": Input.get_action_strength(action)
            }
    
    frame.axis = Input.get_vector("move_left", "move_right", "move_up", "move_down")
    
    _frames.append(frame)
    _current_frame += 1

func get_input_at_frame(index: int) -> InputFrame:
    if index >= 0 and index < _frames.size():
        return _frames[index]
    return null
```

### Replaying Inputs

```gdscript
class_name InputReplayer
extends Node

## Override input for a specific node during playback.

var _playback_frame: int = 0
var _target_node: Node
var _recorder: InputRecorder

func start_replay(target: Node, recorder: InputRecorder) -> void:
    _target_node = target
    _recorder = recorder
    _playback_frame = 0

func _physics_process(_delta: float) -> void:
    if not _target_node or not _recorder:
        return
    
    var frame := _recorder.get_input_at_frame(_playback_frame)
    if not frame:
        # Replay finished
        _target_node = null
        return
    
    # Feed recorded inputs to the target's movement system
    if _target_node.has_method("apply_replay_input"):
        _target_node.apply_replay_input(frame.axis, frame.actions)
    
    _playback_frame += 1
```

> **Warning:** Input recording only produces identical results if the physics simulation is **deterministic**. Godot 4.4+ with Jolt physics (default in 4.6) provides improved determinism on a single platform, but cross-platform determinism is not guaranteed. For cross-platform competitive replays, use state recording instead.

---

## 7. Ghost Replay System

Ghosts are state-recorded replays of the player rendered as a translucent duplicate — common in racing and speedrun games:

```gdscript
class_name GhostSystem
extends Node3D

@export var ghost_scene: PackedScene  # Simplified player model
@export var ghost_material: StandardMaterial3D  # Translucent material

var _ghost_instance: Node3D
var _ghost_frames: Array[Dictionary] = []
var _playback_frame: int = 0

func spawn_ghost(recorded_frames: Array[Dictionary]) -> void:
    _ghost_frames = recorded_frames
    _ghost_instance = ghost_scene.instantiate()
    add_child(_ghost_instance)
    
    # Apply translucent material
    _apply_ghost_material(_ghost_instance)
    _playback_frame = 0

func _physics_process(_delta: float) -> void:
    if not _ghost_instance or _playback_frame >= _ghost_frames.size():
        return
    
    var frame := _ghost_frames[_playback_frame]
    _ghost_instance.global_position = frame["position"]
    _ghost_instance.global_rotation = frame["rotation"]
    
    # Interpolate between frames for smoother playback
    if _playback_frame + 1 < _ghost_frames.size():
        var next := _ghost_frames[_playback_frame + 1]
        var weight := 0.5  # Adjust based on sub-frame timing
        _ghost_instance.global_position = frame["position"].lerp(next["position"], weight)
    
    _playback_frame += 1

func _apply_ghost_material(node: Node3D) -> void:
    for child in node.get_children():
        if child is MeshInstance3D:
            var mat := ghost_material.duplicate()
            mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
            mat.albedo_color.a = 0.4
            child.material_override = mat
        if child is Node3D:
            _apply_ghost_material(child)
```

---

## 8. Memory Management

Recording every frame for every entity adds up fast. Strategies to control memory:

### Circular Buffer

Limit recording to the last N seconds (already shown in `RecordingManager.max_frames`).

### Delta Compression

Only store values that changed since the last frame:

```gdscript
func _capture_frame_delta(prev_frame: ReplayFrameData) -> ReplayFrameData:
    var frame := ReplayFrameData.new()
    frame.frame_index = _current_frame
    
    for node: Node in get_tree().get_nodes_in_group("rewindable"):
        var id := node.get_instance_id()
        var comp := _get_rewindable_component(node)
        if not comp:
            continue
        
        var snapshot := comp.get_snapshot()
        
        # Only store if position changed by more than threshold
        if prev_frame and prev_frame.entity_states.has(id):
            var prev := prev_frame.entity_states[id]
            var pos_delta: float
            if snapshot["position"] is Vector3:
                pos_delta = snapshot["position"].distance_to(prev["position"])
            else:
                pos_delta = (snapshot["position"] as Vector2).distance_to(prev["position"])
            
            if pos_delta < 0.001:
                continue  # Skip — nothing meaningful changed
        
        frame.entity_states[id] = snapshot
    
    return frame
```

### Keyframe + Interpolation

Store full snapshots every Nth frame; interpolate between them:

```gdscript
const KEYFRAME_INTERVAL := 10  # Full snapshot every 10 frames

func _capture_frame() -> void:
    if _current_frame % KEYFRAME_INTERVAL == 0:
        _capture_full_frame()
    else:
        _capture_frame_delta(_frames.back())
```

---

## 9. Serialization and Replay Files

Save replays to disk for sharing or leaderboards:

```gdscript
class_name ReplaySerializer

static func save_replay(frames: Array[ReplayFrameData], path: String) -> Error:
    var file := FileAccess.open(path, FileAccess.WRITE)
    if not file:
        return FileAccess.get_open_error()
    
    # Header
    file.store_string("REPLAY")
    file.store_32(1)  # Version
    file.store_32(frames.size())
    file.store_32(Engine.physics_ticks_per_second)
    
    # Frames
    for frame in frames:
        file.store_32(frame.frame_index)
        file.store_float(frame.timestamp)
        file.store_32(frame.entity_states.size())
        
        for entity_id: int in frame.entity_states:
            var snap: Dictionary = frame.entity_states[entity_id]
            file.store_64(entity_id)
            file.store_var(snap, true)  # full_objects = true
    
    return OK

static func load_replay(path: String) -> Array[ReplayFrameData]:
    var frames: Array[ReplayFrameData] = []
    var file := FileAccess.open(path, FileAccess.READ)
    if not file:
        return frames
    
    var magic := file.get_buffer(6).get_string_from_ascii()
    if magic != "REPLAY":
        push_error("Invalid replay file")
        return frames
    
    var version := file.get_32()
    var frame_count := file.get_32()
    var tick_rate := file.get_32()
    
    for i in frame_count:
        var frame := ReplayFrameData.new()
        frame.frame_index = file.get_32()
        frame.timestamp = file.get_float()
        var entity_count := file.get_32()
        
        for j in entity_count:
            var entity_id := file.get_64()
            var snap: Dictionary = file.get_var(true)
            frame.entity_states[entity_id] = snap
        
        frames.append(frame)
    
    return frames
```

> **Tip:** For smaller files, compress the replay data with `FileAccess.open_compressed()` using `FileAccess.COMPRESSION_ZSTD`.

---

## 10. C# Examples

### State Recording in C#

```csharp
using Godot;
using System.Collections.Generic;

public partial class RecordingManager : Node
{
    [Export] public int MaxFrames { get; set; } = 18000;
    
    private List<FrameData> _frames = new();
    private int _currentFrame = 0;
    private bool _isRecording = false;
    
    public void StartRecording()
    {
        _frames.Clear();
        _currentFrame = 0;
        _isRecording = true;
    }
    
    public override void _PhysicsProcess(double delta)
    {
        if (!_isRecording) return;
        CaptureFrame();
    }
    
    private void CaptureFrame()
    {
        var frame = new FrameData
        {
            FrameIndex = _currentFrame,
            Timestamp = Time.GetTicksMsec() / 1000.0f
        };
        
        foreach (Node node in GetTree().GetNodesInGroup("rewindable"))
        {
            var comp = node.GetNodeOrNull<RewindableComponent>("RewindableComponent");
            if (comp != null)
            {
                frame.EntityStates[node.GetInstanceId()] = comp.GetSnapshot();
            }
        }
        
        _frames.Add(frame);
        if (_frames.Count > MaxFrames)
            _frames.RemoveAt(0);
        
        _currentFrame++;
    }
    
    public FrameData GetFrame(int index) =>
        index >= 0 && index < _frames.Count ? _frames[index] : null;
    
    public int FrameCount => _frames.Count;
}

public class FrameData
{
    public int FrameIndex;
    public float Timestamp;
    public Dictionary<ulong, Dictionary<string, Variant>> EntityStates = new();
}
```

### Time Rewind in C#

```csharp
public partial class TimeRewindController : Node
{
    [Signal] public delegate void RewindStartedEventHandler();
    [Signal] public delegate void RewindStoppedEventHandler();
    
    [Export] public float MaxRewindEnergy { get; set; } = 5.0f;
    
    private float _rewindEnergy;
    private int _rewindFrame;
    private bool _isRewinding = false;
    
    public override void _Ready()
    {
        _rewindEnergy = MaxRewindEnergy;
    }
    
    public override void _PhysicsProcess(double delta)
    {
        if (Input.IsActionPressed("rewind") && _rewindEnergy > 0)
        {
            if (!_isRewinding) StartRewind();
            ProcessRewind((float)delta);
        }
        else if (_isRewinding)
        {
            StopRewind();
        }
    }
    
    private void StartRewind()
    {
        _isRewinding = true;
        _rewindFrame = RecordingManager.Instance.FrameCount - 1;
        EmitSignal(SignalName.RewindStarted);
    }
    
    private void ProcessRewind(float delta)
    {
        _rewindEnergy -= delta;
        int framesBack = (int)(Engine.PhysicsTicksPerSecond * delta);
        _rewindFrame = Mathf.Max(0, _rewindFrame - framesBack);
        
        var frame = RecordingManager.Instance.GetFrame(_rewindFrame);
        if (frame != null)
            ApplyFrameToWorld(frame);
    }
    
    private void StopRewind()
    {
        _isRewinding = false;
        EmitSignal(SignalName.RewindStopped);
    }
    
    private void ApplyFrameToWorld(FrameData frame) { /* same as GDScript */ }
}
```

---

## 11. Common Pitfalls

**Using instance IDs across sessions.** `get_instance_id()` is unique per run but changes every time the game starts. For replay files that need to work across sessions, use stable identifiers (node paths, or custom IDs assigned at spawn).

**Non-deterministic physics breaking input replays.** Floating-point differences, varying frame rates, or physics engine non-determinism can cause input-based replays to diverge. Lock the physics tick rate (`Engine.physics_ticks_per_second`) and test thoroughly. Prefer state recording if cross-platform support matters.

**Recording too many entities.** Only record entities that matter for replay. Static environment, particles, and HUD elements don't need snapshots. Use the `rewindable` group selectively.

**Forgetting to disable physics during playback.** If physics is still running while you apply snapshot positions, the physics engine will fight your overrides. Disable `_physics_process` on recorded entities during playback.

**Memory leaks with unbounded recording.** Always use a circular buffer with `max_frames`. At 60 FPS with 50 entities, each storing ~100 bytes, that's ~300 KB/second. Five minutes = ~90 MB. Budget accordingly.

**Not handling spawned/despawned entities.** Entities that spawn or despawn mid-recording need special handling. Record spawn events (with prefab path and initial state) and despawn events so playback can instantiate and remove nodes.

---

*Next steps:* [G43 Rollback Netcode](./G43_rollback_netcode.md) for multiplayer state synchronization · [G11 Save & Load Systems](./G11_save_load_systems.md) for serialization patterns · [G18 Performance Profiling](./G18_performance_profiling.md) for measuring replay system overhead
