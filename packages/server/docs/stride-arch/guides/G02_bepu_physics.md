# G02 — Bepu Physics Fundamentals

> **Category:** Guide · **Engine:** Stride · **Related:** [G01 Getting Started](./G01_getting_started.md) · [Stride Architecture Rules](../stride-arch-rules.md)

A comprehensive guide to Bepu Physics in Stride 4.3, covering installation, configuration, rigid body dynamics, collision detection, raycasting, constraints, and migration from Bullet Physics. Bepu is Stride's modern physics engine — pure C#, multi-threaded, highly performant, and fully deterministic. This guide shows how to set up static and dynamic bodies, handle collisions, cast rays, and build physics-driven gameplay.

---

## Table of Contents

1. [Why Bepu Physics?](#1--why-bepu-physics)
2. [Adding Bepu to Your Project](#2--adding-bepu-to-your-project)
3. [Bepu Configuration](#3--bepu-configuration)
4. [Static Bodies](#4--static-bodies)
5. [Dynamic Bodies](#5--dynamic-bodies)
6. [Kinematic Bodies](#6--kinematic-bodies)
7. [Collision Detection](#7--collision-detection)
8. [Raycasting and Queries](#8--raycasting-and-queries)
9. [Constraints and Joints](#9--constraints-and-joints)
10. [Code-Only Physics with Community Toolkit](#10--code-only-physics-with-community-toolkit)
11. [Migration from Bullet Physics](#11--migration-from-bullet-physics)
12. [Performance Tips](#12--performance-tips)

---

## 1 — Why Bepu Physics?

Stride 4.3 transitions to **Bepu Physics** as the primary physics engine. While Bullet Physics remains available for backward compatibility, Bepu is now the recommended choice for new projects.

### Why Bepu?

**Pure C# Implementation**
Bepu is written entirely in C#, eliminating native dependencies. This means:
- No platform-specific binaries to ship
- Full source code available for inspection and modification
- Better integration with .NET tooling and debugging

**Performance**
Bepu is highly optimized for modern CPUs:
- Multi-threaded simulation out of the box
- SIMD vectorization (SSE2, AVX2 auto-detection)
- Better broad-phase collision detection than Bullet
- Lower memory overhead for large scenes

**Determinism**
For games requiring deterministic physics (replays, networked multiplayer with rollback), Bepu provides bit-identical simulation across platforms and runs.

**Better .NET Integration**
- Built for .NET and C# idioms
- No interop marshaling overhead
- Async-friendly for integration with Stride's async scripts
- Modern API design matching C# conventions

### When to Use Bepu

- ✅ New projects (Stride 4.3+)
- ✅ Games needing deterministic physics
- ✅ High-performance simulation (hundreds of bodies)
- ✅ No platform-specific physics needs

### Bullet Physics Still Available

If your project relies on Bullet's specific features or you're migrating an old project, Bullet is still supported in Stride 4.3. However, Bepu's feature set is now slightly ahead, so migration is recommended over time.

---

## 2 — Adding Bepu to Your Project

### Via Game Studio (Recommended)

1. In **Game Studio**, right-click your project in the **Solution Explorer**
2. Select **Add Dependency**
3. Search for and select **Stride.BepuPhysics**
4. Click **Add**
5. Rebuild the project

Game Studio automatically adds the NuGet package and updates your `.csproj`.

### Via Command Line

If working code-only or in your IDE:

```bash
dotnet add package Stride.BepuPhysics
```

### Community Toolkit (Pre-Release)

For the latest features and code-only helpers, also install:

```bash
dotnet add package Stride.CommunityToolkit.Bepu --prerelease
```

### Verifying Installation

After adding Stride.BepuPhysics, your project can use:

```csharp
using Stride.BepuPhysics;
using Stride.BepuPhysics.Components;
```

If these namespaces don't resolve, rebuild the solution and check that the NuGet package restored correctly:

```bash
dotnet restore
dotnet build
```

---

## 3 — Bepu Configuration

Bepu's behavior is controlled via the **Bepu Configuration** asset in your project's **GameSettings**.

### Setting Up Bepu Configuration

1. Open **GameSettings** in Game Studio
2. In the **Property Grid**, look for **Physics** or **Bepu Configuration**
3. If not present, click **Add** and select **BepuConfiguration**

### Key Configuration Parameters

| Parameter | Default | Effect |
|-----------|---------|--------|
| **Gravity** | (0, -9.81, 0) | Global gravity vector. Set Y to negative for downward pull. |
| **SolverIterationCount** | 4 | Number of constraint solver iterations per frame. Higher = more stable but slower. |
| **MaxSubsteps** | 1 | How many simulation steps per frame. Increase for small time steps or fast-moving objects. |
| **ContinuousCollisionDetection** | false | Enable CCD for fast objects to avoid tunneling. Costs performance. |
| **DefaultBodyDamping** | (0.03, 0.03) | Linear and angular damping applied to all bodies. Reduces bouncing over time. |

### Example: Tuning for a Fast-Paced Game

```csharp
// Access BepuConfiguration from a script
public class PhysicsSetup : StartupScript
{
    public override void Start()
    {
        var simulation = SceneSystem.SceneInstance.GetProcessor<BepuPhysicsProcessor>();
        
        if (simulation != null)
        {
            // Increase iterations for more stable stacking
            simulation.Settings.SolverIterationCount = 6;
            
            // Enable CCD if objects move very fast (bullets, etc.)
            simulation.Settings.ContinuousCollisionDetection = true;
            
            // Adjust gravity for lighter feel
            simulation.Gravity = new Vector3(0, -5.0f, 0);
        }
    }
}
```

### Understanding Solver Iterations

The solver runs multiple times per frame to resolve constraints (contacts, joints). More iterations = more stable but slower:
- **2–3 iterations:** Fast, arcade-y feel. Good for action games.
- **4–6 iterations:** Balanced. Recommended for most games.
- **8+ iterations:** Highly stable. Use for complex stacking or precision simulations.

Adjust based on profiling. The Physics window in Game Studio shows simulation time.

---

## 4 — Static Bodies

Static bodies are immovable — they represent the environment: ground, walls, buildings, terrain. Static bodies are very cheap (essentially free in CPU cost) because the engine knows they never move.

### Creating a Static Body in the Editor

1. Create an entity (e.g., a cube for a wall)
2. In the **Property Grid**, click **Add component**
3. Select **StaticComponent** (or search for it)
4. Select a **Shape** in the StaticComponent properties:
   - **BoxShape** — Rectangular collision
   - **SphereShape** — Spherical collision
   - **CapsuleShape** — Capsule (good for character walls)
   - **CylinderShape** — Cylindrical collision
   - **ConvexHullShape** — Automatically computed from mesh bounds
   - **CompoundShape** — Multiple shapes combined (see Section 12)

### Example: Static Ground in Code

```csharp
public class LevelSetup : StartupScript
{
    public override void Start()
    {
        var scene = SceneSystem.SceneInstance.RootScene;
        
        // Create a ground plane
        var ground = new Entity("Ground")
        {
            new TransformComponent { Position = new Vector3(0, -1, 0), Scale = new Vector3(10, 1, 10) },
            // Add a static body with a box shape
            new StaticComponent
            {
                Shape = new BoxShape(10, 1, 10),  // Width, Height, Depth
                Collider = new CollisionInfo { Layer = 1 }  // Collision layer
            }
        };
        scene.Entities.Add(ground);
    }
}
```

**Key points:**

- `StaticComponent` requires a **Shape**. The shape determines collision geometry.
- Static bodies do not need mass, inertia, or velocity — those are dynamic-only.
- Use **Collision Layers** to control which objects collide (see Section 7).
- Static bodies *can* be repositioned in code, but changes aren't physics-optimized. Reposition minimally.

### Mesh Colliders

For terrain or complex static geometry, use a **MeshShape** or **ConvexHullShape**:

```csharp
// ConvexHull automatically wraps a mesh's bounds
new StaticComponent
{
    Shape = new ConvexHullShape(meshAsset)  // Asset loaded from editor or code
}
```

Mesh colliders are more expensive than primitives, so use them sparingly and only where needed.

---

## 5 — Dynamic Bodies

Dynamic bodies are simulated by physics — they fall, collide, and respond to forces. Controlled via **BodyComponent** and **ShapeComponent**.

### Creating a Dynamic Body in the Editor

1. Create an entity (e.g., a sphere for a ball)
2. Add **BodyComponent** — Sets mass, damping, and simulation type
3. Add **ShapeComponent** — Defines collision shape

### Example: A Bouncing Ball

```csharp
public class BallSpawner : StartupScript
{
    public override void Start()
    {
        var scene = SceneSystem.SceneInstance.RootScene;
        
        var ball = new Entity("Ball")
        {
            new TransformComponent { Position = new Vector3(0, 5, 0) },
            // Dynamic body
            new BodyComponent
            {
                Mass = 1.0f,                           // 1 kg
                LinearDamping = 0.05f,                 // Slight air resistance
                AngularDamping = 0.05f,                // Spinning resistance
                Restitution = 0.8f,                    // Bounciness (0–1)
                Friction = 0.5f,                       // Surface friction
                BodyType = BodyType.Dynamic            // Simulated by physics
            },
            // Collision shape
            new ShapeComponent
            {
                Shape = new SphereShape(0.5f),  // 0.5 unit radius
                LocalOffset = Vector3.Zero
            }
        };
        scene.Entities.Add(ball);
    }
}
```

### Key BodyComponent Properties

| Property | Range | Effect |
|----------|-------|--------|
| **Mass** | > 0 | Object weight. Higher mass = harder to move. |
| **Restitution** | 0–1 | Bounciness. 0 = dead, 1 = perfect bounce. |
| **Friction** | 0+ | Surface grip. Higher = more sliding resistance. |
| **LinearDamping** | 0–1 | Air resistance for movement. Slows velocity over time. |
| **AngularDamping** | 0–1 | Rotational air resistance. Stops spinning. |
| **Gravity Scale** | 0+ | Multiplier for gravity. 0 = no gravity, 1 = normal, 2 = 2x gravity. |

### Applying Forces

The **BodyComponent** exposes methods to apply forces at runtime:

```csharp
public class Cannon : SyncScript
{
    public float FirePower { get; set; } = 20.0f;

    public override void Update()
    {
        if (Input.IsKeyPressed(Keys.Space))
        {
            var body = Entity.Get<BodyComponent>();
            
            // Apply an instantaneous impulse (one-frame boost)
            body.ApplyImpulse(Vector3.UnitY * FirePower);
            
            // Alternative: apply continuous force
            // body.ApplyForce(Vector3.UnitY * FirePower);
        }
    }
}
```

**Force vs. Impulse:**
- **Force** — Applied over time. Results in acceleration. Use for thrusters, wind.
- **Impulse** — Instantaneous velocity change. Use for explosions, kicks, collisions.

### Setting Velocity Directly

For immediate movement (no acceleration):

```csharp
body.LinearVelocity = new Vector3(10, 0, 0);      // 10 m/s to the right
body.AngularVelocity = new Vector3(0, 5, 0);      // Spin around Y axis
```

Direct velocity changes bypass force simulation, so use sparingly (e.g., respawning).

---

## 6 — Kinematic Bodies

Kinematic bodies are moved by code, not physics. They don't fall or respond to forces, but they can collide and push other bodies.

**Use cases:**
- Character controllers (player movement)
- Moving platforms
- Animated objects (doors, elevators)
- AI-controlled entities with custom movement

### Creating a Kinematic Body

```csharp
var platform = new Entity("MovingPlatform")
{
    new TransformComponent { Position = new Vector3(0, 2, 0) },
    new BodyComponent
    {
        BodyType = BodyType.Kinematic,  // Not simulated by physics
        Mass = 1.0f,
        Friction = 0.5f
    },
    new ShapeComponent
    {
        Shape = new BoxShape(2, 0.5f, 2)
    }
};
```

### Moving a Kinematic Body

```csharp
public class MovingPlatform : SyncScript
{
    public float Speed { get; set; } = 2.0f;
    public float Distance { get; set; } = 5.0f;

    private Vector3 startPos;
    private float timeCounter = 0;

    public override void Start()
    {
        startPos = Entity.Transform.Position;
    }

    public override void Update()
    {
        var dt = (float)Game.UpdateTime.Elapsed.TotalSeconds;
        
        // Oscillate the platform up and down
        timeCounter += dt;
        var offset = Mathf.Sin(timeCounter * Speed) * Distance;
        Entity.Transform.Position = startPos + new Vector3(0, offset, 0);
        
        // Update velocity for physics engine (collision response)
        var body = Entity.Get<BodyComponent>();
        body.LinearVelocity = new Vector3(0, Mathf.Cos(timeCounter * Speed) * Speed * Distance, 0);
    }
}
```

**Important:** For kinematic bodies, always set `LinearVelocity` to match the movement. This tells physics where the body is moving so it can push dynamic bodies correctly.

---

## 7 — Collision Detection

Bepu automatically detects when objects collide. You can respond to collisions via scripts using collision events.

### Collision Events

```csharp
public class Health : SyncScript
{
    public float MaxHealth { get; set; } = 100;
    private float currentHealth;

    public override void Start()
    {
        currentHealth = MaxHealth;
        
        // Subscribe to collision events
        var body = Entity.Get<BodyComponent>();
        body.CollisionStarted += OnCollisionEnter;
        body.CollisionEnded += OnCollisionExit;
    }

    private void OnCollisionEnter(Entity other, ContactInfo contact)
    {
        // Called when this entity touches 'other'
        if (other.Name == "Spike")
        {
            currentHealth -= 10;
            if (currentHealth <= 0)
                Entity.Scene.Entities.Remove(Entity);
        }
    }

    private void OnCollisionExit(Entity other)
    {
        // Called when contact is lost
        Logger.Info($"Stopped touching {other.Name}");
    }
}
```

### ContactInfo Details

```csharp
private void OnCollisionEnter(Entity other, ContactInfo contact)
{
    // Contact properties
    Vector3 normalFromOther = contact.Normal;           // Direction of push
    float penetrationDepth = contact.PenetrationDepth;  // How much bodies overlap
    Vector3 contactPoint = contact.Position;            // World position of collision
    
    // Use normal to determine hit direction
    if (normalFromOther.Y > 0.5f)  // Hit from above?
        Logger.Info("Landed on top!");
    else if (normalFromOther.Y < -0.5f)  // Hit from below?
        Logger.Info("Hit head!");
}
```

### Collision Layers

Control which objects collide using **layers**:

```csharp
var enemy = new Entity("Enemy")
{
    new BodyComponent { /* ... */ },
    new ShapeComponent
    {
        Shape = new SphereShape(0.5f),
        Collider = new CollisionInfo
        {
            Layer = 2,              // This object is on layer 2
            CanCollideWith = 1 | 3  // Can collide with layers 1 and 3
        }
    }
};
```

Bits in `CanCollideWith` determine collision pairs:
- Layer 1 (Player) — Collides with layers 2, 3 (Enemies, Props)
- Layer 2 (Enemy) — Collides with layers 1, 4 (Player, Bullets)
- Layer 3 (Static) — Collides with everything
- Layer 4 (Bullet) — Collides only with 2 (Enemies), not players

### Trigger Volumes (Sensor Colliders)

Use **trigger colliders** for areas that don't physically collide but fire events:

```csharp
var trigger = new Entity("DamageZone")
{
    new BodyComponent
    {
        BodyType = BodyType.Static,
        IsSensor = true  // Doesn't collide, only fires events
    },
    new ShapeComponent
    {
        Shape = new BoxShape(5, 5, 5)
    }
};
```

Sensor colliders are very cheap and perfect for:
- Spawn points and checkpoints
- Damage zones
- Level event triggers
- Proximity sensors for AI

---

## 8 — Raycasting and Queries

Raycasting lets you fire invisible rays to detect objects — useful for shooting, line-of-sight checks, and ground detection.

### Raycast Basics

```csharp
public class GunController : SyncScript
{
    public float BulletSpeed { get; set; } = 100.0f;
    public float MaxRayDistance { get; set; } = 1000.0f;

    public override void Update()
    {
        if (Input.IsMouseButtonPressed(MouseButton.Left))
        {
            Fire();
        }
    }

    private void Fire()
    {
        // Get the physics simulation
        var simulation = SceneSystem.SceneInstance.GetProcessor<BepuPhysicsProcessor>();
        
        // Ray from camera forward
        var cameraEntity = Entity.Scene.Entities.FirstOrDefault(e => e.Name == "Camera");
        var cameraPos = cameraEntity.Transform.Position;
        var cameraForward = cameraEntity.Transform.WorldMatrix.Forward;
        
        // Perform raycast
        var ray = new Ray(cameraPos, cameraForward);
        var maxDistance = MaxRayDistance;
        
        if (simulation.Raycast(ray, maxDistance, out var hit))
        {
            // Hit something
            Logger.Info($"Hit {hit.Entity.Name} at distance {hit.Distance}");
            
            // Apply damage or effect
            var health = hit.Entity.Get<Health>();
            if (health != null)
                health.TakeDamage(25);
        }
    }
}
```

### RaycastHit Details

```csharp
if (simulation.Raycast(ray, maxDistance, out var hit))
{
    Entity HitEntity = hit.Entity;           // The entity that was hit
    float Distance = hit.Distance;           // How far from ray origin
    Vector3 HitPoint = hit.Point;            // World position of impact
    Vector3 Normal = hit.Normal;             // Surface normal at hit
    Vector3 T = hit.T;                       // Parametric distance along ray
}
```

### Ground Detection

For character controllers, detect if the player is on the ground:

```csharp
public class CharacterController : SyncScript
{
    public float GroundDistance { get; set; } = 0.1f;
    private bool isGrounded;

    public override void Update()
    {
        // Cast ray downward from character
        var pos = Entity.Transform.Position;
        var ray = new Ray(pos, -Vector3.UnitY);
        
        var simulation = SceneSystem.SceneInstance.GetProcessor<BepuPhysicsProcessor>();
        isGrounded = simulation.Raycast(ray, GroundDistance, out _);
        
        if (isGrounded && Input.IsKeyPressed(Keys.Space))
        {
            var body = Entity.Get<BodyComponent>();
            body.ApplyImpulse(new Vector3(0, 5, 0));  // Jump!
        }
    }
}
```

### Shape Casts and Overlap Tests

Beyond raycasts, Bepu supports:

```csharp
// Sphere cast (raycast with radius)
var sphereCastResult = simulation.ShapeCast(
    ray, 
    radius: 0.5f,
    maxDistance: 100,
    out var hit
);

// Overlap query (find all bodies in a region)
var overlappingBodies = simulation.FindBodyBodiesAtPosition(
    Position: new Vector3(0, 0, 0),
    Radius: 5.0f
);
```

---

## 9 — Constraints and Joints

Constraints connect bodies together, limiting their movement. Common types:

| Constraint | Effect | Use Case |
|-----------|--------|----------|
| **BallSocket** | Holds two points together | Rope, chain, ball-and-socket joint |
| **Hinge** | Rotational constraint around an axis | Door, revolving joint |
| **Weld** | Rigidly locks two bodies together | Welded structures, compound objects |
| **DistanceLimit** | Bodies stay within distance range | Rope, spring, tethered objects |
| **AngularMotor** | Applies torque to reach a target angle | Motor-driven rotation |

### Example: Hinge Joint (Door)

```csharp
public class DoorController : StartupScript
{
    public override void Start()
    {
        var scene = SceneSystem.SceneInstance.RootScene;
        
        // Door frame (static)
        var frame = new Entity("Frame")
        {
            new BodyComponent { BodyType = BodyType.Static },
            new ShapeComponent { Shape = new BoxShape(0.1f, 2, 2) }
        };
        
        // Door (dynamic)
        var door = new Entity("Door")
        {
            new TransformComponent { Position = new Vector3(1, 0, 0) },
            new BodyComponent { Mass = 10, Friction = 0.3f },
            new ShapeComponent { Shape = new BoxShape(1, 2, 0.05f) }
        };
        
        scene.Entities.Add(frame);
        scene.Entities.Add(door);
        
        // Create hinge constraint
        var hinge = new HingeConstraint(
            BodyHandle: door.Get<BodyComponent>().Handle,
            LocalOffsetA: new Vector3(0, 0, 0),
            LocalOffsetB: new Vector3(0, 0, 0),
            HingeAxis: Vector3.UnitY
        );
        
        simulation.AddConstraint(hinge);
    }
}
```

### Example: Ball Socket (Rope Physics)

```csharp
var ballSocket = new BallSocketConstraint(
    BodyHandleA: firstBody.Handle,
    BodyHandleB: secondBody.Handle,
    LocalOffsetA: new Vector3(0, 0.5f, 0),    // Attach point on first body
    LocalOffsetB: new Vector3(0, -0.5f, 0),   // Attach point on second body
    TargetDistance: 2.0f                      // Keep 2 units apart
);

simulation.AddConstraint(ballSocket);
```

### Creating a Spring

Use **DistanceLimit** with a small margin:

```csharp
var spring = new DistanceLimit(
    BodyHandleA: bodyA.Handle,
    BodyHandleB: bodyB.Handle,
    MinDistance: 1.0f,      // Minimum separation
    MaxDistance: 2.0f,      // Maximum separation — acts like spring
    SpringSettings: new SpringSettings(stiffness: 1000, damping: 10)
);

simulation.AddConstraint(spring);
```

---

## 10 — Code-Only Physics with Community Toolkit

If you're not using Game Studio, the **Stride.CommunityToolkit.Bepu** package provides helpers for setting up physics entirely in code.

### Setup and Installation

```bash
dotnet add package Stride.CommunityToolkit --prerelease
dotnet add package Stride.CommunityToolkit.Bepu --prerelease
```

### Full Code-Only Example

```csharp
using Stride.CommunityToolkit.Engine;
using Stride.Core.Mathematics;
using Stride.Engine;
using Stride.BepuPhysics.Components;

var game = new Game();

game.Run(start: async (Scene rootScene) =>
{
    // Set up a basic 3D scene (camera, light, skybox)
    game.SetupBase3DScene();

    // Create a ground plane
    var ground = game.Create3DPrimitive(PrimitiveModelType.Plane);
    ground.Transform.Scale = new Vector3(10, 1, 10);
    ground.Transform.Position = new Vector3(0, -1, 0);
    
    // Add static physics
    ground.Add(new StaticComponent
    {
        Shape = new BoxShape(10, 1, 10)
    });
    
    rootScene.Entities.Add(ground);

    // Create a falling sphere
    for (int i = 0; i < 5; i++)
    {
        var sphere = game.Create3DPrimitive(PrimitiveModelType.Sphere);
        sphere.Transform.Position = new Vector3(i * 1.5f - 3, 5 + i, 0);
        
        // Add dynamic physics
        sphere.Add(new BodyComponent
        {
            Mass = 1.0f,
            Restitution = 0.7f
        });
        
        sphere.Add(new ShapeComponent
        {
            Shape = new SphereShape(0.5f)
        });
        
        rootScene.Entities.Add(sphere);
    }

    // Game loop runs automatically; physics simulates
});
```

### Benefits of Community Toolkit

- Quick prototyping without Game Studio
- Cross-platform (Linux, macOS)
- Procedural scene generation
- CI/CD automation
- Easier to version control (no binary .sdscene files)

---

## 11 — Migration from Bullet Physics

If you have an existing Stride project using **Bullet Physics**, here's how to migrate to Bepu.

### Component Mapping

| Bullet (Old) | Bepu (New) | Notes |
|--------------|-----------|-------|
| `RigidbodyComponent` | `BodyComponent` | Renamed; API is similar |
| `StaticColliderComponent` | `StaticComponent` | New simplified name |
| `PhysicsComponent` (base) | `BodyComponent` / `StaticComponent` | More specific in Bepu |
| `ColliderShape` | `Shape` property | Shapes still have the same names (BoxShape, SphereShape, etc.) |
| `Restitution` on collider | `Restitution` on BodyComponent | Moved to body |

### Example: Before and After

**Bullet Physics (Old):**

```csharp
var box = new Entity("Box");
box.Add(new RigidbodyComponent
{
    Mass = 1.0f,
    Restitution = 0.5f,
    ColliderShape = new BoxColliderShapeDesc { Size = new Vector3(1, 1, 1) }
});
```

**Bepu Physics (New):**

```csharp
var box = new Entity("Box");
box.Add(new BodyComponent
{
    Mass = 1.0f,
    Restitution = 0.5f
});
box.Add(new ShapeComponent
{
    Shape = new BoxShape(1, 1, 1)
});
```

### Key Differences in Bepu

1. **Separate Components** — Body and Shape are distinct. This allows multiple shapes per body and cleaner composition.
2. **No "CharacterController"** — Implement character movement manually with kinematic bodies (see Section 6).
3. **Sensor Colliders** — Use `IsSensor = true` on BodyComponent (no separate component).
4. **Collision Layers** — Specified in `ShapeComponent.Collider` instead of physics settings.

### Migration Checklist

- [ ] Add `Stride.BepuPhysics` NuGet package
- [ ] Replace `RigidbodyComponent` with `BodyComponent`
- [ ] Replace `StaticColliderComponent` with `StaticComponent`
- [ ] Move collision shapes to `ShapeComponent`
- [ ] Update collision layer logic
- [ ] Test character controllers (reimplement if using Bullet's CharacterController)
- [ ] Profile and tune solver iterations if necessary
- [ ] Update constraint code if using joints
- [ ] Remove Bullet physics from dependencies

---

## 12 — Performance Tips

Bepu is already optimized, but these practices maximize performance:

### 1. Use Appropriate Shapes

```csharp
// ✅ Good: Simple primitives
new SphereShape(1.0f)
new BoxShape(2, 2, 2)
new CapsuleShape(0.5f, 1.0f)

// ⚠️ Expensive: Mesh shapes
new MeshShape(complexMesh)  // Only where needed (terrain, buildings)
```

**Shape Cost (relative):**
- Sphere / Box: 1x
- Capsule / Cylinder: 1.5x
- Mesh / ConvexHull: 10–100x (avoid for dynamic bodies)

### 2. Compound Shapes for Complex Objects

Instead of mesh colliders, build complex shapes from primitives:

```csharp
var torso = new BoxShape(1, 1.5f, 0.5f);
var head = new SphereShape(0.3f);

var compoundShape = new CompoundShape(
    new[] { torso, head },
    new[] { 
        new RigidTransform(Vector3.Zero),  // Torso at origin
        new RigidTransform(new Vector3(0, 1, 0))  // Head above
    }
);

body.Shape = compoundShape;
```

### 3. Simulation Substeps

For fast-moving objects, increase substeps to prevent tunneling:

```csharp
var sim = SceneSystem.SceneInstance.GetProcessor<BepuPhysicsProcessor>();
sim.Settings.MaxSubsteps = 4;  // Default is 1
```

**Cost:** 4 substeps = 4x simulation time. Use only if necessary.

### 4. Sleeping Bodies

Bepu automatically puts idle bodies to sleep. Sleeping bodies don't update:

```csharp
// Body automatically sleeps after being still for a bit
// To wake a sleeping body, apply a force or move it manually

body.BecomeDynamic();  // Force wake
```

### 5. Broad-Phase Optimization

The broad phase detects which bodies *might* collide before expensive narrow-phase checks. Bepu's is very efficient, but minimize bodies when possible:

- Remove physics from small decorative objects
- Use static bodies instead of dynamic whenever possible
- Delete bodies when no longer needed

### 6. Solver Iterations Trade-Off

```
Iterations | Stability | Speed | Best For
-----------|-----------|-------|----------
2          | Low       | ✅✅  | Arcade games, ragdolls
4          | Good      | ✅   | Most games (recommended)
8          | Excellent | ⚠️   | Stacking, structural stability
```

### 7. Profile with Game Studio

Use Game Studio's **Physics** profiler window:

1. Click **Window → Profiling → Physics**
2. Check simulation time per frame
3. Adjust settings and retest
4. Aim for <2ms per frame on your target platform

---

## Next Steps

With Bepu physics set up, explore:

- **AI Physics** — Use raycasts and physics queries for pathfinding and obstacle detection
- **Destructible Objects** — Spawn fragments with physics when structures break
- **Vehicles** — Build cars, boats, and helicopters with constraints and motors
- **Cloth Simulation** — Extend Bepu for fabric and ropes (third-party libraries)
- **Networked Physics** — Bepu's determinism supports rollback and replay for multiplayer
- **Custom Shapes** — Extend Bepu with your own collision primitives

For more advanced topics, refer to the **Bepu Physics documentation** at [bepu-physics.org](https://www.bepu-physics.org/) and the **Stride documentation** at [stride3d.net/docs](https://stride3d.net/docs).
