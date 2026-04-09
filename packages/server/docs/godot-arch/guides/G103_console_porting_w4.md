# G103 — Console Porting with W4 Consoles

> **Category:** guide · **Engine:** Godot 4.4+ · **Related:** [G22 Mobile & Web Export](./G22_mobile_and_web_export.md) · [G42 Platform Integration & Steamworks](./G42_platform_integration_and_steamworks.md) · [G20 CI/CD & Export Pipelines](./G20_cicd_and_export_pipelines.md) · [G89 Platform-Specific Optimization](./G89_platform_specific_optimization.md) · [G98 Custom Export Templates & Build Optimization](./G98_custom_export_templates_and_build_optimization.md)

Godot Engine doesn't ship official console export templates because Nintendo, Sony, and Microsoft require NDA-protected SDKs. **W4 Games** fills this gap with **W4 Consoles** — commercial middleware that provides Godot 4.x export templates for Nintendo Switch (and Switch 2), PlayStation 5, and Xbox Series X|S. This guide covers the requirements, workflow, platform-specific considerations, performance budgets, and certification pitfalls for shipping a Godot game on consoles.

---

## Table of Contents

1. [Why Console Export Needs Middleware](#1-why-console-export-needs-middleware)
2. [W4 Consoles Overview](#2-w4-consoles-overview)
3. [Requirements and Developer Registration](#3-requirements-and-developer-registration)
4. [Supported Godot Versions and Features](#4-supported-godot-versions-and-features)
5. [Project Setup for Console Targets](#5-project-setup-for-console-targets)
6. [Platform-Specific Considerations: Nintendo Switch](#6-platform-specific-considerations-nintendo-switch)
7. [Platform-Specific Considerations: PlayStation 5](#7-platform-specific-considerations-playstation-5)
8. [Platform-Specific Considerations: Xbox Series X|S](#8-platform-specific-considerations-xbox-series-xs)
9. [Console Performance Budgets](#9-console-performance-budgets)
10. [Input Handling for Controllers](#10-input-handling-for-controllers)
11. [Platform Services: Achievements, Saves, and Presence](#11-platform-services-achievements-saves-and-presence)
12. [Certification and Submission Checklist](#12-certification-and-submission-checklist)
13. [Alternative Console Porting Approaches](#13-alternative-console-porting-approaches)
14. [Common Mistakes](#14-common-mistakes)

---

## 1. Why Console Export Needs Middleware

Godot is open-source, but console SDKs are **NDA-protected**. Nintendo, Sony, and Microsoft only share their toolchains with registered developers under legal agreements. This means:

- The Godot project cannot ship console export templates in its open-source releases.
- Console builds require proprietary compilers, libraries, and certification tools.
- Someone must build and maintain Godot's rendering, audio, and input backends against each console's SDK.

W4 Games (founded by Godot core contributors) does exactly this — they maintain production-grade console ports of Godot and sell access as a subscription.

---

## 2. W4 Consoles Overview

### What You Get

- **Export templates** for Nintendo Switch, Switch 2 (beta), PlayStation 5, and Xbox Series X|S.
- **Full engine feature support** — rendering (Vulkan/platform-native), physics (Jolt and Godot Physics), audio, input, and networking all work.
- **C# support** is available for Nintendo Switch and Xbox Series X|S (beta as of early 2026).
- **Platform-specific API bindings** — achievements, cloud saves, and platform presence are exposed to GDScript and C#.
- **Direct support** from W4 engineers familiar with both Godot internals and console SDKs.

### Pricing (as of 2026)

| Tier | Annual Revenue | Price |
|------|---------------|-------|
| Indie | Under $300K | $2,000/year per platform |
| Standard | $300K+ | $10,000/year per platform |

Subscriptions are annual. Each platform is licensed separately.

### Supported Godot Versions

| Godot Version | Switch 1 | Switch 2 | PS5 | Xbox Series |
|---------------|----------|----------|-----|-------------|
| 4.5 | ✅ | ✅ (beta) | ✅ | ✅ |
| 4.4 | ✅ | ✅ (beta) | ✅ | ✅ |
| 4.3 | ✅ | — | — | ✅ |

---

## 3. Requirements and Developer Registration

Before you can use W4 Consoles, you need **registered developer status** with each platform holder:

### Nintendo

1. Apply at [developer.nintendo.com](https://developer.nintendo.com).
2. Requires a registered business entity (not individuals in most regions).
3. Approval takes 2–8 weeks.
4. Once approved, you get access to the Nintendo SDK and dev kit ordering.

### Sony (PlayStation Partners)

1. Apply at [partners.playstation.net](https://partners.playstation.net).
2. Requires a registered studio or publisher.
3. You'll need a PS5 dev kit (or test kit for smaller studios).

### Microsoft (ID@Xbox)

1. Apply at [developer.microsoft.com/games](https://developer.microsoft.com/games).
2. ID@Xbox program is more accessible — individuals and small studios can apply.
3. Xbox dev kits can be provisioned on retail hardware via Dev Mode ($20 one-time).

### W4 Games

After you have platform developer status:

1. Visit [w4games.com/w4consoles](https://www.w4games.com/w4consoles).
2. Select your platform(s) and tier.
3. W4 verifies your platform developer registration.
4. You receive access to the console export templates, documentation, and support channels.

---

## 4. Supported Godot Versions and Features

W4 Consoles supports the **same GDScript and C# code** you already wrote for desktop. You don't maintain a separate codebase. The key differences are under the hood:

### Rendering

Console builds use platform-optimized rendering backends. On Switch, the Forward+ renderer has specific limitations — see [Section 6](#6-platform-specific-considerations-nintendo-switch). PS5 and Xbox Series have full Forward+ and Compatibility renderer support.

### GDExtension

Your GDExtension libraries must be **recompiled** for each console's architecture (ARM for Switch, x86-64 for PS5/Xbox). W4 provides guidance for cross-compilation, but any third-party native library you depend on (e.g., FMOD, Wwise) must also support the target console.

### C# (Mono/.NET)

C# support on consoles uses AOT (Ahead-of-Time) compilation instead of JIT. This means:

- **Reflection-heavy code may break.** Ensure your C# code doesn't rely on runtime code generation.
- **Trimming is aggressive.** Types only referenced via reflection need explicit preservation.
- **Build times are longer** than desktop due to AOT compilation.

```csharp
// Console-safe: direct type usage
var manager = new GameManager();

// Console-risky: reflection-based instantiation
// This may fail under AOT if GameManager isn't preserved
var type = Type.GetType("GameManager");
var instance = Activator.CreateInstance(type);
```

---

## 5. Project Setup for Console Targets

### Renderer Selection

```
Project → Project Settings → Rendering → Renderer
```

| Console | Recommended Renderer | Notes |
|---------|---------------------|-------|
| PS5 | Forward+ | Full feature set, PS5 has headroom |
| Xbox Series X | Forward+ | Full feature set |
| Xbox Series S | Forward+ or Compatibility | Series S has ~4 TFLOPS — test both |
| Switch 1 | Compatibility | Switch GPU is ~400 GFLOPS — Forward+ is too heavy |
| Switch 2 | Forward+ | Significant GPU upgrade supports Forward+ |

### Export Presets

Console export presets work like any other Godot export preset. After installing W4's templates:

```
Project → Export → Add... → [Nintendo Switch / PlayStation 5 / Xbox Series]
```

Each preset exposes platform-specific settings for:

- **Application metadata** (title ID, publisher info, age ratings)
- **Icon and splash screens** (platform-mandated sizes and formats)
- **Feature flags** (network features, save data size, peripherals)
- **Encryption and signing** (handled automatically by the export pipeline)

### Abstraction Layer for Platform Code

Use feature tags and a platform abstraction to keep your main game code clean:

```gdscript
# platform_services.gd — abstract base
class_name PlatformServices

func unlock_achievement(_id: String) -> void:
    pass

func save_to_cloud(_data: Dictionary) -> bool:
    return false

func get_platform_name() -> String:
    return "unknown"
```

```gdscript
# platform_switch.gd
class_name PlatformSwitch extends PlatformServices

func unlock_achievement(id: String) -> void:
    # W4 exposes NintendoSDK achievement APIs
    if Engine.has_singleton("NintendoAccount"):
        Engine.get_singleton("NintendoAccount").unlock_achievement(id)

func get_platform_name() -> String:
    return "switch"
```

```csharp
// PlatformServices.cs — abstract base
public abstract class PlatformServices
{
    public abstract void UnlockAchievement(string id);
    public abstract bool SaveToCloud(Godot.Collections.Dictionary data);
    public abstract string GetPlatformName();
}

// PlatformXbox.cs
public class PlatformXbox : PlatformServices
{
    public override void UnlockAchievement(string id)
    {
        // W4 exposes Xbox Live achievement APIs
        if (Engine.HasSingleton("XboxLive"))
        {
            var xbox = Engine.GetSingleton("XboxLive");
            xbox.Call("unlock_achievement", id);
        }
    }

    public override string GetPlatformName() => "xbox";

    public override bool SaveToCloud(Godot.Collections.Dictionary data) => false;
}
```

Load the correct implementation at startup using feature tags:

```gdscript
func _get_platform_services() -> PlatformServices:
    if OS.has_feature("switch"):
        return PlatformSwitch.new()
    elif OS.has_feature("playstation"):
        return PlatformPS5.new()
    elif OS.has_feature("xbox"):
        return PlatformXbox.new()
    else:
        return PlatformSteam.new()
```

---

## 6. Platform-Specific Considerations: Nintendo Switch

### Hardware Constraints

- **CPU:** ARM Cortex-A57 (4 cores @ 1.02 GHz)
- **GPU:** ~400 GFLOPS (Maxwell-based, docked), ~160 GFLOPS handheld
- **RAM:** 4 GB shared (game gets ~3.2 GB)
- **Storage:** Game cards + internal NAND, no mandatory install

### Key Guidelines

- **Use the Compatibility renderer.** Forward+ is too heavy for Switch 1.
- **Target 720p docked, 540p–720p handheld.** Dynamic resolution scaling is recommended.
- **Texture compression:** Use ASTC (preferred) or ETC2. Switch does not support S3TC/BCn.
- **Draw calls matter.** Batch aggressively — Switch's GPU is fill-rate limited.
- **Audio:** Use OGG Vorbis, not WAV. RAM is tight.
- **Loading:** Use `ResourceLoader.load_threaded_request()` to avoid hitching during scene transitions.

### Docked vs. Handheld

```gdscript
func _ready() -> void:
    # Switch reports different screen sizes for docked vs handheld
    var screen_size := DisplayServer.screen_get_size()
    if screen_size.x >= 1920:
        _apply_docked_settings()
    else:
        _apply_handheld_settings()

func _apply_handheld_settings() -> void:
    # Reduce resolution scale for handheld performance
    get_viewport().scaling_3d_scale = 0.75
    RenderingServer.directional_shadow_atlas_set_size(1024, false)
```

---

## 7. Platform-Specific Considerations: PlayStation 5

### Hardware Headroom

PS5 has significant power (10.28 TFLOPS, 16 GB GDDR6). Godot games rarely push PS5 hardware limits. Focus on:

- **DualSense features:** W4 exposes haptic feedback and adaptive triggers via the Input singleton.
- **Activity Cards:** Sony requires activity card support for certification — these show game progress on the PS5 dashboard.
- **SSD-optimized loading:** PS5's NVMe SSD is extremely fast. Avoid unnecessary loading screens.
- **Trophy system:** Map your achievement IDs to PS5 trophies (Platinum, Gold, Silver, Bronze).

### DualSense Haptics (GDScript)

```gdscript
# DualSense adaptive triggers — W4 exposes these through Input
# Check W4 documentation for exact API as it may evolve
func set_trigger_resistance(device_id: int, trigger: int, start: float, strength: float) -> void:
    if Engine.has_singleton("PlayStationInput"):
        Engine.get_singleton("PlayStationInput").set_adaptive_trigger(
            device_id, trigger, start, strength
        )
```

---

## 8. Platform-Specific Considerations: Xbox Series X|S

### Key Differences

- **Series X:** 12 TFLOPS, 16 GB GDDR6 — full Forward+ with room to spare.
- **Series S:** 4 TFLOPS, 10 GB GDDR6 (8 GB accessible to games) — test carefully, reduce resolution.
- **Smart Delivery:** Ship one package that runs on both X and S with appropriate quality settings.
- **Xbox Live:** Required for online features, achievements, cloud saves, and Game Pass integration.

### Scaling Between X and S

```gdscript
func _configure_for_xbox() -> void:
    # Detect console variant via available RAM or W4-provided API
    var total_ram_mb := OS.get_static_memory_usage() # Approximate check
    if Engine.has_singleton("XboxSystem"):
        var variant: String = Engine.get_singleton("XboxSystem").get_console_type()
        match variant:
            "series_x":
                get_viewport().scaling_3d_scale = 1.0  # Native 4K target
            "series_s":
                get_viewport().scaling_3d_scale = 0.67  # 1080p target
```

---

## 9. Console Performance Budgets

| Target | Resolution | FPS | Draw Calls | Triangles/Frame |
|--------|-----------|-----|------------|----------------|
| Switch Handheld | 720p | 30 | <500 | <200K |
| Switch Docked | 1080p | 30 | <700 | <300K |
| Xbox Series S | 1080p–1440p | 60 | <2000 | <1M |
| Xbox Series X | 4K | 60 | <3000 | <3M |
| PS5 | 4K | 60 | <3000 | <3M |

These are guidelines, not hard limits. Profile on actual hardware — dev kits have profiling tools that Godot's built-in profiler can't replace.

### General Console Optimization

- **Occlusion culling** is critical on Switch. Use `OccluderInstance3D` aggressively.
- **LOD (Level of Detail)** — configure `VisibilityRange` on `MeshInstance3D` nodes.
- **Shader baking** (Godot 4.5+) eliminates first-frame shader compilation stutter. Enable it in export settings.
- **GDScript vs. C# performance:** On console, C# AOT code runs closer to native speed than on desktop JIT. For hot loops, C# can be 2–5x faster than GDScript.

---

## 10. Input Handling for Controllers

All three consoles use standard gamepad layouts. Godot's `Input` system maps console controllers to the standard `JoyButton` and `JoyAxis` enums:

```gdscript
func _input(event: InputEvent) -> void:
    if event is InputEventJoypadButton:
        match event.button_index:
            JOY_BUTTON_A:  # Bottom face button (B on Switch, Cross on PS5)
                _confirm()
            JOY_BUTTON_B:  # Right face button (A on Switch, Circle on PS5)
                _cancel()
```

### Console Button Label Conventions

| Godot Enum | Xbox | PlayStation | Switch |
|-----------|------|------------|--------|
| `JOY_BUTTON_A` | A | Cross (×) | B |
| `JOY_BUTTON_B` | B | Circle (○) | A |
| `JOY_BUTTON_X` | X | Square (□) | Y |
| `JOY_BUTTON_Y` | Y | Triangle (△) | X |

**Certification requirement:** Show the correct button icons for the active platform. Use `OS.has_feature()` to select icon sets:

```gdscript
func _get_confirm_icon() -> Texture2D:
    if OS.has_feature("playstation"):
        return preload("res://ui/icons/ps_cross.png")
    elif OS.has_feature("switch"):
        return preload("res://ui/icons/switch_b.png")
    else:
        return preload("res://ui/icons/xbox_a.png")
```

---

## 11. Platform Services: Achievements, Saves, and Presence

Each console has its own achievement, save, and presence system. Use the abstraction pattern from [Section 5](#5-project-setup-for-console-targets) and implement platform-specific backends.

### Save Data

Console save systems are **not** filesystem-based like desktop. Each platform has a save data API with size limits:

| Platform | Save System | Typical Limit |
|----------|------------|---------------|
| Switch | Save Data API | 32 MB (configurable) |
| PS5 | Save Data API | 1 GB (activity-based) |
| Xbox | Connected Storage | 256 MB local, 64 MB roaming |

```gdscript
# Abstract save interface
func save_game(data: Dictionary) -> bool:
    var json := JSON.stringify(data)
    if OS.has_feature("switch") or OS.has_feature("playstation") or OS.has_feature("xbox"):
        # Use platform save API via W4 singleton
        if Engine.has_singleton("PlatformSave"):
            return Engine.get_singleton("PlatformSave").write("save_slot_1", json)
    # Desktop fallback
    var file := FileAccess.open("user://save.json", FileAccess.WRITE)
    file.store_string(json)
    return true
```

---

## 12. Certification and Submission Checklist

Every console has a **Technical Requirements Checklist (TRC/Lotcheck/XR)** you must pass before release. Common requirements across all platforms:

- [ ] Game suspends and resumes correctly (home button, sleep, etc.)
- [ ] All text is legible at minimum supported resolution
- [ ] Button prompts match the active controller
- [ ] Save data handles corruption gracefully (don't crash, offer recovery)
- [ ] Network disconnection is handled without crashing
- [ ] Age rating information is correctly configured
- [ ] No placeholder text, debug output, or profiler overlays in release builds
- [ ] Loading times are within platform-mandated limits
- [ ] Accessibility features meet platform guidelines (where mandated)
- [ ] Application exits cleanly without memory leaks reported by platform tools

### Platform-Specific Cert Requirements

- **Nintendo Lotcheck:** Strict about UI text size (minimum font size), save data icon, and handheld/docked behavior.
- **Sony TRC:** Activity cards, trophy implementation (must have Platinum if >1 trophy), and DualSense feature usage.
- **Microsoft XR:** Xbox Live sign-in flow, achievement implementation, and Smart Delivery configuration.

---

## 13. Alternative Console Porting Approaches

W4 Consoles is the primary commercial option, but alternatives exist:

| Approach | Pros | Cons |
|----------|------|------|
| **W4 Consoles** | Official-grade, maintained by Godot core devs, C# support | Subscription cost, annual commitment |
| **Lone Wolf Technology** | Independent Godot console ports (Switch) | Smaller team, less platform coverage |
| **Custom engine fork** | Full control | Enormous effort, must maintain parity with Godot updates |
| **Pineapple Works** | Console porting services | Studio-as-service model, less self-serve |

For most indie and mid-size studios, W4 Consoles is the most practical path.

---

## 14. Common Mistakes

### Starting console work too late

Console porting isn't a "flip a switch" process. Budget 2–6 months for porting, optimization, and certification. Start early.

### Ignoring Switch constraints during development

If Switch is a target, use the **Compatibility renderer** from day one and test with Switch-like constraints (720p, low draw call budget). Retrofitting performance is much harder than building for it.

### Using unsupported GDExtension libraries

Every native library must be recompiled for each console's architecture. Verify console support for all GDExtension dependencies before committing to them.

### Hardcoding filesystem paths

Console save systems are not filesystem-based. Code like `FileAccess.open("user://save.json", ...)` won't work on consoles without platform-specific save API integration.

### Skipping platform-specific input icons

Certification will reject your game if you show Xbox icons on PlayStation or vice versa. Always detect the platform and display correct button art.

### Not budgeting for certification

First-time submissions commonly fail certification. Budget for 1–2 rejection cycles. Each cycle takes 1–4 weeks for re-review.
