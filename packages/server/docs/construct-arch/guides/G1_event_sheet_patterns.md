# G1 — Event Sheet Patterns and Organization in Construct 3

> **Category:** guide · **Engine:** Construct · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G2 Behaviors](G2_behaviors.md)

---

## The SOL: Why Construct Logic Works the Way It Does

The **Selected Object List (SOL)** is the single most important concept in Construct's event system. Every condition you add to an event *picks* (filters) which instances the actions apply to. If you don't understand SOL, your events will behave unpredictably.

### SOL Rules

1. **SOL resets at the start of each top-level event.** Every top-level event begins with all instances of every object type in the SOL.
2. **Conditions narrow the SOL.** Each condition filters out instances that don't match. Multiple conditions on the same event AND together.
3. **Sub-events inherit their parent's SOL.** A sub-event starts with whatever its parent already picked — it doesn't reset.
4. **Actions apply only to picked instances.** If a condition picked 3 out of 20 enemies, the action only affects those 3.
5. **OR blocks pick the union.** An OR block picks any instance matching *at least one* of its conditions.

### SOL Example: Targeting the Right Enemy

```
Event: Enemy.Health ≤ 0
  → Enemy: Spawn ExplosionEffect on Layer "Effects"
  → Enemy: Destroy
```

This only destroys enemies at 0 health. You don't need to loop — the SOL automatically handles per-instance filtering. This is the fundamental difference from code-based engines where you'd write a for loop.

### Common SOL Mistake: Picking Across Object Types

```
❌ WRONG — picks are independent per object type
Event: Enemy is overlapping Player
  Sub-event: Enemy.Type = "boss"
    → Player: Set Health to 0

✅ CORRECT — both picks apply; only boss-overlapping players are affected
(Same structure — this actually works! The sub-event narrows
 the Enemy SOL further, and the Player SOL was already narrowed
 by the overlap condition in the parent.)
```

The mistake people *actually* make is assuming a condition on one object type filters another. `Enemy.Health ≤ 0` does NOT affect the Player SOL. Only overlap/collision conditions link two object types together.

---

## Organizing Event Sheets at Scale

Small prototypes can live in a single event sheet. Anything beyond 200 events needs structure.

### Pattern: Domain-Based Sheet Separation

Create a folder structure mirroring your game's systems:

```
Event Sheets/
├── Main               ← Layout event sheet (includes everything)
├── Core/
│   ├── Input          ← Keyboard, mouse, gamepad abstraction
│   ├── Camera         ← Scrolling, zoom, screen shake
│   └── Audio          ← Music, SFX management
├── Player/
│   ├── PlayerMovement ← Walk, jump, dash, climb
│   ├── PlayerCombat   ← Attack, take damage, die
│   └── PlayerUI       ← Health bar, inventory HUD
├── Enemies/
│   ├── EnemyAI        ← Patrol, chase, flee behaviors
│   ├── EnemySpawner   ← Wave system, spawn points
│   └── EnemyDeath     ← Loot drops, score, effects
├── World/
│   ├── Doors          ← Room transitions
│   ├── Pickups        ← Coins, power-ups, keys
│   └── Hazards        ← Spikes, pits, projectiles
└── UI/
    ├── Menus          ← Title, pause, game over
    └── Dialog         ← NPC text, choice system
```

The `Main` sheet uses **Include** events to pull in each sub-sheet. This way, each sheet is self-contained and easy to navigate.

### Include Order Matters

Includes execute in the order they appear in the parent sheet, top to bottom. This means:

```
Main Event Sheet:
  Include → Core/Input        (reads input first)
  Include → Player/PlayerMovement (uses input to move)
  Include → Enemies/EnemyAI   (AI runs after player moves)
  Include → Player/PlayerCombat (combat after all movement)
  Include → UI/Menus          (UI last, reads game state)
```

If `PlayerMovement` runs before `Input`, the player reads stale input from the previous frame. Order your includes so data producers run before data consumers.

---

## Groups: Runtime Logic Switches

Groups are named containers of events that you can activate and deactivate at runtime. They're Construct's equivalent of feature flags.

### When to Use Groups

- **State machines**: Activate "PlayerGrounded" group, deactivate "PlayerAirborne" group.
- **Game phases**: "WaveActive" group only runs during combat waves.
- **Debug mode**: A "Debug" group that draws collision boxes, shows FPS, prints SOL counts.

```
Group "PlayerGrounded" (Active)
  Event: Keyboard Right is down → Player: Set X to Self.X + Speed * dt
  Event: Keyboard Space pressed → Player: Set VelocityY to -JumpForce
                                → Set Group "PlayerGrounded" Inactive
                                → Set Group "PlayerAirborne" Active

Group "PlayerAirborne" (Initially Inactive)
  Event: Every tick → Player: Set VelocityY to Self.VelocityY + Gravity * dt
  Event: Player is overlapping SolidGround
    → Player: Set VelocityY to 0
    → Set Group "PlayerAirborne" Inactive
    → Set Group "PlayerGrounded" Active
```

### Group Best Practices

1. **Name groups clearly.** `"EnemySpawning"` not `"Group1"`.
2. **Set initial active state in the Properties panel**, not in "On start of layout" events — it's easier to see at a glance.
3. **Don't over-nest groups.** Two levels deep is the practical limit before it becomes hard to track what's active.
4. **Combine with Families.** A group that handles all "Enemies" family logic can be toggled off during cutscenes.

---

## Functions: Reusable Logic Blocks

Construct Functions are called explicitly — they don't run unless invoked. They accept parameters and can return values.

### Defining a Function

```
Function "ApplyDamage" (TargetUID, Amount, DamageType)
├── System: Pick instance with UID TargetUID
├── Sub-event: DamageType = "fire" AND Target.FireResist > 0
│   └── Set local Amount to Amount * (1 - Target.FireResist)
├── Target: Subtract Amount from Health
├── Target: Flash white for 0.1 seconds
└── Sub-event: Target.Health ≤ 0
    └── Target: Call "Die"
Return: Amount  (actual damage dealt after resistance)
```

### Calling a Function

```
Event: Sword overlaps Enemy
  → local DamageDealt = Functions.ApplyDamage(Enemy.UID, Player.Attack, "physical")
  → Create FloatingText at Enemy position, text = string(DamageDealt)
```

### Function Best Practices

1. **Use UID parameters to target specific instances.** Pass `Object.UID` and pick by UID inside the function. This respects the SOL system.
2. **Keep functions pure when possible.** A function that returns a calculated value without side effects is easier to debug.
3. **Name with verb-noun convention.** `ApplyDamage`, `SpawnWave`, `CalculateScore` — not `Damage`, `Wave`, `Score`.
4. **Put functions in dedicated event sheets.** A `Functions/Combat` sheet keeps all combat functions together and can be included anywhere.

---

## For-Each and System Loops

### For Each (Ordered)

Iterates over every instance of an object type, one at a time. The SOL contains exactly one instance per iteration:

```
For Each Enemy (ordered by Enemy.Health, ascending)
  → Enemy: Set ZOrder to loopindex
```

Use ordered loops when you need to rank, sort, or process instances in a specific sequence.

### Repeat and While

```
Repeat 5 times
  → Create Bullet at Player.X, Player.Y
  → Bullet: Set angle to loopindex * 72  (360/5 = 72° spacing)
```

**Warning:** `While` loops can freeze the game if the exit condition is never met. Always ensure the condition will eventually become false.

---

## Performance Patterns

### Avoid Per-Tick Collision When Possible

```
❌ SLOW — checks every enemy against every bullet every frame
Event: Every tick
  Sub-event: Bullet is overlapping Enemy → ...

✅ FAST — overlap trigger fires only on first overlap
Event: Bullet on collision with Enemy → ...
```

Collision triggers are optimized internally (spatial hashing). Manual overlap checks in a per-tick event bypass this optimization.

### Use Instance Variables Over Global Lookups

```
❌ SLOW — searches all instances every frame
Event: Every tick
  → System: Pick Enemy where Enemy.ID = Player.TargetID
  → Player: Set angle toward Enemy

✅ FAST — store a reference, pick by UID
On target acquired:
  → Player: Set TargetUID to Enemy.UID

Every tick:
  → System: Pick Enemy by UID = Player.TargetUID
  → Player: Set angle toward Enemy
```

### Disable Off-Screen Logic

```
Event: Enemy is outside layout margin 200
  → Enemy: Set enabled to false (or deactivate the group)
  → Enemy: Set behaviors enabled to false

Event: Enemy is inside layout margin 400
  → Enemy: Set enabled to true
```

---

## Common Mistakes

1. **Forgetting SOL resets at top-level events.** If you pick an enemy in one event and expect it to stay picked in the next top-level event — it won't. Use sub-events or pass UIDs.
2. **Including the same sheet twice.** Construct warns about this but doesn't prevent it. Every include is a full copy — double-including doubles your logic execution.
3. **Putting too much logic in "Every tick."** Use triggers (On collision, On value changed, On animation finished) when possible. They fire once when the condition becomes true, instead of every frame.
4. **Not using Families for shared logic.** Writing separate events for Goblin, Skeleton, and Dragon when they share health/damage behavior. Create an "Enemies" family.
5. **Massive monolithic event sheets.** If a sheet has more than 150 events, split it. Use includes to compose smaller sheets into the layout's main sheet.
