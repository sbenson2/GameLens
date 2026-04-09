# G37 — Editor Scripting & Automation

> **Category:** guide · **Engine:** Unreal Engine 5.5+ · **Related:** [G15 Blueprint & C++ Workflow](G15_blueprint_cpp_workflow.md) · [G14 Asset Management](G14_asset_management.md)

Unreal Engine provides three complementary approaches to editor automation: **Python scripting**, **Editor Utility Blueprints (Blutilities)**, and **C++ editor modules**. This guide covers when to use each, how to set them up, and practical patterns for automating asset pipelines, batch operations, project validation, and custom editor tools in UE 5.5+.

---

## Choosing Your Approach

| Approach | Best For | Iteration Speed | Complexity Ceiling | Requires Compile |
|----------|----------|----------------|--------------------|-----------------|
| Python | Batch operations, asset pipelines, CI scripts, one-off tasks | Fastest — edit & rerun | Medium — limited to exposed API | No |
| Editor Utility Blueprints | UI-driven tools, artist workflows, property editors | Fast — BP hot-reload | Medium — visual scripting limits | No |
| C++ Editor Module | Custom asset types, Slate UI, deep engine integration, plugins | Slow — full recompile | Unlimited | Yes |

**Rule of thumb:** Start with Python for pipeline tasks, Blutilities for artist-facing tools, and drop to C++ only when you need Slate UI, custom asset editors, or functionality not exposed to the scripting layer.

---

## Python Editor Scripting

### Setup

1. **Enable the plugin:** Edit → Plugins → Scripting → **Python Editor Script Plugin** → Enable → Restart editor.
2. **Enable Editor Scripting Utilities:** Edit → Plugins → Scripting → **Editor Scripting Utilities** → Enable.

Python scripts can be run from:
- **Output Log** — type `py "path/to/script.py"` or inline code
- **Python console** — Window → Developer Tools → Python Console (UE 5.5+)
- **Startup scripts** — configured in Project Settings → Plugins → Python → Startup Scripts
- **Commandlet** — `UE4Editor-Cmd.exe ProjectName -run=pythonscript -script="path/to/script.py"`

### Key Python Modules

```python
import unreal

# Asset Registry — find and query assets
asset_registry = unreal.AssetRegistryHelpers.get_asset_registry()

# Editor Asset Library — load, save, rename, delete, duplicate
eal = unreal.EditorAssetLibrary

# Editor Utility Library — general editor operations
eul = unreal.EditorUtilityLibrary

# Static Mesh Editor Subsystem — mesh-specific operations
smes = unreal.get_editor_subsystem(unreal.StaticMeshEditorSubsystem)

# Level Editor Subsystem
les = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)

# Asset Tools — import, create, bulk operations
asset_tools = unreal.AssetToolsHelpers.get_asset_tools()
```

### Example: Batch-Set Nanite on All Static Meshes

```python
import unreal

eal = unreal.EditorAssetLibrary
asset_registry = unreal.AssetRegistryHelpers.get_asset_registry()

# Find all static meshes in /Game/Environment/
assets = asset_registry.get_assets_by_path("/Game/Environment", recursive=True)

count = 0
with unreal.ScopedSlowTask(len(assets), "Enabling Nanite...") as slow_task:
    slow_task.make_dialog(True)
    for asset_data in assets:
        if slow_task.should_cancel():
            break
        slow_task.enter_progress_frame(1)

        if asset_data.asset_class_path.asset_name != "StaticMesh":
            continue

        mesh = asset_data.get_asset()
        if mesh is None:
            continue

        # Enable Nanite on the mesh
        nanite_settings = mesh.get_editor_property("nanite_settings")
        if not nanite_settings.enabled:
            nanite_settings.enabled = True
            mesh.set_editor_property("nanite_settings", nanite_settings)
            eal.save_loaded_asset(mesh)
            count += 1

unreal.log(f"Enabled Nanite on {count} static meshes.")
```

### Example: Validate Assets Before Build

```python
import unreal

eal = unreal.EditorAssetLibrary
errors = []

# Check all textures for power-of-two dimensions
asset_registry = unreal.AssetRegistryHelpers.get_asset_registry()
textures = asset_registry.get_assets_by_class(
    unreal.TopLevelAssetPath("/Script/Engine", "Texture2D")
)

for asset_data in textures:
    texture = asset_data.get_asset()
    if texture is None:
        continue

    x = texture.blueprint_get_size_x()
    y = texture.blueprint_get_size_y()

    if (x & (x - 1)) != 0 or (y & (y - 1)) != 0:
        errors.append(f"Non-POT texture: {asset_data.package_name} ({x}x{y})")

if errors:
    for e in errors:
        unreal.log_warning(e)
    unreal.log_error(f"{len(errors)} validation errors found.")
else:
    unreal.log("All textures pass POT validation.")
```

### Startup Scripts

Configure scripts that run automatically when the editor opens:

**Project Settings → Plugins → Python → Additional Paths:**
```
Content/Python
```

**Project Settings → Plugins → Python → Startup Scripts:**
```
startup/register_menus.py
startup/set_defaults.py
```

These run after the editor is fully initialized — safe to use subsystems and the asset registry.

---

## Editor Utility Blueprints (Blutilities)

### Editor Utility Widget (EUW)

An Editor Utility Widget is a UMG widget that runs inside the editor as a dockable tab. It provides a visual interface for artist-facing tools.

**Creating an EUW:**

1. Content Browser → Add → Editor Utilities → Editor Utility Widget
2. Design the UI using UMG (buttons, text fields, asset pickers, etc.)
3. In the Graph, use `Get Editor Subsystem` nodes, `Editor Asset Library` functions, and standard BP logic.
4. Right-click the asset → **Run Editor Utility Widget** to open.

### Editor Utility Blueprint (EUB)

An Editor Utility Blueprint runs headless (no UI) and is triggered from the Content Browser context menu or via `Run Editor Utility Blueprint`.

**Creating an EUB:**

1. Content Browser → Add → Editor Utilities → Editor Utility Blueprint
2. Parent class: `EditorUtilityObject` (headless) or `ActorActionUtility` (per-actor context)
3. Implement `Run()` function.

### Example: Bulk Rename Tool (EUW)

1. Create an Editor Utility Widget.
2. Add a Text Input field for search pattern, a Text Input for replacement, and a Button.
3. On Button Click:

```
Get Selected Assets → For Each → 
  Get Asset Name → Replace(Search, Replacement) → 
  Rename Asset(OldPath, NewPath)
```

### Registering Blutilities in Menus (UE 5.5+)

Blutilities can be registered as menu entries via the **Tool Menus** system:

```python
# Python approach to register a Blutility as a menu item
import unreal

menus = unreal.ToolMenus.get()
menu = menus.find_menu("LevelEditor.MainMenu.Tools")

entry = unreal.ToolMenuEntry(
    name="MyBatchTool",
    type=unreal.MultiBlockType.MENU_ENTRY
)
entry.set_label("My Batch Tool")
entry.set_string_command(
    type=unreal.ToolMenuStringCommandType.PYTHON,
    custom_type="",
    string="unreal.EditorUtilityLibrary.run_editor_utility_blueprint('/Game/EditorTools/BP_MyBatchTool')"
)
menu.add_menu_entry("Scripts", entry)
menus.refresh_all_widgets()
```

---

## C++ Editor Modules

### When to Use C++

- Custom asset types with dedicated editors (e.g., a data table editor, dialogue graph)
- Slate-based UI that exceeds UMG capabilities
- Custom importers/exporters
- Deep integration with build pipeline or commandlets
- Performance-critical batch operations

### Module Setup

Create a separate **Editor** module that only loads in the editor:

```csharp
// MyProjectEditor.Build.cs
public class MyProjectEditor : ModuleRules
{
    public MyProjectEditor(ReadOnlyTargetRules Target) : base(Target)
    {
        PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

        PublicDependencyModuleNames.AddRange(new string[] {
            "Core",
            "CoreUObject",
            "Engine",
            "UnrealEd",
            "Blutility",
            "UMG",
            "EditorScriptingUtilities",
            "Slate",
            "SlateCore",
            "EditorStyle",
            "ToolMenus",
            "ContentBrowser"
        });

        // Only compile in editor builds
        // In .uproject, set Type = "Editor" for this module
    }
}
```

### Example: Custom Asset Action

```cpp
// MyAssetAction.h
#pragma once

#include "AssetActionUtility.h"
#include "MyAssetAction.generated.h"

UCLASS()
class UMyAssetAction : public UAssetActionUtility
{
    GENERATED_BODY()

public:
    // This function appears in the Content Browser right-click menu
    // for any selected StaticMesh assets
    UFUNCTION(CallInEditor, Category = "MyTools")
    void SetAllSelectedMeshesToNanite();
};

// MyAssetAction.cpp
#include "MyAssetAction.h"
#include "EditorUtilityLibrary.h"
#include "Engine/StaticMesh.h"

void UMyAssetAction::SetAllSelectedMeshesToNanite()
{
    TArray<UObject*> SelectedAssets = UEditorUtilityLibrary::GetSelectedAssets();

    for (UObject* Asset : SelectedAssets)
    {
        UStaticMesh* Mesh = Cast<UStaticMesh>(Asset);
        if (!Mesh) continue;

        FMeshNaniteSettings NaniteSettings = Mesh->NaniteSettings;
        if (!NaniteSettings.bEnabled)
        {
            NaniteSettings.bEnabled = true;
            Mesh->NaniteSettings = NaniteSettings;
            Mesh->PostEditChange();
            Mesh->MarkPackageDirty();
        }
    }

    UE_LOG(LogTemp, Log, TEXT("Nanite enabled on %d meshes"), SelectedAssets.Num());
}
```

### Registering Editor Menu Extensions (C++)

```cpp
// In your module's StartupModule():
void FMyProjectEditorModule::StartupModule()
{
    UToolMenus::RegisterStartupCallback(FSimpleMulticastDelegate::FDelegate::CreateRaw(
        this, &FMyProjectEditorModule::RegisterMenus));
}

void FMyProjectEditorModule::RegisterMenus()
{
    UToolMenu* Menu = UToolMenus::Get()->ExtendMenu("LevelEditor.MainMenu.Tools");
    FToolMenuSection& Section = Menu->FindOrAddSection("MyTools");

    Section.AddMenuEntry(
        "RunMyValidator",
        FText::FromString("Run Asset Validator"),
        FText::FromString("Validates all assets in the project"),
        FSlateIcon(),
        FUIAction(FExecuteAction::CreateLambda([]()
        {
            // Trigger validation logic
        }))
    );
}
```

---

## CI / Build Automation

### Running Python Scripts in CI

Unreal Engine supports headless commandlet execution, which integrates with CI pipelines:

```bash
# Run a Python validation script as part of CI
UnrealEditor-Cmd.exe MyProject.uproject \
    -run=pythonscript \
    -script="Content/Python/ci/validate_assets.py" \
    -unattended -nopause -nullrhi
```

The `-nullrhi` flag disables rendering (no GPU required), `-unattended` suppresses dialogs.

### Custom Commandlets (C++)

For complex CI tasks, create a custom commandlet:

```cpp
// MyValidationCommandlet.h
#pragma once
#include "Commandlets/Commandlet.h"
#include "MyValidationCommandlet.generated.h"

UCLASS()
class UMyValidationCommandlet : public UCommandlet
{
    GENERATED_BODY()

public:
    virtual int32 Main(const FString& Params) override;
};

// MyValidationCommandlet.cpp
int32 UMyValidationCommandlet::Main(const FString& Params)
{
    // Load asset registry, iterate assets, validate, return 0 on success
    UE_LOG(LogTemp, Log, TEXT("Running asset validation..."));

    // ... validation logic ...

    return ErrorCount > 0 ? 1 : 0;  // Non-zero = CI failure
}
```

Run with:

```bash
UnrealEditor-Cmd.exe MyProject.uproject -run=MyValidation -unattended -nopause
```

---

## Common Automation Patterns

### Asset Pipeline Automation

| Task | Recommended Approach | Notes |
|------|---------------------|-------|
| Batch rename assets | Python + `EditorAssetLibrary` | Scriptable, supports regex |
| Set texture compression | Python + `Texture2D` properties | Iterate asset registry |
| Enable Nanite on meshes | Python or C++ `AssetActionUtility` | See examples above |
| Import FBX batch | Python + `AssetTools.import_asset_tasks()` | Configure `FAssetImportTask` |
| Generate LODs | Python + `StaticMeshEditorSubsystem` | `set_lod_count()`, `set_lod_reduction_settings()` |
| Validate naming conventions | Python startup script | Run on save via `on_asset_pre_save` delegate |

### Level Automation

| Task | Recommended Approach |
|------|---------------------|
| Batch-place actors | Python + `EditorLevelLibrary.spawn_actor_from_class()` |
| Find and fix broken references | Python + `AssetRegistryHelpers.get_referencers()` |
| Export level data to JSON | Python — iterate actors, serialize properties |
| Automated screenshots | Python + `AutomationTool` or `HighResScreenshot` commandlet |

---

## Debugging Editor Scripts

### Python

- **Output Log** — `unreal.log()`, `unreal.log_warning()`, `unreal.log_error()`
- **Breakpoints** — attach a remote Python debugger (e.g., VS Code with `debugpy`) to the editor's embedded Python interpreter
- **Interactive REPL** — Python Console window for testing expressions

### Blutilities

- **Blueprint Debugger** — standard BP breakpoints work in Editor Utility Blueprints
- **Print String** — outputs to the viewport and Output Log

### C++

- **Attach debugger** to the editor process (Visual Studio / Rider)
- **`UE_LOG`** for Output Log output
- **Unreal Insights** — for profiling editor tool performance

---

## Best Practices

1. **Separate editor code from runtime code** — put automation in an Editor module or Content/Python/. Never ship editor-only code in game builds.
2. **Use `ScopedSlowTask`** for any batch operation that processes more than ~20 assets — it shows a progress bar and cancellation button.
3. **Mark packages dirty** after programmatic changes — call `MarkPackageDirty()` (C++) or let `EditorAssetLibrary.save_loaded_asset()` (Python) handle it.
4. **Test scripts on a subset first** — before running a batch operation on 10,000 assets, test on 10.
5. **Version control your scripts** — commit Python scripts and Blutilities alongside the project. They are project infrastructure.
6. **Prefer data-driven configuration** — use Data Tables or JSON config files to parameterize tools rather than hardcoding values in scripts.

---

## Further Reading

- [Scripting the Unreal Editor Using Python (Epic)](https://dev.epicgames.com/documentation/en-us/unreal-engine/scripting-the-unreal-editor-using-python)
- [Editor Utility Widgets (Epic Documentation)](https://dev.epicgames.com/documentation/en-us/unreal-engine/editor-utility-widgets-in-unreal-engine)
- [G15 — Blueprint & C++ Workflow](G15_blueprint_cpp_workflow.md) — companion guide for the runtime-side BP/C++ split
- [G14 — Asset Management](G14_asset_management.md) — asset loading, soft references, and streaming strategies
