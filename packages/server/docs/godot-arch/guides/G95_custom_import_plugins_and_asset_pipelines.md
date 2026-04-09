# G95 — Custom Import Plugins & Asset Pipelines

> **Category:** guide · **Engine:** Godot 4.x · **Related:** [G19 Custom Resources & Plugins](./G19_custom_resources_and_plugins.md) · [G35 Editor Tool Scripts](./G35_editor_tool_scripts.md) · [G20 CI/CD & Export Pipelines](./G20_cicd_and_export_pipelines.md) · [G61 Async Resource Loading](./G61_async_resource_loading.md)

Build custom file importers, post-import processors, and automated asset pipelines in Godot 4.x. This guide covers EditorImportPlugin for custom file formats, EditorScenePostImportPlugin for GLTF/FBX post-processing, Blender-to-Godot workflows, and batch asset processing for production pipelines.

---

## Table of Contents

1. [How Godot's Import System Works](#1-how-godots-import-system-works)
2. [EditorImportPlugin — Custom File Formats](#2-editorimportplugin--custom-file-formats)
3. [Import Options and Presets](#3-import-options-and-presets)
4. [EditorScenePostImportPlugin — 3D Post-Processing](#4-editorscenepostimportplugin--3d-post-processing)
5. [Blender Integration Pipeline](#5-blender-integration-pipeline)
6. [Resource Post-Import Scripts](#6-resource-post-import-scripts)
7. [Batch Asset Processing](#7-batch-asset-processing)
8. [Custom Texture Importers](#8-custom-texture-importers)
9. [Reimport Automation and File Watchers](#9-reimport-automation-and-file-watchers)
10. [Production Pipeline Architecture](#10-production-pipeline-architecture)
11. [Common Mistakes](#11-common-mistakes)

---

## 1. How Godot's Import System Works

When a file appears in `res://`, Godot's import system activates:

1. **Detection** — The editor matches the file extension to a registered importer.
2. **Import dialog** — The user configures import options (or defaults apply).
3. **Conversion** — The importer reads the source file and produces a Godot-native resource (`.tres`, `.res`, `.scn`, images as `.ctex`).
4. **Caching** — The converted resource is stored in `.godot/imported/` with a `.import` sidecar file in the source directory.
5. **Reimport** — If the source file or options change, reimport runs automatically.

Custom importers hook into step 2–4. You register an `EditorImportPlugin` that tells the editor: "I handle `.xyz` files, here are my options, and here's how to convert them."

---

## 2. EditorImportPlugin — Custom File Formats

### GDScript — Importing a Custom Tileset Format

Suppose your team uses a `.tilecfg` JSON format that defines tile properties:

```gdscript
# addons/tile_importer/tile_import_plugin.gd
@tool
extends EditorImportPlugin

func _get_importer_name() -> String:
    return "my_studio.tile_config_importer"

func _get_visible_name() -> String:
    return "Tile Configuration"

func _get_recognized_extensions() -> PackedStringArray:
    return PackedStringArray(["tilecfg"])

func _get_save_extension() -> String:
    return "tres"  # Save as a .tres Resource

func _get_resource_type() -> String:
    return "Resource"

func _get_priority() -> float:
    return 1.0

func _get_preset_count() -> int:
    return 1

func _get_preset_name(preset_index: int) -> String:
    return "Default"

func _get_import_order() -> int:
    return 0  # Lower = imported earlier

func _get_import_options(
    _path: String, preset_index: int
) -> Array[Dictionary]:
    return [
        {
            "name": "tile_size",
            "default_value": 16,
            "property_hint": PROPERTY_HINT_RANGE,
            "hint_string": "8,128,1",
        },
        {
            "name": "generate_collision",
            "default_value": true,
        },
    ]

func _get_option_visibility(
    _path: String, _option_name: StringName, _options: Dictionary
) -> bool:
    return true  # All options always visible

func _import(
    source_file: String,
    save_path: String,
    options: Dictionary,
    _platform_variants: Array[String],
    _gen_files: Array[String],
) -> Error:
    # Read the source file
    var file := FileAccess.open(source_file, FileAccess.READ)
    if file == null:
        return FileAccess.get_open_error()

    var json_text: String = file.get_as_text()
    var json := JSON.new()
    var parse_err: Error = json.parse(json_text)
    if parse_err != OK:
        printerr("Tile config parse error at line %d: %s" % [
            json.get_error_line(), json.get_error_message()])
        return parse_err

    var data: Dictionary = json.data
    var tile_size: int = options["tile_size"]

    # Build a custom resource from the parsed data
    var tile_resource := TileSetConfig.new()
    tile_resource.tile_size = tile_size
    tile_resource.generate_collision = options["generate_collision"]

    # Parse tile definitions from JSON
    if data.has("tiles"):
        for tile_data: Dictionary in data["tiles"]:
            tile_resource.tile_ids.append(tile_data.get("id", 0))
            tile_resource.tile_names.append(tile_data.get("name", ""))
            tile_resource.tile_walkable.append(tile_data.get("walkable", true))

    # Save the converted resource
    # The save_path already has the correct base; append the extension
    var full_save_path: String = "%s.%s" % [save_path, _get_save_extension()]
    return ResourceSaver.save(tile_resource, full_save_path)
```

```gdscript
# addons/tile_importer/tile_set_config.gd
@tool
class_name TileSetConfig
extends Resource

@export var tile_size: int = 16
@export var generate_collision: bool = true
@export var tile_ids: PackedInt32Array = []
@export var tile_names: PackedStringArray = []
@export var tile_walkable: PackedByteArray = []  # 0 or 1
```

### C# — EditorImportPlugin

```csharp
#if TOOLS
using Godot;
using Godot.Collections;

[Tool]
public partial class TileImportPlugin : EditorImportPlugin
{
    public override string _GetImporterName() => "my_studio.tile_config_importer";
    public override string _GetVisibleName() => "Tile Configuration";
    public override string[] _GetRecognizedExtensions() => new[] { "tilecfg" };
    public override string _GetSaveExtension() => "tres";
    public override string _GetResourceType() => "Resource";
    public override float _GetPriority() => 1.0f;
    public override int _GetPresetCount() => 1;
    public override string _GetPresetName(int presetIndex) => "Default";
    public override int _GetImportOrder() => 0;

    public override Array<Dictionary> _GetImportOptions(
        string path, int presetIndex)
    {
        return new Array<Dictionary>
        {
            new Dictionary
            {
                { "name", "tile_size" },
                { "default_value", 16 },
                { "property_hint", (int)PropertyHint.Range },
                { "hint_string", "8,128,1" },
            },
            new Dictionary
            {
                { "name", "generate_collision" },
                { "default_value", true },
            },
        };
    }

    public override bool _GetOptionVisibility(
        string path, StringName optionName, Dictionary options) => true;

    public override Error _Import(
        string sourceFile, string savePath,
        Dictionary options,
        Array<string> platformVariants,
        Array<string> genFiles)
    {
        var file = FileAccess.Open(sourceFile, FileAccess.ModeFlags.Read);
        if (file == null)
            return FileAccess.GetOpenError();

        string jsonText = file.GetAsText();
        var json = new Json();
        var parseErr = json.Parse(jsonText);
        if (parseErr != Error.Ok)
            return parseErr;

        var data = json.Data.AsGodotDictionary();
        int tileSize = options["tile_size"].AsInt32();

        var resource = new Resource();
        resource.Set("tile_size", tileSize);

        string fullPath = $"{savePath}.{_GetSaveExtension()}";
        return ResourceSaver.Save(resource, fullPath);
    }
}
#endif
```

---

## 3. Import Options and Presets

Presets let you define named configurations. Users select a preset and it populates the options:

```gdscript
func _get_preset_count() -> int:
    return 3

func _get_preset_name(preset_index: int) -> String:
    match preset_index:
        0: return "Mobile (16px)"
        1: return "Desktop (32px)"
        2: return "HD (64px)"
        _: return "Default"

func _get_import_options(
    _path: String, preset_index: int
) -> Array[Dictionary]:
    var tile_size: int = [16, 32, 64][preset_index]
    return [
        {
            "name": "tile_size",
            "default_value": tile_size,
        },
        {
            "name": "generate_collision",
            "default_value": preset_index != 0,  # No collision on mobile
        },
    ]
```

Option visibility can be conditional — hide options that don't apply:

```gdscript
func _get_option_visibility(
    _path: String, option_name: StringName, options: Dictionary
) -> bool:
    # Only show collision margin if collision is enabled
    if option_name == &"collision_margin":
        return options.get("generate_collision", false)
    return true
```

---

## 4. EditorScenePostImportPlugin — 3D Post-Processing

For GLTF/FBX/Blend files, you don't write a full importer — you hook into the existing scene import pipeline with `EditorScenePostImportPlugin`:

### GDScript — Auto-Configure Imported 3D Scenes

```gdscript
# addons/scene_processor/scene_post_import.gd
@tool
extends EditorScenePostImportPlugin

func _get_internal_option_visibility(
    _category: int, _for_animation: bool, _option: String
) -> Variant:
    return null  # Use default visibility

func _post_process(scene: Node) -> void:
    # Recursively process the imported scene tree
    _process_node(scene)

func _process_node(node: Node) -> void:
    # Auto-generate StaticBody3D for mesh nodes with "-col" suffix
    if node is MeshInstance3D and node.name.ends_with("-col"):
        _add_static_collision(node)

    # Auto-set material overrides for nodes with "-metal" suffix
    if node is MeshInstance3D and node.name.ends_with("-metal"):
        _apply_metal_material(node)

    # Process children
    for child: Node in node.get_children():
        _process_node(child)

func _add_static_collision(mesh_node: MeshInstance3D) -> void:
    if mesh_node.mesh == null:
        return
    # Create a trimesh collision body
    var body := StaticBody3D.new()
    body.name = mesh_node.name.replace("-col", "") + "_body"
    var shape := CollisionShape3D.new()
    shape.shape = mesh_node.mesh.create_trimesh_shape()
    body.add_child(shape)
    mesh_node.add_child(body)

func _apply_metal_material(mesh_node: MeshInstance3D) -> void:
    var mat := StandardMaterial3D.new()
    mat.metallic = 0.9
    mat.roughness = 0.1
    mat.metallic_specular = 0.8
    mesh_node.material_override = mat
```

### Register in Plugin

```gdscript
# plugin.gd
@tool
extends EditorPlugin

var post_import_plugin: EditorScenePostImportPlugin

func _enter_tree() -> void:
    post_import_plugin = preload(
        "res://addons/scene_processor/scene_post_import.gd").new()
    add_scene_post_import_plugin(post_import_plugin)

func _exit_tree() -> void:
    remove_scene_post_import_plugin(post_import_plugin)
```

### C# — Scene Post-Import

```csharp
#if TOOLS
using Godot;

[Tool]
public partial class ScenePostImport : EditorScenePostImportPlugin
{
    public override void _PostProcess(Node scene)
    {
        ProcessNode(scene);
    }

    private void ProcessNode(Node node)
    {
        if (node is MeshInstance3D mesh && node.Name.ToString().EndsWith("-col"))
        {
            AddStaticCollision(mesh);
        }

        foreach (var child in node.GetChildren())
        {
            ProcessNode(child);
        }
    }

    private void AddStaticCollision(MeshInstance3D meshNode)
    {
        if (meshNode.Mesh == null) return;

        var body = new StaticBody3D();
        body.Name = meshNode.Name.ToString().Replace("-col", "") + "_body";
        var shape = new CollisionShape3D();
        shape.Shape = meshNode.Mesh.CreateTrimeshShape();
        body.AddChild(shape);
        meshNode.AddChild(body);
    }
}
#endif
```

---

## 5. Blender Integration Pipeline

Godot 4.x can import `.blend` files directly if Blender is installed. Configure the Blender path in **Editor → Editor Settings → FileSystem → Import → Blender → Blender Path**.

### Naming Conventions for Auto-Import

Godot's built-in Blender importer respects naming suffixes on objects:

| Suffix | Effect |
|--------|--------|
| `-col` | Generates a convex collision shape |
| `-convcol` | Generates a single convex collision shape |
| `-colonly` | Generates collision but removes the visual mesh |
| `-navmesh` | Generates a NavigationMesh |
| `-rigid` | Imports as RigidBody3D |
| `-noimp` | Skips import entirely |

### Post-Import Script (per-file)

For per-file customization, assign a post-import script in the Import dock. This script runs after the scene is built:

```gdscript
# post_import_dungeon.gd — assigned via Import dock
@tool
extends EditorScenePostImport

func _post_import(scene: Node) -> Object:
    # Process all meshes — assign layers, adjust scale
    _walk(scene)
    return scene  # Return the modified scene

func _walk(node: Node) -> void:
    if node is MeshInstance3D:
        # Assign to render layer 2 for all dungeon meshes
        node.layers = 2

    if node is Light3D:
        # Reduce shadow resolution for imported lights
        node.shadow_enabled = true
        node.directional_shadow_mode = DirectionalLight3D.SHADOW_ORTHOGONAL

    for child: Node in node.get_children():
        _walk(child)
```

### Advanced: Hot-Reload Workflow

For rapid iteration, combine Blender file watching with Godot's auto-reimport:

1. Keep `.blend` files in `res://models/`.
2. Godot auto-reimports when the `.blend` file is saved in Blender.
3. Use `EditorScenePostImportPlugin` to apply consistent post-processing.
4. Scenes using the imported model update live in the editor.

---

## 6. Resource Post-Import Scripts

Beyond 3D scenes, you can run post-processing on any resource type by using `EditorPlugin._handles()` and reimport hooks:

```gdscript
# Automatically apply import settings to all PNGs in a specific folder
@tool
extends EditorPlugin

func _enter_tree() -> void:
    var fs: EditorFileSystem = EditorInterface.get_resource_filesystem()
    fs.resources_reimported.connect(_on_resources_reimported)

func _on_resources_reimported(resources: PackedStringArray) -> void:
    for path: String in resources:
        if path.begins_with("res://sprites/") and path.ends_with(".png"):
            _configure_sprite_import(path)

func _configure_sprite_import(path: String) -> void:
    # Access the .import file settings
    var import_cfg := ConfigFile.new()
    var import_path: String = path + ".import"
    if import_cfg.load(import_path) != OK:
        return

    # Force pixel-art settings
    import_cfg.set_value("params", "compress/mode", 0)  # Lossless
    import_cfg.set_value("params", "texture/filter", 0)  # Nearest
    import_cfg.save(import_path)

    # Trigger reimport
    EditorInterface.get_resource_filesystem().reimport_files(
        PackedStringArray([path]))
```

---

## 7. Batch Asset Processing

For large projects, process assets in bulk using an `@tool` script or editor menu:

```gdscript
# addons/batch_processor/batch_tool.gd
@tool
extends EditorPlugin

func _enter_tree() -> void:
    add_tool_menu_item("Batch: Optimize All Textures", _batch_optimize)

func _exit_tree() -> void:
    remove_tool_menu_item("Batch: Optimize All Textures")

func _batch_optimize() -> void:
    var dir := DirAccess.open("res://textures/")
    if dir == null:
        printerr("Cannot open textures directory")
        return

    var files_to_reimport: PackedStringArray = PackedStringArray()

    dir.list_dir_begin()
    var file_name: String = dir.get_next()
    while file_name != "":
        if file_name.ends_with(".png") or file_name.ends_with(".jpg"):
            var full_path: String = "res://textures/" + file_name
            _set_texture_compression(full_path)
            files_to_reimport.append(full_path)
        file_name = dir.get_next()
    dir.list_dir_end()

    if files_to_reimport.size() > 0:
        EditorInterface.get_resource_filesystem().reimport_files(
            files_to_reimport)
        print("Reimported %d textures" % files_to_reimport.size())

func _set_texture_compression(path: String) -> void:
    var cfg := ConfigFile.new()
    var import_path: String = path + ".import"
    if cfg.load(import_path) != OK:
        return
    # Use VRAM compression for 3D textures, lossless for UI
    if path.contains("/ui/"):
        cfg.set_value("params", "compress/mode", 0)  # Lossless
    else:
        cfg.set_value("params", "compress/mode", 2)  # VRAM Compressed
    cfg.save(import_path)
```

---

## 8. Custom Texture Importers

For specialized texture formats (heightmaps, normal maps from custom tools):

```gdscript
@tool
extends EditorImportPlugin

func _get_importer_name() -> String:
    return "my_studio.heightmap_importer"

func _get_visible_name() -> String:
    return "Heightmap (RAW)"

func _get_recognized_extensions() -> PackedStringArray:
    return PackedStringArray(["raw", "r16"])

func _get_save_extension() -> String:
    return "res"

func _get_resource_type() -> String:
    return "Image"

func _get_preset_count() -> int:
    return 1

func _get_preset_name(_preset_index: int) -> String:
    return "Default"

func _get_import_options(
    _path: String, _preset_index: int
) -> Array[Dictionary]:
    return [
        {"name": "width", "default_value": 1024},
        {"name": "height", "default_value": 1024},
        {"name": "bits_per_pixel", "default_value": 16},
    ]

func _get_option_visibility(
    _path: String, _option: StringName, _options: Dictionary
) -> bool:
    return true

func _import(
    source_file: String, save_path: String,
    options: Dictionary,
    _platform_variants: Array[String],
    _gen_files: Array[String],
) -> Error:
    var file := FileAccess.open(source_file, FileAccess.READ)
    if file == null:
        return FileAccess.get_open_error()

    var width: int = options["width"]
    var height: int = options["height"]
    var bpp: int = options["bits_per_pixel"]

    var image := Image.create(width, height, false, Image.FORMAT_RF)

    for y: int in range(height):
        for x: int in range(width):
            var value: float
            if bpp == 16:
                value = float(file.get_16()) / 65535.0
            else:
                value = float(file.get_8()) / 255.0
            image.set_pixel(x, y, Color(value, value, value, 1.0))

    var texture := ImageTexture.create_from_image(image)
    var full_path: String = "%s.%s" % [save_path, _get_save_extension()]
    return ResourceSaver.save(texture, full_path)
```

---

## 9. Reimport Automation and File Watchers

### Watching for External File Changes

```gdscript
# React to file changes from external tools (Blender, Photoshop, etc.)
@tool
extends EditorPlugin

func _enter_tree() -> void:
    var fs: EditorFileSystem = EditorInterface.get_resource_filesystem()
    fs.filesystem_changed.connect(_on_filesystem_changed)
    fs.resources_reimported.connect(_on_reimported)

func _on_filesystem_changed() -> void:
    # Scan for new/modified files in watched directories
    print("Filesystem changed — scanning for updates")

func _on_reimported(resources: PackedStringArray) -> void:
    for path: String in resources:
        print("Reimported: ", path)
        # Run post-processing, update caches, notify team tools, etc.
```

---

## 10. Production Pipeline Architecture

For team projects, layer your import pipeline:

```
External Tools (Blender, Photoshop, Tiled)
    ↓  save files to res://
Godot Auto-Import (built-in importers)
    ↓  converts to native formats
EditorScenePostImportPlugin (collision, LOD, layers)
    ↓  post-processes 3D scenes
Custom EditorImportPlugin (proprietary formats)
    ↓  converts custom data
EditorPlugin reimport hooks (batch rules, conventions)
    ↓  enforces project standards
CI/CD Export (see G20)
    ↓  builds final game
```

**Key principles:**

- **Convention over configuration** — Use naming suffixes (`-col`, `-lod1`) instead of per-file import settings where possible.
- **Idempotent imports** — Running the import twice should produce the same result. Never depend on import order between files unless using `_get_import_order()`.
- **Version the `.import` files** — Commit `.import` sidecar files to version control so the team shares the same import settings.
- **Don't version `.godot/imported/`** — The converted cache is machine-specific. Add it to `.gitignore`.

---

## 11. Common Mistakes

| Mistake | Fix |
|---------|-----|
| Returning wrong `_get_save_extension()` | Must match the format you pass to `ResourceSaver.save()`. Use `"tres"` for text resources, `"res"` for binary. |
| Forgetting to register the plugin | Add/remove your import plugin in `_enter_tree()` / `_exit_tree()` using `add_import_plugin()`. |
| Import plugin not appearing | Ensure `@tool` annotation is on the script. EditorImportPlugin only works in tool mode. |
| Modifying source files during import | Never write to the source file in `_import()`. Only write to `save_path`. |
| Not handling parse errors | Always check return values from `FileAccess.open()`, `JSON.parse()`, etc. Return an `Error` code so the editor can report failures. |
| Circular reimport loops | Don't trigger `reimport_files()` from within `_on_resources_reimported()` for the same file. Track which files you've already processed. |
