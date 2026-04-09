# G8 — Physics and Platformer Mechanics in Construct 3

> **Category:** guide · **Engine:** Construct · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Event Sheet Patterns](G1_event_sheet_patterns.md) · [R1 Behaviors and Effects](../reference/R1_behaviors_and_effects.md)

---

Construct 3 provides two distinct approaches to movement and physics: the **Platform behavior** for traditional side-scrolling games, and the **Physics behavior** (powered by Box2D) for realistic simulations. This guide covers both systems, when to use each, and how to combine them for advanced gameplay.

---

## Platform Behavior

The Platform behavior implements classic side-view "jump and run" movement with built-in slope handling, moving platforms, and jump-thru platforms. It handles acceleration, deceleration, gravity, and jumping without any event logic required.

### Adding the Platform Behavior

1. Select the player sprite in the Layout editor.
2. In the Properties panel → Behaviors → click **+** → choose **Platform**.
3. A companion **Solid** behavior must be added to any objects the player should walk on.
4. For one-way ledges, use the **Jump-thru** behavior instead of Solid.

### Core Properties

| Property | Default | Description |
|----------|---------|-------------|
| Max speed | 250 | Maximum horizontal movement speed (pixels/sec) |
| Acceleration | 1500 | How quickly the player reaches max speed |
| Deceleration | 1500 | How quickly the player stops when input is released |
| Jump strength | 650 | Initial upward velocity when jumping |
| Gravity | 1500 | Downward acceleration (pixels/sec²) |
| Max fall speed | 1000 | Terminal velocity for falling |
| Jump sustain | 0.2 | Seconds the jump key can be held to sustain upward force (enables variable-height jumps) |
| Default controls | Yes | Enables built-in arrow key / gamepad movement |

### Key Conditions

| Condition | Description |
|-----------|-------------|
| Is on floor | True when the player is standing on a Solid or Jump-thru |
| Is jumping | True during the upward phase of a jump |
| Is falling | True during the downward phase after a jump or walking off an edge |
| Is moving | True when horizontal velocity is non-zero |
| On landed | Triggered once the instant the player touches the ground |
| Is by wall | True when pressing against a Solid horizontally |
| Compare speed | Compare current horizontal or vertical speed to a value |

### Useful Actions

| Action | Description |
|--------|-------------|
| Set max speed | Change max speed at runtime (e.g., sprint when holding Shift) |
| Set jump strength | Alter jump power (e.g., power-ups, fatigue) |
| Set gravity | Change gravity (e.g., low-gravity zones, underwater) |
| Simulate control | Programmatically trigger left, right, or jump input |
| Set vector X/Y | Directly set the player's horizontal/vertical velocity |
| Fall through | Drop through a Jump-thru platform |
| Set enabled | Toggle the behavior on/off (e.g., during cutscenes) |

### Double Jump Pattern

Construct 3 does not have a built-in double jump, but it takes only a few events to implement:

```
Event: On jump pressed (custom key check)
  Condition: Variable "jumps_remaining" > 0
  Action: Platform → Set vector Y to -600
  Action: Subtract 1 from "jumps_remaining"

Event: Platform → On landed
  Action: Set "jumps_remaining" to 2
```

The key insight is using `Set vector Y` rather than `Simulate jump`, which only works when on a floor. Setting the Y vector directly allows mid-air jumps.

### Wall Jump Pattern

```
Event: On jump pressed
  Condition: Platform → Is by wall (direction: right)
  Condition: Platform → Is falling
  Action: Platform → Set vector X to -300
  Action: Platform → Set vector Y to -500

Event: On jump pressed
  Condition: Platform → Is by wall (direction: left)
  Condition: Platform → Is falling
  Action: Platform → Set vector X to 300
  Action: Platform → Set vector Y to -500
```

### Coyote Time

Give the player a few frames to jump after walking off a ledge:

```
Event: Platform → On fall
  Action: Start timer "coyote" for 0.1 seconds

Event: On jump pressed
  Condition: Timer "coyote" is running
  Action: Platform → Set vector Y to -(jump strength)
  Action: Stop timer "coyote"
```

---

## Physics Behavior

The Physics behavior simulates realistic rigid-body physics using the **Box2D** engine. Objects can collide, bounce, be pulled by gravity, and be connected with joints.

### Adding Physics

1. Select an object in the Layout editor.
2. Behaviors → **+** → choose **Physics**.
3. **Important:** Do NOT combine Physics with Solid or Platform on the same object. Physics objects handle their own collision resolution. Mixing them causes conflicts.

### Material Properties

| Property | Default | Range | Description |
|----------|---------|-------|-------------|
| Density | 1.0 | 0+ | Mass per unit area. Higher = heavier. 0 = static (immovable). |
| Friction | 0.5 | 0–1 | Resistance when sliding against other physics objects |
| Restitution | 0.2 | 0–1 | Bounciness. 0 = no bounce, 1 = perfectly elastic |
| Linear damping | 0 | 0+ | Air resistance slowing linear movement |
| Angular damping | 0 | 0+ | Resistance to rotation |

### Collision Shapes

Each physics object needs a collision shape. Construct 3 supports:

- **Bounding box** — rectangle around the sprite (fastest)
- **Convex hull** — automatic shape fitted to the sprite's collision polygon
- **Circle** — for round objects (most efficient for rolling)

Set the shape in the Physics behavior properties. For complex objects, prefer simpler shapes — Box2D performs best with convex polygons.

### Forces and Impulses

| Action | Description |
|--------|-------------|
| Apply force | Continuous push (good for engines, wind). Applied each tick. |
| Apply force at angle | Force in a specific direction |
| Apply impulse | Instant velocity change (good for jumps, explosions, hits) |
| Apply impulse at angle | Directional instant force |
| Set velocity | Directly set linear velocity (X, Y) |
| Apply torque | Continuous rotational force |
| Set angular velocity | Direct rotation speed |

**Force vs. impulse:** Forces are gradual and should be applied every tick. Impulses are one-shot velocity changes — call once per event.

### Joints

Joints connect two physics bodies. Add them via actions in the event sheet:

| Joint Type | Description | Use Case |
|------------|-------------|----------|
| Revolute | Pivot point — bodies rotate freely around anchor | Doors, wheels, flails |
| Distance | Fixed distance between two points | Chains, springs, bridges |
| Prismatic | Constrains movement to one axis | Pistons, elevators |
| Weld | Rigidly locks two bodies together | Compound objects |

**Creating a revolute joint:**
```
Action: Physics → Create revolute joint
  Object A: Wheel
  Object B: Car
  Anchor X: Wheel.X
  Anchor Y: Wheel.Y
```

### Physics World Settings

Configure global physics settings via actions at the start of the layout:

| Setting | Default | Description |
|---------|---------|-------------|
| World gravity | (0, 10) | Direction and strength of gravity |
| Stepping mode | Fixed | Fixed = deterministic, Variable = smoother but less predictable |
| Stepping iterations | 8 vel / 3 pos | Higher = more accurate but slower |

### Collision Filtering

Control which physics objects collide with which. Without filtering, every physics object collides with every other physics object.

**Approach 1 — Disable collisions between specific pairs:**
```
Action: Physics → Set collision filtering
  Enable collisions: No
  Other object: BackgroundDebris
```

**Approach 2 — Use collision layers and masks** (available via scripting API):
- Each object has a **category** (which layer it's on) and a **mask** (which layers it collides with).
- Objects collide only if each object's category is in the other's mask.

---

## Combining Platform and Physics

You cannot apply both Platform and Physics behaviors to the same object. Instead, use one of these patterns:

### Pattern 1: Physics Environment with Platform Player

The player uses the Platform behavior. Environmental objects (crates, barrels, boulders) use Physics. When the player pushes a crate, use events to apply force to the physics object:

```
Event: Player → Is overlapping Crate
  Condition: Player → Is moving (direction: right)
  Action: Crate (Physics) → Apply impulse at angle 0° magnitude 5
```

### Pattern 2: Physics-Only Platformer

Give the player the Physics behavior and simulate platforming with forces:

```
Event: Every tick
  Condition: Left arrow is down
  Action: Player (Physics) → Apply force at angle 180° magnitude 500

Event: On Space pressed
  Condition: Player → Is touching GroundSensor
  Action: Player (Physics) → Apply impulse at angle 270° magnitude 300
```

Use a small invisible sensor object at the player's feet (with Physics, density 0) to detect ground contact.

### Pattern 3: Hybrid with Pin

Create a physics body and pin the platform-controlled player sprite to it for visual purposes, while physics interactions happen on the pinned body.

---

## Performance Tips

- **Limit active physics objects** — Box2D scales linearly. Keep active bodies under ~100 for smooth 60fps on mobile.
- **Use simple collision shapes** — Circles and rectangles are fastest. Avoid high-polygon convex hulls.
- **Set static objects to density 0** — Static bodies (density = 0) are far cheaper than dynamic ones.
- **Disable physics when off-screen** — Use "Is on-screen" conditions to disable/enable physics for distant objects.
- **Stepping mode** — Fixed stepping is more deterministic and better for gameplay. Variable stepping is smoother visually but can lead to inconsistent behavior.

---

## Common Pitfalls

| Problem | Cause | Solution |
|---------|-------|----------|
| Player falls through floor | Missing Solid behavior on ground tiles | Add Solid to all ground objects |
| Physics objects jitter or explode | Objects overlapping at creation | Ensure physics bodies don't spawn inside each other |
| Mixing Solid and Physics | Applying Solid + Physics to same object | Use only one system per object |
| Variable jump height not working | Jump sustain set to 0 | Set jump sustain to 0.1–0.3 seconds |
| Physics objects never stop moving | Damping set to 0 | Increase linear/angular damping |
| Joints break or behave oddly | Joint anchors placed incorrectly | Set anchor points to the exact connection spot between bodies |

---

## Next Steps

- **[G1 Event Sheet Patterns](G1_event_sheet_patterns.md)** — Event logic for platformer controls
- **[R1 Behaviors and Effects](../reference/R1_behaviors_and_effects.md)** — Full behavior reference including Bullet, Car, and Turret
- **[G2 Families and Performance](G2_families_and_performance.md)** — Optimize large numbers of physics objects with families
