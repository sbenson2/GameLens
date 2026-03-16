# 2D Character Controller -- Theory & Concepts

This document covers engine-agnostic platformer character controller theory. For engine-specific implementations, see the relevant engine module.

---

## Kinematic vs Physics-Based

| Approach | Description | Used By |
|----------|-------------|---------|
| **Physics-based** | Apply forces/impulses to a rigid body; physics engine resolves movement | Puzzle platformers, ragdoll games |
| **Kinematic** | Directly set velocity each frame; handle collision manually | Celeste, Hollow Knight, Dead Cells, Mega Man, Mario |

Almost every celebrated platformer uses kinematic control. Physics engines solve for realism, not fun. A physically accurate jump has a fixed parabolic arc. A fun jump has variable height, coyote time, jump buffering, apex hang, and a dozen other "lies" that make the game feel responsive.

**Rule of thumb:** If you are using force-based movement on the player character, you have lost control of game feel. Set velocity directly.

---

## Deriving Jump Parameters from Design Values

Instead of tuning raw gravity and velocity numbers, express jumps as designer-friendly values:

- **Jump height** -- how high in pixels
- **Time to apex** -- how long in seconds to reach peak

Derive the physics values:

```
gravity       = 2 * jump_height / time_to_apex^2
jump_velocity = 2 * jump_height / time_to_apex
```

This lets designers say "I want a 72px jump that takes 0.35s to peak" and get exact values.

---

## Variable-Height Jump

When the player releases the jump button early, increase gravity to cut the jump short:

```
if falling (velocity.y > 0):
    gravity *= fall_multiplier           // heavier on descent (1.5--2.5)
else if rising and jump not held:
    gravity *= fall_multiplier           // released early, cut arc
else if near apex and jump held:
    gravity *= apex_multiplier           // float at top (0.4--0.7)
```

This single system creates the feel of "tap for short hop, hold for full jump."

---

## Coyote Time

Allow the player to jump for a short window after walking off a ledge. Physically impossible, but essential for responsive platforming.

```
if just_left_ground (was_grounded and not is_grounded):
    coyote_timer = coyote_duration      // typically 0.08--0.12 seconds

each frame:
    if not grounded:
        coyote_timer -= dt

    if jump_pressed and (grounded or coyote_timer > 0):
        execute_jump()
        coyote_timer = 0
```

---

## Jump Buffering

If the player presses jump while airborne (just before landing), buffer the input and execute it upon landing.

```
if jump_pressed:
    jump_buffer_timer = buffer_duration    // typically 0.06--0.13 seconds

each frame:
    jump_buffer_timer -= dt
    if grounded and jump_buffer_timer > 0:
        execute_jump()
        jump_buffer_timer = 0
```

---

## Ground Detection

Cast multiple rays downward from the bottom of the collider. A single center ray misses edges; three or more rays catch them.

```
rays: left_foot, center, right_foot
skin_width = 2px (rays start slightly inside the collider)
check_distance = skin_width + 1px

for each ray:
    if ray hits solid within check_distance:
        is_grounded = true
        snap entity to ground surface
```

### State Transitions

Track `was_grounded` from the previous frame to detect:
- **Just landed:** `grounded and not was_grounded` -- reset jump count, snap to ground
- **Just left ground:** `not grounded and was_grounded` -- start coyote timer

---

## Horizontal Movement

### Acceleration Model

Instant velocity changes feel robotic. Use acceleration/deceleration for responsive but weighted movement:

```
function apply_movement(velocity, input_x, dt, is_grounded):
    accel = ground_accel if is_grounded else air_accel
    decel = ground_decel if is_grounded else air_decel

    if abs(input_x) > 0:
        // Turning? Apply turn multiplier for snappier direction changes
        turning = (velocity.x > 0 and input_x < 0) or (velocity.x < 0 and input_x > 0)
        effective_accel = accel * turn_multiplier if turning else accel
        target = input_x * max_speed
        velocity.x = move_toward(velocity.x, target, effective_accel * dt)
    else:
        velocity.x = move_toward(velocity.x, 0, decel * dt)
```

### Why Separate Air/Ground Values?

| Parameter | Ground | Air | Effect |
|-----------|--------|-----|--------|
| Acceleration | High (1800) | Lower (1200) | Committed air trajectory, slight control |
| Deceleration | High (2400) | Low (600) | Crisp ground stops, floaty air momentum |

This creates commitment -- once airborne, you can adjust but not instantly reverse.

---

## Wall Mechanics

### Wall Slide

When pressing into a wall while airborne, cap fall speed to a slow slide:

```
if on_wall and not grounded and velocity.y > 0:
    velocity.y = min(velocity.y, wall_slide_speed)    // e.g., 60 px/s
```

### Wall Jump

Launch away from the wall with both horizontal and vertical velocity:

```
velocity.x = -wall_direction * wall_jump_h_velocity
velocity.y = -wall_jump_v_velocity
```

Briefly override input to prevent the player from immediately returning to the wall.

---

## One-Way Platforms

Allow passing through from below, standing on top:

```
skip_collision = velocity.y < 0 OR entity_bottom > platform_top + tolerance
```

**Drop-through:** On down+jump input, set a timer that skips all one-way platform collisions for ~0.2 seconds.

---

## Moving Platforms

After the platform moves, apply its delta to any entity standing on it:

```
platform_delta = platform.position - platform.previous_position
rider.position += platform_delta
```

---

## Corner Correction

When the player barely clips a corner while jumping, nudge them horizontally to clear it. Check a few pixels to each side; if shifting resolves the collision, apply the shift. This prevents frustrating "caught on corner" moments.

---

## Dash / Dodge

```
on dash input:
    if dash_cooldown_timer <= 0:
        is_dashing = true
        dash_timer = dash_duration        // e.g., 0.15s
        velocity = dash_direction * dash_speed
        dash_cooldown_timer = dash_cooldown

during dash:
    ignore gravity
    dash_timer -= dt
    if dash_timer <= 0:
        is_dashing = false
```

Optionally grant invincibility frames during the dash.

---

## Sub-Pixel Accumulation

For pixel-art games at low speeds, movement per frame may be less than 1 pixel. Accumulate the fractional remainder:

```
remainder_x += velocity.x * dt
move_x = round(remainder_x)
remainder_x -= move_x
position.x += move_x
```

This ensures smooth low-speed movement without sub-pixel rendering artifacts.

---

## Tuning Reference Table

| Parameter | Typical Value | Notes |
|-----------|---------------|-------|
| Move speed | 200 px/s | Ground horizontal speed |
| Ground acceleration | 1800 px/s^2 | Responsive ground control |
| Ground deceleration | 2400 px/s^2 | Crisp stops |
| Air acceleration | 1200 px/s^2 | Moderate air control |
| Air deceleration | 600 px/s^2 | Momentum preservation |
| Turn multiplier | 2.0 | Snappy direction reversal |
| Jump height | 72 px | Desired apex height |
| Time to apex | 0.35s | Seconds to reach peak |
| Fall gravity multiplier | 2.0 | Heavier descent |
| Max fall speed | 400 px/s | Terminal velocity |
| Apex gravity multiplier | 0.5 | Float at peak |
| Coyote time | 0.1s | ~6 frames at 60fps |
| Jump buffer | 0.133s | ~8 frames at 60fps |
| Wall slide speed | 60 px/s | Slow descent on wall |
| Dash speed | 500 px/s | Dash velocity |
| Dash duration | 0.15s | How long a dash lasts |

---

*Implementation examples are available in engine-specific modules.*
