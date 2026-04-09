# G57 — Animation Rigging & Procedural Animation

> **Category:** guide · **Engine:** Unity 6 (6000.0+) · **Related:** [G7 Animation System](G7_animation_system.md) · [G3 Physics & Collision](G3_physics_and_collision.md) · [G33 Object Pooling](G33_object_pooling.md) · [Unity Rules](../unity-arch-rules.md)

The **Animation Rigging** package (`com.unity.animation.rigging` 1.x) layers runtime procedural constraints on top of baked animations. This lets animated characters interact with their world — aiming weapons at targets, planting feet on uneven terrain, reaching for objects, and adding secondary motion to armor/accessories — all without baking new clips. This guide covers setup, the constraint pipeline, common IK patterns, and performance considerations.

---

## Why Animation Rigging?

Baked animation clips are authored against a flat reference pose on flat ground. In a real game, characters need to:

- **Aim a weapon** at a dynamic target (player cursor, enemy position)
- **Plant feet** on slopes, stairs, and uneven terrain
- **Reach and grab** objects at runtime-determined positions
- **React to hits** with procedural flinch layered over locomotion
- **Jiggle and sway** armor, capes, hair, and accessories

Without runtime rigging, you'd need an exponential number of baked clips for every possible interaction. Animation Rigging solves this by applying constraints **after** the Animator evaluates, modifying the final bone transforms procedurally.

---

## Architecture: Rig Builder & Constraint Pipeline

```
Animator (evaluates clips / blend trees / state machine)
    │
    ▼
Rig Builder (processes Rig layers top-to-bottom)
    │
    ├── Rig Layer 1: "Aim" (weight 0-1)
    │   ├── Multi-Aim Constraint (spine, chest, head → look target)
    │   └── Two Bone IK (right arm → weapon aim point)
    │
    ├── Rig Layer 2: "Feet IK" (weight 0-1)
    │   ├── Two Bone IK (left leg → ground contact)
    │   └── Two Bone IK (right leg → ground contact)
    │
    └── Rig Layer 3: "Secondary Motion" (weight 0-1)
        └── Damped Transform (shoulder pad → follows with lag)
```

### Setup Steps

```csharp
// 1. Add Rig Builder to the Animator root GameObject
// WHY: Rig Builder is the entry point — it discovers all child Rig components
// and evaluates their constraints after the Animator runs.

// 2. Create child GameObjects for each Rig layer
// WHY: Each Rig can be weighted independently (0 = off, 1 = fully applied).
// This lets you blend aim on/off smoothly during gameplay transitions.

// 3. Add constraint components to GameObjects under each Rig
// WHY: Constraints modify specific bones. Each constraint type targets
// different bone chain configurations (IK, aim, twist, damped, etc.).
```

### Component Hierarchy in the Inspector

```
Character (Animator + Rig Builder)
├── Model (SkinnedMeshRenderer)
├── AimRig (Rig component, weight = 1.0)
│   ├── SpineAim (Multi-Aim Constraint)
│   ├── ChestAim (Multi-Aim Constraint)
│   └── RightArmIK (Two Bone IK Constraint)
├── FeetRig (Rig component, weight = 1.0)
│   ├── LeftFootIK (Two Bone IK Constraint)
│   └── RightFootIK (Two Bone IK Constraint)
└── Targets (empty parent for IK targets)
    ├── AimTarget (Transform)
    ├── LeftFootTarget (Transform)
    └── RightFootTarget (Transform)
```

---

## Built-in Constraint Types

| Constraint | Bones | Use Case |
|-----------|-------|----------|
| **Two Bone IK** | 3 joints (root → mid → tip) | Arms reaching, legs planting on ground |
| **Multi-Aim** | 1+ bones aiming at a target | Head/spine tracking a look target |
| **Multi-Position** | 1+ bones following a position | Hand following a grab point |
| **Multi-Rotation** | 1+ bones matching a rotation | Wrist aligning to held object |
| **Multi-Parent** | 1 bone, N parent candidates | Weapon parenting (hand, back, holster) |
| **Twist Correction** | Chain of twist bones | Forearm twist distribution |
| **Damped Transform** | 1 bone following with damping | Secondary motion (capes, pouches, antennae) |
| **Chain IK** | N-bone chain | Tails, tentacles, spines |
| **Blend Constraint** | 1 bone between two transforms | Blending between two attachment points |
| **Override Transform** | 1 bone, direct override | Full procedural control of a single bone |

---

## Pattern: Foot IK on Uneven Terrain

The most common use case — keeping feet planted on slopes and stairs instead of floating or clipping through geometry.

```csharp
using UnityEngine;

// Foot IK Controller — raycasts from hips to find ground contact points
// and positions IK targets so the Animation Rigging Two Bone IK constraints
// can plant feet on uneven terrain.
// WHY: Without this, baked walk animations assume flat ground.
// The character's feet float on slopes and clip through stairs.
public class FootIKController : MonoBehaviour
{
    [Header("References")]
    [SerializeField] private Transform _leftFootTarget;
    [SerializeField] private Transform _rightFootTarget;
    [SerializeField] private Transform _leftFootBone;
    [SerializeField] private Transform _rightFootBone;

    [Header("Settings")]
    // WHY: Raycast from above the foot downward to find the ground surface.
    // 1.5m covers most step heights; increase for very steep terrain.
    [SerializeField] private float _raycastDistance = 1.5f;
    [SerializeField] private float _footOffset = 0.05f;
    [SerializeField] private LayerMask _groundLayer;

    // WHY: Smoothing prevents popping when ground height changes suddenly
    // (e.g., stepping onto a rock). 10-15 is responsive yet smooth.
    [SerializeField] private float _smoothSpeed = 12f;

    private Vector3 _leftTargetPos;
    private Vector3 _rightTargetPos;
    private Quaternion _leftTargetRot;
    private Quaternion _rightTargetRot;

    void LateUpdate()
    {
        // WHY: LateUpdate runs after the Animator but before Rig Builder.
        // This ensures IK targets reflect the current animation pose.
        UpdateFootTarget(_leftFootBone, ref _leftTargetPos, ref _leftTargetRot);
        UpdateFootTarget(_rightFootBone, ref _rightTargetPos, ref _rightTargetRot);

        _leftFootTarget.position = Vector3.Lerp(
            _leftFootTarget.position, _leftTargetPos, Time.deltaTime * _smoothSpeed);
        _leftFootTarget.rotation = Quaternion.Slerp(
            _leftFootTarget.rotation, _leftTargetRot, Time.deltaTime * _smoothSpeed);

        _rightFootTarget.position = Vector3.Lerp(
            _rightFootTarget.position, _rightTargetPos, Time.deltaTime * _smoothSpeed);
        _rightFootTarget.rotation = Quaternion.Slerp(
            _rightFootTarget.rotation, _rightTargetRot, Time.deltaTime * _smoothSpeed);
    }

    private void UpdateFootTarget(
        Transform footBone, ref Vector3 targetPos, ref Quaternion targetRot)
    {
        // WHY: Raycast from above the current foot position straight down.
        // The bone position comes from the current animation frame.
        Vector3 rayOrigin = footBone.position + Vector3.up * _raycastDistance * 0.5f;

        if (Physics.Raycast(rayOrigin, Vector3.down, out RaycastHit hit,
                _raycastDistance, _groundLayer))
        {
            // WHY: Place the IK target at the ground hit point + small offset
            // to prevent the foot mesh clipping into the surface.
            targetPos = hit.point + Vector3.up * _footOffset;

            // WHY: Align foot rotation to the surface normal so the sole
            // matches the slope angle. Uses the foot's current forward direction
            // projected onto the ground plane.
            Vector3 footForward = Vector3.ProjectOnPlane(footBone.forward, hit.normal);
            targetRot = Quaternion.LookRotation(footForward, hit.normal);
        }
        else
        {
            // WHY: No ground found — use the raw animation position.
            targetPos = footBone.position;
            targetRot = footBone.rotation;
        }
    }
}
```

---

## Pattern: Aim Constraint for Weapons

```csharp
using UnityEngine;
using UnityEngine.Animations.Rigging;

// Runtime aim weight controller — smoothly blends aim on/off
// WHY: You don't want aim IK active during cutscenes, melee, or reloading.
// Blending the Rig weight avoids jarring snaps.
public class AimRigController : MonoBehaviour
{
    [SerializeField] private Rig _aimRig;
    [SerializeField] private Transform _aimTarget;
    [SerializeField] private float _blendSpeed = 8f;

    private float _targetWeight;

    // WHY: Call from your weapon system when entering/leaving aim mode.
    public void SetAiming(bool isAiming) =>
        _targetWeight = isAiming ? 1f : 0f;

    // WHY: Move the aim target to where the player is looking.
    // For third-person: screen-center raycast into the world.
    // For first-person: camera forward * distance.
    public void SetAimPosition(Vector3 worldPos) =>
        _aimTarget.position = worldPos;

    void Update()
    {
        // WHY: Smooth weight transitions prevent animation pops.
        _aimRig.weight = Mathf.MoveTowards(
            _aimRig.weight, _targetWeight, _blendSpeed * Time.deltaTime);
    }
}
```

---

## Pattern: Procedural Secondary Motion

Use `Damped Transform` constraints for physics-like secondary motion without a full physics simulation:

```
Character
└── SecondaryRig (Rig, weight = 1.0)
    ├── ShoulderPadL (Damped Transform → follows shoulder bone with lag)
    ├── ShoulderPadR (Damped Transform → follows shoulder bone with lag)
    ├── BeltPouch (Damped Transform → follows hip bone with lag)
    └── Antenna (Chain IK → tip follows damped target)
```

**Damped Transform settings:**
- **Maintain Aim:** Enable for objects that should keep pointing in a direction (antennae, tails)
- **Damp Position:** 0.1–0.3 for subtle sway, 0.5+ for heavy/loose objects
- **Damp Rotation:** 0.1–0.3 typically; higher values feel sluggish

---

## Custom Constraints

When built-in constraints aren't enough, implement `IRigConstraint`:

```csharp
using UnityEngine;
using UnityEngine.Animations.Rigging;
using UnityEngine.Animations;
using Unity.Burst;

// WHY: Custom constraints let you encode game-specific procedural animation.
// Example: a "breathe" constraint that oscillates a chest bone based on stamina.

// Step 1: Define the constraint data (serialized settings)
[System.Serializable]
public struct BreatheConstraintData : IAnimationJobData
{
    public Transform constrainedBone;
    public float breatheRate;
    public float breatheDepth;

    public bool IsValid() => constrainedBone != null;
    public void SetDefaultValues()
    {
        breatheRate = 0.3f;
        breatheDepth = 0.02f;
    }
}

// Step 2: Define the animation job (runs in the animation thread)
[BurstCompile]
public struct BreatheConstraintJob : IWeightedAnimationJob
{
    public ReadWriteTransformHandle constrainedBone;
    public FloatProperty breatheRate;
    public FloatProperty breatheDepth;

    // WHY: jobWeight comes from the Rig weight — lets you fade the effect.
    public FloatProperty jobWeight { get; set; }

    public void ProcessRootMotion(AnimationStream stream) { }

    public void ProcessAnimation(AnimationStream stream)
    {
        float w = jobWeight.Get(stream);
        if (w <= 0f) return;

        // WHY: Read the current bone position from the animation stream,
        // apply a sine-wave offset, and write it back.
        Vector3 pos = constrainedBone.GetLocalPosition(stream);
        float offset = Mathf.Sin(Time.time * breatheRate.Get(stream) * Mathf.PI * 2f)
                       * breatheDepth.Get(stream) * w;
        pos.y += offset;
        constrainedBone.SetLocalPosition(stream, pos);
    }
}

// Step 3: Create the constraint binder (connects data → job)
// Omitted for brevity — follow the Animation Rigging custom constraint documentation
// for the full IRigConstraint + ConstraintBinder pattern.
```

---

## Performance Considerations

| Factor | Impact | Mitigation |
|--------|--------|------------|
| Constraint count | Each constraint adds work to the animation thread | Combine multi-aim chains into one Multi-Aim with multiple sources |
| Rig weight = 0 | Constraints with weight 0 are **still evaluated** | Disable the Rig component entirely when not in use |
| Raycasts for IK | Per-foot raycasts each frame | Use `Physics.RaycastNonAlloc` and cache the `RaycastHit[]` array |
| Many characters | N characters × M constraints = animation thread pressure | LOD: disable rigs on distant characters; reduce constraint count at lower LODs |
| Custom jobs | Burst compilation required for performance | Always apply `[BurstCompile]` to animation jobs |

### LOD Strategy for Rigs

```csharp
// WHY: Distant characters don't need foot IK or aim constraints.
// Disabling rigs saves significant animation thread time.
void OnBecameInvisible()
{
    _feetRig.enabled = false;
    _aimRig.enabled = false;
}

void OnBecameVisible()
{
    _feetRig.enabled = true;
    _aimRig.enabled = true;
}

// WHY: For finer control, scale rig weights by distance.
// Characters at 30m+ don't need sub-frame IK precision.
void UpdateRigLOD(float distToCamera)
{
    bool closeEnough = distToCamera < 25f;
    _feetRig.weight = closeEnough ? 1f : 0f;

    // WHY: Aim rig matters at longer range (player notices if enemy isn't looking at them)
    _aimRig.weight = distToCamera < 50f ? 1f : 0f;
}
```

---

## Unity 6 Compatibility Notes

- Animation Rigging 1.3.x is verified for Unity 6 (6000.0+). Check the Package Manager for the latest verified version.
- The package uses the **Playables API** internally — it integrates with the Animator graph, not DOTS Animation.
- If using **Entities Graphics** for rendering, Animation Rigging still works but requires a hybrid setup with a companion `Animator` on the entity's GameObject representation.
- **`Animator.ResetControllerState()`** (new in Unity 6.3) is useful for pooled characters — call it before reconfiguring rigs on a reused character to clear stale animation state.

---

## Common Pitfalls

1. **Rig Builder not listed in Animator's evaluation order** — ensure the Rig Builder is on the same GameObject as the Animator, or a child. It must be discovered during `Awake()`.

2. **IK targets parented under animated bones** — targets move with the animation, defeating the purpose. Parent IK targets under a static root or the character root (not a bone).

3. **Weight snapping** — setting rig weight from 0 to 1 instantly causes a visual pop. Always lerp/MoveTowards the weight over several frames.

4. **Forgetting to rebind after structural changes** — if you add/remove constraints at runtime, call `RigBuilder.Build()` to rebuild the Playable graph.

5. **Using Animation Rigging for hundreds of NPCs** — the Playables graph has overhead per character. For crowd animation, consider simpler bone manipulation in a custom Job rather than full rig evaluation.
