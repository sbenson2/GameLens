# G28 — MetaHuman Integration in Unreal Engine 5

> **Category:** guide · **Engine:** Unreal Engine 5.4+ · **Related:** [G4 Animation System](G4_animation_system.md) · [G26 Control Rig](G26_control_rig.md) · [G9 Rendering Nanite Lumen](G9_rendering_nanite_lumen.md) · [Architecture Overview](../architecture/E1_architecture_overview.md) · [Unreal Rules](../unreal-arch-rules.md)

MetaHuman is Epic's framework for creating and integrating photorealistic digital humans in Unreal Engine. It provides a full character pipeline — from cloud-based face creation to in-editor customization, Mesh-to-MetaHuman conversion, runtime animation, and performance capture. This guide covers the MetaHuman architecture, integration workflow, the MetaHuman Identity pipeline, animation systems, optimization, and production best practices.

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                    MetaHuman Pipeline                         │
│                                                               │
│  ┌─────────────────────┐                                     │
│  │ MetaHuman Creator   │  (Cloud / In-Editor Plugin)         │
│  │ • Face sculpting    │                                     │
│  │ • Body selection    │                                     │
│  │ • Hair/clothing     │                                     │
│  └──────────┬──────────┘                                     │
│             │ export                                          │
│             ▼                                                 │
│  ┌─────────────────────┐    ┌──────────────────────────┐    │
│  │ MetaHuman Identity  │───▶│ Skeletal Mesh + Groom    │    │
│  │ (face DNA asset)    │    │ (body, face, hair, eyes) │    │
│  └──────────┬──────────┘    └──────────┬───────────────┘    │
│             │                          │                      │
│             ▼                          ▼                      │
│  ┌─────────────────────┐    ┌──────────────────────────┐    │
│  │ MetaHuman Component │    │ Animation Blueprint       │    │
│  │ (runtime driver)    │    │ (face + body + Control Rig│    │
│  └─────────────────────┘    └──────────────────────────┘    │
│             │                          │                      │
│             └──────────┬───────────────┘                      │
│                        ▼                                      │
│  ┌─────────────────────────────────────────────────────┐     │
│  │  Final Character (in-game or cinematic)              │     │
│  │  • LOD system (4 LODs for face)                     │     │
│  │  • Strand-based hair (Groom) or cards               │     │
│  │  • Real-time facial animation via Live Link          │     │
│  └─────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────┘
```

---

## Key Components

| Component | Role |
|-----------|------|
| **MetaHuman Creator** | Cloud service (or in-editor plugin from UE 5.6+) for authoring faces and bodies. Outputs a complete character package. |
| **MetaHuman Identity** | A `UMetaHumanIdentity` asset that encodes the facial DNA — the mathematical representation of a face. Used by Mesh-to-MetaHuman. |
| **MetaHuman Blueprint** | The character Blueprint shipped with each MetaHuman. Contains Skeletal Mesh, Groom, Animation Blueprint, and physics assets. |
| **Groom System** | Strand-based hair/beard/eyebrows. Uses Niagara for simulation and a dedicated rendering path. |
| **Face Control Rig** | A Control Rig driving ~700 facial controls for cinematic animation and FACS-based expressions. |
| **Live Link** | Real-time facial motion capture input (iPhone ARKit, Faceware, Rokoko) streamed into the face rig at runtime. |
| **MetaHuman Plugin** | Editor plugin providing Mesh-to-MetaHuman, batch processing, and the MetaHuman Creator integration. Requires `MetaHumanCreatorCoreData` installed via the Launcher. |

---

## Integration Workflow

### Method 1: MetaHuman Creator (Cloud / In-Editor)

1. **Create** — Open MetaHuman Creator (via Fab or the in-editor plugin in UE 5.6+). Sculpt a face, choose body type, select hair/clothing.
2. **Download** — Download the MetaHuman via Fab (formerly Quixel Bridge). This adds the character to your project's `Content/MetaHumans/` folder.
3. **Place** — Drag the MetaHuman Blueprint into your level. It includes the full skeletal mesh hierarchy, groom, and animation setup.
4. **Customize** — Swap clothing, adjust materials, or modify the Animation Blueprint for your gameplay needs.

### Method 2: Mesh to MetaHuman

Convert a custom sculpt or 3D scan into a fully rigged MetaHuman:

1. **Prepare the mesh** — Import your head mesh (OBJ/FBX) into UE. It should be a closed mesh with clean topology, roughly head-sized, centered at origin.
2. **Create MetaHuman Identity** — Right-click in Content Browser → MetaHuman → MetaHuman Identity. Name it (e.g., `MHI_CustomCharacter`).
3. **Configure the Identity** — In the Identity asset, set the source mesh. The system auto-detects facial landmarks.
4. **Promote to MetaHuman** — Click "Promote" in the Identity editor. This uploads the facial DNA to the cloud, conforms it to the MetaHuman template, and generates a full MetaHuman with your custom face.
5. **Download and iterate** — The resulting MetaHuman appears in your project, fully rigged and animation-ready.

### Method 3: Automation API (UE 5.4+)

For studios with many characters, MetaHuman provides a Blueprint/Python API for batch operations:

```python
# Python example — batch-process MetaHuman identities
import unreal

mh_subsystem = unreal.get_editor_subsystem(unreal.MetaHumanIdentityEditorSubsystem)

# Create an identity from mesh
identity = mh_subsystem.create_identity_from_mesh(
    mesh_path="/Game/Scans/HeadScan_001",
    identity_name="MHI_Character_001"
)

# Promote to full MetaHuman
mh_subsystem.promote_identity(identity)
```

---

## MetaHuman Character Structure

A downloaded MetaHuman Blueprint contains this hierarchy:

```
BP_MetaHuman_CharacterName
├── Body (USkeletalMeshComponent)
│   └── SK_Body — full body skeletal mesh
├── Face (USkeletalMeshComponent)
│   └── SK_Face — high-detail face mesh (~30K triangles at LOD0)
├── Hair (UGroomComponent)
│   └── Strand-based hair groom asset
├── Eyebrows (UGroomComponent)
├── Eyelashes (UGroomComponent)
├── Torso / Legs / Feet (USkeletalMeshComponent)
│   └── Clothing skeletal meshes (leader-pose from Body)
└── Animation Blueprint
    └── ABP_MetaHuman — drives face + body animation
```

### Leader Pose Component Pattern

MetaHuman uses **Leader Pose** to synchronize multiple skeletal meshes to a single skeleton:

```cpp
// All mesh components follow the Body's animation
FaceMeshComp->SetLeaderPoseComponent(BodyMeshComp);
TorsoMeshComp->SetLeaderPoseComponent(BodyMeshComp);
```

This avoids running separate animation evaluations for each mesh while allowing independent materials and LODs.

---

## Animation Integration

### Facial Animation — Control Rig

MetaHuman ships with a face Control Rig containing approximately 700 controls mapped to FACS (Facial Action Coding System) action units. This rig powers:

- **Sequencer keyframe animation** — animate individual face controls on the timeline
- **Live Link facial capture** — stream ARKit blendshapes (from iPhone) or Faceware data to the face rig
- **Procedural expressions** — drive eye blinks, lip sync, and micro-expressions from gameplay code

### Body Animation

The body uses a standard UE5 Animation Blueprint with these layers:

1. **Locomotion** — State Machine with Blend Spaces for walk/run/idle
2. **Upper body overlay** — Layered Blend per Bone for gestures while moving
3. **Face layer** — Control Rig node evaluating the face rig
4. **Post-process** — Foot IK, look-at via Control Rig

### Live Link Setup

```
1. Enable Live Link plugin + MetaHuman plugin
2. In Live Link panel, add a Source (e.g., "Apple ARKit Face" from iPhone)
3. In the face Animation Blueprint, add a Live Link Pose node
4. Map incoming blendshapes to face Control Rig controls
5. The face animates in real-time from the capture source
```

---

## Performance & Optimization

MetaHuman characters are expensive by default. Here's how to ship them in a game:

### LOD System

MetaHuman face meshes ship with 4 LOD levels:

| LOD | Triangles (face) | Use Case |
|-----|------------------|----------|
| LOD0 | ~30,000 | Close-up / cinematic |
| LOD1 | ~12,000 | Medium distance gameplay |
| LOD2 | ~5,000 | Far NPCs |
| LOD3 | ~2,000 | Distant / crowd |

Set LOD transition distances in the Skeletal Mesh asset. For gameplay, default to LOD1 to save ~18K triangles per character.

### Hair Optimization

| Approach | Quality | Cost | When to Use |
|----------|---------|------|------------|
| Strand-based Groom | Highest | Very high (GPU) | Hero character close-ups, cinematics |
| Hair Cards | Good | Low | Gameplay characters, NPCs, mobile |
| Hybrid | High | Medium | Hero in gameplay — strands for LOD0, cards for LOD1+ |

To switch to hair cards, replace the `UGroomComponent` with a `USkeletalMeshComponent` using a card-based hair mesh.

### Rendering Cost Breakdown

| Feature | Approximate GPU Cost (1080p) | Mitigation |
|---------|------------------------------|-----------|
| Face mesh (LOD0) | ~1.5ms | Use LOD1 for gameplay |
| Strand hair (10K strands) | ~2-4ms | Switch to cards at distance |
| Subsurface scattering skin | ~0.5ms | Simplify shader for distant LODs |
| Eye caustics + refraction | ~0.3ms | Disable for non-hero characters |

### Practical Budget

For a game targeting 60fps at 1080p with multiple MetaHuman characters:

- **Hero character:** LOD0 face + strand hair = ~4ms GPU budget
- **NPCs (3-5 on screen):** LOD1 face + card hair = ~1ms each
- **Crowd (10+):** LOD2/LOD3 face + simple card hair = ~0.3ms each

---

## Gameplay Integration Patterns

### Using MetaHuman as a Player Character

```cpp
// Your character class setup
AMyCharacter::AMyCharacter()
{
    // MetaHuman mesh components are set up in the Blueprint
    // In C++, reference the body mesh for gameplay logic:
    BodyMesh = CreateDefaultSubobject<USkeletalMeshComponent>(TEXT("Body"));
    SetRootComponent(BodyMesh);
    
    // Capsule for collision (MetaHumans don't ship with a capsule)
    CapsuleComp = CreateDefaultSubobject<UCapsuleComponent>(TEXT("Capsule"));
    CapsuleComp->SetupAttachment(RootComponent);
    CapsuleComp->InitCapsuleSize(34.f, 88.f);
}
```

### Driving Facial Expressions from Gameplay

```cpp
// Set a FACS-based expression via the face Control Rig
void AMyCharacter::SetExpression(FName ControlName, float Value)
{
    if (UControlRigComponent* FaceRig = FindComponentByClass<UControlRigComponent>())
    {
        FaceRig->SetControlFloat(ControlName, Value);
    }
}

// Usage: surprise expression
SetExpression(TEXT("CTRL_L_brow_raiseIn"), 0.8f);
SetExpression(TEXT("CTRL_R_brow_raiseIn"), 0.8f);
SetExpression(TEXT("CTRL_jaw_open"), 0.4f);
```

### Lip Sync

For dialogue-heavy games, use one of these approaches:

1. **Live Link (real-time)** — Stream facial capture during recording sessions, bake to Sequencer
2. **Audio-driven** — Use the `OVRLipSync` plugin or MetaHuman's built-in audio-to-face mapping
3. **Curve-driven** — Author viseme curves in an animation sequence, drive face controls via the Animation Blueprint

---

## Common Pitfalls

| Problem | Cause | Fix |
|---------|-------|-----|
| MetaHuman not appearing after download | `MetaHumanCreatorCoreData` not installed | Install via Epic Games Launcher → UE install options |
| Face mesh flickering | Z-fighting between face and body meshes | Ensure correct render order; face mesh renders after body |
| Strand hair invisible in packaged build | Groom plugin not enabled in shipping config | Add `HairStrands` to `EnabledPlugins` in `.uproject` or switch to cards |
| Performance drops with multiple MetaHumans | LOD0 + strand hair on all characters | Implement aggressive LOD transitions; use cards for non-hero characters |
| Facial animation jittering | Live Link frame rate mismatch | Set Live Link to interpolate; match capture FPS to game tick rate |
| Mesh-to-MetaHuman fails | Input mesh not centered, too many vertices, or open edges | Clean mesh: center at origin, <50K vertices, closed manifold |

---

## Version History

| UE Version | MetaHuman Changes |
|------------|-------------------|
| 5.0 | Initial MetaHuman support via Quixel Bridge |
| 5.2 | Mesh to MetaHuman workflow introduced |
| 5.4 | Automation API for batch processing; improved LOD system |
| 5.5 | MetaHuman preview release with enhanced facial rigging |
| 5.6 | In-editor MetaHuman Creator plugin (no browser needed); workflow changes to Identity pipeline |
| 5.7 | Linux/macOS support for MetaHuman Creator plugin; new body types |

---

## Further Reading

- [MetaHuman Documentation (Epic)](https://dev.epicgames.com/documentation/en-us/metahuman/metahuman-documentation) — official reference
- [MetaHuman Identity Asset](https://dev.epicgames.com/documentation/en-us/metahuman/metahuman-identity-asset) — Mesh-to-MetaHuman deep dive
- [MetaHuman 5.7 Release Notes](https://www.metahuman.com/en-US/releases/metahuman-5-7-is-now-available) — latest features
- [Mesh to MetaHuman Workflow](https://dev.epicgames.com/documentation/en-us/metahuman/from-mesh) — custom character pipeline
- [G4 Animation System](G4_animation_system.md) — UE5 animation fundamentals
- [G26 Control Rig](G26_control_rig.md) — Control Rig for facial and procedural animation
- [G17 Niagara VFX System](G17_niagara_vfx_system.md) — Niagara powers Groom hair simulation
