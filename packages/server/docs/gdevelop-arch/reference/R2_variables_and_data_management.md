# R2 — Variables & Data Management Reference

> **Category:** reference · **Engine:** GDevelop · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Events and Behaviors](../guides/G1_events_and_behaviors.md) · [R1 Extensions](R1_extensions_and_custom_behaviors.md)

---

## Variable Scopes

GDevelop organizes variables into three scopes. Choosing the right scope is one of the most important architectural decisions in a GDevelop project.

| Scope | Lifetime | Shared Across Scenes | Typical Use |
|-------|----------|---------------------|-------------|
| **Object variable** | Lives and dies with the instance | No — belongs to one instance | Health, ammo, individual enemy state |
| **Scene variable** | Exists while the scene is running; resets on scene change | No — one scene only | Score within a level, spawn counters, UI state |
| **Global variable** | Exists for the entire game session | Yes — all scenes | Player inventory, settings, total score, save data |

### Scope Priority

When two variables share the same name at different scopes, GDevelop resolves them in this order:

1. **Object variable** (highest priority)
2. **Scene variable**
3. **Global variable** (lowest priority)

This means if an object has a variable called `Score` and the scene also has a variable called `Score`, any expression referencing `Score` on that object will read the object variable. To avoid confusion, use distinct names across scopes — prefix conventions like `g_` for globals or `s_` for scene variables work well.

---

## Primitive Variable Types

### Number

Stores numeric values (integers and decimals). Supports standard arithmetic: addition, subtraction, multiplication, division, modulo.

```
Set variable EnemySpeed to 150
Change variable EnemySpeed: add Variable(SpeedBoost)
```

Numbers are the default type. If you drag a variable into an expression field, GDevelop assumes Number unless told otherwise.

### Text (String)

Stores text values. Concatenation uses the `+` operator in expressions.

```
Set variable PlayerName to "Hero"
Set variable Greeting to "Hello, " + Variable(PlayerName) + "!"
```

Useful expressions:
- `StrLength(Variable(MyText))` — character count
- `SubStr(Variable(MyText), start, length)` — extract substring
- `StrFind(Variable(MyText), "search")` — find position (-1 if not found)
- `ToNumber(Variable(MyText))` — convert text to number
- `ToString(Variable(MyNumber))` — convert number to text

### Boolean

Stores `true` or `false`. Useful for flags and toggles.

```
Set variable IsInvincible to true
Toggle variable IsInvincible
Condition: Variable IsInvincible is true
```

Booleans simplify event sheets by replacing the common pattern of using `0`/`1` number variables as flags.

---

## Collection Types

### Structure Variables

A structure is a named collection of child variables. Each child has a unique key and can be any type — including another structure or array.

```
Structure: PlayerData
  ├── Name (Text): "Hero"
  ├── Level (Number): 5
  ├── Inventory (Array)
  │   ├── [0] (Text): "Sword"
  │   └── [1] (Text): "Shield"
  └── Stats (Structure)
      ├── HP (Number): 100
      └── Attack (Number): 25
```

Access children with dot notation in expressions:

```
Variable(PlayerData.Name)                → "Hero"
Variable(PlayerData.Stats.HP)            → 100
Variable(PlayerData.Inventory[0])        → "Sword"
```

Key actions for structures:
- **Add child variable** — adds a new named child
- **Remove child variable** — removes a child by name
- **Check if child exists** — condition to test before access (prevents errors)
- **Count children** — returns the number of children

### Array Variables

An array is an ordered, integer-indexed collection. Children are accessed by index (starting at 0).

```
Array: Highscores
  ├── [0] (Number): 9500
  ├── [1] (Number): 8200
  └── [2] (Number): 7100
```

Key actions for arrays:
- **Push value** — append to the end
- **Remove at index** — remove a specific element (shifts subsequent elements)
- **Child count** — returns the number of elements

**Rule:** Array children should all be the same type. GDevelop does not enforce this, but mixing types in an array leads to unpredictable behavior in expressions and iteration.

---

## Working with Variables in Events

### Iterating Over Collections

Use the **For each child variable** event to loop through structures and arrays:

```
For each child variable "item" in Variable(Inventory):
  → Condition: Variable(item) = "Potion"
    → Action: Change variable PotionCount: add 1
```

Inside the loop, the iterator variable (`item`) refers to the current child. For structures, you can also access the child's name with `ChildName(item)`.

### Dynamic Variable Access

Access variables by computed name using bracket syntax:

```
Variable(PlayerData[Variable(CurrentStat)])
```

This is powerful for data-driven designs — store stat names in variables and look them up dynamically.

### JSON Integration

GDevelop can convert between variables and JSON strings, which is essential for save/load systems and web API integration.

**Variable → JSON:**
```
Set variable SaveString to ToJSON(Variable(PlayerData))
```

**JSON → Variable:**
```
Set variable PlayerData from JSON: Variable(SaveString)
```

This round-trips cleanly for structures and arrays. Combine with the Storage actions (write/read from local storage) for a complete save system:

```
Save: Write Variable(SaveString) to key "save1" in storage "GameSaves"
Load: Read from key "save1" in storage "GameSaves" into Variable(LoadedString)
      Set variable PlayerData from JSON: Variable(LoadedString)
```

---

## Variable Declaration Best Practices

### Declare Variables in the Editor

Always declare variables in the **Variables** panel (scene, global, or object) rather than creating them on the fly in events. Declared variables:

- Show up in autocomplete
- Have explicit types (prevents accidental type mismatches)
- Are visible to other team members scanning the project
- Can have default values set in the editor

### Naming Conventions

GDevelop variables are case-sensitive. Consistent naming prevents bugs:

| Convention | Example | When to Use |
|-----------|---------|-------------|
| PascalCase | `PlayerHealth` | Object and scene variables |
| g_PascalCase | `g_MusicVolume` | Global variables (distinguishes scope) |
| UPPER_SNAKE | `MAX_ENEMIES` | Constants (values you set once and never change) |

### Avoiding Common Pitfalls

1. **Don't store object references in variables.** GDevelop has no pointer/reference type. To associate objects, use matching ID variables on both objects and pick by comparison.

2. **Don't use structures as classes.** If you find yourself duplicating the same structure on many objects, that logic belongs in a custom behavior (extension) instead.

3. **Initialize before reading.** Reading an undeclared variable returns `0` (number) or `""` (text) with no error — this silently hides bugs. Always declare with a sensible default.

4. **Watch array index bounds.** Accessing an index beyond the array's length returns a default value silently. Use `ChildCount` to guard loops and random access.

---

## Persistence & Storage

GDevelop provides built-in **Storage** actions for persisting data to the device's local storage (browser localStorage on web, filesystem on desktop/mobile).

| Action | Purpose |
|--------|---------|
| Write value | Save a single number or text to a named key |
| Read value | Load a value from a named key into a variable |
| Check if key exists | Condition to verify saved data before reading |
| Delete key | Remove a saved value |
| Clear storage | Wipe all keys in a named storage group |

For complex save data, serialize your game state structure to JSON first, then write the JSON string as a single key. This keeps your storage clean and your save/load logic in one place.
