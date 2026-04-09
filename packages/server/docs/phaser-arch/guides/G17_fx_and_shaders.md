# G17 — Phaser 3 Built-in FX & Custom Shader Pipelines

> **Category:** guide · **Engine:** Phaser · **Related:** [G11 Particles and VFX](G11_particles_and_vfx.md) · [G10 Camera Systems](G10_camera_systems.md) · [G4 Sprites and Animation](G4_sprites_and_animation.md)

---

## Overview

Phaser 3.60+ introduced a comprehensive **built-in FX system** that lets you add glow, bloom, blur, shadow, and more to any game object or camera — no shader code required. For advanced use cases, you can also write **custom PostFX pipelines** with raw GLSL fragment shaders.

All FX are **WebGL only**. They silently do nothing in Canvas mode. Always test with `game.renderer.type === Phaser.WEBGL` if you need to provide fallbacks.

This guide covers the built-in FX API (preFX/postFX), every available effect, camera-level FX, and writing custom PostFX pipelines.

---

## Pre FX vs Post FX

Phaser has two FX application points:

| | Pre FX | Post FX |
|---|--------|---------|
| **Render target size** | Texture-sized (based on the game object) | Full renderer size |
| **Performance** | Cheaper — smaller framebuffer | More expensive — full-screen buffer |
| **Supported on** | Texture-based objects: Image, Sprite, TileSprite, Text, RenderTexture, Video | All game objects + Camera |
| **Access** | `gameObject.preFX` | `gameObject.postFX` |

**Rule of thumb:** Use preFX for per-object effects (a glowing sword). Use postFX for full-screen or camera-wide effects (screen-shake bloom, vignette).

---

## Built-in Effects

All built-in effects are available through `preFX.add*()` and `postFX.add*()` methods. Here is the full list:

### Glow

Adds an outer/inner glow around the game object's edges.

```typescript
// Add a blue glow to a sprite
const glowFx = sprite.preFX.addGlow(
  0x0088ff,  // color
  4,         // outerStrength (default: 4)
  0,         // innerStrength (default: 0)
  false,     // knockout — if true, only the glow is visible, not the object
  0.1        // quality — lower = faster but grainier (default: 0.1)
);

// Animate glow intensity with a tween
this.tweens.add({
  targets: glowFx,
  outerStrength: 8,
  yoyo: true,
  loop: -1,
  duration: 800,
  ease: 'Sine.easeInOut',
});
```

### Bloom

Applies a bloom/HDR-like bright bleed effect.

```typescript
const bloomFx = sprite.postFX.addBloom(
  0xffffff,  // color (white = neutral)
  1,         // offsetX
  1,         // offsetY
  1,         // blurStrength
  1.2,       // strength
  4          // steps — more steps = smoother but slower
);
```

### Shadow

Adds a drop shadow behind the object.

```typescript
const shadowFx = sprite.preFX.addShadow(
  2,         // x offset
  2,         // y offset
  0.06,      // decay (how quickly shadow fades)
  1,         // power (shadow intensity)
  0x000000,  // color
  4,         // samples — more = smoother
  1          // intensity
);
```

### Blur

Gaussian blur effect.

```typescript
const blurFx = sprite.postFX.addBlur(
  1,    // quality (0=low, 1=medium, 2=high)
  2,    // x strength
  2,    // y strength
  1,    // steps
  0xffffff,  // color
  4     // samples
);
```

### Other Built-in Effects

```typescript
// Pixelate — retro/damage effect
const pixelateFx = sprite.preFX.addPixelate(8); // pixel size

// Vignette — darken edges
const vignetteFx = camera.postFX.addVignette(
  0.5, 0.5,  // x, y center
  0.3,       // radius
  0.8        // strength
);

// Shine — sweeping highlight
const shineFx = sprite.preFX.addShine(
  0.5,   // speed
  0.2,   // lineWidth
  0.5,   // gradient
  false  // reveal — if true, object is hidden except where shine passes
);

// Barrel distortion — fisheye effect
const barrelFx = sprite.preFX.addBarrel(1.2); // amount (1 = no distortion)

// Bokeh / tilt-shift depth-of-field
const bokehFx = sprite.postFX.addBokeh(
  0.5,  // radius
  10,   // amount
  1     // contrast
);

// Circle mask
const circleFx = sprite.preFX.addCircle(
  0.5,       // thickness
  0x000000,  // color of the ring
  0x000000,  // backgroundColor
  1.0,       // scale
  1.0        // feather
);

// Color matrix — hue shift, saturation, grayscale, etc.
const colorFx = sprite.preFX.addColorMatrix();
colorFx.grayscale(0.5);   // partial desaturation
colorFx.hue(45);          // rotate hue by 45 degrees

// Displacement — warp using a displacement map texture
const displaceFx = sprite.preFX.addDisplacement('distort-map', 10, 10);

// Gradient — overlay a two-color gradient
const gradientFx = sprite.preFX.addGradient(
  0xff0000,  // color1
  0x0000ff,  // color2
  0.2,       // alpha
  0, 0,      // fromX, fromY
  0, 1       // toX, toY — top to bottom
);

// Wipe / reveal transition
const wipeFx = sprite.preFX.addWipe(0.1, 0, 0); // wipeWidth, direction, axis
```

---

## Managing FX at Runtime

### Toggling Effects

```typescript
// Disable without removing (preserves settings)
glowFx.setActive(false);

// Re-enable
glowFx.setActive(true);

// Remove a specific effect
sprite.preFX.remove(glowFx);

// Remove ALL preFX from an object
sprite.preFX.clear();
```

### Stacking Multiple Effects

You can add multiple effects to the same object. They apply in the order they were added:

```typescript
// Shadow first, then glow on top
sprite.preFX.addShadow(2, 2, 0.06, 1, 0x000000, 4, 1);
sprite.preFX.addGlow(0x00ff00, 4, 0);
```

### Animating FX Properties

All FX properties are tween-able:

```typescript
// Pulse pixelation for a "damage taken" effect
const pixelFx = sprite.preFX.addPixelate(-1); // -1 = disabled amount
this.tweens.add({
  targets: pixelFx,
  amount: 12,
  duration: 100,
  yoyo: true,
  onComplete: () => sprite.preFX.remove(pixelFx),
});
```

---

## Camera-Level FX

Camera FX apply to **everything the camera renders** — ideal for screen-wide effects like underwater blur, damage vignette, or scene transitions.

```typescript
// Vignette on the main camera
const cam = this.cameras.main;
cam.postFX.addVignette(0.5, 0.5, 0.3, 0.9);

// Fade-to-grayscale on game over
const colorMatrix = cam.postFX.addColorMatrix();
this.tweens.add({
  targets: colorMatrix,
  alpha: 1,  // not a direct property — see workaround below
  duration: 1000,
});

// Workaround: animate grayscale via a custom value
const grayState = { amount: 0 };
this.tweens.add({
  targets: grayState,
  amount: 1,
  duration: 2000,
  onUpdate: () => {
    colorMatrix.reset();
    colorMatrix.grayscale(grayState.amount, true);
  },
});
```

---

## Custom PostFX Pipelines

For effects not covered by the built-in FX, you can write custom GLSL fragment shaders by extending `PostFXPipeline`.

### Step 1: Write the Fragment Shader

```typescript
// CRT scanline effect — fragment shader as a string
const CRT_FRAG = `
  precision mediump float;

  uniform sampler2D uMainSampler;
  uniform float uTime;
  uniform vec2 uResolution;

  varying vec2 outTexCoord;

  void main() {
    vec2 uv = outTexCoord;

    // Subtle scanlines
    float scanline = sin(uv.y * uResolution.y * 2.0) * 0.04;

    // Slight RGB offset for chromatic aberration
    float offset = 0.002;
    float r = texture2D(uMainSampler, vec2(uv.x + offset, uv.y)).r;
    float g = texture2D(uMainSampler, uv).g;
    float b = texture2D(uMainSampler, vec2(uv.x - offset, uv.y)).b;

    vec3 color = vec3(r, g, b) - scanline;
    gl_FragColor = vec4(color, 1.0);
  }
`;
```

### Step 2: Create the Pipeline Class

```typescript
export class CRTPipeline extends Phaser.Renderer.WebGL.Pipelines.PostFXPipeline {
  constructor(game: Phaser.Game) {
    super({
      game,
      name: 'CRTPipeline',
      fragShader: CRT_FRAG,
    });
  }

  onPreRender(): void {
    // Pass uniforms to the shader
    this.set1f('uTime', this.game.loop.time / 1000);
    this.set2f('uResolution', this.renderer.width, this.renderer.height);
  }
}
```

### Step 3: Register and Apply

```typescript
// In your GameConfig (main.ts):
const config: Phaser.Types.Core.GameConfig = {
  // ...
  pipeline: {
    CRTPipeline,  // Register at boot
  },
};

// In a scene's create():
this.cameras.main.setPostPipeline(CRTPipeline);

// Or apply to a single game object:
sprite.setPostPipeline(CRTPipeline);
```

### Step 4: Remove / Toggle

```typescript
// Remove from camera
this.cameras.main.removePostPipeline(CRTPipeline);

// Get the pipeline instance to modify uniforms at runtime
const pipeline = sprite.getPostPipeline(CRTPipeline) as CRTPipeline;
```

---

## Uniform Types Reference

Use these methods inside `onPreRender()` or `onDraw()` to pass data to your shader:

```typescript
this.set1f('name', floatValue);           // float
this.set2f('name', x, y);                 // vec2
this.set3f('name', x, y, z);             // vec3
this.set4f('name', x, y, z, w);          // vec4
this.set1i('name', intValue);             // int / sampler2D
this.setMatrix4fv('name', false, mat4);   // mat4
```

---

## Performance Guidelines

1. **Prefer preFX over postFX** when both are available — preFX operates on a smaller framebuffer.
2. **Limit blur/bloom steps** — each step is an extra render pass. Use 2–4 steps maximum.
3. **Remove FX when off-screen** — FX on objects outside the camera viewport still cost GPU cycles if not removed or deactivated.
4. **Watch mobile GPUs** — complex fragment shaders with many texture samples can tank frame rates on low-end phones. Test on real devices.
5. **Profile with `game.renderer.textureFlush`** — high values indicate too many texture swaps, often caused by excessive post-processing.

---

## Common Mistakes

1. **Expecting FX to work in Canvas mode** — All FX are WebGL-only and silently no-op in Canvas.
2. **Stacking too many postFX** — Each postFX allocates a full-screen render target. Five postFX on a single object means five extra full-screen buffers.
3. **Forgetting to remove FX on scene shutdown** — FX pipelines can leak if scenes are started/stopped without cleanup. Remove them in `shutdown()` or `destroy()`.
4. **Animating FX on pooled objects** — If a sprite with a glow tween gets recycled, the tween continues running. Kill tweens targeting FX before recycling.
