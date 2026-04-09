# Particle Systems and Visual Effects

> **Category:** guide · **Engine:** Pygame · **Related:** [sprites-and-collision.md](sprites-and-collision.md), [../reference/surfaces-and-drawing.md](../reference/surfaces-and-drawing.md), [../architecture/game-loop-and-state.md](../architecture/game-loop-and-state.md)

How to build particle systems in Pygame for effects like explosions, trails, smoke, fire, and ambient dust — from a minimal single-emitter setup to pooled, high-performance systems suitable for action games.

---

## Core Particle Structure

A particle is a short-lived visual element with position, velocity, lifetime, and visual properties. Keep particles as lightweight as possible — thousands may be alive at once.

### Minimal Particle Class

```python
import random
import math
import pygame

class Particle:
    """Lightweight particle — no Sprite overhead."""
    __slots__ = ('x', 'y', 'dx', 'dy', 'lifetime', 'max_lifetime',
                 'color', 'size', 'gravity')

    def __init__(self, x, y, dx, dy, lifetime, color, size, gravity=0.0):
        self.x = x
        self.y = y
        self.dx = dx
        self.dy = dy
        self.lifetime = lifetime
        self.max_lifetime = lifetime
        self.color = color
        self.size = size
        self.gravity = gravity

    def update(self, dt):
        """Advance physics. Returns False when expired."""
        self.lifetime -= dt
        if self.lifetime <= 0:
            return False
        self.dy += self.gravity * dt
        self.x += self.dx * dt
        self.y += self.dy * dt
        return True

    @property
    def alpha(self):
        """0.0–1.0 fade based on remaining life."""
        return max(0.0, self.lifetime / self.max_lifetime)
```

**Why `__slots__`?** Particles are created and destroyed constantly. `__slots__` eliminates the per-instance `__dict__`, cutting memory by ~40 % and speeding attribute access. This matters when you have 2 000+ particles per frame.

**Why not subclass `pygame.sprite.Sprite`?** Sprite adds overhead (group bookkeeping, `image`/`rect` attributes). For thousands of tiny dots drawn via `pygame.draw`, raw classes or even named tuples are faster.

---

## Particle Emitter

An emitter spawns particles over time at a given position, applying randomised velocity, color, and lifetime within configurable ranges.

```python
class Emitter:
    def __init__(self, x, y, rate=60, spread=math.pi * 2,
                 angle=0, speed_range=(50, 200), lifetime_range=(0.3, 1.0),
                 color=(255, 200, 80), size_range=(2, 5), gravity=0.0):
        self.x = x
        self.y = y
        self.rate = rate              # particles per second
        self.spread = spread          # radians of cone width
        self.angle = angle            # centre direction (radians, 0 = right)
        self.speed_range = speed_range
        self.lifetime_range = lifetime_range
        self.color = color
        self.size_range = size_range
        self.gravity = gravity
        self._accumulator = 0.0

    def emit(self, dt):
        """Returns a list of new Particle objects for this frame."""
        self._accumulator += self.rate * dt
        new = []
        while self._accumulator >= 1.0:
            self._accumulator -= 1.0
            a = self.angle + random.uniform(-self.spread / 2, self.spread / 2)
            spd = random.uniform(*self.speed_range)
            lt = random.uniform(*self.lifetime_range)
            sz = random.uniform(*self.size_range)
            new.append(Particle(
                self.x, self.y,
                math.cos(a) * spd, math.sin(a) * spd,
                lt, self.color, sz, self.gravity
            ))
        return new
```

**Rate accumulator pattern:** Never spawn a fixed count per frame — that ties effect density to framerate. Accumulate `rate * dt` and spawn integer particles. This keeps effects visually consistent at 30 fps or 144 fps.

---

## Particle System Manager

The system owns all live particles and drives update/draw in the main loop.

```python
class ParticleSystem:
    def __init__(self, max_particles=5000):
        self.particles = []
        self.max_particles = max_particles

    def add(self, particles):
        """Add a batch of particles, respecting the cap."""
        room = self.max_particles - len(self.particles)
        self.particles.extend(particles[:room])

    def update(self, dt):
        """Update all particles, remove dead ones."""
        # Iterate backwards for safe removal
        self.particles = [p for p in self.particles if p.update(dt)]

    def draw(self, surface, camera_offset=(0, 0)):
        """Render all particles."""
        ox, oy = camera_offset
        for p in self.particles:
            alpha = p.alpha
            r = max(1, int(p.size * alpha))  # shrink as they fade
            color = (
                int(p.color[0] * alpha),
                int(p.color[1] * alpha),
                int(p.color[2] * alpha),
            )
            pygame.draw.circle(
                surface,
                color,
                (int(p.x - ox), int(p.y - oy)),
                r
            )

    def burst(self, x, y, count, speed_range=(100, 300),
              color=(255, 100, 50), lifetime_range=(0.2, 0.6),
              gravity=300):
        """One-shot radial explosion — no emitter needed."""
        new = []
        for _ in range(count):
            angle = random.uniform(0, math.pi * 2)
            spd = random.uniform(*speed_range)
            lt = random.uniform(*lifetime_range)
            sz = random.uniform(2, 6)
            new.append(Particle(
                x, y,
                math.cos(angle) * spd, math.sin(angle) * spd,
                lt, color, sz, gravity
            ))
        self.add(new)
```

### Wiring It Into the Game Loop

```python
particle_system = ParticleSystem()
trail_emitter = Emitter(0, 0, rate=80, color=(180, 180, 180),
                        speed_range=(20, 60), gravity=-40,
                        lifetime_range=(0.2, 0.5), size_range=(1, 3))

while running:
    dt = clock.tick(60) / 1000.0

    # Move the emitter with the player
    trail_emitter.x = player.rect.centerx
    trail_emitter.y = player.rect.bottom

    # Emit + update
    particle_system.add(trail_emitter.emit(dt))
    particle_system.update(dt)

    # Draw world, then particles on top
    screen.fill((20, 20, 30))
    all_sprites.draw(screen)
    particle_system.draw(screen, camera.offset)
    pygame.display.flip()
```

---

## Common Effect Recipes

### Movement Trail (Dust)

```python
dust = Emitter(
    x=0, y=0,
    rate=40,
    angle=math.pi,          # emit leftwards (behind rightward movement)
    spread=math.pi / 3,     # 60° cone
    speed_range=(20, 60),
    lifetime_range=(0.15, 0.4),
    color=(160, 140, 120),   # brown-grey dust
    size_range=(1, 3),
    gravity=-20              # slight float upwards
)
# Only emit while the player is moving on the ground:
if player.on_ground and player.velocity.x != 0:
    dust.x = player.rect.midbottom[0]
    dust.y = player.rect.bottom
    dust.angle = math.pi if player.velocity.x > 0 else 0
    particle_system.add(dust.emit(dt))
```

### Explosion Burst

```python
# Trigger on enemy death
particle_system.burst(
    enemy.rect.centerx, enemy.rect.centery,
    count=40,
    speed_range=(80, 250),
    color=(255, 120, 30),
    lifetime_range=(0.2, 0.5),
    gravity=200
)
# Optional: second burst for sparks
particle_system.burst(
    enemy.rect.centerx, enemy.rect.centery,
    count=15,
    speed_range=(200, 400),
    color=(255, 255, 180),
    lifetime_range=(0.1, 0.3),
    gravity=100
)
```

### Fire / Torch

```python
fire = Emitter(
    x=torch_x, y=torch_y,
    rate=100,
    angle=-math.pi / 2,       # upwards
    spread=math.pi / 4,       # 45° cone
    speed_range=(30, 80),
    lifetime_range=(0.3, 0.8),
    color=(255, 160, 40),
    size_range=(3, 7),
    gravity=-60                # rise
)
```

For more realistic fire, randomise the color per-particle between orange and yellow, and use the alpha to fade towards red at end of life.

### Ambient Floating Dust / Snow

```python
class AmbientEmitter:
    """Fills the screen area with gentle drifting particles."""
    def __init__(self, screen_w, screen_h, density=30,
                 color=(200, 200, 220), drift_speed=15):
        self.screen_w = screen_w
        self.screen_h = screen_h
        self.density = density
        self.color = color
        self.drift_speed = drift_speed
        self._accumulator = 0.0

    def emit(self, dt):
        self._accumulator += self.density * dt
        new = []
        while self._accumulator >= 1.0:
            self._accumulator -= 1.0
            new.append(Particle(
                random.uniform(0, self.screen_w),
                -5,  # spawn just above screen
                random.uniform(-self.drift_speed, self.drift_speed),
                random.uniform(self.drift_speed, self.drift_speed * 3),
                lifetime=self.screen_h / self.drift_speed + 2,
                color=self.color,
                size=random.uniform(1, 3),
            ))
        return new
```

---

## Performance Optimisation

### 1. Particle Pool (Object Reuse)

Allocating and garbage-collecting thousands of Particle objects per second creates GC pressure. A pool pre-allocates and recycles:

```python
class ParticlePool:
    def __init__(self, capacity=5000):
        self._pool = [Particle(0, 0, 0, 0, 0, (0,0,0), 0) for _ in range(capacity)]
        self._alive = 0

    def acquire(self, x, y, dx, dy, lifetime, color, size, gravity=0.0):
        if self._alive >= len(self._pool):
            return None  # pool exhausted — drop the particle
        p = self._pool[self._alive]
        p.x, p.y = x, y
        p.dx, p.dy = dx, dy
        p.lifetime = p.max_lifetime = lifetime
        p.color = color
        p.size = size
        p.gravity = gravity
        self._alive += 1
        return p

    def update(self, dt):
        i = 0
        while i < self._alive:
            if not self._pool[i].update(dt):
                # Swap dead particle to end
                self._alive -= 1
                self._pool[i], self._pool[self._alive] = (
                    self._pool[self._alive], self._pool[i])
            else:
                i += 1

    def draw(self, surface, camera_offset=(0, 0)):
        ox, oy = camera_offset
        for i in range(self._alive):
            p = self._pool[i]
            a = p.alpha
            r = max(1, int(p.size * a))
            c = (int(p.color[0]*a), int(p.color[1]*a), int(p.color[2]*a))
            pygame.draw.circle(surface, c, (int(p.x-ox), int(p.y-oy)), r)
```

**Swap-to-back trick:** Dead particles swap with the last alive particle, keeping all live particles contiguous. No list rebuilding, no `remove()` scans.

### 2. Surface Batching (pygame-ce)

In **pygame-ce** (Community Edition ≥ 2.4), `pygame.draw` calls are already faster due to C-level optimisations. Additional gains:

- **Pre-render small circles** onto cached Surfaces at startup, then `blit` instead of calling `draw.circle` per-particle.
- **Use `pygame.Surface.blits()`** (pygame-ce) to batch multiple blit calls into one C-level loop:

```python
# Pre-rendered particle images at various sizes
PARTICLE_IMGS = {}
for sz in range(1, 8):
    s = pygame.Surface((sz*2, sz*2), pygame.SRCALPHA)
    pygame.draw.circle(s, (255, 255, 255), (sz, sz), sz)
    PARTICLE_IMGS[sz] = s

def draw_batched(self, surface, camera_offset=(0, 0)):
    ox, oy = camera_offset
    blit_list = []
    for i in range(self._alive):
        p = self._pool[i]
        a = p.alpha
        r = max(1, min(7, int(p.size * a)))
        img = PARTICLE_IMGS[r].copy()
        img.fill((*p.color, int(255 * a)), special_flags=pygame.BLEND_RGBA_MULT)
        blit_list.append((img, (int(p.x - ox) - r, int(p.y - oy) - r)))
    surface.blits(blit_list, doreturn=False)
```

### 3. Cap and Prioritise

Always set a `max_particles` limit. When the cap is hit, prefer dropping new low-priority particles (ambient dust) over high-priority ones (explosion feedback).

---

## pygame vs pygame-ce Differences

| Feature | pygame 2.6 | pygame-ce 2.5+ |
|---------|-----------|----------------|
| `Surface.blits()` | Available (slower) | Optimised C loop |
| `draw.circle` speed | Pure SDL | Faster C paths |
| SIMD draw accel | No | Select primitives |
| `Surface.premul_alpha()` | Not available | Available — useful for particle blending |

If you need high particle counts (1 000+), **pygame-ce is strongly recommended** for its draw-call performance improvements.

---

## Architecture Tips

- **Separate systems from game objects.** The particle system should not know about players or enemies. Emit particles in response to game events (collision callbacks, state changes), not inside entity update loops.
- **Layer ordering matters.** Draw particles after the game world but before UI. For effects like rain, draw after UI for immersion.
- **Delta-time everything.** Never tie particle speed or spawn rate to framerate.
- **Profile with `cProfile` or pygame-ce's `time.get_ticks()`.** The draw loop is almost always the bottleneck, not the physics update.
