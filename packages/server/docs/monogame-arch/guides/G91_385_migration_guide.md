# G91 — MonoGame 3.8.5 Migration Guide

> **Category:** guide · **Engine:** MonoGame · **Related:** [G72 Content Builder Migration](./G72_content_builder_migration.md) · [G73 Cross-Platform Deployment](./G73_cross_platform_deployment.md) · [G79 Content Builder Project](./G79_content_builder_project.md) · [G82 3.8.5 StarterKit & New APIs](./G82_385_starterkit_new_apis.md) · [G83 Vulkan & DX12 Backends](./G83_vulkan_dx12_backends.md)

How to migrate an existing MonoGame project from 3.8.2–3.8.4 to the 3.8.5 release series. Covers the new Content Builder Project that replaces MGCB Editor, opting into the Vulkan and DirectX 12 preview backends, updated NuGet package references, and common migration pitfalls.

---

## Release Timeline

| Version | Date | Focus |
|---------|------|-------|
| 3.8.2 | Aug 2024 | .NET 8 upgrade, UWP removal, doc overhaul |
| 3.8.3 | 2025 | Maintenance, Android fixes |
| 3.8.4 / 3.8.4.1 | Oct 2025 | Android hotfixes, AoT improvements, first preview releases |
| 3.8.5-preview.1 | Dec 2025 | Vulkan backend preview, DX12 backend preview, new Content Builder |
| 3.8.5-preview.2 | Jan 2026 | Continued preview refinement |

> **Status as of April 2026:** 3.8.5 is still in preview. The guidance below covers migrating to the preview packages. API surface may change before the stable release. Pin your preview version in CI to avoid surprises.

---

## Step 1: Update NuGet Packages

Replace your existing MonoGame package references with the 3.8.5 preview versions. The exact package depends on your target platform.

### Standard Desktop (OpenGL)

```xml
<!-- Before (3.8.2–3.8.4) -->
<PackageReference Include="MonoGame.Framework.DesktopGL" Version="3.8.2.1105" />
<PackageReference Include="MonoGame.Content.Builder.Task" Version="3.8.2.1105" />

<!-- After (3.8.5 preview) -->
<PackageReference Include="MonoGame.Framework.DesktopGL" Version="3.8.5-preview.2" />
<!-- Content.Builder.Task is no longer needed if using the new Content Builder Project -->
```

### Windows DirectX (existing DX11)

```xml
<PackageReference Include="MonoGame.Framework.WindowsDX" Version="3.8.5-preview.2" />
```

### Preview Backends (Vulkan / DX12)

These are new platform targets — separate NuGet packages:

```xml
<!-- Vulkan (cross-platform) -->
<PackageReference Include="MonoGame.Framework.DesktopVK" Version="3.8.5-preview.2" />

<!-- DirectX 12 (Windows) -->
<PackageReference Include="MonoGame.Framework.DesktopDX" Version="3.8.5-preview.2" />
```

> **Note:** Vulkan and DX12 backends are preview-quality. Known issues include occasional single-frame screen tearing on Vulkan. Use them for testing and early adoption, not for shipping builds yet.

### Installing Preview Packages

Preview packages require either the NuGet CLI or a `nuget.config` that includes the MonoGame preview feed:

```bash
dotnet add package MonoGame.Framework.DesktopGL --version 3.8.5-preview.2
```

Or in Visual Studio, check "Include prerelease" in the NuGet package manager.

---

## Step 2: Migrate to the Content Builder Project

The biggest breaking change in 3.8.5 is the replacement of the MGCB Editor workflow with a **Content Builder Project** — a standalone `.csproj` that compiles your content assets as part of the normal MSBuild process.

### What Changes

| Before (3.8.2–3.8.4) | After (3.8.5) |
|-|-|
| `.mgcb` file edited in MGCB Editor (dotnet tool) | Content defined in a `Content.csproj` |
| `dotnet-tools.json` with `dotnet-mgcb-editor` | No dotnet tool required |
| `MonoGame.Content.Builder.Task` NuGet in game `.csproj` | `BuildContent` MSBuild target references `Content.csproj` |
| `MonoGameContentReference` item in game `.csproj` | Removed — content build is triggered by MSBuild target |

### Migration Steps

**1. Create the Content Builder Project**

Use the new template:

```bash
dotnet new mgcontent -n Content
```

This creates a `Content/Content.csproj` with the necessary MSBuild integration.

**2. Move your assets**

Move your existing content assets (textures, fonts, audio, effects) into the `Content/` project directory. The folder structure can remain the same.

**3. Define content items in Content.csproj**

Instead of listing assets in an `.mgcb` file, use MSBuild item groups:

```xml
<Project Sdk="MonoGame.Content.Builder.Sdk">
  <ItemGroup>
    <!-- Textures -->
    <Compile Include="Textures/**/*.png">
      <Importer>TextureImporter</Importer>
      <Processor>TextureProcessor</Processor>
    </Compile>

    <!-- Fonts -->
    <Compile Include="Fonts/**/*.spritefont">
      <Importer>FontDescriptionImporter</Importer>
      <Processor>FontDescriptionProcessor</Processor>
    </Compile>

    <!-- Effects -->
    <Compile Include="Effects/**/*.fx">
      <Importer>EffectImporter</Importer>
      <Processor>EffectProcessor</Processor>
    </Compile>
  </ItemGroup>
</Project>
```

> **Importer/Processor names are the same** as in the `.mgcb` file. If you had custom importers/processors, they still work — reference their assembly in the `Content.csproj`.

**4. Update your game .csproj**

Remove the old content builder references and add the MSBuild target:

```xml
<!-- Remove these -->
<!-- <PackageReference Include="MonoGame.Content.Builder.Task" ... /> -->
<!-- <MonoGameContentReference Include="Content/Content.mgcb" /> -->

<!-- Add the BuildContent target import -->
<Import Project="Content/BuildContent.targets" />
```

The `BuildContent.targets` file is created by the content project template. It hooks into the `BeforeBuild` target to compile content automatically.

**5. Delete the old MGCB tooling**

```bash
# Remove the dotnet tool manifest entry
dotnet tool uninstall dotnet-mgcb-editor

# Delete the .mgcb file (after verifying Content.csproj is complete)
rm Content/Content.mgcb
```

**6. Build and verify**

```bash
dotnet build
```

Content is now compiled as part of the regular build. Errors appear in the standard MSBuild output — no separate MGCB Editor log to check.

---

## Step 3: Platform-Specific Changes

### Android

MonoGame 3.8.4 included significant Android fixes. If upgrading from 3.8.2 directly to 3.8.5:

- Ensure your Android target SDK is 34+ (required by Google Play as of 2025)
- AoT (Ahead-of-Time) compilation is improved — test with `PublishAot=true` for startup performance
- Review the 3.8.4 changelog for Android-specific breaking changes

### NativeAOT

If you use NativeAOT publishing (see [G81](./G81_nativeaot_publishing.md)), the 3.8.4+ improvements to AoT delivery should reduce publish size and improve compatibility. Re-test your trimming configuration after upgrading.

---

## Step 4: Opting Into Vulkan or DX12 (Optional)

The Vulkan and DX12 backends are separate platform targets, not a toggle on the existing DesktopGL/WindowsDX targets.

### Creating a Multi-Backend Solution

The recommended approach is a shared game project with platform-specific launcher projects:

```
MyGame/
├── MyGame.Shared/          ← Game logic, systems, components
│   └── MyGame.Shared.csproj
├── MyGame.DesktopGL/       ← OpenGL launcher
│   └── MyGame.DesktopGL.csproj
├── MyGame.DesktopVK/       ← Vulkan launcher (preview)
│   └── MyGame.DesktopVK.csproj
└── Content/                ← Content Builder Project
    └── Content.csproj
```

Each launcher `.csproj` references the shared project and the appropriate MonoGame framework package:

```xml
<!-- MyGame.DesktopVK.csproj -->
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="MonoGame.Framework.DesktopVK"
                      Version="3.8.5-preview.2" />
    <ProjectReference Include="../MyGame.Shared/MyGame.Shared.csproj" />
  </ItemGroup>
</Project>
```

### API Differences

The Vulkan and DX12 backends implement the same MonoGame API surface. Your game code should not need changes. However:

- **Shader compilation** may produce different `.mgfx` bytecode per backend. The content pipeline handles this automatically when you set the target platform.
- **Performance characteristics** differ. Vulkan and DX12 generally have lower driver overhead for draw-call-heavy scenes, but may not outperform OpenGL for simple 2D games.
- **Debugging tools** differ by backend — use RenderDoc for Vulkan, PIX for DX12, and platform-native tools for OpenGL.

---

## Common Migration Pitfalls

| Issue | Solution |
|-------|----------|
| `Content.mgcb` references still in `.csproj` | Remove all `MonoGameContentReference` items and `MonoGame.Content.Builder.Task` package references |
| Content not building | Verify `BuildContent.targets` is imported and `Content.csproj` lists all assets |
| Missing content at runtime | Check that content output directory matches `Content.RootDirectory` in your `Game1` constructor |
| Preview package not found | Enable "Include prerelease" in NuGet UI or use `--version 3.8.5-preview.2` on CLI |
| Vulkan screen tearing | Known issue in preview — intermittent single-frame tearing. No workaround yet; wait for a later preview |
| Custom content importers broken | Reference your importer assembly in the new `Content.csproj` instead of the `.mgcb` file |
| `dotnet-mgcb-editor` conflicts | Uninstall the dotnet tool to avoid confusion — it is no longer used |

---

## Rollback Plan

If migration fails or introduces regressions:

1. Revert the NuGet package versions to your previous 3.8.2/3.8.4 versions
2. Restore the `.mgcb` file and `MonoGame.Content.Builder.Task` reference
3. Re-install `dotnet-mgcb-editor` if needed

Keep the old `.mgcb` file in version control until the Content Builder Project is verified working in CI and local builds.

---

## Checklist

```
[ ] NuGet packages updated to 3.8.5-preview.2
[ ] Content Builder Project created and all assets listed
[ ] Old .mgcb references removed from game .csproj
[ ] dotnet-mgcb-editor uninstalled
[ ] dotnet build succeeds with content compilation
[ ] Game loads all assets at runtime
[ ] CI pipeline updated (if applicable)
[ ] Vulkan/DX12 backend tested (if opting in)
[ ] Old .mgcb file archived or deleted
```
