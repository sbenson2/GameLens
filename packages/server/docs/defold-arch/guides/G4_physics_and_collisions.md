# G4 — Physics & Collisions

> **Category:** guide · **Engine:** Defold · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Message Passing](G1_message_passing.md) · [G2 Game Objects & Collections](G2_game_objects_and_collections.md)

---

## Physics Engine Overview

Defold embeds two physics engines:

| Engine | Use Case | Enabled By |
|--------|----------|------------|
| **Box2D** | 2D physics (default) | Any 2D collision object component |
| **Bullet 3D** | 3D physics | 3D collision object or 3D physics world setting |

Physics runs in a fixed timestep (default 60 Hz, configurable in `game.project` under `physics.fixed_timestep`). You never call a physics step manually — the engine handles it.

---

## Collision Object Types

Every game object that participates in physics needs a **Collision Object** component. The `type` property determines how the engine treats it:

### Dynamic

Fully simulated by the physics engine — gravity, forces, impulses, and collisions are all handled automatically.

```
-- game.project
[physics]
gravity_y = -980
```

Apply forces and impulses in your script:

```lua
function on_input(self, action_id, action)
    if action_id == hash("jump") and action.pressed then
        msg.post("#collisionobject", "apply_force", {
            force = vmath.vector3(0, 5000, 0),
            position = go.get_world_position()
        })
    end
end
```

**Use for:** Crates, balls, ragdolls — anything that should react to physics naturally.

### Kinematic

Registers collisions but the engine does **not** move or resolve them. You handle all movement and collision response in script. This is the most common type for player characters and enemies.

```lua
function update(self, dt)
    -- Move via go.set_position, not forces
    local pos = go.get_position()
    pos.x = pos.x + self.velocity.x * dt
    pos.y = pos.y + self.velocity.y * dt
    go.set_position(pos)
end
```

**Use for:** Player characters, moving platforms, elevators — anything that needs precise script-driven movement.

### Static

Immovable. Does not respond to forces or collisions. Cheapest to simulate.

**Use for:** Ground, walls, level geometry — anything that never moves.

### Trigger

A lightweight sensor that detects overlaps but has **no physical presence**. Objects pass right through triggers. Computationally cheaper than kinematic objects.

**Use for:** Checkpoints, pickup zones, death zones, area-of-effect regions, level transitions.

---

## Collision Shapes

Attach one or more shapes to a collision object:

| Shape | Description |
|-------|-------------|
| **Box** | Axis-aligned rectangle (2D) or box (3D) |
| **Sphere** | Circle (2D) or sphere (3D) |
| **Capsule** | Rounded rectangle, good for characters |
| **Tile Map** | Auto-generates collision from a tile map component |

Shapes are defined in the collision object component in the editor. Multiple shapes on one collision object form a compound shape.

---

## Collision Groups and Masks

Every collision object has a **Group** (a single string) and a **Mask** (one or more group names). Two objects only collide if **both** objects list the other's group in their mask.

Example setup:

| Object | Group | Mask |
|--------|-------|------|
| Player | `player` | `ground, enemy, pickup` |
| Enemy | `enemy` | `ground, player, projectile` |
| Ground | `ground` | `player, enemy` |
| Pickup | `pickup` | `player` |
| Projectile | `projectile` | `enemy` |

A pickup collides with the player (both include each other), but projectiles pass through pickups (neither references the other).

Groups and masks are set in the collision object properties in the editor or at runtime:

```lua
physics.set_group("#collisionobject", "enemy")
physics.set_maskbit("#collisionobject", "projectile", true)
```

**Tip:** Define groups as constants in a shared module to avoid typos across scripts.

---

## Collision Messages

Defold reports collisions via its message-passing system. The messages you receive depend on the collision object types involved.

### collision_response

Sent once per colliding pair, per frame. Use when you just need to know *that* a collision happened.

```lua
function on_message(self, message_id, message, sender)
    if message_id == hash("collision_response") then
        -- message.other_id       = game object id of the other object
        -- message.other_position = world position of the other object
        -- message.other_group    = collision group hash of the other object
        -- message.own_group      = collision group hash of this object
        if message.other_group == hash("pickup") then
            self.score = self.score + 1
            go.delete(message.other_id)
        end
    end
end
```

### contact_point_response

Sent for each **contact point** between two non-trigger objects. A single collision can produce multiple contact points per frame. Provides the data needed for manual kinematic resolution.

```lua
function on_message(self, message_id, message, sender)
    if message_id == hash("contact_point_response") then
        -- message.position          = contact point world position
        -- message.normal            = contact normal (points from other toward this object)
        -- message.distance          = penetration distance
        -- message.other_id          = other game object id
        -- message.other_position    = other object world position
        -- message.other_group       = other collision group hash
        -- message.own_group         = this collision group hash
        -- message.relative_velocity = velocity difference
        -- message.applied_impulse   = impulse applied (dynamic objects only)
        -- message.life              = remaining life of the contact (dynamic only)
        -- message.mass              = mass of the other object (dynamic only)
    end
end
```

### trigger_response

Sent when one of the colliding objects is a trigger. Fires once when contact begins and once when contact ends.

```lua
function on_message(self, message_id, message, sender)
    if message_id == hash("trigger_response") then
        -- message.other_id    = game object id of the other object
        -- message.enter       = true if contact began, false if ended
        -- message.other_group = collision group hash
        -- message.own_group   = collision group hash
        if message.enter then
            print("Entered zone")
        else
            print("Left zone")
        end
    end
end
```

---

## Resolving Kinematic Collisions

For kinematic objects (the player character, for example), you must manually separate overlapping objects using `contact_point_response` data:

### Simple Separation

```lua
function init(self)
    self.correction = vmath.vector3()
end

function update(self, dt)
    self.correction = vmath.vector3()  -- Reset each frame
end

function on_message(self, message_id, message, sender)
    if message_id == hash("contact_point_response") then
        -- Project the correction along the contact normal
        local proj = vmath.dot(self.correction, message.normal)
        local comp = (message.distance - proj) * message.normal
        self.correction = self.correction + comp

        -- Apply separation
        go.set_position(go.get_position() + comp)
    end
end
```

**Why accumulate corrections?** A kinematic object can touch multiple surfaces in one frame (e.g., a corner where floor meets wall). Each `contact_point_response` provides one contact. The projection step prevents double-correcting when normals partially overlap.

### Ground Detection

```lua
function on_message(self, message_id, message, sender)
    if message_id == hash("contact_point_response") then
        -- A contact normal pointing mostly upward means ground
        if message.normal.y > 0.7 then
            self.grounded = true
        end

        -- Separate as above...
    end
end

function update(self, dt)
    self.grounded = false  -- Reset; re-set by contact messages
    -- Apply gravity only when not grounded
    if not self.grounded then
        self.velocity.y = self.velocity.y - 980 * dt
    end
end
```

---

## Ray Casts

Ray casts test a line segment against collision objects in the physics world. Triggers are **not** hit by ray casts.

```lua
function update(self, dt)
    local from = go.get_position()
    local to = from + vmath.vector3(0, -100, 0)  -- Cast downward

    physics.raycast(from, to, { hash("ground"), hash("platform") })
end

function on_message(self, message_id, message, sender)
    if message_id == hash("ray_cast_response") then
        -- message.fraction  = 0..1 where along the ray the hit occurred
        -- message.position  = world position of the hit
        -- message.normal    = surface normal at the hit point
        -- message.id        = game object id that was hit
        -- message.group     = collision group of the hit object
        local ground_y = message.position.y
    end

    if message_id == hash("ray_cast_missed") then
        -- No hit along the ray
    end
end
```

The third argument is an optional table of group hashes to filter which objects the ray tests against.

**Common uses:** Ground probing for slopes, line-of-sight checks, bullet hit-scan, ledge detection.

---

## Physics Messages (Commands)

You can send messages to collision objects to apply forces or change properties at runtime:

```lua
-- Apply force (continuous, use in update)
msg.post("#collisionobject", "apply_force", {
    force = vmath.vector3(100, 0, 0),
    position = go.get_world_position()
})

-- Apply impulse (instant, one-shot)
-- Available via physics.apply_impulse() or messages (engine version dependent)

-- Enable/disable a collision object
msg.post("#collisionobject", "disable")
msg.post("#collisionobject", "enable")
```

Disabling a collision object removes it from the physics world entirely — useful for "dead" objects that haven't been deleted yet.

---

## game.project Physics Settings

Key settings in `game.project` under the `[physics]` section:

| Setting | Default | Description |
|---------|---------|-------------|
| `gravity_y` | `-10` | World gravity (set to `0` for top-down games) |
| `scale` | `0.02` | Physics scale (pixels to meters). Default: 1 pixel = 0.02m |
| `debug` | `false` | Render collision shapes in debug builds |
| `fixed_timestep` | `true` | Use fixed physics timestep |
| `max_collisions` | `64` | Max collision pairs reported per frame |
| `max_contacts` | `128` | Max contact points reported per frame |

**`scale` is critical.** Box2D is tuned for objects 0.1m–10m in size. If your sprites are 64px wide, the default scale makes them ~1.28m in physics space, which is ideal. Changing this without understanding the implications leads to jittery or unrealistic behavior.

If you hit the `max_collisions` or `max_contacts` limit, collisions are silently dropped. Increase these values if your game has many simultaneous collisions.

---

## Common Pitfalls

**Moving dynamic objects with `go.set_position`.** This teleports the object, bypassing physics. Use forces, impulses, or set linear velocity instead. Reserve `go.set_position` for kinematic and static objects.

**Forgetting mutual masks.** Both objects must list the other's group in their mask. A one-sided mask entry means no collision is reported.

**Not resetting grounded state.** If you set `self.grounded = true` on contact but never reset it to `false`, the player can jump mid-air after walking off a ledge.

**Trigger vs. kinematic confusion.** If you just need to detect an overlap (pickup, zone), use a trigger — it's cheaper. Use kinematic only when you need `contact_point_response` data for physical separation.

**Ray casts missing triggers.** By design, `physics.raycast` ignores trigger objects. If you need to detect triggers along a line, use a thin kinematic collision object instead.
