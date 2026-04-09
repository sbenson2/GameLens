# E1 — GameMaker Architecture Overview

> **Category:** explanation · **Engine:** GameMaker · **Related:** [G1 Object Events](../guides/G1_object_events.md) · [G2 Room Design](../guides/G2_room_design.md)

---

## Core Philosophy: Objects, Events, and Rooms

GameMaker is a 2D-focused game engine built around three fundamental concepts:

1. **Objects** — behavioral blueprints. An Object defines what something *does* via a set of events (Create, Step, Draw, Destroy, Alarm, Collision, etc.). Objects are not visible on their own — they become visible when assigned a Sprite.
2. **Instances** — living copies of Objects placed into Rooms. Each instance has its own variables, position, and state. You can create hundreds of instances from the same Object, and each behaves independently.
3. **Rooms** — the containers where gameplay happens. A Room is a layered canvas: background layers, tile layers, instance layers, and asset layers stacked together. The game progresses by transitioning between Rooms.

This is fundamentally different from node-tree engines (Godot) or scene-graph frameworks (Phaser). In GameMaker, **Objects ARE the behavior definitions**, **Rooms ARE the levels**, and **Events ARE the code entry points**.

---

## The Game Loop: Event Execution Order

GameMaker runs a fixed game loop each frame (default 60 FPS). Understanding event order is critical for writing correct code:

```
Begin Step
├── Alarm events (0–11, if triggered)
├── Keyboard / Mouse / Gamepad input events
Step
├── Collision events
End Step
├── Draw Begin
├── Draw (per instance, per view)
├── Draw End
├── Draw GUI Begin
├── Draw GUI
├── Draw GUI End
```

### Key Rules

- **Create** fires once when an instance is spawned (via Room Editor placement or `instance_create_layer()`).
- **Step** fires every frame — this is where movement, AI, state machines, and input processing belong.
- **Draw** fires every frame after Step — only rendering code goes here. Once you define *any* Draw event on an Object, GameMaker stops auto-drawing its sprite; you must call `draw_self()` explicitly.
- **Destroy** fires when `instance_destroy()` is called — use for cleanup, scoring, particle bursts.
- **Alarm[0–11]** — 12 countdown timers per instance. Set `alarm[n] = frames` and the corresponding Alarm event fires when the counter hits 0.

---

## Objects and Instances

### Object Definition

An Object in GameMaker is a collection of event scripts plus metadata:

```
obj_player/
├── Create_0.gml        # Instance variable initialization
├── Step_0.gml          # Per-frame logic (movement, state)
├── Draw_0.gml          # Custom rendering
├── Collision_obj_enemy.gml  # Collision with specific object
├── Alarm_0.gml         # Timer callback
└── obj_player.yy       # Metadata (sprite, parent, physics, etc.)
```

### Instance Variables vs Global

```gml
// Create_0.gml — instance variables (preferred)
hp = 100;
max_hp = 100;
state = PLAYER_STATE.IDLE;

// Global — use sparingly for truly shared state
global.score = 0;
global.high_score = 0;
```

### Object Parenting

Objects can inherit from a parent Object. The child inherits all events from the parent unless explicitly overridden. This is GameMaker's primary code-reuse mechanism:

```
obj_entity (parent)
├── obj_player (child — inherits collision, draw)
├── obj_enemy (child — overrides Step with AI)
└── obj_npc (child — overrides Step with dialogue)
```

Call `event_inherited()` in a child event to execute the parent's version of that event before running child-specific code.

---

## Rooms and Layers

### Room Structure

A Room is a layered composition:

| Layer Type | Purpose | Example |
|------------|---------|---------|
| **Instances** | Game objects that run code | `obj_player`, `obj_enemy` |
| **Tiles** | Grid-based level geometry from a tileset | Platforms, walls, terrain |
| **Assets** | Static sprites (no code, no collision) | Trees, decorations |
| **Backgrounds** | Scrolling/repeating images | Sky, parallax mountains |
| **Effect** | Real-time shader effects | Screen distortion, color grading |

Layers have a depth value — lower depth draws on top. You can create and manipulate layers at runtime:

```gml
// Create a new layer at runtime
var _layer = layer_create(100, "DynamicEnemies");
instance_create_layer(x, y, _layer, obj_enemy);
```

### Room Transitions

```gml
// Go to a named room
room_goto(rm_level_02);

// Go to the next room in resource order
room_goto_next();

// Restart current room
room_restart();
```

The **Room Start** event fires on all instances when a new room loads — use it for per-room initialization.

---

## GML Language Essentials

### Type System

GML is dynamically typed with two fundamental types: **reals** (numbers, including booleans) and **strings**. Arrays, structs, and ds_* data structures are reference types.

### Modern GML Features (2.3+)

```gml
// Named functions (preferred over script-level implicit functions)
function clamp_value(_val, _min, _max) {
    return clamp(_val, _min, _max);
}

// Constructors and structs
function Enemy(_name, _hp) constructor {
    name = _name;
    hp = _hp;
    
    static take_damage = function(_amount) {
        hp = max(0, hp - _amount);
    };
}

var boss = new Enemy("Dragon", 500);
boss.take_damage(50);

// Chained accessors
var nested = { inventory: { slot: [10, 20, 30] } };
var val = nested.inventory.slot[1]; // 20

// Anonymous functions / lambdas
var sorter = function(_a, _b) { return _a.hp - _b.hp; };
array_sort(enemy_list, sorter);

// Try-catch
try {
    var result = some_risky_operation();
} catch (e) {
    show_debug_message(e.message);
}
```

### Feather (Static Analysis)

GameMaker's built-in linter, Feather, provides type-hinting via JSDoc-style comments:

```gml
/// @param {Real} _x  Horizontal position
/// @param {Real} _y  Vertical position
/// @returns {Id.Instance}
function spawn_enemy(_x, _y) {
    return instance_create_layer(_x, _y, "Instances", obj_enemy);
}
```

Enable Feather in **Game Options → Main** for real-time error detection and autocompletion.

---

## Surfaces, Shaders, and Particles

### Surfaces

Surfaces are off-screen render targets. Use them for lighting effects, minimap rendering, or post-processing:

```gml
// Create and draw to a surface
if (!surface_exists(light_surface)) {
    light_surface = surface_create(room_width, room_height);
}
surface_set_target(light_surface);
draw_clear_alpha(c_black, 0);
// draw lights here
surface_reset_target();

// Apply the surface with blend mode
gpu_set_blendmode(bm_add);
draw_surface(light_surface, 0, 0);
gpu_set_blendmode(bm_normal);
```

**Critical:** Surfaces are *volatile* — they can be freed from memory at any time (e.g., on window resize or alt-tab). Always check `surface_exists()` before drawing.

### Particle System

GameMaker has a built-in particle system for fire, smoke, sparks, and similar effects:

```gml
// Create_0.gml
part_sys = part_system_create();
part_type = part_type_create();
part_type_shape(part_type, pt_shape_pixel);
part_type_life(part_type, 30, 60);
part_type_speed(part_type, 1, 3, -0.05, 0);
part_type_color3(part_type, c_yellow, c_orange, c_red);
part_type_alpha3(part_type, 1, 0.8, 0);

// Step_0.gml — emit particles
part_particles_create(part_sys, x, y, part_type, 5);
```

---

## Platform Export Pipeline

GameMaker compiles to native executables for each platform via a target-specific runtime (YYC for C++ compilation, VM for the interpreted runtime):

| Target | Runtime | Notes |
|--------|---------|-------|
| Windows | VM or YYC | YYC is ~10x faster but longer compile |
| HTML5 | JS (VM only) | No YYC. Watch for async differences |
| Mobile | YYC | Requires SDK setup (Xcode / Android Studio) |
| Console | YYC | Requires devkit + NDA portal access |

**Key decision:** Use **VM** during development (fast iteration), switch to **YYC** for release builds (performance).

---

## When to Choose GameMaker

| Strength | Detail |
|----------|--------|
| **2D pixel-art games** | Best-in-class sprite editor, tile system, and room editor |
| **Rapid prototyping** | Drag-and-drop + GML lets you iterate fast |
| **Solo / small team** | One-person-friendly workflow, no entity-component overhead |
| **Console shipping** | Proven export pipeline (Undertale, Hyper Light Drifter, Katana ZERO) |

| Weakness | Detail |
|----------|--------|
| **3D** | Minimal 3D support — use Godot/Unity for 3D projects |
| **Large team collaboration** | No built-in version control integration; .yy files merge poorly |
| **Dynamic typing** | Runtime errors for type mismatches unless Feather is enabled |
