# G6 — Raylib Web Export & Cross-Platform Building

> **Category:** guide · **Engine:** Raylib · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Language Bindings](../reference/R1_language_bindings.md) · [Raylib Rules](../raylib-arch-rules.md)

---

## Overview

Raylib's zero-dependency, C99 design makes it one of the simplest game libraries to compile across platforms — including the web via Emscripten/WebAssembly. This guide covers building for native desktop targets (Windows, Linux, macOS), web (HTML5/WASM), and the key differences in your game loop for each.

---

## Desktop Builds (Windows, Linux, macOS)

### CMake (Recommended)

CMake is the recommended build system for modern raylib projects. It generates project files for your IDE or build tool of choice.

```bash
# Clone raylib (if building from source)
git clone https://github.com/raysan5/raylib.git
cd raylib

# Configure and build
mkdir build && cd build
cmake ..
make -j$(nproc)
sudo make install  # Linux/macOS — installs to /usr/local
```

Then in your game project, link against raylib:

```cmake
cmake_minimum_required(VERSION 3.15)
project(my_game)

find_package(raylib 5.5 REQUIRED)

add_executable(my_game main.c)
target_link_libraries(my_game raylib)
```

### Makefile

Raylib ships ready-made Makefiles. Set `PLATFORM` to target different systems:

```bash
# In raylib/src/
make PLATFORM=PLATFORM_DESKTOP   # Default: native desktop
```

Then compile your game by pointing at the raylib headers and library:

```bash
gcc -o my_game main.c -lraylib -lGL -lm -lpthread -ldl -lrt -lX11  # Linux
gcc -o my_game main.c -lraylib -framework OpenGL -framework Cocoa    # macOS
```

### Linux: Wayland Support

Raylib uses GLFW for windowing. To build with Wayland support instead of X11:

```bash
cmake .. -DGLFW_BUILD_WAYLAND=ON
```

Both X11 and Wayland are supported. The default is X11 unless explicitly configured.

---

## Web Builds (HTML5 / WebAssembly)

Web export is one of raylib's best features for distribution — no install required, runs in any modern browser.

### Prerequisites: Emscripten SDK

```bash
git clone https://github.com/emscripten-core/emsdk.git
cd emsdk
./emsdk install latest
./emsdk activate latest
source ./emsdk_env.sh   # Activate in current shell (add to .bashrc for persistence)
```

### Step 1: Build Raylib for Web

```bash
cd raylib/src
make PLATFORM=PLATFORM_WEB -B
```

Or with CMake:

```bash
mkdir build_web && cd build_web
emcmake cmake .. -DPLATFORM=Web
emmake make
```

This produces `libraylib.a` compiled for WebAssembly.

### Step 2: Adapt Your Game Loop

**This is the most important change.** Browsers cannot run a blocking `while` loop — they need control returned each frame. Raylib provides `SetTargetFPS()` and Emscripten provides `emscripten_set_main_loop()`.

```c
#include "raylib.h"

#ifdef PLATFORM_WEB
    #include <emscripten/emscripten.h>
#endif

void UpdateDrawFrame(void) {
    // --- Update ---
    // Game logic here

    // --- Draw ---
    BeginDrawing();
    ClearBackground(RAYWHITE);
    DrawText("Hello from the web!", 190, 200, 20, MAROON);
    EndDrawing();
}

int main(void) {
    InitWindow(800, 450, "Raylib Web Game");

#ifdef PLATFORM_WEB
    emscripten_set_main_loop(UpdateDrawFrame, 60, 1);
#else
    SetTargetFPS(60);
    while (!WindowShouldClose()) {
        UpdateDrawFrame();
    }
#endif

    CloseWindow();
    return 0;
}
```

**Key pattern:** Extract your update+draw into a single function. On desktop, call it in a loop. On web, hand it to `emscripten_set_main_loop()`.

### Step 3: Compile with emcc

```bash
emcc -o game.html main.c \
    -I path/to/raylib/src \
    -L path/to/raylib/src \
    -lraylib \
    -s USE_GLFW=3 \
    -s WASM=1 \
    -s ASYNCIFY \
    -s ASSERTIONS=1 \
    -DPLATFORM_WEB \
    --shell-file path/to/raylib/src/minshell.html \
    --preload-file resources
```

### Essential Emscripten Flags

| Flag | Purpose |
|------|---------|
| `-s USE_GLFW=3` | Use Emscripten's built-in GLFW 3 implementation for window/input |
| `-s WASM=1` | Compile to WebAssembly (not asm.js) — faster, smaller |
| `-s ASYNCIFY` | Allow synchronous C code to yield to the browser event loop |
| `-s ASSERTIONS=1` | Enable runtime checks (disable for release: `-s ASSERTIONS=0`) |
| `-DPLATFORM_WEB` | Preprocessor define so your code can `#ifdef` for web |
| `--shell-file` | Custom HTML template — raylib provides `minshell.html` |
| `--preload-file resources` | Bundle the `resources/` directory into the WASM virtual filesystem |
| `-Os` | Optimize for size (good for web distribution) |

### Step 4: Serve and Test

The output is `game.html`, `game.js`, `game.wasm`, and optionally `game.data` (preloaded assets). Serve with any HTTP server:

```bash
python3 -m http.server 8080
# Open http://localhost:8080/game.html
```

> **Note:** WASM files require proper MIME types (`application/wasm`). Python's built-in server handles this correctly. Opening `game.html` directly via `file://` will not work due to browser security restrictions.

---

## Web Build Gotchas

### File I/O
The browser has no real filesystem. Use `--preload-file` or `--embed-file` to bundle assets at compile time. Runtime file writes go to an in-memory virtual filesystem that does not persist.

### Audio
Browser autoplay policies block audio until a user interaction (click/tap). Raylib handles this internally, but your first sound may be delayed until the user interacts with the page.

### Window Sizing
`SetWindowSize()` and `ToggleFullscreen()` work differently on web. The canvas is embedded in HTML, so its size is controlled by the HTML/CSS container. Use `SetWindowSize()` to set the initial canvas resolution.

### Memory
WASM runs in a sandboxed linear memory. Large asset files can exhaust the default memory. Increase with:

```bash
-s TOTAL_MEMORY=67108864   # 64 MB
-s ALLOW_MEMORY_GROWTH=1   # Auto-grow (small perf cost)
```

### Threading
`pthreads` require `SharedArrayBuffer`, which needs specific HTTP headers (`Cross-Origin-Opener-Policy`, `Cross-Origin-Embedder-Policy`). Most raylib games don't need threads on web — the single-threaded path works fine.

---

## Cross-Compilation Tips

### Conditional Code Pattern

Use `PLATFORM_WEB` to gate platform-specific behavior:

```c
#ifdef PLATFORM_WEB
    // Web-specific: smaller default resolution, touch input
    InitWindow(480, 320, "My Game");
#else
    // Desktop: larger window, keyboard-focused
    InitWindow(1280, 720, "My Game");
#endif
```

### Asset Pipeline

Keep assets in a `resources/` directory at the project root. On desktop, raylib loads them relative to the working directory. On web, `--preload-file resources` bundles them into the WASM virtual filesystem at the same relative path — so `LoadTexture("resources/player.png")` works identically on both platforms.

### CI/CD for Multi-Platform

A typical GitHub Actions or GitLab CI setup builds three targets:

1. **Desktop** (Linux/Windows/macOS) — standard CMake + GCC/MSVC/Clang
2. **Web** — Emscripten SDK action + `emcmake cmake`
3. **Artifacts** — upload `game.html` + `game.js` + `game.wasm` to GitHub Pages or itch.io

---

## Quick Reference: Build Commands

| Target | Build Command |
|--------|--------------|
| Linux (X11) | `gcc main.c -lraylib -lGL -lm -lpthread -ldl -lrt -lX11` |
| macOS | `gcc main.c -lraylib -framework OpenGL -framework Cocoa` |
| Windows (MSVC) | `cl main.c raylib.lib` |
| Web (emcc) | `emcc main.c -lraylib -s USE_GLFW=3 -s WASM=1 -s ASYNCIFY -DPLATFORM_WEB` |
| Web (CMake) | `emcmake cmake .. -DPLATFORM=Web && emmake make` |
