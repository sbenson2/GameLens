# G1 — Getting Started with SFML 3

> **Category:** guide · **Engine:** SFML · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [SFML Rules](../sfml-arch-rules.md)

This guide walks through setting up a new SFML 3 project from scratch, covering installation, project configuration, and your first working window with rendering and input.

---

## Prerequisites

- **C++17 compiler** — GCC 9+, Clang 10+, MSVC 2019+ (SFML 3 requires C++17)
- **CMake 3.28+** — SFML 3 uses CMake FetchContent for dependency management
- A text editor or IDE (VSCode, CLion, Visual Studio)

No prebuilt SFML binaries are needed — CMake FetchContent downloads and builds SFML automatically.

---

## Project Setup with CMake FetchContent

This is the recommended approach for SFML 3. Create the following project structure:

```
MyGame/
├── src/
│   └── main.cpp
├── assets/
│   ├── textures/
│   ├── fonts/
│   └── sounds/
└── CMakeLists.txt
```

### CMakeLists.txt

```cmake
cmake_minimum_required(VERSION 3.28)
project(MyGame LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Download and build SFML 3 automatically
include(FetchContent)
FetchContent_Declare(SFML
    GIT_REPOSITORY https://github.com/SFML/SFML.git
    GIT_TAG 3.0.0
    EXCLUDE_FROM_ALL
)
FetchContent_MakeAvailable(SFML)

# Your game executable
add_executable(MyGame src/main.cpp)
target_link_libraries(MyGame PRIVATE SFML::Graphics SFML::Audio)
```

**Key points:**
- `SFML::Graphics` pulls in `SFML::Window` and `SFML::System` automatically (dependency chain).
- Only link the modules you use. A network-only app needs just `SFML::Network`.
- The `EXCLUDE_FROM_ALL` flag prevents SFML's install targets from cluttering your build.

### Build Commands

```bash
# Configure (first run downloads SFML — takes a minute)
cmake -B build -DCMAKE_BUILD_TYPE=Release

# Build
cmake --build build --config Release

# Run
./build/MyGame
```

On Windows with Visual Studio:
```bash
cmake -B build -G "Visual Studio 17 2022"
cmake --build build --config Release
```

---

## Hello Window — Minimal SFML 3 Program

### src/main.cpp

```cpp
#include <SFML/Graphics.hpp>

int main()
{
    // Create a window with an 800x600 resolution
    auto window = sf::RenderWindow(sf::VideoMode({800u, 600u}), "My Game");
    window.setFramerateLimit(60);

    // Main game loop
    while (window.isOpen())
    {
        // Process events (SFML 3 uses std::optional)
        while (const auto event = window.pollEvent())
        {
            if (event->is<sf::Event::Closed>())
                window.close();
        }

        // Clear, draw, display
        window.clear(sf::Color::Black);
        window.display();
    }

    return 0;
}
```

This creates a black window that responds to the close button. Note the SFML 3-specific patterns:
- `sf::VideoMode({800u, 600u})` — aggregate initialization with unsigned ints
- `window.pollEvent()` returns `std::optional<sf::Event>`
- `event->is<sf::Event::Closed>()` — type-safe event checking

---

## Adding Shapes and Text

```cpp
#include <SFML/Graphics.hpp>

int main()
{
    auto window = sf::RenderWindow(sf::VideoMode({800u, 600u}), "Shapes & Text");
    window.setFramerateLimit(60);

    // Create a shape
    auto circle = sf::CircleShape(50.f);
    circle.setFillColor(sf::Color::Green);
    circle.setPosition({100.f, 100.f});

    // Create a rectangle
    auto rect = sf::RectangleShape({200.f, 50.f});
    rect.setFillColor(sf::Color(100, 149, 237)); // Cornflower blue
    rect.setPosition({300.f, 200.f});

    // Load a font and create text
    sf::Font font;
    if (!font.openFromFile("assets/fonts/my_font.ttf"))
        return 1; // Font loading failed

    auto text = sf::Text(font, "Hello SFML 3!", 24);
    text.setFillColor(sf::Color::White);
    text.setPosition({300.f, 400.f});

    while (window.isOpen())
    {
        while (const auto event = window.pollEvent())
        {
            if (event->is<sf::Event::Closed>())
                window.close();
        }

        window.clear(sf::Color::Black);
        window.draw(circle);
        window.draw(rect);
        window.draw(text);
        window.display();
    }

    return 0;
}
```

**SFML 3 changes to note:**
- `sf::Font::openFromFile()` returns `bool` — create a default `sf::Font`, then call `openFromFile()` on it.
- `sf::Text` constructor takes the font by reference, then the string and character size.

---

## Handling Input

SFML 3 provides two input models: event-based (for discrete actions) and real-time polling (for continuous input).

### Event-Based Input

```cpp
while (const auto event = window.pollEvent())
{
    // Window close
    if (event->is<sf::Event::Closed>())
        window.close();

    // Key pressed (single fire)
    if (const auto* keyPressed = event->getIf<sf::Event::KeyPressed>())
    {
        if (keyPressed->code == sf::Keyboard::Key::Escape)
            window.close();
        if (keyPressed->code == sf::Keyboard::Key::Space)
            jump();
    }

    // Mouse button
    if (const auto* mouseButton = event->getIf<sf::Event::MouseButtonPressed>())
    {
        if (mouseButton->button == sf::Mouse::Button::Left)
            shoot(mouseButton->position);
    }

    // Window resized
    if (const auto* resized = event->getIf<sf::Event::Resized>())
    {
        // Handle resize
    }
}
```

### Real-Time Input Polling

```cpp
// In your update section (continuous movement):
float speed = 200.f;  // pixels per second

if (sf::Keyboard::isKeyPressed(sf::Keyboard::Key::Left))
    player.move({-speed * dt, 0.f});
if (sf::Keyboard::isKeyPressed(sf::Keyboard::Key::Right))
    player.move({speed * dt, 0.f});
if (sf::Keyboard::isKeyPressed(sf::Keyboard::Key::Up))
    player.move({0.f, -speed * dt});
if (sf::Keyboard::isKeyPressed(sf::Keyboard::Key::Down))
    player.move({0.f, speed * dt});
```

---

## Loading and Drawing Sprites

```cpp
// Load a texture (SFML 3 uses bool-returning instance methods)
sf::Texture texture;
if (!texture.loadFromFile("assets/textures/player.png"))
    return 1;

// Create a sprite from the texture
auto sprite = sf::Sprite(texture);
sprite.setPosition({400.f, 300.f});

// Scale and rotate (SFML 3 uses sf::Angle for rotation)
sprite.setScale({2.f, 2.f});
sprite.setRotation(sf::degrees(45.f));

// In draw loop:
window.draw(sprite);
```

**Critical:** The `sf::Texture` must outlive the `sf::Sprite`. Sprites hold a pointer to their texture — if the texture is destroyed, the sprite draws garbage. Keep textures alive (e.g., in a resource manager, a struct, or a scope that encompasses the sprite's lifetime).

---

## Fixed Timestep Game Loop

For consistent physics and gameplay, use a fixed timestep:

```cpp
#include <SFML/Graphics.hpp>

int main()
{
    auto window = sf::RenderWindow(sf::VideoMode({800u, 600u}), "Fixed Timestep");
    window.setFramerateLimit(0); // Uncapped — we manage timing ourselves

    sf::Clock clock;
    const float fixedDt = 1.f / 60.f; // 60 Hz fixed update
    float accumulator = 0.f;

    while (window.isOpen())
    {
        float frameTime = clock.restart().asSeconds();
        // Clamp to avoid spiral of death
        if (frameTime > 0.25f)
            frameTime = 0.25f;
        accumulator += frameTime;

        // Events
        while (const auto event = window.pollEvent())
        {
            if (event->is<sf::Event::Closed>())
                window.close();
        }

        // Fixed update (physics, game logic)
        while (accumulator >= fixedDt)
        {
            update(fixedDt);
            accumulator -= fixedDt;
        }

        // Render
        window.clear();
        draw(window);
        window.display();
    }

    return 0;
}
```

---

## Playing Audio

```cpp
#include <SFML/Audio.hpp>

// Short sound effect (fully loaded into memory)
sf::SoundBuffer buffer;
if (!buffer.loadFromFile("assets/sounds/jump.wav"))
    return 1;

sf::Sound sound(buffer);
sound.play();

// Long music track (streamed from disk)
sf::Music music;
if (!music.openFromFile("assets/sounds/background.ogg"))
    return 1;

music.setLooping(true);
music.setVolume(50.f);  // 0–100
music.play();
```

**SFML 3 audio notes:**
- Backend is now **miniaudio** (replaced OpenAL from SFML 2).
- `sf::SoundBuffer::loadFromFile()` returns `bool`.
- `sf::Music::openFromFile()` returns `bool`.
- Keep the `SoundBuffer` alive while any `Sound` using it is playing.

---

## Module Reference (What to Link)

| Module | CMake Target | Depends On | Provides |
|--------|-------------|------------|----------|
| System | `SFML::System` | — | Time, threads, vectors, strings |
| Window | `SFML::Window` | System | Window creation, events, input, OpenGL context |
| Graphics | `SFML::Graphics` | Window, System | 2D rendering: sprites, shapes, text, shaders, render textures |
| Audio | `SFML::Audio` | System | Sound effects, music streaming, spatial audio |
| Network | `SFML::Network` | System | TCP/UDP sockets, HTTP, FTP |

Link only what you need. Most 2D games use `SFML::Graphics` + `SFML::Audio`.

---

## Next Steps

After getting your first window running:

1. **Build a resource manager** — centralize texture, font, and sound loading to avoid duplicates and manage lifetimes.
2. **Implement game states** — create a state machine (Menu, Gameplay, Pause) to organize your game screens.
3. **Add a tilemap** — SFML provides `sf::VertexArray` for efficient tile rendering. Draw tiles as textured quads in a vertex array for batched rendering.
4. **Explore render textures** — `sf::RenderTexture` lets you draw to an offscreen buffer for post-processing, minimaps, or lighting effects.
5. **Read the official tutorials** — [sfml-dev.org/tutorials/3.0/](https://www.sfml-dev.org/tutorials/3.0/) covers every module in depth.

---

## Common Setup Issues

| Problem | Solution |
|---------|----------|
| `CMake Error: FetchContent` | Ensure CMake 3.28+ is installed |
| Compiler errors about C++17 | Add `set(CMAKE_CXX_STANDARD 17)` to CMakeLists.txt |
| Font/texture not loading | Check file path is relative to the working directory (where you run the executable from), not the source directory |
| Sprite renders white rectangle | Texture went out of scope — keep it alive |
| `pollEvent` signature error | You're using SFML 2 syntax — SFML 3 returns `std::optional` |
| Linker errors for audio | Add `SFML::Audio` to `target_link_libraries` |
| First build takes minutes | Normal — FetchContent compiles SFML from source on first configure. Subsequent builds are fast. |
