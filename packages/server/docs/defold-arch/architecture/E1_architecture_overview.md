# E1 — Architecture Overview

> **Category:** explanation · **Engine:** Defold · **Related:** [G1 Message Passing](../guides/G1_message_passing.md) · [R1 Component Reference](../reference/R1_component_reference.md)

---

## Core Philosophy: Lightweight, Opinionated, Production-Ready

Defold is a **free, source-available game engine** originally built by Ragnar Svensson and Christian Murray, later developed by King, and now maintained by the Defold Foundation. It targets 2D games (with basic 3D support) and ships to Windows, macOS, Linux, iOS, Android, and HTML5 from a single codebase.

Unlike minimalist frameworks, Defold is a complete engine with a visual editor, a component-based architecture, a cloud build system, and an opinionated way of structuring games. The trade-off: you work within Defold's model rather than inventing your own.

---

## The Three Building Blocks

Everything in Defold is built from three core concepts:

### 1. Game Objects

A **game object** is a container with an ID, a position, a rotation, and a scale. On its own it does nothing — it exists to hold components. Think of it as an empty transform node.

Game objects can be defined inline inside a collection, or as reusable `.go` files referenced by multiple collections.

### 2. Components

**Components** give game objects behavior and representation:

| Component | Purpose |
|-----------|---------|
| Sprite | 2D image rendering from atlas/tilemap |
| Script | Lua logic (update, input, messages) |
| Collision Object | Physics shapes and collision groups |
| Sound | Audio playback |
| Label | Text rendering |
| Spine Model | Spine skeletal animation |
| Tilemap | Grid-based tile rendering |
| Particle FX | Particle systems |
| GUI | Separate UI layer with its own coordinate system |
| Factory | Runtime spawning of game objects |
| Collection Factory | Runtime spawning of entire collections |
| Camera | View projection for rendering |

A game object typically has a sprite (visuals), a script (logic), and a collision object (physics). Components are added in the editor and configured via properties.

### 3. Collections

A **collection** is a tree of game objects and sub-collections. It is the scene/level/prefab system — your main game world is a collection, a reusable enemy prefab is a collection, a UI overlay is a collection.

Collections can be:
- **Loaded at startup** (the bootstrap collection in `game.project`)
- **Loaded at runtime** via collection proxies (for level streaming, screens)
- **Spawned at runtime** via collection factories (for prefab instances)

```
main.collection
├── player.go
│   ├── sprite
│   ├── script (player.script)
│   └── collision_object
├── level.collection (sub-collection)
│   ├── ground.go
│   └── enemies.collection
└── hud.go
    └── gui (hud.gui)
```

---

## Message Passing: The Communication Model

Defold does **not** use direct function calls between game objects. Instead, all inter-object communication flows through **asynchronous message passing**.

```lua
-- Send a message to another game object's script
msg.post("enemy#script", "take_damage", { amount = 10 })

-- Receive it in the target's on_message callback
function on_message(self, message_id, message, sender)
    if message_id == hash("take_damage") then
        self.health = self.health - message.amount
    end
end
```

### Addressing Format

Messages use URL-style addresses: `[collection:/game_object#component]`

- `#component` — target a component on the same game object
- `/game_object#component` — target an object in the current collection
- `collection:/game_object#component` — full absolute path

### Why Message Passing?

- **Decoupling** — objects don't hold references to each other, making them reusable and testable.
- **Performance** — the engine batches and routes messages efficiently in C++.
- **Concurrency** — messages are processed once per frame in a deterministic order, avoiding race conditions.
- **Live reload** — decoupled objects can be hot-reloaded without breaking references.

The mental model shift for OOP developers: instead of `enemy:takeDamage(10)`, you post a message and the receiver handles it when it's ready. This is closer to actor-model concurrency than traditional OOP.

---

## Script Lifecycle

Each script component has lifecycle callbacks called by the engine:

```lua
function init(self)       -- Called once when the game object is created
function final(self)      -- Called once when the game object is destroyed
function update(self, dt) -- Called every frame with delta time
function on_message(self, message_id, message, sender)  -- Message handler
function on_input(self, action_id, action)               -- Input handler (if focus acquired)
function on_reload(self)  -- Called on hot reload (editor only)
```

The `self` table is your per-instance state — Defold's equivalent of instance variables.

---

## Properties: go.property

Expose script variables to the editor and to runtime access:

```lua
go.property("speed", 200)
go.property("health", 100)
go.property("color", vmath.vector4(1, 1, 1, 1))
```

These properties appear in the editor's Properties panel and can be overridden per-instance. At runtime, read/write them with `go.get()` and `go.set()`, and animate them with `go.animate()`.

---

## Build System

Defold uses a **cloud build server** (or local tools via `bob.jar`) that compiles your project for any target platform without local SDK installation. This is a unique advantage — you can ship an iOS build from a Linux machine.

The project is configured via `game.project` (INI-style) and extended with native extensions written in C/C++/Objective-C/Java using the Defold SDK.

---

## When to Choose Defold

- **Mobile 2D games** — optimized for small binary size and mobile performance
- **Cross-platform shipping** — one-click builds to 6+ platforms
- **Solo devs or small teams** — the editor and cloud builds reduce toolchain friction
- **HTML5 games** — excellent web export with small footprint

Defold is less suitable for 3D-heavy games, projects that need deep engine customization (without writing native extensions), or teams that prefer code-only workflows with no visual editor.
