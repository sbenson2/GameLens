# G63 — In-Editor Animation Authoring (UE 5.6+)

> **Category:** guide · **Engine:** Unreal Engine 5.6+ · **Related:** [G4 Animation System](G4_animation_system.md) · [G26 Control Rig](G26_control_rig.md) · [G28 MetaHuman Integration](G28_metahuman_integration.md) · [G50 Sequencer & Cinematics](G50_sequencer_cinematics.md) · [Unreal Rules](../unreal-arch-rules.md)

Unreal Engine 5.6 introduced a set of in-editor animation authoring tools that reduce the need for DCC round-tripping (exporting to Maya/Blender and reimporting). These tools let artists sculpt morph targets, edit skeletal meshes, and blend between gameplay and cinematic animation directly inside the Unreal Editor. UE 5.7 expanded these with workflow refinements, a Morph Target Viewer, and the Rig Mapper. This guide covers the Skeletal Mesh Editor morph sculpting tools, the Sequencer Anim Mixer plugin, and production workflows.

---

## What Changed

| Version | Feature | Status |
|---------|---------|--------|
| UE 5.6 | Morph target sculpting in Skeletal Mesh Editor | Experimental |
| UE 5.6 | Sequencer Anim Mixer plugin | Experimental |
| UE 5.6 | MetaHuman Creator integrated in-editor | Production |
| UE 5.7 | Morph Target Viewer with weight sliders | Experimental |
| UE 5.7 | Rig Mapper (ARKit ↔ MetaHuman retargeting) | Experimental |
| UE 5.7 | Seamless bone/weight ↔ sculpt workflow switching | Experimental |
| UE 5.7 | MetaHuman Python/Blueprint automation API | Beta |

---

## Morph Target Sculpting in the Skeletal Mesh Editor

### Overview

Prior to UE 5.6, creating or editing morph targets (blend shapes) required exporting to a DCC tool, sculpting the deformation, re-exporting as FBX, and reimporting. The new **Skeletal Mesh Editor** sculpting tools allow direct creation and modification of morph targets on any skeletal mesh inside the editor.

### Enabling the Feature

1. Edit → Plugins → search "SkeletalMeshModelingTools" → enable
2. Restart the editor
3. Open any Skeletal Mesh asset → the toolbar gains sculpting icons

### Sculpting Workflow

```
┌──────────────────────────────────────────────────┐
│             Skeletal Mesh Editor                   │
│                                                    │
│  1. Open Skeletal Mesh asset                       │
│  2. Select a morph target (or create new)          │
│  3. Choose sculpt brush (Move, Smooth, Inflate)    │
│  4. Paint deformations on the mesh surface         │
│  5. Preview with weight slider (0.0 → 1.0)        │
│  6. Save — morph target stored in the asset        │
└──────────────────────────────────────────────────┘
```

### Available Brush Types

| Brush | Effect | Use case |
|-------|--------|----------|
| **Move** | Displaces vertices along the brush stroke | Primary sculpting — push/pull surface |
| **Smooth** | Averages vertex positions under the brush | Clean up harsh deformations |
| **Inflate** | Pushes vertices along their normals | Puffing out cheeks, muscle flex shapes |
| **Flatten** | Levels vertices to a plane | Corrective shapes for joint compression |
| **Pinch** | Pulls vertices toward the brush center | Sharpening creases, wrinkle shapes |

### Creating a New Morph Target

```
Skeletal Mesh Editor → Morph Targets panel → "+" button → Name it
  (e.g., "Face_SmileLeft", "Body_FlexBicep")
→ Select the new target → begin sculpting
```

### Corrective Morph Targets

Corrective morphs fix mesh deformation at extreme joint angles (e.g., elbow collapse at 150°). The workflow:

1. Pose the skeleton to the problem angle using the built-in posing tools
2. Create a new morph target named with a corrective convention (e.g., `Corrective_Elbow_L_150`)
3. Sculpt the fix while viewing the deformed pose
4. In the Animation Blueprint, drive the corrective morph via a `Pose Driver` node keyed to the joint rotation

### UE 5.7 Improvements

**Morph Target Viewer** — a panel showing all morph targets on the mesh with weight sliders. Artists can preview combinations of morphs simultaneously without entering Play mode.

**Seamless workflow switching** — in 5.6, switching between bone placement, weight painting, and morph sculpting required closing and reopening different editors. In 5.7, all three modes live in the Skeletal Mesh Editor with tab switching.

**Rig Mapper** (Experimental) — maps facial animation between ARKit blend shapes and MetaHuman face rig, enabling morph targets sculpted for ARKit to drive MetaHuman expressions and vice versa.

---

## Sequencer Anim Mixer Plugin (UE 5.6+)

### Problem

Transitioning between gameplay animation (driven by Animation Blueprint / Motion Matching) and cinematic animation (driven by Sequencer) often produces visible pops or requires hand-authored transition animations.

### Solution

The **Sequencer Anim Mixer** plugin blends gameplay and Sequencer animation tracks together at runtime, enabling seamless transitions without camera cuts.

### Enabling

1. Edit → Plugins → "SequencerAnimMixer" → enable
2. Restart editor

### How It Works

```
┌────────────────────┐     blend weight      ┌─────────────────────┐
│ Gameplay Animation │ ◀──── 1.0 → 0.0 ────▶│ Sequencer Animation  │
│ (AnimBP / Motion   │       (over N frames)  │ (Level Sequence)     │
│  Matching / ABP)   │                        │                       │
└────────────────────┘                        └─────────────────────┘
```

During gameplay, the character runs their normal Animation Blueprint. When a cinematic trigger fires:

1. The Sequencer Anim Mixer interpolates the blend weight from gameplay (1.0) to cinematic (0.0) over a configurable duration
2. Motion Matching can find the best transition pose before handing off
3. At the end of the cinematic, the reverse blend plays — cinematic → gameplay
4. The result: no camera cuts, no pop, no hand-authored transition anims

### Integration Points

| System | Integration |
|--------|-------------|
| Motion Matching | The mixer queries the Motion Matching database for the closest pose to the cinematic's first frame before blending |
| Control Rig | Procedural IK adjustments (foot placement, hand IK) can layer on top of the blended result |
| Sequencer | Anim tracks in Level Sequences feed directly into the mixer |
| Gameplay Abilities | GAS can trigger cinematic sequences, and the mixer handles the animation transition |

---

## MetaHuman In-Editor Authoring (UE 5.6+)

Starting in UE 5.6, **MetaHuman Creator** is integrated directly into the Unreal Editor as a plugin rather than requiring the separate web-based tool. Key capabilities:

- **Face sculpting** — adjust facial proportions, features, and expressions in-editor
- **Body customization** — body sliders and modifiers for height, build, proportions
- **Clothing system** — outfits automatically shape and fit to custom body proportions
- **Hair and groom** — select and customize hair assets with per-strand control

### UE 5.7: MetaHuman Blueprint/Python API

UE 5.7 added programmatic access to MetaHuman creation and editing:

```python
# Python example: batch-create MetaHuman variants
import unreal

metahuman_factory = unreal.MetaHumanCreatorSubsystem()
base_identity = unreal.load_asset("/Game/MetaHumans/BaseCharacter/Face/MetaHumanIdentity")

# Create a variant with modified facial features
variant = metahuman_factory.duplicate_identity(base_identity, "Variant_01")
metahuman_factory.set_facial_parameter(variant, "JawWidth", 0.7)
metahuman_factory.set_facial_parameter(variant, "NoseBridgeWidth", 0.4)
metahuman_factory.build_metahuman(variant, "/Game/MetaHumans/Variant_01")
```

> **Note:** The Python API was introduced in UE 5.7 as Beta. Method names and parameter lists may change. Always check the `MetaHumanCreatorSubsystem` class documentation for your engine version.

### Blueprint API

The same operations are available via Blueprint nodes:

- **Duplicate MetaHuman Identity** — creates a new identity from an existing one
- **Set Facial Parameter** — adjusts individual facial features by name and value
- **Build MetaHuman** — assembles the full character (mesh, materials, groom) from an identity

This enables procedural NPC generation, character customization screens, and batch asset creation in CI pipelines.

---

## Production Workflow: DCC-Free Character Iteration

```
┌─────────────────────────────────────────────────────────────┐
│  Traditional (Pre-5.6)            In-Editor (5.6+)          │
│                                                              │
│  1. Model in Maya/Blender         1. Import base mesh once   │
│  2. Sculpt morphs in Maya         2. Sculpt morphs in-editor │
│  3. Export FBX                    3. Preview instantly        │
│  4. Import to UE                  4. Iterate in seconds       │
│  5. Test in-engine                5. Done                     │
│  6. Find issue → goto 2                                      │
│                                                              │
│  Iteration time: 10-30 min       Iteration time: 30-60 sec   │
└─────────────────────────────────────────────────────────────┘
```

### When to Use In-Editor vs. DCC

| Use in-editor authoring | Use DCC tools |
|-------------------------|---------------|
| Corrective morph targets for joint deformation | Base mesh modeling and topology changes |
| Facial expression blend shapes (especially MetaHuman) | Complex UV unwrapping and re-topology |
| Quick iteration on morph target adjustments | Rigging from scratch (skeleton creation) |
| Cinematic animation blending (Sequencer Anim Mixer) | Keyframe animation authoring |
| Procedural MetaHuman variant generation | Cloth simulation baking |

---

## Common Pitfalls

| Issue | Solution |
|-------|----------|
| Sculpted morphs don't appear at runtime | Ensure the morph target is referenced in the Animation Blueprint's `Set Morph Target` or Pose Driver node |
| Performance cost of many active morphs | Morph targets have a per-vertex GPU cost; use LOD thresholds to disable morphs at distance |
| Sequencer Anim Mixer produces foot sliding | Layer foot IK (Control Rig) on top of the blended output |
| MetaHuman API methods not found | Verify the `MetaHumanCreator` plugin is enabled and you're on UE 5.7+ |
| Morph sculpts lost after mesh reimport | In-editor morphs are stored in the UAsset; reimporting the source FBX can overwrite them. Use **"Keep Existing Morph Targets"** option in the import dialog |

---

## Version Compatibility

| Feature | 5.5 | 5.6 | 5.7 |
|---------|-----|-----|-----|
| Skeletal Mesh Editor sculpting | — | Experimental | Experimental (improved) |
| Morph Target Viewer | — | — | Experimental |
| Sequencer Anim Mixer | — | Experimental | Experimental |
| MetaHuman in-editor | — | Production | Production |
| MetaHuman Python/BP API | — | — | Beta |
| Rig Mapper | — | — | Experimental |
