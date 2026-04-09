# R6 — Editor Scripting

> **Category:** reference · **Engine:** Defold · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G6 Native Extensions & Build](../guides/G6_native_extensions_and_build.md) · [G13 Debugging & Profiling](../guides/G13_debugging_and_profiling.md)

---

## Overview

Defold's editor scripting system lets you extend the editor with custom commands, lifecycle hooks, UI dialogs, preferences, and language server integrations — all written in Lua. Editor scripts use the `.editor_script` file extension, run in a Lua 5.2 VM inside the editor (via the luaj runtime on the JVM), and have access to a dedicated `editor` API for inspecting and modifying project resources.

This reference covers the editor scripting API as of Defold 1.10.x, including the UI system introduced in recent releases.

---

## File Structure

Editor scripts are `.editor_script` files placed anywhere in your project. Each script must return a module table with optional hook functions:

```lua
-- tools/my_tool.editor_script
local M = {}

function M.get_commands()
    -- Return a list of custom commands (menu items)
    return {}
end

function M.get_language_servers()
    -- Return language server configurations
    return {}
end

function M.get_prefs_schema()
    -- Return preference definitions
    return {}
end

return M
```

All `.editor_script` files are loaded automatically. Scripts in library dependencies are loaded too, making editor extensions distributable through Defold's dependency system.

### Lifecycle Hooks File

Only the script at `/hooks.editor_script` (project root) receives lifecycle callbacks:

```lua
-- /hooks.editor_script
local M = {}

function M.on_build_started(opts)
    -- Called before every build (local or remote)
    -- opts.platform: "x86_64-win32", "arm64-ios", etc.
end

function M.on_build_finished(opts)
    -- Called after build completes
    -- opts.success: boolean
end

function M.on_bundle_started(opts)
    -- Called before bundling
    -- opts.output_directory: string path
    -- opts.platform: target platform
end

function M.on_bundle_finished(opts)
    -- Called after bundling completes
    -- opts.success: boolean
end

function M.on_target_launched(opts)
    -- Called when the game starts via editor
    -- opts.url: the target URL
end

function M.on_target_terminated(opts)
    -- Called when the game process exits
    -- opts.url: the target URL
end

return M
```

---

## Commands (Custom Menu Items)

Commands add items to editor menus. Define them in `get_commands()`:

```lua
function M.get_commands()
    return {
        {
            label = "Generate UUID",
            locations = {"Edit"},
            query = {},
            active = function(opts)
                return true
            end,
            run = function(opts)
                local uuid = generate_uuid()
                print("Generated: " .. uuid)
            end
        }
    }
end
```

### Command Properties

| Property | Type | Description |
|----------|------|-------------|
| `label` | string | Menu item text |
| `locations` | table | Where the command appears: `"Edit"`, `"Assets"`, `"Outline"`, `"Project"`, `"Debug"`, `"Scene"`, `"Bundle"` |
| `query` | table | What selection context the command needs |
| `active` | function | Returns `true` if the command should be enabled |
| `run` | function | Executes the command |

### Query and Selection

Commands can request the current selection:

```lua
{
    label = "Count Nodes",
    locations = {"Outline"},
    query = {
        selection = {
            type = "outline",      -- "resource", "outline", or "scene"
            cardinality = "many"   -- "one" or "many"
        }
    },
    active = function(opts)
        return #opts.selection > 0
    end,
    run = function(opts)
        print("Selected " .. #opts.selection .. " nodes")
        for _, node_id in ipairs(opts.selection) do
            local path = editor.get(node_id, "path")
            print("  " .. tostring(path))
        end
    end
}
```

---

## Core Editor API

### Inspecting Nodes

```lua
-- Read a property from a node
local value = editor.get(node_id, "path")
local text = editor.get(node_id, "text")

-- Check if a property is readable/writable
if editor.can_get(node_id, "position") then
    local pos = editor.get(node_id, "position")
end

if editor.can_set(node_id, "text") then
    -- Property is writable via transact
end
```

### Modifying Resources (Transactions)

All modifications go through `editor.transact()`, which makes them undoable:

```lua
function run(opts)
    local node_id = opts.selection[1]
    editor.transact({
        editor.tx.set(node_id, "text", "New Value"),
        editor.tx.set(node_id, "position", {100, 200, 0}),
    })
end
```

### File Operations

```lua
-- Create a directory (recursive)
editor.create_directory("/assets/generated")

-- Create files from templates (batch, performant)
editor.create_resources({
    {
        path = "/assets/generated/enemy.go",
        content = 'embedded_components {\n  id: "sprite"\n  ...\n}'
    },
    {
        path = "/assets/generated/config.json",
        content = json.encode(config_data)
    }
})

-- Delete a directory
editor.delete_directory("/assets/generated/old")
```

### Running External Tools

```lua
-- Execute a shell command (long-running context only)
local result = editor.execute(
    "python3", "tools/atlas_packer.py",
    "--input", "/assets/sprites",
    "--output", "/assets/packed",
    { reload_resources = true }  -- options table (last arg)
)
-- result: exit code (0 = success)
```

The `reload_resources = true` option tells the editor to refresh its resource view after the command finishes.

### Saving

```lua
-- Persist all unsaved changes
editor.save()
```

### Platform Info

```lua
-- "x86_64-win32", "x86_64-macos", "x86_64-linux", "arm64-macos"
local platform = editor.platform

-- Defold editor version string
local version = editor.version
```

---

## Editable Resource Types

Editor scripts can modify a wide range of resource types through `editor.transact()`:

| Resource | What You Can Edit |
|----------|-------------------|
| **Atlases** | Add/remove images and animation groups |
| **Tilemaps** | Edit layers, set individual tiles via `tilemap.tiles.*` |
| **ParticleFX** | Configure emitters and modifiers |
| **Collision objects** | Manage collision shapes |
| **GUI files** | Edit nodes, layers, fonts, materials, ParticleFX |
| **Game objects** | Add embedded components (sprites, collision, refs) |
| **Collections** | Add game objects and nested collections |
| **game.project** | Read/write project settings |
| **Tilesource** | Edit animations |

---

## Editor Scripts UI (editor.ui)

The `editor.ui` module lets you create interactive dialogs from editor scripts.

### Showing a Dialog

```lua
local result = editor.ui.show_dialog(
    editor.ui.dialog({
        title = "Create Enemy",
        content = editor.ui.vertical({
            padding = editor.ui.PADDING.LARGE,
            children = {
                editor.ui.label({ text = "Enemy name:" }),
                editor.ui.string_field({
                    value = "skeleton",
                    on_value_changed = function() end  -- handled by reactive component
                })
            }
        }),
        buttons = {
            editor.ui.dialog_button({
                text = "Cancel",
                cancel = true
            }),
            editor.ui.dialog_button({
                text = "Create",
                default = true,
                result = "create"
            })
        }
    })
)
-- result: the `result` value of the clicked button, or nil if cancelled
```

### Reactive Components

For dynamic UIs, use `editor.ui.component()` with hooks:

```lua
local create_dialog = editor.ui.component(function(props)
    local name, set_name = editor.ui.use_state("")
    local enemy_type, set_type = editor.ui.use_state("melee")

    -- Memoize a computed value
    local is_valid = editor.ui.use_memo(function()
        return name ~= "" and #name <= 32
    end, name)

    return editor.ui.dialog({
        title = "Create Enemy",
        content = editor.ui.vertical({
            padding = editor.ui.PADDING.LARGE,
            spacing = editor.ui.SPACING.MEDIUM,
            children = {
                editor.ui.heading({ text = "Enemy Configuration", level = "H3" }),
                editor.ui.string_field({
                    value = name,
                    on_value_changed = set_name,
                    issue = (name ~= "" and #name > 32)
                        and { severity = editor.ui.SEVERITY.ERROR,
                              message = "Name too long" }
                        or nil
                }),
                editor.ui.select_box({
                    value = enemy_type,
                    options = {"melee", "ranged", "boss"},
                    on_value_changed = set_type
                }),
            }
        }),
        buttons = {
            editor.ui.dialog_button({ text = "Cancel", cancel = true }),
            editor.ui.dialog_button({
                text = "Create",
                default = true,
                enabled = is_valid,
                result = { name = name, type = enemy_type }
            })
        }
    })
end)

-- In a command's run function:
local result = editor.ui.show_dialog(create_dialog({}))
if result then
    -- result.name, result.type available
end
```

### Available UI Components

**Layout:** `horizontal`, `vertical`, `grid`, `scroll`, `separator`

**Display:** `label`, `heading` (H1-H6), `paragraph` (word-wrapping), `icon`

**Input:** `string_field`, `integer_field`, `number_field`, `select_box`, `check_box`, `button`, `text_button`, `external_file_field`, `resource_field`

**Dialog:** `dialog`, `dialog_button`

### Layout Properties

All layout containers support `padding` and `spacing` with preset constants:

```lua
editor.ui.PADDING.SMALL   -- tight
editor.ui.PADDING.MEDIUM  -- default
editor.ui.PADDING.LARGE   -- spacious

editor.ui.SPACING.SMALL
editor.ui.SPACING.MEDIUM
editor.ui.SPACING.LARGE
```

### Hooks Rules

1. Component functions must be pure — no side effects outside hooks.
2. Props and state are immutable — create new tables rather than mutating.
3. Hooks must be called in the same order every render (no conditional hooks).
4. Only call hooks inside `editor.ui.component()` functions.

---

## Preferences

Define persistent settings for your editor extension:

```lua
function M.get_prefs_schema()
    return {
        ["my_tool.output_path"] = editor.prefs.schema.string({
            default = "/assets/generated",
            label = "Output path"
        }),
        ["my_tool.verbose"] = editor.prefs.schema.boolean({
            default = false,
            label = "Verbose logging"
        })
    }
end

-- Read/write preferences anywhere in your script
local path = editor.prefs.get("my_tool.output_path")
editor.prefs.set("my_tool.verbose", true)

-- Scopes control where prefs are stored:
-- editor.prefs.SCOPE.USER    — per-user (~/.defold/)
-- editor.prefs.SCOPE.PROJECT — per-project (.defold/)
```

---

## Language Server Integration

Register external language servers for code intelligence:

```lua
function M.get_language_servers()
    return {
        {
            languages = {"lua"},
            command = {
                editor.platform:find("win32") and "lua-language-server.exe"
                    or "lua-language-server",
                "--stdio"
            },
            watched_files = {
                { pattern = "**/.luacheckrc" },
                { pattern = "**/.luarc.json" }
            }
        }
    }
end
```

Currently supports diagnostics (errors, warnings) and completions. The language server binary can be distributed via a library dependency using `ext.manifest` to extract platform-specific binaries to `build/plugins/`.

---

## HTTP Server Routes

Extend the editor's built-in HTTP server:

```lua
local http = require "http"

function M.get_http_server_routes()
    return {
        http.server.route("/my-tool/status", "GET", function(request)
            return {
                status = 200,
                headers = { ["Content-Type"] = "application/json" },
                body = json.encode({ status = "ok" })
            }
        end)
    }
end
```

---

## Execution Contexts

Editor scripts run in two contexts:

| Context | Allowed | Not Allowed |
|---------|---------|-------------|
| **Immediate** (UI thread: `active` callbacks) | `editor.get`, `editor.can_get`, `editor.can_set`, `editor.prefs.get` | `editor.execute`, `editor.transact`, `editor.save`, file I/O |
| **Long-running** (`run` callbacks, lifecycle hooks) | Everything | — |

Calling a long-running function from immediate context produces a clear error message.

---

## Restrictions

The Lua 5.2 environment in the editor has these limitations:

- No `debug` package (no `debug.traceback`, `debug.getinfo`, etc.)
- No `os.execute()` — use `editor.execute()` instead
- No `os.tmpname`, `io.tmpfile`, `os.rename`, `os.exit`, `os.setlocale`
- File access is limited to the project directory
- All editor scripts share one Lua environment — namespace your globals carefully

---

## Practical Examples

### Auto-Increment Build Number

```lua
-- /hooks.editor_script
local M = {}

function M.on_bundle_started(opts)
    -- Read current build number from game.project
    local raw = sys.load_resource("/game.project")  -- not available in editor
    -- Instead, use io to read the file
    local f = io.open("game.project", "r")
    if f then
        local content = f:read("*a")
        f:close()
        local build = content:match("build_number = (%d+)")
        if build then
            local new_build = tonumber(build) + 1
            content = content:gsub(
                "build_number = %d+",
                "build_number = " .. new_build
            )
            local out = io.open("game.project", "w")
            out:write(content)
            out:close()
            print("Build number incremented to " .. new_build)
        end
    end
end

return M
```

### Format Lua on Save

```lua
-- format.editor_script
local M = {}

function M.get_commands()
    return {
        {
            label = "Format Lua File",
            locations = {"Assets"},
            query = {
                selection = { type = "resource", cardinality = "one" }
            },
            active = function(opts)
                local path = editor.get(opts.selection[1], "path")
                return path and path:match("%.lua$") or
                       path and path:match("%.script$") or false
            end,
            run = function(opts)
                local path = editor.get(opts.selection[1], "path")
                editor.save()
                local exit_code = editor.execute(
                    "stylua", "." .. path,
                    { reload_resources = true }
                )
                if exit_code ~= 0 then
                    print("stylua failed with exit code " .. exit_code)
                end
            end
        }
    }
end

return M
```

---

## Summary

Editor scripting turns Defold's editor into a customizable IDE. Use commands for project-specific tools (asset generators, code formatters, linters), lifecycle hooks for build automation (version bumping, asset pre-processing), and the UI system for interactive dialogs that collect input before executing complex operations. Since editor scripts ship via library dependencies, your team can share custom tooling the same way you share game code.
