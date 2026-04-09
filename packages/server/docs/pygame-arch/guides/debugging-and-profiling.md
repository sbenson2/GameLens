# Debugging & Profiling Pygame Games

> **Category:** guide · **Engine:** Pygame · **Related:** [performance-and-pygame-ce](performance-and-pygame-ce.md), [game-loop-and-state](../architecture/game-loop-and-state.md)

How to find and fix performance bottlenecks, memory leaks, and logic bugs in
Pygame projects using Python's built-in profiling tools and Pygame-specific
debugging techniques.

---

## FPS Monitoring

### Built-in Clock.get_fps()

The simplest performance check. `pygame.time.Clock.get_fps()` returns the
average FPS computed over the last ten calls to `clock.tick()`. Display it on
screen during development so slowdowns are immediately visible.

```python
import pygame

pygame.init()
screen = pygame.display.set_mode((800, 600))
clock = pygame.time.Clock()
font = pygame.font.SysFont("monospace", 18)

running = True
while running:
    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False

    screen.fill((0, 0, 0))

    # Game logic and drawing here ...

    # FPS overlay — top-left corner
    fps_text = font.render(f"FPS: {clock.get_fps():.1f}", True, (0, 255, 0))
    screen.blit(fps_text, (8, 8))

    pygame.display.flip()
    clock.tick(60)
```

> **Tip:** `get_fps()` returns `0.0` until `tick()` has been called at least
> twice. Don't panic if the first frame shows zero.

### Manual Frame-Time Measurement

For finer resolution, use `time.perf_counter()` (microsecond precision) to
measure individual sections of your frame. This reveals *which part* of the
frame is slow — not just the aggregate.

```python
import time

while running:
    frame_start = time.perf_counter()

    # --- Update phase ---
    t0 = time.perf_counter()
    update_all_entities(dt)
    update_ms = (time.perf_counter() - t0) * 1000

    # --- Draw phase ---
    t0 = time.perf_counter()
    draw_all(screen)
    draw_ms = (time.perf_counter() - t0) * 1000

    # --- Flip ---
    t0 = time.perf_counter()
    pygame.display.flip()
    flip_ms = (time.perf_counter() - t0) * 1000

    frame_ms = (time.perf_counter() - frame_start) * 1000
    print(f"frame={frame_ms:.1f}ms  update={update_ms:.1f}ms  "
          f"draw={draw_ms:.1f}ms  flip={flip_ms:.1f}ms")

    clock.tick(60)
```

Log these numbers to a file or ring buffer and chart them offline to spot
periodic spikes (garbage collection, asset loads, etc.).

---

## CPU Profiling with cProfile

Python's built-in `cProfile` module shows cumulative time per function call.
It's the fastest way to discover that your collision check runs 10,000 times
per frame or that an innocent-looking helper does string formatting in a hot
loop.

### Profiling the whole game

```bash
python -m cProfile -s cumtime my_game.py 2>&1 | head -40
```

`-s cumtime` sorts by cumulative time so the most expensive call chains appear
first. Pipe through `head` because game sessions generate enormous profiles.

### Profiling a specific section

Wrap the code you care about in a `cProfile.Profile` context:

```python
import cProfile
import pstats

profiler = cProfile.Profile()
profiler.enable()

# --- Run the suspect code ---
for _ in range(600):          # Simulate ~10 seconds at 60 FPS
    game.update(dt)
    game.draw(screen)

profiler.disable()
stats = pstats.Stats(profiler)
stats.sort_stats("cumulative")
stats.print_stats(20)         # Top 20 functions
```

### Visualizing with snakeviz

`snakeviz` renders cProfile output as an interactive sunburst chart in the
browser — much easier to navigate than the text table.

```bash
pip install snakeviz
python -m cProfile -o profile.prof my_game.py
snakeviz profile.prof
```

> **Note:** cProfile adds overhead (~10–30% slower), so absolute times are
> inflated. Focus on *relative* percentages, not raw milliseconds.

---

## Line-Level Profiling with line_profiler

When cProfile points you to a function but you need to know *which line* is
slow, use `line_profiler`. Decorate the function with `@profile`, then run
with `kernprof`.

```bash
pip install line_profiler
```

```python
# my_game.py
@profile                        # line_profiler recognizes this decorator
def check_collisions(sprites, obstacles):
    hits = []
    for s in sprites:
        for o in obstacles:
            if s.rect.colliderect(o.rect):
                hits.append((s, o))
    return hits
```

```bash
kernprof -l -v my_game.py
```

The output shows time-per-line, making it obvious whether `colliderect`,
the append, or the loop overhead dominates.

---

## Memory Debugging

### tracemalloc — finding allocation sources

`tracemalloc` is a built-in module that tracks where every memory allocation
originated. Use it to catch assets loaded inside the game loop, surfaces
created but never freed, or font objects re-created every frame.

```python
import tracemalloc

tracemalloc.start()

# ... run game for a while ...

snapshot = tracemalloc.take_snapshot()
top_stats = snapshot.statistics("lineno")

print("=== Top 10 memory allocations ===")
for stat in top_stats[:10]:
    print(stat)
```

### Comparing snapshots to find leaks

Take two snapshots separated by gameplay time. The difference shows what's
growing.

```python
tracemalloc.start()

# Snapshot A — right after init
snap_a = tracemalloc.take_snapshot()

# ... play for 60 seconds ...

# Snapshot B — after gameplay
snap_b = tracemalloc.take_snapshot()

diff = snap_b.compare_to(snap_a, "lineno")
print("=== Biggest growth ===")
for stat in diff[:10]:
    print(stat)
```

### Common Pygame memory pitfalls

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| Memory climbs steadily | Surfaces created in game loop | Pre-load in `__init__`, cache renders |
| Memory spikes on scene change | Old sprites not removed from groups | Call `sprite.kill()` or `group.empty()` |
| Memory never decreases | `Font` objects re-created every frame | Create fonts once, reuse |
| Leaked `Group` references | Group keeps sprites alive even if unreferenced | Explicitly `empty()` groups before discarding |

> **pygame issue #3763:** A `Group` with live members won't be garbage-collected
> even if nothing else references the group. Always call `group.empty()` before
> dropping a reference to a group.

---

## Visual Debugging Helpers

### Drawing collision rects

Render sprite rects as colored outlines to verify collision areas match
visible sprites. Toggle with a key press so it doesn't clutter normal play.

```python
DEBUG_DRAW = False

def draw_debug(screen, sprites):
    if not DEBUG_DRAW:
        return
    for sprite in sprites:
        pygame.draw.rect(screen, (255, 0, 0), sprite.rect, 1)

# In event loop:
if event.type == pygame.KEYDOWN and event.key == pygame.K_F3:
    DEBUG_DRAW = not DEBUG_DRAW
```

### Frame-step mode

Pause the game loop and advance one frame at a time. Invaluable for
reproducing physics glitches or animation frame mismatches.

```python
PAUSED = False
STEP = False

while running:
    for event in pygame.event.get():
        if event.type == pygame.KEYDOWN:
            if event.key == pygame.K_F5:
                PAUSED = not PAUSED
            if event.key == pygame.K_F6:
                STEP = True

    if not PAUSED or STEP:
        update_all(dt)
        STEP = False

    draw_all(screen)
    pygame.display.flip()
    clock.tick(60)
```

---

## Logging Best Practices

Use Python's `logging` module instead of `print()`. It supports log levels,
file output, and is easy to disable in release builds.

```python
import logging

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.FileHandler("game_debug.log"),
        logging.StreamHandler(),
    ],
)

logger = logging.getLogger("game")

logger.debug("Player position: %s", player.rect.topleft)
logger.info("Scene loaded: %s", scene_name)
logger.warning("Sprite count exceeds 500: %d", len(all_sprites))
```

Set `level=logging.WARNING` for release builds to silence debug noise without
removing the log statements.

---

## Quick Reference — Tools at a Glance

| Tool | What it shows | Install |
|------|--------------|---------|
| `Clock.get_fps()` | Real-time average FPS | Built-in (pygame) |
| `time.perf_counter()` | Frame section timings | Built-in (stdlib) |
| `cProfile` | Function-level CPU time | Built-in (stdlib) |
| `snakeviz` | Interactive cProfile viewer | `pip install snakeviz` |
| `line_profiler` | Line-level CPU time | `pip install line_profiler` |
| `tracemalloc` | Memory allocation source | Built-in (stdlib) |
| `objgraph` | Object reference graphs | `pip install objgraph` |
| `Py-Spy` | Sampling profiler (low overhead) | `pip install py-spy` |
