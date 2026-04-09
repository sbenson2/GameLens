# G1 — Getting Started with FNA

> **Category:** guide · **Engine:** FNA · **Related:** [FNA Rules](../fna-arch-rules.md) · [G2 SDL3 Platform Layer](./G2_sdl3_platform_layer.md) · [G3 MonoGame Migration](./G3_monogame_migration.md)

> Complete setup guide for FNA game projects. Covers prerequisites, project creation, native library setup, and your first running game window across Windows, macOS, and Linux.

---

## 1. Prerequisites

### .NET SDK

FNA supports multiple .NET targets. Choose one:

| Target | Project File | Recommended For |
|---|---|---|
| .NET 8 | `FNA.Core.csproj` | New projects |
| .NET Framework 4.0+ | `FNA.NetFramework.csproj` | Porting existing XNA/FNA games |
| .NET Standard 2.0 | `FNA.NetStandard.csproj` | Shared libraries |

Install the .NET 8 SDK from [dotnet.microsoft.com](https://dotnet.microsoft.com/download).

### Development Environment

**Recommended:** Visual Studio Code with the following extensions:
- C# Dev Kit
- Mono Debug (for .NET Framework targets)

**Also supported:** Visual Studio, JetBrains Rider, or any editor with .NET/C# support.

### Platform-Specific Setup

**Windows:**
```bash
# Enable case-sensitive filesystem on your project folder
# Required for cross-platform compatibility with Linux/console builds
fsutil.exe file SetCaseSensitiveInfo MyGame enable
```

**Linux (Flatpak-based):**
```bash
# Install VSCode, Mono, and .NET 8 in one command
flatpak install com.visualstudio.code \
  org.freedesktop.Sdk.Extension.mono6 \
  org.freedesktop.Sdk.Extension.dotnet8

# Expose SDKs to VSCode sandbox
flatpak override --user --env=FLATPAK_ENABLE_SDK_EXT=mono6,dotnet8 \
  com.visualstudio.code
```

**macOS:**
```bash
# Install .NET 8 SDK via Homebrew
brew install dotnet-sdk

# Native libraries go in /usr/local/lib
# See Section 3 for building from source
```

---

## 2. Project Setup

### Clone FNA

FNA is included as source via a git submodule, not as a NuGet package:

```bash
mkdir MyGame && cd MyGame
git init

# Add FNA as a submodule (includes SDL3#, FAudio, FNA3D bindings)
git submodule add https://github.com/FNA-XNA/FNA
git submodule update --init --recursive
```

### Create the Project File

Create `MyGame.csproj`:

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <RootNamespace>MyGame</RootNamespace>
    <AllowUnsafeBlocks>true</AllowUnsafeBlocks>
  </PropertyGroup>

  <!-- Reference FNA source directly -->
  <ItemGroup>
    <ProjectReference Include="FNA/FNA.Core.csproj" />
  </ItemGroup>

  <!-- Copy native libraries to output -->
  <ItemGroup>
    <None Include="libs/**/*" CopyToOutputDirectory="PreserveNewest" />
  </ItemGroup>

  <!-- Include content assets -->
  <ItemGroup>
    <None Include="Content/**/*" CopyToOutputDirectory="PreserveNewest" />
  </ItemGroup>
</Project>
```

### Create the Entry Point

Create `Program.cs`:

```csharp
using System;

namespace MyGame;

public static class Program
{
    [STAThread]
    static void Main()
    {
        // Environment variables must be set BEFORE creating the Game instance
        // Example: Force Vulkan backend
        // Environment.SetEnvironmentVariable("FNA3D_FORCE_DRIVER", "Vulkan");

        using var game = new MyGameMain();
        game.Run();
    }
}
```

Create `MyGameMain.cs`:

```csharp
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;
using Microsoft.Xna.Framework.Input;

namespace MyGame;

/// <summary>
/// Main game class. Inherits from XNA-compatible Game base class.
/// FNA enforces the same lifecycle as XNA4: Initialize → LoadContent → Update/Draw loop.
/// </summary>
public class MyGameMain : Game
{
    private GraphicsDeviceManager _graphics;
    private SpriteBatch _spriteBatch;

    public MyGameMain()
    {
        _graphics = new GraphicsDeviceManager(this)
        {
            PreferredBackBufferWidth = 1280,
            PreferredBackBufferHeight = 720,
            // FNA3D selects the best available backend automatically
            // Override with FNA3D_FORCE_DRIVER env var if needed
        };

        Content.RootDirectory = "Content";
        IsMouseVisible = true;
        Window.Title = "My FNA Game";
    }

    protected override void Initialize()
    {
        // Non-graphical initialization goes here
        base.Initialize();
    }

    protected override void LoadContent()
    {
        _spriteBatch = new SpriteBatch(GraphicsDevice);

        // Load assets here:
        // var texture = Content.Load<Texture2D>("Textures/mySprite");
        //
        // Or load directly from streams (no content pipeline needed):
        // using var stream = TitleContainer.OpenStream("Content/Textures/player.png");
        // var texture = Texture2D.FromStream(GraphicsDevice, stream);
    }

    protected override void Update(GameTime gameTime)
    {
        // Handle input
        var keyboard = Keyboard.GetState();
        if (keyboard.IsKeyDown(Keys.Escape))
            Exit();

        // Game logic goes here
        // deltaTime = (float)gameTime.ElapsedGameTime.TotalSeconds;

        base.Update(gameTime);
    }

    protected override void Draw(GameTime gameTime)
    {
        GraphicsDevice.Clear(Color.CornflowerBlue);

        _spriteBatch.Begin();
        // Draw calls go here
        // _spriteBatch.Draw(texture, position, Color.White);
        _spriteBatch.End();

        base.Draw(gameTime);
    }
}
```

---

## 3. Native Libraries

FNA requires native C libraries that are NOT distributed via NuGet. You have two options:

### Option A: Prebuilt Binaries (Recommended)

Download from the [fnalibs-dailies](https://github.com/FNA-XNA/fnalibs-dailies) repository. Place platform-appropriate binaries in `libs/`:

```
libs/
├── x64/
│   ├── SDL3.dll          # Windows
│   ├── FNA3D.dll
│   ├── FAudio.dll
│   └── libtheorafile.dll
├── lib64/
│   ├── libSDL3.so        # Linux
│   ├── libFNA3D.so
│   ├── libFAudio.so
│   └── libtheorafile.so
└── osx/
    ├── libSDL3.dylib     # macOS
    ├── libFNA3D.dylib
    ├── libFAudio.dylib
    └── libtheorafile.dylib
```

### Option B: Build From Source

```bash
# macOS example — build SDL3 and friends from source
git clone https://github.com/libsdl-org/SDL SDL3-source
cd SDL3-source && mkdir build && cd build
cmake .. -DCMAKE_BUILD_TYPE=Release
cmake --build . --config Release
# Copy resulting dylib to /usr/local/lib or your project's libs/ folder

# Repeat for FNA3D, FAudio, and Theorafile repositories
```

---

## 4. Build and Run

```bash
# First build
dotnet build

# Run the game
dotnet run

# You should see a 1280x720 window with a cornflower blue background.
# If native libraries are missing, you'll get a DllNotFoundException —
# check that libs/ contains the correct binaries for your OS.
```

### Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| `DllNotFoundException: SDL3` | Native library not found | Ensure SDL3 binary is in `libs/` and copied to output directory |
| `DllNotFoundException: FNA3D` | Graphics library missing | Download FNA3D from fnalibs-dailies |
| Case-sensitivity errors on Windows | Filesystem not configured | Run `fsutil.exe file SetCaseSensitiveInfo` on project folder |
| Shader compilation errors | Using MGFX format | FNA requires DXBC format from `fxc.exe`, not MGFX |

---

## 5. Next Steps

- **[G2 — SDL3 Platform Layer](./G2_sdl3_platform_layer.md):** Understand FNA's SDL3 integration, backend switching, and platform abstraction.
- **[G3 — MonoGame Migration](./G3_monogame_migration.md):** Porting a MonoGame project to FNA — content pipeline, shaders, and API differences.
