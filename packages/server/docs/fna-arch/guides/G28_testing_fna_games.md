# G28 — Testing FNA Games

> **Category:** guide · **Engine:** FNA · **Related:** [G10 Debugging Profiling Performance](./G10_debugging_profiling_performance.md) · [G20 MonoGame Compatibility Migration](./G20_monogame_compatibility_migration.md) · [FNA Architecture Rules](../fna-arch-rules.md)

Patterns for unit testing and integration testing FNA games. Covers testing game logic without a graphics device, mocking XNA services, headless testing with FNA, and CI pipeline configuration for automated test runs.

---

## Table of Contents

1. [Testing Strategy Overview](#1--testing-strategy-overview)
2. [Unit Testing Game Logic](#2--unit-testing-game-logic)
3. [Testing with a Graphics Device (Integration Tests)](#3--testing-with-a-graphics-device-integration-tests)
4. [Mocking XNA Services](#4--mocking-xna-services)
5. [Testing Input and State Machines](#5--testing-input-and-state-machines)
6. [Testing Content Loading](#6--testing-content-loading)
7. [CI Pipeline Configuration](#7--ci-pipeline-configuration)
8. [Common Pitfalls](#8--common-pitfalls)
9. [FNA vs MonoGame: Testing Differences](#9--fna-vs-monogame-testing-differences)

---

## 1 — Testing Strategy Overview

FNA games benefit from a layered testing approach:

| Layer | What to Test | Dependencies | Speed |
|-------|-------------|-------------|-------|
| **Pure logic** | Math, AI, physics, state machines | None (no FNA dependency) | Fast |
| **Game systems** | ECS components, collision, scoring | Minimal FNA types (Vector2, Rectangle) | Fast |
| **Rendering integration** | SpriteBatch output, render targets | Full FNA + graphics device | Slow |
| **Platform integration** | Input, audio, window behavior | Full FNA + native libs | Manual |

The most valuable tests are in the first two layers — they run fast, have no native dependencies, and cover the code most likely to have bugs. Invest here first.

---

## 2 — Unit Testing Game Logic

The key principle: **separate game logic from framework dependencies.** Code that doesn't reference `Microsoft.Xna.Framework` types is trivially testable.

### Project Structure

```
MyFNAGame.sln
├── src/
│   ├── MyFNAGame/              # Main game project (references FNA)
│   │   ├── Game1.cs
│   │   ├── Rendering/          # SpriteBatch, draw code
│   │   └── Systems/            # Thin wrappers calling into Core
│   └── MyFNAGame.Core/         # Pure game logic (NO FNA reference)
│       ├── AI/
│       │   └── EnemyBehavior.cs
│       ├── Combat/
│       │   └── DamageCalculator.cs
│       ├── Economy/
│       │   └── Shop.cs
│       └── World/
│           └── TileMap.cs
├── tests/
│   └── MyFNAGame.Tests/        # Test project (references Core, not FNA)
│       ├── AI/
│       │   └── EnemyBehaviorTests.cs
│       ├── Combat/
│       │   └── DamageCalculatorTests.cs
│       └── MyFNAGame.Tests.csproj
└── lib/
    └── FNA/
```

The `MyFNAGame.Core` project contains all testable logic with no dependency on FNA. The main game project references both `FNA` and `Core`.

### Example: Testing a Damage Calculator

```csharp
// In MyFNAGame.Core/Combat/DamageCalculator.cs
namespace MyFNAGame.Core.Combat;

public static class DamageCalculator
{
    public static int Calculate(int baseDamage, float multiplier, int armor)
    {
        int raw = (int)(baseDamage * multiplier);
        int mitigated = Math.Max(1, raw - armor); // Minimum 1 damage
        return mitigated;
    }
}
```

```csharp
// In tests/MyFNAGame.Tests/Combat/DamageCalculatorTests.cs
using MyFNAGame.Core.Combat;

namespace MyFNAGame.Tests.Combat;

public class DamageCalculatorTests
{
    [Fact]
    public void Calculate_BasicDamage_SubtractsArmor()
    {
        int result = DamageCalculator.Calculate(baseDamage: 10, multiplier: 1.0f, armor: 3);
        Assert.Equal(7, result);
    }

    [Fact]
    public void Calculate_HighArmor_MinimumOneDamage()
    {
        int result = DamageCalculator.Calculate(baseDamage: 5, multiplier: 1.0f, armor: 100);
        Assert.Equal(1, result);
    }

    [Theory]
    [InlineData(10, 2.0f, 5, 15)]  // Critical hit
    [InlineData(10, 0.5f, 0, 5)]   // Weak hit, no armor
    [InlineData(0, 1.0f, 0, 1)]    // Zero base damage still does 1
    public void Calculate_VariousInputs(int baseDmg, float mult, int armor, int expected)
    {
        Assert.Equal(expected, DamageCalculator.Calculate(baseDmg, mult, armor));
    }
}
```

### Test Project Configuration

```xml
<!-- tests/MyFNAGame.Tests/MyFNAGame.Tests.csproj -->
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <IsPackable>false</IsPackable>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.NET.Test.Sdk" Version="17.*" />
    <PackageReference Include="xunit" Version="2.*" />
    <PackageReference Include="xunit.runner.visualstudio" Version="2.*" />
  </ItemGroup>

  <ItemGroup>
    <!-- Reference the Core logic project, NOT the FNA game project -->
    <ProjectReference Include="../../src/MyFNAGame.Core/MyFNAGame.Core.csproj" />
  </ItemGroup>
</Project>
```

---

## 3 — Testing with a Graphics Device (Integration Tests)

Some tests need a real `GraphicsDevice` — testing render target output, shader behavior, or texture operations. FNA can run headless (no visible window) for these scenarios.

### Headless FNA Test Fixture

```csharp
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;

namespace MyFNAGame.Tests.Integration;

/// <summary>
/// Creates a minimal FNA Game instance for integration tests.
/// Requires fnalibs (SDL3, FNA3D) to be present in the test output directory.
/// </summary>
public class FNATestFixture : IDisposable
{
    public Game Game { get; }
    public GraphicsDevice GraphicsDevice { get; }

    public FNATestFixture()
    {
        // Set environment variable to suppress window creation
        Environment.SetEnvironmentVariable("SDL_VIDEODRIVER", "dummy");

        Game = new TestGame();
        // Run one tick to initialize the graphics device
        Game.RunOneFrame();
        GraphicsDevice = Game.GraphicsDevice;
    }

    public void Dispose()
    {
        Game?.Dispose();
    }

    private class TestGame : Game
    {
        public TestGame()
        {
            var gdm = new GraphicsDeviceManager(this);
            gdm.PreferredBackBufferWidth = 320;
            gdm.PreferredBackBufferHeight = 240;
        }
    }
}
```

### Using the Fixture

```csharp
public class RenderTargetTests : IClassFixture<FNATestFixture>
{
    private readonly GraphicsDevice _device;

    public RenderTargetTests(FNATestFixture fixture)
    {
        _device = fixture.GraphicsDevice;
    }

    [Fact]
    public void RenderTarget_ClearsToColor()
    {
        var rt = new RenderTarget2D(_device, 64, 64);
        _device.SetRenderTarget(rt);
        _device.Clear(Color.Red);
        _device.SetRenderTarget(null);

        var pixels = new Color[64 * 64];
        rt.GetData(pixels);

        Assert.All(pixels, p => Assert.Equal(Color.Red, p));
        rt.Dispose();
    }
}
```

**Note:** Integration tests that use a graphics device require fnalibs in the test output directory. Copy them as part of your test project's build:

```xml
<!-- In the integration test .csproj -->
<ItemGroup Condition="$([MSBuild]::IsOSPlatform('Linux'))">
    <Content Include="../../lib/fnalibs/lib64/*"
             CopyToOutputDirectory="PreserveNewest"
             Link="%(Filename)%(Extension)" />
</ItemGroup>
```

---

## 4 — Mocking XNA Services

When game systems depend on XNA types but you want fast unit tests without a real `Game` instance, use interfaces and dependency injection.

### Define Interfaces for Framework Services

```csharp
// In MyFNAGame.Core (no FNA dependency)
namespace MyFNAGame.Core.Services;

public interface IInputService
{
    bool IsKeyDown(string key);
    (float X, float Y) GetMovementVector();
}

public interface IAudioService
{
    void PlaySound(string name);
    void PlayMusic(string name);
    void StopMusic();
}
```

### Implement Against FNA in the Game Project

```csharp
// In MyFNAGame (references FNA)
using Microsoft.Xna.Framework.Input;
using MyFNAGame.Core.Services;

public class FNAInputService : IInputService
{
    public bool IsKeyDown(string key)
    {
        var k = Enum.Parse<Keys>(key);
        return Keyboard.GetState().IsKeyDown(k);
    }

    public (float X, float Y) GetMovementVector()
    {
        var state = Keyboard.GetState();
        float x = 0, y = 0;
        if (state.IsKeyDown(Keys.Left)) x -= 1;
        if (state.IsKeyDown(Keys.Right)) x += 1;
        if (state.IsKeyDown(Keys.Up)) y -= 1;
        if (state.IsKeyDown(Keys.Down)) y += 1;
        return (x, y);
    }
}
```

### Mock in Tests

```csharp
// In tests — using a simple mock (or use NSubstitute, Moq, etc.)
public class MockInputService : IInputService
{
    public HashSet<string> PressedKeys { get; } = new();

    public bool IsKeyDown(string key) => PressedKeys.Contains(key);

    public (float X, float Y) GetMovementVector()
    {
        float x = 0, y = 0;
        if (PressedKeys.Contains("Left")) x -= 1;
        if (PressedKeys.Contains("Right")) x += 1;
        return (x, y);
    }
}

public class PlayerMovementTests
{
    [Fact]
    public void Update_RightKeyPressed_MovesRight()
    {
        var input = new MockInputService();
        input.PressedKeys.Add("Right");

        var player = new Player(input) { X = 0 };
        player.Update(deltaTime: 1.0f / 60f);

        Assert.True(player.X > 0);
    }
}
```

---

## 5 — Testing Input and State Machines

Game state machines (menu → playing → paused → game over) are excellent test candidates:

```csharp
// In MyFNAGame.Core/States/GameStateMachine.cs
namespace MyFNAGame.Core.States;

public enum GameState { Menu, Playing, Paused, GameOver }

public class GameStateMachine
{
    public GameState Current { get; private set; } = GameState.Menu;

    public bool Transition(GameState target)
    {
        // Define valid transitions
        bool valid = (Current, target) switch
        {
            (GameState.Menu, GameState.Playing) => true,
            (GameState.Playing, GameState.Paused) => true,
            (GameState.Playing, GameState.GameOver) => true,
            (GameState.Paused, GameState.Playing) => true,
            (GameState.Paused, GameState.Menu) => true,
            (GameState.GameOver, GameState.Menu) => true,
            _ => false
        };

        if (valid) Current = target;
        return valid;
    }
}
```

```csharp
public class GameStateMachineTests
{
    [Fact]
    public void InitialState_IsMenu()
    {
        var sm = new GameStateMachine();
        Assert.Equal(GameState.Menu, sm.Current);
    }

    [Fact]
    public void Menu_CanTransitionToPlaying()
    {
        var sm = new GameStateMachine();
        Assert.True(sm.Transition(GameState.Playing));
        Assert.Equal(GameState.Playing, sm.Current);
    }

    [Fact]
    public void Menu_CannotTransitionToGameOver()
    {
        var sm = new GameStateMachine();
        Assert.False(sm.Transition(GameState.GameOver));
        Assert.Equal(GameState.Menu, sm.Current); // State unchanged
    }

    [Fact]
    public void Playing_CanPauseAndResume()
    {
        var sm = new GameStateMachine();
        sm.Transition(GameState.Playing);
        sm.Transition(GameState.Paused);
        sm.Transition(GameState.Playing);
        Assert.Equal(GameState.Playing, sm.Current);
    }
}
```

---

## 6 — Testing Content Loading

Test that all expected content files exist and load without errors. This catches missing assets before players do:

```csharp
public class ContentIntegrationTests : IClassFixture<FNATestFixture>
{
    private readonly Game _game;

    public ContentIntegrationTests(FNATestFixture fixture)
    {
        _game = fixture.Game;
    }

    [Theory]
    [InlineData("Content/player.png")]
    [InlineData("Content/enemy.png")]
    [InlineData("Content/tileset.png")]
    public void Texture_LoadsWithoutError(string path)
    {
        string fullPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, path);
        Assert.True(File.Exists(fullPath), $"Missing texture: {path}");

        using var stream = File.OpenRead(fullPath);
        var texture = Texture2D.FromStream(_game.GraphicsDevice, stream);
        Assert.NotNull(texture);
        Assert.True(texture.Width > 0);
        Assert.True(texture.Height > 0);
    }

    [Theory]
    [InlineData("Content/jump.wav")]
    [InlineData("Content/music.ogg")]
    public void Audio_FileExists(string path)
    {
        string fullPath = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, path);
        Assert.True(File.Exists(fullPath), $"Missing audio: {path}");
    }
}
```

---

## 7 — CI Pipeline Configuration

### GitHub Actions / GitLab CI

FNA tests that don't require a graphics device run on standard CI runners. Integration tests with a graphics device need a virtual framebuffer on Linux:

```yaml
# .github/workflows/test.yml
name: Test
on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '8.0'
      - run: dotnet test tests/MyFNAGame.Tests/ --configuration Release

  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '8.0'
      - name: Install virtual framebuffer
        run: sudo apt-get install -y xvfb
      - name: Download fnalibs
        run: |
          mkdir -p lib/fnalibs/lib64
          # Download from fnalibs-dailies (replace with actual URL)
      - name: Run integration tests with virtual display
        run: xvfb-run dotnet test tests/MyFNAGame.IntegrationTests/ --configuration Release
        env:
          SDL_VIDEODRIVER: x11
```

**Key points:**
- `xvfb-run` creates a virtual X11 display so SDL can initialize
- `SDL_VIDEODRIVER=x11` forces X11 (Wayland may not work with xvfb)
- Unit tests (`MyFNAGame.Tests`) run without xvfb or fnalibs
- Integration tests (`MyFNAGame.IntegrationTests`) need both

---

## 8 — Common Pitfalls

**"DllNotFoundException: SDL2" in tests** — fnalibs aren't in the test output directory. Add `<Content>` items for fnalibs in your integration test `.csproj`, or copy them in a CI step.

**Tests hang or timeout** — SDL is waiting for a display. Ensure `SDL_VIDEODRIVER=dummy` or use `xvfb-run` on Linux CI.

**GraphicsDevice is null** — The test `Game` instance needs at least one frame to initialize. Call `Game.RunOneFrame()` in the fixture constructor.

**Flaky timing tests** — Never depend on real `GameTime` in unit tests. Pass delta time as a parameter so tests can control it exactly.

**Testing too close to the framework** — If a test requires mocking half of XNA, the code is too coupled. Extract logic into a framework-free class and test that instead.

---

## 9 — FNA vs MonoGame: Testing Differences

| Aspect | FNA | MonoGame |
|--------|-----|----------|
| API surface | Identical to XNA (stable) | Evolves (may break mocks) |
| Headless rendering | `SDL_VIDEODRIVER=dummy` | Similar (`SDL_VIDEODRIVER=dummy`) |
| Native libs for tests | Manual fnalibs copy | NuGet handles it |
| CI virtual display | `xvfb-run` on Linux | Same |
| Test frameworks | Any .NET test framework | Same |

The testing patterns are nearly identical between FNA and MonoGame. The main practical difference is dependency management: FNA requires manual fnalibs setup in test projects, while MonoGame's NuGet packages handle native dependencies automatically.

FNA's strict XNA compatibility is actually an advantage for testing — the API surface is frozen, so mocks and test fixtures don't break when the framework updates. MonoGame's evolving API may occasionally require test updates after framework upgrades.
