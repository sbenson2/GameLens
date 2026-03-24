# Godot Engine Research

> **Status:** Phase 2 — Prototyping (12/~20 docs complete, 60%)  
> **Priority:** #1 (first engine expansion after MonoGame)  
> **Last Updated:** 2026-03-24  
> **Current Version:** Godot 4.6.1 stable (4.6.2 RC 2 out, 4.5.2 also just released)

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
- **LibGodot** (4.6+) — engine can be built as a standalone library, enabling embedding in other apps

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
- **3D:** Jolt Physics is default since 4.4 (much better than old Godot Physics)
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
- Theme system for consistent styling (new default theme in 4.6)
- `RichTextLabel` with BBCode support

### 4.4 Tilemaps
- `TileMapLayer` (Godot 4.3+, replaces old `TileMap`)
- 4.5 reworked TileMapLayer collision — merges placed cell shapes into bigger collision shapes
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

### 5.1 Outdated Resources (CRITICAL — STILL #1 in March 2026)
- Godot 3 → 4 was a **massive breaking change** (renamed nodes, new syntax, removed features)
- Most YouTube tutorials and StackOverflow answers are still Godot 3
- **Godot 3 tutorials STILL being published** — as of Mar 20, 2026, new "Mastering 3D in Godot 3" content is appearing online
- AI assistants frequently generate Godot 3 code (KinematicBody2D instead of CharacterBody2D, yield instead of await, etc.)
- **Godogen creator** spent 4 rewrites and a year building custom GDScript docs because "LLMs barely know GDScript — 850 classes and Python-like syntax that lets models hallucinate Python idioms that fail to compile"
- **MCP opportunity:** Up-to-date Godot 4.x patterns are extremely valuable — multiple projects are independently solving this same problem

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
- Lighting/shadows less polished than Unity/Unreal (improving — Jolt physics default in 4.4 is a big step)
- Import pipeline quirks with Blender models
- Voxel ray tracing now demonstrated possible (r/godot "Can Godot do Teardown? Yes" — Mar 2026)

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

### 5.8 AI-Generated PR Spam (NEW — Feb/Mar 2026)
- Godot maintainers overwhelmed with low-quality AI-generated pull requests
- Maintainer called it "a total shitshow" on social media (Feb 16, 2026)
- Coverage: WN Hub, mxdwn Games — "Godot Developer Says AI is Becoming a Big Problem"
- This is about AI-generated contributions, NOT AI-assisted dev tools — but it colors community sentiment
- Our positioning as "knowledge infrastructure" (helping individual devs) vs "code generation" (replacing devs) is the safe side

### 5.9 Console Export Gap
- No official console export — requires third-party (W4 Games partnership)
- Forum user (Mar 2026): "The only complaint: no official video game console support"
- Console market is declining though, which reduces the urgency
- Slay the Spire 2 likely has console planned via W4 Games

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
| **GodotAI** | In-editor AI chat panel (free, supports Claude/ChatGPT/OpenRouter) | NEW — Mar 2026 |

### Community Resources
- **GDQuest** — highest quality tutorials (YouTube + written)
- **KidsCanCode** — beginner-friendly
- **Godot official docs** — comprehensive but can be dense; new search feature getting feedback (Mar 2026)
- **r/godot** — 400K+ members, very active, strong anti-AI-content sentiment
- **Godot Discord** — real-time help
- **Godot Forum** — increasingly active, good for nuanced technical discussions

---

## 7. Genre Mapping (Godot Strengths)

| Genre | Godot Fit | Notes |
|-------|-----------|-------|
| **2D Platformer** | ⭐⭐⭐⭐⭐ | CharacterBody2D + move_and_slide() is purpose-built |
| **Top-down RPG** | ⭐⭐⭐⭐⭐ | TileMap + Navigation + Signals = natural fit |
| **Visual Novel** | ⭐⭐⭐⭐⭐ | Dialogic 2 addon, or built-in RichTextLabel |
| **Card Game / Deckbuilder** | ⭐⭐⭐⭐⭐ | **Slay the Spire 2 proves this at scale** (3M+ sales, Mar 2026) |
| **Turn-based Strategy** | ⭐⭐⭐⭐ | Resource system great for unit data |
| **Tower Defense** | ⭐⭐⭐⭐ | Path2D for paths, Area2D for tower range |
| **Metroidvania** | ⭐⭐⭐⭐ | Strong 2D physics + animation system |
| **Roguelike** | ⭐⭐⭐⭐ | Procedural gen in GDScript, TileMap for dungeons |
| **Survival** | ⭐⭐⭐⭐ | Inventory via Resources, crafting via data |
| **Puzzle** | ⭐⭐⭐⭐⭐ | Lightweight engine is perfect |
| **3D Action** | ⭐⭐⭐ | Possible but Unity/Unreal still easier for complex 3D |
| **MMO/Large MP** | ⭐⭐ | Networking exists but not designed for massive scale |

---

## 8. Godot MCP Competitive Landscape (Updated 2026-03-22)

### Editor-Integration Servers (ALL competitors are this type)

| Server | Tools | Model | Stars | Notes |
|--------|-------|-------|-------|-------|
| **Coding-Solo/godot-mcp (GoPeak)** | 95+ | Free | ~2,528+ | MASSIVE expansion from ~84→95+ tools. Now includes GDScript LSP diagnostics, DAP debugger, screenshot capture, input injection, ClassDB introspection, CC0 asset library. HN Show HN post. Most feature-rich Godot MCP. |
| **Godot MCP Pro** | 162 | $5 | — | Premium, AI-controlled editor/playtesting |
| **GDAI MCP** | — | $19 | ~76 | Paid, specialized |
| **GodotIQ** | 35 (22 free + 13 paid) | Freemium | ~10 | "Intelligence layer" — spatial analysis, dependency graphs, signal flow tracing. Posted on Godot Forum (Mar 2026). Closest to our model. |
| **godot-mcp-docs** | — | Free | ~51 | **Effectively dead** — no updates since Jul 2025. Only docs-focused competitor. |
| **godot-mcp (Godot MCP Server)** | — | Free | — | Basic editor integration, LobeHub listed |
| **Claude-GoDot-MCP** | 95+ | Free | — | LobeHub listing, appears to be GoPeak rebadge |
| **leanderm99/godotmcp** | — | Free | — | LobeHub listed, smaller |
| **ricky-yosh/godot-mcp-server** | — | Free | — | LobeHub listed |

### Knowledge-Layer Servers (OUR niche)
- **godot-mcp-docs** (51⭐, dead) — the ONLY knowledge-layer Godot MCP, and it's abandoned
- **Us (gamedev-mcp-server)** — 9 Godot docs (276KB), growing toward 20. Cross-engine. The only active knowledge MCP.

### AI-Adjacent Godot Tools (Complementary, NOT competitive)
| Tool | Type | Notes |
|------|------|-------|
| **Godogen** | Claude Code Skills | Generates complete Godot 4 games from text prompts. HN viral (~1,699+ ⭐ and growing). Creator spent 4 rewrites building custom docs — validates our thesis. MIT license. |
| **GodotAI plugin** | In-editor AI chat | Free, open-source, supports Claude/ChatGPT/OpenRouter. r/godot reception mixed but positive. Complementary — it's the chat interface that needs our knowledge. |
| **Context7 MCP** | Docs MCP (general) | Referenced on LobeHub alongside Godot MCPs. Provides "up-to-date, version-specific documentation" for libraries. Potential competitor if they add Godot-specific content. |

### Key Competitive Insights (March 2026)
1. **GoPeak's 95+ tools expansion is significant** — it's now the clear #1 editor-integration Godot MCP. BUT 95 tools = massive context window overhead, which is exactly the problem Perplexity CTO criticized. Our "5 tools, zero bloat" positioning is the counterpoint.
2. **godot-mcp-docs being dead for 8+ months** means the knowledge-layer niche is completely uncontested. No one else is building curated Godot knowledge for MCP.
3. **Godogen proves extreme demand** for curated GDScript knowledge. Its creator independently built the exact type of docs we're building — but as one-off files for a single tool, not a reusable MCP server.
4. **GodotIQ's freemium model** (22 free + 13 paid) is the closest to ours in the Godot space, but they're spatial intelligence, not knowledge docs.
5. **The Godot MCP namespace has 9+ servers now** — extreme fragmentation benefits "one knowledge server" positioning.

---

## 9. Slay the Spire 2 — Godot's Breakout Moment (NEW — March 2026)

**The single most important event for Godot's commercial credibility.**

- **3M+ copies sold** in first two weeks of Early Access (launched Mar 2026)
- **Surpassed Hades 2 AND Hollow Knight: Silksong** in revenue
- Built on Godot after switching from Unity (post-Unity pricing crisis, 2023)
- MegaCrit converted ~2 years of Unity work to Godot
- ComicBook.com: game is being pirated due to open-source Godot code, devs don't care
- **Most successful indie game launch using Godot, ever**

### Why This Matters for Us
1. **Proves Godot can ship AAA-indie commercial titles** — silences "Godot is just for prototyping" narrative
2. **Card game/deckbuilder genre** added to Godot genre mapping (⭐⭐⭐⭐⭐)
3. **Will drive massive influx of new Godot developers** — all needing documentation and AI assistance
4. **Validates Unity→Godot migration path** — our E2 GDScript vs C# and migration tables are timely
5. **Forum discussion**: "For Godot to improve, it must get professional users to identify all the ways in which things don't work right" — STS2 IS that professional stress test

---

## 10. Version Timeline (Updated)

| Version | Release | Key Features |
|---------|---------|--------------|
| 4.0 | Mar 2023 | Vulkan, GDScript 2.0, complete rewrite |
| 4.1 | Jul 2023 | Stability, performance fixes |
| 4.2 | Nov 2023 | GDScript improvements, Android editor |
| 4.3 | Aug 2024 | TileMapLayer, interactive music, dotnet 8 |
| 4.4 | Mar 2025 | Jolt physics integration (default), Wayland, WebSocket |
| 4.5 | Sep 2025 | Stencil buffer, TileMapLayer collision rework (shape merging) |
| 4.5.2 | **Mar 20, 2026** | Android debug symbols, D3D12 shader compile time fix, rendering fixes |
| 4.6 | Jan 2026 | **LibGodot** (engine as standalone library), new default theme, GDScript type improvements |
| 4.6.1 | ~Mar 2026 | Current stable |
| 4.6.2 | **RC 2: Mar 21, 2026** | Crash fixes (empty strings, memory buffer overread), core stability |

### Doc Version Targeting
- Our docs target **Godot 4.4+** (covers 4.4, 4.5, 4.6)
- Key 4.5 change for our docs: TileMapLayer collision merging (mention in G7 TileMap when written)
- Key 4.6 change: LibGodot enables new embedding workflows — not relevant for gameplay docs yet
- **Action item**: When 4.6.2 stable releases, verify our docs are compatible (likely no changes needed — these are bugfixes)

---

## 11. Community Sentiment Snapshot (March 2026)

### Positive Signals
- "Tried EVERY Game Engine Available, Godot Engine v4.6.1+ Is What We Always Come Back To" (Godot Forum, Mar 21)
- "For years I bounced off of gamedev projects in other engines, never managing to understand the workflow or features in a way that made sense to me. When I first tried Godot, it just 'clicked.'" (r/godot, Mar 22)
- STS2 success generating mainstream press coverage + developer interest
- Active Starter Kit ecosystem (Match-3, Racing kits published this week on r/godot)
- Technical showcases pushing boundaries (Teardown-style voxel destruction in Godot, souls-like combat with mesh slicing)

### Negative Signals / Caution Areas
- **Anti-AI sentiment intense and specific**: r/godot response to AI-generated browser game: "You didn't make anything. Go actually learn to fucking program and get a life."
- **AI PR spam backlash**: Maintainers demoralized by low-quality AI-generated contributions. This has spilled into broader "AI bad" sentiment.
- **Key nuance**: The anger is at (a) AI replacing humans, (b) AI-generated low-effort content, (c) AI spam on open-source repos. It is NOT at AI-assisted development tools used by real developers. Our "knowledge infrastructure" positioning remains safe.
- **Console export** remains the #1 structural complaint — no official support

### Marketing Implications
- **DO**: Frame as "knowledge infrastructure for developers," "helps your AI understand Godot 4," "stops AI from generating Godot 3 code"
- **DON'T**: Use phrases like "AI-powered," "generate games," "replace tutorials," "vibe coding"
- **STS2 timing**: Can reference STS2's success to validate Godot as a serious engine choice
- **Forum post > Reddit post** for initial Godot community outreach — less hostile to tools, more technical discussion

---

## 12. Godot-Specific Patterns for MCP Docs

### Patterns to Document (Priority Order)
1. ✅ **Scene Composition** (G1) — how to structure a game as nested scenes
2. ✅ **State Machine (Node-based)** (G2) — the standard character controller pattern
3. ✅ **Signal Architecture** (G3) — when to use direct signals vs signal bus vs groups
4. ✅ **Input Handling** (G4) — Input Map + action system + buffering + accessibility
5. ✅ **Physics & Collision** (G5) — body types, layers, raycasting, platforms
6. ✅ **Camera Systems** (G6) — follow, deadzone, shake, zoom, multi-target, cinematic
7. **TileMap & Navigation** (G7) — TileMapLayer + NavAgent — **NEXT (50% milestone)**
8. **Custom Resources for Data** — item databases, enemy stats, skill trees
9. **UI Architecture** — Control nodes, themes, separation
10. **Scene Transitions** — loading, async, stacking
11. **Save/Load Systems** — ConfigFile vs Resource saving vs JSON (confirmed community gap)
12. **Object Pooling** — adapted for node tree
13. **Autoload Management** — what deserves to be global vs scene-local
14. **Animation Systems** — AnimationPlayer + AnimationTree + tweens
15. **Dialogue Systems** — confirmed high-demand (Dialogic 2 vs custom)

### Architecture Docs
1. ✅ **E1 Architecture Overview** — Node tree, scenes, signals philosophy
2. ✅ **E2 GDScript vs C#** — Language choice deep-dive with migration tables
3. **E3 Project Structure** — Directory layout, autoloads, naming
4. **E4 When to Use Godot** — Genre fit, limitations, honest assessment

### Anti-Patterns to Warn About
1. Deep inheritance trees (use scene composition instead)
2. Everything-is-an-autoload (defeats modularity)
3. Direct node path references across scenes (`get_node("../../Player")` — fragile)
4. Mixing GDScript and C# unnecessarily (pick one per project usually)
5. Using `_process` for everything (use signals, timers, `_physics_process` appropriately)
6. Not using typed GDScript (misses compile-time errors and performance gains)

---

## 13. Research Gaps (Still Need)

- [ ] Deep-dive into Godot 4.6 LibGodot embedding workflows
- [ ] GDExtension workflow for performance-critical code
- [ ] Multiplayer architecture patterns (authoritative server in Godot) → G13
- [ ] Shader recipes (common visual effects in Godot shader language) → G12
- [ ] CI/CD pipeline for Godot (GitHub Actions export templates) → G17
- [x] Mobile touch input — covered in G4 (virtual joystick, touch buttons)
- [ ] Console export via W4 Games partnership
- [ ] STS2 technical architecture analysis (if any postmortems surface)
- [x] TileMapLayer patterns — covered in G7 (80KB, comprehensive)
- [ ] Context7 MCP — still general-purpose, no gamedev content. Monitor.
- [ ] Godot 4.7 drawable textures — potential fog-of-war/terrain painting patterns
- [ ] Local/small LLM integration guide — r/LocalLLM community needs it
- [ ] Dialogue systems research for G15 (visual scripting tools, Ink integration, etc.)

---

## 14. "Why AI Writes Better Game Code in Godot" Thesis (Validated)

DEV Community article (Mar 19, 2026, still trending Mar 22) — key arguments:

1. **Text-based file formats** — `.tscn` and `.tres` are human-readable. Unity's `.unity` and `.prefab` are YAML-database-dumps. "When an AI assistant encounters a Unity scene file, it's essentially reading a database dump."
2. **GDScript simplicity** — one file = one class, clear scope, Python-like syntax is closer to training data
3. **Integrated workflow** — everything in one editor, no split between IDE + engine
4. **Scene tree = natural hierarchy** — AI can reason about parent-child relationships easily

### Implications for Our MCP
- Godot is already AI-friendly at the format level
- Our value isn't "make AI understand Godot files" (it already can)
- Our value is "make AI understand Godot PATTERNS and BEST PRACTICES" — the difference between code that compiles and code that follows idiomatic Godot 4 architecture
- The 850-class GDScript API + Godot 3→4 breaking changes = the knowledge gap we fill

---

## 15. Godot 4.7 Development (New Section)

**4.7 dev 2 released March 4, 2026** — development moving fast despite 4.6 being only 2 months old.

### Key 4.7 Features (So Far)
- **Virtual joystick input** (built-in mobile solution) — partially overlaps with our G4 touch input section
- **Drawable textures** — runtime texture painting, useful for terrain/fog-of-war
- **Windows HDR support** (dev 1), **Apple HDR support** (dev 2)
- **Vulkan raytracing foundations** — early-stage, signals 3D investment
- **Editor QoL**: Copy/paste entire property sections (not individual fields), monospaced font for code names, animation track group collapsing
- **105 contributors, 248 fixes** in dev 2 alone

### Implications for Our Docs
- Our docs targeting "Godot 4.4+" remain safe — 4.7 is additive, no breaking patterns
- Built-in virtual joystick may reduce the need for our G4 custom touch joystick section, but custom implementations will still be needed for non-standard layouts
- Drawable textures could enable new fog-of-war patterns (currently our G7 uses tile-based approach)
- Need to watch for 4.7 beta (likely Q2-Q3 2026) for any API changes that affect our guides

---

## 16. AI + Godot Ecosystem Update (March 2026)

### GodotAI Plugin (New — March 19, 2026)
- **Free, open-source** AI coding assistant that lives INSIDE the Godot editor as a docked panel
- Supports Claude, ChatGPT, and 500+ models via OpenRouter
- Available on GitHub (Sods2/GodotAI), itch.io, and Godot Asset Library
- **Significance**: First mainstream in-editor AI assistant for Godot that isn't MCP-based. Reduces friction compared to external tools. Complements our MCP because these AI assistants NEED knowledge to not hallucinate — we provide that knowledge layer.
- r/godot post well-received — the community accepted it because it's a coding tool, not content generation

### Godogen Trajectory
- Started with 407⭐ at HN launch → 651⭐ mid-March → 1,699⭐ Mar 22 → 1,849⭐ Mar 23
- Growth rate: ~150/day sustained for 10+ days. Likely approaching 2,000+ by now
- Creator's "four rewrites" story analyzed on chyshkala.com — confirms the core problem: LLMs barely know GDScript (850 classes, Python-like syntax that invites hallucination)
- YouTube coverage: "AI Builds Complete Godot Games Autonomously" — mainstream visibility

### Anti-AI Content Sentiment (Crystallized)
- Godot Forum thread (March 21): "Why Is AI Generated Content Like Music & Images Looked Down Upon In Video Games?" — indie devs with zero budget asking why players reject AI art/music
- Clear community answer: AI-generated CONTENT (visible) is rejected; AI-assisted DEVELOPMENT (invisible) is accepted
- NewGrounds players specifically "went insane" about AI art in Godot games
- This reinforces our positioning: knowledge infrastructure (invisible) is safe; we would NEVER want to position as content generation

### LocalLLM + Godot (New Signal)
- r/LocalLLM thread (March 20): "How are you all doing agentic coding on 9b models?" — commenter specifically says "Qwen won't have jack squat for training on Godot" and recommends "create a local RAG for your 9b model and stuff it full of code, docs, manuals, samples, guides - inject things from github or have an MCP that can reach out to github"
- This is LITERALLY describing our product. The local/small model community needs external knowledge even more than Claude/GPT users because small models have less Godot training data
- Implication: our MCP might have an underserved audience in the local LLM community

### Godot MCP Landscape (Updated)
- **LobeHub new entry** (March 21): "neversight-skills_feed-godot-mcp-setup" — a skill that installs and configures a Godot MCP server for "agent-driven scene manipulation and automation"
- Total Godot MCP namespace: **10+ servers**, all editor-integration or setup-automation
- **Still ZERO knowledge-layer Godot MCPs** — our niche remains completely uncontested after 3 rotations

---

## 17. Version Timeline (Updated)

| Version | Release | Key Feature | Our Docs Impact |
|---------|---------|-------------|-----------------|
| 4.4 | Sep 2024 | Typed dictionaries, improved GDScript | Baseline for our docs |
| 4.5 | Sep 2025 | Stencil buffer, TileMapLayer collision merging | G7 covers new TileMapLayer patterns |
| 4.6 | Jan 2026 | LibGodot (standalone library), new default theme | godot-rules.md covers 4.6 patterns |
| 4.5.2 | Mar 20, 2026 | Android debug symbols, D3D12 shader compile fix | No doc impact |
| 4.6.2 RC2 | Mar 21, 2026 | Core crash fixes, memory buffer fixes | Stability, no API changes |
| **4.7 dev 2** | **Mar 4, 2026** | Virtual joystick, drawable textures, Apple HDR, Vulkan RT foundations | Watch for beta — may need G4/G7 updates |

---

## 18. Community Pain Points (Refreshed March 2026)

### Ranked by Frequency (from Reddit/Forum/DEV Community this week)
1. **Outdated resources** — STILL #1. Godot 3 tutorials published as recently as March 20, 2026. LLMs trained on this data hallucinate `KinematicBody2D`, `yield`, `export` without `@`. Our correct-4.x docs remain highest-value.
2. **AI hallucination of GDScript** — Godogen creator confirms: "LLMs barely know GDScript... 850 classes and a Python-like syntax that will happily let a model hallucinate Python idioms that fail to compile." This IS our problem statement.
3. **Console deployment gap** — DEV Community (March 2026): "Console deployment is Godot's most significant gap." W4 Games third-party ports add cost/complexity. Not something we can address with docs.
4. **Community = passionate amateurs** — r/godot "What's wrong with Godot?" thread: criticism that community "never gets past basic demos." Our production-grade docs (89KB AI systems, 80KB TileMap, 54KB UI) directly counter this perception.
5. **AI-generated content backlash** — active concern for indie devs who can't afford artists. Not our problem space (we're dev tools, not content gen).
6. **Dialogue systems** — persistent gap. Visual scripting dialogue plugin posted on r/godot this week, active help threads. Should be in our module roadmap.
7. **Point-and-click / adventure game patterns** — r/godot question about point-and-click-style game with no good answers. Niche but underserved.

### "What's Wrong with Godot?" Synthesis (March 2026)
From r/godot thread with significant engagement:
- GDScript as a custom language (instead of using Python/Lua) remains controversial
- Community quality perception: knowledgeable but amateur-skewing
- 3D capabilities: improving but still behind Unity/Unreal
- Documentation: official docs acknowledged as incomplete for advanced topics
- Console exports: the persistent gap that W4 Games partially addresses

---

## 19. Doc Needs Assessment (Updated)

### Current Module Status: 12/20 docs (60%)
Completed:
- ✅ E1 Architecture Overview, E2 GDScript vs C#
- ✅ godot-rules.md (AI code generation rules)
- ✅ G1 Scene Composition, G2 State Machine, G3 Signal Architecture
- ✅ G4 Input Handling, G5 Physics & Collision, G6 Camera Systems
- ✅ G7 TileMap & Terrain, G8 Animation Systems
- ✅ G9 UI & Control Systems (NEW — highest-leverage doc for genre coverage)

### Remaining Priority (8 docs to 100%)
| Priority | Doc | Rationale |
|----------|-----|-----------|
| HIGH | G10 Audio Systems | Audio buses, SFX pooling, music transitions — every game needs it |
| HIGH | G11 Save/Load | Confirmed community demand (forum threads), JSON + ResourceSaver patterns |
| HIGH | G12 Shaders & VFX | Visual polish layer, Godot shader language is unique |
| MEDIUM | G13 Networking/Multiplayer | Pain point #5, complex topic, SceneMultiplayer API |
| MEDIUM | G14 Custom Resources | Data-driven patterns, EditorPlugin, tool scripts |
| MEDIUM | G15 Dialogue Systems | Community demand confirmed (multiple sources this week) |
| MEDIUM | G16 Particle Systems | GPUParticles2D/3D, visual effects |
| LOW | G17 Export & Deployment | Platform-specific, less unique knowledge value |

### New Content Gaps Identified This Rotation
- **Local/small LLM integration** — r/LocalLLM community specifically needs Godot knowledge for RAG systems. Our MCP serves this use case but we could create a "using gamedev-mcp-server with local models" guide
- **Point-and-click game patterns** — underserved genre in Godot, no good community resources
- **Godot 4.7 migration notes** — will be needed when 4.7 enters beta/RC (Q2-Q3 2026)
- **Drawable textures** — new 4.7 feature, could enable novel fog-of-war/terrain painting patterns

---

## Research Log

- **2026-03-24 11am:** **Rotation 5 update (Godot).** Key findings: (1) **Godot 4.7 dev 2 already out** (March 4) — virtual joystick, drawable textures, Apple HDR, Vulkan RT foundations, 248 fixes from 105 contributors. Our docs remain current but need to watch 4.7 beta for any breaking changes. (2) **GodotAI plugin gaining traction** — in-editor AI assistant (Claude/ChatGPT/500+ models), well-received on r/godot. Complementary to our MCP: the chat interface that needs our knowledge to stop hallucinating. (3) **LocalLLM community explicitly describing our product** — r/LocalLLM poster recommends "create a local RAG... stuff it full of docs, manuals, guides" for Godot + small models. Underserved audience. (4) **Anti-AI content sentiment crystallized** on Godot Forum — indie devs with no budget face rejection from players for AI art/music, but AI dev tools remain accepted. (5) **Godogen likely past 2,000⭐** based on 150/day trajectory from 1,849 on Mar 23. YouTube coverage going mainstream. (6) **10+ Godot MCP servers now** (LobeHub new entry), still ZERO knowledge-layer. (7) **Module hit 60%** (12/20) with G9 UI doc — highest-leverage single doc for genre coverage rebalancing. (8) **Community pain points unchanged**: outdated resources still #1, AI hallucination of GDScript confirmed by Godogen creator, console deployment still the structural gap, dialogue systems still the most-requested missing content. (9) r/godot "What's wrong with Godot?" thread reveals community self-aware about amateur perception — our production-grade docs counter this. (10) Godot 4.5.2 + 4.6.2 RC2 released for older branches, no API changes affecting our docs.
- **2026-03-22 11am:** **Rotation 4 update (Godot).** Key findings: (1) Godot 4.5.2 released Mar 20 (Android debug symbols, D3D12 shader fix), 4.6.2 RC 2 out Mar 21 (crash fixes). Our docs remain current. (2) **Slay the Spire 2 — 3M+ sales, biggest Godot commercial hit ever**, surpassed Hades 2 and Silksong in revenue. Validates Godot for serious commercial games. Adds card/deckbuilder to genre strengths. (3) **GoPeak (Coding-Solo/godot-mcp) expanded to 95+ tools** — now includes LSP, DAP debugger, screenshots, ClassDB. Context window bloat problem we position against. (4) Godogen still growing (1,699+ ⭐), covered by multiple outlets. Creator's 4-rewrite story validates our GDScript docs thesis. (5) GodotAI plugin launched — free in-editor AI chat, complements our MCP. (6) Anti-AI PR spam is demoralizating Godot maintainers — colors community sentiment but our positioning remains safe. (7) Updated competitive landscape (9+ servers, all editor-integration except dead godot-mcp-docs). (8) Godot 3 tutorials STILL being published in Mar 2026 — the outdated resources problem persists. (9) Forum sentiment positive (devs choosing Godot after trying everything), Reddit sentiment mixed (pro-Godot but anti-AI-content). Updated module status to 9/20 docs (45%).
- **2026-03-21 11am:** _Bevy rotation — see bevy.md_
- **2026-03-20 11am:** _Unity rotation — see unity.md_
- **2026-03-19 1pm:** **Phase 2 STARTED.** Created `docs/godot-arch/` directory skeleton (architecture/, guides/, reference/). Wrote 3 docs totaling ~43.6KB:
  - E1 Architecture Overview (15.6KB) — covers node tree, scenes, signals, autoloads, custom resources, state machine pattern, 2D vs 3D distinction, full Godot vs MonoGame comparison table, when-to-use honest assessment
  - godot-rules.md (13.6KB) — AI code gen rules: comprehensive Godot 3→4 rename table (20+ entries), typed GDScript standards, @export patterns with groups, signal callback naming, platformer + top-down movement templates, custom resource patterns, object pooling, file boundaries, performance rules
  - G1 Scene Composition (14.4KB) — full guide: three-questions design method, component scenes (HealthComponent, HitboxComponent, HurtboxComponent with full implementations), wiring components via signals, file system organization, runtime instancing + pooling, composition vs inheritance decision guide, common patterns (entity/interactable/projectile/UI), debugging checklist
  - Next session: G2 State Machine, G3 Signal Architecture, E2 GDScript vs C#
- **2026-03-18 1pm:** Initial deep research pass. Studied core architecture (node tree, signals, scenes), GDScript vs C#, design patterns (signal bus, state machine, resources, composition, object pooling, command, service locator), pain points (outdated resources, architecture confusion, pixel-perfect 2D, multiplayer complexity), addon ecosystem, genre mapping. Planned full doc structure mirroring MonoGame format. Research is now solid enough to begin Phase 2 prototyping.
