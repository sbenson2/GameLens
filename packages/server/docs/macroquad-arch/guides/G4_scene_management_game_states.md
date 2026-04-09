# G4 — Scene Management & Game States

> **Category:** guide · **Engine:** Macroquad 0.4 · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Getting Started](G1_getting_started.md) · [R1 Drawing, Input & Audio](../reference/R1_drawing_input_audio.md) · [macroquad-arch-rules](../macroquad-arch-rules.md)

---

## Overview

Macroquad doesn't impose a scene management framework — it gives you a single `async fn main()` loop and leaves architecture to you. This guide covers two approaches: a simple enum-based state machine (recommended for most games) and Macroquad's experimental `scene` module for node-based object management.

---

## Approach 1: Enum State Machine (Recommended)

The most common and straightforward pattern. Define your game states as an enum and match on them in the main loop.

```toml
# Cargo.toml
[dependencies]
macroquad = "0.4"
```

```rust
use macroquad::prelude::*;

#[derive(Debug, Clone, PartialEq)]
enum GameState {
    Menu,
    Playing,
    Paused,
    GameOver,
}

struct GameData {
    score: u32,
    player_pos: Vec2,
    enemies: Vec<Vec2>,
}

impl GameData {
    fn new() -> Self {
        Self {
            score: 0,
            player_pos: vec2(screen_width() / 2.0, screen_height() / 2.0),
            enemies: Vec::new(),
        }
    }

    fn reset(&mut self) {
        self.score = 0;
        self.player_pos = vec2(screen_width() / 2.0, screen_height() / 2.0);
        self.enemies.clear();
    }
}

#[macroquad::main("State Machine Example")]
async fn main() {
    let mut state = GameState::Menu;
    let mut data = GameData::new();

    loop {
        clear_background(BLACK);

        match state {
            GameState::Menu => {
                draw_text("SPACE to Start", 200.0, 300.0, 40.0, WHITE);
                draw_text("Q to Quit", 200.0, 350.0, 30.0, GRAY);

                if is_key_pressed(KeyCode::Space) {
                    data.reset();
                    state = GameState::Playing;
                }
                if is_key_pressed(KeyCode::Q) {
                    return; // Exit the game
                }
            }

            GameState::Playing => {
                // Movement
                let speed = 200.0 * get_frame_time();
                if is_key_down(KeyCode::Left) { data.player_pos.x -= speed; }
                if is_key_down(KeyCode::Right) { data.player_pos.x += speed; }
                if is_key_down(KeyCode::Up) { data.player_pos.y -= speed; }
                if is_key_down(KeyCode::Down) { data.player_pos.y += speed; }

                // Pause
                if is_key_pressed(KeyCode::Escape) {
                    state = GameState::Paused;
                }

                // Draw
                draw_circle(data.player_pos.x, data.player_pos.y, 15.0, GREEN);
                draw_text(
                    &format!("Score: {}", data.score),
                    10.0, 30.0, 30.0, WHITE,
                );
            }

            GameState::Paused => {
                // Draw the game underneath (frozen)
                draw_circle(data.player_pos.x, data.player_pos.y, 15.0, GREEN);
                draw_text(
                    &format!("Score: {}", data.score),
                    10.0, 30.0, 30.0, WHITE,
                );

                // Overlay
                draw_rectangle(
                    0.0, 0.0,
                    screen_width(), screen_height(),
                    Color::new(0.0, 0.0, 0.0, 0.5),
                );
                draw_text("PAUSED", 250.0, 300.0, 60.0, WHITE);
                draw_text("SPACE to Resume · Q for Menu", 180.0, 350.0, 25.0, GRAY);

                if is_key_pressed(KeyCode::Space) {
                    state = GameState::Playing;
                }
                if is_key_pressed(KeyCode::Q) {
                    state = GameState::Menu;
                }
            }

            GameState::GameOver => {
                draw_text(
                    &format!("Game Over! Score: {}", data.score),
                    150.0, 280.0, 40.0, RED,
                );
                draw_text("SPACE for Menu", 220.0, 330.0, 30.0, GRAY);

                if is_key_pressed(KeyCode::Space) {
                    state = GameState::Menu;
                }
            }
        }

        next_frame().await;
    }
}
```

### Why This Works Well

Macroquad's `async fn main()` with `next_frame().await` is a single-threaded game loop. An enum state machine is simple, doesn't fight Rust's ownership model, and keeps all game data in one place. No lifetimes, no trait objects, no `Rc<RefCell<...>>` gymnastics.

> **Rust gotcha:** Avoid storing references to `GameData` in your states. Keep data and state separate — the enum controls flow, the struct holds data. This sidesteps borrow checker issues.

---

## Approach 2: Trait-Based Scenes

For larger games, you may want each scene (menu, gameplay, settings) to be a self-contained module. Use a trait:

```rust
use macroquad::prelude::*;

// Scenes return what state to transition to
enum Transition {
    None,
    Push(Box<dyn Scene>),
    Pop,
    Replace(Box<dyn Scene>),
}

trait Scene {
    fn update(&mut self) -> Transition;
    fn draw(&self);
}

// --- Menu Scene ---
struct MenuScene;

impl Scene for MenuScene {
    fn update(&mut self) -> Transition {
        if is_key_pressed(KeyCode::Space) {
            Transition::Push(Box::new(PlayScene::new()))
        } else {
            Transition::None
        }
    }

    fn draw(&self) {
        draw_text("Main Menu — SPACE to Play", 150.0, 300.0, 40.0, WHITE);
    }
}

// --- Play Scene ---
struct PlayScene {
    player_x: f32,
}

impl PlayScene {
    fn new() -> Self {
        Self { player_x: screen_width() / 2.0 }
    }
}

impl Scene for PlayScene {
    fn update(&mut self) -> Transition {
        let speed = 200.0 * get_frame_time();
        if is_key_down(KeyCode::Left) { self.player_x -= speed; }
        if is_key_down(KeyCode::Right) { self.player_x += speed; }

        if is_key_pressed(KeyCode::Escape) {
            Transition::Pop // Return to menu
        } else {
            Transition::None
        }
    }

    fn draw(&self) {
        draw_circle(self.player_x, 400.0, 20.0, GREEN);
    }
}

// --- Scene Stack ---
struct SceneStack {
    scenes: Vec<Box<dyn Scene>>,
}

impl SceneStack {
    fn new(initial: Box<dyn Scene>) -> Self {
        Self { scenes: vec![initial] }
    }

    fn update(&mut self) {
        let transition = if let Some(scene) = self.scenes.last_mut() {
            scene.update()
        } else {
            return;
        };

        match transition {
            Transition::None => {}
            Transition::Push(scene) => self.scenes.push(scene),
            Transition::Pop => { self.scenes.pop(); }
            Transition::Replace(scene) => {
                self.scenes.pop();
                self.scenes.push(scene);
            }
        }
    }

    fn draw(&self) {
        if let Some(scene) = self.scenes.last() {
            scene.draw();
        }
    }
}

#[macroquad::main("Scene Stack Example")]
async fn main() {
    let mut stack = SceneStack::new(Box::new(MenuScene));

    loop {
        clear_background(BLACK);
        stack.update();
        stack.draw();
        next_frame().await;
    }
}
```

> **Rust gotcha — `dyn Scene`:** Using trait objects (`Box<dyn Scene>`) means you lose compile-time type info. This is fine for scene management, but avoid putting performance-critical per-frame logic behind `dyn` dispatch. The overhead is negligible for scene transitions but matters for thousands of game objects.

---

## Approach 3: Experimental Scene Module

Macroquad includes `macroquad::experimental::scene`, a built-in node system. It's marked experimental and the API may change, but it's useful for managing game objects (not screen-level scenes).

```rust
use macroquad::prelude::*;
use macroquad::experimental::scene::{self, Node, RefMut, Handle};

struct Bullet {
    pos: Vec2,
    velocity: Vec2,
}

impl Node for Bullet {
    fn update(mut node: RefMut<Self>) {
        node.pos += node.velocity * get_frame_time();

        // Self-destruct when off screen
        if node.pos.y < -10.0 || node.pos.y > screen_height() + 10.0 {
            node.delete();
        }
    }

    fn draw(node: RefMut<Self>) {
        draw_circle(node.pos.x, node.pos.y, 4.0, YELLOW);
    }
}

struct Player {
    pos: Vec2,
}

impl Node for Player {
    fn update(mut node: RefMut<Self>) {
        let speed = 300.0 * get_frame_time();
        if is_key_down(KeyCode::Left) { node.pos.x -= speed; }
        if is_key_down(KeyCode::Right) { node.pos.x += speed; }

        // Spawn bullet on Space
        if is_key_pressed(KeyCode::Space) {
            scene::add_node(Bullet {
                pos: node.pos,
                velocity: vec2(0.0, -400.0),
            });
        }
    }

    fn draw(node: RefMut<Self>) {
        draw_rectangle(node.pos.x - 15.0, node.pos.y - 10.0, 30.0, 20.0, GREEN);
    }
}

#[macroquad::main("Scene Nodes Example")]
async fn main() {
    scene::add_node(Player {
        pos: vec2(screen_width() / 2.0, screen_height() - 50.0),
    });

    loop {
        clear_background(BLACK);

        // Updates and draws all nodes automatically
        // Order: all update() calls, then all draw() calls
        next_frame().await;
    }
}
```

### When to Use experimental::scene

| Use Case | Recommended Approach |
|----------|---------------------|
| Menu / Pause / Game Over flow | Enum state machine (Approach 1) |
| Large game with modular screens | Trait-based scenes (Approach 2) |
| Many in-game objects (bullets, enemies) | Experimental scene nodes (Approach 3) |
| Simple game jam prototype | Enum state machine (Approach 1) |

You can combine approaches — use an enum for high-level states and scene nodes for in-game object management within the `Playing` state.

---

## Sharing Data Between Scenes

### With Enum State Machine

Data lives alongside the state — no sharing problem:

```rust
// Both state and data live in main(), passed to match arms by reference
let mut state = GameState::Menu;
let mut data = GameData::new();
```

### With Trait-Based Scenes

Pass shared data through the update method or use `Rc<RefCell<T>>`:

```rust
use std::rc::Rc;
use std::cell::RefCell;

struct SharedState {
    high_score: u32,
    settings: Settings,
}

// Pass to scenes on creation
let shared = Rc::new(RefCell::new(SharedState { ... }));
let menu = MenuScene::new(Rc::clone(&shared));
```

> **Rust gotcha:** `Rc<RefCell<T>>` panics at runtime if you borrow mutably twice. Since Macroquad is single-threaded, this rarely happens in practice, but avoid holding a `borrow_mut()` across a function call that might also borrow.

### With Experimental Scene Nodes

Use `scene::find_node_by_type::<T>()` to access other nodes, or store shared state in a dedicated "global" node.

---

## Performance Notes

All three approaches are effectively free in terms of overhead. Macroquad runs a simple single-threaded loop — there's no ECS query overhead or scheduler cost. Choose based on code organization needs, not performance.

For games with thousands of entities (bullet hell, particle systems), the experimental scene module adds minor overhead per node. For extreme cases, manage entities in a plain `Vec` inside your game state and iterate manually.
