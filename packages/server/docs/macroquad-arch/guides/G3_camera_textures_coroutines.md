# G3 — Camera, Textures & Coroutines

> **Category:** guide · **Engine:** Macroquad 0.4 · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Getting Started](G1_getting_started.md) · [R1 Drawing, Input & Audio](../reference/R1_drawing_input_audio.md) · [macroquad-arch-rules](../macroquad-arch-rules.md)

---

## Overview

This guide covers three essential Macroquad systems that most games need beyond basic drawing: the **camera** system for viewports and scrolling, **texture & font loading** for visual assets, and **coroutines** for async loading screens and staged initialization.

---

## Camera System

Macroquad provides `Camera2D` and `Camera3D` structs. You activate a camera with `set_camera()` and return to screen-space coordinates with `set_default_camera()`.

### Basic 2D Camera

```rust
use macroquad::prelude::*;

#[macroquad::main("Camera Demo")]
async fn main() {
    let mut camera_pos = vec2(0.0, 0.0);
    let zoom = 0.01; // Smaller = more zoomed out

    loop {
        clear_background(DARKGRAY);

        // Move camera with arrow keys
        if is_key_down(KeyCode::Right) { camera_pos.x += 2.0; }
        if is_key_down(KeyCode::Left)  { camera_pos.x -= 2.0; }
        if is_key_down(KeyCode::Up)    { camera_pos.y -= 2.0; }
        if is_key_down(KeyCode::Down)  { camera_pos.y += 2.0; }

        // Activate the 2D camera — all draws after this are in world space
        set_camera(&Camera2D {
            target: camera_pos,
            zoom: vec2(zoom, zoom * screen_width() / screen_height()),
            ..Default::default()
        });

        // Draw world-space objects
        draw_rectangle(-50.0, -50.0, 100.0, 100.0, RED);
        draw_circle(200.0, 100.0, 30.0, BLUE);

        // Switch back to screen space for HUD
        set_default_camera();
        draw_text("Use arrow keys to scroll", 10.0, 30.0, 30.0, WHITE);

        next_frame().await;
    }
}
```

### Camera Zoom

The `zoom` field on `Camera2D` controls how many world units map to the screen. Key points:

- `zoom` is a `Vec2` — the Y component should account for aspect ratio
- A common pattern: `vec2(zoom, zoom * screen_width() / screen_height())`
- Smaller values = more zoomed out (more world visible)

> **Gotcha — coordinate system:** Macroquad's default screen space has Y pointing **down** (top-left origin). When using `Camera2D`, the Y axis may flip depending on the `zoom` sign. If your world appears upside-down, negate the Y zoom component.

### Screen-to-World Conversion

Convert mouse position to world coordinates:

```rust
fn mouse_world_pos(camera: &Camera2D) -> Vec2 {
    let mouse = vec2(mouse_position().0, mouse_position().1);
    camera.screen_to_world(mouse)
}
```

### Camera-Aware Font Rendering

When rendering text inside a camera view, font size appears distorted because rasterization happens in screen pixels. Use `camera_font_scale()` to fix this:

```rust
use macroquad::text::camera_font_scale;

// Inside your camera-space drawing:
let (font_size, font_scale, font_aspect) = camera_font_scale(30.0);
draw_text_ex(
    "World Label",
    100.0, 50.0,
    TextParams {
        font_size,
        font_scale,
        font_scale_aspect: font_aspect,
        ..Default::default()
    },
);
```

---

## Texture & Font Loading

### Loading Textures

Macroquad's texture loading is async — all `load_*` functions return futures:

```rust
use macroquad::prelude::*;

#[macroquad::main("Textures")]
async fn main() {
    // Load a texture — .await blocks until loaded
    let texture = load_texture("assets/player.png")
        .await
        .expect("Failed to load player texture");

    // Optional: disable texture filtering for pixel art
    texture.set_filter(FilterMode::Nearest);

    loop {
        clear_background(BLACK);
        draw_texture(&texture, 100.0, 100.0, WHITE);
        next_frame().await;
    }
}
```

### Texture Parameters

```rust
// Draw with scaling and rotation
draw_texture_ex(
    &texture,
    x, y,
    WHITE,
    DrawTextureParams {
        dest_size: Some(vec2(64.0, 64.0)),  // Scale to 64x64
        source: Some(Rect::new(0.0, 0.0, 16.0, 16.0)),  // Sprite sheet region
        rotation: 0.5,  // Radians
        flip_x: false,
        flip_y: false,
        pivot: None,  // Rotation pivot point
    },
);
```

### Sprite Sheets

Extract sub-regions from a sprite sheet using the `source` parameter:

```rust
let sheet = load_texture("assets/spritesheet.png").await.unwrap();
sheet.set_filter(FilterMode::Nearest);

let frame_width = 32.0;
let frame_height = 32.0;
let current_frame = 3; // 0-indexed

draw_texture_ex(
    &sheet,
    player_x, player_y,
    WHITE,
    DrawTextureParams {
        source: Some(Rect::new(
            current_frame as f32 * frame_width,
            0.0,
            frame_width,
            frame_height,
        )),
        dest_size: Some(vec2(64.0, 64.0)),
        ..Default::default()
    },
);
```

### Loading Custom Fonts

```rust
let font = load_ttf_font("assets/myfont.ttf")
    .await
    .expect("Failed to load font");

draw_text_ex(
    "Custom Font!",
    100.0, 200.0,
    TextParams {
        font: Some(&font),
        font_size: 48,
        color: YELLOW,
        ..Default::default()
    },
);
```

> **Rust ownership note:** `load_ttf_font` returns an owned `Font`. Since you typically need the font every frame, load it once before your game loop and keep it in a variable or struct. Macroquad fonts are `Clone`-able, but cloning is cheap (they're internally reference-counted).

---

## Coroutines & Loading Screens

Macroquad's coroutine system lets you run async work in the background while continuing to render frames — essential for loading screens.

### The Problem

If you `load_texture("big.png").await` at the top of `main`, nothing renders until the load completes. For multiple assets this means a frozen window.

### Solution: Coroutines

```rust
use macroquad::prelude::*;
use macroquad::experimental::coroutines::start_coroutine;
use macroquad::experimental::collections::storage;

// Define a resource struct to hold loaded assets
struct GameAssets {
    player: Texture2D,
    enemy: Texture2D,
    font: Font,
    tileset: Texture2D,
}

#[macroquad::main("Loading Screen")]
async fn main() {
    // Kick off async loading in a coroutine
    let loading = start_coroutine(async move {
        let player = load_texture("assets/player.png").await.unwrap();
        player.set_filter(FilterMode::Nearest);

        let enemy = load_texture("assets/enemy.png").await.unwrap();
        enemy.set_filter(FilterMode::Nearest);

        let font = load_ttf_font("assets/game_font.ttf").await.unwrap();

        let tileset = load_texture("assets/tileset.png").await.unwrap();
        tileset.set_filter(FilterMode::Nearest);

        // Store assets in global storage for access anywhere
        storage::store(GameAssets {
            player,
            enemy,
            font,
            tileset,
        });
    });

    // Render loading screen while coroutine runs
    while !loading.is_done() {
        clear_background(BLACK);
        draw_text(
            &format!("Loading... {:.0}%", loading.progress() * 100.0),
            screen_width() / 2.0 - 80.0,
            screen_height() / 2.0,
            40.0,
            WHITE,
        );
        next_frame().await;
    }

    // Assets are now loaded — retrieve from storage
    let assets = storage::get::<GameAssets>();

    // Game loop
    loop {
        clear_background(SKYBLUE);
        draw_texture(&assets.player, 100.0, 100.0, WHITE);
        next_frame().await;
    }
}
```

### How Coroutines Work

- `start_coroutine()` takes an `async` block and returns a `Coroutine` handle
- On **WASM/browser**: the coroutine yields to the event loop, allowing rendering between async steps
- On **desktop**: the coroutine may execute synchronously (all `load_*` calls complete immediately from the filesystem), but the pattern still provides a clean loading screen frame
- `loading.is_done()` — check if the coroutine finished
- `loading.progress()` — returns `0.0..1.0` (you may need to manually set progress in more complex loaders)

### Global Storage

`macroquad::experimental::collections::storage` provides a typed global store:

```rust
use macroquad::experimental::collections::storage;

// Store a value (one per type)
storage::store(MyData { ... });

// Retrieve an immutable reference
let data = storage::get::<MyData>();

// Retrieve a mutable reference
let data = storage::get_mut::<MyData>();
```

> **Limitation:** Storage holds exactly one value per type. If you need multiple instances, wrap them in a `Vec` or `HashMap` inside a wrapper struct.

> **Rust gotcha — `experimental` namespace:** Coroutines and storage live under `macroquad::experimental`. Despite the name, they've been stable and widely used for years. The "experimental" label is a conservative API stability marker, not a quality warning.

---

## Putting It Together: Scrolling Game with Loaded Assets

```rust
use macroquad::prelude::*;
use macroquad::experimental::coroutines::start_coroutine;
use macroquad::experimental::collections::storage;

struct Assets {
    player: Texture2D,
    bg: Texture2D,
}

#[macroquad::main("Scrolling Game")]
async fn main() {
    // Loading phase
    let loader = start_coroutine(async {
        let player = load_texture("player.png").await.unwrap();
        player.set_filter(FilterMode::Nearest);
        let bg = load_texture("background.png").await.unwrap();
        storage::store(Assets { player, bg });
    });

    while !loader.is_done() {
        clear_background(BLACK);
        draw_text("Loading...", 10.0, 30.0, 30.0, WHITE);
        next_frame().await;
    }

    let assets = storage::get::<Assets>();
    let mut cam_x = 0.0f32;

    // Game loop
    loop {
        // Input
        if is_key_down(KeyCode::D) { cam_x += 3.0; }
        if is_key_down(KeyCode::A) { cam_x -= 3.0; }

        // Camera
        set_camera(&Camera2D {
            target: vec2(cam_x, 0.0),
            zoom: vec2(0.005, 0.005 * screen_width() / screen_height()),
            ..Default::default()
        });

        // World rendering
        clear_background(SKYBLUE);
        draw_texture(&assets.bg, -500.0, -200.0, WHITE);
        draw_texture(&assets.player, cam_x - 16.0, -16.0, WHITE);

        // HUD
        set_default_camera();
        draw_text(&format!("X: {:.0}", cam_x), 10.0, 30.0, 20.0, WHITE);

        next_frame().await;
    }
}
```

---

## Key Cargo Dependencies

```toml
[dependencies]
macroquad = "0.4"
```

All features in this guide are included in the base `macroquad` crate — no extra dependencies needed.
