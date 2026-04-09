# G8 — 3D Rendering & Models

> **Category:** guide · **Engine:** Macroquad 0.4 · **Related:** [G1 Getting Started](G1_getting_started.md) · [G3 Camera, Textures & Coroutines](G3_camera_textures_coroutines.md) · [R1 Drawing, Input & Audio](../reference/R1_drawing_input_audio.md) · [macroquad-arch-rules](../macroquad-arch-rules.md)

---

## Overview

Macroquad is primarily a 2D library, but it includes a practical set of 3D rendering primitives in the `macroquad::models` module. These are great for simple 3D games, voxel prototypes, debug visualizations, first-person experiments, and game jam entries. For production-grade 3D with PBR, skeletal animation, and advanced lighting, consider Bevy or Fyrox instead.

All 3D functions in Macroquad 0.4 return `Result<_, macroquad::Error>` instead of panicking (a change from 0.3).

---

## Setup

```toml
# Cargo.toml
[dependencies]
macroquad = "0.4"
```

No special features needed — 3D primitives are included in the base crate.

---

## Camera3D

All 3D rendering requires setting a `Camera3D` before drawing. This tells Macroquad how to project 3D coordinates onto the 2D screen.

```rust
use macroquad::prelude::*;

#[macroquad::main("3D Example")]
async fn main() {
    loop {
        clear_background(LIGHTGRAY);

        // Set up the 3D camera
        set_camera(&Camera3D {
            position: vec3(-20.0, 15.0, 0.0),
            up: vec3(0.0, 1.0, 0.0),
            target: vec3(0.0, 0.0, 0.0),
            ..Default::default()
        });

        // Draw 3D things here...
        draw_grid(20, 1.0, BLACK, GRAY);

        // Switch back to default 2D camera for UI
        set_default_camera();
        draw_text("3D Scene", 10.0, 20.0, 30.0, DARKGRAY);

        next_frame().await;
    }
}
```

### Camera3D Fields

| Field | Type | Purpose |
|-------|------|---------|
| `position` | `Vec3` | Where the camera is in world space |
| `target` | `Vec3` | The point the camera looks at |
| `up` | `Vec3` | Which direction is "up" (usually `vec3(0, 1, 0)`) |
| `fovy` | `f32` | Vertical field of view in degrees (default: 60°) |
| `projection` | `Projection` | `Perspective` (default) or `Orthographics` |
| `render_target` | `Option<RenderTarget>` | Render to texture instead of screen |

> **Rust note:** `Default::default()` fills all fields with sensible values. You typically only need to set `position`, `target`, and `up`.

---

## 3D Primitives

Macroquad provides immediate-mode drawing functions for common 3D shapes. Call these between `set_camera(&Camera3D { ... })` and `set_default_camera()`.

### Cubes

```rust
// Solid textured cube
draw_cube(
    vec3(0.0, 1.0, 0.0),    // position (center)
    vec3(2.0, 2.0, 2.0),    // size (width, height, depth)
    None,                     // texture (None = solid color)
    GREEN,                    // color
);

// Wireframe cube — great for debug visualization
draw_cube_wires(
    vec3(0.0, 1.0, 0.0),
    vec3(2.0, 2.0, 2.0),
    RED,
);
```

### Spheres

```rust
// Solid sphere
draw_sphere(
    vec3(5.0, 1.0, 0.0),    // center position
    1.0,                      // radius
    None,                     // texture
    BLUE,
);

// Wireframe sphere
draw_sphere_wires(
    vec3(5.0, 1.0, 0.0),
    1.0,
    Color::new(0.0, 0.0, 1.0, 0.5), // semi-transparent
);
```

### Planes

```rust
// Flat ground plane
draw_plane(
    vec3(0.0, 0.0, 0.0),    // center
    vec2(10.0, 10.0),        // size (x, z)
    None,                     // texture
    DARKGREEN,
);
```

### Lines in 3D

```rust
// Draw a 3D line (useful for debug rays, vectors, etc.)
draw_line_3d(
    vec3(0.0, 0.0, 0.0),    // start
    vec3(5.0, 5.0, 5.0),    // end
    YELLOW,
);
```

### Grid

```rust
// Draw a reference grid on the XZ plane
draw_grid(
    20,     // number of slices (subdivisions)
    1.0,    // spacing between lines
    BLACK,  // main axis color
    GRAY,   // grid line color
);
```

---

## Textured 3D Objects

Apply textures to primitives by loading an image and passing it in place of `None`:

```rust
use macroquad::prelude::*;

#[macroquad::main("Textured Cube")]
async fn main() {
    let texture = load_texture("assets/crate.png").await.unwrap();

    loop {
        clear_background(SKYBLUE);

        set_camera(&Camera3D {
            position: vec3(0.0, 5.0, -8.0),
            up: vec3(0.0, 1.0, 0.0),
            target: vec3(0.0, 0.0, 0.0),
            ..Default::default()
        });

        draw_cube(
            vec3(0.0, 1.0, 0.0),
            vec3(2.0, 2.0, 2.0),
            Some(&texture),    // Apply the texture
            WHITE,             // WHITE = no color tinting
        );

        draw_grid(20, 1.0, BLACK, GRAY);

        set_default_camera();
        next_frame().await;
    }
}
```

> **Tip:** Use `WHITE` as the color when applying a texture to show it at full brightness. Other colors tint the texture.

---

## Custom Meshes

For complex 3D objects, build a `Mesh` manually with vertices and indices:

```rust
use macroquad::prelude::*;
use macroquad::models::Vertex;

fn make_triangle_mesh() -> Mesh {
    Mesh {
        vertices: vec![
            Vertex {
                position: vec3(-1.0, 0.0, 0.0),
                uv: vec2(0.0, 0.0),
                color: RED.into(),
                normal: vec4(0.0, 1.0, 0.0, 0.0),
            },
            Vertex {
                position: vec3(1.0, 0.0, 0.0),
                uv: vec2(1.0, 0.0),
                color: GREEN.into(),
                normal: vec4(0.0, 1.0, 0.0, 0.0),
            },
            Vertex {
                position: vec3(0.0, 1.5, 0.0),
                uv: vec2(0.5, 1.0),
                color: BLUE.into(),
                normal: vec4(0.0, 1.0, 0.0, 0.0),
            },
        ],
        indices: vec![0, 1, 2],
        texture: None,
    }
}
```

Draw it with:

```rust
draw_mesh(&mesh);
```

### Vertex Fields

| Field | Type | Purpose |
|-------|------|---------|
| `position` | `Vec3` | Vertex position in local space |
| `uv` | `Vec2` | Texture coordinates (0.0–1.0) |
| `color` | `[u8; 4]` | Per-vertex color (RGBA) |
| `normal` | `Vec4` | Surface normal (for future lighting support) |

---

## Camera Movement (First-Person Style)

Macroquad doesn't include a built-in FPS camera, but it's straightforward to build:

```rust
use macroquad::prelude::*;

struct FpsCamera {
    position: Vec3,
    yaw: f32,
    pitch: f32,
    speed: f32,
    sensitivity: f32,
}

impl FpsCamera {
    fn new(position: Vec3) -> Self {
        Self {
            position,
            yaw: 0.0,
            pitch: 0.0,
            speed: 10.0,
            sensitivity: 0.003,
        }
    }

    fn update(&mut self) {
        let dt = get_frame_time();
        let (mouse_dx, mouse_dy) = mouse_delta_position();

        self.yaw += mouse_dx * self.sensitivity;
        self.pitch = (self.pitch + mouse_dy * self.sensitivity)
            .clamp(-1.5, 1.5);

        // Forward/right vectors from yaw
        let forward = vec3(self.yaw.cos(), 0.0, self.yaw.sin()).normalize();
        let right = vec3(-self.yaw.sin(), 0.0, self.yaw.cos()).normalize();

        if is_key_down(KeyCode::W) { self.position += forward * self.speed * dt; }
        if is_key_down(KeyCode::S) { self.position -= forward * self.speed * dt; }
        if is_key_down(KeyCode::A) { self.position -= right * self.speed * dt; }
        if is_key_down(KeyCode::D) { self.position += right * self.speed * dt; }
    }

    fn to_camera3d(&self) -> Camera3D {
        let target = self.position + vec3(
            self.yaw.cos() * self.pitch.cos(),
            self.pitch.sin(),
            self.yaw.sin() * self.pitch.cos(),
        );
        Camera3D {
            position: self.position,
            up: vec3(0.0, 1.0, 0.0),
            target,
            ..Default::default()
        }
    }
}
```

Usage in your main loop:

```rust
let mut cam = FpsCamera::new(vec3(0.0, 2.0, -5.0));

loop {
    cam.update();
    set_camera(&cam.to_camera3d());

    // Draw 3D scene...

    set_default_camera();
    next_frame().await;
}
```

> **Gotcha:** `mouse_delta_position()` returns screen-space deltas. For mouse capture (hiding the cursor), use `set_cursor_grab(true)` and `show_mouse(false)`.

---

## Mixing 2D and 3D

A common pattern is rendering a 3D scene then overlaying 2D UI:

```rust
loop {
    clear_background(SKYBLUE);

    // --- 3D pass ---
    set_camera(&Camera3D {
        position: vec3(-10.0, 10.0, -10.0),
        target: vec3(0.0, 0.0, 0.0),
        up: vec3(0.0, 1.0, 0.0),
        ..Default::default()
    });

    draw_cube(vec3(0.0, 1.0, 0.0), vec3(2.0, 2.0, 2.0), None, ORANGE);
    draw_grid(20, 1.0, BLACK, GRAY);

    // --- 2D pass ---
    set_default_camera();
    draw_text("Score: 42", 10.0, 30.0, 40.0, WHITE);
    draw_rectangle(0.0, screen_height() - 40.0, 200.0, 40.0, Color::new(0.0, 0.0, 0.0, 0.5));

    next_frame().await;
}
```

`set_default_camera()` switches back to the built-in 2D screen-space camera. Everything drawn after it uses pixel coordinates.

---

## Limitations

Macroquad's 3D support is intentionally minimal:

- **No built-in lighting or shadows.** Objects are flat-shaded with vertex colors / textures. For basic lighting, write a custom shader (see [G5 Particles, Shaders & Tilemaps](G5_particles_shaders_tilemaps.md)).
- **No native glTF/OBJ loading.** You can build meshes manually or use community crates like `tobj` for OBJ files. glTF support is not built-in — see [GitHub issue #456](https://github.com/not-fl3/macroquad/issues/456).
- **No skeletal animation.** 3D animation requires manual vertex manipulation or external tooling.
- **No depth-sorting for transparent objects.** Draw opaque objects first, then transparent ones back-to-front.
- **No frustum culling.** All draw calls are submitted to the GPU regardless of visibility. For large scenes, implement culling in your game logic.

For projects that outgrow these limitations, consider migrating to Bevy (see the [Bevy architecture docs](../../bevy-arch/architecture/E1_ecs_fundamentals.md)).

---

## Complete Example: Spinning Crate

```rust
use macroquad::prelude::*;

#[macroquad::main("Spinning Crate")]
async fn main() {
    let texture = load_texture("assets/crate.png").await.unwrap();
    let mut rotation: f32 = 0.0;

    loop {
        rotation += get_frame_time() * 1.0;
        clear_background(Color::from_hex(0x2d2d2d));

        set_camera(&Camera3D {
            position: vec3(0.0, 4.0, -6.0),
            target: vec3(0.0, 1.0, 0.0),
            up: vec3(0.0, 1.0, 0.0),
            ..Default::default()
        });

        // Ground
        draw_plane(vec3(0.0, 0.0, 0.0), vec2(8.0, 8.0), None, DARKGRAY);

        // Rotating crate — apply rotation via a model matrix push
        // (Macroquad's draw_cube doesn't take rotation directly,
        // so we use gl_use_material / draw_mesh for advanced transforms.
        // For simple rotation, compute vertex positions manually or
        // accept axis-aligned cubes.)
        draw_cube(
            vec3(0.0, 1.0, 0.0),
            vec3(2.0, 2.0, 2.0),
            Some(&texture),
            WHITE,
        );

        draw_grid(16, 1.0, BLACK, Color::new(0.5, 0.5, 0.5, 0.3));

        set_default_camera();
        draw_text(
            &format!("FPS: {}", get_fps()),
            10.0, 25.0, 30.0, WHITE,
        );

        next_frame().await;
    }
}
```

---

## Further Reading

- [G1 Getting Started](G1_getting_started.md) — Project setup and 2D basics
- [G3 Camera, Textures & Coroutines](G3_camera_textures_coroutines.md) — 2D cameras and texture loading
- [G5 Particles, Shaders & Tilemaps](G5_particles_shaders_tilemaps.md) — Custom shaders for lighting effects
- [R1 Drawing, Input & Audio](../reference/R1_drawing_input_audio.md) — API reference
- [macroquad 3D example](https://github.com/not-fl3/macroquad/blob/master/examples/3d.rs) — Official example
- [macroquad docs.rs](https://docs.rs/macroquad/latest/macroquad/models/index.html) — Models module API
