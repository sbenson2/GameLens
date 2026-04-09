# G2 — Game Architecture Patterns with SFML 3

> **Category:** guide · **Engine:** SFML · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Getting Started](G1_getting_started.md) · [SFML 3 API Changes](../reference/R1_sfml3_api_changes.md)

SFML provides windowing, rendering, audio, and input but no game architecture. You build your own structure on top. This guide covers the three most common patterns for organizing SFML 3 games in C++17: the Game Loop class, State Stack, and Entity-Component-System (ECS) with EnTT.

---

## Pattern 1: The Game Class

The simplest architecture wraps the SFML game loop in a class with `init()`, `processEvents()`, `update()`, and `render()` methods. This separates concerns cleanly for small-to-medium projects.

```cpp
#pragma once
#include <SFML/Graphics.hpp>

class Game {
public:
    Game();
    void run();

private:
    void processEvents();
    void update(float dt);
    void render();

    sf::RenderWindow m_window;
    sf::Clock m_clock;
};
```

```cpp
#include "Game.hpp"

Game::Game()
    : m_window(sf::VideoMode({1280u, 720u}), "My Game")
{
    m_window.setFramerateLimit(60);
}

void Game::run() {
    while (m_window.isOpen()) {
        float dt = m_clock.restart().asSeconds();
        processEvents();
        update(dt);
        render();
    }
}

void Game::processEvents() {
    while (const auto event = m_window.pollEvent()) {
        if (event->is<sf::Event::Closed>())
            m_window.close();
    }
}

void Game::update(float dt) {
    // Update game objects using dt for frame-rate independence
}

void Game::render() {
    m_window.clear(sf::Color(30, 30, 46));
    // Draw game objects
    m_window.display();
}
```

### Fixed Timestep Variant

For physics-heavy games, use a fixed timestep with interpolation to decouple simulation rate from frame rate:

```cpp
void Game::run() {
    constexpr float fixedDt = 1.0f / 60.0f;
    float accumulator = 0.0f;

    while (m_window.isOpen()) {
        float frameTime = m_clock.restart().asSeconds();
        // Cap frame time to prevent spiral of death
        if (frameTime > 0.25f) frameTime = 0.25f;
        accumulator += frameTime;

        processEvents();

        while (accumulator >= fixedDt) {
            update(fixedDt);
            accumulator -= fixedDt;
        }

        // alpha = accumulator / fixedDt can be used for interpolation
        render();
    }
}
```

---

## Pattern 2: State Stack

Most games need multiple screens (menu, gameplay, pause, game over). A **State Stack** manages these as a LIFO stack — the topmost state receives input and renders. States can be pushed (pause screen on top of gameplay) or replaced (menu → gameplay).

### State Interface

```cpp
#pragma once
#include <SFML/Graphics.hpp>
#include <memory>

// Forward declare the StateManager so states can trigger transitions
class StateManager;

class State {
public:
    virtual ~State() = default;

    virtual void onEnter() {}
    virtual void onExit() {}
    virtual void handleEvent(const sf::Event& event) = 0;
    virtual void update(float dt) = 0;
    virtual void render(sf::RenderWindow& window) = 0;

    // If true, the state below this one still updates/renders
    virtual bool isTransparent() const { return false; }
    virtual bool allowsUpdateBelow() const { return false; }

    void setManager(StateManager* mgr) { m_manager = mgr; }

protected:
    StateManager* m_manager = nullptr;
};
```

### State Manager

```cpp
#pragma once
#include "State.hpp"
#include <stack>
#include <memory>
#include <functional>
#include <vector>

class StateManager {
public:
    void pushState(std::unique_ptr<State> state);
    void popState();
    void replaceState(std::unique_ptr<State> state);

    void handleEvent(const sf::Event& event);
    void update(float dt);
    void render(sf::RenderWindow& window);

    bool isEmpty() const { return m_states.empty(); }

private:
    // Pending changes are applied between frames to avoid
    // mutating the stack while iterating it
    enum class Action { Push, Pop, Replace };
    struct PendingChange {
        Action action;
        std::unique_ptr<State> state; // null for Pop
    };

    void applyPendingChanges();

    std::vector<std::unique_ptr<State>> m_states;
    std::vector<PendingChange> m_pending;
};
```

```cpp
#include "StateManager.hpp"

void StateManager::pushState(std::unique_ptr<State> state) {
    m_pending.push_back({Action::Push, std::move(state)});
}

void StateManager::popState() {
    m_pending.push_back({Action::Pop, nullptr});
}

void StateManager::replaceState(std::unique_ptr<State> state) {
    m_pending.push_back({Action::Replace, std::move(state)});
}

void StateManager::applyPendingChanges() {
    for (auto& change : m_pending) {
        switch (change.action) {
        case Action::Push:
            if (!m_states.empty()) m_states.back()->onExit();
            change.state->setManager(this);
            change.state->onEnter();
            m_states.push_back(std::move(change.state));
            break;
        case Action::Pop:
            if (!m_states.empty()) {
                m_states.back()->onExit();
                m_states.pop_back();
            }
            if (!m_states.empty()) m_states.back()->onEnter();
            break;
        case Action::Replace:
            if (!m_states.empty()) {
                m_states.back()->onExit();
                m_states.pop_back();
            }
            change.state->setManager(this);
            change.state->onEnter();
            m_states.push_back(std::move(change.state));
            break;
        }
    }
    m_pending.clear();
}

void StateManager::handleEvent(const sf::Event& event) {
    applyPendingChanges();
    if (!m_states.empty())
        m_states.back()->handleEvent(event);
}

void StateManager::update(float dt) {
    // Update from top down, stopping if a state blocks updates below it
    for (int i = static_cast<int>(m_states.size()) - 1; i >= 0; --i) {
        m_states[i]->update(dt);
        if (!m_states[i]->allowsUpdateBelow()) break;
    }
}

void StateManager::render(sf::RenderWindow& window) {
    // Find the lowest visible state, then render upward
    int start = static_cast<int>(m_states.size()) - 1;
    for (int i = start; i > 0; --i) {
        if (!m_states[i]->isTransparent()) { start = i; break; }
    }
    for (int i = start; i < static_cast<int>(m_states.size()); ++i) {
        m_states[i]->render(window);
    }
}
```

### Example State

```cpp
class PlayState : public State {
public:
    void onEnter() override {
        // Load resources, initialize level
    }

    void handleEvent(const sf::Event& event) override {
        if (const auto* key = event.getIf<sf::Event::KeyPressed>()) {
            if (key->scancode == sf::Keyboard::Scancode::Escape) {
                // Push pause state on top without destroying gameplay
                m_manager->pushState(std::make_unique<PauseState>());
            }
        }
    }

    void update(float dt) override { /* Physics, AI, game logic */ }
    void render(sf::RenderWindow& window) override { /* Draw world */ }
};

class PauseState : public State {
public:
    bool isTransparent() const override { return true; }  // Show game behind
    bool allowsUpdateBelow() const override { return false; } // Freeze game

    void handleEvent(const sf::Event& event) override {
        if (const auto* key = event.getIf<sf::Event::KeyPressed>()) {
            if (key->scancode == sf::Keyboard::Scancode::Escape) {
                m_manager->popState(); // Resume gameplay
            }
        }
    }

    void update(float dt) override { /* Animate pause menu */ }
    void render(sf::RenderWindow& window) override {
        // Draw semi-transparent overlay + pause menu
    }
};
```

---

## Pattern 3: ECS with EnTT

For complex games with many interacting entities (enemies, projectiles, pickups, particles), an **Entity-Component-System** separates data from logic. **EnTT** is the most popular C++ ECS library — header-only, C++20, and extremely fast.

### Setup with CMake

Add EnTT alongside SFML via FetchContent:

```cmake
FetchContent_Declare(EnTT
    GIT_REPOSITORY https://github.com/skypjack/entt.git
    GIT_TAG v3.14.0
)
FetchContent_MakeAvailable(EnTT)

target_link_libraries(MyGame PRIVATE SFML::Graphics SFML::Audio EnTT::EnTT)
```

### Components (Data Only)

Components are plain structs with no logic:

```cpp
struct Position { float x, y; };
struct Velocity { float dx, dy; };
struct Sprite {
    sf::Sprite sprite;
    Sprite(const sf::Texture& tex) : sprite(tex) {}
};
struct Health { int current, max; };
struct PlayerTag {};  // Empty "tag" component for filtering
```

### Systems (Logic Only)

Systems operate on entities that have specific component combinations:

```cpp
#include <entt/entt.hpp>

void movementSystem(entt::registry& reg, float dt) {
    // view() returns only entities with BOTH Position and Velocity
    auto view = reg.view<Position, Velocity>();
    for (auto [entity, pos, vel] : view.each()) {
        pos.x += vel.dx * dt;
        pos.y += vel.dy * dt;
    }
}

void renderSystem(entt::registry& reg, sf::RenderWindow& window) {
    auto view = reg.view<Position, Sprite>();
    for (auto [entity, pos, spr] : view.each()) {
        spr.sprite.setPosition({pos.x, pos.y});
        window.draw(spr.sprite);
    }
}

void healthSystem(entt::registry& reg) {
    auto view = reg.view<Health>();
    for (auto [entity, hp] : view.each()) {
        if (hp.current <= 0) {
            reg.destroy(entity); // Remove dead entities
        }
    }
}
```

### Wiring It Together

```cpp
class GameplayState : public State {
    entt::registry m_registry;
    sf::Texture m_playerTex;

public:
    void onEnter() override {
        m_playerTex.loadFromFile("player.png");

        // Create the player entity
        auto player = m_registry.create();
        m_registry.emplace<Position>(player, 400.f, 300.f);
        m_registry.emplace<Velocity>(player, 0.f, 0.f);
        m_registry.emplace<Sprite>(player, m_playerTex);
        m_registry.emplace<Health>(player, 100, 100);
        m_registry.emplace<PlayerTag>(player);
    }

    void update(float dt) override {
        movementSystem(m_registry, dt);
        healthSystem(m_registry);
    }

    void render(sf::RenderWindow& window) override {
        renderSystem(m_registry, window);
    }
};
```

### When to Use ECS vs. Simpler Patterns

- **Small games (< 20 entity types):** The Game Class pattern is sufficient. ECS adds indirection without much benefit.
- **Medium games (20–100 entity types):** State Stack + inheritance-based entities work well. Consider ECS if you find deep inheritance hierarchies forming.
- **Complex games (100+ entity types, emergent behaviors):** ECS shines here. Adding new behaviors means adding new components and systems without touching existing code.

---

## Resource Manager Pattern

SFML does not include a resource manager. A simple template-based manager avoids duplicate loading and ensures cleanup:

```cpp
#pragma once
#include <unordered_map>
#include <string>
#include <memory>
#include <stdexcept>

template <typename Resource>
class ResourceManager {
public:
    void load(const std::string& id, const std::string& filename) {
        auto resource = std::make_unique<Resource>();
        if (!resource->loadFromFile(filename)) {
            throw std::runtime_error("Failed to load: " + filename);
        }
        m_resources[id] = std::move(resource);
    }

    const Resource& get(const std::string& id) const {
        auto it = m_resources.find(id);
        if (it == m_resources.end())
            throw std::runtime_error("Resource not found: " + id);
        return *it->second;
    }

private:
    std::unordered_map<std::string, std::unique_ptr<Resource>> m_resources;
};

// Usage:
// ResourceManager<sf::Texture> textures;
// textures.load("player", "assets/player.png");
// sf::Sprite sprite(textures.get("player"));
```

This works with any SFML resource that has `loadFromFile()` — textures, fonts, and sound buffers.

---

## Combining the Patterns

A well-structured SFML 3 game typically uses all three patterns together:

```
Game (owns window, clock, runs main loop)
  └── StateManager (manages state stack)
       ├── MenuState (simple — no ECS needed)
       ├── GameplayState (complex — uses ECS)
       │    └── entt::registry (entities, components, systems)
       └── PauseState (transparent overlay)
```

The `Game` class handles the window and frame timing. The `StateManager` routes events and updates to the current state. Complex states like gameplay use ECS internally for entity management, while simple states like menus use direct SFML drawing.
