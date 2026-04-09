# G4 — libGDX Cross-Platform Deployment

> **Category:** guide · **Engine:** libGDX · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Kotlin Patterns](G2_kotlin_patterns.md) · [libGDX Rules](../libgdx-arch-rules.md)

---

## Overview

libGDX's architecture separates your game into a shared **core** module and platform-specific **backend** modules. You write game logic once in `core/`, and Gradle tasks handle building for each target: desktop JARs, Android APKs, iOS IPAs, and HTML5 via GWT. This guide covers the deployment pipeline for each platform.

---

## Project Structure (gdx-liftoff)

The recommended project generator is **gdx-liftoff** (replaces the legacy gdx-setup). A typical generated project:

```
my-game/
├── core/              # Shared game logic (Java/Kotlin)
├── lwjgl3/            # Desktop backend (LWJGL3)
├── android/           # Android backend
│   └── assets/        # ALL assets live here (shared across platforms)
├── html/              # HTML5/GWT backend
├── ios/               # iOS backend (RoboVM/MobiVM)
├── gradle.properties  # Version pins for libGDX, plugins, JDK
├── build.gradle       # Root build config
└── settings.gradle
```

**Key convention:** All game assets (textures, audio, fonts, maps) go in `android/assets/`. Other backends symlink or copy from there. This single source of truth prevents asset drift between platforms.

> **Note:** gdx-liftoff names the desktop module `lwjgl3`, not `desktop` (as the legacy gdx-setup did). Adjust any tutorials that reference `desktop` accordingly.

---

## Desktop (Windows, Linux, macOS)

### Build a Fat JAR

```bash
./gradlew lwjgl3:dist
```

Output: `lwjgl3/build/libs/my-game-1.0.jar`

This JAR contains your game code, all dependencies, native libraries for all three desktop OSes, and assets. It runs anywhere with a JRE:

```bash
java -jar my-game-1.0.jar
```

### Platform-Specific Packaging

For distribution, wrap the JAR with a bundled JRE so players don't need Java installed:

| Tool | What It Does |
|------|-------------|
| **jpackage** (JDK 16+) | Creates native installers (.msi, .deb, .dmg) with bundled JRE |
| **Packr** | libGDX community tool — bundles a trimmed JRE into a native executable |
| **GraalVM Native Image** | AOT compile to a native binary (experimental with libGDX) |

```bash
# jpackage example (JDK 16+)
jpackage --input lwjgl3/build/libs \
         --main-jar my-game-1.0.jar \
         --name "My Game" \
         --type dmg   # or msi, deb, rpm
```

### macOS Considerations

macOS requires `-XstartOnFirstThread` for LWJGL3. gdx-liftoff sets this automatically in the generated Gradle config, but if you run manually:

```bash
java -XstartOnFirstThread -jar my-game-1.0.jar
```

---

## Android

### Prerequisites

Install the Android SDK (via Android Studio) and configure `ANDROID_HOME` or set `sdk.dir` in `local.properties`.

### Build a Debug APK

```bash
./gradlew android:assembleDebug
```

Output: `android/build/outputs/apk/debug/android-debug.apk`

Install directly to a connected device:

```bash
adb install android/build/outputs/apk/debug/android-debug.apk
```

### Build a Release APK

```bash
./gradlew android:assembleRelease
```

The release APK must be **signed** before it can be installed or published. Configure signing in `android/build.gradle`:

```groovy
android {
    signingConfigs {
        release {
            storeFile file("my-keystore.jks")
            storePassword "your-store-password"
            keyAlias "your-key-alias"
            keyPassword "your-key-password"
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled true
            proguardFiles getDefaultProguardFile('proguard-android.txt'),
                          'proguard-rules.pro'
        }
    }
}
```

> **Security:** Never commit keystore passwords to version control. Use environment variables or a `local.properties` file excluded from git.

### Android-Specific Tips

**Screen sizes:** libGDX handles scaling via `Viewport` classes (`FitViewport`, `ExtendViewport`, etc.). Test on multiple aspect ratios.

**Permissions:** Declare only what you need in `AndroidManifest.xml`. `INTERNET` permission is common for analytics/leaderboards but triggers a Play Store warning if unused.

**ProGuard/R8:** Minification can break reflection-based code. libGDX's wiki provides recommended ProGuard rules. The gdx-liftoff template includes a starter `proguard-rules.pro`.

---

## iOS

### Backend Options

| Backend | Status | Java Version | Notes |
|---------|--------|-------------|-------|
| **RoboVM (MobiVM fork)** | Active | Java 8–11 | Community-maintained fork, most common |
| **Multi-OS Engine (MOE)** | Active | Java 11+ | Intel/Google project, supports newer JDKs |

gdx-liftoff defaults to **MobiVM/RoboVM**.

### Prerequisites

iOS builds require **macOS** with **Xcode** installed (including command-line tools). You also need an Apple Developer account for device testing and distribution.

### Build and Run on Simulator

```bash
./gradlew ios:launchIPhoneSimulator
```

### Build an IPA for Device

```bash
./gradlew ios:createIPA
```

Output: `ios/build/robovm/IOSLauncher.ipa`

### Signing for App Store

Configure your provisioning profile and signing identity in `ios/build.gradle` or `robovm.xml`:

```xml
<config>
    <iosSdkVersion>17.0</iosSdkVersion>
    <iosSignIdentity>iPhone Distribution</iosSignIdentity>
    <iosProvisioningProfile>your-profile-uuid</iosProvisioningProfile>
</config>
```

### iOS-Specific Tips

**Metal vs. OpenGL ES:** As of iOS 12+, Apple deprecated OpenGL ES. RoboVM/MobiVM still uses it via a compatibility layer, but test thoroughly on newer devices. MoltenVK is a longer-term path.

**Memory:** iOS is aggressive about killing background apps. Implement `ApplicationListener.pause()` and `resume()` to save/restore state.

**Launch screens:** Required by Apple — configure in `ios/data/` with a storyboard or asset catalog.

---

## HTML5 / Web (GWT)

### How It Works

The HTML5 backend uses **Google Web Toolkit (GWT)** to transpile your Java code to JavaScript. Your game runs in a browser canvas with WebGL.

### Build

```bash
./gradlew html:dist
```

Output: `html/build/dist/` — a directory containing `index.html`, compiled JS, and assets.

### Serve Locally

```bash
cd html/build/dist
python3 -m http.server 8080
```

### GWT Limitations

GWT is the most restrictive backend. Key constraints:

**No reflection.** GWT does not support `java.lang.reflect`. Libraries that rely on reflection won't work. This affects many serialization libraries.

**Limited JDK classes.** Only a subset of `java.util`, `java.lang`, `java.io` are emulated. No `java.nio`, no `java.net`, limited `java.io`.

**No multithreading.** JavaScript is single-threaded. `Thread`, `synchronized`, `wait/notify` do not exist.

**GWT module descriptor.** Each source module needs a `.gwt.xml` file declaring which packages to include:

```xml
<!-- html/src/.../GdxDefinition.gwt.xml -->
<module>
    <inherits name='com.badlogic.gdx.backends.gdx_backends_gwt' />
    <inherits name='MyGame' />
    <entry-point class='com.mygame.GwtLauncher' />
    <set-configuration-property name="gdx.assetpath" value="../android/assets" />
</module>
```

**Third-party libraries:** Must be GWT-compatible. Check the libGDX wiki's list of GWT-friendly extensions. If a library isn't GWT-compatible, it can only be used in non-HTML backends.

### Deploying to itch.io

1. Run `./gradlew html:dist`
2. Zip the contents of `html/build/dist/`
3. Upload to itch.io as an "HTML" project
4. Set the viewport dimensions to match your game's virtual resolution

---

## Multi-Platform Build Script

A convenience script to build all platforms:

```bash
#!/bin/bash
set -e

echo "=== Building Desktop JAR ==="
./gradlew lwjgl3:dist

echo "=== Building Android APK ==="
./gradlew android:assembleRelease

echo "=== Building HTML5 ==="
./gradlew html:dist

echo "=== Building iOS IPA ==="  # macOS only
if [[ "$(uname)" == "Darwin" ]]; then
    ./gradlew ios:createIPA
else
    echo "Skipping iOS (requires macOS)"
fi

echo "=== Done ==="
echo "Desktop: lwjgl3/build/libs/"
echo "Android: android/build/outputs/apk/release/"
echo "HTML5:   html/build/dist/"
echo "iOS:     ios/build/robovm/"
```

---

## Platform Comparison

| Feature | Desktop | Android | iOS | HTML5 |
|---------|---------|---------|-----|-------|
| Graphics API | OpenGL 2.0+ | OpenGL ES 2.0/3.0 | OpenGL ES (deprecated) | WebGL 1.0/2.0 |
| Java version | Any (JDK 8+) | Dalvik/ART | Java 8–11 (RoboVM) | GWT transpiled |
| Reflection | Full | Full | Full | None |
| Threading | Full | Full | Full | None |
| File I/O | Full `java.io` | Android storage | iOS sandbox | Virtual FS |
| Distribution | JAR, native installer | Play Store, APK | App Store, TestFlight | Web hosting, itch.io |
| Build tool | `lwjgl3:dist` | `android:assembleRelease` | `ios:createIPA` | `html:dist` |

---

## Troubleshooting

**"Unsupported class file major version"** — Your JDK is too new for the backend. RoboVM requires JDK 8–11. GWT works best with JDK 11–17.

**Assets not found on Android** — Assets must be in `android/assets/`, not `core/assets/`. Other backends reference the android assets directory.

**GWT compilation fails with "no source code available"** — The library isn't GWT-compatible, or you need to add an `<inherits>` entry in your `.gwt.xml`.

**iOS build fails: "No provisioning profile"** — You need an Apple Developer account and a valid provisioning profile for the target device or simulator.

**Desktop JAR won't launch on macOS** — Add `-XstartOnFirstThread` to the JVM arguments. gdx-liftoff's generated run configurations include this automatically.
