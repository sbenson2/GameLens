# R4 — Modern Data Patterns: Structs, Constructors, and Garbage Collection

> **Category:** reference · **Engine:** GameMaker · **Related:** [R1 GML Data Structures](R1_gml_data_structures.md) · [G6 Structs & State Machines](../guides/G6_structs_state_machines.md) · [E1 Architecture Overview](../architecture/E1_architecture_overview.md)

---

## Why Modern Patterns Matter

GameMaker 2.3+ introduced structs, constructors, static variables, and method binding — features that make GML feel closer to a modern scripting language. Combined with automatic garbage collection, these replace most uses of legacy `ds_map` and `ds_list` with cleaner, safer code. This reference covers the constructor system, inheritance chains, static methods, accessor patterns, and GC behavior.

---

## Constructors

A constructor is a regular GML function marked with the `constructor` keyword. Calling it with `new` creates a struct with the variables and methods defined inside.

```gml
/// @desc A basic item constructor
function Item(_name, _value, _stackable) constructor {
    name = _name;
    value = _value;
    stackable = _stackable;
    quantity = 1;

    /// @func display_name()
    /// @desc Returns the item name with quantity for stackables
    static display_name = function() {
        if (stackable && quantity > 1) {
            return string("{0} x{1}", name, quantity);
        }
        return name;
    };
}

// Usage
var _potion = new Item("Health Potion", 50, true);
_potion.quantity = 5;
show_debug_message(_potion.display_name());  // "Health Potion x5"
```

### Key Rules

| Rule | Detail |
|------|--------|
| **`constructor` keyword** | Must appear after the parameter list: `function Foo() constructor { ... }` |
| **`new` keyword** | Creates the struct, runs the constructor, returns the struct |
| **`self`** | Inside a constructor, `self` refers to the struct being created |
| **No return value** | Constructors should not `return` a value — `new` handles this |
| **Naming convention** | PascalCase for constructors (`EnemyStats`), camelCase for regular functions |

---

## Constructor Inheritance

Child constructors inherit from a parent using `:` syntax. The parent constructor runs first, then the child adds or overrides fields.

```gml
function Entity(_x, _y, _hp) constructor {
    x = _x;
    y = _y;
    hp = _hp;
    max_hp = _hp;

    static take_damage = function(_amount) {
        hp = max(0, hp - _amount);
    };

    static is_alive = function() {
        return hp > 0;
    };
}

/// @desc Enemy inherits from Entity, adds AI behavior
function Enemy(_x, _y, _hp, _speed) : Entity(_x, _y, _hp) constructor {
    speed = _speed;
    state = "idle";

    static update_ai = function() {
        // Enemy-specific AI logic
        switch (state) {
            case "idle":    /* patrol logic */   break;
            case "chase":   /* pursue player */  break;
            case "attack":  /* deal damage */    break;
        }
    };
}

/// @desc Boss overrides take_damage to add armor
function Boss(_x, _y, _hp, _speed, _armor) : Enemy(_x, _y, _hp, _speed) constructor {
    armor = _armor;

    // Override parent method
    static take_damage = function(_amount) {
        var _reduced = max(0, _amount - armor);
        hp = max(0, hp - _reduced);
    };
}

// Usage
var _boss = new Boss(400, 300, 500, 1.5, 10);
_boss.take_damage(25);   // Applies armor reduction (deals 15)
_boss.is_alive();        // true — inherited from Entity
```

### Inheritance Rules

| Rule | Detail |
|------|--------|
| **Parent runs first** | Parent constructor body executes before child body |
| **Arguments forwarded** | You pass arguments to the parent: `: Parent(arg1, arg2)` |
| **Method override** | Re-declaring a `static` method in the child replaces the parent version |
| **`instanceof`** | `_boss instanceof Entity` → `true` (checks full chain) |
| **Single inheritance** | GML does not support multiple inheritance |

---

## Static Variables and the Static Chain

The `static` keyword inside a constructor creates a variable that is shared across all instances of that constructor. Static methods are stored on the constructor's **static struct**, not on each individual instance.

### How the Static Chain Works

When you access a variable on a struct created by a constructor, GML looks up the chain:

1. **Instance struct** — variables set directly on this struct (e.g., `hp = 100`)
2. **Constructor's static struct** — static variables/methods of the constructor
3. **Parent's static struct** — if inheritance is used, walks up the chain

```gml
function Bullet(_dmg) constructor {
    damage = _dmg;

    // Shared across all Bullet instances — created once in memory
    static base_speed = 8;

    // Instance count tracking
    static count = 0;
    ++count;  // Increments the shared counter each time a Bullet is created

    static get_count = function() {
        return count;
    };
}

var _b1 = new Bullet(10);
var _b2 = new Bullet(15);
show_debug_message(Bullet.get_count());  // 2
show_debug_message(_b1.base_speed);      // 8 — found on static struct
```

### Inspecting the Static Chain

```gml
// Get a constructor's static struct
var _statics = static_get(Bullet);

// Check all variables on a struct (including static chain)
var _names = variable_struct_get_names(_b1);

// Check if a variable exists
variable_struct_exists(_b1, "damage");  // true (instance)
variable_struct_exists(_b1, "base_speed");  // true (found via static chain)
```

---

## Replacing Legacy DS Types

Most `ds_map` and `ds_list` usage should be replaced with structs and arrays. Here's a migration guide:

### ds_map → Struct

```gml
// ❌ Legacy: Manual memory management required
var _stats = ds_map_create();
ds_map_add(_stats, "hp", 100);
ds_map_add(_stats, "attack", 25);
var _hp = ds_map_find_value(_stats, "hp");
ds_map_destroy(_stats);  // Must destroy or memory leaks!

// ✅ Modern: Garbage collected, cleaner syntax
var _stats = {
    hp: 100,
    attack: 25,
};
var _hp = _stats.hp;
// No cleanup needed — GC handles it
```

### ds_list → Array

```gml
// ❌ Legacy
var _inventory = ds_list_create();
ds_list_add(_inventory, "Sword");
ds_list_add(_inventory, "Shield");
var _count = ds_list_size(_inventory);
ds_list_destroy(_inventory);

// ✅ Modern
var _inventory = ["Sword", "Shield"];
var _count = array_length(_inventory);
// No cleanup needed
```

### Dynamic Key Access (ds_map replacement)

Structs support dynamic variable access, making them a full replacement for ds_map in most cases:

```gml
var _config = {};

// Dynamic set (like ds_map_add)
variable_struct_set(_config, "volume", 0.8);
variable_struct_set(_config, "fullscreen", true);

// Dynamic get (like ds_map_find_value)
var _vol = variable_struct_get(_config, "volume");

// Check if key exists (like ds_map_exists)
if (variable_struct_exists(_config, "fullscreen")) {
    // ...
}

// Get all keys (like ds_map iteration)
var _keys = variable_struct_get_names(_config);
for (var _i = 0; _i < array_length(_keys); _i++) {
    var _key = _keys[_i];
    var _val = variable_struct_get(_config, _key);
    show_debug_message(string("{0}: {1}", _key, _val));
}

// Remove a key (like ds_map_delete)
variable_struct_remove(_config, "fullscreen");
```

### When to Keep Legacy DS

| DS Type | Still Useful For |
|---------|-----------------|
| `ds_grid` | 2D data with fast regional operations (`ds_grid_get_max`, `ds_grid_set_region`) |
| `ds_priority` | Priority queues (pathfinding open lists, event scheduling) |
| `ds_stack` / `ds_queue` | Strict LIFO/FIFO when you want enforcement, though arrays work fine |

---

## Accessor Chaining

Accessors let you index into nested data structures with compact syntax. In modern GML, this mostly applies to nested arrays and struct+array combos.

```gml
// Array accessor: [@ index]
// Use [@ ] to modify an array directly (avoids copy-on-write in older runtimes)
var _grid = [[1, 2, 3], [4, 5, 6], [7, 8, 9]];
_grid[@ 1][@ 1] = 99;  // Sets [1][1] to 99

// Mixed chaining: struct fields + array accessors
var _party = {
    members: [
        { name: "Knight", hp: 100 },
        { name: "Mage",   hp: 60  },
    ]
};
var _mage_hp = _party.members[1].hp;  // 60

// Deep nested update
_party.members[0].hp -= 20;
```

> **Note on `[@ ]`:** In the modern VM/YYC runtime, arrays are always passed by reference. The `[@]` accessor still works but is mainly needed for compatibility. Standard `[]` works fine for new code.

---

## Garbage Collection

GML's garbage collector (GC) automatically frees memory for structs, arrays, methods, and strings when they are no longer referenced. This eliminates the manual `ds_*_destroy()` calls that plagued legacy code.

### How It Works

1. The GC runs periodically in the background (not every frame).
2. It traces references from roots (global variables, instance variables, local scopes).
3. Any struct/array with zero references is marked for collection.
4. The `delete` keyword de-references a struct and hints the GC to collect it sooner.

### Best Practices

```gml
// Let the GC handle it — just stop referencing
enemy_data = undefined;  // GC will collect the old struct

// Use delete for explicit hint (optional but good practice for large structs)
delete enemy_data;

// Avoid circular references where possible
// The GC CAN handle cycles, but breaking them explicitly is cleaner
var _a = {};
var _b = {};
_a.ref = _b;
_b.ref = _a;
// Both will still be collected when _a and _b go out of scope,
// but clearing refs makes GC's job faster
```

### GC and Instances

| Scenario | GC Behavior |
|----------|-------------|
| Instance destroyed | Instance variables (arrays, structs) become eligible for GC |
| Room end | All instance-owned data from that room is eligible for GC |
| `ds_*` types | **NOT garbage collected** — you must still call `ds_*_destroy()` |
| Surfaces | **NOT garbage collected** — must call `surface_free()` |
| Buffers | **NOT garbage collected** — must call `buffer_delete()` |

### Monitoring GC

```gml
// In a debug overlay or Step event:
var _gc_stats = debug_event("DumpMemory");  // Outputs to console

// Manual GC trigger (rarely needed — only for testing)
gc_collect();

// Check struct reference count (useful for debugging leaks)
// Note: No built-in function for this; use delete + undefined checks
```

---

## Patterns: Putting It All Together

### Factory Pattern with Constructors

```gml
function ItemFactory() constructor {
    static create = function(_type) {
        switch (_type) {
            case "potion":    return new Item("Health Potion", 50, true);
            case "sword":     return new Item("Iron Sword", 200, false);
            case "shield":    return new Item("Wood Shield", 120, false);
            default:
                throw ("Unknown item type: " + _type);
        }
    };
}

global.item_factory = new ItemFactory();
var _item = global.item_factory.create("potion");
```

### Configuration Struct (replacing ds_map + ini_read)

```gml
function GameConfig() constructor {
    // Defaults
    volume_master = 1.0;
    volume_sfx = 0.8;
    volume_music = 0.7;
    fullscreen = false;
    language = "en";

    static save = function(_filename) {
        var _json = json_stringify(self);
        var _buf = buffer_create(string_byte_length(_json), buffer_fixed, 1);
        buffer_write(_buf, buffer_text, _json);
        buffer_save(_buf, _filename);
        buffer_delete(_buf);
    };

    static load = function(_filename) {
        if (!file_exists(_filename)) return;
        var _buf = buffer_load(_filename);
        var _json = buffer_read(_buf, buffer_text);
        buffer_delete(_buf);
        var _data = json_parse(_json);
        var _keys = variable_struct_get_names(_data);
        for (var _i = 0; _i < array_length(_keys); _i++) {
            variable_struct_set(self, _keys[_i], variable_struct_get(_data, _keys[_i]));
        }
    };
}

global.config = new GameConfig();
global.config.load("config.json");
```

---

## Quick Reference: Legacy → Modern

| Legacy | Modern Replacement | Notes |
|--------|-------------------|-------|
| `ds_map_create()` | `{}` or `new MyStruct()` | GC'd, cleaner syntax |
| `ds_map_add(m, k, v)` | `struct.key = v` or `variable_struct_set(s, k, v)` | Dot for known keys, function for dynamic |
| `ds_map_find_value(m, k)` | `struct.key` or `variable_struct_get(s, k)` | Returns `undefined` if missing |
| `ds_map_exists(m, k)` | `variable_struct_exists(s, k)` | |
| `ds_list_create()` | `[]` | |
| `ds_list_add(l, v)` | `array_push(arr, v)` | |
| `ds_list_size(l)` | `array_length(arr)` | |
| `ds_map_destroy()` | Not needed | GC handles it |
| `json_encode(map)` | `json_stringify(struct)` | Works with nested structs/arrays |
| `json_decode(str)` | `json_parse(str)` | Returns struct (not ds_map) |
