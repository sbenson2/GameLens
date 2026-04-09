# G29 — Testing & Quality Assurance

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#  
> **Related:** [G20 CI/CD & Export Pipelines](./G20_cicd_and_export_pipelines.md) · [G18 Performance Profiling](./G18_performance_profiling.md) · [G2 State Machine](./G2_state_machine.md) · [E1 Architecture Overview](../architecture/E1_architecture_overview.md)

---

## What This Guide Covers

Games are hard to test. State machines have dozens of transitions, physics interactions are nondeterministic, and "it feels wrong" is a valid bug report. But automated testing still catches regressions, validates game logic, and makes refactoring safe.

This guide covers unit testing with GUT and GdUnit4, scene/integration testing, mocking and test doubles, testing game-specific patterns (state machines, signals, physics, input), test-driven development workflows in Godot, code coverage, and structuring tests for a game project.

**G20 covers CI/CD integration** with GdUnit4 — this guide focuses on *writing* effective tests and testing strategy.

---

## Table of Contents

1. [Testing Philosophy for Games](#1-testing-philosophy-for-games)
2. [Framework Comparison: GUT vs GdUnit4](#2-framework-comparison-gut-vs-gdunit4)
3. [Setting Up GUT](#3-setting-up-gut)
4. [Setting Up GdUnit4](#4-setting-up-gdunit4)
5. [Writing Your First Test](#5-writing-your-first-test)
6. [Unit Testing Game Logic](#6-unit-testing-game-logic)
7. [Scene Testing](#7-scene-testing)
8. [Testing Signals](#8-testing-signals)
9. [Testing State Machines](#9-testing-state-machines)
10. [Mocking & Test Doubles](#10-mocking--test-doubles)
11. [Testing Input](#11-testing-input)
12. [Testing with Physics](#12-testing-with-physics)
13. [Test Organization & Naming](#13-test-organization--naming)
14. [Test-Driven Development Workflow](#14-test-driven-development-workflow)
15. [C# Testing with GdUnit4Net](#15-c-testing-with-gdunit4net)
16. [Common Mistakes & Fixes](#16-common-mistakes--fixes)

---

## 1. Testing Philosophy for Games

Not everything in a game is worth unit testing. Focus your testing effort where it pays off:

```
HIGH VALUE (test these)          LOW VALUE (manual QA)
─────────────────────            ────────────────────
  Game logic & rules               Visual polish
  State machine transitions        "Game feel" tuning
  Inventory/economy math           Particle effects
  Save/load serialization          Animation blending
  Damage formulas                  Shader appearance
  Quest/dialogue state             Camera smoothness
  Spawning & pooling logic         UI layout aesthetics
```

**The testing pyramid for games:**

```
          ┌──────────┐
          │ Playtest  │  ◄── Manual: feel, fun, balance
         ┌┴──────────┴┐
         │Integration  │  ◄── Scene tests: systems working together
        ┌┴────────────┴┐
        │  Unit Tests   │  ◄── Automated: pure logic, math, state
        └──────────────┘
```

---

## 2. Framework Comparison: GUT vs GdUnit4

| Feature | GUT (9.x) | GdUnit4 |
|---------|-----------|---------|
| Language | GDScript | GDScript + C# |
| Installation | AssetLib addon | AssetLib addon |
| Editor integration | GUT panel in editor | Test inspector panel |
| CLI runner | `godot --headless -s addons/gut/gut_cmdln.gd` | `godot --headless -s addons/gdUnit4/...` |
| Assertions | `assert_eq`, `assert_true`, etc. | Fluent API: `assert_str(x).is_equal("y")` |
| Mocking | Built-in double/stub | Built-in mock/spy |
| Scene testing | `add_child_autofree()` | `scene_runner()` with tick control |
| Parameterized tests | Via inner classes | Native `@Parameters` annotation |
| CI integration | Custom scripts | Official GitHub Action |
| Maturity | Established since Godot 3 | Newer, very active development |

**Recommendation:** Use **GdUnit4** for new projects (better C# support, modern API, official CI action). Use **GUT** if you prefer its simpler API or are migrating from Godot 3.

---

## 3. Setting Up GUT

### Install from AssetLib

1. **AssetLib → Search "GUT"** → Install "GUT - Godot Unit Testing"
2. Enable the plugin: **Project → Project Settings → Plugins → Gut → Enable**
3. The GUT panel appears at the bottom of the editor

### Directory structure

```
project/
├── test/
│   ├── unit/
│   │   ├── test_player_stats.gd
│   │   └── test_inventory.gd
│   └── integration/
│       ├── test_combat.gd
│       └── test_save_load.gd
└── addons/gut/
```

### GUT configuration (`.gutconfig.json`)

```json
{
  "dirs": ["res://test/"],
  "prefix": "test_",
  "suffix": ".gd",
  "should_exit": true,
  "should_exit_on_success": true,
  "log_level": 1
}
```

---

## 4. Setting Up GdUnit4

### Install from AssetLib

1. **AssetLib → Search "GdUnit4"** → Install
2. Enable plugin: **Project → Project Settings → Plugins → gdUnit4 → Enable**
3. Restart editor — the GdUnit4 inspector tab appears

### Directory structure

GdUnit4 supports tests alongside source files or in a separate directory:

```
# Option A: tests alongside source (recommended by GdUnit4)
scripts/
├── player/
│   ├── player_stats.gd
│   └── player_stats_test.gd

# Option B: separate test directory
test/
├── player/
│   └── player_stats_test.gd
```

---

## 5. Writing Your First Test

### GUT — test a damage formula

```gdscript
# test/unit/test_damage_calc.gd
extends GutTest

var calc: DamageCalculator

func before_each() -> void:
    calc = DamageCalculator.new()

func after_each() -> void:
    calc.free()

func test_basic_damage() -> void:
    var result: float = calc.calculate(10.0, 5.0)  # attack, defense
    assert_eq(result, 5.0, "Damage = attack - defense")

func test_minimum_damage_is_one() -> void:
    var result: float = calc.calculate(3.0, 10.0)
    assert_eq(result, 1.0, "Minimum damage should be 1")

func test_critical_doubles_damage() -> void:
    var result: float = calc.calculate(10.0, 5.0, true)  # is_critical
    assert_eq(result, 10.0, "Critical hit doubles damage")
```

### GdUnit4 — same test, fluent API

```gdscript
# test/unit/test_damage_calc.gd
extends GdUnitTestSuite

var calc: DamageCalculator

func before_test() -> void:
    calc = auto_free(DamageCalculator.new())

func test_basic_damage() -> void:
    var result: float = calc.calculate(10.0, 5.0)
    assert_float(result).is_equal(5.0)

func test_minimum_damage_is_one() -> void:
    var result: float = calc.calculate(3.0, 10.0)
    assert_float(result).is_equal(1.0)

func test_critical_doubles_damage() -> void:
    var result: float = calc.calculate(10.0, 5.0, true)
    assert_float(result).is_equal(10.0)
```

---

## 6. Unit Testing Game Logic

### Testing an inventory system

```gdscript
# GdUnit4 example
extends GdUnitTestSuite

var inventory: Inventory

func before_test() -> void:
    inventory = auto_free(Inventory.new())
    inventory.max_slots = 10

func test_add_item() -> void:
    var success: bool = inventory.add_item("sword", 1)
    assert_bool(success).is_true()
    assert_int(inventory.get_count("sword")).is_equal(1)

func test_add_item_stacks() -> void:
    inventory.add_item("potion", 3)
    inventory.add_item("potion", 2)
    assert_int(inventory.get_count("potion")).is_equal(5)

func test_cannot_exceed_max_slots() -> void:
    for i: int in 10:
        inventory.add_item("item_%d" % i, 1)
    var success: bool = inventory.add_item("overflow", 1)
    assert_bool(success).is_false()

func test_remove_item() -> void:
    inventory.add_item("sword", 3)
    inventory.remove_item("sword", 2)
    assert_int(inventory.get_count("sword")).is_equal(1)

func test_remove_all_clears_slot() -> void:
    inventory.add_item("sword", 1)
    inventory.remove_item("sword", 1)
    assert_bool(inventory.has_item("sword")).is_false()
```

### Testing a crafting recipe validator

```gdscript
func test_valid_recipe_with_all_ingredients() -> void:
    inventory.add_item("iron_ore", 3)
    inventory.add_item("wood", 2)
    var recipe := CraftingRecipe.new("iron_sword", {"iron_ore": 3, "wood": 2})
    assert_bool(recipe.can_craft(inventory)).is_true()

func test_invalid_recipe_missing_ingredient() -> void:
    inventory.add_item("iron_ore", 1)  # need 3
    inventory.add_item("wood", 2)
    var recipe := CraftingRecipe.new("iron_sword", {"iron_ore": 3, "wood": 2})
    assert_bool(recipe.can_craft(inventory)).is_false()
```

---

## 7. Scene Testing

Scene tests instantiate actual scenes and verify behavior — the closest automated tests get to real gameplay.

### GdUnit4 scene runner

```gdscript
extends GdUnitTestSuite

func test_player_takes_damage() -> void:
    # Load and run the player scene
    var runner := scene_runner("res://scenes/player.tscn")
    var player: Player = runner.scene() as Player
    
    # Verify initial state
    assert_int(player.health).is_equal(100)
    
    # Simulate taking damage
    player.take_damage(25)
    
    # Advance one frame so _process runs
    await runner.simulate_frames(1)
    
    assert_int(player.health).is_equal(75)

func test_player_dies_at_zero_health() -> void:
    var runner := scene_runner("res://scenes/player.tscn")
    var player: Player = runner.scene() as Player
    
    player.take_damage(100)
    await runner.simulate_frames(1)
    
    assert_bool(player.is_dead).is_true()
```

### GUT scene testing

```gdscript
extends GutTest

func test_enemy_spawner_creates_enemies() -> void:
    var spawner: EnemySpawner = preload("res://scenes/enemy_spawner.tscn").instantiate()
    add_child_autofree(spawner)
    
    spawner.spawn_wave(3)
    
    # Wait for spawning to complete
    await get_tree().create_timer(0.1).timeout
    
    assert_eq(spawner.get_child_count(), 3, "Should spawn 3 enemies")
```

---

## 8. Testing Signals

### GdUnit4 signal assertions

```gdscript
func test_health_changed_signal() -> void:
    var player := auto_free(Player.new())
    
    # Monitor the signal
    var monitor := monitor_signals(player)
    
    player.take_damage(10)
    
    # Verify signal was emitted with correct args
    await assert_signal(player).is_emitted("health_changed", [90])

func test_item_picked_up_signal() -> void:
    var runner := scene_runner("res://scenes/player.tscn")
    var player: Player = runner.scene() as Player
    
    var item := auto_free(PickupItem.new())
    item.item_id = "gold_coin"
    runner.scene().add_child(item)
    
    # Trigger pickup
    player.pickup(item)
    
    await assert_signal(player).is_emitted("item_collected", ["gold_coin"])
```

### GUT signal testing

```gdscript
func test_signal_emitted() -> void:
    var player := Player.new()
    add_child_autofree(player)
    watch_signals(player)
    
    player.take_damage(10)
    
    assert_signal_emitted(player, "health_changed")
    assert_signal_emitted_with_parameters(player, "health_changed", [90])
```

---

## 9. Testing State Machines

State machines (see [G2](./G2_state_machine.md)) are excellent candidates for testing because they have well-defined transitions.

```gdscript
extends GdUnitTestSuite

var fsm: PlayerStateMachine

func before_test() -> void:
    fsm = auto_free(PlayerStateMachine.new())
    fsm._ready()  # Initialize states

func test_starts_in_idle() -> void:
    assert_str(fsm.current_state.name).is_equal("Idle")

func test_idle_to_run_on_move() -> void:
    fsm.handle_input({"move": Vector2.RIGHT})
    assert_str(fsm.current_state.name).is_equal("Run")

func test_run_to_idle_on_stop() -> void:
    fsm.handle_input({"move": Vector2.RIGHT})
    fsm.handle_input({"move": Vector2.ZERO})
    assert_str(fsm.current_state.name).is_equal("Idle")

func test_jump_from_idle() -> void:
    fsm.handle_input({"jump": true})
    assert_str(fsm.current_state.name).is_equal("Jump")

func test_cannot_jump_while_jumping() -> void:
    fsm.handle_input({"jump": true})
    fsm.handle_input({"jump": true})  # second jump
    assert_str(fsm.current_state.name).is_equal("Jump")  # still in Jump, not double-jump

func test_attack_from_idle() -> void:
    fsm.handle_input({"attack": true})
    assert_str(fsm.current_state.name).is_equal("Attack")

func test_cannot_move_during_attack() -> void:
    fsm.handle_input({"attack": true})
    fsm.handle_input({"move": Vector2.RIGHT})
    assert_str(fsm.current_state.name).is_equal("Attack")  # locked in attack
```

---

## 10. Mocking & Test Doubles

### GdUnit4 mocking

```gdscript
func test_player_uses_weapon_damage() -> void:
    # Create a mock weapon
    var weapon: Weapon = mock(Weapon)
    # Stub the damage method
    do_return(25).on(weapon).get_damage()
    
    var player := auto_free(Player.new())
    player.equip(weapon)
    
    var damage: int = player.calculate_attack_damage()
    assert_int(damage).is_equal(25)
    
    # Verify the method was called
    verify(weapon).get_damage()

func test_enemy_ai_calls_pathfinding() -> void:
    var nav_agent: NavigationAgent2D = mock(NavigationAgent2D)
    var enemy := auto_free(Enemy.new())
    enemy.nav_agent = nav_agent
    
    enemy.chase_player(Vector2(100, 200))
    
    # Verify pathfinding was requested
    verify(nav_agent).set_target_position(Vector2(100, 200))
```

### GUT doubling

```gdscript
func test_with_double() -> void:
    var weapon := double(Weapon).new()
    stub(weapon, "get_damage").to_return(25)
    
    var player := Player.new()
    add_child_autofree(player)
    player.equip(weapon)
    
    assert_eq(player.calculate_attack_damage(), 25)
    assert_called(weapon, "get_damage")
```

---

## 11. Testing Input

### GdUnit4 input simulation

```gdscript
func test_player_moves_right_on_input() -> void:
    var runner := scene_runner("res://scenes/player.tscn")
    var player: Player = runner.scene() as Player
    var start_x: float = player.position.x
    
    # Simulate pressing "move_right" action
    runner.simulate_action_pressed("move_right")
    await runner.simulate_frames(10)
    runner.simulate_action_released("move_right")
    
    assert_float(player.position.x).is_greater(start_x)

func test_player_jumps_on_space() -> void:
    var runner := scene_runner("res://scenes/player.tscn")
    var player: Player = runner.scene() as Player
    
    runner.simulate_key_pressed(KEY_SPACE)
    await runner.simulate_frames(5)
    
    assert_float(player.velocity.y).is_less(0.0)  # moving upward
```

---

## 12. Testing with Physics

Physics tests need frame simulation since physics runs in `_physics_process`.

```gdscript
func test_projectile_moves_forward() -> void:
    var runner := scene_runner("res://scenes/projectile.tscn")
    var bullet: Projectile = runner.scene() as Projectile
    bullet.direction = Vector2.RIGHT
    bullet.speed = 200.0
    var start_x: float = bullet.position.x
    
    # Simulate ~1 second of physics frames
    await runner.simulate_frames(60)
    
    assert_float(bullet.position.x).is_greater(start_x + 100.0)

func test_rigidbody_falls_with_gravity() -> void:
    var runner := scene_runner("res://scenes/crate.tscn")
    var crate: RigidBody2D = runner.scene() as RigidBody2D
    var start_y: float = crate.position.y
    
    await runner.simulate_frames(30)
    
    assert_float(crate.position.y).is_greater(start_y)
```

**Tip:** Physics tests can be flaky due to floating-point precision. Use tolerance:
```gdscript
assert_float(value).is_equal_approx(expected, 0.1)
```

---

## 13. Test Organization & Naming

### Naming convention

```
test_<unit>_<scenario>_<expected_result>

# Examples:
test_inventory_add_item_increases_count
test_player_take_damage_emits_signal
test_state_machine_idle_to_jump_on_input
test_save_system_round_trip_preserves_data
```

### Recommended project structure

```
test/
├── unit/                          # Fast, isolated logic tests
│   ├── test_damage_calculator.gd
│   ├── test_inventory.gd
│   ├── test_crafting.gd
│   └── test_state_machine.gd
├── integration/                   # Scene tests, system interactions
│   ├── test_player_combat.gd
│   ├── test_save_load.gd
│   └── test_level_spawning.gd
├── helpers/                       # Shared test utilities
│   ├── test_scene_factory.gd
│   └── mock_data.gd
└── resources/                     # Test fixtures
    ├── test_level.tscn
    └── test_inventory_data.tres
```

### Running tests

```bash
# GUT from command line
godot --headless -s addons/gut/gut_cmdln.gd

# GdUnit4 from command line
godot --headless -s addons/gdUnit4/bin/GdUnitCmdTool.gd --add test/

# Run a specific test file
godot --headless -s addons/gdUnit4/bin/GdUnitCmdTool.gd --add test/unit/test_inventory.gd
```

---

## 14. Test-Driven Development Workflow

TDD works well for game logic. The cycle:

1. **Red** — write a failing test for the next behavior
2. **Green** — write the minimum code to pass
3. **Refactor** — clean up while tests stay green

### Example: TDD a health component

```gdscript
# Step 1: RED — write the test first
func test_health_initializes_to_max() -> void:
    var health := auto_free(HealthComponent.new())
    health.max_health = 100
    health.reset()
    assert_int(health.current_health).is_equal(100)

# Step 2: GREEN — implement just enough
# health_component.gd
class_name HealthComponent extends Node
var max_health: int = 100
var current_health: int = 0

func reset() -> void:
    current_health = max_health

# Step 3: Write next test (RED again)
func test_take_damage_reduces_health() -> void:
    var health := auto_free(HealthComponent.new())
    health.max_health = 100
    health.reset()
    health.take_damage(25)
    assert_int(health.current_health).is_equal(75)

# Step 4: GREEN — add take_damage
func take_damage(amount: int) -> void:
    current_health = max(0, current_health - amount)
```

---

## 15. C# Testing with GdUnit4Net

GdUnit4Net integrates with Visual Studio and JetBrains Rider via test adapters.

```csharp
using GdUnit4;
using static GdUnit4.Assertions;

[TestSuite]
public partial class PlayerStatsTest : TestSuite
{
    private PlayerStats _stats = null!;

    [Before]
    public void Setup()
    {
        _stats = AutoFree(new PlayerStats());
        _stats.MaxHealth = 100;
        _stats.Reset();
    }

    [TestCase]
    public void TestInitialHealth()
    {
        AssertInt(_stats.CurrentHealth).IsEqual(100);
    }

    [TestCase]
    public void TestTakeDamage()
    {
        _stats.TakeDamage(25);
        AssertInt(_stats.CurrentHealth).IsEqual(75);
    }

    [TestCase]
    public void TestHealDoesNotExceedMax()
    {
        _stats.TakeDamage(10);
        _stats.Heal(50);
        AssertInt(_stats.CurrentHealth).IsEqual(100);
    }

    [TestCase(5, 10, 15)]
    [TestCase(0, 0, 0)]
    [TestCase(100, 50, 150)]
    public void TestDamageFormula(int attack, int defense, int expected)
    {
        int result = DamageCalculator.Calculate(attack, defense);
        AssertInt(result).IsEqual(expected);
    }
}
```

---

## 16. Common Mistakes & Fixes

| Mistake | Symptom | Fix |
|---------|---------|-----|
| Testing visuals instead of logic | Flaky, slow tests that break on visual changes | Test the data/state, not how it looks |
| Not freeing nodes in tests | Memory leaks, tests interfere with each other | Use `auto_free()` (GdUnit4) or `add_child_autofree()` (GUT) |
| Testing private implementation | Tests break on every refactor | Test public behavior, not internal details |
| No `await` on async operations | Test passes before async code finishes | Use `await runner.simulate_frames()` or timers |
| Physics tests without frame simulation | Physics never runs, values never change | Simulate enough frames: `await runner.simulate_frames(60)` |
| Huge integration tests | Slow suite, hard to debug failures | Prefer small unit tests; use integration tests sparingly |
| Shared mutable state between tests | Order-dependent pass/fail | Fresh setup in `before_test()` / `before_each()` |
| Testing the engine | Verifying that `Vector2.length()` works | Trust the engine; test YOUR code |

---

## Quick Reference

```bash
# Run all tests (GdUnit4)
godot --headless -s addons/gdUnit4/bin/GdUnitCmdTool.gd --add test/

# Run all tests (GUT)
godot --headless -s addons/gut/gut_cmdln.gd

# CI: see G20 for GitHub Actions / GitLab CI integration
```

**Next steps:** Set up your CI pipeline with [G20 CI/CD & Export Pipelines](./G20_cicd_and_export_pipelines.md) to run tests on every push. Use [G18 Performance Profiling](./G18_performance_profiling.md) to benchmark after confirming correctness.
