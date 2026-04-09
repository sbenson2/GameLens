# G5 — Raylib Physics & Collision Patterns

> **Category:** guide · **Engine:** Raylib · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [2D Game Patterns](G2_2d_game_patterns.md) · [Audio & Input](../reference/R2_audio_and_input.md)

Raylib has no built-in physics engine — collision detection is a set of pure CPU math functions in the `rshapes` module, and collision *response* (what happens after overlap) is entirely your responsibility. This guide covers the built-in collision API, common response patterns, and when to reach for a third-party physics library.

---

## Built-In Collision Functions

All collision functions live in `raylib.h` and are implemented in `src/rshapes.c`. They take simple geometric primitives (Rectangle, Vector2, radius) and return booleans or overlap data. No spatial data structures, no broadphase — just direct math.

### The Full 2D Collision API

```c
// Rectangle vs Rectangle
bool CheckCollisionRecs(Rectangle rec1, Rectangle rec2);
Rectangle GetCollisionRec(Rectangle rec1, Rectangle rec2);  // overlap area

// Circle vs Circle
bool CheckCollisionCircles(Vector2 center1, float radius1,
                           Vector2 center2, float radius2);

// Circle vs Rectangle
bool CheckCollisionCircleRec(Vector2 center, float radius, Rectangle rec);

// Circle vs Line
bool CheckCollisionCircleLine(Vector2 center, float radius,
                              Vector2 p1, Vector2 p2);

// Point tests
bool CheckCollisionPointRec(Vector2 point, Rectangle rec);
bool CheckCollisionPointCircle(Vector2 point, Vector2 center, float radius);
bool CheckCollisionPointTriangle(Vector2 point, Vector2 p1,
                                 Vector2 p2, Vector2 p3);
bool CheckCollisionPointPoly(Vector2 point, const Vector2 *points,
                             int pointCount);
bool CheckCollisionPointLine(Vector2 point, Vector2 p1, Vector2 p2,
                             int threshold);

// Line vs Line (returns intersection point)
bool CheckCollisionLines(Vector2 startPos1, Vector2 endPos1,
                         Vector2 startPos2, Vector2 endPos2,
                         Vector2 *collisionPoint);
```

### 3D Collision Functions

```c
// Ray casting (useful for mouse picking, bullets)
RayCollision GetRayCollisionSphere(Ray ray, Vector2 center, float radius);
RayCollision GetRayCollisionBox(Ray ray, BoundingBox box);
RayCollision GetRayCollisionMesh(Ray ray, Mesh mesh, Matrix transform);
RayCollision GetRayCollisionTriangle(Ray ray, Vector3 p1,
                                     Vector3 p2, Vector3 p3);
RayCollision GetRayCollisionQuad(Ray ray, Vector3 p1, Vector3 p2,
                                 Vector3 p3, Vector3 p4);

// Bounding box tests
bool CheckCollisionBoxes(BoundingBox box1, BoundingBox box2);
bool CheckCollisionBoxSphere(BoundingBox box, Vector3 center, float radius);
```

---

## Pattern: AABB Collision Response

The most common 2D pattern is axis-aligned bounding box (AABB) collision with push-out resolution. Raylib gives you `GetCollisionRec()` which returns the overlap rectangle — use its dimensions to determine the push direction.

```c
// Player and obstacle are both Rectangle
Rectangle overlap = GetCollisionRec(player, obstacle);

if (CheckCollisionRecs(player, obstacle)) {
    // Push out along the smallest axis (minimum penetration)
    if (overlap.width < overlap.height) {
        // Horizontal collision — push left or right
        float push_dir = (player.x < obstacle.x) ? -1.0f : 1.0f;
        player.x += push_dir * overlap.width;
    } else {
        // Vertical collision — push up or down
        float push_dir = (player.y < obstacle.y) ? -1.0f : 1.0f;
        player.y += push_dir * overlap.height;

        // If pushed up, player is on the ground
        if (push_dir < 0) player_on_ground = true;
    }
}
```

### Why Minimum Penetration?

Pushing along the axis with the smallest overlap produces the least visible "teleportation." If the player clips a corner, the small-axis push slides them around the edge naturally. This is the same approach used in most 2D platformers.

---

## Pattern: Circle Collision Response

For top-down games, circle colliders feel more natural because they don't snag on corners.

```c
Vector2 player_pos = { 200.0f, 200.0f };
float player_radius = 16.0f;

Vector2 enemy_pos = { 210.0f, 205.0f };
float enemy_radius = 16.0f;

if (CheckCollisionCircles(player_pos, player_radius,
                          enemy_pos, enemy_radius)) {
    // Calculate penetration vector
    Vector2 diff = Vector2Subtract(player_pos, enemy_pos);
    float dist = Vector2Length(diff);
    float penetration = (player_radius + enemy_radius) - dist;

    if (dist > 0.0f) {
        // Normalize and push apart
        Vector2 normal = Vector2Scale(diff, 1.0f / dist);
        player_pos = Vector2Add(player_pos,
                                Vector2Scale(normal, penetration * 0.5f));
        enemy_pos = Vector2Subtract(enemy_pos,
                                    Vector2Scale(normal, penetration * 0.5f));
    }
}
```

Use `raymath.h` for `Vector2Subtract`, `Vector2Length`, `Vector2Scale`, `Vector2Add` — they're all inlined.

---

## Pattern: Sweep-Based Movement

At high speeds, objects can tunnel through thin walls. The fix is to check along the movement path rather than just at the destination.

```c
// Simple step-based sweep: subdivide movement into small steps
void move_with_sweep(Rectangle *entity, Vector2 velocity,
                     Rectangle *walls, int wall_count) {
    float step_size = 1.0f;  // 1 pixel per step
    float total_dist = Vector2Length(velocity);
    Vector2 dir = Vector2Normalize(velocity);
    float moved = 0.0f;

    while (moved < total_dist) {
        float step = fminf(step_size, total_dist - moved);
        entity->x += dir.x * step;

        // Check X collisions
        for (int i = 0; i < wall_count; i++) {
            if (CheckCollisionRecs(*entity, walls[i])) {
                Rectangle overlap = GetCollisionRec(*entity, walls[i]);
                entity->x += (dir.x < 0) ? overlap.width : -overlap.width;
                break;
            }
        }

        entity->y += dir.y * step;

        // Check Y collisions
        for (int i = 0; i < wall_count; i++) {
            if (CheckCollisionRecs(*entity, walls[i])) {
                Rectangle overlap = GetCollisionRec(*entity, walls[i]);
                entity->y += (dir.y < 0) ? overlap.height : -overlap.height;
                break;
            }
        }

        moved += step;
    }
}
```

This is O(steps × walls) — fine for <100 walls. For larger worlds, add a spatial grid.

---

## Pattern: Simple Spatial Grid

When you have hundreds of collidable objects, checking every pair is expensive. A spatial grid divides the world into cells so you only check nearby objects.

```c
#define GRID_CELL_SIZE 64
#define GRID_WIDTH     32
#define GRID_HEIGHT    32
#define MAX_PER_CELL   16

typedef struct {
    int entity_ids[MAX_PER_CELL];
    int count;
} GridCell;

GridCell grid[GRID_WIDTH][GRID_HEIGHT];

// Clear grid each frame
void grid_clear(void) {
    for (int y = 0; y < GRID_HEIGHT; y++)
        for (int x = 0; x < GRID_WIDTH; x++)
            grid[x][y].count = 0;
}

// Insert entity by its position
void grid_insert(int entity_id, Vector2 pos) {
    int gx = (int)(pos.x / GRID_CELL_SIZE);
    int gy = (int)(pos.y / GRID_CELL_SIZE);
    if (gx < 0 || gx >= GRID_WIDTH || gy < 0 || gy >= GRID_HEIGHT) return;

    GridCell *cell = &grid[gx][gy];
    if (cell->count < MAX_PER_CELL) {
        cell->entity_ids[cell->count++] = entity_id;
    }
}

// Query: get all entity IDs in the same cell (and neighbors)
// Then run CheckCollisionRecs only against those entities
```

---

## When to Use a Physics Library

Raylib's built-in functions handle collision *detection* but not *simulation* — no rigid bodies, no joints, no continuous collision, no friction/restitution. Reach for a library when you need:

| Need | Library | Notes |
|------|---------|-------|
| Rigid body 2D physics | [Chipmunk2D](https://chipmunk-physics.net/) | C library, plays well with raylib |
| Educational 2D physics | [ferox](https://github.com/jdeokkim/ferox) | C, explicitly designed for use with raylib |
| Full-featured 2D/3D | [Box2D](https://box2d.org/) (v3.x) | C API in v3, major rewrite |
| 3D physics | [Jolt Physics](https://github.com/jrouwe/JoltPhysics) | C++, high performance |

### Integrating a Physics Library with Raylib

The pattern is always the same:

1. **Init:** Create the physics world alongside `InitWindow()`
2. **Update:** Step the physics simulation in your game loop (use `GetFrameTime()` for delta)
3. **Sync:** Copy physics body positions → your game object positions
4. **Draw:** Draw with raylib using the synced positions
5. **Cleanup:** Destroy the physics world alongside `CloseWindow()`

```c
// Pseudocode for physics integration
InitWindow(800, 600, "Physics Game");
PhysicsWorld *world = create_physics_world(gravity);

while (!WindowShouldClose()) {
    float dt = GetFrameTime();
    step_physics(world, dt);

    // Sync: read positions from physics bodies
    for (int i = 0; i < entity_count; i++) {
        entities[i].pos = get_body_position(world, entities[i].body);
        entities[i].rotation = get_body_rotation(world, entities[i].body);
    }

    BeginDrawing();
    ClearBackground(RAYWHITE);
    // Draw entities at their physics positions
    EndDrawing();
}

destroy_physics_world(world);
CloseWindow();
```

---

## Common Mistakes

**Checking collision after drawing, not after moving.** Always: move → collide → resolve → draw. If you draw first, you'll see one frame of overlap.

**Forgetting to resolve both axes separately.** If you move X and Y simultaneously, then resolve, you can get stuck on corners. Move X → resolve X → move Y → resolve Y.

**Using `GetFrameTime()` directly as velocity.** `GetFrameTime()` returns seconds (e.g., 0.016). Multiply by your speed in pixels-per-second: `pos.x += speed * GetFrameTime()`.

**Not clamping to world bounds.** After collision resolution, check that entities haven't been pushed outside the play area.
