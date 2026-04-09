# G13 — Atmosphere & Procedural Sky Rendering

> **Category:** guide · **Engine:** Bevy 0.18 · **Related:** [E5 3D Rendering & Lighting](../architecture/E5_3d_rendering_lighting.md) · [E12 Fullscreen Materials & Post Processing](../architecture/E12_fullscreen_materials_post_processing.md) · [bevy-arch-rules](../bevy-arch-rules.md)

---

## Overview

Bevy 0.18 introduced a built-in procedural atmosphere system based on Sébastien Hillaire's 2020 paper on real-time atmospheric scattering. It renders physically-accurate skies with automatic sun coloring, volumetric fog integration, and support for arbitrary planetary atmospheres — from Earth-like blue skies to alien worlds with orange haze.

The system uses precomputed lookup tables (LUTs) for performance, scaling well even on mobile hardware.

---

## Quick Start: Earth-like Sky

```rust
use bevy::prelude::*;
use bevy::pbr::{Atmosphere, ScatteringMedium};

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .add_systems(Startup, setup)
        .run();
}

fn setup(
    mut commands: Commands,
    mut scattering_media: ResMut<Assets<ScatteringMedium>>,
) {
    // Create an Earth-like scattering medium
    let medium = scattering_media.add(ScatteringMedium::earthlike());

    // Spawn a camera with atmosphere
    commands.spawn((
        Camera3d::default(),
        Transform::from_xyz(0.0, 2.0, 10.0).looking_at(Vec3::ZERO, Vec3::Y),
        Atmosphere::earthlike(medium),
    ));

    // Add a directional light as the "sun"
    commands.spawn((
        DirectionalLight {
            illuminance: 100_000.0,
            shadows_enabled: true,
            ..default()
        },
        Transform::from_rotation(Quat::from_euler(
            EulerRot::XYZ,
            -std::f32::consts::FRAC_PI_4,
            0.2,
            0.0,
        )),
    ));
}
```

The `Atmosphere` component requires an HDR camera (the default for `Camera3d`). When you add `Atmosphere`, Bevy automatically inserts `AtmosphereSettings` and `Hdr` as required components.

---

## Core Components

### `Atmosphere`

The primary component, attached to a camera entity.

| Field | Type | Description |
|-------|------|-------------|
| `bottom_radius` | `f32` | Planet radius in meters (Earth ≈ 6,371,000) |
| `top_radius` | `f32` | Outer atmosphere boundary radius in meters |
| `ground_albedo` | `Vec3` | Average surface reflectivity for multiscattering |
| `medium` | `Handle<ScatteringMedium>` | The atmospheric substance that scatters light |

```rust
// Earth-like defaults via the factory method:
let atmo = Atmosphere::earthlike(medium_handle);

// Or construct manually for an alien planet:
let atmo = Atmosphere {
    bottom_radius: 3_390_000.0,  // Mars-sized planet
    top_radius: 3_490_000.0,     // Thin atmosphere
    ground_albedo: Vec3::new(0.7, 0.3, 0.2),  // Reddish terrain
    medium: mars_medium_handle,
};
```

### `ScatteringMedium` (Asset)

Defines how light interacts with the atmosphere. Loaded as a Bevy asset so multiple cameras or scenes can share the same medium.

```rust
// Earth-like: Rayleigh (blue sky) + Mie (sun halo) scattering
let earthlike = ScatteringMedium::earthlike();

// Custom medium for a foggy alien world
let foggy = ScatteringMedium::new(64, 64, [
    // Each ScatteringTerm defines one type of particle
    // (gas molecules, dust, aerosols, etc.)
    ScatteringTerm { /* ... */ },
])
.with_label("foggy_planet")
.with_density_multiplier(3.0);  // 3x denser than default

let handle = scattering_media.add(foggy);
```

Key parameters per `ScatteringTerm`:

- **Optical density** — how much light the medium absorbs/scatters per meter
- **Phase function** — directional scattering probability (forward-heavy for Mie/haze, uniform for Rayleigh/gas)
- **Scale height** — how quickly density falls off with altitude (8 km for Earth's Rayleigh, 1.2 km for Mie)

### `AtmosphereSettings`

Controls rendering quality vs. performance. Auto-inserted when you add `Atmosphere`.

```rust
// Override defaults for higher quality
commands.spawn((
    Camera3d::default(),
    Atmosphere::earthlike(medium),
    AtmosphereSettings {
        // LUT resolution (higher = sharper horizons, more VRAM)
        sky_view_lut_size: UVec2::new(256, 128),
        aerial_view_lut_size: UVec3::new(64, 64, 32),
        // Sample counts (higher = less banding, more GPU cost)
        sky_view_lut_samples: 40,
        transmittance_lut_samples: 50,
        // Unit conversion (if your game uses 1 unit = 1 meter, use 1.0)
        scene_units_to_m: 1.0,
        // Max distance for aerial perspective (fog on distant objects)
        aerial_view_lut_max_distance: 50_000.0,
        ..default()
    },
));
```

The `rendering_method` field selects between LUT-based rendering (fast, default) and ray marching (higher quality, more expensive).

---

## Sun Interaction

The atmosphere automatically interacts with `DirectionalLight` components. As the sun direction changes:

- Light passing through more atmosphere turns orange/red (sunset)
- Overhead sun produces blue sky with white sunlight
- Atmosphere occlusion affects shadow colors and intensity

```rust
// Animate a day/night cycle by rotating the directional light
fn day_night_cycle(
    time: Res<Time>,
    mut sun: Query<&mut Transform, With<DirectionalLight>>,
) {
    for mut transform in &mut sun {
        let angle = time.elapsed_secs() * 0.1;  // Slow rotation
        *transform = Transform::from_rotation(
            Quat::from_euler(EulerRot::XYZ, angle, 0.0, 0.0)
        );
    }
}
```

---

## Recipe: Different Atmosphere Types

### Desert Sky (Warm, Hazy)

```rust
let desert = ScatteringMedium::earthlike()
    .with_density_multiplier(0.6);  // Thinner, warmer

commands.spawn((
    Camera3d::default(),
    Atmosphere {
        ground_albedo: Vec3::new(0.8, 0.65, 0.4),  // Sandy terrain
        ..Atmosphere::earthlike(scattering_media.add(desert))
    },
));
```

### Foggy Coastline (Dense, Low Visibility)

```rust
let foggy = ScatteringMedium::earthlike()
    .with_density_multiplier(4.0);  // Very dense

commands.spawn((
    Camera3d::default(),
    Atmosphere::earthlike(scattering_media.add(foggy)),
    AtmosphereSettings {
        aerial_view_lut_max_distance: 5_000.0,  // Close fog
        ..default()
    },
));
```

### Alien Planet (Non-Earth Colors)

Build a custom `ScatteringMedium` with different scattering terms to shift the sky color. A medium dominated by larger particles (Mie-like) with absorption in the blue range produces orange/red skies.

---

## Performance Notes

The atmosphere system uses precomputed LUTs that are generated once (or when parameters change) and sampled cheaply each frame. The cost depends primarily on:

- **LUT resolution** — `sky_view_lut_size` and `aerial_view_lut_size` control VRAM and generation cost
- **Sample counts** — more samples reduce banding artifacts but increase GPU time
- **Ray marching mode** — significantly more expensive than LUT mode; use only when LUT artifacts are unacceptable

**Defaults are tuned for desktop GPUs.** For mobile or low-end hardware, reduce LUT sizes and sample counts:

```rust
AtmosphereSettings {
    sky_view_lut_size: UVec2::new(128, 64),
    transmittance_lut_samples: 20,
    sky_view_lut_samples: 16,
    ..default()
}
```

---

## Integration with Volumetric Fog

The procedural atmosphere works seamlessly with Bevy's volumetric fog system. Both systems share the same lighting model, so fog near the ground inherits correct atmospheric coloring. No extra setup is needed — just add both `Atmosphere` and `VolumetricFog` components to your camera.

---

## Rust Ownership Note

`ScatteringMedium` is a Bevy asset managed through `Assets<ScatteringMedium>`. You add it via `ResMut<Assets<ScatteringMedium>>` and receive a `Handle<ScatteringMedium>` — the standard Bevy pattern. The handle is cheaply cloneable and can be shared across multiple `Atmosphere` components. Don't hold a `&ScatteringMedium` reference across system boundaries; always go through the asset handle.
