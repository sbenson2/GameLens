# E7 — Required Components & Entity Relationships

> **Category:** explanation · **Engine:** Bevy 0.18 · **Related:** [E1 ECS Fundamentals](E1_ecs_fundamentals.md) · [bevy-arch-rules](../bevy-arch-rules.md)

---

## Overview

Bevy 0.15 introduced **Required Components** — one of the most impactful API changes since Bevy's first release. Bevy 0.16 followed with **Entity Relationships**, replacing the old `Parent`/`Children` system with a general-purpose, ECS-native relationship primitive. Together, these features drastically reduce boilerplate and make entity composition declarative.

This doc covers both features as they exist in **Bevy 0.18**.

---

## Required Components

### The Problem They Solve

Before 0.15, spawning a sprite required manually bundling every dependency:

```rust
// Old Bevy — verbose, error-prone
commands.spawn((
    Sprite::default(),
    Transform::default(),
    GlobalTransform::default(),
    Visibility::default(),
    InheritedVisibility::default(),
    ViewVisibility::default(),
));
```

Missing any one of these caused silent failures. Required Components fix this permanently.

### How They Work

When Component A **requires** Component B, inserting A will automatically insert B (using its `Default` implementation) if B is not already present. This is recursive — if B requires C, C is also inserted.

```rust
// Bevy 0.18 — just spawn the components you care about
commands.spawn((
    Sprite::default(),
    Transform::from_xyz(100.0, 50.0, 0.0),
));
// GlobalTransform, Visibility, InheritedVisibility, ViewVisibility
// are all inserted automatically because Sprite requires them
```

### Declaring Required Components

Use the `#[require]` attribute on your `Component` derive:

```rust
use bevy::prelude::*;

// Basic: B is required with its Default implementation
#[derive(Component)]
#[require(Health, Velocity)]
struct Player;

#[derive(Component, Default)]
struct Health(i32);

#[derive(Component, Default)]
struct Velocity { x: f32, y: f32 }
```

**Required components must implement `Default`** (unless you provide a custom constructor).

### Custom Initialization

Supply a constructor function when `Default` isn't the right value:

```rust
#[derive(Component)]
#[require(Team(blue_team))]
struct Player {
    name: String,
}

#[derive(Component)]
struct Team(TeamColor);

enum TeamColor { Red, Blue }

fn blue_team() -> Team {
    Team(TeamColor::Blue)
}
```

### Overriding Defaults

Explicitly providing a required component at spawn time takes priority — the auto-inserted default is skipped:

```rust
#[derive(Component)]
#[require(Health)]
struct Player;

#[derive(Component)]
struct Health(i32);

impl Default for Health {
    fn default() -> Self { Health(100) }
}

// Health(250) is used — the default Health(100) is NOT inserted
commands.spawn((Player, Health(250)));
```

### Runtime Registration

Register required components dynamically (useful for plugins or mod systems):

```rust
// Using Default constructor
world.register_required_components::<Enemy, Health>();

// Using custom constructor
world.register_required_components_with::<Enemy, Health>(|| Health(50));
```

### Performance

Required Components are **zero-cost at steady state**:

- They are inserted alongside normal components in a single archetype operation — no extra table moves.
- The "what to insert" calculation is cached on the archetype graph, so it runs only once per unique component combination.

### Rust Ownership Gotcha

Required component constructors are plain functions returning owned values. They **cannot** borrow from the entity being spawned. If your required component needs data from a sibling component, set it explicitly at spawn time or use a startup system to patch it.

---

## Entity Relationships

### The Problem They Solve

Before Bevy 0.16, parent-child hierarchies used `Parent` and `Children` components managed by special commands (`with_children`, `set_parent`). This was:

- **One-off** — only parent/child, no custom relationship types
- **Confusing** — `Parent` was on the child entity, which read backwards
- **Inconsistent** — `Children` used a `SmallVec` outside the normal ECS lifecycle

### Relationship & RelationshipTarget

Bevy 0.16+ replaces this with a general `Relationship` / `RelationshipTarget` trait pair:

| Concept | Component | Lives On | Purpose |
|---------|-----------|----------|---------|
| **Relationship** | e.g. `ChildOf` | Source entity (the child) | Points to ONE target entity |
| **RelationshipTarget** | e.g. `Children` | Target entity (the parent) | Auto-maintained collection of all sources |

**The `Relationship` component is the source of truth.** When you insert a `Relationship` on entity A pointing to entity B, Bevy automatically (via component hooks) inserts or updates the `RelationshipTarget` on B to include A. This is immediate — not deferred.

### Built-in: ChildOf & Children

The canonical hierarchy uses `ChildOf` (renamed from `Parent` in 0.16):

```rust
use bevy::prelude::*;

// Method 1: Direct ChildOf
let fleet = commands.spawn(Fleet).id();
commands.spawn((Ship, ChildOf(fleet)));

// Method 2: with_children closure
commands.spawn(Fleet).with_children(|parent| {
    parent.spawn((Ship, Name::new("Destroyer")));
    parent.spawn((Ship, Name::new("Cruiser")));
});

// Method 3: children! macro (most concise)
commands.spawn((
    Fleet,
    children![
        (Ship, Name::new("Destroyer")),
        (Ship, Name::new("Cruiser")),
    ],
));
```

When a parent is despawned, all its `ChildOf` descendants are also despawned recursively.

### Defining Custom Relationships

Create your own relationship types with derive macros:

```rust
use bevy::prelude::*;

/// Source component — lives on the "attached" entity, points to the ship.
#[derive(Component)]
#[relationship(relationship_target = ShipAttachments)]
struct AttachedToShip(pub Entity);

/// Target component — auto-managed on the ship entity.
#[derive(Component)]
#[relationship_target(relationship = AttachedToShip, linked_spawn)]
struct ShipAttachments(Vec<Entity>);
```

**`linked_spawn`** — when the target entity (ship) is despawned, all related source entities (attachments) are also despawned. Omit this if you want orphaned entities to survive.

**Struct rules:** The derive works on structs with a single unnamed field, a single named field, or named structs where one field is annotated with `#[relationship]`.

### Spawning with Custom Relationships

```rust
let ship = commands.spawn(Ship).id();

// Direct
commands.spawn((GunTurret, AttachedToShip(ship)));

// Using related! macro
commands.spawn((
    Ship,
    related!(ShipAttachments[
        (GunTurret, Name::new("Bow Turret")),
        (GunTurret, Name::new("Stern Turret")),
    ]),
));
```

### Querying Relationships

**From target (parent) to sources (children):**

```rust
fn list_ship_weapons(
    ships: Query<(&Name, &ShipAttachments), With<Ship>>,
    turrets: Query<&Name, With<GunTurret>>,
) {
    for (ship_name, attachments) in &ships {
        for &turret_entity in attachments.iter() {
            if let Ok(turret_name) = turrets.get(turret_entity) {
                info!("{} has {}", ship_name, turret_name);
            }
        }
    }
}
```

**From source (child) to target (parent):**

```rust
fn find_parent_ship(
    turrets: Query<(&Name, &AttachedToShip), With<GunTurret>>,
    ships: Query<&Name, With<Ship>>,
) {
    for (turret_name, attached) in &turrets {
        if let Ok(ship_name) = ships.get(attached.0) {
            info!("{} is on {}", turret_name, ship_name);
        }
    }
}
```

**Traversal helpers (for hierarchies):**

```rust
fn traverse_hierarchy(
    children_query: Query<&Children>,
    parent_query: Query<&ChildOf>,
    names: Query<&Name>,
    root: Entity,
) {
    // Walk down — iter_descendants (breadth-first)
    for descendant in children_query.iter_descendants(root) {
        info!("Descendant: {:?}", names.get(descendant));
    }

    // Walk up — iter_ancestors
    for ancestor in parent_query.iter_ancestors(root) {
        info!("Ancestor: {:?}", names.get(ancestor));
    }
}
```

> **Warning:** Do not use `iter_descendants` on relationship graphs that contain cycles — it will loop infinitely.

### The Relationship Trait

For advanced use, the `Relationship` trait has three required methods:

```rust
pub trait Relationship: Component + Sized {
    type RelationshipTarget: RelationshipTarget<Relationship = Self>;

    fn get(&self) -> Entity;          // Read the target entity
    fn from(entity: Entity) -> Self;  // Construct from entity
    fn set_risky(&mut self, entity: Entity); // Reassign (use cautiously)
}
```

`set_risky` exists for internal use — it changes the target without re-running hooks. Prefer despawning and re-spawning relationships in game code.

### Migration from Pre-0.16

| Old API (0.15) | New API (0.16+) |
|----------------|-----------------|
| `Parent` component | `ChildOf` component |
| `Children` component | `Children` (same name, new impl) |
| `.parent()` on queries | `.related()` |
| `.children()` on queries | `.relationship_sources()` |
| `BuildChildren::with_children` | Still works, now generic over any relationship |
| `commands.entity(child).set_parent(parent)` | `commands.entity(child).insert(ChildOf(parent))` |

---

## Required Components + Relationships Together

These features compose naturally. A custom component can require a relationship:

```rust
#[derive(Component)]
#[require(ChildOf)] // WARNING: ChildOf has no meaningful Default
struct UIElement;
```

In practice, you'd provide the parent explicitly at spawn time — the `#[require]` ensures the component is always present on the archetype, enabling query optimizations.

A more practical pattern:

```rust
#[derive(Component)]
#[require(Transform, Visibility)]
struct Turret {
    damage: f32,
    range: f32,
}

// Turret auto-gets Transform + Visibility.
// Attach it to a ship via relationship:
commands.spawn((
    Turret { damage: 10.0, range: 50.0 },
    AttachedToShip(ship_entity),
));
```

---

## Common Pitfalls

1. **Forgetting `Default` on required components** — compilation fails with a confusing trait bound error. Add `#[derive(Default)]` or implement `Default` manually.

2. **Circular requirements** — A requires B requires A produces an inscrutable error at registration time. Design your component graph as a DAG.

3. **Many-to-many relationships** — Bevy relationships are one-to-many (one target, many sources). For many-to-many, use multiple relationship types or a junction-entity pattern.

4. **`iter_descendants` on cyclic graphs** — infinite loop. Only use on tree-shaped hierarchies.

5. **`set_risky` in game code** — Bypasses hooks. Use `insert(NewRelationship(target))` instead to properly update both sides.

---

## Further Reading

- [E1 — ECS Fundamentals](E1_ecs_fundamentals.md) — Core ECS concepts
- [G1 — Getting Started](../guides/G1_getting_started.md) — Project setup
- [R3 — Migration Patterns](../reference/R3_migration_patterns.md) — Version upgrade guide
- [Bevy 0.15 Release Notes — Required Components](https://bevy.org/news/bevy-0-15/)
- [Bevy 0.16 Migration Guide — Relationships](https://bevy.org/learn/migration-guides/0-15-to-0-16/)
