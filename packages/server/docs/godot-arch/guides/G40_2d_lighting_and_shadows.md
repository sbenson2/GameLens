# G40 — 2D Lighting, Shadows & Normal Maps

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C# / Godot Shading Language
> **Related:** [G12 Shaders & Visual Effects](./G12_shaders_and_visual_effects.md) · [G7 Tilemap & Terrain](./G7_tilemap_and_terrain.md) · [G18 Performance Profiling](./G18_performance_profiling.md) · [G38 Game Feel & Juice](./G38_game_feel_and_juice.md)

---

## What This Guide Covers

By default, Godot renders 2D scenes "flat" — no lighting, no shadows, no depth cues. Adding dynamic 2D lighting transforms a bland scene into an atmospheric one: torchlight flickering through a dungeon, sunlight casting long shadows across a platformer, or a neon glow pulsing in a cyberpunk cityscape.

G12 introduces CanvasItem shaders and briefly touches on 2D lighting. This guide goes deep: setting up the full 2D lighting pipeline (`PointLight2D`, `DirectionalLight2D`, `LightOccluder2D`), authoring and applying normal maps for faux-3D depth, configuring shadow properties for crisp or soft edges, using SDF (Signed Distance Field) for shader-driven effects, managing light masks for layered control, and optimizing performance when many lights interact.

**Use this guide when:** you want dynamic 2D lighting with shadows, normal-mapped sprites that react to light, or atmospheric lighting effects in a 2D game.

---

## Table of Contents

1. [How 2D Lighting Works in Godot](#1-how-2d-lighting-works-in-godot)
2. [PointLight2D — Local Light Sources](#2-pointlight2d--local-light-sources)
3. [DirectionalLight2D — Global Lighting](#3-directionallight2d--global-lighting)
4. [Light Textures & Energy](#4-light-textures--energy)
5. [Shadows with LightOccluder2D](#5-shadows-with-lightoccluder2d)
6. [Normal Maps & CanvasTexture](#6-normal-maps--canvastexture)
7. [Specular Highlights](#7-specular-highlights)
8. [Light Masks & Item Masks](#8-light-masks--item-masks)
9. [Blend Modes & Color Effects](#9-blend-modes--color-effects)
10. [SDF (Signed Distance Field) Shadows](#10-sdf-signed-distance-field-shadows)
11. [CanvasModulate for Ambient Darkness](#11-canvasmodulate-for-ambient-darkness)
12. [Dynamic Lighting Patterns](#12-dynamic-lighting-patterns)
13. [Performance Optimization](#13-performance-optimization)
14. [C# Equivalents](#14-c-equivalents)
15. [Common Mistakes](#15-common-mistakes)

---

## 1. How 2D Lighting Works in Godot

Godot's 2D renderer uses a **light pass** system. When no lights exist, sprites render at full brightness. Once you add any `Light2D` node, the engine switches to a lighting model:

```
┌───────────────────────────────────────────────────┐
│                 Render Pipeline                    │
│                                                   │
│  1. Draw all CanvasItems (sprites, tiles, etc.)   │
│  2. For each Light2D in range:                    │
│     a. Apply light texture × color × energy       │
│     b. If shadows enabled → cast from occluders   │
│     c. If normal map present → calculate normals  │
│     d. Blend using selected blend mode            │
│  3. Apply CanvasModulate (ambient color)          │
│  4. Composite final frame                         │
└───────────────────────────────────────────────────┘
```

**Key concepts:**

- **Light texture** — a grayscale texture defining the light's shape and falloff. White = full intensity, black = no light.
- **Occluders** — polygons that block light and create shadows.
- **Normal maps** — textures encoding surface direction per pixel, enabling faux-3D lighting on 2D sprites.
- **Light masks** — bitmask system controlling which lights affect which sprites.

---

## 2. PointLight2D — Local Light Sources

`PointLight2D` is the workhorse for torches, lamps, explosions, and character-carried lights.

### Basic Setup

```
Scene Tree:
├── World (Node2D)
│   ├── Player (CharacterBody2D)
│   │   ├── Sprite2D
│   │   └── PointLight2D        ← light follows the player
│   ├── Torch (Node2D)
│   │   ├── Sprite2D
│   │   └── PointLight2D        ← static light
│   └── TileMapLayer
```

### GDScript — Configuring a Point Light

```gdscript
@onready var light: PointLight2D = $PointLight2D

func _ready() -> void:
    # Light texture — use the built-in radial gradient or a custom PNG
    light.texture = preload("res://assets/lights/soft_circle.png")
    
    # Scale controls the light's reach
    light.texture_scale = 2.0
    
    # Color tints the light
    light.color = Color(1.0, 0.85, 0.6)  # warm torchlight
    
    # Energy controls brightness (>1.0 = overbright)
    light.energy = 1.2
    
    # Enable shadows (requires LightOccluder2D nodes)
    light.shadow_enabled = true
```

### Light Texture Tips

The light texture is **critical** — it defines the light's shape:

| Texture | Effect |
|---------|--------|
| Soft radial gradient (default) | Natural falloff, good for most lights |
| Hard circle | Spotlight effect with sharp edges |
| Cone shape | Flashlight / directional beam |
| Custom noise texture | Flickering, organic light patterns |

**Create a basic light texture** in the editor: use a `GradientTexture2D` with a radial fill from white (center) to black (edge).

---

## 3. DirectionalLight2D — Global Lighting

`DirectionalLight2D` simulates sunlight or moonlight — light coming from a direction rather than a point. It affects the entire viewport.

```gdscript
# Day/night directional light
@onready var sun: DirectionalLight2D = $DirectionalLight2D

func set_time_of_day(hour: float) -> void:
    # Rotate the light direction based on time
    sun.rotation = lerp(-PI / 4.0, PI / 4.0, hour / 24.0)
    
    # Shift color from warm sunrise to cool moonlight
    if hour < 6.0 or hour > 20.0:
        sun.color = Color(0.3, 0.35, 0.6)   # moonlight
        sun.energy = 0.3
    elif hour < 8.0 or hour > 18.0:
        sun.color = Color(1.0, 0.7, 0.4)    # golden hour
        sun.energy = 0.8
    else:
        sun.color = Color(1.0, 0.95, 0.9)   # midday
        sun.energy = 1.0
```

### DirectionalLight2D Properties

- **`max_distance`** — limits how far the light reaches from the camera. Increase for large maps.
- **`height`** — the simulated "Z height" of the light. Affects normal map calculations — higher values produce more overhead lighting, lower values create more dramatic side lighting.

---

## 4. Light Textures & Energy

### Energy and Overbright

The `energy` property multiplies the light's output. Values above `1.0` create overbright effects useful for:

- Explosions (energy = 3.0, quickly tweened to 0)
- Magic spells (energy = 2.0 with colored light)
- Neon signs (energy = 1.5 with saturated colors)

```gdscript
# Flash effect on hit
func flash_light(duration: float = 0.15) -> void:
    var tween: Tween = create_tween()
    light.energy = 3.0
    tween.tween_property(light, "energy", 1.0, duration)
```

### Height Property

The `height` property on `Light2D` (shared by both types) simulates vertical distance between the light and the surface. This **only matters when normal maps are in use**:

- `height = 0` — light is at the surface level, maximum side-lighting effect
- `height = 600` (default) — light is "above," even illumination with subtle normals
- Higher values — progressively flatter, more overhead look

---

## 5. Shadows with LightOccluder2D

Shadows require two things: `shadow_enabled = true` on the light, and `LightOccluder2D` nodes defining what blocks light.

### Setting Up Occluders

```
Scene Tree:
├── Wall (StaticBody2D)
│   ├── Sprite2D
│   ├── CollisionShape2D
│   └── LightOccluder2D        ← add occluder polygon matching the wall shape
```

Create the occluder polygon in the editor:
1. Add a `LightOccluder2D` child to the node that should cast shadows.
2. Create a new `OccluderPolygon2D` resource in its `occluder` property.
3. Draw the polygon to match the sprite's opaque silhouette.

### Occluder on TileMapLayers

For tilemaps, configure occluders in the `TileSet` editor:

1. Open the `TileSet` resource.
2. Select a tile in the TileSet editor.
3. Go to the **Rendering → Occluders** panel.
4. Draw an `OccluderPolygon2D` for each tile that should block light.

### Shadow Properties

```gdscript
# Fine-tune shadow appearance
light.shadow_enabled = true
light.shadow_color = Color(0.0, 0.0, 0.0, 0.7)  # semi-transparent shadows
light.shadow_filter = Light2D.SHADOW_FILTER_PCF5  # smooth edges

# Shadow filter modes:
# SHADOW_FILTER_NONE   — hard, pixelated shadows (fastest)
# SHADOW_FILTER_PCF5   — 5-sample blur (good default)
# SHADOW_FILTER_PCF13  — 13-sample blur (softest, more expensive)
```

### Shadow Filter Smooth Property

`shadow_filter_smooth` controls the blur radius for PCF filters. Higher values = softer shadows but more blur:

```gdscript
light.shadow_filter = Light2D.SHADOW_FILTER_PCF13
light.shadow_filter_smooth = 2.0  # default is 0.0, range is 0.0–20.0
```

---

## 6. Normal Maps & CanvasTexture

Normal maps give 2D sprites the appearance of 3D depth by encoding surface direction per-pixel. A flat sprite becomes a surface that responds dynamically to light position.

### How Normal Maps Work in 2D

A normal map is an RGB texture where:
- **R** → X direction (left-right surface angle)
- **G** → Y direction (up-down surface angle)
- **B** → Z direction (toward the viewer)

The flat blue/purple color `(128, 128, 255)` means "facing directly at the camera" — no lighting variation. Deviations from this color indicate surface curvature that catches or avoids light.

### Applying Normal Maps with CanvasTexture

Godot 4 uses `CanvasTexture` to pair a diffuse sprite with its normal map:

```gdscript
# Method 1: In code
func _ready() -> void:
    var canvas_tex := CanvasTexture.new()
    canvas_tex.diffuse_texture = preload("res://assets/player/player.png")
    canvas_tex.normal_texture = preload("res://assets/player/player_normal.png")
    $Sprite2D.texture = canvas_tex
```

**Method 2: In the Inspector** (preferred for static sprites):
1. Select your `Sprite2D`.
2. In the **Texture** property, click **New CanvasTexture**.
3. Expand **Diffuse** → assign the sprite texture.
4. Expand **Normal** → assign the normal map texture.

### Creating Normal Maps

**From an art tool (best quality):**
- Krita: Filter → Edge Detection → Height to Normal Map
- GIMP: Use the normalmap plugin
- Sprite Illuminator: Dedicated tool for 2D normal maps

**From Godot shaders (procedural, lower quality):**
```glsl
// Generate a simple normal map from height differences
shader_type canvas_item;

uniform sampler2D height_map : hint_default_black;
uniform float strength : hint_range(0.0, 10.0) = 1.0;

void fragment() {
    vec2 pixel_size = TEXTURE_PIXEL_SIZE;
    
    float h_left  = texture(height_map, UV + vec2(-pixel_size.x, 0.0)).r;
    float h_right = texture(height_map, UV + vec2( pixel_size.x, 0.0)).r;
    float h_up    = texture(height_map, UV + vec2(0.0, -pixel_size.y)).r;
    float h_down  = texture(height_map, UV + vec2(0.0,  pixel_size.y)).r;
    
    vec3 normal = normalize(vec3(
        (h_left - h_right) * strength,
        (h_up - h_down) * strength,
        1.0
    ));
    
    COLOR = vec4(normal * 0.5 + 0.5, 1.0);
}
```

### Normal Map Orientation Gotcha

Normal maps created for 3D engines (OpenGL/DirectX) use different Y conventions. If your normal map looks inverted (lighting appears to come from the wrong direction), you have two options:

1. **Flip the green channel** in your image editor.
2. **Use `NORMAL_MAP`** instead of `NORMAL` in your shader — Godot handles the conversion:

```glsl
shader_type canvas_item;
uniform sampler2D normal_map;

void light() {
    // Godot auto-converts 3D-style normal maps when assigned to NORMAL_MAP
    NORMAL_MAP = texture(normal_map, UV).rgb;
}
```

---

## 7. Specular Highlights

`CanvasTexture` also supports a specular map for shiny/reflective surfaces.

```gdscript
var canvas_tex := CanvasTexture.new()
canvas_tex.diffuse_texture = preload("res://assets/armor/armor.png")
canvas_tex.normal_texture = preload("res://assets/armor/armor_normal.png")
canvas_tex.specular_texture = preload("res://assets/armor/armor_specular.png")
canvas_tex.specular_color = Color.WHITE
canvas_tex.specular_shininess = 0.5  # 0.0 = rough, 1.0 = mirror-like

$Sprite2D.texture = canvas_tex
```

**Specular map tips:**
- White pixels = fully reflective, black = matte.
- Metal armor: high specular. Cloth: low/no specular.
- Combine with normal maps for convincing metallic surfaces.

---

## 8. Light Masks & Item Masks

Light masks control which lights affect which sprites. This is essential for:
- Foreground/background separation (torches only light the foreground)
- Player-only lights (UI elements not affected by game lights)
- Layered parallax with independent lighting

### How Masks Work

Both `Light2D` and `CanvasItem` (sprites, etc.) have **range_item_cull_mask** (on lights) and **light_mask** (on items). A light affects an item only if their masks share at least one enabled bit.

```gdscript
# Layer setup example:
# Bit 1 = gameplay layer (default)
# Bit 2 = background layer
# Bit 3 = UI layer (no lighting)

# Torch light — only affects gameplay layer
torch_light.range_item_cull_mask = 1  # bit 1 only

# Background PointLight2D — only affects background
bg_light.range_item_cull_mask = 2     # bit 2 only

# Player sprite — lit by gameplay lights
player_sprite.light_mask = 1          # bit 1

# Background sprite — lit by background lights
bg_sprite.light_mask = 2              # bit 2
```

---

## 9. Blend Modes & Color Effects

`Light2D` supports multiple blend modes through the `blend_mode` property:

| Mode | Enum | Effect | Use Case |
|------|------|--------|----------|
| **Add** | `BLEND_MODE_ADD` | Light color adds to scene | Default lighting, most lights |
| **Sub** | `BLEND_MODE_SUB` | Light color subtracts from scene | Darkness zones, shadow pools |
| **Mix** | `BLEND_MODE_MIX` | Light color mixes/replaces scene | Color washes, tinting |

```gdscript
# Darkness zone — subtracts light to create dark pockets
var dark_zone := PointLight2D.new()
dark_zone.blend_mode = Light2D.BLEND_MODE_SUB
dark_zone.texture = preload("res://assets/lights/soft_circle.png")
dark_zone.color = Color(0.5, 0.5, 0.5)
dark_zone.energy = 1.0
```

---

## 10. SDF (Signed Distance Field) Shadows

`LightOccluder2D` nodes have an `sdf_collision` property. When enabled, the occluder contributes to a real-time signed distance field texture accessible in custom shaders. This opens up advanced effects:

- Soft volumetric shadows
- Distance-based fog near walls
- 2D ambient occlusion

```glsl
// CanvasItem shader reading the SDF
shader_type canvas_item;

void fragment() {
    // texture_sdf() returns the distance to the nearest occluder
    float dist = texture_sdf(SCREEN_UV);
    
    // Darken pixels near walls for ambient occlusion effect
    float ao = smoothstep(0.0, 0.05, dist);
    COLOR.rgb *= mix(0.3, 1.0, ao);
}
```

### SDF Functions Available in Shaders

| Function | Returns |
|----------|---------|
| `texture_sdf(uv)` | Distance to nearest occluder at screen UV |
| `texture_sdf_normal(uv)` | Direction toward nearest occluder |
| `sdf_to_screen_uv(sdf_pos)` | Convert SDF position to screen UV |
| `screen_uv_to_sdf(screen_uv)` | Convert screen UV to SDF position |

**Performance note:** SDF has no cost if you don't use it in shaders. Once any shader reads `texture_sdf()`, the engine generates the SDF texture each frame, which has moderate GPU cost proportional to the number of occluders.

---

## 11. CanvasModulate for Ambient Darkness

`CanvasModulate` multiplies the entire canvas by a color. Use it to create ambient darkness that lights punch through:

```gdscript
# Add a CanvasModulate node to your scene
# Set its color to dark — this is the "unlit" ambient color
$CanvasModulate.color = Color(0.1, 0.1, 0.15)  # dark blue-ish night

# Lights now illuminate against this dark base
# Without CanvasModulate, the scene is fully bright and lights just add glow
```

**Day/night cycle pattern:**

```gdscript
func update_ambient(hour: float) -> void:
    var ambient: Color
    if hour >= 6.0 and hour <= 18.0:
        # Daytime — full brightness
        ambient = Color.WHITE
    elif hour >= 20.0 or hour <= 4.0:
        # Nighttime — dark
        ambient = Color(0.08, 0.08, 0.15)
    else:
        # Transition — lerp between day and night
        var t: float = 0.0
        if hour > 18.0:
            t = (hour - 18.0) / 2.0
        else:
            t = 1.0 - (hour - 4.0) / 2.0
        ambient = Color.WHITE.lerp(Color(0.08, 0.08, 0.15), t)
    
    $CanvasModulate.color = ambient
```

---

## 12. Dynamic Lighting Patterns

### Flickering Torch

```gdscript
class_name FlickeringLight extends PointLight2D

@export var base_energy: float = 1.0
@export var flicker_strength: float = 0.15
@export var flicker_speed: float = 8.0
@export var base_scale: float = 1.5
@export var scale_variation: float = 0.1

var _noise: FastNoiseLite
var _time: float = 0.0

func _ready() -> void:
    _noise = FastNoiseLite.new()
    _noise.seed = randi()
    _noise.frequency = 0.8

func _process(delta: float) -> void:
    _time += delta * flicker_speed
    var noise_val: float = _noise.get_noise_1d(_time)
    
    energy = base_energy + noise_val * flicker_strength
    texture_scale = base_scale + noise_val * scale_variation
```

### Pulsing Pickup Glow

```gdscript
class_name PickupGlow extends PointLight2D

@export var pulse_speed: float = 2.0
@export var min_energy: float = 0.5
@export var max_energy: float = 1.5

func _process(delta: float) -> void:
    var t: float = (sin(Time.get_ticks_msec() / 1000.0 * pulse_speed) + 1.0) / 2.0
    energy = lerp(min_energy, max_energy, t)
```

### Muzzle Flash

```gdscript
func fire_weapon() -> void:
    $MuzzleLight.energy = 4.0
    $MuzzleLight.visible = true
    
    var tween: Tween = create_tween()
    tween.tween_property($MuzzleLight, "energy", 0.0, 0.08)
    tween.tween_callback($MuzzleLight.set.bind("visible", false))
```

---

## 13. Performance Optimization

### Light Count Budget

Each `Light2D` with shadows enabled triggers a shadow render pass. Budget guidelines:

| Platform | Lights with Shadows | Lights without Shadows |
|----------|--------------------|-----------------------|
| Desktop | 8–16 | 30–50 |
| Mobile | 2–4 | 10–20 |
| Web | 4–8 | 15–30 |

### Optimization Techniques

**1. Disable shadows on distant or minor lights:**
```gdscript
func _process(_delta: float) -> void:
    var dist: float = global_position.distance_to(camera_pos)
    shadow_enabled = dist < shadow_draw_distance
```

**2. Use `range_z_min` and `range_z_max` to limit light to specific Z layers.**

**3. Use `range_item_cull_mask` to reduce which sprites a light touches.**

**4. Reduce shadow filter quality for small or distant lights:**
```gdscript
# Small background lights don't need PCF13
small_light.shadow_filter = Light2D.SHADOW_FILTER_NONE
```

**5. Pool PointLight2D nodes** for effects like projectile trails — reuse nodes from a pool (see [G39](./G39_scalable_architecture_and_pooling.md)) instead of instantiating per-projectile.

**6. Simplify occluder polygons** — fewer vertices = faster shadow calculation. A rectangle is much cheaper than a detailed character outline.

---

## 14. C# Equivalents

```csharp
using Godot;

public partial class TorchLight : PointLight2D
{
    [Export] public float BaseEnergy { get; set; } = 1.0f;
    [Export] public float FlickerStrength { get; set; } = 0.15f;

    private FastNoiseLite _noise = new();
    private float _time;

    public override void _Ready()
    {
        _noise.Seed = (int)GD.Randi();
        _noise.Frequency = 0.8f;
        
        // Configure the light
        var canvasTex = new CanvasTexture();
        canvasTex.DiffuseTexture = GD.Load<Texture2D>("res://assets/player.png");
        canvasTex.NormalTexture = GD.Load<Texture2D>("res://assets/player_normal.png");
        // Apply to a sibling Sprite2D
        GetNode<Sprite2D>("../Sprite2D").Texture = canvasTex;
    }

    public override void _Process(double delta)
    {
        _time += (float)delta * 8.0f;
        float noiseVal = _noise.GetNoise1D(_time);
        Energy = BaseEnergy + noiseVal * FlickerStrength;
    }
}
```

---

## 15. Common Mistakes

| Mistake | Fix |
|---------|-----|
| Added Light2D but scene looks the same | You need a **CanvasModulate** to darken the ambient, or the light just adds on top of full brightness |
| Shadows enabled but no shadows visible | You need **LightOccluder2D** nodes with `OccluderPolygon2D` resources assigned |
| Normal maps look inverted | Use `NORMAL_MAP` instead of `NORMAL` in shader, or flip the green channel in your image editor |
| Performance drops with many lights | Reduce shadow-enabled lights, simplify occluder polygons, use light masks to limit interactions |
| Light "bleeds" through walls | Occluder polygons don't fully cover the wall shape — ensure they match tightly with no gaps |
| Tilemap shadows not working | Occluders must be configured per-tile in the **TileSet** editor, not on the TileMapLayer node itself |
| CanvasModulate makes UI dark | Place UI on a **CanvasLayer** with a higher layer value — CanvasModulate only affects the default canvas layer |
| Light2D `height` has no visible effect | Height only affects normal map calculations — it does nothing without normal maps applied to sprites |
