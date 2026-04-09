# E1 — Unity 6 Architecture Overview

> **Category:** explanation · **Engine:** Unity 6 (6000.x) · **Related:** [Unity Rules](../unity-arch-rules.md) · [G1 Scene Management](../guides/G1_scene_management.md) · [G2 Input System](../guides/G2_input_system.md)

Unity 6 is a general-purpose 2D/3D game engine using C# and .NET. This document explains the core architectural concepts, the two programming models (GameObject/Component and DOTS/ECS), and how they fit together in a production project.

---

## Engine Architecture at a Glance

```
┌──────────────────────────────────────────────────────────┐
│                     Your Game Code                        │
│  ┌─────────────┐  ┌─────────────┐  ┌──────────────────┐ │
│  │ MonoBehaviour│  │ DOTS / ECS  │  │ ScriptableObjects│ │
│  │ (GameObjects)│  │ (Entities)  │  │ (Data Assets)    │ │
│  └──────┬──────┘  └──────┬──────┘  └────────┬─────────┘ │
├─────────┼────────────────┼───────────────────┼───────────┤
│         │    Unity Runtime & Subsystems      │           │
│  ┌──────▼──────────────────▼─────────────────▼────────┐  │
│  │  Scene Manager · Physics (PhysX) · Input System    │  │
│  │  Audio (FMOD) · Animation · UI Toolkit · Navmesh   │  │
│  │  Addressables · Burst Compiler · Job System        │  │
│  └────────────────────┬──────────────────────────────┘  │
├───────────────────────┼──────────────────────────────────┤
│         Render Pipeline (URP / HDRP)                     │
│  ┌────────────────────▼──────────────────────────────┐  │
│  │  GPU Resident Drawer · SRP Batcher · Shader Graph │  │
│  └───────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

---

## Two Programming Models

### 1. GameObject / Component (MonoBehaviour)

This is Unity's traditional and most widely-used model. Every object in a scene is a **GameObject** — an empty container that gains behavior through attached **Components** (C# classes inheriting `MonoBehaviour`).

**How it works:**
- GameObjects live in a scene hierarchy (parent-child tree)
- Components define behavior (`Update()`, `FixedUpdate()`, `OnCollisionEnter()`)
- Communication via direct references, events, or the message system
- Serialization through the Inspector (public fields / `[SerializeField]`)

**When to use:** Most games. Prototyping, small-to-large teams, rich editor tooling, extensive Asset Store ecosystem. Unless you need to process thousands of similar entities per frame, this model is sufficient and faster to develop with.

```csharp
// A simple enemy component — this is the bread-and-butter of Unity dev
public class Enemy : MonoBehaviour
{
    [SerializeField] private EnemyData _data;  // ScriptableObject with tunable stats
    [SerializeField] private Transform _target;

    private float _currentHealth;

    private void Awake()
    {
        // WHY Awake and not Start: Awake runs when the object is created,
        // Start runs on the first frame. Initialize internal state in Awake
        // so other scripts can reference this enemy's health in their Start().
        _currentHealth = _data.maxHealth;
    }

    private void Update()
    {
        // Move toward target at the speed defined in the data asset
        Vector3 direction = (_target.position - transform.position).normalized;
        transform.position += direction * _data.moveSpeed * Time.deltaTime;
    }
}
```

### 2. DOTS / ECS (Data-Oriented Technology Stack)

DOTS is Unity's high-performance path, built on three pillars: the **Entity Component System** (ECS), the **C# Job System** (multithreading), and the **Burst Compiler** (LLVM-based native code generation).

**How it works:**
- **Entities** are lightweight IDs (not GameObjects)
- **Components** are unmanaged structs (`IComponentData`) — pure data, no logic
- **Systems** (`ISystem`) query for archetypes and process component data in tight loops
- Memory is laid out in contiguous chunks by archetype for cache efficiency

**When to use:** Thousands of similar entities (bullets, RTS units, crowd NPCs), physics simulations, procedural generation, anything that benefits from data-oriented cache-friendly iteration.

```csharp
// A DOTS component — just data, no behavior
public struct EnemyTag : IComponentData { }

public struct Health : IComponentData
{
    public float Current;
    public float Max;
}

// A Burst-compiled system that processes all entities with Health
[BurstCompile]
public partial struct HealthRegenSystem : ISystem
{
    [BurstCompile]
    public void OnUpdate(ref SystemState state)
    {
        float dt = SystemAPI.Time.DeltaTime;
        float regenRate = 1f; // HP per second

        // WHY foreach with SystemAPI.Query: This compiles to a tight loop
        // iterating over contiguous memory. For 10,000 entities this is
        // orders of magnitude faster than 10,000 MonoBehaviour.Update() calls.
        foreach (var health in SystemAPI.Query<RefRW<Health>>()
            .WithAll<EnemyTag>())
        {
            ref var h = ref health.ValueRW;
            h.Current = math.min(h.Current + regenRate * dt, h.Max);
        }
    }
}
```

### Hybrid: Using Both Together

Many production projects use **both models simultaneously**. This is not only valid — it's recommended:

| Layer | Model | Why |
|-------|-------|-----|
| Game flow, menus, cutscenes | MonoBehaviour | Easier to author, rich editor support |
| UI | UI Toolkit (MonoBehaviour-adjacent) | UXML/USS workflow, responsive layout |
| Player character | MonoBehaviour | Complex state machine, animation, camera |
| Thousands of projectiles | DOTS/ECS | Cache-friendly bulk processing |
| RTS unit simulation | DOTS/ECS | Efficient spatial queries + pathfinding |
| Audio, save/load | MonoBehaviour | Well-supported by existing APIs |

The `EntityManager` can bridge the two worlds — MonoBehaviours can create/destroy/query entities, and ECS systems can read managed component data via `class IComponentData` (at a performance cost).

---

## Core Subsystems

### Scene Management

Unity uses a scene-based workflow. Scenes contain hierarchies of GameObjects and can be loaded additively.

- **Bootstrap pattern:** One persistent scene (loaded first) holds managers. Game scenes are loaded/unloaded additively via `SceneManager.LoadSceneAsync()`.
- **Why additive loading?** It avoids `DontDestroyOnLoad` hacks, gives explicit control over what persists, and supports streaming open worlds.

### Physics

Unity 6 uses **PhysX** (NVIDIA) for 3D physics and **Box2D** for 2D physics.

- `FixedUpdate()` for physics logic (fixed timestep, default 50Hz)
- `Rigidbody` / `Rigidbody2D` for dynamic objects
- `Collider` / `Collider2D` for collision shapes
- Layer-based collision matrix for filtering

### Rendering

- **URP (Universal Render Pipeline):** Default for most projects. Mobile-friendly, extensible via Renderer Features.
- **HDRP (High Definition Render Pipeline):** AAA quality, PC/console only. Volumetric fog, ray tracing, area lights.
- **Shader Graph:** Node-based shader authoring (works with URP and HDRP).
- **GPU Resident Drawer (Unity 6):** Automatically batches compatible draw calls for massive scene complexity improvements.

### Audio

Unity's built-in audio uses FMOD internally. For most projects, the built-in `AudioSource` + `AudioMixer` workflow is sufficient. For complex needs (adaptive music, runtime mixing), consider the FMOD or Wwise integrations.

### UI Toolkit

Unity 6's recommended UI system for both runtime and editor UI:

- **UXML:** XML-based layout (analogous to HTML)
- **USS:** Style sheets (analogous to CSS)
- **C# bindings:** Query elements and bind data from code
- Supports responsive layout, transitions, and data binding

Legacy **Unity UI (uGUI)** with Canvas/RectTransform still works but is maintenance-mode.

### Input System

The **Input System package** replaces legacy `UnityEngine.Input`:

- **Input Actions:** Abstract actions (Jump, Move, Fire) from physical buttons
- **Action Maps:** Context-based groupings (Gameplay, UI, Vehicle)
- **Processor/Interaction pipeline:** Deadzone, invert, hold, tap — all configurable in the asset
- **PlayerInput component:** Automatic action map switching + event routing

---

## Lifecycle & Execution Order

Understanding Unity's execution order prevents subtle bugs:

```
Awake()           → Initialize self (called once, even if disabled)
OnEnable()        → Subscribe to events
Start()           → Initialize references to other objects (called once, first frame)
FixedUpdate()     → Physics logic (fixed timestep, may run 0-N times per frame)
Update()          → Game logic (once per frame)
LateUpdate()      → Camera follow, post-processing (after all Updates)
OnDisable()       → Unsubscribe from events
OnDestroy()       → Final cleanup
```

> **Key rule:** Initialize internal state in `Awake()`, initialize cross-references in `Start()`. This way, by the time any `Start()` runs, all `Awake()` calls have already completed.

---

## Performance Mindset

1. **Profile first, optimize second.** Use the Unity Profiler and Frame Debugger before making assumptions.
2. **Object pooling** for frequently spawned/despawned objects (bullets, particles, UI elements).
3. **Assembly Definitions (.asmdef)** to split compilation — faster iteration, cleaner dependencies.
4. **Addressables** for async asset loading and memory management.
5. **Burst + Jobs** for CPU-intensive work (pathfinding, procedural generation).
6. **SRP Batcher + GPU Instancing** for draw call reduction (automatic in URP with compatible shaders).
