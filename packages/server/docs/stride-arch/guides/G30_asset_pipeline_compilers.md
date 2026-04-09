# G30 — Asset Pipeline and Custom Compilers

> **Category:** Guide · **Engine:** Stride · **Related:** [G10 Custom Assets](./G10_custom_assets_pipeline.md) · [G27 Game Studio Editor](./G27_game_studio_editor_workflow.md) · [Stride Architecture Rules](../stride-arch-rules.md)

A deep-dive into Stride's asset build pipeline: how source assets flow through importers, compilers, and the dependency graph to produce runtime-optimized bundles. Covers built-in asset types, the IAssetImporter and IAssetCompiler interfaces, incremental compilation, thumbnail compilers, and how to build a fully custom asset type from scratch.

---

## Table of Contents

1. [Pipeline Overview](#1--pipeline-overview)
2. [Asset Lifecycle](#2--asset-lifecycle)
3. [Built-In Asset Types](#3--built-in-asset-types)
4. [Importers — IAssetImporter](#4--importers--iassetimporter)
5. [Compilers — IAssetCompiler](#5--compilers--iassetcompiler)
6. [Thumbnail Compilers](#6--thumbnail-compilers)
7. [Incremental Compilation and Dependencies](#7--incremental-compilation-and-dependencies)
8. [Building a Custom Asset Type (Worked Example)](#8--building-a-custom-asset-type-worked-example)
9. [Asset Compilation Context and Parameters](#9--asset-compilation-context-and-parameters)
10. [Debugging the Asset Pipeline](#10--debugging-the-asset-pipeline)
11. [Performance Tips](#11--performance-tips)
12. [Common Pitfalls](#12--common-pitfalls)

---

## 1 — Pipeline Overview

Stride's asset pipeline transforms source files (textures, models, audio, scripts, custom data) into optimized runtime formats during the build process. The pipeline runs inside Game Studio and during command-line builds.

```
Source Files (.png, .fbx, .wav, .json, ...)
       │
       ▼
  ┌─────────────┐
  │  Importers   │  Convert source files → Asset descriptors
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │  Compilers   │  Transform Asset descriptors → Runtime data
  └──────┬──────┘
         ▼
  ┌─────────────┐
  │  Build Cache │  Dependency graph + incremental rebuild
  └──────┬──────┘
         ▼
   Runtime Bundles (.bundle files in bin/)
```

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Asset** | A C# class deriving from `Asset` — the design-time representation (metadata, settings, references). |
| **Importer** | Reads a source file and produces one or more Asset instances. |
| **Compiler** | Takes an Asset and produces `BuildStep` commands that write runtime data. |
| **AssetItem** | A wrapper around an Asset with its URL, source path, and package context. |
| **BuildStep** | A unit of work in the build graph (compile a texture, convert a model). |
| **Bundle** | The output file that the game loads at runtime. |

---

## 2 — Asset Lifecycle

```
1. Import    — Source file → Asset object (stored as .sd* YAML)
2. Edit      — Modify asset properties in Game Studio
3. Compile   — Asset → BuildSteps → Runtime data
4. Package   — Runtime data → Bundles
5. Load      — Game loads bundles via ContentManager
```

### Design-Time vs Runtime

Assets exist in two forms:

- **Design-time (`.sdmat`, `.sdtex`, `.sdscene`, ...):** YAML files with metadata, settings, and references. These are what you edit in Game Studio.
- **Runtime (bundles):** Optimized binary data loaded by `ContentManager.Load<T>()`.

The compiler bridges the two. You never load `.sdtex` files at runtime — you load the compiled texture.

---

## 3 — Built-In Asset Types

| Asset Type | Source Formats | Compiler | Runtime Type |
|-----------|---------------|----------|-------------|
| Texture | .png, .jpg, .tga, .dds, .hdr | TextureAssetCompiler | Texture |
| Model | .fbx, .dae, .obj, .gltf, .glb | ModelAssetCompiler | Model |
| Animation | .fbx, .dae | AnimationAssetCompiler | AnimationClip |
| Audio (Sound) | .wav, .mp3, .ogg | SoundAssetCompiler | Sound |
| Material | Created in editor | MaterialAssetCompiler | Material |
| Scene | Created in editor | SceneAssetCompiler | Scene |
| Prefab | Created in editor | PrefabAssetCompiler | Prefab |
| SpriteSheet | .png + editor config | SpriteSheetAssetCompiler | SpriteSheet |
| Font | .ttf, .otf | SpriteFontAssetCompiler | SpriteFont |
| Video | .mp4 | VideoAssetCompiler | Video |

Each type has both a game compiler and a thumbnail compiler.

---

## 4 — Importers — IAssetImporter

An importer reads raw source files and creates Asset objects. The interface:

```csharp
// Simplified — see Stride.Core.Assets.IAssetImporter for full signature
public interface IAssetImporter
{
    /// <summary>Unique identifier for this importer.</summary>
    Guid Id { get; }

    /// <summary>Display name shown in the editor.</summary>
    string Name { get; }

    /// <summary>Description of what this importer handles.</summary>
    string Description { get; }

    /// <summary>
    /// File extensions this importer can handle (e.g., ".json", ".csv").
    /// </summary>
    string[] FileExtensions { get; }

    /// <summary>
    /// Import a file and return one or more AssetItem descriptors.
    /// </summary>
    IEnumerable<AssetItem> Import(UFile rawAssetPath, AssetImporterParameters importerParameters);
}
```

### How Import Works

1. User drags a file into Game Studio or adds it to the Assets folder.
2. Game Studio finds the matching importer by file extension.
3. The importer reads the file and creates Asset objects with default settings.
4. Asset `.sd*` files are written to the project.
5. The user can modify settings in the Property Grid.

### Built-In Importers

Stride bundles importers for common formats using established libraries:

- **3D Models:** Assimp (FBX, OBJ, DAE, glTF, GLB)
- **Textures:** FreeImage and custom converters
- **Audio:** FFmpeg for decoding
- **Fonts:** FreeType

---

## 5 — Compilers — IAssetCompiler

A compiler transforms an Asset into runtime data. Each implementation must be decorated with `[AssetCompiler]` to register with the `AssetCompilerRegistry`.

```csharp
// Simplified — see Stride.Core.Assets.Compiler for full API
public interface IAssetCompiler
{
    /// <summary>
    /// Prepare compilation steps for the given asset.
    /// </summary>
    AssetCompilerResult Prepare(
        AssetCompilerContext context,
        AssetItem assetItem);
}
```

### Anatomy of a Compiler

```csharp
using Stride.Core.Assets;
using Stride.Core.Assets.Compiler;

[AssetCompiler(typeof(DialogueAsset), typeof(AssetCompilationContext))]
public class DialogueAssetCompiler : AssetCompilerBase<DialogueAsset>
{
    protected override void Prepare(
        AssetCompilerContext context,
        AssetItem assetItem,
        string targetUrlInStorage,
        AssetCompilerResult result)
    {
        var asset = (DialogueAsset)assetItem.Asset;

        // Add a build command that will execute during compilation
        result.BuildSteps = new AssetBuildStep(assetItem);
        result.BuildSteps.Add(new DialogueCompileCommand(
            targetUrlInStorage,
            asset,
            assetItem.Package));
    }
}
```

### Build Commands

The actual work happens in a `Command` subclass:

```csharp
public class DialogueCompileCommand : AssetCommand<DialogueAsset>
{
    public DialogueCompileCommand(
        string url,
        DialogueAsset parameters,
        IAssetFinder assetFinder)
        : base(url, parameters, assetFinder)
    {
    }

    protected override Task<ResultStatus> DoCommandOverride(
        ICommandContext commandContext)
    {
        var asset = Parameters;

        // Transform dialogue data into runtime format
        var runtimeData = new DialogueRuntimeData
        {
            Lines = asset.Lines.Select(l => new DialogueLine
            {
                Speaker = l.Speaker,
                Text = l.Text,
                Choices = l.Choices?.ToArray()
            }).ToArray()
        };

        // Write to the asset database
        var assetManager = new ContentManager(MicrothreadLocalDatabases
            .ProviderService);
        assetManager.Save(Url, runtimeData);

        return Task.FromResult(ResultStatus.Successful);
    }
}
```

---

## 6 — Thumbnail Compilers

Each asset type typically has two compilers: one for the game build and one for editor thumbnails. Thumbnails are the small preview images shown in the Asset View.

```csharp
[AssetCompiler(typeof(DialogueAsset), typeof(ThumbnailCompilationContext))]
public class DialogueThumbnailCompiler : ThumbnailCompilerBase<DialogueAsset>
{
    public DialogueThumbnailCompiler()
    {
        IsStatic = true; // Thumbnail doesn't change unless asset changes
    }

    protected override void CompileThumbnail(
        ThumbnailCompilerContext context,
        string thumbnailStorageUrl,
        AssetItem assetItem,
        Package originalPackage,
        AssetCompilerResult result)
    {
        // Generate a thumbnail image for the asset
        result.BuildSteps.Add(new ThumbnailBuildStep(
            new DialogueThumbnailBuildCommand(
                thumbnailStorageUrl, context,
                assetItem.Asset as DialogueAsset)));
    }
}
```

---

## 7 — Incremental Compilation and Dependencies

Stride tracks dependencies between assets to enable incremental builds — only recompiling assets whose inputs changed.

### Dependency Types

- **Direct dependency:** Material references a Texture → changing the texture triggers recompilation of the material.
- **Compile-time dependency:** A model's compiler reads referenced materials during compilation.
- **Content reference:** `ContentReference<T>` fields create runtime load dependencies.

### How Incremental Builds Work

1. The build system computes a hash of each asset's inputs (source file bytes, settings, referenced asset hashes).
2. If the hash matches the cached build output, the asset is skipped.
3. If a dependency changes, all dependent assets are also recompiled.
4. Results are stored in the build cache (`obj/` directory).

### Declaring Dependencies

In a custom compiler, declare dependencies so the incremental system knows about them:

```csharp
protected override void Prepare(
    AssetCompilerContext context,
    AssetItem assetItem,
    string targetUrlInStorage,
    AssetCompilerResult result)
{
    var asset = (MyAsset)assetItem.Asset;

    // Declare that this asset depends on a texture
    if (asset.TextureReference != null)
    {
        var textureItem = assetItem.Package.Assets
            .Find(asset.TextureReference.Id);
        if (textureItem != null)
        {
            result.BuildSteps = new AssetBuildStep(assetItem);
            result.BuildSteps.Add(
                new MyCompileCommand(targetUrlInStorage, asset));
        }
    }
}
```

---

## 8 — Building a Custom Asset Type (Worked Example)

This example creates a **DialogueAsset** that stores conversation trees.

### Step 1: Define the Asset Class

```csharp
using Stride.Core;
using Stride.Core.Assets;

[DataContract("DialogueAsset")]
[AssetDescription(".sddialogue")]
[AssetContentType(typeof(DialogueRuntimeData))]
public class DialogueAsset : Asset
{
    [DataMember(10)]
    public string Title { get; set; } = "New Dialogue";

    [DataMember(20)]
    public List<DialogueLine> Lines { get; set; } = new();
}

[DataContract]
public class DialogueLine
{
    [DataMember(10)]
    public string Speaker { get; set; }

    [DataMember(20)]
    public string Text { get; set; }

    [DataMember(30)]
    public List<string> Choices { get; set; }
}
```

### Step 2: Define the Runtime Data

```csharp
using Stride.Core;
using Stride.Core.Serialization.Contents;

[DataContract]
[ContentSerializer(typeof(DataContentSerializer<DialogueRuntimeData>))]
public class DialogueRuntimeData
{
    public DialogueLine[] Lines { get; set; }
}
```

### Step 3: Implement the Compiler

(See Section 5 for the DialogueAssetCompiler implementation.)

### Step 4: Register and Use

1. Place the asset, compiler, and runtime classes in your game project.
2. Decorate the compiler with `[AssetCompiler(typeof(DialogueAsset), typeof(AssetCompilationContext))]`.
3. In Game Studio, you can now create DialogueAsset files (`.sddialogue`).
4. At runtime, load the compiled data:

```csharp
public class DialoguePlayerScript : AsyncScript
{
    public DialogueRuntimeData Dialogue;

    public override async Task Execute()
    {
        if (Dialogue == null) return;

        foreach (var line in Dialogue.Lines)
        {
            Log.Info($"{line.Speaker}: {line.Text}");

            if (line.Choices?.Length > 0)
            {
                // Present choices to the player...
                Log.Info($"Choices: {string.Join(", ", line.Choices)}");
            }

            // Wait for player input before advancing
            while (!Input.IsKeyPressed(Keys.Return))
                await Script.NextFrame();
        }
    }
}
```

---

## 9 — Asset Compilation Context and Parameters

The `AssetCompilerContext` provides build-wide settings:

| Property | Description |
|----------|-------------|
| `Platform` | Target platform (Windows, Android, iOS, Linux). |
| `BuildConfiguration` | Debug, Release, or AppStore. |
| `CompilationContext` | Game compilation or thumbnail compilation. |

Use the context to make platform-specific decisions:

```csharp
protected override Task<ResultStatus> DoCommandOverride(
    ICommandContext commandContext)
{
    // Example: compress differently for mobile
    var platform = Parameters.Platform;
    bool useMobileCompression = platform == PlatformType.Android
        || platform == PlatformType.iOS;

    // ... compile with appropriate settings
    return Task.FromResult(ResultStatus.Successful);
}
```

---

## 10 — Debugging the Asset Pipeline

**Build Logs**
Game Studio shows build output in the **Output** panel → **Build** tab. Look for warnings and errors per asset.

**Verbose Logging**
Launch Game Studio from the command line with `--log-level=verbose` to see detailed build steps.

**Force Rebuild**
If incremental compilation skips an asset incorrectly, use **Build → Clean** then **Build → Build** to force a full rebuild.

**Debugging a Custom Compiler**
1. Attach a debugger to the Game Studio process.
2. Set a breakpoint in your `DoCommandOverride`.
3. Trigger a build. The compiler runs in-process (not a separate process).

---

## 11 — Performance Tips

- **Keep asset dependencies shallow.** Deep chains (A → B → C → D → E) cause cascading rebuilds when any link changes.
- **Use content references (`ContentReference<T>`) for lazy loading.** Assets referenced this way are loaded on demand, not at scene load.
- **Batch small assets.** If you have hundreds of tiny dialogue files, consider a single "dialogue pack" asset that compiles them all into one runtime object.
- **Profile the build.** Game Studio logs build times per asset. Identify slow compilers and optimize their `DoCommandOverride`.

---

## 12 — Common Pitfalls

**Missing `[AssetCompiler]` attribute**
Without this attribute, the compiler is never registered and the asset silently fails to compile. Check the build output for "no compiler found" warnings.

**Forgetting `[ContentSerializer]` on runtime data**
The runtime data class must be serializable by Stride's content system. Without `[ContentSerializer]`, `ContentManager.Load<T>()` will throw at runtime.

**Circular asset dependencies**
If Asset A references Asset B and B references A, the build system may enter an infinite loop or produce incorrect results. Design one-directional dependency graphs.

**Not handling null references in compilers**
Assets may have unset references (the user hasn't assigned a texture yet). Always null-check references in `Prepare()` and `DoCommandOverride()`.

**Modifying source assets in a compiler**
Compilers should be read-only with respect to the source asset. Write only to the output (via ContentManager.Save). Modifying the source causes editor corruption.
