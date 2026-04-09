# G108 — Custom Content Pipeline Extensions

> **Category:** guide · **Engine:** MonoGame · **Related:** [G8 Content Pipeline](./G8_content_pipeline.md) · [G100 Content Builder Project](./G100_385_content_builder_project.md) · [G72 Content Builder Migration](./G72_content_builder_migration.md) · [G81 NativeAOT Publishing](./G81_nativeaot_publishing.md) · [G99 Source Generators & AOT Serialization](./G99_source_generators_aot_serialization.md) · [G86 Async Content Loading](./G86_async_content_loading.md)

A deep-dive guide to building **custom content pipeline importers, processors, writers, and readers** in MonoGame. Covers the four-class architecture, project setup, multiple real-world examples (JSON data files, custom map formats, sprite-sheet metadata), debugging pipeline extensions, versioning, and compatibility with both the legacy MGCB Editor and the new Content Builder Project (3.8.5+).

---

## Architecture: The Four Pipeline Classes

Every custom content type requires up to four classes that form a pipeline from raw asset → built `.xnb` → runtime object:

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Importer    │────▶│  Processor   │────▶│  Writer      │────▶│  Reader      │
│              │     │              │     │              │     │              │
│ Raw file     │     │ Intermediate │     │ Binary .xnb  │     │ Runtime      │
│ → TImport    │     │ → TOutput    │     │ serialization│     │ deserialization│
│              │     │              │     │              │     │              │
│ Build-time   │     │ Build-time   │     │ Build-time   │     │ Game runtime │
└─────────────┘     └──────────────┘     └──────────────┘     └──────────────┘
```

| Class | Base Class | Runs At | Assembly |
|-------|-----------|---------|----------|
| **Importer** | `ContentImporter<T>` | Build | Pipeline extension DLL |
| **Processor** | `ContentProcessor<TInput, TOutput>` | Build | Pipeline extension DLL |
| **Writer** | `ContentTypeWriter<T>` | Build | Pipeline extension DLL |
| **Reader** | `ContentTypeReader<T>` | Runtime | Game project |

> **Key distinction:** The Importer, Processor, and Writer live in a separate **pipeline extension** class library that references `MonoGame.Framework.Content.Pipeline`. The Reader lives in your **game project** and references only `MonoGame.Framework`.

---

## Project Setup

### 1. Create the Pipeline Extension Library

Use the MonoGame Content Pipeline Extension template:

```bash
dotnet new mgpipeline -n MyGame.Content.Pipeline
```

Or create a standard class library and add the pipeline reference:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="MonoGame.Framework.Content.Pipeline"
                      Version="3.8.4.1" />
  </ItemGroup>
</Project>
```

### 2. Reference from MGCB

In your `.mgcb` file, add a reference to the compiled pipeline extension:

```
/reference:../../MyGame.Content.Pipeline/bin/Release/net8.0/MyGame.Content.Pipeline.dll
```

### 3. Reference from Content Builder Project (3.8.5+)

If using the new Content Builder `.csproj` approach, add a project reference:

```xml
<ItemGroup>
  <ProjectReference Include="..\MyGame.Content.Pipeline\MyGame.Content.Pipeline.csproj" />
</ItemGroup>
```

---

## Example 1: JSON Data Importer (Game Config / Level Data)

A common need: import `.json` files at build time, validate them, and output typed data.

### Intermediate Type (shared)

```csharp
// In a shared project or the pipeline extension
public class EnemyWaveData
{
    public string WaveName { get; set; } = "";
    public int SpawnCount { get; set; }
    public float SpawnInterval { get; set; }
    public string EnemyType { get; set; } = "";
    public float DifficultyMultiplier { get; set; } = 1.0f;
}

public class LevelData
{
    public string LevelName { get; set; } = "";
    public int Width { get; set; }
    public int Height { get; set; }
    public List<EnemyWaveData> Waves { get; set; } = new();
}
```

### Importer

```csharp
using System.Text.Json;
using Microsoft.Xna.Framework.Content.Pipeline;

[ContentImporter(".json", DisplayName = "Level Data Importer — JSON",
    DefaultProcessor = nameof(LevelDataProcessor))]
public class LevelDataImporter : ContentImporter<LevelData>
{
    public override LevelData Import(string filename, ContentImporterContext context)
    {
        // Register dependency so MGCB rebuilds when the file changes
        context.AddDependency(filename);

        string json = File.ReadAllText(filename);
        var data = JsonSerializer.Deserialize<LevelData>(json,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        if (data is null)
            throw new InvalidContentException($"Failed to parse {filename} as LevelData.");

        context.Logger.LogMessage($"Imported level '{data.LevelName}' with {data.Waves.Count} waves.");
        return data;
    }
}
```

### Processor

```csharp
using Microsoft.Xna.Framework.Content.Pipeline;

[ContentProcessor(DisplayName = "Level Data Processor")]
public class LevelDataProcessor : ContentProcessor<LevelData, LevelData>
{
    // Expose a parameter in the MGCB Editor UI
    [System.ComponentModel.DisplayName("Max Waves")]
    [System.ComponentModel.DefaultValue(100)]
    public int MaxWaves { get; set; } = 100;

    public override LevelData Process(LevelData input, ContentProcessorContext context)
    {
        // Validate
        if (string.IsNullOrWhiteSpace(input.LevelName))
            throw new InvalidContentException("LevelData.LevelName is required.");

        if (input.Waves.Count > MaxWaves)
        {
            context.Logger.LogWarning("", null,
                $"Level '{input.LevelName}' has {input.Waves.Count} waves, exceeding MaxWaves ({MaxWaves}). Truncating.");
            input.Waves = input.Waves.Take(MaxWaves).ToList();
        }

        // Transform: pre-calculate cumulative difficulty
        float cumulative = 0;
        foreach (var wave in input.Waves)
        {
            cumulative += wave.DifficultyMultiplier;
            wave.DifficultyMultiplier = cumulative;
        }

        return input;
    }
}
```

### Writer (Build-Time Serialization)

```csharp
using Microsoft.Xna.Framework.Content.Pipeline;
using Microsoft.Xna.Framework.Content.Pipeline.Serialization.Compiler;

[ContentTypeWriter]
public class LevelDataWriter : ContentTypeWriter<LevelData>
{
    protected override void Write(ContentWriter output, LevelData value)
    {
        output.Write(value.LevelName);
        output.Write(value.Width);
        output.Write(value.Height);
        output.Write(value.Waves.Count);
        foreach (var wave in value.Waves)
        {
            output.Write(wave.WaveName);
            output.Write(wave.SpawnCount);
            output.Write(wave.SpawnInterval);
            output.Write(wave.EnemyType);
            output.Write(wave.DifficultyMultiplier);
        }
    }

    /// <summary>
    /// Returns the assembly-qualified name of the runtime reader.
    /// This string is embedded in the .xnb header so ContentManager
    /// knows which reader to instantiate at load time.
    /// </summary>
    public override string GetRuntimeReader(TargetPlatform targetPlatform)
    {
        return typeof(LevelDataReader).AssemblyQualifiedName!;
    }

    public override string GetRuntimeType(TargetPlatform targetPlatform)
    {
        return typeof(LevelData).AssemblyQualifiedName!;
    }
}
```

### Reader (Runtime Deserialization — lives in game project)

```csharp
using Microsoft.Xna.Framework.Content;

public class LevelDataReader : ContentTypeReader<LevelData>
{
    protected override LevelData Read(ContentReader input, LevelData existingInstance)
    {
        var data = existingInstance ?? new LevelData();
        data.LevelName = input.ReadString();
        data.Width     = input.ReadInt32();
        data.Height    = input.ReadInt32();

        int waveCount = input.ReadInt32();
        data.Waves = new List<EnemyWaveData>(waveCount);
        for (int i = 0; i < waveCount; i++)
        {
            data.Waves.Add(new EnemyWaveData
            {
                WaveName            = input.ReadString(),
                SpawnCount          = input.ReadInt32(),
                SpawnInterval       = input.ReadSingle(),
                EnemyType           = input.ReadString(),
                DifficultyMultiplier = input.ReadSingle(),
            });
        }
        return data;
    }
}
```

### Loading at Runtime

```csharp
var level = Content.Load<LevelData>("Levels/wave_01");
```

---

## Example 2: Custom Sprite Sheet Metadata

Import a sprite-sheet descriptor (e.g., from an artist's tool) that lists frame names, origins, and hitboxes alongside a PNG atlas.

### Importer — Multiple File Dependencies

```csharp
[ContentImporter(".spritesheet", DisplayName = "Sprite Sheet Meta Importer",
    DefaultProcessor = nameof(SpriteSheetProcessor))]
public class SpriteSheetImporter : ContentImporter<SpriteSheetRaw>
{
    public override SpriteSheetRaw Import(string filename, ContentImporterContext context)
    {
        context.AddDependency(filename);

        var meta = JsonSerializer.Deserialize<SpriteSheetRaw>(
            File.ReadAllText(filename));

        // The .spritesheet file references a .png — register it as a dependency
        // so the pipeline rebuilds if the texture changes
        string dir = Path.GetDirectoryName(filename)!;
        string texturePath = Path.Combine(dir, meta!.TextureFile);
        context.AddDependency(texturePath);

        meta.TextureFullPath = texturePath;
        return meta;
    }
}
```

### Processor — Building External References

When your content type references another asset (like a `Texture2D`), use `ExternalReference<T>` to let the pipeline build it:

```csharp
[ContentProcessor(DisplayName = "Sprite Sheet Processor")]
public class SpriteSheetProcessor : ContentProcessor<SpriteSheetRaw, SpriteSheetContent>
{
    public override SpriteSheetContent Process(SpriteSheetRaw input,
        ContentProcessorContext context)
    {
        // Build the referenced texture through the standard pipeline
        ExternalReference<TextureContent> textureRef =
            new ExternalReference<TextureContent>(input.TextureFullPath);

        // This triggers the standard texture importer + processor
        ExternalReference<TextureContent> builtTexture =
            context.BuildAsset<TextureContent, TextureContent>(
                textureRef, "TextureProcessor");

        return new SpriteSheetContent
        {
            Texture = builtTexture,
            Frames  = input.Frames,
        };
    }
}
```

---

## Processor Parameters

Expose configurable parameters in the MGCB Editor / Content Builder UI using standard .NET attributes:

```csharp
[ContentProcessor(DisplayName = "Enhanced Texture Processor")]
public class EnhancedTextureProcessor : ContentProcessor<TextureContent, TextureContent>
{
    [System.ComponentModel.DisplayName("Generate Mipmaps")]
    [System.ComponentModel.DefaultValue(true)]
    public bool GenerateMipmaps { get; set; } = true;

    [System.ComponentModel.DisplayName("Max Texture Size")]
    [System.ComponentModel.DefaultValue(2048)]
    public int MaxSize { get; set; } = 2048;

    [System.ComponentModel.DisplayName("Compression Format")]
    [System.ComponentModel.DefaultValue(TextureProcessorOutputFormat.Color)]
    public TextureProcessorOutputFormat Format { get; set; }
        = TextureProcessorOutputFormat.Color;

    public override TextureContent Process(TextureContent input,
        ContentProcessorContext context)
    {
        // Resize if oversized
        // Generate mipmaps if requested
        // Compress to target format
        return input;
    }
}
```

These parameters appear as editable fields in the MGCB Editor when you select an asset that uses this processor.

---

## Extending Built-In Processors

Instead of writing from scratch, extend an existing processor to add a step:

```csharp
[ContentProcessor(DisplayName = "Font Processor with Outline")]
public class OutlineFontProcessor : FontDescriptionProcessor
{
    [System.ComponentModel.DisplayName("Outline Thickness")]
    [System.ComponentModel.DefaultValue(2)]
    public int OutlineThickness { get; set; } = 2;

    public override SpriteFontContent Process(FontDescription input,
        ContentProcessorContext context)
    {
        // Pre-process: modify the font description
        input.Style = FontDescriptionStyle.Bold;

        // Delegate to the built-in processor
        var result = base.Process(input, context);

        // Post-process: could modify the generated texture here
        context.Logger.LogMessage(
            $"Processed font '{input.FontName}' with {OutlineThickness}px outline.");
        return result;
    }
}
```

---

## Debugging Pipeline Extensions

Pipeline extensions run inside the MGCB build process, not your game. Debugging requires a different approach.

### Method 1: Attach to MSBuild (Recommended)

1. Set a breakpoint in your importer/processor code.
2. In Visual Studio, go to **Debug → Attach to Process**.
3. Build your content (run `dotnet build` on the content project).
4. Attach to the `dotnet` process running the content build.

### Method 2: Debugger.Launch()

Add a temporary `Debugger.Launch()` call in your importer:

```csharp
public override LevelData Import(string filename, ContentImporterContext context)
{
#if DEBUG
    if (!System.Diagnostics.Debugger.IsAttached)
        System.Diagnostics.Debugger.Launch();
#endif
    // ... rest of import code
}
```

### Method 3: Logging

Use the context's logger for non-interactive debugging:

```csharp
context.Logger.LogMessage("Debug: Parsed {0} entries", count);      // Info
context.Logger.LogWarning("", null, "Suspicious value: {0}", val);  // Warning
context.Logger.LogImportantMessage("Processing complete.");          // Bold in output
```

Log output appears in the MGCB Editor's build output panel and in the `dotnet build` console output.

---

## Versioning and Rebuild Triggers

The pipeline caches built `.xnb` files and only rebuilds when inputs change. For custom extensions, "change" is detected by:

1. **Source file modification time** — any change to the raw asset triggers a rebuild.
2. **Dependencies** — files registered via `context.AddDependency()`.
3. **Pipeline extension DLL version** — if the extension assembly version changes, all assets using that importer/processor rebuild.

To force a rebuild when you change your processor logic:

```xml
<!-- In your pipeline extension .csproj -->
<PropertyGroup>
  <Version>1.2.0</Version>  <!-- Bump this when changing processor behavior -->
</PropertyGroup>
```

---

## AOT / Trimming Considerations

If your game targets NativeAOT (see [G81](./G81_nativeaot_publishing.md)):

- The **Reader** runs at game runtime and must be AOT-safe. Avoid reflection in your `ContentTypeReader<T>`.
- The **Importer, Processor, and Writer** run at build time only — they can use reflection freely.
- If your runtime types use `System.Text.Json` for any purpose, use source-generated serialization contexts (see [G99](./G99_source_generators_aot_serialization.md)).
- Mark your reader types with `[DynamicallyAccessedMembers]` if the trimmer removes them:

```csharp
[DynamicallyAccessedMembers(DynamicallyAccessedMemberTypes.PublicConstructors)]
public class LevelDataReader : ContentTypeReader<LevelData> { ... }
```

---

## Content Builder Project Compatibility (3.8.5+)

The new Content Builder Project (see [G100](./G100_385_content_builder_project.md)) replaces the `.mgcb` file with a `.csproj`-based content build. Custom pipeline extensions work with both systems, but note:

- **MGCB Editor:** Reference the DLL via `/reference:path.dll` in the `.mgcb` file.
- **Content Builder Project:** Use a `<ProjectReference>` in the content `.csproj`.
- **Both:** The four-class pattern (Importer → Processor → Writer → Reader) is identical.
- **Known issue (3.8.5-preview):** External references (`context.BuildAsset`) may behave differently with the new content builder when importing assets that reference other assets (e.g., tilemaps referencing tilesets). Test thoroughly.

---

## Common Pitfalls

1. **Writer/Reader field order mismatch** — `Write` and `Read` must call fields in the **exact same order**. A mismatch produces corrupt data or runtime crashes with unhelpful error messages.
2. **Forgetting `GetRuntimeReader`** — The Writer must return the correct assembly-qualified name of the Reader. If wrong, `ContentManager.Load<T>()` throws at runtime.
3. **Missing `[ContentImporter]` attribute** — Without the attribute, the MGCB tool won't discover your importer.
4. **File extension conflicts** — If two importers claim the same extension (e.g., `.json`), the pipeline uses the last registered one. Use specific extensions (`.leveldata`, `.spritesheet`) to avoid conflicts.
5. **Reader not in game assembly** — The Reader class must be in an assembly loaded at runtime. If it's in the pipeline extension DLL (which isn't deployed with the game), loading fails.

---

## Further Reading

- [G8 Content Pipeline](./G8_content_pipeline.md) — MGCB basics and built-in asset types
- [G100 Content Builder Project](./G100_385_content_builder_project.md) — New .csproj-based content building
- [G72 Content Builder Migration](./G72_content_builder_migration.md) — Migrating from MGCB to Content Builder
- [G81 NativeAOT Publishing](./G81_nativeaot_publishing.md) — AOT-safe content loading
- [G99 Source Generators & AOT Serialization](./G99_source_generators_aot_serialization.md) — Reflection-free serialization
- [MonoGame Docs — Custom Content Types](https://docs.monogame.net/articles/getting_to_know/whatis/content_pipeline/CP_Content_Advanced.html)
- [MonoGame Docs — Tips for Developing Custom Importers](https://docs.monogame.net/articles/getting_to_know/whatis/content_pipeline/CP_Tips_For_Developing.html)
