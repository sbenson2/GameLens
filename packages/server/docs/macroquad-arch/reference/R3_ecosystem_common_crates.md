# R3 — Ecosystem & Common Crates

> **Category:** reference · **Engine:** Macroquad 0.4 · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Getting Started](../guides/G1_getting_started.md) · [G2 WASM & egui](../guides/G2_wasm_and_egui.md) · [macroquad-arch-rules](../macroquad-arch-rules.md)

---

## Overview

Macroquad is built on top of **miniquad** — a minimal, zero-dependency graphics backend. The broader ecosystem (sometimes called "the *quads") includes first-party companion crates by the same author (`not-fl3`) and a growing set of community libraries. This reference catalogs the most useful crates for game development with Macroquad 0.4.

The canonical community index is [awesome-quads](https://github.com/ozkriff/awesome-quads), which tracks ~120 projects across the miniquad/macroquad ecosystem.

---

## First-Party Companion Crates

These crates are maintained alongside Macroquad and designed to work seamlessly with it.

### macroquad-tiled

Loads [Tiled](https://www.mapeditor.org/) map files (`.tmx` / `.json`) and renders them with Macroquad's drawing API.

```toml
[dependencies]
macroquad = "0.4"
macroquad-tiled = "0.2"
```

```rust
use macroquad::prelude::*;
use macroquad_tiled as tiled;

#[macroquad::main("Tiled Map")]
async fn main() {
    let tileset_texture = load_texture("tileset.png").await.unwrap();
    let tiled_map_json = load_string("map.json").await.unwrap();
    let map = tiled::load_map(&tiled_map_json, &[("tileset.png", tileset_texture)], &[]).unwrap();

    loop {
        clear_background(BLACK);
        // Draw all layers at position (0, 0)
        map.draw_tiles("ground", Rect::new(0.0, 0.0, 320.0, 240.0), None);
        next_frame().await;
    }
}
```

**Use case:** 2D level design with the free Tiled editor. Supports multiple layers, tile animations, and object layers.

### macroquad-particles

GPU-friendly particle system with a visual editor.

```toml
[dependencies]
macroquad = "0.4"
macroquad-particles = "0.2"
```

```rust
use macroquad::prelude::*;
use macroquad_particles::{self as particles, EmitterConfig, Emitter};

fn explosion_config() -> EmitterConfig {
    EmitterConfig {
        lifetime: 0.6,
        amount: 40,
        initial_direction_spread: std::f32::consts::TAU,
        initial_velocity: 200.0,
        size: 4.0,
        gravity: vec2(0.0, 300.0),
        ..Default::default()
    }
}

// In your game loop:
let mut emitter = Emitter::new(explosion_config());
emitter.emit(vec2(screen_width() / 2.0, screen_height() / 2.0), 1);
emitter.draw(vec2(0.0, 0.0));
```

**Use case:** Explosions, fire, smoke, sparkles — anything particle-based.

### macroquad-platformer

Tile-based platformer physics with solid collision handling. Implements the approach from the Celeste/TowerFall physics article.

```toml
[dependencies]
macroquad = "0.4"
macroquad-platformer = "0.2"
```

```rust
use macroquad::prelude::*;
use macroquad_platformer::*;

#[macroquad::main("Platformer")]
async fn main() {
    let mut world = World::new();

    // Add static colliders (tiles)
    world.add_static_tiled_layer(
        &[1, 1, 1, 0, 0, 0, 1, 1, 1],  // 1 = solid, 0 = empty
        16.0, 16.0,  // tile size
        3,           // tiles per row
        1,           // layer tag
    );

    // Add a dynamic actor (player)
    let player = world.add_actor(vec2(48.0, 0.0), 12, 16);

    loop {
        clear_background(BLACK);

        // Move the actor — world handles collision response
        world.move_h(player, 2.0 * get_frame_time());
        world.move_v(player, 4.0 * get_frame_time());

        let pos = world.actor_pos(player);
        draw_rectangle(pos.x, pos.y, 12.0, 16.0, RED);

        next_frame().await;
    }
}
```

**Use case:** Tile-based platformers with rectangular colliders.

### macroquad-profiler

In-game performance profiler overlay. Shows frame time breakdown.

```rust
use macroquad::prelude::*;
use macroquad_profiler as profiler;

// At end of game loop:
profiler::profiler(Default::default());
```

---

## The miniquad Foundation

Macroquad sits on top of miniquad, which handles the low-level platform abstraction:

| Layer | Crate | Role |
|-------|-------|------|
| Platform + GL | `miniquad` | Window, input, OpenGL context — zero deps |
| 2D/3D game lib | `macroquad` | Drawing, audio, cameras, async game loop |
| Companion crates | `macroquad-*` | Tiled maps, particles, platformer physics, profiling |

**Why this matters:** If macroquad's drawing API doesn't cover your need, you can drop down to raw miniquad `Pipeline` / `Bindings` calls. The two interoperate freely.

### Key miniquad Ecosystem Crates

- **`quad-net`** — Cross-platform HTTP requests (works on WASM). Useful for leaderboards, analytics, or downloading assets at runtime.
- **`quad-storage`** — Platform-agnostic key-value storage. Uses `localStorage` on web, file system on desktop. Ideal for save games.
- **`sapp-jsutils`** — FFI helpers for calling JavaScript from Rust in WASM builds. Needed for integrating browser APIs (analytics, ads, payment).
- **`quad-rand`** — Tiny, deterministic random number generator that works consistently across all platforms including WASM.

```toml
# Common companion deps for a web-targeting macroquad game
[dependencies]
macroquad = "0.4"
quad-net = "0.1"
quad-storage = "0.1"
quad-rand = "0.2"
```

---

## Community Libraries

### UI

| Crate | Description |
|-------|-------------|
| `egui` + `egui-macroquad` | Immediate-mode UI, the go-to for dev tools and debug panels (see [G2](../guides/G2_wasm_and_egui.md)) |
| `megaui` | Lightweight UI used internally by macroquad-particles editor |

### Physics

| Crate | Description |
|-------|-------------|
| `macroquad-platformer` | Tile-based platformer collisions (first-party, see above) |
| `rapier2d` | Full-featured 2D physics — works with macroquad but requires manual integration |

### Audio

Macroquad includes built-in audio (`macroquad::audio`), which covers most 2D game needs. For advanced use:

| Crate | Description |
|-------|-------------|
| `quad-snd` | Lower-level audio backend used by macroquad internally |
| `kira` | Advanced audio with mixer, tweening, spatial — requires custom integration |

### Networking

| Crate | Description |
|-------|-------------|
| `quad-net` | HTTP requests, cross-platform including WASM |
| `matchbox` | WebRTC peer-to-peer networking (works with WASM for browser multiplayer) |

---

## Cargo Feature Flags

Macroquad 0.4 exposes a few useful features:

```toml
[dependencies]
# Default — includes audio
macroquad = "0.4"

# Disable audio (removes system audio dependency — useful for CI or headless)
macroquad = { version = "0.4", default-features = false }
```

---

## WASM Deployment Crates

For web builds, these tools streamline the process:

- **`cargo-webquad`** — One-command WASM build and local server for macroquad projects:
  ```bash
  cargo install cargo-webquad
  cargo webquad run
  ```
  Handles `wasm-bindgen`, generates the HTML wrapper, and starts a dev server.

- **`wasm-bindgen`** — Required for the WASM target. `cargo-webquad` manages this for you, but manual builds need it configured.

See [G2 — WASM & egui](../guides/G2_wasm_and_egui.md) for the full deployment workflow.

---

## Finding More Crates

1. **[awesome-quads](https://github.com/ozkriff/awesome-quads)** — Curated list of ~120 miniquad/macroquad projects, libraries, and games.
2. **[crates.io reverse dependencies](https://crates.io/crates/macroquad/reverse_dependencies)** — Everything that depends on macroquad.
3. **[Quads Discord](https://discord.gg/WfEp6ut)** — Community chat with the library author and contributors.
4. **[macroquad.rs](https://macroquad.rs/)** — Official site with examples and tutorials.
