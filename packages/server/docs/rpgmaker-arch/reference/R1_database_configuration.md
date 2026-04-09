# R1 — Database Configuration Reference

> **Category:** reference · **Engine:** RPG Maker · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Plugin Development](../guides/G1_plugin_development.md)

---

## Overview

The RPG Maker MZ/MV Database is the centralized editor for all game entities. Each database tab produces a JSON file in the `data/` directory that the runtime loads at startup. This reference covers every tab, its key fields, and how the data connects at runtime.

---

## Database Tabs

### Actors (`Actors.json`)

Defines the playable characters in the party.

| Field | Purpose |
|-------|---------|
| **Name / Nickname** | Display name and optional shortened name |
| **Class** | Starting class (references `Classes.json` by ID) |
| **Initial Level / Max Level** | Level range (1–99) |
| **Profile** | Text shown in the Status screen |
| **Face / Character / Battler** | Graphic assets for menus, maps, and battles |
| **Initial Equipment** | Weapon + armor slots filled at game start |
| **Traits** | Inherited traits (see Traits section below) |
| **Note** | Free-text field parsed by plugins via notetags |

**Runtime access:**
```javascript
$gameActors.actor(1).name();           // Actor #1's current name
$gameActors.actor(1).currentClass();   // Class object
$dataActors[1];                        // Raw database record
```

### Classes (`Classes.json`)

Defines stat progression, learnable skills, and trait sets for each class/job.

| Field | Purpose |
|-------|---------|
| **Name** | Class display name |
| **EXP Curve** | Base value and extra/acceleration params for leveling speed |
| **Params (curves)** | Per-level values for MHP, MMP, ATK, DEF, MAT, MDF, AGI, LUK |
| **Skills to Learn** | Array of `{level, skillId}` — skills gained on level-up |
| **Traits** | Class-wide trait modifiers (element rates, equip types, etc.) |

**Design note:** Actors inherit their class's param curves and traits. An actor's effective traits are the union of actor traits + class traits + equipment traits + state traits.

### Skills (`Skills.json`)

| Field | Purpose |
|-------|---------|
| **Name / Icon / Description** | Display info |
| **Skill Type** | Groups skills into categories (Magic, Special, etc.) |
| **MP Cost / TP Cost** | Resource costs |
| **Scope** | Target selection: 1 Enemy, All Enemies, 1 Ally, All Allies, Self, etc. |
| **Occasion** | When usable: Always, Battle Only, Menu Only, Never |
| **Speed / Repeat / TP Gain** | Battle timing and multi-hit configuration |
| **Hit Type** | Certain Hit, Physical Attack, or Magical Attack |
| **Animation** | Battle animation played on use |
| **Damage** | Type (HP/MP Damage/Recovery/Drain) + formula string |
| **Effects** | Applied effects on success (see Effects section below) |

### Items (`Items.json`)

Same structure as Skills, plus:

| Field | Purpose |
|-------|---------|
| **Item Type** | Regular item or Key Item (key items can't be discarded) |
| **Consumable** | Whether the item is consumed on use |
| **Price** | Shop buy/sell price |

### Weapons (`Weapons.json`) and Armors (`Armors.json`)

| Field | Purpose |
|-------|---------|
| **Weapon/Armor Type** | Categorization (Sword, Axe, Shield, Helmet, etc.) |
| **Params** | Flat stat bonuses: ATK, DEF, MAT, MDF, AGI, LUK |
| **Traits** | Equipment traits (element attack, state attach, etc.) |
| **Price** | Shop price |
| **Animation** (weapons only) | Attack animation |

### Enemies (`Enemies.json`)

| Field | Purpose |
|-------|---------|
| **Params** | Base stats (MHP, MMP, ATK, DEF, MAT, MDF, AGI, LUK) |
| **EXP / Gold** | Rewards on defeat |
| **Drop Items** | Up to 3 items with individual drop rates (1/N denominator) |
| **Action Patterns** | Array of `{skillId, conditionType, conditionParam, rating}` |
| **Traits** | Enemy-specific traits (element rates, state rates, etc.) |

**Action pattern rating:** Higher rating = more likely to be selected. The engine uses a weighted random selection among valid actions whose conditions are met.

### Troops (`Troops.json`)

Defines fixed groups of enemies encountered in battle.

| Field | Purpose |
|-------|---------|
| **Members** | Array of `{enemyId, x, y}` positioning enemies on the battlefield |
| **Battle Events** | Event pages with conditions (Turn N, Enemy HP ≤ X%, Switch ON) that run during the battle. Used for boss dialogue, reinforcements, and scripted phases. |

### States (`States.json`)

| Field | Purpose |
|-------|---------|
| **Restriction** | None / Attack an Enemy / Attack Anyone / Attack an Ally / Cannot Move |
| **Priority** | Display priority when multiple states are active |
| **Removal Timing** | Remove at: Action End, Turn End, after N turns, by damage, on walking N steps |
| **Auto-removal** | Turn count range for automatic removal |
| **Traits** | Modifiers active while the state is applied |
| **Note** | Notetag field for plugin extensions |

### Animations (`Animations.json`)

MZ uses **Effekseer** for particle-based 3D animations (`.efkefc` files). MV uses sprite sheets. Both store timing, sound effects, and flash data.

### Tilesets (`Tilesets.json`)

| Field | Purpose |
|-------|---------|
| **Mode** | World (A1-A5) or Area (detailed) tileset mode |
| **Tileset Images** | References to A1-A5, B-E image files |
| **Passability** | Per-tile passability flags: ○ (passable), × (blocked), ☆ (above characters), directional |
| **Terrain Tags** | Numeric tags (0–7) for plugin-defined terrain effects |
| **Bush / Counter / Damage** | Per-tile special flags |

### Common Events (`CommonEvents.json`)

| Field | Purpose |
|-------|---------|
| **Trigger** | None (call only), Autorun (runs once when switch ON), Parallel (loops while switch ON) |
| **Switch** | Condition switch for Autorun/Parallel triggers |
| **Event Commands** | Same command list as map events |

### System (`System.json`)

Global configuration: game title, starting party, starting map/position, window skin, title screen graphics, menu access, save access, currency name, sound effects for system actions, elements list, skill types list, weapon types list, armor types list, and equipment type slots.

---

## The Traits System

Traits are the unified modifier system. They appear on Actors, Classes, Weapons, Armors, Enemies, and States. All traits from all sources stack at runtime.

### Trait Categories

| Category | Examples |
|----------|----------|
| **Element Rate** | Fire ×150% (weakness), Ice ×0% (immune) |
| **Debuff Rate** | ATK Debuff ×50% (resistant to ATK down) |
| **State Rate** | Poison ×0% (immune to poison) |
| **State Resist** | Immune to specific states |
| **Parameter** | MHP ×120% (multiplicative modifier to max HP) |
| **Ex-Parameter** | HIT rate, EVA rate, CRI rate, etc. (additive) |
| **Sp-Parameter** | TGR (target rate), GRD (guard effect), REC (recovery rate), etc. (multiplicative) |
| **Attack Element** | Normal Attack deals Fire damage |
| **Attack State** | Normal Attack has 20% chance to apply Poison |
| **Attack Speed/Times** | Modify action speed or add extra attacks |
| **Equip Weapon/Armor** | Allow equipping specific weapon/armor types |
| **Equip Seal** | Prevent equipping specific types |
| **Slot Type** | Dual Wield (two weapon slots) |
| **Action Times+** | Probability of an extra action per turn |
| **Special Flag** | Auto Battle, Guard, Substitute, Preserve TP |
| **Party Ability** | Encounter Half, Gold Double, Drop Item Double, etc. |

### How Traits Stack

```javascript
// Engine calculates effective traits by collecting from all sources:
Game_BattlerBase.prototype.traitObjects = function() {
    return [];  // Overridden by Game_Actor and Game_Enemy
};

// Game_Actor collects from: actor + class + equipment[] + states[]
Game_Actor.prototype.traitObjects = function() {
    return [this.actor(), this.currentClass()]
        .concat(this.equips().filter(item => item))
        .concat(this.states());
};
```

**Stacking rules:**
- **Rates** (Element Rate, State Rate, Sp-Params) — multiply together: 150% × 80% = 120%
- **Additive** (Ex-Params like HIT, EVA, CRI) — sum together: base 0% + 10% + 5% = 15%
- **Flags** (Special Flag, Party Ability) — OR: any source having it = active

---

## The Damage Formula

Skills and items use a **formula string** evaluated as JavaScript at runtime:

```javascript
// Simple physical attack
a.atk * 4 - b.def * 2

// Magic with variance
a.mat * 3 + 100

// Healing (negative value = recovery)
a.mat * 2 + 50

// Conditional formula
a.level > 20 ? a.atk * 6 - b.def * 2 : a.atk * 4 - b.def * 2

// Using variables
a.atk * $gameVariables.value(10)
```

**Available in formulas:**
- `a` — the attacker (Game_Battler instance)
- `b` — the target (Game_Battler instance)
- `v` — shortcut for `$gameVariables._data` (e.g., `v[10]` = variable #10)

**Common stats on `a` and `b`:**
`atk`, `def`, `mat`, `mdf`, `agi`, `luk`, `mhp`, `mmp`, `hp`, `mp`, `tp`, `level`

**Variance:** The Variance field (default 20) applies ±N% random fluctuation to the final result.

---

## Effects System

Skills and items can apply **effects** on success, independent of the damage formula:

| Effect | What It Does |
|--------|-------------|
| **Recover HP/MP** | Fixed + percentage recovery |
| **Gain TP** | Add TP to the target |
| **Add/Remove State** | Apply or cure a state with a hit rate |
| **Add/Remove Buff** | Apply a temporary stat buff/debuff (stacks up to 2) |
| **Special Effect: Escape** | Allows fleeing from battle |
| **Grow** | Permanently increase a param |
| **Learn Skill** | Teach a skill to the target |
| **Common Event** | Run a common event after the action resolves |

---

## The Note Field and Notetags

Every database entry has a **Note** field — a free-text area that plugins parse for metadata tags. This is RPG Maker's primary extension point for plugin configuration.

### Convention

```
<CustomTag: value>
<CustomTag>
multi-line content
</CustomTag>
```

### Parsing from Plugins

```javascript
// Read an actor's note field
const note = $dataActors[1].note;

// Simple regex extraction
const match = note.match(/<CustomTag:\s*(\d+)>/);
if (match) {
    const value = Number(match[1]);
}

// Multi-line extraction
const multiMatch = note.match(/<CustomTag>([\s\S]*?)<\/CustomTag>/);
if (multiMatch) {
    const content = multiMatch[1].trim();
}
```

**Design principle:** Notetags keep plugin configuration co-located with the entity it applies to, rather than requiring a separate configuration file. Popular plugin suites (VisuStella, Yanfly) use notetags extensively.

---

## Max Values and Limits

| Resource | MZ Limit | MV Limit |
|----------|----------|----------|
| Actors, Classes, Items, Weapons, Armors, Enemies, Troops, States, Skills | 9,999 each | 2,000 each |
| Common Events | 9,999 | 2,000 |
| Variables | 9,999 | 5,000 |
| Switches | 9,999 | 5,000 |
| Maps | 999 | 999 |
| Max Level | 99 (configurable per actor) | 99 |
| Party Size (battle) | 4 (default, expandable by plugins) | 4 |
| Enemy Troops | Up to 8 enemies per troop | Up to 8 |
