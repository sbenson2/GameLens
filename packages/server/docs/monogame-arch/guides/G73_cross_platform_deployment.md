# G73 — Cross-Platform Deployment

> **Category:** Guide · **Engine:** MonoGame · **Related:** [G32 Deployment & Platform Builds](./G32_deployment_platform_builds.md) · [G36 Publishing & Distribution](./G36_publishing_distribution.md) · [G72 Content Builder Migration](./G72_content_builder_migration.md)

A comprehensive guide to building, packaging, and distributing MonoGame games across Windows, Linux, macOS, Android, and iOS. Covers `dotnet publish` configuration, self-contained deployments, NativeAOT compilation, platform-specific packaging (`.app` bundles, `.apk` files), and third-party bundling tools. Updated for MonoGame 3.8.2+ with .NET 8/9.

---

## Table of Contents

1. [Platform Overview](#1--platform-overview)
2. [DesktopGL — One Project, Three Platforms](#2--desktopgl--one-project-three-platforms)
3. [Publishing for Windows](#3--publishing-for-windows)
4. [Publishing for Linux](#4--publishing-for-linux)
5. [Publishing for macOS](#5--publishing-for-macos)
6. [Publishing for Android](#6--publishing-for-android)
7. [Publishing for iOS](#7--publishing-for-ios)
8. [NativeAOT Compilation](#8--nativeaot-compilation)
9. [Content Pipeline Considerations](#9--content-pipeline-considerations)
10. [Third-Party Packaging Tools](#10--third-party-packaging-tools)
11. [Distribution Checklist](#11--distribution-checklist)
12. [Common Deployment Issues](#12--common-deployment-issues)

---

## 1 — Platform Overview

MonoGame supports multiple platform targets through different project templates:

| Platform | Template | Graphics API | Notes |
|----------|----------|-------------|-------|
| Windows + Linux + macOS | DesktopGL | OpenGL / ANGLE | Single project, cross-compile from any OS |
| Windows only | WindowsDX | DirectX 11 | Better DirectX integration, Windows-only |
| Android | Android | OpenGL ES | Requires .NET MAUI workloads |
| iOS | iOS | OpenGL ES / Metal | Requires macOS + Xcode for builds |

**Recommendation:** Start with **DesktopGL** for desktop games. It lets you build for all three desktop platforms from a single project and codebase, and you can cross-compile from any OS (build a Linux release from Windows, or a Windows release from macOS).

---

## 2 — DesktopGL — One Project, Three Platforms

DesktopGL is MonoGame's cross-platform desktop target. A single project produces builds for Windows, Linux, and macOS.

### Base Publish Command

```bash
dotnet publish -c Release -r <runtime-id> \
    -p:PublishReadyToRun=false \
    -p:TieredCompilation=false \
    --self-contained
```

**Why `--self-contained`?** Self-contained deployments bundle the .NET runtime with your game, so players don't need to install .NET separately. This is strongly recommended for game distribution — players expect to download and run, not install prerequisites.

**Why disable `PublishReadyToRun` and `TieredCompilation`?** These JIT optimization features can cause startup hitches in games. Disabling them produces a more predictable runtime profile. For maximum startup performance, consider NativeAOT (Section 8).

### Runtime Identifiers

| Target | Runtime ID |
|--------|-----------|
| Windows x64 | `win-x64` |
| Windows ARM64 | `win-arm64` |
| Linux x64 | `linux-x64` |
| Linux ARM64 | `linux-arm64` |
| macOS x64 (Intel) | `osx-x64` |
| macOS ARM64 (Apple Silicon) | `osx-arm64` |

---

## 3 — Publishing for Windows

```bash
dotnet publish -c Release -r win-x64 \
    -p:PublishReadyToRun=false \
    -p:TieredCompilation=false \
    --self-contained
```

Output lands in `bin/Release/net8.0/win-x64/publish/`.

### Hiding the Console Window

DesktopGL projects may show a console window on Windows. To suppress it, add to your `.csproj`:

```xml
<PropertyGroup Condition="'$(RuntimeIdentifier)' == 'win-x64'">
    <OutputType>WinExe</OutputType>
</PropertyGroup>
```

Or set `<OutputType>WinExe</OutputType>` globally if you always want a windowless executable.

### Windows Distribution Options

- **Zip archive** — Simplest. Zip the publish folder and distribute.
- **Installer (Inno Setup, NSIS)** — Creates a `.exe` installer with shortcuts, uninstaller, and registry entries.
- **MSIX** — Modern Windows packaging for Microsoft Store distribution.
- **Steam** — Upload the publish folder contents via Steamworks.

---

## 4 — Publishing for Linux

```bash
dotnet publish -c Release -r linux-x64 \
    -p:PublishReadyToRun=false \
    -p:TieredCompilation=false \
    --self-contained
```

### Linux-Specific Considerations

**SDL2 dependency:** DesktopGL uses SDL2 for windowing and input. On most Linux distributions, SDL2 is preinstalled or easily available. Self-contained builds bundle the MonoGame SDL2 wrapper, but the system's `libSDL2` is still loaded at runtime.

**Permissions:** After extracting, the main executable may need the execute permission:

```bash
chmod +x MyGame
```

**Desktop entry:** For a polished Linux release, include a `.desktop` file:

```ini
[Desktop Entry]
Name=My Game
Exec=/opt/mygame/MyGame
Icon=/opt/mygame/icon.png
Type=Application
Categories=Game;
```

### Linux Distribution Options

- **Tarball (`.tar.gz`)** — Standard for Linux game distribution. Include a `README` and a launch script.
- **AppImage** — Single-file portable format. Players download one file and run it.
- **Flatpak / Snap** — Sandboxed distribution for Linux app stores.
- **Steam** — Upload via Steamworks with a Linux depot.

---

## 5 — Publishing for macOS

macOS requires builds for both Intel and Apple Silicon:

```bash
# Intel Macs
dotnet publish -c Release -r osx-x64 \
    -p:PublishReadyToRun=false \
    -p:TieredCompilation=false \
    --self-contained

# Apple Silicon (M1/M2/M3/M4)
dotnet publish -c Release -r osx-arm64 \
    -p:PublishReadyToRun=false \
    -p:TieredCompilation=false \
    --self-contained
```

### Creating a Universal Binary (Optional)

To ship a single binary supporting both architectures, use `lipo` to merge the two builds:

```bash
lipo -create \
    bin/Release/net8.0/osx-x64/publish/MyGame \
    bin/Release/net8.0/osx-arm64/publish/MyGame \
    -output MyGame.universal
```

This is optional — you can also ship separate x64 and arm64 downloads.

### Creating a macOS `.app` Bundle

macOS games need an `.app` bundle structure for proper distribution:

```
MyGame.app/
├── Contents/
│   ├── Info.plist          # App metadata (name, version, icon, bundle ID)
│   ├── MacOS/
│   │   └── MyGame          # The executable
│   ├── Resources/
│   │   ├── icon.icns       # App icon (use iconutil to create from PNG)
│   │   └── Content/        # Game content files
│   └── Frameworks/         # Native libraries (SDL2, etc.)
```

Minimal `Info.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
    "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>MyGame</string>
    <key>CFBundleIdentifier</key>
    <string>com.yourcompany.mygame</string>
    <key>CFBundleVersion</key>
    <string>1.0.0</string>
    <key>CFBundleExecutable</key>
    <string>MyGame</string>
    <key>CFBundleIconFile</key>
    <string>icon</string>
    <key>LSMinimumSystemVersion</key>
    <string>11.0</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
```

### Code Signing and Notarization

For distribution outside the Mac App Store, Apple requires code signing and notarization:

```bash
# Sign the app
codesign --deep --force --sign "Developer ID Application: Your Name (TEAMID)" MyGame.app

# Create a zip for notarization
ditto -c -k --keepParent MyGame.app MyGame.zip

# Submit for notarization
xcrun notarytool submit MyGame.zip --apple-id you@email.com --team-id TEAMID --password app-specific-password --wait

# Staple the notarization ticket
xcrun stapler staple MyGame.app
```

Without notarization, macOS Gatekeeper blocks the app by default. This step requires an Apple Developer account ($99/year).

---

## 6 — Publishing for Android

Android requires a separate MonoGame Android project and the .NET MAUI workloads:

```bash
# Install required workloads
dotnet workload install maui android
```

### Build and Sign

```bash
# Debug build (unsigned)
dotnet build -c Debug -f net8.0-android

# Release build (signed)
dotnet publish -c Release -f net8.0-android \
    -p:AndroidKeyStore=true \
    -p:AndroidSigningKeyStore=mygame.keystore \
    -p:AndroidSigningKeyAlias=mygame \
    -p:AndroidSigningKeyPass=yourpassword \
    -p:AndroidSigningStorePass=yourpassword
```

### Android-Specific Considerations

- **Minimum API level:** Set in `.csproj` via `<SupportedOSPlatformVersion>21.0</SupportedOSPlatformVersion>` (Android 5.0 Lollipop)
- **Screen orientation:** Configure in `AndroidManifest.xml` or via `[Activity(ScreenOrientation = ...)]`
- **Touch input:** Use `TouchPanel.GetState()` — works the same as on desktop
- **Performance:** Android devices vary enormously. Profile on low-end hardware early and often.
- **Content:** Android APKs package content as assets. The content pipeline builds content the same way; the Android project copies it into the APK.

---

## 7 — Publishing for iOS

iOS requires macOS with Xcode installed:

```bash
# Install required workloads
dotnet workload install maui ios

# Build for iOS Simulator (development)
dotnet build -c Debug -f net8.0-ios -r iossimulator-arm64

# Build for device (release)
dotnet publish -c Release -f net8.0-ios \
    -p:RuntimeIdentifier=ios-arm64 \
    -p:CodesignKey="iPhone Distribution: Your Name (TEAMID)" \
    -p:CodesignProvision="YourProvisioningProfile"
```

### iOS-Specific Considerations

- **Provisioning profiles and certificates:** Required for device builds and App Store submission. Manage through the Apple Developer portal.
- **Metal rendering:** iOS uses Metal. MonoGame's iOS target uses OpenGL ES via the MoltenGL compatibility layer, or Metal directly in newer versions.
- **App Store review:** Games must meet Apple's guidelines. Test thoroughly on physical devices before submission.

---

## 8 — NativeAOT Compilation

NativeAOT compiles your game to a native binary with no JIT dependency. This provides faster startup, smaller memory footprint, and no .NET runtime dependency.

```bash
dotnet publish -c Release -r win-x64 /p:PublishAot=true
```

### NativeAOT Project Configuration

Add to your `.csproj`:

```xml
<PropertyGroup>
    <PublishAot>true</PublishAot>
    <!-- Suppress trim warnings for MonoGame internals -->
    <SuppressTrimAnalysisWarnings>true</SuppressTrimAnalysisWarnings>
</PropertyGroup>
```

### NativeAOT Restrictions

NativeAOT removes the JIT compiler, which means certain .NET features don't work:

- **No runtime reflection** — `Type.GetType()`, dynamic assembly loading, and most reflection emit will fail. Avoid reflection in game code.
- **No `dynamic` keyword** — causes runtime errors under AOT.
- **Content pipeline types** — `Content.Load<T>()` may require type registration. If a content type fails to load, add an explicit type reference so the AOT compiler includes it.
- **Third-party libraries** — Test all NuGet dependencies under AOT. Libraries using reflection may break silently.

### Verifying AOT Compatibility

Before shipping, build with trim analysis enabled:

```bash
dotnet publish -c Release -r win-x64 /p:PublishAot=true /p:EnableTrimAnalyzer=true
```

Fix all trim warnings — each one represents a potential runtime crash in the AOT build.

---

## 9 — Content Pipeline Considerations

### Content Is Platform-Agnostic (Mostly)

Content built with MGCB for DesktopGL works on Windows, Linux, and macOS without rebuilding. The `.xnb` format is the same across all three.

However, content for **Android** and **iOS** may need platform-specific builds:

- **Textures:** Mobile platforms may need compressed formats (ETC2 for Android, PVRTC/ASTC for iOS)
- **Shaders:** Mobile targets use OpenGL ES shaders, which differ from desktop OpenGL shaders
- **Audio:** Format support varies by platform

### MonoGame 3.8.5 Content Builder

If using MonoGame 3.8.5's new Content Builder project system (see G72), content is built as a separate project. This simplifies cross-platform content management because you can have multiple content build configurations targeting different platforms from the same source assets.

---

## 10 — Third-Party Packaging Tools

Several community tools simplify MonoGame packaging:

### GameBundle

[GameBundle](https://github.com/Ellpeck/GameBundle) automates building and packaging for multiple platforms:

```bash
# Install
dotnet tool install -g GameBundle

# Package for all desktop platforms
gamebundle -w -l -m
```

GameBundle handles self-contained publishing, console window suppression, macOS `.app` bundles, and Linux launch scripts.

### MonoPack

[MonoPack](https://github.com/shyfox-studio/MonoPack) is a dedicated MonoGame packaging tool:

```bash
# Install
dotnet tool install -g MonoPack

# Package for Windows, Linux, and macOS
monopack --platforms windows linux macos
```

Both tools can cross-compile — build for any platform from any platform.

---

## 11 — Distribution Checklist

Before releasing your game, verify each target platform:

### All Platforms

- [ ] Game runs in Release configuration (not just Debug)
- [ ] Content loads correctly (textures, audio, fonts)
- [ ] No debug logging or development shortcuts left enabled
- [ ] Frame rate is acceptable on target hardware
- [ ] Game saves/loads work from the published build
- [ ] All native libraries are bundled (SDL2, OpenAL, etc.)

### Windows

- [ ] Console window is hidden (`WinExe` output type)
- [ ] Game runs on a clean Windows install (no .NET pre-installed)
- [ ] Antivirus doesn't flag the executable (common with self-contained .NET apps — sign with a code certificate)

### Linux

- [ ] Executable has execute permissions after extraction
- [ ] Game runs on Ubuntu 22.04+ (most common target)
- [ ] SDL2 is available or bundled
- [ ] Launch script or `.desktop` file included

### macOS

- [ ] `.app` bundle is properly structured
- [ ] App is code signed and notarized (for non-App-Store distribution)
- [ ] Works on both Intel and Apple Silicon (or ship separate builds)
- [ ] `Info.plist` has correct bundle ID, version, and minimum OS version

### Mobile

- [ ] Touch input works correctly
- [ ] Screen orientation is locked appropriately
- [ ] App icon and splash screen are configured
- [ ] Tested on physical devices (not just simulators)
- [ ] APK is signed (Android) / provisioning profile is valid (iOS)

---

## 12 — Common Deployment Issues

### "Game works in Debug but crashes in Release"

Release builds enable optimizations that can expose latent bugs. Common causes: uninitialized variables, race conditions, and code that depends on debug-mode timing. Build and test in Release throughout development, not just at the end.

### "Content not found in published build"

Content files aren't being copied to the output directory. Verify that your `.csproj` includes content copy directives and that the `Content.RootDirectory` path matches. For MonoGame 3.8.5's Content Builder, ensure the content project is a dependency of the game project.

### "DllNotFoundException on Linux"

A native library (usually SDL2 or OpenAL) isn't being found. Check that library files are in the publish output directory or on the system's `LD_LIBRARY_PATH`. Self-contained builds should bundle these, but verify they're present.

### "macOS says the app is damaged"

The app isn't code signed or notarized. Either sign and notarize (recommended for public distribution) or instruct users to bypass Gatekeeper:

```bash
xattr -cr /path/to/MyGame.app
```

This is acceptable for development/testing but not for public releases.

### "NativeAOT build crashes at runtime"

Usually caused by reflection usage that the AOT compiler couldn't analyze. Enable `EnableTrimAnalyzer` and fix all warnings. Common culprits: JSON serialization, content type loading, and third-party libraries that use `Type.GetType()`.

### "Android APK is too large"

Self-contained Android builds include the full .NET runtime. Use trimming to reduce size:

```xml
<PropertyGroup>
    <PublishTrimmed>true</PublishTrimmed>
    <TrimMode>link</TrimMode>
</PropertyGroup>
```

Test thoroughly after enabling trimming — it may remove types your game needs at runtime.
