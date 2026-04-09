# E8 — Performance Optimization & ECS Best Practices

> **Category:** explanation · **Engine:** Bevy 0.18 · **Related:** [E1 ECS Fundamentals](E1_ecs_fundamentals.md) · [E6 Testing & Debugging](E6_testing_and_debugging.md) · [G1 Getting Started](../guides/G1_getting_started.md) · [bevy-arch-rules](../bevy-arch-rules.md)

---

## Overview

Bevy's ECS architecture is designed for high throughput — systems run in parallel automatically when their data access doesn't conflict. But out-of-the-box parallelism doesn't guarantee good performance. This doc covers compile-time speedups, runtime ECS patterns, profiling workflows, and common pitfalls that cost frames.

All API references target **Bevy 0.18**.

---

## Compile-Time Performance

### Dynamic Linking (Dev Only)

Bevy is a large crate tree. First compile can take minutes. Enable dynamic linking to dramatically speed up incremental rebuilds:

```toml
# Cargo.toml — only for development!
[dependencies]
bevy = { version = "0.18", features = ["dynamic_linking"] }
```

> **Warning:** Never ship with `dynamic_linking` enabled. It adds a shared-library dependency and is only supported on desktop platforms. Strip it from release profiles.

### Faster Linker

Replace the default linker with `mold` (Linux) or `lld` (all platforms) for faster link times:

```toml
# .cargo/config.toml
[target.x86_64-unknown-linux-gnu]
linker = "clang"
rustflags = ["-C", "link-arg=-fuse-ld=mold"]

[target.x86_64-pc-windows-msvc]
rustflags = ["-C", "link-arg=-fuse-ld=lld"]

[target.x86_64-apple-darwin]
rustflags = ["-C", "link-arg=-fuse-ld=/usr/local/bin/zld"]
```

### Optimize Dependencies, Not Your Code

Keep your own code at debug optimization for fast rebuilds, but let Bevy and its deps compile with optimizations so physics, rendering, and math aren't painfully slow during dev:

```toml
# Cargo.toml
[profile.dev.package."*"]
opt-level = 3
```

---

## Runtime ECS Performance

### 1. Use Read-Only Access When Possible

Systems that take `Res<T>` instead of `ResMut<T>`, or `&Component` instead of `&mut Component`, can run in parallel with other read-only systems accessing the same data. Mutable access forces exclusivity.

```rust
// BAD — forces exclusive access even though we only read
fn bad_system(mut query: Query<&mut Transform>) {
    for transform in &query {
        info!("Position: {:?}", transform.translation);
    }
}

// GOOD — read-only, can run in parallel with other readers
fn good_system(query: Query<&Transform>) {
    for transform in &query {
        info!("Position: {:?}", transform.translation);
    }
}
```

### 2. Use Query Filters to Reduce Iteration

`With<T>` and `Without<T>` filters narrow the archetype matches without fetching the component data:

```rust
// Only iterate entities that have an Enemy marker, but don't fetch it
fn target_enemies(query: Query<(&Transform, &Health), With<Enemy>>) {
    for (transform, health) in &query {
        // ...
    }
}
```

### 3. Leverage Change Detection

`Changed<T>` and `Added<T>` filters let you skip entities whose components haven't been modified this frame. This is critical for expensive per-entity work:

```rust
fn update_spatial_index(query: Query<(Entity, &Transform), Changed<Transform>>) {
    for (entity, transform) in &query {
        // Only runs for entities whose Transform was mutated
        rebuild_index_entry(entity, transform);
    }
}
```

> **Gotcha — frame delay:** If the system that *writes* `Transform` runs after the system that detects `Changed<Transform>`, the detection sees the change one frame late. Use explicit ordering to guarantee same-frame detection:
>
> ```rust
> app.add_systems(Update, (
>     movement_system,
>     update_spatial_index.after(movement_system),
> ));
> ```

### 4. System Sets and Ordering

Group related systems into sets for bulk ordering. Avoid over-constraining — unnecessary ordering edges reduce parallelism:

```rust
#[derive(SystemSet, Debug, Clone, PartialEq, Eq, Hash)]
enum GameSet {
    Input,
    Physics,
    Render,
}

app.configure_sets(Update, (
    GameSet::Input,
    GameSet::Physics.after(GameSet::Input),
    GameSet::Render.after(GameSet::Physics),
));

app.add_systems(Update, (
    read_input.in_set(GameSet::Input),
    apply_forces.in_set(GameSet::Physics),
    resolve_collisions.in_set(GameSet::Physics),
    sync_transforms.in_set(GameSet::Render),
));
```

Within `GameSet::Physics`, `apply_forces` and `resolve_collisions` can still run in parallel if their data access allows it.

### 5. Disabling Multithreading for Simple Games

If your game has few systems that complete quickly, the scheduling overhead can exceed the parallelism benefit. Disable it per-schedule:

```rust
app.edit_schedule(Update, |schedule| {
    schedule.set_executor_kind(ExecutorKind::SingleThreaded);
});
```

This eliminates executor overhead while leaving Bevy's internal schedules (rendering, asset loading) multithreaded.

---

## Profiling

### Built-In Diagnostics

Add `FrameTimeDiagnosticsPlugin` for an FPS counter and `EntityCountDiagnosticsPlugin` to monitor entity counts:

```rust
use bevy::diagnostic::{FrameTimeDiagnosticsPlugin, EntityCountDiagnosticsPlugin, LogDiagnosticsPlugin};

app.add_plugins((
    FrameTimeDiagnosticsPlugin,
    EntityCountDiagnosticsPlugin,
    LogDiagnosticsPlugin::default(), // prints to console every 1s
));
```

### Tracy Integration

For deep profiling, enable the `trace_tracy` feature and connect the [Tracy profiler](https://github.com/wolfpld/tracy):

```bash
cargo run --release --features bevy/trace_tracy
```

Tracy shows a flamegraph of every system's execution time, parallelism gaps, and frame-to-frame variance. Use `--features bevy/trace_tracy_memory` to also track allocations (higher overhead).

### System-Level Spans

Add custom tracing spans to your own systems for fine-grained profiling:

```rust
use bevy::log::info_span;

fn expensive_system(query: Query<(&Transform, &Velocity)>) {
    let _span = info_span!("expensive_system").entered();
    for (transform, velocity) in &query {
        // traced work
    }
}
```

---

## Common Performance Pitfalls

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| Using `&mut T` when `&T` suffices | Reduced parallelism | Audit queries for unnecessary mutability |
| Iterating all entities every frame | High system time for large entity counts | Use `Changed<T>`, events, or spatial indexing |
| Too many ordering constraints | Systems serialize instead of parallelizing | Only add `.before()`/`.after()` where correctness requires it |
| Missing `opt-level` for deps | Physics and rendering crawl in debug | Add `[profile.dev.package."*"] opt-level = 3` |
| Spawning/despawning thousands per frame | Archetype fragmentation, command buffer stalls | Use entity pooling, `Visibility`, or the `Disabled` component (0.16+) |
| Not using release mode for benchmarks | Misleading perf numbers | Always benchmark with `cargo run --release` |
| Log spam from dependencies | Wasted cycles filtering log messages | Set `RUST_LOG=warn` or compile with `release_max_level_warn` feature |

---

## Entity Archetype Awareness

Bevy stores entities in **archetypes** — tables grouped by component combination. Every unique set of components creates a new archetype. Systems iterate archetypes that match their query.

**Performance implications:**

- Fewer archetypes = better cache locality. Prefer marker components over deeply varied component sets.
- Adding/removing components moves entities between archetypes. Batch structural changes and prefer toggling a flag component over add/remove cycles.
- The `Disabled` component (Bevy 0.16+) provides a lightweight alternative to despawning — the entity stays in its archetype but is excluded from normal queries.

---

## Cargo Profile for Releases

```toml
# Cargo.toml
[profile.release]
opt-level = 3
lto = "thin"         # good balance of compile time vs runtime perf
codegen-units = 1    # slower compile, better optimization
strip = true         # smaller binary
```

For maximum runtime performance at the cost of much slower compilation, use `lto = "fat"`.

---

## Summary Checklist

1. Enable dynamic linking + fast linker during development
2. Set `opt-level = 3` for dependency packages in dev profile
3. Use `&T` over `&mut T`, `Res` over `ResMut` wherever possible
4. Apply `Changed<T>` / `Added<T>` filters for expensive per-entity work
5. Order systems explicitly only where correctness demands it
6. Profile with Tracy before guessing at bottlenecks
7. Configure release profile with LTO and single codegen unit for shipping
