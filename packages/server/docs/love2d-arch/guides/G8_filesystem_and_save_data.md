# G8 — Filesystem & Save Data

> **Category:** guide · **Engine:** Love2D · **Related:** [G1 Game Loop & Callbacks](G1_game_loop_and_callbacks.md) · [R1 Module Reference](../reference/R1_module_reference.md)

---

## How the Sandbox Works

LÖVE ships a sandboxed filesystem (`love.filesystem`) that sits between your game and the OS. Two locations matter:

| Location | Read | Write | What lives there |
|----------|------|-------|-----------------|
| **Source directory** | Yes | No | Your `.love` archive or project folder — game assets, Lua files |
| **Save directory** | Yes | Yes | Per-game writable folder for saves, settings, logs |

When you call `love.filesystem.read("file.txt")`, LÖVE looks in the **save directory first**, then falls back to the source directory. Writes always go to the save directory — you cannot overwrite your own game assets at runtime.

The save directory path depends on the OS:

- **Windows:** `%APPDATA%/LOVE/<identity>/`
- **macOS:** `~/Library/Application Support/LOVE/<identity>/`
- **Linux:** `~/.local/share/love/<identity>/`

The `<identity>` is set by `love.filesystem.setIdentity("mygame")` or in `conf.lua` via `t.identity = "mygame"`.

---

## Essential Functions

### Reading and Writing

```lua
-- Write a string to a file (creates or overwrites)
love.filesystem.write("save.txt", "level=3\nscore=1200")

-- Append to an existing file
love.filesystem.append("log.txt", os.date() .. " Game started\n")

-- Read entire file as a string
local contents = love.filesystem.read("save.txt")

-- Read with a byte limit
local first100 = love.filesystem.read("bigfile.dat", 100)
```

Both `write` and `read` return `data, size` on success, or `nil, errormsg` on failure. Always check:

```lua
local data, err = love.filesystem.read("save.dat")
if not data then
    print("Load failed: " .. err)
end
```

### File and Directory Info

```lua
-- Check if a path exists and get its type (11.0+)
local info = love.filesystem.getInfo("saves/slot1.json")
if info then
    print(info.type)     -- "file", "directory", or "symlink"
    print(info.size)     -- file size in bytes
    print(info.modtime)  -- last modification timestamp
end

-- List directory contents
local items = love.filesystem.getDirectoryItems("saves")
for _, name in ipairs(items) do
    print(name)
end
```

> **Note:** `love.filesystem.exists()` was removed in LÖVE 11.0. Use `getInfo` instead.

### Creating and Removing

```lua
-- Create a directory (including parents)
love.filesystem.createDirectory("saves/backups")

-- Remove a file or empty directory
love.filesystem.remove("saves/old_slot.json")
```

`remove` only works on files and **empty** directories inside the save directory.

---

## Save-Data Patterns

### Pattern 1 — Simple Key-Value (Settings)

For a handful of flat values, write a Lua table literal and `load` it back:

```lua
-- save_manager.lua
local SaveManager = {}

function SaveManager.save(filepath, data)
    local chunks = {}
    chunks[#chunks + 1] = "return {\n"
    for k, v in pairs(data) do
        if type(v) == "string" then
            chunks[#chunks + 1] = string.format("  %s = %q,\n", k, v)
        else
            chunks[#chunks + 1] = string.format("  %s = %s,\n", k, tostring(v))
        end
    end
    chunks[#chunks + 1] = "}\n"
    love.filesystem.write(filepath, table.concat(chunks))
end

function SaveManager.load(filepath)
    local info = love.filesystem.getInfo(filepath)
    if not info then return nil end
    local contents = love.filesystem.read(filepath)
    local fn = loadstring(contents)   -- or load() in Lua 5.3+
    if fn then
        return fn()
    end
    return nil
end

return SaveManager
```

```lua
-- Usage
local SaveManager = require("save_manager")

-- Save
SaveManager.save("settings.lua", {
    volume = 0.8,
    fullscreen = true,
    language = "en",
})

-- Load
local settings = SaveManager.load("settings.lua") or { volume = 1, fullscreen = false }
```

> **Security note:** `loadstring` executes arbitrary Lua. This is fine for single-player saves under the sandboxed filesystem, but avoid it if save files could come from untrusted sources (e.g., shared replays). Use JSON in that case.

### Pattern 2 — JSON (Structured Data)

For nested data or when you need interoperability, use a JSON library. `json.lua` (rxi) and `dkjson` are popular single-file drops:

```lua
local json = require("lib.json")  -- rxi/json.lua

local function save_game(slot, state)
    local encoded = json.encode(state)
    love.filesystem.write("saves/slot" .. slot .. ".json", encoded)
end

local function load_game(slot)
    local path = "saves/slot" .. slot .. ".json"
    if not love.filesystem.getInfo(path) then return nil end
    local raw = love.filesystem.read(path)
    return json.decode(raw)
end
```

### Pattern 3 — Binary (High-Performance)

For large worlds or replay data where size matters, use `love.data.pack` / `love.data.unpack` (LÖVE 11.0+) or a library like `bitser`:

```lua
local bitser = require("lib.bitser")

-- Save
local blob = bitser.dumps(game_state)
love.filesystem.write("world.dat", blob)

-- Load
local raw = love.filesystem.read("world.dat")
local game_state = bitser.loads(raw)
```

`bitser` handles Lua tables, nested references, and even metatables. It produces compact binary output that loads significantly faster than JSON for large datasets.

---

## Mounting External Archives

`love.filesystem.mount` lets you layer additional `.zip` or directory trees into the virtual filesystem:

```lua
-- Mount a DLC zip so its contents appear under "dlc/"
local ok = love.filesystem.mount("dlc_pack_1.zip", "dlc")

-- Now you can read as if the files were always there
local mapData = love.filesystem.read("dlc/maps/bonus.lua")

-- Unmount when done
love.filesystem.unmount("dlc_pack_1.zip")
```

This is useful for DLC, modding support, or splitting large asset packs.

---

## Dropped Files

LÖVE 11.0+ fires `love.filedropped(file)` when the user drags a file onto the game window. The `file` is a `DroppedFile` object (not a string path):

```lua
function love.filedropped(file)
    file:open("r")
    local contents = file:read()
    file:close()
    -- Process the external file...
    print("Loaded external file: " .. file:getFilename())
end
```

Dropped files live **outside** the sandbox, so you cannot pass their paths to `love.filesystem.read`. Use the `File:read()` method on the object directly.

---

## Common Pitfalls

| Pitfall | Fix |
|---------|-----|
| Using `io.open` instead of `love.filesystem` | Stick to `love.filesystem` — it works cross-platform, respects the sandbox, and works with `.love` archives |
| Forgetting to set identity | Without `t.identity` in `conf.lua`, LÖVE uses `"love"` as the save folder — shared with every other game that made the same mistake |
| Calling `love.filesystem.write` in `love.update` every frame | Write on explicit save events (pause, quit, checkpoint). Use `love.quit()` as a safety net |
| Assuming file order from `getDirectoryItems` | The returned list is **not** sorted. Sort it yourself if order matters |
| Not handling `nil` returns | Both `read` and `write` can fail — always check the second return value |

---

## Autosave on Quit

LÖVE calls `love.quit()` before closing. Return `true` to abort the quit (useful for "are you sure?" prompts), or use it as a last-chance save:

```lua
function love.quit()
    save_game(current_slot, game_state)
    -- returning nil/false allows the quit to proceed
end
```

> **Caution:** On mobile or when force-killed, `love.quit` is not guaranteed to run. Periodic autosaves are safer for critical data.
