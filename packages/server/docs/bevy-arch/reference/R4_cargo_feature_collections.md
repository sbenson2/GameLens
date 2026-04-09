# R4 — Cargo Feature Collections & Selective Compilation

> **Category:** reference · **Engine:** Bevy 0.18 · **Related:** [G1 Getting Started](../guides/G1_getting_started.md) · [R1 Plugins & WASM](R1_plugins_and_wasm.md) · [bevy-arch-rules](../bevy-arch-rules.md)

---

## Overview

Bevy 0.18 introduced **Cargo Feature Collections** — high-level feature presets (`2d`, `3d`, `ui`) that let you compile only the parts of the engine your game needs. Before 0.18, trimming Bevy's default features meant manually listing dozens of low-level feature flags. Feature collections give you a single toggle that pulls in a curated set of sub-features.

This matters because Bevy's default build includes everything — 3D rendering, UI, audio, physics hooks, scene serialization. If you're building a 2D-only game, you're compiling (and linking) a lot of code you'll never call. Feature collections fix that with one line in `Cargo.toml`.

---

## The Three Collections

### `2d` — Everything for a 2D Game

```toml
[dependencies]
bevy = { version = "0.18", default-features = false, features = ["2d"] }
```

Includes:

| Sub-feature | What it provides |
|-------------|-----------------|
| `default_app` | `App`, `DefaultPlugins` minus rendering backends |
| `default_platform` | Platform-specific window/event loop |
| `2d_api` | `Sprite`, `SpriteBundle`, `Atlas`, `Camera2d`, transform 2D utils |
| `2d_bevy_render` | The actual wgpu-based 2D renderer |
| `ui` | `bevy_ui` layout, `Node`, `Text`, interaction |
| `scene` | Scene serialization (`DynamicScene`, `.scn.ron` loading) |
| `audio` | `bevy_audio` — spatial and non-spatial audio |
| `picking` | Pointer-based entity picking (click/hover detection) |

**What it excludes:** 3D mesh rendering, PBR materials, lighting, atmosphere, 3D camera controllers, glTF loading. This meaningfully reduces compile time and binary size.

### `3d` — Full 3D Rendering Stack

```toml
[dependencies]
bevy = { version = "0.18", default-features = false, features = ["3d"] }
```

Includes everything in `2d` plus the 3D rendering pipeline: meshes, PBR materials, lights (directional, point, spot), shadows, environment maps, glTF import, `Camera3d`, atmospheric scattering, and the `bevy_pbr` crate.

### `ui` — Minimal UI-Only

```toml
[dependencies]
bevy = { version = "0.18", default-features = false, features = ["ui"] }
```

The lightest collection. Gives you `bevy_ui` with layout, text rendering, and interaction — but no sprite rendering, no 3D, and no audio. Useful for tools, editors, or debug overlays that don't need game rendering.

---

## Mid-Level Features for Fine-Grained Control

The collections are built from composable mid-level features. You can mix and match:

```toml
[dependencies]
# 2D game logic without Bevy's renderer (bring your own)
bevy = { version = "0.18", default-features = false, features = [
    "default_app",
    "default_platform",
    "2d_api",       # Sprite types, Camera2d, etc. — no renderer
    "audio",
] }
```

This is useful if you're integrating a custom rendering backend while still using Bevy's ECS, input, audio, and asset systems.

Key mid-level features:

| Feature | Purpose |
|---------|---------|
| `default_app` | Core `App` builder, `DefaultPlugins` (minus rendering) |
| `default_platform` | Native window/event loop (winit) |
| `2d_api` | 2D types and systems without the renderer |
| `2d_bevy_render` | wgpu-based 2D rendering |
| `3d_api` | 3D types (meshes, materials, lights) without renderer |
| `3d_bevy_render` | wgpu-based 3D rendering |
| `ui` | Layout, text, and interaction |
| `audio` | Audio playback |
| `scene` | Scene serialization and loading |
| `picking` | Entity picking and pointer events |

---

## Practical Configurations

### Game Jam 2D Prototype

```toml
[dependencies]
bevy = { version = "0.18", default-features = false, features = ["2d"] }
```

Fastest path to a working 2D game with audio, UI, and sprites.

### 3D Game with Everything

```toml
[dependencies]
bevy = "0.18"  # default features = full engine
```

When you need the kitchen sink, just use defaults. This is equivalent to the `3d` collection plus dev tools, diagnostics, and additional format support.

### Headless Server (ECS Only)

```toml
[dependencies]
bevy = { version = "0.18", default-features = false, features = [
    "bevy_ecs",
    "bevy_app",
    "bevy_time",
] }
```

No rendering, no window, no audio. Pure ECS scheduling for a game server or simulation backend.

### CI / Testing (Faster Builds)

```toml
# In a [profile.ci] or via feature flags
[dependencies]
bevy = { version = "0.18", default-features = false, features = ["2d_api"] }
```

If your tests only exercise game logic (not rendering), dropping the renderer from CI builds saves significant compile time. Use `2d_api` instead of `2d` to skip `2d_bevy_render`.

---

## Impact on Compile Times

Bevy's full default build pulls in wgpu, naga (shader compiler), image decoders, audio backends, and more. Switching from defaults to `2d` or `ui` can noticeably reduce:

- **Fresh build time** — fewer crates to compile from scratch
- **Incremental build time** — smaller dependency graph means less invalidation
- **Binary size** — unused rendering backends and format decoders are excluded

The exact improvement depends on your machine and project size, but expect the biggest wins on CI runners where fresh builds are common.

---

## Migration from Pre-0.18

If you were already using manual feature flags before 0.18:

```toml
# Before 0.18 — manually listing features
bevy = { version = "0.17", default-features = false, features = [
    "bevy_winit", "bevy_render", "bevy_sprite", "bevy_ui",
    "bevy_text", "bevy_audio", "bevy_scene", "png",
] }

# After 0.18 — one collection
bevy = { version = "0.18", default-features = false, features = ["2d"] }
```

Check the [Bevy 0.18 migration guide](https://bevy.org/learn/migration-guides/0-17-to-0-18/) for the exact mapping of old feature flags to new collections.

---

## Ownership / Borrowing Note

Feature collections are a compile-time concept — they don't affect runtime behavior. A `Sprite` component behaves identically whether you enabled it via `2d` or by manually listing `bevy_sprite`. The only difference is what code gets compiled into your binary. This means you can safely switch between collections without touching game logic.

---

## Quick Reference

| I'm building... | Use this |
|-----------------|----------|
| 2D game | `features = ["2d"]` |
| 3D game | `features = ["3d"]` |
| UI tool / editor | `features = ["ui"]` |
| Headless server | `features = ["bevy_ecs", "bevy_app"]` |
| Custom renderer + Bevy ECS | `features = ["2d_api"]` (no `_bevy_render`) |
| Full engine (default) | `bevy = "0.18"` |
