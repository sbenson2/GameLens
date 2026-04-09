# G20 — Error Handling and Resilience

> **Category:** guide · **Engine:** Love2D · **Related:** [G1 Game Loop & Callbacks](G1_game_loop_and_callbacks.md) · [G8 Filesystem & Save Data](G8_filesystem_and_save_data.md) · [G15 Debugging & Profiling](G15_debugging_and_profiling.md) · [R1 Module Reference](../reference/R1_module_reference.md)

---

## Overview

LÖVE is a Lua framework, and Lua's error handling model is simple: errors propagate up the call stack until something catches them with `pcall` or `xpcall`, or they reach LÖVE's built-in error handler. This guide covers how to use protected calls for in-game resilience, customize the error screen for shipped games, and write defensive Lua that fails gracefully instead of crashing.

---

## Lua's Error Model: pcall and xpcall

Lua doesn't have try/catch. Instead it has `pcall` (protected call) and `xpcall` (protected call with error handler).

### pcall — Basic Protected Call

```lua
local ok, result = pcall(some_function, arg1, arg2)
if not ok then
    -- result is the error message (string)
    print("Error: " .. tostring(result))
else
    -- result is the return value of some_function
    print("Success: " .. tostring(result))
end
```

### xpcall — Protected Call with Stack Trace

`xpcall` lets you provide an error handler that runs before the stack unwinds, so you can capture `debug.traceback()`:

```lua
local ok, result = xpcall(
    function()
        return risky_operation()
    end,
    function(err)
        return err .. "\n" .. debug.traceback("", 2)
    end
)
if not ok then
    log_error(result)  -- result now includes the stack trace
end
```

### When to Use Each

| Situation | Use |
|-----------|-----|
| Loading user-created content (mods, levels) | `pcall` or `xpcall` |
| Parsing JSON/data files that might be malformed | `pcall` |
| Optional subsystems (analytics, achievements) | `pcall` — game continues if they fail |
| Core game loop | Generally don't — let errors surface |

---

## Wrapping Callbacks for Resilience

For games with mod support or user-generated content, you can wrap LÖVE callbacks so errors in mod code don't crash the entire game:

```lua
-- resilience.lua — wrap a function with error protection
local function protected(fn, fallback)
    return function(...)
        local ok, err = xpcall(fn, function(e)
            return tostring(e) .. "\n" .. debug.traceback("", 2)
        end, ...)
        if not ok then
            print("[ERROR] " .. err)
            if fallback then
                fallback(err)
            end
        end
    end
end

-- Usage: wrap mod callbacks
local mod_update = protected(mod.update, function(err)
    -- Disable the mod on error, keep game running
    mod.enabled = false
    notifications:add("Mod error — disabled: " .. mod.name)
end)
```

**Important:** Don't wrap your core `love.update` and `love.draw` in pcall during development. You want errors to surface immediately so you can fix them. Only use protected calls around untrusted or optional code paths.

---

## Customizing the Error Screen (love.errorhandler)

When an unhandled error reaches LÖVE, it calls `love.errorhandler(msg)`. The default handler shows the blue error screen. You can replace it for shipped games.

### How love.errorhandler Works

`love.errorhandler` receives the error message (string) and must return a function. That function is called repeatedly (like a mini game loop) and receives no arguments. It should process events and render a frame. Return `nil` from the inner function to quit.

```lua
function love.errorhandler(msg)
    -- Reset graphics to a known state
    love.graphics.reset()
    local font = love.graphics.newFont(16)
    love.graphics.setFont(font)

    local fullmsg = "Something went wrong:\n\n" .. tostring(msg)
    local trace = debug.traceback("", 2)

    -- Write crash log to save directory
    local log = fullmsg .. "\n\n" .. trace
    local timestamp = os.date("%Y%m%d_%H%M%S")
    love.filesystem.write("crash_" .. timestamp .. ".log", log)

    return function()
        love.event.pump()
        for name, a in love.event.poll() do
            if name == "quit" then return nil end
            if name == "keypressed" and a == "escape" then return nil end
        end

        love.graphics.clear(0.15, 0.05, 0.05)
        love.graphics.setColor(1, 1, 1)
        love.graphics.printf(fullmsg, 40, 40,
            love.graphics.getWidth() - 80)
        love.graphics.setColor(0.6, 0.6, 0.6)
        love.graphics.printf("Press Escape to quit.\nCrash log saved.",
            40, love.graphics.getHeight() - 80,
            love.graphics.getWidth() - 80)
        love.graphics.present()
    end
end
```

### Key Rules for Error Handlers

1. **Reset graphics state** — call `love.graphics.reset()` first, since the error may have left the graphics pipeline in an unknown state.
2. **Don't try to recover** — `love.errorhandler` is for reporting, not restarting. The game state is likely corrupted. If you need crash recovery, use `pcall` at the gameplay level instead.
3. **Errors in the error handler are silent** — if your custom handler itself throws, LÖVE quits with no message. Keep it simple.
4. **Call `love.graphics.present()`** — the inner function must present each frame.
5. **Process events** — pump and poll events so the window stays responsive.

### Crash Log with System Info

For shipped games, include system details in crash logs:

```lua
local function build_crash_report(msg)
    local info = {}
    table.insert(info, "=== Crash Report ===")
    table.insert(info, "Time: " .. os.date("%Y-%m-%d %H:%M:%S"))
    table.insert(info, "LÖVE: " .. love.getVersion and
        string.format("%d.%d.%d", love.getVersion()) or "unknown")
    table.insert(info, "OS: " .. love.system.getOS())

    local name, version, vendor, device = love.graphics.getRendererInfo()
    table.insert(info, "GPU: " .. tostring(name) .. " " .. tostring(version))

    table.insert(info, "")
    table.insert(info, "Error: " .. tostring(msg))
    table.insert(info, "")
    table.insert(info, debug.traceback("", 2))

    return table.concat(info, "\n")
end
```

---

## Defensive Data Loading

Game data (save files, level files, config) is one of the most common error sources. Always validate:

### Safe JSON Parsing

```lua
local json = require "lib.json"  -- dkjson, lunajson, etc.

--- Load and parse a JSON file safely.
-- Returns the parsed table on success, or nil + error message on failure.
local function load_json(path)
    if not love.filesystem.getInfo(path) then
        return nil, "File not found: " .. path
    end

    local raw, read_err = love.filesystem.read(path)
    if not raw then
        return nil, "Read failed: " .. tostring(read_err)
    end

    local ok, data = pcall(json.decode, raw)
    if not ok then
        return nil, "JSON parse error: " .. tostring(data)
    end

    return data
end

-- Usage
local save, err = load_json("save.json")
if not save then
    print("Failed to load save: " .. err)
    save = default_save()  -- Fall back to defaults
end
```

### Save File Validation

```lua
--- Validate a save file has required fields and sane values.
local function validate_save(data)
    if type(data) ~= "table" then
        return nil, "Save data is not a table"
    end

    -- Check required fields
    local required = {"version", "player", "world"}
    for _, key in ipairs(required) do
        if data[key] == nil then
            return nil, "Missing required field: " .. key
        end
    end

    -- Version check
    if data.version > CURRENT_SAVE_VERSION then
        return nil, "Save from newer game version"
    end

    -- Bounds checking
    if type(data.player.health) == "number" then
        data.player.health = math.max(0,
            math.min(data.player.health, MAX_HEALTH))
    end

    return data
end
```

---

## Defensive Table Access

Lua's biggest footgun is indexing `nil`. Build utility functions for safe access:

```lua
--- Safely index a nested table path.
-- safe_get(t, "a", "b", "c") returns t.a.b.c or nil without error.
local function safe_get(t, ...)
    local current = t
    for i = 1, select("#", ...) do
        if type(current) ~= "table" then
            return nil
        end
        current = current[select(i, ...)]
    end
    return current
end

-- Usage
local dmg = safe_get(entity, "stats", "attack", "damage") or 0
```

---

## Assertions for Development

Use `assert` liberally in development, but consider softening them for release:

```lua
-- dev_assert: crashes in dev, logs in release
local IS_RELEASE = love.filesystem.isFused and love.filesystem.isFused()

local function dev_assert(condition, msg)
    if condition then return condition end
    msg = msg or "Assertion failed"
    if IS_RELEASE then
        print("[WARN] " .. msg .. "\n" .. debug.traceback("", 2))
        return nil
    else
        error(msg, 2)
    end
end

-- Usage — crashes in dev so you fix it, logs in release so players aren't stuck
dev_assert(self.sprite, "Entity missing sprite component")
```

---

## Common Error Patterns and Fixes

### 1. Nil Callback

```lua
-- BAD: crashes if on_complete is nil
self.on_complete()

-- GOOD: guard the call
if self.on_complete then self.on_complete() end
```

### 2. Missing Module

```lua
-- BAD: crashes if the library isn't installed
local serpent = require "serpent"

-- GOOD: optional dependency
local ok, serpent = pcall(require, "serpent")
if not ok then
    serpent = nil
    print("serpent not available — using fallback serializer")
end
```

### 3. Type Coercion Errors

```lua
-- BAD: crashes if score is nil
local display = "Score: " .. score

-- GOOD: tostring handles nil
local display = "Score: " .. tostring(score or 0)
```

### 4. Event Handler Ordering

```lua
-- BAD: love.load hasn't run yet when module loads
local player = game.player  -- nil at require time!

-- GOOD: defer access to runtime
local player
function love.load()
    player = game.player
end
```

---

## Summary

| Technique | When to Use |
|-----------|------------|
| `pcall` / `xpcall` | Untrusted code, optional subsystems, data parsing |
| `love.errorhandler` | Custom crash screen for shipped games (reporting only, not recovery) |
| Defensive data loading | Save files, level data, config, any user-facing I/O |
| `safe_get` / nil guards | Deep table access, optional fields |
| `dev_assert` | Catch logic bugs in dev, degrade gracefully in release |

The goal is not to suppress all errors — it's to let real bugs surface during development while preventing crashes from ruining the player experience in a shipped game.
