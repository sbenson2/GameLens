# G2 — Rooms, Layers, and Cameras in GameMaker

> **Category:** guide · **Engine:** GameMaker · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Object Events](G1_object_events.md) · [R1 GML Data Structures](../reference/R1_gml_data_structures.md)

---

## Rooms: The Container for Everything

A **Room** in GameMaker is a discrete level, screen, or scene. Every game has at least one room. Rooms hold instances, tiles, backgrounds, sprites, sequences, particle systems, and text — all organized into layers.

### Room Properties

| Property | Purpose |
|----------|---------|
| **Width / Height** | Room dimensions in pixels |
| **Speed** | Target FPS for this room (typically matches global game speed) |
| **Persistent** | If enabled, room state is preserved when you leave and return |
| **Creation Code** | GML that runs once when the room loads, before any instance Create events |
| **Viewports and Cameras** | Up to 8 viewports for split-screen or HUD overlays |

### Room Order

The first room in the Asset Browser's room order is where the game starts. You can reorder rooms in the Asset Browser to change the starting room.

---

## Layers

Rooms use a **layer system** for draw ordering. Every asset placed in a room belongs to a layer. Layers draw back-to-front based on their **depth** value — higher depth draws behind, lower depth draws in front.

### Layer Types

| Layer Type | Contents | Use Case |
|------------|----------|----------|
| **Instance** | Object instances | Player, enemies, pickups, triggers |
| **Asset** | Sprites, sequences, particle systems, text | Static decorations, animated props, VFX |
| **Tile Map** | Grid-based tiles from a tile set | Terrain, walls, floors (efficient for large maps) |
| **Background** | A single stretched/tiled image | Sky, parallax backgrounds |
| **Effect** | Post-processing filters | Built-in effects (color adjustments, blur, etc.) |
| **Filter** | Shader-based visual filters | Applied to layers below (2024.6+) |

### Creating Layers at Runtime

```gml
// Create a new instance layer at a specific depth
var _layer = layer_create(100, "DynamicEnemies");

// Create an instance on that layer
instance_create_layer(x, y, "DynamicEnemies", obj_enemy);

// Create with depth instead of layer name
instance_create_depth(x, y, -100, obj_bullet);

// Get/set layer properties
layer_depth("Background", 1000);
layer_x("Clouds", layer_x("Clouds") - 0.5);  // Parallax scrolling
```

### Tile Map Layers

Tile maps are the most efficient way to draw large amounts of static geometry:

```gml
// Get the tilemap element from a layer
var _tilemap = layer_tilemap_get_id("Tiles_Ground");

// Set a tile at grid position (3, 5) to tile index 12
tilemap_set(_tilemap, 12, 3, 5);

// Read a tile
var _tile = tilemap_get(_tilemap, 3, 5);

// Clear a tile
tilemap_set(_tilemap, 0, 3, 5);
```

**Performance tip:** Tile maps are GPU-rendered in a single batch. For static terrain, always prefer tile maps over individual sprite instances.

---

## Room Navigation

### Changing Rooms

```gml
// Go to a specific room
room_goto(rm_level_2);

// Go to next/previous room in room order
room_goto_next();
room_goto_previous();

// Restart the current room
room_restart();
```

### Room Lifecycle

When a room transition occurs, events fire in this order:

1. **Room End** event on all instances in the current room
2. Non-persistent instances are destroyed (Clean Up fires)
3. **Room Creation Code** of the new room executes
4. Instances are created — **Create** events fire
5. **Room Start** event fires on all instances
6. Normal game loop resumes

### Persistent Rooms and Instances

```gml
// Mark an instance as persistent (survives room changes)
persistent = true;

// Check if we've visited a room before
if (room_persistent) {
    // Room state was preserved from last visit
}
```

**Gotcha:** Persistent instances keep running across rooms. A persistent `obj_player` won't get a new Create event when you return to a room — it carries its state from wherever it was. Be careful with persistent instances that reference room-specific resources.

---

## Cameras and Viewports

GameMaker separates the concepts of **cameras** (what the game world sees) and **viewports** (where it's drawn on screen). This enables split-screen, minimaps, and resolution-independent rendering.

### Core Concepts

| Concept | Description |
|---------|-------------|
| **Camera** | A rectangle in game-world coordinates defining what area to render |
| **Viewport** | A rectangle on the application surface (screen) where the camera output is drawn |
| **View** | The combination of a camera + viewport, configured per room (0–7) |

### Setting Up Views in the Room Editor

Enable viewports in Room Properties → Viewports and Cameras:

1. **Enable Viewports** — master toggle
2. **Viewport 0 Visible** — activate the first viewport
3. **Camera Properties** — X, Y, Width, Height in world pixels
4. **Viewport Properties** — X, Y, Width, Height on screen
5. **Object Following** — instance to follow, with horizontal/vertical border

### Camera Functions (GML)

```gml
// Create a camera with position, size, and optional rotation/angle
var _cam = camera_create_view(0, 0, 640, 360, 0, obj_player, -1, -1, 32, 32);

// Assign camera to viewport 0
view_set_camera(0, _cam);

// Move camera to center on a target
camera_set_view_pos(_cam, target.x - 320, target.y - 180);

// Get camera position and size
var _cx = camera_get_view_x(_cam);
var _cy = camera_get_view_y(_cam);
var _cw = camera_get_view_width(_cam);
var _ch = camera_get_view_height(_cam);

// Smooth camera follow (in Step event of a camera controller)
var _target_x = obj_player.x - _cw / 2;
var _target_y = obj_player.y - _ch / 2;
camera_set_view_pos(_cam,
    lerp(camera_get_view_x(_cam), _target_x, 0.1),
    lerp(camera_get_view_y(_cam), _target_y, 0.1)
);
```

### Viewport Configuration

```gml
// Set viewport 0 to fill the screen
view_set_xport(0, 0);
view_set_yport(0, 0);
view_set_wport(0, display_get_gui_width());
view_set_hport(0, display_get_gui_height());

// Split-screen: viewport 0 = left half, viewport 1 = right half
view_set_wport(0, display_get_gui_width() / 2);
view_set_xport(1, display_get_gui_width() / 2);
view_set_wport(1, display_get_gui_width() / 2);
```

### Camera Shake

```gml
// Simple screen shake (add to camera controller Step event)
if (shake_duration > 0) {
    var _offset_x = random_range(-shake_magnitude, shake_magnitude);
    var _offset_y = random_range(-shake_magnitude, shake_magnitude);
    camera_set_view_pos(_cam,
        camera_get_view_x(_cam) + _offset_x,
        camera_get_view_y(_cam) + _offset_y
    );
    shake_duration--;
    shake_magnitude *= 0.9;  // Decay
}
```

### Camera Bounds (Clamping)

```gml
// Prevent camera from showing outside the room
var _cx = clamp(target_x, 0, room_width - _cw);
var _cy = clamp(target_y, 0, room_height - _ch);
camera_set_view_pos(_cam, _cx, _cy);
```

---

## Sequences

**Sequences** are GameMaker's timeline-based animation system for choreographing sprites, sounds, instances, and other assets without code. They function like a simple non-linear editor (NLE) inside the engine.

### Sequence Components

| Component | Purpose |
|-----------|---------|
| **Canvas** | The visual workspace where you position and animate elements |
| **Dope Sheet** | Timeline with keyframes for each track |
| **Tracks** | Individual elements: sprites, instances, audio, particle systems, text |
| **Keyframes** | Position, scale, rotation, color, and other properties at a point in time |
| **Curves** | Interpolation between keyframes (linear, smooth, bezier) |

### Using Sequences in GML

```gml
// Create a sequence instance on a layer
var _seq = layer_sequence_create("Effects", x, y, seq_explosion);

// Control playback
layer_sequence_play(_seq);
layer_sequence_pause(_seq);
layer_sequence_headpos(_seq, 0);     // Jump to frame 0
layer_sequence_speedscale(_seq, 2);  // 2x playback speed

// Check if finished
if (layer_sequence_is_finished(_seq)) {
    layer_sequence_destroy(_seq);
}

// Get/set sequence position
var _pos = layer_sequence_x(_seq);
layer_sequence_x(_seq, _pos + 10);
```

### Sequence Events

Sequences can broadcast **moment events** and **message events** at specific frames:

```gml
// In a Sequence's Broadcast Message event:
// The variable `event_data` contains the message string

if (event_data[? "message"] == "spawn_particles") {
    part_emitter_burst(ps, em, pt_spark, 50);
}
```

### When to Use Sequences vs. Code

| Use Sequences For | Use Code For |
|------------------|-------------|
| Cutscenes and cinematics | Gameplay-driven movement |
| UI animations (menu transitions) | Physics-based motion |
| Title screen animations | Procedural animation |
| Pre-authored VFX with precise timing | Reactive, dynamic effects |
| Prototyping animations quickly | Performance-critical animation |

---

## Particle Systems

Particle systems create lightweight visual effects (fire, smoke, rain, sparks) using GPU-accelerated rendering. Since 2024, GameMaker includes a visual **Particle System Editor** alongside GML-based creation.

### Particle System Editor (2024+)

The visual editor lets you design particle systems as assets in the Asset Browser. Key features:

- Preview particles in real-time within the editor
- Configure emitters, particle types, and blending visually
- **Copy GML to Clipboard** button exports equivalent runtime code
- Place particle systems on Asset Layers in rooms
- Animate particle systems within Sequences

### GML Particle API

```gml
// Create a particle system
ps = part_system_create();
part_system_depth(ps, -100);  // Draw depth

// Define a particle type
pt_fire = part_type_create();
part_type_shape(pt_fire, pt_shape_pixel);
part_type_size(pt_fire, 2, 6, -0.05, 0);
part_type_color3(pt_fire, c_yellow, c_orange, c_red);
part_type_alpha3(pt_fire, 1, 0.8, 0);
part_type_speed(pt_fire, 1, 3, -0.05, 0);
part_type_direction(pt_fire, 70, 110, 0, 10);
part_type_life(pt_fire, 30, 60);
part_type_blend(pt_fire, true);  // Additive blending

// Create an emitter
em = part_emitter_create(ps);
part_emitter_region(ps, em, x - 16, x + 16, y - 4, y + 4, ps_shape_rectangle, ps_distr_linear);

// Emit particles
part_emitter_stream(ps, em, pt_fire, 5);  // 5 particles per frame, continuously

// Or burst
part_emitter_burst(ps, em, pt_fire, 50);  // 50 particles, one shot

// Clean up (in Clean Up event)
part_type_destroy(pt_fire);
part_emitter_destroy(ps, em);
part_system_destroy(ps);
```

### Performance Guidelines

- Particle systems bypass the normal instance overhead — they are much cheaper than individual objects.
- Keep particle **life** values reasonable. Thousands of long-lived particles will hurt performance.
- Use `part_system_automatic_draw(ps, false)` and call `part_system_drawit(ps)` manually if you need particles behind specific layers.
- The Particle System Editor's "Copy GML" output is a reliable starting point but may need runtime adjustments for position tracking.

---

## Common Patterns

### Room Transition with Fade

```gml
// obj_room_transition — Create event
target_room = rm_level_2;
fade_alpha = 0;
fading_out = true;

// Step event
if (fading_out) {
    fade_alpha = min(fade_alpha + 0.03, 1);
    if (fade_alpha >= 1) {
        room_goto(target_room);
        fading_out = false;
    }
} else {
    fade_alpha = max(fade_alpha - 0.03, 0);
    if (fade_alpha <= 0) {
        instance_destroy();
    }
}

// Draw GUI event
draw_set_alpha(fade_alpha);
draw_set_colour(c_black);
draw_rectangle(0, 0, display_get_gui_width(), display_get_gui_height(), false);
draw_set_alpha(1);
```

### Parallax Background Layers

```gml
// In a controller's Step event — shift background layers for parallax
layer_x("BG_Far", camera_get_view_x(view_camera[0]) * 0.2);
layer_y("BG_Far", camera_get_view_y(view_camera[0]) * 0.2);
layer_x("BG_Mid", camera_get_view_x(view_camera[0]) * 0.5);
layer_y("BG_Mid", camera_get_view_y(view_camera[0]) * 0.5);
```

### Dynamic Room Creation

```gml
// Create a room at runtime (useful for procedural generation)
var _rm = room_add();
room_set_width(_rm, 2048);
room_set_height(_rm, 1536);

// Add a layer and populate it
var _layer = room_instance_add(_rm, layer_get_id("Instances"));
// Note: runtime room creation has limitations — prefer room_duplicate() 
// to copy an existing room as a template, then modify it.
room_goto(_rm);
```
