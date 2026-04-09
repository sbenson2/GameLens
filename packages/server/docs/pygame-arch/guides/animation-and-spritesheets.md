# Animation and Spritesheets

> **Category:** guide · **Engine:** Pygame · **Related:** [sprites-and-collision.md](sprites-and-collision.md), [../reference/surfaces-and-drawing.md](../reference/surfaces-and-drawing.md), [../architecture/game-loop-and-state.md](../architecture/game-loop-and-state.md)

How to load spritesheets, extract frames, and animate sprites with delta-time in Pygame and pygame-ce — from a basic flipbook to a reusable animation state machine.

---

## Loading a Spritesheet

A spritesheet is a single image containing multiple animation frames arranged in a grid. Loading one image is far cheaper than loading dozens of separate files.

### Spritesheet Loader Class

```python
import pygame

class SpriteSheet:
    """Load and extract frames from a single spritesheet image."""

    def __init__(self, filename: str):
        # convert() drops the alpha channel for faster blitting on opaque sheets
        self.sheet = pygame.image.load(filename).convert()

    def image_at(self, rect, colorkey=None) -> pygame.Surface:
        """Grab a single frame at (x, y, width, height)."""
        image = pygame.Surface(rect[2:], pygame.SRCALPHA)
        image.blit(self.sheet, (0, 0), rect)
        if colorkey is not None:
            image.set_colorkey(
                image.get_at((0, 0)) if colorkey == -1 else colorkey
            )
        return image

    def load_strip(self, start_rect, frame_count, colorkey=None):
        """Load a horizontal strip of equally-spaced frames."""
        x, y, w, h = start_rect
        return [
            self.image_at((x + w * i, y, w, h), colorkey)
            for i in range(frame_count)
        ]
```

**Key points:**
- Use `convert()` for opaque sheets, `convert_alpha()` for sheets with transparency. This can be up to 6× faster than an unconverted Surface.
- `colorkey=-1` auto-detects the transparent colour from the top-left pixel.
- For sheets with irregular frame sizes (texture atlases), pair with a JSON/XML data file that maps frame names to rects.

### Loading with Transparency

```python
# Per-pixel alpha (PNG with alpha channel)
sheet = pygame.image.load("characters.png").convert_alpha()

# Colorkey alpha (magenta background)
sheet = pygame.image.load("tileset.bmp").convert()
sheet.set_colorkey((255, 0, 255))
```

---

## Frame-Based Animation

The simplest animation pattern: cycle through a list of frames using delta time.

### AnimatedSprite Class

```python
class AnimatedSprite(pygame.sprite.Sprite):
    def __init__(self, frames, fps=12, loop=True, *groups):
        super().__init__(*groups)
        self.frames = frames
        self.frame_duration = 1.0 / fps  # seconds per frame
        self.loop = loop
        self.timer = 0.0
        self.frame_index = 0
        self.image = self.frames[0]
        self.rect = self.image.get_rect()
        self.finished = False

    def update(self, dt):
        if self.finished:
            return
        self.timer += dt
        while self.timer >= self.frame_duration:
            self.timer -= self.frame_duration
            self.frame_index += 1
            if self.frame_index >= len(self.frames):
                if self.loop:
                    self.frame_index = 0
                else:
                    self.frame_index = len(self.frames) - 1
                    self.finished = True
                    break
        self.image = self.frames[self.frame_index]
```

**Why `while` instead of `if`?** If a lag spike makes `dt` larger than one frame duration, the `while` loop skips the right number of frames rather than falling behind.

### Wiring It Up

```python
sheet = SpriteSheet("hero.png")
walk_frames = sheet.load_strip((0, 0, 32, 32), 6, colorkey=-1)
hero = AnimatedSprite(walk_frames, fps=10)

all_sprites = pygame.sprite.Group(hero)

clock = pygame.time.Clock()
running = True
while running:
    dt = clock.tick(60) / 1000.0  # seconds
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False
    all_sprites.update(dt)
    screen.fill((0, 0, 0))
    all_sprites.draw(screen)
    pygame.display.flip()
```

---

## Animation State Machine

Real characters have multiple animations (idle, walk, attack, hurt). A state machine keeps the logic clean.

```python
class CharacterSprite(pygame.sprite.Sprite):
    def __init__(self, animations: dict[str, list[pygame.Surface]], *groups):
        """
        animations: {"idle": [frames], "walk": [frames], "attack": [frames]}
        """
        super().__init__(*groups)
        self.animations = animations
        self.state = "idle"
        self.frame_index = 0
        self.timer = 0.0
        self.fps_map = {"idle": 6, "walk": 10, "attack": 14}
        self.image = self.animations[self.state][0]
        self.rect = self.image.get_rect()
        self.facing_right = True

    def set_state(self, new_state: str):
        """Switch animation — resets to frame 0."""
        if new_state != self.state and new_state in self.animations:
            self.state = new_state
            self.frame_index = 0
            self.timer = 0.0

    def update(self, dt):
        frames = self.animations[self.state]
        fps = self.fps_map.get(self.state, 10)
        self.timer += dt
        frame_dur = 1.0 / fps
        while self.timer >= frame_dur:
            self.timer -= frame_dur
            self.frame_index = (self.frame_index + 1) % len(frames)

        frame = frames[self.frame_index]
        # Flip horizontally when facing left
        self.image = frame if self.facing_right else pygame.transform.flip(frame, True, False)
```

**Tip:** Cache flipped frames at load time instead of flipping every frame at runtime. `pygame.transform.flip` allocates a new Surface each call.

```python
# Pre-flip once during loading
walk_right = sheet.load_strip((0, 64, 32, 32), 6, colorkey=-1)
walk_left = [pygame.transform.flip(f, True, False) for f in walk_right]
```

---

## Texture Atlas (JSON) Loading

Production spritesheets often use a texture atlas — a JSON file that maps frame names to rects, produced by tools like TexturePacker, Aseprite, or free-texture-packer.

```json
{
  "frames": {
    "hero_idle_0.png": {"frame": {"x": 0, "y": 0, "w": 32, "h": 32}},
    "hero_idle_1.png": {"frame": {"x": 32, "y": 0, "w": 32, "h": 32}},
    "hero_walk_0.png": {"frame": {"x": 0, "y": 32, "w": 32, "h": 32}}
  }
}
```

```python
import json

def load_atlas(image_path: str, json_path: str) -> dict[str, pygame.Surface]:
    """Load a texture atlas and return a name→Surface dict."""
    sheet = pygame.image.load(image_path).convert_alpha()
    with open(json_path) as f:
        data = json.load(f)
    frames = {}
    for name, info in data["frames"].items():
        r = info["frame"]
        rect = (r["x"], r["y"], r["w"], r["h"])
        surf = pygame.Surface((r["w"], r["h"]), pygame.SRCALPHA)
        surf.blit(sheet, (0, 0), rect)
        frames[name] = surf
    return frames
```

Then group frames by animation name:

```python
atlas = load_atlas("hero.png", "hero.json")
# Collect frames whose name starts with "hero_walk_", sorted
walk_frames = sorted(
    [surf for name, surf in atlas.items() if name.startswith("hero_walk_")],
    key=lambda s: list(atlas.keys()).index(
        next(k for k, v in atlas.items() if v is s)
    ),
)
```

---

## pygame-ce Differences

pygame-ce (community edition) is API-compatible but has a few animation-relevant improvements:

- **`Surface.blits()`** accepts a sequence of `(source, dest)` pairs and draws them all in one call — measurably faster for batch-drawing many animated sprites.
- **`pygame.image.load()` in pygame-ce** supports AVIF and JXL formats in addition to PNG/BMP/JPG.
- **`pygame.transform` functions** in pygame-ce are SIMD-optimized, making runtime flips and rotations cheaper (though pre-caching is still recommended for hot paths).

---

## Performance Checklist

1. **Always `convert()` or `convert_alpha()`** loaded images. Unconverted surfaces are the #1 pygame performance mistake.
2. **Cache frames.** Never call `SpriteSheet.image_at()` inside `update()` — load all frames up front.
3. **Pre-flip directional sprites** at load time rather than flipping per frame.
4. **Use `Surface.blits()`** (pygame-ce) or minimize individual `blit()` calls by batching via sprite groups.
5. **Scale sprites at load time**, not every frame. `pygame.transform.scale()` is expensive per call.
6. **Limit unique animation FPS.** 8–12 FPS is standard for pixel art; 15–24 for high-res. Higher wastes memory on frames the eye can't distinguish.
