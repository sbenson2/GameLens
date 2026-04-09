# GameMaker — AI Rules

Engine-specific rules for projects using GameMaker (2024+). These supplement the engine-agnostic rules in `docs/core/ai-workflow/gamedev-rules.md`.

---

## Architecture Context

### Tech Stack

- **Engine:** GameMaker (v2024+, YoYo Games / Opera)
- **Language:** GML (GameMaker Language) — imperative, dynamically typed, C-like syntax
- **Visual Option:** GML Visual (drag-and-drop block scripting)
- **Renderer:** GPU-accelerated 2D (surfaces, shaders, particle system)
- **Platforms:** Windows, macOS, Linux, HTML5, iOS, Android, PlayStation, Xbox, Nintendo Switch
- **Key Tools:**
  - Feather (built-in static analysis / linting)
  - Spine / DragonBones (skeletal animation, via runtime)
  - Room Editor (visual level design with layers)
  - Sequence Editor (cutscenes, UI animations)

### Project Structure Conventions

```
project.yyp           # Project file (JSON-based)
objects/
├── obj_player/       # Each object has its own folder
│   ├── Create_0.gml  # One file per event
│   ├── Step_0.gml
│   ├── Draw_0.gml
│   └── obj_player.yy # Object metadata
sprites/
├── spr_player/       # Sprite assets with sub-images
rooms/
├── rm_game/          # Room definitions with layers
scripts/
├── scr_utils/        # Reusable script functions
sounds/
fonts/
shaders/
```

---

## Code Generation Rules

### Objects: One Event File Per Event

```gml
// Create_0.gml — initialize instance variables in Create event
hp = 100;
speed = 4;
state = "idle";

// WRONG — do not initialize variables in Step or Draw
// Step_0.gml
// if (!variable_instance_exists(id, "hp")) hp = 100; // anti-pattern
```

### Step Event: Game Logic Only

```gml
// Step_0.gml — movement, state, collision checks
var _input_x = keyboard_check(vk_right) - keyboard_check(vk_left);
x += _input_x * speed;

// WRONG — do not put drawing code in Step
// draw_sprite(spr_player, 0, x, y); // crashes or invisible
```

### Draw Event: Rendering Only

```gml
// Draw_0.gml — visual output
draw_self();                     // draws the assigned sprite
draw_text(x, y - 32, string(hp)); // HP display above sprite

// WRONG — do not put game logic in Draw (runs multiple times per frame)
// hp -= 1; // will drain HP at render-rate, not game-rate
```

### Functions: Use script_ for Reusable Logic

```gml
// scr_utils — define reusable functions in script assets
function approach(_current, _target, _amount) {
    if (_current < _target) {
        return min(_current + _amount, _target);
    } else {
        return max(_current - _amount, _target);
    }
}
```

### Structs and Constructors (GML 2.3+)

```gml
// CORRECT — use constructor functions for data types
function Vec2(_x, _y) constructor {
    x = _x;
    y = _y;
    
    static length = function() {
        return sqrt(x * x + y * y);
    };
}

var pos = new Vec2(10, 20);
show_debug_message(pos.length());
```

### Rooms: Use Layers Properly

- **Instances Layer** — for game objects
- **Tile Layer** — for tilemap-based levels
- **Asset Layer** — for static decorative sprites
- **Background Layer** — for parallax/scrolling backgrounds
- Never mix object instances with tile layers.

### Alarms: Prefer Over Manual Timers

```gml
// Create_0.gml
alarm[0] = room_speed * 2; // fire after 2 seconds

// Alarm_0.gml
instance_create_layer(x, y, "Instances", obj_bullet);
alarm[0] = room_speed; // repeat every second
```

---

## Common Pitfalls

1. **Putting logic in Draw events** — Draw fires per render pass (potentially multiple times per frame). Keep logic in Step.
2. **Forgetting `draw_self()` in custom Draw events** — once you define any Draw event, GameMaker stops auto-drawing the sprite.
3. **Using global variables excessively** — prefer instance variables or structs. Globals make debugging hard.
4. **Not using Feather** — enable Feather for type hints, linting, and catching undefined variable bugs at edit time.
5. **Hardcoding layer names** — store layer names in macros or variables so room changes don't silently break code.
