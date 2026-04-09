# Source Control & Team Collaboration

> **Category:** guide · **Engine:** Unreal Engine · **Related:** [G15 Blueprint & C++ Workflow](G15_blueprint_cpp_workflow.md), [G37 Editor Scripting & Automation](G37_editor_scripting_automation.md), [G14 Asset Management](G14_asset_management.md)

Unreal Engine projects present unique version control challenges: multi-gigabyte binary assets (`.uasset`, `.umap`), merge-hostile file formats, and teams where artists and programmers have very different workflows. This guide covers how to set up and manage source control for UE5 projects, comparing Perforce and Git, and documenting the team collaboration patterns that keep large projects stable.

---

## Choosing a Version Control System

### Perforce (Helix Core)

Perforce is the **industry standard for AAA game development** and Epic's own choice for Unreal Engine and Fortnite development. UE has first-class Perforce integration built into the editor.

**Strengths:**
- Native binary file handling — no add-on like LFS required.
- Built-in **exclusive checkout (file locking)** — prevents merge conflicts on binary assets.
- Stream-based branching designed for large repositories (100+ GB).
- Epic's advanced tooling (UnrealGameSync, Robomerge, Horde) works exclusively with Perforce.

**Trade-offs:**
- Requires a central server (self-hosted or Perforce Cloud).
- Per-seat licensing cost (free for up to 5 users / 20 workspaces).
- Steeper learning curve for developers coming from Git.

### Git (with Git LFS)

Git is the most widely used VCS and works well for **indie teams, small-to-mid studios, and code-heavy projects**.

**Strengths:**
- Free, open-source, and universally known.
- Excellent branching and merging for C++ and text files.
- Hosted on GitHub, GitLab, Bitbucket, or self-hosted.
- Every developer has a full local copy (works offline).

**Trade-offs:**
- Binary assets require **Git LFS** — adds setup complexity and storage costs.
- File locking requires manual `git lfs lock` commands (no automatic exclusive checkout).
- Very large repos (50+ GB LFS) can become slow to clone and pull.
- Merge conflicts on `.uasset` files are unresolvable — locking discipline is essential.

### Decision Matrix

| Factor | Perforce | Git + LFS |
|--------|----------|-----------|
| Team size | 10+ (AAA scale) | 1–15 (indie / small studio) |
| Repo size | Handles 100+ GB natively | Works well under 50 GB LFS |
| Binary asset safety | Automatic exclusive checkout | Manual LFS locking required |
| Epic tool ecosystem | Full support (UGS, Robomerge, Horde) | Not supported |
| Cost | Free ≤5 users; paid beyond | Free (hosting storage costs for LFS) |
| CI/CD integration | Excellent (Horde, Jenkins) | Excellent (GitHub Actions, GitLab CI) |

---

## Perforce Setup for Unreal Engine

### Stream Architecture

Properly designed Perforce Streams isolate engine versions, support parallel development, and simplify upgrades. Follow the **"merge down, copy up"** pattern:

```
//GameProject/main                    ← Stable mainline
  ├── //GameProject/dev               ← Active development stream
  │     ├── //GameProject/feature-X   ← Feature branch (short-lived)
  │     └── //GameProject/feature-Y
  ├── //GameProject/release-1.0       ← Release branch (bug fixes only)
  └── //GameProject/art-sandbox       ← Art team experimentation
```

**Merge down:** Promote tested changes from feature → dev → main.
**Copy up:** Sync main back into dev and feature streams regularly to avoid divergence.

### Editor Integration

UE's built-in Perforce integration supports:

1. **Source Control Settings:** Edit → Editor Preferences → Source Control → set Provider to **Perforce**.
2. **Auto-checkout on edit:** When you modify an asset, the editor checks it out automatically.
3. **Changelist management:** View and submit changelists from the editor's Source Control panel.
4. **Diff assets:** Right-click any asset → Source Control → Diff Against Depot.
5. **Status icons:** Content Browser shows checked-out, locked, and out-of-date indicators.

### Workspace Configuration

```
# Typical .p4config for a UE project
P4PORT=ssl:perforce.yourstudio.com:1666
P4USER=your.username
P4CLIENT=your-workspace-name
P4CHARSET=utf8
```

### Recommended Typemap

Configure Perforce to treat UE binary formats correctly:

```
# p4 typemap
TypeMap:
    binary+l //depot/....uasset
    binary+l //depot/....umap
    binary+l //depot/....uproject
    binary+l //depot/....png
    binary+l //depot/....tga
    binary+l //depot/....wav
    binary+l //depot/....mp3
    binary+l //depot/....fbx
    binary+l //depot/....abc
    text     //depot/....h
    text     //depot/....cpp
    text     //depot/....cs
    text     //depot/....ini
    text     //depot/....json
```

The `+l` flag enables **exclusive locking** — only one person can check out the file at a time, preventing unresolvable merge conflicts on binary assets.

---

## Git + LFS Setup for Unreal Engine

### .gitattributes

This is the most critical file in a Git-based UE project. It tells Git LFS which files to track and which files should never be merged:

```gitattributes
# Unreal Engine binary assets — track with LFS, lock to prevent conflicts
*.uasset filter=lfs diff=lfs merge=lfs -text lockable
*.umap filter=lfs diff=lfs merge=lfs -text lockable
*.uproject filter=lfs diff=lfs merge=lfs -text lockable

# Art assets
*.png filter=lfs diff=lfs merge=lfs -text lockable
*.tga filter=lfs diff=lfs merge=lfs -text lockable
*.psd filter=lfs diff=lfs merge=lfs -text lockable
*.fbx filter=lfs diff=lfs merge=lfs -text lockable
*.abc filter=lfs diff=lfs merge=lfs -text lockable
*.blend filter=lfs diff=lfs merge=lfs -text lockable

# Audio
*.wav filter=lfs diff=lfs merge=lfs -text lockable
*.mp3 filter=lfs diff=lfs merge=lfs -text lockable
*.ogg filter=lfs diff=lfs merge=lfs -text lockable

# Video
*.mp4 filter=lfs diff=lfs merge=lfs -text lockable
*.avi filter=lfs diff=lfs merge=lfs -text lockable

# Compiled / intermediate (should be .gitignored, but safety net)
*.dll filter=lfs diff=lfs merge=lfs -text
*.exe filter=lfs diff=lfs merge=lfs -text
*.pdb filter=lfs diff=lfs merge=lfs -text

# Source code — normal Git (text, mergeable)
*.h text diff=cpp
*.cpp text diff=cpp
*.cs text
*.ini text
*.json text
```

### .gitignore Essentials

```gitignore
# Build outputs
Binaries/
Intermediate/
DerivedDataCache/
Build/

# IDE
.vs/
.vscode/
*.sln
*.suo

# OS
.DS_Store
Thumbs.db

# Saved (local settings, autosaves)
Saved/

# Packaging
Releases/
*.pak
```

### File Locking Workflow

```bash
# Before editing a .uasset or .umap
git lfs lock Content/Maps/MainLevel.umap

# Check who has locks
git lfs locks

# After committing and pushing, unlock
git lfs unlock Content/Maps/MainLevel.umap
```

**Team discipline is essential** — without locking, two artists editing the same `.uasset` will produce an unresolvable conflict. Consider a pre-commit hook or CI check that warns on unlocked binary modifications.

### Editor Integration (Git)

UE's built-in Git plugin (Edit → Editor Preferences → Source Control → Git) provides basic status indicators but is less mature than the Perforce integration. Third-party alternatives:

- **Git Source Control Plugin** (Community) — improved status tracking, diff support.
- **Anchorpoint** — visual Git client designed for game asset workflows with built-in LFS locking UI.

---

## Branching Strategies

### For Perforce

Use **Perforce Streams** with short-lived feature branches:

```
main (stable, shippable)
  └── dev (integration branch)
        ├── feature/new-weapon (1–2 weeks, then merge to dev)
        └── feature/ui-overhaul (1–2 weeks)
```

- Merge feature → dev daily or on completion.
- Promote dev → main at milestones after QA pass.
- Cut release branches from main for hotfixes.

### For Git

Use a **simplified Git Flow**:

```
main (stable releases)
  └── develop (integration)
        ├── feature/new-weapon
        └── feature/ui-overhaul
```

- Feature branches are short-lived (< 2 weeks).
- Rebase feature branches onto develop before merging to reduce noise.
- Tag releases on main (`v1.0.0`, `v1.1.0`).

---

## Epic's Collaboration Tools (Perforce Only)

### UnrealGameSync (UGS)

A desktop application for syncing and building specific changelists from a Perforce stream:

- Displays a timeline of changelists with build status indicators (green/red/pending).
- Team members mark changelists as "good" or "bad" — everyone can see what's safe to sync.
- Integrates with Horde for automated builds.

### Robomerge

Automated branch merging tool used at Epic for Fortnite and UE development:

- Continuously merges changelists between streams per a configured merge graph.
- Flags conflicts for manual resolution via Slack/Teams notifications.
- Keeps branches in sync with minimal human intervention.

### Horde

Epic's distributed build and CI system:

- Designed for massive Perforce repos (UE source builds).
- Manages build agents, test runs, and artifact storage.
- Integrates with UGS for build status visualization.

---

## Team Workflow Best Practices

### Asset Naming Conventions

Consistent naming prevents conflicts and makes assets discoverable:

```
Content/
├── Characters/
│   ├── Hero/
│   │   ├── SK_Hero.uasset          (Skeletal Mesh)
│   │   ├── ABP_Hero.uasset         (Animation Blueprint)
│   │   ├── MI_Hero_Body.uasset     (Material Instance)
│   │   └── T_Hero_Body_D.uasset    (Texture — Diffuse)
├── Weapons/
│   ├── Sword/
│   │   ├── SM_Sword.uasset         (Static Mesh)
│   │   └── MI_Sword.uasset         (Material Instance)
└── Maps/
    ├── L_MainMenu.umap
    └── L_Level01.umap
```

Common prefixes: `SM_` (Static Mesh), `SK_` (Skeletal Mesh), `T_` (Texture), `M_` (Material), `MI_` (Material Instance), `ABP_` (Animation Blueprint), `BP_` (Blueprint), `WBP_` (Widget Blueprint), `L_` (Level/Map).

### Reducing Merge Conflicts

1. **Split levels into sub-levels** — multiple artists can work on different sub-levels simultaneously.
2. **Use Data Assets over level Blueprints** — Data Assets are smaller and less conflict-prone.
3. **One Blueprint per feature** — avoid monolithic Blueprints that multiple people edit.
4. **Lock before editing** (Perforce auto, Git LFS manual) — this is the single most important practice.
5. **Commit small, commit often** — smaller changelists are easier to review and less likely to conflict.

### Code Review for UE Projects

- **C++ code:** Standard pull request / code review workflow.
- **Blueprints:** Use UE's built-in Blueprint diff tool (right-click → Diff) or take screenshots for review.
- **Assets:** Review in-editor; use Perforce's visual diff for textures and meshes where available.

---

## CI/CD Integration

### Build Automation

```bash
# Example: Build + Cook + Package via RunUAT (Unreal Automation Tool)
Engine/Build/BatchFiles/RunUAT.sh \
  BuildCookRun \
  -project="/path/to/MyGame.uproject" \
  -platform=Win64 \
  -clientconfig=Shipping \
  -cook \
  -stage \
  -package \
  -archive \
  -archivedirectory="/builds/MyGame"
```

### Common CI Pipelines

| Stage | Command | Purpose |
|-------|---------|---------|
| Compile | `RunUAT BuildCookRun -build` | Verify C++ compiles |
| Cook | `RunUAT BuildCookRun -cook` | Validate asset cooking |
| Tests | `RunUAT RunTests -filter=Project` | Automated gameplay tests |
| Package | `RunUAT BuildCookRun -package` | Create distributable build |
| Deploy | Upload to Steam/EGS/TestFlight | Ship to testers or stores |

---

## Version History

| Version | Notes |
|---------|-------|
| UE 4.x | Perforce integration, basic Git plugin |
| UE 5.0 | Improved Source Control panel, UGS updates |
| UE 5.5+ | Enhanced Git integration, Horde improvements, Collaboration docs overhaul |

---

## Further Reading

- [Collaboration & Version Control — UE 5.7 Docs](https://dev.epicgames.com/documentation/en-us/unreal-engine/collaboration-and-version-control-in-unreal-engine)
- [Using Perforce as Source Control — UE 5.7 Docs](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-perforce-as-source-control-for-unreal-engine)
- [Perforce + Unreal Integration Guide](https://www.perforce.com/integrations/perforce-and-unreal-integration)
- [Git with Unreal Engine — Anchorpoint](https://www.anchorpoint.app/blog/git-with-unreal-engine-5)
- [G14 Asset Management](G14_asset_management.md) — Asset organization and dependencies
- [G15 Blueprint & C++ Workflow](G15_blueprint_cpp_workflow.md) — Development workflow patterns
