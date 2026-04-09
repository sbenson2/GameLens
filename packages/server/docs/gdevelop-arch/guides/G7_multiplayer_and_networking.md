# G7 — Multiplayer and Networking in GDevelop

> **Category:** guide · **Engine:** GDevelop · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Events and Behaviors](G1_events_and_behaviors.md) · [R1 Extensions](../reference/R1_extensions_and_custom_behaviors.md)

---

GDevelop provides two distinct networking paths: the built-in **Multiplayer** feature (managed servers, lobbies, automatic sync) and the lower-level **P2P extension** (WebRTC, manual message passing). Choose based on your game's needs — Multiplayer handles most of the complexity for you, while P2P gives full control at the cost of more manual work.

---

## Built-in Multiplayer (Recommended Path)

GDevelop's official Multiplayer feature, introduced in v5.4, is designed to eliminate the need to manage servers, lobbies, packet loss, or interpolation yourself. It supports up to **8 players** per game session.

### How It Works

The system uses GDevelop's managed infrastructure. Players authenticate via their **gd.games account** and join lobbies hosted by GDevelop's servers. The host (player 1) acts as the source of truth, and the system handles client-side prediction automatically.

```
┌─────────────────────────────────────────────────────────┐
│                   GDevelop Infrastructure                │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐          │
│  │ Player 1 │◄──►│  Server  │◄──►│ Player 2 │          │
│  │  (Host)  │    │ (Relay)  │    │          │          │
│  └──────────┘    └────┬─────┘    └──────────┘          │
│                       │                                  │
│                  ┌────┴─────┐                            │
│                  │ Player 3 │  ... up to 8               │
│                  └──────────┘                            │
└─────────────────────────────────────────────────────────┘
```

### Setting Up Multiplayer

**Step 1 — Enable game properties.** In your project properties, enable multiplayer for the project.

**Step 2 — Add the Multiplayer Object behavior.** For every object that needs to sync across players (characters, projectiles, pickups), add the **"Multiplayer object"** behavior. Configure:

- **Player ownership:** Set which player controls this object. Options are `Host`, `1`, `2`, `3`…`8`. Leave as `Host` for objects controlled by the game (enemies, environment) rather than a specific player.

**Step 3 — Open lobbies.** Use the action **"Open game lobbies"** to display the lobby UI. Players join and are automatically assigned a player number.

**Step 4 — Detect game start.** Use the condition **"Lobby game has just started"** to transition from the lobby to gameplay.

### Object Ownership

Ownership determines which client has authority over an object's state. The owner's inputs drive the object; other clients receive synchronized updates.

```
Condition: Current player number in lobby = 1
Action:    Move PlayerCharacter with Platformer behavior

Condition: Current player number in lobby = 2
Action:    Move PlayerCharacter2 with Platformer behavior
```

**Dynamic ownership changes:** For objects like pickups or passed items, leave ownership as `Host` initially, then use the action **"Change player object ownership"** to transfer control when a player interacts with the object.

### What Gets Synchronized Automatically

When you add the Multiplayer Object behavior, GDevelop syncs these properties across all clients without any extra events:

- **Position and angle** — including smooth interpolation
- **Object variables** — scene and object-scope variables
- **Behavior state** — platformer velocity, physics body state, etc.
- **Visual effects** — applied effects and their parameters
- **Animations** — current animation frame and state

The host resolves conflicts. Client-side prediction keeps movement feeling responsive.

### Key Conditions and Actions

| Type | Name | Purpose |
|------|------|---------|
| Condition | Lobby game has just started | Fires once when all players are ready |
| Condition | Current player number in lobby | Compare the local player's number |
| Condition | Player has joined | Fires when a new player enters |
| Condition | Player has left | Fires when a player disconnects |
| Action | Open game lobbies | Show the lobby join/create UI |
| Action | Change player object ownership | Transfer object authority to another player |
| Action | Send custom message | Send arbitrary data to other players |

### Multiplayer Debugging

Testing multiplayer locally requires running multiple game instances. Open your game preview in multiple browser tabs — each tab acts as a separate player. Player 1 (the first to create the lobby) automatically becomes the host.

---

## P2P Extension (Low-Level Networking)

The **Peer-to-peer (P2P)** extension uses **WebRTC** to establish direct connections between game instances without a relay server. This is better suited for:

- Custom networking protocols beyond what the built-in Multiplayer supports
- Turn-based or low-frequency sync games
- Prototypes where you want full message control

### P2P Connection Flow

```
┌──────────┐         ┌─────────────┐         ┌──────────┐
│ Player A │◄───────►│   Broker    │◄───────►│ Player B │
│          │   ID    │  (signaling │   ID    │          │
└────┬─────┘  share  │   server)   │  share  └────┬─────┘
     │               └─────────────┘               │
     │                                             │
     └─────────── Direct WebRTC link ──────────────┘
```

1. Both players connect to a **broker** (signaling server) and receive a unique **peer ID**.
2. Player A shares their ID with Player B (via UI, lobby, or hardcoded).
3. Player A calls **"Connect to peer"** with Player B's ID.
4. A direct WebRTC connection is established.

### Core P2P Conditions

| Condition | When It Fires |
|-----------|---------------|
| Is P2P ready | Extension initialized, broker connected |
| Event received (event name) | A named message arrived from a peer |
| Peer connected | A remote peer just connected |
| Peer disconnected | A remote peer just disconnected |
| An error occurred | Connection or messaging error |

### Core P2P Actions

| Action | What It Does |
|--------|-------------|
| Connect to peer | Initiate connection using a peer's ID |
| Send event to peer | Send a named message with string data |
| Send event to all | Broadcast a message to all connected peers |
| Disconnect from peer | Close a specific connection |
| Disconnect from all | Close all peer connections |
| Override client ID | Set a custom ID instead of the auto-generated one |

### Core P2P Expressions

| Expression | Returns |
|-----------|---------|
| `P2P::GetID()` | The local peer's unique ID |
| `P2P::GetEventData(name)` | The string data from the last received event with that name |
| `P2P::GetLastError()` | Description of the last error |

### P2P Example — Sync Player Position

```
┌─ Condition: Always (every frame)
│  Action: P2P → Send event "pos" to all
│          Data: Object.X() + ";" + Object.Y()

┌─ Condition: P2P event "pos" received
│  Action: Set Variable(data) to P2P::GetEventData("pos")
│  Action: Set RemotePlayer.X to ToNumber(StrAt(data, 0, ";"))
│  Action: Set RemotePlayer.Y to ToNumber(StrAt(data, 1, ";"))
```

**Important:** P2P sends string data only. Serialize complex state as delimited strings or JSON. Parse on the receiving end.

---

## Choosing Between Multiplayer and P2P

| Factor | Built-in Multiplayer | P2P Extension |
|--------|---------------------|---------------|
| Server management | Handled by GDevelop | No server (WebRTC direct) |
| Lobby system | Built-in UI | You build it |
| Max players | 8 | Depends on WebRTC limits |
| Sync complexity | Automatic | Manual message passing |
| Client prediction | Built-in | You implement it |
| Latency | Server-relayed | Direct (lower latency) |
| Offline/LAN | No (requires GDevelop servers) | Possible with custom broker |
| Subscription required | GDevelop premium features | Free |
| Best for | Action games, platformers | Turn-based, chat, custom protocols |

---

## Common Pitfalls

**Forgetting to set ownership.** If all objects default to Host ownership, players won't be able to control their characters. Assign player numbers to player-controlled objects.

**Sending too much P2P data.** Sending position every frame (60 messages/second) floods the connection. Throttle to 10–20 updates/second and interpolate on the receiving side.

**Testing with one instance.** Multiplayer always needs 2+ game instances. Use multiple browser tabs or devices.

**Mixing P2P and built-in Multiplayer.** These are separate systems. Don't try to use P2P messages alongside the Multiplayer behavior — pick one approach per project.

---

## Community Extensions

- **THNK** — A community framework that simplifies authoritative multiplayer with server-side logic, built as a GDevelop extension. Useful if you need server authority but want to stay in GDevelop's event system.
- **Advanced P2P Event Handling** — Adds higher-level event management on top of the base P2P extension, including connection state tracking and message queuing.
- **PhotonJS Extension** — Integrates the Photon Realtime SDK for room-based multiplayer via Photon's cloud infrastructure.

---

## Next Steps

- **[G1 Events and Behaviors](G1_events_and_behaviors.md)** — Core event system fundamentals needed for multiplayer logic
- **[G2 Custom Functions and Extensions](G2_custom_functions_and_extensions.md)** — Build reusable multiplayer helpers
- **[R2 Variables and Data Management](../reference/R2_variables_and_data_management.md)** — Sync variables across players
