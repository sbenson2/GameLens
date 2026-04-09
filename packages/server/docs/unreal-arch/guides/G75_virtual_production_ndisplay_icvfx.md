# Virtual Production with nDisplay & ICVFX

> **Category:** guide · **Engine:** Unreal Engine · **Related:** [G9 Rendering Nanite & Lumen](G9_rendering_nanite_lumen.md), [G50 Sequencer & Cinematics](G50_sequencer_cinematics.md), [G53 Movie Render Graph](G53_movie_render_graph.md)

Unreal Engine's Virtual Production toolkit enables real-time rendering on LED volumes for film, broadcast, and live events. The two core systems are **nDisplay** (multi-node clustered rendering) and **ICVFX** (In-Camera Visual Effects) which together allow a physical camera to shoot actors in front of an LED wall displaying a real-time 3D environment with correct parallax and perspective. Production-ready since UE 5.1, with significant enhancements through UE 5.5 and 5.6.

## Core Concepts

### nDisplay

nDisplay is Unreal's clustered rendering system that synchronizes multiple instances of the engine across a network of machines, each rendering a portion of a larger display surface (typically an LED volume). A single primary node orchestrates frame timing, input, and game state; secondary nodes render their assigned viewports in lockstep.

### ICVFX (In-Camera VFX)

ICVFX extends nDisplay with camera-aware rendering. A tracked physical camera's position and lens data are fed into the engine via LiveLink, creating an **inner frustum** — a high-resolution, perspective-correct render of the 3D scene matching exactly what the camera sees. The rest of the LED wall renders the **outer frustum** at a different resolution and field of view, providing ambient lighting and background for off-camera areas.

### Architecture Diagram

```
Physical Camera (tracked)
        │ LiveLink
        v
┌─────────────────────────────┐
│   Unreal Engine (Primary)   │
│  ┌───────────────────────┐  │
│  │ ADisplayClusterRoot   │  │
│  │  ├─ ICVFX Camera Comp │──── Inner Frustum (camera POV)
│  │  ├─ nDisplay Screens  │──── Outer Frustum (LED wall panels)
│  │  └─ Light Cards        │──── Virtual lighting supplements
│  └───────────────────────┘  │
│         Switchboard          │
└──────────┬──────────────────┘
           │ Cluster Sync
    ┌──────┴──────┐
    v             v
 Node 1        Node 2  ...  Node N
(LED Panel    (LED Panel
 Section)      Section)
```

## Key Classes and Components

### ADisplayClusterRootActor

The central actor that defines your entire nDisplay configuration. Place one in your level to define the cluster topology.

```cpp
// Access the nDisplay root actor in C++
#include "DisplayClusterRootActor.h"

ADisplayClusterRootActor* RootActor = /* find in level */;

// Get current configuration data (read-only at runtime)
const UDisplayClusterConfigurationData* Config = RootActor->GetConfigData();
```

Key properties:
- **Cluster Nodes** — Define each rendering machine (hostname, viewport assignments)
- **Viewports** — Map portions of the 3D scene to physical screen regions
- **ICVFX Cameras** — Reference tracked cameras for inner frustum rendering

### UDisplayClusterICVFXCameraComponent

Attach this to the nDisplay Root Actor to define an ICVFX camera. It creates the inner frustum and links to a physical camera's tracking data via LiveLink.

```cpp
// Blueprint-accessible properties
UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "ICVFX")
bool bEnableInnerFrustum = true;

// Hidden ICVFX viewports for occlusion
UPROPERTY(EditAnywhere, Category = "ICVFX")
TArray<FDisplayClusterComponentRef> HiddenICVFXViewports;
```

### Switchboard

Switchboard is a Python-based tool that launches and manages all cluster nodes from a single control panel. It handles:
- Starting/stopping nDisplay instances on each machine
- LiveLink connection management
- Multi-user editing session coordination
- Configuration deployment to cluster nodes

## Setup Workflow

### 1. Enable Required Plugins

In the Plugins browser, enable:
- **nDisplay** — Core clustered rendering
- **In-Camera VFX** — ICVFX camera and frustum management
- **LiveLink** — Camera tracking data input
- **DMX** — LED wall fixture control (optional)
- **Virtual Production Utilities** — Helper tools and widgets

### 2. Create nDisplay Configuration

1. In Content Browser, right-click > **nDisplay Config** to create a new configuration asset.
2. Open the **nDisplay 3D Config Editor** to visually lay out your LED wall geometry.
3. Define screen meshes that match your physical LED panel arrangement (dimensions in centimeters).
4. Add cluster nodes — one per rendering machine — and assign viewport regions.

### 3. Configure ICVFX Camera

1. Add a **DisplayClusterICVFXCameraComponent** to your nDisplay Root Actor.
2. Set the **External Camera Actor** reference to a CineCamera in your level that receives LiveLink tracking data.
3. Configure inner frustum resolution and overscan (typically 10-20% overscan for lens distortion correction).
4. Set up **Chromakey** or **Light Card** layers as needed.

### 4. LiveLink Camera Tracking

Connect your camera tracking system (OptiTrack, Vicon, Stype, LONET, etc.) via LiveLink:

```cpp
// In your tracking source plugin
#include "LiveLinkTypes.h"

// Create and push camera transform data
FLiveLinkCameraFrameData FrameData;
FrameData.Transform = FTransform(CameraRotation, CameraLocation);
FrameData.FieldOfView = LensFieldOfView;
FrameData.FocalLength = LensFocalLength;

LiveLinkClient->PushSubjectFrameData(SubjectName, MoveTemp(FrameData));
```

### 5. Launch via Switchboard

Open **Window > Virtual Production > Switchboard** and configure your cluster launch profile. Switchboard deploys the project to each node, starts the engine instances, and establishes cluster synchronization.

## ICVFX Editor (UE 5.1+)

The In-Camera VFX Editor (`Window > Virtual Production > In-Camera VFX`) provides a unified control panel:

- **Color Correction** — Per-viewport color grading and white balance
- **nDisplay Adjustments** — Viewport resolution, overscan, and frustum tuning
- **Light Cards** — Virtual lights rendered on the LED wall to supplement physical lighting
- **Frustum Visualization** — Preview inner/outer frustum boundaries

## Light Cards

Light Cards are virtual emissive panels placed in the nDisplay scene to provide fill lighting on actors. They render only on the LED wall (not in the camera's inner frustum) and can be:

- **Static** — Fixed position relative to the stage
- **Camera-relative** — Track with the ICVFX camera to provide consistent rim or fill light
- **Flag cards** — Subtractive light blockers

## Multi-GPU and Performance

### Rendering Pipeline

Each cluster node renders its assigned viewports independently. For ICVFX:
- The **inner frustum** is rendered at full resolution (often 4K+) with all post-processing
- The **outer frustum** can render at reduced resolution since it's primarily for ambient light

### Performance Targets

Virtual production typically targets **23.976 or 24 FPS** for film (with frame lock via genlock) or **30/60 FPS** for broadcast. Frame timing is critical — dropped frames cause visible tearing on the LED wall.

### Optimization Strategies

- Use **Nanite** for environment geometry to maintain consistent frame times
- **Lumen** for global illumination with HWRT for highest quality
- Reduce outer frustum resolution (50-75% of inner frustum)
- Limit real-time reflections in outer frustum viewports
- Use **Level Streaming** to load only visible environment chunks

## UE Version Highlights

| Version | Key VP Features |
|---------|----------------|
| UE 5.1 | Lumen multi-viewport support, In-Camera VFX Editor, SMPTE-2110 |
| UE 5.2 | Color grading per-viewport, improved light card workflow |
| UE 5.3 | Multi-user editing improvements, stage operator tools |
| UE 5.4 | Depth of Field compensation, Android VCam support |
| UE 5.5 | Production-ready ICVFX pipeline, performance improvements |
| UE 5.6 | DLSS support in nDisplay, primary node failover, HWRT improvements |

## Common Pitfalls

1. **ICVFX Camera not parented correctly** — The ICVFX Camera Component should be a child of the nDisplay Root Actor's root component, not of the screen mesh.
2. **Genlock misconfiguration** — Without hardware genlock, frames will tear across LED panels. Ensure all GPUs are genlocked via SDI or NTP.
3. **Tracking latency** — High-latency tracking causes the inner frustum to lag behind camera movement. Target sub-frame latency (< 16ms at 60fps).
4. **LED wall moiré** — Camera shutter angle and LED refresh rate must be coordinated to avoid visible scan lines in footage.
5. **Color space mismatches** — Ensure the engine output color space matches your LED processor's expected input (typically sRGB or Rec.709).
