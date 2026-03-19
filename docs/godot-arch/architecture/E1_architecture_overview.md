# E1 — Architecture Overview
> **Category:** Explanation · **Related:** [E2 GDScript vs C#](./E2_gdscript_vs_csharp.md) · [E3 Project Structure](./E3_project_structure.md) · [G1 Scene Composition](../guides/G1_scene_composition.md) · [G3 Signal Architecture](../guides/G3_signal_architecture.md)

---

## Core Philosophy: Nodes, Scenes, and Signals

Godot's architecture rests on three pillars:

1. **Nodes** — the atomic unit. Every object in the game is a node. Nodes have a type that determines built-in behavior (`CharacterBody2D`, `Sprite2D`, `AudioStreamPlayer`, `Label`).
2. **Scenes** — a saved tree of nodes. Scenes are Godot's composition unit — equivalent to prefabs, but more powerful because they can contain logic, signals, and nested scenes.
3. **Signals** — the observer pattern, built into the engine. Signals are Godot's primary decoupling mechanism. If you find yourself writing manager classes or event buses from scratch, you're probably fighting the engine.

This is fundamentally different from ECS frameworks (like MonoGame + Arch) where entities are bags of data and systems operate on queries. In Godot, **nodes ARE the components**, **scenes ARE the prefabs**, and **signals ARE the event bus**.

---

## The Node Tree: How Godot Thinks

Everything in a running Godot game lives in a tree rooted at `SceneTree`:

```
SceneTree (root)
└── Main (Node2D)
    ├── Player (CharacterBody2D)         ← Scene: player.tscn
    │   ├── Sprite2D
    │   ├── CollisionShape2D
    │   ├── AnimationPlayer
    │   ├── HurtboxArea (Area2D)
    │   │   └── CollisionShape2D
    │   └── StateMachine (Node)
    │       ├── IdleState (Node)
    │       ├── RunState (Node)
    │       └── JumpState (Node)
    ├── World (Node2D)                   ← Scene: world.tscn
    │   ├── TileMapLayer
    │   ├── NavigationRegion2D
    │   └── Entities (Node2D)
    │       ├── Goblin (CharacterBody2D) ← Scene: goblin.tscn (instanced)
    │       └── Chest (StaticBody2D)     ← Scene: chest.tscn (instanced)
    ├── UI (CanvasLayer)                 ← Scene: hud.tscn
    │   ├── HealthBar (TextureProgressBar)
    │   ├── ScoreLabel (Label)
    │   └── PauseMenu (Control)
    └── AudioManager (Node)              ← Autoload (global singleton)
```

### Why the Tree Matters

- **Lifecycle propagation:** When a parent is freed, all children are freed. When a parent is hidden, children are hidden. When a parent is paused, children are paused. The tree IS your lifecycle management.
- **Relative coordinates:** A child node's position is relative to its parent. Move the parent, and all children follow. This makes character-attached effects, UI anchoring, and hierarchical transforms trivial.
- **Processing order:** `_process()` and `_physics_process()` traverse the tree top-down. This is deterministic — parent updates before children.
- **Scene instancing:** Any subtree can be saved as a `.tscn` and instanced elsewhere. The `Goblin` scene can be instanced 50 times in a level without duplicating code or configuration.

### Key Insight for Godot Developers

When designing a feature, the question is: **"What nodes do I need, how should I arrange them in the tree, and how do they communicate?"** — not "what class should I inherit from?" or "what components should I attach?"

---

## Scenes: Composition Over Inheritance

Scenes are `.tscn` files — saved node trees that can be instanced at runtime or placed in the editor. They are Godot's answer to composition.

### One Scene Per Logical Entity

```
scenes/
├── characters/
│   ├── player.tscn         — Player character (movement, animation, hitbox)
│   ├── goblin.tscn          — Enemy type
│   └── skeleton.tscn        — Enemy type
├── objects/
│   ├── chest.tscn           — Interactable container
│   ├── door.tscn            — Door with lock/unlock
│   └── projectile.tscn      — Reusable bullet/arrow
├── ui/
│   ├── hud.tscn             — In-game HUD
│   ├── inventory.tscn       — Inventory screen
│   └── dialogue_box.tscn    — NPC dialogue popup
└── levels/
    ├── main_menu.tscn
    ├── level_01.tscn
    └── level_02.tscn
```

### Instancing at Runtime

```gdscript
# Preload the scene (compile-time, faster)
const EnemyScene: PackedScene = preload("res://scenes/characters/goblin.tscn")

# Or load dynamically (runtime, for procedural content)
var enemy_scene: PackedScene = load("res://scenes/characters/goblin.tscn")

# Create an instance and add to the tree
func spawn_enemy(pos: Vector2) -> void:
    var enemy: CharacterBody2D = EnemyScene.instantiate()
    enemy.global_position = pos
    $Entities.add_child(enemy)
```

### Scene Inheritance vs Scene Composition

Godot supports scene inheritance (a scene can extend another), but **composition is almost always better**:

| Approach | When to Use |
|----------|-------------|
| **Composition** (nest scenes) | Default. Enemy scene contains a HealthComponent scene, a HitboxArea scene, etc. |
| **Inheritance** (scene extends scene) | Only when you have a base layout shared by many variants (e.g., BaseEnemy.tscn → Goblin.tscn, Skeleton.tscn) AND the variants only add/override — never remove nodes. |

**Anti-pattern:** Deep inheritance hierarchies. If you're more than 2 levels deep, refactor into composition.

---

## Signals: The Communication Backbone

Signals are Godot's built-in observer pattern. They are the **first tool** you should reach for when two nodes need to communicate.

### Defining and Emitting

```gdscript
# health_component.gd
extends Node
class_name HealthComponent

signal health_changed(new_health: int, max_health: int)
signal died

@export var max_health: int = 100
var current_health: int

func _ready() -> void:
    current_health = max_health

func take_damage(amount: int) -> void:
    current_health = maxi(current_health - amount, 0)
    health_changed.emit(current_health, max_health)
    if current_health == 0:
        died.emit()
```

### Connecting Signals

```gdscript
# In the parent scene's script, wire children together:
func _ready() -> void:
    # Player's health component tells the HUD to update
    $Player/HealthComponent.health_changed.connect($UI/HealthBar._on_health_changed)

    # Player death triggers game over
    $Player/HealthComponent.died.connect(_on_player_died)
```

Or connect in the editor: **Inspector → Node tab → Signals → double-click to connect.** Editor connections are saved in the `.tscn` file and are visible in the node dock.

### When Signals Aren't Enough: The Signal Bus

For communication between unrelated scenes (a coin pickup needs to tell the HUD to update the score, but they're in different branches of the tree), use a **global signal bus**:

```gdscript
# events.gd — Register as Autoload named "Events"
extends Node

# Game state
signal game_started
signal game_paused
signal game_over

# Player events
signal player_died
signal player_respawned
signal score_changed(new_score: int)

# Gameplay events
signal item_picked_up(item: ItemData)
signal enemy_killed(enemy_type: StringName)
signal level_completed(level_id: int)
signal dialogue_started(npc_name: String)
signal dialogue_ended
```

Any node can emit: `Events.score_changed.emit(new_score)`
Any node can listen: `Events.score_changed.connect(_on_score_changed)`

**Rule of thumb:** Use direct signals for parent-child and sibling communication. Use the signal bus for cross-branch and cross-scene communication. If you're passing signals through 3+ intermediate nodes, switch to the bus.

---

## Autoloads: Global Singletons

Nodes registered in **Project Settings → Autoload** persist across scene changes and are accessible globally by name.

### Recommended Autoloads

| Autoload | Purpose |
|----------|---------|
| **Events** | Signal bus for cross-scene communication |
| **GameManager** | Game state, score, progression, current level tracking |
| **AudioManager** | Music crossfading, SFX pooling, volume control |
| **SaveManager** | Save/load with multiple slot support |

### Anti-pattern: Autoload Overload

Every autoload is a global singleton. Globals create implicit dependencies that are hard to test and hard to reason about.

**Guideline:** ≤5 autoloads for most projects. If you're tempted to add more, ask: "Does this REALLY need to persist across scene changes and be globally accessible?" If the answer is no, make it a regular node in the scene.

Things that should NOT be autoloads:
- Player stats (belongs on the player node or a resource)
- Level data (belongs in the level scene)
- UI controllers (belong in the UI scene)
- Enemy spawners (belong in the level scene)

---

## Custom Resources: Data-Driven Design

Resources (`.tres` files) are Godot's data containers — analogous to Unity's ScriptableObjects. They're the backbone of data-driven design.

```gdscript
# item_data.gd
class_name ItemData
extends Resource

@export var id: StringName
@export var display_name: String
@export var icon: Texture2D
@export var description: String
@export_range(0, 100) var damage: int = 0
@export_range(0, 5) var rarity: int = 0
@export var stackable: bool = true
@export var max_stack: int = 99
```

Create instances in the editor: **Right-click in FileSystem → New Resource → ItemData.** Edit all fields in the Inspector. Save as `.tres` (text, VCS-friendly) or `.res` (binary, faster loading).

### Where Resources Shine

- **Item databases** — Each item is a `.tres` file. No code changes to add items.
- **Enemy configurations** — HP, speed, damage, loot tables as exported resources.
- **Weapon definitions** — Damage, fire rate, projectile scene, sound effects.
- **Dialogue trees** — Structured conversation data.
- **Level metadata** — Name, unlock requirements, thumbnail, difficulty rating.
- **Skill/ability data** — Cooldown, mana cost, effect parameters.

### Referencing Resources

```gdscript
# weapon.gd — attached to a weapon scene
extends Node2D

@export var weapon_data: WeaponData  # Drag-and-drop a .tres in the Inspector

func attack() -> void:
    var damage: int = weapon_data.base_damage
    var projectile: PackedScene = weapon_data.projectile_scene
    # ...
```

Designers create and tweak `.tres` files without touching code. Programmers define the structure once in a script.

---

## The State Machine Pattern

The most common Godot pattern for character behavior — states as child nodes:

```
Player (CharacterBody2D)
├── StateMachine (Node)
│   ├── Idle (Node)     ← idle_state.gd
│   ├── Run (Node)      ← run_state.gd
│   ├── Jump (Node)     ← jump_state.gd
│   ├── Fall (Node)     ← fall_state.gd
│   └── Attack (Node)   ← attack_state.gd
├── Sprite2D
├── AnimationPlayer
└── CollisionShape2D
```

```gdscript
# state.gd — Base class for all states
class_name State
extends Node

var character: CharacterBody2D
var state_machine: StateMachine

func enter() -> void:
    pass

func exit() -> void:
    pass

func update(_delta: float) -> void:
    pass

func physics_update(_delta: float) -> void:
    pass
```

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
            child.character = owner as CharacterBody2D
    current_state = initial_state
    current_state.enter()

func _process(delta: float) -> void:
    current_state.update(delta)

func _physics_process(delta: float) -> void:
    current_state.physics_update(delta)

func transition_to(target_state_name: StringName) -> void:
    if not has_node(NodePath(target_state_name)):
        return
    var new_state: State = get_node(NodePath(target_state_name)) as State
    current_state.exit()
    current_state = new_state
    current_state.enter()
```

States are visible in the editor, easy to debug (the active state is just the current child), and each state script is small and focused.

---

## Godot 2D vs 3D: Not the Same Engine

Godot's 2D is **not** flattened 3D (unlike Unity and Unreal). It has a completely separate:

- **Coordinate system** — 2D uses pixels, positive Y is down
- **Physics engine** — 2D has its own physics server
- **Rendering pipeline** — 2D uses CanvasItem, 3D uses Spatial rendering
- **Node types** — `Node2D`, `CharacterBody2D`, `Sprite2D` vs `Node3D`, `CharacterBody3D`, `MeshInstance3D`

This means 2D games are genuinely first-class in Godot — not an afterthought. Pixel-perfect rendering, 2D lighting, 2D particles, and 2D physics all work natively without fighting a 3D-first engine.

**For mixed 2D/3D** (e.g., 3D world with 2D UI): Use `CanvasLayer` nodes to overlay 2D elements on 3D scenes. This is standard and well-supported.

---

## Architecture Comparison: Godot vs MonoGame + Arch ECS

| Concept | MonoGame + Arch | Godot |
|---------|-----------------|-------|
| **Entity** | Arch entity (ID + components) | Node (or scene instance) |
| **Component** | Pure data struct | Node type + exported properties |
| **System** | Class that queries entities | Script attached to a node (or Autoload) |
| **Prefab** | Entity factory function | Scene (`.tscn` file) |
| **Event system** | Arch.EventBus or custom | Signals (built-in) |
| **Singleton** | Service locator / static class | Autoload node |
| **Data definition** | JSON/config files | Custom Resources (`.tres`) |
| **UI framework** | Gum.MonoGame (external) | Control nodes (built-in) |
| **Physics** | Aether.Physics2D (external) | Built-in physics server |
| **Animation** | Custom or library | AnimationPlayer / AnimationTree (built-in) |
| **Level editing** | LDtk / Tiled (external) | Built-in TileMapLayer + editor |

The key shift: MonoGame is a **library** where you build everything. Godot is an **engine** where you compose built-in systems. Less custom code, more editor configuration.

---

## When to Use Godot

### Godot Excels At

- **2D games** — purpose-built 2D pipeline, not a 3D engine pretending
- **Small to mid-size teams** — free, lightweight, fast iteration
- **Prototyping** — GDScript + built-in editor = fastest concept-to-playable pipeline
- **2D platformers, top-down RPGs, visual novels, puzzle games, tower defense, roguelikes** — all natural fits
- **Cross-platform shipping** — one-click export to desktop, mobile, web (GDScript)
- **Open-source contributors** — MIT license, community-driven, no corporate gatekeeping

### Think Twice Before Using Godot For

- **Photorealistic 3D** — Unity/Unreal still lead for AAA visual fidelity
- **Massive multiplayer** (100+ concurrent players) — networking exists but architecture is complex
- **Console release** — requires third-party porting (W4 Games) or custom export templates
- **Performance-extreme games** — GDScript is interpreted; for thousands of entities per frame, consider C#, GDExtension, or a different engine

### Honest Assessment

Godot is the best free 2D game engine available. For 3D, it's rapidly improving but trails Unity/Unreal in tooling, rendering quality, and ecosystem maturity. Choose Godot when the game concept fits its strengths — don't force it into use cases where commercial engines genuinely do better.

---

## Next Steps

- [E2 GDScript vs C#](./E2_gdscript_vs_csharp.md) — Deep-dive into language choice
- [E3 Project Structure](./E3_project_structure.md) — Directory layout, naming, autoload organization
- [G1 Scene Composition](../guides/G1_scene_composition.md) — Hands-on guide to building with scenes
- [G2 State Machine](../guides/G2_state_machine.md) — Full implementation of the node-based FSM
- [G3 Signal Architecture](../guides/G3_signal_architecture.md) — When to use direct signals vs bus vs groups
