# G118 — MonoGame 3.8.2 Migration & .NET 8 Upgrade

> **Category:** guide · **Engine:** MonoGame · **Related:** [G72 Content Builder Migration](./G72_content_builder_migration.md) · [G73 Cross-Platform Deployment](./G73_cross_platform_deployment.md) · [G79 Content Builder Project](./G79_content_builder_project.md) · [G81 NativeAOT Publishing](./G81_nativeaot_publishing.md) · [G101 3.8.3/3.8.4 Release Guide](./G101_383_384_release_guide.md) · [G113 3.8.4/3.8.5 Release Changelog](./G113_384_385_release_changelog.md)

Step-by-step migration guide for upgrading MonoGame projects from **3.8.0/3.8.1** to **3.8.2**. Covers the .NET 8 target framework change, the critical switch from global to local MGCB tooling, UWP removal, and content pipeline adjustments.

---

## Table of Contents

1. [What Changed in 3.8.2](#1-what-changed-in-382)
2. [Pre-Migration Checklist](#2-pre-migration-checklist)
3. [Step 1 — Update Target Framework](#3-step-1--update-target-framework)
4. [Step 2 — Switch MGCB to Local Tool](#4-step-2--switch-mgcb-to-local-tool)
5. [Step 3 — Update NuGet Packages](#5-step-3--update-nuget-packages)
6. [Step 4 — Remove UWP References](#6-step-4--remove-uwp-references)
7. [Step 5 — Verify Content Pipeline](#7-step-5--verify-content-pipeline)
8. [Step 6 — Test & Fix Build](#8-step-6--test--fix-build)
9. [Visual Studio 2022 Setup](#9-visual-studio-2022-setup)
10. [Troubleshooting](#10-troubleshooting)
11. [Post-Migration — Path to 3.8.3+](#11-post-migration--path-to-383)

---

## 1. What Changed in 3.8.2

MonoGame 3.8.2 (released August 16, 2024) is a maintenance and modernization release:

| Change | Impact |
|--------|--------|
| **.NET 8 target** | All templates and the framework itself now build on .NET 8 |
| **MGCB is now a local tool** | No more global `dotnet tool install` — each project manages its own MGCB version via `.config/dotnet-tools.json` |
| **UWP removed** | Windows UWP platform target dropped (Microsoft ended UWP support) |
| **XML documentation cleanup** | Massive pass on API docs — IntelliSense improvements throughout |
| **XNA documentation migration** | Continued porting of legacy XNA docs into MonoGame's documentation |
| **Build system improvements** | Internal build pipeline modernization |
| **Bug fixes** | Various fixes across audio, graphics, input, and content pipeline |

---

## 2. Pre-Migration Checklist

Before starting:

```
□ Commit all current work (clean git state)
□ Verify your project builds and runs on 3.8.0/3.8.1
□ Note your current .NET target (net6.0, net7.0, etc.)
□ Install .NET 8 SDK (download from dotnet.microsoft.com)
□ Back up your .mgcb content project file
```

---

## 3. Step 1 — Update Target Framework

Edit your game project's `.csproj`:

```xml
<!-- Before (3.8.0/3.8.1) -->
<TargetFramework>net6.0</TargetFramework>

<!-- After (3.8.2) -->
<TargetFramework>net8.0</TargetFramework>
```

If you have a multi-targeted project, update all targets. Remove any `net6.0` entries unless you need to maintain backward compatibility.

---

## 4. Step 2 — Switch MGCB to Local Tool

This is the **most important change** in 3.8.2. The MGCB content builder is no longer installed globally — it's a local tool tied to your project.

### 4a. Uninstall Global Tools

Remove the old global tools to avoid version conflicts:

```bash
dotnet tool uninstall dotnet-mgcb -g
dotnet tool uninstall dotnet-2mgfx -g
dotnet tool uninstall dotnet-mgcb-editor -g
```

### 4b. Create Local Tool Manifest

**Option A — From a new template** (recommended):

Create a temporary project to grab the config:

```bash
dotnet new mgdesktopgl -o temp-project
```

Copy the `.config/dotnet-tools.json` file from `temp-project/` into your project's root directory. Delete the temp project.

**Option B — Manual creation:**

Create `.config/dotnet-tools.json` in your solution root:

```json
{
  "version": 1,
  "isRoot": true,
  "tools": {
    "dotnet-mgcb": {
      "version": "3.8.2.1105",
      "commands": [
        "mgcb"
      ]
    },
    "dotnet-mgcb-editor": {
      "version": "3.8.2.1105",
      "commands": [
        "mgcb-editor"
      ]
    },
    "dotnet-mgcb-editor-linux": {
      "version": "3.8.2.1105",
      "commands": [
        "mgcb-editor-linux"
      ]
    },
    "dotnet-mgcb-editor-mac": {
      "version": "3.8.2.1105",
      "commands": [
        "mgcb-editor-mac"
      ]
    },
    "dotnet-mgcb-editor-windows": {
      "version": "3.8.2.1105",
      "commands": [
        "mgcb-editor-windows"
      ]
    }
  }
}
```

### 4c. Restore Local Tools

```bash
dotnet tool restore
```

This downloads the MGCB tools locally. Each project can now pin its own version independently.

### 4d. Verify

```bash
dotnet mgcb --version
```

Should output the 3.8.2 version. If it says "command not found," run `dotnet tool restore` again from the directory containing `.config/dotnet-tools.json`.

---

## 5. Step 3 — Update NuGet Packages

Update MonoGame framework packages in your `.csproj`:

```xml
<ItemGroup>
  <!-- Pick your platform: -->
  <PackageReference Include="MonoGame.Framework.DesktopGL" Version="3.8.2.1105" />
  <!-- OR -->
  <PackageReference Include="MonoGame.Framework.WindowsDX" Version="3.8.2.1105" />
  
  <!-- Content builder -->
  <PackageReference Include="MonoGame.Content.Builder.Task" Version="3.8.2.1105" />
</ItemGroup>
```

Then restore:

```bash
dotnet restore
```

---

## 6. Step 4 — Remove UWP References

If your project targeted UWP (Windows 10 Universal), that platform is no longer supported:

```xml
<!-- Remove any of these if present: -->
<PackageReference Include="MonoGame.Framework.WindowsUniversal" ... />
```

**Migration path for UWP projects:** Target `MonoGame.Framework.WindowsDX` instead for Windows desktop, or `DesktopGL` for cross-platform. UWP APIs (e.g., `Windows.Storage`) will need replacement with standard .NET equivalents.

---

## 7. Step 5 — Verify Content Pipeline

The `.mgcb` content project file format hasn't changed, but the tooling path has. Open your `Content.mgcb` file and verify:

```
#-------------------------------- References --------------------------------#

# No changes needed here — references are the same

#---------------------------------- Content ---------------------------------#

# Existing content entries work as-is
```

Rebuild all content:

```bash
dotnet mgcb Content/Content.mgcb /rebuild
```

If you had custom content pipeline extensions, verify they target .NET 8. Extensions compiled against .NET 6 may need recompilation. See [G108 Custom Content Pipeline Extensions](./G108_custom_content_pipeline_extensions.md).

---

## 8. Step 6 — Test & Fix Build

```bash
dotnet build
dotnet run
```

### Common Build Errors After Migration

**`NETSDK1045: The current .NET SDK does not support targeting .NET 8`**
→ Install the .NET 8 SDK. Verify with `dotnet --list-sdks`.

**`error MGCB: command not found`**
→ Run `dotnet tool restore` from the directory containing `.config/dotnet-tools.json`.

**`warning NU1903: Package 'X' has a known vulnerability`**
→ .NET 8 enables NuGet audit by default. Update affected packages or suppress with `<NuGetAudit>false</NuGetAudit>` in your `.csproj` (not recommended long-term).

**Custom content importers fail to load**
→ Recompile your content pipeline extension project targeting `net8.0`. The MGCB tool loads extensions as .NET 8 assemblies now.

---

## 9. Visual Studio 2022 Setup

For the best experience with 3.8.2 in Visual Studio:

1. **Install the MonoGame extension** — provides "Open MGCB Editor" context menu on `.mgcb` files and project templates
2. **Update the extension** — older versions may not recognize the local tool configuration
3. **Double-click `.mgcb` files** — should open the MGCB Editor without needing CLI commands

If the MGCB Editor doesn't open from VS, verify `dotnet tool restore` has been run in the solution directory.

### VS Code / JetBrains Rider

Both work well with 3.8.2. Use the CLI to manage content:

```bash
dotnet mgcb-editor Content/Content.mgcb   # Open the MGCB Editor GUI
dotnet mgcb Content/Content.mgcb /rebuild  # CLI rebuild
```

---

## 10. Troubleshooting

### "Multiple MGCB versions found"

If you have both global and local MGCB installed, the local version takes precedence, but this can cause confusion. Uninstall global tools (Step 2a) to avoid ambiguity.

### Content builds work in CLI but not in VS

The MonoGame VS extension may cache the old global tool path. Restart VS after running `dotnet tool restore`. If the issue persists, update the MonoGame VS extension.

### NativeAOT compatibility

MonoGame 3.8.2 on .NET 8 has improved NativeAOT support. If targeting NativeAOT, see [G81 NativeAOT Publishing](./G81_nativeaot_publishing.md) and [G99 Source Generators & AOT-Safe Serialization](./G99_source_generators_aot_serialization.md) for reflection-free patterns.

### Linux/macOS MGCB Editor

The MGCB Editor on Linux and macOS uses platform-specific packages (`dotnet-mgcb-editor-linux`, `dotnet-mgcb-editor-mac`). These are included in the `dotnet-tools.json` manifest and restored automatically. If the editor doesn't launch, verify the platform-specific package is in your manifest.

---

## 11. Post-Migration — Path to 3.8.3+

Once you're stable on 3.8.2, the path forward:

| Version | Key changes | Migration effort |
|---------|------------|------------------|
| **3.8.3** | Content Builder updates, bug fixes | Minor — package version bump |
| **3.8.4** | Additional APIs, further .NET improvements | Minor — see [G101](./G101_383_384_release_guide.md) |
| **3.8.5** | Preview features (Vulkan/DX12 backends, compute shaders) | Moderate — see [G113](./G113_384_385_release_changelog.md), [G83](./G83_vulkan_dx12_backends.md) |

The **local MGCB tool** pattern makes version bumps safer — each project can upgrade independently. Pin your version in `dotnet-tools.json` and bump it when ready.

---

## Migration Checklist Summary

```
□ .NET 8 SDK installed
□ TargetFramework set to net8.0
□ Global MGCB tools uninstalled
□ .config/dotnet-tools.json created with 3.8.2 versions
□ dotnet tool restore succeeded
□ NuGet packages updated to 3.8.2.1105
□ UWP references removed (if applicable)
□ Content pipeline rebuilt successfully
□ Custom content pipeline extensions recompiled for net8.0
□ Project builds and runs
□ .config/ directory committed to version control
```
