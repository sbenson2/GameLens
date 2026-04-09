# G79 — Content Builder Project System (MonoGame 3.8.5+)

> **Category:** guide · **Engine:** MonoGame · **Related:** [G08 Content Pipeline](./G08_content_pipeline.md) · [G72 Content Builder Migration](./G72_content_builder_migration.md) · [G26 Resource Loading & Caching](./G26_resource_loading_caching.md)

How to use MonoGame's new Content Builder Project system introduced in 3.8.5. This replaces the MGCB Editor and the `MonoGame.Content.Builder.Task` MSBuild integration with a simpler, more controllable console application approach for building game assets.

---

## What Changed and Why

MonoGame 3.8.5 introduces the **Content Builder Project** — a new way to build game content (textures, audio, fonts, effects, etc.) that replaces the previous MGCB Editor workflow.

### The Old Way (MGCB Editor + Builder Task)

In MonoGame 3.8.0–3.8.4, content was built using:

1. **MGCB Editor** — a separate dotnet tool (`dotnet tool install -g dotnet-mgcb-editor`) that provided a GUI for managing `.mgcb` content files.
2. **MonoGame.Content.Builder.Task** — an MSBuild task that automatically ran content builds as part of `dotnet build`.

This approach had well-known pain points:
- The MGCB Editor was a separate dotnet tool that frequently had installation and version compatibility issues.
- The MSBuild task was opaque — when content builds failed, the error messages were often unhelpful.
- The `.mgcb` file format was custom and not easy to version control or script against.

### The New Way (Content Builder Project)

The Content Builder Project is a standard C# console application that you control. It:

- Uses a simple `dotnet new` template to scaffold.
- Builds content by running as a console app — no special MSBuild integration needed.
- Gives you full control over the build process through a `Builder` class you can customize.
- Works with any IDE and any CI system without tool installation.

---

## Creating a Content Builder Project

### Scaffold the Project

```bash
# From your solution directory (next to your game project)
dotnet new mgcb -o ContentBuilder
```

This creates:

```
ContentBuilder/
├── ContentBuilder.csproj       # Console app project
├── Builder.cs                  # Your custom builder class
└── Assets/                     # Place your raw assets here
    └── (empty — add your content)
```

### Add to Your Solution

```bash
dotnet sln add ContentBuilder/ContentBuilder.csproj
```

### Project Structure After Setup

```
MySolution/
├── MySolution.sln
├── MyGame/
│   ├── MyGame.csproj          # Your game project
│   └── Content/               # Built content output (generated)
└── ContentBuilder/
    ├── ContentBuilder.csproj
    ├── Builder.cs
    └── Assets/                # Raw source assets
        ├── Textures/
        ├── Audio/
        ├── Fonts/
        └── Effects/
```

---

## The Builder Class

The `Builder.cs` file is where you define what content gets built and how. Here's the default template:

```csharp
using Microsoft.Xna.Framework.Content.Pipeline;
using MonoGame.Framework.Content.Pipeline.Builder;

public class Builder : ContentBuilder
{
    public override void Build()
    {
        // Build all PNG files as textures
        Add("Assets/Textures/**/*.png",
            importer: "TextureImporter",
            processor: "TextureProcessor",
            processorParams: new { TextureFormat = "Color" });

        // Build all WAV files as sound effects
        Add("Assets/Audio/**/*.wav",
            importer: "WavImporter",
            processor: "SoundEffectProcessor");

        // Build SpriteFont description files
        Add("Assets/Fonts/**/*.spritefont",
            importer: "FontDescriptionImporter",
            processor: "FontDescriptionProcessor");

        // Build effect files
        Add("Assets/Effects/**/*.fx",
            importer: "EffectImporter",
            processor: "EffectProcessor");
    }
}
```

### Glob Patterns

The `Add` method supports glob patterns for batch processing:

| Pattern | Matches |
|---|---|
| `Assets/Textures/*.png` | PNG files in the Textures directory |
| `Assets/Textures/**/*.png` | PNG files in Textures and all subdirectories |
| `Assets/**/*.wav` | WAV files anywhere under Assets |

### Processor Parameters

Pass processor-specific parameters as an anonymous object:

```csharp
// Texture with mipmaps and DXT compression
Add("Assets/Textures/environment/**/*.png",
    importer: "TextureImporter",
    processor: "TextureProcessor",
    processorParams: new
    {
        TextureFormat = "DxtCompressed",
        GenerateMipmaps = true,
        PremultiplyAlpha = true,
    });

// Texture without compression (pixel art)
Add("Assets/Textures/sprites/**/*.png",
    importer: "TextureImporter",
    processor: "TextureProcessor",
    processorParams: new
    {
        TextureFormat = "Color",
        GenerateMipmaps = false,
        PremultiplyAlpha = true,
    });
```

---

## Building Content

Run the content builder as a console app:

```bash
# Build all content
dotnet run --project ContentBuilder

# Build for a specific platform
dotnet run --project ContentBuilder -- --platform DesktopGL

# Clean and rebuild
dotnet run --project ContentBuilder -- --clean --rebuild
```

The built `.xnb` files are output to a directory your game project references (typically `MyGame/Content/`).

### Configuring Output Directory

In `ContentBuilder.csproj`, set the output path:

```xml
<PropertyGroup>
  <ContentOutputDir>../MyGame/Content</ContentOutputDir>
</PropertyGroup>
```

Or pass it on the command line:

```bash
dotnet run --project ContentBuilder -- --output ../MyGame/Content
```

---

## Migrating from MGCB Editor

### Step 1: Remove Old References

In your game `.csproj`, remove:

```xml
<!-- REMOVE these lines -->
<PackageReference Include="MonoGame.Content.Builder.Task" Version="..." />
<MonoGameContentReference Include="Content/Content.mgcb" />
```

### Step 2: Create the Content Builder Project

```bash
dotnet new mgcb -o ContentBuilder
dotnet sln add ContentBuilder/ContentBuilder.csproj
```

### Step 3: Move Assets

Move your raw asset files from the old `Content/` directory to `ContentBuilder/Assets/`. The old `Content/` directory will become the output directory for built `.xnb` files.

### Step 4: Translate Your .mgcb File

Each `#begin` block in your old `.mgcb` file becomes an `Add` call in `Builder.cs`. For example:

```
# Old .mgcb entry:
#begin Textures/player.png
/importer:TextureImporter
/processor:TextureProcessor
/processorParam:TextureFormat=Color
/build:Textures/player.png
```

Becomes:

```csharp
// New Builder.cs entry:
Add("Assets/Textures/player.png",
    importer: "TextureImporter",
    processor: "TextureProcessor",
    processorParams: new { TextureFormat = "Color" });
```

For large projects, use glob patterns instead of listing individual files:

```csharp
// Instead of 100 individual Add() calls:
Add("Assets/Textures/**/*.png",
    importer: "TextureImporter",
    processor: "TextureProcessor",
    processorParams: new { TextureFormat = "Color" });
```

### Step 5: Uninstall the MGCB Editor Tool

```bash
dotnet tool uninstall -g dotnet-mgcb-editor
```

---

## Integrating with Your Build

### Option A: Manual Build Step

Build content before building your game:

```bash
dotnet run --project ContentBuilder
dotnet build MyGame
```

### Option B: MSBuild Target

Add a pre-build step to your game's `.csproj`:

```xml
<Target Name="BuildContent" BeforeTargets="Build">
  <Exec Command="dotnet run --project ../ContentBuilder -- --platform DesktopGL" />
</Target>
```

### Option C: CI Pipeline

In your CI configuration, add the content build as a separate step:

```yaml
steps:
  - name: Build Content
    run: dotnet run --project ContentBuilder -- --platform DesktopGL

  - name: Build Game
    run: dotnet build MyGame -c Release

  - name: Publish
    run: dotnet publish MyGame -c Release -r win-x64 --self-contained
```

---

## Advantages Over MGCB Editor

- **No tool installation** — the content builder is a project in your solution, not a global dotnet tool.
- **Full C# control** — conditional builds, platform-specific processing, custom importers are just C# code.
- **Better error messages** — you see standard console output with full stack traces.
- **IDE-agnostic** — works from the command line, any IDE, or CI. No dependency on a specific editor.
- **Glob patterns** — add entire directories of assets with one line instead of listing each file.
- **Version control friendly** — `Builder.cs` is a plain C# file that diffs cleanly, unlike binary `.mgcb` files.

---

## Common Importers and Processors

For reference, the standard importers and processors available:

| Asset Type | Importer | Processor |
|---|---|---|
| PNG/JPG/BMP textures | `TextureImporter` | `TextureProcessor` |
| WAV audio | `WavImporter` | `SoundEffectProcessor` |
| MP3 audio | `Mp3Importer` | `SoundEffectProcessor` or `SongProcessor` |
| OGG audio | `OggImporter` | `SoundEffectProcessor` |
| SpriteFont | `FontDescriptionImporter` | `FontDescriptionProcessor` |
| HLSL effects | `EffectImporter` | `EffectProcessor` |
| FBX/OBJ models | `FbxImporter` / `OpenAssetImporter` | `ModelProcessor` |
| TMX tilemaps | Use third-party importer | Custom processor |

---

## Availability

The Content Builder Project system requires **MonoGame 3.8.5-develop** or later. As of early 2026, this is available in preview packages. Install the template:

```bash
dotnet new install MonoGame.Templates.CSharp::3.8.5-develop-*
```

Once MonoGame 3.8.5 reaches stable release, the template will be included in the standard MonoGame template pack.

---
