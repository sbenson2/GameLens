# G109 — MonoGame.Extended 4.x–5.x Migration & New Features

> **Category:** guide · **Engine:** MonoGame · **Related:** [G75 MonoGame.Extended Library Integration](./G75_monogame_extended.md) · [G37 Tilemap Systems](./G37_tilemap_systems.md) · [G31 Animation State Machines](./G31_animation_state_machines.md) · [G41 Tweening](./G41_tweening.md) · [G3 Physics & Collision](./G3_physics_and_collision.md) · [G81 NativeAOT Publishing](./G81_nativeaot_publishing.md)

What changed in MonoGame.Extended from **4.0** (July 2024) through **5.4** (February 2026): the package consolidation, namespace restructuring, new drawing APIs, collision fixes, tweening improvements, and AOT compatibility. Covers migration from 3.x, breaking changes, and patterns for integrating the updated library with Arch ECS.

---

## Version Timeline

| Version | Date | Headline |
|---------|------|----------|
| 4.0.0 | Jul 2024 | Package consolidation, namespace restructuring, MG 3.8.1+ compat |
| 4.x patches | 2024 | Incremental bug fixes, feature parity catch-up |
| 5.0–5.3 | 2025 | Continued stabilization, new features |
| 5.4.0 | Feb 2026 | Triangulator rewrite, arc drawing, tweening callbacks, collision fixes, AOT support |

> **Current recommended version (April 2026):** 5.4.0 with MonoGame 3.8.4.1. The 3.8.5-preview Content Builder Project has [known compatibility issues](https://www.monogameextended.net/blog/update-2026-01/) with `MonoGame.Extended.Content.Pipeline` for Tiled tilemap imports.

---

## Package Consolidation (4.0)

Before 4.0, MonoGame.Extended shipped as many small NuGet packages:

```
MonoGame.Extended                    (core)
MonoGame.Extended.Graphics           (texture regions, atlases)
MonoGame.Extended.Input              (input listeners)
MonoGame.Extended.Entities           (ECS)
MonoGame.Extended.Animations         (sprite animations)
MonoGame.Extended.Collisions         (collision system)
MonoGame.Extended.Particles          (particle engine)
MonoGame.Extended.Tiled              (Tiled map support)
MonoGame.Extended.Content.Pipeline   (content importers)
... and more
```

**From 4.0 onward**, everything is consolidated into two packages:

```xml
<ItemGroup>
  <!-- Runtime library — all features included -->
  <PackageReference Include="MonoGame.Extended" Version="5.4.0" />

  <!-- Content pipeline importers (Tiled, sprite sheets, etc.) -->
  <PackageReference Include="MonoGame.Extended.Content.Pipeline" Version="5.4.0" />
</ItemGroup>
```

> **Migration action:** Remove all individual `MonoGame.Extended.*` package references and replace with the two packages above.

---

## Namespace Changes (4.0)

Classes were reorganized to mirror MonoGame's own namespace structure. The most common renames:

| Old (3.x) | New (4.0+) | Namespace |
|-----------|-----------|-----------|
| `TextureRegion2D` | `Texture2DRegion` | `MonoGame.Extended.Graphics` |
| `TextureAtlas` | `Texture2DAtlas` | `MonoGame.Extended.Graphics` |
| `SpriteSheet` | `SpriteSheet` (same name) | `MonoGame.Extended.Graphics` |
| `AnimatedSprite` | `AnimatedSprite` | `MonoGame.Extended.Animations` |
| `Camera2D` | `OrthographicCamera` | `MonoGame.Extended` |
| `InputListenerComponent` | `InputListener` | `MonoGame.Extended.Input` |

### Quick Fix Strategy

After upgrading the NuGet package:

1. Build the project — collect all errors.
2. For each unresolved type, add the new `using` directive. Most classes moved to `MonoGame.Extended.Graphics` or kept their existing namespace.
3. Rename `TextureRegion2D` → `Texture2DRegion` and `TextureAtlas` → `Texture2DAtlas`.

---

## Content Pipeline Path Fix (4.0+)

In 3.x, referencing the pipeline DLL in `.mgcb` required fragile absolute or relative paths that broke across machines. 4.0 introduced a `.targets` file that auto-copies pipeline assemblies to a known location.

Add this property to your game `.csproj`:

```xml
<PropertyGroup>
  <MonoGameExtendedPipelineReferencePath>
    $(MSBuildThisFileDirectory)pipeline-references
  </MonoGameExtendedPipelineReferencePath>
</PropertyGroup>
```

Then reference in `.mgcb`:

```
/reference:pipeline-references/MonoGame.Extended.Content.Pipeline.dll
```

This ensures the DLL is always at a predictable path relative to your project, regardless of NuGet cache location.

---

## New Features in 5.x

### Arc and Pie Drawing (5.4)

`PrimitiveBatch` and the shape-drawing extensions gained arc support:

```csharp
// Outline arc (60° to 300°, 200px radius)
spriteBatch.DrawArc(
    center: new Vector2(400, 300),
    radius: 200f,
    startAngle: MathHelper.ToRadians(60),
    endAngle: MathHelper.ToRadians(300),
    sides: 32,
    color: Color.Cyan,
    thickness: 2f);

// Filled pie slice
spriteBatch.DrawSolidArc(
    center: new Vector2(400, 300),
    radius: 200f,
    startAngle: MathHelper.ToRadians(0),
    endAngle: MathHelper.ToRadians(90),
    sides: 32,
    color: new Color(Color.Red, 0.5f));
```

> **Alpha fix (5.4):** `PrimitiveBatch` now defaults to `BlendState.NonPremultiplied`, so semi-transparent shapes render correctly. If you were working around this with premultiplied alpha, the fix may change your visual output.

### Outline Parameters on Solid Shapes (5.4)

`DrawSolidRectangle` and `DrawSolidCircle` now accept an optional `outline` parameter:

```csharp
spriteBatch.DrawSolidRectangle(
    rect: new RectangleF(100, 100, 200, 150),
    fillColor: Color.DarkBlue,
    outline: Color.White);  // draws both fill and border
```

### Tweening Improvements (5.4)

New callback and easing utilities:

```csharp
// OnUpdate fires every interpolation step
entity.TweenTo(target, duration: 1.0f)
    .Easing(EasingFunctions.QuadraticInOut)
    .OnUpdate(tween =>
    {
        // React to intermediate values (e.g., update a trail)
        float progress = tween.CurrentTime / tween.Duration;
    });

// Compose easing curves
var bounceAndReverse = EasingFunctions.BounceOut.Invert();
var sequenced = EasingFunctions.QuadraticIn.Follow(EasingFunctions.ElasticOut);
```

Inspect active tweens without allocation:

```csharp
ReadOnlySpan<Tween> active = tweenSystem.ActiveTweens;
for (int i = 0; i < active.Length; i++)
{
    // No heap allocation — Span-based access
    ref readonly var tween = ref active[i];
}
```

### Screen Lifecycle (5.4)

`Screen` subclasses can now handle reactivation:

```csharp
public class GameplayScreen : Screen
{
    protected override void OnActivated()
    {
        // Called when this screen becomes the active screen again
        // (e.g., returning from pause menu)
        _music.Resume();
    }

    protected override void OnDeactivated()
    {
        // Called when another screen takes focus
        _music.Pause();
    }
}
```

---

## Triangulator Rewrite (5.4)

The ear-clipping triangulation algorithm was overhauled with two key fixes:

### Zero-Allocation Vertex Handling

The `Vertex` struct now implements `IEquatable<Vertex>`, eliminating boxing allocations during triangulation. Impact on a 16-vertex polygon:

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Heap allocation | 43.33 KB | 1.98 KB | 95.5% reduction |

This matters for procedural generation, physics debug rendering, and any system that triangulates at runtime.

### Correct Winding Order Detection

The previous winding-order check failed on polygons with equal numbers of left and right turns. 5.4 uses the signed-area (shoelace) formula:

```
Area = 0.5 × |Σ(x_i × y_{i+1} − x_{i+1} × y_i)|
```

If you had workarounds for triangulation bugs with certain polygon shapes, they can likely be removed.

---

## Collision Layer Self-Collision Fix (5.4)

In previous versions, named collision layers did not correctly detect collisions between entities on the **same** layer. This is now fixed:

```csharp
var collisionComponent = new CollisionComponent(new Size2(800, 600));

// Entities on the "enemies" layer now properly collide with each other
var enemy1 = collisionComponent.CreateRectangle(
    "enemies", new Vector2(100, 100), new Size2(32, 32));
var enemy2 = collisionComponent.CreateRectangle(
    "enemies", new Vector2(110, 100), new Size2(32, 32));

// This now correctly reports a collision
collisionComponent.Update(gameTime);
```

> If your game relied on same-layer entities **not** colliding as a feature (not a bug), you'll need to split them into separate layers.

---

## AOT / Trimming Compatibility (5.4)

Content readers now include static `Register()` methods for explicit registration, avoiding the reflection-based discovery that breaks under NativeAOT:

```csharp
// In your Game.Initialize() or before first Content.Load call
Texture2DAtlasReader.Register();
SpriteSheetReader.Register();
TiledMapReader.Register();
AnimatedSpriteReader.Register();
```

Without explicit registration, NativeAOT builds may fail with `ContentLoadException` because the trimmer removes the reader types it can't statically see.

See [G81 NativeAOT Publishing](./G81_nativeaot_publishing.md) for the full AOT workflow.

---

## Batcher2D Deprecation (5.4)

`Batcher2D` is marked `[Obsolete]` and will be removed in 6.0. Migrate to `PrimitiveBatch` or the `SpriteBatch` extension methods:

```csharp
// Old (Batcher2D) — deprecated
var batcher = new Batcher2D(GraphicsDevice);
batcher.Begin();
batcher.DrawRectangle(rect, Color.Red);
batcher.End();

// New (SpriteBatch extensions)
spriteBatch.Begin();
spriteBatch.DrawRectangle(rect, Color.Red, thickness: 2f);
spriteBatch.End();
```

---

## Arch ECS Integration Notes

MonoGame.Extended's built-in `Entities` module (their own ECS) is separate from the Arch ECS library used by the GameCodex stack. When using Arch ECS with MonoGame.Extended:

- Use Extended's **rendering utilities** (sprite animations, tilemap renderer, primitive drawing) but manage entities through Arch.
- Wrap Extended types as Arch components:

```csharp
// Arch component wrapping MonoGame.Extended's AnimatedSprite
public struct AnimatedSpriteComponent
{
    public AnimatedSprite Sprite;
    public string CurrentAnimation;
}

// Arch system that updates Extended animations
var query = new QueryDescription().WithAll<AnimatedSpriteComponent>();
world.Query(in query, (ref AnimatedSpriteComponent asc) =>
{
    asc.Sprite.Play(asc.CurrentAnimation);
    asc.Sprite.Update(gameTime);
});
```

- **Do not mix** Arch's `World` with Extended's `EntityComponentSystem`. Pick one ECS and use it consistently.

---

## Content Builder Compatibility Warning (3.8.5)

As of January 2026, the new MonoGame 3.8.5 Content Builder Project has issues with `MonoGame.Extended.Content.Pipeline` for Tiled tilemap imports. External references in `.tmx` files fail to resolve correctly during the new build process.

**Recommendation:** Stay on the legacy `.mgcb` workflow for tilemap-heavy projects until either MonoGame.Extended ships a fix or the Content Builder stabilizes. The Extended maintainer has stated the tilemap system is being completely rewritten, so the long-term fix will be a new tilemap module rather than a patch to the old importer.

---

## Further Reading

- [G75 MonoGame.Extended Library Integration](./G75_monogame_extended.md) — Core library overview and feature guide
- [G37 Tilemap Systems](./G37_tilemap_systems.md) — Tiled map rendering patterns
- [G41 Tweening](./G41_tweening.md) — Interpolation and easing
- [G3 Physics & Collision](./G3_physics_and_collision.md) — Collision detection patterns
- [G81 NativeAOT Publishing](./G81_nativeaot_publishing.md) — AOT-safe content loading
- [MonoGame.Extended 4.0 Release](https://www.monogameextended.net/blog/version-4-initial-release/)
- [MonoGame.Extended 5.4.0 Release](https://www.monogameextended.net/blog/version-5-4-0/)
- [MonoGame.Extended January 2026 Update](https://www.monogameextended.net/blog/update-2026-01/)
