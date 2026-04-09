# G82 — MonoGame 3.8.5 StarterKit Templates & New APIs

> **Category:** guide · **Engine:** MonoGame · **Related:** [G72 Content Builder Migration](./G72_content_builder_migration.md) · [G7 Input Handling](./G7_input_handling.md) · [G2 Rendering & Graphics](./G2_rendering_and_graphics.md) · [G81 NativeAOT Publishing](./G81_nativeaot_publishing.md)

What's new in MonoGame 3.8.5 beyond the Content Builder and Vulkan/DX12 backends (covered in G72). This guide covers the new StarterKit project templates, expanded GamePad support for up to 8 controllers, HSL/HSV color conversion APIs, NetStandard 2.1 targeting, the new `Random` implementation, and the `slnx` solution format. These features shipped in 3.8.5-preview.1 (December 2025) and preview.2 (January 2026), with full release expected Q1 2026.

---

## StarterKit Templates

MonoGame 3.8.5 introduces **StarterKit templates** — pre-configured project templates that use the new Content Builder project system (see [G72](./G72_content_builder_migration.md)) and include ready-to-run starter code. Unlike the bare `MonoGame Application` templates from 3.8.4 which give you an empty `Game1` class, StarterKits ship with working game loops, asset loading, and rendering boilerplate.

### What's Included

The StarterKit templates come with platform targets for:

- **DesktopGL** — the standard OpenGL cross-platform target
- **DesktopVK** — the new Vulkan backend (preview)
- **DesktopDX** — the new DirectX 12 backend (preview)

Each template uses the new Content Builder instead of the legacy MGCB Editor. This means content is managed as MSBuild items in the `.csproj` rather than through a separate `.mgcb` file and dotnet tool.

### Installing Templates

```bash
# Install the latest 3.8.5 preview templates
dotnet new install MonoGame.Templates.CSharp::3.8.5-preview.2

# Create a new StarterKit project
dotnet new mgstarterkit -n MyGame

# Or create with a specific graphics backend
dotnet new mgstarterkit -n MyGame --platform DesktopVK
```

### Solution Format: slnx

The 3.8.5 templates use the new **`slnx`** (XML-based) solution format instead of the traditional `.sln` text format. This is a .NET SDK feature (not MonoGame-specific) that provides cleaner, more readable solution files.

If you don't need iOS/Android workloads, the `slnx` format makes it easy to remove platform targets by editing the XML directly — no need for Visual Studio's Solution Explorer.

```xml
<!-- MyGame.slnx — remove platform targets you don't need -->
<Solution>
  <Project Path="MyGame.DesktopGL/MyGame.DesktopGL.csproj" />
  <!-- Remove these if not targeting mobile -->
  <!-- <Project Path="MyGame.Android/MyGame.Android.csproj" /> -->
  <!-- <Project Path="MyGame.iOS/MyGame.iOS.csproj" /> -->
</Solution>
```

> **Note:** Visual Studio 2022 17.10+ and `dotnet build` both support `slnx`. Rider support landed in 2024.3. If your IDE doesn't recognize `slnx`, you can convert back with `dotnet sln migrate MyGame.slnx`.

---

## Extended GamePad Support (Up to 8 Controllers)

MonoGame 3.8.5 extends `GamePad` support from 4 controllers to **8 simultaneous controllers**. This aligns with modern platform capabilities — Steam Input supports 16 controllers, and console platforms increasingly support 8-player local multiplayer.

### What Changed

The `PlayerIndex` enum in XNA/MonoGame historically had four values (`One` through `Four`). In 3.8.5, `GamePad.GetState()` now accepts an integer index from 0–7 in addition to the classic `PlayerIndex` enum.

```csharp
// Classic approach — still works for players 1–4
var state1 = GamePad.GetState(PlayerIndex.One);

// New approach — supports players 1–8 by integer index
for (int i = 0; i < 8; i++)
{
    var state = GamePad.GetState(i);
    if (state.IsConnected)
    {
        HandlePlayerInput(i, state);
    }
}
```

### Practical Pattern: Dynamic Player Join

```csharp
private readonly List<int> _activePlayers = new();

public void Update(GameTime gameTime)
{
    // Check all 8 possible controllers for new joins
    for (int i = 0; i < 8; i++)
    {
        var state = GamePad.GetState(i);
        if (state.IsConnected && !_activePlayers.Contains(i))
        {
            // New controller detected — prompt to join
            if (state.Buttons.Start == ButtonState.Pressed)
            {
                _activePlayers.Add(i);
                OnPlayerJoined(i);
            }
        }
    }

    // Update active players
    foreach (int playerIndex in _activePlayers)
    {
        var state = GamePad.GetState(playerIndex);
        if (!state.IsConnected)
        {
            OnPlayerDisconnected(playerIndex);
            continue;
        }
        UpdatePlayer(playerIndex, state);
    }
}
```

### Migration Note

Existing code using `PlayerIndex` enum values continues to work unchanged. The integer overload is additive. If your game only supports 4 players, no changes are needed.

---

## HSL/HSV Color Conversion APIs

MonoGame 3.8.5 adds built-in HSL (Hue, Saturation, Luminance) and HSV (Hue, Saturation, Value) color conversion to the `Color` struct. Previously, developers needed third-party helpers or manual conversion code for color space manipulation.

### Why HSL/HSV Matters for Games

RGB is how GPUs think about color, but it's awkward for gameplay:

- **Damage flash:** shift hue toward red while keeping brightness
- **Team colors:** rotate hue for each team, identical saturation/brightness
- **Day/night cycles:** adjust luminance without changing hue
- **Color-coded difficulty:** map difficulty 0–1 to hue (green → red)
- **Procedural palettes:** evenly space hues for distinct item colors

### API Usage

```csharp
// Convert RGB Color to HSL components
Color original = Color.CornflowerBlue;
float hue = original.GetHue();           // 0–360 degrees
float saturation = original.GetSaturation(); // 0–1
float luminance = original.GetLuminance();   // 0–1

// Create a Color from HSV values
Color fromHsv = Color.FromHSV(
    hue: 210f,        // blue hue
    saturation: 0.8f,  // high saturation
    value: 0.9f        // bright
);

// Practical: shift hue for team colors
Color baseColor = Color.FromHSV(0f, 0.8f, 0.9f); // red team
Color blueTeam  = Color.FromHSV(240f, 0.8f, 0.9f);
Color greenTeam = Color.FromHSV(120f, 0.8f, 0.9f);
```

### Pattern: Damage Flash with HSL

```csharp
public Color GetDamageFlashColor(Color baseColor, float flashIntensity)
{
    // flashIntensity: 0 = normal, 1 = full damage flash
    float h = baseColor.GetHue();
    float s = baseColor.GetSaturation();
    float l = baseColor.GetLuminance();

    // Shift hue toward red (0°), increase saturation, boost luminance
    float targetHue = 0f;
    h = MathHelper.Lerp(h, targetHue, flashIntensity);
    s = MathHelper.Lerp(s, 1.0f, flashIntensity * 0.5f);
    l = MathHelper.Lerp(l, Math.Min(l + 0.3f, 1.0f), flashIntensity);

    return Color.FromHSL(h, s, l);
}
```

---

## NetStandard 2.1 Support

MonoGame 3.8.5 adds a **NetStandard 2.1** target alongside the existing .NET 8/9/10 targets. This matters for:

- **Shared libraries** — write game logic in a NetStandard 2.1 class library that can be referenced by any MonoGame platform project
- **Plugin/mod systems** — mod authors can target NetStandard 2.1 without needing to match the host game's exact .NET version
- **Blazor/web targets** — NetStandard 2.1 assemblies are compatible with Blazor WebAssembly, enabling potential web-based tooling

### Project Setup

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <!-- Game logic library targeting NetStandard 2.1 -->
    <TargetFramework>netstandard2.1</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="MonoGame.Framework" Version="3.8.5-*" />
  </ItemGroup>
</Project>
```

Your platform-specific projects (DesktopGL, Android, etc.) then reference this shared library while targeting their specific .NET version (e.g., `net10.0`).

---

## New Random Implementation

MonoGame 3.8.5 includes a new `Random` implementation that provides deterministic, seedable random number generation suitable for games. This is separate from `System.Random` and designed for:

- **Deterministic replay** — same seed produces identical sequences across platforms
- **Parallel-safe** — independent instances for different systems (particles, AI, level gen)
- **Game-friendly API** — methods for common game patterns (ranges, weighted selection)

### When to Use

Use MonoGame's `Random` over `System.Random` when you need:

- Identical results across Windows/Linux/macOS for the same seed
- Replay or netcode synchronization that depends on deterministic RNG
- Save/restore of RNG state for savegame systems

For non-deterministic needs (session IDs, shuffle for cosmetic effects), `System.Random.Shared` is fine.

---

## Known Issues (Preview Status)

As of 3.8.5-preview.2, these issues are documented:

| Issue | Workaround |
|-------|-----------|
| Content Builder errors on clean builds | Build twice, or delete `bin/obj` and rebuild |
| Arch Linux + Wine compatibility | Use native Linux builds instead of Wine |
| Vulkan screen tearing | Enable VSync: `graphics.SynchronizeWithVerticalRetrace = true` |
| StarterKit templates require .NET 10 SDK | Install .NET 10 SDK from dotnet.microsoft.com |

These are expected to be resolved before the full 3.8.5 release.

---

## Summary

MonoGame 3.8.5 delivers significant API improvements alongside the headline Content Builder and graphics backend changes:

| Feature | Impact |
|---------|--------|
| StarterKit templates | Faster project bootstrap with Content Builder |
| 8-controller GamePad | 8-player local multiplayer support |
| HSL/HSV colors | Easier color manipulation for gameplay effects |
| NetStandard 2.1 | Shared libraries, mod/plugin compatibility |
| New Random | Deterministic, cross-platform RNG for replays/netcode |
| slnx format | Cleaner solution files, easier platform target management |

For Content Builder migration details, see [G72](./G72_content_builder_migration.md). For Vulkan/DX12 backend setup, see the graphics backend section of G72.
