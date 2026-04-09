# AI and Pathfinding

> **Category:** guide · **Engine:** Pygame · **Related:** [Sprites and Collision](sprites-and-collision.md), [Physics and Movement](physics-and-movement.md), [Tilemaps and Level Design](tilemaps-and-level-design.md)

Enemy AI and pathfinding are essential for games with NPCs, enemies, or any autonomous agents. Pygame doesn't include a built-in pathfinding system, so you implement it yourself — which gives you full control over behavior. This guide covers grid-based A\* pathfinding, steering behaviors, finite state machines, and common patterns for enemy AI in 2D games.

## Grid-Based A\* Pathfinding

A\* is the go-to algorithm for grid-based pathfinding. It finds the shortest path from a start cell to a goal cell using a heuristic to prioritize promising directions. Python's `heapq` module provides an efficient priority queue.

### The Grid

Represent your world as a 2D grid where each cell is either walkable or blocked:

```python
import heapq

# 0 = walkable, 1 = blocked
GRID = [
    [0, 0, 0, 0, 1, 0, 0, 0],
    [0, 1, 1, 0, 1, 0, 1, 0],
    [0, 1, 0, 0, 0, 0, 1, 0],
    [0, 0, 0, 1, 1, 0, 0, 0],
    [0, 1, 0, 0, 0, 1, 1, 0],
    [0, 0, 0, 1, 0, 0, 0, 0],
]

ROWS = len(GRID)
COLS = len(GRID[0])
```

### Heuristic Function

Manhattan distance works for 4-directional movement. Use Chebyshev or Euclidean distance for 8-directional:

```python
def heuristic(a, b):
    """Manhattan distance — use for 4-directional grids."""
    return abs(a[0] - b[0]) + abs(a[1] - b[1])

def heuristic_diagonal(a, b):
    """Chebyshev distance — use for 8-directional grids."""
    return max(abs(a[0] - b[0]), abs(a[1] - b[1]))
```

### A\* Implementation

```python
def astar(grid, start, goal, allow_diagonal=False):
    """
    Find shortest path on a grid using A*.
    
    Returns a list of (row, col) tuples from start to goal,
    or an empty list if no path exists.
    """
    rows, cols = len(grid), len(grid[0])
    
    # Directions: 4-way or 8-way movement
    if allow_diagonal:
        neighbors = [
            (-1, 0), (1, 0), (0, -1), (0, 1),
            (-1, -1), (-1, 1), (1, -1), (1, 1),
        ]
    else:
        neighbors = [(-1, 0), (1, 0), (0, -1), (0, 1)]
    
    # Priority queue: (f_score, counter, position)
    # Counter breaks ties so heapq never compares tuples
    counter = 0
    open_set = []
    heapq.heappush(open_set, (0, counter, start))
    
    came_from = {}
    g_score = {start: 0}
    
    hfunc = heuristic_diagonal if allow_diagonal else heuristic
    
    while open_set:
        _, _, current = heapq.heappop(open_set)
        
        if current == goal:
            # Reconstruct path
            path = []
            while current in came_from:
                path.append(current)
                current = came_from[current]
            path.append(start)
            path.reverse()
            return path
        
        for dr, dc in neighbors:
            nr, nc = current[0] + dr, current[1] + dc
            neighbor = (nr, nc)
            
            # Bounds and walkability check
            if not (0 <= nr < rows and 0 <= nc < cols):
                continue
            if grid[nr][nc] == 1:
                continue
            
            # Diagonal movement cost is ~1.41, cardinal is 1
            move_cost = 1.414 if (dr != 0 and dc != 0) else 1
            tentative_g = g_score[current] + move_cost
            
            if tentative_g < g_score.get(neighbor, float("inf")):
                came_from[neighbor] = current
                g_score[neighbor] = tentative_g
                f_score = tentative_g + hfunc(neighbor, goal)
                counter += 1
                heapq.heappush(open_set, (f_score, counter, neighbor))
    
    return []  # No path found
```

### Using A\* with Pygame Sprites

Convert between pixel coordinates and grid coordinates:

```python
TILE_SIZE = 32

def pixel_to_grid(px, py):
    return (py // TILE_SIZE, px // TILE_SIZE)

def grid_to_pixel(row, col):
    return (col * TILE_SIZE + TILE_SIZE // 2,
            row * TILE_SIZE + TILE_SIZE // 2)

class Enemy(pygame.sprite.Sprite):
    def __init__(self, x, y, speed=2):
        super().__init__()
        self.image = pygame.Surface((24, 24))
        self.image.fill((255, 0, 0))
        self.rect = self.image.get_rect(center=(x, y))
        self.pos = pygame.math.Vector2(x, y)
        self.speed = speed
        self.path = []
        self.path_index = 0
    
    def find_path(self, grid, target_pos):
        """Recalculate path to target using A*."""
        start = pixel_to_grid(self.pos.x, self.pos.y)
        goal = pixel_to_grid(target_pos[0], target_pos[1])
        self.path = astar(grid, start, goal)
        self.path_index = 1  # Skip current cell
    
    def update(self):
        if self.path_index >= len(self.path):
            return  # Arrived or no path
        
        # Move toward next waypoint
        target_cell = self.path[self.path_index]
        target = pygame.math.Vector2(grid_to_pixel(*target_cell))
        direction = target - self.pos
        
        if direction.length() < self.speed:
            self.pos = target
            self.path_index += 1
        else:
            direction.normalize_ip()
            self.pos += direction * self.speed
        
        self.rect.center = (int(self.pos.x), int(self.pos.y))
```

### Performance Tips for A\*

- **Recalculate sparingly.** Don't run A\* every frame — recalculate every 0.5–1 second or when the target moves significantly.
- **Limit search area.** Cap the number of nodes explored (e.g., 500) to avoid freezes on large maps.
- **Cache paths.** If multiple enemies target the same cell, share the result.
- **Use `pygame-ce`'s improved performance.** pygame-ce's faster rendering frees CPU budget for pathfinding.

```python
class Enemy(pygame.sprite.Sprite):
    PATH_RECALC_MS = 500  # Recalculate every 500ms
    
    def __init__(self, x, y):
        super().__init__()
        # ... (same as above)
        self.last_path_time = 0
    
    def update(self, grid, target_pos):
        now = pygame.time.get_ticks()
        if now - self.last_path_time > self.PATH_RECALC_MS:
            self.find_path(grid, target_pos)
            self.last_path_time = now
        # ... (movement logic)
```

## Steering Behaviors

For non-grid movement (top-down shooters, space games), steering behaviors give smooth, natural-looking AI movement without a grid.

### Seek and Flee

```python
def seek(pos, target, speed):
    """Return velocity vector toward target."""
    desired = target - pos
    if desired.length() == 0:
        return pygame.math.Vector2(0, 0)
    desired.scale_to_length(speed)
    return desired

def flee(pos, threat, speed):
    """Return velocity vector away from threat."""
    return -seek(pos, threat, speed)
```

### Arrive (Slow Down Near Target)

```python
def arrive(pos, target, speed, slow_radius=100):
    """Seek but decelerate when close to target."""
    to_target = target - pos
    dist = to_target.length()
    if dist == 0:
        return pygame.math.Vector2(0, 0)
    
    if dist < slow_radius:
        desired_speed = speed * (dist / slow_radius)
    else:
        desired_speed = speed
    
    to_target.scale_to_length(desired_speed)
    return to_target
```

### Wander

```python
import random

class Wanderer:
    def __init__(self, pos, speed=1.5):
        self.pos = pygame.math.Vector2(pos)
        self.velocity = pygame.math.Vector2(speed, 0)
        self.wander_angle = 0
        self.speed = speed
    
    def wander(self):
        """Produce smooth random movement."""
        WANDER_RADIUS = 30
        WANDER_DISTANCE = 60
        WANDER_JITTER = 0.3
        
        self.wander_angle += random.uniform(
            -WANDER_JITTER, WANDER_JITTER
        )
        
        # Point on wander circle
        circle_center = self.velocity.copy()
        if circle_center.length() > 0:
            circle_center.scale_to_length(WANDER_DISTANCE)
        
        offset = pygame.math.Vector2(
            WANDER_RADIUS * math.cos(self.wander_angle),
            WANDER_RADIUS * math.sin(self.wander_angle),
        )
        
        desired = circle_center + offset
        if desired.length() > 0:
            desired.scale_to_length(self.speed)
        self.velocity = desired
        self.pos += self.velocity
```

## Finite State Machine (FSM) for Enemy AI

An FSM keeps enemy behavior organized. Each state has enter/update/exit logic:

```python
class State:
    def enter(self, entity):
        pass
    def update(self, entity, dt):
        pass
    def exit(self, entity):
        pass

class IdleState(State):
    def update(self, entity, dt):
        # Switch to chase if player is nearby
        dist = entity.pos.distance_to(entity.target_pos)
        if dist < entity.detect_range:
            entity.change_state(ChaseState())

class ChaseState(State):
    def enter(self, entity):
        entity.find_path(entity.grid, entity.target_pos)
    
    def update(self, entity, dt):
        dist = entity.pos.distance_to(entity.target_pos)
        if dist < entity.attack_range:
            entity.change_state(AttackState())
        elif dist > entity.detect_range * 1.5:
            entity.change_state(IdleState())
        # Follow path...

class AttackState(State):
    def enter(self, entity):
        entity.attack_timer = 0
    
    def update(self, entity, dt):
        entity.attack_timer += dt
        if entity.attack_timer >= entity.attack_cooldown:
            entity.perform_attack()
            entity.attack_timer = 0
        
        dist = entity.pos.distance_to(entity.target_pos)
        if dist > entity.attack_range:
            entity.change_state(ChaseState())

class SmartEnemy(pygame.sprite.Sprite):
    def __init__(self, x, y):
        super().__init__()
        self.pos = pygame.math.Vector2(x, y)
        self.state = IdleState()
        self.detect_range = 200
        self.attack_range = 40
        self.attack_cooldown = 1.0
        self.state.enter(self)
    
    def change_state(self, new_state):
        self.state.exit(self)
        self.state = new_state
        self.state.enter(self)
    
    def update(self, dt):
        self.state.update(self, dt)
```

## Line of Sight

Use raycasting on the grid to check if an enemy can "see" the player:

```python
def has_line_of_sight(grid, start, end, tile_size=32):
    """
    Bresenham-style check: returns True if no blocked
    cell lies between start and end (pixel coords).
    """
    x0, y0 = int(start[0]), int(start[1])
    x1, y1 = int(end[0]), int(end[1])
    
    dx = abs(x1 - x0)
    dy = abs(y1 - y0)
    sx = 1 if x0 < x1 else -1
    sy = 1 if y0 < y1 else -1
    err = dx - dy
    
    while True:
        col, row = x0 // tile_size, y0 // tile_size
        if 0 <= row < len(grid) and 0 <= col < len(grid[0]):
            if grid[row][col] == 1:
                return False
        
        if x0 == x1 and y0 == y1:
            break
        
        e2 = 2 * err
        if e2 > -dy:
            err -= dy
            x0 += sx
        if e2 < dx:
            err += dx
            y0 += sy
    
    return True
```

## Putting It Together

A typical enemy AI loop:

1. **Detect** — check distance or line of sight to the player.
2. **Decide** — FSM transitions (idle → chase → attack → flee).
3. **Pathfind** — A\* on a grid, or steering behaviors in open space.
4. **Move** — follow the path or velocity each frame.
5. **Act** — attack, shoot, alert others, etc.

Throttle expensive operations (pathfinding, LOS checks) using timers rather than running them every frame. For groups of enemies, stagger recalculations across frames to spread the CPU cost.
