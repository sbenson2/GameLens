# G18 — Common Game Patterns

> **Category:** guide · **Engine:** Love2D · **Related:** [G1 Game Loop & Callbacks](G1_game_loop_and_callbacks.md) · [G3 Physics & Box2D](G3_physics_and_box2d.md) · [G5 Input Handling](G5_input_handling.md) · [R2 Common Libraries](../reference/R2_common_libraries.md)

---

## Overview

LÖVE is a minimal framework — it gives you a game loop, rendering, and input, but doesn't prescribe how to structure a platformer, a top-down RPG, or a shoot-'em-up. This guide covers proven patterns for the most common 2D genres, focusing on collision detection with **bump.lua** (AABB) and physics with **love.physics** (Box2D), plus genre-specific architecture.

---

## Collision Detection: bump.lua vs Box2D

Before diving into genres, choose your collision approach:

| Approach | Best For | Trade-off |
|----------|----------|-----------|
| **bump.lua** | Platformers, top-down RPGs, tile-based games | Simple AABB only, no rotation or joints |
| **love.physics (Box2D)** | Physics puzzlers, Angry Birds-style, anything needing rotation/joints | Heavier, harder to get tight platformer feel |
| **Manual AABB** | Tiny jams, learning projects | You handle everything yourself |

### bump.lua Setup

```lua
local bump = require "lib.bump"

function love.load()
    world = bump.newWorld(64)  -- 64 = cell size for spatial hash

    -- Add player
    player = { x = 100, y = 100, w = 16, h = 24, vx = 0, vy = 0 }
    world:add(player, player.x, player.y, player.w, player.h)

    -- Add a wall
    local wall = { x = 0, y = 200, w = 400, h = 16, type = "solid" }
    world:add(wall, wall.x, wall.y, wall.w, wall.h)
end
```

bump.lua's `world:move()` returns the actual position after resolving collisions, plus a list of collisions that occurred:

```lua
local actualX, actualY, cols, len = world:move(player, goalX, goalY)
player.x, player.y = actualX, actualY
```

---

## Pattern 1: Platformer

The most common LÖVE game type. The key challenge is making movement feel responsive.

### Gravity and Jump

```lua
local GRAVITY    = 800
local JUMP_FORCE = -350
local MOVE_SPEED = 200
local MAX_FALL   = 600

function updatePlayer(dt)
    -- Horizontal input
    local dx = 0
    if love.keyboard.isDown("left")  then dx = dx - MOVE_SPEED end
    if love.keyboard.isDown("right") then dx = dx + MOVE_SPEED end
    player.vx = dx

    -- Apply gravity
    player.vy = math.min(player.vy + GRAVITY * dt, MAX_FALL)

    -- Resolve movement with bump.lua
    local goalX = player.x + player.vx * dt
    local goalY = player.y + player.vy * dt

    local actualX, actualY, cols, len = world:move(player, goalX, goalY, platformerFilter)
    player.x, player.y = actualX, actualY

    -- Check collisions for grounding
    player.onGround = false
    for i = 1, len do
        local col = cols[i]
        if col.normal.y == -1 then  -- Hit something below
            player.onGround = true
            player.vy = 0
        elseif col.normal.y == 1 then  -- Hit ceiling
            player.vy = 0
        end
    end
end
```

### Collision Filter for One-Way Platforms

bump.lua uses filter functions to control collision responses:

```lua
function platformerFilter(item, other)
    local otype = other.type
    if otype == "solid" then
        return "slide"        -- Stop and slide along surface
    elseif otype == "platform" then
        -- One-way platform: only collide when falling onto it
        local _, playerBottom = world:getRect(item)
        local _, platTop = world:getRect(other)
        -- item y + item h <= other y means player's feet are above platform
        if item.y + item.h <= other.y then
            return "slide"
        end
        return nil             -- Pass through
    elseif otype == "coin" then
        return "cross"         -- Detect overlap, don't stop movement
    end
    return "slide"
end
```

### Jump Buffering and Coyote Time

These two patterns make platformers feel polished:

```lua
local COYOTE_TIME   = 0.08  -- seconds after leaving ground you can still jump
local JUMP_BUFFER   = 0.1   -- seconds before landing a jump press is remembered

local coyoteTimer   = 0
local jumpBufferTimer = 0

function love.update(dt)
    -- Track coyote time
    if player.onGround then
        coyoteTimer = COYOTE_TIME
    else
        coyoteTimer = coyoteTimer - dt
    end

    -- Tick jump buffer
    jumpBufferTimer = jumpBufferTimer - dt

    -- Execute jump if conditions met
    if jumpBufferTimer > 0 and coyoteTimer > 0 then
        player.vy = JUMP_FORCE
        jumpBufferTimer = 0
        coyoteTimer = 0
    end

    updatePlayer(dt)
end

function love.keypressed(key)
    if key == "space" or key == "up" then
        jumpBufferTimer = JUMP_BUFFER
    end
end
```

---

## Pattern 2: Top-Down RPG / Action

Top-down games (Zelda-style, twin-stick shooters) share a common movement pattern but skip gravity.

### Eight-Direction Movement with Diagonal Normalization

```lua
local MOVE_SPEED = 150

function updatePlayer(dt)
    local dx, dy = 0, 0
    if love.keyboard.isDown("w") or love.keyboard.isDown("up")    then dy = dy - 1 end
    if love.keyboard.isDown("s") or love.keyboard.isDown("down")  then dy = dy + 1 end
    if love.keyboard.isDown("a") or love.keyboard.isDown("left")  then dx = dx - 1 end
    if love.keyboard.isDown("d") or love.keyboard.isDown("right") then dx = dx + 1 end

    -- Normalize so diagonal isn't faster
    if dx ~= 0 and dy ~= 0 then
        local len = math.sqrt(dx * dx + dy * dy)
        dx, dy = dx / len, dy / len
    end

    -- Track facing direction for animation
    if dx ~= 0 or dy ~= 0 then
        player.facing = { x = dx, y = dy }
    end

    local goalX = player.x + dx * MOVE_SPEED * dt
    local goalY = player.y + dy * MOVE_SPEED * dt

    local actualX, actualY = world:move(player, goalX, goalY)
    player.x, player.y = actualX, actualY
end
```

### Interaction Zones

For NPCs, chests, and doors, use bump.lua's `world:queryRect` or add invisible trigger areas:

```lua
-- Add an interaction zone in front of player
function getInteractionRect()
    local ix, iy = player.x, player.y
    local f = player.facing
    ix = ix + f.x * player.w
    iy = iy + f.y * player.h
    return ix, iy, player.w, player.h
end

function love.keypressed(key)
    if key == "e" then
        local ix, iy, iw, ih = getInteractionRect()
        local items, len = world:queryRect(ix, iy, iw, ih)
        for i = 1, len do
            if items[i].onInteract then
                items[i]:onInteract(player)
            end
        end
    end
end
```

---

## Pattern 3: Shoot-'Em-Up / Bullet Patterns

Shmups need efficient bullet management because hundreds of projectiles exist simultaneously.

### Object Pool for Bullets

Avoid creating and garbage-collecting tables every frame:

```lua
local MAX_BULLETS = 500
local bulletPool = {}
local activeBullets = 0

function initBulletPool()
    for i = 1, MAX_BULLETS do
        bulletPool[i] = { active = false, x = 0, y = 0, vx = 0, vy = 0, w = 4, h = 4 }
    end
end

function spawnBullet(x, y, vx, vy)
    for i = 1, MAX_BULLETS do
        local b = bulletPool[i]
        if not b.active then
            b.active = true
            b.x, b.y = x, y
            b.vx, b.vy = vx, vy
            activeBullets = activeBullets + 1
            return b
        end
    end
    return nil  -- Pool exhausted
end

function updateBullets(dt)
    local sw, sh = love.graphics.getDimensions()
    for i = 1, MAX_BULLETS do
        local b = bulletPool[i]
        if b.active then
            b.x = b.x + b.vx * dt
            b.y = b.y + b.vy * dt
            -- Deactivate if off-screen
            if b.x < -20 or b.x > sw + 20 or b.y < -20 or b.y > sh + 20 then
                b.active = false
                activeBullets = activeBullets - 1
            end
        end
    end
end
```

### SpriteBatch for Bullet Rendering

Drawing hundreds of sprites individually is slow. Use a SpriteBatch:

```lua
local bulletImage
local bulletBatch

function love.load()
    bulletImage = love.graphics.newImage("bullet.png")
    bulletBatch = love.graphics.newSpriteBatch(bulletImage, MAX_BULLETS)
end

function drawBullets()
    bulletBatch:clear()
    for i = 1, MAX_BULLETS do
        local b = bulletPool[i]
        if b.active then
            bulletBatch:add(b.x, b.y)
        end
    end
    love.graphics.draw(bulletBatch)
end
```

---

## Pattern 4: Tile-Based Games

Puzzle games (Sokoban, match-3) and roguelikes use discrete grid movement.

### Grid Movement with Tweened Animation

```lua
local TILE_SIZE = 32
local MOVE_TIME = 0.15  -- seconds to animate one tile

local player = {
    gx = 3, gy = 3,             -- Grid position (logical)
    x = 3 * TILE_SIZE,          -- Pixel position (visual)
    y = 3 * TILE_SIZE,
    moving = false,
    moveTimer = 0,
    startX = 0, startY = 0,
    targetX = 0, targetY = 0,
}

function tryMove(dgx, dgy)
    if player.moving then return end
    local newGX = player.gx + dgx
    local newGY = player.gy + dgy
    -- Check grid-based collision
    if not isWall(newGX, newGY) then
        player.gx, player.gy = newGX, newGY
        player.moving = true
        player.moveTimer = 0
        player.startX, player.startY = player.x, player.y
        player.targetX = newGX * TILE_SIZE
        player.targetY = newGY * TILE_SIZE
    end
end

function love.update(dt)
    if player.moving then
        player.moveTimer = player.moveTimer + dt
        local t = math.min(player.moveTimer / MOVE_TIME, 1)
        -- Smooth step interpolation
        t = t * t * (3 - 2 * t)
        player.x = player.startX + (player.targetX - player.startX) * t
        player.y = player.startY + (player.targetY - player.startY) * t
        if t >= 1 then
            player.moving = false
        end
    end
end
```

---

## Putting It Together: Minimal Platformer

Here's a complete, runnable `main.lua` that combines the patterns above:

```lua
local bump = require "lib.bump"

local world
local player
local tiles = {}

local GRAVITY    = 800
local JUMP_FORCE = -340
local MOVE_SPEED = 180

function love.load()
    love.graphics.setDefaultFilter("nearest", "nearest")
    world = bump.newWorld(32)

    player = { x = 64, y = 64, w = 14, h = 24, vx = 0, vy = 0, onGround = false }
    world:add(player, player.x, player.y, player.w, player.h)

    -- Create a floor and some platforms
    local level = {
        { 0,   224, 400, 16, "solid" },
        { 100, 176, 64,  16, "solid" },
        { 220, 140, 80,  16, "platform" },
    }
    for _, t in ipairs(level) do
        local tile = { x = t[1], y = t[2], w = t[3], h = t[4], type = t[5] }
        table.insert(tiles, tile)
        world:add(tile, tile.x, tile.y, tile.w, tile.h)
    end
end

local function filter(item, other)
    if other.type == "platform" then
        if item.y + item.h <= other.y then return "slide" end
        return nil
    end
    return "slide"
end

function love.update(dt)
    local dx = 0
    if love.keyboard.isDown("left")  then dx = -MOVE_SPEED end
    if love.keyboard.isDown("right") then dx =  MOVE_SPEED end
    player.vx = dx
    player.vy = math.min(player.vy + GRAVITY * dt, 600)

    local gx = player.x + player.vx * dt
    local gy = player.y + player.vy * dt
    local ax, ay, cols, len = world:move(player, gx, gy, filter)
    player.x, player.y = ax, ay

    player.onGround = false
    for i = 1, len do
        if cols[i].normal.y == -1 then
            player.onGround = true
            player.vy = 0
        elseif cols[i].normal.y == 1 then
            player.vy = 0
        end
    end
end

function love.keypressed(key)
    if key == "space" and player.onGround then
        player.vy = JUMP_FORCE
    end
    if key == "escape" then love.event.quit() end
end

function love.draw()
    -- Draw tiles
    love.graphics.setColor(0.5, 0.5, 0.5)
    for _, t in ipairs(tiles) do
        love.graphics.rectangle("fill", t.x, t.y, t.w, t.h)
    end
    -- Draw player
    love.graphics.setColor(0.2, 0.7, 1.0)
    love.graphics.rectangle("fill", player.x, player.y, player.w, player.h)
    -- HUD
    love.graphics.setColor(1, 1, 1)
    love.graphics.print("Arrow keys + Space", 4, 4)
end
```

---

## Common Pitfalls

**Diagonal speed boost** — Moving diagonally without normalizing the direction vector makes the player ~41% faster. Always normalize when two axes are active.

**Tunneling at high speeds** — If `velocity * dt` exceeds a wall's thickness, the player can skip through it. bump.lua handles this via swept AABB, but manual collision checks need substeps or raycasts.

**Forgetting `love.graphics.setColor(1,1,1)`** — setColor is global state. If you set it to red for an enemy and forget to reset it, everything after draws red. Reset to white before drawing sprites.

**Box2D for platformers** — Box2D is a physics *simulation*, not a game-feel library. Getting tight, responsive platformer movement out of Box2D requires fighting the engine (disabling friction, clamping velocities, managing ground detection). Use bump.lua instead unless you specifically need physics joints or rotation.

---

## Libraries by Genre

| Genre | Recommended Libraries |
|-------|----------------------|
| Platformer | bump.lua, anim8, sti (Tiled maps) |
| Top-Down RPG | bump.lua, anim8, sti, knife (utility) |
| Shmup | love.physics (optional), flux (tweening) |
| Puzzle / Roguelike | rotLove (roguelike toolkit), bump.lua |
| Visual Novel | Narrator (dialogue), ltui |
| Physics Sandbox | love.physics (Box2D), HC (polygon collision) |
