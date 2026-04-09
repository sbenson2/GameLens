# G109 — Modular Shader Architecture with ShaderIncludes

> **Category:** guide · **Engine:** Godot 4.x · **Related:** [G12 Shaders & Visual Effects](./G12_shaders_and_visual_effects.md) · [G31 Advanced 3D Shaders & Compute](./G31_advanced_3d_shaders_and_compute.md) · [G75 Shader Baking & Precompilation](./G75_shader_baking_and_precompilation.md) · [G77 VisualShader Patterns](./G77_visualshader_patterns.md)

A guide to building reusable, maintainable shader libraries in Godot 4.x using the `ShaderInclude` resource and the `#include` preprocessor directive. Covers organizing shader code into modules, sharing utility functions across materials, and scaling a shader codebase across a full game project.

---

## What This Guide Covers

As game projects grow, shaders multiply. You end up copy-pasting the same noise function into ten materials, the same lighting calculation into every surface shader, the same utility macros everywhere. When you fix a bug in one copy, the others stay broken.

Godot 4.x solves this with `ShaderInclude` — a first-class resource type that lets you write reusable shader code in `.gdshaderinc` files and pull them into any shader with `#include`. Combined with the shader preprocessor (`#define`, `#ifdef`, `#ifndef`), you can build a modular shader library that scales with your project.

**Use this guide when:** you have more than a handful of shaders and want to share code between them, or you're building a shader library for a team.

**Don't use this for:** single-shader projects or VisualShader-only workflows (VisualShader doesn't support `#include` directly — see G77 for visual alternatives).

---

## Table of Contents

1. [ShaderInclude Basics](#1-shaderinclude-basics)
2. [Project Organization](#2-project-organization)
3. [Utility Libraries — Noise, Math, Color](#3-utility-libraries--noise-math-color)
4. [Preprocessor Directives for Configuration](#4-preprocessor-directives-for-configuration)
5. [Lighting Models as Includes](#5-lighting-models-as-includes)
6. [Include Guards and Avoiding Double Inclusion](#6-include-guards-and-avoiding-double-inclusion)
7. [Using Includes with C# Shader Generation](#7-using-includes-with-c-shader-generation)
8. [Performance Considerations](#8-performance-considerations)
9. [Debugging Include Errors](#9-debugging-include-errors)
10. [Real-World Example — A Complete Shader Library](#10-real-world-example--a-complete-shader-library)
11. [Common Mistakes](#11-common-mistakes)

---

## 1. ShaderInclude Basics

### The ShaderInclude Resource

A `ShaderInclude` is a Godot resource (`.gdshaderinc` file) that contains raw shader code — functions, constants, structs, varying declarations — but no `shader_type` declaration. It exists solely to be included in other shaders.

**Creating a ShaderInclude in the editor:**

1. Right-click in the FileSystem dock → **New Resource** → search for **ShaderInclude**
2. Save it with a `.gdshaderinc` extension (e.g., `res://shaders/includes/noise.gdshaderinc`)
3. Open it in the shader editor — it behaves like a shader file but without a `shader_type` line

**Creating via script (GDScript):**

```gdscript
# Create a ShaderInclude resource at runtime
var include := ShaderInclude.new()
include.code = """
float remap(float value, float from_low, float from_high, float to_low, float to_high) {
    return to_low + (value - from_low) * (to_high - to_low) / (from_high - from_low);
}
"""
ResourceSaver.save(include, "res://shaders/includes/math_utils.gdshaderinc")
```

**Creating via script (C#):**

```csharp
using Godot;

var include = new ShaderInclude();
include.Code = @"
float remap(float value, float from_low, float from_high, float to_low, float to_high) {
    return to_low + (value - from_low) * (to_high - to_low) / (from_high - from_low);
}
";
ResourceSaver.Save(include, "res://shaders/includes/math_utils.gdshaderinc");
```

### Using #include in a Shader

```glsl
shader_type spatial;

// Include by resource path — must use double quotes
#include "res://shaders/includes/noise.gdshaderinc"
#include "res://shaders/includes/math_utils.gdshaderinc"

uniform float scroll_speed : hint_range(0.0, 5.0) = 1.0;

void fragment() {
    // Functions from noise.gdshaderinc are available here
    float n = fbm_3d(vec3(UV * 4.0, TIME * scroll_speed));
    ALBEDO = vec3(remap(n, -1.0, 1.0, 0.2, 0.8));
}
```

**Key rules:**

- `#include` must appear **after** `shader_type` but **before** any code that uses the included symbols
- Paths are always `res://` paths with double quotes
- The included file must NOT contain `shader_type` — only the host shader declares that
- Circular includes cause a compile error — Godot does **not** detect them gracefully, so use include guards

---

## 2. Project Organization

### Recommended Directory Structure

```
res://shaders/
├── includes/               # Reusable ShaderInclude files
│   ├── constants.gdshaderinc
│   ├── noise.gdshaderinc
│   ├── math_utils.gdshaderinc
│   ├── lighting.gdshaderinc
│   ├── color_utils.gdshaderinc
│   └── wind.gdshaderinc
├── materials/              # Actual shader files (.gdshader)
│   ├── terrain.gdshader
│   ├── water.gdshader
│   ├── foliage.gdshader
│   └── character_skin.gdshader
└── visual/                 # VisualShader resources (can't use includes)
    └── ui_effects.tres
```

### Naming Conventions

- Include files: `snake_case.gdshaderinc` — describe the domain (`noise`, `lighting`, `wind`)
- Shader files: `snake_case.gdshader` — describe the material or surface
- Prefix functions in includes with a short namespace to avoid collisions: `noise_fbm()`, `color_saturate()`, `wind_displacement()`

---

## 3. Utility Libraries — Noise, Math, Color

### noise.gdshaderinc

```glsl
// noise.gdshaderinc — Common noise functions for Godot 4.x shaders
// Include guard
#ifndef NOISE_INCLUDED
#define NOISE_INCLUDED

// Hash function for noise generation
vec2 noise_hash22(vec2 p) {
    p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float noise_hash12(vec2 p) {
    float h = dot(p, vec2(127.1, 311.7));
    return fract(sin(h) * 43758.5453123);
}

// 2D value noise
float noise_value_2d(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f); // smoothstep

    return mix(
        mix(noise_hash12(i + vec2(0.0, 0.0)), noise_hash12(i + vec2(1.0, 0.0)), u.x),
        mix(noise_hash12(i + vec2(0.0, 1.0)), noise_hash12(i + vec2(1.0, 1.0)), u.x),
        u.y
    );
}

// 2D gradient noise (Perlin-like)
float noise_gradient_2d(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);

    return mix(
        mix(dot(noise_hash22(i + vec2(0.0, 0.0)), f - vec2(0.0, 0.0)),
            dot(noise_hash22(i + vec2(1.0, 0.0)), f - vec2(1.0, 0.0)), u.x),
        mix(dot(noise_hash22(i + vec2(0.0, 1.0)), f - vec2(0.0, 1.0)),
            dot(noise_hash22(i + vec2(1.0, 1.0)), f - vec2(1.0, 1.0)), u.x),
        u.y
    );
}

// Fractal Brownian Motion — configurable octaves
float noise_fbm_2d(vec2 p, int octaves, float lacunarity, float gain) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < octaves; i++) {
        value += amplitude * noise_gradient_2d(p);
        p *= lacunarity;
        amplitude *= gain;
    }
    return value;
}

#endif // NOISE_INCLUDED
```

### math_utils.gdshaderinc

```glsl
// math_utils.gdshaderinc — Math helpers
#ifndef MATH_UTILS_INCLUDED
#define MATH_UTILS_INCLUDED

float math_remap(float value, float from_low, float from_high, float to_low, float to_high) {
    return to_low + (value - from_low) * (to_high - to_low) / (from_high - from_low);
}

float math_inverse_lerp(float a, float b, float value) {
    return (value - a) / (b - a);
}

// Rotate a 2D vector by angle in radians
vec2 math_rotate_2d(vec2 v, float angle) {
    float c = cos(angle);
    float s = sin(angle);
    return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
}

// Soft minimum — smooth blend between two values
float math_smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

#endif // MATH_UTILS_INCLUDED
```

### color_utils.gdshaderinc

```glsl
// color_utils.gdshaderinc — Color manipulation
#ifndef COLOR_UTILS_INCLUDED
#define COLOR_UTILS_INCLUDED

vec3 color_saturate(vec3 color, float amount) {
    float gray = dot(color, vec3(0.2126, 0.7152, 0.0722));
    return mix(vec3(gray), color, amount);
}

vec3 color_contrast(vec3 color, float contrast) {
    return (color - 0.5) * contrast + 0.5;
}

// sRGB to linear conversion (for manual color space work)
vec3 color_srgb_to_linear(vec3 srgb) {
    return mix(
        srgb / 12.92,
        pow((srgb + 0.055) / 1.055, vec3(2.4)),
        step(vec3(0.04045), srgb)
    );
}

vec3 color_linear_to_srgb(vec3 linear_col) {
    return mix(
        linear_col * 12.92,
        1.055 * pow(linear_col, vec3(1.0 / 2.4)) - 0.055,
        step(vec3(0.0031308), linear_col)
    );
}

#endif // COLOR_UTILS_INCLUDED
```

---

## 4. Preprocessor Directives for Configuration

The Godot shader preprocessor supports `#define`, `#ifdef`, `#ifndef`, `#else`, `#endif`, and `#undef`. Use these to create configurable includes.

### Feature Flags

```glsl
// In your main shader — define flags BEFORE including
shader_type spatial;

#define USE_TRIPLANAR
#define NOISE_OCTAVES 6

#include "res://shaders/includes/noise.gdshaderinc"
#include "res://shaders/includes/triplanar.gdshaderinc"

void fragment() {
    // triplanar.gdshaderinc checks #ifdef USE_TRIPLANAR internally
    vec3 tex_color = triplanar_sample(ALBEDO_TEX, NORMAL, UV);
    float n = noise_fbm_2d(UV * 8.0, NOISE_OCTAVES, 2.0, 0.5);
    ALBEDO = tex_color * (0.8 + 0.2 * n);
}
```

### Inside the include — respond to flags

```glsl
// triplanar.gdshaderinc
#ifndef TRIPLANAR_INCLUDED
#define TRIPLANAR_INCLUDED

#ifdef USE_TRIPLANAR
vec3 triplanar_sample(sampler2D tex, vec3 normal, vec2 uv) {
    vec3 blend = abs(normal);
    blend = normalize(max(blend, 0.00001));
    float b = blend.x + blend.y + blend.z;
    blend /= b;

    vec3 x_proj = texture(tex, uv * normal.yz).rgb;
    vec3 y_proj = texture(tex, uv * normal.xz).rgb;
    vec3 z_proj = texture(tex, uv * normal.xy).rgb;

    return x_proj * blend.x + y_proj * blend.y + z_proj * blend.z;
}
#else
// Fallback — simple UV sampling
vec3 triplanar_sample(sampler2D tex, vec3 normal, vec2 uv) {
    return texture(tex, uv).rgb;
}
#endif

#endif // TRIPLANAR_INCLUDED
```

### Platform/Render-Mode Flags

```glsl
// You can define platform hints for mobile vs desktop quality
#define QUALITY_LOW   0
#define QUALITY_MED   1
#define QUALITY_HIGH  2

// Set this before including lighting.gdshaderinc
#define QUALITY_LEVEL QUALITY_HIGH
```

---

## 5. Lighting Models as Includes

### Custom Toon Lighting Include

```glsl
// lighting_toon.gdshaderinc — Cel-shading light model
#ifndef LIGHTING_TOON_INCLUDED
#define LIGHTING_TOON_INCLUDED

// Number of shading bands (override before including)
#ifndef TOON_BANDS
#define TOON_BANDS 3
#endif

float toon_step(float ndotl) {
    float bands = float(TOON_BANDS);
    return floor(ndotl * bands) / bands;
}

vec3 toon_diffuse(vec3 normal, vec3 light_dir, vec3 albedo, vec3 light_color) {
    float ndotl = max(dot(normal, light_dir), 0.0);
    float stepped = toon_step(ndotl);
    return albedo * light_color * stepped;
}

float toon_specular(vec3 normal, vec3 light_dir, vec3 view_dir, float glossiness) {
    vec3 half_dir = normalize(light_dir + view_dir);
    float ndoth = max(dot(normal, half_dir), 0.0);
    float spec = pow(ndoth, glossiness);
    return step(0.5, spec); // Hard specular cutoff
}

#endif // LIGHTING_TOON_INCLUDED
```

### Using in a Spatial Shader

```glsl
shader_type spatial;
render_mode unshaded; // We handle lighting manually

#define TOON_BANDS 4
#include "res://shaders/includes/lighting_toon.gdshaderinc"

uniform vec4 albedo_color : source_color = vec4(1.0);
uniform float specular_glossiness : hint_range(1.0, 256.0) = 32.0;

void fragment() {
    ALBEDO = albedo_color.rgb;
}

void light() {
    vec3 diffuse = toon_diffuse(NORMAL, LIGHT, ALBEDO, LIGHT_COLOR);
    float spec = toon_specular(NORMAL, LIGHT, VIEW, specular_glossiness);
    DIFFUSE_LIGHT += diffuse * ATTENUATION;
    SPECULAR_LIGHT += spec * LIGHT_COLOR * ATTENUATION;
}
```

---

## 6. Include Guards and Avoiding Double Inclusion

Godot's shader preprocessor does **not** have `#pragma once`. Use manual include guards with `#ifndef` / `#define` / `#endif`.

### Pattern

```glsl
// Every .gdshaderinc file should follow this pattern:
#ifndef UNIQUE_GUARD_NAME
#define UNIQUE_GUARD_NAME

// ... your code ...

#endif // UNIQUE_GUARD_NAME
```

### Naming Convention for Guards

Use the file name in `UPPER_SNAKE_CASE` with `_INCLUDED` suffix:

| File | Guard |
|------|-------|
| `noise.gdshaderinc` | `NOISE_INCLUDED` |
| `math_utils.gdshaderinc` | `MATH_UTILS_INCLUDED` |
| `lighting_toon.gdshaderinc` | `LIGHTING_TOON_INCLUDED` |

### Why This Matters

Without guards, if shader A includes both `noise.gdshaderinc` and `terrain_utils.gdshaderinc`, and `terrain_utils.gdshaderinc` also includes `noise.gdshaderinc`, you get duplicate function definitions and a compile error.

---

## 7. Using Includes with C# Shader Generation

When generating or modifying shaders from C#, you can load and compose ShaderIncludes programmatically:

```csharp
using Godot;

public partial class ShaderComposer : Node
{
    public Shader ComposeTerrainShader(bool useTriplanar, int noiseOctaves)
    {
        var shader = new Shader();
        var code = "shader_type spatial;\n\n";

        // Add preprocessor defines based on configuration
        if (useTriplanar)
            code += "#define USE_TRIPLANAR\n";
        code += $"#define NOISE_OCTAVES {noiseOctaves}\n\n";

        // Include shared libraries
        code += "#include \"res://shaders/includes/noise.gdshaderinc\"\n";
        code += "#include \"res://shaders/includes/math_utils.gdshaderinc\"\n";
        if (useTriplanar)
            code += "#include \"res://shaders/includes/triplanar.gdshaderinc\"\n";

        code += @"
uniform sampler2D terrain_texture : source_color;
uniform float blend_sharpness : hint_range(1.0, 16.0) = 4.0;

void fragment() {
    float n = noise_fbm_2d(UV * 8.0, NOISE_OCTAVES, 2.0, 0.5);
    ALBEDO = texture(terrain_texture, UV).rgb * (0.8 + 0.2 * n);
}
";
        shader.Code = code;
        return shader;
    }
}
```

**GDScript equivalent:**

```gdscript
func compose_terrain_shader(use_triplanar: bool, noise_octaves: int) -> Shader:
    var shader := Shader.new()
    var code := "shader_type spatial;\n\n"

    if use_triplanar:
        code += "#define USE_TRIPLANAR\n"
    code += "#define NOISE_OCTAVES %d\n\n" % noise_octaves

    code += '#include "res://shaders/includes/noise.gdshaderinc"\n'
    code += '#include "res://shaders/includes/math_utils.gdshaderinc"\n'
    if use_triplanar:
        code += '#include "res://shaders/includes/triplanar.gdshaderinc"\n'

    code += """
uniform sampler2D terrain_texture : source_color;

void fragment() {
    float n = noise_fbm_2d(UV * 8.0, NOISE_OCTAVES, 2.0, 0.5);
    ALBEDO = texture(terrain_texture, UV).rgb * (0.8 + 0.2 * n);
}
"""
    shader.code = code
    return shader
```

---

## 8. Performance Considerations

### Includes Don't Add Runtime Cost

`#include` is resolved **at compile time**. The preprocessor inlines the included code into the shader source before compilation. There is zero runtime overhead from using includes — the GPU sees a single, flat shader.

### What Does Cost Performance

- **Unused functions in includes:** GLSL compilers typically strip dead code, so an unused function from an include won't generate GPU instructions. However, the shader **compile time** increases with more source code. For very large include libraries, compile time on first load can be noticeable.
- **Excessive branching from #ifdef:** `#ifdef` is resolved at compile time and costs nothing at runtime. However, having many shader variants (different combinations of defines) means more unique shaders to compile and cache.
- **Include depth:** Godot allows nested includes. Deep chains (A includes B includes C includes D) are fine functionally but harder to debug.

### Shader Compilation Caching

Godot caches compiled shaders. After first compilation, includes don't add any overhead. Use the Shader Baker (Godot 4.5+) to precompile shaders and eliminate first-frame stutter. See [G75 Shader Baking](./G75_shader_baking_and_precompilation.md).

---

## 9. Debugging Include Errors

### Common Error Messages

| Error | Cause | Fix |
|-------|-------|-----|
| `Cannot find include file` | Wrong path or missing file | Check `res://` path, ensure `.gdshaderinc` extension |
| `Function already defined` | Missing include guards | Add `#ifndef` / `#define` / `#endif` |
| `Unexpected token` | `shader_type` in include file | Remove `shader_type` from `.gdshaderinc` — only the host shader declares it |
| `Cyclic include detected` | A includes B, B includes A | Restructure to remove circular dependency |

### Debugging Steps

1. **Check the Output panel** — Shader compilation errors appear there with line numbers. Note: line numbers refer to the **post-include expanded** source, so they may not match your `.gdshaderinc` file directly.
2. **Temporarily inline** — Copy the include content directly into the shader to isolate whether the problem is in the include path resolution or the code itself.
3. **Print-debug with color** — Set `ALBEDO = vec3(1.0, 0.0, 0.0)` at different points to verify which code paths execute.

---

## 10. Real-World Example — A Complete Shader Library

### Project: Stylized RPG with Shared Art Direction

```
res://shaders/
├── includes/
│   ├── constants.gdshaderinc     # Shared color palette, magic numbers
│   ├── noise.gdshaderinc         # Noise functions
│   ├── math_utils.gdshaderinc    # Remap, rotate, smin
│   ├── color_utils.gdshaderinc   # Saturate, contrast, sRGB
│   ├── lighting_toon.gdshaderinc # Toon shading model
│   ├── wind.gdshaderinc          # Vegetation wind displacement
│   └── outline.gdshaderinc       # Outline detection helpers
├── terrain.gdshader              # Uses: noise, math_utils, lighting_toon
├── water.gdshader                # Uses: noise, math_utils, color_utils
├── foliage.gdshader              # Uses: noise, wind, lighting_toon
├── character.gdshader            # Uses: lighting_toon, outline
└── skybox.gdshader               # Uses: noise, color_utils, math_utils
```

### constants.gdshaderinc

```glsl
#ifndef CONSTANTS_INCLUDED
#define CONSTANTS_INCLUDED

// Art direction — shared palette
const vec3 PALETTE_SHADOW = vec3(0.15, 0.10, 0.20);
const vec3 PALETTE_HIGHLIGHT = vec3(1.0, 0.95, 0.85);
const vec3 PALETTE_AMBIENT = vec3(0.35, 0.30, 0.45);

// Physics constants
const float WIND_BASE_SPEED = 1.5;
const float WIND_GUST_FREQUENCY = 0.3;

#endif
```

### wind.gdshaderinc

```glsl
#ifndef WIND_INCLUDED
#define WIND_INCLUDED

#include "res://shaders/includes/noise.gdshaderinc"
#include "res://shaders/includes/constants.gdshaderinc"

// Vertex displacement for foliage wind
vec3 wind_displacement(vec3 world_pos, float time, float weight) {
    float gust = noise_gradient_2d(world_pos.xz * WIND_GUST_FREQUENCY + time * 0.5);
    float base_sway = sin(time * WIND_BASE_SPEED + world_pos.x * 0.5) * 0.5 + 0.5;
    float combined = (base_sway + gust * 0.3) * weight;
    return vec3(combined * 0.15, 0.0, combined * 0.08);
}

#endif
```

### foliage.gdshader (consumer)

```glsl
shader_type spatial;
render_mode cull_disabled;

#define TOON_BANDS 3
#include "res://shaders/includes/lighting_toon.gdshaderinc"
#include "res://shaders/includes/wind.gdshaderinc"

uniform vec4 leaf_color : source_color = vec4(0.3, 0.6, 0.2, 1.0);
uniform float wind_strength : hint_range(0.0, 2.0) = 1.0;

void vertex() {
    // COLOR.r is painted vertex weight for wind influence
    vec3 world = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
    vec3 wind = wind_displacement(world, TIME, COLOR.r * wind_strength);
    VERTEX += wind;
}

void fragment() {
    ALBEDO = leaf_color.rgb;
}

void light() {
    vec3 diffuse = toon_diffuse(NORMAL, LIGHT, ALBEDO, LIGHT_COLOR);
    DIFFUSE_LIGHT += diffuse * ATTENUATION;
}
```

---

## 11. Common Mistakes

### Putting shader_type in an Include

```glsl
// BAD — noise.gdshaderinc
shader_type spatial;  // This will cause errors when included
float my_noise(vec2 p) { ... }

// GOOD — noise.gdshaderinc
#ifndef NOISE_INCLUDED
#define NOISE_INCLUDED
float my_noise(vec2 p) { ... }
#endif
```

### Forgetting Include Guards

Every `.gdshaderinc` file should have guards. Without them, indirect double-inclusion breaks compilation.

### Using Relative Paths

```glsl
// BAD — Godot doesn't support relative include paths
#include "noise.gdshaderinc"
#include "../includes/noise.gdshaderinc"

// GOOD — Always use res:// paths
#include "res://shaders/includes/noise.gdshaderinc"
```

### Declaring Uniforms in Includes

Uniforms should generally live in the host shader, not in includes. If two shaders include the same file with uniforms, they'll both get those uniforms — which may not be desired. If you must share uniforms, document them clearly and use the preprocessor to make them optional.

### Depending on Include Order

If include A calls a function from include B, include A should `#include` B itself rather than relying on the host shader to include B first. This makes includes self-contained and reduces bugs when refactoring.

```glsl
// GOOD — wind.gdshaderinc includes its own dependencies
#include "res://shaders/includes/noise.gdshaderinc"

// BAD — relying on host shader to include noise before wind
// (works by accident, breaks when someone changes include order)
```

---

## Summary

| Concept | Rule |
|---------|------|
| File extension | `.gdshaderinc` for includes, `.gdshader` for shaders |
| Include syntax | `#include "res://path/to/file.gdshaderinc"` |
| Include guards | Always use `#ifndef` / `#define` / `#endif` |
| shader_type | Never in includes — only in host shaders |
| Paths | Always absolute `res://` paths |
| Performance | Zero runtime cost — resolved at compile time |
| Namespacing | Prefix functions: `noise_fbm()`, `color_saturate()` |
| Dependencies | Includes should `#include` their own dependencies |
