# G3 — SFML 3 Shaders & Custom Rendering

> **Category:** guide · **Engine:** SFML · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Game Architecture Patterns](G2_game_architecture_patterns.md) · [SFML 3 API Changes](../reference/R1_sfml3_api_changes.md)

SFML 3 uses OpenGL under the hood and exposes GLSL shaders through `sf::Shader`. This guide covers loading and applying shaders, passing uniforms, writing common post-processing effects, and using `sf::RenderTexture` for multi-pass rendering.

---

## How Shaders Work in SFML

SFML integrates shaders into its existing drawing pipeline. You don't manage OpenGL state directly — instead, you pass a shader as part of `sf::RenderStates` when drawing any `sf::Drawable`. SFML handles binding, uniform uploads, and cleanup.

SFML supports three shader stages:

| Stage | GLSL Version | Purpose |
|-------|-------------|---------|
| **Vertex** | `#version 130` | Transform vertex positions and pass data to fragment stage |
| **Geometry** | `#version 150` | Generate or modify primitives (optional, check availability) |
| **Fragment** | `#version 130` | Calculate pixel colors — where most effects happen |

Check geometry shader support at runtime:

```cpp
if (!sf::Shader::isGeometryAvailable())
    // Fall back to vertex + fragment only
```

---

## Loading Shaders

### From Files

```cpp
// Fragment shader only (most common for 2D effects)
auto shader = sf::Shader::loadFromFile("blur.frag", sf::Shader::Type::Fragment);

// Vertex + fragment
auto shader = sf::Shader::loadFromFile("vert.glsl", "frag.glsl");

// All three stages
auto shader = sf::Shader::loadFromFile("vert.glsl", "geom.glsl", "frag.glsl");
```

SFML 3 returns `std::optional<sf::Shader>` from loading functions — check before use:

```cpp
auto shader = sf::Shader::loadFromFile("effect.frag", sf::Shader::Type::Fragment);
if (!shader) {
    // Handle error — file not found or GLSL compile error
    return;
}
// Use *shader or shader->setUniform(...)
```

### From Strings (In-Memory)

```cpp
const std::string fragmentSource = R"glsl(
    #version 130
    uniform sampler2D texture;
    uniform float brightness;

    void main() {
        vec4 color = texture2D(texture, gl_TexCoord[0].xy);
        gl_FragColor = color * brightness;
    }
)glsl";

auto shader = sf::Shader::loadFromMemory(fragmentSource,
                                          sf::Shader::Type::Fragment);
```

### From Streams

```cpp
sf::FileInputStream stream;
if (stream.open("effect.frag")) {
    auto shader = sf::Shader::loadFromStream(stream,
                                              sf::Shader::Type::Fragment);
}
```

---

## Setting Uniforms

Uniforms are the bridge between your C++ game logic and GLSL code. SFML provides `setUniform` overloads for all common types.

### Supported Types

```cpp
// Scalars
shader->setUniform("time", 3.14f);               // float → uniform float
shader->setUniform("enabled", true);              // bool  → uniform bool
shader->setUniform("count", 5);                   // int   → uniform int

// Vectors (use sf::Glsl types)
shader->setUniform("offset", sf::Glsl::Vec2{1.0f, 0.5f});
shader->setUniform("lightPos", sf::Glsl::Vec3{100.f, 200.f, 0.f});
shader->setUniform("tint", sf::Glsl::Vec4{1.f, 0.5f, 0.f, 1.f});

// Colors map to vec4 automatically
shader->setUniform("color", sf::Glsl::Ivec4(sf::Color::Red));

// Matrices
shader->setUniform("transform", sf::Glsl::Mat3{/* ... */});
shader->setUniform("projection", sf::Glsl::Mat4{/* ... */});

// Textures
shader->setUniform("noiseMap", someTexture);

// Current texture of the drawable being rendered
shader->setUniform("texture", sf::Shader::CurrentTexture);
```

### The CurrentTexture Special Value

When drawing a sprite or shape with a shader, the object already has a texture bound. Use `sf::Shader::CurrentTexture` to reference it in your GLSL code without passing it explicitly:

```cpp
shader->setUniform("texture", sf::Shader::CurrentTexture);
```

In your GLSL:
```glsl
uniform sampler2D texture;
// texture2D(texture, coords) samples the sprite's own texture
```

---

## Applying Shaders to Drawables

Pass the shader via `sf::RenderStates`:

```cpp
sf::Sprite sprite(texture);

// Method 1: RenderStates with shader pointer
sf::RenderStates states;
states.shader = &(*shader);  // pointer to the shader
window.draw(sprite, states);

// Method 2: Shorthand — just pass the shader reference
window.draw(sprite, &(*shader));
```

---

## Example: Flash-White Hit Effect

A common 2D game pattern — flash a sprite white when it takes damage:

```glsl
// hit_flash.frag
#version 130

uniform sampler2D texture;
uniform float flashAmount;  // 0.0 = normal, 1.0 = full white

void main() {
    vec4 color = texture2D(texture, gl_TexCoord[0].xy);
    // Lerp toward white based on flash amount, preserve alpha
    vec3 white = vec3(1.0, 1.0, 1.0);
    color.rgb = mix(color.rgb, white, flashAmount);
    gl_FragColor = color * gl_Color;
}
```

```cpp
// In your game code
float flash_timer = 0.0f;

void on_hit() { flash_timer = 0.15f; }

void update(float dt) {
    flash_timer = std::max(0.0f, flash_timer - dt);
    shader->setUniform("flashAmount", flash_timer / 0.15f);
}

void draw(sf::RenderWindow& window) {
    window.draw(enemy_sprite, &(*shader));
}
```

---

## Post-Processing with RenderTexture

For full-screen effects (blur, CRT scanlines, vignette), draw your scene to a `sf::RenderTexture`, then draw that texture to the window with a shader applied.

### Setup

```cpp
// Create a render texture matching the window size
auto renderTex = sf::RenderTexture::create({800, 600});
if (!renderTex) return;  // SFML 3 returns std::optional
```

### Render Loop

```cpp
// 1. Draw your scene to the render texture
renderTex->clear();
renderTex->draw(background);
renderTex->draw(player);
renderTex->draw(enemies);
renderTex->display();

// 2. Draw the render texture to the window WITH a post-process shader
sf::Sprite screen(renderTex->getTexture());
postShader->setUniform("texture", sf::Shader::CurrentTexture);
postShader->setUniform("resolution", sf::Glsl::Vec2{800.f, 600.f});

window.clear();
window.draw(screen, &(*postShader));
window.display();
```

---

## Example: CRT Scanline Effect

```glsl
// crt.frag
#version 130

uniform sampler2D texture;
uniform vec2 resolution;
uniform float time;

void main() {
    vec2 uv = gl_TexCoord[0].xy;
    vec4 color = texture2D(texture, uv);

    // Scanlines: darken every other row
    float scanline = sin(uv.y * resolution.y * 3.14159) * 0.5 + 0.5;
    scanline = pow(scanline, 1.5) * 0.15 + 0.85;
    color.rgb *= scanline;

    // Slight RGB shift for CRT color fringing
    float shift = 0.002;
    color.r = texture2D(texture, uv + vec2(shift, 0.0)).r;
    color.b = texture2D(texture, uv - vec2(shift, 0.0)).b;

    // Vignette: darken edges
    vec2 center = uv - 0.5;
    float vignette = 1.0 - dot(center, center) * 1.5;
    color.rgb *= clamp(vignette, 0.0, 1.0);

    gl_FragColor = color;
}
```

```cpp
postShader->setUniform("resolution", sf::Glsl::Vec2{800.f, 600.f});
postShader->setUniform("time", clock.getElapsedTime().asSeconds());
```

---

## Multi-Pass Rendering

Chain multiple effects by ping-ponging between two render textures:

```cpp
auto bufferA = sf::RenderTexture::create({800, 600});
auto bufferB = sf::RenderTexture::create({800, 600});

// Pass 1: Scene → bufferA (horizontal blur)
bufferA->clear();
bufferA->draw(sceneSprite);
bufferA->display();

hBlurShader->setUniform("texture", sf::Shader::CurrentTexture);
hBlurShader->setUniform("direction", sf::Glsl::Vec2{1.f, 0.f});

sf::Sprite passA(bufferA->getTexture());
bufferB->clear();
bufferB->draw(passA, &(*hBlurShader));
bufferB->display();

// Pass 2: bufferB → window (vertical blur)
vBlurShader->setUniform("texture", sf::Shader::CurrentTexture);
vBlurShader->setUniform("direction", sf::Glsl::Vec2{0.f, 1.f});

sf::Sprite passB(bufferB->getTexture());
window.draw(passB, &(*vBlurShader));
```

---

## Custom Vertex Shaders

Vertex shaders transform positions. SFML provides built-in attributes — match these names exactly:

```glsl
// wave.vert
#version 130

uniform float time;
uniform float amplitude;

void main() {
    // Start with the standard SFML vertex transform
    vec4 vertex = gl_ModelViewProjectionMatrix * gl_Vertex;

    // Apply wave distortion
    vertex.y += sin(vertex.x * 0.05 + time * 3.0) * amplitude;

    gl_Position = vertex;
    gl_TexCoord[0] = gl_TextureMatrix[0] * gl_MultiTexCoord0;
    gl_FrontColor = gl_Color;
}
```

The three lines at the end (`gl_Position`, `gl_TexCoord[0]`, `gl_FrontColor`) are essential — omitting them breaks texture mapping or vertex colors.

---

## Performance Notes

**Shader switches are expensive.** Batch drawables that share the same shader. Draw all "normal" sprites first, then all "glow" sprites, etc.

**RenderTexture has GPU cost.** Each `create()` allocates a framebuffer. Don't create them per-frame — create once and reuse.

**Uniform uploads are cheap** but not free. Cache values on the C++ side and only call `setUniform` when they change, especially for per-frame uniforms that rarely change (like resolution).

**Check shader availability** on target hardware. Integrated GPUs on older laptops may not support geometry shaders or certain GLSL versions. Always have a non-shader fallback for critical rendering.
