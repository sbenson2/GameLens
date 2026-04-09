# E2 — Project Structure & Organization in Unity 6

> **Category:** architecture · **Engine:** Unity 6 (6000.x) · **Related:** [Architecture Overview](E1_architecture_overview.md) · [ScriptableObject Architecture](../guides/G14_scriptable_object_architecture.md) · [Addressables](../guides/G9_addressables_asset_management.md) · [Unity Rules](../unity-arch-rules.md)

A well-organized project structure is the difference between a codebase that scales to release and one that collapses under its own weight. This guide covers folder conventions, naming rules, assembly definitions, and version-control strategies for Unity 6 projects of all sizes.

---

## Why Structure Matters Early

Unity projects are notoriously easy to start and notoriously painful to reorganize later. Moving assets changes their GUID references, which can break prefabs, materials, and serialized fields. Getting the structure right on day one prevents weeks of refactoring.

**Symptoms of poor structure:**
- "I can't find the script for that enemy" — assets scattered randomly
- Prefab references break after merging a teammate's changes
- Build times grow because everything recompiles on any change
- Third-party plugin code collides with your own naming

---

## Recommended Folder Layout

```
Assets/
├── _Game/                    # YOUR project's assets (underscore sorts to top)
│   ├── Art/
│   │   ├── Characters/       # Models, textures, materials per character
│   │   ├── Environment/      # World art assets
│   │   ├── UI/               # UI sprites, fonts, atlases
│   │   └── VFX/              # Particle systems, shaders for effects
│   ├── Audio/
│   │   ├── Music/
│   │   └── SFX/
│   ├── Data/                 # ScriptableObject assets (config, events, variables)
│   │   ├── Config/           # WeaponData, EnemyData, LevelConfig, etc.
│   │   ├── Events/           # GameEvent channel assets
│   │   └── Variables/        # FloatVariable, IntVariable assets
│   ├── Prefabs/
│   │   ├── Characters/
│   │   ├── Environment/
│   │   ├── UI/
│   │   └── Systems/          # Manager prefabs, pooling roots
│   ├── Scenes/
│   │   ├── Bootstrap.unity   # Persistent scene (loads first)
│   │   ├── Levels/
│   │   ├── Menus/
│   │   └── Testing/          # Throwaway test scenes
│   ├── Scripts/
│   │   ├── Core/             # Singletons, service locators, SO base classes
│   │   ├── Gameplay/         # Player, enemies, items, abilities
│   │   ├── UI/               # UI controllers and bindings
│   │   ├── Systems/          # Save/load, audio, input, networking
│   │   └── Editor/           # Custom inspectors, tools (Editor-only)
│   ├── Animations/
│   │   ├── Characters/
│   │   └── UI/
│   └── Shaders/
├── Plugins/                  # Third-party code (Asset Store, packages)
│   ├── DOTween/
│   └── TextMeshPro/
├── StreamingAssets/          # Files copied verbatim to build (JSON, SQLite)
└── Resources/                # AVOID — prefer Addressables. Only for legacy needs.
```

### Key Principles

**1. Separate your code from third-party code.** Everything you create goes under `_Game/`. Plugins get their own top-level folder. This makes upgrades painless — delete the plugin folder, reimport the new version.

**2. Organize by domain, not by type.** Within each domain folder (Characters, Environment), keep the model, texture, material, and prefab together. A character artist should find everything about "Goblin" in one place, not hunt through separate Models/, Textures/, and Materials/ trees.

**3. Use a consistent prefix or underscore** for your primary folder so it sorts above Unity's auto-generated folders (like `Packages/` in the Project window).

**4. Avoid the Resources folder.** Assets in `Resources/` are all included in the build regardless of whether they're referenced. Use Addressables for dynamic loading. The only valid uses for `Resources/` are small, always-needed assets like a loading spinner.

---

## Naming Conventions

Consistent naming eliminates ambiguity and makes search (`Ctrl+T` in the Project window) fast and reliable.

### Files

| Asset Type | Convention | Example |
|------------|-----------|---------|
| Scripts (C#) | PascalCase, matches class name exactly | `PlayerController.cs` |
| Prefabs | PascalCase with domain prefix | `Enemy_Goblin.prefab` |
| Scenes | PascalCase | `Level_Forest.unity` |
| ScriptableObjects | PascalCase, descriptive | `Weapon_Sword_Iron.asset` |
| Textures | PascalCase + suffix for type | `Goblin_Diffuse.png`, `Goblin_Normal.png` |
| Materials | PascalCase, matches the surface | `Mat_Goblin_Body.mat` |
| Animations | PascalCase + action | `Goblin_Run.anim`, `Goblin_Attack01.anim` |
| Audio | lowercase_with_underscores | `sfx_sword_hit_01.wav` |

### Rules

- **Never use spaces** — Unity's CLI tools (batch mode, CI) have issues with spaces in paths. Use PascalCase or underscores.
- **Never use special characters** — avoid `#`, `&`, `%`, etc.
- **Number with zero-padding** — `Attack01`, `Attack02` (not `Attack1`, `Attack2`) so they sort correctly.
- **Keep paths under 180 characters** — Windows has a 260-char path limit. Short folder names prevent hitting this.

---

## Assembly Definitions

Assembly definitions (`.asmdef`) split your scripts into separate compilation units. Without them, **every script in your project recompiles when any script changes**. On large projects, this turns a 1-second code change into a 30-second compile.

### Recommended Assembly Structure

```
Scripts/
├── Core/
│   └── Game.Core.asmdef           # Base types, interfaces, SO definitions
├── Gameplay/
│   └── Game.Gameplay.asmdef       # References: Game.Core
├── UI/
│   └── Game.UI.asmdef             # References: Game.Core
├── Systems/
│   └── Game.Systems.asmdef        # References: Game.Core
└── Editor/
    └── Game.Editor.asmdef         # References: Game.Core, Game.Gameplay
                                   # Platform: Editor only
```

**Why bother?**

1. **Faster iteration** — changing a UI script only recompiles `Game.UI`, not your entire project.
2. **Enforced architecture** — `Game.UI` can't accidentally reference `Game.Gameplay` unless you explicitly add the dependency. This prevents spaghetti.
3. **Testability** — you can write NUnit tests against `Game.Core` in isolation.

### Assembly Definition Setup

```json
// Game.Core.asmdef
{
    "name": "Game.Core",
    "rootNamespace": "Game.Core",
    "references": [],
    "includePlatforms": [],
    "excludePlatforms": [],
    "allowUnsafeCode": false,
    "autoReferenced": true
}
```

```json
// Game.Gameplay.asmdef
{
    "name": "Game.Gameplay",
    "rootNamespace": "Game.Gameplay",
    "references": [
        "GUID:<game-core-guid>"
    ],
    "includePlatforms": [],
    "excludePlatforms": [],
    "allowUnsafeCode": false,
    "autoReferenced": true
}
```

---

## Version Control Setup

### .gitignore Essentials

Unity generates many files that should not be committed. At minimum:

```gitignore
# Unity generated
/[Ll]ibrary/
/[Tt]emp/
/[Oo]bj/
/[Bb]uild/
/[Bb]uilds/
/[Ll]ogs/
/[Mm]emoryCaptures/
/[Uu]ser[Ss]ettings/

# IDE
.idea/
.vs/
*.csproj
*.sln

# OS
.DS_Store
Thumbs.db

# Builds
*.apk
*.aab
*.unitypackage
```

### Serialization Settings

In **Project Settings → Editor → Asset Serialization**, set mode to **Force Text**. This makes `.unity` scene files, `.prefab` files, and `.asset` files human-readable YAML, which means:

- Git diffs actually show what changed
- Merge conflicts can be resolved manually
- Prefab overrides are visible in pull requests

### Smart Merge Tool

Unity ships **UnityYAMLMerge** — a merge tool that understands Unity's serialization format. Configure it in your `.gitconfig`:

```ini
[mergetool "unityyamlmerge"]
    trustExitCode = false
    cmd = '<unity-install-path>/Editor/Data/Tools/UnityYAMLMerge' merge -p "$BASE" "$REMOTE" "$LOCAL" "$MERGED"
```

---

## Scaling Strategies

### Small Project (Solo / Jam)

Keep it simple. A single `_Game/` folder with flat subfolders is fine. Skip assembly definitions unless compile times bother you.

```
Assets/
├── _Game/
│   ├── Prefabs/
│   ├── Scenes/
│   ├── Scripts/
│   ├── Art/
│   └── Audio/
```

### Medium Project (Small Team, 6–18 months)

Add assembly definitions, split Data from Scripts, and use domain-based subfolders. Establish naming conventions in a `STYLE_GUIDE.md` at the repo root.

### Large Project (Studio, 2+ years)

Use Unity's Package Manager for internal packages. Each major system (networking, save/load, audio) becomes a local UPM package with its own `package.json`, assembly definitions, and tests. This enforces API boundaries and allows reuse across projects.

```
Packages/
├── com.studio.core/          # Local UPM package
│   ├── package.json
│   ├── Runtime/
│   │   └── com.studio.core.asmdef
│   ├── Editor/
│   │   └── com.studio.core.editor.asmdef
│   └── Tests/
│       └── com.studio.core.tests.asmdef
```

---

## Anti-Patterns to Avoid

| Anti-Pattern | Problem | Fix |
|-------------|---------|-----|
| Everything in `Assets/` root | Unnavigable after 50 files | Use `_Game/` with subfolders |
| Assets in `Resources/` by default | Bloated builds, no lazy loading | Use Addressables |
| No assembly definitions | 30-second recompile on every change | Add `.asmdef` per domain |
| Inconsistent naming | `player_ctrl`, `PlayerCtrl`, `playerController` in one project | Document conventions, enforce in code review |
| Scene-only workflows | Can't test systems in isolation | Use bootstrap pattern + additive scenes |
| Committing `Library/` or `.csproj` | Massive repo, constant merge conflicts | Proper `.gitignore` |

---

## Quick-Start Checklist

1. Create `_Game/` folder with the subfolders listed above
2. Set Asset Serialization to **Force Text**
3. Add `.gitignore` before first commit
4. Create `Game.Core.asmdef` in your Scripts/Core folder
5. Establish naming conventions and write them down
6. Set up the bootstrap scene pattern (see [G1 Scene Management](../guides/G1_scene_management.md))
7. Create a `Data/` folder for ScriptableObject assets (see [G14 ScriptableObject Architecture](../guides/G14_scriptable_object_architecture.md))
