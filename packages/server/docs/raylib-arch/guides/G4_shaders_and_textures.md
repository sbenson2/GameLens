# G4 — Raylib Shaders and Textures

> **Category:** guide · **Engine:** Raylib · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Getting Started](G1_getting_started.md) · [3D Basics](G3_3d_basics.md)

This guide covers raylib's shader and texture pipeline: loading GLSL shaders, setting uniforms, render-to-texture with `RenderTexture2D`, and common post-processing patterns. All examples use C with raylib 5.x.

---

## Texture Fundamentals

Raylib wraps OpenGL textures in a simple `Texture2D` struct. Loading, drawing, and unloading follow the same pattern as every other raylib resource.

### Loading and Drawing Textures

```c
// Load from file — supports PNG, BMP, TGA, JPG, GIF, HDR, PSD, PIC
Texture2D texture = LoadTexture("resources/player.png");

// Draw at position with white tint (no color modulation)
DrawTexture(texture, 100, 100, WHITE);

// Draw with more control: source rect, dest rect, origin, rotation, tint
Rectangle source = { 0, 0, texture.width, texture.height };
Rectangle dest   = { 200, 200, texture.width * 2, texture.height * 2 };
Vector2 origin   = { 0, 0 };
DrawTexturePro(texture, source, dest, origin, 0.0f, WHITE);

// Always unload when done
UnloadTexture(texture);
```

### Texture Filtering and Wrapping

```c
// Set texture scaling filter (affects how it looks when scaled)
// TEXTURE_FILTER_POINT  — pixel-perfect, no smoothing (good for pixel art)
// TEXTURE_FILTER_BILINEAR — smooth scaling
SetTextureFilter(texture, TEXTURE_FILTER_POINT);

// Set texture wrapping mode (what happens outside UV 0–1 range)
// TEXTURE_WRAP_REPEAT, TEXTURE_WRAP_CLAMP, TEXTURE_WRAP_MIRROR_REPEAT
SetTextureWrap(texture, TEXTURE_WRAP_REPEAT);
```

### Generating Textures from Images in Memory

```c
// Create a checked pattern programmatically
Image checked = GenImageChecked(256, 256, 32, 32, RED, GREEN);
Texture2D tex_checked = LoadTextureFromImage(checked);
UnloadImage(checked); // CPU image data no longer needed after GPU upload
```

---

## Shader Basics

Raylib uses GLSL shaders. The workflow is: load shader → get uniform locations → set uniforms → draw with `BeginShaderMode`/`EndShaderMode`.

### Loading a Shader

```c
// Load vertex + fragment shader from files
Shader shader = LoadShader("resources/vertex.vs", "resources/fragment.fs");

// Pass 0 (NULL) for vertex shader to use raylib's built-in default vertex shader.
// This is the most common case — you usually only need a custom fragment shader.
Shader postfx = LoadShader(0, "resources/postprocess.fs");

// Load shader from in-memory strings (useful for generated/embedded shaders)
Shader embedded = LoadShaderFromMemory(vertexCode, fragmentCode);
```

### GLSL Version Notes

Raylib targets OpenGL 3.3 (desktop) and OpenGL ES 2.0 (mobile/web). Your shaders need the right version header:

```glsl
// Desktop (OpenGL 3.3)
#version 330

// Mobile / Web (OpenGL ES 2.0)
#version 100
precision mediump float;
```

Raylib provides built-in uniforms automatically. In your fragment shader you can access:

```glsl
// Automatically provided by raylib's default vertex shader:
in vec2 fragTexCoord;   // UV coordinates
in vec4 fragColor;      // Vertex color

// Automatically bound by raylib:
uniform sampler2D texture0;  // The current texture
uniform vec4 colDiffuse;     // The tint color passed to Draw functions
```

---

## Setting Shader Uniforms

After loading a shader, query uniform locations by name, then set values before or during drawing.

### Getting Locations and Setting Values

```c
Shader shader = LoadShader(0, "resources/custom.fs");

// Cache the location once — GetShaderLocation returns -1 if not found
int timeLoc = GetShaderLocation(shader, "uTime");
int resLoc  = GetShaderLocation(shader, "uResolution");
int colorLoc = GetShaderLocation(shader, "uTint");

// Set a float uniform
float time = 0.0f;
SetShaderValue(shader, timeLoc, &time, SHADER_UNIFORM_FLOAT);

// Set a vec2 uniform
float resolution[2] = { (float)GetScreenWidth(), (float)GetScreenHeight() };
SetShaderValue(shader, resLoc, resolution, SHADER_UNIFORM_VEC2);

// Set a vec4 uniform (e.g., a color)
float tint[4] = { 1.0f, 0.5f, 0.0f, 1.0f };
SetShaderValue(shader, colorLoc, tint, SHADER_UNIFORM_VEC4);
```

### Uniform Type Tags

| Tag | GLSL Type | C Type |
|-----|-----------|--------|
| `SHADER_UNIFORM_FLOAT` | `float` | `float` |
| `SHADER_UNIFORM_VEC2` | `vec2` | `float[2]` |
| `SHADER_UNIFORM_VEC3` | `vec3` | `float[3]` |
| `SHADER_UNIFORM_VEC4` | `vec4` | `float[4]` |
| `SHADER_UNIFORM_INT` | `int` | `int` |
| `SHADER_UNIFORM_SAMPLER2D` | `sampler2D` | `int` (texture slot) |

### Binding Additional Textures

```c
// Bind a second texture to a shader sampler
int mapLoc = GetShaderLocation(shader, "texture1");
int slot = 1; // texture slot 1 (texture0 is auto-bound by raylib)
SetShaderValueTexture(shader, mapLoc, noiseTexture);
```

---

## Drawing with Shaders

Wrap any draw calls between `BeginShaderMode()` and `EndShaderMode()` to apply the shader.

### Applying a Shader to a Sprite

```c
BeginDrawing();
    ClearBackground(BLACK);

    // This sprite is drawn with the custom shader active
    BeginShaderMode(shader);
        DrawTexture(playerTexture, 100, 100, WHITE);
    EndShaderMode();

    // This sprite uses the default shader (no custom processing)
    DrawTexture(backgroundTexture, 0, 0, WHITE);
EndDrawing();
```

### Applying a Shader to Shapes

By default, shapes (rectangles, circles) have no texture. Use `SetShapesTexture()` to assign one, then shaders can sample from it:

```c
// Give shapes a 1×1 white texture so shaders have something to sample
Texture2D whiteTex = LoadTexture("resources/white_1x1.png");
SetShapesTexture(whiteTex, (Rectangle){ 0, 0, 1, 1 });

BeginShaderMode(shader);
    DrawRectangle(0, 0, screenWidth, screenHeight, WHITE);
EndShaderMode();
```

---

## Render Textures (Render-to-Texture)

`RenderTexture2D` lets you draw to an off-screen framebuffer. This is the foundation for post-processing, minimaps, split-screen, and multi-pass rendering.

### Basic Render Texture Usage

```c
// Create a render texture the same size as the screen
RenderTexture2D target = LoadRenderTexture(screenWidth, screenHeight);

// --- In the game loop ---

// Step 1: Draw your scene to the render texture
BeginTextureMode(target);
    ClearBackground(RAYWHITE);
    DrawTexture(worldTexture, 0, 0, WHITE);
    DrawCircle(player.x, player.y, 20, RED);
EndTextureMode();

// Step 2: Draw the render texture to the screen (optionally with a shader)
BeginDrawing();
    ClearBackground(BLACK);
    BeginShaderMode(postfxShader);
        // NOTE: Render textures in OpenGL are vertically flipped.
        // Negate the height in the source rectangle to flip it back.
        DrawTextureRec(
            target.texture,
            (Rectangle){ 0, 0, screenWidth, -screenHeight },
            (Vector2){ 0, 0 },
            WHITE
        );
    EndShaderMode();
EndDrawing();

// --- Cleanup ---
UnloadRenderTexture(target);
```

### Why Flip the Texture?

OpenGL framebuffer textures store pixels bottom-to-top, but raylib draws top-to-bottom. Passing a negative height in the source `Rectangle` flips the image without any extra shader code.

---

## Post-Processing Pipeline Pattern

A common game pattern: render the entire scene to a `RenderTexture2D`, then draw that texture to the screen through one or more post-processing shaders.

### Example: CRT Scanline Effect

**Fragment shader** (`crt.fs`):
```glsl
#version 330
in vec2 fragTexCoord;
out vec4 finalColor;

uniform sampler2D texture0;
uniform float uTime;

void main() {
    vec4 color = texture(texture0, fragTexCoord);

    // Darken every other scanline
    float scanline = sin(fragTexCoord.y * 800.0) * 0.04;
    color.rgb -= scanline;

    // Subtle RGB offset for chromatic aberration
    float offset = 0.002;
    color.r = texture(texture0, fragTexCoord + vec2(offset, 0.0)).r;
    color.b = texture(texture0, fragTexCoord - vec2(offset, 0.0)).b;

    // Vignette — darken edges
    vec2 uv = fragTexCoord * (1.0 - fragTexCoord);
    float vignette = uv.x * uv.y * 15.0;
    vignette = clamp(pow(vignette, 0.25), 0.0, 1.0);
    color.rgb *= vignette;

    finalColor = color;
}
```

**C code:**
```c
Shader crtShader = LoadShader(0, "resources/crt.fs");
int timeLoc = GetShaderLocation(crtShader, "uTime");
RenderTexture2D target = LoadRenderTexture(screenWidth, screenHeight);

while (!WindowShouldClose()) {
    float time = (float)GetTime();
    SetShaderValue(crtShader, timeLoc, &time, SHADER_UNIFORM_FLOAT);

    // Render scene to off-screen target
    BeginTextureMode(target);
        ClearBackground(BLACK);
        // ... draw your game here ...
    EndTextureMode();

    // Apply CRT effect and draw to screen
    BeginDrawing();
        BeginShaderMode(crtShader);
            DrawTextureRec(target.texture,
                (Rectangle){ 0, 0, screenWidth, -screenHeight },
                (Vector2){ 0, 0 }, WHITE);
        EndShaderMode();
    EndDrawing();
}
```

---

## Multi-Pass Rendering

Chain multiple shaders by ping-ponging between two `RenderTexture2D` targets:

```c
RenderTexture2D pass_a = LoadRenderTexture(screenWidth, screenHeight);
RenderTexture2D pass_b = LoadRenderTexture(screenWidth, screenHeight);

// Pass 1: Scene → pass_a
BeginTextureMode(pass_a);
    ClearBackground(BLACK);
    // ... draw your game scene ...
EndTextureMode();

// Pass 2: pass_a → blur shader → pass_b
BeginTextureMode(pass_b);
    BeginShaderMode(blurShader);
        DrawTextureRec(pass_a.texture,
            (Rectangle){ 0, 0, screenWidth, -screenHeight },
            (Vector2){ 0, 0 }, WHITE);
    EndShaderMode();
EndTextureMode();

// Pass 3: pass_b → color grading shader → screen
BeginDrawing();
    BeginShaderMode(colorGradeShader);
        DrawTextureRec(pass_b.texture,
            (Rectangle){ 0, 0, screenWidth, -screenHeight },
            (Vector2){ 0, 0 }, WHITE);
    EndShaderMode();
EndDrawing();
```

---

## Common Pitfalls

1. **Forgetting to flip render textures** — Always negate height in the source rect when drawing a `RenderTexture2D`. Without this, your scene appears upside down.

2. **Not caching uniform locations** — `GetShaderLocation()` does a string lookup. Call it once at load time, store the `int`, and reuse it every frame.

3. **Wrong GLSL version** — Desktop raylib uses `#version 330`. If you target web (Emscripten), use `#version 100` with `precision mediump float;`.

4. **Unloading textures that shaders reference** — Unload shaders before the textures they sample, or you get GPU-side dangling references.

5. **SetShaderValue before BeginShaderMode** — You can set uniforms at any time after loading the shader. They persist until changed. Calling `SetShaderValue` inside `BeginShaderMode`/`EndShaderMode` works but is not required.
