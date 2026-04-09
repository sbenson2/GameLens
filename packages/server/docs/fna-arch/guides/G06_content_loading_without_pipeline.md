# G06 — Content Loading Without the Pipeline

> **Category:** Guide · **Engine:** FNA · **Related:** [G01 Getting Started](./G01_getting_started.md) · [FNA Architecture Rules](../fna-arch-rules.md) · [G02 NativeAOT Publishing](./G02_nativeaot_publishing.md)

FNA preserves XNA's `ContentManager` API but extends it to load raw asset files directly — no `.xnb` compilation step required. FNA's maintainer explicitly recommends against using the XNA content pipeline for new projects. This guide covers every approach to loading textures, audio, fonts, video, and effects in FNA, with raw formats as the primary path and XNB/MGCB as a fallback for legacy projects.

---

## Table of Contents

1. [Why Skip the Content Pipeline?](#1--why-skip-the-content-pipeline)
2. [Raw Format Support via ContentManager](#2--raw-format-support-via-contentmanager)
3. [Loading Textures](#3--loading-textures)
4. [Loading Audio](#4--loading-audio)
5. [Loading Fonts](#5--loading-fonts)
6. [Loading Video](#6--loading-video)
7. [Loading Effects (Shaders)](#7--loading-effects-shaders)
8. [Stream-Based Loading](#8--stream-based-loading)
9. [Custom Content Managers](#9--custom-content-managers)
10. [Using MGCB as a Fallback](#10--using-mgcb-as-a-fallback)
11. [Asset Hot-Reloading](#11--asset-hot-reloading)
12. [Third-Party Asset Libraries](#12--third-party-asset-libraries)
13. [Performance Considerations](#13--performance-considerations)
14. [Common Pitfalls](#14--common-pitfalls)

---

## 1 — Why Skip the Content Pipeline?

The XNA content pipeline was designed for Xbox 360 deployment where assets needed platform-specific compilation. On modern desktop platforms (Windows, Linux, macOS), that compilation step adds complexity with little benefit:

- **Build friction:** Content pipeline projects require MSBuild tooling, importer/processor registration, and a separate build step.
- **Format lock-in:** `.xnb` files are opaque binaries. Raw formats (PNG, OGG, WAV) can be opened in any editor.
- **Iteration speed:** Changing a texture means editing the PNG and restarting — no recompile step.
- **Portability:** Raw formats work identically across all FNA-supported platforms.

FNA's `Content.Load<T>()` accepts raw files alongside XNB. You get the same API surface with simpler assets.

## 2 — Raw Format Support via ContentManager

FNA extends `ContentManager.Load<T>()` to detect and load raw formats by file extension. Place assets in your `Content/` directory and call `Content.Load<T>("path")` — FNA resolves the format automatically.

### Supported Raw Formats

| Type | Supported Formats | Notes |
|------|-------------------|-------|
| `Texture2D` | BMP, GIF, JPEG, PNG, TGA, TIFF, DDS, QOI | PNG recommended for general use; DDS for GPU-compressed textures |
| `TextureCube` | DDS | Must be a DDS file with cubemap faces |
| `SoundEffect` | WAV | Standard PCM WAV files |
| `Song` | OGG/OGA, QOA | OGG Vorbis recommended; QOA for low-overhead decoding |
| `Video` | OGG/OGV | Ogg Theora via Theorafile |
| `Effect` | FXB | FNA's compiled effect format (from FXC/dxbc) |

### Example: Loading Raw Assets

```csharp
public class Game1 : Game
{
    private Texture2D playerSprite;
    private SoundEffect jumpSound;
    private Song backgroundMusic;

    protected override void LoadContent()
    {
        // Load a PNG texture — no .xnb needed
        playerSprite = Content.Load<Texture2D>("Sprites/player");
        // FNA looks for Content/Sprites/player.png (or .bmp, .jpg, etc.)

        // Load a WAV sound effect
        jumpSound = Content.Load<SoundEffect>("Audio/jump");

        // Load an OGG music track
        backgroundMusic = Content.Load<Song>("Music/theme");
    }
}
```

FNA searches for the asset name with known extensions in order. If `Content/Sprites/player.png` exists, it loads the PNG. If `Content/Sprites/player.xnb` exists instead, it loads the XNB. Raw formats take priority over XNB when both exist.

## 3 — Loading Textures

### Via ContentManager (Recommended)

```csharp
// ContentManager handles caching — same texture loaded twice returns the same object
Texture2D tex = Content.Load<Texture2D>("Textures/tileset");
```

### Via Texture2D.FromStream (Manual Control)

Use `FromStream` when you need to load from an arbitrary stream (e.g., downloaded data, embedded resources, archives):

```csharp
using (var stream = File.OpenRead("Content/Textures/tileset.png"))
{
    Texture2D tex = Texture2D.FromStream(GraphicsDevice, stream);
}
```

**Important:** `FromStream` bypasses `ContentManager` caching. Each call creates a new GPU texture. You are responsible for calling `Dispose()` when done.

### FNA Extension: TextureDataFromStreamEXT

When you need raw pixel data without creating a GPU texture (e.g., for CPU-side collision maps or preprocessing):

```csharp
using (var stream = File.OpenRead("Content/Textures/collision_mask.png"))
{
    Texture2D.TextureDataFromStreamEXT(
        stream,
        out int width,
        out int height,
        out byte[] pixels
    );
    // pixels is RGBA byte array — use for CPU-side processing
    // No GPU texture created, no Dispose needed
}
```

### FNA Extension: DDSFromStreamEXT

Load DDS files (including compressed formats like DXT1/DXT5 and cubemaps) directly:

```csharp
using (var stream = File.OpenRead("Content/Textures/skybox.dds"))
{
    Texture tex = Texture2D.DDSFromStreamEXT(GraphicsDevice, stream);
    // Returns Texture2D or TextureCube depending on DDS contents
}
```

### Texture Format Utilities

```csharp
// Get byte size of a single pixel in a given format
int bytesPerPixel = Texture2D.GetFormatSizeEXT(SurfaceFormat.Color); // 4

// Get the block size for compressed formats (DXT1, DXT5, etc.)
int blockSize = Texture2D.GetBlockSizeSquaredEXT(SurfaceFormat.Dxt1); // 8
```

## 4 — Loading Audio

### Sound Effects (Short Clips)

```csharp
// Via ContentManager — loads WAV
SoundEffect sfx = Content.Load<SoundEffect>("Audio/explosion");
sfx.Play(); // Fire-and-forget
sfx.Play(volume: 0.5f, pitch: 0.0f, pan: 0.0f); // With parameters

// Via stream
using (var stream = File.OpenRead("Content/Audio/explosion.wav"))
{
    SoundEffect sfx = SoundEffect.FromStream(stream);
}
```

### Music (Streaming Playback)

```csharp
// Load OGG Vorbis music via ContentManager
Song music = Content.Load<Song>("Music/battle_theme");
MediaPlayer.Play(music);
MediaPlayer.IsRepeating = true;
MediaPlayer.Volume = 0.7f;
```

### FNA Extension: DynamicSoundEffectInstance with Float Buffers

For procedural audio or audio processing, FNA adds float buffer support:

```csharp
var dynamicSound = new DynamicSoundEffectInstance(
    sampleRate: 44100,
    channels: AudioChannels.Stereo
);

float[] buffer = GenerateAudioSamples(); // Your audio generation code
dynamicSound.SubmitFloatBufferEXT(buffer); // FNA extension — no int16 conversion needed
dynamicSound.Play();
```

### QOA Format

QOA (Quite OK Audio) is a lightweight lossy audio format supported by FNA for `Song` playback. It offers very fast decoding with reasonable quality — useful when OGG Vorbis decoding overhead is a concern (e.g., NativeAOT builds where Vorbis decoder size matters).

## 5 — Loading Fonts

FNA supports the standard XNA `SpriteFont` system via `.xnb` files, but there is no built-in TrueType/OpenType font renderer. Options for text rendering:

### Option A: SpriteFont via MGCB (XNA-Compatible)

Build `.spritefont` XML files with the MonoGame Content Builder:

```xml
<!-- Content/Fonts/GameFont.spritefont -->
<?xml version="1.0" encoding="utf-8"?>
<XnaContent xmlns:Graphics="Microsoft.Xna.Framework.Content.Pipeline.Graphics">
  <Asset Type="Graphics:FontDescription">
    <FontName>Arial</FontName>
    <Size>16</Size>
    <Spacing>0</Spacing>
    <Style>Regular</Style>
    <CharacterRegions>
      <CharacterRegion>
        <Start>&#32;</Start>
        <End>&#126;</End>
      </CharacterRegion>
    </CharacterRegions>
  </Asset>
</XnaContent>
```

```bash
dotnet mgcb Content/Content.mgcb /platform:DesktopGL
```

```csharp
SpriteFont font = Content.Load<SpriteFont>("Fonts/GameFont");
spriteBatch.DrawString(font, "Hello FNA!", new Vector2(10, 10), Color.White);
```

### Option B: BMFont (Bitmap Font)

Tools like BMFont, Hiero, or msdfgen generate bitmap font atlases. Load the atlas texture and parse the `.fnt` descriptor file yourself, or use a library:

```csharp
// Pseudocode — actual implementation depends on your BMFont parser
var font = BitmapFont.Load("Content/Fonts/GameFont.fnt", GraphicsDevice);
font.Draw(spriteBatch, "Hello FNA!", new Vector2(10, 10), Color.White);
```

### Option C: TrueType Libraries

Several commercial FNA games (Reus, SpeedRunners, Owlboy) use TrueType fonts at runtime. Libraries like **FontStashSharp** or **SpriteFontPlus** provide FNA-compatible TrueType rendering:

```csharp
// FontStashSharp example
var fontSystem = new FontSystem();
fontSystem.AddFont(File.ReadAllBytes("Content/Fonts/Roboto.ttf"));
SpriteFontBase font = fontSystem.GetFont(24); // 24pt
font.DrawText(spriteBatch, "Hello FNA!", new Vector2(10, 10), FSColor.White);
```

FontStashSharp rasterizes glyphs on demand and caches them in a texture atlas, supporting dynamic font sizes without rebuilding content.

## 6 — Loading Video

FNA uses Theorafile for Ogg Theora video playback:

```csharp
Video video = Content.Load<Video>("Video/intro");
// Or use the FNA extension for URI-based loading:
Video video = Video.FromUriEXT("Content/Video/intro.ogv");

var videoPlayer = new VideoPlayer();
videoPlayer.Play(video);

// In Draw():
Texture2D frame = videoPlayer.GetTexture();
if (frame != null)
{
    spriteBatch.Draw(frame, destinationRect, Color.White);
}
```

### FNA Video Extensions

```csharp
// Select audio/video tracks in multi-track OGV files
videoPlayer.SetAudioTrackEXT(0); // First audio track
videoPlayer.SetVideoTrackEXT(0); // First video track
```

## 7 — Loading Effects (Shaders)

FNA uses standard DXBC (DirectX Bytecode) compiled effects, not MonoGame's MGFX format. This is the biggest incompatibility between the two frameworks.

### Compiling Shaders

Use Microsoft's FXC compiler (included in the Windows SDK) or the `fxc` tool:

```bash
# Compile an HLSL effect to FXB format
fxc /T fx_2_0 /Fo Content/Effects/MyShader.fxb Content/Effects/MyShader.fx
```

For cross-platform shader compilation, use **MojoShader** (which FNA uses internally) or build shaders on Windows and distribute the compiled `.fxb` files.

### Loading Effects

```csharp
Effect shader = Content.Load<Effect>("Effects/MyShader");
shader.Parameters["Tint"].SetValue(Color.Red.ToVector4());
```

### Critical Difference from MonoGame

| | FNA | MonoGame |
|---|---|---|
| Shader source | `.fx` (HLSL) | `.fx` (HLSL) |
| Compiled format | `.fxb` (DXBC via FXC) | `.mgfxo` (MGFX via mgfxc) |
| Shader model | SM 2.0–5.0 (via FXC) | SM 2.0–5.0 (via MGFX) |
| Cross-compile | MojoShader translates DXBC → GLSL/SPIR-V at runtime | MGFX compiles per-platform at build time |

**You cannot use MonoGame-compiled `.mgfxo` shaders with FNA, or vice versa.** Always compile from `.fx` source for each target.

## 8 — Stream-Based Loading

For advanced scenarios (loading from ZIP archives, network streams, embedded resources), use stream-based APIs:

```csharp
// Load from a ZIP archive
using (var archive = ZipFile.OpenRead("Content/pack.zip"))
{
    var entry = archive.GetEntry("Textures/player.png");
    using (var stream = entry.Open())
    {
        playerTexture = Texture2D.FromStream(GraphicsDevice, stream);
    }
}

// Load from embedded resource
var assembly = Assembly.GetExecutingAssembly();
using (var stream = assembly.GetManifestResourceStream("MyGame.Content.logo.png"))
{
    logoTexture = Texture2D.FromStream(GraphicsDevice, stream);
}
```

## 9 — Custom Content Managers

Extend `ContentManager` for project-specific loading logic:

```csharp
public class GameContentManager : ContentManager
{
    public GameContentManager(IServiceProvider services, string rootDirectory)
        : base(services, rootDirectory) { }

    // Override to add custom logging, fallback paths, or mod support
    public override T Load<T>(string assetName)
    {
        // Check mod directory first
        string modPath = Path.Combine("Mods", assetName);
        if (File.Exists(ResolveAssetPath(modPath)))
        {
            return base.Load<T>(modPath);
        }
        return base.Load<T>(assetName);
    }

    private string ResolveAssetPath(string name)
    {
        // Check common extensions
        string[] extensions = { ".png", ".wav", ".ogg", ".fxb" };
        foreach (var ext in extensions)
        {
            string path = Path.Combine(RootDirectory, name + ext);
            if (File.Exists(path)) return path;
        }
        return Path.Combine(RootDirectory, name);
    }
}
```

## 10 — Using MGCB as a Fallback

If you need the content pipeline (e.g., for SpriteFont compilation or model processing), use MonoGame's MGCB tool at build time without depending on MonoGame at runtime:

```bash
# Install MGCB tool
dotnet tool install -g dotnet-mgcb

# Build content targeting DesktopGL (FNA-compatible profile)
dotnet mgcb Content/Content.mgcb /platform:DesktopGL
```

The resulting `.xnb` files are compatible with FNA's `ContentManager`. This is the recommended approach for SpriteFonts and 3D model processing, where raw loading is not practical.

**Important:** MGCB-compiled shaders (`.mgfxo`) are NOT compatible with FNA. Only use MGCB for non-shader content.

## 11 — Asset Hot-Reloading

FNA does not include built-in hot-reload, but raw asset loading makes it straightforward to implement:

```csharp
public class HotReloadableTexture
{
    private Texture2D texture;
    private readonly string filePath;
    private readonly GraphicsDevice device;
    private DateTime lastModified;

    public HotReloadableTexture(GraphicsDevice device, string filePath)
    {
        this.device = device;
        this.filePath = filePath;
        Reload();
    }

    public Texture2D Texture => texture;

    public void CheckForChanges()
    {
        var currentModified = File.GetLastWriteTime(filePath);
        if (currentModified > lastModified)
        {
            Reload();
        }
    }

    private void Reload()
    {
        texture?.Dispose();
        using (var stream = File.OpenRead(filePath))
        {
            texture = Texture2D.FromStream(device, stream);
        }
        lastModified = File.GetLastWriteTime(filePath);
    }
}
```

Call `CheckForChanges()` periodically during development (e.g., every 60 frames). Disable in release builds to avoid filesystem overhead.

## 12 — Third-Party Asset Libraries

| Library | Purpose | FNA Compatible |
|---------|---------|----------------|
| **FontStashSharp** | Runtime TrueType/OpenType font rendering | Yes |
| **XNAssets** | Alternative content manager, loads raw assets | Yes |
| **TiledCS** / **TiledLib** | Tiled map editor `.tmx` / `.tmj` loader | Yes |
| **Aseprite.NET** | Load Aseprite `.ase` / `.aseprite` files directly | Yes |
| **LDtkMonogame** | LDtk level editor loader | Yes (shared XNA API) |
| **Nez** | Framework with built-in content management, atlas packing | Yes |

## 13 — Performance Considerations

- **PNG decoding is CPU-bound.** For large texture atlases (4096×4096+), consider DDS with GPU compression (DXT1 for opaque, DXT5 for alpha). DDS uploads directly to the GPU without CPU decompression.
- **ContentManager caches by asset name.** Calling `Content.Load<Texture2D>("player")` twice returns the same object. No duplicate GPU memory.
- **FromStream does NOT cache.** Every call allocates a new GPU texture. Use it for dynamic/temporary assets, not for assets loaded every frame.
- **QOA decodes faster than OGG Vorbis** but has lower compression ratio. Use QOA for sound effects or low-latency audio; OGG for music where file size matters.
- **Dispose unused assets.** Call `Content.Unload()` to release all cached assets, or `texture.Dispose()` for individual stream-loaded assets. GPU memory leaks are a common issue in XNA/FNA games.

## 14 — Common Pitfalls

### Pitfall 1: Missing fnalibs at Runtime

**Problem:** `DllNotFoundException` when loading textures or audio.
**Solution:** Ensure fnalibs (SDL2, FNA3D, FAudio) are in the output directory. FNA needs native libraries for all asset decoding — they are not optional.

### Pitfall 2: Using MGFX Shaders with FNA

**Problem:** `ContentLoadException` when loading `.mgfxo` shader files.
**Solution:** FNA requires `.fxb` (DXBC) shaders compiled with FXC. Recompile from `.fx` source using `fxc`, not `mgfxc`.

### Pitfall 3: ContentManager Path Resolution

**Problem:** `FileNotFoundException` even though the file exists.
**Solution:** `Content.Load<T>()` resolves paths relative to `Content.RootDirectory` (default: `"Content"`). Do not include the extension — FNA appends it automatically. Use forward slashes for cross-platform paths: `"Sprites/player"`, not `"Sprites\\player"`.

### Pitfall 4: SpriteFont Without Content Pipeline

**Problem:** No raw format exists for SpriteFonts — `Content.Load<SpriteFont>()` requires `.xnb` files.
**Solution:** Either use MGCB to compile `.spritefont` → `.xnb`, or switch to a TrueType library like FontStashSharp for runtime font rendering.

### Pitfall 5: Texture Premultiplication

**Problem:** Sprites have dark edges or incorrect blending.
**Solution:** XNA's content pipeline premultiplies alpha during compilation. Raw PNG loading does NOT premultiply. Either premultiply manually after loading, use `BlendState.NonPremultiplied` instead of `BlendState.AlphaBlend`, or premultiply in your art tool on export.

```csharp
// Option A: Use non-premultiplied blend state
spriteBatch.Begin(blendState: BlendState.NonPremultiplied);

// Option B: Premultiply after loading
Color[] data = new Color[texture.Width * texture.Height];
texture.GetData(data);
for (int i = 0; i < data.Length; i++)
{
    data[i] = Color.FromNonPremultiplied(
        data[i].R, data[i].G, data[i].B, data[i].A
    );
}
texture.SetData(data);
```
