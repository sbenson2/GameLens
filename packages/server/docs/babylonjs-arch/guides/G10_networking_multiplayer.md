# Networking & Multiplayer

> **Category:** guide · **Engine:** Babylon.js · **Related:** [E1_architecture_overview.md](../architecture/E1_architecture_overview.md), [G9_input_cameras.md](G9_input_cameras.md)

Babylon.js does not ship a built-in networking layer, but its architecture integrates cleanly with popular real-time multiplayer frameworks. This guide covers the dominant pattern — Babylon.js + Colyseus — along with alternative approaches, state synchronization strategies, and performance considerations for web-based multiplayer games.

---

## Architecture Overview

Web multiplayer games use an **authoritative server** model: the server owns game state, clients send inputs, and the server broadcasts validated state updates. This prevents cheating and ensures consistency.

```
┌─────────┐   WebSocket   ┌─────────────┐   WebSocket   ┌─────────┐
│ Client A │ ────────────→ │   Colyseus  │ ←──────────── │ Client B │
│(Babylon) │ ←──────────── │   Server    │ ────────────→ │(Babylon) │
└─────────┘   state sync   │  (Node.js)  │   state sync  └─────────┘
                           └─────────────┘
```

### Framework Options

| Framework | Transport | Best For |
|-----------|-----------|----------|
| **Colyseus** | WebSocket | Room-based games, turn-based, casual multiplayer (official Babylon.js docs recommend) |
| **Socket.io** | WebSocket (+ polling fallback) | Chat, lobby systems, simple sync |
| **Geckos.io** | WebRTC DataChannel (UDP-like) | Fast-paced action games needing low latency |
| **Nakama** | WebSocket + gRPC | Leaderboards, matchmaking, social features, persistent state |
| **PlayFab / GameLift** | Managed | Production scaling, analytics, player management |

---

## Colyseus Integration (Recommended)

Colyseus is the most documented path for Babylon.js multiplayer. It provides room management, schema-based state sync, and automatic delta encoding.

### Server Setup

```bash
npm init colyseus-app ./my-game-server
cd my-game-server
npm start
# Server runs on ws://localhost:2567
# Monitor panel at http://localhost:2567/colyseus
```

### Defining Shared State with Schema

Colyseus uses decorated Schema classes for automatic serialization and delta compression:

```typescript
// server/src/rooms/schema/GameState.ts
import { MapSchema, Schema, type } from "@colyseus/schema";

export class Player extends Schema {
  @type("number") x: number = 0;
  @type("number") y: number = 0;
  @type("number") z: number = 0;
  @type("number") rotationY: number = 0;
  @type("string") name: string = "";
  @type("number") health: number = 100;
}

export class GameState extends Schema {
  @type({ map: Player }) players = new MapSchema<Player>();
  @type("number") roundTime: number = 0;
  @type("string") phase: string = "lobby";
}
```

**Key rule:** Only data that must be shared goes in the Schema. Client-only state (camera angle, UI state, local particle effects) stays on the client.

### Room Lifecycle (Server)

```typescript
// server/src/rooms/GameRoom.ts
import { Room, Client } from "colyseus";
import { GameState, Player } from "./schema/GameState";

export class GameRoom extends Room<GameState> {
  maxClients = 8;

  onCreate(options: any): void {
    this.setState(new GameState());

    // Handle movement input from clients
    this.onMessage("move", (client: Client, data: { x: number; z: number }) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      // Server-side validation
      const dx = data.x - player.x;
      const dz = data.z - player.z;
      const maxMove = 10; // prevent teleport cheats
      if (Math.sqrt(dx * dx + dz * dz) > maxMove) return;

      player.x = data.x;
      player.z = data.z;
    });

    // Game loop at 20Hz (server tick rate)
    this.setSimulationInterval((dt: number) => {
      this.state.roundTime += dt;
    }, 1000 / 20);
  }

  onJoin(client: Client, options: { name?: string }): void {
    const player = new Player();
    player.name = options.name ?? `Player_${client.sessionId.slice(0, 4)}`;
    player.x = (Math.random() - 0.5) * 100;
    player.z = (Math.random() - 0.5) * 100;
    this.state.players.set(client.sessionId, player);
    console.log(`${player.name} joined (${client.sessionId})`);
  }

  onLeave(client: Client, consented: boolean): void {
    this.state.players.delete(client.sessionId);
  }
}
```

### Client Connection (Babylon.js)

```typescript
// client/src/networking.ts
import * as Colyseus from "colyseus.js";
import * as BABYLON from "@babylonjs/core";

const client = new Colyseus.Client("ws://localhost:2567");

export async function connectToGame(
  scene: BABYLON.Scene,
  playerName: string
): Promise<Colyseus.Room> {
  const room = await client.joinOrCreate("game_room", { name: playerName });
  console.log(`Connected to room ${room.roomId}`);

  const playerMeshes: Record<string, BABYLON.AbstractMesh> = {};
  const targetPositions: Record<string, BABYLON.Vector3> = {};

  // --- Player join: create mesh ---
  room.state.players.onAdd((player: any, sessionId: string) => {
    const isLocal = sessionId === room.sessionId;

    const mesh = BABYLON.MeshBuilder.CreateCapsule(
      `player-${sessionId}`,
      { height: 2, radius: 0.5 },
      scene
    );
    mesh.position.set(player.x, 1, player.z);

    const mat = new BABYLON.StandardMaterial(`mat-${sessionId}`, scene);
    mat.diffuseColor = isLocal
      ? BABYLON.Color3.FromHexString("#ff9900")
      : BABYLON.Color3.Gray();
    mesh.material = mat;

    playerMeshes[sessionId] = mesh;
    targetPositions[sessionId] = mesh.position.clone();

    // --- Listen for state changes (remote players) ---
    player.onChange(() => {
      targetPositions[sessionId] = new BABYLON.Vector3(
        player.x,
        1,
        player.z
      );
    });
  });

  // --- Player leave: dispose mesh ---
  room.state.players.onRemove((_player: any, sessionId: string) => {
    playerMeshes[sessionId]?.dispose();
    delete playerMeshes[sessionId];
    delete targetPositions[sessionId];
  });

  // --- Interpolation loop ---
  scene.registerBeforeRender(() => {
    for (const sessionId in playerMeshes) {
      const mesh = playerMeshes[sessionId];
      const target = targetPositions[sessionId];
      if (mesh && target) {
        BABYLON.Vector3.LerpToRef(mesh.position, target, 0.15, mesh.position);
      }
    }
  });

  return room;
}
```

### Sending Input

```typescript
// client/src/input.ts
export function setupMovementInput(
  scene: BABYLON.Scene,
  room: Colyseus.Room
): void {
  scene.onPointerDown = (event: BABYLON.IPointerEvent, pickResult: BABYLON.PickingInfo) => {
    if (event.button === 0 && pickResult.hit && pickResult.pickedPoint) {
      const target = pickResult.pickedPoint.clone();

      // Clamp to arena bounds
      target.x = BABYLON.Scalar.Clamp(target.x, -50, 50);
      target.z = BABYLON.Scalar.Clamp(target.z, -50, 50);

      room.send("move", { x: target.x, z: target.z });
    }
  };
}
```

---

## State Synchronization Strategies

### Interpolation (Recommended Default)

Smooth remote player movement by lerping between server-sent positions. The 0.1–0.2 lerp factor shown above works for casual games at 20Hz server tick rate.

### Client-Side Prediction

For responsive local movement, apply input locally before the server confirms:

```typescript
// Move locally immediately
localMesh.position.x += inputDx;
localMesh.position.z += inputDz;

// Send to server
room.send("move", { x: localMesh.position.x, z: localMesh.position.z });

// On server response, reconcile if drift exceeds threshold
player.onChange(() => {
  const serverPos = new BABYLON.Vector3(player.x, 1, player.z);
  const drift = BABYLON.Vector3.Distance(localMesh.position, serverPos);
  if (drift > 2.0) {
    // Snap-correct if too far off
    localMesh.position.copyFrom(serverPos);
  }
});
```

### Entity Interpolation Buffer

For smoother results in fast-paced games, buffer 2–3 server snapshots and interpolate between them rather than lerping toward the latest:

```typescript
interface Snapshot {
  time: number;
  x: number;
  z: number;
}

const BUFFER_TIME_MS = 100; // render 100ms behind server
const snapshotBuffer: Record<string, Snapshot[]> = {};

// On state change, push snapshot
player.onChange(() => {
  if (!snapshotBuffer[sessionId]) snapshotBuffer[sessionId] = [];
  snapshotBuffer[sessionId].push({
    time: Date.now(),
    x: player.x,
    z: player.z,
  });
  // Keep last 10 snapshots
  if (snapshotBuffer[sessionId].length > 10) {
    snapshotBuffer[sessionId].shift();
  }
});
```

---

## Alternative: WebRTC with Geckos.io

For action games where WebSocket latency is too high, Geckos.io provides UDP-like unreliable messaging over WebRTC DataChannels:

```typescript
// Server
import geckos from "@geckos.io/server";

const io = geckos();
io.listen(3000);

io.onConnection((channel) => {
  channel.onRaw((rawMessage) => {
    // Unreliable, unordered — ideal for position updates
  });

  channel.on("reliable-event", (data) => {
    // Reliable, ordered — for chat, damage events
  });
});
```

**Trade-off:** WebRTC setup is more complex (STUN/TURN servers for NAT traversal), but you gain ~20–50ms lower latency compared to WebSocket for position-critical updates.

---

## Performance Considerations

### Bandwidth

- Colyseus delta encoding is efficient — only changed fields are sent.
- Aim for < 50 bytes per player per tick for position data.
- At 20Hz tick rate with 8 players: ~8 KB/s total bandwidth.
- Reduce tick rate to 10Hz for turn-based or slow-paced games.

### Server Tick Rate

| Game Type | Recommended Tick Rate |
|-----------|----------------------|
| Turn-based / puzzle | 5–10 Hz |
| Casual action | 15–20 Hz |
| Competitive shooter | 30–60 Hz (consider Geckos.io) |

### Client-Side Optimizations

- Only send input when it changes — skip duplicate "move" messages.
- Batch multiple inputs into a single message when possible.
- Use `room.state.listen()` for specific field changes instead of `onChange()` when you only need a subset of state.
- Dispose network resources on disconnect: `room.leave()` in `scene.onDispose`.

### Deployment

- Colyseus deploys as a standard Node.js process — use PM2, Docker, or a managed platform.
- For WebSocket connections, ensure your load balancer supports sticky sessions or use Colyseus's built-in presence system with Redis for multi-process scaling.
- Monitor via the built-in panel at `/colyseus` during development.
