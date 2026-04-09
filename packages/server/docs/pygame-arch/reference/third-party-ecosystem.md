# Third-Party Ecosystem Reference

> **Category:** reference · **Engine:** Pygame · **Related:** [surfaces-and-drawing](surfaces-and-drawing.md), [ecs-patterns](ecs-patterns.md), [distribution-and-packaging](distribution-and-packaging.md)

Pygame's core library handles display, input, audio, and basic drawing — but the ecosystem of third-party packages fills gaps in physics, tilemaps, UI, networking, and more. This guide covers the most reliable, actively-maintained libraries that pair well with Pygame and pygame-ce.

---

## Physics: pymunk

[pymunk](https://www.pymunk.org/) wraps the Chipmunk2D physics engine in a Pythonic API. It handles rigid-body dynamics, collision detection, constraints, and joints — everything you need for physics-driven gameplay without writing your own broadphase.

```python
import pymunk

# Create a physics space with gravity
space = pymunk.Space()
space.gravity = (0, 900)  # pixels/sec², downward

# Static ground segment
ground_body = pymunk.Body(body_type=pymunk.Body.STATIC)
ground_shape = pymunk.Segment(ground_body, (0, 580), (800, 580), 5)
ground_shape.friction = 0.8
space.add(ground_body, ground_shape)

# Dynamic circle (a ball)
mass = 1
radius = 20
moment = pymunk.moment_for_circle(mass, 0, radius)
ball_body = pymunk.Body(mass, moment)
ball_body.position = (400, 100)
ball_shape = pymunk.Circle(ball_body, radius)
ball_shape.elasticity = 0.7
ball_shape.friction = 0.5
space.add(ball_body, ball_shape)
```

### Integration with Pygame

pymunk objects don't draw themselves. You step the simulation, then draw based on body positions:

```python
# In your game loop
dt = clock.tick(60) / 1000.0
space.step(dt)

# Draw the ball
pos = int(ball_body.position.x), int(ball_body.position.y)
pygame.draw.circle(screen, (255, 100, 100), pos, radius)
```

**When to use:** Platformers with slopes, ragdolls, physics puzzles, pinball, anything where you need real collision response beyond AABB overlap.

---

## Tilemaps: pytmx + pyscroll

[pytmx](https://github.com/bitcraft/pytmx) loads Tiled (`.tmx`) map files. [pyscroll](https://github.com/bitcraft/pyscroll) renders those maps with smooth scrolling and automatic camera management.

```python
import pytmx
import pyscroll

# Load a Tiled map
tmx_data = pytmx.load_pygame("level1.tmx")

# Create a scrolling map renderer
map_layer = pyscroll.BufferedRenderer(
    pyscroll.TiledMapData(tmx_data),
    screen.get_size()
)
map_group = pyscroll.PyscrollGroup(
    map_layer=map_layer,
    default_layer=2
)

# Add your player sprite to the group
map_group.add(player)
```

### Rendering and Camera

```python
# In your game loop — the group scrolls to center on a target
map_group.center(player.rect.center)
map_group.draw(screen)
```

**Why pytmx + pyscroll:** Tiled is a mature, free editor. pytmx gives you tile properties, object layers, and animated tiles. pyscroll handles the dirty-rect optimization and buffered rendering so you don't manually blit thousands of tiles per frame.

---

## UI: pygame_gui

[pygame_gui](https://pygame-gui.readthedocs.io/) provides themed, event-driven UI widgets: buttons, text input, dropdowns, sliders, text boxes, file dialogs, and more. It uses JSON themes for styling.

```python
import pygame_gui

manager = pygame_gui.UIManager((800, 600), "theme.json")

# Create a button
hello_button = pygame_gui.elements.UIButton(
    relative_rect=pygame.Rect(350, 275, 100, 50),
    text="Click me",
    manager=manager
)

# In your event loop
for event in pygame.event.get():
    manager.process_events(event)

    if event.type == pygame_gui.UI_BUTTON_PRESSED:
        if event.ui_element == hello_button:
            print("Button was clicked!")

# In your update/draw
manager.update(dt)
manager.draw_ui(screen)
```

**When to use:** Menus, settings screens, level editors, debug panels, inventory UIs — anywhere you need standard widgets without building them from scratch.

---

## ECS: esper

[esper](https://github.com/benmoran56/esper) is a lightweight Entity Component System for Python. Components are plain data; Processors contain logic. Entities are just integer IDs.

```python
import esper

# Define components as simple data holders
class Position:
    def __init__(self, x=0.0, y=0.0):
        self.x = x
        self.y = y

class Velocity:
    def __init__(self, dx=0.0, dy=0.0):
        self.dx = dx
        self.dy = dy

class Renderable:
    def __init__(self, image):
        self.image = image

# Create a processor (system)
class MovementProcessor(esper.Processor):
    def process(self, dt):
        for ent, (pos, vel) in self.world.get_components(Position, Velocity):
            pos.x += vel.dx * dt
            pos.y += vel.dy * dt

# Wire it up
world = esper.World()
world.add_processor(MovementProcessor())

# Create an entity
player = world.create_entity(
    Position(100, 200),
    Velocity(60, 0),
    Renderable(player_image)
)

# In your game loop
world.process(dt)
```

**When to use:** Games with many entity types that share behavior mix-and-match (enemies, projectiles, pickups). ECS avoids deep inheritance hierarchies and makes it easy to add/remove behaviors at runtime.

---

## Networking: pygame.net Alternatives

Pygame has no built-in networking. Common approaches:

| Library | Best For | Notes |
|---------|----------|-------|
| **socket** (stdlib) | Simple TCP/UDP | Low-level, manual serialization |
| **asyncio** (stdlib) | Async networking | Good with `pygame.event.post()` bridge |
| **PodSixNet** | Turn-based/lobby games | Built on asyncore, thin pygame wrapper |
| **Twisted** | Complex server architecture | Heavy but battle-tested |

For most indie games, raw UDP with `struct.pack` for serialization is sufficient. Use `pygame.event.post()` to feed network messages into the event loop without blocking.

---

## Other Notable Libraries

| Library | Purpose | Install |
|---------|---------|---------|
| **pygame-menu** | Polished menu system with themes | `pip install pygame-menu` |
| **Thorpy** | Full GUI toolkit with auto-layout | `pip install thorpy` |
| **noise** | Perlin/simplex noise for procgen | `pip install noise` |
| **Pillow** | Image manipulation beyond pygame.image | `pip install Pillow` |
| **numpy** | Fast pixel/array operations on surfaces | `pip install numpy` |
| **moderngl** | OpenGL rendering alongside pygame | `pip install moderngl` |

### numpy + Surfaces

numpy can manipulate surface pixel data directly, which is dramatically faster than per-pixel Python loops:

```python
import numpy as np

# Get a 3D array view of a surface's pixel data
arr = pygame.surfarray.pixels3d(surface)

# Tint the entire surface red (fast, in C)
arr[:, :, 0] = np.minimum(arr[:, :, 0] + 50, 255)

# Delete the reference to unlock the surface
del arr
```

---

## pygame vs pygame-ce Compatibility

Most third-party libraries work with both `pygame` and `pygame-ce` because the API surface is nearly identical. Watch for these differences:

- **Import:** Both use `import pygame` — they're drop-in replacements. You can't have both installed simultaneously.
- **New APIs in pygame-ce:** `pygame.geometry.Circle`, `Window` class, `pygame.system` module — third-party libraries won't use these yet, but your code can.
- **Performance:** pygame-ce has optimized blitting, faster event handling, and better SDL2 coverage. Libraries that lean on `Surface.blit()` benefit automatically.
- **Bug fixes:** pygame-ce fixes bugs that upstream pygame has not addressed. If a library's workaround for a pygame bug causes issues on pygame-ce, check the library's issue tracker.

**Recommendation:** New projects should use pygame-ce. Existing projects can switch by running `pip uninstall pygame && pip install pygame-ce` — no code changes required in most cases.
