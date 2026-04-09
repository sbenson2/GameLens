# R1 — Extensions & Custom Behaviors Reference

> **Category:** reference · **Engine:** GDevelop · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Events and Behaviors](../guides/G1_events_and_behaviors.md)

---

## Extensions: GDevelop's Module System

Extensions are GDevelop's mechanism for packaging reusable logic — custom behaviors, new actions/conditions/expressions, and even new object types. They are authored entirely within GDevelop's visual event system (no code required), though JavaScript can be used for advanced cases.

Extensions can be project-local or shared with the community via the **Extension Registry** (searchable from within the editor).

---

### Creating an Extension

1. Open the **Project Manager** panel
2. Click **Create or search for new extensions**
3. Click **Create a new extension** at the bottom
4. Name it descriptively (e.g., "HealthSystem", "TopDownMovement")

An extension can contain any combination of:

| Element | What It Is | Exposed To Event Sheets |
|---------|-----------|------------------------|
| **Behavior** | Attaches to objects, has its own properties and lifecycle | Conditions, actions, expressions scoped to the behavior |
| **Custom action** | A reusable action (like a function) | Called via actions in event sheets |
| **Custom condition** | A reusable condition (returns true/false) | Used in event conditions |
| **Custom expression** | A reusable expression (returns a value) | Used in any expression field |
| **Custom object** | A new object type built from other objects | Full object with its own events |

---

## Custom Behaviors (Events-Based)

Custom behaviors let you encapsulate logic that applies to individual object instances. They are GDevelop's most powerful composition tool — the recommended way to organize game logic as projects grow.

### Behavior Structure

Every custom behavior has:

| Component | Purpose |
|-----------|---------|
| **Properties** | Configuration values (numbers, strings, booleans, choices) that appear in the object's property panel. Each instance can override these values. |
| **Behavior variables** | Internal state variables — not visible in the editor unless you expose them as properties |
| **Lifecycle functions** | Special functions called automatically by the engine |
| **Custom actions** | Logic you can trigger from scene event sheets |
| **Custom conditions** | Checks you can use in scene event conditions |
| **Custom expressions** | Values you can read in scene event expressions |

### Lifecycle Functions

These special functions are called automatically at specific moments:

| Function | When It Runs | Typical Use |
|----------|-------------|-------------|
| `onCreated` | Once, when the object instance is created | Initialize state, set defaults from properties |
| `onStepPreEvents` (doStepPreEvents) | Every frame, **before** scene events run | Update movement, timers, AI — the main update loop |
| `onStepPostEvents` | Every frame, **after** scene events run | Corrections, clamping, collision resolution after scene logic |
| `onDeActivate` | When the behavior is deactivated | Pause effects, stop timers |
| `onActivate` | When the behavior is re-activated | Resume effects |
| `onDestroy` | When the object instance is destroyed | Cleanup, spawn death effects |

### Creating a Behavior: Step by Step

**Example: A "Damageable" behavior that tracks HP and handles damage/death.**

1. In your extension, click **Add a new behavior**
2. Name it `Damageable`
3. Add **properties**:
   - `MaxHealth` (Number, default: 100) — Maximum hit points
   - `InvincibilityDuration` (Number, default: 0.5) — Seconds of invulnerability after taking damage
4. Add **behavior variables**:
   - `CurrentHealth` (Number)
   - `InvincibilityTimer` (Number)
   - `IsAlive` (Boolean, default: true)
5. Add lifecycle function **onCreated**:
   - Set `CurrentHealth` to property `MaxHealth`
   - Set `IsAlive` to true
6. Add lifecycle function **onStepPreEvents**:
   - If `InvincibilityTimer` > 0: subtract `TimeDelta()` from `InvincibilityTimer`
7. Add **custom action** `TakeDamage(Amount)`:
   - Condition: `InvincibilityTimer` <= 0 AND `IsAlive` = true
   - Subtract `Amount` from `CurrentHealth`
   - Set `InvincibilityTimer` to property `InvincibilityDuration`
   - If `CurrentHealth` <= 0: set `IsAlive` to false, trigger condition `OnDeath`
8. Add **custom condition** `IsDead`:
   - Return: `IsAlive` = false
9. Add **custom condition** `OnDeath` (triggered):
   - This is a "trigger once" condition that fires the frame the object dies
10. Add **custom expression** `Health`:
    - Return: `CurrentHealth`

Usage in a scene event sheet:

```
// Event sheet pseudocode
Enemy collides with PlayerBullet:
    Enemy → Damageable: TakeDamage(PlayerBullet.Damage)
    Delete PlayerBullet

Enemy → Damageable: OnDeath:
    Create object Explosion at Enemy.X, Enemy.Y
    Delete Enemy
```

---

## Behavior Properties vs. Variables

| | Properties | Behavior Variables |
|-|------------|-------------------|
| Visible in editor | Yes — appears in object instance panel | No — internal only |
| Per-instance override | Yes — each instance can have different values | Yes — each instance has its own copy |
| Settable at edit time | Yes | No — only at runtime |
| Access from scene events | Via expressions | Only through custom actions/conditions/expressions |
| Use for | Configuration (speed, health, range) | Runtime state (current HP, timers, flags) |

**Best practice:** Expose tuning knobs as properties. Keep internal state as variables. Users of your behavior should interact through your custom actions/conditions/expressions — never access behavior variables directly.

---

## Built-In Behaviors Worth Knowing

GDevelop ships with many built-in behaviors. These are always available without installing extensions:

| Behavior | What It Does | Skill Level |
|----------|-------------|-------------|
| **Top-down movement** | 4/8-direction movement with acceleration and deceleration | Beginner |
| **Platform character** | Side-view platformer physics (gravity, jumping, slopes) | Beginner |
| **Draggable** | Click/touch to drag objects | Beginner |
| **Destroy when outside screen** | Auto-cleanup for off-screen objects | Beginner |
| **Tween** | Animate position, scale, opacity, color, angle with easing | Beginner |
| **Physics 2.0** | Box2D rigid body simulation | Intermediate |
| **Pathfinding** | A* grid navigation with obstacle avoidance | Intermediate |
| **Anchor** | Pin UI elements to screen edges (responsive layout) | Beginner |
| **Bounce** | Bounce off other objects | Beginner |

### Community Extension Behaviors (Highlights)

These are popular behaviors from the extension registry (installable in one click):

| Extension | What It Does |
|-----------|-------------|
| **Smooth Camera** | Camera follow with look-ahead, zoom, shake |
| **Health bar (on object)** | Visual HP bar rendered above the object |
| **Flash (blink)** | Rapid visibility toggle for damage feedback |
| **Finite State Machine** | State management with enter/exit/update hooks |
| **3D Raycasting** | Cast rays in 3D space (for first-person or 2.5D) |
| **Car Physics** | Top-down vehicle steering |
| **Curved Movement** | Bezier curve interpolation |

---

## Extension Best Practices

### Naming

- Use descriptive, specific names: `TopDownShooterAI` not `AI`
- Prefix internal helpers with underscore: `_CalculateAngle`
- Actions should read as verbs: `TakeDamage`, `SetSpeed`, `EnableShield`
- Conditions should read as questions: `IsDead`, `IsInRange`, `HasAmmo`

### Architecture

- **One behavior per concern.** Don't make a "PlayerBehavior" that handles movement, health, inventory, and combat. Make separate behaviors and compose them on the object.
- **Use properties for configuration.** Anything a level designer might want to tweak (speed, damage, range) should be a property, not a hardcoded number.
- **Use `onStepPreEvents` for updates, not scene events.** This keeps logic encapsulated inside the behavior.
- **Communicate between behaviors via conditions and actions.** If `Damageable` needs to tell `AnimationController` to play a hit animation, expose a condition `OnDamaged` that the scene or another behavior can react to.

### Sharing Extensions

1. Test thoroughly in your own project
2. Write a description and set the extension's help URLs
3. Add tags for discoverability
4. Submit to the community registry via the GDevelop GitHub repo (`GDevelopApp/GDevelop-extensions`)
5. A reviewer will check quality, naming, and documentation before merging

---

## Extension Functions (Custom Actions/Conditions)

Beyond behaviors, extensions can define standalone functions — reusable actions, conditions, and expressions that aren't attached to any object.

### Example: A "MathUtils" Extension

| Function Type | Name | Parameters | Returns |
|--------------|------|------------|---------|
| Expression | `Lerp` | `a` (Number), `b` (Number), `t` (Number) | Number — linear interpolation between a and b |
| Expression | `RandomInRange` | `min` (Number), `max` (Number) | Number — random float in range |
| Condition | `IsEven` | `value` (Number) | Boolean — true if value is even |
| Action | `ShakeCamera` | `intensity` (Number), `duration` (Number) | — shakes the camera layer |

These are then available globally in any event sheet, just like built-in actions and conditions.

---

## Quick Decision Guide

| I want to... | Use |
|--------------|-----|
| Add reusable logic to objects | Custom **behavior** in an extension |
| Create a helper function | Custom **action/condition/expression** in an extension |
| Package and share my logic | Submit extension to the **community registry** |
| Configure a behavior per-instance | **Properties** (visible in editor) |
| Track runtime state internally | **Behavior variables** (hidden from editor) |
| Run logic every frame | `onStepPreEvents` lifecycle function |
| React to object creation | `onCreated` lifecycle function |
| Let other systems react to events | Expose **trigger conditions** (like `OnDeath`) |
| Find community solutions | **Create or search for new extensions** in Project Manager |
