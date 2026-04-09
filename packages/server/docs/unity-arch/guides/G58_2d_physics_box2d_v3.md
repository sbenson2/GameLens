# G58 — 2D Physics: Box2D v3 & Low-Level API

> **Category:** guide · **Engine:** Unity 6.3+ (6000.3) · **Related:** [G3 Physics & Collision](G3_physics_and_collision.md) · [G25 2D Game Development](G25_2d_game_development.md) · [G42 Burst Compiler & Jobs](G42_burst_compiler_jobs_system.md) · [Unity Rules](../unity-arch-rules.md)

Unity 6.3 integrates **Box2D v3** (by Erin Catto) as the foundation for 2D physics, replacing the Box2D 2.x backend used since Unity 4. Alongside the upgraded backend, Unity exposes a new **Low-Level 2D Physics API** (`UnityEngine.LowLevelPhysics2D`) that gives developers direct access to the physics world — enabling custom physics components, deterministic simulations, and high-performance 2D physics without the overhead of the component-based workflow.

---

## What Changed from Box2D 2.x to v3

| Aspect | Box2D 2.x (Unity ≤ 6.2) | Box2D v3 (Unity 6.3+) |
|--------|-------------------------|----------------------|
| Threading | Single-threaded | Multi-threaded via task graph |
| Solver | Sequential impulse | Soft-step solver (TGS-Soft) |
| Determinism | Platform-dependent | Cross-platform deterministic (same binary) |
| Continuous collision | Sweep-based TOI | Speculative with sub-stepping |
| Joints | 10 joint types | Same + joint motors reworked |
| Events | Callbacks on main thread | Batched event arrays |
| Debug visualization | Editor-only Gizmos | Runtime visual debugging API |
| Performance | ~N² broadphase for large worlds | Dynamic AABB tree with better cache locality |

### What This Means for Your Game

- **Platformers & action games:** More stable stacking, fewer jitter artifacts on moving platforms. Multi-threading means 2D physics no longer bottlenecks the main thread.
- **Competitive / networked games:** Cross-platform determinism enables lockstep networking without physics divergence — the same inputs produce the same simulation on Windows, macOS, Android, iOS, and consoles.
- **Physics-heavy puzzles (e.g., Angry Birds style):** Improved solver stability means complex chain reactions with many contacts resolve more predictably.
- **Bullet-hell / high entity count:** Multi-threaded broadphase and solver scale better with hundreds of active bodies.

---

## High-Level API (Existing Components — Still Recommended)

The component-based API you already know (`Rigidbody2D`, `Collider2D`, `Physics2D.Raycast()`, etc.) continues to work and now runs on Box2D v3 under the hood. **No code changes are required for existing projects** upgrading to Unity 6.3.

```csharp
using UnityEngine;

// Standard 2D physics — works identically on Box2D v3 backend
// WHY: The high-level API is the right choice for most games.
// Box2D v3 improvements (threading, determinism) apply automatically.
public class PlayerMovement2D : MonoBehaviour
{
    [SerializeField] private float _moveSpeed = 5f;
    [SerializeField] private float _jumpForce = 10f;
    [SerializeField] private LayerMask _groundLayer;

    private Rigidbody2D _rb;
    private bool _isGrounded;

    void Awake() => _rb = GetComponent<Rigidbody2D>();

    void FixedUpdate()
    {
        // WHY: FixedUpdate aligns with the physics timestep.
        // Box2D v3 processes FixedUpdate bodies on worker threads between steps.
        float moveInput = Input.GetAxisRaw("Horizontal");
        _rb.linearVelocity = new Vector2(moveInput * _moveSpeed, _rb.linearVelocity.y);
    }

    // WHY: Ground check via OverlapCircle — unchanged API, now backed by Box2D v3.
    void Update()
    {
        _isGrounded = Physics2D.OverlapCircle(
            transform.position + Vector3.down * 0.5f, 0.2f, _groundLayer);

        if (_isGrounded && Input.GetButtonDown("Jump"))
        {
            _rb.AddForce(Vector2.up * _jumpForce, ForceMode2D.Impulse);
        }
    }
}
```

### New High-Level Features in 6.3

```csharp
// Rigidbody2D.linearVelocity replaces the deprecated .velocity property
// WHY: Naming consistency with 3D physics (Rigidbody.linearVelocity in Unity 6).
_rb.linearVelocity = new Vector2(5f, 0f);

// Rigidbody2D.angularVelocityDegrees — renamed for clarity
// WHY: The old .angularVelocity was in degrees despite the name suggesting radians.
// New name makes the unit explicit.
_rb.angularVelocityDegrees = 90f;
```

---

## Low-Level 2D Physics API

The new `UnityEngine.LowLevelPhysics2D` namespace provides direct access to the physics world. This is for developers who need to:

- Write custom physics components (beyond Rigidbody2D + Collider2D)
- Implement custom broadphase or collision filtering
- Build deterministic replays with frame-accurate state snapshots
- Integrate 2D physics with ECS/DOTS workflows

### PhysicsWorld: The Core Object

```csharp
using UnityEngine.LowLevelPhysics2D;

// WHY: PhysicsWorld is the low-level handle to the Box2D v3 world.
// You can create additional worlds for simulation prediction, replay, etc.
// The default world is accessible via Physics2D — additional worlds are standalone.

// Creating a standalone physics world (e.g., for server-side simulation)
// WHY: Separate worlds simulate independently — useful for:
// - Rollback netcode (re-simulate past frames)
// - AI prediction (simulate future states without affecting gameplay)
// - Physics-based level validation in editor tools
var worldSettings = new PhysicsWorldSettings
{
    // WHY: Gravity in Box2D v3 is set per-world, not globally.
    gravity = new Vector2(0f, -9.81f),

    // WHY: Sub-stepping improves solver accuracy for fast-moving objects.
    // 4 sub-steps is a good balance of accuracy vs. performance.
    subStepCount = 4,

    // WHY: Enable continuous collision for the world.
    // Prevents fast objects from tunneling through thin colliders.
    enableContinuousCollision = true
};
```

### Deterministic Simulation

Box2D v3 guarantees bitwise-identical results across platforms when:

1. **Same inputs** are provided in the same order
2. **Same timestep** is used (`Time.fixedDeltaTime` must be constant)
3. **Same sub-step count** is configured
4. **No floating-point mode differences** (Unity 6.3 standardizes to IEEE 754 strict mode for 2D physics)

```csharp
// WHY: For deterministic networking, fix the timestep and never use Time.deltaTime.
// Record inputs per frame and replay them identically on all clients.
void ConfigureDeterministicPhysics()
{
    // WHY: Fixed timestep ensures the same number of physics steps per second.
    // 50 Hz (0.02s) is the Unity default; some competitive games use 60 Hz.
    Time.fixedDeltaTime = 1f / 50f;

    // WHY: Disable interpolation for deterministic replay —
    // interpolation is a visual smoothing that doesn't affect simulation.
    // Re-enable for display after validating determinism.
    Physics2D.simulationMode = SimulationMode2D.FixedUpdate;
}
```

---

## Visual Debugging (Runtime)

Box2D v3 exposes runtime debug rendering — visible in builds, not just the editor:

```csharp
using UnityEngine;

// WHY: Runtime physics debug visualization helps diagnose issues in builds
// where the editor's Gizmos aren't available. Useful for QA and playtesting.
public class Physics2DDebugRenderer : MonoBehaviour
{
    [SerializeField] private bool _showInBuilds = false;

    void OnEnable()
    {
        if (Application.isEditor || _showInBuilds)
        {
            // WHY: Physics2D.debugVisualization controls the Box2D v3 debug draw.
            // These flags map directly to Box2D's b2DebugDraw flags.
            Physics2D.debugVisualization.shapesEnabled = true;
            Physics2D.debugVisualization.jointsEnabled = true;
            Physics2D.debugVisualization.aabbEnabled = false; // noisy, enable when needed
            Physics2D.debugVisualization.contactPointsEnabled = true;
            Physics2D.debugVisualization.contactNormalsEnabled = true;
        }
    }

    void OnDisable()
    {
        Physics2D.debugVisualization.shapesEnabled = false;
        Physics2D.debugVisualization.jointsEnabled = false;
        Physics2D.debugVisualization.contactPointsEnabled = false;
        Physics2D.debugVisualization.contactNormalsEnabled = false;
    }
}
```

---

## Multi-Threading Details

Box2D v3 divides simulation into parallel phases:

```
Broadphase (parallel)     → Identify overlapping AABBs
    │
Narrowphase (parallel)    → Generate contact manifolds
    │
Solver (parallel islands) → Resolve contacts + joints per island
    │
Integration (parallel)    → Update positions + velocities
    │
Events (main thread)      → Dispatch OnCollisionEnter2D, etc.
```

### What This Means in Practice

```csharp
// WHY: Physics2D callbacks (OnCollisionEnter2D, OnTriggerEnter2D) still
// execute on the main thread — your callback code doesn't need to be thread-safe.
// The multi-threading is internal to the solver.

void OnCollisionEnter2D(Collision2D collision)
{
    // WHY: This runs on the main thread, after the multi-threaded solve.
    // Safe to modify game state, spawn particles, play audio, etc.
    Debug.Log($"Hit {collision.gameObject.name} with {collision.contactCount} contacts");
}
```

**Performance expectations:** For a scene with 500+ active Rigidbody2D bodies, Box2D v3's multi-threaded solver can be **2-4x faster** than the single-threaded Box2D 2.x backend. The improvement scales with core count and body count.

---

## Migration from Unity ≤ 6.2

### Automatic (No Action Required)

- All `Rigidbody2D`, `Collider2D`, `Joint2D` components work as before
- `Physics2D.Raycast()`, `OverlapCircle()`, etc. are unchanged
- `OnCollisionEnter2D` / `OnTriggerEnter2D` callbacks work identically

### Behavioral Changes to Watch For

```csharp
// 1. SOLVER BEHAVIOR — Box2D v3's TGS-Soft solver produces slightly different
// results than the Sequential Impulse solver. Stacks are MORE stable,
// but finely tuned physics puzzles may need parameter adjustment.

// 2. CONTACT EVENTS — Events are now batched. If you relied on callback ORDER
// within a single physics step, verify your assumptions.

// 3. VELOCITY ITERATIONS — The iteration count setting maps differently
// in Box2D v3. If you had custom Physics2D.velocityIterations, test with defaults first.

// 4. SLEEP THRESHOLDS — Box2D v3 uses different sleep heuristics.
// Bodies may sleep/wake at slightly different times.
// WHY: The new solver's soft contact model means less micro-bouncing,
// so bodies reach sleep state faster.
```

### Testing Checklist

- [ ] Run existing physics-heavy scenes and compare behavior
- [ ] Check stacking stability (should improve)
- [ ] Verify joints (hinge, spring, distance) behave as expected
- [ ] Profile with the Physics 2D Profiler module — look for thread utilization
- [ ] Test on mobile — multi-threading benefits depend on device core count

---

## Common Patterns

### One-Way Platforms (Platform Effector 2D)

```csharp
// WHY: PlatformEffector2D works unchanged on Box2D v3.
// The effector sets one-way collision filtering in the broadphase.
// Just attach it to a Collider2D with "Used By Effector" checked.

[RequireComponent(typeof(PlatformEffector2D))]
[RequireComponent(typeof(BoxCollider2D))]
public class OneWayPlatform : MonoBehaviour
{
    // WHY: Surface arc controls the angle range that blocks passage.
    // 180° = block from above only. Reduce for sloped platforms.
    void Awake()
    {
        var effector = GetComponent<PlatformEffector2D>();
        effector.surfaceArc = 170f; // slightly less than 180 for edge tolerance
    }
}
```

### Physics-Based Rope (Distance Joints)

```csharp
// WHY: Chain of Rigidbody2D + DistanceJoint2D creates a simple rope.
// Box2D v3's improved solver handles long chains more stably than Box2D 2.x.
public class RopeGenerator : MonoBehaviour
{
    [SerializeField] private int _segmentCount = 10;
    [SerializeField] private float _segmentLength = 0.5f;
    [SerializeField] private GameObject _segmentPrefab;

    void Start()
    {
        Rigidbody2D previousBody = GetComponent<Rigidbody2D>();
        previousBody.bodyType = RigidbodyType2D.Kinematic; // anchor

        for (int i = 0; i < _segmentCount; i++)
        {
            var segment = Instantiate(_segmentPrefab,
                transform.position + Vector3.down * _segmentLength * (i + 1),
                Quaternion.identity);

            var joint = segment.AddComponent<DistanceJoint2D>();
            joint.connectedBody = previousBody;
            joint.autoConfigureDistance = false;
            joint.distance = _segmentLength;

            // WHY: Max distance only = rope behavior (slack allowed).
            // Set both min and max for rigid rod behavior.
            joint.maxDistanceOnly = true;

            previousBody = segment.GetComponent<Rigidbody2D>();
        }
    }
}
```

---

## Performance Guidelines

| Scenario | Bodies | Recommendation |
|----------|--------|---------------|
| Platformer | 10–50 active | Default settings, no tuning needed |
| Physics puzzle | 50–200 active | Increase sub-steps to 6–8 for stability |
| Bullet-hell | 200–1000 active | Use triggers (not collisions) where possible; reduce sub-steps to 2 |
| Massive simulation | 1000+ active | Consider the low-level API for custom broadphase; use circle colliders (cheapest) |

### Profiling 2D Physics

Use the **Physics 2D Profiler module** in the Unity Profiler to monitor:

- `Physics2D.Step` — total simulation time per FixedUpdate
- `Physics2D.Broadphase` — AABB overlap detection time
- `Physics2D.Solver` — contact resolution time
- `Physics2D.Sync` — transform synchronization back to GameObjects
- Thread utilization — Box2D v3 shows worker thread usage in the Timeline view

```csharp
// WHY: For runtime performance monitoring, use Physics2D diagnostics.
void LogPhysics2DStats()
{
    var diag = Physics2D.GetDiagnostics();
    Debug.Log($"Bodies: {diag.bodyCount}, " +
              $"Contacts: {diag.contactCount}, " +
              $"Joints: {diag.jointCount}");
}
```

---

## Common Pitfalls

1. **Assuming identical behavior after upgrade** — Box2D v3's solver is fundamentally different. Physics puzzles with carefully tuned parameters may need re-tuning. Always test.

2. **Over-using continuous collision** — Continuous collision detection (CCD) is more expensive in Box2D v3 due to sub-stepping. Only enable it on fast-moving bodies (`Rigidbody2D.collisionDetectionMode = CollisionDetectionMode2D.Continuous`).

3. **Ignoring the threading model for custom queries** — While callbacks run on the main thread, issuing `Physics2D.Raycast()` from a background thread is **not safe**. All query APIs must be called from the main thread.

4. **Not leveraging determinism** — If you're building a networked game, Box2D v3's determinism is a significant architectural advantage. Design your input system to be deterministic from the start.

5. **Mixing 2D and 3D physics for the same objects** — `Rigidbody2D` and `Rigidbody` (3D) operate in completely separate simulation worlds. A `BoxCollider2D` will never interact with a `BoxCollider` (3D). Unity 6.3's 2D Renderer can render 3D meshes alongside sprites, but the physics remain separate.
