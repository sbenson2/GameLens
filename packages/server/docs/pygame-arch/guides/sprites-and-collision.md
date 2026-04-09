# Sprites and Collision Detection

> **Category:** guide · **Engine:** Pygame · **Related:** [architecture/game-loop-and-state.md](../architecture/game-loop-and-state.md), [pygame-arch-rules.md](../pygame-arch-rules.md)

A practical guide to managing sprites, sprite groups, and collision detection in Pygame and pygame-ce — from basic group patterns to advanced spatial partitioning for large object counts.

---

## Sprite Lifecycle

Every game object that gets drawn should subclass `pygame.sprite.Sprite`. The two required attributes are `self.image` (a Surface) and `self.rect` (a Rect positioning that surface).

### Creating a Sprite

```python
class Bullet(pygame.sprite.Sprite):
    def __init__(self, pos, direction, *groups):
        super().__init__(*groups)  # pass groups in constructor
        self.image = pygame.Surface((4, 10))
        self.image.fill((255, 255, 0))
        self.rect = self.image.get_rect(center=pos)
        self.velocity = direction * 600  # pixels/sec

    def update(self, dt):
        self.rect.center += self.velocity * dt
        # Kill when off-screen — frees from ALL groups
        if not pygame.display.get_surface().get_rect().colliderect(self.rect):
            self.kill()
```

**Key points:**
- Pass groups via the constructor (`super().__init__(*groups)`) or add later with `group.add(sprite)`.
- Call `self.kill()` to remove the sprite from every group it belongs to. This is the cleanest way to despawn objects.
- Never manually manage a list of sprites when groups handle it for you.

### Sprite Memory: When kill() Isn't Enough

`kill()` removes the sprite from groups but does **not** delete the Python object. If you hold another reference (e.g., `self.target = some_sprite`), it stays in memory. Set stale references to `None` or use `sprite.alive()` checks:

```python
if self.target and not self.target.alive():
    self.target = None  # release dead reference
```

---

## Sprite Groups In-Depth

### Group Types

| Class | Purpose | When to use |
|-------|---------|------------|
| `Group` | Basic unordered collection | Default choice for most sprite sets |
| `LayeredUpdates` | Ordered by `_layer` attribute | Rendering with depth (background, midground, foreground) |
| `LayeredDirty` | Dirty-rect rendering + layers | Scenes with many static sprites (menus, tile maps) |
| `GroupSingle` | Holds exactly one sprite | Player, cursor, singleton objects |
| `RenderUpdates` | Returns dirty rects from `draw()` | Partial screen updates with `display.update(rects)` |

### Organizing Groups by Purpose

Create separate groups for **rendering** vs. **logic**. A sprite can belong to multiple groups simultaneously:

```python
# Rendering group — everything that needs to be drawn
all_sprites = pygame.sprite.LayeredUpdates()

# Logic groups — used for collision checks and targeted updates
enemies = pygame.sprite.Group()
bullets = pygame.sprite.Group()
pickups = pygame.sprite.Group()

# A single sprite in multiple groups
class Enemy(pygame.sprite.Sprite):
    def __init__(self, pos):
        super().__init__(all_sprites, enemies)  # in both groups
        self.image = load_image("enemy.png")
        self.rect = self.image.get_rect(center=pos)
        self._layer = 5  # LayeredUpdates respects this
```

### Batch Operations

```python
# Update all sprites with delta time
all_sprites.update(dt)

# Draw all sprites to screen (respects layer order in LayeredUpdates)
all_sprites.draw(screen)

# Empty a group without killing sprites (they stay in other groups)
bullets.empty()

# Check if group has any sprites
if not enemies:
    spawn_next_wave()

# Iterate safely while removing
for enemy in enemies.copy():  # copy() avoids mutation during iteration
    if enemy.hp <= 0:
        enemy.kill()
```

### LayeredUpdates: Depth Sorting

```python
all_sprites = pygame.sprite.LayeredUpdates()

# Set layer on creation
background = Background()
background._layer = 0  # drawn first (behind everything)
all_sprites.add(background)

# Change layer dynamically
all_sprites.change_layer(sprite, new_layer)

# Get all sprites on a specific layer
ui_sprites = all_sprites.get_sprites_from_layer(10)

# Get the top sprite at a screen position (e.g., for click detection)
clicked = all_sprites.get_sprites_at(mouse_pos)
```

### pygame-ce: Batch Blitting with fblits()

pygame-ce adds `Surface.fblits()` for faster batch rendering when you don't need group features:

```python
# pygame-ce only — check with pygame.IS_CE
if hasattr(pygame, "IS_CE") and pygame.IS_CE:
    # fblits takes an iterable of (surface, position) tuples
    screen.fblits([(s.image, s.rect) for s in visible_sprites])
else:
    # Standard pygame fallback
    all_sprites.draw(screen)
```

---

## Collision Detection

### Built-in Collision Functions

Pygame provides collision functions at three levels:

#### 1. Sprite vs. Group — `spritecollide()`

```python
# Returns list of sprites in 'group' that collide with 'sprite'
hits = pygame.sprite.spritecollide(player, enemies, dokill=False)
for enemy in hits:
    player.take_damage(enemy.attack)

# dokill=True removes colliding sprites from ALL their groups
coins = pygame.sprite.spritecollide(player, pickups, dokill=True)
score += len(coins) * 10
```

#### 2. Group vs. Group — `groupcollide()`

```python
# Returns dict: {bullet_sprite: [enemy_sprite, ...]}
collisions = pygame.sprite.groupcollide(
    bullets, enemies,
    dokill1=True,   # kill bullets on hit
    dokill2=False    # don't kill enemies (handle HP separately)
)
for bullet, hit_enemies in collisions.items():
    for enemy in hit_enemies:
        enemy.hp -= bullet.damage
```

#### 3. Single Sprite vs. Single Sprite — `collide_rect()`

```python
if pygame.sprite.collide_rect(player, door):
    transition_to_next_room()
```

### Collision Callbacks

All collision functions accept an optional `collided` callback for custom hit testing:

| Callback | Test type | Speed | Accuracy |
|----------|-----------|-------|----------|
| `collide_rect` (default) | AABB rectangle overlap | Fastest | Low (box only) |
| `collide_rect_ratio(0.8)` | Shrunk rectangle | Fast | Medium |
| `collide_circle` | Circle overlap (uses `radius` attr) | Fast | Medium |
| `collide_circle_ratio(0.6)` | Shrunk circle | Fast | Medium-High |
| `collide_mask` | Pixel-perfect mask overlap | Slow | Exact |

```python
# Pixel-perfect collision — requires .mask attribute on sprites
class Player(pygame.sprite.Sprite):
    def __init__(self, pos):
        super().__init__()
        self.image = pygame.image.load("player.png").convert_alpha()
        self.rect = self.image.get_rect(center=pos)
        self.mask = pygame.mask.from_surface(self.image)

# Usage — pass collide_mask as callback
hits = pygame.sprite.spritecollide(
    player, enemies, False,
    pygame.sprite.collide_mask
)
```

**Performance tip:** Regenerate the mask only when the image changes (e.g., animation frame switch), not every frame.

### Two-Phase Collision Strategy

For games with 50+ dynamic objects, use a broadphase/narrowphase approach:

```
Broadphase (fast, approximate)     Narrowphase (slow, precise)
┌──────────────────────────┐      ┌────────────────────────┐
│ Spatial hash / quadtree  │ ──►  │ collide_mask or SAT    │
│ AABB rect overlap        │      │ Only on candidate pairs│
│ Returns candidate pairs  │      │ Returns actual hits    │
└──────────────────────────┘      └────────────────────────┘
```

### Spatial Hash Grid

A spatial hash divides the world into fixed-size cells. Each sprite registers in the cell(s) its rect overlaps. Only sprites sharing a cell are checked for collision.

```python
class SpatialHash:
    """Fixed-grid spatial hash for broadphase collision detection."""

    def __init__(self, cell_size=64):
        self.cell_size = cell_size
        self.grid = {}

    def _key(self, x, y):
        return (x // self.cell_size, y // self.cell_size)

    def clear(self):
        self.grid.clear()

    def insert(self, sprite):
        """Register a sprite in all cells its rect overlaps."""
        r = sprite.rect
        for x in range(r.left, r.right + 1, self.cell_size):
            for y in range(r.top, r.bottom + 1, self.cell_size):
                key = self._key(x, y)
                self.grid.setdefault(key, set()).add(sprite)

    def query(self, rect):
        """Return all sprites that share cells with the given rect."""
        found = set()
        for x in range(rect.left, rect.right + 1, self.cell_size):
            for y in range(rect.top, rect.bottom + 1, self.cell_size):
                key = self._key(x, y)
                found.update(self.grid.get(key, set()))
        return found


# Usage in game loop:
spatial = SpatialHash(cell_size=64)

def check_collisions():
    spatial.clear()
    for sprite in all_dynamic_sprites:
        spatial.insert(sprite)

    for bullet in bullets:
        # Only check enemies in nearby cells — not ALL enemies
        nearby = spatial.query(bullet.rect)
        for other in nearby:
            if other in enemies and pygame.sprite.collide_rect(bullet, other):
                handle_hit(bullet, other)
```

**Cell size guideline:** Set `cell_size` to roughly 2x the average sprite width. Too small = sprites span many cells (overhead). Too large = too many sprites per cell (defeats the purpose).

### Quadtree (Alternative Broadphase)

Quadtrees recursively subdivide space and work well when sprites cluster unevenly. They provide ~4x collision check reduction per tree level, meaning a 3-level tree can cut checks by ~48x compared to brute force.

Use a spatial hash when sprites are roughly uniform in size and distribution. Use a quadtree when sprite density varies significantly across the play area.

---

## Common Patterns

### Invincibility Frames (i-frames)

```python
class Player(pygame.sprite.Sprite):
    def __init__(self, pos):
        super().__init__()
        self.invincible_timer = 0

    def take_damage(self, amount):
        if self.invincible_timer > 0:
            return  # still invincible
        self.hp -= amount
        self.invincible_timer = 1.5  # seconds of invincibility

    def update(self, dt):
        if self.invincible_timer > 0:
            self.invincible_timer -= dt
            # Flash effect: toggle visibility every 0.1s
            self.image.set_alpha(
                0 if int(self.invincible_timer * 10) % 2 else 255
            )
        else:
            self.image.set_alpha(255)
```

### Collision Response: Sliding Along Walls

```python
def move_and_collide(sprite, walls, dx, dy):
    """Move sprite, resolving collisions axis-by-axis for sliding."""
    # Move X first
    sprite.rect.x += dx
    for wall in pygame.sprite.spritecollide(sprite, walls, False):
        if dx > 0:
            sprite.rect.right = wall.rect.left
        elif dx < 0:
            sprite.rect.left = wall.rect.right

    # Then move Y
    sprite.rect.y += dy
    for wall in pygame.sprite.spritecollide(sprite, walls, False):
        if dy > 0:
            sprite.rect.bottom = wall.rect.top
        elif dy < 0:
            sprite.rect.top = wall.rect.bottom
```

### Hitbox vs. Visual Rect

Many games use a smaller collision rect than the sprite's visual bounds:

```python
class Player(pygame.sprite.Sprite):
    def __init__(self, pos):
        super().__init__()
        self.image = pygame.image.load("player.png").convert_alpha()
        self.rect = self.image.get_rect(center=pos)
        # Smaller hitbox for fairer collision
        self.hitbox = self.rect.inflate(-20, -10)

    def update(self, dt):
        # ... movement logic updates self.rect ...
        self.hitbox.center = self.rect.center  # keep hitbox synced
```

When using a custom hitbox, pass a custom `collided` callback to `spritecollide()`:

```python
def collide_hitbox(sprite, other):
    return sprite.hitbox.colliderect(other.hitbox)

hits = pygame.sprite.spritecollide(player, enemies, False, collide_hitbox)
```

---

## Performance Checklist

1. **Use groups, not lists** — `Group.draw()` is implemented in C and is faster than a Python loop.
2. **Separate collision groups** — don't check `all_sprites` for collisions; use purpose-specific groups like `enemies`, `bullets`.
3. **Kill off-screen sprites** — stale sprites waste memory and collision-check time.
4. **Cache masks** — only rebuild `self.mask` when `self.image` changes (animation frame, rotation).
5. **Broadphase first** — for 50+ dynamic objects, add a spatial hash or quadtree before narrowphase checks.
6. **Avoid nested group loops** — use `groupcollide()` instead of manual `for a in groupA: for b in groupB:` patterns.
7. **Profile before optimizing** — `pygame.time.Clock.get_fps()` and `cProfile` reveal the actual bottleneck before you add complexity.
