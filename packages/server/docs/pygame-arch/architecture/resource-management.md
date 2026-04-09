# Pygame Resource Management and Asset Loading

> **Category:** architecture · **Engine:** Pygame · **Related:** [game-loop-and-state](game-loop-and-state.md), [surfaces-and-drawing](../reference/surfaces-and-drawing.md), [performance-and-pygame-ce](../guides/performance-and-pygame-ce.md)

Pygame provides low-level asset loading functions but no built-in resource manager. This doc covers the patterns, caching strategies, and optimization techniques used in production Pygame projects to load, store, and manage game assets efficiently.

---

## Why You Need a Resource Manager

In a raw Pygame project, you might call `pygame.image.load()` every time you need a sprite. This is expensive — it hits the filesystem and decodes the image on each call. A resource manager solves three problems:

1. **Performance** — load each asset once, cache it, serve from memory thereafter.
2. **Format conversion** — call `convert()` or `convert_alpha()` at load time so every blit is fast.
3. **Organization** — centralize asset paths, making refactors and packaging painless.

---

## Surface Conversion — The Single Most Important Optimization

When Pygame loads an image, it creates a surface in the file's native pixel format. Every time you blit that surface, Pygame must convert it to the display format *per frame*. Calling `convert()` or `convert_alpha()` once at load time eliminates this per-blit conversion.

```python
# BAD — raw load, unconverted surface, slow blitting
sprite = pygame.image.load("assets/player.png")

# GOOD — converted to display format, fast blitting
sprite = pygame.image.load("assets/player.png").convert_alpha()
```

### When to Use Each

| Method | Use When | Notes |
|--------|----------|-------|
| `.convert()` | No transparency needed (backgrounds, tiles) | Fastest blit. Discards alpha channel. |
| `.convert_alpha()` | Per-pixel transparency (sprites, UI, particles) | Slightly slower than `convert()` but preserves alpha. |

**Important:** You can only call `convert()` / `convert_alpha()` *after* `pygame.display.set_mode()` has been called, because they need to know the display's pixel format.

---

## Dictionary-Based Asset Cache

The simplest production-ready pattern: a dictionary keyed by asset name, populated at load time.

```python
import os
import pygame


class AssetCache:
    """Load-once, serve-forever asset manager."""

    def __init__(self, base_path: str = "assets"):
        self._base_path = base_path
        self._images: dict[str, pygame.Surface] = {}
        self._sounds: dict[str, pygame.mixer.Sound] = {}
        self._fonts: dict[tuple[str | None, int], pygame.font.Font] = {}

    # --- Images ---

    def load_image(
        self,
        name: str,
        alpha: bool = True,
        scale: tuple[int, int] | None = None,
    ) -> pygame.Surface:
        """Load an image, convert it, cache it, return it."""
        if name in self._images:
            return self._images[name]

        path = os.path.join(self._base_path, "images", name)
        surface = pygame.image.load(path)
        surface = surface.convert_alpha() if alpha else surface.convert()

        if scale:
            surface = pygame.transform.scale(surface, scale)

        self._images[name] = surface
        return surface

    # --- Sounds ---

    def load_sound(self, name: str, volume: float = 1.0) -> pygame.mixer.Sound:
        """Load a sound effect, cache it."""
        if name in self._sounds:
            return self._sounds[name]

        path = os.path.join(self._base_path, "sounds", name)
        sound = pygame.mixer.Sound(path)
        sound.set_volume(volume)
        self._sounds[name] = sound
        return sound

    # --- Fonts ---

    def load_font(
        self, name: str | None = None, size: int = 24
    ) -> pygame.font.Font:
        """Load a font by filename (or None for default), cache by (name, size)."""
        key = (name, size)
        if key in self._fonts:
            return self._fonts[key]

        if name is None:
            font = pygame.font.Font(None, size)
        else:
            path = os.path.join(self._base_path, "fonts", name)
            font = pygame.font.Font(path, size)

        self._fonts[key] = font
        return font

    # --- Bulk loading ---

    def preload_images(self, *names: str, alpha: bool = True) -> None:
        """Preload a batch of images during a loading screen."""
        for name in names:
            self.load_image(name, alpha=alpha)

    def clear(self) -> None:
        """Release all cached assets (e.g., between levels)."""
        self._images.clear()
        self._sounds.clear()
        self._fonts.clear()
```

### Usage

```python
# Create once, early in your game
assets = AssetCache("assets")

# Load on first access, cached on subsequent access
player_img = assets.load_image("player/idle.png")
jump_sfx = assets.load_sound("sfx/jump.ogg")
title_font = assets.load_font("PressStart2P.ttf", 32)
```

---

## Sprite Sheet Extraction

Rather than loading dozens of individual frame files, load one sprite sheet and extract frames with `subsurface()`. This is faster (one file I/O) and uses less memory (subsurfaces share the parent surface's pixel data).

```python
def load_spritesheet(
    path: str,
    frame_width: int,
    frame_height: int,
    count: int,
    columns: int | None = None,
) -> list[pygame.Surface]:
    """Extract frames from a grid-based sprite sheet.

    Args:
        path: Path to the sprite sheet image.
        frame_width: Width of a single frame in pixels.
        frame_height: Height of a single frame in pixels.
        count: Total number of frames to extract.
        columns: Frames per row. If None, auto-detect from sheet width.

    Returns:
        List of frame surfaces (sharing parent pixel data).
    """
    sheet = pygame.image.load(path).convert_alpha()
    if columns is None:
        columns = sheet.get_width() // frame_width

    frames = []
    for i in range(count):
        col = i % columns
        row = i // columns
        rect = pygame.Rect(col * frame_width, row * frame_height,
                           frame_width, frame_height)
        frames.append(sheet.subsurface(rect))
    return frames
```

**Key point:** `subsurface()` does *not* copy pixel data — it returns a view into the parent surface. This means the parent must stay alive as long as any subsurface is in use.

---

## Lazy Loading Pattern

For large games where loading everything upfront would be slow, use lazy loading — assets are loaded on first access, not at startup.

```python
class LazyImage:
    """Descriptor that loads an image on first access."""

    def __init__(self, path: str, alpha: bool = True):
        self._path = path
        self._alpha = alpha
        self._surface: pygame.Surface | None = None

    @property
    def surface(self) -> pygame.Surface:
        if self._surface is None:
            raw = pygame.image.load(self._path)
            self._surface = raw.convert_alpha() if self._alpha else raw.convert()
        return self._surface
```

**Trade-off:** Lazy loading avoids long startup times but can cause mid-game hitches the first time an asset is needed. Combine with preloading during scene transitions for the best of both worlds.

---

## Project Directory Layout

A consistent asset directory structure prevents path spaghetti as projects grow.

```
assets/
├── images/
│   ├── player/
│   │   ├── idle.png
│   │   ├── run_sheet.png     # sprite sheet
│   │   └── jump_sheet.png
│   ├── enemies/
│   ├── tiles/
│   └── ui/
├── sounds/
│   ├── sfx/
│   │   ├── jump.ogg
│   │   └── hit.ogg
│   └── music/
│       ├── title.ogg
│       └── level1.ogg
├── fonts/
│   └── PressStart2P.ttf
└── data/
    ├── levels/
    └── dialogue.json
```

**Use OGG for audio.** MP3 support varies across platforms and Pygame builds. OGG Vorbis is universally supported and patent-free.

---

## Music Streaming vs. Sound Effects

Pygame distinguishes between `pygame.mixer.Sound` (fully loaded into memory) and `pygame.mixer.music` (streamed from disk). Choose correctly:

| Asset Type | API | Memory | Channels |
|------------|-----|--------|----------|
| Short SFX (< 5 seconds) | `pygame.mixer.Sound` | Loaded fully | Any of 8+ channels |
| Background music / long audio | `pygame.mixer.music` | Streamed | One dedicated channel |

```python
# SFX — load into memory, play on any channel
hit_sound = pygame.mixer.Sound("assets/sounds/sfx/hit.ogg")
hit_sound.play()

# Music — stream from disk, only one track at a time
pygame.mixer.music.load("assets/sounds/music/level1.ogg")
pygame.mixer.music.play(loops=-1)  # -1 = loop forever
```

---

## pygame-ce Differences

The community edition (pygame-ce) is a maintained fork of pygame with performance improvements and new features. Key resource management differences:

- **`pygame.image.load()` is faster** — pygame-ce has optimized image loading paths, especially for PNG.
- **`Surface.premul_alpha()`** — returns a new surface with premultiplied alpha, which is faster to blit when compositing many transparent layers.
- **`Surface.convert()` auto-detection** — behavior is the same, but internal conversion is faster due to SIMD optimizations.
- **API-compatible** — your `AssetCache` class works identically on both pygame and pygame-ce. No code changes needed.

---

## Common Pitfalls

1. **Forgetting `convert()` / `convert_alpha()`** — the #1 Pygame performance mistake. Every unconverted blit is 5–10× slower.
2. **Loading inside the game loop** — never call `pygame.image.load()` or `pygame.mixer.Sound()` per frame. Load once, cache forever.
3. **Holding references to freed surfaces** — if you `del` a sprite sheet, its subsurfaces become invalid. Keep the parent alive.
4. **Using MP3 for sound effects** — MP3 decoding has a startup delay. Use OGG for short SFX.
5. **Ignoring `pygame.mixer.pre_init()`** — call it *before* `pygame.init()` to set sample rate and buffer size. Mismatched rates cause audio artifacts.

```python
# Set audio before init to avoid resampling artifacts
pygame.mixer.pre_init(frequency=44100, size=-16, channels=2, buffer=512)
pygame.init()
```
