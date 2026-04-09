# G54 — Build Automation & CI/CD DevOps

> **Category:** guide · **Engine:** Unity 6 (6000.x) · **Related:** [G21 Build Profiles & Cross-Platform](G21_build_profiles_cross_platform.md) · [G18 Automated Testing](G18_automated_testing.md) · [G50 Platform Toolkit](G50_platform_toolkit_cross_platform.md) · [Unity Rules](../unity-arch-rules.md)

Shipping a game means building it reliably and repeatedly. This guide covers Unity's build automation ecosystem: **Unity Build Automation** (cloud CI/CD, formerly Cloud Build), **Unity Build Server** (on-prem floating licenses), **Build Profiles** (Unity 6+), and patterns for integrating with third-party CI systems like GitHub Actions, GitLab CI, and Jenkins.

---

## Architecture Overview

```
Developer Workstation              CI/CD Layer                      Distribution
┌──────────────────┐          ┌──────────────────────┐         ┌──────────────┐
│  Unity Editor    │──push──►│  Unity Build          │──build─►│ Steam / App  │
│  (local dev)     │  (VCS)  │  Automation (Cloud)   │  output │ Store / Itch │
│                  │         │  ───── OR ─────       │         │              │
│  Build Profiles  │         │  Self-hosted CI       │         │ TestFlight / │
│  (per-platform)  │         │  + Build Server       │         │ Google Play  │
└──────────────────┘         │  (on-prem licenses)   │         └──────────────┘
                              └──────────────────────┘
                                       │
                              ┌────────┴────────┐
                              │  Test Runner     │
                              │  (EditMode +     │
                              │   PlayMode tests)│
                              └─────────────────┘
```

### Decision: Cloud vs. Self-Hosted

| Factor | Build Automation (Cloud) | Self-Hosted + Build Server |
|--------|-------------------------|---------------------------|
| Setup effort | Low (connect VCS, go) | Medium (install Unity, configure agents) |
| Cost model | Per-minute metering | Build Server license + infra |
| Scalability | Auto-scales | You manage capacity |
| Platform builds | iOS builds on Unity's macOS farm | Need your own macOS hardware for iOS |
| Secrets/assets | Stored in Unity dashboard | Full control on your infra |
| Custom tooling | Pre/post-build scripts | Full pipeline control |
| Free tier | 200 Windows build-minutes, 5 GB | None |

---

## Unity Build Profiles (Unity 6+)

Build Profiles replace the old Build Settings window with a scriptable, version-controllable asset that stores per-platform build configuration.

### Creating a Build Profile

```
Editor → File → Build Profiles → Create New Profile
```

Each profile stores: target platform, scripting backend (IL2CPP/Mono), scenes list, compression, development flags, and custom scripting defines.

```csharp
// WHY: Build Profiles are ScriptableObjects stored in your Assets folder.
// This makes them version-controllable and shareable across the team.
// You can switch active profile via script for CI automation.

using UnityEditor;
using UnityEditor.Build.Profile;

public static class CIBuildHelper
{
    // WHY: CI agents call this method via -executeMethod to set the
    // correct profile before building. This avoids hardcoding platform
    // settings in a build script — the profile asset IS the config.
    public static void BuildWithProfile()
    {
        // Load the profile asset by path
        // WHY: Keep profiles in a known location so CI scripts can find them.
        var profile = AssetDatabase.LoadAssetAtPath<BuildProfile>(
            "Assets/BuildProfiles/SteamPC-Release.asset");

        if (profile == null)
        {
            UnityEngine.Debug.LogError("Build profile not found!");
            EditorApplication.Exit(1);
            return;
        }

        // Activate the profile — sets platform, defines, scenes, etc.
        BuildProfile.SetActiveBuildProfile(profile);

        // Build using the profile's configured settings
        var options = new BuildPlayerOptions
        {
            scenes = profile.scenes.Select(s => s.path).ToArray(),
            locationPathName = "Builds/SteamPC/MyGame.exe",
            target = profile.buildTarget,
            options = BuildOptions.None  // Add BuildOptions.Development for debug
        };

        var report = BuildPipeline.BuildPlayer(options);

        if (report.summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded)
        {
            UnityEngine.Debug.LogError($"Build failed: {report.summary.totalErrors} errors");
            EditorApplication.Exit(1);
        }
    }
}
```

### Profile Organization

```
Assets/
└── BuildProfiles/
    ├── SteamPC-Release.asset      # Windows/Linux, IL2CPP, shipping
    ├── SteamPC-Development.asset  # Windows, Mono, dev console enabled
    ├── iOS-Release.asset          # iOS, IL2CPP, App Store settings
    ├── Android-Release.asset      # Android, IL2CPP, AAB format
    └── WebGL-Release.asset        # WebGL, compressed, Brotli
```

---

## Unity Build Automation (Cloud)

### Quick Start

1. **Connect VCS** — Link your Git, SVN, Perforce, or Unity Version Control repo in the Unity Dashboard (https://dashboard.unity3d.com)
2. **Create Build Target** — Choose platform (Windows, macOS, iOS, Android, WebGL), Unity version, and build profile
3. **Configure triggers** — Auto-build on push, or manual trigger
4. **Run** — Build Automation clones your repo, opens the project headless, and builds

### Build Manifest (Runtime)

Build Automation injects a JSON manifest at build time so your game can display build info:

```csharp
using UnityEngine;

// WHY: The build manifest lets you show build number, commit hash,
// and branch name in your game's title screen or debug overlay.
// This is invaluable for QA — they can report exactly which build
// they're testing without manual tracking.
public class BuildInfo : MonoBehaviour
{
    [System.Serializable]
    private class BuildManifest
    {
        public string scmCommitId;    // Git commit hash
        public string scmBranch;      // Branch name
        public string buildNumber;    // Auto-incrementing build number
        public string buildStartTime; // UTC timestamp
        public string projectId;      // Unity project ID
        public string bundleId;       // Application identifier
        public string unityVersion;   // Unity version used to build
    }

    void Start()
    {
        // WHY: The manifest is injected as a TextAsset resource.
        // It only exists in Build Automation builds, so handle null
        // gracefully for local builds.
        var manifestAsset = Resources.Load<TextAsset>("UnityCloudBuildManifest");

        if (manifestAsset != null)
        {
            var manifest = JsonUtility.FromJson<BuildManifest>(manifestAsset.text);
            Debug.Log($"Build #{manifest.buildNumber} from {manifest.scmBranch} " +
                      $"({manifest.scmCommitId[..8]})");
        }
        else
        {
            Debug.Log("Local build — no cloud manifest available.");
        }
    }
}
```

### Pre/Post-Build Scripts

Build Automation can execute custom C# methods before and after the build:

```csharp
using UnityEditor;
using UnityEditor.Build;
using UnityEngine;

// WHY: Pre-export scripts run BEFORE Unity starts the build process.
// Use them to set version numbers, inject secrets, or validate assets.
// Configure the method name in the Build Automation dashboard under
// "Advanced Settings → Pre-Export Method".
public static class CloudBuildHelper
{
    // Called by Build Automation before the build starts
    public static void PreExport(UnityEditor.Build.Reporting.BuildReport report)
    {
        // WHY: Read environment variables set in the dashboard
        // to inject secrets without committing them to VCS.
        var apiKey = System.Environment.GetEnvironmentVariable("GAME_API_KEY");
        if (!string.IsNullOrEmpty(apiKey))
        {
            // Write to a ScriptableObject or config file
            Debug.Log("Injected API key from environment.");
        }

        // WHY: Auto-increment version from the build number
        var buildNumber = System.Environment.GetEnvironmentVariable("BUILD_NUMBER");
        if (!string.IsNullOrEmpty(buildNumber))
        {
            PlayerSettings.bundleVersion = $"1.0.{buildNumber}";
        }
    }

    // Called after the build succeeds
    public static void PostExport(string exportPath)
    {
        Debug.Log($"Build exported to: {exportPath}");
        // Upload to Steam, itch.io, or notify Slack
    }
}
```

---

## Self-Hosted CI with Build Server

For teams that need full control or build on proprietary hardware, Unity Build Server provides floating licenses for headless Unity Editor instances.

### GitHub Actions Example

```yaml
# .github/workflows/unity-build.yml
# WHY: This workflow builds the game on every push to main
# and on pull requests, catching build breaks early.

name: Unity Build
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest  # Use windows-latest for Windows builds
    strategy:
      matrix:
        # WHY: Matrix builds let you build multiple platforms in parallel.
        targetPlatform:
          - StandaloneWindows64
          - StandaloneLinux64
          - WebGL

    steps:
      # WHY: game-ci/unity-builder is the community-standard Action
      # for Unity CI. It handles license activation automatically.
      - uses: actions/checkout@v4
        with:
          lfs: true  # WHY: Most game projects use Git LFS for assets

      - uses: game-ci/unity-builder@v4
        env:
          UNITY_LICENSE: ${{ secrets.UNITY_LICENSE }}
          UNITY_EMAIL: ${{ secrets.UNITY_EMAIL }}
          UNITY_PASSWORD: ${{ secrets.UNITY_PASSWORD }}
        with:
          targetPlatform: ${{ matrix.targetPlatform }}
          unityVersion: 6000.1.1f1  # WHY: Pin the exact version to avoid surprises
          buildMethod: CIBuildHelper.BuildWithProfile  # Custom method (optional)

      # WHY: Upload the build artifact so it can be downloaded
      # from the Actions run page or passed to a deploy job.
      - uses: actions/upload-artifact@v4
        with:
          name: Build-${{ matrix.targetPlatform }}
          path: build/${{ matrix.targetPlatform }}
```

### GitLab CI Example

```yaml
# .gitlab-ci.yml
# WHY: GitLab CI uses Docker runners. game-ci provides
# pre-built Unity Docker images for each version.

stages:
  - test
  - build

variables:
  UNITY_VERSION: "6000.1.1f1"

# WHY: Run EditMode and PlayMode tests before building.
# A failing test should block the build pipeline.
test:
  stage: test
  image: unityci/editor:ubuntu-${UNITY_VERSION}-base-3
  script:
    - unity-editor -batchmode -nographics
        -runTests -testPlatform EditMode
        -testResults results-editmode.xml
    - unity-editor -batchmode -nographics
        -runTests -testPlatform PlayMode
        -testResults results-playmode.xml
  artifacts:
    reports:
      junit:
        - results-editmode.xml
        - results-playmode.xml

build-windows:
  stage: build
  image: unityci/editor:ubuntu-${UNITY_VERSION}-windows-mono-3
  script:
    - unity-editor -batchmode -nographics -quit
        -executeMethod CIBuildHelper.BuildWithProfile
  artifacts:
    paths:
      - Builds/
```

---

## Running Tests in CI

Unity Test Runner supports two test modes. Both should run in CI:

```csharp
// WHY: EditMode tests run without entering Play mode — fast and suitable
// for testing pure logic, ScriptableObjects, and editor tools.
// PlayMode tests run in a simulated game loop — needed for MonoBehaviour
// lifecycle, physics, coroutines, and integration tests.

// Command line (for any CI system):
// EditMode tests:
//   unity-editor -batchmode -nographics -runTests -testPlatform EditMode
//
// PlayMode tests:
//   unity-editor -batchmode -nographics -runTests -testPlatform PlayMode
//
// Both output NUnit XML results that CI systems can parse.
```

---

## Build Optimization for CI

### Cache Strategy

| What to Cache | Why | How |
|---------------|-----|-----|
| `Library/` folder | Reimporting assets is the slowest step | CI cache keyed on `Assets/**` hash |
| `Packages/` resolved | Avoids re-downloading UPM packages | Cache `Library/PackageCache/` |
| IL2CPP output | Incremental C++ compilation | Cache `Library/Il2cppBuildCache/` |
| Gradle caches (Android) | Avoids re-downloading Android deps | Cache `~/.gradle/` |

### Build Time Reduction Checklist

1. **Cache the Library folder** — can reduce build time by 50–80%
2. **Use IL2CPP incremental builds** — only recompiles changed assemblies
3. **Strip unused engine modules** — smaller builds, faster linking
4. **Use Addressables** — assets not in the build reduce initial build size
5. **Parallel builds via matrix** — build all platforms concurrently
6. **Pin Unity version** — avoids reimport when version drifts

---

## Build Automation REST API

Unity provides a REST API for programmatic control of Build Automation:

```bash
# WHY: The REST API lets you trigger builds from external systems
# (Slack bots, deployment scripts, custom dashboards).

# Trigger a build
curl -X POST \
  "https://build-api.cloud.unity3d.com/api/v1/orgs/{orgId}/projects/{projectId}/buildtargets/{targetId}/builds" \
  -H "Authorization: Basic ${UNITY_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{"clean": false}'

# Check build status
curl -X GET \
  "https://build-api.cloud.unity3d.com/api/v1/orgs/{orgId}/projects/{projectId}/buildtargets/{targetId}/builds/{buildNumber}" \
  -H "Authorization: Basic ${UNITY_API_KEY}"
```

---

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| "License not found" in CI | Unity not activated on the agent | Use `unity-editor -manualLicenseFile` or game-ci activation step |
| Build succeeds locally, fails in CI | Different Unity version or missing packages | Pin version, commit `Packages/manifest.json` and `packages-lock.json` |
| iOS build fails in CI | No macOS runner available | Use Build Automation (has macOS farm) or self-host a Mac mini |
| Android build fails: SDK not found | Android SDK/NDK not installed on agent | Use game-ci images with `-android` suffix, or install via Unity Hub CLI |
| Slow builds (30+ min) | No Library cache, full reimport every time | Implement CI caching for `Library/` folder |
| Build manifest missing at runtime | Not using Build Automation | Generate your own manifest in a pre-build script |

---

## Version History

| Version | Change |
|---------|--------|
| Unity 5.x | Cloud Build (original service) |
| Unity 2020+ | Unity Build Server licensing introduced |
| Unity 6.0 | Build Profiles replace Build Settings, Build Automation rebranding |
| Unity 6.1 | Build Profile CLI support, improved cloud build speed |
