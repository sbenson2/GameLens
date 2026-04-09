# G10 — Debugging and Profiling

> **Category:** guide · **Engine:** Unreal Engine 5.4+ · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G9 Rendering (Nanite/Lumen)](G9_rendering_nanite_lumen.md) · [R1 Capability Matrix](../reference/R1_capability_matrix.md)

Unreal Engine 5 provides a layered profiling system: quick console `stat` commands for live diagnostics, the GPU Visualizer for render-thread analysis, and **Unreal Insights** for deep offline trace analysis. This guide covers all three tiers, along with C++ and Blueprint debugging techniques and common optimization patterns.

---

## Profiling Tiers

```
┌───────────────────────────────────────────────────────────────┐
│                    UE5 Profiling Stack                          │
│                                                                 │
│  Tier 1: Quick Stats (live, in-game)                           │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  stat fps · stat unit · stat gpu · stat unitgraph          │ │
│  │  → Identify: CPU vs GPU bound, gross frame budget          │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  Tier 2: GPU Visualizer (single-frame capture)                 │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  ProfileGPU (Ctrl+Shift+,) → hierarchical GPU breakdown   │ │
│  │  → Identify: which render pass costs the most              │ │
│  └───────────────────────────────────────────────────────────┘ │
│                                                                 │
│  Tier 3: Unreal Insights (offline trace analysis)              │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │  trace.start / trace.stop → .utrace file → Insights app   │ │
│  │  → Identify: cross-thread bottlenecks, hitches, trends     │ │
│  └───────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

---

## Tier 1: Console Stat Commands

Open the console with the **backtick key** (`` ` `` or `~`). These commands display live overlays.

### Essential Commands

| Command | What It Shows | When to Use |
|---|---|---|
| `stat fps` | Current FPS | Quick sanity check |
| `stat unit` | Frame time split: Game, Draw, GPU, RHIT | **First command** — tells you if you're CPU or GPU bound |
| `stat unitgraph` | Visual graph of `stat unit` over time | Spot hitches and frame time variance |
| `stat gpu` | GPU time by render category (lights, shadows, Lumen, etc.) | Drill into GPU bottlenecks |
| `stat scenerendering` | Draw calls, mesh draw commands, triangles | Rendering complexity overview |
| `stat game` | Tick time by actor category | Expensive gameplay logic |
| `stat physics` | Physics simulation time, broadphase, narrowphase | Physics bottlenecks |
| `stat memory` | Memory usage by category | Memory budget tracking |
| `stat particles` | Niagara/Cascade particle counts and cost | VFX optimization |

### Reading `stat unit` Output

```
Frame: 16.67ms    ← Total frame time (target: 16.67ms for 60fps)
Game:   4.20ms    ← Game thread (gameplay logic, ticking, animation)
Draw:   3.10ms    ← Draw thread (preparing render commands for GPU)
GPU:   12.50ms    ← GPU rendering time
RHIT:   0.80ms    ← Render Hardware Interface Thread
Swap:   0.00ms    ← VSync wait time

Rule of thumb:
  If GPU > Game and GPU > Draw → GPU-bound
  If Game > GPU              → Game-thread-bound (optimize C++/BP logic)
  If Draw > GPU              → Draw-thread-bound (too many draw calls)
```

---

## Tier 2: GPU Visualizer

Press **Ctrl+Shift+,** (or type `ProfileGPU` in the console) to capture a single GPU frame and display a hierarchical breakdown.

### What It Shows

The GPU Visualizer breaks down the rendering pipeline into passes:

- **PrePass / DepthPass** — Depth pre-pass for occlusion
- **BasePass** — Material evaluation for all opaque geometry
- **Lumen** — Global illumination (scene, reflections, radiance cache)
- **Shadows** — Shadow map rendering (Virtual Shadow Maps in UE 5.x)
- **Lights** — Direct lighting evaluation
- **Translucency** — Transparent object rendering
- **PostProcessing** — Bloom, tonemapping, DOF, motion blur, TSR

### Common GPU Bottlenecks

| Pass | If It's Expensive | Optimization |
|---|---|---|
| BasePass | Too many triangles or complex materials | Enable Nanite, reduce material complexity, use LODs for non-Nanite meshes |
| Shadows | Many shadow-casting lights | Reduce cascades, use Virtual Shadow Maps, limit shadow distance |
| Lumen | GI is costly for large/complex scenes | Reduce Lumen Scene detail, use Lumen reflections only where needed |
| Translucency | Many overlapping transparent objects | Reduce particle overdraw, use opaque when possible |
| PostProcessing | Heavy DOF or bloom | Profile individual effects, disable non-essential ones |

---

## Tier 3: Unreal Insights

Unreal Insights is a **standalone** profiling application that records everything happening across all engine threads over time.

### Recording a Trace

```
Step 1: Launch your game (editor PIE or standalone build)

Step 2: Open the console and start recording:
  trace.start default,cpu,gpu,frame,bookmark,memory

  WHY specify channels? Each channel adds overhead. "default" covers
  most needs. Add "memory" only when investigating memory issues.
  Production builds should use targeted channels to minimize impact.

Step 3: Play through the problematic section

Step 4: Stop recording:
  trace.stop

Step 5: Find the .utrace file:
  Editor: Saved/Profiling/ in your project directory
  Packaged: The game's saved directory

Step 6: Open in Insights:
  Engine/Binaries/Win64/UnrealInsights.exe (Windows)
  Engine/Binaries/Mac/UnrealInsights (macOS)
```

### Insights Windows

**Timing Insights** — The primary view. Shows a timeline of all threads (Game, Render, RHI, worker threads) with hierarchical event scopes. Scrub through time to find spikes. Click events to see call stacks and durations.

**Memory Insights** — Tracks allocations over time. Useful for finding memory leaks by comparing allocation patterns during level load/unload cycles.

**Loading Insights** — Asset loading and streaming activity. Helps diagnose load-time hitches during gameplay.

### Finding Hitches in Insights

1. Open the Timing view
2. Look for **tall spikes** in the frame time graph at the top
3. Zoom into the spike
4. In the Game Thread lane, find the longest event — this is your bottleneck
5. Drill into its children to find the specific function

---

## C++ Debugging Techniques

### Scope Timing with TRACE Macros

```cpp
#include "ProfilingDebugging/CsvProfiler.h"

// TRACE_CPUPROFILER_EVENT_SCOPE creates a named scope that appears
// in both stat commands AND Unreal Insights traces.
// WHY use this over manual timers? It integrates with all of UE5's
// profiling tools automatically, and the overhead is near-zero
// when profiling is disabled.
void AMyCharacter::PerformComplexAI()
{
    TRACE_CPUPROFILER_EVENT_SCOPE(MyGame_ComplexAI);

    // Nested scopes let you drill into sub-costs.
    {
        TRACE_CPUPROFILER_EVENT_SCOPE(MyGame_Pathfinding);
        RunPathfinding();
    }

    {
        TRACE_CPUPROFILER_EVENT_SCOPE(MyGame_BehaviorTree);
        EvaluateBehaviorTree();
    }
}
```

### Custom Stat Groups

```cpp
// Declare a stat group in your module's header.
// WHY a stat group? It creates a toggleable console command
// (stat MyGameAI) that shows just your game's AI metrics,
// filtering out engine noise.
DECLARE_STATS_GROUP(TEXT("MyGameAI"), STATGROUP_MyGameAI,
    STATCAT_Advanced);

// Declare individual cycle counters.
DECLARE_CYCLE_STAT(TEXT("Total AI Update"), STAT_AIUpdate,
    STATGROUP_MyGameAI);
DECLARE_CYCLE_STAT(TEXT("Pathfinding"), STAT_Pathfinding,
    STATGROUP_MyGameAI);
DECLARE_DWORD_COUNTER_STAT(TEXT("Active AI Agents"), STAT_AIAgentCount,
    STATGROUP_MyGameAI);

void UAISubsystem::TickAI(float DeltaTime)
{
    // SCOPE_CYCLE_COUNTER records the time this scope takes
    // and reports it under the stat group.
    SCOPE_CYCLE_COUNTER(STAT_AIUpdate);

    // Report a simple count metric.
    SET_DWORD_STAT(STAT_AIAgentCount, ActiveAgents.Num());

    for (auto& Agent : ActiveAgents)
    {
        SCOPE_CYCLE_COUNTER(STAT_Pathfinding);
        Agent->UpdatePath();
    }
}

// In-game: type "stat MyGameAI" in the console to see these stats.
```

### Log-Based Debugging

```cpp
// UE_LOG is the standard logging macro. Messages appear in the
// Output Log window and are written to Saved/Logs/.
// WHY use categories? You can filter by category in the Output Log,
// making it practical even in a noisy codebase.
DEFINE_LOG_CATEGORY_STATIC(LogMyGameAI, Log, All);

void AMyCharacter::OnDamageReceived(float Damage, AActor* Source)
{
    UE_LOG(LogMyGameAI, Warning,
        TEXT("Character %s took %.1f damage from %s"),
        *GetName(), Damage,
        Source ? *Source->GetName() : TEXT("Unknown"));

    // For temporary debug output that's easy to find and remove:
    // GEngine->AddOnScreenDebugMessage displays text on the viewport.
    // WHY on-screen vs log? On-screen messages are visible during
    // gameplay without pausing to check the log. Use -1 as the key
    // for messages that stack, or a unique int to update in place.
    if (GEngine)
    {
        GEngine->AddOnScreenDebugMessage(-1, 5.f, FColor::Red,
            FString::Printf(TEXT("Damage: %.1f from %s"),
                Damage,
                Source ? *Source->GetName() : TEXT("Unknown")));
    }
}
```

---

## Blueprint Debugging

### Breakpoints and Watch Values

1. **Set breakpoints** by clicking the left margin of any Blueprint node
2. **Play in Editor** — execution pauses at the breakpoint
3. **Hover over pins** to see current values
4. Use the **Blueprint Debugger** panel (Window → Developer Tools → Blueprint Debugger) to step through execution

### Blueprint Profiler

Enable via **Window → Developer Tools → Blueprint Profiler** while PIE is running. It shows:

- Time per Blueprint event (Tick, BeginPlay, custom events)
- Time per individual node
- Number of executions per frame

### Common Blueprint Performance Traps

| Issue | Why It's Slow | Fix |
|---|---|---|
| Tick on every Blueprint actor | Tick has overhead even when empty | Disable tick when not needed; use timers instead |
| ForEachLoop over large arrays | Blueprint loops are interpreted, not compiled | Move hot loops to C++ with `BlueprintCallable` |
| Cast nodes in Tick | Each cast does a type check | Cache the cast result in BeginPlay |
| Get All Actors of Class | Iterates every actor in the world | Maintain a registry or use gameplay tags |

---

## Memory Debugging

### Console Commands for Memory

| Command | Purpose |
|---|---|
| `memreport -full` | Dumps detailed memory report to log file |
| `obj list` | Lists all UObjects and their counts |
| `stat memory` | Live memory overview |
| `stat memoryplatform` | Platform-specific memory pools |

### Finding Memory Leaks

```
1. Load your level → memreport -full → save as "baseline.memreport"
2. Play through the suspect area (load/unload sub-levels, spawn/destroy actors)
3. Return to the initial state → memreport -full → save as "after.memreport"
4. Compare the reports — growing object counts indicate leaks

Common leak sources in UE5:
  • Timers not cleared in EndPlay → use GetWorldTimerManager().ClearAllTimersForObject(this)
  • Delegates not unbound → always unbind in BeginDestroy or EndPlay
  • Hard references in Blueprints → use Soft Object References + async loading
  • Loaded assets not garbage collected → call CollectGarbage() after unloading
```

---

## Performance Debugging Workflow

```
Step 1: Establish the target
──────────────────────────
  60fps → 16.67ms per frame
  30fps → 33.33ms per frame
  VR    → 11.11ms (90fps) or 8.33ms (120fps)

Step 2: Run stat unit — identify the bottleneck thread
──────────────────────────
  GPU > Game?  → GPU-bound  → Go to Step 3a
  Game > GPU?  → CPU-bound  → Go to Step 3b
  Draw > both? → Draw-bound → Reduce draw calls, use Nanite, merge actors

Step 3a: GPU-bound
──────────────────────────
  ProfileGPU (Ctrl+Shift+,) → find the expensive pass
  stat gpu → see cost by render category
  → Nanite for geometry, VSM for shadows, reduce Lumen quality,
    disable expensive post-process effects

Step 3b: CPU-bound
──────────────────────────
  stat game → is it actor ticking?
  Unreal Insights trace → find the specific function
  stat MyGameStats → check your custom counters
  → Move hot code to C++, reduce tick frequency, use async tasks

Step 4: Validate
──────────────────────────
  Record an Insights trace before AND after your optimization.
  Compare average frame times across 1000+ frames.
  WHY compare traces? Individual frames vary. Statistical comparison
  across many frames proves the optimization is real, not noise.
```

---

## Useful Console Commands Reference

| Command | Description |
|---|---|
| `stat fps` | Frames per second |
| `stat unit` | Frame time by thread |
| `stat unitgraph` | Visual frame time graph |
| `stat gpu` | GPU time by category |
| `stat scenerendering` | Draw calls and triangle counts |
| `stat game` | Game thread tick time |
| `stat physics` | Physics simulation cost |
| `stat memory` | Memory overview |
| `stat startfile` / `stat stopfile` | Legacy Profiler capture (saved to `.ue4stats`) |
| `trace.start` / `trace.stop` | Unreal Insights trace recording |
| `ProfileGPU` | Single-frame GPU capture |
| `memreport -full` | Full memory dump to log |
| `obj list` | List all live UObjects |
| `gc.CollectGarbage` | Force garbage collection |
| `t.MaxFPS 0` | Uncap frame rate for profiling |

---

## Further Reading

- [E1 Architecture Overview](../architecture/E1_architecture_overview.md) — How UE5's module and thread architecture affects profiling
- [G9 Rendering (Nanite/Lumen)](G9_rendering_nanite_lumen.md) — Rendering pipeline details for GPU profiling context
- [G1 Gameplay Framework](G1_gameplay_framework.md) — Actor lifecycle and tick order for CPU profiling
- Epic Docs: [Stat Commands](https://dev.epicgames.com/documentation/en-us/unreal-engine/stat-commands-in-unreal-engine)
- Epic Docs: [Performance Profiling Introduction](https://dev.epicgames.com/documentation/en-us/unreal-engine/introduction-to-performance-profiling-and-configuration-in-unreal-engine)
- Epic Community: [Unreal Insights Tutorial](https://dev.epicgames.com/community/learning/tutorials/1wzR/performance-profiling-with-unreal-insights-basics-unreal-engine-4-unreal-engine-5-tutorial)
