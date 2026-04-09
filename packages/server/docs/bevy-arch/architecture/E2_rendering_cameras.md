# E2 — Rendering & Cameras

> **Category:** explanation · **Engine:** Bevy 0.18 · **Related:** [G1 Getting Started](../guides/G1_getting_started.md) · [E1 ECS Fundamentals](E1_ecs_fundamentals.md) · [bevy-arch-rules](../bevy-arch-rules.md)

---

## Overview

Bevy's rendering system is built on `wgpu` and uses the same render-phase architecture for both 2D and 3D. Everything you see on screen — sprites, meshes, text, UI — is an entity with rendering components. No camera entity means nothing renders.

Bevy 0.18 includes GPU-driven rendering for 3D meshes (introduced in 0.16), Solari experimental raytracing, atmosphere occlusion, and fullscreen post-processing materials.

---

## Cameras

Cameras are entities that define what gets rendered and how. Bevy provides two primary camera types.

### Camera2d

Used for 2D games, UI-heavy apps, and top-down views. Renders in screen-space by default (origin at center, Y-up).

```rust
use bevy::prelude::*;

fn setup(mut commands: Commands) {
    // Minimal 2D camera — this is all you need
    commands.spawn(Camera2d);
}
```

### Camera3d

Used for 3D scenes with perspective or orthographic projection.

```rust
fn setup(mut commands: Commands) {
    // Perspective camera looking at the origin
    commands.spawn((
        Camera3d::default(),
        Transform::from_xyz(-2.5, 4.5, 9.0).looking_at(Vec3::ZERO, Vec3::Y),
    ));
}
```

### Camera Configuration

Both camera types use the `Camera` component (automatically required) for shared settings:

```rust
commands.spawn((
    Camera2d,
    Camera {
        // Render order — higher values render on top (useful for multi-camera setups)
        order: 0,
        // Clear color for this camera's viewport
        clear_color: ClearColorConfig::Custom(Color::srgb(0.1, 0.1, 0.15)),
        // Render to a specific viewport (default: full window)
        // viewport: Some(Viewport { ... }),
        ..default()
    },
));
```

### Built-in Camera Controllers (New in 0.18)

Bevy 0.18 adds basic fly and pan camera controllers for quick prototyping:

```rust
use bevy::prelude::*;
use bevy::input::common_conditions::input_toggle_active;

// Fly camera — WASD + mouse look (3D)
// Pan camera — click-drag + scroll zoom (2D/3D)
// Check bevy::camera module for FlyCameraPlugin / PanCameraPlugin
```

### Multi-Camera Setup

Multiple cameras can render to different parts of the screen or to textures:

```rust
fn setup(mut commands: Commands) {
    // Main game camera
    commands.spawn((
        Camera2d,
        Camera { order: 0, ..default() },
    ));

    // Minimap camera (renders second, on top)
    commands.spawn((
        Camera2d,
        Camera {
            order: 1,
            viewport: Some(Viewport {
                physical_position: UVec2::new(600, 10),
                physical_size: UVec2::new(180, 180),
                ..default()
            }),
            clear_color: ClearColorConfig::None, // Don't clear — overlay on main
            ..default()
        },
    ));
}
```

---

## 2D Rendering

### Sprites

The `Sprite` component renders a 2D image. Pair it with a `Transform` to position it.

```rust
fn setup(mut commands: Commands, asset_server: Res<AssetServer>) {
    commands.spawn(Camera2d);

    // Basic sprite from an image file
    commands.spawn((
        Sprite::from_image(asset_server.load("player.png")),
        Transform::from_xyz(0.0, 0.0, 0.0),
    ));

    // Sprite with color tint and custom size
    commands.spawn((
        Sprite {
            image: asset_server.load("bullet.png"),
            color: Color::srgb(1.0, 0.5, 0.5), // Red tint
            custom_size: Some(Vec2::new(16.0, 16.0)),
            flip_x: false,
            flip_y: false,
            ..default()
        },
        Transform::from_xyz(100.0, 50.0, 1.0), // z=1 renders in front of z=0
    ));
}
```

### Sprite Z-Ordering

In 2D, the `Transform`'s Z value controls draw order. Higher Z = drawn on top. For entities at the same Z, Bevy uses the entity spawn order (not guaranteed to be stable).

```rust
// Background: z = 0
commands.spawn((
    Sprite::from_image(asset_server.load("background.png")),
    Transform::from_xyz(0.0, 0.0, 0.0),
));

// Player: z = 1 (drawn on top of background)
commands.spawn((
    Sprite::from_image(asset_server.load("player.png")),
    Transform::from_xyz(0.0, 0.0, 1.0),
));

// UI overlay: z = 10
commands.spawn((
    Sprite::from_image(asset_server.load("hud.png")),
    Transform::from_xyz(0.0, 0.0, 10.0),
));
```

### Texture Atlases (Spritesheets)

Use `TextureAtlasLayout` to define frame regions in a spritesheet:

```rust
fn setup(
    mut commands: Commands,
    asset_server: Res<AssetServer>,
    mut texture_atlas_layouts: ResMut<Assets<TextureAtlasLayout>>,
) {
    let texture = asset_server.load("spritesheet.png");

    // Define a grid layout: 6 columns, 1 row, each frame 32x32
    let layout = TextureAtlasLayout::from_grid(UVec2::new(32, 32), 6, 1, None, None);
    let layout_handle = texture_atlas_layouts.add(layout);

    commands.spawn(Camera2d);

    commands.spawn((
        Sprite::from_atlas_image(
            texture,
            TextureAtlas {
                layout: layout_handle,
                index: 0, // Start at first frame
            },
        ),
        Transform::from_scale(Vec3::splat(3.0)), // Scale up for visibility
    ));
}

// Animate by changing the atlas index each frame
fn animate_sprite(
    time: Res<Time>,
    mut query: Query<&mut Sprite>,
    mut timer: Local<f32>,
) {
    *timer += time.delta_secs();
    if *timer >= 0.1 {
        *timer = 0.0;
        for mut sprite in &mut query {
            if let Some(atlas) = &mut sprite.texture_atlas {
                atlas.index = (atlas.index + 1) % 6;
            }
        }
    }
}
```

### 2D Meshes

For procedural 2D shapes beyond sprites, use `Mesh2d` and `MeshMaterial2d`:

```rust
fn setup(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<ColorMaterial>>,
) {
    commands.spawn(Camera2d);

    // A colored circle
    commands.spawn((
        Mesh2d(meshes.add(Circle::new(50.0))),
        MeshMaterial2d(materials.add(Color::srgb(0.2, 0.7, 1.0))),
        Transform::from_xyz(0.0, 0.0, 0.0),
    ));

    // A rectangle
    commands.spawn((
        Mesh2d(meshes.add(Rectangle::new(200.0, 100.0))),
        MeshMaterial2d(materials.add(Color::srgb(0.9, 0.3, 0.3))),
        Transform::from_xyz(200.0, 0.0, 0.0),
    ));
}
```

---

## 3D Rendering

### Meshes and Materials

3D rendering uses `Mesh3d` and `MeshMaterial3d<StandardMaterial>`. Bevy includes primitive mesh shapes and PBR (Physically Based Rendering) materials.

```rust
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

    // A cube with PBR properties
    commands.spawn((
        Mesh3d(meshes.add(Cuboid::new(1.0, 1.0, 1.0))),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: Color::srgb(0.8, 0.2, 0.2),
            metallic: 0.5,
            perceptual_roughness: 0.4,
            ..default()
        })),
        Transform::from_xyz(0.0, 0.5, 0.0),
    ));

    // A sphere
    commands.spawn((
        Mesh3d(meshes.add(Sphere::new(0.5).mesh().ico(5).unwrap())),
        MeshMaterial3d(materials.add(StandardMaterial {
            base_color: Color::srgb(0.2, 0.4, 0.9),
            metallic: 1.0,
            perceptual_roughness: 0.1, // Very shiny
            ..default()
        })),
        Transform::from_xyz(2.0, 0.5, 0.0),
    ));

    // Camera
    commands.spawn((
        Camera3d::default(),
        Transform::from_xyz(-2.5, 4.5, 9.0).looking_at(Vec3::ZERO, Vec3::Y),
    ));
}
```

### Built-in Primitive Shapes

Bevy provides these mesh primitives:

| Shape | Constructor |
|-------|------------|
| `Plane3d` | `Plane3d::default().mesh().size(w, h)` |
| `Cuboid` | `Cuboid::new(w, h, d)` |
| `Sphere` | `Sphere::new(radius)` |
| `Cylinder` | `Cylinder::new(radius, height)` |
| `Capsule3d` | `Capsule3d::new(radius, length)` |
| `Torus` | `Torus::new(inner_radius, outer_radius)` |
| `Circle` | `Circle::new(radius)` (2D) |
| `Rectangle` | `Rectangle::new(w, h)` (2D) |

### StandardMaterial (PBR)

`StandardMaterial` is Bevy's PBR material with these key fields:

```rust
StandardMaterial {
    // Base color (or texture via base_color_texture)
    base_color: Color::WHITE,
    base_color_texture: None, // Option<Handle<Image>>

    // Metallic-roughness workflow
    metallic: 0.0,                 // 0.0 = dielectric, 1.0 = metal
    perceptual_roughness: 0.5,     // 0.0 = mirror, 1.0 = rough

    // Normal mapping
    normal_map_texture: None,      // Option<Handle<Image>>

    // Emissive (self-lit surfaces)
    emissive: LinearRgba::BLACK,
    emissive_texture: None,

    // Transparency
    alpha_mode: AlphaMode::Opaque, // Opaque, Mask, Blend, Add, etc.

    // Double-sided rendering
    double_sided: false,
    cull_mode: Some(Face::Back),

    // Unlit (skip PBR lighting — useful for stylized/toon looks)
    unlit: false,

    ..default()
}
```

---

## Lighting

Bevy supports several light types for 3D scenes. Lights only affect 3D rendering — 2D sprites are unlit by default.

### Point Light

Emits light in all directions from a point (like a light bulb).

```rust
commands.spawn((
    PointLight {
        color: Color::WHITE,
        intensity: 1500.0,
        range: 20.0,
        shadows_enabled: true,
        ..default()
    },
    Transform::from_xyz(4.0, 8.0, 4.0),
));
```

### Directional Light

Parallel rays from infinitely far away (like the sun). Affects the entire scene.

```rust
commands.spawn((
    DirectionalLight {
        color: Color::srgb(1.0, 0.95, 0.85),
        illuminance: 10000.0,
        shadows_enabled: true,
        ..default()
    },
    Transform::default().looking_at(Vec3::new(-1.0, -1.0, -1.0), Vec3::Y),
));
```

### Spot Light

Cone-shaped light (like a flashlight).

```rust
commands.spawn((
    SpotLight {
        color: Color::WHITE,
        intensity: 5000.0,
        range: 30.0,
        outer_angle: std::f32::consts::FRAC_PI_4, // 45° cone
        inner_angle: std::f32::consts::FRAC_PI_6, // 30° full-intensity core
        shadows_enabled: true,
        ..default()
    },
    Transform::from_xyz(0.0, 5.0, 0.0).looking_at(Vec3::ZERO, Vec3::Y),
));
```

### Ambient Light

Low-level fill light applied everywhere — prevents pure-black shadows.

```rust
app.insert_resource(AmbientLight {
    color: Color::srgb(0.4, 0.4, 0.5),
    brightness: 0.2,
});
```

---

## Loading 3D Models

Bevy loads glTF 2.0 files (`.gltf` / `.glb`) which can contain meshes, materials, animations, and scenes:

```rust
fn setup(mut commands: Commands, asset_server: Res<AssetServer>) {
    // Load an entire scene from a glTF file
    commands.spawn((
        SceneRoot(asset_server.load("models/spaceship.glb#Scene0")),
        Transform::from_xyz(0.0, 0.0, 0.0),
    ));

    commands.spawn((
        Camera3d::default(),
        Transform::from_xyz(0.0, 2.0, 5.0).looking_at(Vec3::ZERO, Vec3::Y),
    ));
}
```

### Addressing glTF Sub-Assets

glTF files contain multiple named sub-assets accessed with fragment paths:

| Fragment | Type |
|----------|------|
| `#Scene0` | Named or indexed scene |
| `#Mesh0/Primitive0` | Specific mesh primitive |
| `#Material0` | Named material |
| `#Animation0` | Named animation clip |

---

## Render Layers and Visibility

### Visibility

Every rendered entity has a `Visibility` component (added automatically). Use it to show/hide entities:

```rust
// Hidden entity
commands.spawn((
    Sprite::from_image(asset_server.load("secret.png")),
    Visibility::Hidden,
));

// Toggle visibility in a system
fn toggle_visibility(mut query: Query<&mut Visibility, With<SecretItem>>) {
    for mut vis in &mut query {
        *vis = match *vis {
            Visibility::Hidden => Visibility::Inherited,
            _ => Visibility::Hidden,
        };
    }
}
```

### Render Layers

Use `RenderLayers` to control which cameras see which entities:

```rust
use bevy::render::view::RenderLayers;

// Entity only visible to cameras on layer 1
commands.spawn((
    Sprite::from_image(asset_server.load("minimap_icon.png")),
    RenderLayers::layer(1),
));

// Camera that sees only layer 1
commands.spawn((
    Camera2d,
    Camera { order: 1, ..default() },
    RenderLayers::layer(1),
));

// Default camera sees layer 0 (the default for all entities)
commands.spawn(Camera2d);
```

---

## Performance Tips

1. **Batching:** Sprites using the same texture are batched automatically. Use texture atlases to maximize batching.
2. **GPU-driven rendering (3D):** Enabled by default in Bevy 0.18 for standard 3D meshes — dramatically reduces CPU overhead for large scenes.
3. **Frustum culling:** Bevy automatically skips rendering entities outside the camera's view. No action needed.
4. **Visibility propagation:** Setting a parent entity to `Visibility::Hidden` hides all children. Use entity hierarchies to toggle groups efficiently.
5. **Avoid per-frame asset loads:** Load textures and meshes once (in `Startup` or during loading states), then reuse `Handle<T>` references.
6. **Level of Detail (LOD):** Not built in — implement manually by swapping meshes based on camera distance.

---

## Common Pitfalls

1. **No camera:** Nothing renders without at least one `Camera2d` or `Camera3d` entity.
2. **Missing lights in 3D:** 3D meshes with `StandardMaterial` appear black without lights. Add at least a `DirectionalLight` or `AmbientLight`.
3. **2D Z-fighting:** Sprites at the same Z value may flicker. Give each layer a distinct Z.
4. **Sprite vs Mesh2d ordering:** Sprites and 2D meshes render in separate phases — mixing them at the same Z can cause unexpected overlap. Prefer one or the other for overlapping elements.
5. **Asset paths:** Assets must be in the `assets/` directory at the crate root. Paths are relative to that folder.
6. **Transform scale on sprites:** Scaling a sprite via `Transform::from_scale` also affects its position in the hierarchy. Prefer `Sprite::custom_size` for sizing.
