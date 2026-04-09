# Networking & Multiplayer for Three.js Games

> **Category:** guide · **Engine:** Three.js · **Related:** [G1_physics_rapier.md](G1_physics_rapier.md), [G7_input_handling.md](G7_input_handling.md), [G6_optimization_performance.md](G6_optimization_performance.md)

Three.js handles rendering only — networking is a bring-your-own layer. This guide covers the dominant patterns for adding real-time multiplayer to Three.js games, including transport selection, authoritative server architecture, client-side prediction, and state synchronization.

## Transport Options

### WebSocket (TCP-based)

WebSocket is the most common transport for web multiplayer. It provides reliable, ordered message delivery over a single TCP connection. Libraries like **Socket.IO** and **ws** (Node.js) are the standard choices.

Best for: turn-based games, strategy games, RPGs, chat, lobby systems, any game where packet ordering and reliability matter more than raw latency.

```typescript
// Client — connecting to a game server
import * as THREE from 'three';
import { io, Socket } from 'socket.io-client';

interface PlayerState {
  id: string;
  position: [number, number, number];
  rotation: [number, number, number, number];
  timestamp: number;
}

const socket: Socket = io('wss://game.example.com', {
  transports: ['websocket'], // skip HTTP long-polling fallback
  reconnectionDelay: 1000,
  reconnectionAttempts: 5,
});

socket.on('connect', () => {
  console.log('Connected:', socket.id);
  socket.emit('join-room', { roomId: 'lobby-1' });
});

socket.on('state-update', (players: PlayerState[]) => {
  // Apply authoritative state from server
  syncRemotePlayers(players);
});

socket.on('disconnect', (reason) => {
  console.warn('Disconnected:', reason);
});
```

### WebRTC DataChannel (UDP-like)

WebRTC DataChannels can send **unordered and unreliable** messages via SCTP, approximating UDP behavior in the browser. This is critical for competitive action games where latency matters more than reliability.

**geckos.io** is a popular library that wraps WebRTC DataChannels with a Socket.IO-like API and provides a Node.js server that handles signaling automatically.

Best for: fighting games, racing games, FPS, any fast-paced game where a dropped packet is better than a delayed one.

```typescript
// Server — geckos.io with UDP-like channels
import geckos from '@geckos.io/server';

const io = geckos();

io.listen(3000);

io.onConnection((channel) => {
  console.log('Player connected:', channel.id);

  channel.onRaw((rawMessage) => {
    // Binary data for minimal bandwidth
  });

  channel.on('player-input', (data) => {
    // Process input on authoritative server
    processInput(channel.id, data as InputPayload);
  });

  // Send unreliable state updates at 20Hz
  const tickInterval = setInterval(() => {
    channel.raw.emit(serializeGameState()); // unreliable, unordered
  }, 50);

  channel.onDisconnect(() => {
    clearInterval(tickInterval);
  });
});
```

### Transport Comparison

| Feature | WebSocket | WebRTC DataChannel |
|---|---|---|
| Protocol | TCP | SCTP (configurable reliability) |
| Latency | Higher (head-of-line blocking) | Lower (unordered mode) |
| Reliability | Guaranteed delivery | Configurable |
| NAT traversal | Easy (standard ports) | Requires STUN/TURN |
| Server complexity | Low | Medium |
| Browser support | Universal | Universal (modern browsers) |
| Best for | Turn-based, strategy, RPG | FPS, racing, fighting |

## Authoritative Server Architecture

For any competitive multiplayer game, the server must be the **single source of truth**. Clients send inputs; the server simulates and broadcasts authoritative state.

### Server Game Loop

```typescript
// Authoritative server tick loop (Node.js)
interface GameState {
  players: Map<string, PlayerState>;
  projectiles: Projectile[];
  tick: number;
  timestamp: number;
}

const TICK_RATE = 20; // 20 Hz server tick
const TICK_MS = 1000 / TICK_RATE;

let gameState: GameState = {
  players: new Map(),
  projectiles: [],
  tick: 0,
  timestamp: Date.now(),
};

// Fixed-timestep server loop
setInterval(() => {
  gameState.tick++;
  gameState.timestamp = Date.now();

  // 1. Process queued inputs from all clients
  for (const [playerId, inputQueue] of pendingInputs) {
    for (const input of inputQueue) {
      applyInput(gameState, playerId, input);
    }
    inputQueue.length = 0;
  }

  // 2. Simulate physics / game logic
  simulatePhysics(gameState, TICK_MS / 1000);

  // 3. Broadcast state to all clients
  const snapshot = serializeState(gameState);
  broadcastToAll(snapshot);
}, TICK_MS);
```

### Input Packaging

Send inputs, not positions. Each input carries a **sequence number** for reconciliation:

```typescript
interface PlayerInput {
  seq: number;           // monotonic sequence for reconciliation
  tick: number;          // server tick this input targets
  moveX: number;         // -1 to 1
  moveZ: number;         // -1 to 1
  yaw: number;           // camera rotation
  actions: number;       // bitfield: jump=1, fire=2, interact=4
  timestamp: number;     // client timestamp for latency estimation
}

// Client — send input every frame
function sendInput(socket: Socket, input: PlayerInput): void {
  // Binary encoding reduces bandwidth ~60% vs JSON
  const buffer = encodeInput(input);
  socket.volatile.emit('input', buffer); // volatile = drop if can't send
}
```

## Client-Side Prediction & Server Reconciliation

Without prediction, players see their own movement delayed by one full round-trip. Prediction makes the game feel responsive; reconciliation corrects drift.

### The Three Loops

A multiplayer Three.js game runs three loosely-coupled loops:

1. **Render loop** (60 fps) — Three.js `requestAnimationFrame`, interpolates visual positions
2. **Prediction loop** (per-input) — immediately applies local input to a predicted state
3. **Reconciliation** (on server update) — corrects predicted state against authoritative snapshots

```typescript
// Client-side prediction with reconciliation
class PredictedPlayer {
  mesh: THREE.Mesh;
  predictedPosition: THREE.Vector3;
  serverPosition: THREE.Vector3;
  pendingInputs: PlayerInput[] = [];
  lastProcessedSeq: number = 0;

  applyInput(input: PlayerInput): void {
    // Immediately apply input locally (same logic as server)
    const speed = 5.0;
    const dt = 1 / 60;
    this.predictedPosition.x += input.moveX * speed * dt;
    this.predictedPosition.z += input.moveZ * speed * dt;

    // Store for possible replay during reconciliation
    this.pendingInputs.push(input);
  }

  reconcile(serverState: PlayerState, lastProcessedSeq: number): void {
    // Server tells us the authoritative position after processing input #N
    this.serverPosition.set(...serverState.position);
    this.lastProcessedSeq = lastProcessedSeq;

    // Discard inputs the server has already processed
    this.pendingInputs = this.pendingInputs.filter(
      (input) => input.seq > lastProcessedSeq
    );

    // Re-apply unprocessed inputs on top of server state
    const replayPos = this.serverPosition.clone();
    const speed = 5.0;
    const dt = 1 / 60;
    for (const input of this.pendingInputs) {
      replayPos.x += input.moveX * speed * dt;
      replayPos.z += input.moveZ * speed * dt;
    }

    this.predictedPosition.copy(replayPos);
  }

  // Called in render loop — smooth visual position
  updateVisual(alpha: number): void {
    this.mesh.position.lerp(this.predictedPosition, alpha);
  }
}
```

### Entity Interpolation for Remote Players

Remote players don't use prediction — instead, buffer two server snapshots and interpolate between them. This adds one tick of latency but produces smooth motion:

```typescript
class InterpolatedEntity {
  mesh: THREE.Mesh;
  private stateBuffer: { position: THREE.Vector3; timestamp: number }[] = [];

  pushState(position: THREE.Vector3, timestamp: number): void {
    this.stateBuffer.push({ position: position.clone(), timestamp });
    // Keep only the last 1 second of states
    const cutoff = timestamp - 1000;
    this.stateBuffer = this.stateBuffer.filter((s) => s.timestamp > cutoff);
  }

  interpolate(renderTime: number): void {
    // Render in the past by one tick interval (50ms at 20Hz)
    const interpTime = renderTime - 50;

    // Find the two states bracketing interpTime
    let prev = this.stateBuffer[0];
    let next = this.stateBuffer[1];

    for (let i = 0; i < this.stateBuffer.length - 1; i++) {
      if (this.stateBuffer[i].timestamp <= interpTime &&
          this.stateBuffer[i + 1].timestamp >= interpTime) {
        prev = this.stateBuffer[i];
        next = this.stateBuffer[i + 1];
        break;
      }
    }

    if (prev && next && next.timestamp !== prev.timestamp) {
      const t = (interpTime - prev.timestamp) / (next.timestamp - prev.timestamp);
      this.mesh.position.lerpVectors(prev.position, next.position, t);
    }
  }
}
```

## Binary Serialization

JSON wastes 3-10× more bandwidth than binary. For state updates at 20Hz, binary serialization is essential:

```typescript
// Minimal binary protocol for position updates
// Layout: [playerId: u16][x: f32][y: f32][z: f32][yaw: f16] = 16 bytes per player

function encodePositions(players: Map<string, PlayerState>): ArrayBuffer {
  const buffer = new ArrayBuffer(2 + players.size * 16);
  const view = new DataView(buffer);
  view.setUint16(0, players.size, true); // player count

  let offset = 2;
  for (const [, player] of players) {
    view.setUint16(offset, player.numericId, true);
    view.setFloat32(offset + 2, player.position[0], true);
    view.setFloat32(offset + 6, player.position[1], true);
    view.setFloat32(offset + 10, player.position[2], true);
    view.setFloat32(offset + 14, player.yaw, true);
    offset += 18;
  }
  return buffer;
}

// Delta compression — only send what changed
function encodeDelta(prev: GameState, curr: GameState): ArrayBuffer {
  const changed: PlayerState[] = [];
  for (const [id, player] of curr.players) {
    const old = prev.players.get(id);
    if (!old || hasChanged(old, player)) {
      changed.push(player);
    }
  }
  return encodePositions(new Map(changed.map((p) => [p.id, p])));
}
```

## Performance Considerations

- **Tick rate**: 20 Hz is standard. Higher rates (60 Hz) increase bandwidth and CPU linearly — only use for competitive games.
- **Bandwidth budget**: Target under 10 KB/s per player. Binary encoding + delta compression keeps a 20-player game under 5 KB/s.
- **Web Workers**: Move serialization/deserialization to a Web Worker to avoid jank on the render thread. Use `Transferable` `ArrayBuffer` objects to avoid copying.
- **Object pooling**: Reuse `DataView` and `ArrayBuffer` instances to minimize GC pressure during network processing.
- **Connection quality**: Measure RTT with ping/pong. Adapt interpolation delay and input buffer size to measured latency.

## Recommended Libraries

| Library | Transport | Use Case |
|---|---|---|
| **Socket.IO** | WebSocket | General purpose, auto-reconnect, rooms |
| **ws** | WebSocket | Lightweight Node.js server |
| **geckos.io** | WebRTC DataChannel | UDP-like for action games |
| **Colyseus** | WebSocket | Full game server framework with rooms + state sync |
| **Rhubarb** | WebSocket | Optimized for WebGL games, binary protocol |
| **Playroom** | WebSocket/WebRTC | Quick prototyping, peer-to-peer |

## Architecture Checklist

1. Choose transport: WebSocket for most games, WebRTC for competitive action
2. Implement authoritative server with fixed-timestep game loop
3. Send inputs (not positions) from client to server
4. Add client-side prediction for local player responsiveness
5. Implement server reconciliation with input replay
6. Buffer and interpolate remote entity positions
7. Use binary serialization with delta compression
8. Offload network I/O to Web Workers
9. Monitor RTT and adapt interpolation delay
10. Test with simulated latency (Chrome DevTools throttling)
