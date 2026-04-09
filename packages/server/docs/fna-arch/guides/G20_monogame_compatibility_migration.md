# G20 — MonoGame Compatibility & Migration

> **Category:** guide · **Engine:** FNA · **Related:** [FNA Architecture Rules](../fna-arch-rules.md) · [G01 Getting Started](./G01_getting_started.md) · [G07 Shader Compilation FXC](./G07_shader_compilation_fxc.md) · [G06 Content Loading Without Pipeline](./G06_content_loading_without_pipeline.md)

Comprehensive guide to porting between FNA and MonoGame. Covers API compatibility, content format differences, build system migration, and a step-by-step checklist for moving a project in either direction. Includes common pitfalls and compatibility shims.

---

## Why Two XNA Successors Exist

FNA and MonoGame both descend from XNA 4.0, but with different goals:

| | FNA | MonoGame |
|---|---|---|
| **Goal** | Reproduce XNA *exactly* | Extend XNA for modern platforms |
| **API stability** | Frozen to XNA 4.0 Refresh | Evolves with community patches |
| **Platform detection** | Runtime (single binary) | Compile-time (per-platform projects) |
| **Content pipeline** | None (uses MGCB or raw loading) | MGCB Editor (integrated tool) |
| **Distribution** | Git submodule + source reference | NuGet packages |
| **Console support** | PS5 supported; NativeAOT-based | Xbox Series X|S (in-progress), Switch |

Most XNA-compatible code compiles against both. The differences are in content formats, build configuration, and platform-specific features.

## API Compatibility Matrix

### Fully Compatible (No Changes Needed)

These namespaces and classes work identically:

- `Microsoft.Xna.Framework.Game` — lifecycle, timing, services
- `Microsoft.Xna.Framework.Graphics` — SpriteBatch, Texture2D, RenderTarget2D, BlendState, etc.
- `Microsoft.Xna.Framework.Input` — Keyboard, Mouse, GamePad
- `Microsoft.Xna.Framework.Audio` — SoundEffect, SoundEffectInstance
- `Microsoft.Xna.Framework.Content` — ContentManager (with format caveats below)
- `Microsoft.Xna.Framework.MathHelper`, Vector2/3/4, Matrix, Quaternion, BoundingBox, etc.

### Incompatible Areas

| Feature | FNA Behavior | MonoGame Behavior | Migration Action |
|---------|-------------|-------------------|-----------------|
| **Effect/shader format** | DXBC via FXC compiler (universal) | MGFX format (platform-specific) | Recompile from `.fx` source |
| **Audio format** | Ogg Vorbis / QOA standardized | Varies by platform (MP3, WAV, Ogg) | Convert to Ogg Vorbis |
| **Video format** | Ogg Theora via Theorafile | Varies by platform | Convert to Ogg Theora |
| **Song class** | Backed by Ogg Vorbis | Platform-specific (MP3 on some) | Re-encode audio files |
| **Platform defines** | None — runtime detection | `DESKTOPGL`, `WINDOWS`, etc. | Remove `#if` platform guards |
| **NuGet packages** | Not used | Primary distribution method | Switch to project reference |

### MonoGame-Extended and Third-Party Libraries

Libraries built against MonoGame (like MonoGame.Extended, Nez, MLEM) may or may not work with FNA:

- **MLEM** explicitly supports both FNA and MonoGame
- **MonoGame.Extended** targets MonoGame NuGet packages — requires recompilation against FNA
- **Nez** has FNA support via a separate project configuration

Check each library's documentation for FNA compatibility before migrating.

## Content Format Migration

### Shaders (Critical — Not Interchangeable)

FNA and MonoGame use fundamentally different compiled shader formats:

**FNA:** Compile `.fx` files with Microsoft's FXC compiler. One DXBC binary works on every platform and graphics backend.

```bash
# Compile an effect for FNA using FXC
fxc /T fx_2_0 /Fo MyEffect.fxb MyEffect.fx
```

**MonoGame:** Uses MGCB to produce MGFX format files, which are platform-specific.

When migrating, you must recompile from `.fx` source — you cannot convert compiled binaries between formats.

### Audio Migration

Convert all audio to Ogg Vorbis for FNA:

```bash
# Convert WAV to Ogg Vorbis using ffmpeg
ffmpeg -i sound.wav -c:a libvorbis -q:a 4 sound.ogg

# Convert MP3 to Ogg Vorbis
ffmpeg -i music.mp3 -c:a libvorbis -q:a 6 music.ogg
```

For `SoundEffect`, FNA also supports WAV natively. Ogg Vorbis is required for `Song`/`MediaPlayer`.

### Video Migration

Convert video to Ogg Theora:

```bash
ffmpeg -i video.mp4 -c:v libtheora -q:v 7 -c:a libvorbis -q:a 5 video.ogv
```

### Textures and Other Content

PNG, BMP, and GIF textures work identically in both. `.xnb` content files compiled with MGCB using the DesktopGL profile are generally compatible with FNA, with the exception of effects (shaders).

## MonoGame to FNA: Step-by-Step

### 1. Set Up FNA Submodule

```bash
git submodule add https://github.com/FNA-XNA/FNA.git lib/FNA
git submodule update --init --recursive
```

### 2. Replace NuGet References

Remove MonoGame NuGet packages from your `.csproj`:

```xml
<!-- Remove these -->
<PackageReference Include="MonoGame.Framework.DesktopGL" />
<PackageReference Include="MonoGame.Content.Builder.Task" />

<!-- Add this -->
<ProjectReference Include="lib/FNA/FNA.Core.csproj" />
```

### 3. Download fnalibs

```bash
# Download prebuilt native libraries
# Check https://github.com/FNA-XNA/fnalibs-dailies for latest
# Place in your output directory or a lib/fnalibs/ folder
```

### 4. Recompile Shaders

Compile every `.fx` file with FXC (see [G07 Shader Compilation](./G07_shader_compilation_fxc.md)):

```bash
fxc /T fx_2_0 /Fo Content/Effects/MyShader.fxb Content/Effects/MyShader.fx
```

### 5. Convert Media Files

```bash
# Audio: convert to Ogg Vorbis
for f in Content/Audio/*.mp3; do
  ffmpeg -i "$f" -c:a libvorbis -q:a 5 "${f%.mp3}.ogg"
done

# Video: convert to Ogg Theora
for f in Content/Video/*.mp4; do
  ffmpeg -i "$f" -c:v libtheora -q:v 7 -c:a libvorbis "${f%.mp4}.ogv"
done
```

### 6. Remove Platform Defines

FNA does not use compile-time platform detection. Remove or refactor:

```csharp
// Before (MonoGame)
#if DESKTOPGL
    // Linux/macOS specific code
#elif WINDOWS
    // Windows specific code
#endif

// After (FNA) — use runtime detection
if (SDL3.SDL.SDL_GetPlatform() == "Linux")
{
    // Linux specific code
}
```

### 7. Remove MonoGame-Specific API Calls

Search your codebase for APIs that exist in MonoGame but not XNA/FNA:

- `GameWindow.TextInput` event — use `SDL3.SDL_StartTextInput()` instead
- `GraphicsDevice.Adapter.CurrentDisplayMode` quirks — behavior may differ
- Any `MonoGame.Framework` extension methods

### 8. Configure Content Loading

If you were using MGCB Content Pipeline, you have two options:

1. **Keep using MGCB** — build with DesktopGL profile, but recompile effects separately with FXC
2. **Switch to raw loading** — use `Texture2D.FromStream()`, `SoundEffect.FromStream()`, etc. (see [G06 Content Loading](./G06_content_loading_without_pipeline.md))

### 9. Test Thoroughly

FNA's XNA-accuracy may expose bugs that MonoGame's divergences masked:

- Fixed-point timing differences in `GameTime`
- Stricter graphics state validation
- Different default blend/depth/rasterizer states in edge cases

## FNA to MonoGame: Step-by-Step

Moving from FNA to MonoGame is less common but sometimes needed for mobile/console targets:

1. Replace FNA project reference with MonoGame NuGet packages
2. Recompile shaders using MGCB (produces MGFX format)
3. Set up MGCB content pipeline for asset processing
4. Add platform defines if targeting multiple platforms
5. Convert any direct SDL P/Invoke calls to MonoGame equivalents
6. Remove fnalibs — MonoGame bundles its own native dependencies
7. Test on each target platform (MonoGame behavior varies more across platforms)

## Compatibility Shim for Dual-Target Projects

If you need to support both FNA and MonoGame from a single codebase:

```csharp
// Define FNA in your .csproj when building against FNA
// <DefineConstants>FNA</DefineConstants>

public static class PlatformBridge
{
    public static string GetPlatformName()
    {
#if FNA
        return SDL3.SDL.SDL_GetPlatform();
#else
        // MonoGame doesn't expose this directly
        return Environment.OSVersion.Platform.ToString();
#endif
    }

    public static void SetVSync(GraphicsDeviceManager gdm, bool enabled)
    {
        // Works the same on both
        gdm.SynchronizeWithVerticalRetrace = enabled;
    }
}
```

For shaders, maintain `.fx` source files and compile to both formats in your build script:

```bash
# Build for FNA
fxc /T fx_2_0 /Fo bin/fna/MyShader.fxb MyShader.fx

# Build for MonoGame
dotnet mgcb /importer:EffectImporter /processor:EffectProcessor /build:MyShader.fx
```

## Common Migration Pitfalls

**"Effect compilation failed"** — You're trying to load an MGFX effect in FNA or vice versa. Recompile from `.fx` source.

**Missing native libraries at runtime** — FNA requires fnalibs in the executable directory. Check that SDL3, FNA3D, FAudio, and Theorafile binaries are present.

**Audio won't play** — FNA requires Ogg Vorbis for Songs. MP3 files that worked in MonoGame will fail silently or throw.

**`#if DESKTOPGL` blocks skipped** — FNA doesn't define platform constants. Use runtime detection or define `FNA` manually.

**Texture loading differences** — FNA's `Texture2D.FromStream` is strict about image format support. Stick to PNG for maximum compatibility.

**NuGet restore fails** — FNA is not distributed via NuGet. Remove all MonoGame package references and use a project reference to the FNA source.
