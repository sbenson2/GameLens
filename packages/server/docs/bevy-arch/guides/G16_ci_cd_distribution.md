# G16 — CI/CD, Release Pipelines, and Distribution

> **Category:** guide · **Engine:** Bevy 0.18 · **Related:** [R1 Plugins and WASM](../reference/R1_plugins_and_wasm.md) · [R4 Cargo Feature Collections](../reference/R4_cargo_feature_collections.md) · [G1 Getting Started](G1_getting_started.md) · [bevy-arch-rules](../bevy-arch-rules.md)

---

## Overview

Shipping a Bevy game means cross-compiling for Windows, macOS, Linux, and (optionally) WebAssembly — plus packaging, signing, and uploading builds. This guide covers GitHub Actions CI/CD pipelines, the official Bevy CI template, platform-specific packaging, and distribution to itch.io and Steam.

---

## Quick Start: bevy_github_ci_template

The fastest way to get multi-platform CI is the official template:

```bash
# Start a new project from the template
# Go to https://github.com/bevyengine/bevy_github_ci_template
# Click "Use this template" → "Create a new repository"
```

This template provides two GitHub Actions workflows:

| Workflow | Trigger | What it does |
|----------|---------|-------------|
| `ci.yaml` | Every push / PR | Lint (`clippy`), format check (`rustfmt`), test, build |
| `release.yaml` | Git tag push (`v*`) | Cross-compile for all platforms, package, upload to GitHub Releases and optionally itch.io |

### Build Outputs

| Platform | Artifact |
|----------|----------|
| Linux | `.zip` — executable + `assets/` folder |
| Windows | `.zip` — `.exe` + `assets/` folder |
| macOS | `.dmg` — contains a `.app` bundle with assets embedded |
| WASM | `.zip` — `.wasm` binary, JS bindings, `index.html`, `assets/` |

---

## Alternative: bevy_game_template

For a more opinionated setup that includes mobile targets (iOS, Android) in addition to desktop and WASM:

```bash
# https://github.com/NiklasEi/bevy_game_template
# Supports: Windows, Linux, macOS, WASM, iOS, Android
# Includes: loading screen, game state management, CI/CD
```

This template also provides a Trunk-based WASM workflow and native mobile builds.

---

## Writing Your Own CI Pipeline

### Step 1 — Fast CI (Lint + Test)

```yaml
# .github/workflows/ci.yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  CARGO_TERM_COLOR: always

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: clippy, rustfmt
      - uses: Swatinem/rust-cache@v2
      - name: Rustfmt
        run: cargo fmt --all -- --check
      - name: Clippy
        run: cargo clippy --all-targets --all-features -- -D warnings

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
      - name: Install Linux dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y libasound2-dev libudev-dev libwayland-dev libxkbcommon-dev
      - name: Run tests
        run: cargo test --workspace
```

> **Bevy 0.18 tip:** Use `--features bevy/wayland` or `bevy/x11` if your CI needs specific windowing backends. The `bevy/2d` and `bevy/3d` feature collections (new in 0.18) let you compile only what you need, speeding up CI.

### Step 2 — Release Builds

```yaml
# .github/workflows/release.yaml
name: Release
on:
  push:
    tags: ["v*"]

jobs:
  build-linux:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
      - name: Install dependencies
        run: sudo apt-get update && sudo apt-get install -y libasound2-dev libudev-dev
      - name: Build
        run: cargo build --release
      - name: Package
        run: |
          mkdir -p release
          cp target/release/my_game release/
          cp -r assets release/
          cd release && zip -r ../my_game-linux.zip .
      - uses: actions/upload-artifact@v4
        with:
          name: linux-build
          path: my_game-linux.zip

  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
      - name: Build
        run: cargo build --release
      - name: Package
        run: |
          mkdir release
          cp target/release/my_game.exe release/
          cp -r assets release/
          Compress-Archive -Path release/* -DestinationPath my_game-windows.zip
      - uses: actions/upload-artifact@v4
        with:
          name: windows-build
          path: my_game-windows.zip

  build-macos:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
      - name: Build
        run: cargo build --release
      - name: Package as .app
        run: |
          mkdir -p "My Game.app/Contents/MacOS"
          mkdir -p "My Game.app/Contents/Resources"
          cp target/release/my_game "My Game.app/Contents/MacOS/"
          cp -r assets "My Game.app/Contents/Resources/"
          # Create Info.plist (see macOS Packaging section below)
          hdiutil create -volname "My Game" -srcfolder "My Game.app" -ov my_game-macos.dmg
      - uses: actions/upload-artifact@v4
        with:
          name: macos-build
          path: my_game-macos.dmg

  build-wasm:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: wasm32-unknown-unknown
      - uses: Swatinem/rust-cache@v2
      - name: Install wasm-bindgen-cli
        run: cargo install wasm-bindgen-cli
      - name: Build WASM
        run: cargo build --release --target wasm32-unknown-unknown
      - name: Generate bindings
        run: |
          wasm-bindgen --out-dir out --target web \
            target/wasm32-unknown-unknown/release/my_game.wasm
      - name: Package
        run: |
          cp -r assets out/
          # Add index.html (see WASM section in R1)
          cd out && zip -r ../my_game-wasm.zip .
      - uses: actions/upload-artifact@v4
        with:
          name: wasm-build
          path: my_game-wasm.zip
```

---

## Publishing to itch.io

The official CI template supports itch.io out of the box via [Butler](https://itch.io/docs/butler/):

1. **Get an API key** at https://itch.io/user/settings/api-keys
2. **Add a repository secret** named `BUTLER_CREDENTIALS` set to the API key
3. **Set `itch_target`** in `release.yaml` to `your-username/your-game`

```yaml
# Add to the end of each platform build job:
- name: Upload to itch.io
  uses: manleydev/butler-publish-itchio-action@master
  env:
    BUTLER_CREDENTIALS: ${{ secrets.BUTLER_CREDENTIALS }}
    CHANNEL: linux  # or windows, mac, html5
    ITCH_GAME: your-username/your-game
    PACKAGE: my_game-linux.zip
    VERSION: ${{ github.ref_name }}
```

Each tagged release automatically pushes builds to itch.io with the tag as the version string.

---

## macOS Packaging: Info.plist

For a proper `.app` bundle on macOS, create an `Info.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>My Game</string>
    <key>CFBundleIdentifier</key>
    <string>com.yourname.mygame</string>
    <key>CFBundleVersion</key>
    <string>1.0.0</string>
    <key>CFBundleExecutable</key>
    <string>my_game</string>
    <key>CFBundleIconFile</key>
    <string>icon.icns</string>
    <key>NSHighResolutionCapable</key>
    <true/>
</dict>
</plist>
```

Place it at `My Game.app/Contents/Info.plist`.

---

## Speeding Up CI Builds

Bevy compiles are notoriously slow. Key optimizations:

| Technique | Impact | How |
|-----------|--------|-----|
| **`Swatinem/rust-cache`** | High | Caches `target/` and cargo registry across runs |
| **Cargo Feature Collections** (0.18+) | Medium | Use `bevy/2d` instead of full `bevy` to skip 3D compilation |
| **LLD / mold linker** | Medium | Add to `.cargo/config.toml` (see below) |
| **Cranelift backend** (dev only) | High | Nightly-only; faster debug builds but not for release |
| **Split CI jobs** | Medium | Run clippy/fmt and tests in parallel |

```toml
# .cargo/config.toml — faster linking (Linux CI)
[target.x86_64-unknown-linux-gnu]
linker = "clang"
rustflags = ["-C", "link-arg=-fuse-ld=mold"]
```

> **Important:** Use `mold` or `lld` on Linux, and `zld` or the default linker on macOS. Windows uses MSVC's linker by default, which is fine for release builds.

---

## Steam Distribution

For Steam, you'll need the Steamworks SDK and `steamcmd` for uploads. Key considerations:

1. **Steam runtime:** Linux builds should target the Steam Runtime (Ubuntu-based). Consider building in a Docker container that matches the runtime.
2. **Steam API integration:** Use the `steamworks` Rust crate for achievements, cloud saves, and overlay.
3. **Depot configuration:** Create depots for each platform in your Steamworks partner dashboard.
4. **Upload via `steamcmd`:** Automate with CI using `steamcmd +login ... +run_app_build ...`.

```toml
[dependencies]
steamworks = "0.11"  # Check for latest version
```

---

## Asset Path Considerations

Bevy loads assets relative to the working directory by default. For packaged builds:

- **Desktop:** Ship the `assets/` folder alongside the executable
- **macOS .app:** Assets go in `Contents/Resources/assets/` — set the working directory or use `AssetPlugin` config to point there
- **WASM:** Assets are fetched via HTTP from the server root — ensure your web server serves the `assets/` folder

```rust
// Override asset path for macOS .app bundles
App::new()
    .add_plugins(DefaultPlugins.set(AssetPlugin {
        file_path: "Contents/Resources/assets".to_string(),
        ..default()
    }))
```

---

## Checklist

- [ ] CI runs clippy, rustfmt, and tests on every PR
- [ ] Release workflow triggers on version tags
- [ ] Builds for all target platforms (Linux, Windows, macOS, WASM)
- [ ] Assets are correctly bundled alongside executables
- [ ] macOS builds have proper `.app` bundle with `Info.plist`
- [ ] WASM builds include `index.html` and JS bindings
- [ ] itch.io / Steam upload is automated
- [ ] Build times are optimized with caching and fast linkers
