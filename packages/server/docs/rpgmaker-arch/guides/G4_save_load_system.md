# Save/Load System and Data Persistence

> **Category:** guide · **Engine:** RPG Maker · **Related:** [G1_plugin_development](G1_plugin_development.md), [G3_scene_and_window_system](G3_scene_and_window_system.md), [R1_database_configuration](../reference/R1_database_configuration.md)

RPG Maker MZ's save/load system serializes all game state (`$game*` objects) to JSON, compresses it, and stores it via `StorageManager`. Understanding this pipeline is essential for plugin developers who need to persist custom data, implement autosave, or create save-file features like New Game+ imports. This guide covers the default save flow, how to extend it for plugins, and common patterns for global (cross-save) persistence.

---

## Default Save/Load Flow

### Save Pipeline

When the player saves, the following chain executes:

```
Scene_Save
  → DataManager.saveGame(savefileId)
    → DataManager.makeSaveContents()     // bundles all $game* objects
    → JSON.stringify(contents)            // serialize to JSON string
    → StorageManager.saveObject(key, obj) // compress + write to storage
```

### Load Pipeline

```
Scene_Load
  → DataManager.loadGame(savefileId)
    → StorageManager.loadObject(key)       // read + decompress
    → JSON.parse(jsonString)               // deserialize
    → DataManager.extractSaveContents(contents)  // restore $game* objects
```

### What Gets Saved

`DataManager.makeSaveContents()` bundles these global objects:

```javascript
DataManager.makeSaveContents = function() {
    const contents = {};
    contents.system       = $gameSystem;       // BGM, timer, save count, play time
    contents.screen       = $gameScreen;       // tint, shake, weather, pictures
    contents.timer        = $gameTimer;        // countdown timer state
    contents.switches     = $gameSwitches;     // all game switches (boolean flags)
    contents.variables    = $gameVariables;    // all game variables (numbers/strings)
    contents.selfSwitches = $gameSelfSwitches; // per-event switches
    contents.actors       = $gameActors;       // party member stats, equipment, skills
    contents.party        = $gameParty;        // inventory, gold, party order
    contents.map          = $gameMap;          // current map state, events, interpreter
    contents.player       = $gamePlayer;       // position, direction, followers
    return contents;
};
```

`extractSaveContents` does the reverse — assigns each property back to the global variable.

---

## Persisting Custom Plugin Data

The cleanest way to save custom data depends on what you're storing and whether it should be per-save or global.

### Option 1: Attach to $gameSystem (Simplest)

If your plugin has a small amount of per-save state, attach it to `$gameSystem`. This object is already serialized automatically:

```javascript
// In your plugin — initialize on new game
const _Game_System_initialize = Game_System.prototype.initialize;
Game_System.prototype.initialize = function() {
    _Game_System_initialize.call(this);
    this._myPlugin = {
        reputation: 0,
        factionsDiscovered: [],
        questFlags: {}
    };
};

// Access anywhere in your plugin:
// $gameSystem._myPlugin.reputation += 10;
```

**Why this works:** `$gameSystem` is included in `makeSaveContents`, so anything attached to it serializes automatically — as long as the data is JSON-safe (no functions, circular references, or class instances with methods).

**Naming convention:** Prefix with underscore and your plugin name (`this._myPluginName`) to avoid collisions with other plugins and future engine updates.

### Option 2: Alias makeSaveContents / extractSaveContents

For larger or more structured data, add your own key to the save contents:

```javascript
// Save — alias makeSaveContents to include custom data
const _DataManager_makeSaveContents = DataManager.makeSaveContents;
DataManager.makeSaveContents = function() {
    const contents = _DataManager_makeSaveContents.call(this);
    contents.myPluginData = $gameMyPluginData; // your custom global object
    return contents;
};

// Load — alias extractSaveContents to restore it
const _DataManager_extractSaveContents = DataManager.extractSaveContents;
DataManager.extractSaveContents = function(contents) {
    _DataManager_extractSaveContents.call(this, contents);
    $gameMyPluginData = contents.myPluginData || new Game_MyPluginData();
};
```

**Critical:** Always provide a fallback (`|| new Game_MyPluginData()`) in `extractSaveContents`. Old save files created before your plugin was installed won't have the key. Without a fallback, loading those saves crashes.

### Option 3: Custom Game Object (Full Pattern)

For complex systems (crafting, relationship graphs, procedural world state), create a proper `Game_*` class:

```javascript
//=============================================================================
// Game_CraftingSystem — persistent crafting data
//=============================================================================

function Game_CraftingSystem() {
    this.initialize.apply(this, arguments);
}

Game_CraftingSystem.prototype.initialize = function() {
    this._recipes = {};        // discovered recipe IDs
    this._materials = {};      // material inventory (separate from party items)
    this._craftingLevel = 1;
    this._experience = 0;
};

Game_CraftingSystem.prototype.discoverRecipe = function(recipeId) {
    this._recipes[recipeId] = true;
};

Game_CraftingSystem.prototype.hasRecipe = function(recipeId) {
    return !!this._recipes[recipeId];
};

// Global variable — initialized on new game and restored on load
var $gameCrafting = null;

// Hook into new game creation
const _DataManager_createGameObjects = DataManager.createGameObjects;
DataManager.createGameObjects = function() {
    _DataManager_createGameObjects.call(this);
    $gameCrafting = new Game_CraftingSystem();
};

// Hook into save
const _DataManager_makeSaveContents = DataManager.makeSaveContents;
DataManager.makeSaveContents = function() {
    const contents = _DataManager_makeSaveContents.call(this);
    contents.crafting = $gameCrafting;
    return contents;
};

// Hook into load
const _DataManager_extractSaveContents = DataManager.extractSaveContents;
DataManager.extractSaveContents = function(contents) {
    _DataManager_extractSaveContents.call(this, contents);
    $gameCrafting = contents.crafting || new Game_CraftingSystem();
};
```

**Serialization note:** `JSON.stringify` only serializes own-properties, not prototype methods. When the object is deserialized via `JSON.parse`, it becomes a plain object — its prototype methods are gone. If you need them after loading, reassign the prototype:

```javascript
DataManager.extractSaveContents = function(contents) {
    _DataManager_extractSaveContents.call(this, contents);
    $gameCrafting = contents.crafting || new Game_CraftingSystem();
    // Restore prototype so methods like .hasRecipe() work after load
    if ($gameCrafting && !($gameCrafting instanceof Game_CraftingSystem)) {
        Object.setPrototypeOf($gameCrafting, Game_CraftingSystem.prototype);
    }
};
```

---

## Global (Cross-Save) Data

Some data should persist across all save files: achievements, unlocked gallery images, total play time, New Game+ flags. RPG Maker MZ calls this "global info."

### Using ConfigManager (Settings-Style Globals)

`ConfigManager` saves to a separate file (`config.rpgsave`) that is not tied to any save slot:

```javascript
// Register your config values
const _ConfigManager_makeData = ConfigManager.makeData;
ConfigManager.makeData = function() {
    const config = _ConfigManager_makeData.call(this);
    config.totalPlaytime = this.totalPlaytime || 0;
    config.achievements = this.achievements || [];
    config.newGamePlusUnlocked = this.newGamePlusUnlocked || false;
    return config;
};

const _ConfigManager_applyData = ConfigManager.applyData;
ConfigManager.applyData = function(config) {
    _ConfigManager_applyData.call(this, config);
    this.totalPlaytime = config.totalPlaytime || 0;
    this.achievements = config.achievements || [];
    this.newGamePlusUnlocked = config.newGamePlusUnlocked || false;
};

// Usage: ConfigManager.achievements.push("beat_boss_1");
//        ConfigManager.save();  // writes to config.rpgsave
```

### Using StorageManager Directly

For fully custom global files:

```javascript
// Save arbitrary data to a named key
const globalData = { unlockedEndings: [1, 3], galleryImages: [101, 102] };
StorageManager.saveObject("myPluginGlobal", globalData)
    .then(() => console.log("Global data saved"))
    .catch(e => console.error("Save failed:", e));

// Load it back
StorageManager.loadObject("myPluginGlobal")
    .then(data => {
        if (data) {
            // restore state
        }
    });
```

**Note:** `StorageManager.saveObject` and `loadObject` are async (return Promises) in MZ. Always handle the Promise — don't fire-and-forget.

---

## Storage Backends

RPG Maker MZ supports two storage backends:

| Backend | When Used | Location |
|---------|-----------|----------|
| **LocalStorage** | Browser / web deployment | `localStorage["rmmzsave_<key>"]` |
| **fs (Node.js)** | Desktop (NW.js) | `<project>/save/<filename>.rpgsave` |

The `StorageManager` abstracts this — your plugin code works identically on both platforms. Files are compressed with pako (zlib) before storage.

### Save File Naming

```javascript
DataManager.makeSaveName = function(savefileId) {
    return "file" + savefileId;  // "file1", "file2", etc.
};
// Global info uses key "global"
// Config uses key "config"
```

---

## Autosave

MZ has a built-in autosave that triggers on map transfer. It uses save slot 0:

```javascript
// Trigger autosave manually from a plugin:
Scene_Map.prototype.requestAutosave = function() {
    if ($gameSystem.isAutosaveEnabled()) {
        this.executeAutosave();
    }
};
```

To hook into autosave events (e.g., show a save icon):

```javascript
const _Scene_Map_onAutosaveSuccess = Scene_Map.prototype.onAutosaveSuccess;
Scene_Map.prototype.onAutosaveSuccess = function() {
    _Scene_Map_onAutosaveSuccess.call(this);
    // Show a save indicator sprite, play a sound, etc.
};
```

---

## Save File Metadata (Save Info)

The title screen's "Continue" option displays save file metadata without loading the full save. This metadata is stored separately as "global info":

```javascript
DataManager.makeSavefileInfo = function() {
    const info = {};
    info.title = $dataSystem.gameTitle;
    info.characters = $gameParty.charactersForSavefile();
    info.faces = $gameParty.facesForSavefile();
    info.playtime = $gameSystem.playtimeText();
    info.timestamp = Date.now();
    return info;
};
```

To add custom fields (chapter name, location):

```javascript
const _DataManager_makeSavefileInfo = DataManager.makeSavefileInfo;
DataManager.makeSavefileInfo = function() {
    const info = _DataManager_makeSavefileInfo.call(this);
    info.chapterName = $gameSystem._currentChapter || "Prologue";
    info.location = $gameMap.displayName() || "Unknown";
    return info;
};
```

This info is accessible on the title screen without loading the full save, which is how the Continue screen shows character faces and play time.

---

## Common Pitfalls

1. **Forgetting the fallback in extractSaveContents** — old saves without your plugin's data will be `undefined`. Always provide a default: `contents.myData || new MyDataClass()`.
2. **Storing non-JSON-safe data** — functions, class methods, `Map` objects, `Set` objects, and circular references do not survive `JSON.stringify`. Stick to plain objects, arrays, strings, numbers, and booleans.
3. **Not restoring prototypes after load** — `JSON.parse` creates plain objects. If your loaded data needs methods, use `Object.setPrototypeOf()` to restore the prototype chain.
4. **Overwriting instead of aliasing** — never replace `makeSaveContents` directly. Always alias with `const _original = DataManager.makeSaveContents` and call the original. Otherwise you break every other plugin's save data.
5. **Ignoring async in StorageManager** — `saveObject` and `loadObject` return Promises in MZ. Forgetting `await` or `.then()` leads to race conditions where data appears to not save.
6. **Saving too much data** — localStorage has a ~5 MB limit in browsers. Compressed save files over 1 MB cause noticeable lag. Keep saved state lean — store IDs and flags, not full copies of database entries.
