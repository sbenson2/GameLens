# G7 — Animation & Sprite Sheets

> **Category:** guide · **Engine:** Macroquad 0.4 · **Related:** [G1 Getting Started](G1_getting_started.md) · [R1 Drawing, Input & Audio](../reference/R1_drawing_input_audio.md) · [G3 Camera, Textures & Coroutines](G3_camera_textures_coroutines.md) · [macroquad-arch-rules](../macroquad-arch-rules.md)

---

## Overview

Most 2D games need animated sprites — characters walking, enemies attacking, effects playing. Macroquad provides an **experimental animation module** for sprite sheet playback, plus you can build your own lightweight animation system with `draw_texture_ex` and frame math. This guide covers both approaches.

---

## Sprite Sheet Basics

A sprite sheet is a single image containing multiple frames arranged in a grid. Each frame has fixed dimensions (tile width/height), and animations map to rows or sequences of frames.

```
┌──────┬──────┬──────┬──────┐
│ idle │ idle │ idle │ idle │  ← Row 0: Idle (4 frames)
│  0   │  1   │  2   │  3   │
├──────┼──────┼──────┼──────┤
│ run  │ run  │ run  │ run  │  ← Row 1: Run (4 frames)
│  0   │  1   │  2   │  3   │
├──────┼──────┼──────┼──────┤
│ atk  │ atk  │ atk  │      │  ← Row 2: Attack (3 frames)
│  0   │  1   │  2   │      │
└──────┴──────┴──────┴──────┘
  32px   32px   32px   32px
```

---

## Manual Animation (No Dependencies)

The simplest approach — track the current frame yourself using `draw_texture_ex` with a source rectangle. This gives you full control and zero dependencies.

```rust
use macroquad::prelude::*;

struct SpriteAnimation {
    texture: Texture2D,
    tile_w: f32,
    tile_h: f32,
    row: u32,          // Which row in the sheet
    frames: u32,       // How many frames in this animation
    fps: f32,
    timer: f32,
    current_frame: u32,
}

impl SpriteAnimation {
    fn new(texture: Texture2D, tile_w: f32, tile_h: f32, row: u32, frames: u32, fps: f32) -> Self {
        Self {
            texture,
            tile_w,
            tile_h,
            row,
            frames,
            fps,
            timer: 0.0,
            current_frame: 0,
        }
    }

    fn update(&mut self) {
        self.timer += get_frame_time();
        if self.timer >= 1.0 / self.fps {
            self.timer -= 1.0 / self.fps;
            self.current_frame = (self.current_frame + 1) % self.frames;
        }
    }

    fn draw(&self, x: f32, y: f32, flip_x: bool) {
        // Calculate the source rectangle for the current frame
        let src_x = self.current_frame as f32 * self.tile_w;
        let src_y = self.row as f32 * self.tile_h;

        draw_texture_ex(
            &self.texture,
            x,
            y,
            WHITE,
            DrawTextureParams {
                source: Some(Rect::new(src_x, src_y, self.tile_w, self.tile_h)),
                dest_size: Some(vec2(self.tile_w * 2.0, self.tile_h * 2.0)), // 2x scale
                flip_x,
                ..Default::default()
            },
        );
    }
}

#[macroquad::main("Manual Animation")]
async fn main() {
    // Load the sprite sheet (single image, all frames in a grid)
    let sheet = load_texture("assets/player.png").await.unwrap();
    sheet.set_filter(FilterMode::Nearest); // Pixel art — no blurring

    let mut idle = SpriteAnimation::new(sheet.clone(), 32.0, 32.0, 0, 4, 8.0);
    let mut run = SpriteAnimation::new(sheet.clone(), 32.0, 32.0, 1, 4, 12.0);

    let mut pos = vec2(200.0, 200.0);
    let mut facing_left = false;

    loop {
        clear_background(DARKGRAY);

        let speed = 150.0 * get_frame_time();
        let mut moving = false;

        if is_key_down(KeyCode::Right) {
            pos.x += speed;
            facing_left = false;
            moving = true;
        }
        if is_key_down(KeyCode::Left) {
            pos.x -= speed;
            facing_left = true;
            moving = true;
        }

        // Pick and update the correct animation
        if moving {
            run.update();
            run.draw(pos.x, pos.y, facing_left);
        } else {
            idle.update();
            idle.draw(pos.x, pos.y, facing_left);
        }

        next_frame().await;
    }
}
```

### Why Manual?

Macroquad's built-in animation module is marked `experimental` and has a minimal API. For anything beyond basic playback — state machines, blend transitions, event triggers — you'll want manual control. The approach above is only ~50 lines and gives you exactly what you need.

---

## Built-in AnimatedSprite (Experimental)

Macroquad's `experimental::animation` module provides `AnimatedSprite` and `Animation` structs. It handles frame timing internally.

```rust
use macroquad::prelude::*;
use macroquad::experimental::animation::{AnimatedSprite, Animation};

#[macroquad::main("AnimatedSprite Demo")]
async fn main() {
    let sheet = load_texture("assets/enemies.png").await.unwrap();
    sheet.set_filter(FilterMode::Nearest);

    // Define the sprite — 16x24 tiles, with named animations
    let mut sprite = AnimatedSprite::new(
        16,  // tile_width in pixels
        24,  // tile_height in pixels
        &[
            Animation {
                name: "idle".to_string(),
                row: 0,
                frames: 4,
                fps: 8,
            },
            Animation {
                name: "walk".to_string(),
                row: 1,
                frames: 6,
                fps: 10,
            },
            Animation {
                name: "attack".to_string(),
                row: 2,
                frames: 3,
                fps: 12,
            },
        ],
        true, // playing
    );

    // Switch animation by index
    sprite.set_animation(0); // "idle"

    loop {
        clear_background(BLACK);

        // Update advances the frame timer internally
        sprite.update();

        // Draw using source_rect — the sprite calculates which frame to show
        draw_texture_ex(
            &sheet,
            100.0,
            100.0,
            WHITE,
            DrawTextureParams {
                source: Some(sprite.frame().source_rect),
                dest_size: Some(sprite.frame().dest_size),
                ..Default::default()
            },
        );

        next_frame().await;
    }
}
```

### AnimatedSprite API

| Method | Purpose |
|--------|---------|
| `AnimatedSprite::new(w, h, &[Animation], playing)` | Create from tile dimensions and animation list |
| `sprite.set_animation(index)` | Switch to animation by index (resets frame to 0) |
| `sprite.update()` | Advance frame timer (call once per frame) |
| `sprite.frame()` | Returns `AnimationFrame` with `source_rect` and `dest_size` |
| `sprite.playing` | `bool` — set to `false` to pause |

### Limitations

The experimental module does not support: animation callbacks/events, blending between animations, non-uniform frame sizes, or animation queuing. For those features, use the manual approach or the `queued_animated_sprites_macroquad` community crate.

---

## Animation State Machine

For games with multiple character states, wrap your animations in a state machine:

```rust
use macroquad::prelude::*;

#[derive(PartialEq, Clone, Copy)]
enum PlayerState {
    Idle,
    Running,
    Jumping,
    Attacking,
}

struct Player {
    pos: Vec2,
    vel: Vec2,
    state: PlayerState,
    facing_left: bool,
    animations: Vec<SpriteAnimation>,  // indexed by PlayerState
    attack_timer: f32,
}

impl Player {
    fn update(&mut self) {
        let dt = get_frame_time();
        let old_state = self.state;

        // State transitions
        if self.attack_timer > 0.0 {
            self.attack_timer -= dt;
            self.state = PlayerState::Attacking;
        } else if is_key_pressed(KeyCode::Space) {
            self.state = PlayerState::Attacking;
            self.attack_timer = 0.3; // Attack lasts 0.3 seconds
        } else if self.vel.y != 0.0 {
            self.state = PlayerState::Jumping;
        } else if self.vel.x.abs() > 0.1 {
            self.state = PlayerState::Running;
        } else {
            self.state = PlayerState::Idle;
        }

        // Reset frame when state changes
        if self.state != old_state {
            self.animations[self.state as usize].current_frame = 0;
            self.animations[self.state as usize].timer = 0.0;
        }

        // Movement
        if is_key_down(KeyCode::Right) {
            self.vel.x = 200.0;
            self.facing_left = false;
        } else if is_key_down(KeyCode::Left) {
            self.vel.x = -200.0;
            self.facing_left = true;
        } else {
            self.vel.x = 0.0;
        }

        self.pos += self.vel * dt;
        self.animations[self.state as usize].update();
    }

    fn draw(&self) {
        self.animations[self.state as usize].draw(
            self.pos.x,
            self.pos.y,
            self.facing_left,
        );
    }
}
```

---

## Loading Sprite Sheets at Runtime

Use Macroquad's async texture loading with coroutines for loading screens:

```rust
use macroquad::prelude::*;

async fn load_all_textures() -> Vec<Texture2D> {
    let paths = ["player.png", "enemies.png", "effects.png"];
    let mut textures = Vec::new();

    for path in &paths {
        let tex = load_texture(&format!("assets/{}", path)).await.unwrap();
        tex.set_filter(FilterMode::Nearest);
        textures.push(tex);
    }

    textures
}
```

### Texture Filtering

**Always** call `set_filter(FilterMode::Nearest)` for pixel art sprite sheets. The default is `FilterMode::Linear`, which blurs pixel art when scaled. This is the single most common visual bug in Macroquad pixel art games.

---

## Performance Tips

**Batch draws from the same texture.** Macroquad batches `draw_texture_ex` calls that use the same texture automatically. Drawing all sprites from one sheet before switching to another minimizes GPU state changes.

**Keep sprite sheets as power-of-two dimensions** (256x256, 512x512, etc.) for best GPU compatibility, especially on WASM and mobile targets.

**Avoid creating new `Texture2D` instances each frame.** Load textures once at startup or during loading screens, then reference them. Rust's ownership model helps here — store textures in a struct or `Vec` and pass references.

---

## Cargo Dependencies

```toml
[dependencies]
macroquad = "0.4"  # AnimatedSprite is built-in (experimental module)

# Optional: for more advanced animation queuing
# queued_animated_sprites_macroquad = "0.1"
```

---

## Common Pitfalls

| Problem | Cause | Fix |
|---------|-------|-----|
| Blurry sprites when scaled | Default `FilterMode::Linear` | Call `set_filter(FilterMode::Nearest)` |
| Animation plays once then stops | Frame counter not wrapping | Use `% self.frames` modulo |
| Sprite shows wrong frame after state change | Timer/frame not reset | Reset `current_frame` and `timer` to 0 on state transition |
| Black rectangle instead of sprite | Texture not loaded yet | Use `await` on `load_texture` — it's async |
| Sprite stretched or squished | Wrong `dest_size` aspect ratio | Match `dest_size` ratio to `tile_w / tile_h` |
