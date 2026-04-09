# G9 — Render Pipeline & Materials

> **Category:** guide · **Engine:** Defold · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G2 Game Objects & Collections](G2_game_objects_and_collections.md) · [R1 API Reference](../reference/R1_api_reference.md)

---

## How Rendering Works in Defold

Defold's render pipeline is fully scriptable through a **render script** — a Lua file that controls exactly what gets drawn, in what order, and with what projection. Unlike engines with a fixed pipeline and post-processing stacks, Defold gives you a single script where you call the rendering API directly.

Every Defold project has a `.render` file (referenced in `game.project`) that points to a `.render_script`. The default render script handles 2D sprites, tilemaps, particles, GUI, and text. You customize rendering by editing this script — not by toggling engine settings.

---

## The Render Script Lifecycle

A render script has three callbacks:

```lua
function init(self)
    -- Called once. Create predicates, set up state.
end

function update(self)
    -- Called every frame. This IS your render loop.
    -- Clear screen, set projection, draw predicates.
end

function on_message(self, message_id, message)
    -- Receive messages from game scripts (e.g., camera position).
end
```

The `update()` function is where all drawing happens. You control the clear color, projection matrix, view matrix, and draw order.

---

## Render Predicates

A **predicate** is a filter that selects which objects to draw based on **material tags**. Every material in Defold has one or more tags. The render script creates predicates that match those tags, then draws them in the desired order.

```lua
function init(self)
    -- Match all materials tagged "tile" — sprites, tilemaps, spine
    self.tile_pred = render.predicate({ "tile" })

    -- Match GUI materials
    self.gui_pred = render.predicate({ "gui" })

    -- Match particle effects
    self.particle_pred = render.predicate({ "particle" })

    -- Match debug text/shapes
    self.text_pred = render.predicate({ "text" })

    -- Custom: match a material you tagged "water"
    self.water_pred = render.predicate({ "water" })
end
```

### Default Material Tags

| Tag | Used By |
|-----|---------|
| `tile` | Sprites, tilemaps, spine models |
| `gui` | GUI nodes |
| `particle` | Particle effects |
| `text` | Label components |
| `model` | 3D models |

---

## The Default Render Loop

Here is a simplified version of Defold's built-in render script, annotated:

```lua
function update(self)
    -- 1. Clear the screen
    render.set_depth_mask(true)
    render.set_stencil_mask(0xff)
    render.clear({
        [render.BUFFER_COLOR_BIT] = self.clear_color,
        [render.BUFFER_DEPTH_BIT] = 1,
        [render.BUFFER_STENCIL_BIT] = 0
    })

    -- 2. Set up 2D projection (orthographic)
    local w = render.get_window_width()
    local h = render.get_window_height()
    render.set_viewport(0, 0, w, h)

    render.set_view(self.view)  -- identity or camera view matrix
    render.set_projection(vmath.matrix4_orthographic(
        0, render.get_width(),
        0, render.get_height(),
        -1, 1
    ))

    -- 3. Draw game world (sprites, tilemaps, particles)
    render.set_depth_mask(false)
    render.disable_state(render.STATE_DEPTH_TEST)
    render.enable_state(render.STATE_BLEND)
    render.set_blend_func(render.BLEND_SRC_ALPHA, render.BLEND_ONE_MINUS_SRC_ALPHA)

    render.draw(self.tile_pred)
    render.draw(self.particle_pred)

    -- 4. Draw debug text
    render.draw_debug3d()
    render.draw(self.text_pred)

    -- 5. Switch to screen-space projection for GUI
    render.set_view(vmath.matrix4())
    render.set_projection(vmath.matrix4_orthographic(
        0, render.get_window_width(),
        0, render.get_window_height(),
        -1, 1
    ))

    render.enable_state(render.STATE_STENCIL_TEST)
    render.draw(self.gui_pred)
    render.disable_state(render.STATE_STENCIL_TEST)
end
```

### Key Observations

The render script draws predicates in an explicit order — there is no automatic sorting by z-index across predicate groups. Within a single `render.draw()` call, objects sort by their z-position. To draw water effects between the background and foreground, give the water material a unique tag and draw `self.water_pred` between two tile predicates (split by z-range or by material tags).

---

## Materials

A **material** defines which shader program a component uses and what tags it carries for predicate matching. Every visual component (sprite, tilemap, GUI node, model) has a material assigned.

### Material Properties

| Property | Purpose |
|----------|---------|
| **Vertex Program** | `.vp` file — vertex shader (GLSL-like, Defold dialect) |
| **Fragment Program** | `.fp` file — fragment shader |
| **Tags** | Strings that predicates match against |
| **Vertex Constants** | Named uniforms passed to vertex shader |
| **Fragment Constants** | Named uniforms passed to fragment shader |
| **Samplers** | Texture sampler configurations |

### Creating a Custom Material

1. Right-click in the editor → **New → Material**
2. Assign vertex and fragment programs
3. Add tags (e.g., `water`) for predicate matching
4. Set constant definitions (e.g., `tint` as a `vec4`)
5. Assign the material to a component's `material` property

### Setting Constants from Scripts

You can change material constants at runtime from game object scripts:

```lua
-- Set a tint color on this sprite's material
go.set("#sprite", "tint", vmath.vector4(1, 0, 0, 1))

-- Reset to the default value defined in the material
go.reset_constant("#sprite", "tint")
```

### Overriding Constants in the Render Script

For global effects (like a flash that affects all sprites), create a constant buffer in the render script:

```lua
function update(self)
    -- Create a constants buffer with a custom value
    local constants = render.constant_buffer()
    constants.tint = vmath.vector4(1, 0.5, 0.5, 1)

    -- Draw with the override — all objects in this predicate get the tint
    render.draw(self.tile_pred, { constants = constants })
end
```

---

## Custom Shaders

Defold uses a GLSL-like shading language. Vertex programs (`.vp`) and fragment programs (`.fp`) are separate files.

### Minimal Vertex Shader (sprite.vp)

```glsl
// Standard Defold vertex attributes
attribute mediump vec4 position;
attribute mediump vec2 texcoord0;

// Defold provides these automatically
uniform mediump mat4 view_proj;

varying mediump vec2 var_texcoord0;

void main()
{
    gl_Position = view_proj * vec4(position.xyz, 1.0);
    var_texcoord0 = texcoord0;
}
```

### Minimal Fragment Shader (sprite.fp)

```glsl
varying mediump vec2 var_texcoord0;

uniform lowp sampler2D texture_sampler;
uniform lowp vec4 tint;

void main()
{
    lowp vec4 color = texture2D(texture_sampler, var_texcoord0.xy);
    gl_FragColor = color * tint;
}
```

### Shader Constants

Constants defined in the material editor become `uniform` variables in the shader. Defold supports `float`, `vec2`, `vec3`, `vec4`, and `mat4` types for constants.

Built-in constants (provided automatically):

| Constant | Type | Description |
|----------|------|-------------|
| `view_proj` | `mat4` | Combined view × projection matrix |
| `world` | `mat4` | World transform of the component |
| `texture_size_anim` | `vec4` | x/y = inverse texture size, z/w = animation UV offset |

---

## Render Targets (Off-Screen Rendering)

Render targets let you draw to a texture instead of the screen — essential for post-processing, minimaps, and reflections.

```lua
function init(self)
    -- Create a color buffer
    local color_params = {
        format = render.FORMAT_RGBA,
        width = render.get_width(),
        height = render.get_height()
    }

    -- Create the render target
    self.rt = render.render_target("my_target", {
        [render.BUFFER_COLOR_BIT] = color_params
    })
end

function update(self)
    -- Draw the scene to the render target
    render.set_render_target(self.rt)
    render.clear({ [render.BUFFER_COLOR_BIT] = self.clear_color })
    render.set_viewport(0, 0, render.get_width(), render.get_height())
    render.set_projection(vmath.matrix4_orthographic(
        0, render.get_width(), 0, render.get_height(), -1, 1
    ))
    render.draw(self.tile_pred)
    render.set_render_target(render.RENDER_TARGET_DEFAULT)

    -- Now draw the render target texture to screen using a post-process material
    render.enable_material("postprocess")
    render.draw(self.postprocess_pred)
    render.disable_material()
end
```

---

## Camera Integration

Defold's built-in camera component sends `set_view_projection` messages to the render script. Handle them in `on_message`:

```lua
function on_message(self, message_id, message)
    if message_id == hash("clear_color") then
        self.clear_color = message.color

    elseif message_id == hash("set_view_projection") then
        -- Sent by camera component
        self.view = message.view
        self.projection = message.projection

    elseif message_id == hash("window_resized") then
        -- Handle resolution changes
    end
end
```

Then use `self.view` and `self.projection` in `update()` instead of building them manually. This pattern integrates cleanly with Defold's camera component or third-party camera libraries like **Rendy** or **Orthographic**.

---

## Recent Updates (2025–2026)

Defold's rendering architecture has continued evolving:

- **Shader pipeline refactor:** Defold now uses a single combined shader resource per program. Multiple materials can share the same underlying program, reducing GPU memory usage.
- **WebGPU support (experimental):** HTML5 builds can now optionally use WebGPU instead of WebGL, providing better GPU utilization and modern graphics API access.
- **Improved 3D support:** Better GPU utilization for 3D rendering workloads, including improved depth buffer handling and multi-pass rendering.

---

## Common Pitfalls

| Problem | Cause | Fix |
|---------|-------|-----|
| Objects invisible | Material tag doesn't match any predicate | Check the material's tags match a predicate in your render script |
| Draw order wrong | Predicates drawn in wrong sequence | Reorder `render.draw()` calls in `update()` |
| Custom shader has no effect | Material not assigned to the component | Set the `material` property on the sprite/model in the editor |
| GUI renders behind game world | GUI predicate drawn before tile predicate | Draw `self.gui_pred` last in `update()` |
| Post-process not working | Render target not created or not bound | Verify `render.set_render_target()` is called before drawing |
| Constants not updating | Using `go.set` on wrong component | Address must include fragment: `"#sprite"`, not `"/player"` |
