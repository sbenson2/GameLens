# E12 — Fullscreen Materials & Post-Processing

> **Category:** explanation · **Engine:** Bevy 0.18 · **Related:** [E10 Custom Shaders & Materials](E10_custom_shaders_materials.md) · [E2 Rendering & Cameras](E2_rendering_cameras.md) · [bevy-arch-rules](../bevy-arch-rules.md)

---

## Overview

Bevy 0.18 introduced `FullscreenMaterial` — a high-level trait that makes it straightforward to define custom fullscreen post-processing effects. Before 0.18, the only way to create post-processing shaders was to define a low-level render feature (custom render nodes, pipelines, bind groups), which required deep knowledge of Bevy's render graph. The new system reduces this to a trait implementation and a WGSL shader.

---

## The Problem It Solves

Post-processing effects (chromatic aberration, vignette, color grading, CRT scanlines, screen-space outlines) all follow the same pattern: render a fullscreen triangle and sample the screen texture. Before `FullscreenMaterial`, each effect required ~200 lines of boilerplate render pipeline code. Now it's a trait implementation.

---

## FullscreenMaterial Trait

The core trait lives in `bevy::core_pipeline::fullscreen_material`. Implementing it requires two things: a fragment shader path and the ordering of your effect in the render graph.

```rust
use bevy::prelude::*;
use bevy::core_pipeline::fullscreen_material::FullscreenMaterial;
use bevy::render::render_graph::{InternedRenderLabel, Node3d};

// 1. Define your material — fields become shader uniforms
#[derive(Asset, TypePath, AsBindGroup, Clone)]
struct ChromaticAberration {
    #[uniform(0)]
    intensity: f32,
}

// 2. Implement the trait
impl FullscreenMaterial for ChromaticAberration {
    fn fragment_shader() -> ShaderRef {
        // Path relative to your `assets/` directory
        "shaders/chromatic_aberration.wgsl".into()
    }

    fn node_edges() -> Vec<InternedRenderLabel> {
        // Define WHERE in the pipeline this runs:
        // After tonemapping, before the end of post-processing
        vec![
            Node3d::Tonemapping.intern(),
            Self::node_label().intern(),
            Node3d::EndMainPassPostProcessing.intern(),
        ]
    }
}
```

### Key Trait Methods

| Method | Purpose | Default |
|--------|---------|---------|
| `fragment_shader()` | Path to the WGSL fragment shader | **Required** |
| `node_edges()` | Render graph ordering (runs between these nodes) | **Required** |
| `node_label()` | Unique label for this effect's render node | Derived from type name |

---

## Registering the Plugin

Use `FullscreenMaterialPlugin` to wire everything up:

```rust
use bevy::core_pipeline::fullscreen_material::FullscreenMaterialPlugin;

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .add_plugins(FullscreenMaterialPlugin::<ChromaticAberration>::default())
        .add_systems(Startup, setup)
        .run();
}

fn setup(mut commands: Commands, mut materials: ResMut<Assets<ChromaticAberration>>) {
    // Spawn a camera with the material attached
    let material_handle = materials.add(ChromaticAberration { intensity: 0.005 });

    commands.spawn((
        Camera3d::default(),
        // Attach the fullscreen material to the camera
        material_handle,
    ));
}
```

---

## Writing the WGSL Shader

The shader receives the screen texture automatically. Here's a minimal chromatic aberration example:

```wgsl
// shaders/chromatic_aberration.wgsl

#import bevy_core_pipeline::fullscreen_vertex_shader::FullscreenVertexOutput

@group(0) @binding(0) var screen_texture: texture_2d<f32>;
@group(0) @binding(1) var texture_sampler: sampler;

// Your custom uniform (matches the #[uniform(0)] field)
@group(2) @binding(0) var<uniform> intensity: f32;

@fragment
fn fragment(in: FullscreenVertexOutput) -> @location(0) vec4<f32> {
    let uv = in.uv;
    let offset = vec2<f32>(intensity, 0.0);

    let r = textureSample(screen_texture, texture_sampler, uv + offset).r;
    let g = textureSample(screen_texture, texture_sampler, uv).g;
    let b = textureSample(screen_texture, texture_sampler, uv - offset).b;
    let a = textureSample(screen_texture, texture_sampler, uv).a;

    return vec4<f32>(r, g, b, a);
}
```

### Shader Conventions

- Import `FullscreenVertexOutput` from Bevy's built-in fullscreen vertex shader — it provides UV coordinates and clip position.
- `@group(0)` and `@group(1)` are reserved by Bevy for the screen texture and sampler. Your custom uniforms start at `@group(2)`.
- The shader runs once per pixel after the main pass renders.

---

## Render Graph Ordering

The `node_edges()` method controls **when** your effect runs. Bevy's 3D render graph has these key nodes in order:

```
MainPass → Bloom → Tonemapping → [YOUR EFFECT] → EndMainPassPostProcessing → Upscaling → FXAA
```

Common ordering patterns:

```rust
// After tonemapping (most effects go here — operates on LDR color)
fn node_edges() -> Vec<InternedRenderLabel> {
    vec![
        Node3d::Tonemapping.intern(),
        Self::node_label().intern(),
        Node3d::EndMainPassPostProcessing.intern(),
    ]
}

// Before tonemapping (operates on HDR color — use for bloom-like effects)
fn node_edges() -> Vec<InternedRenderLabel> {
    vec![
        Node3d::MainPass.intern(),
        Self::node_label().intern(),
        Node3d::Bloom.intern(),
    ]
}
```

> **Rust gotcha:** `node_edges()` returns owned `Vec<InternedRenderLabel>`. The `.intern()` call converts a label to its interned (deduplicated) form. Make sure you call it on both the node constants and `Self::node_label()`.

---

## Multiple Effects & Chaining

You can register multiple `FullscreenMaterialPlugin` instances. Control ordering by referencing other effects' node labels:

```rust
// Vignette runs after ChromaticAberration
impl FullscreenMaterial for Vignette {
    fn fragment_shader() -> ShaderRef {
        "shaders/vignette.wgsl".into()
    }

    fn node_edges() -> Vec<InternedRenderLabel> {
        vec![
            ChromaticAberration::node_label().intern(),
            Self::node_label().intern(),
            Node3d::EndMainPassPostProcessing.intern(),
        ]
    }
}
```

---

## Dynamic Parameter Updates

Since the material is a standard Bevy asset, you can update parameters at runtime:

```rust
fn update_aberration(
    time: Res<Time>,
    materials: ResMut<Assets<ChromaticAberration>>,
) {
    for (_, mat) in materials.iter_mut() {
        // Pulse the intensity based on time
        mat.intensity = 0.003 + 0.002 * time.elapsed_secs().sin();
    }
}
```

---

## When to Use FullscreenMaterial vs. Low-Level Render Features

| Use Case | Approach |
|----------|----------|
| Standard post-processing (color grading, vignette, blur) | `FullscreenMaterial` |
| Effects that need depth/normal buffers | `FullscreenMaterial` with additional texture bindings |
| Multi-pass effects (ping-pong blur) | Low-level render feature |
| Compute shader effects | Low-level render feature |
| Effects that modify geometry or vertices | Custom render pipeline |

---

## Cargo Dependencies

No extra crate needed — `FullscreenMaterial` is part of `bevy::core_pipeline`:

```toml
[dependencies]
bevy = "0.18"
```

The module is available when the `bevy_core_pipeline` feature is enabled (included in default features).
