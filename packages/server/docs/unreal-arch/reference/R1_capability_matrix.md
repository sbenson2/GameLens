# R1 — Unreal Engine 5 Capability Matrix

> **Category:** reference · **Engine:** Unreal Engine 5.4+ · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Unreal Rules](../unreal-arch-rules.md)

A quick-reference table of Unreal Engine 5's major subsystems, the recommended approach for each, legacy alternatives to avoid, and when each choice applies. Use this when starting a project, evaluating a system, or migrating from UE4 patterns.

---

## Subsystem Decision Matrix

### Programming Model

| Need | Recommended | Legacy / Avoid | Notes |
|------|-------------|----------------|-------|
| General gameplay logic | C++ base class + Blueprint child | Blueprint-only for core systems | C++ for architecture, Blueprint for content and tuning |
| Abilities, buffs, cooldowns | Gameplay Ability System (GAS) | Hardcoded ability logic in Character | Data-driven, replicated, composable — standard for action games |
| Reusable game subsystems | `UGameInstanceSubsystem` / `UWorldSubsystem` | Singleton actors, static globals | Subsystems are lifecycle-managed and automatically scoped |
| Data assets (configs, stats) | `UDataAsset` / `UDataTable` | Hardcoded values in C++ | Editable in editor; data tables support CSV import |
| Plugin / module boundaries | Gameplay Modules with explicit dependencies | Everything in one module | Improves compile times; enforces architectural boundaries |

### Rendering

| Need | Recommended | Legacy / Avoid | Notes |
|------|-------------|----------------|-------|
| High-poly meshes (millions of triangles) | Nanite (virtualized geometry) | Manual LOD chains | Nanite eliminates manual LOD setup; auto-streams geometry |
| Dynamic global illumination | Lumen | Baked lightmaps (for desktop/console) | Lumen is fully dynamic — no lightmap baking needed |
| High-quality shadows | Virtual Shadow Maps (VSM) | Cascaded Shadow Maps | VSM provides consistent shadow resolution at all distances |
| Particle / VFX systems | Niagara | Cascade | Cascade is deprecated; Niagara is GPU-driven and extensible |
| Material authoring | Material Editor + Substrate (UE 5.5 beta) | Legacy material model | Substrate adds advanced layering; legacy still works |
| Post-processing | Post Process Volumes | — | Blendable per-volume; tone mapping, bloom, DoF, motion blur |
| Many dynamic lights (1000+) | Mega Lights (UE 5.5, experimental) | Standard deferred lighting | Enables thousands of textured area lights in real-time |
| Film-quality offline rendering | Path Tracer (DXR) | — | Production-ready in UE 5.5; physically accurate progressive renderer |

### World & Level Design

| Need | Recommended | Legacy / Avoid | Notes |
|------|-------------|----------------|-------|
| Large open worlds | World Partition | World Composition | World Partition auto-grids the world; streams cells on demand |
| Collaborative level editing | One File Per Actor (OFPA) | Monolithic level files | Each actor saves to its own file — reduces merge conflicts |
| Variant worlds (day/night, seasons) | Data Layers | Level Streaming Volumes | Data Layers load/unload content layers within one world |
| Procedural / runtime level assembly | Level Instances + PCG Framework | Manual actor spawning | PCG (Procedural Content Generation) is production-ready in UE 5.4+ |
| Cinematics & cutscenes | Sequencer | Matinee | Matinee is removed; Sequencer handles all cinematic authoring |

### Input

| Need | Recommended | Legacy / Avoid | Notes |
|------|-------------|----------------|-------|
| All player input | Enhanced Input System | Legacy `BindAction` / `BindAxis` | Asset-based: `UInputAction` + `UInputMappingContext` |
| Context-sensitive controls | Multiple `UInputMappingContext` with priority | Single monolithic input binding | Higher-priority contexts override lower ones |
| Gamepad, keyboard, touch | Enhanced Input with platform modifiers | Manual per-platform branching | Modifiers (dead zones, swizzle) handle platform differences |

### Physics & Collision

| Need | Recommended | Legacy / Avoid | Notes |
|------|-------------|----------------|-------|
| General rigid body simulation | Chaos (built-in) | PhysX (UE4 default) | Chaos is the UE5 default; PhysX is removed |
| Vehicle physics | Chaos Vehicles or Havok plugin | WheeledVehicleMovement (UE4) | Havok plugin offers more stable vehicle handling |
| Destruction / fracture | Chaos Destruction + Geometry Collections | Apex Destruction (UE4) | Voronoi fracture, runtime damage, anchor fields |
| Cloth simulation | Chaos Cloth | NvCloth / Apex Cloth | Integrated with Chaos solver |
| Ragdoll | Physics Asset + Chaos | PhysX ragdoll | Same Physics Asset workflow; Chaos backend |
| Collision queries (raycasts) | `LineTrace*ByChannel`, `Sweep*ByChannel` | — | Always use `AddIgnoredActor(this)` to prevent self-hits |
| Collision setup | Collision Presets (profiles) | Per-instance channel overrides | Centralized presets are maintainable at scale |

### Animation

| Need | Recommended | Legacy / Avoid | Notes |
|------|-------------|----------------|-------|
| Character animation | Animation Blueprints (ABP) | C++-only animation code | ABPs provide visual state machine + blend graph |
| State machines | Anim Graph state machines | Hardcoded transition logic | Visual, designer-friendly, supports nested state machines |
| Locomotion blending | Blend Spaces (1D / 2D) | Manual blend nodes | Parameterized blend by speed/direction |
| IK (foot placement, etc.) | Control Rig + Full-Body IK | FABRIK / Two-Bone IK alone | Control Rig is the production IK solution in UE5 |
| Montages (attacks, emotes) | Anim Montages with Notify events | Playing animations directly | Montages support sections, branching, and notifies |
| Skeletal mesh deformation | Deformer Graph (UE 5.4+) | Morph targets alone | GPU-evaluated deformations; ML deformer support |

### Audio

| Need | Recommended | Legacy / Avoid | Notes |
|------|-------------|----------------|-------|
| Sound design / audio logic | MetaSound | Sound Cues | MetaSound is a programmable DSP graph; Sound Cues are legacy |
| Spatial audio / attenuation | Sound Attenuation + MetaSound | Legacy Attenuation settings alone | MetaSound integrates spatialization natively |
| Music system | MetaSound + Quartz (music clock) | Matinee audio tracks | Quartz provides tempo-synced triggers and quantization |
| Audio mixing | Sound Mix / Submixes | — | Submixes handle volume ducking, effects chains |

### Networking & Multiplayer

| Need | Recommended | Legacy / Avoid | Notes |
|------|-------------|----------------|-------|
| Replication (state sync) | `UPROPERTY(Replicated)` / `ReplicatedUsing` | Manual RPC-only state sync | Property replication is bandwidth-efficient and reliable |
| Remote procedure calls | `UFUNCTION(Server/Client/NetMulticast)` | Custom message passing | Use RPCs for events; replication for continuous state |
| Player data (score, team) | `APlayerState` (auto-replicated) | Custom replicated actor | PlayerState persists across respawns |
| Match rules (server-only) | `AGameModeBase` (server-only, not replicated) | Replicated rule actor | GameMode runs only on the server — authoritative |
| Network prediction | Networked Physics Component (UE 5.4+) | Custom prediction/reconciliation | Built-in physics prediction with rollback |
| Large-scale multiplayer | Iris / MassEntity replication (experimental) | Default replication for 100+ players | Reduces per-player replication cost |

### UI

| Need | Recommended | Legacy / Avoid | Notes |
|------|-------------|----------------|-------|
| Game HUD, menus | UMG (Unreal Motion Graphics) | Slate for game UI | UMG is Blueprint-friendly; Slate is C++-only |
| Cross-platform UI (console/PC/mobile) | Common UI plugin | Raw UMG without input routing | CommonUI handles gamepad/mouse/touch focus navigation |
| Slate (C++ UI framework) | Editor tools, custom widgets | — | Slate is UMG's underlying layer; use directly for editor extensions |
| UI animations | UMG Animations + Sequencer | Code-driven widget animation | Visual timeline; supports easing curves |

### Save / Persistence

| Need | Recommended | Legacy / Avoid | Notes |
|------|-------------|----------------|-------|
| Persistent data across levels | `UGameInstance` subclass | Static globals, singletons | GameInstance survives level transitions |
| Save/load game state | `USaveGame` + `UGameplayStatics::SaveGameToSlot` | Manual file I/O | Built-in serialization; handles platform differences |
| Settings / preferences | `UGameUserSettings` | `SaveConfig()` on custom objects | Integrates with graphics/audio settings UI |
| Cloud saves | Platform SDK (Steam, EOS, console) | — | Serialize `USaveGame` to bytes, upload via platform API |

### Asset Management

| Need | Recommended | Legacy / Avoid | Notes |
|------|-------------|----------------|-------|
| Referencing large assets | `TSoftObjectPtr<>` / `TSoftClassPtr<>` | Hard `UObject*` references | Soft refs prevent loading entire dependency chains into memory |
| Async asset loading | Streamable Manager + soft refs | `ConstructorHelpers::FObjectFinder` at runtime | FObjectFinder only works in constructors |
| Asset marketplace | Fab (integrated in UE 5.5) | Quixel Bridge (standalone) | Drag-and-drop from Fab directly into the editor |
| Version control for content | Perforce (P4) or Git LFS | Git without LFS | Binary assets (`.uasset`) require LFS or Perforce |

---

## Platform Support (UE 5.5)

| Platform | Status | Notes |
|----------|--------|-------|
| Windows (64-bit) | Full support | Primary development platform |
| macOS | Full support | Metal rendering backend |
| Linux | Full support | Vulkan rendering backend |
| PlayStation 5 | Full support | Requires console dev program |
| Xbox Series X\|S | Full support | Requires console dev program |
| Nintendo Switch 2 | Expected support | Check Epic's latest announcements |
| iOS | Production support | Metal; mobile rendering path |
| Android | Production support | Vulkan / OpenGL ES; mobile rendering path |

---

## Feature Availability by UE5 Version

| Feature | 5.0 | 5.1 | 5.2 | 5.3 | 5.4 | 5.5 |
|---------|-----|-----|-----|-----|-----|------|
| Nanite | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Lumen | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ (60 Hz HWRT) |
| Virtual Shadow Maps | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| World Partition | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Enhanced Input | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Chaos Physics | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| MetaSound | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| PCG Framework | — | — | — | Beta | ✓ | ✓ |
| Control Rig | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Substrate (materials) | — | — | — | Exp. | Exp. | Beta |
| Mega Lights | — | — | — | — | — | Exp. |
| Path Tracer (production) | — | — | — | — | Beta | ✓ |
| Fab integration | — | — | — | — | — | ✓ |
| Networked Physics Prediction | — | — | — | — | ✓ | ✓ |
| Deformer Graph | — | — | — | — | ✓ | ✓ |

**Legend:** ✓ = Production-ready · Beta = Feature-complete, may have rough edges · Exp. = Experimental, API may change · — = Not available

---

## Migration Guide: UE4 → UE5

| UE4 System | UE5 Replacement | Migration Effort |
|-------------|-----------------|-----------------|
| PhysX | Chaos | Low — mostly automatic; test vehicle/ragdoll behavior |
| Legacy Input | Enhanced Input | Medium — rewrite input bindings; add Input Action assets |
| Cascade (particles) | Niagara | High — complete VFX rebuild; no automatic conversion |
| Matinee | Sequencer | Medium — Sequencer has a Matinee import tool |
| Sound Cues | MetaSound | Medium — rebuild audio graphs; Sound Cues still work |
| World Composition | World Partition | High — requires level restructuring |
| Manual LODs | Nanite | Low — import meshes; enable Nanite on Static Mesh |
| Baked Lightmaps | Lumen | Low — remove lightmap UVs; enable Lumen in Project Settings |
| Apex Destruction | Chaos Destruction | Medium — recreate as Geometry Collections |
