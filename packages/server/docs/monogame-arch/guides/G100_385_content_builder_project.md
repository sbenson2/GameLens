# G100 — MonoGame 3.8.5 Content Builder Project

> **Category:** guide · **Engine:** MonoGame · **Related:** [G8 Content Pipeline](./G8_content_pipeline.md) · [G72 Content Builder Migration](./G72_content_builder_migration.md) · [G79 Content Builder Project](./G79_content_builder_project.md) · [G82 3.8.5 Starter Kit & New APIs](./G82_385_starterkit_new_apis.md) · [G91 3.8.5 Migration Guide](./G91_385_migration_guide.md)

How to set up and migrate to the new **Content Builder Project** system introduced in MonoGame 3.8.5. This replaces the MGCB Editor and `dotnet-mgcb` tool with a standard C# console application, giving you full programmatic control over asset compilation.

---

## Why the Change?

The MGCB Editor was a separate dotnet tool that stored build rules in `.mgcb` text files. This caused persistent issues: tool version mismatches, restore failures in CI, platform-specific editor bugs, and no programmatic control over build rules.

The Content Builder Project replaces all of this with a plain C# console application. Your build rules are C# code — debuggable, version-controlled, and composable with the rest of your toolchain.

```
Before (3.8.2):                    After (3.8.5):
┌──────────────────┐               ┌──────────────────┐
│ .mgcb file       │               │ Builder.cs        │
│ (custom format)  │               │ (standard C#)     │
├──────────────────┤               ├──────────────────┤
│ dotnet-mgcb tool │               │ Console app       │
│ (global/local)   │               │ (your project)    │
├──────────────────┤               ├──────────────────┤
│ MGCB Editor GUI  │               │ No GUI needed     │
│ (platform bugs)  │               │ (code = config)   │
└──────────────────┘               └──────────────────┘
```

---

## Creating a Content Builder Project

### From Template

```bash
dotnet new mgcb -o MyContentBuilder
# Optionally add to your solution
dotnet sln MySolution.sln add ./MyContentBuilder/MyContentBuilder.csproj
```

### Project Structure

```
MyContentBuilder/
├── Builder/
│   └── Builder.cs              # Build rules — the main entry point
├── Assets/
│   └── (your content files)    # Textures, audio, fonts, etc.
└── MyContentBuilder.csproj     # References MonoGame content pipeline
```

---

## Builder.cs: The Entry Point

The `Builder.cs` file defines which assets to build and how. It extends `ContentBuilder` and returns a `ContentCollection` describing your build rules.

### Minimal Example

```csharp
using Microsoft.Xna.Framework.Content.Pipeline;
using MonoGame.Framework.Content.Pipeline.Builder;

var builder = new Builder();
builder.Run(args);
return builder.FailedToBuild > 0 ? -1 : 0;

public class Builder : ContentBuilder
{
    public override IContentCollection GetContentCollection()
    {
        var content = new ContentCollection();

        // Build everything with default importers/processors
        content.Include<WildcardRule>("*");

        return content;
    }
}
```

The `Include<WildcardRule>("*")` rule tells the builder to compile all files in the Assets directory, auto-detecting importers and processors by file extension (`.png` → `TextureImporter`, `.spritefont` → `FontDescriptionImporter`, etc.).

### Custom Importer/Processor Configuration

Override defaults for specific assets or patterns:

```csharp
public override IContentCollection GetContentCollection()
{
    var content = new ContentCollection();

    // Textures — custom processor settings
    var textureImporter = new TextureImporter();
    var textureProcessor = new TextureProcessor
    {
        ColorKeyColor = Color.Magenta,
        GenerateMipmaps = true,
        PremultiplyAlpha = true
    };
    content.Include<WildcardRule>("*.png",
        contentImporter: textureImporter,
        contentProcessor: textureProcessor);

    // Fonts — specific processor config
    var fontProcessor = new FontDescriptionProcessor
    {
        PremultiplyAlpha = true,
        TextureFormat = TextureProcessorOutputFormat.Color
    };
    content.Include<WildcardRule>("*.spritefont",
        contentProcessor: fontProcessor);

    // Audio — default handling
    content.Include<WildcardRule>("*.wav");
    content.Include<WildcardRule>("*.ogg");

    // Effects — default handling
    content.Include<WildcardRule>("*.fx");

    return content;
}
```

**Design principle:** Focus on building *patterns* for your content (by extension or directory convention) rather than listing individual files. This way, adding a new `.png` to `Assets/` doesn't require touching `Builder.cs`.

### Explicit Per-File Rules

For assets that need unique settings:

```csharp
// One specific texture with different settings
var uiImporter = new TextureImporter();
var uiProcessor = new TextureProcessor
{
    GenerateMipmaps = false,      // UI doesn't need mipmaps
    PremultiplyAlpha = false,     // Keep straight alpha for UI
    TextureFormat = TextureProcessorOutputFormat.Color
};
content.Include("ui/hud_atlas.png",
    contentImporter: uiImporter,
    contentProcessor: uiProcessor);
```

---

## Integrating with Your Game Project

### Step 1: Clean Up Legacy References

Remove from your game's `.csproj`:

```xml
<!-- DELETE these if present -->
<MonoGameContentReference Include="..\Content\Content.mgcb" />
<PackageReference Include="MonoGame.Content.Builder.Task" />
```

Delete the `.config/dotnet-tools.json` file if it only contained the MGCB tool reference. Delete any `.mgcb` files (your rules now live in `Builder.cs`).

### Step 2: Add the Build Target

Insert this before the closing `</Project>` tag in your game's `.csproj`:

```xml
<Target Name="BuildContent" BeforeTargets="Build">
    <PropertyGroup>
        <ContentOutput>$(ProjectDir)$(OutputPath)</ContentOutput>
        <ContentTemp>$(ProjectDir)$(IntermediateOutputPath)</ContentTemp>
        <ContentArgs>build -p $(MonoGamePlatform) -s Assets -o $(ContentOutput) -i $(ContentTemp)</ContentArgs>
    </PropertyGroup>
    <MSBuild Projects="..\MyContentBuilder\MyContentBuilder.csproj"
             Targets="Build;Run"
             Properties="RunArguments=$(ContentArgs);" />
</Target>
```

**Parameters explained:**

| Flag | Purpose |
|------|---------|
| `-p $(MonoGamePlatform)` | Target platform (DesktopGL, WindowsDX, Android, iOS) |
| `-s Assets` | Source directory containing raw assets |
| `-o $(ContentOutput)` | Where compiled `.xnb` files go |
| `-i $(ContentTemp)` | Intermediate/cache directory for incremental builds |

Adjust the `Projects` path to match your Content Builder project's location relative to the game project.

### Step 3: Platform-Specific Output (Mobile)

**Android** — add compiled content as Android assets:

```xml
<ItemGroup>
    <AndroidAsset Include="$(OutputPath)Content\**\*">
        <Link>Content\%(RecursiveDir)%(Filename)%(Extension)</Link>
    </AndroidAsset>
</ItemGroup>
```

**iOS** — add compiled content as bundle resources:

```xml
<ItemGroup>
    <BundleResource Include="$(OutputPath)Content\**\*">
        <Link>Content\%(RecursiveDir)%(Filename)%(Extension)</Link>
    </BundleResource>
</ItemGroup>
```

---

## Migration from MGCB Editor

### Translation Table: .mgcb → Builder.cs

| MGCB File Directive | Builder.cs Equivalent |
|---------------------|----------------------|
| `/importer:TextureImporter` | `new TextureImporter()` passed to `Include()` |
| `/processor:TextureProcessor` | `new TextureProcessor { ... }` passed to `Include()` |
| `/processorParam:GenerateMipmaps=true` | Property on processor instance: `GenerateMipmaps = true` |
| `/build:textures/player.png` | `content.Include("textures/player.png", ...)` |
| `/copy:data/config.json` | Copy as a build step or use `File.Copy` in Builder |

### Migration Steps

1. **Create the Content Builder project** from template.
2. **Copy your asset files** into the new `Assets/` directory (or point `-s` at the existing content folder).
3. **Translate `.mgcb` rules** into `Builder.cs` using the table above. Group by pattern where possible.
4. **Update game `.csproj`** — remove MGCB references, add the new build target.
5. **Uninstall the MGCB tool:** `dotnet tool uninstall dotnet-mgcb` (local) or add `--global` for global installs.
6. **Build and test** — verify all content compiles and loads at runtime.

---

## ContentBuilderParams (Advanced)

For scripted or CI builds, configure the builder programmatically:

```csharp
var contentParams = new ContentBuilderParams()
{
    Mode = ContentBuilderMode.Builder,
    WorkingDirectory = $"{AppContext.BaseDirectory}../../../",
    SourceDirectory = "Assets",
    OutputDirectory = "bin/DesktopGL/Content",
    Platform = TargetPlatform.DesktopGL,
    GraphicsProfile = GraphicsProfile.HiDef,
    CompressContent = false,
    LogLevel = LogLevel.Info
};
```

Or parse from the command line: `ContentBuilderParams.Parse(args)`.

---

## Known Issues (3.8.5-preview.2)

As of preview 2, be aware of these issues:

- **Custom ContentImporter/ContentProcessor:** The builder may call a deprecated internal method instead of using your passed-in instances, throwing `NotSupportedException`. Workaround: check [GitHub Discussion #9155](https://github.com/MonoGame/MonoGame/discussions/9155) for the latest status and patches.
- **MonoGame.Extended compatibility:** Some Extended content types may need updates to work with the new pipeline. Track progress at the MonoGame.Extended repository.

These are preview-era issues and are expected to be resolved before the final 3.8.5 release.

---

## CI/CD Integration

The Content Builder Project simplifies CI because there is no external tool to restore:

```yaml
# GitHub Actions / GitLab CI example
- name: Build Content
  run: |
    dotnet build MyContentBuilder/MyContentBuilder.csproj
    dotnet run --project MyContentBuilder/MyContentBuilder.csproj -- \
      build -p DesktopGL -s Assets -o output/Content -i temp/Content

- name: Build Game
  run: dotnet build MyGame/MyGame.csproj -c Release
```

No `dotnet tool restore`, no tool version pinning, no `.config` directory management.

---

## Further Reading

- [MonoGame Content Builder Project Docs](https://docs.monogame.net/articles/getting_started/content_pipeline/content_builder_project.html)
- [MonoGame 3.8.5 Preview Announcement](https://monogame.net/blog/2025-12-19-385-preview/)
- [MonoGame 3.8.x Migration Guide](https://docs.monogame.net/articles/migration/migrate_38.html)
- [G8 Content Pipeline](./G8_content_pipeline.md) — content pipeline fundamentals
- [G72 Content Builder Migration](./G72_content_builder_migration.md) — earlier migration patterns
- [G80 CI/CD Automated Builds](./G80_ci_cd_automated_builds.md) — automated build pipelines
