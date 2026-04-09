# E1 — Architecture Overview

> **Category:** explanation · **Engine:** Macroquad 0.4 · **Related:** [G1 Getting Started](../guides/G1_getting_started.md) · [macroquad-arch-rules](../macroquad-arch-rules.md)

---

## The Two-Layer Stack

Macroquad is a high-level game library built on top of **miniquad**, a minimal cross-platform graphics abstraction. Understanding this layered architecture helps you know what's happening under the hood and when to reach for lower-level APIs.

```
┌─────────────────────────────┐
│       Your Game Code        │  ← draw_circle(), is_key_pressed(), load_texture()
├─────────────────────────────┤
│         Macroquad           │  ← Immediate-mode API, batching, async, audio
├─────────────────────────────┤
│         Miniquad            │  ← OpenGL/Metal/WebGL, window, input events
├─────────────────────────────┤
│    Platform (OS / WASM)     │  ← Native window or browser canvas
└─────────────────────────────┘
```

### Miniquad (Bottom Layer)

Miniquad is a standalone crate (`miniquad`) that handles:

- Window creation and event loop (no SDL, GLFW, or winit dependency)
- OpenGL 3.3 / OpenGL ES 2.0 / Metal / WebGL rendering backends
- Raw input events (keyboard, mouse, touch, resize)
- Shader compilation and GPU resource management

Miniquad is designed for zero external dependencies on all platforms, which is why Macroquad compiles without installing any system libraries — even on Linux.

### Macroquad (Top Layer)

Macroquad wraps miniquad with a game-developer-friendly API:

- Immediate-mode drawing (`draw_circle`, `draw_texture`, `draw_text`)
- Automatic geometry batching (shapes and sprites are batched into fewer draw calls)
- Async/await game loop
- Texture and sound loading
- Camera system
- Built-in UI widgets
- Coroutine system for scripted sequences

---

## The Async Game Loop

Macroquad's most distinctive architectural choice is its `async` main function. Unlike most Rust game libraries that use a callback-based event loop, Macroquad uses Rust's async/await to give you a linear, top-to-bottom game loop.

```rust
#[macroquad::main("My Game")]
async fn main() {
    // Setup (runs once)
    let texture = load_texture("player.png").await.unwrap();

    // Game loop (runs every frame)
    loop {
        clear_background(BLACK);
        draw_texture(&texture, 100.0, 100.0, WHITE);
        next_frame().await  // Yield to the event loop
    }
}
```

### How It Works Under the Hood

1. The `#[macroquad::main]` attribute macro sets up miniquad's event loop.
2. Your `async fn main()` is wrapped in a future that gets polled once per frame.
3. `next_frame().await` is the yield point — it pauses your function, lets miniquad present the frame and process input events, then resumes your function on the next frame.
4. Asset-loading functions like `load_texture()` are async because they may take multiple frames to complete (especially on WASM where files are fetched over HTTP).

### Why Async Instead of Callbacks?

Traditional game loops in C-style libraries use a callback:

```rust
// NOT how Macroquad works — this is the callback style
fn update() { /* called every frame */ }
fn draw() { /* called every frame */ }
```

The callback approach forces you to store all state in a struct that persists between calls. Macroquad's async approach lets you use local variables that survive across frames:

```rust
// Macroquad: local variables survive across frames naturally
async fn main() {
    let mut score = 0;       // Lives across all frames
    let mut player_x = 0.0;  // No struct needed

    loop {
        if is_key_pressed(KeyCode::Space) {
            score += 1;
        }
        player_x += get_frame_time() * 100.0;

        draw_text(&format!("Score: {}", score), 10.0, 30.0, 24.0, WHITE);
        next_frame().await
    }
}
```

This eliminates a class of Rust borrowing headaches — no `&mut self` conflicts, no `RefCell` for game state, no lifetime parameters on your game struct.

---

## Rendering Model: Immediate Mode

Macroquad uses **immediate-mode rendering**, meaning you issue draw commands every frame and the library handles the rest. There is no scene graph, no retained-mode node tree, and no entity system.

### Frame Lifecycle

Each frame follows this sequence:

```
clear_background()
  → draw_*() calls accumulate geometry in a batch buffer
  → set_camera() / set_default_camera() switch coordinate spaces
  → next_frame().await
    → Macroquad flushes all batched geometry to the GPU
    → Miniquad presents the frame via the platform's swap buffers
    → Input events are processed
    → Control returns to your code at the next loop iteration
```

### Automatic Batching

Macroquad batches draw calls automatically. Consecutive draws using the same texture and shader are merged into a single GPU draw call. A batch break occurs when:

- The texture changes (drawing sprite A then sprite B with different textures)
- The shader changes
- `set_camera()` is called
- A `gl_use_material()` call changes the active material

**Optimization tip:** Sort your draws by texture to minimize batch breaks. Draw all sprites from the same atlas together.

---

## Resource Management (0.4 Changes)

Macroquad 0.4 made a significant change to resource ownership:

### Textures Are Smart Pointers

In 0.3, `Texture2D` was `Copy` — a simple integer handle. This prevented proper cleanup and caused memory leaks when loading/unloading textures mid-game.

In 0.4, `Texture2D` is `Clone` (cheap reference-counted clone). When all clones are dropped, the GPU texture is freed.

```rust
let tex = load_texture("player.png").await.unwrap();
let tex2 = tex.clone();  // Cheap — increments a reference count
// Both tex and tex2 point to the same GPU texture
// Texture is freed when both are dropped
```

### RenderingBackend Ownership

In 0.4, the `RenderingBackend` (miniquad's GPU context) is owned by your code rather than held as a global singleton. In practice, Macroquad manages this for you — but if you drop down to raw miniquad for custom shaders, you'll interact with it directly.

---

## Coordinate Systems

Macroquad uses two coordinate spaces:

### Screen Space (Default)

- Origin at top-left corner `(0, 0)`
- X increases rightward
- Y increases downward
- Units are screen pixels
- `screen_width()` and `screen_height()` return the current window dimensions

```rust
// Draw at top-left corner
draw_text("Hello", 10.0, 30.0, 24.0, WHITE);

// Draw at center of screen
let cx = screen_width() / 2.0;
let cy = screen_height() / 2.0;
draw_circle(cx, cy, 50.0, RED);
```

### World Space (Camera)

When you set a `Camera2D`, all subsequent draw calls use the camera's coordinate system until you call `set_default_camera()`.

```rust
// World-space drawing
let camera = Camera2D {
    target: vec2(player_x, player_y), // Camera follows player
    zoom: vec2(1.0 / 400.0, 1.0 / 300.0),
    ..Default::default()
};
set_camera(&camera);

// These draws are in world coordinates
draw_circle(player_x, player_y, 16.0, BLUE);
draw_rectangle(wall_x, wall_y, 100.0, 200.0, GRAY);

// Switch back to screen space for HUD
set_default_camera();
draw_text("HP: 100", 10.0, 30.0, 24.0, WHITE);
```

---

## Threading Model

Macroquad is **single-threaded**. All drawing, input, and audio happen on the main thread. This is by design — it keeps the API simple and avoids the complexity of thread-safe rendering.

In Macroquad 0.3, calling Macroquad functions from other threads was undefined behavior. In 0.4, it panics with a clear error message instead.

If you need background work (pathfinding, world generation, etc.), use Rust's standard threading or async runtimes for computation, but send results back to the main thread for rendering:

```rust
use std::sync::mpsc;

#[macroquad::main("Threading")]
async fn main() {
    let (tx, rx) = mpsc::channel();

    // Spawn computation on a background thread
    std::thread::spawn(move || {
        let result = expensive_pathfinding();
        tx.send(result).unwrap();
    });

    loop {
        // Check for results non-blockingly
        if let Ok(path) = rx.try_recv() {
            // Use path for rendering on the main thread
        }

        clear_background(BLACK);
        next_frame().await
    }
}
```

---

## Cross-Platform Architecture

Macroquad/miniquad achieves cross-platform support without external dependencies:

| Platform | Backend | Window System | Notes |
|----------|---------|---------------|-------|
| Linux | OpenGL 3.3 | X11 / Wayland (via raw syscalls) | No SDL/GLFW needed |
| macOS | Metal | Cocoa (via objc FFI) | Native Metal, not OpenGL |
| Windows | OpenGL 3.3 | Win32 API | Direct Win32, no GLFW |
| Web (WASM) | WebGL 1/2 | Canvas element | First-class support |
| Android | OpenGL ES 2 | Native Activity | Via miniquad |
| iOS | Metal | UIKit | Via miniquad |

### WASM Architecture

On the web, the architecture changes slightly:

- `load_texture("file.png")` becomes an HTTP fetch (hence why it's `async`)
- The game loop is driven by `requestAnimationFrame`
- `next_frame().await` maps to yielding back to the browser's event loop
- Audio uses the Web Audio API
- File I/O uses browser APIs (no filesystem access)

This is why all asset loading in Macroquad is async — it works the same on native (reads from disk) and web (fetches over HTTP).

---

## When to Drop Down to Miniquad

Macroquad covers most 2D game needs, but sometimes you need raw miniquad:

- **Custom shaders:** Macroquad's `gl_use_material()` allows custom shaders, but complex multi-pass rendering needs miniquad's pipeline API
- **Custom vertex formats:** Macroquad uses a fixed vertex layout; miniquad lets you define your own
- **3D rendering:** Macroquad is primarily 2D; miniquad gives you raw OpenGL/Metal access for 3D
- **Render targets:** Macroquad supports `render_target()` for offscreen rendering, but complex framebuffer setups need miniquad

Access miniquad's context from within Macroquad:

```rust
use macroquad::prelude::*;
use macroquad::miniquad;

// In your game loop:
let ctx = unsafe { miniquad::window::get_internal_gl().quad_context };
// Now you have raw miniquad access for custom rendering
```

---

## Comparison with Bevy's Architecture

| Aspect | Macroquad | Bevy |
|--------|-----------|------|
| Architecture | Immediate-mode, single-threaded | ECS, multi-threaded |
| Rendering | CPU-batched 2D, no scene graph | GPU-driven, render graph |
| State management | Plain structs and Vecs | Components on Entities |
| Learning curve | Low — reads like a script | Medium — ECS concepts required |
| Async model | Game loop is async | Asset loading is async |
| Plugin ecosystem | Small, focused | Large, growing |
| Best for | Jams, prototypes, 2D games, learning | Medium-to-large games, 3D, production |

---

## Key Architectural Decisions Explained

1. **No ECS:** Macroquad intentionally avoids ECS complexity. For small games, a Vec of structs is simpler and faster to write.

2. **No lifetimes in the public API:** Drawing functions take values, not references to borrowed data. This sidesteps Rust's borrow checker for beginners.

3. **Global state:** Macroquad uses thread-local global state internally (the rendering context, input state, etc.). This is why you call `draw_circle()` as a free function instead of `renderer.draw_circle()`.

4. **Async over callbacks:** The async game loop was chosen to make Macroquad feel like writing a simple script while still supporting web's event-driven model.

5. **Zero dependencies:** By using miniquad's raw platform bindings instead of SDL or winit, Macroquad avoids complex build dependencies. `cargo build` just works on every platform.
