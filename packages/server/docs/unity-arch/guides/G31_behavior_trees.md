# G31 — Behavior Trees with Unity Behavior

> **Category:** guide · **Engine:** Unity 6 (6000.x) · **Related:** [G12 AI & Navigation](G12_ai_navigation.md) · [G14 ScriptableObject Architecture](G14_scriptable_object_architecture.md) · [G7 Animation System](G7_animation_system.md) · [Unity Rules](../unity-arch-rules.md)

Unity Behavior (package `com.unity.behavior`, v1.0.15+) is Unity's official graph-based behavior tree system. It provides a visual editor for designing AI logic with human-readable nodes, a Blackboard variable system for shared state, and a C# API for custom nodes. This guide covers architecture, node types, custom node creation, Blackboard variables, runtime integration, and best practices for game AI.

---

## When to Use Behavior Trees

| AI Approach | Best For | Limitations |
|---|---|---|
| **Behavior Trees** | NPCs with hierarchical decision-making, complex multi-step behaviors, reusable AI patterns | Can become deep/wide for highly reactive AI |
| **State Machines** | Simple AI with clear states (idle → chase → attack), UI flow | Combinatorial explosion with many states |
| **Utility AI** | Scoring multiple competing priorities (Sims-style needs) | Harder to debug, less visual |
| **GOAP** | Goal-driven agents that plan action sequences | Complex setup, planning overhead |

Behavior trees excel at **composable, readable AI** — each branch is a self-contained behavior that can be tested and reused. Unity Behavior adds visual editing and real-time debugging on top.

---

## Installation

```
// Unity Package Manager — add by name:
com.unity.behavior
```

Requires Unity 6 (6000.x) or later. The package installs its own editor window accessible via **Window → AI → Behavior Graph**.

---

## Architecture Overview

```
BehaviorGraphAgent (MonoBehaviour)
│
├── BehaviorGraph (ScriptableObject asset)
│   ├── Blackboard (variables shared across the tree)
│   ├── Root Node
│   │   ├── Sequencing Nodes (control flow)
│   │   │   ├── Action Nodes (leaf behaviors)
│   │   │   └── Modifier Nodes (decorators)
│   │   └── Conditional Nodes (branching)
│   └── Subgraph references
│
└── Runtime: BehaviorGraphAgent.Graph (runtime instance)
```

- **BehaviorGraph** — the asset (ScriptableObject) that defines the tree structure.
- **BehaviorGraphAgent** — the MonoBehaviour component you attach to a GameObject. It instantiates and runs the graph at runtime.
- **Blackboard** — a variable container shared by all nodes in a graph. Variables can be exposed to the Inspector or shared across graph instances.

---

## Node Types

### Action Nodes (Leaves)

Action nodes do the actual work — they interact with the scene, move characters, play animations, or call your game systems. They have **no children**.

Each action reports a `Status`:
- `Status.Running` — still executing (checked again next tick)
- `Status.Success` — completed successfully
- `Status.Failure` — completed with failure

```
[Talk "Hello traveler!"]    → displays dialogue, succeeds when done
[Wait 2.0 seconds]         → succeeds after delay
[Navigate To waypoint]      → runs until agent arrives or fails
```

### Sequencing Nodes (Composites)

Sequencing nodes have **one or more children** and define execution order:

| Node | Behavior |
|---|---|
| **Sequence** | Runs children left-to-right. Fails if *any* child fails. Succeeds when *all* succeed. |
| **Try In Order** (Selector) | Runs children left-to-right. Succeeds on the *first* child that succeeds. Fails only if *all* fail. |
| **Run In Parallel** | Runs all children simultaneously. Configurable success/failure policies. |
| **Random** | Picks one child at random and runs it. |

### Modifier Nodes (Decorators)

Modifier nodes have **exactly one child** and alter its execution:

| Node | Effect |
|---|---|
| **Repeat** | Re-runs the child a set number of times or forever. |
| **Inverter** | Flips Success ↔ Failure. |
| **OnStart** | Runs the child only when the branch first activates. |
| **Abort** | Stops the branch when conditions become true. |
| **Restart** | Resets and replays the branch when conditions change. |
| **Timeout** | Fails the child if it doesn't complete within a time limit. |

### Join Nodes

Join nodes merge **multiple parent branches** into one child:

- **Wait For All** — runs the child only after *every* incoming branch completes.
- **Wait For Any** — runs the child after *at least one* incoming branch completes.

### Conditional Nodes

Conditions check Blackboard variables or game state to gate execution:

```
[If Health < 30]
    [Flee To safety]
[Else]
    [Attack Target]
```

The **Abort** and **Restart** modifiers enable reactive behaviors — an Abort node can interrupt a running Patrol sequence when an enemy is detected, without waiting for the current action to finish.

---

## Blackboard Variables

The Blackboard is the behavior tree's shared memory. Nodes read and write variables to communicate.

### Creating Variables

In the Behavior Graph editor, open the Blackboard panel and click **Add Variable**. Supported types include:

- **Basic:** `int`, `float`, `bool`, `string`, `Enum`
- **Unity:** `GameObject`, `Transform`, `Vector3`, `Color`, `AnimationCurve`
- **Resources:** `Material`, `AudioClip`, `Sprite`
- **Collections:** `List<T>` for supported types
- **Events:** Event channels for node-to-node signaling

### Variable Options

- **Expose** — shows the variable in the Inspector on the `BehaviorGraphAgent` component, letting designers override values per-instance without editing the graph.
- **Shared** — marks the variable as globally shared across all instances of this graph. Useful for team-wide knowledge (e.g., alert level, rally point).

### Implicit Type Casting

Unity Behavior automatically converts between related types:
- `float` → `int` (truncation)
- `GameObject` → any Component (via `GetComponent<T>`)
- Component → `GameObject` (via `.gameObject`)

### Runtime Access from C#

```csharp
// Get a reference to the agent
var agent = GetComponent<BehaviorGraphAgent>();

// Read an exposed variable by name
// NOTE: Use SetVariableValue / GetVariableValue on the agent
agent.SetVariableValue("AlertLevel", 3);

// Access the graph's Blackboard at runtime
// IMPORTANT: Do NOT use RuntimeBlackboardAsset to access non-shared
// variables — each graph instance creates unique copies that won't
// reflect changes made to the asset.
```

---

## Creating Custom Nodes

### Via the Graph Editor (Recommended)

1. Right-click in the graph → **Create New** → choose **Action**, **Modifier**, or **Sequencing**.
2. Enter a **name** (e.g., "PlaySound") and a **story** using bracket syntax: `[Agent] plays [Sound] at [Volume]`.
3. Words matching Blackboard variable names are auto-linked to the correct type.
4. Click **Create** — Unity generates a C# script with the correct base class and empty overrides.

### Manual C# Custom Action

```csharp
using System;
using Unity.Behavior;
using Unity.Properties;
using UnityEngine;

// The [NodeDescription] attribute defines how the node appears in the graph editor.
// "story" uses bracket syntax — bracketed words become BlackboardVariable fields.
[Serializable, GeneratePropertyBag]
[NodeDescription(
    name: "PlaySoundEffect",
    story: "[Agent] plays sound [Clip] at volume [Volume]",
    category: "Action/Audio",
    id: "a1b2c3d4e5f6"  // unique GUID — generate one per node type
)]
public partial class PlaySoundEffectAction : Action
{
    // BlackboardVariable fields are auto-populated from the story brackets.
    // The type parameter must match what the Blackboard variable holds.
    [SerializeReference] public BlackboardVariable<GameObject> Agent;
    [SerializeReference] public BlackboardVariable<AudioClip> Clip;
    [SerializeReference] public BlackboardVariable<float> Volume = new(1.0f);

    private AudioSource _audioSource;

    // Called once when this node starts executing.
    protected override Status OnStart()
    {
        if (Agent.Value == null || Clip.Value == null)
            return Status.Failure;

        // Cache the AudioSource component
        _audioSource = Agent.Value.GetComponent<AudioSource>();
        if (_audioSource == null)
            return Status.Failure;

        _audioSource.PlayOneShot(Clip.Value, Volume.Value);
        return Status.Running;
    }

    // Called every tick while the node is Running.
    protected override Status OnUpdate()
    {
        // Succeed once the clip finishes playing
        if (!_audioSource.isPlaying)
            return Status.Success;

        return Status.Running;
    }

    // Called when the node exits (Success, Failure, or Abort).
    protected override void OnEnd()
    {
        _audioSource = null;
    }
}
```

### Custom Modifier Example

```csharp
[Serializable, GeneratePropertyBag]
[NodeDescription(
    name: "CooldownDecorator",
    story: "Cooldown [Duration] seconds",
    category: "Modifier/Timing",
    id: "f7e8d9c0b1a2"
)]
public partial class CooldownModifier : Modifier
{
    [SerializeReference] public BlackboardVariable<float> Duration = new(3.0f);

    private float _lastRunTime = float.NegativeInfinity;

    protected override Status OnStart()
    {
        // Block execution if the cooldown hasn't elapsed
        if (Time.time - _lastRunTime < Duration.Value)
            return Status.Failure;

        // Start the child node
        return StartNode(Child);
    }

    protected override Status OnUpdate()
    {
        // Propagate the child's status
        return Child.CurrentStatus;
    }

    protected override void OnEnd()
    {
        _lastRunTime = Time.time;
    }
}
```

---

## Runtime Integration

### Setting Up in the Scene

1. Add a `BehaviorGraphAgent` component to your NPC GameObject.
2. Assign your BehaviorGraph asset to the **Graph** field.
3. Set any **Exposed** Blackboard variables in the Inspector (e.g., patrol speed, detection range).
4. The agent starts executing on `Awake` by default.

### Controlling the Graph from Code

```csharp
var agent = GetComponent<BehaviorGraphAgent>();

// Start / stop the behavior tree
agent.Graph.Start();   // begin execution
agent.Graph.End();     // stop execution

// Restart from the root
agent.Graph.Restart();

// Update Blackboard variables to steer behavior
agent.SetVariableValue("Target", player.gameObject);
agent.SetVariableValue("IsAggressive", true);
```

### Subgraphs for Reuse

Extract common behaviors (patrol, flee, investigate) into separate BehaviorGraph assets and reference them as **Subgraph** nodes. This keeps individual graphs small and makes behaviors shareable across different NPC types.

---

## Debugging

### Real-Time Visualization

In Play Mode, open the Behavior Graph window and select an active agent. The editor highlights:
- **Green** — currently executing nodes
- **Gray** — inactive branches
- **Red** — failed nodes

Blackboard variable values update live, letting you see state changes in real time.

### Common Issues

| Symptom | Likely Cause |
|---|---|
| Tree does nothing | Agent component disabled, or graph not assigned |
| Node always fails | BlackboardVariable is null (not assigned in Inspector) |
| Behavior never resets | Using Sequence without a Repeat modifier at the root |
| Shared variable not updating | Accessing `RuntimeBlackboardAsset` for non-shared variables |

---

## Best Practices

1. **Keep trees shallow** — deeply nested trees are hard to debug. Extract sub-behaviors into Subgraphs.
2. **Name variables clearly** — `PatrolSpeed` not `speed`. The story syntax reads better with descriptive names.
3. **Use Abort for reactivity** — don't rely on polling in every Action. Abort modifiers let the tree respond to condition changes mid-execution.
4. **Expose tuning variables** — mark speed, range, cooldown variables as Exposed so designers can tweak per-instance in the Inspector without touching the graph.
5. **One graph per archetype** — a "MeleeGuard" graph and a "RangedArcher" graph, not one mega-graph with branches for every NPC type.
6. **Test nodes in isolation** — write unit tests for custom Action nodes by calling `OnStart`/`OnUpdate` directly with mock Blackboard values.

---

## Example: Patrol + Chase NPC

```
Root
└── Repeat (forever)
    └── Try In Order
        ├── Sequence [Chase Branch]
        │   ├── Abort (when: CanSeeTarget == false)
        │   │   └── Sequence
        │   │       ├── [Navigate To Target]
        │   │       └── [Attack Target]
        │   └── [Set CanSeeTarget = false]
        └── Sequence [Patrol Branch]
            ├── [Get Next Waypoint → CurrentWaypoint]
            ├── [Navigate To CurrentWaypoint]
            └── [Wait PatrolPause seconds]
```

This tree tries to Chase first (fails if `CanSeeTarget` is false), then falls back to Patrol. The Abort modifier interrupts chasing if the target leaves line-of-sight.

---

## Further Reading

- [Unity Behavior Manual (1.0.15)](https://docs.unity3d.com/Packages/com.unity.behavior@1.0/manual/index.html)
- [Behavior Graph Node Types](https://docs.unity3d.com/Packages/com.unity.behavior@1.0/manual/node-types.html)
- [Create Custom Nodes](https://docs.unity3d.com/Packages/com.unity.behavior@1.0/manual/create-custom-node.html)
- [Blackboard Variables](https://docs.unity3d.com/Packages/com.unity.behavior@1.0/manual/blackboard-variables.html)
