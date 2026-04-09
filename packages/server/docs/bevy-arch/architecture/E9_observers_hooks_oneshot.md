# E9 — Observers, Component Hooks & One-Shot Systems

> **Category:** explanation · **Engine:** Bevy 0.18 · **Related:** [E1 ECS Fundamentals](E1_ecs_fundamentals.md) · [E7 Required Components & Relationships](E7_required_components_relationships.md) · [bevy-arch-rules](../bevy-arch-rules.md)

---

## Overview

Bevy's ECS offers three complementary "push-style" mechanisms for reacting to world changes without polling every frame: **Observers**, **Component Hooks**, and **One-Shot Systems**. Introduced in Bevy 0.14 and refined through 0.18, these features replace many patterns that previously required marker components, change-detection queries, or manual event plumbing.

This doc covers the APIs as they exist in **Bevy 0.18** (Jan 2026).

---

## Component Lifecycle Hooks

Hooks are low-level callbacks registered directly on a component type. They fire **synchronously** as part of the ECS operation — no scheduling involved. Use hooks when a component needs constructor/destructor semantics that must _always_ run, regardless of what systems or plugins are present.

### Available Hooks

| Hook | Fires When |
|------|-----------|
| `on_add` | Component is added to an entity for the first time |
| `on_insert` | Component value is written (covers both add and overwrite) |
| `on_replace` | Component value is about to be overwritten |
| `on_remove` | Component is about to be removed from the entity |
| `on_despawn` | Entity owning the component is about to be despawned |

### Registering Hooks

```rust
use bevy::prelude::*;
use bevy::ecs::lifecycle::ComponentHooks;

#[derive(Component)]
#[component(on_add = on_inventory_add, on_remove = on_inventory_remove)]
struct Inventory {
    slots: Vec<Entity>,
}

/// Constructor: log when inventory is created
fn on_inventory_add(mut world: DeferredWorld, ctx: HookContext) {
    let entity = ctx.entity;
    info!("Inventory added to entity {entity:?}");
}

/// Destructor: clean up slot entities when inventory is removed
fn on_inventory_remove(mut world: DeferredWorld, ctx: HookContext) {
    let entity = ctx.entity;
    // Access the component value before it's gone
    let slots: Vec<Entity> = world
        .get::<Inventory>(entity)
        .map(|inv| inv.slots.clone())
        .unwrap_or_default();

    for slot in slots {
        world.commands().entity(slot).despawn();
    }
}
```

### Hook Rules

- Hooks receive a `DeferredWorld` — you have mutable access but cannot spawn/despawn directly. Use `world.commands()` for structural changes.
- Hooks are **per-component-type**, not per-entity. Every entity with that component type runs the same hooks.
- Hooks cannot be added or removed at runtime — they are part of the component's registration.
- **Execution order with Observers:** On add/insert, hooks run **before** observers. On replace/remove/despawn, observers run **before** hooks. This lets hooks act as the true constructor (first word) and destructor (last word).

### Rust Ownership Gotcha

Because `DeferredWorld` borrows the world mutably, you cannot read the component being removed while also writing to the world. Clone or copy the data you need before issuing commands:

```rust
fn on_remove_health(mut world: DeferredWorld, ctx: HookContext) {
    // Clone first — you can't hold the borrow across commands
    let hp = world.get::<Health>(ctx.entity).map(|h| h.current).unwrap_or(0);
    if hp > 0 {
        world.commands().entity(ctx.entity).insert(Corpse { last_hp: hp });
    }
}
```

---

## Observers

Observers are **event-driven systems** that run immediately when triggered. Unlike hooks, they are entities themselves — you can add, remove, or query them at runtime. They can watch for component lifecycle events _or_ custom events.

### Lifecycle Observers

```rust
use bevy::prelude::*;

fn setup_observers(mut commands: Commands) {
    // Global observer — watches ALL entities that gain an Enemy component
    commands.observe(on_enemy_added);

    // Entity-scoped observer — only watches this specific entity
    commands.spawn((
        Player,
        Name::new("Hero"),
    )).observe(on_player_damaged);
}

/// Fires when any entity receives the Enemy component.
/// `On<Add, Enemy>` is the trigger type — Add, Insert, Replace, Remove, Despawn.
fn on_enemy_added(event: On<Add, Enemy>, mut commands: Commands, query: Query<&Transform>) {
    let entity = event.target();
    if let Ok(transform) = query.get(entity) {
        info!("Enemy spawned at {:?}", transform.translation);
        commands.entity(entity).insert(EnemyAI::default());
    }
}

fn on_player_damaged(event: On<Insert, Health>, query: Query<&Health>) {
    let entity = event.target();
    if let Ok(health) = query.get(entity) {
        if health.current < health.max / 4 {
            info!("Player is critically low on health!");
        }
    }
}
```

### Custom Event Observers

You can define your own events and trigger them manually:

```rust
#[derive(Event)]
struct LevelUp {
    new_level: u32,
}

fn setup(mut commands: Commands) {
    commands.observe(on_level_up);
}

fn on_level_up(event: On<LevelUp>, query: Query<&Name>) {
    let entity = event.target();
    let level = event.event().new_level;
    if let Ok(name) = query.get(entity) {
        info!("{} reached level {}!", name, level);
    }
}

// Trigger from a system
fn check_experience(
    mut commands: Commands,
    query: Query<(Entity, &Experience, &Level)>,
) {
    for (entity, xp, level) in &query {
        if xp.total >= level.next_threshold() {
            commands.trigger_targets(LevelUp { new_level: level.current + 1 }, entity);
        }
    }
}
```

### Observer vs Hook Decision Guide

| Use Case | Hook | Observer |
|----------|------|----------|
| Constructor/destructor that must ALWAYS run | Yes | No |
| Runtime-configurable reaction | No | Yes |
| Watches a specific entity only | No | Yes |
| Custom (non-lifecycle) events | No | Yes |
| Multiple independent reactions to same event | No | Yes |
| Needs to run before/after other observers | No | Ordering via `.before()` / `.after()` |
| Access to system params (Query, Res, etc.) | No (DeferredWorld only) | Yes |

### API Naming (Bevy 0.18)

Earlier Bevy versions used `Trigger<E>` as the first parameter. In Bevy 0.18, this has been renamed to `On<E>` (or `On<E, C>` for lifecycle events targeting a component). The lifecycle event names were also simplified:

| Old Name (0.14–0.16) | New Name (0.17+) |
|-----------------------|------------------|
| `OnAdd` | `Add` |
| `OnInsert` | `Insert` |
| `OnReplace` | `Replace` |
| `OnRemove` | `Remove` |
| `OnDespawn` | `Despawn` |

---

## One-Shot Systems

One-shot systems are regular Bevy systems that you run **on demand** rather than every frame. They are useful for button callbacks, event handlers, initialization logic, or any code you want to run exactly once in response to something.

### Basic Usage with `run_system_cached`

```rust
use bevy::prelude::*;

fn spawn_wave(mut commands: Commands, wave: Res<WaveConfig>) {
    for i in 0..wave.enemy_count {
        commands.spawn((
            Enemy,
            Transform::from_xyz(i as f32 * 2.0, 0.0, 0.0),
        ));
    }
    info!("Spawned wave of {} enemies", wave.enemy_count);
}

// Run it from another system via Commands
fn wave_trigger(mut commands: Commands, input: Res<ButtonInput<KeyCode>>) {
    if input.just_pressed(KeyCode::Space) {
        // Registers the system on first call, caches the SystemId for reuse
        commands.run_system_cached(spawn_wave);
    }
}
```

### Key Behaviors

- **Immediate command application:** One-shot systems apply their commands immediately when they run, not at the end of the stage. This is different from scheduled systems.
- **ZST requirement for `run_system_cached`:** Only zero-sized-type systems (plain `fn` items) are accepted — no closures that capture state. This ensures two calls with the same function type always reference the same cached system.
- **Manual registration for non-ZST:** If you need closures or systems with captured state, register them manually with `world.register_system(my_system)` and store the returned `SystemId`.

### One-Shot Systems with Input/Output

```rust
fn damage_entity(In(amount): In<u32>, mut query: Query<&mut Health>) {
    for mut health in &mut query {
        health.current = health.current.saturating_sub(amount);
    }
}

fn apply_damage(mut commands: Commands) {
    // Pass input to the one-shot system
    commands.run_system_cached_with(damage_entity, 25);
}
```

### When to Use Each Pattern

| Pattern | Best For |
|---------|----------|
| Scheduled systems | Logic that runs every frame or on a fixed timer |
| Observers | Reacting to ECS events (component lifecycle, custom triggers) |
| One-shot systems | Imperative "do this now" calls — UI buttons, console commands, initialization |
| Hooks | Guaranteed component setup/teardown (constructor/destructor) |

---

## Combining Patterns: A Practical Example

Here is a pattern combining hooks, observers, and one-shot systems for an enemy spawner:

```rust
/// Hook ensures EnemyStats always gets default AI config
#[derive(Component)]
#[component(on_add = init_enemy_defaults)]
struct EnemyStats {
    hp: u32,
    damage: u32,
    ai_state: AiState,
}

fn init_enemy_defaults(mut world: DeferredWorld, ctx: HookContext) {
    // Hook: set default AI state based on enemy type
    // This always runs, even if spawned from editor tools or tests
    let entity = ctx.entity;
    if let Some(stats) = world.get::<EnemyStats>(entity) {
        if stats.ai_state == AiState::Uninitialized {
            // Can't mutate directly in hook — use commands
            world.commands().entity(entity).insert(AiState::Idle);
        }
    }
}

/// Observer: spawn VFX when enemy appears (can be disabled by removing observer)
fn on_enemy_spawn(event: On<Add, EnemyStats>, mut commands: Commands, transforms: Query<&Transform>) {
    let entity = event.target();
    if let Ok(pos) = transforms.get(entity) {
        commands.spawn(SpawnVfxBundle::at(pos.translation));
    }
}

/// One-shot: spawn a full wave imperatively
fn spawn_enemy_wave(
    mut commands: Commands,
    wave: Res<WaveConfig>,
    rng: ResMut<GameRng>,
) {
    for _ in 0..wave.count {
        let pos = rng.random_spawn_point();
        commands.spawn((
            EnemyStats { hp: wave.hp, damage: wave.damage, ai_state: AiState::Uninitialized },
            Transform::from_translation(pos),
        ));
        // Hook fires → sets AI state
        // Observer fires → spawns VFX
    }
}

fn setup(mut commands: Commands) {
    commands.observe(on_enemy_spawn);
}

fn gameplay(mut commands: Commands, input: Res<ButtonInput<KeyCode>>) {
    if input.just_pressed(KeyCode::KeyW) {
        commands.run_system_cached(spawn_enemy_wave);
    }
}
```

---

## Cargo Dependencies

No extra crates needed — observers, hooks, and one-shot systems are all part of `bevy` core:

```toml
[dependencies]
bevy = "0.18"
```

---

## Common Pitfalls

1. **Borrowing in hooks:** You only get `DeferredWorld`, not full `World`. Clone data before issuing commands that would conflict with the borrow.
2. **Observer ordering:** Multiple observers for the same event run in registration order by default. Use `.before()` / `.after()` if ordering matters.
3. **One-shot + closures:** `run_system_cached` rejects closures. Use `world.register_system()` + `run_system()` for closures with captured state.
4. **Trigger vs On:** If migrating from Bevy 0.14–0.16, replace `Trigger<OnAdd>` with `On<Add, MyComponent>`. See [R3 Migration Patterns](../reference/R3_migration_patterns.md).
5. **Commands in hooks don't flush automatically** before observers. If you need commands from a hook to be visible to observers, manually flush with `world.flush_commands()`.

---

## Further Reading

- [E1 ECS Fundamentals](E1_ecs_fundamentals.md) — Core ECS concepts
- [E7 Required Components & Relationships](E7_required_components_relationships.md) — Declarative entity composition
- [R3 Migration Patterns](../reference/R3_migration_patterns.md) — Version upgrade guides
- [Bevy Official Observers Example](https://bevy.org/examples/ecs-entity-component-system/observers/)
- [ComponentHooks API Docs](https://docs.rs/bevy/latest/bevy/ecs/lifecycle/struct.ComponentHooks.html)
