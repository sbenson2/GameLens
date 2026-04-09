# E3 — Structuring Larger Games Without ECS

> **Category:** explanation · **Engine:** Macroquad 0.4 · **Related:** [E1 Architecture Overview](E1_architecture_overview.md) · [G4 Scene Management & Game States](../guides/G4_scene_management_game_states.md) · [R3 Ecosystem & Common Crates](../reference/R3_ecosystem_common_crates.md) · [macroquad-arch-rules](../macroquad-arch-rules.md)

---

## Overview

Macroquad gives you a game loop and drawing functions — no ECS, no scene graph, no entity manager. This freedom is a strength for small projects and game jams, but games beyond a few hundred lines need intentional architecture to avoid tangled state and unmanageable `match` arms.

This doc covers patterns for organizing Macroquad games as they grow: separating concerns with modules, composing game objects with traits, managing shared state, and knowing when to reach for external crates. These patterns are informed by how the Rust ownership model shapes game architecture differently than in garbage-collected languages.

---

## The Growth Problem

A typical Macroquad game starts like this:

```rust
use macroquad::prelude::*;

#[macroquad::main("My Game")]
async fn main() {
    let mut player_x = 400.0;
    let mut enemies: Vec<(f32, f32)> = vec![];
    let mut score = 0;

    loop {
        // input → update → draw, all in one function
        if is_key_down(KeyCode::Right) { player_x += 5.0; }
        // ... 300 more lines
        next_frame().await;
    }
}
```

This works until you have 10 entity types, particle systems, UI screens, save/load, and audio triggers. Then you need structure.

---

## Pattern 1: Module-Per-Domain

The simplest organizational step. Split your code into modules by domain, keeping each module's public API narrow.

```
src/
├── main.rs          # Game loop, state transitions
├── player.rs        # Player struct, movement, drawing
├── enemy.rs         # Enemy types, spawning, AI
├── projectile.rs    # Bullets, collision shapes
├── ui.rs            # HUD, menus, overlays
├── world.rs         # Level data, tiles, camera
├── audio.rs         # Sound effect triggers, music state
└── resources.rs     # Texture/font/sound loading and handles
```

Each module owns its data and exposes `update()` and `draw()` functions:

```rust
// player.rs
use macroquad::prelude::*;

pub struct Player {
    pub pos: Vec2,
    pub health: i32,
    speed: f32,
    texture: Texture2D,
}

impl Player {
    pub fn new(texture: Texture2D) -> Self {
        Self {
            pos: vec2(screen_width() / 2.0, screen_height() - 80.0),
            health: 3,
            speed: 300.0,
            texture,
        }
    }

    pub fn update(&mut self, dt: f32) {
        if is_key_down(KeyCode::Left)  { self.pos.x -= self.speed * dt; }
        if is_key_down(KeyCode::Right) { self.pos.x += self.speed * dt; }
        self.pos.x = self.pos.x.clamp(0.0, screen_width());
    }

    pub fn draw(&self) {
        draw_texture_ex(
            &self.texture,
            self.pos.x - 16.0,
            self.pos.y - 16.0,
            WHITE,
            DrawTextureParams { dest_size: Some(vec2(32.0, 32.0)), ..Default::default() },
        );
    }

    pub fn hitbox(&self) -> Rect {
        Rect::new(self.pos.x - 12.0, self.pos.y - 12.0, 24.0, 24.0)
    }
}
```

The main loop becomes a coordinator:

```rust
// main.rs
mod player;
mod enemy;
mod projectile;
mod resources;

use macroquad::prelude::*;
use player::Player;
use enemy::EnemyManager;
use projectile::ProjectilePool;

#[macroquad::main("My Game")]
async fn main() {
    let res = resources::load_all().await;
    let mut player = Player::new(res.player_tex.clone());
    let mut enemies = EnemyManager::new(res.enemy_tex.clone());
    let mut projectiles = ProjectilePool::new();

    loop {
        let dt = get_frame_time();

        player.update(dt);
        enemies.update(dt);
        projectiles.update(dt);

        // Cross-system interactions happen here
        projectiles.check_hits(&mut enemies, &mut player);

        clear_background(BLACK);
        player.draw();
        enemies.draw();
        projectiles.draw();

        next_frame().await;
    }
}
```

**Rust ownership insight:** Notice that `check_hits` takes `&mut enemies` and `&mut player` as separate borrows. This works because they're distinct variables. If they were fields on the same struct, you'd hit the borrow checker. This is why the "flat variables in main" pattern is common in Macroquad — it gives each system a distinct owner.

---

## Pattern 2: The World Struct with Split Borrows

As the game grows further, passing 8+ variables into every function gets unwieldy. A `World` struct groups related state, but you need to be deliberate about how you access its fields to satisfy the borrow checker.

```rust
pub struct World {
    pub player: Player,
    pub enemies: EnemyManager,
    pub projectiles: ProjectilePool,
    pub particles: ParticleSystem,
    pub camera: GameCamera,
    pub score: u32,
    pub wave: u32,
}

impl World {
    /// Update all systems. Note: cross-system interactions
    /// use split borrows — we destructure `self` to get
    /// mutable access to multiple fields simultaneously.
    pub fn update(&mut self, dt: f32) {
        self.player.update(dt);
        self.enemies.update(dt);
        self.projectiles.update(dt);
        self.particles.update(dt);
        self.camera.follow(self.player.pos, dt);

        // Split borrow: destructure to access multiple fields mutably
        let World { projectiles, enemies, player, particles, score, .. } = self;
        for proj in projectiles.active_mut() {
            for enemy in enemies.active_mut() {
                if proj.hitbox().overlaps(&enemy.hitbox()) {
                    proj.deactivate();
                    enemy.take_damage(1);
                    particles.spawn_explosion(enemy.pos);
                    *score += 10;
                }
            }
        }
    }

    pub fn draw(&self) {
        self.camera.apply();
        self.enemies.draw();
        self.projectiles.draw();
        self.player.draw();
        self.particles.draw();
    }
}
```

**Key Rust pattern:** The `let World { projectiles, enemies, .. } = self;` destructuring is the idiomatic way to get mutable access to multiple struct fields simultaneously. Without it, `self.projectiles` and `self.enemies` in the same scope would fail because Rust sees both as borrowing `self`.

---

## Pattern 3: Trait-Based Game Objects

When you have many entity types with shared behavior (draw, update, collide), traits provide polymorphism without an ECS:

```rust
pub trait GameObject {
    fn update(&mut self, dt: f32);
    fn draw(&self);
    fn pos(&self) -> Vec2;
    fn hitbox(&self) -> Rect;
    fn is_alive(&self) -> bool;
}

pub trait Damageable: GameObject {
    fn take_damage(&mut self, amount: i32);
    fn health(&self) -> i32;
}
```

### Static Dispatch (Enums) — Preferred for Game Entities

For a known set of entity types, enums with match arms are faster than trait objects and work better with Rust's pattern matching:

```rust
pub enum Enemy {
    Drone(DroneEnemy),
    Tank(TankEnemy),
    Boss(BossEnemy),
}

impl Enemy {
    pub fn update(&mut self, dt: f32) {
        match self {
            Enemy::Drone(e) => e.update(dt),
            Enemy::Tank(e)  => e.update(dt),
            Enemy::Boss(e)  => e.update(dt),
        }
    }

    pub fn draw(&self) {
        match self {
            Enemy::Drone(e) => e.draw(),
            Enemy::Tank(e)  => e.draw(),
            Enemy::Boss(e)  => e.draw(),
        }
    }

    pub fn is_alive(&self) -> bool {
        match self {
            Enemy::Drone(e) => e.health > 0,
            Enemy::Tank(e)  => e.health > 0,
            Enemy::Boss(e)  => e.health > 0,
        }
    }
}
```

This approach has zero dynamic dispatch overhead and keeps all enemy types in a single `Vec<Enemy>` without heap allocation for each entry.

### Dynamic Dispatch (Trait Objects) — For Extensible Systems

When the set of types isn't known at compile time (e.g., modding support, or systems like particles where you want pluggable behaviors):

```rust
pub struct EntityManager {
    entities: Vec<Box<dyn GameObject>>,
}

impl EntityManager {
    pub fn update_all(&mut self, dt: f32) {
        for entity in &mut self.entities {
            entity.update(dt);
        }
        self.entities.retain(|e| e.is_alive());
    }

    pub fn draw_all(&self) {
        for entity in &self.entities {
            entity.draw();
        }
    }
}
```

**Trade-off:** Trait objects (`Box<dyn GameObject>`) allocate on the heap and prevent the compiler from inlining. For most Macroquad games (hundreds of entities, not thousands), this cost is negligible. If you're managing 10,000+ entities, prefer the enum approach or reach for an ECS crate.

---

## Pattern 4: Resource Manager

Macroquad's `load_texture`, `load_sound`, etc. are async and return `Clone`-able handles (reference-counted since Macroquad 0.4). Load everything upfront and share handles freely:

```rust
pub struct Resources {
    pub player_tex: Texture2D,
    pub enemy_tex: Texture2D,
    pub bullet_tex: Texture2D,
    pub explosion_frames: Vec<Texture2D>,
    pub shoot_sound: Sound,
    pub hit_sound: Sound,
    pub music: Sound,
    pub font: Font,
}

impl Resources {
    pub async fn load() -> Self {
        // Show a loading screen while assets load
        let player_tex = load_texture("assets/player.png").await.unwrap();
        player_tex.set_filter(FilterMode::Nearest); // pixel art

        let enemy_tex = load_texture("assets/enemy.png").await.unwrap();
        enemy_tex.set_filter(FilterMode::Nearest);

        // Load sprite sheet frames
        let explosion_frames = Self::load_spritesheet("assets/explosion.png", 5, 1).await;

        Self {
            player_tex,
            enemy_tex,
            bullet_tex: load_texture("assets/bullet.png").await.unwrap(),
            explosion_frames,
            shoot_sound: load_sound("assets/shoot.wav").await.unwrap(),
            hit_sound: load_sound("assets/hit.wav").await.unwrap(),
            music: load_sound("assets/music.ogg").await.unwrap(),
            font: load_ttf_font("assets/pixel.ttf").await.unwrap(),
        }
    }

    async fn load_spritesheet(path: &str, cols: u32, rows: u32) -> Vec<Texture2D> {
        let sheet = load_texture(path).await.unwrap();
        let fw = sheet.width() / cols as f32;
        let fh = sheet.height() / rows as f32;
        let mut frames = Vec::new();
        for row in 0..rows {
            for col in 0..cols {
                // Use Image::sub_image to extract frames
                let img = sheet.get_texture_data();
                // ... frame extraction logic
                frames.push(Texture2D::from_image(&img));
            }
        }
        frames
    }
}
```

**Ownership note:** Since Macroquad 0.4, texture and sound handles are `Clone` (internally reference-counted). You can clone handles into different structs without duplicating GPU memory. This is unlike Bevy where assets are accessed through `Handle<T>` and the asset server.

---

## When to Add an ECS Crate

If you find yourself writing code like this, it's time to consider an ECS:

- You're iterating over 5+ collections in every collision check
- Adding a new component (e.g., "poisoned" status) means modifying 10 struct definitions
- You want systems that process any entity with a specific combination of components
- Entity counts exceed 1,000 and you need cache-friendly iteration

Popular ECS crates that integrate with Macroquad:

```toml
[dependencies]
macroquad = "0.4"
hecs = "0.10"       # Lightweight, no-proc-macro ECS
# or
legion = "0.4"      # Feature-rich, system scheduler included
# or
shipyard = "0.7"    # Unique/shared component distinction
```

Example with `hecs`:

```rust
use hecs::World;
use macroquad::prelude::*;

struct Position(Vec2);
struct Velocity(Vec2);
struct Sprite(Texture2D);
struct Health(i32);

#[macroquad::main("ECS Example")]
async fn main() {
    let mut world = World::new();
    let tex = load_texture("player.png").await.unwrap();

    // Spawn entities with component tuples
    world.spawn((Position(vec2(100.0, 100.0)), Velocity(vec2(50.0, 0.0)), Sprite(tex.clone()), Health(3)));

    loop {
        let dt = get_frame_time();

        // Movement system — processes anything with Position + Velocity
        for (_, (pos, vel)) in world.query_mut::<(&mut Position, &Velocity)>() {
            pos.0 += vel.0 * dt;
        }

        // Draw system — processes anything with Position + Sprite
        clear_background(BLACK);
        for (_, (pos, sprite)) in world.query::<(&Position, &Sprite)>().iter() {
            draw_texture(&sprite.0, pos.0.x, pos.0.y, WHITE);
        }

        next_frame().await;
    }
}
```

**When NOT to add an ECS:** If your game has fewer than ~50 active entities and 3-4 types, the overhead of learning and integrating an ECS isn't worth it. The enum + struct patterns above will serve you well through most jam-sized and small indie games.

---

## Project Template for a Medium-Sized Game

```
my-game/
├── Cargo.toml
├── assets/
│   ├── textures/
│   ├── sounds/
│   └── fonts/
├── src/
│   ├── main.rs           # Entry point, game loop, state machine
│   ├── resources.rs       # Asset loading, resource handles
│   ├── world.rs           # World struct, cross-system coordination
│   ├── player.rs          # Player logic
│   ├── enemies/
│   │   ├── mod.rs         # Enemy enum, shared behavior
│   │   ├── drone.rs       # Drone-specific logic
│   │   └── boss.rs        # Boss-specific logic
│   ├── combat/
│   │   ├── mod.rs         # Collision detection, damage
│   │   └── projectile.rs  # Bullet pool, bullet types
│   ├── effects/
│   │   ├── particles.rs   # Particle system
│   │   └── screenshake.rs # Camera effects
│   └── ui/
│       ├── hud.rs         # In-game HUD
│       └── menu.rs        # Menu screens
```

This structure scales comfortably to 5,000–10,000 lines of game code. Beyond that, consider whether an ECS crate or a more structured engine (Bevy, Fyrox) would better serve the project.

---

## Summary of Patterns

| Pattern | Best for | Rust complexity |
|---------|----------|-----------------|
| Flat variables in main | Jam games, prototypes | Low |
| Module-per-domain | Small-to-medium games (1K–5K LOC) | Low |
| World struct + split borrows | Medium games with cross-system interactions | Medium |
| Enum-based polymorphism | Known set of entity types, performance-sensitive | Low–Medium |
| Trait objects | Extensible/pluggable systems | Medium |
| External ECS crate | 1,000+ entities, many component combinations | Medium–High |
