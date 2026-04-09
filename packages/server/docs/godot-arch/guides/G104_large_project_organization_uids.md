# G104 — Large Project Organization: UIDs, Dependencies & Team Workflows

> **Category:** guide · **Engine:** Godot 4.4+ · **Related:** [G41 Godot 4.4–4.6 Features](./G41_godot_44_to_46_features.md) · [G44 Version Control for Godot](./G44_version_control_for_godot.md) · [G20 CI/CD & Export Pipelines](./G20_cicd_and_export_pipelines.md) · [G95 Custom Import Plugins & Asset Pipelines](./G95_custom_import_plugins_and_asset_pipelines.md) · [G53 Data-Driven Design](./G53_data_driven_design.md)

Small Godot projects work fine with loose folder conventions — but once a project grows past ~100 scenes, multiple contributors, and thousands of assets, organizational decisions compound. This guide covers the resource UID system (introduced in 4.0, universalized in 4.4), dependency management strategies, folder architecture patterns for large teams, and workflows that prevent merge conflicts and broken references.

---

## Table of Contents

1. [When Organization Starts Mattering](#1-when-organization-starts-mattering)
2. [The UID System — Path-Agnostic Resource References](#2-the-uid-system--path-agnostic-resource-references)
3. [.uid Files and Version Control](#3-uid-files-and-version-control)
4. [Upgrading Existing Projects to Universal UIDs](#4-upgrading-existing-projects-to-universal-uids)
5. [Folder Architecture Patterns](#5-folder-architecture-patterns)
6. [Resource Dependencies and Load Order](#6-resource-dependencies-and-load-order)
7. [Team Workflows and Merge Conflict Prevention](#7-team-workflows-and-merge-conflict-prevention)
8. [Scene Ownership and Locking](#8-scene-ownership-and-locking)
9. [Asset Import Pipeline for Teams](#9-asset-import-pipeline-for-teams)
10. [Autoload Management at Scale](#10-autoload-management-at-scale)
11. [Refactoring Safely](#11-refactoring-safely)
12. [Common Mistakes](#12-common-mistakes)

---

## 1. When Organization Starts Mattering

These are symptoms that your project has outgrown ad-hoc organization:

- Moving a script file breaks references in 5+ scenes.
- Two team members edit the same `.tscn` file and spend 30 minutes resolving merge conflicts.
- You can't find where a resource is used without grep.
- Autoloads have grown to 15+ singletons with unclear dependencies between them.
- Build times suffer because the import cache is constantly invalidated.

If any of these sound familiar, this guide is for you.

---

## 2. The UID System — Path-Agnostic Resource References

### How UIDs Work

Every resource in Godot can have a **Unique Identifier (UID)** — a 64-bit integer that persists even when the file is moved or renamed. When Godot saves a scene or resource, it can reference dependencies by UID instead of filesystem path:

```
# Path-based reference (fragile)
[ext_resource type="Script" path="res://scripts/player/player_controller.gd" id="1"]

# UID-based reference (resilient to renames)
[ext_resource type="Script" uid="uid://cn4a8b2kf7xqp" path="res://scripts/player/player_controller.gd" id="1"]
```

When a UID is present, Godot uses it as the **primary** lookup. The path is kept as a human-readable fallback but isn't required for resolution.

### What Has UIDs (Since 4.4)

Before Godot 4.4, only certain resource types (scenes, textures, etc.) had UID support. **Godot 4.4 universalized UIDs** to cover all resource types, including:

- GDScript files (`.gd`)
- C# scripts (`.cs`)
- Shaders (`.gdshader`)
- Any `Resource` subclass saved as `.tres` or `.res`

UIDs are stored in companion `.uid` files for types that don't embed metadata:

```
res://scripts/player/player_controller.gd
res://scripts/player/player_controller.gd.uid    ← contains the UID
```

### Referencing by UID in Code

```gdscript
# Load by UID — works even if the file has been moved
var player_scene: PackedScene = load("uid://d4k8m2nq7x3hp")

# Preload by UID (compile-time)
const PlayerScene: PackedScene = preload("uid://d4k8m2nq7x3hp")

# Check if a UID exists
var uid := ResourceUID.text_to_id("uid://d4k8m2nq7x3hp")
if ResourceUID.has_id(uid):
    var path := ResourceUID.get_id_path(uid)
    print("Resource is at: ", path)
```

```csharp
// Load by UID in C#
var playerScene = GD.Load<PackedScene>("uid://d4k8m2nq7x3hp");

// Preload equivalent — store as a static readonly
private static readonly PackedScene PlayerScene =
    GD.Load<PackedScene>("uid://d4k8m2nq7x3hp");
```

### When to Use UIDs vs. Paths

| Scenario | Use UIDs | Use Paths |
|----------|----------|-----------|
| Scene `ext_resource` references | ✅ Automatic since 4.4 | — |
| Code `load()`/`preload()` calls | ✅ For stable references | ✅ For readability in small projects |
| Dynamic content loading (DLC, mods) | — | ✅ Paths are human-readable |
| Data files (JSON, CSV) | — | ✅ External tools don't understand UIDs |

---

## 3. .uid Files and Version Control

### Critical Rule: Commit .uid Files

`.uid` files **must be committed** to version control. If they're missing, UID references break when the project is cloned:

```gitignore
# .gitignore — DO NOT ignore .uid files
# ❌ WRONG:
# *.uid

# ✅ CORRECT: .uid files are NOT in .gitignore
# They live alongside the source files and must be tracked
```

### Merge Conflicts in .uid Files

`.uid` files are small (one line) and rarely conflict. When they do, either side's UID is valid — pick one and update references:

```bash
# .uid file content is just a single UID line
# Example: uid://cn4a8b2kf7xqp
```

If two developers create the same new file independently (e.g., both add `enemy_spawner.gd`), they'll have different UIDs. Resolve by keeping one and deleting the other's `.uid` file, then letting Godot regenerate references on next project open.

---

## 4. Upgrading Existing Projects to Universal UIDs

Godot 4.4 includes a **UID upgrade tool** for projects created in 4.3 or earlier:

```
Project → Tools → Upgrade UIDs
```

This tool:

1. Scans all resources without UIDs.
2. Generates `.uid` files for scripts, shaders, and other newly supported types.
3. Updates scene and resource files to include UID references alongside paths.

**Run this once after upgrading to 4.4+**, then commit all generated `.uid` files.

```bash
# After running the upgrade tool, you'll see new .uid files
git add -A "*.uid"
git commit -m "chore: generate universal UIDs for Godot 4.4 upgrade"
```

---

## 5. Folder Architecture Patterns

### Pattern A: Feature-Based (Recommended for Most Projects)

Group all files for a feature together. This makes features portable and reduces cross-folder dependencies:

```
res://
├── features/
│   ├── player/
│   │   ├── player.tscn
│   │   ├── player_controller.gd
│   │   ├── player_stats.tres
│   │   ├── sprites/
│   │   │   └── player_idle.png
│   │   └── tests/
│   │       └── test_player_movement.gd
│   ├── enemies/
│   │   ├── base_enemy.tscn
│   │   ├── base_enemy.gd
│   │   └── enemy_data/
│   │       ├── slime.tres
│   │       └── skeleton.tres
│   └── inventory/
│       ├── inventory_ui.tscn
│       ├── inventory_manager.gd
│       └── item_database.tres
├── shared/
│   ├── shaders/
│   ├── fonts/
│   └── ui_components/
├── levels/
│   ├── level_01/
│   └── level_02/
└── autoloads/
    ├── game_state.gd
    └── audio_manager.gd
```

**Why this works:**

- Moving `features/player/` to another project copies everything it needs.
- Artists can work in `features/enemies/` without touching player files.
- Dependencies between features are explicit — if `player` needs `inventory`, it's a clear cross-feature dependency you can track.

### Pattern B: Type-Based (Traditional)

```
res://
├── scenes/
├── scripts/
├── textures/
├── audio/
└── data/
```

This breaks down quickly at scale: renaming a scene means updating script paths in a different folder, and finding "all files related to the player" requires searching everywhere.

### Pattern C: Hybrid (Large Teams)

```
res://
├── game/              ← Game-specific features (feature-based)
│   ├── characters/
│   ├── levels/
│   └── ui/
├── engine/            ← Reusable systems (type-based)
│   ├── state_machine/
│   ├── save_system/
│   └── audio_system/
└── content/           ← Pure data (type-based)
    ├── dialogue/
    ├── item_data/
    └── level_data/
```

---

## 6. Resource Dependencies and Load Order

### Visualizing Dependencies

Godot doesn't have a built-in dependency graph viewer, but you can inspect dependencies programmatically:

```gdscript
# List all dependencies of a scene
@tool
extends EditorScript

func _run() -> void:
    var path := "res://features/player/player.tscn"
    var deps := ResourceLoader.get_dependencies(path)
    print("Dependencies of %s:" % path)
    for dep in deps:
        print("  → ", dep)
```

```csharp
// C# EditorScript equivalent
#if TOOLS
using Godot;

[Tool]
public partial class ListDependencies : EditorScript
{
    public override void _Run()
    {
        string path = "res://features/player/player.tscn";
        string[] deps = ResourceLoader.GetDependencies(path);
        GD.Print($"Dependencies of {path}:");
        foreach (string dep in deps)
        {
            GD.Print($"  → {dep}");
        }
    }
}
#endif
```

### Circular Dependency Prevention

Godot handles circular resource dependencies gracefully (it won't infinite-loop), but they cause confusing load-order bugs. Prevent them with a rule:

**Features can depend on `shared/` and `engine/`, but not on each other.**

If two features need to communicate, use signals, autoloads, or an event bus — not direct resource references.

### Preload vs. Load

```gdscript
# preload() — resolved at parse time, adds to scene's dependency list
# Use for resources you always need
const HitEffect: PackedScene = preload("res://shared/effects/hit_effect.tscn")

# load() — resolved at runtime, doesn't block scene loading
# Use for optional or conditional resources
func _spawn_boss() -> void:
    var boss_scene: PackedScene = load("res://features/bosses/dragon.tscn")
    add_child(boss_scene.instantiate())
```

For large projects, prefer `load()` or `ResourceLoader.load_threaded_request()` to keep scene load times predictable.

---

## 7. Team Workflows and Merge Conflict Prevention

### The .tscn Merge Problem

Godot scene files (`.tscn`) are text-based but **not merge-friendly**. A single node reorder changes internal IDs throughout the file. Strategies:

#### Strategy 1: Scene Composition (Preferred)

Break large scenes into small, independently edited sub-scenes:

```
# Instead of one massive level.tscn with 500 nodes:
level.tscn
  ├── terrain.tscn       ← Artist A works here
  ├── enemies.tscn       ← Designer B works here
  ├── lighting.tscn      ← Artist C works here
  └── triggers.tscn      ← Programmer D works here
```

Each sub-scene is a separate file. Merge conflicts only occur when two people edit the **same** sub-scene.

#### Strategy 2: File Ownership

Use a `CODEOWNERS`-style convention (or actual Git CODEOWNERS) to assign scenes to individuals:

```
# .github/CODEOWNERS or team convention doc
features/player/    @programmer-a
features/enemies/   @designer-b
levels/level_01/    @artist-c
```

#### Strategy 3: Scene Locking (Git LFS)

For binary assets and critical scenes, use Git LFS file locking:

```bash
# Lock a scene before editing
git lfs lock levels/level_01/level_01.tscn

# Unlock when done
git lfs unlock levels/level_01/level_01.tscn
```

---

## 8. Scene Ownership and Locking

For teams larger than 3–4 people, establish explicit rules about who can edit what:

### Naming Convention for Ownership

```
# Prefix scenes with the responsible team/person
res://levels/
├── LD_level_01.tscn      ← Level Design owns this
├── ART_level_01_env.tscn  ← Art owns this
└── PROG_level_01_logic.tscn ← Programming owns this
```

### Automated Conflict Detection

Add a CI check that warns when multiple developers modify the same `.tscn` in a PR:

```bash
#!/bin/bash
# ci/check_scene_conflicts.sh
# Warn if a .tscn file is modified in this PR and also modified in another open PR
CHANGED_SCENES=$(git diff --name-only origin/main...HEAD -- "*.tscn")
if [ -n "$CHANGED_SCENES" ]; then
    echo "⚠️  Modified scenes — verify no concurrent edits:"
    echo "$CHANGED_SCENES"
fi
```

---

## 9. Asset Import Pipeline for Teams

### .import Files Must Be Committed

Godot generates `.import` files that control how assets are processed. These **must** be in version control:

```gitignore
# .gitignore
.godot/           # ✅ Ignore the cache directory
# *.import        # ❌ NEVER ignore .import files
```

### Standardize Import Presets

Create shared import presets for consistency across the team:

```
Project → Project Settings → Import Defaults
```

Document preset conventions:

- **2D sprites:** Filter: Nearest, Mipmaps: Off, Compress: Lossless
- **3D textures:** Filter: Linear, Mipmaps: On, Compress: VRAM (BPTC/ASTC)
- **Audio SFX:** Loop: Off, BPM: 0
- **Audio Music:** Loop: On

### Large Binary Assets

Use **Git LFS** for files over 1 MB:

```bash
# .gitattributes
*.png filter=lfs diff=lfs merge=lfs -text
*.ogg filter=lfs diff=lfs merge=lfs -text
*.wav filter=lfs diff=lfs merge=lfs -text
*.glb filter=lfs diff=lfs merge=lfs -text
*.blend filter=lfs diff=lfs merge=lfs -text
```

---

## 10. Autoload Management at Scale

### The Autoload Sprawl Problem

It's easy to end up with 20+ autoloads that implicitly depend on each other's initialization order. Signs of trouble:

- Autoload A reads from Autoload B in `_ready()`, but B hasn't initialized yet.
- Removing one autoload breaks five others.
- New team members can't understand the startup sequence.

### Solution: Layered Autoloads

Organize autoloads into layers with explicit dependency rules:

```gdscript
# Layer 0: Core (no dependencies on other autoloads)
# - EventBus.gd      — global signal hub
# - Config.gd        — reads settings from disk

# Layer 1: Services (depend only on Layer 0)
# - AudioManager.gd  — uses EventBus for game events
# - SaveManager.gd   — uses Config for save paths

# Layer 2: Game State (depend on Layer 0 and 1)
# - GameState.gd     — uses SaveManager, emits to EventBus
# - QuestTracker.gd  — uses GameState, emits to EventBus
```

Autoloads are initialized **in the order listed in Project Settings**. Place Layer 0 first, then Layer 1, then Layer 2.

### Explicit Initialization

Instead of relying on `_ready()` order, use explicit initialization:

```gdscript
# game_state.gd
var _initialized := false

func initialize() -> void:
    assert(SaveManager._initialized, "SaveManager must initialize before GameState")
    _load_state()
    _initialized = true
```

```csharp
// GameState.cs
private bool _initialized = false;

public void Initialize()
{
    Debug.Assert(SaveManager.Instance.IsInitialized,
        "SaveManager must initialize before GameState");
    LoadState();
    _initialized = true;
}
```

---

## 11. Refactoring Safely

### Moving Files (4.4+ with UIDs)

With universal UIDs, moving files is safe — Godot updates the path in the UID registry automatically:

1. Move the file in the Godot FileSystem dock (not your OS file manager).
2. Godot updates the UID → path mapping.
3. All scenes referencing the resource by UID continue to work.

**Important:** Always move files through Godot's editor, not through your OS or Git. If you move files externally, Godot may lose the UID mapping and fall back to path-based lookup (which will break).

### Renaming Classes

Godot doesn't have automatic class rename refactoring. Manual process:

1. Rename the class in the script file.
2. Search all `.tscn`, `.tres`, and `.gd` files for the old class name.
3. Update references. UIDs handle the file reference, but `class_name` usage in code and scene metadata must be updated manually.

```bash
# Find all references to a class name across the project
grep -r "OldClassName" --include="*.gd" --include="*.tscn" --include="*.tres" .
```

### Deleting Unused Resources

Use the editor's **Orphan Resource Explorer** to find unreferenced files:

```
Project → Tools → Orphan Resource Explorer
```

This scans the project for resources that aren't referenced by any scene or script. Review before deleting — some resources may be loaded dynamically via `load()` with string paths.

---

## 12. Common Mistakes

### Not committing .uid files

If `.uid` files are gitignored, UIDs are regenerated per-machine. References break when the project is cloned. Always commit them.

### Moving files outside the editor

Moving files via your OS file manager or `git mv` bypasses Godot's UID tracking. The UID → path mapping becomes stale. Always use Godot's FileSystem dock.

### Monolithic scenes

A scene with 500+ nodes is unmergeable by a team. Decompose into sub-scenes that individual contributors own.

### Circular autoload dependencies

If Autoload A depends on B and B depends on A, initialization order bugs are inevitable. Use an event bus or dependency injection pattern to break cycles.

### Using `res://` paths in external data files

JSON, CSV, and other external data files should use stable identifiers (string keys, enums) that your code maps to resource paths — not raw `res://` paths that break on refactor.

### Ignoring .import files in version control

Without `.import` files, each team member's editor re-imports assets with potentially different settings, causing visual inconsistencies and wasted time.
