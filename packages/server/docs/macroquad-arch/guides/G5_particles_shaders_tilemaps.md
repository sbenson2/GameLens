# G5 — Particles, Custom Shaders & Tilemaps

> **Category:** guide · **Engine:** Macroquad 0.4 · **Related:** [R1 Drawing, Input & Audio](../reference/R1_drawing_input_audio.md) · [G3 Camera, Textures & Coroutines](G3_camera_textures_coroutines.md) · [macroquad-arch-rules](../macroquad-arch-rules.md)

---

## Particle Effects with macroquad-particles

The `macroquad-particles` crate provides a lightweight, configuration-driven particle system that integrates directly with Macroquad's rendering pipeline.

### Setup

```toml
# Cargo.toml
[dependencies]
macroquad = "0.4"
macroquad-particles = "0.2.2"
```

> **Compatibility note:** If `macroquad-particles` 0.2.2 fails to compile against your Macroquad version, use git dependencies:
> ```toml
> [patch.crates-io]
> macroquad = { git = "https://github.com/not-fl3/macroquad" }
> macroquad-particles = { git = "https://github.com/not-fl3/macroquad" }
> ```

```rust
use macroquad_particles::{self as particles, ColorCurve, Emitter, EmitterConfig};
```

### EmitterConfig — Defining Particle Behavior

All particle behavior is described by an `EmitterConfig` struct. Key fields:

| Field | Type | Description |
|-------|------|-------------|
| `one_shot` | `bool` | `true` = emit once (explosion), `false` = continuous (fire, smoke) |
| `emitting` | `bool` | Whether the emitter is currently active |
| `lifetime` | `f32` | How long each particle lives (seconds) |
| `lifetime_randomness` | `f32` | 0.0–1.0 randomness factor on lifetime |
| `amount` | `u32` | Particles emitted per cycle |
| `explosiveness` | `f32` | 0.0 = evenly spaced, 1.0 = all at once |
| `initial_direction_spread` | `f32` | Angle in radians (2π = full circle) |
| `initial_velocity` | `f32` | Starting speed (pixels/sec) |
| `initial_velocity_randomness` | `f32` | 0.0–1.0 randomness on velocity |
| `size` | `f32` | Particle size in pixels |
| `size_randomness` | `f32` | 0.0–1.0 randomness on size |
| `gravity` | `Vec2` | Constant acceleration (e.g., `vec2(0.0, 100.0)` for downward pull) |
| `colors_curve` | `ColorCurve` | Start → mid → end color gradient |
| `local_coords` | `bool` | `true` = particles move with emitter, `false` = world-space |
| `texture` | `Option<Texture2D>` | Custom particle sprite (default is a square) |
| `material` | `Option<Material>` | Apply a custom shader to particles |

### Example: Explosion Effect

```rust
fn particle_explosion() -> EmitterConfig {
    EmitterConfig {
        local_coords: false,
        one_shot: true,
        emitting: true,
        lifetime: 0.6,
        lifetime_randomness: 0.3,
        explosiveness: 0.65,
        amount: 40,
        initial_direction_spread: 2.0 * std::f32::consts::PI,
        initial_velocity: 300.0,
        initial_velocity_randomness: 0.8,
        size: 3.0,
        size_randomness: 0.3,
        colors_curve: ColorCurve {
            start: RED,
            mid: ORANGE,
            end: RED,
        },
        ..Default::default()
    }
}
```

### Managing Emitters at Runtime

Store active emitters in a `Vec` and clean up finished ones each frame:

```rust
let mut explosions: Vec<(Emitter, Vec2)> = vec![];

// Trigger on collision
explosions.push((
    Emitter::new(EmitterConfig {
        amount: 60,
        ..particle_explosion()
    }),
    vec2(hit_x, hit_y),
));

// In game loop — draw all active emitters
for (emitter, pos) in explosions.iter_mut() {
    emitter.draw(*pos);
}

// Remove finished one-shot emitters
explosions.retain(|(emitter, _)| emitter.config.emitting);
```

### Example: Continuous Smoke Trail

```rust
fn smoke_trail() -> EmitterConfig {
    EmitterConfig {
        local_coords: true,   // follows the emitter
        one_shot: false,       // continuous
        emitting: true,
        lifetime: 1.2,
        amount: 8,
        explosiveness: 0.0,    // steady stream
        initial_direction_spread: 0.5,
        initial_velocity: 40.0,
        size: 5.0,
        size_randomness: 0.5,
        gravity: vec2(0.0, -20.0), // smoke rises
        colors_curve: ColorCurve {
            start: Color::new(0.6, 0.6, 0.6, 0.8),
            mid: Color::new(0.4, 0.4, 0.4, 0.4),
            end: Color::new(0.2, 0.2, 0.2, 0.0),
        },
        ..Default::default()
    }
}

// Create once, draw every frame at the entity's position
let mut smoke = Emitter::new(smoke_trail());

// In game loop
smoke.draw(vec2(player_x, player_y));
```

---

## Custom Shaders & Materials

Macroquad supports custom GLSL shaders via its `material` module. This enables post-processing effects, animated backgrounds, water distortion, and more.

### Architecture

Macroquad uses **miniquad** as its graphics backend, which supports OpenGL ES 2.0 / WebGL 1.0 shaders (`#version 100`). Shaders consist of:

- **Vertex shader** — transforms vertex positions and passes data to the fragment shader
- **Fragment shader** — runs per-pixel to compute the final color

### Built-in Uniforms

Macroquad injects these uniforms into every shader automatically:

| Uniform | Type | Description |
|---------|------|-------------|
| `_Time` | `vec4` | `x` = time in seconds since start |
| `Model` | `mat4` | Model transformation matrix |
| `Projection` | `mat4` | Projection matrix |
| `Texture` | `sampler2D` | The currently bound texture |
| `_ScreenTexture` | `sampler2D` | Screen contents (for post-processing) |

### Creating a Custom Material

```rust
use macroquad::prelude::*;
use macroquad::material::{
    gl_use_material, gl_use_default_material,
    load_material, MaterialParams, ShaderSource,
};

// 1. Define shaders as string constants
const VERTEX: &str = "#version 100
attribute vec3 position;
attribute vec2 texcoord;
attribute vec4 color0;
varying float iTime;

uniform mat4 Model;
uniform mat4 Projection;
uniform vec4 _Time;

void main() {
    gl_Position = Projection * Model * vec4(position, 1);
    iTime = _Time.x;
}
";

const FRAGMENT: &str = "#version 100
precision lowp float;
varying float iTime;
uniform vec4 _Time;
uniform vec2 iResolution;

void main() {
    vec2 uv = gl_FragCoord.xy / iResolution;
    float r = 0.5 + 0.5 * sin(iTime + uv.x * 6.28);
    float g = 0.5 + 0.5 * sin(iTime + uv.y * 6.28 + 2.09);
    float b = 0.5 + 0.5 * sin(iTime + (uv.x + uv.y) * 3.14 + 4.18);
    gl_FragColor = vec4(r, g, b, 1.0);
}
";

// 2. Load the material with custom uniforms
let material = load_material(
    ShaderSource::Glsl {
        vertex: VERTEX,
        fragment: FRAGMENT,
    },
    MaterialParams {
        uniforms: vec![
            UniformDesc::new("iResolution", UniformType::Float2),
        ],
        ..Default::default()
    },
).unwrap();

// 3. Use the material when drawing
loop {
    clear_background(BLACK);

    // Set uniform values each frame
    material.set_uniform("iResolution", (screen_width(), screen_height()));

    // Activate custom material
    gl_use_material(&material);
    draw_rectangle(0.0, 0.0, screen_width(), screen_height(), WHITE);
    gl_use_default_material(); // IMPORTANT: always switch back

    next_frame().await;
}
```

### Post-Processing with Render Targets

For full-screen effects (CRT scanlines, blur, color grading), render the game to a `RenderTarget` first, then draw that texture with a custom material:

```rust
let render_target = render_target(screen_width() as u32, screen_height() as u32);
render_target.texture.set_filter(FilterMode::Nearest);

loop {
    // Pass 1: Draw game to render target
    set_camera(&Camera2D {
        render_target: Some(render_target.clone()),
        ..Camera2D::from_display_rect(Rect::new(0.0, 0.0, 320.0, 240.0))
    });
    clear_background(BLACK);
    // ... draw game objects here ...

    // Pass 2: Draw render target to screen with post-processing shader
    set_default_camera();
    material.set_uniform("iResolution", (screen_width(), screen_height()));
    gl_use_material(&material);
    draw_texture_ex(
        &render_target.texture,
        0.0, 0.0, WHITE,
        DrawTextureParams {
            dest_size: Some(vec2(screen_width(), screen_height())),
            ..Default::default()
        },
    );
    gl_use_default_material();

    next_frame().await;
}
```

### Loading Shaders from Files

For complex shaders, keep them in separate `.glsl` files:

```rust
// Embed at compile time
const FRAGMENT: &str = include_str!("../assets/shaders/water.glsl");

// Or load at runtime (WASM-compatible via macroquad's async)
let fragment_src = load_string("assets/shaders/water.glsl").await.unwrap();
```

### Rust Ownership Gotcha — Materials

`Material` is a lightweight handle (GPU resource pointer). Cloning is cheap. However, if you drop the last handle, the GPU resources are freed — so store materials in long-lived state, not in a per-frame local variable.

---

## Tilemap Rendering

Macroquad doesn't have a built-in tilemap system, but its `draw_texture_ex` with source rectangles makes tilemap rendering straightforward.

### Basic Tilemap from a Spritesheet

```rust
use macroquad::prelude::*;

const TILE_SIZE: f32 = 16.0;

struct Tilemap {
    texture: Texture2D,
    tiles: Vec<Vec<u32>>,   // 2D grid of tile indices
    cols_in_sheet: u32,      // columns in the spritesheet
}

impl Tilemap {
    fn draw(&self) {
        for (row_idx, row) in self.tiles.iter().enumerate() {
            for (col_idx, &tile_id) in row.iter().enumerate() {
                if tile_id == 0 { continue; } // 0 = empty

                let sheet_x = (tile_id % self.cols_in_sheet) as f32 * TILE_SIZE;
                let sheet_y = (tile_id / self.cols_in_sheet) as f32 * TILE_SIZE;

                draw_texture_ex(
                    &self.texture,
                    col_idx as f32 * TILE_SIZE,
                    row_idx as f32 * TILE_SIZE,
                    WHITE,
                    DrawTextureParams {
                        source: Some(Rect::new(
                            sheet_x, sheet_y, TILE_SIZE, TILE_SIZE,
                        )),
                        ..Default::default()
                    },
                );
            }
        }
    }
}
```

### Loading Tiled/LDtk Maps

For editor-made maps, parse the JSON format and build tile arrays:

```rust
// Using nanoserde for lightweight JSON parsing
use nanoserde::DeJson;

#[derive(DeJson)]
struct TiledLayer {
    data: Vec<u32>,
    width: u32,
    height: u32,
}

async fn load_tiled_layer(path: &str) -> TiledLayer {
    let json = load_string(path).await.unwrap();
    DeJson::deserialize_json(&json).unwrap()
}
```

### Performance: Batching Tile Draws

Macroquad automatically batches `draw_texture_ex` calls that share the same texture and material. For tilemaps this means:

- **DO:** Use a single spritesheet texture for all tiles — one draw call per layer.
- **DON'T:** Load each tile as a separate texture — kills batching.
- **TIP:** For very large maps, only draw tiles visible in the camera viewport:

```rust
fn draw_visible_tiles(tilemap: &Tilemap, camera: &Camera2D) {
    let view = camera.world_to_screen(vec2(0.0, 0.0)); // approximate visible rect
    let start_col = ((-view.x / TILE_SIZE).floor() as i32).max(0) as usize;
    let start_row = ((-view.y / TILE_SIZE).floor() as i32).max(0) as usize;
    let end_col = (start_col + (screen_width() / TILE_SIZE) as usize + 2)
        .min(tilemap.tiles[0].len());
    let end_row = (start_row + (screen_height() / TILE_SIZE) as usize + 2)
        .min(tilemap.tiles.len());

    for row in start_row..end_row {
        for col in start_col..end_col {
            let tile_id = tilemap.tiles[row][col];
            if tile_id == 0 { continue; }
            // ... draw_texture_ex as above ...
        }
    }
}
```

### Tile Collision

See [R2 — Physics & Collision](../reference/R2_physics_collision.md) for AABB-based tilemap collision patterns.

---

## Combining All Three

A common pattern in 2D games: render a tilemap, apply a post-processing shader, and spawn particles on events:

```rust
#[macroquad::main("Particles + Shaders + Tiles")]
async fn main() {
    let tileset = load_texture("assets/tileset.png").await.unwrap();
    tileset.set_filter(FilterMode::Nearest);

    let crt_material = load_material(
        ShaderSource::Glsl { vertex: CRT_VERT, fragment: CRT_FRAG },
        MaterialParams::default(),
    ).unwrap();

    let render_target = render_target(320, 240);
    let mut explosions: Vec<(Emitter, Vec2)> = vec![];

    loop {
        // 1. Draw world to render target
        set_camera(&Camera2D {
            render_target: Some(render_target.clone()),
            ..Camera2D::from_display_rect(Rect::new(0.0, 0.0, 320.0, 240.0))
        });
        clear_background(DARKBLUE);
        // tilemap.draw();
        // draw_game_entities();
        for (emitter, pos) in explosions.iter_mut() {
            emitter.draw(*pos);
        }

        // 2. Post-process to screen
        set_default_camera();
        gl_use_material(&crt_material);
        draw_texture_ex(
            &render_target.texture,
            0.0, 0.0, WHITE,
            DrawTextureParams {
                dest_size: Some(vec2(screen_width(), screen_height())),
                ..Default::default()
            },
        );
        gl_use_default_material();

        // 3. Cleanup finished emitters
        explosions.retain(|(e, _)| e.config.emitting);

        next_frame().await;
    }
}
```

---

## Further Reading

- [E1 — Architecture Overview](../architecture/E1_architecture_overview.md) — Macroquad's two-layer stack
- [G2 — WASM & egui](G2_wasm_and_egui.md) — Deploying shader-heavy games to the web
- [R1 — Drawing, Input & Audio](../reference/R1_drawing_input_audio.md) — Core drawing API reference
- [R2 — Physics & Collision](../reference/R2_physics_collision.md) — Tilemap collision patterns
- [macroquad-particles docs](https://docs.rs/macroquad-particles) — Full EmitterConfig reference
- [Macroquad shader examples](https://github.com/not-fl3/macroquad/blob/master/examples/shadertoy.rs)
