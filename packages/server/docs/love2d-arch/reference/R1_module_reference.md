# R1 — Module Reference

> **Category:** reference · **Engine:** Love2D · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Game Loop & Callbacks](../guides/G1_game_loop_and_callbacks.md) · [G2 Graphics & Rendering](../guides/G2_graphics_and_rendering.md)

---

LÖVE is organized into modules, each covering a specific domain. Every module is accessed via the `love` namespace. Modules can be enabled or disabled in `conf.lua`.

---

## Module Overview

| Module | Purpose | Key Types |
|--------|---------|-----------|
| `love.audio` | Sound playback and recording | Source |
| `love.data` | Data encoding/decoding, compression | ByteData, CompressedData |
| `love.event` | Event queue management | — |
| `love.filesystem` | Sandboxed file I/O | File, FileData |
| `love.font` | Font loading (low-level) | Rasterizer, GlyphData |
| `love.graphics` | All rendering | Image, Canvas, Shader, SpriteBatch, Mesh, Font, Quad, ParticleSystem, Text, Video |
| `love.image` | Image data manipulation (CPU-side) | ImageData, CompressedImageData |
| `love.joystick` | Gamepad and joystick input | Joystick |
| `love.keyboard` | Keyboard input | — |
| `love.math` | Math utilities, noise, random | Transform, BezierCurve, RandomGenerator |
| `love.mouse` | Mouse input and cursor | Cursor |
| `love.physics` | 2D physics (Box2D binding) | World, Body, Shape, Fixture, Joint |
| `love.sound` | Audio decoding (low-level) | SoundData, Decoder |
| `love.system` | OS info, clipboard, vibration | — |
| `love.thread` | Multi-threading | Thread, Channel |
| `love.timer` | Frame timing, FPS | — |
| `love.touch` | Touchscreen input | — |
| `love.video` | Video playback | VideoStream |
| `love.window` | Window management, display info | — |

---

## love.audio

Manages sound playback. Supports WAV, OGG, MP3, FLAC, and other formats.

```lua
-- Load and play a sound effect
local sfx = love.audio.newSource("shoot.wav", "static")
sfx:play()

-- Load and play background music (streamed from disk)
local music = love.audio.newSource("bgm.ogg", "stream")
music:setLooping(true)
music:setVolume(0.5)
music:play()

-- Positional audio
sfx:setPosition(10, 0, 0)
love.audio.setPosition(0, 0, 0)  -- listener position
```

### Source Types

| Type | Use Case |
|------|----------|
| `"static"` | Short sounds (SFX). Decoded into memory. Fast to play repeatedly. |
| `"stream"` | Long audio (music). Streamed from disk. Low memory. |
| `"queue"` | Procedural audio. You push audio buffers manually. |

### Key Functions

- `love.audio.newSource(path, type)` — create a Source
- `love.audio.setVolume(vol)` — master volume (0–1)
- `love.audio.pause()` / `love.audio.stop()` — pause/stop all sources
- `love.audio.getActiveSourceCount()` — number of currently playing sources
- `Source:play()`, `Source:pause()`, `Source:stop()`, `Source:clone()`
- `Source:setPitch(p)` — playback speed (1.0 = normal)
- `Source:setFilter({type, volume, highgain})` — low-pass/high-pass/band-pass

---

## love.physics

2D rigid-body physics via Box2D. Suitable for platformers, top-down games, and physics puzzles.

```lua
function love.load()
    -- Create a world with gravity
    world = love.physics.newWorld(0, 9.81 * 64, true)

    -- Static ground
    ground = {}
    ground.body = love.physics.newBody(world, 400, 550, "static")
    ground.shape = love.physics.newRectangleShape(800, 20)
    ground.fixture = love.physics.newFixture(ground.body, ground.shape)

    -- Dynamic ball
    ball = {}
    ball.body = love.physics.newBody(world, 400, 100, "dynamic")
    ball.body:setMass(1)
    ball.shape = love.physics.newCircleShape(20)
    ball.fixture = love.physics.newFixture(ball.body, ball.shape, 1)
    ball.fixture:setRestitution(0.7)  -- bounciness
end

function love.update(dt)
    world:update(dt)
end

function love.draw()
    love.graphics.circle("fill", ball.body:getX(), ball.body:getY(), 20)
    love.graphics.rectangle("fill", 0, 540, 800, 20)
end
```

### Body Types

| Type | Description |
|------|-------------|
| `"static"` | Never moves. Walls, platforms, ground. |
| `"dynamic"` | Full physics simulation. Players, projectiles, crates. |
| `"kinematic"` | Moves via velocity only, not forces. Moving platforms, elevators. |

### Shape Types

- `newCircleShape(radius)`
- `newRectangleShape(width, height)`
- `newPolygonShape(x1,y1, x2,y2, ...)` — convex, max 8 vertices
- `newEdgeShape(x1,y1, x2,y2)` — line segment
- `newChainShape(loop, x1,y1, x2,y2, ...)` — terrain outlines

### Collision Callbacks

```lua
world:setCallbacks(beginContact, endContact, preSolve, postSolve)

function beginContact(a, b, contact)
    -- a, b are Fixtures
    local ud_a = a:getUserData()
    local ud_b = b:getUserData()
end
```

### Joint Types

`DistanceJoint`, `RevoluteJoint`, `PrismaticJoint`, `PulleyJoint`, `GearJoint`, `FrictionJoint`, `WeldJoint`, `RopeJoint`, `WheelJoint`, `MotorJoint`, `MouseJoint`.

---

## love.filesystem

Provides sandboxed file access. LÖVE can read from two locations:

1. **Game directory** (the `.love` archive or project folder) — read-only
2. **Save directory** (`~/.local/share/love/<identity>/` on Linux, `%APPDATA%/LOVE/<identity>/` on Windows) — read/write

```lua
-- Set identity in conf.lua
function love.conf(t)
    t.identity = "mygame"
end

-- Write save data
love.filesystem.write("save.json", json.encode(save_data))

-- Read save data
local contents = love.filesystem.read("save.json")

-- Check if a file exists
if love.filesystem.getInfo("save.json") then
    -- file exists
end

-- List directory contents
local items = love.filesystem.getDirectoryItems("levels/")
```

### Key Functions

- `love.filesystem.read(path)` — returns file contents as string
- `love.filesystem.write(path, data)` — write to save directory
- `love.filesystem.append(path, data)` — append to file
- `love.filesystem.getInfo(path)` — returns table with `type`, `size`, `modtime` or nil
- `love.filesystem.lines(path)` — iterator over lines
- `love.filesystem.load(path)` — loads a Lua file as a function (does not execute it)
- `love.filesystem.getDirectoryItems(dir)` — list files and folders
- `love.filesystem.createDirectory(name)` — create in save directory
- `love.filesystem.remove(name)` — delete from save directory
- `love.filesystem.mount(archive, mountpoint)` — mount a zip as a virtual directory
- `love.filesystem.getSaveDirectory()` — absolute path to save dir

---

## love.keyboard

```lua
-- Polling
if love.keyboard.isDown("space", "return") then end

-- Callback (defined at top level)
function love.keypressed(key, scancode, isrepeat)
    if key == "escape" then love.event.quit() end
end
function love.keyreleased(key, scancode) end

-- Text input (for chat, name entry)
function love.textinput(text)
    input_string = input_string .. text
end
love.keyboard.setTextInput(true)  -- enable on mobile
```

**`key` vs `scancode`:** `key` is layout-dependent ("w" on QWERTY is "z" on AZERTY). `scancode` is physical-position-dependent. Use `scancode` for movement (WASD), `key` for text/shortcuts.

---

## love.mouse

```lua
local x, y = love.mouse.getPosition()
love.mouse.setVisible(false)
love.mouse.setGrabbed(true)  -- confine to window
love.mouse.setRelativeMode(true)  -- FPS-style, dx/dy only

function love.mousepressed(x, y, button, istouch, presses) end
function love.mousereleased(x, y, button, istouch, presses) end
function love.mousemoved(x, y, dx, dy, istouch) end
function love.wheelmoved(x, y) end  -- y > 0 = scroll up
```

---

## love.math

```lua
-- Perlin/simplex noise (great for terrain, variation)
local n = love.math.noise(x * 0.1, y * 0.1)        -- 0..1
local n3 = love.math.noise(x * 0.1, y * 0.1, seed)  -- 3D noise

-- Seeded random (deterministic)
local rng = love.math.newRandomGenerator(42)
local val = rng:random(1, 100)

-- Triangulation
local triangles = love.math.triangulate(polygon_vertices)

-- Gamma correction
local linear = love.math.gammaToLinear(srgb)
local srgb = love.math.linearToGamma(linear)
```

---

## love.timer

```lua
local dt = love.timer.getDelta()         -- time since last frame
local fps = love.timer.getFPS()          -- smoothed FPS
local t = love.timer.getTime()           -- seconds since app start
local avg = love.timer.getAverageDelta() -- smoothed dt
love.timer.sleep(seconds)               -- yield to OS
```

---

## love.window

```lua
-- In conf.lua (preferred)
function love.conf(t)
    t.window.title = "My Game"
    t.window.width = 1280
    t.window.height = 720
    t.window.resizable = true
    t.window.vsync = 1
end

-- At runtime
love.window.setTitle("My Game - Score: " .. score)
love.window.setMode(1920, 1080, { fullscreen = true })
love.window.setFullscreen(true, "desktop")  -- borderless fullscreen
local w, h = love.window.getDesktopDimensions()
local dpi = love.window.getDPIScale()
```

---

## love.thread

LÖVE runs Lua in a single thread by default. `love.thread` lets you offload work (pathfinding, generation, networking) to separate OS threads.

```lua
-- main.lua
local thread = love.thread.newThread("worker.lua")
local channel = love.thread.newChannel()
thread:start(channel)

-- Send work
channel:push({ type = "generate", seed = 42 })

-- Receive results (non-blocking)
local result = channel:pop()

-- worker.lua
local channel = ...  -- received from start()
while true do
    local job = channel:demand()  -- blocks until message arrives
    -- do heavy work
    love.thread.getChannel("results"):push(result)
end
```

**Important:** threads have separate Lua states. You cannot share tables or userdata directly — only strings, numbers, booleans, and flat tables. Use channels or `love.data` for binary data.

---

## love.system

```lua
love.system.getOS()                  -- "Windows", "OS X", "Linux", "Android", "iOS"
love.system.getProcessorCount()      -- CPU core count
love.system.openURL("https://...")   -- open in browser
love.system.setClipboardText("hi")
local text = love.system.getClipboardText()
love.system.vibrate(0.5)            -- mobile only
love.system.getPowerInfo()           -- battery state, %, seconds
```

---

## love.touch

For multi-touch on mobile devices:

```lua
local touches = love.touch.getTouches()
for _, id in ipairs(touches) do
    local x, y = love.touch.getPosition(id)
end

function love.touchpressed(id, x, y, dx, dy, pressure) end
function love.touchmoved(id, x, y, dx, dy, pressure) end
function love.touchreleased(id, x, y, dx, dy, pressure) end
```

---

## Enabling/Disabling Modules

In `conf.lua`, toggle modules you don't need to save memory and startup time:

```lua
function love.conf(t)
    t.modules.audio = true
    t.modules.data = true
    t.modules.event = true
    t.modules.font = true
    t.modules.graphics = true
    t.modules.image = true
    t.modules.joystick = true
    t.modules.keyboard = true
    t.modules.math = true
    t.modules.mouse = true
    t.modules.physics = false   -- disable if not using Box2D
    t.modules.sound = true
    t.modules.system = true
    t.modules.thread = true
    t.modules.timer = true
    t.modules.touch = true
    t.modules.video = false     -- disable if not playing video
    t.modules.window = true
end
```
