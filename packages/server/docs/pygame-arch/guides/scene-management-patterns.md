# Scene Management Patterns

> **Category:** guide · **Engine:** Pygame · **Related:** [../architecture/game-loop-and-state.md](../architecture/game-loop-and-state.md), [input-and-events.md](input-and-events.md), [../pygame-arch-rules.md](../pygame-arch-rules.md)

How to organise a Pygame project into clean, swappable scenes (menu, gameplay, pause, game-over) using a state machine — from a minimal approach for jam games to a stack-based system for production projects.

---

## Why Scenes?

Without scene management every game quickly devolves into a tangle of `if current_state == "menu"` checks scattered through a single loop. Separating each screen into its own object means:

- Each scene owns its update, draw, and event logic — no cross-contamination.
- Adding a new screen (settings, credits, cutscene) doesn't touch existing code.
- Pause overlays and transitions become straightforward.

---

## Pattern 1: Simple Scene Switcher

The lightest approach — a single `current_scene` reference that the main loop delegates to. Good for game jams and small projects.

### Scene Base Class

```python
import pygame

class Scene:
    """Base class — every scene implements these three methods."""

    def __init__(self, manager):
        self.manager = manager  # back-reference for scene transitions

    def handle_events(self, events: list[pygame.event.Event]):
        ...

    def update(self, dt: float):
        ...

    def draw(self, screen: pygame.Surface):
        ...
```

### Scene Manager

```python
class SceneManager:
    def __init__(self, first_scene_class):
        self.screen = pygame.display.get_surface()
        self.clock = pygame.time.Clock()
        self.running = True
        self.scene = first_scene_class(self)

    def switch(self, new_scene_class, **kwargs):
        """Replace the current scene entirely."""
        self.scene = new_scene_class(self, **kwargs)

    def run(self):
        while self.running:
            dt = self.clock.tick(60) / 1000.0
            events = pygame.event.get()
            for event in events:
                if event.type == pygame.QUIT:
                    self.running = False
            self.scene.handle_events(events)
            self.scene.update(dt)
            self.scene.draw(self.screen)
            pygame.display.flip()
```

### Example Scenes

```python
class MenuScene(Scene):
    def handle_events(self, events):
        for event in events:
            if event.type == pygame.KEYDOWN and event.key == pygame.K_RETURN:
                self.manager.switch(GameScene)

    def draw(self, screen):
        screen.fill((20, 20, 40))
        font = pygame.font.SysFont(None, 48)
        text = font.render("Press ENTER to Play", True, (255, 255, 255))
        screen.blit(text, text.get_rect(center=screen.get_rect().center))


class GameScene(Scene):
    def __init__(self, manager):
        super().__init__(manager)
        self.score = 0

    def handle_events(self, events):
        for event in events:
            if event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
                self.manager.switch(MenuScene)

    def update(self, dt):
        self.score += dt * 10  # placeholder gameplay

    def draw(self, screen):
        screen.fill((10, 40, 10))
        font = pygame.font.SysFont(None, 36)
        text = font.render(f"Score: {int(self.score)}", True, (255, 255, 255))
        screen.blit(text, (10, 10))
```

### Entry Point

```python
pygame.init()
pygame.display.set_mode((800, 600))
SceneManager(MenuScene).run()
pygame.quit()
```

**Trade-offs:** Simple to understand, but `switch()` destroys the old scene — you can't return to it without rebuilding. No support for overlay scenes (pause screens on top of gameplay).

---

## Pattern 2: Scene Stack

A stack lets you **push** a scene on top (pause overlay, dialogue box) and **pop** back to the previous one without recreating it. The scene on top of the stack receives events; lower scenes optionally continue drawing underneath.

### Stack Manager

```python
class StackManager:
    def __init__(self, first_scene_class):
        self.screen = pygame.display.get_surface()
        self.clock = pygame.time.Clock()
        self.running = True
        self.stack: list[Scene] = [first_scene_class(self)]

    @property
    def current(self) -> Scene:
        return self.stack[-1]

    def push(self, scene_class, **kwargs):
        """Push a new scene on top — the previous scene stays alive underneath."""
        self.stack.append(scene_class(self, **kwargs))

    def pop(self):
        """Remove the top scene and return to the one below."""
        if len(self.stack) > 1:
            self.stack.pop()

    def switch(self, scene_class, **kwargs):
        """Replace the top scene (pop + push)."""
        self.stack.pop()
        self.stack.append(scene_class(self, **kwargs))

    def run(self):
        while self.running and self.stack:
            dt = self.clock.tick(60) / 1000.0
            events = pygame.event.get()
            for event in events:
                if event.type == pygame.QUIT:
                    self.running = False

            # Only the top scene gets events and updates
            self.current.handle_events(events)
            self.current.update(dt)

            # Draw from bottom to top so overlays render on top of gameplay
            for scene in self.stack:
                scene.draw(self.screen)

            pygame.display.flip()
```

### Pause Overlay

```python
class PauseScene(Scene):
    """Semi-transparent overlay — gameplay scene still draws underneath."""

    def handle_events(self, events):
        for event in events:
            if event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
                self.manager.pop()  # unpause

    def update(self, dt):
        pass  # gameplay is frozen while paused

    def draw(self, screen):
        # Dim overlay
        overlay = pygame.Surface(screen.get_size(), pygame.SRCALPHA)
        overlay.fill((0, 0, 0, 128))
        screen.blit(overlay, (0, 0))
        # Pause text
        font = pygame.font.SysFont(None, 64)
        text = font.render("PAUSED", True, (255, 255, 255))
        screen.blit(text, text.get_rect(center=screen.get_rect().center))
```

In the `GameScene`, pressing Escape pushes the pause overlay:

```python
def handle_events(self, events):
    for event in events:
        if event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
            self.manager.push(PauseScene)
```

---

## Pattern 3: Enum-Based States (Lightweight)

For very small games where full classes feel like overkill, an enum keeps things tidy:

```python
from enum import Enum, auto

class State(Enum):
    MENU = auto()
    PLAYING = auto()
    GAME_OVER = auto()

state = State.MENU

while running:
    dt = clock.tick(60) / 1000.0
    events = pygame.event.get()

    if state == State.MENU:
        for event in events:
            if event.type == pygame.KEYDOWN and event.key == pygame.K_RETURN:
                state = State.PLAYING
                score = 0
        screen.fill((20, 20, 40))
        # draw menu ...

    elif state == State.PLAYING:
        score += dt * 10
        for event in events:
            if event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
                state = State.GAME_OVER
        screen.fill((10, 40, 10))
        # draw gameplay ...

    elif state == State.GAME_OVER:
        for event in events:
            if event.type == pygame.KEYDOWN:
                state = State.MENU
        screen.fill((40, 10, 10))
        # draw game over ...

    pygame.display.flip()
```

**Trade-offs:** Fine for 2–3 states. Becomes a maintenance nightmare past that — the single loop grows linearly with every state.

---

## Scene Transitions

Smooth transitions between scenes make the game feel polished. The simplest approach: a dedicated `TransitionScene` that fades between the outgoing and incoming scenes.

```python
class FadeTransition(Scene):
    def __init__(self, manager, from_surface, to_scene_class, duration=0.5):
        super().__init__(manager)
        self.from_surface = from_surface.copy()
        self.to_scene_class = to_scene_class
        self.duration = duration
        self.timer = 0.0

    def update(self, dt):
        self.timer += dt
        if self.timer >= self.duration:
            self.manager.switch(self.to_scene_class)

    def draw(self, screen):
        alpha = min(255, int(255 * self.timer / self.duration))
        screen.blit(self.from_surface, (0, 0))
        overlay = pygame.Surface(screen.get_size())
        overlay.fill((0, 0, 0))
        overlay.set_alpha(alpha)
        screen.blit(overlay, (0, 0))
```

Usage: capture the current screen before switching:

```python
def go_to_game(self):
    snapshot = self.manager.screen.copy()
    self.manager.switch(FadeTransition, from_surface=snapshot, to_scene_class=GameScene)
```

---

## Passing Data Between Scenes

Scenes often need shared state — a player's inventory, a level number, settings. Options from simplest to most structured:

1. **Constructor kwargs** — pass data when switching: `manager.switch(GameScene, level=3)`
2. **Shared context dict** — store a `manager.context` dict that all scenes can read/write.
3. **Dedicated game-state object** — a `GameState` dataclass passed to every scene constructor.

```python
from dataclasses import dataclass, field

@dataclass
class GameState:
    level: int = 1
    score: int = 0
    lives: int = 3
    inventory: list = field(default_factory=list)

# In SceneManager.__init__:
self.game_state = GameState()

# In any scene:
self.manager.game_state.score += 100
```

---

## pygame-ce Differences

The scene management pattern is pure Python and works identically on pygame and pygame-ce. However, pygame-ce's `Window` class (replacing `pygame.display`) gives you direct access to vsync and renderer settings, which can affect your `clock.tick()` strategy:

```python
# pygame-ce: vsync-aware timing
window = pygame.Window("My Game", (800, 600), vsync=True)
# With vsync on, clock.tick() still caps framerate but the display
# flip synchronises to the monitor refresh — smoother transitions.
```

---

## Which Pattern to Choose

| Project Size | Pattern | Why |
|---|---|---|
| Game jam / prototype | Enum-based | Minimal code, fast to set up |
| Small-to-medium game (3–8 screens) | Simple scene switcher | Clean separation without complexity |
| Production game with overlays, dialogue, pause | Scene stack | Push/pop preserves state; overlays draw naturally |
