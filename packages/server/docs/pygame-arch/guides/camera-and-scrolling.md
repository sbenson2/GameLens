# Camera and Scrolling Systems

> **Category:** guide · **Engine:** Pygame · **Related:** [Game Loop and State](../architecture/game-loop-and-state.md), [Sprites and Collision](sprites-and-collision.md), [Tilemaps and Level Design](tilemaps-and-level-design.md)

Pygame has no built-in camera. Every sprite is drawn at an absolute pixel position, so "scrolling" means shifting every draw call by a camera offset. This guide covers the core offset pattern, dead zones, smoothing, parallax layers, and world boundaries.

## The Offset Pattern

The simplest camera tracks a target (usually the player) and produces an offset vector subtracted from every world position at draw time.

```python
import pygame

class Camera:
    def __init__(self, width, height):
        self.offset = pygame.math.Vector2(0, 0)
        self.half_w = width // 2
        self.half_h = height // 2

    def center_on(self, target):
        """Snap the camera so target is screen-center."""
        self.offset.x = target.rect.centerx - self.half_w
        self.offset.y = target.rect.centery - self.half_h

    def apply(self, rect):
        """Return a new rect shifted by the camera offset."""
        return rect.move(-self.offset.x, -self.offset.y)
```

In the draw loop, every sprite is drawn at `camera.apply(sprite.rect)` instead of `sprite.rect`:

```python
camera.center_on(player)
for sprite in all_sprites:
    screen.blit(sprite.image, camera.apply(sprite.rect))
```

> **pygame-ce note:** The pattern is identical in pygame-ce. `pygame.math.Vector2` and `Rect.move` behave the same way in both libraries.

## CameraGroup Approach

A cleaner pattern subclasses `pygame.sprite.Group` so the offset is applied automatically during `draw()`:

```python
class CameraGroup(pygame.sprite.Group):
    def __init__(self, screen):
        super().__init__()
        self.screen = screen
        self.offset = pygame.math.Vector2()
        self.half_w = screen.get_width() // 2
        self.half_h = screen.get_height() // 2

    def center_on(self, target):
        self.offset.x = target.rect.centerx - self.half_w
        self.offset.y = target.rect.centery - self.half_h

    def draw_with_offset(self):
        for sprite in self.sprites():
            offset_rect = sprite.rect.move(-self.offset.x, -self.offset.y)
            self.screen.blit(sprite.image, offset_rect)
```

This keeps drawing logic in one place and avoids scattering `camera.apply()` calls throughout your code.

## Dead Zones

Snapping the camera every frame feels twitchy. A **dead zone** is a rectangle in screen-space where the target can move freely without the camera following.

```python
class DeadZoneCamera(Camera):
    def __init__(self, width, height, dead_zone_size=100):
        super().__init__(width, height)
        dz = dead_zone_size
        self.dead_zone = pygame.Rect(
            width // 2 - dz, height // 2 - dz,
            dz * 2, dz * 2
        )

    def update(self, target):
        # Screen-space position of the target
        screen_pos = pygame.math.Vector2(
            target.rect.centerx - self.offset.x,
            target.rect.centery - self.offset.y
        )
        # Push the camera only when target leaves the dead zone
        if screen_pos.x < self.dead_zone.left:
            self.offset.x += screen_pos.x - self.dead_zone.left
        elif screen_pos.x > self.dead_zone.right:
            self.offset.x += screen_pos.x - self.dead_zone.right

        if screen_pos.y < self.dead_zone.top:
            self.offset.y += screen_pos.y - self.dead_zone.top
        elif screen_pos.y > self.dead_zone.bottom:
            self.offset.y += screen_pos.y - self.dead_zone.bottom
```

Dead zones work well for platformers (wide horizontal zone, tight vertical zone) and top-down RPGs (equal zone in both axes).

## Smooth (Lerp) Following

Linear interpolation gives a cinematic "easing" feel without the jitter of snapping:

```python
def smooth_follow(self, target, lerp_speed=0.08):
    """Call once per frame. lerp_speed 0.0–1.0 (lower = smoother)."""
    desired_x = target.rect.centerx - self.half_w
    desired_y = target.rect.centery - self.half_h
    self.offset.x += (desired_x - self.offset.x) * lerp_speed
    self.offset.y += (desired_y - self.offset.y) * lerp_speed
```

Combine with dead zones: only lerp when the target is outside the dead zone. A `lerp_speed` of `0.05`–`0.12` feels natural for most 2D games.

## Parallax Scrolling

Parallax creates depth by scrolling background layers slower than the foreground. Each layer gets a **scroll factor** between 0.0 (static) and 1.0 (moves with the world).

```python
class ParallaxLayer:
    def __init__(self, image, scroll_factor):
        self.image = image
        self.factor = scroll_factor  # 0.0 = fixed, 1.0 = world speed

    def draw(self, screen, camera_offset):
        # Tile the image horizontally for seamless scrolling
        w = self.image.get_width()
        x = -(camera_offset.x * self.factor) % w
        screen.blit(self.image, (x, 0))
        screen.blit(self.image, (x - w, 0))

# Usage — sky barely moves, hills move at half speed
layers = [
    ParallaxLayer(sky_img,   0.1),
    ParallaxLayer(hills_img, 0.5),
    ParallaxLayer(trees_img, 0.8),
]

# In draw loop (before world sprites):
for layer in layers:
    layer.draw(screen, camera.offset)
```

For vertical scrolling (shmups, infinite runners), apply the same logic to the Y axis.

## World Boundaries (Clamping)

Prevent the camera from showing empty space beyond the level edges:

```python
def clamp_to_world(self, world_rect, screen_width, screen_height):
    """Call after center_on / smooth_follow."""
    self.offset.x = max(world_rect.left,
                        min(self.offset.x,
                            world_rect.right - screen_width))
    self.offset.y = max(world_rect.top,
                        min(self.offset.y,
                            world_rect.bottom - screen_height))
```

Pass a `pygame.Rect` representing the full level size (e.g., `Rect(0, 0, tilemap_width_px, tilemap_height_px)`).

## Zoom (Scaling)

Pygame doesn't have a native zoom, but you can render to an intermediate surface and scale it:

```python
def draw_zoomed(screen, world_surface, zoom_level, camera_offset):
    """zoom_level > 1.0 = zoomed in, < 1.0 = zoomed out."""
    w = int(screen.get_width() / zoom_level)
    h = int(screen.get_height() / zoom_level)
    view = pygame.Surface((w, h))
    view.blit(world_surface, (-camera_offset.x, -camera_offset.y))
    scaled = pygame.transform.smoothscale(view, screen.get_size())
    screen.blit(scaled, (0, 0))
```

> **Performance note:** `smoothscale` is expensive. For pixel-art games, use `pygame.transform.scale` (nearest-neighbor) instead, which is faster and preserves crisp pixels.

## Screen Shake

A quick camera shake sells impacts and explosions. Add a random trauma offset that decays each frame:

```python
import random

class ShakeCamera(Camera):
    def __init__(self, width, height):
        super().__init__(width, height)
        self.trauma = 0.0  # 0.0–1.0

    def add_trauma(self, amount):
        self.trauma = min(1.0, self.trauma + amount)

    def get_shake_offset(self):
        shake = self.trauma ** 2  # Quadratic falloff feels punchier
        ox = random.uniform(-1, 1) * shake * 12  # max 12px shake
        oy = random.uniform(-1, 1) * shake * 12
        self.trauma = max(0, self.trauma - 0.02)  # Decay per frame
        return pygame.math.Vector2(ox, oy)
```

Apply the shake offset on top of the normal camera offset at draw time.

## Common Pitfalls

**Forgetting integer conversion** — Blitting at float coordinates produces blurry results. Round your offset to `int` before passing to `blit`:

```python
offset_rect = sprite.rect.move(-int(self.offset.x), -int(self.offset.y))
```

**Updating camera after physics** — Always run `camera.update()` after all sprite positions are finalized for the frame, otherwise you get one-frame lag.

**Collision in world space** — Collision detection must use world-space rects (`sprite.rect`), never screen-space positions. The camera offset is purely a rendering concern.
