# G43 — Rollback Netcode & Deterministic Multiplayer

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#
> **Related:** [G13 Networking & Multiplayer](./G13_networking_and_multiplayer.md) · [G27 Dedicated Servers & Advanced Networking](./G27_dedicated_servers_advanced_networking.md) · [G5 Physics & Collision](./G5_physics_and_collision.md) · [G34 Threading & Async](./G34_threading_and_async.md)

---

## What This Guide Covers

Rollback netcode is the gold standard for responsive online multiplayer in action games — fighting games, platformers, shooters, and any genre where input latency destroys the experience. Unlike delay-based netcode (which pauses to wait for remote inputs), rollback predicts what remote players will do, simulates ahead, and corrects by "rolling back" to the last confirmed state when a prediction is wrong.

This guide covers the theory behind rollback and prediction, how to integrate the two major Godot rollback addons (Snopek's Godot Rollback Netcode and Delta Rollback), building deterministic game logic, state serialization, input handling, debugging mismatches, and production considerations.

**Use this guide when:** you're building an online multiplayer game that requires responsive controls (fighting games, co-op action, competitive platformers), or you need client-side prediction with authoritative state reconciliation.

---

## Table of Contents

1. [Why Rollback Over Delay-Based](#1-why-rollback-over-delay-based)
2. [How Rollback Works](#2-how-rollback-works)
3. [Choosing an Addon](#3-choosing-an-addon)
4. [Setting Up Godot Rollback Netcode (Snopek)](#4-setting-up-godot-rollback-netcode-snopek)
5. [Core Concepts: SyncManager, Ticks, and Input](#5-core-concepts-syncmanager-ticks-and-input)
6. [State Serialization](#6-state-serialization)
7. [Deterministic Game Logic](#7-deterministic-game-logic)
8. [Input Prediction and Misprediction](#8-input-prediction-and-misprediction)
9. [Input Delay and Interpolation](#9-input-delay-and-interpolation)
10. [Spawning and Despawning](#10-spawning-and-despawning)
11. [Timers, Animation, and Sound](#11-timers-animation-and-sound)
12. [Debugging Mismatches](#12-debugging-mismatches)
13. [Delta Rollback (Alternative Addon)](#13-delta-rollback-alternative-addon)
14. [Production Considerations](#14-production-considerations)
15. [C# Equivalents](#15-c-equivalents)
16. [Common Mistakes](#16-common-mistakes)

---

## 1. Why Rollback Over Delay-Based

Delay-based netcode waits for all remote inputs before advancing a frame. At 60 FPS with 100ms round-trip latency, that's 6 frames of built-in input delay — unacceptable for fast-paced games.

| Approach | Input Feel | Visual Artifacts | Complexity |
|----------|-----------|-----------------|------------|
| **Delay-based** | Sluggish at >50ms RTT | None | Low |
| **Rollback** | Local-feeling inputs | Brief visual corrections on misprediction | High |
| **Server-authoritative with CSP** | Near-local | Rubber-banding on correction | Medium-High |

Rollback simulates the local player's inputs immediately (zero perceived delay for your own character), predicts remote inputs (usually "same as last frame"), and re-simulates if predictions were wrong. The player only sees a brief visual "pop" when corrections happen — much better than constant input lag.

**When rollback is overkill:** Turn-based games, slow-paced simulations, or games where 3–6 frames of input delay is acceptable. Use Godot's built-in `MultiplayerSynchronizer` with delay-based or simple server-authoritative networking instead.

---

## 2. How Rollback Works

The rollback loop runs every network tick (typically synced to physics frames):

```
1. Gather local input for tick T
2. Send local input to all peers
3. Predict remote inputs for tick T (copy last confirmed input)
4. Simulate tick T with local + predicted inputs
5. When remote input for tick T-N arrives:
   a. If prediction was correct → do nothing
   b. If prediction was wrong → 
      - Load saved state from tick T-N
      - Replay ticks T-N through T with corrected inputs
      - Update display
6. Save state snapshot for current tick
```

**Key insight:** The game must be able to save its entire state, load a previous state, and re-simulate multiple ticks in a single frame. This is why determinism matters — the same inputs must always produce the same state.

---

## 3. Choosing an Addon

Godot has no built-in rollback support. Two community addons fill this gap:

### Godot Rollback Netcode (by Snopek Games)

- **Repository:** [gitlab.com/snopek-games/godot-rollback-netcode](https://gitlab.com/snopek-games/godot-rollback-netcode)
- **Asset Library:** [Godot Rollback Netcode (Godot 4)](https://godotengine.org/asset-library/asset/2450)
- **License:** MIT
- **Features:** Full rollback + prediction, `SyncManager` singleton, `NetworkTimer`, `NetworkAnimationPlayer`, `NetworkRandomNumberGenerator`, Log Inspector debugging tool, input serialization, hash-based mismatch detection
- **Maturity:** Battle-tested, extensive tutorial series, used in shipped games
- **Best for:** Most projects; comprehensive feature set

### Delta Rollback (by BimDav)

- **Asset Library:** [Delta Rollback](https://godotengine.org/asset-library/asset/3107)
- **License:** MIT
- **Focus:** Performance-optimized rollback using delta state (only saves what changed)
- **Best for:** Games with large state that would be expensive to fully serialize every tick

**Recommendation:** Start with Snopek's addon. It has better documentation, a tutorial series, and handles edge cases (timers, animations, sounds) that Delta Rollback leaves to you.

---

## 4. Setting Up Godot Rollback Netcode (Snopek)

### Installation

1. Download from the Asset Library or clone the repo
2. Copy `addons/godot-rollback-netcode/` into your project's `addons/` directory
3. Enable the plugin in **Project → Project Settings → Plugins**
4. The `SyncManager` autoload is registered automatically

### Project Configuration

```gdscript
# In Project Settings → Autoload, verify SyncManager is listed
# Configure in Project Settings → Godot Rollback Netcode:
#   - Max Buffer Size: 20 (ticks of state history to keep)
#   - Max Input Frames Ahead: 5
#   - Input Delay: 0-2 (frames of intentional input delay)
```

### Network Layer

The addon works on top of Godot's `MultiplayerPeer`. Set up your lobby/connection first:

```gdscript
# Host
var peer := ENetMultiplayerPeer.new()
peer.create_server(7000, 2)
multiplayer.multiplayer_peer = peer

# Client
var peer := ENetMultiplayerPeer.new()
peer.create_client("127.0.0.1", 7000)
multiplayer.multiplayer_peer = peer
```

Once peers are connected, start the rollback session:

```gdscript
func _on_all_players_connected() -> void:
    SyncManager.start()

func _on_game_ended() -> void:
    SyncManager.stop()
```

---

## 5. Core Concepts: SyncManager, Ticks, and Input

### SyncManager

The `SyncManager` singleton drives the rollback loop. Key properties:

| Property | Description |
|----------|-------------|
| `current_tick` | The tick being executed (updates during rollback re-simulation) |
| `input_tick` | The tick gathering local input for (ahead of `current_tick` when input delay > 0) |
| `started` | Whether the rollback session is active |

### Virtual Methods

Nodes participating in rollback implement these methods:

```gdscript
extends CharacterBody2D

# Called every rollback tick to gather this node's input
func _get_local_input() -> Dictionary:
    # Only called on the local player's node
    var input := {}
    if Input.is_action_pressed("move_right"):
        input["right"] = true
    if Input.is_action_pressed("move_left"):
        input["left"] = true
    if Input.is_action_just_pressed("jump"):
        input["jump"] = true
    return input

# Called every rollback tick to predict remote input
func _predict_remote_input(previous_input: Dictionary, ticks_since_real: int) -> Dictionary:
    # Default: copy previous input (remove one-shot actions)
    var predicted := previous_input.duplicate()
    predicted.erase("jump")  # Don't predict one-shot inputs
    return predicted

# Called every rollback tick to advance simulation
func _network_process(input: Dictionary) -> void:
    var direction := 0.0
    if input.get("right", false):
        direction += 1.0
    if input.get("left", false):
        direction -= 1.0
    
    velocity.x = direction * SPEED
    if input.get("jump", false) and is_on_floor():
        velocity.y = JUMP_VELOCITY
    
    move_and_slide()

# Save this node's rollback state
func _save_state() -> Dictionary:
    return {
        "position": position,
        "velocity": velocity,
    }

# Restore this node's rollback state
func _load_state(state: Dictionary) -> void:
    position = state["position"]
    velocity = state["velocity"]
```

### Registration

Register nodes with SyncManager so they participate in the rollback loop:

```gdscript
func _ready() -> void:
    SyncManager.add_peer(multiplayer.get_unique_id())
    # Network nodes register themselves automatically if using
    # the NetworkPlayer/NetworkNode base classes
```

---

## 6. State Serialization

Every rollback tick, the addon saves a snapshot of the game state. This must capture everything needed to restore the simulation exactly.

### What to Serialize

**Must serialize:**
- Position, velocity, rotation of all gameplay-relevant nodes
- Health, ammo, cooldown timers, status effects
- Any variable that affects gameplay outcomes

**Do NOT serialize:**
- Visual-only state (particle positions, UI animations)
- Audio playback position
- Camera position (derive from player position)

### Custom HashSerializer

For mismatch detection, the addon hashes every saved state. Implement a custom serializer for performance:

```gdscript
# res://hash_serializer.gd
extends "res://addons/godot-rollback-netcode/HashSerializer.gd"

func serialize(value) -> PackedByteArray:
    match typeof(value):
        TYPE_VECTOR2:
            var buf := StreamPeerBuffer.new()
            buf.put_float(value.x)
            buf.put_float(value.y)
            return buf.data_array
        TYPE_DICTIONARY:
            # Serialize keys in sorted order for deterministic hashing
            var buf := StreamPeerBuffer.new()
            var keys = value.keys()
            keys.sort()
            for key in keys:
                buf.put_data(serialize(key))
                buf.put_data(serialize(value[key]))
            return buf.data_array
    return super.serialize(value)
```

### Performance Tips

- Keep state dictionaries flat (avoid nested objects)
- Use `int` over `float` where possible (faster to serialize, more deterministic)
- Consider fixed-point math for physics values if exact determinism is critical

---

## 7. Deterministic Game Logic

Rollback requires determinism: given the same inputs and starting state, the simulation must produce **identical** results on all peers. Violations cause desyncs.

### Common Determinism Pitfalls

| Pitfall | Problem | Solution |
|---------|---------|----------|
| `randf()` / `randi()` | Different seed state per peer | Use `NetworkRandomNumberGenerator` from the addon |
| `_process()` logic | Frame-rate dependent | All gameplay logic in `_network_process()` only |
| Dictionary iteration order | Not guaranteed in some edge cases | Sort keys before iterating |
| Floating-point accumulation | Tiny rounding differences snowball | Use integer math or snapped values |
| `move_and_slide()` | Physics engine non-determinism | Use same physics settings; consider Jolt (default in 4.6) |
| Node processing order | Can differ if tree differs | Use explicit ordering via `process_priority` |

### NetworkRandomNumberGenerator

```gdscript
@onready var rng := $NetworkRandomNumberGenerator

func _network_process(input: Dictionary) -> void:
    if input.get("attack", false):
        var damage: int = rng.randi_range(8, 12)
        apply_damage(damage)
```

The addon ensures this RNG is deterministic across rollback re-simulations and synced across peers.

### Fixed Timestep

All rollback logic runs at a fixed timestep tied to the physics tick rate (default 60 TPS). Never use `delta` from `_process()` in rollback code.

---

## 8. Input Prediction and Misprediction

### Default Prediction Strategy

The simplest prediction: "the remote player is doing the same thing they did last frame." This works surprisingly well for held actions (movement), but poorly for one-shot actions (jump, attack).

### Improving Predictions

```gdscript
func _predict_remote_input(previous_input: Dictionary, ticks_since_real: int) -> Dictionary:
    var predicted := previous_input.duplicate()
    
    # Never predict one-shot actions
    predicted.erase("jump")
    predicted.erase("attack")
    predicted.erase("use_item")
    
    # Decay movement predictions after too many ticks without real data
    if ticks_since_real > 10:
        predicted.erase("right")
        predicted.erase("left")
    
    return predicted
```

### Handling Mispredictions Gracefully

When a prediction is wrong, the visual "pop" can be jarring. Mitigation strategies:

1. **Visual interpolation:** Smoothly interpolate the visual representation toward the corrected position rather than snapping
2. **Input delay:** Adding 1–2 frames of input delay reduces the window for misprediction
3. **Sound management:** Use `NetworkAnimationPlayer` and the addon's sound system to avoid replaying sound effects during rollback re-simulation

---

## 9. Input Delay and Interpolation

### Input Delay

Adding intentional input delay (1–2 frames) gives the network more time to deliver real inputs before they're needed, reducing mispredictions:

```
# Project Settings → Godot Rollback Netcode
Input Delay = 2  # frames
```

At 60 FPS, 2 frames = 33ms of added latency. Usually imperceptible for most genres except fighting games.

### Visual Interpolation

Separate gameplay state (authoritative, rolled-back) from visual state (smoothly interpolated):

```gdscript
@onready var visual: Sprite2D = $Sprite2D

var display_position: Vector2

func _network_process(input: Dictionary) -> void:
    # Gameplay logic — this gets rolled back
    velocity.x = get_direction(input) * SPEED
    move_and_slide()

func _process(delta: float) -> void:
    # Visual smoothing — NOT part of rollback
    display_position = display_position.lerp(position, 15.0 * delta)
    visual.global_position = display_position
```

---

## 10. Spawning and Despawning

Spawning objects mid-match (bullets, effects, items) requires special handling in rollback:

```gdscript
# Use SyncManager to spawn so the addon tracks the object
func fire_bullet(pos: Vector2, dir: Vector2) -> void:
    var bullet: Node2D = SyncManager.spawn(
        "Bullet",           # Spawn name (must be unique per tick)
        bullet_scene,       # PackedScene
        bullets_container,  # Parent node
        pos                 # Spawn position
    )
    bullet.direction = dir
```

**Key rules:**
- Always spawn via `SyncManager.spawn()`, never `add_child()` directly
- Always despawn via `SyncManager.despawn()`, never `queue_free()` directly
- Spawn names must be deterministic (not random) — use tick number + player ID

---

## 11. Timers, Animation, and Sound

### NetworkTimer

Standard `Timer` nodes don't work with rollback (they run in real-time, not tick-time). Use the addon's `NetworkTimer`:

```gdscript
@onready var cooldown: NetworkTimer = $CooldownTimer

func _network_process(input: Dictionary) -> void:
    if input.get("attack") and cooldown.is_stopped():
        perform_attack()
        cooldown.start(0.5)  # 0.5 seconds in tick-time
```

### NetworkAnimationPlayer

Wraps `AnimationPlayer` to handle rollback correctly — rewinding animations during re-simulation without visual flicker:

```gdscript
@onready var anim: NetworkAnimationPlayer = $NetworkAnimationPlayer

func _network_process(input: Dictionary) -> void:
    if input.get("attack"):
        anim.play("attack")
```

### Sound

Sound effects triggered during rollback re-simulation should NOT replay. The addon provides `SoundManager` integration — sounds triggered in `_network_process()` are suppressed during re-simulation and only play on the "real" simulation pass.

---

## 12. Debugging Mismatches

State mismatches (desyncs) are the hardest bugs in rollback netcode. The addon provides tools:

### Hash Mismatches

Every tick, peers exchange state hashes. A mismatch means the game states have diverged. Enable logging:

```gdscript
SyncManager.debug_state_hash = true
SyncManager.debug_log = true
```

### Log Inspector

The addon ships a **Log Inspector** tool (accessible from the editor) that lets you:
- Load replay logs from both peers side by side
- Step through ticks and compare state snapshots
- Identify the exact tick and node where state diverged
- View input history and prediction accuracy

### Common Desync Sources

1. **Missing state in `_save_state()`** — forgot to serialize a variable
2. **Non-deterministic logic** — using `randf()` instead of `NetworkRandomNumberGenerator`
3. **Processing order** — nodes execute in different order on different peers
4. **Unserializable types** — using `Object` references in state dictionaries

---

## 13. Delta Rollback (Alternative Addon)

Delta Rollback takes a different approach: instead of saving full state snapshots every tick, it records only **state deltas** (what changed). This is more efficient for games with large world state.

- **Asset Library:** [Delta Rollback](https://godotengine.org/asset-library/asset/3107)
- **Key difference:** Nodes implement `_get_delta()` and `_apply_delta()` instead of full `_save_state()` / `_load_state()`
- **Trade-off:** Better performance for large state, but less mature tooling and documentation

Consider Delta Rollback if your game has hundreds of synced entities and full-state serialization is a bottleneck.

---

## 14. Production Considerations

### Lobby and Matchmaking

Rollback addons handle the simulation layer, not lobby management. You still need:
- A lobby system (Steam, custom, or a service like Nakama)
- NAT traversal (Steam Relay, or WebRTC for web builds)
- Player authentication and anti-cheat

### Bandwidth

Rollback sends inputs, not state — bandwidth is low. A typical fighting game sends ~20 bytes per tick per player. Even at 60 TPS, that's under 10 Kbps.

### Maximum Supported Players

Rollback complexity scales with player count. Practical limits:
- **2 players:** Ideal, well-tested
- **3–4 players:** Works but misprediction chance increases
- **5+ players:** Consider server-authoritative with client prediction instead

### Testing

- **Artificial latency:** Use Godot's network profiler or OS-level tools (clumsy on Windows, `tc` on Linux) to simulate lag
- **Replay system:** Record inputs and replay them deterministically for regression testing
- **Stress testing:** Intentionally trigger mispredictions to verify correction feels smooth

---

## 15. C# Equivalents

The Snopek addon is GDScript-only. For C# projects:

1. **Use GDScript wrapper nodes** that call into C# via signals or method calls
2. **Implement the virtual methods in GDScript** on thin wrapper scripts, delegating to C# classes
3. **Or** port the addon's interfaces to C# (community forks exist)

```csharp
// C# game logic called from GDScript rollback wrapper
public partial class PlayerController : CharacterBody2D
{
    public Dictionary<string, Variant> GetState()
    {
        return new Dictionary<string, Variant>
        {
            ["position"] = Position,
            ["velocity"] = Velocity,
        };
    }

    public void LoadState(Dictionary<string, Variant> state)
    {
        Position = state["position"].AsVector2();
        Velocity = state["velocity"].AsVector2();
    }

    public void NetworkProcess(Dictionary<string, Variant> input)
    {
        float direction = 0f;
        if (input.ContainsKey("right")) direction += 1f;
        if (input.ContainsKey("left")) direction -= 1f;
        Velocity = new Vector2(direction * Speed, Velocity.Y);
        MoveAndSlide();
    }
}
```

---

## 16. Common Mistakes

| Mistake | Why It Breaks | Fix |
|---------|---------------|-----|
| Game logic in `_process()` | Not part of rollback loop | Move all gameplay to `_network_process()` |
| Using `Timer` instead of `NetworkTimer` | Timer runs in real-time, not tick-time | Replace with `NetworkTimer` |
| Spawning with `add_child()` | Addon can't track or roll back the node | Use `SyncManager.spawn()` |
| Incomplete `_save_state()` | Rollback restores partial state → desync | Serialize every gameplay-relevant variable |
| Predicting one-shot inputs | Jump/attack "sticks" during misprediction | Erase one-shot keys in `_predict_remote_input()` |
| Using `randi()` / `randf()` | Different RNG state per peer | Use `NetworkRandomNumberGenerator` |
| Testing only on LAN | Misses real-world latency problems | Use artificial lag tools |
| Ignoring the Log Inspector | Debugging desyncs blind | Learn the tool early, log everything |
