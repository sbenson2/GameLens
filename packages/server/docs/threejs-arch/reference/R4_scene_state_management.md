# Scene & State Management for Games

> **Category:** reference · **Engine:** Three.js · **Related:** [G6 Optimization & Performance](../guides/G6_optimization_performance.md), [E1 Architecture Overview](../architecture/E1_architecture_overview.md)

Three.js provides no built-in game state machine or scene lifecycle. Game developers must implement their own patterns for managing game states (menus, gameplay, pause, cutscenes), transitioning between scenes, and — critically — cleaning up WebGL resources to prevent memory leaks. This reference covers production-ready patterns for all three concerns.

---

## Game Loop Architecture

Three.js exposes a single animation loop via `renderer.setAnimationLoop()`. For games, wrap this in a structured loop that delegates to the active state:

```typescript
import * as THREE from "three";

interface GameState {
  name: string;
  enter(context: GameContext): void;
  exit(context: GameContext): void;
  update(dt: number, context: GameContext): void;
  render(renderer: THREE.WebGLRenderer): void;
}

interface GameContext {
  renderer: THREE.WebGLRenderer;
  stateMachine: StateMachine;
  assets: Map<string, any>;
}

class GameLoop {
  private clock = new THREE.Clock();
  private context: GameContext;

  constructor(
    private renderer: THREE.WebGLRenderer,
    private stateMachine: StateMachine
  ) {
    this.context = {
      renderer,
      stateMachine,
      assets: new Map(),
    };
  }

  start(): void {
    this.renderer.setAnimationLoop(() => {
      const dt = this.clock.getDelta();
      this.stateMachine.update(dt, this.context);
      this.stateMachine.render(this.renderer);
    });
  }

  stop(): void {
    this.renderer.setAnimationLoop(null);
  }
}
```

> **Why `setAnimationLoop` over `requestAnimationFrame`?** It automatically pauses when the tab is hidden (saving GPU), handles WebXR sessions, and centralises the frame callback in one place.

---

## Finite State Machine

A lightweight FSM lets you swap entire game phases without conditional spaghetti:

```typescript
class StateMachine {
  private current: GameState | null = null;
  private states = new Map<string, GameState>();

  register(state: GameState): void {
    this.states.set(state.name, state);
  }

  transition(name: string, context: GameContext): void {
    const next = this.states.get(name);
    if (!next) throw new Error(`Unknown state: ${name}`);

    this.current?.exit(context);
    this.current = next;
    this.current.enter(context);
  }

  update(dt: number, context: GameContext): void {
    this.current?.update(dt, context);
  }

  render(renderer: THREE.WebGLRenderer): void {
    this.current?.render(renderer);
  }
}
```

### Example States

```typescript
class MenuState implements GameState {
  name = "menu";
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(/* ... */);
  private tracker = new ResourceTracker();

  enter(ctx: GameContext): void {
    const track = this.tracker.track.bind(this.tracker);
    const bg = track(new THREE.Mesh(
      track(new THREE.PlaneGeometry(2, 2)),
      track(new THREE.MeshBasicMaterial({ color: 0x1a1a2e }))
    ));
    this.scene.add(bg);
  }

  exit(_ctx: GameContext): void {
    this.tracker.dispose(); // free all GPU resources
  }

  update(_dt: number, ctx: GameContext): void {
    // Check for "play" input → ctx.stateMachine.transition("gameplay", ctx);
  }

  render(renderer: THREE.WebGLRenderer): void {
    renderer.render(this.scene, this.camera);
  }
}

class GameplayState implements GameState {
  name = "gameplay";
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(60, /* ... */);
  private tracker = new ResourceTracker();

  enter(ctx: GameContext): void {
    // Load level, set up lights, physics world, etc.
  }

  exit(ctx: GameContext): void {
    this.tracker.dispose();
  }

  update(dt: number, ctx: GameContext): void {
    // Game logic, physics step, entity updates
  }

  render(renderer: THREE.WebGLRenderer): void {
    renderer.render(this.scene, this.camera);
  }
}
```

---

## Resource Tracking & Disposal

Three.js allocates WebGL buffers, textures, and shader programs that the JavaScript garbage collector **cannot** reclaim. You must dispose them manually when switching scenes or unloading assets.

### ResourceTracker Pattern

The official Three.js manual recommends a tracker class that follows the object graph:

```typescript
class ResourceTracker {
  private resources = new Set<{ dispose?: () => void } | THREE.Object3D>();

  track<T>(resource: T): T {
    if (!resource) return resource;

    if (Array.isArray(resource)) {
      resource.forEach((r) => this.track(r));
      return resource;
    }

    const r = resource as any;

    if (r.dispose || r instanceof THREE.Object3D) {
      this.resources.add(r);
    }

    if (r instanceof THREE.Object3D) {
      this.track(r.geometry);
      this.track(r.material);
      this.track(r.children);
    } else if (r instanceof THREE.Material) {
      // Chase every texture property on the material
      for (const value of Object.values(r)) {
        if (value instanceof THREE.Texture) {
          this.track(value);
        }
      }
      // Also chase textures inside shader uniforms
      if (r.uniforms) {
        for (const uniform of Object.values(r.uniforms)) {
          const uVal = (uniform as any)?.value;
          if (uVal instanceof THREE.Texture || Array.isArray(uVal)) {
            this.track(uVal);
          }
        }
      }
    }

    return resource;
  }

  dispose(): void {
    for (const resource of this.resources) {
      if (resource instanceof THREE.Object3D && resource.parent) {
        resource.parent.remove(resource);
      }
      if ((resource as any).dispose) {
        (resource as any).dispose();
      }
    }
    this.resources.clear();
  }
}
```

### What Must Be Disposed

| Resource | Why | Memory Impact |
|----------|-----|---------------|
| `BufferGeometry` | Vertex/index buffers on GPU | Proportional to vertex count |
| `Texture` | GPU texture memory | 4–6 MB per 1024×1024 (uncompressed) |
| `Material` | Compiled shader programs | Moderate (shader cache) |
| `RenderTarget` | Framebuffer objects | Same as texture + depth buffer |
| `Scene` | Releases internal caches | Frees environment map refs |

### Disposal Checklist for Scene Transitions

1. **Stop references** — remove event listeners, cancel tweens, stop audio.
2. **Dispose tracked resources** — call `tracker.dispose()`.
3. **Clear renderer state** — `renderer.renderLists.dispose()` if switching scene objects entirely.
4. **Nullify references** — allow JS GC to collect wrapper objects.

> **Caution:** Never dispose the `WebGLRenderer` itself unless you are fully shutting down. Creating a new renderer is expensive and can trigger context-loss on some devices.

---

## Scene Transition Effects

For smooth transitions (fades, wipes), render both the outgoing and incoming scenes to render targets, then blend:

```typescript
class TransitionManager {
  private rtA: THREE.WebGLRenderTarget;
  private rtB: THREE.WebGLRenderTarget;
  private quad: THREE.Mesh;
  private progress = 0;

  constructor(width: number, height: number) {
    this.rtA = new THREE.WebGLRenderTarget(width, height);
    this.rtB = new THREE.WebGLRenderTarget(width, height);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        tA: { value: this.rtA.texture },
        tB: { value: this.rtB.texture },
        progress: { value: 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D tA;
        uniform sampler2D tB;
        uniform float progress;
        varying vec2 vUv;
        void main() {
          gl_FragColor = mix(texture2D(tA, vUv), texture2D(tB, vUv), progress);
        }
      `,
    });

    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  }

  render(
    renderer: THREE.WebGLRenderer,
    sceneA: THREE.Scene, camA: THREE.Camera,
    sceneB: THREE.Scene, camB: THREE.Camera,
    t: number
  ): void {
    renderer.setRenderTarget(this.rtA);
    renderer.render(sceneA, camA);

    renderer.setRenderTarget(this.rtB);
    renderer.render(sceneB, camB);

    renderer.setRenderTarget(null);
    (this.quad.material as THREE.ShaderMaterial).uniforms.progress.value = t;
    const orthoScene = new THREE.Scene();
    orthoScene.add(this.quad);
    const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    renderer.render(orthoScene, orthoCam);
  }

  dispose(): void {
    this.rtA.dispose();
    this.rtB.dispose();
    (this.quad.material as THREE.Material).dispose();
    this.quad.geometry.dispose();
  }
}
```

---

## Performance Notes

- **One renderer, many scenes.** Creating multiple `WebGLRenderer` instances is almost never correct. Share a single renderer and swap which `Scene` + `Camera` you pass to `render()`.
- **Texture memory dominates.** A single 2048×2048 RGBA texture consumes ~16 MB of VRAM. Track and dispose aggressively during scene transitions.
- **Use `renderer.info`** to monitor live geometry/texture counts during development:
  ```typescript
  console.log(renderer.info.memory); // { geometries, textures }
  console.log(renderer.info.render); // { calls, triangles, points, lines }
  ```
- **Mobile GPU limits.** Many mobile GPUs cap VRAM at 256–512 MB. Scenes with untracked textures can cause context loss (`webglcontextlost` event) with no recovery path.
- **WebGPU renderer** (`THREE.WebGPURenderer`) follows the same `setAnimationLoop` / `render(scene, camera)` API, so these state management patterns transfer directly.
