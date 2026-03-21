# E2 — GDScript vs C#: Language Choice Deep-Dive

> **Engine:** Godot 4.4+ · **Tier:** Free  
> **Audience:** Developers choosing between GDScript and C# for a Godot project  
> **Prerequisites:** Basic familiarity with Godot's node tree and scene system ([E1 Architecture Overview](./E1_architecture_overview.md))

---

## Table of Contents

1. [Overview](#1-overview)
2. [GDScript Fundamentals](#2-gdscript-fundamentals)
3. [C# in Godot Fundamentals](#3-c-in-godot-fundamentals)
4. [Syntax Comparison](#4-syntax-comparison)
5. [Type System Deep-Dive](#5-type-system-deep-dive)
6. [Performance Characteristics](#6-performance-characteristics)
7. [Tooling & Editor Integration](#7-tooling--editor-integration)
8. [Platform Export Compatibility](#8-platform-export-compatibility)
9. [Ecosystem & Libraries](#9-ecosystem--libraries)
10. [Interop: Mixing Languages](#10-interop-mixing-languages)
11. [Migration Patterns](#11-migration-patterns)
12. [Decision Framework](#12-decision-framework)
13. [Common Mistakes by Language Background](#13-common-mistakes-by-language-background)
14. [Team & Project Scaling](#14-team--project-scaling)
15. [Future Outlook](#15-future-outlook)
16. [Quick Reference](#16-quick-reference)

---

## 1. Overview

Godot offers two first-class scripting languages: **GDScript** (a Python-like language designed for the engine) and **C#** (via .NET 8+). Both can access the full engine API, but they differ in performance, ecosystem, tooling, and community support.

### The Short Answer

| If you are... | Use |
|---|---|
| New to programming | GDScript |
| Prototyping or game-jamming | GDScript |
| Coming from Unity/C# background | C# (but learn GDScript basics) |
| Building for web (HTML5) | GDScript (C# web export unavailable) |
| Need peak computational performance | C# (or GDExtension for extreme cases) |
| Working on a team with mixed experience | GDScript (lower barrier) |
| Solo developer, any background | GDScript (faster iteration) |

### Community Adoption (2025–2026)

GDScript dominates the Godot ecosystem:

- **~84%** of Godot projects use GDScript exclusively
- **~10%** use C# exclusively
- **~6%** mix both languages

This means tutorials, forum answers, addon code, and example projects overwhelmingly use GDScript. Choosing C# means translating most community resources mentally or literally.

---

## 2. GDScript Fundamentals

GDScript is a high-level, dynamically-typed (with optional static typing) language designed specifically for Godot. It compiles to bytecode at editor load time.

### Key Characteristics

- **Indentation-based** syntax (like Python)
- **First-class engine integration** — signals, exports, node paths are language features
- **Optional static typing** — gradually add types as the project matures
- **Hot reload** — edit scripts while the game runs, changes apply instantly
- **Built-in editor** — code completion, debugger, profiler, all inside Godot

### Modern Typed GDScript (4.4+)

Always use typed GDScript for production code. It catches errors at parse time and improves performance:

```gdscript
class_name Player
extends CharacterBody2D

## Movement tuning — editable in the Inspector.
@export_group("Movement")
@export var move_speed: float = 300.0
@export var acceleration: float = 2000.0
@export var friction: float = 1800.0

## Jump tuning.
@export_group("Jump")
@export var jump_velocity: float = -450.0
@export var gravity_scale: float = 1.0

## Emitted when the player takes damage.
signal damage_taken(amount: int, source: Node2D)

## Emitted when health reaches zero.
signal died

var health: int = 100
var _is_invincible: bool = false

@onready var animation_player: AnimationPlayer = $AnimationPlayer
@onready var sprite: Sprite2D = $Sprite2D


func _physics_process(delta: float) -> void:
	_apply_gravity(delta)
	_handle_movement(delta)
	move_and_slide()


func _apply_gravity(delta: float) -> void:
	if not is_on_floor():
		velocity.y += ProjectSettings.get_setting(
			"physics/2d/default_gravity"
		) as float * gravity_scale * delta


func _handle_movement(delta: float) -> void:
	var direction: float = Input.get_axis("move_left", "move_right")
	if direction != 0.0:
		velocity.x = move_toward(
			velocity.x, direction * move_speed, acceleration * delta
		)
	else:
		velocity.x = move_toward(velocity.x, 0.0, friction * delta)


func take_damage(amount: int, source: Node2D) -> void:
	if _is_invincible:
		return
	health -= amount
	damage_taken.emit(amount, source)
	if health <= 0:
		died.emit()
```

### GDScript Strengths

- **Fastest iteration speed** — change a line, press F5, see the result
- **Signal syntax is native** — `signal foo(bar: int)` and `foo.emit(42)` are language keywords
- **`@export` with groups** — Inspector integration requires zero boilerplate
- **`@onready`** — deferred initialization tied to the node lifecycle
- **`await`** — first-class coroutine support for async operations
- **Pattern matching** — `match` statement covers enums, types, arrays, dictionaries
- **Lambdas** — `var fn := func(x: int) -> int: return x * 2`
- **Annotations** — `@tool`, `@icon`, `@export_range`, etc.

### GDScript Limitations

- **No generics** — cannot write `Array[T]` where `T` is a type parameter
- **No interfaces or traits** — use duck typing, `class_name` checks, or `has_method()`
- **Limited refactoring tools** — rename-symbol is basic compared to Rider/VS Code
- **No package manager** — copy scripts or use addons from the Asset Library
- **Computational ceiling** — bytecode interpreter is 3–10× slower than compiled C#

---

## 3. C# in Godot Fundamentals

Godot's C# support uses the **.NET 8+ runtime** with source generators for engine bindings. Scripts are standard C# classes that extend Godot node types.

### Key Characteristics

- **Full .NET ecosystem** — NuGet packages, LINQ, async/await, generics
- **AOT compilation** — ahead-of-time compilation for performance and smaller binaries
- **External editor required** — VS Code, Rider, or Visual Studio (no built-in C# editor in Godot)
- **Source generators** — `[Export]`, `[Signal]`, partial classes generate binding code at compile time

### C# Equivalent of the Player Above

```csharp
using Godot;

[GlobalClass]
public partial class Player : CharacterBody2D
{
    [ExportGroup("Movement")]
    [Export] public float MoveSpeed { get; set; } = 300f;
    [Export] public float Acceleration { get; set; } = 2000f;
    [Export] public float Friction { get; set; } = 1800f;

    [ExportGroup("Jump")]
    [Export] public float JumpVelocity { get; set; } = -450f;
    [Export] public float GravityScale { get; set; } = 1f;

    [Signal] public delegate void DamageTakenEventHandler(int amount, Node2D source);
    [Signal] public delegate void DiedEventHandler();

    private int _health = 100;
    private bool _isInvincible;
    private AnimationPlayer _animationPlayer = null!;
    private Sprite2D _sprite = null!;

    public override void _Ready()
    {
        _animationPlayer = GetNode<AnimationPlayer>("AnimationPlayer");
        _sprite = GetNode<Sprite2D>("Sprite2D");
    }

    public override void _PhysicsProcess(double delta)
    {
        ApplyGravity(delta);
        HandleMovement(delta);
        MoveAndSlide();
    }

    private void ApplyGravity(double delta)
    {
        if (!IsOnFloor())
        {
            var gravity = (float)ProjectSettings.GetSetting(
                "physics/2d/default_gravity"
            );
            var vel = Velocity;
            vel.Y += gravity * GravityScale * (float)delta;
            Velocity = vel;
        }
    }

    private void HandleMovement(double delta)
    {
        float direction = Input.GetAxis("move_left", "move_right");
        var vel = Velocity;
        vel.X = direction != 0f
            ? Mathf.MoveToward(vel.X, direction * MoveSpeed, Acceleration * (float)delta)
            : Mathf.MoveToward(vel.X, 0f, Friction * (float)delta);
        Velocity = vel;
    }

    public void TakeDamage(int amount, Node2D source)
    {
        if (_isInvincible) return;
        _health -= amount;
        EmitSignal(SignalName.DamageTaken, amount, source);
        if (_health <= 0)
            EmitSignal(SignalName.Died);
    }
}
```

### C# Strengths

- **Generics** — `List<T>`, `Dictionary<K, V>`, custom generic types
- **Interfaces** — enforce contracts across unrelated node types
- **NuGet ecosystem** — JSON serialization, networking, data structures, math libraries
- **Refactoring tooling** — Rider and VS Code provide rename, extract method, find usages
- **Performance** — JIT and AOT compilation produce fast native code
- **Familiar for Unity developers** — similar patterns, same language
- **LINQ** — powerful collection querying

### C# Limitations

- **No web export** — HTML5 builds require GDScript (as of Godot 4.4)
- **No GDExtension bindings** — cannot call GDExtension APIs from C#
- **Verbose engine interop** — `Velocity` is a struct, must copy/modify/reassign
- **Partial class requirement** — every Godot node script must be `partial`
- **Signal boilerplate** — `[Signal] public delegate void FooEventHandler(...)` is verbose
- **Hot reload issues** — recompiling C# can cause state loss in running scenes
- **Smaller community** — ~84% of resources are GDScript-only

### C# Gotcha: Velocity Is a Struct

The single most common C# frustration in Godot:

```csharp
// ❌ DOES NOT WORK — Velocity is a value type, this modifies a copy
Velocity.X = 100f;

// ✅ CORRECT — copy, modify, reassign
var vel = Velocity;
vel.X = 100f;
Velocity = vel;

// ✅ ALSO CORRECT — construct a new Vector2
Velocity = new Vector2(100f, Velocity.Y);
```

This applies to all struct-type properties (`Position`, `Scale`, `Rotation`, etc.) on Godot nodes accessed from C#.

---

## 4. Syntax Comparison

Side-by-side comparison of common patterns:

### Variable Declaration

```gdscript
# GDScript
var speed: float = 200.0
var name := "Player"          # Type inferred
const MAX_HP: int = 100
@export var damage: int = 10
```

```csharp
// C#
private float _speed = 200f;
private string _name = "Player";
private const int MaxHp = 100;
[Export] public int Damage { get; set; } = 10;
```

### Signals

```gdscript
# GDScript — declare and emit
signal health_changed(new_value: int)
health_changed.emit(current_health)

# Connect
player.health_changed.connect(_on_health_changed)
func _on_health_changed(value: int) -> void:
    label.text = str(value)
```

```csharp
// C# — declare, emit, connect
[Signal] public delegate void HealthChangedEventHandler(int newValue);
EmitSignal(SignalName.HealthChanged, currentHealth);

// Connect
player.HealthChanged += OnHealthChanged;
private void OnHealthChanged(int value)
{
    _label.Text = value.ToString();
}
```

### Node References

```gdscript
# GDScript
@onready var sprite: Sprite2D = $Sprite2D
@onready var timer: Timer = $Timers/CooldownTimer

# Alternative — get_node with type cast
var enemy := get_node("../Enemies/Goblin") as CharacterBody2D
```

```csharp
// C# — no @onready equivalent; use _Ready()
private Sprite2D _sprite = null!;
private Timer _timer = null!;

public override void _Ready()
{
    _sprite = GetNode<Sprite2D>("Sprite2D");
    _timer = GetNode<Timer>("Timers/CooldownTimer");
}
```

### Coroutines

```gdscript
# GDScript
func flash_damage() -> void:
    sprite.modulate = Color.RED
    await get_tree().create_timer(0.15).timeout
    sprite.modulate = Color.WHITE
```

```csharp
// C# — use async/await with ToSignal
private async void FlashDamage()
{
    _sprite.Modulate = Colors.Red;
    await ToSignal(GetTree().CreateTimer(0.15), Timer.SignalName.Timeout);
    _sprite.Modulate = Colors.White;
}
```

### Enums

```gdscript
# GDScript
enum State { IDLE, RUN, JUMP, FALL, ATTACK }
var current_state: State = State.IDLE
```

```csharp
// C#
public enum State { Idle, Run, Jump, Fall, Attack }
private State _currentState = State.Idle;
```

### Dictionary / Resource Access

```gdscript
# GDScript
var inventory: Dictionary[String, int] = {}
inventory["sword"] = 1

var item_data: ItemData = load("res://data/items/sword.tres") as ItemData
```

```csharp
// C#
private Dictionary<string, int> _inventory = new();
_inventory["sword"] = 1;

var itemData = GD.Load<ItemData>("res://data/items/sword.tres");
```

---

## 5. Type System Deep-Dive

### GDScript Typing Levels

GDScript supports **gradual typing** — you can mix typed and untyped code in the same file:

```gdscript
# Level 0: No types (valid but discouraged)
var speed = 200
func move(delta):
    position.x += speed * delta

# Level 1: Explicit types (recommended minimum)
var speed: float = 200.0
func move(delta: float) -> void:
    position.x += speed * delta

# Level 2: Inferred types (concise, type-safe)
var speed := 200.0
@onready var sprite := $Sprite2D as Sprite2D

# Level 3: Full strict typing (maximum safety)
# Enable in Project Settings → Debug → GDScript → Untyped Declaration = Error
```

### Typed Arrays and Dictionaries (4.4+)

```gdscript
# Typed arrays — elements are validated at assignment
var enemies: Array[CharacterBody2D] = []
var scores: Array[int] = [100, 200, 300]

# Typed dictionaries (Godot 4.4+)
var inventory: Dictionary[String, int] = {"sword": 1, "potion": 5}
var stats: Dictionary[StringName, float] = {
    &"strength": 10.0,
    &"dexterity": 8.0,
}

# Nested typed containers
var grid: Array[Array[int]] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
```

### C# Type Advantages

C# provides stronger type guarantees that matter at scale:

```csharp
// Generics — reusable, type-safe containers
public class ObjectPool<T> where T : Node, new()
{
    private readonly Queue<T> _available = new();

    public T Get()
    {
        return _available.Count > 0 ? _available.Dequeue() : new T();
    }

    public void Return(T obj)
    {
        obj.Visible = false;
        _available.Enqueue(obj);
    }
}

// Interfaces — enforce contracts without inheritance
public interface IDamageable
{
    int Health { get; }
    void TakeDamage(int amount, Node2D source);
}

public interface IInteractable
{
    string InteractPrompt { get; }
    void Interact(Node2D actor);
}

// A node can implement multiple interfaces
public partial class Barrel : StaticBody2D, IDamageable, IInteractable
{
    public int Health { get; private set; } = 30;
    public string InteractPrompt => "Open barrel";

    public void TakeDamage(int amount, Node2D source) { /* ... */ }
    public void Interact(Node2D actor) { /* ... */ }
}
```

### GDScript Workarounds for No Interfaces

```gdscript
# Pattern 1: Duck typing with has_method()
func interact_with(target: Node) -> void:
    if target.has_method("interact"):
        target.interact(self)

# Pattern 2: Group membership
func damage_all_in_area(area: Area2D, amount: int) -> void:
    for body: Node2D in area.get_overlapping_bodies():
        if body.is_in_group("damageable"):
            body.take_damage(amount, self)

# Pattern 3: class_name check
func _on_body_entered(body: Node2D) -> void:
    if body is Player:
        body.collect_item(item_data)
```

---

## 6. Performance Characteristics

### Benchmarks (Approximate — Godot 4.4, 2026)

| Operation | GDScript | C# (.NET 8 JIT) | Ratio |
|---|---|---|---|
| Simple loop (1M iterations) | ~120 ms | ~12 ms | C# ~10× faster |
| Vector math (100K ops) | ~45 ms | ~5 ms | C# ~9× faster |
| Dictionary lookup (100K) | ~30 ms | ~8 ms | C# ~4× faster |
| Array sort (10K elements) | ~15 ms | ~3 ms | C# ~5× faster |
| Node instantiation (1K) | ~80 ms | ~75 ms | Nearly equal |
| Signal emission (10K) | ~12 ms | ~14 ms | Nearly equal |
| Scene tree traversal (5K nodes) | ~20 ms | ~18 ms | Nearly equal |

### What the Benchmarks Mean

**Engine-bound operations** (node creation, signal emission, physics queries, rendering) have nearly identical performance in both languages because the work happens in the C++ engine core. The language choice only affects **script-side computation**.

### When GDScript Performance Is Sufficient

- **Most 2D games** — platformers, RPGs, visual novels, puzzle games
- **Turn-based games** — computation happens between turns, not every frame
- **Games with < 500 active entities** — per-frame script overhead is negligible
- **Prototypes and game jams** — iteration speed matters more than runtime speed

### When C# Performance Matters

- **Pathfinding for 100+ agents** every frame
- **Procedural generation** — dungeon gen, terrain gen, noise computation
- **Particle custom logic** — computing 10K+ particle behaviors in script
- **Physics-heavy simulations** — custom soft-body, fluid, cloth (not using engine physics)
- **Large data processing** — serialization, compression, complex AI decision trees

### The Performance Ladder

When GDScript is too slow, you have multiple escalation options:

```
GDScript (bytecode)
  ↓ 3-10× faster
C# (.NET 8 JIT / AOT)
  ↓ 1-3× faster
GDExtension (C++ / Rust)
  ↓ engine-native speed
Engine modification (rebuild Godot)
```

Most games never need to leave GDScript. For the hot paths that do, C# or GDExtension handles them. A common pattern is writing 95% in GDScript and moving 1–2 performance-critical systems to GDExtension.

---

## 7. Tooling & Editor Integration

### GDScript Tooling

| Feature | Status |
|---|---|
| Built-in code editor | ✅ Full-featured, integrated in Godot |
| Code completion | ✅ Excellent — node paths, signals, properties |
| Debugger | ✅ Breakpoints, step, watch, stack trace |
| Profiler | ✅ Built-in frame profiler + monitors |
| Hot reload | ✅ Instant — edit while running |
| Rename symbol | ⚠️ Basic — local scope only |
| Find all references | ⚠️ Text search (no semantic analysis) |
| External editor support | ✅ VS Code with godot-tools extension |
| LSP | ✅ Built-in language server |
| Linting | ⚠️ Warnings for unused vars, untyped code |

### C# Tooling

| Feature | Status |
|---|---|
| Built-in code editor | ❌ Must use external editor |
| Code completion | ✅ Excellent in Rider / VS Code with C# Dev Kit |
| Debugger | ✅ Attach to running Godot instance |
| Profiler | ✅ .NET profiling tools + Godot profiler |
| Hot reload | ⚠️ Partial — may lose runtime state |
| Rename symbol | ✅ Full semantic rename across project |
| Find all references | ✅ Full semantic analysis |
| External editor support | ✅ Required (Rider, VS Code, Visual Studio) |
| LSP | ✅ OmniSharp / Roslyn-based |
| Linting | ✅ Roslyn analyzers, StyleCop, SonarQube |

### Editor Recommendation by Language

- **GDScript** → Use Godot's built-in editor for small–medium projects. Switch to VS Code with `godot-tools` extension for larger projects (better search, multi-file editing).
- **C#** → **JetBrains Rider** is the gold standard (best Godot C# support, refactoring, debugging). VS Code with C# Dev Kit is the free alternative. Visual Studio works but has the weakest Godot integration.

---

## 8. Platform Export Compatibility

| Platform | GDScript | C# (.NET 8) |
|---|---|---|
| Windows | ✅ | ✅ |
| macOS | ✅ | ✅ |
| Linux | ✅ | ✅ |
| Android | ✅ | ✅ |
| iOS | ✅ | ✅ (AOT required) |
| Web (HTML5) | ✅ | ❌ Not supported |
| Steam Deck | ✅ | ✅ |
| Consoles (Switch, PS, Xbox) | ✅ (via W4 Games) | ⚠️ Limited (AOT, no JIT on consoles) |

### Web Export Is GDScript-Only

This is the **single biggest platform restriction** for C#. If your game needs a web build (itch.io web player, Newgrounds, browser demos), you must use GDScript. There is no workaround — the .NET runtime cannot run in a browser WebAssembly context with Godot's current architecture.

### Console Considerations

Console exports require third-party services (W4 Games). C# on consoles requires AOT compilation and has additional restrictions (no `System.Reflection.Emit`, limited dynamic code). GDScript has fewer constraints on consoles.

---

## 9. Ecosystem & Libraries

### GDScript Ecosystem

The GDScript ecosystem centers on **Godot Asset Library** addons:

```
Asset Library addons: ~3,000+ (most are GDScript)
Community plugins:   Dialogic 2, Phantom Camera, LimboAI, SmartShape2D
Data formats:        ConfigFile, JSON, custom Resource (.tres)
Networking:          Built-in MultiplayerAPI, ENet, WebSocket
Testing:             GdUnit4 (xUnit-style), Gut (older)
```

### C# Ecosystem

C# brings the full .NET ecosystem via NuGet:

```
NuGet packages:      500,000+ (not all compatible with Godot)
Serialization:       System.Text.Json, Newtonsoft.Json, MessagePack
Networking:          LiteNetLib, Steamworks.NET (via NuGet)
Data:                SQLite, LiteDB
Testing:             xUnit, NUnit, MSTest
Math:                System.Numerics, MathNet.Numerics
Dependency injection: Microsoft.Extensions.DI
Logging:             Serilog, NLog
```

### NuGet Compatibility Warning

Not all NuGet packages work in Godot. Packages that depend on Windows-specific APIs, WPF, ASP.NET, or heavy reflection may fail. Pure computation libraries (math, serialization, data structures) generally work fine. Always test NuGet dependencies in a Godot build before committing to them.

### Addon Compatibility

Most Godot addons are written in GDScript. They work fine in C# projects — you can call GDScript addon code from C# through the Godot API. However, modifying or extending addon code requires reading GDScript.

---

## 10. Interop: Mixing Languages

Godot supports mixed-language projects. A single project can contain both GDScript and C# scripts.

### Calling C# from GDScript

```gdscript
# If a C# class has [GlobalClass], it works like any other node
var manager := $PerformanceManager as PerformanceManager
manager.calculate_paths(enemy_positions)
```

### Calling GDScript from C#

```csharp
// Access GDScript node and call methods dynamically
var player = GetNode("Player");
player.Call("take_damage", 25, this);

// Access exported properties
var health = (int)player.Get("health");
```

### Mixed-Language Architecture Pattern

A practical pattern: use GDScript for gameplay logic and C# for performance-critical systems.

```
Project/
├── scripts/          ← GDScript (gameplay, UI, signals)
│   ├── player.gd
│   ├── enemy.gd
│   ├── ui/
│   └── autoloads/
├── src/              ← C# (performance-critical)
│   ├── Pathfinding/
│   │   └── AStarGrid.cs
│   ├── ProceduralGen/
│   │   └── DungeonGenerator.cs
│   └── AI/
│       └── BehaviorTree.cs
└── project.godot
```

### Interop Limitations

- **No direct type sharing** — GDScript cannot reference C# interfaces or generics
- **Dynamic calls only** — C# calls to GDScript use `Call()` / `Get()` / `Set()` (not type-safe)
- **Signal connection** — works across languages but uses string-based signal names
- **Debugging** — breakpoints only work within one language per debug session
- **Build step** — C# requires compilation; GDScript does not. Mixed projects add build complexity

### When Mixing Makes Sense

✅ **Good reasons to mix:**
- GDScript project that needs one high-performance system (pathfinding, proc-gen)
- C# project that wants to use a GDScript-only addon without rewriting it
- Gradual migration from one language to the other

❌ **Bad reasons to mix:**
- "C# for important code, GDScript for trivial code" — creates two codebases to maintain
- Team where half the devs know one language, half the other — communication overhead
- "Just in case we need C# later" — premature. Start with one language, migrate if needed

---

## 11. Migration Patterns

### GDScript → C# Migration

When a GDScript project hits performance walls:

1. **Profile first** — use Godot's built-in profiler to identify actual bottlenecks
2. **Migrate hot paths only** — move the 1–3 systems that consume the most frame time
3. **Keep the API surface identical** — exported properties, signals, and method names should match
4. **Test per-file** — migrate one script, verify it works, commit, then move to the next
5. **Consider GDExtension** — if the bottleneck is pure computation (no engine API calls), a GDExtension module may be simpler than setting up C#

### Unity C# → Godot C# Migration

For developers coming from Unity:

| Unity Concept | Godot C# Equivalent |
|---|---|
| `MonoBehaviour` | Node subclass (`partial class`) |
| `[SerializeField]` | `[Export]` |
| `GetComponent<T>()` | `GetNode<T>("ChildName")` |
| `Instantiate(prefab)` | `scene.Instantiate<T>()` |
| `Destroy(gameObject)` | `QueueFree()` |
| `StartCoroutine` | `async` / `await ToSignal(...)` |
| `ScriptableObject` | `Resource` subclass |
| `UnityEvent` | Godot signals (`[Signal]`) |
| `Update()` | `_Process(double delta)` |
| `FixedUpdate()` | `_PhysicsProcess(double delta)` |
| `OnCollisionEnter` | Signal from `Area2D` / `body_entered` |
| `DontDestroyOnLoad` | Autoload (Project Settings) |
| `PlayerPrefs` | `ConfigFile` |
| `Resources.Load` | `GD.Load<T>("res://...")` |

### Unity C# → Godot GDScript Migration

For Unity developers willing to learn GDScript (recommended for faster iteration):

```csharp
// Unity C#
public class Enemy : MonoBehaviour
{
    [SerializeField] private float speed = 5f;
    [SerializeField] private int health = 100;

    private void Update()
    {
        transform.position += Vector3.right * speed * Time.deltaTime;
    }

    public void TakeDamage(int amount)
    {
        health -= amount;
        if (health <= 0) Destroy(gameObject);
    }
}
```

```gdscript
# Godot GDScript equivalent
class_name Enemy
extends CharacterBody2D

@export var speed: float = 5.0
@export var health: int = 100


func _physics_process(delta: float) -> void:
    velocity.x = speed
    move_and_slide()


func take_damage(amount: int) -> void:
    health -= amount
    if health <= 0:
        queue_free()
```

---

## 12. Decision Framework

### Project-Based Decision Tree

```
START
  │
  ├─ Need web (HTML5) export? ──── YES ──→ GDScript
  │
  ├─ Game jam or prototype? ────── YES ──→ GDScript
  │
  ├─ Team > 5 developers? ─────── YES ──→ C# (interfaces, refactoring tools)
  │
  ├─ Heavy computation?
  │   (1000+ agents, proc-gen,
  │    complex AI per frame) ───── YES ──→ C# (or GDExtension for extreme cases)
  │
  ├─ Reusing Unity C# codebase? ── YES ──→ C# (but learn Godot patterns)
  │
  ├─ Existing NuGet dependency? ── YES ──→ C#
  │
  └─ None of the above ─────────── → ──→ GDScript
```

### Risk Assessment

| Risk | GDScript | C# |
|---|---|---|
| Performance bottleneck | Medium — can escalate to C#/GDExtension | Low |
| Community support gap | Low — 84% of ecosystem | High — must translate resources |
| Platform lock-out | Low — all platforms | Medium — no web export |
| Hiring / onboarding | Low — easy to learn | Medium — requires .NET knowledge |
| Tooling gap | Medium — basic refactoring | Low — excellent IDE support |
| Engine update breakage | Low — GDScript is core | Medium — .NET binding changes |

---

## 13. Common Mistakes by Language Background

### Python Developers → GDScript

```gdscript
# ❌ Mistake: Using Python conventions
def move(self, delta):     # Wrong — no 'self', no 'def'
    self.position.x += 1   # Wrong — 'self' doesn't exist

# ✅ Correct GDScript
func move(delta: float) -> void:
    position.x += 1   # 'self' is implicit
```

```gdscript
# ❌ Mistake: List comprehensions (don't exist in GDScript)
var alive = [e for e in enemies if e.health > 0]

# ✅ Correct: Use filter() or a loop
var alive: Array[Enemy] = enemies.filter(func(e: Enemy) -> bool: return e.health > 0)
```

### Unity C# Developers → Godot C#

```csharp
// ❌ Mistake: Using GetComponent (Unity pattern)
var rb = GetComponent<Rigidbody2D>();

// ✅ Correct: Use GetNode (Godot pattern — children, not components)
var rb = GetNode<RigidBody2D>("RigidBody2D");
```

```csharp
// ❌ Mistake: Forgetting 'partial' keyword
public class Player : CharacterBody2D { }  // Compile error

// ✅ Correct: Always partial for Godot nodes
public partial class Player : CharacterBody2D { }
```

```csharp
// ❌ Mistake: Modifying struct properties directly
Velocity.X = 100f;  // Compiles but does nothing

// ✅ Correct: Copy-modify-reassign
var vel = Velocity;
vel.X = 100f;
Velocity = vel;
```

### Unity C# Developers → GDScript

```gdscript
# ❌ Mistake: Deep inheritance hierarchies (Unity habit)
class_name FlyingFireEnemy extends FlyingEnemy  # extends Enemy extends Entity...

# ✅ Correct: Composition via child scenes
# FlyingFireEnemy.tscn:
#   CharacterBody2D
#   ├── FlyingMovement (Node — movement script)
#   ├── FireAttack (Node — attack script)
#   ├── HealthComponent (Node — health + damage)
#   └── Sprite2D
```

```gdscript
# ❌ Mistake: Singleton pattern with static classes
class_name GameManager
static var instance: GameManager  # Don't do this

# ✅ Correct: Use Autoload (Project Settings → Autoload)
# Register game_manager.gd as "GameManager" autoload
# Access anywhere: GameManager.score += 100
```

---

## 14. Team & Project Scaling

### Solo / Small Team (1–3 developers)

**Recommendation: GDScript**

- Fastest iteration speed
- Lowest setup overhead (no external IDE, no build step)
- One person can read every script without context-switching between languages
- Game jam friendly — start coding in seconds

### Medium Team (4–8 developers)

**Recommendation: GDScript with strict typing enabled**

Enable in Project Settings → Debug → GDScript:
- **Untyped Declaration** → Warning or Error
- **Unsafe Property Access** → Warning
- **Unsafe Method Access** → Warning
- **Unsafe Cast** → Warning

This gives GDScript most of C#'s safety benefits without changing languages.

### Large Team (8+ developers)

**Recommendation: C# or Mixed**

At this scale, the benefits of C# tooling compound:
- Rider's refactoring catches renames across 200+ files
- Interfaces enforce API contracts between sub-teams
- NuGet allows sharing internal libraries
- Static analysis catches more bugs before merge

### Code Review Differences

**GDScript code reviews** focus on:
- Type annotations present on all public functions and variables
- Signal naming conventions (`past_tense_verb` like `health_changed`)
- No `get_node("../../..")` fragile paths
- Proper use of `@onready` vs `_ready()` initialization

**C# code reviews** focus on:
- `partial` on all node classes
- Proper struct handling (Velocity copy-modify-reassign)
- Signal naming follows `EventHandler` convention
- No unnecessary NuGet dependencies
- Null safety (`null!` on `@onready`-equivalent fields)

---

## 15. Future Outlook

### GDScript Roadmap (4.5–5.0)

- **Improved lambda syntax** — multi-line lambdas under discussion
- **Better static analysis** — approaching C#-level type checking
- **Performance improvements** — ongoing bytecode optimizer work
- **Possible module system** — better code organization for large projects
- **Tighter shader integration** — compute shader access from GDScript

### C# Roadmap (4.5–5.0)

- **Web export** — high priority, actively being worked on (no confirmed date)
- **Improved hot reload** — reducing state loss on recompile
- **Better GDExtension interop** — accessing GDExtension APIs from C#
- **Source generator improvements** — less boilerplate for signals and exports
- **NativeAOT for all platforms** — smaller binaries, faster startup

### Industry Trends

- **AI code generation favors GDScript** — text-based `.tscn` files and GDScript are more AI-readable than binary scene files and compiled C# (see DEV Community article: "Why AI Writes Better Game Code in Godot Than in Unity")
- **GDScript adoption is growing** — as Godot gains market share, GDScript-specific tooling improves
- **C# remains essential for Unity migrants** — the Godot C# community grows as Unity developers explore alternatives

---

## 16. Quick Reference

### When to Choose GDScript

✅ Web export needed  
✅ Solo developer or small team  
✅ Prototyping / game jam  
✅ First Godot project (learning the engine)  
✅ 2D game without extreme entity counts  
✅ Want to use most community addons natively  
✅ AI-assisted development workflow  
✅ Fastest possible iteration speed  

### When to Choose C#

✅ Heavy computation per frame (1000+ agents, proc-gen)  
✅ Large team (8+) needing refactoring tools  
✅ Reusing existing C# / .NET codebase  
✅ Need specific NuGet libraries  
✅ Coming from Unity, want familiar syntax  
✅ Strong preference for static typing and interfaces  
✅ Project requires enterprise-grade static analysis  

### When to Mix Both

✅ GDScript project with 1–2 performance bottlenecks  
✅ C# project using a GDScript-only addon  
✅ Gradual migration from one language to the other  

### The One Rule

> **Pick one language as primary.** Use it for 90%+ of your code. Only introduce the second language when you have a concrete, measured reason — not a theoretical one.

---

## Related Guides

- [E1 Architecture Overview](./E1_architecture_overview.md) — Godot's node tree, scene system, and engine philosophy
- [G1 Scene Composition](../guides/G1_scene_composition.md) — Building games with nested scenes and component nodes
- [G2 State Machine](../guides/G2_state_machine.md) — Node-based FSM patterns (GDScript examples)
- [G3 Signal Architecture](../guides/G3_signal_architecture.md) — Signal patterns and decoupling strategies
- [G4 Input Handling](../guides/G4_input_handling.md) — Input system with movement patterns
- [godot-rules.md](../godot-rules.md) — AI code generation rules for Godot 4.4+
