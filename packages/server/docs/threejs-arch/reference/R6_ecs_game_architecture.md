# ECS & Game Architecture Patterns

> **Category:** reference · **Engine:** Three.js · **Related:** [R4_scene_state_management.md](R4_scene_state_management.md), [R2_react_three_fiber.md](R2_react_three_fiber.md)

Three.js provides rendering primitives but no built-in game architecture. For anything beyond a demo, you need a pattern that separates data from logic and scales to thousands of objects. The Entity-Component-System (ECS) pattern is the dominant choice in the web-3D ecosystem, with two major libraries: **bitECS** (performance-first, SoA) and **Miniplex** (developer-experience-first, plain objects).

## Why ECS for Three.js Games

Traditional Three.js projects use class inheritance (`class Enemy extends THREE.Mesh`) which creates rigid hierarchies and tightly couples rendering to gameplay logic. ECS inverts this — entities are IDs (or plain objects), components hold data, and systems hold logic. This gives you composition over inheritance, cache-friendly iteration over large entity sets, and easy hot-reloading of individual systems during development.

## bitECS — High-Performance SoA Architecture

bitECS stores component data in typed arrays using a Structure-of-Arrays (SoA) layout, which keeps memory contiguous for CPU-cache-friendly iteration. It targets scenarios with thousands of entities (NPCs, particles, projectiles).

### Core Concepts

```typescript
import { createWorld, addEntity, addComponent, defineComponent, defineQuery, Types } from 'bitecs';
import * as THREE from 'three';

// 1. Define components as SoA typed-array schemas
const Position = defineComponent({
  x: Types.f32,
  y: Types.f32,
  z: Types.f32,
});

const Velocity = defineComponent({
  x: Types.f32,
  y: Types.f32,
  z: Types.f32,
});

const Health = defineComponent({
  current: Types.f32,
  max: Types.f32,
});

const MeshRef = defineComponent({
  // Store index into a lookup table — bitECS components hold numbers only
  index: Types.ui32,
});

// 2. Create a world (the ECS container)
const world = createWorld();

// 3. Define queries to find entities by component composition
const movementQuery = defineQuery([Position, Velocity]);
const renderQuery = defineQuery([Position, MeshRef]);
```

### Systems

Systems are plain functions. They query entities and operate on component arrays:

```typescript
// Lookup table: entity mesh index → THREE.Object3D
const meshLookup: THREE.Object3D[] = [];

function movementSystem(world: any, dt: number): void {
  const entities = movementQuery(world);
  for (let i = 0; i < entities.length; i++) {
    const eid = entities[i];
    Position.x[eid] += Velocity.x[eid] * dt;
    Position.y[eid] += Velocity.y[eid] * dt;
    Position.z[eid] += Velocity.z[eid] * dt;
  }
}

function renderSyncSystem(world: any): void {
  const entities = renderQuery(world);
  for (let i = 0; i < entities.length; i++) {
    const eid = entities[i];
    const mesh = meshLookup[MeshRef.index[eid]];
    if (mesh) {
      mesh.position.set(Position.x[eid], Position.y[eid], Position.z[eid]);
    }
  }
}
```

### Game Loop Integration

```typescript
const clock = new THREE.Clock();

function gameLoop(): void {
  requestAnimationFrame(gameLoop);
  const dt = clock.getDelta();

  // Run systems in order
  movementSystem(world, dt);
  renderSyncSystem(world);

  renderer.render(scene, camera);
}
```

### Spawning Entities

```typescript
function spawnEnemy(scene: THREE.Scene, x: number, y: number, z: number): number {
  const eid = addEntity(world);

  addComponent(world, Position, eid);
  Position.x[eid] = x;
  Position.y[eid] = y;
  Position.z[eid] = z;

  addComponent(world, Velocity, eid);
  addComponent(world, Health, eid);
  Health.current[eid] = 100;
  Health.max[eid] = 100;

  // Create Three.js mesh and store reference
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0xff0000 })
  );
  mesh.position.set(x, y, z);
  scene.add(mesh);

  addComponent(world, MeshRef, eid);
  MeshRef.index[eid] = meshLookup.length;
  meshLookup.push(mesh);

  return eid;
}
```

### When to Use bitECS

- Bullet-hell or particle-heavy games (10,000+ entities)
- Simulation-style games (colonies, ecosystems, traffic)
- Any scenario where iteration performance matters more than ergonomics
- Data-oriented design: components are numbers only (no strings, no object refs in component arrays)

### Limitations

- Components only hold numeric types — reference types (meshes, strings) must use a lookup table
- No built-in serialization
- The Three.js ↔ ECS bridge (mesh lookup sync) is manual work you must maintain

## Miniplex — Developer-Friendly Entity Management

Miniplex takes a different approach: entities are plain JavaScript/TypeScript objects, components can hold any data type, and there is no built-in system scheduler. It integrates naturally with React Three Fiber.

### Core Concepts

```typescript
import { World } from 'miniplex';
import * as THREE from 'three';

// 1. Define entity shape with TypeScript
type Entity = {
  position: THREE.Vector3;
  velocity?: THREE.Vector3;
  health?: { current: number; max: number };
  mesh?: THREE.Mesh;
  isEnemy?: true; // Tags are just boolean-ish properties
};

// 2. Create the world
const world = new World<Entity>();

// 3. Create archetypes (cached queries)
const enemies = world.with('isEnemy', 'position', 'velocity', 'health');
const renderables = world.with('position', 'mesh');
```

### Adding Entities

```typescript
function spawnEnemy(scene: THREE.Scene, pos: THREE.Vector3): Entity {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.5),
    new THREE.MeshStandardMaterial({ color: 0xff4444 })
  );
  scene.add(mesh);

  // Entities are just objects — add any data you want
  return world.add({
    position: pos.clone(),
    velocity: new THREE.Vector3(
      (Math.random() - 0.5) * 2,
      0,
      (Math.random() - 0.5) * 2
    ),
    health: { current: 100, max: 100 },
    mesh,
    isEnemy: true,
  });
}
```

### Systems as Plain Functions

```typescript
function movementSystem(dt: number): void {
  for (const entity of enemies) {
    entity.position.addScaledVector(entity.velocity!, dt);
  }
}

function renderSyncSystem(): void {
  for (const entity of renderables) {
    entity.mesh!.position.copy(entity.position);
  }
}
```

### React Three Fiber Integration

Miniplex provides `miniplex-react` for declarative entity management in R3F:

```tsx
import { createReactAPI } from 'miniplex-react';

const ECS = createReactAPI(world);

function EnemyRenderer() {
  return (
    <ECS.Entities in={enemies}>
      {(entity) => (
        <mesh position={entity.position}>
          <sphereGeometry args={[0.5]} />
          <meshStandardMaterial color="red" />
        </mesh>
      )}
    </ECS.Entities>
  );
}
```

### When to Use Miniplex

- React Three Fiber projects (first-class React integration)
- Small-to-medium entity counts (hundreds to low thousands)
- Rapid prototyping where developer ergonomics matter
- Projects that need complex component data (objects, class instances, references)

## Choosing Between bitECS and Miniplex

| Concern | bitECS | Miniplex |
|---------|--------|----------|
| Entity scale | 10,000+ | Hundreds to ~2,000 |
| Component types | Numbers only (SoA) | Any JS value |
| Three.js bridge | Manual lookup table | Direct mesh refs on entity |
| React integration | Manual or community wrappers | First-class `miniplex-react` |
| Scheduling | You build the loop | You build the loop |
| TypeScript DX | Schema-based definitions | Interface-based, full type inference |
| Bundle size | ~5 KB | ~3 KB |

## Hybrid Approaches

For larger games, combine both patterns:

- **bitECS for hot-path systems** (physics, spatial queries, AI ticking) where SoA iteration speed matters
- **Miniplex for gameplay entities** (player, NPCs, items) where rich component data and React integration are useful
- **Plain Three.js objects for static scenery** — not everything needs to be an entity

## Performance Considerations

- **bitECS**: SoA layout means iterating 10,000 positions touches contiguous memory. Expect 60fps with 10K+ active entities on modern hardware. The bottleneck shifts to Three.js draw calls, not ECS logic.
- **Miniplex**: Object-based entities are heap-allocated and scattered in memory. Fine for hundreds of entities but iteration cost grows non-linearly past ~2,000 active entities per frame.
- **Both**: Systems should run before `renderer.render()` each frame. Keep render-sync systems (ECS → Three.js) as the last step to avoid stale-frame artifacts.
- **Garbage collection**: bitECS produces zero GC pressure during iteration. Miniplex entity creation/destruction allocates objects — pool entities if churn is high.

## Common Pitfalls

1. **Over-engineering**: If your game has < 50 entities, a simple array of objects with a for-loop is fine. ECS adds indirection.
2. **Forgetting cleanup**: When removing entities, also remove the Three.js mesh from the scene and dispose geometry/materials.
3. **System ordering**: Movement before collision, collision before damage, damage before death, death before cleanup. Document the order.
4. **Mixing paradigms**: Pick ECS or scene-graph-based logic per subsystem, not per entity. A half-ECS codebase is harder to reason about than either approach alone.
