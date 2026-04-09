# Motion Matching Animation System

> **Category:** guide · **Engine:** Unreal Engine 5.4+ · **Related:** [G4 Animation System](G4_animation_system.md), [G2 Enhanced Input](G2_enhanced_input.md), [G1 Gameplay Framework](G1_gameplay_framework.md)

Motion Matching replaces traditional animation state machines with a database-driven approach: instead of manually wiring transitions between Idle → Walk → Run → Jump, the system searches a database of animation poses every tick and picks the one that best matches the character's current state and predicted trajectory. The result is fluid, responsive locomotion with far less manual graph authoring. This guide covers the PoseSearch plugin, database setup, schema channels, trajectory prediction, and integration patterns.

---

## Why Motion Matching Over State Machines

State machines work well for small animation sets, but they scale poorly:

- **Combinatorial explosion** — every new movement type (crouch-walk, injured-limp, slope-slide) multiplies the number of states and transitions
- **Brittle transitions** — hand-tuned blend times feel wrong when gameplay timing shifts
- **Maintenance burden** — changing one animation can break transitions across the graph

Motion Matching solves this by treating animation selection as a **search problem**: given where the character is now and where it's going, find the best matching frame in a large animation database. Adding a new movement style is as simple as adding clips to the database — no rewiring required.

**Trade-off:** Motion Matching requires more animation data (large mocap sets) and has higher runtime CPU cost than a simple state machine. It's best suited for AAA-quality character locomotion, not simple 2D platformers.

---

## Plugin Setup

Motion Matching lives in the **PoseSearch** plugin, which ships with Unreal Engine but is not enabled by default.

1. **Edit → Plugins → Search "Pose Search"** → Enable the `PoseSearch` plugin
2. Also enable `CharacterTrajectoryComponent` (usually auto-enabled as a dependency)
3. Restart the editor

> **Version note:** Motion Matching was experimental in UE 5.3, became production-ready in UE 5.4, and continues to receive improvements in 5.5–5.7. This guide targets UE 5.4+ APIs.

---

## Core Concepts

```
┌─────────────────┐     ┌──────────────┐     ┌──────────────────┐
│  Pose Search    │     │  Trajectory  │     │  Animation       │
│  Database       │────▶│  + Pose      │────▶│  Blueprint Node  │
│  (animations)   │     │  Query       │     │  (Motion Match)  │
└─────────────────┘     └──────────────┘     └──────────────────┘
```

### Pose Search Database

A `UPoseSearchDatabase` asset containing one or more animation sequences. At cook time, the engine pre-processes every frame of every animation into a **feature vector** — a compact numerical representation of the character's pose and trajectory at that frame.

### Schema and Channels

A `UPoseSearchSchema` defines **what** gets encoded into the feature vector. It contains **channels**, each representing a dimension of comparison:

- **Pose channels** — bone positions/velocities (e.g., feet, hands, pelvis). These capture "what the character looks like right now."
- **Trajectory channels** — predicted future positions/facings at sample points (e.g., +0.1s, +0.3s, +0.5s). These capture "where the character is going."

Each channel has a **weight** that controls its influence on the search:

```
// Conceptual weighting — higher = more influence on pose selection
Pose Weight:       1.0   // How well the body matches
Trajectory Weight: 3.0   // How well the future movement matches
                         // Trajectory is typically weighted higher because
                         // responsive movement direction changes matter more
                         // than exact pose matching in most locomotion systems.
```

### Feature Vector

At runtime, the system builds a **query feature vector** from the character's current state (pose + trajectory prediction) and compares it against every frame in the database using a distance metric. The frame with the smallest distance wins.

---

## Step-by-Step Setup

### 1. Create the Schema

**Content Browser → Right-click → Animation → Pose Search Schema**

Add channels to define what the system compares:

```
Schema: "LocomotionSchema"
├── Pose Channel
│   ├── Sampled Bones: pelvis, left_foot, right_foot
│   ├── Sample Times: [0.0]           // Current frame only
│   └── Weight: 1.0
├── Trajectory Channel (Position)
│   ├── Sample Times: [-0.3, 0.0, 0.3, 0.5, 0.8]  // Past + future
│   └── Weight: 3.0
└── Trajectory Channel (Facing)
    ├── Sample Times: [0.0, 0.3, 0.5]
    └── Weight: 2.0
```

> **Tip:** Start with feet + pelvis for pose and 3–5 trajectory samples. Add more bones (hands, head) only if your game needs upper-body matching (e.g., combat stances while moving).

### 2. Create the Database

**Content Browser → Right-click → Animation → Pose Search Database**

- Assign your Schema
- Add animation sequences (locomotion mocap: walks, jogs, runs, starts, stops, turns, pivots)
- Click **Build** to pre-process the feature vectors

```
Database: "LocomotionDB"
├── Schema: LocomotionSchema
├── Animations:
│   ├── Walk_Fwd, Walk_Bwd, Walk_Left, Walk_Right
│   ├── Jog_Fwd, Jog_Bwd, Jog_Left, Jog_Right
│   ├── Run_Fwd, Run_Curves_L, Run_Curves_R
│   ├── Start_Walk_Fwd, Stop_Walk_Fwd
│   ├── Pivot_180_L, Pivot_180_R
│   └── Idle_Variants (3-4 clips)
└── [Build] → Pre-processes ~5000 frames into feature vectors
```

### 3. Add the Trajectory Component

On your Character Blueprint, add a **Character Trajectory Component**. This component:

- Predicts future positions based on current velocity and input direction
- Records a short history of past movement
- Provides the trajectory data that feeds into the Motion Matching query

```cpp
// In your Character class header (C++)
UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "Animation")
UCharacterTrajectoryComponent* TrajectoryComponent;

// In the constructor
TrajectoryComponent = CreateDefaultSubobject<UCharacterTrajectoryComponent>(
    TEXT("TrajectoryComponent"));
```

### 4. Wire Up the Animation Blueprint

In your Animation Blueprint:

1. Add a **Motion Matching** node in the Anim Graph
2. Connect the **Database** pin to your `LocomotionDB` asset
3. The **Trajectory** pin automatically reads from the Character Trajectory Component on the owning character

```
AnimGraph:
  ┌─────────────────┐
  │ Motion Matching  │
  │                  │
  │ Database: ────── │── LocomotionDB
  │ Trajectory: ──── │── (auto from CharacterTrajectoryComponent)
  │                  │
  │ Output Pose ──── │──▶ [Final Animation Pose]
  └─────────────────┘
```

> **No state machine needed** — the Motion Matching node handles locomotion selection entirely. You may still use a state machine at a higher level for non-locomotion states (e.g., montages for attacks, hit reactions, death).

---

## Tuning and Debugging

### Pose Search Debugger

Enable the Pose Search debug draw in the editor:

**Animation Blueprint → Motion Matching node → Details → Debug**

This visualizes:
- The query trajectory (predicted path, shown in green)
- The winning animation's trajectory (shown in blue)
- Bone positions being compared
- The distance score of the current match

### Common Tuning Parameters

| Parameter | Effect | Start Value |
|-----------|--------|-------------|
| `DatabaseSearchThrottle` | How many frames between full database searches | 1–4 (1 = every frame, most responsive) |
| Pose channel weight | Influence of body pose similarity | 1.0 |
| Trajectory position weight | Influence of future position match | 2.0–4.0 |
| Trajectory facing weight | Influence of future facing direction | 1.5–3.0 |
| Trajectory sample times | How far into the future to predict | [-0.3, 0.0, 0.3, 0.5, 0.8] |

### Procedural Fixup

When your animation database has gaps (e.g., no animation for a specific turn angle), Motion Matching picks the closest match — which may have the character facing slightly wrong. **Procedural fixup** rotates the root bone to compensate:

- **Stride Warping** — adjusts foot placement to match actual movement speed
- **Orientation Warping** — rotates the character's lower body to align with movement direction
- **Distance Matching** — ensures start/stop animations cover the correct distance

These are configured as post-process nodes in the Anim Graph, downstream of the Motion Matching output.

---

## C++ Integration

### Custom Trajectory Provider

For games with non-standard movement (flying, swimming, vehicles), you can provide custom trajectory data:

```cpp
// Custom trajectory component that provides swim-specific prediction
UCLASS()
class USwimTrajectoryComponent : public UCharacterTrajectoryComponent
{
    GENERATED_BODY()

public:
    // Override to provide water-physics-aware trajectory prediction.
    // The base class predicts based on ground movement; swimming
    // has different acceleration/drag characteristics.
    virtual void UpdateTrajectory(float DeltaTime) override
    {
        Super::UpdateTrajectory(DeltaTime);

        // Modify trajectory samples to account for water drag
        // and buoyancy-based vertical movement
        for (auto& Sample : GetTrajectoryData().Samples)
        {
            // Apply water resistance factor to predicted positions
            Sample.Position *= WaterDragMultiplier;
        }
    }

private:
    UPROPERTY(EditAnywhere, Category = "Swimming")
    float WaterDragMultiplier = 0.7f;
};
```

### Gameplay Tags for Context Switching

Use Gameplay Tags to switch databases based on game state:

```cpp
// In Animation Blueprint (native event)
void UMyAnimInstance::NativeUpdateAnimation(float DeltaSeconds)
{
    Super::NativeUpdateAnimation(DeltaSeconds);

    // Switch database based on character state.
    // Motion Matching supports multiple databases — the system
    // searches the active one. Switching databases is how you
    // handle different movement modes (normal, injured, carrying).
    if (bIsInjured)
    {
        ActiveDatabase = InjuredLocomotionDB;
    }
    else if (bIsCarryingHeavy)
    {
        ActiveDatabase = HeavyCarryDB;
    }
    else
    {
        ActiveDatabase = DefaultLocomotionDB;
    }
}
```

---

## Performance Considerations

Motion Matching's cost comes from the database search — comparing the query vector against thousands of frames. Mitigation strategies:

- **Throttle searches** — search every 2–4 frames instead of every frame; the current animation continues playing smoothly between searches
- **Use smaller databases** — split locomotion into context-specific databases (combat, exploration, injured) instead of one giant database
- **Prune redundant frames** — the database build process can skip frames that are nearly identical to neighbors
- **LOD animation** — distant characters use cheaper blend trees; only nearby characters use Motion Matching

| Entity Count | Recommended Approach |
|-------------|---------------------|
| 1–10 NPCs | Full Motion Matching, search every frame |
| 10–50 NPCs | Motion Matching with 2–4 frame throttle |
| 50–200 NPCs | Motion Matching for nearby, simple blend trees for distant |
| 200+ NPCs | Consider Mass Entity + simple animation; Motion Matching for hero characters only |

---

## Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| Character slides or moonwalks | Increase trajectory position weight; ensure root motion is enabled on animations |
| Jittery switching between animations | Reduce search frequency; increase pose weight to favor smoother transitions |
| Missing trajectory pin in AnimBP | Ensure `CharacterTrajectoryComponent` is added to the Character BP |
| Database build is very slow | Normal for large sets; only rebuild when animations change |
| Character doesn't respond to input changes | Check that trajectory component's prediction speed matches your movement component's acceleration |

---

## Next Steps

- **[G4 Animation System](G4_animation_system.md)** — Anim Blueprints, montages, and state machines for non-locomotion animations
- **[G1 Gameplay Framework](G1_gameplay_framework.md)** — Character/Pawn setup for the movement component
- **[G13 Gameplay Ability System](G13_gameplay_ability_system.md)** — Trigger ability animations alongside Motion Matching locomotion
- Epic's [Motion Matching documentation](https://dev.epicgames.com/documentation/en-us/unreal-engine/motion-matching-in-unreal-engine) for the latest API reference
