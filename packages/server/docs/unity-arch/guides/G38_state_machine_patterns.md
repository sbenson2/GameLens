# G38 — State Machine Patterns for Gameplay Logic

> **Category:** guide · **Engine:** Unity 6 (6000.x) · **Related:** [G7 Animation System](G7_animation_system.md) · [G37 Event-Driven Architecture](G37_event_driven_architecture.md) · [G31 Behavior Trees](G31_behavior_trees.md) · [G14 ScriptableObject Architecture](G14_scriptable_object_architecture.md) · [Unity Rules](../unity-arch-rules.md)

State machines are the most battle-tested pattern in game development. A player is idle, running, jumping, or attacking — never two at once. An enemy is patrolling, chasing, or fleeing. A door is locked, unlocked, or open. Whenever an entity has **discrete modes of behavior** with **defined transitions** between them, a state machine is the right tool.

This guide covers four approaches, from the simplest enum-switch pattern to Unity's built-in Animator state machine, plus a reusable code-first FSM class.

---

## Pattern Comparison

| Pattern | Complexity | Scalability | Designer-Friendly | Best For |
|---------|-----------|-------------|-------------------|----------|
| Enum + Switch | Very low | 3-5 states | No | Prototypes, simple objects (doors, pickups) |
| Class-based FSM | Medium | 10-20+ states | No | Player controllers, complex AI |
| ScriptableObject States | Medium | 10-20+ states | Yes | AI behaviors, modular enemies |
| Animator FSM | Low-Medium | Visual limit ~15 | Yes | Animation-driven logic, blend trees |

---

## Pattern 1: Enum + Switch (Quick and Simple)

The fastest path to a working state machine. Use for objects with a handful of states where you want everything in one file.

```csharp
using UnityEngine;

/// <summary>
/// A simple door with three states. The enum-switch pattern keeps all
/// logic visible in one place — great for small state counts.
/// Trade-off: becomes unwieldy beyond ~5 states.
/// </summary>
public class Door : MonoBehaviour
{
    // Enum defines the complete set of possible states.
    // The compiler ensures you can't be in an undefined state.
    public enum DoorState { Locked, Closed, Opening, Open, Closing }

    [SerializeField] private DoorState _state = DoorState.Closed;
    [SerializeField] private float _openSpeed = 2f;

    private float _openAmount; // 0 = closed, 1 = fully open

    private void Update()
    {
        // Switch on current state — each case handles its own logic.
        switch (_state)
        {
            case DoorState.Locked:
                // Do nothing — waiting for Unlock() call.
                break;

            case DoorState.Closed:
                // Idle — waiting for Open() call.
                break;

            case DoorState.Opening:
                _openAmount += Time.deltaTime * _openSpeed;
                if (_openAmount >= 1f)
                {
                    _openAmount = 1f;
                    _state = DoorState.Open; // Transition to Open
                }
                ApplyRotation();
                break;

            case DoorState.Open:
                // Fully open — waiting for Close() call or auto-close timer.
                break;

            case DoorState.Closing:
                _openAmount -= Time.deltaTime * _openSpeed;
                if (_openAmount <= 0f)
                {
                    _openAmount = 0f;
                    _state = DoorState.Closed; // Transition to Closed
                }
                ApplyRotation();
                break;
        }
    }

    // Public methods enforce valid transitions.
    // Callers don't need to know the current state — invalid transitions are no-ops.
    public void Unlock()
    {
        if (_state == DoorState.Locked)
            _state = DoorState.Closed;
    }

    public void Open()
    {
        if (_state == DoorState.Closed)
            _state = DoorState.Opening;
    }

    public void Close()
    {
        if (_state == DoorState.Open)
            _state = DoorState.Closing;
    }

    private void ApplyRotation()
    {
        transform.localRotation = Quaternion.Euler(0f, _openAmount * 90f, 0f);
    }
}
```

### When to Outgrow Enum-Switch

The pattern breaks down when: states need their own `OnEnter`/`OnExit` logic, you have per-state timers or coroutines, or the switch statement exceeds ~100 lines. At that point, move to a class-based FSM.

---

## Pattern 2: Class-Based FSM (Scalable, Code-First)

Each state is its own class with `Enter`, `Execute`, and `Exit` methods. The state machine manages transitions and lifecycle. This is the workhorse pattern for player controllers and complex AI.

### The Framework

```csharp
/// <summary>
/// Base class for all states. Subclass this for each state.
/// Generic parameter T is the "owner" — the MonoBehaviour being controlled.
/// </summary>
public abstract class State<T> where T : MonoBehaviour
{
    protected T Owner { get; private set; }

    // Called once when the FSM initializes this state.
    public void SetOwner(T owner) => Owner = owner;

    /// <summary>Called when entering this state.</summary>
    public virtual void Enter() { }

    /// <summary>Called every frame while in this state.</summary>
    public virtual void Execute() { }

    /// <summary>Called every FixedUpdate while in this state.</summary>
    public virtual void PhysicsExecute() { }

    /// <summary>Called when leaving this state.</summary>
    public virtual void Exit() { }
}

/// <summary>
/// A reusable finite state machine. Attach to any MonoBehaviour.
/// Manages current state lifecycle and transitions.
/// </summary>
public class StateMachine<T> where T : MonoBehaviour
{
    public State<T> CurrentState { get; private set; }
    public State<T> PreviousState { get; private set; }

    private readonly T _owner;

    public StateMachine(T owner)
    {
        _owner = owner;
    }

    /// <summary>
    /// Initialize the FSM with a starting state.
    /// Call this once in the owner's Awake or Start.
    /// </summary>
    public void Initialize(State<T> startingState)
    {
        CurrentState = startingState;
        CurrentState.SetOwner(_owner);
        CurrentState.Enter();
    }

    /// <summary>
    /// Transition to a new state. Calls Exit on current, Enter on next.
    /// Safe to call during Execute — the transition happens immediately.
    /// </summary>
    public void ChangeState(State<T> newState)
    {
        if (newState == CurrentState) return; // No self-transitions

        PreviousState = CurrentState;
        CurrentState.Exit();

        CurrentState = newState;
        CurrentState.SetOwner(_owner);
        CurrentState.Enter();
    }

    /// <summary>Call from owner's Update.</summary>
    public void Update() => CurrentState?.Execute();

    /// <summary>Call from owner's FixedUpdate.</summary>
    public void FixedUpdate() => CurrentState?.PhysicsExecute();

    /// <summary>Return to the previous state.</summary>
    public void RevertToPreviousState()
    {
        if (PreviousState != null)
            ChangeState(PreviousState);
    }
}
```

### Using the Framework: Player Controller

```csharp
using UnityEngine;

/// <summary>
/// Player controller driven by a class-based FSM.
/// Each movement mode is a separate State class.
/// </summary>
[RequireComponent(typeof(CharacterController))]
public class PlayerController : MonoBehaviour
{
    // Shared data that all states need access to.
    // States reference this through their Owner property.
    [Header("Movement")]
    public float WalkSpeed = 5f;
    public float RunSpeed = 10f;
    public float JumpForce = 8f;

    [HideInInspector] public CharacterController Controller;
    [HideInInspector] public Vector3 Velocity;
    [HideInInspector] public StateMachine<PlayerController> FSM;

    // Pre-allocate state instances to avoid GC. States are reused.
    public readonly PlayerIdleState IdleState = new();
    public readonly PlayerRunState RunState = new();
    public readonly PlayerJumpState JumpState = new();
    public readonly PlayerFallState FallState = new();

    private void Awake()
    {
        Controller = GetComponent<CharacterController>();

        FSM = new StateMachine<PlayerController>(this);
        FSM.Initialize(IdleState); // Start in idle
    }

    private void Update() => FSM.Update();
    private void FixedUpdate() => FSM.FixedUpdate();
}

/// <summary>Standing still — transitions to Run on input, Jump on space, Fall if airborne.</summary>
public class PlayerIdleState : State<PlayerController>
{
    public override void Enter()
    {
        // Trigger idle animation, reset velocity, etc.
        Owner.Velocity = Vector3.zero;
    }

    public override void Execute()
    {
        // Check for ground loss (walked off a ledge).
        if (!Owner.Controller.isGrounded)
        {
            Owner.FSM.ChangeState(Owner.FallState);
            return;
        }

        // Check for jump input.
        if (Input.GetButtonDown("Jump"))
        {
            Owner.FSM.ChangeState(Owner.JumpState);
            return;
        }

        // Check for movement input.
        float h = Input.GetAxisRaw("Horizontal");
        float v = Input.GetAxisRaw("Vertical");
        if (h != 0f || v != 0f)
        {
            Owner.FSM.ChangeState(Owner.RunState);
        }
    }
}

/// <summary>Moving on the ground — transitions to Idle on stop, Jump on space.</summary>
public class PlayerRunState : State<PlayerController>
{
    public override void Execute()
    {
        if (!Owner.Controller.isGrounded)
        {
            Owner.FSM.ChangeState(Owner.FallState);
            return;
        }

        if (Input.GetButtonDown("Jump"))
        {
            Owner.FSM.ChangeState(Owner.JumpState);
            return;
        }

        float h = Input.GetAxisRaw("Horizontal");
        float v = Input.GetAxisRaw("Vertical");

        if (h == 0f && v == 0f)
        {
            Owner.FSM.ChangeState(Owner.IdleState);
            return;
        }

        // Move the character.
        var move = new Vector3(h, 0f, v).normalized * Owner.WalkSpeed;
        Owner.Controller.Move(move * Time.deltaTime);
    }
}

/// <summary>Rising after a jump — transitions to Fall when velocity turns negative.</summary>
public class PlayerJumpState : State<PlayerController>
{
    public override void Enter()
    {
        // Apply initial jump impulse.
        Owner.Velocity = new Vector3(
            Owner.Velocity.x,
            Owner.JumpForce,
            Owner.Velocity.z
        );
    }

    public override void Execute()
    {
        // Apply gravity.
        Owner.Velocity += Physics.gravity * Time.deltaTime;
        Owner.Controller.Move(Owner.Velocity * Time.deltaTime);

        // Transition to fall when we start descending.
        if (Owner.Velocity.y <= 0f)
        {
            Owner.FSM.ChangeState(Owner.FallState);
        }
    }
}

/// <summary>Falling — transitions to Idle on landing.</summary>
public class PlayerFallState : State<PlayerController>
{
    public override void Execute()
    {
        Owner.Velocity += Physics.gravity * Time.deltaTime;
        Owner.Controller.Move(Owner.Velocity * Time.deltaTime);

        if (Owner.Controller.isGrounded)
        {
            Owner.FSM.ChangeState(Owner.IdleState);
        }
    }
}
```

### Benefits

- Each state file is small and focused — easy to read, test, and modify.
- Adding a new state (swim, climb, dash) doesn't touch existing states.
- `Enter`/`Exit` hooks handle setup and cleanup (animations, particles, sounds).
- `PreviousState` enables "return to what I was doing" patterns (e.g., unpause).

---

## Pattern 3: ScriptableObject States (Designer-Modular)

States are ScriptableObject assets. Designers can mix and match states per enemy variant without touching code. Pairs well with the [ScriptableObject Architecture (G14)](G14_scriptable_object_architecture.md).

```csharp
using UnityEngine;

/// <summary>
/// Base class for AI states stored as ScriptableObject assets.
/// Each AI behavior (patrol, chase, flee) is a separate asset.
/// Designers assign states to enemies via the Inspector.
/// </summary>
public abstract class AIStateAsset : ScriptableObject
{
    /// <summary>Called when an AI agent enters this state.</summary>
    public abstract void OnEnter(AIAgent agent);

    /// <summary>Called every frame while the agent is in this state.</summary>
    public abstract void OnExecute(AIAgent agent);

    /// <summary>Called when the agent leaves this state.</summary>
    public abstract void OnExit(AIAgent agent);
}

/// <summary>
/// AI agent that runs ScriptableObject states. Designers configure
/// which states to use and the agent's initial state in the Inspector.
/// </summary>
public class AIAgent : MonoBehaviour
{
    [Header("State Configuration")]
    [SerializeField] private AIStateAsset _initialState;

    // Expose current state for debugging and UI.
    public AIStateAsset CurrentState { get; private set; }

    // Shared agent data — states read and write these.
    [HideInInspector] public UnityEngine.AI.NavMeshAgent NavAgent;
    [HideInInspector] public Transform Target;

    private void Awake()
    {
        NavAgent = GetComponent<UnityEngine.AI.NavMeshAgent>();
    }

    private void Start()
    {
        TransitionTo(_initialState);
    }

    private void Update()
    {
        CurrentState?.OnExecute(this);
    }

    /// <summary>Transition to a new state asset.</summary>
    public void TransitionTo(AIStateAsset newState)
    {
        CurrentState?.OnExit(this);
        CurrentState = newState;
        CurrentState?.OnEnter(this);
    }
}
```

```csharp
using UnityEngine;

/// <summary>
/// Patrol state — the agent follows waypoints until it spots the player.
/// Create instances: Assets → Create → AI States → Patrol
/// </summary>
[CreateAssetMenu(menuName = "AI States/Patrol", fileName = "PatrolState")]
public class PatrolStateAsset : AIStateAsset
{
    [Header("Patrol Settings")]
    public float patrolSpeed = 2f;
    public float detectionRange = 10f;

    // Reference to the chase state to transition to.
    // Drag the ChaseState asset here in the Inspector.
    public AIStateAsset chaseState;

    public override void OnEnter(AIAgent agent)
    {
        agent.NavAgent.speed = patrolSpeed;
        // Pick first waypoint, start patrol animation, etc.
    }

    public override void OnExecute(AIAgent agent)
    {
        // Check for player detection.
        if (agent.Target != null)
        {
            float dist = Vector3.Distance(agent.transform.position, agent.Target.position);
            if (dist < detectionRange)
            {
                agent.TransitionTo(chaseState); // Switch to chase!
                return;
            }
        }

        // Continue patrol logic...
    }

    public override void OnExit(AIAgent agent)
    {
        // Stop patrol animation, etc.
    }
}
```

### Why Designers Love This

- Create a "Timid Goblin" with short detection range and immediate flee state.
- Create a "Brave Goblin" with long detection range and an attack state.
- Same code, different asset configurations — all in the Inspector.

---

## Pattern 4: Animator as a State Machine

Unity's Animator is a visual FSM. You can attach `StateMachineBehaviour` scripts to states to run gameplay logic alongside animations. This is ideal when **animation timing drives gameplay** (attack windows, invincibility frames).

```csharp
using UnityEngine;

/// <summary>
/// A StateMachineBehaviour that runs during the "Attack" state in the Animator.
/// Attach this to the Attack state node in the Animator window.
///
/// StateMachineBehaviour callbacks mirror the animation state lifecycle:
/// OnStateEnter, OnStateUpdate, OnStateExit — called by the Animator.
/// </summary>
public class AttackStateBehaviour : StateMachineBehaviour
{
    [Header("Attack Window")]
    [Tooltip("Normalized time (0-1) when the hitbox activates.")]
    [SerializeField] private float _hitStartTime = 0.3f;

    [Tooltip("Normalized time (0-1) when the hitbox deactivates.")]
    [SerializeField] private float _hitEndTime = 0.6f;

    private bool _hasHit;

    // Called on the first frame of the state.
    public override void OnStateEnter(
        Animator animator,
        AnimatorStateInfo stateInfo,
        int layerIndex)
    {
        _hasHit = false;
        // Disable movement during attack.
        var controller = animator.GetComponent<PlayerController>();
        if (controller != null)
            controller.enabled = false;
    }

    // Called every frame while in this state.
    public override void OnStateUpdate(
        Animator animator,
        AnimatorStateInfo stateInfo,
        int layerIndex)
    {
        // stateInfo.normalizedTime goes from 0 to 1 over the clip's duration.
        // Use it to activate hitboxes at precise animation moments.
        float t = stateInfo.normalizedTime % 1f;

        if (!_hasHit && t >= _hitStartTime && t <= _hitEndTime)
        {
            // Activate the hitbox collider during the attack window.
            var hitbox = animator.GetComponentInChildren<AttackHitbox>();
            hitbox?.Activate();
            _hasHit = true;
        }
    }

    // Called on the last frame of the state.
    public override void OnStateExit(
        Animator animator,
        AnimatorStateInfo stateInfo,
        int layerIndex)
    {
        // Re-enable movement, deactivate hitbox.
        var controller = animator.GetComponent<PlayerController>();
        if (controller != null)
            controller.enabled = true;

        var hitbox = animator.GetComponentInChildren<AttackHitbox>();
        hitbox?.Deactivate();
    }
}
```

### Animator FSM Tips

- **Keep gameplay logic thin** — StateMachineBehaviours are best for animation-timed events (hitboxes, sound cues, particles). Put complex game logic in a code-based FSM.
- **Use Animator parameters for transitions** — `animator.SetTrigger("Attack")` triggers a state change; the Animator handles blend timing.
- **Sub-state machines** — group related states (all combat states, all locomotion states) into sub-state machines in the Animator window for organization.
- **Don't mix paradigms carelessly** — if you use both a code FSM and the Animator FSM, make one the authority. Usually the code FSM tells the Animator what to do, not the other way around.

---

## Hierarchical State Machines (HFSM)

When your state machine grows beyond ~10 states, group related states into parent states. The HFSM pattern lets child states inherit behavior from a parent.

```
Player FSM
├── Grounded (parent)
│   ├── Idle
│   ├── Walk
│   └── Run
├── Airborne (parent)
│   ├── Jump
│   ├── Fall
│   └── WallSlide
└── Combat (parent)
    ├── LightAttack
    ├── HeavyAttack
    └── Block
```

The parent state handles shared logic (gravity for Airborne, movement input for Grounded), and child states add specifics. Libraries like [UnityHFSM](https://github.com/Inspiaaa/UnityHFSM) provide a ready-made implementation with transitions, timers, and coroutine support.

---

## Choosing the Right Pattern

```
How many states?
├── 2-4 → Enum + Switch (Pattern 1)
├── 5-15 → Does animation timing drive logic?
│   ├── Yes → Animator FSM (Pattern 4)
│   └── No  → Do designers need to configure states?
│       ├── Yes → ScriptableObject States (Pattern 3)
│       └── No  → Class-based FSM (Pattern 2)
└── 15+ → Hierarchical FSM or Behavior Tree (see G31)
```

---

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Giant switch statement | Refactor to class-based FSM when any state exceeds ~30 lines |
| Transition logic scattered everywhere | Centralize transitions in the state that decides, or use a transition table |
| Forgetting `Exit()` cleanup | States that start coroutines, enable colliders, or play sounds must clean up on exit |
| Polling state from outside (`if (player.State == ...)`) | Use events from states instead — [G37](G37_event_driven_architecture.md) patterns |
| Animator FSM with heavy gameplay logic | Keep Animator for animation timing; use code FSM for game logic |
| Creating new state instances every transition | Pre-allocate states (see PlayerController example) to avoid GC allocation |

---

## See Also

- [G7 Animation System](G7_animation_system.md) — Animator controllers, blend trees, animation layers
- [G31 Behavior Trees](G31_behavior_trees.md) — Alternative for complex AI with parallel and conditional behaviors
- [G37 Event-Driven Architecture](G37_event_driven_architecture.md) — Decouple state changes from responses
- [G14 ScriptableObject Architecture](G14_scriptable_object_architecture.md) — Modular data-driven design
- [UnityHFSM library](https://github.com/Inspiaaa/UnityHFSM) — Open-source hierarchical FSM for Unity
- [Unity Manual: StateMachineBehaviour](https://docs.unity3d.com/Manual/StateMachineBehaviours.html)
