# G7 — Game State Management and ECS Patterns

> **Category:** guide · **Engine:** Raylib · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [2D Game Patterns](G2_2d_game_patterns.md) · [Getting Started](G1_getting_started.md) · [Raylib Rules](../raylib-arch-rules.md)

Raylib provides no built-in state management, scene system, or ECS. This is by design — raylib is a rendering and input library, not a framework. This guide covers the patterns you need to build structured games on top of raylib: state machines, scene management, and Entity Component Systems.

---

## Pattern 1: Game State Machine

The simplest pattern for small-to-medium games. A state enum controls which update/draw functions run each frame.

### Minimal Implementation

```c
#include "raylib.h"

typedef enum {
    STATE_MENU,
    STATE_PLAYING,
    STATE_PAUSED,
    STATE_GAMEOVER,
} GameState;

typedef struct {
    GameState state;
    int score;
    float player_x, player_y;
    // ... game data
} Game;

void update_menu(Game *game) {
    if (IsKeyPressed(KEY_ENTER)) {
        game->state = STATE_PLAYING;
        game->score = 0;
        game->player_x = 400.0f;
        game->player_y = 300.0f;
    }
}

void update_playing(Game *game) {
    // Player movement
    if (IsKeyDown(KEY_RIGHT)) game->player_x += 200.0f * GetFrameTime();
    if (IsKeyDown(KEY_LEFT))  game->player_x -= 200.0f * GetFrameTime();

    if (IsKeyPressed(KEY_ESCAPE)) game->state = STATE_PAUSED;
}

void update_paused(Game *game) {
    if (IsKeyPressed(KEY_ESCAPE)) game->state = STATE_PLAYING;
    if (IsKeyPressed(KEY_Q))      game->state = STATE_MENU;
}

void draw_menu(Game *game) {
    DrawText("PRESS ENTER TO START", 200, 280, 30, WHITE);
}

void draw_playing(Game *game) {
    DrawCircle((int)game->player_x, (int)game->player_y, 20, RED);
    DrawText(TextFormat("Score: %d", game->score), 10, 10, 20, WHITE);
}

void draw_paused(Game *game) {
    draw_playing(game);  // draw game underneath
    DrawRectangle(0, 0, 800, 600, (Color){0, 0, 0, 128});
    DrawText("PAUSED", 340, 260, 40, WHITE);
}

int main(void) {
    InitWindow(800, 600, "State Machine Example");
    SetTargetFPS(60);

    Game game = { .state = STATE_MENU };

    while (!WindowShouldClose()) {
        // Update based on current state
        switch (game.state) {
            case STATE_MENU:     update_menu(&game);    break;
            case STATE_PLAYING:  update_playing(&game);  break;
            case STATE_PAUSED:   update_paused(&game);   break;
            case STATE_GAMEOVER: /* ... */                break;
        }

        BeginDrawing();
        ClearBackground(BLACK);
        switch (game.state) {
            case STATE_MENU:     draw_menu(&game);      break;
            case STATE_PLAYING:  draw_playing(&game);    break;
            case STATE_PAUSED:   draw_paused(&game);     break;
            case STATE_GAMEOVER: /* ... */                break;
        }
        EndDrawing();
    }

    CloseWindow();
    return 0;
}
```

This pattern works well for games with fewer than ~5 states. Beyond that, the switch statements become unwieldy.

---

## Pattern 2: Scene System with Function Pointers

For larger games, encapsulate each scene (menu, gameplay, settings) behind a common interface using function pointers. This makes it easy to add new scenes without modifying the main loop.

```c
// scene.h
typedef struct Scene Scene;
struct Scene {
    void (*init)(Scene *self);
    void (*update)(Scene *self, float dt);
    void (*draw)(Scene *self);
    void (*cleanup)(Scene *self);
    void *data;  // scene-specific state
};

// scene_manager.h
typedef struct {
    Scene *current;
    Scene *next;       // pending transition
    bool transitioning;
} SceneManager;

void scene_manager_update(SceneManager *mgr, float dt) {
    if (mgr->next) {
        if (mgr->current && mgr->current->cleanup) {
            mgr->current->cleanup(mgr->current);
        }
        mgr->current = mgr->next;
        mgr->next = NULL;
        if (mgr->current->init) {
            mgr->current->init(mgr->current);
        }
    }
    if (mgr->current && mgr->current->update) {
        mgr->current->update(mgr->current, dt);
    }
}

void scene_manager_draw(SceneManager *mgr) {
    if (mgr->current && mgr->current->draw) {
        mgr->current->draw(mgr->current);
    }
}

void scene_manager_switch(SceneManager *mgr, Scene *next) {
    mgr->next = next;
}
```

### Implementing a Scene

```c
// gameplay_scene.c
typedef struct {
    float player_x, player_y;
    int score;
} GameplayData;

static void gameplay_init(Scene *self) {
    GameplayData *data = MemAlloc(sizeof(GameplayData));
    data->player_x = 400.0f;
    data->player_y = 300.0f;
    data->score = 0;
    self->data = data;
}

static void gameplay_update(Scene *self, float dt) {
    GameplayData *d = self->data;
    if (IsKeyDown(KEY_RIGHT)) d->player_x += 200.0f * dt;
    if (IsKeyDown(KEY_LEFT))  d->player_x -= 200.0f * dt;
}

static void gameplay_draw(Scene *self) {
    GameplayData *d = self->data;
    DrawCircle((int)d->player_x, (int)d->player_y, 20, RED);
    DrawText(TextFormat("Score: %d", d->score), 10, 10, 20, WHITE);
}

static void gameplay_cleanup(Scene *self) {
    MemFree(self->data);
    self->data = NULL;
}

Scene gameplay_scene = {
    .init    = gameplay_init,
    .update  = gameplay_update,
    .draw    = gameplay_draw,
    .cleanup = gameplay_cleanup,
};
```

---

## Pattern 3: Entity Component System (ECS)

For games with many interacting objects (enemies, projectiles, pickups), ECS separates data from logic and enables composition over inheritance. Raylib pairs well with external ECS libraries.

### When to Use ECS

Use ECS when your game has: many entity types that share some but not all behaviors, performance-sensitive entity iteration (hundreds to thousands of objects), or systems that operate on specific combinations of data. For a simple platformer with a player and 20 enemies, a state machine or scene system is probably enough.

### Option A: DIY Minimal ECS (C)

A lightweight approach using parallel arrays. Each component type gets its own array indexed by entity ID, with a bitmask tracking which components an entity has.

```c
#include "raylib.h"
#include <string.h>

#define MAX_ENTITIES 1024

// Component flags
typedef enum {
    COMP_POSITION = 1 << 0,
    COMP_VELOCITY = 1 << 1,
    COMP_SPRITE   = 1 << 2,
    COMP_HEALTH   = 1 << 3,
} ComponentFlag;

// Component data arrays (Structure of Arrays layout)
typedef struct { float x, y; }       Position;
typedef struct { float vx, vy; }     Velocity;
typedef struct { Texture2D tex; Rectangle src; } Sprite;
typedef struct { int current, max; } Health;

typedef struct {
    unsigned int flags[MAX_ENTITIES];  // bitmask per entity
    Position position[MAX_ENTITIES];
    Velocity velocity[MAX_ENTITIES];
    Sprite   sprite[MAX_ENTITIES];
    Health   health[MAX_ENTITIES];
    int count;                         // next available entity ID
} World;

// Create an entity — returns its ID
int entity_create(World *w) {
    int id = w->count++;
    w->flags[id] = 0;
    return id;
}

// Add a component to an entity
void entity_add_position(World *w, int id, float x, float y) {
    w->position[id] = (Position){ x, y };
    w->flags[id] |= COMP_POSITION;
}

void entity_add_velocity(World *w, int id, float vx, float vy) {
    w->velocity[id] = (Velocity){ vx, vy };
    w->flags[id] |= COMP_VELOCITY;
}

// System: move all entities that have position + velocity
void system_movement(World *w, float dt) {
    unsigned int required = COMP_POSITION | COMP_VELOCITY;
    for (int i = 0; i < w->count; i++) {
        if ((w->flags[i] & required) == required) {
            w->position[i].x += w->velocity[i].vx * dt;
            w->position[i].y += w->velocity[i].vy * dt;
        }
    }
}

// System: draw all entities with position + sprite
void system_render(World *w) {
    unsigned int required = COMP_POSITION | COMP_SPRITE;
    for (int i = 0; i < w->count; i++) {
        if ((w->flags[i] & required) == required) {
            DrawTextureRec(
                w->sprite[i].tex,
                w->sprite[i].src,
                (Vector2){ w->position[i].x, w->position[i].y },
                WHITE
            );
        }
    }
}
```

This DIY approach works for up to ~1000 entities. Beyond that, consider a dedicated ECS library for cache-friendly storage and query optimization.

### Option B: Flecs (Recommended Library)

[Flecs](https://www.flecs.dev/) is a fast, full-featured ECS written in C/C++ that integrates cleanly with raylib. It supports single-header inclusion, compiles to WASM, and provides modules, pipelines, and a built-in REST API for debugging.

```c
// main.c — Raylib + Flecs integration
#include "raylib.h"
#include "flecs.h"

// Components are plain structs
typedef struct { float x, y; } Position;
typedef struct { float vx, vy; } Velocity;
typedef struct { Color color; float radius; } Circle;

// System: movement
void MoveSystem(ecs_iter_t *it) {
    Position *p = ecs_field(it, Position, 0);
    Velocity *v = ecs_field(it, Velocity, 1);

    for (int i = 0; i < it->count; i++) {
        p[i].x += v[i].vx * it->delta_time;
        p[i].y += v[i].vy * it->delta_time;
    }
}

// System: rendering (runs in a separate pipeline phase)
void DrawSystem(ecs_iter_t *it) {
    Position *p = ecs_field(it, Position, 0);
    Circle *c = ecs_field(it, Circle, 1);

    for (int i = 0; i < it->count; i++) {
        DrawCircle((int)p[i].x, (int)p[i].y, c[i].radius, c[i].color);
    }
}

int main(void) {
    InitWindow(800, 600, "Raylib + Flecs");
    SetTargetFPS(60);

    ecs_world_t *world = ecs_init();

    // Register components
    ECS_COMPONENT(world, Position);
    ECS_COMPONENT(world, Velocity);
    ECS_COMPONENT(world, Circle);

    // Register systems
    ECS_SYSTEM(world, MoveSystem, EcsOnUpdate, Position, Velocity);
    ECS_SYSTEM(world, DrawSystem, EcsOnStore, Position, Circle);

    // Create some entities
    for (int i = 0; i < 100; i++) {
        ecs_entity_t e = ecs_new(world);
        ecs_set(world, e, Position, {
            .x = GetRandomValue(50, 750),
            .y = GetRandomValue(50, 550)
        });
        ecs_set(world, e, Velocity, {
            .vx = GetRandomValue(-100, 100),
            .vy = GetRandomValue(-100, 100)
        });
        ecs_set(world, e, Circle, {
            .color = (Color){ GetRandomValue(50,255), GetRandomValue(50,255), GetRandomValue(50,255), 255 },
            .radius = (float)GetRandomValue(5, 15)
        });
    }

    while (!WindowShouldClose()) {
        ecs_progress(world, GetFrameTime());  // runs all systems

        BeginDrawing();
        ClearBackground(BLACK);
        ecs_run(world, ecs_id(DrawSystem), GetFrameTime(), NULL);
        EndDrawing();
    }

    ecs_fini(world);
    CloseWindow();
    return 0;
}
```

### Flecs Setup

Add flecs to your project:

```bash
# Single-header: download flecs.h and flecs.c
curl -O https://raw.githubusercontent.com/SanderMertens/flecs/master/flecs.h
curl -O https://raw.githubusercontent.com/SanderMertens/flecs/master/flecs.c

# Or via CMake FetchContent
```

Add `flecs.c` to your build alongside your game source files.

### Other ECS Libraries Compatible with Raylib

| Library | Language | Notes |
|---|---|---|
| [Flecs](https://www.flecs.dev/) | C/C++ | Full-featured, best documentation, WASM support |
| [simple_ecs](https://github.com/raylib-extras/simple_ecs) | C | Raylib-specific, minimal API, good for learning |
| [ECSlib](https://github.com/firststef/ECSlib) | C++ | Raylib-focused, template-based |
| [EnTT](https://github.com/skypjack/entt) | C++ | Header-only, very fast, large ecosystem |

---

## Choosing the Right Pattern

| Game Complexity | Recommended Pattern | Why |
|---|---|---|
| Game jam, prototype | State machine | Fastest to implement, minimal boilerplate |
| Single-genre game (platformer, shooter) | Scene system | Clean separation of menu/gameplay/settings |
| Many entity types, emergent behavior | ECS | Composition, performance, extensibility |
| Large project, team development | ECS + Scene system | Scenes manage high-level flow, ECS manages entities within scenes |

These patterns combine naturally. A common setup uses the scene system for top-level flow (main menu → gameplay → game over) while the gameplay scene internally uses an ECS for managing game entities.
