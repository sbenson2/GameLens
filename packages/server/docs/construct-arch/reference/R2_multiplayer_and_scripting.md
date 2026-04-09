# R2 — Multiplayer and Scripting API Reference

> **Category:** reference · **Engine:** Construct · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Event Sheet Patterns](../guides/G1_event_sheet_patterns.md) · [R1 Behaviors and Effects](R1_behaviors_and_effects.md)

---

## Overview

Construct 3 provides two advanced systems that extend its visual-scripting foundation: a **built-in Multiplayer object** for real-time peer-to-peer games using WebRTC, and a **JavaScript Scripting API** for writing code alongside or instead of event sheets. This reference covers both.

---

## Part 1: Multiplayer

Construct 3's Multiplayer object uses **WebRTC DataChannels** for peer-to-peer networking. Game data travels directly between players — the signalling server only brokers the initial connection.

### Architecture

```
┌──────────────┐        ┌──────────────────┐        ┌──────────────┐
│   Peer A     │◄──────►│ Signalling Server │◄──────►│   Peer B     │
│  (Browser)   │  WSS   │  (WebSocket)      │  WSS   │  (Browser)   │
└──────┬───────┘        └──────────────────┘        └──────┬───────┘
       │                                                    │
       └────────────── WebRTC DataChannel ─────────────────┘
                     (direct P2P game data)
```

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Signalling Server** | WebSocket server that relays connection metadata (not game data). Scirra hosts a free one at `wss://multiplayer.scirra.com` |
| **Room** | A named lobby on the signalling server where peers find each other |
| **Host** | The authoritative peer that owns the game state and relays it to others |
| **Peer** | A client connected to the host. Receives state updates, sends input |
| **Sync Object** | An object type registered for automatic state synchronization |
| **Input Peer** | The peer whose input controls a specific synced instance |

### Multiplayer Workflow (Event Sheet)

#### Step 1 — Connect to Signalling Server

| Condition | Action |
|-----------|--------|
| On start of layout | Multiplayer → Connect to `wss://multiplayer.scirra.com` |
| Multiplayer: On connected | Multiplayer → Log in with alias |
| Multiplayer: On logged in | Multiplayer → Join room "my-game-room" (max peers: 4) |

#### Step 2 — Room and Host Assignment

| Condition | Action |
|-----------|--------|
| Multiplayer: On joined room | Check if host: `Multiplayer.IsHost` |
| Multiplayer: Is host | Go to "HostLayout" |
| Multiplayer: Is peer | Go to "PeerLayout" |

#### Step 3 — Object Synchronization (Host)

| Condition | Action |
|-----------|--------|
| On start of layout | Multiplayer → Auto-sync object `PlayerShip` |
| Multiplayer: On peer connected | Create `PlayerShip` for new peer, assign as input peer |

#### Step 4 — Input Handling (Peers)

Peers send input values; the host applies them:

| Condition | Action |
|-----------|--------|
| Every tick | Multiplayer → Send client input: `"up"` = Keyboard.IsKeyDown("W") |
| (Host) For each synced `PlayerShip` | Read input `"up"` from associated peer, apply movement |

### Sync Modes

| Mode | Behavior | Use Case |
|------|----------|----------|
| **Unreliable** | UDP-like: fast, no guaranteed delivery | Position, rotation (high-frequency updates) |
| **Reliable ordered** | TCP-like: guaranteed, in order | Chat messages, game events |

### Multiplayer Conditions Reference

| Condition | Fires When |
|-----------|-----------|
| On connected | WebSocket connection to signalling server established |
| On logged in | Alias accepted by server |
| On joined room | Successfully entered a room |
| On peer connected | A new peer joins (host-side) |
| On peer disconnected | A peer leaves or drops |
| On kicked | This peer was removed from the room |
| On error | Connection or signalling error occurred |

### Multiplayer Actions Reference

| Action | What It Does |
|--------|-------------|
| Connect | Open WebSocket to signalling server URL |
| Log in | Register a display alias |
| Join room | Enter a named room (auto-creates if first) |
| Leave room | Disconnect from current room |
| Auto-sync object | Register an object type for automatic state sync |
| Sync object | Manually trigger a state update for an object |
| Associate object with peer | Link a synced instance to a specific peer's input |
| Send client input | (Peer) Send named input values to host |
| Disconnect | Close all connections |

### Hosting Your Own Signalling Server

Scirra provides an open-source signalling server you can self-host:

- Available as a standalone download from the Construct asset store
- Node.js-based WebSocket server
- Supports WSS (TLS) for production deployment
- No game data passes through it — only connection brokering
- Recommended for production games that need reliability beyond the free server

### Multiplayer Limitations

- **P2P topology** — no dedicated game server; the host is a player's browser. If the host disconnects, the session ends.
- **NAT traversal** — WebRTC uses STUN/TURN, but some network configurations block P2P connections.
- **Player count** — practical limit of ~8–16 peers depending on game complexity and bandwidth.
- **No server authority** — the host can be cheated. For competitive games, consider a server-authoritative approach using Colyseus or a custom backend.

---

## Part 2: JavaScript Scripting API

Construct 3 supports JavaScript (and TypeScript) alongside event sheets. Scripts can replace actions, run in dedicated script files, or interact with event sheet logic.

### Scripting Modes

| Mode | How It Works |
|------|-------------|
| **Script actions** | Replace an event sheet action with inline JS code |
| **Script files** | Standalone `.js` or `.ts` files in the project's Scripts folder |
| **Event sheet integration** | Call JS functions from events, call Construct APIs from JS |

### The Runtime API

All scripting goes through the `runtime` object (an instance of `IRuntime`):

```javascript
// Access in a script file's "On start of layout" event
runOnStartup(async runtime => {
    // runtime is available here
    runtime.addEventListener("tick", () => onTick(runtime));
});

function onTick(runtime) {
    const player = runtime.objects.PlayerSprite.getFirstInstance();
    if (player) {
        player.x += 2;
    }
}
```

### Key Interfaces

| Interface | Access Via | Purpose |
|-----------|-----------|---------|
| `IRuntime` | `runtime` parameter | Global access: objects, layout, keyboard, mouse, audio, storage |
| `IObjectClass` | `runtime.objects.ObjectName` | Access all instances of an object type |
| `IInstance` | `instance` / iteration | A single object instance (position, size, angle, etc.) |
| `IWorldInstance` | extends `IInstance` | Instance with position in the world (x, y, width, height, angle) |
| `ISpriteInstance` | extends `IWorldInstance` | Sprite-specific: animation frame, speed, blending |
| `ILayout` | `runtime.layout` | Current layout properties and layers |
| `ILayer` | `runtime.layout.getLayer("name")` | Layer properties (scroll, parallax, opacity) |
| `IBehaviorInstance` | `instance.behaviors.BehaviorName` | Per-instance behavior API (Platform, Bullet, etc.) |

### Common Scripting Patterns

#### Instance Access

```javascript
// Get all instances of an object type
const enemies = runtime.objects.Enemy.getAllInstances();

// Get first (or only) instance
const player = runtime.objects.Player.getFirstInstance();

// Create an instance
const bullet = runtime.objects.Bullet.createInstance("GameLayer", x, y);

// Destroy an instance
enemy.destroy();
```

#### Instance Properties

```javascript
// Position and transform
instance.x = 100;
instance.y = 200;
instance.angle = Math.PI / 4;       // Radians
instance.angleDegrees = 45;         // Degrees (convenience)
instance.width = 64;
instance.height = 64;
instance.opacity = 0.5;             // 0–1

// Sprite-specific
sprite.animationFrame = 3;
sprite.animationSpeed = 15;
sprite.setAnimation("walk");
```

#### Behavior Access

```javascript
// Platform behavior
const plat = player.behaviors.Platform;
plat.maxSpeed = 300;
plat.isOnFloor;              // Read-only boolean
plat.simulateControl("left"); // Simulate input

// Bullet behavior
const bul = projectile.behaviors.Bullet;
bul.speed = 400;
bul.angleOfMotion = Math.atan2(dy, dx);
```

#### Keyboard and Mouse Input

```javascript
// In a tick handler
const keyboard = runtime.keyboard;
if (keyboard.isKeyDown("ArrowLeft")) {
    player.x -= 5;
}

const mouse = runtime.mouse;
const [mx, my] = mouse.getMousePosition("GameLayer");
```

#### Communicating Between Events and Scripts

```javascript
// From a script, dispatch an event that event sheets can listen to
runtime.callFunction("MyEventFunction", param1, param2);

// From an event sheet action, call a JS function
// Use the "Run script" action or a Script action in the event
```

#### Async Operations

```javascript
// Storage (IndexedDB-based)
await runtime.storage.setItem("highScore", 9999);
const score = await runtime.storage.getItem("highScore");

// Audio
const sound = runtime.objects.Audio;
// Use event sheet Audio actions for most audio — scripting API is limited
```

### TypeScript Support

Construct 3 supports TypeScript in script files. The editor provides autocompletion for the runtime API. TypeScript files (`.ts`) are transpiled automatically during preview and export.

```typescript
// Type-safe instance access
const player: ISpriteInstance = runtime.objects.Player.getFirstInstance()!;
player.x += runtime.dt * speed;  // runtime.dt = delta time in seconds
```

### Scripting vs. Event Sheets

| Prefer Event Sheets When | Prefer Scripts When |
|-------------------------|---------------------|
| Prototyping quickly | Complex algorithms (pathfinding, procedural generation) |
| Designers need to modify logic | Integrating third-party libraries |
| Simple collision responses | Data processing (JSON parsing, API calls) |
| Tweaking behaviors and properties | Type safety and IDE tooling matter |
| Visual clarity for team collaboration | Reusing code across projects |

### Script Performance Notes

- The scripting API adds a thin wrapper over the engine internals. For most games, the overhead is negligible.
- `runtime.dt` (delta time in seconds) should be used for frame-rate independent movement.
- Avoid creating instances or accessing `getAllInstances()` every tick when possible — cache references.
- Use `runtime.addEventListener("tick", fn)` for per-frame logic instead of polling.

---

## Combining Multiplayer and Scripting

For advanced multiplayer games, you can use the Multiplayer scripting interface:

```javascript
const mp = runtime.objects.Multiplayer.getFirstInstance();

// The Multiplayer script interface (IMultiplayerObjectType) provides
// programmatic access to the same actions available in event sheets.
// However, most multiplayer logic is easier to express in event sheets
// due to the condition/action structure matching the connection lifecycle.
```

For server-authoritative multiplayer, consider the **Colyseus SDK addon** for Construct 3, which provides a full-featured multiplayer server framework:

- Server code runs on Node.js (Colyseus framework)
- Construct 3 addon provides event sheet conditions/actions for connecting, sending, and receiving
- Handles room management, state synchronization, and reconnection
- Better suited for competitive games that need cheat prevention
