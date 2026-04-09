# GDevelop — AI Rules

Engine-specific rules for projects using GDevelop (5.x / 6.x). These supplement the engine-agnostic rules in `docs/core/ai-workflow/gamedev-rules.md`.

---

## Architecture Context

### Tech Stack

- **Engine:** GDevelop (open-source, no-code / low-code)
- **Primary Logic:** Event system (conditions → actions, visual programming)
- **Scripting:** JavaScript (optional, via JS events)
- **Renderer:** PixiJS (2D), Three.js (3D experimental)
- **Physics:** Built-in physics behavior (Box2D-based)
- **Platforms:** Windows, macOS, Linux, HTML5, iOS, Android
- **Key Features:**
  - Behaviors (pre-built + custom via events)
  - Extensions (community-created, installable in-editor)
  - Custom Objects / Prefabs (reusable object templates)
  - Tilemap editor (built-in since 2024)
  - Multiplayer lobbies (built-in since 2024)
  - 3D physics behavior (2025+)

### Project Structure Conventions

```
game.json                    # Project manifest
assets/
├── sprites/                 # Image assets
├── audio/                   # Sound effects and music
scenes/
├── MainScene/               # Each scene is a folder
│   ├── layout.json          # Object placement
│   └── events.json          # Scene event sheet
extensions/
├── MyCustomBehavior/        # Custom extensions
```

---

## Event System Rules

### Conditions and Actions — Core Pattern

Every event follows the pattern:

```
IF [condition(s)] THEN [action(s)]
```

- **Conditions** are checked each frame (e.g., "Mouse button is pressed", "Player is in collision with Enemy").
- **Actions** execute when ALL conditions in the event are true.
- Events run top-to-bottom each frame.

### Use Sub-events for Sequential Logic

Sub-events nest under parent events and only execute when the parent's conditions are true:

```
Event: Key "Space" is pressed
├── Sub-event: Player.CanJump = true
│   └── Action: Change Player Y velocity to -600
│   └── Action: Set Player.CanJump to false
```

### Use "For Each" for Per-Instance Operations

```
For Each object Enemy:
├── Condition: Distance between Enemy and Player < 200
│   └── Action: Enemy → Move toward Player at 100 pixels/sec
├── Else
│   └── Action: Enemy → Stop
```

Without "For Each", actions may behave unexpectedly when multiple instances exist.

### Prefer Behaviors Over Manual Event Logic

- **Platformer Character** — gravity, jumping, slopes
- **Platformer Object** — solid platforms, one-way platforms
- **Top-down Movement** — 4/8-direction grid or free movement
- **Physics** — Box2D simulation (2D) or 3D physics
- **Pathfinding** — A* grid navigation
- **Draggable** — mouse/touch drag interaction
- **Tween** — smooth property animations

Only write custom movement when built-in behaviors don't fit.

---

## Variables — Scope Hierarchy

GDevelop has three variable scopes with clear precedence:

| Scope | Lifetime | Use For |
|-------|----------|---------|
| **Object variable** | Per-instance | HP, speed, state, ammo |
| **Scene variable** | Current scene | Score, timer, spawn count |
| **Global variable** | Entire game | High score, settings, player name |

**Rule:** Always use the narrowest scope possible. Object > Scene > Global.

Variables support structures (nested key-value) and arrays:

```
Player.Inventory (structure)
├── "sword" → { damage: 10, equipped: true }
├── "potion" → { count: 3 }
```

---

## Extensions and Custom Functions

### Built-in Extension Library

GDevelop ships with 100+ community extensions installable in one click from the editor:

- Flash (object) — blink effect
- Shake (object) — screen shake
- Fire Bullet — spawn projectile patterns
- Smooth Camera — follow with easing

### Creating Custom Extensions

Extensions package reusable logic as custom actions, conditions, expressions, behaviors, or objects:

```
Extension: "DamageSystem"
├── Action: "ApplyDamage" (Object, Amount)
│   └── Subtract Amount from Object.Health
│   └── Condition: Object.Health ≤ 0 → Trigger "OnDeath"
├── Condition: "IsDead" (Object) → Object.Health ≤ 0
└── Expression: "HealthPercent" (Object) → Object.Health / Object.MaxHealth * 100
```

Extensions can be shared to the community library directly from the editor.

### Custom Behaviors (Event-Based)

Create reusable behaviors without code:

```
Behavior: "Patrol"
├── Properties: speed (number), patrolDistance (number)
├── On created: Set StartX to Object.X
├── Every frame:
│   └── If Object.X > StartX + patrolDistance → flip, move left
│   └── If Object.X < StartX - patrolDistance → flip, move right
```

Attach this behavior to any object and it patrols automatically.

---

## Custom Objects (Prefabs)

Custom Objects bundle sprites, behaviors, and events into a reusable template:

```
Custom Object: "HealthBar"
├── Contains: BackgroundSprite, FillSprite, Text
├── Properties: maxHealth, currentHealth
├── Events: Update fill width based on currentHealth / maxHealth
```

Use Custom Objects for UI elements, enemies, pickups — anything you want to reuse across scenes.

---

## Common Pitfalls

1. **Forgetting "For Each"** — without it, conditions pick the first matching instance, not all of them. Use "For Each" when you need per-instance logic.
2. **Global variable overuse** — scene variables reset between scenes (which is often what you want). Don't make everything global.
3. **Ignoring the extension library** — check the built-in extension library before building custom logic. Common patterns are already solved.
4. **Not structuring events** — use comments, groups, and external event sheets to keep logic organized as the project grows.
5. **Testing only in preview** — exported builds (especially mobile) may have different performance and input behavior. Test early on target.
