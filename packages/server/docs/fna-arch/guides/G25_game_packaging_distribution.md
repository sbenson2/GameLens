# G25 — Game Packaging and Distribution

> **Category:** guide · **Engine:** FNA · **Related:** [G01 Getting Started](./G01_getting_started.md) · [G02 NativeAOT Publishing](./G02_nativeaot_publishing.md) · [G08 Cross-Platform Deployment](./G08_cross_platform_deployment.md) · [G23 Console Porting](./G23_console_porting_nativeaot.md) · [FNA Architecture Rules](../fna-arch-rules.md)

How to package an FNA game for distribution on Steam, itch.io, GOG, and direct download. Covers fnalibs bundling per platform, directory layout, .NET runtime vs NativeAOT trade-offs, launcher scripts, Steam Deck / Linux considerations, and store-specific requirements.

---

## Distribution Build Types

FNA games can ship in two forms. Choose based on your requirements:

| | .NET Runtime (Framework-Dependent) | NativeAOT (Self-Contained) |
|---|---|---|
| **Binary** | `.dll` + .NET runtime | Single native executable |
| **Size** | ~5–15 MB game + ~60 MB runtime | ~15–40 MB total |
| **Startup** | JIT warmup (~0.5–2s) | Instant (<100ms) |
| **Dependencies** | .NET 8 runtime required | None (self-contained) |
| **Best for** | Development, rapid iteration | Store distribution, consoles |
| **Debugging** | Full .NET diagnostics | Limited (native debugger) |

For store distribution (Steam, itch.io, GOG), **NativeAOT is recommended** — no runtime dependency means fewer support tickets.

## fnalibs: Native Library Bundling

Every FNA game requires native libraries (fnalibs) alongside the game executable. These are **not** NuGet packages — they are platform-specific shared libraries.

### Required Libraries

| Library | Windows | Linux | macOS |
|---------|---------|-------|-------|
| SDL3 | `SDL3.dll` | `libSDL3.so.0` | `libSDL3.dylib` |
| FNA3D | `FNA3D.dll` | `libFNA3D.so.0` | `libFNA3D.dylib` |
| FAudio | `FAudio.dll` | `libFAudio.so.0` | `libFAudio.dylib` |
| Theorafile | `Theorafile.dll` | `libTheorafile.so.0` | `libTheorafile.dylib` |
| SPIRV-Cross | `spirv-cross-c-shared.dll` | `libspirv-cross-c-shared.so.0` | `libspirv-cross-c-shared.dylib` |

Optional: `dav1dfile` (only if using AV1 video playback).

### Where to Get fnalibs

Download prebuilt binaries from the FNA repository or build from source:

```bash
# Clone fnalibs (prebuilt binaries)
git clone https://github.com/FNA-XNA/fnalibs.git

# Or build from source (requires CMake + platform toolchain)
cd FNA3D && mkdir build && cd build
cmake .. -DSDL3_DIR=/path/to/SDL3
cmake --build . --config Release
```

### Directory Layout

Place fnalibs in the same directory as your game executable:

```
MyGame/
├── MyGame.exe              # (Windows) or MyGame (Linux/macOS)
├── SDL3.dll                # Windows fnalibs
├── FNA3D.dll
├── FAudio.dll
├── Theorafile.dll
├── spirv-cross-c-shared.dll
├── Content/                # Game assets
│   ├── Textures/
│   ├── Audio/
│   ├── Shaders/
│   └── Fonts/
└── lib/                    # (optional) Linux/macOS libs in subdirectory
    ├── lib64/              # Linux x86_64
    │   ├── libSDL3.so.0
    │   ├── libFNA3D.so.0
    │   └── ...
    └── osx/                # macOS universal
        ├── libSDL3.dylib
        ├── libFNA3D.dylib
        └── ...
```

## Platform-Specific Packaging

### Windows

The simplest platform. NativeAOT produces a single `.exe`:

```bash
dotnet publish -c Release -r win-x64 /p:PublishAot=true
```

Package the output with Windows fnalibs and Content directory. No installer required — a zip archive works for most stores.

**Visual C++ Runtime:** NativeAOT may require the Visual C++ Redistributable. Either bundle it or use a static link:

```xml
<!-- In .csproj for static CRT linking -->
<PropertyGroup>
  <InvariantGlobalization>true</InvariantGlobalization>
  <StaticExecutable>true</StaticExecutable>
</PropertyGroup>
```

### Linux

Linux requires a launcher script to set the library search path:

```bash
#!/bin/bash
# MyGame.sh — Linux launcher
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
export LD_LIBRARY_PATH="$SCRIPT_DIR/lib/lib64:$LD_LIBRARY_PATH"
exec "$SCRIPT_DIR/MyGame" "$@"
```

```bash
# Build
dotnet publish -c Release -r linux-x64 /p:PublishAot=true
```

**Steam Deck:** FNA games work on Steam Deck through Proton (Windows build) or natively (Linux build). Native Linux builds are preferred:
- Steam Deck is x86_64 Linux — your `linux-x64` build runs directly
- SDL3 handles the Steam Deck's gamepad and display natively
- Set the Steam launch options to use the launcher script

### macOS

macOS requires an `.app` bundle structure:

```
MyGame.app/
└── Contents/
    ├── Info.plist
    ├── MacOS/
    │   ├── MyGame                    # Native executable
    │   ├── libSDL3.dylib
    │   ├── libFNA3D.dylib
    │   ├── libFAudio.dylib
    │   ├── libTheorafile.dylib
    │   └── libspirv-cross-c-shared.dylib
    └── Resources/
        ├── Content/                  # Game assets
        ├── MyGame.icns               # App icon
        └── en.lproj/
```

```bash
# Build
dotnet publish -c Release -r osx-x64 /p:PublishAot=true
# Or for Apple Silicon:
dotnet publish -c Release -r osx-arm64 /p:PublishAot=true
```

**Code signing and notarization** are required for distribution outside the Mac App Store:

```bash
codesign --deep --force --sign "Developer ID Application: Your Name" MyGame.app
xcrun notarytool submit MyGame.zip --apple-id you@example.com --team-id TEAM_ID --wait
xcrun stapler staple MyGame.app
```

## Store-Specific Requirements

### Steam

Steam uses Steamworks SDK for achievements, cloud saves, and DRM. FNA does not integrate Steamworks directly — use `Steamworks.NET` (C# bindings):

```csharp
// Steamworks.NET is compatible with FNA — add as a NuGet package or source reference
// Initialize early in your Game constructor
SteamAPI.Init();
```

**Steam Input:** SDL3 has built-in Steam Input support. FNA games using SDL3 for input automatically support Steam Controller configurations, including Steam Deck controls.

**Depot structure** (recommended):

```
Depot 1 (Windows): MyGame.exe + Windows fnalibs + Content/
Depot 2 (Linux):   MyGame + launcher.sh + Linux fnalibs + Content/
Depot 3 (macOS):   MyGame.app bundle
```

### itch.io

itch.io accepts zip archives per platform. Use butler for uploads:

```bash
# Install butler
curl -L https://broth.itch.ovh/butler/linux-amd64/LATEST/archive/default | tar xz

# Upload each platform build
butler push build/windows/ yourname/yourgame:windows
butler push build/linux/   yourname/yourgame:linux
butler push build/macos/   yourname/yourgame:mac
```

### GOG

GOG requires an offline installer. Use GOG Galaxy SDK for achievements (optional). Package similarly to Steam but without Steamworks dependencies.

## Content Directory Considerations

### Relative Path Loading

FNA's `ContentManager` resolves paths relative to `Content.RootDirectory`, which defaults to `"Content"`. Ensure this directory is at the expected location relative to the executable:

```csharp
Content.RootDirectory = "Content";
// Resolves to: <executable_dir>/Content/
```

### Case Sensitivity

Linux and macOS file systems may be case-sensitive. Ensure all content file references match the actual filenames exactly:

```csharp
// BAD — may work on Windows, fails on Linux
Content.Load<Texture2D>("textures/Player");

// GOOD — matches actual file path
Content.Load<Texture2D>("Textures/Player");
```

### Asset Size and Compression

- **Textures:** Ship as PNG or DDS. FNA loads both via `Texture2D.FromStream()` or content pipeline
- **Audio:** Ogg Vorbis is the standard format. Smaller than WAV, widely supported
- **Video:** Ogg Theora (standard) or AV1 via dav1dfile (better compression, newer)

## Build Automation

A complete build script for all three desktop platforms:

```bash
#!/bin/bash
# build-all.sh — Build for all desktop platforms
set -e

GAME="MyGame"
OUT="dist"

# Clean
rm -rf "$OUT"

# Build each platform
for RID in win-x64 linux-x64 osx-x64 osx-arm64; do
    echo "Building $RID..."
    dotnet publish -c Release -r "$RID" /p:PublishAot=true \
        -o "$OUT/$RID"
done

# Copy fnalibs per platform
cp fnalibs/windows/* "$OUT/win-x64/"
cp fnalibs/linux/*   "$OUT/linux-x64/lib/lib64/"
cp fnalibs/macos/*   "$OUT/osx-x64/"
cp fnalibs/macos/*   "$OUT/osx-arm64/"

# Copy content to each
for RID in win-x64 linux-x64 osx-x64 osx-arm64; do
    cp -r Content "$OUT/$RID/Content"
done

echo "Done. Builds in $OUT/"
```

## FNA vs MonoGame: Distribution Differences

| Aspect | FNA | MonoGame |
|--------|-----|----------|
| **Native libs** | Manual fnalibs bundling | NuGet handles native dependencies |
| **Content format** | FXC shaders + raw/MGCB content | MGCB pipeline (per-platform) |
| **Runtime** | .NET or NativeAOT | .NET or NativeAOT |
| **Single binary** | Yes (all platforms use same FNA) | Per-platform content builds |
| **Store SDKs** | Manual integration (Steamworks.NET etc.) | Same — manual integration |

FNA's approach requires more manual setup for fnalibs but gives you explicit control over every dependency. MonoGame's NuGet-based approach is more automated but less transparent.
