# G12 — UI Patterns

> **Category:** guide · **Engine:** Love2D · **Related:** [G1 Game Loop & Callbacks](G1_game_loop_and_callbacks.md) · [G5 Input Handling](G5_input_handling.md) · [G2 Graphics & Rendering](G2_graphics_and_rendering.md)

---

## No Built-In UI — By Design

LÖVE is a framework, not an engine. It provides drawing primitives and input callbacks but no widget toolkit. You have three paths for game UI:

| Approach | Pros | Cons |
|----------|------|------|
| **Roll your own** | Full control, no dependencies | Time-consuming, error-prone hit testing |
| **Immediate-mode library** (SUIT, Slab) | Fast iteration, stateless rendering | Not ideal for heavy skinning or animation |
| **Retained-mode / declarative library** (Yui, GOOi) | Richer layout, callbacks | Larger API surface, harder to integrate with custom rendering |

For game HUDs and menus, rolling your own or using an immediate-mode library is most common in the LÖVE community.

---

## Rolling Your Own: Core Patterns

### Button With Hit Testing

```lua
local button = {
    x = 200, y = 300, w = 160, h = 48,
    text = "Start Game",
    hovered = false,
    pressed = false,
}

function button:containsPoint(px, py)
    return px >= self.x and px < self.x + self.w
       and py >= self.y and py < self.y + self.h
end

function button:update()
    local mx, my = love.mouse.getPosition()
    self.hovered = self:containsPoint(mx, my)
end

function button:draw()
    if self.pressed then
        love.graphics.setColor(0.2, 0.6, 1.0)
    elseif self.hovered then
        love.graphics.setColor(0.3, 0.7, 1.0)
    else
        love.graphics.setColor(0.4, 0.4, 0.5)
    end
    love.graphics.rectangle("fill", self.x, self.y, self.w, self.h, 6, 6)

    love.graphics.setColor(1, 1, 1)
    local font = love.graphics.getFont()
    local tw = font:getWidth(self.text)
    local th = font:getHeight()
    love.graphics.print(self.text,
        self.x + (self.w - tw) / 2,
        self.y + (self.h - th) / 2)
end
```

Handle clicks in the callback, not in `update`:

```lua
function love.mousepressed(x, y, btn)
    if btn == 1 and button:containsPoint(x, y) then
        button.pressed = true
    end
end

function love.mousereleased(x, y, btn)
    if btn == 1 and button.pressed then
        button.pressed = false
        if button:containsPoint(x, y) then
            onStartGame()  -- Only fires when released inside
        end
    end
end
```

**Why press-then-release?** This matches platform conventions: the user can press a button, drag away to cancel, and release safely. It also prevents accidental clicks from triggering actions.

---

### Simple Widget Manager

Most games need several UI elements. A thin manager keeps draw ordering and input routing consistent:

```lua
local UI = { widgets = {} }

function UI:add(widget)
    table.insert(self.widgets, widget)
    return widget
end

function UI:update(dt)
    for _, w in ipairs(self.widgets) do
        if w.update then w:update(dt) end
    end
end

function UI:draw()
    for _, w in ipairs(self.widgets) do
        if w.visible ~= false then w:draw() end
    end
end

function UI:mousepressed(x, y, btn)
    -- Iterate in reverse so top-most widgets consume events first
    for i = #self.widgets, 1, -1 do
        local w = self.widgets[i]
        if w.mousepressed and w:containsPoint(x, y) then
            w:mousepressed(x, y, btn)
            return true  -- Event consumed
        end
    end
    return false
end
```

---

### Scaling UI With Window Resize

Game UIs must handle resolution changes. Anchor your widgets to screen edges or use proportional positioning:

```lua
function love.resize(w, h)
    -- Re-anchor a health bar to the top-left
    healthBar.x = 16
    healthBar.y = 16

    -- Center a menu panel
    menuPanel.x = (w - menuPanel.w) / 2
    menuPanel.y = (h - menuPanel.h) / 2
end
```

If you use `love.graphics.scale()` for a virtual resolution (see G11), apply the inverse transform before hit testing:

```lua
function screenToWorld(sx, sy)
    local scale = love.graphics.getWidth() / VIRTUAL_WIDTH
    return sx / scale, sy / scale
end
```

---

## Immediate-Mode UI With SUIT

[SUIT](https://github.com/vrld/suit) is a lightweight immediate-mode GUI library popular in the LÖVE community. "Immediate mode" means you declare widgets every frame — there is no persistent widget tree.

### Setup

Place the `suit` folder in your project root, then:

```lua
local suit = require "suit"

function love.update(dt)
    suit.layout:reset(50, 50)   -- Start layout cursor at (50, 50)

    -- Each call returns a table: { hit = bool, hovered = bool, ... }
    if suit.Button("Play", suit.layout:row(200, 40)).hit then
        startGame()
    end

    suit.Label("Volume", { align = "left" }, suit.layout:row(200, 30))
    suit.Slider(volumeState, suit.layout:row(200, 20))
end

function love.draw()
    suit.draw()
end

-- Forward input events to SUIT
function love.textinput(t)     suit.textinput(t) end
function love.keypressed(k)    suit.keypressed(k) end
```

### Layout System

SUIT's layout helper handles positioning so you don't hard-code coordinates:

```lua
suit.layout:reset(100, 100, 10, 10)  -- x, y, padX, padY

-- :row(w, h) places widgets vertically (one per row)
suit.Button("Option A", suit.layout:row(180, 40))
suit.Button("Option B", suit.layout:row(180, 40))

-- :col(w, h) places widgets horizontally
suit.layout:reset(100, 300, 10, 0)
suit.Button("Left",  suit.layout:col(80, 40))
suit.Button("Right", suit.layout:col(80, 40))
```

### When SUIT Works Well

SUIT excels at debug overlays, settings menus, and game-jam UIs where you need widgets fast. It's less suited for heavily themed UIs or complex animations — for those, a custom retained-mode approach gives more control.

---

## Slab: Richer Immediate-Mode UI

[Slab](https://github.com/flamendless/Slab) is a more feature-rich immediate-mode library inspired by Dear ImGui. It provides windows, menus, trees, color pickers, and file dialogs out of the box.

```lua
local Slab = require "Slab"

function love.load()
    Slab.Initialize()
end

function love.update(dt)
    Slab.Update(dt)

    Slab.BeginWindow("settings", { Title = "Settings" })
        Slab.Text("Player Name:")
        if Slab.Input("name", { Text = playerName }) then
            playerName = Slab.GetInputText()
        end
        if Slab.Button("Save") then
            saveSettings()
        end
    Slab.EndWindow()
end

function love.draw()
    drawGame()    -- Your game rendering
    Slab.Draw()   -- Slab on top
end
```

Slab is well-suited for level editors, debug tools, and settings screens. Its window management and docking capabilities make it a good fit for tools built alongside your game.

---

## HUD Rendering Tips

### Draw Order

Always render game UI after the game world. If you use a camera transform, reset it before drawing HUD elements:

```lua
function love.draw()
    camera:attach()
        drawWorld()
    camera:detach()

    drawHUD()  -- Screen-space, no camera transform
end
```

### Nine-Slice for Scalable Panels

For dialogue boxes and panels, use nine-slice (nine-patch) rendering to scale a texture without distorting corners:

```lua
-- Simple nine-slice using Quads
function drawNineSlice(img, x, y, w, h, border)
    local iw, ih = img:getDimensions()
    local b = border
    -- Corners (no scaling)
    love.graphics.draw(img, topLeftQuad,  x, y)
    love.graphics.draw(img, topRightQuad, x + w - b, y)
    love.graphics.draw(img, botLeftQuad,  x, y + h - b)
    love.graphics.draw(img, botRightQuad, x + w - b, y + h - b)
    -- Edges (scale in one direction)
    -- Center (scale in both)
    -- ... (build quads in love.load for the 9 regions)
end
```

### Fonts

Load fonts at specific sizes — LÖVE rasterizes TrueType fonts at load time, not at draw time:

```lua
function love.load()
    fontSmall  = love.graphics.newFont("assets/ui/font.ttf", 14)
    fontMedium = love.graphics.newFont("assets/ui/font.ttf", 24)
    fontLarge  = love.graphics.newFont("assets/ui/font.ttf", 48)
end

function drawHUD()
    love.graphics.setFont(fontMedium)
    love.graphics.print("Score: " .. score, 16, 16)
end
```

---

## Common Pitfalls

| Mistake | Fix |
|---------|-----|
| Hit testing in `love.update` with `love.mouse.isDown` | Use `love.mousepressed` / `love.mousereleased` callbacks for click actions |
| Forgetting to reset color after drawing widgets | Call `love.graphics.setColor(1, 1, 1)` after each widget's draw, or push/pop graphics state |
| Hard-coding positions that break at other resolutions | Anchor to screen edges or use proportional layout |
| Mixing camera-space and screen-space coordinates | Detach camera before drawing HUD; apply inverse transform for mouse-to-world |
| Loading fonts every frame | Load once in `love.load()` — `newFont` is expensive |
