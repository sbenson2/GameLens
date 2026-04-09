# Structs, Constructors & State Machines

> **Category:** guide · **Engine:** GameMaker · **Related:** [G1_object_events](G1_object_events.md), [R1_gml_data_structures](../reference/R1_gml_data_structures.md)

Modern GML (2.3+) structs and constructors unlock clean, reusable patterns that were previously awkward or impossible. This guide covers struct fundamentals, constructor inheritance, static variables, and the most common architectural win: struct-based state machines.

---

## Structs — Lightweight Data Containers

A struct is an anonymous, garbage-collected data container. Unlike objects, structs have no events, no collision mask, and no draw call. They are ideal for data and logic grouping.

```gml
// Inline struct literal
var _stats = {
    hp: 100,
    attack: 12,
    defense: 8
};

// Access with dot notation
show_debug_message(_stats.hp); // 100

// Dynamic access with $ accessor
var _key = "attack";
show_debug_message(_stats[$ _key]); // 12
```

### When to use structs vs. objects

| Structs | Objects |
|---------|---------|
| Data containers, configs, messages | Anything that needs events (Step, Draw, Collision) |
| Logic grouping (state, command) | Visible entities in a room |
| Lightweight, no overhead per frame | Managed by the instance system |
| Garbage collected when unreferenced | Destroyed explicitly or at room end |

---

## Constructors — Struct Factories

The `constructor` keyword turns a function into a struct factory. Call it with `new` to produce a struct instance.

```gml
/// @func   Vector2
/// @param  {real} _x
/// @param  {real} _y
function Vector2(_x = 0, _y = 0) constructor {
    x = _x;
    y = _y;

    /// @func length
    /// @returns {real}
    static length = function() {
        return sqrt(x * x + y * y);
    };

    /// @func add
    /// @param {struct.Vector2} _other
    /// @returns {struct.Vector2}
    static add = function(_other) {
        return new Vector2(x + _other.x, y + _other.y);
    };

    /// @func toString
    /// @returns {string}
    static toString = function() {
        return $"({x}, {y})";
    };
}

var _pos = new Vector2(3, 4);
show_debug_message(_pos.length()); // 5
```

### Key rules

- **`static` methods** are shared across all instances of the constructor — they live on the static struct, not on each instance. Always use `static` for methods to avoid allocating a new function per instance.
- **`self`** inside a constructor method refers to the struct instance, not the calling object. Use `other` to refer to the calling instance context if needed.
- **Script functions only** for constructor definitions. You cannot use a method variable (e.g. `var MyThing = function() constructor {}`) as a constructor — it must be a named script function.

---

## Constructor Inheritance

Constructors support single inheritance via the `:` (colon) syntax. The parent constructor runs first, then the child body executes.

```gml
function Entity(_x, _y) constructor {
    x = _x;
    y = _y;
    active = true;

    static update = function() {
        // Base update — override in children
    };

    static destroy = function() {
        active = false;
    };
}

function Enemy(_x, _y, _hp) : Entity(_x, _y) constructor {
    hp = _hp;
    max_hp = _hp;

    // Override parent method
    static update = function() {
        if (hp <= 0) {
            destroy();
        }
    };

    static take_damage = function(_amount) {
        hp = max(_hp - _amount, 0);
    };
}
```

### Calling parent methods

There is no built-in `super` keyword. To call a parent's version of an overridden method, store a reference before overriding:

```gml
function Boss(_x, _y, _hp, _phase) : Enemy(_x, _y, _hp) constructor {
    phase = _phase;

    // Store parent reference
    static _parent_update = Enemy.update;

    static update = function() {
        _parent_update(); // Run Enemy.update logic
        // Additional boss logic
        if (hp < max_hp * 0.5 && phase == 0) {
            phase = 1;
        }
    };
}
```

### The Static Chain

Constructors form a chain of static structs. Each constructor has a static struct, and that struct links to its parent's static struct. You can inspect this with `static_get()`:

```gml
var _boss = new Boss(100, 100, 500, 0);
var _boss_static  = static_get(_boss);       // Boss's static struct
var _enemy_static = static_get(_boss_static); // Enemy's static struct
var _entity_static = static_get(_enemy_static); // Entity's static struct
```

Use `is_instanceof()` to check inheritance:

```gml
var _b = new Boss(0, 0, 100, 0);
show_debug_message(is_instanceof(_b, Entity)); // true
show_debug_message(is_instanceof(_b, Enemy));  // true
show_debug_message(is_instanceof(_b, Boss));   // true
```

---

## Struct-Based State Machines

State machines are the most impactful use of constructors. Instead of long `switch` blocks in the Step event, each state is a struct with `enter`, `update`, and `exit` methods.

### State Machine Controller

```gml
/// @func   StateMachine
/// @desc   Minimal struct-based FSM. Attach to any object.
function StateMachine() constructor {
    current_state = undefined;
    previous_state = undefined;
    owner = other; // The object that created this FSM

    /// @func change_state
    /// @param {struct} _new_state  A state struct with enter/update/exit
    static change_state = function(_new_state) {
        if (current_state != undefined && variable_struct_exists(current_state, "exit")) {
            current_state.exit();
        }
        previous_state = current_state;
        current_state = _new_state;
        current_state.owner = owner;
        if (variable_struct_exists(current_state, "enter")) {
            current_state.enter();
        }
    };

    /// @func update
    static update = function() {
        if (current_state != undefined && variable_struct_exists(current_state, "update")) {
            current_state.update();
        }
    };

    /// @func is_state
    /// @param {function} _constructor  The constructor function to check
    /// @returns {bool}
    static is_state = function(_constructor) {
        return is_instanceof(current_state, _constructor);
    };
}
```

### Defining States as Constructors

```gml
function StateIdle() constructor {
    owner = undefined; // Set by StateMachine.change_state

    static enter = function() {
        owner.sprite_index = spr_player_idle;
        owner.image_speed = 0.5;
    };

    static update = function() {
        // Transition: move input → Walk
        if (abs(owner.input_h) > 0) {
            owner.fsm.change_state(new StateWalk());
            return;
        }
        // Transition: jump input → Jump
        if (owner.input_jump && owner.on_ground) {
            owner.fsm.change_state(new StateJump());
            return;
        }
    };

    static exit = function() {
        // Cleanup if needed
    };
}

function StateWalk() constructor {
    owner = undefined;

    static enter = function() {
        owner.sprite_index = spr_player_walk;
        owner.image_speed = 1;
    };

    static update = function() {
        owner.x += owner.input_h * owner.move_speed;

        // Transition: no input → Idle
        if (owner.input_h == 0) {
            owner.fsm.change_state(new StateIdle());
            return;
        }
        // Transition: jump → Jump
        if (owner.input_jump && owner.on_ground) {
            owner.fsm.change_state(new StateJump());
            return;
        }
    };

    static exit = function() {};
}
```

### Wiring It Up in an Object

```gml
/// obj_player — Create Event
fsm = new StateMachine();
fsm.change_state(new StateIdle());

move_speed = 3;
on_ground = true;
input_h = 0;
input_jump = false;

/// obj_player — Step Event
// Gather input
input_h = keyboard_check(vk_right) - keyboard_check(vk_left);
input_jump = keyboard_check_pressed(vk_space);

// Tick the FSM
fsm.update();
```

### Why this pattern wins

- **Isolation** — each state file is self-contained; adding a new state never touches existing ones.
- **Readable transitions** — `change_state(new StateAttack())` reads like English.
- **Debugging** — `fsm.is_state(StateWalk)` makes conditional checks trivial.
- **Inheritance** — states can extend a base state: `function StateDash() : StateWalk() constructor { ... }`.

### Shared helper functions

Extract common logic (gravity, collision) into standalone functions. States call them — no code duplication:

```gml
/// @func   apply_gravity
/// @param  {id.Instance} _inst
/// @param  {real}         _gravity
function apply_gravity(_inst, _gravity = 0.5) {
    _inst.vsp += _gravity;
    // Vertical collision
    if (place_meeting(_inst.x, _inst.y + _inst.vsp, obj_solid)) {
        while (!place_meeting(_inst.x, _inst.y + sign(_inst.vsp), obj_solid)) {
            _inst.y += sign(_inst.vsp);
        }
        _inst.vsp = 0;
        _inst.on_ground = true;
    } else {
        _inst.on_ground = false;
    }
    _inst.y += _inst.vsp;
}
```

---

## Performance Tips

- **Always use `static` for methods.** Without `static`, every `new` call allocates a fresh function closure per method — this adds up fast with hundreds of structs.
- **Delete structs you no longer need.** `delete _struct;` hints to the garbage collector. GC runs automatically, but large struct graphs benefit from explicit cleanup.
- **Avoid deep inheritance chains.** Two or three levels are fine. Beyond that, prefer composition (a struct that *holds* other structs) over deeper inheritance.
- **Use `is_instanceof()` over tag strings.** Checking the static chain is faster and type-safe compared to storing a `type` string and comparing it.
