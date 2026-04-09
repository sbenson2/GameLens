# G07 — Shader Compilation with FXC

> **Category:** guide · **Engine:** FNA · **Related:** [G01 Getting Started](./G01_getting_started.md) · [G03 SDL3 GPU API](./G03_sdl3_gpu_api.md) · [G06 Content Loading](./G06_content_loading_without_pipeline.md)

How to compile, load, and manage Effect shaders in FNA using the DirectX FXC compiler. Covers Windows-native and cross-platform (Wine) workflows, MSBuild integration, and the shader format differences that make FNA shaders incompatible with MonoGame's MGFX.

---

## Why FXC, Not MGFX

FNA reproduces XNA 4.0 exactly. XNA used Microsoft's Effect framework with DXBC (DirectX Bytecode) binaries compiled by `fxc.exe`. MonoGame invented its own MGFX format for cross-platform compilation.

**The compiled binaries are not interchangeable.** One `.fx` source file can target both engines, but the compiled output (`.fxb` for FNA, `.mgfx`/`.xnb` for MonoGame) is engine-specific.

FNA uses **MojoShader** at runtime to translate DXBC bytecode to the active graphics backend (OpenGL, Vulkan, Metal, D3D11). This means you compile once with FXC and the resulting binary works on every platform FNA supports.

```
.fx source ──► fxc.exe (DXBC) ──► .fxb file ──► FNA + MojoShader
                                                  ├── OpenGL (desktop Linux/macOS)
                                                  ├── Vulkan (via FNA3D)
                                                  ├── Metal (macOS)
                                                  └── D3D11 (Windows)
```

---

## Setting Up FXC

### Option A: DirectX SDK (Windows)

Install the June 2010 DirectX SDK. `fxc.exe` is located at:

```
C:\Program Files (x86)\Microsoft DirectX SDK (June 2010)\Utilities\bin\x64\fxc.exe
```

Alternatively, extract just `fxc.exe` from the SDK and place it in your project's `build/tools/` directory for portability.

### Option B: Windows SDK (Windows 10+)

Modern Windows SDKs include `fxc.exe` at:

```
C:\Program Files (x86)\Windows Kits\10\bin\<version>\x64\fxc.exe
```

### Option C: Wine (Linux / macOS)

FXC is a Windows binary, but it works under Wine because the actual compilation is handled by `d3dcompiler_43.dll`, which Wine can load natively.

```bash
# Install Wine (Ubuntu/Debian)
sudo apt install wine64

# Install the required DirectX compiler DLL
winetricks d3dcompiler_43

# Place fxc.exe in your project
cp /path/to/fxc.exe ./build/tools/fxc.exe

# Compile a shader via Wine
wine ./build/tools/fxc.exe /T fx_2_0 /Fo Effects/MyShader.fxb Effects/MyShader.fx
```

On macOS with Homebrew:

```bash
brew install --cask wine-stable
winetricks d3dcompiler_43
wine ./build/tools/fxc.exe /T fx_2_0 /Fo Effects/MyShader.fxb Effects/MyShader.fx
```

---

## FXC Command Reference

### Basic Compilation

```bash
fxc.exe /T fx_2_0 /Fo <output.fxb> <input.fx>
```

| Flag | Purpose |
|------|---------|
| `/T fx_2_0` | Target profile — Effect framework 2.0 (required for XNA/FNA compatibility) |
| `/Fo <path>` | Output file path |
| `/Od` | Disable optimizations (for debugging) |
| `/Zi` | Include debug information |
| `/Vn <name>` | Set variable name for the compiled blob |
| `/nologo` | Suppress copyright banner |

### Profile: Always Use `fx_2_0`

FNA's MojoShader expects Effect framework 2.0 binaries. Do not use `fx_4_0`, `fx_5_0`, or individual shader profiles (`vs_3_0`, `ps_3_0`) — those are for standalone shaders, not the Effect framework that FNA's `Effect` class expects.

```bash
# CORRECT: Effect framework profile
fxc.exe /T fx_2_0 /Fo MyShader.fxb MyShader.fx

# WRONG: Individual shader profile (not an Effect)
fxc.exe /T vs_3_0 /Fo MyShader.fxb MyShader.fx
```

---

## MSBuild Integration

Automate shader compilation as part of `dotnet build` using a custom MSBuild targets file. This is the approach used by the FNA-Template project.

### `build/BuildShaders.targets`

```xml
<Project>
  <!-- Detect platform for fxc.exe invocation -->
  <PropertyGroup>
    <FxcPath Condition="'$(OS)' == 'Windows_NT'">$(MSBuildThisFileDirectory)tools\fxc.exe</FxcPath>
    <FxcPath Condition="'$(OS)' != 'Windows_NT'">wine $(MSBuildThisFileDirectory)tools/fxc.exe</FxcPath>
    <ShaderOutputDir>$(OutputPath)Effects</ShaderOutputDir>
  </PropertyGroup>

  <!-- Collect all .fx files marked as "CompileShader" -->
  <ItemGroup>
    <CompileShader Include="Effects\**\*.fx" />
  </ItemGroup>

  <!-- Build target: compile each .fx to .fxb -->
  <Target Name="BuildShaders"
          BeforeTargets="Build"
          Inputs="@(CompileShader)"
          Outputs="@(CompileShader -> '$(ShaderOutputDir)\%(Filename).fxb')">

    <MakeDir Directories="$(ShaderOutputDir)" />

    <Exec Command="$(FxcPath) /T fx_2_0 /Fo &quot;$(ShaderOutputDir)\%(CompileShader.Filename).fxb&quot; &quot;%(CompileShader.FullPath)&quot;"
          WorkingDirectory="$(MSBuildProjectDirectory)" />
  </Target>

  <!-- Copy .fxb files to output on build -->
  <Target Name="CopyShaders" AfterTargets="BuildShaders">
    <ItemGroup>
      <BuiltShaders Include="$(ShaderOutputDir)\*.fxb" />
    </ItemGroup>
    <Copy SourceFiles="@(BuiltShaders)" DestinationFolder="$(OutputPath)Effects" SkipUnchangedFiles="true" />
  </Target>
</Project>
```

### Include in Your `.csproj`

```xml
<Project Sdk="Microsoft.NET.Sdk">
  <Import Project="build/BuildShaders.targets" />

  <!-- ... rest of project ... -->
</Project>
```

Now every `dotnet build` automatically recompiles changed `.fx` files.

---

## Loading Shaders at Runtime

FNA loads compiled `.fxb` files as raw byte arrays — no content pipeline involved:

```csharp
public class Game1 : Game
{
    private Effect _myShader;

    protected override void LoadContent()
    {
        // Load the compiled effect binary directly
        byte[] shaderBytes = File.ReadAllBytes("Effects/MyShader.fxb");
        _myShader = new Effect(GraphicsDevice, shaderBytes);
    }

    protected override void Draw(GameTime gameTime)
    {
        GraphicsDevice.Clear(Color.CornflowerBlue);

        // Apply the effect
        _myShader.Parameters["WorldViewProjection"].SetValue(camera.ViewProjection);
        _myShader.CurrentTechnique.Passes[0].Apply();

        // Draw geometry...

        base.Draw(gameTime);
    }
}
```

### Content Pipeline Alternative

If you prefer `.xnb` packaging (for consistency with other content), you can compile shaders with the MonoGame Content Builder (MGCB) using the **DesktopGL** profile, then load via `Content.Load<Effect>("ShaderName")`. However, this mixes toolchains — most FNA projects use raw `.fxb` files.

---

## Writing FNA-Compatible Shaders

### Basic Sprite Effect

```hlsl
// SpriteEffect.fx — Basic 2D sprite rendering
// Compatible with SpriteBatch custom effect usage

float4x4 MatrixTransform;
sampler TextureSampler : register(s0);

struct VSInput
{
    float4 Position : POSITION0;
    float4 Color    : COLOR0;
    float2 TexCoord : TEXCOORD0;
};

struct VSOutput
{
    float4 Position : POSITION0;
    float4 Color    : COLOR0;
    float2 TexCoord : TEXCOORD0;
};

VSOutput VS(VSInput input)
{
    VSOutput output;
    output.Position = mul(input.Position, MatrixTransform);
    output.Color = input.Color;
    output.TexCoord = input.TexCoord;
    return output;
}

float4 PS(VSOutput input) : COLOR0
{
    float4 texColor = tex2D(TextureSampler, input.TexCoord);
    return texColor * input.Color;
}

technique SpriteBatch
{
    pass P0
    {
        VertexShader = compile vs_2_0 VS();
        PixelShader = compile ps_2_0 PS();
    }
}
```

### Using with SpriteBatch

```csharp
// Load the custom effect
Effect spriteEffect = new Effect(GraphicsDevice,
    File.ReadAllBytes("Effects/SpriteEffect.fxb"));

// Set the transform matrix
Viewport vp = GraphicsDevice.Viewport;
Matrix projection = Matrix.CreateOrthographicOffCenter(0, vp.Width, vp.Height, 0, 0, 1);
spriteEffect.Parameters["MatrixTransform"].SetValue(projection);

// Draw with SpriteBatch using the custom effect
spriteBatch.Begin(effect: spriteEffect);
spriteBatch.Draw(texture, position, Color.White);
spriteBatch.End();
```

---

## Shader Model Limitations

FNA's MojoShader supports Shader Model 2.0 and 3.0. This means:

| Feature | SM 2.0 | SM 3.0 |
|---------|--------|--------|
| Instruction limit | 64 ALU + 32 tex (PS) | 512+ (PS) |
| Texture samples | 16 | 16 |
| Flow control | Static only | Dynamic branching |
| Vertex texture fetch | No | Yes |
| `ddx`/`ddy` derivatives | No | Yes |

For most 2D games, SM 2.0 (`vs_2_0` / `ps_2_0`) is sufficient. Use SM 3.0 (`vs_3_0` / `ps_3_0`) for more complex post-processing or 3D rendering.

```hlsl
// SM 2.0 — simple, widely compatible
VertexShader = compile vs_2_0 VS();
PixelShader = compile ps_2_0 PS();

// SM 3.0 — more instructions, dynamic branching
VertexShader = compile vs_3_0 VS();
PixelShader = compile ps_3_0 PS();
```

---

## Differences from MonoGame Shaders

| Aspect | FNA | MonoGame |
|--------|-----|----------|
| Compiler | `fxc.exe` (DirectX SDK) | MGFX (custom tool in MGCB) |
| Output format | DXBC (`.fxb`) | MGFX (`.mgfx` inside `.xnb`) |
| Runtime parser | MojoShader | Platform-specific (HLSL/GLSL/Metal) |
| Shader language | HLSL (SM 2.0/3.0) | HLSL (varies by platform) |
| Cross-platform | One binary, all platforms | Per-platform compilation |
| Compile on Linux/macOS | Wine + fxc.exe | MGCB runs natively |

**Porting tip:** If converting a MonoGame project to FNA, you must recompile all shaders from `.fx` source using FXC. The `.xnb` / `.mgfx` files produced by MonoGame's pipeline will not load in FNA.

---

## Troubleshooting

### "Effect format is not supported"

The `.fxb` file was compiled with the wrong profile. Ensure you used `/T fx_2_0`, not a standalone shader profile.

### "wine: command not found" on CI

Install Wine in your CI environment or compile shaders on a Windows build agent. GitHub Actions example:

```yaml
- name: Install Wine
  run: |
    sudo dpkg --add-architecture i386
    sudo apt update
    sudo apt install -y wine64 wine32
    winetricks d3dcompiler_43

- name: Build Shaders
  run: dotnet build  # BuildShaders.targets handles the rest
```

### Shader compiles but renders incorrectly

MojoShader translates DXBC to the target API. Some HLSL patterns translate differently:

- Avoid `clip()` in SM 2.0 pixel shaders — use `if` and discard manually
- Matrix multiplication order may differ: use `mul(vector, matrix)` consistently
- Half-pixel offset is not needed in FNA (FNA3D handles this, unlike raw XNA on D3D9)
