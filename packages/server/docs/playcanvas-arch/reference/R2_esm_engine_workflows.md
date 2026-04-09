# PlayCanvas ESM Engine & Modern Development Workflows

> **Category:** reference · **Engine:** PlayCanvas 2.x · **Related:** [Scripting System](../guides/G1_scripting_system.md), [Architecture Overview](../architecture/E1_architecture_overview.md)

PlayCanvas has undergone a major modernization: the engine is now a proper ESM npm package (`playcanvas`), scripts use ES module class syntax instead of `pc.createScript()`, and you can build games entirely code-first with Vite/TypeScript — no cloud editor required. This reference covers the ESM script system, standalone engine setup, and when to choose editor-based vs. code-only workflows.

---

## Classic vs. ESM Scripts

| Feature | Classic Scripts (`.js`) | ESM Scripts (`.mjs` / `.ts`) |
|---------|------------------------|------------------------------|
| Base class | `pc.ScriptType` via `pc.createScript()` | `Script` (import from `playcanvas`) |
| Imports | Global `pc` namespace, `<script>` tags | Standard ES `import` / `export` |
| Attributes | `MyScript.attributes.add(...)` | `/** @attribute */` JSDoc decorator on class members |
| Bundling | Concatenation, no tree-shaking | Vite / Rollup / esbuild — full tree-shaking |
| Editor support | Full | Full (recommended for new projects) |
| TypeScript | Community type stubs | First-class — engine ships with `.d.ts` declarations |
| Coexistence | Can mix in the same project | Can mix in the same project |

**Recommendation:** Use ESM scripts for all new projects. Classic scripts remain supported indefinitely but won't receive new features.

---

## ESM Script Anatomy

```typescript
// rotator.mjs (or rotator.ts with a bundler)
import { Script, Entity, Vec3 } from "playcanvas";

export class Rotator extends Script {
  // Static name used by the engine to identify this script type
  static scriptName = "rotator";

  /**
   * Speed of rotation in degrees per second.
   * The @attribute tag exposes this in the PlayCanvas Editor inspector.
   * @attribute
   */
  speed: number = 45;

  /**
   * Optional axis to rotate around.
   * @attribute
   * @type {Vec3}
   */
  axis: Vec3 = new Vec3(0, 1, 0);

  // Called once when the script instance is created
  initialize(): void {
    console.log(`Rotator initialized on ${this.entity.name}`);
  }

  // Called every frame — dt is delta time in seconds
  update(dt: number): void {
    this.entity.rotate(
      this.axis.x * this.speed * dt,
      this.axis.y * this.speed * dt,
      this.axis.z * this.speed * dt
    );
  }

  // Called when the script (or its entity) is destroyed
  destroy(): void {
    console.log("Rotator destroyed");
  }
}
```

### Script Lifecycle Methods

| Method | When it Runs |
|--------|-------------|
| `initialize()` | Once, when the entity is enabled and the script is loaded |
| `postInitialize()` | Once, after all scripts' `initialize()` has run (safe to reference other scripts) |
| `update(dt)` | Every frame |
| `postUpdate(dt)` | Every frame, after all `update()` calls |
| `destroy()` | When the script or entity is destroyed |

### Attribute Types

ESM script attributes are declared with the `@attribute` JSDoc tag. The type is inferred from the initializer or from an explicit `@type` tag.

```typescript
import { Script, Entity, Vec3, Color, Asset, Curve } from "playcanvas";

export class EnemySpawner extends Script {
  static scriptName = "enemySpawner";

  /** @attribute */
  spawnRate: number = 2.5;

  /** @attribute */
  maxEnemies: number = 20;

  /** @attribute */
  isBossWave: boolean = false;

  /** @attribute */
  spawnColor: Color = new Color(1, 0, 0);

  /** @attribute */
  spawnPoint: Vec3 = new Vec3(0, 0, 0);

  /**
   * Reference to the enemy prefab entity.
   * @attribute
   * @type {Entity}
   */
  enemyPrefab: Entity | null = null;

  /**
   * The enemy model asset to instantiate.
   * @attribute
   * @type {Asset}
   */
  enemyModel: Asset | null = null;

  /**
   * Difficulty curve over time.
   * @attribute
   * @type {Curve}
   */
  difficultyCurve: Curve | null = null;
}
```

### Attribute Getters/Setters (Reactive Properties)

```typescript
export class HealthBar extends Script {
  static scriptName = "healthBar";

  private _health: number = 100;

  /**
   * Current health value. Updates the visual bar when changed.
   * @attribute
   */
  get health(): number {
    return this._health;
  }

  set health(value: number) {
    this._health = Math.max(0, Math.min(100, value));
    this.updateVisual();
  }

  private updateVisual(): void {
    // Scale the bar entity to match health percentage
    const scale = this._health / 100;
    this.entity.setLocalScale(scale, 1, 1);
  }
}
```

---

## Standalone Engine Setup (Code-Only with Vite)

You can use PlayCanvas without the cloud editor — install the engine from npm and build with any modern bundler.

### Project Scaffolding

```bash
# Create a new Vite project with TypeScript
npm create vite@latest my-game -- --template vanilla-ts
cd my-game

# Install PlayCanvas engine
npm install playcanvas

# Start development server
npm run dev
```

### Minimal Game Entry Point

```typescript
// src/main.ts
import * as pc from "playcanvas";

// Create the application
const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
const app = new pc.Application(canvas, {
  mouse: new pc.Mouse(canvas),
  keyboard: new pc.Keyboard(window),
  touch: new pc.TouchDevice(canvas),
  graphicsDeviceOptions: {
    // Request WebGPU if available, fall back to WebGL2
    preferWebGpu: true,
  },
});

// Configure canvas to fill the window
app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
app.setCanvasResolution(pc.RESOLUTION_AUTO);

// Create a camera
const cameraEntity = new pc.Entity("Camera");
cameraEntity.addComponent("camera", {
  clearColor: new pc.Color(0.1, 0.1, 0.15),
  farClip: 1000,
});
cameraEntity.setPosition(0, 5, 10);
cameraEntity.lookAt(pc.Vec3.ZERO);
app.root.addChild(cameraEntity);

// Create a directional light
const lightEntity = new pc.Entity("DirectionalLight");
lightEntity.addComponent("light", {
  type: "directional",
  color: new pc.Color(1, 1, 0.9),
  castShadows: true,
  shadowBias: 0.2,
  shadowDistance: 30,
});
lightEntity.setEulerAngles(45, 30, 0);
app.root.addChild(lightEntity);

// Create a ground plane
const ground = new pc.Entity("Ground");
ground.addComponent("render", {
  type: "plane",
});
ground.setLocalScale(20, 1, 20);
app.root.addChild(ground);

// Start the application
app.start();

// Resize handler
window.addEventListener("resize", () => app.resizeCanvas());
```

### Registering ESM Scripts in Code-Only Mode

When not using the editor, register script classes manually:

```typescript
import { Rotator } from "./scripts/rotator";
import { PlayerController } from "./scripts/playerController";

// Register script classes with the app
app.scripts.add(Rotator);
app.scripts.add(PlayerController);

// Attach to an entity
const player = new pc.Entity("Player");
player.addComponent("script");
player.script!.create("playerController", {
  attributes: { speed: 10, jumpForce: 5 },
});
app.root.addChild(player);
```

---

## Editor-Based vs. Code-Only Workflow

| Consideration | Cloud Editor | Code-Only (npm + Vite) |
|--------------|-------------|------------------------|
| **Best for** | Teams with designers, visual scene editing, rapid prototyping | Solo devs, CI/CD pipelines, TypeScript-heavy projects |
| **Scene authoring** | Drag-and-drop visual editor in browser | Programmatic — entities created in code |
| **Asset management** | Cloud asset library with CDN delivery | Local assets, self-hosted or CDN |
| **Version control** | Editor has built-in versioning; Git sync available | Standard Git workflow |
| **Collaboration** | Real-time multi-user editing | Standard Git branching/PRs |
| **Build output** | One-click publish to PlayCanvas hosting | Custom build pipeline (Vite, Rollup, etc.) |
| **Offline dev** | Requires internet (cloud editor) | Fully offline |
| **Script editing** | In-browser code editor or VS Code extension | Any local editor (VS Code, etc.) |

**Hybrid approach:** Many teams use the editor for scene layout and asset management, then pull scripts into a local repo for TypeScript compilation, testing, and code review. The editor syncs scripts bidirectionally.

---

## Migration from Classic to ESM Scripts

PlayCanvas provides a codemod to automate the migration:

```bash
npx @playcanvas/codemod playcanvas-esm-scripts src/
```

### Manual Migration Checklist

1. **Rename** `.js` → `.mjs` (or `.ts` if adding types).
2. **Replace** `pc.createScript("name")` → `export class Name extends Script { static scriptName = "name"; }`.
3. **Move attributes** from `Name.attributes.add("speed", { type: "number", default: 5 })` → `/** @attribute */ speed: number = 5;` as a class member.
4. **Replace** `this.app` → `this.app` (same API, but now typed).
5. **Replace** `this.entity.script.otherScript` → use typed imports if you need cross-script references.
6. **Add imports** — `import { Script, Vec3, ... } from "playcanvas";` at the top of each file.

### Before (Classic)

```javascript
var PlayerController = pc.createScript("playerController");

PlayerController.attributes.add("speed", { type: "number", default: 5 });
PlayerController.attributes.add("jumpForce", { type: "number", default: 8 });

PlayerController.prototype.initialize = function () {
  this.grounded = true;
};

PlayerController.prototype.update = function (dt) {
  var x = 0;
  if (this.app.keyboard.isPressed(pc.KEY_A)) x -= this.speed;
  if (this.app.keyboard.isPressed(pc.KEY_D)) x += this.speed;
  this.entity.translate(x * dt, 0, 0);
};
```

### After (ESM)

```typescript
import { Script, KEY_A, KEY_D } from "playcanvas";

export class PlayerController extends Script {
  static scriptName = "playerController";

  /** @attribute */
  speed: number = 5;

  /** @attribute */
  jumpForce: number = 8;

  private grounded: boolean = true;

  initialize(): void {
    this.grounded = true;
  }

  update(dt: number): void {
    let x = 0;
    if (this.app.keyboard.isPressed(KEY_A)) x -= this.speed;
    if (this.app.keyboard.isPressed(KEY_D)) x += this.speed;
    this.entity.translate(x * dt, 0, 0);
  }
}
```

---

## Performance Notes

- **Tree-shaking:** ESM imports allow bundlers to eliminate unused PlayCanvas subsystems. A minimal 3D app can be significantly smaller than loading the full engine bundle.
- **WASM physics:** When using Ammo.js or the newer Jolt physics backend, the WASM binary loads lazily. Wrap physics-dependent initialization in the `postInitialize()` callback to ensure it's ready.
- **WebGPU:** Set `preferWebGpu: true` in `graphicsDeviceOptions`. The engine falls back to WebGL2 automatically on unsupported browsers. WebGPU provides compute shaders and better CPU-side performance for draw-call-heavy scenes.
- **Hot module replacement (HMR):** Vite's HMR works with PlayCanvas standalone. Script changes reflect in the browser without a full reload during development.
