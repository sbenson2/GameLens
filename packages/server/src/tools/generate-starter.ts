import { DocStore } from "../core/docs.js";
import { SearchEngine } from "../core/search.js";
import { HybridSearchEngine } from "../core/hybrid-search.js";

type ToolResult = { content: Array<{ type: "text"; text: string }> };

type Engine = "monogame" | "godot" | "phaser";
type SkillLevel = "beginner" | "intermediate" | "advanced";

interface StarterTemplate {
  title: string;
  description: string;
  code: Record<Engine, string>;
  structure: Record<Engine, string>;
  gotchas: Record<Engine, string[]>;
  relatedDocs: Record<Engine, string[]>;
}

// Feature categories with starter templates per engine
const FEATURE_MAP: Record<string, string> = {
  "player movement": "movement",
  "character controller": "movement",
  movement: "movement",
  "player controller": "movement",
  walking: "movement",
  platformer: "movement",
  inventory: "inventory",
  "inventory system": "inventory",
  items: "inventory",
  "item system": "inventory",
  combat: "combat",
  "combat system": "combat",
  health: "combat",
  damage: "combat",
  "hit detection": "combat",
  "state machine": "state-machine",
  fsm: "state-machine",
  "game states": "state-machine",
  "state management": "state-machine",
  "save system": "save-load",
  "save/load": "save-load",
  "save load": "save-load",
  persistence: "save-load",
  saving: "save-load",
  ui: "ui",
  hud: "ui",
  menu: "ui",
  "user interface": "ui",
  "health bar": "ui",
};

const STARTERS: Record<string, StarterTemplate> = {
  movement: {
    title: "Player Movement / Character Controller",
    description: "Basic player movement with input handling, velocity, and collision-aware motion.",
    code: {
      monogame: `// Components/Velocity.cs
using System.Numerics;

namespace MyGame.Components;

/// Velocity component — paired with Position for movement.
/// Separate from Position so stationary entities skip movement system.
public struct Velocity
{
    public Vector2 Value;
    public float MaxSpeed;

    public Velocity(float maxSpeed = 200f)
    {
        Value = Vector2.Zero;
        MaxSpeed = maxSpeed;
    }
}

// Components/PlayerInput.cs
namespace MyGame.Components;

/// Tag + input state component. Only one entity should have this.
public struct PlayerInput
{
    public float MoveX;
    public float MoveY;
    public bool JumpPressed;
}

// Systems/InputSystem.cs
using Arch.Core;
using Apos.Input;

namespace MyGame.Systems;

/// Reads keyboard/gamepad input into PlayerInput component.
/// Runs first in Update — other systems read PlayerInput.
public static class InputSystem
{
    public static void Update(World world)
    {
        var query = new QueryDescription().WithAll<PlayerInput>();
        world.Query(in query, (ref PlayerInput input) =>
        {
            input.MoveX = 0f;
            input.MoveY = 0f;

            // Keyboard
            if (KeyboardCondition.Held(Keys.A) || KeyboardCondition.Held(Keys.Left))
                input.MoveX -= 1f;
            if (KeyboardCondition.Held(Keys.D) || KeyboardCondition.Held(Keys.Right))
                input.MoveX += 1f;
            if (KeyboardCondition.Held(Keys.W) || KeyboardCondition.Held(Keys.Up))
                input.MoveY -= 1f;
            if (KeyboardCondition.Held(Keys.S) || KeyboardCondition.Held(Keys.Down))
                input.MoveY += 1f;

            // Normalize diagonal movement
            var dir = new System.Numerics.Vector2(input.MoveX, input.MoveY);
            if (dir.LengthSquared() > 1f)
            {
                dir = System.Numerics.Vector2.Normalize(dir);
                input.MoveX = dir.X;
                input.MoveY = dir.Y;
            }
        });
    }
}

// Systems/MovementSystem.cs
using Arch.Core;

namespace MyGame.Systems;

/// Applies PlayerInput to Velocity, then Velocity to Position.
/// Uses delta time for frame-rate independence.
public static class MovementSystem
{
    public static void Update(World world, float dt)
    {
        // Apply input to velocity
        var inputQuery = new QueryDescription()
            .WithAll<PlayerInput, Velocity>();
        world.Query(in inputQuery, (ref PlayerInput input, ref Velocity vel) =>
        {
            vel.Value.X = input.MoveX * vel.MaxSpeed;
            vel.Value.Y = input.MoveY * vel.MaxSpeed;
        });

        // Apply velocity to position
        var moveQuery = new QueryDescription()
            .WithAll<Position, Velocity>();
        world.Query(in moveQuery, (ref Position pos, ref Velocity vel) =>
        {
            pos.Value += vel.Value * dt;
        });
    }
}`,
      godot: `# player.gd — Attach to a CharacterBody2D node
extends CharacterBody2D

## Movement speed in pixels per second.
@export var speed: float = 200.0

## For platformers: jump velocity (negative = upward).
@export var jump_velocity: float = -300.0

## Gravity — uses project default. Override in Inspector if needed.
var gravity: float = ProjectSettings.get_setting("physics/2d/default_gravity")

## Set to true for top-down movement (no gravity).
@export var is_top_down: bool = false

func _physics_process(delta: float) -> void:
    if is_top_down:
        _top_down_movement()
    else:
        _platformer_movement(delta)

    move_and_slide()

func _top_down_movement() -> void:
    # Input.get_vector handles normalization for diagonal movement
    var direction := Input.get_vector("ui_left", "ui_right", "ui_up", "ui_down")
    velocity = direction * speed

func _platformer_movement(delta: float) -> void:
    # Gravity
    if not is_on_floor():
        velocity.y += gravity * delta

    # Jump — only when grounded
    if Input.is_action_just_pressed("ui_accept") and is_on_floor():
        velocity.y = jump_velocity

    # Horizontal movement
    var direction := Input.get_axis("ui_left", "ui_right")
    if direction:
        velocity.x = direction * speed
    else:
        # Friction / deceleration
        velocity.x = move_toward(velocity.x, 0, speed)`,
      phaser: `// src/entities/Player.ts
import Phaser from "phaser";

/**
 * Player entity with keyboard-driven movement.
 * Uses Arcade Physics for collision and velocity.
 */
export class Player {
  sprite: Phaser.Physics.Arcade.Sprite;
  cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  speed: number;

  constructor(scene: Phaser.Scene, x: number, y: number, speed = 200) {
    this.speed = speed;

    // Create physics-enabled sprite
    this.sprite = scene.physics.add.sprite(x, y, "player");
    this.sprite.setCollideWorldBounds(true);

    // Set up input
    this.cursors = scene.input.keyboard!.createCursorKeys();
  }

  /** Call in scene update() — handles input + velocity. */
  update(): void {
    const { left, right, up, down } = this.cursors;

    // Horizontal
    if (left?.isDown) {
      this.sprite.setVelocityX(-this.speed);
    } else if (right?.isDown) {
      this.sprite.setVelocityX(this.speed);
    } else {
      this.sprite.setVelocityX(0);
    }

    // Vertical (top-down) or Jump (platformer)
    if (up?.isDown) {
      this.sprite.setVelocityY(-this.speed);
    } else if (down?.isDown) {
      this.sprite.setVelocityY(this.speed);
    } else {
      this.sprite.setVelocityY(0);
    }
  }
}

// Usage in GameScene.ts:
// import { Player } from "../entities/Player";
//
// create() {
//   this.player = new Player(this, 400, 300);
//   this.physics.add.collider(this.player.sprite, wallsLayer);
// }
//
// update() {
//   this.player.update();
// }`,
    },
    structure: {
      monogame: `Components/Position.cs, Components/Velocity.cs, Components/PlayerInput.cs
Systems/InputSystem.cs, Systems/MovementSystem.cs`,
      godot: `scenes/player/player.tscn (CharacterBody2D + CollisionShape2D + Sprite2D)
scenes/player/player.gd`,
      phaser: `src/entities/Player.ts
src/scenes/GameScene.ts (imports and uses Player)`,
    },
    gotchas: {
      monogame: [
        "Always normalize diagonal input — otherwise diagonal is ~41% faster",
        "Use fixed timestep (IsFixedTimeStep = true) or multiply by delta time",
        "Cache QueryDescription — don't recreate each frame",
      ],
      godot: [
        "Use _physics_process() not _process() for CharacterBody2D movement",
        "move_and_slide() uses the velocity property — set it before calling",
        "Input actions (ui_left, etc.) must exist in Project Settings > Input Map",
      ],
      phaser: [
        "Physics sprite vs regular sprite — only physics sprites have velocity/body",
        "createCursorKeys() requires keyboard plugin (enabled by default)",
        "Set collideWorldBounds(true) to prevent the player from leaving the screen",
      ],
    },
    relatedDocs: {
      monogame: ["G56", "G60", "character-controller-theory", "input-handling-theory"],
      godot: ["G4", "G5", "character-controller-theory", "input-handling-theory"],
      phaser: ["character-controller-theory", "input-handling-theory", "physics-theory"],
    },
  },
  "state-machine": {
    title: "State Machine / FSM",
    description: "Finite state machine for game states, character states, or AI behavior.",
    code: {
      monogame: `// Core/StateMachine.cs
namespace MyGame.Core;

/// Simple FSM — states are classes that implement IState.
/// Use for: game states (menu/playing/paused), character states, AI behavior.
public interface IState
{
    void Enter();
    void Update(float dt);
    void Exit();
}

public class StateMachine
{
    private IState? _current;
    private readonly Dictionary<string, IState> _states = new();

    public string CurrentStateName { get; private set; } = "";

    public void Add(string name, IState state)
    {
        _states[name] = state;
    }

    /// Transition to a new state. Calls Exit() on old, Enter() on new.
    public void TransitionTo(string name)
    {
        if (!_states.TryGetValue(name, out var next))
            throw new ArgumentException($"Unknown state: {name}");

        _current?.Exit();
        CurrentStateName = name;
        _current = next;
        _current.Enter();
    }

    public void Update(float dt)
    {
        _current?.Update(dt);
    }
}

// Example states:
// public class IdleState : IState { ... }
// public class RunState : IState { ... }
// public class JumpState : IState { ... }`,
      godot: `# state_machine.gd — Attach to a Node, add State children
class_name StateMachine extends Node

## The initial state (assign in Inspector by dragging a child State node).
@export var initial_state: State

var current_state: State
var states: Dictionary[String, State] = {}

func _ready() -> void:
    # Register all child State nodes
    for child in get_children():
        if child is State:
            states[child.name.to_lower()] = child
            child.state_machine = self

    # Start initial state
    if initial_state:
        current_state = initial_state
        current_state.enter()

func _physics_process(delta: float) -> void:
    if current_state:
        current_state.physics_update(delta)

func _process(delta: float) -> void:
    if current_state:
        current_state.frame_update(delta)

## Call this to transition. State name is case-insensitive.
func transition_to(state_name: String) -> void:
    var new_state = states.get(state_name.to_lower())
    if new_state == null:
        push_warning("State not found: %s" % state_name)
        return
    if new_state == current_state:
        return

    current_state.exit()
    current_state = new_state
    current_state.enter()

# state.gd — Base class for all states
class_name State extends Node

var state_machine: StateMachine

func enter() -> void:
    pass

func exit() -> void:
    pass

func physics_update(_delta: float) -> void:
    pass

func frame_update(_delta: float) -> void:
    pass`,
      phaser: `// src/utils/StateMachine.ts

/**
 * Generic FSM. States are objects with enter/update/exit methods.
 * Use for: scene flow, character behavior, AI patterns.
 */
export interface State {
  enter?(): void;
  update?(dt: number): void;
  exit?(): void;
}

export class StateMachine {
  private states = new Map<string, State>();
  private current: State | null = null;
  currentName = "";

  add(name: string, state: State): this {
    this.states.set(name, state);
    return this;
  }

  /** Transition to a named state. Calls exit() then enter(). */
  transitionTo(name: string): void {
    const next = this.states.get(name);
    if (!next) throw new Error(\`Unknown state: \${name}\`);

    this.current?.exit?.();
    this.currentName = name;
    this.current = next;
    this.current.enter?.();
  }

  /** Call in scene update(). */
  update(dt: number): void {
    this.current?.update?.(dt);
  }
}

// Usage:
// const fsm = new StateMachine()
//   .add("idle", { enter() { sprite.play("idle"); } })
//   .add("run",  { enter() { sprite.play("run"); }, update(dt) { ... } })
//   .add("jump", { enter() { sprite.setVelocityY(-300); } });
// fsm.transitionTo("idle");`,
    },
    structure: {
      monogame: `Core/StateMachine.cs, Core/IState.cs
States/IdleState.cs, States/RunState.cs, States/JumpState.cs`,
      godot: `scripts/state_machine/state_machine.gd, scripts/state_machine/state.gd
scenes/player/states/idle.gd, scenes/player/states/run.gd`,
      phaser: `src/utils/StateMachine.ts
src/entities/PlayerStates.ts (idle, run, jump state objects)`,
    },
    gotchas: {
      monogame: [
        "States should not reference each other directly — use the StateMachine to transition",
        "Pass shared data via a context object, not global state",
        "Exit() is critical for cleanup — unsubscribe events, reset timers",
      ],
      godot: [
        "Add State nodes as children of StateMachine node in scene tree",
        "Use @export var initial_state to set the starting state in Inspector",
        "Don't call transition_to() inside enter() — can cause infinite loops",
      ],
      phaser: [
        "Call fsm.update(dt) in your scene's update() — it won't run automatically",
        "Store the FSM on the entity (this.fsm) not as a scene property",
        "State transitions during update() are safe — exit/enter happen immediately",
      ],
    },
    relatedDocs: {
      monogame: ["G18", "G52", "G11"],
      godot: ["G2", "G1"],
      phaser: ["scene-management-theory", "G18"],
    },
  },
  combat: {
    title: "Combat System (Health + Damage)",
    description: "Basic health, damage, and hit detection for action games.",
    code: {
      monogame: `// Components/Health.cs
namespace MyGame.Components;

/// Health component with damage and healing support.
/// Invincibility frames prevent damage stacking.
public struct Health
{
    public float Current;
    public float Max;
    public float IFramesRemaining;
    public float IFrameDuration;
    public bool IsDead => Current <= 0;

    public Health(float max, float iFrameDuration = 0.5f)
    {
        Current = max;
        Max = max;
        IFramesRemaining = 0;
        IFrameDuration = iFrameDuration;
    }

    /// Returns actual damage dealt (0 if invincible).
    public float TakeDamage(float amount)
    {
        if (IFramesRemaining > 0) return 0;
        var dealt = MathF.Min(amount, Current);
        Current -= dealt;
        IFramesRemaining = IFrameDuration;
        return dealt;
    }

    public void Heal(float amount)
    {
        Current = MathF.Min(Current + amount, Max);
    }

    public void UpdateIFrames(float dt)
    {
        if (IFramesRemaining > 0)
            IFramesRemaining -= dt;
    }
}

// Components/DamageDealer.cs
namespace MyGame.Components;

/// Attach to projectiles, hazards, or enemy hitboxes.
public struct DamageDealer
{
    public float Amount;
    public bool DestroyOnHit;
}`,
      godot: `# health_component.gd — Attach as child node to any damageable entity
class_name HealthComponent extends Node

signal damaged(amount: float)
signal healed(amount: float)
signal died

@export var max_health: float = 100.0
@export var i_frame_duration: float = 0.5

var current_health: float
var _i_frame_timer: float = 0.0

func _ready() -> void:
    current_health = max_health

func _process(delta: float) -> void:
    if _i_frame_timer > 0:
        _i_frame_timer -= delta

## Returns actual damage dealt (0 if invincible).
func take_damage(amount: float) -> float:
    if _i_frame_timer > 0:
        return 0.0

    var dealt := minf(amount, current_health)
    current_health -= dealt
    _i_frame_timer = i_frame_duration
    damaged.emit(dealt)

    if current_health <= 0:
        died.emit()

    return dealt

func heal(amount: float) -> void:
    var actual := minf(amount, max_health - current_health)
    current_health += actual
    healed.emit(actual)

# hitbox_component.gd — Attach to Area2D for damage dealing
class_name HitboxComponent extends Area2D

@export var damage: float = 10.0
@export var destroy_on_hit: bool = false

func _ready() -> void:
    area_entered.connect(_on_area_entered)

func _on_area_entered(area: Area2D) -> void:
    # Look for HealthComponent on the area's parent
    var health = area.get_parent().get_node_or_null("HealthComponent")
    if health is HealthComponent:
        health.take_damage(damage)
        if destroy_on_hit:
            get_parent().queue_free()`,
      phaser: `// src/components/Health.ts

/**
 * Health manager with i-frames. Attach to any sprite.
 * Emits Phaser events for UI updates.
 */
export class Health {
  current: number;
  max: number;
  iFrameMs: number;
  private lastHitTime = 0;
  private scene: Phaser.Scene;
  private owner: Phaser.GameObjects.Sprite;

  constructor(
    scene: Phaser.Scene,
    owner: Phaser.GameObjects.Sprite,
    max: number,
    iFrameMs = 500,
  ) {
    this.scene = scene;
    this.owner = owner;
    this.current = max;
    this.max = max;
    this.iFrameMs = iFrameMs;
  }

  get isDead(): boolean {
    return this.current <= 0;
  }

  takeDamage(amount: number): number {
    const now = this.scene.time.now;
    if (now - this.lastHitTime < this.iFrameMs) return 0;

    const dealt = Math.min(amount, this.current);
    this.current -= dealt;
    this.lastHitTime = now;

    // Flash effect for i-frames
    this.owner.setTintFill(0xffffff);
    this.scene.time.delayedCall(100, () => this.owner.clearTint());

    this.scene.events.emit("health-changed", this.current, this.max);

    if (this.current <= 0) {
      this.scene.events.emit("player-died");
    }
    return dealt;
  }

  heal(amount: number): void {
    this.current = Math.min(this.current + amount, this.max);
    this.scene.events.emit("health-changed", this.current, this.max);
  }
}`,
    },
    structure: {
      monogame: `Components/Health.cs, Components/DamageDealer.cs
Systems/CombatSystem.cs (collision check + apply damage)`,
      godot: `scripts/components/health_component.gd, scripts/components/hitbox_component.gd
Add as child nodes: Entity > HealthComponent, Hitbox > HitboxComponent`,
      phaser: `src/components/Health.ts
Apply in scene: this.playerHealth = new Health(this, playerSprite, 100)`,
    },
    gotchas: {
      monogame: [
        "Always check IFramesRemaining before dealing damage — prevents damage stacking",
        "Update IFrames timer in your systems loop, not in the component itself",
        "Separate collision detection (broadphase) from damage application",
      ],
      godot: [
        "Use Area2D for hitboxes/hurtboxes, not CollisionShape2D directly",
        "Set collision layers: hitbox on layer 2, hurtbox on mask 2",
        "Signals are type-safe in Godot 4.4 — use typed signal declarations",
      ],
      phaser: [
        "Use scene.time.now for timing, not Date.now() — respects pause",
        "Physics overlap for hit detection: this.physics.add.overlap(bullet, enemy, callback)",
        "Clear tint after i-frame flash or the sprite stays white",
      ],
    },
    relatedDocs: {
      monogame: ["combat-theory", "G60", "G15"],
      godot: ["combat-theory", "G3", "G5"],
      phaser: ["combat-theory", "physics-theory"],
    },
  },
  inventory: {
    title: "Inventory System",
    description: "Item storage with add/remove/stack operations.",
    code: {
      monogame: `// Core/Inventory.cs
namespace MyGame.Core;

/// Simple slot-based inventory with stacking.
public class Inventory
{
    public record struct ItemStack(string ItemId, int Count, int MaxStack);

    private readonly ItemStack?[] _slots;
    public int Size => _slots.Length;

    public Inventory(int size = 20)
    {
        _slots = new ItemStack?[size];
    }

    /// Add items. Returns leftover count (0 = all added).
    public int Add(string itemId, int count = 1, int maxStack = 99)
    {
        var remaining = count;

        // First: try to stack with existing
        for (int i = 0; i < _slots.Length && remaining > 0; i++)
        {
            if (_slots[i] is { } slot && slot.ItemId == itemId && slot.Count < slot.MaxStack)
            {
                var space = slot.MaxStack - slot.Count;
                var add = Math.Min(remaining, space);
                _slots[i] = slot with { Count = slot.Count + add };
                remaining -= add;
            }
        }

        // Second: fill empty slots
        for (int i = 0; i < _slots.Length && remaining > 0; i++)
        {
            if (_slots[i] == null)
            {
                var add = Math.Min(remaining, maxStack);
                _slots[i] = new ItemStack(itemId, add, maxStack);
                remaining -= add;
            }
        }

        return remaining;
    }

    /// Remove items. Returns actual count removed.
    public int Remove(string itemId, int count = 1)
    {
        var remaining = count;
        for (int i = _slots.Length - 1; i >= 0 && remaining > 0; i--)
        {
            if (_slots[i] is { } slot && slot.ItemId == itemId)
            {
                var remove = Math.Min(remaining, slot.Count);
                remaining -= remove;
                _slots[i] = slot.Count - remove > 0
                    ? slot with { Count = slot.Count - remove }
                    : null;
            }
        }
        return count - remaining;
    }

    public int CountOf(string itemId) =>
        _slots.Where(s => s?.ItemId == itemId).Sum(s => s!.Value.Count);

    public IEnumerable<(int Slot, ItemStack Item)> GetAll() =>
        _slots.Select((s, i) => (i, s)).Where(x => x.s != null).Select(x => (x.i, x.s!.Value));
}`,
      godot: `# inventory.gd — Standalone inventory resource (no node required)
class_name Inventory extends Resource

signal item_added(item_id: String, count: int)
signal item_removed(item_id: String, count: int)
signal inventory_changed

@export var size: int = 20

## Each slot: { "item_id": String, "count": int, "max_stack": int } or null
var slots: Array = []

func _init() -> void:
    slots.resize(size)
    slots.fill(null)

## Add items. Returns leftover count (0 = all added).
func add_item(item_id: String, count: int = 1, max_stack: int = 99) -> int:
    var remaining := count

    # Stack with existing
    for i in range(slots.size()):
        if remaining <= 0:
            break
        if slots[i] != null and slots[i]["item_id"] == item_id:
            var space: int = slots[i]["max_stack"] - slots[i]["count"]
            var add := mini(remaining, space)
            slots[i]["count"] += add
            remaining -= add

    # Fill empty slots
    for i in range(slots.size()):
        if remaining <= 0:
            break
        if slots[i] == null:
            var add := mini(remaining, max_stack)
            slots[i] = { "item_id": item_id, "count": add, "max_stack": max_stack }
            remaining -= add

    if remaining < count:
        item_added.emit(item_id, count - remaining)
        inventory_changed.emit()

    return remaining

## Remove items. Returns actual count removed.
func remove_item(item_id: String, count: int = 1) -> int:
    var remaining := count
    for i in range(slots.size() - 1, -1, -1):
        if remaining <= 0:
            break
        if slots[i] != null and slots[i]["item_id"] == item_id:
            var remove := mini(remaining, slots[i]["count"])
            slots[i]["count"] -= remove
            remaining -= remove
            if slots[i]["count"] <= 0:
                slots[i] = null

    var removed := count - remaining
    if removed > 0:
        item_removed.emit(item_id, removed)
        inventory_changed.emit()
    return removed

func count_of(item_id: String) -> int:
    var total := 0
    for slot in slots:
        if slot != null and slot["item_id"] == item_id:
            total += slot["count"]
    return total`,
      phaser: `// src/systems/Inventory.ts

export interface ItemStack {
  itemId: string;
  count: number;
  maxStack: number;
}

/**
 * Slot-based inventory with stacking.
 * Emits Phaser events for UI sync.
 */
export class Inventory {
  private slots: (ItemStack | null)[];
  private scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, size = 20) {
    this.scene = scene;
    this.slots = new Array(size).fill(null);
  }

  /** Add items. Returns leftover count (0 = all added). */
  add(itemId: string, count = 1, maxStack = 99): number {
    let remaining = count;

    // Stack existing
    for (let i = 0; i < this.slots.length && remaining > 0; i++) {
      const slot = this.slots[i];
      if (slot && slot.itemId === itemId && slot.count < slot.maxStack) {
        const add = Math.min(remaining, slot.maxStack - slot.count);
        slot.count += add;
        remaining -= add;
      }
    }

    // Fill empty
    for (let i = 0; i < this.slots.length && remaining > 0; i++) {
      if (!this.slots[i]) {
        const add = Math.min(remaining, maxStack);
        this.slots[i] = { itemId, count: add, maxStack };
        remaining -= add;
      }
    }

    if (remaining < count) {
      this.scene.events.emit("inventory-changed", this.getAll());
    }
    return remaining;
  }

  /** Remove items. Returns actual count removed. */
  remove(itemId: string, count = 1): number {
    let remaining = count;
    for (let i = this.slots.length - 1; i >= 0 && remaining > 0; i--) {
      const slot = this.slots[i];
      if (slot && slot.itemId === itemId) {
        const rm = Math.min(remaining, slot.count);
        slot.count -= rm;
        remaining -= rm;
        if (slot.count <= 0) this.slots[i] = null;
      }
    }
    const removed = count - remaining;
    if (removed > 0) {
      this.scene.events.emit("inventory-changed", this.getAll());
    }
    return removed;
  }

  countOf(itemId: string): number {
    return this.slots
      .filter((s): s is ItemStack => s !== null && s.itemId === itemId)
      .reduce((sum, s) => sum + s.count, 0);
  }

  getAll(): { slot: number; item: ItemStack }[] {
    return this.slots
      .map((s, i) => (s ? { slot: i, item: s } : null))
      .filter((x): x is { slot: number; item: ItemStack } => x !== null);
  }
}`,
    },
    structure: {
      monogame: `Core/Inventory.cs
Data/ItemDatabase.cs (optional — item definitions)`,
      godot: `scripts/resources/inventory.gd
scripts/resources/item_database.gd (optional — item Resource definitions)`,
      phaser: `src/systems/Inventory.ts
src/data/items.ts (optional — item definitions)`,
    },
    gotchas: {
      monogame: [
        "Use record struct for ItemStack — value semantics prevent accidental sharing",
        "Inventory is pure data — rendering is a separate UI system",
        "For save/load: serialize as JSON array of { itemId, count } pairs",
      ],
      godot: [
        "Use Resource class for inventory so it can be saved/loaded with ResourceSaver",
        "Signals (inventory_changed) let the UI react without polling",
        "Dictionary slots work for prototypes; use custom Resource classes for complex items",
      ],
      phaser: [
        "Store inventory on the scene registry for cross-scene access",
        "Emit events for UI updates — don't couple inventory to rendering",
        "JSON.stringify/parse for save/load to localStorage",
      ],
    },
    relatedDocs: {
      monogame: ["G18", "G52"],
      godot: ["G11", "G9"],
      phaser: ["scene-management-theory"],
    },
  },
  "save-load": {
    title: "Save/Load System",
    description: "Persist game state to disk/storage with versioned format.",
    code: {
      monogame: `// Core/SaveManager.cs
using System.Text.Json;

namespace MyGame.Core;

/// JSON-based save system with version migration support.
public static class SaveManager
{
    private const int SAVE_VERSION = 1;
    private static readonly string SaveDir =
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), "MyGame");

    public record SaveData(
        int Version,
        string PlayerName,
        float PlayerX,
        float PlayerY,
        float Health,
        List<(string ItemId, int Count)> Inventory,
        Dictionary<string, bool> Flags
    );

    public static void Save(SaveData data, string slot = "save1")
    {
        Directory.CreateDirectory(SaveDir);
        var path = Path.Combine(SaveDir, $"{slot}.json");
        var json = JsonSerializer.Serialize(data with { Version = SAVE_VERSION },
            new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(path, json);
    }

    public static SaveData? Load(string slot = "save1")
    {
        var path = Path.Combine(SaveDir, $"{slot}.json");
        if (!File.Exists(path)) return null;

        var json = File.ReadAllText(path);
        var data = JsonSerializer.Deserialize<SaveData>(json);

        // Version migration
        if (data?.Version < SAVE_VERSION)
        {
            data = Migrate(data);
        }
        return data;
    }

    public static bool Exists(string slot = "save1") =>
        File.Exists(Path.Combine(SaveDir, $"{slot}.json"));

    private static SaveData Migrate(SaveData old) => old;
}`,
      godot: `# save_manager.gd — Autoload singleton
extends Node

const SAVE_VERSION := 1
const SAVE_DIR := "user://saves/"

func save_game(slot: String = "save1") -> void:
    DirAccess.make_dir_recursive_absolute(SAVE_DIR)
    var data := {
        "version": SAVE_VERSION,
        "player": {
            "x": player.global_position.x,
            "y": player.global_position.y,
            "health": player.health_component.current_health,
        },
        "inventory": player.inventory.serialize(),
        "flags": GameManager.flags,
    }
    var path := SAVE_DIR + slot + ".json"
    var file := FileAccess.open(path, FileAccess.WRITE)
    file.store_string(JSON.stringify(data, "  "))

func load_game(slot: String = "save1") -> bool:
    var path := SAVE_DIR + slot + ".json"
    if not FileAccess.file_exists(path):
        return false

    var file := FileAccess.open(path, FileAccess.READ)
    var data: Dictionary = JSON.parse_string(file.get_as_text())

    if data.get("version", 0) < SAVE_VERSION:
        data = _migrate(data)

    # Apply loaded data
    player.global_position = Vector2(data["player"]["x"], data["player"]["y"])
    player.health_component.current_health = data["player"]["health"]
    player.inventory.deserialize(data["inventory"])
    GameManager.flags = data["flags"]
    return true

func has_save(slot: String = "save1") -> bool:
    return FileAccess.file_exists(SAVE_DIR + slot + ".json")

func _migrate(data: Dictionary) -> Dictionary:
    return data`,
      phaser: `// src/systems/SaveManager.ts

const SAVE_VERSION = 1;
const STORAGE_PREFIX = "mygame_";

export interface SaveData {
  version: number;
  player: { x: number; y: number; health: number };
  inventory: { itemId: string; count: number }[];
  flags: Record<string, boolean>;
}

/**
 * localStorage-based save system with versioning.
 * For web games — auto-persists in browser.
 */
export const SaveManager = {
  save(data: Omit<SaveData, "version">, slot = "save1"): void {
    const full: SaveData = { ...data, version: SAVE_VERSION };
    localStorage.setItem(
      STORAGE_PREFIX + slot,
      JSON.stringify(full),
    );
  },

  load(slot = "save1"): SaveData | null {
    const raw = localStorage.getItem(STORAGE_PREFIX + slot);
    if (!raw) return null;

    let data: SaveData = JSON.parse(raw);
    if (data.version < SAVE_VERSION) {
      data = migrate(data);
    }
    return data;
  },

  exists(slot = "save1"): boolean {
    return localStorage.getItem(STORAGE_PREFIX + slot) !== null;
  },

  deleteSave(slot = "save1"): void {
    localStorage.removeItem(STORAGE_PREFIX + slot);
  },
};

function migrate(data: SaveData): SaveData {
  return data;
}`,
    },
    structure: {
      monogame: `Core/SaveManager.cs
Saves stored in: %AppData%/MyGame/save1.json`,
      godot: `scripts/autoload/save_manager.gd (register as Autoload)
Saves stored in: user://saves/save1.json`,
      phaser: `src/systems/SaveManager.ts
Saves stored in: localStorage (browser)`,
    },
    gotchas: {
      monogame: [
        "Use AppData for save location — don't write to game directory",
        "Always include a version number for migration support",
        "Use records for immutable save data snapshots",
      ],
      godot: [
        "user:// path is platform-specific — Godot handles it automatically",
        "FileAccess must be opened and closed properly — use scope-based access",
        "Register as Autoload so save/load is accessible from any scene",
      ],
      phaser: [
        "localStorage has a 5-10MB limit — keep saves small",
        "JSON.parse can throw — wrap in try/catch for corrupted saves",
        "For mobile: consider using the Capacitor Storage plugin instead",
      ],
    },
    relatedDocs: {
      monogame: ["G69", "G52"],
      godot: ["G11", "G1"],
      phaser: ["scene-management-theory"],
    },
  },
  ui: {
    title: "UI System (HUD / Menus)",
    description: "Health bar, score display, and basic menu with transitions.",
    code: {
      monogame: `// UI/HealthBar.cs
using Microsoft.Xna.Framework;
using Microsoft.Xna.Framework.Graphics;

namespace MyGame.UI;

/// Simple health bar rendered with SpriteBatch.
/// No textures needed — uses filled rectangles.
public class HealthBar
{
    public Vector2 Position { get; set; }
    public int Width { get; set; } = 200;
    public int Height { get; set; } = 20;

    private Texture2D _pixel;

    public void LoadContent(GraphicsDevice gd)
    {
        // 1x1 white pixel for drawing filled rects
        _pixel = new Texture2D(gd, 1, 1);
        _pixel.SetData(new[] { Color.White });
    }

    public void Draw(SpriteBatch sb, float current, float max)
    {
        var ratio = MathHelper.Clamp(current / max, 0f, 1f);
        var barColor = ratio > 0.5f ? Color.Green
            : ratio > 0.25f ? Color.Yellow
            : Color.Red;

        // Background
        sb.Draw(_pixel, new Rectangle((int)Position.X, (int)Position.Y, Width, Height), Color.DarkGray);
        // Fill
        sb.Draw(_pixel, new Rectangle((int)Position.X, (int)Position.Y, (int)(Width * ratio), Height), barColor);
        // Border
        DrawBorder(sb, new Rectangle((int)Position.X, (int)Position.Y, Width, Height), Color.White);
    }

    private void DrawBorder(SpriteBatch sb, Rectangle rect, Color color, int thickness = 1)
    {
        sb.Draw(_pixel, new Rectangle(rect.X, rect.Y, rect.Width, thickness), color);
        sb.Draw(_pixel, new Rectangle(rect.X, rect.Bottom - thickness, rect.Width, thickness), color);
        sb.Draw(_pixel, new Rectangle(rect.X, rect.Y, thickness, rect.Height), color);
        sb.Draw(_pixel, new Rectangle(rect.Right - thickness, rect.Y, thickness, rect.Height), color);
    }
}`,
      godot: `# hud.gd — Attach to a CanvasLayer > Control node
extends Control

@onready var health_bar: ProgressBar = $HealthBar
@onready var score_label: Label = $ScoreLabel

func _ready() -> void:
    # Connect to signal bus for reactive updates
    SignalBus.player_damaged.connect(_on_player_damaged)

func update_health(current: float, max_health: float) -> void:
    health_bar.max_value = max_health
    health_bar.value = current

    # Color based on health %
    var ratio := current / max_health
    if ratio > 0.5:
        health_bar.modulate = Color.GREEN
    elif ratio > 0.25:
        health_bar.modulate = Color.YELLOW
    else:
        health_bar.modulate = Color.RED

func update_score(score: int) -> void:
    score_label.text = "Score: %d" % score

func _on_player_damaged(amount: float, _source: Node) -> void:
    # Flash the health bar red briefly
    health_bar.modulate = Color.RED
    var tween := create_tween()
    tween.tween_property(health_bar, "modulate", Color.WHITE, 0.3)

# Scene tree structure:
# CanvasLayer (HUD always on top)
#   └── Control (hud.gd)
#       ├── ProgressBar (HealthBar)
#       └── Label (ScoreLabel)`,
      phaser: `// src/scenes/UIScene.ts
import Phaser from "phaser";

/**
 * Separate UI scene running in parallel with GameScene.
 * Keeps UI logic isolated from gameplay.
 */
export class UIScene extends Phaser.Scene {
  private healthBar!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;
  private maxWidth = 200;

  constructor() {
    super({ key: "UIScene", active: true });
  }

  create(): void {
    this.healthBar = this.add.graphics();
    this.scoreText = this.add.text(16, 40, "Score: 0", {
      fontSize: "18px",
      color: "#fff",
    });

    // Listen for events from GameScene
    const game = this.scene.get("GameScene");
    game.events.on("health-changed", this.updateHealth, this);
    game.events.on("score-changed", this.updateScore, this);

    this.updateHealth(100, 100);
  }

  private updateHealth(current: number, max: number): void {
    const ratio = Phaser.Math.Clamp(current / max, 0, 1);
    const color = ratio > 0.5 ? 0x00ff00 : ratio > 0.25 ? 0xffff00 : 0xff0000;

    this.healthBar.clear();
    // Background
    this.healthBar.fillStyle(0x333333);
    this.healthBar.fillRect(16, 16, this.maxWidth, 16);
    // Fill
    this.healthBar.fillStyle(color);
    this.healthBar.fillRect(16, 16, this.maxWidth * ratio, 16);
    // Border
    this.healthBar.lineStyle(1, 0xffffff);
    this.healthBar.strokeRect(16, 16, this.maxWidth, 16);
  }

  private updateScore(score: number): void {
    this.scoreText.setText("Score: " + score);
  }
}`,
    },
    structure: {
      monogame: `UI/HealthBar.cs, UI/ScoreDisplay.cs
Draw in Game1.Draw() after game world, on a separate SpriteBatch layer`,
      godot: `scenes/ui/hud.tscn (CanvasLayer > Control > ProgressBar + Label)
scenes/ui/hud.gd`,
      phaser: `src/scenes/UIScene.ts (parallel scene)
Add to game config: scene: [GameScene, UIScene]`,
    },
    gotchas: {
      monogame: [
        "Draw UI in screen space (no camera transform) — begin a separate SpriteBatch pass",
        "Create a 1x1 white pixel texture for drawing filled rectangles",
        "UI should read game state, not modify it — one-way data flow",
      ],
      godot: [
        "Use CanvasLayer for HUD so it renders above the game world",
        "Connect UI to signals, don't poll — reactive is cheaper and cleaner",
        "Theme system: create a Theme resource for consistent styling across all UI",
      ],
      phaser: [
        "Use a separate scene (active: true) for UI — keeps it independent of game scene",
        "Graphics objects are efficient for dynamic bars (no texture needed)",
        "Listen to scene events for updates — decouple UI from game logic",
      ],
    },
    relatedDocs: {
      monogame: ["ui-theory", "G52"],
      godot: ["G9", "ui-theory"],
      phaser: ["ui-theory", "scene-management-theory"],
    },
  },
};

const ENGINE_ALIASES: Record<string, Engine> = {
  monogame: "monogame",
  "monogame+arch": "monogame",
  arch: "monogame",
  godot: "godot",
  godot4: "godot",
  phaser: "phaser",
  phaser3: "phaser",
  html5: "phaser",
};

/**
 * generate_starter — Feature-specific starter code with educational comments.
 * Goes beyond scaffold_project by generating implementation code for specific features.
 */
export async function handleGenerateStarter(
  args: { engine: string; genre?: string; feature: string; skillLevel?: string },
  docStore: DocStore,
  searchEngine: SearchEngine,
  hybridSearch?: HybridSearchEngine,
): Promise<ToolResult> {
  const feature = args.feature.trim().toLowerCase();
  if (!feature) {
    return { content: [{ type: "text", text: "Please specify a feature (e.g. 'player movement', 'inventory', 'combat', 'state machine', 'save/load', 'ui')." }] };
  }

  const engineKey = args.engine.toLowerCase().replace(/\s+/g, "");
  const resolvedEngine = ENGINE_ALIASES[engineKey];
  if (!resolvedEngine) {
    return {
      content: [{
        type: "text",
        text: `Unknown engine "${args.engine}".\n\nSupported: monogame, godot, phaser (and aliases like godot4, phaser3, html5)`,
      }],
    };
  }

  // Resolve feature to template key
  const templateKey = FEATURE_MAP[feature] || findClosestFeature(feature);
  const template = templateKey ? STARTERS[templateKey] : null;

  if (!template) {
    const available = [...new Set(Object.values(FEATURE_MAP))].sort();
    return {
      content: [{
        type: "text",
        text: `No starter template for "${feature}".\n\nAvailable features: ${available.join(", ")}\n\nTry one of these, or use \`search_docs\` to find relevant guides.`,
      }],
    };
  }

  const engineLabel = resolvedEngine === "monogame" ? "MonoGame + Arch ECS" : resolvedEngine === "godot" ? "Godot 4.4" : "Phaser 3";
  const lang = resolvedEngine === "monogame" ? "csharp" : resolvedEngine === "godot" ? "gdscript" : "typescript";

  let output = `# ${template.title}\n\n`;
  output += `**Engine:** ${engineLabel}\n`;
  output += `**Feature:** ${template.description}\n`;
  if (args.genre) output += `**Genre:** ${args.genre}\n`;
  if (args.skillLevel) output += `**Skill Level:** ${args.skillLevel}\n`;
  output += `\n`;

  // Starter code
  output += `## Starter Code\n\n`;
  output += `\`\`\`${lang}\n${template.code[resolvedEngine]}\n\`\`\`\n\n`;

  // Project structure
  output += `## Files to Create\n\n`;
  output += `\`\`\`\n${template.structure[resolvedEngine]}\n\`\`\`\n\n`;

  // Gotchas
  output += `## Common Gotchas\n\n`;
  for (const gotcha of template.gotchas[resolvedEngine]) {
    output += `- ${gotcha}\n`;
  }

  // Related docs
  const relatedDocs = template.relatedDocs[resolvedEngine];
  if (relatedDocs.length > 0) {
    output += `\n## Related Docs\n\n`;
    for (const docId of relatedDocs) {
      output += `- \`${docId}\` — use \`get_doc\` for full implementation guide\n`;
    }
  }

  // Search for additional context if genre specified
  if (args.genre) {
    const genreQuery = `${args.genre} ${feature}`;
    const allDocs = docStore.getAllDocs();
    const results = hybridSearch
      ? await hybridSearch.search(genreQuery, allDocs, 3)
      : searchEngine.search(genreQuery, allDocs, 3).map((r) => ({
          doc: r.doc, score: r.score, snippet: r.snippet,
          tfidfScore: r.score, vectorScore: 0,
        }));

    const extra = results.filter((r) => !relatedDocs.includes(r.doc.id));
    if (extra.length > 0) {
      output += `\n## Genre-Specific Docs (${args.genre})\n\n`;
      for (const r of extra.slice(0, 3)) {
        output += `- \`${r.doc.id}\` — ${r.doc.title}\n`;
      }
    }
  }

  output += `\n---\n_This is starter code — adapt it to your project. Use \`get_doc\` on the related docs for complete implementation details._\n`;

  return { content: [{ type: "text", text: output }] };
}

/** Fuzzy match feature name against known features */
function findClosestFeature(input: string): string | null {
  const keys = Object.keys(FEATURE_MAP);
  for (const key of keys) {
    if (key.includes(input) || input.includes(key)) {
      return FEATURE_MAP[key];
    }
  }
  // Try matching against template keys directly
  for (const key of Object.keys(STARTERS)) {
    if (key.includes(input) || input.includes(key)) {
      return key;
    }
  }
  return null;
}
