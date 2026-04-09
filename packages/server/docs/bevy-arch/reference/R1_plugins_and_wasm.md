# R1 — Plugins & WASM Deployment

> **Category:** reference · **Engine:** Bevy 0.18 · **Related:** [G1 Getting Started](../guides/G1_getting_started.md) · [E1 ECS Fundamentals](../architecture/E1_ecs_fundamentals.md) · [bevy-arch-rules](../bevy-arch-rules.md)

---

## Bevy's Plugin System

Everything in Bevy is a plugin. `DefaultPlugins` is a bundle of ~20 official plugins (rendering, input, windowing, audio, etc.). Your game logic plugs in the same way.

### Writing a Plugin

```rust
use bevy::prelude::*;

pub struct ScorePlugin;

impl Plugin for ScorePlugin {
    fn build(&self, app: &mut App) {
        app.init_resource::<Score>()
            .add_systems(Update, update_score);
    }
}

#[derive(Resource, Default)]
struct Score(u32);

fn update_score(/* ... */) { /* ... */ }
```

Register it:

```rust
fn main() {
    App::new()
        .add_plugins((DefaultPlugins, ScorePlugin))
        .run();
}
```

### Plugin Groups

Bundle related plugins together:

```rust
pub struct GameplayPlugins;

impl PluginGroup for GameplayPlugins {
    fn build(self) -> PluginGroupBuilder {
        PluginGroupBuilder::start::<Self>()
            .add(ScorePlugin)
            .add(InventoryPlugin)
            .add(CombatPlugin)
    }
}

// Usage
app.add_plugins((DefaultPlugins, GameplayPlugins));
```

### Configurable Plugins

Use a builder pattern or struct fields for configuration:

```rust
pub struct DifficultyPlugin {
    pub enemy_speed: f32,
    pub spawn_rate: f32,
}

impl Plugin for DifficultyPlugin {
    fn build(&self, app: &mut App) {
        app.insert_resource(DifficultyConfig {
            enemy_speed: self.enemy_speed,
            spawn_rate: self.spawn_rate,
        });
    }
}
```

---

## Popular Community Plugins (Bevy 0.18)

The Bevy ecosystem has a rich third-party plugin landscape. Below are widely used crates — **always verify crates.io for the latest version compatible with your Bevy release.**

### Physics

| Crate | Description | Cargo |
|-------|-------------|-------|
| `avian2d` / `avian3d` | ECS-native physics (successor to `bevy_xpbd`). Recommended for new projects. | `avian2d = "0.6"` |
| `bevy_rapier2d` / `bevy_rapier3d` | Rapier physics wrapper. Mature, feature-rich, larger community. | `bevy_rapier2d = "0.29"` |

### UI & Debug

| Crate | Description | Cargo |
|-------|-------------|-------|
| `bevy_egui` | egui immediate-mode GUI integration. Ideal for dev tools & inspectors. | `bevy_egui = "0.38"` |
| `bevy-inspector-egui` | ECS inspector — browse entities, components, resources at runtime. | `bevy-inspector-egui = "0.30"` |
| `bevy_ui_navigation` | Gamepad/keyboard UI navigation (focus, tab order). | `bevy-ui-navigation = "0.23"` |

### Rendering & Graphics

| Crate | Description | Cargo |
|-------|-------------|-------|
| `bevy_hanabi` | GPU particle system. | `bevy_hanabi = "0.16"` |
| `bevy_prototype_lyon` | 2D vector shape rendering (lines, polygons). | Check crates.io |
| `bevy_atmosphere` | Sky/atmosphere rendering for 3D scenes. | Check crates.io |

### Audio

| Crate | Description | Cargo |
|-------|-------------|-------|
| `bevy_kira_audio` | Kira audio backend — better control than built-in audio. Tweening, spatial audio. | Check crates.io |

### Networking

| Crate | Description | Cargo |
|-------|-------------|-------|
| `bevy_replicon` | Server-authoritative networking with automatic ECS replication. | Check crates.io |
| `bevy_ggrs` | Rollback netcode (GGRS) — great for fighting games, action games. | Check crates.io |
| `matchbox` | WebRTC peer-to-peer matchmaking (works in WASM). | Check crates.io |

### Tilemaps

| Crate | Description | Cargo |
|-------|-------------|-------|
| `bevy_ecs_tilemap` | High-performance ECS-based tilemap rendering. | Check crates.io |
| `bevy_ecs_ldtk` | LDtk level editor integration (loads `.ldtk` files as Bevy entities). | Check crates.io |

> **Version compatibility is critical.** Bevy releases breaking changes every ~3 months. Most ecosystem crates release matching updates within days to weeks of a new Bevy version. Check the crate's README or CHANGELOG for its Bevy compatibility table before adding it.

---

## WASM / Web Deployment

Bevy supports compiling to WebAssembly for browser-based games. The engine uses WebGPU (preferred) or WebGL2 as rendering backends in the browser.

### Prerequisites

```bash
# Install the WASM target
rustup target add wasm32-unknown-unknown

# Install wasm-bindgen CLI
cargo install wasm-bindgen-cli
```

### Building

```bash
# Build in release mode (debug WASM is very slow)
cargo build --release --target wasm32-unknown-unknown

# Generate JS bindings
wasm-bindgen \
    --out-dir ./web \
    --target web \
    target/wasm32-unknown-unknown/release/my_game.wasm
```

This produces `web/my_game.js` and `web/my_game_bg.wasm`.

### HTML Template

```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>My Bevy Game</title>
    <style>
        body { margin: 0; background: #1a1a1a; }
        canvas { display: block; margin: 0 auto; }
    </style>
</head>
<body>
    <script type="module">
        import init from './my_game.js';
        init();
    </script>
</body>
</html>
```

### Using Trunk (Recommended)

[Trunk](https://trunkrs.dev) automates the build-bundle-serve workflow:

```bash
# Install
cargo install trunk

# Create a minimal index.html at project root
# <link data-trunk rel="rust" data-wasm-opt="z" />
```

```html
<!-- index.html -->
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>My Bevy Game</title>
    <link data-trunk rel="rust" data-wasm-opt="z" />
</head>
<body></body>
</html>
```

```bash
# Dev server with hot-reload
trunk serve

# Production build
trunk build --release
# Output in dist/
```

### WASM-Specific Cargo Settings

Optimize binary size and performance:

```toml
# Cargo.toml

[profile.release]
opt-level = "z"       # Optimize for size
lto = "thin"          # Link-time optimization
strip = true          # Strip debug symbols

[profile.release.package."*"]
opt-level = "z"
```

### Feature Flags for WASM

Some Bevy features don't compile to WASM. Use conditional compilation:

```toml
# Cargo.toml — use fewer default features for web builds

[target.'cfg(target_arch = "wasm32")'.dependencies]
bevy = { version = "0.18", default-features = false, features = [
    "bevy_asset",
    "bevy_audio",
    "bevy_render",
    "bevy_sprite",
    "bevy_text",
    "bevy_ui",
    "bevy_winit",
    "default_font",
    "webgpu",
] }
```

> **WebGPU vs WebGL2:** Bevy 0.18 defaults to WebGPU when available. For broader browser support (Safari < 18, older Firefox), you may need the `webgl2` feature instead of `webgpu`. WebGL2 has rendering limitations compared to WebGPU.

### Asset Loading in WASM

In the browser, assets are fetched over HTTP. Place your `assets/` folder alongside the HTML file and Bevy's asset server handles the rest. Be aware that asset loading is asynchronous — large assets may cause visible loading delays.

```rust
// This works identically in native and WASM
let texture: Handle<Image> = asset_server.load("textures/player.png");
```

### Deploying to itch.io

1. Build with `trunk build --release` (or manual wasm-bindgen).
2. Zip the contents of `dist/` (HTML + JS + WASM + assets).
3. Upload to itch.io as an "HTML" project.
4. Enable "SharedArrayBuffer" in itch.io project settings if your game uses multi-threading (most Bevy WASM builds are single-threaded).

---

## WASM Limitations

| Limitation | Details |
|-----------|---------|
| **Single-threaded** | WASM doesn't support `std::thread`. Bevy's multi-threaded scheduler falls back to single-threaded mode automatically. |
| **No filesystem** | `std::fs` doesn't work. Assets load over HTTP via the asset server. For save data, use `web-sys` to access `localStorage`. |
| **Binary size** | A minimal Bevy WASM build is ~15–25 MB. Use `wasm-opt -Oz` (via Trunk or manually) to reduce size. |
| **Audio autoplay** | Browsers block autoplay. Bevy handles this — audio starts after the first user interaction. |
| **Performance** | WASM runs ~70–80% of native speed. Profile and optimize hot paths. Avoid spawning thousands of entities per frame. |

---

## Finding More Plugins

- **[Bevy Assets](https://bevy.org/assets/)** — Official curated list of community crates, tools, and games.
- **[crates.io search: "bevy"](https://crates.io/search?q=bevy)** — Browse all Bevy-related crates.
- **[Unofficial Bevy Cheat Book — Plugins](https://bevy-cheatbook.github.io/setup/unofficial-plugins.html)** — Categorized list with compatibility notes.
- **[This Week in Bevy](https://thisweekinbevy.com/)** — Weekly newsletter covering new crates and updates.

---

## Common Pitfalls

1. **Version mismatch:** The #1 cause of confusing compile errors. If `bevy_egui` says it needs `bevy 0.17` and you have `bevy 0.18`, it won't compile. Always match crate versions to your Bevy version.
2. **WASM debug builds are unusable:** Always use `--release` for WASM. Debug builds are 10x larger and dramatically slower.
3. **Plugin ordering matters:** Some plugins depend on others. If you get "resource not found" panics, check whether a dependency plugin should be added first.
4. **Forgetting `wasm32-unknown-unknown` target:** `cargo build` alone targets your host OS. You must pass `--target wasm32-unknown-unknown` explicitly.
5. **Large WASM bundles:** Bevy's default feature set pulls in a lot of code. Trim unused features (3D renderer, etc.) for smaller web builds.
