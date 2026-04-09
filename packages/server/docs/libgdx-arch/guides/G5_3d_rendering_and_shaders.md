# G5 — libGDX 3D Rendering and Shaders

> **Category:** guide · **Engine:** libGDX · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Getting Started](../guides/G1_getting_started.md) · [Kotlin Patterns](../guides/G2_kotlin_patterns.md) · [Scene2D UI](../reference/R1_scene2d_ui.md) · [libGDX Rules](../libgdx-arch-rules.md)

---

## Overview

libGDX's 3D API is built around a small set of core classes in `com.badlogic.gdx.graphics.g3d`. The central class is **ModelBatch**, which manages the entire rendering pipeline: gathering render calls, assigning shaders, sorting for correctness and performance, and executing GPU draws.

The API follows a provider pattern — shaders, sorting, and render context are all pluggable via interfaces.

---

## Core Architecture

### Class Hierarchy

```
ModelBatch (orchestrates everything)
├── ShaderProvider → creates/caches Shader instances
│   └── DefaultShaderProvider → creates DefaultShader
├── RenderableSorter → orders draw calls
│   └── DefaultRenderableSorter → opaque front-to-back, transparent back-to-front
├── RenderContext → prevents redundant GL state changes
│   └── DefaultTextureBinder → manages texture unit binds
└── RenderableProvider (interface) → supplies Renderable objects
    └── ModelInstance → most common implementation
```

### Key Classes

| Class | Purpose |
|-------|---------|
| `Model` | Loaded 3D model data (meshes, materials, nodes, animations). Shared resource — load once. |
| `ModelInstance` | A positioned instance of a Model. Holds transform, materials (can override). One Model → many instances. |
| `ModelBatch` | The rendering orchestrator. Heavyweight — create once, reuse every frame. |
| `Environment` | Lighting and environmental attributes (directional lights, point lights, fog, etc.) |
| `Material` | Collection of `Attribute` objects defining surface appearance (color, texture, blending, etc.) |
| `Renderable` | A single draw call: mesh part + material + transform + shader. Internal to ModelBatch. |
| `PerspectiveCamera` | 3D camera with field-of-view, near/far planes, position, and direction. |

---

## Basic 3D Setup (Java)

```java
public class Game3D extends ApplicationAdapter {
    private PerspectiveCamera camera;
    private ModelBatch modelBatch;
    private Environment environment;
    private AssetManager assets;
    private Model model;
    private ModelInstance instance;

    @Override
    public void create() {
        // Camera setup
        camera = new PerspectiveCamera(
            67,                          // FOV in degrees
            Gdx.graphics.getWidth(),
            Gdx.graphics.getHeight()
        );
        camera.position.set(10f, 10f, 10f);
        camera.lookAt(0, 0, 0);
        camera.near = 1f;
        camera.far = 300f;
        camera.update();

        // ModelBatch — create once, reuse every frame
        modelBatch = new ModelBatch();

        // Lighting
        environment = new Environment();
        environment.set(new ColorAttribute(
            ColorAttribute.AmbientLight, 0.4f, 0.4f, 0.4f, 1f
        ));
        environment.add(new DirectionalLight().set(
            0.8f, 0.8f, 0.8f,   // Color (white)
            -1f, -0.8f, -0.2f   // Direction
        ));

        // Load model via AssetManager (async-friendly)
        assets = new AssetManager();
        assets.load("spaceship.g3db", Model.class);
        assets.finishLoading();  // Block until loaded

        model = assets.get("spaceship.g3db", Model.class);
        instance = new ModelInstance(model);
    }

    @Override
    public void render() {
        Gdx.gl.glViewport(0, 0,
            Gdx.graphics.getWidth(), Gdx.graphics.getHeight());
        Gdx.gl.glClear(
            GL20.GL_COLOR_BUFFER_BIT | GL20.GL_DEPTH_BUFFER_BIT
        );

        modelBatch.begin(camera);
        modelBatch.render(instance, environment);
        modelBatch.end();  // Actual GPU rendering happens here
    }

    @Override
    public void dispose() {
        modelBatch.dispose();
        assets.dispose();  // Disposes all loaded assets including model
    }
}
```

### Kotlin Equivalent

```kotlin
class Game3D : ApplicationAdapter() {
    private lateinit var camera: PerspectiveCamera
    private lateinit var modelBatch: ModelBatch
    private lateinit var environment: Environment
    private lateinit var assets: AssetManager
    private lateinit var instance: ModelInstance

    override fun create() {
        camera = PerspectiveCamera(67f,
            Gdx.graphics.getWidth().toFloat(),
            Gdx.graphics.getHeight().toFloat()
        ).apply {
            position.set(10f, 10f, 10f)
            lookAt(0f, 0f, 0f)
            near = 1f
            far = 300f
            update()
        }

        modelBatch = ModelBatch()

        environment = Environment().apply {
            set(ColorAttribute(ColorAttribute.AmbientLight,
                0.4f, 0.4f, 0.4f, 1f))
            add(DirectionalLight().set(
                0.8f, 0.8f, 0.8f, -1f, -0.8f, -0.2f))
        }

        assets = AssetManager().apply {
            load("spaceship.g3db", Model::class.java)
            finishLoading()
        }

        instance = ModelInstance(
            assets.get("spaceship.g3db", Model::class.java)
        )
    }

    override fun render() {
        Gdx.gl.glViewport(0, 0,
            Gdx.graphics.getWidth(), Gdx.graphics.getHeight())
        Gdx.gl.glClear(
            GL20.GL_COLOR_BUFFER_BIT or GL20.GL_DEPTH_BUFFER_BIT)

        modelBatch.begin(camera)
        modelBatch.render(instance, environment)
        modelBatch.end()
    }

    override fun dispose() {
        modelBatch.dispose()
        assets.dispose()
    }
}
```

---

## ModelBatch Deep Dive

### Lifecycle

```
create() → new ModelBatch()
                ↓
render() → modelBatch.begin(camera)
           modelBatch.render(instance, environment)  // Queues render calls
           modelBatch.render(anotherInstance)         // Can add many
           modelBatch.end()                          // Sorts + renders all
                ↓
dispose() → modelBatch.dispose()
```

**Key rules:**
- Do NOT modify the camera between `begin()` and `end()` — if you must switch cameras, call `modelBatch.setCamera(newCamera)` (triggers a flush)
- Do NOT make raw OpenGL calls between `begin()` and `end()` — this breaks ModelBatch's state tracking
- Actual GPU rendering happens at `end()`, not at `render()` — render calls are queued and sorted first

### Render Call Sorting

`DefaultRenderableSorter` applies two strategies:

1. **Opaque objects** → sorted front-to-back (early depth rejection saves fragment shader work)
2. **Transparent objects** → sorted back-to-front (correct alpha blending requires this order)

Transparency is determined by `BlendingAttribute.blended` on the material. If your transparent objects look wrong, check that this attribute is set.

### Custom Sorting

For games with many objects sharing the same shader/texture, sorting by material can reduce GPU state switches:

```java
ModelBatch batch = new ModelBatch(new RenderableSorter() {
    @Override
    public void sort(Camera camera, Array<Renderable> renderables) {
        // Sort by shader first, then by mesh, to minimize state changes
        renderables.sort((a, b) -> {
            int shaderCmp = Integer.compare(
                a.shader.hashCode(), b.shader.hashCode()
            );
            if (shaderCmp != 0) return shaderCmp;
            return Integer.compare(
                a.meshPart.mesh.hashCode(),
                b.meshPart.mesh.hashCode()
            );
        });
    }
});
```

---

## Environment and Lighting

### Light Types

```java
Environment env = new Environment();

// Ambient light — uniform illumination everywhere
env.set(new ColorAttribute(
    ColorAttribute.AmbientLight, 0.3f, 0.3f, 0.3f, 1f
));

// Directional light — sun-like, infinite distance
env.add(new DirectionalLight().set(
    Color.WHITE,
    new Vector3(-1f, -0.5f, 0f)  // Direction toward light source
));

// Point light — position + color + intensity
env.add(new PointLight().set(
    Color.YELLOW,
    new Vector3(5f, 3f, 0f),  // Position
    20f                         // Intensity (falloff distance)
));
```

### DefaultShader Light Limits

The `DefaultShader` has compile-time limits on light counts. Exceeding them silently drops lights:

```java
DefaultShader.Config config = new DefaultShader.Config();
config.numDirectionalLights = 2;  // Default: 2
config.numPointLights = 5;        // Default: 5
config.numSpotLights = 0;         // Default: 0
config.numBones = 16;             // For skeletal animation

ModelBatch batch = new ModelBatch(
    new DefaultShaderProvider(config)
);
```

**Performance tip:** Set these to exactly what your scene uses. Each additional light slot generates shader code even if unused.

---

## Materials and Attributes

Materials are collections of `Attribute` objects. The most common:

```java
Material material = new Material();

// Diffuse color
material.set(ColorAttribute.createDiffuse(Color.RED));

// Diffuse texture
material.set(TextureAttribute.createDiffuse(myTexture));

// Specular highlight
material.set(ColorAttribute.createSpecular(Color.WHITE));
material.set(FloatAttribute.createShininess(16f));

// Transparency
material.set(new BlendingAttribute(GL20.GL_SRC_ALPHA,
    GL20.GL_ONE_MINUS_SRC_ALPHA));

// Per-instance material override
ModelInstance inst = new ModelInstance(model);
inst.materials.get(0).set(
    ColorAttribute.createDiffuse(Color.BLUE)
);
```

---

## Custom Shaders

### The Shader Interface

ModelBatch uses the `Shader` interface to abstract GPU rendering:

```java
public interface Shader extends Disposable {
    void init();
    int compareTo(Shader other);
    boolean canRender(Renderable instance);
    void begin(Camera camera, RenderContext context);
    void render(Renderable renderable);
    void end();
}
```

### Custom ShaderProvider

The easiest way to use custom shaders — extend `DefaultShaderProvider`:

```java
public class MyShaderProvider extends DefaultShaderProvider {
    @Override
    protected Shader createShader(Renderable renderable) {
        // Use custom shader for materials with a specific attribute
        if (renderable.material.has(TextureAttribute.Emissive)) {
            return new MyEmissiveShader(renderable);
        }
        // Fall back to default for everything else
        return super.createShader(renderable);
    }
}

ModelBatch batch = new ModelBatch(new MyShaderProvider());
```

### Writing a Basic Custom Shader

```java
public class MyEmissiveShader extends DefaultShader {
    private static final String VERTEX = Gdx.files.internal(
        "shaders/emissive.vert").readString();
    private static final String FRAGMENT = Gdx.files.internal(
        "shaders/emissive.frag").readString();

    public MyEmissiveShader(Renderable renderable) {
        super(renderable, new Config(), VERTEX, FRAGMENT);
    }

    @Override
    public boolean canRender(Renderable instance) {
        return instance.material.has(TextureAttribute.Emissive);
    }

    @Override
    public void render(Renderable renderable) {
        // Set custom uniforms before rendering
        TextureAttribute emissive = (TextureAttribute)
            renderable.material.get(TextureAttribute.Emissive);
        if (emissive != null) {
            int unit = context.textureBinder.bind(
                emissive.textureDescription
            );
            program.setUniformi("u_emissiveTexture", unit);
        }
        super.render(renderable);
    }
}
```

### GLSL Shader Example (emissive.frag)

```glsl
#ifdef GL_ES
precision mediump float;
#endif

varying vec2 v_texCoords;
varying vec3 v_normal;
varying vec3 v_lightDir;

uniform sampler2D u_diffuseTexture;
uniform sampler2D u_emissiveTexture;
uniform vec4 u_ambientLight;

void main() {
    vec4 diffuse = texture2D(u_diffuseTexture, v_texCoords);
    vec4 emissive = texture2D(u_emissiveTexture, v_texCoords);

    // Basic directional lighting
    float NdotL = max(dot(normalize(v_normal),
                         normalize(v_lightDir)), 0.0);
    vec4 lit = diffuse * (u_ambientLight + NdotL);

    // Add emissive glow (unaffected by lighting)
    gl_FragColor = lit + emissive;
}
```

---

## Procedural Geometry with ModelBuilder

For generated meshes (terrain, voxels, debug shapes):

```java
ModelBuilder builder = new ModelBuilder();

// Quick helper for simple shapes
Model box = builder.createBox(
    2f, 2f, 2f,                    // Width, height, depth
    new Material(ColorAttribute.createDiffuse(Color.GREEN)),
    VertexAttributes.Usage.Position |
    VertexAttributes.Usage.Normal
);

// Complex manual mesh
builder.begin();
MeshPartBuilder part = builder.part(
    "terrain",
    GL20.GL_TRIANGLES,
    VertexAttributes.Usage.Position |
    VertexAttributes.Usage.Normal |
    VertexAttributes.Usage.TextureCoordinates,
    new Material(TextureAttribute.createDiffuse(terrainTexture))
);

// Add vertices for a terrain grid
for (int x = 0; x < width - 1; x++) {
    for (int z = 0; z < depth - 1; z++) {
        float y00 = heightmap[x][z];
        float y10 = heightmap[x + 1][z];
        float y01 = heightmap[x][z + 1];
        float y11 = heightmap[x + 1][z + 1];

        // Triangle 1
        part.triangle(
            new Vector3(x, y00, z),
            new Vector3(x + 1, y10, z),
            new Vector3(x, y01, z + 1)
        );
        // Triangle 2
        part.triangle(
            new Vector3(x + 1, y10, z),
            new Vector3(x + 1, y11, z + 1),
            new Vector3(x, y01, z + 1)
        );
    }
}

Model terrain = builder.end();
```

---

## Performance Best Practices

1. **Create ModelBatch once** — it allocates native resources (shader programs). Create in `create()`, dispose in `dispose()`.

2. **Frustum cull before rendering** — ModelBatch does NOT cull. Check visibility yourself:
   ```java
   if (camera.frustum.boundsInFrustum(instance.transform.getTranslation(tmp),
       boundingRadius)) {
       modelBatch.render(instance, environment);
   }
   ```

3. **Tune DefaultShader.Config** — default allocates 5 point lights and 2 directional lights in shader code. If you use fewer, reduce them.

4. **Use ModelCache for static geometry** — merges multiple ModelInstances into fewer draw calls:
   ```java
   ModelCache cache = new ModelCache();
   cache.begin(camera);
   for (ModelInstance inst : staticObjects) {
       cache.add(inst);
   }
   cache.end();
   // Now render the cache as one call
   modelBatch.render(cache, environment);
   ```

5. **Minimize material variety** — each unique material combination can trigger a different shader variant. Texture atlases help.

6. **Batch before you optimize shaders** — reducing draw call count matters more than micro-optimizing fragment shaders for most indie 3D games.

---

## Model Formats

libGDX supports these 3D formats:

| Format | Extension | Notes |
|--------|-----------|-------|
| G3DJ | `.g3dj` | JSON format — human-readable, good for debugging |
| G3DB | `.g3db` | Binary format — smaller, faster to load, use for release builds |
| OBJ | `.obj` | Basic mesh + material — no animations |
| GLTF | `.gltf`/`.glb` | Via gdx-gltf extension — modern standard, PBR materials |

**Recommended workflow:** Author in Blender → export to GLTF → convert with fbx-conv or use gdx-gltf for runtime loading.

```java
// Using gdx-gltf (recommended for PBR)
SceneAsset sceneAsset = new SceneAsset();
// ... load via AssetManager with GLTFAssetLoader
```
