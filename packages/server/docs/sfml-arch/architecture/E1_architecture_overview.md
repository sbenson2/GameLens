# E1 — SFML 3 Architecture Overview

> **Category:** explanation · **Engine:** SFML · **Related:** [SFML Rules](../sfml-arch-rules.md) · [G1 Getting Started](../guides/G1_getting_started.md)

---

## Philosophy: Simple and Fast

SFML (Simple and Fast Multimedia Library) was created by Laurent Gomila as a modern, object-oriented alternative to SDL for C++ developers. Its core design principles are:

1. **Object-oriented C++ API** — clean classes, RAII, no manual init/cleanup boilerplate
2. **Modular** — five independent modules, link only what you need
3. **Cross-platform** — Windows, macOS, Linux, iOS, Android from the same codebase
4. **Accessible** — low barrier to entry, comprehensive tutorials and documentation
5. **Mid-level abstraction** — higher than SDL (provides 2D rendering), lower than a game engine

SFML 3 (released December 2024) is the first major version since SFML 2 in 2013. It modernizes the codebase to C++17, introduces strong types, replaces the audio backend, and aligns the API with modern C++ idioms.

---

## Module Architecture

SFML is composed of five modules with a clear dependency hierarchy:

```
┌──────────────────────────────────────────────────┐
│                  Application Code                 │
├──────────┬───────────┬───────────┬───────────────┤
│ Graphics │  Network  │   Audio   │    (Direct)   │
│  (2D)    │ (TCP/UDP) │ (playback │               │
│          │           │  record)  │               │
├──────────┤           │           │               │
│  Window  ├───────────┴───────────┤               │
│ (events, │                       │               │
│  OpenGL) │                       │               │
├──────────┴───────────────────────┴───────────────┤
│                    System                         │
│            (time, threads, streams)               │
├──────────────────────────────────────────────────┤
│         Platform Layer (OS-specific impls)        │
│     Win32 / Cocoa / X11 / UIKit / Android        │
└──────────────────────────────────────────────────┘
```

### System — Foundation Layer

The System module provides platform-independent utilities used by all other modules:

- **sf::Clock** / **sf::Time** — high-resolution timing with type-safe time representation
- **sf::Angle** — strong type for angles (new in SFML 3), constructed via `sf::degrees()` or `sf::radians()`
- **sf::Vector2<T>** / **sf::Vector3<T>** — generic vector math types
- **sf::InputStream** — abstract stream interface for custom I/O
- **sf::String** — Unicode string (UTF-32 internal, interops with std::string)
- **sf::Thread** / **sf::Mutex** — basic threading primitives (prefer `<thread>` and `<mutex>` in C++17)

### Window — Platform Abstraction

Handles window management, OpenGL context, and input:

- **sf::WindowBase** — window without OpenGL context (for use with external renderers like Vulkan)
- **sf::Window** — window with OpenGL context
- **sf::Event** — type-safe event system (SFML 3: `std::optional<sf::Event>`, variant-like `getIf<>()`)
- **Input polling** — `sf::Keyboard`, `sf::Mouse`, `sf::Joystick`, `sf::Touch`, `sf::Sensor`
- **sf::VideoMode** — display mode enumeration and desktop resolution queries
- **sf::Cursor** — system cursor types

The window module abstracts Win32, Cocoa (macOS), X11 (Linux), UIKit (iOS), and Android native windowing.

### Graphics — 2D Rendering

Built on OpenGL, the Graphics module provides a complete 2D rendering pipeline:

- **sf::RenderWindow** — window that can draw SFML drawables
- **sf::RenderTexture** — off-screen render target
- **sf::Sprite** — textured quad (references an sf::Texture — texture must outlive sprite)
- **sf::Shape** — base for geometric shapes (CircleShape, RectangleShape, ConvexShape)
- **sf::Text** — text rendering with sf::Font (TrueType / OpenType)
- **sf::VertexArray** / **sf::VertexBuffer** — custom geometry with vertex data
- **sf::Shader** — GLSL shaders (vertex, fragment, geometry)
- **sf::View** — 2D camera (position, rotation, zoom, viewport)
- **sf::Transformable** — base class providing position, rotation, scale, origin

The rendering model is immediate-mode with batching: call `window.draw(drawable)` for each object, then `window.display()` to present.

### Audio — Sound and Music

Uses miniaudio as the backend (replaced OpenAL in SFML 3):

- **sf::SoundBuffer** — fully loaded audio data in memory (short sounds/effects)
- **sf::Sound** — playback of a SoundBuffer (positional, pitch, volume)
- **sf::Music** — streamed playback from file (for long tracks)
- **sf::SoundRecorder** — audio input/capture
- **sf::Listener** — 3D audio listener (position, direction, up vector)

Supports WAV, OGG/Vorbis, MP3, and FLAC formats.

### Network — TCP/UDP and Protocols

Portable networking without external dependencies:

- **sf::TcpSocket** / **sf::UdpSocket** — low-level socket communication
- **sf::TcpListener** — accepts incoming TCP connections
- **sf::SocketSelector** — multiplexing (select-style I/O monitoring)
- **sf::Packet** — serialization helper for network data
- **sf::Http** — simple HTTP client
- **sf::Ftp** — FTP client (useful for development tools)

---

## Platform Abstraction Model

SFML achieves cross-platform support through compile-time platform selection. Each module has an internal `platform/` layer:

```
sf::Window (public API)
    └── sf::priv::WindowImpl (abstract interface)
        ├── sf::priv::WindowImplWin32   (Windows)
        ├── sf::priv::WindowImplCocoa   (macOS)
        ├── sf::priv::WindowImplX11     (Linux)
        ├── sf::priv::WindowImplUIKit   (iOS)
        └── sf::priv::WindowImplAndroid (Android)
```

The same pattern applies to OpenGL contexts, joystick input, audio devices, and other platform-specific features. Users interact only with the portable public API.

---

## Key SFML 3 Changes from SFML 2

| Area | SFML 2 | SFML 3 |
|------|--------|--------|
| **C++ Standard** | C++11 | C++17 required |
| **Angles** | Raw float | `sf::Angle` strong type |
| **Events** | `pollEvent(sf::Event&)` returns bool | `pollEvent()` returns `std::optional<sf::Event>` |
| **Event access** | `event.type` + union fields | `event->getIf<sf::Event::KeyPressed>()` |
| **Resource loading** | Bool return + output param | `std::optional` return |
| **Audio backend** | OpenAL | miniaudio |
| **Dependencies** | Bundled binaries | CMake FetchContent |
| **VideoMode** | `sf::VideoMode(w, h)` | `sf::VideoMode({w, h})` (aggregate init) |
| **Naming** | Some inconsistencies | Unified conventions |

---

## Rendering Pipeline

SFML's 2D rendering follows a straightforward pipeline:

1. **Clear** — `window.clear(color)` clears the back buffer
2. **Draw** — `window.draw(drawable)` for each sprite, shape, text, vertex array
3. **Display** — `window.display()` swaps buffers

Each drawable is transformed by its own transform (position, rotation, scale) and optionally by a `sf::View` (2D camera). Custom render states (shader, blend mode, transform) can be passed via `sf::RenderStates`.

For advanced rendering, use `sf::RenderTexture` for off-screen targets (post-processing, minimaps, UI layers), then draw the resulting texture as a sprite.

---

## When to Choose SFML

SFML is a strong choice when:

- You want a **clean C++ API** (vs. C-style SDL)
- You're building a **2D game** and want built-in sprite/shape/text rendering
- You need **networking** alongside graphics and audio
- You want **modular linking** — use only the modules you need
- Your team is comfortable with **C++17**

Consider alternatives when:

- You need **3D rendering** (SFML is 2D-focused; consider SDL3+GPU, raylib, or a full engine)
- You want **C bindings** for FFI to other languages (SDL or raylib have better binding ecosystems)
- You need the **callback/app model** for mobile (SDL3 handles this more naturally)
- You need **Vulkan/Metal/D3D12** (SFML uses OpenGL only; SDL3 has the GPU API)
