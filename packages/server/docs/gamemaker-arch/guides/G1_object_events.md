# G1 — Object Events and State Machines in GameMaker

> **Category:** guide · **Engine:** GameMaker · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G2 Room Design](G2_room_design.md)

---

## Object Events: The Complete Picture

Every Object in GameMaker communicates with the engine through **events** — named code entry points that fire at specific moments. Understanding when each event fires and what belongs in it is the foundation of writing correct GameMaker code.

### Event Reference

| Event | When It Fires | What Belongs Here |
|-------|--------------|-------------------|
| **Create** | Once, when instance is spawned | Variable initialization, one-time setup |
| **Destroy** | When `instance_destroy()` is called | Cleanup, score updates, death effects |
| **Clean Up** | When instance is garbage-collected | Free surfaces, data structures, buffers |
| **Step** (Begin/Step/End) | Every frame (default 60 FPS) | Movement, input, AI, state machines |
| **Alarm[0–11]** | When alarm counter reaches 0 | Timed actions, cooldowns, spawning |
| **Draw** (Begin/Draw/End) | Every frame, after Step | Sprite rendering, HUD, visual effects |
| **Draw GUI** (Begin/Draw GUI/End) | Every frame, screen-space | UI elements that ignore the camera |
| **Collision (obj_*)** | When bounding boxes overlap | Damage, pickups, physics response |
| **Keyboard/Mouse/Gamepad** | When input is detected | Prefer checking in Step instead for control |
| **Room Start** | When a new room loads | Per-room initialization |
| **Room End** | When leaving a room | Per-room cleanup |
| **Game Start** | Once, at the very beginning | Global initialization |
| **Game End** | When the game closes | Save data, cleanup |

### The Three Laws of Events

**1. Initialize in Create, never elsewhere.**

```gml
// Create_0.gml — CORRECT
hp = 100;
max_hp = 100;
move_speed = 4;
facing = "right";

// Step_0.gml — WRONG: checking existence every frame is wasteful and error-prone
// if (!variable_instance_exists(id, "hp")) hp = 100;
```

**2. Logic in Step, drawing in Draw.**

The Draw event can fire multiple times per frame (once per view/camera). Putting game logic there causes it to run at an unpredictable rate:

```gml
// Step_0.gml — CORRECT: movement logic runs exactly once per frame
x += keyboard_check(vk_right) - keyboard_check(vk_left);
y += keyboard_check(vk_down) - keyboard_check(vk_up);

// Draw_0.gml — CORRECT: only rendering code
draw_self();
draw_healthbar(x - 16, y - 24, x + 16, y - 20, hp / max_hp * 100,
    c_black, c_red, c_green, 0, true, true);
```

**3. Once you define a Draw event, you own all drawing.**

GameMaker auto-draws an Object's sprite — but only if it has *no* Draw event. The moment you add a custom Draw event, you must call `draw_self()` explicitly or the sprite becomes invisible:

```gml
// Draw_0.gml — if you want the sprite PLUS custom drawing
draw_self();                           // draws the assigned sprite
draw_text(x, y - 32, "HP: " + string(hp));  // custom overlay
```

---

## State Machines: Organizing Complex Behavior

Most game objects (players, enemies, NPCs, UI elements) exist in discrete **states** — idle, walking, attacking, hurt, dead. A state machine ensures only the logic for the current state runs each frame.

### Pattern 1: Enum + Switch (Simple and Effective)

Best for objects with a small number of states (under ~8) and straightforward transitions.

```gml
// Create_0.gml
enum PlayerState {
    IDLE,
    RUN,
    JUMP,
    ATTACK,
    HURT,
    DEAD
}
state = PlayerState.IDLE;

// Step_0.gml
switch (state) {
    case PlayerState.IDLE:
        // Check for input to transition
        var _input_x = keyboard_check(vk_right) - keyboard_check(vk_left);
        if (_input_x != 0) {
            state = PlayerState.RUN;
            break;
        }
        if (keyboard_check_pressed(vk_space)) {
            state = PlayerState.JUMP;
            vspeed = -jump_force;
            break;
        }
        if (keyboard_check_pressed(ord("Z"))) {
            state = PlayerState.ATTACK;
            alarm[0] = attack_duration;
            break;
        }
        break;
    
    case PlayerState.RUN:
        var _input_x = keyboard_check(vk_right) - keyboard_check(vk_left);
        x += _input_x * move_speed;
        facing = (_input_x > 0) ? "right" : "left";
        
        if (_input_x == 0) {
            state = PlayerState.IDLE;
        }
        if (keyboard_check_pressed(vk_space)) {
            state = PlayerState.JUMP;
            vspeed = -jump_force;
        }
        break;
    
    case PlayerState.JUMP:
        // Apply gravity
        vspeed += gravity_strength;
        y += vspeed;
        
        // Allow air control
        var _input_x = keyboard_check(vk_right) - keyboard_check(vk_left);
        x += _input_x * move_speed * 0.8;
        
        // Land detection
        if (place_meeting(x, y + 1, obj_solid)) {
            vspeed = 0;
            state = PlayerState.IDLE;
        }
        break;
    
    case PlayerState.ATTACK:
        // Attack logic — alarm[0] handles duration
        // Transition back happens in Alarm_0 event
        break;
    
    case PlayerState.HURT:
        // Knockback, invincibility frames
        x += knockback_dir * knockback_speed;
        knockback_speed = approach(knockback_speed, 0, 0.5);
        if (knockback_speed == 0) {
            state = (hp <= 0) ? PlayerState.DEAD : PlayerState.IDLE;
        }
        break;
    
    case PlayerState.DEAD:
        sprite_index = spr_player_dead;
        // Wait for animation, then game over
        if (sprite_index == spr_player_dead 
            && image_index >= sprite_get_number(spr_player_dead) - 1) {
            room_goto(rm_game_over);
        }
        break;
}
```

### Pattern 2: Function-Based States (Scalable)

For complex objects with many states, store each state as a function. This avoids massive switch blocks and makes adding states trivial:

```gml
// Create_0.gml
state = state_idle;   // Assign a function reference

function state_idle() {
    sprite_index = spr_enemy_idle;
    
    // Patrol detection
    if (distance_to_object(obj_player) < detect_range) {
        state = state_chase;
    }
}

function state_chase() {
    sprite_index = spr_enemy_run;
    var _dir = sign(obj_player.x - x);
    x += _dir * chase_speed;
    facing = _dir;
    
    if (distance_to_object(obj_player) < attack_range) {
        state = state_attack;
        alarm[0] = attack_windup;
    } else if (distance_to_object(obj_player) > lose_range) {
        state = state_idle;
    }
}

function state_attack() {
    sprite_index = spr_enemy_attack;
    // Attack fires in Alarm_0 when windup completes
}

// Step_0.gml — one line runs the current state
state();
```

### Pattern 3: Struct-Based State Machine (Advanced)

For objects that need enter/exit callbacks (e.g., play a sound on state enter, stop a particle on state exit):

```gml
// Create_0.gml
function StateMachine() constructor {
    current_state = undefined;
    states = {};
    
    static add_state = function(_name, _enter, _update, _exit) {
        states[$ _name] = {
            enter: _enter,
            update: _update,
            exit: _exit
        };
    };
    
    static change = function(_name) {
        if (current_state != undefined && variable_struct_exists(states, current_state)) {
            states[$ current_state].exit();
        }
        current_state = _name;
        states[$ current_state].enter();
    };
    
    static update = function() {
        if (current_state != undefined) {
            states[$ current_state].update();
        }
    };
}

sm = new StateMachine();

sm.add_state("idle",
    function() { sprite_index = spr_idle; },    // enter
    function() {                                  // update
        if (keyboard_check(vk_right) || keyboard_check(vk_left)) {
            sm.change("run");
        }
    },
    function() { /* exit */ }                     // exit
);

sm.add_state("run",
    function() { sprite_index = spr_run; },
    function() {
        var _dir = keyboard_check(vk_right) - keyboard_check(vk_left);
        x += _dir * move_speed;
        if (_dir == 0) sm.change("idle");
    },
    function() { /* exit */ }
);

sm.change("idle"); // Set initial state

// Step_0.gml
sm.update();
```

---

## Shared Logic: Helper Functions

States often share common logic (gravity, collision). Extract these into reusable functions to avoid duplication:

```gml
// scr_movement — shared physics helpers

/// @param {Real} _current
/// @param {Real} _target
/// @param {Real} _amount
/// @returns {Real}
function approach(_current, _target, _amount) {
    if (_current < _target) {
        return min(_current + _amount, _target);
    } else {
        return max(_current - _amount, _target);
    }
}

/// @param {Real} _hsp  Horizontal speed
/// @param {Real} _vsp  Vertical speed
function move_and_collide(_hsp, _vsp) {
    // Horizontal collision
    if (place_meeting(x + _hsp, y, obj_solid)) {
        while (!place_meeting(x + sign(_hsp), y, obj_solid)) {
            x += sign(_hsp);
        }
        _hsp = 0;
    }
    x += _hsp;
    
    // Vertical collision
    if (place_meeting(x, y + _vsp, obj_solid)) {
        while (!place_meeting(x, y + sign(_vsp), obj_solid)) {
            y += sign(_vsp);
        }
        _vsp = 0;
    }
    y += _vsp;
}
```

Call from any state:

```gml
// Inside a state's update logic
vsp += gravity_strength;
move_and_collide(hsp, vsp);
```

---

## Animation Integration

Tie sprite changes to state transitions rather than scattering them through logic:

```gml
// After state switch, set sprite and speed
switch (state) {
    case PlayerState.IDLE:
        sprite_index = spr_player_idle;
        image_speed = 1;
        break;
    case PlayerState.RUN:
        sprite_index = spr_player_run;
        image_speed = 1.5; // faster playback when running
        break;
    case PlayerState.JUMP:
        sprite_index = (vspeed < 0) ? spr_player_jump_up : spr_player_jump_down;
        image_speed = 1;
        break;
    case PlayerState.ATTACK:
        sprite_index = spr_player_attack;
        image_speed = 1;
        image_index = 0; // restart from frame 0
        break;
}
```

**Tip:** Use the **Animation End** event to detect when a non-looping animation finishes, then transition out of that state.

---

## Common Mistakes

1. **Giant switch blocks with duplicated code.** Extract shared logic (gravity, collision) into helper functions. Each case in a switch should be short.
2. **Forgetting to break out of states.** Every state needs clear exit conditions. A missing transition traps the object.
3. **Changing state mid-frame then running the new state's logic.** Use `break` after setting a new state to wait until next frame for the new state to execute cleanly.
4. **Using strings for state names in the switch pattern.** Prefer enums — they autocomplete, catch typos at edit time (with Feather), and are faster to compare than strings.
5. **Not using `event_inherited()` with parent objects.** If a parent object has a Step event and the child overrides it, the parent's code is skipped unless you call `event_inherited()`.
