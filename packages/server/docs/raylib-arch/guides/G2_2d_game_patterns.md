# G2 — Raylib 2D Game Patterns

> **Category:** guide · **Engine:** Raylib · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Getting Started](G1_getting_started.md) · [Audio & Input Reference](../reference/R2_audio_and_input.md) · [Language Bindings](../reference/R1_language_bindings.md)

This guide covers common 2D game development patterns in raylib: sprite animation, Camera2D, tilemap rendering, and screen management. All examples use C with raylib 5.x.

---

## Sprite Sheet Animation

Raylib has no built-in animation system. You implement sprite animation by selecting the right source rectangle from a sprite sheet each frame. This is simple and gives you full control.

### Loading and Drawing a Single Frame

```c
// Load a sprite sheet (e.g., 6 frames in a row, each 64×64 pixels)
Texture2D sheet = LoadTexture("resources/player_run.png");

int frame_width  = 64;
int frame_height = 64;
int total_frames = 6;
int current_frame = 0;

// Source rectangle: which part of the sheet to draw
Rectangle source = {
    .x = current_frame * frame_width,
    .y = 0,
    .width = frame_width,
    .height = frame_height
};

// Destination rectangle: where and how big to draw on screen
Rectangle dest = {
    .x = player.x,
    .y = player.y,
    .width = frame_width * 2,   // 2x scale
    .height = frame_height * 2
};

// Origin for rotation (relative to dest), rotation angle
Vector2 origin = { 0, 0 };
DrawTexturePro(sheet, source, dest, origin, 0.0f, WHITE);
```

### Frame Advancement with Timing

Don't advance frames every game frame — tie animation to elapsed time:

```c
typedef struct {
    Texture2D sheet;
    int frame_width;
    int frame_height;
    int frame_count;
    int current_frame;
    float frame_time;      // seconds per frame
    float elapsed;
    bool looping;
} SpriteAnim;

void SpriteAnim_Update(SpriteAnim *anim, float dt) {
    anim->elapsed += dt;
    if (anim->elapsed >= anim->frame_time) {
        anim->elapsed -= anim->frame_time;
        anim->current_frame++;
        if (anim->current_frame >= anim->frame_count) {
            anim->current_frame = anim->looping ? 0 : anim->frame_count - 1;
        }
    }
}

void SpriteAnim_Draw(SpriteAnim *anim, Vector2 pos, float scale, bool flip_x) {
    float w = anim->frame_width;
    float h = anim->frame_height;

    Rectangle source = {
        .x = anim->current_frame * w,
        .y = 0,
        .width = flip_x ? -w : w,   // negative width = horizontal flip
        .height = h
    };

    Rectangle dest = {
        .x = pos.x,
        .y = pos.y,
        .width = w * scale,
        .height = h * scale
    };

    DrawTexturePro(anim->sheet, source, dest, (Vector2){0, 0}, 0.0f, WHITE);
}
```

**Key pattern:** Use negative `source.width` to flip a sprite horizontally, negative `source.height` to flip vertically. This is the idiomatic way to mirror sprites in raylib without separate textures.

### Grid-Based Sprite Sheets

For sheets organized in a grid (rows and columns):

```c
int cols = sheet.width / frame_width;

int col = current_frame % cols;
int row = current_frame / cols;

Rectangle source = {
    .x = col * frame_width,
    .y = row * frame_height,
    .width = frame_width,
    .height = frame_height
};
```

---

## Camera2D

Raylib's `Camera2D` transforms all draw calls between `BeginMode2D()` and `EndMode2D()`. It handles scrolling, zoom, and rotation with no manual matrix math.

### Basic Setup

```c
Camera2D camera = {
    .target = { player.x, player.y },   // world position the camera looks at
    .offset = { screenWidth/2.0f, screenHeight/2.0f },  // screen position of the target
    .rotation = 0.0f,
    .zoom = 1.0f
};
```

- **target** — The point in world space the camera follows.
- **offset** — Where on the screen that target appears. Setting it to the screen center keeps the player centered.
- **zoom** — Scale factor. 2.0 = 2x zoom in, 0.5 = zoomed out.

### Drawing with the Camera

```c
BeginDrawing();
    ClearBackground(SKYBLUE);

    BeginMode2D(camera);
        // Everything here is in world coordinates
        DrawTilemap(&tilemap);
        DrawPlayer(&player);
        DrawEnemies(enemies, enemy_count);
    EndMode2D();

    // Everything here is in screen coordinates (HUD, UI)
    DrawText(TextFormat("HP: %d", player.hp), 10, 10, 20, WHITE);
    DrawFPS(10, 40);

EndDrawing();
```

### Smooth Camera Follow

Snapping the camera to the player every frame feels jittery. Use lerp for smooth following:

```c
void UpdateCamera_Smooth(Camera2D *camera, Vector2 target, float dt) {
    float lerp_speed = 5.0f;  // higher = snappier
    camera->target.x += (target.x - camera->target.x) * lerp_speed * dt;
    camera->target.y += (target.y - camera->target.y) * lerp_speed * dt;
}
```

### Camera Bounds Clamping

Prevent the camera from showing areas outside the level:

```c
void ClampCamera(Camera2D *camera, float level_width, float level_height,
                 float screen_width, float screen_height) {
    float half_w = screen_width  / (2.0f * camera->zoom);
    float half_h = screen_height / (2.0f * camera->zoom);

    if (camera->target.x - half_w < 0)            camera->target.x = half_w;
    if (camera->target.y - half_h < 0)            camera->target.y = half_h;
    if (camera->target.x + half_w > level_width)  camera->target.x = level_width - half_w;
    if (camera->target.y + half_h > level_height) camera->target.y = level_height - half_h;
}
```

### Screen-to-World Conversion

Convert mouse clicks to world coordinates (essential for strategy games, level editors):

```c
Vector2 world_pos = GetScreenToWorld2D(GetMousePosition(), camera);
```

---

## Tilemap Rendering

Raylib does not include a tilemap system. You build one from arrays and `DrawTexturePro`. Many developers use **Tiled** (mapeditor.org) to design levels and export as JSON or CSV.

### Simple Tilemap from Array

```c
#define MAP_WIDTH  20
#define MAP_HEIGHT 15
#define TILE_SIZE  32

int tilemap[MAP_HEIGHT][MAP_WIDTH] = {
    {1, 1, 1, 1, 1, /*...*/},
    {1, 0, 0, 0, 1, /*...*/},
    // ...
};

Texture2D tileset = LoadTexture("resources/tileset.png");
int tileset_cols = tileset.width / TILE_SIZE;

void DrawTilemap(void) {
    for (int y = 0; y < MAP_HEIGHT; y++) {
        for (int x = 0; x < MAP_WIDTH; x++) {
            int tile_id = tilemap[y][x];
            if (tile_id == 0) continue;  // 0 = empty/air

            // Calculate source rect from tile ID
            int col = (tile_id - 1) % tileset_cols;
            int row = (tile_id - 1) / tileset_cols;

            Rectangle src = { col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE };
            Vector2 pos = { x * TILE_SIZE, y * TILE_SIZE };

            DrawTextureRec(tileset, src, pos, WHITE);
        }
    }
}
```

### Culling Off-Screen Tiles

For large maps, only draw tiles visible to the camera. This is critical for performance:

```c
void DrawTilemap_Culled(Camera2D camera, int screen_width, int screen_height) {
    // Calculate visible tile range from camera
    float half_w = screen_width  / (2.0f * camera.zoom);
    float half_h = screen_height / (2.0f * camera.zoom);

    int start_x = (int)((camera.target.x - half_w) / TILE_SIZE) - 1;
    int start_y = (int)((camera.target.y - half_h) / TILE_SIZE) - 1;
    int end_x   = (int)((camera.target.x + half_w) / TILE_SIZE) + 2;
    int end_y   = (int)((camera.target.y + half_h) / TILE_SIZE) + 2;

    // Clamp to map bounds
    if (start_x < 0) start_x = 0;
    if (start_y < 0) start_y = 0;
    if (end_x > MAP_WIDTH)  end_x = MAP_WIDTH;
    if (end_y > MAP_HEIGHT) end_y = MAP_HEIGHT;

    for (int y = start_y; y < end_y; y++) {
        for (int x = start_x; x < end_x; x++) {
            int tile_id = tilemap[y][x];
            if (tile_id == 0) continue;

            int col = (tile_id - 1) % tileset_cols;
            int row = (tile_id - 1) / tileset_cols;
            Rectangle src = { col * TILE_SIZE, row * TILE_SIZE, TILE_SIZE, TILE_SIZE };
            Vector2 pos = { x * TILE_SIZE, y * TILE_SIZE };
            DrawTextureRec(tileset, src, pos, WHITE);
        }
    }
}
```

### Parallax Scrolling

Create depth with multiple background layers moving at different speeds:

```c
typedef struct {
    Texture2D texture;
    float scroll_factor;  // 0.0 = static, 1.0 = moves with camera, 0.5 = half speed
} ParallaxLayer;

void DrawParallax(ParallaxLayer *layers, int count, Camera2D camera) {
    for (int i = 0; i < count; i++) {
        float offset_x = camera.target.x * layers[i].scroll_factor;
        float tex_w = layers[i].texture.width;

        // Tile the texture horizontally, offset by scroll
        float start_x = fmodf(-offset_x, tex_w);
        if (start_x > 0) start_x -= tex_w;

        for (float x = start_x; x < camera.target.x + GetScreenWidth(); x += tex_w) {
            DrawTexture(layers[i].texture, (int)x, 0, WHITE);
        }
    }
}
```

---

## Screen Management

Games need multiple screens (title, gameplay, pause, game over). A simple function-pointer pattern works well in C:

```c
typedef enum { SCREEN_TITLE, SCREEN_GAMEPLAY, SCREEN_GAMEOVER } Screen;

Screen current_screen = SCREEN_TITLE;

void UpdateTitle(void) {
    if (IsKeyPressed(KEY_ENTER)) current_screen = SCREEN_GAMEPLAY;
}

void UpdateGameplay(void) {
    // ... game logic ...
    if (player.hp <= 0) current_screen = SCREEN_GAMEOVER;
}

void UpdateGameOver(void) {
    if (IsKeyPressed(KEY_ENTER)) {
        ResetGame();
        current_screen = SCREEN_TITLE;
    }
}

// In main loop:
switch (current_screen) {
    case SCREEN_TITLE:    UpdateTitle();    break;
    case SCREEN_GAMEPLAY: UpdateGameplay(); break;
    case SCREEN_GAMEOVER: UpdateGameOver(); break;
}
// Same pattern for Draw functions
```

For larger projects, use a struct with function pointers for each screen's init/update/draw/unload, forming a lightweight state machine.

---

## Performance Tips for 2D

1. **Batch draw calls** — Raylib batches consecutive `DrawTexture*` calls using the same texture automatically. Minimize texture switches by drawing all sprites from the same sheet together.
2. **Cull off-screen objects** — Don't draw what the camera can't see. Check `CheckCollisionRecs()` against the camera viewport.
3. **Use RenderTexture2D** for static backgrounds — Render complex backgrounds to a texture once, then draw the single texture each frame.
4. **Avoid LoadTexture in loops** — Load all assets at startup or level load. `LoadTexture` hits the disk and GPU every call.
5. **Profile with GetFPS()** — Quick and always available. Target 60 FPS; investigate any frame that takes longer than 16.6ms.
