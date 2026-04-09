# R2 — Surfaces & Shaders Reference

> **Category:** reference · **Engine:** GameMaker · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [R1 GML Data Structures](R1_gml_data_structures.md)

---

## Surfaces: Off-Screen Drawing Targets

A surface is an off-screen texture you can draw to, then draw onto the screen or pass to a shader. Surfaces live in GPU memory (VRAM) and are **volatile** — they can be lost at any time (window resize, app suspend, GPU memory pressure). Always check `surface_exists()` before drawing to or from a surface.

---

### Core Surface Functions

| Function | Purpose | Notes |
|----------|---------|-------|
| `surface_create(w, h)` | Create a surface | Returns a surface ID. Prefer power-of-2 sizes on HTML5/mobile |
| `surface_free(surf)` | Destroy a surface | **Not garbage-collected** — you must free manually or leak VRAM |
| `surface_exists(surf)` | Check if still valid | Call before every use — surfaces can be lost between frames |
| `surface_set_target(surf)` | Redirect drawing to surface | Must be paired with `surface_reset_target()` |
| `surface_reset_target()` | Restore drawing to previous target | Targets form a stack — always reset in reverse order |
| `surface_get_width(surf)` | Get surface width in pixels | |
| `surface_get_height(surf)` | Get surface height in pixels | |
| `surface_getpixel(surf, x, y)` | Read pixel color | Slow — avoid in real-time loops |
| `surface_getpixel_ext(surf, x, y)` | Read pixel color + alpha | Slow — avoid in real-time loops |
| `surface_save(surf, fname)` | Save surface as PNG | Useful for screenshots, debug |
| `surface_copy(dest, x, y, src)` | Copy one surface onto another | Faster than drawing |
| `surface_resize(surf, w, h)` | Resize an existing surface | Contents are lost after resize |

### Creating and Using a Surface

```gml
/// Create Event
light_surface = -1;  // invalid handle — recreate each frame

/// Draw Event
// Recreate if lost (volatile!)
if (!surface_exists(light_surface)) {
    light_surface = surface_create(room_width, room_height);
}

// Draw lights onto the surface
surface_set_target(light_surface);
draw_clear_alpha(c_black, 1);  // start fully dark
gpu_set_blendmode(bm_add);     // additive blending for light

for (var _i = 0; _i < array_length(lights); _i++) {
    var _l = lights[_i];
    draw_sprite_ext(spr_light, 0, _l.x, _l.y, _l.radius, _l.radius, 0, _l.color, _l.intensity);
}

gpu_set_blendmode(bm_normal);
surface_reset_target();

// Draw the light surface over the scene with multiply blend
gpu_set_blendmode(bm_multiply);
draw_surface(light_surface, 0, 0);
gpu_set_blendmode(bm_normal);
```

### The Application Surface

GameMaker automatically renders everything to the **application surface** (`application_surface`). You can manipulate it, but you cannot free it.

```gml
/// Post Draw Event — apply post-processing to the entire frame
shader_set(shd_vignette);
draw_surface_stretched(application_surface, 0, 0, window_get_width(), window_get_height());
shader_reset();
```

| Application Surface Fact | Detail |
|--------------------------|--------|
| Created automatically | Yes — one per game |
| Can be resized | `surface_resize(application_surface, w, h)` |
| Can be freed | **No** — always exists |
| Handle can change | Yes — re-read `application_surface` each frame |
| Default size | Matches the room or viewport dimensions |

### Surface Stack Rules

Surface targets form a stack. You can nest `surface_set_target()` calls (max depth ~16), but you **must** reset them in reverse order:

```gml
surface_set_target(surf_a);       // push A
    surface_set_target(surf_b);   // push B
    // draw to B
    surface_reset_target();       // pop B
// draw to A
surface_reset_target();           // pop A — back to application surface
```

---

## GPU Blend Modes

Blend modes control how drawn pixels combine with existing pixels. Set with `gpu_set_blendmode()` or `gpu_set_blendmode_ext()`.

| Mode | Constant | Effect |
|------|----------|--------|
| Normal | `bm_normal` | Standard alpha blending (default) |
| Add | `bm_add` | Brightens — great for lights, particles, fire |
| Subtract | `bm_subtract` | Darkens — shadows, absorption |
| Max | `bm_max` | Takes the brighter of source/dest per channel |
| Multiply | Not a simple constant | Use `gpu_set_blendmode_ext(bm_dest_colour, bm_inv_src_alpha)` |

For full control, `gpu_set_blendmode_ext(src_factor, dest_factor)` lets you specify source and destination factors individually.

---

## Shaders

GameMaker uses **GLSL ES** shaders (OpenGL Shading Language for Embedded Systems). Each shader asset has two programs: a **vertex shader** (processes geometry) and a **fragment shader** (processes pixels).

### Shader Lifecycle in GML

```gml
/// Create Event — cache uniform handles once
u_time      = shader_get_uniform(shd_water, "u_time");
u_amplitude = shader_get_uniform(shd_water, "u_amplitude");
u_color     = shader_get_uniform(shd_water, "u_color");

/// Draw Event — set shader, pass uniforms, draw, reset
shader_set(shd_water);
shader_set_uniform_f(u_time, current_time / 1000);
shader_set_uniform_f(u_amplitude, 4.0);
shader_set_uniform_f(u_color, 0.2, 0.5, 1.0, 0.8);  // vec4: RGBA
draw_self();
shader_reset();
```

### Key Shader Functions

| Function | Purpose | Example |
|----------|---------|---------|
| `shader_set(shader)` | Activate a shader | `shader_set(shd_blur)` |
| `shader_reset()` | Deactivate current shader | Always call after drawing |
| `shader_get_uniform(shader, name)` | Get handle to a uniform variable | `shader_get_uniform(shd, "u_time")` |
| `shader_set_uniform_f(handle, v1, ...)` | Set float uniform (1–4 components) | `shader_set_uniform_f(h, 1.0, 0.5)` for vec2 |
| `shader_set_uniform_f_array(handle, arr)` | Set float array uniform | For passing arrays to shaders |
| `shader_set_uniform_i(handle, v1, ...)` | Set integer uniform | Sampler indices, toggle flags |
| `shader_set_uniform_matrix(handle)` | Pass current matrix to shader | World/view/projection matrices |
| `shader_get_sampler_index(shader, name)` | Get texture sampler handle | For multi-texture effects |
| `texture_set_stage(sampler, texture)` | Bind a texture to a sampler | `texture_set_stage(s, surface_get_texture(surf))` |
| `shader_is_compiled(shader)` | Check if shader compiled | Graceful fallback on unsupported platforms |
| `shader_current()` | Get currently active shader | Returns -1 if none |

### Passing Textures to Shaders

To use a surface or sprite as a second texture input:

```gml
/// Create Event
sampler_noise = shader_get_sampler_index(shd_dissolve, "s_noise");

/// Draw Event
shader_set(shd_dissolve);
shader_set_uniform_f(u_threshold, dissolve_progress);

// Bind noise texture to sampler unit
var _noise_tex = sprite_get_texture(spr_noise, 0);
texture_set_stage(sampler_noise, _noise_tex);

draw_self();
shader_reset();
```

---

### Writing a Fragment Shader: Grayscale Example

```glsl
// Fragment shader (shd_grayscale.fsh)
varying vec2 v_vTexcoord;
varying vec4 v_vColour;

void main() {
    vec4 col = v_vColour * texture2D(gm_BaseTexture, v_vTexcoord);
    float gray = dot(col.rgb, vec3(0.299, 0.587, 0.114));  // luminance weights
    gl_FragColor = vec4(vec3(gray), col.a);
}
```

### Writing a Fragment Shader: Outline Effect

```glsl
// Fragment shader (shd_outline.fsh)
varying vec2 v_vTexcoord;
varying vec4 v_vColour;

uniform vec2  u_texel_size;   // 1.0 / texture_size — pass from GML
uniform vec4  u_outline_color;

void main() {
    vec4 col = texture2D(gm_BaseTexture, v_vTexcoord);

    // If this pixel is transparent, check if any neighbor is opaque
    if (col.a < 0.1) {
        float a_up    = texture2D(gm_BaseTexture, v_vTexcoord + vec2(0.0, -u_texel_size.y)).a;
        float a_down  = texture2D(gm_BaseTexture, v_vTexcoord + vec2(0.0,  u_texel_size.y)).a;
        float a_left  = texture2D(gm_BaseTexture, v_vTexcoord + vec2(-u_texel_size.x, 0.0)).a;
        float a_right = texture2D(gm_BaseTexture, v_vTexcoord + vec2( u_texel_size.x, 0.0)).a;

        if (a_up > 0.1 || a_down > 0.1 || a_left > 0.1 || a_right > 0.1) {
            gl_FragColor = u_outline_color;
            return;
        }
    }

    gl_FragColor = v_vColour * col;
}
```

GML side to pass `u_texel_size`:

```gml
var _tex = sprite_get_texture(sprite_index, image_index);
var _tw = texture_get_texel_width(_tex);
var _th = texture_get_texel_height(_tex);
shader_set_uniform_f(u_texel_size, _tw, _th);
```

---

### Combining Surfaces and Shaders: Multi-Pass Post-Processing

A common pattern: draw the scene to a surface, then apply shaders to that surface in multiple passes.

```gml
/// Create Event
pp_surface_a = -1;
pp_surface_b = -1;
u_blur_dir   = shader_get_uniform(shd_blur, "u_direction");
u_blur_res   = shader_get_uniform(shd_blur, "u_resolution");

/// Post Draw Event — Gaussian blur (two-pass: horizontal + vertical)

var _w = surface_get_width(application_surface);
var _h = surface_get_height(application_surface);

// Ensure surfaces exist
if (!surface_exists(pp_surface_a)) pp_surface_a = surface_create(_w, _h);
if (!surface_exists(pp_surface_b)) pp_surface_b = surface_create(_w, _h);

// Pass 1: horizontal blur (application_surface → pp_surface_a)
surface_set_target(pp_surface_a);
draw_clear_alpha(c_black, 0);
shader_set(shd_blur);
shader_set_uniform_f(u_blur_dir, 1.0, 0.0);   // horizontal
shader_set_uniform_f(u_blur_res, _w, _h);
draw_surface(application_surface, 0, 0);
shader_reset();
surface_reset_target();

// Pass 2: vertical blur (pp_surface_a → pp_surface_b)
surface_set_target(pp_surface_b);
draw_clear_alpha(c_black, 0);
shader_set(shd_blur);
shader_set_uniform_f(u_blur_dir, 0.0, 1.0);   // vertical
shader_set_uniform_f(u_blur_res, _w, _h);
draw_surface(pp_surface_a, 0, 0);
shader_reset();
surface_reset_target();

// Draw final blurred result
draw_surface(pp_surface_b, 0, 0);
```

---

## Common Pitfalls

| Pitfall | Fix |
|---------|-----|
| Drawing to a freed/lost surface | Always check `surface_exists()` before use |
| Forgetting `surface_free()` | Surfaces are **not** garbage-collected — free in Clean Up event |
| Surface target stack mismatch | Every `surface_set_target()` needs exactly one `surface_reset_target()` |
| Setting uniforms before `shader_set()` | Uniforms only apply while the shader is active |
| Forgetting `shader_reset()` | All subsequent draws will use the shader until reset |
| Shader not compiled on target platform | Check `shader_is_compiled()` and provide a fallback |
| Getting uniform handles every frame | Cache handles in Create Event — `shader_get_uniform()` is a lookup |

---

## Quick Decision Guide

| I want to... | Use |
|--------------|-----|
| Draw to an off-screen buffer | `surface_create` + `surface_set_target` |
| Apply a visual effect to a sprite | Fragment shader + `shader_set` |
| Apply post-processing to the whole screen | Draw `application_surface` through a shader in Post Draw |
| Create a 2D lighting system | Surface with `bm_add` for lights, `bm_multiply` to apply |
| Multi-pass blur / bloom | Ping-pong between two surfaces with a shader each pass |
| Pass extra textures to a shader | `shader_get_sampler_index` + `texture_set_stage` |
| Check if shaders are supported | `shader_is_compiled(shd)` before using |
