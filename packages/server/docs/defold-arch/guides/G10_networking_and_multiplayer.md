# G10 — Networking & Multiplayer

> **Category:** guide · **Engine:** Defold · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Message Passing](G1_message_passing.md) · [G6 Native Extensions & Build](G6_native_extensions_and_build.md)

---

## Networking in Defold

Defold bundles **LuaSocket** for TCP/UDP communication and provides official extensions for HTTP and WebSocket. For production multiplayer, the community gravitates toward backend frameworks like **Nakama** and **Asobi** that handle authentication, matchmaking, and real-time sync out of the box.

This guide covers the networking stack from low-level sockets up to production multiplayer patterns.

---

## HTTP Requests

Defold's built-in `http.request()` is the simplest way to talk to web APIs. It is asynchronous — you provide a callback that fires when the response arrives.

```lua
local function http_callback(self, id, response)
    if response.status == 200 then
        local data = json.decode(response.response)
        print("Got data:", data.name)
    else
        print("HTTP error:", response.status)
    end
end

function init(self)
    http.request(
        "https://api.example.com/player/123",
        "GET",
        http_callback
    )
end
```

### POST with JSON Body

```lua
local headers = {
    ["Content-Type"] = "application/json"
}
local body = json.encode({ score = 9001, name = "Player1" })

http.request(
    "https://api.example.com/scores",
    "POST",
    http_callback,
    headers,
    body
)
```

### http.request() Parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `url` | string | Full URL including protocol |
| `method` | string | `"GET"`, `"POST"`, `"PUT"`, `"DELETE"`, etc. |
| `callback` | function | `function(self, id, response)` |
| `headers` | table | Optional key-value header pairs |
| `post_data` | string | Optional request body |
| `options` | table | Optional: `timeout` (seconds), `chunked_transfer` |

### Response Table

| Field | Type | Description |
|-------|------|-------------|
| `status` | number | HTTP status code (200, 404, etc.) |
| `response` | string | Response body |
| `headers` | table | Response headers |

---

## WebSockets

For real-time bidirectional communication, use the official **WebSocket extension**. Add it to your project dependencies in `game.project`:

```
[project]
dependencies = https://github.com/defold/extension-websocket/archive/master.zip
```

### Basic WebSocket Usage

```lua
local websocket = require("websocket.websocket")

local function ws_callback(self, conn, data)
    if data.event == websocket.EVENT_CONNECTED then
        print("Connected!")
        websocket.send(conn, json.encode({ type = "join", room = "lobby" }))

    elseif data.event == websocket.EVENT_DISCONNECTED then
        print("Disconnected:", data.code, data.reason)

    elseif data.event == websocket.EVENT_MESSAGE then
        local msg = json.decode(data.message)
        print("Received:", msg.type)

    elseif data.event == websocket.EVENT_ERROR then
        print("WebSocket error:", data.error)
    end
end

function init(self)
    local params = {
        timeout = 5000,             -- connection timeout in ms
        type = "TEXT"                -- or "BINARY"
    }
    self.ws = websocket.connect("wss://game.example.com/ws", params, ws_callback)
end

function final(self)
    if self.ws then
        websocket.disconnect(self.ws)
    end
end
```

### WebSocket Events

| Event | When |
|-------|------|
| `EVENT_CONNECTED` | Connection established |
| `EVENT_DISCONNECTED` | Connection closed (includes `code` and `reason`) |
| `EVENT_MESSAGE` | Message received (`data.message` contains payload) |
| `EVENT_ERROR` | Error occurred (`data.error` contains description) |

---

## Raw TCP/UDP with LuaSocket

Defold includes LuaSocket for low-level networking. Useful for custom protocols or LAN discovery, but requires careful non-blocking handling to avoid freezing the game loop.

### Non-Blocking TCP Client

```lua
local socket = require("socket")

function init(self)
    self.tcp = socket.tcp()
    self.tcp:settimeout(0)  -- CRITICAL: non-blocking mode
    self.tcp:connect("127.0.0.1", 12345)
    self.buffer = ""
end

function update(self, dt)
    -- Try to receive data (non-blocking)
    local data, err, partial = self.tcp:receive("*l")
    if data then
        handle_message(data)
    elseif partial and #partial > 0 then
        self.buffer = self.buffer .. partial
    end
end

function final(self)
    self.tcp:close()
end
```

### UDP for Fast Unreliable Messages

```lua
local socket = require("socket")

function init(self)
    self.udp = socket.udp()
    self.udp:settimeout(0)
    self.udp:setpeername("127.0.0.1", 12345)
end

function update(self, dt)
    -- Send player position (unreliable, fast)
    local msg = string.format("%d,%d", self.x, self.y)
    self.udp:send(msg)

    -- Receive
    local data = self.udp:receive()
    if data then
        local x, y = data:match("(%d+),(%d+)")
        -- Update remote player position
    end
end
```

**Warning:** Always call `settimeout(0)` on sockets used in the game loop. A blocking socket will freeze the entire game until data arrives or the timeout expires.

---

## Multiplayer with Nakama

**Nakama** by Heroic Labs is the most widely used multiplayer backend in the Defold community. It provides authentication, matchmaking, real-time multiplayer, leaderboards, and storage — all with an official Defold client.

### Setup

Add both Nakama and the WebSocket extension to `game.project` dependencies:

```
[project]
dependencies = https://github.com/heroiclabs/nakama-defold/archive/master.zip
    https://github.com/defold/extension-websocket/archive/master.zip
```

### Authentication

```lua
local nakama = require("nakama.nakama")
local defold = require("nakama.engine.defold")

function init(self)
    local config = {
        host = "127.0.0.1",
        port = 7350,
        use_ssl = false,
        engine = defold,
    }
    self.client = nakama.create_client(config)

    -- Device-based authentication (simplest for prototyping)
    local device_id = sys.get_sys_info().device_ident
    nakama.authenticate_device(self.client, device_id, nil, true, "player1",
        function(result)
            if not result.error then
                print("Authenticated:", result.username)
                connect_socket(self)
            end
        end
    )
end
```

### Real-Time Match

```lua
local function connect_socket(self)
    nakama.create_socket(self.client, function(socket)
        self.socket = socket

        -- Listen for match data
        nakama.on_matchdata(socket, function(message)
            local data = json.decode(message.match_data.data)
            local op_code = message.match_data.op_code
            handle_match_data(op_code, data)
        end)

        -- Create or join a match
        nakama.match_create(socket, function(result)
            self.match_id = result.match.match_id
            print("Match created:", self.match_id)
        end)
    end)
end

-- Send game state to other players
function send_position(self, x, y)
    local data = json.encode({ x = x, y = y })
    nakama.match_data_send(self.socket, self.match_id, 1, data)
end
```

### Nakama Op Codes

Use numeric op codes to distinguish message types in match data:

| Op Code | Meaning |
|---------|---------|
| 1 | Position update |
| 2 | Action / attack |
| 3 | State sync (full) |
| 4 | Chat message |

Define these as constants in a shared module so client and server-side match handlers agree.

---

## Multiplayer Architecture Patterns

### Client-Server (Authoritative)

The server owns the game state. Clients send inputs, server validates and broadcasts results. Best for competitive games where cheating prevention matters.

```
Client A → [input] → Server → [state] → Client A
                            → [state] → Client B
```

Use Nakama's **server-side match handlers** (written in Lua, Go, or TypeScript) for authoritative logic.

### Peer-to-Peer (Relay)

Clients send state directly to each other through a relay server. Simpler to implement but vulnerable to cheating. Good for cooperative or casual games.

```
Client A → [state] → Relay → [state] → Client B
Client B → [state] → Relay → [state] → Client A
```

Nakama supports this via its relayed multiplayer mode — no server-side match handler needed.

### State Synchronization Tips

| Technique | When to Use |
|-----------|-------------|
| **Snapshot interpolation** | Smooth rendering between infrequent state updates |
| **Client-side prediction** | Reduce perceived latency for local player movement |
| **Delta compression** | Send only what changed since last update |
| **Input buffering** | Collect inputs and send at fixed intervals (e.g., 20Hz) |

---

## DefNet Utility Library

**DefNet** by Björn Ritzl provides pre-built networking modules for common patterns:

| Module | Purpose |
|--------|---------|
| `p2p_discovery` | LAN peer discovery via UDP broadcast |
| `tcp_server` / `tcp_client` | Simple TCP wrappers with message framing |
| `http_server` | Lightweight HTTP server running inside the game |

Add to dependencies:

```
[project]
dependencies = https://github.com/britzl/defnet/archive/master.zip
```

Example — LAN discovery:

```lua
local p2p = require("defnet.p2p_discovery")

function init(self)
    -- Broadcast presence on port 50000
    self.p2p = p2p.create(50000)
    self.p2p.broadcast("my_game_server")
end

function update(self, dt)
    self.p2p.update()
end
```

---

## Security Considerations

| Risk | Mitigation |
|------|------------|
| Man-in-the-middle | Always use `wss://` (TLS) for WebSockets and `https://` for HTTP |
| Token leakage | Store auth tokens with `sys.save()` to app-private storage, never in plaintext files |
| Replay attacks | Include timestamps or nonces in messages; validate server-side |
| Client tampering | Never trust client-sent game state in competitive games — validate on server |
| DDoS on game server | Use rate limiting and connection throttling on your backend |

---

## Common Pitfalls

| Problem | Cause | Fix |
|---------|-------|-----|
| Game freezes during network call | Blocking socket (`settimeout` not set to 0) | Always call `settimeout(0)` on raw sockets |
| `http.request` callback never fires | URL unreachable or CORS on web builds | Test URL manually; for HTML5 builds, ensure server sends CORS headers |
| WebSocket disconnects silently | Server timeout on idle connections | Send periodic ping/heartbeat messages |
| Nakama auth fails on HTML5 | Missing WebSocket extension | Add `extension-websocket` to dependencies |
| Messages arrive out of order | UDP is unreliable and unordered by design | Use TCP/WebSocket for ordered messages, or add sequence numbers |
| Match data too large | Sending full state every frame | Use delta compression; send only changes at a fixed tick rate |
