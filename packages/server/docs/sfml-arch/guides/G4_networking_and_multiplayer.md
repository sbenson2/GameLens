# G4 — SFML 3 Networking & Multiplayer Foundations

> **Category:** guide · **Engine:** SFML · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Game Architecture Patterns](G2_game_architecture_patterns.md) · [SFML 3 API Changes](../reference/R1_sfml3_api_changes.md) · [Audio & Networking Reference](../reference/R2_audio_and_networking.md)

SFML 3 includes a networking module (`sf::Network`) that provides TCP and UDP sockets, a packet serialization system, HTTP and FTP clients, and (new in SFML 3) TLS support for encrypted connections. This guide covers the socket API, non-blocking patterns, multiplayer architecture, and practical game networking patterns.

---

## Socket Fundamentals

SFML provides two transport-layer socket types:

| Class | Protocol | Reliable | Ordered | Connection | Use Case |
|-------|----------|----------|---------|------------|----------|
| `sf::TcpSocket` | TCP | Yes | Yes | Connected | Chat, login, turn-based state |
| `sf::UdpSocket` | UDP | No | No | Connectionless | Real-time position, input, voice |

Both inherit from `sf::Socket` and share common behavior: blocking/non-blocking modes, status codes, and selector compatibility.

---

## TCP: Reliable Communication

### Client — Connecting to a Server

```cpp
#include <SFML/Network.hpp>

sf::TcpSocket socket;

// Connect with a 5-second timeout
auto status = socket.connect(sf::IpAddress::resolve("example.com").value(),
                             53000,
                             sf::seconds(5));

if (status != sf::Socket::Status::Done) {
    // Handle connection failure
}
```

### Server — Accepting Connections

```cpp
sf::TcpListener listener;

// Bind to port 53000 on all interfaces
if (listener.listen(53000) != sf::Socket::Status::Done)
    return;

sf::TcpSocket client;
if (listener.accept(client) == sf::Socket::Status::Done) {
    // client is now connected
    auto remote = client.getRemoteAddress();
}
```

### Sending and Receiving Data

Raw bytes work, but the `sf::Packet` system is safer and handles endianness automatically:

```cpp
// Sending
sf::Packet packet;
packet << std::string("hello") << 42 << 3.14f;
socket.send(packet);

// Receiving
sf::Packet received;
if (socket.receive(received) == sf::Socket::Status::Done) {
    std::string msg;
    int count;
    float value;
    received >> msg >> count >> value;
}
```

---

## UDP: Fast, Unreliable Communication

UDP sockets don't maintain a connection. Each datagram is independent, and delivery is not guaranteed. This makes UDP ideal for real-time game state where old data is less valuable than fresh data.

### Binding and Sending

```cpp
sf::UdpSocket socket;

// Bind to a port to receive data
if (socket.bind(54000) != sf::Socket::Status::Done)
    return;

// Send a packet to a specific address and port
sf::Packet packet;
packet << playerX << playerY << playerRotation;
socket.send(packet, serverAddress, 54000);
```

### Receiving

```cpp
sf::Packet received;
sf::IpAddress sender;
unsigned short senderPort;

if (socket.receive(received, sender, senderPort) == sf::Socket::Status::Done) {
    float x, y, rotation;
    received >> x >> y >> rotation;
}
```

### Datagram Size Limit

Each UDP send must be smaller than `sf::UdpSocket::MaxDatagramSize` (slightly less than 65,536 bytes). In practice, keep game packets well under the typical MTU of ~1,400 bytes to avoid fragmentation.

---

## Packets: Type-Safe Serialization

`sf::Packet` handles byte ordering and provides insertion/extraction operators for all fundamental types. You can extend it for custom types:

```cpp
struct PlayerState {
    std::uint32_t id;
    float x, y;
    float health;
};

// Overload << and >> for sf::Packet
sf::Packet& operator<<(sf::Packet& packet, const PlayerState& state) {
    return packet << state.id << state.x << state.y << state.health;
}

sf::Packet& operator>>(sf::Packet& packet, PlayerState& state) {
    return packet >> state.id >> state.x >> state.y >> state.health;
}

// Usage
sf::Packet pkt;
PlayerState s{1, 100.0f, 200.0f, 75.0f};
pkt << s;
```

### Packet Safety

When extracting data, `sf::Packet` tracks whether all reads succeeded. Check validity after extraction:

```cpp
sf::Packet pkt;
// ... receive packet ...

int a;
float b;
pkt >> a >> b;

if (!pkt) {
    // Extraction failed — packet was too short or corrupt
}
```

---

## Non-Blocking Sockets

By default, socket functions block until they complete. For game loops, you typically want non-blocking mode:

```cpp
socket.setBlocking(false);

// Now receive() returns immediately
sf::Packet pkt;
auto status = socket.receive(pkt);

if (status == sf::Socket::Status::Done) {
    // Process the packet
} else if (status == sf::Socket::Status::NotReady) {
    // No data available — continue the game loop
} else {
    // Error or disconnection
}
```

### Game Loop Integration

A common pattern: set sockets to non-blocking and poll in the update step:

```cpp
void GameClient::update(float dt) {
    // Process all pending network messages
    sf::Packet packet;
    while (socket.receive(packet) == sf::Socket::Status::Done) {
        handleServerMessage(packet);
    }

    // Run game logic
    updateGameState(dt);

    // Send client state to server
    sendPlayerState();
}
```

---

## Socket Selectors: Multiplexing Without Threads

`sf::SocketSelector` lets you wait on multiple sockets simultaneously — the server-side equivalent of non-blocking polling, but more efficient:

```cpp
sf::SocketSelector selector;
selector.add(listener);     // Watch for new connections

// Watch all connected clients
for (auto& client : clients)
    selector.add(*client);

// Block until at least one socket is ready (1-second timeout)
if (selector.wait(sf::seconds(1))) {
    // Check the listener for new connections
    if (selector.isReady(listener)) {
        auto client = std::make_unique<sf::TcpSocket>();
        if (listener.accept(*client) == sf::Socket::Status::Done) {
            selector.add(*client);
            clients.push_back(std::move(client));
        }
    }

    // Check each client for incoming data
    for (auto& client : clients) {
        if (selector.isReady(*client)) {
            sf::Packet pkt;
            if (client->receive(pkt) == sf::Socket::Status::Done) {
                handleClientMessage(*client, pkt);
            }
        }
    }
}
```

This avoids spawning a thread per client — one thread handles all connections via the selector.

---

## TLS Support (SFML 3 — New)

SFML 3 adds TLS (Transport Layer Security) to `sf::TcpSocket`, backed by MbedTLS. This enables encrypted connections without an external library.

### TLS Client

```cpp
sf::TcpSocket socket;
socket.connect(sf::IpAddress::resolve("secure.example.com").value(), 443);

// Initiate TLS handshake
auto tlsStatus = socket.setupTlsClient("secure.example.com", caCertData);

if (tlsStatus == sf::TcpSocket::TlsStatus::HandshakeComplete) {
    // Connection is now encrypted — use send/receive as normal
    sf::Packet pkt;
    pkt << std::string("secure hello");
    socket.send(pkt);
}
```

### TLS Server

```cpp
sf::TcpSocket client;
listener.accept(client);

auto tlsStatus = client.setupTlsServer(serverCert, privateKey);
if (tlsStatus == sf::TcpSocket::TlsStatus::HandshakeComplete) {
    // Accept encrypted data from this client
}
```

**When to use TLS in games:** Login/authentication, leaderboard submissions, microtransaction validation, anti-cheat token exchange — any time sensitive data crosses the network. For real-time gameplay over UDP, TLS doesn't apply (use DTLS or application-layer encryption if needed).

---

## Multiplayer Architecture Patterns

### Client-Server (Authoritative)

The server owns all game state. Clients send inputs; the server simulates and broadcasts results.

```
Client A ──[inputs]──▶ Server ──[state]──▶ Client A
Client B ──[inputs]──▶ Server ──[state]──▶ Client B
```

```cpp
// Server: receive inputs, simulate, broadcast
for (auto& client : clients) {
    sf::Packet inputPkt;
    if (client.socket.receive(inputPkt) == sf::Socket::Status::Done) {
        PlayerInput input;
        inputPkt >> input;
        gameState.applyInput(client.id, input);
    }
}

gameState.simulate(dt);

// Broadcast updated state to all clients
sf::Packet statePkt;
statePkt << gameState;
for (auto& client : clients)
    client.socket.send(statePkt);
```

### Hybrid: TCP + UDP

Use TCP for reliable events (chat, score, game start/end) and UDP for real-time state (positions, inputs):

```cpp
struct GameClient {
    sf::TcpSocket tcp;       // Reliable channel
    sf::UdpSocket udp;       // Fast channel
    sf::IpAddress address;
    unsigned short udpPort;
};
```

### Client-Side Prediction

To hide network latency, clients simulate their own inputs locally and reconcile when the server's authoritative state arrives:

```
1. Client presses "move right" → immediately moves locally
2. Client sends input to server with sequence number
3. Server processes input, sends back authoritative state
4. Client compares server state to predicted state
5. If mismatch → snap or interpolate to server position
```

This is a game design pattern, not an SFML feature — but SFML's socket API provides the transport layer you build it on.

---

## Message Protocol Design

For any non-trivial multiplayer game, define a message protocol. A simple approach using packet IDs:

```cpp
enum class MessageType : std::uint8_t {
    PlayerInput    = 1,
    GameState      = 2,
    PlayerJoin     = 3,
    PlayerLeave    = 4,
    ChatMessage    = 5,
};

// Sending a typed message
sf::Packet pkt;
pkt << static_cast<std::uint8_t>(MessageType::PlayerInput)
    << inputSequence << moveX << moveY << shooting;

// Receiving and dispatching
sf::Packet pkt;
socket.receive(pkt);
std::uint8_t typeRaw;
pkt >> typeRaw;

switch (static_cast<MessageType>(typeRaw)) {
    case MessageType::PlayerInput:
        handlePlayerInput(pkt);
        break;
    case MessageType::GameState:
        handleGameState(pkt);
        break;
    // ...
}
```

---

## Performance Tips

1. **Send deltas, not full state.** Only transmit what changed since the last update. This drastically reduces bandwidth for games with many entities.

2. **Cap send rate.** Don't send every frame. 20-30 network updates per second is typical; interpolate between updates on the client.

3. **Use UDP for real-time data.** TCP's retransmission and head-of-line blocking add latency that harms fast-paced games. Reserve TCP for events that *must* arrive.

4. **Keep packets small.** Compress positions (use `int16_t` at fixed precision instead of `float`), pack booleans into bitfields, omit fields that haven't changed.

5. **Use selectors over threads.** `sf::SocketSelector` handles dozens of connections on one thread. Threading adds complexity (locks, race conditions) — avoid it unless your server needs massive concurrency.

6. **Validate all incoming data.** Never trust client packets. Bounds-check all values, reject oversized packets, and rate-limit connections to prevent abuse.
