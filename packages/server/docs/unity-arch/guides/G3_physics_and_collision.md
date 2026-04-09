# G3 — Physics & Collision in Unity 6

> **Category:** guide · **Engine:** Unity 6 (6000.x, PhysX 5 / Box2D) · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Scene Management](G1_scene_management.md) · [G2 Input System](G2_input_system.md) · [Unity Rules](../unity-arch-rules.md)

Unity ships two completely separate physics engines: **3D Physics** (NVIDIA PhysX 5) and **2D Physics** (Box2D). They share concepts — rigidbodies, colliders, joints, raycasts — but use distinct component types and namespaces. A `Rigidbody2D` will never collide with a `BoxCollider` (3D), and vice versa. This guide covers both systems with a focus on correct setup, performance, and common pitfalls.

---

## 3D vs 2D: Which to Use

| Factor | 3D Physics (PhysX) | 2D Physics (Box2D) |
|--------|-------------------|-------------------|
| Components | `Rigidbody`, `BoxCollider`, `SphereCollider`, `CapsuleCollider`, `MeshCollider` | `Rigidbody2D`, `BoxCollider2D`, `CircleCollider2D`, `CapsuleCollider2D`, `PolygonCollider2D` |
| Namespace | `UnityEngine.Physics` | `UnityEngine.Physics2D` |
| Simulation | Full 3D with gravity along any axis | Constrained to XY plane |
| Callbacks | `OnCollisionEnter/Stay/Exit`, `OnTriggerEnter/Stay/Exit` | `OnCollisionEnter2D/Stay2D/Exit2D`, `OnTriggerEnter2D/Stay2D/Exit2D` |
| Raycasts | `Physics.Raycast()` | `Physics2D.Raycast()` |

**Rule of thumb:** If your gameplay is fundamentally 2D (platformer, top-down, puzzle), use 2D physics even if you have 3D art — it's simpler and faster. Only use 3D physics when you need vertical depth, full 3D rotation, or true 3D collision volumes.

---

## Rigidbody Fundamentals

A `Rigidbody` (or `Rigidbody2D`) tells the physics engine to simulate this object. Without one, a collider is treated as a static, immovable wall.

### Body Types

Both 2D and 3D support three body types, but the terminology differs slightly:

**3D Rigidbody:**
- **Dynamic** (default) — fully simulated, responds to forces and collisions
- **Kinematic** (`isKinematic = true`) — moves via code, not affected by forces, but still triggers collision callbacks
- **Static** (no Rigidbody, collider only) — immovable; the physics engine optimizes these heavily

**2D Rigidbody2D:**
- **Dynamic** — fully simulated
- **Kinematic** — moves via `Rigidbody2D.MovePosition()`, only collides with Dynamic bodies
- **Static** — immovable, most performant

```csharp
// Setting up a kinematic rigidbody for a moving platform
// WHY kinematic: We want to control position directly (e.g., via a tween)
// but still have the platform push dynamic objects on contact.
[RequireComponent(typeof(Rigidbody))]
public class MovingPlatform : MonoBehaviour
{
    [SerializeField] private Vector3 _endOffset = new Vector3(0, 5, 0);
    [SerializeField] private float _duration = 3f;
    
    private Rigidbody _rb;
    private Vector3 _startPos;
    
    void Awake()
    {
        _rb = GetComponent<Rigidbody>();
        // WHY isKinematic: Forces (gravity) won't affect us, but we still
        // participate in collision detection so we can push the player.
        _rb.isKinematic = true;
        _startPos = transform.position;
    }
    
    void FixedUpdate()
    {
        // WHY FixedUpdate: Physics runs on a fixed timestep. Moving a kinematic
        // body in Update causes jitter because physics and rendering are out of sync.
        float t = Mathf.PingPong(Time.fixedTime / _duration, 1f);
        Vector3 target = _startPos + _endOffset * t;
        
        // WHY MovePosition instead of transform.position: MovePosition
        // interpolates correctly and properly pushes overlapping dynamic bodies.
        _rb.MovePosition(target);
    }
}
```

### Critical Rule: Don't Mix Transform and Rigidbody Movement

```csharp
// ❌ BAD: Moving a dynamic rigidbody via Transform bypasses the physics engine.
// This causes missed collisions, jitter, and teleportation artifacts.
transform.position += direction * speed * Time.deltaTime;

// ✅ GOOD: Use Rigidbody methods so the physics engine handles collision properly.
// For continuous movement (characters, vehicles):
_rb.MovePosition(_rb.position + direction * speed * Time.fixedDeltaTime);

// For impulse-based movement (jumping, explosions):
_rb.AddForce(Vector3.up * jumpForce, ForceMode.Impulse);

// For velocity-based control (precise character controllers):
_rb.linearVelocity = new Vector3(moveInput.x * speed, _rb.linearVelocity.y, moveInput.y * speed);
```

---

## Colliders

Colliders define the physical shape of a GameObject. They come in two modes:

- **Solid collider** — blocks other objects (default)
- **Trigger collider** (`isTrigger = true`) — doesn't block, but fires `OnTriggerEnter/Stay/Exit` callbacks. Use for pickup zones, damage areas, checkpoints.

### Collider Selection Guide (3D)

| Collider | Cost | Use Case |
|----------|------|----------|
| `SphereCollider` | Cheapest | Projectiles, pickups, NPCs |
| `CapsuleCollider` | Cheap | Characters, humanoids |
| `BoxCollider` | Cheap | Walls, crates, platforms |
| `MeshCollider` (convex) | Medium | Irregular convex shapes (max 255 triangles) |
| `MeshCollider` (non-convex) | Expensive | Static environment only (cannot be on dynamic rigidbodies) |

### Compound Colliders

For complex shapes, combine multiple primitive colliders on child GameObjects rather than using a MeshCollider. The physics engine treats them as a single body.

```
PlayerCharacter (Rigidbody)
├── BodyCollider (CapsuleCollider)     ← main body
├── HeadCollider (SphereCollider)      ← headshot detection
└── ShieldCollider (BoxCollider)       ← attached shield
```

```csharp
// WHY compound colliders over MeshCollider:
// 1. Primitive colliders are ~10x faster than MeshColliders
// 2. Each child can have different physics materials (friction, bounce)
// 3. Individual children can be triggers while others are solid
// 4. You can toggle individual pieces at runtime (e.g., drop the shield)

// Detecting which part was hit:
void OnCollisionEnter(Collision collision)
{
    // WHY: Each ContactPoint knows which collider on THIS object was hit.
    // This lets you implement headshot multipliers, shield blocks, etc.
    foreach (ContactPoint contact in collision.contacts)
    {
        if (contact.thisCollider.CompareTag("Head"))
        {
            ApplyHeadshotDamage(collision);
            return;
        }
    }
    ApplyNormalDamage(collision);
}
```

---

## Collision Layers and the Layer Matrix

Unity uses a 32-layer system. Layers control which objects can collide with each other via the **Layer Collision Matrix** (Edit → Project Settings → Physics).

```csharp
// Common layer setup for a typical game:
// Layer 0:  Default
// Layer 6:  Player
// Layer 7:  Enemy
// Layer 8:  Projectile
// Layer 9:  Environment
// Layer 10: Pickup
// Layer 11: Trigger (no physics, only overlaps)

// WHY use layers: Without layers, every collider checks against every other
// collider. With proper layers, you can skip irrelevant pairs entirely.
// Example: Pickups don't need to collide with enemies or projectiles.

// Raycasting with layer masks:
public class WeaponRaycast : MonoBehaviour
{
    [SerializeField] private float _range = 100f;
    
    // WHY LayerMask field: Lets designers configure which layers the weapon
    // hits in the Inspector, without changing code. Much better than hardcoding.
    [SerializeField] private LayerMask _hitLayers;
    
    public bool Fire(out RaycastHit hit)
    {
        // WHY Physics.Raycast with layerMask: Skips layers we don't care
        // about (UI, triggers, other projectiles), improving both performance
        // and correctness.
        return Physics.Raycast(
            transform.position,
            transform.forward,
            out hit,
            _range,
            _hitLayers
        );
    }
}
```

---

## Raycasting and Physics Queries

Raycasts and overlap queries are the backbone of game mechanics: line-of-sight, ground detection, area damage, proximity checks.

### Common Query Types

```csharp
// --- Single-hit raycast ---
// Use when you only need the first object hit (weapons, line-of-sight).
if (Physics.Raycast(origin, direction, out RaycastHit hit, maxDistance, layerMask))
{
    Debug.Log($"Hit {hit.collider.name} at {hit.point}");
}

// --- All-hits raycast ---
// Use when a shot can penetrate multiple targets.
RaycastHit[] hits = Physics.RaycastAll(origin, direction, maxDistance, layerMask);

// --- Sphere overlap ---
// Use for area-of-effect: find all colliders within a blast radius.
Collider[] caught = Physics.OverlapSphere(explosionCenter, blastRadius, damageLayers);
foreach (Collider c in caught)
{
    if (c.TryGetComponent(out IDamageable target))
        target.TakeDamage(CalculateFalloff(explosionCenter, c.transform.position));
}

// --- SphereCast ---
// Use for "thick" raycasts: projectiles with radius, melee swings.
// WHY SphereCast over Raycast: A raycast is infinitely thin, making it easy
// to miss targets. A SphereCast sweeps a sphere along the ray, giving a
// generous hit volume that feels better for melee or slow projectiles.
if (Physics.SphereCast(origin, 0.3f, direction, out RaycastHit sweepHit, range, layerMask))
{
    // Hit something with our "thick" ray
}
```

### Performance: NonAlloc Variants

Every `RaycastAll`, `OverlapSphere`, etc. allocates a new array on the managed heap. In hot paths (every frame, many enemies), this creates GC pressure. Use the `NonAlloc` variants with a pre-allocated buffer:

```csharp
public class EnemySensor : MonoBehaviour
{
    [SerializeField] private float _detectionRadius = 15f;
    [SerializeField] private LayerMask _enemyLayer;
    
    // WHY pre-allocated buffer: Physics.OverlapSphereNonAlloc writes results
    // into this array instead of allocating a new one. Zero garbage per frame.
    // Size 32 is usually enough — if you need more, increase the buffer.
    private readonly Collider[] _hitBuffer = new Collider[32];
    
    void FixedUpdate()
    {
        // WHY FixedUpdate: We're querying physics state, which updates on
        // the fixed timestep. Querying in Update could see stale data.
        int count = Physics.OverlapSphereNonAlloc(
            transform.position,
            _detectionRadius,
            _hitBuffer,
            _enemyLayer
        );
        
        for (int i = 0; i < count; i++)
        {
            // Process detected enemies
            ProcessEnemy(_hitBuffer[i]);
        }
    }
    
    private void ProcessEnemy(Collider enemy) { /* ... */ }
}
```

### 2D Raycasting

2D raycasts work the same way conceptually but return different types:

```csharp
// 2D raycast — note the return type is RaycastHit2D, not RaycastHit.
// WHY separate API: 2D and 3D physics engines are completely independent.
RaycastHit2D hit = Physics2D.Raycast(origin2D, direction2D, maxDistance, layerMask);
if (hit.collider != null)
{
    Debug.Log($"Hit {hit.collider.name} at {hit.point}");
}

// 2D overlap circle (equivalent to OverlapSphere)
Collider2D[] results = Physics2D.OverlapCircleAll(center, radius, layerMask);
```

---

## Joints

Joints connect two rigidbodies with constraints. Unity supports several joint types:

| Joint (3D) | Joint (2D) | Use Case |
|-------------|-----------|----------|
| `HingeJoint` | `HingeJoint2D` | Doors, pendulums, flippers |
| `SpringJoint` | `SpringJoint2D` | Bungee cords, suspension |
| `FixedJoint` | `FixedJoint2D` | Glue objects together (breakable) |
| `ConfigurableJoint` | — | Full control: lock/free each axis |
| `CharacterJoint` | — | Ragdolls (limits rotation per axis) |
| — | `DistanceJoint2D` | Ropes, chains (fixed distance) |
| — | `SliderJoint2D` | Sliding doors, elevators (one axis) |

```csharp
// Example: Breakable connection between two objects
// WHY FixedJoint: Simplest way to "glue" objects. When breakForce is exceeded
// (e.g., by an explosion), Unity automatically destroys the joint.
var joint = gameObject.AddComponent<FixedJoint>();
joint.connectedBody = otherRigidbody;
joint.breakForce = 500f;  // Newtons — joint breaks under this force
joint.breakTorque = 500f; // Joint breaks under this torque
```

---

## Physics Materials

`PhysicsMaterial` (3D) and `PhysicsMaterial2D` control how surfaces interact:

```csharp
// WHY physics materials: Without them, all surfaces have the same friction
// and bounciness. Materials let you make ice slippery, rubber bouncy, etc.
// without writing any code — just assign the material to the collider.

// Create via: Assets → Create → Physics Material
// Key properties:
//   dynamicFriction: 0 = ice, 1 = sandpaper (friction while sliding)
//   staticFriction:  resistance before an object starts sliding
//   bounciness:      0 = no bounce, 1 = perfect bounce (no energy loss)
//   frictionCombine: how two materials' friction values combine (Average, Min, Max, Multiply)
//   bounceCombine:   same for bounciness
```

---

## Collision Detection Modes

For fast-moving objects (bullets, racing cars), the default discrete collision detection can miss collisions entirely — the object teleports through walls between frames. This is the "tunneling" problem.

```csharp
// WHY Continuous: A bullet at 500 m/s moves ~8 meters per physics step
// (at 60 Hz fixed timestep). That's enough to skip through most walls.
// Continuous collision detection sweeps the collider along its trajectory,
// catching collisions that discrete detection would miss.

// Options (3D Rigidbody.collisionDetectionMode):
//   Discrete           — cheapest, fine for slow objects
//   Continuous         — prevents tunneling against static colliders
//   ContinuousDynamic  — prevents tunneling against everything (most expensive)
//   ContinuousSpeculative — good middle ground, works with kinematic bodies too

[RequireComponent(typeof(Rigidbody))]
public class Projectile : MonoBehaviour
{
    void Awake()
    {
        var rb = GetComponent<Rigidbody>();
        // WHY ContinuousDynamic: Projectiles are fast and can hit both
        // static walls and dynamic enemies. This is the safest option.
        rb.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;
    }
}
```

---

## Common Pitfalls

### 1. Collision Callbacks Not Firing

Check this matrix when `OnCollisionEnter` or `OnTriggerEnter` isn't called:

| | Static Collider | Kinematic RB | Dynamic RB |
|--|----------------|-------------|-----------|
| **Static Collider** | ✗ | ✗ | ✓ |
| **Kinematic RB** | ✗ | ✗* | ✓ |
| **Dynamic RB** | ✓ | ✓ | ✓ |

*Kinematic-kinematic collisions are detected only if `Rigidbody.detectCollisions` is enabled (which it is by default) and you're using Contact Pairs mode "Enable Kinematic Kinematic Pairs" in Physics settings.

### 2. Moving Objects via Transform

Setting `transform.position` on a Rigidbody object teleports it, bypassing collision. Use `Rigidbody.MovePosition()` or `AddForce()` instead.

### 3. Mixing 2D and 3D Physics

A `Rigidbody2D` will **never** interact with a `BoxCollider` (3D). If your 2D game has a mysterious pass-through bug, check that all physics components are from the same dimension.

### 4. Expensive Mesh Colliders on Moving Objects

Non-convex `MeshCollider` cannot be used on dynamic rigidbodies (Unity will log an error). Even convex mesh colliders are much slower than primitives. Always prefer compound primitive colliders.

### 5. Too Many Physics Queries Per Frame

Every `Raycast`, `OverlapSphere`, etc. costs CPU time. Common mistakes:
- Raycasting every frame when you only need to check periodically (use a timer)
- Casting against all layers when you only need specific ones (use `LayerMask`)
- Using allocating variants (`RaycastAll`) in hot paths (use `NonAlloc`)

---

## Performance Checklist

- [ ] Use primitive colliders (Box, Sphere, Capsule) over MeshColliders wherever possible
- [ ] Set up the Layer Collision Matrix to disable unnecessary collision pairs
- [ ] Use `NonAlloc` variants of physics queries in per-frame code
- [ ] Set `Rigidbody.collisionDetectionMode` to `Continuous` only for fast-moving objects — discrete is cheaper for slow objects
- [ ] Set unused rigidbodies to sleep by keeping `Rigidbody.sleepThreshold` at default
- [ ] Use `Physics.simulationMode = SimulationMode.Script` if you need to step physics manually (advanced)
- [ ] Profile with the Physics Profiler (Window → Analysis → Profiler → Physics)

---

## Further Reading

- [Unity Manual: Physics](https://docs.unity3d.com/Manual/PhysicsSection.html)
- [Unity Manual: Physics 2D](https://docs.unity3d.com/Manual/Physics2DReference.html)
- [Unity Manual: Layer-based Collision Detection](https://docs.unity3d.com/Manual/LayerBasedCollision.html)
- [Physics Best Practices (Unity)](https://unity.com/how-to/enhanced-physics-performance-smooth-gameplay)
