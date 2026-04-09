# SFML 3 — AI Rules

Engine-specific rules for projects using SFML 3 (Simple and Fast Multimedia Library). These supplement the engine-agnostic rules in `docs/core/ai-workflow/gamedev-rules.md`.

---

## Architecture Context

### Tech Stack

- **Library:** SFML 3 (cross-platform C++ multimedia library)
- **Language:** C++17 (required — upgraded from C++11 in SFML 2)
- **Rendering:** OpenGL (abstracted behind sf::RenderWindow / sf::Graphics)
- **Audio Backend:** miniaudio (replaced OpenAL in SFML 3)
- **Build System:** CMake (FetchContent for dependencies — no bundled binaries)
- **Platforms:** Windows, macOS, Linux, iOS, Android
- **Key Modules:**
  - System (time, threads, streams)
  - Window (window creation, OpenGL context, input events)
  - Graphics (2D rendering: sprites, shapes, text, render textures)
  - Audio (sound playback, recording, music streaming, spatial audio)
  - Network (TCP/UDP sockets, HTTP, FTP)

### What SFML Is (and Is Not)

SFML is a **mid-level multimedia library** with a clean, object-oriented C++ API. It provides windowing, 2D rendering, audio, networking, and system utilities. SFML is NOT a game engine — it has no scene graph, no editor, no physics, and no ECS. You build your game architecture on top of SFML's modules.

SFML 3 is the first major release since SFML 2 (2013) and includes significant breaking changes: C++17 requirement, strong types (sf::Angle), std::optional returns, miniaudio backend, and modernized APIs.

### Project Structure Conventions

```
{ProjectName}/
├── src/
│   ├── main.cpp            # Entry point, window + game loop
│   ├── Game.cpp/h          # Game class (init, update, render)
│   ├── States/             # Game states (menu, gameplay, pause)
│   │   ├── MenuState.cpp/h
│   │   └── PlayState.cpp/h
│   ├── Entities/           # Game objects
│   └── Resources/          # Resource manager, loaders
├── assets/                 # Textures, fonts, sounds, shaders
│   ├── textures/
│   ├── fonts/
│   ├── sounds/
│   └── shaders/
├── CMakeLists.txt          # CMake build (FetchContent for SFML)
└── README.md
```

---

## Module Dependency Hierarchy

SFML modules have a strict dependency chain:

```
Network ──┐
Graphics ─┤──► Window ──► System
Audio ─────────────────────┘
```

- **System** is standalone (no dependencies)
- **Window** depends on System
- **Graphics** depends on Window + System
- **Audio** depends on System only
- **Network** depends on System only

You only link what you use. A headless network app needs only sfml-network and sfml-system.

---

## SFML 3-Specific Code Rules

### C++17 Required

SFML 3 requires C++17. Use modern features: `std::optional`, structured bindings, `if constexpr`, `std::string_view`. Set `CMAKE_CXX_STANDARD 17` in CMakeLists.txt.

### Strong Type: sf::Angle

All rotation/angle parameters now use `sf::Angle` instead of raw floats:

```cpp
// SFML 2 (WRONG for SFML 3):
shape.setRotation(90.f);

// SFML 3 (CORRECT):
shape.setRotation(sf::degrees(90.f));
float deg = shape.getRotation().asDegrees();
float rad = shape.getRotation().asRadians();
```

Always use `sf::degrees()` or `sf::radians()` to construct angles. Never pass raw floats where `sf::Angle` is expected.

### Events Use std::optional

`pollEvent` and `waitEvent` now return `std::optional<sf::Event>` instead of taking an output parameter:

```cpp
// SFML 2 (WRONG for SFML 3):
sf::Event event;
while (window.pollEvent(event)) { ... }

// SFML 3 (CORRECT):
while (const auto event = window.pollEvent()) {
    if (const auto* closed = event->getIf<sf::Event::Closed>()) {
        window.close();
    }
    if (const auto* keyPressed = event->getIf<sf::Event::KeyPressed>()) {
        // keyPressed->code, keyPressed->scancode, etc.
    }
}
```

Events are now type-safe variants accessed via `getIf<>()`.

### Game Loop Pattern

SFML uses an explicit game loop that you write yourself:

```cpp
#include <SFML/Graphics.hpp>

int main() {
    auto window = sf::RenderWindow(sf::VideoMode({800u, 600u}), "Game Title");
    window.setFramerateLimit(60);

    sf::Clock clock;

    while (window.isOpen()) {
        while (const auto event = window.pollEvent()) {
            if (event->is<sf::Event::Closed>())
                window.close();
        }

        float dt = clock.restart().asSeconds();

        // Update game state using dt

        window.clear(sf::Color::Black);
        // Draw game objects
        window.display();
    }
    return 0;
}
```

### Resource Loading

SFML 3 resource loading methods return `bool` to indicate success or failure:

```cpp
// Loading a texture (SFML 3)
sf::Texture texture;
if (!texture.loadFromFile("player.png")) {
    // Handle error — file not found or invalid format
}
sf::Sprite sprite(texture);
```

Note: Create the resource object first, then call `loadFromFile()` / `openFromFile()` on it. The methods return `bool` — check the return value before using the resource.

### Audio: miniaudio Backend

SFML 3 replaced OpenAL with miniaudio. The user-facing API is similar, but:
- `sf::Sound` requires a `sf::SoundBuffer` (short sounds, fully loaded)
- `sf::Music` streams from file (long music tracks)
- Spatial audio (3D positioning) is still supported via listener/source model

### CMake FetchContent for Dependencies

SFML 3 no longer bundles third-party binaries. Use CMake FetchContent:

```cmake
cmake_minimum_required(VERSION 3.28)
project(MyGame)
set(CMAKE_CXX_STANDARD 17)

include(FetchContent)
FetchContent_Declare(SFML
    GIT_REPOSITORY https://github.com/SFML/SFML.git
    GIT_TAG 3.0.0
)
FetchContent_MakeAvailable(SFML)

add_executable(MyGame src/main.cpp)
target_link_libraries(MyGame PRIVATE SFML::Graphics SFML::Audio)
```

---

## Migration from SFML 2

When assisting with SFML 2 → SFML 3 migration:

1. Set C++ standard to 17
2. Replace raw float angles with `sf::degrees()` / `sf::radians()`
3. Update event handling to `std::optional` + `getIf<>()`
4. Update `loadFromFile()` usage — SFML 3 still returns `bool`, but some method names changed (e.g., `openFromFile` for Font and Music)
5. Update `sf::VideoMode` construction: `sf::VideoMode({width, height})`
6. Review renamed/removed APIs in the official migration guide
7. Switch from `find_package(SFML)` with prebuilt binaries to FetchContent

---

## Common Mistakes to Catch

- Using SFML 2 event polling pattern (`while (window.pollEvent(event))` with reference param)
- Passing raw floats where `sf::Angle` is expected
- Using C++11/14 standard (SFML 3 requires C++17)
- Assuming OpenAL is the audio backend (it's miniaudio now)
- Bundling SFML binaries instead of using CMake FetchContent
- Drawing outside `window.clear()` / `window.display()` cycle
- Not checking `bool` returns from resource loading methods
- Creating sf::Sprite without keeping the sf::Texture alive (texture must outlive sprite)
- Using SFML 2 class names that were renamed (check migration guide)
