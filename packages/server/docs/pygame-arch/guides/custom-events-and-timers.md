# Custom Events, Timers, and Inter-Object Communication

> **Category:** guide · **Engine:** Pygame · **Related:** [input-and-events.md](input-and-events.md), [architecture/game-loop-and-state.md](../architecture/game-loop-and-state.md), [scene-management-patterns.md](scene-management-patterns.md)

Pygame's event queue isn't just for keyboard and mouse input — it's a powerful messaging bus you can use for timers, inter-system communication, and decoupled game logic. This guide covers custom event types, timed events, event filtering, and patterns for keeping game systems loosely coupled.

---

## Defining Custom Event Types

### The Modern Way: `custom_type()`

`pygame.event.custom_type()` allocates a unique event ID from the user-event range. Use this instead of manually calculating offsets from `USEREVENT` — it prevents ID collisions across modules.

```python
import pygame

# Each call returns the next available ID
ENEMY_SPAWNED = pygame.event.custom_type()
WAVE_COMPLETE = pygame.event.custom_type()
POWERUP_EXPIRED = pygame.event.custom_type()
DAMAGE_DEALT = pygame.event.custom_type()
```

**Why not `USEREVENT + N`?** The manual approach (`USEREVENT + 1`, `USEREVENT + 2`, ...) works in small projects but breaks when you merge code from multiple modules that each define their own offsets. `custom_type()` is the safe default — it was added in pygame 2.0 and is available in pygame-ce as well.

### Organizing Event Constants

For larger projects, group event types in a dedicated module:

```python
# events.py — single source of truth for custom event IDs
import pygame

class GameEvents:
    ENEMY_SPAWNED = pygame.event.custom_type()
    ENEMY_DIED = pygame.event.custom_type()
    WAVE_COMPLETE = pygame.event.custom_type()
    PLAYER_HIT = pygame.event.custom_type()
    POWERUP_COLLECTED = pygame.event.custom_type()
    POWERUP_EXPIRED = pygame.event.custom_type()
    SCORE_CHANGED = pygame.event.custom_type()
    SCENE_TRANSITION = pygame.event.custom_type()
```

Import from anywhere: `from events import GameEvents`.

---

## Posting Events

### Immediate Events with `event.post()`

Any system can push an event onto the queue for other systems to consume the same frame (or the next, depending on processing order):

```python
def on_enemy_killed(self, enemy):
    # Notify other systems that an enemy died
    event = pygame.event.Event(
        GameEvents.ENEMY_DIED,
        enemy_type=enemy.type,
        position=enemy.rect.center,
        score_value=enemy.points,
    )
    pygame.event.post(event)
```

**Attaching data:** The `Event` constructor accepts arbitrary keyword arguments. These become attributes on the event object, accessible as `event.enemy_type`, `event.position`, etc.

```python
# Consuming the event elsewhere
for event in pygame.event.get():
    if event.type == GameEvents.ENEMY_DIED:
        self.score += event.score_value
        self.spawn_particles(event.position)
```

`post()` returns `True` if the event was queued, `False` if the event type is currently blocked. Check the return value when correctness matters.

### Timed / Repeating Events with `set_timer()`

`pygame.time.set_timer()` fires an event at regular intervals — perfect for spawn waves, countdowns, periodic effects, or ambient triggers.

```python
# Fire ENEMY_SPAWNED every 2 seconds, indefinitely
pygame.time.set_timer(GameEvents.ENEMY_SPAWNED, 2000)

# Fire 5 times then stop (loops parameter — pygame 2.0.0.dev3+)
pygame.time.set_timer(GameEvents.ENEMY_SPAWNED, 2000, loops=5)

# Cancel the timer
pygame.time.set_timer(GameEvents.ENEMY_SPAWNED, 0)
```

**Rules to remember:**
- Only **one timer per event type** exists at a time. Setting a new interval replaces the old one.
- The first event fires *after* the delay, not immediately.
- Call `set_timer` with `millis=0` to cancel.
- Set timers **outside** the game loop (usually during scene setup), not every frame.

### Timer Pattern: Difficulty Ramp

```python
class WaveManager:
    def __init__(self):
        self.wave = 0
        self.base_interval = 3000  # ms between spawns
        self._start_spawning()

    def _start_spawning(self):
        # Spawn faster as waves progress — minimum 500ms
        interval = max(500, self.base_interval - self.wave * 200)
        pygame.time.set_timer(GameEvents.ENEMY_SPAWNED, interval)

    def handle_event(self, event):
        if event.type == GameEvents.WAVE_COMPLETE:
            self.wave += 1
            self._start_spawning()  # re-arms timer with shorter interval
```

---

## Event Filtering for Performance

In a busy game, the event queue accumulates mouse motion, joystick axis, and other high-frequency events you may not need. Filtering reduces per-frame work.

### Blocking Unwanted Events

```python
# Block events you never use — they won't enter the queue at all
pygame.event.set_blocked([
    pygame.JOYAXISMOTION,
    pygame.JOYBALLMOTION,
    pygame.JOYHATMOTION,
])
```

### Allow-List Approach

```python
# Only allow specific event types (stricter, better for performance)
pygame.event.set_allowed(None)  # block everything first
pygame.event.set_allowed([
    pygame.QUIT,
    pygame.KEYDOWN,
    pygame.KEYUP,
    pygame.MOUSEBUTTONDOWN,
    GameEvents.ENEMY_SPAWNED,
    GameEvents.ENEMY_DIED,
    GameEvents.WAVE_COMPLETE,
])
```

### Selective `get()` Calls

Even without blocking, you can pull only specific types:

```python
# Process only custom game events — input handled elsewhere
for event in pygame.event.get(eventtype=[
    GameEvents.ENEMY_SPAWNED,
    GameEvents.ENEMY_DIED,
    GameEvents.POWERUP_EXPIRED,
]):
    game_world.handle_event(event)
```

This leaves other events (keyboard, mouse, etc.) on the queue for a separate input handler to consume.

---

## Architecture: Event Bus Pattern

For medium-to-large Pygame projects, a centralized event dispatcher keeps systems decoupled. Systems register interest in specific event types and get callbacks — no direct references between systems.

```python
class EventBus:
    """Lightweight pub/sub on top of pygame's event queue."""

    def __init__(self):
        self._listeners: dict[int, list[callable]] = {}

    def subscribe(self, event_type: int, callback: callable):
        self._listeners.setdefault(event_type, []).append(callback)

    def unsubscribe(self, event_type: int, callback: callable):
        if event_type in self._listeners:
            self._listeners[event_type].remove(callback)

    def dispatch(self, event: pygame.event.Event):
        for callback in self._listeners.get(event.type, []):
            callback(event)

    def process_queue(self):
        """Call once per frame after pygame.event.get()."""
        for event in pygame.event.get():
            self.dispatch(event)
```

Usage:

```python
bus = EventBus()

# Systems subscribe to what they care about
bus.subscribe(GameEvents.ENEMY_DIED, score_system.on_enemy_died)
bus.subscribe(GameEvents.ENEMY_DIED, particle_system.on_enemy_died)
bus.subscribe(GameEvents.ENEMY_DIED, audio_system.on_enemy_died)

# Main loop
while running:
    bus.process_queue()
    # ...update, draw...
```

Now killing an enemy triggers score, particles, *and* a sound effect — without the enemy knowing those systems exist.

---

## pygame-ce Differences

pygame-ce (community edition, installable as `pygame-ce`) extends the event system with Python-native features:

**Subclass-based events (proposed/in-progress):** pygame-ce is working toward letting you define event types as Python classes with type hints and pattern matching support:

```python
# pygame-ce style (when available)
match event:
    case pygame.event.MouseButtonDown(button=1, pos=(x, y)):
        handle_click(x, y)
    case pygame.event.KeyDown(key=pygame.K_ESCAPE):
        quit_game()
```

For now, both pygame and pygame-ce share the same `custom_type()` / `Event()` / `post()` API. The pattern-matching syntax is a forward-looking feature — check your pygame-ce version's changelog before relying on it.

---

## Common Pitfalls

**Forgetting to pump/get events.** If you don't call `pygame.event.get()` or `pygame.event.pump()` every frame, the queue fills up and the OS may flag your window as unresponsive. Always drain the queue, even in loading screens.

**Timer events after scene transitions.** If you set a timer in Scene A and switch to Scene B, the timer keeps firing. Always cancel timers (`set_timer(event_type, 0)`) during scene teardown.

**Posting events during event processing.** Events posted with `event.post()` during a `for event in pygame.event.get()` loop won't appear until the next frame's `get()` call. This is usually fine — just be aware of the one-frame delay.

**Blocking custom events accidentally.** If you use `set_allowed(None)` (block all) and then allow only built-in types, your custom events get silently dropped. Always include your custom types in the allow list.
