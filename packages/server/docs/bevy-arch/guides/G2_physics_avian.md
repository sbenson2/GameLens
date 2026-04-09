# G2 — Physics with Avian

> **Category:** guide · **Engine:** Bevy 0.18 · **Crate:** avian2d 0.6 / avian3d 0.6 · **Related:** [E1 ECS Fundamentals](../architecture/E1_ecs_fundamentals.md) · [G1 Getting Started](G1_getting_started.md) · [bevy-arch-rules](../bevy-arch-rules.md)

---

## What is Avian?

Avian is the leading ECS-native physics engine for Bevy. It is the successor to `bevy_xpbd` and provides 2D and 3D rigid-body physics that integrates naturally with Bevy's ECS — physics state lives in components, and the simulation runs as Bevy systems in `FixedPostUpdate`.

**Why Avian over Rapier?** Avian is built from the ground up for Bevy's ECS. Physics bodies are ordinary entities with `RigidBody` and `Collider` components. Rapier (`bevy_rapier`) wraps an external engine and requires synchronization between Rapier's internal world and Bevy's ECS. Both work, but Avian feels more "Bevy-native."

---

## Setup

Add the appropriate crate to `Cargo.toml`:

```toml
[dependencies]
bevy = "0.18"

# Pick ONE — 2D or 3D
avian2d = "0.6"
# avian3d = "0.6"
```

> **Version compatibility:** Avian releases track Bevy versions closely. Always check the [Avian GitHub README](https://github.com/avianphysics/avian) for the compatibility table when upgrading Bevy.

Register the physics plugin:

```rust
use avian2d::prelude::*;
use bevy::prelude::*;

fn main() {
    App::new()
        .add_plugins((
            DefaultPlugins,
            PhysicsPlugins::default(),
        ))
        .add_systems(Startup, setup)
        .run();
}
```

---

## Rigid Bodies

The `RigidBody` component defines how an entity participates in the physics simulation.

| Type | Behavior |
|------|----------|
| `RigidBody::Dynamic` | Fully simulated — affected by gravity, forces, collisions |
| `RigidBody::Static` | Never moves — used for floors, walls, platforms |
| `RigidBody::Kinematic` | Moved by user code, not by physics — pushes dynamic bodies but isn't affected by them |

```rust
fn setup(mut commands: Commands) {
    commands.spawn(Camera2d);

    // Static ground
    commands.spawn((
        RigidBody::Static,
        Collider::rectangle(500.0, 20.0),
        Transform::from_xyz(0.0, -200.0, 0.0),
    ));

    // Dynamic falling box
    commands.spawn((
        RigidBody::Dynamic,
        Collider::rectangle(40.0, 40.0),
        Transform::from_xyz(0.0, 100.0, 0.0),
    ));

    // Kinematic platform (you move it manually)
    commands.spawn((
        RigidBody::Kinematic,
        Collider::rectangle(120.0, 10.0),
        Transform::from_xyz(0.0, 0.0, 0.0),
    ));
}
```

---

## Colliders

Colliders define collision shapes. Avian provides many built-in shapes:

### 2D Collider Shapes

```rust
// Primitives
Collider::circle(radius)
Collider::rectangle(width, height)
Collider::capsule(width, height)
Collider::triangle(p1, p2, p3)

// From vertices (convex hull)
Collider::convex_hull(vec![Vec2::new(-10.0, -10.0), Vec2::new(10.0, -10.0), Vec2::new(0.0, 10.0)])

// Compound collider (multiple shapes on one body)
Collider::compound(vec![
    (Vec2::new(0.0, 0.0), 0.0, Collider::rectangle(20.0, 40.0)),
    (Vec2::new(0.0, 25.0), 0.0, Collider::circle(15.0)),
])
```

### 3D Collider Shapes

```rust
// avian3d equivalents
Collider::sphere(radius)
Collider::cuboid(half_x, half_y, half_z)
Collider::capsule(radius, height)
Collider::cylinder(radius, height)
Collider::cone(radius, height)
Collider::convex_hull(vertices)
Collider::trimesh_from_mesh(mesh)  // From a Bevy Mesh asset
```

---

## Gravity

Avian uses a `Gravity` resource. The default is `Vec2::new(0.0, -9.81)` (or `Vec3` in 3D).

### Important: Pixel-Scale Gravity

If your 2D game uses pixel coordinates (e.g., a sprite at y=300), the default gravity of 9.81 is tiny. Scale it up:

```rust
// In your App setup
app.insert_resource(Gravity(Vec2::new(0.0, -980.0))); // Pixels per second²

// Or disable gravity entirely
app.insert_resource(Gravity(Vec2::ZERO));
```

### Per-Entity Gravity Override

```rust
// This entity ignores global gravity
commands.spawn((
    RigidBody::Dynamic,
    Collider::circle(20.0),
    GravityScale(0.0), // 0 = no gravity, 2.0 = double gravity
));
```

---

## Velocity and Forces

### Direct Velocity

Set velocity directly for arcade-style movement:

```rust
fn move_player(
    keyboard: Res<ButtonInput<KeyCode>>,
    mut query: Query<&mut LinearVelocity, With<Player>>,
) {
    for mut vel in &mut query {
        let speed = 300.0;
        vel.x = 0.0;

        if keyboard.pressed(KeyCode::ArrowLeft) {
            vel.x = -speed;
        }
        if keyboard.pressed(KeyCode::ArrowRight) {
            vel.x = speed;
        }
    }
}

// Jump by setting Y velocity
fn jump(
    keyboard: Res<ButtonInput<KeyCode>>,
    mut query: Query<&mut LinearVelocity, With<Player>>,
) {
    if keyboard.just_pressed(KeyCode::Space) {
        for mut vel in &mut query {
            vel.y = 500.0;
        }
    }
}
```

### Angular Velocity

```rust
// Spin an entity
commands.spawn((
    RigidBody::Dynamic,
    Collider::rectangle(40.0, 40.0),
    AngularVelocity(2.0), // Radians per second (scalar in 2D, Vec3 in 3D)
));
```

### External Forces and Impulses

For physics-accurate movement (acceleration, not teleportation):

```rust
fn apply_thrust(
    mut query: Query<&mut ExternalForce, With<Rocket>>,
    time: Res<Time>,
) {
    for mut force in &mut query {
        // Continuous force (applied each physics step)
        force.set_force(Vec2::new(0.0, 500.0));
    }
}

fn explosion_impulse(
    mut query: Query<&mut ExternalImpulse, With<Debris>>,
) {
    for mut impulse in &mut query {
        // One-shot impulse (applied once, then cleared)
        impulse.apply_impulse(Vec2::new(200.0, 300.0));
    }
}
```

---

## Sensors

Sensors detect overlaps without causing physical collision responses — perfect for triggers, pickups, and area detection.

```rust
// A pickup item that detects overlap but doesn't block movement
commands.spawn((
    RigidBody::Static,
    Collider::circle(30.0),
    Sensor,
    CollisionEventsEnabled, // Required to receive collision events
    Pickup { item: "health_potion" },
    Transform::from_xyz(100.0, 50.0, 0.0),
));
```

### Detecting Sensor Overlaps

Use an observer to react to collision events on a specific entity:

```rust
fn setup(mut commands: Commands) {
    // Spawn a pickup with an observer for collision events
    commands.spawn((
        RigidBody::Static,
        Collider::circle(30.0),
        Sensor,
        CollisionEventsEnabled,
        Pickup { item: "health_potion" },
        Transform::from_xyz(100.0, 50.0, 0.0),
    )).observe(on_pickup_collision);
}

fn on_pickup_collision(
    trigger: Trigger<CollisionStart>,
    pickup_query: Query<&Pickup>,
    player_query: Query<Entity, With<Player>>,
    mut commands: Commands,
) {
    let pickup_entity = trigger.target();
    let other_body = trigger.body2;

    if player_query.contains(other_body) {
        if let Ok(pickup) = pickup_query.get(pickup_entity) {
            println!("Player picked up: {}", pickup.item);
            commands.entity(pickup_entity).despawn();
        }
    }
}
```

---

## Collision Events

Avian 0.5+ uses `CollisionStart` and `CollisionEnd` events. These are both triggered as observer events and written as messages. **Important:** entities must have the `CollisionEventsEnabled` component to emit events.

### Using Observers (Recommended)

```rust
// Attach an observer to a specific entity
commands.spawn((
    RigidBody::Dynamic,
    Collider::circle(20.0),
    CollisionEventsEnabled,
)).observe(|trigger: Trigger<CollisionStart>| {
    println!(
        "Collision started: {:?} hit {:?}",
        trigger.body1, trigger.body2
    );
});
```

### Using MessageReader (Global)

```rust
fn handle_collisions(
    mut started: MessageReader<CollisionStart>,
    mut ended: MessageReader<CollisionEnd>,
) {
    for event in started.read() {
        println!("Collision started: {:?} and {:?}", event.body1, event.body2);
    }

    for event in ended.read() {
        println!("Collision ended: {:?} and {:?}", event.body1, event.body2);
    }
}
```

---

## Mass and Physical Properties

Avian computes mass automatically from collider shape and a default density. Override when needed:

```rust
// Explicit mass
commands.spawn((
    RigidBody::Dynamic,
    Collider::rectangle(40.0, 40.0),
    Mass(10.0),
));

// Restitution (bounciness: 0.0 = no bounce, 1.0 = perfect bounce)
commands.spawn((
    RigidBody::Dynamic,
    Collider::circle(20.0),
    Restitution::new(0.8),
));

// Friction
commands.spawn((
    RigidBody::Dynamic,
    Collider::rectangle(40.0, 20.0),
    Friction::new(0.3),
));

// Lock rotation (useful for platformer characters that shouldn't topple)
commands.spawn((
    RigidBody::Dynamic,
    Collider::capsule(16.0, 32.0),
    LockedAxes::ROTATION_LOCKED, // Prevents rotation
    Player,
));
```

---

## Joints (Constraints)

Joints connect two rigid bodies with constraints:

```rust
// Fixed joint — welds two bodies together
let parent = commands.spawn((RigidBody::Dynamic, Collider::circle(20.0))).id();
let child = commands.spawn((RigidBody::Dynamic, Collider::circle(10.0))).id();

commands.spawn(
    FixedJoint::new(parent, child)
        .with_local_anchor_1(Vec2::new(30.0, 0.0))
);

// Distance joint — maintains distance between two bodies
commands.spawn(
    DistanceJoint::new(parent, child)
        .with_rest_length(50.0)
        .with_compliance(0.001) // Slight springiness
);

// Revolute joint — hinge (rotates around a point)
commands.spawn(
    RevoluteJoint::new(parent, child)
        .with_local_anchor_1(Vec2::new(20.0, 0.0))
);
```

---

## Transform Interpolation

Avian runs on a fixed timestep (`FixedPostUpdate`), which can cause jittery visuals if the render frame rate doesn't match. Avian includes built-in transform interpolation to smooth this:

```rust
// Interpolation is enabled by default with PhysicsPlugins::default().
// If you need to disable it:
app.add_plugins(
    PhysicsPlugins::default()
        .with_interpolation(false)
);
```

---

## Physics Layers (Collision Filtering)

Control which entities can collide with each other using collision layers:

```rust
use avian2d::prelude::*;

// Define collision layers
#[derive(PhysicsLayer, Default)]
enum GameLayer {
    #[default]
    Default,
    Player,
    Enemy,
    Bullet,
    Platform,
}

// Player collides with enemies and platforms, but not own bullets
commands.spawn((
    RigidBody::Dynamic,
    Collider::capsule(16.0, 32.0),
    CollisionLayers::new(
        GameLayer::Player,                              // This entity is on the Player layer
        [GameLayer::Enemy, GameLayer::Platform],        // It collides with these layers
    ),
    Player,
));

// Bullet collides only with enemies
commands.spawn((
    RigidBody::Dynamic,
    Collider::circle(4.0),
    CollisionLayers::new(
        GameLayer::Bullet,
        [GameLayer::Enemy],
    ),
));
```

---

## Debugging Physics

Enable the debug renderer to visualize colliders, AABBs, and contacts:

```rust
app.add_plugins((
    DefaultPlugins,
    PhysicsPlugins::default(),
    PhysicsDebugPlugin::default(), // Shows collider wireframes
));
```

### Physics Diagnostics

Avian provides built-in diagnostics for monitoring physics performance:

```rust
use avian2d::prelude::*;

// Add diagnostics plugin to see physics timing in logs
app.add_plugins(PhysicsDiagnosticsPlugin);
```

---

## Complete 2D Example: Falling Boxes

```rust
use avian2d::prelude::*;
use bevy::prelude::*;

fn main() {
    App::new()
        .add_plugins((
            DefaultPlugins,
            PhysicsPlugins::default(),
            // PhysicsDebugPlugin::default(), // Uncomment to see colliders
        ))
        .insert_resource(Gravity(Vec2::new(0.0, -600.0)))
        .add_systems(Startup, setup)
        .run();
}

fn setup(mut commands: Commands) {
    commands.spawn(Camera2d);

    // Ground
    commands.spawn((
        RigidBody::Static,
        Collider::rectangle(600.0, 20.0),
        Transform::from_xyz(0.0, -250.0, 0.0),
        Sprite {
            color: Color::srgb(0.4, 0.4, 0.4),
            custom_size: Some(Vec2::new(600.0, 20.0)),
            ..default()
        },
    ));

    // Spawn a stack of boxes
    for i in 0..5 {
        commands.spawn((
            RigidBody::Dynamic,
            Collider::rectangle(40.0, 40.0),
            Restitution::new(0.3),
            Transform::from_xyz(0.0, 50.0 + i as f32 * 50.0, 0.0),
            Sprite {
                color: Color::srgb(0.2 + i as f32 * 0.15, 0.3, 0.8),
                custom_size: Some(Vec2::new(40.0, 40.0)),
                ..default()
            },
        ));
    }
}
```

---

## Common Pitfalls

1. **Tiny gravity:** Default 9.81 is in meters. If your sprites are 100+ pixels, scale gravity to ~600–1000 or use a pixels-to-meters ratio.
2. **Missing `PhysicsPlugins`:** Nothing simulates without the plugin. You'll just have static entities with `RigidBody` components doing nothing.
3. **Collider size mismatch:** Collider dimensions don't automatically match sprite size. Set both explicitly and keep them in sync.
4. **LockedAxes for characters:** Platformer characters need `LockedAxes::ROTATION_LOCKED` or they'll topple over on slopes.
5. **Sensor + Static = no events:** A static sensor won't detect other static bodies. At least one body in the collision pair must be dynamic or kinematic.
6. **Version mismatch:** Avian releases are tightly coupled to Bevy versions. `avian2d 0.6` works with Bevy 0.18 — always verify before upgrading.
