# G17 — Automated Testing & CI

> **Category:** guide · **Engine:** Love2D · **Related:** [G1 Game Loop & Callbacks](G1_game_loop_and_callbacks.md) · [G15 Debugging & Profiling](G15_debugging_and_profiling.md) · [R2 Common Libraries](../reference/R2_common_libraries.md)

---

## Why Test a LÖVE Game?

LÖVE's loosely typed Lua codebase and rapid iteration cycle make it easy to introduce regressions — a renamed variable, a broken collision formula, a busted state machine transition. Automated tests catch these before playtesters do. The challenge is that much of your code touches `love.*` APIs (graphics, audio, input) that assume a running window. This guide covers strategies for testing both pure logic and LÖVE-dependent code.

---

## Strategy: Separate Logic from Framework

The single most impactful decision is to keep game logic in pure Lua modules that never call `love.*` directly. These modules are trivially testable with any Lua test runner.

```lua
-- modules/combat.lua  (pure Lua — no love.* imports)
local Combat = {}

function Combat.calculate_damage(base, multiplier, armor)
    local raw = base * multiplier
    local reduced = raw - armor
    return math.max(reduced, 1)  -- minimum 1 damage
end

function Combat.is_critical(roll, crit_chance)
    return roll <= crit_chance
end

return Combat
```

Your LÖVE code then imports and calls these modules:

```lua
-- game/player.lua
local Combat = require("modules.combat")

function Player:attack(target)
    local dmg = Combat.calculate_damage(self.atk, self.buff, target.def)
    target.hp = target.hp - dmg
end
```

This pattern lets you test `Combat` without a running LÖVE window.

---

## Testing Frameworks

### Busted (Recommended for Pure Logic)

[Busted](https://lunarmodules.github.io/busted/) is the most widely used Lua testing framework. It runs on plain Lua or LuaJIT — no LÖVE window required.

**Install:**
```bash
# Requires Lua + Luarocks
luarocks install busted
```

**Write tests:**
```lua
-- spec/combat_spec.lua
local Combat = require("modules.combat")

describe("Combat", function()
    describe("calculate_damage", function()
        it("applies base * multiplier - armor", function()
            assert.are.equal(17, Combat.calculate_damage(10, 2.0, 3))
        end)

        it("enforces minimum 1 damage", function()
            assert.are.equal(1, Combat.calculate_damage(5, 1.0, 100))
        end)
    end)

    describe("is_critical", function()
        it("returns true when roll <= crit_chance", function()
            assert.is_true(Combat.is_critical(0.05, 0.10))
        end)

        it("returns false when roll > crit_chance", function()
            assert.is_false(Combat.is_critical(0.50, 0.10))
        end)
    end)
end)
```

**Run:**
```bash
busted spec/
# ●●●● 4 successes / 0 failures / 0 errors
```

**Gotcha:** Busted runs under plain Lua, so any `require` that transitively touches `love.*` will fail. This is why separating logic from framework code matters.

### Mocking love.* for Busted

When you must test code that references `love.*`, create a minimal mock:

```lua
-- spec/helpers/love_mock.lua
-- Stub just enough of the love namespace for your tests
_G.love = {
    graphics = {
        getWidth  = function() return 800 end,
        getHeight = function() return 600 end,
    },
    timer = {
        getTime = function() return os.clock() end,
    },
    filesystem = {
        getInfo = function() return nil end,
    },
}
```

Load the mock before your test requires:
```lua
-- spec/ui_spec.lua
require("spec.helpers.love_mock")
local HUD = require("game.hud")

describe("HUD", function()
    it("positions health bar within screen bounds", function()
        local bar = HUD.create_health_bar()
        assert.is_true(bar.x + bar.width <= 800)
    end)
end)
```

### Cute (Runs Inside LÖVE)

[Cute](https://github.com/gtrogers/Cute) is a micro testing framework that runs tests inside a LÖVE window, giving you full access to `love.*` APIs. Useful for integration tests that exercise rendering, audio, or physics.

```lua
-- test/main.lua  (a separate LÖVE project for tests)
local cute = require("cute")
local Combat = require("modules.combat")

function love.load()
    cute.suite("Combat Tests", function()
        cute.case("damage calculation", function()
            cute.check(Combat.calculate_damage(10, 2.0, 3) == 17)
        end)
    end)

    cute.go()  -- runs all suites, prints results, then love.event.quit()
end
```

Run headless on a CI server with a virtual framebuffer:
```bash
xvfb-run love test/
```

---

## What to Test (and What Not To)

| Test | Approach | Why |
|------|----------|-----|
| Damage formulas, state machines, pathfinding | Busted (pure Lua) | Pure logic, fast, no mocks needed |
| Inventory add/remove, save/load serialization | Busted (pure Lua) | Data operations with no rendering |
| Collision response between physics bodies | Cute (in-engine) | Needs Box2D world to step |
| Shader compilation | Cute (in-engine) | Needs `love.graphics` context |
| "Does the title screen look right?" | Manual playtesting | Visual correctness is subjective |

**Rule of thumb:** If a module can be `require`d without `love.*`, test it with Busted. If it needs a running engine, test it with Cute or skip to manual QA.

---

## Project Structure for Testing

```
my-game/
├── main.lua              -- LÖVE entry point
├── conf.lua
├── modules/              -- Pure Lua (testable with Busted)
│   ├── combat.lua
│   ├── inventory.lua
│   └── state_machine.lua
├── game/                 -- LÖVE-dependent code
│   ├── player.lua
│   ├── hud.lua
│   └── scenes/
├── spec/                 -- Busted tests
│   ├── helpers/
│   │   └── love_mock.lua
│   ├── combat_spec.lua
│   └── inventory_spec.lua
├── test/                 -- Cute tests (run inside LÖVE)
│   └── main.lua
└── .busted               -- Busted config (optional)
```

Optional `.busted` config:
```lua
return {
    default = {
        ROOT = { "spec" },
        pattern = "_spec",
        lpath = "modules/?.lua;game/?.lua",
    },
}
```

---

## CI with GitHub Actions

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Lua & Busted
        run: |
          sudo apt-get update
          sudo apt-get install -y lua5.4 luarocks
          sudo luarocks install busted

      - name: Run unit tests
        run: busted spec/

  integration-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install LÖVE
        run: |
          sudo add-apt-repository ppa:bartbes/love-stable -y
          sudo apt-get update
          sudo apt-get install -y love xvfb

      - name: Run in-engine tests
        run: xvfb-run love test/
```

### GitLab CI Alternative

```yaml
# .gitlab-ci.yml
test:
  image: ubuntu:22.04
  before_script:
    - apt-get update && apt-get install -y lua5.4 luarocks
    - luarocks install busted
  script:
    - busted spec/
```

---

## Linting with Luacheck

Add static analysis alongside tests to catch common Lua mistakes:

```bash
luarocks install luacheck
luacheck modules/ game/ --std luajit --globals love
```

Sample `.luacheckrc`:
```lua
std = "luajit"
globals = { "love" }
max_line_length = 120

-- Ignore unused self in methods
ignore = { "212/self" }

-- Exclude third-party code
exclude_files = { "lib/*" }
```

---

## Tips

- **Test deterministically.** Seed `love.math.setRandomSeed()` or inject RNG objects so tests produce repeatable results.
- **Use `love.event.quit()` at the end of Cute test runs** so CI doesn't hang waiting for a window close.
- **Keep `spec/` tests fast.** They should run in under a second. Move anything that needs a physics step to Cute integration tests.
- **Coverage:** Use `luacov` with Busted (`busted --coverage spec/`) to identify untested code paths. Focus coverage on game-critical systems like save data, combat, and economy.
- **Snapshot testing for data:** Serialize game state to JSON and compare against known-good snapshots for complex systems like level generation.
