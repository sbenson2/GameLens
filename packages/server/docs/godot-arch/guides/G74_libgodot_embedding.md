# G74 — LibGodot: Embedding the Engine

> **Category:** guide · **Engine:** Godot 4.6+ · **Language:** GDScript / C# / C++
> **Related:** [G16 GDExtension & Native Code](./G16_gdextension_native_code.md) · [G42 Platform Integration & Steamworks](./G42_platform_integration_and_steamworks.md) · [G20 CI/CD & Export Pipelines](./G20_cicd_and_export_pipelines.md)

---

## What This Guide Covers

Godot 4.6 introduced **LibGodot**, a supported way to embed the Godot engine as a library inside your own application. Instead of Godot being the top-level executable that runs your game, LibGodot lets your application control startup, manage the engine loop, and integrate Godot rendering into existing frameworks — such as native desktop apps, simulation tools, digital twins, architectural visualization, or hybrid game engines.

**Use this guide when:** you need to embed Godot inside a C++ or C# host application, integrate Godot rendering into a non-Godot GUI framework, build a simulation tool that uses Godot for visualization, or create a plugin that provides Godot as a render/logic backend.

**G16** covers GDExtension for extending Godot with native code. LibGodot is the inverse — it makes Godot the extension. **G42** covers platform integrations (Steam, console SDKs) where Godot is still the host.

---

## Table of Contents

1. [What LibGodot Is (and Isn't)](#1-what-libgodot-is-and-isnt)
2. [Architecture Overview](#2-architecture-overview)
3. [Building LibGodot](#3-building-libgodot)
4. [C++ Host Integration](#4-c-host-integration)
5. [C# Host Integration](#5-c-host-integration)
6. [Engine Lifecycle Control](#6-engine-lifecycle-control)
7. [Scene Loading and Management](#7-scene-loading-and-management)
8. [Rendering Integration](#8-rendering-integration)
9. [Input Forwarding](#9-input-forwarding)
10. [Communication: Host ↔ Godot](#10-communication-host--godot)
11. [Use Cases and Architectures](#11-use-cases-and-architectures)
12. [Limitations](#12-limitations)
13. [Common Mistakes](#13-common-mistakes)

---

## 1. What LibGodot Is (and Isn't)

### What it IS

- A **shared library** (.dll / .so / .dylib) that contains the full Godot runtime.
- An API to **initialize**, **iterate**, and **shut down** the engine from your own `main()` function.
- A way to render Godot content into a texture or native window managed by your host application.
- Compatible with the full Godot feature set: physics, audio, scripting, networking.

### What it ISN'T

- Not a stripped-down "renderer only" build — it's the complete engine.
- Not the same as GDExtension (GDExtension extends Godot; LibGodot embeds Godot).
- Not an editor — you still author scenes and scripts in the Godot editor, then load them at runtime via LibGodot.

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────┐
│          Your Host Application          │
│  (C++, C#, Qt, WPF, Electron, etc.)    │
│                                         │
│  ┌───────────────────────────────────┐  │
│  │           LibGodot API            │  │
│  │  godot_init() → godot_iterate()   │  │
│  │  → godot_shutdown()               │  │
│  ├───────────────────────────────────┤  │
│  │       Godot Engine Runtime        │  │
│  │  Scenes · Physics · Audio · Net   │  │
│  │  GDScript · C# · Rendering        │  │
│  └───────────────────────────────────┘  │
│                                         │
│  [Host UI]  [Host Logic]  [Host I/O]    │
└─────────────────────────────────────────┘
```

The host application owns the process, the main loop, and the window. LibGodot runs inside it as a library, rendering to a surface provided by the host.

---

## 3. Building LibGodot

LibGodot is built from the Godot source using SCons with the `library` target:

```bash
# Clone Godot 4.6+ source
git clone https://github.com/godotengine/godot.git -b 4.6-stable
cd godot

# Build LibGodot as a shared library (Linux)
scons platform=linuxbsd target=template_release library_type=shared_library

# Build LibGodot (Windows)
scons platform=windows target=template_release library_type=shared_library

# Build LibGodot (macOS)
scons platform=macos target=template_release library_type=shared_library arch=universal
```

This produces:
- Linux: `bin/libgodot.linuxbsd.template_release.x86_64.so`
- Windows: `bin/godot.windows.template_release.x86_64.dll`
- macOS: `bin/libgodot.macos.template_release.universal.dylib`

### Build Variants

| SCons flag | Purpose |
|-----------|---------|
| `target=template_debug` | Debug build with assertions and verbose logging |
| `target=template_release` | Optimized release build |
| `module_mono_enabled=yes` | Include C# / .NET support |
| `vulkan=yes d3d12=yes` | Include specific rendering backends |

---

## 4. C++ Host Integration

### Minimal C++ Host

```cpp
// main.cpp — minimal LibGodot host
#include "godot_library.h"  // LibGodot public header
#include <cstdio>

int main(int argc, char* argv[]) {
    // Configure engine startup
    GodotLibraryConfig config = {};
    config.project_path = "res://";          // Path to your .godot project
    config.main_scene = "res://main.tscn";   // Entry scene
    config.rendering_driver = "vulkan";
    config.window_mode = GODOT_WINDOW_EMBEDDED;  // Host controls the window
    config.verbose = false;

    // Initialize the engine
    GodotLibraryError err = godot_library_init(&config, argc, argv);
    if (err != GODOT_LIB_OK) {
        printf("Failed to init LibGodot: %d\n", err);
        return 1;
    }

    printf("LibGodot initialized. Entering main loop...\n");

    // Main loop — call iterate() each frame
    bool running = true;
    while (running) {
        // Process host events (input, window resize, etc.)
        // ... your host framework event loop ...

        // Advance Godot by one frame
        running = godot_library_iterate();
    }

    // Clean shutdown
    godot_library_shutdown();
    return 0;
}
```

### Building the Host

```bash
# Compile against LibGodot headers and link the shared library
g++ main.cpp -o my_app \
    -I/path/to/godot/include \
    -L/path/to/godot/bin \
    -lgodot.linuxbsd.template_release.x86_64 \
    -Wl,-rpath,'$ORIGIN'
```

---

## 5. C# Host Integration

LibGodot can be loaded from a C# host application using P/Invoke or the .NET Godot bindings:

```csharp
using System;
using System.Runtime.InteropServices;

public static class LibGodot
{
    private const string LibName = "godot.windows.template_release.x86_64";

    [DllImport(LibName)]
    private static extern int godot_library_init(
        ref GodotLibraryConfig config, int argc, IntPtr argv);

    [DllImport(LibName)]
    [return: MarshalAs(UnmanagedType.I1)]
    private static extern bool godot_library_iterate();

    [DllImport(LibName)]
    private static extern void godot_library_shutdown();

    [StructLayout(LayoutKind.Sequential)]
    public struct GodotLibraryConfig
    {
        [MarshalAs(UnmanagedType.LPStr)]
        public string ProjectPath;
        [MarshalAs(UnmanagedType.LPStr)]
        public string MainScene;
        [MarshalAs(UnmanagedType.LPStr)]
        public string RenderingDriver;
        public int WindowMode;
        [MarshalAs(UnmanagedType.I1)]
        public bool Verbose;
    }

    public static void Initialize(string projectPath, string mainScene)
    {
        var config = new GodotLibraryConfig
        {
            ProjectPath = projectPath,
            MainScene = mainScene,
            RenderingDriver = "vulkan",
            WindowMode = 1, // EMBEDDED
            Verbose = false
        };

        int result = godot_library_init(ref config, 0, IntPtr.Zero);
        if (result != 0)
            throw new Exception($"LibGodot init failed: {result}");
    }

    public static bool Iterate() => godot_library_iterate();

    public static void Shutdown() => godot_library_shutdown();
}
```

### Usage in a WPF Application

```csharp
// MainWindow.xaml.cs — WPF host embedding Godot
using System.Windows;
using System.Windows.Threading;

public partial class MainWindow : Window
{
    private DispatcherTimer _gameTimer;

    public MainWindow()
    {
        InitializeComponent();
        Loaded += OnLoaded;
        Closing += OnClosing;
    }

    private void OnLoaded(object sender, RoutedEventArgs e)
    {
        LibGodot.Initialize(
            projectPath: @"C:\MyProject",
            mainScene: "res://scenes/visualization.tscn"
        );

        // Drive engine at ~60 FPS via WPF timer
        _gameTimer = new DispatcherTimer
        {
            Interval = TimeSpan.FromMilliseconds(16)
        };
        _gameTimer.Tick += (_, _) => LibGodot.Iterate();
        _gameTimer.Start();
    }

    private void OnClosing(object sender, System.ComponentModel.CancelEventArgs e)
    {
        _gameTimer?.Stop();
        LibGodot.Shutdown();
    }
}
```

---

## 6. Engine Lifecycle Control

LibGodot exposes three lifecycle phases:

### Initialization

`godot_library_init()` performs all engine startup: module registration, server creation (RenderingServer, PhysicsServer, AudioServer), project loading, and scene tree setup. This is equivalent to the work Godot's normal `main()` does before the first frame.

### Iteration

`godot_library_iterate()` runs one complete engine frame:
1. Input processing
2. `_process()` / `_physics_process()` callbacks
3. Physics step(s)
4. Rendering
5. Audio mixing

Returns `true` while the engine is running, `false` when a quit has been requested (via `get_tree().quit()` or a fatal error).

### Shutdown

`godot_library_shutdown()` releases all resources, destroys the scene tree, and unloads modules. After this call, the LibGodot library can be unloaded from the host process.

### Frame Timing

The host controls frame timing. If your host runs at a variable rate:

```gdscript
# In your Godot project's autoload — adapts to host frame rate
# _process() delta is automatically calculated from iterate() call intervals
extends Node

func _process(delta: float) -> void:
    # delta reflects the actual time between iterate() calls
    # No special handling needed — Engine.time_scale works normally
    pass
```

---

## 7. Scene Loading and Management

Once initialized, the engine's SceneTree is available. Your Godot project scripts run normally — `_ready()`, `_process()`, signals, etc. all work.

### Loading Scenes from GDScript (Inside LibGodot)

```gdscript
# scene_controller.gd — autoload in your Godot project
extends Node

signal scene_loaded(scene_name: String)

func load_scene(path: String) -> void:
    var packed := ResourceLoader.load(path) as PackedScene
    if packed == null:
        push_error("Failed to load scene: %s" % path)
        return

    # Clear current scene
    var tree := get_tree()
    for child in tree.current_scene.get_children():
        child.queue_free()

    # Instance and add new scene
    var instance := packed.instantiate()
    tree.current_scene.add_child(instance)
    scene_loaded.emit(path.get_file())
```

### Dynamic Scene Switching from Host

Communication between host and Godot scripts can be done through file-based commands, shared memory, or by calling engine methods through the GDExtension interface (see Section 10).

---

## 8. Rendering Integration

LibGodot can render to:

1. **Its own window** — the simplest mode, suitable for overlay panels or secondary windows.
2. **An embedded surface** — render to a texture that the host composites into its own UI.
3. **Offscreen** — headless rendering for simulation, testing, or server-side rendering.

### Offscreen / Headless Mode

```bash
# Set rendering to offscreen in project settings or via config
# Useful for simulation backends or CI testing
config.rendering_driver = "vulkan";
config.window_mode = GODOT_WINDOW_HEADLESS;
```

### Rendering to Texture

For embedded rendering, LibGodot renders to a `SubViewport`, and the host reads back the texture data:

```gdscript
# render_bridge.gd — provides frame data to the host
extends Node

@export var render_viewport: SubViewport

var _frame_image: Image

func _process(_delta: float) -> void:
    # Capture rendered frame as Image
    _frame_image = render_viewport.get_texture().get_image()

func get_frame_rgba8() -> PackedByteArray:
    if _frame_image == null:
        return PackedByteArray()
    _frame_image.convert(Image.FORMAT_RGBA8)
    return _frame_image.get_data()

func get_frame_size() -> Vector2i:
    if _frame_image == null:
        return Vector2i.ZERO
    return Vector2i(_frame_image.get_width(), _frame_image.get_height())
```

---

## 9. Input Forwarding

When LibGodot doesn't own the window, the host must forward input events:

```gdscript
# input_bridge.gd — receives input from host application
extends Node

func inject_mouse_motion(position: Vector2, relative: Vector2) -> void:
    var event := InputEventMouseMotion.new()
    event.position = position
    event.relative = relative
    Input.parse_input_event(event)

func inject_mouse_button(position: Vector2, button: MouseButton, pressed: bool) -> void:
    var event := InputEventMouseButton.new()
    event.position = position
    event.button_index = button
    event.pressed = pressed
    Input.parse_input_event(event)

func inject_key(keycode: Key, pressed: bool, unicode: int = 0) -> void:
    var event := InputEventKey.new()
    event.keycode = keycode
    event.pressed = pressed
    event.unicode = unicode
    Input.parse_input_event(event)
```

### C# Host — Input Forwarding

```csharp
// Forward WPF mouse events to LibGodot via shared memory or named pipe
// The Godot-side input_bridge.gd reads and injects them
public partial class GodotPanel : System.Windows.Controls.UserControl
{
    protected override void OnMouseMove(System.Windows.Input.MouseEventArgs e)
    {
        base.OnMouseMove(e);
        var pos = e.GetPosition(this);
        // Write to shared input channel — Godot reads in _process()
        InputChannel.WriteMouseMotion((float)pos.X, (float)pos.Y);
    }

    protected override void OnMouseDown(System.Windows.Input.MouseButtonEventArgs e)
    {
        base.OnMouseDown(e);
        var pos = e.GetPosition(this);
        InputChannel.WriteMouseButton(
            (float)pos.X, (float)pos.Y,
            button: 1, pressed: true);
    }
}
```

---

## 10. Communication: Host ↔ Godot

### Option 1: File-Based Commands

Simple and portable — write JSON commands to a watched directory:

```gdscript
# command_watcher.gd
extends Node

const COMMAND_DIR := "user://host_commands/"

func _process(_delta: float) -> void:
    var dir := DirAccess.open(COMMAND_DIR)
    if dir == null:
        return
    dir.list_dir_begin()
    var file_name := dir.get_next()
    while file_name != "":
        if file_name.ends_with(".json"):
            _process_command(COMMAND_DIR + file_name)
            DirAccess.remove_absolute(COMMAND_DIR + file_name)
        file_name = dir.get_next()

func _process_command(path: String) -> void:
    var json_text := FileAccess.get_file_as_string(path)
    var data: Dictionary = JSON.parse_string(json_text)
    match data.get("action", ""):
        "load_scene":
            get_tree().change_scene_to_file(data["path"])
        "set_camera":
            var cam := get_viewport().get_camera_3d()
            if cam:
                cam.global_position = Vector3(
                    data["x"], data["y"], data["z"])
```

### Option 2: GDExtension Bridge

Register a GDExtension singleton that both your host C++ code and GDScript can access — the fastest and most type-safe approach.

### Option 3: Network Socket

Run a lightweight TCP or WebSocket server inside Godot for cross-process communication:

```gdscript
# socket_bridge.gd
extends Node

var _server := TCPServer.new()
var _clients: Array[StreamPeerTCP] = []

func _ready() -> void:
    _server.listen(9876, "127.0.0.1")

func _process(_delta: float) -> void:
    if _server.is_connection_available():
        _clients.append(_server.take_connection())

    for client in _clients:
        client.poll()
        if client.get_available_bytes() > 0:
            var msg := client.get_utf8_string(client.get_available_bytes())
            _handle_message(msg)
```

---

## 11. Use Cases and Architectures

| Use Case | Architecture | Notes |
|----------|-------------|-------|
| **Arch-viz in desktop app** | WPF/Qt host + LibGodot offscreen render | Render 3D scene to texture, composite in native UI |
| **Digital twin dashboard** | Web dashboard + LibGodot headless | Host sends sensor data via socket, Godot runs simulation |
| **Simulation tool** | C++ host with custom physics + LibGodot for visuals | Host owns simulation loop, Godot renders state |
| **Game editor / modding tool** | Custom editor + embedded Godot preview | LibGodot provides live preview inside a custom tool |
| **Automated testing** | CI runner + LibGodot headless | Run gameplay tests without a GPU/display |

---

## 12. Limitations

- **One engine instance per process.** You cannot initialize LibGodot twice in the same process. Use SubViewports for multiple "views."
- **Thread safety.** The host must call `godot_library_iterate()` from a single thread. Godot's internal threading (physics, rendering) is managed by the engine.
- **No editor embedding.** LibGodot embeds the runtime, not the editor. Scene authoring still requires the standalone Godot editor.
- **Platform support.** As of 4.6, LibGodot is supported on Linux, Windows, and macOS. Mobile and web platforms are not yet supported.
- **Build complexity.** You must build Godot from source to produce the shared library. Prebuilt LibGodot binaries may become available in future releases.

---

## 13. Common Mistakes

| Mistake | Fix |
|---------|-----|
| Calling `iterate()` from multiple threads | Always call from a single thread; use mutexes if host is multi-threaded |
| Forgetting to forward input events | Implement an input bridge (Section 9) or Godot scenes won't respond |
| Loading a project that doesn't match the build | Ensure the Godot project version matches the LibGodot build version |
| Not calling `shutdown()` before exit | Resource leaks and potential crashes — always clean up |
| Expecting `EditorPlugin` to work | LibGodot is runtime-only; editor APIs are not available |
| Rendering to wrong surface after window resize | Listen for host resize events and update SubViewport size accordingly |

---

## Summary

LibGodot in Godot 4.6 inverts the traditional relationship — instead of Godot owning your application, your application owns Godot. Key takeaways:

- **Three-phase lifecycle:** `init()` → `iterate()` → `shutdown()`.
- **Rendering flexibility:** own window, embedded texture, or headless.
- **Communication options:** file-based, GDExtension bridge, or network sockets.
- **Full engine available:** physics, audio, scripting, networking all work inside LibGodot.
- **Build from source** with the `library_type=shared_library` SCons flag.

**Next steps:** [G16 GDExtension & Native Code](./G16_gdextension_native_code.md) for extending Godot with C++ · [G20 CI/CD & Export Pipelines](./G20_cicd_and_export_pipelines.md) for automated builds · [G42 Platform Integration](./G42_platform_integration_and_steamworks.md) for SDK integrations.
