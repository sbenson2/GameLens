# G16 — Teal: Type-Safe Scripting

> **Category:** guide · **Engine:** Defold · **Related:** [G15 Lua Scripting Patterns](G15_lua_scripting_patterns.md) · [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [R1 API Reference](../reference/R1_api_reference.md)

---

## Why Teal?

Lua is dynamically typed — fast to write, but errors surface at runtime instead of at edit time. Mistype a field name, pass a number where a string is expected, or forget a nil check, and you won't know until the game crashes. As a Defold project grows beyond a few scripts, these bugs multiply.

**Teal** is a statically-typed dialect of Lua. It compiles to standard Lua but adds type annotations, generics, and compile-time checks. Defold has official first-class Teal support via the `extension-teal` library, which integrates type checking directly into the Defold editor and build pipeline.

What you get:

- **Compile-time type errors** — catch `nil` access, wrong argument types, and missing fields before running
- **Editor autocompletion** — the Teal language server provides completions, hover docs, and diagnostics in the Defold editor
- **Gradual adoption** — Teal files coexist with Lua files; migrate one script at a time
- **Zero runtime cost** — Teal compiles to plain Lua, identical performance

---

## Setup

### 1. Add the Extension

Add the Teal extension as a dependency in `game.project`:

```ini
[project]
dependencies#0 = https://github.com/defold/extension-teal/archive/refs/tags/v1.4.0.zip
```

Fetch libraries (Project > Fetch Libraries) to download the extension.

### 2. Create tlconfig.lua

Create a `tlconfig.lua` file in your project root. This configures the Teal compiler:

```lua
return {
    gen_target = "5.1",                -- Defold uses Lua 5.1
    include_dir = { "." },             -- Search paths for .tl files
    global_env_def = "defold",         -- Load Defold type definitions
}
```

The `defold` global environment definition is provided by the extension and includes type declarations for all Defold APIs (`go`, `msg`, `gui`, `vmath`, `sys`, etc.).

### 3. Create Your First .tl File

Create a script with the `.tl` extension instead of `.lua`:

```teal
-- scripts/player.tl

-- Type annotations on go.property equivalents
local speed: number = 200
local health: integer = 100
local player_name: string = "Hero"

function init(self: any)
    msg.post(".", "acquire_input_focus")
    self.vel = vmath.vector3(0, 0, 0)
end

function update(self: any, dt: number)
    local pos = go.get_position()
    pos = pos + self.vel * dt
    go.set_position(pos)
    self.vel = vmath.vector3(0, 0, 0)
end

function on_input(self: any, action_id: hash, action: any): boolean
    if action_id == hash("move_right") then
        self.vel.x = speed
    elseif action_id == hash("move_left") then
        self.vel.x = -speed
    end
    return false
end
```

### 4. Attach to a Game Object

In Defold's editor, attach the `.tl` script component to a game object just like a `.script` file. The extension handles transpilation during the build — the engine receives standard Lua.

---

## Teal Type System Essentials

### Basic Types

```teal
local name: string = "Goblin"
local hp: integer = 50
local speed: number = 3.5
local alive: boolean = true
local data: any               -- opt-out of type checking
```

### Records (Structs)

Records are Teal's equivalent of typed tables:

```teal
local record Enemy
    id: integer
    name: string
    hp: integer
    max_hp: integer
    position: vector3
    tags: {string}              -- array of strings
end

local function create_enemy(name: string, hp: integer): Enemy
    return {
        id = math.random(1, 99999),
        name = name,
        hp = hp,
        max_hp = hp,
        position = vmath.vector3(0, 0, 0),
        tags = {},
    }
end
```

### Enums

```teal
local enum GameState
    "menu"
    "playing"
    "paused"
    "game_over"
end

local current_state: GameState = "menu"

local function transition(new_state: GameState)
    print("State: " .. current_state .. " -> " .. new_state)
    current_state = new_state
end

transition("playing")        -- OK
transition("invalid")        -- COMPILE ERROR: "invalid" is not a valid GameState
```

### Generics

```teal
local record Pool<T>
    items: {T}
    available: {integer}
end

local function pool_get<T>(pool: Pool<T>): T
    local idx = table.remove(pool.available)
    if idx then
        return pool.items[idx]
    end
    return nil
end
```

### Union Types

```teal
local type Callback = function(boolean) | function(boolean, string)

local function on_complete(result: boolean, error_msg?: string)
    if error_msg then
        print("Error: " .. error_msg)
    end
end
```

---

## Typed Message Passing

Defold's message-passing system is stringly typed in Lua. Teal lets you add safety:

```teal
-- messages.tl — shared message type definitions
local record Messages
    record TakeDamage
        amount: integer
        source_id: hash
    end

    record Heal
        amount: integer
    end

    record SetTarget
        target_url: url
    end
end

return Messages
```

```teal
-- scripts/enemy.tl
local Messages = require("messages")

function on_message(self: any, message_id: hash, message: any, sender: url)
    if message_id == hash("take_damage") then
        local data = message as Messages.TakeDamage
        self.hp = self.hp - data.amount
        if self.hp <= 0 then
            go.delete()
        end
    elseif message_id == hash("heal") then
        local data = message as Messages.Heal
        self.hp = math.min(self.hp + data.amount, self.max_hp)
    end
end
```

The `as` cast tells Teal the shape of the message table. If you access a field that doesn't exist on `TakeDamage`, Teal flags it at compile time.

---

## Gradual Migration Strategy

You don't need to convert everything at once. Teal and Lua coexist in the same project.

**Phase 1 — Shared modules first.** Convert utility modules and data definitions (items, stats, message types) to `.tl`. These are imported everywhere and benefit most from type checking.

**Phase 2 — New scripts in Teal.** Write all new game object scripts as `.tl` files. Existing `.lua` scripts continue working untouched.

**Phase 3 — Migrate critical scripts.** Convert scripts that have historically caused bugs — complex state machines, networking code, save/load systems.

**Phase 4 — Full Teal (optional).** Convert remaining scripts. At this point the Teal compiler catches cross-module type mismatches.

To import Lua modules from Teal, create a `.d.tl` declaration file:

```teal
-- lib/utils.d.tl  (type declarations for lib/utils.lua)
local record utils
    clamp: function(value: number, min: number, max: number): number
    lerp: function(a: number, b: number, t: number): number
    round: function(x: number): integer
end

return utils
```

---

## Editor Integration

With the Teal extension installed, the Defold editor provides:

- **Real-time diagnostics** — red squiggles on type errors as you type
- **Autocompletion** — field names, function signatures, and Defold API suggestions
- **Hover information** — see inferred types by hovering over variables
- **Format on save** — automatic code formatting via the Teal language server

The language server runs alongside the editor and watches `.tl` files for changes. No separate terminal process is needed.

---

## Limitations and Gotchas

- **`self` is typed as `any` in lifecycle callbacks.** Defold injects `self` with script properties and user data at runtime. Teal can't infer its shape, so you type it as `any` and lose checking on `self.*` fields. A workaround is to define a record for your self-table and cast: `local s = self as PlayerSelf`.

- **`hash()` returns an opaque type.** Teal can't check that `hash("take_damage")` matches a real message name. Centralizing message hashes in a constants module helps.

- **`go.property` is not supported in .tl files.** Use the script properties system in the editor or define defaults in `init()` instead.

- **Build time increases slightly** with many `.tl` files, since transpilation runs on every build. In practice this adds 1-3 seconds for projects with hundreds of scripts.

- **Third-party Lua libraries** need `.d.tl` declaration files to be type-checked. The community maintains declarations for popular Defold libraries, but niche libraries may require writing your own.

---

## Quick Reference

| Lua | Teal equivalent |
|-----|-----------------|
| `local x = 5` | `local x: integer = 5` |
| `local t = {}` | `local t: {string:integer} = {}` |
| `function foo(a, b)` | `function foo(a: number, b: string): boolean` |
| `-- no equivalent` | `local record Foo ... end` |
| `-- no equivalent` | `local enum State ... end` |
| `-- any table` | `local data: {string:any}` |

---

## Further Reading

- [Official Teal language documentation](https://github.com/teal-language/tl)
- [Defold extension-teal repository](https://github.com/defold/extension-teal)
- [Towards First-Class Teal Support — Defold blog](https://defold.com/2025/09/11/Towards-First-Class-Teal-Support/)
- [Defold API type definitions](https://github.com/defold/extension-teal) (bundled with the extension)
