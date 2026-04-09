# G53 — Movie Render Graph

> **Category:** guide · **Engine:** Unreal Engine 5.4+ · **Related:** [G50 Sequencer & Cinematics](G50_sequencer_cinematics.md) · [G9 Rendering — Nanite & Lumen](G9_rendering_nanite_lumen.md) · [G37 Editor Scripting & Automation](G37_editor_scripting_automation.md)

The **Movie Render Graph** (MRG) is Unreal Engine's node-based cinematic rendering pipeline, introduced experimentally in UE 5.4 and reaching beta in UE 5.6+. It replaces the settings-panel workflow of the legacy Movie Render Queue (MRQ) with a visual graph where each render pass, output format, and post-process override is a discrete node — making complex multi-layer rendering setups composable, reusable, and version-controllable.

---

## Why Movie Render Graph?

The original Movie Render Queue uses a flat list of settings objects to configure output. This works for simple single-pass renders but becomes unwieldy when a cinematic pipeline demands:

- Multiple render layers (beauty, depth, motion vectors, custom stencil mattes)
- Per-layer output format control (EXR for compositing passes, ProRes for editorial)
- Conditional logic (different quality settings per shot)
- Pipeline automation (CI rendering, batch processing)

Movie Render Graph addresses these by representing the entire render configuration as a directed acyclic graph (DAG) of nodes.

```
[Input: Sequence] → [Renderer: Deferred] → [Output: EXR (Beauty)]
                                         → [Output: EXR (Depth)]
                  → [Renderer: Path Tracer] → [Output: EXR (Clean Plate)]
```

---

## Core Concepts

### Graph Assets

A Movie Render Graph configuration is saved as a `UMovieGraphConfig` asset. This asset can be:

- Shared across multiple jobs in a Movie Pipeline Queue
- Referenced by other graphs (composition)
- Stored in source control alongside the Level Sequences it renders

### Node Categories

MRG nodes fall into several functional categories:

| Category | Purpose | Examples |
|---|---|---|
| **Input** | Define what to render | Level Sequence reference, shot selection |
| **Renderer** | Configure how to render | Deferred Rendering, Path Tracing |
| **Modifier** | Alter render behavior | Anti-Aliasing settings, Warm-Up Frames, Console Variable overrides |
| **Output** | Define where results go | EXR Output, PNG Sequence, Apple ProRes, AVI |
| **Global** | Graph-wide settings | Output Resolution, Frame Rate, Filename Format |

### Execution Flow

When a render job executes:

1. The **Input** node identifies the Level Sequence and shot range
2. **Modifier** nodes apply console variable overrides, warm-up frames, and quality settings
3. Each **Renderer** node produces a render pass (the frame is rendered once per distinct renderer configuration)
4. **Output** nodes consume rendered frames and write them to disk in the specified format

---

## Setting Up a Basic Render

### Step 1 — Create the Graph Asset

In the Content Browser, right-click → **Cinematics** → **Movie Render Graph**. This creates a new `UMovieGraphConfig` asset with a default pass-through graph.

### Step 2 — Configure Nodes

Open the graph editor and build your pipeline:

```
Typical production setup:

[Global Settings]
  ├─ Resolution: 3840 × 2160
  ├─ Frame Rate: 24 fps
  └─ Filename: {sequence_name}/{shot_name}/{frame_number}

[Warm-Up] → [Deferred Renderer] → [EXR Output (Beauty, 16-bit Half)]
                                 → [EXR Output (WorldNormal)]
                                 → [EXR Output (SceneDepth)]
                                 → [PNG Output (Preview, 8-bit)]
```

### Step 3 — Queue the Job

Add the graph to a **Movie Pipeline Queue** job alongside the target Level Sequence. Execute via the editor UI or programmatically.

---

## Multi-Layer Rendering

MRG's primary advantage is composable multi-layer rendering for VFX and compositing workflows.

### Render Layers with Stencil Mattes

Use multiple Renderer nodes with different **Custom Stencil** filters to isolate elements:

```
[Deferred Renderer — Stencil Layer: Characters]  → [EXR: characters_beauty]
[Deferred Renderer — Stencil Layer: Background]  → [EXR: bg_beauty]
[Deferred Renderer — Stencil Layer: FX]          → [EXR: fx_beauty]
```

Each layer renders independently with its own set of modifiers, enabling per-layer quality tuning.

### Buffer Outputs (UE 5.4+)

MRG supports outputting individual G-buffer channels as separate passes:

- `SceneColor` — Final lit beauty pass
- `WorldNormal` — World-space normals for relighting
- `SceneDepth` — Linear depth for compositing depth-of-field
- `Metallic`, `Roughness`, `BaseColor` — Material channels
- `CustomStencil` — Object ID mattes
- `Velocity` — Motion vectors for offline motion blur

---

## Automation with C++ and Python

### C++ — Programmatic Queue Submission

```cpp
#include "MovieGraphConfig.h"
#include "MoviePipelineQueue.h"
#include "MoviePipelineInProcessExecutor.h"

// WHY: Automate cinematic rendering in CI/CD or batch pipelines.
// Movie Render Graph configs are data assets — load them like any UObject.
void UCinematicAutomation::RenderWithGraph(
    ULevelSequence* Sequence,
    UMovieGraphConfig* GraphConfig)
{
    UMoviePipelineQueue* Queue = NewObject<UMoviePipelineQueue>(this);
    UMoviePipelineExecutorJob* Job = Queue->AllocateNewJob(
        UMoviePipelineExecutorJob::StaticClass());

    Job->Sequence = FSoftObjectPath(Sequence);
    Job->Map = FSoftObjectPath(GetWorld()->GetCurrentLevel()->GetOutermost());
    // Assign the graph config to the job
    // The graph replaces the old flat settings list

    UMoviePipelineInProcessExecutor* Executor =
        NewObject<UMoviePipelineInProcessExecutor>(this);
    Executor->Execute(Queue);
}
```

### Python — Editor Utility Scripting

```python
# WHY: Python scripting enables pipeline TDs to batch-render entire
# cinematic libraries without manual editor interaction.
import unreal

def batch_render_cinematics(sequence_paths, graph_path):
    """Render a list of sequences using a shared MRG config."""
    subsystem = unreal.get_editor_subsystem(
        unreal.MoviePipelineQueueSubsystem)
    queue = subsystem.get_queue()

    graph = unreal.load_asset(graph_path)

    for seq_path in sequence_paths:
        job = unreal.MoviePipelineExecutorJob()
        job.sequence = unreal.SoftObjectPath(seq_path)
        # Associate graph config with job
        queue.allocate_new_job(job)

    # Execute all jobs
    executor = unreal.MoviePipelineInProcessExecutor()
    subsystem.render_queue_with_executor(executor)
```

---

## UE 5.6+ Improvements

- **Quick Render**: One-click rendering directly from Sequencer using the active MRG configuration — no queue setup required for simple outputs.
- **Per-Layer EXR Metadata (UE 5.7)**: Each render layer can embed custom metadata in EXR headers for downstream compositing in Nuke, Fusion, or After Effects.
- **USD / Interchange Output (UE 5.7)**: Extended support for writing render data to USD format for cross-DCC pipelines.
- **Runtime MRQ**: Movie Render Queue can now execute at runtime in packaged builds (UE 5.7), enabling in-game replay rendering and player-controlled cinematic capture.

---

## Transitioning from Legacy MRQ Settings

If you have existing MRQ configurations using the old settings-panel approach:

| Legacy MRQ Setting | MRG Equivalent |
|---|---|
| Output Settings (format, resolution) | Global Settings node + Output node |
| Anti-Aliasing (spatial/temporal samples) | Anti-Aliasing Modifier node |
| Console Variables | CVar Override Modifier node |
| High Resolution Tiling | Tiling Modifier node |
| Warm Up Frames | Warm-Up Modifier node |
| Burn-In Widget | Burn-In Overlay node |

Epic provides migration documentation at `dev.epicgames.com/documentation/en-us/unreal-engine/transitioning-to-the-movie-render-graph-from-movie-render-queue-in-unreal-engine`.

---

## Best Practices

### Graph Organization

- **Name outputs descriptively** — `{shot_name}_beauty_v{version}` not `output_001`
- **Save graph configs per-project** — avoid overriding the engine default config
- **Use sub-graphs** for reusable layer setups (character isolation, depth passes) shared across cinematics

### Performance

- **Warm-up frames matter** — Lumen and Nanite need 16–32 frames to converge temporal data. Set warm-up frames accordingly or you get black/noisy first frames.
- **Path Tracing is expensive** — use it only for hero shots or clean plates. Deferred rendering with Lumen HWRT is sufficient for most production needs.
- **Limit concurrent render layers** — each layer is a full re-render of the scene. Four layers = 4× render time.

### Pipeline Integration

- Store MRG configs in version control alongside the sequences they render
- Use Python scripting to validate graph configs before submitting render farm jobs
- Output to a structured directory hierarchy: `{project}/{sequence}/{shot}/{pass}/{frame}.exr`

---

## Common Pitfalls

1. **Forgetting warm-up frames** — Lumen GI and temporal AA produce noise/black on the first rendered frames without sufficient warm-up.
2. **Mismatched resolution between graph and Sequencer** — the MRG Global Settings resolution overrides the editor viewport; set it explicitly.
3. **Using legacy MRQ UI for MRG configs** — the old "Movie Render Queue" window renders settings-based configs; use the updated Render Queue window for graph-based configs.
4. **Not enabling the plugin** — Movie Render Graph requires the `MovieRenderPipeline` and `MovieRenderPipelineEditor` plugins enabled in Project Settings.
5. **EXR output without half-float** — full 32-bit float EXR doubles file size with negligible compositing benefit for most passes; use 16-bit half unless you need HDR headroom beyond ±65504.
