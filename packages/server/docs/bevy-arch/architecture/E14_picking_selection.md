# Entity Picking & Selection

> **Category:** architecture · **Engine:** Bevy 0.18 · **Related:** [E1 ECS Fundamentals](E1_ecs_fundamentals.md), [E3 Input & States](E3_input_and_states.md), [E9 Observers & Hooks](E9_observers_hooks_oneshot.md)

Bevy's built-in picking system lets you detect pointer interactions (hover, click, drag) on entities — meshes, sprites, and UI nodes — without manual ray-casting math. It ships as part of `DefaultPlugins` for UI, with opt-in backends for meshes and sprites.

---

## Core Architecture

Picking is split into a **frontend** (pointer event propagation, focus, bubbling) and **backends** (hit detection for specific entity types). The frontend ships with `DefaultPlugins`. Backends are added separately depending on what you need to pick.

| Backend | Plugin | What it picks | Opt-in? |
|---------|--------|---------------|---------|
| UI | Included in `DefaultPlugins` | `Node` / `Button` entities | No — UI is pickable by default |
| Mesh (3D) | `MeshPickingPlugin` | `Mesh3d` entities | Yes — add plugin explicitly |
| Sprite (2D) | `SpritePickingPlugin` | `Sprite` entities | Yes — add plugin, plus `Pickable` on sprites |

---

## Quick Start — 3D Mesh Picking

```rust
use bevy::prelude::*;
use bevy::picking::mesh_picking::MeshPickingPlugin;

fn main() {
    App::new()
        .add_plugins((DefaultPlugins, MeshPickingPlugin))
        .add_systems(Startup, setup)
        .run();
}

fn setup(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    // Camera
    commands.spawn((
        Camera3d::default(),
        Transform::from_xyz(0.0, 5.0, 10.0).looking_at(Vec3::ZERO, Vec3::Y),
    ));

    // Pickable cube — all meshes are pickable by default when MeshPickingPlugin is added
    commands
        .spawn((
            Mesh3d(meshes.add(Cuboid::from_length(2.0))),
            MeshMaterial3d(materials.add(Color::srgb(0.3, 0.5, 1.0))),
            Transform::from_xyz(0.0, 1.0, 0.0),
        ))
        .observe(on_click)
        .observe(on_hover);
}

fn on_click(click: On<Pointer<Click>>, mut transforms: Query<&mut Transform>) {
    // Scale up when clicked
    let mut transform = transforms.get_mut(click.entity).unwrap();
    transform.scale *= 1.1;
}

fn on_hover(hover: On<Pointer<Over>>, mut materials: Query<&mut MeshMaterial3d<StandardMaterial>>) {
    // Could change material color on hover
    info!("Hovering over {:?}", hover.entity);
}
```

**Key point:** `MeshPickingPlugin` makes all meshes with `RenderAssetUsages::MAIN_WORLD` pickable by default. You don't need to add a `Pickable` component unless you want to disable or configure it.

---

## Pointer Event Types

Events are delivered through the **observer** pattern (`.observe()` on entity commands). The `Pointer<E>` wrapper carries metadata about every event:

```rust
pub struct Pointer<E: Debug + Clone + Reflect> {
    pub entity: Entity,         // The entity that was hit
    pub pointer_id: PointerId,  // Which pointer (mouse, touch finger, etc.)
    pub pointer_location: Location,
    pub event: E,               // The specific event data
}
```

### Event Categories

**Hovering:**
- `Over` — pointer enters the entity's bounds
- `Move` — pointer moves while over the entity
- `Out` — pointer leaves the entity's bounds

**Clicking:**
- `Press` — button pressed while over entity
- `Release` — button released while over entity
- `Click` — press + release on the same entity

**Dragging:**
- `DragStart` — drag begins on entity
- `Drag` — entity is being dragged (has `.delta: Vec2`)
- `DragEnd` — drag ends
- `DragEnter` / `DragOver` / `DragDrop` / `DragLeave` — drag-and-drop between entities

---

## Common Patterns

### Drag to Rotate (3D)

```rust
fn spawn_rotatable(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<StandardMaterial>>,
) {
    commands
        .spawn((
            Mesh3d(meshes.add(Cuboid::from_length(3.0))),
            MeshMaterial3d(materials.add(Color::from(bevy::color::palettes::basic::SILVER))),
        ))
        .observe(|drag: On<Pointer<Drag>>, mut transforms: Query<&mut Transform>| {
            let mut transform = transforms.get_mut(drag.entity).unwrap();
            transform.rotate_y(drag.delta.x * 0.02);
            transform.rotate_x(drag.delta.y * 0.02);
        });
}
```

### Sprite Picking (2D)

Sprites require an explicit `Pickable` component:

```rust
fn spawn_pickable_sprite(mut commands: Commands) {
    commands
        .spawn((
            Sprite::from_color(Color::srgb(0.2, 0.8, 0.2), Vec2::new(100.0, 100.0)),
            Transform::from_xyz(0.0, 0.0, 0.0),
            Pickable::default(),  // Required for sprites
        ))
        .observe(|_click: On<Pointer<Click>>| {
            info!("Sprite clicked!");
        });
}
```

### Disabling Picking on Specific Entities

```rust
commands.spawn((
    Mesh3d(meshes.add(Cuboid::from_length(1.0))),
    MeshMaterial3d(materials.add(Color::WHITE)),
    Pickable::IGNORE,  // This entity won't receive pointer events
));
```

### Opt-In Picking (Require Markers)

By default, `MeshPickingPlugin` makes everything pickable. For large scenes, switch to opt-in mode:

```rust
fn configure_picking(mut settings: ResMut<MeshPickingSettings>) {
    settings.require_markers = true;
    // Now only entities with `Pickable` + cameras with `MeshPickingCamera` participate
}

fn spawn_pickable_mesh(mut commands: Commands, /* ... */) {
    // Camera must have MeshPickingCamera
    commands.spawn((Camera3d::default(), MeshPickingCamera));

    // Only this mesh is pickable
    commands.spawn((
        Mesh3d(meshes.add(Cuboid::from_length(2.0))),
        MeshMaterial3d(materials.add(Color::WHITE)),
        Pickable::default(),
    ));
}
```

---

## Manual Ray Casting with MeshRayCast

For custom picking logic outside the event system, use the `MeshRayCast` system parameter:

```rust
fn custom_raycast(
    mesh_ray_cast: MeshRayCast,
    cameras: Query<(&Camera, &GlobalTransform)>,
    windows: Query<&Window>,
) {
    let (camera, camera_transform) = cameras.single();
    let Some(cursor_pos) = windows.single().cursor_position() else { return };
    let Some(ray) = camera.viewport_to_world(camera_transform, cursor_pos) else { return };

    if let Some((entity, hit)) = mesh_ray_cast.cast_ray(ray, &default()).first() {
        info!("Hit entity {:?} at {:?}", entity, hit.point);
    }
}
```

---

## Performance Notes

- **Mesh picking** casts rays against triangle meshes — it's accurate but has CPU cost proportional to mesh complexity. Use `require_markers` in large scenes.
- **UI picking** uses layout rectangles and is very cheap.
- **Sprite picking** uses axis-aligned bounding boxes.
- For complex scenes, consider simplified collision meshes or spatial partitioning with a physics engine instead.

---

## Rust Ownership Gotcha

Observer closures capture the `On<Pointer<E>>` trigger by value. If you need to access multiple query results inside the closure, make sure your system parameters don't conflict:

```rust
// ✅ Good — separate queries
.observe(|click: On<Pointer<Click>>,
          mut transforms: Query<&mut Transform>,
          names: Query<&Name>| {
    let name = names.get(click.entity).unwrap();
    let mut transform = transforms.get_mut(click.entity).unwrap();
    info!("Clicked {name}");
    transform.scale *= 1.1;
});

// ❌ Bad — can't mutably borrow the same query twice in one closure
```

---

## Cargo Dependencies

```toml
[dependencies]
bevy = { version = "0.18", features = ["default"] }
# MeshPickingPlugin is behind the "mesh_picking" feature,
# which is included in "default" features.
```
