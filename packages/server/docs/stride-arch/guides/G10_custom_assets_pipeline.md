# G10 — Custom Assets Pipeline

> **Category:** guide · **Engine:** Stride · **Related:** [G01 Getting Started](./G01_getting_started.md) · [G03 Code-Only Development](./G03_code_only_development.md) · [G08 Stride 4.3 Migration](./G08_stride_43_migration.md)

How to create custom asset types in Stride 4.3+. Covers the three-class pattern (runtime, asset, compiler), editor template integration, asset dependencies, and the build pipeline. Use this when your game needs domain-specific data types — level definitions, dialogue databases, loot tables, AI behavior configs — managed through Stride Game Studio like any built-in asset.

---

## Why Custom Assets?

Stride's built-in asset types (textures, models, materials, prefabs, scenes) cover rendering and scene composition, but games need domain-specific data. You could store this data in JSON or XML files loaded at runtime, but custom assets give you:

- **Editor integration** — create, rename, and configure assets in Game Studio's Asset View
- **Build pipeline** — assets are compiled, optimized, and packaged automatically
- **Dependency tracking** — reference other assets (prefabs, textures) with automatic rebuild when dependencies change
- **Serialization** — Stride handles save/load, versioning, and platform-specific compilation
- **Thumbnails and previews** — custom assets appear alongside built-in types in the editor

## Architecture: The Three-Class Pattern

Every custom asset in Stride requires three C# classes:

| Class | Purpose | Inherits From | Where It Runs |
|-------|---------|---------------|---------------|
| **Runtime class** | The object your game code uses at runtime | (plain class) | Game runtime |
| **Asset class** | The design-time representation stored in `.sd*` files | `Asset` | Editor + build |
| **Compiler class** | Converts asset → runtime during build | `AssetCompilerBase` | Build pipeline |

This separation is deliberate. The editor works with the asset class (which may have editor-only fields, references to source files, import settings). The compiler transforms it into the runtime class (which is lean and optimized for the game). Your game code only ever sees the runtime class.

## Step 1: Project Setup

Add `Stride.Core.Assets` to your game project's `.csproj`. All Stride package versions must match:

```xml
<ItemGroup>
  <PackageReference Include="Stride.Core.Assets" Version="4.3.0.1" />
  <PackageReference Include="Stride.Core.Assets.CompilerApp"
                    Version="4.3.0.1"
                    IsAssetPack="true"
                    IncludeAssets="build" />
  <!-- Your other Stride packages at the same version -->
</ItemGroup>
```

The `Stride.Core.Assets.CompilerApp` reference with `IsAssetPack="true"` is what enables the build pipeline to discover and compile your custom assets.

## Step 2: Runtime Class

The runtime class is what your game scripts receive when they load the asset via `Content.Load<T>()`. Keep it minimal — only data the game needs at runtime.

```csharp
using System.Collections.Generic;
using Stride.Core;
using Stride.Core.Serialization;
using Stride.Core.Serialization.Contents;
using Stride.Engine;

namespace MyGame.Assets
{
    /// <summary>
    /// Runtime representation of a custom block collection asset.
    /// This is what game scripts receive via Content.Load<BlockCollection>().
    /// </summary>
    [DataContract]
    [ContentSerializer(typeof(DataContentSerializerWithReuse<BlockCollection>))]
    [ReferenceSerializer]
    [DataSerializerGlobal(
        typeof(ReferenceSerializer<BlockCollection>),
        Profile = "Content")]
    [DataSerializerGlobal(
        typeof(CloneSerializer<BlockCollection>),
        Profile = "Clone")]
    public class BlockCollection
    {
        /// <summary>
        /// Display name shown in-game (e.g., for UI or debug).
        /// </summary>
        public string Name { get; set; } = string.Empty;

        /// <summary>
        /// Prefabs representing each block variant.
        /// These are references to other Stride assets — the build
        /// pipeline resolves and packages them automatically.
        /// </summary>
        public List<Prefab> BlockPrefabs { get; set; } = new();

        /// <summary>
        /// Spawn weight per block (index-matched to BlockPrefabs).
        /// Higher values = more likely to appear in procedural generation.
        /// </summary>
        public List<float> SpawnWeights { get; set; } = new();
    }
}
```

### Attribute Breakdown

- **`[DataContract]`** — marks the class for Stride's serialization system
- **`[ContentSerializer(...)]`** — tells the content manager how to deserialize this type; `DataContentSerializerWithReuse` supports reference sharing (the same asset loaded twice returns the same instance)
- **`[ReferenceSerializer]`** — enables other assets to hold references to this type
- **`[DataSerializerGlobal(..., Profile = "Content")]`** — registers the serializer for the content build pipeline
- **`[DataSerializerGlobal(..., Profile = "Clone")]`** — registers the serializer for runtime cloning (e.g., prefab instantiation)

## Step 3: Asset Class

The asset class is the design-time representation. It mirrors the runtime class but can include editor-only metadata, import settings, or validation logic.

```csharp
using Stride.Core;
using Stride.Core.Assets;

namespace MyGame.Assets
{
    /// <summary>
    /// Design-time asset class. Stride Game Studio reads and writes
    /// this as a YAML file with the .blks extension.
    /// </summary>
    [AssetDescription(FileExtension, AllowArchetype = false)]
    [AssetContentType(typeof(BlockCollection))]
    [AssetFormatVersion(
        nameof(MyGame),          // namespace scope for versioning
        CurrentVersion,           // current format version string
        "1.0.0.0")]              // minimum upgradable version
    public class BlockCollectionAsset : Asset
    {
        public const string FileExtension = ".blks";
        private const string CurrentVersion = "1.0.0.0";

        /// <summary>
        /// The runtime data. In simple cases, embed the runtime class
        /// directly as a property. For complex assets, map fields
        /// individually in the compiler.
        /// </summary>
        [DataMember(10)]
        public BlockCollection Data { get; set; } = new();
    }
}
```

### Key Points

- **`[AssetDescription]`** — defines the file extension (`.blks`) used on disk and in the editor. Choose something unique to avoid collisions with built-in types.
- **`[AssetContentType]`** — links this asset class to its runtime class. The build pipeline uses this to know what type the compiler should output.
- **`[AssetFormatVersion]`** — enables asset migration when you change the format. Bump the version and implement an `AssetUpgraderBase` to migrate old assets.
- **`[DataMember(order)]`** — controls serialization order. Use explicit ordering for stable YAML output.

## Step 4: Compiler Class

The compiler converts the asset class into the runtime class during the build. This runs as part of `dotnet build` and when Game Studio builds assets.

```csharp
using Stride.Core.Assets;
using Stride.Core.Assets.Compiler;
using Stride.Core.BuildEngine;
using Stride.Core.Serialization.Contents;

namespace MyGame.Assets
{
    [AssetCompiler(
        typeof(BlockCollectionAsset),
        typeof(AssetCompilationContext))]
    public class BlockCollectionCompiler : AssetCompilerBase
    {
        protected override void Prepare(
            AssetCompilerContext context,
            AssetItem assetItem,
            string targetUrlInStorage,
            AssetCompilerResult result)
        {
            var asset = (BlockCollectionAsset)assetItem.Asset;

            // Register a build step that will execute DoCommandOverride
            result.BuildSteps = new AssetBuildStep(assetItem);
            result.BuildSteps.Add(new BlockCollectionBuildCommand(
                targetUrlInStorage, asset, assetItem.Package));
        }
    }

    /// <summary>
    /// The actual build command. Separated from the compiler so the
    /// build system can cache, parallelize, and skip unchanged assets.
    /// </summary>
    public class BlockCollectionBuildCommand : AssetCommand<BlockCollectionAsset>
    {
        public BlockCollectionBuildCommand(
            string url,
            BlockCollectionAsset parameters,
            IAssetFinder assetFinder)
            : base(url, parameters, assetFinder)
        {
        }

        protected override System.Threading.Tasks.Task<ResultStatus>
            DoCommandOverride(ICommandContext commandContext)
        {
            // Transform design-time asset into runtime object.
            // For simple assets this is a direct copy; for complex
            // assets you might filter, optimize, or precompute data.
            var runtimeAsset = Parameters.Data;

            // Save the runtime object — the content manager will
            // serialize it into the game's asset database
            var assetManager = new ContentManager(MicrothreadLocalDatabases
                .ProviderService);
            assetManager.Save(Url, runtimeAsset);

            return System.Threading.Tasks.Task.FromResult(
                ResultStatus.Successful);
        }
    }
}
```

### Handling Asset Dependencies

If your custom asset references other assets (like prefabs in the example above), override `GetInputFiles()` in the compiler to declare those dependencies. This ensures:

- Referenced assets are compiled before yours
- Your asset is recompiled when a dependency changes

```csharp
protected override IEnumerable<ObjectUrl> GetInputFiles(AssetItem assetItem)
{
    var asset = (BlockCollectionAsset)assetItem.Asset;
    foreach (var prefab in asset.Data.BlockPrefabs)
    {
        if (prefab != null)
        {
            // Yield the URL of each referenced prefab
            yield return new ObjectUrl(UrlType.Content,
                AttachedReferenceManager.GetUrl(prefab));
        }
    }
}
```

## Step 5: Editor Template

To create assets of your custom type through the Game Studio "Add Asset" menu, you need a template file.

### Create the Template Directory

```
MyGame/
├── Templates/
│   └── BlockCollection.sdtpl
├── Assets/
├── MyGame.csproj
└── MyGame.sdpkg
```

### Template File (`.sdtpl`)

```yaml
!TemplateAssetFactory
Id: 3f8a7b2c-1d4e-4f5a-9c0b-6e8d7a2f1b3c
AssetTypeName: BlockCollectionAsset
Name: Block Collection
Scope: Asset
Description: A collection of block prefabs with spawn weights for procedural generation.
Group: Gameplay
DefaultOutputName: NewBlockCollection
```

Generate a unique GUID for the `Id` field — each template must have a globally unique identifier.

### Register in Package Descriptor (`.sdpkg`)

Add a `TemplateFolders` entry to your `.sdpkg` file:

```yaml
TemplateFolders:
    -   Path: !dir Templates
        Group: Assets
        Files:
            - !file Templates/BlockCollection.sdtpl
```

After rebuilding, your custom asset type appears in Game Studio's "Add Asset" context menu under the group you specified.

## Step 6: Loading at Runtime

In your game scripts, load the custom asset like any built-in Stride asset:

```csharp
public class BlockSpawner : SyncScript
{
    /// <summary>
    /// Assign in Game Studio — drag your BlockCollection asset here.
    /// </summary>
    public BlockCollection Blocks { get; set; }

    public override void Start()
    {
        // If not assigned in editor, load by path
        Blocks ??= Content.Load<BlockCollection>("Gameplay/MainBlocks");

        Log.Info($"Loaded {Blocks.BlockPrefabs.Count} block types");
    }

    public override void Update()
    {
        // Use Blocks.BlockPrefabs and Blocks.SpawnWeights
        // for runtime logic
    }
}
```

When the property type matches your runtime class and has `{ get; set; }`, Game Studio automatically provides an asset picker in the property grid.

## Multi-Project Considerations

If your custom asset classes live in a separate class library project (not the main game project), you need a `Module.cs` with an assembly initializer:

```csharp
using System.Runtime.CompilerServices;
using Stride.Core;
using Stride.Core.Reflection;

namespace MyGame.SharedAssets
{
    internal class Module
    {
        [ModuleInitializer]
        public static void Initialize()
        {
            // Register this assembly so Game Studio discovers
            // asset types, compilers, and templates
            AssemblyRegistry.Register(
                typeof(Module).Assembly,
                AssemblyCommonCategories.Assets);
        }
    }
}
```

Without this registration, Game Studio will not discover your custom asset types, and template creation will fail silently.

## Rebuilding After Changes

When you modify the runtime class structure (add/remove/rename fields), the asset database needs a full rebuild:

1. **Clean the solution** — `dotnet clean` or Build → Clean Solution in your IDE
2. **Delete build artifacts** — remove `obj/stride/` and `bin/db/` directories if the clean doesn't resolve issues
3. **Rebuild** — `dotnet build` will recompile all assets with the new schema

Incremental builds handle changes to asset *values* (editing in Game Studio). Only structural changes to the *classes* require a clean rebuild.

## Practical Use Cases

| Custom Asset Type | Runtime Class Holds | Why Not Just JSON? |
|---|---|---|
| Enemy wave definition | Prefab refs, spawn timing, difficulty curve | Prefab references resolved at build time |
| Dialogue database | Character IDs, dialogue trees, localization keys | Editor integration for writers |
| Loot table | Item refs, drop rates, rarity tiers | Dependency tracking on item assets |
| Level generation rules | Tile prefabs, placement rules, biome weights | Visual editing of prefab references |
| Audio bank config | SoundEffect refs, volume curves, random pools | Automatic audio asset packaging |

The common thread: use custom assets when your data **references other Stride assets** or when **non-programmer team members** need to edit the data through Game Studio.
