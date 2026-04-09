# G17 — Testing and Quality Assurance

> **Category:** guide · **Engine:** Defold · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G13 Debugging & Profiling](G13_debugging_and_profiling.md) · [G15 Lua Scripting Patterns](G15_lua_scripting_patterns.md)

---

## Why Test in Defold?

Defold's Lua scripting is dynamically typed and built on message passing — two traits that make runtime bugs easy to introduce and hard to catch. A lightweight test suite catches regressions in game logic (damage formulas, inventory rules, state machines) without launching the full engine every time.

---

## Testing Strategy

Not all Defold code is equally testable. Structure your project accordingly:

| Layer | Testability | Approach |
|-------|-------------|----------|
| **Pure Lua modules** (math, data, state machines) | High | Unit test with DefTest |
| **Script lifecycle** (`init`, `update`, `on_message`) | Medium | Integration test via test collections |
| **Visual / GUI rendering** | Low | Manual QA or screenshot comparison |
| **Platform-specific** (IAP, push notifications) | Low | Device testing, staging environments |

**Key principle:** extract complex logic into standalone Lua modules that don't depend on Defold APIs (`go.*`, `msg.*`, `gui.*`). These modules are trivially unit-testable.

```lua
-- modules/combat.lua — pure Lua, no Defold dependencies
local M = {}

function M.calculate_damage(attacker, defender)
    local raw = attacker.strength * attacker.weapon_bonus
    local mitigated = math.max(1, raw - defender.armor)
    return math.floor(mitigated)
end

function M.is_critical(roll, crit_chance)
    return roll <= crit_chance
end

return M
```

---

## DefTest: The Standard Testing Framework

[DefTest](https://github.com/britzl/deftest) is the community-standard unit testing framework for Defold, built on the Telescope test runner.

### Installation

Add DefTest as a dependency in `game.project`:

```ini
[project]
dependencies = https://github.com/britzl/deftest/archive/master.zip
```

### Project Structure

Create a dedicated test collection that runs as the bootstrap collection during testing:

```
/test/
  test.collection          -- Bootstrap collection for tests
  test.script              -- Entry point that loads and runs tests
  test_combat.lua          -- Test module for combat logic
  test_inventory.lua       -- Test module for inventory logic
```

### Writing Tests

Tests are Lua modules that return a function containing `describe` / `test` blocks:

```lua
-- test/test_combat.lua
local combat = require "modules.combat"

return function()
    describe("damage calculation", function()
        test("basic damage applies strength and weapon bonus", function()
            local attacker = { strength = 10, weapon_bonus = 1.5 }
            local defender = { armor = 3 }
            local dmg = combat.calculate_damage(attacker, defender)
            assert_equal(dmg, 12)  -- floor(10 * 1.5 - 3) = 12
        end)

        test("damage is always at least 1", function()
            local attacker = { strength = 1, weapon_bonus = 1.0 }
            local defender = { armor = 100 }
            local dmg = combat.calculate_damage(attacker, defender)
            assert_equal(dmg, 1)
        end)

        test("critical hit detection", function()
            assert_true(combat.is_critical(5, 10))    -- 5 <= 10
            assert_false(combat.is_critical(15, 10))   -- 15 > 10
        end)
    end)
end
```

### Test Runner Script

The entry point script loads all test modules and runs them:

```lua
-- test/test.script
local deftest = require "deftest.deftest"
local test_combat = require "test.test_combat"
local test_inventory = require "test.test_inventory"

function init(self)
    deftest.add(test_combat)
    deftest.add(test_inventory)
    deftest.run()
end
```

### Assertions

DefTest provides these assertions via Telescope:

| Assertion | Purpose |
|-----------|---------|
| `assert_equal(a, b)` | Equality (`==`) |
| `assert_not_equal(a, b)` | Inequality |
| `assert_true(a)` / `assert_false(a)` | Boolean checks |
| `assert_nil(a)` / `assert_not_nil(a)` | Nil checks |
| `assert_greater_than(a, b)` | `a > b` |
| `assert_less_than(a, b)` | `a < b` |
| `assert_type(a, "string")` | Type validation |
| `assert_error(fn)` | Function raises an error |
| `assert_match(pattern, str)` | Lua pattern match |
| `assert_same(a, b)` | Deep table comparison |

### Setup and Teardown

```lua
describe("inventory", function()
    local inv

    before(function()
        inv = inventory.new(20)  -- Fresh inventory before each test
    end)

    after(function()
        inv = nil
    end)

    test("starts empty", function()
        assert_equal(inv:count(), 0)
    end)

    test("add item increases count", function()
        inv:add("sword", 1)
        assert_equal(inv:count(), 1)
    end)
end)
```

---

## Running Tests

### Locally (GUI)

1. Set your test collection as the bootstrap collection in `game.project`:
   ```ini
   [bootstrap]
   main_collection = /test/test.collection
   ```
2. Build and run normally — test results print to the console.
3. Switch `main_collection` back to your game collection when done.

### Headless (CI/CD)

DefTest includes a `run.sh` script that downloads a headless Defold engine (dmengine_headless) and runs tests without a display:

```bash
#!/bin/bash
# Adapted from DefTest's run.sh

BOB_URL="https://d.defold.com/stable/latest/bob/bob.jar"

# Download build tool if needed
if [ ! -f bob.jar ]; then
    curl -L -o bob.jar "$BOB_URL"
fi

# Build and run tests headlessly
java -jar bob.jar --variant=headless \
    --settings test/testing.settings \
    clean build
```

Create a `test/testing.settings` file that overrides the bootstrap collection:

```ini
[bootstrap]
main_collection = /test/test.collection
```

This keeps your main `game.project` pointing to your game while CI runs tests.

### Filtering Tests

Run a subset of tests by passing a Lua pattern:

```lua
deftest.run({ pattern = "damage" })  -- Only tests matching "damage"
```

---

## Integration Testing with Collections

Some behavior can only be tested with actual game objects. Use **collection proxies** to load isolated test scenes:

```lua
-- test/test_integration.lua
return function()
    describe("enemy spawner", function()
        test("spawns correct number of enemies", function(done)
            -- Load a test collection with a spawner
            msg.post("#test_level_proxy", "load")
            -- Use a coroutine or callback to wait for load
            -- then inspect the spawned game objects
        end)
    end)
end
```

**Caveat:** Integration tests are harder to write and slower to run. Reserve them for testing interactions between game objects (message passing chains, collision responses, spawning logic). Keep the bulk of your tests as pure-Lua unit tests.

---

## Code Coverage

DefTest supports code coverage via LuaCov:

```lua
deftest.run({
    coverage = {
        enabled = true,
        -- Optional: filter to your source files
        include = { "modules/.*" },
    }
})
```

This generates:
- `luacov.report.out` — human-readable coverage report
- `luacov.stats.out` — raw data for CI dashboards (Codecov, Coveralls)

---

## CI/CD Pipeline Example

### GitHub Actions

```yaml
name: Defold Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Java
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 17

      - name: Download Bob
        run: curl -L -o bob.jar "https://d.defold.com/stable/latest/bob/bob.jar"

      - name: Run Tests
        run: |
          java -jar bob.jar --variant=headless \
            --settings test/testing.settings \
            clean build

      - name: Upload Coverage
        if: success()
        uses: codecov/codecov-action@v4
        with:
          files: luacov.report.out
```

### GitLab CI

```yaml
test:
  image: eclipse-temurin:17-jdk
  script:
    - curl -L -o bob.jar "https://d.defold.com/stable/latest/bob/bob.jar"
    - java -jar bob.jar --variant=headless --settings test/testing.settings clean build
  artifacts:
    paths:
      - luacov.report.out
```

---

## Testing Patterns for Defold-Specific Code

### Testing State Machines

State machines are common in Defold games. Extract the logic into a module:

```lua
-- modules/fsm.lua
local M = {}

function M.new(initial_state, transitions)
    return {
        current = initial_state,
        transitions = transitions,
        transition = function(self, event)
            local key = self.current .. ":" .. event
            local next_state = self.transitions[key]
            if next_state then
                self.current = next_state
                return true
            end
            return false
        end,
    }
end

return M
```

```lua
-- test/test_fsm.lua
local fsm = require "modules.fsm"

return function()
    describe("enemy FSM", function()
        local enemy_fsm

        before(function()
            enemy_fsm = fsm.new("idle", {
                ["idle:player_spotted"]   = "chase",
                ["chase:player_lost"]     = "idle",
                ["chase:in_range"]        = "attack",
                ["attack:cooldown_done"]  = "chase",
            })
        end)

        test("starts in idle", function()
            assert_equal(enemy_fsm.current, "idle")
        end)

        test("transitions to chase on player_spotted", function()
            enemy_fsm:transition("player_spotted")
            assert_equal(enemy_fsm.current, "chase")
        end)

        test("rejects invalid transitions", function()
            local ok = enemy_fsm:transition("in_range")  -- invalid from idle
            assert_false(ok)
            assert_equal(enemy_fsm.current, "idle")
        end)
    end)
end
```

### Mocking Defold APIs

When you must test code that calls Defold APIs, create thin wrappers:

```lua
-- modules/sound_player.lua
local M = {}

-- Default implementation uses Defold API
M.play_sound = function(url)
    msg.post(url, "play_sound")
end

function M.play_effect(effect_name)
    local url = "/sounds#" .. effect_name
    M.play_sound(url)
    return url
end

return M
```

```lua
-- In tests, replace the implementation
local sound_player = require "modules.sound_player"

return function()
    describe("sound player", function()
        local played_sounds = {}

        before(function()
            played_sounds = {}
            sound_player.play_sound = function(url)
                table.insert(played_sounds, url)
            end
        end)

        test("play_effect posts to correct URL", function()
            sound_player.play_effect("explosion")
            assert_equal(#played_sounds, 1)
            assert_equal(played_sounds[1], "/sounds#explosion")
        end)
    end)
end
```

---

## Common Pitfalls

**Testing scripts directly** — Don't try to unit-test `.script` files by requiring them. They depend on Defold's lifecycle (`init`, `update`, `on_message`) and won't run outside the engine. Extract the logic into modules instead.

**Forgetting to reset state** — Lua modules are cached after the first `require`. If a module has mutable state, tests can leak into each other. Always reset state in `before()` blocks.

**Over-mocking** — If you find yourself mocking five Defold APIs to test one function, the function is too coupled to the engine. Refactor to separate pure logic from Defold glue code.

**Skipping CI** — Running tests locally is good; running them on every push is better. Defold's headless engine makes CI straightforward — there's no excuse to skip it.
