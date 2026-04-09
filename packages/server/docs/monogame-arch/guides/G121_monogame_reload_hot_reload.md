# G121 — MonoGame.Reload: Runtime Hot Reload Workflow

> **Category:** guide · **Engine:** MonoGame · **Related:** [G50 Hot Reload](./G50_hot_reload.md) · [G8 Content Pipeline](./G8_content_pipeline.md) · [G115 Custom HLSL Effect Pipeline](./G115_custom_hlsl_effect_pipeline.md) · [G29 Game Editor](./G29_game_editor.md) · [G78 Gum Hot Reload & Editor Workflow](./G78_gum_hot_reload_editor_workflow.md) · [G116 External Level Editor Integration](./G116_external_level_editor_integration.md)

How to use the **MonoGame.Reload** NuGet library (v0.3.3+) to hot-reload textures, effects, sounds, and data files at runtime without restarting your game. Covers setup, supported asset types, file-watching configuration, callback hooks, and integration with custom asset pipelines.

---

## Table of Contents

1. [Why Runtime Hot Reload](#1-why-runtime-hot-reload)
2. [Installation & Setup](#2-installation--setup)
3. [How It Works](#3-how-it-works)
4. [Reloading Textures](#4-reloading-textures)
5. [Reloading Effects / Shaders](#5-reloading-effects--shaders)
6. [Reloading Sounds & Music](#6-reloading-sounds--music)
7. [Reloading Data Files](#7-reloading-data-files)
8. [File Callbacks & Events](#8-file-callbacks--events)
9. [Filtering & Ignoring Asset Types](#9-filtering--ignoring-asset-types)
10. [Integration Patterns](#10-integration-patterns)
11. [Troubleshooting](#11-troubleshooting)

---

## 1. Why Runtime Hot Reload

The typical MonoGame iteration loop is: edit asset → rebuild content → restart game → navigate to the right state → check the change. For visual assets this is painful — a texture tweak might require a 30-second round trip.

MonoGame.Reload watches your raw content folder for file changes and reloads assets into the running game immediately. The game stays running, game state is preserved, and you see results in under a second.

```
Without hot reload:  Edit → Build → Restart → Navigate → Verify  (~30s)
With hot reload:     Edit → Save → See change                    (~1s)
```

**Best use cases:**
- Iterating on textures, sprite sheets, and tilesets
- Tuning shader effects in real time
- Adjusting sound effects and ambient loops
- Tweaking JSON/XML data files (level data, balance tables)
- Artist workflows where the artist edits files while a developer runs the game

---

## 2. Installation & Setup

### Install the NuGet Package

```bash
dotnet add package MonoGame.Reload
```

Or in your `.csproj`:

```xml
<PackageReference Include="MonoGame.Reload" Version="0.3.3" />
```

### Initialize the Reloader

```csharp
using MonoGame.Reload;

public class Game1 : Game
{
    private Reloader _reloader;

    protected override void Initialize()
    {
        // Initialize the Reloader with your ContentManager
        // It uses FileSystemWatcher internally to monitor your Content directory
        _reloader = new Reloader(Content);

        base.Initialize();
    }

    protected override void Update(GameTime gameTime)
    {
        // Must call every frame to process pending reloads
        _reloader.Update();

        base.Update(gameTime);
    }

    protected override void UnloadContent()
    {
        _reloader.Dispose();
        base.UnloadContent();
    }
}
```

**Important:** The `Reloader` monitors the **raw content source directory** (your `Content/` folder with the original files), not the compiled `bin/Content/` output. It watches for file saves and recompiles + reloads automatically.

### Content Directory Configuration

By default, MonoGame.Reload looks for the content directory relative to the executable. For development, ensure your raw content files are accessible. A common pattern:

```xml
<!-- In your .csproj — copy raw content to output for the Reloader -->
<ItemGroup>
  <None Include="Content\**\*" CopyToOutputDirectory="PreserveNewest" />
</ItemGroup>
```

> **Production builds:** Disable the Reloader in release builds. Wrap initialization with `#if DEBUG`:

```csharp
#if DEBUG
    _reloader = new Reloader(Content);
#endif
```

---

## 3. How It Works

MonoGame.Reload uses .NET's `FileSystemWatcher` to detect file changes in the content directory:

```
FileSystemWatcher detects .png save
        ↓
Debounce (prevents multiple reloads from rapid saves)
        ↓
Load raw file from disk (bypass content pipeline)
        ↓
Create new Texture2D / Effect / SoundEffect
        ↓
Dispose previous asset (since v0.3.0)
        ↓
Update AssetsManager reference
        ↓
Fire Updated callback (if registered)
```

**Key behavior:**
- Assets are loaded from **raw source files** (PNG, FX, WAV), not from compiled XNB.
- Previous assets are automatically disposed when replaced (v0.3.0+), preventing memory leaks.
- Reloads happen on the main thread during `_reloader.Update()`, so they're safe for graphics resources.

---

## 4. Reloading Textures

Textures are the most common hot-reload use case:

```csharp
// Access textures through the AssetsManager
// The path mirrors your Content directory structure (no extension)
Texture2D playerSprite = AssetsManager.Textures["sprites/player"];

// In Draw:
spriteBatch.Draw(
    AssetsManager.Textures["sprites/player"],
    position, Color.White);
```

**Supported formats:** PNG, JPG, BMP — any format that `Texture2D.FromStream` supports.

**Workflow:**
1. Edit `Content/sprites/player.png` in your image editor.
2. Save the file.
3. MonoGame.Reload detects the change, reloads the texture.
4. Next frame, `AssetsManager.Textures["sprites/player"]` returns the updated texture.
5. Your `Draw` call renders the new version with no code changes.

> **Sprite sheets:** When reloading a sprite sheet, any `Rectangle` source regions you defined remain valid as long as the sheet dimensions don't change. If you resize the sheet, update your region definitions too (or use a data-driven sprite atlas — see [G94 Runtime Texture Atlas](./G94_runtime_texture_atlas.md)).

---

## 5. Reloading Effects / Shaders

Shader hot reload is powerful for graphics iteration. However, HLSL effects require compilation — MonoGame.Reload handles this if the MGCB tool is available:

```csharp
// Load an effect through the Reloader
Effect customEffect = AssetsManager.Effects["shaders/bloom"];

// In Draw:
customEffect.Parameters["BloomThreshold"]?.SetValue(0.8f);
foreach (var pass in customEffect.CurrentTechnique.Passes)
{
    pass.Apply();
    // draw geometry
}
```

**Shader workflow:**
1. Edit `Content/shaders/bloom.fx` in your text editor.
2. Save — the Reloader detects the change.
3. The shader is recompiled (requires MGCB tooling in the path).
4. The new `Effect` replaces the old one.

> **Tip:** Pair shader hot reload with [G115 Custom HLSL Effect Pipeline](./G115_custom_hlsl_effect_pipeline.md) for a smooth shader development loop. If compilation fails (syntax error), the Reloader keeps the previous working version — your game doesn't crash.

### Manual Shader Hot Reload (Alternative)

If you prefer more control or aren't using MonoGame.Reload for shaders, you can implement shader-only hot reload manually:

```csharp
// Watch a specific .fx file and recompile on change
var watcher = new FileSystemWatcher("Content/shaders", "*.fx");
watcher.Changed += (sender, e) =>
{
    // Queue reload for main thread (can't create Effect off-thread)
    _pendingShaderReloads.Enqueue(e.FullPath);
};
watcher.EnableRaisingEvents = true;
```

See [MonoGame docs: Hot Reload for 2D Shaders](https://docs.monogame.net/articles/tutorials/advanced/2d_shaders/02_hot_reload/index.html) for the official tutorial on this pattern.

---

## 6. Reloading Sounds & Music

```csharp
// Sound effects can be hot-reloaded similarly
SoundEffect hitSound = AssetsManager.Sounds["sfx/hit"];

// Play the latest version
hitSound.Play();
```

Since v0.3.3, MonoGame.Reload provides helpers for rendering and playing sound assets. When a sound file is updated on disk, the next `AssetsManager.Sounds["key"]` access returns the new version.

**Supported formats:** WAV (via `SoundEffect.FromStream`).

> **Note:** OGG and MP3 loaded via `MediaPlayer`/`Song` are not supported by MonoGame.Reload — they use a different loading path. For music hot reload, consider using `SoundEffectInstance` with looped WAV files or FMOD (see [G120 Adaptive Audio](./G120_adaptive_dynamic_audio.md)).

---

## 7. Reloading Data Files

MonoGame.Reload watches all files in the content directory. For JSON, XML, or CSV data files, use file callbacks to trigger your own reload logic:

```csharp
// Watch a JSON balance file
_reloader.OnFileUpdated("data/weapons.json", (path) =>
{
    string json = File.ReadAllText(path);
    WeaponDatabase = JsonSerializer.Deserialize<List<WeaponData>>(json);
    Console.WriteLine($"[HotReload] Reloaded weapon data: {WeaponDatabase.Count} weapons");
});
```

This is useful for:
- Game balance tuning (damage values, cooldowns, costs)
- Level definitions (tilemap data, entity placement)
- UI layouts (position, size, color values)
- Localization strings

---

## 8. File Callbacks & Events

Register callbacks to run custom logic when specific files are reloaded:

```csharp
// Per-file callback
AssetsManager.Textures.Updated += (assetName) =>
{
    Console.WriteLine($"[HotReload] Texture reloaded: {assetName}");

    // Example: invalidate a cached sprite atlas
    if (assetName == "sprites/tileset")
        _tileAtlas.Rebuild();
};
```

**Common callback patterns:**
- Rebuild sprite atlases when source textures change.
- Recalculate lighting when a normal map is updated.
- Refresh UI layout when a data file changes.
- Log reloads for debugging.

---

## 9. Filtering & Ignoring Asset Types

If you have files in your content directory that shouldn't be watched (build artifacts, editor backups):

```csharp
// Ignore specific asset types from being watched
_reloader.Ignore("*.bak");
_reloader.Ignore("*.tmp");
_reloader.Ignore("*.meta");
```

This reduces unnecessary `FileSystemWatcher` events and avoids attempting to reload files that aren't valid game assets.

---

## 10. Integration Patterns

### Pattern 1: Debug Overlay

Show reload activity in a debug overlay:

```csharp
private readonly Queue<string> _reloadLog = new();

// In setup:
AssetsManager.Textures.Updated += (name) =>
    _reloadLog.Enqueue($"[{DateTime.Now:HH:mm:ss}] Texture: {name}");

// In Draw (debug mode):
int y = 10;
foreach (var msg in _reloadLog.TakeLast(5))
{
    spriteBatch.DrawString(debugFont, msg, new Vector2(10, y), Color.Lime);
    y += 20;
}
```

### Pattern 2: Conditional Compilation

Keep hot reload out of release builds entirely:

```csharp
public class Game1 : Game
{
#if DEBUG
    private Reloader? _reloader;
#endif

    protected override void Initialize()
    {
#if DEBUG
        _reloader = new Reloader(Content);
#endif
        base.Initialize();
    }

    protected override void Update(GameTime gameTime)
    {
#if DEBUG
        _reloader?.Update();
#endif
        base.Update(gameTime);
    }
}
```

### Pattern 3: MonoGame.Aseprite Integration

Since v0.2.0, MonoGame.Reload can reload Aseprite (`.ase` / `.aseprite`) files if you have the [MonoGame.Aseprite](https://github.com/AristurtleDev/monogame-aseprite) package installed. This enables hot reload of animated sprites directly from the Aseprite editor:

```csharp
// Aseprite files reload automatically when saved from the Aseprite editor
var spriteSheet = AssetsManager.AsepriteFiles["sprites/character"];
```

---

## 11. Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| File changes not detected | `FileSystemWatcher` not reaching raw content dir | Verify `Content/` is copied to output or set the correct watch path |
| Reload causes crash | Asset created on wrong thread | Ensure `_reloader.Update()` runs on the main game thread |
| Textures appear blank after reload | File is still being written when read | MonoGame.Reload has built-in debounce, but slow saves (large PSD exports) may need additional delay |
| Memory grows over time | Old assets not disposed | Upgrade to v0.3.0+ which auto-disposes replaced assets |
| Shader reload fails silently | MGCB compilation error | Check console output for compilation errors; previous working effect is preserved |
| `FileSystemWatcher` throws on macOS | Known .NET issue with `kqueue` limits | Increase file descriptor limit: `ulimit -n 4096` |

### Platform Notes

- **Windows:** Full support, `FileSystemWatcher` is reliable.
- **macOS:** Works but `FileSystemWatcher` uses `kqueue` which has file descriptor limits. For large projects, increase limits or watch specific subdirectories.
- **Linux:** Works well with `inotify`. Ensure `fs.inotify.max_user_watches` is sufficient: `sysctl fs.inotify.max_user_watches=65536`.

---

## See Also

- [G50 Hot Reload](./G50_hot_reload.md) — general hot reload concepts and alternative approaches
- [G8 Content Pipeline](./G8_content_pipeline.md) — how MGCB compiles content
- [G115 Custom HLSL Effect Pipeline](./G115_custom_hlsl_effect_pipeline.md) — shader development workflow
- [G78 Gum Hot Reload & Editor Workflow](./G78_gum_hot_reload_editor_workflow.md) — UI hot reload with Gum
- [MonoGame.Reload on GitHub](https://github.com/akaadream/MonoGame.Reload)
- [MonoGame.Reload on NuGet](https://www.nuget.org/packages/MonoGame.Reload/)
- [MonoGame Docs: Shader Hot Reload Tutorial](https://docs.monogame.net/articles/tutorials/advanced/2d_shaders/02_hot_reload/index.html)
