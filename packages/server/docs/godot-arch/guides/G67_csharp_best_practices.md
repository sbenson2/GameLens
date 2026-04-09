# G67 — C# Best Practices in Godot 4

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** C# / GDScript comparisons
> **Related:** [G45 Advanced GDScript Patterns](./G45_advanced_gdscript_patterns.md) · [G51 Entity Component Patterns](./G51_entity_component_patterns.md) · [G16 GDExtension & Native Code](./G16_gdextension_native_code.md) · [G65 Unity to Godot Migration](./G65_unity_to_godot_migration.md) · [E2 GDScript vs C#](../architecture/E2_gdscript_vs_csharp.md)

---

## What This Guide Covers

C# in Godot 4 opens access to the full .NET ecosystem, powerful IDE tooling (Visual Studio, Rider), and performance characteristics of a compiled language. But it requires discipline — the language is more permissive than GDScript, and mistakes can be subtle. This guide covers the idioms, patterns, and gotchas that C# developers need to know when working in Godot.

**Use this guide when:** you're writing C# in Godot 4.4+ and want to follow best practices — correct project setup, type-safe signals, variant handling, performance optimization, and the specific mistakes that trip up C# developers in Godot.

---

## Table of Contents

1. [When to Use C# vs GDScript](#1-when-to-use-c-vs-gdscript)
2. [Project Setup & Requirements](#2-project-setup--requirements)
3. [Signals in C#](#3-signals-in-c)
4. [Exports and Inspector Integration](#4-exports-and-inspector-integration)
5. [Variant and Marshalling](#5-variant-and-marshalling)
6. [Callable and StringName](#6-callable-and-stringname)
7. [Node Access Patterns](#7-node-access-patterns)
8. [Autoloads in C#](#8-autoloads-in-c)
9. [Async Patterns](#9-async-patterns)
10. [NuGet Packages and .NET Libraries](#10-nuget-packages-and-net-libraries)
11. [Testing](#11-testing)
12. [Performance Tips](#12-performance-tips)
13. [Common Mistakes](#13-common-mistakes)

---

## 1. When to Use C# vs GDScript

### Choosing C# for Performance

C# code compiles to IL (Intermediate Language), then JIT-compiles at runtime. This gives you:

- **Faster hot loops:** Physics calculations, pathfinding, particle updates (5–50x faster than GDScript in CPU-bound code)
- **Ahead-of-time compilation:** Bundled with Godot, no runtime bytecode interpretation
- **Full AOT potential:** For exports, C# can be ahead-of-time compiled (though native debug info is limited)

**Use C# if:**
- You're doing heavy computation (procedural generation, complex physics, pathfinding)
- You need performance-critical systems (rendering backends, AI decision trees)
- Your team comes from a C# background (Unity, .NET)
- You need IDE refactoring and advanced static analysis

**Use GDScript if:**
- You're prototyping or iterating fast
- You target web (HTML5) — C# has no web export
- Most of your team knows GDScript
- You want shorter feedback loops (hot reload)

### Ecosystem Access

C# unlocks the **NuGet ecosystem** — hundreds of thousands of packages for networking, serialization, mathematics, UI, and more. GDScript is limited to Godot's built-in APIs and third-party GDScript addons.

**Web Export Limitation:** C# cannot target HTML5/WebGL. If web export is a requirement, GDScript is the only choice.

---

## 2. Project Setup & Requirements

### .NET Runtime

Godot 4.4+ requires **\.NET 8** (LTS) or later. Check your Godot version documentation for specific requirements.

```bash
# Verify .NET is installed
dotnet --version

# Should output 8.0.x or higher
```

### Partial Classes (CRITICAL)

Every GodotObject-derived type must be declared `partial`. Source generators create the other half of the partial class to register properties, signals, and exports:

```csharp
public partial class Player : CharacterBody3D
{
    // Your code here
}

// WRONG — not partial, won't compile
public class Enemy : CharacterBody3D
{
    // Error: source generators can't augment this
}
```

### Project Structure (.csproj)

Godot scaffolds a `.csproj` file automatically. A minimal example:

```xml
<Project Sdk="Godot.NET.Sdk/4.4.0">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
  </PropertyGroup>
</Project>
```

For custom NuGet packages, add `<ItemGroup>`:

```xml
<ItemGroup>
  <PackageReference Include="CommunityToolkit.HighPerformance" Version="8.2.0" />
  <PackageReference Include="NetSerializer" Version="1.3.0" />
</ItemGroup>
```

### Build Workflow

Godot builds C# automatically when you run the game. The editor watches for `.cs` file changes and recompiles. Compilation errors appear in the **Output** panel.

```bash
# Manual build (optional)
dotnet build

# Build release (optimized)
dotnet build -c Release

# Publish (game export uses this)
dotnet publish -c Release
```

---

## 3. Signals in C#

Godot's C# source generators create **type-safe C# events** from signals. This is one of C#'s biggest advantages over GDScript.

### Basic Signal Declaration

Use the `[Signal]` attribute and declare a delegate:

```csharp
public partial class Player : CharacterBody3D
{
    [Signal]
    public delegate void HealthChangedEventHandler(int newHealth, int maxHealth);

    [Signal]
    public delegate void DiedEventHandler(int killerPlayerId);

    private int _health = 100;

    public void TakeDamage(int amount)
    {
        _health -= amount;
        EmitSignal(SignalName.HealthChanged, _health, 100);
        
        if (_health <= 0)
            EmitSignal(SignalName.Died, 0);
    }
}
```

The source generator creates:
- A `SignalName` enum with entries for each signal
- Strongly-typed event properties (`HealthChanged`, `Died`)

### Connecting with the += Operator

Instead of GDScript's string-based `connect()`:

```csharp
// Type-safe connection using C# events
player.HealthChanged += OnPlayerHealthChanged;
player.Died += OnPlayerDied;

// Lambdas work too
player.HealthChanged += (newHealth, maxHealth) =>
{
    healthBar.Value = (float)newHealth / maxHealth * 100f;
};

// Disconnect
player.HealthChanged -= OnPlayerHealthChanged;

private void OnPlayerHealthChanged(int newHealth, int maxHealth)
{
    // Response code
}

private void OnPlayerDied(int killerPlayerId)
{
    gameOverPanel.Visible = true;
}
```

### Comparing GDScript and C# Signals

```gdscript
# GDScript — string-based, no type checking
signal health_changed(new_health: int, max_health: int)
emit_signal("health_changed", 50, 100)
player.health_changed.connect(_on_health_changed)

func _on_health_changed(h: int, m: int) -> void:
    health_bar.value = float(h) / m * 100.0
```

```csharp
// C# — type-safe, refactoring-friendly
[Signal]
public delegate void HealthChangedEventHandler(int newHealth, int maxHealth);
EmitSignal(SignalName.HealthChanged, 50, 100);
player.HealthChanged += OnHealthChanged;

private void OnHealthChanged(int newHealth, int maxHealth)
{
    healthBar.Value = (float)newHealth / maxHealth * 100f;
}
```

### Signal Naming Convention

Signal delegate names **must end with `EventHandler`**:

```csharp
// CORRECT
[Signal]
public delegate void ItemPickedUpEventHandler(string itemName);

// WRONG — won't be recognized as a signal
[Signal]
public delegate void ItemPickedUp(string itemName);
```

---

## 4. Exports and Inspector Integration

The `[Export]` attribute makes properties editable in the Godot inspector, replacing GDScript's `@export`:

### Basic Exports

```csharp
public partial class Enemy : CharacterBody3D
{
    [Export]
    public float MovementSpeed { get; set; } = 50f;

    [Export]
    public int MaxHealth { get; set; } = 100;

    [Export]
    public string DisplayName { get; set; } = "Goblin";
}
```

### Export Hints and Ranges

```csharp
public partial class Combat : Node
{
    // Integer slider 0–100
    [Export(PropertyHint.Range, "0,100,1")]
    public int AttackPower { get; set; } = 10;

    // Float slider 0–1 with step 0.05
    [Export(PropertyHint.Range, "0,1,0.05")]
    public float CriticalChance { get; set; } = 0.1f;

    // File picker (must be .gd script)
    [Export(PropertyHint.File, "*.gd")]
    public string ScriptPath { get; set; } = "";

    // Directory picker
    [Export(PropertyHint.Dir)]
    public string SaveDirectory { get; set; } = "user://";

    // Enum dropdown
    public enum DamageType { Physical, Fire, Ice, Lightning }
    [Export]
    public DamageType PrimaryDamageType { get; set; } = DamageType.Physical;

    // Color picker
    [Export]
    public Color TeamColor { get; set; } = Color.FromHtml("FF0000");

    // Multiline text
    [Export(PropertyHint.MultilineText)]
    public string Description { get; set; } = "";

    // Node path selector
    [Export(PropertyHint.NodePath, "CharacterBody3D")]
    public string PlayerPath { get; set; } = "";
}
```

### Export Groups

Organize inspector fields:

```csharp
public partial class Player : CharacterBody3D
{
    [ExportGroup("Movement")]
    [Export]
    public float MoveSpeed { get; set; } = 200f;

    [Export]
    public float Acceleration { get; set; } = 500f;

    [ExportSubgroup("Jump")]
    [Export]
    public float JumpHeight { get; set; } = 150f;

    [Export]
    public float AirControl { get; set; } = 0.3f;

    [ExportGroup("Combat")]
    [Export]
    public int AttackDamage { get; set; } = 10;

    [Export(PropertyHint.Range, "0,1,0.1")]
    public float CriticalChance { get; set; } = 0.2f;
}
```

### Exporting Node References

Prefer `[Export]` properties over `GetNode()` for scene dependencies:

```csharp
public partial class UI : CanvasLayer
{
    // Inspector assignment — type-safe
    [Export]
    public ProgressBar HealthBar { get; set; }

    [Export]
    public Label ScoreLabel { get; set; }

    public override void _Ready()
    {
        // Guaranteed non-null (assigned in inspector)
        HealthBar.MaxValue = 100;
        ScoreLabel.Text = "0";
    }
}

// Alternative: GetNode if you prefer scene paths
public partial class UI : CanvasLayer
{
    private ProgressBar _healthBar;

    public override void _Ready()
    {
        _healthBar = GetNode<ProgressBar>("%HealthBar");  // Unique name selector %
        _healthBar.MaxValue = 100;
    }
}
```

---

## 5. Variant and Marshalling

Godot's `Variant` type bridges C# and Godot's native object system. Understanding it prevents crashes and performance issues.

### GodotObject vs System.Object

Every Godot class inherits from `GodotObject`, not `System.Object`. This is critical:

```csharp
// WRONG — using System.Object
public class GameState : object
{
    // Won't work with Godot serialization, signals, or property binding
}

// RIGHT — inheriting from GodotObject
public partial class GameState : Node
{
    // Full Godot integration
}
```

### Variant Type Conversions

`Godot.Variant` is a union type representing any Godot-compatible value. Avoid implicit conversions:

```csharp
// Source generator creates strongly-typed overloads
[Signal]
public delegate void ValueChangedEventHandler(int newValue);

// Emit with strong typing
EmitSignal(SignalName.ValueChanged, 42);  // Type-checked

// Manual variant conversion (rare)
var v = new Variant(42);
var asInt = (int)v;  // Unboxing
```

### Boxing and GC Pressure

Every conversion to/from `Variant` may allocate. Avoid in hot loops:

```csharp
// BAD — allocations in the frame update
public override void _Process(double delta)
{
    for (int i = 0; i < 1000; i++)
    {
        var variant = new Variant(i);  // Allocation!
        MySignal.Emit(variant);  // More allocation
    }
}

// GOOD — direct typed calls
public override void _Process(double delta)
{
    for (int i = 0; i < 1000; i++)
    {
        EmitSignal(SignalName.NumberEmitted, i);  // No allocation
    }
}
```

### Numeric Types in Godot

Godot uses **64-bit integers and floats**:

```csharp
// Godot int is int64, not int32
// Be explicit for clarity
int value = 42;  // Works, implicitly cast to long
long largeValue = int.MaxValue + 1;  // Now safe

// Godot float is float64 (double in C#)
float worldValue = 3.14f;  // Works, implicitly cast to double
double preciseValue = 3.14159265359;  // Preferred for Godot math
```

---

## 6. Callable and StringName

### Creating Callables from Methods

`Callable.From()` creates a method reference for later invocation:

```csharp
public partial class EventDispatcher : Node
{
    public void OnButton1Pressed()
    {
        GD.Print("Button 1 pressed");
    }

    public void Setup(Button button)
    {
        // Instead of lambda
        var callable = Callable.From(OnButton1Pressed);
        button.Pressed += OnButton1Pressed;

        // Or with arguments
        var callableWithArgs = Callable.From(this, MethodName.OnItemSelected);
    }

    private void OnItemSelected(int itemId)
    {
        GD.Print($"Selected: {itemId}");
    }
}
```

### StringName for Performance

`StringName` is a cached string identifier. Use it instead of `string` when accessing properties or signals repeatedly:

```csharp
// BAD — string allocated each time
for (int i = 0; i < 1000; i++)
{
    var val = GetNodeOrNull("Player");  // String search
}

// GOOD — StringName cached
private static readonly StringName PlayerPath = new StringName("Player");

for (int i = 0; i < 1000; i++)
{
    var val = GetNodeOrNull(PlayerPath);  // Cached lookup
}

// Performance critical property access
private static readonly StringName PositionProperty = new StringName("position");

for (int i = 0; i < enemies.Count; i++)
{
    enemies[i].Set(PositionProperty, new Vector3(0, 0, 0));  // Fast
}
```

---

## 7. Node Access Patterns

### GetNode&lt;T&gt;() for Typed Lookups

Always use the generic version:

```csharp
public partial class Player : CharacterBody3D
{
    private AnimationPlayer _animPlayer;
    private CollisionShape3D _collisionShape;

    public override void _Ready()
    {
        // Type-safe, returns null if not found or wrong type
        _animPlayer = GetNode<AnimationPlayer>("AnimationPlayer");
        _collisionShape = GetNode<CollisionShape3D>("CollisionShape3D");

        // Safe to call immediately
        _animPlayer?.Play("idle");
    }
}
```

### GetNodeOrNull&lt;T&gt;() for Optional References

When a node might not exist:

```csharp
public partial class NPC : CharacterBody3D
{
    public override void _Ready()
    {
        // Might not have a pet
        var pet = GetNodeOrNull<Node3D>("PetFollower");
        if (pet != null)
        {
            pet.Visible = true;
        }
    }
}
```

### Exporting Node References (Preferred)

The safest pattern — assign nodes in the inspector:

```csharp
public partial class LevelManager : Node
{
    [Export]
    public Player PlayerReference { get; set; }

    [Export]
    public Node EnemySpawner { get; set; }

    public override void _Ready()
    {
        // Guaranteed non-null, no null checks needed
        PlayerReference.Health = 100;
        EnemySpawner.Call("Spawn");
    }
}
```

### Unique Names (%) in GetNode

Godot's `%` selector finds nodes by unique name instead of path:

```csharp
// Scene:
// Player
//   Sprite2D (unique name: %Sprite)
//   CollisionShape2D (unique name: %Collision)

public override void _Ready()
{
    var sprite = GetNode<Sprite2D>("%Sprite");  // Finds it anywhere in subtree
    var collision = GetNode<CollisionShape2D>("%Collision");
}
```

---

## 8. Autoloads in C#

Autoloads (singletons) are typically GDScript scripts registered in Project Settings. C# requires a small workaround:

### Registering C# Autoloads

In **Project Settings → Autoload**, attach a C# script as you would a GDScript:

```csharp
// Autoload script — path: res://Autoload/GameEvents.cs
public partial class GameEvents : Node
{
    [Signal]
    public delegate void PlayerDiedEventHandler();

    [Signal]
    public delegate void LevelCompletedEventHandler();

    public static void EmitPlayerDied()
    {
        var instance = GD.Load<GameEvents>("res://Autoload/GameEvents.cs");
        instance?.EmitSignal(SignalName.PlayerDied);
    }
}
```

### Better: Static Class Pattern

For a more typical C# singleton pattern, use a static class with reference to the node:

```csharp
public partial class GameEvents : Node
{
    public static GameEvents Instance { get; private set; }

    [Signal]
    public delegate void PlayerDiedEventHandler();

    public override void _EnterTree()
    {
        Instance = this;
    }

    public override void _ExitTree()
    {
        Instance = null;
    }
}

// Usage anywhere
public void OnPlayerDeath()
{
    GameEvents.Instance?.EmitSignal(GameEvents.SignalName.PlayerDied);
}
```

### Register in Autoload

In the project settings, drag `GameEvents.cs` into the Autoload tab with name "Events".

---

## 9. Async Patterns

C#'s `async/await` is supported in Godot, but requires special handling for the single-threaded scene tree.

### Awaiting Signals with ToSignal()

```csharp
public partial class DialogueManager : Node
{
    public async Task ShowDialogue(string text)
    {
        // Show dialogue and wait for signal
        dialogueLabel.Text = text;
        dialoguePanel.Visible = true;

        // C# ToSignal extension (part of GodotSharp)
        await this.ToSignal(confirmButton, "pressed");

        dialoguePanel.Visible = false;
    }

    // Call it
    public override void _Ready()
    {
        var task = ShowDialogue("Hello, player!");
        // Task runs asynchronously
    }
}
```

### Task-Based Async Sequences

```csharp
public partial class CutsceneController : Node
{
    private async Task PlayCutscene()
    {
        await PanCameraTo(new Vector3(0, 5, -10));
        await ShowSubtitle("Welcome to the kingdom...");
        await FadeToBlack(1.5);
        gameplayManager.StartLevel();
    }

    private async Task PanCameraTo(Vector3 target)
    {
        var tween = CreateTween();
        tween.TweenProperty(camera, "global_position", target, 1.5);
        await tween.Finished;
    }

    private async Task ShowSubtitle(string text)
    {
        subtitleLabel.Text = text;
        subtitleLabel.Visible = true;
        await Task.Delay(2000);  // 2 seconds
        subtitleLabel.Visible = false;
    }

    private async Task FadeToBlack(double duration)
    {
        var tween = CreateTween();
        tween.TweenProperty(fadePanel, "modulate:a", 1.0, duration);
        await tween.Finished;
    }
}
```

### Important Caveat: Single-Threaded Scene Tree

Godot's scene tree is **single-threaded**. Async code must respect this:

```csharp
// WRONG — the node might be freed before the await completes
public async Task LongOperation()
{
    await Task.Delay(5000);  // 5-second delay
    position = Vector3.Zero;  // If node was freed, this crashes!
}

// RIGHT — check validity after await
public async Task LongOperation()
{
    await Task.Delay(5000);
    
    if (!IsNodeValid())
        return;

    position = Vector3.Zero;  // Safe now
}

private bool IsNodeValid()
{
    return IsInstanceValid(this) && !IsQueuedForDeletion();
}
```

---

## 10. NuGet Packages and .NET Libraries

C#'s main advantage is access to NuGet. Many packages work seamlessly in Godot; some don't.

### Adding Packages

Edit the `.csproj` file or use the CLI:

```bash
# Add package via CLI
dotnet add package System.Numerics.Vectors

# Or edit .csproj manually
<ItemGroup>
  <PackageReference Include="System.Numerics.Vectors" Version="4.5.0" />
</ItemGroup>
```

### Packages That Work Well

| Package | Purpose | Notes |
|---------|---------|-------|
| `CommunityToolkit.HighPerformance` | SIMD, span utilities | Excellent for performance |
| `MessagePack` | Serialization | Faster than JSON for networking |
| `NetSerializer` | Binary serialization | Compact, fast |
| `DryIoc` | Dependency injection | Lightweight container |
| `Newtonsoft.Json` | JSON parsing | De-facto standard |
| `Serilog` | Logging | Structured logging framework |

### Packages That Don't Work

These typically require platform features Godot doesn't expose:

| Package | Why It Fails |
|---------|-------------|
| `System.Drawing` | No access to native graphics APIs |
| `System.Net.WebSockets` | Platform-specific networking |
| `System.Reflection.Emit` | Dynamic IL generation not supported in AOT |
| Any UI framework (WinForms, WPF) | Godot doesn't expose native window handles |

### Test What Works

Always test packages in a small proof-of-concept before integrating:

```csharp
// Test code in _Ready()
public override void _Ready()
{
    // Test library integration
    var json = @"{ ""name"": ""test"" }";
    dynamic obj = JsonConvert.DeserializeObject(json);
    GD.Print(obj.name);  // "test"
}
```

---

## 11. Testing

### xUnit or NUnit with Godot

Set up a test project alongside your game:

```bash
# Create test project
dotnet new xunit -n MyGame.Tests

# Add Godot reference
cd MyGame.Tests
dotnet add reference ../MyGame/MyGame.csproj
```

```csharp
public class PlayerTests
{
    [Fact]
    public void TakeDamage_ReducesHealth()
    {
        var player = new Player();
        player.Health = 100;
        player.TakeDamage(25);

        Assert.Equal(75, player.Health);
    }

    [Theory]
    [InlineData(10)]
    [InlineData(50)]
    [InlineData(100)]
    public void TakeDamage_NeverNegative(int damage)
    {
        var player = new Player();
        player.TakeDamage(damage);

        Assert.True(player.Health >= 0);
    }
}
```

### GdUnit4 for Scene Testing

The `GdUnit4` addon (C# support) lets you test scenes with mocking:

```csharp
[TestSuite]
public partial class PlayerSceneTest : ITest
{
    [Before]
    public async Task Setup()
    {
        await SceneRunner.Load("res://Scenes/Player.tscn");
    }

    [TestCase]
    public async Task PlayerAnimates_OnDamage()
    {
        var player = SceneRunner.GetRoot() as Player;
        var animPlayer = player.GetNode<AnimationPlayer>("AnimationPlayer");

        player.TakeDamage(25);
        await SceneRunner.AwaitSignal(animPlayer, "animation_finished");

        Assert.That(animPlayer.CurrentAnimation).IsEqual("hurt");
    }
}
```

---

## 12. Performance Tips

### Prefer Struct for Lightweight Data

Use `struct` for frequently-allocated, value-type data:

```csharp
// Good — small, value type, no allocation
public struct DamageEvent
{
    public int Amount { get; set; }
    public int SourceId { get; set; }
    public Vector3 HitPosition { get; set; }
}

// Use it
private List<DamageEvent> _damageQueue = new();
_damageQueue.Add(new DamageEvent { Amount = 10, SourceId = 1, HitPosition = Vector3.Zero });

// Bad — unnecessary class allocation
public class DamageEvent
{
    public int Amount { get; set; }
    public int SourceId { get; set; }
    public Vector3 HitPosition { get; set; }
}
```

### Object Pooling in C#

Avoid allocating thousands of bullets or particles:

```csharp
public partial class BulletPool : Node
{
    [Export] public PackedScene BulletScene { get; set; }
    [Export] public int PoolSize { get; set; } = 50;

    private Queue<Bullet> _available = new();
    private HashSet<Bullet> _active = new();

    public override void _Ready()
    {
        for (int i = 0; i < PoolSize; i++)
        {
            var bullet = BulletScene.Instantiate<Bullet>();
            bullet.Visible = false;
            bullet.SetProcess(false);
            AddChild(bullet);
            _available.Enqueue(bullet);
        }
    }

    public Bullet Acquire(Vector3 position, Vector3 velocity)
    {
        Bullet bullet;
        if (!_available.TryDequeue(out bullet))
        {
            bullet = BulletScene.Instantiate<Bullet>();
            AddChild(bullet);
        }

        bullet.Position = position;
        bullet.Velocity = velocity;
        bullet.Visible = true;
        bullet.SetProcess(true);
        _active.Add(bullet);

        return bullet;
    }

    public void Release(Bullet bullet)
    {
        bullet.Visible = false;
        bullet.SetProcess(false);
        _active.Remove(bullet);
        _available.Enqueue(bullet);
    }
}
```

### Minimize Variant Conversions

Avoid converting to/from Godot.Variant in hot paths:

```csharp
// BAD
for (int i = 0; i < 10000; i++)
{
    var variant = new Variant(enemies[i].Health);
    var doubled = variant.VariantType == Variant.Type.Int 
        ? (int)variant * 2 
        : 0;
}

// GOOD
for (int i = 0; i < 10000; i++)
{
    int doubled = enemies[i].Health * 2;
}
```

### Use Span&lt;T&gt; for Array Processing

For better performance with large arrays:

```csharp
// C# 7.2+
public void ProcessVertices(Vector3[] vertices)
{
    Span<Vector3> span = vertices;
    for (int i = 0; i < span.Length; i++)
    {
        span[i] *= 2f;  // No bounds checking
    }
}
```

---

## 13. Common Mistakes

### Forgetting `partial` Keyword

```csharp
// WRONG — won't compile
public class Player : CharacterBody3D
{
    [Export]
    public int Health { get; set; } = 100;
}

// RIGHT
public partial class Player : CharacterBody3D
{
    [Export]
    public int Health { get; set; } = 100;
}
```

### Using System.Object Instead of GodotObject

```csharp
// WRONG — not a Godot object
public class GameState : object
{
    // Won't work with Godot features
}

// RIGHT
public partial class GameState : Node
{
    // Full Godot integration
}
```

### Not Calling base._Ready()

If you override `_Ready()`, call the base implementation:

```csharp
public override void _Ready()
{
    base._Ready();  // Don't forget!
    
    // Your initialization
}
```

### Signal Names Not Ending with EventHandler

```csharp
// WRONG
[Signal]
public delegate void ItemPickedUp();

// RIGHT
[Signal]
public delegate void ItemPickedUpEventHandler();
```

### Web Export Surprise

C# has **no web (HTML5) export** support. If you need web export, use GDScript or GDExtension.

```csharp
// This code will NOT run on the web
#if NET
GD.Print("This runs on desktop/mobile only");
#endif
```

### Node Freed During Async

```csharp
// WRONG — node might be freed
public async Task LongWait()
{
    await Task.Delay(5000);
    position = Vector3.Zero;  // CRASH if freed!
}

// RIGHT
public async Task LongWait()
{
    await Task.Delay(5000);
    
    if (!IsInstanceValid(this))
        return;

    position = Vector3.Zero;
}
```

### Using `String` Instead of `StringName` Repeatedly

```csharp
// WRONG — allocates string each time
for (int i = 0; i < 1000; i++)
{
    node.Get("health");  // String allocation!
}

// RIGHT — StringName cached
private static readonly StringName HealthName = new("health");

for (int i = 0; i < 1000; i++)
{
    node.Get(HealthName);  // Cached lookup
}
```

---

## Summary

C# in Godot unlocks performance and ecosystem access, but requires discipline:

1. **Always use `partial`** on GodotObject-derived classes
2. **Use type-safe signals** with `[Signal]` and `EventHandler` delegates
3. **Prefer `[Export]`** properties over dynamic GetNode calls
4. **Cache `StringName`** for repeated property access
5. **Understand `Variant`** to avoid unnecessary allocations
6. **Test your NuGet packages** before depending on them
7. **Guard async operations** with validity checks
8. **Remember:** No web export for C# — GDScript only if you need HTML5

For a deeper comparison of GDScript vs C#, see [E2 GDScript vs C#](../architecture/E2_gdscript_vs_csharp.md).

