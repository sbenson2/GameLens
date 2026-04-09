# G103 — Mobile Platform Deployment (Android & iOS)

> **Category:** guide · **Engine:** MonoGame · **Related:** [G32 Deployment & Platform Builds](./G32_deployment_platform_builds.md) · [G73 Cross-Platform Deployment](./G73_cross_platform_deployment.md) · [G101 3.8.3 & 3.8.4 Release Guide](./G101_383_384_release_guide.md) · [G7 Input Handling](./G7_input_handling.md) · [G25 Safe Areas & Adaptive Layout](./G25_safe_areas_adaptive_layout.md) · [G33 Profiling & Optimization](./G33_profiling_optimization.md)

End-to-end guide for shipping a MonoGame game on **Android** and **iOS**: project setup, signing, store configuration, touch input, performance tuning, and CI integration. Updated for MonoGame 3.8.4+ with .NET 9 requirements.

---

## Prerequisites

| Requirement | Android | iOS |
|-------------|---------|-----|
| **.NET SDK** | .NET 9+ | .NET 9+ |
| **Workload** | `dotnet workload install android` | `dotnet workload install ios` |
| **IDE** | VS 2022 / Rider / VS Code | VS 2022 (Mac) / Rider (Mac) |
| **SDK** | Android SDK 31+, Java 11 JDK | Xcode (latest), Apple Developer account |
| **Device** | USB debugging or emulator | Physical device or Simulator |

> **Important (3.8.4+):** Google and Apple policy updates require .NET 9 for new app submissions. Ensure your Android and iOS projects **and** any shared class libraries target `net9.0-android` / `net9.0-ios`. MonoGame 3.8.4.1 specifically addressed Android compliance issues — do not ship on an older version.

---

## Project Setup

### Creating a Mobile Project

```bash
# Android
dotnet new mgandroid -n MyGame.Android
# iOS
dotnet new mgios -n MyGame.iOS
```

A typical solution structure shares game logic in a .NET Standard or shared project:

```
MyGame/
├── MyGame.Shared/        # Game logic, content references
│   ├── Game1.cs
│   └── Content/
├── MyGame.Android/       # Android entry point
│   ├── Activity1.cs
│   └── MyGame.Android.csproj
├── MyGame.iOS/           # iOS entry point
│   ├── AppDelegate.cs
│   └── MyGame.iOS.csproj
└── MyGame.Desktop/       # Desktop for fast iteration
    └── Program.cs
```

### .csproj Essentials — Android

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net9.0-android</TargetFramework>
    <ApplicationId>com.yourcompany.mygame</ApplicationId>
    <ApplicationVersion>1</ApplicationVersion>
    <ApplicationDisplayVersion>1.0.0</ApplicationDisplayVersion>
    <SupportedOSPlatformVersion>21</SupportedOSPlatformVersion>
    <!-- Target API 34+ for Google Play compliance -->
    <AndroidTargetSdkVersion>34</AndroidTargetSdkVersion>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="MonoGame.Framework.Android"
                      Version="3.8.4.1" />
    <PackageReference Include="MonoGame.Content.Builder.Task"
                      Version="3.8.4.1" />
  </ItemGroup>
</Project>
```

### .csproj Essentials — iOS

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net9.0-ios</TargetFramework>
    <ApplicationId>com.yourcompany.mygame</ApplicationId>
    <ApplicationDisplayVersion>1.0.0</ApplicationDisplayVersion>
    <SupportedOSPlatformVersion>15.0</SupportedOSPlatformVersion>
    <RuntimeIdentifier>ios-arm64</RuntimeIdentifier>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="MonoGame.Framework.iOS"
                      Version="3.8.4.1" />
    <PackageReference Include="MonoGame.Content.Builder.Task"
                      Version="3.8.4.1" />
  </ItemGroup>
</Project>
```

---

## Touch Input

Mobile games replace keyboard/mouse with touch. MonoGame provides `TouchPanel` for raw touches and `TouchPanel.EnabledGestures` for gesture recognition.

### Raw Touch Input

```csharp
protected override void Update(GameTime gameTime)
{
    var touchState = TouchPanel.GetState();

    foreach (var touch in touchState)
    {
        switch (touch.State)
        {
            case TouchLocationState.Pressed:
                HandleTouchDown(touch.Position);
                break;
            case TouchLocationState.Moved:
                HandleTouchMove(touch.Position);
                break;
            case TouchLocationState.Released:
                HandleTouchUp(touch.Position);
                break;
        }
    }
}
```

### Gesture Recognition

Only enable the gestures your game uses — each enabled gesture adds processing overhead.

```csharp
protected override void Initialize()
{
    // Only enable what you need
    TouchPanel.EnabledGestures =
        GestureType.Tap |
        GestureType.DoubleTap |
        GestureType.Pinch;
}

protected override void Update(GameTime gameTime)
{
    while (TouchPanel.IsGestureAvailable)
    {
        var gesture = TouchPanel.ReadGesture();
        switch (gesture.GestureType)
        {
            case GestureType.Tap:
                HandleTap(gesture.Position);
                break;
            case GestureType.Pinch:
                HandlePinch(gesture.Position, gesture.Position2,
                            gesture.Delta, gesture.Delta2);
                break;
        }
    }
}
```

### High-Frequency Touch Events (Android)

MonoGame supports high-frequency touch input on Android, but it is **disabled by default** to save CPU. Enable it only for games that need precise input (drawing games, music games):

```csharp
// In Activity1.cs — Android only
TouchPanel.EnableHighFrequencyTouch = true;
```

### Virtual Controls Pattern

For action games, map on-screen regions to virtual buttons:

```csharp
public class VirtualButton
{
    public Rectangle Bounds { get; set; }
    public bool IsPressed { get; private set; }

    public void Update(TouchCollection touches)
    {
        IsPressed = false;
        foreach (var touch in touches)
        {
            if (touch.State != TouchLocationState.Released &&
                Bounds.Contains(touch.Position.ToPoint()))
            {
                IsPressed = true;
                break;
            }
        }
    }
}
```

See [G7](./G7_input_handling.md) for the full input abstraction layer and [G25](./G25_safe_areas_adaptive_layout.md) for positioning controls within safe areas on notched devices.

---

## Signing & Store Preparation

### Android — Keystore Signing

```bash
# Generate a keystore (keep this file safe — you cannot change it later)
keytool -genkey -v -keystore mygame-release.keystore \
    -alias mygame -keyalg RSA -keysize 2048 -validity 10000
```

```xml
<!-- .csproj — Release signing (don't commit passwords to source) -->
<PropertyGroup Condition="'$(Configuration)'=='Release'">
  <AndroidKeyStore>true</AndroidKeyStore>
  <AndroidSigningKeyStore>mygame-release.keystore</AndroidSigningKeyStore>
  <AndroidSigningKeyAlias>mygame</AndroidSigningKeyAlias>
  <AndroidSigningKeyPass>$(KEYSTORE_PASSWORD)</AndroidSigningKeyPass>
  <AndroidSigningStorePass>$(KEYSTORE_PASSWORD)</AndroidSigningStorePass>
  <AndroidPackageFormat>aab</AndroidPackageFormat>
</PropertyGroup>
```

```bash
# Build a signed AAB for Google Play
dotnet publish -c Release -f net9.0-android
```

> **Google Play requires AAB** (Android App Bundle), not APK, for new app submissions. Set `AndroidPackageFormat` to `aab`.

### iOS — Code Signing

iOS signing requires an Apple Developer account, a provisioning profile, and a signing certificate.

```xml
<!-- .csproj — Release signing -->
<PropertyGroup Condition="'$(Configuration)'=='Release'">
  <CodesignKey>Apple Distribution: Your Name (TEAMID)</CodesignKey>
  <CodesignProvision>MyGame_AppStore</CodesignProvision>
</PropertyGroup>
```

```bash
# Build for App Store submission
dotnet publish -c Release -f net9.0-ios \
    -r ios-arm64 \
    -p:ArchiveOnBuild=true
```

The `.ipa` file is generated in the publish output directory and can be uploaded via Transporter or `xcrun altool`.

---

## Mobile Performance Tuning

### Texture Compression

Compressed textures reduce memory by ~75% and improve GPU cache performance. Use platform-appropriate formats:

| Format | Platform | Notes |
|--------|----------|-------|
| **ASTC** | Modern Android (OpenGL ES 3.1+) | Best quality-to-size ratio |
| **ETC2** | Android (OpenGL ES 3.0+) | Universal fallback |
| **PVRTC** | iOS | Required for older devices; ASTC preferred on A8+ |

Configure in your content pipeline:

```
#begin Textures/Spritesheet.png
/importer:TextureImporter
/processor:TextureProcessor
/processorParam:TextureFormat=Compressed
/build:Textures/Spritesheet.png
```

The content pipeline selects the correct compressed format per target platform automatically when `TextureFormat=Compressed` is set.

### Draw Call Budget

Mobile GPUs handle fewer draw calls than desktop. Target **under 100 draw calls per frame** for smooth 60fps on mid-range devices.

```csharp
// SpriteBatch already batches by texture — minimise texture swaps
// Sort sprites by texture atlas to keep batch counts low
_spriteBatch.Begin(SpriteSortMode.Texture);
```

Use texture atlases aggressively. See [G94](./G94_runtime_texture_atlas.md) for runtime atlas generation.

### Memory Budget

| Device Tier | Practical VRAM Budget | System RAM Budget |
|-------------|----------------------|-------------------|
| Low-end Android | ~256 MB | ~512 MB |
| Mid-range | ~512 MB | ~1 GB |
| Modern flagship / iPad | ~1 GB+ | ~2 GB+ |

Monitor with:

```csharp
#if ANDROID
long usedMemory = Java.Lang.Runtime.GetRuntime().TotalMemory()
               - Java.Lang.Runtime.GetRuntime().FreeMemory();
System.Diagnostics.Debug.WriteLine(
    $"Java heap: {usedMemory / 1024 / 1024} MB");
#endif
```

### Frame Rate Targeting

Default to 30fps on mobile for battery life; offer 60fps as an option:

```csharp
// In Game1 constructor
TargetElapsedTime = TimeSpan.FromSeconds(1.0 / 30.0);
IsFixedTimeStep = true;

// Player toggles 60fps in settings
public void Set60Fps(bool enabled)
{
    TargetElapsedTime = TimeSpan.FromSeconds(
        1.0 / (enabled ? 60.0 : 30.0));
}
```

---

## CI/CD for Mobile Builds

### GitHub Actions — Android

```yaml
name: Android Build
on: [push]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '9.0.x'
      - run: dotnet workload install android
      - run: dotnet build MyGame.Android -c Release
      - name: Sign & publish AAB
        if: github.ref == 'refs/heads/main'
        run: |
          dotnet publish MyGame.Android -c Release \
            -f net9.0-android \
            -p:AndroidSigningKeyStore=mygame-release.keystore \
            -p:AndroidSigningKeyAlias=mygame \
            -p:AndroidSigningKeyPass=${{ secrets.KEYSTORE_PASSWORD }} \
            -p:AndroidSigningStorePass=${{ secrets.KEYSTORE_PASSWORD }}
      - uses: actions/upload-artifact@v4
        with:
          name: android-aab
          path: '**/*.aab'
```

### GitHub Actions — iOS

iOS builds require a macOS runner:

```yaml
name: iOS Build
on: [push]
jobs:
  build:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '9.0.x'
      - run: dotnet workload install ios
      - run: dotnet build MyGame.iOS -c Release
```

See [G80](./G80_ci_cd_automated_builds.md) for the full CI pipeline architecture.

---

## Common Pitfalls

| Issue | Cause | Fix |
|-------|-------|-----|
| **Black screen on Android** | Missing `Activity` attributes | Ensure `Activity1.cs` has `[Activity(MainLauncher = true, ScreenOrientation = ScreenOrientation.Landscape)]` |
| **Content build fails on CI** | Missing Android SDK on runner | Install SDK via `actions/setup-java` + Android SDK manager |
| **Touch coordinates wrong** | Not accounting for screen scaling | Transform touch positions through your camera/viewport matrix |
| **App rejected by Google Play** | Target SDK too low | Set `AndroidTargetSdkVersion` to 34+ |
| **iOS crash on launch** | Trimming removes needed types | Add `[DynamicDependency]` attributes or use `TrimmerRootAssembly` |
| **Audio stutter on Android** | `SoundEffect` pool exhaustion | Limit concurrent sounds; use [G67 Object Pooling](./G67_object_pooling.md) for sound instances |
| **Battery drain** | Running at 60fps always | Default to 30fps; let the player choose 60fps |

---

## Deployment Checklist

```
□ Target net9.0-android / net9.0-ios (required for store compliance)
□ MonoGame packages at 3.8.4.1+
□ AndroidTargetSdkVersion set to 34+
□ Touch input tested on physical devices (not just emulator)
□ Virtual controls respect safe areas on notched devices
□ Texture compression enabled (ASTC / ETC2 / PVRTC)
□ Draw calls under 100 per frame
□ Frame rate defaulting to 30fps with 60fps option
□ Keystore generated and backed up securely (Android)
□ Provisioning profile configured (iOS)
□ AAB format for Google Play submission
□ CI pipeline builds and signs release artifacts
□ Tested on at least one low-end device per platform
```

---

## Where to Go Next

- **[G32 Deployment & Platform Builds](./G32_deployment_platform_builds.md)** — desktop deployment patterns
- **[G73 Cross-Platform Deployment](./G73_cross_platform_deployment.md)** — shared codebase strategies
- **[G25 Safe Areas & Adaptive Layout](./G25_safe_areas_adaptive_layout.md)** — notch and rounded-corner handling
- **[G7 Input Handling](./G7_input_handling.md)** — full input abstraction layer
- **[G33 Profiling & Optimization](./G33_profiling_optimization.md)** — GPU and CPU profiling tools
- **[G80 CI/CD Automated Builds](./G80_ci_cd_automated_builds.md)** — full pipeline setup
- **[G101 3.8.3 & 3.8.4 Release Guide](./G101_383_384_release_guide.md)** — what changed in recent releases
