# Distribution and Publishing

> **Category:** guide · **Engine:** Defold · **Related:** [G6 Native Extensions & Build](G6_native_extensions_and_build.md), [G8 Hot Reload & Live Update](G8_hot_reload_and_live_update.md)

Defold supports bundling to Android, iOS, HTML5, Windows, macOS, Linux, and consoles (Nintendo Switch, PS4, PS5, Xbox) — all from the same project. Bundling can be done through the editor GUI or automated with the `bob.jar` command-line tool. There are no licensing fees, royalties, or runtime costs.

---

## Bundling from the Editor

Select **Project → Bundle...** from the menu bar and choose your target platform. The editor handles compilation, resource packing, and platform-specific packaging.

### Supported Targets

| Platform | Output | Notes |
|----------|--------|-------|
| Windows | `.exe` + data | 32-bit and 64-bit |
| macOS | `.app` bundle | x86-64 and arm64 (Apple Silicon) |
| Linux | executable + data | x86-64 and arm64 |
| Android | `.apk` or `.aab` | 32-bit (armv7) and 64-bit (arm64) |
| iOS | `.ipa` | 64-bit only; requires code signing |
| HTML5 | `.html` + `.js` + `.wasm` | js-web and wasm-web architectures |
| Nintendo Switch | — | Requires approved developer access |
| PS4 / PS5 | — | Requires approved developer access |
| Xbox | — | Requires approved developer access |

---

## game.project Settings for Bundling

All build and bundle configuration lives in `game.project` (INI format). Key sections:

### [project]

```ini
[project]
title = My Game
version = 1.0.0
custom_resources = /assets/data     ; included in game.arcd, accessible via sys.load_resource()
bundle_resources = /bundle          ; copied as-is into the bundle per platform
```

- **custom_resources** — files packed (with compression) into the game archive. Access at runtime with `sys.load_resource("/assets/data/config.json")`.
- **bundle_resources** — files placed alongside the executable, not in the archive. Organize by platform subfolder:

```
/bundle/
├── common/           # all platforms
├── x86_64-win32/     # Windows 64-bit
├── x86_64-macos/     # macOS Intel
├── arm64-macos/      # macOS Apple Silicon
├── armv7-android/    # Android 32-bit
├── arm64-android/    # Android 64-bit
└── js-web/           # HTML5
```

### [display]

```ini
[display]
width = 1280
height = 720
fullscreen = 0
```

### [android]

```ini
[android]
package = com.example.mygame
version_code = 1
minimum_sdk_version = 19
target_sdk_version = 34
```

### [ios]

```ini
[ios]
bundle_identifier = com.example.mygame
bundle_version = 1
infoplist = /bunsettings/Info.plist   ; custom Info.plist entries
```

### [html5]

```ini
[html5]
custom_heap_size = 256              ; heap size in MB
htmlfile = /bunsettings/custom.html ; custom HTML shell
cssfile = /bunsettings/custom.css
archive_location_prefix = archive   ; path prefix for .arcd files
```

---

## Bob: Command-Line Builder

Bob (`bob.jar`) is Defold's standalone build tool for CI/CD pipelines and automated builds. It is distributed as a Java JAR.

### Requirements

- **Defold 1.12.0+**: OpenJDK 25
- **Older versions**: OpenJDK 21

Download `bob.jar` from the [Defold GitHub Releases](https://github.com/defold/defold/releases) page matching your editor version.

### Basic Commands

```bash
# Resolve library dependencies
java -jar bob.jar resolve

# Build data (compile + archive)
java -jar bob.jar build

# Bundle for a target platform
java -jar bob.jar --platform x86_64-win32 --archive bundle

# Full pipeline: resolve, clean, build, bundle
java -jar bob.jar --platform x86_64-win32 --archive resolve distclean build bundle
```

### Platform Identifiers

| Platform | Identifier |
|----------|-----------|
| Windows 64-bit | `x86_64-win32` |
| Windows 32-bit | `x86-win32` |
| macOS Intel | `x86_64-macos` |
| macOS Apple Silicon | `arm64-macos` |
| Linux 64-bit | `x86_64-linux` |
| Linux ARM | `arm64-linux` |
| Android 64-bit | `arm64-android` |
| Android 32-bit | `armv7-android` |
| iOS 64-bit | `arm64-ios` |
| HTML5 | `js-web,wasm-web` |

### Common bob.jar Options

```bash
--platform <id>          # Target platform
--archive                # Create data archive
--bundle-output <dir>    # Output directory for bundle
--variant <debug|release># Debug or release build
--with-symbols           # Include debug symbols
--strip-executable       # Strip debug info from binary (release)

# Android signing
--keystore <path>        # Keystore file
--keystore-pass <pass>   # Keystore password
--keystore-alias <alias> # Key alias

# iOS signing
--identity <name>        # Code signing identity
--mobileprovisioning <path> # Provisioning profile
```

### Example: Android Release Build

```bash
java -jar bob.jar \
  --platform arm64-android \
  --architectures arm64-android,armv7-android \
  --archive \
  --variant release \
  --strip-executable \
  --keystore release.keystore \
  --keystore-pass "$KEYSTORE_PASS" \
  --keystore-alias mygame \
  --bundle-output build/android \
  resolve distclean build bundle
```

### Example: HTML5 Build

```bash
java -jar bob.jar \
  --platform js-web \
  --architectures js-web,wasm-web \
  --archive \
  --variant release \
  --bundle-output build/html5 \
  resolve distclean build bundle
```

---

## Platform-Specific Notes

### Android

- Generate a release keystore with `keytool` (Java). Keep it safe — you cannot update an app on Google Play without the same signing key.
- Set `minimum_sdk_version` in `game.project` to at least 21 for modern API support.
- For Google Play, bundle as `.aab` (Android App Bundle) rather than `.apk`. Bob produces `.apk` by default; use the `--bundle-format aab` flag if available in your Defold version, or wrap with `bundletool`.

### iOS

- You need an Apple Developer account ($99/year), a code signing identity, and a provisioning profile.
- Create provisioning profiles in the Apple Developer portal. Download and reference them in the bundle dialog or via `--mobileprovisioning` in bob.jar.
- Test on real devices using a development profile. Submit to App Store with a distribution profile.
- Custom entitlements (push notifications, Game Center) merge from a `.entitlements` file specified in `game.project`.

### HTML5

- The default HTML shell works for most cases. Customize with `htmlfile` in `game.project` for branding or embedding.
- Set `custom_heap_size` large enough for your game's runtime memory. 256 MB is a reasonable default; reduce for small games to improve load time.
- Serve with correct MIME types: `.wasm` files need `application/wasm`.
- For itch.io, zip the bundle output folder and upload directly.

### Steam

- Add the Steamworks native extension to your project dependencies.
- Bundle for the target desktop platform (Windows, macOS, Linux).
- Upload the bundle contents to Steam using `steamcmd` or the Steamworks partner site.
- The Defold-Steamworks extension provides API access to achievements, leaderboards, cloud saves, and overlay.

### Console (Switch, PlayStation, Xbox)

- Console support requires signing NDAs with platform holders and receiving approved developer status.
- Defold provides console-specific build targets and documentation under NDA.
- Contact the Defold Foundation or check the Defold developer portal for access.

---

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Build and Bundle
on:
  push:
    tags: ['v*']

jobs:
  bundle:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        platform: [x86_64-win32, x86_64-macos, arm64-macos, js-web]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          java-version: '25'
          distribution: 'temurin'
      - name: Download bob.jar
        run: |
          curl -L -o bob.jar \
            https://github.com/defold/defold/releases/download/${{ env.DEFOLD_VERSION }}/bob/bob.jar
      - name: Build
        run: |
          java -jar bob.jar \
            --platform ${{ matrix.platform }} \
            --archive --variant release --strip-executable \
            --bundle-output build/${{ matrix.platform }} \
            resolve distclean build bundle
      - uses: actions/upload-artifact@v4
        with:
          name: bundle-${{ matrix.platform }}
          path: build/${{ matrix.platform }}
```

### Community Tools

- **defold-deployer** (by Insality) — shell script that wraps bob.jar with per-platform configs, auto-versioning, and one-command multi-platform builds.

---

## Pre-Release Checklist

1. **Version numbers** — update `version` in `game.project`, `version_code` for Android, `bundle_version` for iOS.
2. **Icons and splash screens** — set per-platform icon files in `game.project` under `[android]`, `[ios]`, and `[html5]` sections.
3. **Release variant** — always bundle with `--variant release` and `--strip-executable` for production.
4. **Test on target** — run the bundled output on actual hardware or emulators before submitting to stores.
5. **Debug symbols** — archive debug symbol builds alongside release builds for crash report symbolication.
6. **Live Update** — if using Defold's Live Update feature, verify the resource manifest and CDN configuration before publishing.
