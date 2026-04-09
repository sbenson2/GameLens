# G3 — Particles & Sequences Guide

> **Category:** guide · **Engine:** GameMaker · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [R2 Surfaces & Shaders](../reference/R2_surfaces_and_shaders.md) · [G2 Rooms & Cameras](G2_rooms_and_cameras.md)

---

## Particle System Overview

GameMaker's particle system is a lightweight way to render large numbers of small visual effects (sparks, smoke, rain, explosions) without the overhead of full game objects. Particles are **GPU-rendered** and have no collision, physics, or game logic — they're purely visual.

A particle setup has three parts:

1. **Particle System** — the container that manages drawing order and position
2. **Particle Type** — defines appearance, movement, color, lifetime, and shape
3. **Emitter** — defines where and how particles are spawned

---

## Creating a Particle System in GML

### Basic Setup (Create Event)

```gml
/// Create_0.gml — set up a fire particle effect

// 1. Create the system
part_sys = part_system_create();
part_system_draw_order(part_sys, true);  // true = oldest drawn first (new on top)

// 2. Define a particle type
part_fire = part_type_create();
part_type_shape(part_fire, pt_shape_flare);       // built-in flare shape
part_type_size(part_fire, 0.3, 0.8, -0.01, 0);   // start size range, shrink over time
part_type_life(part_fire, 30, 60);                 // lifetime: 30–60 frames
part_type_speed(part_fire, 1, 2, 0, 0);            // initial speed range
part_type_direction(part_fire, 80, 100, 0, 0);     // upward (80°–100°)
part_type_gravity(part_fire, 0.05, 90);             // slight upward drift
part_type_colour3(part_fire, #FFFF33, #FF6600, #330000);  // yellow → orange → dark red
part_type_alpha3(part_fire, 1, 0.8, 0);             // fade out at end
part_type_blend(part_fire, true);                    // additive blending for glow

// 3. Create an emitter
part_emit = part_emitter_create(part_sys);
part_emitter_region(part_sys, part_emit, x - 16, x + 16, y - 4, y + 4,
    ps_shape_rectangle, ps_distr_gaussian);  // gaussian = denser in center

// 4. Stream particles continuously
part_emitter_stream(part_sys, part_emit, part_fire, 3);  // 3 particles per frame
```

### Cleanup (Clean Up Event)

```gml
/// Clean_Up_0.gml — always destroy particle systems to avoid memory leaks
part_type_destroy(part_fire);
part_system_destroy(part_sys);  // also destroys its emitters
```

> **Why cleanup matters:** Particle systems are not garbage-collected. If you destroy the instance without cleaning up, the particles keep rendering (and leaking memory) until the room ends.

---

## One-Shot Bursts (Explosions, Hit Effects)

For effects that fire once and disappear, use `part_emitter_burst()` instead of streaming:

```gml
/// Call this from any event (e.g., a collision or destroy event)
function emit_explosion(_x, _y) {
    // Reuse a global system for one-shot effects (avoids per-effect overhead)
    if (!part_system_exists(global.fx_sys)) {
        global.fx_sys = part_system_create();
    }
    
    var _emit = part_emitter_create(global.fx_sys);
    part_emitter_region(global.fx_sys, _emit, _x - 4, _x + 4, _y - 4, _y + 4,
        ps_shape_ellipse, ps_distr_gaussian);
    
    // Burst 20 particles in one frame, then clean up the emitter
    part_emitter_burst(global.fx_sys, _emit, global.part_spark, 20);
    part_emitter_destroy(global.fx_sys, _emit);
}
```

> **Performance tip:** Create one shared particle system for all one-shot effects rather than creating and destroying systems per effect. The system is just a container — you can reuse it across many emitters and particle types.

---

## Using the Particle System Editor (Asset-Based)

GameMaker's visual Particle System Editor lets you design effects without code. You can then instantiate them via GML:

```gml
// Create a system from a Particle System Asset (designed in the editor)
part_sys = part_system_create(ps_MyFireEffect);

// The editor-designed emitters, types, and properties are auto-configured
// You can still modify properties at runtime:
part_system_position(part_sys, x, y);
```

The editor also has a **Copy GML to Clipboard** button that exports the equivalent GML code — useful for learning or for runtime customization.

---

## Using Custom Sprites as Particles

Instead of the 14 built-in shapes, you can assign any sprite:

```gml
part_type_sprite(part_type, spr_leaf, true, true, false);
// Arguments: type, sprite, animate (cycle sub-images), stretch (fit lifetime),
//            random (start on random sub-image)
```

- Set `animate` to `true` for animated particles (e.g., flickering flames)
- Set `stretch` to `true` to spread the animation across the particle's lifetime
- Set `random` to `true` to start each particle on a random sub-image (visual variety)

---

## Particle System Positioning

By default, particles are emitted in **room coordinates**. To attach particles to a moving object:

```gml
/// Step_0.gml — update emitter position to follow this instance
part_emitter_region(part_sys, part_emit,
    x - 16, x + 16, y - 4, y + 4,
    ps_shape_rectangle, ps_distr_gaussian);
```

Alternatively, move the entire system (affects all emitters):

```gml
part_system_position(part_sys, x, y);
```

> **Gotcha:** `part_system_position()` offsets the draw position of the system but does NOT offset emitter regions. Emitter regions are always in room coordinates unless you manually update them.

---

## Sequences Overview

Sequences are GameMaker's timeline-based animation tool for choreographing sprites, instances, sounds, particle systems, and other assets over time. They're ideal for cutscenes, UI animations, title screens, and any scripted visual choreography.

### Key Concepts

- **Tracks** — each asset in a sequence lives on a track (sprite track, instance track, audio track, particle track, text track)
- **Keyframes** — data points on a track that define state at a specific frame (position, scale, rotation, color, etc.)
- **Parameter tracks** — sub-tracks that control individual properties (x, y, scale, rotation, blend color)
- **Animation curves** — easing functions applied between keyframes (linear, ease-in, ease-out, bezier)
- **Broadcast messages** — custom events fired at specific frames, caught in GML code

---

## Creating Sequences in the Editor

Most sequence work happens in the **Sequence Editor**:

1. Create a new Sequence asset
2. Drag sprites, objects, sounds, or particle systems onto the canvas
3. Position the playhead and set keyframes for position, scale, rotation, alpha
4. Add animation curves for smooth interpolation
5. Use broadcast messages to trigger game logic at specific frames

### Broadcast Messages in GML

Broadcast messages let sequences communicate with your game code:

```gml
/// Create_0.gml — play a sequence and listen for messages
seq_inst = layer_sequence_create("Sequences", x, y, seq_intro_cutscene);

/// Step_0.gml — respond to broadcast messages
var _seq_data = layer_sequence_get_instance(seq_inst);
var _msgs = sequence_instance_override_object(_seq_data, self);

// Check for a broadcast message named "spawn_enemy"
// (set up in the Sequence Editor at a specific frame)
```

A more common pattern is using the **Sequence event callbacks**:

```gml
/// Create_0.gml
seq_inst = layer_sequence_create("Sequences", 0, 0, seq_boss_intro);
var _seq = layer_sequence_get_instance(seq_inst);

// Register a broadcast message callback
sequence_instance_override_object(_seq, {
    event_broadcast_message: function(_msg_data) {
        if (_msg_data[? "message"] == "shake_screen") {
            camera_shake(4, 30);  // your custom function
        }
        if (_msg_data[? "message"] == "play_roar") {
            audio_play_sound(snd_boss_roar, 10, false);
        }
    }
});
```

---

## Controlling Sequences at Runtime

```gml
// Pause / resume
layer_sequence_pause(seq_inst);
layer_sequence_play(seq_inst);

// Jump to a specific frame (head position)
layer_sequence_headpos(seq_inst, 30);  // jump to frame 30

// Get current playback position
var _pos = layer_sequence_headpos(seq_inst);

// Set playback speed (1.0 = normal, 0.5 = half speed, -1 = reverse)
layer_sequence_speedscale(seq_inst, 0.5);

// Destroy when done
if (layer_sequence_is_finished(seq_inst)) {
    layer_sequence_destroy(seq_inst);
}
```

---

## Sequences + Particles Together

Particle systems can be added as tracks in a sequence. The sequence timeline controls when the particle system activates:

1. In the Sequence Editor, drag a Particle System asset onto the timeline
2. Set the start frame and duration on the track
3. The particle system will automatically play/stop at those frames

> **Limitation:** Individual emitters within a particle system cannot be animated separately on the sequence timeline. The entire particle system is treated as one unit. For fine-grained control, use multiple particle system assets.

---

## Common Patterns

### Particle Trail Behind a Moving Object

```gml
/// Create_0.gml
trail_sys = part_system_create();
trail_type = part_type_create();
part_type_shape(trail_type, pt_shape_pixel);
part_type_size(trail_type, 1, 3, -0.05, 0);
part_type_life(trail_type, 20, 40);
part_type_colour3(trail_type, c_white, c_ltgray, c_gray);
part_type_alpha3(trail_type, 0.8, 0.4, 0);

trail_emit = part_emitter_create(trail_sys);

/// Step_0.gml — update emitter to current position
part_emitter_region(trail_sys, trail_emit, x - 2, x + 2, y - 2, y + 2,
    ps_shape_ellipse, ps_distr_linear);
part_emitter_stream(trail_sys, trail_emit, trail_type, 1);

/// Clean_Up_0.gml
part_type_destroy(trail_type);
part_system_destroy(trail_sys);
```

### Death Particles from Destroyed Instance

```gml
/// Destroy_0.gml — burst particles where the instance was
emit_explosion(x, y);  // reuse the shared burst function from earlier
```

### UI Animation with Sequences

```gml
/// Create_0.gml — animate a "Game Over" screen
layer_sequence_create("UI", room_width / 2, room_height / 2, seq_game_over);
// The sequence handles all fade-in, text animation, and button reveals
```

---

## Performance Guidelines

| Guideline | Why |
|-----------|-----|
| Cap active particles (< 1000 for mobile, < 5000 for desktop) | Each particle consumes GPU fill rate |
| Use additive blending sparingly | Overdraw from blending is expensive on large particles |
| Prefer built-in shapes over custom sprites | Built-in shapes use a shared atlas; custom sprites add texture swaps |
| Destroy emitters and systems you no longer need | Leaked systems keep updating and rendering invisibly |
| Use `part_emitter_enable()` to pause emitters | Cheaper than destroying and recreating |
| Avoid very long particle lifetimes (> 300 frames) | Accumulates particles that fill memory and slow rendering |
