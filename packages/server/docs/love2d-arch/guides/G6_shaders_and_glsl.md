# G6 — Shaders & GLSL

> **Category:** guide · **Engine:** Love2D · **Related:** [G2 Graphics & Rendering](G2_graphics_and_rendering.md) · [R1 Module Reference](../reference/R1_module_reference.md)

---

## How Shaders Work in LÖVE

LÖVE runs shaders on the GPU using a GLSL-based language with convenience wrappers. Every time you draw something, the GPU runs:

1. **Vertex shader** — transforms each vertex position (4 vertices for a sprite, many more for a Mesh).
2. **Pixel (fragment) shader** — computes the final color of each pixel the shape covers.

If you don't set a shader, LÖVE uses a built-in default that applies the current color and samples the texture. Custom shaders replace one or both stages.

---

## Creating a Shader

```lua
-- Inline pixel shader
local shader = love.graphics.newShader([[
    extern float time;

    vec4 effect(vec4 color, Image texture, vec2 texture_coords, vec2 screen_coords) {
        vec4 pixel = Texel(texture, texture_coords);
        pixel.r = pixel.r * (0.5 + 0.5 * sin(time));
        return pixel * color;
    }
]])
```

Or load from a file:

```lua
local shader = love.graphics.newShader("shaders/glow.glsl")
```

**Key points:**

- `love.graphics.newShader(pixelcode)` — pixel shader only.
- `love.graphics.newShader(pixelcode, vertexcode)` — both stages, in any order.
- LÖVE auto-detects which string is which by looking for the `position` or `effect` function.
- Shader compilation errors surface at creation time — wrap in `pcall` during development.

---

## Entry Point Functions

### Pixel Shader: `effect`

```glsl
vec4 effect(vec4 color, Image texture, vec2 texture_coords, vec2 screen_coords)
```

| Parameter | Description |
|-----------|-------------|
| `color` | The current `love.graphics.setColor()` value, pre-multiplied |
| `texture` | The drawn object's texture (image, canvas, or default white) |
| `texture_coords` | UV coordinates (0–1 range) |
| `screen_coords` | Pixel position on screen |

Return a `vec4(r, g, b, a)`. Use `Texel(texture, texture_coords)` to sample the texture — this is LÖVE's alias for GLSL's `texture2D`.

### Vertex Shader: `position`

```glsl
vec4 position(mat4 transform_projection, vec4 vertex_position)
```

| Parameter | Description |
|-----------|-------------|
| `transform_projection` | Combined transform + projection matrix |
| `vertex_position` | The vertex in local space |

Return the transformed vertex position: `return transform_projection * vertex_position;`

---

## Sending Data to Shaders

Uniforms (`extern` or `uniform` keyword) pass data from Lua to the GPU:

```glsl
extern float time;
extern vec2 resolution;
extern vec4 tint_color;
extern Image noise_texture;
```

```lua
function love.update(dt)
    elapsed = (elapsed or 0) + dt
    shader:send("time", elapsed)
    shader:send("resolution", { love.graphics.getDimensions() })
end

function love.load()
    local noise = love.graphics.newImage("assets/noise.png")
    noise:setWrap("repeat", "repeat")
    shader:send("noise_texture", noise)
end
```

### Type Mapping

| GLSL Type | Lua Value |
|-----------|-----------|
| `float` | number |
| `vec2` | `{x, y}` |
| `vec3` | `{x, y, z}` |
| `vec4` | `{x, y, z, w}` |
| `mat4` | flat table of 16 numbers (column-major) |
| `bool` | boolean |
| `int` | number (truncated) |
| `Image` | Image or Canvas object |
| `ArrayImage` | ArrayImage object |

For color uniforms, use `shader:sendColor("name", {r, g, b, a})` — this converts sRGB to linear if gamma-correct rendering is enabled.

---

## Built-in Shader Variables

LÖVE injects these automatically — do not redeclare them:

| Variable | Type | Description |
|----------|------|-------------|
| `TransformMatrix` | `mat4` | Affected by `love.graphics.translate/rotate/scale` |
| `ProjectionMatrix` | `mat4` | Orthographic projection for the current viewport |
| `TransformProjectionMatrix` | `mat4` | `ProjectionMatrix * TransformMatrix` |
| `love_ScreenSize` | `vec4` | `{width, height, 1/width, 1/height}` of current render target |
| `VaryingTexCoord` | `vec2` | (Varying) texture coordinates passed from vertex to pixel stage |
| `VaryingColor` | `vec4` | (Varying) vertex color passed from vertex to pixel stage |

---

## Applying a Shader

```lua
function love.draw()
    -- Everything between setShader calls uses the shader
    love.graphics.setShader(shader)
    love.graphics.draw(sprite, 100, 100)
    love.graphics.setShader()  -- Reset to default
end
```

---

## Practical Examples

### Grayscale

```glsl
vec4 effect(vec4 color, Image tex, vec2 uv, vec2 sc) {
    vec4 pixel = Texel(tex, uv);
    float gray = dot(pixel.rgb, vec3(0.299, 0.587, 0.114));
    return vec4(vec3(gray), pixel.a) * color;
}
```

### Flash White (Damage Effect)

```glsl
extern float flash;  -- 0.0 = normal, 1.0 = full white

vec4 effect(vec4 color, Image tex, vec2 uv, vec2 sc) {
    vec4 pixel = Texel(tex, uv);
    pixel.rgb = mix(pixel.rgb, vec3(1.0), flash);
    return pixel * color;
}
```

```lua
-- In update: tween flash from 1.0 back to 0.0 over 0.15s
shader:send("flash", math.max(0, flashTimer / 0.15))
```

### CRT Scanlines

```glsl
extern float line_count;  -- e.g. 240.0

vec4 effect(vec4 color, Image tex, vec2 uv, vec2 sc) {
    vec4 pixel = Texel(tex, uv);
    float scanline = sin(sc.y * 3.14159 * line_count / love_ScreenSize.y);
    pixel.rgb *= 0.8 + 0.2 * scanline;
    return pixel * color;
}
```

### Vertex Wobble

```glsl
extern float time;

vec4 position(mat4 transform_projection, vec4 vertex_position) {
    vertex_position.x += sin(vertex_position.y * 0.1 + time * 3.0) * 4.0;
    return transform_projection * vertex_position;
}
```

---

## Using Canvases as Shader Inputs

Post-processing shaders render the entire scene to a Canvas first, then draw that canvas with the shader applied:

```lua
local canvas, postfx

function love.load()
    canvas = love.graphics.newCanvas()
    postfx = love.graphics.newShader("shaders/bloom.glsl")
end

function love.draw()
    -- Pass 1: render scene to canvas
    love.graphics.setCanvas(canvas)
    love.graphics.clear()
    drawGame()
    love.graphics.setCanvas()

    -- Pass 2: draw canvas with post-processing
    love.graphics.setShader(postfx)
    love.graphics.draw(canvas)
    love.graphics.setShader()
end
```

Multi-pass effects (blur, bloom) chain multiple canvases — draw canvas A into canvas B with a horizontal blur shader, then canvas B to screen with a vertical blur shader.

---

## Performance Tips

**Minimize `Shader:send` calls.** Batch sends before drawing, not per-object when possible. Sending a texture uniform is more expensive than sending a float.

**Avoid branching in pixel shaders.** GPUs prefer uniform control flow. Replace `if/else` with `mix`, `step`, and `clamp` when feasible.

**Use canvases to limit shader scope.** A full-screen pixel shader runs for every pixel. If only a small region needs the effect, render that region to a smaller canvas.

**Watch for precision on mobile.** LÖVE on Android/iOS uses OpenGL ES. Declare precision explicitly if targeting mobile:

```glsl
#ifdef GL_ES
precision mediump float;
#endif
```

**Test with `love.graphics.getSupported().`** Not all GPU features are available everywhere. Check for canvas support, shader model, etc., before relying on advanced techniques.

---

## Common Pitfalls

**Forgetting `* color` in the return.** If your `effect` function ignores the `color` parameter, `love.graphics.setColor()` stops working — the shader overrides the color entirely.

**Declaring a built-in variable.** Redeclaring `TransformProjectionMatrix` or `love_ScreenSize` causes a compilation error. LÖVE injects them automatically.

**Sending the wrong table shape.** `vec2` expects `{x, y}`, not `{x = 1, y = 2}`. Use sequential indexed tables.

**Not resetting the shader.** Calling `love.graphics.setShader(myShader)` without a matching `love.graphics.setShader()` applies the shader to all subsequent draws, including text and UI.
