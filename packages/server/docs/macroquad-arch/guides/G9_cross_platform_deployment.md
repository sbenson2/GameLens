# G9 — Cross-Platform Deployment (Android, iOS, WASM)

> **Category:** guide · **Engine:** Macroquad 0.4 · **Related:** [G1 Getting Started](G1_getting_started.md) · [G2 WASM & Egui](G2_wasm_and_egui.md) · [macroquad-arch-rules](../macroquad-arch-rules.md)

---

## Overview

Macroquad's primary selling point is cross-platform deployment with minimal friction. The same Rust code compiles to native desktop (Windows, macOS, Linux), WebAssembly, Android, and iOS — all backed by the `miniquad` graphics abstraction. This guide covers the platform-specific build and deployment process for each target, with emphasis on Android and iOS since WASM is covered in [G2](G2_wasm_and_egui.md).

---

## Shared Cargo.toml Setup

Before targeting any platform, set up your project with these essentials:

```toml
[package]
name = "mygame"
version = "0.1.0"
edition = "2021"

[dependencies]
macroquad = "0.4"

# IMPORTANT: Compile dependencies in release mode even during debug builds.
# This dramatically improves image loading speed and general performance.
[profile.dev.package."*"]
opt-level = 3
```

### Asset Path Compatibility

Macroquad loads assets differently per platform. Use this pattern to ensure assets work everywhere:

```rust
use macroquad::prelude::*;

// Call this at the start of main() for desktop builds.
// On Android/iOS/WASM, assets are located automatically.
#[cfg(not(target_os = "android"))]
macroquad::file::set_pc_assets_folder("assets");
```

Place all textures, audio, and fonts in an `assets/` directory at your project root.

---

## Android Deployment

### Option 1: Docker (Recommended)

Docker is the fastest path to an Android APK — no SDK/NDK installation required.

```bash
# Pull the build container (one-time)
docker pull notfl3/cargo-apk

# Build a release APK
docker run --rm \
    -v $(pwd):/root/src \
    -w /root/src \
    notfl3/cargo-apk cargo quad-apk build --release
```

Output: `target/android-artifacts/release/apk/mygame.apk`

### Option 2: Manual Setup

If you need more control (custom NDK version, CI pipelines):

```bash
# Install Rust Android targets
rustup target add armv7-linux-androideabi
rustup target add aarch64-linux-android
rustup target add i686-linux-android
rustup target add x86_64-linux-android

# Install the build tool
cargo install cargo-quad-apk

# Set environment variables
export ANDROID_HOME=/path/to/android-sdk
export NDK_HOME=/path/to/android-ndk-r25

# Build
cargo quad-apk build --release
```

### Android Cargo.toml Configuration

```toml
[package.metadata.android]
# Include your assets directory in the APK
assets = "assets/"

# Build for all required architectures (Google Play requirement)
build_targets = [
    "armv7-linux-androideabi",
    "aarch64-linux-android",
    "i686-linux-android",
    "x86_64-linux-android",
]

# Versioning for Google Play
version_code = 1
version_name = "1.0"

# Custom app icon
res = "android_res"
icon = "@mipmap/ic_launcher"

[package.metadata.android.activity_attributes]
# Required for API level 31+ (Android 12)
"android:exported" = "true"
# Lock screen orientation for games
"android:screenOrientation" = "userLandscape"
```

### High-DPI Support

Android devices vary greatly in pixel density. By default, Android emulates a low-density display which gives better FPS but looks blurry. To render at native resolution:

```rust
fn window_conf() -> window::Conf {
    window::Conf {
        window_title: "My Game".to_owned(),
        high_dpi: true,
        ..Default::default()
    }
}

#[macroquad::main(window_conf)]
async fn main() {
    // screen_width() / screen_height() now return actual pixel dimensions
    loop {
        clear_background(BLACK);
        // game logic...
        next_frame().await;
    }
}
```

> **Performance trade-off:** `high_dpi: true` means rendering at 2-4x the pixel count on modern phones. If FPS drops, consider rendering to a lower-resolution render target and upscaling.

### App Icon

Create resolution variants in an `android_res/` directory:

```
android_res/
├── mipmap-mdpi/ic_launcher.png      (48×48)
├── mipmap-hdpi/ic_launcher.png      (72×72)
├── mipmap-xhdpi/ic_launcher.png     (96×96)
├── mipmap-xxhdpi/ic_launcher.png    (144×144)
└── mipmap-xxxhdpi/ic_launcher.png   (192×192)
```

### Signing for Google Play

Google Play requires signed APKs, and modern submissions require AAB (Android App Bundle) format.

```bash
# Generate a keystore (one-time — KEEP THIS SAFE)
keytool -v -genkey -keystore mygame.keystore -alias mygame \
    -keyalg RSA -validity 10000

# Build unsigned
cargo quad-apk build --release --nosign

# Sign the APK
apksigner sign --ks mygame.keystore \
    target/android-artifacts/release/apk/mygame.apk \
    --ks-key-alias mygame

# Verify the signature
apksigner verify target/android-artifacts/release/apk/mygame.apk
```

For AAB conversion (required by Google Play), use the conversion script at: https://gist.github.com/not-fl3/ffff62804ca2c8acc6d8ef74aa610eb6

### Android Debugging

```bash
# View macroquad-specific log output
adb logcat -v brief SAPP:V "*:S"

# Filter by your game's process
adb logcat --pid=$(adb shell pidof -s rust.mygame)
```

---

## iOS Deployment

iOS builds require macOS with Xcode installed.

### Prerequisites

```bash
# Add iOS build targets
rustup target add x86_64-apple-ios        # Simulator (Intel Mac)
rustup target add aarch64-apple-ios-sim    # Simulator (Apple Silicon)
rustup target add aarch64-apple-ios        # Real devices

# Install device deployment tool
brew install ios-deploy
```

### App Bundle Structure

An iOS app is a directory with the `.app` extension:

```
MyGame.app/
├── mygame              # Compiled binary
├── Info.plist          # App metadata
├── embedded.mobileprovision  # Signing profile (real devices only)
└── assets/
    ├── textures/
    ├── audio/
    └── fonts/
```

### Info.plist

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
    "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleExecutable</key>
    <string>mygame</string>
    <key>CFBundleIdentifier</key>
    <string>com.yourname.mygame</string>
    <key>CFBundleName</key>
    <string>My Game</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>CFBundleShortVersionString</key>
    <string>1.0</string>
</dict>
</plist>
```

### Simulator Build & Run

```bash
# Build for simulator
cargo build --target x86_64-apple-ios --release
# (Use aarch64-apple-ios-sim on Apple Silicon Macs)

# Create .app bundle
mkdir -p MyGame.app/assets
cp target/x86_64-apple-ios/release/mygame MyGame.app/
cp Info.plist MyGame.app/
cp -r assets/* MyGame.app/assets/

# Boot a simulator
xcrun simctl list                    # Find a device ID
xcrun simctl boot <DEVICE_UUID>
open /Applications/Xcode.app/Contents/Developer/Applications/Simulator.app/

# Install and launch
xcrun simctl install booted MyGame.app/
xcrun simctl launch booted com.yourname.mygame
```

### Real Device Build & Run

Real devices require code signing with a provisioning profile.

**Step 1:** Get a provisioning profile (free Apple ID works):
1. Open Xcode, create a dummy iOS project with your bundle ID.
2. Run it on your device — Xcode creates the provisioning profile.
3. Find it at `~/Library/MobileDevice/Provisioning Profiles/`.
4. Copy the `.mobileprovision` file into `MyGame.app/embedded.mobileprovision`.

**Step 2:** Build and sign:

```bash
# Build for real device
cargo build --target aarch64-apple-ios --release

# Assemble the .app bundle
mkdir -p MyGame.app/assets
cp target/aarch64-apple-ios/release/mygame MyGame.app/
cp Info.plist MyGame.app/
cp embedded.mobileprovision MyGame.app/
cp -r assets/* MyGame.app/assets/

# Find your signing identity
security find-identity -v -p codesigning

# Sign the binary and bundle (macOS 14+ / Sonoma)
codesign --force --timestamp=none --sign <IDENTITY_HEX> \
    --entitlements MyGame.entitlements.xml MyGame.app

# Deploy to device
ios-deploy -b MyGame.app
```

**Entitlements file** (`MyGame.entitlements.xml`):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
    "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>application-identifier</key>
    <string>TEAMID.com.yourname.mygame</string>
</dict>
</plist>
```

Find your Team ID by running:
```bash
security cms -D -i MyGame.app/embedded.mobileprovision | grep TeamIdentifier -A 2
```

> **iOS 16+ note:** Real devices must have "Developer Mode" enabled (Settings → Privacy & Security → Developer Mode). This option only appears after connecting to a Mac with Xcode.

### Simulator Logging

```bash
xcrun simctl spawn booted log stream \
    --predicate 'processImagePath endswith "mygame"'
```

---

## WASM Quick Reference

WASM deployment is covered in detail in [G2 — WASM & Egui](G2_wasm_and_egui.md). Quick recap:

```bash
# Install target
rustup target add wasm32-unknown-unknown

# Build
cargo build --target wasm32-unknown-unknown --release

# Copy the .wasm file alongside an HTML host page
cp target/wasm32-unknown-unknown/release/mygame.wasm web/
```

Macroquad provides a JS loader that handles the WASM instantiation and canvas setup.

---

## Performance Tips Across Platforms

### Texture Atlases

Draw calls are expensive on mobile GPUs. Batch sprites into texture atlases to minimize state changes:

```rust
// Load a spritesheet instead of individual images
let atlas = load_texture("sprites/atlas.png").await.unwrap();
atlas.set_filter(FilterMode::Nearest); // Pixel art

// Draw a region from the atlas
draw_texture_ex(
    &atlas,
    x, y,
    WHITE,
    DrawTextureParams {
        source: Some(Rect::new(0.0, 0.0, 32.0, 32.0)),
        ..Default::default()
    },
);
```

### Release Profile Optimization

```toml
[profile.release]
opt-level = 3       # Maximum optimization
lto = true           # Link-time optimization (slower build, faster binary)
strip = true         # Strip debug symbols (smaller binary)
codegen-units = 1    # Better optimization at cost of compile time
```

### Platform-Specific Code

Use `cfg` attributes when platform behavior must differ:

```rust
#[cfg(target_os = "android")]
fn get_save_path() -> String {
    // Android internal storage
    "/data/data/rust.mygame/files/save.json".to_string()
}

#[cfg(target_arch = "wasm32")]
fn get_save_path() -> String {
    // WASM uses browser localStorage via JS interop
    "save_slot_1".to_string()
}

#[cfg(not(any(target_os = "android", target_arch = "wasm32")))]
fn get_save_path() -> String {
    // Desktop
    dirs::data_dir()
        .unwrap()
        .join("mygame/save.json")
        .to_string_lossy()
        .to_string()
}
```

### Touch Input

Mobile games need touch input. Macroquad provides it alongside mouse input:

```rust
// Works on both mobile (touch) and desktop (mouse)
if is_mouse_button_pressed(MouseButton::Left) {
    let (x, y) = mouse_position();
    // Handle tap/click at (x, y)
}

// Multi-touch (mobile only)
for touch in touches() {
    match touch.phase {
        TouchPhase::Started => { /* finger down */ }
        TouchPhase::Moved => { /* finger dragged */ }
        TouchPhase::Ended => { /* finger lifted */ }
        _ => {}
    }
}
```

---

## Build Matrix Summary

| Target | Command | Output |
|--------|---------|--------|
| Desktop (native) | `cargo build --release` | Binary in `target/release/` |
| WASM | `cargo build --target wasm32-unknown-unknown --release` | `.wasm` in `target/wasm32-unknown-unknown/release/` |
| Android | `cargo quad-apk build --release` | `.apk` in `target/android-artifacts/release/apk/` |
| iOS Simulator | `cargo build --target x86_64-apple-ios --release` | Binary in `target/x86_64-apple-ios/release/` |
| iOS Device | `cargo build --target aarch64-apple-ios --release` | Binary in `target/aarch64-apple-ios/release/` |

---

## Rust Ownership Gotcha: Async Asset Loading

Macroquad's asset loading is async (`load_texture().await`). On WASM and mobile, these loads happen over the network or from bundled resources. Always handle the `Result`:

```rust
// DON'T: unwrap in production — mobile file access can fail
let tex = load_texture("player.png").await.unwrap();

// DO: handle errors gracefully
let tex = match load_texture("player.png").await {
    Ok(t) => t,
    Err(e) => {
        eprintln!("Failed to load player.png: {e}");
        // Fall back to a placeholder or exit
        Texture2D::empty()
    }
};
```

On Android, missing assets in the `assets/` Cargo.toml configuration silently fail — the file simply won't be found at runtime. Always verify your `[package.metadata.android] assets = "assets/"` setting.
