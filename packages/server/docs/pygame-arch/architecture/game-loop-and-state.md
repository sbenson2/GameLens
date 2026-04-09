# Pygame Game Loop and State Management

> **Category:** architecture · **Engine:** Pygame · **Related:** [pygame-arch-rules](../pygame-arch-rules.md), [sprite-and-collision](sprite-and-collision.md)

Pygame does not impose an application framework — you build your own game loop and state machine. This doc covers the canonical patterns used in production Pygame projects, from basic loops to scene-based architectures.

---

## The Core Game Loop

Every Pygame application follows the same fundamental structure: **init → loop (events → update → draw) → quit**.

```python
import pygame
import sys

# --- Initialization ---
pygame.init()
SCREEN_WIDTH, SCREEN_HEIGHT = 800, 600
FPS = 60

screen = pygame.display.set_mode((SCREEN_WIDTH, SCREEN_HEIGHT))
pygame.display.set_caption("My Game")
clock = pygame.time.Clock()

# --- Game Loop ---
running = True
while running:
    # 1. Compute delta time (seconds since last frame)
    dt = clock.tick(FPS) / 1000.0

    # 2. Handle events
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False

    # 3. Update game state
    update(dt)

    # 4. Draw
    screen.fill((20, 20, 30))
    draw(screen)
    pygame.display.flip()

# --- Cleanup ---
pygame.quit()
sys.exit()
```

### Why delta time matters

`clock.tick(FPS)` returns milliseconds since the last call. Dividing by 1000 gives seconds. All movement, animation timers, and cooldowns should multiply by `dt` so the game behaves identically regardless of actual frame rate.

```python
# Frame-independent movement
self.rect.x += self.velocity.x * dt
self.rect.y += self.velocity.y * dt

# Frame-independent timer
self.cooldown_timer -= dt
if self.cooldown_timer <= 0:
    self.fire()
    self.cooldown_timer = 0.5  # seconds
```

### Fixed timestep with accumulator

For physics-heavy games where deterministic simulation matters (multiplayer, replays), use a fixed timestep with an accumulator:

```python
PHYSICS_DT = 1.0 / 60.0  # fixed 60Hz physics step
accumulator = 0.0

while running:
    frame_time = clock.tick(FPS) / 1000.0
    # Clamp to prevent spiral of death on lag spikes
    frame_time = min(frame_time, 0.25)
    accumulator += frame_time

    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False

    # Run physics in fixed increments
    while accumulator >= PHYSICS_DT:
        physics_update(PHYSICS_DT)
        accumulator -= PHYSICS_DT

    # Interpolation factor for smooth rendering between physics steps
    alpha = accumulator / PHYSICS_DT
    render(screen, alpha)
    pygame.display.flip()
```

---

## State Management Patterns

### Pattern 1: Enum-Based State Machine (Simple Games)

Good for game jams and small projects with 2-4 states.

```python
from enum import Enum, auto

class GameState(Enum):
    MENU = auto()
    PLAYING = auto()
    PAUSED = auto()
    GAME_OVER = auto()

class Game:
    def __init__(self):
        self.state = GameState.MENU

    def update(self, dt):
        if self.state == GameState.MENU:
            self.update_menu(dt)
        elif self.state == GameState.PLAYING:
            self.update_playing(dt)
        elif self.state == GameState.PAUSED:
            self.update_paused(dt)
        elif self.state == GameState.GAME_OVER:
            self.update_game_over(dt)

    def draw(self, screen):
        if self.state == GameState.MENU:
            self.draw_menu(screen)
        # ... etc
```

### Pattern 2: Scene Stack (Recommended)

Scales to any number of scenes. Scenes are pushed/popped like a stack, so a pause screen can overlay the gameplay scene.

```python
class Scene:
    """Base class for all scenes."""

    def __init__(self, game):
        self.game = game  # reference back to Game for scene transitions

    def handle_event(self, event):
        """Process a single pygame event."""
        pass

    def update(self, dt):
        """Update scene logic. dt is seconds since last frame."""
        pass

    def draw(self, screen):
        """Render the scene."""
        pass

    def on_enter(self):
        """Called when this scene becomes the active (top) scene."""
        pass

    def on_exit(self):
        """Called when this scene is removed or covered by another."""
        pass


class Game:
    def __init__(self):
        pygame.init()
        self.screen = pygame.display.set_mode((800, 600))
        self.clock = pygame.time.Clock()
        self.scene_stack: list[Scene] = []
        self.running = True

    @property
    def active_scene(self) -> Scene | None:
        return self.scene_stack[-1] if self.scene_stack else None

    def push_scene(self, scene: Scene):
        if self.active_scene:
            self.active_scene.on_exit()
        self.scene_stack.append(scene)
        scene.on_enter()

    def pop_scene(self):
        if self.scene_stack:
            old = self.scene_stack.pop()
            old.on_exit()
        if self.active_scene:
            self.active_scene.on_enter()

    def replace_scene(self, scene: Scene):
        """Swap the top scene without stacking."""
        if self.scene_stack:
            self.scene_stack.pop().on_exit()
        self.scene_stack.append(scene)
        scene.on_enter()

    def run(self):
        while self.running:
            dt = self.clock.tick(60) / 1000.0
            scene = self.active_scene
            if scene is None:
                self.running = False
                break

            for event in pygame.event.get():
                if event.type == pygame.QUIT:
                    self.running = False
                else:
                    scene.handle_event(event)

            scene.update(dt)
            self.screen.fill((0, 0, 0))
            scene.draw(self.screen)
            pygame.display.flip()

        pygame.quit()
```

**Usage:**

```python
class MenuScene(Scene):
    def handle_event(self, event):
        if event.type == pygame.KEYDOWN and event.key == pygame.K_RETURN:
            self.game.replace_scene(GameplayScene(self.game))

    def draw(self, screen):
        font = pygame.font.Font(None, 48)
        text = font.render("Press ENTER to Play", True, (255, 255, 255))
        screen.blit(text, text.get_rect(center=(400, 300)))


class GameplayScene(Scene):
    def handle_event(self, event):
        if event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
            # Push pause on top — gameplay stays in the stack
            self.game.push_scene(PauseScene(self.game))

# Start the game
game = Game()
game.push_scene(MenuScene(game))
game.run()
```

---

## Input Handling

### Event-based vs Polling

Use **events** for discrete actions (jump, fire, menu select) and **polling** for continuous actions (movement).

```python
# Event-based — fires once per press
def handle_event(self, event):
    if event.type == pygame.KEYDOWN:
        if event.key == pygame.K_SPACE:
            self.player.jump()

# Polling — continuous hold
def update(self, dt):
    keys = pygame.key.get_pressed()
    if keys[pygame.K_LEFT]:
        self.player.move(-1, dt)
    if keys[pygame.K_RIGHT]:
        self.player.move(1, dt)
```

### Gamepad Support

```python
pygame.joystick.init()
joysticks = [pygame.joystick.Joystick(i) for i in range(pygame.joystick.get_count())]

# In event loop:
if event.type == pygame.JOYAXISMOTION:
    if event.axis == 0:  # left stick horizontal
        self.player.move(event.value, dt)
if event.type == pygame.JOYBUTTONDOWN:
    if event.button == 0:  # A button (Xbox layout)
        self.player.jump()
```

---

## Asset Management

Avoid loading assets multiple times. Use a centralized asset cache:

```python
class Assets:
    """Singleton-style asset cache. Load once, reference everywhere."""

    _images: dict[str, pygame.Surface] = {}
    _sounds: dict[str, pygame.mixer.Sound] = {}

    @classmethod
    def load_image(cls, name: str, path: str, alpha: bool = True) -> pygame.Surface:
        if name not in cls._images:
            img = pygame.image.load(path)
            cls._images[name] = img.convert_alpha() if alpha else img.convert()
        return cls._images[name]

    @classmethod
    def get_image(cls, name: str) -> pygame.Surface:
        return cls._images[name]

    @classmethod
    def load_sound(cls, name: str, path: str) -> pygame.mixer.Sound:
        if name not in cls._sounds:
            cls._sounds[name] = pygame.mixer.Sound(path)
        return cls._sounds[name]
```

---

## Timing and Cooldowns

Avoid `time.sleep()` or frame-counting. Use dt-based timers:

```python
class Timer:
    def __init__(self, duration: float, callback=None, repeat: bool = False):
        self.duration = duration
        self.remaining = duration
        self.callback = callback
        self.repeat = repeat
        self.finished = False

    def update(self, dt: float):
        if self.finished:
            return
        self.remaining -= dt
        if self.remaining <= 0:
            if self.callback:
                self.callback()
            if self.repeat:
                self.remaining += self.duration
            else:
                self.finished = True
```
