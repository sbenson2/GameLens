# G4 — Shaders and Post-Processing in Heaps

> **Category:** guide · **Engine:** Heaps · **Related:** [h3d Rendering Reference](../reference/R1_h3d_rendering.md) · [2D Scene Graph](G2_2d_scene_graph.md) · [Resource Management](G3_resource_management.md)

Heaps uses a custom shader system built on HXSL (Haxe Shader Language), a type-safe, compile-time-checked shading language that transpiles to GLSL, HLSL, or SPIR-V depending on the backend. This guide covers writing custom shaders, applying them to 2D and 3D objects, and building full-screen post-processing effects.

---

## HXSL vs GLSL

Unlike raw GLSL, HXSL shaders are written as Haxe classes. The Haxe compiler validates them at build time, catching type errors and missing uniforms before you ever run your game. HXSL compiles to the appropriate GPU language for the current backend (OpenGL, DirectX, or Vulkan via HashLink).

Key differences from GLSL:
- Shaders are Haxe classes extending `hxsl.Shader`
- Uniforms are typed class fields, set from Haxe code
- Vertex and fragment stages are methods (`vertex()` and `fragment()`)
- Swizzling, vector math, and built-in functions work like GLSL but with Haxe syntax
- Multiple shaders compose automatically via Heaps' shader graph — no manual linking

---

## Writing a Basic HXSL Shader

A custom shader is a class that extends `hxsl.Shader`. You define `@:import` variables for pipeline inputs and typed `@param` fields for uniforms.

### Color Tint Shader

```haxe
class ColorTintShader extends hxsl.Shader {
    static var SRC = {
        // Uniform — set from Haxe code
        @param var tintColor : Vec4;
        @param var tintStrength : Float;

        // Fragment output from previous shader in the pipeline
        var pixelColor : Vec4;

        function fragment() {
            // Mix the existing pixel color with the tint
            pixelColor = mix(pixelColor, pixelColor * tintColor, tintStrength);
        }
    };

    public function new() {
        super();
        tintColor = new h3d.Vector4(1, 0, 0, 1);  // red tint
        tintStrength = 0.5;
    }
}
```

### Applying to a 2D Object

```haxe
var bitmap = new h2d.Bitmap(hxd.Res.textures.player.toTile(), s2d);

var tint = new ColorTintShader();
tint.tintColor = new h3d.Vector4(0, 1, 0, 1);  // green tint
tint.tintStrength = 0.3;

bitmap.addShader(tint);
```

### Applying to a 3D Mesh Material

```haxe
var mesh = new h3d.scene.Mesh(cubePrim, s3d);
mesh.material.mainPass.addShader(new ColorTintShader());
```

---

## HXSL Variable Types

| HXSL Type | GLSL Equivalent | Example |
|-----------|----------------|---------|
| `Float` | `float` | `@param var intensity : Float;` |
| `Vec2` | `vec2` | `@param var offset : Vec2;` |
| `Vec3` | `vec3` | `@param var lightDir : Vec3;` |
| `Vec4` | `vec4` | `@param var color : Vec4;` |
| `Mat4` | `mat4` | `@param var transform : Mat4;` |
| `Sampler2D` | `sampler2D` | `@param var noiseTex : Sampler2D;` |
| `Int` | `int` | `@param var frameIndex : Int;` |

### Built-in Pipeline Variables

These variables are provided by the Heaps rendering pipeline and can be read or written in shaders:

| Variable | Stage | Description |
|----------|-------|-------------|
| `input.position` | vertex | Mesh vertex position (model space) |
| `input.normal` | vertex | Mesh vertex normal |
| `input.uv` | vertex | Texture coordinates |
| `transformedPosition` | vertex | World-space position |
| `projectedPosition` | vertex | Screen-space position |
| `pixelColor` | fragment | Current fragment color (read/write) |
| `transformedNormal` | fragment | World-space normal |

---

## Vertex Shaders

Vertex shaders modify geometry positions. Use them for wobble effects, billboarding, wind simulation, or custom projections.

### Wave Distortion Shader

```haxe
class WaveShader extends hxsl.Shader {
    static var SRC = {
        @param var time : Float;
        @param var amplitude : Float;
        @param var frequency : Float;

        var relativePosition : Vec3;

        function vertex() {
            // Displace Y based on X position and time
            relativePosition.y += sin(relativePosition.x * frequency + time) * amplitude;
        }
    };

    public function new() {
        super();
        time = 0;
        amplitude = 0.1;
        frequency = 5.0;
    }
}
```

Update the time uniform each frame:

```haxe
var wave = new WaveShader();
mesh.material.mainPass.addShader(wave);

override function update(dt:Float) {
    wave.time += dt;
}
```

---

## Texture Sampling in Shaders

To sample textures in a custom shader, declare a `Sampler2D` parameter:

```haxe
class DissolveShader extends hxsl.Shader {
    static var SRC = {
        @param var noiseTex : Sampler2D;
        @param var threshold : Float;
        @param var edgeColor : Vec4;
        @param var edgeWidth : Float;

        var calculatedUV : Vec2;
        var pixelColor : Vec4;

        function fragment() {
            var noise = noiseTex.get(calculatedUV).r;

            // Dissolve: discard pixels below threshold
            if (noise < threshold) {
                discard;
            }

            // Glowing edge near the dissolve boundary
            if (noise < threshold + edgeWidth) {
                pixelColor = edgeColor;
            }
        }
    };

    public function new(noiseTexture:h3d.mat.Texture) {
        super();
        noiseTex = noiseTexture;
        threshold = 0.0;
        edgeColor = new h3d.Vector4(1, 0.5, 0, 1);  // orange
        edgeWidth = 0.05;
    }
}
```

Set the texture from Haxe:

```haxe
var noise = hxd.Res.textures.perlin_noise.toTexture();
noise.wrap = Repeat;  // tile the noise

var dissolve = new DissolveShader(noise);
sprite.addShader(dissolve);

// Animate the dissolve over time
override function update(dt:Float) {
    dissolve.threshold += dt * 0.3;
}
```

---

## Full-Screen Post-Processing

Heaps supports full-screen shader passes through `h3d.pass.ScreenFx` (3D) or by rendering to an `h2d.RenderTarget` (2D). The typical approach uses a render-to-texture step followed by a full-screen quad with a shader.

### Simple Grayscale Post-Process (2D)

```haxe
class GrayscaleShader extends hxsl.Shader {
    static var SRC = {
        @param var strength : Float;
        var pixelColor : Vec4;

        function fragment() {
            var lum = dot(pixelColor.rgb, vec3(0.299, 0.587, 0.114));
            pixelColor.rgb = mix(pixelColor.rgb, vec3(lum), strength);
        }
    };

    public function new() {
        super();
        strength = 1.0;
    }
}
```

Apply it as a filter on a 2D object or the entire scene:

```haxe
// Apply to a single sprite
sprite.filter = new h2d.filter.Shader(new GrayscaleShader());

// Apply to the entire 2D scene
s2d.filter = new h2d.filter.Shader(new GrayscaleShader());
```

### h2d.filter — Built-in Filters

Before writing custom post-processing shaders, check if Heaps' built-in filters cover your use case:

| Filter | Effect |
|--------|--------|
| `h2d.filter.Blur` | Gaussian blur (configurable radius and quality) |
| `h2d.filter.Glow` | Outer glow (color, radius, strength) |
| `h2d.filter.DropShadow` | Drop shadow (offset, color, blur) |
| `h2d.filter.ColorMatrix` | Full 4x4 color transform (saturation, brightness, hue) |
| `h2d.filter.Mask` | Clip rendering to a mask texture or object |
| `h2d.filter.Shader` | Wrap any custom `hxsl.Shader` as a filter |

Combine filters by chaining them:

```haxe
sprite.filter = new h2d.filter.Group([
    new h2d.filter.Blur(4),
    new h2d.filter.Glow(0xFF0000, 1.0, 8, 1.0)
]);
```

### 3D Post-Processing with ScreenFx

For 3D scenes, use `h3d.pass.ScreenFx` to apply a full-screen shader after the scene renders:

```haxe
class VignetteShader extends h3d.shader.ScreenShader {
    static var SRC = {
        @param var intensity : Float;
        @param var radius : Float;

        function fragment() {
            var uv = input.uv;
            var dist = distance(uv, vec2(0.5, 0.5));
            var vignette = smoothstep(radius, radius - 0.2, dist);
            pixelColor.rgb *= mix(1.0, vignette, intensity);
        }
    };

    public function new() {
        super();
        intensity = 0.8;
        radius = 0.75;
    }
}
```

Apply the vignette to the 3D renderer:

```haxe
var fx = new h3d.pass.ScreenFx(new VignetteShader());

// In your render or update loop:
override function update(dt:Float) {
    s3d.render(engine);  // render the 3D scene first
    fx.render();          // then apply post-process
}
```

---

## Shader Composition

Heaps automatically composes multiple shaders on the same object. Each shader's `fragment()` modifies `pixelColor` in sequence, and `vertex()` modifies positions in sequence. This means you can layer effects:

```haxe
// Layer 1: base texture (already set by the material)
// Layer 2: color tint
mesh.material.mainPass.addShader(new ColorTintShader());
// Layer 3: dissolve effect
mesh.material.mainPass.addShader(new DissolveShader(noiseTex));
```

The shader graph resolves variable dependencies automatically. If two shaders both write to `pixelColor`, the second one reads the value written by the first.

### Removing a Shader

```haxe
mesh.material.mainPass.removeShader(tintShader);
```

---

## Performance Tips

1. **Minimize texture samples** — Each `noiseTex.get(uv)` call is a GPU texture fetch. Batch reads where possible.
2. **Use `@const` for compile-time branches** — Mark parameters that don't change at runtime with `@const` to allow dead-code elimination:
   ```haxe
   @const var enableEffect : Bool;
   function fragment() {
       if (enableEffect) {
           // This branch is compiled out entirely when enableEffect is false
       }
   }
   ```
3. **Avoid `discard` on mobile** — Fragment discard prevents early-Z optimizations on many mobile GPUs. Use alpha blending instead when possible.
4. **Prefer filters for 2D** — `h2d.filter.*` classes handle render-target management and resolution scaling automatically. Writing manual render-to-texture code is only needed for advanced multi-pass techniques.
5. **Profile with HashLink** — HashLink provides the most accurate GPU profiling for Heaps. The HTML5 target adds WebGL overhead that can skew shader performance results.

---

## Common Pitfalls

| Issue | Cause | Fix |
|-------|-------|-----|
| Shader compiles but object is invisible | Missing `addNormals()` or `addUVs()` on the primitive | Call both before applying shaders |
| Uniform not updating | Setting the field on the wrong shader instance | Keep a reference to the shader instance you added |
| Black output from custom fragment shader | Not reading `pixelColor` before writing | Read the existing value first, then modify it |
| Type error in HXSL | Vector size mismatch (e.g., `Vec3 * Vec4`) | Match types explicitly — use `.rgb`, `.xyz` swizzles |
| Filter not visible on 2D object | Object has zero size or is off-screen | Verify the object has content and is within the scene bounds |
