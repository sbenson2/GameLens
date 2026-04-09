# Project Structure & Organization

> **Category:** guide · **Engine:** Pygame · **Related:** [game-loop-and-state](../architecture/game-loop-and-state.md), [scene-management-patterns](scene-management-patterns.md), [distribution-and-packaging](../reference/distribution-and-packaging.md)

A well-organized Pygame project separates assets from code, isolates game systems into focused modules, and keeps a clear entry point. This guide covers practical project layouts from simple prototypes to larger games, with notes on pygame-ce compatibility throughout.

---

## Starter Layout (Prototypes & Jams)

For small projects (game jams, prototypes, learning exercises), keep it flat:

```
my_game/
├── main.py              # Entry point — init, game loop, quit
├── settings.py          # Constants: SCREEN_WIDTH, FPS, colors
├── player.py            # Player sprite class
├── enemies.py           # Enemy sprite classes
├── assets/
│   ├── images/          # PNGs, spritesheets
│   └── sounds/          # WAV/OGG files
├── requirements.txt     # pygame or pygame-ce pinned version
└── README.md
```

**`main.py`** should be the only file that calls `pygame.init()` and `pygame.quit()`. Everything else imports what it needs.

```python
# main.py — minimal entry point
import pygame
from settings import SCREEN_WIDTH, SCREEN_HEIGHT, FPS

def main():
    pygame.init()
    screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
    clock = pygame.time.Clock()
    running = True

    while running:
        dt = clock.tick(FPS) / 1000.0
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
        screen.fill((0, 0, 0))
        pygame.display.flip()

    pygame.quit()

if __name__ == "__main__":
    main()
```

```python
# settings.py — single source of truth for constants
SCREEN_WIDTH = 800
SCREEN_HEIGHT = 600
FPS = 60
TILE_SIZE = 32

# Colors
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
```

---

## Scalable Layout (Full Games)

Once your game grows past a few files, organize by responsibility:

```
my_game/
├── src/
│   ├── __init__.py
│   ├── main.py              # Entry point
│   ├── core/
│   │   ├── __init__.py
│   │   ├── settings.py      # Constants, config loading
│   │   ├── assets.py        # Centralized asset loader
│   │   ├── input.py         # Input abstraction layer
│   │   └── window.py        # Display init, resolution handling
│   ├── scenes/
│   │   ├── __init__.py
│   │   ├── base_scene.py    # Abstract scene class
│   │   ├── title.py         # Title/menu screen
│   │   ├── gameplay.py      # Main gameplay scene
│   │   └── pause.py         # Pause overlay
│   ├── entities/
│   │   ├── __init__.py
│   │   ├── player.py
│   │   ├── enemy.py
│   │   └── projectile.py
│   ├── systems/
│   │   ├── __init__.py
│   │   ├── collision.py     # Collision detection & response
│   │   ├── camera.py        # Viewport/scrolling logic
│   │   ├── particles.py     # Particle emitter
│   │   └── audio.py         # Sound manager wrapper
│   ├── ui/
│   │   ├── __init__.py
│   │   ├── hud.py           # In-game HUD
│   │   ├── button.py        # Clickable button widget
│   │   └── dialog.py        # Text dialog box
│   └── utils/
│       ├── __init__.py
│       ├── math_helpers.py  # Vector ops, lerp, clamp
│       ├── timer.py         # Cooldown/delay helpers
│       └── debug.py         # FPS overlay, hitbox drawing
├── assets/
│   ├── images/
│   │   ├── player/          # Group by entity
│   │   ├── enemies/
│   │   ├── tiles/
│   │   └── ui/
│   ├── sounds/
│   │   ├── sfx/
│   │   └── music/
│   ├── fonts/
│   └── maps/                # Tiled .tmx files
├── tests/
│   ├── test_collision.py
│   └── test_math_helpers.py
├── requirements.txt
├── pyproject.toml           # Modern Python packaging
└── README.md
```

### Why This Structure Works

**`core/`** handles everything that exists before gameplay starts — window creation, settings, asset loading. Nothing in `core/` depends on game-specific logic.

**`scenes/`** isolates each game state. A scene manager switches between them. Each scene owns its own `update()`, `draw()`, and `handle_events()` methods. See the [scene-management-patterns](scene-management-patterns.md) guide.

**`entities/`** contains sprite subclasses — things that exist in the game world. Entities should not import from `scenes/` (scenes own entities, not the reverse).

**`systems/`** holds logic that operates across entities: collision resolution, camera tracking, particle simulation. Systems receive entity groups as arguments rather than reaching into global state.

**`ui/`** is separate from entities because UI elements live in screen space, not world space. They respond to different events and draw at a different layer.

**`utils/`** stores pure functions and small helpers with no Pygame dependencies where possible, making them testable with plain `pytest`.

---

## Centralized Asset Loader

Loading assets at the point of use causes scattered `pygame.image.load()` calls and makes it hard to ensure `.convert()` or `.convert_alpha()` is applied consistently. A centralized loader solves this:

```python
# core/assets.py
import os
import pygame

class AssetLoader:
    """Load and cache game assets with automatic surface conversion."""

    def __init__(self, base_path: str = "assets"):
        self.base_path = base_path
        self._image_cache: dict[str, pygame.Surface] = {}
        self._sound_cache: dict[str, pygame.mixer.Sound] = {}
        self._font_cache: dict[tuple[str, int], pygame.Font] = {}

    def image(self, path: str, alpha: bool = True) -> pygame.Surface:
        """Load an image, convert for performance, and cache it."""
        if path not in self._image_cache:
            full_path = os.path.join(self.base_path, "images", path)
            surface = pygame.image.load(full_path)
            # .convert_alpha() for transparent sprites,
            # .convert() for opaque backgrounds — huge perf difference
            surface = surface.convert_alpha() if alpha else surface.convert()
            self._image_cache[path] = surface
        return self._image_cache[path]

    def sound(self, path: str) -> pygame.mixer.Sound:
        """Load a sound effect and cache it."""
        if path not in self._sound_cache:
            full_path = os.path.join(self.base_path, "sounds", path)
            self._sound_cache[path] = pygame.mixer.Sound(full_path)
        return self._sound_cache[path]

    def font(self, name: str | None, size: int) -> pygame.font.Font:
        """Load a font at a given size. None = default system font."""
        key = (name, size)
        if key not in self._font_cache:
            if name:
                full_path = os.path.join(self.base_path, "fonts", name)
                self._font_cache[key] = pygame.font.Font(full_path, size)
            else:
                self._font_cache[key] = pygame.font.Font(None, size)
        return self._font_cache[key]
```

Create one instance in `main.py` and pass it to scenes/entities that need assets. Avoid making it a global singleton if you can — explicit dependency passing makes testing easier.

---

## Dependency Flow

Keep imports flowing in one direction to avoid circular dependencies:

```
settings ← core ← systems ← entities ← scenes ← main
                     ↑                      ↑
                   utils                   ui
```

**Rules of thumb:**

- `settings.py` imports nothing from your project.
- `core/` imports only from `settings`.
- `entities/` may import from `core/` and `utils/`, never from `scenes/`.
- `scenes/` import from everywhere below them — they are the orchestrators.
- `main.py` imports from `core/` and `scenes/`, wires everything together.

---

## Asset Organization

Group assets by what they represent, not by file type:

```
# Prefer this — find everything related to the player in one place
assets/images/player/idle.png
assets/images/player/run_sheet.png
assets/images/player/jump.png

# Over this — scrolling through 50 PNGs to find player files
assets/images/idle_player.png
assets/images/run_player.png
assets/images/idle_enemy.png
```

For tilemaps, keep the Tiled `.tmx` files alongside the tileset images they reference, or use a dedicated `maps/` folder with tilesets in a sub-directory.

---

## pygame-ce Compatibility

If you want your project to work with both pygame and pygame-ce:

```python
# core/compat.py — detect which runtime is available
import pygame

IS_CE = getattr(pygame, "IS_CE", False)

def batch_blit(target: pygame.Surface, blit_list: list[tuple]):
    """Use fblits() on pygame-ce, fall back to sequential blit()."""
    if IS_CE:
        target.fblits(blit_list)
    else:
        for surface, pos in blit_list:
            target.blit(surface, pos)
```

Pin your dependency explicitly in `requirements.txt`:

```
# For standard pygame:
pygame>=2.6,<3.0

# For pygame-ce:
# pygame-ce>=2.5,<3.0
```

Do not install both simultaneously — they share the `pygame` namespace and will conflict.

---

## Virtual Environments

Always use a virtual environment. This prevents version conflicts and makes distribution reproducible:

```bash
# Create and activate
python -m venv .venv
source .venv/bin/activate   # Linux/macOS
.venv\Scripts\activate      # Windows

# Install dependencies
pip install -r requirements.txt

# Freeze exact versions after adding new packages
pip freeze > requirements.txt
```

For modern projects, prefer `pyproject.toml` with a build backend (setuptools, hatchling, or flit) over raw `requirements.txt`. This enables `pip install -e .` for editable installs and cleaner metadata for PyInstaller/Nuitka builds.

---

## Testing Pygame Code

Pure logic (math helpers, state machines, scoring) can be tested with standard `pytest`. For code that touches Pygame APIs, initialize a headless display:

```python
# tests/conftest.py
import pytest
import pygame

@pytest.fixture(scope="session", autouse=True)
def init_pygame():
    """Initialize Pygame with a hidden display for testing."""
    pygame.init()
    # Create a tiny off-screen surface (no window appears)
    pygame.display.set_mode((1, 1), pygame.NOFRAME)
    yield
    pygame.quit()
```

```python
# tests/test_collision.py
import pygame
from src.systems.collision import check_overlap

def test_overlapping_rects():
    a = pygame.Rect(0, 0, 50, 50)
    b = pygame.Rect(25, 25, 50, 50)
    assert check_overlap(a, b) is True

def test_non_overlapping_rects():
    a = pygame.Rect(0, 0, 50, 50)
    b = pygame.Rect(100, 100, 50, 50)
    assert check_overlap(a, b) is False
```

Keep Pygame-dependent tests minimal. The more logic you extract into pure Python functions, the faster and more reliable your test suite will be.
