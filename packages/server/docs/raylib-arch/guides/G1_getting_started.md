# G1 — Raylib Multi-Language Bindings Guide

> **Category:** guide · **Engine:** Raylib · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Raylib Rules](../raylib-arch-rules.md)

---

## Why Bindings Matter for Raylib

Raylib's C99 API and zero-dependency design make it trivially easy to create foreign function interface (FFI) bindings. The result: **70+ language bindings** maintained by the community. This is one of raylib's strongest differentiators — you can use it from virtually any language.

This guide covers the most popular and actively maintained bindings, with setup instructions and idiomatic examples for each.

---

## Tier 1: Actively Maintained, Production-Ready

These bindings track the latest raylib release (5.5 as of early 2026) and have active maintainers.

### C# — Raylib-CsLo / Raylib-cs

```bash
# .NET project
dotnet add package Raylib-cs
```

```csharp
using Raylib_cs;

Raylib.InitWindow(800, 600, "Raylib C#");
Raylib.SetTargetFPS(60);

while (!Raylib.WindowShouldClose()) {
    Raylib.BeginDrawing();
    Raylib.ClearBackground(Color.RayWhite);
    Raylib.DrawText("Hello from C#!", 190, 200, 20, Color.Maroon);
    Raylib.EndDrawing();
}
Raylib.CloseWindow();
```

**Notes:** Raylib-cs provides 1:1 API mapping. Struct layouts match the C originals for zero-copy interop.

### Python — raylib-python-cffi

```bash
pip install raylib
```

```python
import pyray as rl

rl.init_window(800, 600, "Raylib Python")
rl.set_target_fps(60)

while not rl.window_should_close():
    rl.begin_drawing()
    rl.clear_background(rl.RAYWHITE)
    rl.draw_text("Hello from Python!", 190, 200, 20, rl.MAROON)
    rl.end_drawing()

rl.close_window()
```

**Notes:** Uses CFFI for native performance. API follows Python snake_case conventions via auto-generated wrappers. Supports raylib 5.5.

### Go — raylib-go

```bash
go get github.com/gen2brain/raylib-go/raylib
```

```go
package main

import rl "github.com/gen2brain/raylib-go/raylib"

func main() {
    rl.InitWindow(800, 600, "Raylib Go")
    defer rl.CloseWindow()
    rl.SetTargetFPS(60)

    for !rl.WindowShouldClose() {
        rl.BeginDrawing()
        rl.ClearBackground(rl.RayWhite)
        rl.DrawText("Hello from Go!", 190, 200, 20, rl.Maroon)
        rl.EndDrawing()
    }
}
```

**Notes:** CGo-based binding. Compiles raylib from source as part of the Go build. Works on Windows, macOS, Linux, and Android.

### Rust — raylib-rs

```toml
# Cargo.toml
[dependencies]
raylib = "5"
```

```rust
use raylib::prelude::*;

fn main() {
    let (mut rl, thread) = raylib::init()
        .size(800, 600)
        .title("Raylib Rust")
        .build();

    rl.set_target_fps(60);

    while !rl.window_should_close() {
        let mut d = rl.begin_drawing(&thread);
        d.clear_background(Color::RAYWHITE);
        d.draw_text("Hello from Rust!", 190, 200, 20, Color::MAROON);
    }
}
```

**Notes:** Provides Rust-idiomatic wrappers (RAII, builder pattern, `&thread` for thread safety). The `thread` handle enforces single-threaded OpenGL access at compile time.

### Zig — raylib-zig

```zig
// build.zig.zon — add raylib-zig dependency
// Then in your code:
const rl = @import("raylib");

pub fn main() void {
    rl.initWindow(800, 600, "Raylib Zig");
    defer rl.closeWindow();
    rl.setTargetFPS(60);

    while (!rl.windowShouldClose()) {
        rl.beginDrawing();
        defer rl.endDrawing();
        rl.clearBackground(rl.Color.ray_white);
        rl.drawText("Hello from Zig!", 190, 200, 20, rl.Color.maroon);
    }
}
```

**Notes:** Native Zig build system integration — compiles raylib C sources directly via Zig's C compiler. No system dependencies needed.

---

## Tier 2: Well-Maintained, Smaller Communities

| Language | Binding | Install | Notes |
|----------|---------|---------|-------|
| **Nim** | naylib | `nimble install naylib` | Idiomatic Nim API, compiles raylib from source |
| **Java** | jaylib | Maven/Gradle | JNI-based, suitable for desktop games |
| **Lua** | raylib-lua | Bundled with raylib | Embedded scripting for rapid prototyping |
| **D** | raylib-d | `dub add raylib-d` | D language binding with betterC support |
| **Crystal** | raylib-cr | `shards install` | Crystal-idiomatic wrapper |
| **Fortran** | fortran-raylib | Manual build | Yes, Fortran — game dev with modern Fortran |
| **V** | vraylib | `v install vraylib` | V language binding |
| **Odin** | vendor:raylib | Built into Odin | First-class support in Odin's vendor collection |

---

## Tier 3: Experimental / Less Active

Additional bindings exist for: Ada, C3, Clojure, Common Lisp, Dart, Elixir, F#, Free Pascal, Gleam, Haskell, Janet, Julia, Kotlin/Native, Mojo, Node.js (N-API), OCaml, Perl, PHP, R, Ring, Ruby, Scala Native, Swift, Tcl, and others.

The full list is maintained at [github.com/raysan5/raylib/blob/master/BINDINGS.md](https://github.com/raysan5/raylib/blob/master/BINDINGS.md).

---

## Choosing a Binding

### Decision Factors

1. **Binding freshness** — Does it support the latest raylib release? Check the binding's README for the targeted raylib version.
2. **API style** — Some bindings are 1:1 C translations; others provide idiomatic wrappers (Rust's RAII, Python's snake_case). Idiomatic wrappers are easier to use but may lag behind new raylib features.
3. **Build complexity** — Zig and Go bindings compile raylib from source automatically. C# and Python use prebuilt binaries. Others may require you to install raylib system-wide first.
4. **Platform support** — Most bindings support desktop (Windows, macOS, Linux). Mobile and web support varies. Check binding docs for platform matrix.

### Binding Architecture Patterns

Most bindings follow one of these FFI patterns:

| Pattern | Languages | How It Works |
|---------|-----------|-------------|
| **Static linking** | Zig, Go, Odin | Compiles raylib C code directly alongside your code |
| **Dynamic linking** | Python, C#, Java | Links against a prebuilt `raylib.so` / `raylib.dll` / `raylib.dylib` |
| **Embedded C compilation** | Nim, Crystal | Binding's build tool compiles raylib C sources as part of the build |

---

## Common Patterns Across Bindings

Regardless of language, raylib code follows the same structure:

```
1. InitWindow(width, height, title)
2. [Load resources]
3. Main loop:
   a. BeginDrawing()
   b. ClearBackground(color)
   c. [Draw stuff]
   d. EndDrawing()
4. [Unload resources]
5. CloseWindow()
```

This consistency means raylib tutorials and examples in C translate directly to any binding. If you find a C example doing what you need, you can port it line-by-line to your language's binding.

---

## Tips for Working with Bindings

1. **Start with official C examples** — Raylib ships 120+ examples. Find the one closest to what you need, then translate to your language.
2. **Check the raylib cheatsheet** — [raylib.com/cheatsheet/cheatsheet.html](https://www.raylib.com/cheatsheet/cheatsheet.html) lists every function. Your binding should have equivalents for all of them.
3. **Memory management** — In GC'd languages (Python, Go, C#, Java), loaded resources (textures, sounds, models) still hold native memory. Always call the `Unload*` equivalents when done.
4. **Thread safety** — Raylib is not thread-safe. All raylib calls must happen on the main thread. Some bindings (Rust) enforce this at compile time; others leave it to you.
5. **Struct passing** — Some bindings pass raylib structs by value (matching C behavior), others use references. Check your binding's conventions for `Vector2`, `Color`, `Rectangle`, etc.
