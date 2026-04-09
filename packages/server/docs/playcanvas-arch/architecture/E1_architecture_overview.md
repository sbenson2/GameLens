# PlayCanvas Architecture Overview

> **Category:** architecture · **Engine:** PlayCanvas · **Related:** [playcanvas-rules.md](../playcanvas-rules.md), [Official Docs](https://developer.playcanvas.com)

PlayCanvas is an **open-source 3D game engine** built on WebGL 2 and WebGPU. It differentiates from Three.js and Babylon.js with a proper **Entity Component System (ECS)**, a **cloud-based visual editor**, and a focus on mobile-optimized game delivery. The engine is used in production for games, playable ads, product configurators, and architectural visualization.

---

## Core Architecture

### Application Lifecycle

```
createGraphicsDevice() (async — WebGPU or WebGL 2)
    │
    ▼
new AppBase(canvas)
    │
    ├── app.init(options)       // register component systems
    ├── app.start()             // begin the main loop
    │
    ▼
Main Loop (per frame):
    ├── Input polling
    ├── Script update(dt)       // all script components
    ├── Physics step            // Ammo.js simulation
    ├── Animation update
    ├── Script postUpdate(dt)   // camera scripts, etc.
    ├── Frustum culling
    ├── Shadow passes
    ├── Render passes           // forward or clustered forward
    └── Post-processing
```

```typescript
import * as pc from 'playcanvas';

// Modern async initialization (required for WebGPU)
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const gfxDevice = await pc.createGraphicsDevice(canvas, {
  deviceTypes: [pc.DEVICETYPE_WEBGPU, pc.DEVICETYPE_WEBGL2],
  glslangUrl: '/lib/glslang.js',
  twgslUrl: '/lib/twgsl.js'
});

const app = new pc.AppBase(canvas);
app.init({
  graphicsDevice: gfxDevice,
  componentSystems: [
    pc.RenderComponentSystem,
    pc.CameraComponentSystem,
    pc.LightComponentSystem,
    pc.ScriptComponentSystem,
    pc.RigidBodyComponentSystem,
    pc.CollisionComponentSystem,
    pc.AnimComponentSystem,
    pc.SoundComponentSystem
  ],
  resourceHandlers: [
    pc.TextureHandler,
    pc.ContainerHandler,
    pc.ScriptHandler,
    pc.JsonHandler,
    pc.AudioHandler
  ]
});
app.start();
```

### Key Design Decisions

- **Explicit component registration** — only register systems you use, reducing bundle size.
- **Async graphics device** — WebGPU requires async initialization; the API is designed for it.
- **Forward rendering with clustered lighting** — not deferred. Good for mobile, transparency-friendly.
- **Frame graph** (1.62+) — rendering described as render passes with dependencies and targets.

---

## Entity Component System

PlayCanvas's ECS is the core architectural pattern. Understanding it is essential.

### Entity

An `Entity` extends `GraphNode` (the scene graph node). It acts as a container for components and participates in the transform hierarchy.

```typescript
const player = new pc.Entity('Player');
player.setPosition(0, 1, 0);
player.setLocalScale(1, 1, 1);
app.root.addChild(player);

// Hierarchy
const weapon = new pc.Entity('Weapon');
player.addChild(weapon); // weapon transform is relative to player
weapon.setLocalPosition(0.5, 0, -0.3);
```

### Component

Components are data + behavior bundles managed by their corresponding `ComponentSystem`. You add components to entities:

```typescript
// Add a render component (3D mesh)
player.addComponent('render', {
  type: 'capsule',
  material: playerMaterial
});

// Add physics
player.addComponent('rigidbody', {
  type: 'dynamic',
  mass: 70,
  friction: 0.5
});
player.addComponent('collision', {
  type: 'capsule',
  radius: 0.3,
  height: 1.8
});

// Add custom script behavior
player.addComponent('script');
player.script.create('playerController');
```

### System

Each component type has a corresponding `ComponentSystem` that:
- Manages the lifecycle of all component instances.
- Runs batch updates each frame (e.g., the physics system steps the simulation).
- Handles serialization/deserialization for the Editor.

You rarely interact with systems directly — they work behind the scenes.

### GraphNode (Scene Graph)

```
GraphNode (transform, hierarchy)
└── Entity (components, tags, enabled state)
```

`GraphNode` provides:
- `localPosition`, `localRotation`, `localScale` — relative to parent.
- `getPosition()`, `getRotation()` — world-space accessors.
- `addChild()`, `removeChild()`, `children` — hierarchy management.
- `lookAt(target)`, `translate()`, `rotate()` — convenience methods.

**Transform propagation:** moving a parent moves all children. World matrices are lazily computed and cached — calling `getPosition()` triggers a recalculation only if the hierarchy is dirty.

---

## Rendering Architecture

### Clustered Forward Rendering

PlayCanvas uses **clustered forward rendering** as its primary pipeline:

1. The view frustum is divided into a 3D grid of clusters.
2. Each cluster tracks which lights affect it.
3. During the forward pass, each fragment looks up its cluster to find relevant lights.

This approach handles many dynamic lights efficiently without the bandwidth cost of deferred rendering, and works well on mobile GPUs.

### Layers and Render Order

```typescript
// Create a custom layer for UI rendering
const uiLayer = new pc.Layer({ name: 'UI' });
app.scene.layers.push(uiLayer);

// Assign entities to layers
uiEntity.render.layers = [uiLayer.id];
camera.camera.layers = [pc.LAYERID_WORLD, uiLayer.id];
```

Layers control:
- Which objects are rendered by which cameras.
- Render order (layers render in array order).
- Post-processing targets.

### WebGPU Support

PlayCanvas was one of the first production engines with WebGPU support (Engine 1.62+). Key changes:

- **FrameGraph** — rendering described as a DAG of render passes with explicit dependencies.
- **Uniform buffers** — uniforms reorganized into UBOs for WebGPU compatibility.
- **Shader translation** — GLSL shaders automatically converted to WGSL via glslang + tint WASM modules.
- **Async device creation** — `createGraphicsDevice()` returns a Promise.

Performance improvements of 25-50% have been observed for complex scenes on WebGPU vs WebGL 2.

---

## Editor vs Engine-Only

PlayCanvas offers two development modes:

| Aspect | Editor (Cloud) | Engine-Only (Code) |
|--------|---------------|-------------------|
| Setup | Browser-based visual editor | npm install + bundler |
| Scene authoring | Drag-and-drop, visual hierarchy | Programmatic (`new Entity()`, `addChild()`) |
| Asset management | Upload to cloud, auto-process | Manual loading, self-hosted |
| Scripts | Attached in editor, hot-reload | ESM imports, bundled |
| Collaboration | Real-time multi-user editing | Git-based |
| Publishing | One-click deploy | Self-hosted |
| Cost | Free tier + paid plans | Free (MIT license) |

For games, the Editor provides the fastest workflow. For engine-only, you get full control and can use any bundler (Vite, webpack, Rollup).

---

## Input System

```typescript
// Keyboard
if (app.keyboard.isPressed(pc.KEY_W)) { /* held down */ }
if (app.keyboard.wasPressed(pc.KEY_SPACE)) { /* just pressed this frame */ }

// Mouse
app.mouse.on('mousedown', (event: pc.MouseEvent) => {
  if (event.button === pc.MOUSEBUTTON_LEFT) { /* left click */ }
});

// Touch
if (app.touch) {
  app.touch.on('touchstart', (event: pc.TouchEvent) => {
    const touch = event.touches[0];
  });
}

// Gamepad
const gamepads = app.gamepads;
if (gamepads) {
  const pad = gamepads.getGamepad(0);
  if (pad) {
    const leftStickX = pad.axes[0]; // -1 to 1
    const buttonA = pad.buttons[0].pressed;
  }
}
```

- Keyboard and mouse input is polled (check in `update()`).
- Touch and gamepad are available on supported devices.
- The Editor's "input" settings configure which input sources are active.

---

## Audio

```typescript
// Add spatial audio to an entity
entity.addComponent('sound', {
  positional: true,
  refDistance: 1,
  maxDistance: 100,
  rollOffFactor: 1,
  distanceModel: 'inverse'
});

entity.sound.addSlot('explosion', {
  asset: explosionAsset,
  volume: 0.8,
  pitch: 1,
  loop: false,
  autoPlay: false
});

// Play from script
entity.sound.play('explosion');
```

- PlayCanvas wraps the Web Audio API with spatial (3D positional) support.
- Sound "slots" allow multiple sounds per entity with individual volume/pitch/loop settings.
- For music, use a non-positional sound on a persistent entity.

---

## Performance Characteristics

| Metric | Mobile Target | Desktop Target |
|--------|--------------|----------------|
| Draw calls | < 100 | < 500 |
| Triangles | < 100K | < 1M |
| Texture memory | < 64 MB | < 512 MB |
| Bundle size | < 1 MB (gzipped) | < 5 MB |
| Target FPS | 30 | 60 |

### Optimization Tools

- **Profiler** — built-in (`app.enableStats()`) shows draw calls, fill rate, VRAM.
- **Static batching** — mark entities as static; the engine merges draw calls.
- **Hardware instancing** — `material.useInstancing = true` for repeated meshes.
- **Texture compression** — Basis Universal via Editor or CLI tools.
- **Mesh compression** — Draco support for glTF assets.
- **Lightmapping** — bake static lighting in the Editor, removing runtime light cost.

---

## Ecosystem

| Need | Solution |
|------|----------|
| Visual editor | PlayCanvas Editor (cloud-based, collaborative) |
| Physics | Ammo.js (built-in, Bullet WASM) |
| UI | Built-in screen/element system |
| Networking | External (Colyseus, Socket.io, WebRTC) |
| Particles | Built-in GPU particle system |
| Animation | Built-in anim state graph (blending, layers, masks) |
| Scripting | ES module scripts extending `Script` |
| Publishing | Editor one-click deploy, or self-host engine builds |
| React integration | `@playcanvas/react` (experimental) |
| XR/VR | Built-in WebXR support |

---

## Comparison: PlayCanvas vs Three.js vs Babylon.js

| Aspect | Three.js | Babylon.js | PlayCanvas |
|--------|----------|-----------|------------|
| **Type** | Rendering library | Game engine | Game engine |
| **Architecture** | Scene graph | Scene graph + Inspector | Entity Component System |
| **Editor** | None (community tools) | Optional desktop editor | Cloud-based visual editor |
| **Physics** | External (Rapier, etc.) | Built-in (Havok) | Built-in (Ammo.js/Bullet) |
| **GUI** | External | Built-in | Built-in |
| **Bundle size** | ~150 KB min+gz | ~500 KB min+gz | ~300 KB min+gz |
| **Best for** | Custom 3D experiences | Feature-rich games, XR | Mobile games, playable ads |
| **WebGPU** | r166+ (TSL nodes) | v7+ (native WGSL) | 1.62+ (auto-translate) |
