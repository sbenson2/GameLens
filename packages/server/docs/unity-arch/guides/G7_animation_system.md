# Animation System

> **Category:** guide · **Engine:** Unity 6 / Unity 2022 LTS · **Related:** [G1 Scene Management](G1_scene_management.md), [G2 Input System](G2_input_system.md)

Unity's animation system (Mecanim) drives character animation through Animator Controllers — state machines that blend clips based on game parameters. This guide covers Animator setup, state machine design, Blend Trees, Animation Layers, scripting integration, and performance best practices for Unity 6.

## Architecture Overview

Unity's animation pipeline has four main components:

1. **Animation Clips** — individual animation assets (idle, walk, attack) imported from DCC tools or created in-engine.
2. **Animator Controller** — a state machine asset (`.controller`) that defines states, transitions, and parameters.
3. **Animator Component** — the MonoBehaviour attached to a GameObject that drives the controller.
4. **Avatar** — defines the humanoid rig mapping for retargeting animations across different character models.

```
Animation Clips ──► Animator Controller (state machine)
                          │
                    Animator Component (on GameObject)
                          │
                    Avatar (humanoid rig mapping)
```

## Setting Up the Animator Controller

### Creating States and Transitions

Each state in an Animator Controller references an Animation Clip (or Blend Tree). Transitions define how and when the system moves between states.

```csharp
using UnityEngine;

public class CharacterAnimator : MonoBehaviour
{
    // Cache the Animator reference for performance —
    // GetComponent<T>() is expensive in hot paths
    private Animator _animator;

    // Use hashed parameter IDs instead of strings.
    // String lookups allocate and are slower; hashes are a one-time cost.
    private static readonly int SpeedHash = Animator.StringToHash("Speed");
    private static readonly int IsGroundedHash = Animator.StringToHash("IsGrounded");
    private static readonly int JumpHash = Animator.StringToHash("Jump");
    private static readonly int AttackHash = Animator.StringToHash("Attack");

    private void Awake()
    {
        _animator = GetComponent<Animator>();
    }

    public void UpdateMovement(float speed, bool isGrounded)
    {
        // SetFloat with dampTime smooths parameter changes, preventing
        // jerky transitions when input changes rapidly
        _animator.SetFloat(SpeedHash, speed, 0.1f, Time.deltaTime);
        _animator.SetBool(IsGroundedHash, isGrounded);
    }

    public void TriggerJump()
    {
        // Triggers auto-reset after being consumed by a transition,
        // making them ideal for one-shot actions like jump or attack
        _animator.SetTrigger(JumpHash);
    }

    public void TriggerAttack()
    {
        _animator.SetTrigger(AttackHash);
    }
}
```

### Parameter Types

| Type | Use Case | Example |
|------|----------|---------|
| `Float` | Continuous values (speed, blend weights) | Locomotion speed |
| `Int` | Discrete states (weapon type index) | Equipped weapon ID |
| `Bool` | Binary states (grounded, crouching) | `IsGrounded` |
| `Trigger` | One-shot events (auto-resets) | Jump, Attack |

## Blend Trees

Blend Trees smoothly interpolate between multiple clips based on one or two parameters. They have no state logic of their own — they simply blend.

### 1D Blend Tree (Speed-Based Locomotion)

A 1D Blend Tree uses a single parameter to blend between clips. This is the most common pattern for locomotion.

```
Blend Tree: Locomotion (1D)
Parameter: Speed
├── Idle      (threshold: 0.0)
├── Walk      (threshold: 0.5)
└── Run       (threshold: 1.0)
```

**Why 1D?** For linear progressions (idle → walk → run), a single axis is sufficient. The Animator interpolates between adjacent clips based on where the `Speed` value falls.

### 2D Blend Tree (Directional Movement)

Use `2D Simple Directional` or `2D Freeform Directional` when blending across two axes (e.g., forward/backward + left/right strafe).

```csharp
public class DirectionalMovement : MonoBehaviour
{
    private Animator _animator;
    private static readonly int MoveXHash = Animator.StringToHash("MoveX");
    private static readonly int MoveYHash = Animator.StringToHash("MoveY");

    private void Awake()
    {
        _animator = GetComponent<Animator>();
    }

    public void SetDirection(Vector2 direction)
    {
        // 2D blend trees use two parameters to select from a
        // grid of directional clips (forward, back, strafe-left, strafe-right)
        _animator.SetFloat(MoveXHash, direction.x, 0.1f, Time.deltaTime);
        _animator.SetFloat(MoveYHash, direction.y, 0.1f, Time.deltaTime);
    }
}
```

**Blend Type Selection:**
- `2D Simple Directional` — one clip per cardinal direction. Best when clips don't overlap in direction.
- `2D Freeform Directional` — multiple clips can share a direction. Best when you have diagonal clips.
- `2D Freeform Cartesian` — blends by X/Y independently. Rare; use for unrelated axes.

## Animation Layers

Layers allow different body parts to play different animations simultaneously. A common pattern: full-body locomotion on the base layer, upper-body actions (shooting, waving) on a higher layer.

```
Layer 0: Base Layer        (full body — locomotion)
Layer 1: Upper Body        (override — shooting, reloading)
Layer 2: Face              (additive — facial expressions)
```

### Layer Blending Modes

- **Override** — replaces the lower layer's output for the masked bones. Use for actions that fully replace movement (e.g., aiming replaces upper-body locomotion).
- **Additive** — adds on top of the lower layer. Use for layered effects (e.g., breathing animation on top of everything).

### Controlling Layer Weight at Runtime

```csharp
public class LayerController : MonoBehaviour
{
    private Animator _animator;
    private int _upperBodyLayerIndex;
    private float _targetWeight;
    private float _currentWeight;

    // Transition duration in seconds — prevents jarring visual pops
    // when enabling/disabling a layer. 0.15s is fast enough to feel
    // responsive but slow enough to look smooth.
    [SerializeField] private float transitionDuration = 0.15f;

    private void Awake()
    {
        _animator = GetComponent<Animator>();
        // Look up layer index by name once, cache it
        _upperBodyLayerIndex = _animator.GetLayerIndex("Upper Body");
    }

    public void EnableUpperBody(bool enable)
    {
        _targetWeight = enable ? 1f : 0f;
    }

    private void Update()
    {
        // Lerp the weight each frame for smooth blending
        _currentWeight = Mathf.MoveTowards(
            _currentWeight, _targetWeight,
            Time.deltaTime / transitionDuration
        );
        _animator.SetLayerWeight(_upperBodyLayerIndex, _currentWeight);
    }
}
```

## Hub-and-Spoke Pattern

For complex Animator Controllers, the **Hub-and-Spoke** pattern keeps things debuggable and maintainable:

```
                    ┌──── Attack ────┐
                    │                │
Empty (Hub) ───────├──── Hurt ──────┤──── Empty (Hub)
                    │                │
                    └──── Interact ──┘
```

**How it works:**
1. A central empty state acts as the "hub."
2. Each action state transitions out from the hub and returns to it.
3. Every spoke resets any state it touches before returning.

**Why this works:** Debugging is straightforward — you can see exactly which transition fired. Adding new actions means adding new spokes, not rewiring existing transitions. This prevents the "spaghetti state machine" problem.

## Animation Events

Animation Events fire callbacks at specific frames during clip playback. Use them for gameplay-synced effects (footstep sounds, hit detection windows).

```csharp
public class AnimationEventReceiver : MonoBehaviour
{
    [SerializeField] private AudioClip footstepSound;
    [SerializeField] private AudioSource audioSource;

    // Called by an Animation Event placed on the footstep frame.
    // The method name must exactly match the event's Function field.
    public void OnFootstep()
    {
        audioSource.PlayOneShot(footstepSound);
    }

    // Attack hit window — enable/disable a hitbox collider
    // at the exact frames the weapon is swinging
    public void EnableHitbox()
    {
        // Enable damage collider at the start of the swing
        GetComponentInChildren<DamageCollider>().SetActive(true);
    }

    public void DisableHitbox()
    {
        // Disable at the end of the swing
        GetComponentInChildren<DamageCollider>().SetActive(false);
    }
}
```

> **Caution:** Animation Events only fire on clips playing at weight > 0. If a layer weight is 0 or a clip is fully blended out, events won't trigger. Design your systems to handle this.

## StateMachineBehaviour

`StateMachineBehaviour` scripts attach to states or state machines and receive lifecycle callbacks. Use them for state-local logic without polluting your main scripts.

```csharp
using UnityEngine;

// Attach this to a "Stunned" state in the Animator.
// It automatically applies a speed debuff while the state is active
// and cleans up on exit — no external tracking needed.
public class StunnedStateBehaviour : StateMachineBehaviour
{
    [SerializeField] private float speedMultiplier = 0.3f;

    public override void OnStateEnter(
        Animator animator, AnimatorStateInfo stateInfo, int layerIndex)
    {
        // Apply slow effect when entering the stunned state
        var movement = animator.GetComponent<CharacterMovement>();
        movement?.ApplySpeedModifier(speedMultiplier);
    }

    public override void OnStateExit(
        Animator animator, AnimatorStateInfo stateInfo, int layerIndex)
    {
        // Remove slow effect when leaving
        var movement = animator.GetComponent<CharacterMovement>();
        movement?.RemoveSpeedModifier();
    }
}
```

## Performance Best Practices

### 1. Avoid Scale Animations

Animating `Transform.scale` is significantly more expensive than position or rotation because Unity must recompute the entire bone hierarchy's scaling. If you need a "grow/shrink" effect, animate a parent transform or use shader-based scaling.

### 2. Use Culling Modes

```
Animator → Culling Mode:
├── Always Animate   — updates even off-screen (use for player, critical NPCs)
├── Cull Update      — stops updates when invisible (default for most NPCs)
└── Cull Completely  — fully disables when invisible (use for background crowds)
```

Set `Cull Update Transforms` or `Cull Completely` for off-screen characters to save CPU.

### 3. Optimize Transitions

- Keep transition durations short (0.1–0.25s) to reduce the time two states are evaluated simultaneously.
- Use `Has Exit Time = false` for interrupt-driven transitions (player input) so they fire immediately.
- Use `Has Exit Time = true` for animations that should complete (death, hit reactions).

### 4. Reduce Animator Overhead for Crowds

For large numbers of animated characters (50+), consider:

- **GPU Instanced Animation** — bake clips into textures, sample in vertex shader. No Animator overhead per instance.
- **Animation LOD** — reduce update frequency for distant characters (`animator.speed` or manual update calls).
- **Simple Animation** — for non-interactive background characters, use `Animation` (legacy) or `Playables API` instead of full Animator Controllers.

### 5. Unity 6 Performance Gains

Unity 6.x introduced significant Mecanim optimizations:
- **30–56% CPU reduction** on desktop for complex Animator setups
- **60–86% CPU reduction** on mobile platforms
- Improved Burst-compiled animation jobs for multi-threaded evaluation

These gains are automatic — no code changes required when upgrading.

## Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| String parameter lookups in Update | Use `Animator.StringToHash()` once, cache the int |
| Trigger not consumed | Ensure a transition actually uses the trigger condition |
| Blend Tree jitters | Add dampTime to `SetFloat()` calls |
| Layer weight pops | Lerp weight changes over 0.1–0.3 seconds |
| Too many transitions | Use Hub-and-Spoke or sub-state machines |
| Animation Events not firing | Check clip weight > 0 and method name matches exactly |

## Further Reading

- [Unity Manual: Animator Controller](https://docs.unity3d.com/6000.4/Documentation/Manual/class-AnimatorController.html)
- [Unity Manual: Blend Trees](https://docs.unity3d.com/6000.3/Documentation/Manual/class-BlendTree.html)
- [Unity Tips: Building Animator Controllers](https://unity.com/how-to/build-animator-controllers)
- [Unity Manual: Mecanim Performance](https://docs.unity3d.com/6000.2/Documentation/Manual/MecanimPeformanceandOptimization.html)
