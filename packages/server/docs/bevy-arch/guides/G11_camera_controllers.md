# G11 — First-Party Camera Controllers

> **Category:** guide · **Engine:** Bevy 0.18 · **Related:** [E2 Rendering & Cameras](../architecture/E2_rendering_cameras.md) · [G7 2D Game Patterns](G7_2d_game_patterns.md) · [bevy-arch-rules](../bevy-arch-rules.md)

---

## Overview

Bevy 0.18 ships two built-in camera controllers: `FreeCamera` for 3D fly-through navigation, and `PanCamera` for 2D pan-and-zoom. These live in the `bevy_camera_controllers` crate (bundled with Bevy behind feature flags) and are designed primarily for development, debugging, and tooling — not as final gameplay cameras. However, their source code serves as an excellent starting point for custom camera logic.

---

## Cargo Feature Flags

The camera controllers are gated behind opt-in features:

```toml
[dependencies]
# Enable only what you need
bevy = { version = "0.18", features = ["free_camera"] }

# Or enable both
bevy = { version = "0.18", features = ["free_camera", "pan_camera"] }
```

These features are **not** included in Bevy's default feature set to keep compile times lean for projects that don't need them.

---

## FreeCamera (3D Fly Camera)

`FreeCamera` provides noclip-style 3D movement — fly through geometry, ignoring physics and collisions. Think of it like Garry's Mod noclip or a Blender viewport camera.

### Quick Setup

```rust
use bevy::prelude::*;
use bevy::camera_controller::free_camera::{FreeCamera, FreeCameraPlugin};

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .add_plugins(FreeCameraPlugin)
        .add_systems(Startup, setup)
        .run();
}

fn setup(mut commands: Commands) {
    commands.spawn((
        Camera3d::default(),
        Transform::from_xyz(0.0, 5.0, 10.0).looking_at(Vec3::ZERO, Vec3::Y),
        FreeCamera::default(),
    ));
}
```

### Default Controls

| Input | Action |
|-------|--------|
| `W` / `S` | Move forward / backward |
| `A` / `D` | Strafe left / right |
| `Space` / `Shift` | Move up / down |
| Mouse movement | Look around (pitch + yaw) |
| Scroll wheel | Adjust movement speed |

### Customizing FreeCamera

```rust
commands.spawn((
    Camera3d::default(),
    Transform::from_xyz(0.0, 10.0, 20.0),
    FreeCamera {
        // Movement speed in units per second
        speed: 10.0,
        // Mouse sensitivity multiplier
        sensitivity: 0.002,
        ..default()
    },
));
```

### When to Use FreeCamera

- **Level design iteration** — fly around your scene to check art, lighting, and layout.
- **Debug inspection** — navigate to a specific entity to inspect its transform or colliders.
- **Editor tools** — the Bevy Editor uses FreeCamera internally for viewport navigation.
- **Prototyping** — get a camera working in seconds while you build gameplay systems.

---

## PanCamera (2D Pan & Zoom)

`PanCamera` provides 2D-friendly controls: WASD to pan the view, mouse wheel to zoom. Ideal for top-down games, strategy games, map editors, or any project with a fixed-angle camera.

### Quick Setup

```rust
use bevy::prelude::*;
use bevy::camera_controller::pan_camera::{PanCamera, PanCameraPlugin};

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .add_plugins(PanCameraPlugin)
        .add_systems(Startup, setup)
        .run();
}

fn setup(mut commands: Commands) {
    commands.spawn((
        Camera2d,
        PanCamera::default(),
    ));
}
```

### Default Controls

| Input | Action |
|-------|--------|
| `W` / `S` | Pan up / down |
| `A` / `D` | Pan left / right |
| Scroll wheel | Zoom in / out |
| `+` / `-` keys | Zoom in / out (keyboard) |

### Customizing PanCamera

```rust
commands.spawn((
    Camera2d,
    PanCamera {
        // Pan speed in units per second
        speed: 500.0,
        // Zoom speed multiplier
        zoom_speed: 0.1,
        // Clamp zoom range (min, max orthographic scale)
        min_zoom: 0.5,
        max_zoom: 10.0,
        ..default()
    },
));
```

---

## Toggling Controllers at Runtime

A common pattern is enabling the debug camera with a hotkey, then returning to your gameplay camera:

```rust
fn toggle_free_camera(
    keyboard: Res<ButtonInput<KeyCode>>,
    mut query: Query<&mut FreeCamera>,
) {
    if keyboard.just_pressed(KeyCode::F1) {
        for mut cam in &mut query {
            cam.enabled = !cam.enabled;
        }
    }
}
```

> **Tip:** When disabling the free camera, save and restore the `Transform` so the camera snaps back to its gameplay position.

---

## Building a Custom Camera From the Built-In Source

The built-in controllers are intentionally simple (~100-150 lines each). For gameplay cameras, copy the source and extend it:

```rust
// Custom follow camera — derived from FreeCamera patterns
#[derive(Component)]
struct FollowCamera {
    pub target: Entity,
    pub offset: Vec3,
    pub smoothing: f32,
}

fn follow_camera_system(
    time: Res<Time>,
    targets: Query<&Transform, Without<FollowCamera>>,
    mut cameras: Query<(&FollowCamera, &mut Transform)>,
) {
    for (follow, mut cam_transform) in &mut cameras {
        if let Ok(target_transform) = targets.get(follow.target) {
            let desired = target_transform.translation + follow.offset;
            // Exponential smoothing — same pattern used internally
            cam_transform.translation = cam_transform.translation.lerp(
                desired,
                1.0 - (-follow.smoothing * time.delta_secs()).exp(),
            );
            cam_transform.look_at(target_transform.translation, Vec3::Y);
        }
    }
}
```

---

## Common Patterns

### Dual Camera Setup (Gameplay + Debug)

```rust
#[derive(Component)]
struct GameplayCamera;

#[derive(Component)]
struct DebugCamera;

fn setup(mut commands: Commands) {
    // Primary gameplay camera (active by default)
    commands.spawn((
        Camera3d::default(),
        Camera { order: 0, is_active: true, ..default() },
        GameplayCamera,
    ));

    // Debug free camera (inactive by default)
    commands.spawn((
        Camera3d::default(),
        Camera { order: 1, is_active: false, ..default() },
        FreeCamera { enabled: false, ..default() },
        DebugCamera,
    ));
}

fn toggle_debug_camera(
    keyboard: Res<ButtonInput<KeyCode>>,
    mut gameplay: Query<&mut Camera, (With<GameplayCamera>, Without<DebugCamera>)>,
    mut debug: Query<(&mut Camera, &mut FreeCamera), With<DebugCamera>>,
) {
    if keyboard.just_pressed(KeyCode::F3) {
        for mut cam in &mut gameplay {
            cam.is_active = !cam.is_active;
        }
        for (mut cam, mut free) in &mut debug {
            cam.is_active = !cam.is_active;
            free.enabled = cam.is_active;
        }
    }
}
```

### Camera Bounds (Clamping PanCamera)

The built-in `PanCamera` doesn't enforce world bounds, but you can add a system that runs after it:

```rust
fn clamp_camera_bounds(
    mut query: Query<&mut Transform, With<PanCamera>>,
) {
    let bounds = Rect::new(-1000.0, -1000.0, 1000.0, 1000.0);
    for mut transform in &mut query {
        transform.translation.x = transform.translation.x.clamp(bounds.min.x, bounds.max.x);
        transform.translation.y = transform.translation.y.clamp(bounds.min.y, bounds.max.y);
    }
}
```

---

## Rust Ownership Note

Camera controller components borrow `Transform` mutably in their systems. If you have other systems that also write to the camera's `Transform` (e.g., a screen-shake system), you'll need system ordering to avoid conflicts:

```rust
app.add_systems(Update, (
    screen_shake_system,
    // Camera controller runs after shake applies its offset
).chain());
```

Bevy's automatic parallelism means two systems writing the same component on the same entity will cause a scheduling conflict unless explicitly ordered.
