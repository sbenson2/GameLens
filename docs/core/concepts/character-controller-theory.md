# Character Controller -- Theory & Concepts

This document covers engine-agnostic 2D platformer character controller theory. For engine-specific implementations, see the relevant engine module.

---

## Controller Philosophy

### Kinematic vs Physics-Based

| Approach | Description | Used By |
|----------|-------------|---------|
| **Physics-based** | Apply forces/impulses to a rigid body, let the physics engine resolve | Puzzle platformers, ragdoll games |
| **Kinematic** | Directly set velocity each frame, handle collision manually | Celeste, Hollow Knight, Dead Cells, Mega Man, Mario |

Almost every celebrated platformer uses kinematic control. Physics engines solve for realism, not fun. A physically accurate jump has a fixed parabolic arc. A fun jump has variable height, coyote time, jump buffering, apex hang, and many other intentional deviations from reality.

### Game Feel First

Design controller parameters around what feels right, not what is physically correct:

- **Jump height** and **time to apex** are the primary designer inputs -- gravity is derived from these
- Fall speed uses a separate (higher) gravity multiplier so descents feel snappy
- Acceleration curves differ between ground and air
- The player can jump after walking off a ledge (coyote time) -- physically impossible, but essential

**Rule of thumb:** If you are applying forces to your player character, you have already lost control of game feel. Set velocity directly.

---

## Core Data

A platformer controller needs the following state, all in one place for easy tuning:

### Position & Velocity

- **Position:** World-space coordinates with sub-pixel remainder accumulators (for smooth low-speed movement)
- **Velocity:** Current speed in pixels per second (X and Y)

### Collider

An axis-aligned bounding box (AABB) offset from the entity origin. Track left/right/top/bottom edges relative to position.

### Grounded State

- `is_grounded` -- whether the entity is standing on solid ground
- Ground surface normal (for slope handling)
- Reference to the platform entity being stood on (for moving platforms)
- `was_grounded` -- previous frame's state (for transition detection)

---

## Ground Detection

Ground detection is the foundation everything else builds on.

### Multi-Ray Approach

Cast multiple rays downward from the bottom of the collider. A single center ray misses edges; three or more rays catch them reliably.

```
function check_ground(position, collider, solids):
    skin_width = 2     // rays start slightly inside collider
    check_distance = skin_width + 1

    left  = collider.left(position) + skin_width
    right = collider.right(position) - skin_width
    bottom = collider.bottom(position) - skin_width

    ray_count = 3
    shortest_hit = MAX_FLOAT
    hit_found = false

    for i = 0 to ray_count - 1:
        t = i / (ray_count - 1)    // 0.0 to 1.0
        ray_x = lerp(left, right, t)
        ray_start_y = bottom
        ray_end_y = bottom + check_distance

        for each solid in solids:
            if ray_x < solid.left or ray_x > solid.right: skip
            if solid.top >= ray_start_y and solid.top <= ray_end_y:
                distance = solid.top - ray_start_y
                if distance < shortest_hit:
                    shortest_hit = distance
                    ground_y = solid.top
                    hit_found = true

    return hit_found, ground_y
```

### State Transitions

Track grounded transitions carefully for coyote time and landing events:

```
was_grounded = is_grounded
is_grounded = check_ground(...)

// Just landed
if is_grounded and not was_grounded:
    jumps_remaining = max_jumps
    snap position to ground surface

// Just left ground (walked off ledge, not jumped)
if not is_grounded and was_grounded and velocity.y >= 0:
    start coyote timer
```

---

## Horizontal Movement

### Acceleration Model

Instant velocity changes feel robotic. Acceleration and deceleration curves add weight and responsiveness.

```
function apply_horizontal(velocity, controller, input_x, dt, is_grounded):
    accel = ground_acceleration if is_grounded else air_acceleration
    decel = ground_deceleration if is_grounded else air_deceleration

    if abs(input_x) > 0.01:
        // Update facing direction
        facing = sign(input_x)

        // Apply turn multiplier when reversing direction
        turning = (velocity.x > 0 and input_x < 0) or (velocity.x < 0 and input_x > 0)
        effective_accel = accel * turn_multiplier if turning else accel

        // Accelerate toward target speed
        target = input_x * move_speed
        velocity.x = move_toward(velocity.x, target, effective_accel * dt)
    else:
        // Decelerate to zero
        velocity.x = move_toward(velocity.x, 0, decel * dt)

function move_toward(current, target, max_delta):
    if abs(target - current) <= max_delta: return target
    return current + sign(target - current) * max_delta
```

### Why Separate Air/Ground Values?

| Parameter | Ground | Air | Effect |
|-----------|--------|-----|--------|
| Acceleration | High (1800) | Lower (1200) | Committed air trajectory, slight control |
| Deceleration | High (2400) | Low (600) | Crisp ground stops, floaty air momentum |

This creates the feel of commitment -- once airborne, the player can adjust but not instantly reverse. Ground movement is responsive and tight.

---

## Jump System

The jump system is where game feel lives or dies.

### Deriving Gravity from Designer Values

Instead of tuning raw gravity and velocity numbers, express jumps as designer-friendly values:

- **Jump height** -- how high in pixels
- **Time to apex** -- how long in seconds to reach peak

Derived values:

```
gravity       = 2 * jump_height / time_to_apex^2
jump_velocity = 2 * jump_height / time_to_apex
```

This lets designers say "I want a 72px jump that takes 0.35s to peak" and get exact values.

### Variable-Height Jump

When the player releases the jump button early, increase gravity to cut the jump short. This gives the player control over jump height:

```
function apply_gravity(velocity, controller, jump_held, dt):
    if is_dashing: return    // no gravity during dash

    gravity = base_gravity

    if velocity.y > 0:                             // falling
        gravity *= fall_gravity_multiplier
    else if velocity.y < 0 and not jump_held:      // released jump early
        gravity *= fall_gravity_multiplier
    else if abs(velocity.y) < apex_threshold and jump_held:  // near apex, holding jump
        gravity *= apex_gravity_multiplier          // float at the top

    velocity.y = min(velocity.y + gravity * dt, max_fall_speed)
```

### Apex Float

When the player is near the peak of their jump (velocity close to zero) and holding the jump button, reduce gravity. This creates a brief hang time that:

- Makes precision platforming more forgiving
- Feels satisfying -- the character "hangs" at the top
- Gives the player more air-control time

The `apex_threshold` (e.g., 40 px/s) defines the velocity window. The `apex_gravity_multiplier` (e.g., 0.5) controls how much float.

### Multi-Jump (Double/Triple Jump)

Track `jumps_remaining`. Reset to `max_jumps` on landing. Each jump press decrements the counter. The first jump (from ground or coyote) also consumes one.

---

## Coyote Time

Named after Wile E. Coyote running off a cliff and not falling until he looks down.

### What It Does

After walking off a ledge (not jumping), the player has a brief grace period where pressing jump still works. Without this, players feel like the game "ate" their input because they pressed jump 1--2 frames after leaving the edge.

### Implementation

```
// When leaving ground without jumping (velocity is downward or zero):
if not is_grounded and was_grounded and velocity.y >= 0:
    coyote_timer = coyote_time

// Tick down every frame when airborne:
if not is_grounded:
    coyote_timer -= dt

// In jump check, coyote time counts as "grounded":
can_jump = is_grounded or coyote_timer > 0 or jumps_remaining > 0
```

### Typical Values

| Frames (60fps) | Time (seconds) | Feel |
|----------------|----------------|------|
| 3--4 | 0.050--0.066 | Barely noticeable, tight |
| 5--7 | 0.083--0.116 | Standard -- feels fair |
| 8--10 | 0.133--0.166 | Generous -- very forgiving |

Most shipped games use 5--8 frames (0.083--0.133s). Celeste uses approximately 5 frames.

---

## Jump Buffering

### What It Does

If the player presses jump while airborne (a few frames before landing), the jump executes the instant they touch ground. Without this, fast players who press jump 2 frames before landing get nothing.

### Implementation

```
// When jump is pressed (regardless of grounded state):
if jump_pressed:
    jump_buffer_timer = jump_buffer_time

// Tick down:
jump_buffer_timer -= dt

// On landing, check buffer:
if is_grounded and jump_buffer_timer > 0:
    execute jump
    jump_buffer_timer = 0
```

### Typical Values

| Frames (60fps) | Time (seconds) | Feel |
|----------------|----------------|------|
| 4--5 | 0.066--0.083 | Tight -- skilled players only |
| 6--8 | 0.100--0.133 | Standard -- feels responsive |
| 9--12 | 0.150--0.200 | Very generous |

**Coyote time + jump buffering together** is what makes a platformer feel "tight but fair." They solve opposite problems: coyote time handles "jumped too late" and buffering handles "jumped too early."

---

## Wall Mechanics

### Wall Detection

Mirror the ground-detection approach but cast rays horizontally from the side of the collider in the facing direction.

### Wall Slide

When the player is against a wall, falling, and holding toward the wall, cap fall speed to a slow slide:

```
if is_on_wall and velocity.y > 0 and input_x == wall_direction:
    velocity.y = min(velocity.y, wall_slide_speed)
```

### Wall Jump

A wall jump pushes the player away from the wall and upward:

```
if jump_pressed and is_on_wall and not is_grounded:
    velocity.x = -wall_direction * wall_jump_h_velocity
    velocity.y = -wall_jump_v_velocity
    is_on_wall = false
    facing_direction = -wall_direction
```

**Design choice:** Some games (Celeste) let you wall jump without holding toward the wall. Others (Mega Man X) require it. The "no-hold" approach is more forgiving.

### Wall Cling

Optional mechanic: the player sticks to the wall for a brief period before sliding. Use a timer that starts when first touching the wall. While the timer is active, set vertical velocity to zero. When it expires, transition to wall slide.

---

## Slopes

Slopes are where many controllers fall apart. Without special handling, the player bounces down slopes, jitters on transitions, or slides on walkable surfaces.

### Ground Normal

The ground normal tells you the slope angle. Compute the slope angle from the surface normal using `acos(dot(normal, up_vector))`.

### Slope Movement

Project horizontal velocity onto the slope surface tangent:

```
function adjust_for_slope(velocity, ground_normal):
    angle = slope_angle(ground_normal)
    if angle < 0.5: return             // flat ground
    if angle > max_slope_angle:        // too steep -- slide down
        velocity.x += normal.x * slide_force * dt
        return

    // Project movement onto slope tangent
    tangent_x = -normal.y
    tangent_y =  normal.x
    speed = abs(velocity.x)
    velocity = (tangent_x * speed, tangent_y * speed)
```

### Slope Snapping

When walking down a slope, snap the player to the ground surface. Without this, the player "bounces" off the slope on each step. Cast a ray further down than the normal ground check and snap if the gap is within a threshold (e.g., 8 pixels).

### Common Slope Problems

| Problem | Solution |
|---------|----------|
| Bouncing when running downhill | Snap to ground on descent |
| Sliding on gentle slopes when idle | Zero velocity on walkable slopes with no input |
| Jittering at slope transitions | Increase snap distance, use multiple ground rays |
| Wrong speed on slopes | Project velocity onto slope tangent |
| Walking up walls | Enforce max slope angle check |

---

## One-Way Platforms

Platforms the player can jump through from below but stand on from above.

### Detection Logic

Only collide when:
1. The player is moving downward (velocity.y >= 0)
2. The player's feet were above the platform top on the previous frame

### Drop-Through

When the player presses down (+ jump, depending on the game), temporarily ignore one-way platforms. Set a short timer (0.15s) during which one-way collisions are skipped, and nudge the player slightly below the platform surface.

---

## Moving Platforms

### Two Approaches

| Approach | Pros | Cons |
|----------|------|------|
| **Velocity inheritance** | Simple, no coupling | Rounding errors, can drift |
| **Position parenting** | Exact tracking | Must handle attach/detach, rotation is complex |

**Velocity transfer:** Each frame, add the platform's velocity to the rider's position directly.

**Position parenting:** On landing, store the player's local offset from the platform center. Each frame, reconstruct world position from the platform position plus the stored offset.

### Attach / Detach

- **Attach** when ground detection identifies a moving platform entity
- **Detach** when no longer grounded, ground entity changes, or player jumps
- On detach, optionally inherit the platform's velocity for momentum

---

## Ladders & Climbing

Ladders override normal movement with vertical climbing:

- **Snap to ladder center** on entry for clean visuals
- **Disable gravity** while climbing
- **Vertical movement** controlled by up/down input at a fixed climb speed
- **Allow jump-off** with directional input for fluid movement
- **Exit at top/bottom** -- clamp position to ladder bounds
- Optional slight horizontal drift while climbing (e.g., 30% of climb speed)

---

## Dash / Dodge

### Core Mechanic

```
function try_dash(velocity, controller, dash_pressed, input_x, input_y):
    if not dash_pressed: return
    if is_dashing: return
    if dash_cooldown_timer > 0: return

    is_dashing = true
    dash_timer = dash_duration
    dash_cooldown_timer = dash_cooldown

    // Determine direction (default to facing direction if no input)
    dir_x = input_x
    dir_y = input_y
    if abs(dir_x) < 0.1 and abs(dir_y) < 0.1:
        dir_x = facing_direction
        dir_y = 0

    // Normalize for diagonal dashes
    length = sqrt(dir_x^2 + dir_y^2)
    if length > 0.01:
        dir_x /= length
        dir_y /= length

    velocity = (dir_x * dash_speed, dir_y * dash_speed)

function update_dash(velocity, controller, dt):
    if dash_cooldown_timer > 0: dash_cooldown_timer -= dt
    if not is_dashing: return

    dash_timer -= dt
    if dash_timer <= 0:
        is_dashing = false
        velocity = (velocity.x * 0.3, 0)    // bleed off speed (design choice)

    // During dash: no gravity, skip normal movement
```

### Design Considerations

- **No gravity** during dash (handled by gravity system checking is_dashing)
- **Invincibility frames** during dash for dodge mechanics
- **Ghost trail effect:** Spawn fading afterimage sprites at the player's position every few frames during the dash
- **Cooldown** prevents dash spam

---

## Corner Correction

### The Problem

The player jumps and the top corner of their collider clips a block by 2 pixels. Without correction, the jump is killed and the player falls. This is infuriating.

### The Fix

When an upward collision is detected, check if nudging the player left or right by a few pixels would clear the obstruction:

```
function try_corner_correct(position, collider, velocity, solids):
    if velocity.y >= 0: return false       // only when moving upward
    if not has_ceiling_collision(position, collider, solids): return false

    max_correction = 6    // pixels
    step = 1

    for offset = step to max_correction:
        // Try right
        if not has_ceiling_collision(position + (offset, 0), collider, solids):
            position.x += offset
            return true
        // Try left
        if not has_ceiling_collision(position + (-offset, 0), collider, solids):
            position.x -= offset
            return true

    return false
```

Celeste uses up to 4px of corner correction. More correction = more forgiving, but too much and the player warps noticeably.

---

## Collision Resolution

### Axis-Separated Sweep

Move the collider one pixel at a time, resolving collisions per axis. This prevents tunneling and produces correct slide behavior.

```
function move_and_collide(position, velocity, collider, solids, dt):
    // Sub-pixel accumulation
    move_x = velocity.x * dt + remainder_x
    move_y = velocity.y * dt + remainder_y
    pixels_x = truncate(move_x)
    pixels_y = truncate(move_y)
    remainder_x = move_x - pixels_x
    remainder_y = move_y - pixels_y

    // Move X, one pixel at a time
    sign_x = sign(pixels_x)
    while pixels_x != 0:
        if not overlaps_any(position + (sign_x, 0), collider, solids):
            position.x += sign_x
            pixels_x -= sign_x
        else:
            velocity.x = 0
            remainder_x = 0
            break

    // Move Y, one pixel at a time
    sign_y = sign(pixels_y)
    while pixels_y != 0:
        if not overlaps_any(position + (0, sign_y), collider, solids):
            position.y += sign_y
            pixels_y -= sign_y
        else:
            velocity.y = 0
            remainder_y = 0
            break
```

### Sub-Pixel Accumulation

At low speeds, a character might move 0.3 pixels per frame. Without sub-pixel accumulation, this rounds to 0 and the character never moves. By storing the fractional remainder and adding it next frame, movement is smooth at any speed.

### Why Axis-Separated?

Moving X and Y simultaneously creates ambiguous corner cases. By resolving one axis at a time, collision response is always unambiguous. X-first is standard for horizontal platformers.

---

## System Update Order

The complete update order for a platformer controller each frame:

```
1.  Ladder check (if on ladder, use ladder movement and skip the rest)
2.  Dash (try start, update timer)
3.  Horizontal movement (acceleration/deceleration)
4.  Gravity (with variable jump and apex float)
5.  Wall detection and wall slide/cling
6.  Jump (wall jump, coyote, buffer, multi-jump)
7.  Slope adjustment
8.  Collision resolution (axis-separated sweep)
9.  Corner correction (upward only)
10. Ground detection (update grounded state)
11. Landing/leaving-ground transitions
12. Drop-through (one-way platforms)
```

---

## Tuning Reference

### Parameter Ranges by Game Feel

| Parameter | Tight / Responsive | Balanced | Floaty / Aerial |
|-----------|--------------------|----------|-----------------|
| Move speed (px/s) | 160--200 | 200--280 | 120--160 |
| Ground accel (px/s^2) | 2000--3000 | 1400--2000 | 800--1400 |
| Ground decel (px/s^2) | 2500--4000 | 1800--2500 | 1000--1800 |
| Air accel (px/s^2) | 1000--1800 | 800--1200 | 400--800 |
| Air decel (px/s^2) | 400--800 | 300--600 | 100--400 |
| Turn multiplier | 2.5--4.0 | 1.5--2.5 | 1.0--1.5 |
| Jump height (px) | 48--72 | 72--112 | 96--160 |
| Time to apex (s) | 0.25--0.35 | 0.35--0.50 | 0.50--0.80 |
| Fall gravity mult | 2.0--3.0 | 1.5--2.0 | 1.0--1.5 |
| Max fall speed (px/s) | 350--500 | 300--400 | 200--300 |
| Coyote time (s) | 0.05--0.08 | 0.08--0.12 | 0.12--0.18 |
| Jump buffer (s) | 0.06--0.10 | 0.10--0.15 | 0.15--0.20 |
| Wall slide speed (px/s) | 80--120 | 50--80 | 30--50 |

### Shipped Game Approximations

These are reverse-engineered estimates, not official values. Pixel values assume 16px = 1 tile.

| Game | Move Speed | Jump Height | Time to Apex | Fall Mult | Coyote | Buffer | Feel |
|------|-----------|------------|-------------|----------|--------|--------|------|
| Celeste | ~190 | ~68 | ~0.30 | ~2.5 | ~0.08 | ~0.10 | Tight, precise |
| Hollow Knight | ~170 | ~80 | ~0.40 | ~2.0 | ~0.10 | ~0.12 | Weighty, deliberate |
| Dead Cells | ~250 | ~64 | ~0.28 | ~2.8 | ~0.06 | ~0.08 | Snappy, action-focused |
| Super Meat Boy | ~280 | ~56 | ~0.25 | ~3.0 | ~0.05 | ~0.06 | Extreme precision |
| Ori | ~200 | ~96 | ~0.45 | ~1.6 | ~0.12 | ~0.13 | Floaty, graceful |
| Mega Man X | ~160 | ~72 | ~0.38 | ~2.0 | ~0.00 | ~0.00 | Classic, no assists |

### Tuning Workflow

1. Start with balanced defaults
2. Set jump height and time-to-apex first -- these define the core feel. Derive gravity and jump velocity.
3. Adjust fall gravity multiplier -- higher = snappier descent, lower = floatier
4. Tune ground accel/decel -- high decel = crisp stops, low decel = slidey (ice level)
5. Set air control -- less air accel = more committed jumps, more = more forgiving
6. Add coyote time and buffer -- start at 0.1s each, adjust to taste
7. Iterate constantly -- game feel is subjective, playtest relentlessly

---

*Implementation examples are available in engine-specific modules.*
