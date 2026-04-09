# Common 2D Game Patterns

> **Category:** guide · **Engine:** Macroquad 0.4 · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md), [R2 Physics & Collision](../reference/R2_physics_collision.md), [G1 Getting Started](G1_getting_started.md)

Practical patterns for the most common 2D game types built with Macroquad — platformers, top-down games, and arcade-style projects. Each pattern shows a self-contained, runnable approach.

---

## Platformer Pattern

Platformers need gravity, jump mechanics, and tile-based collision. The `macroquad-platformer` crate provides a physics world inspired by Celeste/TowerFall, or you can roll your own.

### Using macroquad-platformer (Recommended)

```toml
[dependencies]
macroquad = "0.4"
macroquad-platformer = "0.2"
macroquad-tiled = "0.2"
```

```rust
use macroquad::prelude::*;
use macroquad_platformer::*;

struct Player {
    collider: Actor,
    speed: Vec2,
    facing_right: bool,
}

const GRAVITY: f32 = 500.0;
const MOVE_SPEED: f32 = 100.0;
const JUMP_FORCE: f32 = -120.0;

#[macroquad::main("Platformer")]
async fn main() {
    let mut world = World::new();

    // Add static ground tiles (8x8 pixel tiles, 40 columns wide)
    let mut static_colliders = vec![Tile::Empty; 40 * 19];
    // Floor row
    for x in 0..40 {
        static_colliders[18 * 40 + x] = Tile::Solid;
    }
    // Some platforms
    for x in 5..10 {
        static_colliders[14 * 40 + x] = Tile::Solid;
    }
    for x in 15..22 {
        static_colliders[11 * 40 + x] = Tile::Solid;
    }
    world.add_static_tiled_layer(static_colliders, 8.0, 8.0, 40, 1);

    let mut player = Player {
        collider: world.add_actor(vec2(50.0, 80.0), 8, 8),
        speed: vec2(0.0, 0.0),
        facing_right: true,
    };

    let camera = Camera2D::from_display_rect(Rect::new(0.0, 152.0, 320.0, -152.0));

    loop {
        clear_background(Color::from_hex(0x1a1a2e));
        set_camera(&camera);

        let dt = get_frame_time();
        let pos = world.actor_pos(player.collider);
        let on_ground = world.collide_check(player.collider, pos + vec2(0.0, 1.0));

        // Gravity
        if !on_ground {
            player.speed.y += GRAVITY * dt;
        }

        // Horizontal movement
        if is_key_down(KeyCode::Right) || is_key_down(KeyCode::D) {
            player.speed.x = MOVE_SPEED;
            player.facing_right = true;
        } else if is_key_down(KeyCode::Left) || is_key_down(KeyCode::A) {
            player.speed.x = -MOVE_SPEED;
            player.facing_right = false;
        } else {
            player.speed.x = 0.0;
        }

        // Jump
        if is_key_pressed(KeyCode::Space) && on_ground {
            player.speed.y = JUMP_FORCE;
        }

        // Move through the physics world (handles collision automatically)
        world.move_h(player.collider, player.speed.x * dt);
        world.move_v(player.collider, player.speed.y * dt);

        // Draw player
        let pos = world.actor_pos(player.collider);
        draw_rectangle(pos.x, pos.y, 8.0, 8.0, GREEN);

        // Draw ground/platforms (simple visualization)
        for y in 0..19 {
            for x in 0..40 {
                // We only drew floor and platforms, re-check here
                if (y == 18) || (y == 14 && (5..10).contains(&x)) || (y == 11 && (15..22).contains(&x)) {
                    draw_rectangle(x as f32 * 8.0, y as f32 * 8.0, 8.0, 8.0, DARKGRAY);
                }
            }
        }

        next_frame().await;
    }
}
```

**Key concepts:**
- `World` manages all collision — actors (move and collide), solids (push actors), and static tiles.
- `world.collide_check()` with an offset tests for ground contact.
- `world.move_h()` / `world.move_v()` move actors and automatically resolve collisions.
- Separate horizontal and vertical movement prevents corner-sticking bugs.

---

## Top-Down Movement Pattern

Top-down games (RPGs, twin-stick shooters) need 8-directional movement with optional diagonal normalization.

```rust
use macroquad::prelude::*;

struct Player {
    pos: Vec2,
    speed: f32,
    size: f32,
}

#[macroquad::main("Top-Down")]
async fn main() {
    let mut player = Player {
        pos: vec2(screen_width() / 2.0, screen_height() / 2.0),
        speed: 200.0,
        size: 20.0,
    };

    loop {
        clear_background(Color::from_hex(0x2d2d44));
        let dt = get_frame_time();

        // 8-directional input
        let mut direction = Vec2::ZERO;
        if is_key_down(KeyCode::W) || is_key_down(KeyCode::Up)    { direction.y -= 1.0; }
        if is_key_down(KeyCode::S) || is_key_down(KeyCode::Down)  { direction.y += 1.0; }
        if is_key_down(KeyCode::A) || is_key_down(KeyCode::Left)  { direction.x -= 1.0; }
        if is_key_down(KeyCode::D) || is_key_down(KeyCode::Right) { direction.x += 1.0; }

        // Normalize so diagonals aren't faster
        if direction.length() > 0.0 {
            direction = direction.normalize();
        }

        player.pos += direction * player.speed * dt;

        // Screen bounds clamping
        player.pos.x = player.pos.x.clamp(0.0, screen_width() - player.size);
        player.pos.y = player.pos.y.clamp(0.0, screen_height() - player.size);

        // Draw
        draw_rectangle(player.pos.x, player.pos.y, player.size, player.size, YELLOW);

        next_frame().await;
    }
}
```

---

## AABB Collision Detection (Manual)

When not using `macroquad-platformer`, Macroquad's `Rect` provides fast AABB collision:

```rust
use macroquad::prelude::*;

/// Create a centered bounding rect for an entity
fn bounding_rect(pos: Vec2, size: Vec2) -> Rect {
    Rect::new(pos.x - size.x / 2.0, pos.y - size.y / 2.0, size.x, size.y)
}

/// Check collision between two entities
fn check_collision(a_pos: Vec2, a_size: Vec2, b_pos: Vec2, b_size: Vec2) -> bool {
    bounding_rect(a_pos, a_size).overlaps(&bounding_rect(b_pos, b_size))
}

/// Resolve collision by pushing entity A out of entity B (simple approach)
fn resolve_aabb(a_pos: &mut Vec2, a_size: Vec2, b_pos: Vec2, b_size: Vec2) {
    let a_rect = bounding_rect(*a_pos, a_size);
    let b_rect = bounding_rect(b_pos, b_size);

    if !a_rect.overlaps(&b_rect) { return; }

    // Calculate overlap on each axis
    let overlap_x = if a_pos.x < b_pos.x {
        (a_rect.x + a_rect.w) - b_rect.x
    } else {
        -((b_rect.x + b_rect.w) - a_rect.x)
    };

    let overlap_y = if a_pos.y < b_pos.y {
        (a_rect.y + a_rect.h) - b_rect.y
    } else {
        -((b_rect.y + b_rect.h) - a_rect.y)
    };

    // Push out along the axis of least penetration
    if overlap_x.abs() < overlap_y.abs() {
        a_pos.x -= overlap_x;
    } else {
        a_pos.y -= overlap_y;
    }
}
```

**Useful `Rect` methods:**
- `overlaps(&other)` — true if rectangles intersect
- `contains(point)` — point-in-rect test
- `intersect(other)` — returns the overlapping `Rect` (useful for penetration depth)
- `combine_with(other)` — bounding rect of both
- `move_to(pos)` — repositions the rect

---

## Circle Collision

For projectiles, particles, and round enemies:

```rust
fn circles_collide(a_pos: Vec2, a_radius: f32, b_pos: Vec2, b_radius: f32) -> bool {
    a_pos.distance(b_pos) < a_radius + b_radius
}

fn circle_rect_collide(circle_pos: Vec2, radius: f32, rect: Rect) -> bool {
    // Find the closest point on the rect to the circle center
    let closest_x = circle_pos.x.clamp(rect.x, rect.x + rect.w);
    let closest_y = circle_pos.y.clamp(rect.y, rect.y + rect.h);
    let closest = vec2(closest_x, closest_y);
    circle_pos.distance(closest) < radius
}
```

---

## Entity Collection Pattern

For managing bullets, enemies, and collectibles with O(n) cleanup:

```rust
struct Bullet {
    pos: Vec2,
    vel: Vec2,
    alive: bool,
}

struct GameState {
    bullets: Vec<Bullet>,
    enemies: Vec<Enemy>,
}

impl GameState {
    fn update(&mut self, dt: f32) {
        // Update all bullets
        for bullet in &mut self.bullets {
            bullet.pos += bullet.vel * dt;
            // Mark off-screen bullets as dead
            if bullet.pos.x < 0.0 || bullet.pos.x > screen_width()
                || bullet.pos.y < 0.0 || bullet.pos.y > screen_height()
            {
                bullet.alive = false;
            }
        }

        // Check bullet-enemy collisions
        for bullet in &mut self.bullets {
            if !bullet.alive { continue; }
            for enemy in &mut self.enemies {
                if !enemy.alive { continue; }
                if circles_collide(bullet.pos, 4.0, enemy.pos, enemy.radius) {
                    bullet.alive = false;
                    enemy.alive = false;
                }
            }
        }

        // Remove dead entities (swap_remove is O(1) per removal)
        self.bullets.retain(|b| b.alive);
        self.enemies.retain(|e| e.alive);
    }
}
```

**Rust ownership tip:** You can't iterate `bullets` mutably while also iterating `enemies` mutably in the same loop if they're in the same struct. The pattern above works because we use separate `for` loops. If you need simultaneous mutation, use index-based iteration:

```rust
for i in 0..self.bullets.len() {
    for j in 0..self.enemies.len() {
        if self.bullets[i].alive && self.enemies[j].alive
            && circles_collide(self.bullets[i].pos, 4.0, self.enemies[j].pos, self.enemies[j].radius)
        {
            self.bullets[i].alive = false;
            self.enemies[j].alive = false;
        }
    }
}
```

---

## Simple Acceleration / Deceleration

Smoother movement with acceleration curves:

```rust
fn move_toward(current: f32, target: f32, rate: f32, dt: f32) -> f32 {
    if (target - current).abs() <= rate * dt {
        target
    } else if current < target {
        current + rate * dt
    } else {
        current - rate * dt
    }
}

// In your update loop:
let target_speed = if is_key_down(KeyCode::Right) { 200.0 }
    else if is_key_down(KeyCode::Left) { -200.0 }
    else { 0.0 };

player.speed.x = move_toward(player.speed.x, target_speed, 800.0, dt);
// 800.0 = acceleration rate. Higher = snappier, lower = more floaty.
```

---

## Cargo Dependencies

```toml
[dependencies]
macroquad = "0.4"

# Optional — for platformer physics
macroquad-platformer = "0.2"

# Optional — for tiled map loading
macroquad-tiled = "0.2"
```
