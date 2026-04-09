# G32 — Editor Scripting & Custom Tools

> **Category:** guide · **Engine:** Unity 6 (6000.x) · **Related:** [G5 UI Toolkit](G5_ui_toolkit.md) · [G14 ScriptableObject Architecture](G14_scriptable_object_architecture.md) · [G18 Automated Testing](G18_automated_testing.md) · [Unity Rules](../unity-arch-rules.md)

Custom editor tools accelerate development by exposing game-specific workflows directly in the Unity Editor. This guide covers EditorWindows, Custom Inspectors, PropertyDrawers, Gizmos, SceneView overlays, and menu items — all using **UI Toolkit** (Unity 6's recommended approach) with IMGUI fallbacks where needed.

---

## UI Toolkit vs IMGUI

Unity 6 recommends **UI Toolkit** for all new editor UI. IMGUI (`OnGUI`, `EditorGUILayout`) is still supported but considered legacy for custom tools.

| Feature | UI Toolkit | IMGUI |
|---|---|---|
| **Styling** | USS (CSS-like), themes, dark/light | Inline code only |
| **Layout** | Flexbox, UXML templates | Immediate-mode, manual |
| **Data binding** | SerializedProperty binding | Manual `serializedObject.Update()` |
| **Hot reload** | Live Reload support | Requires recompilation |
| **Reusability** | UXML templates, shared USS | Copy-paste code |
| **Learning curve** | Web-dev familiar | Unity-specific |

> **Rule of thumb:** Use UI Toolkit for new tools. Use IMGUI only for quick debugging overlays or when extending legacy editor code.

---

## Custom EditorWindow

EditorWindows are standalone panels (like the Inspector or Console) for your game-specific tools.

### Basic Structure (UI Toolkit)

```csharp
using UnityEditor;
using UnityEngine;
using UnityEngine.UIElements;

public class LevelDesignerWindow : EditorWindow
{
    // Menu item to open the window
    [MenuItem("Tools/Level Designer")]
    public static void ShowWindow()
    {
        // GetWindow creates or focuses the window. The title appears on the tab.
        var window = GetWindow<LevelDesignerWindow>("Level Designer");
        window.minSize = new Vector2(400, 300);
    }

    // CreateGUI is called when the window is created or after domain reload.
    // All UI setup goes here — NOT in OnEnable (which fires before UXML is ready).
    public void CreateGUI()
    {
        // Root element of this window's visual tree
        var root = rootVisualElement;

        // Add a label
        root.Add(new Label("Level Designer Tool")
        {
            style =
            {
                fontSize = 18,
                unityFontStyleAndWeight = FontStyle.Bold,
                marginBottom = 10
            }
        });

        // Add an object field for selecting a prefab
        var prefabField = new ObjectField("Tile Prefab")
        {
            objectType = typeof(GameObject),
            allowSceneObjects = false  // only project assets
        };
        root.Add(prefabField);

        // Add an integer field for grid size
        var gridSizeField = new IntegerField("Grid Size") { value = 10 };
        root.Add(gridSizeField);

        // Add a button that uses the field values
        var generateButton = new Button(() =>
        {
            var prefab = prefabField.value as GameObject;
            int size = gridSizeField.value;

            if (prefab == null)
            {
                EditorUtility.DisplayDialog("Error", "Assign a tile prefab first.", "OK");
                return;
            }

            GenerateGrid(prefab, size);
        })
        {
            text = "Generate Grid"
        };
        root.Add(generateButton);
    }

    private void GenerateGrid(GameObject prefab, int size)
    {
        // Register undo so the user can Ctrl+Z the entire operation
        Undo.SetCurrentGroupName("Generate Grid");
        int undoGroup = Undo.GetCurrentGroup();

        var parent = new GameObject("Generated Grid");
        Undo.RegisterCreatedObjectUndo(parent, "Create Grid Parent");

        for (int x = 0; x < size; x++)
        {
            for (int z = 0; z < size; z++)
            {
                var tile = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
                tile.transform.SetParent(parent.transform);
                tile.transform.position = new Vector3(x, 0, z);
                Undo.RegisterCreatedObjectUndo(tile, "Create Tile");
            }
        }

        Undo.CollapseUndoOperations(undoGroup);
    }
}
```

### Hot Reload Support

EditorWindows must handle domain reload (when scripts recompile). Since `VisualElement` is not serializable, store state in serialized fields and rebuild UI in `CreateGUI`:

```csharp
public class MyToolWindow : EditorWindow
{
    // Serialized fields survive domain reload
    [SerializeField] private string _lastSearchQuery = "";
    [SerializeField] private int _selectedTabIndex = 0;

    public void CreateGUI()
    {
        // Rebuild UI from scratch, restoring state from serialized fields
        var searchField = new TextField("Search") { value = _lastSearchQuery };
        searchField.RegisterValueChangedCallback(evt => _lastSearchQuery = evt.newValue);
        rootVisualElement.Add(searchField);
    }
}
```

---

## Custom Inspector

Custom Inspectors replace the default Inspector UI for your MonoBehaviours or ScriptableObjects.

### UI Toolkit Inspector

```csharp
using UnityEditor;
using UnityEditor.UIElements;
using UnityEngine;
using UnityEngine.UIElements;

// The target type this inspector draws
[CustomEditor(typeof(EnemyConfig))]
public class EnemyConfigEditor : Editor
{
    public override VisualElement CreateInspectorGUI()
    {
        var root = new VisualElement();

        // Header
        root.Add(new Label("Enemy Configuration")
        {
            style = { fontSize = 14, unityFontStyleAndWeight = FontStyle.Bold }
        });

        // PropertyField auto-binds to SerializedProperty and uses the
        // correct control type (slider, enum popup, color picker, etc.)
        root.Add(new PropertyField(serializedObject.FindProperty("enemyName")));
        root.Add(new PropertyField(serializedObject.FindProperty("maxHealth")));
        root.Add(new PropertyField(serializedObject.FindProperty("moveSpeed")));

        // Conditional visibility — show armor field only for tank enemies
        var typeField = new PropertyField(serializedObject.FindProperty("enemyType"));
        root.Add(typeField);

        var armorField = new PropertyField(serializedObject.FindProperty("armorRating"));
        root.Add(armorField);

        // Update visibility when the enum changes
        typeField.RegisterValueChangeCallback(evt =>
        {
            var typeProp = serializedObject.FindProperty("enemyType");
            armorField.style.display = typeProp.enumValueIndex == 2  // "Tank"
                ? DisplayStyle.Flex
                : DisplayStyle.None;
        });

        // Add a button for editor-time actions
        root.Add(new Button(() =>
        {
            var config = (EnemyConfig)target;
            config.ResetToDefaults();
            serializedObject.Update();  // refresh Inspector with new values
        })
        {
            text = "Reset to Defaults"
        });

        return root;
    }
}
```

### Key Principle: Always Use SerializedProperty

Never read/write `target` fields directly in an Inspector. Use `SerializedProperty` for:
- Automatic Undo/Redo support
- Multi-object editing
- Prefab override detection
- Dirty-flag management

```csharp
// WRONG — bypasses undo, prefab overrides, multi-edit
((MyComponent)target).health = 100;

// CORRECT — works with all editor systems
var healthProp = serializedObject.FindProperty("health");
healthProp.intValue = 100;
serializedObject.ApplyModifiedProperties();
```

---

## PropertyDrawer

PropertyDrawers customize how a single field type renders in *any* Inspector. They're more reusable than full Custom Inspectors.

### Example: A Clamped Range Attribute

```csharp
// The attribute — usable on any float field in any MonoBehaviour
using UnityEngine;

public class ClampedRangeAttribute : PropertyAttribute
{
    public float Min { get; }
    public float Max { get; }

    public ClampedRangeAttribute(float min, float max)
    {
        Min = min;
        Max = max;
    }
}
```

```csharp
// The drawer — placed in an Editor/ folder
using UnityEditor;
using UnityEditor.UIElements;
using UnityEngine;
using UnityEngine.UIElements;

[CustomPropertyDrawer(typeof(ClampedRangeAttribute))]
public class ClampedRangeDrawer : PropertyDrawer
{
    // UI Toolkit version (Unity 6 preferred)
    public override VisualElement CreatePropertyGUI(SerializedProperty property)
    {
        var attr = (ClampedRangeAttribute)attribute;

        // Slider auto-binds to the SerializedProperty via bindingPath
        var slider = new Slider(property.displayName, attr.Min, attr.Max)
        {
            bindingPath = property.propertyPath,
            showInputField = true  // shows numeric input alongside slider
        };

        return slider;
    }
}
```

```csharp
// Usage in any script:
public class Weapon : MonoBehaviour
{
    [ClampedRange(0.1f, 5.0f)]
    public float fireRate = 1.0f;

    [ClampedRange(1f, 100f)]
    public float damage = 10f;
}
```

---

## Scene View Tools & Gizmos

### Custom Gizmos

Draw visual helpers in the Scene view for your components:

```csharp
using UnityEngine;

public class PatrolRoute : MonoBehaviour
{
    public Transform[] waypoints;
    public float waypointRadius = 0.5f;

    // DrawGizmos is called every frame when the object is visible
    private void OnDrawGizmos()
    {
        if (waypoints == null || waypoints.Length == 0) return;

        Gizmos.color = new Color(0f, 1f, 0.5f, 0.3f);

        for (int i = 0; i < waypoints.Length; i++)
        {
            if (waypoints[i] == null) continue;

            // Draw a sphere at each waypoint
            Gizmos.DrawSphere(waypoints[i].position, waypointRadius);

            // Draw lines connecting waypoints
            if (i < waypoints.Length - 1 && waypoints[i + 1] != null)
            {
                Gizmos.color = Color.green;
                Gizmos.DrawLine(waypoints[i].position, waypoints[i + 1].position);
                Gizmos.color = new Color(0f, 1f, 0.5f, 0.3f);
            }
        }
    }

    // Only drawn when this object is selected in the Hierarchy
    private void OnDrawGizmosSelected()
    {
        Gizmos.color = Color.yellow;
        Gizmos.DrawWireSphere(transform.position, 10f);  // detection radius
    }
}
```

### Handles (Interactive Scene Tools)

Handles let users drag, rotate, and resize things directly in the Scene view:

```csharp
using UnityEditor;
using UnityEngine;

[CustomEditor(typeof(PatrolRoute))]
public class PatrolRouteEditor : Editor
{
    private void OnSceneGUI()
    {
        var route = (PatrolRoute)target;
        if (route.waypoints == null) return;

        for (int i = 0; i < route.waypoints.Length; i++)
        {
            if (route.waypoints[i] == null) continue;

            // Show a movable position handle at each waypoint
            EditorGUI.BeginChangeCheck();
            Vector3 newPos = Handles.PositionHandle(
                route.waypoints[i].position,
                Quaternion.identity
            );

            if (EditorGUI.EndChangeCheck())
            {
                // Record undo before modifying
                Undo.RecordObject(route.waypoints[i], "Move Waypoint");
                route.waypoints[i].position = newPos;
            }

            // Draw a label at each waypoint
            Handles.Label(
                route.waypoints[i].position + Vector3.up * 1.5f,
                $"WP {i}",
                EditorStyles.boldLabel
            );
        }
    }
}
```

---

## Menu Items & Shortcuts

### Context Menu Items

```csharp
using UnityEditor;
using UnityEngine;

public static class GameDevMenuItems
{
    // Adds a menu item under Tools
    [MenuItem("Tools/Game/Reset Player Position")]
    public static void ResetPlayerPosition()
    {
        var player = GameObject.FindWithTag("Player");
        if (player != null)
        {
            Undo.RecordObject(player.transform, "Reset Player Position");
            player.transform.position = Vector3.zero;
        }
    }

    // Validate function — grays out the menu item when no Player exists
    [MenuItem("Tools/Game/Reset Player Position", true)]
    public static bool ResetPlayerPositionValidate()
    {
        return GameObject.FindWithTag("Player") != null;
    }

    // Context menu on a specific component (right-click in Inspector)
    [MenuItem("CONTEXT/Rigidbody/Zero Velocity")]
    public static void ZeroVelocity(MenuCommand command)
    {
        var rb = (Rigidbody)command.context;
        Undo.RecordObject(rb, "Zero Velocity");
        rb.linearVelocity = Vector3.zero;
        rb.angularVelocity = Vector3.zero;
    }

    // Keyboard shortcut: Ctrl+Shift+G (Windows) / Cmd+Shift+G (Mac)
    [MenuItem("Tools/Game/Group Selected %#g")]
    public static void GroupSelected()
    {
        if (Selection.gameObjects.Length == 0) return;

        var group = new GameObject("Group");
        Undo.RegisterCreatedObjectUndo(group, "Group Objects");

        // Center the group at the average position
        Vector3 center = Vector3.zero;
        foreach (var go in Selection.gameObjects)
            center += go.transform.position;
        center /= Selection.gameObjects.Length;
        group.transform.position = center;

        foreach (var go in Selection.gameObjects)
        {
            Undo.SetTransformParent(go.transform, group.transform, "Group Objects");
        }

        Selection.activeGameObject = group;
    }
}
```

### Shortcut Key Reference

| Symbol | Key |
|---|---|
| `%` | Ctrl (Win) / Cmd (Mac) |
| `#` | Shift |
| `&` | Alt |
| `_` | No modifier (standalone key) |

Example: `%#g` = Ctrl+Shift+G, `&#r` = Alt+Shift+R.

---

## ScriptableObject-Based Tool Data

Store tool configuration in ScriptableObjects so settings persist across sessions:

```csharp
// The data asset
[CreateAssetMenu(fileName = "LevelGenConfig", menuName = "Tools/Level Gen Config")]
public class LevelGenConfig : ScriptableObject
{
    public int gridWidth = 20;
    public int gridHeight = 20;
    public float tileSpacing = 1f;
    public GameObject[] tilePrefabs;
}
```

```csharp
// Load it in your EditorWindow
public class LevelGenWindow : EditorWindow
{
    private LevelGenConfig _config;

    public void CreateGUI()
    {
        // ObjectField lets the user select which config to use
        var configField = new ObjectField("Config")
        {
            objectType = typeof(LevelGenConfig)
        };
        configField.RegisterValueChangedCallback(evt =>
        {
            _config = evt.newValue as LevelGenConfig;
        });
        rootVisualElement.Add(configField);
    }
}
```

---

## Project Organization

```
Assets/
├── Editor/                      ← Editor-only scripts (auto-excluded from builds)
│   ├── Windows/
│   │   └── LevelDesignerWindow.cs
│   ├── Inspectors/
│   │   └── EnemyConfigEditor.cs
│   ├── PropertyDrawers/
│   │   └── ClampedRangeDrawer.cs
│   └── MenuItems/
│       └── GameDevMenuItems.cs
├── Editor Default Resources/    ← Editor-only assets (icons, UXML, USS)
│   ├── LevelDesigner.uxml
│   └── LevelDesigner.uss
└── Runtime/                     ← Game code and attributes
    └── Attributes/
        └── ClampedRangeAttribute.cs
```

> **Critical:** Editor scripts must be inside an `Editor/` folder or an assembly with `Editor` as a platform. Anything outside `Editor/` that references `UnityEditor` will cause build failures.

---

## Best Practices

1. **Always support Undo** — use `Undo.RecordObject`, `Undo.RegisterCreatedObjectUndo`, and `Undo.CollapseUndoOperations`. Tools without undo erode trust.
2. **Use SerializedProperty** — never modify `target` directly. It breaks multi-select, prefab overrides, and undo.
3. **Fail gracefully** — null-check everything. Editors run on arbitrary scene states.
4. **Minimize per-frame work** — `OnSceneGUI` and `OnDrawGizmos` run every repaint. Cache expensive calculations.
5. **Support Live Reload** — put all UI creation in `CreateGUI`, store state in `[SerializeField]` fields.
6. **Use EditorUtility.SetDirty sparingly** — prefer `serializedObject.ApplyModifiedProperties()` which handles dirty-flagging automatically.
7. **Test with empty scenes** — your tool should never throw NullReferenceException when no objects are selected or the scene is empty.

---

## Further Reading

- [Unity Manual — Custom Editor Tools](https://docs.unity3d.com/6000.2/Documentation/Manual/UsingCustomEditorTools.html)
- [Unity Manual — Create a Custom Editor Window](https://docs.unity3d.com/Manual/UIE-HowTo-CreateEditorWindow.html)
- [Unity Manual — Custom Inspectors](https://docs.unity3d.com/6000.0/Documentation/Manual/UIE-HowTo-CreateCustomInspector.html)
- [Unity Manual — PropertyDrawers](https://docs.unity3d.com/Manual/editor-PropertyDrawers.html)
- [Unity Learn — Editor Scripting](https://learn.unity.com/tutorial/editor-scripting)
