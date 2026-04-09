# G46 — Modding Support & User-Generated Content

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#
> **Related:** [G11 Save/Load Systems](./G11_save_load_systems.md) · [G19 Custom Resources & Plugins](./G19_custom_resources_and_plugins.md) · [G37 Scene Management](./G37_scene_management_and_transitions.md) · [G22 Mobile & Web Export](./G22_mobile_and_web_export.md)

---

## What This Guide Covers

Modding and user-generated content (UGC) can dramatically extend a game's lifespan and community. Godot provides several mechanisms for loading external content at runtime — PCK/ZIP resource packs, loose file loading, and sandboxed script execution. This guide covers how to architect a moddable game in Godot 4.x: loading PCK packs at runtime, importing loose assets (images, audio, 3D models), defining mod interfaces, managing load order and conflicts, and the critical security considerations when executing user-provided content.

**Use this guide when:** you want players or third-party creators to add new levels, items, characters, audio, or gameplay modifications to your shipped game.

---

## Table of Contents

1. [Modding Architecture Overview](#1-modding-architecture-overview)
2. [PCK Resource Packs](#2-pck-resource-packs)
3. [Loading Loose Files at Runtime](#3-loading-loose-files-at-runtime)
4. [Designing a Mod Interface](#4-designing-a-mod-interface)
5. [Mod Discovery and Load Order](#5-mod-discovery-and-load-order)
6. [Conflict Resolution](#6-conflict-resolution)
7. [Security Considerations](#7-security-considerations)
8. [Mod Configuration and Metadata](#8-mod-configuration-and-metadata)
9. [Distributing Mod Tools](#9-distributing-mod-tools)
10. [C# Considerations](#10-c-considerations)
11. [Common Mistakes](#11-common-mistakes)

---

## 1. Modding Architecture Overview

There are three main strategies for enabling mods in Godot, each with different trade-offs:

| Strategy | Content Types | Requires Godot Editor | Script Support | Security Risk |
|----------|--------------|----------------------|----------------|---------------|
| PCK/ZIP packs | Scenes, scripts, resources, assets | Yes (to author) | Full GDScript | **High** — arbitrary code |
| Loose file loading | Images, audio, 3D models, JSON | No | None (data only) | **Low** — no code execution |
| Hybrid (data + hooks) | Data files + predefined callbacks | No | Limited (via signals) | **Medium** — controlled surface |

**Recommendation:** Start with data-only mods (loose files or JSON-driven content). Only enable script-bearing PCK mods if your game genuinely needs them, and document the security implications clearly.

### Filesystem Paths

Godot uses three path prefixes relevant to modding:

- `res://` — The project's packed resources. Read-only after export.
- `user://` — Per-user writable directory (`~/.local/share/godot/app_userdata/` on Linux, `%APPDATA%` on Windows, `~/Library/Application Support/` on macOS).
- Absolute paths — System paths like `/home/user/mods/` or `C:\Games\MyGame\mods\`.

Mods typically live in `user://mods/` or a `mods/` folder next to the executable.

---

## 2. PCK Resource Packs

### Creating a PCK Programmatically

Use `PCKPacker` to build a pack at runtime or in a tool script:

```gdscript
func create_mod_pack(mod_path: String, output_path: String) -> Error:
    var packer := PCKPacker.new()
    var err := packer.pck_start(output_path)
    if err != OK:
        return err

    # Add files with their virtual res:// paths
    packer.add_file("res://mods/my_mod/main.tscn", mod_path + "/main.tscn")
    packer.add_file("res://mods/my_mod/icon.png", mod_path + "/icon.png")

    return packer.flush()
```

### Loading a PCK at Runtime

```gdscript
## ModLoader.gd — Autoload singleton for managing mods
extends Node

signal mod_loaded(mod_name: String)
signal mod_load_failed(mod_name: String, reason: String)

var _loaded_mods: Dictionary[String, Dictionary] = {}

func load_mod_pack(pck_path: String, allow_override: bool = false) -> bool:
    if not FileAccess.file_exists(pck_path):
        mod_load_failed.emit(pck_path, "File not found")
        return false

    # Second argument controls whether the pack can override existing resources
    var success := ProjectSettings.load_resource_pack(pck_path, allow_override)
    if not success:
        mod_load_failed.emit(pck_path, "Failed to load resource pack")
        return false

    var mod_name := pck_path.get_file().get_basename()
    _loaded_mods[mod_name] = {
        "path": pck_path,
        "loaded_at": Time.get_ticks_msec(),
    }
    mod_loaded.emit(mod_name)
    return true
```

### C# Equivalent

```csharp
public partial class ModLoader : Node
{
    [Signal] public delegate void ModLoadedEventHandler(string modName);

    private readonly Dictionary<string, Variant> _loadedMods = new();

    public bool LoadModPack(string pckPath, bool allowOverride = false)
    {
        if (!FileAccess.FileExists(pckPath))
            return false;

        bool success = ProjectSettings.LoadResourcePack(pckPath, allowOverride);
        if (!success)
            return false;

        string modName = pckPath.GetFile().GetBaseName();
        _loadedMods[modName] = new Godot.Collections.Dictionary
        {
            { "path", pckPath },
            { "loaded_at", Time.GetTicksMsec() }
        };
        EmitSignal(SignalName.ModLoaded, modName);
        return true;
    }
}
```

### Important: Override Behavior

When `allow_override` is `true` (the default), files in the PCK can **replace** files already in the virtual filesystem. This is powerful for patching but dangerous for modding — a malicious mod could replace your game's core scripts.

```gdscript
# Safe: mods cannot override existing game files
ProjectSettings.load_resource_pack(pck_path, false)

# Unsafe: mods can replace any file in the virtual filesystem
ProjectSettings.load_resource_pack(pck_path, true)
```

---

## 3. Loading Loose Files at Runtime

For user-generated content that doesn't require the Godot editor (screenshots, custom textures, audio clips, level data as JSON), load files directly from disk.

### Images

```gdscript
func load_external_image(path: String) -> ImageTexture:
    var image := Image.new()
    var err: Error

    match path.get_extension().to_lower():
        "png":
            err = image.load_png_from_buffer(FileAccess.get_file_as_bytes(path))
        "jpg", "jpeg":
            err = image.load_jpg_from_buffer(FileAccess.get_file_as_bytes(path))
        "webp":
            err = image.load_webp_from_buffer(FileAccess.get_file_as_bytes(path))
        _:
            push_error("Unsupported image format: %s" % path.get_extension())
            return null

    if err != OK:
        push_error("Failed to load image: %s (error %d)" % [path, err])
        return null

    return ImageTexture.create_from_image(image)
```

### Audio (WAV)

Godot 4.4+ supports runtime WAV loading via `AudioStreamWAV`:

```gdscript
func load_external_wav(path: String) -> AudioStreamWAV:
    var file := FileAccess.open(path, FileAccess.READ)
    if not file:
        push_error("Cannot open WAV: %s" % path)
        return null

    var bytes := file.get_buffer(file.get_length())
    var stream := AudioStreamWAV.new()

    # Parse WAV header (simplified — real implementation should validate chunks)
    # Skip RIFF header (12 bytes), find "fmt " chunk
    var idx := 12
    while idx < bytes.size() - 8:
        var chunk_id := bytes.slice(idx, idx + 4).get_string_from_ascii()
        var chunk_size := bytes.decode_u32(idx + 4)
        if chunk_id == "fmt ":
            var channels := bytes.decode_u16(idx + 10)
            var sample_rate := bytes.decode_u32(idx + 12)
            var bits_per_sample := bytes.decode_u16(idx + 22)
            stream.mix_rate = sample_rate
            stream.stereo = channels == 2
            stream.format = AudioStreamWAV.FORMAT_16_BITS if bits_per_sample == 16 \
                else AudioStreamWAV.FORMAT_8_BITS
        elif chunk_id == "data":
            stream.data = bytes.slice(idx + 8, idx + 8 + chunk_size)
            break
        idx += 8 + chunk_size

    return stream
```

### 3D Models (glTF)

```gdscript
func load_external_gltf(path: String) -> Node3D:
    var gltf_doc := GLTFDocument.new()
    var gltf_state := GLTFState.new()

    var err := gltf_doc.append_from_file(path, gltf_state)
    if err != OK:
        push_error("Failed to load glTF: %s" % path)
        return null

    var scene: Node3D = gltf_doc.generate_scene(gltf_state)
    return scene
```

### JSON Data Files

For data-driven mods (new items, quests, balance tweaks):

```gdscript
func load_mod_data(path: String) -> Dictionary:
    var file := FileAccess.open(path, FileAccess.READ)
    if not file:
        push_error("Cannot open mod data: %s" % path)
        return {}

    var json := JSON.new()
    var err := json.parse(file.get_as_text())
    if err != OK:
        push_error("JSON parse error in %s at line %d: %s" % [
            path, json.get_error_line(), json.get_error_message()
        ])
        return {}

    if json.data is not Dictionary:
        push_error("Mod data root must be a Dictionary: %s" % path)
        return {}

    return json.data
```

---

## 4. Designing a Mod Interface

Define a clear contract that mods must follow. Use a base class or interface that mod scenes/scripts extend.

### Mod Manifest

Require every mod to include a `mod.json` manifest:

```json
{
    "id": "cool_sword_mod",
    "name": "Cool Sword Pack",
    "version": "1.2.0",
    "author": "ModderName",
    "description": "Adds 5 legendary swords.",
    "game_version_min": "1.0.0",
    "game_version_max": "2.0.0",
    "dependencies": [],
    "entry_scene": "res://mods/cool_sword_mod/main.tscn",
    "type": "content"
}
```

### Mod Entry Point

```gdscript
## mod_base.gd — Base class for all mod entry points
class_name ModBase
extends Node

## Called when the mod is first loaded. Register content here.
func _mod_init() -> void:
    pass

## Called when the mod is being unloaded. Clean up here.
func _mod_cleanup() -> void:
    pass

## Return mod metadata as a Dictionary.
func _get_mod_info() -> Dictionary:
    return {}
```

### Registration Pattern

```gdscript
## In your game's item registry (autoload)
extends Node

var _item_database: Dictionary[StringName, Resource] = {}

func register_item(id: StringName, item_resource: Resource) -> void:
    if id in _item_database:
        push_warning("Item '%s' already registered — skipping duplicate" % id)
        return
    _item_database[id] = item_resource

func get_item(id: StringName) -> Resource:
    return _item_database.get(id)
```

A mod's `_mod_init()` would call `ItemRegistry.register_item()` to add new items without touching the game's core code.

---

## 5. Mod Discovery and Load Order

```gdscript
## Scan a directory for mod packs or folders
func discover_mods(mods_dir: String) -> Array[Dictionary]:
    var mods: Array[Dictionary] = []
    var dir := DirAccess.open(mods_dir)
    if not dir:
        push_warning("Mods directory not found: %s" % mods_dir)
        return mods

    dir.list_dir_begin()
    var entry := dir.get_next()
    while entry != "":
        var full_path := mods_dir.path_join(entry)
        if entry.ends_with(".pck") or entry.ends_with(".zip"):
            mods.append({"type": "pack", "path": full_path, "name": entry.get_basename()})
        elif dir.current_is_dir():
            var manifest_path := full_path.path_join("mod.json")
            if FileAccess.file_exists(manifest_path):
                var data := load_mod_data(manifest_path)
                data["type"] = "folder"
                data["path"] = full_path
                mods.append(data)
        entry = dir.get_next()

    # Sort by priority or dependency order
    mods.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
        return a.get("id", "") < b.get("id", "")
    )
    return mods
```

---

## 6. Conflict Resolution

When multiple mods try to modify the same thing:

```gdscript
## Additive merging for item mods — last writer wins on individual fields
func merge_item_data(base: Dictionary, override: Dictionary) -> Dictionary:
    var result := base.duplicate(true)
    for key: String in override:
        if key in result and result[key] is Dictionary and override[key] is Dictionary:
            result[key] = merge_item_data(result[key], override[key])
        else:
            result[key] = override[key]
    return result
```

Log conflicts so players can debug load-order issues:

```gdscript
func _register_with_conflict_log(id: StringName, resource: Resource, mod_id: String) -> void:
    if id in _item_database:
        var existing_mod: String = _item_sources.get(id, "base_game")
        push_warning("Mod '%s' overrides item '%s' (previously from '%s')" % [
            mod_id, id, existing_mod
        ])
    _item_database[id] = resource
    _item_sources[id] = mod_id
```

---

## 7. Security Considerations

**This is the most important section.** Loading external content — especially PCK packs with scripts — is inherently dangerous.

### Threat Model

| Threat | Via PCK Scripts | Via Loose Files | Mitigation |
|--------|----------------|-----------------|------------|
| Arbitrary code execution | **Yes** | No | Disable PCK scripts, or sandbox |
| File system access | **Yes** | No | Run in restricted `user://` scope |
| Network access | **Yes** | No | Firewall or disable in mod sandbox |
| Malformed data crash | Possible | Possible | Validate all loaded data |
| Resource bomb (huge files) | Possible | Possible | Size limits, async loading |

### Best Practices

1. **Prefer data-only mods** — JSON, images, and audio carry no executable code.
2. **Never pass `allow_override = true`** unless you trust the source. A malicious PCK with `allow_override` can replace your game's autoloads.
3. **Validate all loaded data** — Check types, ranges, and sizes before using mod data.
4. **Set file size limits** — Reject files above a reasonable threshold.
5. **Load mods asynchronously** — Use `ResourceLoader.load_threaded_request()` for PCK content to prevent freezing the game.
6. **Warn players** — Display a clear warning when enabling mods that contain scripts.
7. **Resource script security** — Godot `.tres` and `.tscn` files can embed scripts. If loading user-provided resources, use `ResourceLoader.load()` with care and consider stripping script references.

```gdscript
## Validate mod data before using it
func validate_item_data(data: Dictionary) -> bool:
    if "name" not in data or data["name"] is not String:
        return false
    if "damage" in data:
        if data["damage"] is not float and data["damage"] is not int:
            return false
        if data["damage"] < 0 or data["damage"] > 99999:
            return false
    return true
```

---

## 8. Mod Configuration and Metadata

Let mods expose configurable settings:

```gdscript
## mod_config.gd — Persistent per-mod settings
class_name ModConfig
extends RefCounted

var _config_path: String
var _data: Dictionary = {}

func _init(mod_id: String) -> void:
    _config_path = "user://mod_configs/%s.json" % mod_id
    _load()

func get_value(key: String, default: Variant = null) -> Variant:
    return _data.get(key, default)

func set_value(key: String, value: Variant) -> void:
    _data[key] = value
    _save()

func _load() -> void:
    if FileAccess.file_exists(_config_path):
        var file := FileAccess.open(_config_path, FileAccess.READ)
        var json := JSON.new()
        if json.parse(file.get_as_text()) == OK:
            _data = json.data

func _save() -> void:
    DirAccess.make_dir_recursive_absolute(_config_path.get_base_dir())
    var file := FileAccess.open(_config_path, FileAccess.WRITE)
    file.store_string(JSON.stringify(_data, "\t"))
```

---

## 9. Distributing Mod Tools

If you want players to create mods:

1. **Document your mod interface** — Publish a modding guide with the manifest schema, available hooks, and example mods.
2. **Ship a mod template** — Include a minimal mod project that modders can clone.
3. **Consider a mod manager UI** — An in-game screen that lists installed mods, shows load order, and lets players enable/disable them.
4. **Use semantic versioning** — Check `game_version_min`/`game_version_max` in the manifest against your current build to warn about incompatible mods.

---

## 10. C# Considerations

As of Godot 4.4, **C# scripts inside PCK packs cannot be loaded at runtime** due to .NET assembly loading limitations. If your game uses C#:

- Mods must be data-only (JSON, images, audio, scenes without C# scripts).
- Or mods provide GDScript-based entry points that interop with your C# game via signals and method calls.
- The GDScript ↔ C# bridge works at runtime, so a GDScript mod can call methods on your C# nodes.

---

## 11. Common Mistakes

1. **Loading PCKs with `allow_override = true` by default** — This lets mods replace core game files. Always default to `false`.
2. **Not validating mod data** — A malformed JSON or oversized image can crash the game or exhaust memory.
3. **Blocking the main thread** — Large PCKs or many loose files should be loaded asynchronously.
4. **Hardcoding paths** — Use `OS.get_executable_path().get_base_dir()` for portable mod directories, not hardcoded system paths.
5. **Forgetting to handle mod removal** — If a player uninstalls a mod, saved games that reference mod content will break. Store mod dependency info in save files.
6. **No versioning** — Without manifest version checks, mod updates can silently break compatibility.
