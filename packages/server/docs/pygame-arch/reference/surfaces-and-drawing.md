# Surfaces & Drawing Reference

> **Category:** reference · **Engine:** Pygame · **Related:** [game-loop-and-state](../architecture/game-loop-and-state.md), [sprites-and-collision](../guides/sprites-and-collision.md), [audio-and-mixer](../guides/audio-and-mixer.md)

Everything visible in Pygame is a `Surface`. The display window is a Surface. Sprites hold Surfaces. UI elements are drawn onto Surfaces. Understanding how Surfaces work — creation, blitting, transparency, and conversion — is fundamental to Pygame performance.

---

## Creating Surfaces

```python
import pygame
pygame.init()

# The display surface (your game window)
screen = pygame.display.set_mode((800, 600))

# Blank surface (no transparency)
overlay = pygame.Surface((200, 150))

# Blank surface with per-pixel alpha
hud = pygame.Surface((200, 150), pygame.SRCALPHA)

# From an image file
sprite = pygame.image.load("player.png")
```

### The SRCALPHA Flag

Creating a surface with `pygame.SRCALPHA` enables per-pixel transparency. Each pixel stores its own alpha value (0–255). This is essential for smooth-edged sprites, semi-transparent UI panels, and particle effects.

```python
# Opaque surface — no alpha channel
solid = pygame.Surface((100, 100))
solid.fill((255, 0, 0))  # Solid red, fully opaque

# Per-pixel alpha surface — supports partial transparency
transparent = pygame.Surface((100, 100), pygame.SRCALPHA)
transparent.fill((255, 0, 0, 128))  # Semi-transparent red
```

---

## Format Conversion (Critical for Performance)

**This is the single most important optimization in Pygame.** Unconverted surfaces blit 5–10× slower because the renderer must translate pixel formats on every frame.

```python
# CORRECT — convert to display format after loading
background = pygame.image.load("bg.jpg").convert()       # Opaque images
player = pygame.image.load("player.png").convert_alpha()  # Images with transparency

# WRONG — unconverted surface (extremely slow blitting)
slow_image = pygame.image.load("bg.jpg")
```

### When to use which

| Method | Use for | Creates alpha channel |
|--------|---------|----------------------|
| `.convert()` | Opaque images (backgrounds, tiles) | No |
| `.convert_alpha()` | Images with transparency (sprites, UI) | Yes (per-pixel) |

Call `convert()` / `convert_alpha()` exactly once, at load time. Never call it every frame.

---

## Blitting (Drawing Surfaces onto Surfaces)

`blit()` copies pixels from a source surface onto a destination surface. This is how you compose every frame.

```python
# Basic blit — draw sprite at position (100, 200)
screen.blit(player_image, (100, 200))

# Blit with destination Rect
screen.blit(player_image, player_image.get_rect(center=(400, 300)))

# Blit a sub-region of the source (sprite sheets)
frame_rect = pygame.Rect(64, 0, 32, 32)  # x, y, width, height in source
screen.blit(spritesheet, (100, 200), area=frame_rect)
```

### Batch Blitting

```python
# blits() — draw many surfaces efficiently in one call
blit_sequence = [
    (tree_image, (100, 300)),
    (rock_image, (250, 350)),
    (bush_image, (400, 320)),
]
screen.blits(blit_sequence)

# pygame-ce only: fblits() — even faster batch blitting
# screen.fblits(blit_sequence)  # pygame-ce exclusive
```

### Blend Modes (special_flags)

```python
# Additive blending (glow effects, light)
screen.blit(glow_surface, (x, y), special_flags=pygame.BLEND_ADD)

# Subtractive blending (shadows)
screen.blit(shadow_surface, (x, y), special_flags=pygame.BLEND_SUB)

# Multiplicative blending (color tinting)
screen.blit(tint_surface, (x, y), special_flags=pygame.BLEND_MULT)

# Alpha-aware variants
screen.blit(light, pos, special_flags=pygame.BLEND_RGBA_ADD)
screen.blit(overlay, pos, special_flags=pygame.BLEND_RGBA_MULT)

# Pre-multiplied alpha (more correct alpha compositing)
screen.blit(sprite, pos, special_flags=pygame.BLEND_PREMULTIPLIED)
```

---

## Transparency

Pygame supports three transparency systems. They cannot all be mixed freely.

### 1. Colorkey Transparency

Designates one color as "invisible." Fast, but edges are hard (no anti-aliasing).

```python
sprite = pygame.image.load("sprite_magenta_bg.png").convert()
sprite.set_colorkey((255, 0, 255))  # Magenta pixels become transparent

# RLE acceleration — faster blitting for colorkeyed surfaces
sprite.set_colorkey((255, 0, 255), pygame.RLEACCEL)
```

### 2. Surface Alpha (Blanket Transparency)

Applies a single alpha value to the entire surface. Can combine with colorkey.

```python
overlay = pygame.Surface((800, 600)).convert()
overlay.fill((0, 0, 0))
overlay.set_alpha(128)  # 50% transparent black (screen dimming effect)
screen.blit(overlay, (0, 0))
```

### 3. Per-Pixel Alpha

Each pixel has its own alpha. Used by `.convert_alpha()` surfaces and surfaces created with `SRCALPHA`. Cannot combine with colorkey or surface alpha.

```python
# Loaded with per-pixel alpha
sprite = pygame.image.load("sprite.png").convert_alpha()

# Created with per-pixel alpha
circle_surface = pygame.Surface((50, 50), pygame.SRCALPHA)
pygame.draw.circle(circle_surface, (255, 0, 0, 180), (25, 25), 25)
```

### Compatibility Matrix

| Feature | Colorkey | Surface Alpha | Per-Pixel Alpha |
|---------|----------|---------------|-----------------|
| Colorkey | — | Yes | No |
| Surface Alpha | Yes | — | Yes (pygame 2.0+) |
| Per-Pixel Alpha | No | Yes (pygame 2.0+) | — |

---

## Drawing Primitives

`pygame.draw` provides functions for basic shapes. All return a `Rect` of the affected area.

```python
# Rectangle
pygame.draw.rect(screen, (255, 0, 0), (50, 50, 200, 100))            # Filled
pygame.draw.rect(screen, (255, 0, 0), (50, 50, 200, 100), width=2)   # Outline

# Rounded rectangle (pygame 2.0+)
pygame.draw.rect(screen, (0, 128, 255), (50, 50, 200, 100), border_radius=15)

# Circle
pygame.draw.circle(screen, (0, 255, 0), center=(400, 300), radius=50)
pygame.draw.circle(screen, (0, 255, 0), (400, 300), 50, width=3)     # Ring

# Ellipse
pygame.draw.ellipse(screen, (255, 255, 0), (100, 100, 200, 80))

# Line
pygame.draw.line(screen, (255, 255, 255), (0, 0), (800, 600), width=2)

# Anti-aliased line
pygame.draw.aaline(screen, (255, 255, 255), (0, 0), (800, 600))

# Polygon
points = [(300, 100), (400, 250), (200, 250)]
pygame.draw.polygon(screen, (128, 0, 255), points)

# Multiple connected lines
path = [(100, 100), (200, 50), (300, 100), (400, 50)]
pygame.draw.lines(screen, (255, 255, 255), closed=False, points=path, width=2)
pygame.draw.aalines(screen, (255, 255, 255), closed=True, points=path)  # Anti-aliased
```

---

## Subsurfaces and Clipping

### Subsurfaces — shared pixel data

```python
# A subsurface shares memory with its parent
spritesheet = pygame.image.load("sprites.png").convert_alpha()
frame_0 = spritesheet.subsurface(pygame.Rect(0, 0, 32, 32))
frame_1 = spritesheet.subsurface(pygame.Rect(32, 0, 32, 32))

# Modifying the subsurface modifies the parent (and vice versa)
# Use .copy() if you need an independent surface
independent = spritesheet.subsurface(pygame.Rect(0, 0, 32, 32)).copy()
```

### Clipping — restrict drawing area

```python
# Only draw within this rectangle
screen.set_clip(pygame.Rect(100, 100, 400, 300))
screen.fill((0, 0, 0))  # only fills the clipped area
# ... draw more things, all clipped ...

# Reset clipping
screen.set_clip(None)

# Get current clip area
clip = screen.get_clip()
```

---

## Display Updates

```python
# Flip — update the entire display (use with full-screen redraws)
pygame.display.flip()

# Update — update only specific rectangles (use with dirty-rect rendering)
dirty_rects = [player.rect, enemy.rect, ui_panel_rect]
pygame.display.update(dirty_rects)

# Update everything (equivalent to flip)
pygame.display.update()
```

### Dirty Rect Pattern

For games with mostly static backgrounds, only redrawing changed areas is dramatically faster:

```python
class DirtyRectRenderer:
    def __init__(self, screen, background):
        self.screen = screen
        self.background = background
        self.dirty_rects: list[pygame.Rect] = []

    def clear_sprite(self, sprite):
        """Erase sprite by redrawing background over its old position."""
        self.screen.blit(self.background, sprite.rect, area=sprite.rect)
        self.dirty_rects.append(sprite.rect.copy())

    def draw_sprite(self, sprite):
        """Draw sprite at current position."""
        self.screen.blit(sprite.image, sprite.rect)
        self.dirty_rects.append(sprite.rect.copy())

    def update_display(self):
        """Push only changed rects to the display."""
        pygame.display.update(self.dirty_rects)
        self.dirty_rects.clear()
```

---

## Pixel-Level Access

For bulk pixel manipulation, use `pygame.surfarray` (requires numpy) instead of `get_at()`/`set_at()`.

```python
import numpy as np

# get_at / set_at — fine for single pixels, disastrous in loops
color = surface.get_at((10, 20))   # Returns Color(r, g, b, a)
surface.set_at((10, 20), (255, 0, 0))

# surfarray — fast bulk access via numpy
pixels = pygame.surfarray.pixels3d(surface)  # Shape: (width, height, 3)
alpha = pygame.surfarray.pixels_alpha(surface)  # Shape: (width, height)

# Example: invert all colors
pixels[:] = 255 - pixels

# Example: apply red tint
pixels[:, :, 0] = np.minimum(pixels[:, :, 0] + 50, 255)

# Lock is held while array exists — delete when done
del pixels
del alpha
```

---

## pygame-ce Specific Features

| Feature | pygame | pygame-ce |
|---------|--------|-----------|
| `Surface.fblits()` | Not available | Faster batch blit |
| `FRect` | Not available | Float-precision Rect |
| `transform.box_blur()` | Not available | Built-in blur filter |
| `transform.gaussian_blur()` | Not available | Gaussian blur |

```python
# pygame-ce only — check before using
if hasattr(pygame, 'IS_CE') and pygame.IS_CE:
    # Batch blit (faster than blits)
    screen.fblits([(img, pos) for img, pos in draw_list])

    # Built-in blur
    blurred = pygame.transform.gaussian_blur(surface, radius=5)

    # Float-precision rect for smooth subpixel movement
    from pygame import FRect
    player_pos = FRect(100.5, 200.7, 32, 32)
```

---

## Performance Checklist

1. **Always `convert()` / `convert_alpha()`** — the #1 optimization. Do it at load time.
2. **Minimize per-frame Surface creation** — pre-create and reuse surfaces (especially rotated/scaled versions).
3. **Use `Group.draw()` over manual blit loops** — the sprite system is optimized for batch drawing.
4. **Pre-render static layers** — blit tiles/background once to a cached surface, then blit that single surface per frame.
5. **Use `display.update(rects)` for partially static scenes** — avoid redrawing the entire screen when only a few sprites moved.
6. **Prefer `surfarray` over `set_at()` loops** — numpy vectorized operations are orders of magnitude faster.
7. **Apply `RLEACCEL` to colorkeyed surfaces** — improves blit speed at the cost of slower surface modification.
8. **Avoid `transform.rotate()` / `transform.scale()` every frame** — cache results. Successive rotations degrade quality; always rotate from the original.
