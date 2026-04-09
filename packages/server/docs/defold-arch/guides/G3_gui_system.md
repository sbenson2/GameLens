# G3 — GUI System

> **Category:** guide · **Engine:** Defold · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Message Passing](G1_message_passing.md) · [G2 Game Objects & Collections](G2_game_objects_and_collections.md)

---

## Overview

Defold's GUI system is a dedicated layer for building menus, HUDs, dialogs, and any screen-space UI. It is **separate from the game world** — GUI nodes live in their own coordinate space, render on top of the game scene (by default), and are controlled by `.gui_script` files rather than regular `.script` files.

Key architectural points:
- GUI scenes are `.gui` files edited in the Defold editor
- GUI logic lives in `.gui_script` files (a distinct script type)
- Nodes are addressed by string ID, not URL — use `gui.get_node("id")`, not `msg.url()`
- GUI coordinates are screen-relative, not world-relative
- The GUI system has its own node types, animation API, and input handling

---

## Node Types

GUI scenes are built from several node types, each serving a different visual role:

| Node Type | Description | Typical Use |
|-----------|-------------|-------------|
| **Box** | Rectangle with color, texture, or flip-book animation | Buttons, panels, health bars, icons |
| **Text** | Renders a text string with a font resource | Labels, scores, dialog text |
| **Pie** | Circle or arc, optionally filled or inverted | Radial timers, pie charts, circular progress |
| **ParticleFX** | Plays a particle effect in GUI space | Hit effects, sparkles on UI elements |
| **Template** | Instance of another `.gui` scene | Reusable components (button prefab, list item) |

All nodes share common properties: position, size, rotation, scale, color (including alpha), and a unique string ID.

---

## GUI Script Lifecycle

A `.gui_script` has the same lifecycle callbacks as a regular script, but operates in the GUI context:

```lua
function init(self)
    -- Called when the GUI component is initialized
    -- Good place to: cache node references, set initial state, acquire input
    msg.post(".", "acquire_input_focus")

    self.button = gui.get_node("play_button")
    self.score_text = gui.get_node("score_label")
end

function final(self)
    -- Called when the GUI component is destroyed
    msg.post(".", "release_input_focus")
end

function update(self, dt)
    -- Called every frame — use for continuous UI updates
    -- Most GUI work is event-driven, so this is often empty
end

function on_message(self, message_id, message, sender)
    -- Receive messages from game scripts
    if message_id == hash("update_score") then
        gui.set_text(self.score_text, tostring(message.score))
    end
end

function on_input(self, action_id, action)
    -- Handle input (only if input focus is acquired)
    if action_id == hash("touch") and action.pressed then
        if gui.pick_node(self.button, action.x, action.y) then
            -- Button was tapped!
            on_button_pressed(self)
        end
    end
    return false  -- return true to consume the input
end

function on_reload(self)
    -- Called on hot reload in the editor (development only)
end
```

---

## Working with Nodes

### Getting and Manipulating Nodes

```lua
-- Get a reference to a node by its editor ID
local node = gui.get_node("health_bar")

-- Position (screen coordinates)
local pos = gui.get_position(node)          -- returns vmath.vector3
gui.set_position(node, vmath.vector3(100, 200, 0))

-- Size
local size = gui.get_size(node)
gui.set_size(node, vmath.vector3(300, 50, 0))

-- Scale
gui.set_scale(node, vmath.vector3(2, 2, 1))

-- Rotation (Euler degrees around Z for 2D)
gui.set_rotation(node, vmath.vector3(0, 0, 45))

-- Color (including alpha)
gui.set_color(node, vmath.vector4(1, 0, 0, 1))      -- red, fully opaque
gui.set_color(node, vmath.vector4(1, 1, 1, 0.5))    -- white, 50% transparent

-- Visibility
gui.set_enabled(node, false)  -- hide without destroying
local visible = gui.is_enabled(node)

-- Text (text nodes only)
gui.set_text(node, "Score: 1500")
local text = gui.get_text(node)

-- Texture / flipbook (box nodes)
gui.set_texture(node, "my_atlas")
gui.play_flipbook(node, hash("walk_animation"))
```

### Dynamic Node Creation

```lua
-- Create a node at runtime
local new_node = gui.new_box_node(vmath.vector3(200, 100, 0), vmath.vector3(50, 50, 0))
gui.set_id(new_node, "dynamic_box")
gui.set_texture(new_node, "gui_atlas")

local text_node = gui.new_text_node(vmath.vector3(200, 100, 0), "Hello")
gui.set_font(text_node, "main_font")

-- Delete a dynamically created node
gui.delete_node(new_node)

-- Important: only delete nodes you created with gui.new_*_node().
-- Deleting editor-placed nodes can cause errors.
```

---

## Node Hierarchies and Parenting

Nodes can be parented to create hierarchies. Child nodes inherit transforms from their parent.

```lua
local panel = gui.get_node("panel")
local label = gui.get_node("panel_label")

-- Set parent (child position becomes relative to parent)
gui.set_parent(label, panel)

-- Move panel — label moves with it
gui.set_position(panel, vmath.vector3(400, 300, 0))

-- Unparent
gui.set_parent(label, nil)  -- label is now at root level
```

**Z-ordering:** Nodes render in tree order (depth-first). Siblings render in the order they appear in the editor's outline. Use layers for more control over render order.

---

## Input Handling and Hit Testing

### Pick Node (Hit Testing)

`gui.pick_node()` tests if a screen coordinate falls within a node's bounding box, accounting for the node's transform, scale, and parent hierarchy:

```lua
function on_input(self, action_id, action)
    if action_id == hash("touch") and action.pressed then
        -- Simple button check
        if gui.pick_node(self.start_button, action.x, action.y) then
            start_game()
            return true  -- consume input
        end
    end
    return false
end
```

### Multi-Touch

For mobile, each touch point arrives separately:

```lua
function on_input(self, action_id, action)
    if action_id == hash("touch") then
        if action.pressed then
            -- Check all active touches
            for _, touch in ipairs(action.touch or {}) do
                if gui.pick_node(self.button, touch.x, touch.y) then
                    handle_button_press(touch.id)
                end
            end
        end
    end
    return false
end
```

### Button Pattern

A complete button with press/release visual feedback:

```lua
function init(self)
    msg.post(".", "acquire_input_focus")
    self.btn = gui.get_node("my_button")
    self.btn_pressed = false
end

function on_input(self, action_id, action)
    if action_id == hash("touch") then
        local over = gui.pick_node(self.btn, action.x, action.y)

        if action.pressed and over then
            self.btn_pressed = true
            gui.set_scale(self.btn, vmath.vector3(0.95, 0.95, 1))  -- press effect
        elseif action.released then
            gui.set_scale(self.btn, vmath.vector3(1, 1, 1))        -- release
            if self.btn_pressed and over then
                -- Confirmed tap (pressed AND released on the button)
                msg.post("/game#script", hash("start_level"))
            end
            self.btn_pressed = false
        end
    end
    return false
end
```

---

## GUI Animations

Defold provides a powerful tweening API for GUI nodes via `gui.animate()`. Any numeric node property can be animated.

### Animatable Properties

| Property | Type | Description |
|----------|------|-------------|
| `gui.PROP_POSITION` | vector3 | Node position |
| `gui.PROP_ROTATION` | vector3 | Euler rotation |
| `gui.PROP_SCALE` | vector3 | Node scale |
| `gui.PROP_COLOR` | vector4 | Color + alpha |
| `gui.PROP_SIZE` | vector3 | Node size |
| `gui.PROP_OUTLINE` | vector4 | Text outline color |
| `gui.PROP_SHADOW` | vector4 | Text shadow color |
| `gui.PROP_SLICE9` | vector4 | 9-slice insets |

You can also animate sub-components using strings like `"position.x"`, `"color.w"` (alpha), etc.

### Animation API

```lua
-- Basic animation
gui.animate(node, gui.PROP_POSITION, vmath.vector3(400, 300, 0),
    gui.EASING_OUTCUBIC,   -- easing function
    0.5,                    -- duration in seconds
    0,                      -- delay
    callback_fn,            -- optional completion callback
    gui.PLAYBACK_ONCE_FORWARD  -- playback mode
)

-- Fade out (animate alpha only)
gui.animate(node, "color.w", 0,
    gui.EASING_INOUTQUAD, 0.3)

-- Scale bounce
gui.animate(node, gui.PROP_SCALE, vmath.vector3(1.2, 1.2, 1),
    gui.EASING_OUTBACK, 0.15, 0, function()
        gui.animate(node, gui.PROP_SCALE, vmath.vector3(1, 1, 1),
            gui.EASING_INBACK, 0.15)
    end)

-- Looping pulse (ping-pong)
gui.animate(node, gui.PROP_COLOR, vmath.vector4(1, 1, 0, 1),
    gui.EASING_INOUTSINE, 0.8, 0, nil,
    gui.PLAYBACK_LOOP_PINGPONG)

-- Cancel animations
gui.cancel_animation(node, gui.PROP_POSITION)
```

### Playback Modes

| Mode | Behavior |
|------|----------|
| `gui.PLAYBACK_ONCE_FORWARD` | Play once, then stop |
| `gui.PLAYBACK_ONCE_BACKWARD` | Play reversed once |
| `gui.PLAYBACK_ONCE_PINGPONG` | Forward then backward once |
| `gui.PLAYBACK_LOOP_FORWARD` | Loop forward continuously |
| `gui.PLAYBACK_LOOP_BACKWARD` | Loop backward continuously |
| `gui.PLAYBACK_LOOP_PINGPONG` | Loop back and forth |

### Easing Functions

Defold includes standard easing curves: `LINEAR`, `INSINE`, `OUTSINE`, `INOUTSINE`, `INQUAD`, `OUTQUAD`, `INOUTQUAD`, `INCUBIC`, `OUTCUBIC`, `INOUTCUBIC`, `INEXPO`, `OUTEXPO`, `INOUTEXPO`, `INBACK`, `OUTBACK`, `INOUTBACK`, `INELASTIC`, `OUTELASTIC`, `INOUTELASTIC`, `INBOUNCE`, `OUTBOUNCE`, `INOUTBOUNCE`.

---

## Clipping (Stencil Masks)

Clipping restricts child nodes to render only within their parent's bounds. This is essential for scroll views, health bars, and reveal effects.

### Setting Up Clipping

In the editor, set a node's **Clipping Mode** to one of:

| Mode | Description |
|------|-------------|
| `None` | No clipping (default) |
| `Stencil` | Node writes to the stencil buffer; children only render inside |

```
-- Editor setup:
-- 1. Select a Box node (the mask shape)
-- 2. Set Clipping Mode = Stencil
-- 3. Set Clipping Visible = false (to hide the mask node itself)
-- 4. Add child nodes — they will be clipped to the mask bounds

-- Runtime: no special code needed, clipping is automatic
-- Just parent nodes under the clipping node
```

### Inverted Clipping

Set **Clipping Inverted** to `true` to render children *outside* the mask instead of inside. Useful for spotlight/cutout effects.

### Limitations

- Maximum **256** stencil clippers per GUI scene
- Maximum **8 levels** of nested stencil clipping
- Clipping is rectangular (based on the node's bounding box) or shape-based (pie nodes)

---

## Templates (Reusable Components)

Templates let you reuse a `.gui` scene as a component inside another `.gui` scene. This is Defold's answer to UI component composition.

### Creating a Template

1. Build a `.gui` scene (e.g., `button.gui`) with its own nodes and layout
2. In another `.gui` scene, add a **Template** node and point it at `button.gui`
3. The template instance gets a prefix ID (e.g., `"button_1"`)

### Accessing Template Nodes from Script

Template nodes are prefixed with the instance ID:

```lua
function init(self)
    -- If the template instance is named "play_btn" and the internal
    -- button node is "bg", the full ID is "play_btn/bg"
    self.play_bg = gui.get_node("play_btn/bg")
    self.play_label = gui.get_node("play_btn/label")
end

function on_input(self, action_id, action)
    if action_id == hash("touch") and action.pressed then
        if gui.pick_node(self.play_bg, action.x, action.y) then
            -- Play button pressed
        end
    end
    return false
end
```

### Overriding Template Properties

You can override certain properties of template nodes in the editor (position, size, text, texture) without modifying the source template. This allows the same button template to show different labels in different contexts.

---

## Layouts (Multi-Resolution Support)

Layouts let you define alternative node positions and sizes for different screen aspects or orientations. Defold picks the best matching layout at runtime.

### Setup

1. Add layout files (e.g., `landscape.gui`, `portrait.gui`) in the GUI scene
2. In each layout, reposition and resize nodes as needed
3. Defold automatically selects the closest matching layout based on the display dimensions

```lua
-- Runtime layout info
local current_layout = gui.get_layout()

-- You generally don't need to manage layouts in code —
-- the engine handles selection automatically
```

---

## Communicating Between GUI and Game

GUI scripts and game object scripts live in different worlds. They communicate via message passing:

```lua
-- From game script → GUI script
-- (the GUI component is on the same game object)
msg.post("#gui", hash("show_damage"), { amount = 50 })

-- From GUI script → game script
msg.post("/game_manager#script", hash("start_game"), { level = 1 })

-- Inside the GUI script:
function on_message(self, message_id, message, sender)
    if message_id == hash("show_damage") then
        local dmg_text = gui.get_node("damage_text")
        gui.set_text(dmg_text, "-" .. message.amount)
        -- Animate it floating up and fading out
        gui.animate(dmg_text, "position.y",
            gui.get_position(dmg_text).y + 50,
            gui.EASING_OUTQUAD, 0.8)
        gui.animate(dmg_text, "color.w", 0,
            gui.EASING_OUTQUAD, 0.8)
    end
end
```

---

## Common Patterns

### Screen Transitions

```lua
-- Fade overlay (a full-screen black box node)
function fade_in(self, callback)
    local overlay = gui.get_node("fade_overlay")
    gui.set_enabled(overlay, true)
    gui.set_color(overlay, vmath.vector4(0, 0, 0, 0))
    gui.animate(overlay, "color.w", 1, gui.EASING_LINEAR, 0.5, 0, callback)
end

function fade_out(self)
    local overlay = gui.get_node("fade_overlay")
    gui.animate(overlay, "color.w", 0, gui.EASING_LINEAR, 0.5, 0, function()
        gui.set_enabled(overlay, false)
    end)
end
```

### Health Bar

```lua
function update_health_bar(self, current, max)
    local bar = gui.get_node("health_fill")
    local ratio = current / max
    local size = gui.get_size(bar)
    -- Animate width change for smooth health transitions
    gui.animate(bar, gui.PROP_SIZE,
        vmath.vector3(self.max_bar_width * ratio, size.y, 0),
        gui.EASING_OUTQUAD, 0.3)

    -- Color shift: green → yellow → red
    local color
    if ratio > 0.5 then
        color = vmath.vector4(0, 1, 0, 1)   -- green
    elseif ratio > 0.25 then
        color = vmath.vector4(1, 1, 0, 1)   -- yellow
    else
        color = vmath.vector4(1, 0, 0, 1)   -- red
    end
    gui.animate(bar, gui.PROP_COLOR, color, gui.EASING_LINEAR, 0.2)
end
```

---

## Common Pitfalls

1. **Using `go.*` in GUI scripts** — GUI scripts use the `gui.*` namespace. `go.get_position()` won't work; use `gui.get_position()`.
2. **Forgetting template prefixes** — nodes inside templates must be addressed as `"instance_id/node_id"`.
3. **Not acquiring input focus** — `on_input` won't fire unless you `msg.post(".", "acquire_input_focus")` in `init`.
4. **Assuming screen coordinates = world coordinates** — GUI is in screen space. Convert world positions if needed using the camera projection.
5. **Exceeding stencil limits** — 256 clippers max, 8 nesting levels. Plan complex UIs around these constraints.
6. **Animating deleted nodes** — cancel animations before deleting dynamic nodes to avoid errors.
7. **Heavy update() in GUI scripts** — prefer event-driven updates via `on_message` over polling in `update`.
