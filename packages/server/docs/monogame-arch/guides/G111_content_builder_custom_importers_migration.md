# G111 — Content Builder Project: Custom Importers & Processor Migration

> **Category:** guide · **Engine:** MonoGame · **Related:** [G79 Content Builder Project System](./G79_content_builder_project.md) · [G08 Content Pipeline](./G8_content_pipeline.md) · [G72 Content Builder Migration](./G72_content_builder_migration.md) · [G108 Custom Content Pipeline Extensions](./G108_custom_content_pipeline_extensions.md) · [G81 NativeAOT Publishing](./G81_nativeaot_publishing.md)

How to migrate custom `ContentImporter<T>` and `ContentProcessor<T, TOutput>` implementations from the MGCB Editor workflow (MonoGame 3.8.0–3.8.4) to the new Content Builder Project system (3.8.5+). Covers the breaking changes in 3.8.5-preview.2, workarounds for the deprecated `BuildContent` path, and patterns for registering custom importers in the new console-app model.

---

## Table of Contents

1. [What Changed in 3.8.5](#1-what-changed-in-385)
2. [The Breaking Change: Deprecated BuildContent Path](#2-the-breaking-change-deprecated-buildcontent-path)
3. [Migration Strategy Overview](#3-migration-strategy-overview)
4. [Porting a Custom Importer](#4-porting-a-custom-importer)
5. [Porting a Custom Processor](#5-porting-a-custom-processor)
6. [Registering Custom Pipeline Extensions in the Builder](#6-registering-custom-pipeline-extensions-in-the-builder)
7. [Common Migration Issues](#7-common-migration-issues)
8. [MonoGame.Extended Compatibility](#8-monogame-extended-compatibility)
9. [Testing Custom Pipeline Extensions](#9-testing-custom-pipeline-extensions)

---

## 1. What Changed in 3.8.5

The Content Builder Project (introduced in 3.8.5-preview) replaces the old workflow entirely:

| Aspect | Old (3.8.0–3.8.4) | New (3.8.5+) |
|--------|-------------------|--------------|
| **Content manifest** | `.mgcb` file (custom format) | Standard `.csproj` with `ContentReference` items |
| **Build tool** | `dotnet-mgcb` (dotnet tool) | Console app you own (`dotnet run`) |
| **Custom extensions** | Reference DLLs listed in `.mgcb` | Project references in the Builder `.csproj` |
| **Editor** | MGCB Editor (separate dotnet tool) | No GUI — edit `.csproj` or use your IDE |
| **MSBuild integration** | `MonoGame.Content.Builder.Task` | Removed — you invoke the builder explicitly |
| **Configuration** | `dotnet-tools.json` + `.mgcb` flags | Builder `Program.cs` code + `.csproj` properties |

### What to Remove from Your Game Project

When upgrading to 3.8.5:

```xml
<!-- REMOVE these from your game .csproj -->
<ItemGroup>
  <!-- No longer needed — the builder task is gone -->
  <PackageReference Include="MonoGame.Content.Builder.Task" Version="3.8.4.1" />
</ItemGroup>

<ItemGroup>
  <!-- No longer needed — content is built by the builder project -->
  <MonoGameContentReference Include="Content/Content.mgcb" />
</ItemGroup>
```

```json
// REMOVE .config/dotnet-tools.json (or the MGCB entries in it)
{
  "tools": {
    "dotnet-mgcb": { ... },       // remove
    "dotnet-mgcb-editor": { ... } // remove
  }
}
```

---

## 2. The Breaking Change: Deprecated BuildContent Path

In MonoGame 3.8.5-preview.2, the internal method that the old `ContentImporter`/`ContentProcessor` system used to dispatch builds was marked `[Obsolete]` and now throws `NotSupportedException`.

### What Breaks

If your custom importer or processor worked in 3.8.4 and you upgrade to 3.8.5, you may see:

```
System.NotSupportedException: This method is obsolete and no longer supported.
   at Microsoft.Xna.Framework.Content.Pipeline.ContentBuildLogger.LogMessage(...)
   at MyGame.Pipeline.CustomImporter.Import(String filename, ContentImporterContext context)
```

This happens because the Content Builder Project uses a different code path to invoke importers and processors. The old `ContentImporterContext` and `ContentProcessorContext` implementations are replaced with new versions that route through the Builder's pipeline.

### Why It Broke

The MGCB tool created its own implementation of `ContentImporterContext` that called into internal methods. Those internal methods are gone in 3.8.5. The new Builder provides its own context implementations, but they have slightly different behavior around logging, dependency tracking, and intermediate file paths.

---

## 3. Migration Strategy Overview

```
Step 1: Create a Content Builder Project (see G79)
Step 2: Move custom importer/processor source into a shared library
Step 3: Reference that library from the Builder project
Step 4: Update context usage (logging, dependency tracking)
Step 5: Register custom extensions in Builder.cs
Step 6: Test with `dotnet run` on the Builder project
```

---

## 4. Porting a Custom Importer

### Before (3.8.4 — MGCB Referenced DLL)

```csharp
using Microsoft.Xna.Framework.Content.Pipeline;

[ContentImporter(".tmx", DisplayName = "Tiled Map Importer", DefaultProcessor = "TiledMapProcessor")]
public class TiledMapImporter : ContentImporter<TiledMapContent>
{
    public override TiledMapContent Import(string filename, ContentImporterContext context)
    {
        // context.Logger worked with the old MGCB logger implementation
        context.Logger.LogMessage($"Importing {filename}");

        var xml = File.ReadAllText(filename);
        var map = TiledMapContent.Parse(xml);

        // AddDependency told MGCB to rebuild when tileset files changed
        foreach (var tileset in map.Tilesets)
            context.AddDependency(Path.Combine(Path.GetDirectoryName(filename)!, tileset.Source));

        return map;
    }
}
```

### After (3.8.5 — Content Builder Project Reference)

The importer code itself is largely the same — the `ContentImporter<T>` base class and attributes still exist. The key changes are:

```csharp
using Microsoft.Xna.Framework.Content.Pipeline;

[ContentImporter(".tmx", DisplayName = "Tiled Map Importer", DefaultProcessor = "TiledMapProcessor")]
public class TiledMapImporter : ContentImporter<TiledMapContent>
{
    public override TiledMapContent Import(string filename, ContentImporterContext context)
    {
        // In 3.8.5, context.Logger may be null or a different implementation.
        // Guard your logging calls.
        context.Logger?.LogMessage($"Importing {filename}");

        var xml = File.ReadAllText(filename);
        var map = TiledMapContent.Parse(xml);

        // AddDependency still works but the rebuild tracking mechanism
        // is now handled by the Builder project's file watcher.
        foreach (var tileset in map.Tilesets)
        {
            var depPath = Path.Combine(Path.GetDirectoryName(filename)!, tileset.Source);
            if (File.Exists(depPath))
                context.AddDependency(depPath);
        }

        return map;
    }
}
```

### Changes to Watch For

| Aspect | 3.8.4 Behavior | 3.8.5 Behavior |
|--------|----------------|----------------|
| `context.Logger` | Always non-null | May be null — guard with `?.` |
| `context.IntermediateDirectory` | Set by MGCB tool | Set by Builder — check your paths |
| `context.OutputDirectory` | Set by MGCB tool | Set by Builder configuration |
| `AddDependency()` | Triggers MGCB incremental rebuild | Tracked by Builder — same API, different implementation |

---

## 5. Porting a Custom Processor

Processors follow the same pattern — the base class is unchanged, but context behavior differs.

```csharp
using Microsoft.Xna.Framework.Content.Pipeline;
using Microsoft.Xna.Framework.Content.Pipeline.Graphics;

[ContentProcessor(DisplayName = "Tiled Map Processor")]
public class TiledMapProcessor : ContentProcessor<TiledMapContent, TiledMapProcessedContent>
{
    // Processor parameters still work — they're set in the Builder configuration.
    [ContentProcessorParameter(DisplayName = "Tile Scale")]
    public float TileScale { get; set; } = 1.0f;

    public override TiledMapProcessedContent Process(
        TiledMapContent input, ContentProcessorContext context)
    {
        var processed = new TiledMapProcessedContent();

        // Build external references (tileset textures).
        // In 3.8.5, BuildAndLoadAsset still works but uses the Builder's
        // pipeline internally rather than MGCB's.
        foreach (var tileset in input.Tilesets)
        {
            if (!string.IsNullOrEmpty(tileset.ImageSource))
            {
                var textureRef = context.BuildAndLoadAsset<TextureContent, TextureContent>(
                    new ExternalReference<TextureContent>(tileset.ImageSource),
                    "TextureProcessor");
                processed.TilesetTextures.Add(textureRef);
            }
        }

        processed.TileScale = TileScale;
        processed.MapData = input;
        return processed;
    }
}
```

---

## 6. Registering Custom Pipeline Extensions in the Builder

In the old MGCB system, you listed reference DLLs in the `.mgcb` file. In the new Builder, you add project references and register extensions in code.

### Builder Project Structure

```
ContentBuilder/
├── ContentBuilder.csproj
├── Program.cs              # Entry point — runs the build
└── Builder.cs              # Your customization point
```

### ContentBuilder.csproj

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
  </PropertyGroup>

  <ItemGroup>
    <!-- MonoGame content pipeline SDK -->
    <PackageReference Include="MonoGame.Framework.Content.Pipeline" Version="3.8.5.*" />
  </ItemGroup>

  <ItemGroup>
    <!-- Reference your custom pipeline extension project -->
    <ProjectReference Include="../MyGame.Pipeline/MyGame.Pipeline.csproj" />
  </ItemGroup>
</Project>
```

### Builder.cs — Registering Custom Extensions

```csharp
using Microsoft.Xna.Framework.Content.Pipeline;
using MonoGame.Framework.Content.Pipeline.Builder;

public class Builder : ContentBuilder
{
    public Builder() : base()
    {
        // The Builder auto-discovers importers/processors from referenced assemblies
        // via [ContentImporter] and [ContentProcessor] attributes.
        //
        // If auto-discovery doesn't pick up your extensions (a known issue
        // in 3.8.5-preview.2), register them explicitly:
        RegisterImporter<TiledMapImporter>();
        RegisterProcessor<TiledMapProcessor>();
    }

    protected override void ConfigureBuild()
    {
        // Set source and output directories
        SourceDirectory = "../Content";
        OutputDirectory = "../MyGame/Content";

        // Add content items with custom importer/processor
        Add("Maps/town.tmx",
            importer: "Tiled Map Importer",
            processor: "Tiled Map Processor",
            processorParams: new Dictionary<string, string>
            {
                ["TileScale"] = "2.0"
            });

        // Standard content uses default importers
        Add("Textures/*.png");
        Add("Audio/*.ogg");
        Add("Fonts/*.spritefont");
    }
}
```

---

## 7. Common Migration Issues

### Issue: Custom importer not found at build time

```
Error: No importer found for file 'Maps/town.tmx'
```

**Cause:** The Builder's auto-discovery didn't scan your extension assembly.

**Fix:** Explicitly register the importer in `Builder.cs` (see Section 6) and ensure the project reference is correct in the `.csproj`.

### Issue: `IntermediateDirectory` path mismatch

```
System.IO.DirectoryNotFoundException: Could not find a part of the path '...\obj\Content\...'
```

**Cause:** Your importer/processor uses `context.IntermediateDirectory` to read/write temp files, but the Builder sets a different intermediate path than MGCB did.

**Fix:** Use `Path.Combine(context.IntermediateDirectory, ...)` instead of hardcoding paths. If you need a specific intermediate location, configure it in the Builder.

### Issue: MonoGame.Extended Tiled importer crashes

**Cause:** MonoGame.Extended 5.4 and earlier have not fully updated their pipeline extensions for the 3.8.5 Content Builder changes.

**Fix (temporary):** Process Tiled maps at runtime instead of build time:

```csharp
// Runtime loading — bypass the content pipeline entirely
using var stream = TitleContainer.OpenStream("Content/Maps/town.tmx");
var map = TiledMapLoader.LoadFromStream(stream);
```

See the [MonoGame.Extended 3.8.5 compatibility tracking issue](https://github.com/MonoGame-Extended/Monogame-Extended/issues/1089) for updates.

---

## 8. MonoGame.Extended Compatibility

As of April 2026, MonoGame.Extended 5.4.0 has known compatibility issues with the 3.8.5 Content Builder Project for:

| Extension | Status | Workaround |
|-----------|--------|------------|
| Tiled tilemap importer | ❌ Broken | Runtime loading via `TiledMapLoader` |
| Texture atlas processor | ⚠️ Partial | Works with explicit registration |
| Bitmap font importer | ✅ Works | Auto-discovered |
| Sprite animation processor | ⚠️ Partial | May need explicit registration |

**Recommendation:** If your project depends heavily on MonoGame.Extended pipeline extensions, stay on 3.8.4.1 until Extended releases a 3.8.5-compatible version. Track progress at [monogameextended.net/blog](https://www.monogameextended.net/blog/).

---

## 9. Testing Custom Pipeline Extensions

The Content Builder Project makes testing easier because your pipeline code is a normal C# project — no dotnet tool installation required.

```csharp
using Xunit;

public class TiledMapImporterTests
{
    [Fact]
    public void Import_ValidTmx_ReturnsMapContent()
    {
        var importer = new TiledMapImporter();
        // Use a mock context or the Builder's test context
        var context = new TestImporterContext();

        var result = importer.Import("TestData/simple_map.tmx", context);

        Assert.NotNull(result);
        Assert.Equal(10, result.Width);
        Assert.Equal(10, result.Height);
    }

    [Fact]
    public void Import_TracksDependencies()
    {
        var importer = new TiledMapImporter();
        var context = new TestImporterContext();

        importer.Import("TestData/map_with_tileset.tmx", context);

        Assert.Contains("TestData/tileset.tsx", context.Dependencies);
    }
}

/// <summary>
/// Minimal test implementation of ContentImporterContext.
/// Captures dependencies and log messages for assertions.
/// </summary>
public class TestImporterContext : ContentImporterContext
{
    public List<string> Dependencies { get; } = new();
    public List<string> LogMessages { get; } = new();

    public override string IntermediateDirectory => Path.GetTempPath();
    public override string OutputDirectory => Path.GetTempPath();
    public override ContentBuildLogger Logger => new TestLogger(LogMessages);

    public override void AddDependency(string filename)
        => Dependencies.Add(filename);
}
```

---

## Summary

| Step | Action |
|------|--------|
| 1 | Create Content Builder Project (`dotnet new mgcb`) |
| 2 | Move custom importer/processor code to a shared library |
| 3 | Add `<ProjectReference>` from Builder to your pipeline library |
| 4 | Guard `context.Logger` with null checks |
| 5 | Register extensions explicitly in `Builder.cs` if auto-discovery fails |
| 6 | Remove `MonoGame.Content.Builder.Task` and `.mgcb` references from game `.csproj` |
| 7 | Test with `dotnet run --project ContentBuilder` |
| 8 | For MonoGame.Extended: check compatibility table, use runtime loading as fallback |
