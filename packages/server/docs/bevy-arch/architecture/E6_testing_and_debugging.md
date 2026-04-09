# E6 — Testing & Debugging

> **Category:** explanation · **Engine:** Bevy 0.18 · **Related:** [E1 ECS Fundamentals](E1_ecs_fundamentals.md) · [G1 Getting Started](../guides/G1_getting_started.md) · [R2 Community Plugins](../reference/R2_community_plugins_ecosystem.md) · [bevy-arch-rules](../bevy-arch-rules.md)

---

## Overview

Bevy's ECS architecture is inherently testable — systems are pure functions over data, and the `World` can be constructed in isolation. This doc covers unit testing systems, integration testing, runtime debugging tools, and performance diagnostics available in Bevy 0.18.

---

## Unit Testing Systems

Bevy systems are regular Rust functions that take ECS parameters. You test them by creating a `World`, inserting test data, and running the system directly.

### Basic Pattern: World + System Runner

```rust
// Cargo.toml — no extra deps needed, this uses bevy's own test utilities
// [dev-dependencies]
// bevy = "0.18"

#[cfg(test)]
mod tests {
    use bevy::prelude::*;

    #[derive(Component)]
    struct Health(i32);

    #[derive(Component)]
    struct Enemy;

    #[derive(Resource, Default)]
    struct Score(u32);

    // The system under test
    fn despawn_dead_enemies(
        mut commands: Commands,
        mut score: ResMut<Score>,
        query: Query<(Entity, &Health), With<Enemy>>,
    ) {
        for (entity, health) in &query {
            if health.0 <= 0 {
                commands.entity(entity).despawn();
                score.0 += 1;
            }
        }
    }

    #[test]
    fn dead_enemies_are_despawned_and_scored() {
        // 1. Build a minimal App with only what the system needs
        let mut app = App::new();
        app.init_resource::<Score>();
        app.add_systems(Update, despawn_dead_enemies);

        // 2. Spawn test entities
        let alive = app.world_mut().spawn((Enemy, Health(50))).id();
        let dead = app.world_mut().spawn((Enemy, Health(0))).id();

        // 3. Run one update tick
        app.update();

        // 4. Assert results
        // Dead enemy should be despawned
        assert!(app.world().get_entity(dead).is_err());
        // Alive enemy should still exist
        assert!(app.world().get_entity(alive).is_ok());
        // Score should be 1
        assert_eq!(app.world().resource::<Score>().0, 1);
    }
}
```

### Why App instead of raw World?

Using `App::new()` gives you the full system scheduling pipeline, including `Commands` processing. If you use `World::new()` directly, deferred commands (spawn, despawn, insert) won't execute until you manually call `world.flush()`. The `App` approach is simpler and closer to real runtime behavior.

### Testing with Events

```rust
#[cfg(test)]
mod event_tests {
    use bevy::prelude::*;

    #[derive(Event)]
    struct DamageEvent { entity: Entity, amount: i32 }

    #[derive(Component)]
    struct Health(i32);

    fn apply_damage(
        mut events: EventReader<DamageEvent>,
        mut query: Query<&mut Health>,
    ) {
        for event in events.read() {
            if let Ok(mut health) = query.get_mut(event.entity) {
                health.0 -= event.amount;
            }
        }
    }

    #[test]
    fn damage_event_reduces_health() {
        let mut app = App::new();
        app.add_event::<DamageEvent>();
        app.add_systems(Update, apply_damage);

        let entity = app.world_mut().spawn(Health(100)).id();

        // Send event before update
        app.world_mut().send_event(DamageEvent {
            entity,
            amount: 30,
        });

        app.update();

        let health = app.world().get::<Health>(entity).unwrap();
        assert_eq!(health.0, 70);
    }
}
```

### Testing State Transitions

```rust
#[cfg(test)]
mod state_tests {
    use bevy::prelude::*;

    #[derive(States, Debug, Clone, PartialEq, Eq, Hash, Default)]
    enum GameState {
        #[default]
        Menu,
        Playing,
        Paused,
    }

    fn pause_on_escape(
        input: Res<ButtonInput<KeyCode>>,
        mut next_state: ResMut<NextState<GameState>>,
    ) {
        if input.just_pressed(KeyCode::Escape) {
            next_state.set(GameState::Paused);
        }
    }

    #[test]
    fn escape_pauses_game() {
        let mut app = App::new();
        // MinimalPlugins gives you time, scheduling — no window/renderer
        app.add_plugins(MinimalPlugins);
        app.init_state::<GameState>();
        app.add_systems(Update, pause_on_escape.run_if(in_state(GameState::Playing)));

        // Manually set state to Playing
        app.world_mut().resource_mut::<NextState<GameState>>()
            .set(GameState::Playing);
        app.update(); // Apply state transition

        // Simulate Escape press
        app.world_mut().resource_mut::<ButtonInput<KeyCode>>()
            .press(KeyCode::Escape);
        app.update();

        assert_eq!(
            *app.world().resource::<State<GameState>>().get(),
            GameState::Paused
        );
    }
}
```

> **Rust gotcha — borrowing:** You cannot hold a mutable reference to the `World` while also calling `app.update()`. Always drop references before calling `update()`. The pattern above (using `resource_mut()` in a separate statement) avoids this.

---

## Debugging Tools

### Built-in Logging

Bevy uses `tracing` under the hood. The `LogPlugin` (included in `DefaultPlugins`) configures this automatically.

```rust
use bevy::prelude::*;

fn my_system(query: Query<(Entity, &Transform)>) {
    for (entity, transform) in &query {
        // These use the tracing macros, not println!
        info!("Entity {:?} at {:?}", entity, transform.translation);
        debug!("Full transform: {:?}", transform);
    }
}

// Control log level at startup:
// RUST_LOG=warn,my_game=debug cargo run
```

### FrameTimeDiagnosticsPlugin

```rust
use bevy::diagnostic::{FrameTimeDiagnosticsPlugin, LogDiagnosticsPlugin};

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .add_plugins(FrameTimeDiagnosticsPlugin)
        .add_plugins(LogDiagnosticsPlugin::default()) // Prints FPS to console
        .run();
}
```

### bevy-inspector-egui (Community — v0.36+, Bevy 0.18 compatible)

The most popular runtime inspection tool. Shows all entities, components, and resources in a real-time GUI overlay.

```toml
# Cargo.toml
[dependencies]
bevy-inspector-egui = "0.36"
```

```rust
use bevy::prelude::*;
use bevy_inspector_egui::quick::WorldInspectorPlugin;

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        // Add this ONE line for full world inspection
        .add_plugins(WorldInspectorPlugin::new())
        .run();
}
```

> **Tip:** Gate inspector plugins behind a cargo feature so they're stripped from release builds:
> ```toml
> [features]
> dev = ["bevy-inspector-egui"]
> ```
> ```rust
> #[cfg(feature = "dev")]
> app.add_plugins(WorldInspectorPlugin::new());
> ```

### System Ordering Ambiguity Detection

Bevy can report systems that access the same data without explicit ordering:

```rust
// In your App setup — useful during development
app.edit_schedule(Update, |schedule| {
    schedule.set_build_settings(
        ScheduleBuildSettings {
            ambiguity_detection: LogLevel::Warn,
            ..default()
        }
    );
});
```

---

## Performance Profiling

### Tracy Integration

Bevy has first-class Tracy profiler support:

```toml
# Cargo.toml
[dependencies]
bevy = { version = "0.18", features = ["trace_tracy"] }
```

Run your game, then connect with the Tracy profiler to see per-system timing, frame breakdowns, and ECS archetype statistics.

### Custom Spans

```rust
use bevy::prelude::*;

fn expensive_system(query: Query<&Transform>) {
    let _span = info_span!("expensive_system").entered();
    // ... your code here
    // Span auto-closes when _span is dropped
}
```

---

## Testing Strategy Recommendations

| Test Type | What to Test | Approach |
|-----------|-------------|----------|
| **Unit** | Individual systems | `App::new()` + `MinimalPlugins` + manual entity/resource setup |
| **Integration** | System interactions | Multiple systems in one `App`, verify cross-system effects |
| **Snapshot** | Deterministic simulation | Fixed timestep + seed RNG, compare world state after N ticks |
| **Visual** | Rendering correctness | Screenshot comparison (manual or CI with headless rendering) |

### Running Tests

```bash
# Run all tests
cargo test

# Run tests for a specific module
cargo test --package my_game -- systems::combat

# Run with logging visible (tests capture stdout by default)
cargo test -- --nocapture

# Run only tests that don't need a GPU/window
cargo test --no-default-features --features "bevy/multi_threaded"
```

> **CI note:** For headless CI, disable the `bevy_render` and `bevy_winit` features, or use `MinimalPlugins` in all tests. Bevy's own CI runs Miri on `bevy_ecs` to catch undefined behavior.

---

## Common Pitfalls

1. **Forgetting `app.update()`** — Commands (spawn, despawn, insert) are deferred. Nothing happens until the next `update()` call.
2. **Testing with `DefaultPlugins`** — This opens a window and requires a GPU. Use `MinimalPlugins` for headless tests.
3. **Event lifetime** — Events are cleared after 2 update cycles by default. If your test does multiple updates, events from the first may be gone.
4. **System ordering in tests** — If you add multiple systems, they run in the order Bevy's scheduler decides. Use `.chain()` or explicit ordering if your test depends on execution order.
5. **Mutable World access across update** — Rust's borrow checker prevents holding `&mut World` while calling methods that also borrow it. Scope your mutations tightly.
