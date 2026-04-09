# R2 — Battle System Customization in RPG Maker MZ

> **Category:** reference · **Engine:** RPG Maker · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Plugin Development](../guides/G1_plugin_development.md) · [G2 Event System Mastery](../guides/G2_event_system_mastery.md)

---

## Battle System Architecture

RPG Maker MZ's turn-based battle system is built from four layers of JavaScript classes. Understanding this hierarchy is essential for any battle customization — whether through plugins or database configuration.

### The Four Layers

```
┌─────────────────────────────────────────────┐
│  Scene Layer (rmmz_scenes.js)               │
│  Scene_Battle — orchestrates the battle flow │
│    ├── creates/manages all windows           │
│    ├── handles phase transitions             │
│    └── connects UI to game objects           │
├─────────────────────────────────────────────┤
│  Window Layer (rmmz_windows.js)             │
│  Window_BattleLog    — action narration      │
│  Window_BattleStatus — party HP/MP display   │
│  Window_PartyCommand — Fight/Escape          │
│  Window_ActorCommand — Attack/Skill/Guard/Item│
│  Window_BattleEnemy  — target selection      │
├─────────────────────────────────────────────┤
│  Sprite Layer (rmmz_sprites.js)             │
│  Spriteset_Battle    — battlefield rendering │
│  Sprite_Battler      — base battler display  │
│  Sprite_Actor        — party member sprites  │
│  Sprite_Enemy        — enemy sprites         │
│  Sprite_Damage       — floating damage text  │
├─────────────────────────────────────────────┤
│  Object Layer (rmmz_objects.js)             │
│  Game_BattlerBase    — stats, traits, params │
│  Game_Battler        — actions, states, buffs│
│  Game_Actor          — party member specifics │
│  Game_Enemy          — enemy specifics        │
│  Game_Action         — skill/item execution   │
│  Game_Troop          — enemy group management │
│  BattleManager       — global battle state    │
└─────────────────────────────────────────────┘
```

---

## Key Classes in Detail

### BattleManager (Static)

The global coordinator. Controls battle flow, turn order, and phase transitions.

```javascript
// Key properties (accessed as BattleManager.propertyName)
BattleManager._phase          // "init", "start", "turn", "action", "turnEnd", "aborting", "battleEnd"
BattleManager._actionBattlers // Array of battlers with pending actions this turn
BattleManager._subject        // The battler currently performing an action
BattleManager._action         // The current Game_Action being executed
BattleManager._targets        // Array of targets for the current action

// Key methods
BattleManager.startBattle()        // Transition from map to battle
BattleManager.updateTurnEnd()      // Process end-of-turn effects
BattleManager.makeActionOrders()   // Determine turn order by AGI
BattleManager.startAction()        // Begin executing an action
BattleManager.endAction()          // Finish an action, process results
BattleManager.processVictory()     // Handle battle win
BattleManager.processDefeat()      // Handle party wipe
```

**Plugin pattern — custom turn order:**

```javascript
// Save reference to the original method
const _BattleManager_makeActionOrders = BattleManager.makeActionOrders;

BattleManager.makeActionOrders = function() {
    // Call the original to build the default order
    _BattleManager_makeActionOrders.call(this);

    // Custom: sort by a custom "initiative" stat instead of AGI
    this._actionBattlers.sort((a, b) => {
        const initA = a.param(6) + a.attackSpeed(); // param(6) = AGI
        const initB = b.param(6) + b.attackSpeed();
        return initB - initA; // Descending
    });
};
```

### Game_BattlerBase — The Stat Foundation

Base class for all battlers. Manages parameters, traits, and equipment effects.

```javascript
// The 8 base parameters (accessed by index)
// 0: MHP (Max HP)    4: MAT (Magic Attack)
// 1: MMP (Max MP)    5: MDF (Magic Defense)
// 2: ATK (Attack)    6: AGI (Agility)
// 3: DEF (Defense)   7: LUK (Luck)

Game_BattlerBase.prototype.param(paramId)      // Final param value after buffs/equipment
Game_BattlerBase.prototype.paramBase(paramId)   // Base value from class curve
Game_BattlerBase.prototype.paramPlus(paramId)   // Additive bonus from equipment
Game_BattlerBase.prototype.paramRate(paramId)   // Multiplicative rate from traits
Game_BattlerBase.prototype.paramBuffRate(paramId) // Buff/debuff multiplier

// Final formula: (paramBase + paramPlus) * paramRate * paramBuffRate
```

### Game_Action — Skill and Item Execution

The heart of the damage system. When a battler uses a skill or item, a `Game_Action` is created.

```javascript
// Key methods
Game_Action.prototype.apply(target)         // Apply this action to a target
Game_Action.prototype.makeDamageValue(target, critical) // Calculate damage
Game_Action.prototype.evalDamageFormula(target)         // Evaluate the formula string
Game_Action.prototype.executeDamage(target, value)       // Apply HP change
Game_Action.prototype.itemEffectRecoverHp(target, effect)  // Healing effects
Game_Action.prototype.itemEffectAddState(target, effect)   // State application
```

---

## Damage Formula System

Every Skill and Item in the database has a **Damage Formula** — a JavaScript expression evaluated at runtime.

### Formula Variables

| Variable | Meaning | Example |
|----------|---------|---------|
| `a` | The attacker (Game_Battler) | `a.atk` = attacker's ATK |
| `b` | The target (Game_Battler) | `b.def` = target's DEF |
| `v` | Game Variables array | `v[1]` = Variable #1 |

### Common Formula Patterns

```javascript
// Basic physical damage
a.atk * 4 - b.def * 2

// Magic damage
a.mat * 3 - b.mdf * 1.5

// Percentage-based HP damage
b.mhp * 0.1

// Healing (negative damage = healing)
a.mat * 2 + 50

// Scaling with attacker level (actors only)
a.atk * (2 + a.level * 0.1) - b.def * 2

// Conditional damage
a.isStateAffected(6) ? a.atk * 6 : a.atk * 4

// Random range
a.atk * (3 + Math.random() * 2) - b.def * 2
```

### Important: Don't Put Game Mechanics in Damage Formulas

The damage formula is evaluated both during battle **and** when the AI evaluates which skill to use. Side effects in the formula (applying states, changing variables, spawning events) will execute during AI evaluation, causing bugs:

```javascript
// BAD — this applies the state during AI evaluation too!
(b.addState(6), a.atk * 4 - b.def * 2)

// GOOD — use the Skill's Effects list to apply states
// Formula: a.atk * 4 - b.def * 2
// Effects tab: Add State → Poison (60% chance)
```

---

## Customizing via Plugins: The Alias Pattern

The standard way to modify battle behavior in RPG Maker MZ plugins is the **alias pattern** — saving a reference to the original method, then defining a new method that calls it.

### Basic Alias

```javascript
// Save the original
const _Game_Action_executeDamage = Game_Action.prototype.executeDamage;

// Override with extended behavior
Game_Action.prototype.executeDamage = function(target, value) {
    // Pre-processing: log damage for analytics
    console.log(`${this.subject().name()} deals ${value} to ${target.name()}`);

    // Call the original method — always do this unless intentionally replacing
    _Game_Action_executeDamage.call(this, target, value);

    // Post-processing: store last damage dealt
    $gameVariables.setValue(10, Math.abs(value));
};
```

### Adding New Battle Commands

```javascript
// Add a "Steal" command to the actor command window
const _Window_ActorCommand_makeCommandList =
    Window_ActorCommand.prototype.makeCommandList;

Window_ActorCommand.prototype.makeCommandList = function() {
    _Window_ActorCommand_makeCommandList.call(this);

    // Insert before "Item" (index 3)
    // name, symbol, enabled, ext
    this._list.splice(3, 0, {
        name: "Steal",
        symbol: "steal",
        enabled: true,
        ext: null
    });
};

// Handle the command in Scene_Battle
const _Scene_Battle_createActorCommandWindow =
    Scene_Battle.prototype.createActorCommandWindow;

Scene_Battle.prototype.createActorCommandWindow = function() {
    _Scene_Battle_createActorCommandWindow.call(this);
    this._actorCommandWindow.setHandler("steal", this.commandSteal.bind(this));
};

Scene_Battle.prototype.commandSteal = function() {
    // Switch to enemy selection for the steal target
    this.selectEnemySelection();
};
```

### Custom Damage Types

```javascript
// Add an "HP Drain" calculation that heals the attacker
const _Game_Action_executeDamage2 = Game_Action.prototype.executeDamage;

Game_Action.prototype.executeDamage = function(target, value) {
    _Game_Action_executeDamage2.call(this, target, value);

    // Check if the skill has the "Drain" flag via notetag
    const item = this.item();
    if (item && item.meta && item.meta.Drain) {
        const drainAmount = Math.floor(Math.abs(value) * 0.5);
        this.subject().gainHp(drainAmount);
        // Show drain effect
        this.subject().startDamagePopup();
    }
};
```

### Notetag System for Data-Driven Customization

Notetags let designers configure plugin behavior per-skill, per-enemy, or per-state through the database Note field:

```javascript
// In the Skill's Note field in the editor:
// <Drain>
// <ElementBoost: Fire, 1.5>
// <IgnoreDefense: 50%>

// Reading notetags in your plugin
function parseNotetag(item, tag) {
    if (!item || !item.note) return null;
    const regex = new RegExp(`<${tag}:\\s*(.+?)>`, 'i');
    const match = item.note.match(regex);
    return match ? match[1].trim() : null;
}

// Usage
const drainRate = parseNotetag(skill, "DrainRate"); // "50%"
const element = parseNotetag(skill, "ElementBoost"); // "Fire, 1.5"
```

---

## Battle System Variants

RPG Maker MZ's default is a standard turn-based system, but the architecture supports deep modifications:

### Common Modifications

| System | What Changes | Key Classes to Modify |
|--------|-------------|----------------------|
| **Active Time Battle (ATB)** | Speed gauge fills in real-time | BattleManager, Scene_Battle (add gauge update loop) |
| **Charge Turn Battle (CTB)** | Speed determines turn frequency | BattleManager.makeActionOrders |
| **Side-View vs Front-View** | Actor sprite positioning | Sprite_Actor, Spriteset_Battle |
| **Action Sequence** | Animated attack choreography | Window_BattleLog, Sprite_Battler |
| **Tactical/Grid** | Grid-based positioning | Scene_Battle (add grid layer), Game_Action (range checks) |

### Popular Plugin Ecosystems

The RPG Maker MZ plugin community is large and well-organized:

**VisuStella MZ** — The most comprehensive plugin suite. Their Battle Core is a Tier 1 plugin that most other battle plugins depend on. It provides action sequences, custom damage popups, battle UI customization, and compatibility hooks.

**VisuStella Tier System:**

| Tier | Purpose | Examples |
|------|---------|---------|
| 0 | Core engine patches | Core Engine |
| 1 | Major system overhauls | Battle Core, Items & Equips Core |
| 2 | Extensions to Tier 1 | Battle System ATB, Battle System CTB |
| 3 | Standalone features | Steal Items, Aggro Control |
| 4 | Visual/UI polish | Damage Popups, Visual State Effects |

**Plugin compatibility rule:** Load in tier order. Tier 0 first, then Tier 1, then higher tiers. Plugins within the same tier can usually be in any order.

---

## Debugging Battle Plugins

### Console Access During Battle

Press F8 (or F12 in some browsers) during a test battle to open the developer console.

```javascript
// Useful debug commands during battle:
BattleManager._phase                    // Current battle phase
BattleManager._subject                  // Who is acting
$gameParty.members()[0].hp              // First party member's HP
$gameTroop.members()[0].hp              // First enemy's HP
$gameTroop.members()[0].enemy().name    // First enemy's name

// Force a state onto an enemy for testing
$gameTroop.members()[0].addState(4);    // Apply state ID 4

// Check a damage formula manually
const a = $gameParty.members()[0];
const b = $gameTroop.members()[0];
eval("a.atk * 4 - b.def * 2");         // Test formula
```

### Common Plugin Conflicts

1. **Multiple plugins modifying the same method without aliasing** — One overwrites the other. Always use the alias pattern.
2. **Load order issues** — If Plugin B aliases a method that Plugin A also modifies, Plugin B must load after Plugin A to see A's changes.
3. **Notetag parsing conflicts** — Two plugins using the same notetag name. Prefix your notetags with your plugin name: `<MyPlugin_Drain>`.
4. **State callback timing** — `onBattleStart`, `onTurnEnd`, and `onActionEnd` fire at specific points. Misunderstanding when they fire causes subtle bugs.
