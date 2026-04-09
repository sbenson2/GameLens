# E1 — RPG Maker MZ/MV Architecture Overview

> **Category:** explanation · **Engine:** RPG Maker · **Related:** [G1 Plugin Development](../guides/G1_plugin_development.md) · [G2 Event System Patterns](../guides/G2_event_system_patterns.md)

---

## Core Philosophy: Database, Events, and Plugins

RPG Maker is a specialized engine for creating 2D RPGs. Its architecture is built around three interconnected systems:

1. **Database** — a centralized editor for all game entities: actors, classes, skills, items, weapons, armor, enemies, troops, states, animations, tilesets, and common events. Every piece of game data lives here, exposed as JSON files that the runtime reads at startup.
2. **Event System** — per-map event triggers that drive story, puzzles, and NPC behavior without code. Events use a visual command list (Show Text, Conditional Branch, Control Variables, Transfer Player, etc.) that reads like a simple scripting language.
3. **Plugin System** — JavaScript files that hook into, extend, or override the engine's core classes. Plugins are how developers add custom battle systems, HUDs, menus, and mechanics beyond what the editor provides.

This architecture targets a specific audience: creators who want to make RPGs with minimal programming. The database and event system handle 80% of typical RPG needs; plugins handle the remaining 20% for those who know JavaScript.

---

## Project Structure

```
project/
├── data/                  # JSON database files
│   ├── Actors.json        # Party member definitions
│   ├── Classes.json       # Class/job progression tables
│   ├── Skills.json        # Skill definitions (cost, damage, effects)
│   ├── Items.json         # Consumables and key items
│   ├── Weapons.json       # Weapon stats and traits
│   ├── Armors.json        # Armor stats and traits
│   ├── Enemies.json       # Enemy stats, drops, actions
│   ├── Troops.json        # Enemy group formations for battles
│   ├── States.json        # Status effects (poison, stun, etc.)
│   ├── Animations.json    # Battle animation definitions
│   ├── Tilesets.json      # Tileset configuration (passability, etc.)
│   ├── MapInfos.json      # Map tree / hierarchy
│   ├── Map001.json ...    # Individual map data (tiles + events)
│   ├── CommonEvents.json  # Shared events callable from anywhere
│   └── System.json        # Global settings (title, party, starting map)
├── js/
│   ├── libs/              # Third-party libraries
│   │   └── pixi.js        # PIXI.js rendering library (v5 in MZ)
│   ├── rmmz_core.js       # Core classes (Bitmap, Graphics, Input, etc.)
│   ├── rmmz_managers.js   # Manager singletons (DataManager, SceneManager, etc.)
│   ├── rmmz_objects.js    # Game state objects (Game_Map, Game_Actor, etc.)
│   ├── rmmz_scenes.js     # Scene classes (Scene_Title, Scene_Map, Scene_Battle)
│   ├── rmmz_sprites.js    # Sprite/visual classes (Sprite_Character, Spriteset_Map)
│   ├── rmmz_windows.js    # Window/UI classes (Window_Message, Window_MenuStatus)
│   └── plugins.js         # Plugin loader configuration
├── plugins/               # User-installed plugin JS files
├── img/                   # Image assets (characters, tilesets, pictures, etc.)
├── audio/                 # BGM, BGS, ME, SE audio files
└── index.html             # Entry point (loads NW.js or runs in browser)
```

**MV vs MZ file differences:** MV uses `rpg_*.js` filenames (e.g., `rpg_core.js`, `rpg_managers.js`). MZ uses `rmmz_*.js`. The class structure is similar but MZ adds features like `PluginManager.registerCommand()`, `effekseer` particle effects, and updated PIXI.js.

---

## Core Class Hierarchy

RPG Maker's runtime is organized into five layers, each with a distinct responsibility:

### 1. Manager Classes (Singletons)

Managers coordinate global state and system-level operations. They are static — never instantiated.

| Manager | Responsibility |
|---------|---------------|
| **DataManager** | Loads all JSON database files at startup, handles save/load game state |
| **SceneManager** | Manages the scene stack (push, pop, goto), runs the main game loop |
| **BattleManager** | Controls battle flow: turn order, action execution, victory/defeat |
| **AudioManager** | Plays BGM, BGS, ME, SE with volume and pitch control |
| **ImageManager** | Loads and caches Bitmap objects from `img/` folders |
| **PluginManager** | Reads `plugins.js`, loads plugin files, registers plugin commands |
| **ConfigManager** | Stores player options (volume, always-dash, etc.) |
| **StorageManager** | Handles save file serialization (JSON ↔ compressed string ↔ file/localStorage) |
| **TextManager** | Provides localized strings for menus, messages, and system text |
| **ColorManager** | Returns system colors for text and gauges |

### 2. Scene Classes (Game Screens)

Each screen in the game is a Scene. SceneManager maintains a stack and only the top scene is active:

```
SceneManager._scene stack:
└── Scene_Boot → Scene_Title → Scene_Map ↔ Scene_Battle
                              ├── Scene_Menu
                              │   ├── Scene_Item
                              │   ├── Scene_Skill
                              │   ├── Scene_Equip
                              │   └── Scene_Status
                              ├── Scene_Shop
                              └── Scene_GameOver
```

Every Scene extends `Scene_Base`, which extends `Stage` (PIXI.Container). Scenes manage:
- **create()** — builds windows and sprites
- **start()** — called after transitions finish
- **update()** — per-frame logic
- **terminate()** — cleanup when leaving

### 3. Game Objects (State Layer)

`Game_*` classes hold all mutable game state. They are serialized into save files.

| Class | State It Holds |
|-------|---------------|
| **Game_System** | Play time, save count, battle/menu access flags |
| **Game_Map** | Current map data, parallax, tileset, scroll position |
| **Game_Player** | Party leader's position, movement, encounter steps |
| **Game_Event** | Per-map event state (page conditions, self-switches, routes) |
| **Game_Interpreter** | Executes event command lists (the "virtual machine" for events) |
| **Game_Party** | Party members, inventory, gold, steps |
| **Game_Actor** | Individual actor stats, equipment, skills, states |
| **Game_Enemy** | Enemy instance in battle (stats, actions, drops) |
| **Game_Action** | A single battle action (skill/item, target, damage calc) |
| **Game_Variables** | Numbered variables (`$gameVariables.value(n)`) |
| **Game_Switches** | Boolean switches (`$gameSwitches.value(n)`) |
| **Game_SelfSwitches** | Per-event switches (`$gameSelfSwitches.value([mapId, eventId, "A"])`) |

### 4. Sprite Classes (Visual Layer)

Sprite classes render game objects to the screen. They extend PIXI.Sprite or PIXI.Container:

| Class | What It Renders |
|-------|----------------|
| **Spriteset_Map** | The entire map view: tilemap, characters, weather, parallax |
| **Spriteset_Battle** | The battle scene: enemies, actors, animations |
| **Sprite_Character** | A single character/event on the map |
| **Sprite_Battler** | A single combatant (actor or enemy) in battle |
| **Sprite_Animation** | Effekseer or sprite-based battle animations |

### 5. Window Classes (UI Layer)

Windows display text, menus, and choices. They extend `Window_Base` (which wraps PIXI rendering for a bordered, scrollable panel):

| Class | Purpose |
|-------|---------|
| **Window_Message** | "Show Text" dialog with face graphic and text codes |
| **Window_MenuStatus** | Party status list in the main menu |
| **Window_BattleLog** | Battle action narration |
| **Window_ShopBuy** | Shop item list with prices |
| **Window_Selectable** | Base class for any scrollable, selectable list |

---

## The Game Loop

SceneManager runs a `requestAnimationFrame` loop targeting 60 FPS:

```
SceneManager.update()
├── SceneManager.updateInputData()       # Read keyboard/gamepad/touch
├── SceneManager.changeScene()           # Handle scene transitions if pending
├── SceneManager.updateScene()           # Call active scene's update()
│   └── Scene_Map.update()
│       ├── Game_Map.update()            # Update map scroll, events, parallax
│       │   ├── Game_Event.update()      # Check page conditions, run routes
│       │   └── Game_Interpreter.update()  # Execute event commands (1+ per frame)
│       ├── Game_Player.update()         # Handle movement input, encounters
│       └── Spriteset_Map.update()       # Update character sprites, animations
└── SceneManager.renderScene()           # PIXI renderer draws the stage
```

---

## The Event System

Events are RPG Maker's visual scripting layer. Each map event has one or more **pages**, evaluated from last to first. The first page whose conditions are met becomes the active page.

### Page Conditions

A page activates when ALL of its set conditions are true:

- **Switch** — a global switch is ON
- **Variable** — a global variable meets a comparison (≥ value)
- **Self Switch** — a per-event switch (A, B, C, D) is ON
- **Item** — the party possesses a specific item
- **Actor** — a specific actor is in the party
- **Timer** — the countdown timer is within a range

### Event Commands (Partial List)

| Category | Commands |
|----------|----------|
| **Message** | Show Text, Show Choices, Input Number, Show Scrolling Text |
| **Flow** | Conditional Branch, Loop, Break Loop, Label, Jump to Label, Comment |
| **Party** | Change Gold, Change Items, Change Party Member, Change Equipment |
| **Actor** | Change HP, Change MP, Change State, Change EXP, Change Level |
| **Movement** | Transfer Player, Set Movement Route, Scroll Map |
| **Character** | Show Animation, Set Move Route, Change Transparency |
| **System** | Change Battle BGM, Change Save Access, Change Menu Access |
| **Battle** | Change Enemy HP, Force Action, Abort Battle |
| **Advanced** | Script (raw JS), Plugin Command, Control Variables (expressions) |

### Game_Interpreter: The Event Virtual Machine

`Game_Interpreter` reads the command list sequentially. Key behaviors:

- Processes commands one at a time per `update()` call (some commands process multiple per frame).
- **Wait commands** pause the interpreter for N frames.
- **Show Text / Show Choices** pause until the player dismisses them.
- **Conditional Branch** evaluates a condition and jumps to the else-branch or end-branch.
- **Common Events** can be called from any map event, running in a child interpreter.
- **Parallel process** events get their own interpreter instance running concurrently with the map.

---

## The Plugin System

Plugins are the primary extension mechanism. A plugin is a single `.js` file with a structured header comment and code that modifies the engine.

### Plugin Header (MZ Format)

```javascript
/*:
 * @target MZ
 * @plugindesc Adds a dash stamina system to the player.
 * @author YourName
 *
 * @param MaxStamina
 * @type number
 * @min 1
 * @default 100
 * @desc Maximum stamina points.
 *
 * @command RefillStamina
 * @text Refill Stamina
 * @desc Fully restores the player's stamina.
 *
 * @help
 * This plugin adds a stamina bar that depletes while dashing.
 * Use the RefillStamina plugin command to restore it.
 */
```

The header uses `@param` for editor-configurable parameters and `@command` for plugin commands callable from events.

### Plugin Commands (MZ)

```javascript
// Register a plugin command that events can invoke
PluginManager.registerCommand("DashStamina", "RefillStamina", function(args) {
    $gamePlayer._stamina = $gamePlayer._maxStamina;
});
```

In the editor, the event command "Plugin Command" presents a GUI where the user selects the plugin and command, fills in arguments, and the engine calls the registered function.

### Aliasing (Safe Method Override)

The golden rule of plugin development: **never overwrite engine methods directly**. Instead, alias the original and call it from your replacement:

```javascript
// CORRECT — alias preserves compatibility with other plugins
const _Game_Player_update = Game_Player.prototype.update;
Game_Player.prototype.update = function(sceneActive) {
    _Game_Player_update.call(this, sceneActive);
    // Custom logic runs AFTER the original
    this.updateStamina();
};

// WRONG — overwrites the original, breaking other plugins
// Game_Player.prototype.update = function(sceneActive) { ... };
```

### Accessing Game Data from Plugins

```javascript
// Variables and switches (bridge between events and plugins)
$gameVariables.setValue(10, 42);      // Set variable #10 to 42
const val = $gameVariables.value(10); // Read variable #10

$gameSwitches.setValue(5, true);       // Turn switch #5 ON
const on = $gameSwitches.value(5);    // Check switch #5

// Party and actors
const leader = $gameParty.leader();   // First party member
leader.gainHp(50);                    // Heal 50 HP
$gameParty.gainGold(100);            // Add gold

// Current map
const mapId = $gameMap.mapId();
const event = $gameMap.event(eventId);
```

---

## Rendering Pipeline

RPG Maker MZ uses **PIXI.js v5** as its rendering backend (MV uses PIXI v4). The rendering stack:

```
PIXI.Application (Graphics)
└── Stage (Scene_Map extends PIXI.Container)
    ├── Spriteset_Map
    │   ├── Tilemap (ShaderTilemap — GPU-accelerated tile rendering)
    │   │   └── Autotile layers (A1-A5) + Normal tile layers (B-E)
    │   ├── Sprite_Character[] (characters, events, vehicles)
    │   ├── Sprite_Animation[] (map animations)
    │   └── Weather (rain, storm, snow particle effects)
    └── WindowLayer
        ├── Window_Message (dialog)
        ├── Window_Gold (gold display)
        └── Window_NameBox (speaker name)
```

### Tileset System

RPG Maker uses **autotiles** — tiles that automatically connect to neighbors:

| Sheet | Content | Behavior |
|-------|---------|----------|
| **A1** | Animated water/waterfall | Auto-animates, autotile borders |
| **A2** | Ground tiles | Autotile borders with A1 |
| **A3** | Building walls | Wall autotile (top face + sides) |
| **A4** | Tall walls | Wall-top + wall-face autotile |
| **A5** | Simple ground | No autotile — plain 1:1 tiles |
| **B–E** | Normal tiles | Free-placed decorations, objects, overlays |

Passability (walkable/blocked) is configured per-tile in the database Tilesets tab, using directional flags (up/down/left/right) for each tile.

---

## When to Choose RPG Maker

| Strength | Detail |
|----------|--------|
| **RPG-specific workflow** | Database-driven design for stats, skills, items, and encounters |
| **Fastest path to a playable RPG** | Complete battle system, menu system, and map engine out of the box |
| **Non-programmer friendly** | Event system covers story, puzzles, cutscenes, and basic mechanics |
| **Massive plugin ecosystem** | Thousands of community plugins (VisuStella, Yanfly, etc.) |

| Weakness | Detail |
|----------|--------|
| **Genre lock-in** | Designed for tile-based RPGs — fighting games, platformers, etc. require heavy hacking |
| **Resolution limitations** | Default 816×624 (MZ) with limited scaling options |
| **Performance** | JavaScript + PIXI.js can struggle with large maps or complex particle effects |
| **Default look** | Games look similar without significant asset and plugin customization |
