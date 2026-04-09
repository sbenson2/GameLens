# G20 — Performance Optimization & Memory Management in UE5

> **Category:** guide · **Engine:** Unreal Engine 5.4–5.7 · **Related:** [G9 Rendering — Nanite & Lumen](G9_rendering_nanite_lumen.md) · [G10 Debugging & Profiling](G10_debugging_profiling.md) · [Architecture Overview](../architecture/E1_architecture_overview.md) · [Unreal Rules](../unreal-arch-rules.md)

Performance optimization in Unreal Engine is a structured process: **measure** the bottleneck, **identify** the system causing it, then **fix** only what the data tells you to fix. This guide covers the full profiling-to-optimization workflow: stat commands, Unreal Insights, CPU/GPU budgets, memory management patterns (GC, smart pointers, pooling), tick optimization, and draw call reduction.

---

## The Golden Rule: Profile Before You Optimize

Guessing at performance problems wastes time and often makes things worse. The workflow is:

1. **Reproduce** the performance issue (specific map, player count, scenario)
2. **Measure** with stat commands to identify the bottleneck category (CPU Game, CPU Draw, GPU)
3. **Deep-dive** with Unreal Insights or GPU Visualizer for function-level analysis
4. **Fix** the identified bottleneck
5. **Verify** the fix improved the metric you measured in step 2

---

## Stat Commands — Your First-Line Diagnostic

Open the console (`~` key) and type these commands during gameplay.

### Essential Commands

| Command | What It Shows | When to Use |
|---------|---------------|-------------|
| `stat unit` | Frame time split: Game (CPU gameplay), Draw (CPU render thread), GPU, RHIT | **Always start here** — tells you which thread is the bottleneck |
| `stat fps` | Current FPS counter | Quick sanity check |
| `stat unitgraph` | `stat unit` as a real-time graph | Spotting frame time spikes over time |
| `stat game` | Game thread breakdown: AI, physics, tick, etc. | When `stat unit` shows Game thread is slow |
| `stat gpu` | GPU time by render pass: shadows, base pass, Lumen, etc. | When `stat unit` shows GPU is the bottleneck |
| `stat memory` | Memory usage overview | Checking total memory budget |
| `stat streaming` | Texture streaming stats | When you see blurry textures or memory pressure |
| `stat scenerendering` | Draw calls, mesh draw commands, triangles | When draw calls are suspected |
| `stat particles` | Particle system evaluation cost | When VFX are heavy |

### Reading `stat unit`

```
Frame: 16.67 ms   ← total frame time (target for 60 FPS)
Game:   8.20 ms   ← CPU gameplay thread (tick, physics, AI, Blueprints)
Draw:   5.10 ms   ← CPU render thread (scene traversal, draw call submission)
GPU:   12.40 ms   ← GPU rendering time
RHIT:   1.30 ms   ← render hardware interface thread
```

**The bottleneck is the largest number.** In this example, the GPU at 12.4ms is limiting the frame to ~80 FPS even though the CPU could handle more. Optimizing CPU tick here would have zero impact on FPS.

---

## Unreal Insights — Deep Profiling

Unreal Insights is UE5's standalone profiling tool for function-level CPU and GPU analysis.

### Capturing a Trace

```
# In-game console: start recording
trace.start default,cpu,gpu,frame,memory

# Play through the problem area...

# Stop recording
trace.stop
```

Traces are saved to `[Project]/Saved/TracingProfiles/`. Open them with the **Unreal Insights** application (ships with the engine at `Engine/Binaries/[Platform]/UnrealInsights`).

### What to Look For

- **Timing View:** zoom into frame spikes and see exactly which functions took the most time
- **CPU Thread View:** identify which thread is stalling — Game Thread, Render Thread, or async tasks
- **Memory View:** track allocations over time, spot leaks (steadily climbing memory)
- **Counters:** custom stat counters you've added to your code

### Adding Custom Stat Counters

```cpp
// Declare a stat group in your module's header
// WHY: custom stats let you measure YOUR systems, not just engine systems
DECLARE_STATS_GROUP(TEXT("MyCombat"), STATGROUP_MyCombat, STATCAT_Advanced);
DECLARE_CYCLE_STAT(TEXT("DamageCalculation"), STAT_DamageCalc, STATGROUP_MyCombat);

void UCombatComponent::CalculateDamage()
{
    // SCOPE_CYCLE_COUNTER records the time spent in this function
    // It shows up in Unreal Insights and in 'stat MyCombat' console command
    SCOPE_CYCLE_COUNTER(STAT_DamageCalc);

    // ... expensive damage logic ...
}
```

---

## CPU Optimization

### Tick Optimization

The Tick function is the most common source of wasted CPU time. Every actor with `PrimaryActorTick.bCanEverTick = true` runs every frame.

```cpp
// BAD: Constructor enables tick by default, does expensive work every frame
AMyActor::AMyActor()
{
    PrimaryActorTick.bCanEverTick = true;
}

void AMyActor::Tick(float DeltaTime)
{
    Super::Tick(DeltaTime);
    // This line trace runs 60 times per second for EVERY instance — expensive!
    FHitResult Hit;
    GetWorld()->LineTraceSingleByChannel(Hit, Start, End, ECC_Visibility);
}
```

```cpp
// GOOD: Disable tick, use timers for periodic work
AMyActor::AMyActor()
{
    // WHY: disabling tick saves the per-frame overhead entirely
    // Use timers or events for work that doesn't need every-frame updates
    PrimaryActorTick.bCanEverTick = false;
}

void AMyActor::BeginPlay()
{
    Super::BeginPlay();

    // Run the expensive check every 0.5 seconds instead of every frame
    // WHY: a line trace 2x/sec is 30x cheaper than 60x/sec, and for most
    // gameplay detection (enemies in range, etc.) the delay is imperceptible
    GetWorldTimerManager().SetTimer(
        DetectionTimerHandle,
        this,
        &AMyActor::PerformDetectionCheck,
        0.5f,   // interval in seconds
        true    // looping
    );
}

void AMyActor::PerformDetectionCheck()
{
    FHitResult Hit;
    GetWorld()->LineTraceSingleByChannel(Hit, Start, End, ECC_Visibility);
    // ... handle result ...
}
```

### Tick Rate Reduction for Distant Actors

```cpp
// WHY: actors far from the player don't need full-rate updates
// Significance Manager can automate this, but manual control is simpler for small projects
void AMyAICharacter::UpdateTickRate(float DistanceToPlayer)
{
    if (DistanceToPlayer > 5000.f)
    {
        // Far away: tick every 5 frames
        PrimaryActorTick.TickInterval = 0.083f;  // ~12 Hz at 60 FPS
    }
    else if (DistanceToPlayer > 2000.f)
    {
        PrimaryActorTick.TickInterval = 0.033f;  // ~30 Hz
    }
    else
    {
        PrimaryActorTick.TickInterval = 0.f;     // full rate
    }
}
```

---

## Memory Management

UE5 has **two memory systems** running in parallel: the UObject garbage collector (for anything deriving from `UObject`) and standard C++ memory management (for everything else).

### UObject Garbage Collection

The GC uses **mark-and-sweep reachability analysis**: it walks all `UPROPERTY()` references starting from root objects (the world, game instance, etc.), marks everything reachable, then destroys unmarked objects.

**Key rules:**

```cpp
// RULE 1: UPROPERTY() is how the GC knows about your references
// WHY: raw UObject* without UPROPERTY can be collected out from under you
UPROPERTY()
UMyComponent* TrackedComponent;  // ✅ GC tracks this

UMyComponent* DanglingPointer;   // ❌ GC doesn't see this — will crash

// RULE 2: Use TWeakObjectPtr for non-owning references
// WHY: becomes null if the object is destroyed, instead of dangling
TWeakObjectPtr<AActor> CachedTarget;

void AMyActor::UpdateTarget()
{
    if (CachedTarget.IsValid())
    {
        // Safe to use — we know the object still exists
        float Dist = FVector::Dist(GetActorLocation(), CachedTarget->GetActorLocation());
    }
    else
    {
        // Object was destroyed — clear our reference
        CachedTarget = nullptr;
    }
}

// RULE 3: Avoid creating/destroying UObjects rapidly
// WHY: frequent allocation triggers GC pauses (hitches)
// Use object pooling instead (see below)
```

### Smart Pointer Guide

| Type | Use For | GC Tracked? | Nulls on Destroy? |
|------|---------|-------------|-------------------|
| `UPROPERTY() UObject*` | Owning UObject references | ✅ Yes | No (dangling if not cleared) |
| `TWeakObjectPtr<T>` | Non-owning UObject references | ✅ Yes | ✅ Yes |
| `TStrongObjectPtr<T>` | Preventing GC on non-UPROPERTY UObjects | ✅ Yes | No |
| `TSharedPtr<T>` | Non-UObject heap data (shared ownership) | ❌ No | N/A (ref-counted) |
| `TUniquePtr<T>` | Non-UObject heap data (sole ownership) | ❌ No | N/A |

> **Critical:** Never use `TSharedPtr` for UObjects. The UObject GC and shared_ptr reference counting are separate systems and will fight over object lifetime.

### Object Pooling

```cpp
// WHY: pooling avoids the cost of spawning/destroying actors at runtime
// Projectiles, VFX, enemies, pickups — anything spawned frequently is a candidate

UCLASS()
class UActorPool : public UObject
{
    GENERATED_BODY()

public:
    // Pre-allocate pool during level load, not during gameplay
    void InitializePool(UWorld* World, TSubclassOf<AActor> ActorClass, int32 PoolSize)
    {
        for (int32 i = 0; i < PoolSize; ++i)
        {
            FActorSpawnParameters Params;
            Params.SpawnCollisionHandlingOverride =
                ESpawnActorCollisionHandlingMethod::AlwaysSpawn;

            AActor* Actor = World->SpawnActor<AActor>(ActorClass, FVector::ZeroVector,
                                                       FRotator::ZeroRotator, Params);
            Actor->SetActorHiddenInGame(true);
            Actor->SetActorEnableCollision(false);
            Actor->SetActorTickEnabled(false);

            InactivePool.Add(Actor);
        }
    }

    AActor* Acquire(const FVector& Location, const FRotator& Rotation)
    {
        if (InactivePool.Num() == 0)
        {
            UE_LOG(LogTemp, Warning, TEXT("Pool exhausted — consider increasing pool size"));
            return nullptr;
        }

        AActor* Actor = InactivePool.Pop();
        Actor->SetActorLocation(Location);
        Actor->SetActorRotation(Rotation);
        Actor->SetActorHiddenInGame(false);
        Actor->SetActorEnableCollision(true);
        Actor->SetActorTickEnabled(true);

        ActivePool.Add(Actor);
        return Actor;
    }

    void Release(AActor* Actor)
    {
        Actor->SetActorHiddenInGame(true);
        Actor->SetActorEnableCollision(false);
        Actor->SetActorTickEnabled(false);

        ActivePool.Remove(Actor);
        InactivePool.Add(Actor);
    }

private:
    UPROPERTY()
    TArray<AActor*> InactivePool;

    UPROPERTY()
    TArray<AActor*> ActivePool;
};
```

---

## GPU Optimization

### Draw Call Reduction

| Technique | How | Impact |
|-----------|-----|--------|
| **Instanced Static Meshes** | Use `UInstancedStaticMeshComponent` or `UHierarchicalInstancedStaticMeshComponent` for repeated meshes (foliage, rocks, props) | 10–100x draw call reduction |
| **Material Merging** | Combine textures into atlases, use material instances sharing a parent | Fewer material switches |
| **LOD System** | Configure LOD levels on static meshes (Mesh Editor → LOD Settings) | Fewer triangles at distance |
| **Nanite** | Enable for high-poly static meshes — automatic virtualized geometry | Eliminates manual LOD for compatible meshes |
| **Culling** | Distance culling (`CullDistanceVolume`), frustum culling (automatic), occlusion culling | Removes invisible geometry from the pipeline |

### Lumen Optimization

Lumen is UE5's global illumination system. When GPU-bound on lighting:

```
# Console: check Lumen's time budget
stat gpu
```

Look for `Lumen Scene`, `Lumen Reflections`, `Lumen Global Illumination`. If they dominate:

- Reduce `r.Lumen.TracingEndDistanceFromCamera` (default ~20000 units)
- Lower `r.Lumen.ScreenProbeGather.ScreenSpaceBentNormal` quality
- Use **Software Ray Tracing** instead of Hardware RT on lower-end targets
- Set `r.Lumen.DiffuseIndirect.Allow 0` for scenes where GI isn't critical

### Texture Streaming Budget

```
# Set the texture streaming pool size (MB) — match to target platform VRAM
r.Streaming.PoolSize 1024

# Check current streaming status
stat streaming
```

---

## Frame Budget Reference

For a target of **60 FPS** (16.67 ms total frame time):

| Category | Budget | Managed By |
|----------|--------|------------|
| Game Thread (gameplay) | ~5 ms | Tick optimization, simpler AI, fewer casts |
| Game Thread (physics) | ~3 ms | Collision complexity, physics substeps |
| Render Thread (draw calls) | ~4 ms | Instance merging, culling, fewer materials |
| GPU | ~14 ms | LODs, Nanite, Lumen settings, shader complexity |

> **Note:** Game and Render threads run in parallel, so the frame time is the *maximum* of the two, not the sum. The GPU also runs in parallel but one frame behind.

For **30 FPS** targets (mobile, VR at low settings), double all budgets.

---

## Common Optimization Checklist

### Quick Wins (Check These First)

- [ ] **Disable tick** on actors that don't need per-frame updates
- [ ] **Use timers** instead of tick for periodic logic (detection, regen)
- [ ] **Enable Nanite** on high-poly static meshes
- [ ] **Set LODs** on non-Nanite meshes (3–4 LOD levels)
- [ ] **Pool frequently spawned actors** (projectiles, VFX, pickups)
- [ ] **Cull distant objects** with `CullDistanceVolume`

### Medium Effort

- [ ] **Reduce collision complexity** — use simple shapes, not complex meshes
- [ ] **Async loading** with `FStreamableManager` for level streaming
- [ ] **Merge static meshes** for background geometry
- [ ] **Optimize Blueprints** — move hot loops to C++

### Architecture-Level

- [ ] **Significance Manager** for distance-based tick/LOD on many actors
- [ ] **World Partition** for open-world streaming (see [G12](G12_world_partition_streaming.md))
- [ ] **Custom allocators** for systems with predictable allocation patterns
- [ ] **Mass Entity** (experimental) for ECS-style performance on thousands of entities
