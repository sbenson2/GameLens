# G3 — Physics & Box2D

> **Category:** guide · **Engine:** Love2D · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Game Loop & Callbacks](G1_game_loop_and_callbacks.md) · [R1 Module Reference](../reference/R1_module_reference.md)

---

## Overview

LÖVE's `love.physics` module is a binding to Box2D 2.3, giving you rigid-body 2D physics out of the box. The module introduces four core objects — **World**, **Body**, **Shape**, and **Fixture** — that map directly to Box2D concepts.

Physics is opt-in: if your game doesn't need realistic collisions or forces, use simpler libraries like `bump.lua` for AABB checks. But for platformers with slopes, ragdolls, chains, vehicles, or any scenario involving forces and joints, `love.physics` is the right tool.

---

## Core Concepts

### World

The physics world manages simulation. It defines gravity, steps the simulation, and dispatches collision callbacks.

```lua
-- Create a world with gravity pointing downward
-- Units are in meters, not pixels. Set a scale factor.
local METER = 64  -- 64 pixels = 1 meter

function love.load()
    love.physics.setMeter(METER)
    world = love.physics.newWorld(0, 9.81 * METER, true)
    -- Args: gravityX, gravityY, allowSleep
    -- allowSleep = true lets inactive bodies skip simulation (performance win)
end
```

**Step the world exactly once per frame:**
```lua
function love.update(dt)
    world:update(dt)
end
```

### Body

A Body is a point in the physics world with position, velocity, and rotation. It has no shape or size by itself — that comes from attaching fixtures.

There are three body types:

| Type | Moves? | Collides with | Use for |
|------|--------|---------------|---------|
| `"static"` | No | dynamic | Ground, walls, platforms |
| `"dynamic"` | Yes (forces, gravity) | everything | Players, enemies, projectiles |
| `"kinematic"` | Yes (velocity only, no forces) | dynamic only | Moving platforms, elevators |

```lua
-- Create a dynamic body at (400, 300) in pixel space
local body = love.physics.newBody(world, 400 / METER, 300 / METER, "dynamic")

-- Useful Body methods:
body:setLinearVelocity(vx, vy)
body:applyForce(fx, fy)           -- continuous push (use in update)
body:applyLinearImpulse(ix, iy)   -- instant kick (use for jumps)
body:setFixedRotation(true)       -- prevent spinning (useful for player characters)
body:getPosition()                -- returns x, y in world meters
body:setMass(mass)
```

### Shape

Shapes define geometry for collision detection. They have no position — they exist relative to their parent fixture/body.

```lua
-- Common shapes:
local circle = love.physics.newCircleShape(radius)
local rect   = love.physics.newRectangleShape(width, height)
local poly   = love.physics.newPolygonShape(x1,y1, x2,y2, x3,y3, ...)
local edge   = love.physics.newEdgeShape(x1,y1, x2,y2)
local chain  = love.physics.newChainShape(loop, x1,y1, x2,y2, ...)

-- Polygon rules (Box2D constraints):
-- • Max 8 vertices
-- • Must be convex
-- • Vertices must be in clockwise or counter-clockwise order
```

### Fixture

A Fixture glues a Shape to a Body and adds material properties (friction, restitution, density). When you create a fixture, the shape is **copied** — later changes to the shape object won't affect the fixture.

```lua
local fixture = love.physics.newFixture(body, shape, density)
-- density affects mass. Set to 1 for normal, higher for heavier.

fixture:setFriction(0.3)      -- 0 = ice, 1 = rubber
fixture:setRestitution(0.5)   -- 0 = no bounce, 1 = full bounce
fixture:setSensor(true)        -- sensor = detects overlap but doesn't collide physically
fixture:setCategory(2)         -- collision filtering category (1-16)
fixture:setMask(3)             -- categories this fixture ignores
```

---

## Complete Example: Ball on a Platform

```lua
local METER = 64

function love.load()
    love.physics.setMeter(METER)
    world = love.physics.newWorld(0, 9.81 * METER, true)

    -- Ground (static)
    ground = {}
    ground.body = love.physics.newBody(world, 400, 550, "static")
    ground.shape = love.physics.newRectangleShape(800, 20)
    ground.fixture = love.physics.newFixture(ground.body, ground.shape)

    -- Ball (dynamic)
    ball = {}
    ball.body = love.physics.newBody(world, 400, 100, "dynamic")
    ball.shape = love.physics.newCircleShape(20)
    ball.fixture = love.physics.newFixture(ball.body, ball.shape, 1)
    ball.fixture:setRestitution(0.7)  -- bouncy
end

function love.update(dt)
    world:update(dt)
end

function love.draw()
    -- Draw ground
    love.graphics.setColor(0.2, 0.8, 0.2)
    love.graphics.polygon("fill", ground.body:getWorldPoints(
        ground.shape:getPoints()
    ))

    -- Draw ball
    love.graphics.setColor(0.9, 0.2, 0.2)
    local bx, by = ball.body:getPosition()
    love.graphics.circle("fill", bx, by, ball.shape:getRadius())

    love.graphics.setColor(1, 1, 1)
end
```

---

## Collision Callbacks

Box2D dispatches four collision events through the world. Set them up in `love.load()`:

```lua
function love.load()
    -- ... world creation ...
    world:setCallbacks(beginContact, endContact, preSolve, postSolve)
end

function beginContact(a, b, contact)
    -- Called when two fixtures start touching
    -- a, b are Fixture objects
    -- contact is a Contact object with collision normal, points, etc.
end

function endContact(a, b, contact)
    -- Called when two fixtures stop touching
end

function preSolve(a, b, contact)
    -- Called before the collision response is calculated
    -- You can disable the contact here: contact:setEnabled(false)
    -- Useful for one-way platforms
end

function postSolve(a, b, contact, normalImpulse, tangentImpulse)
    -- Called after the collision response
    -- Use impulse values for damage calculation
end
```

### Identifying Colliders

Use `fixture:getUserData()` to tag fixtures so you can identify them in callbacks:

```lua
-- During setup:
player_fixture:setUserData("player")
spike_fixture:setUserData("spike")

-- In callback:
function beginContact(a, b, contact)
    local udA = a:getUserData()
    local udB = b:getUserData()

    if (udA == "player" and udB == "spike") or
       (udA == "spike" and udB == "player") then
        -- Player hit spikes!
        player_hit = true
    end
end
```

---

## Sensors

Sensors detect overlap without generating a physical collision response. Perfect for trigger zones, pickups, and area detection.

```lua
local trigger = love.physics.newFixture(trigger_body, trigger_shape)
trigger:setSensor(true)
trigger:setUserData("coin_pickup")

-- Sensors still fire beginContact / endContact callbacks,
-- but preSolve and postSolve are NOT called.
```

---

## Joints

Joints constrain how two bodies move relative to each other. LÖVE supports all Box2D joint types:

| Joint | Purpose | Example use |
|-------|---------|-------------|
| `RevoluteJoint` | Hinge — rotation around a shared point | Doors, wheels, flails |
| `PrismaticJoint` | Slider — movement along one axis | Elevators, pistons |
| `DistanceJoint` | Spring — maintains distance between two points | Suspension bridges |
| `PulleyJoint` | Pulley — one goes up, the other goes down | Counterweight puzzles |
| `MouseJoint` | Drag — pulls a body toward a target point | Click-and-drag interaction |
| `WeldJoint` | Glue — locks two bodies together | Breakable objects |
| `WheelJoint` | Suspension + motor | Vehicle wheels |
| `RopeJoint` | Max distance constraint (no spring) | Grappling hooks |
| `FrictionJoint` | Applies friction between bodies | Top-down movement damping |
| `MotorJoint` | Applies force/torque to reach a target offset | Soft constraints |
| `GearJoint` | Links two revolute/prismatic joints | Gears, mechanical linkages |

```lua
-- Revolute joint example: attach a wheel to a car body
local joint = love.physics.newRevoluteJoint(
    car_body, wheel_body,
    anchor_x, anchor_y,   -- shared anchor point in world coords
    false                  -- collideConnected
)
joint:setMotorEnabled(true)
joint:setMotorSpeed(10)      -- radians/second
joint:setMaxMotorTorque(400)

-- Wheel joint example: car suspension
local wj = love.physics.newWheelJoint(
    car_body, wheel_body,
    wheel_x, wheel_y,     -- anchor
    0, 1                   -- suspension axis (vertical)
)
wj:setSpringFrequency(4)    -- Hz
wj:setSpringDampingRatio(0.7)
```

---

## Collision Filtering

Box2D uses **categories** (1–16) and **masks** to control which fixtures collide:

```lua
-- Category constants (powers of 2)
local CAT_PLAYER    = 1
local CAT_ENEMY     = 2
local CAT_BULLET    = 4
local CAT_PLATFORM  = 8

-- Player collides with enemies and platforms, not own bullets
player_fixture:setCategory(CAT_PLAYER)
player_fixture:setMask(CAT_BULLET)  -- ignore bullets

-- Bullets collide with enemies only
bullet_fixture:setCategory(CAT_BULLET)
bullet_fixture:setMask(CAT_PLAYER, CAT_BULLET, CAT_PLATFORM)
```

**Group index** is simpler for small cases: positive = always collide, negative = never collide, between fixtures sharing the same group index.

---

## One-Way Platforms

A classic pattern using `preSolve`:

```lua
function preSolve(a, b, contact)
    -- Determine which is the platform
    local platFixture, otherBody
    if a:getUserData() == "one_way_platform" then
        platFixture = a
        otherBody = b:getBody()
    elseif b:getUserData() == "one_way_platform" then
        platFixture = b
        otherBody = a:getBody()
    else
        return
    end

    -- Only collide if the other body is moving downward
    -- and is above the platform
    local _, vy = otherBody:getLinearVelocity()
    local px, py = platFixture:getBody():getPosition()
    local ox, oy = otherBody:getPosition()

    if oy > py or vy < 0 then
        contact:setEnabled(false)
    end
end
```

---

## Performance Tips

1. **Use meters, not pixels.** Box2D is tuned for objects 0.1–10 meters. Set `love.physics.setMeter()` and convert coordinates.
2. **Enable sleeping.** Pass `true` as the third argument to `newWorld`. Sleeping bodies skip simulation entirely.
3. **Destroy bodies you're done with.** Call `body:destroy()` to free memory. Don't let off-screen objects accumulate.
4. **Avoid creating fixtures every frame.** Create physics objects in `love.load()` or on spawn events, never in `update` or `draw`.
5. **Limit polygon complexity.** Use convex polygons with ≤ 8 vertices. Decompose concave shapes into multiple convex fixtures.
6. **Fixed timestep for determinism.** For replay or networked physics, use a fixed timestep accumulator instead of passing raw `dt`.

---

## Debug Drawing

Visualize your physics world during development:

```lua
function love.draw()
    -- Draw all bodies in the world
    for _, body in ipairs(world:getBodies()) do
        for _, fixture in ipairs(body:getFixtures()) do
            local shape = fixture:getShape()
            local shapeType = shape:getType()

            love.graphics.setColor(0, 1, 0, 0.5)
            if shapeType == "circle" then
                local cx, cy = body:getWorldPoint(shape:getPoint())
                love.graphics.circle("line", cx, cy, shape:getRadius())
            elseif shapeType == "polygon" then
                love.graphics.polygon("line",
                    body:getWorldPoints(shape:getPoints()))
            elseif shapeType == "edge" then
                love.graphics.line(body:getWorldPoints(shape:getPoints()))
            elseif shapeType == "chain" then
                love.graphics.line(body:getWorldPoints(shape:getPoints()))
            end
        end
    end
    love.graphics.setColor(1, 1, 1)
end
```

---

## Common Pitfalls

1. **Modifying bodies during callbacks** — Box2D is mid-step during collision callbacks. Queue changes (e.g., `destroy` calls) and apply them after `world:update()`.
2. **Forgetting `setMeter()`** — without a proper scale, objects behave strangely (too floaty or too jittery).
3. **Using pixels as physics units** — a 600-pixel object is 600 meters to Box2D, which is wildly outside its tuned range.
4. **Ignoring fixed rotation** — player characters spin when they hit corners. Use `body:setFixedRotation(true)`.
5. **Leaking bodies** — off-screen bullets, particles, and debris accumulate. Always destroy or pool them.
