# AI & Behavior Trees

> **Category:** guide · **Engine:** Unreal Engine 5 · **Related:** [G1 Gameplay Framework](G1_gameplay_framework.md), [G2 Enhanced Input](G2_enhanced_input.md), [G6 Physics & Collision](G6_physics_and_collision.md)

Unreal Engine's AI framework centers on **Behavior Trees** for decision-making, **Blackboards** for shared memory, and **AI Controllers** for possession. This guide covers the production-ready Behavior Tree system (available since UE4, fully supported in UE 5.0–5.5+) and introduces **StateTree** as the newer alternative for data-driven workflows.

---

## Architecture Overview

```
┌──────────────┐     possesses     ┌────────────┐
│ AI Controller │ ───────────────► │   Pawn     │
└──────┬───────┘                   └────────────┘
       │ runs
       ▼
┌──────────────┐     reads/writes  ┌────────────┐
│ Behavior Tree │ ◄──────────────► │ Blackboard │
└──────────────┘                   └────────────┘
       │
       ├── Composite (Selector / Sequence / Parallel)
       │      ├── Decorator (condition gate)
       │      ├── Service  (periodic update)
       │      └── Task     (action leaf node)
       └── ...
```

### Why Behavior Trees instead of FSMs?

Finite State Machines become unwieldy when states multiply — every new
state potentially needs transitions to/from every other state (O(n²)
connections). Behavior Trees decouple *priority* from *state*: a
higher-priority branch interrupts a lower one automatically. This makes
it easier to add new behaviors without touching existing logic.

---

## Setting Up the AI Stack

### 1. Create a Blackboard

The Blackboard is a key-value store shared between the AI Controller, Behavior Tree, and perception system.

**Content Browser → Add → Artificial Intelligence → Blackboard**

Common key types:

| Key Name | Type | Purpose |
|---|---|---|
| `TargetActor` | Object (AActor*) | Current combat/pursuit target |
| `PatrolLocation` | Vector | Next waypoint to walk toward |
| `HasLineOfSight` | Bool | Whether the AI can see its target |
| `HealthPercent` | Float | Used by decorators to switch behavior at low HP |

### 2. Create a Behavior Tree

**Content Browser → Add → Artificial Intelligence → Behavior Tree**

Assign the Blackboard asset in the Behavior Tree's **Blackboard Asset** property.

### 3. Create an AI Controller

```cpp
// AIGuardController.h
#pragma once

#include "CoreMinimal.h"
#include "AIController.h"
#include "AIGuardController.generated.h"

/// WHY a custom AI Controller instead of using AAIController directly:
///   - We need to run a specific Behavior Tree and Blackboard on possession
///   - Custom controllers let us hook into perception, team affiliation, etc.
UCLASS()
class YOURGAME_API AAIGuardController : public AAIController
{
    GENERATED_BODY()

public:
    AAIGuardController();

protected:
    virtual void OnPossess(APawn* InPawn) override;

    /// The Behavior Tree to run when this controller possesses a pawn.
    UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "AI")
    UBehaviorTree* BehaviorTreeAsset;

    /// The Blackboard data asset.
    UPROPERTY(EditDefaultsOnly, BlueprintReadWrite, Category = "AI")
    UBlackboardData* BlackboardAsset;
};
```

```cpp
// AIGuardController.cpp
#include "AIGuardController.h"
#include "BehaviorTree/BehaviorTree.h"
#include "BehaviorTree/BlackboardComponent.h"

AAIGuardController::AAIGuardController()
{
    // Perception component can be added here if using AI Perception
}

void AAIGuardController::OnPossess(APawn* InPawn)
{
    Super::OnPossess(InPawn);

    if (BehaviorTreeAsset && BlackboardAsset)
    {
        // Initialize the Blackboard, then start the Behavior Tree.
        // WHY we initialize Blackboard first:
        //   The BT reads from the Blackboard immediately on its first tick.
        //   If the BB isn't ready, decorators will fail their initial check.
        UseBlackboard(BlackboardAsset, Blackboard);
        RunBehaviorTree(BehaviorTreeAsset);
    }
}
```

---

## Node Types

### Tasks (Leaf Nodes — Execute Actions)

Tasks are the only nodes that *do things*. They return `Succeeded`, `Failed`, or `InProgress`.

```cpp
// BTTask_FindRandomPatrolPoint.h
#pragma once

#include "CoreMinimal.h"
#include "BehaviorTree/BTTaskNode.h"
#include "BTTask_FindRandomPatrolPoint.generated.h"

/// Picks a random navigable point within SearchRadius of the AI
/// and writes it to the Blackboard.
/// WHY we use NavigationSystem instead of raw random positions:
///   - A random world position might be inside a wall or off the NavMesh.
///   - GetRandomPointInNavigableRadius guarantees the result is reachable.
UCLASS()
class YOURGAME_API UBTTask_FindRandomPatrolPoint : public UBTTaskNode
{
    GENERATED_BODY()

public:
    UBTTask_FindRandomPatrolPoint();

protected:
    virtual EBTNodeResult::Type ExecuteTask(
        UBehaviorTreeComponent& OwnerComp,
        uint8* NodeMemory) override;

    UPROPERTY(EditAnywhere, Category = "Blackboard")
    FBlackboardKeySelector PatrolLocationKey;

    UPROPERTY(EditAnywhere, Category = "Settings")
    float SearchRadius = 1500.0f;
};
```

```cpp
// BTTask_FindRandomPatrolPoint.cpp
#include "BTTask_FindRandomPatrolPoint.h"
#include "AIController.h"
#include "NavigationSystem.h"
#include "BehaviorTree/BlackboardComponent.h"

UBTTask_FindRandomPatrolPoint::UBTTask_FindRandomPatrolPoint()
{
    NodeName = "Find Random Patrol Point";
}

EBTNodeResult::Type UBTTask_FindRandomPatrolPoint::ExecuteTask(
    UBehaviorTreeComponent& OwnerComp, uint8* NodeMemory)
{
    AAIController* AICon = OwnerComp.GetAIOwner();
    if (!AICon) return EBTNodeResult::Failed;

    APawn* Pawn = AICon->GetPawn();
    if (!Pawn) return EBTNodeResult::Failed;

    UNavigationSystemV1* NavSys =
        FNavigationSystem::GetCurrent<UNavigationSystemV1>(GetWorld());
    FNavLocation RandomLoc;

    if (NavSys && NavSys->GetRandomPointInNavigableRadius(
            Pawn->GetActorLocation(), SearchRadius, RandomLoc))
    {
        UBlackboardComponent* BB = OwnerComp.GetBlackboardComponent();
        if (BB)
        {
            BB->SetValueAsVector(
                PatrolLocationKey.SelectedKeyName, RandomLoc.Location);
            return EBTNodeResult::Succeeded;
        }
    }
    return EBTNodeResult::Failed;
}
```

### Decorators (Conditional Gates)

Decorators wrap a node and control whether it can execute. They are evaluated *before* the child runs and can abort the subtree if conditions change mid-execution.

```cpp
// BTDecorator_IsLowHealth.h
#pragma once

#include "CoreMinimal.h"
#include "BehaviorTree/BTDecorator.h"
#include "BTDecorator_IsLowHealth.generated.h"

/// Gates a subtree on the AI's health being below a threshold.
/// WHY a Decorator instead of checking health inside a Task:
///   - Decorators support Observer Aborts: if health drops mid-patrol,
///     the tree automatically interrupts patrol and enters the flee branch.
///   - This is the key advantage over FSMs — priority-based preemption.
UCLASS()
class YOURGAME_API UBTDecorator_IsLowHealth : public UBTDecorator
{
    GENERATED_BODY()

public:
    UBTDecorator_IsLowHealth();

protected:
    virtual bool CalculateRawConditionValue(
        UBehaviorTreeComponent& OwnerComp,
        uint8* NodeMemory) const override;

    UPROPERTY(EditAnywhere, Category = "AI")
    float HealthThreshold = 30.0f;

    UPROPERTY(EditAnywhere, Category = "AI")
    FBlackboardKeySelector HealthKey;
};
```

```cpp
// BTDecorator_IsLowHealth.cpp
#include "BTDecorator_IsLowHealth.h"
#include "BehaviorTree/BlackboardComponent.h"

UBTDecorator_IsLowHealth::UBTDecorator_IsLowHealth()
{
    NodeName = "Is Low Health";
    // WHY we set bNotifyBecomeRelevant:
    //   This enables Observer Aborts — the decorator re-evaluates when
    //   the Blackboard key changes, not just when the node is first reached.
    bNotifyBecomeRelevant = true;
}

bool UBTDecorator_IsLowHealth::CalculateRawConditionValue(
    UBehaviorTreeComponent& OwnerComp, uint8* NodeMemory) const
{
    UBlackboardComponent* BB = OwnerComp.GetBlackboardComponent();
    if (!BB) return false;

    float CurrentHealth = BB->GetValueAsFloat(HealthKey.SelectedKeyName);
    return CurrentHealth <= HealthThreshold;
}
```

### Services (Periodic Updates)

Services tick at a configurable interval while their parent composite is active. Use them to update Blackboard keys.

```cpp
// BTService_UpdateCombatTarget.h
#pragma once

#include "CoreMinimal.h"
#include "BehaviorTree/BTService.h"
#include "BTService_UpdateCombatTarget.generated.h"

/// Periodically scans for the nearest enemy and writes it to the Blackboard.
/// WHY a Service instead of a Task:
///   - Services run continuously in the background at a set interval.
///   - Tasks run once and block until they finish.
///   - Target acquisition needs to run in parallel with other behaviors.
UCLASS()
class YOURGAME_API UBTService_UpdateCombatTarget : public UBTService
{
    GENERATED_BODY()

public:
    UBTService_UpdateCombatTarget();

protected:
    virtual void TickNode(UBehaviorTreeComponent& OwnerComp,
                          uint8* NodeMemory, float DeltaSeconds) override;

    UPROPERTY(EditAnywhere, Category = "Blackboard")
    FBlackboardKeySelector TargetActorKey;

    UPROPERTY(EditAnywhere, Category = "Settings")
    float DetectionRadius = 2000.0f;
};
```

```cpp
// BTService_UpdateCombatTarget.cpp
#include "BTService_UpdateCombatTarget.h"
#include "AIController.h"
#include "BehaviorTree/BlackboardComponent.h"
#include "Kismet/GameplayStatics.h"

UBTService_UpdateCombatTarget::UBTService_UpdateCombatTarget()
{
    NodeName = "Update Combat Target";
    // Tick every 0.5 seconds — frequent enough for responsive AI,
    // cheap enough to not impact performance
    Interval = 0.5f;
    RandomDeviation = 0.1f; // Stagger ticks across multiple AI
}

void UBTService_UpdateCombatTarget::TickNode(
    UBehaviorTreeComponent& OwnerComp,
    uint8* NodeMemory, float DeltaSeconds)
{
    Super::TickNode(OwnerComp, NodeMemory, DeltaSeconds);

    AAIController* AICon = OwnerComp.GetAIOwner();
    if (!AICon) return;

    APawn* Pawn = AICon->GetPawn();
    if (!Pawn) return;

    // Find nearest actor tagged "Player"
    TArray<AActor*> Players;
    UGameplayStatics::GetAllActorsWithTag(GetWorld(), "Player", Players);

    AActor* Closest = nullptr;
    float BestDist = DetectionRadius;

    for (AActor* P : Players)
    {
        float Dist = FVector::Dist(Pawn->GetActorLocation(),
                                    P->GetActorLocation());
        if (Dist < BestDist)
        {
            BestDist = Dist;
            Closest = P;
        }
    }

    UBlackboardComponent* BB = OwnerComp.GetBlackboardComponent();
    if (BB)
    {
        BB->SetValueAsObject(TargetActorKey.SelectedKeyName, Closest);
    }
}
```

---

## Composite Nodes

| Composite | Behavior | Use Case |
|---|---|---|
| **Selector** | Tries children left→right, succeeds on first success | Fallback logic: "try attack, else flee, else idle" |
| **Sequence** | Tries children left→right, fails on first failure | Step-by-step: "move to target → aim → shoot" |
| **Simple Parallel** | Runs a main task + background task simultaneously | "Walk to waypoint" while "play alert animation" |

### Observer Aborts

Decorators can set **Observer Aborts** to interrupt running nodes:

- **None** — only checked when the node is first entered
- **Self** — aborts this branch if the condition becomes false
- **Lower Priority** — aborts lower-priority siblings if condition becomes true
- **Both** — combines Self + Lower Priority

This is the mechanism that makes BTs reactive without polling every frame.

---

## Environment Query System (EQS)

EQS generates and scores spatial queries — "find the best cover position" or "pick the flanking angle with the best line of sight."

### Quick Setup (Blueprint)

1. **Content Browser → Add → AI → Environment Query**
2. Add a **Generator** (e.g., Points: Grid, Points: Circle)
3. Add **Tests** to score each point (Distance, Trace, Dot, Pathfinding)
4. Run the query from a BT Task using `Run EQS Query`

### Running EQS from C++

```cpp
// In a BTTaskNode::ExecuteTask:
UEnvQuery* QueryTemplate = /* loaded from asset */;
FEnvQueryRequest QueryRequest(QueryTemplate, OwnerComp.GetAIOwner()->GetPawn());

QueryRequest.Execute(EEnvQueryRunMode::SingleBestItem,
    FQueryFinishedSignature::CreateLambda(
        [this, &OwnerComp](TSharedPtr<FEnvQueryResult> Result)
    {
        if (Result->IsSuccessful())
        {
            FVector BestLocation = Result->GetItemAsLocation(0);
            UBlackboardComponent* BB = OwnerComp.GetBlackboardComponent();
            BB->SetValueAsVector("CoverPosition", BestLocation);
        }
    }));

// Return InProgress — the query is async
return EBTNodeResult::InProgress;
```

---

## StateTree (UE 5.0+ — Newer Alternative)

StateTree is a data-driven state machine that supports utility-based selection and integrates with Mass Entity for thousands of AI agents.

### When to Use StateTree vs. Behavior Tree

| Criteria | Behavior Tree | StateTree |
|---|---|---|
| Maturity | Production-proven since UE4 | Stable since UE 5.3, rapidly improving |
| Complexity | Best for complex, deeply nested priority logic | Best for flat, data-driven state logic |
| Mass Entity / crowds | Not designed for ECS workloads | Native Mass Entity integration |
| Tooling | Rich editor with EQS visualization | Compact graph view, utility scoring (UE 5.5+) |
| Learning curve | Well-documented, huge community | Fewer tutorials, API still evolving |

**Recommendation:** Use Behavior Trees for boss AI, companion AI, and complex multi-step behaviors. Use StateTree for ambient NPCs, crowd AI, and systems where data-binding between states matters more than deep priority logic.

---

## AI Perception System

The AI Perception system provides sight, hearing, damage, and custom senses that feed into the Blackboard:

```cpp
// In your AI Controller constructor:
UAIPerceptionComponent* PerceptionComp = CreateDefaultSubobject<UAIPerceptionComponent>("Perception");
SetPerceptionComponent(*PerceptionComp);

// Configure sight
UAISenseConfig_Sight* SightConfig = NewObject<UAISenseConfig_Sight>();
SightConfig->SightRadius = 3000.0f;
SightConfig->LoseSightRadius = 3500.0f;
SightConfig->PeripheralVisionAngleDegrees = 60.0f;
SightConfig->SetMaxAge(5.0f); // Forget targets after 5 seconds out of sight
PerceptionComp->ConfigureSense(*SightConfig);
PerceptionComp->SetDominantSense(UAISense_Sight::StaticClass());
```

---

## Debugging

### Visual Logger

**Window → Developer Tools → Visual Logger** records AI decisions frame-by-frame.

### Gameplay Debugger

Press **'** (apostrophe) in PIE to open the Gameplay Debugger. Navigate categories:

| Key | Category |
|---|---|
| 1 | NavMesh |
| 2 | Behavior Tree (live node execution) |
| 3 | EQS (scored query results) |
| 4 | Perception (sight cones, heard sounds) |

### BT Editor Debugging

With PIE running, select an AI pawn — the Behavior Tree editor highlights the active path in green and shows Blackboard values in real time.

---

## Performance Tips

- **Stagger service ticks** using `RandomDeviation` so all AI don't tick the same frame
- **Use Observer Aborts** instead of polling decorators — events are cheaper than checks
- **Limit EQS item counts** — 100 grid points is usually enough; 1000+ causes frame spikes
- **Pool AI Controllers** for spawn-heavy games (e.g., wave shooters)
- **Profile with `stat AI`** and `stat Game` console commands
