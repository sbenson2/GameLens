# G21 — Build Profiles & Cross-Platform Deployment in Unity 6

> **Category:** guide · **Engine:** Unity 6 (6000.x) · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [E2 Project Structure](../architecture/E2_project_structure.md) · [G9 Addressables](G9_addressables_asset_management.md) · [Unity Rules](../unity-arch-rules.md)

Unity 6 introduces **Build Profiles** — a system for managing multiple platform configurations as first-class assets in your project. Instead of a single global Build Settings dialog that you constantly reconfigure, each target platform (and variant) gets its own Build Profile with independent scene lists, scripting defines, compression settings, and managed packages. This guide covers the Build Profile workflow, the Platform Browser, cross-platform scripting strategies, CI/CD integration, and common deployment pitfalls.

---

## Why Build Profiles?

Before Unity 6, switching platforms meant:

1. Open Build Settings → Switch Platform (wait for reimport)
2. Manually toggle scripting defines, quality settings, and scene lists
3. Hope nobody committed the wrong Build Settings to version control
4. Repeat for every platform your game ships on

Build Profiles solve this by making each platform configuration a versioned `.asset` file. Multiple team members can build for different platforms simultaneously without interfering with each other, and CI pipelines can reference specific profiles by name.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────┐
│                  Platform Browser                     │
│  Shows all available platforms + installed support    │
│  Desktop: Windows, macOS, Linux                      │
│  Mobile: Android, iOS, visionOS                      │
│  Web: WebGL, Web (new)                               │
│  Console: PlayStation, Xbox, Nintendo (closed)       │
│  XR: Meta Quest, Apple Vision Pro                    │
└──────────────┬───────────────────────────────────────┘
               │  "Add Build Profile"
               ▼
┌──────────────────────────────────────────────────────┐
│               Build Profile (.asset)                  │
│                                                       │
│  Platform Target: Android                             │
│  Scene List: [MainMenu, Level1, Level2, Credits]     │
│  Scripting Defines: [MOBILE, TOUCH_INPUT]            │
│  Compression: LZ4HC                                  │
│  Build Type: Development / Release                   │
│  Managed Packages: [com.unity.mobile.notifications]  │
│  Player Settings Override: [resolution, icon, etc.]  │
└──────────────────────────────────────────────────────┘
```

---

## Creating Your First Build Profile

### Step 1 — Open the Build Profiles Window

**File → Build Profiles** (replaces the old Build Settings window in Unity 6).

### Step 2 — Add a Platform via the Platform Browser

Click **Add Build Profile** to open the Platform Browser. Select your target platform. If the platform module isn't installed, Unity will prompt you to install it through the Unity Hub.

> **Note:** When you create a profile for a platform, Unity automatically installs required packages for that platform. Optional packages (e.g., `com.unity.mobile.notifications` for mobile) can be selected during creation.

### Step 3 — Configure the Profile

Each Build Profile has these sections:

| Section | What It Controls |
|---------|-----------------|
| **Scenes in Build** | Which scenes are included and their build index order |
| **Scripting Define Symbols** | Preprocessor defines active for this profile only |
| **Compression Method** | Default, LZ4, LZ4HC — balances build size vs. load speed |
| **Build Type** | Development (debugging, profiler) or Release (optimized, stripped) |
| **Player Settings** | Per-profile overrides for resolution, orientation, icons, splash screen |
| **Managed Packages** | Packages that are only included when building this profile |

### Step 4 — Set as Active and Build

Click **Switch Profile** to make this the active build target (this triggers asset reimport if the platform differs). Then click **Build** or **Build and Run**.

---

## Managing Multiple Profiles

### Profile Variants

You can create multiple profiles for the same platform. Common use cases:

```
Profiles/
├── Windows_Development.asset      // Dev build with profiler + debug UI
├── Windows_Release.asset          // Ship build, IL2CPP, stripped
├── Android_Phone.asset            // Standard mobile, Vulkan
├── Android_ChromeOS.asset         // x86_64 target, keyboard input
├── iOS_AppStore.asset             // Release, bitcode enabled
├── iOS_TestFlight.asset           // Development, deep profiling
├── WebGL_Demo.asset               // Subset of scenes, small footprint
└── Steam_Deck.asset               // Linux, gamepad-first, 800p
```

### Duplicating Profiles

Right-click an existing profile → **Copy to New Profile**. This creates an independent copy — changes to the copy don't affect the original.

> **Version control:** Build Profile assets should be committed to your repository. Each `.asset` file is standalone and mergeable.

---

## Cross-Platform Scripting

### Scripting Define Symbols

Build Profiles let you set per-profile defines without touching global Player Settings:

```csharp
// Use defines from your Build Profile to branch platform behavior
public class InputManager : MonoBehaviour
{
    private void Awake()
    {
        #if TOUCH_INPUT
        // Mobile profile has TOUCH_INPUT defined
        EnableTouchControls();
        #elif GAMEPAD_PRIMARY
        // Console / Steam Deck profiles use GAMEPAD_PRIMARY
        EnableGamepadControls();
        ShowControllerGlyphs();
        #else
        // Desktop default
        EnableKeyboardMouseControls();
        #endif
    }
}
```

### Platform-Specific Code with Unity's Built-In Defines

Unity also provides automatic defines based on the active platform:

```csharp
public class PlatformUtils
{
    /// <summary>
    /// Returns the appropriate save path for each platform.
    /// Unity provides Application.persistentDataPath, but you may
    /// want platform-specific subdirectories for cloud save sync.
    /// </summary>
    public static string GetSavePath()
    {
        #if UNITY_ANDROID
        // Android: /storage/emulated/0/Android/data/com.company.game/files/
        return Path.Combine(Application.persistentDataPath, "Saves");

        #elif UNITY_IOS
        // iOS: Documents/ (backed up to iCloud if enabled)
        return Path.Combine(Application.persistentDataPath, "Saves");

        #elif UNITY_WEBGL
        // WebGL: IndexedDB (no real filesystem) — keep saves small
        return "/idbfs/Saves";

        #elif UNITY_STANDALONE_WIN
        // Windows: %APPDATA%/../LocalLow/CompanyName/GameName/
        return Path.Combine(Application.persistentDataPath, "Saves");

        #elif UNITY_STANDALONE_OSX
        // macOS: ~/Library/Application Support/CompanyName/GameName/
        return Path.Combine(Application.persistentDataPath, "Saves");

        #else
        return Application.persistentDataPath;
        #endif
    }
}
```

### Managed Packages

Some packages only make sense for specific platforms. Build Profiles support **Managed Packages** — packages that are included only when that profile is active:

```
Android Profile → Managed Packages:
  com.unity.mobile.notifications    // Local push notifications
  com.unity.mobile.android-logcat   // Android log viewer

iOS Profile → Managed Packages:
  com.unity.mobile.notifications
  com.google.external-dependency-manager  // CocoaPods bridge

WebGL Profile → Managed Packages:
  (none extra — keep build size minimal)
```

This prevents mobile-only packages from bloating your desktop build.

---

## Quality Settings & Adaptive Performance

### Per-Profile Quality Tiers

Use Build Profiles together with Unity's Quality Settings to ship different visual fidelity per platform:

```csharp
// At startup, select the right quality tier based on the platform
// and the device's capability.
public class QualityBootstrap : MonoBehaviour
{
    private void Awake()
    {
        #if UNITY_ANDROID || UNITY_IOS
        // Mobile: start at Medium, let Adaptive Performance adjust
        QualitySettings.SetQualityLevel(1, applyExpensiveChanges: true);
        #elif UNITY_WEBGL
        // WebGL: start at Low to ensure broad browser compatibility
        QualitySettings.SetQualityLevel(0, applyExpensiveChanges: true);
        #else
        // Desktop / Console: start at High
        QualitySettings.SetQualityLevel(2, applyExpensiveChanges: true);
        #endif
    }
}
```

### Adaptive Performance (Mobile)

Unity's Adaptive Performance package (`com.unity.adaptiveperformance`) dynamically adjusts quality at runtime based on thermal state and GPU load:

```csharp
using UnityEngine.AdaptivePerformance;

// Adaptive Performance automatically scales resolution, LODs,
// and effects to prevent thermal throttling on mobile devices.
// You configure "scalers" in the Adaptive Performance settings:
//   - Resolution scaler (dynamic resolution)
//   - LOD bias scaler
//   - Shadow distance/resolution scaler
//   - Particle count scaler
```

---

## CI/CD Integration

### Command-Line Builds

Unity supports headless builds via the command line — essential for CI pipelines:

```bash
# Build using a specific Build Profile from the command line
# Unity 6 uses -activeBuildProfile to select the profile asset
unity -batchmode -quit -nographics \
  -projectPath /path/to/project \
  -activeBuildProfile "Assets/BuildProfiles/Android_Release.asset" \
  -buildTarget Android \
  -executeMethod BuildScript.PerformBuild \
  -logFile build.log
```

### Build Script

```csharp
using UnityEditor;
using UnityEditor.Build;
using UnityEngine;

public static class BuildScript
{
    /// <summary>
    /// Called by CI via -executeMethod. Reads the active Build Profile
    /// and executes the build with its configured settings.
    /// </summary>
    public static void PerformBuild()
    {
        // The active Build Profile is already set by -activeBuildProfile.
        // We can read its scene list and settings programmatically:
        var profile = BuildProfile.GetActiveBuildProfile();

        var options = new BuildPlayerOptions
        {
            scenes = profile.scenes,
            locationPathName = GetOutputPath(profile),
            target = profile.buildTarget,
            options = profile.isDevelopmentBuild
                ? BuildOptions.Development | BuildOptions.ConnectWithProfiler
                : BuildOptions.None
        };

        var report = BuildPipeline.BuildPlayer(options);

        if (report.summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded)
        {
            Debug.LogError($"Build failed: {report.summary.totalErrors} errors");
            EditorApplication.Exit(1);
        }

        Debug.Log($"Build succeeded: {report.summary.outputPath}");
    }

    private static string GetOutputPath(BuildProfile profile)
    {
        // Convention: builds/{profile-name}/{executable}
        string profileName = profile.name.Replace(" ", "_");
        return $"builds/{profileName}/game";
    }
}
```

### Unity Build Automation (Cloud)

Unity's cloud build service can trigger builds from your Build Profiles automatically:

1. Connect your repository in the **Unity Dashboard**
2. Create a build configuration pointing to your Build Profile `.asset` path
3. Set triggers (push to main, tag creation, manual)
4. Builds run on Unity's cloud infrastructure — no local build farm needed

> **Tip:** Add your Build Profile `.asset` files to version control. The Unity Dashboard references these files by path, so they must exist in the repo.

---

## Platform-Specific Considerations

### Desktop (Windows, macOS, Linux)

- **IL2CPP vs Mono:** Use IL2CPP for release builds (better performance, code stripping). Mono for development (faster iteration).
- **Code Stripping:** Set **Managed Stripping Level** to "High" for release to reduce binary size. Test thoroughly — aggressive stripping can remove types accessed only via reflection.
- **Steam Deck:** Treat as a Linux build with `GAMEPAD_PRIMARY` define. Target 800p native with FSR upscaling.

### Mobile (Android, iOS)

- **Minimum API Level:** Android API 24+ (Android 7.0) is a common baseline for Unity 6 projects.
- **Graphics API:** Vulkan is preferred on Android. Metal is the only option on iOS.
- **App Thinning (iOS):** Enable bitcode and asset catalogs in the Build Profile's Player Settings override.
- **Split APKs / AAB:** Google Play requires Android App Bundles (AAB). Configure this in the Android Build Profile.

### Web (WebGL)

- **Compression:** Use Brotli for production (smallest), Gzip for compatibility, Disabled for local testing.
- **Memory:** WebGL is memory-constrained. Set initial memory in Player Settings and use Addressables to load assets on demand.
- **Threading:** WebGL doesn't support C# threads. Use coroutines or `async`/`await` with `UniTask` for async operations.

---

## Common Pitfalls

| Problem | Cause | Fix |
|---------|-------|-----|
| "Platform module not installed" | Platform support not added in Unity Hub | Open Unity Hub → Installs → Add Modules |
| Long reimport when switching profiles | Switching between platforms with different texture formats | Use asset import overrides per-profile, or keep two Editor instances |
| Build succeeds locally but fails in CI | Different Unity version or missing profile asset | Pin your Unity version in CI and ensure `.asset` files are committed |
| Scripting defines not applied | Defines set in global Player Settings but not in the Build Profile | Set defines in the Build Profile itself — profile defines override globals |
| Missing scenes in build | Scene list differs between profiles | Each Build Profile maintains its own scene list — verify after duplicating |
| WebGL build too large | All Addressable groups baked into the build | Configure Addressables to use remote loading (CDN) for WebGL |
| Android build crashes on launch | Wrong minimum API level or missing permission | Check `logcat` output and verify API level in the Build Profile |
| IL2CPP build strips needed types | High stripping level removes reflection targets | Add a `link.xml` file preserving required assemblies/types |

---

## Further Reading

- [Unity Manual — Introduction to Build Profiles](https://docs.unity3d.com/6000.6/Documentation/Manual/build-profiles.html)
- [Unity Manual — Cross-Platform Features](https://docs.unity3d.com/6000.3/Documentation/Manual/cross-platform-features.html)
- [Unity CI/CD Cloud Build](https://unity.com/solutions/ci-cd)
- [G9 — Addressables & Asset Management](G9_addressables_asset_management.md) — load assets on demand per platform
- [E2 — Project Structure](../architecture/E2_project_structure.md) — organize platform-specific assets
