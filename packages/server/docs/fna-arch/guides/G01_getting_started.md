# G01 — Getting Started with FNA

> **Category:** Guide · **Engine:** FNA · **Related:** [FNA Architecture Rules](../fna-arch-rules.md)

A step-by-step guide to creating your first FNA project from scratch. Covers environment setup, FNA submodule integration, fnalibs configuration, content loading, and running a minimal game loop. If you're coming from MonoGame or XNA, this guide highlights the key differences in project setup.

---

## Table of Contents

1. [Prerequisites](#1--prerequisites)
2. [Project Setup](#2--project-setup)
3. [Adding FNA as a Submodule](#3--adding-fna-as-a-submodule)
4. [Downloading fnalibs](#4--downloading-fnalibs)
5. [Project File Configuration](#5--project-file-configuration)
6. [Your First Game Class](#6--your-first-game-class)
7. [Loading Content](#7--loading-content)
8. [Running and Debugging](#8--running-and-debugging)
9. [Platform-Specific Notes](#9--platform-specific-notes)
10. [Common Setup Issues](#10--common-setup-issues)

---

## 1 — Prerequisites

You need a .NET SDK and a C# editor. FNA itself is framework-level C# — no special tooling required.

| Tool | Version | Notes |
|------|---------|-------|
| .NET SDK | 8.0+ | LTS recommended; .NET 9 also works |
| Git | 2.x+ | Required for submodule management |
| C# Editor | Any | VS Code, Rider, or Visual Studio |
| CMake | 3.x+ | Only needed if building fnalibs from source |

**No NuGet packages.** Unlike MonoGame, FNA is included as source via a Git submodule. This is intentional — it ensures you always build against a known FNA commit, making builds reproducible across platforms.

---

## 2 — Project Setup

Create a new directory and initialize it:

```bash
mkdir MyFNAGame
cd MyFNAGame
git init
dotnet new sln -n MyFNAGame
dotnet new console -n MyFNAGame -o src/MyFNAGame
```

Your directory should look like this:

```
MyFNAGame/
├── MyFNAGame.sln
└── src/
    └── MyFNAGame/
        ├── MyFNAGame.csproj
        └── Program.cs
```

---

## 3 — Adding FNA as a Submodule

FNA is included as a Git submodule, not a NuGet package. This is the standard approach for all FNA projects:

```bash
# Add FNA as a submodule in a lib/ directory
git submodule add https://github.com/FNA-XNA/FNA.git lib/FNA

# Add the FNA project to your solution
dotnet sln add lib/FNA/FNA.csproj
dotnet sln add src/MyFNAGame/MyFNAGame.csproj
```

**Why a submodule?** FNA releases monthly (on the 1st). Pinning to a submodule commit means you control exactly when you upgrade, and the entire team builds against the same FNA revision.

### Updating FNA

When you want to pull the latest FNA version:

```bash
cd lib/FNA
git pull origin main
cd ../..
git add lib/FNA
git commit -m "Update FNA to latest"
```

The FNA team recommends updating at least once a month to stay current with bug fixes and platform improvements.

---

## 4 — Downloading fnalibs

FNA depends on native libraries (called "fnalibs") for graphics, audio, input, and video. These are precompiled binaries that must be present at runtime.

### Required Libraries

| Library | Purpose | Required? |
|---------|---------|-----------|
| SDL2 | Window management, input, platform layer | Always |
| FNA3D | Graphics rendering (OpenGL, Vulkan, Metal, D3D11) | If using Graphics namespace |
| FAudio | Audio playback (XAudio2 reimplementation) | If using Audio/Media namespaces |
| Theorafile | Ogg Theora video playback | If using VideoPlayer |

### Download Prebuilt Binaries

The easiest approach is to download prebuilt binaries from the fnalibs-dailies repository:

```bash
# Create the fnalibs directory
mkdir -p lib/fnalibs

# Download for your platform (example for Linux x64)
# Check https://github.com/FNA-XNA/fnalibs-dailies for current URLs
# Extract into lib/fnalibs/
```

Organize the native libraries by platform:

```
lib/
├── FNA/                  # FNA source (submodule)
└── fnalibs/
    ├── lib64/            # Linux x64 (.so files)
    ├── osx/              # macOS universal (.dylib files)
    └── x64/              # Windows x64 (.dll files)
```

### Copy to Output on Build

Add a build target to copy the correct fnalibs to your output directory. In your `.csproj`:

```xml
<ItemGroup Condition="'$(RuntimeIdentifier)' == 'linux-x64' Or ('$(RuntimeIdentifier)' == '' And $([MSBuild]::IsOSPlatform('Linux')))">
    <Content Include="../../lib/fnalibs/lib64/*" CopyToOutputDirectory="PreserveNewest" Link="%(Filename)%(Extension)" />
</ItemGroup>
<ItemGroup Condition="'$(RuntimeIdentifier)' == 'osx-x64' Or '$(RuntimeIdentifier)' == 'osx-arm64' Or ('$(RuntimeIdentifier)' == '' And $([MSBuild]::IsOSPlatform('OSX')))">
    <Content Include="../../lib/fnalibs/osx/*" CopyToOutputDirectory="PreserveNewest" Link="%(Filename)%(Extension)" />
</ItemGroup>
<ItemGroup Condition="'$(RuntimeIdentifier)' == 'win-x64' Or ('$(RuntimeIdentifier)' == '' And $([MSBuild]::IsOSPlatform('Windows')))">
    <Content Include="../../lib/fnalibs/x64/*" CopyToOutputDirectory="PreserveNewest" Link="%(Filename)%(Extension)" />
</ItemGroup>
```

---

## 5 — Project File Configuration

Update `src/MyFNAGame/MyFNAGame.csproj` to reference FNA and configure output:

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <RootNamespace>MyFNAGame</RootNamespace>
    <AssemblyName>MyFNAGame</AssemblyName>
    <AllowUnsafeBlocks>true</AllowUnsafeBlocks>
  </PropertyGroup>

  <!-- Reference FNA as a project, not a NuGet package -->
  <ItemGroup>
    <ProjectReference Include="../../lib/FNA/FNA.csproj" />
  </ItemGroup>

  <!-- fnalibs copy targets (see Section 4) go here -->

  <!-- Content files (textures, audio, etc.) -->
  <ItemGroup>
    <Content Include="Content/**/*" CopyToOutputDirectory="PreserveNewest" Link="Content/%(RecursiveDir)%(Filename)%(Extension)" />
  </ItemGroup>

</Project>
```

**Note:** `AllowUnsafeBlocks` is required because FNA uses unsafe code for native interop with SDL2 and FNA3D.

---

## 6 — Your First Game Class

Replace the contents of `Program.cs` with a minimal FNA game:

```csharp
using System;
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using Microsoft.Xna.Framework.Input;

namespace MyFNAGame;

public class MyGame : Game
{
    private GraphicsDeviceManager _graphics;
    private SpriteBatch _spriteBatch;

    public MyGame()
    {
        _graphics = new GraphicsDeviceManager(this);
        _graphics.PreferredBackBufferWidth = 1280;
        _graphics.PreferredBackBufferHeight = 720;

        Content.RootDirectory = "Content";
        IsMouseVisible = true;
        Window.Title = "My FNA Game";
    }

    protected override void Initialize()
    {
        // Initialization logic runs once before LoadContent
        base.Initialize();
    }

    protected override void LoadContent()
    {
        _spriteBatch = new SpriteBatch(GraphicsDevice);
        // Load textures, sounds, fonts here
    }

    protected override void Update(GameTime gameTime)
    {
        // Exit on Escape
        if (Keyboard.GetState().IsKeyDown(Keys.Escape))
            Exit();

        base.Update(gameTime);
    }

    protected override void Draw(GameTime gameTime)
    {
        GraphicsDevice.Clear(Color.CornflowerBlue);

        _spriteBatch.Begin();
        // Draw sprites, text, etc.
        _spriteBatch.End();

        base.Draw(gameTime);
    }
}

public static class Program
{
    [STAThread]
    static void Main()
    {
        using var game = new MyGame();
        game.Run();
    }
}
```

**This code is identical to what you'd write in XNA or MonoGame.** That's the point — FNA's API surface is XNA 4.0 Refresh, so existing XNA knowledge transfers directly. The difference is what runs underneath: SDL2 for windowing/input, FNA3D for rendering, FAudio for audio.

---

## 7 — Loading Content

FNA does not ship its own content pipeline tool. You have three options:

### Option A: Raw Asset Loading (Simplest)

Load files directly without preprocessing. Best for getting started quickly:

```csharp
// In LoadContent():
// Load a PNG texture directly
using var stream = File.OpenRead("Content/player.png");
var playerTexture = Texture2D.FromStream(GraphicsDevice, stream);

// Load a WAV sound effect
var jumpSound = SoundEffect.FromStream(File.OpenRead("Content/jump.wav"));
```

Place raw assets in a `Content/` directory alongside your source:

```
src/MyFNAGame/
├── Content/
│   ├── player.png
│   ├── jump.wav
│   └── font.fnt
├── MyFNAGame.csproj
└── Program.cs
```

### Option B: MonoGame Content Builder (MGCB)

If you need `.xnb` compiled content (sprite fonts, processed audio, optimized textures), use MonoGame's MGCB tool with the DesktopGL platform profile:

```bash
# Install MGCB tool
dotnet tool install -g dotnet-mgcb

# Build content targeting DesktopGL (compatible with FNA)
dotnet mgcb Content/Content.mgcb /platform:DesktopGL
```

Then load with `Content.Load<T>()` as normal:

```csharp
var font = Content.Load<SpriteFont>("MyFont");
var texture = Content.Load<Texture2D>("player");
```

**Warning:** Shaders compiled by MGCB (`.mgfx` format) are **not compatible** with FNA. FNA uses standard DXBC shader binaries compiled with `fxc.exe` (the DirectX shader compiler). Textures, fonts, and audio built by MGCB work fine.

### Option C: Original XNA Content Pipeline

If you have access to the original XNA Game Studio tools, their `.xnb` output is directly compatible — this is what FNA was designed for.

---

## 8 — Running and Debugging

```bash
# Build and run
dotnet build MyFNAGame.sln
dotnet run --project src/MyFNAGame

# Or build in Release mode
dotnet run --project src/MyFNAGame -c Release
```

If the game launches and you see a cornflower blue window, your FNA setup is working.

### Environment Variables

FNA respects several environment variables for debugging:

```bash
# Force a specific graphics backend
FNA3D_FORCE_DRIVER=OpenGL dotnet run --project src/MyFNAGame
FNA3D_FORCE_DRIVER=Vulkan dotnet run --project src/MyFNAGame

# Enable FNA3D debug logging
FNA3D_LOGLEVEL=1 dotnet run --project src/MyFNAGame

# SDL video driver override (useful for Wayland issues on Linux)
SDL_VIDEODRIVER=x11 dotnet run --project src/MyFNAGame
```

---

## 9 — Platform-Specific Notes

### Windows

The simplest platform. fnalibs `.dll` files go next to the executable. FNA3D defaults to D3D11 on Windows but also supports Vulkan and OpenGL.

### Linux

Ensure fnalibs `.so` files are in the executable directory or on `LD_LIBRARY_PATH`. FNA3D defaults to Vulkan on Linux if available, falling back to OpenGL.

If using Wayland and encountering issues, set `SDL_VIDEODRIVER=x11` as a workaround.

### macOS

FNA3D uses Metal on macOS (via MoltenVK). Place `.dylib` files alongside the executable.

For Apple Silicon (M1/M2/M3/M4): use the universal fnalibs, which include both arm64 and x86_64 slices.

For distribution on macOS, you'll need to create an `.app` bundle. See FNA's Appendix C documentation for details on code signing and notarization.

---

## 10 — Common Setup Issues

### "DllNotFoundException: SDL2"

The native libraries aren't being found at runtime. Verify that the correct platform's fnalibs are in the build output directory (same folder as the game `.dll` or `.exe`).

### "Could not load file or assembly 'FNA'"

The FNA project reference is missing or broken. Check that `lib/FNA/FNA.csproj` exists (submodule may not be initialized):

```bash
git submodule update --init --recursive
```

### "Content not found" errors

Ensure your content files are being copied to the output directory. Check that the `<Content>` items in your `.csproj` have `CopyToOutputDirectory="PreserveNewest"` and that the `Content.RootDirectory` matches the actual folder name.

### Build errors in FNA source

FNA requires `AllowUnsafeBlocks` to be enabled. If you see errors about unsafe code, add `<AllowUnsafeBlocks>true</AllowUnsafeBlocks>` to your project's `<PropertyGroup>`.

### Shaders won't load

Remember: FNA uses DXBC shader binaries (compiled with `fxc.exe`), not MonoGame's `.mgfx` format. If you're porting from MonoGame, you need to recompile shaders from `.fx` source. Textures and audio content from MGCB are compatible; shaders are not.

---

## Next Steps

With your project running, explore these topics:

- **Input handling** — `Keyboard.GetState()`, `Mouse.GetState()`, `GamePad.GetState()` work identically to XNA
- **Audio** — `SoundEffect` and `Song` for playback; use Ogg Vorbis for best FNA compatibility
- **Porting from MonoGame** — See the FNA Architecture Rules for a migration checklist
- **NativeAOT publishing** — For optimized single-binary distribution: `dotnet publish -c Release -r linux-x64 /p:PublishAot=true`
