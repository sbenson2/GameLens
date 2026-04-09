# G105 — MonoGame 3.8.5 Preview Updates (Preview.2 & Preview.3)

> **Category:** guide · **Engine:** MonoGame · **Related:** [G91 3.8.5 Migration Guide](./G91_385_migration_guide.md) · [G82 3.8.5 StarterKit & New APIs](./G82_385_starterkit_new_apis.md) · [G83 Vulkan & DX12 Backends](./G83_vulkan_dx12_backends.md) · [G100 Content Builder Project](./G100_385_content_builder_project.md) · [G7 Input Handling](./G7_input_handling.md) · [G8 Content Pipeline](./G8_content_pipeline.md)

What's new and changed across MonoGame **3.8.5-preview.2** (January 2, 2026) and **3.8.5-preview.3** (January 2026). Covers .NET 10 support, 8-gamepad input, content pipeline caching, StarterKit templates with Vulkan/DX12 targets, and known issues. For migration steps from 3.8.2–3.8.4, see [G91](./G91_385_migration_guide.md).

---

## Preview Release Timeline

| Preview | Date | Headline |
|---------|------|----------|
| preview.1 | Dec 19, 2025 | First public preview — Vulkan/DX12 backends, Content Builder Project, 8-gamepad support, 100+ fixes |
| preview.2 | Jan 2, 2026 | New StarterKit templates with VK/DX12 targets, template refinements |
| preview.3 | Jan 2026 | .NET 10 support, content caching, continued stabilization |

> **Status (April 2026):** All three previews are available on NuGet. No stable 3.8.5 release yet. Pin your preview version in `Directory.Build.props` or `.csproj` to avoid CI surprises.

---

## .NET 10 Support (Preview.3)

MonoGame 3.8.5-preview.3 adds compatibility with the .NET 10 SDK, aligning with the upcoming .NET 10 LTS release (November 2026).

### What This Means for Your Project

```xml
<!-- You can now target .NET 10 -->
<TargetFramework>net10.0</TargetFramework>

<!-- Multi-targeting for transitional projects -->
<TargetFrameworks>net9.0;net10.0</TargetFrameworks>
```

### Practical Guidance

- **.NET 9 still works.** If you're shipping soon, stay on .NET 9. The .NET 10 support is forward-looking.
- **NativeAOT improvements.** .NET 10 brings better AOT compilation — see [G81 NativeAOT Publishing](./G81_nativeaot_publishing.md) for MonoGame-specific guidance.
- **Workload alignment.** If targeting mobile, ensure your Android/iOS workloads match: `dotnet workload install android --version 10.0.xxx`. Check `dotnet workload list` after upgrading.
- **CI/CD.** Pin the SDK version in `global.json` to avoid build drift between preview.2 (.NET 9) and preview.3 (.NET 10):

```json
{
  "sdk": {
    "version": "10.0.100-preview.4",
    "rollForward": "latestPatch"
  }
}
```

---

## 8-Gamepad Input Support

Previous MonoGame releases supported up to 4 simultaneous gamepads (`PlayerIndex.One` through `PlayerIndex.Four`). MonoGame 3.8.5 extends this to **8 gamepads**, addressing local multiplayer games, arcade cabinets, and party game scenarios.

### API Changes

The `PlayerIndex` enum now includes values up to `Eight`:

```csharp
// New in 3.8.5 — indices Five through Eight
GamePadState state5 = GamePad.GetState(PlayerIndex.Five);
GamePadState state6 = GamePad.GetState(PlayerIndex.Six);
GamePadState state7 = GamePad.GetState(PlayerIndex.Seven);
GamePadState state8 = GamePad.GetState(PlayerIndex.Eight);
```

### Integration Pattern

If you're using an input manager (see [G7 Input Handling](./G7_input_handling.md) and [G92 Input Action Mapping](./G92_input_action_mapping.md)), update your player-to-gamepad mapping:

```csharp
public class GamepadManager
{
    // Bumped from 4 to 8
    public const int MaxGamepads = 8;

    private readonly GamePadState[] _currentStates = new GamePadState[MaxGamepads];
    private readonly GamePadState[] _previousStates = new GamePadState[MaxGamepads];

    public void Update()
    {
        for (int i = 0; i < MaxGamepads; i++)
        {
            _previousStates[i] = _currentStates[i];
            _currentStates[i] = GamePad.GetState((PlayerIndex)i);
        }
    }

    public bool IsConnected(int index)
        => index < MaxGamepads && _currentStates[index].IsConnected;

    public int ConnectedCount()
        => _currentStates.Count(s => s.IsConnected);
}
```

### Backward Compatibility

- Existing code using `PlayerIndex.One` through `PlayerIndex.Four` works unchanged.
- `GamePad.GetState()` for indices 5–8 returns a disconnected state on platforms or drivers that don't support more than 4 controllers.
- **Test on target hardware.** Not all platforms report 8 controllers consistently — Windows with XInput is limited to 4 by the XInput API. SDL-backed platforms (DesktopGL, DesktopVK) typically support 8+ via SDL's joystick layer.

---

## Content Pipeline Caching

Preview.3 introduces **incremental content builds** — the content pipeline now caches intermediate build results and only recompiles assets that have changed.

### How It Works

```
First build:          Subsequent builds:
┌──────────────┐     ┌──────────────┐
│ All assets   │     │ Changed      │
│ compiled     │     │ assets only  │
│ (slow)       │     │ (fast)       │
├──────────────┤     ├──────────────┤
│ Cache written│     │ Cache checked│
│ to obj/      │     │ hash match?  │
│              │     │ → skip build │
└──────────────┘     └──────────────┘
```

### Enabling Content Caching

Content caching is **on by default** in preview.3 when using the new Content Builder Project (see [G100](./G100_385_content_builder_project.md)). For MGCB-based projects, caching behavior depends on your build configuration.

```csharp
// In your Content Builder Program.cs (new-style projects)
var builder = ContentBuilder.Create(args);

// Caching is on by default — force full rebuild if needed
if (args.Contains("--clean"))
{
    builder.CleanCache();
}

builder.Build();
```

### Cache Location

Build artifacts and hash files are stored in the `obj/` directory alongside your content project, following the same pattern as MSBuild intermediate output:

```
MyContentBuilder/
├── obj/
│   ├── DesktopGL/
│   │   ├── content_cache.json     # Hash manifest
│   │   └── ... (intermediate .xnb)
│   └── Android/
│       └── ...
└── bin/
    └── ... (final output)
```

### CI/CD Considerations

- **Cache the `obj/` directory** in your CI pipeline to get incremental builds across runs.
- **Cross-platform builds** maintain separate caches per platform — no conflicts when building DesktopGL and Android from the same source.
- Use `--clean` for release builds to ensure a full recompile.

```yaml
# GitLab CI example
build:
  cache:
    key: content-${CI_COMMIT_REF_SLUG}
    paths:
      - MyContentBuilder/obj/
  script:
    - dotnet run --project MyContentBuilder
```

### Impact

| Project Size | Before (full build) | After (cached, no changes) |
|-------------|--------------------|-----------------------------|
| Small (50 assets) | ~8s | ~1s |
| Medium (200 assets) | ~45s | ~3s |
| Large (500+ assets) | ~2min+ | ~5s |

Exact numbers depend on asset types — texture compression and shader compilation benefit most.

---

## StarterKit Templates (Preview.2)

Preview.2 introduces updated **StarterKit templates** via `dotnet new`. These provide working game projects with sensible defaults for each backend, including the new Vulkan and DX12 targets.

### Available Templates

```bash
# List all MonoGame templates after installing preview.2
dotnet new list monogame

# Template names (3.8.5-preview.2+)
dotnet new mgdesktopgl     # OpenGL (current stable backend)
dotnet new mgdesktopvk     # Vulkan (preview)
dotnet new mgwindowsdx     # DirectX 11 (current Windows backend)
dotnet new mgdesktopdx12   # DirectX 12 (preview, Windows only)
dotnet new mgandroid        # Android
dotnet new mgios            # iOS
dotnet new mgcb             # Content Builder Project (replaces MGCB)
dotnet new mgstarterkit     # Full starter kit with Content Builder
```

### StarterKit Structure

The `mgstarterkit` template scaffolds a complete project with the new Content Builder:

```
MyGame/
├── MyGame/
│   ├── MyGame.csproj
│   ├── Game1.cs
│   └── Content/
│       └── (raw assets here)
├── MyGame.ContentBuilder/
│   ├── MyGame.ContentBuilder.csproj
│   └── Program.cs
└── MyGame.sln
```

### Choosing a Backend

| Backend | Status | Best For |
|---------|--------|----------|
| DesktopGL | Stable | Cross-platform (Windows, macOS, Linux) — proven, ship today |
| DesktopVK | Preview | Future cross-platform default — test now, ship when stable |
| WindowsDX | Stable | Windows-only, DX11 — proven for Windows releases |
| DesktopDX12 | Preview | Windows-only, DX12 — test for future Windows titles |

> **Recommendation:** Start new projects with DesktopGL for shipping. Create a parallel DesktopVK project for testing. When 3.9 promotes Vulkan to stable, DesktopGL will be deprecated.

---

## Vulkan & DX12 Backend Updates

Preview.2 refines the Vulkan and DX12 backends introduced in preview.1. Key changes:

### What Works

- Core rendering pipeline (SpriteBatch, BasicEffect, custom effects)
- Sound effects via OpenAL/SDL
- Gamepad, keyboard, mouse input
- Window management and fullscreen
- Content pipeline output is identical — same `.xnb` files work on all backends

### Known Issues (as of preview.2)

| Issue | Backend | Severity | Workaround |
|-------|---------|----------|------------|
| `MediaPlayer` non-functional | VK, DX12 | Medium | Use SoundEffect for music, or fall back to DesktopGL for music-heavy games |
| Single-frame screen tearing | VK | Low | Sporadic, not reliably reproducible |
| Fails on some GPU configs | DX12 | Medium | Test on target hardware early — some older GPUs lack DX12 feature level 11_0 |
| Shader compilation differences | VK | Low | SPIR-V cross-compilation may produce subtly different results — visually verify effects |

### API Surface

The Vulkan and DX12 backends are **API-compatible** with DesktopGL and WindowsDX. Your game code does not change — only the project template and NuGet package differ:

```xml
<!-- DesktopVK -->
<PackageReference Include="MonoGame.Framework.DesktopVK"
                  Version="3.8.5-preview.2" />

<!-- DesktopDX12 -->
<PackageReference Include="MonoGame.Framework.WindowsDX12"
                  Version="3.8.5-preview.2" />
```

For full backend migration details, see [G83 Vulkan & DX12 Backends](./G83_vulkan_dx12_backends.md).

---

## Other Notable Changes

### Over 100 Fixes Since 3.8.4

Preview.1 included over 100 bug fixes and improvements accumulated during the development cycle. Highlights relevant to game developers:

- **Android compliance** — updated to meet Google Play policy requirements (builds on 3.8.4.1 fixes)
- **iOS stability** — fixes for device rotation and safe area reporting
- **Content pipeline** — improved error messages for missing processors, better handling of paths with spaces
- **SpriteBatch** — minor batching optimizations on all platforms

### Deprecation Notices

- **DesktopGL** will eventually be replaced by DesktopVK. No removal date set — DesktopGL continues to work in 3.8.5 and will be supported through 3.9.
- **MGCB Editor GUI** is no longer the recommended content workflow. It still functions but receives no new features. New projects should use the Content Builder Project.

---

## Upgrade Checklist

For teams evaluating the 3.8.5 previews:

1. **Read [G91 Migration Guide](./G91_385_migration_guide.md)** for step-by-step NuGet and project changes
2. **Test on DesktopGL first** — confirm your game works on the new framework version before trying Vulkan/DX12
3. **Try the Content Builder** — create a parallel Content Builder Project (see [G100](./G100_385_content_builder_project.md)) alongside your existing MGCB setup
4. **Test 8-gamepad support** if you support local multiplayer
5. **Enable content caching** in CI for faster build times
6. **Pin preview versions** — do not use floating version ranges for preview packages
7. **Report issues** on the [MonoGame GitHub Discussions](https://github.com/MonoGame/MonoGame/discussions/9155) — the team is actively collecting feedback

---

## Further Reading

- [G82 3.8.5 StarterKit & New APIs](./G82_385_starterkit_new_apis.md) — detailed API additions
- [G83 Vulkan & DX12 Backends](./G83_vulkan_dx12_backends.md) — backend architecture and setup
- [G100 Content Builder Project](./G100_385_content_builder_project.md) — full guide to the new content system
- [G81 NativeAOT Publishing](./G81_nativeaot_publishing.md) — AOT compilation benefits with .NET 10
- [G80 CI/CD Automated Builds](./G80_ci_cd_automated_builds.md) — integrating content caching into pipelines
