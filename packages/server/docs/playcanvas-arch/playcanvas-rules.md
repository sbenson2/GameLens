# PlayCanvas — AI Code Generation Rules

Engine-specific rules for PlayCanvas Engine 1.70+ / 2.x projects using JavaScript/TypeScript. These supplement the engine-agnostic rules in `docs/core/ai-workflow/gamedev-rules.md`.

---

## ⚠️ Legacy vs Modern API — Critical Differences

PlayCanvas underwent major architectural changes for WebGPU support (Engine 1.62+) and open-sourced the Editor Frontend. Most older tutorials use the legacy `pc.Application` setup and callback-based scripts. Modern PlayCanvas uses ESM imports and the `AppBase` class.

### API Changes That Break Code

| Legacy (pre-1.62) | Modern (1.70+ / 2.x) |
|--------------------|------------------------|
| `pc.Application` synchronous creation | `AppBase` with async `createGraphicsDevice()` |
| `pc.script.create('name', {...})` | ES module `class extends ScriptType` with decorators |
| Uniform-based shader parameters | Uniform buffer objects (WebGPU-compatible) |
| GLSL-only shaders | GLSL auto-converted to WGSL via glslang + tint |
| `app.assets.load(asset)` callback | `app.assets.load(asset)` + event or `AssetListLoader` |
| `pc.SHADOW_PCF3` | `pc.SHADOW_PCF3` (unchanged, but new CSM support) |

### Import Style

```typescript
// CORRECT — ES module imports (npm package)
import * as pc from 'playcanvas';

// CORRECT — specific imports for tree shaking (Engine 2.x)
import { Application, Entity, Vec3, Script } from 'playcanvas';

// Editor projects — scripts are loaded by the editor runtime
// Use the global `pc` namespace in Editor projects only
```

---

## Entity Component System (ECS)

PlayCanvas is built on a proper Entity Component System. This is the fundamental architectural difference from Three.js and Babylon.js.

### Core Concepts

| Concept | Class | Role |
|---------|-------|------|
| **Entity** | `Entity` (extends `GraphNode`) | Container with a transform — no behavior on its own |
| **Component** | `Component` (various subtypes) | Data + behavior attached to an entity |
| **System** | `ComponentSystem` | Manages all instances of a component type, runs updates |

### Built-in Components

| Component | Purpose |
|-----------|---------|
| `render` | 3D mesh rendering (replaces legacy `model`) |
| `camera` | Camera projection and rendering |
| `light` | Directional, point, spot lights |
| `rigidbody` | Physics body (Ammo.js / custom backend) |
| `collision` | Physics collision shapes |
| `animation` | Legacy animation playback |
| `anim` | Modern animation state machine (blending, layers) |
| `sound` | Audio playback (positional 3D audio) |
| `particlesystem` | GPU particle effects |
| `script` | Custom behavior scripts |
| `element` | 2D UI elements (text, image, button) |
| `layoutgroup` / `layoutchild` | UI layout |
| `scrollview` | Scrollable UI container |
| `button` | Interactive UI button |
| `screen` | UI screen root |
| `sprite` | 2D sprite rendering |

### Entity Hierarchy

```
Root (app.root)
├── Entity "Player"
│   ├── render component (mesh)
│   ├── rigidbody component
│   ├── collision component
│   ├── script component → [PlayerController, HealthSystem]
│   └── Entity "Camera"  (child)
│       └── camera component
├── Entity "Environment"
│   ├── Entity "Ground"
│   │   ├── render component
│   │   ├── rigidbody component (static)
│   │   └── collision component
│   └── Entity "Lights"
│       ├── Entity "Sun" → light component
│       └── Entity "Ambient" → light component
└── Entity "UI"
    └── screen component
        └── Entity "ScoreText" → element component
```

---

## Script Component (Custom Behavior)

Scripts are the primary way to add game logic. Each script is a class extending `Script`.

```typescript
import { Script, Vec3, Entity } from 'playcanvas';

class PlayerController extends Script {
  // Declare attributes (configurable in Editor)
  speed: number = 5;
  jumpForce: number = 10;

  private _direction = new Vec3();

  // Called once after all scripts initialized
  initialize(): void {
    this.app.keyboard.on('keydown', this.onKeyDown, this);
  }

  // Called every frame
  update(dt: number): void {
    this._direction.set(0, 0, 0);

    if (this.app.keyboard.isPressed(pc.KEY_W)) {
      this._direction.z -= this.speed;
    }
    if (this.app.keyboard.isPressed(pc.KEY_S)) {
      this._direction.z += this.speed;
    }

    // Apply movement via physics
    this.entity.rigidbody?.applyForce(
      this._direction.x * dt,
      this._direction.y * dt,
      this._direction.z * dt
    );
  }

  // Called when script/entity is destroyed
  destroy(): void {
    this.app.keyboard.off('keydown', this.onKeyDown, this);
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (event.key === pc.KEY_SPACE) {
      this.entity.rigidbody?.applyImpulse(0, this.jumpForce, 0);
    }
  }
}
```

**Key rules:**
- `initialize()` — runs once, set up event listeners and references.
- `update(dt)` — runs every frame, `dt` is delta time in seconds.
- `postUpdate(dt)` — runs after all `update()` calls (good for cameras).
- `destroy()` — clean up event listeners to prevent memory leaks.
- **Always reuse objects** (`Vec3`, `Quat`, `Mat4`) — never allocate in `update()`.

---

## Physics (Ammo.js)

PlayCanvas uses Ammo.js (Bullet Physics compiled to WASM) for built-in physics.

```typescript
// Create a dynamic physics entity
const ball = new Entity('ball');
ball.addComponent('render', { type: 'sphere' });
ball.addComponent('rigidbody', {
  type: 'dynamic',         // 'static', 'dynamic', 'kinematic'
  mass: 1,
  restitution: 0.5,
  friction: 0.5
});
ball.addComponent('collision', {
  type: 'sphere',
  radius: 0.5
});
app.root.addChild(ball);

// Collision events
ball.collision.on('collisionstart', (result: ContactResult) => {
  const otherEntity = result.other;
  console.log(`Hit: ${otherEntity.name}`);
});

// Trigger volumes (no physical response)
const trigger = new Entity('trigger');
trigger.addComponent('collision', { type: 'box', halfExtents: new Vec3(2, 2, 2) });
trigger.addComponent('rigidbody', { type: 'static' });
trigger.collision.on('triggerenter', (entity: Entity) => {
  console.log(`${entity.name} entered trigger zone`);
});
```

**Key rules:**
- Physics types: `'static'` (never moves), `'dynamic'` (physics-driven), `'kinematic'` (code-driven).
- Always add both `rigidbody` and `collision` components — rigidbody without collision does nothing.
- Use `rigidbody.teleport(x, y, z)` to move kinematic bodies, never set `entity.setPosition()` directly.

---

## Asset Loading

```typescript
// Load a glTF model (from Editor asset registry)
const asset = this.app.assets.find('character', 'container');
if (asset) {
  asset.ready((asset) => {
    const entity = asset.resource.instantiateRenderEntity();
    this.app.root.addChild(entity);
  });
  this.app.assets.load(asset);
}

// Load from URL (engine-only projects)
app.assets.loadFromUrl('/models/character.glb', 'container', (err, asset) => {
  if (!err && asset) {
    const entity = asset.resource.instantiateRenderEntity();
    app.root.addChild(entity);
  }
});
```

- **glTF/GLB** is the primary 3D format. Use `'container'` asset type.
- `instantiateRenderEntity()` creates an entity hierarchy from the glTF scene.
- The Editor handles asset management automatically — engine-only projects must manage loading manually.

---

## Camera Setup

```typescript
const camera = new Entity('camera');
camera.addComponent('camera', {
  clearColor: new pc.Color(0.1, 0.1, 0.1),
  fov: 75,
  nearClip: 0.1,
  farClip: 1000
});
app.root.addChild(camera);
camera.setPosition(0, 5, 10);
camera.lookAt(0, 0, 0);
```

- PlayCanvas cameras are entities with a `camera` component — attach them as children for follow cameras.
- Use `camera.camera.screenToWorld()` for raycasting from screen coordinates.
- Multiple cameras can render to different layers or render targets.

---

## Performance Rules

1. **Batching** — PlayCanvas auto-batches static meshes. Mark entities as `static` in the Editor or use `BatchGroup`.
2. **Instancing** — enable hardware instancing on materials: `material.useInstancing = true`.
3. **Draw calls** — keep under 100 for mobile. Use the Profiler (`app.stats`) to monitor.
4. **Texture compression** — use Basis Universal via the Editor's texture compression settings.
5. **LOD** — no built-in LOD system. Implement with distance checks in a script or use the community LOD script.
6. **Culling** — frustum culling is automatic. For large worlds, implement spatial partitioning manually.
7. **Shadows** — use Cascaded Shadow Maps (`light.numCascades`) for directional lights in open worlds.
8. **Profiler** — enable with `app.enableStats()` or use the built-in Profiler in the Editor.
9. **Minimize hierarchy depth** — shallower hierarchies perform better (fewer matrix multiplications).

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Allocating `Vec3`/`Quat` in `update()` | Declare as class properties, reuse with `.set()` or `.copy()` |
| Forgetting to remove event listeners in `destroy()` | Always `.off()` in `destroy()` — prevents memory leaks and ghost behavior |
| Setting position directly on physics entities | Use `rigidbody.teleport()` for kinematic, or `applyForce/Impulse` for dynamic |
| Using legacy `model` component | Use `render` component (model is deprecated) |
| Not awaiting Ammo.js initialization | Ensure WASM is loaded before creating physics entities |
| Deep entity hierarchies (>8 levels) | Flatten where possible — each level adds transform computation |
| Using `pc.script.create()` (legacy API) | Use ES module classes extending `Script` |
