# DLC and Content Pack Distribution

> **Category:** guide · **Engine:** Godot 4.x · **Related:** [G46_modding_and_ugc](G46_modding_and_ugc.md), [G20_cicd_and_export_pipelines](G20_cicd_and_export_pipelines.md), [G11_save_load_systems](G11_save_load_systems.md), [G61_async_resource_loading](G61_async_resource_loading.md)

Distribute post-launch content in Godot 4.x using pack files (PCK/ZIP), delta patching (4.6+), Steam DLC integration, and dynamic content loading patterns. Covers architecture for extensible games that ship content updates without full rebuilds.

---

## How Godot Pack Files Work

Godot's resource system treats PCK files as virtual filesystems. When a pack is loaded, its contents overlay the main project's `res://` namespace. If the pack contains `res://levels/bonus_level.tscn`, it becomes accessible exactly like a built-in resource.

Key properties:
- **PCK files** are Godot's native binary pack format (fastest loading, smallest overhead)
- **ZIP files** work identically but are slower to seek and larger on disk
- Packs can **override** existing resources — a DLC pack containing `res://items/sword.tres` replaces the base game's version
- Multiple packs can be loaded; **last loaded wins** for overlapping paths
- Packs respect Godot's resource UID system (4.x), so renamed files tracked by UID still resolve

---

## 1. Creating Content Packs

### From the Editor

1. Create a separate Godot project (or use the same project with export presets)
2. In **Project → Export**, add a platform preset
3. Under **Resources → Export Mode**, choose "Export selected resources (and dependencies)"
4. Select only the DLC resources
5. Click **Export PCK/ZIP** (not "Export Project")

### From the Command Line (CI/CD Friendly)

```bash
# Export a PCK containing only the DLC content
# The --export-pack flag generates a .pck without the engine binary
godot --headless --path /path/to/dlc_project --export-pack "Linux" dlc_chapter2.pck
```

### GDScript — Runtime PCK Generation (Advanced)

```gdscript
## pck_builder.gd — Build a PCK from a directory of resources at runtime.
## Useful for modding tools or user-generated content export.
class_name PCKBuilder
extends RefCounted

## Pack a directory into a PCK file.
## source_dir: absolute path to a directory of Godot resources
## output_path: where to write the .pck file
static func pack_directory(source_dir: String, output_path: String) -> Error:
    var packer := PCKPacker.new()
    var err := packer.pck_start(output_path)
    if err != OK:
        return err

    # Recursively add all files
    var files: PackedStringArray = _get_all_files(source_dir)
    for file_path: String in files:
        # Convert absolute path to res:// relative path
        var res_path: String = "res://" + file_path.trim_prefix(source_dir + "/")
        err = packer.add_file(res_path, file_path)
        if err != OK:
            push_error("Failed to add %s: %s" % [file_path, error_string(err)])

    return packer.flush()

static func _get_all_files(path: String) -> PackedStringArray:
    var files: PackedStringArray = []
    var dir := DirAccess.open(path)
    if not dir:
        return files
    dir.list_dir_begin()
    var file_name: String = dir.get_next()
    while file_name != "":
        var full_path: String = path.path_join(file_name)
        if dir.current_is_dir():
            files.append_array(_get_all_files(full_path))
        else:
            # Skip .import files — they are editor artifacts
            if not file_name.ends_with(".import"):
                files.append(full_path)
        file_name = dir.get_next()
    return files
```

---

## 2. Loading Content Packs at Runtime

### GDScript — DLC Loader

```gdscript
## dlc_loader.gd — Autoload for managing downloadable content packs
class_name DLCLoader
extends Node

signal dlc_loaded(pack_id: String)
signal dlc_load_failed(pack_id: String, error: String)

## Registry of loaded packs: pack_id -> metadata
var _loaded_packs: Dictionary = {}

## Directory where DLC packs are stored on the user's machine
var _dlc_directory: String = OS.get_executable_path().get_base_dir() \
    .path_join("dlc")

func _ready() -> void:
    # Ensure DLC directory exists
    DirAccess.make_dir_recursive_absolute(_dlc_directory)

## Scan for and load all available DLC packs.
## Call this on game startup after the main menu is ready.
func scan_and_load_all() -> void:
    var dir := DirAccess.open(_dlc_directory)
    if not dir:
        return
    dir.list_dir_begin()
    var file_name: String = dir.get_next()
    while file_name != "":
        if file_name.ends_with(".pck") or file_name.ends_with(".zip"):
            var pack_id: String = file_name.get_basename()
            load_pack(pack_id, _dlc_directory.path_join(file_name))
        file_name = dir.get_next()

## Load a specific DLC pack by file path.
func load_pack(pack_id: String, path: String) -> bool:
    if _loaded_packs.has(pack_id):
        push_warning("DLC '%s' already loaded" % pack_id)
        return true

    if not FileAccess.file_exists(path):
        dlc_load_failed.emit(pack_id, "File not found: %s" % path)
        return false

    # ProjectSettings.load_resource_pack() merges the PCK into res://
    # The second argument (replace_files) controls whether pack resources
    # override existing ones. true = DLC can patch base game resources.
    var success: bool = ProjectSettings.load_resource_pack(path, true)
    if success:
        _loaded_packs[pack_id] = {
            "path": path,
            "loaded_at": Time.get_unix_time_from_system(),
        }
        # Load DLC manifest if it provides one
        _load_manifest(pack_id)
        dlc_loaded.emit(pack_id)
    else:
        dlc_load_failed.emit(pack_id, "Failed to load pack file")
    return success

## Check if a specific DLC is available and loaded.
func is_loaded(pack_id: String) -> bool:
    return _loaded_packs.has(pack_id)

## Get list of all loaded DLC IDs.
func get_loaded_packs() -> Array[String]:
    var ids: Array[String] = []
    for key: String in _loaded_packs:
        ids.append(key)
    return ids

## Load a DLC manifest file that declares what content the pack provides.
func _load_manifest(pack_id: String) -> void:
    var manifest_path: String = "res://dlc/%s/manifest.json" % pack_id
    if not ResourceLoader.exists(manifest_path):
        return
    var file := FileAccess.open(manifest_path, FileAccess.READ)
    if not file:
        return
    var json := JSON.new()
    if json.parse(file.get_as_text()) == OK:
        _loaded_packs[pack_id]["manifest"] = json.data
```

### C# — DLC Loading

```csharp
using Godot;
using System.Collections.Generic;

/// <summary>
/// Manages loading and tracking of DLC content packs.
/// Register as an autoload singleton.
/// </summary>
public partial class DlcLoader : Node
{
    [Signal] public delegate void DlcLoadedEventHandler(string packId);
    [Signal] public delegate void DlcLoadFailedEventHandler(string packId, string error);

    private readonly Dictionary<string, Dictionary<string, Variant>> _loadedPacks = new();
    private string _dlcDirectory;

    public override void _Ready()
    {
        _dlcDirectory = OS.GetExecutablePath().GetBaseDir()
            .PathJoin("dlc");
        DirAccess.MakeDirRecursiveAbsolute(_dlcDirectory);
    }

    /// <summary>
    /// Load a DLC pack from the given path. Returns true on success.
    /// </summary>
    public bool LoadPack(string packId, string path)
    {
        if (_loadedPacks.ContainsKey(packId))
        {
            GD.PushWarning($"DLC '{packId}' already loaded");
            return true;
        }

        if (!FileAccess.FileExists(path))
        {
            EmitSignal(SignalName.DlcLoadFailed, packId,
                $"File not found: {path}");
            return false;
        }

        // load_resource_pack merges pack contents into res://
        bool success = ProjectSettings.LoadResourcePack(path, replaceFiles: true);
        if (success)
        {
            _loadedPacks[packId] = new Dictionary<string, Variant>
            {
                ["path"] = path,
                ["loaded_at"] = Time.GetUnixTimeFromSystem(),
            };
            EmitSignal(SignalName.DlcLoaded, packId);
        }
        else
        {
            EmitSignal(SignalName.DlcLoadFailed, packId,
                "Failed to load pack file");
        }
        return success;
    }

    public bool IsLoaded(string packId) => _loadedPacks.ContainsKey(packId);

    /// <summary>
    /// Scan the DLC directory and load all .pck files found.
    /// </summary>
    public void ScanAndLoadAll()
    {
        using var dir = DirAccess.Open(_dlcDirectory);
        if (dir == null) return;

        dir.ListDirBegin();
        string fileName = dir.GetNext();
        while (fileName != "")
        {
            if (fileName.EndsWith(".pck") || fileName.EndsWith(".zip"))
            {
                string packId = fileName.GetBaseName();
                LoadPack(packId, _dlcDirectory.PathJoin(fileName));
            }
            fileName = dir.GetNext();
        }
    }
}
```

---

## 3. DLC Manifest Pattern

Each DLC pack includes a manifest declaring its content, version, and dependencies. This lets the game build menus, check compatibility, and display what's installed.

```json
{
    "id": "chapter_2",
    "version": "1.0.0",
    "display_name": "Chapter 2: The Frozen North",
    "description": "Continue the adventure through icy tundra and ancient ruins.",
    "min_game_version": "1.2.0",
    "dependencies": [],
    "content": {
        "levels": ["res://dlc/chapter_2/levels/tundra_01.tscn"],
        "characters": ["res://dlc/chapter_2/characters/frost_mage.tres"],
        "items": ["res://dlc/chapter_2/items/ice_sword.tres"]
    }
}
```

### GDScript — Manifest Validation

```gdscript
## dlc_manifest.gd — Parse and validate DLC manifest files
class_name DLCManifest
extends RefCounted

var id: String
var version: String
var display_name: String
var description: String
var min_game_version: String
var dependencies: Array[String]
var content: Dictionary

static func from_dict(data: Dictionary) -> DLCManifest:
    var manifest := DLCManifest.new()
    manifest.id = data.get("id", "")
    manifest.version = data.get("version", "0.0.0")
    manifest.display_name = data.get("display_name", "Unknown DLC")
    manifest.description = data.get("description", "")
    manifest.min_game_version = data.get("min_game_version", "0.0.0")
    manifest.dependencies = []
    for dep: String in data.get("dependencies", []):
        manifest.dependencies.append(dep)
    manifest.content = data.get("content", {})
    return manifest

## Check if this DLC is compatible with the current game version.
func is_compatible(current_game_version: String) -> bool:
    return _compare_versions(current_game_version, min_game_version) >= 0

## Simple semver comparison. Returns -1, 0, or 1.
static func _compare_versions(a: String, b: String) -> int:
    var a_parts: PackedStringArray = a.split(".")
    var b_parts: PackedStringArray = b.split(".")
    for i: int in maxi(a_parts.size(), b_parts.size()):
        var a_val: int = int(a_parts[i]) if i < a_parts.size() else 0
        var b_val: int = int(b_parts[i]) if i < b_parts.size() else 0
        if a_val < b_val:
            return -1
        if a_val > b_val:
            return 1
    return 0
```

---

## 4. Delta Patching (Godot 4.6+)

Godot 4.6 introduced **delta PCK encoding** for export workflows, reducing update sizes by encoding only the differences between pack versions.

### How Delta Patching Works

1. The export pipeline compares the new PCK against a baseline PCK
2. Only changed/added resources are included in the delta pack
3. At runtime, the delta pack is loaded on top of the base pack — Godot's overlay system handles the rest

### Command Line — Generating a Delta Pack

```bash
# Generate a delta patch between two versions
# baseline.pck = version players already have
# full_new.pck = the complete updated version
# delta.pck = the output (only differences)
godot --headless --export-pack-patch baseline.pck full_new.pck delta.pck
```

### GDScript — Applying a Patch Pack

```gdscript
## patch_manager.gd — Apply delta patches to the running game
class_name PatchManager
extends Node

signal patch_applied(version: String)
signal patch_failed(error: String)

var _patches_dir: String = OS.get_executable_path().get_base_dir() \
    .path_join("patches")

## Apply all pending patches in version order.
func apply_pending_patches() -> void:
    DirAccess.make_dir_recursive_absolute(_patches_dir)
    var dir := DirAccess.open(_patches_dir)
    if not dir:
        return

    # Collect and sort patch files by name (assumes versioned naming)
    var patches: Array[String] = []
    dir.list_dir_begin()
    var file_name: String = dir.get_next()
    while file_name != "":
        if file_name.ends_with(".pck"):
            patches.append(file_name)
        file_name = dir.get_next()
    patches.sort()

    # Load patches in order — each overlays on top of previous
    for patch_file: String in patches:
        var path: String = _patches_dir.path_join(patch_file)
        var success: bool = ProjectSettings.load_resource_pack(path, true)
        if success:
            patch_applied.emit(patch_file.get_basename())
        else:
            patch_failed.emit("Failed to apply patch: %s" % patch_file)
            return  # Stop on first failure to maintain consistency
```

---

## 5. Steam DLC Integration

Steam manages DLC ownership through App IDs. Each DLC has its own App ID that the game checks at runtime.

### GDScript — Steam DLC Ownership Check

```gdscript
## steam_dlc.gd — Check Steam DLC ownership via GodotSteam
class_name SteamDLC
extends Node

## Map of DLC App IDs to internal pack names.
## Configure these to match your Steamworks DLC App IDs.
var _dlc_registry: Dictionary = {
    # Steam App ID -> internal pack ID
    12345: "chapter_2",
    12346: "soundtrack",
    12347: "cosmetics_pack_1",
}

## Check which DLCs the player owns and return their pack IDs.
func get_owned_dlc() -> Array[String]:
    var owned: Array[String] = []
    if not Steam.isSteamRunning():
        return owned

    var dlc_count: int = Steam.getDLCCount()
    for i: int in dlc_count:
        var dlc_data: Dictionary = Steam.getDLCDataByIndex(i)
        var app_id: int = dlc_data.get("app_id", 0)
        if Steam.isDLCInstalled(app_id) and _dlc_registry.has(app_id):
            owned.append(_dlc_registry[app_id])
    return owned

## Install a DLC that the player owns but hasn't downloaded yet.
func install_dlc(steam_app_id: int) -> void:
    if Steam.isDLCInstalled(steam_app_id):
        return
    Steam.installDLC(steam_app_id)
    # Listen for Steam's dlc_installed callback
    Steam.dlc_installed.connect(func(app_id: int) -> void:
        if app_id == steam_app_id:
            print("DLC %d installed" % app_id)
    , CONNECT_ONE_SHOT)
```

---

## 6. Content Registration Pattern

DLC packs need to register their content with the base game's systems (menus, level selectors, item databases). Use a registration pattern to keep coupling low.

### GDScript — DLC Content Registry

```gdscript
## dlc_content_registry.gd — Central registry for DLC-provided content
class_name DLCContentRegistry
extends Node

signal content_registered(category: String, id: String)

## category -> id -> resource_path
var _registry: Dictionary = {}

## Register a piece of DLC content with the game.
## Called by DLC initialization scripts after their pack loads.
func register(category: String, id: String, resource_path: String,
        metadata: Dictionary = {}) -> void:
    if not _registry.has(category):
        _registry[category] = {}
    _registry[category][id] = {
        "path": resource_path,
        "metadata": metadata,
    }
    content_registered.emit(category, id)

## Get all registered content in a category.
func get_all(category: String) -> Dictionary:
    return _registry.get(category, {})

## Check if specific content is available (DLC loaded).
func has_content(category: String, id: String) -> bool:
    return _registry.has(category) and _registry[category].has(id)

## Load and return a registered resource.
func load_content(category: String, id: String) -> Resource:
    if not has_content(category, id):
        return null
    var entry: Dictionary = _registry[category][id]
    return load(entry["path"])
```

### GDScript — DLC Initialization Script (Inside the Pack)

```gdscript
## res://dlc/chapter_2/init.gd — Runs when the Chapter 2 DLC pack loads.
## The DLC loader calls this after successfully loading the pack.
extends Node

func _ready() -> void:
    var registry: DLCContentRegistry = get_node("/root/DLCContentRegistry")

    # Register levels
    registry.register("levels", "tundra_01",
        "res://dlc/chapter_2/levels/tundra_01.tscn",
        {"display_name": "Frozen Tundra", "order": 10})

    # Register items
    registry.register("items", "ice_sword",
        "res://dlc/chapter_2/items/ice_sword.tres",
        {"display_name": "Frostbite Blade", "rarity": "legendary"})

    # Register characters
    registry.register("characters", "frost_mage",
        "res://dlc/chapter_2/characters/frost_mage.tres",
        {"display_name": "Frost Mage", "class": "spellcaster"})
```

---

## 7. Project Organization for DLC

```
my_game/
├── project.godot              # Base game project
├── scenes/
├── items/
├── dlc/                       # DLC content lives under res://dlc/
│   └── chapter_2/
│       ├── init.gd            # Registration script
│       ├── manifest.json      # Pack manifest
│       ├── levels/
│       ├── characters/
│       └── items/
└── export_presets.cfg         # Separate presets for base game + each DLC
```

**Export Preset Strategy:**
- Base game preset exports everything **except** `res://dlc/*`
- Each DLC preset exports **only** its `res://dlc/<pack_id>/*` subtree
- Shared assets referenced by DLC should live in the base game or be duplicated into the DLC subtree

---

## Best Practices

- **Namespace DLC content** under `res://dlc/<pack_id>/` to prevent path collisions between packs and the base game.
- **Version your manifests** so the game can reject incompatible DLC gracefully.
- **Test pack loading order** — if two DLCs modify the same resource, the last-loaded wins. Document expected load order.
- **Use ResourceLoader.exists()** to check for DLC resources before accessing them. This prevents errors when DLC is not installed.
- **Ship DLC packs alongside the game binary**, not inside the user data directory. `OS.get_executable_path().get_base_dir()` is the conventional location.
- **Delta patches stack** — players need the base PCK plus all sequential patches. Consider periodic "full" DLC rebuilds to cap the patch chain length.

---

## Common Pitfalls

| Pitfall | Solution |
|---------|----------|
| DLC scenes reference base-game scripts that moved | Use UIDs (`uid://`) for cross-pack references; avoid hardcoded paths |
| PCK built with different Godot version | Always build DLC packs with the exact same Godot version as the shipped game |
| Player uninstalls DLC but save file references DLC content | Guard all DLC resource loads with `ResourceLoader.exists()` checks |
| Large DLC packs slow down game startup | Load DLC packs lazily — only when the player enters DLC content areas |
| `.import` files included in PCK | Exclude `.import` from PCK builds; they are editor-only metadata |
