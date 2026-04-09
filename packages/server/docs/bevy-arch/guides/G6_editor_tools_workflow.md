# G6 — Editor Tools & Development Workflow

> **Category:** guide · **Engine:** Bevy 0.18 · **Related:** [E6 Testing & Debugging](../architecture/E6_testing_and_debugging.md) · [E8 Performance Optimization](../architecture/E8_performance_optimization.md) · [R2 Community Plugins](../reference/R2_community_plugins_ecosystem.md) · [bevy-arch-rules](../bevy-arch-rules.md)

---

## Overview

Bevy does not yet ship an official editor — the Bevy Editor is under active development as of early 2026 (see `bevy_editor_prototypes` on GitHub), with supporting infrastructure like **Bevy Feathers** (widget library) landing in 0.17–0.18. In the meantime, the community has built excellent in-game inspection and editing tools that plug directly into your running application.

This guide covers the practical editor tools available today for **Bevy 0.18**, how to set them up, and development workflow tips for rapid iteration.

---

## bevy_inspector_egui

The most widely-used inspection tool. It gives you an egui-based property inspector window inside your running game, letting you view and modify component values in real time.

### Setup

```toml
# Cargo.toml
[dependencies]
bevy = "0.18"
bevy-inspector-egui = "0.31"  # supports Bevy 0.18 + bevy_egui 0.39
```

### Quick Start — World Inspector

The fastest way to get a full entity/resource/asset browser:

```rust
use bevy::prelude::*;
use bevy_inspector_egui::quick::WorldInspectorPlugin;

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .add_plugins(WorldInspectorPlugin::new())
        .run();
}
```

This opens a panel showing every entity, its components, and their current values. Click any value to edit it live.

### Inspecting Specific Resources

If you only want to expose certain resources instead of the whole world:

```rust
use bevy_inspector_egui::quick::ResourceInspectorPlugin;

#[derive(Resource, Reflect, Default)]
#[reflect(Resource)]
struct GameSettings {
    gravity: f32,
    player_speed: f32,
    debug_draw: bool,
}

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .init_resource::<GameSettings>()
        .register_type::<GameSettings>()
        .add_plugins(ResourceInspectorPlugin::<GameSettings>::default())
        .run();
}
```

### State and Asset Inspectors

```rust
use bevy_inspector_egui::quick::{StateInspectorPlugin, AssetInspectorPlugin};

// Inspect and toggle game states
app.add_plugins(StateInspectorPlugin::<GameState>::default());

// Browse loaded assets of a specific type
app.add_plugins(AssetInspectorPlugin::<Image>::default());
```

### Making Custom Types Inspectable

Any type that derives `Reflect` and is registered becomes editable in the inspector:

```rust
#[derive(Component, Reflect, Default)]
#[reflect(Component)]
struct Enemy {
    health: f32,
    damage: f32,
    aggro_range: f32,
}

// In app setup:
app.register_type::<Enemy>();
```

---

## bevy_editor_pls

A more batteries-included editor experience that bundles hierarchy view, component inspector, editor camera, diagnostics panels, and scene export into one plugin.

### Setup

```toml
# Cargo.toml
[dependencies]
bevy = "0.18"
bevy_editor_pls = "0.12"
```

```rust
use bevy::prelude::*;
use bevy_editor_pls::prelude::*;

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .add_plugins(EditorPlugin::default())
        .run();
}
```

### Built-In Panels

- **Hierarchy:** Entity tree view, click to select, see components
- **Inspector:** Component value editor (powered by bevy_inspector_egui)
- **Editor Camera:** Separate fly-camera that doesn't affect your game camera
- **Diagnostics:** FPS, entity count, system timings
- **Scene Export:** Save the current world state as a `.scn.ron` file

### Custom Editor Windows

Create project-specific editor panels:

```rust
use bevy_editor_pls::editor_window::{EditorWindow, EditorWindowContext};

pub struct LevelEditorWindow;

impl EditorWindow for LevelEditorWindow {
    type State = ();
    const NAME: &'static str = "Level Editor";

    fn ui(world: &mut World, _cx: EditorWindowContext, ui: &mut egui::Ui) {
        ui.heading("Level Tools");
        if ui.button("Spawn Enemy").clicked() {
            world.spawn((
                Name::new("Enemy"),
                Transform::default(),
                // ... other components
            ));
        }
    }
}

// Register it:
app.add_editor_window::<LevelEditorWindow>();
```

---

## The Official Bevy Editor (In Progress)

The Bevy team is building a first-party editor. As of Bevy 0.18, it exists as prototypes in the `bevy_editor_prototypes` repository. Key infrastructure already in mainline Bevy includes:

- **Bevy Feathers** (0.17+): An experimental widget library for tooling UIs. Bevy 0.18 added `ColorPlane` for color picking, joining existing widgets like sliders and buttons.
- **`bevy_camera_controller`**: Reusable camera controllers intended for editor viewports.
- **Popover UI component** (0.18): Absolutely-positioned popup panels — fundamental for context menus and dropdowns in an editor.

The official editor is a long-term project. For production work today, use `bevy_inspector_egui` or `bevy_editor_pls`.

---

## Development Workflow Tips

### 1. Feature-Gate Editor Plugins

Don't ship editor code to players:

```toml
# Cargo.toml
[features]
dev = ["bevy-inspector-egui", "bevy_editor_pls"]

[dependencies]
bevy-inspector-egui = { version = "0.31", optional = true }
bevy_editor_pls = { version = "0.12", optional = true }
```

```rust
fn main() {
    let mut app = App::new();
    app.add_plugins(DefaultPlugins);

    #[cfg(feature = "dev")]
    app.add_plugins((
        WorldInspectorPlugin::new(),
        EditorPlugin::default(),
    ));

    app.run();
}
```

Run with `cargo run --features dev` during development.

### 2. Hot Reloading Assets

Bevy watches asset files by default in debug builds. Edit a texture, shader, or scene file and see changes reflected immediately without restarting.

To ensure this works:

```rust
// Asset hot-reloading is enabled by default with the `file_watcher` feature
// which is included in DefaultPlugins for debug builds
app.add_plugins(DefaultPlugins);
```

### 3. Fast Iteration Cycle

Combine these for the fastest dev loop:

```toml
# .cargo/config.toml — fast linker
[target.x86_64-unknown-linux-gnu]
linker = "clang"
rustflags = ["-C", "link-arg=-fuse-ld=mold"]

# Cargo.toml — dynamic linking + dep optimization
[dependencies]
bevy = { version = "0.18", features = ["dynamic_linking"] }

[profile.dev.package."*"]
opt-level = 3
```

This gives you sub-second recompiles on incremental changes with full-speed physics and rendering.

### 4. Conditional Systems for Debug Visualization

```rust
fn debug_draw_colliders(mut gizmos: Gizmos, query: Query<&Transform, With<Collider>>) {
    for transform in &query {
        gizmos.rect_2d(transform.translation.truncate(), Vec2::new(32.0, 32.0), Color::srgb(0.0, 1.0, 0.0));
    }
}

// Only add in dev builds
#[cfg(debug_assertions)]
app.add_systems(Update, debug_draw_colliders);
```

---

## Comparison: Which Tool to Use

| Need | Recommendation |
|------|---------------|
| Quick component inspection | `bevy_inspector_egui` — WorldInspectorPlugin |
| Full in-game editor experience | `bevy_editor_pls` — bundles hierarchy, camera, export |
| Inspect a single resource/state | `bevy_inspector_egui` — ResourceInspectorPlugin / StateInspectorPlugin |
| Custom project-specific panels | `bevy_editor_pls` — EditorWindow trait |
| Performance profiling | Built-in diagnostics + Tracy (see [E8](../architecture/E8_performance_optimization.md)) |
| Scene authoring and export | `bevy_editor_pls` — built-in scene export |

Both tools can coexist in the same project since `bevy_editor_pls` builds on `bevy_inspector_egui` internally.
