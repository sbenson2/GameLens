# R1 — SFML 3 API Reference and Migration

> **Category:** reference · **Engine:** SFML · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Getting Started](../guides/G1_getting_started.md) · [SFML Rules](../sfml-arch-rules.md)

SFML 3.0.0 was released in December 2024 — the first major version since SFML 2 in 2013. It modernizes the library to C++17, introduces strong types, replaces deprecated patterns with standard library equivalents, and cleans up over a decade of API inconsistencies. This reference covers the key API changes and how to migrate existing SFML 2 code.

---

## C++17 Requirement

SFML 3 raises the minimum C++ standard from C++11 to **C++17**. This is a hard requirement — your compiler and project settings must target C++17 or later.

The C++17 upgrade enables SFML to use `std::optional`, `std::string_view`, `std::filesystem`, structured bindings, and other modern features throughout its API.

### Compiler Minimums

| Compiler | Minimum Version |
|----------|----------------|
| GCC | 9+ |
| Clang | 10+ |
| MSVC | 2019 (16.0)+ |
| Apple Clang | 12+ (Xcode 12) |

---

## Removed: Threading and Synchronization Primitives

SFML 3 removes all custom threading classes. Use their standard library replacements:

| SFML 2 (Removed) | C++17 Replacement |
|-------------------|-------------------|
| `sf::Thread` | `std::thread` or `std::jthread` (C++20) |
| `sf::Mutex` | `std::mutex` |
| `sf::Lock` | `std::lock_guard` or `std::scoped_lock` |
| `sf::ThreadLocal` | `thread_local` keyword |
| `sf::ThreadLocalPtr` | `thread_local` keyword |
| `sf::Sleep` | `std::this_thread::sleep_for` |

### Migration Example

```cpp
// SFML 2
sf::Thread thread(&loadAssets);
thread.launch();
sf::Mutex mutex;
{
    sf::Lock lock(mutex);
    // critical section
}

// SFML 3
std::thread thread(&loadAssets);
std::mutex mutex;
{
    std::lock_guard lock(mutex);
    // critical section
}
thread.join();
```

---

## Vector API Changes

SFML 3 unifies paired scalar parameters into `sf::Vector2<T>` throughout the API. Functions that previously took `(float x, float y)` now take `sf::Vector2f`. This is usually a simple change — wrap the two values in braces.

### New Vector Operations

`sf::Vector2<T>` and `sf::Vector3<T>` gained mathematical utilities that previously required manual implementation:

```cpp
sf::Vector2f v{3.f, 4.f};

// New in SFML 3 — length, normalization, dot/cross, angle operations
float len   = v.length();         // 5.0
auto  unit  = v.normalized();     // {0.6, 0.8}
float dot   = v.dot({1.f, 0.f}); // 3.0
float cross = v.cross({0.f, 1.f});

// Angle-based construction and rotation
auto  dir   = sf::Vector2f::fromAngle(sf::degrees(45.f));
auto  angle = v.angle();          // returns sf::Angle
auto  rot   = v.rotatedBy(sf::degrees(90.f));

// Component-wise operations
auto  scaled = v.componentWiseMul({2.f, 3.f}); // {6.f, 12.f}
auto  divided = v.componentWiseDiv({2.f, 4.f}); // {1.5f, 1.f}
```

### Migration Example

```cpp
// SFML 2
window.setSize(800, 600);
sprite.setPosition(100.f, 200.f);
shape.setSize(50.f, 50.f);

// SFML 3
window.setSize({800u, 600u});
sprite.setPosition({100.f, 200.f});
shape.setSize({50.f, 50.f});
```

---

## Strong Types: sf::Angle

SFML 3 replaces raw `float` angles with a dedicated `sf::Angle` type, eliminating the "was that degrees or radians?" confusion:

```cpp
// SFML 2
sprite.setRotation(90.f); // degrees? radians? you had to check

// SFML 3 — explicit and unambiguous
sprite.setRotation(sf::degrees(90.f));
sprite.setRotation(sf::radians(1.5708f));

// Angle arithmetic
sf::Angle a = sf::degrees(45.f);
sf::Angle b = sf::degrees(30.f);
sf::Angle c = a + b;              // 75 degrees
float deg   = c.asDegrees();      // 75.f
float rad   = c.asRadians();      // ~1.309f
```

---

## std::optional for Nullable Returns

SFML 3 uses `std::optional` where functions may not return a value. This replaces boolean out-parameters and special sentinel values.

### Rectangle Intersection

```cpp
// SFML 2 — two overloads, awkward boolean + out-parameter pattern
sf::FloatRect overlap;
if (rect1.intersects(rect2, overlap)) {
    // use overlap
}

// SFML 3 — single function, returns std::optional
if (auto overlap = rect1.findIntersection(rect2)) {
    // overlap.value() is the intersection rectangle
    float w = overlap->size.x;
}
```

### Resource Loading

SFML 3 replaces `bool loadFromFile()` patterns with factory functions returning `std::optional`:

```cpp
// SFML 2
sf::Texture texture;
if (!texture.loadFromFile("player.png")) {
    // handle error
}

// SFML 3
auto texture = sf::Texture::loadFromFile("player.png");
if (!texture) {
    // handle error — texture is std::optional<sf::Texture>
}
// Use *texture or texture.value()
sprite.setTexture(*texture);
```

This pattern applies consistently across `sf::Texture`, `sf::Font`, `sf::SoundBuffer`, `sf::Image`, `sf::Shader`, and other resource types.

---

## Audio Backend: miniaudio

SFML 3 replaces OpenAL with **miniaudio** as the audio backend. The public API remains largely the same (`sf::Sound`, `sf::Music`, `sf::SoundBuffer`), but there are subtle changes:

- `sf::SoundRecorder` API updated for miniaudio's capture model
- `sf::Listener` is now per-sound-engine rather than a global static
- The `sf::SoundStream` base class gained simpler virtual method signatures

### Migration

Most game code using `sf::Sound` and `sf::Music` requires no changes. If you subclassed `sf::SoundStream` for custom audio, review the updated virtual interface.

---

## CMake and Dependency Changes

SFML 3 overhauled build system integration:

### FetchContent (No Bundled Dependencies)

SFML no longer ships third-party binaries. Dependencies are fetched and built automatically via CMake's `FetchContent`:

```cmake
include(FetchContent)
FetchContent_Declare(
    SFML
    GIT_REPOSITORY https://github.com/SFML/SFML.git
    GIT_TAG 3.0.0
)
FetchContent_MakeAvailable(SFML)

target_link_libraries(my_game PRIVATE SFML::Graphics SFML::Audio)
```

### Target Names Changed

| SFML 2 | SFML 3 |
|--------|--------|
| `sfml-graphics` | `SFML::Graphics` |
| `sfml-window` | `SFML::Window` |
| `sfml-audio` | `SFML::Audio` |
| `sfml-network` | `SFML::Network` |
| `sfml-system` | `SFML::System` |

---

## Other Notable Changes

### Renamed and Removed APIs

| SFML 2 | SFML 3 |
|--------|--------|
| `sf::Keyboard::Key::Return` | `sf::Keyboard::Key::Enter` |
| `sf::Keyboard::Key::BackSpace` | `sf::Keyboard::Key::Backspace` |
| Several deprecated `Key` aliases | Removed — use canonical names |
| `sf::Event` union-based type | `sf::Event` is now a `std::variant`-based type |
| `event.type == sf::Event::Closed` | `event.is<sf::Event::Closed>()` |
| `event.key.code` | `event.getIf<sf::Event::KeyPressed>()->code` |

### Event Handling Migration

```cpp
// SFML 2
sf::Event event;
while (window.pollEvent(event)) {
    if (event.type == sf::Event::Closed)
        window.close();
    if (event.type == sf::Event::KeyPressed && event.key.code == sf::Keyboard::Escape)
        window.close();
}

// SFML 3
while (auto event = window.pollEvent()) {
    if (event->is<sf::Event::Closed>())
        window.close();
    if (const auto* keyEvent = event->getIf<sf::Event::KeyPressed>()) {
        if (keyEvent->code == sf::Keyboard::Key::Escape)
            window.close();
    }
}
```

### Rect Changes

- `sf::Rect<T>` fields changed from `left, top, width, height` to `position` (`sf::Vector2<T>`) and `size` (`sf::Vector2<T>`)
- `rect.contains(x, y)` → `rect.contains({x, y})`
- `rect.intersects(other)` → `rect.findIntersection(other)` (returns `std::optional`)

---

## Quick Migration Checklist

1. **Set C++17** in your build system (`CMAKE_CXX_STANDARD 17` or `/std:c++17`)
2. **Replace threading** — swap `sf::Thread`/`sf::Mutex` for `std::thread`/`std::mutex`
3. **Wrap scalar pairs** — `(x, y)` becomes `{x, y}` for vector parameters
4. **Use sf::Angle** — `setRotation(90.f)` becomes `setRotation(sf::degrees(90.f))`
5. **Use std::optional** — `loadFromFile()` returns `std::optional`, not `bool`
6. **Update events** — switch from union-style to `is<>()`/`getIf<>()` pattern
7. **Update CMake targets** — `sfml-graphics` becomes `SFML::Graphics`
8. **Update Rect access** — `.left`/`.top` become `.position.x`/`.position.y`
9. **Test audio** — miniaudio backend should be transparent, but verify playback
