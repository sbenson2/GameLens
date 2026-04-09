# React Three Fiber (R3F) Game Development Patterns

> **Category:** reference · **Engine:** Three.js r160+ · **Related:** [Physics (Rapier)](../guides/G1_physics_rapier.md), [Animation System](../guides/G8_animation_system.md), [Input Handling](../guides/G7_input_handling.md)

React Three Fiber (R3F) is a React renderer for Three.js maintained by pmndrs. It maps Three.js objects to JSX components, giving you declarative scene composition, React's component lifecycle, and access to the full npm ecosystem. R3F does not abstract away Three.js — every Three.js class is available as a camelCase JSX element (e.g., `<meshStandardMaterial>`, `<ambientLight>`).

---

## Ecosystem Overview

| Package | Purpose | Install |
|---------|---------|---------|
| `@react-three/fiber` | Core renderer — Canvas, hooks, reconciler | `npm i @react-three/fiber three` |
| `@react-three/drei` | 150+ helper components (controls, loaders, shaders, abstractions) | `npm i @react-three/drei` |
| `@react-three/rapier` | Rapier physics via WASM — rigid bodies, colliders, joints | `npm i @react-three/rapier` |
| `@react-three/postprocessing` | Post-processing effects (bloom, SSAO, vignette) | `npm i @react-three/postprocessing` |
| `@react-three/xr` | WebXR support (VR/AR controllers, hands, teleport) | `npm i @react-three/xr` |
| `gltfjsx` | CLI that converts glTF models into typed R3F JSX components | `npx gltfjsx model.glb --types` |

---

## Canvas Setup

The `<Canvas>` component creates a WebGL (or WebGPU) renderer, scene, and camera. All R3F hooks must be called inside a component that is a child of `<Canvas>`.

```tsx
import { Canvas } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { KeyboardControls } from "@react-three/drei";

// Define keyboard map outside the component to avoid re-renders
const keyboardMap = [
  { name: "forward", keys: ["KeyW", "ArrowUp"] },
  { name: "backward", keys: ["KeyS", "ArrowDown"] },
  { name: "left", keys: ["KeyA", "ArrowLeft"] },
  { name: "right", keys: ["KeyD", "ArrowRight"] },
  { name: "jump", keys: ["Space"] },
];

export default function Game() {
  return (
    <KeyboardControls map={keyboardMap}>
      <Canvas
        shadows
        camera={{ position: [0, 5, 10], fov: 50 }}
        // Optional: WebGPU renderer (Three.js r160+)
        // gl={(canvas) => new WebGPURenderer({ canvas })}
      >
        <ambientLight intensity={0.4} />
        <directionalLight position={[10, 10, 5]} castShadow />

        {/* Wrap physics objects in Suspense — Rapier WASM loads lazily */}
        <Suspense fallback={null}>
          <Physics gravity={[0, -9.81, 0]} debug={false}>
            <Player />
            <Level />
          </Physics>
        </Suspense>
      </Canvas>
    </KeyboardControls>
  );
}
```

**Performance note:** `<Canvas>` creates its own React root. State shared between the 3D scene and the HTML UI should live in a store outside both trees (e.g., Zustand).

---

## Core Hooks

### useFrame — The Game Loop

`useFrame` runs every frame before render. Use it for movement, AI ticks, and per-frame logic.

```tsx
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import * as THREE from "three";

function RotatingCube() {
  const meshRef = useRef<THREE.Mesh>(null!);

  // state = { clock, camera, scene, gl, size, viewport, ... }
  // delta = seconds since last frame (use for framerate-independent movement)
  useFrame((state, delta) => {
    meshRef.current.rotation.y += delta * 1.5;

    // Example: bob up and down using elapsed time
    meshRef.current.position.y = Math.sin(state.clock.elapsedTime) * 0.5;
  });

  return (
    <mesh ref={meshRef}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="royalblue" />
    </mesh>
  );
}
```

**Key rules:**
- Always multiply movement by `delta` for framerate independence.
- Never call `setState` inside `useFrame` — it triggers a React re-render every frame (60+ times/sec). Use refs or an external store (Zustand) for mutable game state.
- Use the optional `renderPriority` parameter to control execution order when you have multiple `useFrame` subscribers (lower runs first).

### useThree — Access Renderer State

```tsx
import { useThree } from "@react-three/fiber";

function Raycaster() {
  const { camera, gl, scene, size, viewport } = useThree();

  // size = canvas pixel dimensions { width, height }
  // viewport = Three.js world units at z=0 { width, height, factor }
  // gl = the WebGLRenderer instance
}
```

### useLoader — Asset Loading with Suspense

```tsx
import { useLoader } from "@react-three/fiber";
import { TextureLoader } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

function Terrain() {
  const texture = useLoader(TextureLoader, "/textures/grass.jpg");
  const gltf = useLoader(GLTFLoader, "/models/terrain.glb");

  return <primitive object={gltf.scene} />;
}

// Wrap in Suspense for loading fallback
<Suspense fallback={<LoadingScreen />}>
  <Terrain />
</Suspense>
```

**Prefer `useGLTF` from drei** — it sets up Draco/meshopt decompression automatically:

```tsx
import { useGLTF } from "@react-three/drei";

function Character() {
  const { scene, animations } = useGLTF("/models/character.glb");
  return <primitive object={scene} />;
}

// Preload to start fetching before mount
useGLTF.preload("/models/character.glb");
```

---

## Physics with @react-three/rapier

Rapier runs in WebAssembly (Rust-compiled). `@react-three/rapier` wraps it in declarative React components.

```tsx
import { Physics, RigidBody, CuboidCollider } from "@react-three/rapier";
import { useKeyboardControls } from "@react-three/drei";
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { RapierRigidBody } from "@react-three/rapier";

function Player() {
  const bodyRef = useRef<RapierRigidBody>(null!);
  const [, getKeys] = useKeyboardControls();

  useFrame(() => {
    const { forward, backward, left, right, jump } = getKeys();
    const impulse = { x: 0, y: 0, z: 0 };
    const speed = 0.4;

    if (forward) impulse.z -= speed;
    if (backward) impulse.z += speed;
    if (left) impulse.x -= speed;
    if (right) impulse.x += speed;

    bodyRef.current.applyImpulse(impulse, true);

    // Jump — only when grounded (check velocity near zero)
    if (jump) {
      const vel = bodyRef.current.linvel();
      if (Math.abs(vel.y) < 0.05) {
        bodyRef.current.applyImpulse({ x: 0, y: 5, z: 0 }, true);
      }
    }
  });

  return (
    <RigidBody ref={bodyRef} colliders="ball" mass={1} linearDamping={0.5}>
      <mesh castShadow>
        <sphereGeometry args={[0.5, 32, 32]} />
        <meshStandardMaterial color="orange" />
      </mesh>
    </RigidBody>
  );
}

function Ground() {
  return (
    <RigidBody type="fixed">
      <mesh receiveShadow>
        <boxGeometry args={[50, 0.5, 50]} />
        <meshStandardMaterial color="limegreen" />
      </mesh>
    </RigidBody>
  );
}
```

### Collider Types

| Collider | When to Use |
|----------|-------------|
| `colliders="cuboid"` | Boxes, walls, platforms — auto-generated from geometry |
| `colliders="ball"` | Spheres, projectiles |
| `colliders="hull"` | Convex shapes — decent fit for most props |
| `colliders="trimesh"` | Concave level geometry — expensive, use only for static bodies |
| `colliders={false}` | Manual — add `<CuboidCollider>`, `<BallCollider>`, etc. as children |

### Sensor Colliders (Triggers)

```tsx
<CuboidCollider
  args={[2, 2, 2]}
  sensor
  onIntersectionEnter={({ other }) => {
    console.log("Entered zone:", other.rigidBodyObject?.name);
  }}
  onIntersectionExit={() => {
    console.log("Left zone");
  }}
/>
```

---

## Useful Drei Components for Games

| Component | Use Case |
|-----------|----------|
| `<OrbitControls>` | Debug camera, spectator mode |
| `<PointerLockControls>` | FPS camera (locks mouse) |
| `<KeyboardControls>` | Declarative input mapping (see Canvas setup above) |
| `<Environment preset="sunset">` | Image-based lighting (IBL) in one line |
| `<Sky>` / `<Stars>` | Procedural skyboxes |
| `<Text>` / `<Text3D>` | In-world text (SDF via troika / extruded geometry) |
| `<Billboard>` | Always faces camera (nameplates, damage numbers) |
| `<Instances>` / `<Merged>` | GPU instancing for repeated meshes (forests, crowds) |
| `<useAnimations>` | Play/crossfade glTF animations |
| `<Float>` / `<MeshWobbleMaterial>` | Quick visual polish (floating items, wobbly effects) |
| `<Bvh>` | Wraps children in a BVH for faster raycasting |
| `<PerformanceMonitor>` | Auto-adjusts quality tier based on FPS |

---

## State Management Pattern (Zustand)

R3F games commonly use Zustand for shared state because it works outside the React tree and avoids re-render overhead.

```tsx
import { create } from "zustand";

interface GameState {
  health: number;
  score: number;
  phase: "menu" | "playing" | "gameover";
  takeDamage: (amount: number) => void;
  addScore: (points: number) => void;
  reset: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  health: 100,
  score: 0,
  phase: "menu",
  takeDamage: (amount) =>
    set((s) => {
      const newHealth = Math.max(0, s.health - amount);
      return {
        health: newHealth,
        phase: newHealth <= 0 ? "gameover" : s.phase,
      };
    }),
  addScore: (points) => set((s) => ({ score: s.score + points })),
  reset: () => set({ health: 100, score: 0, phase: "playing" }),
}));

// Inside useFrame — read without triggering re-renders:
useFrame(() => {
  const health = useGameStore.getState().health;
  // update visuals based on health...
});

// In React components — subscribe reactively:
function HUD() {
  const score = useGameStore((s) => s.score);
  return <div className="hud">Score: {score}</div>;
}
```

---

## Performance Checklist

1. **Never setState in useFrame.** Use refs for mutable 3D state, Zustand for game state. React re-renders are expensive at 60fps.
2. **Instancing.** Use `<Instances>` or `<InstancedMesh>` for repeated objects (coins, enemies, trees). A forest of 10,000 trees = 1 draw call.
3. **Preload assets.** Call `useGLTF.preload()` and `useTexture.preload()` at module scope for critical assets.
4. **Dispose correctly.** R3F auto-disposes geometries and materials when components unmount, but call `.dispose()` on manually created resources.
5. **PerformanceMonitor.** Use drei's `<PerformanceMonitor>` to dynamically reduce shadow map resolution, disable post-processing, or lower pixel ratio when FPS drops.
6. **Avoid re-creating objects.** Define geometries and materials outside `useFrame`. Use `useMemo` for computed Three.js objects.
7. **BVH for raycasting.** Wrap complex scenes in `<Bvh>` from drei to accelerate pointer events and raycasts.
8. **Selective invalidation.** For non-realtime scenes (e.g., turn-based), set `<Canvas frameloop="demand">` and call `invalidate()` only when the scene changes.

---

## Project Structure (Recommended)

```
src/
├── components/
│   ├── Player.tsx        # RigidBody + mesh + useFrame movement
│   ├── Level.tsx          # Static level geometry
│   ├── Enemy.tsx          # AI + physics + health
│   └── Effects.tsx        # Post-processing stack
├── stores/
│   └── gameStore.ts       # Zustand store (health, score, phase)
├── hooks/
│   └── usePlayerControls.ts  # Custom hook wrapping KeyboardControls
├── models/                # .glb files + auto-generated JSX (gltfjsx)
├── Game.tsx               # Canvas + Physics + Suspense
└── App.tsx                # HTML UI (HUD, menus) + Game
```

**Key principle:** HTML UI lives outside `<Canvas>` in regular React. 3D game logic lives inside `<Canvas>`. They communicate through Zustand.
