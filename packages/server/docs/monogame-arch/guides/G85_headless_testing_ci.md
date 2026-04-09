# G85 — Headless Testing & CI Pipeline Patterns

> **Category:** guide · **Engine:** MonoGame · **Related:** [G17 Testing](./G17_testing.md) · [G16 Debugging](./G16_debugging.md) · [G80 CI/CD Automated Builds](./G80_ci_cd_automated_builds.md) · [G81 NativeAOT Publishing](./G81_nativeaot_publishing.md) · [G82 3.8.5 StarterKit & New APIs](./G82_385_starterkit_new_apis.md)

Running MonoGame tests in CI/CD environments without a GPU. Covers headless GraphicsDevice patterns, test fixture strategies for graphics-dependent and graphics-free code, GitHub Actions / GitLab CI configuration, and workarounds for the DesktopGL headless limitation. Builds on the unit testing foundation from G17 and the CI/CD pipeline setup from G80.

---

## The Headless Problem

MonoGame's `GraphicsDevice` requires a real GPU context to initialize. On CI runners (GitHub Actions, GitLab CI, Azure Pipelines), machines are typically headless — no display, no GPU drivers. This creates a split in your test suite:

- **Logic tests** — game systems, ECS queries, math, state machines — run anywhere with no graphics dependency
- **Rendering tests** — shader compilation, sprite batching, render target verification — need a `GraphicsDevice`

The key insight: **separate your test projects by graphics dependency** so logic tests always run, even when rendering tests cannot.

---

## Project Structure for Testable Separation

```
MyGame/
├── MyGame/                         # Main game project
│   ├── Components/
│   ├── Systems/
│   └── Services/
├── MyGame.Tests/                   # Logic tests (no GraphicsDevice)
│   ├── Systems/
│   ├── Components/
│   └── Services/
├── MyGame.RenderTests/             # Rendering tests (needs GPU)
│   ├── Fixtures/
│   └── Visual/
└── MyGame.Benchmarks/              # Performance tests
```

### Logic Test Project (.csproj)

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <IsPackable>false</IsPackable>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="xunit" Version="2.9.*" />
    <PackageReference Include="xunit.runner.visualstudio" Version="2.8.*" />
    <PackageReference Include="NSubstitute" Version="5.*" />
    <ProjectReference Include="..\MyGame\MyGame.csproj" />
  </ItemGroup>
</Project>
```

No MonoGame graphics packages needed. This project tests pure logic and will run on any CI runner.

### Render Test Project (.csproj)

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <!-- Use WindowsDX — more forgiving in headless scenarios than DesktopGL -->
    <TargetFramework>net8.0-windows</TargetFramework>
    <IsPackable>false</IsPackable>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="xunit" Version="2.9.*" />
    <PackageReference Include="xunit.runner.visualstudio" Version="2.8.*" />
    <PackageReference Include="MonoGame.Framework.WindowsDX" Version="3.8.*" />
    <ProjectReference Include="..\MyGame\MyGame.csproj" />
  </ItemGroup>
</Project>
```

**Why WindowsDX over DesktopGL?** The DirectX backend uses WARP (Windows Advanced Rasterization Platform) as a software fallback when no GPU is available. DesktopGL requires a real OpenGL context and fails immediately in headless environments. WARP is slow but functional — perfect for CI verification.

---

## Designing Graphics-Free Game Systems

The best strategy is to minimize the code that requires a `GraphicsDevice`. Structure game systems so rendering is a thin layer on top of testable logic.

### Pattern: Separate Logic from Rendering

```csharp
// ✅ Testable: pure data + logic, no graphics dependency
public class DamageSystem
{
    public void ProcessHits(World world)
    {
        var query = new QueryDescription().WithAll<Health, DamageEvent>();
        world.Query(in query, (ref Health health, ref DamageEvent dmg) =>
        {
            health.Current -= dmg.Amount;
            if (health.Current <= 0)
                health.Current = 0;
        });
    }
}

// Rendering is separate — only this needs GraphicsDevice
public class HealthBarRenderer
{
    private readonly SpriteBatch _spriteBatch;

    public HealthBarRenderer(SpriteBatch spriteBatch)
    {
        _spriteBatch = spriteBatch;
    }

    public void Draw(World world)
    {
        var query = new QueryDescription().WithAll<Health, Position>();
        world.Query(in query, (ref Health health, ref Position pos) =>
        {
            float ratio = health.Current / health.Max;
            // Draw health bar using _spriteBatch...
        });
    }
}
```

### Pattern: Interface Abstraction for Testable Services

```csharp
// Interface for services that touch graphics
public interface ITextureLoader
{
    Texture2D Load(string assetName);
    bool IsLoaded(string assetName);
}

// Production implementation uses ContentManager
public class ContentTextureLoader : ITextureLoader
{
    private readonly ContentManager _content;
    private readonly Dictionary<string, Texture2D> _cache = new();

    public ContentTextureLoader(ContentManager content) => _content = content;

    public Texture2D Load(string assetName)
    {
        if (!_cache.TryGetValue(assetName, out var tex))
        {
            tex = _content.Load<Texture2D>(assetName);
            _cache[assetName] = tex;
        }
        return tex;
    }

    public bool IsLoaded(string assetName) => _cache.ContainsKey(assetName);
}

// Test implementation — no graphics needed
public class StubTextureLoader : ITextureLoader
{
    public HashSet<string> LoadedAssets { get; } = new();
    public Texture2D Load(string name) { LoadedAssets.Add(name); return null!; }
    public bool IsLoaded(string name) => LoadedAssets.Contains(name);
}
```

---

## Headless GraphicsDevice Fixture (Windows DirectX)

When you genuinely need a `GraphicsDevice` in tests (shader compilation, render target verification), use WARP:

```csharp
public class HeadlessGraphicsFixture : IDisposable
{
    public GraphicsDevice GraphicsDevice { get; }
    public SpriteBatch SpriteBatch { get; }

    private readonly Form _hiddenForm;

    public HeadlessGraphicsFixture()
    {
        // Create a hidden Win32 window for the device context
        _hiddenForm = new Form { Visible = false, ShowInTaskbar = false };

        var parameters = new PresentationParameters
        {
            BackBufferWidth = 800,
            BackBufferHeight = 600,
            DeviceWindowHandle = _hiddenForm.Handle,
            IsFullScreen = false
        };

        // GraphicsAdapter.UseReferenceDevice = true forces WARP on DX
        GraphicsAdapter.UseReferenceDevice = true;
        GraphicsDevice = new GraphicsDevice(
            GraphicsAdapter.DefaultAdapter,
            GraphicsProfile.HiDef,
            parameters
        );
        SpriteBatch = new SpriteBatch(GraphicsDevice);
    }

    public void Dispose()
    {
        SpriteBatch?.Dispose();
        GraphicsDevice?.Dispose();
        _hiddenForm?.Dispose();
    }
}

// Usage in xUnit as a shared fixture
public class SpriteRenderTests : IClassFixture<HeadlessGraphicsFixture>
{
    private readonly HeadlessGraphicsFixture _gfx;

    public SpriteRenderTests(HeadlessGraphicsFixture gfx) => _gfx = gfx;

    [Fact]
    public void RenderTarget_ClearsToColor()
    {
        var rt = new RenderTarget2D(_gfx.GraphicsDevice, 64, 64);
        _gfx.GraphicsDevice.SetRenderTarget(rt);
        _gfx.GraphicsDevice.Clear(Color.CornflowerBlue);
        _gfx.GraphicsDevice.SetRenderTarget(null);

        var pixels = new Color[64 * 64];
        rt.GetData(pixels);

        Assert.All(pixels, p => Assert.Equal(Color.CornflowerBlue, p));
        rt.Dispose();
    }
}
```

**Limitation:** This only works on Windows with DirectX. DesktopGL has no equivalent software rasterizer fallback. For cross-platform CI, run rendering tests only on Windows runners.

---

## GitHub Actions Configuration

```yaml
name: CI

on: [push, pull_request]

jobs:
  logic-tests:
    # Runs on any OS — no GPU required
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '8.0.x'
      - run: dotnet test MyGame.Tests/ --configuration Release --logger trx

  render-tests:
    # Windows only — uses DirectX WARP software renderer
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '8.0.x'
      - run: dotnet test MyGame.RenderTests/ --configuration Release --logger trx

  build:
    needs: [logic-tests, render-tests]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '8.0.x'
      - run: dotnet build --configuration Release
```

### GitLab CI Configuration

```yaml
stages:
  - test
  - build

logic-tests:
  stage: test
  image: mcr.microsoft.com/dotnet/sdk:8.0
  script:
    - dotnet test MyGame.Tests/ --configuration Release

render-tests:
  stage: test
  tags:
    - windows  # Requires a Windows runner with DirectX support
  script:
    - dotnet test MyGame.RenderTests/ --configuration Release

build:
  stage: build
  image: mcr.microsoft.com/dotnet/sdk:8.0
  needs: [logic-tests, render-tests]
  script:
    - dotnet build --configuration Release
```

---

## Content Pipeline Testing

MonoGame's `ContentManager` requires a `GraphicsDevice` for loading textures, effects, and models. For CI testing of content loading:

### Strategy 1: Test Content Build Only

Verify that the content pipeline compiles all assets without errors. This doesn't need a `GraphicsDevice` — it just runs the MGCB/Content Builder tool:

```yaml
# In your CI config
- run: dotnet build MyGame/ -t:BuildContent --configuration Release
```

### Strategy 2: Mock ContentManager for Logic Tests

```csharp
public interface IContentProvider
{
    T Load<T>(string assetName) where T : class;
}

public class MockContentProvider : IContentProvider
{
    private readonly Dictionary<string, object> _assets = new();

    public void Register<T>(string name, T asset) where T : class
        => _assets[name] = asset;

    public T Load<T>(string assetName) where T : class
        => _assets.TryGetValue(assetName, out var asset)
            ? (T)asset
            : throw new ContentLoadException($"Mock: {assetName} not registered");
}
```

---

## Test Categories and Filtering

Use xUnit traits to categorize tests so CI can selectively run them:

```csharp
public class RequiresGpuAttribute : Attribute, ITraitAttribute { }

public class RequiresGpuDiscoverer : ITraitDiscoverer
{
    public IEnumerable<KeyValuePair<string, string>> GetTraits(IAttributeInfo traitAttribute)
    {
        yield return new KeyValuePair<string, string>("Category", "RequiresGpu");
    }
}

// Usage
[Fact]
[RequiresGpu]
public void Shader_Compiles_Without_Errors() { /* ... */ }

// Run without GPU tests:
// dotnet test --filter "Category!=RequiresGpu"

// Run only GPU tests:
// dotnet test --filter "Category=RequiresGpu"
```

---

## Summary

| Concern | Strategy |
|---------|----------|
| Game logic (ECS, math, state) | Pure logic tests, run on any OS |
| Content pipeline compilation | `dotnet build -t:BuildContent`, headless-safe |
| Texture/model loading | Mock `IContentProvider`, or WindowsDX + WARP |
| Shader compilation | WindowsDX + WARP on Windows runners |
| Render output verification | WindowsDX + WARP, pixel-compare with tolerance |
| Cross-platform CI | Split into logic (Linux) and render (Windows) jobs |

The upcoming headless runtime (tracked in [MonoGame #7121](https://github.com/MonoGame/MonoGame/issues/7121)) aims to eliminate the need for WARP workarounds by providing a software-only `GraphicsDevice` on all platforms. Until then, the two-project split strategy keeps your CI green across environments.
