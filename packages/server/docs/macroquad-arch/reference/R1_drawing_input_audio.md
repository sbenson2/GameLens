# R1 — Drawing, Input & Audio Reference

> **Category:** reference · **Engine:** Macroquad 0.4 · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Getting Started](../guides/G1_getting_started.md) · [macroquad-arch-rules](../macroquad-arch-rules.md)

---

## Drawing Primitives

Macroquad uses an immediate-mode drawing API — call draw functions every frame inside your game loop. Drawing calls are batched automatically for performance.

### Shapes

```rust
use macroquad::prelude::*;

// Rectangle
draw_rectangle(x, y, width, height, color);
draw_rectangle(100.0, 50.0, 200.0, 80.0, BLUE);

// Rectangle with outline only
draw_rectangle_lines(x, y, width, height, thickness, color);
draw_rectangle_lines(100.0, 50.0, 200.0, 80.0, 2.0, WHITE);

// Circle
draw_circle(center_x, center_y, radius, color);
draw_circle(400.0, 300.0, 25.0, RED);

// Circle outline
draw_circle_lines(center_x, center_y, radius, thickness, color);

// Line between two points
draw_line(x1, y1, x2, y2, thickness, color);
draw_line(0.0, 0.0, 800.0, 600.0, 3.0, GREEN);

// Triangle
draw_triangle(v1, v2, v3, color);
draw_triangle(
    Vec2::new(400.0, 100.0),
    Vec2::new(350.0, 200.0),
    Vec2::new(450.0, 200.0),
    YELLOW,
);

// Hexagon
draw_hexagon(center_x, center_y, size, border, border_color, fill_color);

// Polygon (n-sided)
draw_poly(center_x, center_y, sides, radius, rotation_deg, color);
draw_poly(400.0, 300.0, 5, 50.0, 0.0, PURPLE); // pentagon
```

**Coordinate system:** Origin is top-left. X increases right, Y increases down. All coordinates are in screen pixels (logical pixels when DPI scaling applies).

### Text

```rust
// Basic text
draw_text("Score: 100", x, y, font_size, color);
draw_text("Hello, Macroquad!", 20.0, 40.0, 32.0, WHITE);

// Extended text with custom font
let font = load_ttf_font("assets/fonts/pixel.ttf").await.unwrap();
let params = TextParams {
    font: Some(&font),
    font_size: 24,
    color: GOLD,
    ..Default::default()
};
draw_text_ex("Custom Font", 20.0, 80.0, params);

// Measure text before drawing (for centering)
let dims = measure_text("Center Me", None, 32, 1.0);
let x = (screen_width() - dims.width) / 2.0;
draw_text("Center Me", x, 300.0, 32.0, WHITE);
```

### Textures

```rust
// Load a texture (async — use .await in macroquad's async main)
let texture = load_texture("assets/player.png").await.unwrap();

// Draw at position (full size)
draw_texture(&texture, x, y, WHITE);

// Draw with parameters (scale, rotation, source rect)
draw_texture_ex(
    &texture,
    x, y,
    WHITE,
    DrawTextureParams {
        dest_size: Some(Vec2::new(64.0, 64.0)),       // target size
        source: Some(Rect::new(0.0, 0.0, 32.0, 32.0)), // sprite sheet region
        rotation: 0.0,                                  // radians
        flip_x: false,
        flip_y: false,
        pivot: None,                                    // rotation center
    },
);

// Texture filtering (default is linear; use nearest for pixel art)
texture.set_filter(FilterMode::Nearest);
```

### Screen & Clear

```rust
// Get screen dimensions
let w = screen_width();
let h = screen_height();

// Clear the screen (call at start of each frame)
clear_background(BLACK);
```

---

## Input

Macroquad's input API is polling-based — check input state each frame. All functions are free-standing (no resource or object needed).

### Keyboard

```rust
// True every frame the key is held down
if is_key_down(KeyCode::Right) {
    player_x += speed * get_frame_time();
}

// True only on the frame the key was first pressed
if is_key_pressed(KeyCode::Space) {
    jump();
}

// True only on the frame the key was released
if is_key_released(KeyCode::Escape) {
    toggle_pause();
}

// Get the last character typed (for text input)
if let Some(ch) = get_char_pressed() {
    text_buffer.push(ch);
}
```

**Common KeyCode values:** `KeyCode::Up`, `Down`, `Left`, `Right`, `Space`, `Enter`, `Escape`, `Tab`, `A`–`Z`, `Key0`–`Key9`, `LeftShift`, `LeftControl`.

### Mouse

```rust
// Position in screen coordinates (top-left origin)
let (mx, my) = mouse_position();

// Button state
if is_mouse_button_pressed(MouseButton::Left) {
    // clicked this frame
}
if is_mouse_button_down(MouseButton::Left) {
    // held down
}
if is_mouse_button_released(MouseButton::Right) {
    // released this frame
}

// Scroll wheel delta (positive = scroll up)
let (_scroll_x, scroll_y) = mouse_wheel();
```

### Touch (Mobile / WASM)

```rust
// Returns a Vec of active touches
for touch in touches() {
    match touch.phase {
        TouchPhase::Started => { /* finger down */ }
        TouchPhase::Moved => { /* finger moved */ }
        TouchPhase::Ended => { /* finger lifted */ }
        TouchPhase::Cancelled => { /* interrupted */ }
        _ => {}
    }
    let pos = touch.position; // Vec2
}
```

---

## Audio

Macroquad's audio is provided through the `macroquad::audio` module. It's simple and immediate — load a sound, play it.

```rust
use macroquad::audio::*;

// Load sound files (async)
let music = load_sound("assets/audio/bgm.ogg").await.unwrap();
let sfx_shoot = load_sound("assets/audio/shoot.wav").await.unwrap();

// Play once (fire and forget)
play_sound_once(&sfx_shoot);

// Play with parameters
play_sound(
    &music,
    PlaySoundParams {
        looped: true,    // loop forever
        volume: 0.5,     // 0.0 to 1.0
    },
);

// Stop a sound
stop_sound(&music);

// Set volume of a playing sound
set_sound_volume(&music, 0.3);
```

**Supported formats:** WAV and OGG are reliably supported across all platforms. OGG is recommended for music (smaller files), WAV for short sound effects (lower decode overhead).

### Audio Tips

- **Pre-load sounds** during initialization or a loading screen. Loading mid-gameplay can cause hitches, especially on WASM.
- **No spatial audio** built-in. For positional sound, manually adjust volume based on distance.
- **WASM caveat:** Browsers require a user interaction (click/key) before audio can play. Macroquad handles this automatically, but your first sound may be silent if played before any input.

---

## Camera

Macroquad provides a simple 2D camera for scrolling and zooming:

```rust
use macroquad::camera::*;

// Create a camera centered on the player
let camera = Camera2D {
    target: Vec2::new(player_x, player_y),  // world position to center on
    zoom: Vec2::new(1.0 / screen_width() * 2.0, 1.0 / screen_height() * 2.0),
    ..Default::default()
};

set_camera(&camera);

// Draw your game world here (uses camera transform)
draw_circle(player_x, player_y, 16.0, GREEN);

// Switch back to screen coordinates for UI
set_default_camera();

// Draw UI here (not affected by camera)
draw_text("HP: 100", 10.0, 30.0, 24.0, WHITE);
```

### Screen-to-World Conversion

```rust
// Convert mouse screen position to world coordinates
let (mx, my) = mouse_position();
let mouse_world = camera.screen_to_world(Vec2::new(mx, my));
```

---

## Frame Timing

```rust
// Delta time in seconds (time since last frame)
let dt = get_frame_time();

// Use for frame-rate-independent movement
player_x += speed * dt;

// FPS counter
let fps = get_fps();
draw_text(&format!("FPS: {}", fps), 10.0, 20.0, 20.0, GREEN);

// Total elapsed time since app start (seconds)
let elapsed = get_time();
```

---

## Putting It Together: Minimal Game Loop

```rust
use macroquad::prelude::*;

#[macroquad::main("My Game")]
async fn main() {
    let texture = load_texture("assets/player.png").await.unwrap();
    texture.set_filter(FilterMode::Nearest);

    let mut pos = Vec2::new(400.0, 300.0);
    let speed = 200.0;

    loop {
        let dt = get_frame_time();

        // Input
        if is_key_down(KeyCode::Right) { pos.x += speed * dt; }
        if is_key_down(KeyCode::Left)  { pos.x -= speed * dt; }
        if is_key_down(KeyCode::Down)  { pos.y += speed * dt; }
        if is_key_down(KeyCode::Up)    { pos.y -= speed * dt; }

        // Draw
        clear_background(DARKGRAY);
        draw_texture(&texture, pos.x, pos.y, WHITE);
        draw_text(&format!("FPS: {}", get_fps()), 10.0, 20.0, 20.0, GREEN);

        next_frame().await;
    }
}
```
