# Physics Engine and Collision Patterns

> **Category:** guide · **Engine:** GDevelop · **Related:** [G1_events_and_behaviors](G1_events_and_behaviors.md), [R1_extensions_and_custom_behaviors](../reference/R1_extensions_and_custom_behaviors.md)

GDevelop includes a built-in 2D physics engine (powered by Box2D) and an experimental 3D physics engine. The 2D Physics behavior simulates gravity, forces, collisions, and joints. This guide covers how to set up physics objects, apply forces, use joints, and avoid common mistakes when mixing physics with GDevelop's event-based logic.

---

## Adding the Physics Behavior

To make an object participate in the physics simulation:

1. Select the object in the Scene editor.
2. Open the **Behaviors** tab and click **Add a behavior**.
3. Choose **Physics Engine 2.0** (not the legacy "Physics" behavior).
4. Configure the body type and properties.

**Important:** All objects that should interact physically must have the Physics Engine 2.0 behavior. A physics object and a non-physics object will not collide in the physics world.

---

## Body Types

| Type | Moves? | Responds to Forces? | Use For |
|------|--------|---------------------|---------|
| **Dynamic** | Yes | Yes (gravity, forces, impulses, collisions) | Players, enemies, projectiles, falling objects |
| **Static** | No | No (immovable, infinite mass) | Ground, walls, platforms, boundaries |
| **Kinematic** | Only via events | No (not affected by gravity or collisions, but can push dynamic objects) | Moving platforms, elevators, conveyor belts |

```
Rule: A static body should never be moved by events after creation.
      If you need a moving solid surface, use Kinematic.
```

---

## Physics Properties

Configure these on each object's Physics behavior:

### Shape

The collision shape used by the physics engine. Options:

- **Box** — rectangle matching the object's bounding box
- **Circle** — centered on the object
- **Edge** — thin line (for one-sided platforms or sensors)
- **Polygon** — custom shape (set via collision mask points)

Use the simplest shape possible. Circles are cheapest, polygons are most expensive.

### Material Properties

| Property | Range | What It Does |
|----------|-------|--------------|
| **Density** | 0+ | Mass = density x area. Higher = heavier. 0 = weightless dynamic body. |
| **Friction** | 0–1 | Surface grip. 0 = ice, 1 = rubber. |
| **Restitution** | 0–1 | Bounciness. 0 = no bounce, 1 = perfect elastic bounce. |

### Damping

| Property | Effect |
|----------|--------|
| **Linear Damping** | Slows linear movement over time (air resistance). 0 = none, 5+ = heavy drag. |
| **Angular Damping** | Slows rotation over time. Useful to prevent infinite spinning. |

---

## Applying Movement

**Never move physics objects using the standard "Change position" actions.** This teleports the object and breaks the physics simulation. Instead, use physics-specific actions:

### Forces vs. Impulses

| Action | Duration | Use For |
|--------|----------|---------|
| **Apply force** | Continuous (apply every frame) | Thrusters, wind, gravity zones |
| **Apply impulse** | Instant (one-time push) | Jumping, explosions, bullet hits |
| **Set velocity** | Overrides current velocity | Direct speed control (use sparingly) |
| **Apply torque** | Continuous rotation | Spinning objects, wheels |
| **Apply angular impulse** | Instant rotation kick | Spin on hit |

### Movement Examples

**Player jump (impulse):**
```
Condition: Key "Space" is pressed
           Player.Physics::IsOnFloor = true
Action:    Player.Physics → Apply impulse 0 on X, -400 on Y
```

**Constant wind (force applied every frame):**
```
Condition: (none — runs every frame)
Action:    Player.Physics → Apply force 50 on X, 0 on Y
```

**Explosion push (impulse toward each nearby object):**
```
For Each object Crate:
  Condition: Distance(Explosion.X, Explosion.Y, Crate.X, Crate.Y) < 200
  Action:    Crate.Physics → Apply impulse
             X: (Crate.X - Explosion.X) * 5
             Y: (Crate.Y - Explosion.Y) * 5
```

---

## Collision Detection

### Physics Collision Events

The Physics behavior provides dedicated collision conditions:

```
Condition: ObjectA.Physics is in collision with ObjectB
```

This uses Box2D's collision detection, which is separate from GDevelop's built-in "is in collision with" condition. **For physics objects, always use the physics-specific collision condition** — the standard one checks bounding boxes and may give false positives or miss narrow shapes.

### Collision Layers and Masks

Physics objects can be assigned to layers (1–16) and given a collision mask specifying which layers they collide with:

```
Player:  Layer 1, Mask: 2, 3    (collides with enemies and ground)
Enemy:   Layer 2, Mask: 1, 3    (collides with player and ground)
Ground:  Layer 3, Mask: 1, 2    (collides with player and enemies)
Bullet:  Layer 4, Mask: 2       (only collides with enemies)
```

This prevents unnecessary collision checks and lets bullets pass through the player.

### Sensors (Triggers)

A physics object can be set as a **sensor** — it detects overlaps but does not cause physical collision responses. Use sensors for:

- Pickup items (detect player overlap, then delete the item)
- Damage zones (detect entry, apply damage, no physical push)
- Trigger areas (detect entry, open a door)

Set "Is a sensor" to true in the behavior properties, then use the physics collision condition to detect overlaps.

---

## Joints

Joints connect two physics objects with constraints. GDevelop supports several joint types:

### Distance Joint

Keeps two objects at a fixed distance, like a rigid rod.

```
Action: Create distance joint between ObjectA and ObjectB
        Length: 100 (pixels, converted to physics meters internally)
        Frequency: 4 Hz (spring oscillation — 0 = rigid)
        Damping ratio: 0.5 (0 = no damping, 1 = critical damping)
```

Use for: chains, ropes (with multiple links), tethered objects.

### Revolute Joint (Hinge)

Objects rotate around a shared anchor point, like a hinge or axle.

```
Action: Create revolute joint between Wheel and Car
        Anchor X, Y: Wheel.CenterX(), Wheel.CenterY()
        Enable motor: true
        Motor speed: 360 (degrees/sec)
        Max motor torque: 1000
```

Use for: wheels, doors, flippers (pinball), swinging platforms.

**Limits:** You can restrict the rotation range (e.g., -45 to +45 degrees) for doors that only swing one way.

### Weld Joint

Rigidly attaches two objects so they move and rotate as one unit. Useful for composite objects (e.g., a turret welded to a tank body).

### Prismatic Joint (Slider)

Constrains movement to a single axis, like a piston or drawer.

```
Action: Create prismatic joint between Piston and Base
        Axis X: 0, Axis Y: 1 (vertical movement only)
        Enable limits: true
        Lower limit: -50, Upper limit: 50
```

### Gear Joint

Links two revolute or prismatic joints so they move in sync (like interlocking gears). Both joints must be attached to a static body as their first object.

### Rope Joint

Like a distance joint but with a maximum length — the objects can get closer but not farther than the rope length.

---

## Mixing Physics and Standard Events

The most common source of bugs is mixing physics actions with standard GDevelop movement:

### Do NOT Mix

- **Standard "Change position"** with physics objects — teleports break simulation.
- **Platformer Character behavior** with Physics 2.0 on the same object — they fight each other.
- **Standard collision detection** for physics objects — may give incorrect results.

### Safe to Mix

- **Physics movement** for the player, **standard events** for UI elements (UI doesn't need physics).
- **Timers and variables** alongside physics — logic and state management are fine.
- **Sensors** for game logic triggers while dynamic bodies handle movement.

### Converting Between Worlds

If you need an object to start as a standard object (menu animation) then become physical (dropped into gameplay):

1. Start without the Physics behavior (or with it disabled if supported).
2. At the transition point, enable physics / create the physics object and apply an initial impulse.

---

## World Settings

Configure the physics world per-scene:

| Setting | Default | Notes |
|---------|---------|-------|
| **Gravity X** | 0 | Horizontal gravity (for side-scrolling wind) |
| **Gravity Y** | 9.8 | Vertical gravity (Earth-like). Set to 0 for top-down or space games. |
| **World Scale** | 100 | Pixels-per-meter. Box2D works best with objects 0.1–10 meters. If your sprites are 64px, a scale of 100 means 0.64m — fine. If sprites are 512px, consider a higher scale. |
| **Time Scale** | 1 | Slow-motion: set to 0.5. Fast-forward: set to 2. |

---

## Performance Tips

1. **Use simple shapes** — circles and boxes are cheaper than polygons. A humanoid character can use a box or capsule (box + circle at feet) rather than a detailed polygon.
2. **Mark static objects as Static** — the engine optimizes static bodies differently and skips recalculating them.
3. **Limit joint count** — each joint is a constraint solver iteration. Chains with 20+ links will slow the simulation.
4. **Avoid tiny or huge objects** — Box2D is tuned for objects 0.1–10 meters. Extremely small or large objects cause instability. Adjust World Scale to keep objects in this range.
5. **Reduce sensor overuse** — sensors still cost collision checks. Use them deliberately, not on every object.

---

## Common Pitfalls

1. **Moving physics objects with "Set position"** — this bypasses the simulation. The object teleports, ignoring collisions. Use forces, impulses, or velocity instead.
2. **Missing Physics behavior on one collider** — two objects must both have Physics 2.0 to interact. If only one does, they pass through each other.
3. **Using legacy Physics (1.0)** — always use "Physics Engine 2.0." The original behavior is deprecated and lacks joints, layers, and modern features.
4. **Wrong World Scale** — if objects feel floaty or jittery, adjust the scale so typical objects are 0.5–5 meters in the physics world.
5. **Stacking Platformer + Physics behaviors** — these two systems conflict. Pick one movement model per object.
