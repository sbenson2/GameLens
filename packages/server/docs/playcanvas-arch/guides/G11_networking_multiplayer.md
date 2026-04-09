# Networking & Multiplayer for PlayCanvas Games

> **Category:** guide · **Engine:** PlayCanvas · **Related:** [G1_scripting_system.md](G1_scripting_system.md), [G6_input_handling.md](G6_input_handling.md), [G7_optimization_performance.md](G7_optimization_performance.md)

PlayCanvas does not ship a built-in networking layer, but its Entity-Component-Script architecture integrates cleanly with external multiplayer frameworks. This guide covers the two dominant approaches — **Colyseus** (managed state sync) and **raw WebSocket** (custom protocol) — along with authoritative server patterns, entity interpolation, and PlayCanvas-specific integration points.

## Approach 1: Colyseus Integration

**Colyseus** is an open-source Node.js framework that provides authoritative state management, room-based matchmaking, and automatic state synchronization. It is the officially recommended multiplayer solution in PlayCanvas documentation.

### How Colyseus State Sync Works

1. Server defines a `Schema` — a typed data structure that represents room state.
2. Server mutates the schema; Colyseus detects changes and sends binary patches to clients.
3. Clients receive a local read-only copy of the schema and attach **onChange** listeners.
4. Clients send arbitrary messages to the server; the server decides how to mutate state.

State patches are sent at a configurable rate (default: 20 Hz / 50ms). The client renders at 60 fps, so interpolation bridges the gap.

### Server Setup

```typescript
// server/src/rooms/GameRoom.ts
import { Room, Client } from 'colyseus';
import { Schema, type, MapSchema } from '@colyseus/schema';

class PlayerState extends Schema {
  @type('number') x: number = 0;
  @type('number') y: number = 0;
  @type('number') z: number = 0;
  @type('number') rotY: number = 0;
  @type('number') health: number = 100;
  @type('string') name: string = '';
}

class GameRoomState extends Schema {
  @type({ map: PlayerState }) players = new MapSchema<PlayerState>();
}

export class GameRoom extends Room<GameRoomState> {
  maxClients = 16;

  onCreate(): void {
    this.setState(new GameRoomState());

    // Fixed timestep server simulation
    this.setSimulationInterval((dt) => this.update(dt), 1000 / 20);

    // Handle player input messages
    this.onMessage('input', (client: Client, data: InputData) => {
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      // Authoritative movement — server validates and applies
      const speed = 5.0;
      player.x += data.moveX * speed * (dt / 1000);
      player.z += data.moveZ * speed * (dt / 1000);
      player.rotY = data.rotY;

      // Server-side bounds checking
      player.x = Math.max(-50, Math.min(50, player.x));
      player.z = Math.max(-50, Math.min(50, player.z));
    });
  }

  onJoin(client: Client, options: { name: string }): void {
    const player = new PlayerState();
    player.name = options.name || 'Player';
    // Spawn at random position
    player.x = (Math.random() - 0.5) * 20;
    player.z = (Math.random() - 0.5) * 20;
    this.state.players.set(client.sessionId, player);
  }

  onLeave(client: Client): void {
    this.state.players.delete(client.sessionId);
  }

  update(dt: number): void {
    // Game logic: projectiles, AI, pickups, etc.
  }
}
```

### PlayCanvas Client Script

In PlayCanvas, networking logic lives in a **Script Component** attached to a manager entity:

```typescript
// NetworkManager.ts — PlayCanvas script component
import * as pc from 'playcanvas';
import { Client, Room } from 'colyseus.js';

interface InputData {
  moveX: number;
  moveZ: number;
  rotY: number;
}

class NetworkManager extends pc.ScriptType {
  private client!: Client;
  private room!: Room;
  private remotePlayers: Map<string, pc.Entity> = new Map();
  private playerTemplate!: pc.Entity;

  initialize(): void {
    // Colyseus client — connect to game server
    this.client = new Client('wss://game.example.com');

    // Reference to a template entity for remote players
    this.playerTemplate = this.app.root.findByName('PlayerTemplate') as pc.Entity;
    this.playerTemplate.enabled = false;

    this.joinRoom();
  }

  async joinRoom(): Promise<void> {
    try {
      this.room = await this.client.joinOrCreate('game_room', {
        name: 'Player1',
      });

      // Listen for state changes on the players map
      this.room.state.players.onAdd((player: any, sessionId: string) => {
        if (sessionId === this.room.sessionId) {
          // Local player — already controlled by input script
          return;
        }
        this.spawnRemotePlayer(sessionId, player);
      });

      this.room.state.players.onRemove((_player: any, sessionId: string) => {
        this.removeRemotePlayer(sessionId);
      });
    } catch (err) {
      console.error('Failed to join room:', err);
    }
  }

  private spawnRemotePlayer(sessionId: string, state: any): void {
    const entity = this.playerTemplate.clone() as pc.Entity;
    entity.enabled = true;
    entity.name = `Remote_${sessionId}`;
    this.app.root.addChild(entity);
    this.remotePlayers.set(sessionId, entity);

    // Attach interpolation data
    (entity as any)._netState = {
      prevPos: new pc.Vec3(state.x, state.y, state.z),
      targetPos: new pc.Vec3(state.x, state.y, state.z),
      targetRotY: state.rotY,
      lerpT: 1.0,
    };

    // Listen for state changes on this specific player
    state.onChange(() => {
      const ns = (entity as any)._netState;
      ns.prevPos.copy(entity.getLocalPosition());
      ns.targetPos.set(state.x, state.y, state.z);
      ns.targetRotY = state.rotY;
      ns.lerpT = 0;
    });
  }

  private removeRemotePlayer(sessionId: string): void {
    const entity = this.remotePlayers.get(sessionId);
    if (entity) {
      entity.destroy();
      this.remotePlayers.delete(sessionId);
    }
  }

  update(dt: number): void {
    if (!this.room) return;

    // Send local player input to server
    this.sendInput();

    // Interpolate remote players
    this.interpolateRemotePlayers(dt);
  }

  private sendInput(): void {
    const input: InputData = {
      moveX: this.app.keyboard.isPressed(pc.KEY_D) ? 1 :
             this.app.keyboard.isPressed(pc.KEY_A) ? -1 : 0,
      moveZ: this.app.keyboard.isPressed(pc.KEY_W) ? -1 :
             this.app.keyboard.isPressed(pc.KEY_S) ? 1 : 0,
      rotY: this.entity.getLocalEulerAngles().y,
    };

    // Only send if there's actual input
    if (input.moveX !== 0 || input.moveZ !== 0) {
      this.room.send('input', input);
    }
  }

  private interpolateRemotePlayers(dt: number): void {
    // Colyseus sends at 20Hz (50ms). Interpolate over that interval.
    const INTERP_RATE = 1.0 / 0.05; // 20 per second

    for (const [, entity] of this.remotePlayers) {
      const ns = (entity as any)._netState;
      if (!ns || ns.lerpT >= 1.0) continue;

      ns.lerpT = Math.min(1.0, ns.lerpT + dt * INTERP_RATE);

      // Smooth position interpolation
      const pos = new pc.Vec3();
      pos.lerp(ns.prevPos, ns.targetPos, ns.lerpT);
      entity.setLocalPosition(pos);

      // Smooth rotation interpolation
      const currentRotY = entity.getLocalEulerAngles().y;
      const newRotY = pc.math.lerp(currentRotY, ns.targetRotY, ns.lerpT);
      entity.setLocalEulerAngles(0, newRotY, 0);
    }
  }
}

// Register script
pc.registerScript(NetworkManager, 'networkManager');
```

## Approach 2: Raw WebSocket (Custom Protocol)

For simpler games or custom requirements, a raw WebSocket server gives full control:

```typescript
// server.ts — lightweight Node.js WebSocket server
import { WebSocketServer, WebSocket } from 'ws';

interface Player {
  ws: WebSocket;
  id: number;
  x: number; y: number; z: number;
  rotY: number;
}

const wss = new WebSocketServer({ port: 8080 });
const players = new Map<number, Player>();
let nextId = 1;

wss.on('connection', (ws) => {
  const player: Player = {
    ws, id: nextId++,
    x: 0, y: 0, z: 0, rotY: 0,
  };
  players.set(player.id, player);

  // Send player their ID and current world state
  ws.send(JSON.stringify({
    type: 'init',
    id: player.id,
    players: [...players.values()].map(p => ({
      id: p.id, x: p.x, y: p.y, z: p.z, rotY: p.rotY,
    })),
  }));

  // Notify others
  broadcast({ type: 'join', id: player.id, x: 0, y: 0, z: 0 }, player.id);

  ws.on('message', (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.type === 'input') {
      // Authoritative update
      const speed = 5.0 * (1 / 20); // per tick
      player.x += msg.moveX * speed;
      player.z += msg.moveZ * speed;
      player.rotY = msg.rotY;
    }
  });

  ws.on('close', () => {
    players.delete(player.id);
    broadcast({ type: 'leave', id: player.id });
  });
});

// Broadcast state at 20Hz
setInterval(() => {
  const state = [...players.values()].map(p => ({
    id: p.id, x: p.x, y: p.y, z: p.z, rotY: p.rotY,
  }));
  broadcast({ type: 'state', players: state });
}, 50);

function broadcast(data: any, excludeId?: number): void {
  const msg = JSON.stringify(data);
  for (const [id, player] of players) {
    if (id !== excludeId && player.ws.readyState === WebSocket.OPEN) {
      player.ws.send(msg);
    }
  }
}
```

## PlayNetwork: Server-Side Engine

For large-scale projects, **PlayNetwork** runs the PlayCanvas engine on the server for truly authoritative simulation — physics, collision, and game logic execute server-side with the same engine code:

```typescript
// PlayNetwork server — authoritative PlayCanvas on Node.js
import { Application } from 'playcanvas';
import { PlayNetwork } from 'playnetwork';

const app = new Application();
const network = new PlayNetwork(app, {
  tickRate: 20,
  maxPlayers: 64,
});

network.on('join', (player) => {
  // Server spawns entity with full PlayCanvas components
  const entity = new pc.Entity();
  entity.addComponent('rigidbody', { type: 'dynamic' });
  entity.addComponent('collision', { type: 'capsule' });
  app.root.addChild(entity);

  player.entity = entity;
});

// Game logic runs on server with real physics
app.on('update', (dt) => {
  // PlayCanvas physics runs here, same API as client
});
```

## Client-Side Prediction in PlayCanvas

For responsive local player movement, apply prediction and reconcile with server state:

```typescript
class PredictedMovement extends pc.ScriptType {
  private inputSeq: number = 0;
  private pendingInputs: Array<{ seq: number; moveX: number; moveZ: number }> = [];
  private speed: number = 5.0;

  update(dt: number): void {
    const moveX = this.app.keyboard.isPressed(pc.KEY_D) ? 1 :
                  this.app.keyboard.isPressed(pc.KEY_A) ? -1 : 0;
    const moveZ = this.app.keyboard.isPressed(pc.KEY_W) ? -1 :
                  this.app.keyboard.isPressed(pc.KEY_S) ? 1 : 0;

    if (moveX === 0 && moveZ === 0) return;

    const input = { seq: this.inputSeq++, moveX, moveZ };

    // 1. Apply locally (prediction)
    const pos = this.entity.getLocalPosition();
    pos.x += moveX * this.speed * dt;
    pos.z += moveZ * this.speed * dt;
    this.entity.setLocalPosition(pos);

    // 2. Send to server
    this.sendInput(input);

    // 3. Store for reconciliation
    this.pendingInputs.push(input);
  }

  /**
   * Called when server state arrives. Reconcile predicted position.
   */
  onServerState(serverPos: pc.Vec3, lastProcessedSeq: number): void {
    // Remove acknowledged inputs
    this.pendingInputs = this.pendingInputs.filter(i => i.seq > lastProcessedSeq);

    // Re-apply remaining inputs on top of server state
    const reconciledPos = serverPos.clone();
    const dt = 1 / 20; // server tick rate
    for (const input of this.pendingInputs) {
      reconciledPos.x += input.moveX * this.speed * dt;
      reconciledPos.z += input.moveZ * this.speed * dt;
    }

    this.entity.setLocalPosition(reconciledPos);
  }

  private sendInput(input: { seq: number; moveX: number; moveZ: number }): void {
    // Send via NetworkManager reference
    const netMgr = this.app.root.findByName('NetworkManager');
    if (netMgr?.script?.networkManager) {
      (netMgr.script.networkManager as any).room.send('input', input);
    }
  }
}

pc.registerScript(PredictedMovement, 'predictedMovement');
```

## Binary Serialization for Bandwidth

For games with many players, switch from JSON to binary to save bandwidth:

```typescript
// Binary state encoding — 14 bytes per player vs ~80 bytes JSON
function encodeState(players: Map<number, Player>): ArrayBuffer {
  const buffer = new ArrayBuffer(2 + players.size * 14);
  const view = new DataView(buffer);
  view.setUint16(0, players.size, true);

  let offset = 2;
  for (const [, p] of players) {
    view.setUint16(offset, p.id, true);          // 2 bytes
    view.setFloat32(offset + 2, p.x, true);      // 4 bytes
    view.setFloat32(offset + 6, p.z, true);      // 4 bytes
    view.setFloat32(offset + 10, p.rotY, true);  // 4 bytes
    offset += 14;
  }
  return buffer;
}

// Client decode
function decodeState(buffer: ArrayBuffer): Array<{id: number; x: number; z: number; rotY: number}> {
  const view = new DataView(buffer);
  const count = view.getUint16(0, true);
  const players = [];

  let offset = 2;
  for (let i = 0; i < count; i++) {
    players.push({
      id: view.getUint16(offset, true),
      x: view.getFloat32(offset + 2, true),
      z: view.getFloat32(offset + 6, true),
      rotY: view.getFloat32(offset + 10, true),
    });
    offset += 14;
  }
  return players;
}
```

## Performance Considerations

- **Tick rate**: 20 Hz is the default for Colyseus and suitable for most games. Competitive action games may need 30-60 Hz, which increases server CPU and bandwidth proportionally.
- **Entity count**: Colyseus state patches grow with the number of tracked properties. Use `@filter` decorators to only sync properties relevant to each client (e.g., don't sync enemies behind the player).
- **Interpolation buffer**: Always render remote entities in the past by at least one tick interval (50ms at 20 Hz). This prevents jitter when packets arrive unevenly.
- **Message batching**: Colyseus batches state patches automatically. For custom protocols, batch outgoing messages per tick rather than sending per-event.
- **Mobile bandwidth**: Target under 5 KB/s per client for mobile web games. Binary encoding + delta compression helps significantly.

## Choosing Your Approach

| Scenario | Recommended Approach |
|---|---|
| Prototype or jam game (< 8 players) | Raw WebSocket + JSON |
| Casual multiplayer (8-32 players) | Colyseus (managed rooms + state sync) |
| Competitive action game | Colyseus or custom binary + client prediction |
| MMO-scale or physics-authoritative | PlayNetwork (server-side PlayCanvas engine) |
| Peer-to-peer (no dedicated server) | WebRTC DataChannel (limited to < 4 players) |

## Integration Checklist

1. Choose framework: Colyseus for managed state, raw WebSocket for custom needs
2. Set up authoritative server — clients send inputs, server mutates state
3. Create a PlayCanvas `NetworkManager` script to manage connection lifecycle
4. Spawn/destroy remote player entities on join/leave events
5. Interpolate remote entity positions between server updates
6. Add client-side prediction for local player responsiveness
7. Implement reconnection logic with state catch-up
8. Switch to binary serialization once player count exceeds 8
9. Test with simulated latency (Chrome DevTools Network throttling)
10. Profile server tick time — keep under 50% of tick budget (25ms at 20 Hz)
