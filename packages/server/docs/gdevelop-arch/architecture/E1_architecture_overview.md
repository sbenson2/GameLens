# E1 — GDevelop Architecture Overview

> **Category:** explanation · **Engine:** GDevelop · **Related:** [G1 Event Patterns](../guides/G1_event_patterns.md) · [G2 Behaviors and Extensions](../guides/G2_behaviors_extensions.md)

---

## Core Philosophy: Events, Objects, and Scenes — No Code Required

GDevelop is an open-source, no-code game engine created by Florian Rival. Its architecture is designed so that anyone — from students to experienced developers — can build and publish games without writing code. The engine rests on three pillars:

1. **Events** — the logic system. Game logic is expressed as visual rows of conditions and actions. Events read like sentences: "If Player collides with Coin → Delete Coin, Add 1 to Score". No text-based programming is required, though JavaScript is available for advanced use.
2. **Objects** — the building blocks. Sprites, text, tilemaps, particles, shapes, 3D models — everything visible in the game is an Object with properties, behaviors, and animations.
3. **Scenes** — the containers. Each scene is a self-contained level or screen with its own objects, layers, event sheet, and camera. The game transitions between scenes.

GDevelop sits in a different niche than GameMaker (which requires GML scripting) or Construct (which requires a subscription). GDevelop is free, open-source, and designed so that the event system is the *only* tool most developers need.

---

## The Event System

### Event Structure

An event is a row with two halves:

```
[Conditions]  →  [Actions]
```

- **Conditions** are evaluated every frame (60 FPS default). If ALL conditions in a row are true, the actions execute.
- **Actions** modify game state — move objects, change variables, play sounds, switch scenes.

### Event Types

| Type | Purpose |
|------|---------|
| **Standard Event** | Condition → Action (runs every frame conditions are true) |
| **Sub-event** | Nested under a parent; runs only when parent is true |
| **Comment** | Documentation (no logic) |
| **For Each** | Iterates per-instance of an object type |
| **Repeat** | Runs actions N times in a single frame |
| **While** | Loops until condition is false (careful — can freeze!) |
| **Link / External Events** | Imports events from another sheet (modularity) |
| **JavaScript Code** | Inline JS block for advanced computation |

### Execution Order

Each frame, GDevelop executes:

```
1. Events (top → bottom, depth-first into sub-events)
2. Behavior updates (physics, platformer, pathfinding, etc.)
3. Object timers and tweens
4. Rendering (layer order)
```

Events are the *first* thing that runs — so changes to position, variables, or state take effect before behaviors and rendering process them.

---

## Objects

### Built-in Object Types

| Object | Description |
|--------|-------------|
| **Sprite** | Animated image with collision mask — the primary game object |
| **Tiled Sprite** | Repeating texture for backgrounds and terrain |
| **Tilemap** | Grid-based painting from a tileset (built-in editor since 2024) |
| **Text** | Dynamic text with formatting, effects, and word-wrap |
| **Bitmap Text** | Pixel-art font rendering from a spritesheet |
| **Shape Painter** | Draws primitives (rect, circle, line) at runtime |
| **Particle Emitter** | GPU-accelerated particles for fire, smoke, sparks |
| **3D Box / 3D Model** | Basic 3D objects (experimental, 2025+) |
| **Video** | Plays video files within the game |
| **Custom Object** | User-defined prefab combining multiple objects |

### Object Instances

Placing an Object on a Scene creates an **instance**. Each instance has its own position, angle, size, opacity, and object variables. Multiple instances of the same Object share animations and behaviors but have independent state.

### Object Variables

```
Object: Enemy
├── Variable: health (Number) = 100
├── Variable: state (String) = "patrol"
├── Variable: inventory (Structure)
│   ├── weapon → "sword"
│   └── gold → 50
```

Variables can be numbers, strings, booleans, structures (key-value), or arrays.

---

## Behaviors

Behaviors are pre-packaged capabilities you attach to objects. They are the primary mechanism for adding game mechanics without writing events.

### Built-in Behaviors

| Behavior | What It Does |
|----------|-------------|
| **Platformer Character** | Gravity, jumping, slopes, ledge handling |
| **Platformer Object** | Marks an object as a solid platform |
| **Top-Down Movement** | 4/8-direction movement with acceleration |
| **Physics 2.0** | Full Box2D simulation (collisions, forces, joints) |
| **3D Physics** | 3D rigid body simulation (2025+) |
| **Pathfinding** | A* grid-based pathfinding |
| **Draggable** | Mouse/touch drag-and-drop |
| **Tween** | Smooth interpolation of any property |
| **Destroy Outside Screen** | Auto-cleanup for off-screen objects |
| **Stay On Screen** | Clamp position within viewport |

### Custom Behaviors (Event-Based)

You can create behaviors entirely through events — no JavaScript required:

```
Behavior: "HealthSystem"
├── Property: maxHealth (Number, default 100)
├── Property: currentHealth (Number, default 100)
├── Property: invincibleDuration (Number, default 1.0)
│
├── Action: "TakeDamage" (amount)
│   ├── Condition: NOT Object.IsInvincible
│   │   ├── Subtract amount from currentHealth
│   │   ├── Start timer "invincible" for invincibleDuration seconds
│   │   └── Trigger condition "OnDamaged"
│
├── Condition: "IsDead" → currentHealth ≤ 0
├── Condition: "OnDamaged" (trigger once)
```

Attach this behavior to Player, Enemy, Boss — any object gets a full health system.

---

## Scenes and Layers

### Scene Structure

A Scene contains:

- **Objects** placed at specific positions
- **Layers** stacked front-to-back
- **An event sheet** with the scene's logic
- **Scene variables** (scoped to the scene)

### Layer Stack

```
Layer: "UI"          (Camera: fixed, no parallax)
Layer: "Foreground"  (Camera: follows player)
Layer: "Objects"     (Camera: follows player — main game layer)
Layer: "Background"  (Camera: 50% parallax — slow scroll)
```

Layers control draw order, parallax, and lighting. Effects (shaders) can be applied per-layer.

### Scene Transitions

```
Action: Change to scene "Level2"
Action: Change to scene "Level2" (with pause on current scene)
```

When changing scenes, all objects and scene variables are reset. Use global variables or the Storage action to persist data.

---

## Extensions

Extensions are GDevelop's modular packaging system for reusable logic.

### Extension Contents

An extension can contain any combination of:

- **Custom Actions** — new actions usable in any event sheet
- **Custom Conditions** — new conditions to check
- **Custom Expressions** — new value expressions (e.g., `MyExtension::CalculateScore(x)`)
- **Custom Behaviors** — attachable behaviors built with events
- **Custom Objects** — prefab-like reusable object templates

### Community Extension Library

GDevelop ships with 100+ community-reviewed extensions installable in one click:

- **Flash** — blink an object on/off
- **Shake Object** — screen/camera shake
- **Fire Bullet** — spawn projectiles in patterns
- **Smooth Camera** — follow target with easing
- **Curved Movement** — Bézier curve motion
- **Multitouch Joystick** — virtual gamepad for mobile

### Publishing Extensions

Custom extensions can be submitted to the community library directly from the GDevelop editor, reviewed by maintainers, and made available to all users.

---

## Export Pipeline

| Target | Method | Notes |
|--------|--------|-------|
| **Web (HTML5)** | Direct export | Fastest, best compatibility |
| **Windows/Mac/Linux** | Electron wrapper | Auto-packaged from editor |
| **Android** | One-click cloud build | No Android Studio required |
| **iOS** | Cloud build + Xcode | Needs Apple Developer account for signing |
| **gd.games** | Instant publish | GDevelop's hosting platform — share via link |

**Key decision:** Start with web (HTML5) for testing. Use gd.games for instant playtesting with others. Export native builds for final distribution.

---

## When to Choose GDevelop

| Strength | Detail |
|----------|--------|
| **Zero code barrier** | Event system is complete — no scripting needed for most games |
| **Free and open-source** | Core engine is free; optional subscription for cloud builds |
| **Education** | 10,000+ students in schools/universities; age-appropriate tooling |
| **Rapid mobile export** | One-click Android builds, instant web sharing via gd.games |
| **Extension ecosystem** | 100+ community extensions, easy to create and share |

| Weakness | Detail |
|----------|--------|
| **Performance ceiling** | PixiJS renderer can't match native engines for GPU-intensive games |
| **3D is early** | 3D support is experimental — use Godot/Unity for serious 3D projects |
| **Complex logic** | Very large event sheets become hard to navigate; no visual scripting graph |
| **Limited multiplayer** | Lobby system is new; no built-in authoritative server |
