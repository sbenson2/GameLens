# G10 — Collision Detection and Physics in GameMaker

> **Category:** guide · **Engine:** GameMaker · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Object Events](G1_object_events.md) · [G5 Sprite Management](G5_sprite_management_and_animation.md) · [R2 Surfaces and Shaders](../reference/R2_surfaces_and_shaders.md)

---

## Two Collision Systems

GameMaker has **two separate collision systems** that must not be mixed:

| System | How It Works | When to Use |
|--------|-------------|-------------|
| **Traditional (mask-based)** | You check for overlaps manually in Step/Collision events using functions like `place_meeting` | Platformers, top-down games, tile-based games — most 2D games |
| **Box2D Physics** | The engine simulates physics automatically; you set properties and apply forces | Games that need realistic physics (billiards, Angry Birds clones, ragdolls) |

```
Rule: Never mix the two systems on the same object.
      Physics-enabled instances ignore collision masks and use fixtures instead.
      Standard collision functions (place_meeting, etc.) are NOT reliable
      for physics-enabled instances.
```

---

## Traditional Collision System

### Collision Masks

Every sprite can have a **collision mask** — the area that counts as "solid" for collision checks. Configure it in the Sprite Editor:

| Mask Property | Options | Notes |
|--------------|---------|-------|
| **Shape** | Rectangle, Ellipse, Diamond, Precise, Precise (Per Frame) | Precise checks every pixel but is slower |
| **Bounding Box** | Automatic, Full Image, Manual | Manual lets you trim the mask smaller than the sprite |
| **Tolerance** | 0–255 | For precise masks — alpha threshold below which pixels are "empty" |

Setting a dedicated collision sprite is a common optimisation:

```gml
// In Create event — use a simpler shape for collisions
mask_index = spr_player_collision_box;
// sprite_index still controls what is drawn
```

### Core Collision Functions

These are the workhorses. All take a position to test and return information about what's there.

#### Existence Checks (return `true`/`false`)

```gml
// place_meeting — is there ANY instance of obj at this position?
// Most commonly used for movement blocking
if (!place_meeting(x + move_x, y, obj_wall)) {
    x += move_x;
}
if (!place_meeting(x, y + move_y, obj_wall)) {
    y += move_y;
}

// place_free — is the position free of ALL solid-flagged instances?
// Useful when you don't care which specific object blocks you
if (place_free(x + move_x, y)) {
    x += move_x;
}

// place_empty — is the position free of ALL instances (solid or not)?
if (place_empty(x, y + 1)) {
    // nothing below us at all
}
```

#### Instance Retrieval (return an instance id or `noone`)

```gml
// instance_place — like place_meeting but returns the colliding instance
var _hit = instance_place(x, y + 1, obj_enemy);
if (_hit != noone) {
    _hit.hp -= 10;  // damage the specific enemy we landed on
}

// instance_position — checks a single point (not the full mask)
var _clicked = instance_position(mouse_x, mouse_y, obj_button);
```

#### Geometric Checks

```gml
// collision_rectangle — check an arbitrary rectangle
var _in_zone = collision_rectangle(
    zone_x1, zone_y1, zone_x2, zone_y2,
    obj_enemy, false, true  // prec, notme
);

// collision_line — raycast between two points
var _line_of_sight = collision_line(
    x, y, target.x, target.y,
    obj_wall, false, true
);
if (_line_of_sight == noone) {
    // clear line of sight to target — no wall in the way
}

// collision_circle — check a circular area
var _nearby = collision_circle(x, y, 128, obj_pickup, false, true);

// collision_point — check a single pixel
var _at_point = collision_point(mouse_x, mouse_y, obj_tile, false, true);
```

**Parameters explained:**
- `prec` (bool) — `true` uses the precise collision mask; `false` uses the bounding box only (faster)
- `notme` (bool) — `true` excludes the calling instance from results

### The Collision Event vs. Manual Checks

GameMaker offers a **Collision event** in the object editor (drag an object onto the collision event list). This fires automatically when two instances overlap. However, most experienced developers prefer manual checks in the Step event because:

1. The Collision event fires *after* the position update — you're already overlapping
2. Manual checks let you test a position *before* moving, preventing overlap entirely
3. Manual checks give you finer control over resolution order

```gml
// Preferred pattern: check BEFORE moving (Step event)
var _spd = 4;
var _move_x = keyboard_check(vk_right) - keyboard_check(vk_left);
var _move_y = keyboard_check(vk_down) - keyboard_check(vk_up);

// Horizontal
if (!place_meeting(x + _spd * _move_x, y, obj_wall)) {
    x += _spd * _move_x;
}
// Vertical (separate check allows sliding along walls)
if (!place_meeting(x, y + _spd * _move_y, obj_wall)) {
    y += _spd * _move_y;
}
```

### Pixel-Perfect Movement with Collision

When the speed isn't `1`, you can overshoot a wall. The standard fix is a **while-loop nudge**:

```gml
// Move as far as possible toward the wall, 1 pixel at a time
var _spd = 6;

if (place_meeting(x + _spd * _move_x, y, obj_wall)) {
    // We WILL collide — creep up to the wall pixel by pixel
    while (!place_meeting(x + sign(_move_x), y, obj_wall)) {
        x += sign(_move_x);
    }
    // Now flush against the wall — zero out horizontal velocity
    hspeed_current = 0;
} else {
    x += _spd * _move_x;
}
```

---

## Box2D Physics System

GameMaker integrates [Box2D](https://box2d.org/) for rigid-body physics. You enable it per-room in the Room Editor (**Physics → Physics World → Enabled**). Once a room has physics enabled, any physics-enabled objects in that room are simulated.

### Enabling Physics on an Object

In the Object Editor → **Physics** panel:

| Property | Purpose |
|----------|---------|
| **Uses Physics** | Turns on Box2D for this object |
| **Sensor** | Detects overlaps but doesn't physically block (`true` = trigger zone) |
| **Density** | Mass per unit area — higher = heavier |
| **Restitution** | Bounciness (0 = no bounce, 1 = perfect bounce) |
| **Friction** | Surface drag against other bodies |
| **Linear Damping** | Air resistance for movement |
| **Angular Damping** | Air resistance for rotation |
| **Collision Group** | Negative = never collide with same group; Positive = always collide with same group |

### Fixtures (Collision Shapes)

Physics objects don't use sprite collision masks. Instead you define **fixtures** — collision shapes attached to the body:

```gml
// In Create event — add a circular fixture at runtime
var _fix = physics_fixture_create();
physics_fixture_set_circle_shape(_fix, 16);  // radius 16
physics_fixture_set_density(_fix, 0.5);
physics_fixture_set_restitution(_fix, 0.3);
physics_fixture_set_friction(_fix, 0.7);
physics_fixture_bind(_fix, id);
physics_fixture_delete(_fix);  // the binding persists; delete the definition
```

Available fixture shapes:
- `physics_fixture_set_circle_shape(fixture, radius)`
- `physics_fixture_set_box_shape(fixture, half_width, half_height)`
- `physics_fixture_set_polygon_shape(fixture)` + `physics_fixture_add_point(fixture, x, y)` (max 8 vertices, convex only)
- `physics_fixture_set_chain_shape(fixture, loop)` — for terrain edges

### Applying Forces and Impulses

```gml
// Force — gradual acceleration (use in Step for sustained thrust)
physics_apply_force(x, y, force_x, force_y);

// Impulse — instant velocity change (use for jumps, explosions)
physics_apply_impulse(x, y, impulse_x, impulse_y);

// Local force — relative to the body's rotation
physics_apply_local_force(0, 0, 0, -200);  // thrust "forward"

// Torque — rotational force
physics_apply_torque(500);
```

### Physics Collision Events

With physics enabled, the **Collision event** works differently — it gives you access to contact information:

```gml
// In Collision event with obj_wall
// These local variables are automatically available:
// phy_collision_x, phy_collision_y — contact point
// phy_collision_xnormal, phy_collision_ynormal — surface normal

// Example: spawn sparks at the contact point
instance_create_layer(phy_collision_x, phy_collision_y, "Effects", obj_spark);
```

### Joints

Joints connect two physics bodies:

| Joint Type | Function | Use Case |
|-----------|----------|----------|
| Revolute | `physics_joint_revolute_create` | Hinges, wheels, doors |
| Prismatic | `physics_joint_prismatic_create` | Pistons, sliding platforms |
| Distance | `physics_joint_distance_create` | Fixed-length ropes, springs |
| Pulley | `physics_joint_pulley_create` | Pulleys, counterweights |
| Weld | `physics_joint_weld_create` | Rigid attachment (breakable bodies) |
| Rope | `physics_joint_rope_create` | Maximum-distance constraint |
| Gear | `physics_joint_gear_create` | Connect two revolute/prismatic joints |

---

## Common Patterns

### Platformer Ground Check

```gml
// Check 1 pixel below — standard ground detection
on_ground = place_meeting(x, y + 1, obj_solid);

// Apply gravity only when airborne
if (!on_ground) {
    vspd += grav;
} else {
    vspd = 0;
}
```

### One-Way Platforms (Traditional)

```gml
// In Step event — only block if moving downward and feet are above platform
if (vspd >= 0) {
    if (place_meeting(x, y + vspd, obj_one_way_platform)) {
        while (!place_meeting(x, y + 1, obj_one_way_platform)) {
            y += 1;
        }
        vspd = 0;
    }
}
// Moving upward — ignore the platform entirely
```

### Collecting Items Without Blocking

```gml
// obj_coin — NOT marked as solid
// In player Step event:
var _coin = instance_place(x, y, obj_coin);
if (_coin != noone) {
    score += _coin.value;
    instance_destroy(_coin);
}
```

---

## Performance Tips

1. **Minimise precise collisions.** Use rectangle or ellipse masks whenever the visual difference is negligible. Precise-per-frame is the slowest option.
2. **Separate collision and draw sprites.** A 128×128 character sprite with a 16×32 collision box is standard practice (`mask_index`).
3. **Limit `collision_line` calls.** Each one is a raycast — doing line-of-sight for 50 enemies every frame adds up. Use distance checks first to cull distant enemies.
4. **Use collision groups in physics** to skip unnecessary pair checks. Bullets that shouldn't hit each other should share a negative group.
5. **Tile collisions with `tilemap_get_at_pixel`** can be faster than placing hundreds of wall objects. GameMaker's tilemap collision functions avoid the overhead of instance management.

---

## Quick Reference

| Task | Traditional Function | Physics Equivalent |
|------|---------------------|--------------------|
| Block movement | `place_meeting` | Set fixture as non-sensor |
| Detect overlap | `instance_place` / `collision_*` | Fixture with `sensor = true` |
| Push an object | Direct `x`/`y` manipulation | `physics_apply_force` / `physics_apply_impulse` |
| Raycast | `collision_line` | `physics_raycast` (GameMaker 2023.8+) |
| Get contact point | N/A | `phy_collision_x/y` in Collision event |
| Connect bodies | N/A | `physics_joint_*_create` |
