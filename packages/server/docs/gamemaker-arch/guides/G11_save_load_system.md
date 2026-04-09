# Save/Load System & Data Persistence

> **Category:** guide · **Engine:** GameMaker · **Related:** [R1_gml_data_structures](../reference/R1_gml_data_structures.md), [G6_structs_state_machines](G6_structs_state_machines.md), [E1_architecture_overview](../architecture/E1_architecture_overview.md)

GameMaker offers multiple approaches for persisting game data — from simple `ini_file` key-value storage to full JSON serialization with buffers. Modern GML (2.3+) favors **structs + `json_stringify` + buffers** as the standard save/load pattern. This guide covers every tier of persistence, when to use each, and how to build a robust save system.

---

## Quick Reference: Which Method to Use

| Method | Best For | Complexity |
|--------|----------|------------|
| `ini_file` | Settings, high scores, small config | Low |
| `file_text_*` | Debug logs, human-readable exports | Low |
| `json_stringify` + `buffer_save` | Full game state, inventories, progress | Medium |
| `buffer_write` (binary) | Large worlds, replay data, networking | High |
| `ds_map` + `json_encode` | Legacy projects (pre-2.3) | Medium |

---

## Tier 1: INI Files (Settings & Preferences)

Best for simple key-value pairs like volume levels, keybinds, or display settings.

```gml
/// Save settings
ini_open("settings.ini");
ini_write_real("audio", "master_volume", global.master_volume);
ini_write_real("audio", "sfx_volume", global.sfx_volume);
ini_write_string("display", "resolution", global.resolution);
ini_write_real("display", "fullscreen", global.fullscreen);
ini_close();

/// Load settings (with defaults)
ini_open("settings.ini");
global.master_volume = ini_read_real("audio", "master_volume", 0.8);
global.sfx_volume    = ini_read_real("audio", "sfx_volume", 1.0);
global.resolution    = ini_read_string("display", "resolution", "1920x1080");
global.fullscreen    = ini_read_real("display", "fullscreen", false);
ini_close();
```

**Caveats:**
- INI files are stored as plain text — players can edit them easily.
- No nesting or complex structures. Stick to flat key-value pairs.
- Always call `ini_close()` — leaving it open can corrupt the file.

---

## Tier 2: JSON + Buffers (Recommended for Game State)

The modern approach for full save files. Build a struct representing your game state, serialize to JSON, write via buffer for cross-platform safety.

### Saving

```gml
/// @function save_game(_slot)
/// @param {real} _slot  Save slot number (0, 1, 2...)
function save_game(_slot) {
    // 1. Build the save struct
    var _save_data = {
        version: "1.2.0",              // Schema version for migration
        timestamp: date_current_datetime(),
        player: {
            x: obj_player.x,
            y: obj_player.y,
            hp: obj_player.hp,
            max_hp: obj_player.max_hp,
            level: obj_player.level,
            xp: obj_player.xp,
        },
        inventory: global.inventory,    // Array of item structs
        quests: global.quest_log,       // Array of quest structs
        room_name: room_get_name(room),
        playtime: global.playtime,
    };

    // 2. Serialize to JSON string
    var _json_string = json_stringify(_save_data);

    // 3. Write to buffer, then save to file
    var _buff = buffer_create(string_byte_length(_json_string) + 1, buffer_fixed, 1);
    buffer_write(_buff, buffer_string, _json_string);
    buffer_save(_buff, "save_" + string(_slot) + ".json");
    buffer_delete(_buff);

    show_debug_message("Game saved to slot " + string(_slot));
}
```

### Loading

```gml
/// @function load_game(_slot)
/// @param {real} _slot  Save slot number
/// @returns {struct|undefined}  The save data struct, or undefined on failure
function load_game(_slot) {
    var _filename = "save_" + string(_slot) + ".json";

    // 1. Check file exists
    if (!file_exists(_filename)) {
        show_debug_message("No save file in slot " + string(_slot));
        return undefined;
    }

    // 2. Load buffer and read string
    var _buff = buffer_load(_filename);
    var _json_string = buffer_read(_buff, buffer_string);
    buffer_delete(_buff);

    // 3. Parse JSON back to struct
    var _save_data = json_parse(_json_string);

    // 4. Apply to game state
    room_goto(asset_get_index(_save_data.room_name));
    with (obj_player) {
        x      = _save_data.player.x;
        y      = _save_data.player.y;
        hp     = _save_data.player.hp;
        max_hp = _save_data.player.max_hp;
        level  = _save_data.player.level;
        xp     = _save_data.player.xp;
    }
    global.inventory = _save_data.inventory;
    global.quest_log = _save_data.quests;
    global.playtime  = _save_data.playtime;

    return _save_data;
}
```

### Why Buffers Instead of `file_text_*`?

- **Cross-platform safety.** Buffers handle encoding consistently across Windows, macOS, mobile, and consoles. `file_text_write_string` can introduce line-ending or encoding differences.
- **Performance.** Buffers write in a single operation. Text files require open/write/close with potential line-by-line overhead.
- **Binary option.** The same buffer pattern scales to binary formats when JSON becomes too slow for large worlds.

---

## Save File Versioning

Games evolve. Your save format will change. Always include a version field and a migration function.

```gml
/// @function migrate_save(_data)
/// @param {struct} _data  Parsed save data
/// @returns {struct}  Migrated save data
function migrate_save(_data) {
    var _v = _data[$ "version"] ?? "1.0.0";

    // v1.0.0 → v1.1.0: Added quest_log
    if (_v == "1.0.0") {
        _data.quests = [];
        _data.version = "1.1.0";
        _v = "1.1.0";
    }

    // v1.1.0 → v1.2.0: Renamed "coins" to "gold"
    if (_v == "1.1.0") {
        if (variable_struct_exists(_data.player, "coins")) {
            _data.player.gold = _data.player.coins;
            variable_struct_remove(_data.player, "coins");
        }
        _data.version = "1.2.0";
        _v = "1.2.0";
    }

    return _data;
}
```

Call `migrate_save()` immediately after `json_parse()` and before applying state.

---

## Handling Complex Data

### Nested Structs & Arrays

`json_stringify` handles arbitrary nesting of structs and arrays natively:

```gml
global.inventory = [
    { id: "sword_iron", count: 1, durability: 85 },
    { id: "potion_hp",  count: 12 },
    { id: "gem_ruby",   count: 3 },
];

// This serializes perfectly — no special handling needed
var _json = json_stringify({ inventory: global.inventory });
```

### Things That Do NOT Serialize

- **Instance references** — object IDs are runtime values, not persistent. Store the object's key data instead (position, type, state).
- **Surfaces** — pixel data. Save as a sprite or buffer of pixel data if needed.
- **Data structures** (`ds_map`, `ds_list`, `ds_grid`) — use `json_encode` for legacy DS maps, but prefer converting to structs/arrays first.
- **Methods/functions** — cannot be serialized. Store the function name as a string and look it up on load.

### Serializing Instance State

```gml
/// Collect all enemies in the room into a saveable array
function serialize_enemies() {
    var _enemies = [];
    with (obj_enemy_parent) {
        array_push(_enemies, {
            object_type: object_get_name(object_index),
            x: x,
            y: y,
            hp: hp,
            state: state_name,  // String identifier, not enum
        });
    }
    return _enemies;
}

/// Recreate enemies from save data
function deserialize_enemies(_enemy_array) {
    for (var i = 0; i < array_length(_enemy_array); i++) {
        var _e = _enemy_array[i];
        var _obj = asset_get_index(_e.object_type);
        var _inst = instance_create_layer(_e.x, _e.y, "Instances", _obj);
        _inst.hp = _e.hp;
        _inst.state_name = _e.state;
    }
}
```

---

## Checking and Deleting Saves

```gml
/// Check if a save slot has data
function save_exists(_slot) {
    return file_exists("save_" + string(_slot) + ".json");
}

/// Delete a save
function delete_save(_slot) {
    var _filename = "save_" + string(_slot) + ".json";
    if (file_exists(_filename)) {
        file_delete(_filename);
    }
}

/// Get save metadata without loading full state
function get_save_info(_slot) {
    var _filename = "save_" + string(_slot) + ".json";
    if (!file_exists(_filename)) return undefined;

    var _buff = buffer_load(_filename);
    var _data = json_parse(buffer_read(_buff, buffer_string));
    buffer_delete(_buff);

    // Return only the metadata
    return {
        slot: _slot,
        timestamp: _data.timestamp,
        playtime: _data.playtime,
        level: _data.player.level,
        room: _data.room_name,
    };
}
```

---

## Legacy: `json_encode` / `json_decode` (Pre-2.3)

For projects still using `ds_map` and `ds_list`, the older `json_encode` and `json_decode` functions work, but have quirks:

- `json_encode` requires a `ds_map` as root — not a `ds_list` or struct.
- `json_decode` returns a `ds_map`, not a struct. You must use `ds_map_find_value` to access fields.
- Nested maps and lists created by `json_decode` must be manually cleaned up to avoid memory leaks.

**Recommendation:** Convert legacy DS-based save systems to struct-based. It eliminates an entire class of memory leak bugs and produces cleaner code.

---

## File Locations

GameMaker writes files to the **sandbox directory** by default:

| Platform | Default Location |
|----------|-----------------|
| Windows | `%LOCALAPPDATA%/<game_name>/` |
| macOS | `~/Library/Application Support/com.<company>.<game>/` |
| Linux | `~/.config/<game_name>/` |
| HTML5 | Browser `localStorage` (size-limited) |
| Mobile | App-private storage |

Use `game_save_id` to get the full path programmatically. Note that HTML5 has a ~5 MB localStorage limit — keep saves compact or use the `buffer_async` functions.

---

## Common Pitfalls

1. **Forgetting `buffer_delete`** — every `buffer_create` or `buffer_load` needs a matching `buffer_delete`, or you leak memory.
2. **No version field** — makes future save migration impossible without guesswork.
3. **Saving instance IDs** — they change every run. Save the data that lets you reconstruct the instance instead.
4. **Saving in the Step event** — file I/O is slow. Save on explicit user action or room transitions, never every frame.
5. **No error handling** — wrap `json_parse` in a `try/catch` to handle corrupted save files gracefully.

```gml
try {
    var _data = json_parse(_json_string);
} catch (_error) {
    show_debug_message("Corrupted save file: " + _error.message);
    return undefined;
}
```
