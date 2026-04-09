# G75 — MonoGame.Extended Library Integration

> **Category:** Guide · **Related:** [G31 Animation State Machines](./G31_animation_state_machines.md) · [G37 Tilemap Systems](./G37_tilemap_systems.md) · [G38 Scene Management](./G38_scene_management.md) · [G20 Camera Systems](./G20_camera_systems.md) · [G23 Particles](./G23_particles.md)

> **Stack:** MonoGame · Arch ECS · MonoGame.Extended · C#

MonoGame.Extended is the most widely-used community library for MonoGame, providing production-ready implementations of common game systems: sprite animations, tilemap rendering, screen management, cameras, collision detection, particles, sprite sheets, and more. This guide covers integration, key features, ECS compatibility, and the v6.0 tilemap overhaul.

---

## Table of Contents

1. [What is MonoGame.Extended?](#1--what-is-monogame-extended)
2. [Installation and Setup](#2--installation-and-setup)
3. [OrthographicCamera](#3--orthographiccamera)
4. [Sprite Animations](#4--sprite-animations)
5. [Screen Management](#5--screen-management)
6. [Tilemap System (v6.0)](#6--tilemap-system-v60)
7. [Collision Detection](#7--collision-detection)
8. [Particles](#8--particles)
9. [Tweening](#9--tweening)
10. [ECS Integration Patterns](#10--ecs-integration-patterns)
11. [Performance Considerations](#11--performance-considerations)
12. [Common Pitfalls](#12--common-pitfalls)

---

## 1 — What is MonoGame.Extended?

MonoGame.Extended fills the gap between MonoGame's low-level framework and what most 2D games need. Instead of writing your own camera, animation system, and tilemap renderer from scratch, you can use battle-tested implementations and focus on gameplay.

### What it provides

| Module | What It Does | Replaces Custom Code For |
|--------|-------------|-------------------------|
| `MonoGame.Extended` | Core: cameras, transforms, shapes, math | Camera systems, 2D transforms |
| `MonoGame.Extended.Animations` | Sprite sheet animations | Animation state machines |
| `MonoGame.Extended.Tiled` | Tilemap loading and rendering (legacy) | Tiled map integration |
| `MonoGame.Extended.Tilemap` | New format-agnostic tilemap system (v6.0) | Tiled, LDtk, Ogmo support |
| `MonoGame.Extended.Collisions` | Spatial hashing, collision response | Broad-phase collision |
| `MonoGame.Extended.Particles` | 2D particle system | Particle effects |
| `MonoGame.Extended.Tweening` | Property animation/easing | Tweens and transitions |
| `MonoGame.Extended.Screens` | Screen stack management | Scene transitions |

### When to use it vs. building custom

Use MonoGame.Extended when you want proven implementations quickly. Build custom when you need tight Arch ECS integration with zero allocation, or when your game's specific requirements diverge from Extended's design decisions.

## 2 — Installation and Setup

### NuGet packages

```bash
# Core library (required)
dotnet add package MonoGame.Extended

# Individual feature packages (add what you need)
dotnet add package MonoGame.Extended.Animations
dotnet add package MonoGame.Extended.Tiled          # Legacy Tiled support
dotnet add package MonoGame.Extended.Collisions
dotnet add package MonoGame.Extended.Particles
dotnet add package MonoGame.Extended.Tweening
dotnet add package MonoGame.Extended.Screens
```

### Version compatibility

| MonoGame Version | MonoGame.Extended Version | Notes |
|-----------------|--------------------------|-------|
| 3.8.1 | 4.x | Stable, widely used |
| 3.8.2 – 3.8.4 | 4.x / 5.x | Check release notes |
| 3.8.5 (preview) | 6.0-preview | New tilemap system, .NET 8+ |

### Minimal setup in Game1

```csharp
using MonoGame.Extended;
using MonoGame.Extended.ViewportAdapters;

public class Game1 : Game
{
    private OrthographicCamera _camera;

    protected override void Initialize()
    {
        base.Initialize();

        var viewportAdapter = new BoxingViewportAdapter(
            Window, GraphicsDevice, 1920, 1080
        );
        _camera = new OrthographicCamera(viewportAdapter);
    }
}
```

## 3 — OrthographicCamera

MonoGame.Extended's camera is the most commonly used feature. It provides 2D camera functionality with viewport adapters for resolution independence.

### Viewport adapters

| Adapter | Behavior | Best For |
|---------|----------|----------|
| `DefaultViewportAdapter` | No scaling, uses device resolution | Fixed-resolution games |
| `BoxingViewportAdapter` | Scales with letterboxing/pillarboxing | Most 2D games |
| `ScalingViewportAdapter` | Stretches to fill (distorts) | Simple prototypes |
| `WindowViewportAdapter` | Matches window size exactly | Resizable editors |

### Camera usage

```csharp
// In Update
_camera.LookAt(playerPosition);

// Zoom
_camera.ZoomIn(0.01f);
_camera.ZoomOut(0.01f);
_camera.Zoom = 2.0f; // Direct set

// Rotation
_camera.Rotation = MathHelper.ToRadians(15);

// In Draw
var transformMatrix = _camera.GetViewMatrix();
_spriteBatch.Begin(transformMatrix: transformMatrix);
// Draw world-space objects
_spriteBatch.End();

// Draw UI (no camera transform)
_spriteBatch.Begin();
// Draw HUD, menus
_spriteBatch.End();
```

### Screen-to-world conversion

```csharp
// Convert mouse position to world coordinates
var mouseScreen = Mouse.GetState().Position.ToVector2();
var mouseWorld = _camera.ScreenToWorld(mouseScreen);
```

## 4 — Sprite Animations

### SpriteSheet and AnimatedSprite

```csharp
// Load a texture atlas
var texture = Content.Load<Texture2D>("Sprites/player_sheet");
var atlas = Texture2DAtlas.Create("playerAtlas", texture, 32, 32);
// Creates a grid of 32x32 regions from the texture

// Define animations from atlas regions
var spriteSheet = new SpriteSheet("player", atlas);
spriteSheet.DefineAnimation("idle", builder =>
{
    builder.IsLooping(true)
           .AddFrame(regionIndex: 0, duration: TimeSpan.FromSeconds(0.2))
           .AddFrame(regionIndex: 1, duration: TimeSpan.FromSeconds(0.2))
           .AddFrame(regionIndex: 2, duration: TimeSpan.FromSeconds(0.2))
           .AddFrame(regionIndex: 3, duration: TimeSpan.FromSeconds(0.2));
});

spriteSheet.DefineAnimation("run", builder =>
{
    builder.IsLooping(true)
           .AddFrame(4, TimeSpan.FromSeconds(0.1))
           .AddFrame(5, TimeSpan.FromSeconds(0.1))
           .AddFrame(6, TimeSpan.FromSeconds(0.1))
           .AddFrame(7, TimeSpan.FromSeconds(0.1));
});

// Create the animated sprite
var animatedSprite = new AnimatedSprite(spriteSheet, "idle");

// In Update
animatedSprite.Update(gameTime);

// Switch animations
animatedSprite.SetAnimation("run");

// In Draw
_spriteBatch.Draw(animatedSprite, playerPosition);
```

### Aseprite integration

MonoGame.Extended can load Aseprite `.json` export files directly, matching tags to animation names. Export your Aseprite file as a sprite sheet + JSON data, and Extended handles the rest.

## 5 — Screen Management

The screen manager uses a stack-based approach where multiple screens can be active simultaneously (e.g., game + pause overlay).

### Setup

```csharp
public class Game1 : GameComponentCollection
{
    // In Game1 constructor or Initialize:
    private ScreenManager _screenManager;

    protected override void Initialize()
    {
        _screenManager = new ScreenManager();
        Components.Add(_screenManager);

        // Load initial screen
        _screenManager.LoadScreen(new MainMenuScreen());

        base.Initialize();
    }
}
```

### Defining screens

```csharp
public class MainMenuScreen : GameScreen
{
    public override void LoadContent()
    {
        // Load screen-specific content
    }

    public override void Update(GameTime gameTime)
    {
        // Handle input, update state
        if (WasStartPressed())
        {
            // Transition to gameplay
            ScreenManager.LoadScreen(new GameplayScreen(),
                new FadeTransition(GraphicsDevice, Color.Black));
        }
    }

    public override void Draw(GameTime gameTime)
    {
        // Render the menu
    }
}
```

### Screen transitions

Extended includes `FadeTransition` by default. You can implement custom transitions by extending the `Transition` base class.

## 6 — Tilemap System (v6.0)

MonoGame.Extended v6.0 introduces a completely rewritten tilemap system that replaces the old `MonoGame.Extended.Tiled` package.

### Key improvements over the legacy system

- **Format-agnostic** — supports Tiled (`.tmx`), LDtk, and Ogmo Editor
- **World maps** — multi-room games with automatic level positioning
- **Better performance** — optimized rendering with culling
- **Animated tiles** — built-in support for tile animations

### Loading a Tiled map (v6.0)

```csharp
// Load the tilemap
var tilemap = Content.Load<TiledMap>("Maps/level1");
var renderer = new TiledMapRenderer(GraphicsDevice, tilemap);

// In Update
renderer.Update(gameTime);

// In Draw
renderer.Draw(_camera.GetViewMatrix());
```

### Accessing tile data

```csharp
// Get a tile layer
var layer = tilemap.GetLayer<TiledMapTileLayer>("Collision");

// Check if a tile exists at a position
var tileX = (int)(worldPosition.X / tilemap.TileWidth);
var tileY = (int)(worldPosition.Y / tilemap.TileHeight);
var tile = layer.GetTile(tileX, tileY);

if (!tile.IsBlank)
{
    // Solid tile — handle collision
}
```

### Object layers

```csharp
var objectLayer = tilemap.GetLayer<TiledMapObjectLayer>("Spawns");
foreach (var obj in objectLayer.Objects)
{
    if (obj.Name == "PlayerStart")
    {
        playerPosition = new Vector2(obj.Position.X, obj.Position.Y);
    }
}
```

### Legacy Tiled support

If you're using the older `MonoGame.Extended.Tiled` package, it continues to work but is no longer actively developed. New projects should use the v6.0 tilemap system when it reaches stable release.

## 7 — Collision Detection

MonoGame.Extended provides 2D collision detection with spatial hashing for broad-phase optimization.

```csharp
using MonoGame.Extended.Collisions;

// Create collision world
var collisionComponent = new CollisionComponent(
    new RectangleF(-1000, -1000, 2000, 2000) // World bounds
);
Components.Add(collisionComponent);

// Create collidable entities
public class PlayerActor : ICollisionActor
{
    public IShapeF Bounds { get; }
    public PlayerActor(Vector2 position)
    {
        Bounds = new RectangleF(position.X, position.Y, 32, 32);
    }

    public void OnCollision(CollisionEventArgs collisionInfo)
    {
        // Respond to collision
        // collisionInfo.Other — the other actor
        // collisionInfo.PenetrationVector — for separation
    }
}

// Insert into collision world
collisionComponent.Insert(playerActor);
```

## 8 — Particles

```csharp
using MonoGame.Extended.Particles;
using MonoGame.Extended.Particles.Modifiers;
using MonoGame.Extended.Particles.Profiles;

var particleEffect = new ParticleEffect
{
    Emitters = new List<ParticleEmitter>
    {
        new ParticleEmitter(
            textureRegion: new TextureRegion2D(particleTexture),
            capacity: 500,
            lifeSpan: TimeSpan.FromSeconds(1.5),
            profile: Profile.Circle(25f, Profile.CircleRadiation.Out)
        )
        {
            Modifiers =
            {
                new AgeModifier { Interpolators = { new ColorInterpolator
                {
                    StartValue = Color.Yellow.ToHsl(),
                    EndValue = Color.Red.ToHsl()
                }}},
                new LinearGravityModifier { Direction = Vector2.UnitY, Strength = 50f },
                new OpacityFastFadeModifier()
            },
            Parameters = new ParticleReleaseParameters
            {
                Quantity = 10,
                Speed = new Range<float>(50f, 150f),
            }
        }
    }
};

// In Update
particleEffect.Update((float)gameTime.ElapsedGameTime.TotalSeconds);

// Trigger at position
particleEffect.Trigger(explosionPosition);

// In Draw
_spriteBatch.Begin(blendState: BlendState.Additive, transformMatrix: _camera.GetViewMatrix());
_spriteBatch.Draw(particleEffect);
_spriteBatch.End();
```

## 9 — Tweening

```csharp
using MonoGame.Extended.Tweening;

private readonly Tweener _tweener = new Tweener();

// Tween a property
_tweener.TweenTo(
    target: mySprite,
    expression: sprite => sprite.Position,
    toValue: new Vector2(500, 300),
    duration: 1.0f
)
.Easing(EasingFunctions.CubicInOut)
.OnEnd(tween => Debug.Log("Done!"));

// In Update
_tweener.Update(gameTime.GetElapsedSeconds());
```

### Common easing functions

`Linear`, `CubicIn`, `CubicOut`, `CubicInOut`, `BounceOut`, `ElasticOut`, `BackInOut`, `SineInOut`, `QuadraticInOut`, `ExponentialInOut`.

## 10 — ECS Integration Patterns

MonoGame.Extended was designed before ECS became the dominant architecture in MonoGame projects. Here's how to bridge Extended's features with an Arch ECS architecture.

### Camera as a shared resource

```csharp
// Store camera as a global resource, not a component
world.Create(new CameraResource { Camera = _camera });

// Or pass directly to systems
public class CameraFollowSystem : BaseSystem<World, GameTime>
{
    private readonly OrthographicCamera _camera;
    private readonly QueryDescription _query = new QueryDescription()
        .WithAll<Position, CameraTarget>();

    public CameraFollowSystem(World world, OrthographicCamera camera)
        : base(world)
    {
        _camera = camera;
    }

    public override void Update(in GameTime gameTime)
    {
        World.Query(in _query, (ref Position pos, ref CameraTarget _) =>
        {
            _camera.LookAt(pos.Value);
        });
    }
}
```

### AnimatedSprite as a component wrapper

```csharp
// Component wrapping MonoGame.Extended's AnimatedSprite
public struct SpriteAnimation : IComponent
{
    public AnimatedSprite Sprite;
    public string CurrentAnimation;
}

// System that updates animations
public class AnimationUpdateSystem : BaseSystem<World, GameTime>
{
    private readonly QueryDescription _query = new QueryDescription()
        .WithAll<SpriteAnimation>();

    public override void Update(in GameTime gameTime)
    {
        World.Query(in _query, (ref SpriteAnimation anim) =>
        {
            anim.Sprite.Update(gameTime);
        });
    }
}
```

### When NOT to wrap in ECS

Not everything needs to be an ECS component. The screen manager, particle effects, and tweener work fine as traditional service objects. Force-fitting them into ECS adds complexity without benefit.

## 11 — Performance Considerations

**Camera transforms** — `GetViewMatrix()` allocates a `Matrix`. Cache it per frame if calling from multiple systems.

**Tilemap rendering** — the v6.0 renderer culls off-screen tiles automatically. For very large maps, ensure you're passing the camera bounds correctly.

**Particle capacity** — set particle emitter capacity to the maximum you expect, not an arbitrary high number. Each particle is allocated upfront.

**Collision spatial hash** — the broad-phase cell size affects performance. Too small = many cells to check, too large = too many candidates per cell. Default is usually fine for 32px–64px entities.

**Animation updates** — only update `AnimatedSprite` instances that are on-screen. Skip off-camera entities in your animation system.

## 12 — Common Pitfalls

**Mixing camera transforms in SpriteBatch.** Always draw world objects with the camera transform and UI without it. If your UI moves with the camera, you're passing the transform matrix to both Begin calls.

**Forgetting to call Update on components.** `AnimatedSprite`, `Tweener`, `ParticleEffect`, and `CollisionComponent` all need `Update()` called every frame. Missing any one results in frozen behavior.

**Using legacy Tiled package with v6.0.** The NuGet package names differ. `MonoGame.Extended.Tiled` is the legacy package; the v6.0 tilemap is part of the core `MonoGame.Extended` package (v6.0+). Don't install both.

**Viewport adapter mismatch.** If your virtual resolution doesn't match your target aspect ratio, `BoxingViewportAdapter` will letterbox. This is correct behavior — don't "fix" it by switching to `ScalingViewportAdapter` (which distorts).

**Screen transitions blocking input.** During a `FadeTransition`, the outgoing screen may still receive input. Guard against double-transitions by checking screen state before loading a new screen.

---

> **Next steps:** For custom camera implementations beyond what Extended provides, see [G20 Camera Systems](./G20_camera_systems.md). For deeper tilemap architecture, see [G37 Tilemap Systems](./G37_tilemap_systems.md). For custom animation state machines, see [G31 Animation State Machines](./G31_animation_state_machines.md).
