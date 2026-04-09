# E13 — Common ECS Anti-Patterns & Pitfalls

> **Category:** architecture · **Engine:** Bevy 0.18 · **Related:** [E1 ECS Fundamentals](E1_ecs_fundamentals.md) · [E11 System Scheduling & Ordering](E11_system_scheduling_sets_ordering.md) · [E8 Performance Optimization](E8_performance_optimization.md) · [bevy-arch-rules](../bevy-arch-rules.md)

---

## Why This Matters

Bevy's ECS is powerful but unfamiliar to developers coming from OOP game engines. Many bugs and performance issues stem from a small set of recurring mistakes. This document catalogs the most common anti-patterns, explains *why* they cause problems, and shows the idiomatic fix.

---

## 1. God Components

### The Anti-Pattern

```rust
// ❌ One massive component with everything
#[derive(Component)]
struct Player {
    health: f32,
    mana: f32,
    position: Vec3,
    velocity: Vec3,
    inventory: Vec<Item>,
    quest_log: Vec<Quest>,
    sprite_index: usize,
    animation_timer: Timer,
}
```

### Why It Hurts

- **Wasted memory:** Entities that share only *some* fields (e.g. an NPC with health but no quest log) still allocate the full struct.
- **Cache misses:** Bevy stores components in archetypes. Large components mean fewer fit in a cache line during iteration.
- **Contention:** Any system that needs `&mut Player` blocks *every other* system that touches `Player`, even if they access different fields.

### The Fix

Split into small, focused components:

```rust
// ✅ Composable, cache-friendly components
#[derive(Component)]
struct Health(f32);

#[derive(Component)]
struct Mana(f32);

#[derive(Component)]
struct Velocity(Vec3);

#[derive(Component)]
struct Inventory(Vec<Item>);
```

Systems that only need health never contend with systems that update animation. Entities that don't need mana simply omit that component.

---

## 2. Forgetting System Ordering

### The Anti-Pattern

```rust
// ❌ Two systems that depend on each other, no ordering specified
app.add_systems(Update, (move_player, apply_physics));
```

### Why It Hurts

Bevy schedules unordered systems in **parallel by default**. If `apply_physics` reads velocity that `move_player` just wrote, the result is non-deterministic — sometimes physics sees stale data, sometimes fresh.

### The Fix

Explicit ordering:

```rust
// ✅ Guarantee move_player runs before apply_physics
app.add_systems(Update, (move_player, apply_physics).chain());

// Or with named ordering
app.add_systems(Update, move_player.before(apply_physics));
```

> **Rule of thumb:** If system B reads data that system A writes *in the same schedule*, chain them. If you're unsure whether two systems conflict, Bevy's ambiguity detector (`LogPlugin` in dev builds) will warn you.

---

## 3. Conflicting Query Parameters

### The Anti-Pattern

```rust
// ❌ Compile error — two mutable borrows of the same component
fn bad_system(
    mut query_a: Query<&mut Transform, With<Player>>,
    mut query_b: Query<&mut Transform, With<Enemy>>,
) { /* ... */ }
```

Even though the *filters* are disjoint (`Player` vs `Enemy`), Bevy cannot statically prove they don't overlap at the type level. This fails the borrow check at system initialization.

### The Fix — ParamSet

```rust
// ✅ ParamSet ensures only one query is accessed at a time
fn fixed_system(
    mut set: ParamSet<(
        Query<&mut Transform, With<Player>>,
        Query<&mut Transform, With<Enemy>>,
    )>,
) {
    // Access one at a time
    for mut transform in set.p0().iter_mut() {
        transform.translation.x += 1.0;
    }
    for mut transform in set.p1().iter_mut() {
        transform.translation.x -= 1.0;
    }
}
```

### The Fix — Without Filter (when applicable)

If the queries are truly disjoint, use `Without<>` to prove it to the type system:

```rust
// ✅ Without<Enemy> proves no overlap
fn also_fixed(
    mut players: Query<&mut Transform, (With<Player>, Without<Enemy>)>,
    mut enemies: Query<&mut Transform, (With<Enemy>, Without<Player>)>,
) { /* ... */ }
```

---

## 4. Spawning Entities Without Required Components

### The Anti-Pattern

```rust
// ❌ SpriteBundle needs a Transform, but what about your game logic?
commands.spawn(SpriteBundle { ..default() });
// Later: a system queries (With<Health>, With<SpriteBundle>) and finds nothing
```

### Why It Hurts

Bevy 0.15+ introduced **Required Components** — component `A` can declare that it *requires* component `B`. If you forget to insert `B`, Bevy inserts a default. But if your *own* components don't declare requirements, you get entities missing data and silent query misses.

### The Fix

Use `#[require]` on your components (Bevy 0.15+):

```rust
#[derive(Component)]
#[require(Health, Transform)]
struct Player;

// Now spawning Player auto-inserts Health::default() and Transform::default()
commands.spawn(Player);
```

Or bundle everything explicitly:

```rust
commands.spawn((
    Player,
    Health(100.0),
    SpriteBundle { ..default() },
));
```

---

## 5. Overusing `Commands` When Direct World Access Works

### The Anti-Pattern

```rust
// ❌ Spawning thousands of entities via Commands in a hot loop
fn spawn_bullets(mut commands: Commands) {
    for _ in 0..1000 {
        commands.spawn(BulletBundle::new());
    }
}
```

### Why It Hurts

`Commands` are deferred — they queue up and execute after the system finishes. This is *correct* but for bulk operations it introduces a frame-delay and can cause a stall when the command buffer flushes.

### The Fix

For bulk spawning, use `spawn_batch`:

```rust
// ✅ Single allocation, processed together
fn spawn_bullets(mut commands: Commands) {
    let bullets: Vec<BulletBundle> = (0..1000)
        .map(|_| BulletBundle::new())
        .collect();
    commands.spawn_batch(bullets);
}
```

For systems that need immediate world access (e.g. exclusive systems):

```rust
// ✅ Exclusive system — direct world access, no deferral
fn immediate_spawn(world: &mut World) {
    world.spawn(BulletBundle::new());
}
```

---

## 6. Mutating Resources Inside Queries

### The Anti-Pattern

```rust
// ❌ Borrows both Query and ResMut, potential conflicts
fn bad_scoring(
    mut score: ResMut<Score>,
    query: Query<&Damage, With<Enemy>>,
) {
    for damage in &query {
        score.total += damage.0;
    }
}
```

This specific example actually works, but becomes a problem when the resource type overlaps with queried data or when you add more parameters.

### The Fix

Keep resource mutations and queries as narrow as possible. If you hit conflicts, extract the query results first:

```rust
fn safe_scoring(
    mut score: ResMut<Score>,
    query: Query<&Damage, With<Enemy>>,
) {
    let total: f32 = query.iter().map(|d| d.0).sum();
    score.total += total;
}
```

---

## 7. Ignoring Change Detection

### The Anti-Pattern

```rust
// ❌ Processes ALL entities every frame, even if nothing changed
fn update_ui_labels(
    query: Query<(&Health, &UiLabel)>,
) {
    for (health, label) in &query {
        // Rebuild label text every frame...
    }
}
```

### The Fix

Use `Changed<T>` or `Ref<T>` to skip unchanged entities:

```rust
// ✅ Only run on entities whose Health actually changed
fn update_ui_labels(
    query: Query<(&Health, &UiLabel), Changed<Health>>,
) {
    for (health, label) in &query {
        // Rebuild label text only when health changes
    }
}
```

> **Caveat:** `Changed<T>` is true on the tick the component was added *or* mutably accessed. It is *not* true if the component was only read. A common surprise: `&mut T` marks as changed even if you didn't modify the value. Use `Ref<T>` and check `.is_changed()` if you need finer control.

---

## 8. Event Misuse: Missing Events or Double-Processing

### The Anti-Pattern

```rust
// ❌ Events are auto-cleared after 2 frames
// If your reader runs less frequently, events silently vanish
fn rare_system(mut reader: EventReader<Explosion>) {
    // This system runs in FixedUpdate — if it skips a frame, boom: lost events
    for event in reader.read() { /* ... */ }
}
```

### The Fix

- Read events in the *same schedule* they're sent, or within 2 frames.
- For cross-schedule communication, use a `Resource` or `Observer` instead.
- Never assume an event will still exist by the time a slow system runs.

```rust
// ✅ Observer: fires immediately when the component is added, no timing issues
app.add_observer(on_explosion);

fn on_explosion(trigger: Trigger<OnAdd, Explosion>, query: Query<&Transform>) {
    let transform = query.get(trigger.target()).unwrap();
    // Handle explosion at the exact right moment
}
```

---

## Quick Reference: Pitfall → Fix

| Pitfall | Symptom | Fix |
|---------|---------|-----|
| God component | Slow iteration, broad contention | Split into small components |
| Unordered systems | Non-deterministic behavior | `.chain()` or `.before()` / `.after()` |
| Conflicting queries | Runtime panic or compile error | `ParamSet` or `Without<>` filter |
| Missing components | Silent query misses | `#[require]` or explicit bundles |
| Commands in hot loop | Frame stall on flush | `spawn_batch` or exclusive system |
| No change detection | Wasted CPU every frame | `Changed<T>` filter |
| Events crossing schedules | Lost events | Use `Observer` or `Resource` |

---

## Next Steps

- **[E11 System Scheduling & Ordering](E11_system_scheduling_sets_ordering.md)** — deep dive on scheduling
- **[E8 Performance Optimization](E8_performance_optimization.md)** — profiling and benchmarking
- **[E9 Observers, Hooks & One-Shot Systems](E9_observers_hooks_oneshot.md)** — reactive patterns
- **[E7 Required Components & Relationships](E7_required_components_relationships.md)** — component design patterns
