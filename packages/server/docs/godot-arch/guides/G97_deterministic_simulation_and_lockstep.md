# G97 — Deterministic Simulation & Lockstep Multiplayer

> **Category:** guide · **Engine:** Godot 4.x · **Related:** [G43 Rollback Netcode](./G43_rollback_netcode.md) · [G72 Multiplayer State Sync & Prediction](./G72_multiplayer_state_sync_and_prediction.md) · [G86 Multiplayer Security & Authority](./G86_multiplayer_security_and_authority.md) · [G23 Advanced Physics](./G23_advanced_physics.md) · [G34 Threading & Async](./G34_threading_and_async.md)

Deterministic simulation ensures that given identical inputs, every client produces byte-identical game state — enabling lockstep multiplayer where only inputs are networked instead of full state. This guide covers the theory, Godot-specific challenges (floating-point, physics engines, node ordering), practical fixed-point and integer math patterns, Jolt determinism guarantees in 4.6+, and building a complete lockstep networking layer in GDScript and C#.

---

## Table of Contents

1. [Why Deterministic Simulation](#1-why-deterministic-simulation)
2. [Lockstep vs State Sync vs Rollback](#2-lockstep-vs-state-sync-vs-rollback)
3. [Sources of Non-Determinism in Godot](#3-sources-of-non-determinism-in-godot)
4. [Fixed-Point Math in GDScript](#4-fixed-point-math-in-gdscript)
5. [Fixed-Point Math in C#](#5-fixed-point-math-in-c)
6. [Deterministic Game Loop](#6-deterministic-game-loop)
7. [Jolt Physics Determinism (4.6+)](#7-jolt-physics-determinism-46)
8. [Avoiding Engine-Level Non-Determinism](#8-avoiding-engine-level-non-determinism)
9. [Input Collection & Serialization](#9-input-collection--serialization)
10. [Lockstep Networking Architecture](#10-lockstep-networking-architecture)
11. [Checksum Validation & Desync Detection](#11-checksum-validation--desync-detection)
12. [Replay Systems](#12-replay-systems)
13. [Performance Considerations](#13-performance-considerations)
14. [Common Mistakes](#14-common-mistakes)

---

## 1. Why Deterministic Simulation

In a deterministic simulation, the same initial state plus the same sequence of inputs always produces the same result — across machines, across runs. This is foundational for:

- **Lockstep multiplayer** — send only inputs (bytes per frame), not full state (kilobytes per frame). Ideal for RTS, turn-based strategy, fighting games, and simulations with many entities.
- **Replay systems** — store inputs only; replay regenerates the entire match.
- **Anti-cheat** — server re-simulates from inputs to verify client state.
- **Competitive integrity** — all players see identical outcomes.

The tradeoff: determinism constrains how you write game logic. You cannot use `randf()` freely, must avoid floating-point where precision matters, and must control execution order carefully.

---

## 2. Lockstep vs State Sync vs Rollback

| Approach | Bandwidth | Latency Feel | Complexity | Best For |
|----------|-----------|-------------|------------|----------|
| **Lockstep** | Very low (inputs only) | High (waits for slowest) | Medium | RTS, turn-based, 2-8 players |
| **State Sync** | High (full state) | Low (server authority) | Low | FPS, open world, many players |
| **Rollback** | Low (inputs + corrections) | Low (predict locally) | High | Fighting games, 1v1, 2v2 |

Lockstep is the simplest deterministic approach: every client runs the same simulation tick, waits for all inputs, then advances. It scales well with entity count (bandwidth is per-player, not per-entity) but poorly with player count and latency.

---

## 3. Sources of Non-Determinism in Godot

Before building deterministic logic, understand what breaks it:

### Floating-Point Arithmetic

IEEE 754 floating-point is **not** associative: `(a + b) + c != a + (b + c)` in edge cases. Different compilers, optimization levels, and platforms may evaluate expressions in different orders.

```gdscript
# These can produce different results on different platforms:
var a := 0.1 + 0.2 + 0.3
var b := 0.1 + (0.2 + 0.3)
# a != b in some cases
```

### Node Processing Order

`_process()` and `_physics_process()` visit nodes in tree order, but adding/removing nodes mid-frame can shift ordering between clients if not done identically.

### Random Number Generation

`randf()` and `randi()` use a global RNG. If any non-deterministic code calls it, all subsequent values diverge.

### Dictionary Iteration Order

In GDScript, `Dictionary` iteration order is insertion order — but if two clients insert keys in different orders (e.g., from network packets arriving differently), iteration diverges.

### Engine Internals

- Physics engines use floating-point internally
- `NavigationServer` pathfinding results may vary
- Audio callbacks and visual-only code can accidentally affect game state

---

## 4. Fixed-Point Math in GDScript

Fixed-point math represents fractional values as scaled integers. A common choice is **Q16.16** (16 bits integer, 16 bits fraction), giving ±32767 range with 1/65536 precision.

```gdscript
## fixed_point.gd — Fixed-point math utilities (Q16.16)
class_name FixedPoint

const SHIFT := 16
const ONE := 1 << SHIFT          # 65536
const HALF := 1 << (SHIFT - 1)   # 32768

## Convert float to fixed-point (use only at boundaries — input, display)
static func from_float(value: float) -> int:
    return roundi(value * ONE)

## Convert fixed-point back to float (use only for rendering)
static func to_float(fixed: int) -> float:
    return float(fixed) / float(ONE)

## Multiply two fixed-point values
static func mul(a: int, b: int) -> int:
    # Use 64-bit intermediate to avoid overflow
    # GDScript int is 64-bit, so this is safe for Q16.16
    return (a * b) >> SHIFT

## Divide two fixed-point values
static func div(a: int, b: int) -> int:
    return (a << SHIFT) / b

## Fixed-point square root (integer Newton's method)
static func sqrt(value: int) -> int:
    if value <= 0:
        return 0
    # Initial guess
    var guess := value
    var result := (guess + FixedPoint.div(value, guess)) >> 1
    for i in range(16):  # 16 iterations is more than enough
        result = (result + FixedPoint.div(value, result)) >> 1
    return result

## Fixed-point distance between two points
static func distance(x1: int, y1: int, x2: int, y2: int) -> int:
    var dx := x2 - x1
    var dy := y2 - y1
    return sqrt(mul(dx, dx) + mul(dy, dy))

## Deterministic "random" using a seeded LCG
## Returns value in [0, ONE) range
static func seeded_random(seed_ref: Array) -> int:
    # Linear Congruential Generator (same constants as glibc)
    seed_ref[0] = (seed_ref[0] * 1103515245 + 12345) & 0x7FFFFFFF
    return (seed_ref[0] >> 15) & 0xFFFF  # Returns 0..65535 (Q16.16 fractional)
```

### Usage Pattern

```gdscript
## Entity positions stored as fixed-point
var pos_x: int = FixedPoint.from_float(100.0)
var pos_y: int = FixedPoint.from_float(200.0)
var speed: int = FixedPoint.from_float(5.0)

## Deterministic movement (called in _physics_process)
func deterministic_move(dir_x: int, dir_y: int) -> void:
    pos_x += FixedPoint.mul(dir_x, speed)
    pos_y += FixedPoint.mul(dir_y, speed)

## Convert to float only for rendering
func _process(_delta: float) -> void:
    position.x = FixedPoint.to_float(pos_x)
    position.y = FixedPoint.to_float(pos_y)
```

---

## 5. Fixed-Point Math in C\#

C# gives you access to `long` (64-bit) and structs, making fixed-point cleaner:

```csharp
using Godot;

/// <summary>
/// Q16.16 fixed-point number stored as a 32-bit integer.
/// Use long intermediates for multiplication to prevent overflow.
/// </summary>
public readonly struct Fixed : System.IEquatable<Fixed>, System.IComparable<Fixed>
{
    public const int Shift = 16;
    public const int One = 1 << Shift;
    public const int Half = 1 << (Shift - 1);

    public readonly int Raw;

    private Fixed(int raw) => Raw = raw;

    public static Fixed FromRaw(int raw) => new Fixed(raw);
    public static Fixed FromFloat(float value) => new Fixed((int)(value * One));
    public static Fixed FromInt(int value) => new Fixed(value << Shift);
    public float ToFloat() => (float)Raw / One;

    // Arithmetic operators using long intermediates
    public static Fixed operator +(Fixed a, Fixed b) => new Fixed(a.Raw + b.Raw);
    public static Fixed operator -(Fixed a, Fixed b) => new Fixed(a.Raw - b.Raw);
    public static Fixed operator *(Fixed a, Fixed b) =>
        new Fixed((int)(((long)a.Raw * b.Raw) >> Shift));
    public static Fixed operator /(Fixed a, Fixed b) =>
        new Fixed((int)(((long)a.Raw << Shift) / b.Raw));
    public static Fixed operator -(Fixed a) => new Fixed(-a.Raw);

    // Comparison
    public static bool operator ==(Fixed a, Fixed b) => a.Raw == b.Raw;
    public static bool operator !=(Fixed a, Fixed b) => a.Raw != b.Raw;
    public static bool operator <(Fixed a, Fixed b) => a.Raw < b.Raw;
    public static bool operator >(Fixed a, Fixed b) => a.Raw > b.Raw;

    public bool Equals(Fixed other) => Raw == other.Raw;
    public int CompareTo(Fixed other) => Raw.CompareTo(other.Raw);
    public override bool Equals(object obj) => obj is Fixed f && Equals(f);
    public override int GetHashCode() => Raw;
    public override string ToString() => ToFloat().ToString("F4");

    /// <summary>
    /// Integer square root via Newton's method. Fully deterministic.
    /// </summary>
    public static Fixed Sqrt(Fixed value)
    {
        if (value.Raw <= 0) return FromRaw(0);
        long v = (long)value.Raw << Shift; // Scale up for precision
        long guess = v;
        long result = (guess + v / guess) >> 1;
        for (int i = 0; i < 16; i++)
            result = (result + v / result) >> 1;
        return FromRaw((int)result);
    }
}
```

### Usage in a Godot Node

```csharp
using Godot;

public partial class DeterministicEntity : Node2D
{
    // Game state: fixed-point (deterministic)
    private Fixed _posX;
    private Fixed _posY;
    private Fixed _speed = Fixed.FromFloat(5.0f);

    // Deterministic tick — called from lockstep manager, NOT _PhysicsProcess
    public void SimulationTick(Fixed dirX, Fixed dirY)
    {
        _posX += dirX * _speed;
        _posY += dirY * _speed;
    }

    // Rendering only — converts fixed to float for display
    public override void _Process(double delta)
    {
        Position = new Vector2(_posX.ToFloat(), _posY.ToFloat());
    }
}
```

---

## 6. Deterministic Game Loop

Separate simulation from rendering. The simulation runs at a fixed tick rate driven by lockstep, not by `_physics_process`:

```gdscript
## lockstep_manager.gd — Drives deterministic simulation
class_name LockstepManager
extends Node

signal tick_completed(tick_number: int)

const TICK_RATE := 20  # Simulation ticks per second
const TICK_DURATION_MS := 1000 / TICK_RATE

var current_tick: int = 0
var simulation_running: bool = false
var _rng_seed: Array = [42]  # Deterministic seed shared by all clients

## All entities register here for deterministic processing
var _entities: Array[Node] = []

## Input buffer: tick_number -> Dictionary[peer_id, InputFrame]
var _input_buffer: Dictionary[int, Dictionary] = {}

func register_entity(entity: Node) -> void:
    _entities.append(entity)
    # Sort by a stable key to guarantee processing order
    _entities.sort_custom(func(a: Node, b: Node) -> bool:
        return a.name.naturalnocasecmp_to(b.name) < 0
    )

func unregister_entity(entity: Node) -> void:
    _entities.erase(entity)

## Called when all inputs for a tick are received
func advance_tick() -> void:
    if not _input_buffer.has(current_tick):
        return  # Still waiting for inputs

    var inputs: Dictionary = _input_buffer[current_tick]

    # Process all entities in deterministic order
    for entity in _entities:
        if entity.has_method("simulation_tick"):
            entity.simulation_tick(current_tick, inputs, _rng_seed)

    current_tick += 1
    tick_completed.emit(current_tick)
```

### Key Rules

1. **Never use `_physics_process` for game logic** — it is tied to the engine's frame rate, not your lockstep tick.
2. **Sort entities deterministically** — use stable IDs, not insertion order.
3. **Shared RNG seed** — pass it through every call; never use global `randf()`.
4. **No delta time** — each tick represents a fixed time step. Movement = speed × 1, not speed × delta.

---

## 7. Jolt Physics Determinism (4.6+)

Godot 4.6 makes Jolt the default 3D physics engine. Jolt provides **single-build determinism**: the same binary with the same inputs produces identical results.

### What Jolt Guarantees

- Same Godot version + same platform + same inputs = same physics results
- Body insertion order matters — add bodies in the same order on all clients
- Contact pair ordering is deterministic within a single build

### What Jolt Does NOT Guarantee

- Cross-platform determinism (x86 vs ARM may differ)
- Cross-version determinism (Godot 4.6.0 vs 4.6.1 may update Jolt)
- Determinism across debug vs release builds

### Practical Approach

```gdscript
## For lockstep with Jolt: pin your Godot version exactly.
## Use Jolt for 3D physics but validate with checksums every N ticks.

func _ready() -> void:
    # Verify all clients run the same engine build
    var engine_hash := Engine.get_version_info().hash
    # Send engine_hash to server for validation during handshake

## If you need cross-platform determinism, skip Jolt entirely:
## - Use fixed-point math for your own collision detection
## - Or use a GDExtension wrapping a deterministic physics lib
```

### 2D Games — Custom Collision

For 2D lockstep games, it is often simpler to bypass Godot physics entirely and use integer-based AABB or circle collision:

```gdscript
## Integer AABB collision — fully deterministic, no floats
static func aabb_overlaps(
    ax: int, ay: int, aw: int, ah: int,
    bx: int, by: int, bw: int, bh: int
) -> bool:
    return (ax < bx + bw and ax + aw > bx and
            ay < by + bh and ay + ah > by)

## Integer circle collision
static func circles_overlap(
    ax: int, ay: int, ar: int,
    bx: int, by: int, br: int
) -> bool:
    var dx := ax - bx
    var dy := ay - by
    var dist_sq := dx * dx + dy * dy
    var radii := ar + br
    return dist_sq < radii * radii
```

---

## 8. Avoiding Engine-Level Non-Determinism

### Dictionary Ordering

```gdscript
## BAD — dictionary iteration order depends on insertion order
for key in some_dict:
    process(key)

## GOOD — sort keys for deterministic iteration
var sorted_keys := some_dict.keys()
sorted_keys.sort()
for key in sorted_keys:
    process(key)
```

### Signal Ordering

Signals fire in connection order. If two clients connect signals in different orders, callbacks execute differently.

```gdscript
## GOOD — connect signals in _ready() with deterministic ordering,
## or don't rely on signal order for game state changes.
## Use the lockstep tick to process events instead.
```

### Node Tree Modifications

```gdscript
## BAD — adding nodes mid-tick changes processing order
func simulation_tick(_tick: int, _inputs: Dictionary, _rng: Array) -> void:
    var bullet := bullet_scene.instantiate()
    add_child(bullet)  # Changes tree order immediately

## GOOD — queue additions, apply between ticks
var _pending_adds: Array[Node] = []

func simulation_tick(_tick: int, _inputs: Dictionary, _rng: Array) -> void:
    var bullet := bullet_scene.instantiate()
    _pending_adds.append(bullet)

func apply_pending() -> void:
    for node in _pending_adds:
        add_child(node)
        lockstep_manager.register_entity(node)
    _pending_adds.clear()
```

---

## 9. Input Collection & Serialization

Keep input frames small and serializable:

```gdscript
## input_frame.gd — Compact input representation
class_name InputFrame

## Pack inputs into a single integer (bitfield)
## Bit 0: up, 1: down, 2: left, 3: right, 4: action1, 5: action2
var buttons: int = 0

## Analog stick as fixed-point Q8.8 (-128..127 range)
var aim_x: int = 0
var aim_y: int = 0

func serialize() -> PackedByteArray:
    var buf := PackedByteArray()
    buf.resize(5)
    buf.encode_u8(0, buttons)
    buf.encode_s16(1, aim_x)
    buf.encode_s16(3, aim_y)
    return buf

static func deserialize(buf: PackedByteArray) -> InputFrame:
    var frame := InputFrame.new()
    frame.buttons = buf.decode_u8(0)
    frame.aim_x = buf.decode_s16(1)
    frame.aim_y = buf.decode_s16(3)
    return frame

## Helper accessors
func is_pressed(bit: int) -> bool:
    return (buttons & (1 << bit)) != 0

const UP := 0
const DOWN := 1
const LEFT := 2
const RIGHT := 3
const ACTION1 := 4
const ACTION2 := 5
```

---

## 10. Lockstep Networking Architecture

```
Tick N:
  Client A: collect input → broadcast to all peers
  Client B: collect input → broadcast to all peers
  Both wait until inputs from ALL peers for tick N are received
  Both advance simulation with identical inputs
  Tick N+1 begins
```

```gdscript
## lockstep_network.gd — Peer-to-peer lockstep coordination
extends Node

var _local_peer_id: int
var _peer_ids: Array[int] = []
var _lockstep: LockstepManager

## Buffer of received inputs: tick -> { peer_id: InputFrame }
var _received_inputs: Dictionary[int, Dictionary] = {}

## How many ticks ahead we allow local input to buffer
const INPUT_DELAY := 2

func _ready() -> void:
    multiplayer.peer_connected.connect(_on_peer_connected)
    multiplayer.peer_disconnected.connect(_on_peer_disconnected)
    _local_peer_id = multiplayer.get_unique_id()

func send_input(tick: int, input_frame: InputFrame) -> void:
    var data := input_frame.serialize()
    # Broadcast to all peers (reliable, ordered)
    _send_input_rpc.rpc(tick, data)
    # Also store locally
    _store_input(tick, _local_peer_id, input_frame)

@rpc("any_peer", "reliable", "call_local")
func _send_input_rpc(tick: int, data: PackedByteArray) -> void:
    var sender := multiplayer.get_remote_sender_id()
    var frame := InputFrame.deserialize(data)
    _store_input(tick, sender, frame)

func _store_input(tick: int, peer_id: int, frame: InputFrame) -> void:
    if not _received_inputs.has(tick):
        _received_inputs[tick] = {}
    _received_inputs[tick][peer_id] = frame
    _try_advance()

func _try_advance() -> void:
    var tick := _lockstep.current_tick
    if not _received_inputs.has(tick):
        return
    var inputs: Dictionary = _received_inputs[tick]
    # Check we have inputs from ALL peers
    for peer_id in _peer_ids:
        if not inputs.has(peer_id):
            return  # Still waiting
    # All inputs received — advance
    _lockstep._input_buffer[tick] = inputs
    _lockstep.advance_tick()
    # Clean up old input data
    _received_inputs.erase(tick - 10)

func _on_peer_connected(id: int) -> void:
    _peer_ids.append(id)
    _peer_ids.sort()

func _on_peer_disconnected(id: int) -> void:
    _peer_ids.erase(id)
```

---

## 11. Checksum Validation & Desync Detection

Even with deterministic code, bugs happen. Validate state periodically:

```gdscript
## checksum.gd — CRC32-based state validation
class_name SimChecksum

## Generate a checksum of all entity positions
static func compute(entities: Array[Node]) -> int:
    var data := PackedByteArray()
    for entity in entities:
        if entity.has_method("get_deterministic_state"):
            data.append_array(entity.get_deterministic_state())
    return data.hash()

## Example entity implementation
## In your game entity script:
func get_deterministic_state() -> PackedByteArray:
    var buf := PackedByteArray()
    buf.resize(12)
    buf.encode_s32(0, pos_x)   # Fixed-point X
    buf.encode_s32(4, pos_y)   # Fixed-point Y
    buf.encode_s32(8, health)  # Integer health
    return buf
```

```gdscript
## In lockstep_manager.gd — validate every 60 ticks (~3 seconds at 20 Hz)
func advance_tick() -> void:
    # ... process tick ...
    if current_tick % 60 == 0:
        var checksum := SimChecksum.compute(_entities)
        _broadcast_checksum(current_tick, checksum)

func _on_checksum_received(tick: int, peer_id: int, remote_checksum: int) -> void:
    var local_checksum := _checksum_history.get(tick, -1)
    if local_checksum != -1 and local_checksum != remote_checksum:
        push_error("DESYNC at tick %d! Local: %x Remote (peer %d): %x" %
            [tick, local_checksum, peer_id, remote_checksum])
        desync_detected.emit(tick, peer_id)
```

---

## 12. Replay Systems

With deterministic simulation, replays are trivial — store the initial state + all input frames:

```gdscript
## replay_recorder.gd
class_name ReplayRecorder

var _initial_seed: int
var _frames: Array[Dictionary] = []  # Array of { tick: int, inputs: Dictionary }

func start_recording(seed: int) -> void:
    _initial_seed = seed
    _frames.clear()

func record_tick(tick: int, inputs: Dictionary) -> void:
    _frames.append({ "tick": tick, "inputs": inputs })

func save_replay(path: String) -> Error:
    var data := {
        "version": 1,
        "seed": _initial_seed,
        "tick_count": _frames.size(),
        "frames": _frames,
    }
    var file := FileAccess.open(path, FileAccess.WRITE)
    if file == null:
        return FileAccess.get_open_error()
    file.store_var(data)
    return OK

static func load_replay(path: String) -> Dictionary:
    var file := FileAccess.open(path, FileAccess.READ)
    if file == null:
        return {}
    return file.get_var()
```

Replay file sizes are tiny: 5 bytes/frame × 20 Hz × 600 seconds = **60 KB for a 10-minute match**.

---

## 13. Performance Considerations

- **Tick rate** — 10-20 Hz is typical for lockstep. Higher rates increase input bandwidth linearly.
- **Input delay** — buffer 2-3 ticks of local input to mask network jitter without stalling.
- **Catchup** — if a client falls behind, run multiple simulation ticks per frame (skip rendering).
- **Fixed-point overhead** — integer math is fast; the main cost is the discipline of avoiding floats, not CPU time.
- **Entity count** — lockstep scales with entity count on CPU (all clients simulate everything) but NOT on bandwidth (only inputs are sent).

---

## 14. Common Mistakes

| Mistake | Why It Breaks | Fix |
|---------|--------------|-----|
| Using `randf()` / `randi()` | Global RNG state diverges if any non-deterministic code calls it | Use a dedicated seeded RNG passed through simulation |
| `_physics_process` for game logic | Tied to engine frame rate, not lockstep tick | Drive simulation from your own tick manager |
| Float positions in game state | Cross-platform float differences | Fixed-point integers for all game state |
| Unsorted dictionary iteration | Insertion-order dependency | Sort keys before iterating |
| Adding nodes mid-tick | Changes processing order | Queue additions, apply between ticks |
| Using `Time.get_ticks_msec()` in logic | Wall clock differs between machines | Use tick number as your time reference |
| Forgetting to pin Godot version | Jolt/physics internals change between versions | Lock engine version in `project.godot` and CI |
