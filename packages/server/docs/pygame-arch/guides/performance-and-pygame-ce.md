# Performance Optimization & pygame-ce

> **Category:** guide · **Engine:** Pygame · **Related:** [surfaces-and-drawing](../reference/surfaces-and-drawing.md), [game-loop-and-state](../architecture/game-loop-and-state.md)

Practical performance techniques for Pygame games, plus a migration guide for
pygame-ce (Community Edition) — the actively-maintained fork with extra APIs and
speed improvements.

---

## Surface & Blitting Performance

### Always convert loaded surfaces

Every `pygame.image.load()` returns a surface in the file's pixel format. Blitting
an unconverted surface forces a per-pixel format conversion **every frame**.

```python
# SLOW — pixel format mismatch on every blit
sprite_img = pygame.image.load("hero.png")

# FAST — one-time conversion to display format
sprite_img = pygame.image.load("hero.png").convert()       # opaque images
sprite_alpha = pygame.image.load("hero.png").convert_alpha()  # images with transparency
```

`convert()` is ~3–6× faster for blitting opaque surfaces. `convert_alpha()` is
the correct call when the image has per-pixel alpha (PNG transparency).

### Use `Surface.fblits()` for batch drawing (pygame-ce only)

pygame-ce adds `Surface.fblits()` which accepts a sequence of `(surface, dest)`
pairs and blits them in a single C-level loop — faster than calling `blit()` in
a Python for-loop.

```python
# pygame-ce batch blitting
pairs = [(tile.image, tile.rect) for tile in visible_tiles]
screen.fblits(pairs)

# Equivalent standard pygame (slower due to Python loop overhead)
for tile in visible_tiles:
    screen.blit(tile.image, tile.rect)
```

### Dirty-rect updates vs full flip

`pygame.display.update(rect_list)` redraws only changed regions.
`pygame.display.flip()` redraws the entire screen.

On modern hardware with hardware-accelerated displays, the difference is often
negligible — full-screen `flip()` is fine for most games. Dirty rects still help
on low-powered devices (Raspberry Pi, older laptops) or when only a small portion
of the screen changes per frame (card games, UIs).

```python
# Dirty-rect approach
dirty = []
for obj in game_objects:
    dirty.append(screen.blit(background, obj.old_rect, obj.old_rect))  # erase
    dirty.append(screen.blit(obj.image, obj.rect))                      # draw
pygame.display.update(dirty)

# Simple full flip — fine for most modern games
screen.fill(BG_COLOR)
all_sprites.draw(screen)
pygame.display.flip()
```

---

## Frame Rate & Delta Time

### Cap the frame rate

`pygame.time.Clock.tick(fps)` limits the loop to a target FPS and returns the
elapsed milliseconds since the last call.

```python
clock = pygame.time.Clock()
FPS = 60

while running:
    dt = clock.tick(FPS) / 1000.0  # delta time in seconds

    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False

    player.x += player.speed * dt  # frame-rate-independent movement
```

**Always multiply movement/physics by `dt`.** Without delta time, your game runs
at different speeds on different machines.

### Avoid per-frame allocations

Creating new `Rect`, `Surface`, or `list` objects every frame triggers garbage
collection pressure. Pre-allocate and reuse:

```python
# BAD — new Rect every frame
def update(self):
    hitbox = pygame.Rect(self.x - 5, self.y - 5, self.w + 10, self.h + 10)

# GOOD — mutate existing Rect
def __init__(self):
    self.hitbox = pygame.Rect(0, 0, 0, 0)

def update(self):
    self.hitbox.update(self.x - 5, self.y - 5, self.w + 10, self.h + 10)
```

---

## Sprite Group Optimization

### Use `LayeredUpdates` or `LayeredDirty` for draw-order control

`pygame.sprite.LayeredUpdates` gives z-order control with `.change_layer()`.
`pygame.sprite.LayeredDirty` combines layering with automatic dirty-rect tracking.

```python
all_sprites = pygame.sprite.LayeredDirty()
all_sprites.set_clip(screen.get_rect())

player = Player()
all_sprites.add(player, layer=1)
cloud = Cloud()
all_sprites.add(cloud, layer=0)

# LayeredDirty.draw() returns a list of dirty rects automatically
dirty = all_sprites.draw(screen)
pygame.display.update(dirty)
```

### Spatial partitioning for collision

`pygame.sprite.spritecollide()` checks every sprite in a group — O(n).
For large worlds, partition sprites into a grid:

```python
class SpatialGrid:
    def __init__(self, cell_size=64):
        self.cell_size = cell_size
        self.cells = {}

    def _key(self, x, y):
        return (int(x) // self.cell_size, int(y) // self.cell_size)

    def insert(self, sprite):
        key = self._key(sprite.rect.centerx, sprite.rect.centery)
        self.cells.setdefault(key, []).append(sprite)

    def query(self, rect):
        """Return sprites in cells overlapping rect."""
        results = []
        x0, y0 = self._key(rect.left, rect.top)
        x1, y1 = self._key(rect.right, rect.bottom)
        for cx in range(x0, x1 + 1):
            for cy in range(y0, y1 + 1):
                results.extend(self.cells.get((cx, cy), []))
        return results
```

---

## Rendering Tricks

### Off-screen surface caching

If a complex visual (multi-sprite character, procedural pattern) doesn't change
every frame, render it once to an off-screen surface and blit that cached result.

```python
# Cache a complex HUD once, re-render only when data changes
hud_surface = pygame.Surface((400, 80), pygame.SRCALPHA)
hud_dirty = True

def draw_hud(screen, player):
    global hud_dirty
    if hud_dirty:
        hud_surface.fill((0, 0, 0, 0))
        # ... draw health bar, score, icons onto hud_surface ...
        hud_dirty = False
    screen.blit(hud_surface, (10, 10))
```

### Use `transform` sparingly at runtime

`pygame.transform.rotate()` and `pygame.transform.scale()` are expensive — they
create a new surface each call. Pre-compute rotated/scaled versions at load time
when possible.

```python
# Pre-compute rotations at load time
original = pygame.image.load("arrow.png").convert_alpha()
rotated_arrows = {
    angle: pygame.transform.rotate(original, angle)
    for angle in range(0, 360, 15)  # 24 cached versions
}

# At runtime — instant lookup, no transform cost
def draw(self, screen):
    snapped = round(self.angle / 15) * 15 % 360
    screen.blit(rotated_arrows[snapped], self.rect)
```

---

## pygame-ce Migration Guide

### What is pygame-ce?

pygame-ce (Community Edition) is a fork maintained by pygame's former core
developers. It receives frequent updates, bug fixes, and new features while
upstream pygame development has slowed considerably.

**Install:** `pip install pygame-ce` (replaces `pygame` — they share the import name)

**Detection:**
```python
import pygame
if hasattr(pygame, "IS_CE"):
    print(f"pygame-ce {pygame.ver}")
else:
    print(f"pygame {pygame.ver}")
```

### Key pygame-ce additions

| Feature | API | Notes |
|---------|-----|-------|
| **Batch blitting** | `Surface.fblits(sequence)` | Faster than per-sprite `blit()` loops |
| **Float rects** | `pygame.FRect` | Sub-pixel positioning without manual float tracking |
| **Text wrapping** | `Font.render(text, wraplength=px)` | Built-in word wrap (no manual splitting) |
| **Font control** | `Font.set_script()`, `Font.set_direction()` | RTL text, OpenType script tags |
| **Blur transforms** | `transform.box_blur()`, `transform.gaussian_blur()` | Real-time blur effects |
| **Color inversion** | `transform.invert()` | Invert surface colors in-place |
| **Color swizzling** | `Color.rgb`, `Color.rgba` | Convenient component access |
| **Mixer metadata** | `mixer.music.get_metadata()` | Read ID3/Vorbis tags from audio files |
| **System info** | `pygame.system` module | OS/hardware queries |
| **Vector angles** | `Vector2.angle`, `Vector2.angle_rad` | Direct angle properties |
| **Default font size** | `Font()` defaults to size 20 | No more required size argument |

### Performance differences

pygame-ce benchmarks show improvements in several areas:

- **Vector operations:** ~14% faster for Vector2/Vector3 math (particle simulations,
  physics) due to optimized C-level object creation.
- **transform.scale:** Improved for certain surface sizes and scale factors; gains
  vary by resolution.
- **General overhead:** Ongoing C-level optimizations reduce Python↔C crossing costs.

### Compatibility notes

- pygame-ce and pygame **cannot coexist** — installing one uninstalls the other
  (they share the `pygame` package name).
- Most pygame code runs on pygame-ce without changes. Check `pygame.IS_CE` to
  gate CE-specific features.
- pygame-ce removed the deprecated `fastevent` module.
- `Rect` float-to-int conversion uses rounding in pygame-ce vs. truncation in
  upstream pygame — this can cause 1-pixel positioning differences.

### Future: pygame-ce 3.0 + SDL3

pygame-ce is migrating to SDL3. The 3.0 release will bring SDL3 features (GPU
rendering, improved audio pipeline, better gamepad support) with some minor
backwards-compatibility changes. Watch the pygame-ce GitHub releases for updates.

---

## Quick Checklist

- [ ] All loaded images use `.convert()` or `.convert_alpha()`
- [ ] Movement and physics multiply by delta time
- [ ] No `transform.rotate()`/`scale()` calls inside the draw loop (pre-compute)
- [ ] Collision checks use spatial partitioning for >50 sprites
- [ ] Complex static visuals cached to off-screen surfaces
- [ ] Frame rate capped with `Clock.tick(target_fps)`
- [ ] Consider pygame-ce for `fblits()`, `FRect`, blur, and ongoing maintenance
