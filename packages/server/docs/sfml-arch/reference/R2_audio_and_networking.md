# R2 — SFML 3 Audio and Networking Reference

> **Category:** reference · **Engine:** SFML · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Getting Started](../guides/G1_getting_started.md) · [SFML 3 API Changes](R1_sfml3_api_changes.md)

Quick reference for SFML 3's audio module (backed by miniaudio) and networking module. Covers the main classes, common patterns, and key changes from SFML 2.

---

## Audio Module Overview

SFML 3.0 replaced its internal OpenAL backend with **miniaudio**, a single-header C library for cross-platform audio. This change is mostly transparent to user code — the `sf::Sound`, `sf::Music`, and `sf::SoundBuffer` APIs remain similar — but removes the OpenAL dependency and improves platform support.

### sf::SoundBuffer — In-Memory Audio Data

Stores the complete audio waveform in memory as 16-bit signed integer samples. Use for short sound effects (gunshots, footsteps, UI clicks) that need instant playback with no latency.

```cpp
#include <SFML/Audio.hpp>

// Load from file — supports WAV, OGG, FLAC, MP3, and other formats
sf::SoundBuffer buffer("resources/jump.wav");

// Query properties
unsigned int sampleRate    = buffer.getSampleRate();       // e.g., 44100
unsigned int channelCount  = buffer.getChannelCount();     // 1 = mono, 2 = stereo
sf::Time duration          = buffer.getDuration();         // total playback time

// Access raw sample data
const std::span<const std::int16_t> samples = buffer.getSamples();
```

### sf::Sound — Playing Buffered Audio

Lightweight playback handle attached to a `SoundBuffer`. Multiple `sf::Sound` instances can share the same buffer.

```cpp
sf::SoundBuffer buffer("resources/laser.wav");
sf::Sound sound(buffer);

// Basic playback
sound.play();
sound.pause();
sound.stop();

// Playback control
sound.setVolume(80.f);           // 0–100
sound.setPitch(1.5f);            // 1.0 = normal, 2.0 = octave up
sound.setLooping(true);
sound.setPlayingOffset(sf::seconds(1.f));

// Spatial audio (3D positioning)
sound.setPosition({10.f, 0.f, -5.f});
sound.setMinDistance(5.f);       // Distance at which volume starts attenuating
sound.setAttenuation(10.f);     // How fast volume drops with distance

// Check state
if (sound.getStatus() == sf::Sound::Status::Playing) {
    // still playing
}
```

### sf::Music — Streaming Audio

Streams audio from disk chunk by chunk. Use for background music and long audio tracks — keeps memory usage low regardless of file length.

```cpp
sf::Music music("resources/background.ogg");

music.play();
music.setVolume(50.f);
music.setLooping(true);

// Set a loop region within the track (useful for intro → loop patterns)
sf::Music::TimeSpan loopSpan;
loopSpan.offset = sf::seconds(5.f);    // Loop starts at 5 seconds
loopSpan.length = sf::seconds(60.f);   // Loop region is 60 seconds long
music.setLoopPoints(loopSpan);

// Query progress
sf::Time current  = music.getPlayingOffset();
sf::Time total    = music.getDuration();
```

### sf::SoundStream — Custom Streaming

Subclass `sf::SoundStream` to stream audio from custom sources (procedural generation, network streams, custom formats).

```cpp
class ProceduralStream : public sf::SoundStream {
public:
    ProceduralStream() {
        // Initialize: channel count, sample rate
        initialize(1, 44100);
    }

private:
    bool onGetData(Chunk& chunk) override {
        // Fill chunk.samples with audio data.
        // Return true to continue streaming, false to stop.
        static std::vector<std::int16_t> samples(44100); // 1 second buffer
        generate_sine_wave(samples);
        chunk.samples    = samples.data();
        chunk.sampleCount = samples.size();
        return true;
    }

    void onSeek(sf::Time timeOffset) override {
        // Seek to the given position in the stream.
        // Implement if your source supports seeking.
    }
};
```

### sf::Listener — Global Audio Listener

The listener is the "ear" in the scene — there's one global listener that affects how all spatial sounds are heard.

```cpp
sf::Listener::setPosition({player.x, player.y, 0.f});
sf::Listener::setDirection({0.f, 0.f, -1.f});  // Looking into screen
sf::Listener::setGlobalVolume(100.f);           // Master volume (0–100)
```

### Key Audio Changes from SFML 2

| SFML 2 | SFML 3 | Notes |
|--------|--------|-------|
| Backend: OpenAL | Backend: miniaudio | No user-facing API change, but removes OpenAL dependency |
| `sf::SoundBuffer::loadFromFile()` | Constructor: `sf::SoundBuffer("file.wav")` | RAII construction pattern |
| `sf::Music::openFromFile()` | Constructor: `sf::Music("file.ogg")` | RAII construction pattern |
| `sf::SoundStream::setProcessingInterval()` | Removed | miniaudio manages internal timing automatically |
| `getSamples()` returns `const Int16*` | Returns `std::span<const std::int16_t>` | Modern C++ span for safety |

---

## Networking Module Overview

SFML provides a simple, portable networking API covering TCP, UDP, and HTTP. It is not a high-performance networking library — it's designed for simplicity and ease of use, making it suitable for small multiplayer games and client-server tools.

### sf::TcpSocket — Reliable Connections

```cpp
#include <SFML/Network.hpp>

// --- Client side ---
sf::TcpSocket socket;
sf::Socket::Status status = socket.connect("server.example.com", 53000);

if (status != sf::Socket::Status::Done) {
    // Connection failed
}

// Send raw data
const char data[] = "Hello server";
socket.send(data, sizeof(data));

// Receive raw data
char buffer[1024];
std::size_t received;
socket.receive(buffer, sizeof(buffer), received);
```

### sf::TcpListener — Accept Connections

```cpp
// --- Server side ---
sf::TcpListener listener;
listener.listen(53000);

sf::TcpSocket client;
if (listener.accept(client) == sf::Socket::Status::Done) {
    // New client connected
    std::optional<sf::IpAddress> remote = client.getRemoteAddress();
}
```

### sf::UdpSocket — Fast, Unreliable Datagrams

```cpp
sf::UdpSocket socket;
socket.bind(54000);  // Bind to a local port

// Send a datagram
const char msg[] = "ping";
socket.send(msg, sizeof(msg), "192.168.1.100", 54000);

// Receive a datagram
char buffer[1024];
std::size_t received;
std::optional<sf::IpAddress> sender;
unsigned short senderPort;
socket.receive(buffer, sizeof(buffer), received, sender, senderPort);
```

### sf::Packet — Type-Safe Serialization

Packets handle endianness and type serialization automatically. Prefer them over raw data for game protocol messages.

```cpp
// Sending
sf::Packet packet;
packet << "PlayerMove" << player_id << x << y;
tcp_socket.send(packet);

// Receiving
sf::Packet received_packet;
tcp_socket.receive(received_packet);

std::string action;
int id;
float px, py;
received_packet >> action >> id >> px >> py;

// Custom types — overload the << and >> operators
sf::Packet& operator<<(sf::Packet& packet, const PlayerState& state) {
    return packet << state.id << state.x << state.y << state.health;
}

sf::Packet& operator>>(sf::Packet& packet, PlayerState& state) {
    return packet >> state.id >> state.x >> state.y >> state.health;
}
```

### sf::SocketSelector — Multiplexing

Monitor multiple sockets for incoming data without blocking on any single one. Essential for game servers handling multiple clients.

```cpp
sf::SocketSelector selector;
selector.add(listener);

// Game server loop
while (running) {
    // Wait up to 100ms for activity on any monitored socket
    if (selector.wait(sf::milliseconds(100))) {

        // Check if a new client is connecting
        if (selector.isReady(listener)) {
            auto client = std::make_unique<sf::TcpSocket>();
            if (listener.accept(*client) == sf::Socket::Status::Done) {
                selector.add(*client);
                clients.push_back(std::move(client));
            }
        }

        // Check each connected client for incoming data
        for (auto& client : clients) {
            if (selector.isReady(*client)) {
                sf::Packet packet;
                if (client->receive(packet) == sf::Socket::Status::Done) {
                    handle_client_message(*client, packet);
                }
            }
        }
    }
}
```

### Non-Blocking Sockets

By default, SFML sockets block. For game loops where you can't afford to wait, switch to non-blocking mode:

```cpp
socket.setBlocking(false);

// Now send/receive return immediately
sf::Packet packet;
sf::Socket::Status status = socket.receive(packet);

if (status == sf::Socket::Status::Done) {
    // Data received — process it
} else if (status == sf::Socket::Status::NotReady) {
    // No data available yet — continue the game loop
} else if (status == sf::Socket::Status::Partial) {
    // Only part of the data was sent (TCP only) — retry remaining
} else if (status == sf::Socket::Status::Disconnected) {
    // Peer disconnected
}
```

### sf::Http — Simple HTTP Client

```cpp
sf::Http http("http://api.example.com");

sf::Http::Request request("/scores", sf::Http::Request::Method::Get);
sf::Http::Response response = http.sendRequest(request);

if (response.getStatus() == sf::Http::Response::Status::Ok) {
    std::string body = response.getBody();
    // Parse JSON, leaderboard data, etc.
}
```

### Key Networking Changes from SFML 2

| SFML 2 | SFML 3 | Notes |
|--------|--------|-------|
| `sf::IpAddress` by value everywhere | `std::optional<sf::IpAddress>` for remote addresses | Reflects that address may not be available |
| `sf::Socket::Status` enum values | Same names, scoped as `sf::Socket::Status::Done` | Scoped enum for type safety |
| `receive()` raw overload | Additional overload returning bytes sent | Better partial-send handling on non-blocking TCP |

---

## Combining Audio and Networking

A common game pattern: stream voice or game audio over the network using `sf::SoundStream` as the playback mechanism and `sf::UdpSocket` for low-latency delivery.

```cpp
class NetworkAudioStream : public sf::SoundStream {
    sf::UdpSocket socket;
    std::vector<std::int16_t> sample_buffer;
    std::mutex buffer_mutex;

public:
    NetworkAudioStream() : sample_buffer(4096, 0) {
        initialize(1, 44100);       // Mono, 44.1kHz
        socket.bind(55000);
        socket.setBlocking(false);
    }

private:
    bool onGetData(Chunk& chunk) override {
        // Try to receive new audio data from the network
        char raw[8192];
        std::size_t received;
        std::optional<sf::IpAddress> sender;
        unsigned short port;

        if (socket.receive(raw, sizeof(raw), received, sender, port)
            == sf::Socket::Status::Done) {
            std::lock_guard lock(buffer_mutex);
            std::memcpy(sample_buffer.data(), raw, received);
        }

        chunk.samples     = sample_buffer.data();
        chunk.sampleCount = sample_buffer.size();
        return true;
    }

    void onSeek(sf::Time) override { /* no-op for live stream */ }
};
```

---

## Common Pitfalls

1. **Using sf::SoundBuffer for music** — Buffers load the entire file into memory. A 3-minute WAV at 44.1kHz stereo is ~30 MB. Use `sf::Music` for anything longer than a few seconds.

2. **Forgetting to keep sf::SoundBuffer alive** — `sf::Sound` does not own the buffer. If the buffer is destroyed while a sound references it, you get undefined behavior. Manage buffer lifetimes carefully (e.g., store them in a resource manager).

3. **Blocking sockets in the game loop** — A blocking `receive()` halts your entire frame. Use `setBlocking(false)` or `sf::SocketSelector` with a timeout.

4. **Ignoring sf::Socket::Status::Partial** — On non-blocking TCP sockets, `send()` may not transmit all data at once. Check for `Partial` status and resend the remainder.

5. **sf::Packet size limits on UDP** — UDP datagrams have a practical limit of ~1400 bytes to avoid IP fragmentation. SFML does not fragment packets for you. Keep game state messages small.
