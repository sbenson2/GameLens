# Mocap Manager & Performance Capture Workflow

> **Category:** guide · **Engine:** Unreal Engine 5.6+ · **Related:** [G4 Animation System](G4_animation_system.md), [G28 MetaHuman Integration](G28_metahuman_integration.md), [G63 In-Editor Animation Authoring](G63_in_editor_animation_authoring.md)

The **Mocap Manager** is a first-party plugin introduced in UE 5.6 as part of the Performance Capture Workflow Plugin. It provides an end-to-end solution for visualizing, recording, and managing motion capture sessions directly inside the Unreal Editor — replacing the previous patchwork of Live Link panels, Take Recorder setup, and manual retargeting configuration.

---

## Plugin Activation

Enable these plugins in **Edit → Plugins** before using Mocap Manager:

| Plugin | Purpose |
|--------|---------|
| **Performance Capture Workflow** | Mocap Manager UI and session orchestration |
| **Live Link** | Real-time streaming protocol for body/face data |
| **Live Link Control Rig** (optional) | Drive Control Rig solvers from Live Link sources |
| **Take Recorder** | Bake streamed performances to animation assets |

After enabling, open Mocap Manager from **Window → Virtual Production → Mocap Manager**.

---

## Core Concepts

### 1. Sessions

A **Mocap Session** groups together all configuration for a single capture: which performers are active, which characters they drive, which Live Link subjects map to which skeleton, and which Take Recorder preset to use. Sessions persist between editor restarts.

### 2. Performers & Characters

- **Performer** — a real-world actor wearing a mocap suit, tracked headset, or phone running ARKit face tracking.
- **Character** — an in-engine Skeletal Mesh actor (typically a MetaHuman) that receives the performer's streamed data.

The Mocap Manager UI lets you bind performers to characters and configure the retargeting pipeline (IK Retargeter asset or Anim Blueprint).

### 3. Live Link Subjects

Each data stream appears as a **Live Link Subject** (e.g., `MocopiBody`, `ARKitFace`). Mocap Manager automatically discovers subjects when sources connect. The mapping panel lets you assign:

- **Body subject** → Skeletal Mesh body (via IK Retargeter)
- **Face subject** → Morph-target-driven face mesh (MetaHuman face component)

---

## Typical Workflow

### Step 1 — Connect Live Link Sources

Open the Live Link panel (**Window → Virtual Production → Live Link**) or let Mocap Manager discover sources automatically. Common source types:

| Source Type | Example Hardware/Software |
|-------------|--------------------------|
| `LiveLinkXR` | HTC Vive Trackers, Valve Index |
| `LiveLinkMvn` | Xsens MVN Animate |
| `LiveLinkRokoko` | Rokoko Smartsuit Pro |
| `LiveLinkARKit` | iPhone TrueDepth (Live Link Face app) |
| `LiveLinkOptitrack` | OptiTrack Motive |
| `LiveLinkMocopi` | Sony mocopi |

Sources must be on the same network as the editor machine, or connected via a local loopback.

### Step 2 — Configure Performer-to-Character Mapping

In the Mocap Manager panel:

1. Click **+ Add Performer** and give it a name.
2. Assign the Live Link subject(s) for body and face.
3. Assign the target Character actor in the level.
4. Select or create an **IK Retargeter** asset that maps the source skeleton to the MetaHuman skeleton.

For MetaHumans, Epic provides pre-built IK Retargeter assets for common mocap skeletons (Xsens, Rokoko, OptiTrack).

### Step 3 — Preview & Calibrate

Click **Preview** to see real-time retargeted motion on the character. Use the calibration tools to:

- Set the T-pose or A-pose reference for the performer.
- Adjust ground offset and scale.
- Fine-tune finger mapping if using glove data.

### Step 4 — Record with Take Recorder

Mocap Manager integrates directly with Take Recorder:

1. In the Mocap Manager panel, click **Record** (or open **Window → Cinematics → Take Recorder**).
2. Add sources via **+ Source → From LiveLink**.
3. Press the **Record** button. A countdown begins and all mapped Live Link subjects are recorded simultaneously.
4. Recorded data is saved as **Animation Sequence** assets in the project's `/Content/Cinematics/Takes/` directory (configurable).

```
Take Recorder writes one UAnimSequence per Live Link subject per take.
Body and face sequences can be combined in Sequencer using
an Animation Track layering approach.
```

### Step 5 — Edit in Sequencer

Drag recorded Animation Sequences into a Level Sequence:

- **Body track** — assign the baked body animation.
- **Face track** — assign the baked face morph target animation.
- Use Sequencer's **Additive** and **Override** section blending to layer hand-keyed corrections on top of mocap data.

---

## C++ Integration Points

### Adding a Custom Live Link Source

To create a proprietary mocap source, subclass `ULiveLinkSourceFactory`:

```cpp
// MyMocapSourceFactory.h
#pragma once
#include "LiveLinkSourceFactory.h"
#include "MyMocapSourceFactory.generated.h"

UCLASS()
class UMyMocapSourceFactory : public ULiveLinkSourceFactory
{
    GENERATED_BODY()
public:
    virtual FText GetSourceDisplayName() const override;
    virtual FText GetSourceTooltip() const override;

    // Called when user clicks "Add Source" in Live Link panel
    virtual TSharedPtr<ILiveLinkSource> CreateSource(
        const FString& ConnectionString) const override;
};
```

The source pushes frame data via `ILiveLinkClient::PushSubjectFrameData()`.

### Driving a Character from C++

To consume Live Link in an Animation Blueprint or C++:

```cpp
// In your AnimInstance
#include "LiveLinkInstance.h"

void UMyAnimInstance::NativeUpdateAnimation(float DeltaSeconds)
{
    Super::NativeUpdateAnimation(DeltaSeconds);

    FLiveLinkSubjectFrameData FrameData;
    if (GetAnimInstanceProxy()->GetLiveLinkClient()->
            EvaluateFrame_AnyThread(SubjectName, FrameData))
    {
        // FrameData.Transforms contains skeleton pose
        // Apply via FAnimNode_LiveLinkPose or manual retarget
    }
}
```

In practice, the `FAnimNode_LiveLinkPose` node in the Anim Graph handles this automatically — C++ access is for custom processing (filtering, recording, network relay).

---

## Blueprint Workflow

For Blueprint-only projects:

1. Add a **Live Link Component** to your character Blueprint.
2. In the component details, set the **Subject Name** to match your Live Link source.
3. In the character's **Animation Blueprint**, add a **Live Link Pose** node in the Anim Graph and connect it to the output pose.
4. For face tracking, use a **Modify Curve** node or a **Live Link Remap Asset** to map ARKit blend shapes to MetaHuman morph targets.

---

## Performance Considerations

| Concern | Mitigation |
|---------|------------|
| Multiple performers cause frame drops | Reduce Live Link evaluation rate to 30 Hz (default is engine tick rate) via `LiveLink.DefaultEvaluationRate` CVar |
| High-poly MetaHumans are expensive | Use LOD 1-2 during capture preview; full LOD for final rendering |
| Network latency introduces visible lag | Use **Live Link Interpolation Settings** to add a small buffer (2-3 frames) for smoother playback |
| Take Recorder generates large assets | Enable **Compression** in Take Recorder settings; use segment recording for long sessions |

---

## Troubleshooting

- **Subject not appearing**: Verify firewall allows UDP traffic on the Live Link port (default 11111). Check that source and editor are on the same subnet.
- **Retargeting looks wrong**: Ensure source and target skeletons share the same rest pose convention (T-pose vs A-pose). Recalibrate in Mocap Manager.
- **Face tracking jitters**: Apply a **One Euro Filter** via the Live Link Interpolation settings to smooth noisy ARKit data.
- **Take Recorder drops frames**: Increase the **Record Buffer Size** and close unnecessary editor tabs to reduce editor overhead during recording.

---

## Version History

| Version | Changes |
|---------|---------|
| UE 5.6 | Mocap Manager introduced as part of Performance Capture Workflow Plugin (Experimental). Live Link improvements for facial mocap. |
| UE 5.7 | Stability improvements. Better integration with MetaHuman Animator for in-editor facial retargeting. |

---

## Next Steps

- **[G28 MetaHuman Integration](G28_metahuman_integration.md)** — Full MetaHuman setup and customization.
- **[G63 In-Editor Animation Authoring](G63_in_editor_animation_authoring.md)** — Keyframe animation without DCC round-tripping.
- **[G50 Sequencer Cinematics](G50_sequencer_cinematics.md)** — Compositing and editing recorded takes.
