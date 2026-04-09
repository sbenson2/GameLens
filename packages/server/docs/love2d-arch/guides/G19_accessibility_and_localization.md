# G19 — Accessibility and Localization

> **Category:** guide · **Engine:** Love2D · **Related:** [G5 Input Handling](G5_input_handling.md) · [G12 UI Patterns](G12_ui_patterns.md) · [G2 Graphics & Rendering](G2_graphics_and_rendering.md) · [R2 Common Libraries](../reference/R2_common_libraries.md)

---

## Overview

LÖVE doesn't ship built-in accessibility or localization systems, so these concerns fall on the developer. This guide covers practical patterns for internationalization (i18n), UTF-8 text handling, font management for non-Latin scripts, colorblind-safe rendering, input remapping, and other accessibility considerations. Making your game accessible and localizable from the start is dramatically easier than retrofitting it later.

---

## Localization Architecture

### Key-Based String Lookup

The simplest and most reliable localization pattern stores all player-facing strings behind keys. Never hardcode display text directly in game logic.

```lua
-- locales/en.lua
return {
    menu_start    = "Start Game",
    menu_options  = "Options",
    menu_quit     = "Quit",
    hud_score     = "Score: %d",
    dialog_intro  = "Welcome, traveler. The road ahead is long.",
}

-- locales/es.lua
return {
    menu_start    = "Iniciar Juego",
    menu_options  = "Opciones",
    menu_quit     = "Salir",
    hud_score     = "Puntuación: %d",
    dialog_intro  = "Bienvenido, viajero. El camino por delante es largo.",
}
```

### Locale Manager Module

```lua
-- src/utils/locale.lua
local M = {}

local strings = {}
local current_locale = "en"
local fallback_locale = "en"

function M.load(locale_code)
    local ok, tbl = pcall(require, "locales." .. locale_code)
    if ok then
        strings = tbl
        current_locale = locale_code
    else
        print("[locale] Failed to load locale: " .. locale_code .. ", using fallback")
        M.load(fallback_locale)
    end
end

--- Get a localized string by key. Supports string.format arguments.
--- Returns the key itself if no translation is found (fail-visible).
function M.get(key, ...)
    local str = strings[key]
    if not str then
        print("[locale] Missing key: " .. key .. " in locale: " .. current_locale)
        return key  -- fail-visible: shows the key so you notice it
    end
    if select("#", ...) > 0 then
        return string.format(str, ...)
    end
    return str
end

function M.get_locale()
    return current_locale
end

return M
```

### Usage in Game Code

```lua
local locale = require("src.utils.locale")

function love.load()
    -- Detect system locale (LÖVE 12 adds love.localechanged callback)
    local sys_locale = os.getenv("LANG") or "en"
    local code = sys_locale:sub(1, 2)  -- "en_US.UTF-8" -> "en"
    locale.load(code)
end

function love.draw()
    love.graphics.print(locale.get("menu_start"), 100, 100)
    love.graphics.print(locale.get("hud_score", player.score), 10, 10)
end
```

### Pluralization

Lua's `string.format` handles simple numeric insertion, but languages have different pluralization rules. For games with heavy text, use a pluralization function:

```lua
-- Simple English/Spanish pluralization. For complex rules (Russian, Arabic),
-- consider a library like lua-i18n or gettext via luagettext.
local function plural(count, one, many)
    if count == 1 then return one end
    return many
end

-- Usage
local msg = string.format(
    locale.get("enemies_remaining"),
    count,
    plural(count, locale.get("enemy_singular"), locale.get("enemy_plural"))
)
```

---

## UTF-8 Text Handling

LÖVE uses UTF-8 internally for all text rendering. Lua's `string` library operates on bytes, not characters, so standard `string.len()` returns byte count, not character count.

### LÖVE's Built-In UTF-8 Module

```lua
-- love.utf8 (alias for Lua 5.3's utf8 module in LÖVE 11.x+)
local text = "こんにちは"

-- Character count (not byte count)
local char_count = utf8.len(text)          -- 5

-- Iterate over codepoints
for p, c in utf8.codes(text) do
    print(p, c)  -- byte position, codepoint integer
end

-- Get byte offset of the Nth character
local offset = utf8.offset(text, 3)        -- byte position of 3rd char

-- Safe substring by character index (not bytes)
local function utf8_sub(s, i, j)
    local start_byte = utf8.offset(s, i)
    local end_byte = j and utf8.offset(s, j + 1) - 1 or #s
    return s:sub(start_byte, end_byte)
end
```

### Font Loading for Non-Latin Scripts

LÖVE's default font only covers basic Latin. For CJK, Cyrillic, Arabic, or other scripts, load a TTF/OTF font with the needed glyphs:

```lua
function love.load()
    -- Load a font that covers your target scripts
    -- Noto Sans is a good choice: covers Latin, CJK, Cyrillic, Arabic, etc.
    local font_size = 16
    ui_font = love.graphics.newFont("assets/fonts/NotoSansCJK-Regular.ttc", font_size)

    -- For pixel-art games with localization, use a bitmap font for Latin
    -- and a TTF fallback for other scripts
    pixel_font = love.graphics.newImageFont("assets/fonts/pixel.png",
        " ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,!?")
end

function love.draw()
    love.graphics.setFont(ui_font)
    love.graphics.print("日本語テスト", 10, 10)
end
```

### Right-to-Left (RTL) Text

LÖVE 11.x does not natively handle RTL text layout (Arabic, Hebrew). For RTL support:

1. Reverse the visual character order before passing to `love.graphics.print()`.
2. Right-align the text block.
3. For bidirectional text (mixed LTR/RTL), consider the `luabidi` library or handle runs manually.

```lua
-- Simplified RTL reversal for single-script text
local function reverse_utf8(s)
    local chars = {}
    for _, c in utf8.codes(s) do
        table.insert(chars, 1, utf8.char(c))
    end
    return table.concat(chars)
end
```

**Note:** LÖVE 12 and Defold 1.12 both add improved text shaping. If targeting LÖVE 12, check `love.graphics.newTextBatch` for complex text layout support.

---

## Accessibility Patterns

### Colorblind-Safe Rendering

Approximately 8% of men and 0.5% of women have some form of color vision deficiency. Never rely on color alone to convey information.

```lua
-- Provide shape + color for game elements
-- Instead of "red enemy, green ally", use "red circle enemy, green square ally"

-- Offer a colorblind palette option
local palettes = {
    default = {
        danger  = { 1, 0.2, 0.2 },     -- red
        safe    = { 0.2, 0.8, 0.2 },    -- green
        warning = { 1, 0.8, 0 },        -- yellow
    },
    deuteranopia = {
        danger  = { 0.9, 0.5, 0 },      -- orange
        safe    = { 0, 0.5, 0.8 },      -- blue
        warning = { 1, 1, 0.3 },        -- bright yellow
    },
    high_contrast = {
        danger  = { 1, 1, 1 },          -- white
        safe    = { 0, 0, 0 },          -- black
        warning = { 1, 1, 0 },          -- yellow
    },
}

local current_palette = palettes.default

function set_palette(name)
    current_palette = palettes[name] or palettes.default
end
```

### Shader-Based Colorblind Simulation

Use a post-processing shader to simulate different types of color vision deficiency during development:

```lua
local daltonize_shader = love.graphics.newShader([[
    // Daltonization shader — simulates deuteranopia (green-weak)
    // Use during development to verify your game reads without full color.
    uniform float intensity;  // 0.0 = normal, 1.0 = full simulation

    vec4 effect(vec4 color, Image tex, vec2 tc, vec2 sc) {
        vec4 c = Texel(tex, tc) * color;
        float L = 0.31399022 * c.r + 0.63951294 * c.g + 0.04649755 * c.b;
        float M = 0.15537241 * c.r + 0.75789446 * c.g + 0.08670142 * c.b;
        float S = 0.01775239 * c.r + 0.10944209 * c.g + 0.87256922 * c.b;

        float sim_L = 1.0 * L + 0.0 * M + 0.0 * S;
        float sim_M = 0.494207 * L + 0.0 * M + 1.24827 * S;
        float sim_S = 0.0 * L + 0.0 * M + 1.0 * S;

        vec3 sim;
        sim.r =  5.47221206 * sim_L - 4.6419601  * sim_M + 0.16963708 * sim_S;
        sim.g = -1.1252419  * sim_L + 2.29317094 * sim_M - 0.1678952  * sim_S;
        sim.b =  0.02980165 * sim_L - 0.19318073 * sim_M + 1.16364789 * sim_S;

        c.rgb = mix(c.rgb, sim, intensity);
        return c;
    }
]])
```

### Scalable UI and Text Size

Let players adjust text size independently of the game resolution:

```lua
local text_scale = 1.0  -- user preference: 0.75 to 2.0

function draw_ui_text(text, x, y)
    love.graphics.push()
    love.graphics.scale(text_scale, text_scale)
    love.graphics.print(text, x / text_scale, y / text_scale)
    love.graphics.pop()
end

-- Or reload fonts at a different size when the setting changes
function apply_text_scale(scale)
    text_scale = scale
    ui_font = love.graphics.newFont("assets/fonts/NotoSans-Regular.ttf",
        math.floor(16 * text_scale))
end
```

### Input Remapping

Allow players to rebind controls. Store bindings as a table that maps actions to keys:

```lua
local default_bindings = {
    move_left  = "a",
    move_right = "d",
    jump       = "space",
    interact   = "e",
    pause      = "escape",
}

local bindings = {}
for k, v in pairs(default_bindings) do bindings[k] = v end

-- Check action, not raw key
function is_action_down(action)
    return love.keyboard.isDown(bindings[action])
end

-- Rebind: wait for next keypress
local rebinding_action = nil

function start_rebind(action)
    rebinding_action = action
end

function love.keypressed(key)
    if rebinding_action then
        bindings[rebinding_action] = key
        rebinding_action = nil
        save_bindings()  -- persist to love.filesystem
        return
    end
    -- normal input handling...
end
```

### Screen Shake and Motion Sensitivity

Provide an option to reduce or disable screen shake and camera effects:

```lua
local reduce_motion = false  -- user preference

function apply_screen_shake(intensity, duration)
    if reduce_motion then return end
    -- normal screen shake logic
    shake_timer = duration
    shake_intensity = intensity
end
```

---

## Putting It Together: Accessible Game Template

```lua
local locale = require("src.utils.locale")

function love.load()
    -- Load user preferences (language, palette, text scale, bindings)
    local prefs = load_preferences()

    locale.load(prefs.language or "en")
    set_palette(prefs.palette or "default")
    apply_text_scale(prefs.text_scale or 1.0)
    reduce_motion = prefs.reduce_motion or false

    -- Apply saved key bindings
    if prefs.bindings then
        for k, v in pairs(prefs.bindings) do
            bindings[k] = v
        end
    end
end
```

---

## Checklist

- [ ] All player-facing strings use locale keys, not hardcoded text
- [ ] Fonts cover all target scripts (Latin, CJK, Cyrillic, etc.)
- [ ] UTF-8 string operations use `utf8.len` / `utf8.offset`, not `string.len`
- [ ] Color is never the sole indicator of game state
- [ ] Text size is adjustable
- [ ] Controls are remappable and saved to disk
- [ ] Screen shake / camera effects can be reduced or disabled
- [ ] UI layout accommodates longer translated strings (German, Finnish)
- [ ] System locale is detected on startup with a manual override in settings
