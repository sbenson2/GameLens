# Entity Component System (ECS) Patterns

> **Category:** reference · **Engine:** Pygame · **Related:** [../guides/sprites-and-collision.md](../guides/sprites-and-collision.md), [../architecture/game-loop-and-state.md](../architecture/game-loop-and-state.md), [../guides/scene-management-patterns.md](../guides/scene-management-patterns.md)

How to structure Pygame games using the Entity Component System pattern — covering when ECS is the right choice, a minimal hand-rolled implementation, integration with the Esper library, and bridging ECS with Pygame's sprite groups.

---

## Why ECS in Pygame?

Pygame's default architecture is class-based: you subclass `pygame.sprite.Sprite`, give it `update()` and `draw()` methods, and add it to groups. This works well for small-to-medium games, but runs into problems as complexity grows:

- **Deep inheritance trees.** A `FlyingEnemyThatShootsAndHasShield` class tries to inherit from too many parents.
- **Behaviour duplication.** Two unrelated entities (a player and a moving platform) both need physics, leading to copy-paste or awkward mixins.
- **Hard to add/remove behaviour at runtime.** Giving an entity a temporary "poisoned" state means adding flags and conditionals rather than composing data.

ECS solves this with **composition over inheritance:** entities are just IDs, components are plain data, and systems contain the logic. You can add `Poisoned(duration=5)` to any entity without touching its class.

### When to Use ECS

**Good fit:** Games with many entity types sharing overlapping behaviours (RPGs, simulation, RTS, sandbox). Especially valuable when entities gain/lose abilities at runtime.

**Overkill:** Simple games with few entity types (a single-screen puzzle, a visual novel menu). Stick with Sprite subclasses there.

---

## Minimal Hand-Rolled ECS

No libraries needed. This fits in ~60 lines and is enough for a game jam.

### Components: Plain Data

```python
from dataclasses import dataclass

@dataclass
class Position:
    x: float = 0.0
    y: float = 0.0

@dataclass
class Velocity:
    dx: float = 0.0
    dy: float = 0.0

@dataclass
class Renderable:
    """Visual representation."""
    surface: object = None   # pygame.Surface
    layer: int = 0

@dataclass
class Health:
    current: int = 100
    maximum: int = 100

@dataclass
class Collider:
    width: int = 32
    height: int = 32

@dataclass
class PlayerControlled:
    """Tag component — no data, just marks the entity."""
    pass
```

Components are **data only** — no methods beyond what `@dataclass` gives you.

### World: Entity Storage

```python
class World:
    def __init__(self):
        self._next_id = 0
        self._components = {}   # {ComponentType: {entity_id: component}}
        self._systems = []      # [(priority, system_fn)]

    def create_entity(self, *components):
        eid = self._next_id
        self._next_id += 1
        for comp in components:
            ctype = type(comp)
            if ctype not in self._components:
                self._components[ctype] = {}
            self._components[ctype][eid] = comp
        return eid

    def remove_entity(self, eid):
        for store in self._components.values():
            store.pop(eid, None)

    def add_component(self, eid, component):
        ctype = type(component)
        if ctype not in self._components:
            self._components[ctype] = {}
        self._components[ctype][eid] = component

    def remove_component(self, eid, ctype):
        if ctype in self._components:
            self._components[ctype].pop(eid, None)

    def get_component(self, eid, ctype):
        return self._components.get(ctype, {}).get(eid)

    def has_component(self, eid, ctype):
        return eid in self._components.get(ctype, {})

    def query(self, *ctypes):
        """Yield (entity_id, comp1, comp2, ...) for entities with ALL requested types."""
        if not ctypes:
            return
        # Start with the smallest set for efficiency
        stores = [(self._components.get(ct, {})) for ct in ctypes]
        smallest = min(stores, key=len)
        for eid in smallest:
            if all(eid in s for s in stores):
                yield (eid, *(s[eid] for s in stores))

    def add_system(self, system_fn, priority=0):
        """Register a system function. Higher priority runs first."""
        self._systems.append((priority, system_fn))
        self._systems.sort(key=lambda x: -x[0])

    def process(self, dt):
        for _, system_fn in self._systems:
            system_fn(self, dt)
```

**Key design choice:** Systems are plain functions `(world, dt) -> None`, not classes. This keeps them simple and avoids yet another class hierarchy.

### Systems: Logic

```python
def movement_system(world, dt):
    for eid, pos, vel in world.query(Position, Velocity):
        pos.x += vel.dx * dt
        pos.y += vel.dy * dt

def player_input_system(world, dt):
    keys = pygame.key.get_pressed()
    speed = 200
    for eid, vel, _ in world.query(Velocity, PlayerControlled):
        vel.dx = (keys[pygame.K_RIGHT] - keys[pygame.K_LEFT]) * speed
        vel.dy = (keys[pygame.K_DOWN] - keys[pygame.K_UP]) * speed

def render_system(world, dt):
    screen = pygame.display.get_surface()
    # Collect and sort by layer
    renderables = []
    for eid, pos, rend in world.query(Position, Renderable):
        renderables.append((rend.layer, rend.surface, pos.x, pos.y))
    renderables.sort(key=lambda r: r[0])
    for _, surf, x, y in renderables:
        screen.blit(surf, (x, y))

def collision_system(world, dt):
    entities = list(world.query(Position, Collider, Health))
    for i, (eid_a, pos_a, col_a, hp_a) in enumerate(entities):
        rect_a = pygame.Rect(pos_a.x, pos_a.y, col_a.width, col_a.height)
        for eid_b, pos_b, col_b, hp_b in entities[i+1:]:
            rect_b = pygame.Rect(pos_b.x, pos_b.y, col_b.width, col_b.height)
            if rect_a.colliderect(rect_b):
                # Handle collision — e.g., damage both
                hp_a.current -= 10
                hp_b.current -= 10

def cleanup_system(world, dt):
    """Remove dead entities."""
    dead = [eid for eid, hp in world.query(Health) if hp.current <= 0]
    for eid in dead:
        world.remove_entity(eid)
```

### Wiring It All Together

```python
def main():
    pygame.init()
    screen = pygame.display.set_mode((800, 600))
    clock = pygame.time.Clock()

    world = World()

    # Register systems (higher priority = runs first)
    world.add_system(player_input_system, priority=10)
    world.add_system(movement_system, priority=5)
    world.add_system(collision_system, priority=3)
    world.add_system(cleanup_system, priority=2)
    world.add_system(render_system, priority=0)

    # Create player
    player_img = pygame.Surface((32, 32))
    player_img.fill((0, 200, 100))
    world.create_entity(
        Position(400, 300),
        Velocity(),
        Renderable(surface=player_img, layer=1),
        Health(100, 100),
        Collider(32, 32),
        PlayerControlled(),
    )

    # Create some enemies
    enemy_img = pygame.Surface((24, 24))
    enemy_img.fill((200, 50, 50))
    for i in range(5):
        world.create_entity(
            Position(100 + i * 120, 100),
            Velocity(dx=30, dy=0),
            Renderable(surface=enemy_img, layer=1),
            Health(50, 50),
            Collider(24, 24),
        )

    running = True
    while running:
        dt = clock.tick(60) / 1000.0
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False

        screen.fill((20, 20, 30))
        world.process(dt)
        pygame.display.flip()

    pygame.quit()
```

---

## Using Esper (Popular ECS Library)

[Esper](https://github.com/benmoran56/esper) is a mature, pure-Python ECS with no dependencies. It handles entity/component storage, system scheduling, and multi-world contexts.

### Installation

```bash
pip install esper
```

### Esper v3.x API (Breaking Change from v2)

Esper v3 removed the `World` class. All operations are now **module-level functions**:

```python
import esper
from dataclasses import dataclass

@dataclass
class Position:
    x: float = 0.0
    y: float = 0.0

@dataclass
class Velocity:
    dx: float = 0.0
    dy: float = 0.0

# Create entities
player = esper.create_entity(Position(400, 300), Velocity(0, 0))
enemy = esper.create_entity(Position(100, 100), Velocity(30, 0))

# Query
for ent, (vel, pos) in esper.get_components(Velocity, Position):
    pos.x += vel.dx
    pos.y += vel.dy

# Check / modify
if esper.has_component(player, Velocity):
    vel = esper.component_for_entity(player, Velocity)
    vel.dx = 100

# Remove
esper.remove_component(enemy, Velocity)
esper.delete_entity(enemy)
```

### Esper Processors (Systems)

```python
class MovementProcessor(esper.Processor):
    def process(self, dt):
        for ent, (vel, pos) in esper.get_components(Velocity, Position):
            pos.x += vel.dx * dt
            pos.y += vel.dy * dt

class RenderProcessor(esper.Processor):
    def __init__(self, screen):
        self.screen = screen

    def process(self, dt):
        for ent, (pos, rend) in esper.get_components(Position, Renderable):
            self.screen.blit(rend.surface, (pos.x, pos.y))

# Register — higher priority runs first
esper.add_processor(MovementProcessor(), priority=5)
esper.add_processor(RenderProcessor(screen), priority=0)

# In game loop:
esper.process(dt)
```

### Esper World Contexts

Useful for separate game states (menu vs gameplay vs cutscene):

```python
esper.switch_world("gameplay")
# ... create entities, add processors ...

esper.switch_world("menu")
# ... different entities and processors ...

esper.switch_world("gameplay")  # switch back — state is preserved
```

### Esper Events

```python
def on_enemy_death(entity_id, position):
    # Spawn particles, play sound, etc.
    pass

esper.set_handler("enemy_death", on_enemy_death)

# In a system:
esper.dispatch_event("enemy_death", entity_id=eid, position=pos)
```

Handlers are stored as **weak references** — they auto-remove when the owning object is garbage collected.

---

## Bridging ECS and Pygame Sprite Groups

You don't have to choose one or the other. A common hybrid pattern uses ECS for logic and Pygame groups for rendering:

```python
class SpriteComponent:
    """Component that wraps a pygame Sprite for group-based rendering."""
    def __init__(self, sprite):
        self.sprite = sprite

class SpriteRenderSystem:
    """Syncs ECS Position → Sprite rect, then lets Pygame groups handle draw."""
    def __init__(self, group):
        self.group = group

    def process(self, world, dt):
        for eid, pos, sc in world.query(Position, SpriteComponent):
            sc.sprite.rect.topleft = (int(pos.x), int(pos.y))
        # Drawing handled by: self.group.draw(screen) in the main loop
```

This gives you ECS composition for logic while keeping Pygame's optimised `LayeredUpdates.draw()` for rendering.

---

## Performance Notes

| Approach | Entities | Notes |
|----------|----------|-------|
| Hand-rolled (dict-based) | < 500 | Simple, no dependencies, easy to debug |
| Esper | < 2 000 | Optimised iteration, solid for most 2D games |
| Esper + PyPy | < 10 000 | PyPy's JIT dramatically speeds pure-Python ECS |
| Cython/C extension ECS | 10 000+ | Beyond pure Python — consider `ecys` or a custom C module |

For most Pygame games, **500–2 000 entities is plenty.** A typical action platformer has 50–200 active entities. ECS overhead only matters at scale.

### Query Optimisation

The `query()` method iterates the smallest component store first, then checks membership in the others. If you have 1 000 entities with `Position` but only 5 with `PlayerControlled`, querying `(PlayerControlled, Position)` is fast because it starts from the 5-element set.

---

## When to Avoid ECS

- **Prototyping / game jams:** The overhead of designing components up-front slows rapid iteration. Start with Sprite subclasses and refactor to ECS if inheritance gets painful.
- **Very few entity types:** If your game has a player, bullets, and one enemy type, Sprite classes are simpler and equally maintainable.
- **Heavy use of Pygame group features:** `GroupSingle`, `LayeredDirty`, and collision group functions (`spritecollide`, `groupcollide`) work directly on Sprites. Going full ECS means re-implementing or bridging these features.
