# G101 — MonoGame 3.8.3 & 3.8.4 Release Guide

> **Category:** guide · **Engine:** MonoGame · **Related:** [G82 3.8.5 Starter Kit & New APIs](./G82_385_starterkit_new_apis.md) · [G91 3.8.5 Migration Guide](./G91_385_migration_guide.md) · [G81 NativeAOT Publishing](./G81_nativeaot_publishing.md) · [G32 Deployment & Platform Builds](./G32_deployment_platform_builds.md) · [G8 Content Pipeline](./G8_content_pipeline.md)

What changed in MonoGame **3.8.3** (April 2025) and **3.8.4** (June 2025), how to upgrade, and what to watch for. These two releases bridge the gap between the .NET 8 baseline established in 3.8.2 and the native-backend previews arriving in 3.8.5.

---

## Overview

### 3.8.3 — April 2025

A broad stabilisation release with **70+ merged PRs** and contributions from 16 first-time contributors. Key themes:

- **SDL upgraded to 2.32.2** — picks up fresh gamepad mappings, Wayland fixes on Linux, and improved high-DPI behaviour across platforms.
- **VS 2022 extension refresh** — new 2D cross-platform project templates ship directly in the extension, so `dotnet new` is no longer the only way to scaffold a project.
- **Content Pipeline parity** — the pipeline now works reliably on all supported platforms. Internal dependencies (FreeType for font rendering, FreeImage for texture import) were rebuilt to current upstream versions.
- **AOT / trimming compliance** — framework assemblies were annotated so that `PublishTrimmed` and NativeAOT builds produce fewer warnings. See [G81](./G81_nativeaot_publishing.md) for the full AOT workflow.
- **Audio fixes** — OpenAL was updated, fixing multiple `SoundEffect` issues on desktop. `MediaPlayer` song playback on Android was fixed.
- **Input improvements** — corrected GamePad button mappings on Android and iOS; joystick input fixes for multi-device scenarios.
- **Preliminary native platform scaffolding** — internal plumbing that later becomes the Vulkan / DX12 backends in 3.8.5.

### 3.8.4 — June 2025

A focused **maintenance release** that primarily addresses Android regressions introduced in 3.8.3. This was the first MonoGame release to use a **preview release pipeline** (7 preview builds) before the stable tag.

- **Android delivery fixes** — resolved build and runtime issues on Android targets that surfaced after 3.8.3.
- **Further AOT improvements** — additional trimming annotations and AOT-safe code paths.
- **New testing pipeline** — CI now builds and runs the official MonoGame Samples as integration tests, catching platform regressions earlier.
- **Build dependency upgrades** — Wine (used for content building on macOS / Linux) was updated; compressed texture support was added to the content pipeline for broader format coverage.

---

## Upgrading from 3.8.2

### Step 1 — Update NuGet References

```xml
<!-- In your .csproj -->
<PackageReference Include="MonoGame.Framework.DesktopGL"
                  Version="3.8.4" />
<PackageReference Include="MonoGame.Content.Builder.Task"
                  Version="3.8.4" />
```

If you target a specific platform package (e.g., `MonoGame.Framework.Android`), update that reference to `3.8.4` as well.

```bash
# CLI shortcut — run from solution root
dotnet restore
dotnet build
```

### Step 2 — Verify Content Pipeline

The FreeType and FreeImage updates in 3.8.3 can change how certain fonts and textures are imported. After upgrading:

1. **Rebuild all content** — delete your `Content/bin` and `Content/obj` folders, then do a full rebuild.
2. **Spot-check fonts** — SpriteFont glyph metrics may shift by a pixel. Compare in-game text rendering before and after.
3. **Check compressed textures** — 3.8.4 added broader compressed texture support. If you previously used workarounds for unsupported formats, test whether native support now handles them.

```bash
# Force a clean content rebuild
rm -rf Content/bin Content/obj
dotnet build
```

### Step 3 — Validate Input Mappings

If your game targets Android or iOS, test gamepad input thoroughly. The button mapping corrections in 3.8.3 fix incorrect mappings but may change what your players experience if you had worked around the old (broken) mappings.

```csharp
// Quick diagnostic — log actual button states on Android
var state = GamePad.GetState(PlayerIndex.One);
System.Diagnostics.Debug.WriteLine(
    $"A={state.Buttons.A} B={state.Buttons.B} " +
    $"X={state.Buttons.X} Y={state.Buttons.Y}");
```

If you had manual remapping code, remove it and test with the corrected defaults first.

### Step 4 — Test AOT / Trimmed Builds

If you publish with `PublishTrimmed=true` or `PublishAot=true`, rebuild and check for new trim warnings. Most should be resolved, but third-party libraries may still produce warnings.

```xml
<!-- .csproj — enable trim analysis during development -->
<PropertyGroup>
  <SuppressTrimAnalysisWarnings>false</SuppressTrimAnalysisWarnings>
  <EnableTrimAnalyzer>true</EnableTrimAnalyzer>
</PropertyGroup>
```

---

## SDL 2.32.2 — What It Means for Your Game

SDL is the platform abstraction layer MonoGame uses on DesktopGL and Linux. The upgrade to 2.32.2 brings:

| Area | Improvement |
|------|-------------|
| **Wayland** | Native Wayland support on Linux — no more `SDL_VIDEODRIVER=x11` workaround for many distros |
| **High-DPI** | Improved DPI scaling on multi-monitor setups (Windows, Linux) |
| **Gamepad DB** | Updated controller mappings — more controllers work out of the box |
| **Audio** | Fixes for audio device hot-plugging on Linux |

If your game ships on Linux, test under both X11 and Wayland sessions. MonoGame defaults to Wayland when available on SDL 2.32.2.

```bash
# Force X11 if Wayland causes issues (environment variable)
export SDL_VIDEODRIVER=x11
./MyGame
```

---

## Preview Release Pipeline (3.8.4+)

Starting with 3.8.4, the MonoGame Foundation publishes preview NuGet packages before each stable release. This lets you catch breaking changes early in your own project.

```xml
<!-- Add the MonoGame preview feed (nuget.config) -->
<configuration>
  <packageSources>
    <add key="MonoGame-Preview"
         value="https://www.myget.org/F/monogame/api/v3/index.json" />
  </packageSources>
</configuration>
```

```xml
<!-- Reference a preview version -->
<PackageReference Include="MonoGame.Framework.DesktopGL"
                  Version="3.8.5-preview.2" />
```

Testing against previews is especially valuable if you are planning to adopt the Vulkan / DX12 backends in 3.8.5. See [G83](./G83_vulkan_dx12_backends.md) for backend details.

---

## CI Integration with the Samples Test Pipeline

3.8.4 introduced a CI pattern where the official MonoGame Samples are built and run as integration tests. You can adopt the same approach for your own project:

```yaml
# GitHub Actions example — build + headless smoke test
name: MonoGame CI
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '8.0.x'
      - run: dotnet restore
      - run: dotnet build --configuration Release
      - name: Headless smoke test
        run: |
          export SDL_VIDEODRIVER=dummy
          export SDL_AUDIODRIVER=dummy
          dotnet run --project MyGame -- --headless --frames 120
```

The `SDL_VIDEODRIVER=dummy` and `SDL_AUDIODRIVER=dummy` environment variables let MonoGame initialise without a real display or audio device — useful for CI runners. Your game needs to support a `--headless` flag that exits after a set number of frames. See [G85](./G85_headless_testing_ci.md) for the full headless testing pattern.

---

## Quick Migration Checklist

```
□ Update NuGet packages to 3.8.4
□ Delete Content/bin and Content/obj — full rebuild
□ Spot-check SpriteFont rendering for glyph shifts
□ Test gamepad input on Android / iOS (remove old workarounds)
□ Rebuild with PublishTrimmed — check for new warnings
□ Test on Linux under both X11 and Wayland
□ Consider adding headless CI smoke tests
□ If preparing for 3.8.5 — try preview packages on a branch
```

---

## Where to Go Next

- **[G91 3.8.5 Migration Guide](./G91_385_migration_guide.md)** — for upgrading to 3.8.5 and the new native backends
- **[G83 Vulkan & DX12 Backends](./G83_vulkan_dx12_backends.md)** — deep dive into the new graphics backends
- **[G100 Content Builder Project](./G100_385_content_builder_project.md)** — the new content build system in 3.8.5
- **[G81 NativeAOT Publishing](./G81_nativeaot_publishing.md)** — AOT workflow now improved by 3.8.3 / 3.8.4 annotations
- **[G80 CI/CD Automated Builds](./G80_ci_cd_automated_builds.md)** — full CI pipeline setup
