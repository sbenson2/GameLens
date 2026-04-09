# R2 — Physics & Collision Detection

> **Category:** reference · **Engine:** Macroquad 0.4 · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Getting Started](../guides/G1_getting_started.md) · [R1 Drawing, Input & Audio](R1_drawing_input_audio.md) · [macroquad-arch-rules](../macroquad-arch-rules.md)

---

## Overview

Macroquad does **not** include a physics engine. For most 2D games, you implement collision detection manually using simple math — AABB overlap, circle intersection, or ray casting. For advanced physics (rigid bodies, joints, continuous collision), integrate the **Rapier** crate.

This reference covers both approaches: hand-rolled collision for simple games and Rapier integration for physics-heavy projects.

---

## Built-in: Rect Collision

Macroquad's `Rect` struct provides basic AABB (axis-aligned bounding box) overlap testing:

```rust
use macroquad::prelude::*;

let player = Rect::new(100.0, 200.0, 32.0, 32.0); // x, y, w, h
let enemy = Rect::new(120.0, 210.0, 32.0, 32.0);

if player.overlaps(&enemy) {
    // Collision detected!
}
```

### Rect Methods

| Method | Returns | Purpose |
|--------|---------|---------|
| `overlaps(&other)` | `bool` | True if two AABBs overlap |
| `contains(&point)` | `bool` | True if a `Vec2` is inside the rect |
| `intersect(other)` | `Option<Rect>` | The overlapping region, if any |
| `combine_with(other)` | `Rect` | Bounding rect enclosing both |
| `move_to(pos)` | `Rect` | New rect at given position |
| `offset(d)` | `Rect` | New rect shifted by `Vec2` |
| `center()` | `Vec2` | Center point of the rect |

```rust
// Check if mouse click is inside a button
let button = Rect::new(300.0, 400.0, 120.0, 40.0);
if is_mouse_button_pressed(MouseButton::Left) {
    let (mx, my) = mouse_position();
    if button.contains(Vec2::new(mx, my)) {
        // Button clicked
    }
}
```

---

## Hand-Rolled: Circle Collision

Macroquad doesn't provide circle collision helpers, but the math is trivial:

```rust
fn circles_collide(
    pos_a: Vec2, radius_a: f32,
    pos_b: Vec2, radius_b: f32,
) -> bool {
    // Squared distance avoids the sqrt cost
    let dist_sq = pos_a.distance_squared(pos_b);
    let radii_sum = radius_a + radius_b;
    dist_sq <= radii_sum * radii_sum
}

// Usage in game loop
let player_pos = Vec2::new(400.0, 300.0);
let player_radius = 16.0;
let bullet_pos = Vec2::new(410.0, 305.0);
let bullet_radius = 4.0;

if circles_collide(player_pos, player_radius, bullet_pos, bullet_radius) {
    // Hit!
}
```

### Circle-vs-Rect Collision

Useful for ball-and-paddle games (breakout, pong):

```rust
fn circle_rect_collide(
    circle_pos: Vec2, radius: f32,
    rect: &Rect,
) -> bool {
    // Find the closest point on the rect to the circle center
    let closest_x = circle_pos.x.clamp(rect.x, rect.x + rect.w);
    let closest_y = circle_pos.y.clamp(rect.y, rect.y + rect.h);
    let closest = Vec2::new(closest_x, closest_y);

    circle_pos.distance_squared(closest) <= radius * radius
}
```

---

## Collision Response Patterns

### Bounce (Reflect Velocity)

```rust
struct Ball {
    pos: Vec2,
    vel: Vec2,
    radius: f32,
}

fn update_ball(ball: &mut Ball, dt: f32, screen_w: f32, screen_h: f32) {
    ball.pos += ball.vel * dt;

    // Bounce off screen edges
    if ball.pos.x - ball.radius < 0.0 || ball.pos.x + ball.radius > screen_w {
        ball.vel.x = -ball.vel.x;
    }
    if ball.pos.y - ball.radius < 0.0 || ball.pos.y + ball.radius > screen_h {
        ball.vel.y = -ball.vel.y;
    }
}
```

### Push-Out (Separation)

When two entities overlap, push them apart along the shortest axis:

```rust
fn separate_aabb(mover: &mut Rect, obstacle: &Rect) {
    if let Some(overlap) = mover.intersect(*obstacle) {
        // Push out along the shorter overlap axis
        if overlap.w < overlap.h {
            // Horizontal push
            if mover.center().x < obstacle.center().x {
                mover.x -= overlap.w;
            } else {
                mover.x += overlap.w;
            }
        } else {
            // Vertical push
            if mover.center().y < obstacle.center().y {
                mover.y -= overlap.h;
            } else {
                mover.y += overlap.h;
            }
        }
    }
}
```

### Tilemap Collision

For tile-based games, check only nearby tiles instead of all entities:

```rust
const TILE_SIZE: f32 = 32.0;

fn get_tile(x: f32, y: f32, map: &[Vec<u8>]) -> u8 {
    let col = (x / TILE_SIZE) as usize;
    let row = (y / TILE_SIZE) as usize;
    if row < map.len() && col < map[0].len() {
        map[row][col]
    } else {
        1 // Treat out-of-bounds as solid
    }
}

fn is_solid(tile: u8) -> bool {
    tile != 0
}

// Check corners of the player's bounding box against the tilemap
fn check_tilemap_collision(
    player: &Rect,
    map: &[Vec<u8>],
) -> bool {
    let corners = [
        Vec2::new(player.x, player.y),                       // top-left
        Vec2::new(player.x + player.w, player.y),            // top-right
        Vec2::new(player.x, player.y + player.h),            // bottom-left
        Vec2::new(player.x + player.w, player.y + player.h), // bottom-right
    ];
    corners.iter().any(|c| is_solid(get_tile(c.x, c.y, map)))
}
```

---

## Rapier Integration

For rigid body physics, joints, raycasting, and continuous collision detection, use the `rapier2d` crate alongside Macroquad.

### Cargo Dependencies

```toml
[dependencies]
macroquad = "0.4"
rapier2d = "0.22"   # Check crates.io for latest
```

### Basic Setup

```rust
use macroquad::prelude::*;
use rapier2d::prelude::*;

#[macroquad::main("Rapier + Macroquad")]
async fn main() {
    // Rapier world setup
    let mut rigid_body_set = RigidBodySet::new();
    let mut collider_set = ColliderSet::new();
    let gravity = vector![0.0, 9.81];
    let integration_parameters = IntegrationParameters::default();
    let mut physics_pipeline = PhysicsPipeline::new();
    let mut island_manager = IslandManager::new();
    let mut broad_phase = DefaultBroadPhase::new();
    let mut narrow_phase = NarrowPhase::new();
    let mut impulse_joint_set = ImpulseJointSet::new();
    let mut multibody_joint_set = MultibodyJointSet::new();
    let mut ccd_solver = CCDSolver::new();

    // Add a static floor
    let floor_collider = ColliderBuilder::cuboid(5.0, 0.1)
        .translation(vector![4.0, 5.0])
        .build();
    collider_set.insert(floor_collider);

    // Add a dynamic ball
    let ball_body = RigidBodyBuilder::dynamic()
        .translation(vector![4.0, 0.5])
        .build();
    let ball_handle = rigid_body_set.insert(ball_body);
    let ball_collider = ColliderBuilder::ball(0.2)
        .restitution(0.7)  // Bounciness
        .build();
    collider_set.insert_with_parent(ball_collider, ball_handle, &mut rigid_body_set);

    loop {
        clear_background(BLACK);

        // Step physics
        physics_pipeline.step(
            &gravity,
            &integration_parameters,
            &mut island_manager,
            &mut broad_phase,
            &mut narrow_phase,
            &mut rigid_body_set,
            &mut collider_set,
            &mut impulse_joint_set,
            &mut multibody_joint_set,
            &mut ccd_solver,
            None,
            &(),
            &(),
        );

        // Draw the ball at its physics position
        let ball_pos = rigid_body_set[ball_handle].translation();
        let scale = 80.0; // pixels per physics-meter
        draw_circle(
            ball_pos.x * scale,
            ball_pos.y * scale,
            0.2 * scale,
            YELLOW,
        );

        // Draw the floor
        draw_rectangle(
            (4.0 - 5.0) * scale,
            (5.0 - 0.1) * scale,
            10.0 * scale,
            0.2 * scale,
            GRAY,
        );

        next_frame().await;
    }
}
```

### Coordinate System Gotcha

Rapier uses physics-scale coordinates (meters). Macroquad uses screen pixels. You need a conversion factor:

```rust
const PIXELS_PER_METER: f32 = 80.0;

fn physics_to_screen(pos: &Vector<Real>) -> (f32, f32) {
    (pos.x * PIXELS_PER_METER, pos.y * PIXELS_PER_METER)
}

fn screen_to_physics(x: f32, y: f32) -> Vector<Real> {
    vector![x / PIXELS_PER_METER, y / PIXELS_PER_METER]
}
```

### Collision Events

Query Rapier's narrow phase for contact information:

```rust
// After physics_pipeline.step(...)
for contact_pair in narrow_phase.contact_pairs() {
    if contact_pair.has_any_active_contact {
        let collider_a = contact_pair.collider1;
        let collider_b = contact_pair.collider2;
        // Handle collision between collider_a and collider_b
    }
}
```

---

## Performance Guidelines

| Technique | Entity Count | Recommendation |
|-----------|-------------|----------------|
| AABB `Rect::overlaps` | < 100 entities | Check all pairs — simple and fast enough |
| Spatial hashing | 100–1000 entities | Divide world into grid cells, only check within same/adjacent cells |
| Rapier broad phase | 1000+ entities | Full physics engine handles broad+narrow phase efficiently |

### Spatial Hash Example

```rust
use std::collections::HashMap;

const CELL_SIZE: f32 = 64.0;

fn cell_key(x: f32, y: f32) -> (i32, i32) {
    ((x / CELL_SIZE).floor() as i32, (y / CELL_SIZE).floor() as i32)
}

fn build_spatial_hash(entities: &[(usize, Rect)]) -> HashMap<(i32, i32), Vec<usize>> {
    let mut grid: HashMap<(i32, i32), Vec<usize>> = HashMap::new();
    for (id, rect) in entities {
        // Insert into all cells the rect touches
        let min_key = cell_key(rect.x, rect.y);
        let max_key = cell_key(rect.x + rect.w, rect.y + rect.h);
        for cx in min_key.0..=max_key.0 {
            for cy in min_key.1..=max_key.1 {
                grid.entry((cx, cy)).or_default().push(*id);
            }
        }
    }
    grid
}
```

---

## Quick Reference

| Need | Approach | Crate |
|------|----------|-------|
| Box-vs-box overlap | `Rect::overlaps` | macroquad (built-in) |
| Circle-vs-circle | Distance check (see above) | None (hand-roll) |
| Circle-vs-rect | Closest-point check (see above) | None (hand-roll) |
| Tilemap collision | Corner sampling (see above) | None (hand-roll) |
| Rigid bodies, joints | Rapier integration | `rapier2d` |
| Raycasting | Rapier `QueryPipeline` | `rapier2d` |
| Many entities (1000+) | Spatial hash or Rapier broad phase | Hand-roll or `rapier2d` |
