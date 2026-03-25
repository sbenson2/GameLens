# G12 — Shaders & Visual Effects
> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / Godot Shading Language  
> **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G8 Animation Systems](./G8_animation_systems.md) · [G6 Camera Systems](./G6_camera_systems.md) · [G5 Physics & Collision](./G5_physics_and_collision.md) · [G1 Scene Composition](./G1_scene_composition.md)

---

## What This Guide Covers

Shaders are the paint that turns functional games into visually memorable ones. A white-flash hit shader makes combat feel impactful; a dissolve effect makes death feel dramatic; a water shader makes a pond feel alive. Godot's shader system supports both code-based shaders (Godot Shading Language, based on GLSL) and the Visual Shader editor — but learning which technique to use when, and how to integrate shaders with gameplay code, requires patterns that aren't in the official docs.

This guide covers the Godot shader pipeline, CanvasItem vs Spatial shaders, shader parameters and GDScript integration, the most common 2D game shaders with full implementations, the Visual Shader editor workflow, screen-space effects via BackBufferCopy and post-processing, particles (GPUParticles2D and CPUParticles2D), performance optimization, and common mistakes. All shader code targets Godot 4.4+ and all GDScript is fully typed.

For hit effect integration with animation, see [G8 Animation Systems](./G8_animation_systems.md). For screen shake (often paired with visual effects), see [G6 Camera Systems](./G6_camera_systems.md).

---

## Table of Contents

1. [Shader Pipeline Overview](#1-shader-pipeline-overview)
2. [Shader Types & When to Use Each](#2-shader-types--when-to-use-each)
3. [Shader Language Fundamentals](#3-shader-language-fundamentals)
4. [Shader Parameters & GDScript Integration](#4-shader-parameters--gdscript-integration)
5. [Hit Flash & Damage Shaders](#5-hit-flash--damage-shaders)
6. [Dissolve & Death Effects](#6-dissolve--death-effects)
7. [Outline Shaders](#7-outline-shaders)
8. [Color Manipulation Shaders](#8-color-manipulation-shaders)
9. [Water & Liquid Shaders](#9-water--liquid-shaders)
10. [Distortion & Heat Haze](#10-distortion--heat-haze)
11. [2D Lighting & Shadows](#11-2d-lighting--shadows)
12. [Screen-Space Effects & Post-Processing](#12-screen-space-effects--post-processing)
13. [GPUParticles2D](#13-gpuparticles2d)
14. [CPUParticles2D](#14-cpuparticles2d)
15. [Particle Patterns for Common Effects](#15-particle-patterns-for-common-effects)
16. [Visual Shader Editor](#16-visual-shader-editor)
17. [Shader Composition & Reuse](#17-shader-composition--reuse)
18. [Performance Optimization](#18-performance-optimization)
19. [Common Mistakes](#19-common-mistakes)
20. [Tuning Reference Tables](#20-tuning-reference-tables)

---

## 1. Shader Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Godot Rendering Pipeline (2D)                                  │
│                                                                 │
│  Sprite/Node ──▶ CanvasItem Shader ──▶ Canvas Layer ──▶ Screen  │
│       │              (per-object)          │                     │
│       │                                   │                     │
│       ▼                                   ▼                     │
│  Material          BackBufferCopy    Post-Process               │
│  (ShaderMaterial   (grab screen      (ColorRect with            │
│   or CanvasItem     behind object)    screen_texture)           │
│   Material)                                                     │
│                                                                 │
│  Execution Order:                                               │
│  1. Node draws with its material's shader                       │
│  2. If shader reads screen_texture, BackBufferCopy grabs it     │
│  3. Post-process nodes (on top CanvasLayer) read full screen    │
│  4. Final composite to display                                  │
└─────────────────────────────────────────────────────────────────┘
```

Every visible node in Godot is a `CanvasItem`. When you attach a `ShaderMaterial` to a node, your shader code runs for every pixel that node occupies. This is the key mental model: **shaders run per-pixel, not per-frame**.

### Material Types

| Material | Use Case | Shader Control |
|---|---|---|
| `CanvasItemMaterial` | Simple blend modes, particle config | No custom code |
| `ShaderMaterial` | Custom shader code | Full control |
| `ShaderMaterial` + Visual Shader | Node-based editing | Full control (visual) |

### Shader Application Hierarchy

```gdscript
# Option 1: Per-node material
sprite.material = ShaderMaterial.new()
sprite.material.shader = preload("res://shaders/flash.gdshader")

# Option 2: Shared material (all nodes using this resource share the material)
# Changes to shader params affect ALL nodes sharing this material
@export var shared_material: ShaderMaterial  # assign in editor

# Option 3: Unique material per instance (override shared)
sprite.material = sprite.material.duplicate()  # now independent
```

> **⚠️ Critical Rule:** When multiple sprites share a `ShaderMaterial` resource, setting a shader parameter on one changes it for ALL. Always `.duplicate()` if you need per-instance control (like individual hit flash timing).

---

## 2. Shader Types & When to Use Each

### CanvasItem Shader (2D)

The workhorse for 2D games. Processes each pixel of a 2D node.

```glsl
shader_type canvas_item;

void fragment() {
    vec4 tex = texture(TEXTURE, UV);
    COLOR = tex;  // pass-through (no change)
}
```

### Spatial Shader (3D)

For 3D objects. Has vertex, fragment, and light functions.

```glsl
shader_type spatial;

void fragment() {
    ALBEDO = vec3(1.0, 0.0, 0.0);  // solid red
}
```

### Particles Shader

Controls particle movement for GPUParticles2D/3D.

```glsl
shader_type particles;

void start() {
    // called once when particle spawns
    TRANSFORM = mat4(1.0);
}

void process() {
    // called every frame for each live particle
    VELOCITY.y += -98.0 * DELTA;  // gravity
}
```

### Decision Tree

```
Need to change how a 2D node looks?
├─ Simple blend mode (additive, multiply) → CanvasItemMaterial
├─ Custom per-pixel effect → ShaderMaterial (canvas_item)
├─ Screen-wide effect (vignette, CRT) → ColorRect + ShaderMaterial on top CanvasLayer
└─ Particle behavior → Particles shader on GPUParticles2D

Need to change a 3D object?
├─ PBR material adjustments → StandardMaterial3D
└─ Custom effect → ShaderMaterial (spatial)
```

---

## 3. Shader Language Fundamentals

Godot's shading language is GLSL-like but with Godot-specific built-ins. Key differences from GLSL:

### Types

```glsl
// Scalars
float x = 1.0;
int i = 5;
bool b = true;

// Vectors
vec2 uv = vec2(0.5, 0.5);
vec3 color = vec3(1.0, 0.0, 0.0);  // RGB red
vec4 rgba = vec4(1.0, 1.0, 1.0, 1.0);  // white, full alpha

// Swizzling
vec3 rgb = rgba.rgb;
float r = rgba.r;
vec2 xy = rgba.xy;
vec4 rrra = rgba.rrra;  // repeat components

// Matrices
mat4 transform = mat4(1.0);  // identity
```

### Built-In Variables (canvas_item)

```glsl
// In vertex():
VERTEX    // vec2 — vertex position (modify for distortion)
UV        // vec2 — texture coordinate

// In fragment():
UV        // vec2 — interpolated texture coordinate (0,0 top-left → 1,1 bottom-right)
COLOR     // vec4 — output color (write to this)
TEXTURE   // sampler2D — the node's texture
SCREEN_UV // vec2 — screen-space UV (for screen_texture reads)
TIME      // float — seconds since shader start (auto-increments)

// Special textures
SCREEN_TEXTURE  // deprecated in 4.x — use hint_screen_texture uniform
```

### Reading Textures

```glsl
shader_type canvas_item;

// Godot 4.x way to read the screen
uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap;

// Custom texture parameter
uniform sampler2D noise_tex : filter_linear, repeat_enable;

void fragment() {
    vec4 original = texture(TEXTURE, UV);        // this node's texture
    vec4 screen = texture(screen_tex, SCREEN_UV); // what's behind this node
    vec4 noise = texture(noise_tex, UV);          // custom noise texture
    COLOR = original;
}
```

### Common Math Functions

```glsl
// Interpolation
mix(a, b, t)          // linear interpolation: a * (1-t) + b * t
smoothstep(edge0, edge1, x)  // smooth S-curve between edges
step(edge, x)         // 0.0 if x < edge, else 1.0
clamp(x, min, max)    // restrict value to range

// Trigonometry (for waves, oscillation)
sin(x), cos(x)        // -1 to 1 oscillation
fract(x)              // fractional part (x - floor(x))

// Distance & length
length(vec)            // vector magnitude
distance(a, b)         // distance between two points
normalize(vec)         // unit vector (length = 1)

// Useful combinations
float pulse = sin(TIME * speed) * 0.5 + 0.5;  // 0-1 oscillation
float wave = fract(UV.x - TIME * speed);       // scrolling 0-1 wave
```

---

## 4. Shader Parameters & GDScript Integration

### Declaring Uniforms

```glsl
shader_type canvas_item;

// Basic types
uniform float flash_intensity : hint_range(0.0, 1.0) = 0.0;
uniform vec4 flash_color : source_color = vec4(1.0, 1.0, 1.0, 1.0);
uniform bool enabled = false;

// Textures
uniform sampler2D dissolve_noise : filter_linear;
uniform sampler2D gradient : source_color;

// Hint types for the editor
uniform float speed : hint_range(0.1, 10.0, 0.1) = 1.0;
uniform vec2 offset : hint_range(-1.0, 1.0) = vec2(0.0);
```

### Setting Parameters from GDScript

```gdscript
class_name ShaderController
extends Node

@export var target: CanvasItem

## Set a shader parameter by name.
func set_shader_param(param_name: StringName, value: Variant) -> void:
    var mat: ShaderMaterial = target.material as ShaderMaterial
    if mat:
        mat.set_shader_parameter(param_name, value)

## Get a shader parameter value.
func get_shader_param(param_name: StringName) -> Variant:
    var mat: ShaderMaterial = target.material as ShaderMaterial
    if mat:
        return mat.get_shader_parameter(param_name)
    return null

## Animate a shader parameter with a tween.
func tween_shader_param(param_name: StringName, from: float, to: float, 
        duration: float) -> Tween:
    var mat: ShaderMaterial = target.material as ShaderMaterial
    if not mat:
        return null
    mat.set_shader_parameter(param_name, from)
    var tween: Tween = create_tween()
    tween.tween_method(
        func(value: float) -> void: mat.set_shader_parameter(param_name, value),
        from, to, duration
    )
    return tween
```

### Material Uniqueness Pattern

```gdscript
## Ensure this node has its own unique material (not shared).
## Call this in _ready() before setting any per-instance shader params.
func ensure_unique_material() -> ShaderMaterial:
    var mat: ShaderMaterial = target.material as ShaderMaterial
    if mat and not mat.resource_local_to_scene:
        target.material = mat.duplicate()
    return target.material as ShaderMaterial
```

> **Best Practice:** Use `resource_local_to_scene = true` on the material resource in the editor instead of duplicating in code. This makes each scene instance get its own copy automatically.

---

## 5. Hit Flash & Damage Shaders

The most commonly needed game shader. Flash the sprite white (or any color) on hit.

### Basic White Flash

```glsl
// flash.gdshader
shader_type canvas_item;

uniform float flash_intensity : hint_range(0.0, 1.0) = 0.0;
uniform vec4 flash_color : source_color = vec4(1.0, 1.0, 1.0, 1.0);

void fragment() {
    vec4 tex = texture(TEXTURE, UV);
    // Mix between original color and flash color, preserving alpha
    COLOR = vec4(mix(tex.rgb, flash_color.rgb, flash_intensity), tex.a);
}
```

### GDScript Flash Controller

```gdscript
class_name HitFlash
extends Node

## The sprite or node with the flash shader material.
@export var target: CanvasItem
## Duration of the flash in seconds.
@export var flash_duration: float = 0.12
## Flash color (white = classic hit flash).
@export var flash_color: Color = Color.WHITE

var _flash_tween: Tween

func _ready() -> void:
    # Ensure unique material so flashing one enemy doesn't flash all
    if target and target.material:
        target.material = target.material.duplicate()

## Trigger a hit flash. Call this from your damage handler.
func flash() -> void:
    if not target or not target.material:
        return
    
    var mat: ShaderMaterial = target.material as ShaderMaterial
    if not mat:
        return
    
    # Kill any running flash
    if _flash_tween and _flash_tween.is_valid():
        _flash_tween.kill()
    
    mat.set_shader_parameter(&"flash_color", flash_color)
    mat.set_shader_parameter(&"flash_intensity", 1.0)
    
    _flash_tween = create_tween()
    _flash_tween.tween_method(
        func(value: float) -> void: mat.set_shader_parameter(&"flash_intensity", value),
        1.0, 0.0, flash_duration
    ).set_ease(Tween.EASE_OUT)
```

### Advanced Hit Shader (Flash + Overlay + Saturation)

```glsl
// hit_effect.gdshader
shader_type canvas_item;

uniform float flash_intensity : hint_range(0.0, 1.0) = 0.0;
uniform vec4 flash_color : source_color = vec4(1.0, 1.0, 1.0, 1.0);
uniform float damage_tint : hint_range(0.0, 1.0) = 0.0;
uniform float desaturation : hint_range(0.0, 1.0) = 0.0;

void fragment() {
    vec4 tex = texture(TEXTURE, UV);
    vec3 color = tex.rgb;
    
    // Step 1: Desaturation (for "stunned" or "frozen" states)
    float gray = dot(color, vec3(0.299, 0.587, 0.114));
    color = mix(color, vec3(gray), desaturation);
    
    // Step 2: Damage tint (red overlay that fades)
    color = mix(color, color * vec3(1.0, 0.3, 0.3), damage_tint);
    
    // Step 3: Flash (overrides everything — pure color at max intensity)
    color = mix(color, flash_color.rgb, flash_intensity);
    
    COLOR = vec4(color, tex.a);
}
```

### I-Frame Blink Pattern

```gdscript
class_name IFrameBlinker
extends Node

@export var target: CanvasItem
@export var blink_interval: float = 0.08
@export var i_frame_duration: float = 0.6

var _blink_timer: float = 0.0
var _i_frame_timer: float = 0.0
var _is_invincible: bool = false

func start_i_frames() -> void:
    _is_invincible = true
    _i_frame_timer = i_frame_duration
    _blink_timer = 0.0

func is_invincible() -> bool:
    return _is_invincible

func _process(delta: float) -> void:
    if not _is_invincible:
        return
    
    _i_frame_timer -= delta
    if _i_frame_timer <= 0.0:
        _is_invincible = false
        target.modulate.a = 1.0
        return
    
    _blink_timer += delta
    if _blink_timer >= blink_interval:
        _blink_timer -= blink_interval
        # Toggle between visible and semi-transparent
        target.modulate.a = 0.0 if target.modulate.a > 0.5 else 1.0
```

---

## 6. Dissolve & Death Effects

### Noise-Based Dissolve

```glsl
// dissolve.gdshader
shader_type canvas_item;

uniform float dissolve_amount : hint_range(0.0, 1.0) = 0.0;
uniform sampler2D dissolve_noise : filter_linear;
uniform vec4 edge_color : source_color = vec4(1.0, 0.5, 0.0, 1.0);
uniform float edge_width : hint_range(0.0, 0.2) = 0.05;
uniform float edge_emission : hint_range(1.0, 5.0) = 2.0;

void fragment() {
    vec4 tex = texture(TEXTURE, UV);
    float noise = texture(dissolve_noise, UV).r;
    
    // Discard pixels where noise is below dissolve threshold
    float threshold = dissolve_amount;
    if (noise < threshold) {
        discard;
    }
    
    // Glowing edge at the dissolve boundary
    float edge = smoothstep(threshold, threshold + edge_width, noise);
    vec3 color = mix(edge_color.rgb * edge_emission, tex.rgb, edge);
    
    COLOR = vec4(color, tex.a);
}
```

### Dissolve Controller

```gdscript
class_name DissolveEffect
extends Node

@export var target: CanvasItem
@export var dissolve_duration: float = 0.8
@export var dissolve_curve: Curve  ## Optional easing curve

signal dissolve_finished

var _tween: Tween

## Start dissolving the target. Emits dissolve_finished when done.
func dissolve() -> void:
    if not target or not target.material:
        return
    
    var mat: ShaderMaterial = target.material as ShaderMaterial
    if not mat:
        return
    
    # Ensure unique material
    if not mat.resource_local_to_scene:
        target.material = mat.duplicate()
        mat = target.material as ShaderMaterial
    
    mat.set_shader_parameter(&"dissolve_amount", 0.0)
    
    if _tween and _tween.is_valid():
        _tween.kill()
    
    _tween = create_tween()
    
    if dissolve_curve:
        # Use custom curve for non-linear dissolve
        _tween.tween_method(
            func(t: float) -> void:
                var value: float = dissolve_curve.sample(t)
                mat.set_shader_parameter(&"dissolve_amount", value),
            0.0, 1.0, dissolve_duration
        )
    else:
        _tween.tween_method(
            func(value: float) -> void:
                mat.set_shader_parameter(&"dissolve_amount", value),
            0.0, 1.0, dissolve_duration
        ).set_ease(Tween.EASE_IN).set_trans(Tween.TRANS_QUAD)
    
    _tween.finished.connect(func() -> void: dissolve_finished.emit())

## Reverse dissolve (materialize effect).
func materialize() -> void:
    if not target or not target.material:
        return
    var mat: ShaderMaterial = target.material as ShaderMaterial
    if not mat:
        return
    
    if _tween and _tween.is_valid():
        _tween.kill()
    
    _tween = create_tween()
    _tween.tween_method(
        func(value: float) -> void: mat.set_shader_parameter(&"dissolve_amount", value),
        1.0, 0.0, dissolve_duration
    ).set_ease(Tween.EASE_OUT)
```

### Pixel Dissolve (Retro Style)

```glsl
// pixel_dissolve.gdshader
shader_type canvas_item;

uniform float dissolve_amount : hint_range(0.0, 1.0) = 0.0;
uniform float pixel_size : hint_range(1.0, 32.0) = 8.0;

// Hash function for pseudo-random per-pixel-block values
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void fragment() {
    vec4 tex = texture(TEXTURE, UV);
    
    // Snap UV to pixel grid
    vec2 pixel_uv = floor(UV * vec2(textureSize(TEXTURE, 0)) / pixel_size);
    float rand = hash(pixel_uv);
    
    if (rand < dissolve_amount) {
        discard;
    }
    
    COLOR = tex;
}
```

---

## 7. Outline Shaders

### Pixel-Perfect Outline (Sprite Edge Detection)

```glsl
// outline.gdshader
shader_type canvas_item;

uniform vec4 outline_color : source_color = vec4(0.0, 0.0, 0.0, 1.0);
uniform float outline_width : hint_range(0.0, 10.0, 1.0) = 1.0;
uniform bool enabled = true;

void fragment() {
    vec4 tex = texture(TEXTURE, UV);
    
    if (!enabled) {
        COLOR = tex;
        return;
    }
    
    vec2 size = vec2(textureSize(TEXTURE, 0));
    vec2 pixel_size = outline_width / size;
    
    // Sample alpha in 4 cardinal directions
    float alpha_up = texture(TEXTURE, UV + vec2(0.0, -pixel_size.y)).a;
    float alpha_down = texture(TEXTURE, UV + vec2(0.0, pixel_size.y)).a;
    float alpha_left = texture(TEXTURE, UV + vec2(-pixel_size.x, 0.0)).a;
    float alpha_right = texture(TEXTURE, UV + vec2(pixel_size.x, 0.0)).a;
    
    // If any neighbor has alpha but this pixel doesn't → outline pixel
    float outline_alpha = max(max(alpha_up, alpha_down), max(alpha_left, alpha_right));
    
    if (tex.a < 0.1 && outline_alpha > 0.1) {
        // This pixel is transparent but adjacent to opaque → draw outline
        COLOR = outline_color;
    } else {
        COLOR = tex;
    }
}
```

### 8-Direction Outline (Smoother Diagonals)

```glsl
// outline_8dir.gdshader
shader_type canvas_item;

uniform vec4 outline_color : source_color = vec4(0.0, 0.0, 0.0, 1.0);
uniform float outline_width : hint_range(0.0, 10.0, 1.0) = 1.0;

void fragment() {
    vec4 tex = texture(TEXTURE, UV);
    vec2 size = vec2(textureSize(TEXTURE, 0));
    vec2 ps = outline_width / size;
    
    // Sample all 8 neighbors
    float neighbors = 0.0;
    neighbors += texture(TEXTURE, UV + vec2(-ps.x, -ps.y)).a;
    neighbors += texture(TEXTURE, UV + vec2(0.0, -ps.y)).a;
    neighbors += texture(TEXTURE, UV + vec2(ps.x, -ps.y)).a;
    neighbors += texture(TEXTURE, UV + vec2(-ps.x, 0.0)).a;
    neighbors += texture(TEXTURE, UV + vec2(ps.x, 0.0)).a;
    neighbors += texture(TEXTURE, UV + vec2(-ps.x, ps.y)).a;
    neighbors += texture(TEXTURE, UV + vec2(0.0, ps.y)).a;
    neighbors += texture(TEXTURE, UV + vec2(ps.x, ps.y)).a;
    
    if (tex.a < 0.1 && neighbors > 0.0) {
        COLOR = outline_color;
    } else {
        COLOR = tex;
    }
}
```

### Selection/Hover Outline (Animated)

```glsl
// selection_outline.gdshader
shader_type canvas_item;

uniform vec4 outline_color : source_color = vec4(1.0, 0.84, 0.0, 1.0);
uniform float outline_width : hint_range(0.0, 10.0, 1.0) = 2.0;
uniform float pulse_speed : hint_range(0.5, 5.0) = 2.0;
uniform float pulse_min : hint_range(0.0, 1.0) = 0.5;
uniform bool active = false;

void fragment() {
    vec4 tex = texture(TEXTURE, UV);
    
    if (!active) {
        COLOR = tex;
        return;
    }
    
    vec2 size = vec2(textureSize(TEXTURE, 0));
    vec2 ps = outline_width / size;
    
    float neighbors = 0.0;
    neighbors += texture(TEXTURE, UV + vec2(0.0, -ps.y)).a;
    neighbors += texture(TEXTURE, UV + vec2(0.0, ps.y)).a;
    neighbors += texture(TEXTURE, UV + vec2(-ps.x, 0.0)).a;
    neighbors += texture(TEXTURE, UV + vec2(ps.x, 0.0)).a;
    
    if (tex.a < 0.1 && neighbors > 0.0) {
        float pulse = mix(pulse_min, 1.0, sin(TIME * pulse_speed) * 0.5 + 0.5);
        COLOR = vec4(outline_color.rgb, outline_color.a * pulse);
    } else {
        COLOR = tex;
    }
}
```

---

## 8. Color Manipulation Shaders

### Greyscale / Desaturation

```glsl
// greyscale.gdshader
shader_type canvas_item;

uniform float amount : hint_range(0.0, 1.0) = 1.0;

void fragment() {
    vec4 tex = texture(TEXTURE, UV);
    float gray = dot(tex.rgb, vec3(0.299, 0.587, 0.114));  // luminance weights
    COLOR = vec4(mix(tex.rgb, vec3(gray), amount), tex.a);
}
```

### Color Replace (Palette Swap)

```glsl
// palette_swap.gdshader
shader_type canvas_item;

uniform vec4 source_color : source_color = vec4(1.0, 0.0, 0.0, 1.0);
uniform vec4 target_color : source_color = vec4(0.0, 0.0, 1.0, 1.0);
uniform float tolerance : hint_range(0.0, 1.0) = 0.1;

void fragment() {
    vec4 tex = texture(TEXTURE, UV);
    float dist = distance(tex.rgb, source_color.rgb);
    
    if (dist < tolerance) {
        float blend = smoothstep(tolerance, 0.0, dist);
        COLOR = vec4(mix(tex.rgb, target_color.rgb, blend), tex.a);
    } else {
        COLOR = tex;
    }
}
```

### Palette Texture Swap (Flexible Color Variants)

```glsl
// palette_texture.gdshader
shader_type canvas_item;

// Original palette: 1-pixel-tall strip of the sprite's colors
uniform sampler2D original_palette : filter_nearest;
// Replacement palette: same dimensions, different colors
uniform sampler2D swap_palette : filter_nearest;
uniform float palette_size : hint_range(2.0, 64.0) = 16.0;
uniform float tolerance : hint_range(0.001, 0.05) = 0.01;

void fragment() {
    vec4 tex = texture(TEXTURE, UV);
    vec3 result = tex.rgb;
    
    // Find the closest color in the original palette
    float best_dist = 999.0;
    float best_index = 0.0;
    
    for (float i = 0.0; i < palette_size; i += 1.0) {
        float u = (i + 0.5) / palette_size;
        vec3 pal_color = texture(original_palette, vec2(u, 0.5)).rgb;
        float dist = distance(tex.rgb, pal_color);
        if (dist < best_dist) {
            best_dist = dist;
            best_index = i;
        }
    }
    
    // If close enough to a palette color, replace it
    if (best_dist < tolerance) {
        float u = (best_index + 0.5) / palette_size;
        result = texture(swap_palette, vec2(u, 0.5)).rgb;
    }
    
    COLOR = vec4(result, tex.a);
}
```

### Color Tint (Status Effects)

```gdscript
class_name StatusTinter
extends Node

@export var target: CanvasItem

const TINTS: Dictionary = {
    &"poison": Color(0.2, 0.8, 0.2, 0.3),
    &"fire": Color(1.0, 0.3, 0.0, 0.3),
    &"ice": Color(0.3, 0.6, 1.0, 0.3),
    &"electric": Color(1.0, 1.0, 0.2, 0.3),
    &"shadow": Color(0.3, 0.0, 0.5, 0.3),
}

var _active_tint: StringName = &""
var _tween: Tween

## Apply a status tint. Blends with modulate for simplicity.
func apply_tint(status: StringName) -> void:
    if status not in TINTS:
        return
    _active_tint = status
    var tint: Color = TINTS[status]
    
    if _tween and _tween.is_valid():
        _tween.kill()
    
    _tween = create_tween().set_loops()
    _tween.tween_property(target, ^"modulate", Color.WHITE.blend(tint), 0.3)
    _tween.tween_property(target, ^"modulate", Color.WHITE, 0.3)

## Remove the active tint.
func clear_tint() -> void:
    _active_tint = &""
    if _tween and _tween.is_valid():
        _tween.kill()
    target.modulate = Color.WHITE
```

---

## 9. Water & Liquid Shaders

### Simple 2D Water Surface

```glsl
// water_surface.gdshader
shader_type canvas_item;

uniform vec4 water_color : source_color = vec4(0.1, 0.3, 0.7, 0.6);
uniform float wave_speed : hint_range(0.1, 5.0) = 1.5;
uniform float wave_amplitude : hint_range(0.001, 0.05) = 0.01;
uniform float wave_frequency : hint_range(1.0, 20.0) = 8.0;
uniform float foam_threshold : hint_range(0.0, 1.0) = 0.85;
uniform sampler2D noise_tex : filter_linear, repeat_enable;

void fragment() {
    // Animate UV for wave motion
    vec2 wave_uv = UV;
    wave_uv.x += sin(UV.y * wave_frequency + TIME * wave_speed) * wave_amplitude;
    wave_uv.y += cos(UV.x * wave_frequency * 0.8 + TIME * wave_speed * 0.7) * wave_amplitude * 0.5;
    
    // Sample noise for surface variation
    float noise = texture(noise_tex, wave_uv * 2.0 + vec2(TIME * 0.1, 0.0)).r;
    
    // Foam at peaks
    float foam = step(foam_threshold, noise);
    
    // Depth gradient (darker at bottom)
    float depth = UV.y;
    vec3 deep_color = water_color.rgb * 0.5;
    vec3 surface_color = water_color.rgb;
    vec3 color = mix(surface_color, deep_color, depth);
    
    // Add foam highlights
    color = mix(color, vec3(0.9, 0.95, 1.0), foam * 0.6);
    
    COLOR = vec4(color, water_color.a);
}
```

### Water Reflection (Screen-Space Distortion)

```glsl
// water_reflection.gdshader
shader_type canvas_item;

uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap;
uniform float distortion_strength : hint_range(0.0, 0.05) = 0.01;
uniform float wave_speed : hint_range(0.1, 5.0) = 1.0;
uniform float wave_frequency : hint_range(1.0, 20.0) = 10.0;
uniform vec4 tint : source_color = vec4(0.2, 0.4, 0.8, 0.4);

void fragment() {
    // Distort screen UV for reflection ripple
    vec2 distorted_uv = SCREEN_UV;
    distorted_uv.x += sin(SCREEN_UV.y * wave_frequency + TIME * wave_speed) * distortion_strength;
    distorted_uv.y += cos(SCREEN_UV.x * wave_frequency * 0.7 + TIME * wave_speed * 0.8) * distortion_strength * 0.5;
    
    // Flip Y for reflection
    distorted_uv.y = SCREEN_UV.y - (distorted_uv.y - SCREEN_UV.y);
    
    vec4 reflection = texture(screen_tex, distorted_uv);
    vec4 tex = texture(TEXTURE, UV);
    
    // Blend reflection with water tint
    vec3 color = mix(reflection.rgb, tint.rgb, tint.a);
    
    COLOR = vec4(color, tex.a);
}
```

> **Setup:** Place a `ColorRect` or `Sprite2D` with this shader where the water surface is. It reads the screen behind it and distorts it as a reflection. Requires the reflected objects to be drawn BEFORE the water node (lower in the scene tree or on a lower CanvasLayer).

---

## 10. Distortion & Heat Haze

### Heat Haze / Shimmer

```glsl
// heat_haze.gdshader
shader_type canvas_item;

uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap;
uniform sampler2D distortion_noise : filter_linear, repeat_enable;
uniform float distortion_strength : hint_range(0.0, 0.05) = 0.005;
uniform float scroll_speed : hint_range(0.01, 1.0) = 0.1;
uniform float noise_scale : hint_range(0.1, 5.0) = 1.0;

void fragment() {
    // Scrolling noise for distortion direction
    vec2 noise_uv = UV * noise_scale + vec2(0.0, TIME * scroll_speed);
    vec2 distortion = texture(distortion_noise, noise_uv).rg * 2.0 - 1.0;
    
    // Apply distortion to screen UV
    vec2 distorted = SCREEN_UV + distortion * distortion_strength;
    
    COLOR = texture(screen_tex, distorted);
    COLOR.a = texture(TEXTURE, UV).a;  // use original alpha for shape masking
}
```

### Shockwave / Ripple

```glsl
// shockwave.gdshader
shader_type canvas_item;

uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap;
uniform float wave_center_x : hint_range(0.0, 1.0) = 0.5;
uniform float wave_center_y : hint_range(0.0, 1.0) = 0.5;
uniform float wave_radius : hint_range(0.0, 1.0) = 0.0;
uniform float wave_thickness : hint_range(0.01, 0.2) = 0.05;
uniform float wave_strength : hint_range(0.0, 0.1) = 0.02;

void fragment() {
    vec2 center = vec2(wave_center_x, wave_center_y);
    float dist = distance(SCREEN_UV, center);
    
    vec2 displaced_uv = SCREEN_UV;
    
    // Only distort within the ring (radius ± thickness)
    float ring = smoothstep(wave_radius - wave_thickness, wave_radius, dist)
               * smoothstep(wave_radius + wave_thickness, wave_radius, dist);
    
    if (ring > 0.0) {
        vec2 direction = normalize(SCREEN_UV - center);
        displaced_uv += direction * wave_strength * ring;
    }
    
    COLOR = texture(screen_tex, displaced_uv);
}
```

### Shockwave Controller

```gdscript
class_name ShockwaveEffect
extends ColorRect

## Play from the center of the screen.
## Attach this script to a full-screen ColorRect on a top CanvasLayer.

@export var wave_duration: float = 0.6
@export var max_radius: float = 0.5
@export var strength: float = 0.03

var _tween: Tween

func _ready() -> void:
    # Start invisible (no wave)
    var mat: ShaderMaterial = material as ShaderMaterial
    if mat:
        mat.set_shader_parameter(&"wave_radius", 0.0)
        mat.set_shader_parameter(&"wave_strength", 0.0)

## Trigger a shockwave at the given screen position (0-1 range).
func trigger(screen_pos: Vector2) -> void:
    var mat: ShaderMaterial = material as ShaderMaterial
    if not mat:
        return
    
    if _tween and _tween.is_valid():
        _tween.kill()
    
    mat.set_shader_parameter(&"wave_center_x", screen_pos.x)
    mat.set_shader_parameter(&"wave_center_y", screen_pos.y)
    mat.set_shader_parameter(&"wave_strength", strength)
    mat.set_shader_parameter(&"wave_radius", 0.0)
    
    _tween = create_tween()
    _tween.set_parallel()
    
    # Expand the ring
    _tween.tween_method(
        func(r: float) -> void: mat.set_shader_parameter(&"wave_radius", r),
        0.0, max_radius, wave_duration
    ).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_QUAD)
    
    # Fade out the strength
    _tween.tween_method(
        func(s: float) -> void: mat.set_shader_parameter(&"wave_strength", s),
        strength, 0.0, wave_duration
    ).set_ease(Tween.EASE_IN)

## Convenience: convert world position to screen UV for trigger().
func world_to_screen_uv(world_pos: Vector2, camera: Camera2D) -> Vector2:
    var viewport: Viewport = get_viewport()
    var screen_pos: Vector2 = camera.get_screen_center_position()
    var vp_size: Vector2 = Vector2(viewport.size)
    var offset: Vector2 = world_pos - screen_pos + vp_size * 0.5
    return offset / vp_size
```

---

## 11. 2D Lighting & Shadows

### PointLight2D Setup

Godot has built-in 2D lighting. Every `CanvasItem` can interact with `Light2D` nodes.

```gdscript
class_name DynamicLight
extends PointLight2D

## A gameplay light that can be toggled, flickered, and faded.

@export var flicker_enabled: bool = false
@export var flicker_speed: float = 10.0
@export var flicker_amount: float = 0.15

var _base_energy: float
var _noise: FastNoiseLite

func _ready() -> void:
    _base_energy = energy
    _noise = FastNoiseLite.new()
    _noise.noise_type = FastNoiseLite.TYPE_SIMPLEX
    _noise.frequency = 0.5

func _process(delta: float) -> void:
    if flicker_enabled:
        var noise_val: float = _noise.get_noise_1d(Time.get_ticks_msec() * 0.001 * flicker_speed)
        energy = _base_energy + noise_val * flicker_amount * _base_energy

## Smoothly turn the light on or off.
func set_active(active: bool, duration: float = 0.3) -> void:
    var tween: Tween = create_tween()
    tween.tween_property(self, ^"energy", _base_energy if active else 0.0, duration)

## Pulse the light (for pickups, alerts).
func pulse(target_energy: float, duration: float = 0.2) -> void:
    var tween: Tween = create_tween()
    tween.tween_property(self, ^"energy", target_energy, duration * 0.3)
    tween.tween_property(self, ^"energy", _base_energy, duration * 0.7)
```

### Light Occlusion (2D Shadows)

```
Scene Setup for 2D Shadows:
├── PointLight2D (or DirectionalLight2D)
│   └── Set texture to a soft radial gradient
├── Wall (StaticBody2D)
│   ├── CollisionShape2D
│   └── LightOccluder2D
│       └── OccluderPolygon2D (match wall shape)
└── Player (uses default CanvasItem light mode)

Properties to configure:
- Light2D.shadow_enabled = true
- Light2D.shadow_filter = PCF5 or PCF13 (soft shadows)
- Light2D.shadow_filter_smooth = 1.0 to 4.0
- CanvasItem.light_mask — which lights affect this node (bitmask)
- Light2D.range_item_cull_mask — which items this light illuminates
```

### Normal Map Lighting

For sprites that respond to 2D lights with depth:

```gdscript
## Apply a normal map to a Sprite2D for 2D lighting depth.
## The normal map must match the sprite dimensions.
func setup_normal_map(sprite: Sprite2D, normal_map: Texture2D) -> void:
    var mat := CanvasItemMaterial.new()
    # CanvasItemMaterial handles normal maps natively
    sprite.material = mat
    
    # Assign the normal map in the CanvasTexture
    var canvas_tex := CanvasTexture.new()
    canvas_tex.diffuse_texture = sprite.texture
    canvas_tex.normal_texture = normal_map
    sprite.texture = canvas_tex
```

### Day/Night Cycle

```gdscript
class_name DayNightCycle
extends CanvasModulate

## Simple day/night cycle via CanvasModulate.
## CanvasModulate tints the ENTIRE canvas — one per scene max.

@export var cycle_duration: float = 120.0  ## Full day in seconds
@export var dawn_color: Color = Color(0.9, 0.7, 0.5)
@export var day_color: Color = Color.WHITE
@export var dusk_color: Color = Color(0.8, 0.5, 0.3)
@export var night_color: Color = Color(0.15, 0.15, 0.3)

var _time_of_day: float = 0.25  ## 0=midnight, 0.25=dawn, 0.5=noon, 0.75=dusk

func _process(delta: float) -> void:
    _time_of_day = fmod(_time_of_day + delta / cycle_duration, 1.0)
    color = _get_sky_color(_time_of_day)

func _get_sky_color(t: float) -> Color:
    # 4-stop gradient: night → dawn → day → dusk → night
    if t < 0.2:
        return night_color.lerp(dawn_color, t / 0.2)
    elif t < 0.3:
        return dawn_color.lerp(day_color, (t - 0.2) / 0.1)
    elif t < 0.7:
        return day_color
    elif t < 0.8:
        return day_color.lerp(dusk_color, (t - 0.7) / 0.1)
    elif t < 0.9:
        return dusk_color.lerp(night_color, (t - 0.8) / 0.1)
    else:
        return night_color

## Get the current time as a 0-1 value (0=midnight, 0.5=noon).
func get_time_of_day() -> float:
    return _time_of_day

## Set time of day directly (0-1).
func set_time_of_day(t: float) -> void:
    _time_of_day = fmod(t, 1.0)
    color = _get_sky_color(_time_of_day)
```

---

## 12. Screen-Space Effects & Post-Processing

Post-processing in Godot 2D: place a `ColorRect` on the **highest CanvasLayer** with a shader that reads `hint_screen_texture`.

### Setup Pattern

```
Scene Tree:
├── CanvasLayer (layer = 0)    ← game content
│   ├── Player
│   ├── Enemies
│   └── ...
└── CanvasLayer (layer = 100)  ← post-processing
    └── ColorRect (full-screen, shader attached)
        └── ShaderMaterial → post_process.gdshader
```

```gdscript
## Attach to the post-processing ColorRect.
## Automatically sizes to viewport.
class_name PostProcessRect
extends ColorRect

func _ready() -> void:
    # Fill entire screen
    set_anchors_and_offsets_preset(PRESET_FULL_RECT)
    mouse_filter = Control.MOUSE_FILTER_IGNORE  # don't block input
```

### Vignette

```glsl
// vignette.gdshader
shader_type canvas_item;

uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap;
uniform float vignette_intensity : hint_range(0.0, 1.0) = 0.4;
uniform float vignette_opacity : hint_range(0.0, 1.0) = 0.5;
uniform float vignette_roundness : hint_range(0.0, 5.0) = 2.0;

void fragment() {
    vec4 screen = texture(screen_tex, SCREEN_UV);
    
    vec2 uv = SCREEN_UV;
    uv *= 1.0 - uv;  // creates a 0-at-edges, max-at-center pattern
    float vignette = uv.x * uv.y * 15.0;
    vignette = pow(vignette, vignette_intensity * vignette_roundness);
    vignette = clamp(vignette, 0.0, 1.0);
    
    vec3 color = screen.rgb * mix(1.0, vignette, vignette_opacity);
    COLOR = vec4(color, 1.0);
}
```

### CRT / Scanline Effect

```glsl
// crt.gdshader
shader_type canvas_item;

uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap;
uniform float scanline_opacity : hint_range(0.0, 1.0) = 0.3;
uniform float scanline_count : hint_range(50.0, 500.0) = 200.0;
uniform float curvature : hint_range(0.0, 0.1) = 0.03;
uniform float vignette_strength : hint_range(0.0, 1.0) = 0.3;
uniform float brightness : hint_range(0.5, 1.5) = 1.1;

vec2 curve(vec2 uv) {
    uv = uv * 2.0 - 1.0;
    uv *= 1.0 + curvature * dot(uv, uv);
    return uv * 0.5 + 0.5;
}

void fragment() {
    vec2 curved_uv = curve(SCREEN_UV);
    
    // Outside the curved screen = black
    if (curved_uv.x < 0.0 || curved_uv.x > 1.0 || curved_uv.y < 0.0 || curved_uv.y > 1.0) {
        COLOR = vec4(0.0, 0.0, 0.0, 1.0);
        return;
    }
    
    vec3 color = texture(screen_tex, curved_uv).rgb;
    
    // Scanlines
    float scanline = sin(curved_uv.y * scanline_count * 3.14159) * 0.5 + 0.5;
    color *= 1.0 - scanline_opacity * (1.0 - scanline);
    
    // Vignette
    vec2 vig_uv = curved_uv * (1.0 - curved_uv);
    float vig = vig_uv.x * vig_uv.y * 15.0;
    vig = pow(vig, vignette_strength);
    color *= vig;
    
    // Brightness compensation
    color *= brightness;
    
    COLOR = vec4(color, 1.0);
}
```

### Chromatic Aberration

```glsl
// chromatic_aberration.gdshader
shader_type canvas_item;

uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap;
uniform float strength : hint_range(0.0, 0.02) = 0.005;
uniform float radial_falloff : hint_range(0.0, 2.0) = 1.0;

void fragment() {
    vec2 direction = SCREEN_UV - vec2(0.5);
    float dist = length(direction);
    float falloff = pow(dist, radial_falloff);
    vec2 offset = direction * strength * falloff;
    
    float r = texture(screen_tex, SCREEN_UV + offset).r;
    float g = texture(screen_tex, SCREEN_UV).g;
    float b = texture(screen_tex, SCREEN_UV - offset).b;
    
    COLOR = vec4(r, g, b, 1.0);
}
```

### Low-Health Danger Effect

```gdscript
class_name DangerVFX
extends Node

## Combines vignette darkening + red tint + pulsing when health is low.

@export var post_process_rect: ColorRect
@export var health_component: Node  ## Must have `health` and `max_health` properties
@export var danger_threshold: float = 0.3  ## Start effect below 30% HP

var _base_vignette: float = 0.4
var _danger_active: bool = false

func _process(_delta: float) -> void:
    if not post_process_rect or not health_component:
        return
    
    var mat: ShaderMaterial = post_process_rect.material as ShaderMaterial
    if not mat:
        return
    
    var ratio: float = float(health_component.health) / float(health_component.max_health)
    
    if ratio < danger_threshold:
        if not _danger_active:
            _danger_active = true
        
        # Intensity increases as health drops (0 at threshold → 1 at 0 HP)
        var intensity: float = 1.0 - (ratio / danger_threshold)
        
        # Pulsing vignette
        var pulse: float = sin(Time.get_ticks_msec() * 0.004 * (1.0 + intensity)) * 0.5 + 0.5
        var vignette: float = _base_vignette + intensity * 0.4 * pulse
        mat.set_shader_parameter(&"vignette_intensity", vignette)
        mat.set_shader_parameter(&"vignette_opacity", 0.5 + intensity * 0.3)
    else:
        if _danger_active:
            _danger_active = false
            mat.set_shader_parameter(&"vignette_intensity", _base_vignette)
            mat.set_shader_parameter(&"vignette_opacity", 0.5)
```

---

## 13. GPUParticles2D

GPU-driven particles for high-count effects (hundreds to thousands). Processed on the GPU, minimal CPU overhead.

### Configuration Overview

```
GPUParticles2D Properties:
├── emitting: bool           — start/stop emission
├── amount: int              — max particle count (power of 2 recommended)
├── lifetime: float          — seconds each particle lives
├── one_shot: bool           — emit once then stop
├── preprocess: float        — simulate ahead (avoid empty start)
├── speed_scale: float       — global speed multiplier
├── explosiveness: float     — 0=steady stream, 1=all at once (burst)
├── randomness: float        — lifetime variation
├── fixed_fps: int           — lock particle update rate (0=unlimited)
├── process_material          — ParticleProcessMaterial (the behavior)
└── texture                   — sprite for each particle
```

### ParticleProcessMaterial Key Properties

```gdscript
## Create a burst explosion effect (enemy death, crate break).
func create_explosion_particles() -> GPUParticles2D:
    var particles := GPUParticles2D.new()
    particles.amount = 32
    particles.lifetime = 0.6
    particles.one_shot = true
    particles.explosiveness = 1.0
    
    var mat := ParticleProcessMaterial.new()
    
    # Emission shape
    mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
    mat.emission_sphere_radius = 4.0
    
    # Direction & spread
    mat.direction = Vector3(0.0, -1.0, 0.0)  # upward (Y is up in particle space)
    mat.spread = 180.0  # full circle
    
    # Velocity
    mat.initial_velocity_min = 80.0
    mat.initial_velocity_max = 200.0
    
    # Gravity
    mat.gravity = Vector3(0.0, 400.0, 0.0)  # pull down
    
    # Scale
    mat.scale_min = 0.5
    mat.scale_max = 1.5
    var scale_curve := CurveTexture.new()
    var curve := Curve.new()
    curve.add_point(Vector2(0.0, 1.0))
    curve.add_point(Vector2(1.0, 0.0))
    scale_curve.curve = curve
    mat.scale_curve = scale_curve  # shrink over lifetime
    
    # Color
    var gradient := GradientTexture1D.new()
    var grad := Gradient.new()
    grad.add_point(0.0, Color(1.0, 0.8, 0.2, 1.0))   # yellow
    grad.add_point(0.5, Color(1.0, 0.3, 0.0, 0.8))    # orange
    grad.add_point(1.0, Color(0.3, 0.0, 0.0, 0.0))    # fade out
    gradient.gradient = grad
    mat.color_ramp = gradient
    
    # Damping (air resistance)
    mat.damping_min = 20.0
    mat.damping_max = 40.0
    
    particles.process_material = mat
    return particles
```

### Particle Pooling Pattern

```gdscript
class_name ParticlePool
extends Node

## Pool of reusable GPUParticles2D nodes.
## Pre-creates particles to avoid instantiation during gameplay.

@export var particle_scene: PackedScene
@export var pool_size: int = 16

var _pool: Array[GPUParticles2D] = []
var _next_index: int = 0

func _ready() -> void:
    for i: int in pool_size:
        var p: GPUParticles2D = particle_scene.instantiate() as GPUParticles2D
        p.emitting = false
        p.one_shot = true
        add_child(p)
        _pool.append(p)

## Emit a particle effect at the given position. Returns the particle node.
func emit_at(pos: Vector2) -> GPUParticles2D:
    var p: GPUParticles2D = _pool[_next_index]
    _next_index = (_next_index + 1) % pool_size
    
    p.global_position = pos
    p.restart()
    p.emitting = true
    return p

## Emit with custom color override.
func emit_colored(pos: Vector2, color: Color) -> GPUParticles2D:
    var p: GPUParticles2D = emit_at(pos)
    # Tint via modulate (faster than changing material)
    p.modulate = color
    return p
```

---

## 14. CPUParticles2D

CPU-processed particles. Lower max count than GPU but more flexible: supports custom update logic, works on all hardware, and is easier to debug.

### When to Use CPU vs GPU Particles

| Feature | GPUParticles2D | CPUParticles2D |
|---|---|---|
| Max practical count | 10,000+ | ~500 |
| Performance for high counts | Excellent | Poor |
| Custom per-particle logic | Not possible | Via code |
| Platform compatibility | Needs GPU compute | Always works |
| Sub-emitters | ✅ | ❌ |
| Attractors/Turbulence | ✅ | ❌ |
| Trail rendering | ✅ | ❌ |
| Collision with tilemap | Manual | Manual |
| Debug visibility | Hard | Easy |

```gdscript
## Simple dust puff using CPUParticles2D (landing, footsteps).
func create_dust_puff() -> CPUParticles2D:
    var particles := CPUParticles2D.new()
    particles.amount = 8
    particles.lifetime = 0.4
    particles.one_shot = true
    particles.explosiveness = 0.9
    
    particles.emission_shape = CPUParticles2D.EMISSION_SHAPE_SPHERE
    particles.emission_sphere_radius = 6.0
    
    particles.direction = Vector2(0.0, -1.0)  # upward
    particles.spread = 60.0
    particles.initial_velocity_min = 20.0
    particles.initial_velocity_max = 50.0
    particles.gravity = Vector2(0.0, 80.0)
    
    particles.scale_amount_min = 1.0
    particles.scale_amount_max = 2.0
    
    # Fade out over lifetime
    var gradient := Gradient.new()
    gradient.add_point(0.0, Color(0.7, 0.65, 0.55, 0.6))
    gradient.add_point(1.0, Color(0.7, 0.65, 0.55, 0.0))
    particles.color_ramp = gradient
    
    return particles
```

---

## 15. Particle Patterns for Common Effects

### Blood/Hit Splatter

```gdscript
class_name HitSplatter
extends Node2D

@export var blood_texture: Texture2D
@export var amount: int = 12

var _particles: GPUParticles2D

func _ready() -> void:
    _particles = GPUParticles2D.new()
    _particles.amount = amount
    _particles.lifetime = 0.5
    _particles.one_shot = true
    _particles.explosiveness = 1.0
    _particles.texture = blood_texture
    
    var mat := ParticleProcessMaterial.new()
    mat.direction = Vector3(0.0, -1.0, 0.0)
    mat.spread = 90.0
    mat.initial_velocity_min = 60.0
    mat.initial_velocity_max = 180.0
    mat.gravity = Vector3(0.0, 500.0, 0.0)
    mat.damping_min = 10.0
    mat.damping_max = 30.0
    mat.scale_min = 0.3
    mat.scale_max = 1.0
    
    var grad_tex := GradientTexture1D.new()
    var grad := Gradient.new()
    grad.add_point(0.0, Color(0.8, 0.0, 0.0, 1.0))
    grad.add_point(0.8, Color(0.5, 0.0, 0.0, 0.8))
    grad.add_point(1.0, Color(0.3, 0.0, 0.0, 0.0))
    grad_tex.gradient = grad
    mat.color_ramp = grad_tex
    
    _particles.process_material = mat
    add_child(_particles)

## Emit at a position with directional bias (away from hit direction).
func splatter(pos: Vector2, hit_direction: Vector2) -> void:
    global_position = pos
    # Rotate particles to spray away from hit
    _particles.rotation = hit_direction.angle() - PI / 2.0
    _particles.restart()
    _particles.emitting = true
```

### Coin/Pickup Collect

```gdscript
class_name CollectVFX
extends GPUParticles2D

## Sparkle burst when collecting items. Attach directly to the pickup.

func _ready() -> void:
    amount = 16
    lifetime = 0.4
    one_shot = true
    explosiveness = 1.0
    emitting = false
    
    var mat := ParticleProcessMaterial.new()
    mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_SPHERE
    mat.emission_sphere_radius = 8.0
    mat.spread = 180.0
    mat.initial_velocity_min = 30.0
    mat.initial_velocity_max = 80.0
    mat.gravity = Vector3.ZERO
    mat.damping_min = 50.0
    mat.damping_max = 80.0
    mat.scale_min = 0.3
    mat.scale_max = 0.8
    
    var grad_tex := GradientTexture1D.new()
    var grad := Gradient.new()
    grad.add_point(0.0, Color(1.0, 0.9, 0.3, 1.0))   # gold
    grad.add_point(0.5, Color(1.0, 1.0, 0.6, 0.8))    # bright
    grad.add_point(1.0, Color(1.0, 1.0, 1.0, 0.0))    # fade
    grad_tex.gradient = grad
    mat.color_ramp = grad_tex
    
    process_material = mat

## Call this when the item is collected. Self-destructs after particles finish.
func play_and_free() -> void:
    # Detach from parent so we stay at the collection position
    var pos: Vector2 = global_position
    get_parent().remove_child(self)
    get_tree().current_scene.add_child(self)
    global_position = pos
    
    restart()
    emitting = true
    
    # Free after particles expire
    await get_tree().create_timer(lifetime + 0.1).timeout
    queue_free()
```

### Trail Effect (Movement Trail)

```gdscript
class_name TrailEffect
extends Line2D

## A movement trail that follows a target node.
## Uses Line2D with a gradient for fade effect.

@export var target: Node2D
@export var trail_length: int = 20
@export var trail_width: float = 4.0

func _ready() -> void:
    width = trail_width
    default_color = Color.WHITE
    
    # Gradient from opaque to transparent
    gradient = Gradient.new()
    gradient.add_point(0.0, Color(1.0, 1.0, 1.0, 1.0))  # newest point (opaque)
    gradient.add_point(1.0, Color(1.0, 1.0, 1.0, 0.0))   # oldest point (transparent)
    
    # Top-level so it doesn't rotate/scale with the target
    top_level = true

func _process(_delta: float) -> void:
    if not target:
        return
    
    # Add current position at the front
    add_point(target.global_position, 0)
    
    # Remove excess points
    while get_point_count() > trail_length:
        remove_point(get_point_count() - 1)
```

### Footstep Dust

```gdscript
class_name FootstepDust
extends Node

## Spawns small dust puffs when the character lands or runs.
## Designed to be a child of a CharacterBody2D.

@export var character: CharacterBody2D
@export var dust_scene: PackedScene  ## CPUParticles2D scene

var _was_on_floor: bool = false
var _step_timer: float = 0.0
var _step_interval: float = 0.25  ## seconds between footsteps while running

func _physics_process(delta: float) -> void:
    if not character:
        return
    
    # Landing dust (bigger puff)
    var on_floor: bool = character.is_on_floor()
    if on_floor and not _was_on_floor:
        _spawn_dust(1.5)
    _was_on_floor = on_floor
    
    # Running dust (small puffs)
    if on_floor and absf(character.velocity.x) > 30.0:
        _step_timer += delta
        if _step_timer >= _step_interval:
            _step_timer = 0.0
            _spawn_dust(0.7)
    else:
        _step_timer = 0.0

func _spawn_dust(scale_mult: float) -> void:
    if not dust_scene:
        return
    var dust: CPUParticles2D = dust_scene.instantiate() as CPUParticles2D
    dust.global_position = character.global_position + Vector2(0, 8)  # at feet
    dust.scale = Vector2.ONE * scale_mult
    character.get_parent().add_child(dust)
    dust.emitting = true
    # Auto-free after lifetime
    get_tree().create_timer(dust.lifetime + 0.1).timeout.connect(dust.queue_free)
```

---

## 16. Visual Shader Editor

The Visual Shader editor is a node-based alternative to writing shader code. Useful for artists and visual learners.

### When to Use Visual Shaders

| Situation | Recommendation |
|---|---|
| Quick prototyping | Visual Shader |
| Artist-created effects | Visual Shader |
| Complex math/loops | Code shader |
| Reuse across projects | Code shader |
| Team collaboration (VCS) | Code shader (diff-friendly) |
| Performance-critical | Code shader (more control) |
| Learning shaders | Visual Shader (immediate feedback) |

### Creating a Visual Shader

1. Create a `ShaderMaterial` on your node
2. In the material, create a new `VisualShader`
3. Set shader type to `CanvasItem`
4. Click the shader to open the Visual Shader editor

### Key Visual Shader Nodes

```
Commonly Used Nodes:
├── Input
│   ├── Texture → samples TEXTURE (the sprite)
│   ├── ScreenTexture → reads screen behind
│   ├── UV → texture coordinates
│   └── Time → TIME value
├── Math
│   ├── VectorOp → add, subtract, multiply vectors
│   ├── ScalarOp → add, subtract, multiply scalars
│   ├── Mix → linear interpolation
│   ├── SmoothStep → smooth thresholding
│   └── Step → hard threshold
├── Color
│   ├── ColorParameter → uniform color
│   └── ColorOp → blend, screen, overlay
├── Texture
│   ├── Texture2D → sample any texture
│   └── CurveTexture → sample a curve
└── Output
    └── Fragment → COLOR output
```

### Visual Shader to Code Conversion

Visual Shaders compile to the same shader language. You can inspect the generated code:

1. Open the Visual Shader
2. Click the **Code** button in the editor toolbar
3. Copy the generated GLSL code
4. Create a new `.gdshader` file and paste
5. Clean up variable names and remove unused uniforms

> **Tip:** Start with Visual Shader for prototyping, then convert to code for production. Code shaders are easier to version control, share, and optimize.

---

## 17. Shader Composition & Reuse

### Shader Include Files (Godot 4.x)

```glsl
// common.gdshaderinc — reusable functions
// Place in res://shaders/includes/

float random(vec2 uv) {
    return fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
}

float noise(vec2 uv) {
    vec2 i = floor(uv);
    vec2 f = fract(uv);
    f = f * f * (3.0 - 2.0 * f);  // smoothstep
    
    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));
    
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

vec3 rgb_to_hsv(vec3 c) {
    vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
    vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
    vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
    float d = q.x - min(q.w, q.y);
    float e = 1.0e-10;
    return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv_to_rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return c.z * mix(vec3(1.0), rgb, c.y);
}
```

```glsl
// Using the include in a shader:
shader_type canvas_item;

#include "res://shaders/includes/common.gdshaderinc"

uniform float distortion : hint_range(0.0, 1.0) = 0.5;

void fragment() {
    vec4 tex = texture(TEXTURE, UV);
    float n = noise(UV * 10.0 + TIME);
    COLOR = vec4(mix(tex.rgb, vec3(n), distortion), tex.a);
}
```

### Multi-Effect Shader Pattern

Instead of stacking multiple materials (Godot doesn't support this), combine effects into a single shader with toggle uniforms:

```glsl
// multi_effect.gdshader
shader_type canvas_item;

// Flash
uniform bool flash_enabled = false;
uniform float flash_intensity : hint_range(0.0, 1.0) = 0.0;
uniform vec4 flash_color : source_color = vec4(1.0, 1.0, 1.0, 1.0);

// Outline
uniform bool outline_enabled = false;
uniform vec4 outline_color : source_color = vec4(0.0, 0.0, 0.0, 1.0);
uniform float outline_width : hint_range(0.0, 5.0, 1.0) = 1.0;

// Dissolve
uniform bool dissolve_enabled = false;
uniform float dissolve_amount : hint_range(0.0, 1.0) = 0.0;
uniform sampler2D dissolve_noise : filter_linear;
uniform vec4 dissolve_edge_color : source_color = vec4(1.0, 0.5, 0.0, 1.0);
uniform float dissolve_edge_width : hint_range(0.0, 0.1) = 0.04;

void fragment() {
    vec4 tex = texture(TEXTURE, UV);
    vec3 color = tex.rgb;
    float alpha = tex.a;
    
    // --- Dissolve ---
    if (dissolve_enabled) {
        float noise_val = texture(dissolve_noise, UV).r;
        if (noise_val < dissolve_amount) {
            discard;
        }
        float edge = smoothstep(dissolve_amount, dissolve_amount + dissolve_edge_width, noise_val);
        color = mix(dissolve_edge_color.rgb * 2.0, color, edge);
    }
    
    // --- Flash ---
    if (flash_enabled && flash_intensity > 0.0) {
        color = mix(color, flash_color.rgb, flash_intensity);
    }
    
    // --- Outline ---
    if (outline_enabled && alpha < 0.1) {
        vec2 size = vec2(textureSize(TEXTURE, 0));
        vec2 ps = outline_width / size;
        float a_sum = 0.0;
        a_sum += texture(TEXTURE, UV + vec2(0.0, -ps.y)).a;
        a_sum += texture(TEXTURE, UV + vec2(0.0, ps.y)).a;
        a_sum += texture(TEXTURE, UV + vec2(-ps.x, 0.0)).a;
        a_sum += texture(TEXTURE, UV + vec2(ps.x, 0.0)).a;
        if (a_sum > 0.0) {
            color = outline_color.rgb;
            alpha = outline_color.a;
        }
    }
    
    COLOR = vec4(color, alpha);
}
```

### Shader Manager Autoload

```gdscript
class_name ShaderManager
extends Node

## Centralized shader management. Preloads and caches shader resources.
## Register as an Autoload: Project → Project Settings → Autoload → ShaderManager

const SHADERS: Dictionary = {
    &"flash": preload("res://shaders/flash.gdshader"),
    &"dissolve": preload("res://shaders/dissolve.gdshader"),
    &"outline": preload("res://shaders/outline.gdshader"),
    &"multi_effect": preload("res://shaders/multi_effect.gdshader"),
}

## Create a new ShaderMaterial with the named shader. Returns a unique material.
func create_material(shader_name: StringName) -> ShaderMaterial:
    if shader_name not in SHADERS:
        push_warning("ShaderManager: Unknown shader '%s'" % shader_name)
        return null
    var mat := ShaderMaterial.new()
    mat.shader = SHADERS[shader_name]
    return mat

## Apply a shader to a node, replacing any existing material.
## Returns the new material for parameter access.
func apply_shader(node: CanvasItem, shader_name: StringName) -> ShaderMaterial:
    var mat: ShaderMaterial = create_material(shader_name)
    if mat:
        node.material = mat
    return mat

## Remove shader from a node (restore default rendering).
func clear_shader(node: CanvasItem) -> void:
    node.material = null
```

---

## 18. Performance Optimization

### Shader Performance Rules

1. **`discard` is expensive** — avoid in fragment shaders when possible. Use alpha instead.
2. **Branching is OK on uniforms** — `if (uniform_bool)` is optimized out by the compiler when false.
3. **Branching on pixel data is slow** — `if (texture(...).r > 0.5)` causes divergent execution.
4. **Texture reads are the main cost** — minimize `texture()` calls per pixel.
5. **`textureSize()` is free** — cached by the driver, call freely.
6. **`sin`/`cos`/`pow` are fast on GPU** — don't precompute what the GPU handles natively.
7. **Screen texture reads force a copy** — every node reading `hint_screen_texture` triggers a screen copy. Batch post-processing into one shader.

### Particle Performance Rules

| Particle Count | Recommendation |
|---|---|
| < 50 | CPUParticles2D (simpler, debuggable) |
| 50–500 | Either (profile to decide) |
| > 500 | GPUParticles2D only |
| > 5,000 | GPUParticles2D + fixed_fps |

```gdscript
## Optimize particles based on distance from camera.
func _process(_delta: float) -> void:
    var camera_pos: Vector2 = get_viewport().get_camera_2d().global_position
    var dist: float = global_position.distance_to(camera_pos)
    var viewport_size: Vector2 = Vector2(get_viewport().size)
    var max_visible_dist: float = viewport_size.length() * 0.6
    
    if dist > max_visible_dist:
        # Off-screen: disable particles entirely
        if _particles.emitting:
            _particles.emitting = false
    else:
        # Scale particle count with distance (fewer when far away)
        var lod: float = 1.0 - clampf(dist / max_visible_dist, 0.0, 0.8)
        _particles.amount = int(float(_base_amount) * lod)
        if not _particles.emitting:
            _particles.emitting = true
```

### Material Sharing vs Uniqueness

```
Rule of Thumb:
├── Same shader, same parameters (trees, grass) → SHARE material
├── Same shader, different parameters (each enemy's flash) → UNIQUE material
└── Different shader entirely → different material

Shared materials: fewer draw calls, less memory
Unique materials: per-instance control, more draw calls

To share: assign the same ShaderMaterial resource to multiple nodes
To make unique: Check "Resource → Local to Scene" or call .duplicate()
```

### Shader Compilation Stutter

Shaders compile on first use, which can cause a frame stutter. Mitigate:

```gdscript
## Warm up shaders by briefly rendering them off-screen during loading.
func warm_up_shaders(shader_materials: Array[ShaderMaterial]) -> void:
    var hidden_sprite := Sprite2D.new()
    hidden_sprite.modulate = Color(1, 1, 1, 0)  # invisible
    hidden_sprite.position = Vector2(-9999, -9999)  # off-screen
    add_child(hidden_sprite)
    
    for mat: ShaderMaterial in shader_materials:
        hidden_sprite.material = mat
        # Force one frame of rendering
        await get_tree().process_frame
    
    hidden_sprite.queue_free()
```

---

## 19. Common Mistakes

### ❌ Modifying a Shared Material

```gdscript
# WRONG — changes flash for ALL enemies using this material
enemy_sprite.material.set_shader_parameter(&"flash_intensity", 1.0)
```

```gdscript
# RIGHT — ensure unique material first
func _ready() -> void:
    sprite.material = sprite.material.duplicate()

func flash() -> void:
    sprite.material.set_shader_parameter(&"flash_intensity", 1.0)
```

### ❌ Using Deprecated screen_texture

```glsl
// WRONG (Godot 3.x / early 4.x)
// uniform sampler2D SCREEN_TEXTURE;
// vec4 screen = textureLod(SCREEN_TEXTURE, SCREEN_UV, 0.0);

// RIGHT (Godot 4.x)
uniform sampler2D screen_tex : hint_screen_texture, filter_linear_mipmap;

void fragment() {
    vec4 screen = texture(screen_tex, SCREEN_UV);
}
```

### ❌ Multiple Screen Texture Reads Per Layer

```
WRONG — 3 separate ColorRects each reading screen_texture:
├── Vignette (reads screen → copies screen)
├── Chromatic Aberration (reads screen → copies screen)  
└── CRT (reads screen → copies screen)
= 3 screen copies per frame

RIGHT — one ColorRect combining all effects:
└── PostProcess (reads screen once → applies all 3 effects)
= 1 screen copy per frame
```

### ❌ Particles Without one_shot Self-Cleanup

```gdscript
# WRONG — burst particles stay in scene tree forever (just invisible)
var p: GPUParticles2D = explosion_scene.instantiate()
add_child(p)
p.emitting = true

# RIGHT — clean up after particles finish
var p: GPUParticles2D = explosion_scene.instantiate()
add_child(p)
p.emitting = true
p.finished.connect(p.queue_free)  # GPUParticles2D emits 'finished' for one_shot
```

### ❌ Using shader_parameter on Wrong Material Type

```gdscript
# WRONG — CanvasItemMaterial doesn't support set_shader_parameter
sprite.material = CanvasItemMaterial.new()
sprite.material.set_shader_parameter(&"flash", 1.0)  # Error!

# RIGHT — use ShaderMaterial for custom parameters
var mat := ShaderMaterial.new()
mat.shader = preload("res://shaders/flash.gdshader")
sprite.material = mat
mat.set_shader_parameter(&"flash_intensity", 1.0)
```

### ❌ Forgetting Texture Filter Settings

```glsl
// WRONG — blurry pixel art because of default linear filtering
uniform sampler2D noise_tex;

// RIGHT — specify filter explicitly
uniform sampler2D noise_tex : filter_nearest;  // for pixel art
uniform sampler2D noise_tex : filter_linear;   // for smooth gradients
uniform sampler2D noise_tex : filter_linear, repeat_enable;  // for tiling noise
```

### ❌ GPU Particles on Web Export

```
GPUParticles2D does NOT work on web exports (WebGL 2).
Use CPUParticles2D for anything that must run in browser.

Convert in editor: GPUParticles2D menu → "Convert to CPUParticles2D"
This is a one-way operation — keep the original as a backup.
```

---

## 20. Tuning Reference Tables

### Hit Flash Timing by Genre

| Genre | Flash Duration | Flash Color | Notes |
|---|---|---|---|
| Platformer | 0.08–0.12s | White | Short, punchy |
| RPG | 0.10–0.15s | White/Red | Slightly longer, element colored |
| Fighting | 0.06–0.08s | White | Very fast, hitstop handles weight |
| Bullet Hell | 0.05–0.08s | White | Minimal — too many hits |
| Survival | 0.12–0.20s | Red tint | Communicate danger clearly |

### Dissolve Timing

| Context | Duration | Edge Color | Curve |
|---|---|---|---|
| Enemy death | 0.5–0.8s | Orange/fire | Ease-in (slow start, fast end) |
| Teleport out | 0.3–0.5s | Blue/cyan | Linear |
| Teleport in (reverse) | 0.3–0.5s | Blue/cyan | Ease-out |
| Fade to cutscene | 0.8–1.2s | None (clean) | Linear |
| Boss phase transition | 1.0–1.5s | Bright white | Ease-in-out |

### Particle Counts by Effect

| Effect | Amount | Lifetime | Explosiveness | GPU/CPU |
|---|---|---|---|---|
| Dust puff (footstep) | 4–8 | 0.3–0.5s | 0.8 | CPU |
| Landing impact | 8–16 | 0.4–0.6s | 0.9 | CPU |
| Enemy death burst | 16–32 | 0.5–0.8s | 1.0 | Either |
| Coin collect sparkle | 8–16 | 0.3–0.5s | 1.0 | CPU |
| Fire/torch | 20–50 | 0.5–1.0s | 0.0 (stream) | GPU |
| Rain | 200–500 | 1.0–2.0s | 0.0 | GPU |
| Blood splatter | 8–16 | 0.4–0.6s | 1.0 | Either |
| Explosion | 32–64 | 0.6–1.0s | 1.0 | GPU |
| Bullet trail | 10–20 | 0.2–0.3s | 0.0 | GPU |
| Magic aura | 30–60 | 1.0–2.0s | 0.0 | GPU |

### Post-Processing Intensity Guide

| Effect | Subtle | Medium | Heavy | Danger Zone |
|---|---|---|---|---|
| Vignette opacity | 0.1–0.2 | 0.3–0.4 | 0.5–0.6 | > 0.7 (too dark) |
| Chromatic aberration | 0.001–0.003 | 0.005–0.008 | 0.01–0.015 | > 0.02 (headache) |
| Scanline opacity | 0.05–0.1 | 0.15–0.25 | 0.3–0.4 | > 0.5 (illegible) |
| CRT curvature | 0.01–0.02 | 0.03–0.04 | 0.05–0.07 | > 0.1 (extreme) |

### Outline Width by Resolution

| Viewport Resolution | Outline Width (pixels) | Notes |
|---|---|---|
| 320×180 (pixel art) | 1 | Must be exactly 1 for pixel-perfect |
| 640×360 | 1–2 | 1 for thin, 2 for bold |
| 1280×720 | 2–3 | Scale with resolution |
| 1920×1080 | 3–4 | Adjust for art style |

---

## Related Guides

- [G1 Scene Composition](./G1_scene_composition.md) — component scenes for VFX prefabs
- [G2 State Machine](./G2_state_machine.md) — state-driven shader transitions
- [G3 Signal Architecture](./G3_signal_architecture.md) — signals for triggering VFX
- [G5 Physics & Collision](./G5_physics_and_collision.md) — collision layers for particle interactions
- [G6 Camera Systems](./G6_camera_systems.md) — screen shake + visual effect combos
- [G7 TileMap & Terrain](./G7_tilemap_and_terrain.md) — tile-based fog of war shaders
- [G8 Animation Systems](./G8_animation_systems.md) — hit flash + animation integration
- [G9 UI & Control Systems](./G9_ui_control_systems.md) — UI shaders (button glow, transitions)
- [G10 Audio Systems](./G10_audio_systems.md) — audio-visual sync for VFX
- [Camera Theory](../../core/concepts/camera-theory.md) — screen shake theory
- [Combat Theory](../../core/concepts/combat-theory.md) — hit effects and game feel theory
