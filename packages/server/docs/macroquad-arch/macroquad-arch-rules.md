# Macroquad — AI Rules

Engine-specific rules for projects using the Macroquad game library. These supplement the engine-agnostic rules in `docs/core/ai-workflow/gamedev-rules.md`.

---

## Architecture Context

### Tech Stack

- **Library:** Macroquad 0.4 (simple 2D game library for Rust, raylib-inspired)
- **Language:** Rust
- **Build System:** Cargo
- **Graphics Backend:** miniquad (OpenGL / WebGL / Metal)
- **Key Crates:** Commonly used alongside Macroquad:
  - `egui-macroquad` (immediate-mode UI via egui)
  - `macroquad-particles` (particle effects)
  - `rapier2d` (physics, if needed)
  - `nanoserde` / `serde` (serialization)

### Project Structure Conventions

```
{ProjectName}/
├── assets/              # Textures, audio, fonts
├── src/
│   ├── main.rs          # Game loop, state management
│   ├── player.rs        # Player struct + logic
│   ├── enemies.rs       # Enemy types + AI
│   ├── ui.rs            # Menus, HUD
│   └── utils.rs         # Helpers (collision, math)
├── Cargo.toml
└── index.html           # For WASM builds
```

---

## Code Generation Rules

### Game Loop: Always Async

```rust
// ✅ Correct: macroquad::main attribute, async fn, next_frame().await
#[macroquad::main("Game Title")]
async fn main() {
    loop {
        clear_background(BLACK);
        // game logic + drawing
        next_frame().await
    }
}

// ❌ Wrong: synchronous main
// ❌ Wrong: missing next_frame().await
// ❌ Wrong: calling std::thread::sleep (freezes window)
```

### State Management: Structs, Not ECS

Macroquad is not ECS-based. Use plain Rust structs and Vecs:

```rust
// ✅ Correct: game state as structs
struct Player {
    pos: Vec2,
    speed: f32,
    health: i32,
    texture: Texture2D,
}

struct GameState {
    player: Player,
    enemies: Vec<Enemy>,
    bullets: Vec<Bullet>,
    score: u32,
    state: GamePhase,
}

enum GamePhase { Menu, Playing, Paused, GameOver }

// ✅ Update and draw are separate methods or functions
impl GameState {
    fn update(&mut self) { /* input + logic */ }
    fn draw(&self) { /* rendering */ }
}
```

### Asset Loading: Once, Before the Loop

```rust
// ✅ Correct: load assets before or at start of game loop
let player_tex = load_texture("assets/player.png").await.unwrap();
let shoot_sfx = load_sound("assets/shoot.wav").await.unwrap();

loop {
    // Use loaded assets
    draw_texture(&player_tex, x, y, WHITE);
    next_frame().await
}

// ❌ Wrong: loading inside the loop (disk I/O every frame)
```

### Delta Time: Always Use get_frame_time()

```rust
// ✅ Correct: frame-rate independent movement
let dt = get_frame_time();
player.pos.x += player.speed * dt;

// ❌ Wrong: hardcoded pixel movement per frame
// player.pos.x += 5.0;  // Speed varies with FPS
```

---

## Critical Macroquad Conventions

### 1. Drawing Order Matters

Macroquad draws in call order — later calls render on top. There is no z-index:

```rust
draw_rectangle(0.0, 0.0, 800.0, 600.0, DARKBLUE);  // Background
draw_texture(&ground, 0.0, 500.0, WHITE);             // Ground
draw_texture(&player, px, py, WHITE);                  // Player (on top)
draw_text("Score: 0", 10.0, 30.0, 24.0, WHITE);       // UI (topmost)
```

### 2. Screen Space Coordinates

- (0, 0) is **top-left**
- X increases rightward, Y increases downward
- Use `screen_width()` and `screen_height()` for responsive layouts
- Use `Camera2D` for world-space coordinates (scrolling, zoom)

### 3. Collision Is Manual

Macroquad provides `Rect::overlaps()` for AABB. For anything else, implement it yourself or pull in `rapier2d`.

### 4. No Built-in Scene/State Machine

Implement game states with an enum and match:

```rust
enum Screen { Menu, Playing, GameOver }

let mut screen = Screen::Menu;

loop {
    match screen {
        Screen::Menu => {
            if is_key_pressed(KeyCode::Enter) { screen = Screen::Playing; }
            draw_text("Press Enter", 200.0, 300.0, 40.0, WHITE);
        }
        Screen::Playing => { /* game logic */ }
        Screen::GameOver => { /* show score */ }
    }
    next_frame().await
}
```

### 5. WASM Is First-Class

Macroquad's WASM support is excellent. The same codebase compiles to desktop and web without `#[cfg]` blocks for most use cases. Test WASM builds regularly.

---

## Rust-Specific Gotchas

### Ownership of Textures

`Texture2D` is internally reference-counted and cheap to clone. You can store copies in multiple structs without issues:

```rust
// ✅ Fine: Texture2D is Clone + Copy (it's a handle)
let tex = load_texture("sprite.png").await.unwrap();
let player = Player { texture: tex };
let enemy = Enemy { texture: tex }; // Same texture, no copy of pixel data
```

### Lifetimes Avoided by Design

Macroquad's API intentionally avoids lifetimes. Functions take owned values or `&` references — you won't encounter `'a` lifetime annotations in normal use. This is a deliberate design choice to stay beginner-friendly.

### Vec-Based Entity Management

Without an ECS, you manage entities in Vecs. Use `retain()` for cleanup:

```rust
// ✅ Correct: remove dead entities
state.bullets.retain(|b| b.alive);
state.enemies.retain(|e| e.health > 0);

// ❌ Wrong: removing by index while iterating (panics or skips)
```

---

## Version Compatibility

**Current version: Macroquad 0.4.14** (latest as of early 2026). The 0.4.x line is stable.

Macroquad is developed by not-fl3 and uses miniquad as its rendering backend. The API is simpler and changes less frequently than Bevy, but always check `docs.rs/macroquad` for current function signatures.
