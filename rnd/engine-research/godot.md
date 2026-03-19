# Godot Engine Research

> **Status:** Phase 2 — Prototyping (3/~20 docs complete)  
> **Priority:** #1 (first engine expansion after MonoGame)  
> **Last Updated:** 2026-03-19  
> **Current Version:** Godot 4.4+ (4.6 in dev snapshots)

---

## 1. Engine Identity & Philosophy

### What Godot IS
- **Free, open-source** (MIT license) — no royalties, no per-seat fees, ever
- **Scene-tree architecture** — everything is a node, scenes are trees of nodes, scenes can be nested (composition)
- **Two scripting languages:** GDScript (Python-like, native) and C# (.NET 8+)
- **GDExtension** for native C/C++/Rust without recompiling the engine
- **2D-first design** — 2D isn't a flattened 3D plane (unlike Unity/Unreal). Dedicated 2D physics, rendering, coordinate system
- **Cross-platform:** Windows, macOS, Linux, Android, iOS, Web (GDScript only for web currently)
- **Lightweight:** ~40MB editor download, <30 second project startup

### What Godot is NOT
- Not ECS-based (node tree, not entity-component-system)
- Not designed for AAA 3D (improving rapidly, but Unity/Unreal still lead for photorealism)
- Not component-based like Unity (nodes ARE the components; scenes ARE the prefabs)

### Key Architectural Difference from MonoGame
MonoGame = blank canvas + library composition (Arch ECS, BrainAI, etc.)  
Godot = batteries-included editor + node tree + signals + built-in physics/rendering/UI

The MCP module needs to think in **nodes and scenes**, not entities and systems.

---

## 2. Core Architecture Patterns

### 2.1 The Node Tree (Fundamental Unit)
Everything in Godot inherits from `Node`. The game is a tree:
```
SceneTree (root)
└── Main (Node2D)
    ├── Player (CharacterBody2D)
    │   ├── Sprite2D
    │   ├── CollisionShape2D
    │   ├── AnimationPlayer
    │   └── StateMachine (Node)
    │       ├── IdleState
    │       ├── RunState
    │       └── JumpState
    ├── TileMapLayer
    ├── Enemies (Node2D)
    │   ├── Goblin (CharacterBody2D)
    │   └── Skeleton (CharacterBody2D)
    └── UI (CanvasLayer)
        ├── HealthBar (TextureProgressBar)
        └── ScoreLabel (Label)
```

**Key insight for MCP docs:** Godot developers think in terms of "what nodes do I need?" and "how do I wire them with signals?" — not "what components do I attach?"

### 2.2 Scenes as Reusable Prefabs
- A scene is a saved tree of nodes (`.tscn` file)
- Scenes can be instantiated (like prefabs) — `var enemy = enemy_scene.instantiate()`
- Scenes can contain other scenes (composition)
- **Best practice:** One scene per logical entity (Player.tscn, Enemy.tscn, Bullet.tscn, HUD.tscn)
- Scene inheritance exists but is less commonly used than composition

### 2.3 Signals (Observer Pattern, Built-in)
Godot's native event system. Replaces the need for explicit Observer/Event Bus patterns in most cases.
```gdscript
# Defining a signal
signal health_changed(new_health: int)

# Emitting
health_changed.emit(current_health)

# Connecting (in code)
player.health_changed.connect(_on_player_health_changed)

# Connecting (in editor)
# Inspector → Node → Signals → double-click to connect
```

**Pain point:** Developers coming from Unity over-use direct references instead of signals. Signals are Godot's PRIMARY decoupling mechanism.

### 2.4 Signal Bus (Autoload Pattern)
For cross-scene communication, use a global signal bus:
```gdscript
# events.gd — registered as Autoload "Events"
extends Node

signal player_died
signal score_changed(new_score: int)
signal level_completed(level_id: int)
signal item_picked_up(item_data: ItemData)
```
Register in Project Settings → Autoload. Access globally: `Events.player_died.emit()`

### 2.5 Autoloads (Singletons)
Nodes registered as Autoloads persist across scene changes and are globally accessible:
- **GameManager** — game state, score, progression
- **AudioManager** — music/SFX with crossfading
- **SaveManager** — save/load with `ResourceSaver`/`ConfigFile`
- **Events** — signal bus (see above)

**Anti-pattern:** Too many autoloads. If everything is global, nothing is modular. Rule of thumb: ≤5 autoloads for most projects.

### 2.6 Custom Resources (.tres / .res)
Godot's data-driven design pattern — similar to ScriptableObjects in Unity:
```gdscript
# item_data.gd
class_name ItemData
extends Resource

@export var name: String
@export var icon: Texture2D
@export var damage: int
@export var rarity: int  # 0-4
@export var description: String
```
- Save as `.tres` (text, VCS-friendly) or `.res` (binary, faster)
- Edit in the Inspector — no code needed for data entry
- Share between nodes via `@export var item: ItemData`
- **Key advantage:** Designers can create/edit game data without touching code

### 2.7 State Machine Pattern (Node-Based)
The most common Godot pattern for character behavior:
```gdscript
# state_machine.gd
class_name StateMachine
extends Node

@export var initial_state: State
var current_state: State

func _ready() -> void:
    for child in get_children():
        if child is State:
            child.state_machine = self
    current_state = initial_state
    current_state.enter()

func _process(delta: float) -> void:
    current_state.update(delta)

func _physics_process(delta: float) -> void:
    current_state.physics_update(delta)

func transition_to(target_state_name: String) -> void:
    var new_state = get_node(target_state_name)
    current_state.exit()
    current_state = new_state
    current_state.enter()
```

Each state is a child node with its own script. Visual in the editor, easy to debug.

---

## 3. GDScript vs C# Decision Matrix

| Factor | GDScript | C# |
|--------|----------|-----|
| **Learning curve** | Very low (Python-like) | Moderate (requires .NET knowledge) |
| **Community adoption** | ~84% of Godot devs | ~16% of Godot devs |
| **Tutorial availability** | Overwhelming majority | Growing but limited |
| **Performance** | Adequate for most games | 3-10x faster for computational code |
| **Static typing** | Optional type hints | Enforced |
| **Web export** | ✅ Supported | ❌ Not yet (in progress) |
| **GDExtension access** | ✅ Native | ❌ No bindings generated |
| **Editor integration** | ✅ Built-in editor | Requires VSCode/Rider |
| **.NET ecosystem** | ❌ | ✅ NuGet packages |
| **Hot reload** | ✅ Instant | Partial (improving) |
| **Best for** | Most games, prototyping, 2D | Performance-critical, large teams, Unity refugees |

### MCP Module Decision
**Primary docs in GDScript** — it's what 84% of the community uses and what every tutorial demonstrates. Include C# equivalents as sidebar notes where patterns differ significantly.

---

## 4. Key Built-in Systems

### 4.1 Physics
- **2D:** Built-in physics engine (lightweight, good for most 2D games)
- **3D:** Godot Physics (improving) or **Jolt Physics** (4.6+ default, much better)
- Node types: `CharacterBody2D/3D`, `RigidBody2D/3D`, `StaticBody2D/3D`, `Area2D/3D`
- `move_and_slide()` — the workhorse for platformer/top-down movement
- Collision layers/masks for fine-grained collision control

### 4.2 Animation
- **AnimationPlayer** — keyframe anything (properties, methods, signals)
- **AnimationTree** — blend trees, state machines for complex animation
- **Tweens** — programmatic animations: `create_tween().tween_property(node, "position", target, 0.5)`
- **Sprite Frames** — frame-by-frame sprite animation (AnimatedSprite2D)

### 4.3 UI (Control Nodes)
- Full UI toolkit built-in (unlike MonoGame where you need Gum)
- `Control` → `Container` → `HBoxContainer`/`VBoxContainer`/`GridContainer`
- Anchors & margins for responsive layout
- Theme system for consistent styling
- `RichTextLabel` with BBCode support

### 4.4 Tilemaps
- `TileMapLayer` (Godot 4.3+, replaces old `TileMap`)
- Terrain system for auto-tiling
- Physics, navigation, and occlusion per tile
- Multiple layers supported natively

### 4.5 Navigation
- `NavigationRegion2D/3D` + `NavigationAgent2D/3D`
- Baked navmeshes with obstacle avoidance
- Dynamic obstacle support

### 4.6 Audio
- `AudioStreamPlayer` / `AudioStreamPlayer2D` / `AudioStreamPlayer3D`
- Audio buses with effects (reverb, delay, EQ, etc.)
- Supports WAV, OGG, MP3

### 4.7 Shaders
- Custom shader language (similar to GLSL)
- Visual Shader editor (node-based)
- `CanvasItem`, `Spatial`, and `Particles` shader types

---

## 5. Common Pain Points (What Devs Struggle With)

### 5.1 Outdated Resources (CRITICAL)
- Godot 3 → 4 was a **massive breaking change** (renamed nodes, new syntax, removed features)
- Most YouTube tutorials and StackOverflow answers are still Godot 3
- AI assistants frequently generate Godot 3 code (KinematicBody2D instead of CharacterBody2D, yield instead of await, etc.)
- **MCP opportunity:** Up-to-date Godot 4.x patterns are extremely valuable

### 5.2 Architecture Confusion
- Unity devs try to use inheritance hierarchies (Godot prefers composition via scenes)
- "Where do I put my game logic?" — no clear MVC/MVVM equivalent
- Signal spaghetti in large projects (too many cross-connections)
- When to use Autoload vs dependency injection vs signal bus

### 5.3 Performance & Scaling
- GDScript is slow for heavy computation (particle systems, pathfinding for hundreds of agents)
- No built-in ECS (community solutions exist: godot-ecs, Arch-like addons)
- Large open worlds require manual LOD and chunking
- Multithreading API exists but is confusing for beginners

### 5.4 3D Limitations
- 3D tooling still maturing (mesh editing, terrain — use external tools)
- No built-in terrain system (addons: Terrain3D, HTerrain)
- Lighting/shadows less polished than Unity/Unreal
- Import pipeline quirks with Blender models

### 5.5 Multiplayer Complexity
- High-level API (MultiplayerSynchronizer, MultiplayerSpawner) is powerful but poorly documented
- ENet, WebSocket, WebRTC support but architecture decisions are confusing
- No built-in lobby/matchmaking (need external services)
- Authoritative server architecture requires significant manual work

### 5.6 C# Specific Pain Points
- No web export
- No GDExtension bindings from C#
- Documentation assumes GDScript — C# devs must mentally translate
- Marshalling overhead when calling engine API
- Hot reload is inconsistent

### 5.7 Pixel-Perfect 2D
- Surprisingly difficult to get right in Godot 4
- Pixel jitter on moving objects
- Subpixel rendering issues
- Camera smoothing vs pixel snapping conflicts

---

## 6. Essential Addons & Ecosystem

### Must-Know Addons
| Addon | Purpose | Stars/Popularity |
|-------|---------|-----------------|
| **Dialogic 2** | Dialogue/cutscene system | Very popular |
| **Phantom Camera** | Advanced camera system | Popular |
| **GodotSteam** | Steam integration | Essential for PC release |
| **Terrain3D** | 3D terrain editing | Growing |
| **Limbo AI** | Behavior trees + state machines | Popular |
| **SmartShape2D** | 2D terrain/shapes | Popular |
| **Godot Mod Loader** | Mod support framework | Niche but active |
| **Panku Console** | In-game debug console | QoL essential |

### Community Resources
- **GDQuest** — highest quality tutorials (YouTube + written)
- **KidsCanCode** — beginner-friendly
- **Godot official docs** — comprehensive but can be dense
- **r/godot** — 400K+ members, very active
- **Godot Discord** — real-time help

---

## 7. Genre Mapping (Godot Strengths)

| Genre | Godot Fit | Notes |
|-------|-----------|-------|
| **2D Platformer** | ⭐⭐⭐⭐⭐ | CharacterBody2D + move_and_slide() is purpose-built |
| **Top-down RPG** | ⭐⭐⭐⭐⭐ | TileMap + Navigation + Signals = natural fit |
| **Visual Novel** | ⭐⭐⭐⭐⭐ | Dialogic 2 addon, or built-in RichTextLabel |
| **Turn-based Strategy** | ⭐⭐⭐⭐ | Resource system great for unit data |
| **Tower Defense** | ⭐⭐⭐⭐ | Path2D for paths, Area2D for tower range |
| **Metroidvania** | ⭐⭐⭐⭐ | Strong 2D physics + animation system |
| **Roguelike** | ⭐⭐⭐⭐ | Procedural gen in GDScript, TileMap for dungeons |
| **Survival** | ⭐⭐⭐⭐ | Inventory via Resources, crafting via data |
| **Puzzle** | ⭐⭐⭐⭐⭐ | Lightweight engine is perfect |
| **3D Action** | ⭐⭐⭐ | Possible but Unity/Unreal still easier for complex 3D |
| **MMO/Large MP** | ⭐⭐ | Networking exists but not designed for massive scale |

---

## 8. Godot-Specific Patterns for MCP Docs

### Patterns to Document (Priority Order)
1. **Scene Composition** — how to structure a game as nested scenes
2. **Signal Architecture** — when to use direct signals vs signal bus vs groups
3. **State Machine (Node-based)** — the standard character controller pattern
4. **Custom Resources for Data** — item databases, enemy stats, skill trees
5. **Object Pooling** — adapting pooling to Godot's node system
6. **Autoload Management** — what deserves to be global vs scene-local
7. **Input Handling** — Input Map + `_unhandled_input` vs `_input` vs `_process`
8. **Scene Transitions** — loading screens, async loading, scene stacking
9. **Save/Load Systems** — ConfigFile vs Resource saving vs JSON
10. **UI Architecture** — separating game logic from UI with signals

### Anti-Patterns to Warn About
1. Deep inheritance trees (use scene composition instead)
2. Everything-is-an-autoload (defeats modularity)
3. Direct node path references across scenes (`get_node("../../Player")` — fragile)
4. Mixing GDScript and C# unnecessarily (pick one per project usually)
5. Using `_process` for everything (use signals, timers, `_physics_process` appropriately)
6. Not using typed GDScript (misses compile-time errors and performance gains)

---

## 9. Version Timeline

| Version | Release | Key Features |
|---------|---------|--------------|
| 4.0 | Mar 2023 | Vulkan, GDScript 2.0, complete rewrite |
| 4.1 | Jul 2023 | Stability, performance fixes |
| 4.2 | Nov 2023 | GDScript improvements, Android editor |
| 4.3 | Aug 2024 | TileMapLayer, interactive music, dotnet 8 |
| 4.4 | Feb 2025 | Wayland, WebSocket client, Vulkan fixes |
| 4.5 | ~2025 | Animation improvements, editor UX |
| 4.6 | ~2026 | Jolt physics default, LibGodot, GDScript type improvements |

---

## 10. MCP Module Planning

### Doc Structure (Mirror MonoGame)
```
docs/godot-arch/
├── architecture/
│   ├── E1_architecture_overview.md     — Node tree, scenes, signals philosophy
│   ├── E2_gdscript_vs_csharp.md        — Language choice deep-dive
│   ├── E3_project_structure.md          — Directory layout, autoloads, naming
│   └── E4_when_to_use_godot.md          — Genre fit, limitations, honest assessment
├── guides/
│   ├── G1_scene_composition.md          — Building games with nested scenes
│   ├── G2_state_machine.md              — Node-based FSM for characters
│   ├── G3_signal_architecture.md        — Signals, signal bus, groups
│   ├── G4_custom_resources.md           — Data-driven design with .tres
│   ├── G5_input_handling.md             — Input maps, action system
│   ├── G6_tilemaps_navigation.md        — TileMapLayer + NavAgent
│   ├── G7_save_load_systems.md          — Multiple approaches compared
│   ├── G8_ui_architecture.md            — Control nodes, themes, separation
│   ├── G9_object_pooling.md             — Adapted for node tree
│   ├── G10_scene_transitions.md         — Loading, async, stacking
│   └── ... (genre-specific guides)
├── reference/
│   ├── R1_node_cheatsheet.md            — Essential nodes quick reference
│   ├── R2_addon_directory.md            — Curated addon recommendations
│   └── R3_gdscript_patterns.md          — Code snippets & idioms
└── godot-rules.md                       — AI code generation rules
```

### Genre-Specific Guides to Create
- G20_platformer_systems.md — CharacterBody2D movement, coyote time, wall jumps
- G21_topdown_rpg_systems.md — Grid movement, NPC dialogue, quest tracking
- G22_tower_defense_systems.md — Path2D enemies, Area2D towers, wave spawning
- G23_roguelike_systems.md — Procedural generation, permadeath, run progression
- G24_survival_systems.md — Inventory, crafting, hunger/thirst, day/night cycle
- G25_combat_damage_systems.md — Hitbox/hurtbox, damage pipeline (Godot-specific)

### Godot Rules File (for AI Code Gen)
Key rules to enforce:
- Use CharacterBody2D/3D (not KinematicBody — that's Godot 3)
- Use `await` not `yield` (Godot 3 syntax)
- Use typed GDScript (`var speed: float = 200.0`)
- Use `@export` not `export` (Godot 3 syntax)
- Use `@onready` not `onready` (Godot 3 syntax)
- Prefer signals over direct references
- Use `StringName` for performance-critical string comparisons
- Use `move_and_slide()` without arguments (Godot 4 changed the API)
- TileMapLayer (4.3+) replaces TileMap

---

## 11. Research Gaps (Still Need)

- [ ] Deep-dive into Godot 4.6 Jolt physics integration specifics
- [ ] GDExtension workflow for performance-critical code
- [ ] Multiplayer architecture patterns (authoritative server in Godot)
- [ ] Shader recipes (common visual effects in Godot shader language)
- [ ] CI/CD pipeline for Godot (GitHub Actions export templates)
- [ ] Mobile-specific considerations (touch input, performance budgets)
- [ ] Console export (requires third-party — W4 Games partnership)

---

## Research Log

- **2026-03-19 1pm:** **Phase 2 STARTED.** Created `docs/godot-arch/` directory skeleton (architecture/, guides/, reference/). Wrote 3 docs totaling ~43.6KB:
  - E1 Architecture Overview (15.6KB) — covers node tree, scenes, signals, autoloads, custom resources, state machine pattern, 2D vs 3D distinction, full Godot vs MonoGame comparison table, when-to-use honest assessment
  - godot-rules.md (13.6KB) — AI code gen rules: comprehensive Godot 3→4 rename table (20+ entries), typed GDScript standards, @export patterns with groups, signal callback naming, platformer + top-down movement templates, custom resource patterns, object pooling, file boundaries, performance rules
  - G1 Scene Composition (14.4KB) — full guide: three-questions design method, component scenes (HealthComponent, HitboxComponent, HurtboxComponent with full implementations), wiring components via signals, file system organization, runtime instancing + pooling, composition vs inheritance decision guide, common patterns (entity/interactable/projectile/UI), debugging checklist
  - Next session: G2 State Machine, G3 Signal Architecture, E2 GDScript vs C#
- **2026-03-18 1pm:** Initial deep research pass. Studied core architecture (node tree, signals, scenes), GDScript vs C#, design patterns (signal bus, state machine, resources, composition, object pooling, command, service locator), pain points (outdated resources, architecture confusion, pixel-perfect 2D, multiplayer complexity), addon ecosystem, genre mapping. Planned full doc structure mirroring MonoGame format. Research is now solid enough to begin Phase 2 prototyping.
