# G08 — Cross-Platform Deployment & fnalibs Management

> **Category:** guide · **Engine:** FNA · **Related:** [G01 Getting Started](./G01_getting_started.md) · [G02 NativeAOT Publishing](./G02_nativeaot_publishing.md) · [G06 Content Loading](./G06_content_loading_without_pipeline.md)

How to ship an FNA game to Windows, Linux, and macOS. Covers fnalibs structure, per-platform library placement, `dotnet publish` workflows, platform-specific quirks, and a CI-friendly build matrix that produces one distributable per OS from a single codebase.

---

## fnalibs: What They Are

FNA delegates platform I/O to a set of native libraries collectively called **fnalibs**. These provide the SDL2 platform layer, MojoShader for graphics translation, FAudio for sound, and image/video decoders. Your game's C# code calls FNA's managed API; FNA P/Invokes into fnalibs; fnalibs talk to the OS.

```
Your Game (C#)  ──►  FNA (managed)  ──►  fnalibs (native)  ──►  OS / GPU / Audio
                                          ├── SDL2
                                          ├── FNA3D (MojoShader)
                                          ├── FAudio
                                          ├── SDL2_image (libpng, libjpeg, etc.)
                                          └── Theorafile (video playback)
```

**You must ship fnalibs with your game.** They are not optional. Without them, your game will crash on startup with a `DllNotFoundException`.

### Downloading fnalibs

The official fnalibs archive is maintained by the FNA team and updated alongside FNA releases. Download the latest from:

```
https://fna.flibitijibibo.com/archive/fnalibs.tar.bz2
```

Extract the archive. It contains platform-specific subdirectories:

```
fnalibs/
├── x86/       # 32-bit Windows (rarely needed today)
├── x64/       # 64-bit Windows
├── lib64/     # 64-bit Linux (x86_64)
├── lib-arm64/ # ARM64 Linux (Steam Deck native, Raspberry Pi)
└── osx/       # macOS Universal (x86_64 + ARM64 fat binaries)
```

---

## Publishing with `dotnet publish`

FNA targets .NET 6+ (or .NET 8 recommended). Use `dotnet publish` with a runtime identifier to produce a self-contained deployment:

```bash
# Windows x64
dotnet publish -r win-x64 -c Release --self-contained

# Linux x64
dotnet publish -r linux-x64 -c Release --self-contained

# macOS (Universal via osx-x64 or osx-arm64)
dotnet publish -r osx-x64 -c Release --self-contained
```

The output goes to `bin/Release/net8.0/<rid>/publish/`. Your game executable, all managed DLLs, and the .NET runtime are in this directory. Now you need to add the correct fnalibs.

---

## Per-Platform fnalibs Placement

Each OS loads native libraries from a different location relative to the executable. Getting this wrong is the single most common FNA deployment bug.

### Windows

Copy the contents of `fnalibs/x64/` directly alongside the `.exe`:

```
publish/
├── MyGame.exe
├── SDL2.dll
├── FNA3D.dll
├── FAudio.dll
├── SDL2_image.dll
└── libtheorafile.dll
```

Windows searches the executable's directory first for DLLs, so no extra configuration is needed.

### Linux

Copy the contents of `fnalibs/lib64/` into a subdirectory called `lib64` next to the executable:

```
publish/
├── MyGame                    # executable (no extension)
├── lib64/
│   ├── libSDL2-2.0.so.0
│   ├── libFNA3D.so.0
│   ├── libFAudio.so.0
│   ├── libSDL2_image-2.0.so.0
│   └── libtheorafile.so
└── MyGame.sh                 # launcher script (see below)
```

Create a launcher script that sets `LD_LIBRARY_PATH` so the game finds its bundled libs instead of system libs:

```bash
#!/bin/bash
# MyGame.sh — launcher that ensures bundled fnalibs are found
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export LD_LIBRARY_PATH="$SCRIPT_DIR/lib64:$LD_LIBRARY_PATH"
exec "$SCRIPT_DIR/MyGame" "$@"
```

Mark it executable: `chmod +x MyGame.sh`. Distribute the `.sh` as the launch target (Steam, itch.io, etc.).

**Why a launcher script?** Linux does not automatically search the executable's directory for shared libraries. Without `LD_LIBRARY_PATH`, the loader will try system-installed SDL2, which may be an incompatible version.

### macOS

Copy the contents of `fnalibs/osx/` alongside the executable:

```
publish/
├── MyGame                     # executable
├── libSDL2-2.0.0.dylib
├── libFNA3D.0.dylib
├── libFAudio.0.dylib
├── libSDL2_image-2.0.0.dylib
└── libtheorafile.dylib
```

Then add an rpath so the executable looks in its own directory first:

```bash
install_name_tool -add_rpath @executable_path ./publish/MyGame
```

**For .app bundles** (recommended for distribution), place the executable and libs inside the standard macOS structure:

```
MyGame.app/
└── Contents/
    ├── Info.plist
    ├── MacOS/
    │   ├── MyGame              # executable
    │   ├── libSDL2-2.0.0.dylib
    │   └── ... (all fnalibs)
    └── Resources/
        ├── Content/            # game assets
        └── MyGame.icns         # app icon
```

---

## Build Matrix for CI

A GitHub Actions or GitLab CI matrix that produces all three platform builds:

```yaml
# .github/workflows/build.yml
strategy:
  matrix:
    include:
      - os: windows-latest
        rid: win-x64
        fnalibs_dir: x64
        lib_dest: "."
      - os: ubuntu-latest
        rid: linux-x64
        fnalibs_dir: lib64
        lib_dest: lib64
      - os: macos-latest
        rid: osx-x64
        fnalibs_dir: osx
        lib_dest: "."

steps:
  - uses: actions/checkout@v4
    with:
      submodules: true  # FNA is typically a submodule

  - uses: actions/setup-dotnet@v4
    with:
      dotnet-version: '8.0.x'

  - name: Download fnalibs
    run: |
      curl -sL https://fna.flibitijibibo.com/archive/fnalibs.tar.bz2 | tar xj

  - name: Publish
    run: dotnet publish -r ${{ matrix.rid }} -c Release --self-contained

  - name: Copy fnalibs
    run: |
      mkdir -p publish/${{ matrix.lib_dest }}
      cp fnalibs/${{ matrix.fnalibs_dir }}/* publish/${{ matrix.lib_dest }}/
```

---

## Compatibility with MonoGame

FNA and MonoGame share the XNA 4.0 API surface but differ in native dependencies:

| Aspect | FNA | MonoGame |
|---|---|---|
| Native libs | fnalibs (SDL2, MojoShader, FAudio) | Bundled in NuGet package |
| Shader format | DXBC via FXC (see [G07](./G07_shader_compilation_fxc.md)) | MGFX (custom format) |
| Content pipeline | Optional — direct file loading works (see [G06](./G06_content_loading_without_pipeline.md)) | MGCB pipeline required |
| NuGet packaging | Manual — FNA is a source/submodule dependency | `dotnet add package MonoGame.Framework` |

If you're porting a MonoGame project to FNA, the C# game code is largely compatible. The main migration work is shader recompilation and replacing the content pipeline with direct file loading.

---

## Common Deployment Issues

**`DllNotFoundException: SDL2`** — fnalibs are missing or in the wrong directory. Double-check the per-platform placement above.

**"Wrong SDL2 version" on Linux** — The system's `libSDL2` is being loaded instead of your bundled one. Ensure the launcher script sets `LD_LIBRARY_PATH` before the system library paths.

**macOS Gatekeeper blocks the app** — Unsigned apps are quarantined. For testing, `xattr -cr MyGame.app` removes the quarantine flag. For distribution, sign with an Apple Developer certificate or distribute through a platform like Steam that handles signing.

**Game runs on dev machine but crashes on clean install** — You may be accidentally relying on the .NET SDK being installed. Use `--self-contained` to bundle the runtime, or use NativeAOT (see [G02](./G02_nativeaot_publishing.md)) for a single native binary.

**Steam Deck (Linux ARM64)** — Steam Deck runs x86_64 under Proton by default. If targeting native ARM64 Linux (no Proton), use `fnalibs/lib-arm64/` and publish with `-r linux-arm64`.

---

## Checklist Before Shipping

- [ ] `dotnet publish --self-contained` for each target platform
- [ ] Correct fnalibs placed in the right directory per platform
- [ ] Linux launcher script sets `LD_LIBRARY_PATH`
- [ ] macOS rpath added via `install_name_tool`
- [ ] Tested on a clean machine (no .NET SDK, no dev tools)
- [ ] Content files (textures, audio, fonts) copied to the publish output
- [ ] NativeAOT considered for platforms where startup time matters (see [G02](./G02_nativeaot_publishing.md))

---
