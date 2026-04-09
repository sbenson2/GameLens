# Babylon.js Scene Management & State Machines for Games

> **Category:** reference · **Engine:** Babylon.js v7+ · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md), [Optimization](../guides/G8_optimization_performance.md), [Asset Loading](../guides/G4_asset_loading_gltf.md)

Babylon.js supports multiple scenes per engine, scene-level disposal, and asset containers for modular loading. This reference covers scene lifecycle, multi-scene rendering, game state machines, and asset management patterns essential for games with menus, levels, cutscenes, and loading screens.

---

## Scene Lifecycle

A `Scene` in Babylon.js is the top-level container for all meshes, lights, cameras, materials, and systems. One `Engine` can manage multiple scenes.

```typescript
import { Engine, Scene } from "@babylonjs/core";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const engine = new Engine(canvas, true);

const scene = new Scene(engine);

// Scene is ready when all pending assets have loaded
scene.executeWhenReady(() => {
  console.log("Scene ready — all textures, meshes compiled");
});

// Disposal: frees all GPU resources owned by this scene
scene.dispose();
```

**Key lifecycle events:**

| Event | When it fires | Use case |
|-------|--------------|----------|
| `scene.onReadyObservable` | All pending loads + shader compilations done | Remove loading screen |
| `scene.onBeforeRenderObservable` | Before each frame render | Game logic updates |
| `scene.onAfterRenderObservable` | After each frame render | Debug overlays, analytics |
| `scene.onDisposeObservable` | Scene is being disposed | Cleanup external resources |
| `scene.onBeforeAnimationsObservable` | Before animations are evaluated | Override animation state |

---

## Multi-Scene Rendering

Render multiple scenes in a single frame — common for UI layers, minimaps, or split-screen.

```typescript
import { Engine, Scene, ArcRotateCamera, HemisphericLight, Vector3 } from "@babylonjs/core";

const engine = new Engine(canvas, true);

// Game world scene
const gameScene = new Scene(engine);
const gameCamera = new ArcRotateCamera("cam", 0, 1, 10, Vector3.Zero(), gameScene);
new HemisphericLight("light", new Vector3(0, 1, 0), gameScene);

// UI overlay scene (renders on top)
const uiScene = new Scene(engine);
uiScene.autoClear = false; // don't clear color buffer — keep game scene visible

// Render both scenes each frame
engine.runRenderLoop(() => {
  gameScene.render();
  uiScene.render();  // renders on top because autoClear is false
});
```

**Multi-scene rules:**
- The first scene should have `autoClear = true` (default) to clear the frame buffer.
- Subsequent scenes set `autoClear = false` to composite on top.
- Each scene has its own camera, lights, and materials — they are **not** shared.
- `engine.scenes` contains all registered scenes. Disposing a scene removes it from this array.

---

## Game State Machine Pattern

A state machine manages transitions between game states (menu, gameplay, cutscene, game over). Each state owns a Babylon.js scene.

```typescript
import { Engine, Scene } from "@babylonjs/core";

// State interface
interface GameState {
  name: string;
  scene: Scene;
  enter(): Promise<void>;
  exit(): void;
  update(): void;
}

class GameStateMachine {
  private currentState: GameState | null = null;
  private states = new Map<string, GameState>();

  constructor(private engine: Engine) {}

  register(state: GameState) {
    this.states.set(state.name, state);
  }

  async switchTo(stateName: string) {
    const next = this.states.get(stateName);
    if (!next) throw new Error(`Unknown state: ${stateName}`);

    // Exit current state
    if (this.currentState) {
      this.currentState.exit();
    }

    this.currentState = next;
    await next.enter();

    // Update the render loop to render the new scene
    this.engine.stopRenderLoop();
    this.engine.runRenderLoop(() => {
      if (this.currentState) {
        this.currentState.update();
        this.currentState.scene.render();
      }
    });
  }
}
```

### Concrete State Example: Main Menu

```typescript
import { Scene, FreeCamera, Vector3, MeshBuilder } from "@babylonjs/core";
import { AdvancedDynamicTexture, Button, StackPanel, TextBlock } from "@babylonjs/gui";

class MainMenuState implements GameState {
  name = "mainMenu";
  scene: Scene;
  private gui!: AdvancedDynamicTexture;

  constructor(private engine: Engine, private fsm: GameStateMachine) {
    this.scene = new Scene(engine);
  }

  async enter() {
    // Camera (required even for a 2D menu — Babylon.js scenes need an active camera)
    const camera = new FreeCamera("menuCam", new Vector3(0, 0, -10), this.scene);

    // Full-screen GUI
    this.gui = AdvancedDynamicTexture.CreateFullscreenUI("menuUI", true, this.scene);

    const panel = new StackPanel();
    panel.width = "300px";
    panel.horizontalAlignment = 2; // center
    panel.verticalAlignment = 2;   // center
    this.gui.addControl(panel);

    const title = new TextBlock();
    title.text = "My Game";
    title.fontSize = 48;
    title.color = "white";
    title.height = "80px";
    panel.addControl(title);

    const playBtn = Button.CreateSimpleButton("play", "Play");
    playBtn.width = "200px";
    playBtn.height = "50px";
    playBtn.color = "white";
    playBtn.background = "#4caf50";
    playBtn.onPointerUpObservable.add(() => {
      this.fsm.switchTo("gameplay");
    });
    panel.addControl(playBtn);
  }

  exit() {
    this.gui.dispose();
    this.scene.dispose();
    // Re-create for next entry (or keep alive if frequently revisited)
    this.scene = new Scene(this.engine);
  }

  update() {
    // Menu animations, background effects, etc.
  }
}
```

### Concrete State Example: Gameplay

```typescript
import { Scene, ArcRotateCamera, HemisphericLight, Vector3, MeshBuilder } from "@babylonjs/core";
import "@babylonjs/loaders/glTF";

class GameplayState implements GameState {
  name = "gameplay";
  scene: Scene;

  constructor(private engine: Engine, private fsm: GameStateMachine) {
    this.scene = new Scene(engine);
  }

  async enter() {
    const camera = new ArcRotateCamera("cam", 0, 1, 10, Vector3.Zero(), this.scene);
    camera.attachControl(this.engine.getRenderingCanvas()!, true);
    new HemisphericLight("light", new Vector3(0, 1, 0), this.scene);

    // Load level assets
    const { SceneLoader } = await import("@babylonjs/core");
    await SceneLoader.AppendAsync("/assets/", "level1.glb", this.scene);

    // Physics, game logic setup...
  }

  exit() {
    this.scene.dispose();
    this.scene = new Scene(this.engine);
  }

  update() {
    // Game tick: physics, AI, input processing
  }
}
```

### Wiring it together

```typescript
const engine = new Engine(canvas, true);
const fsm = new GameStateMachine(engine);

fsm.register(new MainMenuState(engine, fsm));
fsm.register(new GameplayState(engine, fsm));

// Start at main menu
fsm.switchTo("mainMenu");

window.addEventListener("resize", () => engine.resize());
```

---

## AssetContainer for Level Streaming

`AssetContainer` loads assets into a detached container, not directly into the scene. You can add or remove the container's contents on demand — perfect for level streaming and pooling.

```typescript
import { SceneLoader, AssetContainer } from "@babylonjs/core";
import "@babylonjs/loaders/glTF";

// Load into a container (not the active scene)
const container: AssetContainer = await SceneLoader.LoadAssetContainerAsync(
  "/assets/",
  "environment.glb",
  scene
);

// Add all assets to the scene when ready
container.addAllToScene();

// Remove from scene (assets stay in memory for re-use)
container.removeAllFromScene();

// Full disposal — frees GPU resources
container.dispose();
```

**AssetContainer tips:**
- Use `container.meshes`, `container.materials`, `container.textures` to inspect loaded assets.
- Call `container.removeAllFromScene()` before switching levels, then `dispose()` if the level won't be revisited.
- **Shared material gotcha:** if two containers reference the same texture file, disposing one container may dispose the shared texture. Use `keepAssets` or manage shared materials separately.
- `container.instantiateModelsToScene()` creates clones — useful for spawning multiple copies of a loaded prefab.

---

## Loading Screen Pattern

Show a loading screen during scene transitions.

```typescript
import { ILoadingScreen } from "@babylonjs/core";

class CustomLoadingScreen implements ILoadingScreen {
  loadingUIText = "Loading...";
  loadingUIBackgroundColor = "#1a1a2e";
  private overlay: HTMLDivElement;

  constructor() {
    this.overlay = document.createElement("div");
    this.overlay.id = "loading-screen";
    this.overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 100;
      display: flex; align-items: center; justify-content: center;
      background: ${this.loadingUIBackgroundColor};
      color: white; font-size: 24px; font-family: sans-serif;
    `;
  }

  displayLoadingUI() {
    this.overlay.textContent = this.loadingUIText;
    document.body.appendChild(this.overlay);
  }

  hideLoadingUI() {
    this.overlay.remove();
  }
}

// Apply to the engine
engine.loadingScreen = new CustomLoadingScreen();

// Babylon.js will automatically call displayLoadingUI / hideLoadingUI
// during SceneLoader operations. You can also call them manually:
engine.displayLoadingUI();
// ... load assets ...
engine.hideLoadingUI();
```

---

## Scene Optimization During Transitions

When switching scenes, optimize the transition to avoid frame drops.

```typescript
// Freeze the outgoing scene to reduce CPU work during transition
function freezeScene(scene: Scene) {
  scene.freezeActiveMeshes();       // stop re-evaluating active mesh list
  scene.freezeMaterials();           // stop checking material dirty flags
  scene.blockMaterialDirtyMechanism = true;
}

// Before disposing, unfreeze to allow proper cleanup
function unfreezeAndDispose(scene: Scene) {
  scene.unfreezeActiveMeshes();
  scene.unfreezeMaterials();
  scene.blockMaterialDirtyMechanism = false;
  scene.dispose();
}
```

**Disposal checklist:**
1. Stop the render loop or remove the scene from it.
2. Detach camera controls (`camera.detachControl()`).
3. Dispose GUI textures (`advancedTexture.dispose()`).
4. Call `scene.dispose()` — this recursively disposes meshes, materials, textures, lights, and cameras.
5. Nullify references to allow GC to collect any remaining JS objects.

---

## Performance Considerations

| Concern | Recommendation |
|---------|---------------|
| Scene switch latency | Pre-load the next scene's `AssetContainer` while the current scene is still active |
| Memory spikes | Dispose the old scene before adding new assets, or use `AssetContainer.removeAllFromScene()` first |
| Shared assets | Use a persistent "core" scene for shared assets (skybox, player model) with `autoClear = false` |
| GPU memory | Call `engine.clearInternalTexturesCache()` after disposing large scenes |
| Mobile | Limit to 2 active scenes max; mobile GPUs have tight memory budgets |

---

## WebGPU Notes

Scene management APIs work identically with `WebGPUEngine`. Key differences:

- Use `import { WebGPUEngine } from "@babylonjs/core"` and `await engine.initAsync()` before creating scenes.
- Shader compilation is asynchronous in WebGPU — `scene.executeWhenReady()` accounts for this automatically.
- `AssetContainer` and disposal patterns are unchanged.
- Multi-scene rendering composites the same way — `autoClear` controls the WebGPU command encoder's load operation.
