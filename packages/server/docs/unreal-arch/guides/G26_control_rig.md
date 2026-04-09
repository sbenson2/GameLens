# G26 — Control Rig in Unreal Engine 5

> **Category:** guide · **Engine:** Unreal Engine 5.4+ · **Related:** [G4 Animation System](G4_animation_system.md) · [G22 Motion Matching](G22_motion_matching.md) · [Architecture Overview](../architecture/E1_architecture_overview.md) · [Unreal Rules](../unreal-arch-rules.md)

Control Rig is Unreal Engine's node-based rigging and procedural animation framework. It runs on **RigVM**, a lightweight virtual machine purpose-built for fast pose calculations at runtime. Control Rig lets you build FK/IK rigs, drive procedural animation (look-at, foot placement, turret tracking), and bake Sequencer animation back onto controls — all without leaving the editor. This guide covers the architecture, Forward/Backward Solve model, key Rig Unit nodes, C++ integration, and best practices.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                  UControlRig                              │
│  (derives from URigVMHost)                               │
│                                                           │
│  ┌────────────────────────────────────────────────┐      │
│  │  Rig Graph (visual node graph)                  │      │
│  │                                                  │      │
│  │  ┌──────────────┐    ┌────────────────────┐    │      │
│  │  │ Rig Units    │───▶│ Execution Contexts  │    │      │
│  │  │ (FRigUnit)   │    │ (Forward / Backward)│    │      │
│  │  └──────────────┘    └────────────────────┘    │      │
│  │         │                                       │      │
│  │         ▼                                       │      │
│  │  ┌──────────────┐    ┌────────────────────┐    │      │
│  │  │ Rig Hierarchy│───▶│ Controls / Bones /  │    │      │
│  │  │ (URigHierarchy)│  │ Nulls / Connectors │    │      │
│  │  └──────────────┘    └────────────────────┘    │      │
│  └────────────────────────────────────────────────┘      │
│                        │                                  │
│                        ▼                                  │
│  ┌────────────────────────────────────────────────┐      │
│  │  RigVM  (bytecode execution)                    │      │
│  │  • Compiles node graph to bytecode              │      │
│  │  • Executes per-frame at animation tick         │      │
│  │  • Lightweight — no full Blueprint VM overhead  │      │
│  └────────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────┘
```

### Key Classes

| Class | Role |
|-------|------|
| `UControlRig` | The runtime rig asset. Derives from `URigVMHost`. Owns the hierarchy and RigVM instance. |
| `URigHierarchy` | Manages the bone/control/null/connector tree. Each element has a `FRigElementKey` (name + type). |
| `FRigUnit` | Base struct for all rig nodes. Each unit implements `Execute()` and declares inputs/outputs via `RIGVM_METHOD`. |
| `UControlRigComponent` | Actor component that runs a Control Rig on a Skeletal Mesh at runtime. |
| `FControlRigAnimNode` (`AnimNode_ControlRig`) | AnimGraph node that evaluates a Control Rig inside an Animation Blueprint. |

---

## Forward Solve vs Backward Solve

Control Rig operates in two solve directions, each wired through separate execution pins in the Rig Graph.

### Forward Solve

The primary runtime path. Controls and variables drive bone transforms.

**Use cases:**
- Gameplay-driven procedural animation (look-at, aim offset, foot IK)
- Runtime rig evaluation in Animation Blueprints
- Sequencer-driven cinematic animation

```
Controls / Variables  ──▶  Rig Logic  ──▶  Bone Transforms  ──▶  Final Pose
```

**How to use:** Connect your rig logic to the `Forwards Solve` execution node in the Rig Graph. This is the default and most common path.

### Backward Solve

Runs the rig in reverse — bone transforms drive control transforms.

**Use cases:**
- Baking an animation sequence onto Control Rig controls via **Bake to Control Rig**
- Editing imported mocap data on the control level
- Transferring FK animation to an IK rig setup

```
Bone Transforms (from Sequence)  ──▶  Inverse Logic  ──▶  Control Transforms
```

**How to use:** Connect inverse logic to the `Backwards Solve` execution node. Each IK node must have a corresponding inverse path. Epic's built-in nodes (FABRIK, Two Bone IK) support automatic inversion.

---

## Core Rig Unit Nodes

### Transform Manipulation

| Node | Description | UE Version |
|------|-------------|------------|
| `Set Transform` | Sets absolute or relative transform on any hierarchy element | 5.0+ |
| `Get Transform` | Reads current transform from bone/control/null | 5.0+ |
| `Set Bone (BoneSpace)` | Sets bone transform in local or global space | 5.0+ |
| `Interpolate` | Blends between two transforms by alpha | 5.0+ |

### IK Solvers

| Node | Description | UE Version |
|------|-------------|------------|
| `Two Bone IK` | Classic two-bone IK (arms, legs). Supports pole vector. | 5.0+ |
| `FABRIK` | Forward And Backward Reaching IK for multi-bone chains | 5.0+ |
| `Full Body IK` | Whole-skeleton IK solver. Expensive but powerful for cinematic. | 5.0+ |
| `CCDIK` | Cyclic Coordinate Descent IK for tentacles, tails, chains | 5.0+ |
| `Aim` | Points a bone axis at a target while maintaining an up vector | 5.0+ |

### Constraints

| Node | Description | UE Version |
|------|-------------|------------|
| `Parent Constraint` | Drives an element to follow one or more parents with weights | 5.0+ |
| `Position Constraint` | Constrains position only | 5.0+ |
| `Orientation Constraint` | Constrains rotation only | 5.0+ |
| `Distance Constraint` | Maintains distance between two elements | 5.0+ |

### Procedural

| Node | Description | UE Version |
|------|-------------|------------|
| `Spawn Bone / Control / Null` | Dynamically creates hierarchy elements at Construction | 5.2+ |
| `Set Curve Value` | Drives animation curves from rig logic | 5.0+ |
| `Math Expression` | Inline math node for quick calculations | 5.0+ |
| `For Each` | Iterates over hierarchy elements by type/tag | 5.1+ |

---

## Using Control Rig in Animation Blueprints

The `AnimNode_ControlRig` node lets you evaluate a Control Rig as part of the AnimGraph pose pipeline.

### Setup Steps

1. Open your Animation Blueprint's AnimGraph
2. Add a **Control Rig** node from the context menu
3. Set the **Control Rig Class** property to your rig asset
4. Wire the input pose (from State Machine, Blend Space, etc.) into the node
5. Map gameplay variables to rig controls using **Input Mapping**

### C++ Integration

```cpp
// In your custom AnimInstance header
#include "ControlRig/AnimNode_ControlRig.h"

UPROPERTY(EditAnywhere, Category = "Control Rig")
FAnimNode_ControlRig ControlRigNode;

// At runtime — set a control value
if (UControlRig* Rig = ControlRigNode.GetControlRig())
{
    FRigControlValue Value;
    Value.Set<FVector>(LookAtTarget);
    Rig->SetControlValue(TEXT("LookAt_Target"), Value);
}
```

### UControlRigComponent (Actor-Level)

For rigs that run outside an Animation Blueprint (e.g., a mechanical door, a procedural turret):

```cpp
UPROPERTY(VisibleAnywhere)
UControlRigComponent* ControlRigComp;

// In BeginPlay or Tick
ControlRigComp->Initialize();

// Set control value
ControlRigComp->SetControlVector(TEXT("Target_Position"), EControlRigComponentSpace::WorldSpace, TargetLocation);
```

---

## Procedural Animation Recipes

### Foot IK (Ground Adaptation)

1. Create a Control Rig with a Forward Solve graph
2. Use **Line Trace** results passed in as variables
3. Apply `Two Bone IK` to each leg chain with the trace hit as the effector
4. Offset the pelvis downward by the shortest leg delta
5. Run the rig via `AnimNode_ControlRig` after your locomotion State Machine

### Look-At / Aim

1. Add a `Vector` variable for the look target (set from gameplay code)
2. Use the `Aim` node on the head/neck bone, pointing the forward axis at the target
3. Clamp rotation with `Math Expression` to prevent unnatural neck twists
4. Blend with `Interpolate` for smooth transitions

### Procedural Turret / Mechanical

1. Use `UControlRigComponent` on the turret Actor
2. In Forward Solve: `Aim` the barrel bone at the target
3. Decompose into yaw (base) and pitch (barrel) with separate `Set Transform` nodes
4. Apply rotation speed limits via `Math Expression` + `DeltaTime`

---

## Sequencer Integration

Control Rig is a first-class citizen in Sequencer for cinematics:

1. Add a Skeletal Mesh Actor to your Level Sequence
2. Click **+ Track → Control Rig → Bake to Control Rig** (uses Backward Solve)
3. Edit controls directly on the Sequencer timeline — key individual controls
4. Use **Constraint Channels** to blend between FK and IK mid-shot
5. Export the final bake back to an Animation Sequence via **Bake to Anim Sequence**

---

## Performance Considerations

- **RigVM is fast** — compiles to bytecode, avoids Blueprint VM overhead. Suitable for runtime.
- **Full Body IK is expensive** — use only for cinematics or a small number of characters. Prefer `Two Bone IK` for gameplay.
- **Disable when not needed** — use `UControlRigComponent::SetIsEnabled(false)` or LOD settings to skip evaluation on distant characters.
- **Thread safety** — Control Rig evaluation is safe on worker threads when used through the Animation Blueprint pipeline. Avoid modifying the hierarchy from the game thread during evaluation.
- **Construction Event** runs once (on rig initialization). Forward/Backward Solve runs every frame. Keep construction logic (spawning elements) out of the solve graphs.

---

## Common Pitfalls

| Problem | Cause | Fix |
|---------|-------|-----|
| Controls don't move bones | Forward Solve not connected | Wire rig logic through the `Forwards Solve` execution pin |
| Bake to Control Rig produces identity poses | Backward Solve graph missing or incomplete | Add inverse logic for every IK chain in the Backward Solve graph |
| Jittery procedural animation | No interpolation / smoothing | Use `Interpolate` node or `FMath::FInterpTo` in variables |
| Rig works in editor but not in packaged build | Forward Solve function not cooking | Ensure the Control Rig asset is referenced by an Animation Blueprint or loaded explicitly |
| Control values ignored at runtime | Setting controls before rig is initialized | Call `Initialize()` on `UControlRigComponent` before setting values |

---

## Further Reading

- [Control Rig Documentation (Epic)](https://dev.epicgames.com/documentation/en-us/unreal-engine/control-rig-in-unreal-engine) — official reference
- [Forward & Backward Solve](https://dev.epicgames.com/documentation/en-us/unreal-engine/control-rig-forwards-solve-and-backwards-solve-in-unreal-engine) — solve direction deep dive
- [Control Rig in Animation Blueprints](https://dev.epicgames.com/documentation/en-us/unreal-engine/control-rig-in-animation-blueprints-in-unreal-engine) — AnimGraph integration
- [G4 Animation System](G4_animation_system.md) — parent guide on UE5 animation pipeline
- [G22 Motion Matching](G22_motion_matching.md) — complements Control Rig for locomotion
