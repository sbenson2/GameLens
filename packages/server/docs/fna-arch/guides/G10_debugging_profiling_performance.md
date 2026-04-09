# G10 — Debugging, Profiling & Performance

> **Category:** guide · **Engine:** FNA · **Related:** [G01 Getting Started](./G01_getting_started.md) · [G02 NativeAOT Publishing](./G02_nativeaot_publishing.md) · [G03 SDL3 GPU API](./G03_sdl3_gpu_api.md)

How to debug, profile, and optimize FNA games. Covers FNA's built-in diagnostics, environment variables for GPU/audio debugging, .NET profiling tools, common performance bottlenecks in XNA-pattern games, and practical optimization strategies. FNA's accuracy-focused design means standard .NET performance tooling works well — no engine-specific profiler required.

---

## FNA's Debugging Philosophy

FNA intentionally does not ship a visual profiler or debug overlay. Instead, it exposes debugging through:

1. **Environment variables** — toggle GPU backend logging, force specific renderers, control vsync behavior
2. **SDL2/SDL3 diagnostics** — window, input, and platform-level debugging via SDL APIs
3. **Standard .NET tools** — dotnet-trace, dotnet-counters, PerfView, and Visual Studio diagnostics work without modification
4. **FNA3D debug output** — the graphics layer logs driver-level information when enabled

This approach means your debugging skills transfer directly from any .NET project. No proprietary toolchain to learn.

## Environment Variables for Debugging

FNA and its native libraries respond to environment variables set before the game starts. Set them in your launch script, IDE run configuration, or at the top of `Program.cs`:

```csharp
// Set before creating the Game instance
Environment.SetEnvironmentVariable("FNA3D_FORCE_DRIVER", "Vulkan");
Environment.SetEnvironmentVariable("FNA3D_LOG_VERBOSE", "1");
```

### Graphics Debugging (FNA3D)

| Variable | Values | Effect |
|----------|--------|--------|
| `FNA3D_FORCE_DRIVER` | `OpenGL`, `Vulkan`, `D3D11`, `Metal` | Force a specific GPU backend instead of auto-detection |
| `FNA3D_LOG_VERBOSE` | `1` | Enable verbose GPU driver logging to stdout |
| `FNA3D_DISABLE_LATESWAPTEAR` | `1` | Disable late swap tearing (adaptive vsync) |
| `SDL_RENDER_DRIVER` | `opengl`, `vulkan`, etc. | Force SDL's render driver selection |

### Audio Debugging (FAudio)

| Variable | Values | Effect |
|----------|--------|--------|
| `FAUDIO_LOG_VERBOSE` | `1` | Enable verbose audio logging |
| `SDL_AUDIODRIVER` | `pulseaudio`, `alsa`, `wasapi`, etc. | Force a specific audio backend |

### Platform / Window Debugging

| Variable | Values | Effect |
|----------|--------|--------|
| `SDL_VIDEO_X11_NET_WM_BYPASS_COMPOSITOR` | `0` | Disable compositor bypass on Linux (useful for debugging window behavior) |
| `FNA_KEYBOARD_USE_SCANCODES` | `1` | Use scancodes instead of keycodes (layout-independent input debugging) |

### Setting Variables in a Launch Script

```bash
#!/bin/bash
# debug-launch.sh — run game with full diagnostic output
export FNA3D_LOG_VERBOSE=1
export FAUDIO_LOG_VERBOSE=1
export FNA3D_FORCE_DRIVER=Vulkan
dotnet run --project MyGame 2>&1 | tee debug.log
```

## In-Game Performance Metrics

FNA does not provide a built-in FPS overlay, but the XNA API gives you everything needed to build one:

```csharp
public class PerformanceOverlay : DrawableGameComponent
{
    private SpriteBatch _spriteBatch;
    private SpriteFont _font;

    // Timing accumulators
    private int _frameCount;
    private double _elapsed;
    private double _fps;
    private double _updateMs;
    private double _drawMs;

    // GC tracking
    private int _lastGen0;
    private int _lastGen1;
    private int _lastGen2;

    public PerformanceOverlay(Game game) : base(game)
    {
        // Draw on top of everything
        DrawOrder = int.MaxValue;
    }

    protected override void LoadContent()
    {
        _spriteBatch = new SpriteBatch(GraphicsDevice);
        _font = Game.Content.Load<SpriteFont>("Fonts/Debug");
    }

    public override void Update(GameTime gameTime)
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();

        _frameCount++;
        _elapsed += gameTime.ElapsedGameTime.TotalSeconds;

        if (_elapsed >= 1.0)
        {
            _fps = _frameCount / _elapsed;
            _frameCount = 0;
            _elapsed = 0;
        }

        sw.Stop();
        _updateMs = sw.Elapsed.TotalMilliseconds;
    }

    public override void Draw(GameTime gameTime)
    {
        var sw = System.Diagnostics.Stopwatch.StartNew();

        int gen0 = GC.CollectionCount(0);
        int gen1 = GC.CollectionCount(1);
        int gen2 = GC.CollectionCount(2);

        string text =
            $"FPS: {_fps:F1}\n" +
            $"Update: {_updateMs:F2}ms\n" +
            $"GC: {gen0 - _lastGen0}/{gen1 - _lastGen1}/{gen2 - _lastGen2}\n" +
            $"Mem: {GC.GetTotalMemory(false) / 1024 / 1024}MB";

        _lastGen0 = gen0;
        _lastGen1 = gen1;
        _lastGen2 = gen2;

        _spriteBatch.Begin();
        // Shadow for readability
        _spriteBatch.DrawString(_font, text,
            new Vector2(11, 11), Color.Black);
        _spriteBatch.DrawString(_font, text,
            new Vector2(10, 10), Color.Lime);
        _spriteBatch.End();

        sw.Stop();
        _drawMs = sw.Elapsed.TotalMilliseconds;
    }
}
```

Register it in your Game class:

```csharp
protected override void Initialize()
{
#if DEBUG
    Components.Add(new PerformanceOverlay(this));
#endif
    base.Initialize();
}
```

## .NET Profiling Tools

### dotnet-trace (CPU Profiling)

Capture a CPU trace of your running game:

```bash
# Install the tool (once)
dotnet tool install -g dotnet-trace

# Run your game, then in another terminal:
dotnet-trace collect --process-id $(pgrep MyGame) --duration 00:00:30

# Convert to speedscope format for browser viewing
dotnet-trace convert trace.nettrace --format speedscope
```

Open the `.speedscope.json` file at [speedscope.app](https://www.speedscope.app/) for a flame graph of where your game spends CPU time.

### dotnet-counters (Live Metrics)

Monitor GC, thread pool, and runtime metrics in real time:

```bash
dotnet tool install -g dotnet-counters

# Monitor a running game
dotnet-counters monitor --process-id $(pgrep MyGame) \
    --counters System.Runtime,System.Buffers.ArrayPool
```

Key counters to watch:

| Counter | Healthy Range | Red Flag |
|---------|--------------|----------|
| `gc-heap-size` | Stable | Steadily climbing = memory leak |
| `gen-0-gc-count` | < 5/sec | > 20/sec = excessive allocation |
| `gen-2-gc-count` | < 1/min | > 1/sec = major GC pressure |
| `threadpool-queue-length` | 0 | > 10 = thread pool saturation |

### dotnet-gcdump (Memory Analysis)

Capture a heap snapshot to find memory leaks:

```bash
dotnet tool install -g dotnet-gcdump

dotnet-gcdump collect --process-id $(pgrep MyGame)
```

Open the `.gcdump` file in Visual Studio or PerfView to see which objects dominate the heap.

## Common FNA Performance Bottlenecks

### 1. SpriteBatch Draw Call Batching

The most common performance issue in XNA-pattern games. Every time you change texture, blend state, or call `Begin()`/`End()`, SpriteBatch flushes a draw call to the GPU.

**Problem:**
```csharp
// BAD: Each sprite with a different texture = separate draw call
foreach (var entity in entities)
{
    spriteBatch.Begin();
    spriteBatch.Draw(entity.Texture, entity.Position, Color.White);
    spriteBatch.End();
}
```

**Fix:** Batch by texture. Sort entities by texture atlas, draw all sprites sharing a texture in one `Begin()`/`End()` block, or use a texture atlas:

```csharp
// GOOD: Single Begin/End, sprites sorted by texture
spriteBatch.Begin(SpriteSortMode.Texture, BlendState.AlphaBlend);
foreach (var entity in entities)
{
    spriteBatch.Draw(entity.Texture, entity.Position, Color.White);
}
spriteBatch.End();
```

`SpriteSortMode.Texture` tells SpriteBatch to sort internally by texture, minimizing state changes.

### 2. GC Pressure from Per-Frame Allocations

The .NET garbage collector will cause frame hitches if you allocate heavily during Update/Draw. Common culprits:

| Allocation Source | Fix |
|---|---|
| `new List<T>()` every frame | Reuse lists, call `Clear()` instead |
| String concatenation in debug text | Use `StringBuilder` or `string.Format` with caching |
| LINQ queries (`.Where()`, `.Select()`) | Replace with `for` loops in hot paths |
| `new Vector2(...)` in tight loops | Use `ref` locals or stack-allocated spans |
| Event handlers with closures | Cache delegates, avoid lambdas in Update |

### 3. Content Loading Stalls

Loading textures or audio during gameplay causes frame drops. FNA's `ContentManager.Load<T>()` is synchronous and blocks the calling thread.

**Fix:** Preload assets during loading screens or use a background thread for non-GPU resources:

```csharp
// Load on a background thread (audio, data files)
await Task.Run(() =>
{
    _audioBank = Content.Load<SoundEffect>("Audio/Explosion");
    _levelData = Content.Load<LevelData>("Levels/World1");
});

// Textures MUST be loaded on the main thread (GPU context)
_playerTexture = Content.Load<Texture2D>("Sprites/Player");
```

### 4. Unoptimized Collision Detection

Brute-force O(n²) collision checks are a common bottleneck in games with many entities:

```csharp
// BAD: O(n²) — 1000 entities = 1,000,000 checks per frame
for (int i = 0; i < entities.Count; i++)
    for (int j = i + 1; j < entities.Count; j++)
        CheckCollision(entities[i], entities[j]);
```

**Fix:** Use spatial partitioning — a grid, quadtree, or spatial hash reduces checks to only nearby entities. See the MonoGame [G71 Spatial Partitioning](../../monogame-arch/guides/G71_spatial_partitioning.md) guide for implementations that work identically in FNA.

## NativeAOT Debugging Considerations

If you publish with NativeAOT (see [G02](./G02_nativeaot_publishing.md)), standard .NET diagnostic tools do not work because there is no JIT or managed runtime. Instead:

- **Use platform profilers** — `perf` on Linux, Instruments on macOS, ETW/WPA on Windows
- **Add manual timing instrumentation** using `System.Diagnostics.Stopwatch`
- **Build with debug symbols** — `dotnet publish -c Release /p:PublishAot=true /p:StripSymbols=false` preserves symbols for native profilers
- **FNA3D_LOG_VERBOSE still works** — environment variables are unaffected by AOT compilation

## FNA-Specific Debug Checklist

When something looks wrong in your FNA game, work through this checklist:

1. **Black screen?** — Check `FNA3D_FORCE_DRIVER` to try a different GPU backend. Verify fnalibs are present in the output directory.
2. **No audio?** — Set `FAUDIO_LOG_VERBOSE=1` and check the console. Try `SDL_AUDIODRIVER=dummy` to isolate whether it is a driver issue.
3. **Wrong colors or rendering artifacts?** — Force OpenGL with `FNA3D_FORCE_DRIVER=OpenGL` to rule out Vulkan/Metal driver bugs. Check shader compilation (FNA uses DXBC, not MGFX).
4. **Input not responding?** — Set `FNA_KEYBOARD_USE_SCANCODES=1`. On Linux, verify SDL2 has permission to access `/dev/input/` devices.
5. **Performance regression after update?** — Compare FNA commits. FNA is typically included as a Git submodule; `git log lib/FNA` shows what changed.
6. **Crash on startup?** — Missing fnalibs is the most common cause. Verify the correct platform binaries (linux-x64, osx-arm64, win-x64) are in the output directory alongside the game executable.
