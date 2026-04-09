# G12 — CI/CD and Automated Builds

> **Category:** guide · **Engine:** Macroquad 0.4 · **Related:** [G9 Cross-Platform Deployment](G9_cross_platform_deployment.md) · [G2 WASM & Egui](G2_wasm_and_egui.md) · [macroquad-arch-rules](../macroquad-arch-rules.md)

---

## Overview

Macroquad targets desktop (Windows, macOS, Linux), WebAssembly, and mobile (Android, iOS) from a single Rust codebase. This guide covers setting up GitHub Actions CI/CD pipelines to automatically lint, test, build, and distribute your Macroquad game to all platforms. The same patterns adapt to GitLab CI or other systems with minor syntax changes.

---

## CI Pipeline (Lint + Test)

### Basic CI Workflow

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
        run: cargo clippy --all-targets -- -D warnings

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
      - uses: Swatinem/rust-cache@v2
      - name: Run tests
        run: cargo test --workspace
```

> **Note:** Unlike Bevy, Macroquad has very few system-level dependencies on Linux — `miniquad` handles graphics abstraction. You typically don't need to install extra packages for headless CI builds. However, if your game uses audio in tests, you may need `libasound2-dev`.

### Testing Macroquad Games

Macroquad's `#[macroquad::main]` entry point and async game loop make unit testing tricky — you can't easily spin up a window in CI. Structure your code to separate logic from rendering:

```rust
// game_logic.rs — pure logic, fully testable
pub struct Player {
    pub x: f32,
    pub y: f32,
    pub speed: f32,
}

impl Player {
    pub fn move_right(&mut self, dt: f32) {
        self.x += self.speed * dt;
    }

    pub fn is_out_of_bounds(&self, screen_w: f32) -> bool {
        self.x > screen_w || self.x < 0.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn player_moves_right() {
        let mut p = Player { x: 0.0, y: 0.0, speed: 100.0 };
        p.move_right(0.016); // ~60fps
        assert!((p.x - 1.6).abs() < 0.001);
    }

    #[test]
    fn player_bounds_check() {
        let p = Player { x: 850.0, y: 0.0, speed: 100.0 };
        assert!(p.is_out_of_bounds(800.0));
    }
}
```

```rust
// main.rs — rendering only, calls into game_logic
mod game_logic;
use game_logic::Player;
use macroquad::prelude::*;

#[macroquad::main("My Game")]
async fn main() {
    let mut player = Player { x: 100.0, y: 100.0, speed: 200.0 };
    loop {
        player.move_right(get_frame_time());
        draw_circle(player.x, player.y, 16.0, YELLOW);
        next_frame().await;
    }
}
```

---

## Release Pipeline

### Multi-Platform Build Workflow

```yaml
# .github/workflows/release.yaml
name: Release
on:
  push:
    tags: ["v*"]

permissions:
  contents: write  # Needed for GitHub Releases

jobs:
  build-desktop:
    strategy:
      matrix:
        include:
          - os: ubuntu-latest
            target: x86_64-unknown-linux-gnu
            artifact: my-game-linux
            ext: ""
          - os: windows-latest
            target: x86_64-pc-windows-msvc
            artifact: my-game-windows
            ext: ".exe"
          - os: macos-latest
            target: x86_64-apple-darwin
            artifact: my-game-macos-x64
            ext: ""
          - os: macos-latest
            target: aarch64-apple-darwin
            artifact: my-game-macos-arm64
            ext: ""
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.target }}
      - uses: Swatinem/rust-cache@v2
        with:
          key: ${{ matrix.target }}
      - name: Build
        run: cargo build --release --target ${{ matrix.target }}
      - name: Package
        shell: bash
        run: |
          mkdir -p package
          cp target/${{ matrix.target }}/release/my_game${{ matrix.ext }} package/
          cp -r assets package/
          cd package && zip -r ../${{ matrix.artifact }}.zip .
      - uses: actions/upload-artifact@v4
        with:
          name: ${{ matrix.artifact }}
          path: ${{ matrix.artifact }}.zip

  build-wasm:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: wasm32-unknown-unknown
      - uses: Swatinem/rust-cache@v2
      - name: Build WASM
        run: cargo build --release --target wasm32-unknown-unknown
      - name: Package
        run: |
          mkdir -p web
          cp target/wasm32-unknown-unknown/release/my_game.wasm web/
          cp -r assets web/
          # Copy your index.html (see below)
          cp index.html web/
          cd web && zip -r ../my-game-wasm.zip .
      - uses: actions/upload-artifact@v4
        with:
          name: my-game-wasm
          path: my-game-wasm.zip

  build-android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build APK via Docker
        run: |
          docker run --rm \
            -v $(pwd):/root/src \
            -w /root/src \
            notfl3/cargo-apk cargo quad-apk build --release
      - name: Package
        run: |
          cp target/android-artifacts/release/apk/*.apk my-game-android.apk
      - uses: actions/upload-artifact@v4
        with:
          name: my-game-android
          path: my-game-android.apk

  create-release:
    needs: [build-desktop, build-wasm, build-android]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          path: artifacts
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: |
            artifacts/my-game-linux/my-game-linux.zip
            artifacts/my-game-windows/my-game-windows.zip
            artifacts/my-game-macos-x64/my-game-macos-x64.zip
            artifacts/my-game-macos-arm64/my-game-macos-arm64.zip
            artifacts/my-game-wasm/my-game-wasm.zip
            artifacts/my-game-android/my-game-android.apk
          draft: false
          generate_release_notes: true
```

---

## WASM Host Page

Macroquad provides a JS loader. Create an `index.html` in your project root:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <title>My Game</title>
    <style>
        html, body { margin: 0; padding: 0; overflow: hidden; background: #000; }
        canvas { display: block; }
    </style>
</head>
<body>
    <canvas id="glcanvas" tabindex="1"></canvas>
    <script>
        // Macroquad's standard WASM loader
        var importObject = {
            env: {
                console_log: function() {},
                console_debug: function() {},
                console_info: function() {},
                console_warn: function() {},
                console_error: function() {},
            }
        };
        // Use the sapp-jsutils loader from macroquad
        load("my_game.wasm");
    </script>
    <!-- Include macroquad's JS support files -->
    <script src="https://not-fl3.github.io/miniquad-samples/mq_js_bundle.js"></script>
</body>
</html>
```

> **Tip:** For production, download `mq_js_bundle.js` and host it alongside your WASM file rather than linking to the external URL.

---

## Publishing to itch.io

### Manual Upload

```bash
# Install Butler (itch.io's CLI uploader)
# https://itch.io/docs/butler/

# Upload each platform channel
butler push my-game-linux.zip    your-name/my-game:linux
butler push my-game-windows.zip  your-name/my-game:windows
butler push my-game-macos-x64.zip your-name/my-game:mac
butler push my-game-wasm.zip     your-name/my-game:html5
butler push my-game-android.apk  your-name/my-game:android
```

### Automated itch.io Upload (CI)

Add to the `create-release` job:

```yaml
      - name: Install Butler
        run: |
          curl -L -o butler.zip https://broth.itch.ovh/butler/linux-amd64/LATEST/archive/default
          unzip butler.zip
          chmod +x butler
      - name: Push to itch.io
        env:
          BUTLER_API_KEY: ${{ secrets.BUTLER_API_KEY }}
        run: |
          ./butler push artifacts/my-game-linux/my-game-linux.zip \
            your-name/my-game:linux --userversion ${{ github.ref_name }}
          ./butler push artifacts/my-game-windows/my-game-windows.zip \
            your-name/my-game:windows --userversion ${{ github.ref_name }}
          ./butler push artifacts/my-game-wasm/my-game-wasm.zip \
            your-name/my-game:html5 --userversion ${{ github.ref_name }}
```

Set your `BUTLER_API_KEY` as a repository secret (get it from https://itch.io/user/settings/api-keys).

---

## Speeding Up Docker Android Builds

The Docker-based Android build does a clean build every time by default. To cache dependencies:

```yaml
  build-android:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Cache cargo registry for Docker
        uses: actions/cache@v4
        with:
          path: /tmp/cargo-registry
          key: android-cargo-${{ hashFiles('**/Cargo.lock') }}
          restore-keys: android-cargo-
      - name: Build APK
        run: |
          mkdir -p /tmp/cargo-registry
          docker run --rm \
            -v /tmp/cargo-registry:/usr/local/cargo/registry \
            -v $(pwd):/root/src \
            -w /root/src \
            notfl3/cargo-apk cargo quad-apk build --release
```

This mounts the host's cargo registry into the Docker container, avoiding re-downloading all dependencies on each build.

---

## Release Profile Optimization

Add to your `Cargo.toml` for optimized release builds across all platforms:

```toml
[profile.release]
opt-level = 3       # Maximum optimization
lto = true           # Link-time optimization — smaller, faster binary
strip = true         # Strip debug symbols
codegen-units = 1    # Better optimization (slower compile)

# Keep dev builds fast while dependencies stay optimized
[profile.dev.package."*"]
opt-level = 3
```

> **WASM-specific:** For WASM builds, also consider `wasm-opt` (from `binaryen`) to further shrink the `.wasm` file:
> ```bash
> wasm-opt -O3 -o my_game_opt.wasm my_game.wasm
> ```

---

## Checklist

- [ ] CI runs `cargo fmt`, `clippy`, and `cargo test` on every PR
- [ ] Game logic is separated from rendering for testability
- [ ] Release workflow triggers on version tags (`v*`)
- [ ] Desktop builds for Linux, Windows, macOS (both x64 and ARM64)
- [ ] WASM build includes `index.html` and JS loader
- [ ] Android APK built via Docker with cached cargo registry
- [ ] GitHub Releases created automatically with all platform artifacts
- [ ] itch.io upload automated with Butler
- [ ] Release profile uses LTO and strip for smaller binaries
