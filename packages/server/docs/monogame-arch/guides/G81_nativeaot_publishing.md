# G81 — NativeAOT Publishing & Trimming

> **Category:** guide · **Engine:** MonoGame · **Related:** [G32 Deployment & Platform Builds](./G32_deployment_platform_builds.md) · [G72 Content Builder Migration](./G72_content_builder_migration.md) · [G73 Cross-Platform Deployment](./G73_cross_platform_deployment.md) · [G80 CI/CD & Automated Builds](./G80_ci_cd_automated_builds.md)

How to publish MonoGame games as NativeAOT-compiled single-file executables. Covers project configuration, trimming compatibility, common pitfalls with reflection and content pipeline readers, platform-specific considerations, and the BRUTE-to-NativeAOT migration path for console targets. NativeAOT produces smaller, faster-starting executables with no .NET runtime dependency — ideal for game distribution.

---

## Why NativeAOT for Games?

Standard .NET publishing bundles your game's IL code with the .NET runtime. Players either need the runtime installed or you ship a self-contained deployment (~60-80MB overhead). The JIT compiler adds startup latency and occasional frame-time spikes during gameplay as new code paths are compiled.

NativeAOT (Ahead-of-Time) compilation solves all three problems:

- **No runtime dependency** — the executable includes only what your game uses, statically linked
- **Fast startup** — native code is ready immediately, no JIT warmup
- **Consistent frame times** — no JIT compilation spikes during gameplay
- **Smaller binaries** — aggressive trimming removes unused framework code
- **Code obfuscation** — IL is compiled away, making reverse engineering harder
- **Console compatibility** — NativeAOT is the path forward for MonoGame on consoles (replacing BRUTE)

The trade-off: NativeAOT imposes restrictions on reflection, dynamic code generation, and certain runtime patterns. Game code that follows standard MonoGame patterns works fine. Libraries that rely on runtime reflection may need adjustments.

## Enabling NativeAOT

### Project Configuration

Add NativeAOT properties to your `.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>WinExe</OutputType>
    <TargetFramework>net9.0</TargetFramework>
    <PublishAot>true</PublishAot>

    <!-- Trimming configuration -->
    <TrimMode>full</TrimMode>
    <EnableTrimAnalyzer>true</EnableTrimAnalyzer>
    <SuppressTrimAnalysisWarnings>false</SuppressTrimAnalysisWarnings>

    <!-- Recommended: treat trimming warnings as errors during development -->
    <TrimmerSingleWarn>false</TrimmerSingleWarn>
  </PropertyGroup>
</Project>
```

### Publishing

```bash
# Windows x64
dotnet publish -c Release -r win-x64

# Linux x64
dotnet publish -c Release -r linux-x64

# macOS ARM (Apple Silicon)
dotnet publish -c Release -r osx-arm64

# macOS x64 (Intel)
dotnet publish -c Release -r osx-x64
```

NativeAOT requires specifying a Runtime Identifier (`-r`). Cross-compilation is not supported — you must build on the target platform (or use CI runners per platform, see [G80](./G80_ci_cd_automated_builds.md)).

The output is a single native executable plus your content files. No `dotnet` installation needed on the player's machine.

## Content Pipeline Compatibility

### The Reflection Problem

MonoGame's content pipeline uses `ContentManager.Load<T>()` which internally resolves content readers via reflection. In a standard .NET build, the runtime discovers `ContentTypeReader` subclasses dynamically. NativeAOT's trimmer removes types it can't statically prove are used, which can silently break content loading.

### Explicit Reader Registration

For NativeAOT builds, register content readers explicitly so the trimmer preserves them:

```csharp
// In your Game constructor or initialization, before loading any content
protected override void Initialize()
{
    // Register readers that the trimmer might remove
    ContentTypeReaderManager.AddTypeCreator(
        "Microsoft.Xna.Framework.Content.Texture2DReader",
        () => new Texture2DReader()
    );
    ContentTypeReaderManager.AddTypeCreator(
        "Microsoft.Xna.Framework.Content.SoundEffectReader",
        () => new SoundEffectReader()
    );
    ContentTypeReaderManager.AddTypeCreator(
        "Microsoft.Xna.Framework.Content.SpriteFontReader",
        () => new SpriteFontReader()
    );

    base.Initialize();
}
```

### MonoGame.Extended Trimming Support

If you use MonoGame.Extended (v5.4+), it provides explicit reader registration for trimming/NativeAOT compatibility:

```csharp
// Register only the MonoGame.Extended readers you actually use
ContentTypeReaderManager.AddTypeCreator(
    "MonoGame.Extended.Tiled.TiledMapReader",
    () => new TiledMapReader()
);
```

This avoids the reflection fallback and ensures trimming friendliness. Only register readers for content types you actually load.

## Trimming Analysis

### Enabling Warnings

The `EnableTrimAnalyzer` property causes the compiler to emit warnings for code patterns that are unsafe under trimming:

```
warning IL2026: Using member 'System.Type.GetType(String)' which has
'RequiresUnreferencedCodeAttribute' can break functionality when trimming...
```

**Do not suppress these warnings.** Each one represents code that will silently break in a NativeAOT build. Fix them before publishing.

### Common Warning Patterns and Fixes

#### Type.GetType() and Activator.CreateInstance()

```csharp
// Trimming-unsafe: the trimmer can't know which type to preserve
var type = Type.GetType(typeName);
var instance = Activator.CreateInstance(type);

// Trimming-safe: use a factory dictionary or switch
var instance = typeName switch
{
    "Goblin" => new Goblin(),
    "Skeleton" => new Skeleton(),
    _ => throw new ArgumentException($"Unknown enemy type: {typeName}")
};
```

#### JSON Serialization

```csharp
// Trimming-unsafe with System.Text.Json default behavior
var data = JsonSerializer.Deserialize<SaveData>(json);

// Trimming-safe: use source generators
[JsonSerializable(typeof(SaveData))]
[JsonSerializable(typeof(PlayerState))]
[JsonSerializable(typeof(InventoryItem))]
internal partial class GameJsonContext : JsonSerializerContext { }

var data = JsonSerializer.Deserialize<SaveData>(json, GameJsonContext.Default.SaveData);
```

#### Enum.Parse with String Names

```csharp
// Can be trimmed: enum member names might be removed
var direction = Enum.Parse<Direction>(savedDirection);

// Safer: store enum as integer in save files
var direction = (Direction)savedDirectionInt;
```

### Rd.xml for Preserving Types

If you must use reflection for a specific pattern (e.g., a plugin system), create an `rd.xml` file to tell the trimmer to preserve types:

```xml
<!-- rd.xml -->
<Directives xmlns="http://schemas.microsoft.com/netfx/2013/01/metadata">
  <Application>
    <Assembly Name="MyGame" Dynamic="Required All" />
  </Application>
</Directives>
```

Reference it in your `.csproj`:

```xml
<ItemGroup>
  <RdXmlFile Include="rd.xml" />
</ItemGroup>
```

Use this sparingly — preserving entire assemblies defeats the purpose of trimming.

## Platform-Specific Considerations

### Windows

NativeAOT on Windows produces a standard `.exe`. Native dependencies (SDL2, FNA3D, or platform-specific MonoGame libs) must be alongside the executable:

```
MyGame/
├── MyGame.exe          # NativeAOT compiled
├── SDL2.dll            # Native dependency
├── Content/            # Game content
│   ├── Sprites.xnb
│   └── Music.ogg
```

### Linux

Produces an ELF binary. Ensure native libraries are in the same directory or set `LD_LIBRARY_PATH`:

```bash
chmod +x MyGame
./MyGame
```

### macOS

Produces a Mach-O binary. For distribution, wrap in an `.app` bundle:

```
MyGame.app/
├── Contents/
│   ├── Info.plist
│   ├── MacOS/
│   │   └── MyGame        # NativeAOT binary
│   └── Resources/
│       └── Content/
```

Code signing and notarization are required for distribution outside the App Store. See [G36 Publishing & Distribution](./G36_publishing_distribution.md).

### Console Targets

MonoGame's console runtime is transitioning from BRUTE (a proprietary .NET runtime) to NativeAOT. This is an active effort by the MonoGame Foundation as of 2025-2026. The practical implications:

- Ensure your game compiles cleanly with `PublishAot=true` and zero trimming warnings on desktop before attempting console builds
- Avoid any reflection-based patterns (they won't work on consoles regardless of runtime)
- Test NativeAOT desktop builds regularly in CI to catch regressions early
- Stay clear of `System.Reflection.Emit` and runtime code generation

## Build Size Optimization

### Baseline Comparison

Approximate sizes for a minimal MonoGame game (one sprite, one sound):

| Build Type | Size |
|-----------|------|
| Self-contained (no trimming) | ~65 MB |
| Self-contained + trimmed | ~25 MB |
| NativeAOT | ~12-18 MB |

### Further Size Reduction

```xml
<PropertyGroup>
  <PublishAot>true</PublishAot>

  <!-- Strip debug symbols (don't use for crash reporting builds) -->
  <StripSymbols>true</StripSymbols>

  <!-- Use size-optimized compilation -->
  <OptimizationPreference>Size</OptimizationPreference>

  <!-- Remove stack trace strings -->
  <StackTraceSupport>false</StackTraceSupport>

  <!-- Remove globalization data if not localizing -->
  <InvariantGlobalization>true</InvariantGlobalization>
</PropertyGroup>
```

**Warning:** `StackTraceSupport=false` means crash reports won't have readable stack traces. Use this only for final release builds, not development or testing.

## Testing NativeAOT Builds

NativeAOT builds can behave differently from standard builds. Test regularly:

```bash
# Quick smoke test: does it start and load content?
dotnet publish -c Release -r win-x64
./bin/Release/net9.0/win-x64/publish/MyGame.exe

# CI integration: build + run headless tests
dotnet publish -c Release -r linux-x64
# Run automated tests against the AOT binary
```

### What to Watch For

- **Missing content:** files load fine in debug but fail in AOT because a reader was trimmed
- **Serialization failures:** save/load breaks because types were trimmed
- **Enum names missing:** UI displays integers instead of names because enum metadata was stripped
- **Third-party library crashes:** NuGet packages using reflection fail at runtime

### Development Workflow

Don't use NativeAOT for day-to-day development — compilation is much slower than standard builds. Instead:

1. **Daily development:** standard `dotnet run` with JIT
2. **Weekly:** NativeAOT CI build to catch trimming regressions
3. **Pre-release:** full NativeAOT testing on all target platforms
4. **Release:** NativeAOT publish with size optimizations

Keep `EnableTrimAnalyzer=true` even in JIT development builds — it catches problems at compile time without the slow NativeAOT compilation.
