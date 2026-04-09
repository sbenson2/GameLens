# E1 — ECS Fundamentals

> **Category:** explanation · **Engine:** Bevy 0.18 · **Related:** [G1 Getting Started](../guides/G1_getting_started.md) · [bevy-arch-rules](../bevy-arch-rules.md)

---

## What is Bevy's ECS?

Bevy uses an Entity Component System as its core architecture. All game state lives in a central `World`, and game logic is expressed as **Systems** that operate on **Components** attached to **Entities**. This data-driven design enables automatic parallelism, cache-friendly memory layout, and highly composable game logic.

**Key difference from OOP engines:** There is no `GameObject` with methods. Data (Components) and behavior (Systems) are fully separated. An entity is just an ID — a lightweight handle that ties components together.

---

## Entities

An entity is a unique identifier (`Entity`) that groups components. Entities have no inherent type — their "type" is defined by which components are attached.

```rust
// Spawn an entity with components
commands.spawn((
    Transform::default(),
    Visibility::default(),
    Player { health: 100 },
    Name::new("Hero"),
));
```

Entities are created and destroyed through `Commands`, which are deferred — they execute between system runs to avoid data races.

---

## Components

Components are plain Rust structs (or enums) that derive the `Component` trait. They hold data only — no behavior.

```rust
use bevy::prelude::*;

#[derive(Component)]
struct Position {
    x: f32,
    y: f32,
}

#[derive(Component)]
struct Velocity {
    x: f32,
    y: f32,
}

#[derive(Component)]
struct Health(i32);

// Marker components (zero-sized types) are common for tagging
#[derive(Component)]
struct Player;

#[derive(Component)]
struct Enemy;
```

### Ownership Gotcha (Rust-Specific)

Components must be `'static` — they cannot hold references to other data. If you need shared data across entities, use a **Resource** or store an `Entity` handle as a component field to reference another entity.

```rust
// ✅ Store entity references, not Rust references
#[derive(Component)]
struct Target(Entity);

// ❌ Won't compile — components must be 'static
// #[derive(Component)]
// struct BadRef<'a>(&'a str);
```

---

## Systems

Systems are regular Rust functions whose parameters describe what data they need. Bevy reads the function signature to determine data access and schedule systems in parallel when safe.

```rust
// A system that moves entities with Position and Velocity
fn movement_system(mut query: Query<(&mut Position, &Velocity)>) {
    for (mut pos, vel) in &mut query {
        pos.x += vel.x;
        pos.y += vel.y;
    }
}

// A system that runs once at startup
fn setup_system(mut commands: Commands) {
    commands.spawn((Position { x: 0.0, y: 0.0 }, Velocity { x: 1.0, y: 0.5 }));
}
```

### System Parameters

Systems can request any combination of these parameters:

| Parameter | Purpose |
|-----------|---------|
| `Query<&T>` | Read component T |
| `Query<&mut T>` | Read/write component T |
| `Res<T>` | Read a resource |
| `ResMut<T>` | Read/write a resource |
| `Commands` | Deferred entity/component spawn/despawn |
| `EventReader<T>` | Read events |
| `EventWriter<T>` | Send events |
| `Local<T>` | Per-system local state |
| `Time` | Frame time and delta (via `Res<Time>`) |

### Registration

```rust
fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .add_systems(Startup, setup_system)           // Runs once
        .add_systems(Update, movement_system)          // Runs every frame
        .add_systems(Update, (system_a, system_b))     // Multiple systems
        .add_systems(Update, system_a.before(system_b)) // Ordering
        .run();
}
```

---

## Queries

Queries are the primary way systems access entity data. They are generic over the components they read/write and can include filters.

```rust
// Read Position from all entities that have it
fn read_positions(query: Query<&Position>) {
    for pos in &query {
        println!("x={}, y={}", pos.x, pos.y);
    }
}

// Read Position + Name, but only from entities with the Player marker
fn player_info(query: Query<(&Position, &Name), With<Player>>) {
    for (pos, name) in &query {
        println!("{} is at ({}, {})", name, pos.x, pos.y);
    }
}

// Exclude certain entities
fn non_player_positions(query: Query<&Position, Without<Player>>) {
    for pos in &query {
        println!("NPC at ({}, {})", pos.x, pos.y);
    }
}
```

### Query Filters

| Filter | Purpose |
|--------|---------|
| `With<T>` | Entity must have component T (don't read it) |
| `Without<T>` | Entity must NOT have component T |
| `Added<T>` | Component T was added this frame |
| `Changed<T>` | Component T was mutated this frame |
| `Or<(A, B)>` | Match if either filter passes |

---

## Resources

Resources are global singletons — typed data that exists once in the world (not per-entity).

```rust
#[derive(Resource)]
struct Score(u32);

#[derive(Resource)]
struct GameSettings {
    difficulty: f32,
    volume: f32,
}

// Insert a resource
fn setup(mut commands: Commands) {
    commands.insert_resource(Score(0));
    commands.insert_resource(GameSettings { difficulty: 1.0, volume: 0.8 });
}

// Read a resource
fn display_score(score: Res<Score>) {
    println!("Score: {}", score.0);
}

// Mutate a resource
fn increment_score(mut score: ResMut<Score>) {
    score.0 += 10;
}
```

### When to Use Resources vs Components

- **Resource:** Global state, config, scores, time, asset handles, audio settings
- **Component:** Per-entity data like position, health, AI state, sprite info

---

## Events

Events enable loose coupling between systems. One system sends events, another reads them. Events live for two frames then are automatically dropped.

```rust
#[derive(Event)]
struct DamageEvent {
    entity: Entity,
    amount: f32,
}

// Send events
fn attack_system(mut events: EventWriter<DamageEvent>) {
    events.write(DamageEvent { entity: target, amount: 25.0 });
}

// Receive events
fn damage_system(
    mut events: EventReader<DamageEvent>,
    mut query: Query<&mut Health>,
) {
    for event in events.read() {
        if let Ok(mut health) = query.get_mut(event.entity) {
            health.0 -= event.amount as i32;
        }
    }
}

// Register the event type
app.add_event::<DamageEvent>();
```

---

## Schedules and Ordering

Bevy organizes systems into **Schedules** that run at specific points in the frame.

### Built-in Schedules

| Schedule | When it runs |
|----------|-------------|
| `Startup` | Once, before the first `Update` |
| `PreUpdate` | Before `Update` each frame |
| `Update` | Main game logic, every frame |
| `PostUpdate` | After `Update` (transforms propagated here) |
| `FixedUpdate` | Fixed timestep (physics, networking) |
| `Last` | End of frame |

### System Ordering

```rust
app.add_systems(Update, (
    input_system,
    movement_system.after(input_system),
    collision_system.after(movement_system),
));

// Or use .chain() for strict sequential ordering
app.add_systems(Update, (
    input_system,
    movement_system,
    collision_system,
).chain());
```

---

## States

States control which systems run based on game phase (menu, playing, paused).

```rust
#[derive(States, Debug, Clone, PartialEq, Eq, Hash, Default)]
enum GameState {
    #[default]
    Menu,
    Playing,
    Paused,
    GameOver,
}

app.init_state::<GameState>()
   .add_systems(Update, menu_system.run_if(in_state(GameState::Menu)))
   .add_systems(Update, game_system.run_if(in_state(GameState::Playing)))
   .add_systems(OnEnter(GameState::Playing), setup_game)
   .add_systems(OnExit(GameState::Playing), cleanup_game);

// Transition states from a system
fn start_game(mut next_state: ResMut<NextState<GameState>>) {
    next_state.set(GameState::Playing);
}
```

---

## Archetype Storage Model

Under the hood, Bevy groups entities by their exact set of components into **archetypes**. Entities with the same component types share contiguous memory, enabling fast iteration.

**Implications for game devs:**
- Adding/removing components moves the entity to a new archetype (has a cost)
- Marker components are cheap to query but cause archetype fragmentation if overused
- Prefer changing component *values* over adding/removing components in hot paths
- Use `Changed<T>` filters to skip unchanged entities efficiently

---

## Commands and Deferred Execution

`Commands` are buffered and applied between system runs. This avoids borrow conflicts but means changes aren't visible until the next system run (or after an `apply_deferred` sync point).

```rust
fn spawn_bullet(mut commands: Commands) {
    // This entity doesn't exist yet during this system's execution
    let bullet = commands.spawn((
        Transform::from_xyz(0.0, 0.0, 0.0),
        Velocity { x: 0.0, y: 10.0 },
        Bullet,
    )).id();
    // bullet is an Entity handle but the entity isn't queryable yet
}
```

If you need immediate world access (rare), use an **exclusive system**:

```rust
fn exclusive_setup(world: &mut World) {
    // Direct world access — runs alone, no parallelism
    let entity = world.spawn((Position { x: 0.0, y: 0.0 },)).id();
}
```
