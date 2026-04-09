# G27 — macOS App Bundle & Distribution

> **Category:** guide · **Engine:** FNA · **Related:** [G08 Cross Platform Deployment](./G08_cross_platform_deployment.md) · [G02 NativeAOT Publishing](./G02_nativeaot_publishing.md) · [G25 Game Packaging Distribution](./G25_game_packaging_distribution.md)

Creating a proper macOS `.app` bundle for FNA games, including code signing, notarization, Apple Silicon support, and Gatekeeper compliance. Covers both .NET self-contained publish and NativeAOT workflows.

---

## Table of Contents

1. [Why an App Bundle](#1--why-an-app-bundle)
2. [App Bundle Structure](#2--app-bundle-structure)
3. [Building the Executable](#3--building-the-executable)
4. [Creating the Bundle](#4--creating-the-bundle)
5. [Fixing Library Paths with install_name_tool](#5--fixing-library-paths-with-install_name_tool)
6. [Apple Silicon and Universal Binaries](#6--apple-silicon-and-universal-binaries)
7. [Code Signing](#7--code-signing)
8. [Notarization](#8--notarization)
9. [DMG Packaging](#9--dmg-packaging)
10. [Common Issues](#10--common-issues)
11. [FNA vs MonoGame: macOS Differences](#11--fna-vs-monogame-macos-differences)

---

## 1 — Why an App Bundle

macOS expects applications as `.app` bundles — a directory structure with metadata, executables, and resources. Without a proper bundle:

- Gatekeeper will block your game with "unidentified developer" warnings
- The game won't appear in Finder as a launchable application
- Native file dialogs, dock integration, and system services won't work correctly
- Steam and other launchers expect `.app` bundles for macOS depots

A loose executable works for development but not for distribution.

---

## 2 — App Bundle Structure

An FNA game's `.app` bundle follows Apple's standard layout:

```
MyGame.app/
└── Contents/
    ├── Info.plist              # App metadata (required)
    ├── MacOS/
    │   ├── MyGame              # Main executable
    │   ├── libSDL3.0.dylib     # FNA native libraries
    │   ├── libFNA3D.0.dylib
    │   ├── libFAudio.0.dylib
    │   ├── libtheorafile.dylib
    │   └── ... (other dylibs)
    └── Resources/
        ├── MyGame.icns         # App icon (required for polished distribution)
        └── Content/            # Game assets
            ├── textures/
            ├── audio/
            └── effects/
```

Everything the game needs at runtime must be inside the bundle. macOS Gatekeeper rejects applications that load libraries from outside the bundle (except system frameworks).

---

## 3 — Building the Executable

### Option A: .NET Self-Contained Publish

```bash
# Intel Mac
dotnet publish -c Release -r osx-x64 --self-contained -o publish/osx-x64

# Apple Silicon
dotnet publish -c Release -r osx-arm64 --self-contained -o publish/osx-arm64
```

This produces a native executable with the .NET runtime embedded. No separate runtime installation required on the user's machine.

### Option B: NativeAOT Publish

```bash
# Intel Mac
dotnet publish -c Release -r osx-x64 /p:PublishAot=true -o publish/osx-x64

# Apple Silicon
dotnet publish -c Release -r osx-arm64 /p:PublishAot=true -o publish/osx-arm64
```

NativeAOT produces a smaller, faster binary with no .NET runtime dependency. Recommended for final distribution, especially if also targeting consoles (see G23).

---

## 4 — Creating the Bundle

Use a shell script to assemble the bundle from a publish directory:

```bash
#!/bin/bash
APP_NAME="MyGame"
PUBLISH_DIR="publish/osx-arm64"
BUNDLE_DIR="dist/${APP_NAME}.app"

# Create bundle structure
mkdir -p "${BUNDLE_DIR}/Contents/MacOS"
mkdir -p "${BUNDLE_DIR}/Contents/Resources"

# Copy executable and native libraries
cp "${PUBLISH_DIR}/${APP_NAME}" "${BUNDLE_DIR}/Contents/MacOS/"
cp "${PUBLISH_DIR}"/*.dylib "${BUNDLE_DIR}/Contents/MacOS/" 2>/dev/null

# Copy fnalibs (if not already in publish output)
cp lib/fnalibs/osx/*.dylib "${BUNDLE_DIR}/Contents/MacOS/" 2>/dev/null

# Copy game content
cp -R "${PUBLISH_DIR}/Content" "${BUNDLE_DIR}/Contents/Resources/" 2>/dev/null

# Copy app icon
cp assets/MyGame.icns "${BUNDLE_DIR}/Contents/Resources/" 2>/dev/null

echo "Bundle created at ${BUNDLE_DIR}"
```

### Info.plist

Create `Contents/Info.plist` with your game's metadata:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>MyGame</string>

    <key>CFBundleDisplayName</key>
    <string>My FNA Game</string>

    <key>CFBundleIdentifier</key>
    <string>com.yourstudio.mygame</string>

    <key>CFBundleVersion</key>
    <string>1.0.0</string>

    <key>CFBundleShortVersionString</key>
    <string>1.0.0</string>

    <key>CFBundleExecutable</key>
    <string>MyGame</string>

    <key>CFBundleIconFile</key>
    <string>MyGame</string>

    <key>CFBundlePackageType</key>
    <string>APPL</string>

    <key>LSMinimumSystemVersion</key>
    <string>11.0</string>

    <key>NSHighResolutionCapable</key>
    <true/>

    <key>CSResourcesFileMapped</key>
    <true/>

    <!-- Game controller support (optional but recommended) -->
    <key>GCSupportedGameControllers</key>
    <array>
        <dict>
            <key>ProfileName</key>
            <string>ExtendedGamepad</string>
        </dict>
    </array>
    <key>GCSupportsControllerUserInteraction</key>
    <true/>
</dict>
</plist>
```

Key fields:
- `CFBundleExecutable` must match the executable filename in `Contents/MacOS/`
- `CFBundleIdentifier` must be a reverse-DNS identifier matching your Apple Developer account
- `LSMinimumSystemVersion` — set to `11.0` for Apple Silicon support (macOS Big Sur)
- `NSHighResolutionCapable` — enables Retina display support (pair with `FNA_GRAPHICS_ENABLE_HIGHDPI=1`)

---

## 5 — Fixing Library Paths with install_name_tool

macOS dylibs encode their expected load paths. FNA's fnalibs may reference `/usr/local/lib/` by default, which won't exist on user machines. Fix them to use `@rpath` or `@executable_path`:

```bash
# For the main executable: add rpath pointing to its own directory
install_name_tool -add_rpath @executable_path \
    "${BUNDLE_DIR}/Contents/MacOS/MyGame"

# For NativeAOT builds specifically: fix SDL3 reference
install_name_tool -change /usr/local/lib/libSDL3.0.dylib \
    @rpath/libSDL3.0.dylib \
    "${BUNDLE_DIR}/Contents/MacOS/MyGame"

# Fix each dylib's install name to use @rpath
for dylib in "${BUNDLE_DIR}/Contents/MacOS"/*.dylib; do
    name=$(basename "$dylib")
    install_name_tool -id "@rpath/${name}" "$dylib"
done

# Fix inter-library references (e.g., FNA3D depends on SDL3)
install_name_tool -change /usr/local/lib/libSDL3.0.dylib \
    @rpath/libSDL3.0.dylib \
    "${BUNDLE_DIR}/Contents/MacOS/libFNA3D.0.dylib"
```

**Verify paths are correct:**

```bash
# Check what a binary expects to load
otool -L "${BUNDLE_DIR}/Contents/MacOS/MyGame"

# All references should be @rpath/, @executable_path/, or system frameworks
# Red flag: any path starting with /usr/local/ or an absolute path
```

---

## 6 — Apple Silicon and Universal Binaries

Modern Macs use either Intel (x86_64) or Apple Silicon (arm64). To support both:

### Option A: Universal Binary (recommended for distribution)

Build for both architectures and merge with `lipo`:

```bash
# Build both architectures
dotnet publish -c Release -r osx-x64 --self-contained -o publish/osx-x64
dotnet publish -c Release -r osx-arm64 --self-contained -o publish/osx-arm64

# Merge into a universal binary
lipo -create \
    publish/osx-x64/MyGame \
    publish/osx-arm64/MyGame \
    -output publish/osx-universal/MyGame
```

FNA's fnalibs from `fnalibs-dailies` are already universal binaries (contain both arm64 and x86_64 slices). Verify with:

```bash
lipo -info lib/fnalibs/osx/libSDL3.0.dylib
# Expected output: Architectures in the fat file: x86_64 arm64
```

### Option B: Separate Architecture Builds

Ship separate builds for Intel and Apple Silicon. Simpler to set up but requires users to download the correct version.

---

## 7 — Code Signing

Code signing is required for Gatekeeper to allow your app to run. You need an Apple Developer account ($99/year).

### Sign the Bundle

```bash
# Sign all dylibs first (innermost to outermost)
for dylib in "${BUNDLE_DIR}/Contents/MacOS"/*.dylib; do
    codesign --force --timestamp --options runtime \
        --sign "Developer ID Application: Your Name (TEAMID)" \
        "$dylib"
done

# Sign the main executable
codesign --force --timestamp --options runtime \
    --sign "Developer ID Application: Your Name (TEAMID)" \
    "${BUNDLE_DIR}/Contents/MacOS/MyGame"

# Sign the entire bundle
codesign --force --timestamp --options runtime \
    --sign "Developer ID Application: Your Name (TEAMID)" \
    "${BUNDLE_DIR}"

# Verify the signature
codesign --verify --deep --strict "${BUNDLE_DIR}"
```

**Important flags:**
- `--timestamp` — required for notarization
- `--options runtime` — enables the Hardened Runtime, required for notarization
- `--force` — replaces any existing signature
- Sign from innermost (dylibs) to outermost (bundle) to avoid invalidating signatures

### Entitlements

FNA games typically need a minimal entitlements file for Hardened Runtime:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <!-- Required if using JIT compilation (.NET non-AOT builds) -->
    <key>com.apple.security.cs.allow-jit</key>
    <true/>

    <!-- Required for loading unsigned dylibs (fnalibs) -->
    <key>com.apple.security.cs.disable-library-validation</key>
    <true/>
</dict>
</plist>
```

Pass the entitlements file during signing:

```bash
codesign --force --timestamp --options runtime \
    --entitlements entitlements.plist \
    --sign "Developer ID Application: Your Name (TEAMID)" \
    "${BUNDLE_DIR}"
```

**NativeAOT builds** do not require `com.apple.security.cs.allow-jit` since there's no JIT compiler. Remove it for a tighter security profile.

---

## 8 — Notarization

Notarization sends your signed app to Apple for automated malware scanning. Required since macOS 10.15 Catalina.

```bash
# Create a zip for notarization
ditto -c -k --keepParent "${BUNDLE_DIR}" MyGame.zip

# Submit for notarization
xcrun notarytool submit MyGame.zip \
    --apple-id "your@email.com" \
    --team-id "TEAMID" \
    --password "app-specific-password" \
    --wait

# Staple the notarization ticket to the app
xcrun stapler staple "${BUNDLE_DIR}"
```

**Tips:**
- Use an [app-specific password](https://support.apple.com/en-us/102654) from your Apple ID account, not your main password
- `--wait` blocks until notarization completes (usually 5–15 minutes)
- Stapling embeds the notarization ticket so the app works offline
- If notarization fails, check the log: `xcrun notarytool log <submission-id> --apple-id ... --team-id ... --password ...`

### CI/CD Automation

For automated builds (GitHub Actions, GitLab CI):

```bash
# Store credentials in the notarytool keychain profile (one-time setup)
xcrun notarytool store-credentials "MY_PROFILE" \
    --apple-id "your@email.com" \
    --team-id "TEAMID" \
    --password "app-specific-password"

# Use the profile in CI
xcrun notarytool submit MyGame.zip --keychain-profile "MY_PROFILE" --wait
```

---

## 9 — DMG Packaging

For non-Steam distribution, package the `.app` in a DMG disk image:

```bash
# Simple DMG creation
hdiutil create -volname "My FNA Game" \
    -srcfolder "${BUNDLE_DIR}" \
    -ov -format UDZO \
    MyGame.dmg

# Sign and notarize the DMG too
codesign --force --timestamp \
    --sign "Developer ID Application: Your Name (TEAMID)" \
    MyGame.dmg

xcrun notarytool submit MyGame.dmg \
    --apple-id "your@email.com" \
    --team-id "TEAMID" \
    --password "app-specific-password" \
    --wait

xcrun stapler staple MyGame.dmg
```

For Steam distribution, Steam handles the delivery mechanism — you upload the `.app` bundle directly to a macOS depot. No DMG needed.

---

## 10 — Common Issues

### "MyGame is damaged and can't be opened"

The app was downloaded from the internet and isn't notarized, or the signature is invalid. Verify with:

```bash
codesign --verify --deep --strict MyGame.app
spctl --assess --type execute MyGame.app
```

### "Library not loaded: /usr/local/lib/libSDL3.0.dylib"

Library paths aren't fixed. Run `install_name_tool` as described in Section 5. Verify with `otool -L`.

### Crash on Apple Silicon

Check that fnalibs contain arm64 slices: `lipo -info lib/fnalibs/osx/libSDL3.0.dylib`. If only x86_64, the game runs under Rosetta 2 (slower) or crashes if Rosetta isn't installed. Download universal fnalibs from `fnalibs-dailies`.

### Notarization fails with "The signature is invalid"

Sign from innermost to outermost. Sign all dylibs individually before signing the bundle. Ensure `--timestamp` and `--options runtime` flags are present.

### Game can't find Content folder

Content must be in `Contents/Resources/Content/` within the bundle. FNA resolves paths relative to the executable by default. Set the content root directory appropriately:

```csharp
// In your Game constructor, adjust for macOS bundle layout
Content.RootDirectory = Path.Combine(
    AppDomain.CurrentDomain.BaseDirectory, "..", "Resources", "Content"
);
```

Or use `FNA_SDL_FORCE_BASE_PATH` environment variable to point to the Resources directory.

---

## 11 — FNA vs MonoGame: macOS Differences

| Aspect | FNA | MonoGame |
|--------|-----|----------|
| App bundle | Manual creation | Template-generated |
| Native libraries | fnalibs (universal dylibs) | Bundled via NuGet |
| Graphics backend | FNA3D → SDL_GPU → Metal | MonoGame → Metal directly |
| Code signing | Manual (codesign) | Manual (codesign) |
| NativeAOT | Fully supported | Partial support |
| Apple Silicon | Via universal fnalibs | Via NuGet architecture packages |

Both frameworks require the same macOS distribution steps (bundling, signing, notarizing). FNA gives you more control over the native library layout; MonoGame automates more of it through NuGet.
