# G1 — Events and Behaviors in GDevelop

> **Category:** guide · **Engine:** GDevelop · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G2 Extensions](G2_extensions.md)

---

## How Events Work

GDevelop uses an **event-based visual scripting system** instead of traditional code files. Every piece of game logic is expressed as an event: a set of **conditions** on the left and **actions** on the right. When all conditions are true, the actions execute.

```
┌─ Conditions (left)              │ Actions (right)                      ┐
│ Player collides with Coin       │ Delete Coin                          │
│                                 │ Add 1 to Variable(Score)             │
│                                 │ Play sound "coin_pickup"             │
└─────────────────────────────────┴────────────────────────────────────────┘
```

Events run **top to bottom** every frame (~60 FPS). Sub-events are indented beneath a parent and only evaluate when the parent's conditions are true.

---

## Event Types

### Standard Event

The most common type. Conditions filter which objects are affected; actions act on the filtered set.

**Key concept — object picking:** When a condition references an object (e.g., "Enemy health ≤ 0"), GDevelop automatically picks only the instances that match. Subsequent actions in the same event apply only to those picked instances, not all enemies.

```
Condition: Enemy.Health ≤ 0
Action:    Create object Explosion at Enemy.X(), Enemy.Y()
Action:    Delete Enemy
```

This deletes only the enemies with zero health and spawns explosions at their positions.

### Sub-Events

Indented events that inherit the parent's object picking. Use them for branching logic:

```
Condition: Player is overlapping Enemy
├── Sub-event:
│   Condition: Player.Variable(Invincible) = 0
│   Action:    Subtract Enemy.Damage from Player.Health
│   Action:    Set Player.Variable(Invincible) to 1
│   Action:    Start timer "invincibility" for 1.5 seconds
│
├── Sub-event:
│   Condition: Timer "invincibility" has expired
│   Action:    Set Player.Variable(Invincible) to 0
```

### For Each Event

Runs its conditions and actions once per instance of a specified object. **Use sparingly** — standard events already operate on all instances automatically. For Each is only needed when you need to compare each instance against every other instance (e.g., finding the nearest enemy):

```
For each Enemy:
  Condition: Distance between Enemy and Player < ClosestDistance
  Action:    Set ClosestDistance to Distance(Enemy.X(), Enemy.Y(), Player.X(), Player.Y())
  Action:    Set ClosestEnemy to Enemy
```

### Repeat Event

Runs the contained actions a fixed number of times in a single frame. Useful for spawning multiple objects at once:

```
Repeat 5 times:
  Action: Create object Bullet at Player.X(), Player.Y()
  Action: Set Bullet angle to 72 * Variable(LoopIndex)
```

The `LoopIndex` variable (if configured) counts from 0 upward with each repetition.

### While Event

Repeats as long as a condition is true — within a single frame. **Use with extreme caution.** An always-true condition creates an infinite loop that freezes the game. Always ensure the loop body changes something that eventually makes the condition false.

### Link Event

Includes events from another event sheet, similar to an `import` statement. Use links to split logic across multiple sheets:

```
External events: "EnemyAI"
External events: "PlayerControls"
External events: "UIUpdates"
```

This keeps large projects organized. Each linked sheet runs in the order it appears.

---

## Conditions Reference

### Comparison Conditions

| Condition | What It Checks |
|-----------|---------------|
| Variable comparison | Object or scene variable against a value |
| Timer expired | A named timer has counted down to zero |
| Object is on screen | Instance is within the visible area |
| Distance between objects | Pixel distance between two instances |
| Number of instances | Count of a specific object type |

### Collision / Overlap Conditions

| Condition | What It Checks |
|-----------|---------------|
| Is overlapping | Two objects' hitboxes overlap right now |
| Collision | Objects will collide if moved (predictive) |
| Is on floor | Object with Platform behavior is standing on ground |
| Is jumping / Is falling | Platform behavior vertical state |
| Cursor is on object | Mouse hovers over the instance |

### Input Conditions

| Condition | What It Checks |
|-----------|---------------|
| Key is pressed | A keyboard key is held down |
| Key was just released | Key up event this frame |
| Mouse button pressed | Left/right/middle click state |
| Touch / gesture | Mobile touch input |
| Gamepad button | Controller input |

### Trigger Conditions (Run Once)

| Condition | What It Checks |
|-----------|---------------|
| At the beginning of the scene | Fires once when the scene starts |
| Trigger once | Makes any event fire only the first time conditions are met |

**"Trigger once" is critical.** Without it, an event fires every frame its conditions are true. For one-shot actions (play a sound, spawn an object, show a message), always add the "Trigger once" condition.

---

## Actions Reference

### Object Actions

| Action | What It Does |
|--------|-------------|
| Create object | Spawns a new instance at a position |
| Delete object | Removes the instance |
| Change position | Sets X, Y directly or with an offset |
| Change angle | Rotates the object |
| Change animation | Switches to a named animation |
| Change opacity | Sets transparency (0–255) |
| Change Z order | Moves in front of / behind other objects |
| Add force | Applies physics force (angle + length) |
| Apply tint | Colors the sprite |

### Variable Actions

| Action | What It Does |
|--------|-------------|
| Change variable | Set, add, subtract, multiply, divide a variable |
| Change text variable | Set or append a string variable |
| Change boolean variable | Set true/false |
| Change structure variable | Modify a child of a structured variable |

### Scene Actions

| Action | What It Does |
|--------|-------------|
| Change scene | Navigate to another scene |
| Pause / unpause | Freeze or resume game time |
| Change background color | Set the scene clear color |
| Camera: center on object | Follow an instance with the camera |
| Camera: zoom | Change camera zoom level |

---

## Behaviors

Behaviors are pre-built logic modules you attach to objects. They add capabilities without writing events. GDevelop ships with many built-in behaviors and the community provides hundreds more via extensions.

### Built-in Behaviors

| Behavior | What It Provides |
|----------|-----------------|
| **Platform character** | Gravity, jumping, ledge movement. Pair with "Platform" behavior on floors. |
| **Platform** | Marks an object as a solid floor for Platform characters. |
| **Top-down movement** | 4-way or 8-way movement with acceleration and deceleration. |
| **Draggable** | Makes an object draggable with mouse or touch. |
| **Destroy when outside screen** | Auto-deletes objects that leave the visible area (great for bullets). |
| **Bounce** | Object bounces off other objects. |
| **Physics 2.0** | Full Box2D physics (gravity, collisions, joints, forces). |
| **Tween** | Animate position, scale, opacity, or angle over time with easing. |
| **Pathfinding** | A* grid-based pathfinding to navigate around obstacles. |
| **Anchor** | Pins an object to a screen edge or corner (UI layouts). |
| **Text entry** | Captures keyboard input into a text variable. |

### Using Behaviors in Events

Once attached, a behavior's conditions and actions appear in the event editor under that object:

```
Condition: Player (Platform character) is on floor
Condition: Key "Space" is pressed
Action:    Player (Platform character) — Simulate jump key press
```

You can configure behavior properties (gravity, max speed, jump height) in the object's behavior panel, and override them at runtime via actions:

```
Action: Set Player gravity to 800
Action: Set Player max speed to 300
Action: Set Player jump speed to 600
```

### Combining Multiple Behaviors

Objects can have multiple behaviors simultaneously. Common combinations:

- **Platform character + Tween** — smooth camera-ready movement with animated transitions
- **Top-down movement + Pathfinding** — enemies that navigate around obstacles
- **Physics 2.0 + Tween** — physics objects with scripted animations
- **Draggable + Anchor** — UI elements that snap to positions after dragging

---

## Custom Behaviors (Events-Based)

You can create your own behaviors using GDevelop's visual events — no JavaScript required. Custom behaviors are the recommended way to encapsulate reusable logic.

### Creating a Custom Behavior

1. Open the Project Manager → click "Create a new extension"
2. Inside the extension, add a new **Behavior**
3. Define **properties** (variables the user can configure per-instance)
4. Add **functions** that act as the behavior's conditions, actions, and lifecycle events

### Lifecycle Functions

Custom behaviors have special lifecycle functions:

| Function | When It Runs |
|----------|-------------|
| **onCreated** | When the object instance is created |
| **doStepPreEvents** | Every frame, before the scene's event sheet |
| **doStepPostEvents** | Every frame, after the scene's event sheet |
| **onDestroy** | When the object instance is deleted |
| **onActivate** | When the behavior is enabled at runtime |
| **onDeactivate** | When the behavior is disabled at runtime |

### Example: Health System Behavior

A custom "Health" behavior with properties `MaxHealth` and `CurrentHealth`:

```
Extension: HealthSystem
└── Behavior: Health
    ├── Property: MaxHealth (Number, default 100)
    ├── Property: CurrentHealth (Number, default 100)
    │
    ├── Action: "Damage" (parameter: Amount)
    │   └── Subtract Amount from CurrentHealth
    │       Sub-event: CurrentHealth ≤ 0
    │           Action: Trigger "OnDeath" condition
    │           Action: Delete object
    │
    ├── Action: "Heal" (parameter: Amount)
    │   └── Set CurrentHealth to min(CurrentHealth + Amount, MaxHealth)
    │
    ├── Condition: "Is dead"
    │   └── CurrentHealth ≤ 0
    │
    └── Expression: "HealthPercent"
        └── Return CurrentHealth / MaxHealth * 100
```

Once created, any object with the Health behavior gets `Damage`, `Heal`, `Is dead`, and `HealthPercent` in the event editor — just like built-in behaviors.

---

## Scene Variables vs Object Variables vs Behavior Properties

| Scope | Lifetime | Use Case |
|-------|----------|----------|
| **Object variable** | Lives with the instance | HP, state, ammo — per-instance data |
| **Behavior property** | Lives with the instance, scoped to behavior | Behavior config (speed, gravity, etc.) |
| **Scene variable** | Lives for the scene's duration | Score, timer, wave number — shared game state |
| **Global variable** | Lives for the entire game session | Settings, high score, player name |

**Tip:** Prefer object variables over scene variables when data belongs to a specific instance. Overusing scene variables creates the same problems as global variables in traditional code.

---

## Common Patterns

### Pattern: One-Shot Events (Trigger Once)

```
Condition: Player.Health ≤ 0
Condition: Trigger once
Action:    Change scene to "GameOver"
Action:    Play sound "defeat.ogg"
```

Without "Trigger once," the scene change and sound would fire every frame.

### Pattern: Cooldown Timer

```
Condition: Key "Z" is pressed
Condition: Timer "shoot_cooldown" has expired (or doesn't exist)
Action:    Create object Bullet at Player.X() + 16, Player.Y()
Action:    Start timer "shoot_cooldown" for 0.3 seconds
```

### Pattern: Spawn Wave

```
Condition: Variable(EnemiesAlive) = 0
Condition: Trigger once
Action:    Repeat 5 times: Create object Enemy at random(0, SceneWidth), -32
Action:    Add 5 to Variable(EnemiesAlive)
Action:    Add 1 to Variable(WaveNumber)
```

### Pattern: State Machine via Variables

```
Condition: Enemy.Variable(State) = "patrol"
  Sub-event: Enemy has reached end of path
  Action:    Set Enemy.Variable(State) to "wait"
  Action:    Start timer "wait_timer" on Enemy for 2 seconds

Condition: Enemy.Variable(State) = "wait"
  Sub-event: Timer "wait_timer" on Enemy has expired
  Action:    Set Enemy.Variable(State) to "patrol"
  Action:    Find path to random waypoint
```

---

## Performance Tips

1. **Avoid unnecessary "For Each" events.** Standard events already iterate over all instances. For Each adds overhead when the default behavior suffices.
2. **Use "Destroy when outside screen"** on projectiles and particles. Orphaned off-screen objects waste memory and CPU.
3. **Limit "Every frame" checks on large object pools.** Use timers or "Trigger once" to reduce per-frame work.
4. **Prefer behaviors over hand-written events** for common mechanics. Built-in behaviors are optimized in the engine's C++ core.
5. **Split large event sheets** with Link events. Smaller sheets are easier to read and can be selectively disabled for debugging.
