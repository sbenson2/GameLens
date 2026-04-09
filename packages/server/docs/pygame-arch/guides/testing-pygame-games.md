# Testing Pygame Games

> **Category:** guide · **Engine:** Pygame · **Related:** [Debugging and Profiling](debugging-and-profiling.md), [Game Loop and State](../architecture/game-loop-and-state.md), [Project Structure and Organization](project-structure-and-organization.md)

Pygame games are Python programs, so they benefit from the same testing tools as any Python project. The main challenge is that Pygame expects a display, audio device, and event loop — none of which exist in a CI environment. This guide covers how to structure a Pygame project for testability, run tests headlessly, and test game logic without fighting the rendering pipeline.

---

## Headless Display Setup

Pygame uses SDL under the hood. Setting the `SDL_VIDEODRIVER` environment variable to `"dummy"` before initializing Pygame gives you a virtual display that requires no window system.

```python
# conftest.py — pytest configuration for headless Pygame
import os
import pytest

# Must be set BEFORE importing pygame
os.environ["SDL_VIDEODRIVER"] = "dummy"
# Optionally silence audio in CI
os.environ["SDL_AUDIODRIVER"] = "dummy"

import pygame

@pytest.fixture(autouse=True, scope="session")
def init_pygame():
    """Initialize Pygame once for the entire test session."""
    pygame.init()
    # Create a small dummy display surface
    screen = pygame.display.set_mode((320, 240))
    yield screen
    pygame.quit()
```

This lets you run `pytest` in GitHub Actions, GitLab CI, or any headless server without installing a display manager.

### Limitations of the dummy driver

Some display functions behave differently under the dummy driver. `pygame.display.iconify()`, `pygame.display.toggle_fullscreen()`, and hardware-accelerated surface flags may not work as expected. Test these features manually or skip them in CI:

```python
import pytest

@pytest.mark.skipif(
    os.environ.get("SDL_VIDEODRIVER") == "dummy",
    reason="Fullscreen not supported under dummy video driver"
)
def test_fullscreen_toggle():
    pygame.display.toggle_fullscreen()
```

---

## Separating Logic from Rendering

The single most important design decision for testability is keeping game logic independent of `pygame.Surface`, `pygame.display`, and event handling. If your `Player.update()` method requires a screen to call, it's hard to test.

### Bad: logic coupled to rendering

```python
class Player:
    def update(self, screen, keys):
        if keys[pygame.K_RIGHT]:
            self.x += 5
        # Drawing in the update method — hard to test
        pygame.draw.rect(screen, (255, 0, 0), (self.x, self.y, 32, 32))
```

### Good: logic and rendering separated

```python
class Player:
    def __init__(self, x=0, y=0, speed=5):
        self.x = x
        self.y = y
        self.speed = speed

    def update(self, move_right=False, move_left=False, dt=1.0):
        """Pure logic — no pygame dependency."""
        if move_right:
            self.x += self.speed * dt
        if move_left:
            self.x -= self.speed * dt

    def draw(self, surface):
        """Rendering — only called in the game loop, not in tests."""
        pygame.draw.rect(surface, (255, 0, 0),
                         (self.x, self.y, 32, 32))
```

Now testing `Player.update()` requires zero Pygame initialization:

```python
def test_player_moves_right():
    player = Player(x=0, y=0, speed=5)
    player.update(move_right=True, dt=1.0)
    assert player.x == 5

def test_player_stays_still_by_default():
    player = Player(x=10, y=10)
    player.update(dt=1.0)
    assert player.x == 10
```

---

## Testing Collision Detection

Pygame's `Rect` is a pure data structure that works without a display, making collision logic easy to test.

```python
import pygame

def test_rect_collision():
    player_rect = pygame.Rect(10, 10, 32, 32)
    enemy_rect = pygame.Rect(30, 30, 32, 32)
    assert player_rect.colliderect(enemy_rect)

def test_no_collision_when_apart():
    player_rect = pygame.Rect(0, 0, 32, 32)
    enemy_rect = pygame.Rect(200, 200, 32, 32)
    assert not player_rect.colliderect(enemy_rect)

def test_sprite_group_collision():
    """Test using pygame.sprite.Group — requires Pygame init."""
    player = pygame.sprite.Sprite()
    player.rect = pygame.Rect(10, 10, 32, 32)
    player.image = pygame.Surface((32, 32))

    enemy = pygame.sprite.Sprite()
    enemy.rect = pygame.Rect(20, 20, 32, 32)
    enemy.image = pygame.Surface((32, 32))

    enemies = pygame.sprite.Group(enemy)
    collisions = pygame.sprite.spritecollide(player, enemies, False)
    assert len(collisions) == 1
```

---

## Simulating Input Events

Rather than pressing physical keys, create synthetic events and inject them:

```python
import pygame

def simulate_keydown(key):
    """Create a synthetic KEYDOWN event."""
    event = pygame.event.Event(pygame.KEYDOWN, key=key, mod=0,
                                unicode="", scancode=0)
    pygame.event.post(event)

def test_jump_on_space(init_pygame):
    player = Player(x=0, y=100)
    simulate_keydown(pygame.K_SPACE)

    # Process events the same way the game loop would
    for event in pygame.event.get():
        if event.type == pygame.KEYDOWN and event.key == pygame.K_SPACE:
            player.jump()

    assert player.velocity_y < 0  # moving upward
```

For more complex input testing, build a thin input abstraction that your game logic consumes:

```python
class InputState:
    """Testable input layer — populated from events in production,
    set directly in tests."""
    def __init__(self):
        self.move_left = False
        self.move_right = False
        self.jump = False
        self.fire = False

    def update_from_keys(self, keys):
        self.move_left = keys[pygame.K_LEFT]
        self.move_right = keys[pygame.K_RIGHT]
        self.jump = keys[pygame.K_SPACE]
        self.fire = keys[pygame.K_z]


# In tests — no Pygame needed
def test_player_fires():
    inp = InputState()
    inp.fire = True
    game = Game()
    game.process_input(inp)
    assert game.bullet_count == 1
```

---

## Testing Audio (Mixer)

Audio tests can verify that the right sounds are loaded and triggered without actually playing them. Use `unittest.mock` to patch the mixer:

```python
from unittest.mock import patch, MagicMock

def test_play_sfx_on_hit():
    sound_mock = MagicMock()
    with patch("pygame.mixer.Sound", return_value=sound_mock):
        sfx = pygame.mixer.Sound("hit.wav")
        sfx.play()
        sound_mock.play.assert_called_once()
```

Alternatively, create a sound manager with a testable interface:

```python
class SoundManager:
    def __init__(self, enabled=True):
        self.enabled = enabled
        self._play_log = []  # for testing

    def play(self, name):
        self._play_log.append(name)
        if self.enabled:
            self._sounds[name].play()

# In tests — disable actual playback, inspect the log
def test_explosion_sound():
    sm = SoundManager(enabled=False)
    sm.play("explosion")
    assert "explosion" in sm._play_log
```

---

## Testing State Machines and Scenes

If you use a scene/state manager (see [Scene Management Patterns](scene-management-patterns.md)), test scene transitions independently:

```python
class SceneManager:
    def __init__(self):
        self.current = None
        self.history = []

    def switch(self, scene_name):
        self.history.append(scene_name)
        self.current = scene_name

def test_scene_transition():
    sm = SceneManager()
    sm.switch("main_menu")
    sm.switch("gameplay")
    assert sm.current == "gameplay"
    assert sm.history == ["main_menu", "gameplay"]

def test_game_over_transition():
    sm = SceneManager()
    sm.switch("gameplay")
    sm.switch("game_over")
    assert sm.current == "game_over"
```

---

## Project Layout for Testable Pygame Games

```
my_game/
├── src/
│   ├── __init__.py
│   ├── main.py          # entry point — pygame.init(), game loop
│   ├── player.py         # Player class (logic + draw)
│   ├── enemies.py        # Enemy classes
│   ├── input_state.py    # Input abstraction
│   ├── sound_manager.py  # Audio wrapper
│   └── scenes/
│       ├── menu.py
│       └── gameplay.py
├── tests/
│   ├── conftest.py       # Headless Pygame fixtures
│   ├── test_player.py
│   ├── test_enemies.py
│   ├── test_collisions.py
│   ├── test_scenes.py
│   └── test_input.py
├── assets/
│   ├── images/
│   └── sounds/
├── pyproject.toml        # pytest config, dependencies
└── README.md
```

### pyproject.toml test configuration

```toml
[tool.pytest.ini_options]
testpaths = ["tests"]
filterwarnings = ["ignore::DeprecationWarning"]
markers = [
    "slow: marks tests that take >1s (deselect with '-m not slow')",
    "visual: marks tests requiring a real display (skip in CI)",
]
```

---

## pygame-ce (Community Edition) Notes

pygame-ce is a drop-in replacement with extra features and better performance. Testing differences are minimal, but note these pygame-ce specifics:

- pygame-ce supports `pygame.SCALED` flag, which works under the dummy driver but may produce different surface sizes than classic Pygame.
- pygame-ce adds `pygame.Window` — test window management via its API rather than `pygame.display`.
- pygame-ce ships with type stubs, improving IDE support during test writing.

Both versions support `SDL_VIDEODRIVER=dummy` for headless testing.

---

## CI Configuration Example (GitHub Actions)

```yaml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
      - run: pip install pygame-ce pytest
      - run: |
          export SDL_VIDEODRIVER=dummy
          export SDL_AUDIODRIVER=dummy
          pytest tests/ -v
```

No `xvfb` or display server required when using the dummy driver.
