# Damage Formulas & Custom Skills

> **Category:** guide · **Engine:** RPG Maker · **Related:** [R2_battle_system_customization](../reference/R2_battle_system_customization.md), [G1_plugin_development](G1_plugin_development.md), [E1_architecture_overview](../architecture/E1_architecture_overview.md)

RPG Maker MZ's damage formula box is a JavaScript expression evaluated at runtime. It looks like a single text field, but it supports full JS — variables, conditionals, semicolons for multi-statement expressions, and access to the entire Game_Battler API. This guide covers the formula system from basic arithmetic through advanced patterns, and explains how plugins extend it with notetags.

---

## The Formula Box Basics

Every Skill and Item in the database has a **Damage → Formula** field. The engine evaluates this as JavaScript and uses the returned number as raw damage (before variance and critical modifiers).

### Available Variables

| Variable | What It References |
|----------|--------------------|
| `a` | The **user** (attacker) — a `Game_Battler` instance |
| `b` | The **target** (defender) — a `Game_Battler` instance |
| `v` | Game Variables array — `v[1]` is Variable #1 from the editor |
| `item` | The current skill/item data object (`$dataSkills[id]`) |

### Battler Properties (accessible via `a.` or `b.`)

| Property | Meaning | Property | Meaning |
|----------|---------|----------|---------|
| `atk` | Attack | `mdf` | Magic Defense |
| `def` | Defense | `agi` | Agility |
| `mat` | Magic Attack | `luk` | Luck |
| `hp` | Current HP | `mhp` | Max HP |
| `mp` | Current MP | `mmp` | Max MP |
| `tp` | Current TP | `level` | Actor level |

---

## Formula Tiers: Simple to Advanced

### Tier 1: Basic Arithmetic

The classic starting formula:

```
a.atk * 4 - b.def * 2
```

This subtracts a fraction of the target's defense from the attacker's damage. When `b.def` is high enough, damage approaches zero (the engine floors it at 0 unless you allow negative healing).

**Flat damage (ignores stats):**
```
100
```

**Percent of target's max HP:**
```
b.mhp * 0.1
```

### Tier 2: Scaling and Capping

**Level-scaling attack:**
```
a.atk * 4 + a.level * 2 - b.def * 2
```

**Minimum damage floor:**
```
Math.max(a.atk * 4 - b.def * 2, 1)
```

**Damage cap:**
```
Math.min(a.atk * 4 - b.def * 2, 9999)
```

**Both floor and cap:**
```
Math.min(Math.max(a.atk * 4 - b.def * 2, 1), 9999)
```

### Tier 3: Conditional Formulas

The ternary operator `?` lets you branch based on state, equipment, or variables.

**Bonus damage if target is poisoned (State ID 4):**
```
b.isStateAffected(4) ? (a.atk * 6 - b.def * 2) : (a.atk * 4 - b.def * 2)
```

**Physical or magical based on which stat is higher:**
```
a.atk > a.mat ? (a.atk * 4 - b.def * 2) : (a.mat * 4 - b.mdf * 2)
```

**Variable-driven difficulty scaling:**
```
(a.atk * 4 - b.def * 2) * (1 + v[10] * 0.1)
```
Here, Game Variable 10 acts as a difficulty multiplier.

### Tier 4: Multi-Statement Formulas

Semicolons separate statements. The **last expression** is the return value.

```
var base = a.atk * 4 - b.def * 2; var crit_bonus = a.isStateAffected(7) ? 1.5 : 1.0; base * crit_bonus
```

This is valid because the formula box evaluates the whole string as a function body. You can use `var` for local variables freely.

**Random element:**
```
var base = a.atk * 4 - b.def * 2; var roll = Math.floor(Math.random() * 20) + 1; base + roll * 5
```

---

## Useful Game_Battler Methods

These methods are callable on `a` or `b` inside the formula:

| Method | Returns | Example Use |
|--------|---------|-------------|
| `isStateAffected(stateId)` | `boolean` | Check if poisoned, buffed, etc. |
| `isGuard()` | `boolean` | Is the battler defending this turn? |
| `isActor()` | `boolean` | Is this an Actor (not Enemy)? |
| `isEnemy()` | `boolean` | Is this an Enemy? |
| `hasArmor(armorId)` | `boolean` | Is specific armor equipped? |
| `hasWeapon(weaponId)` | `boolean` | Is specific weapon equipped? |
| `stateRate(stateId)` | `number` | Resistance multiplier for a state |
| `elementRate(elementId)` | `number` | Resistance to an element (1.0 = neutral) |
| `paramBuffRate(paramId)` | `number` | Current buff/debuff multiplier |

### Parameter IDs (for `paramBuffRate`)

| ID | Param | ID | Param |
|----|-------|----|-------|
| 0 | Max HP | 4 | Magic Attack |
| 1 | Max MP | 5 | Magic Defense |
| 2 | Attack | 6 | Agility |
| 3 | Defense | 7 | Luck |

**Example — bonus damage when target's DEF is debuffed:**
```
var def_mult = b.paramBuffRate(3); def_mult < 1.0 ? (a.atk * 6 - b.def * 2) : (a.atk * 4 - b.def * 2)
```

---

## Common Skill Archetypes

### Healing Skill

Set **Damage Type** to "HP Recover" in the editor. The formula returns the heal amount:
```
a.mat * 3 + 50
```

### Drain Skill

Set **Damage Type** to "HP Drain." The formula is the damage dealt — the engine automatically heals the user by that amount (modified by the Drain Rate in Special Effects):
```
a.mat * 4 - b.mdf * 2
```

### Fixed % HP Attack

Deals a percent of the target's current HP (boss-killer moves):
```
b.hp * 0.25
```

Or max HP (for a consistent hit):
```
b.mhp * 0.15
```

### Multi-Hit with Diminishing Returns

Use the **Repeat** field in the skill editor for multi-hit, not the formula. But if you need diminishing damage per hit tracked by a variable:
```
var hit = v[20]; v[20] = v[20] + 1; Math.max((a.atk * 4 - b.def * 2) * Math.pow(0.8, hit), 1)
```
Reset Variable 20 to 0 via a Common Event before the skill activates.

### Level Difference Scaling

```
var diff = a.level - b.level; (a.atk * 4 - b.def * 2) * Math.max(1 + diff * 0.05, 0.5)
```
Caps the penalty at 50% reduction when underleveled.

---

## Plugin Notetag Systems

Plugins extend the formula system by reading `<notetags>` from the database Note field of Skills, Items, Actors, Enemies, Equipment, and States. This is the standard extension mechanism because RPG Maker's editor cannot add custom fields.

### How Notetags Work

1. A developer adds `<power stats: atk, mat>` to a skill's Note field in the database.
2. At runtime, the plugin reads `$dataSkills[id].note`, parses the tag, and uses the values.
3. The formula box may reference plugin-injected methods or properties.

### VisuStella MZ (Successor to Yanfly MV)

The most widely used MZ plugin suite. Relevant damage plugins:

- **Battle Core** — Extends damage with pre/post-damage JS blocks, custom action sequences.
- **Elements & Status Core** — Adds multi-element support, element absorption, element reflection.
- **Skill Learn System** — Doesn't affect formulas directly, but skills gained through it use the same formula box.

### Tyruswoo Battle Mechanics

Uses `<power stats>` and `<resist stats>` notetags to standardize damage:

```
Skill Note:
<power stats: atk>
<resist stats: def>
<hit mod: 10>
<crit boost: 50>
```

The plugin replaces the formula box evaluation with its own calculation using these tags. The Standard Damage Function is used when `powerStat >= resistStat`, and a High Resist function kicks in otherwise.

### Writing Your Own Notetag Parser

A minimal plugin that reads a `<bonus: X>` notetag from skills:

```javascript
// Plugin: MyBonusDamage.js

(function() {
    // Parse notetags after database is loaded
    var _DataManager_isDatabaseLoaded = DataManager.isDatabaseLoaded;
    DataManager.isDatabaseLoaded = function() {
        if (!_DataManager_isDatabaseLoaded.call(this)) return false;
        this._parseMyBonusTags($dataSkills);
        return true;
    };

    DataManager._parseMyBonusTags = function(dataArray) {
        for (var i = 1; i < dataArray.length; i++) {
            var obj = dataArray[i];
            if (!obj) continue;
            obj._bonusDamage = 0;
            var match = obj.note.match(/<bonus:\s*(\d+)>/i);
            if (match) {
                obj._bonusDamage = Number(match[1]);
            }
        }
    };

    // Now usable in the formula box:
    // a.atk * 4 - b.def * 2 + item._bonusDamage
})();
```

After installing this plugin, the formula box can reference `item._bonusDamage` because `item` points to the `$dataSkills` entry.

---

## Yanfly's Advice: Don't Put Mechanics in Formulas

A widely respected guideline from the Yanfly plugin author: the formula box should calculate **damage numbers**, not trigger **game mechanics**. Avoid formulas that add states, change variables for non-damage purposes, or run complex game logic.

**Why:**
- Formulas run once per hit. Multi-hit skills execute the formula multiple times — side effects multiply.
- Formulas run even when damage is nullified or reflected. A state-adding formula fires on the wrong target during reflection.
- Debugging is harder. The formula box has no breakpoints, no stack traces, and poor error messages.

**Instead:** Use Common Events triggered by skills, or plugin action sequences, for mechanics. Keep the formula box for math.

---

## Debugging Formulas

### Console Logging

Open the developer console with F8 (playtest mode) and add logging to your formula:

```
var dmg = a.atk * 4 - b.def * 2; console.log("Damage calc:", dmg, "ATK:", a.atk, "DEF:", b.def); dmg
```

### Common Errors

| Symptom | Likely Cause |
|---------|-------------|
| Skill always does 0 damage | Formula returns NaN or negative; check property names |
| "undefined" in console | Typo in property name (e.g., `a.attack` instead of `a.atk`) |
| Damage wildly inconsistent | Using `Math.random()` without a floor/ceiling |
| Heal instead of damage | Formula returns negative; the engine interprets negative damage as healing for certain damage types |
| Error on battle start | Syntax error in formula — missing parenthesis or semicolon |

### Testing Approach

Create a test enemy with known stats (100 ATK, 50 DEF) and a test actor with known stats. Calculate expected damage by hand, then run the battle and compare. The Damage Variance percentage in the skill editor adds randomness — set it to 0% during testing.

---

## Quick Reference: Formula Patterns

| Pattern | Formula |
|---------|---------|
| Standard physical | `a.atk * 4 - b.def * 2` |
| Standard magical | `a.mat * 4 - b.mdf * 2` |
| Hybrid (higher stat wins) | `Math.max(a.atk, a.mat) * 4 - Math.min(b.def, b.mdf) * 2` |
| Fixed damage | `500` |
| % current HP | `b.hp * 0.25` |
| % max HP | `b.mhp * 0.10` |
| Level-scaled | `a.atk * 4 + a.level * 3 - b.def * 2` |
| Minimum 1 damage | `Math.max(a.atk * 4 - b.def * 2, 1)` |
| Capped at 9999 | `Math.min(a.atk * 4 - b.def * 2, 9999)` |
| Conditional on state | `b.isStateAffected(4) ? dmg * 1.5 : dmg` (with `var dmg = ...;` prefix) |
| Heal | `a.mat * 3 + 50` (set type to HP Recover) |
