# E4 — Testing & Debugging Patterns

> **Category:** explanation · **Engine:** Macroquad 0.4 · **Related:** [E1 Architecture Overview](E1_architecture_overview.md) · [E3 Structuring Larger Games](E3_structuring_larger_games.md) · [G2 WASM & Egui](../guides/G2_wasm_and_egui.md) · [macroquad-arch-rules](../macroquad-arch-rules.md)

---

## The Challenge

Macroquad's immediate-mode, single-threaded design makes it simple to build games but introduces testing and debugging constraints you won't encounter in headless frameworks. There is no built-in test harness, no ECS to mock, and the rendering loop requires an active graphics context. This document covers practical strategies for testing game logic, debugging visually, and profiling performance.

---

## 1. Separating Logic from Rendering

The single most important testing strategy in Macroquad: **keep game logic in pure Rust functions that know nothing about Macroquad.**

```rust
// ✅ game_logic.rs — pure Rust, no macroquad imports
pub struct Player {
    pub pos: (f32, f32),
    pub health: f32,
    pub velocity: (f32, f32),
}

impl Player {
    pub fn apply_gravity(&mut self, dt: f32) {
        self.velocity.1 += 980.0 * dt;
        self.pos.0 += self.velocity.0 * dt;
        self.pos.1 += self.velocity.1 * dt;
    }

    pub fn take_damage(&mut self, amount: f32) -> bool {
        self.health = (self.health - amount).max(0.0);
        self.health <= 0.0 // returns true if dead
    }

    pub fn overlaps(&self, other_pos: (f32, f32), radius: f32) -> bool {
        let dx = self.pos.0 - other_pos.0;
        let dy = self.pos.1 - other_pos.1;
        (dx * dx + dy * dy).sqrt() < radius
    }
}
```

```rust
// ✅ game_logic_tests.rs — standard #[cfg(test)] module, runs with `cargo test`
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gravity_increases_downward_velocity() {
        let mut player = Player {
            pos: (100.0, 100.0),
            health: 100.0,
            velocity: (0.0, 0.0),
        };
        player.apply_gravity(1.0 / 60.0);
        assert!(player.velocity.1 > 0.0);
    }

    #[test]
    fn damage_kills_at_zero_health() {
        let mut player = Player {
            pos: (0.0, 0.0),
            health: 10.0,
            velocity: (0.0, 0.0),
        };
        assert!(!player.take_damage(5.0));
        assert!(player.take_damage(5.0));
    }

    #[test]
    fn overlap_detection() {
        let player = Player {
            pos: (0.0, 0.0),
            health: 100.0,
            velocity: (0.0, 0.0),
        };
        assert!(player.overlaps((5.0, 0.0), 10.0));
        assert!(!player.overlaps((50.0, 0.0), 10.0));
    }
}
```

> **Rust ownership note:** Keeping game state in plain structs (no `Rc`, no interior mutability) makes tests simple and keeps the borrow checker happy. Only introduce `Rc<RefCell<T>>` at the boundary where Macroquad's async main loop needs shared access.

### Project Structure

```
src/
├── main.rs           # Macroquad loop — draws, handles input, calls game logic
├── game_logic.rs     # Pure Rust — all game rules, collision, AI
├── game_state.rs     # State machine (menus, gameplay, pause) — no rendering
├── rendering.rs      # All draw_* calls live here
└── debug.rs          # Debug overlays and dev tools
```

The `game_logic` and `game_state` modules can be tested with `cargo test`. The `rendering` and `main` modules are thin wrappers that are validated visually.

---

## 2. Debug Drawing

Macroquad's immediate-mode API makes debug visualization trivial — just draw extra shapes conditionally.

```rust
const DEBUG: bool = cfg!(debug_assertions);

async fn game_loop(state: &mut GameState) {
    // Normal rendering...
    draw_texture(&state.player_sprite, state.player.pos.0, state.player.pos.1, WHITE);

    // Debug overlays
    if DEBUG {
        // Hitbox visualization
        draw_rectangle_lines(
            state.player.pos.0 - 16.0,
            state.player.pos.1 - 16.0,
            32.0, 32.0,
            2.0,
            RED,
        );

        // Velocity vector
        draw_line(
            state.player.pos.0,
            state.player.pos.1,
            state.player.pos.0 + state.player.velocity.0 * 0.1,
            state.player.pos.1 + state.player.velocity.1 * 0.1,
            2.0,
            GREEN,
        );

        // FPS counter
        draw_text(
            &format!("FPS: {}", get_fps()),
            10.0, 20.0, 24.0, YELLOW,
        );

        // Entity count
        draw_text(
            &format!("Entities: {}", state.entities.len()),
            10.0, 44.0, 24.0, YELLOW,
        );
    }
}
```

> **Tip:** `cfg!(debug_assertions)` is `true` in `cargo run` (debug profile) and `false` in `cargo run --release`. This makes debug overlays zero-cost in release builds — the compiler eliminates dead code behind the `if false` branch.

---

## 3. Egui Dev Panel

For richer debugging, integrate `egui` via the `macroquad-egui` crate to build interactive dev tools.

```toml
[dependencies]
macroquad = "0.4"
egui = "0.30"
macroquad-egui = "0.2"
```

```rust
use macroquad_egui::egui;

fn draw_debug_panel(state: &mut GameState) {
    egui::Window::new("Dev Tools").show(egui::Context::default(), |ui| {
        ui.heading("Player");
        ui.label(format!("Position: ({:.1}, {:.1})", state.player.pos.0, state.player.pos.1));
        ui.add(egui::Slider::new(&mut state.player.health, 0.0..=100.0).text("Health"));

        ui.separator();

        ui.heading("World");
        ui.checkbox(&mut state.debug_show_hitboxes, "Show Hitboxes");
        ui.checkbox(&mut state.debug_show_grid, "Show Grid");
        ui.add(egui::Slider::new(&mut state.time_scale, 0.0..=3.0).text("Time Scale"));

        if ui.button("Kill All Enemies").clicked() {
            state.enemies.clear();
        }

        if ui.button("Teleport to Origin").clicked() {
            state.player.pos = (400.0, 300.0);
        }
    });
}
```

This gives you real-time sliders, toggles, and buttons — invaluable for tuning physics constants, testing edge cases, and reproducing bugs.

---

## 4. Cargo Profile Optimization

A critical Macroquad-specific configuration: optimize dependencies even in debug mode. Without this, texture loading and audio decoding are painfully slow during development.

```toml
# Cargo.toml — add this section
[profile.dev.package."*"]
opt-level = 2
```

This compiles **your** code in debug mode (fast compile, debug symbols) but compiles all dependencies (including Macroquad, image decoders, audio) in optimized mode. The result is dramatically faster asset loading with minimal impact on compile times.

### Build Profiles Cheat Sheet

| Profile | Your Code | Dependencies | Use When |
|---------|-----------|-------------|----------|
| `cargo run` | debug | debug | Never (too slow for assets) |
| `cargo run` + `[profile.dev.package."*"]` | debug | optimized | **Daily development** |
| `cargo run --release` | optimized | optimized | Profiling, final testing |

---

## 5. Logging and Tracing

Use the standard `log` crate for structured logging. Macroquad doesn't interfere with Rust's logging infrastructure.

```toml
[dependencies]
log = "0.4"
env_logger = "0.11"
```

```rust
use log::{debug, info, warn, error};

#[macroquad::main("MyGame")]
async fn main() {
    env_logger::init(); // reads RUST_LOG env var

    info!("Game starting");

    loop {
        if is_key_pressed(KeyCode::F1) {
            debug!("Player state: {:?}", game_state.player);
        }

        if game_state.entities.len() > 10000 {
            warn!("Entity count exceeding 10,000 — possible leak");
        }

        next_frame().await;
    }
}
```

Run with: `RUST_LOG=debug cargo run`

---

## 6. Common Debugging Scenarios

### Texture Appears White / Missing

```rust
// ❌ Loading texture without awaiting (common async mistake)
let texture = load_texture("assets/player.png"); // Returns a future, not a texture!

// ✅ Await the future
let texture = load_texture("assets/player.png").await.expect("Failed to load player.png");
```

> **Rust ownership note:** `load_texture` returns `impl Future<Output = Result<Texture2D, ...>>`. Forgetting `.await` is a compile warning, not an error. Read your warnings.

### Game Freezes / Infinite Loop

If the game window freezes, you likely forgot `next_frame().await` in a loop:

```rust
// ❌ Blocks forever — never yields to the event loop
loop {
    if some_condition { break; }
    // Missing: next_frame().await
}

// ✅ Yield each frame
loop {
    if some_condition { break; }
    next_frame().await;
}
```

### Collision Not Detecting

Draw the collision shapes to verify alignment:

```rust
// Debug: draw AABB of every entity
for entity in &state.entities {
    draw_rectangle_lines(
        entity.aabb.x, entity.aabb.y,
        entity.aabb.w, entity.aabb.h,
        1.0,
        if entity.colliding { RED } else { GREEN },
    );
}
```

---

## 7. Snapshot / Replay Testing

For complex games, record input each frame and replay it for deterministic testing:

```rust
#[derive(Clone, serde::Serialize, serde::Deserialize)]
struct FrameInput {
    keys_pressed: Vec<KeyCode>,
    mouse_pos: (f32, f32),
    mouse_buttons: Vec<MouseButton>,
    dt: f32,
}

// Record during play
fn record_frame() -> FrameInput {
    FrameInput {
        keys_pressed: get_keys_pressed(),
        mouse_pos: mouse_position(),
        mouse_buttons: /* collect pressed buttons */,
        dt: get_frame_time(),
    }
}
```

Save the `Vec<FrameInput>` to JSON. Replay by feeding recorded inputs to your pure `game_logic` functions — this runs headlessly in `cargo test`, no graphics context needed.

---

## Summary

| Strategy | Tests Game Logic? | Needs GPU? | Complexity |
|----------|------------------|-----------|-----------|
| Pure-function unit tests | ✅ | No | Low |
| Debug drawing | Visual only | Yes | Low |
| Egui dev panel | Tweaking only | Yes | Medium |
| Logging (`env_logger`) | Via assertions | No | Low |
| Input record/replay | ✅ | No | Medium |

The golden rule: anything you want to `cargo test` must live in a module that never imports `macroquad`. Everything else is tested by running the game and watching the debug overlays.

---

## Next Steps

- **[E3 Structuring Larger Games](E3_structuring_larger_games.md)** — architecture patterns for testable code
- **[G2 WASM & Egui](../guides/G2_wasm_and_egui.md)** — setting up egui integration
- **[R2 Physics & Collision](../reference/R2_physics_collision.md)** — collision debugging helpers
- **[macroquad-arch-rules](../macroquad-arch-rules.md)** — code conventions for the Macroquad module
