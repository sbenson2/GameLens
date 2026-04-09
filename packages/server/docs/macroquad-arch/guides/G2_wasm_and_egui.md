# G2 — WASM Deployment & egui Integration

> **Category:** guide · **Engine:** Macroquad 0.4 · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Getting Started](G1_getting_started.md) · [R1 Drawing, Input & Audio](../reference/R1_drawing_input_audio.md) · [macroquad-arch-rules](../macroquad-arch-rules.md)

---

## Why WASM with Macroquad?

Macroquad was designed for cross-platform from day one. Its underlying graphics layer, **miniquad**, targets WebGL1 natively — meaning your game runs in virtually every browser, including iOS Safari and older Android. Unlike heavier engines, Macroquad WASM builds are typically **200 KB–2 MB** (before assets), making them ideal for web distribution on itch.io or your own site.

---

## Building for WASM

### Prerequisites

```bash
# Add the WASM compile target
rustup target add wasm32-unknown-unknown
```

That's it. Macroquad doesn't need `wasm-bindgen`, `wasm-pack`, or Trunk. The miniquad JS loader handles everything.

### Compile

```bash
# Debug build
cargo build --target wasm32-unknown-unknown

# Release build (always use this for distribution)
cargo build --release --target wasm32-unknown-unknown
```

The output binary is at:
```
target/wasm32-unknown-unknown/release/<crate_name>.wasm
```

### HTML Wrapper

Create an `index.html` that loads the WASM module via miniquad's JS bundle:

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>My Macroquad Game</title>
    <style>
        html, body { margin: 0; padding: 0; overflow: hidden; background: #000; }
        canvas { display: block; margin: 0 auto; }
    </style>
</head>
<body>
    <canvas id="glcanvas" tabindex="1"></canvas>
    <script src="https://not-fl3.github.io/miniquad-samples/mq_js_bundle.js"></script>
    <script>load("my_game.wasm");</script>
</body>
</html>
```

Copy the `.wasm` file next to this HTML and serve it with any HTTP server:

```bash
# Copy the binary
cp target/wasm32-unknown-unknown/release/my_game.wasm ./web/

# Serve (Python)
cd web && python3 -m http.server 8080

# Or use a Rust-based server
cargo install basic-http-server
cd web && basic-http-server .
```

> **Important:** WASM files must be served over HTTP, not opened as `file://`. Browsers block WASM loading from the local filesystem.

### Hosting the JS Bundle Locally

For production, download and self-host the miniquad JS bundle instead of loading it from GitHub:

```bash
curl -o mq_js_bundle.js https://not-fl3.github.io/miniquad-samples/mq_js_bundle.js
```

Then reference it locally in your HTML: `<script src="mq_js_bundle.js"></script>`.

---

## Deploying to itch.io

1. Build with `cargo build --release --target wasm32-unknown-unknown`.
2. Create a folder with your `index.html`, the `.wasm` file, and the `mq_js_bundle.js`.
3. Add your `assets/` folder if applicable.
4. Zip everything into a single archive.
5. Upload to itch.io → set project type to "HTML" → enable "This file will be played in the browser."

### Folder structure for itch.io:

```
game-web/
├── index.html
├── mq_js_bundle.js
├── my_game.wasm
└── assets/
    ├── player.png
    └── shoot.wav
```

---

## Optimizing WASM Size

Macroquad produces small binaries by default, but you can go further:

```toml
# Cargo.toml

[profile.release]
opt-level = "z"       # Optimize for size over speed
lto = true            # Link-time optimization — slower compile, smaller binary
strip = true          # Strip debug symbols
panic = "abort"       # Don't include unwinding code
codegen-units = 1     # Better optimization, slower compile
```

You can also run `wasm-opt` for additional savings:

```bash
# Install binaryen
# macOS: brew install binaryen
# Linux: apt install binaryen

wasm-opt -Oz -o my_game_opt.wasm my_game.wasm
```

---

## Loading Assets in WASM

Macroquad's asset loading functions (`load_texture`, `load_sound`, etc.) work transparently in WASM — they fetch files over HTTP from the same directory as your HTML.

```rust
use macroquad::prelude::*;

#[macroquad::main("Asset Demo")]
async fn main() {
    // This loads over HTTP in WASM, from filesystem on native
    let texture = load_texture("assets/player.png").await.unwrap();

    loop {
        clear_background(BLACK);
        draw_texture(&texture, 100.0, 100.0, WHITE);
        next_frame().await;
    }
}
```

> **Rust ownership note:** `load_texture` returns a `Result<Texture2D, _>`. In WASM, network failures are possible — always handle the error in production code rather than unwrapping blindly.

### Bundling Assets with `include_bytes!`

For small games, you can embed assets directly in the binary to avoid HTTP requests:

```rust
use macroquad::prelude::*;

#[macroquad::main("Embedded Assets")]
async fn main() {
    let bytes = include_bytes!("../assets/player.png");
    let texture = Texture2D::from_file_with_format(bytes, Some(ImageFormat::Png));

    loop {
        clear_background(BLACK);
        draw_texture(&texture, 100.0, 100.0, WHITE);
        next_frame().await;
    }
}
```

This increases binary size but eliminates loading times and avoids CORS issues.

---

## egui Integration

[egui](https://github.com/emilk/egui) is a popular immediate-mode GUI library for Rust. The `egui-macroquad` crate bridges it with Macroquad, giving you rich debug panels, settings menus, and dev tools alongside your game rendering.

### Setup

```toml
[dependencies]
macroquad = "0.4"
egui-macroquad = "0.18"  # Check crates.io for the latest compatible version
```

> **Version compatibility:** `egui-macroquad` tracks both `egui` and `macroquad` versions. Always check the crate's README for the compatibility matrix.

### Basic Usage

```rust
use egui_macroquad::egui;
use macroquad::prelude::*;

#[macroquad::main("egui Demo")]
async fn main() {
    let mut name = String::from("Player 1");
    let mut speed = 5.0_f32;
    let mut show_debug = true;

    loop {
        clear_background(DARKGRAY);

        // --- Game rendering ---
        draw_text("Game World Here", 200.0, 300.0, 40.0, WHITE);

        // --- egui UI pass ---
        egui_macroquad::ui(|egui_ctx| {
            egui::Window::new("Settings").show(egui_ctx, |ui| {
                ui.label("Player Name:");
                ui.text_edit_singleline(&mut name);
                ui.add(egui::Slider::new(&mut speed, 1.0..=20.0).text("Speed"));
                ui.checkbox(&mut show_debug, "Show Debug Info");
            });

            if show_debug {
                egui::Window::new("Debug").show(egui_ctx, |ui| {
                    ui.label(format!("FPS: {}", get_fps()));
                    ui.label(format!("Mouse: {:?}", mouse_position()));
                    ui.label(format!("Frame time: {:.1}ms", get_frame_time() * 1000.0));
                });
            }
        });

        // Draw egui output — MUST be called after egui_macroquad::ui()
        egui_macroquad::draw();

        next_frame().await;
    }
}
```

### How It Works

1. `egui_macroquad::ui(|ctx| { ... })` — runs your egui code, building the UI for this frame.
2. `egui_macroquad::draw()` — renders the egui output on top of your Macroquad scene. Always call this after `ui()` and before `next_frame()`.

egui captures mouse/keyboard input when the pointer is over an egui window. Your game input handling should check whether egui wants the input:

```rust
egui_macroquad::ui(|egui_ctx| {
    // ... your egui windows ...

    // After building UI, check if egui consumed input
    if !egui_ctx.wants_pointer_input() {
        // Safe to handle game mouse input
        if is_mouse_button_pressed(MouseButton::Left) {
            // game click logic
        }
    }

    if !egui_ctx.wants_keyboard_input() {
        // Safe to handle game keyboard input
    }
});
```

### egui in WASM

egui-macroquad works in WASM, but you need two additional JS files for text input and clipboard support:

```html
<canvas id="glcanvas" tabindex="1"></canvas>

<!-- Standard miniquad loader -->
<script src="mq_js_bundle.js"></script>

<!-- egui plugins for WASM (text input + clipboard) -->
<script src="https://nicholasgasior.github.io/egui-macroquad-wasm-example/js/egui_functions.js"></script>

<script>load("my_game.wasm");</script>
```

> **Self-host in production.** Download `egui_functions.js` and serve it locally alongside your game.

---

## Common UI Patterns with egui

### In-Game Console

```rust
let mut console_open = false;
let mut console_log: Vec<String> = Vec::new();
let mut console_input = String::new();

// In your game loop:
egui_macroquad::ui(|egui_ctx| {
    if console_open {
        egui::Window::new("Console")
            .fixed_size([400.0, 300.0])
            .show(egui_ctx, |ui| {
                egui::ScrollArea::vertical().show(ui, |ui| {
                    for line in &console_log {
                        ui.label(line);
                    }
                });
                ui.separator();
                let response = ui.text_edit_singleline(&mut console_input);
                if response.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter)) {
                    console_log.push(format!("> {}", console_input));
                    // Process command here
                    console_input.clear();
                }
            });
    }
});
```

### Performance Overlay

```rust
egui_macroquad::ui(|egui_ctx| {
    egui::Area::new(egui::Id::new("perf"))
        .fixed_pos(egui::pos2(10.0, 10.0))
        .show(egui_ctx, |ui| {
            ui.label(
                egui::RichText::new(format!("FPS: {}", get_fps()))
                    .color(egui::Color32::GREEN)
                    .size(16.0),
            );
        });
});
```

---

## Platform Differences: Native vs. WASM

| Feature | Native | WASM |
|---------|--------|------|
| Asset loading | Filesystem (`std::fs`) | HTTP fetch (async) |
| File saving | `std::fs::write` | `localStorage` via `quad-storage` crate |
| Threading | `std::thread` available | Single-threaded only |
| Clipboard | OS clipboard | Requires JS bridge (egui plugin) |
| Audio | Immediate playback | May require user interaction first |
| Rendering | OpenGL 2.1+ / Metal | WebGL1 (broad compatibility) |
| Binary size | ~5–15 MB | ~200 KB–2 MB (before assets) |

### Persistent Storage in WASM

Use the `quad-storage` crate for key-value storage backed by `localStorage`:

```toml
[dependencies]
quad-storage = "0.1"
```

```rust
use quad_storage::STORAGE;

// Save
STORAGE.lock().unwrap().set("high_score", "9001");

// Load
let score = STORAGE.lock().unwrap().get("high_score");
```

On native, `quad-storage` writes to a local file instead.

---

## Common Pitfalls

1. **Forgetting `egui_macroquad::draw()`:** If you call `ui()` but not `draw()`, the egui interface builds internally but nothing renders. Always pair them.
2. **Draw order:** Call `egui_macroquad::draw()` *after* all Macroquad draw calls but *before* `next_frame().await`. egui renders on top of your scene.
3. **Input conflicts:** When an egui window is focused, it consumes keyboard/mouse events. Check `wants_pointer_input()` / `wants_keyboard_input()` before processing game input.
4. **WASM `file://` loading:** Browsers block WASM from `file://` URLs. Always use an HTTP server for testing.
5. **Missing egui JS plugins:** Text input in egui on WASM requires the `egui_functions.js` script. Without it, text fields won't accept keyboard input.
6. **Asset paths:** Macroquad resolves asset paths relative to the executable on native, but relative to the HTML file in WASM. Keep your `assets/` folder next to both.
