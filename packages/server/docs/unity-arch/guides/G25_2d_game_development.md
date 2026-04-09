# G25 — 2D Game Development in Unity 6

> **Category:** guide · **Engine:** Unity 6 (6000.x, 2D packages) · **Related:** [G3 Physics & Collision](G3_physics_and_collision.md) · [G7 Animation System](G7_animation_system.md) · [G10 Rendering Pipeline](G10_rendering_pipeline_urp_hdrp.md) · [Unity Rules](../unity-arch-rules.md)

Unity 6 provides a comprehensive 2D toolchain: Tilemap for grid-based levels, SpriteShape for organic terrain, 2D Physics with effectors for platformer mechanics, Sprite Atlas for draw-call optimization, 2D Renderer features in URP, and 2D Lights for dynamic lighting. This guide covers the full 2D workflow from project setup through advanced techniques.

---

## Project Setup for 2D

### Template Selection

```
// Unity Hub → New Project → "2D (URP)" template
// This pre-configures:
// - URP with 2D Renderer (not the 3D Forward Renderer)
// - Sprite import defaults
// - 2D Physics settings
// - Orthographic camera
//
// If starting from a 3D project, switch to 2D Renderer:
// 1. Create a 2D Renderer asset: Assets → Create → Rendering → URP 2D Renderer
// 2. Assign it in your URP Pipeline Asset → Renderer List
```

### Camera Setup

```csharp
using UnityEngine;

// 2D games use orthographic cameras.
// Camera.orthographicSize = half the vertical height in world units.
// A size of 5 means the camera shows 10 units vertically.

public class Camera2DSetup : MonoBehaviour
{
    [SerializeField] private float targetWorldHeight = 10f;

    void Start()
    {
        Camera cam = GetComponent<Camera>();
        cam.orthographic = true;
        cam.orthographicSize = targetWorldHeight / 2f;

        // For pixel-perfect rendering, match camera size to your art:
        // If your sprites are 16 PPU (pixels per unit) and you want
        // 320px visible height: orthographicSize = 320 / (16 * 2) = 10
    }
}
```

### Pixel Perfect Camera

```csharp
// Install: com.unity.2d.pixel-perfect
// Add the PixelPerfectCamera component to your Camera GameObject.
//
// Settings:
// - Assets Pixels Per Unit: match your sprite import PPU (e.g., 16)
// - Reference Resolution: your target pixel art resolution (e.g., 320×180)
// - Upscale Render Texture: On (renders at low res, upscales with nearest-neighbor)
// - Pixel Snapping: On (snaps sprite positions to pixel grid — prevents sub-pixel jitter)
//
// This prevents the blurry, shimmering artifacts common in pixel art games.
```

---

## Tilemap System

Tilemaps are Unity's grid-based level editor. They dramatically reduce scene file sizes (30K lines vs 370K for equivalent Sprite-based scenes), improve load times, and enable efficient collision generation.

### Architecture

```
┌─────────────────────────────────────────┐
│ Grid (GameObject)                        │
│  - Grid component (cell size, layout)    │
│                                          │
│  ├── Tilemap "Ground" (sorting order 0)  │
│  │    - TilemapRenderer                  │
│  │    - TilemapCollider2D (optional)     │
│  │                                       │
│  ├── Tilemap "Walls" (sorting order 1)   │
│  │    - TilemapRenderer                  │
│  │    - TilemapCollider2D                │
│  │    - CompositeCollider2D              │
│  │                                       │
│  └── Tilemap "Decoration" (sorting 2)    │
│       - TilemapRenderer (no collider)    │
└─────────────────────────────────────────┘
```

### Tile Types

```csharp
// Unity provides several built-in Tile types:

// --- Basic Tile ---
// Assets → Create → 2D → Tiles → Tile
// Assign a sprite. Simplest option for static tiles.

// --- Rule Tile ---
// Assets → Create → 2D → Tiles → Rule Tile
// Auto-selects sprite based on neighbor configuration.
// Perfect for terrain that needs corner/edge variants automatically.
// Define rules: "this neighbor exists → use this sprite"

// --- Animated Tile ---
// Assets → Create → 2D → Tiles → Animated Tile
// Cycles through sprites at a configurable speed.
// Great for water, lava, torches, conveyor belts.

// --- Weighted Random Tile ---
// Randomly picks from a set of sprites with weights.
// Good for floor variation without manual placement.

// --- Scriptable Tile (Custom) ---
// For game-specific behavior (damage tiles, teleporters):

using UnityEngine;
using UnityEngine.Tilemaps;

[CreateAssetMenu(menuName = "2D/Tiles/Damage Tile")]
public class DamageTile : TileBase
{
    public Sprite sprite;
    public float damagePerSecond = 10f;

    // Called when the Tilemap renders this tile
    public override void GetTileData(Vector3Int position,
        ITilemap tilemap, ref TileData tileData)
    {
        tileData.sprite = sprite;
        // Set collider type so physics can detect this tile
        tileData.colliderType = Tile.ColliderType.Grid;
    }
}
```

### Tilemap Colliders & Performance

```csharp
using UnityEngine;
using UnityEngine.Tilemaps;

// PROBLEM: TilemapCollider2D generates one collider shape PER TILE.
// A 100x100 tilemap = 10,000 individual collider shapes = slow physics.

// SOLUTION: Use CompositeCollider2D to merge adjacent colliders.

// Setup:
// 1. Add TilemapCollider2D to the Tilemap GameObject
// 2. Add Rigidbody2D (set Body Type = Static)
// 3. Add CompositeCollider2D
// 4. On TilemapCollider2D, check "Used By Composite"
//
// The CompositeCollider2D merges all tile colliders into a minimal
// set of polygon outlines — thousands of tiles become a few polygons.

// Geometry Type options on CompositeCollider2D:
// - Polygons: filled shapes (use for solid ground/walls)
// - Outlines: hollow edges (use for platforms you can enter from below)
```

### Painting Tilemaps from Code

```csharp
using UnityEngine;
using UnityEngine.Tilemaps;

public class TilemapGenerator : MonoBehaviour
{
    [SerializeField] private Tilemap groundTilemap;
    [SerializeField] private TileBase grassTile;
    [SerializeField] private TileBase dirtTile;

    public void GenerateLevel(int width, int height)
    {
        // Clear existing tiles
        groundTilemap.ClearAllTiles();

        for (int x = 0; x < width; x++)
        {
            // Simple terrain: top layer is grass, below is dirt
            int terrainHeight = Mathf.FloorToInt(
                Mathf.PerlinNoise(x * 0.1f, 0f) * 5f + 5f);

            for (int y = 0; y < terrainHeight; y++)
            {
                Vector3Int pos = new Vector3Int(x, y, 0);
                TileBase tile = (y == terrainHeight - 1) ? grassTile : dirtTile;
                groundTilemap.SetTile(pos, tile);
            }
        }

        // IMPORTANT: After bulk edits, refresh the tilemap
        // to update colliders and renderers efficiently
        groundTilemap.RefreshAllTiles();
    }

    // Convert world position to tile position:
    public Vector3Int WorldToTile(Vector3 worldPos)
    {
        return groundTilemap.WorldToCell(worldPos);
    }

    // Check if a tile exists at a position:
    public bool HasTileAt(Vector3Int cellPos)
    {
        return groundTilemap.HasTile(cellPos);
    }
}
```

---

## SpriteShape

SpriteShape creates organic, deformable paths — ideal for rolling hills, cave walls, rivers, and any terrain that doesn't fit a rigid grid.

### When to Use Tilemap vs SpriteShape

| Feature | Tilemap | SpriteShape |
|---------|---------|-------------|
| Grid-based levels | ✅ Best choice | ❌ Overkill |
| Organic terrain (hills, caves) | ❌ Looks blocky | ✅ Smooth curves |
| Interior rooms, dungeons | ✅ Natural fit | ⚠️ Can work |
| Side-scroller ground | ⚠️ Stepped edges | ✅ Smooth ground |
| Performance (large maps) | ✅ Excellent | ⚠️ Complex shapes cost more |
| Physics colliders | ✅ CompositeCollider2D | ✅ EdgeCollider2D auto-generated |

### Setup

```csharp
// Install: com.unity.2d.spriteshape (included in 2D template)
//
// 1. Create a SpriteShape Profile:
//    Assets → Create → 2D → Sprite Shape Profile
//    Assign sprites for fill and edge (top, bottom, left, right)
//
// 2. Create a SpriteShape in Scene:
//    GameObject → 2D Object → Sprite Shape
//    - Open Spline: for paths (rivers, roads)
//    - Closed Spline: for filled areas (hills, platforms)
//
// 3. Edit the spline in Scene View:
//    Select the SpriteShape → use the spline edit tool
//    to add/move control points. Tangent handles control curvature.

// SpriteShapeController generates:
// - A mesh from the spline (rendered by SpriteShapeRenderer)
// - An EdgeCollider2D or PolygonCollider2D for physics
//
// In Unity 6, Sprite/SpriteShape/TilemapRenderer can all be
// used as mask sources for SpriteMask — a new addition.
```

### Combining Tilemap + SpriteShape

```
// A common pattern for side-scrolling platformers:
//
// SpriteShape → smooth ground surface (what the player walks on)
// Tilemap     → structured interiors (rooms, corridors, platforms)
// Sprites     → decorative elements (trees, signs, items)
//
// Layer them with Sorting Layers:
// Background (parallax) → Terrain (SpriteShape) → Structures (Tilemap) → Foreground
```

---

## 2D Physics

Unity's 2D physics engine (Box2D-based) is separate from the 3D PhysX engine. All 2D components have a "2D" suffix.

### Core Components

```csharp
// Rigidbody2D — enables physics simulation
// Body Types:
// - Dynamic: fully simulated (player, enemies, projectiles)
// - Kinematic: moved by code, not affected by forces (moving platforms)
// - Static: never moves (ground, walls) — most efficient

// Collider2D types:
// - BoxCollider2D: rectangles
// - CircleCollider2D: circles (cheapest for physics)
// - CapsuleCollider2D: capsules (good for characters)
// - PolygonCollider2D: arbitrary convex/concave shapes
// - EdgeCollider2D: open line segments
// - CompositeCollider2D: merges child colliders
// - TilemapCollider2D: auto-generated from Tilemap tiles
```

### Effectors (Platformer Mechanics)

Effectors modify collision behavior on specific colliders — essential for platformer physics.

```csharp
// === Platform Effector 2D ===
// One-way platforms the player can jump through from below.
// Setup:
// 1. Add BoxCollider2D + set "Used By Effector" = true
// 2. Add PlatformEffector2D
//    - Surface Arc: 180 (top half is solid, bottom is passable)
//    - Use One Way: true
//    - Use One Way Grouping: true (prevents partial clips)
//    - Side Friction / Side Bounce: 0 (prevents sticking to edges)

// === Surface Effector 2D ===
// Conveyor belts and moving surfaces.
// Add to a collider to apply constant horizontal force.
// Speed: positive = right, negative = left
// Force Scale: how strongly objects are pushed

// === Area Effector 2D ===
// Wind zones, water currents, zero-gravity areas.
// Works with trigger colliders to apply force within a region.
// Force Angle: direction of force (degrees)
// Force Magnitude: strength

// === Buoyancy Effector 2D ===
// Simulates water buoyancy.
// Surface Level: water line height
// Density: fluid density (objects float if less dense)
// Flow Angle/Magnitude: current direction and strength

// === Point Effector 2D ===
// Radial force — attraction (gravity wells) or repulsion (explosions).
// Force Magnitude: positive = repel, negative = attract
// Distance Scale: how force fades with distance
```

### 2D Character Controller

```csharp
using UnityEngine;

/// <summary>
/// A physics-based 2D platformer controller using Rigidbody2D.
/// Handles movement, jumping, and ground detection.
/// </summary>
[RequireComponent(typeof(Rigidbody2D))]
[RequireComponent(typeof(CapsuleCollider2D))]
public class PlatformerController2D : MonoBehaviour
{
    [Header("Movement")]
    [SerializeField] private float moveSpeed = 8f;
    [SerializeField] private float acceleration = 50f;
    [SerializeField] private float deceleration = 40f;

    [Header("Jumping")]
    [SerializeField] private float jumpForce = 14f;
    [SerializeField] private float coyoteTime = 0.1f;     // Grace period after leaving edge
    [SerializeField] private float jumpBufferTime = 0.1f;  // Pre-land jump input buffer
    [SerializeField] private float fallMultiplier = 2.5f;  // Faster falling = snappier feel
    [SerializeField] private float lowJumpMultiplier = 2f;  // Short hop when button released

    [Header("Ground Check")]
    [SerializeField] private LayerMask groundLayer;
    [SerializeField] private float groundCheckRadius = 0.2f;
    [SerializeField] private Transform groundCheckPoint;

    private Rigidbody2D _rb;
    private float _coyoteTimer;
    private float _jumpBufferTimer;
    private bool _isGrounded;
    private float _moveInput;

    void Awake()
    {
        _rb = GetComponent<Rigidbody2D>();
        // Freeze rotation so the character doesn't tumble
        _rb.freezeRotation = true;
        // Use Interpolate for smooth rendering between fixed timesteps
        _rb.interpolation = RigidbodyInterpolation2D.Interpolate;
    }

    void Update()
    {
        // Read input in Update (runs every frame)
        _moveInput = Input.GetAxisRaw("Horizontal"); // Replace with Input System

        // Ground check using overlap circle
        _isGrounded = Physics2D.OverlapCircle(
            groundCheckPoint.position, groundCheckRadius, groundLayer);

        // Coyote time: allow jumping briefly after walking off a ledge
        if (_isGrounded)
            _coyoteTimer = coyoteTime;
        else
            _coyoteTimer -= Time.deltaTime;

        // Jump buffer: remember jump input for a short window
        if (Input.GetButtonDown("Jump")) // Replace with Input System
            _jumpBufferTimer = jumpBufferTime;
        else
            _jumpBufferTimer -= Time.deltaTime;

        // Execute jump if both timers are valid
        if (_jumpBufferTimer > 0f && _coyoteTimer > 0f)
        {
            _rb.linearVelocity = new Vector2(_rb.linearVelocity.x, jumpForce);
            _jumpBufferTimer = 0f;
            _coyoteTimer = 0f;
        }
    }

    void FixedUpdate()
    {
        // Apply movement in FixedUpdate (synced with physics)
        float targetSpeed = _moveInput * moveSpeed;
        float speedDiff = targetSpeed - _rb.linearVelocity.x;
        float accelRate = Mathf.Abs(targetSpeed) > 0.01f
            ? acceleration : deceleration;

        // Smooth acceleration/deceleration
        float movement = speedDiff * accelRate * Time.fixedDeltaTime;
        _rb.AddForce(Vector2.right * movement, ForceMode2D.Force);

        // Variable jump height: fall faster when not holding jump
        if (_rb.linearVelocity.y < 0)
        {
            // Falling: apply extra gravity for snappier feel
            _rb.linearVelocity += Vector2.up *
                (Physics2D.gravity.y * (fallMultiplier - 1) * Time.fixedDeltaTime);
        }
        else if (_rb.linearVelocity.y > 0 && !Input.GetButton("Jump"))
        {
            // Rising but jump released: cut jump short
            _rb.linearVelocity += Vector2.up *
                (Physics2D.gravity.y * (lowJumpMultiplier - 1) * Time.fixedDeltaTime);
        }
    }
}
```

---

## 2D Lighting (URP)

URP's 2D Renderer includes a dedicated 2D lighting system with real-time lights and shadows.

```csharp
// Requires URP with the 2D Renderer assigned.
//
// Light types (GameObject → Light → 2D):
//
// - Global Light 2D: ambient light for the entire scene
//   Use for day/night cycles, mood lighting
//
// - Point Light 2D: radial light (torches, campfires, pickups)
//   Inner/Outer Radius: falloff range
//   Intensity: brightness
//   Color: tint
//
// - Spot Light 2D: cone-shaped (flashlights, spotlights)
//   Inner/Outer Angle: cone spread
//
// - Freeform Light 2D: arbitrary polygon shape
//   Edit vertices in Scene View for custom light shapes
//   Great for light through windows, irregular room shapes

// === Shadow Caster 2D ===
// Add ShadowCaster2D to any GameObject with a collider
// to cast real-time 2D shadows.
// - Use Renderer Silhouette: generates shadow shape from sprite
// - Self Shadows: whether the object shadows itself
//
// Performance note: 2D shadows are per-light. Limit shadow-casting
// lights to 2-3 in view for mobile targets.

// === Sorting Layers for Lights ===
// Each 2D light has a "Target Sorting Layers" property.
// Use this to light foreground and background independently:
// - "Background" layer: dim global light (mood)
// - "Characters" layer: brighter point lights (gameplay visibility)
// - "Foreground" layer: no lights (silhouette decoration)
```

---

## Sprite Atlas

Sprite Atlas packs multiple sprites into a single texture, reducing draw calls.

```csharp
// Create: Assets → Create → 2D → Sprite Atlas
//
// Configuration:
// - Objects for Packing: drag in sprite folders or individual sprites
// - Allow Rotation: Off for pixel art (rotation causes sub-pixel issues)
// - Tight Packing: On (saves atlas space)
// - Padding: 2-4 pixels (prevents bleed between sprites)
//
// For Unity 6, use Sprite Atlas V2 (default):
// - Supports Addressables integration
// - Can be loaded/unloaded at runtime for memory management
// - Variant atlases: create low-res variants for mobile

// Runtime loading (with Addressables):
using UnityEngine.U2D;
using UnityEngine.AddressableAssets;

// Load a sprite atlas on demand
var handle = Addressables.LoadAssetAsync<SpriteAtlas>("UI_Atlas");
handle.Completed += (op) =>
{
    SpriteAtlas atlas = op.Result;
    Sprite icon = atlas.GetSprite("icon_health");
    // Use the sprite...
};

// Best practices:
// - Group sprites by usage (UI atlas, character atlas, environment atlas)
// - Keep atlas texture size ≤ 2048×2048 for mobile
// - One atlas per scene/level to avoid loading unused sprites
```

---

## 2D Animation

### Sprite Animation (Frame-by-Frame)

```csharp
// Traditional sprite animation using the Animation window:
// 1. Select the sprite GameObject
// 2. Window → Animation → Animation
// 3. Drag sprite frames into the timeline
// 4. Set sample rate (12fps for pixel art, 24fps for smooth animation)
//
// Unity creates:
// - An AnimationClip (.anim) with sprite keyframes
// - An Animator Controller (.controller) for state management
//
// For pixel art, set sprite filter mode to "Point (no filter)"
// and compression to "None" to prevent blurring.
```

### Skeletal Animation (2D Animation Package)

```csharp
// Install: com.unity.2d.animation
// For characters with bone-based deformation (smoother, more memory-efficient)
//
// Workflow:
// 1. Import a character sprite sheet
// 2. Open Skinning Editor: Sprite Editor → Skinning Editor
// 3. Create bones (skeleton) inside the sprite
// 4. Generate and paint bone weights (which pixels follow which bone)
// 5. Animate bones in the Animation window
//
// Advantages over frame-by-frame:
// - Fewer sprites needed (one sprite, many poses)
// - Smoother interpolation between keyframes
// - Runtime IK (Inverse Kinematics) with IKManager2D
// - Sprite Swap: change character appearance without re-animating

// IK setup for 2D characters:
// Add IKManager2D to the root bone GameObject
// Add LimbSolver2D for arms/legs
// Add FabrikSolver2D for chains (tails, tentacles)
```

---

## Performance Tips for 2D

| Technique | Impact | Notes |
|-----------|--------|-------|
| Sprite Atlas | 🟢 High | Reduces draw calls from 100s to single digits |
| CompositeCollider2D | 🟢 High | Merges thousands of tile colliders into a few polygons |
| Object pooling | 🟢 High | Prevents GC spikes from spawning/destroying 2D objects |
| Tilemap over Sprites | 🟡 Medium | Smaller scene files, faster loading, unified collision |
| 2D lights limit | 🟡 Medium | Cap shadow-casting lights at 2-3 on mobile |
| PixelPerfectCamera | 🟡 Medium | Upscale render texture prevents overdraw at high resolutions |
| Sorting layers | 🟢 High | Correct layering avoids overdraw and transparency sorting issues |

---

## Quick Reference

```
2D Project Checklist:
├── Template: 2D (URP)
├── Camera: Orthographic + PixelPerfectCamera (if pixel art)
├── Levels
│   ├── Grid + Tilemap layers (ground, walls, decoration)
│   ├── SpriteShape for organic terrain
│   └── CompositeCollider2D on all physics tilemaps
├── Art
│   ├── Sprite Atlas per scene/feature
│   ├── ASTC compression (mobile) or uncompressed (pixel art)
│   └── Consistent PPU across all sprites
├── Physics
│   ├── Rigidbody2D + appropriate collider on all actors
│   ├── Effectors for platformer mechanics
│   └── Layer-based collision matrix (Physics2D settings)
├── Lighting
│   ├── URP 2D Renderer assigned
│   ├── Global Light 2D for ambient
│   └── Point/Freeform lights for atmosphere
└── Animation
    ├── Frame-by-frame for pixel art
    └── 2D Animation package for skeletal
```
