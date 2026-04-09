# Bevy — AI Rules

Engine-specific rules for projects using the Bevy game engine. These supplement the engine-agnostic rules in `docs/core/ai-workflow/gamedev-rules.md`.

---

## Architecture Context

### Tech Stack

- **Engine:** Bevy (data-driven ECS game engine, v0.18+)
- **Language:** Rust
- **Build System:** Cargo
- **Key Crates:** Commonly used alongside Bevy:
  - `avian2d` / `avian3d` (physics)
  - `bevy_egui` (immediate-mode UI)
  - `bevy_ecs_ldtk` (LDtk level editor)
  - `bevy_ecs_tilemap` (tilemaps)
  - `leafwing-input-manager` (action-based input)
  - `bevy_asset_loader` (structured asset loading)
  - `bevy_hanabi` (GPU particles)

### Project Structure Conventions

```
{ProjectName}/
├── assets/              # All game assets (textures, audio, fonts, scenes)
├── src/
│   ├── main.rs          # App::new(), plugin registration
│   ├── {feature}.rs     # One file per feature Plugin
│   └── lib.rs           # Optional: shared types
├── Cargo.toml
└── .cargo/
    └── config.toml      # Fast compile settings
```

---

## Rust + Bevy Code Generation Rules

### Components: Pure Data Only

```rust
// ✅ Correct: derive Component, plain data
#[derive(Component)]
struct Health(i32);

#[derive(Component)]
struct Velocity { x: f32, y: f32 }

// ✅ Marker components are zero-sized
#[derive(Component)]
struct Player;

// ❌ Wrong: no methods that mutate game state on components
// Components are data, systems are behavior
```

### Systems: Functions with Typed Parameters

```rust
// ✅ Correct: system is a plain function, dependencies are parameters
fn movement(mut query: Query<(&mut Transform, &Velocity)>, time: Res<Time>) {
    for (mut transform, vel) in &mut query {
        transform.translation.x += vel.x * time.delta_secs();
        transform.translation.y += vel.y * time.delta_secs();
    }
}

// ❌ Wrong: don't pass World directly unless you need exclusive access
// ❌ Wrong: don't store query results across frames
```

### Resources: Global Singletons

```rust
// ✅ Correct: derive Resource
#[derive(Resource)]
struct Score(u32);

// ✅ Access via Res<T> (read) or ResMut<T> (write)
fn show_score(score: Res<Score>) { /* ... */ }
```

### Events: Loose Coupling Between Systems

```rust
// ✅ Correct: derive Event
#[derive(Event)]
struct DamageEvent { entity: Entity, amount: f32 }

// ✅ Send with EventWriter, read with EventReader
// ✅ Register with app.add_event::<T>()
```

---

## Critical Bevy Conventions

### 1. Use Plugins for Organization

Every logical feature should be a `Plugin`. Do not dump all systems into `main.rs`.

```rust
pub struct CombatPlugin;
impl Plugin for CombatPlugin {
    fn build(&self, app: &mut App) {
        app.add_event::<DamageEvent>()
           .add_systems(Update, (attack_system, damage_system).chain());
    }
}
```

### 2. Commands Are Deferred

`Commands` (spawn, despawn, insert, remove) execute between system runs. Do not expect a spawned entity to be immediately queryable.

### 3. Query Conflict Resolution

Two `Query` parameters cannot mutably access the same component. Use `ParamSet` when needed:

```rust
fn conflicting(mut set: ParamSet<(
    Query<&mut Transform, With<Player>>,
    Query<&mut Transform, With<Enemy>>,
)>) {
    for mut t in set.p0().iter_mut() { /* player transforms */ }
    for mut t in set.p1().iter_mut() { /* enemy transforms */ }
}
```

### 4. Use FixedUpdate for Physics

Physics and networking systems belong in `FixedUpdate` for deterministic behavior:

```rust
app.add_systems(FixedUpdate, physics_step);
```

### 5. States for Game Phases

Use `States` to gate systems by game phase (Menu, Playing, Paused). Always define state transitions via `NextState<T>`.

### 6. Never Hallucinate APIs

Bevy's API changes significantly between versions. Always verify against the current version (0.18). Do not assume APIs from older tutorials still exist. When in doubt, reference `docs.rs/bevy/0.18` or the official migration guides.

---

## Rust-Specific Gotchas in Game Dev

### Ownership in Game Loops

```rust
// ❌ Wrong: cannot move texture into closure and also keep it
// Bevy handles this via Handles — you clone handles, not data
let handle: Handle<Image> = asset_server.load("sprite.png");
// handle.clone() is cheap (it's an Arc internally)
```

### Borrowing in Queries

```rust
// ❌ This won't compile — two mutable borrows of the same query
fn bad(mut q: Query<&mut Transform>) {
    let a = q.get_mut(entity_a).unwrap();
    let b = q.get_mut(entity_b).unwrap(); // ERROR: already borrowed
}

// ✅ Use iter_many_mut or get multiple with a different pattern
fn good(mut q: Query<&mut Transform>) {
    // Process one at a time, or use unsafe get_many_mut with distinct entities
}
```

### String Handling

Prefer `Name` component (which wraps `Cow<'static, str>`) over raw `String` components for entity labels. Use `&str` in function parameters, `String` in owned data.

---

## Version Compatibility

**Current version: Bevy 0.18.1** (released March 2026). The 0.19 development cycle is underway on `main`.

When recommending crate dependencies, always specify the Bevy version compatibility. Community crates typically release new versions within weeks of a Bevy release. Check `crates.io` for `bevy 0.18` compatibility before recommending.
