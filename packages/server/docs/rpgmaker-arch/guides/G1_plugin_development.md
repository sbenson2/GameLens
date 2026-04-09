# G1 — Plugin Development for RPG Maker MZ

> **Category:** guide · **Engine:** RPG Maker · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [R1 Core Class Reference](../reference/R1_core_classes.md)

---

## How the Plugin System Works

RPG Maker MZ games are JavaScript applications. The engine's entire runtime — scenes, windows, sprites, data management, battle system — is written in JS and loaded from the `js/` folder. Plugins are additional JS files that **modify or extend** this runtime by overriding methods, adding new classes, or hooking into the engine's update cycle.

Plugins are loaded via `js/plugins.js`, which maps each plugin file to its on/off state and parameters. The Plugin Manager in the editor lets users configure these without touching code.

### Plugin Load Order

```
index.html
  └── loads js/main.js
        └── loads js/rmmz_core.js     (PIXI wrappers, Bitmap, Graphics, Input)
        └── loads js/rmmz_managers.js  (DataManager, AudioManager, PluginManager, etc.)
        └── loads js/rmmz_objects.js   (Game_Actor, Game_Map, Game_Party, etc.)
        └── loads js/rmmz_scenes.js    (Scene_Title, Scene_Map, Scene_Battle, etc.)
        └── loads js/rmmz_sprites.js   (Sprite_Character, Sprite_Battler, etc.)
        └── loads js/rmmz_windows.js   (Window_Base, Window_Message, etc.)
        └── loads js/plugins.js        (your plugins, in order listed)
```

**Plugins load after all core scripts.** This means every core class is available when your plugin runs. Plugin load order matters — if Plugin B depends on Plugin A's changes, Plugin A must be listed first.

---

## Minimal Plugin Template

```javascript
/*:
 * @target MZ
 * @plugindesc Adds a simple dash ability to the player.
 * @author YourName
 * @url https://example.com/my-plugins
 *
 * @param DashSpeed
 * @text Dash Speed Multiplier
 * @type number
 * @min 1
 * @max 10
 * @default 2
 * @desc How much faster the player moves while dashing.
 *
 * @command StartDash
 * @text Start Dash
 * @desc Triggers the dash effect from an event.
 *
 * @arg Duration
 * @text Duration (frames)
 * @type number
 * @default 30
 * @desc How many frames the dash lasts.
 *
 * @help
 * ============================================================================
 * Player Dash Plugin v1.0
 * ============================================================================
 * Adds a dash ability triggered by holding Shift or via plugin command.
 *
 * Plugin Commands:
 *   StartDash — Triggers dash for the specified duration.
 *
 * Terms of Use:
 *   Free for commercial and non-commercial use. Credit appreciated.
 * ============================================================================
 */

(() => {
    "use strict";

    const PLUGIN_NAME = "PlayerDash";

    // ========================================================================
    // Parse Parameters
    // ========================================================================
    const params = PluginManager.parameters(PLUGIN_NAME);
    const dashSpeedMultiplier = Number(params["DashSpeed"]) || 2;

    // ========================================================================
    // Register Plugin Commands
    // ========================================================================
    PluginManager.registerCommand(PLUGIN_NAME, "StartDash", function (args) {
        // `this` is the Game_Interpreter instance
        const duration = Number(args.Duration) || 30;
        $gamePlayer._dashFrames = duration;
    });

    // ========================================================================
    // Override: Game_CharacterBase.realMoveSpeed
    // ========================================================================
    const _Game_CharacterBase_realMoveSpeed =
        Game_CharacterBase.prototype.realMoveSpeed;

    Game_CharacterBase.prototype.realMoveSpeed = function () {
        const base = _Game_CharacterBase_realMoveSpeed.call(this);
        if (this === $gamePlayer && this._dashFrames > 0) {
            return base + dashSpeedMultiplier;
        }
        return base;
    };

    // ========================================================================
    // Override: Game_Player.update
    // ========================================================================
    const _Game_Player_update = Game_Player.prototype.update;

    Game_Player.prototype.update = function (sceneActive) {
        _Game_Player_update.call(this, sceneActive);
        if (this._dashFrames > 0) {
            this._dashFrames--;
        }
    };

    // ========================================================================
    // Override: Game_Player.initMembers (initialize custom fields)
    // ========================================================================
    const _Game_Player_initMembers = Game_Player.prototype.initMembers;

    Game_Player.prototype.initMembers = function () {
        _Game_Player_initMembers.call(this);
        this._dashFrames = 0;
    };
})();
```

### What This Template Demonstrates

1. **Comment block metadata** (`/*: ... */`) — parsed by the editor to show parameters, commands, and help text.
2. **IIFE wrapper** — `(() => { ... })()` keeps all variables private. Never pollute the global scope.
3. **Alias pattern** — store the original method, then call it inside your override with `.call(this, ...)`. This is the single most important pattern in RPG Maker plugin development.
4. **PluginManager.registerCommand** — defines commands that event editors can use without writing JS.
5. **Parameter parsing** — `PluginManager.parameters()` returns strings; always cast to the correct type.

---

## The Alias Pattern (Method Overriding)

The alias pattern is how plugins safely extend engine methods without breaking other plugins:

```javascript
// Step 1: Store original method
const _Original_method = ClassName.prototype.methodName;

// Step 2: Replace with your version that calls the original
ClassName.prototype.methodName = function (...args) {
    _Original_method.call(this, ...args);   // run original logic first
    // your additional logic here
};
```

### Why Aliasing Matters

If two plugins both override `Game_Actor.prototype.paramBase`:

```javascript
// Plugin A (loaded first)
const _A_paramBase = Game_Actor.prototype.paramBase;
Game_Actor.prototype.paramBase = function (paramId) {
    return _A_paramBase.call(this, paramId) + this._bonusStats[paramId];
};

// Plugin B (loaded second)
const _B_paramBase = Game_Actor.prototype.paramBase;
Game_Actor.prototype.paramBase = function (paramId) {
    return _B_paramBase.call(this, paramId) * this._statMultiplier;
};
```

The call chain becomes: **Plugin B → Plugin A → Original**. Both modifications apply. If Plugin B had directly reimplemented the method instead of aliasing, Plugin A's bonus stats would vanish.

**Rule: Always alias. Never replace a method outright.**

---

## Core Class Hierarchy

Understanding the class tree is essential for knowing *where* to hook your overrides.

### Scene Tree

```
Scene_Base
├── Scene_Boot          (asset loading, database initialization)
├── Scene_Title         (title screen, new game / continue)
├── Scene_Map           (main gameplay — movement, events, encounters)
│   └── creates: Spriteset_Map, Window_MapName, Window_Message
├── Scene_Battle        (turn-based combat)
│   └── creates: Spriteset_Battle, Window_BattleStatus, Window_BattleLog
├── Scene_Menu          (main menu hub)
├── Scene_Item          (item usage screen)
├── Scene_Skill         (skill selection)
├── Scene_Equip         (equipment management)
├── Scene_Status        (actor detail view)
├── Scene_Shop          (buy/sell)
├── Scene_Save / Scene_Load
└── Scene_GameOver
```

### Window Tree

```
Window_Base (extends Window from PIXI — all windows inherit this)
├── Window_Scrollable   (adds scroll handling)
│   ├── Window_Selectable (adds cursor, selection, input handling)
│   │   ├── Window_Command     (vertical/horizontal command list)
│   │   │   ├── Window_TitleCommand
│   │   │   ├── Window_MenuCommand
│   │   │   ├── Window_Options
│   │   │   └── Window_PartyCommand
│   │   ├── Window_ItemList
│   │   ├── Window_SkillList
│   │   ├── Window_EquipSlot
│   │   └── Window_ShopBuy
│   └── Window_BattleLog
├── Window_Help         (description display)
├── Window_Gold         (currency display)
└── Window_Message      (dialog / text display)
```

### Game Object Tree

```
Game_Temp         (transient per-session data)
Game_System       (system settings — BGM, menu access, encounters)
Game_Timer        (countdown timer)
Game_Switches     (boolean game switches, indexed by ID)
Game_Variables    (numeric game variables, indexed by ID)
Game_SelfSwitches (per-event boolean switches)
Game_Map          (current map data, events, tileset)
Game_Party        (player's party — actors, items, gold)
Game_Actors       (all actors by ID)
Game_Actor        (individual actor — stats, equipment, skills)
  extends Game_Battler
    extends Game_BattlerBase
```

---

## Plugin Command Parameters

MZ's plugin command system supports rich parameter types in the comment block:

```javascript
/*:
 * @command SpawnEnemy
 * @text Spawn Enemy
 *
 * @arg EnemyId
 * @text Enemy
 * @type enemy
 * @desc Select an enemy from the database.
 *
 * @arg Position
 * @text Spawn Position
 * @type select
 * @option Left
 * @value left
 * @option Center
 * @value center
 * @option Right
 * @value right
 * @default center
 *
 * @arg Count
 * @text Number to Spawn
 * @type number
 * @min 1
 * @max 8
 * @default 1
 *
 * @arg ShowAnimation
 * @text Show Spawn Animation?
 * @type boolean
 * @default true
 */
```

### Available Parameter Types

| Type | Editor Widget | Example Values |
|------|--------------|----------------|
| `string` | Text input | Any text |
| `number` | Number spinner | `0`, `100`, `-5` |
| `boolean` | On/Off toggle | `true`, `false` |
| `select` | Dropdown | Options you define |
| `combo` | Editable dropdown | User can type custom values |
| `file` | File picker | Path relative to project |
| `actor` | Actor dropdown | Database actor ID |
| `class` | Class dropdown | Database class ID |
| `skill` | Skill dropdown | Database skill ID |
| `item` | Item dropdown | Database item ID |
| `weapon` | Weapon dropdown | Database weapon ID |
| `armor` | Armor dropdown | Database armor ID |
| `enemy` | Enemy dropdown | Database enemy ID |
| `state` | State dropdown | Database state ID |
| `animation` | Animation picker | Database animation ID |
| `switch` | Switch picker | Game switch ID |
| `variable` | Variable picker | Game variable ID |
| `common_event` | Common Event picker | Common event ID |

**All parameter values arrive as strings.** Always parse: `Number(args.Count)`, `args.ShowAnimation === "true"`.

---

## Rendering Layer: PIXI.js Integration

RPG Maker MZ uses **PIXI.js v5** as its rendering backend. The core classes in `rmmz_core.js` wrap PIXI:

```
PIXI.Application         → Graphics (manages the renderer)
PIXI.Sprite              → Sprite (base for all game sprites)
PIXI.Container           → base of Spriteset_Map, Spriteset_Battle
PIXI.Tilemap             → Tilemap (optimized tile rendering)
PIXI.Filter              → ColorFilter (screen tints, flashes)
PIXI.utils.TextureCache  → ImageManager (loads and caches textures)
```

### Adding Custom Visual Effects

You can apply PIXI filters to any sprite or container:

```javascript
// Add a blur filter to the battle background during a skill animation
const _Spriteset_Battle_createBattleback =
    Spriteset_Battle.prototype.createBattleback;

Spriteset_Battle.prototype.createBattleback = function () {
    _Spriteset_Battle_createBattleback.call(this);
    this._blurFilter = new PIXI.filters.BlurFilter(0);
    this._back1Sprite.filters = [this._blurFilter];
};
```

**Caution:** Adding PIXI filters directly can cause performance issues on mobile. Always provide a way to disable effects via plugin parameters.

---

## Common Mistakes

1. **Not wrapping in an IIFE.** Variables leak into global scope, causing conflicts with other plugins.
2. **Replacing methods instead of aliasing.** Breaks compatibility with every other plugin that touches the same method.
3. **Forgetting to call the original.** Your alias stores the original but never calls it — the base functionality vanishes.
4. **Hardcoding database IDs.** Use plugin parameters so users can configure which items, actors, or switches your plugin uses.
5. **Modifying `$dataActors` or other `$data*` arrays directly.** These are loaded from JSON and shared — changes persist across saves unexpectedly. Modify `$gameActors` (runtime objects) instead.
6. **Not handling save/load.** Custom properties on `Game_*` objects are automatically serialized if they're enumerable properties set in `initMembers`. Properties on `Scene_*` or `Sprite_*` objects are NOT saved — they're recreated each time.
