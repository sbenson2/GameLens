# FNA Architecture Rules

> **Module:** fna-arch · **Engine:** FNA (XNA4 Reimplementation) · **Version:** Latest (2026)

## Architecture Context

FNA is an accuracy-focused reimplementation of Microsoft XNA Game Studio 4.0 Refresh for open platforms. Maintained primarily by Ethan Lee (flibitijibibo), FNA has been used to port over four dozen commercial XNA games to modern platforms.

**Key distinction from MonoGame:** FNA aims to reproduce XNA *exactly* as Microsoft made it. MonoGame aims to be *like* XNA but extends and diverges where convenient. This difference affects every architectural decision.

### Tech Stack

- **Framework:** FNA (XNA4-compatible API surface, v26.04+)
- **Graphics:** FNA3D (SDL_GPU-backed by default since 25.03; also supports OpenGL, D3D11; legacy Vulkan/Metal requests map to SDL_GPU)
- **Audio:** FAudio (XAudio2 reimplementation)
- **Video:** Theorafile (Ogg Theora playback), dav1dfile (AV1 decoding)
- **Input/Platform:** SDL3 (default since 25.03; SDL2 still supported via `FNA_PLATFORM_BACKEND` env var)
- **Language:** C# (.NET 8+ recommended / .NET Framework 4.0 / Mono / NativeAOT)
- **Platforms:** Windows, Linux, macOS, consoles via NativeAOT (+ any platform SDL3 supports)

### Native Libraries

FNA depends on native libraries (called "fnalibs") that must be present at runtime:

| Library | Purpose | Replaces (XNA) |
|---------|---------|----------------|
| SDL3 (or SDL2) | Window, input, platform abstraction | XNA Game Services |
| FNA3D | Graphics rendering (SDL_GPU default) | XNA GraphicsDevice |
| FAudio | Audio playback | XACT, SoundEffect |
| Theorafile | Video playback (Ogg Theora) | Video.MediaPlayer |
| dav1dfile | Video playback (AV1, optional) | — |

These are **not** NuGet packages. Download prebuilt binaries from the FNA repository or build from source.

## Project Structure Conventions

```
MyGame/
├── src/
│   ├── Game1.cs              # Entry point, inherits Microsoft.Xna.Framework.Game
│   ├── Components/           # Game-specific data (if using ECS or component pattern)
│   ├── Systems/              # Game logic
│   ├── Rendering/            # Draw code, sprite batching
│   ├── Audio/                # Sound management
│   └── Input/                # Input handling
├── Content/                  # Game assets (textures, sounds, fonts)
├── lib/                      # FNA source (submodule) + fnalibs
│   ├── FNA/                  # FNA framework source code
│   └── fnalibs/              # Native library binaries per platform
├── MyGame.csproj             # Project file referencing FNA
└── MyGame.sln
```

### FNA as Source Reference

FNA is typically included as a **Git submodule** pointing at the FNA repository, then referenced as a project reference (not a NuGet package). This ensures you're always building against a known FNA commit:

```xml
<ProjectReference Include="lib/FNA/FNA.csproj" />
```

## Content Pipeline Rules

**FNA does not have its own content pipeline tool.** This is by design — FNA preserves XNA's content format rather than inventing a new one.

### Options for Building Content

1. **MonoGame MGCB (DesktopGL profile)** — FNA is mostly compatible with MGCB output. Use the DesktopGL configuration when building content for FNA.
2. **XNA Content Pipeline** (legacy) — if you have access to the original XNA tools, they produce perfectly compatible output.
3. **Raw loading** — `Texture2D.FromStream()`, `SoundEffect.FromStream()`, etc. Load assets directly without preprocessing.
4. **Third-party tools** — Aseprite, Tiled, LDtk export directly to formats FNA can load.

### Content Format Differences from MonoGame

| Area | FNA | MonoGame |
|------|-----|----------|
| Shaders | DXBC / FXC (XNA-native) | MGFX (custom format, per-platform) |
| Audio | Ogg Vorbis or QOA | Platform-varies (MP3, WAV, Ogg) |
| Video | Ogg Theora | Platform-varies |
| Content tool | None (uses MGCB or raw) | MGCB Editor |

**Critical:** Effect/shader files are **not interchangeable** between FNA and MonoGame. FNA uses standard DXBC binaries; MonoGame uses its MGFX format. One `.fx` source can target both, but compiled binaries are incompatible.

## Code Conventions

FNA follows XNA conventions exactly:

- **Namespaces:** `Microsoft.Xna.Framework`, `Microsoft.Xna.Framework.Graphics`, etc. — identical to XNA
- **Game lifecycle:** `Initialize()` → `LoadContent()` → `Update(GameTime)` → `Draw(GameTime)` → `UnloadContent()`
- **Naming:** PascalCase for public members, XNA API naming (e.g., `SpriteBatch`, `GraphicsDeviceManager`, `ContentManager`)
- **No async in game loop** — same as XNA/MonoGame, keep Update/Draw synchronous

### FNA-Specific API Notes

- `Game.IsFixedTimeStep` defaults to `true` (60 FPS target) — same as XNA
- `GraphicsDeviceManager.PreferredBackBufferWidth/Height` for resolution
- `FNAPlatform` provides FNA-specific platform utilities (not part of XNA API)
- `SDL3.SDL` can be P/Invoked directly for platform features FNA doesn't expose (use `SDL3.SDL` for SDL3 builds, `SDL2.SDL` for legacy SDL2 builds)
- `FNA_PLATFORM_BACKEND` environment variable selects SDL2 vs SDL3 at runtime (defaults to SDL3 since 25.03)

## Build Commands

```bash
# Build the game (assumes FNA submodule is checked out)
dotnet build MyGame.sln

# Run the game
dotnet run --project MyGame

# Build content with MGCB (if using MonoGame content tools)
dotnet mgcb Content/Content.mgcb /platform:DesktopGL

# NativeAOT publish (for console ports or performance)
dotnet publish -c Release -r linux-x64 /p:PublishAot=true
```

## Porting from MonoGame to FNA

If porting an existing MonoGame project to FNA:

1. Replace MonoGame NuGet packages with FNA project reference
2. Recompile all shaders from `.fx` source using FXC (not MGFX)
3. Convert audio to Ogg Vorbis format
4. Convert video to Ogg Theora format
5. Add fnalibs native binaries to output directory
6. Remove any MonoGame-specific API calls (check `MonoGame.Extended` usage)
7. Test thoroughly — FNA's XNA-accuracy may expose bugs that MonoGame's divergences hid

## Porting from XNA to FNA

FNA was designed for this exact use case:

1. Replace XNA assembly references with FNA project reference
2. Remove Windows-only dependencies (XNA Game Studio, etc.)
3. Add fnalibs to output
4. Most code compiles unchanged — FNA's API is XNA's API
5. Platform-specific code (Xbox 360, Windows Phone) needs removal
6. Test with original content — XNA `.xnb` files work directly

## Console Support (NativeAOT)

FNA ships to consoles via NativeAOT — ahead-of-time compiled native executables with no .NET runtime dependency. All platform code lives in SDL and the NativeAOT bootstrap; FNA itself has **no private branches** per platform.

| Platform | Status | Key Requirement |
|----------|--------|-----------------|
| Xbox (GDK) | Shipping (public source) | GDK Agreement + NativeAOT-Xbox repo |
| Nintendo Switch | Shipping (certified) | Licensed dev + SDL-switch (NDA) |
| PlayStation 5 | In progress | Licensed dev + SDL-playstation (NDA) |
| PC (NativeAOT) | Shipping | `dotnet publish /p:PublishAot=true` |

See G23 for the full console porting workflow.

## Shader Runtime Translation (MojoShader)

FNA games ship DXBC shaders compiled by FXC. At runtime, MojoShader translates them through a SPIR-V intermediate to the active GPU backend (Vulkan, Metal, D3D12). SPIRV-Cross is loaded dynamically by SDL_GPU for non-Vulkan targets. See G24 for the full pipeline.

For new compute shaders or custom SDL_GPU pipelines, use SDL_shadercross instead (see G18).

## When to Choose FNA over MonoGame

Choose FNA when:
- **Porting an existing XNA game** — FNA's accuracy means fewer surprises
- **You need identical behavior to XNA** — FNA's bug-for-bug compatibility matters for game preservation
- **Cross-platform desktop + console** — FNA ships to Windows, Linux, macOS, Xbox, Switch, and PS5 via NativeAOT
- **You value simplicity** — FNA is smaller, has fewer moving parts, and no private platform branches
- **You want a single binary** — same FNA code on every platform, only native libs differ

Choose MonoGame when:
- **Targeting mobile (iOS/Android)** — MonoGame has mobile support; FNA does not
- **You want NuGet-based dependency management** — MonoGame is NuGet-native
- **You need the MGCB Editor** — visual content management
- **You're starting fresh** — MonoGame's tooling is more beginner-friendly

## Shipping a Complete Game

FNA handles the framework layer. These guides cover the game-level systems you'll need to ship:

- **Localization:** See G29 for string tables, runtime font rendering (SharpFont for CJK), and asset localization patterns
- **Accessibility:** See G30 for input remapping, colorblind modes, scalable UI, subtitles, reduced motion, and assist modes
- **Multiplayer:** See G31 for networking library selection (LiteNetLib, Steamworks.NET), client-server and P2P architectures, and state sync patterns
- **Build targets:** See G32 for .NET 8 vs Framework vs NativeAOT project configuration, FNA.Settings.props, and multi-target strategies
- **AV1 video:** See G33 for experimental dav1dfile integration, AV1 encoding for FNA, and Theora-vs-AV1 tradeoffs
- **Releases:** See G34 for FNA's monthly release cadence, SDL2→SDL3 transition timeline, version tracking, and the extension policy change in 26.01
