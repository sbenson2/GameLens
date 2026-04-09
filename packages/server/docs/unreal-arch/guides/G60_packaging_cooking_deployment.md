# Packaging, Cooking & Deployment Pipeline

> **Category:** guide · **Engine:** Unreal Engine · **Related:** [G59 Dedicated Server Setup](G59_dedicated_server_setup.md), [G20 Performance & Memory](G20_performance_optimization_memory.md), [G14 Asset Management](G14_asset_management.md)

End-to-end guide for building, cooking, packaging, and deploying Unreal Engine projects — covering build configurations, the cooking pipeline, platform targeting, pak files, IoStore, and common packaging issues. Applies to UE 5.4–5.5+.

## Build Configurations

Unreal Engine defines four build configurations that control optimization, debugging, and feature availability:

| Configuration | Optimization | Console Commands | Logging | Checks | Use Case |
|---|---|---|---|---|---|
| **DebugGame** | Minimal | Full | Full | All | Active debugging with symbols |
| **Development** | Moderate | Full | Full | Most | Day-to-day iteration and QA |
| **Test** | Full | Limited | Reduced | Minimal | Performance profiling, console cert testing |
| **Shipping** | Full | Disabled | Minimal | None | Final release builds |

### Choosing a Configuration

- **Development**: Default for iteration. Includes all console commands, stat overlays, and logging. Packages include debug symbols.
- **Test**: Use for performance profiling — matches Shipping optimizations but retains stat commands and limited console access. Required for some console certification pre-checks.
- **Shipping**: Final release. Strips all dev tools, disables `stat` commands, removes drawing debug helpers. Code guarded by `UE_BUILD_SHIPPING` is excluded.

```cpp
#if !UE_BUILD_SHIPPING
    // Debug visualization — stripped from Shipping builds
    DrawDebugSphere(GetWorld(), Location, 50.f, 12, FColor::Red, false, 5.f);
#endif
```

## The Cooking Pipeline

**Cooking** converts assets from their editor format into platform-optimized runtime formats. This is the most time-consuming part of packaging.

### What Cooking Does

1. **Asset conversion**: Textures are compressed to platform-native formats (BC7 for PC, ASTC for mobile, etc.).
2. **Shader compilation**: Materials compile to platform-specific shader bytecode.
3. **Blueprint nativization** (optional): Converts Blueprint bytecode to C++ for faster execution.
4. **Reference resolution**: Follows asset references to determine what to include.
5. **Localization**: Bakes in text and audio for selected cultures.

### Cook Methods

| Method | Command | When to Use |
|---|---|---|
| **Cook on the fly** | Editor Play or Launch | Development iteration — cooks assets as needed |
| **Cook by the book** | Full packaging | Release builds — cooks all referenced assets upfront |

### Iterative Cooking

UE 5.4+ supports **iterative cooking** — only re-cooks assets that have changed since the last cook. Enable via:

```ini
[/Script/UnrealEd.ProjectPackagingSettings]
bIterativeCooking=True
```

This can reduce subsequent cook times from hours to minutes on large projects.

### Zen Server (UE 5.5 — Production Ready)

The **Unreal Zen Server** provides a shared Derived Data Cache (DDC) and can stream cooked data to target platforms. In UE 5.5, Zen Server reached production-ready status.

```ini
; DefaultEngine.ini — Connect to a Zen Server
[DerivedDataBackendGraph]
Shared=(Type=Http, Host=zen-server.local, Port=1337)
```

Benefits: teams share cooked data so each developer doesn't re-cook the same assets. Zen Server also streams cooked content directly to target devices for faster iteration.

## Packaging

### From the Editor

1. **File → Package Project → [Platform]** or use the **Platforms** dropdown in the toolbar.
2. Select the build configuration (Development, Test, Shipping).
3. Choose an output directory.
4. The editor runs `UnrealBuildTool` → `Cook` → `Stage` → `Archive` in sequence.

### From Command Line (RunUAT)

```bash
# Full package pipeline — Windows, Shipping
RunUAT.bat BuildCookRun \
    -project="MyGame.uproject" \
    -noP4 \
    -platform=Win64 \
    -clientconfig=Shipping \
    -build -cook -stage -pak -archive \
    -archivedirectory="C:/Builds/Win64" \
    -nodebuginfo \
    -compressed
```

#### Key RunUAT Flags

| Flag | Description |
|---|---|
| `-build` | Compile C++ binaries |
| `-cook` | Cook all content |
| `-stage` | Copy to staging directory |
| `-pak` | Package into `.pak` files |
| `-archive` | Copy final build to archive directory |
| `-compressed` | Compress pak file contents |
| `-nodebuginfo` | Strip debug symbols (smaller builds) |
| `-iterativecooking` | Only re-cook changed assets |
| `-distribution` | Enable distribution signing (required for some stores) |
| `-prereqs` | Include prerequisite installers |

### Staging Directory Structure

After packaging, the staging directory looks like this:

```
WindowsNoEditor/
├── MyGame/
│   ├── Binaries/
│   │   └── Win64/
│   │       ├── MyGame.exe
│   │       └── MyGame-Win64-Shipping.pdb  (if debug info included)
│   ├── Content/
│   │   └── Paks/
│   │       ├── MyGame-WindowsNoEditor.pak
│   │       └── global.utoc / global.ucas  (IoStore, UE 5.x)
│   └── Config/
├── Engine/
│   ├── Binaries/
│   ├── Content/
│   │   └── Paks/
│   └── Config/
└── MyGame.exe  (top-level launcher)
```

## Pak Files and IoStore

### Pak Files (`.pak`)

Pak files are Unreal's archive format for cooked content. All assets are bundled into one or more `.pak` files that the engine mounts at runtime.

**Chunk-based splitting**: Assign assets to numbered chunks for download-on-demand (DLC, streaming installs):

```ini
; In your packaging settings or asset manager rules
[/Script/UnrealEd.ProjectPackagingSettings]
bGenerateChunks=True
```

### IoStore (`.ucas` / `.utoc`)

UE 5.x introduced **IoStore** as a more efficient container format alongside pak files:

- `.utoc` — Table of contents (asset offsets, sizes)
- `.ucas` — Container archive store (actual data)

IoStore provides faster asset loading through optimized I/O scheduling. It is the default for UE 5.x projects and works alongside `.pak` files.

```ini
; Enable IoStore (on by default in UE 5.x)
[/Script/UnrealEd.ProjectPackagingSettings]
bUseIoStore=True
```

## Platform-Specific Packaging

### Windows

Standard packaging works out of the box. For Steam distribution, include the Steamworks SDK redistributables:

```ini
[/Script/UnrealEd.ProjectPackagingSettings]
IncludedPrerequisites=SteamRedist
```

### Linux

Requires either native Linux build or cross-compilation from Windows (install the cross-compile toolchain and set `LINUX_MULTIARCH_ROOT`).

### Android

```bash
# Setup Android SDK/NDK in Editor: Project Settings → Platforms → Android
# Required: Android SDK 34+, NDK r25+, JDK 17

RunUAT.bat BuildCookRun \
    -project="MyGame.uproject" \
    -platform=Android \
    -clientconfig=Shipping \
    -build -cook -stage -pak -archive \
    -cookflavor=Multi
```

Key Android settings:
- **Texture format**: ASTC (modern default), ETC2 (wider compatibility)
- **Package type**: `.apk` (single) or `.aab` (Android App Bundle for Play Store)
- **Min SDK**: API 28+ recommended for UE 5.5

### iOS

```bash
# Requires macOS with Xcode installed
# Must configure provisioning profiles and signing certificates

RunUAT.bat BuildCookRun \
    -project="MyGame.uproject" \
    -platform=IOS \
    -clientconfig=Shipping \
    -build -cook -stage -pak -archive
```

Starting April 2026, Apple requires apps built with Xcode 26 and the iOS 26 SDK for App Store submission.

### Consoles (PlayStation, Xbox, Nintendo Switch)

Console packaging requires:
1. Approved developer status with the platform holder.
2. Platform-specific SDK installed alongside the UE source build.
3. Console-specific Target files (e.g., `MyGamePS5.Target.cs`).
4. NDAs prevent documenting specific APIs here — refer to each platform's dev portal.

## Build Size Optimization

### Strategies to Reduce Package Size

1. **Exclude unused plugins**: Disable plugins you don't use in `.uproject`:
   ```json
   {
       "Name": "OnlineSubsystemSteam",
       "Enabled": false
   }
   ```

2. **Asset audit**: Use **Size Map** (Window → Developer Tools → Size Map) to identify large assets.

3. **Texture compression**: Ensure textures use appropriate compression and max resolution for the target platform.

4. **Strip editor-only data**:
   ```ini
   [/Script/UnrealEd.ProjectPackagingSettings]
   bExcludeEditorContent=True
   ```

5. **Pak file compression**: Enable with `-compressed` flag or:
   ```ini
   [/Script/UnrealEd.ProjectPackagingSettings]
   bCompressed=True
   ```

6. **Shader permutation reduction**: Disable unused shader features in Project Settings → Rendering to reduce shader compilation time and package size.

## Troubleshooting Common Issues

### "Cook Failed" Errors

- **Missing references**: An asset references a deleted asset. Use **Reference Viewer** to find and fix broken references.
- **Shader compilation errors**: Check `Saved/Logs/Cook.log` for the specific material. Test materials individually with `cook -map=YourMap` on command line.

### Build Configuration Mismatch (UE 5.5–5.6)

Some developers report that selecting `Shipping` in Project Settings still produces a `Development` build. Workaround: use the command-line `RunUAT` approach with explicit `-clientconfig=Shipping` to guarantee the correct configuration.

### "Package Too Large" for Mobile

- Enable texture streaming and reduce max texture sizes.
- Use **Android App Bundles** (`.aab`) to let the Play Store deliver only the assets needed for each device.
- Split content into base + on-demand chunks.

### Slow Cook Times

- Enable **iterative cooking** to only re-cook changed assets.
- Deploy a **Zen Server** for shared DDC across the team.
- Use **Derived Data Cache** (local SSD) and avoid network drives for cache storage.
- Reduce shader permutations by disabling unused rendering features.
