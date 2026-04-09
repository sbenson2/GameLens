# G44 — Version Control Best Practices for Godot Projects

> **Category:** Guide · **Engine:** Godot 4.4+ · **Language:** GDScript / C#
> **Related:** [G20 CI/CD & Export Pipelines](./G20_cicd_and_export_pipelines.md) · [G19 Custom Resources & Plugins](./G19_custom_resources_and_plugins.md) · [E1 Architecture Overview](../architecture/E1_architecture_overview.md)

---

## What This Guide Covers

Version control is essential for any game project beyond a weekend jam, but Godot's file formats and asset pipeline have quirks that trip up developers who come from web or app development. Scene files (`.tscn`), resource files (`.tres`), imported assets, and binary formats all need specific handling.

This guide covers setting up Git for a Godot project from scratch, recommended `.gitignore` and `.gitattributes` configurations, Git LFS for binary assets, strategies for resolving merge conflicts in scene files, team workflow patterns, and common pitfalls.

**Use this guide when:** you're starting a new Godot project and want to set up version control correctly from day one, or you're joining a team and need to understand the Godot-specific Git workflow.

---

## Table of Contents

1. [Why Git Needs Special Setup for Godot](#1-why-git-needs-special-setup-for-godot)
2. [Initial Repository Setup](#2-initial-repository-setup)
3. [The .gitignore File](#3-the-gitignore-file)
4. [The .gitattributes File](#4-the-gitattributes-file)
5. [Git LFS for Binary Assets](#5-git-lfs-for-binary-assets)
6. [Understanding Godot's File Formats](#6-understanding-godots-file-formats)
7. [Merge Conflicts in Scene Files](#7-merge-conflicts-in-scene-files)
8. [Team Workflow Patterns](#8-team-workflow-patterns)
9. [Branching Strategies for Game Dev](#9-branching-strategies-for-game-dev)
10. [Godot's Built-In VCS Integration](#10-godots-built-in-vcs-integration)
11. [C# / .NET Considerations](#11-c--net-considerations)
12. [CI Integration](#12-ci-integration)
13. [Common Mistakes](#13-common-mistakes)

---

## 1. Why Git Needs Special Setup for Godot

Godot is designed to be VCS-friendly — scene and resource files are text-based by default. But game projects mix text and binary in ways most Git configurations don't handle well:

- **Text files that look binary:** `.tscn` and `.tres` files are text, but can contain embedded binary data (inline resources, encoded images)
- **Large binary assets:** Textures, audio, 3D models can be hundreds of MB — these bloat Git history permanently without LFS
- **Generated files:** The `.godot/` directory contains import caches and editor state that should never be committed
- **Line endings:** Godot enforces LF line endings; Windows developers with CRLF defaults will create noisy diffs

Setting up `.gitignore`, `.gitattributes`, and LFS before the first commit prevents problems that are painful to fix retroactively.

---

## 2. Initial Repository Setup

### From Scratch

```bash
# Create project directory and initialize Git
mkdir my-godot-game && cd my-godot-game
git init

# Set up LFS before any commits
git lfs install

# Create configuration files (see sections below)
# Then create the Godot project via the editor or:
# Open Godot → New Project → select this directory
```

### From an Existing Project (No Git Yet)

```bash
cd /path/to/my-godot-project

git init
git lfs install

# Create .gitignore and .gitattributes FIRST
# (see sections 3 and 4)

# Stage everything, but verify what's being tracked
git add .
git status  # Review carefully before committing
git commit -m "Initial commit"
```

### From an Existing Project (Already Has Git, Adding LFS)

```bash
# Install LFS
git lfs install

# Migrate existing binary files to LFS
# WARNING: This rewrites history — coordinate with your team
git lfs migrate import --include="*.png,*.jpg,*.wav,*.ogg,*.mp3,*.blend,*.fbx"

# Force push the rewritten history
git push --force-with-lease
```

> **Warning:** Adding LFS to an existing repo requires a history rewrite. Do this before the team grows, or accept that old binaries stay in regular Git history.

---

## 3. The .gitignore File

### Recommended .gitignore for Godot 4.x

```gitignore
# Godot 4.x cache and import data (regenerated on open)
.godot/

# Godot 3.x import cache (if migrating)
.import/

# Export configuration (may contain paths specific to your machine)
# Uncomment if you do NOT share export presets across the team:
# export_presets.cfg

# Compiled translations (generated from .csv source files)
*.translation

# C# / Mono build artifacts
.mono/
data_*/
mono_crash.*.json

# .NET build artifacts (Godot 4.x with C#)
bin/
obj/
*.csproj.old
*.sln.old

# OS files
.DS_Store
Thumbs.db
desktop.ini

# IDE files (uncomment as needed)
# .vscode/
# .idea/
# *.swp
# *.swo

# Build output
builds/
export/
```

### What NOT to Ignore

| File/Dir | Should Commit? | Why |
|----------|---------------|-----|
| `project.godot` | **Yes** | Project settings — the heart of your project |
| `*.tscn` | **Yes** | Scene files — your game's structure |
| `*.tres` | **Yes** | Resource files — materials, themes, configs |
| `*.gd` / `*.cs` | **Yes** | Source code |
| `export_presets.cfg` | **Usually yes** | Shared export configs (remove machine-specific paths) |
| `.godot/` | **No** | Cache, imported data — regenerated by the editor |
| `*.import` | **Yes** | Import metadata files in the project root (NOT `.godot/imported/`) |

> **Note on `*.import` files:** These small text files (e.g., `icon.png.import`) live next to your assets and tell Godot how to import them. They **should** be committed so all team members use the same import settings. The actual imported (converted) data lives in `.godot/imported/` which is ignored.

---

## 4. The .gitattributes File

### Recommended .gitattributes

```gitattributes
# Normalize all text files to LF line endings
* text=auto eol=lf

# Godot text formats — ensure Git treats them as text
*.gd text diff
*.tres text diff
*.tscn text diff
*.cfg text diff
*.gdshader text diff
*.gdextension text diff
*.import text diff

# C# source
*.cs text diff=csharp
*.csproj text diff
*.sln text diff

# Documentation
*.md text diff

# Binary assets tracked by Git LFS
*.png filter=lfs diff=lfs merge=lfs -text
*.jpg filter=lfs diff=lfs merge=lfs -text
*.jpeg filter=lfs diff=lfs merge=lfs -text
*.webp filter=lfs diff=lfs merge=lfs -text
*.exr filter=lfs diff=lfs merge=lfs -text
*.hdr filter=lfs diff=lfs merge=lfs -text
*.tga filter=lfs diff=lfs merge=lfs -text
*.bmp filter=lfs diff=lfs merge=lfs -text
*.psd filter=lfs diff=lfs merge=lfs -text
*.svg filter=lfs diff=lfs merge=lfs -text

# Audio
*.wav filter=lfs diff=lfs merge=lfs -text
*.ogg filter=lfs diff=lfs merge=lfs -text
*.mp3 filter=lfs diff=lfs merge=lfs -text
*.flac filter=lfs diff=lfs merge=lfs -text

# 3D models
*.blend filter=lfs diff=lfs merge=lfs -text
*.fbx filter=lfs diff=lfs merge=lfs -text
*.glb filter=lfs diff=lfs merge=lfs -text
*.gltf filter=lfs diff=lfs merge=lfs -text
*.obj filter=lfs diff=lfs merge=lfs -text
*.dae filter=lfs diff=lfs merge=lfs -text
*.3ds filter=lfs diff=lfs merge=lfs -text

# Video
*.mp4 filter=lfs diff=lfs merge=lfs -text
*.webm filter=lfs diff=lfs merge=lfs -text
*.ogv filter=lfs diff=lfs merge=lfs -text

# Fonts
*.ttf filter=lfs diff=lfs merge=lfs -text
*.otf filter=lfs diff=lfs merge=lfs -text
*.woff filter=lfs diff=lfs merge=lfs -text
*.woff2 filter=lfs diff=lfs merge=lfs -text

# Compiled / binary Godot resources (if any)
*.res filter=lfs diff=lfs merge=lfs -text
*.scn filter=lfs diff=lfs merge=lfs -text
```

### Why `.tscn` and `.tres` Are Marked as Text

Godot's text-based scene format is specifically designed for VCS. A `.tscn` file looks like:

```
[gd_scene load_steps=3 format=3 uid="uid://abc123"]

[ext_resource type="Script" path="res://player.gd" id="1"]
[ext_resource type="Texture2D" path="res://player.png" id="2"]

[node name="Player" type="CharacterBody2D"]
script = ExtResource("1")

[node name="Sprite" type="Sprite2D" parent="."]
texture = ExtResource("2")
```

This is human-readable and diff-friendly. Binary scene formats (`.scn`, `.res`) exist but should only be used for performance-critical runtime loading, not as source files.

---

## 5. Git LFS for Binary Assets

### Why LFS Matters

Git stores every version of every file in history. A 50 MB texture changed 10 times = 500 MB of history, permanently. LFS replaces binary files with lightweight pointers in Git, storing the actual data on a separate server.

### Setting Up LFS

```bash
# Install Git LFS (once per machine)
git lfs install

# Track file types (creates/updates .gitattributes)
git lfs track "*.png" "*.jpg" "*.wav" "*.ogg" "*.blend" "*.fbx" "*.glb"

# Verify tracking
git lfs ls-files

# IMPORTANT: Commit .gitattributes before committing tracked files
git add .gitattributes
git commit -m "Configure Git LFS tracking"
```

### LFS Hosting

| Service | Free LFS Storage | Free LFS Bandwidth |
|---------|-----------------|-------------------|
| GitHub | 1 GB | 1 GB/month |
| GitLab | 5 GB | 10 GB/month |
| Bitbucket | 1 GB | Shared with repo |

For large game projects, consider a self-hosted Git server or a dedicated LFS server.

### When NOT to Use LFS

- Small projects (< 500 MB total assets) — LFS adds complexity
- Solo developer who never clones fresh — regular Git is simpler
- Assets that change rarely — the history bloat is minimal

---

## 6. Understanding Godot's File Formats

| Extension | Type | VCS Treatment | Notes |
|-----------|------|--------------|-------|
| `.gd` | GDScript source | Text, diff | Standard code file |
| `.cs` | C# source | Text, diff | Standard code file |
| `.tscn` | Text scene | Text, diff | Human-readable scene graph |
| `.tres` | Text resource | Text, diff | Materials, themes, data |
| `.scn` | Binary scene | LFS | Use only for runtime performance |
| `.res` | Binary resource | LFS | Use only for runtime performance |
| `.gdshader` | Shader source | Text, diff | GLSL-like shader code |
| `.import` | Import metadata | Text, diff | Commit these — they control import settings |
| `project.godot` | Project config | Text, diff | Always commit |

### UIDs in Godot 4.x

Godot 4 assigns UIDs to resources (e.g., `uid://abc123def`). These appear in `.tscn` and `.tres` files. Important rules:

- **Don't manually edit UIDs** — let Godot manage them
- **UIDs survive renames** — moving a file doesn't break references (unlike path-based `res://` references in Godot 3)
- **Merge conflicts in UIDs** — if two branches create resources with the same UID, Godot regenerates on next open

---

## 7. Merge Conflicts in Scene Files

Scene file merge conflicts are the most common pain point for Godot teams. Strategies to minimize and resolve them:

### Prevention

1. **One person per scene:** The simplest rule — assign scene ownership. If Alice is editing `level_3.tscn`, Bob shouldn't touch it.
2. **Decompose large scenes:** Break monolithic scenes into smaller inherited scenes and sub-scenes. Each file can be edited independently.
3. **Use composition over inheritance:** Prefer packed scene instances (`[instance=...]`) over deep node trees. Each instance is a separate file.
4. **Separate data from scenes:** Store gameplay data (enemy stats, item definitions) in `.tres` resource files or JSON, not baked into scenes.

### Resolution

When conflicts do happen in `.tscn` files:

```
<<<<<<< HEAD
position = Vector2(100, 200)
=======
position = Vector2(150, 250)
>>>>>>> feature-branch
```

**For simple property conflicts:** Pick one side or manually merge values.

**For structural conflicts** (added/removed nodes, reordered children): Manual resolution is error-prone. Safer approach:

1. Accept one side entirely (`git checkout --theirs -- path/to/scene.tscn`)
2. Open the scene in Godot
3. Manually re-apply the changes from the other branch
4. Commit the resolved file

### File Locking (GitLab / GitHub)

For binary assets that can't be merged, use Git LFS file locking:

```bash
# Lock a file before editing
git lfs lock assets/sprites/player.png

# Unlock when done
git lfs unlock assets/sprites/player.png

# See all locks
git lfs locks
```

GitLab and GitHub both support LFS locking. This prevents two people from editing the same binary asset.

---

## 8. Team Workflow Patterns

### Small Team (2–5 People)

- **Trunk-based development:** Everyone works on `main`, using short-lived feature branches (1–3 days)
- **Scene ownership:** Assign scenes to individuals; communicate when you need to touch someone else's scene
- **Daily merges:** Merge feature branches daily to minimize divergence

### Medium Team (5–15 People)

- **Feature branches** with PR/MR reviews
- **Scene locking** via Git LFS locks or a shared spreadsheet/Slack channel
- **Dedicated `develop` branch** that gets merged to `main` for releases
- **Asset pipeline:** Artists commit raw assets; CI builds optimized versions

### Large Team (15+)

- **Submodules or monorepo with sparse checkout** for different areas (levels, UI, audio)
- **Asset management tool** (e.g., Anchorpoint, Perforce for binaries)
- **Automated conflict detection** in CI
- **Scene prefabs:** Heavily decomposed scenes so conflicts are rare

---

## 9. Branching Strategies for Game Dev

### Recommended: Simplified Git Flow

```
main ──────────────────────────────────────→ (release-ready)
  │
  ├── feature/player-movement ──→ merge back
  ├── feature/level-3-design ──→ merge back
  ├── fix/collision-bug ──→ merge back
  │
  └── release/v1.0 ──→ (hotfix branch if needed)
```

**Rules:**
- `main` is always buildable and exportable
- Feature branches are short-lived (days, not weeks)
- Release branches are created for playtesting and store submission
- Hotfixes branch from release, merge back to both release and main

### Tags for Builds

```bash
# Tag release candidates
git tag -a v1.0-rc1 -m "Release candidate 1 for Steam"

# Tag final release
git tag -a v1.0 -m "Version 1.0 — Steam launch"

# CI can trigger exports on tag push
git push origin v1.0
```

---

## 10. Godot's Built-In VCS Integration

Godot 4.x includes a basic Git integration panel (accessible via **Project → Version Control**):

- View diffs, stage files, commit — all within the editor
- Useful for quick commits without switching to a terminal
- **Limitations:** No LFS support, no branch management, no merge conflict resolution

**Recommendation:** Use the built-in VCS for quick commits and diffs. Use the command line or a Git GUI (GitKraken, Fork, Sourcetree) for branching, merging, LFS, and conflict resolution.

---

## 11. C# / .NET Considerations

Godot 4.x with C# generates additional files:

```gitignore
# Add to .gitignore for C# projects
.mono/
bin/
obj/
*.csproj.old
*.sln.old
```

**Commit these:**
- `*.csproj` — project file, tracks dependencies
- `*.sln` — solution file

**Don't commit:**
- `bin/` and `obj/` — build output, regenerated by `dotnet build`
- NuGet packages — restored by `dotnet restore`

### NuGet Restore in CI

```yaml
# In your CI pipeline
- dotnet restore
- # Then proceed with Godot export
```

---

## 12. CI Integration

Version control pairs with CI for automated exports and testing. See [G20 CI/CD & Export Pipelines](./G20_cicd_and_export_pipelines.md) for full details. Key VCS-related CI tips:

- **Shallow clones** speed up CI: `git clone --depth 1` (but breaks LFS if files aren't in the latest commit)
- **LFS in CI:** Ensure your CI runner has `git lfs` installed and runs `git lfs pull` before building
- **Cache the `.godot/` directory** between CI runs to speed up imports
- **Tag-triggered exports:** Only export release builds when a version tag is pushed

---

## 13. Common Mistakes

| Mistake | Consequence | Fix |
|---------|-------------|-----|
| Committing `.godot/` directory | Massive repo bloat, constant merge conflicts | Add `.godot/` to `.gitignore` immediately |
| Not setting up LFS before first commit | Binary history can never be cleaned without rewrite | Always `git lfs install` + `.gitattributes` before first commit |
| CRLF line endings on Windows | Noisy diffs in `.tscn`/`.tres` files | Set `* text=auto eol=lf` in `.gitattributes` |
| Editing scenes simultaneously | Merge conflicts in `.tscn` files | Scene ownership + decomposition |
| Ignoring `.import` files | Team members get different import settings | Commit `*.import` files (the small ones next to assets) |
| Using binary `.scn`/`.res` as source | Can't diff, can't merge | Use text formats (`.tscn`/`.tres`) for source |
| Giant monolithic scenes | Any edit causes merge conflicts | Break into sub-scenes and packed scenes |
| Adding LFS tracking after files are committed | Files stay in regular Git history | Migrate with `git lfs migrate import` |
