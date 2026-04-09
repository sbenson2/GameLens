# G113 — MonoGame 3.8.4 Stable, 3.8.4.1 Patch & 3.8.5 Preview Changelog

> **Category:** guide · **Engine:** MonoGame · **Related:** [G101 3.8.3 & 3.8.4 Release Guide](./G101_383_384_release_guide.md) · [G91 3.8.5 Migration Guide](./G91_385_migration_guide.md) · [G82 3.8.5 Starter Kit & New APIs](./G82_385_starterkit_new_apis.md) · [G83 Vulkan & DX12 Backend Preview](./G83_vulkan_dx12_backend_preview.md) · [G111 Content Builder Custom Importers Migration](./G111_content_builder_custom_importers_migration.md) · [G81 NativeAOT Publishing](./G81_nativeaot_publishing.md)

Comprehensive changelog covering MonoGame **3.8.4** (June 2025), the **3.8.4.1** hotfix (October 2025), and the **3.8.5 preview** series (December 2025 – January 2026). Use this guide to understand what changed, what broke, and how to upgrade.

---

## Table of Contents

1. [3.8.4 Stable — June 2025](#1-384-stable--june-2025)
2. [3.8.4.1 Hotfix — October 2025](#2-3841-hotfix--october-2025)
3. [3.8.5 Preview.1 — December 2025](#3-385-preview1--december-2025)
4. [3.8.5 Preview.2 — January 2026](#4-385-preview2--january-2026)
5. [Upgrade Path](#5-upgrade-path)
6. [Known Issues & Workarounds](#6-known-issues--workarounds)

---

## 1. 3.8.4 Stable — June 2025

The first MonoGame release to go through a full **preview pipeline** (7 preview builds) before stable. Primary focus: fix Android regressions from 3.8.3 and improve AOT delivery.

### Bug Fixes

| Area | Fix |
|------|-----|
| **Graphics** | Fixed `IndexBuffer` reflection issue; resolved compressed DDS texture handling |
| **Graphics (Vulkan)** | Corrected `rgbaBytes` calculation that caused Vulkan validation errors; fixed `dxc` invocation for Vulkan shader profile compilation |
| **Audio** | Fixed `SoundEffectInstance` looping under XAudio; corrected `OggStreamer` singleton implementation and refactored streamer |
| **Input** | Fixed GamePad issues on Android and iOS; added device name support for Android GamePads |
| **Content Pipeline** | Fixed content error silencing; corrected absolute path handling for image files; fixed asset file length not being written in `MG_Asset_Open` |
| **MGCB Editor** | Corrected sizing issues and `mgcb` invocation problems; fixed incorrect nesting of imported link paths in MGCB browser |

### New Features & Improvements

| Area | Change |
|------|--------|
| **Native API** | Added native asset loading API for lower-level asset management |
| **MGFXC** | Added C Header output to the effect compiler — enables interop with native rendering code |
| **DesktopGL** | Implemented `MessageBox.Show()` for DesktopGL platform |
| **AOT** | Improved AOT compatibility for content readers and `EffectReader` — fewer warnings with `PublishTrimmed` |
| **Lifecycle** | Fixed `UnloadContent` to execute before `Exiting` event fires |
| **Build** | Updated to newer Wine distribution; updated pipeline NuGet packages; removed unnecessary OpenAL binaries from iOS |

### Upgrading to 3.8.4

```xml
<!-- Update all MonoGame package references in your .csproj -->
<PackageReference Include="MonoGame.Framework.DesktopGL" Version="3.8.4" />
<PackageReference Include="MonoGame.Content.Builder.Task" Version="3.8.4" />
```

No API breaking changes. If you target Android, test GamePad input — the fixes change how device names are reported.

---

## 2. 3.8.4.1 Hotfix — October 2025

A targeted patch addressing **mobile platform policy compliance**. Desktop and console builds are unaffected.

### Changes

- **Google Play policy compliance** — updated Android target SDK and manifest declarations to meet Google's latest policy requirements.
- **iOS API updates** — adjusted deprecated API calls for current iOS SDK compatibility.
- **No desktop/console impact** — if you only ship DesktopGL or DesktopDX, this patch changes nothing for you.

### Upgrading

```xml
<PackageReference Include="MonoGame.Framework.Android" Version="3.8.4.1" />
<PackageReference Include="MonoGame.Framework.iOS" Version="3.8.4.1" />
<!-- Desktop packages remain at 3.8.4 or update to 3.8.4.1 (no-op) -->
```

---

## 3. 3.8.5 Preview.1 — December 2025

The first public preview of the next feature release. Formalises several experimental systems for community testing before 3.9.

### Headline Features

#### Content Builder Project (Preview)

Replaces the MGCB Editor and `MonoGame.Content.Builder.Task` with a **console-style MSBuild project** that compiles content as part of your normal build.

```
# Old workflow (3.8.4 and earlier)
dotnet tool install dotnet-mgcb-editor  # separate tool
mgcb-editor Content.mgcb               # GUI editor

# New workflow (3.8.5+)
# Content.mgcbproj sits alongside your game .csproj
# No separate tool installation needed
dotnet build  # builds game AND content in one step
```

Key differences:
- **No dotnet-tools.json** — the content builder is a project reference, not a CLI tool.
- **No MonoGame.Content.Builder.Task** — remove this package reference when migrating.
- **MSBuild integration** — content builds participate in incremental build, `dotnet clean`, and CI pipelines natively.

See [G111](./G111_content_builder_custom_importers_migration.md) for custom importer migration details.

#### Native Vulkan Backend (DesktopVK — Preview)

A from-scratch Vulkan 1.2 graphics backend, replacing the OpenGL path for supported platforms. Not yet production-ready — use for testing and early porting.

#### Native DirectX 12 Backend (DesktopDX — Preview)

Replaces the DirectX 11 backend on Windows. Same preview status as Vulkan.

See [G83](./G83_vulkan_dx12_backend_preview.md) for backend architecture details.

### Framework Improvements

| Area | Change |
|------|--------|
| **Runtime** | .NET Standard 2.1 support added to framework assemblies |
| **Input** | Extended GamePad support — up to **8 controllers** (previously 4) |
| **Color** | Added `Color.ToHSL()` and `Color.ToHSV()` conversion methods |
| **Math** | New `Random` implementation with improved distribution |
| **Templates** | New starter-kit templates: `mgblankmgcbstartkit`, `mg2dmgcbstartkit` for Content Builder workflow |

### New Templates

```bash
# Install updated templates
dotnet new install MonoGame.Templates.CSharp::3.8.5-preview.1

# Scaffold with Content Builder Project
dotnet new mg2dmgcbstartkit -n MyGame
```

---

## 4. 3.8.5 Preview.2 — January 2026

Stability fixes on top of Preview.1. The Content Builder Project received the most attention.

- Fixed Content Builder "exited with code 255" on clean builds (was caused by missing restore step).
- Vulkan tearing fix for windowed mode.
- Additional NuGet package testing pipeline for build reliability.

---

## 5. Upgrade Path

### From 3.8.3 → 3.8.4

1. Update all `MonoGame.*` package references to `3.8.4`.
2. Run `dotnet restore`.
3. If targeting Android, test GamePad input — device name reporting changed.
4. If using `PublishTrimmed` or NativeAOT, expect fewer AOT warnings from framework assemblies.

### From 3.8.4 → 3.8.5-preview

1. Update packages to `3.8.5-preview.2` (or latest preview).
2. **Optional:** Migrate to Content Builder Project:
   - Remove `MonoGame.Content.Builder.Task` from `.csproj`.
   - Remove `dotnet-tools.json` entry for MGCB.
   - Create a `.mgcbproj` project from a new template and move your content definitions.
3. **Optional:** Test Vulkan or DX12 backends by switching to `DesktopVK` or `DesktopDX12` framework packages.

> **Warning:** Preview packages are not production-ready. Pin to a specific preview version in CI to avoid surprises.

### NuGet Source for Previews

Preview packages are on the standard NuGet feed. No custom source needed:

```bash
dotnet add package MonoGame.Framework.DesktopGL --version 3.8.5-preview.2
```

---

## 6. Known Issues & Workarounds

| Issue | Workaround |
|-------|------------|
| Content Builder exits with code 255 on clean builds | Run `dotnet restore` on the `.mgcbproj` before building |
| Wine issues on Arch Linux for content builds | Use the `mgcb` Docker container or switch to a Debian-based CI image |
| macOS cmake backward-compatibility break | Pin cmake version in your build script: `brew install cmake@3.28` |
| `DynamicSoundEffectInstance` issues with FAudio/XAudio | Under investigation — avoid dynamic sound effects on Vulkan backend for now |
| Vulkan sporadic single-frame tearing | Not consistently reproducible; partially addressed in preview.2 |

---

## Quick Reference: Version Timeline

```
3.8.2  — Aug 2024  (.NET 8 baseline)
3.8.3  — Apr 2025  (stabilisation, 70+ PRs)
3.8.4  — Jun 2025  (Android fixes, AOT improvements, 7 previews)
3.8.4.1— Oct 2025  (Google/iOS policy hotfix)
3.8.5-preview.1 — Dec 2025  (Content Builder, Vulkan, DX12)
3.8.5-preview.2 — Jan 2026  (stability fixes)
```
