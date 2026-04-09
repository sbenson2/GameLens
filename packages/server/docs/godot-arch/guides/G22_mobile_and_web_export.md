# G22 — Mobile & Web Export

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#  
> **Related:** [G18 Performance Profiling](./G18_performance_profiling.md) · [G20 CI/CD & Export Pipelines](./G20_cicd_and_export_pipelines.md) · [G9 UI & Control Systems](./G9_ui_control_systems.md) · [G4 Input Handling](./G4_input_handling.md) · [G12 Shaders & Visual Effects](./G12_shaders_and_visual_effects.md)

---

## What This Guide Covers

Exporting a Godot game to mobile (Android/iOS) and web (HTML5/WebAssembly) requires platform-specific configuration, performance tuning, and input adaptation that go far beyond clicking "Export." This guide covers the full pipeline: project settings, rendering constraints, texture compression, touch input handling, platform-specific gotchas, file size optimization, and testing workflows.

**Use this guide when:** you're targeting Android, iOS, or web browsers as a platform — whether as your primary target or a secondary port of a desktop game.

**Don't skip this if:** you've only tested on desktop. Mobile and web have fundamentally different performance profiles, input models, and rendering capabilities.

---

## Table of Contents

1. [Platform Overview — What's Supported Where](#1-platform-overview--whats-supported-where)
2. [Android Export Setup](#2-android-export-setup)
3. [iOS Export Setup](#3-ios-export-setup)
4. [Web Export Setup](#4-web-export-setup)
5. [Rendering Constraints by Platform](#5-rendering-constraints-by-platform)
6. [Texture Compression for Mobile](#6-texture-compression-for-mobile)
7. [Touch Input Handling](#7-touch-input-handling)
8. [Screen Adaptation and Safe Areas](#8-screen-adaptation-and-safe-areas)
9. [Mobile Performance Optimization](#9-mobile-performance-optimization)
10. [Web-Specific Limitations and Workarounds](#10-web-specific-limitations-and-workarounds)
11. [File Size Optimization](#11-file-size-optimization)
12. [Testing Workflows](#12-testing-workflows)
13. [Common Mistakes](#13-common-mistakes)

---

## 1. Platform Overview — What's Supported Where

| Feature | Android | iOS | Web |
|---------|---------|-----|-----|
| **GDScript** | ✅ Full | ✅ Full | ✅ Full |
| **C#/.NET** | ✅ Experimental | ✅ Experimental | ❌ Not supported |
| **Forward+** | ✅ | ✅ | ❌ |
| **Mobile renderer** | ✅ | ✅ | ❌ |
| **Compatibility renderer** | ✅ | ✅ | ✅ (required) |
| **GDExtension** | ✅ (arm64, x86_64) | ✅ (arm64) | ❌ |
| **Threads** | ✅ | ✅ | ⚠️ Requires SharedArrayBuffer |
| **Networking (TCP/UDP)** | ✅ | ✅ | ⚠️ WebSocket/WebRTC only |
| **File system access** | Sandboxed | Sandboxed | Virtual (user://) |

### Language Choice for Cross-Platform

If you plan to target web alongside mobile, **use GDScript.** C# projects cannot export to web in Godot 4.x. If you only target Android + iOS + desktop, C# is viable but still marked experimental for mobile exports.

---

## 2. Android Export Setup

### Prerequisites

- Android SDK (API level 34+ recommended)
- Android SDK Build-Tools
- Android SDK Platform-Tools
- OpenJDK 17+
- A debug keystore (Godot generates one, or use your own)

### Project Settings

```
# In Editor > Editor Settings > Export > Android
android/java_sdk_path = "/path/to/jdk-17"
android/android_sdk_path = "/path/to/android-sdk"
```

### Export Preset Configuration

In **Project > Export > Add... > Android**:

- **Architectures:** Enable `arm64-v8a` (required for modern devices). Optionally enable `x86_64` for emulators/Chromebooks.
- **Min SDK:** API 24 (Android 7.0) is the minimum for Godot 4.4+.
- **Target SDK:** API 34+ (required by Google Play as of 2025).
- **Permissions:** Only request what you need. Common: `INTERNET`, `ACCESS_NETWORK_STATE`, `VIBRATE`.
- **Graphics API:** Vulkan (`Forward+` or `Mobile` renderer) or OpenGL ES 3.0 (`Compatibility` renderer).

### Signing for Release

```bash
# Generate a release keystore
keytool -genkeypair -v -keystore release.keystore \
  -alias my_game -keyalg RSA -keysize 2048 -validity 10000
```

Configure the keystore path, alias, and passwords in the export preset under **Keystore > Release**.

### One-Click Deploy

Enable **Export > Remote Debug** to deploy directly to a connected Android device via USB or Wi-Fi for rapid iteration.

---

## 3. iOS Export Setup

### Requirements

- **macOS only** — iOS export requires Xcode and can only be done from a Mac.
- Xcode 15+ with iOS SDK.
- Apple Developer account (free for testing on your own device, paid for App Store).
- A provisioning profile and signing certificate configured in Xcode.

### Export Workflow

1. Configure an iOS export preset in **Project > Export**.
2. Set **Bundle Identifier** (e.g., `com.yourstudio.yourgame`).
3. Set **Team ID** from your Apple Developer account.
4. Export produces an Xcode project (`.xcodeproj`).
5. Open in Xcode, configure signing, build to device or archive for App Store.

### C# on iOS

C# iOS export is experimental in Godot 4.4+. It uses NativeAOT compilation. Expect longer build times and potential issues with reflection-heavy code. Test thoroughly.

---

## 4. Web Export Setup

### How It Works

Godot compiles your project to WebAssembly (`.wasm`) plus a JavaScript loader. The game runs in a browser using WebGL 2.0 via the **Compatibility** rendering backend.

### Export Configuration

- **Export Type:** Choose between "Regular" and "Thread Support" builds.
  - **Regular:** Wider browser compatibility, no SharedArrayBuffer requirement.
  - **Thread Support:** Better performance for physics/audio, but requires specific HTTP headers.
- **VRAM Texture Compression:** Enable `For Desktop` and/or `For Mobile` depending on target browsers.
- **HTML Shell:** Use the default or provide a custom HTML template.

### Required HTTP Headers for Threaded Builds

Your web server **must** serve these headers for threaded exports to work:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Without these, `SharedArrayBuffer` is unavailable and the game will fail to load.

### File Naming

Godot web exports expect files to keep their export-time names. **Do not rename** the `.wasm`, `.pck`, or `.js` files. Name your main HTML file `index.html` so web servers serve it by default.

### MIME Types

Ensure your server is configured to serve `.wasm` files with MIME type `application/wasm`. This enables streaming compilation — without it, browsers fall back to slower ArrayBuffer compilation.

---

## 5. Rendering Constraints by Platform

| Renderer | Backend | Platforms | Features |
|----------|---------|-----------|----------|
| **Forward+** | Vulkan | Desktop, Android, iOS | Full feature set: GI, volumetric fog, SDFGI |
| **Mobile** | Vulkan | Desktop, Android, iOS | Reduced feature set, optimized for GPU-limited devices |
| **Compatibility** | OpenGL ES 3.0 / WebGL 2.0 | All | Broadest support, fewest features |

### Web Is Compatibility Only

The web platform **only** supports the Compatibility renderer. Forward+ and Mobile renderers require Vulkan or modern low-level APIs that browsers don't expose. If you need web support, design your visuals around Compatibility from the start.

### Choosing a Renderer for Mobile

- **Compatibility:** Widest device support, OpenGL ES 3.0. Use for games targeting older or budget devices.
- **Mobile:** Vulkan-based, better performance on modern devices. Requires Vulkan support (most Android devices from 2019+, all iOS devices with A8+ chip).
- **Forward+:** Possible on mobile but heavy. Only use if you need advanced lighting and your target devices are high-end.

### Renderer Feature Gaps

Features **not available** in Compatibility mode:

- SDFGI (use baked lightmaps instead)
- Volumetric fog (use shader-based fog)
- SSR, SSAO, SSIL (use baked alternatives)
- Glow with high quality mode
- Decals (limited support)

---

## 6. Texture Compression for Mobile

### Why It Matters

Uncompressed textures consume enormous VRAM on mobile GPUs. Godot uses **ETC2** and **ASTC** compression for mobile platforms, which must be explicitly enabled.

### Enabling Mobile Texture Compression

In **Project Settings > Rendering > Textures > VRAM Compression**:

```
rendering/textures/vram_compression/import_etc2_astc = true
```

**Important:** Changing this setting does **not** re-import existing textures. After enabling, you must reimport textures:

1. Go to **Project > Tools > Reimport All Resources**, or
2. Delete the `.godot/imported/` folder and reopen the project.

### Compression Formats

| Format | Quality | Use Case |
|--------|---------|----------|
| **ETC2** | Standard | Default for Android (OpenGL ES 3.0+) |
| **ASTC 4×4** | High quality | Used when "High Quality" import is enabled |
| **S3TC/BPTC** | Desktop | Used for desktop exports (DXT1-5/BC7) |

### Texture Optimization Tips

- Use power-of-two texture sizes (512, 1024, 2048) for best compression ratios.
- Avoid textures larger than 2048×2048 on mobile — many GPUs have limits.
- Use texture atlases to reduce draw calls.
- Enable mipmaps for 3D textures; disable for pixel-art 2D games.
- Use `CompressedTexture2D` resources (Godot handles this automatically on import).

---

## 7. Touch Input Handling

### Input Events for Touch

Godot provides dedicated input events for touch:

```gdscript
# GDScript — handling touch input
extends Node2D

func _input(event: InputEvent) -> void:
    if event is InputEventScreenTouch:
        if event.pressed:
            print("Touch started at: ", event.position)
        else:
            print("Touch ended at: ", event.position)

    elif event is InputEventScreenDrag:
        print("Dragging at: ", event.position, " velocity: ", event.velocity)
```

### Making Desktop Input Work on Mobile

Enable **Project Settings > Input Devices > Pointing > Emulate Touch from Mouse** to test touch behavior with a mouse during development.

Conversely, enable **Emulate Mouse from Touch** so that `InputEventMouseButton` and `InputEventMouseMotion` events are generated from touch, letting UI controls work without modification.

```
# Project Settings
input_devices/pointing/emulate_touch_from_mouse = true  # For desktop testing
input_devices/pointing/emulate_mouse_from_touch = true   # For mobile UI compat
```

### Virtual Joystick Pattern

```gdscript
# GDScript — simple virtual joystick
class_name VirtualJoystick
extends Control

@export var dead_zone: float = 0.2
@export var max_distance: float = 64.0

var _pressed: bool = false
var _touch_index: int = -1
var _input_vector: Vector2 = Vector2.ZERO

@onready var _base: TextureRect = $Base
@onready var _tip: TextureRect = $Tip

func _input(event: InputEvent) -> void:
    if event is InputEventScreenTouch:
        if event.pressed and _is_in_bounds(event.position):
            _pressed = true
            _touch_index = event.index
            _update_tip(event.position)
        elif not event.pressed and event.index == _touch_index:
            _reset()

    elif event is InputEventScreenDrag:
        if event.index == _touch_index and _pressed:
            _update_tip(event.position)

func _update_tip(touch_pos: Vector2) -> void:
    var center: Vector2 = _base.global_position + _base.size / 2.0
    var delta: Vector2 = touch_pos - center
    var clamped: Vector2 = delta.limit_length(max_distance)
    _tip.global_position = center + clamped - _tip.size / 2.0
    _input_vector = clamped / max_distance
    if _input_vector.length() < dead_zone:
        _input_vector = Vector2.ZERO

func _reset() -> void:
    _pressed = false
    _touch_index = -1
    _input_vector = Vector2.ZERO
    _tip.position = _base.size / 2.0 - _tip.size / 2.0

func _is_in_bounds(pos: Vector2) -> bool:
    return _base.get_global_rect().has_point(pos)

func get_input() -> Vector2:
    return _input_vector
```

### Multi-Touch Tracking

Each touch point has a unique `index`. Track multiple touches by storing them in a dictionary:

```gdscript
var _active_touches: Dictionary = {}  # index → position

func _input(event: InputEvent) -> void:
    if event is InputEventScreenTouch:
        if event.pressed:
            _active_touches[event.index] = event.position
        else:
            _active_touches.erase(event.index)
    elif event is InputEventScreenDrag:
        _active_touches[event.index] = event.position
```

---

## 8. Screen Adaptation and Safe Areas

### Stretch Modes

Configure in **Project Settings > Display > Window**:

| Setting | Value | Use Case |
|---------|-------|----------|
| `stretch/mode` | `canvas_items` | 2D games — scales the canvas |
| `stretch/mode` | `viewport` | Pixel art — renders at base resolution, then scales |
| `stretch/aspect` | `keep` | Maintains aspect ratio, adds black bars |
| `stretch/aspect` | `expand` | Fills screen, content may extend beyond base size |

### Safe Areas (Notches and Rounded Corners)

Modern phones have notches, punch-holes, and rounded corners. Use `DisplayServer.get_display_safe_area()` to get the safe rectangle:

```gdscript
func _ready() -> void:
    var safe_area: Rect2i = DisplayServer.get_display_safe_area()
    # Offset your UI margins to stay within the safe area
    var screen_size: Vector2i = DisplayServer.window_get_size()

    var margin_left: int = safe_area.position.x
    var margin_top: int = safe_area.position.y
    var margin_right: int = screen_size.x - (safe_area.position.x + safe_area.size.x)
    var margin_bottom: int = screen_size.y - (safe_area.position.y + safe_area.size.y)

    # Apply to your root UI container
    %UIRoot.add_theme_constant_override("margin_left", margin_left)
    %UIRoot.add_theme_constant_override("margin_top", margin_top)
    %UIRoot.add_theme_constant_override("margin_right", margin_right)
    %UIRoot.add_theme_constant_override("margin_bottom", margin_bottom)
```

### Orientation Locking

```
# Project Settings
display/window/handheld/orientation = "portrait"  # or "landscape", "sensor"
```

---

## 9. Mobile Performance Optimization

### Rendering Budget

Mobile GPUs are **far weaker** than desktop GPUs. Budget guidelines:

| Category | Budget |
|----------|--------|
| Draw calls per frame | < 100 (budget devices), < 300 (modern) |
| Triangles per frame | < 100K (budget), < 500K (modern) |
| Texture memory | < 256 MB |
| Shader instructions | Keep fragment shaders simple |
| Physics bodies | < 200 active |

### Key Optimization Techniques

**Reduce draw calls:**
- Use `MultiMeshInstance2D`/`MultiMeshInstance3D` for repeated objects.
- Merge static geometry where possible.
- Use texture atlases to batch sprites.

**Simplify shaders:**
- Avoid `discard` in fragment shaders (breaks early-Z on many mobile GPUs).
- Use `lowp` and `mediump` precision qualifiers where acceptable.
- Minimize texture lookups per fragment.

**Manage physics:**
- Reduce collision layers/masks to minimize broad-phase checks.
- Use simpler collision shapes (rectangles/circles over polygons).
- Lower physics tick rate if your game doesn't need 60 Hz physics.

**Battery and thermal management:**
- Cap frame rate to 30 FPS for casual games — saves battery, reduces heat.
- Use `Engine.max_fps = 30` or `Engine.max_fps = 60`.
- Reduce processing when the game is paused or in menus.

```gdscript
# GDScript — adaptive frame rate
func _on_pause_menu_opened() -> void:
    Engine.max_fps = 30  # Save battery in menus

func _on_gameplay_resumed() -> void:
    Engine.max_fps = 60  # Full speed during gameplay
```

---

## 10. Web-Specific Limitations and Workarounds

### No Persistent File System

`user://` maps to IndexedDB in the browser, but it's **asynchronous** and limited. Large save files may fail silently on some browsers. Keep saves small (< 1 MB).

### No Raw Sockets

TCP/UDP sockets are unavailable in browsers. For multiplayer:
- Use `WebSocketPeer` instead of `StreamPeerTCP`/`PacketPeerUDP`.
- Use `WebRTCPeerConnection` for peer-to-peer.
- Design your networking layer with a WebSocket fallback from the start if you need cross-platform multiplayer.

### Audio Autoplay Restrictions

Browsers block audio playback until the user interacts with the page (click/tap). Godot handles this automatically in most cases, but:
- Don't rely on audio playing in `_ready()` on the first frame.
- Show a "Click to Start" screen that triggers `AudioServer` resume.

As of Godot 4.3+, the default audio playback mode for web is **Sample**, which uses the Web Audio API directly for lower latency.

### Browser Compatibility

| Browser | WebGL 2.0 | WebAssembly | SharedArrayBuffer | Notes |
|---------|-----------|-------------|-------------------|-------|
| Chrome 90+ | ✅ | ✅ | ✅ | Recommended |
| Firefox 90+ | ✅ | ✅ | ✅ | Good support |
| Safari 15+ | ⚠️ | ✅ | ⚠️ | Known WebGL issues |
| Edge 90+ | ✅ | ✅ | ✅ | Chromium-based |

**Recommendation:** Test primarily on Chrome/Firefox. Safari has persistent WebGL 2.0 issues that may cause rendering artifacts.

### Memory Limits

WebAssembly operates within a limited memory space. Large games (> 512 MB) may hit browser memory limits, especially on mobile browsers. Strategies:
- Compress assets aggressively (use lossy compression for audio).
- Load scenes on demand rather than preloading everything.
- Use lower-resolution textures for web builds.

---

## 11. File Size Optimization

Web and mobile users are sensitive to download size. Godot 4 web exports start at ~30 MB for an empty project.

### Reducing Export Size

| Technique | Impact | How |
|-----------|--------|-----|
| Compress audio to OGG Vorbis | High | Re-import WAV files as OGG |
| Reduce texture resolution | High | Use import presets for mobile/web |
| Strip unused modules | Medium | Custom export templates with `scons` flags |
| Optimize 3D models | Medium | Reduce polycount, remove invisible geometry |
| Enable PCK compression | Medium | Check "Compress" in export settings |
| Use `PackedScene` efficiently | Low | Avoid embedding large resources inline |

### Custom Export Templates

For maximum size reduction, build custom export templates with only the modules you need:

```bash
# Example: build web template without 3D physics
scons platform=web target=template_release \
  module_3d_physics_enabled=no \
  module_navigation_enabled=no \
  optimize=size
```

---

## 12. Testing Workflows

### Android Testing

1. **USB debugging:** Enable Developer Options on device, connect via USB, use one-click deploy.
2. **Wi-Fi debugging:** After initial USB connection, switch to wireless ADB for untethered testing.
3. **Remote debugging:** Use Godot's remote debugger to inspect the scene tree and monitor performance on-device.

### iOS Testing

1. Export the Xcode project from Godot.
2. Open in Xcode, select your connected device, build and run.
3. Use Xcode Instruments for GPU/CPU profiling.

### Web Testing

1. Export to a local folder.
2. Serve with a local web server that sends the required CORS headers:

```bash
# Python with CORS headers for threaded builds
python3 -c "
from http.server import HTTPServer, SimpleHTTPRequestHandler
class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        super().end_headers()
HTTPServer(('localhost', 8000), Handler).serve_forever()
"
```

3. Open `http://localhost:8000` in Chrome. Do **not** use `file://` — it won't work.

### Cross-Platform Input Testing

Use **Emulate Touch from Mouse** during desktop development, but always test on real devices before release. Touch feel, gesture recognition, and screen-size adaptation cannot be fully validated with a mouse.

---

## 13. Common Mistakes

| Mistake | Why It Fails | Fix |
|---------|-------------|-----|
| Using C# and expecting web export | C# cannot compile to WebAssembly in Godot 4 | Use GDScript for web-targeted projects |
| Forgetting to enable ETC2/ASTC | Textures render as pink/missing on Android | Enable in Project Settings, reimport all textures |
| Renaming web export files | Godot loader expects original filenames | Keep all exported files with their original names |
| Testing web exports via `file://` | CORS and WASM streaming fail | Use a local HTTP server |
| Not handling notches/safe areas | UI hidden behind camera cutouts | Use `DisplayServer.get_display_safe_area()` |
| Using Forward+ for web | Web only supports Compatibility renderer | Switch renderer before designing visuals |
| Ignoring audio autoplay | No sound on first load in browser | Add a "Click to Start" interaction gate |
| Shipping debug builds to mobile | 2-3× larger, much slower | Always use Release export templates |
| Not testing on real devices | Emulator performance differs dramatically | Test on low-end real hardware |
| Using raw TCP/UDP in web builds | Browsers don't support raw sockets | Use WebSocket or WebRTC |

---

## Further Reading

- [G18 Performance Profiling](./G18_performance_profiling.md) — Detailed profiling techniques
- [G20 CI/CD & Export Pipelines](./G20_cicd_and_export_pipelines.md) — Automating multi-platform builds
- [G4 Input Handling](./G4_input_handling.md) — Desktop input fundamentals
- [G9 UI & Control Systems](./G9_ui_control_systems.md) — UI layout and theming
- [G12 Shaders & Visual Effects](./G12_shaders_and_visual_effects.md) — Shader optimization for mobile
