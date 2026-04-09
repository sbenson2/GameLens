# G27 — Game Studio Editor Workflow

> **Category:** Guide · **Engine:** Stride · **Related:** [Stride Architecture Rules](../stride-arch-rules.md), [G01 — Getting Started](G01_getting_started.md), [G20 — Scene Management and Composition](G20_scene_management_composition.md)

Stride Game Studio is the integrated development environment for Stride projects. Unlike code-first frameworks (MonoGame, FNA), Stride's editor handles scene composition, asset import, material editing, prefab management, and live preview — all in a visual interface. Understanding the editor workflow is essential for productive Stride development, especially when collaborating with artists and designers who may not work in code. This guide covers Game Studio's layout, scene editing workflow, prefab system, asset management, and tips for efficient iteration.

---

## Table of Contents

1. [Game Studio Layout](#1--game-studio-layout)
2. [Scene Editing Workflow](#2--scene-editing-workflow)
3. [The Prefab System](#3--the-prefab-system)
4. [Asset Management](#4--asset-management)
5. [Script Integration and Hot Reload](#5--script-integration-and-hot-reload)
6. [Graphics Compositor](#6--graphics-compositor)
7. [Subscenes and Large Worlds](#7--subscenes-and-large-worlds)
8. [Editor Tips and Shortcuts](#8--editor-tips-and-shortcuts)
9. [Multi-User Collaboration](#9--multi-user-collaboration)
10. [Common Editor Issues](#10--common-editor-issues)

---

## 1 — Game Studio Layout

Game Studio's interface is divided into several panels:

- **Scene Editor** (center) — the 3D viewport where you compose scenes by placing and transforming entities
- **Asset View** (bottom) — browse and search all project assets (models, textures, materials, scenes, scripts)
- **Solution Explorer** (left) — project structure, packages, and dependencies
- **Property Grid** (right) — inspect and edit the selected entity's components and their properties
- **Asset Preview** (bottom-right) — live preview of the selected asset (model rotation, material preview, animation playback)

All panels can be rearranged, docked, or floated. The layout persists between sessions.

### Navigation Controls

- **Right-click + WASD** — fly camera through the scene (FPS-style)
- **Middle-click drag** — pan the camera
- **Scroll wheel** — zoom in/out
- **F** — focus on the selected entity (centers the camera)
- **Numpad** — snap to axis-aligned views (front, top, side)

## 2 — Scene Editing Workflow

### Creating and Populating a Scene

1. In the Asset View, right-click → Add Asset → Scene to create a new scene
2. Drag assets (models, prefabs) from the Asset View into the Scene Editor viewport
3. Use the transform gizmo to position, rotate, and scale entities
4. Select entities in the viewport or the entity hierarchy (left side of the Scene Editor)

### Transform Tools

Stride provides the standard transform gizmo set:

- **W** — Move (translate)
- **E** — Rotate
- **R** — Scale
- **T** — toggle local/world coordinate space

### Dynamic Snapping

As of Stride 4.2+, the editor supports dynamic snapping while transforming objects:

- Hold **Ctrl** while moving to snap to grid increments
- Snap distance is configurable in the toolbar
- Snapping works for translation, rotation (angular snap), and scale

### Entity Hierarchy

Entities are organized in a tree hierarchy. Parenting an entity to another makes its transform relative to the parent — moving the parent moves all children. This is fundamental for:

- Vehicle systems (body → wheels → turret)
- Character rigs (root → spine → arms → hands)
- UI layouts (panel → child elements)

## 3 — The Prefab System

Prefabs are reusable entity templates. Edit a prefab once and every instance in every scene updates automatically.

### Creating a Prefab

1. Select one or more entities in a scene
2. Right-click → Create Prefab From Selection
3. The prefab appears in the Asset View; the selected entities become instances

### Editing Prefabs

- **Double-click** a prefab in the Asset View to open it in the Prefab Editor (a dedicated scene view for that prefab)
- Changes in the Prefab Editor propagate to all instances immediately
- You can also **edit prefabs in-place** within a scene by clicking "Edit Prefab" in the Property Grid

### Prefab Overrides

Instances can override specific properties of their prefab:

- Change a material on one instance without affecting others
- Overridden properties show a colored indicator in the Property Grid
- Right-click a property → **Reset to Prefab Default** to undo an override

### Nested Prefabs

Prefabs can contain instances of other prefabs. This enables compositional design:

- A "Room" prefab contains "Door" and "Window" prefabs
- A "Building" prefab contains multiple "Room" prefabs
- Editing the "Door" prefab updates it everywhere — in all rooms, in all buildings

### Archetype System

The archetype pattern extends beyond prefabs to other assets. A material can be an archetype — derived materials inherit its properties and override only what they change. This scales asset management significantly for large projects.

## 4 — Asset Management

### Importing Assets

Drag files (FBX, OBJ, PNG, WAV, HDR) into the Asset View or use Import Asset from the right-click menu. Stride processes imports through its asset pipeline:

- **Models** — FBX files are imported with mesh, skeleton, and animation data; you can select which animations to import from an FBX stack
- **Textures** — automatically compressed to the appropriate format per platform (BC for desktop, ETC/ASTC for mobile)
- **Audio** — WAV, OGG, MP3 imported and converted to Stride's internal format

### Auto-Copy to Resources

As of recent versions, Stride can automatically copy imported assets to the project's `Resources/` directory, ensuring source files are always co-located with the project. Enable this in the project settings to avoid broken references when moving projects between machines.

### Asset Naming Conventions

Stride doesn't enforce naming conventions, but a consistent scheme prevents chaos at scale:

- `T_` prefix for textures (`T_BrickWall_Diffuse`)
- `M_` prefix for materials (`M_BrickWall`)
- `SM_` prefix for static meshes (`SM_Crate`)
- `SK_` prefix for skeletal meshes (`SK_Character`)
- `A_` prefix for animations (`A_Character_Run`)
- `SFX_` / `BGM_` prefix for audio

### Asset Dependencies

The Property Grid shows which assets reference the selected asset. Before deleting an asset, check its references to avoid broken links. Stride warns you if you try to delete an asset that's still referenced.

## 5 — Script Integration and Hot Reload

### Writing Scripts

Scripts are C# classes that inherit from `SyncScript`, `AsyncScript`, or `StartupScript` (see stride-arch-rules.md for details). You write scripts in an external editor:

- **Visual Studio** — full debugging support, IntelliSense
- **JetBrains Rider** — full support as of Stride 4.2+
- **VS Code** — supported with OmniSharp/C# extension

### Hot Reload

Game Studio monitors your project for script changes:

1. Save your script in your code editor
2. Game Studio detects the change and recompiles
3. Updated scripts are reflected in the editor — new public properties appear in the Property Grid
4. In Play mode, script changes trigger a live reload (no full restart needed)

### Exposing Properties to the Editor

Public properties with `{ get; set; }` are automatically exposed in the Property Grid:

```csharp
public class EnemyController : SyncScript
{
    // These appear in the editor's Property Grid
    public float Speed { get; set; } = 3.0f;
    public float DetectionRange { get; set; } = 15.0f;
    public Prefab ProjectilePrefab { get; set; }  // drag-drop in editor

    // This is hidden from the editor
    [DataMemberIgnore]
    public int InternalState { get; set; }
}
```

Use `[DataMemberIgnore]` to hide properties, and `[DataMember]` to explicitly include fields or private properties.

## 6 — Graphics Compositor

The Graphics Compositor is a visual graph that defines the rendering pipeline:

- Open the **GraphicsCompositor** asset in the Asset View
- The graph shows the rendering flow: camera → render stages → post-processing → output
- Add or remove render features, post-processing effects, and output targets
- Multiple cameras and render paths can be configured (e.g., main camera + minimap camera)

Understanding the compositor is essential for customizing rendering — adding custom render features (G07), configuring post-processing (G26), or setting up split-screen.

## 7 — Subscenes and Large Worlds

For large projects, a single scene becomes unmanageable. Stride supports subscenes:

- **Subscenes** — a scene can reference other scenes as children; each subscene loads independently
- **Streaming** — subscenes can be loaded/unloaded at runtime based on player position
- **Collaboration** — team members can work on different subscenes simultaneously, avoiding merge conflicts on a single scene file

### Setting Up Subscenes

1. Create separate scenes for each area (e.g., `Terrain.sdscene`, `Village.sdscene`, `Dungeon.sdscene`)
2. In your main scene, add a `ChildSceneComponent` referencing each subscene
3. Control loading/unloading via script:

```csharp
public class SceneLoader : AsyncScript
{
    public UrlReference<Scene> DungeonScene { get; set; }

    public override async Task Execute()
    {
        // Load subscene when player enters trigger
        var scene = await Content.LoadAsync(DungeonScene);
        Entity.Scene.Children.Add(scene);

        // Later: unload
        Entity.Scene.Children.Remove(scene);
        Content.Unload(scene);
    }
}
```

## 8 — Editor Tips and Shortcuts

**Ctrl+D** — duplicate selected entities in the scene.

**Ctrl+Z / Ctrl+Y** — undo/redo with full history.

**Shift+click in hierarchy** — multi-select entities for bulk operations.

**Lock an entity** — right-click → Lock to prevent accidental selection in the viewport (useful for ground planes and sky entities).

**Asset search** — the Asset View search bar supports filtering by type (`t:Material`, `t:Texture`, `t:Prefab`).

**Play mode shortcuts** — F5 to enter Play mode, Shift+F5 to stop. Play mode runs the game within the editor with full physics and scripting.

**Property copy-paste** — right-click a component in the Property Grid → Copy, then paste onto another entity to duplicate component settings.

## 9 — Multi-User Collaboration

Stride projects are stored as text-based files (YAML-like `.sdscene`, `.sdpkg`, `.sdmat`), making them version-control friendly:

- **Scene files** — human-readable but can produce merge conflicts when two people edit the same scene; use subscenes to partition work
- **Asset files** — materials, prefabs, and other assets are individual files; conflicts are rare if team members work on different assets
- **Binary assets** — textures, models, and audio are binary; use Git LFS or similar for large binary tracking

### Recommended Workflow

1. Assign scene ownership — each team member owns specific subscenes
2. Use prefabs for shared elements (a "Door" prefab can be edited by one person and used by everyone)
3. Commit frequently with small, focused changes
4. Use `.gitignore` for build outputs (`bin/`, `obj/`, `.sdpkg.user`)

## 10 — Common Editor Issues

**"Asset not found" after moving files** — Stride tracks assets by internal GUID, not file path. If you move asset files outside the editor (e.g., in a file manager), the references break. Always move/rename assets within Game Studio.

**Editor crashes on scene load** — often caused by a corrupted scene file or missing asset reference. Check the Stride log (`%AppData%/Stride/Logs/`) for the specific error. Restoring the scene from version control usually fixes it.

**Properties not appearing for new scripts** — Game Studio needs to recompile the project to discover new public properties. If hot reload doesn't pick them up, manually rebuild the project (Build → Rebuild Solution in the editor menu).

**Slow editor with many entities** — scenes with 10,000+ entities can slow the editor. Use subscenes to keep each scene at a manageable size. Disable wireframe/gizmo rendering for entities you aren't actively editing.

**FBX import selects wrong animations** — when importing an FBX with multiple animation stacks, use the import dialog to select specific animations rather than importing all. This is available as of Stride 4.2+.
