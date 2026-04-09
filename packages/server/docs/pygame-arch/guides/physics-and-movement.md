# Physics and Movement Patterns

> **Category:** guide · **Engine:** Pygame · **Related:** [architecture/game-loop-and-state.md](../architecture/game-loop-and-state.md), [sprites-and-collision.md](sprites-and-collision.md), [camera-and-scrolling.md](camera-and-scrolling.md)

Practical physics and movement patterns for Pygame games — from basic velocity/acceleration to platformer gravity, friction, and building a lightweight physics system without a third-party engine.

---

## Delta Time Fundamentals

All movement must be multiplied by delta time (`dt`) so it runs at the same speed regardless of frame rate. The game loop provides `dt` in seconds:

```python
clock = pygame.time.Clock()
FPS = 60

while running:
    dt = clock.tick(FPS) / 1000.0  # milliseconds → seconds
    player.update(dt)
```

**Critical rule:** Never write `self.x += 5`. Always write `self.x += speed * dt`.

---

## Vector2 for All Movement

`pygame.math.Vector2` handles normalization, rotation, dot product, lerp, and angle calculations. Use it instead of manual trigonometry.

```python
import pygame

class MovingEntity(pygame.sprite.Sprite):
    def __init__(self, pos, *groups):
        super().__init__(*groups)
        self.image = pygame.Surface((32, 32))
        self.image.fill((0, 200, 100))
        # Use float position for smooth subpixel movement
        self.pos = pygame.math.Vector2(pos)
        self.velocity = pygame.math.Vector2(0, 0)
        self.rect = self.image.get_rect(center=pos)

    def update(self, dt):
        self.pos += self.velocity * dt
        self.rect.center = round(self.pos.x), round(self.pos.y)
```

**Why separate `pos` from `rect`?** `pygame.Rect` stores integers only — repeated small float movements get truncated to zero. Store position as `Vector2` (floats), then round to `rect` for drawing and collision.

---

## Movement Models

### 1. Constant Velocity (Top-Down)

The simplest model — the entity moves at a fixed speed when input is held.

```python
class TopDownPlayer(pygame.sprite.Sprite):
    def __init__(self, pos, *groups):
        super().__init__(*groups)
        self.image = pygame.Surface((24, 24))
        self.image.fill((255, 255, 255))
        self.pos = pygame.math.Vector2(pos)
        self.rect = self.image.get_rect(center=pos)
        self.speed = 200  # pixels per second

    def update(self, dt):
        keys = pygame.key.get_pressed()
        direction = pygame.math.Vector2(0, 0)
        if keys[pygame.K_RIGHT]: direction.x += 1
        if keys[pygame.K_LEFT]:  direction.x -= 1
        if keys[pygame.K_DOWN]:  direction.y += 1
        if keys[pygame.K_UP]:    direction.y -= 1

        # Normalize so diagonal movement isn't faster
        if direction.magnitude() > 0:
            direction = direction.normalize()

        self.pos += direction * self.speed * dt
        self.rect.center = round(self.pos.x), round(self.pos.y)
```

**Diagonal normalization is essential.** Without it, moving diagonally is √2 ≈ 1.41x faster than moving in a cardinal direction.

### 2. Acceleration + Friction (Smooth Movement)

Adds momentum — the player slides into and out of movement for a responsive but weighty feel.

```python
class SmoothPlayer(pygame.sprite.Sprite):
    def __init__(self, pos, *groups):
        super().__init__(*groups)
        self.image = pygame.Surface((24, 24))
        self.image.fill((100, 200, 255))
        self.pos = pygame.math.Vector2(pos)
        self.velocity = pygame.math.Vector2(0, 0)
        self.rect = self.image.get_rect(center=pos)

        # Tuning knobs
        self.max_speed = 250       # pixels/sec
        self.acceleration = 1200   # pixels/sec²
        self.friction = 800        # pixels/sec² (deceleration when no input)

    def update(self, dt):
        keys = pygame.key.get_pressed()
        input_dir = pygame.math.Vector2(0, 0)
        if keys[pygame.K_RIGHT]: input_dir.x += 1
        if keys[pygame.K_LEFT]:  input_dir.x -= 1
        if keys[pygame.K_DOWN]:  input_dir.y += 1
        if keys[pygame.K_UP]:    input_dir.y -= 1

        if input_dir.magnitude() > 0:
            input_dir = input_dir.normalize()
            # Accelerate toward input direction
            self.velocity += input_dir * self.acceleration * dt
        else:
            # Apply friction when no input — decelerate to zero
            if self.velocity.magnitude() > 0:
                friction_force = self.velocity.normalize() * self.friction * dt
                # Don't overshoot zero
                if friction_force.magnitude() >= self.velocity.magnitude():
                    self.velocity = pygame.math.Vector2(0, 0)
                else:
                    self.velocity -= friction_force

        # Clamp to max speed
        if self.velocity.magnitude() > self.max_speed:
            self.velocity = self.velocity.normalize() * self.max_speed

        self.pos += self.velocity * dt
        self.rect.center = round(self.pos.x), round(self.pos.y)
```

**Tuning guide:**
- High acceleration + high friction = snappy, responsive (action games)
- Low acceleration + low friction = floaty, momentum-heavy (ice physics, space games)
- Try `acceleration=1200, friction=800` as a starting point and adjust from feel.

### 3. Platformer Gravity

Side-scrolling platformer with gravity, jumping, and ground detection.

```python
class PlatformerPlayer(pygame.sprite.Sprite):
    def __init__(self, pos, *groups):
        super().__init__(*groups)
        self.image = pygame.Surface((24, 36))
        self.image.fill((255, 200, 50))
        self.pos = pygame.math.Vector2(pos)
        self.velocity = pygame.math.Vector2(0, 0)
        self.rect = self.image.get_rect(topleft=pos)

        # Horizontal movement
        self.run_speed = 220      # pixels/sec
        self.acceleration = 1500  # pixels/sec²
        self.friction = 1000      # pixels/sec²

        # Vertical / gravity
        self.gravity = 980        # pixels/sec² (feels like ~1g at game scale)
        self.jump_velocity = -400 # negative = upward
        self.max_fall_speed = 600 # terminal velocity
        self.on_ground = False

        # Jump feel tuning
        self.jump_cut_multiplier = 0.4  # for variable jump height

    def update(self, dt):
        keys = pygame.key.get_pressed()

        # --- Horizontal ---
        input_x = 0
        if keys[pygame.K_RIGHT]: input_x += 1
        if keys[pygame.K_LEFT]:  input_x -= 1

        if input_x != 0:
            self.velocity.x += input_x * self.acceleration * dt
            self.velocity.x = max(-self.run_speed,
                                  min(self.run_speed, self.velocity.x))
        else:
            # Friction
            if abs(self.velocity.x) > 0:
                sign = 1 if self.velocity.x > 0 else -1
                self.velocity.x -= sign * self.friction * dt
                if sign * self.velocity.x < 0:
                    self.velocity.x = 0

        # --- Vertical ---
        self.velocity.y += self.gravity * dt
        self.velocity.y = min(self.velocity.y, self.max_fall_speed)

        # Variable jump height: release jump to cut velocity
        if not keys[pygame.K_SPACE] and self.velocity.y < 0:
            self.velocity.y *= self.jump_cut_multiplier

        # Apply velocity
        self.pos += self.velocity * dt
        self.rect.topleft = round(self.pos.x), round(self.pos.y)

    def jump(self):
        """Call this on KEYDOWN, not in update()."""
        if self.on_ground:
            self.velocity.y = self.jump_velocity
            self.on_ground = False

    def land(self, ground_y):
        """Call after collision resolution places player on ground."""
        self.pos.y = ground_y - self.rect.height
        self.velocity.y = 0
        self.on_ground = True
        self.rect.topleft = round(self.pos.x), round(self.pos.y)
```

**Variable jump height** is critical for good platformer feel. When the player releases the jump button early, multiply the upward velocity by a small factor (0.3–0.5) to cut the jump short. Hold longer = jump higher.

### Coyote Time and Jump Buffering

Two nearly universal quality-of-life features for platformers:

```python
class PlatformerWithCoyoteTime(PlatformerPlayer):
    def __init__(self, pos, *groups):
        super().__init__(pos, *groups)
        self.coyote_time = 0.08      # seconds after leaving ground you can still jump
        self.coyote_timer = 0.0
        self.jump_buffer_time = 0.1  # seconds before landing that a jump press registers
        self.jump_buffer_timer = 0.0

    def update(self, dt):
        # Track time since leaving ground
        if self.on_ground:
            self.coyote_timer = self.coyote_time
        else:
            self.coyote_timer = max(0, self.coyote_timer - dt)

        # Decay jump buffer
        self.jump_buffer_timer = max(0, self.jump_buffer_timer - dt)

        # Auto-jump if buffered and now grounded
        if self.jump_buffer_timer > 0 and (self.on_ground or self.coyote_timer > 0):
            self.velocity.y = self.jump_velocity
            self.on_ground = False
            self.coyote_timer = 0
            self.jump_buffer_timer = 0

        super().update(dt)

    def jump(self):
        """Call on KEYDOWN."""
        if self.on_ground or self.coyote_timer > 0:
            self.velocity.y = self.jump_velocity
            self.on_ground = False
            self.coyote_timer = 0
        else:
            # Not on ground — buffer the jump for when we land
            self.jump_buffer_timer = self.jump_buffer_time
```

---

## Collision Response

Physics means nothing without collision. The standard pattern is **move-then-resolve**, handling each axis separately.

### Axis-Separated Collision

```python
def move_and_collide(entity, obstacles, dt):
    """Move entity and resolve collisions per-axis."""
    # Move on X axis first
    entity.pos.x += entity.velocity.x * dt
    entity.rect.x = round(entity.pos.x)

    for obstacle in obstacles:
        if entity.rect.colliderect(obstacle.rect):
            if entity.velocity.x > 0:  # moving right
                entity.rect.right = obstacle.rect.left
            elif entity.velocity.x < 0:  # moving left
                entity.rect.left = obstacle.rect.right
            entity.pos.x = entity.rect.x
            entity.velocity.x = 0

    # Then move on Y axis
    entity.pos.y += entity.velocity.y * dt
    entity.rect.y = round(entity.pos.y)

    for obstacle in obstacles:
        if entity.rect.colliderect(obstacle.rect):
            if entity.velocity.y > 0:  # moving down (falling)
                entity.rect.bottom = obstacle.rect.top
                entity.pos.y = entity.rect.y
                entity.velocity.y = 0
                entity.on_ground = True
            elif entity.velocity.y < 0:  # moving up (jumping)
                entity.rect.top = obstacle.rect.bottom
                entity.pos.y = entity.rect.y
                entity.velocity.y = 0
```

**Why separate axes?** Resolving X and Y simultaneously causes corner-case bugs (clipping through corners, wrong push direction). By resolving one axis at a time, each collision has an unambiguous resolution direction.

---

## Simple Physics System

For games with many physics-driven objects (e.g., falling blocks, projectiles, particles), centralize physics into a system rather than spreading it across every sprite.

```python
class PhysicsBody:
    """Lightweight physics component — attach to any sprite."""

    def __init__(self, mass=1.0, gravity=True, bounciness=0.0):
        self.velocity = pygame.math.Vector2(0, 0)
        self.acceleration = pygame.math.Vector2(0, 0)
        self.mass = mass
        self.gravity = gravity
        self.bounciness = bounciness  # 0 = no bounce, 1 = perfect bounce
        self.forces = pygame.math.Vector2(0, 0)  # accumulated forces this frame

    def apply_force(self, force):
        """Apply a force (pixels/sec² * mass). Accumulated and cleared each frame."""
        self.forces += force

    def integrate(self, dt, gravity_vec=pygame.math.Vector2(0, 980)):
        """Euler integration — call once per physics tick."""
        if self.gravity:
            self.forces += gravity_vec * self.mass

        # F = ma → a = F/m
        self.acceleration = self.forces / self.mass
        self.velocity += self.acceleration * dt
        self.forces = pygame.math.Vector2(0, 0)  # clear accumulated forces


class PhysicsWorld:
    """Manages physics for a collection of bodies."""

    def __init__(self, gravity=(0, 980)):
        self.gravity = pygame.math.Vector2(gravity)
        self.bodies = []  # list of (sprite, PhysicsBody) tuples

    def add(self, sprite, body):
        self.bodies.append((sprite, body))

    def remove(self, sprite):
        self.bodies = [(s, b) for s, b in self.bodies if s is not sprite]

    def step(self, dt):
        """Advance physics one tick."""
        for sprite, body in self.bodies:
            body.integrate(dt, self.gravity)
            sprite.pos += body.velocity * dt
            sprite.rect.center = round(sprite.pos.x), round(sprite.pos.y)
```

**Note:** This uses Euler integration (velocity += acceleration * dt), which is simple and sufficient for most 2D games. For highly precise simulations (e.g., orbital mechanics), use Verlet integration or a fixed-timestep accumulator.

---

## Fixed Timestep with Interpolation

For physics-heavy games, decouple the physics tick rate from the render frame rate. This ensures deterministic simulation regardless of FPS.

```python
PHYSICS_DT = 1 / 60.0  # 60 Hz physics
accumulator = 0.0
previous_positions = {}  # sprite -> Vector2

while running:
    frame_dt = clock.tick(0) / 1000.0  # uncapped render FPS
    frame_dt = min(frame_dt, 0.25)     # cap to prevent spiral of death
    accumulator += frame_dt

    # Store previous positions for interpolation
    for sprite, body in physics_world.bodies:
        previous_positions[sprite] = pygame.math.Vector2(sprite.pos)

    # Run physics at fixed rate
    while accumulator >= PHYSICS_DT:
        physics_world.step(PHYSICS_DT)
        accumulator -= PHYSICS_DT

    # Interpolate rendering between physics states
    alpha = accumulator / PHYSICS_DT
    for sprite, body in physics_world.bodies:
        prev = previous_positions.get(sprite, sprite.pos)
        render_pos = prev.lerp(sprite.pos, alpha)
        sprite.rect.center = round(render_pos.x), round(render_pos.y)

    # Draw
    screen.fill((0, 0, 0))
    all_sprites.draw(screen)
    pygame.display.flip()
```

**When is this worth the complexity?** When physics consistency matters — e.g., networked multiplayer (determinism), physics puzzles, or any game where a lag spike shouldn't change outcomes.

---

## Common Pitfalls

1. **Forgetting diagonal normalization** — diagonal movement is 41% faster without `.normalize()`.
2. **Using `rect` for subpixel positions** — `Rect` truncates to int; always store position as `Vector2` and sync to `rect` for drawing.
3. **No max fall speed** — without terminal velocity, entities falling for a long time reach enormous speeds and tunnel through floors.
4. **Checking ground state in `update()` instead of after collision** — `on_ground` must be set during collision resolution, not from velocity checks.
5. **Forgetting to clear forces each frame** — accumulated forces from previous frames cause runaway acceleration.
6. **Variable timestep for physics** — frame time spikes cause entities to teleport. Use fixed timestep for physics-critical code.
7. **Jump only on `key.get_pressed()`** — this triggers jump every frame the key is held. Handle jump on `KEYDOWN` event instead.
