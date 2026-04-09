# G59 — Visual Scripting in Unity 6

> **Category:** guide · **Engine:** Unity 6 (6000.x) · **Related:** [G37 Event-Driven Architecture](G37_event_driven_architecture.md) · [G38 State Machine Patterns](G38_state_machine_patterns.md) · [G32 Editor Scripting](G32_editor_scripting_custom_tools.md) · [Unity Rules](../unity-arch-rules.md)

Unity Visual Scripting (package `com.unity.visualscripting` v1.9.x) provides a node-based programming environment where designers, artists, and programmers build game logic without writing C#. It ships as a verified package in Unity 6 and supports two complementary graph types: **Script Graphs** for procedural logic and **State Graphs** for state-machine behavior. This guide covers architecture, best practices, custom node creation, and C# interop.

---

## When to Use Visual Scripting

Visual Scripting is **not a replacement for C#** — it is a collaboration and prototyping tool. Use it when:

| Scenario | Visual Scripting | C# |
|----------|:---:|:---:|
| Designer-driven gameplay tuning (door triggers, pickups) | ✅ | |
| Rapid prototyping / game jam logic | ✅ | |
| AI state machines authored by non-programmers | ✅ | |
| Performance-critical inner loops (thousands of entities) | | ✅ |
| Systems that need Burst compilation or DOTS | | ✅ |
| Complex data structures and algorithms | | ✅ |
| Reusable library code shared across projects | | ✅ |

**Hybrid is the sweet spot:** programmers write core systems in C#, expose clean APIs via custom nodes or events, and designers wire up high-level behavior in Visual Scripting.

---

## Core Concepts

### Script Graphs

Script Graphs are flow-based graphs that execute sequentially along control connections (the green lines) while passing data through value connections (the colored lines).

```
┌────────────┐     ┌─────────────┐     ┌──────────────┐
│  On Update │────▶│ Get Input   │────▶│  Move Object │
│  (Event)   │     │  Axis "H"   │     │  by velocity │
└────────────┘     └─────────────┘     └──────────────┘
     ▼ (control flow)    ║ (data: float)      ▲
                         ╚════════════════════╝
```

Key node categories:
- **Events** — entry points that start execution (On Start, On Update, On Trigger Enter, Custom Events)
- **Flow Control** — If, For Loop, While Loop, Switch, Sequence
- **Variables** — Get/Set for Object, Graph, Scene, Application, and Saved scopes
- **Math/Logic** — arithmetic, comparisons, vector operations
- **Unity API** — every public Unity API is available as nodes via reflection

### State Graphs

State Graphs model **finite state machines**. Each state contains an embedded Script Graph that runs while the state is active.

```
┌──────────────────────┐        player_detected        ┌───────────────────────┐
│       IDLE           │ ─────────────────────────────▶ │       CHASE           │
│                      │                                │                       │
│  On Enter: Play Idle │                                │  On Enter: Play Run   │
│  On Update: Patrol   │ ◀───────────────────────────── │  On Update: Move to   │
│  On Exit: Stop Walk  │        lost_player             │            player     │
└──────────────────────┘                                └───────────────────────┘
         │                                                         │
         │ player_in_range                            health <= 0  │
         ▼                                                         ▼
┌──────────────────────┐                               ┌───────────────────────┐
│       ATTACK         │                               │       DEAD            │
└──────────────────────┘                               └───────────────────────┘
```

Each state has three event hooks:
- **On Enter State** — fires once when the state becomes active
- **On Update** — fires every frame while the state is active
- **On Exit State** — fires once when leaving the state

Transitions are defined with **conditions** checked each frame. When a condition is met, the machine transitions to the target state.

---

## Variable Scopes

Visual Scripting provides five variable scopes, each with different lifetimes:

| Scope | Lifetime | Use Case |
|-------|----------|----------|
| **Graph** | Per-graph instance | Internal state for this graph only |
| **Object** | Per-GameObject | Shared between all graphs on the same GameObject |
| **Scene** | Per-scene | Cross-object communication within a scene |
| **Application** | App session | Survives scene loads (e.g., score, settings) |
| **Saved** | Persistent (PlayerPrefs) | Persists between sessions (e.g., high score) |

```
// WHY: Understanding scope prevents bugs where two objects
// accidentally share the same variable. Graph variables are
// the safest default — only escalate scope when needed.
```

**Best practice:** Default to Graph scope. Only escalate to Object or Scene scope when multiple graphs genuinely need the same data. Avoid Saved variables for complex data — use a proper save system instead.

---

## Custom Events (C# ↔ Visual Scripting Bridge)

The most important integration point is **Custom Events**, which let C# code trigger Visual Scripting graphs and vice versa.

### Triggering Visual Scripting from C#

```csharp
using Unity.VisualScripting;
using UnityEngine;

// WHY: Custom events decouple C# systems from graph implementation.
// The C# side doesn't know or care whether the listener is a
// Visual Scripting graph or another C# script.

public class EnemyHealth : MonoBehaviour
{
    [SerializeField] private int _maxHealth = 100;
    private int _currentHealth;

    private void Awake()
    {
        _currentHealth = _maxHealth;
    }

    public void TakeDamage(int amount)
    {
        _currentHealth -= amount;

        // Trigger a custom event that any Visual Scripting graph
        // on this GameObject can listen for.
        // Args: target GameObject, event name, then any arguments.
        CustomEvent.Trigger(gameObject, "OnDamaged", amount, _currentHealth);

        if (_currentHealth <= 0)
        {
            CustomEvent.Trigger(gameObject, "OnDeath");
        }
    }
}
```

In the Visual Scripting graph, add a **Custom Event** node, set the event name to `"OnDamaged"`, and configure two arguments (int `amount`, int `currentHealth`). The graph executes whenever `TakeDamage` is called from C#.

### Accessing Visual Scripting Variables from C#

```csharp
using Unity.VisualScripting;
using UnityEngine;

public class ScoreDisplay : MonoBehaviour
{
    private void Update()
    {
        // Read an Object variable set by a Visual Scripting graph
        // WHY: This lets C# UI code read designer-authored variables
        // without the graph needing to know about the UI system.
        if (Variables.Object(gameObject).IsDefined("score"))
        {
            int score = Variables.Object(gameObject).Get<int>("score");
            // Update UI with score...
        }

        // Read a Scene variable (shared across all objects in the scene)
        if (Variables.Scene(gameObject.scene).IsDefined("waveNumber"))
        {
            int wave = Variables.Scene(gameObject.scene).Get<int>("waveNumber");
            // Display wave counter...
        }
    }
}
```

### Triggering C# from Visual Scripting

Use the **Unity Event** node to call public methods on components, or use the **Invoke** node to call any method by reflection. For type-safe integration, expose methods through a MonoBehaviour:

```csharp
using UnityEngine;

// WHY: This component acts as a "bridge" that Visual Scripting
// graphs can call via the Invoke node or Unity Event node.
// Keep methods simple and well-named for designer discoverability.
public class AudioBridge : MonoBehaviour
{
    [SerializeField] private AudioSource _source;
    [SerializeField] private AudioClip[] _clips;

    // Visual Scripting can call this directly via the Invoke node
    public void PlaySFX(int clipIndex)
    {
        if (clipIndex >= 0 && clipIndex < _clips.Length)
        {
            _source.PlayOneShot(_clips[clipIndex]);
        }
    }

    public void PlayRandomSFX()
    {
        if (_clips.Length > 0)
        {
            _source.PlayOneShot(_clips[Random.Range(0, _clips.Length)]);
        }
    }
}
```

---

## Creating Custom Nodes

Custom nodes let programmers expose clean, designer-friendly interfaces for complex operations. This is the primary way to extend Visual Scripting.

```csharp
using Unity.VisualScripting;
using UnityEngine;

// WHY: Custom units let you wrap complex C# logic into a single,
// clearly labeled node. Designers see "Spawn Enemy" instead of
// 15 nodes for pooling, positioning, and initialization.

[UnitTitle("Spawn Enemy")]                   // Display name in the graph
[UnitCategory("Game/Spawning")]              // Category in the fuzzy finder
[UnitShortTitle("Spawn")]                    // Compact label in the graph
[TypeIcon(typeof(GameObject))]               // Icon shown on the node
public class SpawnEnemyNode : Unit
{
    // --- Ports ---

    [DoNotSerialize]
    public ControlInput enter;         // Flow input (green arrow in)

    [DoNotSerialize]
    public ControlOutput exit;         // Flow output (green arrow out)

    [DoNotSerialize]
    public ValueInput spawnPoint;      // Data input: where to spawn

    [DoNotSerialize]
    public ValueInput enemyPrefab;     // Data input: what to spawn

    [DoNotSerialize]
    public ValueOutput spawnedEnemy;   // Data output: the spawned object

    private GameObject _result;

    // Define the node's ports
    protected override void Definition()
    {
        // Control flow ports
        enter = ControlInput("enter", flow =>
        {
            // WHY: All logic runs inside the ControlInput lambda.
            // This is where Visual Scripting calls your code.
            var prefab = flow.GetValue<GameObject>(enemyPrefab);
            var position = flow.GetValue<Vector3>(spawnPoint);

            // Use object pooling in production — see G33
            _result = Object.Instantiate(prefab, position, Quaternion.identity);

            return exit;  // Continue flow to the next connected node
        });

        exit = ControlOutput("exit");

        // Data ports with type safety
        spawnPoint = ValueInput<Vector3>("position", Vector3.zero);
        enemyPrefab = ValueInput<GameObject>("prefab", null);
        spawnedEnemy = ValueOutput<GameObject>("spawned", flow => _result);

        // Declare data dependencies so the graph evaluates in correct order
        Requirement(spawnPoint, enter);
        Requirement(enemyPrefab, enter);
        Succession(enter, exit);
        Assignment(enter, spawnedEnemy);
    }
}
```

After creating custom nodes, **regenerate the node library**: Edit → Project Settings → Visual Scripting → Regenerate Nodes. Without this step, new nodes won't appear in the fuzzy finder.

---

## Super Units (Reusable Subgraphs)

Super Units let you encapsulate a group of nodes into a reusable, collapsible block — the Visual Scripting equivalent of a function.

**Creating a Super Unit:**
1. Select a group of connected nodes in a Script Graph
2. Right-click → Convert to Super Unit
3. Define input/output ports on the Super Unit's graph
4. The Super Unit appears as a single node that can be reused across graphs

**Best practices:**
- Name Super Units clearly (e.g., "Calculate Damage With Resistance")
- Use Graph variables inside Super Units for internal state
- Store reusable Super Units as `.asset` files (macro mode) to share across GameObjects
- Don't nest Super Units more than 2 levels deep — it becomes hard to debug

---

## Performance Considerations

Visual Scripting is **interpreted at runtime** through Unity's reflection system, making it slower than compiled C#. Understand the cost model:

| Operation | VS Overhead vs C# |
|-----------|-------------------|
| Simple math (add, multiply) | ~10-50x slower |
| Method calls (Transform.position) | ~3-5x slower |
| Event dispatch (Custom Event) | ~2-3x slower |
| State transitions | Negligible (infrequent) |

**Mitigation strategies:**

1. **Move hot loops to C#** — if something runs thousands of times per frame, it should be C#
2. **Use Coroutine nodes** instead of Update for infrequent checks (e.g., check proximity every 0.5s)
3. **Cache component references** — use Graph variables to store GetComponent results instead of calling it every frame
4. **Minimize node count per frame** — fewer nodes in the Update event path = less overhead
5. **Use State Graphs for AI** — state transitions are infrequent, so the overhead is negligible compared to running complex logic every frame

---

## Project Organization

```
Assets/_Project/
├── VisualScripts/
│   ├── Macros/              # Shared Super Units (.asset files)
│   │   ├── DamageCalc.asset
│   │   └── HealthBar.asset
│   ├── Player/              # Player-related graphs
│   │   ├── PlayerController.asset
│   │   └── PlayerAbilities.asset
│   ├── Enemies/             # Enemy behavior graphs
│   │   ├── EnemyAI.asset    # State Graph for enemy FSM
│   │   └── BossPhases.asset
│   └── World/               # Environmental interactions
│       ├── DoorTrigger.asset
│       └── Collectible.asset
├── Scripts/
│   ├── VisualScriptingBridge/  # C# ↔ VS integration
│   │   ├── CustomNodes/        # Custom Unit implementations
│   │   ├── EventBridges/       # C# event dispatchers
│   │   └── TypeOptions.cs      # Register custom types
│   └── ...
```

### Type Options Configuration

By default, Visual Scripting only exposes a subset of types in the fuzzy finder. To make custom types available:

1. Go to Edit → Project Settings → Visual Scripting → Type Options
2. Add your custom types (e.g., `EnemyData`, `WeaponConfig`)
3. Click "Regenerate Nodes"

Or register types programmatically:

```csharp
using Unity.VisualScripting;
using UnityEngine;

// WHY: Programmatic registration ensures types are always available
// even when project settings get reset. Place in an Editor folder.
[assembly: RegisterAssembly("Game.CustomTypes")]

// In an Editor script:
// [InitializeOnLoad]
// public static class VSTypeRegistration
// {
//     static VSTypeRegistration()
//     {
//         // Types added here appear in the fuzzy finder
//     }
// }
```

---

## Debugging Visual Scripts

Unity 6 provides built-in debugging tools for Visual Scripting:

1. **Live Editing** — with Play mode active, select a GameObject running a graph to see real-time value flow (values appear on connections as they pass through)
2. **Breakpoints** — click the left edge of any node to set a breakpoint; execution pauses when hit
3. **Watch Variables** — the Variables window shows live values for all scopes
4. **Dim Inactive Paths** — nodes that haven't executed in the current frame appear dimmed, making it easy to trace active flow
5. **Predict Mode** — hover over a value port to see what it would evaluate to before running

**Common debugging issues:**
- **Node not firing:** Check that the event source is correct (e.g., On Trigger Enter requires a Collider with `Is Trigger` enabled)
- **Null reference:** Use a Null Check node before accessing object properties
- **Wrong variable scope:** Object variables on the wrong GameObject are a frequent source of bugs — use the Variables debugger window to verify

---

## Migration: Visual Scripting to C#

When a prototype matures, migrate performance-sensitive graphs to C#:

1. Open the graph and document the flow (screenshot or diagram)
2. Map each node to its C# equivalent (hover over nodes to see the underlying API)
3. Replace Custom Event triggers with C# events or UnityEvents
4. Replace Variable nodes with serialized fields or properties
5. Replace State Graphs with a proper state machine (see [G38 State Machine Patterns](G38_state_machine_patterns.md))
6. Keep Visual Scripting for designer-facing systems (triggers, dialogue, level scripting) where performance isn't critical

---

## Key Takeaways

- Visual Scripting is a **designer empowerment tool**, not a C# replacement
- Use **Script Graphs** for procedural logic, **State Graphs** for FSM behavior
- Bridge C# and Visual Scripting through **Custom Events** and **custom nodes**
- Default to **Graph scope** for variables; escalate scope only when genuinely needed
- Move **performance-critical logic to C#** — Visual Scripting has 3-50x overhead per node
- **Regenerate nodes** after adding custom types or custom Unit classes
- Store reusable logic as **Super Unit macros** (`.asset` files)
