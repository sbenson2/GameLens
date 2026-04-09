# E10 — Custom Shaders & Materials

> **Category:** explanation · **Engine:** Bevy 0.18 · **Related:** [E5 3D Rendering & Lighting](E5_3d_rendering_lighting.md) · [E2 Rendering & Cameras](E2_rendering_cameras.md) · [R1 Plugins & WASM](../reference/R1_plugins_and_wasm.md) · [bevy-arch-rules](../bevy-arch-rules.md)

---

## Overview

Bevy's material system lets you define custom GPU shaders and bind Rust-side data to them through derive macros. The `Material` trait and `AsBindGroup` derive handle the boilerplate of creating bind groups, pipeline specialization, and render phase integration — so you focus on writing WGSL and defining your data layout.

This doc covers writing custom materials from scratch, extending `StandardMaterial`, the render pipeline architecture, and post-processing effects. All examples target **Bevy 0.18**.

---

## The Material Trait

Every custom material implements `Material`, which controls which shaders run and how the pipeline is specialized.

```rust
use bevy::prelude::*;
use bevy::render::render_resource::{AsBindGroup, ShaderRef};

// The AsBindGroup derive generates GPU bind group layout from struct fields.
// Each #[uniform] / #[texture] / #[sampler] maps to a WGSL binding.
#[derive(Asset, TypePath, AsBindGroup, Clone)]
pub struct WaterMaterial {
    /// Bound as a uniform buffer at binding 0 in WGSL.
    /// ShaderType is auto-derived for f32, Vec4, Color, and custom structs.
    #[uniform(0)]
    pub color: LinearRgba,
    #[uniform(0)]
    pub speed: f32,
    #[uniform(0)]
    pub wave_amplitude: f32,

    /// Bound as a texture (binding 1) + sampler (binding 2).
    #[texture(1)]
    #[sampler(2)]
    pub noise_texture: Option<Handle<Image>>,
}

impl Material for WaterMaterial {
    // Point to your WGSL vertex shader (optional — Bevy has a default).
    fn vertex_shader() -> ShaderRef {
        "shaders/water.wgsl".into()
    }

    // Point to your WGSL fragment shader.
    fn fragment_shader() -> ShaderRef {
        "shaders/water.wgsl".into()
    }

    // Override alpha mode, depth testing, cull mode, etc.
    fn alpha_mode(&self) -> AlphaMode {
        AlphaMode::Blend
    }
}
```

### Registering the Material

Materials must be registered as plugins so Bevy creates the necessary render pipelines:

```rust
fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        // Register your custom material — this creates the render pipeline
        .add_plugins(MaterialPlugin::<WaterMaterial>::default())
        .add_systems(Startup, setup)
        .run();
}

fn setup(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut water_materials: ResMut<Assets<WaterMaterial>>,
    asset_server: Res<AssetServer>,
) {
    commands.spawn((
        Mesh3d(meshes.add(Plane3d::default().mesh().size(20.0, 20.0))),
        MeshMaterial3d(water_materials.add(WaterMaterial {
            color: LinearRgba::new(0.1, 0.4, 0.8, 0.7),
            speed: 1.0,
            wave_amplitude: 0.3,
            noise_texture: Some(asset_server.load("textures/noise.png")),
        })),
    ));
}
```

---

## The WGSL Shader Side

Bevy provides import macros for standard transforms, view data, and PBR utilities. Your shader binds to the layout defined by `AsBindGroup`.

```wgsl
// shaders/water.wgsl

// Bevy's standard imports for transforms and view data
#import bevy_pbr::forward_io::VertexOutput

// Your material uniform — matches the #[uniform(0)] fields.
// Bevy packs all #[uniform(0)] fields into a single buffer.
struct WaterMaterial {
    color: vec4<f32>,
    speed: f32,
    wave_amplitude: f32,
};

@group(2) @binding(0) var<uniform> material: WaterMaterial;
@group(2) @binding(1) var noise_texture: texture_2d<f32>;
@group(2) @binding(2) var noise_sampler: sampler;

@fragment
fn fragment(in: VertexOutput) -> @location(0) vec4<f32> {
    // Sample noise texture with time-based UV offset
    let noise = textureSample(
        noise_texture,
        noise_sampler,
        in.uv + vec2<f32>(material.speed * 0.01, 0.0)
    );

    // Mix base color with noise for a simple water effect
    let final_color = material.color * (0.8 + 0.2 * noise.r);
    return final_color;
}
```

### Bind Group Layout

| Attribute | WGSL binding | Purpose |
|-----------|-------------|---------|
| `#[uniform(N)]` | `@group(2) @binding(N) var<uniform>` | Struct data sent to GPU each frame |
| `#[texture(N)]` | `@group(2) @binding(N) var texture_2d<f32>` | Texture handle → GPU texture |
| `#[sampler(N)]` | `@group(2) @binding(N) var sampler` | Sampling config for a texture |
| `#[storage(N)]` | `@group(2) @binding(N) var<storage>` | Large read-only data (instance buffers, etc.) |

**Why group 2?** Groups 0 and 1 are reserved by Bevy for view/camera data and mesh data. Your material always lives in group 2.

---

## Extending StandardMaterial

Often you don't need a material from scratch — you want PBR lighting plus a custom effect. `ExtendedMaterial` wraps `StandardMaterial` and layers your extension on top:

```rust
use bevy::pbr::{ExtendedMaterial, MaterialExtension};

#[derive(Asset, TypePath, AsBindGroup, Clone)]
pub struct GlowExtension {
    #[uniform(100)] // Use high binding numbers to avoid collision
    pub glow_color: LinearRgba,
    #[uniform(100)]
    pub glow_intensity: f32,
}

impl MaterialExtension for GlowExtension {
    fn fragment_shader() -> ShaderRef {
        "shaders/glow_extension.wgsl".into()
    }
}

// Register with the combined type
fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .add_plugins(MaterialPlugin::<
            ExtendedMaterial<StandardMaterial, GlowExtension>
        >::default())
        .run();
}
```

In the WGSL shader, you still get full access to PBR outputs and can modify them:

```wgsl
#import bevy_pbr::pbr_fragment::pbr_input_from_standard_material

// Your extension uniform
struct GlowExtension {
    glow_color: vec4<f32>,
    glow_intensity: f32,
};

@group(2) @binding(100) var<uniform> glow: GlowExtension;

@fragment
fn fragment(in: VertexOutput) -> @location(0) vec4<f32> {
    // Get the standard PBR result
    var pbr_out = bevy_pbr::pbr_functions::main_pbr(in);

    // Add glow on top
    pbr_out = pbr_out + glow.glow_color * glow.glow_intensity;

    return pbr_out;
}
```

This approach gives you PBR lighting, shadows, environment maps, and fog — all for free — while adding your custom visual on top.

---

## Render Pipeline Architecture

Understanding Bevy's render pipeline helps when debugging custom materials or writing advanced effects.

### Dual-World Architecture

Bevy runs two ECS worlds in parallel:

1. **Main World** — your game logic, components, systems
2. **Render World** — GPU resources, draw commands, pipeline state

Every frame, data flows through four phases:

### The Four Render Phases

| Phase | Schedule Set | What happens |
|-------|-------------|--------------|
| **Extract** | `ExtractSchedule` | Copies relevant data from Main World → Render World. This is the only sync point between the two worlds. |
| **Prepare** | `PrepareResources`, `PrepareBindGroups` | Creates/updates GPU buffers, textures, bind groups from extracted data. |
| **Queue** | `QueueMeshes` | Creates `PhaseItem` entries for each visible entity, selecting the correct render pipeline and draw function. |
| **Render** | `Render` | Executes the render graph — sorts phase items (opaque front-to-back, transparent back-to-front), then issues GPU draw calls. |

For custom materials using the `Material` trait, Bevy handles all four phases automatically. You only need to touch this if you're writing custom render phases or compute shaders.

---

## 2D Materials

`Material2d` works identically to `Material` but targets Bevy's 2D renderer:

```rust
#[derive(Asset, TypePath, AsBindGroup, Clone)]
pub struct RetroMaterial2d {
    #[uniform(0)]
    pub palette_size: f32,
    #[uniform(0)]
    pub dither_strength: f32,
}

impl Material2d for RetroMaterial2d {
    fn fragment_shader() -> ShaderRef {
        "shaders/retro_2d.wgsl".into()
    }
}

// Register with Material2dPlugin instead
app.add_plugins(Material2dPlugin::<RetroMaterial2d>::default());
```

Spawn 2D material entities with `MeshMaterial2d` instead of `MeshMaterial3d`.

---

## Post-Processing Effects

For full-screen post-processing, use Bevy's `PostProcessNode` pattern with a full-screen triangle:

```rust
// Post-process materials use the same AsBindGroup + Material trait,
// but you configure them as full-screen passes.
#[derive(Asset, TypePath, AsBindGroup, Clone)]
pub struct ChromaticAberration {
    #[uniform(0)]
    pub intensity: f32,
    #[texture(1)]
    #[sampler(2)]
    pub screen_texture: Handle<Image>,
}

impl Material for ChromaticAberration {
    fn fragment_shader() -> ShaderRef {
        "shaders/chromatic_aberration.wgsl".into()
    }
}
```

Bevy's official `custom_post_processing` example demonstrates the full setup including camera render target configuration.

---

## Shader Defs (Compile-Time Branching)

Use shader defs to conditionally compile different shader variants:

```rust
impl Material for MyMaterial {
    fn specialize(
        _pipeline: &MaterialPipeline<Self>,
        descriptor: &mut RenderPipelineDescriptor,
        _layout: &MeshVertexBufferLayoutRef,
        key: MaterialPipelineKey<Self>,
    ) -> Result<(), SpecializedMeshPipelineError> {
        // Add a shader def based on material state
        if key.bind_group_data.use_fancy_lighting {
            descriptor
                .fragment
                .as_mut()
                .unwrap()
                .shader_defs
                .push("FANCY_LIGHTING".into());
        }
        Ok(())
    }
}
```

Then in WGSL:

```wgsl
#ifdef FANCY_LIGHTING
    // Expensive multi-bounce lighting calculation
    let light = compute_fancy_lighting(in);
#else
    // Simple Lambertian
    let light = dot(in.world_normal, light_dir);
#endif
```

---

## Cargo Dependencies

```toml
[dependencies]
bevy = "0.18"  # Material, AsBindGroup, and render types are in bevy::prelude and bevy::render
```

No additional crates are needed for custom materials — everything is built into Bevy's core.

---

## Common Pitfalls

### Bind Group Mismatches
The most common shader error is mismatched bindings between your Rust struct and WGSL. If you have `#[uniform(0)]` on two fields, they're packed into one buffer — your WGSL struct must list them in the same order.

### Forgetting MaterialPlugin
If you see "no render pipeline for material," you forgot to add `MaterialPlugin::<YourMaterial>::default()`.

### Ownership and the Asset System
Materials are assets managed by `Assets<T>`. You get a `Handle<YourMaterial>` back from `materials.add()`. Don't try to store the material struct directly on an entity — always go through the asset system. This is a common Rust ownership gotcha: the `Assets` resource owns the data, and entities hold lightweight handles.

### Hot Reloading
WGSL files in `assets/shaders/` support hot-reloading in dev builds. Edit your shader, save, and Bevy recompiles the pipeline automatically — no restart needed.

---

## Summary

| Want to... | Use |
|-----------|-----|
| Full custom look | `Material` trait + WGSL from scratch |
| PBR + one custom effect | `ExtendedMaterial<StandardMaterial, YourExt>` |
| 2D sprite/mesh effects | `Material2d` trait |
| Full-screen post-process | `Material` + full-screen triangle pass |
| Compile-time variants | `specialize()` + shader defs |

The `AsBindGroup` derive macro and `Material` trait handle the heavy lifting. Start with `ExtendedMaterial` when possible, drop down to full custom materials when you need complete control.
