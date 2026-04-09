# G76 — GDExtension with Rust (gdext)

> **Category:** guide · **Engine:** Godot 4.4+ · **Language:** Rust / GDScript / C#
> **Related:** [G16 GDExtension & Native C++](./G16_gdextension_native_code.md) · [E2 GDScript vs C#](../architecture/E2_gdscript_vs_csharp.md) · [G34 Threading & Async](./G34_threading_and_async.md) · [G18 Performance Profiling](./G18_performance_profiling.md)

---

## What This Guide Covers

G16 covers GDExtension with C++ via godot-cpp. This guide covers the **Rust** alternative using the [godot-rust/gdext](https://github.com/godot-rust/gdext) crate — a community-maintained binding that maps the vast majority of Godot 4 APIs to idiomatic Rust. gdext provides memory safety, strong typing, zero-cost abstractions, and a `cargo`-based build pipeline while maintaining binary compatibility from Godot 4.1 through 4.6+.

**Use Rust (gdext) when:** you want GDExtension's native performance with memory safety guarantees, you're already comfortable with Rust, you need safe concurrency for CPU-bound work (pathfinding, procedural generation, networking), or you want `cargo` ecosystem access (serde, rayon, noise libraries).

**Don't use Rust when:** your team doesn't know Rust — the learning curve is steep. GDScript or C# cover 90% of game logic. Profile first.

**gdext vs godot-cpp decision:** Both produce `.gdextension` libraries. Choose Rust for memory safety and `cargo` ecosystem. Choose C++ for direct Godot source-level debugging, existing C/C++ library wrappers, or team familiarity.

---

## Table of Contents

1. [Prerequisites and Toolchain](#1-prerequisites-and-toolchain)
2. [Project Setup](#2-project-setup)
3. [Your First Rust Node](#3-your-first-rust-node)
4. [Properties and the Editor](#4-properties-and-the-editor)
5. [Methods, Signals, and Constants](#5-methods-signals-and-constants)
6. [The .gdextension File](#6-the-gdextension-file)
7. [Calling Between Rust and GDScript](#7-calling-between-rust-and-gdscript)
8. [Working with Godot Types](#8-working-with-godot-types)
9. [Typed Collections (4.4+)](#9-typed-collections-44)
10. [Singletons and Autoloads](#10-singletons-and-autoloads)
11. [Hot Reloading](#11-hot-reloading)
12. [Performance Patterns](#12-performance-patterns)
13. [Cross-Platform Builds](#13-cross-platform-builds)
14. [Testing](#14-testing)
15. [Common Mistakes](#15-common-mistakes)
16. [C# Interop Notes](#16-c-interop-notes)

---

## 1. Prerequisites and Toolchain

You need:

- **Rust stable** (1.78+ recommended) via [rustup](https://rustup.rs)
- **Godot 4.4+** (gdext supports 4.1+ but typed dictionaries require 4.4)
- **A C linker** — comes with platform build tools (Xcode CLI on macOS, MSVC on Windows, gcc/clang on Linux)

Verify your setup:

```bash
rustc --version   # 1.78.0 or newer
cargo --version
godot --version   # 4.4.stable or newer
```

---

## 2. Project Setup

### Directory Structure

A typical Godot + Rust project looks like this:

```
my_game/
├── project.godot
├── rust/
│   ├── Cargo.toml
│   └── src/
│       └── lib.rs
├── bin/               # compiled .so / .dylib / .dll land here
└── my_extension.gdextension
```

### Cargo.toml

```toml
[package]
name = "my_game_rust"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
godot = "0.5"            # gdext crate — check crates.io for latest
```

The `cdylib` crate type produces a shared library that Godot loads at runtime.

### src/lib.rs — Entry Point

```rust
use godot::prelude::*;

struct MyExtension;

#[gdextension]
unsafe impl ExtensionLibrary for MyExtension {}
```

This is the minimum boilerplate. The `#[gdextension]` macro generates the C ABI entry point that Godot's GDExtension loader expects.

Build with:

```bash
cd rust
cargo build          # debug build → target/debug/
cargo build --release # optimized → target/release/
```

Copy (or symlink) the resulting library into your `bin/` directory.

---

## 3. Your First Rust Node

```rust
use godot::prelude::*;
use godot::classes::{CharacterBody2D, ICharacterBody2D};

#[derive(GodotClass)]
#[class(base=CharacterBody2D)]
pub struct RustPlayer {
    base: Base<CharacterBody2D>,

    #[var]
    speed: f32,

    #[var]
    jump_force: f32,
}

#[godot_api]
impl ICharacterBody2D for RustPlayer {
    fn init(base: Base<CharacterBody2D>) -> Self {
        Self {
            base,
            speed: 200.0,
            jump_force: -400.0,
        }
    }

    fn physics_process(&mut self, _delta: f64) {
        let input = Input::singleton();
        let direction = input.get_axis(
            "move_left".into(),
            "move_right".into(),
        );

        let mut velocity = self.base().get_velocity();
        velocity.x = direction * self.speed;

        // Apply gravity
        if !self.base().is_on_floor() {
            velocity.y += 980.0 * _delta as f32;
        }

        // Jump
        if self.base().is_on_floor()
            && input.is_action_just_pressed("jump".into())
        {
            velocity.y = self.jump_force;
        }

        self.base_mut().set_velocity(velocity);
        self.base_mut().move_and_slide();
    }
}
```

### Key Concepts

- `#[derive(GodotClass)]` registers the struct as a Godot class.
- `#[class(base=CharacterBody2D)]` sets the parent class.
- `Base<T>` is a required field that holds the Godot object pointer.
- `ICharacterBody2D` is the trait for overriding virtual methods (`_init`, `_physics_process`, etc.).
- `self.base()` gives shared access; `self.base_mut()` gives mutable access to the underlying Godot node.

---

## 4. Properties and the Editor

```rust
#[derive(GodotClass)]
#[class(base=Node2D)]
pub struct EnemySpawner {
    base: Base<Node2D>,

    /// Exported to the Inspector
    #[export]
    spawn_interval: f32,

    /// Exported with a range hint
    #[export(range = (1.0, 100.0, 0.5))]
    max_enemies: i32,

    /// Visible in GDScript but not in Inspector
    #[var]
    enemies_alive: i32,

    /// Fully private to Rust
    timer_accumulator: f64,
}
```

- `#[export]` → visible in Inspector AND accessible from GDScript/C#.
- `#[var]` → accessible from GDScript/C# but NOT shown in Inspector.
- No attribute → private to Rust.
- Range hints use `#[export(range = (min, max, step))]`.

---

## 5. Methods, Signals, and Constants

### Exposing Methods

```rust
#[godot_api]
impl EnemySpawner {
    /// Callable from GDScript: spawner.spawn_enemy()
    #[func]
    fn spawn_enemy(&mut self) {
        self.enemies_alive += 1;
        // ... instantiate scene, add_child, etc.
    }

    /// Static method — callable without an instance
    #[func]
    fn max_spawn_rate() -> f32 {
        10.0
    }
}
```

### Declaring Signals

```rust
#[godot_api]
impl EnemySpawner {
    #[signal]
    fn enemy_spawned(enemy_name: GString, position: Vector2);

    #[signal]
    fn wave_complete();
}
```

Emit from Rust:

```rust
self.base_mut().emit_signal(
    "enemy_spawned".into(),
    &["Goblin".to_variant(), Vector2::new(100.0, 200.0).to_variant()],
);
```

### Constants

```rust
#[godot_api]
impl EnemySpawner {
    #[constant]
    const MAX_WAVE_SIZE: i32 = 50;
}
```

Accessible from GDScript as `EnemySpawner.MAX_WAVE_SIZE`.

---

## 6. The .gdextension File

Create `my_extension.gdextension` at your project root:

```ini
[configuration]
entry_symbol = "gdext_rust_init"
compatibility_minimum = 4.4
reloadable = true

[libraries]
linux.debug.x86_64   = "res://bin/libmy_game_rust.so"
linux.release.x86_64  = "res://bin/libmy_game_rust.so"
windows.debug.x86_64  = "res://bin/my_game_rust.dll"
windows.release.x86_64 = "res://bin/my_game_rust.dll"
macos.debug            = "res://bin/libmy_game_rust.dylib"
macos.release          = "res://bin/libmy_game_rust.dylib"
```

- `entry_symbol` must be `gdext_rust_init` (the default generated by the `#[gdextension]` macro).
- `reloadable = true` enables hot-reloading (Godot 4.2+).
- List every platform/architecture you ship.

---

## 7. Calling Between Rust and GDScript

### GDScript → Rust

Any `#[func]` method or `#[var]`/`#[export]` property is callable from GDScript as if it were a native node:

```gdscript
# GDScript
var spawner: EnemySpawner = $EnemySpawner
spawner.spawn_enemy()
print(spawner.enemies_alive)
print(EnemySpawner.MAX_WAVE_SIZE)

spawner.enemy_spawned.connect(_on_enemy_spawned)
```

### Rust → GDScript

Call any GDScript method via the `Callable` or `Object` API:

```rust
fn notify_hud(&self) {
    // Get a node and call a GDScript method on it
    let hud = self.base().get_node_as::<Control>("../HUD");
    hud.call("update_score".into(), &[self.enemies_alive.to_variant()]);
}
```

For type-safe access, define the interface in Rust using `#[derive(GodotClass)]` on both sides — but in practice, using `call()` for Rust → GDScript is common and fine for non-hot-path code.

---

## 8. Working with Godot Types

gdext maps Godot types to Rust types:

| Godot Type | Rust Type | Notes |
|-----------|-----------|-------|
| `int` | `i64` (or `i32` for exports) | |
| `float` | `f64` (or `f32` for exports) | |
| `String` | `GString` | Use `.into()` for conversion |
| `StringName` | `StringName` | Interned strings for signals, actions |
| `Vector2` | `Vector2` | `real` precision matches engine build |
| `Vector3` | `Vector3` | |
| `Array` | `Array<Variant>` | Untyped |
| `Array[T]` | `Array<Gd<T>>` | Typed arrays |
| `Dictionary` | `Dictionary` | |
| `NodePath` | `NodePath` | |
| `Variant` | `Variant` | Wraps any Godot type |
| `Object` | `Gd<T>` | Smart pointer to a Godot object |

### Gd<T> — The Core Smart Pointer

`Gd<T>` is how you hold references to Godot objects in Rust:

```rust
fn find_player(&self) -> Option<Gd<CharacterBody2D>> {
    let tree = self.base().get_tree()?;
    let nodes = tree.get_nodes_in_group("player".into());
    nodes.get(0).and_then(|v| v.try_to::<Gd<CharacterBody2D>>().ok())
}
```

- For **RefCounted** types (Resource, etc.): `Gd<T>` is reference-counted automatically.
- For **Object** types (Node, etc.): the Godot scene tree owns the memory; `Gd<T>` is a borrowed pointer.

---

## 9. Typed Collections (4.4+)

Godot 4.4 introduced typed dictionaries. In gdext, you can work with them:

```rust
use godot::builtin::{Array, Dictionary};

fn create_inventory(&self) -> Dictionary {
    let mut inv = Dictionary::new();
    inv.set("sword".to_variant(), 1.to_variant());
    inv.set("potion".to_variant(), 5.to_variant());
    inv
}

fn process_typed_array(&self) {
    // Typed arrays enforce element types at the Godot boundary
    let mut enemies: Array<Gd<Node2D>> = Array::new();
    // Only Gd<Node2D> (or subtypes) can be inserted
}
```

---

## 10. Singletons and Autoloads

### Registering a Rust Singleton

```rust
#[derive(GodotClass)]
#[class(base=Object, init)]
pub struct GameManager {
    base: Base<Object>,

    #[var]
    score: i32,
}

#[godot_api]
impl GameManager {
    #[func]
    fn add_score(&mut self, points: i32) {
        self.score += points;
    }
}
```

Register as an autoload in Project Settings, or use gdext's built-in singleton registration if supported by your gdext version. In GDScript:

```gdscript
GameManager.add_score(100)
```

---

## 11. Hot Reloading

Godot 4.2+ supports hot-reloading GDExtension libraries. Combined with `cargo watch`, you get a rapid iteration loop:

```bash
# Terminal — auto-recompile on save
cargo watch -w src -x build
```

Requirements:

1. Set `reloadable = true` in your `.gdextension` file.
2. Build output must overwrite the same library path Godot loaded.
3. Godot reloads when the editor regains focus after the file changes.

**Caveats:** Hot reload reconstructs your Rust objects from their serialized Godot state. If you add/remove `#[var]` or `#[export]` fields, a full editor restart is safer. In-game (non-editor) hot reload is not supported.

---

## 12. Performance Patterns

### Use Rust for Computational Inner Loops

```rust
use godot::prelude::*;
use godot::classes::{Node, INode};

#[derive(GodotClass)]
#[class(base=Node, init)]
pub struct VoxelMesher {
    base: Base<Node>,
}

#[godot_api]
impl VoxelMesher {
    /// Called from GDScript — heavy computation stays in Rust
    #[func]
    fn generate_chunk(&self, chunk_data: PackedByteArray) -> Array<Variant> {
        let bytes = chunk_data.to_vec();

        // Perform CPU-intensive mesh generation in Rust
        let vertices = self.build_mesh_from_voxels(&bytes);

        // Convert back to Godot types
        let mut result = Array::new();
        for v in vertices {
            result.push(v.to_variant());
        }
        result
    }
}
```

### Rayon for Parallel Work

```rust
use rayon::prelude::*;

fn generate_all_chunks(&self, chunks: &[ChunkData]) -> Vec<MeshData> {
    // Parallel iteration — uses all CPU cores
    chunks.par_iter()
        .map(|chunk| self.build_mesh_from_voxels(&chunk.data))
        .collect()
}
```

Add to `Cargo.toml`:

```toml
[dependencies]
rayon = "1.10"
```

**Important:** Godot API calls are NOT thread-safe. Do all Godot interaction on the main thread. Use Rust threads/rayon only for pure computation, then pass results back.

### Avoid Variant Conversion in Hot Paths

`to_variant()` and `try_to::<T>()` involve allocation. For high-frequency calls, prefer typed `#[func]` parameters:

```rust
// Good — no Variant boxing
#[func]
fn move_to(&mut self, target: Vector2, speed: f32) { ... }

// Avoid in hot paths — Variant round-trip
#[func]
fn process_data(&self, data: Variant) { ... }
```

---

## 13. Cross-Platform Builds

### Build Script Example

```bash
#!/bin/bash
# build_all.sh — cross-compile for all desktop platforms

# Native (your platform)
cargo build --release

# Linux from macOS/Windows (requires cross or a Docker toolchain)
cross build --release --target x86_64-unknown-linux-gnu

# Windows from Linux/macOS
cross build --release --target x86_64-pc-windows-gnu
```

[cross](https://github.com/cross-rs/cross) uses Docker containers with pre-configured toolchains for each target.

### CI/CD with GitHub Actions

```yaml
# .github/workflows/build.yml
name: Build GDExtension
on: [push, pull_request]

jobs:
  build:
    strategy:
      matrix:
        include:
          - os: ubuntu-latest
            target: x86_64-unknown-linux-gnu
            artifact: libmy_game_rust.so
          - os: windows-latest
            target: x86_64-pc-windows-msvc
            artifact: my_game_rust.dll
          - os: macos-latest
            target: x86_64-apple-darwin
            artifact: libmy_game_rust.dylib

    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - run: cargo build --release --manifest-path rust/Cargo.toml
      - uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.target }}
          path: rust/target/release/${{ matrix.artifact }}
```

---

## 14. Testing

### Unit Tests (Pure Rust)

Test computation logic without Godot:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_damage_calculation() {
        let result = calculate_damage(10.0, 3.0, 0.5);
        assert!((result - 6.5).abs() < f32::EPSILON);
    }
}
```

Run with `cargo test`.

### Integration Tests (with Godot)

gdext provides an integration test framework that boots a headless Godot instance:

```rust
use godot::test::itest;

#[itest]
fn test_spawner_creates_enemies(ctx: &TestContext) {
    let mut spawner = EnemySpawner::new_alloc();
    spawner.bind_mut().spawn_enemy();
    assert_eq!(spawner.bind().enemies_alive, 1);
    spawner.free();
}
```

Run integration tests via the Godot editor or a headless export.

---

## 15. Common Mistakes

### Calling Godot APIs from Rust Threads

```rust
// WRONG — Godot APIs are not thread-safe
std::thread::spawn(|| {
    let node = some_gd_ref.get_node("Child".into()); // crash or UB
});

// CORRECT — compute in thread, interact with Godot on main thread
let result = std::thread::spawn(|| heavy_computation()).join().unwrap();
self.base_mut().call_deferred("apply_result".into(), &[result.to_variant()]);
```

### Forgetting `base: Base<T>`

Every `#[derive(GodotClass)]` struct that inherits a Godot class MUST have a `base: Base<T>` field. Without it, the macro fails to compile.

### String Type Confusion

Godot has `String` (heap-allocated), `StringName` (interned), and `NodePath`. gdext uses `GString`, `StringName`, and `NodePath` respectively. Use `.into()` for conversions:

```rust
let action: StringName = "jump".into();
let path: NodePath = "Enemies/Goblin".into();
let label: GString = "Score: 100".into();
```

### Not Setting `crate-type = ["cdylib"]`

Without this in `Cargo.toml`, cargo produces an `.rlib` (Rust library) instead of a shared library. Godot cannot load `.rlib` files.

### Ignoring the Borrow Checker with Gd<T>

`Gd<T>` uses an internal cell for borrowing. Attempting to `bind()` (shared borrow) while a `bind_mut()` (mutable borrow) is active will panic at runtime:

```rust
// WRONG — double borrow
let shared = obj.bind();
let mutable = obj.bind_mut(); // PANIC: already borrowed

// CORRECT — drop the shared borrow first
{
    let shared = obj.bind();
    // use shared...
} // dropped here
let mutable = obj.bind_mut(); // OK
```

---

## 16. C# Interop Notes

Rust GDExtension classes appear in the Godot class hierarchy just like C++ extensions. C# can interact with them through the standard Godot C# API:

```csharp
// C# — calling a Rust-defined node
var spawner = GetNode<EnemySpawner>("EnemySpawner");
spawner.SpawnEnemy();         // calls Rust #[func]
GD.Print(spawner.EnemiesAlive); // reads Rust #[var]

// Connect to a Rust signal
spawner.EnemySpawned += OnEnemySpawned;
```

The communication uses Godot's object system — there is no direct Rust↔C# FFI. This means `Variant` conversion applies at the boundary, which is fine for gameplay logic but avoid it in tight loops.

---

## Summary — When to Reach for Rust

| Scenario | Recommended |
|----------|-------------|
| Gameplay logic, UI, scene scripting | GDScript or C# |
| Performance-critical computation | Rust (gdext) or C++ (godot-cpp) |
| Wrapping a Rust crate (noise, ECS, networking) | Rust (gdext) |
| Wrapping a C/C++ library | C++ (godot-cpp) |
| Team knows Rust, wants memory safety | Rust (gdext) |
| Team knows C++, needs source-level engine debugging | C++ (godot-cpp) |

Start with GDScript for prototyping. Profile. Move hot paths to Rust when needed. The `#[func]` boundary makes it easy to call Rust from GDScript — you don't need to rewrite your whole game.
