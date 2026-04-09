# E2 — Audio & Resource Management

> **Category:** explanation · **Engine:** Macroquad 0.4 · **Related:** [E1 Architecture Overview](E1_architecture_overview.md) · [R1 Drawing, Input & Audio](../reference/R1_drawing_input_audio.md) · [G1 Getting Started](../guides/G1_getting_started.md) · [G2 WASM & egui](../guides/G2_wasm_and_egui.md) · [macroquad-arch-rules](../macroquad-arch-rules.md)

---

## Overview

Macroquad 0.4 significantly overhauled resource management compared to 0.3. All resources (textures, sounds, fonts, materials) are now `Clone` instead of `Copy`, acting as **reference-counted smart pointers**. This fixed memory leaks present in 0.3 where resources had no destructors. Understanding this lifecycle is essential for building games that don't leak memory or stall during loading.

This doc covers the resource model in depth, with special focus on audio — which requires explicit opt-in via a cargo feature.

---

## Resource Lifecycle

### The Smart-Pointer Model

In Macroquad 0.4, every resource handle (`Texture2D`, `Sound`, `Font`, `Material`) is internally a reference-counted wrapper. When you call `load_texture()` or `load_sound()`, you get back a handle that can be cloned cheaply:

```rust
use macroquad::prelude::*;

let texture = load_texture("player.png").await.unwrap();

// Cheap clone — shares the underlying GPU/audio data
let texture_copy = texture.clone();

// When all clones are dropped, the underlying resource is freed
```

### 0.3 → 0.4 Migration Note

In Macroquad 0.3, resources implemented `Copy`, which meant you could pass them around freely but they were **never freed** — leading to memory leaks in long-running games. In 0.4:

- Resources implement `Clone`, not `Copy`.
- Dropping the last handle frees the underlying data.
- You must explicitly `.clone()` when sharing a resource across multiple owners.

> **Rust ownership gotcha:** If you store a `Sound` in a struct and also pass it to `play_sound()`, you need to clone it. The function takes a reference (`&Sound`), but if you move the `Sound` into a collection and later need it elsewhere, you'll need the clone.

---

## Audio System

### Enabling Audio

Audio is an **opt-in feature** in Macroquad 0.4. Without it, the binary is smaller and compiles faster.

```toml
[dependencies]
macroquad = { version = "0.4", features = ["audio"] }
```

### Module Import

```rust
use macroquad::audio::{
    load_sound,
    play_sound,
    play_sound_once,
    stop_sound,
    set_sound_volume,
    PlaySoundParams,
    Sound,
};
```

### Loading Sounds

All loading is async and should happen during initialization or a dedicated loading screen:

```rust
async fn load_game_audio() -> GameAudio {
    GameAudio {
        music_theme: load_sound("assets/audio/theme.ogg").await.unwrap(),
        music_boss: load_sound("assets/audio/boss_fight.ogg").await.unwrap(),
        sfx_shoot: load_sound("assets/audio/shoot.wav").await.unwrap(),
        sfx_explosion: load_sound("assets/audio/explosion.wav").await.unwrap(),
        sfx_pickup: load_sound("assets/audio/pickup.wav").await.unwrap(),
    }
}

struct GameAudio {
    music_theme: Sound,
    music_boss: Sound,
    sfx_shoot: Sound,
    sfx_explosion: Sound,
    sfx_pickup: Sound,
}
```

### Supported Formats

| Format | Best for | Platform notes |
|--------|----------|----------------|
| **OGG Vorbis** (.ogg) | Music, long audio | Smaller files, good quality. Recommended default. |
| **WAV** (.wav) | Short SFX | Zero decode overhead, larger files. Required for Safari WASM. |
| **MP3** | Not recommended | Browser compatibility varies. Use OGG instead. |

> **WASM Safari gotcha:** Safari's WebAudio has limited OGG support in some versions. If targeting Safari via WASM, convert music tracks to WAV or provide WAV fallbacks.

### Playing Audio

```rust
// --- Sound Effects (fire-and-forget) ---
play_sound_once(&audio.sfx_shoot);

// --- Music (looped, with volume control) ---
play_sound(
    &audio.music_theme,
    PlaySoundParams {
        looped: true,
        volume: 0.7,
    },
);

// --- Adjust volume of a playing sound ---
set_sound_volume(&audio.music_theme, 0.3);

// --- Stop a sound ---
stop_sound(&audio.music_theme);
```

### PlaySoundParams

```rust
pub struct PlaySoundParams {
    /// Whether the sound loops continuously.
    pub looped: bool,
    /// Volume from 0.0 (silent) to 1.0 (full).
    pub volume: f32,
}
```

---

## Audio Patterns for Games

### Pattern: Audio Manager

Centralize all audio control in a single struct to manage music transitions and global volume:

```rust
struct AudioManager {
    sounds: GameAudio,
    current_music: Option<Sound>,
    master_volume: f32,
    music_volume: f32,
    sfx_volume: f32,
}

impl AudioManager {
    fn new(sounds: GameAudio) -> Self {
        Self {
            sounds,
            current_music: None,
            master_volume: 1.0,
            music_volume: 0.7,
            sfx_volume: 1.0,
        }
    }

    fn play_music(&mut self, music: &Sound) {
        // Stop current music before starting new track
        if let Some(ref current) = self.current_music {
            stop_sound(current);
        }

        let volume = self.master_volume * self.music_volume;
        play_sound(music, PlaySoundParams {
            looped: true,
            volume,
        });
        self.current_music = Some(music.clone());
    }

    fn play_sfx(&self, sfx: &Sound) {
        // For SFX, we use play_sound with computed volume
        // play_sound_once doesn't support volume, so use play_sound
        play_sound(sfx, PlaySoundParams {
            looped: false,
            volume: self.master_volume * self.sfx_volume,
        });
    }

    fn set_master_volume(&mut self, volume: f32) {
        self.master_volume = volume.clamp(0.0, 1.0);
        // Update currently playing music
        if let Some(ref music) = self.current_music {
            set_sound_volume(music, self.master_volume * self.music_volume);
        }
    }

    fn stop_all(&mut self) {
        if let Some(ref music) = self.current_music {
            stop_sound(music);
            self.current_music = None;
        }
    }
}
```

### Pattern: Distance-Based Volume (Pseudo-Spatial Audio)

Macroquad has no built-in spatial audio. Simulate it by adjusting volume based on distance:

```rust
fn spatial_volume(
    listener_pos: Vec2,
    source_pos: Vec2,
    max_distance: f32,
) -> f32 {
    let distance = listener_pos.distance(source_pos);
    if distance >= max_distance {
        0.0
    } else {
        // Linear falloff — use quadratic for more realistic drop
        1.0 - (distance / max_distance)
    }
}

// Usage in game loop:
let volume = spatial_volume(player_pos, explosion_pos, 500.0);
if volume > 0.01 {
    play_sound(&audio.sfx_explosion, PlaySoundParams {
        looped: false,
        volume,
    });
}
```

### Pattern: WASM Audio Unlock

Browsers block audio until user interaction. Macroquad handles this internally, but your first frame's audio may be silent. Handle this gracefully:

```rust
let mut audio_unlocked = false;

loop {
    // Detect first user input
    if !audio_unlocked && (is_mouse_button_pressed(MouseButton::Left)
        || is_key_pressed(KeyCode::Space))
    {
        audio_unlocked = true;
        // Now safe to start music
        play_sound(&audio.music_theme, PlaySoundParams {
            looped: true,
            volume: 0.7,
        });
    }

    // ... rest of game loop

    next_frame().await;
}
```

---

## Texture & Font Resource Patterns

### Loading Screen Pattern

Pre-load all assets before the game loop starts to avoid mid-game hitches:

```rust
#[macroquad::main("My Game")]
async fn main() {
    // --- Loading phase ---
    let loading_font = load_ttf_font("assets/fonts/main.ttf").await.unwrap();

    // Show progress while loading
    let assets_to_load = 10;
    let mut loaded = 0;

    let player_tex = load_texture("assets/sprites/player.png").await.unwrap();
    loaded += 1;
    draw_loading_screen(loaded, assets_to_load, &loading_font).await;

    let enemy_tex = load_texture("assets/sprites/enemy.png").await.unwrap();
    loaded += 1;
    draw_loading_screen(loaded, assets_to_load, &loading_font).await;

    // ... load remaining assets ...

    let audio = load_game_audio().await;

    // --- Game loop ---
    loop {
        // All textures/sounds already loaded — no hitches
        draw_texture(&player_tex, 100.0, 100.0, WHITE);
        next_frame().await;
    }
}

async fn draw_loading_screen(loaded: usize, total: usize, font: &Font) {
    clear_background(BLACK);
    let progress = loaded as f32 / total as f32;
    let bar_width = screen_width() * 0.6;
    let bar_x = (screen_width() - bar_width) / 2.0;
    let bar_y = screen_height() / 2.0;

    draw_rectangle(bar_x, bar_y, bar_width, 20.0, DARKGRAY);
    draw_rectangle(bar_x, bar_y, bar_width * progress, 20.0, GREEN);

    let text = format!("Loading... {}/{}", loaded, total);
    draw_text_ex(&text, bar_x, bar_y - 10.0, TextParams {
        font: Some(font),
        font_size: 20,
        color: WHITE,
        ..Default::default()
    });

    next_frame().await;
}
```

### Texture Configuration

After loading, configure texture filtering for pixel art or smooth scaling:

```rust
let sprite = load_texture("assets/player.png").await.unwrap();

// Pixel art: nearest-neighbor filtering (no blurring)
sprite.set_filter(FilterMode::Nearest);

// Smooth art: linear filtering
// sprite.set_filter(FilterMode::Linear);
```

### Render Textures (Off-Screen Rendering)

Use `render_target()` for effects like minimap rendering, post-processing, or screen transitions:

```rust
let render_target = render_target(256, 256);
render_target.texture.set_filter(FilterMode::Nearest);

// Draw to the render target
set_camera(&Camera2D {
    render_target: Some(render_target.clone()),
    zoom: vec2(2.0 / 256.0, 2.0 / 256.0),
    ..Default::default()
});

clear_background(DARKBLUE);
draw_circle(128.0, 128.0, 30.0, YELLOW);

// Back to main screen
set_default_camera();

// Use the render target's texture as a sprite
draw_texture(&render_target.texture, 10.0, 10.0, WHITE);
```

---

## Memory Management Tips

| Concern | Solution |
|---------|----------|
| Leaking textures/sounds | Let handles drop when no longer needed; 0.4's Clone model frees automatically |
| Loading hitches | Pre-load everything in a loading screen; never `load_*` in the game loop |
| Large texture memory | Use texture atlases (sprite sheets) instead of individual files |
| WASM memory limits | Keep total asset size under ~100MB; compress with OGG for audio, use small textures |
| Font rendering cost | Pre-load fonts; reuse `TextParams` objects; avoid loading mid-frame |

---

## Key Cargo Dependencies

```toml
[dependencies]
macroquad = { version = "0.4", features = ["audio"] }
```

No additional crates needed for core resource management. For advanced audio (mixing, effects), consider the `quad-snd` crate (Macroquad's underlying audio backend) or `kira` for a more feature-rich audio engine with its own integration effort.

---

## Further Reading

- [R1 — Drawing, Input & Audio Reference](../reference/R1_drawing_input_audio.md) — Quick API reference
- [G2 — WASM & egui](../guides/G2_wasm_and_egui.md) — WASM deployment details
- [G3 — Camera, Textures & Coroutines](../guides/G3_camera_textures_coroutines.md) — Deeper texture usage
- [Macroquad audio docs (docs.rs)](https://docs.rs/macroquad/latest/macroquad/audio/)
- [Macroquad 0.4 changelog](https://macroquad.rs/articles/macroquad-0-4/)
- [Game development in Rust with Macroquad — Audio chapter](https://mq.agical.se/ch12-audio.html)
