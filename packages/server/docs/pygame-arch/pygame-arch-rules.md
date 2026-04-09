# Pygame — AI Rules

Engine-specific rules for projects using Pygame (and pygame-ce). These supplement the engine-agnostic rules in `docs/core/ai-workflow/gamedev-rules.md`.

---

## Architecture Context

### Tech Stack

- **Library:** Pygame 2.6+ (SDL2-based 2D game library) or pygame-ce 2.5+ (Community Edition fork)
- **Language:** Python 3.9+
- **Renderer:** Software rendering via SDL2 Surfaces; hardware-accelerated via `pygame._sdl2` (experimental)
- **Audio:** `pygame.mixer` (sound effects) + `pygame.mixer.music` (streaming BGM)
- **Build/Distribution:** PyInstaller, cx_Freeze, or Nuitka for executables
- **Key Libraries:**
  - Tiled + pytmx (tilemap loading)
  - Pillow (image preprocessing)
  - numpy (pixel manipulation, procedural generation)
  - pygame-gui or pygame_menu (UI widgets)

### Pygame vs pygame-ce

pygame-ce is a community-maintained fork by former pygame core developers. Key differences:

- **`pygame.IS_CE`** — boolean flag to detect pygame-ce at runtime
- **`Surface.fblits()`** — batch blitting, faster than sequential `.blit()` calls
- **`FRect`** — floating-point rectangle class (subpixel positioning)
- **`transform.box_blur()` / `gaussian_blur()`** — built-in blur filters
- **Color swizzling** — `.rgb`, `.rgba` attribute access on Color objects
- **No `fastevent` module** — removed in pygame-ce (use standard event queue)
- **Float assignment** — pygame-ce truncates; upstream pygame rounds

When generating code, prefer APIs available in both. Note pygame-ce-only features with a comment.

### Project Structure Conventions

```
src/
├── main.py              # Entry point, init + game loop
├── settings.py          # Constants: SCREEN_WIDTH, FPS, colors
├── game.py              # Game class orchestrating states/scenes
├── scenes/              # Scene/state classes (menu, gameplay, pause)
├── sprites/             # Sprite subclasses (player, enemies, items)
├── systems/             # Non-sprite logic (camera, collision, particles)
├── utils/               # Helpers (asset loading, math, timers)
└── assets/
    ├── images/          # PNG preferred (convert_alpha)
    ├── sounds/          # WAV for SFX, OGG for music
    ├── fonts/           # TTF/OTF font files
    └── maps/            # Tiled JSON/TMX tilemaps
```

---

## Code Generation Rules

### Game Loop: Fixed Timestep with Delta Time

```python
# CORRECT — fixed FPS with delta time for frame-independent movement
import pygame

pygame.init()
screen = pygame.display.set_mode((800, 600))
clock = pygame.time.Clock()
FPS = 60

running = True
while running:
    # dt in seconds — use for all movement/animation
    dt = clock.tick(FPS) / 1000.0

    for event in pygame.event.get():
        if event.type == pygame.QUIT:
            running = False

    # Update game state using dt
    player.x += player.speed * dt

    # Draw
    screen.fill((0, 0, 0))
    # ... draw sprites ...
    pygame.display.flip()

pygame.quit()

# WRONG — no delta time, movement speed tied to FPS
player.x += 5  # runs differently at 30 vs 60 FPS
```

### Surface Loading: Always convert()

```python
# CORRECT — convert surfaces to display format for fast blitting
image = pygame.image.load("player.png").convert_alpha()
background = pygame.image.load("bg.png").convert()

# WRONG — unconverted surfaces blit ~5-10x slower
image = pygame.image.load("player.png")
```

### Sprites: Subclass pygame.sprite.Sprite

```python
# CORRECT — use Sprite class with image + rect attributes
class Player(pygame.sprite.Sprite):
    def __init__(self, pos, groups):
        super().__init__(groups)
        self.image = pygame.image.load("player.png").convert_alpha()
        self.rect = self.image.get_rect(center=pos)
        self.speed = 200  # pixels per second

    def update(self, dt):
        keys = pygame.key.get_pressed()
        direction = pygame.math.Vector2(0, 0)
        if keys[pygame.K_RIGHT]:
            direction.x = 1
        if keys[pygame.K_LEFT]:
            direction.x = -1
        if direction.magnitude() > 0:
            direction = direction.normalize()
        self.rect.center += direction * self.speed * dt

# WRONG — plain dict or class without Sprite inheritance
player = {"x": 100, "y": 200, "image": some_surface}
```

### Collision Detection: Use Built-in Methods

```python
# CORRECT — group-based collision (fast, scales well)
hits = pygame.sprite.spritecollide(player, enemy_group, dokill=False)

# Pixel-perfect collision — set mask once in __init__
class Enemy(pygame.sprite.Sprite):
    def __init__(self, pos, groups):
        super().__init__(groups)
        self.image = pygame.image.load("enemy.png").convert_alpha()
        self.rect = self.image.get_rect(center=pos)
        self.mask = pygame.mask.from_surface(self.image)

# Then use collide_mask callback
hits = pygame.sprite.spritecollide(player, enemies, False, pygame.sprite.collide_mask)

# Group vs group collision
collisions = pygame.sprite.groupcollide(bullets, enemies, True, True)

# WRONG — manual rect checking in a nested loop
for enemy in enemies:
    if player.rect.colliderect(enemy.rect):  # O(n), doesn't scale
        pass
```

### Audio: Mixer Initialization

```python
# CORRECT — init mixer before pygame.init() for custom settings
pygame.mixer.pre_init(frequency=44100, size=-16, channels=2, buffer=512)
pygame.init()

# SFX — short sounds, multiple channels
jump_sound = pygame.mixer.Sound("jump.wav")
jump_sound.play()

# BGM — streaming, one track at a time
pygame.mixer.music.load("bgm.ogg")
pygame.mixer.music.set_volume(0.5)
pygame.mixer.music.play(loops=-1)  # -1 = loop forever

# WRONG — loading OGG as Sound (loads entire file into memory)
bgm = pygame.mixer.Sound("long_bgm.ogg")  # wastes memory; use mixer.music
```

### Drawing: Minimize draw calls

```python
# CORRECT — use sprite groups for batch drawing
all_sprites = pygame.sprite.Group()
# ... add sprites to group ...

# In game loop:
all_sprites.update(dt)
all_sprites.draw(screen)  # blits all sprites in one call

# For layered rendering:
all_sprites = pygame.sprite.LayeredUpdates()
# sprites drawn in layer order automatically

# CORRECT — dirty rect updating for static scenes
changed_rects = all_sprites.draw(screen)
pygame.display.update(changed_rects)  # only update changed areas

# WRONG — calling blit individually for each sprite
for sprite in sprites_list:
    screen.blit(sprite.image, sprite.rect)
```

---

## Performance Guidelines

1. **Always `convert()` / `convert_alpha()`** loaded surfaces — this is the single biggest optimization.
2. **Use `pygame.display.update(rects)` over `flip()`** when only parts of the screen change.
3. **Pre-render static elements** to a single surface, blit once per frame.
4. **Avoid `Surface.set_at()` / `get_at()`** in loops — use `pygame.surfarray` with numpy instead.
5. **Pool surfaces** — don't create/destroy surfaces every frame (e.g., rotated images).
6. **Use `pygame.sprite.Group.draw()`** — faster than manual blit loops.
7. **Collision broadphase** — for 50+ dynamic objects, consider spatial hashing or quadtrees before fine collision.

---

## Common Pitfalls

1. **Forgetting `convert()`** — surfaces blit at native pixel format, orders of magnitude slower than display format.
2. **Rotating sprites every frame** — `pygame.transform.rotate()` degrades quality over successive calls. Keep the original, rotate from it each frame.
3. **Using `pygame.mixer.Sound` for long audio** — use `mixer.music` for BGM (streams from disk instead of loading into RAM).
4. **Not calling `pygame.event.get()`** — the OS event queue fills up, causing the window to freeze / become unresponsive.
5. **Mixing `display.flip()` and `display.update()`** — use one or the other consistently per frame.
6. **Hardcoded screen positions** — extract to constants or compute relative to `SCREEN_WIDTH`/`SCREEN_HEIGHT` for resolution flexibility.
7. **Not using Vector2 for movement** — manual sin/cos is error-prone; `pygame.math.Vector2` handles normalization, rotation, and lerp cleanly.
