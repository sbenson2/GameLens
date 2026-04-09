# G65 — Unity to Godot Migration Guide

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#
> **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [E2 GDScript vs C#](../architecture/E2_gdscript_vs_csharp.md) · [G1 Scene Composition](./G1_scene_composition.md) · [G3 Signal Architecture](./G3_signal_architecture.md) · [G19 Custom Resources & Plugins](./G19_custom_resources_and_plugins.md)

---

## What This Guide Covers

This guide maps Unity concepts to their Godot equivalents, explains the fundamental architectural differences, and provides practical translation patterns for developers migrating projects or mental models from Unity to Godot 4.x. It covers project structure, scripting, physics, UI, audio, assets, and the paradigm shifts that cause the most friction.

**Use this guide when:** you know Unity and are starting with Godot, porting a Unity project, or helping a team member make the transition.

**This guide assumes:** working knowledge of Unity (GameObjects, Components, Prefabs, Scenes, C#).

---

## Table of Contents

1. [Mental Model — The Big Shift](#1-mental-model--the-big-shift)
2. [Concept Mapping Table](#2-concept-mapping-table)
3. [Project Structure](#3-project-structure)
4. [Scripting — C# and GDScript](#4-scripting--c-and-gdscript)
5. [Scene and Node Architecture](#5-scene-and-node-architecture)
6. [Physics Translation](#6-physics-translation)
7. [UI — Unity UI vs Godot Control](#7-ui--unity-ui-vs-godot-control)
8. [Audio](#8-audio)
9. [Animation](#9-animation)
10. [Assets and Import](#10-assets-and-import)
11. [Signals vs Unity Events](#11-signals-vs-unity-events)
12. [Common Gotchas](#12-common-gotchas)

---

## 1. Mental Model — The Big Shift

Unity uses a **flat entity-component** model: GameObjects are containers, and you attach Component scripts to add behavior. Multiple scripts on one GameObject are common, and GetComponent<T>() is the primary way to communicate between them.

Godot uses a **tree-of-nodes** model: Nodes are both the entity and the behavior. A `CharacterBody3D` is not a generic container with a physics component attached — it *is* the physics body. You compose behavior by building a tree of specialized nodes, each responsible for one thing.

| Unity | Godot |
|-------|-------|
| "Attach a Rigidbody component to a GameObject" | "Use a RigidBody3D node" |
| "Attach a script to a GameObject" | "Attach a script to a Node" |
| "Create a Prefab" | "Save a scene (.tscn) and instance it" |
| "GetComponent<AudioSource>()" | "Use `$AudioStreamPlayer` (child node reference)" |

The Godot equivalent of "adding a component" is **adding a child node**. Need audio? Add an `AudioStreamPlayer3D` as a child. Need a health bar? Add a `ProgressBar` child. Your script talks to children via `$NodeName` or `@onready var`.

---

## 2. Concept Mapping Table

| Unity Concept | Godot Equivalent | Notes |
|---------------|-----------------|-------|
| GameObject | Node | Base building block |
| Component | Node (child) | No "component" abstraction — just child nodes |
| Prefab | PackedScene (.tscn) | Scenes can be instanced into other scenes — and nested freely |
| Scene (Unity) | SceneTree / main scene | Unity's "Scene" = a file with a hierarchy. Godot scenes are composable. |
| Hierarchy panel | Scene panel | Same concept — the node tree |
| Inspector | Inspector | Nearly identical purpose |
| MonoBehaviour | Node (with script) | Base class for all scripted behavior |
| `Start()` | `_ready()` | Called when node enters the tree |
| `Update()` | `_process(delta)` | Called every frame |
| `FixedUpdate()` | `_physics_process(delta)` | Called every physics tick |
| `OnDestroy()` | `_exit_tree()` or `_notification(NOTIFICATION_PREDELETE)` | Cleanup |
| `Awake()` | `_init()` or `_enter_tree()` | `_init()` = constructor, `_enter_tree()` = first added to tree |
| `[SerializeField]` | `@export` | Expose variable to Inspector |
| `[Header("X")]` | `@export_group("X")` | Group exports in Inspector |
| `DontDestroyOnLoad()` | Autoload singleton | Persistent across scene changes |
| `SceneManager.LoadScene()` | `get_tree().change_scene_to_file()` or `change_scene_to_packed()` | Scene transitions |
| UnityEvent | Signal | Observer pattern |
| `GetComponent<T>()` | `$ChildNode` or `get_node()` | Access sibling/child nodes |
| `FindObjectOfType<T>()` | Groups (`get_tree().get_nodes_in_group()`) | Find nodes by group, not by type |
| `Instantiate(prefab)` | `scene.instantiate()` | Create an instance of a PackedScene |
| `Destroy(obj)` | `node.queue_free()` | Remove node at end of frame |
| Tag | Group | Nodes can be in multiple groups |
| Layer (physics) | Collision Layer / Mask | Bitmask-based, same concept |
| Coroutine | `await` + signals or timers | `await get_tree().create_timer(1.0).timeout` |
| `Invoke("Method", delay)` | `get_tree().create_timer(delay).timeout.connect(method)` | Timer-based delay |
| ScriptableObject | Resource (.tres) | Data containers, shared across instances |
| AssetBundle | PCK / ResourceLoader | `ResourceLoader.load_threaded_request()` for async |
| Animator Controller | AnimationTree | State machine + blend trees |
| NavMeshAgent | NavigationAgent3D | Built-in pathfinding |
| PlayerPrefs | ConfigFile or FileAccess | No built-in key-value store — use `ConfigFile` |

---

## 3. Project Structure

### Unity

```
Assets/
├── Scripts/
├── Prefabs/
├── Materials/
├── Scenes/
├── Resources/  ← special folder
└── Plugins/
```

### Godot

```
res://
├── scenes/          ← .tscn files (equivalent of both Scenes and Prefabs)
├── scripts/         ← .gd or .cs files
├── resources/       ← .tres files (no special "Resources" folder)
├── art/
├── audio/
└── addons/          ← equivalent of Plugins
```

**Key differences:**
- Godot has no "Assets" wrapper — `res://` is the project root.
- There is no special "Resources" folder. Any resource can be loaded by path: `load("res://resources/weapon_data.tres")`.
- `.tscn` files are Godot's answer to both Unity Scenes and Prefabs. A player scene can be instanced into a level scene just like a prefab — there is no separate prefab system.
- `.import` files are auto-generated metadata — commit them to version control but don't edit them.

---

## 4. Scripting — C# and GDScript

### Lifecycle Methods

```
Unity C#                          Godot GDScript           Godot C#
──────────                        ──────────────           ──────────
Awake()                           _init()                  _Init() (rare)
OnEnable()                        _enter_tree()            _EnterTree()
Start()                           _ready()                 _Ready()
Update()                          _process(delta)          _Process(delta)
FixedUpdate()                     _physics_process(delta)  _PhysicsProcess(delta)
LateUpdate()                      (no equivalent)          (no equivalent)
OnDisable()                       _exit_tree()             _ExitTree()
OnDestroy()                       _notification(PREDELETE) (notification)
```

**Note:** Godot has no `LateUpdate()`. If you need post-movement camera updates, use `_process()` with a processing priority or connect to signals.

### Variable Export

```csharp
// Unity C#
[SerializeField] private float speed = 5f;
[Range(0, 100)] public int health = 100;
[Header("Movement")]
public float jumpForce = 10f;
```

```gdscript
# Godot GDScript
@export var speed: float = 5.0
@export_range(0, 100) var health: int = 100
@export_group("Movement")
@export var jump_force: float = 10.0
```

```csharp
// Godot C#
[Export] public float Speed { get; set; } = 5f;
[Export(PropertyHint.Range, "0,100")] public int Health { get; set; } = 100;
[ExportGroup("Movement")]
[Export] public float JumpForce { get; set; } = 10f;
```

### Node References

```csharp
// Unity — GetComponent on same GameObject
var rb = GetComponent<Rigidbody>();
var health = GetComponentInChildren<HealthBar>();
```

```gdscript
# Godot — access child nodes in tree
@onready var sprite: Sprite2D = $Sprite2D
@onready var health_bar: ProgressBar = $UI/HealthBar
@onready var audio: AudioStreamPlayer = $AudioStreamPlayer

# Or use get_node() for dynamic paths
var child := get_node("Path/To/Child")
```

### Instantiation

```csharp
// Unity
public GameObject enemyPrefab;
var enemy = Instantiate(enemyPrefab, position, rotation);
```

```gdscript
# Godot
@export var enemy_scene: PackedScene

func spawn_enemy(pos: Vector3) -> void:
    var enemy := enemy_scene.instantiate()
    enemy.global_position = pos
    add_child(enemy)  # Must add to tree!
```

**Key difference:** In Godot, `instantiate()` creates the node but doesn't add it to the scene tree. You must explicitly call `add_child()`. In Unity, `Instantiate()` does both at once.

---

## 5. Scene and Node Architecture

### Unity's Prefab vs Godot's Scene

In Unity, a Prefab is a special asset that can be instantiated. Scenes are separate files loaded via `SceneManager`. These are two distinct concepts with different workflows.

In Godot, there is only **the scene**. A `.tscn` file can be:
- The "main scene" (like a Unity Scene)
- Instanced as a child of another scene (like a Unity Prefab)
- Both at the same time

This means a `Player.tscn` can be opened for editing on its own *and* instanced into `Level01.tscn`. Nested scenes can be nested infinitely.

### Composition Pattern

```
Unity approach:                    Godot approach:
═══════════════                    ═══════════════
GameObject "Player"                CharacterBody3D (Player.tscn)
  ├── PlayerController (script)    ├── CollisionShape3D
  ├── CharacterController (comp)   ├── Model (MeshInstance3D)
  ├── Animator (comp)              ├── AnimationPlayer
  ├── AudioSource (comp)           ├── AudioStreamPlayer3D
  └── HealthComponent (script)     ├── HealthBar.tscn (instanced scene)
                                   └── Script: player.gd
```

---

## 6. Physics Translation

| Unity | Godot | Notes |
|-------|-------|-------|
| Rigidbody / Rigidbody2D | RigidBody3D / RigidBody2D | Physics-driven |
| CharacterController | CharacterBody3D / CharacterBody2D | Code-driven movement |
| BoxCollider / SphereCollider | CollisionShape3D + Shape resource | Shape is a separate resource |
| Collider (trigger) | Area3D / Area2D | Dedicated trigger detection node |
| `OnCollisionEnter()` | `body_entered` signal on RigidBody | Signal-based |
| `OnTriggerEnter()` | `body_entered` signal on Area3D | Signal-based |
| Physics.Raycast() | `PhysicsRayQueryParameters3D` + `get_world_3d().direct_space_state` | More verbose but more powerful |
| Layer / LayerMask | Collision Layer (what I am) / Mask (what I detect) | Same idea, bitmask |

### Raycasting Comparison

```csharp
// Unity
if (Physics.Raycast(origin, direction, out RaycastHit hit, 100f))
{
    Debug.Log(hit.collider.name);
}
```

```gdscript
# Godot
var space := get_world_3d().direct_space_state
var query := PhysicsRayQueryParameters3D.create(origin, origin + direction * 100.0)
var result := space.intersect_ray(query)
if result:
    print(result.collider.name)
```

---

## 7. UI — Unity UI vs Godot Control

Unity has had multiple UI systems (IMGUI, Unity UI/uGUI, UI Toolkit). Godot has one: **Control nodes**.

| Unity UI | Godot | Notes |
|----------|-------|-------|
| Canvas | CanvasLayer (optional) | Godot UI works without a Canvas |
| RectTransform | Control (anchor + margin system) | Similar anchor concept |
| Text / TextMeshPro | Label / RichTextLabel | RichTextLabel supports BBCode |
| Button | Button | Same concept |
| Image | TextureRect | Displays a texture |
| Slider | HSlider / VSlider | |
| Layout Group | HBoxContainer / VBoxContainer / GridContainer | More intuitive in Godot |
| ScrollRect | ScrollContainer | |

Godot's UI is widely considered more intuitive than Unity's. The Container system (HBox, VBox, Grid, Margin) auto-layouts children without manually configuring Layout Groups.

### Theme System

Godot's `Theme` resource is like a CSS stylesheet — define colors, fonts, and styles once and apply them to an entire UI tree. This replaces Unity's scattered per-component styling.

```gdscript
# Apply a theme to a root Control — all children inherit it
$UI.theme = preload("res://ui/game_theme.tres")
```

---

## 8. Audio

| Unity | Godot |
|-------|-------|
| AudioSource | AudioStreamPlayer / AudioStreamPlayer2D / AudioStreamPlayer3D |
| AudioListener | AudioListener3D (or camera default) |
| AudioMixer | AudioBus (built-in bus system) |
| AudioClip | AudioStream (.wav, .ogg, .mp3) |

Godot's audio bus system is configured in the **Audio** tab at the bottom of the editor. You route AudioStreamPlayers to named buses, add effects (reverb, EQ, compressor) per bus, and control volume globally.

```gdscript
# Play a sound
$AudioStreamPlayer.stream = preload("res://audio/sfx/jump.ogg")
$AudioStreamPlayer.bus = "SFX"
$AudioStreamPlayer.play()

# Adjust bus volume
AudioServer.set_bus_volume_db(AudioServer.get_bus_index("Music"), -6.0)
```

---

## 9. Animation

| Unity | Godot |
|-------|-------|
| Animator + AnimatorController | AnimationPlayer + AnimationTree |
| Animation clip (.anim) | Animation resource (embedded in AnimationPlayer) |
| Blend Tree | AnimationNodeBlendTree (inside AnimationTree) |
| State Machine (Animator layers) | AnimationNodeStateMachine (inside AnimationTree) |
| Animation Events | Method call tracks in AnimationPlayer |

Godot's `AnimationPlayer` can animate **any** property on **any** node — not just transforms and materials but exported variables, colors, modulate values, shader parameters, and even method calls. This is more flexible than Unity's Animation window.

---

## 10. Assets and Import

### 3D Models

| Format | Unity | Godot |
|--------|-------|-------|
| .fbx | Preferred | Supported (via ufbx) |
| .gltf / .glb | Supported | **Preferred** — best pipeline |
| .blend | Via FBX export | **Direct import** — Godot calls Blender in background |
| .obj | Supported | Supported |

**Recommendation:** Use `.glb` (binary glTF) as your interchange format. It's an open standard, compact, and both engines handle it well. For Blender users, Godot can import `.blend` files directly if Blender is installed.

### Textures

Godot auto-imports PNG, JPG, WebP, and other formats. The import settings (compression, filter, mipmap) are configured per-file in the Import dock — similar to Unity's texture import settings.

### Shaders

Unity's Shader Graph → Godot's **VisualShader** (node-based) or Godot's **shader language** (text-based, GLSL-like). Godot's shader language is simpler than HLSL/CG but handles most use cases. There is no direct shader conversion tool.

---

## 11. Signals vs Unity Events

Unity uses `UnityEvent` (Inspector-assignable) and C# `event`/`Action` (code-only). Godot uses **signals**, which combine the best of both.

```csharp
// Unity — C# event
public event Action<int> OnHealthChanged;
OnHealthChanged?.Invoke(newHealth);
```

```gdscript
# Godot — signal
signal health_changed(new_health: int)
health_changed.emit(new_health)

# Connect from code
$Enemy.health_changed.connect(_on_enemy_health_changed)

# Or connect in the Editor via the Node > Signals panel
```

Signals can also be connected in the editor's **Node** dock (right-click a signal → Connect). This is similar to Unity's `UnityEvent` Inspector wiring but cleaner.

---

## 12. Common Gotchas

**"Where are my components?"** There are no components. If you want physics, use a physics node. If you want audio, add an audio node as a child. Stop thinking in "attach" and start thinking in "compose a tree."

**`@onready` is essential.** In Unity, `GetComponent<T>()` works in `Start()` because components exist immediately. In Godot, child nodes aren't ready until `_ready()`. Use `@onready var sprite := $Sprite2D` to safely reference children.

**Godot C# differences.** Godot's C# is not Unity's C#. Signal connections use `+=` syntax with Godot's callable system. Properties use PascalCase (`Position`, `Velocity`). The API matches GDScript semantics, not Unity's.

**Scene changes clear everything.** `get_tree().change_scene_to_file()` replaces the entire tree. There is no `DontDestroyOnLoad()` — use **Autoloads** (Project Settings > Autoload) for persistent managers, similar to a singleton pattern.

**No Asset Store — use the AssetLib.** Godot's equivalent of Unity's Asset Store is the **AssetLib** (accessible from the editor). Community addons are also distributed via GitHub. The ecosystem is smaller but growing rapidly.

**Version control.** Commit `.tscn`, `.tres`, `.import` files, and the `project.godot` file. These are text-based and merge-friendly (unlike Unity's binary scenes without ForceText mode). See [G44 Version Control](./G44_version_control_for_godot.md).

**No `LateUpdate()` equivalent.** For camera follow or post-movement logic, set the node's `process_priority` to a high value so it runs after other nodes:

```gdscript
func _ready() -> void:
    process_priority = 100  # Runs after default (0) nodes
```
