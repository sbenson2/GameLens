# G14 — Particle Systems & VFX

> **Category:** guide · **Engine:** Bevy 0.18 · **Crate:** bevy_hanabi 0.16 · **Related:** [E1 ECS Fundamentals](../architecture/E1_ecs_fundamentals.md) · [E2 Rendering & Cameras](../architecture/E2_rendering_cameras.md) · [E10 Custom Shaders & Materials](../architecture/E10_custom_shaders_materials.md) · [bevy-arch-rules](../bevy-arch-rules.md)

---

## Overview

Bevy does not ship a built-in particle system. The community standard is **bevy_hanabi** — a GPU-driven particle engine that offloads spawning, simulation, and rendering to compute shaders. This keeps CPU cost near-zero even for effects with tens of thousands of particles.

> **Version note (Bevy 0.18):** bevy_hanabi **0.16** targets Bevy 0.16+. At the time of writing the crate is under active development and API details may shift between minor releases. Always pin your version and check the [compatibility table](https://github.com/djeedai/bevy_hanabi#compatible-bevy-versions).

---

## Setup

```toml
[dependencies]
bevy = "0.18"
bevy_hanabi = "0.16"
```

Register the plugin:

```rust
use bevy::prelude::*;
use bevy_hanabi::prelude::*;

fn main() {
    App::new()
        .add_plugins((
            DefaultPlugins,
            HanabiPlugin,
        ))
        .add_systems(Startup, setup_effects)
        .run();
}
```

> **WASM support:** bevy_hanabi requires WebGPU compute shaders (available since v0.13 / Bevy 0.14). It does **not** work on WebGL2. If you target browsers, confirm your audience has WebGPU-capable browsers.

---

## Core Concepts

### EffectAsset

An `EffectAsset` is the *blueprint* for a particle effect. It defines:

| Field | Purpose |
|-------|---------|
| **capacity** | Maximum simultaneous particles (GPU buffer size) |
| **spawner** | How and when particles are emitted |
| **init modifiers** | Set initial position, velocity, size, color, lifetime |
| **update modifiers** | Per-frame behavior — gravity, drag, acceleration |
| **render modifiers** | Visual appearance — color over lifetime, billboard orientation |

### Modifier Pipeline

Hanabi processes particles through three ordered modifier stages:

1. **Init** — runs once when a particle spawns. Sets initial state.
2. **Update** — runs every frame for every living particle. Applies forces, ages particles, etc.
3. **Render** — runs at draw time. Controls how each particle looks on screen.

Each stage has a library of built-in modifiers you chain together.

### Spawner

Controls emission rate and pattern:

```rust
// Continuous: 10 particles per second
SpawnerSettings::rate(10.0.into())

// Burst: 50 particles, once
SpawnerSettings::once(50.0.into(), true)

// Burst: 100 particles every 2 seconds
SpawnerSettings::burst(100.0.into(), 2.0.into())
```

---

## Basic Example — Fire Effect

```rust
fn setup_effects(
    mut commands: Commands,
    mut effects: ResMut<Assets<EffectAsset>>,
) {
    // 1. Define the effect blueprint
    let mut color_gradient = Gradient::new();
    color_gradient.add_key(0.0, Vec4::new(4.0, 2.0, 0.0, 1.0)); // bright orange
    color_gradient.add_key(0.4, Vec4::new(2.0, 0.5, 0.0, 1.0)); // dark orange
    color_gradient.add_key(1.0, Vec4::new(0.2, 0.0, 0.0, 0.0)); // fade out

    let mut size_gradient = Gradient::new();
    size_gradient.add_key(0.0, Vec3::splat(0.05));
    size_gradient.add_key(1.0, Vec3::splat(0.0));

    let writer = ExprWriter::new();
    let age = writer.lit(0.).expr();
    let init_age = SetAttributeModifier::new(Attribute::AGE, age);
    let lifetime = writer.lit(1.5).expr();
    let init_lifetime = SetAttributeModifier::new(Attribute::LIFETIME, lifetime);

    let init_pos = SetPositionSphereModifier {
        center: writer.lit(Vec3::ZERO).expr(),
        radius: writer.lit(0.1).expr(),
        dimension: ShapeDimension::Volume,
    };

    let init_vel = SetVelocitySphereModifier {
        center: writer.lit(Vec3::ZERO).expr(),
        speed: (writer.lit(1.0) + writer.lit(0.5) * writer.rand(ScalarType::Float)).expr(),
    };

    let effect = EffectAsset::new(4096, SpawnerSettings::rate(50.0.into()), writer.finish())
        .with_name("fire")
        .init(init_pos)
        .init(init_vel)
        .init(init_age)
        .init(init_lifetime)
        .update(LinearDragModifier::new(writer.lit(2.0).expr()))
        .update(AccelModifier::new(writer.lit(Vec3::new(0.0, 2.0, 0.0)).expr()))
        .render(ColorOverLifetimeModifier { gradient: color_gradient })
        .render(SizeOverLifetimeModifier {
            gradient: size_gradient,
            screen_space_size: false,
        });

    let effect_handle = effects.add(effect);

    // 2. Spawn the effect entity
    commands.spawn((
        Name::new("FireEffect"),
        ParticleEffectBundle {
            effect: ParticleEffect::new(effect_handle),
            transform: Transform::from_translation(Vec3::new(0.0, 0.0, 0.0)),
            ..default()
        },
    ));
}
```

> **Rust ownership note:** `ExprWriter` is consumed by `.finish()`, which produces a `Module`. The `writer.lit(...)` calls borrow `&writer`, so you must build all expressions *before* calling `finish()`. If you try to use the writer after finishing, the borrow checker will stop you.

---

## Common Effect Recipes

### Explosion (One-Shot Burst)

```rust
let effect = EffectAsset::new(
    2048,
    SpawnerSettings::once(200.0.into(), true),
    module,
)
    .init(SetPositionSphereModifier {
        center: writer.lit(Vec3::ZERO).expr(),
        radius: writer.lit(0.05).expr(),
        dimension: ShapeDimension::Surface,
    })
    .init(SetVelocitySphereModifier {
        center: writer.lit(Vec3::ZERO).expr(),
        speed: (writer.lit(5.0) + writer.lit(3.0) * writer.rand(ScalarType::Float)).expr(),
    })
    .update(LinearDragModifier::new(writer.lit(4.0).expr()))
    .update(AccelModifier::new(writer.lit(Vec3::new(0.0, -9.8, 0.0)).expr()))
    .render(ColorOverLifetimeModifier { gradient: explosion_gradient })
    .render(SizeOverLifetimeModifier {
        gradient: shrink_gradient,
        screen_space_size: false,
    });
```

**Trigger at runtime:** Spawn the entity when the explosion event fires. Despawn it (or reset the spawner) after the burst completes.

### Trail / Ribbon

For projectile trails, spawn a continuous low-rate effect and parent it to the moving entity. Hanabi respects the `Transform` hierarchy, so the emission point follows the parent automatically.

```rust
commands.spawn((
    Name::new("Projectile"),
    Transform::from_translation(start_pos),
    Visibility::default(),
))
.with_children(|parent| {
    parent.spawn(ParticleEffectBundle {
        effect: ParticleEffect::new(trail_handle.clone()),
        ..default()
    });
});
```

---

## Performance Guidelines

| Concern | Recommendation |
|---------|---------------|
| **Capacity** | Set the smallest capacity that covers your peak. GPU memory is allocated up-front per-effect. |
| **Spawner rate** | More particles ≠ better visuals. Tune lifetime + size before increasing count. |
| **Modifier count** | Each modifier adds a compute shader pass. Combine logic where possible. |
| **Effect pooling** | Reuse effect entities (reset spawner) instead of spawn/despawn churn for repeated effects like bullet impacts. |
| **WASM** | GPU particles require WebGPU. Budget 30–50% fewer particles on web targets. |

---

## Alternatives to bevy_hanabi

| Crate | Approach | Trade-off |
|-------|----------|-----------|
| **bevy_particle_systems** | CPU-based, simpler API | Easier to learn; limited to hundreds of particles |
| **Custom mesh instancing** | Roll your own with `MeshInstancing` | Full control; more boilerplate |
| **Shader-only** | Write a custom vertex/fragment shader | Maximum performance; no spawning abstraction |

For most games, bevy_hanabi is the right starting point. Drop to alternatives only when you hit a specific limitation.

---

## Next Steps

- **[E10 Custom Shaders & Materials](../architecture/E10_custom_shaders_materials.md)** — write custom particle shaders
- **[E12 Fullscreen Materials & Post Processing](../architecture/E12_fullscreen_materials_post_processing.md)** — screen-space VFX (bloom, distortion)
- **[R2 Community Plugins Ecosystem](../reference/R2_community_plugins_ecosystem.md)** — discover more VFX crates
- **[bevy_hanabi examples](https://github.com/djeedai/bevy_hanabi/tree/main/examples)** — official examples covering every modifier type
