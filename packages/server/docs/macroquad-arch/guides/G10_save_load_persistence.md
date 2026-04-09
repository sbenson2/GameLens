# G10 — Save/Load & Persistence Patterns

> **Category:** guide · **Engine:** Macroquad 0.4 · **Related:** [E3 Structuring Larger Games](../architecture/E3_structuring_larger_games.md) · [G4 Scene Management](G4_scene_management_game_states.md) · [R3 Ecosystem & Common Crates](../reference/R3_ecosystem_common_crates.md) · [macroquad-arch-rules](../macroquad-arch-rules.md)

---

## Overview

Macroquad doesn't include a built-in save system, but Rust's serialization ecosystem makes it straightforward to build one. This guide covers three approaches — from quick key-value storage to full game state serialization — with cross-platform patterns that work on desktop and WASM.

---

## Approach 1: `quad-storage` (Simple Key-Value)

The `quad-storage` crate provides a persistent key-value store that works across desktop and WASM without conditional compilation.

```toml
[dependencies]
macroquad = "0.4"
quad-storage = "0.1"
```

```rust
use quad_storage::STORAGE;

// Save a value
fn save_high_score(score: u32) {
    let storage = &mut STORAGE.lock().unwrap();
    storage.set("high_score", &score.to_string());
}

// Load a value
fn load_high_score() -> u32 {
    let storage = &mut STORAGE.lock().unwrap();
    storage
        .get("high_score")
        .and_then(|s| s.parse().ok())
        .unwrap_or(0)
}
```

**Platform behavior:**

- **WASM:** Uses the Web Storage API (localStorage). Persists across browser sessions.
- **Native (desktop):** Saves to a file called `local.data` in the working directory.

**WASM setup note:** You must include two extra JS files in your HTML page for WASM builds:

```html
<!-- After gl.js, before your WASM init -->
<script src="sapp_jsutils.js"></script>
<script src="quad-storage.js"></script>
```

**Best for:** Settings, high scores, unlocks, small config — anything that fits a flat key-value model.

---

## Approach 2: `serde` + JSON/RON (Full Game State)

For structured save data, use `serde` to serialize your game state to JSON, RON, or binary formats.

```toml
[dependencies]
macroquad = "0.4"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
```

### Define Serializable Game State

```rust
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone)]
struct SaveData {
    player: PlayerSave,
    level: u32,
    inventory: Vec<String>,
    play_time_secs: f64,
    timestamp: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct PlayerSave {
    x: f32,
    y: f32,
    health: f32,
    max_health: f32,
}
```

### Save to File (Desktop)

```rust
use std::fs;

fn save_game(data: &SaveData, slot: u32) -> Result<(), String> {
    let json = serde_json::to_string_pretty(data)
        .map_err(|e| format!("Serialize failed: {e}"))?;

    let path = save_path(slot);
    fs::write(&path, json)
        .map_err(|e| format!("Write failed: {e}"))?;

    Ok(())
}

fn load_game(slot: u32) -> Result<SaveData, String> {
    let path = save_path(slot);
    let json = fs::read_to_string(&path)
        .map_err(|e| format!("Read failed: {e}"))?;

    serde_json::from_str(&json)
        .map_err(|e| format!("Deserialize failed: {e}"))
}

fn save_path(slot: u32) -> String {
    // On desktop, save next to the executable or in a known directory
    format!("save_slot_{slot}.json")
}
```

### Cross-Platform Save (Desktop + WASM)

For WASM, `std::fs` doesn't work. Combine `serde_json` with `quad-storage` for a unified API:

```rust
use serde::{de::DeserializeOwned, Serialize};

fn save<T: Serialize>(key: &str, data: &T) -> Result<(), String> {
    let json = serde_json::to_string(data)
        .map_err(|e| format!("Serialize: {e}"))?;

    #[cfg(target_arch = "wasm32")]
    {
        let storage = &mut quad_storage::STORAGE.lock().unwrap();
        storage.set(key, &json);
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        std::fs::write(format!("{key}.json"), &json)
            .map_err(|e| format!("Write: {e}"))?;
    }

    Ok(())
}

fn load<T: DeserializeOwned>(key: &str) -> Result<Option<T>, String> {
    let json_opt;

    #[cfg(target_arch = "wasm32")]
    {
        let storage = &mut quad_storage::STORAGE.lock().unwrap();
        json_opt = storage.get(key);
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        json_opt = std::fs::read_to_string(format!("{key}.json")).ok();
    }

    match json_opt {
        Some(json) => {
            let data = serde_json::from_str(&json)
                .map_err(|e| format!("Deserialize: {e}"))?;
            Ok(Some(data))
        }
        None => Ok(None),
    }
}
```

**Usage:**

```rust
// Save
let save_data = SaveData { /* ... */ };
save("save_slot_1", &save_data).expect("Failed to save");

// Load
if let Ok(Some(data)) = load::<SaveData>("save_slot_1") {
    restore_game_state(&data);
}
```

---

## Approach 3: Binary Format (Compact Saves)

For larger save files or when you want smaller file sizes, use `bincode`:

```toml
[dependencies]
bincode = "1"
serde = { version = "1", features = ["derive"] }
```

```rust
fn save_binary(data: &SaveData) -> Result<Vec<u8>, String> {
    bincode::serialize(data)
        .map_err(|e| format!("Serialize: {e}"))
}

fn load_binary(bytes: &[u8]) -> Result<SaveData, String> {
    bincode::deserialize(bytes)
        .map_err(|e| format!("Deserialize: {e}"))
}
```

For WASM, base64-encode the binary data before storing in `quad-storage` (which only accepts strings).

---

## Macroquad's Built-in `storage` Module

Macroquad has an experimental `storage` module for global in-memory state. This is **not persistence** — it's a runtime global store for sharing data without passing it through function arguments.

```rust
use macroquad::experimental::collections::storage;

// Store a value globally
storage::store(my_resources);

// Retrieve it anywhere
let res = storage::get::<Resources>();
```

**Important:** `storage::store` and `storage::get` are for runtime data sharing (like a global singleton), not for saving to disk. Data is lost when the process exits. Use it for things like loaded assets or config that needs to be accessible everywhere.

> Both `storage` and `coroutines` are marked experimental and may change in future Macroquad versions.

---

## Save System Architecture

A clean pattern for Macroquad games:

```rust
use macroquad::prelude::*;

#[derive(Serialize, Deserialize, Clone, Default)]
struct GameState {
    player_x: f32,
    player_y: f32,
    health: f32,
    score: u32,
    level: u32,
    // Only save what you need to reconstruct the game.
    // Don't save textures, sounds, or derived state.
}

impl GameState {
    /// Extract saveable state from live game objects
    fn snapshot(player: &Player, game: &Game) -> Self {
        Self {
            player_x: player.pos.x,
            player_y: player.pos.y,
            health: player.health,
            score: game.score,
            level: game.current_level,
        }
    }

    /// Restore live game objects from saved state
    fn restore(&self, player: &mut Player, game: &mut Game) {
        player.pos = vec2(self.player_x, self.player_y);
        player.health = self.health;
        game.score = self.score;
        game.current_level = self.level;
    }
}
```

### Save Slot Management

```rust
fn list_save_slots() -> Vec<(u32, String)> {
    let mut slots = vec![];
    for i in 0..3 {
        if let Ok(Some(data)) = load::<SaveData>(&format!("save_slot_{i}")) {
            slots.push((i, data.timestamp.clone()));
        }
    }
    slots
}

fn delete_save(slot: u32) {
    #[cfg(target_arch = "wasm32")]
    {
        let storage = &mut quad_storage::STORAGE.lock().unwrap();
        storage.set(&format!("save_slot_{slot}"), "");
    }

    #[cfg(not(target_arch = "wasm32"))]
    {
        let _ = std::fs::remove_file(format!("save_slot_{slot}.json"));
    }
}
```

---

## Coroutine Limitation

Macroquad coroutine state **cannot be serialized**. If your game uses coroutines for cutscenes or scripted sequences, you cannot save mid-coroutine and resume from the exact point. Design around this by:

- Using coroutines only for asset loading and brief animations
- Tracking cutscene/sequence progress as an index in your `SaveData` struct
- Restarting the coroutine from the saved progress index on load

---

## Ownership & Borrowing Gotchas

**Mutex in `quad-storage`:** `STORAGE` is behind a `Mutex`. Don't hold the lock across `await` points or for longer than needed — it will panic on re-entry.

```rust
// BAD — lock held across potential panic boundary
let storage = &mut STORAGE.lock().unwrap();
let val1 = storage.get("a");
let val2 = storage.get("b"); // fine here, but be careful
do_expensive_work(); // don't do this while holding the lock
storage.set("c", "done");

// GOOD — lock/unlock quickly
fn read_setting(key: &str) -> Option<String> {
    STORAGE.lock().unwrap().get(key)
}
```

**`serde` with borrowed data:** `Deserialize<'de>` lifetimes can be tricky. If your save structs contain `&str`, switch to `String` to avoid lifetime issues. For game saves, owned types are almost always simpler.

---

## Recommended Crate Combinations

| Use Case | Crates | Notes |
|----------|--------|-------|
| Settings / high scores | `quad-storage` | Simplest, works on WASM out of the box |
| Full game save (readable) | `serde` + `serde_json` | Human-readable, easy to debug |
| Full game save (compact) | `serde` + `bincode` | Smaller files, faster parse |
| Cross-platform saves | `serde_json` + `quad-storage` | JSON in localStorage on WASM, files on desktop |
| Versioned saves | `serde` + `serde_json` + manual migration | Add a `version` field, handle old formats on load |
