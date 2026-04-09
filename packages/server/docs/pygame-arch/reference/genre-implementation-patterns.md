# Genre Implementation Patterns

> **Category:** reference · **Engine:** Pygame · **Related:** [Game Loop and State](../architecture/game-loop-and-state.md), [Sprites and Collision](../guides/sprites-and-collision.md), [Tilemaps and Level Design](../guides/tilemaps-and-level-design.md), [Physics and Movement](../guides/physics-and-movement.md)

Different game genres share common structural patterns. This reference covers the key architectural decisions and code skeletons for the most popular 2D genres built with Pygame, so you can start with a proven foundation instead of inventing structure from scratch.

## Platformer

A side-scrolling or single-screen platformer needs gravity, jumping, one-way platforms, and tile-based collision.

### Core Architecture

```
Player (sprite) ─── has gravity, jump, horizontal movement
Tilemap ─────────── collision layer (solid tiles)
Camera ──────────── follows player, offsets all drawing
Enemies ─────────── patrol, gravity, simple AI
Collectibles ────── overlap detection, score tracking
```

### Gravity and Jumping

```python
GRAVITY = 0.8
JUMP_FORCE = -14
MAX_FALL = 12

class Player(pygame.sprite.Sprite):
    def __init__(self, x, y):
        super().__init__()
        self.image = pygame.Surface((32, 48))
        self.image.fill((0, 120, 255))
        self.rect = self.image.get_rect(topleft=(x, y))
        self.vel_x = 0
        self.vel_y = 0
        self.on_ground = False
        self.speed = 4
    
    def update(self, tiles):
        keys = pygame.key.get_pressed()
        
        # Horizontal movement
        self.vel_x = 0
        if keys[pygame.K_LEFT]:
            self.vel_x = -self.speed
        if keys[pygame.K_RIGHT]:
            self.vel_x = self.speed
        
        # Jump
        if keys[pygame.K_SPACE] and self.on_ground:
            self.vel_y = JUMP_FORCE
            self.on_ground = False
        
        # Gravity
        self.vel_y = min(self.vel_y + GRAVITY, MAX_FALL)
        
        # Move and collide on each axis independently
        self.rect.x += self.vel_x
        self._collide_x(tiles)
        self.rect.y += self.vel_y
        self._collide_y(tiles)
    
    def _collide_x(self, tiles):
        for tile in tiles:
            if self.rect.colliderect(tile.rect):
                if self.vel_x > 0:
                    self.rect.right = tile.rect.left
                elif self.vel_x < 0:
                    self.rect.left = tile.rect.right
    
    def _collide_y(self, tiles):
        self.on_ground = False
        for tile in tiles:
            if self.rect.colliderect(tile.rect):
                if self.vel_y > 0:
                    self.rect.bottom = tile.rect.top
                    self.on_ground = True
                elif self.vel_y < 0:
                    self.rect.top = tile.rect.bottom
                self.vel_y = 0
```

### Key Decisions

- **Axis-separated collision** — move X, resolve X collisions, then move Y, resolve Y collisions. This prevents corner-case bugs.
- **Tile-based levels** — use Tiled (.tmx) for level design with `pytmx` for loading.
- **Coyote time** — allow jumping for a few frames after walking off an edge for better game feel.
- **Variable jump height** — cut upward velocity when the player releases the jump key early.

## Top-Down RPG

Tile-based world, 4- or 8-directional movement, NPCs, dialogue, and inventory.

### Core Architecture

```
Player ──────── grid-aligned or free movement
World Map ───── multiple tilemaps (overworld, dungeons)
NPCs ────────── dialogue trees, schedules, shop interfaces
Inventory ───── item database, equipment slots
Camera ──────── follows player, bounded to map edges
```

### Free Movement with Tile Collision

```python
class RPGPlayer(pygame.sprite.Sprite):
    def __init__(self, x, y):
        super().__init__()
        self.image = pygame.Surface((32, 32))
        self.image.fill((0, 200, 80))
        self.rect = self.image.get_rect(topleft=(x, y))
        self.speed = 3
        self.direction = "down"
    
    def update(self, collision_rects):
        keys = pygame.key.get_pressed()
        dx, dy = 0, 0
        
        if keys[pygame.K_UP]:
            dy = -self.speed
            self.direction = "up"
        elif keys[pygame.K_DOWN]:
            dy = self.speed
            self.direction = "down"
        if keys[pygame.K_LEFT]:
            dx = -self.speed
            self.direction = "left"
        elif keys[pygame.K_RIGHT]:
            dx = self.speed
            self.direction = "right"
        
        # Normalize diagonal movement
        if dx != 0 and dy != 0:
            factor = 0.7071  # 1/sqrt(2)
            dx *= factor
            dy *= factor
        
        # Axis-separated collision (same pattern as platformer)
        self.rect.x += dx
        for wall in collision_rects:
            if self.rect.colliderect(wall):
                if dx > 0:
                    self.rect.right = wall.left
                else:
                    self.rect.left = wall.right
        
        self.rect.y += dy
        for wall in collision_rects:
            if self.rect.colliderect(wall):
                if dy > 0:
                    self.rect.bottom = wall.top
                else:
                    self.rect.top = wall.bottom
```

### Dialogue System Skeleton

```python
class DialogueBox:
    def __init__(self):
        self.active = False
        self.lines = []
        self.current_line = 0
        self.font = pygame.font.Font(None, 24)
    
    def start(self, lines):
        self.lines = lines
        self.current_line = 0
        self.active = True
    
    def advance(self):
        self.current_line += 1
        if self.current_line >= len(self.lines):
            self.active = False
    
    def draw(self, surface):
        if not self.active:
            return
        box = pygame.Rect(20, 400, 760, 150)
        pygame.draw.rect(surface, (20, 20, 40), box)
        pygame.draw.rect(surface, (200, 200, 220), box, 2)
        text = self.font.render(
            self.lines[self.current_line], True, (255, 255, 255)
        )
        surface.blit(text, (box.x + 20, box.y + 20))
```

### Key Decisions

- **Map transitions** — use named entry points (e.g., "door_A") so each map knows where to place the player.
- **Depth sorting** — draw sprites by their `rect.bottom` value so characters behind objects appear behind them.
- **Interaction zones** — give NPCs and objects a trigger rect slightly larger than their sprite.

## Twin-Stick Shooter

Free aiming with mouse or right stick, wave-based enemies, bullet management.

### Core Architecture

```
Player ──────── WASD movement, mouse aim, shoot
Bullets ─────── sprite group, velocity, lifetime
Enemies ─────── spawner, seek player, health
Waves ───────── spawn schedule, difficulty curve
```

### Player with Mouse Aiming

```python
import math

class ShooterPlayer(pygame.sprite.Sprite):
    def __init__(self, x, y):
        super().__init__()
        self.original_image = pygame.Surface((32, 32), pygame.SRCALPHA)
        pygame.draw.polygon(
            self.original_image, (0, 200, 255),
            [(16, 0), (0, 32), (32, 32)]
        )
        self.image = self.original_image
        self.rect = self.image.get_rect(center=(x, y))
        self.pos = pygame.math.Vector2(x, y)
        self.speed = 4
        self.angle = 0
        self.shoot_cooldown = 150  # ms
        self.last_shot = 0
    
    def update(self):
        keys = pygame.key.get_pressed()
        move = pygame.math.Vector2(0, 0)
        if keys[pygame.K_w]: move.y -= 1
        if keys[pygame.K_s]: move.y += 1
        if keys[pygame.K_a]: move.x -= 1
        if keys[pygame.K_d]: move.x += 1
        
        if move.length() > 0:
            move.normalize_ip()
            self.pos += move * self.speed
        
        # Rotate toward mouse
        mx, my = pygame.mouse.get_pos()
        dx = mx - self.pos.x
        dy = my - self.pos.y
        self.angle = math.degrees(math.atan2(-dy, dx)) - 90
        self.image = pygame.transform.rotate(
            self.original_image, self.angle
        )
        self.rect = self.image.get_rect(center=self.pos)
    
    def try_shoot(self, bullet_group):
        now = pygame.time.get_ticks()
        if now - self.last_shot < self.shoot_cooldown:
            return
        self.last_shot = now
        
        mx, my = pygame.mouse.get_pos()
        direction = pygame.math.Vector2(
            mx - self.pos.x, my - self.pos.y
        )
        if direction.length() > 0:
            direction.normalize_ip()
        bullet_group.add(Bullet(self.pos, direction))
```

### Bullet with Lifetime

```python
class Bullet(pygame.sprite.Sprite):
    def __init__(self, pos, direction, speed=10, lifetime=1500):
        super().__init__()
        self.image = pygame.Surface((6, 6))
        self.image.fill((255, 255, 0))
        self.rect = self.image.get_rect(center=pos)
        self.pos = pygame.math.Vector2(pos)
        self.vel = direction * speed
        self.spawn_time = pygame.time.get_ticks()
        self.lifetime = lifetime
    
    def update(self):
        self.pos += self.vel
        self.rect.center = self.pos
        if pygame.time.get_ticks() - self.spawn_time > self.lifetime:
            self.kill()
```

### Key Decisions

- **Object pooling** — for hundreds of bullets, reuse sprite objects instead of creating/destroying them.
- **Spatial partitioning** — use a grid or quadtree for collision checks when entity counts are high.
- **Screen shake** — offset the camera by a random amount that decays over frames for impact feedback.

## Puzzle / Match-3

Grid-based logic, animation sequences, score combos.

### Core Architecture

```
Board ───────── 2D array of piece types
Input ───────── click/drag to swap adjacent pieces
Match Logic ─── scan rows and columns for 3+ matches
Cascade ─────── remove matches, drop pieces, fill from top
Animation ───── tween pieces to target positions
```

### Board Representation

```python
import random

COLS, ROWS = 8, 8
TILE_SIZE = 64
NUM_TYPES = 5  # Different gem/piece types

class Board:
    def __init__(self):
        self.grid = [
            [random.randint(0, NUM_TYPES - 1) for _ in range(COLS)]
            for _ in range(ROWS)
        ]
        self._remove_initial_matches()
    
    def _remove_initial_matches(self):
        """Re-roll pieces that form matches on the starting board."""
        changed = True
        while changed:
            changed = False
            for r in range(ROWS):
                for c in range(COLS):
                    while self._forms_match(r, c):
                        self.grid[r][c] = random.randint(
                            0, NUM_TYPES - 1
                        )
                        changed = True
    
    def _forms_match(self, r, c):
        val = self.grid[r][c]
        # Horizontal check
        if (c >= 2
            and self.grid[r][c-1] == val
            and self.grid[r][c-2] == val):
            return True
        # Vertical check
        if (r >= 2
            and self.grid[r-1][c] == val
            and self.grid[r-2][c] == val):
            return True
        return False
    
    def find_matches(self):
        """Return set of (row, col) positions that are part of a match."""
        matched = set()
        # Horizontal
        for r in range(ROWS):
            for c in range(COLS - 2):
                if (self.grid[r][c] == self.grid[r][c+1]
                        == self.grid[r][c+2]
                        and self.grid[r][c] is not None):
                    matched |= {(r, c), (r, c+1), (r, c+2)}
        # Vertical
        for c in range(COLS):
            for r in range(ROWS - 2):
                if (self.grid[r][c] == self.grid[r+1][c]
                        == self.grid[r+2][c]
                        and self.grid[r][c] is not None):
                    matched |= {(r, c), (r+1, c), (r+2, c)}
        return matched
    
    def remove_and_drop(self):
        """Remove matched cells, drop pieces down, fill top."""
        matches = self.find_matches()
        if not matches:
            return False
        
        for r, c in matches:
            self.grid[r][c] = None
        
        # Drop: process each column bottom-up
        for c in range(COLS):
            write = ROWS - 1
            for r in range(ROWS - 1, -1, -1):
                if self.grid[r][c] is not None:
                    self.grid[write][c] = self.grid[r][c]
                    if write != r:
                        self.grid[r][c] = None
                    write -= 1
            # Fill empty cells at top
            for r in range(write, -1, -1):
                self.grid[r][c] = random.randint(0, NUM_TYPES - 1)
        
        return True  # Matches were found; caller should check again
```

### Key Decisions

- **Animate then mutate** — show pieces sliding/fading before updating the grid data.
- **Chain cascades** — after dropping and filling, scan for new matches (combo system).
- **Input lock** — block input while animations play to prevent desyncing the board state.

## General Patterns Across All Genres

### Scene / State Manager

Every genre benefits from a state machine that separates title screen, gameplay, pause, and game over:

```python
class SceneManager:
    def __init__(self):
        self.scenes = {}
        self.current = None
    
    def add(self, name, scene):
        self.scenes[name] = scene
    
    def switch(self, name):
        if self.current:
            self.current.exit()
        self.current = self.scenes[name]
        self.current.enter()
    
    def update(self, dt):
        if self.current:
            self.current.update(dt)
    
    def draw(self, surface):
        if self.current:
            self.current.draw(surface)
```

### Delta-Time Movement

Never tie movement speed to frame rate. Multiply velocities by `dt`:

```python
clock = pygame.time.Clock()
while running:
    dt = clock.tick(60) / 1000.0  # seconds
    player.pos += player.velocity * dt
```

### Draw Order (Depth Sorting)

For any genre with overlapping sprites:

```python
# Sort sprites by their bottom edge before drawing
for sprite in sorted(all_sprites, key=lambda s: s.rect.bottom):
    surface.blit(sprite.image, camera.apply(sprite.rect))
```
