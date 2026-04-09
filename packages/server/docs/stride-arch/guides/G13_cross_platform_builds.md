# G13 — Cross-Platform Builds: Developing on Linux & macOS

> **Category:** guide · **Engine:** Stride · **Related:** [G01 Getting Started](./G01_getting_started.md) · [G08 Stride 4.3 Migration](./G08_stride_43_migration.md) · [G03 Code-Only Development](./G03_code_only_development.md) · [G07 Custom Render Features](./G07_custom_render_features.md)

Stride 4.3 adds first-class cross-platform build support — you can now compile Stride games on Linux and macOS, not just Windows. This guide covers the toolchain changes that made this possible, how to set up a Linux or macOS build environment, what works and what doesn't yet, and how to structure CI/CD pipelines for multi-platform game builds.

---

## What Changed in 4.3

Prior to Stride 4.3, building a Stride project required Windows. The asset compiler, model importers, and several native dependencies were Windows-only. Stride 4.3 resolves this through several key changes:

- **Assimp replaces C++/CLI FBX importer** — the legacy model importer used C++/CLI interop with the Autodesk FBX SDK, which only compiles on Windows with Visual Studio. Stride 4.3 replaces this with [Assimp](https://github.com/assimp/assimp) (Open Asset Import Library), which is cross-platform and supports FBX, glTF, OBJ, Collada, and 40+ other formats.

- **Asset compiler fixed for all desktop OSes** — the `Stride.Assets.CompilerApp` now runs on Linux and macOS. Previously it had Windows-specific path handling, registry lookups, and COM dependencies that prevented non-Windows execution.

- **VHACD compilation for Linux** — V-HACD (Volumetric Hierarchical Approximate Convex Decomposition), used to generate collision meshes from 3D models, now compiles on Linux.

- **Cross-platform FreeImage and DirectXTex** — image processing libraries used by the asset pipeline have been ported or replaced with cross-platform alternatives.

---

## Setting Up a Linux Build Environment

### Prerequisites

```bash
# Ubuntu 22.04+ / Debian 12+
sudo apt update
sudo apt install -y \
  dotnet-sdk-10.0 \
  libvulkan-dev \
  libsdl2-dev \
  libassimp-dev \
  libfreetype-dev \
  libfontconfig-dev

# Verify .NET 10
dotnet --version  # Should show 10.x.x
```

### Clone and Build

```bash
# Clone a Stride 4.3 project (or create from template)
git clone https://github.com/your-org/your-stride-game.git
cd your-stride-game

# Restore and build
dotnet restore
dotnet build -c Release
```

### Running Without Game Studio

Game Studio (the visual editor) remains Windows-only. On Linux and macOS, you work in **code-only mode** (see [G03](./G03_code_only_development.md)):

```bash
# Run the game directly
dotnet run --project YourGame/YourGame.csproj -c Release
```

Edit scenes and assets either:
- On a Windows machine with Game Studio, commit changes, pull on Linux
- Programmatically in code using Stride's scene API
- Using the Stride Community Toolkit's scene utilities

---

## Setting Up a macOS Build Environment

### Prerequisites

```bash
# Install .NET 10 SDK via Homebrew
brew install dotnet@10

# Install native dependencies
brew install assimp freetype sdl2

# Verify
dotnet --version
```

### Metal Backend

On macOS, Stride uses the **Vulkan backend via MoltenVK** (Vulkan-to-Metal translation layer). MoltenVK is bundled with the Vulkan SDK:

```bash
# Install Vulkan SDK for macOS
# Download from https://vulkan.lunarg.com/sdk/home#mac
# Or via Homebrew:
brew install --cask vulkan-sdk
```

Performance on macOS will be slightly lower than native Metal due to the translation layer, but it's fully functional for development and testing.

---

## What Works Cross-Platform

| Feature | Linux | macOS | Notes |
|---------|-------|-------|-------|
| Code compilation | Yes | Yes | .NET 10 SDK required |
| Asset compilation | Yes | Yes | Assimp-based importers |
| Vulkan rendering | Yes | Via MoltenVK | Full feature parity |
| Bepu Physics | Yes | Yes | Pure C#, no native deps |
| Audio (OpenAL) | Yes | Yes | Standard on both platforms |
| Shader compilation (SDSL) | Yes | Yes | Cross-compiled to SPIR-V |
| Game Studio editor | No | No | Windows-only (WPF) |
| Live asset hot-reload | Limited | Limited | Works for code, not editor assets |

---

## What Doesn't Work Yet

- **Game Studio** — the visual editor is built on WPF and remains Windows-only. There is no timeline for a cross-platform editor. Use code-only development or a hybrid workflow.

- **Some asset importers** — while the core FBX/glTF pipeline works via Assimp, certain specialized importers (e.g., some Photoshop PSD importers) may still have Windows dependencies. Test your specific asset pipeline early.

- **Video playback** — the `VideoComponent` relies on platform-specific media frameworks. Linux support is experimental.

---

## Hybrid Workflow: Editor on Windows, Build on Linux

The practical workflow for most teams:

1. **Art and level design** on Windows using Game Studio
2. **Commit assets** (scenes, prefabs, materials) to version control — these are serialized as YAML/binary and are platform-independent
3. **Build and test** on Linux CI or development machines
4. **Ship Linux builds** from Linux CI

```
┌──────────────────┐     git push     ┌───────────────────┐
│  Windows + Game   │ ──────────────→ │  Linux CI Server   │
│  Studio (design)  │                 │  (build + test)    │
└──────────────────┘                  └───────────────────┘
                                            │
                                            ▼
                                    ┌───────────────────┐
                                    │  Linux Game Build  │
                                    │  (.NET 10 + VK)    │
                                    └───────────────────┘
```

---

## CI/CD Pipeline Example

### GitHub Actions (Linux Build)

```yaml
name: Build Stride Game (Linux)

on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-24.04
    steps:
      - uses: actions/checkout@v4

      - name: Setup .NET 10
        uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '10.0.x'

      - name: Install native dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y \
            libvulkan-dev libsdl2-dev libassimp-dev \
            libfreetype-dev libfontconfig-dev

      - name: Restore
        run: dotnet restore

      - name: Build
        run: dotnet build -c Release --no-restore

      - name: Publish Linux build
        run: dotnet publish -c Release -r linux-x64 --self-contained -o ./publish

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: linux-build
          path: ./publish/
```

### GitLab CI

```yaml
build-linux:
  image: mcr.microsoft.com/dotnet/sdk:10.0
  stage: build
  before_script:
    - apt-get update && apt-get install -y
        libvulkan-dev libsdl2-dev libassimp-dev
        libfreetype-dev libfontconfig-dev
  script:
    - dotnet restore
    - dotnet build -c Release
    - dotnet publish -c Release -r linux-x64 --self-contained -o publish/
  artifacts:
    paths:
      - publish/
```

---

## IDE Support on Linux/macOS

Stride 4.3 added Rider and VSCode integration — Game Studio can launch projects in these editors on Windows, but more importantly, Rider and VSCode work natively on Linux and macOS for code-only development:

### JetBrains Rider

Rider provides the best non-Windows Stride experience:
- Full C# IntelliSense and refactoring
- .NET 10 debugging support
- NuGet package management for Stride packages
- Integrated terminal for build/run

### Visual Studio Code

With the C# Dev Kit extension:
- Syntax highlighting and IntelliSense for SDSL shaders
- Integrated debugging via `launch.json`
- Task runner for build/publish commands

---

## Troubleshooting

**Build fails with missing Assimp**: Ensure `libassimp-dev` (Linux) or `assimp` (macOS Homebrew) is installed. The asset compiler dynamically links to `libassimp.so` / `libassimp.dylib`.

**Vulkan validation errors on launch**: Install Vulkan validation layers (`vulkan-validationlayers` on Ubuntu) and check GPU driver support. Mesa drivers for AMD/Intel and NVIDIA proprietary drivers both support Vulkan on Linux.

**MoltenVK performance on macOS**: If you see unexpectedly low performance, check that MoltenVK is using Metal 2+ features. Set `MVK_CONFIG_USE_METAL_ARGUMENT_BUFFERS=1` for better descriptor performance.

**Shader compilation errors**: SDSL (Stride's shader language) compiles to SPIR-V for Vulkan. If you get shader compilation errors on Linux that don't appear on Windows, check for path separator issues in shader include paths (backslashes vs. forward slashes).
