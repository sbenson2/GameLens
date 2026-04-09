# G5 — Sprite Management and Animation in GameMaker

> **Category:** guide · **Engine:** GameMaker · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Object Events](G1_object_events.md) · [R2 Surfaces and Shaders](../reference/R2_surfaces_and_shaders.md)

---

## How GameMaker Handles Sprites

A **sprite** in GameMaker is a sequence of sub-images (frames) stored as a single asset. Every instance that draws itself references a sprite through `sprite_index`. Animation is handled automatically by the engine — it increments `image_index` each frame based on `image_speed`, cycling through sub-images in the Draw event.

Understanding the relationship between these built-in variables is essential for controlling what your game looks like.

---

## Core Sprite Instance Variables

Every instance has these built-in variables for sprite control:

| Variable | Type | Default | Purpose |
|----------|------|---------|---------|
| `sprite_index` | Asset | The sprite assigned in the object editor | Which sprite to draw |
| `image_index` | Real | `0` | Current frame (sub-image) — can be fractional |
| `image_speed` | Real | `1` | Frames advanced per game frame (0 = stopped) |
| `image_xscale` | Real | `1` | Horizontal scale (negative = flip) |
| `image_yscale` | Real | `1` | Vertical scale (negative = flip) |
| `image_angle` | Real | `0` | Rotation in degrees (counter-clockwise) |
| `image_alpha` | Real | `1` | Opacity (0 = invisible, 1 = fully opaque) |
| `image_blend` | Colour | `c_white` | Colour tint applied to the sprite |
| `image_number` | Real | — | **Read-only.** Total sub-images in `sprite_index` |

### How image_index Actually Works

`image_index` is a **floating-point** value. When `image_speed` is `1`, it increments by `1.0` each frame. If a sprite has 4 frames, the engine wraps with modulo:

```gml
// Internal (simplified) — this happens automatically before Draw
image_index = (image_index + image_speed) % image_number;
```

Because it's fractional, setting `image_speed = 0.5` means each sub-image displays for **2 game frames**. Setting it to `2` skips every other frame.

**Important:** `image_index` wraps silently. If you need to detect when an animation finishes, use the **Animation End** event or check manually:

```gml
// Step Event — detect last frame
if (image_index >= image_number - 1) && (image_speed > 0) {
    // Animation has reached its final frame
    on_animation_complete();
}
```

---

## Swapping Sprites Correctly

Changing `sprite_index` at runtime is the primary way to switch between animations (idle, run, attack, etc.). But there are gotchas.

### The image_index Reset Problem

When you assign a new sprite, `image_index` is **not** reset automatically. If the old sprite had 10 frames and `image_index` is at 8, but the new sprite only has 4 frames, GameMaker wraps it with modulo — you'll start at frame 0, but the transition can look janky.

```gml
// WRONG — image_index carries over, may start at unexpected frame
sprite_index = spr_player_attack;

// CORRECT — reset to frame 0 when switching animations
if (sprite_index != spr_player_attack) {
    sprite_index = spr_player_attack;
    image_index = 0;
}
```

The `if` guard prevents resetting `image_index` every frame, which would freeze the animation on frame 0.

### Sprite Swap Checklist

When switching sprites, verify:

1. **Origin alignment** — Both sprites should share the same origin point (e.g., bottom-center for characters) or your instance will visually jump.
2. **Collision mask** — If the new sprite has a different mask, collision detection changes immediately. Use `mask_index` to lock the collision mask to a specific sprite if needed.
3. **Frame count** — Reset `image_index` if the new sprite has fewer frames.
4. **Speed** — Set `image_speed` if the new animation should play at a different rate.

```gml
// Full sprite swap with all safeguards
if (sprite_index != spr_player_jump) {
    sprite_index = spr_player_jump;
    image_index = 0;
    image_speed = 1;
    mask_index = spr_player_collision;  // keep collision consistent
}
```

---

## Animation State Machines

For games with multiple character states (idle, run, jump, attack, hurt), a state machine prevents spaghetti animation code.

### Simple Enum-Based Animation Controller

```gml
// Create Event
enum PlayerAnim {
    IDLE,
    RUN,
    JUMP,
    FALL,
    ATTACK,
    HURT
}

current_anim = PlayerAnim.IDLE;

/// @func set_animation(anim, speed)
/// @desc Switch animation only if it's different from the current one
function set_animation(_anim, _speed = 1) {
    if (current_anim != _anim) {
        current_anim = _anim;
        image_speed = _speed;
        image_index = 0;
        
        switch (_anim) {
            case PlayerAnim.IDLE:   sprite_index = spr_player_idle;   break;
            case PlayerAnim.RUN:    sprite_index = spr_player_run;    break;
            case PlayerAnim.JUMP:   sprite_index = spr_player_jump;   break;
            case PlayerAnim.FALL:   sprite_index = spr_player_fall;   break;
            case PlayerAnim.ATTACK: sprite_index = spr_player_attack; break;
            case PlayerAnim.HURT:   sprite_index = spr_player_hurt;   break;
        }
    }
}
```

```gml
// Step Event — set animation based on state
if (is_hurt) {
    set_animation(PlayerAnim.HURT);
} else if (is_attacking) {
    set_animation(PlayerAnim.ATTACK, 1.5);  // slightly faster
} else if (!on_ground && vspeed < 0) {
    set_animation(PlayerAnim.JUMP);
} else if (!on_ground && vspeed > 0) {
    set_animation(PlayerAnim.FALL);
} else if (hspeed != 0) {
    set_animation(PlayerAnim.RUN);
} else {
    set_animation(PlayerAnim.IDLE);
}

// Flip sprite to face movement direction
if (hspeed != 0) {
    image_xscale = sign(hspeed);
}
```

**Priority order matters.** Check `hurt` before `attack` before `jump` — the first match wins. This prevents lower-priority animations from overriding important ones.

---

## Loading Sprites at Runtime

GameMaker can load sprites from files during gameplay. This is useful for modding support, user-generated content, or downloadable assets.

### sprite_add

```gml
// Load a PNG from the game's working directory
var _spr = sprite_add("sprites/custom_sword.png", 4, false, false, 16, 16);
// Args: filename, sub-image count, remove_background, smooth, x_origin, y_origin

if (_spr != -1) {
    sprite_index = _spr;
} else {
    show_debug_message("Failed to load sprite");
}
```

**Memory warning:** Sprites loaded with `sprite_add` are **not** managed by the asset system. You must free them manually with `sprite_delete()` when done, or you'll leak VRAM.

```gml
// Clean Up Event
if (custom_sprite != -1) {
    sprite_delete(custom_sprite);
}
```

### sprite_create_from_surface

Create sprites dynamically from a surface — useful for screenshot thumbnails, procedural visuals, or composite sprites:

```gml
var _surf = surface_create(64, 64);
surface_set_target(_surf);
draw_clear_alpha(c_black, 0);
// Draw whatever you want onto this surface
draw_sprite(spr_base_armor, 0, 0, 0);
draw_sprite(spr_helmet, 0, 0, 0);
surface_reset_target();

// Create a sprite from the surface
composite_sprite = sprite_create_from_surface(_surf, 0, 0, 64, 64, false, false, 32, 32);
surface_free(_surf);
```

---

## Skeletal Animation (Spine)

GameMaker supports **Spine** skeletal animations natively. Instead of frame-by-frame sub-images, Spine sprites use bones, meshes, and keyframes for smooth, memory-efficient animation.

### Setting Up Spine Sprites

1. Export from Spine as **JSON** (not binary) with the accompanying atlas.
2. Import the `.json` file into GameMaker's Sprite Editor — it auto-detects as skeletal.
3. Assign the sprite to an object normally.

### Controlling Spine Animations in GML

```gml
// Set the current animation (track 0 = base layer)
skeleton_animation_set("run");

// Blend between animations (e.g., walk to run over 0.3 seconds)
skeleton_animation_mix("walk", "run", 0.3);

// Layer animations on different tracks
// Track 0: body movement, Track 1: upper body action
skeleton_animation_set("run");          // track 0 (default)
skeleton_animation_set_ext("shoot", 1); // track 1 — upper body

// Check current animation
var _anim = skeleton_animation_get();
```

### Spine Caveats

- The **Animation End** event fires for Spine sprites when a non-looping animation completes. It does **not** fire if you draw the sprite manually with `draw_skeleton()` — only with the default draw or `draw_self()`.
- Spine 4.0+ changed rotation interpolation. If upgrading from Spine 3.x, test rotational animations for unexpected behavior.
- Skeletal sprites cannot be manipulated with `sprite_add` or surface functions — they're a separate rendering path.

---

## Performance Considerations

### Texture Pages

GameMaker packs sprites onto **texture pages** (atlases). Sprites on the same texture page draw faster because the GPU doesn't need to swap textures. In the Sprite Editor:

- **Group related sprites** on the same texture group (Settings → Texture Groups).
- Keep sprite dimensions as **powers of two** when possible for efficient packing.
- Large sprites (512×512+) may get their own texture page — be aware of the GPU memory cost.

### Draw Call Optimization

```gml
// SLOW — drawing sprites from different texture pages in random order
draw_sprite(spr_background, 0, x, y);    // Texture page A
draw_sprite(spr_enemy, 0, x, y);         // Texture page B
draw_sprite(spr_background_overlay, 0, x, y);  // Back to page A — texture swap!

// FAST — draw all sprites from the same texture page together
// (GameMaker's depth sorting usually handles this, but manual draw
//  order in a Draw event should respect texture groups)
```

### Animation Speed vs. Frame Count

More sub-images = more VRAM. For background animations or secondary elements, consider:

- Fewer frames with `image_speed < 1` (each frame displays longer).
- Programmatic animation (bobbing with `sin()`, rotation via `image_angle`) instead of sprite frames.

```gml
// Programmatic bobbing — zero extra frames needed
y = base_y + sin(current_time / 300) * 4;

// Programmatic rotation for coin/pickup spin
image_angle += 3;  // 3 degrees per frame
```

---

## Quick Reference

| Task | Code |
|------|------|
| Stop animation | `image_speed = 0;` |
| Set to specific frame | `image_speed = 0; image_index = 3;` |
| Play once then stop | Check `image_index >= image_number - 1` in Step, then set `image_speed = 0` |
| Flip horizontally | `image_xscale = -1;` |
| Tint red | `image_blend = c_red;` |
| Fade out | `image_alpha -= 0.02;` (in Step) |
| Load external sprite | `var s = sprite_add("file.png", 1, false, false, 0, 0);` |
| Free loaded sprite | `sprite_delete(s);` |
| Set Spine animation | `skeleton_animation_set("anim_name");` |
| Blend Spine animations | `skeleton_animation_mix("from", "to", duration);` |
