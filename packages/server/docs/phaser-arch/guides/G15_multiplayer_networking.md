# G15 — Phaser 3 Multiplayer & Networking

> **Category:** guide · **Engine:** Phaser · **Related:** [G1 Scene Lifecycle](G1_scene_lifecycle.md) · [G12 Save/Load & Persistence](G12_save_load_persistence.md) · [G9 Mobile & Deployment](G9_mobile_and_deployment.md)

---

## Overview

Phaser is a client-side rendering framework — it has no built-in networking. To build multiplayer games, you pair Phaser with a real-time server using WebSockets (or WebRTC for peer-to-peer). This guide covers the dominant architectural patterns, popular server libraries, implementation techniques (interpolation, prediction, reconciliation), and practical TypeScript examples.

> **Scope:** This guide focuses on real-time multiplayer (action games, .io games). Turn-based games can use simpler REST/HTTP approaches and don't need the techniques described here.

---

## Architecture: Authoritative Server

The industry-standard pattern for real-time multiplayer: the **server owns the game state**. Clients send inputs; the server simulates the world and broadcasts results.

```
┌─────────┐    inputs     ┌────────────┐   state snapshots    ┌─────────┐
│ Client A │ ───────────► │ Authoritative│ ──────────────────► │ Client B │
│ (Phaser) │              │   Server     │                     │ (Phaser) │
│          │ ◄─────────── │  (Node.js)   │ ◄────────────────── │          │
└─────────┘  state update └────────────┘      inputs          └─────────┘
```

### Why Authoritative?

- **Anti-cheat.** Clients can't set their own position, health, or score.
- **Consistency.** All clients see the same world (eventually).
- **Simplicity.** One source of truth simplifies collision, damage, and scoring logic.

### The Trade-Off: Latency

Because inputs must round-trip through the server before the player sees results, raw authoritative servers feel laggy. The techniques below (prediction, interpolation) solve this.

---

## Server Libraries

| Library | Language | Highlights |
|---------|----------|------------|
| **Colyseus** | TypeScript/Node | Purpose-built for games. Room-based architecture, automatic state sync, schema-based serialization. Pairs naturally with Phaser. |
| **Socket.IO** | JavaScript/Node | General-purpose WebSocket wrapper. Huge ecosystem. No built-in game concepts — you build the game loop yourself. |
| **geckos.io** | TypeScript/Node | UDP-like communication over WebRTC for lower latency. Good for fast-paced action. |
| **Hathora** | TypeScript | Managed multiplayer infrastructure. Handles scaling, matchmaking, and server hosting. |
| **Custom WebSocket** | Any | Node.js `ws` library for maximum control. Good when you need a custom protocol. |

This guide shows examples with **raw WebSockets** (universal) and notes Colyseus-specific patterns where relevant.

---

## Project Setup

A typical multiplayer project structure:

```
my-game/
├── client/               # Phaser game
│   ├── src/
│   │   ├── scenes/
│   │   ├── network/
│   │   │   └── NetworkManager.ts
│   │   └── main.ts
│   └── package.json
├── server/               # Game server
│   ├── src/
│   │   ├── GameRoom.ts
│   │   └── index.ts
│   └── package.json
└── shared/               # Shared types between client and server
    └── types.ts
```

### Shared Types

Define message types once, use on both sides:

```typescript
// shared/types.ts

/** Every network message has a type tag for routing. */
export type MessageType =
  | 'join'
  | 'leave'
  | 'input'
  | 'state'
  | 'spawn'
  | 'despawn';

export interface NetworkMessage {
  type: MessageType;
  payload: unknown;
  timestamp: number;
}

export interface InputPayload {
  seq: number;          // Sequence number for reconciliation
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  action: boolean;
}

export interface PlayerState {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  animation: string;
  flipX: boolean;
}

export interface GameState {
  tick: number;
  players: Record<string, PlayerState>;
}
```

---

## Client: NetworkManager

A thin wrapper that handles connection, message serialization, and reconnection:

```typescript
// client/src/network/NetworkManager.ts

import { NetworkMessage, InputPayload, GameState } from '../../../shared/types';

type MessageHandler = (msg: NetworkMessage) => void;

export class NetworkManager {
  private ws: WebSocket | null = null;
  private handlers = new Map<string, MessageHandler[]>();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  /** Connect to the game server. Returns a promise that resolves on open. */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        console.log('Connected to server');
        resolve();
      };

      this.ws.onmessage = (event) => {
        const msg: NetworkMessage = JSON.parse(event.data);
        this.dispatch(msg);
      };

      this.ws.onclose = () => {
        console.log('Disconnected');
        this.tryReconnect();
      };

      this.ws.onerror = (err) => reject(err);
    });
  }

  /** Send a message to the server. */
  send(type: string, payload: unknown): void {
    if (this.ws?.readyState !== WebSocket.OPEN) return;

    const msg: NetworkMessage = {
      type: type as NetworkMessage['type'],
      payload,
      timestamp: Date.now(),
    };
    this.ws.send(JSON.stringify(msg));
  }

  /** Register a handler for a specific message type. */
  on(type: string, handler: MessageHandler): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, []);
    }
    this.handlers.get(type)!.push(handler);
  }

  /** Send player input to the server. */
  sendInput(input: InputPayload): void {
    this.send('input', input);
  }

  private dispatch(msg: NetworkMessage): void {
    const handlers = this.handlers.get(msg.type);
    handlers?.forEach((h) => h(msg));
  }

  private tryReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) return;

    this.reconnectAttempts++;
    const delay = Math.min(1000 * 2 ** this.reconnectAttempts, 10000);
    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => this.connect().catch(() => {}), delay);
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }
}
```

---

## Server: Minimal Game Loop

A basic authoritative server with a fixed-tick game loop:

```typescript
// server/src/index.ts

import { WebSocketServer, WebSocket } from 'ws';
import { GameState, InputPayload, NetworkMessage, PlayerState } from '../../shared/types';

const TICK_RATE = 20;             // Server updates per second
const TICK_MS = 1000 / TICK_RATE;
const MOVE_SPEED = 200;           // Pixels per second

const wss = new WebSocketServer({ port: 3001 });
const players = new Map<string, { ws: WebSocket; state: PlayerState; inputs: InputPayload[] }>();
let tick = 0;

wss.on('connection', (ws) => {
  const id = crypto.randomUUID();

  players.set(id, {
    ws,
    state: { id, x: 400, y: 300, vx: 0, vy: 0, animation: 'idle', flipX: false },
    inputs: [],
  });

  // Tell the new player their ID
  sendTo(ws, 'join', { id });

  // Tell them about all existing players
  const existingPlayers: Record<string, PlayerState> = {};
  players.forEach((p, pid) => { existingPlayers[pid] = p.state; });
  sendTo(ws, 'state', { tick, players: existingPlayers });

  // Notify others about the new player
  broadcast('spawn', players.get(id)!.state, id);

  ws.on('message', (raw) => {
    const msg: NetworkMessage = JSON.parse(raw.toString());

    if (msg.type === 'input') {
      const player = players.get(id);
      if (player) {
        player.inputs.push(msg.payload as InputPayload);
      }
    }
  });

  ws.on('close', () => {
    players.delete(id);
    broadcast('despawn', { id });
  });
});

/** Fixed-tick game loop */
setInterval(() => {
  tick++;

  // Process inputs and simulate
  players.forEach((player) => {
    const { state, inputs } = player;

    // Process all queued inputs for this tick
    for (const input of inputs) {
      const dt = TICK_MS / 1000;

      if (input.left) state.vx = -MOVE_SPEED;
      else if (input.right) state.vx = MOVE_SPEED;
      else state.vx = 0;

      if (input.up) state.vy = -MOVE_SPEED;
      else if (input.down) state.vy = MOVE_SPEED;
      else state.vy = 0;

      state.x += state.vx * dt;
      state.y += state.vy * dt;
      state.flipX = state.vx < 0;
      state.animation = state.vx !== 0 || state.vy !== 0 ? 'run' : 'idle';
    }

    player.inputs = []; // Clear processed inputs
  });

  // Broadcast state to all clients
  const gameState: GameState = {
    tick,
    players: Object.fromEntries(
      [...players.entries()].map(([id, p]) => [id, p.state]),
    ),
  };

  players.forEach((player) => {
    sendTo(player.ws, 'state', gameState);
  });
}, TICK_MS);

function sendTo(ws: WebSocket, type: string, payload: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, payload, timestamp: Date.now() }));
  }
}

function broadcast(type: string, payload: unknown, excludeId?: string): void {
  players.forEach((player, id) => {
    if (id !== excludeId) sendTo(player.ws, type, payload);
  });
}

console.log('Game server running on ws://localhost:3001');
```

---

## Client: Game Scene with Networking

```typescript
// client/src/scenes/GameScene.ts

import { NetworkManager } from '../network/NetworkManager';
import { GameState, InputPayload, PlayerState } from '../../../shared/types';

export class GameScene extends Phaser.Scene {
  private network!: NetworkManager;
  private localId: string = '';
  private localPlayer!: Phaser.Physics.Arcade.Sprite;
  private remotePlayers = new Map<string, Phaser.Physics.Arcade.Sprite>();
  private inputSeq = 0;
  private pendingInputs: InputPayload[] = [];

  constructor() {
    super({ key: 'GameScene' });
  }

  async create(): Promise<void> {
    this.network = new NetworkManager('ws://localhost:3001');
    await this.network.connect();

    this.network.on('join', (msg) => {
      this.localId = (msg.payload as { id: string }).id;
    });

    this.network.on('state', (msg) => {
      this.onServerState(msg.payload as GameState);
    });

    this.network.on('spawn', (msg) => {
      const state = msg.payload as PlayerState;
      if (state.id !== this.localId) {
        this.addRemotePlayer(state);
      }
    });

    this.network.on('despawn', (msg) => {
      const { id } = msg.payload as { id: string };
      this.remotePlayers.get(id)?.destroy();
      this.remotePlayers.delete(id);
    });
  }

  update(time: number, delta: number): void {
    if (!this.localPlayer || !this.localId) return;

    const cursors = this.input.keyboard!.createCursorKeys();

    // Capture input
    const input: InputPayload = {
      seq: ++this.inputSeq,
      left: cursors.left.isDown,
      right: cursors.right.isDown,
      up: cursors.up.isDown,
      down: cursors.down.isDown,
      action: false,
    };

    // Send input to server
    this.network.sendInput(input);

    // CLIENT PREDICTION: apply input locally immediately
    this.applyInput(this.localPlayer, input, delta / 1000);

    // Save for reconciliation
    this.pendingInputs.push(input);
  }

  /** Apply an input to a sprite (same logic as server). */
  private applyInput(
    sprite: Phaser.Physics.Arcade.Sprite,
    input: InputPayload,
    dt: number,
  ): void {
    const speed = 200;
    let vx = 0;
    let vy = 0;

    if (input.left) vx = -speed;
    if (input.right) vx = speed;
    if (input.up) vy = -speed;
    if (input.down) vy = speed;

    sprite.x += vx * dt;
    sprite.y += vy * dt;
  }

  /** Receive authoritative state from server. */
  private onServerState(state: GameState): void {
    for (const [id, playerState] of Object.entries(state.players)) {
      if (id === this.localId) {
        // SERVER RECONCILIATION for local player
        this.reconcile(playerState);
      } else {
        // INTERPOLATION for remote players
        this.updateRemotePlayer(id, playerState);
      }
    }
  }

  /**
   * Server reconciliation: snap to server position, then re-apply
   * any inputs the server hasn't processed yet.
   */
  private reconcile(serverState: PlayerState): void {
    if (!this.localPlayer) {
      this.localPlayer = this.physics.add.sprite(serverState.x, serverState.y, 'player');
      return;
    }

    // Start from server's authoritative position
    this.localPlayer.x = serverState.x;
    this.localPlayer.y = serverState.y;

    // Re-apply inputs the server hasn't acknowledged yet
    // (We don't have a lastProcessedInput in this minimal example;
    //  in production, the server echoes back the last seq it processed.)
    // this.pendingInputs = this.pendingInputs.filter(i => i.seq > serverState.lastSeq);
    // for (const input of this.pendingInputs) {
    //   this.applyInput(this.localPlayer, input, TICK_MS / 1000);
    // }
  }

  /** Smoothly interpolate remote players toward their server position. */
  private updateRemotePlayer(id: string, state: PlayerState): void {
    let sprite = this.remotePlayers.get(id);

    if (!sprite) {
      sprite = this.addRemotePlayer(state);
    }

    // INTERPOLATION: lerp toward server position for smooth movement
    const lerpFactor = 0.2;
    sprite.x = Phaser.Math.Linear(sprite.x, state.x, lerpFactor);
    sprite.y = Phaser.Math.Linear(sprite.y, state.y, lerpFactor);
    sprite.setFlipX(state.flipX);
  }

  private addRemotePlayer(state: PlayerState): Phaser.Physics.Arcade.Sprite {
    const sprite = this.physics.add.sprite(state.x, state.y, 'player');
    sprite.setTint(0xaaaaff); // Tint remote players so you can tell them apart
    this.remotePlayers.set(state.id, sprite);
    return sprite;
  }

  shutdown(): void {
    this.network.disconnect();
  }
}
```

---

## Key Networking Techniques

### 1. Client-Side Prediction

Apply inputs locally **immediately** so the player feels responsive. Don't wait for the server round-trip.

```
Frame 1: Player presses RIGHT
         → Send input to server
         → Apply RIGHT locally (prediction)
         → Player sees instant movement
Frame 5: Server confirms position
         → Reconcile if needed
```

### 2. Server Reconciliation

When the server state arrives, the client's predicted position may differ slightly (due to timing or dropped packets). Reconciliation corrects this:

1. Snap to server position.
2. Re-apply all unacknowledged inputs.
3. The result should match the client's current predicted position — if not, there was a misprediction and the correction is visible.

### 3. Entity Interpolation

Remote players' positions arrive in discrete snapshots (e.g., 20 times/second). Without interpolation, they teleport between positions. Solutions:

```typescript
// Simple lerp — smooths jitter but adds visual delay
sprite.x = Phaser.Math.Linear(sprite.x, serverX, 0.2);

// Buffer interpolation — render one snapshot behind, interpolate between two
// More complex but provides smoother results for fast-paced games
class InterpolationBuffer {
  private snapshots: Array<{ time: number; x: number; y: number }> = [];
  private renderDelay = 100; // ms behind real time

  addSnapshot(time: number, x: number, y: number): void {
    this.snapshots.push({ time, x, y });
    // Keep last 1 second of snapshots
    const cutoff = Date.now() - 1000;
    this.snapshots = this.snapshots.filter((s) => s.time > cutoff);
  }

  getPosition(now: number): { x: number; y: number } | null {
    const renderTime = now - this.renderDelay;
    const snaps = this.snapshots;

    // Find the two snapshots surrounding renderTime
    for (let i = 0; i < snaps.length - 1; i++) {
      if (snaps[i].time <= renderTime && snaps[i + 1].time >= renderTime) {
        const t = (renderTime - snaps[i].time) / (snaps[i + 1].time - snaps[i].time);
        return {
          x: Phaser.Math.Linear(snaps[i].x, snaps[i + 1].x, t),
          y: Phaser.Math.Linear(snaps[i].y, snaps[i + 1].y, t),
        };
      }
    }

    // Fallback: use latest snapshot
    return snaps.length > 0 ? snaps[snaps.length - 1] : null;
  }
}
```

---

## Colyseus Integration

Colyseus is the most Phaser-friendly multiplayer framework. It provides room management, schema-based state sync, and a TypeScript client:

```bash
# Server
npm install colyseus @colyseus/ws-transport

# Client (in Phaser project)
npm install colyseus.js
```

```typescript
// client — connecting to a Colyseus room
import { Client, Room } from 'colyseus.js';

class GameScene extends Phaser.Scene {
  private room!: Room;

  async create(): Promise<void> {
    const client = new Client('ws://localhost:2567');

    // Join or create a room
    this.room = await client.joinOrCreate('game_room', {
      name: 'Player1',
    });

    // Listen for state changes (Colyseus auto-syncs schema)
    this.room.state.players.onAdd((player: any, sessionId: string) => {
      // A player joined — create their sprite
      const sprite = this.add.sprite(player.x, player.y, 'player');

      // Listen for property changes on this player
      player.onChange(() => {
        sprite.x = Phaser.Math.Linear(sprite.x, player.x, 0.2);
        sprite.y = Phaser.Math.Linear(sprite.y, player.y, 0.2);
      });
    });

    this.room.state.players.onRemove((_player: any, sessionId: string) => {
      // A player left — destroy their sprite
    });
  }

  update(): void {
    // Send input to the room
    const cursors = this.input.keyboard!.createCursorKeys();
    this.room.send('input', {
      left: cursors.left.isDown,
      right: cursors.right.isDown,
      up: cursors.up.isDown,
      down: cursors.down.isDown,
    });
  }

  shutdown(): void {
    this.room.leave();
  }
}
```

---

## Bandwidth Optimization

### Delta Compression

Only send properties that changed since the last tick:

```typescript
// Server-side: only include changed fields
function createDelta(prev: PlayerState, curr: PlayerState): Partial<PlayerState> {
  const delta: Partial<PlayerState> = { id: curr.id };
  if (prev.x !== curr.x) delta.x = curr.x;
  if (prev.y !== curr.y) delta.y = curr.y;
  if (prev.animation !== curr.animation) delta.animation = curr.animation;
  return delta;
}
```

### Binary Serialization

JSON is convenient but verbose. For production, use binary formats:

- **MessagePack** — drop-in JSON replacement, ~30% smaller
- **FlatBuffers / Protocol Buffers** — schema-based, very compact
- **Colyseus Schema** — built-in to Colyseus, optimized for game state

### Tick Rate Tuning

| Game type | Recommended tick rate | Notes |
|-----------|----------------------|-------|
| Turn-based / slow | 5–10 Hz | Minimal bandwidth |
| .io game / casual | 15–20 Hz | Good balance |
| Fast action / FPS | 30–60 Hz | Higher bandwidth but tighter sync |

---

## Common Pitfalls

1. **Trusting the client.** Never let the client set its own position, health, or score. Validate all inputs server-side.

2. **Sending full state every tick.** Use delta compression or Colyseus schemas to minimize bandwidth.

3. **No interpolation on remote entities.** Without it, other players teleport between positions.

4. **Not handling disconnections.** Players will disconnect — clean up their sprites and server-side state.

5. **Running game logic in `setInterval` on the server.** Use a precise timer or a game framework's built-in loop. `setInterval` drifts under load.

6. **Forgetting `scene.shutdown()` cleanup.** Close WebSocket connections when the scene ends to avoid ghost connections.

---

## Testing Multiplayer Locally

```bash
# Run the server
cd server && npm start

# Run two Phaser clients in separate browser tabs
cd client && npm run dev
# Open http://localhost:8080 in two tabs
```

For simulating latency:
- **Chrome DevTools → Network → Throttling** — add custom latency profiles
- **clumsy** (Windows) or **tc** (Linux) — simulate packet loss and delay at the OS level

---

## Further Reading

- [Colyseus Documentation](https://docs.colyseus.io/) — room architecture, schema sync, matchmaking
- [Gabriel Gambetta: Fast-Paced Multiplayer](https://www.gabrielgambetta.com/client-server-game-architecture.html) — the canonical guide to prediction and reconciliation
- [geckos.io](https://github.com/geckos-io/geckos.io) — UDP-like WebRTC transport for Phaser
- [Socket.IO with Phaser tutorial](https://gamedevacademy.org/create-a-basic-multiplayer-game-in-phaser-3-with-socket-io-part-1/) — step-by-step beginner guide
