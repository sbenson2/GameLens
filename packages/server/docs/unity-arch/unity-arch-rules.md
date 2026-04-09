# Unity 6 — AI Code Generation Rules

Engine-specific rules for Unity 6 (6000.x) projects using C#. These supplement the engine-agnostic rules in `docs/core/ai-workflow/gamedev-rules.md`.

---

## ⚠️ Unity Version Pitfalls — Critical Differences

Unity 6 is the successor to the Unity 2022 LTS line. It adopts a new versioning scheme (6000.x internally) and ships with several API changes. Most online tutorials, StackOverflow answers, and AI training data reference Unity 2021/2022 patterns. **Always target Unity 6 APIs.**

### Key API Changes in Unity 6

| Legacy (WRONG) | Unity 6 (CORRECT) | Notes |
|---|---|---|
| `FindObjectOfType<T>()` | `FindAnyObjectByType<T>()` | Non-deterministic but faster; use `FindFirstObjectByType<T>()` when order matters |
| `Random.Range()` in jobs | `Unity.Mathematics.Random` | Burst-compatible RNG |
| `UnityEngine.Vector3` in DOTS | `Unity.Mathematics.float3` | Required for Burst compilation |
| `SystemBase` / `Entities.ForEach` | `ISystem` + `SystemAPI` | Preferred DOTS pattern in Unity 6 |
| Legacy Input (`Input.GetKey`) | Input System package (`InputAction`) | New Input System is the default |
| `OnGUI()` / IMGUI for game UI | UI Toolkit (`UIDocument`, UXML, USS) | IMGUI reserved for editor tools only |
| `Resources.Load()` | Addressables (`Addressables.LoadAssetAsync`) | Resources folder is legacy; Addressables handle async + remote |

### Rendering Pipeline

Unity 6 defaults to the **Universal Render Pipeline (URP)** for most projects and **High Definition Render Pipeline (HDRP)** for AAA. The Built-in Render Pipeline is legacy.

```csharp
// WRONG: Shader references that assume Built-in RP
material.shader = Shader.Find("Standard");

// CORRECT: URP-compatible shaders
material.shader = Shader.Find("Universal Render Pipeline/Lit");
```

**GPU Resident Drawer** is new in Unity 6 — it batches draw calls automatically for complex scenes. Enable it in Project Settings → Graphics for significant rendering performance gains.

---

## Architecture Rules

### Project Structure Conventions

```
Assets/
├── _Project/              # All project-specific content lives here
│   ├── Art/               # Sprites, textures, models, materials
│   ├── Audio/             # Music, SFX, mixer groups
│   ├── Prefabs/           # Prefab assets
│   ├── Scenes/            # Scene files
│   ├── Scripts/           # C# source organized by feature
│   │   ├── Core/          # Game manager, bootstrap, service locators
│   │   ├── Player/        # Player controller, input, camera
│   │   ├── Enemies/       # Enemy AI, spawning
│   │   ├── UI/            # UI Toolkit documents and controllers
│   │   ├── Systems/       # DOTS systems (if using ECS)
│   │   └── Data/          # ScriptableObjects, configs
│   ├── Settings/          # URP/HDRP render pipeline assets
│   └── UI/                # UXML + USS files for UI Toolkit
├── Plugins/               # Third-party native plugins
└── StreamingAssets/        # Files that must be accessed by path at runtime
```

> **Why `_Project/`?** The underscore prefix sorts it to the top of the Project window, keeping project assets separate from imported packages. This convention is widely adopted and prevents merge conflicts with Asset Store imports.

### Two Architecture Paths

Unity supports two distinct programming models. Choose based on project needs:

**1. MonoBehaviour (GameObject/Component) — Default for most projects**
- Attach scripts to GameObjects in a scene hierarchy
- Ideal for: prototyping, small-to-medium games, teams new to Unity
- UI via UI Toolkit or Unity UI (uGUI)

**2. DOTS/ECS (Data-Oriented Technology Stack) — Performance-critical systems**
- Entities + Components (structs) + Systems pattern
- Ideal for: thousands of entities, simulation-heavy games, bullet-hell, RTS
- Use `ISystem` + `SystemAPI` (not legacy `SystemBase`)
- Requires `Unity.Mathematics` types and Burst compiler

**Hybrid approach is valid:** Use MonoBehaviours for high-level game flow, UI, and scene management, and DOTS for performance-critical inner loops (physics simulation, AI for large crowds, particle-like effects).

---

## MonoBehaviour Code Generation Rules

### Component Responsibilities

Each MonoBehaviour should have a **single responsibility**. Do not put movement, health, input, and rendering logic in one script.

```csharp
// WRONG: God component
public class Player : MonoBehaviour
{
    void Update()
    {
        HandleInput();
        Move();
        CheckHealth();
        UpdateUI();
        PlayAnimations();
    }
}

// CORRECT: Separated concerns
// PlayerMovement.cs — handles physics-based movement
// PlayerHealth.cs — tracks HP, damage, death
// PlayerInput.cs — reads from Input System, raises events
// PlayerAnimator.cs — drives Animator based on state
```

### ScriptableObjects for Data

Use ScriptableObjects to define data assets (enemy stats, item definitions, level configs). This separates data from logic and allows designers to tune values without code changes.

```csharp
// ScriptableObject for enemy configuration — lives as an asset in the project
[CreateAssetMenu(fileName = "EnemyData", menuName = "Game/Enemy Data")]
public class EnemyData : ScriptableObject
{
    [Header("Combat")]
    public int maxHealth = 100;
    public float moveSpeed = 3.5f;
    public float attackRange = 1.5f;
    public int attackDamage = 10;

    [Header("Loot")]
    public int xpReward = 25;
    public LootTable lootTable;
}
```

### Event-Driven Communication

Prefer events over direct references between systems. This reduces coupling and makes systems testable in isolation.

```csharp
// Use C# events or UnityEvents for loose coupling
// WHY: Systems don't need direct references to each other,
// making them independently testable and reorderable.

public class PlayerHealth : MonoBehaviour
{
    public event System.Action<int, int> OnHealthChanged; // current, max
    public event System.Action OnDied;

    private int _current;

    public void TakeDamage(int amount)
    {
        _current = Mathf.Max(0, _current - amount);
        OnHealthChanged?.Invoke(_current, _maxHealth);

        if (_current <= 0)
            OnDied?.Invoke();
    }
}
```

---

## DOTS / ECS Code Generation Rules

### Components: IComponentData Structs

Components MUST be unmanaged structs implementing `IComponentData`. No managed types (strings, arrays, classes).

```csharp
// CORRECT: Pure unmanaged data component
public struct Position : IComponentData
{
    public float3 Value;
}

public struct MoveSpeed : IComponentData
{
    public float Value;
}

// WRONG: Managed types in components (will not Burst-compile)
public struct BadComponent : IComponentData
{
    public string Name;        // ILLEGAL: managed type
    public List<int> Items;    // ILLEGAL: managed type
}
```

### Systems: Use ISystem + SystemAPI

```csharp
// CORRECT: ISystem with SystemAPI — Burst-compatible, preferred in Unity 6
[BurstCompile]
public partial struct MovementSystem : ISystem
{
    [BurstCompile]
    public void OnUpdate(ref SystemState state)
    {
        float dt = SystemAPI.Time.DeltaTime;

        // WHY: SystemAPI.Query generates optimized iteration code at compile time.
        // This runs over tightly packed memory — much faster than MonoBehaviour Update().
        foreach (var (transform, speed) in
            SystemAPI.Query<RefRW<LocalTransform>, RefRO<MoveSpeed>>())
        {
            transform.ValueRW.Position += new float3(0, 0, speed.ValueRO.Value * dt);
        }
    }
}

// WRONG: Legacy SystemBase pattern (still works but not recommended)
public partial class LegacyMovementSystem : SystemBase
{
    protected override void OnUpdate()
    {
        Entities.ForEach((ref Translation pos, in MoveSpeed speed) => { ... }).Schedule();
    }
}
```

---

## Input System Rules

Always use the **Input System package** (com.unity.inputsystem), never legacy `UnityEngine.Input`.

```csharp
// CORRECT: Input System with generated C# class from .inputactions asset
// WHY: Type-safe, supports rebinding, works across all platforms
public class PlayerInput : MonoBehaviour
{
    private GameInputActions _input;

    private void OnEnable()
    {
        _input = new GameInputActions();
        _input.Gameplay.Enable();
        _input.Gameplay.Jump.performed += OnJump;
    }

    private void OnDisable()
    {
        _input.Gameplay.Jump.performed -= OnJump;
        _input.Gameplay.Disable();
    }

    private void OnJump(InputAction.CallbackContext ctx)
    {
        // Handle jump
    }
}
```

### Action Map Best Practices

- **One Action Map per context:** `Gameplay`, `UI`, `Vehicle`, `Dialogue`
- **Only one map active at a time** — disable the current before enabling the next
- **Generate C# class** from the `.inputactions` asset for type safety

---

## Object Pooling Rules

Use the `UnityEngine.Pool` API (available since Unity 2021, fully supported in Unity 6) instead of hand-rolled pools or `Instantiate()`/`Destroy()` in hot paths.

```csharp
// WRONG: Instantiate and Destroy in gameplay — causes GC spikes
Destroy(bullet);
var newBullet = Instantiate(bulletPrefab);

// CORRECT: Use ObjectPool<T> from UnityEngine.Pool
_pool.Release(bullet);      // Return to pool (no GC)
var reused = _pool.Get();   // Reuse from pool (no alloc)
```

- Always set `maxSize` on pools to prevent unbounded memory growth
- Pre-warm pools during loading screens to avoid first-frame Instantiate spikes
- Reset ALL object state in `OnEnable()` — pooled objects carry state from previous use
- Use `ListPool<T>` / `HashSetPool<T>` / `DictionaryPool<T>` for temporary collections in hot paths
- Call `pool.Dispose()` in `OnDestroy()` to clean up pooled objects

---

## Dependency Management Rules

Prefer explicit dependency passing over implicit lookups. Choose the right level for your project:

| Project Size | Approach |
|-------------|----------|
| Prototype / jam | `[SerializeField]` Inspector references |
| Small indie | Service Locator + ScriptableObject events |
| Medium+ | VContainer DI framework with LifetimeScope per scene |

```csharp
// WRONG: Hidden dependency via global lookup
var audio = FindAnyObjectByType<AudioManager>();
var audio = AudioManager.Instance;  // Singleton anti-pattern

// BETTER: Explicit injection (framework-free)
public void Initialize(IAudioService audio) { _audio = audio; }

// BEST: VContainer auto-injection
[Inject] public void Construct(IAudioService audio) { _audio = audio; }
```

- Use interfaces for dependencies to enable testing and swapping implementations
- Register services in a bootstrap scene (composition root) or VContainer LifetimeScope
- For runtime-instantiated prefabs with VContainer, use `IObjectResolver.Instantiate()` not `Object.Instantiate()`

---

## Terrain Rules

- Use URP or HDRP terrain shaders — Built-in RP terrain is legacy
- Keep terrain layers to **4 or fewer per tile** to avoid extra rendering passes (critical on mobile)
- Set `Terrain.SetNeighbors()` on adjacent tiles to prevent LOD seam artifacts
- Detail object distance should be tuned per quality level (60–100m typical, not the 250m default)
- Trees placed on terrain are NOT GameObjects — they use an efficient instanced renderer
- Enable **GPU Resident Drawer** (Unity 6) for static environment props around terrain
- For large worlds (>2km²), tile terrain and stream tiles based on camera proximity

---

## Render Graph Rules (Unity 6.1+)

Starting with Unity 6.1, the Render Graph API is the **only** way to extend URP with custom rendering — the legacy `ScriptableRenderPass.Execute()` method is deprecated.

1. **Never issue GPU commands during recording** — `RecordRenderGraph()` declares resources; the `SetRenderFunc` callback emits commands
2. **Execution functions MUST be static** — this prevents accidental capture of pass state
3. **Declare all resource access** — use `builder.UseTexture()`, `builder.SetRenderAttachment()`, `builder.UseBuffer()` so the graph compiler can track dependencies
4. **Prefer `CreateTexture()` over `ImportTexture()`** — graph-managed textures get automatic lifetime and aliasing; imported textures are opaque to the compiler
5. **Use `AddComputePass`** for compute shaders, not `AddRasterRenderPass` — they have different context types (`ComputeGraphContext` vs `RasterGraphContext`)
6. **Test subpass merging on mobile** — consecutive raster passes writing to the same attachments can be merged automatically; inserting a compute pass between them breaks the chain

See [G39 Render Graph Custom Passes](guides/G39_render_graph_custom_passes.md) for detailed patterns and examples.

---

## GPU-Driven Rendering Rules

Unity 6 introduced GPU Resident Drawer and GPU Occlusion Culling. Follow these rules to avoid silent failures:

1. **Set BatchRendererGroup Variants to "Keep All"** in Project Settings → Graphics → Shader Stripping — without this, the feature silently falls back to CPU rendering
2. **Use Forward+ rendering path** — GPU Resident Drawer requires it (not Forward or Deferred)
3. **Disable Static Batching** when using GPU Resident Drawer — they are mutually exclusive
4. **Verify via Frame Debugger** — look for "Hybrid Batch Group" draw calls; their absence means setup is incomplete
5. **Don't expect BRG to help animated characters** — SkinnedMeshRenderers, particles, and VFX Graph are excluded

See [G40 GPU-Driven Rendering & Upscaling](guides/G40_gpu_rendering_optimization.md) for setup steps, STP upscaling, and the Camera History API.

---

## Accessibility Rules

Unity 6 provides native screen reader integration. When generating code that involves UI or game HUD:

1. **Build an `AccessibilityHierarchy`** separate from the visual UI tree — it works with UI Toolkit, uGUI, or custom rendering
2. **Set meaningful labels and roles** on every interactive node — the screen reader reads these aloud
3. **Swap `AssistiveSupport.activeHierarchy`** when screens change — only one hierarchy is active at a time
4. **Respect `AccessibilitySettings.fontScale`** — users may need larger text
5. **Test with actual screen readers** (TalkBack, VoiceOver, Narrator) — the Hierarchy Viewer is helpful but not a substitute

See [G41 Accessibility](guides/G41_accessibility.md) for the full API reference and inclusive design practices.

---

## Procedural Mesh Rules

When generating code that creates meshes at runtime:

1. **Never use the simple Mesh API (`.vertices`, `.triangles`) in hot paths** — each assignment allocates managed arrays. Use `SetVertexBufferData` with `NativeArray<T>` or the `MeshDataArray` pipeline
2. **Use `MeshDataArray` + Jobs + Burst for per-frame mesh updates** — `Mesh.AllocateWritableMeshData()` gives you writable buffers accessible from worker threads
3. **Use the `NativeArray<VertexAttributeDescriptor>` overload of `SetVertexBufferParams`** — the `params[]` overload allocates a managed array and is not Burst-compatible
4. **Always dispose `MeshDataArray`** — writable arrays via `ApplyAndDisposeWritableMeshData()`, read-only arrays via `.Dispose()`. Leaking causes native memory growth
5. **Set `MeshUpdateFlags.DontRecalculateBounds` when setting bounds manually** — avoids a full vertex scan on every update
6. **Use UInt16 index format for meshes under 65535 vertices** — saves memory; switch to UInt32 only when needed
7. **Throttle `MeshCollider` updates** — BVH rebuild is expensive; update at 4–10 Hz, not every frame

See [G56 Procedural Mesh Generation](guides/G56_procedural_mesh_generation.md) for the three authoring paths with full code examples.

---

## Animation Rigging Rules

When generating code that uses the Animation Rigging package for runtime IK and procedural constraints:

1. **Parent IK targets under a static root, never under animated bones** — targets parented to bones move with the animation, defeating the purpose of IK
2. **Lerp rig weights over multiple frames** — snapping weight from 0→1 causes visual pops. Use `Mathf.MoveTowards` or `Mathf.Lerp`
3. **Disable Rig components on distant characters** — constraints with weight 0 are still evaluated; disable the Rig component entirely to save animation thread time
4. **Use `Physics.RaycastNonAlloc` for foot IK ground detection** — per-foot raycasts every frame add up; avoid allocating `RaycastHit[]` arrays
5. **Call `RigBuilder.Build()` after adding/removing constraints at runtime** — the Playable graph must be rebuilt to reflect structural changes
6. **Use `Animator.ResetControllerState()` (Unity 6.3+) when reusing pooled characters** — clears stale animation state before reconfiguring rigs

See [G57 Animation Rigging & Procedural Animation](guides/G57_animation_rigging_procedural.md) for setup patterns, foot IK, aim rigs, and custom constraints.

---

## 2D Physics Rules (Box2D v3 — Unity 6.3+)

Unity 6.3 replaces the Box2D 2.x backend with Box2D v3. The high-level API (`Rigidbody2D`, `Collider2D`, `Physics2D`) is unchanged, but the solver behavior differs:

1. **Expect slightly different simulation results after upgrading** — the TGS-Soft solver is more stable than Sequential Impulse but produces different contact responses. Re-test finely tuned physics puzzles
2. **Use `Rigidbody2D.linearVelocity` instead of the deprecated `.velocity`** — naming consistency with 3D physics
3. **Leverage cross-platform determinism for networked games** — fix `Time.fixedDeltaTime` to a constant value and design deterministic input recording from the start
4. **All Physics2D query APIs must be called from the main thread** — the multi-threading is internal to the solver; callbacks and queries remain single-threaded
5. **Use the runtime debug visualization API for build-time debugging** — `Physics2D.debugVisualization` exposes Box2D v3's debug draw in player builds
6. **Only enable CCD on bodies that need it** — continuous collision is more expensive in Box2D v3 due to sub-stepping

See [G58 2D Physics: Box2D v3](guides/G58_2d_physics_box2d_v3.md) for migration checklist, low-level API, and performance profiling.

---

## Common Pitfalls to Avoid

1. **Don't use `Resources/` folder** — use Addressables for async loading and memory management
2. **Don't use `Find()` at runtime** — cache references in `Awake()` or use dependency injection
3. **Don't use `Update()` for everything** — use coroutines, InvokeRepeating, or event-driven patterns for infrequent logic
4. **Don't mix render pipelines** — pick URP or HDRP early; shaders are NOT cross-compatible
5. **Don't ignore assembly definitions** — use .asmdef files to split compilation units and speed up iteration
6. **Don't put game logic in `Awake()`/`Start()` execution order** — use a bootstrap scene with explicit initialization
7. **Don't use `DontDestroyOnLoad` freely** — prefer a persistent bootstrap scene that loads/unloads game scenes additively
8. **Don't use `Instantiate()`/`Destroy()` in hot paths** — use `UnityEngine.Pool.ObjectPool<T>` for frequently spawned objects
9. **Don't scatter dependencies via FindObject/singletons** — use explicit injection or a service locator
10. **Don't use synchronous GPU readback** (`ComputeBuffer.GetData()`) in gameplay — use `AsyncGPUReadback.Request()` to avoid stalling the GPU pipeline. See [G43 Compute Shaders](guides/G43_compute_shaders_gpu_programming.md)
11. **Don't use Burst 1.6 patterns** (function pointers only) when direct call is available — Burst 1.8+ supports `[BurstCompile]` on static methods without jobs. See [G42 Burst Compiler](guides/G42_burst_compiler_jobs_system.md)

---

## Unity 6 Migration

When generating code for projects upgrading from Unity 2022 LTS to Unity 6, always apply the breaking API changes documented in [G44 Unity 6 Migration & New Features](guides/G44_unity6_migration_new_features.md). The most common required changes:

1. `FindObjectsOfType<T>()` → `FindObjectsByType<T>(FindObjectsSortMode.None)`
2. `GraphicsFormat.DepthAuto` / `ShadowAuto` → explicit format checks
3. `ExecuteDefaultAction` → `HandleEventBubbleUp` (UI Toolkit)
4. Enlighten Baked GI → Progressive Lightmapper (automatic migration)
5. Android Gradle templates → C# API (`Player Settings → Upgrade templates to C#`)

---

## Source Generators

Unity 6 supports C# source generators (Roslyn-based, compile-time code generation). When generating boilerplate-heavy patterns (component caching, event wiring, serialization), consider whether a source generator approach would be more maintainable than runtime reflection.

1. **Source generator DLLs must target .NET Standard 2.0** and use `Microsoft.CodeAnalysis.CSharp` version **4.3.x** (newer versions silently fail in Unity)
2. **Label the DLL as `RoslynAnalyzer`** in the Plugin Inspector — without this exact label, Unity ignores the generator
3. **Use `IIncrementalGenerator`** over the legacy `ISourceGenerator` API for better recompilation performance
4. **Use `partial` classes** to let generated code extend user-written MonoBehaviours

See [G45 Source Generators](guides/G45_source_generators.md) for a full walkthrough with examples.

---

## Unity AI Editor Tools (6.2+)

Unity AI (successor to Muse, retired Oct 2025) provides in-editor AI assistance. When working with AI-generated code:

1. **Always review diffs** — the Assistant sometimes generates deprecated Unity 2021-era APIs
2. **Cross-reference generated code with these rules** — ensure correct render pipeline, Input System usage, and Unity 6 API patterns
3. **Generated assets are starting points, not finals** — Unity does not offer IP indemnification for AI-generated content
4. **The Inference Engine (runtime ML) is the renamed Sentis** — existing `Unity.Sentis` code is source-compatible

See [G46 Unity AI Tools](guides/G46_unity_ai_tools.md) for capabilities, limitations, and workflow guidance.

---

## DirectStorage & Asset Loading (6.4+)

Unity 6.4 adds Microsoft DirectStorage for Windows Standalone builds, accelerating texture, mesh, and ECS data loading by up to 40% on NVMe hardware.

1. **Enable via Player Settings** → Other Settings → Configuration → Enable DirectStorage
2. **Requires DirectX 12** as the active graphics API — D3D11 silently falls back to standard I/O
3. **Use Addressables, not `Resources.Load()`** — Addressables go through `AsyncReadManager` which benefits from DirectStorage
4. **Use LZ4 compression** for AssetBundles (not LZMA) — LZ4 supports random access needed for efficient streaming
5. **Batch concurrent loads** — fire multiple `Addressables.LoadAssetAsync` calls concurrently to let DirectStorage optimize the I/O queue

See [G47 DirectStorage & Asset Loading](guides/G47_directstorage_asset_loading.md) for setup, profiling, and migration checklist.

---

## ECS as Core Package (6.4+)

Starting with Unity 6.4, the Entities, Collections, Mathematics, and Entities Graphics packages are **core engine packages** — they ship with the editor and are always available.

1. **`InstanceID` is deprecated for entity references** — use `EntityId` instead
2. **`EntityId` expands to 8 bytes in 6.5** — never cast to `int` or store in fixed-size 4-byte fields; treat as an opaque identifier
3. **URP Compatibility Mode is fully removed** — all custom render passes must use the Render Graph API; legacy `ScriptableRenderPass.Execute()` no longer functions
4. **Package versions are locked to the editor version** — you cannot pin an older Entities package; test against the shipping version
5. **Use `SystemAPI.Query` exclusively** — `Entities.ForEach` is deprecated and may be removed in a future version
6. **Use `IEnableableComponent` for state toggles** — avoid structural changes (`AddComponent`/`RemoveComponent`) in simulation hot paths
7. **Project Auditor is built-in** — it now detects ECS anti-patterns (missing Burst, excessive structural changes, archetype fragmentation)

See [G52 ECS Core Integration](guides/G52_ecs_core_integration_64.md) for the full guide.

---

## CoreCLR & .NET Modernization (6.7–6.8)

Unity is replacing Mono with Microsoft CoreCLR. The experimental CoreCLR desktop player ships in 6.7; Mono is removed in 6.8.

### Prepare Now (6.4+)

1. **Enable Enter Play Mode without Domain Reload** — Edit → Project Settings → Editor → Enter Play Mode Settings → uncheck Reload Domain. Fix every static-state bug this reveals; they will be real bugs under CoreCLR
2. **Use `[RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]`** to reset static state — never rely on domain reload to clear statics
3. **Remove all `BinaryFormatter` usage** — removed in .NET 10. Use `JsonUtility`, MessagePack, or MemoryPack instead
4. **Audit reflection-heavy code** — `Type.GetType()` and `Activator.CreateInstance()` are fragile under NativeAOT/IL2CPP stripping. Use `[Preserve]`, `link.xml`, or source generators
5. **Build with IL2CPP regularly** — IL2CPP's AOT compilation is the closest proxy for CoreCLR's stricter type checking
6. **Source generators will transition to standard MSBuild references** — keep generators on .NET Standard 2.0 for backward compat, but avoid hard dependencies on Unity's custom compilation pipeline
7. **`SerializeReference` validation is enforced** — ancestor classes must have `[Serializable]` or you'll get editor warnings (6.4) and errors (6.5+)

### Modern C# Features (Available Under CoreCLR / .NET 10 / C# 14)

- `ValueTask<T>` for zero-alloc async when results are often synchronous
- `params ReadOnlySpan<T>` for variadic methods without array allocation
- `field` keyword in properties to eliminate backing field boilerplate
- Extension types for adding methods + state to existing types
- Primary constructors for compact helper classes

See [G51 CoreCLR Migration](guides/G51_coreclr_dotnet_modernization.md) for the full preparation checklist and code examples.

---

## Visual Scripting Rules

When generating Visual Scripting guidance or integrating C# with Visual Scripting graphs:

1. **Use Custom Events for C# → VS communication** — `CustomEvent.Trigger(gameObject, "EventName", args)` is the primary bridge; never use SendMessage
2. **Use custom Unit nodes for complex operations** — wrap multi-step C# logic into a single node with clear ports; designers should see "Spawn Enemy", not 15 raw API nodes
3. **Regenerate nodes after adding custom types** — Edit → Project Settings → Visual Scripting → Regenerate Nodes; without this, new nodes and types won't appear in the fuzzy finder
4. **Default to Graph variable scope** — only escalate to Object, Scene, or Application scope when multiple graphs genuinely share data
5. **Never put performance-critical logic in VS graphs** — Visual Scripting has 3-50x overhead per node vs compiled C#; use it for high-level flow (triggers, dialogue, level scripting) not inner loops
6. **Reset static state for domain reload** — custom nodes with static fields must use `[RuntimeInitializeOnLoadMethod]` to reset on play mode entry

See [G59 Visual Scripting](guides/G59_visual_scripting.md) for the full guide.

---

## Custom Package (UPM) Rules

When generating package code or advising on package structure:

1. **Follow the standard UPM directory layout exactly** — `Runtime/`, `Editor/`, `Tests/`, `Samples~/` with proper asmdef files in each
2. **Editor asmdef must reference Runtime asmdef** — this is the #1 custom package bug; without it, editor scripts get "type not found" errors
3. **Test assemblies need three critical fields** — `overrideReferences: true`, `precompiledReferences: ["nunit.framework.dll"]`, `defineConstraints: ["UNITY_INCLUDE_TESTS"]`; missing any leaks tests into player builds
4. **Use version defines for optional dependencies** — don't force users to install packages they don't need; wrap optional code in `#if YOURPACKAGE_OPTIONAL_DEP`
5. **Reset static state in package code** — packages must work with Enter Play Mode without Domain Reload; use `[RuntimeInitializeOnLoadMethod(SubsystemRegistration)]`
6. **Use `Samples~/` (with tilde)** — without the tilde, sample code imports immediately and may cause compile errors
7. **Follow semantic versioning strictly** — MAJOR for breaking changes, MINOR for features, PATCH for fixes

See [G60 Custom Package Development](guides/G60_custom_package_development.md) for the full guide.

---

## Graph Toolkit Rules (6.2+)

When generating custom editor graph tools using Graph Toolkit:

1. **Graph Toolkit is editor-only** — it has no runtime; you must build your own interpreter or export pipeline to consume graph data in builds
2. **Mark all Graph and Node classes `[Serializable]`** — without this, data is lost on domain reload
3. **Keep Graph Toolkit code in Editor assemblies** — reference `Unity.GraphToolkit.Editor` and `Unity.GraphToolkit.Common.Editor`; runtime code must never reference these
4. **Use typed ports for connection safety** — define custom structs (e.g., `DialogueFlow`, `DataFloat`) as port types so users can't make invalid connections
5. **Plan the export pipeline from day one** — how does editor graph data become runtime data? ScriptableObject export, JSON, or source generation
6. **Prefer Graph Toolkit over legacy GraphView** — GraphView is deprecated and won't receive new features

See [G61 Graph Toolkit](guides/G61_graph_toolkit.md) for the full guide.

---

## Unity 6.4 Additional Breaking Changes

1. **PVRTC texture format removed** — use ASTC or ETC for mobile
2. **Physics module is now optional** — disable `com.unity.modules.physics` to reduce build size for 2D-only or custom physics projects
3. **Animation entry transitions** — enable "Evaluate Entry Transitions On Start" on Animator controllers to fix one-frame-delay glitches on spawn
4. **Terrain drag-and-drop** — terrain layers and materials now support drag-and-drop in the Inspector
5. **Web multithreading** — Burst-compiled jobs run on background worker threads in WebGL/WebGPU builds; verify thread-safety of shared NativeContainers

---

## Unified Ray Tracing Rules (6.3+)

The UnifiedRayTracing API (`com.unity.render-pipelines.core` 17.3+) provides cross-platform ray tracing with a compute-shader fallback for GPUs without hardware RT support.

1. **Always check `SystemInfo.supportsRayTracing`** — use it to select backend type and scale ray counts (hardware = more rays, compute = fewer + denoise)
2. **Dispose `RayTracingContext`, `IRayTracingAccelStruct`, and `IRayTracingShader`** in `OnDestroy()` — they own native GPU resources
3. **Call `Build()` after every structural or transform change** — the unified API does NOT auto-sync with the scene like `RayTracingAccelerationStructure`
4. **Use `PreferFastBuild` for dynamic scenes, `PreferFastTrace` for static** — choose the right BVH optimization for your rebuild frequency
5. **Mesh geometries only** — the unified API does not support procedural AABBs or custom intersection shaders; use the hardware-only `RayTracingShader` API if you need those
6. **Dispatch at half resolution for AO / GI** — bilateral upsample to full res for 4× fewer rays with minimal quality loss
7. **Never mix unified and hardware-only ray tracing APIs on the same acceleration structure** — they are separate systems with incompatible data

See [G71 Unified Ray Tracing API](guides/G71_unified_ray_tracing_api.md) for the full guide.

---

## PSO Tracing & Shader Warming Rules (6.0+, Experimental)

The `GraphicsStateCollection` API traces and pre-compiles Pipeline State Objects (PSOs) to eliminate first-use shader compilation stutters.

1. **Trace PSOs for every level, quality tier, and target graphics API** — PSOs are specific to the combination of shader variant + render state + graphics API
2. **Warm collections during loading screens, not gameplay** — use `WarmUpProgressively` to spread cost across frames, or `WarmUp` with `JobHandle` during a blocking load
3. **Enable `traceCacheMisses` in development builds** — captures PSOs not in the collection so you can add them before shipping
4. **Retrace after any shader or material change** — modified shaders invalidate all previously recorded PSOs
5. **Strip per platform at build time** — a DX12 `.graphicsstate` file is useless on Metal; ship only the matching collection
6. **Verify with Profiler** — if you see `Shader.CreateGPUProgram` or `CreateGraphicsPipelineImpl` markers during gameplay (not loading), you have uncovered PSOs
7. **Compute shaders and ray tracing shaders are NOT supported** — `GraphicsStateCollection` covers rasterization PSOs only
8. **This is an experimental API** — it may change or be removed in future Unity versions

See [G72 PSO Tracing & Shader Warming](guides/G72_pso_tracing_shader_warming.md) for the full guide.

---

## Async Instantiation Rules (6.0+)

`Object.InstantiateAsync` moves prefab deserialization and hierarchy construction off the main thread.

1. **Use `InstantiateAsync` for complex prefabs (5+ components, deep hierarchies)** — simple prefabs (< 1 ms sync) may not benefit due to scheduling overhead
2. **Batch with the `count` parameter** — `InstantiateAsync(prefab, 50)` is significantly faster than 50 individual calls
3. **Use `allowSceneActivation = false` to control integration timing** — defer Awake/OnEnable to a specific frame (e.g., between waves, during transitions)
4. **Pre-warm object pools with InstantiateAsync during loading screens** — at runtime, use synchronous `ObjectPool.Get()` for zero-latency spawns
5. **Always support cancellation** — pass `CancellationToken` and cancel in `OnDestroy()` to avoid orphaned instantiations
6. **Never call `WaitForCompletion()` during gameplay** — it blocks the main thread, defeating the purpose of async
7. **Call `Resources.UnloadUnusedAssets()` after scene unloads** — memory from unloaded scenes persists until explicitly freed
8. **Set `priority` to low for background streaming** — prevents streaming instantiations from competing with player-initiated spawns

See [G73 Async Instantiation & Content Streaming](guides/G73_async_instantiation_content_streaming.md) for the full guide.

---

## STP Upscaling Rules (6.0+)

Spatial-Temporal Post-Processing (STP) is Unity's built-in software upscaler — a cross-platform alternative to DLSS/FSR/XeSS that works on desktop, console, and compute-capable mobile.

1. **Enable via URP Asset** → Quality → Upscaling Filter → Spatial-Temporal Post-Processing (STP)
2. **STP requires Shader Model 5.0 compute shaders** — OpenGL ES is NOT supported, even on devices with compute
3. **STP implicitly enables TAA** — if TAA is not selected, STP enables it automatically (temporal data is required)
4. **STP stays active at Render Scale 1.0** — it still applies temporal anti-aliasing benefits even without resolution scaling
5. **Render UI in a separate overlay camera** — UI rendered before STP upscaling will appear blurry
6. **Combine with GPU Resident Drawer** — STP reduces fill-rate cost, GRD reduces draw-call cost; compound gains
7. **Test at your target render scale** — don't develop at 1.0 and ship at 0.5; quality and ghosting differ significantly at lower scales

See [G74 STP Upscaling](guides/G74_stp_upscaling.md) for the full guide.

---

## Scriptable Audio Processor Rules (6.3+)

Unity 6.3 introduces Burst-compiled scriptable audio processors for extending the audio signal chain with custom generators and root outputs.

1. **Always use `[BurstCompile]` on real-time structs** — without Burst, managed C# runs on the audio thread and GC pauses cause audible glitches
2. **Use `Unity.Mathematics` types** (`math.sin`, `math.PI`) not `System.Math` or `UnityEngine.Mathf` — required for Burst compatibility
3. **Keep real-time structs blittable** — no managed references, strings, or class fields; only value types and `NativeArray`
4. **Schedule jobs in `Process()`, complete in `EndProcessing()`** — maximizes time for worker threads to execute
5. **Dispose NativeArrays in the control part's lifecycle** (`OnDestroy`) — native memory leaks are a common bug
6. **Use pipes for real-time parameter changes** — lock-free, allocation-free communication between control and real-time parts
7. **Use `OnAudioFilterRead` only for legacy/simple effects** — scriptable processors are the preferred approach for new projects

See [G75 Scriptable Audio Processors](guides/G75_scriptable_audio_processors.md) for the full guide.

---

## Distributed Authority Networking Rules

Netcode for GameObjects 2.0+ supports distributed authority topology where clients share ownership of networked objects without a dedicated game server.

1. **Use `HasAuthority` not `IsOwner`** — in distributed authority, `HasAuthority` is the correct check for local control
2. **Use the unified `[Rpc]` attribute** — replaces legacy `[ServerRpc]`/`[ClientRpc]`; supports client-to-client via relay
3. **Wait for `OnClientConnectedCallback` before spawning** — spawning before connection completes causes silent failures
4. **Only the session owner should spawn shared objects** (NPCs, world items) — other clients spawn their own player objects
5. **Do NOT use distributed authority for competitive PvP** — clients are trusted; no server-side validation exists
6. **Configure `SessionOptions` with `.WithDistributedAuthorityNetwork()`** — this single call switches the entire topology
7. **Set Network Topology to "Distributed Authority"** and transport to **DistributedAuthorityTransport** on the NetworkManager
8. **Requires Unity Gaming Services** — Relay, Authentication, and Multiplayer Services packages must be installed and the project linked to Unity Cloud

See [G76 Distributed Authority Networking](guides/G76_distributed_authority_networking.md) for the full guide.
