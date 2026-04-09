# G25 — StateTree: Hierarchical State Machine for AI and Logic in Unreal Engine 5

> **Category:** guide · **Engine:** Unreal Engine 5.5+ · **Related:** [G11 AI Behavior Trees](G11_ai_behavior_trees.md) · [G1 Gameplay Framework](G1_gameplay_framework.md) · [G2 Enhanced Input](G2_enhanced_input.md) · [Unreal Rules](../unreal-arch-rules.md)

StateTree is Unreal Engine's modern alternative to Behavior Trees for authoring AI behaviors and general-purpose game logic. It combines the hierarchical selectors of behavior trees with the explicit states and transitions of state machines into a single compact editor. Unlike behavior trees — which tick every frame from the root, re-evaluating the entire tree — StateTree stays in a state until a transition fires, making it more efficient and easier to reason about. This guide covers the architecture, core components, C++ and Blueprint task authoring, schemas, and practical patterns for game AI.

---

## Why StateTree Over Behavior Trees?

Behavior Trees have been the default UE AI system since UE4, but they have friction points:

- **Blackboard coupling** — all data flows through a shared Blackboard, which becomes a grab-bag of loosely-typed keys that are hard to refactor
- **Tick-every-frame** — the tree re-evaluates from the root each tick, even when the AI's situation hasn't changed
- **No explicit transitions** — flow is determined implicitly by decorator conditions and selector priorities, which can be hard to trace
- **Verbose for simple patterns** — a 3-state patrol/chase/attack loop requires multiple nodes, decorators, and services

StateTree addresses these by providing:
- **Typed data bindings** instead of a loose Blackboard — bind task inputs directly to context objects, evaluators, or other task outputs
- **Event-driven transitions** — states only change when a transition condition is met, not every tick
- **Compact visual layout** — the editor shows the full state hierarchy in a single view, with transitions as arrows
- **Utility-based selection** (UE 5.5+) — states can optionally be selected by evaluating utility scores instead of fixed priority order

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│  StateTree Asset (.uasset)                           │
│                                                       │
│  Defines: States, Transitions, Tasks, Evaluators,    │
│           Conditions, and a Schema                   │
│                                                       │
│  ┌─────────────────────────────────────────┐         │
│  │  Schema: defines context requirements   │         │
│  │  (e.g., AIController, Pawn, World)      │         │
│  └─────────────────────────────────────────┘         │
│                                                       │
│  ┌─ Root ──────────────────────────────────┐         │
│  │  ├── State: Patrol                      │         │
│  │  │     Tasks: [MoveTo, LookAround]      │         │
│  │  │     Transitions: → Chase (on see)    │         │
│  │  │                                      │         │
│  │  ├── State: Chase                       │         │
│  │  │     Tasks: [MoveToTarget]            │         │
│  │  │     Transitions: → Attack (in range) │         │
│  │  │                   → Patrol (lost)    │         │
│  │  │                                      │         │
│  │  └── State: Attack                      │         │
│  │        Tasks: [MeleeAttack]             │         │
│  │        Transitions: → Chase (out range) │         │
│  └─────────────────────────────────────────┘         │
└──────────────────────┬──────────────────────────────┘
                       │  referenced by
                       ▼
┌─────────────────────────────────────────────────────┐
│  UStateTreeComponent (on the Actor)                  │
│                                                       │
│  Provides runtime context: AIController, Pawn,       │
│  World reference. Ticks the active state's tasks.    │
└─────────────────────────────────────────────────────┘
```

---

## Core Components

### States

A **State** is a named container that holds one or more Tasks. Only one leaf state (plus its parent chain) is active at a time. States can be nested to form a hierarchy — when a child state is active, its parent's tasks also run.

```
Root
  ├── Idle                    ← leaf state
  ├── Combat                  ← parent state (its tasks always run when any child is active)
  │     ├── Chase             ← leaf state
  │     └── Attack            ← leaf state
  └── Dead                    ← leaf state
```

When "Chase" is active, both the "Combat" parent tasks AND the "Chase" tasks execute. This lets you put shared logic (like "face target") in the parent.

### Tasks

**Tasks** are the executable units — they perform actions like moving the AI, playing animations, or waiting. Each task receives lifecycle callbacks:

| Callback | When It Fires |
|----------|--------------|
| `EnterState` | The state becomes active |
| `ExitState` | The state is about to deactivate |
| `Tick` | Every frame while the state is active |
| `StateCompleted` | A child state completes (success/failure) |

Tasks can call `FinishTask()` to report success or failure, which can trigger transitions. Tasks can also run indefinitely (never calling FinishTask), which is common for continuous behaviors like "follow target."

### Transitions

**Transitions** define when and where the state machine moves. Each transition has:

- **Trigger**: what causes it to evaluate — `On State Completed`, `On Tick`, `On Event`
- **Conditions**: optional checks that must pass (distance < 5m, health < 50%, etc.)
- **Target State**: where to go
- **Priority**: when multiple transitions could fire, higher priority wins

```
State: Patrol
  Transitions:
    1. [On Tick] IF CanSeeTarget → Chase       (priority: High)
    2. [On Task Completed] → Patrol             (priority: Normal, loops patrol)
```

### Evaluators

**Evaluators** are data providers that run globally (not tied to a specific state). They compute values that other components can bind to.

```cpp
// Example: An evaluator that provides the nearest enemy
USTRUCT()
struct FNearestEnemyEvaluator : public FStateTreeEvaluatorBase
{
    GENERATED_BODY()

    // Output: other tasks bind to this
    UPROPERTY(EditAnywhere, Category = "Output")
    TObjectPtr<AActor> NearestEnemy;

    // External data: the AI's pawn (injected by the schema)
    TStateTreeExternalDataHandle<APawn> PawnHandle;

    virtual void TreeStart(FStateTreeExecutionContext& Context) override
    {
        // Link to external data during initialization
        // (the schema provides the Pawn reference)
    }

    virtual void Tick(FStateTreeExecutionContext& Context) override
    {
        APawn* Pawn = Context.GetExternalData(PawnHandle);
        // Find nearest enemy and set NearestEnemy
        NearestEnemy = FindNearestEnemy(Pawn);
    }
};
```

Other tasks can then bind their "Target" input to this evaluator's `NearestEnemy` output, keeping the sensing logic in one place.

### Conditions

**Conditions** are lightweight checks used in transitions and state enter conditions. They evaluate to true/false and can be combined with AND/OR logic.

Built-in conditions include gameplay tag checks, distance comparisons, and boolean evaluations. Custom conditions follow the same C++ struct pattern as evaluators.

---

## Schemas: AI vs General Purpose

The **Schema** defines what context the StateTree expects. This determines what external data is available to tasks and evaluators.

| Schema | Context Provided | Use Case |
|--------|-----------------|----------|
| **StateTreeAISchema** | AIController, Pawn, World, Navigation | NPC AI behaviors |
| **StateTreeActorSchema** | Actor, World | Non-AI actor logic (doors, traps, interactive objects) |
| **StateTreeComponentSchema** | Component, Actor, World | Component-level state machines |

Choose the schema when creating the StateTree asset. It cannot be changed after creation.

---

## Writing Tasks in C++

C++ tasks are the recommended approach for production — they're significantly faster than Blueprint tasks and offer full control over the lifecycle.

```cpp
#include "StateTreeTaskBase.h"
#include "StateTreeExecutionContext.h"

// A task that moves the AI toward a target actor
USTRUCT(meta = (DisplayName = "Move To Target"))
struct FMoveToTargetTask : public FStateTreeTaskCommonBase
{
    GENERATED_BODY()

    // Input: bound to an evaluator or another task's output
    UPROPERTY(EditAnywhere, Category = "Input")
    TObjectPtr<AActor> TargetActor;

    // Parameter: configured in the StateTree editor
    UPROPERTY(EditAnywhere, Category = "Parameter")
    float AcceptanceRadius = 100.0f;

    // External data handle — linked at tree start
    TStateTreeExternalDataHandle<AAIController> AIControllerHandle;

    virtual const UStruct* GetInstanceDataType() const override
    {
        return nullptr; // No per-instance data needed
    }

    // Called when this task's state becomes active
    virtual EStateTreeRunStatus EnterState(
        FStateTreeExecutionContext& Context,
        const FStateTreeTransitionResult& Transition) const override
    {
        AAIController* AIC = Context.GetExternalData(AIControllerHandle);
        if (!AIC || !TargetActor)
        {
            return EStateTreeRunStatus::Failed;
        }

        // Start the move request
        AIC->MoveToActor(TargetActor, AcceptanceRadius);
        return EStateTreeRunStatus::Running;
    }

    // Called every frame while this state is active
    virtual EStateTreeRunStatus Tick(
        FStateTreeExecutionContext& Context,
        const float DeltaTime) const override
    {
        AAIController* AIC = Context.GetExternalData(AIControllerHandle);
        if (!AIC) return EStateTreeRunStatus::Failed;

        // Check if the AI has reached the target
        EPathFollowingStatus::Type Status = AIC->GetMoveStatus();
        if (Status == EPathFollowingStatus::Idle)
        {
            // Movement finished — report success
            return EStateTreeRunStatus::Succeeded;
        }

        return EStateTreeRunStatus::Running;
    }

    // Called when leaving this state
    virtual void ExitState(
        FStateTreeExecutionContext& Context,
        const FStateTreeTransitionResult& Transition) const override
    {
        AAIController* AIC = Context.GetExternalData(AIControllerHandle);
        if (AIC)
        {
            AIC->StopMovement();
        }
    }
};
```

### Key Return Values

| `EStateTreeRunStatus` | Meaning |
|-----------------------|---------|
| `Running` | Task is still executing — keep ticking |
| `Succeeded` | Task completed successfully — may trigger "On Task Succeeded" transitions |
| `Failed` | Task failed — may trigger "On Task Failed" transitions |

---

## Writing Tasks in Blueprint

For rapid prototyping, Blueprint tasks extend `UStateTreeTaskBlueprintBase`:

1. Create a new Blueprint class inheriting from `StateTreeTaskBlueprintBase`
2. Override the events: `EnterState`, `ExitState`, `Tick`
3. Call `FinishTask(bSucceeded)` when the task completes
4. Add the task to a state in the StateTree editor

> **Performance note**: Blueprint tasks are significantly slower than C++ tasks due to VM overhead. For tasks that tick every frame on many AI agents, always use C++. Blueprint is fine for prototyping and infrequently-ticking logic.

---

## Practical Example: Patrol / Chase / Attack AI

Here's a complete StateTree layout for a basic enemy AI:

```
Schema: StateTreeAISchema
Context: AIController, Pawn

Global Evaluators:
  - NearestEnemyEvaluator → outputs: NearestEnemy (AActor*)
  - PerceptionEvaluator   → outputs: CanSeeTarget (bool), DistanceToTarget (float)

States:
  ├── Patrol
  │     Tasks: [PatrolRoute (loops between waypoints)]
  │     Enter Conditions: none
  │     Transitions:
  │       → Chase  [On Tick, IF CanSeeTarget == true]
  │
  ├── Chase
  │     Tasks: [MoveToTarget (binds TargetActor ← NearestEnemy)]
  │     Enter Conditions: CanSeeTarget == true
  │     Transitions:
  │       → Attack  [On Tick, IF DistanceToTarget < 200]
  │       → Patrol  [On Tick, IF CanSeeTarget == false, Delay: 3s]
  │
  └── Attack
        Tasks: [MeleeAttack (plays montage, deals damage)]
        Enter Conditions: DistanceToTarget < 200
        Transitions:
          → Chase   [On Task Completed, IF DistanceToTarget >= 200]
          → Patrol  [On Tick, IF CanSeeTarget == false]
```

### Setting It Up in the Editor

1. **Enable plugins**: Edit → Plugins → search "StateTree" → enable both `StateTree` and `GameplayStateTree`
2. **Create the asset**: Content Browser → Right-click → AI → StateTree
3. **Set the schema**: When prompted, choose `StateTreeAISchema`
4. **Add states**: Click "Add State" in the StateTree editor, name them, arrange the hierarchy
5. **Add tasks to states**: Select a state, click "Add Task" in the Details panel
6. **Configure transitions**: Select a state, add transitions with conditions
7. **Bind to an AI Controller**: Add a `UStateTreeComponent` to your AI's Pawn or Controller, and assign the StateTree asset

### Running the StateTree

```cpp
// In your AIController or Pawn:
UPROPERTY(VisibleAnywhere)
UStateTreeComponent* StateTreeComponent;

// The StateTree starts automatically when the component is registered.
// To manually start/stop:
StateTreeComponent->StartLogic();
StateTreeComponent->StopLogic();
```

---

## StateTree vs Behavior Tree: When to Use Which

| Criteria | StateTree | Behavior Tree |
|----------|-----------|---------------|
| **Explicit state flow** | States + transitions are visible | Implicit via decorators/selectors |
| **Performance** | Better — only ticks active state | Re-evaluates from root every tick |
| **Data flow** | Typed bindings (no Blackboard) | Blackboard (untyped key-value) |
| **Learning curve** | Moderate — newer, less community content | Lower — extensive tutorials and docs |
| **Complex decision trees** | Utility selection (UE 5.5+) | Selector/Sequence composites |
| **Ecosystem maturity** | Newer, still evolving | Mature, battle-tested |
| **Use for non-AI** | Yes (Actor/Component schemas) | No (AI-only) |

**Recommendation**: Use StateTree for new projects on UE 5.5+. Use Behavior Trees when maintaining existing projects or when your team has deep BT expertise. StateTree is Epic's clear direction for the future.

---

## Debugging StateTree

### Visual Debugger

1. Play in Editor (PIE)
2. Open the StateTree asset
3. Select the AI actor in the World Outliner
4. The StateTree editor highlights the currently active state in green, with transition arrows showing recent flow

### Unreal Insights

Profile StateTree performance using the **Unreal Insights** profiler:
- StateTree evaluation appears under the "StateTree" track
- Compare C++ vs Blueprint task overhead
- Identify tasks that tick too frequently

### Common Debug Strategies

- **Add a "Debug Print" task** to states during development to confirm which state is active
- **Check Enter Conditions** — if a state never activates, its enter conditions may be failing
- **Check transition priority** — a higher-priority transition may be stealing execution
- **Verify evaluator updates** — evaluators that cache stale data are a common source of "stuck" behavior

---

## Common Pitfalls

| Pitfall | Why It Happens | Fix |
|---------|----------------|-----|
| **Parent tasks receive child's EnterState/ExitState** | When child states transition, parent tasks get re-entered | Disable "Should State Change on Reselect" on the task, or guard with a bool |
| **Multiple active tasks get unintended completion events** | All tasks in the active state chain receive `StateCompleted` | Use specific transition triggers (`On Task Succeeded`) instead of `On State Completed` |
| **Gameplay Tags bind by value, not reference** | Tag containers are structs — binding copies them | Use a component-based tag system with event dispatchers instead of direct tag bindings |
| **Global tasks crash in subtrees** | Global tasks with parameters in linked StateTree assets can cause null references | Move global tasks to the subtree root state, or use evaluators instead |
| **Blueprint tasks are slow** | Blueprint VM overhead on per-frame ticks | Convert hot-path tasks to C++ — keep Blueprint for infrequent logic only |
| **"Should State Change on Reselect" ignored in subtrees** | Known intermittent bug in linked assets | Recompile the subtree asset; report to Epic if persistent |

---

## Performance Considerations

- **C++ tasks are ~10x faster than Blueprint tasks** for per-frame ticking — always use C++ for production AI that runs on many agents
- **Evaluators tick globally** — keep them lightweight. Move expensive sensing to a separate system and push results to evaluators
- **Transition conditions** are evaluated every tick for `On Tick` triggers — keep them simple (comparisons, tag checks). Avoid heavy computation in conditions
- **Linked assets (subtrees)** add a small overhead for context resolution — acceptable for modularity, but don't nest more than 2-3 levels deep
- **Profile with Unreal Insights** — the StateTree track shows per-state and per-task evaluation time, making it easy to find bottlenecks
