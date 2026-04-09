# Networking and Multiplayer

> **Category:** guide · **Engine:** Pygame · **Related:** [architecture/game-loop-and-state.md](../architecture/game-loop-and-state.md), [performance-and-pygame-ce.md](performance-and-pygame-ce.md)

A practical guide to adding multiplayer networking to Pygame games — covering client-server architecture, protocol choice, state synchronization, and latency compensation. Focuses on Python's built-in `socket` module and popular community libraries.

---

## Architecture: Client-Server vs Peer-to-Peer

For almost all multiplayer Pygame games, **client-server with server authority** is the right architecture. The server owns the canonical game state; clients send inputs and render the state the server distributes.

| Aspect | Client-Server | Peer-to-Peer |
|--------|--------------|--------------|
| **Cheat resistance** | High — server validates | Low — any peer can lie |
| **Complexity** | Moderate (one server process) | High (NAT traversal, consensus) |
| **Latency** | Client ↔ Server | Client ↔ Client (varies) |
| **Best for** | Action games, 2–32 players | Turn-based, LAN-only |

**Rule of thumb:** Use client-server unless you're building a LAN-only or turn-based game with trusted players.

---

## Protocol Choice: TCP vs UDP

### TCP (Reliable, Ordered)

```python
import socket

# Server — accept one client
server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
server.bind(("0.0.0.0", 5555))
server.listen()
conn, addr = server.accept()
print(f"Connected: {addr}")

# Send/receive — TCP guarantees order and delivery
conn.sendall(b"welcome")
data = conn.recv(1024)
```

**Pros:** Packets always arrive, always in order. Simpler to implement correctly.
**Cons:** Head-of-line blocking — one lost packet stalls the entire stream.

### UDP (Fast, Unordered)

```python
import socket

# Server — connectionless
sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
sock.bind(("0.0.0.0", 5555))

data, addr = sock.recvfrom(1024)
sock.sendto(b"ack", addr)
```

**Pros:** No head-of-line blocking; lower latency for real-time games.
**Cons:** Packets can arrive out of order, duplicated, or not at all. You must handle reliability yourself for critical messages (e.g., player joins, chat).

### When to Use Which

- **Turn-based games** (chess, card games): TCP is fine — latency isn't critical.
- **Action games** (platformers, shooters): Start with TCP. Switch to UDP only if profiling shows TCP latency is unacceptable (>100ms spikes under packet loss).
- **Hybrid:** Use TCP for reliable events (chat, login, game-over) and UDP for real-time state (positions, inputs) on a second socket.

---

## Server Structure

A minimal authoritative server runs three responsibilities in a loop: receive client inputs, simulate the game, and broadcast state.

```python
import socket
import threading
import json
import time

class GameServer:
    """Authoritative game server — owns the canonical state."""

    def __init__(self, host="0.0.0.0", port=5555, tick_rate=20):
        self.server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        self.server.bind((host, port))
        self.server.listen()
        self.tick_rate = tick_rate
        self.clients = {}       # conn -> player_id
        self.game_state = {}    # player_id -> {x, y, ...}
        self.inputs = {}        # player_id -> latest input
        self.lock = threading.Lock()
        self.next_id = 0

    def accept_clients(self):
        """Accept new connections in a background thread."""
        while True:
            conn, addr = self.server.accept()
            pid = self.next_id
            self.next_id += 1
            with self.lock:
                self.clients[conn] = pid
                self.game_state[pid] = {"x": 400.0, "y": 300.0}
            # One thread per client to receive inputs
            threading.Thread(
                target=self.receive_inputs,
                args=(conn, pid),
                daemon=True,
            ).start()
            # Tell the client their player ID
            self._send(conn, {"type": "welcome", "id": pid})

    def receive_inputs(self, conn, pid):
        """Read input packets from one client."""
        buffer = ""
        while True:
            try:
                data = conn.recv(4096).decode()
                if not data:
                    break
                buffer += data
                # Simple newline-delimited JSON protocol
                while "\n" in buffer:
                    msg, buffer = buffer.split("\n", 1)
                    parsed = json.loads(msg)
                    with self.lock:
                        self.inputs[pid] = parsed
            except (ConnectionResetError, OSError):
                break
        # Cleanup on disconnect
        with self.lock:
            self.clients.pop(conn, None)
            self.game_state.pop(pid, None)
            self.inputs.pop(pid, None)
        conn.close()

    def simulate(self):
        """Apply inputs to game state (server-authoritative)."""
        speed = 200.0  # pixels per second
        dt = 1.0 / self.tick_rate
        with self.lock:
            for pid, inp in self.inputs.items():
                if pid not in self.game_state:
                    continue
                state = self.game_state[pid]
                dx = inp.get("dx", 0)
                dy = inp.get("dy", 0)
                # Server validates movement — clamp speed
                state["x"] += dx * speed * dt
                state["y"] += dy * speed * dt
                # Clamp to world bounds
                state["x"] = max(0, min(800, state["x"]))
                state["y"] = max(0, min(600, state["y"]))

    def broadcast(self):
        """Send current game state to all clients."""
        with self.lock:
            snapshot = json.dumps(self.game_state) + "\n"
            dead = []
            for conn in self.clients:
                try:
                    conn.sendall(snapshot.encode())
                except OSError:
                    dead.append(conn)
            for conn in dead:
                self.clients.pop(conn, None)

    def run(self):
        threading.Thread(target=self.accept_clients, daemon=True).start()
        interval = 1.0 / self.tick_rate
        while True:
            start = time.time()
            self.simulate()
            self.broadcast()
            elapsed = time.time() - start
            time.sleep(max(0, interval - elapsed))

    def _send(self, conn, obj):
        try:
            conn.sendall((json.dumps(obj) + "\n").encode())
        except OSError:
            pass

if __name__ == "__main__":
    GameServer().run()
```

**Key design decisions:**
- **Tick rate** (20 Hz) is independent of client frame rate. The server simulates at a fixed rate regardless of how fast clients render.
- **Newline-delimited JSON** is a simple wire protocol. For production, consider msgpack or protobuf for smaller payloads.
- **Thread-per-client** works for small player counts (<32). For larger games, switch to `asyncio` or `selectors`.

---

## Client Structure

The client runs the normal Pygame game loop but sends inputs to the server instead of directly modifying state, and renders based on server snapshots.

```python
import pygame
import socket
import threading
import json

class NetworkClient:
    """Connects to the game server, sends inputs, receives state."""

    def __init__(self, host="127.0.0.1", port=5555):
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.connect((host, port))
        self.game_state = {}
        self.player_id = None
        self.buffer = ""
        # Receive in background thread
        threading.Thread(target=self._receive, daemon=True).start()

    def _receive(self):
        while True:
            try:
                data = self.sock.recv(4096).decode()
                if not data:
                    break
                self.buffer += data
                while "\n" in self.buffer:
                    msg, self.buffer = self.buffer.split("\n", 1)
                    parsed = json.loads(msg)
                    if isinstance(parsed, dict) and parsed.get("type") == "welcome":
                        self.player_id = parsed["id"]
                    else:
                        self.game_state = parsed
            except (ConnectionResetError, OSError):
                break

    def send_input(self, dx, dy):
        msg = json.dumps({"dx": dx, "dy": dy}) + "\n"
        try:
            self.sock.sendall(msg.encode())
        except OSError:
            pass


def main():
    pygame.init()
    screen = pygame.display.set_mode((800, 600))
    clock = pygame.time.Clock()
    client = NetworkClient()

    running = True
    while running:
        dt = clock.tick(60) / 1000.0

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False

        # Gather local input
        keys = pygame.key.get_pressed()
        dx = int(keys[pygame.K_RIGHT]) - int(keys[pygame.K_LEFT])
        dy = int(keys[pygame.K_DOWN]) - int(keys[pygame.K_UP])
        client.send_input(dx, dy)

        # Render all players from server state
        screen.fill((30, 30, 30))
        for pid_str, state in client.game_state.items():
            color = (0, 200, 100) if str(client.player_id) == pid_str else (100, 100, 255)
            pygame.draw.circle(screen, color, (int(state["x"]), int(state["y"])), 15)

        pygame.display.flip()

    pygame.quit()

if __name__ == "__main__":
    main()
```

---

## Wire Protocol Design

Avoid sending raw Python objects via `pickle` — it's a security risk (arbitrary code execution on deserialization). Use structured serialization instead.

| Format | Size | Speed | Notes |
|--------|------|-------|-------|
| JSON (newline-delimited) | Large | Moderate | Human-readable, easy debugging |
| msgpack | Small | Fast | Binary, drop-in JSON replacement |
| struct.pack | Minimal | Fastest | Fixed-format, manual schema, best for real-time |

### Compact Binary Protocol Example

```python
import struct

# Define message types
MSG_INPUT = 1
MSG_STATE = 2

def pack_input(dx, dy):
    """Pack input into 5 bytes: type(1) + dx(float16) + dy(float16)."""
    # 'B' = unsigned byte, 'ee' = two half-precision floats
    return struct.pack("!Bee", MSG_INPUT, dx, dy)

def unpack_input(data):
    msg_type, dx, dy = struct.unpack("!Bee", data)
    return float(dx), float(dy)

# For state: pack player_id + x + y as 3 floats per player
def pack_state(players):
    """Pack all player positions into a single binary message."""
    buf = struct.pack("!BH", MSG_STATE, len(players))  # type + count
    for pid, state in players.items():
        buf += struct.pack("!Hff", pid, state["x"], state["y"])
    return buf
```

---

## Latency Compensation

Real networks have 50–200ms round-trip latency. Without compensation, the game feels sluggish. Two main techniques:

### Client-Side Prediction

The client applies its own inputs immediately (optimistic update), then reconciles when the server responds.

```python
class PredictedPlayer:
    """Local player with client-side prediction."""

    def __init__(self, x, y, speed=200.0):
        self.x = x
        self.y = y
        self.speed = speed
        self.pending_inputs = []  # inputs awaiting server confirmation
        self.input_seq = 0

    def apply_input(self, dx, dy, dt):
        """Apply input locally and queue for server confirmation."""
        self.input_seq += 1
        inp = {"seq": self.input_seq, "dx": dx, "dy": dy, "dt": dt}
        self.pending_inputs.append(inp)

        # Optimistic local update — feels instant
        self.x += dx * self.speed * dt
        self.y += dy * self.speed * dt

    def reconcile(self, server_x, server_y, last_processed_seq):
        """Server sent authoritative position; replay unconfirmed inputs."""
        # Discard inputs the server has already processed
        self.pending_inputs = [
            inp for inp in self.pending_inputs
            if inp["seq"] > last_processed_seq
        ]
        # Start from server's authoritative position
        self.x = server_x
        self.y = server_y
        # Re-apply inputs the server hasn't seen yet
        for inp in self.pending_inputs:
            self.x += inp["dx"] * self.speed * inp["dt"]
            self.y += inp["dy"] * self.speed * inp["dt"]
```

### Entity Interpolation

For remote players, you receive discrete snapshots from the server. Rather than teleporting entities to new positions, interpolate between the two most recent snapshots.

```python
class InterpolatedEntity:
    """Smoothly interpolates between server state snapshots."""

    def __init__(self):
        self.snapshots = []  # list of (timestamp, x, y)
        self.render_delay = 0.1  # 100ms behind real-time

    def add_snapshot(self, timestamp, x, y):
        self.snapshots.append((timestamp, x, y))
        # Keep only last 10 snapshots
        if len(self.snapshots) > 10:
            self.snapshots.pop(0)

    def get_position(self, current_time):
        """Interpolate between the two snapshots straddling render_time."""
        render_time = current_time - self.render_delay

        if len(self.snapshots) < 2:
            if self.snapshots:
                return self.snapshots[-1][1], self.snapshots[-1][2]
            return 0, 0

        # Find the two snapshots to interpolate between
        for i in range(len(self.snapshots) - 1):
            t0, x0, y0 = self.snapshots[i]
            t1, x1, y1 = self.snapshots[i + 1]
            if t0 <= render_time <= t1:
                # Linear interpolation
                frac = (render_time - t0) / (t1 - t0) if t1 != t0 else 0
                return x0 + (x1 - x0) * frac, y0 + (y1 - y0) * frac

        # If render_time is past all snapshots, use latest
        return self.snapshots[-1][1], self.snapshots[-1][2]
```

**Why 100ms delay?** Rendering slightly behind real-time ensures you (almost) always have two snapshots to interpolate between. This prevents jittery teleportation without adding perceived input lag for the local player.

---

## Community Libraries

Instead of raw sockets, several Python libraries simplify networking:

| Library | Protocol | Best For |
|---------|----------|----------|
| **PodSixNet** | TCP (asyncore) | Small indie games, simple API |
| **mpgameserver** | UDP | Real-time action games |
| **websockets** (asyncio) | WebSocket | Browser-compatible, pygbag deployment |
| **Pyenet** | ENet (reliable UDP) | When you need UDP reliability without writing it yourself |

### PodSixNet Example

```python
# Server
from PodSixNet.Server import Server
from PodSixNet.Channel import Channel

class ClientChannel(Channel):
    def Network_input(self, data):
        # Received input from a client
        self.server.handle_input(self.addr, data)

class GameServer(Server):
    channelClass = ClientChannel

    def Connected(self, channel, addr):
        print(f"New connection: {addr}")
```

### asyncio + websockets (for pygbag/web deployment)

```python
import asyncio
import websockets
import json

CLIENTS = {}

async def handler(websocket):
    pid = id(websocket)
    CLIENTS[pid] = websocket
    try:
        async for message in websocket:
            data = json.loads(message)
            # Broadcast to all other clients
            for other_pid, ws in CLIENTS.items():
                if other_pid != pid:
                    await ws.send(json.dumps({"from": pid, **data}))
    finally:
        del CLIENTS[pid]

async def main():
    async with websockets.serve(handler, "0.0.0.0", 8765):
        await asyncio.Future()  # run forever

asyncio.run(main())
```

---

## Common Pitfalls

1. **Using `pickle` for network messages** — arbitrary code execution risk. Use JSON, msgpack, or struct.
2. **Trusting client positions** — always validate inputs server-side. Clients send *intentions* (dx, dy), not positions.
3. **Blocking `recv()` in the game loop** — use a background thread or `socket.setblocking(False)` with `select`/`selectors`.
4. **No tick rate limit on the server** — without a sleep, the server spins at 100% CPU and floods clients with updates.
5. **Sending full state every tick** — use delta compression (only send what changed) for games with many entities.
6. **Ignoring disconnects** — always handle `ConnectionResetError` and clean up player state on disconnect.

---

## Quick Reference: Choosing Your Approach

| Game Type | Protocol | Architecture | Prediction Needed? |
|-----------|----------|-------------|-------------------|
| Turn-based (chess, cards) | TCP | Client-server | No |
| Co-op platformer (2–4 players) | TCP | Client-server | Optional |
| Action/shooter (<16 players) | UDP or TCP | Client-server (authoritative) | Yes |
| MMO-lite (>16 players) | UDP + TCP hybrid | Dedicated server | Yes + interpolation |
| Web deployment (pygbag) | WebSocket | Client-server | Optional |
