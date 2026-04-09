# G2 — Custom Functions & Extensions

> **Category:** guide · **Engine:** GDevelop · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Events and Behaviors](G1_events_and_behaviors.md) · [R1 Extensions & Custom Behaviors](../reference/R1_extensions_and_custom_behaviors.md)

---

## Why Custom Functions?

As your GDevelop project grows, you'll notice repeated event patterns — damage calculations, spawn routines, UI transitions. **Functions** let you extract these into reusable custom actions, conditions, and expressions that appear in the event sheet just like built-in features.

Functions are organized into **extensions**. An extension is a self-contained package of functions, behaviors, and custom objects that can be shared across projects or published to the GDevelop community.

---

## Creating a Function

### Step-by-Step

1. Open the **Project Manager** (left sidebar)
2. Under **Functions/Behaviors**, click **Create or search for new extensions**
3. Name your extension (e.g., `CombatUtils`)
4. Inside the extension, click **Add a new function**
5. Choose the function type:
   - **Action** — does something (e.g., "Apply damage to enemy")
   - **Condition** — returns true/false (e.g., "Is player in range?")
   - **Expression** — returns a value (e.g., "Calculate DPS")
6. Define **parameters** (the inputs your function needs)
7. Build the function's logic using events — the same visual event system you already know

### Function Types at a Glance

| Type | Use Case | How It Appears in Events |
|------|----------|--------------------------|
| **Action** | Perform an operation (spawn, damage, animate) | Right side of event sheet |
| **Condition** | Check a state (is alive, is in range, has item) | Left side of event sheet |
| **Expression** | Compute a value (DPS, distance, formatted string) | Inside any expression field |

---

## Parameters

Parameters are the inputs to your function. GDevelop supports several parameter types:

| Parameter Type | Description | Example |
|----------------|-------------|---------|
| **Number** | Numeric value | `DamageAmount`, `SpawnCount` |
| **String** | Text value | `EnemyType`, `DialogueLine` |
| **Boolean** | True/false toggle | `IsCriticalHit`, `PlaySound` |
| **Object** | A game object instance | `TargetEnemy`, `SpawnedBullet` |
| **Behavior** | A behavior attached to an object | `PlatformerBehavior` |
| **Object group** | A group of objects | `AllEnemies` |

### Using Parameters in Expressions

Parameter values can be used directly in expression fields by writing their name. For example, if you have a parameter called `BaseDamage`:

```
BaseDamage * 2 + Variable(BonusDamage)
```

Number, string, and boolean parameters can also be compared using conditions within the function's events.

---

## Example: A Custom "Apply Damage" Action

### Setting Up the Function

1. **Name:** `ApplyDamage`
2. **Type:** Action
3. **Description:** "Reduce target's health by the specified amount, clamped to zero"
4. **Parameters:**
   - `Target` (Object — any object with a `Health` variable)
   - `Amount` (Number — damage to apply)
   - `ShowFloatingText` (Boolean — whether to show a damage number)

### Function Events

```
┌─ Conditions                          │ Actions                                      ┐
│ (none — always execute)              │ Change variable Health of Target:             │
│                                      │   Subtract Amount                             │
├──────────────────────────────────────┼──────────────────────────────────────────────┤
│ Sub-event:                           │                                              │
│ Variable Health of Target < 0        │ Change variable Health of Target: Set to 0   │
├──────────────────────────────────────┼──────────────────────────────────────────────┤
│ Sub-event:                           │                                              │
│ ShowFloatingText is true             │ Create object FloatingText at Target.X(),    │
│                                      │   Target.Y() - 32                            │
│                                      │ Change text of FloatingText:                 │
│                                      │   ToString(Amount)                           │
└──────────────────────────────────────┴──────────────────────────────────────────────┘
```

### Using It in Your Game

Once defined, `ApplyDamage` appears under your extension name in the action picker. Use it like any built-in action:

```
┌─ Conditions                          │ Actions                                      ┐
│ Bullet collides with Enemy           │ CombatUtils::ApplyDamage(Enemy, 25, true)    │
│                                      │ Delete Bullet                                │
└──────────────────────────────────────┴──────────────────────────────────────────────┘
```

---

## Example: A Custom Condition

### "Is In Range" Condition

1. **Name:** `IsInRange`
2. **Type:** Condition
3. **Description:** "Check if two objects are within a given pixel distance"
4. **Parameters:**
   - `ObjectA` (Object)
   - `ObjectB` (Object)
   - `MaxDistance` (Number)

### Function Events

```
┌─ Conditions                                              │ Actions            ┐
│ Distance between ObjectA and ObjectB ≤ MaxDistance        │ (none needed)      │
└──────────────────────────────────────────────────────────┴────────────────────┘
```

GDevelop automatically uses the last condition's result as the function's return value. If the distance condition is true, the custom condition returns true.

---

## Example: A Custom Expression

### "Calculate DPS" Expression

1. **Name:** `CalculateDPS`
2. **Type:** Expression (returns a number)
3. **Parameters:**
   - `BaseDamage` (Number)
   - `AttackSpeed` (Number — attacks per second)
   - `CritChance` (Number — 0 to 1)
   - `CritMultiplier` (Number)

### Function Events

The expression's return value is set using the special **"Set return value"** action:

```
┌─ Conditions       │ Actions                                                         ┐
│ (none)            │ Set return value to:                                             │
│                   │   BaseDamage * AttackSpeed * (1 + CritChance * (CritMultiplier - 1)) │
└───────────────────┴─────────────────────────────────────────────────────────────────┘
```

Use in any expression field: `CombatUtils::CalculateDPS(50, 1.5, 0.2, 2.0)`

---

## Extracting Events into Functions

Already have working events you want to reuse? GDevelop can extract them:

1. Select the events you want to extract
2. Right-click → **Extract events to a function**
3. GDevelop automatically detects which objects, behaviors, and variables are used and creates parameters for them
4. The original events are replaced with a call to the new function

This is the fastest way to refactor a growing event sheet into clean, reusable pieces.

---

## Building Extensions

Extensions group related functions together. A well-structured extension might look like:

```
CombatSystem (Extension)
├── Actions
│   ├── ApplyDamage
│   ├── ApplyHealing
│   └── SpawnDamageNumber
├── Conditions
│   ├── IsInRange
│   ├── IsAlive
│   └── HasStatusEffect
├── Expressions
│   ├── CalculateDPS
│   └── GetEffectiveArmor
└── Behaviors
    └── Damageable (custom behavior with Health variable)
```

### Sharing Extensions

- **Copy/paste** — export your extension and import it into another project
- **Community submission** — submit your extension to the GDevelop Extensions repository for review; approved extensions appear in the in-engine extension browser for all users
- **Extension requirements** — community extensions should include descriptions, parameter documentation, and example usage

---

## JavaScript in Functions

For logic that's hard to express visually, GDevelop functions can include **JavaScript Code events**:

```
┌─ Conditions       │ Actions                                                  ┐
│ (none)            │ JavaScript Code:                                          │
│                   │   const damage = eventsFunctionContext                     │
│                   │     .getArgument("BaseDamage");                           │
│                   │   const result = Math.round(damage * (1 + Math.random())); │
│                   │   eventsFunctionContext.returnValue = result;              │
└───────────────────┴──────────────────────────────────────────────────────────┘
```

> **When to use JS:** Complex math, string manipulation, procedural generation, or accessing browser APIs. Stick to visual events when the logic is straightforward — they're easier for collaborators to read and modify.

---

## Common Pitfalls

1. **Forgetting to add object parameters** — if your function references a game object, it must be a parameter. Functions can't "see" objects from the main event sheet unless passed in.
2. **Overusing expressions for side effects** — expressions should compute and return values, not modify game state. Use actions for changes.
3. **Not documenting parameters** — always fill in the description field for each parameter. These descriptions appear in the event sheet when others use your function.
4. **Giant monolithic extensions** — split unrelated functions into separate extensions (e.g., `Combat`, `Inventory`, `UI`) for clarity and reusability.
5. **Ignoring the "Extract to function" tool** — if you find yourself copying events between event sheets, it's time to extract a function.
