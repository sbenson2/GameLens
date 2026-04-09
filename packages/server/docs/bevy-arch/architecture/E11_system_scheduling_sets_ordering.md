# E11 — System Scheduling, Sets & Ordering

> **Category:** explanation · **Engine:** Bevy 0.18 · **Related:** [E1 ECS Fundamentals](E1_ecs_fundamentals.md) · [E9 Observers, Hooks & One-Shot](E9_observers_hooks_oneshot.md) · [E8 Performance Optimization](E8_performance_optimization.md) · [bevy-arch-rules](../bevy-arch-rules.md)

---

## Overview

Bevy's scheduler is the engine's brain — it decides **when** systems run, **in what order**, and **how many at once**. By default, Bevy runs systems in parallel across all available CPU threads. You control execution order with **explicit ordering constraints**, **system sets**, **run conditions**, and **schedule selection**.

This doc covers the scheduling model as it exists in **Bevy 0.18** (January 2026). E1 introduces basic system registration; this doc goes deep on the scheduling machinery.

---

## Schedules

A **Schedule** is a collection of systems that runs as a unit. Bevy ships several built-in schedules:

| Schedule | When it runs |
|----------|-------------|
| `PreStartup` | Once, before `Startup` |
| `Startup` | Once, after `PreStartup` |
| `PostStartup` | Once, after `Startup` |
| `First` | Every frame, before `PreUpdate` |
| `PreUpdate` | Every frame, engine-internal bookkeeping |
| `Update` | Every frame — **your main game logic goes here** |
| `PostUpdate` | Every frame, engine-internal (transform propagation, rendering prep) |
| `Last` | Every frame, after `PostUpdate` |
| `FixedPreUpdate` | Every fixed timestep tick, before `FixedUpdate` |
| `FixedUpdate` | Every fixed timestep tick — **physics/simulation logic** |
| `FixedPostUpdate` | Every fixed timestep tick, after `FixedUpdate` |
| `StateTransition` | Runs during state transitions |
| `OnEnter(S)` / `OnExit(S)` | On entering/exiting a given state `S` |

### Adding Systems to Schedules

```rust
use bevy::prelude::*;

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        // One-time setup
        .add_systems(Startup, spawn_player)
        // Every-frame logic
        .add_systems(Update, (move_player, check_collisions))
        // Physics at fixed rate
        .add_systems(FixedUpdate, apply_gravity)
        .run();
}
```

### Custom Schedules

You can create your own schedules and run them manually — useful for turn-based games, editor tools, or on-demand logic:

```rust
#[derive(ScheduleLabel, Debug, Clone, PartialEq, Eq, Hash)]
struct TurnSchedule;

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .init_schedule(TurnSchedule)
        .add_systems(TurnSchedule, (resolve_actions, apply_damage, check_victory))
        .add_systems(Update, run_turn_on_input)
        .run();
}

fn run_turn_on_input(world: &mut World) {
    // Run the entire turn schedule on demand
    world.run_schedule(TurnSchedule);
}
```

> **Rust ownership note:** `run_schedule` requires `&mut World` — you need an exclusive system (one that takes `&mut World` as its parameter) to call it.

---

## System Ordering

By default, systems within the same schedule run in **parallel** with non-deterministic ordering. When order matters, you must add explicit constraints.

### `.before()` and `.after()`

```rust
app.add_systems(Update, (
    read_input,
    move_player.after(read_input),
    update_camera.after(move_player),
));
```

**Important:** `.before()` / `.after()` only add ordering constraints — they do not "pull in" the other system. Both systems must already be added to the schedule independently.

### `.chain()`

Chain is the most common way to enforce sequential execution. It automatically inserts `.before()` / `.after()` between adjacent systems in a tuple:

```rust
app.add_systems(Update, (
    read_input,
    move_player,
    update_camera,
    check_bounds,
).chain());
```

This is equivalent to `read_input → move_player → update_camera → check_bounds` in order.

### Partial Chaining

You can mix chained and parallel systems in the same `add_systems` call:

```rust
app.add_systems(Update, (
    // These two run in parallel with each other
    (animate_sprites, play_audio),
    // Then this runs after both complete
    update_ui,
).chain());
```

The inner tuple `(animate_sprites, play_audio)` runs in parallel, then `update_ui` runs after both.

---

## System Sets

System sets are named groups that let you apply shared configuration (ordering, run conditions) to many systems at once.

### Defining Sets

```rust
#[derive(SystemSet, Debug, Clone, PartialEq, Eq, Hash)]
enum GameSet {
    Input,
    Movement,
    Combat,
    Rendering,
}
```

### Adding Systems to Sets

```rust
app.add_systems(Update, (
    read_keyboard.in_set(GameSet::Input),
    read_gamepad.in_set(GameSet::Input),
    move_player.in_set(GameSet::Movement),
    move_enemies.in_set(GameSet::Movement),
    resolve_attacks.in_set(GameSet::Combat),
    draw_health_bars.in_set(GameSet::Rendering),
));
```

A system can belong to **multiple** sets and inherits configuration from all of them.

### Configuring Sets

Use `configure_sets` to add ordering and run conditions to entire sets:

```rust
app.configure_sets(Update, (
    GameSet::Input,
    GameSet::Movement.after(GameSet::Input),
    GameSet::Combat.after(GameSet::Movement),
    GameSet::Rendering.after(GameSet::Combat),
));
```

This ensures all `Input` systems finish before any `Movement` systems start, and so on.

### Nested Sets

Sets can contain other sets for hierarchical organization:

```rust
#[derive(SystemSet, Debug, Clone, PartialEq, Eq, Hash)]
enum PhysicsSet {
    BroadPhase,
    NarrowPhase,
    Resolution,
}

app.configure_sets(FixedUpdate, (
    PhysicsSet::BroadPhase,
    PhysicsSet::NarrowPhase.after(PhysicsSet::BroadPhase),
    PhysicsSet::Resolution.after(PhysicsSet::NarrowPhase),
));
```

---

## Run Conditions

Run conditions dynamically control whether a system executes each frame. They are functions that return `bool`.

### Built-in Conditions

```rust
use bevy::prelude::*;

app.add_systems(Update, (
    // Only when a resource exists
    draw_debug_overlay.run_if(resource_exists::<DebugConfig>),
    // Only when a resource has changed
    rebuild_nav_mesh.run_if(resource_changed::<MapData>),
    // Only in a specific state
    update_enemies.run_if(in_state(GameState::Playing)),
    // Combine conditions with AND
    spawn_wave.run_if(in_state(GameState::Playing).and(resource_exists::<WaveTimer>)),
));
```

### Custom Run Conditions

Any system-compatible function that returns `bool` can be a run condition:

```rust
fn is_player_alive(query: Query<&Health, With<Player>>) -> bool {
    query.iter().any(|h| h.0 > 0)
}

app.add_systems(Update, 
    process_player_input.run_if(is_player_alive)
);
```

### Set-Level Run Conditions

Apply a run condition to an entire set — all systems in the set inherit it:

```rust
app.configure_sets(Update,
    GameSet::Combat.run_if(in_state(GameState::Playing))
);
```

### Multiple Conditions

A system with multiple run conditions only runs when **all** return `true`:

```rust
app.add_systems(Update,
    boss_fight_music
        .run_if(in_state(GameState::Playing))
        .run_if(resource_exists::<BossActive>)
);
```

---

## Removing Systems at Runtime (Bevy 0.18)

Bevy 0.18 introduced `remove_systems_in_set` for permanently removing systems from a schedule. This triggers a full schedule rebuild — use it sparingly.

```rust
fn disable_tutorial(world: &mut World) {
    world.schedule_scope(Update, |world, schedule| {
        schedule.remove_systems_in_set(
            TutorialSet,
            world,
            ScheduleCleanupPolicy::RemoveSystemsOnly,
        );
    });
}
```

**When to use:** Disabling entire plugin features (e.g., removing a tutorial system permanently), mod support, or user settings that toggle major subsystems. For temporary toggling, run conditions are preferred.

**Performance note:** Schedule rebuilds are expensive — they recalculate the entire dependency graph. Avoid calling `remove_systems_in_set` every frame. Run conditions have near-zero overhead per frame by comparison.

---

## Exclusive Systems

Exclusive systems take `&mut World` and have full, mutable access to all ECS data. Bevy cannot run anything else in parallel with an exclusive system.

```rust
fn my_exclusive_system(world: &mut World) {
    // Full access to everything
    let count = world.query::<&Player>().iter(world).count();
    println!("Player count: {count}");
}

app.add_systems(Update, my_exclusive_system);
```

Use exclusive systems when you need to:
- Run a sub-schedule (`world.run_schedule(...)`)
- Perform complex multi-query operations that would cause borrow conflicts
- Access `World` internals not exposed through system parameters

> **Performance gotcha:** Exclusive systems create a synchronization barrier — all parallel systems must finish before the exclusive system runs, and nothing starts until it completes. Minimize their use in hot paths.

---

## Ambiguity Detection

When two systems access the same data (one mutably) and have no ordering constraint, Bevy considers them **ambiguous**. In debug builds, you can enable ambiguity warnings:

```rust
app.edit_schedule(Update, |schedule| {
    schedule.set_build_settings(ScheduleBuildSettings {
        ambiguity_detection: LogLevel::Warn,
        ..default()
    });
});
```

This helps catch subtle race conditions during development. Ambiguous systems are not a bug — Bevy handles them safely by running them sequentially if needed — but explicit ordering makes behavior deterministic.

---

## Common Patterns

### Game Loop Pattern

```rust
#[derive(SystemSet, Debug, Clone, PartialEq, Eq, Hash)]
enum GameLoop {
    Input,
    Simulation,
    Rendering,
}

app.configure_sets(Update, (
    GameLoop::Input,
    GameLoop::Simulation.after(GameLoop::Input),
    GameLoop::Rendering.after(GameLoop::Simulation),
));
```

### Plugin Integration Pattern

Plugins should expose system sets so users can order their systems relative to plugin internals:

```rust
// In your plugin:
#[derive(SystemSet, Debug, Clone, PartialEq, Eq, Hash)]
pub struct MyPluginSet;

impl Plugin for MyPlugin {
    fn build(&self, app: &mut App) {
        app.add_systems(Update, (
            internal_system_a.in_set(MyPluginSet),
            internal_system_b.in_set(MyPluginSet),
        ));
    }
}

// User code:
app.add_systems(Update, 
    my_system.after(MyPluginSet)
);
```

### Fixed Timestep Physics with Interpolation

```rust
app
    .add_systems(FixedUpdate, (
        apply_forces,
        integrate_velocity,
        detect_collisions,
    ).chain().in_set(PhysicsSet))
    .add_systems(Update, 
        interpolate_transforms
            .after(PhysicsSet)
            .in_set(GameLoop::Rendering)
    );
```

---

## Quick Reference

| API | Purpose |
|-----|---------|
| `.before(x)` / `.after(x)` | Order relative to system or set `x` |
| `.chain()` | Sequential ordering within a tuple |
| `.in_set(S)` | Add system to set `S` |
| `.run_if(cond)` | Conditional execution |
| `configure_sets(schedule, ...)` | Configure ordering/conditions for sets |
| `init_schedule(label)` | Create a custom schedule |
| `world.run_schedule(label)` | Run a schedule on demand (exclusive) |
| `remove_systems_in_set(...)` | Permanently remove systems (0.18+) |

---

## Further Reading

- [E1 ECS Fundamentals](E1_ecs_fundamentals.md) — Components, entities, systems basics
- [E9 Observers, Hooks & One-Shot](E9_observers_hooks_oneshot.md) — Push-style alternatives to polling
- [E8 Performance Optimization](E8_performance_optimization.md) — Parallel execution tuning
- [Bevy 0.18 release notes](https://bevy.org/news/bevy-0-18/)
