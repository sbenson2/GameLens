# G04 — SDSL Shader Development

> **Category:** Guide · **Engine:** Stride · **Related:** [G01 Getting Started](./G01_getting_started.md) · [G03 Code-Only Development](./G03_code_only_development.md) · [Stride Architecture Rules](../stride-arch-rules.md)

Stride Shading Language (SDSL) is Stride's shader system — a superset of HLSL that adds object-oriented features like classes, inheritance, mixins, and composition. Instead of writing monolithic shader files, you build small, reusable shader modules and combine them. SDSL compiles to HLSL, GLSL, or SPIR-V automatically, so you write one shader and it runs on DirectX, OpenGL, and Vulkan. This guide covers SDSL syntax, the mixin system, stream variables, composition, custom materials, post-processing effects, and practical patterns for game rendering.

---

## Table of Contents

1. [Why SDSL?](#1--why-sdsl)
2. [SDSL vs. Plain HLSL](#2--sdsl-vs-plain-hlsl)
3. [Shader Classes and Inheritance](#3--shader-classes-and-inheritance)
4. [Stream Variables](#4--stream-variables)
5. [Mixins and Multiple Inheritance](#5--mixins-and-multiple-inheritance)
6. [Composition](#6--composition)
7. [The `stage` and `clone` Keywords](#7--the-stage-and-clone-keywords)
8. [Built-in Shader Library](#8--built-in-shader-library)
9. [Custom Material Shaders](#9--custom-material-shaders)
10. [Post-Processing Effects](#10--post-processing-effects)
11. [Shader Compilation Pipeline](#11--shader-compilation-pipeline)
12. [Debugging Shaders](#12--debugging-shaders)
13. [Common Pitfalls](#13--common-pitfalls)
14. [Comparison with Other Shader Systems](#14--comparison-with-other-shader-systems)

---

## 1 — Why SDSL?

Traditional shader development has a scaling problem. As your game grows, you end up with dozens of shader variants — lit vs. unlit, skinned vs. static, transparent vs. opaque, with or without normal maps — each requiring its own file or complex preprocessor `#ifdef` chains.

SDSL solves this with object-oriented composition:

- **Inheritance:** A shader can extend another, overriding specific stages
- **Mixins:** Combine multiple shader behaviors without diamond-problem conflicts
- **Composition:** Inject one shader into another as a pluggable module
- **Streams:** Pass data between shader stages without manually writing input/output structs

The result: you write small, focused shader modules (lighting, skinning, texturing) and combine them declaratively. Stride's shader mixer generates the final monolithic shader at compile time.

## 2 — SDSL vs. Plain HLSL

SDSL files use the `.sdsl` extension and live in the `Effects/` directory of your Stride project. Here is a comparison:

### Plain HLSL Approach

```hlsl
// Every variant needs manual struct definitions
struct VSInput {
    float3 Position : POSITION;
    float2 TexCoord : TEXCOORD0;
    float3 Normal : NORMAL;
};

struct PSInput {
    float4 Position : SV_POSITION;
    float2 TexCoord : TEXCOORD0;
    float3 Normal : TEXCOORD1;
};

// Vertex shader
PSInput VS(VSInput input) {
    PSInput output;
    output.Position = mul(float4(input.Position, 1), WorldViewProjection);
    output.TexCoord = input.TexCoord;
    output.Normal = mul(input.Normal, (float3x3)World);
    return output;
}

// Pixel shader
float4 PS(PSInput input) : SV_TARGET {
    float3 lightDir = normalize(LightDirection);
    float ndotl = saturate(dot(input.Normal, lightDir));
    float4 texColor = DiffuseTexture.Sample(LinearSampler, input.TexCoord);
    return texColor * ndotl;
}
```

### SDSL Approach

```hlsl
shader MyLitTextured : ShaderBase, Transformation, Texturing
{
    // No manual structs — streams handle data passing
    // No manual transforms — inherited from Transformation
    // No manual UV setup — inherited from Texturing

    stage override float4 Shading()
    {
        float3 lightDir = normalize(LightDirection);
        float ndotl = saturate(dot(streams.normalWS, lightDir));
        float4 texColor = DiffuseTexture.Sample(LinearSampler, streams.TexCoord);
        return texColor * ndotl;
    }
};
```

The SDSL version inherits vertex transformation, UV coordinate handling, and normal processing from base shaders. You only write the unique shading logic.

## 3 — Shader Classes and Inheritance

An SDSL shader is declared with the `shader` keyword and can inherit from one or more base shaders:

```hlsl
// Base shader with a virtual method
shader ColorOutput : ShaderBase
{
    stage float4 GetColor()
    {
        return float4(1, 1, 1, 1); // Default: white
    }

    stage override float4 Shading()
    {
        return GetColor();
    }
};

// Derived shader overrides GetColor
shader RedOutput : ColorOutput
{
    stage override float4 GetColor()
    {
        return float4(1, 0, 0, 1); // Red
    }
};
```

### Key Rules

- **`stage` keyword on methods:** Ensures the method exists once in the final shader, even if multiple mixins define it
- **`override` keyword:** Overrides a method from a parent shader
- **`base` keyword:** Calls the parent implementation (like C# `base.Method()`)
- Method resolution follows mixin linearization order (last mixin wins)

### Calling Base Implementations

```hlsl
shader TintedOutput : ColorOutput
{
    float4 TintColor;

    stage override float4 GetColor()
    {
        // Call parent's GetColor and multiply by tint
        return base.GetColor() * TintColor;
    }
};
```

## 4 — Stream Variables

Stream variables are SDSL's most powerful feature. Declare a variable with the `stream` keyword and it becomes accessible in every shader stage (vertex, pixel, geometry, etc.) without manually defining input/output structs.

### Declaring Stream Variables

```hlsl
shader MyShader : ShaderBase
{
    // Declare a stream variable — accessible in VS, PS, etc.
    stream float3 customData;
    stream float2 flowDirection;

    // Write in vertex shader
    stage override void VSMain()
    {
        base.VSMain();
        streams.customData = float3(1, 2, 3);
        streams.flowDirection = float2(0.5, 0.5);
    }

    // Read in pixel shader — SDSL generates the interpolator automatically
    stage override float4 Shading()
    {
        return float4(streams.customData * streams.flowDirection.x, 1);
    }
};
```

### How Streams Work Internally

When you write `streams.myVar` in a vertex shader and read it in a pixel shader, the SDSL compiler:

1. Adds `myVar` to the VS output struct
2. Adds `myVar` to the PS input struct
3. Generates the interpolation semantics
4. Handles all platform-specific differences (DX vs. GL vs. Vulkan)

### Built-in Stream Variables

Stride's base shaders define many commonly needed streams:

| Stream | Type | Set By | Description |
|--------|------|--------|-------------|
| `streams.Position` | `float4` | Vertex input | Object-space position |
| `streams.ShadingPosition` | `float4` | Transformation | Clip-space position (SV_POSITION) |
| `streams.TexCoord` | `float2` | Texturing | Primary UV coordinates |
| `streams.normalWS` | `float3` | NormalStream | World-space normal |
| `streams.tangentWS` | `float4` | NormalStream | World-space tangent |
| `streams.meshNormal` | `float3` | Vertex input | Raw mesh normal |
| `streams.PositionWS` | `float4` | Transformation | World-space position |
| `streams.ColorTarget` | `float4` | Shading output | Final pixel color |
| `streams.Depth` | `float` | DepthBase | Depth value |

## 5 — Mixins and Multiple Inheritance

SDSL handles multiple inheritance through a mixin linearization system. The order of inheritance matters — later mixins override earlier ones for any conflicting methods.

### Basic Mixin Example

```hlsl
shader VertexColor : ShaderBase
{
    stream float4 vertColor;

    stage float4 GetVertexContribution()
    {
        return streams.vertColor;
    }
};

shader TextureColor : ShaderBase, Texturing
{
    stage float4 GetTextureContribution()
    {
        return Texture0.Sample(LinearSampler, streams.TexCoord);
    }
};

// Combine both — this shader has vertex color AND texture sampling
shader CombinedMaterial : VertexColor, TextureColor
{
    stage override float4 Shading()
    {
        return GetVertexContribution() * GetTextureContribution();
    }
};
```

### Mixin Linearization Order

When the same method is overridden in multiple mixins, SDSL resolves conflicts by linearization:

```hlsl
shader A : ShaderBase
{
    stage float4 Compute() { return float4(1, 0, 0, 1); }
};

shader B : A
{
    stage override float4 Compute() { return float4(0, 1, 0, 1); }
};

shader C : A
{
    stage override float4 Compute() { return float4(0, 0, 1, 1); }
};

// D inherits B, C — C is listed last, so C's Compute wins
shader D : B, C
{
    // Compute() returns blue (from C)
    // base.Compute() calls C's implementation
    // To call B's, you'd need explicit composition
};
```

**Rule:** If a mixin appears multiple times in the inheritance tree, only the first occurrence is kept. The last override in linearization order wins.

### Practical Mixin Pattern — Feature Layering

```hlsl
// Each mixin adds one rendering feature
shader DiffuseLighting : ShadingBase { /* Lambert diffuse */ };
shader SpecularLighting : ShadingBase { /* Blinn-Phong specular */ };
shader NormalMapping : NormalStream { /* Sample normal map */ };
shader EmissiveGlow : ShadingBase { /* Add emissive term */ };

// Combine features by listing mixins
shader FullPBRMaterial : DiffuseLighting, SpecularLighting, NormalMapping, EmissiveGlow
{
    // All features are active — each mixin contributes its behavior
};
```

## 6 — Composition

Composition lets you inject a shader as a member of another shader, creating pluggable slots. Unlike inheritance (which is resolved at compile time), composition creates named slots that can be filled with different implementations.

### Declaring a Composition

```hlsl
// Define an interface-like base shader
shader IColorProvider : ShaderBase
{
    abstract float4 GetColor();
};

// A shader that uses composition
shader ComposedMaterial : ShadingBase
{
    // Declare a composition slot — filled by a specific shader at material setup
    compose IColorProvider colorProvider;

    stage override float4 Shading()
    {
        return colorProvider.GetColor();
    }
};
```

### Providing a Composition Implementation

In Stride Game Studio, compositions appear as dropdowns in the material editor — you select which shader fills each slot. In code:

```csharp
// C# side — set up the composition
var material = new MaterialDescriptor();
// The composition "colorProvider" is filled with a specific shader implementation
// This is typically handled by the material system
```

### When to Use Composition vs. Inheritance

| Use Case | Approach |
|----------|----------|
| Add a fixed feature to a shader | Inheritance (mixin) |
| Create a pluggable slot that varies per material | Composition |
| Override a specific stage | Inheritance with `override` |
| Let artists swap implementations in the editor | Composition |

## 7 — The `stage` and `clone` Keywords

### `stage` Keyword

`stage` ensures a method or variable is defined exactly once in the final composed shader, regardless of how many mixins reference it:

```hlsl
shader MyMixin : ShaderBase
{
    // Without stage: each mixin that inherits this gets its own copy
    // With stage: only one definition exists, shared by all mixins
    stage float4 globalColor = float4(1, 1, 1, 1);

    stage float4 ComputeGlobal()
    {
        return globalColor;
    }
};
```

Use `stage` for:
- Methods that should only run once even if multiple mixins inherit them
- Variables that are shared state (not per-mixin copies)
- Entry points (`VSMain`, `PSMain`, `Shading`)

### `clone` Keyword

`clone` is the opposite of `stage`. When a method appears multiple times in the inheritance tree, `clone` forces separate instances at each level:

```hlsl
shader ParticleBase : ShaderBase
{
    // Each inheritor gets its own copy of this method
    clone float4 ComputeParticle()
    {
        return float4(0, 0, 0, 0);
    }
};
```

`clone` is rarely needed. Use it when you explicitly want duplicated behavior at each inheritance level rather than a single resolved implementation.

## 8 — Built-in Shader Library

Stride ships with a large library of base shaders. Use the Stride Shader Explorer tool (`tebjan/Stride.ShaderExplorer` on GitHub) to browse the full hierarchy.

### Essential Base Shaders

| Shader | Purpose |
|--------|---------|
| `ShaderBase` | Root of all shaders — provides `VSMain`, `PSMain` entry points |
| `ShaderBaseStream` | Adds stream infrastructure |
| `Transformation` | World/View/Projection transforms, computes `ShadingPosition` |
| `TransformationWAndVP` | Separates World and ViewProjection matrices |
| `Texturing` | UV coordinate handling, `Texture0` declaration |
| `NormalStream` | Normal, tangent, bitangent computation |
| `PositionStream4` | Position as float4 stream |
| `ShadingBase` | Base for material shading — `Shading()` method |
| `MaterialSurfaceStreams` | PBR material stream variables (albedo, metalness, roughness) |
| `DepthBase` | Depth buffer access |
| `SpriteBase` | 2D sprite rendering base |

### Inheritance Hierarchy (Simplified)

```
ShaderBase
├── ShaderBaseStream
│   ├── Transformation
│   │   ├── TransformationWAndVP
│   │   └── TransformationInstancing
│   ├── Texturing
│   │   └── TexturingMultiple
│   ├── NormalStream
│   │   └── NormalFromMesh
│   └── ShadingBase
│       ├── MaterialSurfaceLightingAndShading
│       └── SpriteBase
└── DepthBase
```

## 9 — Custom Material Shaders

### Creating a Simple Custom Effect

Create a new `.sdsl` file in your project's `Effects/` directory:

```hlsl
// Effects/MyDissolveEffect.sdsl
shader MyDissolveEffect : ShadingBase, Texturing
{
    // Parameters exposed to the material editor
    float DissolveThreshold;
    float EdgeWidth = 0.05;
    float4 EdgeColor = float4(1, 0.5, 0, 1); // Orange glow

    // Noise texture for dissolve pattern
    Texture2D NoiseTexture;
    SamplerState NoiseSampler;

    stage override float4 Shading()
    {
        float4 baseColor = base.Shading();

        // Sample noise texture for dissolve pattern
        float noise = NoiseTexture.Sample(NoiseSampler, streams.TexCoord).r;

        // Discard pixels below threshold
        if (noise < DissolveThreshold)
            discard;

        // Add glowing edge near the dissolve boundary
        float edgeFactor = 1.0 - saturate((noise - DissolveThreshold) / EdgeWidth);
        baseColor.rgb = lerp(baseColor.rgb, EdgeColor.rgb, edgeFactor);

        return baseColor;
    }
};
```

### Using Custom Shaders in the Editor

1. Build the project (Stride compiles `.sdsl` files during build)
2. In Game Studio, open a Material asset
3. Under Shading → Misc, add your custom shader
4. Parameters (`DissolveThreshold`, `NoiseTexture`) appear as editable fields

### Using Custom Shaders in Code-Only Projects

```csharp
// Create a custom effect
var effectInstance = new EffectInstance(
    EffectSystem.LoadEffect("MyDissolveEffect").WaitForResult()
);

effectInstance.Parameters.Set(
    MyDissolveEffectKeys.DissolveThreshold,
    0.5f
);
```

## 10 — Post-Processing Effects

Post-processing in Stride uses the same SDSL system. Custom post-processing effects inherit from image processing base shaders.

### Simple Post-Processing Shader

```hlsl
// Effects/GrayscaleEffect.sdsl
shader GrayscaleEffect : ImageEffectShader
{
    float Strength = 1.0;

    stage override float4 Shading()
    {
        float4 color = Texture0.Sample(LinearSampler, streams.TexCoord);

        // Convert to grayscale using luminance weights
        float gray = dot(color.rgb, float3(0.299, 0.587, 0.114));
        color.rgb = lerp(color.rgb, float3(gray, gray, gray), Strength);

        return color;
    }
};
```

### Registering as a Post-Processing Step

In C#, create a custom `ImageEffect` class:

```csharp
public class GrayscalePostProcess : ImageEffectShader
{
    public float Strength { get; set; } = 1.0f;

    public GrayscalePostProcess()
        : base("GrayscaleEffect") // matches the .sdsl shader name
    {
    }

    protected override void UpdateParameters(RenderDrawContext context)
    {
        base.UpdateParameters(context);
        Parameters.Set(GrayscaleEffectKeys.Strength, Strength);
    }
}
```

Then add it to the Graphics Compositor's post-processing stack in Game Studio or via code.

## 11 — Shader Compilation Pipeline

### How SDSL Becomes GPU Code

```
  .sdsl source files
        │
        ▼
┌──────────────────┐
│  SDSL Parser      │  Parses OOP constructs, resolves mixins
├──────────────────┤
│  Mixin Resolver   │  Linearizes inheritance, resolves overrides
├──────────────────┤
│  HLSL Generator   │  Produces flat HLSL from composed shader
├──────────────────┤
│  Platform Compiler│  
│  ├── D3D: FXC/DXC │
│  ├── GL: GLSL     │
│  └── VK: SPIR-V   │
└──────────────────┘
        │
        ▼
  Compiled shader bytecode (cached)
```

### Compilation Modes

- **Editor compile:** Shaders compile when you build in Game Studio; errors appear in the output log
- **Runtime compile:** Stride can compile shader permutations at runtime when new material combinations are encountered
- **AOT compile:** For shipping, pre-compile all expected shader permutations to avoid runtime compilation hitches

### Shader Permutations

Stride generates shader permutations based on material configuration. A material using normal mapping + diffuse + specular creates a different permutation than one using just diffuse. The number of permutations can grow quickly — monitor build times and shader cache size.

## 12 — Debugging Shaders

### Visual Studio / Rider Integration

The **Stride Shader Tools** VS Code extension provides:
- Syntax highlighting for `.sdsl` files
- Error reporting and IntelliSense
- Navigation to base shader definitions

### Debugging Techniques

1. **Output debug colors:** Replace `Shading()` return with diagnostic colors
   ```hlsl
   // Debug: visualize normals as colors
   return float4(streams.normalWS * 0.5 + 0.5, 1.0);

   // Debug: visualize UVs
   return float4(streams.TexCoord, 0, 1);
   ```

2. **RenderDoc integration:** Stride supports RenderDoc for GPU-level debugging. Capture a frame and inspect shader inputs/outputs at each draw call.

3. **Stride Shader Explorer:** Browse the full built-in shader hierarchy to understand what base shaders provide. Available at `github.com/tebjan/Stride.ShaderExplorer`.

4. **Check compilation output:** In Game Studio, check the output log for SDSL compilation errors. Common errors include mismatched stream types and unresolved mixin references.

## 13 — Common Pitfalls

### Pitfall 1: Missing `stage` on Override Methods

**Problem:** Overriding a `stage` method without the `stage` keyword creates a new non-stage method instead of overriding.
**Solution:** Always match `stage override` when overriding stage methods.

### Pitfall 2: Mixin Order Matters

**Problem:** Two mixins override the same method; the wrong one "wins."
**Solution:** The last mixin in the inheritance list takes priority. Reorder your inheritance to put the desired implementation last.

### Pitfall 3: Stream Variable Not Interpolated

**Problem:** A stream variable written in VS reads as zero in PS.
**Solution:** Ensure the variable is declared as `stream` (not a regular member). Also check that you are writing to `streams.myVar`, not a local variable.

### Pitfall 4: Shader Permutation Explosion

**Problem:** Build times spike as material variations multiply.
**Solution:** Keep composition hierarchies shallow. Reuse shader mixins rather than creating many similar standalone shaders.

### Pitfall 5: SDSL File Not Compiling

**Problem:** New `.sdsl` file is ignored during build.
**Solution:** Ensure the file is in the `Effects/` directory (or a subdirectory) and has Build Action set to `StrideShader` in the project properties. In code-only projects, add the appropriate MSBuild item.

### Pitfall 6: `base.Method()` Returns Unexpected Results

**Problem:** Calling `base.Shading()` in a deep mixin chain returns results from an unexpected parent.
**Solution:** Remember that `base` calls the next implementation in the linearized mixin order, not necessarily the direct parent in the source file. Use Shader Explorer to visualize the final inheritance chain.

## 14 — Comparison with Other Shader Systems

| Feature | SDSL (Stride) | HLSL/GLSL (Raw) | ShaderLab (Unity) | Shader Graph (Unity/UE) |
|---------|--------------|-----------------|-------------------|------------------------|
| Syntax base | HLSL superset | HLSL or GLSL | Custom DSL | Visual nodes |
| Inheritance | Yes (mixins) | No | No | No |
| Composition | Yes | No | SubShader fallback | Node connections |
| Stream variables | Yes | Manual structs | Manual structs | Automatic |
| Cross-platform | Auto-compiled | Manual per-platform | Auto-compiled | Auto-compiled |
| Code reuse | Excellent (OOP) | Copy-paste or #include | Limited | Node reuse |
| Learning curve | Medium | Low (if you know HLSL) | Medium | Low |
| IDE support | VS Code extension | Full | Unity Editor | Visual Editor |

SDSL's main advantage is code reuse at scale. For small projects with a few shaders, plain HLSL is simpler. For large projects with dozens of material types sharing common lighting, skinning, and transformation code, SDSL's mixin system pays for itself quickly.
