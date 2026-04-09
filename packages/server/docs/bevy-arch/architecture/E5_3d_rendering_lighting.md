# E5 — 3D Rendering & Lighting

> **Category:** explanation · **Engine:** Bevy 0.18 · **Related:** [E2 Rendering & Cameras](E2_rendering_cameras.md) · [E1 ECS Fundamentals](E1_ecs_fundamentals.md) · [G3 Assets & Audio](../guides/G3_assets_and_audio.md) · [bevy-arch-rules](../bevy-arch-rules.md)

---

## Overview

Bevy's 3D renderer is built on `wgpu` and uses Physically Based Rendering (PBR) by default. All 3D objects are ECS entities composed from mesh, material, and transform components. Bevy 0.18 includes significant PBR quality improvements — fixing long-standing issues with overly bright specular highlights on point/area lights and improving environment map fresnel calculations.

---

## Core 3D Components

A visible 3D object needs three things: a mesh, a material, and a transform.

### Mesh3d — Geometry

`Mesh3d` wraps a handle to a mesh asset. Bevy provides built-in primitives and supports loading from glTF/GLB files.

```rust
use bevy::prelude::*;

fn setup(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    // Built-in primitives
    let cube = meshes.add(Cuboid::new(1.0, 1.0, 1.0));
    let sphere = meshes.add(Sphere::new(0.5).mesh().uv(32, 18));
    let plane = meshes.add(Plane3d::default().mesh().size(10.0, 10.0));

    // Spawn a cube
    commands.spawn((
        Mesh3d(cube),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: Color::srgb(0.8, 0.2, 0.3),
            ..default()
        })),
        Transform::from_xyz(0.0, 0.5, 0.0),
    ));

    // Spawn a ground plane
    commands.spawn((
        Mesh3d(plane),
        MeshMaterial3d(materials.add(Color::srgb(0.3, 0.5, 0.3))),
        Transform::default(),
    ));
}
```

**Rust ownership note:** `meshes.add()` takes ownership of the mesh data and returns a `Handle<Mesh>`. The handle is a cheap clone — Bevy's asset system manages the underlying GPU resources. You can reuse the same handle across multiple entities to instance geometry.

### MeshMaterial3d — Appearance

`MeshMaterial3d<M>` pairs with `Mesh3d` to define surface appearance. The default material type is `StandardMaterial` (PBR).

```rust
// Full StandardMaterial with common properties
let material = materials.add(StandardMaterial {
    base_color: Color::srgb(0.9, 0.9, 0.9),
    base_color_texture: Some(texture_handle.clone()),
    metallic: 0.0,           // 0.0 = dielectric, 1.0 = metal
    perceptual_roughness: 0.5, // 0.0 = mirror, 1.0 = rough
    reflectance: 0.5,        // F0 reflectance for dielectrics
    emissive: LinearRgba::BLACK, // Self-illumination color
    normal_map_texture: Some(normal_handle.clone()),
    double_sided: false,
    unlit: false,            // true = ignore lighting entirely
    alpha_mode: AlphaMode::Opaque,
    ..default()
});
```

**Key StandardMaterial properties:**

| Property | Type | Default | Purpose |
|----------|------|---------|---------|
| `base_color` | `Color` | White | Albedo / diffuse color |
| `base_color_texture` | `Option<Handle<Image>>` | None | Albedo texture map |
| `metallic` | `f32` | 0.01 | Metalness (0–1) |
| `perceptual_roughness` | `f32` | 0.089 | Surface roughness (0–1) |
| `reflectance` | `f32` | 0.5 | Fresnel reflectance for non-metals |
| `emissive` | `LinearRgba` | Black | Emissive glow (not a light source) |
| `normal_map_texture` | `Option<Handle<Image>>` | None | Normal map (requires tangents) |
| `alpha_mode` | `AlphaMode` | Opaque | Transparency handling |

**Tangent generation for normal maps:**

```rust
// Normal maps require tangent data on the mesh.
// Generate tangents from UV data:
let mut mesh = Mesh::from(Cuboid::new(1.0, 1.0, 1.0));
mesh.generate_tangents().unwrap();
// Or use the builder pattern:
let mesh = Cuboid::new(1.0, 1.0, 1.0)
    .mesh()
    .with_generated_tangents()
    .unwrap();
```

---

## Lighting

Bevy supports three primary light types plus environment/ambient lighting. All lights cast real-time shadows when configured.

### PointLight

Emits light in all directions from a point. Good for torches, lamps, explosions.

```rust
commands.spawn((
    PointLight {
        color: Color::srgb(1.0, 0.95, 0.8),
        intensity: 1500.0,  // Luminous power in lumens
        range: 20.0,        // Maximum distance
        radius: 0.0,        // Physical light radius (area light)
        shadows_enabled: true,
        shadow_depth_bias: 0.02,
        ..default()
    },
    Transform::from_xyz(4.0, 8.0, 4.0),
));
```

### DirectionalLight

Parallel rays from an infinitely distant source. Use for sunlight/moonlight.

```rust
commands.spawn((
    DirectionalLight {
        color: Color::WHITE,
        illuminance: 10_000.0,  // Lux (outdoor sunlight ≈ 100,000)
        shadows_enabled: true,
        shadow_depth_bias: 0.02,
        ..default()
    },
    Transform::from_rotation(Quat::from_euler(
        EulerRot::XYZ,
        -std::f32::consts::FRAC_PI_4,  // 45° down
        std::f32::consts::FRAC_PI_4,   // 45° rotated
        0.0,
    )),
));
```

**Shadow cascades:** DirectionalLight uses Cascaded Shadow Maps (CSM) automatically. Bevy splits the view frustum into cascades so nearby shadows are high-resolution while distant shadows use less memory.

### SpotLight

A cone of light — flashlights, stage lights, headlights.

```rust
commands.spawn((
    SpotLight {
        color: Color::WHITE,
        intensity: 5000.0,       // Luminous power in lumens
        range: 30.0,
        radius: 0.0,
        inner_angle: 0.3,        // Full-brightness cone (radians)
        outer_angle: 0.8,        // Falloff cone (radians)
        shadows_enabled: true,
        ..default()
    },
    Transform::from_xyz(0.0, 5.0, 0.0)
        .looking_at(Vec3::ZERO, Vec3::Y),
));
```

### Ambient Light

A flat, non-directional fill light. Use sparingly — heavy ambient light flattens the scene.

```rust
commands.insert_resource(AmbientLight {
    color: Color::srgb(0.1, 0.1, 0.15), // Slight blue tint
    brightness: 0.05,
});
```

### Environment Maps

For realistic reflections and ambient lighting, use an HDR environment map (`.hdr` or `.exr`):

```rust
commands.spawn((
    Camera3d::default(),
    EnvironmentMapLight {
        diffuse_map: asset_server.load("environment_maps/diffuse.ktx2"),
        specular_map: asset_server.load("environment_maps/specular.ktx2"),
        intensity: 500.0,
        ..default()
    },
    Transform::from_xyz(-2.0, 2.5, 5.0)
        .looking_at(Vec3::ZERO, Vec3::Y),
));
```

---

## Camera Setup

### Camera3d

```rust
commands.spawn((
    Camera3d::default(),
    Transform::from_xyz(-2.0, 2.5, 5.0)
        .looking_at(Vec3::ZERO, Vec3::Y),
));
```

### HDR & Tonemapping

For physically accurate lighting, enable HDR on the camera:

```rust
commands.spawn((
    Camera3d::default(),
    Camera {
        hdr: true,
        ..default()
    },
    Tonemapping::TonyMcMapface,  // Bevy's default, good general-purpose
    Transform::from_xyz(-2.0, 2.5, 5.0)
        .looking_at(Vec3::ZERO, Vec3::Y),
));
```

Available tonemapping options: `None`, `Reinhard`, `ReinhardLuminance`, `AcesFitted`, `AgX`, `SomewhatBoringDisplayTransform`, `TonyMcMapface`, `BlenderFilmic`.

### Post-Processing

Bevy 0.18 includes built-in bloom, SSAO, and other effects as camera components:

```rust
commands.spawn((
    Camera3d::default(),
    Camera { hdr: true, ..default() },
    Bloom {
        intensity: 0.3,
        ..default()
    },
    Transform::from_xyz(-2.0, 2.5, 5.0)
        .looking_at(Vec3::ZERO, Vec3::Y),
));
```

---

## Loading 3D Models (glTF)

glTF/GLB is the recommended format for 3D models in Bevy.

```rust
fn setup(mut commands: Commands, asset_server: Res<AssetServer>) {
    // Load an entire glTF scene
    commands.spawn(SceneRoot(
        asset_server.load(GltfAssetLabel::Scene(0).from_asset("models/character.glb")),
    ));
}
```

**Bevy 0.18 glTF improvements:** Extension handling is now trait-based (`GltfExtensionHandler`), allowing custom processing of glTF extensions like `KHR_lights_punctual` without modifying Bevy source.

### Accessing Individual Parts

```rust
// Load a specific mesh from a glTF file
let mesh_handle: Handle<Mesh> = asset_server.load(
    GltfAssetLabel::Mesh(0).from_asset("models/character.glb")
);
```

---

## Bevy 0.18 PBR Fixes

Bevy 0.18 addressed two major rendering quality issues:

1. **Point/area light specular was overly bright** — the specular contribution was not correctly normalized, causing highlights that looked too intense.
2. **Environment map fresnel was roughness-dependent** — the shader was applying roughness-dependent fresnel (intended for analytical lights) to environment maps. This has been switched to the standard fresnel term, producing more accurate reflections on rough surfaces.

These fixes mean that scenes created in earlier Bevy versions may look slightly different — typically more natural and less "plasticky".

---

## Custom Materials

For effects beyond PBR, implement the `Material` trait:

```rust
use bevy::pbr::{Material, MaterialPlugin};
use bevy::render::render_resource::*;

#[derive(Asset, TypePath, AsBindGroup, Clone)]
pub struct MyCustomMaterial {
    #[uniform(0)]
    pub color: LinearRgba,
    #[texture(1)]
    #[sampler(2)]
    pub texture: Option<Handle<Image>>,
}

impl Material for MyCustomMaterial {
    fn fragment_shader() -> ShaderRef {
        "shaders/custom_material.wgsl".into()
    }
}

// Register the plugin
app.add_plugins(MaterialPlugin::<MyCustomMaterial>::default());
```

---

## Performance Tips

- **Mesh instancing:** Reuse the same `Handle<Mesh>` and `Handle<StandardMaterial>` across entities. Bevy automatically batches draw calls for identical mesh+material pairs.
- **Shadow complexity:** Each shadow-casting light has a cost. Limit `shadows_enabled: true` to key lights.
- **LOD:** Bevy doesn't have built-in LOD. Use visibility systems or swap `Mesh3d` handles based on camera distance.
- **Frustum culling:** Automatic — entities outside the camera frustum are not rendered.
- **MSAA vs FXAA:** MSAA (default, 4x) is expensive. Consider switching to FXAA for lower-end targets: `Msaa::Off` + FXAA post-process component.

---

## Complete Example: Lit Scene

```rust
use bevy::prelude::*;

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .add_systems(Startup, setup)
        .run();
}

fn setup(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    // Ground plane
    commands.spawn((
        Mesh3d(meshes.add(Plane3d::default().mesh().size(10.0, 10.0))),
        MeshMaterial3d(materials.add(Color::srgb(0.3, 0.5, 0.3))),
    ));

    // Red cube
    commands.spawn((
        Mesh3d(meshes.add(Cuboid::new(1.0, 1.0, 1.0))),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: Color::srgb(0.8, 0.2, 0.2),
            perceptual_roughness: 0.4,
            metallic: 0.0,
            ..default()
        })),
        Transform::from_xyz(0.0, 0.5, 0.0),
    ));

    // Metallic sphere
    commands.spawn((
        Mesh3d(meshes.add(Sphere::new(0.5).mesh().uv(32, 18))),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: Color::srgb(0.9, 0.85, 0.6),
            metallic: 1.0,
            perceptual_roughness: 0.1,
            ..default()
        })),
        Transform::from_xyz(2.0, 0.5, 0.0),
    ));

    // Sun (directional light)
    commands.spawn((
        DirectionalLight {
            illuminance: 15_000.0,
            shadows_enabled: true,
            ..default()
        },
        Transform::from_rotation(Quat::from_euler(
            EulerRot::XYZ, -0.8, 0.4, 0.0,
        )),
    ));

    // Fill light (point)
    commands.spawn((
        PointLight {
            color: Color::srgb(0.5, 0.6, 1.0),
            intensity: 800.0,
            range: 15.0,
            shadows_enabled: false,
            ..default()
        },
        Transform::from_xyz(-3.0, 3.0, -2.0),
    ));

    // Ambient fill
    commands.insert_resource(AmbientLight {
        color: Color::srgb(0.15, 0.15, 0.2),
        brightness: 0.04,
    });

    // Camera
    commands.spawn((
        Camera3d::default(),
        Transform::from_xyz(-3.0, 3.0, 5.0)
            .looking_at(Vec3::new(0.0, 0.5, 0.0), Vec3::Y),
    ));
}
```

---

## Common Pitfalls

| Problem | Cause | Fix |
|---------|-------|-----|
| 3D objects invisible | Missing `MeshMaterial3d` | Every `Mesh3d` needs a material |
| Scene completely black | No lights spawned | Add at least a DirectionalLight or PointLight |
| Normal map looks wrong | Missing tangents on mesh | Call `mesh.generate_tangents()` |
| Shadows missing | `shadows_enabled: false` (default) | Set `shadows_enabled: true` on light |
| Everything too bright | Bevy < 0.18 light values | Reduce `intensity`/`illuminance` after upgrading |
| Transparency broken | Wrong `AlphaMode` | Use `AlphaMode::Blend` for transparent materials |
