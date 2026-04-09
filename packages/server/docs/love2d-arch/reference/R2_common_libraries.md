# Common Libraries & Ecosystem

> **Category:** reference · **Engine:** Love2D · **Related:** [R1 Module Reference](R1_module_reference.md), [G7 Scene Management & ECS](../guides/G7_scene_management_and_ecs.md), [G11 Cameras & Tilemaps](../guides/G11_cameras_and_tilemaps.md)

LÖVE is intentionally minimal — it provides a solid foundation (rendering, audio, physics, input, filesystem) and leaves higher-level patterns to the community. This reference catalogues the most widely used libraries, organized by problem domain, so you can pick the right tool without reinventing the wheel.

## OOP & Class Systems

| Library | Description | Install |
|---------|-------------|---------|
| **classic** | Tiny single-file class module. Supports inheritance, `__index`-based method lookup, and `extend()` / `is()` helpers. ~100 lines. | `lib/classic.lua` |
| **middleclass** | Slightly larger class library with mixins, class variables, metamethod inheritance, and `instanceOf()` / `subclassOf()` checks. | `lib/middleclass.lua` |
| **30log** | 30-lines-of-goodness class library. Minimal footprint, supports mixins and `init()`. | `lib/30log.lua` |

**When to choose:** Use `classic` for jam-scale projects. Use `middleclass` when you need mixins or class-level variables. Avoid class libraries entirely if the project already uses an ECS — entities are tables, not objects.

```lua
-- classic example
local Object = require("lib.classic")

local Entity = Object:extend()

function Entity:new(x, y)
    self.x = x
    self.y = y
    self.alive = true
end

function Entity:update(dt)
    -- override in subclasses
end

local Player = Entity:extend()

function Player:new(x, y)
    Player.super.new(self, x, y)
    self.speed = 200
end

function Player:update(dt)
    if love.keyboard.isDown("right") then
        self.x = self.x + self.speed * dt
    end
end
```

## Entity Component Systems

| Library | Description | Install |
|---------|-------------|---------|
| **tiny-ecs** | Lightweight ECS. Entities are plain tables, systems filter by required component keys. ~500 lines. | `lib/tiny.lua` |
| **concord** | Full-featured ECS with worlds, components, systems, and assemblages (entity templates). Well-documented. | `lib/concord/` |
| **nata** | Pool-based entity manager — simpler than ECS, good for games that just need spawn/update/draw/destroy. | `lib/nata.lua` |

**When to choose:** Use `tiny-ecs` for small-to-medium games that want composition without ceremony. Use `concord` for larger projects that benefit from strict component definitions and assemblages. Use `nata` when ECS is overkill but you want managed entity pools.

```lua
-- tiny-ecs example
local tiny = require("lib.tiny")

local world = tiny.world()

-- A system that processes entities with x, y, and speed
local moveSystem = tiny.processingSystem()
moveSystem.filter = tiny.requireAll("x", "y", "speed")

function moveSystem:process(entity, dt)
    entity.x = entity.x + entity.speed * dt
end

world:addSystem(moveSystem)
world:addEntity({ x = 0, y = 0, speed = 100 })
```

## Utility Collections

| Library | Description | Install |
|---------|-------------|---------|
| **hump** | Swiss-army toolkit: `hump.gamestate` (state machine), `hump.timer` (tweens/delays), `hump.camera` (transform + shake), `hump.vector` (2D vectors), `hump.class`. Each module is independent. | `lib/hump/` |
| **lume** | Collection of useful functions: `lume.clamp`, `lume.lerp`, `lume.randomchoice`, `lume.serialize`, `lume.hotswap` (live reload), deep copy, UUID generation. | `lib/lume.lua` |
| **knife** | Micro-module collection: class, state machines, bind, chain, coroutines, events, memoize, entity management, timer. Each module < 200 lines. | `lib/knife/` |

**When to choose:** `hump` is the community standard — reach for it first, especially `hump.gamestate` and `hump.timer`. `lume` supplements with utility functions `hump` doesn't cover. `knife` is an alternative when you want even smaller modules.

```lua
-- hump.timer: delay + tween
local Timer = require("lib.hump.timer")

-- Call a function after 2 seconds
Timer.after(2, function() print("delayed!") end)

-- Tween a table's values over 1 second
local obj = { x = 0, alpha = 0 }
Timer.tween(1, obj, { x = 200, alpha = 1 }, "out-quad")

-- Must call in love.update:
function love.update(dt)
    Timer.update(dt)
end
```

## Collision Detection

| Library | Description | Install |
|---------|-------------|---------|
| **bump.lua** | AABB spatial hash collision library. Returns collision normals, slide/bounce/cross responses. No physics simulation — just detection + resolution. | `lib/bump.lua` |
| **windfield** | Physics wrapper around `love.physics` (Box2D). Simplifies body/fixture creation, collision classes, and queries. | `lib/windfield/` |
| **breezefield** | Lightweight `love.physics` wrapper — alternative to windfield with a smaller API surface. | `lib/breezefield/` |
| **HC** | General-purpose collision detection for arbitrary convex shapes and circles. Uses spatial hashing. | `lib/HC/` |

**When to choose:** Use `bump.lua` for tile-based or platformer games where you want pixel-perfect AABB collisions without physics simulation. Use `windfield` or `breezefield` when you need real physics (gravity, joints, forces) but want a friendlier API than raw `love.physics`. Use `HC` when you need non-AABB shape collision (rotated rectangles, polygons).

```lua
-- bump.lua example
local bump = require("lib.bump")

local world = bump.newWorld(64) -- cell size 64

-- Add a player and some walls
world:add("player", 100, 100, 32, 32)
world:add("wall",   0,   300, 800, 32)

-- Move with collision resolution
local goalX, goalY = 100 + dx, 100 + dy
local actualX, actualY, cols, len = world:move("player", goalX, goalY)
-- actualX/actualY are the resolved position after collisions
-- cols contains collision info (normal, touch point, other item)
```

## Tilemaps

| Library | Description | Install |
|---------|-------------|---------|
| **STI (Simple Tiled Implementation)** | Full Tiled editor map loader. Supports orthogonal, isometric, staggered, and hexagonal maps. Integrates with `bump.lua` and `love.physics` for collision layers. | `lib/sti/` |
| **cartographer** | Minimal Tiled map loader focused on orthogonal maps. Smaller than STI. | `lib/cartographer.lua` |

**When to choose:** Use STI for any project using the Tiled map editor — it handles all map types and has collision layer integration. Use `cartographer` if you want something lighter and only need orthogonal maps.

```lua
-- STI with bump.lua collision
local sti = require("lib.sti")

local map, bumpWorld

function love.load()
    bumpWorld = bump.newWorld(64)
    map = sti("assets/maps/level1.lua", { "bump" })
    map:bump_init(bumpWorld)
end

function love.update(dt)
    map:update(dt)
end

function love.draw()
    map:draw()
end
```

## UI Libraries

| Library | Description | Install |
|---------|-------------|---------|
| **Slab** | Immediate-mode GUI inspired by Dear ImGui. Windows, buttons, text input, sliders, trees, menus, tooltips, color pickers. Best for debug tools and editor UIs. | `lib/Slab/` |
| **SUIT** | Minimal immediate-mode UI. Buttons, sliders, checkboxes, text input. ~600 lines. | `lib/suit/` |
| **Gooey** | Retained-mode UI with buttons, lists, input fields, and theming. | `lib/gooey/` |

**When to choose:** Use `Slab` for debug/editor overlays — it has the richest widget set. Use `SUIT` for simple in-game menus where you want immediate-mode simplicity. Use `Gooey` if you prefer retained mode and need scrollable lists.

## Animation

| Library | Description | Install |
|---------|-------------|---------|
| **anim8** | Spritesheet animation. Define grids, create animations with frame sequences, durations, and playback modes (loop, once, bounce). | `lib/anim8.lua` |
| **peachy** | Aseprite JSON animation loader. Parses exported Aseprite data and plays tagged animations. | `lib/peachy.lua` |

```lua
-- anim8 example
local anim8 = require("lib.anim8")

local spritesheet, grid, animation

function love.load()
    spritesheet = love.graphics.newImage("player.png")
    grid = anim8.newGrid(32, 32, spritesheet:getWidth(), spritesheet:getHeight())
    animation = anim8.newAnimation(grid("1-4", 1), 0.15)  -- frames 1-4, row 1
end

function love.update(dt)
    animation:update(dt)
end

function love.draw()
    animation:draw(spritesheet, player.x, player.y)
end
```

## Camera & Resolution

| Library | Description | Install |
|---------|-------------|---------|
| **hump.camera** | Part of hump. Transform-based camera with smooth follow, rotation, zoom, and shake. | `lib/hump/camera.lua` |
| **push** | Resolution-independent rendering. Renders to a fixed virtual resolution and scales to the window. Handles letterboxing. | `lib/push.lua` |
| **gamera** | Camera with world bounds, zoom, and deadzone following. Clips drawing to the visible area. | `lib/gamera.lua` |

**When to choose:** Combine `push` (for resolution independence) with `hump.camera` or `gamera` (for world scrolling). Use `gamera` over `hump.camera` if you need built-in world bounds clamping.

## Networking

| Library | Description | Install |
|---------|-------------|---------|
| **lua-enet** | Binding to ENet (reliable UDP). Bundled with LÖVE as `enet`. Peer-to-peer or client-server. | Built-in: `require("enet")` |
| **sock** | Higher-level networking built on lua-enet. Adds event callbacks, serialization, and schema validation. | `lib/sock.lua` |
| **LUBE** | Simple UDP/TCP networking abstraction. | `lib/lube.lua` |

## Serialization & Data

| Library | Description | Install |
|---------|-------------|---------|
| **bitser** | Fast binary serializer. Handles nested tables, circular references, custom types. Good for save files and network payloads. | `lib/bitser.lua` |
| **binser** | Similar to bitser — binary serialization with type registration. | `lib/binser.lua` |
| **json.lua** | Lightweight JSON encoder/decoder. Good for config files and web API communication. | `lib/json.lua` |

## Sound & Music

| Library | Description | Install |
|---------|-------------|---------|
| **ripple** | Sound manager with tags, random pitch variation, volume groups, and ducking. Wraps `love.audio`. | `lib/ripple.lua` |
| **SLAM** | Simple audio manager — auto-creates sources, handles streaming vs static, and provides volume control. | `lib/slam.lua` |

## Choosing Libraries: Decision Framework

1. **Start minimal.** Only add a library when LÖVE's built-in modules aren't enough.
2. **Prefer single-file libraries.** They're easier to vendor and have no transitive dependencies.
3. **Check maintenance status.** The Love2D community moves between GitHub repos — verify the library works with your LÖVE version (11.x+).
4. **Don't mix collision libraries.** Pick one approach: `bump.lua` for AABB, `love.physics`/`windfield` for real physics, `HC` for arbitrary shapes. Mixing them creates conflicting collision resolution.
5. **Vendor everything.** Copy libraries into your `lib/` directory rather than using a package manager. LÖVE projects are self-contained — `require("lib.bump")` should just work.

## Community Resources

- **awesome-love2d** — Curated list maintained by the community: `github.com/love2d-community/awesome-love2d`
- **LÖVE Wiki Libraries page** — `love2d.org/wiki/Library`
- **LÖVE Forums** — Active community for questions and library announcements: `love2d.org/forums`
