# G2 — Families and Performance Optimization in Construct 3

> **Category:** guide · **Engine:** Construct · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Event Sheet Patterns](G1_event_sheet_patterns.md) · [R1 Behaviors and Effects](../reference/R1_behaviors_and_effects.md)

---

## Families: Polymorphism Without Code

Families are Construct's answer to object-oriented inheritance. A Family is a named group of object types that share **instance variables**, **behaviors**, and **event sheet logic**. Any event that references a Family applies to all its members — no duplication needed.

> Families are available on paid Construct plans only.

### When to Use Families

| Scenario | Without Families | With Families |
|----------|-----------------|---------------|
| All enemies take damage | One event per enemy type | One event on `Enemies` family |
| Collectibles get picked up | Duplicate pickup logic | One event on `Collectibles` family |
| Projectiles move and collide | Per-projectile events | One event on `Projectiles` family |
| UI buttons respond to hover | Per-button hover events | One event on `UIButtons` family |

### Creating and Using a Family

1. In the Project Bar, right-click **Object types** → **Add family**.
2. Name it descriptively (`Enemies`, `Projectiles`, `Collectibles`).
3. Drag object types into the family, or right-click the family → **Add object type**.
4. Add instance variables and behaviors to the family — they propagate to all members.

### Family Instance Variables

Variables added to a Family are shared by all member object types. Each instance still has its own copy of the variable (it's not static/shared data):

```
Family "Enemies":
  Instance variables:
    hp (Number, default: 100)
    damage (Number, default: 10)
    is_stunned (Boolean, default: false)

Members: Goblin, Skeleton, Dragon
→ Every Goblin, Skeleton, and Dragon instance has its own hp, damage, is_stunned
```

### Family Behaviors

Behaviors added to a Family are automatically applied to every member. This is powerful for consistent physics or movement:

```
Family "Enemies":
  Behaviors: Solid, Pathfinding, Flash

→ All enemies are solid, can pathfind, and can flash when hit
→ You configure behavior properties per-family, not per-type
```

### SOL and Families: How Picking Works

The SOL (Selected Object List) works with families, but there are subtleties:

**Rule 1: Picking a family picks from ALL member types.**

```
Event: Enemies → hp ≤ 0
  → Enemies: Destroy
```

This picks all Goblins, Skeletons, and Dragons with `hp ≤ 0` and destroys them. One event handles all enemy types.

**Rule 2: Picking a specific type narrows within the family.**

```
Event: Enemies → hp ≤ 0
  Sub-event: Goblin → is overlapping GoblinCamp
    → Goblin: Spawn GoblinReinforcement
```

The sub-event inherits the family's SOL (enemies at 0 hp) but further narrows to only Goblins overlapping the camp.

**Rule 3: An object can belong to multiple families.**

```
Dragon belongs to: Enemies, FlyingUnits, BossTargets
→ Events on any of these families will include Dragon
```

### Common Family Patterns

**Universal damage system:**

```
Event: Projectiles → On collision with Enemies
  → Enemies: Subtract Projectiles.damage from hp
  → Projectiles: Destroy
  → Enemies: Flash (0.1s, white)
```

**Family-based spawning:**

```
Event: System → Every 3 seconds
  → System: Create Enemies.Pick("random") on Layer "Game" at (random(LayoutWidth), 0)
```

Note: You cannot directly create a "random member" of a family in Construct. Instead, use `Choose(obj_Goblin, obj_Skeleton, obj_Dragon)` or maintain a spawn table.

---

## Performance Optimization

Construct 3 renders via WebGL (or WebGPU in newer builds) and runs game logic in JavaScript. Most performance problems come from too many active objects, excessive event evaluation, or rendering bottlenecks.

### The Performance Hierarchy

Fix problems in this order — each level has 10× more impact than the next:

1. **Architecture** — Reduce total object count
2. **Event evaluation** — Reduce conditions checked per frame
3. **Rendering** — Reduce draw calls and overdraw
4. **Micro-optimization** — Tighten individual expressions

### Architecture: Object Count Management

**Destroy off-screen objects.** Objects outside the viewport still run their events and physics behaviors:

```
Event: System → Every 1 second
  Sub-event: Bullet → is outside layout
    → Bullet: Destroy
```

**Use object pooling instead of Create/Destroy.** Creating and destroying instances frequently causes garbage collection spikes. Instead:

```
// Pooling pattern for bullets
Event: On start of layout
  → System: Repeat 50 times
    → Create Bullet at (0, 0) on Layer "Offscreen"
    → Bullet: Set active to false
    → Bullet: Set visible to false

Event: Player → fires weapon
  → Bullet: Pick instance with active = false
    → Bullet: Set position to Player.X, Player.Y
    → Bullet: Set active to true
    → Bullet: Set visible to true

Event: Bullet → is outside viewport (and active = true)
  → Bullet: Set active to false
  → Bullet: Set visible to false
  → Bullet: Set position to (0, 0)
```

**Disable behaviors on inactive objects.** Physics, Pathfinding, and Solid behaviors still compute when off-screen:

```
Event: Enemy → is outside viewport
  → Enemy: Set Pathfinding enabled to false
  → Enemy: Set Solid enabled to false

Event: Enemy → is inside viewport
  → Enemy: Set Pathfinding enabled to true
  → Enemy: Set Solid enabled to true
```

### Event Evaluation: Reduce Work Per Tick

**Use "Every X seconds" instead of "Every tick" when possible.** AI decisions, spawn checks, and cleanup don't need 60 FPS evaluation:

```
// Bad: runs 60 times per second
Event: Every tick
  → Check if enemy should change target

// Good: runs twice per second — AI doesn't need frame-perfect updates
Event: Every 0.5 seconds
  → Check if enemy should change target
```

**Use triggers instead of polling.** `On collision` fires only when collision begins, while `Is overlapping` checks every frame:

```
// Prefer this (fires once):
Event: Player → On collision with Coin

// Over this (checks every frame):
Event: Player → Is overlapping Coin
```

**Guard expensive sub-events with cheap conditions.** Put the cheapest condition first:

```
// Good: Boolean check first (fast), then distance (moderate)
Event: Enemy → active = true
  Sub-event: Enemy → Distance to Player < 300
    → Enemy: Start pathfinding to Player

// Bad: Distance check on ALL enemies, including inactive ones
Event: Enemy → Distance to Player < 300
  Sub-event: Enemy → active = true
    → (same action)
```

### Rendering: Draw Call Reduction

**Minimize layers.** Each layer can generate draw calls. Combine objects onto fewer layers where possible.

**Use sprite sheets, not individual images.** Construct batches sprites from the same image file into a single draw call. Put related sprites on the same sprite sheet.

**Avoid excessive blend modes and effects.** Each effect can break the render batch, causing additional draw calls. Apply effects to containers or layers rather than individual instances.

**Reduce opacity and alpha changes.** Transparent objects require additional blending passes. Prefer fully opaque sprites where possible.

### Monitoring Performance

**The built-in profiler** shows frame time breakdown. Enable it in preview:

```
Browser preview → Open debugger → Performance tab
```

Key metrics to watch:

| Metric | Healthy | Warning | Problem |
|--------|---------|---------|---------|
| **Frame time** | < 10ms | 10–16ms | > 16ms (below 60 FPS) |
| **Object count** | < 500 | 500–2000 | > 2000 |
| **Draw calls** | < 50 | 50–100 | > 100 |
| **Event time** | < 4ms | 4–8ms | > 8ms |

### Mobile-Specific Optimization

Mobile devices are significantly weaker than desktops. Apply these extra rules:

1. **Target 30 FPS on mobile.** Set the framerate to 30 and design around it — smoother than a stuttering 60 FPS.
2. **Halve your object counts.** What runs fine on desktop can choke mobile GPUs.
3. **Avoid WebGL effects.** Distortion, blur, and glow effects are expensive on mobile GPUs.
4. **Use lower-resolution sprites.** Scale down by 50% and let the GPU upscale — the screen is smaller anyway.
5. **Test on real devices early.** The Chrome DevTools mobile simulator does not reflect real GPU performance.

---

## Families + Performance: Combined Patterns

Families and performance optimization work together. Use families to centralize expensive logic:

```
// One event handles ALL enemy AI instead of per-type events
Event: System → Every 0.5 seconds
  Sub-event: Enemies → is inside viewport
    Sub-event: Enemies → active = true
      → Enemies: Find path to Player
```

This pattern guards the expensive pathfinding call behind two cheap filters (viewport check + boolean), and uses a family so you write it once for all enemy types.
