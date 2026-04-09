# G1 — Getting Started with Macroquad

> **Category:** guide · **Engine:** Macroquad 0.4 · **Related:** [macroquad-arch-rules](../macroquad-arch-rules.md)

---

## What is Macroquad?

Macroquad is a simple, batteries-included 2D game library for Rust, heavily inspired by raylib. It intentionally avoids complex Rust patterns like lifetimes and borrows in its public API, making it the most beginner-friendly Rust game library available.

**Best for:** Game jams, 2D games, rapid prototyping, learning Rust through game dev, cross-platform mobile/web games.

**Not ideal for:** Large 3D games, projects needing a full ECS architecture (use Bevy instead), or projects requiring a visual editor.

---

## Prerequisites

- **Rust toolchain:** Install via [rustup.rs](https://rustup.rs). Stable Rust works fine.
- **No system dependencies:** Macroquad bundles everything — no SDL, no GLFW, no external libs needed.

---

## Create a New Project

```bash
cargo new my_game
cd my_game
```

Add Macroquad to `Cargo.toml`:

```toml
[dependencies]
macroquad = "0.4"
```

---

## Minimal Game Loop

Macroquad uses an async main loop with the `#[macroquad::main]` attribute macro:

```rust
use macroquad::prelude::*;

#[macroquad::main("My Game")]
async fn main() {
    loop {
        clear_background(DARKBLUE);

        draw_text("Hello, Macroquad!", 20.0, 40.0, 30.0, WHITE);
        draw_circle(400.0, 300.0, 50.0, YELLOW);
        draw_rectangle(100.0, 200.0, 120.0, 60.0, GREEN);

        next_frame().await
    }
}
```

Run it:

```bash
cargo run
```

The `next_frame().await` call is critical — it yields control back to the event loop, presents the frame, and processes input. Every Macroquad game loop must call this exactly once per iteration.

---

## Window Configuration

```rust
use macroquad::prelude::*;

fn window_conf() -> Conf {
    Conf {
        window_title: "My Game".to_owned(),
        window_width: 800,
        window_height: 600,
        window_resizable: false,
        fullscreen: false,
        ..Default::default()
    }
}

#[macroquad::main(window_conf)]
async fn main() {
    loop {
        clear_background(BLACK);
        next_frame().await
    }
}
```

---

## Drawing

Macroquad provides immediate-mode drawing functions. Everything drawn between `clear_background()` and `next_frame().await` appears on screen.

### Shapes

```rust
// Shapes
draw_line(0.0, 0.0, 100.0, 100.0, 2.0, RED);
draw_rectangle(50.0, 50.0, 200.0, 100.0, BLUE);
draw_rectangle_lines(50.0, 50.0, 200.0, 100.0, 2.0, WHITE);
draw_circle(300.0, 300.0, 40.0, GREEN);
draw_circle_lines(300.0, 300.0, 40.0, 2.0, YELLOW);
draw_triangle(
    vec2(400.0, 100.0),
    vec2(350.0, 200.0),
    vec2(450.0, 200.0),
    ORANGE,
);
draw_poly(500.0, 300.0, 6, 40.0, 0.0, PURPLE); // Hexagon
```

### Text

```rust
// Basic text
draw_text("Score: 100", 10.0, 30.0, 24.0, WHITE);

// Custom font
let font = load_ttf_font("assets/my_font.ttf").await.unwrap();
let params = TextParams {
    font: Some(&font),
    font_size: 32,
    color: GOLD,
    ..Default::default()
};
draw_text_ex("Custom Font!", 10.0, 60.0, params);

// Measure text for centering
let dims = measure_text("Centered", None, 32, 1.0);
let x = (screen_width() - dims.width) / 2.0;
draw_text("Centered", x, screen_height() / 2.0, 32.0, WHITE);
```

---

## Textures and Sprites

```rust
// Load a texture (async — do this once, not every frame)
let texture = load_texture("assets/player.png").await.unwrap();

// In the game loop:
loop {
    clear_background(BLACK);

    // Draw at position
    draw_texture(&texture, 100.0, 100.0, WHITE);

    // Draw with parameters (scale, rotation, source rect for spritesheets)
    draw_texture_ex(
        &texture,
        200.0, 200.0,
        WHITE,
        DrawTextureParams {
            dest_size: Some(vec2(64.0, 64.0)),  // Scale to 64x64
            source: Some(Rect::new(0.0, 0.0, 32.0, 32.0)),  // Spritesheet region
            rotation: 0.0,
            flip_x: false,
            flip_y: false,
            pivot: None,
        },
    );

    next_frame().await
}
```

### Spritesheet Animation

```rust
let spritesheet = load_texture("assets/walk.png").await.unwrap();
let frame_width = 32.0;
let frame_height = 32.0;
let total_frames = 8;
let mut current_frame = 0;
let mut frame_timer = 0.0;
let frame_duration = 0.1; // seconds per frame

loop {
    clear_background(BLACK);

    // Advance animation
    frame_timer += get_frame_time();
    if frame_timer >= frame_duration {
        frame_timer = 0.0;
        current_frame = (current_frame + 1) % total_frames;
    }

    // Draw current frame
    draw_texture_ex(
        &spritesheet,
        100.0, 100.0,
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

    next_frame().await
}
```

---

## Input Handling

### Keyboard

```rust
loop {
    // Continuous (held down)
    if is_key_down(KeyCode::Left) {
        player_x -= 200.0 * get_frame_time();
    }
    if is_key_down(KeyCode::Right) {
        player_x += 200.0 * get_frame_time();
    }

    // Single press (triggers once)
    if is_key_pressed(KeyCode::Space) {
        shoot();
    }

    // Released this frame
    if is_key_released(KeyCode::Escape) {
        break;
    }

    next_frame().await
}
```

### Mouse

```rust
loop {
    let (mx, my) = mouse_position();
    let wheel = mouse_wheel(); // (x_scroll, y_scroll)

    if is_mouse_button_pressed(MouseButton::Left) {
        println!("Clicked at ({}, {})", mx, my);
    }

    if is_mouse_button_down(MouseButton::Right) {
        println!("Right held");
    }

    next_frame().await
}
```

### Touch (Mobile)

```rust
loop {
    for touch in touches() {
        match touch.phase {
            TouchPhase::Started => println!("Touch began at {:?}", touch.position),
            TouchPhase::Moved => println!("Touch moved to {:?}", touch.position),
            TouchPhase::Ended => println!("Touch ended"),
            _ => {}
        }
    }
    next_frame().await
}
```

---

## Audio

```rust
use macroquad::audio::*;

// Load sounds (do once)
let music = load_sound("assets/music.ogg").await.unwrap();
let sfx = load_sound("assets/explosion.wav").await.unwrap();

// Play background music (looped)
play_sound(
    &music,
    PlaySoundParams {
        looped: true,
        volume: 0.5,
    },
);

// Play sound effect (one-shot)
play_sound(
    &sfx,
    PlaySoundParams {
        looped: false,
        volume: 1.0,
    },
);

// Stop a sound
stop_sound(&music);

// Set volume
set_sound_volume(&music, 0.3);
```

---

## Camera

Macroquad's `Camera2D` lets you implement scrolling, zoom, and world-space coordinates:

```rust
use macroquad::prelude::*;

#[macroquad::main("Camera")]
async fn main() {
    let mut camera_pos = vec2(0.0, 0.0);

    loop {
        // Move camera with arrow keys
        if is_key_down(KeyCode::Right) { camera_pos.x += 200.0 * get_frame_time(); }
        if is_key_down(KeyCode::Left) { camera_pos.x -= 200.0 * get_frame_time(); }

        // Set up world-space camera
        let camera = Camera2D {
            target: camera_pos,
            zoom: vec2(1.0 / 400.0, 1.0 / 300.0), // Maps 800x600 area
            ..Default::default()
        };
        set_camera(&camera);

        clear_background(DARKGRAY);
        // Draw world-space objects
        draw_rectangle(-50.0, -50.0, 100.0, 100.0, RED);

        // Switch back to screen space for UI
        set_default_camera();
        draw_text("Score: 0", 10.0, 30.0, 24.0, WHITE);

        next_frame().await
    }
}
```

---

## Built-in UI (Immediate Mode)

Macroquad includes a simple immediate-mode UI:

```rust
use macroquad::ui::{hash, root_ui, widgets};

loop {
    clear_background(BLACK);

    // UI is drawn in screen space
    if root_ui().button(vec2(20.0, 20.0), "Start Game") {
        start_game();
    }

    root_ui().label(vec2(20.0, 60.0), &format!("FPS: {}", get_fps()));

    let mut name = String::new();
    root_ui().input_text(hash!(), "Name", &mut name);

    next_frame().await
}
```

For more complex UI, use the `egui-macroquad` crate:

```toml
[dependencies]
macroquad = "0.4"
egui-macroquad = "0.18"  # Check crates.io for latest compatible version
```

---

## Coroutines

Macroquad supports async coroutines for scripted sequences:

```rust
use macroquad::prelude::*;
use macroquad::experimental::coroutines::start_coroutine;

#[macroquad::main("Coroutines")]
async fn main() {
    // Start a coroutine that runs alongside the game loop
    let _handle = start_coroutine(async move {
        // Wait 2 seconds
        for _ in 0..120 {  // ~2 seconds at 60fps
            next_frame().await;
        }
        println!("Coroutine finished after ~2 seconds!");
    });

    loop {
        clear_background(BLACK);
        draw_text("Running...", 20.0, 40.0, 30.0, WHITE);
        next_frame().await
    }
}
```

---

## WASM / Web Builds

Macroquad has first-class WASM support:

```bash
# Install target
rustup target add wasm32-unknown-unknown

# Build
cargo build --release --target wasm32-unknown-unknown

# The .wasm file is at:
# target/wasm32-unknown-unknown/release/my_game.wasm
```

Create an `index.html`:

```html
<!DOCTYPE html>
<html>
<head><title>My Game</title></head>
<body style="margin:0; overflow:hidden;">
<canvas id="glcanvas" tabindex="1" style="width:100vw;height:100vh;"></canvas>
<script src="https://not-fl3.github.io/miniquad-samples/mq_js_bundle.js"></script>
<script>load("my_game.wasm");</script>
</body>
</html>
```

Serve with any HTTP server (`python3 -m http.server`).

---

## Collision Detection (Manual)

Macroquad doesn't include a physics engine, but provides `Rect` for AABB collision:

```rust
let player = Rect::new(player_x, player_y, 32.0, 32.0);
let enemy = Rect::new(enemy_x, enemy_y, 32.0, 32.0);

if player.overlaps(&enemy) {
    println!("Collision!");
}
```

For circle collision:

```rust
fn circles_collide(p1: Vec2, r1: f32, p2: Vec2, r2: f32) -> bool {
    p1.distance(p2) < r1 + r2
}
```

For real physics, add `rapier2d` directly or use the `macroquad-rapier` community crate.

---

## Project Structure Convention

```
my_game/
├── assets/              # Textures, audio, fonts
│   ├── textures/
│   ├── audio/
│   └── fonts/
├── src/
│   ├── main.rs          # Game loop, state management
│   ├── player.rs        # Player struct and update logic
│   ├── enemies.rs       # Enemy spawning and AI
│   ├── bullets.rs       # Projectile logic
│   └── ui.rs            # Menu screens, HUD
├── Cargo.toml
└── index.html           # For WASM builds
```

Since Macroquad is not ECS-based, game state is typically managed with structs and Vec collections:

```rust
struct Player {
    pos: Vec2,
    speed: f32,
    health: i32,
    texture: Texture2D,
}

struct GameState {
    player: Player,
    enemies: Vec<Enemy>,
    bullets: Vec<Bullet>,
    score: u32,
}
```

---

## Common Pitfalls

1. **Blocking the async loop:** Never use `std::thread::sleep()` — it freezes the window. Use frame counting or coroutines for delays.
2. **Loading assets every frame:** `load_texture()` is async and reads from disk. Load once before the game loop or during a loading screen.
3. **Forgetting `next_frame().await`:** The loop hangs without it. It must be called exactly once per loop iteration.
4. **Screen coordinates:** (0, 0) is top-left, Y increases downward — standard screen space.
5. **WASM file paths:** Asset paths are relative to the HTML file. Ensure assets are served alongside the WASM.
6. **No ECS:** If your game grows complex with many entity types, consider migrating to Bevy. Macroquad shines for small-to-medium projects.
