# Motion Design Plugin

> **Category:** guide · **Engine:** Unreal Engine · **Related:** [G17 Niagara VFX System](G17_niagara_vfx_system.md), [G18 Material System & Shaders](G18_material_system_shaders.md), [G24 MetaSounds Audio Engine](G24_metasounds_audio_engine.md)

The Motion Design plugin (originally codenamed "Project Avalanche") brings real-time motion graphics capabilities to Unreal Engine, comparable to Cinema 4D's MoGraph toolset. Introduced in UE 5.4, it reached **Beta** in UE 5.6 and is **production-ready** as of UE 5.7. It targets broadcast graphics, title sequences, data visualization, and procedural animation workflows.

---

## Core Concepts

Motion Design is built around three pillars: **Cloners** that duplicate geometry procedurally, **Effectors** that animate and transform those clones, and **Sequencer integration** that ties everything into Unreal's timeline system.

### Cloners

Cloners duplicate a source mesh (or multiple meshes) into patterns. Under the hood, they are built on top of the **Niagara particle system**, which means they inherit GPU-accelerated instancing and can handle thousands of clones efficiently.

**Layout modes:**

| Layout | Description | Use Case |
|--------|-------------|----------|
| Grid | 3D grid arrangement | Data visualization, walls of screens |
| Circle | Radial distribution | Clock faces, loading spinners |
| Line | Linear array | Tickers, progress bars |
| Sphere | Spherical distribution | Globe visualizations, particle clouds |
| Honeycomb | Hex-packed grid | Tile patterns, organic layouts |
| Mesh | Clones positioned on target mesh surface | Conform graphics to 3D shapes |
| Spline | Distributed along a spline | Paths, trails, animated ribbons |

```
// Blueprint: Create a Grid Cloner
1. Place a Motion Design Cloner actor in your level
2. Set Layout → Grid
3. Assign your source mesh(es) in the Mesh Array
4. Adjust Count X/Y/Z and Spacing
5. The clones appear immediately in the viewport
```

### Effectors

Effectors modify clone properties (position, rotation, scale, color, visibility) based on spatial rules or animation curves. Multiple effectors can be stacked and blended.

**Built-in Effector Types (UE 5.5+):**

- **Radial** — Displaces clones outward from a point, useful for explosions or reveals
- **Noise** — Applies Perlin/Simplex noise to clone transforms
- **Step** — Sequential activation with offset timing (domino/cascade effects)
- **Target** — Morphs clones toward a target mesh or point cloud
- **Time** — Oscillates clone properties over time (sine, sawtooth, etc.)
- **Push Apart** — Prevents clone overlap with spatial separation (new in UE 5.5)
- **Particle Color** — Overrides clone material color per-instance (new in UE 5.5)
- **Invert Volume** — Inverts effector influence inside/outside a volume (new in UE 5.5)

### Effector Forces

Effector Forces add physics-like behavior without full simulation:

- **Gravity** — Constant directional force
- **Attract** — Pull clones toward a point
- **Vortex** — Spiral motion around an axis
- **Turbulence** — Chaotic displacement

## Sequencer Integration

Motion Design actors are fully keyframable in Sequencer. Key workflow:

1. **Drag Cloner/Effector** into a Level Sequence
2. **Keyframe effector parameters** (magnitude, falloff, offset) over time
3. **Use Sequencer curves** for precise easing and timing
4. **Blend between layouts** by keyframing the Cloner's Layout Type blend weight

This enables frame-accurate control while preserving the procedural nature of the system — you animate parameters, not individual clones.

## Material Designer

The Motion Design plugin includes a **Material Designer** for creating dynamic shaders through a node-based workflow inside UE. It is optimized for motion graphics use cases:

- Per-clone color variation using clone index or world position
- Animated UV effects (scrolling, distortion, pulsing)
- Procedural patterns (stripes, grids, gradients)
- Alpha masking for reveal animations

```
// Material Designer Workflow
1. Open the Material Designer panel (Window → Motion Design → Material Designer)
2. Create a new Material Function
3. Use Clone Index and Clone Count nodes for per-instance variation
4. Connect to Base Color, Emissive, or Opacity
5. Assign the material to your Cloner's source mesh
```

## Broadcast Graphics (Transition Logic)

UE 5.5 introduced **Transition Logic**, a system for live broadcast graphics:

- **States** — Define discrete visual states (e.g., "In", "Out", "Loop")
- **Transitions** — Animated blends between states, triggered by external signals
- **Data Binding** — Connect live data feeds (scores, tickers, names) to text and graphics
- **External Control** — Trigger transitions via OSC, NDI, or custom protocols

This enables Unreal to serve as a real-time broadcast graphics engine, replacing traditional CG systems like Vizrt or Ross Video.

### Typical Broadcast Workflow

```
1. Design graphics using Cloners, Effectors, and UMG widgets
2. Define States in the Transition Logic graph (In → Loop → Out)
3. Bind data sources to text/number fields
4. Configure external triggers (OSC port, HTTP endpoint)
5. Run in Pixel Streaming or SDI output for live broadcast
```

## Setting Up Motion Design

### Enable the Plugin

**Edit → Plugins → Motion Design** — Enable and restart the editor.

### Switch to Motion Design Mode

UE provides a dedicated editor mode: **Mode Selector → Motion Design**. This customizes the viewport and panels for motion graphics work, hiding game-specific tools.

### Recommended Project Settings

```ini
# DefaultEngine.ini — Niagara must be enabled (dependency)
[/Script/Engine.RendererSettings]
r.Nanite.Enable=1           # Recommended for high clone counts
r.VirtualTextures=True       # For complex materials on many instances
```

## Performance Tips

- **Clone count** — Niagara-backed cloners handle 10,000+ instances on modern GPUs, but profile with `stat Niagara`
- **LOD awareness** — Use Nanite meshes as clone sources for automatic LOD
- **Effector stacking** — Each effector adds a Niagara module pass; keep stacks under 5–6 for real-time
- **Material complexity** — Per-clone material variation is cheap (instanced params), but translucent overdraw is not
- **Sequencer baking** — For cinematic renders, bake Cloner transforms to static meshes via **Bake to Static Mesh** for maximum performance

## Common Patterns

### Score Bug (Broadcast)
```
Cloner (Line, 2 items) → [Team Logo Mesh, Score Text]
  └─ Step Effector (stagger = 0.1s) for entrance animation
  └─ Transition Logic: In → Loop → ScoreUpdate → Out
```

### Data Visualization Grid
```
Cloner (Grid, 100×1×1) → Bar Mesh
  └─ Step Effector (driven by data array) for bar heights
  └─ Particle Color Effector for value-based coloring
```

### Title Sequence Reveal
```
Cloner (Mesh layout on text geometry) → Cube Mesh
  └─ Noise Effector (animated magnitude: 1 → 0) for settle
  └─ Radial Effector (animated: expand → contract) for drama
```

## Version History

| Version | Status | Key Changes |
|---------|--------|-------------|
| UE 5.4 | Experimental | Initial release (as "Project Avalanche"), Cloners, Effectors, basic Sequencer |
| UE 5.5 | Experimental | Transition Logic, Push Apart/Particle Color/Invert Volume effectors, Material Designer |
| UE 5.6 | **Beta** | Mesh layout for Cloners, stability improvements, Effector Force system |
| UE 5.7 | **Production-Ready** | Full Sequencer branching dialogue support, animation mixing, production stability |

## Further Reading

- [Epic Official: Motion Design in Unreal Engine](https://dev.epicgames.com/documentation/en-us/unreal-engine/motion-design-in-unreal-engine)
- [Epic Official: Motion Design Quickstart Guide](https://dev.epicgames.com/documentation/en-us/unreal-engine/motion-design-quickstart-guide-in-unreal-engine)
- [Epic Official: Cloners and Effectors](https://dev.epicgames.com/documentation/en-us/unreal-engine/motion-design-cloners-and-effectors-in-unreal-engine)
- [The Pixel Lab: Unreal Engine Avalanche → Motion Design](https://www.thepixellab.net/unreal-engine-avalanche-motion-design)
