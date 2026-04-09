# G9 — AI & Pathfinding Patterns

> **Category:** guide · **Engine:** Bevy 0.18 · **Related:** [E1 ECS Fundamentals](../architecture/E1_ecs_fundamentals.md) · [E9 Observers & Hooks](../architecture/E9_observers_hooks_oneshot.md) · [G2 Physics (Avian)](G2_physics_avian.md) · [R2 Community Plugins](../reference/R2_community_plugins_ecosystem.md) · [bevy-arch-rules](../bevy-arch-rules.md)

---

## Overview

Game AI in Bevy leverages the ECS architecture: AI state lives in components, decision-making runs in systems, and behavior trees or utility AI are expressed as composable data. Pathfinding is handled through dedicated crates that integrate with Bevy's transform and physics systems.

This guide covers three layers: **decision-making** (what to do), **pathfinding** (how to get there), and **steering** (how to move smoothly).

---

## Decision-Making Architectures

### 1. Simple State Machine (No Dependencies)

For enemies with few behaviors, a hand-rolled state machine using an enum component is the lightest approach:

```rust
use bevy::prelude::*;

#[derive(Component, Reflect, Default, Debug, Clone, PartialEq)]
#[reflect(Component)]
enum EnemyState {
    #[default]
    Idle,
    Patrol { waypoint_index: usize },
    Chase { target: Entity },
    Attack { target: Entity },
    Flee,
}

#[derive(Component)]
struct AiConfig {
    detection_range: f32,
    attack_range: f32,
    flee_health_threshold: f32,
}

fn enemy_decision_system(
    mut enemies: Query<(&mut EnemyState, &AiConfig, &Transform, &Health)>,
    player: Query<(Entity, &Transform), With<Player>>,
) {
    let Ok((player_entity, player_transform)) = player.single() else {
        return;
    };

    for (mut state, config, transform, health) in &mut enemies {
        let distance = transform.translation.distance(player_transform.translation);

        // Flee if low health — highest priority
        if health.current < config.flee_health_threshold {
            *state = EnemyState::Flee;
            continue;
        }

        // Attack if in range
        if distance < config.attack_range {
            *state = EnemyState::Attack { target: player_entity };
            continue;
        }

        // Chase if detected
        if distance < config.detection_range {
            *state = EnemyState::Chase { target: player_entity };
            continue;
        }

        // Default: patrol
        if !matches!(*state, EnemyState::Patrol { .. }) {
            *state = EnemyState::Patrol { waypoint_index: 0 };
        }
    }
}
```

**When to use:** Fewer than ~5 states, simple priority ordering, no need for parallel evaluation.

### 2. Utility AI with big-brain

`big-brain` implements **Utility AI**: each possible action is scored by how desirable it is, and the highest-scoring action executes. This scales better than state machines when entities have many possible behaviors.

> **Note:** `big-brain` v0.22 supports Bevy 0.16. Check for updated versions on [Codeberg](https://codeberg.org/zkat/big-brain) — the GitHub repository is archived.

```toml
[dependencies]
bevy = "0.18"
big-brain = "0.22"  # Check for Bevy 0.18 compatible version
```

#### Core Concepts

| Concept | Role |
|---------|------|
| **Scorer** | Reads world state, outputs a `Score` (0.0–1.0) |
| **Action** | Performs a behavior, reports `ActionState` (Requested → Success/Failure) |
| **Thinker** | Combines scorers + actions with a picking strategy |

#### Example: Thirsty NPC

```rust
use bevy::prelude::*;
use big_brain::prelude::*;

// --- Scorer: How thirsty is the NPC? ---
#[derive(Component, Clone, ActionBuilder)]
struct Thirsty;

fn thirsty_scorer(
    mut query: Query<(&Actor, &mut Score), With<Thirsty>>,
    thirsts: Query<&Thirst>,
) {
    for (actor, mut score) in &mut query {
        if let Ok(thirst) = thirsts.get(actor.0) {
            // Normalize thirst to 0.0–1.0
            score.set(thirst.level / thirst.max);
        }
    }
}

// --- Action: Go drink water ---
#[derive(Component, Clone, ActionBuilder)]
struct DrinkWater;

fn drink_water_action(
    mut query: Query<(&Actor, &mut ActionState), With<DrinkWater>>,
    mut thirsts: Query<&mut Thirst>,
) {
    for (actor, mut action_state) in &mut query {
        match *action_state {
            ActionState::Requested => {
                *action_state = ActionState::Executing;
            }
            ActionState::Executing => {
                if let Ok(mut thirst) = thirsts.get_mut(actor.0) {
                    thirst.level -= 10.0;
                    if thirst.level <= 0.0 {
                        thirst.level = 0.0;
                        *action_state = ActionState::Success;
                    }
                }
            }
            _ => {}
        }
    }
}

// --- Assembly ---
fn spawn_npc(mut commands: Commands) {
    commands.spawn((
        Thirst { level: 50.0, max: 100.0 },
        Thinker::build()
            .picker(FirstToScore { threshold: 0.6 })
            .when(Thirsty, DrinkWater),
    ));
}
```

### 3. Behavior Trees with bevior_tree

For complex sequential/conditional logic (RPG NPCs, boss patterns), behavior trees offer explicit control flow:

```toml
[dependencies]
bevior_tree = "0.4"  # Check for Bevy 0.18 compatible version
```

Behavior trees use `Sequence` (run all children in order, fail on first failure), `Selector` (try children until one succeeds), and leaf `Task` nodes.

**When to choose which:**

| Pattern | Best for |
|---------|----------|
| State machine | Simple enemies, < 5 states |
| Utility AI | Many competing desires, emergent behavior |
| Behavior tree | Scripted sequences, boss phases, complex conditionals |

---

## Pathfinding

### Grid-Based: The `pathfinding` Crate

For 2D tile-based games, the `pathfinding` crate provides A*, Dijkstra, BFS, and more — pure Rust, no Bevy dependency. You integrate it via a system.

```toml
[dependencies]
pathfinding = "4"
```

```rust
use bevy::prelude::*;
use pathfinding::prelude::astar;

#[derive(Component)]
struct GridPosition { x: i32, y: i32 }

#[derive(Component)]
struct PathResult {
    waypoints: Vec<(i32, i32)>,
    current_index: usize,
}

#[derive(Resource)]
struct TileMap {
    width: i32,
    height: i32,
    /// true = walkable
    walkable: Vec<bool>,
}

impl TileMap {
    fn is_walkable(&self, x: i32, y: i32) -> bool {
        if x < 0 || y < 0 || x >= self.width || y >= self.height {
            return false;
        }
        self.walkable[(y * self.width + x) as usize]
    }

    fn neighbors(&self, x: i32, y: i32) -> Vec<((i32, i32), u32)> {
        let dirs = [(-1, 0), (1, 0), (0, -1), (0, 1)];
        dirs.iter()
            .filter_map(|&(dx, dy)| {
                let nx = x + dx;
                let ny = y + dy;
                self.is_walkable(nx, ny).then_some(((nx, ny), 1))
            })
            .collect()
    }
}

fn find_path_system(
    mut commands: Commands,
    seekers: Query<(Entity, &GridPosition, &Target), Without<PathResult>>,
    targets: Query<&GridPosition>,
    tilemap: Res<TileMap>,
) {
    for (entity, pos, target) in &seekers {
        let Ok(target_pos) = targets.get(target.0) else { continue };

        let start = (pos.x, pos.y);
        let goal = (target_pos.x, target_pos.y);

        let result = astar(
            &start,
            |&(x, y)| tilemap.neighbors(x, y),
            |&(x, y)| ((x - goal.0).abs() + (y - goal.1).abs()) as u32, // Manhattan heuristic
            |&p| p == goal,
        );

        if let Some((path, _cost)) = result {
            commands.entity(entity).insert(PathResult {
                waypoints: path,
                current_index: 0,
            });
        }
    }
}
```

> **Rust gotcha — ownership in closures:** The `astar` function takes closures for successors and heuristic. If your tile map is behind a reference, you may need to clone data or use `Res<TileMap>` carefully to satisfy the borrow checker.

### NavMesh: oxidized_navigation (3D)

For 3D games, `oxidized_navigation` generates navigation meshes at runtime from physics colliders:

```toml
[dependencies]
oxidized_navigation = "0.12"  # Check for Bevy 0.18 compatible version
oxidized_navigation_avian = "0.3"  # If using Avian physics
```

```rust
use bevy::prelude::*;
use oxidized_navigation::prelude::*;

fn setup_navmesh(mut commands: Commands) {
    // Configure nav-mesh generation
    commands.insert_resource(NavMeshSettings {
        cell_width: 0.25,
        cell_height: 0.1,
        tile_width: 100,
        world_half_extents: 250.0,
        world_bottom: -10.0,
        max_traversable_slope_radians: (40.0_f32).to_radians(),
        walkable_height: 20,   // In voxel cells
        walkable_radius: 2,
        step_height: 3,
        min_region_area: 100,
        max_contour_simplification_error: 1.1,
        ..default()
    });
}

// Tag any entity that should block/affect the navmesh:
fn spawn_obstacle(mut commands: Commands) {
    commands.spawn((
        Transform::from_xyz(5.0, 0.0, 5.0),
        // Your physics collider here (Avian or Rapier)
        NavMeshAffector::default(), // Triggers navmesh rebuild
    ));
}
```

Pathfinding queries use the `NavMesh` resource:

```rust
fn query_navmesh_path(nav_mesh: Res<NavMesh>) {
    if let Ok(nav_mesh_data) = nav_mesh.get().read() {
        let start = Vec3::new(0.0, 0.5, 0.0);
        let end = Vec3::new(10.0, 0.5, 8.0);

        if let Ok(path) = find_path(&nav_mesh_data, start, end) {
            for waypoint in &path {
                info!("Waypoint: {:?}", waypoint);
            }
        }
    }
}
```

### Hierarchical: bevy_northstar (2D/2.5D)

For large 2D maps where A* is too slow, `bevy_northstar` provides **Hierarchical Pathfinding A* (HPA*)**:

```toml
[dependencies]
bevy_northstar = "0.6"  # Check for Bevy 0.18 compatible version
```

Key features: supports 2D, 2.5D, and 3D; handles layered isometric maps; async pathfinding to avoid frame spikes.

---

## Steering & Movement

Once you have a path, you need smooth movement along it.

### Path Following

```rust
fn follow_path_system(
    mut query: Query<(&mut Transform, &mut PathResult)>,
    time: Res<Time>,
) {
    let speed = 5.0;

    for (mut transform, mut path) in &mut query {
        if path.current_index >= path.waypoints.len() {
            continue; // Path complete
        }

        let target = path.waypoints[path.current_index];
        let target_pos = Vec3::new(target.0 as f32, 0.0, target.1 as f32);
        let direction = (target_pos - transform.translation).normalize_or_zero();

        transform.translation += direction * speed * time.delta_secs();

        // Advance to next waypoint when close enough
        if transform.translation.distance(target_pos) < 0.3 {
            path.current_index += 1;
        }
    }
}
```

### Separation (Avoid Stacking)

When multiple agents follow paths, prevent overlap with a simple separation force:

```rust
fn separation_system(
    mut agents: Query<(Entity, &mut Transform), With<AiAgent>>,
) {
    let min_distance = 1.5;
    let separation_strength = 2.0;

    // Collect positions first to avoid borrow conflicts
    let positions: Vec<(Entity, Vec3)> = agents
        .iter()
        .map(|(e, t)| (e, t.translation))
        .collect();

    for (entity, mut transform) in &mut agents {
        let mut separation = Vec3::ZERO;

        for &(other_entity, other_pos) in &positions {
            if other_entity == entity { continue; }
            let diff = transform.translation - other_pos;
            let dist = diff.length();
            if dist < min_distance && dist > 0.001 {
                separation += diff.normalize() / dist;
            }
        }

        transform.translation += separation * separation_strength;
    }
}
```

---

## Performance Considerations

| Concern | Solution |
|---------|----------|
| A* on large grids (> 500×500) | Use hierarchical pathfinding (bevy_northstar) or chunk the grid |
| Many agents pathfinding per frame | Spread requests across frames with a queue; limit to N per tick |
| NavMesh rebuild cost | `oxidized_navigation` rebuilds only affected tiles asynchronously |
| Scorer evaluation cost | Keep scorer systems cheap — cache expensive queries in components |

### Throttled Pathfinding

```rust
#[derive(Resource)]
struct PathfindingQueue {
    pending: Vec<Entity>,
    max_per_frame: usize,
}

fn throttled_pathfinding(
    mut queue: ResMut<PathfindingQueue>,
    // ... pathfinding dependencies
) {
    let batch: Vec<Entity> = queue.pending
        .drain(..queue.max_per_frame.min(queue.pending.len()))
        .collect();

    for entity in batch {
        // Run pathfinding for this entity
    }
}
```

---

## Combining AI + Pathfinding

A typical game loop:

1. **Decision system** evaluates state → picks a behavior (chase, flee, patrol)
2. **Pathfinding system** generates a path based on behavior target
3. **Steering system** moves entity along the path each frame
4. **Re-evaluation** — decision system re-checks periodically, cancels/replans if needed

```rust
// Schedule ordering in your App:
app.add_systems(Update, (
    enemy_decision_system,
    find_path_system.after(enemy_decision_system),
    follow_path_system.after(find_path_system),
    separation_system.after(follow_path_system),
));
```

---

## Ecosystem Crate Summary

| Crate | Type | Bevy Support | Notes |
|-------|------|-------------|-------|
| `pathfinding` | Grid A*/Dijkstra | Any (no Bevy dep) | Pure algorithms, integrate via systems |
| `big-brain` | Utility AI | 0.16 (check updates) | Archived on GitHub → Codeberg |
| `bevior_tree` | Behavior trees | 0.15+ (check updates) | Sequential/conditional AI logic |
| `oxidized_navigation` | 3D NavMesh | 0.15 (check updates) | Runtime mesh generation from colliders |
| `bevy_northstar` | Hierarchical A* | 0.17 (check updates) | Large 2D/2.5D maps, async |
| `vleue_navigator` | 2D NavMesh (Polyanya) | 0.15+ (check updates) | Polygon-based 2D navigation |

> **Version warning:** AI and pathfinding crates often lag behind Bevy releases. Always verify Bevy version compatibility on crates.io before adding to your project.

---

## Further Reading

- [E1 — ECS Fundamentals](../architecture/E1_ecs_fundamentals.md) — Components, systems, queries
- [G2 — Physics (Avian)](G2_physics_avian.md) — Colliders used by navmesh generators
- [R2 — Community Plugins](../reference/R2_community_plugins_ecosystem.md) — Full ecosystem catalog
- [pathfinding crate docs](https://docs.rs/pathfinding)
- [big-brain on Codeberg](https://codeberg.org/zkat/big-brain)
- [oxidized_navigation on GitHub](https://github.com/TheGrimsey/oxidized_navigation)
