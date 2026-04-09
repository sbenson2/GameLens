# G3 — Heaps Resource Management and Asset Loading

> **Category:** guide · **Engine:** Heaps · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Getting Started](G1_getting_started.md) · [2D Scene Graph](G2_2d_scene_graph.md) · [H3D Rendering](../reference/R1_h3d_rendering.md)

Heaps provides a compile-time-checked, macro-powered resource system that eliminates string-based asset paths and catches missing files before your game runs. This guide covers the `hxd.Res` API, virtual filesystems, loader initialization, the PAK packaging system, and best practices for managing assets across development and production builds.

---

## How hxd.Res Works

The `hxd.Res` class uses **Haxe macros** to scan your `res/` directory at compile time and generate typed fields for every file. Instead of loading assets by string path:

```haxe
// Bad — typos compile fine, fail at runtime
var tex = loadTexture("assets/sprites/playr.png");  // oops
```

You access them as typed fields:

```haxe
// Good — misspelled names are compile errors
var tex = hxd.Res.sprites.player.toTile();
```

If you rename or delete `res/sprites/player.png`, the next compile fails immediately. This catches asset errors at build time, not in playtesting.

### Directory Mapping Rules

Files in `res/` map to `hxd.Res` fields with these transformations:

| File Path | Haxe Access | Notes |
|-----------|-------------|-------|
| `res/sprites/player.png` | `hxd.Res.sprites.player` | Subdirectories become nested fields |
| `res/music/theme-01.ogg` | `hxd.Res.music.theme_01` | Hyphens become underscores |
| `res/data/levels.json` | `hxd.Res.data.levels` | Any file type is accessible |

### Custom Resource Path

By default Heaps looks in `res/`. Override with a compiler flag:

```
-D resourcesPath=assets/
```

---

## Initializing the Resource Loader

Before accessing any resource through `hxd.Res`, you must initialize a **loader** that tells Heaps *how* to fetch files. Different loaders serve different stages of development and deployment.

### LocalFileSystem (Development)

Reads files directly from disk. Best for development because you can hot-reload assets without recompiling:

```haxe
class Main extends hxd.App {
    override function init() {
        hxd.Res.initLocal();  // Shorthand for LocalFileSystem

        // Now safe to access resources
        var tile = hxd.Res.sprites.player.toTile();
        new h2d.Bitmap(tile, s2d);
    }
}
```

`initLocal()` sets up a `hxd.fs.LocalFileSystem` pointing at your `res/` directory. On HashLink and native targets, file changes are picked up live — no restart needed.

### EmbedFileSystem (Small Games / Jams)

Embeds all resource files directly into the compiled binary:

```haxe
hxd.Res.initEmbed();
```

Pros: single-file distribution, no external assets to ship. Cons: increases binary size, no hot-reloading, longer compile times for large asset sets. Suitable for game jams or small projects with modest asset sizes.

### PAK FileSystem (Production)

Packages all resources into binary `.pak` files for fast loading and distribution:

```haxe
hxd.Res.initPak();
```

This looks for `res.pak` next to the executable. PAK files are created with the `hxd.fmt.pak.Build` tool (see the Packaging section below).

---

## Resource Types and Conversions

Once the loader is initialized, `hxd.Res` fields return `hxd.res.Resource` subclass instances. Each file type maps to a resource class with specific conversion methods:

| File Type | Resource Class | Common Methods |
|-----------|---------------|----------------|
| `.png`, `.jpg` | `hxd.res.Image` | `.toTile()`, `.toTexture()` |
| `.ogg`, `.wav`, `.mp3` | `hxd.res.Sound` | `.play()`, `.toChannel()` |
| `.fnt`, `.ttf` | `hxd.res.Font` | `.toFont()` |
| `.fbx`, `.hmd` | `hxd.res.Model` | `.toHmd()` |
| `.json`, `.xml`, `.txt` | `hxd.res.Resource` | `.toText()`, `.toBytes()` |
| `.atlas` | `hxd.res.Atlas` | `.get("frameName")` |

### Loading Images

```haxe
// Get a Tile (lightweight reference to a texture region)
var tile = hxd.Res.sprites.player.toTile();
var bmp = new h2d.Bitmap(tile, s2d);

// Sub-tile for sprite sheets
var subTile = tile.sub(0, 0, 32, 32);   // x, y, width, height
```

### Loading Sounds

```haxe
// Play a sound effect (fire-and-forget)
hxd.Res.sfx.explosion.play();

// Play background music with volume control
var music = hxd.Res.music.theme.play(true);  // true = loop
music.volume = 0.5;
```

### Loading Fonts

```haxe
var font = hxd.Res.fonts.pixel.toFont();
var text = new h2d.Text(font, s2d);
text.text = "Score: 0";
```

### Loading Data Files

```haxe
// Parse JSON
var jsonStr = hxd.Res.data.config.toText();
var config = haxe.Json.parse(jsonStr);

// Raw bytes for custom formats
var bytes = hxd.Res.data.level1.entry.getBytes();
```

---

## Caching Behavior

The resource loader **caches** resource instances after first access. Subsequent calls to the same `hxd.Res` field return the cached instance without re-reading from disk or PAK:

```haxe
var a = hxd.Res.sprites.player.toTile();
var b = hxd.Res.sprites.player.toTile();
// a and b reference the same underlying Tile — no double-load
```

### Texture Sharing

When multiple `Tile` objects reference regions of the same image, they share one GPU texture. This is why sprite atlases are important — one texture bind serves many sprites:

```haxe
var atlas = hxd.Res.sprites.characters;
var playerTile = atlas.toTile().sub(0, 0, 32, 32);
var enemyTile  = atlas.toTile().sub(32, 0, 32, 32);
// Both tiles share one texture upload
```

### Disposing Cached Resources

For long-running games that load and unload levels, you may want to free cached textures:

```haxe
// Dispose a specific resource's cached data
hxd.Res.sprites.level1_bg.entry.dispose();

// Or work at the loader level to clear all caches
@:privateAccess hxd.Res.loader.cache.clear();
```

---

## The PAK Packaging System

For production builds, the PAK filesystem bundles all resources into one or more binary files for faster loading and simpler distribution.

### Building a PAK File

Use the built-in PAK builder from the command line:

```bash
# From your project root — packages res/ into res.pak
haxelib run heaps pak res/
```

Or invoke it programmatically in a build script:

```haxe
class PackResources {
    static function main() {
        var pak = new hxd.fmt.pak.Build();
        pak.make("res/", "res.pak");
    }
}
```

### PAK vs. Embed vs. Local

| Feature | LocalFileSystem | EmbedFileSystem | PAK FileSystem |
|---------|----------------|-----------------|----------------|
| Hot-reload | Yes | No | No |
| Binary size | Small (no assets) | Large (all embedded) | Small + separate .pak |
| Load speed | Disk I/O per file | Instant (in memory) | Fast sequential reads |
| Distribution | Ship res/ folder | Single executable | Executable + .pak |
| Best for | Development | Game jams, tiny games | Production releases |

### Multi-PAK for DLC or Streaming

You can create multiple PAK files and layer them:

```haxe
var fs = new hxd.fmt.pak.FileSystem();
fs.loadPak("res.pak");          // Base game assets
fs.loadPak("dlc1.pak");         // DLC overrides or adds files
hxd.Res.loader = new hxd.res.Loader(fs);
```

Files in later PAKs override files with the same path in earlier PAKs — useful for DLC, patches, or mod support.

---

## Hot-Reloading in Development

When using `LocalFileSystem` on HashLink or native targets, Heaps watches the `res/` directory for changes. Modified assets reload automatically:

```haxe
// In your update loop, Heaps checks for file changes automatically
// No code needed — just save the file and it appears in-game
```

This works for images, sounds, fonts, and data files. Shaders and models may require a manual refresh depending on how they're cached.

For JavaScript/HTML5 targets, hot-reload is not supported — you must refresh the browser page.

---

## Best Practices

1. **Use `hxd.Res` for everything.** Avoid string-based asset loading. The macro system catches missing files at compile time, saving hours of debugging.

2. **Use atlases for sprites.** Pack related sprites into one texture atlas. This reduces GPU texture binds and improves batch rendering. Tools like TexturePacker or free-tex-packer export in formats Heaps understands.

3. **Initialize the loader early.** Call `hxd.Res.initLocal()` (or `initPak()`) in your `App.init()` before any other resource access. Accessing `hxd.Res` fields before initialization throws a runtime error.

4. **Switch loaders by target.** Use `LocalFileSystem` during development and `PAK` for release builds. A common pattern:

   ```haxe
   #if debug
   hxd.Res.initLocal();
   #else
   hxd.Res.initPak();
   #end
   ```

5. **Dispose when unloading levels.** For games with distinct levels or scenes, dispose of textures and sounds from the previous level to free GPU and audio memory.

6. **Keep `res/` organized.** Use subdirectories (`sprites/`, `sfx/`, `music/`, `data/`, `fonts/`) — they map directly to `hxd.Res` namespaces and keep the macro-generated API clean.
