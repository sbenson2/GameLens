# PlayCanvas Engine Architecture Overview

> **Category:** architecture · **Engine:** PlayCanvas · **Related:** [entity-components](../guides/entity-components.md), [webgpu-support](../guides/webgpu-support.md)

PlayCanvas is an open-source, cloud-friendly 3D game engine built on WebGL2 and WebGPU. It combines a high-performance JavaScript/TypeScript runtime with an optional browser-based visual editor, making it one of the most complete web-native game development platforms. PlayCanvas is used in production by companies including Snap, ARM, BMW, and numerous game studios.

## Core Architecture

### Entity-Component System (ECS)

PlayCanvas uses a true Entity-Component-System architecture, which is its most distinctive design choice compared to Three.js (scene graph only) and Babylon.js (node hierarchy with built-in features).

```
Entity              — A container with a name, transform, and hierarchy position
  ├─ Component      — A data + behavior module (render, rigidbody, script, etc.)
  └─ Children[]     — Child entities forming the scene hierarchy
```

Entities are lightweight containers. All behavior comes from components. This composition-over-inheritance model keeps game objects flexible — a "door" entity might have a `render` component, a `rigidbody` component, a `collision` component, and a `script` component, each independently attachable and removable.

```typescript
import { Application, Entity } from 'playcanvas';

const app = new Application(canvas);
app.start();

// Create an entity with a camera component
const camera = new Entity('MainCamera');
camera.addComponent('camera', {
    clearColor: new pc.Color(0.1, 0.1, 0.1)
});
camera.setPosition(0, 5, 10);
camera.lookAt(0, 0, 0);
app.root.addChild(camera);

// Create a renderable entity
const box = new Entity('Box');
box.addComponent('render', {
    type: 'box'
});
box.addComponent('rigidbody', {
    type: 'dynamic',
    mass: 1
});
box.addComponent('collision', {
    type: 'box'
});
app.root.addChild(box);
```

### Built-in Components

PlayCanvas ships a rich set of components:

| Component | Purpose |
|-----------|---------|
| `render` | 3D mesh rendering (primitives or model assets) |
| `camera` | Camera with projection, clear color, layers |
| `light` | Directional, point, spot lights with shadows |
| `rigidbody` | Physics body (static, dynamic, kinematic) via Ammo.js |
| `collision` | Collision shapes (box, sphere, capsule, mesh, compound) |
| `script` | Attach custom script behaviors to entities |
| `animation` | Skeletal animation playback and blending |
| `anim` | State-machine-based animation controller |
| `sound` | 3D spatial audio with slots for multiple clips |
| `particlesystem` | GPU-accelerated particle effects |
| `element` | 2D UI elements (text, image, button) |
| `screen` | UI screen container (screen-space or world-space) |
| `sprite` | 2D sprite rendering with atlas support |
| `layoutgroup` / `layoutchild` | Automatic UI layout |
| `scrollview` | Scrollable UI containers |
| `button` | Interactive UI buttons |
| `gsplat` | Gaussian splat rendering |

### Application Lifecycle

The `Application` class is the engine entry point. It manages:
- The render loop (`app.start()` / `app.on('update', callback)`)
- Asset loading and registry
- Scene hierarchy (accessible via `app.root`)
- Input systems (keyboard, mouse, touch, gamepad)
- Audio manager

```typescript
// Game loop with delta time
app.on('update', (dt: number) => {
    // Game logic here — dt is seconds since last frame
    player.rotate(0, turnSpeed * dt, 0);
});
```

### Script Component System

Custom game logic is written as Script classes attached to entities via the `script` component:

```typescript
import { Script, Entity, Vec3 } from 'playcanvas';

class PlayerController extends Script {
    speed: number = 5;

    initialize() {
        // Called once when the script is first enabled
        console.log('Player initialized on', this.entity.name);
    }

    update(dt: number) {
        // Called every frame
        const move = new Vec3();
        if (this.app.keyboard.isPressed(pc.KEY_W)) {
            move.z -= this.speed * dt;
        }
        this.entity.translate(move);
    }

    destroy() {
        // Cleanup when entity or script is destroyed
    }
}
```

Scripts have lifecycle hooks: `initialize()`, `postInitialize()`, `update(dt)`, `postUpdate(dt)`, `swap(old)` (hot-reload), and `destroy()`.

## Rendering Pipeline

PlayCanvas uses a forward+ rendering pipeline with clustered lighting:

- **Clustered Lighting:** The view frustum is divided into a 3D grid of clusters. Each cluster stores a list of affecting lights. This allows many dynamic lights without the overhead of traditional forward rendering (no per-object light limit).
- **Shadow Mapping:** PCF and VSM shadow filtering. Cascaded shadow maps for directional lights. Shadow atlas for managing multiple shadow-casting lights.
- **Layers and Cameras:** Rendering is organized into layers (World, UI, Skybox, etc.). Cameras render specific layers, enabling split-screen, minimaps, or render-to-texture effects.

### Material System

- **StandardMaterial** — PBR metallic-roughness workflow with diffuse, normal, metalness, roughness, emissive, AO, and clearcoat maps.
- **ShaderMaterial** — Custom shaders via GLSL (WebGL2) or WGSL (WebGPU).
- **Shader Chunks:** Override specific parts of the built-in shader pipeline without rewriting everything. This is PlayCanvas's approach to shader customization — more modular than Three.js's `onBeforeCompile`.

## Physics: Ammo.js Integration

PlayCanvas integrates Ammo.js (Bullet Physics compiled to WASM/JS) through its `rigidbody` and `collision` components:

- **Body types:** Static (walls, floors), Dynamic (player, projectiles), Kinematic (moving platforms).
- **Collision shapes:** Box, sphere, capsule, cylinder, cone, mesh, and compound.
- **Triggers:** Collision shapes without rigid bodies for area detection.
- **Raycasting:** `app.systems.rigidbody.raycastFirst()` for hit detection.
- **Joints:** Point-to-point, hinge, and slider constraints.

Physics runs on the main thread. For complex simulations, consider web worker offloading (not built-in).

## WebGPU Support

PlayCanvas was one of the first production 3D engines to ship WebGPU support (engine v1.62+, fully matured in v2). Key aspects:

- **Automatic backend selection:** The engine detects WebGPU availability and falls back to WebGL2.
- **Compute shaders:** Available on the WebGPU backend for GPU-driven particles, culling, and simulation.
- **Dual shader paths:** Write WGSL for WebGPU alongside GLSL for WebGL2. The engine manages both variants.
- **Performance gains:** 25–50% improvement in complex scenes due to reduced driver overhead and better GPU utilization.

```typescript
import { Application, DEVICETYPE_WEBGPU } from 'playcanvas';

const app = new Application(canvas, {
    graphicsDeviceOptions: {
        deviceTypes: [DEVICETYPE_WEBGPU, DEVICETYPE_WEBGL2]
    }
});
```

## Performance Considerations for Games

- **Draw call batching:** PlayCanvas automatically batches static meshes. Mark entities as `static` in the editor or set `entity.render.batchGroupId` in code.
- **Instancing:** Hardware instancing for repeated meshes. Enable via `material.useMorphing` or manual instance buffers.
- **LOD:** No built-in LOD system — implement using distance checks in scripts that swap model assets.
- **Texture compression:** Supports Basis Universal (KTX2), DXT, ETC, PVRTC, and ASTC. The editor auto-generates compressed variants.
- **Asset streaming:** Load assets on demand via `app.assets.load()`. Use bundles for grouped loading.
- **Profiler:** Built-in mini-stats overlay (`app.setMiniStats(true)`) showing FPS, draw calls, triangles, and VRAM.
- **Mobile GPU limits:** Target < 100 draw calls, < 100k triangles, < 128MB texture memory for broad mobile compatibility.

## Asset Loading

PlayCanvas uses an asset registry with typed assets:

```typescript
const asset = new Asset('character', 'container', {
    url: '/assets/character.glb'
});

app.assets.add(asset);
app.assets.load(asset);

asset.ready((asset) => {
    const entity = asset.resource.instantiateRenderEntity();
    app.root.addChild(entity);
});
```

- **Primary format:** glTF 2.0 / GLB with Draco and KTX2 support.
- **Container assets:** GLB files load as containers holding meshes, materials, animations, and textures — instantiated as entity hierarchies.
- **Preloading:** Assets marked for preload are fetched before the application starts.

## Development Modes

PlayCanvas offers multiple development workflows:

1. **Visual Editor** (playcanvas.com) — Cloud-based IDE with scene editor, asset pipeline, code editor, real-time collaboration, and one-click publishing.
2. **Engine-only via npm** — `npm install playcanvas` for code-first development. Full TypeScript definitions included.
3. **React integration** — `@playcanvas/react` for declarative scene construction.
4. **Web Components** — `<pc-app>`, `<pc-entity>`, `<pc-camera>` HTML elements for lightweight embeds.
5. **VS Code Extension** — Launched November 2025, providing IntelliSense, asset previews, and project management.

## Comparison Summary

| Feature | PlayCanvas | Three.js | Babylon.js |
|---------|-----------|----------|------------|
| Architecture | Entity-Component System | Scene graph + library | Node hierarchy + engine |
| Physics | Ammo.js (built-in) | BYO (Rapier, Cannon) | Havok (built-in) |
| Visual Editor | Yes (cloud) | No | Inspector only |
| GUI System | Yes (element components) | No | Yes (@babylonjs/gui) |
| WebGPU | Full (v2+) | WebGPURenderer | WebGPUEngine |
| Shader Customization | Chunk system | TSL / ShaderMaterial | Node Material Editor |
| Learning Curve | Moderate | Low (library) | Moderate-High (feature-rich) |
