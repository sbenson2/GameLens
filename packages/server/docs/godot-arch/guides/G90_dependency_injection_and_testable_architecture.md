# G90 — Dependency Injection and Testable Architecture

> **Category:** guide · **Engine:** Godot 4.x · **Related:** [G3 Signal Architecture](./G3_signal_architecture.md) · [G80 Event Bus & Decoupled Messaging](./G80_event_bus_and_decoupled_messaging.md) · [G51 Entity Component Patterns](./G51_entity_component_patterns.md) · [G29 Testing & Quality Assurance](./G29_testing_and_quality_assurance.md) · [G53 Data-Driven Design](./G53_data_driven_design.md)

---

## What This Guide Covers

How to structure Godot projects for **loose coupling, testability, and swappable implementations** using dependency injection (DI), service locator, and interface patterns — in both GDScript and C#.

**Use this guide when:** your Autoloads have become god objects, you want to unit test game logic without running a full scene tree, or you need to swap subsystem implementations (e.g., mock audio, offline save backend, test-mode analytics).

**G3** covers signal-based decoupling. **G80** covers event buses. This guide goes further — injecting entire service implementations so systems can be tested, replaced, and composed without modifying consumers.

---

## Table of Contents

1. [Why DI in a Game Engine?](#1-why-di-in-a-game-engine)
2. [The Autoload Problem](#2-the-autoload-problem)
3. [Service Locator Pattern (GDScript)](#3-service-locator-pattern-gdscript)
4. [Constructor Injection via _init (GDScript)](#4-constructor-injection-via-_init-gdscript)
5. [Node-Based Injection (Scene Tree)](#5-node-based-injection-scene-tree)
6. [C# Dependency Injection](#6-c-dependency-injection)
7. [Interface Contracts](#7-interface-contracts)
8. [Testing with Mock Services](#8-testing-with-mock-services)
9. [Practical Example: Swappable Save System](#9-practical-example-swappable-save-system)
10. [When NOT to Use DI](#10-when-not-to-use-di)
11. [Common Mistakes](#11-common-mistakes)

---

## 1. Why DI in a Game Engine?

Games often evolve into tightly coupled systems where the player controller directly calls the audio manager, which directly calls the save system, which directly accesses a singleton. This creates a dependency web that makes testing, porting, and refactoring painful.

**Dependency injection** means a system receives its collaborators from the outside rather than creating or finding them itself.

```
# Without DI — hard-coded coupling
func take_damage(amount: int) -> void:
    health -= amount
    AudioManager.play("hit")          # Direct Autoload reference
    SaveManager.mark_dirty()           # Another direct reference
    AnalyticsManager.track("damage")   # And another

# With DI — injected services
func take_damage(amount: int) -> void:
    health -= amount
    _audio.play("hit")          # Injected — could be real or mock
    _save.mark_dirty()           # Injected
    _analytics.track("damage")   # Injected
```

Benefits: testable in isolation, swappable implementations, no hidden global state, easier to reason about.

---

## 2. The Autoload Problem

Autoloads are Godot's built-in singleton mechanism. They work well for truly global, stateless services (input mapping, screen transitions), but they become problematic when:

- **Scene-specific state leaks across scenes** — Autoloads persist through scene changes
- **Testing requires the full Autoload tree** — You can't unit test a node without the whole project loaded
- **Circular dependencies form** — Autoload A calls B, B calls C, C calls A
- **Swap becomes impossible** — Replacing `AudioManager` with a mock requires editing the Autoload list

**Rule of thumb:** Use Autoloads for infrastructure (scene loader, input mapper). Use DI for game systems (audio, save, analytics, economy).

---

## 3. Service Locator Pattern (GDScript)

A service locator is a lightweight registry that decouples service consumers from service providers.

```gdscript
# services.gd — Autoload (the ONE Autoload you keep)
class_name Services extends Node

## Registry of service instances by type name
static var _registry: Dictionary[String, Object] = {}

## Register a service implementation
static func register(service_name: String, instance: Object) -> void:
	if _registry.has(service_name):
		push_warning("Service '%s' already registered — overwriting" % service_name)
	_registry[service_name] = instance


## Retrieve a service by name. Returns null if not found.
static func get_service(service_name: String) -> Object:
	if not _registry.has(service_name):
		push_error("Service '%s' not registered" % service_name)
		return null
	return _registry[service_name]


## Remove a service (for cleanup or hot-swap)
static func unregister(service_name: String) -> void:
	_registry.erase(service_name)


## Clear all services (useful between test runs)
static func clear_all() -> void:
	_registry.clear()
```

### Registering Services at Startup

```gdscript
# main.gd — Your main scene or bootstrap script
extends Node

func _ready() -> void:
	# Register real implementations
	Services.register("audio", AudioService.new())
	Services.register("save", FileSaveService.new())
	Services.register("analytics", GameAnalytics.new())


# player.gd — Consumer
extends CharacterBody3D

var _audio: AudioService

func _ready() -> void:
	# Never access in _init() — services aren't registered yet
	_audio = Services.get_service("audio") as AudioService


func take_damage(amount: int) -> void:
	health -= amount
	_audio.play_sfx("hit")
```

---

## 4. Constructor Injection via _init (GDScript)

For non-Node classes (RefCounted, Resources), pass dependencies through `_init()`.

```gdscript
# combat_calculator.gd — Pure logic, no scene dependency
class_name CombatCalculator extends RefCounted

var _rng: RandomNumberGenerator
var _config: CombatConfig

func _init(rng: RandomNumberGenerator, config: CombatConfig) -> void:
	_rng = rng
	_config = config


func calculate_damage(attacker_power: int, defender_armor: int) -> int:
	var base: int = maxi(attacker_power - defender_armor, 0)
	var variance: float = _rng.randf_range(0.8, 1.2)
	var crit_chance: float = _config.crit_chance
	var is_crit: bool = _rng.randf() < crit_chance
	var multiplier: float = _config.crit_multiplier if is_crit else 1.0
	return int(base * variance * multiplier)
```

### Testing with Controlled Dependencies

```gdscript
# test_combat.gd — GdUnit4 or GUT test
func test_critical_hit() -> void:
	# Seed the RNG for deterministic results
	var rng := RandomNumberGenerator.new()
	rng.seed = 42

	var config := CombatConfig.new()
	config.crit_chance = 1.0     # Force crit
	config.crit_multiplier = 2.0

	var calc := CombatCalculator.new(rng, config)
	var damage := calc.calculate_damage(100, 20)

	# base = 80, variance ≈ deterministic from seed, * 2.0 crit
	assert(damage > 80, "Crit damage should exceed base damage")
```

---

## 5. Node-Based Injection (Scene Tree)

Leverage Godot's scene tree for dependency resolution — child nodes "inject" services by being present in the tree.

```gdscript
# audio_service_node.gd — Attach to scene root
class_name AudioServiceNode extends Node

@export var bus_name: String = "Master"

func play_sfx(sfx_name: String) -> void:
	var stream: AudioStream = load("res://audio/sfx/%s.ogg" % sfx_name)
	var player := AudioStreamPlayer.new()
	player.stream = stream
	player.bus = bus_name
	add_child(player)
	player.play()
	player.finished.connect(player.queue_free)
```

```gdscript
# player.gd — Finds the service by walking up the tree
extends CharacterBody3D

var _audio: AudioServiceNode

func _ready() -> void:
	_audio = _find_service(AudioServiceNode)
	assert(_audio != null, "AudioServiceNode must exist in the scene tree")


## Walk up the tree to find the nearest ancestor (or sibling) of a given type
func _find_service(type: Variant) -> Node:
	var node: Node = self
	while node:
		# Check siblings
		if node.get_parent():
			for child: Node in node.get_parent().get_children():
				if is_instance_of(child, type):
					return child
		node = node.get_parent()
	return null
```

### Advantage of Tree-Based Injection

Different scenes can provide different implementations. Your test scene can include a `MockAudioServiceNode` at the same tree position — no code changes needed in the player.

---

## 6. C# Dependency Injection

C# has stronger typing and interface support, making DI patterns more natural.

### Interface Definition

```csharp
// IAudioService.cs
public interface IAudioService
{
    void PlaySfx(string name);
    void PlayMusic(string name, float fadeTime = 0.5f);
    void StopAll();
}

// ISaveService.cs
public interface ISaveService
{
    Error Save(string slot, Godot.Collections.Dictionary data);
    Godot.Collections.Dictionary Load(string slot);
    bool SlotExists(string slot);
}
```

### Service Locator (C#)

```csharp
// ServiceLocator.cs — Static registry
using System;
using System.Collections.Generic;

public static class ServiceLocator
{
    private static readonly Dictionary<Type, object> _services = new();

    public static void Register<T>(T service) where T : class
    {
        _services[typeof(T)] = service;
    }

    public static T Get<T>() where T : class
    {
        if (_services.TryGetValue(typeof(T), out var service))
            return (T)service;
        throw new InvalidOperationException($"Service {typeof(T).Name} not registered");
    }

    public static bool TryGet<T>(out T service) where T : class
    {
        if (_services.TryGetValue(typeof(T), out var obj))
        {
            service = (T)obj;
            return true;
        }
        service = default!;
        return false;
    }

    public static void Clear() => _services.Clear();
}
```

### Registration and Usage

```csharp
// GameBootstrap.cs — Main scene script
public partial class GameBootstrap : Node
{
    public override void _Ready()
    {
        ServiceLocator.Register<IAudioService>(new GodotAudioService());
        ServiceLocator.Register<ISaveService>(new FileSaveService());
    }
}

// Player.cs — Consumer
public partial class Player : CharacterBody3D
{
    private IAudioService _audio = null!;
    private ISaveService _save = null!;

    public override void _Ready()
    {
        _audio = ServiceLocator.Get<IAudioService>();
        _save = ServiceLocator.Get<ISaveService>();
    }

    public void TakeDamage(int amount)
    {
        Health -= amount;
        _audio.PlaySfx("hit");
        _save.Save("autosave", GetPlayerData());
    }
}
```

### Using Chickensoft AutoInject (Community Library)

For deeper DI in C# Godot projects, the [Chickensoft AutoInject](https://github.com/chickensoft-games/AutoInject) library provides reflection-free, node-based injection:

```csharp
// With AutoInject — Provider node declares what it provides
using Chickensoft.AutoInject;

[Meta(typeof(IAutoNode), typeof(IProvider))]
public partial class GameRoot : Node, IProvider<IAudioService>
{
    IAudioService IProvider<IAudioService>.Value() => new GodotAudioService();
}

// Consumer node declares what it depends on
[Meta(typeof(IAutoNode), typeof(IDependent))]
public partial class Player : CharacterBody3D, IDependent
{
    [Dependency] public IAudioService Audio => this.DependOn<IAudioService>();

    public void OnResolved()
    {
        // Called when all dependencies are available
        Audio.PlaySfx("spawn");
    }
}
```

---

## 7. Interface Contracts

### GDScript "Interfaces" via duck typing and class_name

GDScript doesn't have formal interfaces, but you can define contracts using base classes:

```gdscript
# i_audio_service.gd — Abstract base class acting as interface
class_name IAudioService extends RefCounted

func play_sfx(_name: String) -> void:
	push_error("IAudioService.play_sfx() not implemented")

func play_music(_name: String, _fade_time: float = 0.5) -> void:
	push_error("IAudioService.play_music() not implemented")

func stop_all() -> void:
	push_error("IAudioService.stop_all() not implemented")
```

```gdscript
# godot_audio_service.gd — Real implementation
class_name GodotAudioService extends IAudioService

func play_sfx(sfx_name: String) -> void:
	# Real audio playback logic
	var stream: AudioStream = load("res://audio/sfx/%s.ogg" % sfx_name)
	if stream:
		var player := AudioStreamPlayer.new()
		player.stream = stream
		player.play()


func play_music(track_name: String, fade_time: float = 0.5) -> void:
	# Real music playback with crossfade
	pass


func stop_all() -> void:
	# Stop all audio
	pass
```

```gdscript
# mock_audio_service.gd — Test double
class_name MockAudioService extends IAudioService

var sfx_played: Array[String] = []
var music_played: Array[String] = []

func play_sfx(sfx_name: String) -> void:
	sfx_played.append(sfx_name)

func play_music(track_name: String, _fade_time: float = 0.5) -> void:
	music_played.append(track_name)

func stop_all() -> void:
	sfx_played.clear()
	music_played.clear()
```

---

## 8. Testing with Mock Services

### GDScript Test Example (GdUnit4)

```gdscript
# test_player_combat.gd
extends GdUnitTestSuite

var _player: Player
var _mock_audio: MockAudioService
var _mock_save: MockSaveService

func before_test() -> void:
	Services.clear_all()
	_mock_audio = MockAudioService.new()
	_mock_save = MockSaveService.new()
	Services.register("audio", _mock_audio)
	Services.register("save", _mock_save)
	_player = auto_free(Player.new())
	add_child(_player)


func after_test() -> void:
	Services.clear_all()


func test_take_damage_plays_hit_sound() -> void:
	_player.health = 100
	_player.take_damage(25)
	assert_int(_player.health).is_equal(75)
	assert_array(_mock_audio.sfx_played).contains(["hit"])


func test_take_damage_marks_save_dirty() -> void:
	_player.take_damage(10)
	assert_bool(_mock_save.is_dirty).is_true()
```

### C# Test Example (xUnit)

```csharp
public class PlayerCombatTests
{
    [Fact]
    public void TakeDamage_PlaysSfx()
    {
        var mockAudio = new MockAudioService();
        ServiceLocator.Clear();
        ServiceLocator.Register<IAudioService>(mockAudio);
        ServiceLocator.Register<ISaveService>(new MockSaveService());

        // In practice, instantiate the node via SceneTree or Chickensoft GodotTestDriver
        var player = new Player();
        player._Ready(); // Manually trigger for unit test
        player.TakeDamage(25);

        Assert.Contains("hit", mockAudio.SfxPlayed);
    }
}

public class MockAudioService : IAudioService
{
    public List<string> SfxPlayed { get; } = new();
    public void PlaySfx(string name) => SfxPlayed.Add(name);
    public void PlayMusic(string name, float fadeTime = 0.5f) { }
    public void StopAll() => SfxPlayed.Clear();
}
```

---

## 9. Practical Example: Swappable Save System

```gdscript
# i_save_service.gd
class_name ISaveService extends RefCounted

var is_dirty: bool = false

func save_game(_slot: String, _data: Dictionary) -> Error:
	push_error("Not implemented")
	return ERR_METHOD_NOT_FOUND

func load_game(_slot: String) -> Dictionary:
	push_error("Not implemented")
	return {}

func mark_dirty() -> void:
	is_dirty = true
```

```gdscript
# file_save_service.gd — Production: writes to disk
class_name FileSaveService extends ISaveService

const SAVE_DIR: String = "user://saves/"

func save_game(slot: String, data: Dictionary) -> Error:
	DirAccess.make_dir_recursive_absolute(SAVE_DIR)
	var path: String = SAVE_DIR + slot + ".json"
	var json: String = JSON.stringify(data, "\t")
	var file := FileAccess.open(path, FileAccess.WRITE)
	if not file:
		return FileAccess.get_open_error()
	file.store_string(json)
	is_dirty = false
	return OK


func load_game(slot: String) -> Dictionary:
	var path: String = SAVE_DIR + slot + ".json"
	if not FileAccess.file_exists(path):
		return {}
	var file := FileAccess.open(path, FileAccess.READ)
	var json := JSON.new()
	json.parse(file.get_as_text())
	return json.data as Dictionary
```

```gdscript
# memory_save_service.gd — Testing: in-memory only
class_name MemorySaveService extends ISaveService

var _store: Dictionary[String, Dictionary] = {}

func save_game(slot: String, data: Dictionary) -> Error:
	_store[slot] = data.duplicate(true)
	is_dirty = false
	return OK

func load_game(slot: String) -> Dictionary:
	return _store.get(slot, {})
```

```csharp
// C# equivalent
public class FileSaveService : ISaveService
{
    private const string SaveDir = "user://saves/";

    public Error Save(string slot, Godot.Collections.Dictionary data)
    {
        DirAccess.MakeDirRecursiveAbsolute(SaveDir);
        string path = $"{SaveDir}{slot}.json";
        using var file = FileAccess.Open(path, FileAccess.ModeFlags.Write);
        if (file == null) return FileAccess.GetOpenError();
        file.StoreString(Json.Stringify(data, "\t"));
        return Error.Ok;
    }

    public Godot.Collections.Dictionary Load(string slot)
    {
        string path = $"{SaveDir}{slot}.json";
        if (!FileAccess.FileExists(path))
            return new Godot.Collections.Dictionary();
        using var file = FileAccess.Open(path, FileAccess.ModeFlags.Read);
        var json = new Json();
        json.Parse(file.GetAsText());
        return (Godot.Collections.Dictionary)json.Data;
    }

    public bool SlotExists(string slot) =>
        FileAccess.FileExists($"{SaveDir}{slot}.json");
}

public class MemorySaveService : ISaveService
{
    private readonly Dictionary<string, Godot.Collections.Dictionary> _store = new();

    public Error Save(string slot, Godot.Collections.Dictionary data)
    {
        _store[slot] = (Godot.Collections.Dictionary)data.Duplicate(true);
        return Error.Ok;
    }

    public Godot.Collections.Dictionary Load(string slot) =>
        _store.TryGetValue(slot, out var data) ? data : new();

    public bool SlotExists(string slot) => _store.ContainsKey(slot);
}
```

---

## 10. When NOT to Use DI

DI adds indirection. Don't use it everywhere.

| Situation | Use DI? | Why |
|---|---|---|
| Audio, save, analytics, networking | **Yes** | Swappable, testable, platform-specific |
| Input mapping | **Maybe** | Autoload is fine if it's stateless |
| Scene transitions | **No** | Direct calls to `SceneTree` are clear enough |
| Math/utility functions | **No** | Static methods with no side effects — just call them |
| One-off scripts in game jams | **No** | Over-engineering for throwaway code |
| Player accessing their own child nodes | **No** | `$Sprite2D` is fine — it's structural, not a service |

---

## 11. Common Mistakes

| Mistake | Why It Breaks | Fix |
|---|---|---|
| Accessing services in `_init()` | Services aren't registered yet at `_init()` time | Resolve services in `_ready()` |
| Registering scene-specific state as a global service | State leaks across scene changes | Unregister services on scene exit, or scope services to scene lifetime |
| Over-abstracting everything | 5 files to play a sound effect | Only abstract services you'll actually swap or test |
| Storing mutable state in the service locator itself | Race conditions, hard to debug | The locator is a registry — state lives in the services |
| Forgetting `Services.clear_all()` between tests | Previous test's mocks leak into the next test | Call `clear_all()` in setup/teardown |
| Using DI but still referencing Autoloads directly | Mixed patterns = confusion | Pick one approach per service and stick with it |
