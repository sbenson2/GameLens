# G3 — Raylib 3D Basics Guide

> **Category:** guide · **Engine:** Raylib · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Getting Started](../guides/G1_getting_started.md) · [2D Game Patterns](../guides/G2_2d_game_patterns.md) · [Language Bindings](../reference/R1_language_bindings.md)

Raylib makes 3D surprisingly approachable. The same simplicity that defines its 2D API extends to 3D — a camera, a `BeginMode3D`/`EndMode3D` block, and a handful of draw calls is all you need to render a 3D scene. This guide covers the camera system, primitive rendering, model loading, basic lighting, and collision detection.

---

## Camera System

### Camera3D Setup

Every 3D scene needs a `Camera3D` that defines the viewpoint:

```c
Camera3D camera = { 0 };
camera.position = (Vector3){ 10.0f, 10.0f, 10.0f };  // Where the camera is
camera.target = (Vector3){ 0.0f, 0.0f, 0.0f };        // What it looks at
camera.up = (Vector3){ 0.0f, 1.0f, 0.0f };             // Which direction is "up"
camera.fovy = 45.0f;                                     // Field of view (degrees)
camera.projection = CAMERA_PERSPECTIVE;                   // or CAMERA_ORTHOGRAPHIC
```

### Projection Types

| Projection | Effect | Typical Use |
|------------|--------|-------------|
| `CAMERA_PERSPECTIVE` | Objects shrink with distance (realistic) | Most 3D games |
| `CAMERA_ORTHOGRAPHIC` | No depth scaling (flat projection) | Isometric games, level editors, UI overlays |

### Built-In Camera Controls

Raylib provides `UpdateCamera()` with preset modes so you can prototype immediately without writing camera code:

```c
// In your game loop:
UpdateCamera(&camera, CAMERA_ORBITAL);   // Orbits around target (great for inspection)
// Other modes:
// CAMERA_FREE          — WASD + mouse look (fly-cam)
// CAMERA_FIRST_PERSON  — FPS-style, locked to ground plane
// CAMERA_THIRD_PERSON  — Follows behind a target position
// CAMERA_ORBITAL       — Rotates around target, zoom with scroll
```

For a custom camera, skip `UpdateCamera` and manipulate `camera.position` / `camera.target` directly each frame.

---

## Rendering 3D Scenes

### The BeginMode3D / EndMode3D Block

All 3D draw calls must be wrapped between `BeginMode3D` and `EndMode3D`. You can mix 2D and 3D in the same frame:

```c
BeginDrawing();
    ClearBackground(RAYWHITE);

    // --- 3D rendering ---
    BeginMode3D(camera);
        DrawCube((Vector3){ 0, 1, 0 }, 2.0f, 2.0f, 2.0f, RED);
        DrawGrid(10, 1.0f);   // Reference grid on the XZ plane
    EndMode3D();

    // --- 2D overlay (HUD, UI) ---
    DrawText("Hello 3D!", 10, 10, 20, DARKGRAY);
    DrawFPS(10, 40);

EndDrawing();
```

### 3D Primitive Shapes

Raylib provides immediate-mode draw functions for common shapes. No meshes or buffers to manage:

| Function | What It Draws |
|----------|---------------|
| `DrawCube(pos, w, h, d, color)` | Solid box |
| `DrawCubeWires(pos, w, h, d, color)` | Wireframe box |
| `DrawSphere(pos, radius, color)` | Solid sphere |
| `DrawSphereWires(pos, radius, rings, slices, color)` | Wireframe sphere |
| `DrawCylinder(pos, radiusTop, radiusBot, h, slices, color)` | Cylinder / cone |
| `DrawPlane(pos, size, color)` | Flat plane |
| `DrawGrid(slices, spacing)` | Reference grid |
| `DrawLine3D(start, end, color)` | Line segment |
| `DrawPoint3D(pos, color)` | Single point |

These are perfect for prototyping and debug visualization. For production, you'll load models.

---

## Loading and Drawing 3D Models

### Supported Formats

Raylib's `LoadModel()` supports several common formats out of the box:

| Format | Extension | Notes |
|--------|-----------|-------|
| OBJ | `.obj` | Wavefront OBJ — widely supported, no animation |
| glTF | `.gltf` / `.glb` | Modern standard — supports materials, animations, skeletons |
| IQM | `.iqm` | Inter-Quake Model — lightweight, skeletal animation |
| M3D | `.m3d` | Model 3D — compact single-file format with animation |
| VOX | `.vox` | MagicaVoxel — voxel models |

### Basic Model Loading

```c
// Load a model (mesh + materials) from file
Model model = LoadModel("resources/castle.obj");

// Optionally override the default texture
Texture2D texture = LoadTexture("resources/castle_diffuse.png");
model.materials[0].maps[MATERIAL_MAP_DIFFUSE].texture = texture;

// In your draw loop:
BeginMode3D(camera);
    DrawModel(model, (Vector3){ 0, 0, 0 }, 1.0f, WHITE);
    //                 position             scale  tint
EndMode3D();

// Cleanup when done
UnloadModel(model);
UnloadTexture(texture);
```

### Model Transformations

For rotation and non-uniform scaling, use `DrawModelEx`:

```c
DrawModelEx(
    model,
    (Vector3){ 0, 0, 0 },           // position
    (Vector3){ 0, 1, 0 },           // rotation axis
    45.0f,                            // rotation angle (degrees)
    (Vector3){ 1.0f, 2.0f, 1.0f },  // scale per axis
    WHITE                             // tint
);
```

### Skeletal Animation

For animated models (glTF, IQM, M3D), load and play animations:

```c
int anim_count = 0;
ModelAnimation *anims = LoadModelAnimations("resources/character.glb", &anim_count);

int current_anim = 0;
int current_frame = 0;

// In your update loop:
current_frame++;
UpdateModelAnimation(model, anims[current_anim], current_frame);

// Check if animation has looped
if (current_frame >= anims[current_anim].frameCount) {
    current_frame = 0;
}

// Cleanup
UnloadModelAnimations(anims, anim_count);
```

---

## Basic Lighting

Raylib includes a simple shader-based lighting system. It's not a full deferred renderer, but it handles common cases well.

### Setting Up Lights

Raylib's examples include a `rlights.h` helper (in `examples/shaders/rlights.h`) that makes lighting easy:

```c
#include "rlights.h"

// Load the lighting shader
Shader shader = LoadShader("resources/lighting.vs", "resources/lighting.fs");

// Set the shader's ambient light value
int ambientLoc = GetShaderLocation(shader, "ambient");
float ambient[4] = { 0.1f, 0.1f, 0.1f, 1.0f };
SetShaderValue(shader, ambientLoc, ambient, SHADER_UNIFORM_VEC4);

// Create lights (max 4 with the default shader)
Light lights[MAX_LIGHTS];
lights[0] = CreateLight(LIGHT_POINT,
    (Vector3){ -2, 1, -2 },    // position
    Vector3Zero(),               // target (unused for point lights)
    YELLOW,                      // color
    shader
);

// Apply the shader to your model
model.materials[0].shader = shader;
```

### Light Types

| Type | Behavior |
|------|----------|
| `LIGHT_DIRECTIONAL` | Parallel rays from a direction (sunlight) |
| `LIGHT_POINT` | Radiates from a position in all directions |

---

## Collision Detection

Raylib includes built-in 3D collision functions that cover common gameplay needs:

### Bounding Box Collisions

```c
// Get the bounding box of a model (axis-aligned)
BoundingBox box_a = GetModelBoundingBox(model_a);
BoundingBox box_b = GetModelBoundingBox(model_b);

// Offset bounding boxes to world positions
box_a.min = Vector3Add(box_a.min, pos_a);
box_a.max = Vector3Add(box_a.max, pos_a);
box_b.min = Vector3Add(box_b.min, pos_b);
box_b.max = Vector3Add(box_b.max, pos_b);

if (CheckCollisionBoxes(box_a, box_b)) {
    // Objects are overlapping
}
```

### Ray Casting (Mouse Picking)

```c
// Cast a ray from the mouse position into the 3D scene
Ray ray = GetScreenToWorldRay(GetMousePosition(), camera);

// Check against a bounding box
RayCollision hit = GetRayCollisionBox(ray, target_box);
if (hit.hit) {
    // hit.distance — how far along the ray
    // hit.point   — exact world-space intersection point
    // hit.normal  — surface normal at the hit point
}

// Also available:
// GetRayCollisionSphere(ray, center, radius)
// GetRayCollisionMesh(ray, mesh, transform)    — per-triangle, slower
// GetRayCollisionTriangle(ray, v1, v2, v3)
```

### Other Collision Checks

| Function | Tests |
|----------|-------|
| `CheckCollisionSpheres()` | Sphere vs sphere |
| `CheckCollisionBoxSphere()` | Box vs sphere |
| `CheckCollisionBoxes()` | Box vs box (AABB) |
| `GetRayCollisionMesh()` | Ray vs mesh triangles (precise but slow) |

---

## Putting It Together: Minimal 3D Game Loop

```c
#include "raylib.h"

int main(void) {
    InitWindow(1280, 720, "Raylib 3D Demo");
    SetTargetFPS(60);

    // Camera setup
    Camera3D camera = { 0 };
    camera.position = (Vector3){ 10.0f, 10.0f, 10.0f };
    camera.target = (Vector3){ 0.0f, 0.0f, 0.0f };
    camera.up = (Vector3){ 0.0f, 1.0f, 0.0f };
    camera.fovy = 45.0f;
    camera.projection = CAMERA_PERSPECTIVE;

    // Load a model
    Model model = LoadModel("resources/turret.obj");
    Vector3 model_pos = { 0.0f, 0.0f, 0.0f };

    while (!WindowShouldClose()) {
        // Update
        UpdateCamera(&camera, CAMERA_ORBITAL);

        // Mouse picking
        if (IsMouseButtonPressed(MOUSE_BUTTON_LEFT)) {
            Ray ray = GetScreenToWorldRay(GetMousePosition(), camera);
            BoundingBox box = GetModelBoundingBox(model);
            box.min = Vector3Add(box.min, model_pos);
            box.max = Vector3Add(box.max, model_pos);
            RayCollision hit = GetRayCollisionBox(ray, box);
            if (hit.hit) {
                TraceLog(LOG_INFO, "Model clicked at distance %.2f", hit.distance);
            }
        }

        // Draw
        BeginDrawing();
            ClearBackground(RAYWHITE);
            BeginMode3D(camera);
                DrawModel(model, model_pos, 1.0f, WHITE);
                DrawGrid(10, 1.0f);
            EndMode3D();
            DrawText("Left-click the model!", 10, 10, 20, DARKGRAY);
            DrawFPS(10, 40);
        EndDrawing();
    }

    UnloadModel(model);
    CloseWindow();
    return 0;
}
```

---

## Tips and Gotchas

**Coordinate system:** Raylib uses a right-handed Y-up coordinate system. Y is up, X is right, Z points toward the camera. This matches OpenGL conventions and most modeling tools (Blender default export).

**Draw order doesn't matter for opaque geometry** — the GPU depth buffer handles it. But for transparent objects, draw them back-to-front after all opaque geometry.

**`DrawModel` tint is a multiplier**, not a replacement. Pass `WHITE` for the original texture colors. Pass a color like `RED` to tint the entire model red.

**Meshes are GPU-uploaded on `LoadModel`** — the CPU-side mesh data is still available for collision detection via `GetRayCollisionMesh()`. Call `UnloadModel()` to free both.

**glTF is the recommended format** for new projects. It supports PBR materials, skeletal animation, and is well-supported by Blender, and the Raylib loader handles `.glb` (binary) and `.gltf` (JSON + separate files).
