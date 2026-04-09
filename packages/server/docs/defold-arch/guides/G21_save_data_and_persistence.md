# G21 — Save Data & Persistence

> **Category:** guide · **Engine:** Defold · **Related:** [G2 Game Objects & Collections](G2_game_objects_and_collections.md) · [G15 Lua Scripting Patterns](G15_lua_scripting_patterns.md) · [G12 Distribution & Publishing](G12_distribution_and_publishing.md)

Every game beyond the most trivial needs to persist data between sessions — high scores, settings, save slots, progression, unlocks. Defold provides `sys.save()` and `sys.load()` for structured data, the standard Lua `io` module for raw file access, and `sys.load_resource()` for bundled read-only assets.

---

## Quick Start: sys.save / sys.load

The simplest path. Serializes a Lua table to disk and reads it back.

```lua
-- Get a platform-independent path for this game's save file
local SAVE_PATH = sys.get_save_file("my_game", "save1.dat")

-- Save a Lua table
local data = {
    score = 4200,
    level = 3,
    settings = { music = 0.8, sfx = 1.0 },
    unlocks = { "sword", "shield" }
}
local ok = sys.save(SAVE_PATH, data)
if not ok then
    print("Save failed!")
end

-- Load it back
local loaded = sys.load(SAVE_PATH)
-- loaded.score == 4200
```

### What sys.save Supports

`sys.save()` serializes Lua tables containing: numbers, strings, booleans, and nested tables (both array-style and key-value). It does **not** support:

- Functions
- Userdata (vmath vectors, hashes, etc.)
- Circular references
- Tables with mixed integer and string keys at the same level (behavior is undefined)

**Convert before saving:** Store `vmath.vector3` as `{ x = v.x, y = v.y, z = v.z }` and hashes as their string equivalents.

### sys.get_save_file(application_id, file_name)

Returns an absolute path appropriate for the current OS:

| Platform | Typical Location |
|----------|-----------------|
| macOS | `~/Library/Application Support/<application_id>/<file_name>` |
| Windows | `%APPDATA%\<application_id>\<file_name>` |
| Linux | `~/.config/<application_id>/<file_name>` |
| iOS | App sandbox Documents directory |
| Android | App internal storage |
| HTML5 | IndexedDB virtual filesystem |

The directory is created automatically if it does not exist.

---

## Robust Save/Load Pattern

Production games need error handling, default values, and migration support.

```lua
local M = {}

local APP_ID = "my_game"
local SAVE_FILE = "save.dat"
local SAVE_VERSION = 2

local DEFAULTS = {
    version = SAVE_VERSION,
    score = 0,
    level = 1,
    settings = { music = 1.0, sfx = 1.0, fullscreen = false },
    unlocks = {},
    play_time = 0,
}

local save_path = sys.get_save_file(APP_ID, SAVE_FILE)

--- Deep merge: fills in missing keys from defaults without overwriting existing values
local function merge_defaults(data, defaults)
    for k, v in pairs(defaults) do
        if data[k] == nil then
            if type(v) == "table" then
                data[k] = {}
                merge_defaults(data[k], v)
            else
                data[k] = v
            end
        elseif type(v) == "table" and type(data[k]) == "table" then
            merge_defaults(data[k], v)
        end
    end
end

--- Migrate old save formats to current version
local function migrate(data)
    if not data.version then
        -- v0 → v1: rename "highscore" to "score"
        data.score = data.highscore or 0
        data.highscore = nil
        data.version = 1
    end
    if data.version == 1 then
        -- v1 → v2: add play_time tracking
        data.play_time = 0
        data.version = 2
    end
    return data
end

function M.load()
    local data = sys.load(save_path)
    -- sys.load returns an empty table if the file doesn't exist
    if next(data) == nil then
        data = {}
    end
    data = migrate(data)
    merge_defaults(data, DEFAULTS)
    return data
end

function M.save(data)
    data.version = SAVE_VERSION
    local ok = sys.save(save_path, data)
    if not ok then
        print("ERROR: Failed to save game data to " .. save_path)
    end
    return ok
end

return M
```

### Key Design Decisions

- **Version field:** Always include one. When you add fields or change structure, bump the version and add a migration step.
- **Merge defaults:** New game features add new save fields. Merging ensures old save files get the new defaults without losing existing data.
- **sys.load returns `{}`:** An empty table (not `nil`) if the file doesn't exist. Check with `next(data) == nil`.

---

## Multiple Save Slots

```lua
local function get_slot_path(slot_number)
    return sys.get_save_file("my_game", "slot_" .. slot_number .. ".dat")
end

function M.save_slot(slot_number, data)
    return sys.save(get_slot_path(slot_number), data)
end

function M.load_slot(slot_number)
    local data = sys.load(get_slot_path(slot_number))
    if next(data) == nil then return nil end
    return migrate(data)
end

function M.delete_slot(slot_number)
    os.remove(get_slot_path(slot_number))
end

function M.list_slots()
    local slots = {}
    for i = 1, 5 do
        local data = sys.load(get_slot_path(i))
        if next(data) ~= nil then
            slots[i] = { level = data.level, play_time = data.play_time }
        end
    end
    return slots
end
```

---

## Settings vs. Game State

Separate settings (audio volume, controls, accessibility) from game state (progress, inventory). This lets players change settings without touching their save, and makes it easy to offer "New Game" without resetting preferences.

```lua
local SETTINGS_PATH = sys.get_save_file("my_game", "settings.dat")
local SAVE_PATH = sys.get_save_file("my_game", "save.dat")
```

---

## Raw File Access with io

For cases where `sys.save` is too limited — custom binary formats, CSV exports, log files — use Lua's `io` module.

```lua
-- Write a text file
local path = sys.get_save_file("my_game", "log.txt")
local f = io.open(path, "w")
if f then
    f:write("Game started at " .. os.date() .. "\n")
    f:close()
end

-- Append to an existing file
local f = io.open(path, "a")
if f then
    f:write("Level completed: 3\n")
    f:close()
end

-- Read the entire file
local f = io.open(path, "r")
if f then
    local content = f:read("*a")
    f:close()
end
```

Use `os.remove(path)` to delete and `os.rename(old, new)` to rename.

---

## Bundled Read-Only Resources

### Custom Resources (sys.load_resource)

Files listed in the **Custom Resources** field of `game.project` are compiled into the game archive. Access them at runtime as raw strings:

```lua
-- game.project: [project] custom_resources = /data/levels.json

local json_string = sys.load_resource("/data/levels.json")
local levels = json.decode(json_string)
```

Use this for static data: level definitions, dialog trees, item databases. These files are read-only.

### Bundle Resources

Directories listed in **Bundle Resources** are copied as-is alongside the executable. Organize by platform:

```
bundle_resources/
├── common/         -- all platforms
├── ios/
├── android/
├── win32/
└── web/
```

Access via `sys.get_application_path()` combined with `io.open()`:

```lua
local app_path = sys.get_application_path()
local f = io.open(app_path .. "/common/config.json", "r")
```

---

## HTML5 Considerations

Browsers cannot access the real filesystem. Defold maps `sys.save()` and `sys.load()` to **IndexedDB** automatically — no code changes needed. However:

- **io module is limited.** `io.open` works only for paths within the virtual filesystem. You cannot write to arbitrary paths.
- **Storage quotas apply.** Browsers may limit IndexedDB storage (typically 50–100 MB). Keep save data small.
- **Data can be cleared.** Users clearing browser data will lose saves. Consider adding cloud save support for HTML5 games.
- **Bundle resources** are accessible via `sys.get_application_path()` but served over HTTP internally.

---

## Auto-Save Pattern

Save automatically at key moments (level complete, checkpoint, quit) rather than relying on manual saves:

```lua
local save_data = require("shared.modules.save_data")

local game_state = nil

function init(self)
    game_state = save_data.load()
end

function on_message(self, message_id, message, sender)
    if message_id == hash("level_complete") then
        game_state.level = game_state.level + 1
        game_state.score = game_state.score + message.score
        save_data.save(game_state)

    elseif message_id == hash("checkpoint_reached") then
        game_state.checkpoint = message.checkpoint_id
        save_data.save(game_state)
    end
end

function final(self)
    -- Save on exit
    save_data.save(game_state)
end
```

---

## Common Pitfalls

| Pitfall | Fix |
|---------|-----|
| `sys.load` returns `{}` and you treat it as `nil` | Check `next(data) == nil` for empty tables |
| Saving vmath types crashes or loses data | Convert to plain tables before saving: `{ x = v.x, y = v.y, z = v.z }` |
| Old saves break after adding new fields | Use versioned migration + default merging (see Robust pattern above) |
| Save file path hardcoded with slashes | Always use `sys.get_save_file()` — it handles OS-specific separators |
| HTML5 save data lost when user clears browser | Document this for players; consider cloud save integration |
| Saving too frequently causes stutters | Batch saves at natural breakpoints (checkpoints, level transitions), not every frame |
| `sys.save` returns false with no explanation | Check that the path is valid and the directory exists. On mobile, check storage permissions. |
