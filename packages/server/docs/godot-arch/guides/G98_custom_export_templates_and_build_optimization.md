# G98 — Custom Export Templates & Build Optimization

> **Category:** guide · **Engine:** Godot 4.x · **Related:** [G20 CI/CD & Export Pipelines](./G20_cicd_and_export_pipelines.md) · [G22 Mobile & Web Export](./G22_mobile_and_web_export.md) · [G84 Memory Management & Optimization](./G84_memory_management_and_optimization.md) · [G89 Platform-Specific Optimization](./G89_platform_specific_optimization.md)

Custom export templates let you compile Godot's runtime with only the features your game uses — stripping unused nodes, physics engines, rendering backends, and modules to dramatically reduce binary size and improve load times. This guide covers build profiles, SCons configuration, module stripping, feature tags, LTO, and CI automation for producing optimized templates across all target platforms.

---

## Table of Contents

1. [Why Custom Export Templates](#1-why-custom-export-templates)
2. [Prerequisites & Toolchain Setup](#2-prerequisites--toolchain-setup)
3. [Build Profiles — The Engine Compilation Configuration Editor](#3-build-profiles--the-engine-compilation-configuration-editor)
4. [SCons Build System Fundamentals](#4-scons-build-system-fundamentals)
5. [Module Stripping](#5-module-stripping)
6. [Feature Tags & Platform Overrides](#6-feature-tags--platform-overrides)
7. [Link-Time Optimization (LTO)](#7-link-time-optimization-lto)
8. [Size Optimization Recipes](#8-size-optimization-recipes)
9. [Building for Each Platform](#9-building-for-each-platform)
10. [Using Custom Templates in the Editor](#10-using-custom-templates-in-the-editor)
11. [CI/CD Automation with GitHub Actions](#11-cicd-automation-with-github-actions)
12. [Measuring & Validating Results](#12-measuring--validating-results)
13. [Common Mistakes](#13-common-mistakes)

---

## 1. Why Custom Export Templates

Default Godot export templates include everything — 3D rendering, XR, navigation, all physics engines, every node type. For a 2D pixel-art game, most of that is dead weight:

| Build | Typical Size (Windows) | Notes |
|-------|----------------------|-------|
| Default template | 80–95 MB | Includes 3D, XR, all modules |
| 2D-only, stripped | 15–25 MB | No 3D nodes, no XR, minimal modules |
| Aggressive strip | 6–12 MB | Disable navigation, physics engine swap, no editor tools |

Beyond binary size, custom templates improve:

- **Startup time** — fewer systems to initialize
- **Memory footprint** — stripped modules never allocate
- **Attack surface** — removed code can't have vulnerabilities
- **Console compliance** — some platforms have size budgets

---

## 2. Prerequisites & Toolchain Setup

### Required Tools

```bash
# Python 3.6+ and SCons (Godot's build system)
pip3 install scons

# Platform-specific compilers:
# Windows: Visual Studio 2022 (Desktop C++ workload) or MinGW-w64
# macOS: Xcode command line tools
# Linux: GCC 9+ or Clang 13+
# Web: Emscripten 3.1.62+
# Android: Android NDK r23c+
```

### Get the Source

```bash
# Clone the exact Godot version matching your project
git clone --branch 4.6-stable --depth 1 https://github.com/godotengine/godot.git
cd godot
```

> **Critical:** Your custom template MUST match the Godot editor version exactly. A template built from 4.6-stable works only with the 4.6-stable editor. Version mismatches cause crashes or subtle bugs.

---

## 3. Build Profiles — The Engine Compilation Configuration Editor

Godot 4.4+ includes a built-in tool to generate build profiles that disable unused nodes and resources.

### Creating a Build Profile in the Editor

1. Open your project in the Godot editor
2. Go to **Project → Tools → Engine Compilation Configuration Editor**
3. Click **Detect from Project** to auto-detect which nodes/resources your project uses
4. Review and uncheck anything you don't need
5. Save as a `.build` file (e.g., `my_game.build`)

### What Build Profiles Control

The `.build` file is JSON listing disabled class names:

```json
{
    "disabled_classes": [
        "XRServer",
        "XRInterface",
        "XRCamera3D",
        "NavigationServer3D",
        "PhysicalBone3D",
        "VehicleBody3D",
        "CSGShape3D"
    ]
}
```

### Using the Build Profile

```bash
# Pass build_profile to SCons when compiling templates
scons platform=windows target=template_release build_profile=my_game.build
```

### Godot 4.5+ Additions

Godot 4.5 stabilized build profiles and added new toggle options:

- `disable_navigation_2d` / `disable_navigation_3d` — strip entire navigation subsystems
- `disable_xr` — strip all XR/VR support
- `disable_physics_2d` / `disable_physics_3d` — strip physics (if you handle collision yourself)

---

## 4. SCons Build System Fundamentals

### Key SCons Parameters

```bash
# The essential parameters for export templates:
scons \
    platform=<target>          # windows, linuxbsd, macos, web, android, ios
    target=template_release    # template_release or template_debug
    arch=<architecture>        # x86_64, x86_32, arm64, arm32, wasm32
    production=yes             # Enable production optimizations
    lto=full                   # Link-Time Optimization
    tools=no                   # No editor tools in export template (default for templates)
```

### The custom.py File

Create a `custom.py` in the Godot source root for reusable build settings:

```python
# custom.py — Shared build configuration
# This file is automatically loaded by SCons

# Optimization
production = "yes"
lto = "full"
debug_symbols = "no"

# Disable 3D for a 2D-only game
disable_3d = "yes"

# Disable modules you don't use
module_camera_enabled = "no"
module_csg_enabled = "no"
module_gridmap_enabled = "no"
module_lightmapper_rd_enabled = "no"
module_mobile_vr_enabled = "no"
module_openxr_enabled = "no"
module_raycast_enabled = "no"
module_webxr_enabled = "no"
```

```bash
# SCons automatically reads custom.py:
scons platform=windows target=template_release
# Equivalent to passing all those options on the command line
```

---

## 5. Module Stripping

Godot is organized into modules under `modules/`. Each can be individually disabled.

### Disable All, Enable Selectively

```bash
# Start with everything off, then enable what you need
scons platform=windows target=template_release \
    modules_enabled_by_default=no \
    module_gdscript_enabled=yes \
    module_text_server_adv_enabled=yes \
    module_freetype_enabled=yes \
    module_webp_enabled=yes \
    module_ogg_enabled=yes \
    module_vorbis_enabled=yes
```

### Module Reference — What's Safe to Disable

| Module | What It Provides | Safe to Disable If... |
|--------|-----------------|----------------------|
| `csg` | CSG shape nodes | No CSG in your game |
| `gridmap` | GridMap node | Not using 3D grid maps |
| `lightmapper_rd` | GPU lightmap baking | Not baking lightmaps at runtime |
| `openxr` | OpenXR/VR support | No VR |
| `webxr` | WebXR support | No web VR |
| `mobile_vr` | Simple mobile VR | No VR |
| `camera` | Camera server | No camera feed access |
| `raycast` | Raycast occlusion culling | Not using raycast-based culling |
| `noise` | FastNoiseLite | Not using noise generation |
| `navigation` | Navigation servers | Handling pathfinding yourself |
| `multiplayer` | High-level multiplayer | Using low-level networking only |
| `gltf` | glTF import/export | Not loading glTF at runtime |

### C# Considerations

If your project uses C#, you **must** keep the `mono` module enabled. The C# runtime adds ~15-20 MB to the binary — this cannot be stripped.

```bash
# C# project — keep mono, strip everything else aggressively
scons platform=windows target=template_release \
    module_mono_enabled=yes \
    modules_enabled_by_default=no \
    module_text_server_adv_enabled=yes \
    module_freetype_enabled=yes
```

---

## 6. Feature Tags & Platform Overrides

Feature tags let you conditionally include content in your project based on the target platform and build configuration.

### Built-In Feature Tags

Godot auto-assigns tags based on the export target:

```gdscript
# Check feature tags at runtime
if OS.has_feature("mobile"):
    # Reduce particle count, lower texture resolution
    quality_preset = "low"
elif OS.has_feature("web"):
    # Disable heavy post-processing
    quality_preset = "medium"
else:
    quality_preset = "high"

# Custom feature tags are set in Export → Resources → Custom Features
if OS.has_feature("demo"):
    # Limit levels, show "Buy Full Version" button
    max_level = 3
```

### Defining Custom Feature Tags

In the Export dialog under **Resources → Features**, add custom tags:

- `demo` / `full` — for demo vs full builds
- `steam` / `itch` / `console` — for storefront-specific logic
- `debug_tools` — for internal testing builds

### Override Files

Godot supports file overrides based on feature tags. A file named `settings.cfg.mobile` will replace `settings.cfg` on mobile exports.

```
project/
├── settings.cfg           # Default (desktop)
├── settings.cfg.mobile    # Overrides on mobile
├── settings.cfg.web       # Overrides on web
└── icon.png.android       # Android-specific icon
```

---

## 7. Link-Time Optimization (LTO)

LTO lets the compiler optimize across translation units, inlining and dead-stripping more aggressively.

```bash
# Full LTO — best size reduction, slower compile
scons platform=windows target=template_release lto=full

# Thin LTO — faster compile, slightly less optimization (Clang only)
scons platform=linuxbsd target=template_release use_llvm=yes lto=thin
```

### LTO Impact

| Platform | Without LTO | With LTO (full) | Savings |
|----------|------------|-----------------|---------|
| Windows x86_64 | 85 MB | 62 MB | ~27% |
| Linux x86_64 | 78 MB | 55 MB | ~29% |
| Web (wasm) | 38 MB | 25 MB | ~34% |

> **Warning:** LTO compilation can use 8+ GB of RAM and take significantly longer. Budget 2-4× compile time.

---

## 8. Size Optimization Recipes

### Recipe: Minimal 2D Game (GDScript)

Goal: smallest possible binary for a 2D pixel-art game.

```python
# custom.py — Minimal 2D build
production = "yes"
lto = "full"
debug_symbols = "no"
disable_3d = "yes"
modules_enabled_by_default = "no"
module_gdscript_enabled = "yes"
module_text_server_adv_enabled = "yes"
module_freetype_enabled = "yes"
module_webp_enabled = "yes"
module_ogg_enabled = "yes"
module_vorbis_enabled = "yes"
module_theora_enabled = "no"
module_regex_enabled = "yes"
```

```bash
scons platform=windows target=template_release
# Expected result: ~12-18 MB (down from ~90 MB)
```

### Recipe: 3D Game with Networking

```python
# custom.py — 3D multiplayer, no VR/CSG
production = "yes"
lto = "full"
debug_symbols = "no"
module_openxr_enabled = "no"
module_webxr_enabled = "no"
module_mobile_vr_enabled = "no"
module_csg_enabled = "no"
module_gridmap_enabled = "no"
module_camera_enabled = "no"
```

### Post-Build Stripping

```bash
# Linux/macOS — strip debug symbols if not already done
strip godot.linuxbsd.template_release.x86_64

# Windows — use strip from MinGW or MSVC's editbin
x86_64-w64-mingw32-strip godot.windows.template_release.x86_64.exe

# UPX compression (optional, may trigger antivirus false positives on Windows)
upx --best godot.linuxbsd.template_release.x86_64
```

---

## 9. Building for Each Platform

### Windows

```bash
# Requires Visual Studio or MinGW-w64
scons platform=windows target=template_release arch=x86_64 production=yes lto=full
scons platform=windows target=template_debug arch=x86_64
```

### Linux

```bash
scons platform=linuxbsd target=template_release arch=x86_64 production=yes lto=full
scons platform=linuxbsd target=template_debug arch=x86_64
```

### macOS (Universal Binary)

```bash
# Build for both architectures, then combine
scons platform=macos target=template_release arch=x86_64 production=yes lto=full
scons platform=macos target=template_release arch=arm64 production=yes lto=full
lipo -create \
    bin/godot.macos.template_release.x86_64 \
    bin/godot.macos.template_release.arm64 \
    -output bin/godot.macos.template_release.universal
```

### Web

```bash
# Requires Emscripten SDK
source /path/to/emsdk/emsdk_env.sh
scons platform=web target=template_release production=yes lto=full
# Output: godot.web.template_release.wasm32.zip
```

### Android

```bash
# Requires Android SDK + NDK
export ANDROID_HOME=/path/to/android-sdk
scons platform=android target=template_release arch=arm64 production=yes lto=full
scons platform=android target=template_release arch=arm32 production=yes lto=full
# Then generate the AAR/APK using Gradle in platform/android/
cd platform/android/java && ./gradlew generateGodotTemplates
```

---

## 10. Using Custom Templates in the Editor

### Per-Project

1. In the Godot editor, go to **Project → Export**
2. Select your export preset
3. Under **Custom Template**, set:
   - **Debug:** path to your `template_debug` binary
   - **Release:** path to your `template_release` binary
4. Export normally

### Global (All Projects)

Place templates in the editor's template directory:

```
# Linux/macOS
~/.local/share/godot/export_templates/4.6.stable/

# Windows
%APPDATA%/Godot/export_templates/4.6.stable/

# Replace the default binaries with your custom ones
# Keep the exact filenames the editor expects
```

---

## 11. CI/CD Automation with GitHub Actions

```yaml
# .github/workflows/build-templates.yml
name: Build Custom Export Templates

on:
  push:
    tags: ['v*']
  workflow_dispatch:

jobs:
  build-template:
    strategy:
      matrix:
        include:
          - platform: windows
            os: windows-latest
            arch: x86_64
          - platform: linuxbsd
            os: ubuntu-22.04
            arch: x86_64
          - platform: web
            os: ubuntu-22.04
            arch: wasm32

    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4

      - name: Clone Godot source
        run: |
          git clone --branch 4.6-stable --depth 1 \
            https://github.com/godotengine/godot.git

      - name: Setup Python & SCons
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'
      - run: pip install scons

      - name: Setup Emscripten (Web only)
        if: matrix.platform == 'web'
        uses: mymindstorm/setup-emsdk@v14
        with:
          version: '3.1.62'

      - name: Copy build profile
        run: cp my_game.build godot/my_game.build

      - name: Build template
        working-directory: godot
        run: |
          scons platform=${{ matrix.platform }} \
                target=template_release \
                arch=${{ matrix.arch }} \
                production=yes \
                lto=full \
                build_profile=my_game.build

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: template-${{ matrix.platform }}-${{ matrix.arch }}
          path: godot/bin/godot.*
```

---

## 12. Measuring & Validating Results

### Before/After Size Comparison

```bash
# Compare default vs custom template sizes
echo "Default template:"
ls -lh ~/.local/share/godot/export_templates/4.6.stable/linux_release.x86_64

echo "Custom template:"
ls -lh ./bin/godot.linuxbsd.template_release.x86_64
```

### Functional Validation

```gdscript
## validation_scene.gd — Run this in your exported build to verify
## all required features work after stripping.
extends Node

func _ready() -> void:
    var results: Array[String] = []

    # Test features your game needs
    results.append("GDScript: OK")

    if ClassDB.class_exists("NavigationServer2D"):
        results.append("Navigation2D: OK")
    else:
        results.append("Navigation2D: STRIPPED (expected if disabled)")

    if ClassDB.class_exists("RigidBody3D"):
        results.append("Physics3D: OK")
    else:
        results.append("Physics3D: STRIPPED")

    for r in results:
        print(r)
```

```csharp
// C# equivalent
using Godot;

public partial class ValidationScene : Node
{
    public override void _Ready()
    {
        GD.Print($"GDScript available: {ClassDB.ClassExists("GDScript")}");
        GD.Print($"Navigation2D available: {ClassDB.ClassExists("NavigationServer2D")}");
        GD.Print($"XR available: {ClassDB.ClassExists("XRServer")}");
    }
}
```

---

## 13. Common Mistakes

| Mistake | Consequence | Fix |
|---------|------------|-----|
| Template version doesn't match editor | Crash on export or runtime errors | Always build from the exact tag matching your editor |
| Stripping a module your game uses | Crash or missing functionality at runtime | Use the editor's auto-detect feature before stripping |
| Forgetting `production=yes` | Larger binary, no production optimizations | Always include for release templates |
| Not building both debug and release | Can't debug exported builds | Build `template_debug` alongside `template_release` |
| Using UPX on Windows | Antivirus false positives | Avoid UPX for Windows releases; use LTO instead |
| Disabling `text_server_adv` | No complex text (Arabic, Hindi, CJK) | Keep it unless your game is ASCII-only |
| Not testing on target platform | Works on dev machine, crashes on player's | Test stripped builds on clean machines / VMs |
