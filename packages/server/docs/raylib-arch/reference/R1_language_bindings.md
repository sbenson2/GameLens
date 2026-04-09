# R1 — Raylib Language Bindings Reference

> **Category:** reference · **Engine:** Raylib · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Getting Started](../guides/G1_getting_started.md) · [Raylib Rules](../raylib-arch-rules.md)

---

## Why 70+ Language Bindings Exist

Raylib is written in C99 with a flat, header-only public API (`raylib.h`). This makes it trivially bindable through any language's Foreign Function Interface (FFI). The community has produced **over 70 bindings** — more than almost any other game library.

The key design choices that enable this:

1. **No C++ classes or templates** — plain C structs and functions only
2. **No callbacks required for basic usage** — poll-based input, immediate-mode drawing
3. **No hidden global state beyond the window context** — one `InitWindow()`, one `CloseWindow()`
4. **Simple value types** — `Vector2`, `Color`, `Rectangle` are small structs passed by value

---

## Tier 1: Mature Bindings (Updated to Raylib 5.5+)

These bindings track the latest raylib release, have active maintainers, and are used in production:

### C# — `Raylib-CSharp`

- **Repo:** [github.com/MrScautHD/Raylib-CSharp](https://github.com/MrScautHD/Raylib-CSharp)
- **Install:** `dotnet add package Raylib-CSharp`
- **Notes:** Auto-generated from raylib headers, covers raylib + raymath + rlgl. Works with .NET 8+.

```csharp
using Raylib_CSharp;
using Raylib_CSharp.Windowing;

Window.Init(800, 600, "Hello Raylib");
while (!Window.ShouldClose()) {
    Graphics.BeginDrawing();
    Graphics.ClearBackground(Color.RayWhite);
    Graphics.DrawText("Hello from C#!", 190, 200, 20, Color.Maroon);
    Graphics.EndDrawing();
}
Window.Close();
```

Also available: **raylib-cs** (older, widely used) — `dotnet add package Raylib-cs`.

### Python — `raylib-python-cffi`

- **Repo:** [github.com/electronstudio/raylib-python-cffi](https://github.com/electronstudio/raylib-python-cffi)
- **Install:** `pip install raylib`
- **Notes:** Provides both a low-level C-like API and a Pythonic wrapper. Pre-built wheels for Windows, macOS, Linux.

```python
import pyray as rl

rl.init_window(800, 600, "Hello Raylib")
while not rl.window_should_close():
    rl.begin_drawing()
    rl.clear_background(rl.RAYWHITE)
    rl.draw_text("Hello from Python!", 190, 200, 20, rl.MAROON)
    rl.end_drawing()
rl.close_window()
```

### Rust — `raylib-rs`

- **Repo:** [github.com/deltaphc/raylib-rs](https://github.com/deltaphc/raylib-rs)
- **Install:** Add `raylib = "5"` to `Cargo.toml`
- **Notes:** Provides safe Rust wrappers with builder patterns. Compiles raylib from source via build script.

```rust
use raylib::prelude::*;

fn main() {
    let (mut rl, thread) = raylib::init()
        .size(800, 600)
        .title("Hello Raylib")
        .build();

    while !rl.window_should_close() {
        let mut d = rl.begin_drawing(&thread);
        d.clear_background(Color::RAYWHITE);
        d.draw_text("Hello from Rust!", 190, 200, 20, Color::MAROON);
    }
}
```

### Go — `raylib-go`

- **Repo:** [github.com/gen2brain/raylib-go](https://github.com/gen2brain/raylib-go)
- **Install:** `go get github.com/gen2brain/raylib-go/raylib`
- **Notes:** CGo bindings with pre-built libraries for major platforms.

```go
package main

import rl "github.com/gen2brain/raylib-go/raylib"

func main() {
    rl.InitWindow(800, 600, "Hello Raylib")
    defer rl.CloseWindow()

    for !rl.WindowShouldClose() {
        rl.BeginDrawing()
        rl.ClearBackground(rl.RayWhite)
        rl.DrawText("Hello from Go!", 190, 200, 20, rl.Maroon)
        rl.EndDrawing()
    }
}
```

### Zig — `raylib-zig`

- **Repo:** [github.com/Not-Nik/raylib-zig](https://github.com/Not-Nik/raylib-zig)
- **Notes:** First-class Zig build system integration. Raylib compiles as a Zig package with no external toolchain.

### Nim — `naylib`

- **Repo:** [github.com/planetis-m/naylib](https://github.com/planetis-m/naylib)
- **Install:** `nimble install naylib`
- **Notes:** Idiomatic Nim API with distinct types, destructors, and operator overloads.

### Odin — Built-in

- Raylib bindings ship with the **Odin compiler's vendor library collection** — no separate install needed.
- **Docs:** [odin-lang.org/docs/vendor](https://odin-lang.org/docs/vendor/)

---

## Tier 2: Active Bindings (Updated to 5.0+)

These are maintained and functional but may lag a release behind or have smaller communities:

| Language | Binding | Install / Notes |
|----------|---------|-----------------|
| **Java** | jaylib | JNI-based, supports Java 17+ |
| **Lua** | raylib-lua, raylua | LuaJIT FFI or C binding |
| **D** | raylib-d | dub package, auto-generated |
| **Crystal** | raylib-cr | shard, idiomatic Crystal API |
| **Haskell** | h-raylib | Cabal/Stack, covers full API |
| **OCaml** | raylib-ocaml | opam package |
| **Swift** | raylib-swift | Swift Package Manager |
| **Julia** | Raylib.jl | Julia package registry |
| **Ruby** | raylib-bindings | `gem install raylib-bindings` |
| **V** | raylib-v | vlang module |
| **Fortran** | fortran-raylib | Modern Fortran (2018) interface |
| **Pascal/FPC** | raylib-pascal | Free Pascal compatible |

---

## Tier 3: Experimental / Niche

Bindings exist for languages including Ada, BQN, COBOL, Brainfuck (raybit), Scheme, Racket, Elixir, Erlang, Nelua, Wren, and more. These are community-maintained and may not cover the full API. See the [official BINDINGS.md](https://github.com/raysan5/raylib/blob/master/BINDINGS.md) for the complete list.

---

## Choosing a Binding

**For game jams and prototyping:** Python (`pip install raylib`) has the fastest setup time. Zero compilation, works immediately.

**For performance-critical games:** Rust (`raylib-rs`) or Zig (`raylib-zig`) give you native performance with memory safety. Go (`raylib-go`) is a good middle ground.

**For .NET ecosystems:** `Raylib-CSharp` or `raylib-cs` integrate with NuGet and standard C# tooling.

**For learning:** Pick whatever language you already know. The API translates almost 1:1 across all bindings because raylib's C API is so straightforward.

---

## API Translation Pattern

Raylib bindings follow a predictable naming translation from the C API:

| C (raylib.h) | Python (pyray) | Rust (raylib-rs) | C# (Raylib-CSharp) | Go (raylib-go) |
|--------------|----------------|-------------------|---------------------|-----------------|
| `InitWindow()` | `init_window()` | `raylib::init().build()` | `Window.Init()` | `rl.InitWindow()` |
| `DrawCircle()` | `draw_circle()` | `d.draw_circle()` | `Graphics.DrawCircle()` | `rl.DrawCircle()` |
| `Color RED` | `rl.RED` | `Color::RED` | `Color.Red` | `rl.Red` |
| `Vector2 {x, y}` | `Vector2(x, y)` | `Vector2::new(x, y)` | `new Vector2(x, y)` | `rl.NewVector2(x, y)` |

The mental model is: **learn the C API once, use it everywhere**. Binding-specific idioms (builders in Rust, snake_case in Python) are thin wrappers over the same function signatures.

---

## Building Raylib from Source for Custom Bindings

If your language has an FFI but no existing binding, you can create one from `raylib.h`:

```bash
# Build raylib as a shared library for FFI
git clone https://github.com/raysan5/raylib.git
cd raylib/src
make RAYLIB_LIBTYPE=SHARED RAYLIB_MODULE_RAYGUI=TRUE

# Produces libraylib.so (Linux), libraylib.dylib (macOS), raylib.dll (Windows)
```

The shared library exports ~500 functions with C linkage. Point your language's FFI loader at it and map the function signatures from `raylib.h`.

For auto-generation, the [`raylib_parser`](https://github.com/raysan5/raylib/tree/master/parser) tool outputs function/struct definitions as JSON — useful for code-generating bindings.

---

## Companion Libraries

These optional add-ons also have multi-language bindings:

| Library | Purpose | Binding Coverage |
|---------|---------|------------------|
| **raygui** | Immediate-mode GUI toolkit | Most Tier 1 bindings include it |
| **raymath** | Vector/matrix math | Included in all bindings |
| **rlgl** | Low-level OpenGL abstraction | Available in C#, Rust, Python |
| **rres** | Resource packaging | Limited binding coverage |
