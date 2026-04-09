# Networking and Multiplayer

> **Category:** guide · **Engine:** Love2D · **Related:** [G1 Game Loop & Callbacks](G1_game_loop_and_callbacks.md), [G9 Threading & Channels](G9_threading_and_channels.md)

LÖVE ships with two networking libraries built into the runtime: **luasocket** (TCP/UDP) and **lua-enet** (reliable UDP). For most multiplayer games, lua-enet is the right choice — it provides reliable, ordered delivery over UDP with connection management, which is what real-time games need.

---

## Networking Libraries Bundled with LÖVE

### luasocket

Low-level TCP and UDP sockets. Useful for HTTP requests, REST APIs, and simple client-server chat, but you must handle reliability, ordering, and connection state yourself.

```lua
local socket = require("socket")

-- UDP example
local udp = socket.udp()
udp:settimeout(0) -- non-blocking
udp:setsockname("*", 12345) -- bind to port
```

### lua-enet

Built on the ENet library. Provides reliable and unreliable channels over UDP, automatic connection management, and heartbeat keep-alive. This is the standard choice for real-time multiplayer in LÖVE.

```lua
local enet = require("enet")
```

### Community Libraries

- **sock.lua** — higher-level wrapper around lua-enet with an event system, serialization, and logging. Good for getting started quickly.
- **sync.lua** — entity replication layer on top of lua-enet. Automatically synchronizes game state across peers.
- **LÖVE-Nakama** — client bindings for the Nakama open-source game server.

---

## lua-enet Fundamentals

### Core Concepts

- **Host** — a network endpoint that can send and receive. Both servers and clients create hosts.
- **Peer** — a remote host you are connected to. The server sees each client as a peer.
- **Event** — returned by `host:service()`. Types: `"connect"`, `"disconnect"`, `"receive"`.
- **Channel** — ENet supports multiple channels per connection (0–255). Channel 0 is the default.

### Creating a Server

```lua
local enet = require("enet")

-- Bind to all interfaces on port 6789, allow up to 32 clients
local server = enet.host_create("*:6789", 32)

function love.update(dt)
    if not server then return end
    local event = server:service(0) -- 0 = non-blocking
    while event do
        if event.type == "connect" then
            print("Client connected: " .. tostring(event.peer))
        elseif event.type == "receive" then
            -- event.data is a string; deserialize as needed
            print("Received: " .. event.data)
            -- Echo back to sender
            event.peer:send("ack:" .. event.data)
        elseif event.type == "disconnect" then
            print("Client disconnected: " .. tostring(event.peer))
        end
        event = server:service(0)
    end
end
```

### Creating a Client

```lua
local enet = require("enet")

local client = enet.host_create()  -- no address = client mode
local server_peer = client:connect("localhost:6789")

function love.update(dt)
    if not client then return end
    local event = client:service(0)
    while event do
        if event.type == "connect" then
            print("Connected to server")
            server_peer:send("hello")
        elseif event.type == "receive" then
            print("Server says: " .. event.data)
        elseif event.type == "disconnect" then
            print("Disconnected from server")
        end
        event = client:service(0)
    end
end
```

### Reliability Flags

```lua
-- Reliable, ordered (default) — use for important game events
peer:send(data, channel, "reliable")

-- Unreliable — use for position updates that are sent every frame
peer:send(data, channel, "unreliable")

-- Unsequenced — unreliable and may arrive out of order
peer:send(data, channel, "unsequenced")
```

**Rule of thumb:** Use `"reliable"` for state changes (player joined, item picked up, chat messages). Use `"unreliable"` for frequent updates (position, rotation) where only the latest value matters.

---

## Serialization

lua-enet sends and receives raw strings. You need to serialize your game data. Common approaches:

### JSON (simple, human-readable, slower)

```lua
local json = require("lib.json")  -- dkjson, lunajson, etc.

-- Send
local data = json.encode({ type = "move", x = player.x, y = player.y })
peer:send(data)

-- Receive
local msg = json.decode(event.data)
if msg.type == "move" then
    -- update remote player position
end
```

### String Packing (fast, compact)

```lua
-- Send position as "x,y" — minimal overhead
peer:send(string.format("P%.1f,%.1f", player.x, player.y), 0, "unreliable")

-- Receive
local prefix = event.data:sub(1, 1)
if prefix == "P" then
    local x, y = event.data:match("P(%-?%d+%.?%d*),(%-?%d+%.?%d*)")
    -- update position
end
```

### love.data.pack / love.data.unpack (binary, efficient)

```lua
-- Pack two floats into binary
local packed = love.data.pack("string", "ff", player.x, player.y)
peer:send(packed, 0, "unreliable")

-- Unpack
local x, y = love.data.unpack("ff", event.data)
```

### bitser (used by sock.lua)

```lua
local bitser = require("lib.bitser")
peer:send(bitser.dumps({ type = "move", x = 10, y = 20 }))
local msg = bitser.loads(event.data)
```

---

## Game Loop Integration

### Non-Blocking Service Calls

Always use `host:service(0)` (timeout = 0) inside `love.update(dt)` so networking never blocks the game loop. Process all pending events in a while loop:

```lua
function love.update(dt)
    local event = host:service(0)
    while event do
        handle_network_event(event)
        event = host:service(0)
    end

    -- Then run normal game update
    update_game(dt)
end
```

### Tick Rate vs Frame Rate

For authoritative servers, decouple the network tick rate from the render frame rate:

```lua
local TICK_RATE = 1 / 20  -- 20 ticks per second
local tick_accumulator = 0

function love.update(dt)
    -- Always process incoming events
    process_network_events()

    -- Send state updates at a fixed rate
    tick_accumulator = tick_accumulator + dt
    while tick_accumulator >= TICK_RATE do
        send_state_update()
        tick_accumulator = tick_accumulator - TICK_RATE
    end
end
```

---

## Architecture Patterns

### Client-Server (Authoritative)

The server owns game state. Clients send inputs; the server simulates and broadcasts results. Prevents most cheating.

```
Client A  ──input──▶  Server  ──state──▶  Client A
Client B  ──input──▶  Server  ──state──▶  Client B
```

### Client-Server (Client-Predicted)

Clients simulate locally for responsiveness, then reconcile with authoritative server state. Standard for action games.

```lua
-- Client: apply input immediately, store in history
local input = { dx = 1, dy = 0, seq = self.sequence }
apply_input(player, input)
table.insert(self.input_history, input)
peer:send(serialize(input), 0, "reliable")

-- On server state received: rewind and replay unacknowledged inputs
```

### Peer-to-Peer

Each peer sends state to all others. Simpler topology, but harder to prevent cheating and scales poorly beyond 4–8 players. Works well for co-op and local network games.

### Lockstep

All peers exchange inputs each frame and simulate deterministically. Used in RTS games. Requires deterministic Lua math (avoid floating-point divergence across platforms).

---

## Common Pitfalls

1. **Blocking service calls** — `host:service(1000)` blocks for up to 1 second. Always use `host:service(0)` in the game loop.
2. **Sending tables directly** — `peer:send(my_table)` fails silently or errors. Always serialize to a string first.
3. **Not handling disconnects** — Always clean up player data when you receive a `"disconnect"` event.
4. **Sending too much data** — Sending full state every frame saturates bandwidth. Send deltas or only changed values.
5. **Ignoring latency** — Without interpolation or prediction, remote entities will stutter. Interpolate between received states.
6. **Running server in love.draw** — Network logic belongs in `love.update(dt)`, never in the draw callback.

---

## Dedicated Server Without a Window

For headless servers (no graphics), run LÖVE with `conf.lua` settings that disable rendering:

```lua
-- conf.lua (server build)
function love.conf(t)
    t.window = false       -- no window
    t.modules.graphics = false
    t.modules.window = false
    t.modules.audio = false
    t.modules.sound = false
    t.modules.image = false
    t.modules.font = false
end
```

The game loop still runs (`love.update(dt)` is called), but no window is created and GPU modules are not loaded.

---

## Testing Multiplayer Locally

Run multiple LÖVE instances on the same machine, connecting to `localhost`:

```bash
# Terminal 1: server
love . --server

# Terminal 2: client
love . --client
```

Parse command-line arguments in `love.load()`:

```lua
function love.load(args)
    for _, arg in ipairs(args) do
        if arg == "--server" then
            start_server()
        elseif arg == "--client" then
            start_client()
        end
    end
end
```

Use `arg` (the global table LÖVE provides) or the args parameter passed to `love.load()` — both contain command-line arguments after the game path.
