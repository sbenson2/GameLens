# R1 — Cross-Compilation Model

> **Category:** reference · **Engine:** HaxeFlixel · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Getting Started](../guides/G1_getting_started.md) · [HaxeFlixel Rules](../haxeflixel-arch-rules.md)

HaxeFlixel's defining feature is cross-compilation: a single Haxe codebase compiles to native C++ binaries, JavaScript for web, and more — without a virtual machine on native targets. This reference explains the full compilation pipeline, each target's characteristics, and how to write platform-aware code.

---

## The Compilation Pipeline

HaxeFlixel sits on a three-layer stack. Each layer handles a different concern:

```
┌─────────────────────────────────────────────────┐
│  HaxeFlixel (game framework)                    │
│  Sprites, states, collision, tilemaps, cameras   │
├─────────────────────────────────────────────────┤
│  OpenFL (display + multimedia API)               │
│  Display list, BitmapData, Sound, TextField      │
├─────────────────────────────────────────────────┤
│  Lime (low-level platform layer)                 │
│  Windowing, OpenGL context, input, file I/O      │
├─────────────────────────────────────────────────┤
│  Haxe Compiler (transpilation)                   │
│  Haxe source → target language source/bytecode   │
├─────────────────────────────────────────────────┤
│  Native Toolchain / Runtime                      │
│  hxcpp+GCC/MSVC/Clang  |  Browser JS engine      │
└─────────────────────────────────────────────────┘
```

When you run `lime test windows`, this happens:

1. **Lime** reads `Project.xml` to determine targets, libraries, assets, and compiler flags.
2. **Haxe compiler** transpiles all `.hx` source (HaxeFlixel + OpenFL + Lime + your game) into C++ source files.
3. **hxcpp** invokes the platform's native C++ compiler (MSVC on Windows, Clang on macOS, GCC on Linux) to compile the generated C++ into a native binary.
4. **Lime** bundles the binary with assets and platform metadata into the final executable.

For the HTML5 target, step 2 outputs JavaScript instead of C++, and steps 3–4 produce a web page with a `<canvas>` element.

---

## Target Reference

### Desktop Targets (C++ via hxcpp)

| Target | Command | Compiler | Output |
|--------|---------|----------|--------|
| Windows | `lime test windows` | MSVC (Visual Studio Build Tools) | `.exe` binary |
| macOS | `lime test mac` | Clang (Xcode Command Line Tools) | `.app` bundle |
| Linux | `lime test linux` | GCC | ELF binary |

All desktop targets compile Haxe → C++ → native machine code. The resulting binaries have **no runtime dependency** on Haxe, Java, or any VM. SDL2 is statically linked and handles windowing, OpenGL context creation, input, and audio at the native level.

**Performance characteristics:** Near-native C++ performance. The hxcpp runtime includes a conservative garbage collector. Frame rates are comparable to hand-written C++ SDL2 games for typical 2D workloads.

**Build times:** First build compiles the entire hxcpp runtime + generated code (several minutes). Subsequent builds use incremental compilation and are significantly faster.

### HTML5 Target (JavaScript)

| Target | Command | Output |
|--------|---------|--------|
| HTML5 | `lime test html5` | `index.html` + `.js` bundle |

The Haxe compiler outputs JavaScript that runs in any modern browser. OpenFL renders via **WebGL** by default (with Canvas2D fallback). The resulting page includes a `<canvas>` element that HaxeFlixel draws into.

**Performance characteristics:** Good for 2D games with moderate entity counts. JavaScript JIT compilers optimize the generated code well. WebGL provides hardware-accelerated rendering. The main limitation is garbage collection pauses in the browser, which can cause micro-stutters in frame-sensitive games.

**Debugging:** Use `lime test html5 -debug` to generate source maps. Browser DevTools can then show the original Haxe source alongside the generated JavaScript.

**Gotchas:**
- `Sys` class is not available on HTML5 (no filesystem access, no process spawning).
- Threads are not supported — use callbacks or Haxe's async workflows.
- Asset loading is asynchronous on web (unlike synchronous `Gdx.files.internal()` on native).

### Mobile Targets

| Target | Command | Toolchain Required | Output |
|--------|---------|-------------------|--------|
| Android | `lime test android` | Android NDK + SDK | `.apk` |
| iOS | `lime test ios` | Xcode + hxcpp | `.ipa` (Xcode project) |

Mobile targets also compile via hxcpp → C++. **Android** uses the NDK to produce a native shared library (`.so`) loaded by a thin Java activity wrapper. **iOS** compiles to C++ and builds via Xcode.

**No virtual machine is involved on either platform.** The binary runs natively, using SDL2 for the OpenGL ES context, touch input, and audio.

---

## Platform Conditionals

Haxe's conditional compilation lets you write platform-specific code without runtime checks:

```haxe
class PlatformUtils {
    public static function getStoragePath():String {
        #if html5
        return "";  // Web has no filesystem — use SharedObject or localStorage
        #elseif android
        return lime.system.System.applicationStorageDirectory;
        #elseif ios
        return lime.system.System.applicationStorageDirectory;
        #elseif desktop
        return Sys.getCwd() + "saves/";
        #else
        return "";
        #end
    }

    public static function isMobile():Bool {
        #if (android || ios)
        return true;
        #else
        return false;
        #end
    }
}
```

### Available Conditional Flags

| Flag | When Set |
|------|----------|
| `html5` | Compiling for HTML5 (JavaScript target) |
| `cpp` | Compiling to C++ (any native target) |
| `desktop` | Windows, macOS, or Linux |
| `windows` | Windows specifically |
| `mac` | macOS specifically |
| `linux` | Linux specifically |
| `android` | Android |
| `ios` | iOS |
| `mobile` | Android or iOS |
| `debug` | Debug build (`-debug` flag) |
| `release` | Release build (no `-debug` flag) |
| `web` | Alias for `html5` |

Combine flags with boolean operators: `#if (cpp && !android)`, `#if (html5 || flash)`.

---

## Project.xml Configuration

`Project.xml` is the Lime build configuration file. It controls which targets are built, what libraries are included, and how assets are packaged.

### Key Sections

```xml
<?xml version="1.0" encoding="utf-8"?>
<project>
    <!-- Project metadata -->
    <meta title="My Game" package="com.example.mygame" version="1.0.0" />

    <!-- Application settings -->
    <app main="Main" file="MyGame" path="export" />

    <!-- Window configuration -->
    <window width="640" height="480" fps="60" background="#000000" />

    <!-- Source code location -->
    <source path="source" />

    <!-- Asset directories -->
    <assets path="assets/images" rename="images" />
    <assets path="assets/sounds" rename="sounds" include="*.ogg" if="html5" />
    <assets path="assets/sounds" rename="sounds" include="*.wav" unless="html5" />

    <!-- Libraries -->
    <haxelib name="flixel" />
    <haxelib name="flixel-addons" />

    <!-- Platform-specific settings -->
    <section if="html5">
        <define name="canvas" />
    </section>

    <section if="android">
        <config:android permission="android.permission.VIBRATE" />
    </section>
</project>
```

### Asset Handling by Target

Assets are included differently per target:

- **Native (C++):** Assets are copied to the `export/<target>/bin/` directory alongside the executable. Loaded synchronously via the filesystem.
- **HTML5:** Assets are embedded in the build or loaded over HTTP. Large assets should use OpenFL's `AssetLibrary` for async loading to avoid blocking the browser.
- **Mobile:** Assets are bundled into the APK (Android) or app bundle (iOS).

Use `if` and `unless` attributes in `Project.xml` to include different asset formats per target (e.g., OGG for web, WAV for desktop).

---

## Build Modes

| Flag | Effect | Use Case |
|------|--------|----------|
| (none) | Release build, optimizations on | Final distribution |
| `-debug` | Debug symbols, assertions, source maps (HTML5) | Development |
| `-Dfinal` | Strip all debug info, maximum optimization | Shipping build |
| `-clean` | Delete cached build artifacts before building | Fix stale build issues |
| `-verbose` | Print full compiler and linker output | Diagnosing build failures |

Example: `lime test windows -debug -verbose`

---

## Neko Target (Rapid Iteration)

For the fastest compile times during development, you can use the **Neko** target:

```bash
lime test neko
```

Neko is a lightweight VM that the Haxe compiler targets. It compiles in seconds (vs. minutes for C++), making it ideal for rapid iteration on game logic. The downside is slower runtime performance — use Neko for testing logic, not for profiling performance.

**Note:** Neko rendering goes through the same OpenFL/Lime path, so visual output is identical to native targets. Only performance differs.

---

## HashLink (Alternative VM Target)

**HashLink** is a newer Haxe VM designed for games. It offers much better runtime performance than Neko while maintaining fast compile times:

```bash
# Requires HashLink installed separately
lime test hl
```

HashLink has two modes:
- **JIT mode** (`hl output.hl`): Fast compilation, reasonable runtime speed. Good for development.
- **C compilation mode**: HashLink bytecode is transpiled to C, then compiled with a native compiler. Near-native performance with faster compilation than hxcpp.

Some HaxeFlixel developers use HashLink as their primary development target and only build C++ for release.

---

## Common Cross-Platform Issues

### Audio Formats
- **Web:** Use OGG Vorbis (MP3 is supported but has licensing nuances; WAV files are large).
- **Native:** WAV and OGG both work. OGG is smaller; WAV has zero decode latency.
- **Strategy:** Ship both formats, use `if`/`unless` in `Project.xml` to include the right one per target.

### Input Differences
- **Desktop:** Keyboard + mouse. Gamepad via `flixel-addons` `FlxGamepad`.
- **HTML5:** Same, but gamepad support depends on the browser's Gamepad API.
- **Mobile:** Touch input maps to `FlxG.mouse` by default (touch position = mouse position, tap = click). For multi-touch, use `FlxG.touches`.

### Filesystem Access
- **Native:** Full filesystem access via `sys.io.File` and `Sys` class.
- **HTML5:** No filesystem. Use `FlxG.save` (wraps browser `SharedObject` / `localStorage`) for save data.
- **Mobile:** Use `lime.system.System.applicationStorageDirectory` for a writable path.

### Threading
- **Native (C++):** Haxe threads (`sys.thread.Thread`) work, but HaxeFlixel's rendering is single-threaded. Use threads only for background work (asset loading, networking).
- **HTML5:** No threads. JavaScript is single-threaded. Use callbacks or `haxe.Timer` for deferred work.
