# Three.js UI & HUD Overlay Patterns for Games

> **Category:** reference · **Engine:** Three.js r160+ · **Related:** [Camera Systems](../guides/G4_camera_systems.md), [Architecture Overview](../architecture/E1_architecture_overview.md)

Three.js has no built-in UI system. Game developers choose between HTML overlays (fastest to build), in-scene 3D UI (world-space labels, billboards), or hybrid approaches. This reference covers each pattern with trade-offs and code.

---

## Strategy Comparison

| Approach | Best for | Pros | Cons |
|----------|----------|------|------|
| HTML/CSS overlay | Menus, HUD, dialogs | Full CSS power, accessibility, text rendering | Cannot occlude 3D, separate DOM layer |
| CSS2DRenderer | World-space labels, nameplates | HTML follows 3D objects, always camera-facing | No depth sorting with scene, extra render pass |
| CSS3DRenderer | Embedded panels in 3D | True perspective transform on HTML | Heavy — transforms every frame, limited interactivity |
| Orthographic scene | Health bars, minimaps | Renders in WebGL, occludes correctly | Must build UI from meshes/sprites, no text reflow |
| troika-three-text | In-world text, SDF labels | GPU-rendered SDF text, sharp at any size | Extra dependency, no layout engine |
| three-mesh-ui | VR/AR menus, 3D panels | Flexbox-like layout in 3D, text rendering | Heavier than troika, VR-oriented |

---

## Pattern 1: HTML/CSS Overlay (Most Common for 2D HUD)

Layer a `<div>` on top of the canvas. The simplest approach for health bars, score displays, inventory, and menus.

```typescript
// HTML structure:
// <div id="game-container" style="position: relative;">
//   <canvas id="game-canvas"></canvas>
//   <div id="hud" style="position: absolute; top: 0; left: 0; pointer-events: none;">
//     <div id="health-bar" style="pointer-events: auto;">...</div>
//     <div id="score">Score: 0</div>
//   </div>
// </div>

// TypeScript — update HUD from game loop
const scoreEl = document.getElementById("score")!;
const healthBar = document.getElementById("health-fill")! as HTMLElement;

function updateHUD(state: { score: number; health: number }) {
  scoreEl.textContent = `Score: ${state.score}`;
  healthBar.style.width = `${state.health}%`;
}

// Call from your animation loop:
function animate() {
  requestAnimationFrame(animate);
  updateHUD(gameState);
  renderer.render(scene, camera);
}
```

**Key rules:**
- Set `pointer-events: none` on the HUD container, then `pointer-events: auto` on interactive elements — this lets clicks pass through to the canvas where needed.
- Avoid frequent DOM reads (e.g., `getBoundingClientRect()`) inside the render loop. Cache element references.
- Use CSS `will-change: transform` on animated HUD elements to promote them to GPU compositing layers.

---

## Pattern 2: CSS2DRenderer (World-Space HTML Labels)

Positions HTML elements to track 3D objects — name plates, damage numbers, item tooltips.

```typescript
import { CSS2DRenderer, CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";

// Setup: create a second renderer layered over the WebGL canvas
const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(window.innerWidth, window.innerHeight);
labelRenderer.domElement.style.position = "absolute";
labelRenderer.domElement.style.top = "0";
labelRenderer.domElement.style.pointerEvents = "none";
document.getElementById("game-container")!.appendChild(labelRenderer.domElement);

// Create a label attached to a 3D object
function createNameplate(name: string, parent: THREE.Object3D): CSS2DObject {
  const div = document.createElement("div");
  div.className = "nameplate";
  div.textContent = name;
  div.style.cssText = `
    color: white;
    font-size: 14px;
    background: rgba(0, 0, 0, 0.6);
    padding: 2px 8px;
    border-radius: 4px;
    white-space: nowrap;
  `;

  const label = new CSS2DObject(div);
  label.position.set(0, 2.0, 0); // offset above the object
  parent.add(label);
  return label;
}

// Render both in the game loop
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);  // must use the same scene + camera
}

// Handle resize for both renderers
window.addEventListener("resize", () => {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  labelRenderer.setSize(w, h);
});
```

**Performance notes:**
- Each `CSS2DObject` triggers a DOM style update every frame. At 100+ labels, this becomes the bottleneck — consider switching to troika-three-text or sprite-based labels beyond ~50 active labels.
- Set `label.visible = false` for off-screen or culled objects to skip DOM updates.
- CSS2DRenderer does **not** participate in depth testing — labels render on top of everything. Use opacity or visibility toggling to fake occlusion.

---

## Pattern 3: Orthographic Scene Overlay (In-WebGL HUD)

Render a second scene with an `OrthographicCamera` on top of the main scene. Useful for minimaps, crosshairs, and HUD elements that need to be part of the WebGL pipeline (e.g., post-processing applies to them).

```typescript
import {
  Scene, OrthographicCamera, SpriteMaterial, Sprite,
  TextureLoader, CanvasTexture
} from "three";

// HUD scene with its own camera
const hudScene = new Scene();
const hudCamera = new OrthographicCamera(
  -window.innerWidth / 2, window.innerWidth / 2,
   window.innerHeight / 2, -window.innerHeight / 2,
  0.1, 100
);
hudCamera.position.z = 10;

// Crosshair sprite
const crosshairTex = new TextureLoader().load("/textures/crosshair.png");
const crosshair = new Sprite(new SpriteMaterial({
  map: crosshairTex,
  depthTest: false,
  transparent: true,
}));
crosshair.scale.set(32, 32, 1);
crosshair.position.set(0, 0, 1); // centered
hudScene.add(crosshair);

// Health bar using a canvas texture (dynamic text/graphics)
function createHealthBar(): Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 32;
  const ctx = canvas.getContext("2d")!;
  const texture = new CanvasTexture(canvas);

  const sprite = new Sprite(new SpriteMaterial({
    map: texture,
    depthTest: false,
    transparent: true,
  }));
  sprite.scale.set(200, 25, 1);
  sprite.position.set(-window.innerWidth / 2 + 120, window.innerHeight / 2 - 30, 1);
  sprite.userData = { canvas, ctx, texture };
  return sprite;
}

function updateHealthBar(sprite: Sprite, health: number) {
  const { ctx, canvas, texture } = sprite.userData;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Background
  ctx.fillStyle = "#333";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Health fill
  ctx.fillStyle = health > 0.3 ? "#4caf50" : "#f44336";
  ctx.fillRect(0, 0, canvas.width * health, canvas.height);
  texture.needsUpdate = true; // signal Three.js to re-upload
}

const healthSprite = createHealthBar();
hudScene.add(healthSprite);

// Render: main scene first, then HUD on top
function animate() {
  requestAnimationFrame(animate);

  renderer.autoClear = true;
  renderer.render(scene, camera);

  renderer.autoClear = false;  // don't clear the color/depth buffer
  renderer.clearDepth();       // clear depth so HUD always renders on top
  renderer.render(hudScene, hudCamera);
}
```

**Performance notes:**
- `CanvasTexture.needsUpdate = true` triggers a texture upload to the GPU. Avoid updating every frame if the value hasn't changed — check before setting.
- Sprites use one draw call each; for many HUD elements, batch them into a single `CanvasTexture`.
- This approach works identically with `WebGPURenderer`.

---

## Pattern 4: troika-three-text (GPU SDF Text)

Best for sharp, dynamic in-world text — damage numbers, dialog, debug overlays. Uses signed distance field rendering on the GPU.

```typescript
import { Text } from "troika-three-text";

const damageText = new Text();
damageText.text = "-42";
damageText.fontSize = 0.5;
damageText.color = 0xff4444;
damageText.anchorX = "center";
damageText.anchorY = "middle";
damageText.outlineWidth = 0.02;
damageText.outlineColor = 0x000000;
damageText.position.set(0, 2, 0);
scene.add(damageText);

// Must call sync() after changing text properties
damageText.sync();

// Animate floating damage number
function animateDamageText(dt: number) {
  damageText.position.y += 1.5 * dt;
  damageText.material.opacity -= 0.8 * dt;
  if (damageText.material.opacity <= 0) {
    scene.remove(damageText);
    damageText.dispose(); // free GPU resources
  }
}
```

**Key characteristics:**
- SDF text stays sharp at any zoom level — no texture resolution limits.
- Supports `font` (any .woff/.ttf URL), `textAlign`, `maxWidth` (word wrapping), `lineHeight`.
- Each Text instance generates its own geometry. For hundreds of labels, consider object pooling.
- troika-three-text works with both `WebGLRenderer` and `WebGPURenderer`.

---

## Pattern 5: Minimap with Viewport / Scissor

Render a top-down view into a corner of the screen using viewport/scissor.

```typescript
import { OrthographicCamera, Vector4 } from "three";

const minimapCamera = new OrthographicCamera(-50, 50, 50, -50, 1, 200);
minimapCamera.position.set(0, 100, 0);
minimapCamera.lookAt(0, 0, 0);
minimapCamera.layers.enableAll(); // or restrict to minimap-relevant layers

const minimapSize = 200; // pixels
const minimapMargin = 10;

function renderMinimap() {
  const x = renderer.domElement.width - minimapSize - minimapMargin;
  const y = renderer.domElement.height - minimapSize - minimapMargin;

  renderer.setViewport(x, y, minimapSize, minimapSize);
  renderer.setScissor(x, y, minimapSize, minimapSize);
  renderer.setScissorTest(true);

  renderer.render(scene, minimapCamera);

  // Restore full viewport
  renderer.setViewport(0, 0, renderer.domElement.width, renderer.domElement.height);
  renderer.setScissorTest(false);
}

// In game loop:
function animate() {
  requestAnimationFrame(animate);
  renderer.autoClear = true;
  renderer.render(scene, camera);       // main view
  renderer.autoClear = false;
  renderMinimap();                       // minimap inset
}
```

**Performance note:** The minimap renders the full scene graph again (minus frustum-culled objects). Use `camera.layers` to exclude high-poly objects from the minimap pass, or render a simplified scene with icons.

---

## Damage Number Pool (Complete Pattern)

A common game UI pattern — pool floating numbers for reuse.

```typescript
import { Sprite, SpriteMaterial, CanvasTexture, Scene } from "three";

interface DamageNumber {
  sprite: Sprite;
  velocity: number;
  lifetime: number;
  active: boolean;
}

class DamageNumberPool {
  private pool: DamageNumber[] = [];

  constructor(private scene: Scene, poolSize = 20) {
    for (let i = 0; i < poolSize; i++) {
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 64;
      const texture = new CanvasTexture(canvas);
      const material = new SpriteMaterial({ map: texture, transparent: true, depthTest: false });
      const sprite = new Sprite(material);
      sprite.visible = false;
      sprite.scale.set(1.5, 0.75, 1);
      scene.add(sprite);
      this.pool.push({ sprite, velocity: 0, lifetime: 0, active: false });
    }
  }

  spawn(value: number, worldPos: THREE.Vector3) {
    const entry = this.pool.find((e) => !e.active);
    if (!entry) return; // pool exhausted

    // Draw text to canvas
    const canvas = (entry.sprite.material as SpriteMaterial).map!.image as HTMLCanvasElement;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = "bold 48px Arial";
    ctx.textAlign = "center";
    ctx.fillStyle = value < 0 ? "#ff4444" : "#44ff44";
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 4;
    ctx.strokeText(String(Math.abs(value)), 64, 48);
    ctx.fillText(String(Math.abs(value)), 64, 48);
    ((entry.sprite.material as SpriteMaterial).map as CanvasTexture).needsUpdate = true;

    entry.sprite.position.copy(worldPos);
    entry.sprite.position.y += 1.5;
    entry.sprite.material.opacity = 1;
    entry.sprite.visible = true;
    entry.velocity = 2.0;
    entry.lifetime = 1.0;
    entry.active = true;
  }

  update(dt: number) {
    for (const entry of this.pool) {
      if (!entry.active) continue;
      entry.lifetime -= dt;
      entry.sprite.position.y += entry.velocity * dt;
      entry.velocity *= 0.95; // decelerate
      entry.sprite.material.opacity = Math.max(0, entry.lifetime);

      if (entry.lifetime <= 0) {
        entry.sprite.visible = false;
        entry.active = false;
      }
    }
  }
}
```

---

## WebGPU Compatibility

All patterns described work with both `WebGLRenderer` and `WebGPURenderer`:

- **HTML overlays** (Patterns 1, 2): Renderer-agnostic — they layer DOM over the canvas.
- **Orthographic scene overlay** (Pattern 3): `renderer.autoClear`, `renderer.clearDepth()`, viewport/scissor all work identically on `WebGPURenderer`.
- **troika-three-text** (Pattern 4): Compatible as of troika-three-text v0.49+; it uses standard Three.js materials internally.
- **CanvasTexture**: Works identically — `needsUpdate` triggers the same upload path.

---

## Choosing the Right Approach

```
Need native HTML controls (inputs, buttons, accessibility)?
  → Pattern 1 (HTML/CSS overlay)

Need labels that follow 3D objects?
  → Few labels (<50): Pattern 2 (CSS2DRenderer)
  → Many labels (50+): Pattern 4 (troika-three-text)

Need HUD elements affected by post-processing?
  → Pattern 3 (Orthographic scene)

Need a minimap or picture-in-picture view?
  → Pattern 5 (Viewport/scissor)

Building for VR/AR?
  → three-mesh-ui (not covered here — see three-mesh-ui docs)
```
