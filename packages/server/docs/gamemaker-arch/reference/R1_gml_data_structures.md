# R1 — GML Data Structures Reference

> **Category:** reference · **Engine:** GameMaker · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Object Events](../guides/G1_object_events.md)

---

## Modern GML Data: Structs, Arrays, and When to Use Legacy DS

GameMaker 2.3+ introduced structs and modernized arrays, replacing most uses of legacy data structures (ds_map, ds_list, ds_grid). **Use structs and arrays for new code.** They are garbage-collected, have cleaner syntax, and work with JSON natively. Legacy DS types still exist for specific cases (grids, priority queues) but should be avoided when a struct or array can do the job.

---

## Arrays

Arrays in GML are dynamic — they grow automatically when you assign to a new index. They are reference types and garbage-collected.

### Creating Arrays

```gml
// Literal syntax
var _inventory = ["Sword", "Shield", "Potion"];

// Empty array
var _empty = [];

// Sized array with default value
var _grid_row = array_create(10, 0);  // [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]

// 2D (array of arrays)
var _map = [];
for (var _y = 0; _y < height; _y++) {
    _map[_y] = array_create(width, TILE_EMPTY);
}
```

### Core Array Functions

| Function | Purpose | Example |
|----------|---------|---------|
| `array_length(arr)` | Number of elements | `array_length([1,2,3])` → `3` |
| `array_push(arr, val, ...)` | Append to end | `array_push(inv, "Key")` |
| `array_pop(arr)` | Remove and return last | `var _last = array_pop(inv)` |
| `array_insert(arr, idx, val)` | Insert at index | `array_insert(inv, 0, "Helm")` |
| `array_delete(arr, idx, num)` | Remove `num` elements at index | `array_delete(inv, 2, 1)` |
| `array_sort(arr, ascending)` | Sort in place | `array_sort(scores, false)` |
| `array_contains(arr, val)` | Check if value exists | `array_contains(tags, "boss")` |
| `array_find_index(arr, func)` | First index matching predicate | See below |
| `array_filter(arr, func)` | New array of matches | See below |
| `array_map(arr, func)` | New array with transformed values | See below |
| `array_reduce(arr, func, init)` | Collapse to single value | See below |
| `array_foreach(arr, func)` | Execute function per element | See below |
| `array_copy(dest, d_idx, src, s_idx, len)` | Copy range between arrays | Low-level copy |
| `array_concat(arr1, arr2, ...)` | Merge arrays into new array | `array_concat(a, b)` |
| `array_reverse(arr)` | Reverse in place | `array_reverse(path)` |
| `array_shuffle(arr)` | Randomize order in place | `array_shuffle(deck)` |

### Functional Array Methods

```gml
var _enemies = [enemy1, enemy2, enemy3, enemy4];

// Find first enemy with health below 50
var _weak_idx = array_find_index(_enemies, function(_e) {
    return _e.hp < 50;
});

// Get all alive enemies
var _alive = array_filter(_enemies, function(_e) {
    return _e.hp > 0;
});

// Get array of enemy names
var _names = array_map(_enemies, function(_e) {
    return _e.name;
});

// Sum all enemy health
var _total_hp = array_reduce(_enemies, function(_sum, _e) {
    return _sum + _e.hp;
}, 0);

// Apply damage to all enemies
array_foreach(_enemies, function(_e) {
    _e.hp -= 10;
});
```

**Note:** The callback functions receive `(value, index)` as arguments. The second argument (index) is optional.

---

## Structs

Structs are key-value containers (like JavaScript objects). They are created with `{}` syntax or via constructors.

### Anonymous Structs

```gml
// Create inline
var _config = {
    screen_width: 1280,
    screen_height: 720,
    fullscreen: false,
    volume: 0.8
};

// Access
var _w = _config.screen_width;         // dot notation
var _v = _config[$ "volume"];           // accessor notation (dynamic key)

// Modify
_config.fullscreen = true;
_config[$ "new_field"] = "hello";       // add new field dynamically

// Check existence
if (variable_struct_exists(_config, "volume")) {
    // ...
}

// Delete field
variable_struct_remove(_config, "new_field");
```

### Constructor Structs (Classes)

Constructors are functions that return a struct when called with `new`. They are GML's equivalent of classes:

```gml
function Vector2(_x, _y) constructor {
    x = _x;
    y = _y;

    // Static methods are shared across all instances (like a prototype)
    static length = function() {
        return sqrt(x * x + y * y);
    };

    static normalize = function() {
        var _len = length();
        if (_len > 0) {
            x /= _len;
            y /= _len;
        }
        return self;  // allow chaining
    };

    static add = function(_other) {
        return new Vector2(x + _other.x, y + _other.y);
    };

    static scale = function(_s) {
        return new Vector2(x * _s, y * _s);
    };

    static toString = function() {
        return $"({x}, {y})";
    };
}

// Usage
var _pos = new Vector2(100, 200);
var _vel = new Vector2(3, -1).normalize().scale(5);
var _new_pos = _pos.add(_vel);
show_debug_message(_new_pos.toString());  // "(115, -25)" or similar
```

### Inheritance

Constructors support single inheritance:

```gml
function Entity(_x, _y) constructor {
    x = _x;
    y = _y;
    hp = 100;

    static take_damage = function(_amount) {
        hp = max(0, hp - _amount);
    };
}

function Enemy(_x, _y, _name) : Entity(_x, _y) constructor {
    name = _name;
    aggro_range = 128;

    static is_in_range = function(_target) {
        return point_distance(x, y, _target.x, _target.y) < aggro_range;
    };
}

var _goblin = new Enemy(200, 150, "Goblin");
_goblin.take_damage(25);  // inherited from Entity
```

### Static Variables and the Static Struct

Every constructor has a **static struct** — a single shared object that all instances reference for `static` members:

```gml
function Projectile(_x, _y, _dir) constructor {
    x = _x;
    y = _y;
    direction = _dir;

    // Instance variable — unique per instance
    speed = 8;

    // Static variable — shared across ALL Projectile instances
    static max_lifetime = 180;  // frames
    static active_count = 0;

    active_count++;

    static destroy = function() {
        active_count--;
    };
}

// Check how many projectiles exist without iterating
show_debug_message(Projectile.active_count);
```

Access the static struct directly: `var _statics = static_get(Projectile);`

---

## Struct Utility Functions

| Function | Purpose | Example |
|----------|---------|---------|
| `variable_struct_exists(s, key)` | Check if field exists | `variable_struct_exists(cfg, "debug")` |
| `variable_struct_get(s, key)` | Get value (or `undefined`) | `variable_struct_get(cfg, "mode")` |
| `variable_struct_set(s, key, val)` | Set or create field | `variable_struct_set(cfg, "fps", 60)` |
| `variable_struct_remove(s, key)` | Delete a field | `variable_struct_remove(cfg, "temp")` |
| `variable_struct_get_names(s)` | Array of all field names | `var _keys = variable_struct_get_names(cfg)` |
| `variable_struct_names_count(s)` | Number of fields | `variable_struct_names_count(cfg)` |
| `static_get(constructor)` | Get the static struct | `static_get(Vector2)` |
| `is_struct(val)` | Check if value is a struct | `is_struct(data)` |
| `instanceof(struct)` | Get constructor name string | `instanceof(_goblin)` → `"Enemy"` |
| `is_instanceof(struct, constr)` | Check against constructor | `is_instanceof(_goblin, Entity)` → `true` |

---

## JSON Serialization

Structs and arrays serialize to JSON natively — no conversion needed:

```gml
// Save
var _save_data = {
    player_name: "Hero",
    level: 12,
    position: { x: 450, y: 320 },
    inventory: ["Sword", "Shield", "Potion"],
    stats: { hp: 85, mp: 40, attack: 22 }
};

var _json_string = json_stringify(_save_data);
// '{"player_name":"Hero","level":12,"position":{"x":450,"y":320},...}'

// Write to file
var _buffer = buffer_create(string_byte_length(_json_string) + 1, buffer_fixed, 1);
buffer_write(_buffer, buffer_string, _json_string);
buffer_save(_buffer, "save_data.json");
buffer_delete(_buffer);

// Load
var _buffer = buffer_load("save_data.json");
var _json_string = buffer_read(_buffer, buffer_string);
buffer_delete(_buffer);

var _loaded = json_parse(_json_string);
show_debug_message(_loaded.player_name);  // "Hero"
```

**Warning:** `json_parse` returns anonymous structs — not constructor instances. If you saved an `Enemy` struct, the loaded version won't have `Enemy`'s static methods. You need to manually reconstruct or use a serialization library like Elephant.

---

## Legacy Data Structures (When They're Still Useful)

| DS Type | Modern Equivalent | Still Useful When |
|---------|-------------------|-------------------|
| `ds_list` | Array | **Never** — arrays are strictly better |
| `ds_map` | Struct | **Never** — structs are strictly better |
| `ds_grid` | Array of arrays | **Yes** — `ds_grid_*` functions provide fast region operations, value lookups across rows/columns, and disk serialization that 2D arrays don't match |
| `ds_priority` | No equivalent | **Yes** — efficient min/max priority queue for pathfinding (A*), AI decision making, event scheduling |
| `ds_stack` | Array (push/pop) | **Rarely** — arrays with `array_push` / `array_pop` work fine |
| `ds_queue` | Array (push/shift) | **Rarely** — unless you need guaranteed O(1) dequeue on large queues |

### ds_grid Example (Tilemap Operations)

```gml
// Create a 100x100 grid for pathfinding costs
var _cost_grid = ds_grid_create(100, 100);
ds_grid_clear(_cost_grid, 1);  // default cost = 1

// Set walls as impassable
ds_grid_set_region(_cost_grid, 10, 10, 20, 15, -1);  // block a rectangle

// Find minimum cost in a region
var _min_cost = ds_grid_get_min(_cost_grid, 0, 0, 50, 50);

// IMPORTANT: ds_grid is NOT garbage-collected — you must free it
ds_grid_destroy(_cost_grid);
```

### ds_priority Example (A* Open List)

```gml
var _open = ds_priority_create();
ds_priority_add(_open, start_node, 0);  // value = node, priority = f-cost

while (!ds_priority_empty(_open)) {
    var _current = ds_priority_delete_min(_open);  // lowest f-cost node
    // ... process node, add neighbors ...
}

ds_priority_destroy(_open);
```

---

## Buffers (Binary Data)

Buffers are raw byte arrays for file I/O, networking, and binary data manipulation:

```gml
// Create buffer: size, type, alignment
var _buf = buffer_create(256, buffer_grow, 1);

// Write data sequentially
buffer_write(_buf, buffer_u8, 1);           // version byte
buffer_write(_buf, buffer_string, "Hero");  // null-terminated string
buffer_write(_buf, buffer_f32, 100.5);      // float
buffer_write(_buf, buffer_s32, -42);        // signed int

// Save to disk
buffer_save(_buf, "data.bin");

// Read back
buffer_seek(_buf, buffer_seek_start, 0);
var _version = buffer_read(_buf, buffer_u8);
var _name = buffer_read(_buf, buffer_string);
var _value = buffer_read(_buf, buffer_f32);

buffer_delete(_buf);
```

### Buffer Types

| Type | Behavior |
|------|----------|
| `buffer_fixed` | Fixed size, fast, can't grow |
| `buffer_grow` | Doubles in size when full, flexible |
| `buffer_wrap` | Wraps around to the start when full (ring buffer) |
| `buffer_fast` | Fixed size, 1-byte alignment only, fastest read/write |

---

## Quick Decision Guide

| I need to... | Use |
|--------------|-----|
| Store a list of items | `Array` — `var _inv = ["Sword", "Shield"]` |
| Store named properties | `Struct` — `var _cfg = { volume: 0.8 }` |
| Create reusable types with methods | `Constructor` — `function Enemy() constructor { ... }` |
| 2D grid with region operations | `ds_grid` |
| Priority queue for pathfinding | `ds_priority` |
| Binary data / file I/O | `buffer` |
| Serialize game state to JSON | `json_stringify` / `json_parse` with structs |
| Share data across all instances of a type | `static` variables in constructors |
