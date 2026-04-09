# R4 — 3D Development

> **Category:** reference · **Engine:** Defold · **Related:** [E1 Architecture Overview](../architecture/E1_architecture_overview.md) · [G9 Render Pipeline & Materials](../guides/G9_render_pipeline_and_materials.md) · [G7 Animation & Audio](../guides/G7_animation_and_audio.md)

---

## Defold's 3D Architecture

Defold is a 3D engine at its core — all rendering happens in 3D space, with 2D content displayed via orthographic projection. This means 3D support isn't bolted on; it's the foundation that 2D sits on top of. You can build fully 3D games, or mix 2D and 3D content in the same scene.

That said, Defold's 3D tooling is more minimal than dedicated 3D engines like Godot or Unity. There's no built-in lighting system (as of early 2026 — lighting components are planned), no terrain editor, and no visual shader graph. You work with model components, custom render scripts, and hand-written shaders.

---

## Model Components

A **model component** is how you get 3D meshes into Defold. It supports static meshes, skinned meshes with skeletal animation, and instanced rendering.

### Supported Format

Defold uses **glTF (.gltf)** as its 3D asset format. Export models from Blender, Maya, or other 3D tools as glTF.

### Adding a Model

1. Place your `.gltf` file in the project's asset directory.
2. Right-click a game object → **Add Component → Model**.
3. Set the component's properties:

| Property | Description |
|----------|-------------|
| **Mesh** | The `.gltf` file containing geometry. Uses the first mesh if the file contains multiple. |
| **Skeleton** | A `.gltf` file with bone hierarchy. Must have a single root bone. |
| **Animations** | An Animation Set file (`.animationset`) referencing one or more `.gltf` files with animation data. |
| **Default Animation** | The animation that plays automatically on load. |
| **Material** | Which material to use for rendering. |

### Built-In Materials

Defold provides four model materials out of the box:

| Material | Use Case |
|----------|----------|
| `model.material` | Static, non-instanced models |
| `model_instances.material` | Static models with GPU instancing |
| `model_skinned.material` | Skinned (animated) models, non-instanced |
| `model_skinned_instances.material` | Skinned models with GPU instancing |

Choose the instanced variant when you have many copies of the same mesh (trees, rocks, enemies) to reduce draw calls.

---

## Render Script Setup for 3D

**The default render script does not support 3D models.** You must modify it to enable depth testing and set up a 3D projection. Without this, models will render incorrectly or not at all.

### Minimal 3D Render Script Changes

```lua
function init(self)
    -- Predicate for 3D models (matches the "model" tag in materials)
    self.model_pred = render.predicate({"model"})

    -- Keep existing predicates for 2D
    self.tile_pred = render.predicate({"tile"})
    self.gui_pred = render.predicate({"gui"})
    self.particle_pred = render.predicate({"particle"})
end

function update(self)
    render.set_depth_mask(true)
    render.clear({
        [render.BUFFER_COLOR_BIT] = self.clear_color,
        [render.BUFFER_DEPTH_BIT] = 1,
    })

    -- === 3D pass ===
    render.enable_state(render.STATE_DEPTH_TEST)
    render.enable_state(render.STATE_CULL_FACE)  -- Backface culling
    render.set_depth_mask(true)

    -- Perspective projection for 3D
    local w = render.get_window_width()
    local h = render.get_window_height()
    local fov = math.pi * 0.5  -- 90 degrees
    local near = 0.1
    local far = 1000
    local aspect = w / h
    render.set_projection(vmath.matrix4_perspective(fov, aspect, near, far))

    -- Camera view matrix (set via camera component or manually)
    render.set_view(self.view)

    render.draw(self.model_pred)
    render.disable_state(render.STATE_CULL_FACE)

    -- === 2D pass ===
    -- Switch to orthographic projection for sprites, tilemaps, etc.
    render.set_depth_mask(false)
    render.disable_state(render.STATE_DEPTH_TEST)
    render.set_projection(vmath.matrix4_orthographic(0, w, 0, h, -1, 1))
    render.set_view(vmath.matrix4())

    render.draw(self.tile_pred)
    render.draw(self.particle_pred)

    -- === GUI pass ===
    render.draw(self.gui_pred)
end
```

### Mixed 2D/3D Rendering

When combining 2D and 3D, the typical approach is:

1. Render 3D models first with depth testing enabled.
2. Switch to orthographic projection and disable depth testing for 2D content.
3. Render GUI last, on top of everything.

For a 2.5D game (3D models on a 2D plane), you can use orthographic projection for both passes but keep depth testing enabled to handle model occlusion.

---

## Animation

### Playing Animations at Runtime

```lua
-- Play an animation once
model.play_anim("#model", "run", go.PLAYBACK_ONCE_FORWARD)

-- Play with blend transition (0.1 second crossfade)
model.play_anim("#model", "jump", go.PLAYBACK_ONCE_FORWARD, {
    blend_duration = 0.1
})

-- Play with completion callback
model.play_anim("#model", "attack", go.PLAYBACK_ONCE_FORWARD, {
    blend_duration = 0.1
}, function(self, message_id, message, sender)
    -- Attack animation finished, return to idle
    model.play_anim("#model", "idle", go.PLAYBACK_LOOP_FORWARD)
end)
```

### Animation Cursor Control

The animation cursor is a normalized value (0.0–1.0) representing playback position:

```lua
-- Get current animation position
local cursor = go.get("#model", "cursor")

-- Set animation to halfway point
go.set("#model", "cursor", 0.5)

-- Animate the cursor manually (e.g., scrubbing)
go.animate("#model", "cursor", go.PLAYBACK_LOOP_FORWARD, 1.0,
    go.EASING_LINEAR, 2.0)  -- Full cycle over 2 seconds

-- Control playback speed
go.set("#model", "playback_rate", 0.5)  -- Half speed
```

### Animation Sets

Animation sets let you combine animations from multiple glTF files:

```
-- player.animationset
animations {
  animation: "/assets/player_idle.gltf"
  animation: "/assets/player_run.gltf"
  animation: "/assets/player_attack.gltf"
}
```

---

## Runtime Material and Texture Control

### Tinting

```lua
-- Set model tint to red
go.set("#model", "tint", vmath.vector4(1, 0, 0, 1))

-- Animate tint (flash white on hit)
go.animate("#model", "tint", go.PLAYBACK_ONCE_PINGPONG,
    vmath.vector4(1, 1, 1, 1), go.EASING_LINEAR, 0.2)
```

### Swapping Textures at Runtime

```lua
-- Change texture on slot 0
go.set("#model", "texture0", resource.load("/assets/alt_skin.png"))
```

Texture slots go from `texture0` through `texture7`, matching sampler indices in the material's shader.

---

## Camera Setup for 3D

Defold doesn't have a built-in 3D camera component with orbit/follow behavior. You manage the view matrix yourself or use a community camera library.

### Manual Camera via Render Script Messages

```lua
-- In your camera.script
function init(self)
    self.position = vmath.vector3(0, 5, 10)
    self.target = vmath.vector3(0, 0, 0)
    self.up = vmath.vector3(0, 1, 0)
end

function update(self, dt)
    -- Follow a target game object
    local target_pos = go.get_position("/player")
    self.target = target_pos

    -- Offset the camera behind and above
    self.position = target_pos + vmath.vector3(0, 8, 12)

    -- Build and send the view matrix
    local view = vmath.matrix4_look_at(self.position, self.target, self.up)
    msg.post("@render:", "set_view_projection", {
        view = view,
    })
end
```

---

## Custom Shaders for 3D

Defold uses GLSL-based shaders. For 3D models, you typically need at minimum a vertex shader that handles the model-view-projection transform and a fragment shader for coloring.

### Minimal 3D Vertex Shader

```glsl
// model.vp
uniform highp mat4 view_proj;

attribute highp vec4 position;
attribute mediump vec2 texcoord0;
attribute mediump vec3 normal;

varying mediump vec2 var_texcoord0;
varying mediump vec3 var_normal;

void main()
{
    var_texcoord0 = texcoord0;
    var_normal = normalize((world * vec4(normal, 0.0)).xyz);
    gl_Position = view_proj * vec4(position.xyz, 1.0);
}
```

### Simple Directional Light Fragment Shader

```glsl
// model.fp
uniform lowp sampler2D tex0;
uniform lowp vec4 tint;

varying mediump vec2 var_texcoord0;
varying mediump vec3 var_normal;

void main()
{
    // Simple directional light from above-right
    vec3 light_dir = normalize(vec3(0.5, 1.0, 0.3));
    float ndotl = max(dot(var_normal, light_dir), 0.0);

    // Ambient + diffuse
    float lighting = 0.3 + 0.7 * ndotl;

    vec4 color = texture2D(tex0, var_texcoord0.xy);
    gl_FragColor = color * tint * vec4(lighting, lighting, lighting, 1.0);
}
```

**Note:** As of early 2026, Defold is working on adding a built-in Light component and shader pipeline improvements. Until then, you implement lighting in custom fragment shaders like the example above.

---

## Performance Considerations

**Use instancing for repeated meshes.** If you have 50 trees, use `model_instances.material` rather than 50 separate draw calls.

**Keep polygon counts reasonable.** Defold targets mobile and web — models in the low thousands of polygons work best. Use LOD (level of detail) switching via `go.set("#model", "mesh", ...)` if needed.

**Batch by material.** Models sharing the same material and texture are more efficiently rendered. Minimize unique material/texture combinations.

**glTF optimization.** Run models through [gltf-transform](https://gltf-transform.dev/) to compress textures, optimize meshes, and strip unused data before importing into Defold.

---

## Current Limitations (Early 2026)

| Feature | Status |
|---------|--------|
| glTF import | Supported (primary format) |
| Skeletal animation | Supported |
| GPU instancing | Supported |
| Built-in lighting | Planned (Light component in development) |
| Shadow mapping | Manual (custom render script + shadow pass) |
| Physics for 3D | 3D collision objects supported (box, sphere, capsule) |
| 3D audio spatialization | Basic distance attenuation via `sound.set_gain` |
| Terrain system | Not available — use tiled mesh approaches |
| Visual shader editor | Not available — write GLSL manually |
| WebGPU backend | Experimental (HTML5 builds) |

---

## Recommended Workflow

1. **Model in Blender/Maya** → export as glTF.
2. **Optimize** with gltf-transform (compress textures, reduce poly count).
3. **Import** into Defold by placing `.gltf` in your assets directory.
4. **Create a model component** on a game object, assign mesh + material.
5. **Modify the render script** to enable depth testing and set a perspective projection.
6. **Write custom shaders** for lighting, effects, and visual style.
7. **Test on target platforms** early — 3D performance varies significantly across mobile devices and web browsers.
