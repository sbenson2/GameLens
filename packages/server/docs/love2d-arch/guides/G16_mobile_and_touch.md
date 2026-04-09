# G16 — Mobile and Touch Development

> **Category:** guide · **Engine:** Love2D · **Related:** [G5 Input Handling](G5_input_handling.md) · [G2 Graphics & Rendering](G2_graphics_and_rendering.md) · [G10 Distribution & Packaging](G10_distribution_and_packaging.md)

---

LÖVE runs on Android and iOS out of the box. The framework is the same — `love.load`, `love.update`, `love.draw` — but mobile introduces touch input, variable screen densities, and battery/thermal constraints that need attention.

---

## Platform Detection

Check the OS at runtime to conditionally enable touch controls or tweak behavior:

```lua
function love.load()
    local os_name = love.system.getOS()
    IS_MOBILE = (os_name == "Android" or os_name == "iOS")
end
```

Use this flag to show virtual controls, adjust UI scale, or swap input schemes — not to gate entire features behind platforms.

---

## conf.lua for Mobile

Mobile windows behave differently from desktop. The aspect ratio you set in `conf.lua` determines orientation (landscape vs. portrait), and `highdpi` should almost always be `true`.

```lua
function love.conf(t)
    t.window.title  = "My Mobile Game"
    t.window.width  = 1280
    t.window.height = 720      -- landscape; swap for portrait
    t.window.highdpi = true    -- use full Retina/HiDPI density
    t.window.usedpiscale = true -- let LÖVE handle DPI-scaled coordinates
    t.window.resizable = true  -- required for orientation changes

    -- Mobile-friendly module trimming
    t.modules.joystick = false -- most phones have no gamepad
    t.modules.physics   = true  -- keep if needed, disable to save memory
end
```

**Key points:**

- On Android, `highdpi` is effectively always on.
- `usedpiscale = true` (the default) means drawing coordinates are in *units*, not physical pixels. A 1280×720 window on a 2× display has 2560×1440 backing pixels, but you draw at 1280×720.
- Call `love.graphics.getDPIScale()` when you need the pixel multiplier (e.g., for crisp text rendering).

---

## Touch Input API

LÖVE provides three callbacks and a polling module for multi-touch. Touch IDs are lightweight pointers, unique only during a single press-release cycle.

### Callbacks

```lua
-- Finger touches the screen
function love.touchpressed(id, x, y, dx, dy, pressure)
    -- id: unique for this finger until touchreleased
    -- x, y: position in DPI-scaled window coordinates
    -- pressure: 0.0–1.0 on devices that support it (many report 1.0 always)
end

-- Finger moves while touching
function love.touchmoved(id, x, y, dx, dy, pressure)
    -- dx, dy: delta since last move event
end

-- Finger lifts off
function love.touchreleased(id, x, y, dx, dy, pressure)
    -- After this call, `id` may be reused for a new finger
end
```

### Polling

```lua
function love.update(dt)
    local touches = love.touch.getTouches() -- list of active touch IDs
    for _, id in ipairs(touches) do
        local x, y = love.touch.getPosition(id)
        local pressure = love.touch.getPressure(id)
        -- process each finger
    end
end
```

### Touch vs. Mouse

On mobile, LÖVE also generates `love.mousepressed` / `love.mousereleased` from the *first* touch. This is convenient for simple single-touch games, but breaks down for multi-touch. Prefer the dedicated touch API for any game that might need two fingers.

```lua
-- Unified single-point input helper
function getPointerPosition()
    if IS_MOBILE then
        local touches = love.touch.getTouches()
        if #touches > 0 then
            return love.touch.getPosition(touches[1])
        end
    end
    return love.mouse.getPosition()
end
```

---

## Virtual Joystick Pattern

Most action games on mobile need a virtual joystick. The core pattern: track which touch ID "owns" the stick, compute a direction vector from the origin to the current finger position.

```lua
local VJoystick = {
    id     = nil,    -- active touch ID (nil when not held)
    ox     = 0,      -- origin x (where thumb first touched)
    oy     = 0,      -- origin y
    dx     = 0,      -- normalized direction x (-1 to 1)
    dy     = 0,      -- normalized direction y (-1 to 1)
    radius = 64,     -- max displacement in pixels
    zone   = nil,    -- active zone rect {x, y, w, h}
}

function VJoystick:init(zone)
    self.zone = zone  -- e.g. {x = 0, y = 0, w = 400, h = 720}
end

function VJoystick:pressed(id, x, y)
    if self.id then return end  -- already tracking a finger
    local z = self.zone
    if x >= z.x and x <= z.x + z.w and y >= z.y and y <= z.y + z.h then
        self.id = id
        self.ox, self.oy = x, y
        self.dx, self.dy = 0, 0
    end
end

function VJoystick:moved(id, x, y)
    if id ~= self.id then return end
    local mx, my = x - self.ox, y - self.oy
    local dist = math.sqrt(mx * mx + my * my)
    if dist > 0 then
        local clamped = math.min(dist, self.radius)
        self.dx = (mx / dist) * (clamped / self.radius)
        self.dy = (my / dist) * (clamped / self.radius)
    end
end

function VJoystick:released(id)
    if id ~= self.id then return end
    self.id = nil
    self.dx, self.dy = 0, 0
end

function VJoystick:draw()
    if not self.id then return end
    -- Outer ring
    love.graphics.setColor(1, 1, 1, 0.3)
    love.graphics.circle("line", self.ox, self.oy, self.radius)
    -- Thumb position
    love.graphics.setColor(1, 1, 1, 0.6)
    love.graphics.circle("fill",
        self.ox + self.dx * self.radius,
        self.oy + self.dy * self.radius,
        self.radius * 0.4)
    love.graphics.setColor(1, 1, 1, 1)
end
```

Wire it up in your callbacks:

```lua
function love.touchpressed(id, x, y, dx, dy, pressure)
    VJoystick:pressed(id, x, y)
end

function love.touchmoved(id, x, y, dx, dy, pressure)
    VJoystick:moved(id, x, y)
end

function love.touchreleased(id, x, y, dx, dy, pressure)
    VJoystick:released(id)
end

function love.update(dt)
    player.x = player.x + VJoystick.dx * player.speed * dt
    player.y = player.y + VJoystick.dy * player.speed * dt
end
```

**Design tip:** Place the joystick zone on the left half of the screen, action buttons on the right. The origin follows the initial press so the player's thumb never drifts off a fixed control.

---

## Virtual Button Pattern

Action buttons use the same touch-tracking idea but fire a callback on press or release:

```lua
local VButton = {}
VButton.__index = VButton

function VButton.new(x, y, radius, label, on_press)
    return setmetatable({
        x = x, y = y, radius = radius,
        label = label, on_press = on_press,
        id = nil, pressed = false,
    }, VButton)
end

function VButton:touchpressed(id, tx, ty)
    if self.id then return end
    local dist = math.sqrt((tx - self.x)^2 + (ty - self.y)^2)
    if dist <= self.radius then
        self.id = id
        self.pressed = true
        if self.on_press then self.on_press() end
    end
end

function VButton:touchreleased(id)
    if id == self.id then
        self.id = nil
        self.pressed = false
    end
end

function VButton:draw()
    love.graphics.setColor(1, 1, 1, self.pressed and 0.6 or 0.3)
    love.graphics.circle("fill", self.x, self.y, self.radius)
    love.graphics.setColor(1, 1, 1, 1)
    local font = love.graphics.getFont()
    local tw = font:getWidth(self.label)
    love.graphics.print(self.label, self.x - tw / 2, self.y - font:getHeight() / 2)
end
```

---

## Resolution Scaling

Mobile screens vary wildly in size and aspect ratio. A common pattern is to render to a fixed-size canvas and scale it to fill the screen, letterboxing as needed.

```lua
local GAME_W, GAME_H = 480, 270  -- your "virtual" resolution
local canvas, scale, offset_x, offset_y

function love.load()
    canvas = love.graphics.newCanvas(GAME_W, GAME_H)
    canvas:setFilter("nearest", "nearest")  -- pixel-art friendly
    calculateScale()
end

function love.resize(w, h)
    calculateScale()
end

function calculateScale()
    local w, h = love.graphics.getDimensions()
    scale = math.min(w / GAME_W, h / GAME_H)
    offset_x = (w - GAME_W * scale) / 2
    offset_y = (h - GAME_H * scale) / 2
end

function love.draw()
    -- Draw game world to canvas at virtual resolution
    love.graphics.setCanvas(canvas)
    love.graphics.clear(0.1, 0.1, 0.15)
    drawGame()
    love.graphics.setCanvas()

    -- Scale canvas to screen
    love.graphics.setColor(1, 1, 1, 1)
    love.graphics.draw(canvas, offset_x, offset_y, 0, scale, scale)

    -- Draw touch controls in screen space (not on the canvas)
    if IS_MOBILE then
        VJoystick:draw()
    end
end
```

**Converting screen touch coordinates to game coordinates:**

```lua
function screenToGame(sx, sy)
    local gx = (sx - offset_x) / scale
    local gy = (sy - offset_y) / scale
    return gx, gy
end
```

The `push` library automates this pattern if you prefer a ready-made solution.

---

## Safe Areas and Notches

Modern phones have notches, rounded corners, and system gesture bars that eat into your drawable area. LÖVE doesn't expose a dedicated safe-area API, so you need to account for this yourself.

```lua
-- Conservative safe-area insets (tweak per device testing)
local SAFE_INSET = {
    top    = 44,  -- status bar / notch
    bottom = 34,  -- home indicator (iOS) / gesture bar
    left   = 0,
    right  = 0,
}

function getSafeArea()
    local w, h = love.graphics.getDimensions()
    return {
        x = SAFE_INSET.left,
        y = SAFE_INSET.top,
        w = w - SAFE_INSET.left - SAFE_INSET.right,
        h = h - SAFE_INSET.top - SAFE_INSET.bottom,
    }
end
```

Place critical HUD elements (score, health, pause button) inside the safe area. Gameplay rendering can extend edge-to-edge.

---

## Performance Tips for Mobile

Mobile GPUs and CPUs are weaker than desktop. The biggest wins:

**Draw calls** — SpriteBatch everything. Mobile GPUs tolerate far fewer draw calls than desktop. See [R3 Performance Optimization](../reference/R3_performance_optimization.md).

**Garbage collection** — LuaJIT's GC can cause frame hitches on constrained devices. Avoid allocating tables in `love.update()`. Pre-allocate and recycle objects using pools.

```lua
-- Table pool to avoid GC pressure
local pool = {}
function poolGet()
    return table.remove(pool) or {}
end
function poolReturn(t)
    for k in pairs(t) do t[k] = nil end  -- clear without allocating
    pool[#pool + 1] = t
end
```

**Texture memory** — Compress textures and use atlases. A 2048×2048 RGBA atlas uses 16 MB of VRAM; a 4096×4096 one uses 64 MB. Stay under your target device's budget.

**Frame rate** — Consider targeting 30 FPS for battery-heavy games:

```lua
-- In conf.lua or love.load
love.window.setMode(1280, 720, { vsync = 1 })
-- Or manually cap in love.run() by sleeping
```

**Audio** — Use `.ogg` for music (streamed) and `.wav` for short SFX (decoded in memory). Avoid loading many large `.wav` files simultaneously on mobile.

---

## Building for Mobile

### Android

The `love-android` repository provides a Gradle-based build that wraps your `.love` file into an APK:

1. Clone `https://github.com/love2d/love-android`.
2. Place your `.love` file in `app/src/embed/assets/`.
3. Update `app/src/main/AndroidManifest.xml` with your package name and permissions.
4. Build with `./gradlew assembleEmbedRelease`.

For quick testing, install the LÖVE APK from the releases page and open your `.love` file with a file manager.

### iOS

1. Clone `https://github.com/love2d/love` and fetch `love-apple-dependencies`.
2. Open `platform/xcode/love.xcodeproj`.
3. Place your game files in the Xcode project's resources.
4. Build the `love-ios` target for a simulator or device.

iOS requires an Apple Developer account for device testing and distribution.

---

## Checklist

- [ ] Detect platform with `love.system.getOS()` — show touch controls only on mobile
- [ ] Use `love.touch*` callbacks for multi-touch instead of mouse events
- [ ] Implement virtual joystick + buttons with per-finger ID tracking
- [ ] Render at a fixed virtual resolution, scale to screen with letterboxing
- [ ] Keep HUD elements inside safe-area insets
- [ ] Batch draw calls aggressively — target under 50 for low-end Android
- [ ] Pool frequently allocated tables to reduce GC pressure
- [ ] Test on actual devices — emulators don't capture touch latency or thermal throttling
