# R1 — Heaps h3d: 3D Rendering, Materials, and Lighting

> **Category:** reference · **Engine:** Heaps · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [2D Scene Graph](../guides/G2_2d_scene_graph.md) · [Heaps Rules](../heaps-arch-rules.md)

Heaps provides a complete 3D rendering pipeline through the `h3d` package. This reference covers mesh creation, FBX model loading, materials (basic and PBR), lighting, and shadows — the building blocks for any 3D game or visualization in Heaps.

---

## The h3d Scene Graph

The 3D scene graph mirrors the 2D one. All 3D objects descend from `h3d.scene.Object` and live under `s3d` (the root `h3d.scene.Scene`, available in any `hxd.App` subclass).

```
h3d.scene.Scene (s3d)             ← root of the 3D scene graph
├── h3d.scene.Mesh (floor)        ← renderable geometry
├── h3d.scene.Mesh (player)       ← another mesh
├── h3d.scene.DirLight            ← directional light
└── h3d.scene.Object (group)      ← empty transform node (grouping)
    └── h3d.scene.Mesh (child)
```

### Key h3d.scene Classes

| Class | Purpose |
|-------|---------|
| `h3d.scene.Object` | Base 3D node — transform, parent/child hierarchy |
| `h3d.scene.Mesh` | Renderable mesh (geometry + material) |
| `h3d.scene.Scene` | Scene root (accessible as `s3d` in `hxd.App`) |
| `h3d.scene.DirLight` | Directional light (basic renderer) |
| `h3d.scene.PointLight` | Point light (basic renderer) |
| `h3d.scene.Interactive` | 3D click/hover detection |
| `h3d.Camera` | 3D camera (perspective or orthographic) |

---

## Creating Meshes from Primitives

Heaps provides built-in primitives in `h3d.prim.*`:

```haxe
// Create a cube primitive
var cube = new h3d.prim.Cube();
cube.translate(-0.5, -0.5, -0.5);  // center the origin
cube.addNormals();                   // required for lighting
cube.addUVs();                       // required for texturing

// Create a mesh from the primitive and add to the 3D scene
var mesh = new h3d.scene.Mesh(cube, s3d);
mesh.setPosition(0, 0, 1);
mesh.material.color.setColor(0xEA8220);  // orange tint
```

### Built-in Primitives

| Class | Shape |
|-------|-------|
| `h3d.prim.Cube` | Unit cube (optionally translate to center) |
| `h3d.prim.Sphere` | UV sphere (specify rings and segments) |
| `h3d.prim.Plane2D` | Flat quad |
| `h3d.prim.Grid` | Subdivided plane (heightmap-friendly) |
| `h3d.prim.Disc` | Flat circle |

**Critical:** Always call `addNormals()` before applying lighting or shadows. Call `addUVs()` before applying textures. Without these, geometry appears black or untextured.

---

## Loading FBX Models

For production 3D content, load FBX models from external tools (Blender, Maya, etc.) via `h3d.prim.ModelCache`:

### ModelCache (Recommended)

```haxe
var cache = new h3d.prim.ModelCache();

// Load a model — textures are resolved automatically
var obj = cache.loadModel(hxd.Res.models.character);
s3d.addChild(obj);

// Load and play an animation from the same model
var anim = cache.loadAnimation(hxd.Res.models.character);
obj.playAnimation(anim);

// When done with the cache (e.g., scene change):
cache.dispose();
```

`ModelCache` handles texture resolution, caching, and memory management. It first checks for textures adjacent to the model file, then falls back to the resource root.

### Manual Loading (Advanced)

```haxe
// Convert FBX to the internal HMD format
var lib = hxd.Res.models.character.toHMD();

// Create the 3D object with a custom texture resolver
var obj = lib.makeObject(function(texturePath) {
    return hxd.Res.load(texturePath).toTexture();
});
s3d.addChild(obj);

// Play animation
var anim = lib.loadAnimation();
obj.playAnimation(anim);
```

### Animation Playback

```haxe
// Play an animation (loops by default)
obj.playAnimation(anim);

// Control playback
obj.currentAnimation.pause = true;
obj.currentAnimation.speed = 0.5;    // half speed
obj.currentAnimation.loop = false;   // play once

// Switch animation
obj.playAnimation(idleAnim);

// Blend between animations (smooth transitions)
obj.switchToAnimation(runAnim, 0.2); // 0.2s blend time
```

---

## Basic Materials

Every `Mesh` has a `material` property (`h3d.mat.Material`) that controls how it's rendered.

### Color and Texture

```haxe
// Solid color
mesh.material.color.setColor(0xFF0000);  // red

// Texture (requires UVs on the primitive)
var tex = hxd.Res.textures.diffuse.toTexture();
var mat = h3d.mat.Material.create(tex);
var mesh = new h3d.scene.Mesh(prim, mat, s3d);
```

### Enabling Lighting

By default, basic materials don't respond to lights. You must enable lighting explicitly:

```haxe
mesh.material.mainPass.enableLights = true;
```

### Blend Modes

```haxe
mesh.material.blendMode = Alpha;    // transparency
mesh.material.blendMode = Add;      // additive glow
mesh.material.blendMode = Multiply; // darkening
```

Available blend modes: `None`, `Alpha`, `Add`, `SoftAdd`, `Multiply`, `Erase`, `Screen`.

---

## PBR Materials

Heaps supports Physically Based Rendering for realistic lighting. PBR materials derive their appearance from three properties: **color**, **roughness** (0 = mirror, 1 = matte), and **metalness** (0 = dielectric, 1 = metal).

### PBR Setup (Required Once)

Enable the PBR pipeline before creating your scene — typically at the start of `init()`:

```haxe
override function init() {
    // Switch to the PBR material system
    h3d.mat.MaterialSetup.current = new h3d.mat.PbrMaterialSetup();

    // Set up environment lighting (cubemap-based)
    var envMap = new h3d.mat.Texture(512, 512, [Cube]);
    var env = new h3d.scene.pbr.Environment(envMap);
    env.compute();

    // Assign environment to the PBR renderer
    var renderer = cast(s3d.renderer, h3d.scene.pbr.Renderer);
    renderer.env = env;
    renderer.exposure = 1.0;  // adjust scene brightness (-3 to 3)
}
```

### Applying PBR Properties

```haxe
var sphere = new h3d.scene.Mesh(new h3d.prim.Sphere(1, 32, 24), s3d);

// Set PBR material values via shader
var pbrValues = new h3d.shader.pbr.PropsValues(
    0.0,    // metalness (0 = non-metal, 1 = full metal)
    0.3,    // roughness (0 = mirror-smooth, 1 = fully rough)
    0       // emissive (0 = none)
);
sphere.material.mainPass.addShader(pbrValues);
```

### PBR Lighting

PBR materials use dedicated light classes from the `h3d.scene.pbr` package — do NOT mix with basic `h3d.scene.DirLight` / `PointLight`:

```haxe
// Point light (PBR)
var light = new h3d.scene.pbr.PointLight(s3d);
light.setPosition(30, 10, 40);
light.range = 100;   // light radius
light.power = 2;     // intensity multiplier

// Directional light (PBR) — for sun-like illumination
var dirLight = new h3d.scene.pbr.DirLight(new h3d.Vector(0.5, 0.5, -0.5), s3d);
dirLight.power = 1.5;
```

### PBR Key Classes

| Class | Purpose |
|-------|---------|
| `h3d.mat.PbrMaterialSetup` | Enables the PBR pipeline globally |
| `h3d.scene.pbr.Renderer` | PBR-specific renderer (exposure, environment) |
| `h3d.scene.pbr.Environment` | Cubemap environment for image-based lighting |
| `h3d.scene.pbr.PointLight` | PBR point light (range + power) |
| `h3d.scene.pbr.DirLight` | PBR directional light |
| `h3d.shader.pbr.PropsValues` | Shader to set metalness, roughness, emissive |

**Platform requirement:** PBR rendering requires HashLink or WebGL 2.0+.

---

## Shadows

Heaps supports real-time shadow mapping. Shadows are configured per-material and require at least one light in the scene.

### Enabling Shadows

```haxe
// Floor: receives shadows but doesn't cast them
var floor = new h3d.prim.Cube(10, 10, 0.1);
floor.addNormals();
var floorMesh = new h3d.scene.Mesh(floor, s3d);
floorMesh.material.mainPass.enableLights = true;
floorMesh.material.receiveShadows = true;

// Object: both casts and receives shadows
var obj = new h3d.scene.Mesh(spherePrim, s3d);
obj.material.mainPass.enableLights = true;
obj.material.shadows = true;  // cast + receive
```

### Shadow Map Quality

```haxe
// Access the shadow map pass and configure blur
var shadow = s3d.renderer.getPass(h3d.pass.ShadowMap);
shadow.blur.passes = 3;  // higher = softer shadows, more expensive
```

### Shadow Requirements Checklist

1. At least one light in the scene
2. `enableLights = true` on the material pass
3. `addNormals()` called on the geometry
4. `receiveShadows = true` or `shadows = true` on the material
5. For textured objects: `addUVs()` on the geometry

---

## 3D Camera

The 3D camera is accessible via `s3d.camera`:

```haxe
var cam = s3d.camera;

// Position and look-at
cam.pos.set(10, 10, 10);
cam.target.set(0, 0, 0);

// Projection settings
cam.fovY = 60;        // vertical field of view in degrees
cam.zNear = 0.1;
cam.zFar = 1000;

// Switch to orthographic
cam.orthoBounds = new h3d.col.Bounds();
cam.orthoBounds.setMin(new h3d.col.Point(-10, -10, -10));
cam.orthoBounds.setMax(new h3d.col.Point(10, 10, 10));
```

### Simple Orbit Camera

```haxe
var distance = 10.0;
var angleX = 0.0;
var angleZ = Math.PI / 4;

override function update(dt:Float) {
    // Rotate with keyboard
    if (hxd.Key.isDown(hxd.Key.LEFT))  angleX -= 2.0 * dt;
    if (hxd.Key.isDown(hxd.Key.RIGHT)) angleX += 2.0 * dt;
    if (hxd.Key.isDown(hxd.Key.UP))    angleZ = Math.min(angleZ + dt, Math.PI / 2 - 0.01);
    if (hxd.Key.isDown(hxd.Key.DOWN))  angleZ = Math.max(angleZ - dt, 0.1);

    s3d.camera.pos.set(
        Math.cos(angleX) * Math.cos(angleZ) * distance,
        Math.sin(angleX) * Math.cos(angleZ) * distance,
        Math.sin(angleZ) * distance
    );
    s3d.camera.target.set(0, 0, 0);
}
```

---

## GPU Particles (3D)

Heaps provides GPU-accelerated 3D particles via `h3d.parts.GpuParticles`:

```haxe
var parts = new h3d.parts.GpuParticles(s3d);
var group = parts.addGroup();
group.size = 0.2;
group.gravity = -1;
group.life = 2;
group.nparts = 1000;
group.emitMode = Point;
```

---

## Common Patterns

### Minimal 3D Scene with Lighting

```haxe
class Main extends hxd.App {
    override function init() {
        // Geometry
        var cube = new h3d.prim.Cube();
        cube.translate(-0.5, -0.5, -0.5);
        cube.addNormals();
        cube.addUVs();

        // Mesh with color
        var mesh = new h3d.scene.Mesh(cube, s3d);
        mesh.material.color.setColor(0x44AAFF);
        mesh.material.mainPass.enableLights = true;
        mesh.material.shadows = true;

        // Floor
        var floor = new h3d.prim.Cube(5, 5, 0.05);
        floor.addNormals();
        var floorMesh = new h3d.scene.Mesh(floor, s3d);
        floorMesh.setPosition(-2.5, -2.5, -0.5);
        floorMesh.material.color.setColor(0x808080);
        floorMesh.material.mainPass.enableLights = true;
        floorMesh.material.receiveShadows = true;

        // Light
        var light = new h3d.scene.DirLight(new h3d.Vector(0.5, 0.5, -0.5), s3d);

        // Camera
        s3d.camera.pos.set(3, 3, 3);
        s3d.camera.target.set(0, 0, 0);
    }

    override function update(dt:Float) {
        // Rotate the first mesh
        s3d.getChildAt(0).rotate(0, 0, dt);
    }

    static function main() {
        new Main();
    }
}
```
