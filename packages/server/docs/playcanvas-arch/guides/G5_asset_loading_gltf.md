# PlayCanvas Asset Loading — glTF, Compression & Production Pipelines

> **Category:** guide · **Engine:** PlayCanvas v2+ · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md), [Scripting System](G1_scripting_system.md), [PlayCanvas Rules](../playcanvas-rules.md)

PlayCanvas uses glTF 2.0 / GLB as its primary 3D asset format. The engine's `ContainerResource` system loads GLB files into self-contained bundles of meshes, materials, textures, and animations that can be instantiated into the scene graph as entities. This guide covers the asset pipeline from authoring through compression to runtime loading and optimization.

## Asset Loading Fundamentals

### The Asset Registry

All assets in PlayCanvas flow through the `AssetRegistry` (`app.assets`). Assets can be loaded in three ways:

1. **Preloaded** — downloaded before `app.start()` completes (set `preload: true` in the Editor or via code)
2. **On-demand** — loaded at runtime via `loadFromUrl()` or by enabling a component that references the asset
3. **Dependent** — automatically loaded when a parent asset requires them (e.g., textures referenced by a material)

### Loading a GLB at Runtime

Use `loadFromUrl` with the `"container"` type to load a GLB file and get a `ContainerResource`:

```typescript
// Load a GLB file at runtime
this.app.assets.loadFromUrl(
  "models/enemy.glb",
  "container",
  (err: string | null, asset?: pc.Asset) => {
    if (err) {
      console.error("Failed to load GLB:", err);
      return;
    }

    // asset.resource is a ContainerResource
    const container: pc.ContainerResource = asset!.resource;

    // Create an entity hierarchy with render components
    const entity = container.instantiateRenderEntity();
    entity.setLocalScale(0.01, 0.01, 0.01); // adjust scale if needed
    this.app.root.addChild(entity);
  }
);
```

### Preloading Assets via the Editor

In the PlayCanvas Editor, every asset has a **Preload** checkbox (enabled by default). Preloaded assets download during the loading screen before any script `initialize()` methods run. This is the right choice for player models, UI sprites, level geometry, and any asset needed at startup.

For assets loaded later (distant levels, optional cosmetics), disable preloading and load them on-demand to reduce initial load time.

## ContainerResource API

A `ContainerResource` is the parsed result of a GLB file. It holds all the data needed to instantiate entities:

### Instantiation Methods

```typescript
// Preferred: creates entities with RenderComponent (modern pipeline)
const entity = container.instantiateRenderEntity({
  castShadows: true,
  receiveShadows: true,
});

// Legacy: creates entity with ModelComponent
const legacyEntity = container.instantiateModelEntity();
```

**Use `instantiateRenderEntity()`** for all new projects — it uses the modern render pipeline and supports instancing, morph targets, and per-instance material overrides.

### Material Variants (glTF extension)

If the GLB includes `KHR_materials_variants`, you can switch materials at runtime:

```typescript
// List available variants
const variants: string[] = container.getMaterialVariants();
// e.g., ["Damaged", "Clean", "Night"]

// Apply a variant to the entire entity hierarchy
container.applyMaterialVariant(entity, "Damaged");

// Reset to default materials
container.applyMaterialVariant(entity, null);

// Apply to specific mesh instances only
container.applyMaterialVariantInstances(meshInstances, "Night");
```

### Animations from GLB

Animations embedded in a GLB are accessible via the container:

```typescript
// The container stores animation assets
// Assign them to an Anim component on the entity
const animComponent = entity.addComponent("anim", {
  activate: true,
});

// Access animations from the container resource
const animations = container.animations;
```

## glTF Compression Pipeline

### GLB vs JSON Performance

PlayCanvas benchmarks show GLB is **~17× faster** to parse than the legacy JSON format (0.19s vs 3.3s for equivalent content) with similar gzipped download sizes. Always use GLB for production.

### Draco Mesh Compression

Draco compresses mesh geometry (vertices, normals, UVs, indices) by 80–95%. PlayCanvas supports the `KHR_draco_mesh_compression` glTF extension.

**Setup for runtime Draco decoding:**

```typescript
// Register the Draco decoder before loading Draco-compressed GLBs
// The decoder WASM must be served from your asset server
const containerHandler = this.app.loader.getHandler("container") as pc.ContainerHandler;

// Point to the Draco decoder files
// These ship with the PlayCanvas engine npm package
containerHandler.decoderModule = {
  url: "lib/draco/draco_decoder.wasm",
  fallbackUrl: "lib/draco/draco_decoder.js",
};
```

**Compressing GLBs with Draco:**

```bash
# Using gltf-pipeline (CesiumGS)
npx gltf-pipeline -i model.glb -o model_draco.glb --draco.compressionLevel 7

# Using gltfpack (meshoptimizer)
gltfpack -i model.glb -o model_opt.glb -cc
```

**Gotcha:** If you export from Blender with Draco compression enabled AND then run an additional Draco pass, textures may fail to load. Apply Draco compression as a separate post-export step.

### Basis Universal Texture Compression

Basis Universal (via the `KHR_texture_basisu` extension) compresses textures into a GPU-ready supercompressed format that transcodes at load time to the best format for the device (BC7 on desktop, ASTC on mobile, ETC2 elsewhere).

```bash
# Compress textures to Basis with KTX2 container
# Using the KTX-Software CLI
toktx --t2 --bcmp --clevel 2 output.ktx2 input.png
```

PlayCanvas Editor handles Basis compression automatically when you import textures — toggle the **Basis** option in Asset Tasks project settings.

## Asset Tags and Group Loading

Tags let you organize assets by level, category, or priority and load them as a group:

```typescript
// Find all assets tagged for level 2
const level2Assets = this.app.assets.findByTag("level-2");

// Track loading progress
let loaded = 0;
const total = level2Assets.length;

level2Assets.forEach((asset: pc.Asset) => {
  asset.once("load", () => {
    loaded++;
    if (loaded === total) {
      console.log("Level 2 fully loaded");
      this.startLevel2();
    }
  });
  this.app.assets.load(asset);
});
```

You can also query with multiple tags: `findByTag("level-2", "geometry")` returns assets that have **both** tags.

## Production Optimization Patterns

### 1. Streaming by Distance

Load distant assets on-demand as the player approaches:

```typescript
// In an ESM script's update method
const dist = this.entity.getPosition().distance(playerPos);

if (dist < this.loadRadius && !this.assetLoaded) {
  this.assetLoaded = true;
  this.app.assets.loadFromUrl(this.glbUrl, "container", (err, asset) => {
    if (!err && asset) {
      const entity = asset.resource.instantiateRenderEntity();
      this.entity.addChild(entity);
    }
  });
}
```

### 2. Instance Reuse

When spawning many copies of the same model (trees, enemies, projectiles), load the container once and instantiate multiple times:

```typescript
// Load once
const treeAsset = this.app.assets.find("tree.glb");
const treeContainer: pc.ContainerResource = treeAsset.resource;

// Instantiate many
for (let i = 0; i < 100; i++) {
  const tree = treeContainer.instantiateRenderEntity();
  tree.setLocalPosition(
    Math.random() * 200 - 100,
    0,
    Math.random() * 200 - 100
  );
  this.app.root.addChild(tree);
}
```

Each call to `instantiateRenderEntity()` creates new entities but **shares** the underlying mesh and texture GPU resources.

### 3. Cleanup

Destroy entities and release assets when no longer needed:

```typescript
// Remove entity from scene
entity.destroy();

// If the asset was loaded via loadFromUrl and is no longer needed
this.app.assets.remove(asset);
asset.unload(); // releases GPU resources
```

## Performance Considerations

- **GLB > JSON** — always ship GLB in production. Parse time alone is an order of magnitude faster.
- **Draco + Basis together** — compress geometry with Draco and textures with Basis for maximum reduction. A 50 MB uncompressed scene can drop to 3–5 MB on the wire.
- **Preload strategically** — preload only what's needed for the first screen. Stream the rest. Too many preloaded assets increase time-to-interactive.
- **Share GPU resources** — `instantiateRenderEntity()` shares mesh/texture data across instances. Don't re-load the same GLB for each copy.
- **Texture memory on mobile** — mobile GPUs have 1–2 GB total. Use Basis transcoding to pick the right compressed format per device. Avoid uncompressed RGBA textures larger than 1024×1024 on mobile.
- **gzip/brotli your GLBs** — GLB is a binary container but not pre-compressed. Serve with `Content-Encoding: br` for an additional 30–50% size reduction.
