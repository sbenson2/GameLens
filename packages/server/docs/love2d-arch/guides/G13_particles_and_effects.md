# G13 — Particles and Visual Effects

> **Category:** guide · **Engine:** Love2D · **Related:** [G2 Graphics & Rendering](G2_graphics_and_rendering.md) · [G6 Shaders & GLSL](G6_shaders_and_glsl.md) · [R1 Module Reference](../reference/R1_module_reference.md)

---

## ParticleSystem Overview

LÖVE includes a built-in GPU-accelerated particle system through `love.graphics.newParticleSystem`. Each `ParticleSystem` manages a pool of particles that share a texture and follow configurable emission, movement, and rendering rules.

```lua
local psystem

function love.load()
    local img = love.graphics.newImage("assets/particle.png")
    psystem = love.graphics.newParticleSystem(img, 256)  -- max 256 particles
    psystem:setParticleLifetime(0.5, 1.5)    -- min, max seconds
    psystem:setEmissionRate(50)               -- particles per second
    psystem:setLinearAcceleration(-20, -50, 20, -100)  -- xmin, ymin, xmax, ymax
    psystem:setColors(
        1, 0.8, 0.2, 1,   -- birth: warm yellow
        1, 0.2, 0.0, 0    -- death: red, faded out
    )
    psystem:setSizes(1.0, 0.2)  -- shrink over lifetime
end

function love.update(dt)
    psystem:update(dt)
end

function love.draw()
    love.graphics.draw(psystem, 400, 300)
end
```

**Key rule:** You must call `psystem:update(dt)` every frame for particles to advance. Without it, the system appears frozen.

---

## Creation and Buffer Size

```lua
local ps = love.graphics.newParticleSystem(texture, bufferSize)
```

| Parameter | Type | Purpose |
|-----------|------|---------|
| `texture` | Image or Canvas | The image drawn for each particle |
| `bufferSize` | number | Maximum number of live particles (pre-allocated) |

Set `bufferSize` to the maximum you expect on screen at once. A system with `setEmissionRate(100)` and `setParticleLifetime(2, 2)` will need a buffer of at least 200. Over-allocating wastes a small amount of memory; under-allocating silently drops new particles.

---

## Emission Controls

### Continuous Emission

```lua
psystem:setEmissionRate(80)  -- 80 particles per second, continuously
```

### Burst Emission

For one-shot effects (explosions, pickups), use `emit` instead of a steady rate:

```lua
psystem:setEmissionRate(0)  -- No continuous emission

function spawnExplosion(x, y)
    psystem:setPosition(x, y)
    psystem:emit(64)  -- Burst of 64 particles
end
```

### Emission Area

Spread particle origins over a region instead of a single point:

```lua
-- Emit from a 40×40 box uniformly, not oriented to emission direction
psystem:setEmissionArea("uniform", 40, 40, 0, false)
```

Distribution modes: `"uniform"`, `"normal"`, `"ellipse"`, `"borderellipse"`, `"borderrectangle"`, `"none"`.

---

## Movement Properties

### Speed and Direction

```lua
psystem:setSpeed(50, 200)          -- Random initial speed (min, max)
psystem:setDirection(math.rad(-90)) -- Up (radians, 0 = right)
psystem:setSpread(math.rad(30))     -- ±15° cone from direction
```

### Acceleration

```lua
-- Linear acceleration (gravity, wind)
psystem:setLinearAcceleration(0, 100, 0, 100)  -- Gravity: push down

-- Radial acceleration (toward/away from emitter)
psystem:setRadialAcceleration(-20, -10)  -- Pull inward

-- Tangential acceleration (orbit)
psystem:setTangentialAcceleration(30, 50)
```

### Damping

```lua
psystem:setLinearDamping(0.5, 1.0)  -- Deceleration over lifetime
```

---

## Visual Properties

### Size Over Lifetime

```lua
-- Up to 8 size values interpolated over the particle's life
psystem:setSizes(0.2, 1.0, 0.8, 0.0)  -- grow, peak, shrink, vanish
psystem:setSizeVariation(0.3)           -- ±30% randomness
```

### Color Over Lifetime

```lua
-- RGBA tuples interpolated linearly over lifetime
psystem:setColors(
    1, 1, 1, 1,     -- white at birth
    1, 0.5, 0, 1,   -- orange at midlife
    0.5, 0, 0, 0    -- dark red, faded at death
)
```

### Rotation and Spin

```lua
psystem:setRotation(0, math.rad(360))           -- Random initial rotation
psystem:setSpin(math.rad(-180), math.rad(180))   -- Spin speed (rad/s)
psystem:setSpinVariation(1.0)                     -- Full randomness
```

---

## Managing Multiple Particle Systems

Games typically have many effects: footsteps, muzzle flashes, rain, fire, ambient dust. A simple manager keeps things organized:

```lua
local EffectManager = { systems = {} }

function EffectManager:add(ps, x, y, duration)
    table.insert(self.systems, {
        ps = ps,
        x = x, y = y,
        timer = duration or math.huge,
    })
end

function EffectManager:update(dt)
    for i = #self.systems, 1, -1 do
        local e = self.systems[i]
        e.ps:update(dt)
        e.timer = e.timer - dt
        -- Remove when expired AND no particles alive
        if e.timer <= 0 and e.ps:getCount() == 0 then
            table.remove(self.systems, i)
        end
    end
end

function EffectManager:draw()
    for _, e in ipairs(self.systems) do
        love.graphics.draw(e.ps, e.x, e.y)
    end
end
```

For burst effects, stop emission when the timer runs out:

```lua
if e.timer <= 0 then
    e.ps:setEmissionRate(0)
end
```

---

## Blend Modes for Effects

The default blend mode (`"alpha"`) works for most particles. For fire, sparks, and magic effects, additive blending makes particles brighten where they overlap:

```lua
function love.draw()
    drawWorld()

    love.graphics.setBlendMode("add")
    love.graphics.draw(fireSystem, fireX, fireY)
    love.graphics.setBlendMode("alpha")  -- Reset

    drawHUD()
end
```

---

## Common Effect Recipes

### Fire

```lua
local fire = love.graphics.newParticleSystem(particleImg, 300)
fire:setParticleLifetime(0.3, 0.8)
fire:setEmissionRate(120)
fire:setEmissionArea("normal", 8, 2)
fire:setSpeed(30, 80)
fire:setDirection(math.rad(-90))  -- Up
fire:setSpread(math.rad(20))
fire:setLinearAcceleration(0, -40, 0, -80)
fire:setSizes(0.6, 0.4, 0.1)
fire:setColors(
    1, 0.9, 0.3, 1,
    1, 0.4, 0.1, 0.8,
    0.4, 0.1, 0.0, 0
)
```

### Explosion Burst

```lua
local boom = love.graphics.newParticleSystem(particleImg, 128)
boom:setParticleLifetime(0.2, 0.6)
boom:setEmissionRate(0)  -- Burst only
boom:setSpeed(100, 400)
boom:setSpread(math.rad(360))  -- All directions
boom:setLinearDamping(3, 5)
boom:setSizes(1.0, 0.5, 0.0)
boom:setColors(
    1, 1, 0.8, 1,
    1, 0.4, 0.1, 0.6,
    0.2, 0.2, 0.2, 0
)
-- Trigger with: boom:setPosition(x, y); boom:emit(80)
```

### Dust Trail (Following Player)

```lua
local dust = love.graphics.newParticleSystem(particleImg, 100)
dust:setParticleLifetime(0.3, 0.7)
dust:setEmissionRate(0)  -- Controlled manually
dust:setSpeed(5, 20)
dust:setDirection(math.rad(-90))
dust:setSpread(math.rad(60))
dust:setSizes(0.3, 0.1)
dust:setColors(0.7, 0.65, 0.5, 0.5,  0.7, 0.65, 0.5, 0)

function love.update(dt)
    dust:setPosition(player.x, player.y + player.h)
    if player.isRunning and player.onGround then
        dust:emit(2)  -- A few particles per frame
    end
    dust:update(dt)
end
```

---

## Performance Considerations

| Tip | Why |
|-----|-----|
| Set a realistic `bufferSize` | Each particle is a vertex quad — 10,000 particles in one system is cheap, 100,000 starts to matter |
| Use a single shared texture atlas | Fewer texture switches = fewer draw calls |
| Pool and reuse `ParticleSystem` objects | `newParticleSystem` allocates — don't create and discard per explosion |
| Call `psystem:reset()` to recycle | Clears all live particles and resets timers without allocating |
| Combine additive-blend systems | Draw all additive systems in one batch to avoid blend-mode switching |

---

## Combining Particles With Shaders

For advanced effects, draw particle systems to a Canvas, then apply a shader (see G6):

```lua
function love.draw()
    love.graphics.setCanvas(effectCanvas)
    love.graphics.clear(0, 0, 0, 0)
    love.graphics.setBlendMode("add")
    love.graphics.draw(fireSystem, fireX, fireY)
    love.graphics.setBlendMode("alpha")
    love.graphics.setCanvas()

    -- Draw the effect canvas with a bloom/blur shader
    love.graphics.setShader(bloomShader)
    love.graphics.draw(effectCanvas)
    love.graphics.setShader()
end
```
