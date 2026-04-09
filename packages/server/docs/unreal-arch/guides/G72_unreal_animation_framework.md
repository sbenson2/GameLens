# G72 — Unreal Animation Framework (UAF / AnimNext)

> **Category:** guide · **Engine:** Unreal Engine 5.6+ (Experimental) · **Related:** [G4 Animation System](G4_animation_system.md), [G22 Motion Matching](G22_motion_matching.md), [G26 Control Rig](G26_control_rig.md), [G29 Mover Component](G29_mover_component.md), [G25 StateTree AI System](G25_statetree_ai_system.md)

The **Unreal Animation Framework (UAF)**, also known as **AnimNext**, is Epic's next-generation animation system designed to replace Animation Blueprints (ABP). It is a data-oriented, composition-based framework built on **RigVM** that supports multithreaded evaluation, modular logic, and a unified workspace editor. UAF is **Experimental** as of UE 5.7 and is expected to become the primary animation runtime in future engine versions. This guide covers the architecture, key components, how it differs from ABPs, and how to prepare for migration.

> **⚠️ Experimental Warning:** UAF is under active development. APIs will change between engine versions. Do not ship production titles on UAF until it reaches at least Beta status (expected UE 5.9+). Use this guide to understand the direction and begin prototyping.

---

## Why UAF?

Animation Blueprints have served UE well but have fundamental limitations:

| ABP Limitation | UAF Solution |
|----------------|-------------|
| Single-threaded evaluation bottleneck | RigVM-based execution with multithreaded support |
| Monolithic AnimGraph — hard to compose | Modular architecture: independent Modules + AnimGraphs |
| Tight coupling to `UAnimInstance` | `UAnimNextComponent` — lightweight, composable |
| Limited code reuse across characters | Modules can be shared and composed across characters |
| Blueprint visual scripting overhead | Data-oriented execution; logic in Modules, not spaghetti graphs |
| Difficult to profile and optimize | Clear execution phases with per-module tick control |

---

## Core Architecture

```
┌────────────────────────────────────────────────────────────┐
│                    UAnimNextComponent                       │
│                    (Scene Component)                        │
│                                                            │
│  ┌─────────────────┐     ┌──────────────────────────────┐  │
│  │   Modules        │     │   Animation Graph             │  │
│  │                  │     │   (FAnimNextAnimGraph)         │  │
│  │  • Game logic    │     │                               │  │
│  │  • State mgmt    │◄──►│  • Pose evaluation            │  │
│  │  • Variable      │     │  • Blend trees                │  │
│  │    updates       │     │  • Motion matching            │  │
│  │  • Integration   │     │  • IK / Control Rig           │  │
│  │    (StateTree,   │     │                               │  │
│  │     PoseSearch)  │     │  Runs on RigVM                │  │
│  └─────────────────┘     └──────────────────────────────┘  │
│            │                           │                    │
│            └──────────┬────────────────┘                    │
│                       ▼                                     │
│            PublicVariablesProxy                              │
│            (Thread-safe data exchange)                       │
└────────────────────────────────────────────────────────────┘
```

### Key Components

#### UAnimNextComponent

The runtime component that replaces `USkeletalMeshComponent`'s dependency on `UAnimInstance`. Manages:
- A set of **Modules** for game logic.
- An **AnimationGraph** (`FAnimNextAnimGraph`) for pose evaluation.
- **PublicVariablesProxy** for thread-safe data exchange between game thread and animation worker threads.

#### Modules

Modules are self-contained units of animation logic. Each module:
- Can choose its own **Tick Group** and whether it needs an independent `TickFunction`.
- Runs within RigVM, supporting multithreaded execution.
- Replaces the "Event Graph" and "Blueprint Update Animation" sections of traditional ABPs.
- Can be shared across different character setups.

Think of modules as composable building blocks — one module for locomotion state, another for combat, another for facial animation. Each is independently testable and reusable.

#### FAnimNextAnimGraph

The animation graph evaluates pose data using RigVM nodes. The core execution flow:

```
FRigUnit_AnimNextRunAnimationGraph_v2_Execute()
  │
  ├─► Update phase (gather inputs from Modules)
  │
  ├─► Evaluate phase (blend trees, motion matching, IK)
  │
  └─► Output phase (final pose → skeletal mesh)
```

#### PublicVariablesProxy

Data exchange between the game thread and animation worker threads is handled by `PublicVariablesProxy` on `UAnimNextComponent`. Currently copies dirty-marked data every frame. Epic plans to move to a double-buffered array for better performance.

---

## Module System

### Core Modules

| Module | Plugin | Purpose |
|--------|--------|---------|
| **UAF / AnimNext** | AnimNext | Core animation utilities, base interfaces, execution framework |
| **UAFAnimGraph / AnimNextAnimGraph** | AnimNextAnimGraph | RigVM-based animation graph evaluation |
| **StateTree integration** | AnimNext + StateTree | Brings StateTree decision-making into UAF modules |
| **PoseSearch integration** | AnimNext + PoseSearch | Motion matching within the UAF pipeline |

### Module Architecture

Each module specifies:
- **Tick dependencies** — which other modules must complete first.
- **Variable bindings** — which PublicVariables it reads/writes.
- **Tick group** — `PrePhysics`, `DuringPhysics`, `PostPhysics`, etc.

This explicit dependency model eliminates the implicit ordering problems that plague complex ABP setups.

---

## Workspace Editor

UAF introduces a **Workspace Editor** (from the experimental Workspace plugin) that allows multiple UAF assets to be edited in a unified interface:

- Animation graphs, modules, and variable definitions in a single editor window.
- Real-time preview with the animation viewport.
- Integrated debugging and profiling.

This replaces the scattered editing experience of ABPs (AnimGraph tab, Event Graph tab, separate Blend Space editors, etc.).

---

## UAF vs. Animation Blueprints

| Aspect | Animation Blueprints | UAF / AnimNext |
|--------|---------------------|----------------|
| **Runtime class** | `UAnimInstance` | `UAnimNextComponent` |
| **Logic location** | Event Graph + AnimGraph | Modules + AnimGraph |
| **Execution** | Single-threaded per character | RigVM with multithread support |
| **Composition** | Linked Anim Layers, sub-graphs | Independent Modules |
| **Data flow** | Blueprint variables on AnimInstance | PublicVariablesProxy (thread-safe) |
| **Editor** | AnimBP editor (tabs) | Workspace Editor (unified) |
| **Motion Matching** | PoseSearch integration (separate) | Native PoseSearch module |
| **State machines** | AnimBP state machines | StateTree integration |
| **Maturity** | Production (10+ years) | Experimental |

---

## Integration with Mover 2.0

UAF is designed to work alongside the **Mover Component** (UE 5.4+ experimental, see G29). The recommended next-gen character stack:

```
┌──────────────────┐
│  StateTree        │ ← AI / gameplay decisions
├──────────────────┤
│  UAF Modules      │ ← Animation logic
├──────────────────┤
│  UAF AnimGraph    │ ← Pose evaluation + Motion Matching
├──────────────────┤
│  Mover Component  │ ← Physics-based character movement
├──────────────────┤
│  Skeletal Mesh    │ ← Rendering
└──────────────────┘
```

A community guide for setting up **Mover 2.0 + UAF + Motion Matching** in UE 5.7 exists, demonstrating the intended workflow for the next-gen character pipeline.

---

## Getting Started (UE 5.7)

### Enable Required Plugins

1. **AnimNext** — Core UAF plugin.
2. **AnimNextAnimGraph** — Animation graph evaluation.
3. **Workspace** (Experimental) — Unified editor.
4. **PoseSearch** — If using motion matching.
5. **Mover** — If using next-gen movement.

### Basic Setup Steps

1. Enable plugins and restart editor.
2. Create a new **AnimNext Animation Graph** asset.
3. Create **Module** assets for your character logic.
4. Add `UAnimNextComponent` to your character Actor.
5. Assign the AnimGraph and Modules to the component.
6. Define **PublicVariables** for game thread → animation thread communication.

### Exploring the Game Animation Sample

Epic's **Game Animation Sample** project (available on the Marketplace / Fab) is being updated to include UAF-powered characters alongside traditional ABP characters. As of UE 5.7, the sample primarily uses ABP but includes UAF explorations. Epic plans to have a fully UAF-driven character in UE 5.8.

---

## Migration Planning

UAF will not replace ABPs overnight. Epic's stated plan:

| Timeline | Milestone |
|----------|-----------|
| UE 5.6–5.7 | Experimental — API exploration, Game Animation Sample updates |
| UE 5.8 | Experimental — First complete UAF character in Game Animation Sample |
| UE 5.9+ (estimated) | Beta — API stabilization, migration tools |
| Future | Production — ABPs maintained but UAF becomes the recommended path |

### Preparing Now

Even if you're shipping on ABPs today, you can prepare:

1. **Decouple animation logic from AnimBP Event Graphs** — Move game logic to C++ or GameplayTasks. UAF modules are C++-friendly.
2. **Adopt Motion Matching (PoseSearch)** — It integrates with both ABP and UAF.
3. **Use StateTree for AI/state decisions** — StateTree integrates natively with UAF.
4. **Modularize with Linked Anim Layers** — The composition pattern maps conceptually to UAF modules.
5. **Minimize reliance on AnimNotifies for game logic** — UAF favors data-driven event systems.

---

## Current Limitations (UE 5.7)

| Limitation | Status |
|------------|--------|
| Incomplete documentation | Official FAQ available; full docs expected with Beta |
| Limited Blueprint support | Modules are primarily C++ for now |
| No migration tooling | Manual conversion from ABP required |
| Experimental stability | Expect breaking changes between versions |
| No built-in retargeting pipeline | Use existing IK Retargeter alongside UAF |
| Editor UX still evolving | Workspace Editor is functional but rough |

---

## Resources

- **Official FAQ:** Epic Developer Community → Knowledge Base → "Unreal Animation Framework (UAF) FAQ"
- **Architecture deep-dive:** RemRemRemRe's blog — "My Understanding of the Unreal Animation Framework in 5.6"
- **Mover + UAF setup:** David Martinez's guide — "How to setup Mover 2.0 + UAF + Motion Matching in 5.7"
- **Game Animation Sample:** Epic Marketplace / Fab — Updated with UAF explorations in UE 5.7

> **Bottom line:** UAF is the future of Unreal animation. It's not ready for shipping games yet, but teams starting new projects on UE 5.8+ should prototype with it. Structure your animation logic as modular, data-driven systems today, and the migration to UAF will be straightforward.
