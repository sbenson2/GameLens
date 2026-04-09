# G94 — Runtime Texture Atlas & SpriteBatch Optimization

> **Category:** guide · **Engine:** MonoGame · **Related:** [G2 Rendering & Graphics](./G2_rendering_and_graphics.md) · [G8 Content Pipeline](./G8_content_pipeline.md) · [G26 Resource Loading & Caching](./G26_resource_loading_caching.md) · [G33 Profiling & Optimization](./G33_profiling_optimization.md) · [G67 Object Pooling](./G67_object_pooling.md) · [G86 Async Content Loading](./G86_async_content_loading.md)

How to pack sprites into texture atlases at runtime, minimize draw calls via SpriteBatch batching, and diagnose GPU-bound rendering bottlenecks in MonoGame. Covers build-time atlas generation with the content pipeline, runtime atlas packing for dynamic content, SpriteBatch sort modes, and practical batching strategies.

---

## Why Atlases Matter

Every time `SpriteBatch` switches textures during a batch, MonoGame flushes the current vertex buffer to the GPU as a separate **draw call**. Draw calls are expensive — each one involves driver overhead, state changes, and pipeline stalls.

```
❌ 500 sprites from 500 textures = ~500 draw calls (GPU-bound, low FPS)
✅ 500 sprites from 1 atlas     = 1 draw call    (GPU idle, high FPS)
```

The goal is to pack as many sprites as possible onto shared atlas textures so SpriteBatch can render them in a single draw call.

---

## Build-Time Atlases (Content Pipeline)

For assets known at compile time, pack them during the build using the MonoGame Content Pipeline or a tool like TexturePacker.

### Manual Atlas with XML Descriptor

Create a sprite sheet image (e.g., in Aseprite or TexturePacker), then describe the regions in an XML file loaded at runtime:

```xml
<!-- Content/atlas-descriptor.xml -->
<TextureAtlas texture="sprites">
  <Region name="player_idle"  x="0"   y="0"   w="32" h="32" />
  <Region name="player_run_1" x="32"  y="0"   w="32" h="32" />
  <Region name="player_run_2" x="64"  y="0"   w="32" h="32" />
  <Region name="coin"         x="0"   y="32"  w="16" h="16" />
  <Region name="heart"        x="16"  y="32"  w="16" h="16" />
</TextureAtlas>
```

### Atlas Loader

```csharp
public class TextureAtlas
{
    public Texture2D Texture { get; }
    private readonly Dictionary<string, Rectangle> _regions = new();

    public TextureAtlas(Texture2D texture, Dictionary<string, Rectangle> regions)
    {
        Texture = texture;
        _regions = regions;
    }

    /// <summary>
    /// Get the source rectangle for a named sprite region.
    /// Use this with SpriteBatch.Draw(atlas.Texture, position, atlas["name"], ...).
    /// </summary>
    public Rectangle this[string name] => _regions[name];

    public bool TryGetRegion(string name, out Rectangle region) =>
        _regions.TryGetValue(name, out region);

    /// <summary>
    /// Load atlas from an XML descriptor + texture pair.
    /// </summary>
    public static TextureAtlas Load(ContentManager content, string descriptorPath)
    {
        var doc = System.Xml.Linq.XDocument.Load(
            Path.Combine(content.RootDirectory, descriptorPath));
        var root = doc.Root!;

        var textureName = root.Attribute("texture")!.Value;
        var texture = content.Load<Texture2D>(textureName);

        var regions = new Dictionary<string, Rectangle>();
        foreach (var el in root.Elements("Region"))
        {
            var name = el.Attribute("name")!.Value;
            var x = int.Parse(el.Attribute("x")!.Value);
            var y = int.Parse(el.Attribute("y")!.Value);
            var w = int.Parse(el.Attribute("w")!.Value);
            var h = int.Parse(el.Attribute("h")!.Value);
            regions[name] = new Rectangle(x, y, w, h);
        }

        return new TextureAtlas(texture, regions);
    }
}
```

### Usage

```csharp
// Load once
var atlas = TextureAtlas.Load(Content, "atlas-descriptor.xml");

// Draw — all sprites share one texture = one draw call
_spriteBatch.Begin(samplerState: SamplerState.PointClamp);
_spriteBatch.Draw(atlas.Texture, playerPos, atlas["player_idle"], Color.White);
_spriteBatch.Draw(atlas.Texture, coinPos, atlas["coin"], Color.White);
_spriteBatch.Draw(atlas.Texture, heartPos, atlas["heart"], Color.White);
_spriteBatch.End();
```

---

## Runtime Atlas Packing

When assets aren't known at build time — modding support, procedurally generated textures, user-uploaded content — you need to pack atlases at runtime.

### Rectangle Packing Algorithm

The **shelf packing** algorithm is simple and effective for runtime use. It places rectangles left-to-right on horizontal "shelves," starting a new shelf when the current one runs out of horizontal space.

```csharp
/// <summary>
/// Packs rectangles onto a texture atlas at runtime using shelf-based bin packing.
/// Not optimal, but fast and simple — good enough for most 2D games.
/// </summary>
public class RuntimeAtlasPacker
{
    private readonly GraphicsDevice _device;
    private RenderTarget2D _atlas;
    private readonly Dictionary<string, Rectangle> _regions = new();

    private int _shelfX;       // Current X position on the active shelf
    private int _shelfY;       // Y position of the active shelf's top edge
    private int _shelfHeight;  // Tallest sprite on the current shelf
    private readonly int _padding;

    public Texture2D Texture => _atlas;
    public int Width { get; }
    public int Height { get; }

    public RuntimeAtlasPacker(
        GraphicsDevice device, int width = 2048, int height = 2048, int padding = 1)
    {
        _device = device;
        Width = width;
        Height = height;
        _padding = padding;
        _atlas = new RenderTarget2D(device, width, height);
    }

    /// <summary>
    /// Pack a texture into the atlas. Returns the region, or null if the atlas is full.
    /// </summary>
    public Rectangle? Pack(string name, Texture2D source)
    {
        int w = source.Width + _padding * 2;
        int h = source.Height + _padding * 2;

        // Does it fit on the current shelf?
        if (_shelfX + w > Width)
        {
            // Start a new shelf
            _shelfY += _shelfHeight;
            _shelfX = 0;
            _shelfHeight = 0;
        }

        // Does it fit vertically?
        if (_shelfY + h > Height)
            return null; // Atlas is full

        var region = new Rectangle(
            _shelfX + _padding, _shelfY + _padding,
            source.Width, source.Height);

        // Blit the source texture onto the atlas
        BlitToAtlas(source, region);

        _regions[name] = region;
        _shelfX += w;
        _shelfHeight = Math.Max(_shelfHeight, h);

        return region;
    }

    public Rectangle GetRegion(string name) => _regions[name];
    public bool HasRegion(string name) => _regions.ContainsKey(name);

    /// <summary>
    /// Convert the packed atlas into a read-only TextureAtlas for rendering.
    /// Call this after all packing is complete.
    /// </summary>
    public TextureAtlas ToAtlas() => new(_atlas, new Dictionary<string, Rectangle>(_regions));

    private void BlitToAtlas(Texture2D source, Rectangle dest)
    {
        // Read pixels from source
        var data = new Color[source.Width * source.Height];
        source.GetData(data);

        // Write pixels to atlas region
        _atlas.SetData(0, dest, data, 0, data.Length);
    }
}
```

### Usage

```csharp
// During loading — pack mod sprites into a runtime atlas
var packer = new RuntimeAtlasPacker(_graphicsDevice, 2048, 2048);

foreach (var modSprite in modSpriteFiles)
{
    using var stream = File.OpenRead(modSprite.Path);
    var tex = Texture2D.FromStream(_graphicsDevice, stream);
    var region = packer.Pack(modSprite.Name, tex);

    if (region == null)
    {
        // Atlas is full — create a second atlas or increase size
        System.Diagnostics.Debug.WriteLine(
            $"Warning: Atlas full, could not pack '{modSprite.Name}'");
    }

    tex.Dispose(); // Original texture no longer needed
}

// Convert to read-only atlas for rendering
_modAtlas = packer.ToAtlas();
```

---

## SpriteBatch Sort Modes & Batching

`SpriteBatch.Begin()` accepts a `SpriteSortMode` that controls how draw calls are grouped and ordered. Choosing the right mode is critical for performance.

| Sort Mode | Behavior | Draw Calls | Use Case |
|-----------|----------|------------|----------|
| `Deferred` (default) | Draws in submission order; flushes on texture switch | 1 per texture switch | General use — keep same-texture draws together |
| `Texture` | Sorts by texture before drawing | 1 per unique texture | Mixed texture draws where you can't control order |
| `BackToFront` | Sorts by layer depth (high → low) | 1 per texture switch after sort | Overlapping sprites that need correct Z-order |
| `FrontToBack` | Sorts by layer depth (low → high) | 1 per texture switch after sort | Opaque sprites — enables early-Z rejection on GPU |
| `Immediate` | Flushes after every `Draw` call | 1 per draw call | Custom shader changes between draws |

### The Golden Rule

> **Same texture + same shader + same blend state = batched into one draw call.**

Every time any of these change, SpriteBatch flushes a draw call. Minimize changes.

### Practical Batching Strategy

```csharp
protected override void Draw(GameTime gameTime)
{
    GraphicsDevice.Clear(Color.Black);

    // Layer 1: Background tilemap — single atlas, one draw call
    _spriteBatch.Begin(
        sortMode: SpriteSortMode.Deferred,
        samplerState: SamplerState.PointClamp);
    DrawTilemap(_backgroundAtlas);
    _spriteBatch.End();

    // Layer 2: Game entities — sorted by Y for depth (top-down game)
    // Using SpriteSortMode.BackToFront with layerDepth = entity.Y / screenHeight
    _spriteBatch.Begin(
        sortMode: SpriteSortMode.BackToFront,
        samplerState: SamplerState.PointClamp);
    DrawEntities(_entityAtlas);
    _spriteBatch.End();

    // Layer 3: Particles — additive blending, separate batch
    _spriteBatch.Begin(
        sortMode: SpriteSortMode.Deferred,
        blendState: BlendState.Additive,
        samplerState: SamplerState.PointClamp);
    DrawParticles(_particleAtlas);
    _spriteBatch.End();

    // Layer 4: UI — always on top, its own atlas
    _spriteBatch.Begin(
        sortMode: SpriteSortMode.Deferred,
        samplerState: SamplerState.PointClamp);
    DrawUI(_uiAtlas);
    _spriteBatch.End();
}
```

**Why four `Begin`/`End` pairs?** Each layer has different requirements (blend state, sort mode). Splitting into batches by layer keeps the draw call count low (one per batch if each uses a single atlas) while maintaining correct rendering order.

---

## Measuring Draw Calls

MonoGame exposes `GraphicsDevice.Metrics` for diagnosing batching efficiency:

```csharp
protected override void Draw(GameTime gameTime)
{
    // Reset metrics at the start of the frame
    GraphicsDevice.Metrics.ToString(); // Access triggers reset

    // ... all your drawing code ...

    // Check metrics
    var metrics = GraphicsDevice.Metrics;
    System.Diagnostics.Debug.WriteLine(
        $"Draw calls: {metrics.DrawCount}, " +
        $"Sprites: {metrics.SpriteCount}, " +
        $"Textures: {metrics.TextureCount}");
}
```

### Performance Targets

| Metric | Target | Red Flag |
|--------|--------|----------|
| Draw calls per frame | < 50 | > 200 — likely texture thrashing |
| Sprites per draw call | > 100 | < 10 — poor batching |
| Unique textures per frame | < 20 | > 50 — consider atlasing |

---

## Atlas Size Guidelines

| Platform | Max Texture Size | Recommended Atlas Size |
|----------|-----------------|----------------------|
| Desktop (OpenGL/Vulkan) | 16384×16384 | 2048×2048 or 4096×4096 |
| Mobile (Android/iOS) | 4096×4096 (most devices) | 2048×2048 |
| Older mobile / WebGL | 2048×2048 | 1024×1024 |

> **Tip:** Query `GraphicsDevice.GraphicsProfile` or `GraphicsAdapter` capabilities at startup to determine the safe maximum. Use power-of-two dimensions for best GPU compatibility.

```csharp
// Check maximum texture size at runtime
int maxSize = _graphicsDevice.GraphicsProfile == GraphicsProfile.HiDef
    ? 4096   // HiDef supports at least 4096
    : 2048;  // Reach profile guarantees 2048
```

---

## Multi-Atlas Strategy

Large games won't fit everything on one atlas. Group sprites by **usage context** to maximize batching within each draw layer:

```
atlas_overworld.png    — tilemap + overworld NPCs + items
atlas_dungeon.png      — dungeon tiles + enemies + traps
atlas_ui.png           — buttons, icons, fonts, HUD elements
atlas_particles.png    — all particle sprites + trails
atlas_portraits.png    — character portraits (loaded on demand)
```

Each atlas aligns with a rendering layer, so sprites within a layer share a texture and batch efficiently.

---

## Gotchas

| Issue | Solution |
|-------|----------|
| Texture bleeding (visible seam lines between atlas regions) | Add 1–2px padding between regions; use `SamplerState.PointClamp` for pixel art |
| Runtime packer runs out of space | Create overflow atlases or increase initial size; sort sprites largest-first before packing for better utilization |
| `RenderTarget2D` content lost on device reset (fullscreen toggle) | Listen for `GraphicsDevice.DeviceReset` and re-pack; or use `SetData` on a regular `Texture2D` instead |
| Color premultiplication mismatch | MonoGame Content Pipeline premultiplies alpha by default; `Texture2D.FromStream` does not. Use `BlendState.NonPremultiplied` for runtime-loaded textures, or premultiply manually |
| SpriteSortMode.Texture re-orders draws | Correct for opaque sprites, but breaks transparency order. Use `BackToFront` when transparency matters |

---

## Combining with ECS

If using an ECS (see [G93 ECS Library Integration](./G93_ecs_library_integration.md)), store atlas references on sprite components:

```csharp
public struct SpriteComponent
{
    /// <summary>
    /// Index into a shared atlas array — avoids storing Texture2D references
    /// on every entity. The render system resolves the index to an atlas.
    /// </summary>
    public byte AtlasIndex;
    public Rectangle SourceRect;
    public float LayerDepth;
    public Color Tint;
}

// Render system — group by AtlasIndex for minimal texture switches
public static void RenderSystem(
    World world, SpriteBatch batch, TextureAtlas[] atlases)
{
    // Sort by atlas index to minimize texture switches
    // (or use SpriteSortMode.Texture and let SpriteBatch handle it)
    var query = new QueryDescription().WithAll<Position, SpriteComponent>();

    world.Query(in query, (ref Position pos, ref SpriteComponent sprite) =>
    {
        var atlas = atlases[sprite.AtlasIndex];
        batch.Draw(
            atlas.Texture,
            new Vector2(pos.X, pos.Y),
            sprite.SourceRect,
            sprite.Tint,
            0f,
            Vector2.Zero,
            1f,
            SpriteEffects.None,
            sprite.LayerDepth);
    });
}
```

---

## Summary

Texture atlases are the single highest-impact rendering optimization in 2D MonoGame games. Pack related sprites onto shared textures to minimize draw calls. Use build-time atlases for known assets (content pipeline + XML descriptors) and runtime packing for dynamic content (mods, procedural textures). Choose the right `SpriteSortMode` for each rendering layer, measure with `GraphicsDevice.Metrics`, and group atlases by usage context to keep draw calls under 50 per frame.
