# G5 — Resource Management Patterns in SFML 3

> **Category:** guide · **Engine:** SFML · **Related:** [Getting Started](G1_getting_started.md) · [Architecture Overview](../architecture/E1_architecture_overview.md) · [SFML3 API Changes](../reference/R1_sfml3_api_changes.md)

SFML doesn't include a built-in resource manager. Textures, fonts, sound buffers, and shaders are plain C++ objects that you manage yourself. This guide covers ownership patterns, a reusable resource manager implementation, and best practices for avoiding the most common resource-lifetime bugs in SFML 3.

---

## Why Resource Management Matters

SFML's drawable objects (sprites, text, sounds) hold **pointers, not copies**, to their underlying resources:

- `sf::Sprite` → points to an `sf::Texture`
- `sf::Text` → points to an `sf::Font`
- `sf::Sound` → points to an `sf::SoundBuffer`

If the resource is destroyed while the dependent object is still alive, you get undefined behavior — white rectangles, garbled text, or crashes. A resource manager solves this by centralizing ownership and guaranteeing that resources outlive all objects that use them.

---

## SFML 3 Resource Loading API

SFML 3 provides two loading patterns for most resources:

### Pattern 1: Default Construct + Load Method

```cpp
sf::Texture texture;
if (!texture.loadFromFile("player.png"))
{
    // Handle error — returns false on failure
}
```

### Pattern 2: Constructor That Throws

```cpp
// Throws sf::Exception on failure
auto texture = sf::Texture("player.png");
```

Use pattern 1 when you want graceful fallback. Use pattern 2 when a missing resource is fatal and you want exception-based error handling.

### SFML 3 Method Names (Changed from SFML 2)

| Resource | SFML 2 Method | SFML 3 Method | Returns |
|----------|--------------|---------------|---------|
| `sf::Texture` | `loadFromFile()` | `loadFromFile()` | `bool` |
| `sf::Font` | `loadFromFile()` | `openFromFile()` | `bool` |
| `sf::SoundBuffer` | `loadFromFile()` | `loadFromFile()` | `bool` |
| `sf::Music` | `openFromFile()` | `openFromFile()` | `bool` |
| `sf::Shader` | `loadFromFile()` | `loadFromFile()` | `bool` |

Note that `sf::Font` changed from `loadFromFile` to `openFromFile` in SFML 3. All methods also have `loadFromMemory()` / `openFromMemory()` and `loadFromStream()` / `openFromStream()` variants.

---

## Basic Resource Holder (Template)

A generic, type-safe resource holder using `std::unordered_map` and `std::unique_ptr`:

```cpp
#pragma once
#include <unordered_map>
#include <memory>
#include <string>
#include <stdexcept>
#include <cassert>

template <typename Resource, typename Identifier = std::string>
class ResourceHolder
{
public:
    // Load a resource from a file and store it under the given ID
    void load(const Identifier& id, const std::string& filename)
    {
        auto resource = std::make_unique<Resource>();
        if (!resource->loadFromFile(filename))
            throw std::runtime_error("ResourceHolder: Failed to load " + filename);

        auto inserted = resources_.emplace(id, std::move(resource));
        assert(inserted.second);  // Fails if ID already exists
    }

    // Load with an additional parameter (e.g., shader type, texture rect)
    template <typename Parameter>
    void load(const Identifier& id, const std::string& filename, const Parameter& param)
    {
        auto resource = std::make_unique<Resource>();
        if (!resource->loadFromFile(filename, param))
            throw std::runtime_error("ResourceHolder: Failed to load " + filename);

        auto inserted = resources_.emplace(id, std::move(resource));
        assert(inserted.second);
    }

    // Retrieve a resource (const and non-const)
    Resource& get(const Identifier& id)
    {
        auto found = resources_.find(id);
        assert(found != resources_.end());
        return *found->second;
    }

    const Resource& get(const Identifier& id) const
    {
        auto found = resources_.find(id);
        assert(found != resources_.end());
        return *found->second;
    }

    // Check if a resource is already loaded
    bool has(const Identifier& id) const
    {
        return resources_.find(id) != resources_.end();
    }

    // Remove a resource (e.g., when leaving a level)
    void unload(const Identifier& id)
    {
        resources_.erase(id);
    }

    // Remove all resources
    void clear()
    {
        resources_.clear();
    }

private:
    std::unordered_map<Identifier, std::unique_ptr<Resource>> resources_;
};
```

### Type Aliases

```cpp
// Define convenient aliases for each resource type
using TextureHolder = ResourceHolder<sf::Texture>;
using FontHolder    = ResourceHolder<sf::Font>;
using SoundHolder   = ResourceHolder<sf::SoundBuffer>;
```

### Adapting for sf::Font (openFromFile)

Since `sf::Font` uses `openFromFile` instead of `loadFromFile` in SFML 3, you need a specialization or a wrapper:

```cpp
// Option A: Specialize the load method for sf::Font
template <>
void ResourceHolder<sf::Font>::load(const std::string& id, const std::string& filename)
{
    auto resource = std::make_unique<sf::Font>();
    if (!resource->openFromFile(filename))
        throw std::runtime_error("ResourceHolder: Failed to load font " + filename);

    auto inserted = resources_.emplace(id, std::move(resource));
    assert(inserted.second);
}
```

---

## Using the Resource Holder

### Loading Resources at Startup

```cpp
// In your Game or Application class
class Game
{
public:
    Game()
    {
        loadResources();
    }

private:
    void loadResources()
    {
        // Textures
        textures.load("player", "assets/textures/player.png");
        textures.load("enemy",  "assets/textures/enemy.png");
        textures.load("tiles",  "assets/textures/tileset.png");

        // Fonts
        fonts.load("main",  "assets/fonts/main.ttf");
        fonts.load("title", "assets/fonts/title.ttf");

        // Sound buffers
        sounds.load("jump",   "assets/sounds/jump.wav");
        sounds.load("shoot",  "assets/sounds/shoot.wav");
    }

    TextureHolder textures;
    FontHolder    fonts;
    SoundHolder   sounds;
};
```

### Passing Resources to Game Objects

```cpp
class Player
{
public:
    Player(const TextureHolder& textures)
        : sprite(textures.get("player"))
    {
        sprite.setPosition({100.f, 100.f});
    }

    void draw(sf::RenderWindow& window) const
    {
        window.draw(sprite);
    }

private:
    sf::Sprite sprite;
};

// Usage:
Player player(game.textures);
```

---

## Enum-Based Identifiers

For larger projects, use enums instead of strings to catch typos at compile time:

```cpp
enum class TextureID
{
    Player,
    Enemy,
    Tileset,
    Bullet,
    Background
};

enum class FontID
{
    Main,
    Title,
    Debug
};

using TextureHolder = ResourceHolder<sf::Texture, TextureID>;
using FontHolder    = ResourceHolder<sf::Font, FontID>;
```

You'll need a hash function for the enum:

```cpp
// Specialize std::hash for your enums
namespace std {
    template <> struct hash<TextureID> {
        std::size_t operator()(TextureID id) const noexcept {
            return std::hash<int>{}(static_cast<int>(id));
        }
    };
}

// Now you can use enums as keys:
textures.load(TextureID::Player, "assets/textures/player.png");
auto& tex = textures.get(TextureID::Player);
```

---

## Per-Level Resource Loading

For games with distinct levels, load and unload resources per level to manage memory:

```cpp
class LevelManager
{
public:
    void loadLevel(int levelNum)
    {
        // Unload previous level's resources
        levelTextures.clear();
        levelSounds.clear();

        // Load level-specific resources
        auto prefix = "assets/levels/level" + std::to_string(levelNum) + "/";
        levelTextures.load("background", prefix + "background.png");
        levelTextures.load("tileset",    prefix + "tileset.png");

        // Keep global resources separate (fonts, UI textures)
        // — those live in a different holder with game-wide lifetime
    }

private:
    TextureHolder levelTextures;  // Cleared per level
    SoundHolder   levelSounds;    // Cleared per level
};
```

### Two-Tier Pattern

A common architecture uses two resource layers:

| Layer | Lifetime | Contains |
|-------|----------|----------|
| Global | Entire application | Fonts, UI textures, menu sounds, common sprites |
| Level | Current level/scene | Level backgrounds, tilesets, enemy variants, level music buffers |

The global holder is created at startup and never cleared. The level holder is cleared and reloaded on each level transition.

---

## Lazy Loading

For optional or rarely-used resources, load on first access:

```cpp
template <typename Resource, typename Identifier>
Resource& ResourceHolder<Resource, Identifier>::getOrLoad(
    const Identifier& id, const std::string& filename)
{
    if (!has(id))
        load(id, filename);
    return get(id);
}
```

Use sparingly — lazy loading causes frame hitches if a large texture loads mid-gameplay. Prefer explicit preloading for anything on the critical path.

---

## sf::Music — Streaming (Not Cached)

`sf::Music` streams audio from disk and should NOT be stored in a resource holder. It doesn't use `loadFromFile()` — it uses `openFromFile()` and streams data progressively:

```cpp
sf::Music music;
if (!music.openFromFile("assets/music/theme.ogg"))
    return;

music.setLooping(true);
music.setVolume(50.f);
music.play();
```

`sf::Music` is a non-copyable, non-movable object. Create it where it lives (e.g., as a member of your Game or AudioManager class) and open different files as needed.

**Key distinction:**
- `sf::SoundBuffer` → loads entire audio file into memory → goes in a resource holder
- `sf::Music` → streams from disk → lives as a long-lived member, not in a holder

---

## Thread Safety

SFML resources are **not thread-safe**. If you load resources on a background thread (e.g., a loading screen), ensure no drawing happens with those resources until loading completes:

```cpp
#include <thread>
#include <atomic>

std::atomic<bool> loaded{false};

// Background loading thread
std::thread loader([&]() {
    textures.load("big_atlas", "assets/textures/atlas_4k.png");
    sounds.load("ambience", "assets/sounds/forest_loop.ogg");
    loaded = true;
});

// Main thread: show loading screen
while (!loaded)
{
    // Draw loading animation — do NOT access `textures` or `sounds` here
    window.clear();
    window.draw(loadingSpinner);
    window.display();
}

loader.join();
// Now safe to use loaded resources
```

---

## Common Lifetime Bugs

| Symptom | Cause | Fix |
|---------|-------|-----|
| White rectangle instead of sprite | `sf::Texture` went out of scope | Move texture into a resource holder with longer lifetime |
| Garbled or missing text | `sf::Font` destroyed before `sf::Text` | Same — centralize font ownership |
| Crash on sound play | `sf::SoundBuffer` destroyed while `sf::Sound` is playing | Keep buffers alive; stop sounds before clearing the holder |
| Memory grows unbounded | Resources loaded but never unloaded | Use per-level holders; call `clear()` on level transitions |
| Frame hitch during gameplay | Large texture loaded synchronously mid-frame | Preload all level resources during a loading screen |

---

## Recommended Project Layout

```
assets/
├── textures/
│   ├── player.png
│   ├── enemies/
│   │   ├── slime.png
│   │   └── bat.png
│   └── ui/
│       ├── button.png
│       └── panel.png
├── fonts/
│   ├── main.ttf
│   └── title.ttf
├── sounds/
│   ├── jump.wav
│   ├── shoot.wav
│   └── explosion.wav
└── music/
    ├── menu.ogg
    └── level1.ogg
```

Keep textures, fonts, sounds, and music in separate directories. Use consistent naming. The resource holder maps logical IDs to these file paths, so your game code never contains raw path strings after the initial `load()` calls.
