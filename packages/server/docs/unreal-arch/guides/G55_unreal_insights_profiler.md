# G55 — Unreal Insights & Performance Profiling

> **Category:** guide · **Engine:** Unreal Engine 5.5+ · **Related:** [G10 Debugging & Profiling](G10_debugging_profiling.md) · [G20 Performance Optimization & Memory](G20_performance_optimization_memory.md) · [G54 Lumen HWRT Optimization](G54_lumen_hwrt_optimization.md)

**Unreal Insights** is Unreal Engine's standalone trace-based profiling and analysis tool. It replaces the legacy Unreal Frontend profiler with a modern timeline UI that visualizes CPU threads, GPU passes, asset loading, network traffic, and custom trace events across frames. This guide covers setup, trace channels, analysis workflows, and integration with game-specific instrumentation.

---

## Architecture

Unreal Insights consists of two components:

```
┌──────────────────┐         ┌──────────────────────┐
│  UnrealTraceServer│◄───────│  Your Game / Editor   │
│  (recording)      │  .utrace│  (instrumented)       │
└──────┬───────────┘  file   └──────────────────────┘
       │
       ▼
┌──────────────────┐
│  UnrealInsights   │
│  (analysis UI)    │
│  - Session Browser│
│  - Timing View    │
│  - Counters       │
│  - Memory         │
│  - Loading        │
│  - Networking     │
└──────────────────┘
```

- **UnrealTraceServer** — a lightweight daemon that receives trace data from the engine via a socket connection or reads `.utrace` files from disk. Located at `Engine/Binaries/Win64/UnrealTraceServer.exe`.
- **UnrealInsights** — the standalone GUI for browsing, opening, and analyzing traces. Located at `Engine/Binaries/Win64/UnrealInsights.exe`.

---

## Getting Started

### Recording a Trace

#### Method 1 — Console Commands (In-Game or Editor)

```
trace.start default         // Start with default channel set
trace.stop                  // Stop and flush to disk
```

Traces are saved to `{ProjectDir}/Saved/TraceSessions/` as `.utrace` files.

#### Method 2 — Command-Line Arguments

```bash
# WHY: Command-line tracing captures startup and loading phases
# that you'd miss if you start tracing after the game is running.
UnrealEditor.exe MyProject.uproject -trace=cpu,gpu,frame,bookmark,counters
```

#### Method 3 — Trace Server (Remote Profiling)

```bash
# On the development machine — start the trace server
UnrealTraceServer.exe

# On the target device — connect to the trace server
# Add to DefaultEngine.ini or command line:
-tracehost=192.168.1.100
-trace=default
```

This is essential for profiling console builds, mobile devices, or dedicated servers.

### Opening a Trace

Launch `UnrealInsights.exe`. The **Session Browser** lists:

- **Live** sessions connected via trace server
- **Local** `.utrace` files in your trace sessions directory
- **Recent** previously opened traces

Double-click a session to open the analysis views.

---

## Trace Channels

Channels control what data is recorded. Each channel adds overhead — enable only what you need.

### Channel Presets

| Preset | Channels | Overhead | Use Case |
|---|---|---|---|
| `default` | `cpu,gpu,frame,bookmark` | Low | General frame-time profiling |
| `counters` | `counters` | Minimal | Stat counters (memory, draw calls, object counts) |
| `loading` | `loadtime,file,assetloadtime` | Low–Medium | Asset loading and streaming analysis |
| `memory` | `memalloc,memtag` | High | Memory allocation tracking |
| `network` | `net` | Low | Network replication profiling |
| `rendering` | `cpu,gpu,frame,rhicommands,rendercommands` | Medium | Detailed render thread analysis |

### Custom Channel Combinations

```
// Maximum detail (highest overhead — use for targeted sessions only)
trace.start log,counters,cpu,frame,bookmark,file,loadtime,gpu,rhicommands,rendercommands,object

// Gameplay focus (moderate overhead)
trace.start cpu,frame,bookmark,counters,gpu

// Loading investigation
trace.start cpu,frame,loadtime,file,assetloadtime,bookmark
```

---

## Analysis Views

### Timing View (Frame Timeline)

The primary profiling view. Shows:

- **Frame bar graph** at the top — frame times over the session, color-coded by duration
- **Thread lanes** — horizontal swim lanes for Game Thread, Render Thread, RHI Thread, worker threads
- **Flame graph** — nested timer scopes within each thread

#### Navigation

| Action | How |
|---|---|
| Zoom | Mouse wheel or `Ctrl + drag` |
| Pan | Middle-mouse drag |
| Select frame | Click on frame bar |
| Measure duration | `Shift + drag` to create a time ruler |
| Filter | Type in the search box to highlight specific timer names |

#### Reading the Flame Graph

```
Game Thread:
├── UWorld::Tick (16.2ms)
│   ├── TickActors (4.1ms)
│   │   ├── ACharacter::Tick (1.2ms)
│   │   └── AMyEnemy::Tick (2.8ms)  ← suspicious — investigate
│   ├── PhysicsSimulation (3.2ms)
│   └── TickComponents (5.1ms)
└── SlateUI (2.3ms)
```

Wide blocks indicate time-consuming operations. Look for:

- **Unexpectedly wide blocks** — potential optimization targets
- **Gaps between blocks** — thread stalls, often waiting on another thread
- **Repeating spikes** — periodic operations (GC, streaming, BVH rebuilds)

### Counters View

Plots numeric counters over time:

- `STAT_NumDrawCalls` — GPU draw call count
- `STAT_TrianglesDrawn` — rendered triangle count
- `STAT_TextureMemory` — GPU texture memory usage
- Custom counters from `DECLARE_FLOAT_COUNTER_STAT`

### Loading View

Analyzes asset loading and streaming:

- Package load times and dependencies
- Async loading queue depth
- IO wait vs. processing time
- Identifies the slowest-loading assets for optimization

---

## Custom Instrumentation

### C++ Trace Scopes

```cpp
#include "ProfilingDebugging/CpuProfilerTrace.h"

// WHY: Custom trace scopes let you measure game-specific operations
// that engine-level profiling doesn't cover (AI decision-making,
// pathfinding, custom physics, etc.).

void AMyAIController::RunBehaviorTree()
{
    // TRACE_CPUPROFILER_EVENT_SCOPE creates a named scope visible in
    // UnrealInsights' Timing View under the calling thread.
    TRACE_CPUPROFILER_EVENT_SCOPE(MyAI_RunBehaviorTree);

    // Your AI logic here
    EvaluateTargets();
    SelectAction();
    ExecuteAction();
}

void AMyAIController::EvaluateTargets()
{
    TRACE_CPUPROFILER_EVENT_SCOPE(MyAI_EvaluateTargets);

    // Nested scopes appear as children in the flame graph
    for (AActor* Target : PotentialTargets)
    {
        TRACE_CPUPROFILER_EVENT_SCOPE(MyAI_ScoreTarget);
        ScoreTarget(Target);
    }
}
```

### Custom Counters

```cpp
#include "ProfilingDebugging/CountersTrace.h"

// WHY: Custom counters track game-specific metrics alongside engine stats.
// Useful for correlating gameplay state with performance.

TRACE_DECLARE_INT_COUNTER(ActiveEnemyCount, TEXT("Game/ActiveEnemies"));
TRACE_DECLARE_FLOAT_COUNTER(AIBudgetMs, TEXT("Game/AIBudgetMs"));

void AMyGameMode::Tick(float DeltaTime)
{
    Super::Tick(DeltaTime);

    TRACE_COUNTER_SET(ActiveEnemyCount, LiveEnemies.Num());

    double AIStart = FPlatformTime::Seconds();
    TickAllAI();
    double AITime = (FPlatformTime::Seconds() - AIStart) * 1000.0;
    TRACE_COUNTER_SET(AIBudgetMs, AITime);
}
```

### Bookmarks

Bookmarks create named markers in the timeline for easy navigation:

```cpp
#include "ProfilingDebugging/MiscTrace.h"

// WHY: Bookmarks let you mark gameplay events (wave start, boss spawn,
// level transition) so you can jump directly to those moments in analysis.

TRACE_BOOKMARK(TEXT("Wave %d Started"), WaveNumber);
TRACE_BOOKMARK(TEXT("Boss Spawned: %s"), *BossName);
TRACE_BOOKMARK(TEXT("Level Streaming: %s"), *LevelName);
```

---

## Profiling Workflows

### Workflow 1 — Hunting Frame Spikes

1. Record with `trace.start cpu,gpu,frame,bookmark`
2. In Timing View, look at the frame bar graph for tall (slow) frames
3. Click on a spike frame
4. Examine the flame graph — which thread is the bottleneck?
5. Drill into the widest scope on the bottleneck thread
6. Repeat until you find the specific function causing the spike

### Workflow 2 — Investigating Hitches

1. Record with `trace.start cpu,gpu,frame,bookmark,counters`
2. Look for periodic spikes (every N seconds) — likely GC, streaming, or BVH rebuild
3. Check if Game Thread shows `IncrementalPurgeGarbage` or `CollectGarbage` — tune GC settings
4. Check for `BuildAccelerationStructure` — too many movable meshes updating the ray tracing BVH
5. Check for `StreamingFlush` — level streaming causing frame hitches

### Workflow 3 — Memory Budget Validation

1. Record with `trace.start memalloc,memtag,counters` (high overhead — short sessions only)
2. Open the Memory view
3. Identify allocation hotspots by tag (Textures, Audio, Meshes, Blueprints)
4. Look for allocation count growth over time — potential memory leaks
5. Cross-reference with the Counters view for texture and mesh memory stats

### Workflow 4 — Loading Time Optimization

1. Record with `trace.start cpu,frame,loadtime,file,assetloadtime,bookmark` from launch
2. Open the Loading view
3. Sort assets by load time
4. Identify dependency chains causing sequential loads
5. Target the slowest assets for async loading, soft references, or streaming

---

## Integration with Other Profiling Tools

| Tool | Strength | When to Use |
|---|---|---|
| `stat unit` | Quick in-game frame time breakdown | First-pass check during development |
| `stat gpu` | Per-pass GPU timing | Identifying which render pass is expensive |
| `stat scenerendering` | Detailed render stats | Draw call and primitive counts |
| **Unreal Insights** | Full timeline analysis across all threads | Deep investigation of spikes, hitches, loading |
| **RenderDoc / NSight** | GPU capture and shader debugging | Per-draw-call GPU analysis |
| **Platform profilers** (PIX, Razor, Instruments) | Hardware-level profiling | Console/mobile final optimization |

---

## Best Practices

1. **Profile early and often** — don't wait until optimization phase. Capture baselines at milestones.
2. **Use bookmarks liberally** — mark gameplay events so you can correlate performance with game state.
3. **Keep trace sessions short** — long sessions generate large files (GBs). Focus on the specific scenario you're investigating.
4. **Profile on target hardware** — PC profiling rarely predicts console performance accurately. Use the trace server for remote profiling.
5. **Instrument your game systems** — add `TRACE_CPUPROFILER_EVENT_SCOPE` to every major game system (AI, combat, UI, networking) from the start.
6. **Compare before and after** — save traces from before and after optimization. Unreal Insights can open multiple sessions for side-by-side comparison.
7. **Automate profiling in CI** — run automated test maps with tracing enabled, then parse `.utrace` files for regression detection.

---

## Common Pitfalls

1. **Profiling with Editor overhead** — the editor adds significant CPU cost. Profile in standalone game (`-game`) or packaged builds for accurate numbers.
2. **Leaving high-overhead channels enabled** — `memalloc` traces every allocation and can 10× file size and impact frame times. Enable only for targeted sessions.
3. **Ignoring worker threads** — modern UE runs significant work on task graph workers. Don't focus exclusively on Game Thread and Render Thread.
4. **Conflating GPU and CPU bottlenecks** — if Game Thread is waiting on GPU (`WaitForRHIThread`), the CPU isn't the problem. Fix the GPU-bound pass first.
5. **Not using the trace server for devices** — recording traces to disk on console/mobile affects IO performance. Stream to a development PC via trace server instead.
