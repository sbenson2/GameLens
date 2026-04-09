# R3 — Editor Workflows for Game Development

> **Category:** reference · **Engine:** PlayCanvas · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md), [Scripting System](../guides/G1_scripting_system.md), [Asset Loading](../guides/G5_asset_loading_gltf.md), [Official Editor Docs](https://developer.playcanvas.com/user-manual/editor/), [ESM Engine Workflows](R2_esm_engine_workflows.md)

PlayCanvas is unique among web 3D engines because its visual **Editor** is a core part of the development workflow, not an optional add-on. The browser-based editor provides real-time collaboration, visual scene composition, asset management, and one-click publishing — all without installing anything. As of 2025–2026, the editor supports ESM scripts, a VS Code extension for external editing, and Templates (prefabs) for reusable entity hierarchies.

This reference covers the editor-centric workflow for building games: project setup, scene composition, scripting integration, Templates, asset pipeline, and publishing.

---

## Project Setup

### Creating a Project

1. Sign in at [playcanvas.com](https://playcanvas.com) and click **New Project**.
2. Choose a template (Blank, FPS, VR Starter, etc.) or start empty.
3. The editor opens immediately — no download, no build step.

### Editor Layout

The editor has five core panels:

| Panel | Purpose |
|-------|---------|
| **Hierarchy** | Entity tree — parent/child relationships, search, drag to reorder |
| **Inspector** | Properties of the selected entity — components, transforms, script attributes |
| **Assets** | File browser for all project assets (models, textures, scripts, audio) |
| **Viewport** | 3D scene view with gizmos for translate/rotate/scale |
| **Console** | Runtime logs, errors, and warnings during Play mode |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `1` / `2` / `3` | Translate / Rotate / Scale gizmo |
| `F` | Focus on selected entity |
| `Ctrl+D` | Duplicate entity |
| `Ctrl+Z` / `Ctrl+Y` | Undo / Redo |
| `Ctrl+Enter` | Launch (Play) the scene |
| `Ctrl+S` | Force save (auto-save is on by default) |

---

## Scene Composition

### Entity-Component Architecture

Everything in a PlayCanvas scene is an **Entity** with zero or more **Components**. The editor exposes all built-in component types:

| Component | What It Does |
|-----------|-------------|
| `render` | Attaches a 3D model or primitive shape |
| `collision` | Collision volume (box, sphere, capsule, mesh) |
| `rigidbody` | Physics body (static, dynamic, kinematic) |
| `light` | Directional, point, or spot light |
| `camera` | Scene camera with projection settings |
| `sound` | Audio source with 3D spatialization |
| `script` | Attaches behavior scripts to the entity |
| `anim` | Animation state machine and blend trees |
| `particlesystem` | GPU particle emitter |
| `element` | 2D UI element (text, image, button) |
| `screen` | UI screen container (screen-space or world-space) |
| `scrollview` | Scrollable UI container |

### Adding Components via Editor

1. Select an entity in the Hierarchy.
2. Click **Add Component** in the Inspector.
3. Choose the component type — its properties appear immediately.
4. Configure values in the Inspector; changes are reflected in the viewport in real time.

### Adding Components via Script

```typescript
import { Script, Entity, Vec3 } from 'playcanvas';

export class SpawnEnemy extends Script {
  static scriptName = 'spawnEnemy';

  spawnAt(position: Vec3): Entity {
    const enemy = new Entity('enemy');
    
    // Add render component
    enemy.addComponent('render', { type: 'capsule' });

    // Add physics
    enemy.addComponent('collision', { type: 'capsule', radius: 0.5, height: 2 });
    enemy.addComponent('rigidbody', { type: 'dynamic', mass: 1 });

    // Add script behavior
    enemy.addComponent('script');
    enemy.script!.create('enemyAI');

    enemy.setPosition(position);
    this.app.root.addChild(enemy);
    return enemy;
  }
}
```

---

## Templates (Prefabs)

Templates are reusable entity hierarchies — PlayCanvas's equivalent of Unity prefabs. Edit the Template once, and all instances update.

### Creating a Template

1. Build an entity hierarchy in the scene (e.g., an enemy with model, collider, scripts).
2. Right-click the root entity → **Template → New Template**.
3. A Template Asset appears in the Assets panel. The entity becomes an **instance** of that Template (shown with a blue icon in the Hierarchy).

### Instantiating Templates via Script

```typescript
import { Script, Asset, Entity } from 'playcanvas';

export class WaveSpawner extends Script {
  static scriptName = 'waveSpawner';

  /** @attribute */
  enemyTemplate!: Asset; // Assign in the Editor's Inspector

  /** @attribute */
  spawnCount: number = 5;

  spawnWave(): void {
    for (let i = 0; i < this.spawnCount; i++) {
      const instance: Entity = this.enemyTemplate.resource.instantiate();
      instance.setPosition(
        (Math.random() - 0.5) * 20,
        0,
        (Math.random() - 0.5) * 20
      );
      this.app.root.addChild(instance);
    }
  }
}
```

### Template Best Practices

- **Keep Templates self-contained** — include all components, scripts, and child entities. Avoid external dependencies that break when instantiated in a different scene.
- **Use overrides sparingly** — instance overrides (changing a property on one instance) are tracked as diffs. Too many overrides defeat the purpose of Templates.
- **Nested Templates** — Templates can contain instances of other Templates. Use this for modular level design (e.g., a "Room" Template containing "Furniture" Templates).
- **Template variants** — Duplicate a Template Asset and modify it for variants (e.g., `enemy_melee` and `enemy_ranged`).

---

## Scripting Workflow

### ESM Scripts (Recommended)

ESM scripts are the modern approach. Save files as `.mjs` (or `.ts` with TypeScript) and use standard ES module imports.

```typescript
import { Script, Entity, Vec3, EVENT_KEYDOWN, KEY_SPACE } from 'playcanvas';

export class PlayerJump extends Script {
  static scriptName = 'playerJump';

  /** @attribute */
  jumpForce: number = 5;

  private grounded: boolean = true;

  initialize(): void {
    // Collision events for ground detection
    this.entity.collision!.on('collisionstart', this.onCollisionStart, this);
    this.entity.collision!.on('collisionend', this.onCollisionEnd, this);

    // Keyboard input
    this.app.keyboard!.on(EVENT_KEYDOWN, this.onKeyDown, this);
  }

  private onKeyDown(event: { key: number }): void {
    if (event.key === KEY_SPACE && this.grounded) {
      this.entity.rigidbody!.applyImpulse(new Vec3(0, this.jumpForce, 0));
      this.grounded = false;
    }
  }

  private onCollisionStart(): void {
    this.grounded = true;
  }

  private onCollisionEnd(): void {
    this.grounded = false;
  }

  destroy(): void {
    this.app.keyboard!.off(EVENT_KEYDOWN, this.onKeyDown, this);
  }
}
```

### VS Code Extension

The PlayCanvas VS Code Extension (released November 2025) enables editing script files in VS Code with real-time sync to the editor:

1. Install the **PlayCanvas** extension from the VS Code marketplace.
2. Connect to your PlayCanvas project via the extension's login flow.
3. Edit `.mjs` / `.ts` files locally — changes sync to the cloud editor automatically.
4. Full IntelliSense, go-to-definition, and refactoring support.

This is the recommended workflow for serious game projects — the cloud code editor lacks advanced refactoring and debugging features.

### Script Attributes

Attributes are exposed in the Editor Inspector, making scripts configurable per-entity without code changes:

```typescript
export class Turret extends Script {
  static scriptName = 'turret';

  /** @attribute */
  fireRate: number = 2.0;         // Shots per second

  /** @attribute */
  projectileSpeed: number = 20;   // Units per second

  /** @attribute */
  projectileTemplate!: Asset;     // Template to instantiate

  /** @attribute */
  range: number = 30;             // Detection range
}
```

Supported attribute types: `number`, `string`, `boolean`, `Vec2`, `Vec3`, `Vec4`, `Color`, `Curve`, `Entity`, `Asset`, and arrays of these.

---

## Asset Pipeline

### Importing Assets

Drag files into the Assets panel or use **Upload**. Supported formats:

| Type | Formats | Notes |
|------|---------|-------|
| 3D Models | FBX, OBJ, glTF, GLB | Auto-converted to PlayCanvas format; glTF/GLB preferred |
| Textures | PNG, JPG, HDR, EXR, Basis | Auto-compressed on publish; HDR for environment maps |
| Audio | MP3, OGG, WAV | WAV for short SFX, MP3/OGG for music |
| Fonts | TTF, WOFF | For UI text elements |
| Scripts | JS, MJS, TS | ESM (.mjs/.ts) recommended |

### Asset Preloading

By default, assets marked **Preload** are loaded before the scene starts. For large games, disable preload on non-critical assets and load them on demand:

```typescript
import { Script, Asset } from 'playcanvas';

export class LevelLoader extends Script {
  static scriptName = 'levelLoader';

  /** @attribute */
  levelAssets: Asset[] = [];

  async loadLevel(index: number): Promise<void> {
    const asset = this.levelAssets[index];
    if (!asset.loaded) {
      await new Promise<void>((resolve, reject) => {
        asset.once('load', resolve);
        asset.once('error', (err: string) => reject(new Error(err)));
        this.app.assets.load(asset);
      });
    }
    // Asset is now ready to instantiate
    const instance = asset.resource.instantiate();
    this.app.root.addChild(instance);
  }
}
```

---

## Collaboration

PlayCanvas's cloud-based editor supports real-time multi-user editing:

- **Simultaneous editing** — Multiple team members can edit the same scene. Changes appear in real time (like Google Docs).
- **Version control** — Built-in checkpoint system. Create named checkpoints before major changes; restore any previous checkpoint.
- **Branching** — Create branches for experimental features. Merge back when ready.
- **Conflict resolution** — If two users edit the same entity property simultaneously, the last write wins. For scripts, use external version control (Git) via the VS Code extension.

### Team Workflow Recommendations

1. **Scene ownership** — Assign scenes to team members to reduce conflicts.
2. **Templates for shared assets** — Artists create Templates; programmers instantiate them. Changes to the Template propagate everywhere.
3. **Checkpoints before merges** — Always create a checkpoint before merging a branch.
4. **Scripts in Git** — Use the VS Code extension + Git for script version control. The built-in code editor is fine for quick fixes but lacks branching.

---

## Publishing

### One-Click Publish

1. Open the **Publish** dialog from the editor toolbar.
2. Choose **PlayCanvas Hosting** (served from a global CDN) or **Download .zip** (self-host anywhere).
3. Click **Publish** — the build is live in seconds.

### Build Optimization

The publish process automatically:

- Bundles and minifies all scripts
- Compresses textures to Basis Universal (if enabled)
- Generates a `manifest.json` for progressive loading
- Outputs a single `index.html` entry point

For further optimization:

```typescript
// In project settings (accessible via Editor → Settings):
{
  "use_legacy_scripts": false,          // ESM only — smaller bundles
  "preload_assets": true,               // Preload marked assets
  "texture_compression": {
    "basis": true,                       // Enable Basis Universal
    "quality": 128                       // 1–255, higher = better quality
  }
}
```

### Custom Build Pipeline

For advanced needs (custom bundlers, CI/CD), use the PlayCanvas REST API:

```bash
# Trigger a build via API
curl -X POST "https://playcanvas.com/api/apps/download" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"project_id": 123456, "scenes": [789], "name": "my-game"}'
```

---

## Performance Considerations

| Area | Recommendation |
|------|---------------|
| Draw calls | Use batching (`render.batchGroupId`) to merge static meshes into fewer draw calls |
| Textures | Enable Basis compression; use texture atlases for UI and small props |
| Physics | Keep collision meshes simple (box/sphere) — mesh colliders are expensive |
| Scripts | Avoid per-frame `app.root.findByName()` — cache entity references in `initialize()` |
| Mobile | Target 30 FPS on low-end devices; disable shadows and reduce texture resolution |
| Loading | Mark only essential assets as Preload; load level-specific assets on demand |

> **Mobile GPU budget:** On mid-range phones (Adreno 640 / Mali G77), keep draw calls under 150, triangles under 300k, and texture memory under 96 MB for stable 30 FPS.
