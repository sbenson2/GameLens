# G19 — Accessibility and Localization

> **Category:** guide · **Engine:** Defold · **Related:** [G3 GUI System](G3_gui_system.md) · [G5 Input & Properties](G5_input_and_properties.md) · [G7 Animation & Audio](G7_animation_and_audio.md) · [R2 Community Libraries](../reference/R2_community_libraries.md)

---

## Overview

Shipping a game to a global audience requires localization (translating text, adapting layout) and accessibility (making the game playable by people with diverse abilities). Defold provides the building blocks — runtime fonts, GUI text nodes, input rebinding, and message passing — but doesn't include a localization framework out of the box. This guide covers how to set up a localization pipeline, handle right-to-left text, switch fonts at runtime, and implement common accessibility features using Defold's native systems and community libraries.

---

## Localization Architecture

### Choosing a Library

Defold's community offers several localization libraries:

| Library | Approach | Best For |
|---------|----------|----------|
| **DefGlot** | Key-value JSON files per language | Simple games, straightforward string lookup |
| **i18n-Defold** | ICU-style with plurals, interpolation | Games with complex grammar (plurals, gendered text) |
| **Defold Lang** | CSV/Google Sheets pipeline | Teams using spreadsheets for translator collaboration |
| **Manual** | Lua tables + custom loader | Full control, no dependencies |

### Manual Localization System

For full control, build a simple key-based system:

```lua
-- localization.lua
local M = {}

local current_locale = "en"
local strings = {}

--- Load a locale JSON file from /locales/<locale>.json
function M.load(locale)
    local path = "/locales/" .. locale .. ".json"
    local raw = sys.load_resource(path)
    if not raw then
        print("Locale not found: " .. locale .. ", falling back to en")
        raw = sys.load_resource("/locales/en.json")
    end
    strings = json.decode(raw)
    current_locale = locale
end

--- Look up a localized string by key.
-- Supports simple placeholder substitution: {name} → values.name
function M.get(key, values)
    local text = strings[key]
    if not text then
        print("[i18n] Missing key: " .. key .. " (" .. current_locale .. ")")
        return "[" .. key .. "]"
    end
    if values then
        for k, v in pairs(values) do
            text = text:gsub("{" .. k .. "}", tostring(v))
        end
    end
    return text
end

function M.get_locale()
    return current_locale
end

return M
```

### Locale File Structure

```json
// locales/en.json
{
    "menu.play": "Play",
    "menu.settings": "Settings",
    "hud.health": "Health: {current}/{max}",
    "dialog.greeting": "Welcome, {name}!",
    "shop.item_count_one": "{count} item",
    "shop.item_count_other": "{count} items"
}
```

```json
// locales/ja.json
{
    "menu.play": "プレイ",
    "menu.settings": "設定",
    "hud.health": "体力: {current}/{max}",
    "dialog.greeting": "ようこそ、{name}さん！",
    "shop.item_count_other": "{count}個のアイテム"
}
```

### Pluralization

Different languages have different plural rules. English has two forms (1 = singular, everything else = plural). Russian has three. Arabic has six. A production system needs plural category support:

```lua
-- Simple English/Japanese plural resolver
-- For production, use i18n-Defold which handles CLDR plural rules
local function plural_key(key, count, locale)
    if locale == "ja" or locale == "zh" or locale == "ko" then
        -- CJK languages: no singular/plural distinction
        return key .. "_other"
    end
    if count == 1 then
        return key .. "_one"
    end
    return key .. "_other"
end

-- Usage
local key = plural_key("shop.item_count", item_count, i18n.get_locale())
local text = i18n.get(key, { count = item_count })
```

---

## Applying Localized Text to GUI

### Updating GUI Nodes

Use message passing to update GUI text when locale changes:

```lua
-- menu.gui_script
local i18n = require "localization"

function init(self)
    update_texts(self)
end

function on_message(self, message_id, message)
    if message_id == hash("locale_changed") then
        update_texts(self)
    end
end

local function update_texts(self)
    gui.set_text(gui.get_node("play_btn/text"), i18n.get("menu.play"))
    gui.set_text(gui.get_node("settings_btn/text"), i18n.get("menu.settings"))
end
```

### Broadcasting Locale Changes

```lua
-- When the player switches language in settings:
function on_language_selected(self, locale)
    i18n.load(locale)
    -- Broadcast to all GUI scripts
    msg.post("/menu#gui", "locale_changed")
    msg.post("/hud#gui", "locale_changed")
    msg.post("/dialog#gui", "locale_changed")
end
```

---

## Right-to-Left (RTL) Text

Defold supports RTL text rendering through its runtime font system, which uses HarfBuzz for text shaping and SheenBidi / SkriBidi for bidirectional layout.

### Font Collections for Multi-Language Support

Use font collections to combine fonts for different scripts without loading all glyph ranges into a single atlas:

1. In the Defold editor, create a `.font` resource.
2. Set the type to **Runtime** (not Bitmap or Distance Field).
3. Under **Font Collections**, add multiple `.ttf` files — one per script (Latin, Arabic, CJK, etc.).
4. The engine selects the correct font file at runtime based on which glyphs are needed.

### Runtime Font Approach

```lua
-- Preload glyphs for the target language to avoid first-frame stutter
local function prewarm_font(font_node, text)
    -- Setting text triggers glyph rasterization
    gui.set_text(font_node, text)
end
```

### RTL Layout Considerations

When switching to an RTL locale:

```lua
function apply_rtl_layout(self)
    local is_rtl = (i18n.get_locale() == "ar" or i18n.get_locale() == "he")

    if is_rtl then
        -- Mirror horizontal alignment of text nodes
        gui.set_pivot(gui.get_node("label"), gui.PIVOT_NE)
        -- Flip horizontal position of UI elements
        local pos = gui.get_position(gui.get_node("icon"))
        pos.x = -pos.x
        gui.set_position(gui.get_node("icon"), pos)
    else
        gui.set_pivot(gui.get_node("label"), gui.PIVOT_NW)
    end
end
```

For full RTL support you typically need a dedicated RTL GUI layout or use Defold's GUI layouts feature to switch between LTR and RTL layout variants.

---

## Detecting System Locale

```lua
-- Use sys.get_sys_info() to detect the device language
function init(self)
    local info = sys.get_sys_info()
    local lang = info.language  -- "en", "ja", "ar", etc.
    local territory = info.territory  -- "US", "JP", "SA", etc.

    -- Map to your supported locales
    local supported = { en = true, ja = true, ar = true, pt = true }
    local locale = supported[lang] and lang or "en"

    i18n.load(locale)
end
```

---

## Accessibility Features

### Input Remapping

Allow players to rebind controls. Defold's input system uses `.input_binding` files, but runtime rebinding requires a layer on top:

```lua
-- input_remap.lua
local M = {}

local bindings = {}
local defaults = {
    jump = { key = hash("key_space"), gamepad = hash("gamepad_rdown") },
    attack = { key = hash("key_z"), gamepad = hash("gamepad_rright") },
}

function M.init()
    -- Load saved bindings or use defaults
    local saved = sys.load(sys.get_save_file("game", "bindings"))
    bindings = next(saved) and saved or defaults
end

function M.get_action(action_id)
    for name, mapping in pairs(bindings) do
        if action_id == mapping.key or action_id == mapping.gamepad then
            return name
        end
    end
    return nil
end

function M.rebind(action_name, input_type, new_action_id)
    if bindings[action_name] then
        bindings[action_name][input_type] = new_action_id
        sys.save(sys.get_save_file("game", "bindings"), bindings)
    end
end

return M
```

### Text Scaling

Allow players to increase UI text size:

```lua
-- Scale all text nodes in a GUI by a factor
local function apply_text_scale(scale_factor)
    local nodes = { "label_health", "label_score", "label_dialog" }
    for _, name in ipairs(nodes) do
        local node = gui.get_node(name)
        local base = gui.get_scale(node)
        gui.set_scale(node, vmath.vector3(
            scale_factor, scale_factor, 1
        ))
    end
end

-- Expose via go.property for settings UI
go.property("text_scale", 1.0)

function on_message(self, message_id, message)
    if message_id == hash("set_text_scale") then
        self.text_scale = message.scale
        apply_text_scale(self.text_scale)
    end
end
```

### Colorblind Mode

Use shader-based or palette-swap approaches:

```lua
-- Option 1: Swap palette textures
function set_colorblind_mode(self, mode)
    if mode == "deuteranopia" then
        go.set("#sprite", "texture0", self.palette_deuteranopia)
    elseif mode == "protanopia" then
        go.set("#sprite", "texture0", self.palette_protanopia)
    else
        go.set("#sprite", "texture0", self.palette_normal)
    end
end

-- Option 2: Use shapes and patterns, not just color, to convey information
-- This is the most robust approach — don't rely solely on color to
-- distinguish game elements. Add icons, patterns, or labels.
```

### Screen Shake and Flash Controls

Some players are sensitive to screen effects. Always provide toggles:

```lua
go.property("screen_shake_enabled", true)
go.property("flash_effects_enabled", true)

function shake_camera(self, intensity, duration)
    if not self.screen_shake_enabled then return end
    -- ... shake implementation
end

function flash_screen(self, color, duration)
    if not self.flash_effects_enabled then return end
    -- ... flash implementation
end
```

### Subtitle and Audio Description Support

```lua
-- Subtitles for sound effects and music cues
local subtitle_queue = {}

function play_sound_with_subtitle(self, sound_url, subtitle_key)
    msg.post(sound_url, "play_sound")
    if self.subtitles_enabled then
        table.insert(subtitle_queue, {
            text = i18n.get(subtitle_key),
            timer = 3.0
        })
        update_subtitle_display(self)
    end
end
```

---

## Localization Checklist

Before shipping, verify these items for each supported locale:

1. **All strings externalized** — no hardcoded text in scripts or GUI files.
2. **Text overflow tested** — German and Finnish text is often 30-40% longer than English. Test every UI element with the longest locale.
3. **Font coverage** — ensure your font files include all required glyphs (CJK needs thousands).
4. **Number and date formatting** — use locale-appropriate separators (1,000 vs 1.000).
5. **Images with text** — replace or overlay; don't bake text into sprites.
6. **RTL layout** — if supporting Arabic or Hebrew, test full UI flow in mirrored layout.
7. **Pluralization** — verify plural forms for each locale (English: 2 forms, Russian: 3, Arabic: 6).
8. **Controller prompts** — show the correct button icons for the active input device.

---

## Summary

Defold's component architecture and message passing make localization natural — load strings, broadcast a `locale_changed` message, and let each GUI script update itself. For accessibility, the key principle is to never rely on a single sensory channel: don't use color alone, provide text alternatives for audio, and let players control intensity of visual effects. Community libraries like DefGlot and i18n-Defold handle the complexity of plurals and language-specific rules, while Defold's runtime font system with HarfBuzz provides proper text shaping for complex scripts including Arabic and Hebrew.
