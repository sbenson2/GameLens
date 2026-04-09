# G7 — Scene Management & ECS Patterns

> **Category:** guide · **Engine:** Love2D · **Related:** [G1 Game Loop & Callbacks](G1_game_loop_and_callbacks.md) · [E1 Architecture Overview](../architecture/E1_architecture_overview.md)

---

## Why You Need Patterns

LÖVE gives you callbacks (`love.load`, `love.update`, `love.draw`) and nothing else. There is no built-in scene manager, no entity system, no UI framework. That minimalism is the point — but every non-trivial game needs to organize code into screens (menu → gameplay → pause → game-over) and manage large numbers of game entities efficiently.

This guide covers the two most common architectural patterns the Love2D community has settled on: **game-state machines** for scene flow and **Entity-Component-System (ECS)** for gameplay logic.

---

## Part 1 — Game-State / Scene Management

### The Core Idea

A "game state" is a table that implements the same callbacks as LÖVE (`update(dt)`, `draw()`, `keypressed(key)`, etc.). A manager routes LÖVE's callbacks to whichever state is currently active.

### Pattern A — Manual State Table (No Library)

The simplest approach. Good for jams and small projects.

```lua
-- states/menu.lua
local menu = {}

function menu:enter()
    self.title = "My Game"
end

function menu:update(dt)
    -- animate title, etc.
end

function menu:draw()
    love.graphics.printf(self.title, 0, 200, love.graphics.getWidth(), "center")
end

function menu:keypressed(key)
    if key == "return" then
        switchState(require("states.game"))
    end
end

return menu
```

```lua
-- main.lua
local current

function switchState(state, ...)
    if current and current.leave then current:leave() end
    current = state
    if current.enter then current:enter(...) end
end

function love.load()
    switchState(require("states.menu"))
end

function love.update(dt)
    if current.update then current:update(dt) end
end

function love.draw()
    if current.draw then current:draw() end
end

function love.keypressed(key)
    if current.keypressed then current:keypressed(key) end
end
```

**Limitation:** No state stacking. A pause screen would have to re-create the gameplay state when unpaused.

### Pattern B — State Stack

A stack lets you **push** a pause or dialog state on top of gameplay, then **pop** it to resume exactly where you left off.

```lua
-- statestack.lua
local stack = {}

function stack.push(state, ...)
    stack[#stack + 1] = state
    if state.enter then state:enter(...) end
end

function stack.pop()
    local top = stack[#stack]
    if top and top.leave then top:leave() end
    stack[#stack] = nil
end

function stack.top()
    return stack[#stack]
end

function stack.update(dt)
    local s = stack.top()
    if s and s.update then s:update(dt) end
end

function stack.draw()
    -- Draw all states bottom-to-top so pause overlays gameplay
    for _, s in ipairs(stack) do
        if s.draw then s:draw() end
    end
end

return stack
```

### Pattern C — hump.gamestate (Popular Library)

[hump](https://github.com/vrld/hump) is the most widely used utility collection in the Love2D ecosystem. Its `Gamestate` module provides:

| Function | Behavior |
|----------|----------|
| `Gamestate.switch(state, ...)` | Leave current → init (first time only) → enter new state |
| `Gamestate.push(state, ...)` | Pause current, enter new state on top of stack |
| `Gamestate.pop()` | Leave top state, resume previous state |
| `Gamestate.current()` | Return the active state table |
| `Gamestate.registerEvents()` | Auto-route all LÖVE callbacks to the current state |

```lua
-- main.lua (using hump)
local Gamestate = require("hump.gamestate")
local menu = require("states.menu")

function love.load()
    Gamestate.registerEvents()   -- hooks love.update, love.draw, etc.
    Gamestate.switch(menu)
end
```

**State lifecycle callbacks:** `init()` (once, first switch), `enter(previous, ...)`, `leave()`, `resume()` (after a pop returns to this state), `update(dt)`, `draw()`, plus all standard LÖVE callbacks.

### Which Pattern to Choose

| Situation | Recommendation |
|-----------|---------------|
| Game jam, < 5 states | Manual state table (Pattern A) |
| Need pause/dialog overlays | State stack (Pattern B or hump) |
| Large project, many states | hump.gamestate or roomy |

---

## Part 2 — Entity-Component-System (ECS)

### Why ECS in Love2D?

LÖVE has no built-in entity model. As your game grows, you'll face the classic problem: your `Player` table has 500 lines, your `Enemy` duplicates half of it, and adding a new behavior (e.g., "burnable") means editing every entity type.

ECS solves this by separating **data** (components) from **logic** (systems) and attaching components to generic **entities**.

### Core Concepts

| Concept | What It Is | Love2D Example |
|---------|-----------|----------------|
| **Entity** | An ID (number or table) | `local e = world:entity()` |
| **Component** | A plain data table | `{ x = 0, y = 0 }` (position) |
| **System** | A function that processes entities with specific components | "Move all entities that have `position` + `velocity`" |

### Popular ECS Libraries

**tiny-ecs** — Minimal, fast, battle-tested. Processes entities by filtering on component presence.

```lua
local tiny = require("tiny")

-- Components are just tables attached to entities
local function Position(x, y) return { x = x, y = y } end
local function Velocity(dx, dy) return { dx = dx, dy = dy } end

-- A system that processes entities with both Position and Velocity
local moveSystem = tiny.processingSystem()
moveSystem.filter = tiny.requireAll("x", "y", "dx", "dy")

function moveSystem:process(e, dt)
    e.x = e.x + e.dx * dt
    e.y = e.y + e.dy * dt
end

-- World setup
local world = tiny.world(moveSystem)

-- Create an entity (just a table with component fields)
local player = { x = 100, y = 200, dx = 50, dy = 0 }
world:addEntity(player)

-- In love.update:
function love.update(dt)
    world:update(dt)
end
```

**Concord** — More structured. Components and systems are first-class objects with explicit declarations.

```lua
local Concord = require("concord")

local Position = Concord.component("position", function(c, x, y)
    c.x = x or 0
    c.y = y or 0
end)

local Velocity = Concord.component("velocity", function(c, dx, dy)
    c.dx = dx or 0
    c.dy = dy or 0
end)

local MoveSystem = Concord.system({ pool = {"position", "velocity"} })

function MoveSystem:update(dt)
    for _, e in ipairs(self.pool) do
        e.position.x = e.position.x + e.velocity.dx * dt
        e.position.y = e.position.y + e.velocity.dy * dt
    end
end
```

### ECS + Game States

A common architecture combines both patterns:

```
main.lua
├── Gamestate manager (hump or manual)
├── states/
│   ├── menu.lua          (no ECS needed — simple UI)
│   ├── gameplay.lua       (owns a tiny-ecs World)
│   │   └── world contains: player, enemies, bullets...
│   └── pause.lua          (pushed on top, pops to resume)
```

Each game state creates and owns its own ECS world. When you switch states, the old world is garbage-collected (or kept alive if you want to return to it).

### Tips

- **Don't over-engineer early.** A flat list of entity tables with `for` loops is fine until you have 50+ entity types or performance matters.
- **tiny-ecs filters by key presence.** Name your component keys carefully — `{ x=0, y=0, hp=100 }` means tiny-ecs filters on `"x"`, `"y"`, `"hp"` as strings.
- **Concord namespaces components.** `e.position.x` vs tiny-ecs `e.x`. Concord is cleaner for large projects but more boilerplate for jams.
- **Draw order:** Create a separate draw system with a sort step (sort entities by `y` or `z` before rendering).
- **Prefer composition.** Instead of an `EnemyType` field, give enemies the same components as the player plus an `AI` component. Systems don't care who owns the component.

---

## Related Libraries

| Library | Purpose | Link |
|---------|---------|------|
| hump | Gamestate, Timer, Vector, Camera | [github.com/vrld/hump](https://github.com/vrld/hump) |
| tiny-ecs | Minimal ECS | [github.com/bakpakin/tiny-ecs](https://github.com/bakpakin/tiny-ecs) |
| Concord | Feature-rich ECS | [github.com/Tjakka5/Concord](https://github.com/Tjakka5/Concord) |
| roomy | Lightweight state manager | [github.com/tesselode/roomy](https://github.com/tesselode/roomy) |
| Lovetoys | ECS framework (Lua-generic) | [github.com/lovetoys/lovetoys](https://github.com/lovetoys/lovetoys) |

---

*Love2D is deliberately minimal — these patterns fill the gaps the engine intentionally leaves open. Pick the simplest approach that fits your project scope.*
