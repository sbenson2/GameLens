# G86 — Multiplayer Security and Authority Patterns

> **Category:** guide · **Engine:** Godot 4.x · **Related:** [G13 Networking & Multiplayer](./G13_networking_and_multiplayer.md) · [G27 Dedicated Servers & Advanced Networking](./G27_dedicated_servers_advanced_networking.md) · [G43 Rollback Netcode](./G43_rollback_netcode.md) · [G72 Multiplayer State Sync & Prediction](./G72_multiplayer_state_sync_and_prediction.md)

Godot's multiplayer API makes it easy to send data between peers, but easy networking without security is a recipe for cheating. This guide covers authority models, server-side validation, RPC security, rate limiting, and anti-cheat patterns for Godot 4.4+ multiplayer games.

---

## Table of Contents

1. [The Trust Problem](#1-the-trust-problem)
2. [Authority Models](#2-authority-models)
3. [RPC Security Annotations](#3-rpc-security-annotations)
4. [Server-Side Input Validation](#4-server-side-input-validation)
5. [Movement Validation](#5-movement-validation)
6. [Combat and Damage Validation](#6-combat-and-damage-validation)
7. [Rate Limiting RPCs](#7-rate-limiting-rpcs)
8. [Authentication and Session Management](#8-authentication-and-session-management)
9. [Anti-Cheat Patterns](#9-anti-cheat-patterns)
10. [Common Mistakes and Fixes](#10-common-mistakes-and-fixes)

---

## 1. The Trust Problem

The core rule of multiplayer security:

> **Never trust the client.** Every value sent from a client — position, damage, inventory changes — must be validated by the server before it affects game state.

A modified client can send any RPC with any parameters. If the server blindly applies those values, cheaters can teleport, deal infinite damage, spawn items, or corrupt the game state for everyone.

```
Client says:            Server must verify:
─────────────           ────────────────────
"I moved to (999,999)"  → Is that move physically possible?
"I dealt 9999 damage"   → Does the weapon exist? Is the target in range?
"I picked up item X"    → Is item X near the player? Is it unclaimed?
"I have 1M gold"        → Reject — server owns the gold value.
```

---

## 2. Authority Models

### Server-Authoritative (Recommended)

The server is the single source of truth. Clients send **inputs** (not results), and the server simulates the outcome.

```gdscript
# CLIENT: send input, not result
func _physics_process(_delta: float) -> void:
    if not is_multiplayer_authority():
        return
    
    var input := Vector2.ZERO
    if Input.is_action_pressed("move_right"):
        input.x += 1.0
    if Input.is_action_pressed("move_left"):
        input.x -= 1.0
    if Input.is_action_pressed("move_up"):
        input.y -= 1.0
    if Input.is_action_pressed("move_down"):
        input.y += 1.0
    
    # Send normalized input direction, NOT the desired position
    _send_input.rpc_id(1, input.normalized())

@rpc("any_peer", "unreliable")
func _send_input(direction: Vector2) -> void:
    if not multiplayer.is_server():
        return
    
    var sender_id: int = multiplayer.get_remote_sender_id()
    # Validate: direction vector should be normalized (length <= 1)
    if direction.length() > 1.01:  # small epsilon for float precision
        push_warning("Player %d sent invalid input vector" % sender_id)
        return
    
    # Server applies the movement with its own speed constant
    _server_apply_movement(sender_id, direction)
```

### C#

```csharp
[Rpc(MultiplayerApi.RpcMode.AnyPeer, TransferMode = MultiplayerPeer.TransferModeEnum.Unreliable)]
private void SendInput(Vector2 direction)
{
    if (!Multiplayer.IsServer())
        return;

    int senderId = Multiplayer.GetRemoteSenderId();
    if (direction.Length() > 1.01f)
    {
        GD.PushWarning($"Player {senderId} sent invalid input vector");
        return;
    }

    ServerApplyMovement(senderId, direction);
}
```

### Client-Authoritative (Avoid for Competitive Games)

The client tells the server its state directly. Simple to implement but trivially exploitable.

**Only acceptable for:** cooperative-only games, single-player with optional co-op, or non-competitive cosmetic data.

---

## 3. RPC Security Annotations

Godot 4's `@rpc` annotation controls who can call a function and how it's transferred.

### Access Modes

```gdscript
# Only the multiplayer authority can call this (default)
# Safe for server → client broadcasts
@rpc("authority")
func update_health(new_hp: int) -> void:
    health = new_hp

# Any peer can call this — DANGEROUS for gameplay RPCs
# Only use for non-gameplay: chat messages, cosmetic emotes
@rpc("any_peer")
func send_chat_message(text: String) -> void:
    if not multiplayer.is_server():
        return
    # Server validates and rebroadcasts
    var sender_id: int = multiplayer.get_remote_sender_id()
    _broadcast_chat.rpc(sender_id, text.substr(0, 200))  # Length limit

# Call targets
@rpc("any_peer", "call_local")     # Also runs on the caller
@rpc("any_peer", "call_remote")    # Only runs on remote peers (default)
```

### Transfer Modes

```gdscript
# Reliable (TCP-like) — use for important state changes
@rpc("authority", "reliable")
func player_died(player_id: int) -> void:
    pass

# Unreliable — use for frequent updates (position, rotation)
@rpc("authority", "unreliable")
func sync_position(pos: Vector3) -> void:
    pass

# Unreliable ordered — unreliable but discards out-of-order packets
@rpc("authority", "unreliable_ordered")
func sync_state(tick: int, pos: Vector3, vel: Vector3) -> void:
    pass
```

### The Golden Rules

1. **Never use `@rpc("any_peer")` for gameplay actions** (damage, spawning, inventory). Always route through the server.
2. **Never use `"reliable"` for position updates.** 60 reliable position RPCs/sec per player will saturate bandwidth.
3. **Always check `multiplayer.is_server()`** at the top of any `@rpc("any_peer")` function.
4. **Always check `multiplayer.get_remote_sender_id()`** to verify the caller is who they claim to be.

---

## 4. Server-Side Input Validation

Every RPC from a client should be validated before the server acts on it.

### Validation Template

```gdscript
@rpc("any_peer", "reliable")
func request_action(action_type: String, target_id: int) -> void:
    if not multiplayer.is_server():
        return
    
    var sender_id: int = multiplayer.get_remote_sender_id()
    
    # 1. Does this player exist and are they alive?
    var player: PlayerState = _get_player_state(sender_id)
    if player == null or player.is_dead:
        return
    
    # 2. Is the action valid for the player's current state?
    if action_type not in player.available_actions:
        push_warning("Player %d requested invalid action: %s" % [sender_id, action_type])
        return
    
    # 3. Does the target exist?
    var target: Node = instance_from_id(target_id)
    if target == null:
        return
    
    # 4. Is the target in range?
    var distance: float = player.node.global_position.distance_to(target.global_position)
    if distance > player.action_range:
        push_warning("Player %d action target out of range (%.1f > %.1f)" % [
            sender_id, distance, player.action_range
        ])
        return
    
    # 5. All checks passed — execute the action on the server
    _execute_action(player, action_type, target)
```

### C#

```csharp
[Rpc(MultiplayerApi.RpcMode.AnyPeer, TransferMode = MultiplayerPeer.TransferModeEnum.Reliable)]
private void RequestAction(string actionType, int targetId)
{
    if (!Multiplayer.IsServer())
        return;

    int senderId = Multiplayer.GetRemoteSenderId();
    var player = GetPlayerState(senderId);
    if (player == null || player.IsDead)
        return;

    if (!player.AvailableActions.Contains(actionType))
        return;

    var target = GodotObject.InstanceFromId((ulong)targetId) as Node3D;
    if (target == null)
        return;

    float distance = player.Node.GlobalPosition.DistanceTo(target.GlobalPosition);
    if (distance > player.ActionRange)
        return;

    ExecuteAction(player, actionType, target);
}
```

---

## 5. Movement Validation

The server should verify that client-reported movement is physically plausible.

```gdscript
## Server-side movement validator
const MAX_SPEED: float = 10.0  # units per second
const MAX_SPEED_TOLERANCE: float = 1.2  # 20% tolerance for network jitter
const TELEPORT_THRESHOLD: float = 50.0  # flag obvious teleport cheats

var _last_positions: Dictionary[int, Vector3] = {}
var _last_timestamps: Dictionary[int, float] = {}
var _violation_counts: Dictionary[int, int] = {}

func validate_movement(peer_id: int, reported_pos: Vector3) -> bool:
    var now: float = Time.get_unix_time_from_system()
    
    if peer_id not in _last_positions:
        _last_positions[peer_id] = reported_pos
        _last_timestamps[peer_id] = now
        _violation_counts[peer_id] = 0
        return true
    
    var last_pos: Vector3 = _last_positions[peer_id]
    var dt: float = now - _last_timestamps[peer_id]
    
    if dt < 0.001:
        return false  # Impossibly fast update
    
    var distance: float = last_pos.distance_to(reported_pos)
    var speed: float = distance / dt
    
    # Teleport detection
    if distance > TELEPORT_THRESHOLD:
        _violation_counts[peer_id] += 10
        push_warning("Player %d possible teleport: %.1f units" % [peer_id, distance])
        return false
    
    # Speed check
    if speed > MAX_SPEED * MAX_SPEED_TOLERANCE:
        _violation_counts[peer_id] += 1
        if _violation_counts[peer_id] > 10:
            push_warning("Player %d speed violations: %d" % [peer_id, _violation_counts[peer_id]])
        return false
    
    # Valid movement
    _last_positions[peer_id] = reported_pos
    _last_timestamps[peer_id] = now
    if _violation_counts[peer_id] > 0:
        _violation_counts[peer_id] -= 1  # Decay violations over time
    return true
```

---

## 6. Combat and Damage Validation

Never let clients declare how much damage they deal. The server calculates it.

```gdscript
## Server-side damage calculation
@rpc("any_peer", "reliable")
func request_attack(target_node_path: NodePath) -> void:
    if not multiplayer.is_server():
        return
    
    var attacker_id: int = multiplayer.get_remote_sender_id()
    var attacker: CharacterBody3D = _player_nodes.get(attacker_id)
    if attacker == null:
        return
    
    var target: Node3D = get_node_or_null(target_node_path)
    if target == null or not target.has_method("take_damage"):
        return
    
    # Server-side checks
    var distance: float = attacker.global_position.distance_to(target.global_position)
    var weapon: WeaponData = _get_equipped_weapon(attacker_id)
    
    if weapon == null:
        return
    
    # Range check
    if distance > weapon.range:
        return
    
    # Cooldown check — prevent attack speed hacks
    var now: float = Time.get_ticks_msec() / 1000.0
    var last_attack: float = _last_attack_times.get(attacker_id, 0.0)
    if now - last_attack < weapon.cooldown:
        return
    _last_attack_times[attacker_id] = now
    
    # Line-of-sight check (optional but recommended)
    var space: PhysicsDirectSpaceState3D = attacker.get_world_3d().direct_space_state
    var query := PhysicsRayQueryParameters3D.create(
        attacker.global_position + Vector3.UP,
        target.global_position + Vector3.UP
    )
    query.exclude = [attacker.get_rid()]
    var result: Dictionary = space.intersect_ray(query)
    if result.is_empty() or result["collider"] != target:
        return  # Something blocking line of sight
    
    # Server calculates damage (never from client)
    var damage: int = weapon.base_damage + randi_range(0, weapon.damage_variance)
    target.take_damage(damage, attacker_id)
    
    # Broadcast result to all clients
    _notify_damage.rpc(target_node_path, damage, attacker_id)
```

---

## 7. Rate Limiting RPCs

Prevent clients from flooding the server with RPCs.

```gdscript
## Per-player rate limiter
var _rpc_counts: Dictionary[int, int] = {}
var _rpc_reset_time: float = 0.0
const RPC_LIMIT_PER_SECOND: int = 30
const RPC_KICK_THRESHOLD: int = 100  # Sustained abuse → disconnect

func _physics_process(delta: float) -> void:
    if not multiplayer.is_server():
        return
    _rpc_reset_time += delta
    if _rpc_reset_time >= 1.0:
        # Check for abusers before reset
        for peer_id: int in _rpc_counts:
            if _rpc_counts[peer_id] > RPC_KICK_THRESHOLD:
                push_warning("Kicking player %d for RPC flooding (%d/sec)" % [
                    peer_id, _rpc_counts[peer_id]
                ])
                multiplayer.multiplayer_peer.disconnect_peer(peer_id)
        _rpc_counts.clear()
        _rpc_reset_time = 0.0

## Call this at the top of every any_peer RPC handler
func _check_rate_limit(peer_id: int) -> bool:
    _rpc_counts[peer_id] = _rpc_counts.get(peer_id, 0) + 1
    return _rpc_counts[peer_id] <= RPC_LIMIT_PER_SECOND
```

### Usage in RPC handlers

```gdscript
@rpc("any_peer", "reliable")
func request_use_item(item_id: int) -> void:
    if not multiplayer.is_server():
        return
    var sender: int = multiplayer.get_remote_sender_id()
    if not _check_rate_limit(sender):
        return
    # ... validate and process
```

---

## 8. Authentication and Session Management

### Connection Authentication

Godot 4.4+ supports the `multiplayer.peer_authenticating` signal and `SceneMultiplayer.auth_callback` for verifying players during connection.

```gdscript
## Server setup with authentication
func _ready() -> void:
    if not multiplayer.is_server():
        return
    
    var scene_mp: SceneMultiplayer = multiplayer as SceneMultiplayer
    # Set the auth callback using the method (not a property)
    scene_mp.set_auth_callback(_authenticate_peer)
    scene_mp.peer_authenticating.connect(_on_peer_authenticating)
    scene_mp.peer_authentication_failed.connect(_on_auth_failed)

func _on_peer_authenticating(peer_id: int) -> void:
    # Peer is connecting — wait for auth data
    # Client should call scene_mp.send_auth(1, token_bytes) to authenticate
    pass

func _authenticate_peer(peer_id: int, data: PackedByteArray) -> void:
    var token: String = data.get_string_from_utf8()
    
    if _validate_token(token):
        (multiplayer as SceneMultiplayer).complete_auth(peer_id)
    else:
        push_warning("Auth failed for peer %d" % peer_id)
        multiplayer.multiplayer_peer.disconnect_peer(peer_id)

func _on_auth_failed(peer_id: int) -> void:
    push_warning("Authentication failed for peer %d" % peer_id)
```

---

## 9. Anti-Cheat Patterns

### Server-Side State Ownership

The most effective anti-cheat: the server owns all critical game state.

| State | Owner | Why |
|-------|-------|-----|
| Player health | Server | Clients cannot set their own HP |
| Inventory | Server | Clients cannot spawn items |
| Position | Server (validated) | Clients send input; server applies movement |
| Currency / Score | Server | Never sent from client |
| Cooldowns | Server | Prevents attack speed hacks |
| Spawn timing | Server | Prevents spawn manipulation |

### Sanity Checks

```gdscript
## Periodic server-side consistency checks
func _audit_player_state(peer_id: int) -> void:
    var state: PlayerState = _player_states[peer_id]
    
    # Health bounds
    if state.health > state.max_health or state.health < 0:
        push_warning("Player %d health out of bounds: %d" % [peer_id, state.health])
        state.health = clampi(state.health, 0, state.max_health)
    
    # Inventory weight
    var total_weight: float = 0.0
    for item: ItemData in state.inventory:
        total_weight += item.weight
    if total_weight > state.max_carry_weight * 1.01:
        push_warning("Player %d over carry limit" % peer_id)
        # Force drop excess items
    
    # Position bounds (inside map)
    if not _map_bounds.has_point(Vector2(state.position.x, state.position.z)):
        push_warning("Player %d outside map bounds" % peer_id)
        state.position = _spawn_point
```

### Client-Side Prediction with Server Reconciliation

For responsive gameplay with server authority, use client-side prediction where the client immediately applies its own input locally, then reconciles when the server sends the authoritative state back. See [G72 Multiplayer State Sync & Prediction](./G72_multiplayer_state_sync_and_prediction.md) for detailed implementation.

---

## 10. Common Mistakes and Fixes

### Using `@rpc("any_peer")` for damage RPCs

**Problem:** Any client can call `deal_damage(target, 9999)` directly.
**Fix:** Clients send `request_attack(target)`. Server calculates damage.

### Forgetting `multiplayer.is_server()` guard

**Problem:** RPC handler runs on all peers, including clients.
**Fix:** Add `if not multiplayer.is_server(): return` as the first line of every `any_peer` handler that modifies state.

### Reliable RPCs for position sync

**Problem:** Using `"reliable"` for 60 Hz position updates causes bandwidth explosion and head-of-line blocking.
**Fix:** Use `"unreliable"` or `"unreliable_ordered"` for frequent state sync.

### Not validating `get_remote_sender_id()`

**Problem:** A malicious client could spoof actions for another player.
**Fix:** Always use `multiplayer.get_remote_sender_id()` to identify the real caller, never trust a `player_id` parameter sent by the client.

### Client-owned currency or score

**Problem:** Storing gold/score on the client and syncing it to the server.
**Fix:** Server is the single source of truth for all economy values. Clients display what the server tells them.

### No rate limiting on RPCs

**Problem:** A modified client sends thousands of RPCs per second, causing server lag.
**Fix:** Implement per-peer rate limiting (see section 7) and disconnect abusers.
