# G64 — ScriptedImporters & Asset Import Pipeline

> **Category:** guide · **Engine:** Unity 6 (6000.x) · **Related:** [Addressables & Asset Management](G9_addressables_asset_management.md) · [Editor Scripting](G32_editor_scripting_custom_tools.md) · [Unity Rules](../unity-arch-rules.md)

Unity's asset import pipeline transforms raw files (textures, models, audio, custom formats) into engine-ready assets. **ScriptedImporters** let you extend this pipeline to handle custom file formats — game data in CSV, dialog trees in JSON, level definitions in custom markup, tilemap data, or proprietary formats from external tools. This guide covers how the import pipeline works, how to write ScriptedImporters, and best practices for asset processing in Unity 6.

---

## How the Asset Import Pipeline Works

When a file appears in (or changes within) the `Assets/` folder, Unity's import pipeline:

1. **Detects** the file via filesystem watcher
2. **Matches** it to an importer based on file extension
3. **Runs** the importer, which converts the source file into Unity-internal assets
4. **Caches** the result in the `Library/` folder (never modify `Library/` manually)
5. **Creates** an `.meta` file tracking import settings and the asset GUID

### Asset Database V2 (Default in Unity 6)

Unity 6 uses **Asset Database V2** by default. Key differences from V1:

| Feature | V1 (Legacy) | V2 (Unity 6 Default) |
|---------|-------------|----------------------|
| Import processing | Main thread only | Worker threads (parallel) |
| Cache | Per-machine | Shared via Accelerator (optional) |
| Dependency tracking | Basic | Full artifact dependency graph |
| Import speed (large projects) | Slow | Significantly faster |

> **WHY this matters for ScriptedImporters:** V2's parallel import means your importer may run on a background thread. Avoid Unity main-thread APIs in `OnImportAsset`.

---

## Writing a Basic ScriptedImporter

A ScriptedImporter handles one or more file extensions that Unity doesn't natively support.

### Example: CSV Data Importer

Suppose your game designer maintains enemy wave data in `.wavedata` CSV files:

```
wave,enemyType,count,spawnDelay
1,Goblin,5,1.0
1,Archer,2,1.5
2,Goblin,8,0.8
2,Troll,1,3.0
3,Archer,6,0.5
3,Troll,3,2.0
```

#### Step 1: Define the Runtime Data Type

```csharp
using System;
using System.Collections.Generic;
using UnityEngine;

// WHY ScriptableObject: The imported asset lives in the Asset Database
// like any other Unity asset — it's referenceable from Inspector fields,
// included in builds via Addressables, and editable in the Inspector.
public class WaveData : ScriptableObject
{
    [Serializable]
    public class WaveEntry
    {
        public int wave;
        public string enemyType;
        public int count;
        public float spawnDelay;
    }

    [SerializeField] private List<WaveEntry> _entries = new();

    public IReadOnlyList<WaveEntry> Entries => _entries;

    /// <summary>
    /// Get all entries for a specific wave number.
    /// </summary>
    public List<WaveEntry> GetWave(int waveNumber) =>
        _entries.FindAll(e => e.wave == waveNumber);

    // Called by the importer — not part of the public runtime API
    internal void SetEntries(List<WaveEntry> entries) => _entries = entries;
}
```

#### Step 2: Write the ScriptedImporter

```csharp
#if UNITY_EDITOR
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using UnityEditor.AssetImporters;
using UnityEngine;

// WHY [ScriptedImporter]: This attribute registers the class as a custom
// importer for the specified file extension(s). The version number (1)
// should be incremented whenever the import logic changes — this forces
// Unity to reimport all files of this type.
[ScriptedImporter(version: 1, ext: "wavedata")]
public class WaveDataImporter : ScriptedImporter
{
    // WHY public fields on the importer: These appear in the Inspector
    // when you select the .wavedata file, just like texture import settings.
    // Users can configure import behavior per-file.
    [Tooltip("Skip lines where count is 0")]
    public bool skipEmptyWaves = true;

    public override void OnImportAsset(AssetImportContext ctx)
    {
        // WHY AssetImportContext: It tracks dependencies and lets you
        // register the created assets. Unity uses this for caching —
        // if dependencies haven't changed, it skips reimport.

        var waveData = ScriptableObject.CreateInstance<WaveData>();
        var entries = new List<WaveData.WaveEntry>();

        // Read the source file
        string[] lines = File.ReadAllLines(ctx.assetPath);

        for (int i = 1; i < lines.Length; i++)  // Skip header row
        {
            string line = lines[i].Trim();
            if (string.IsNullOrEmpty(line)) continue;

            string[] fields = line.Split(',');
            if (fields.Length < 4)
            {
                // WHY LogWarning with line number: Import errors should
                // be specific. "Line 5 is malformed" beats "parse error".
                ctx.LogImportWarning(
                    $"Line {i + 1}: Expected 4 fields, got {fields.Length}. Skipping.");
                continue;
            }

            var entry = new WaveData.WaveEntry
            {
                wave = int.Parse(fields[0].Trim(), CultureInfo.InvariantCulture),
                enemyType = fields[1].Trim(),
                count = int.Parse(fields[2].Trim(), CultureInfo.InvariantCulture),
                spawnDelay = float.Parse(fields[3].Trim(), CultureInfo.InvariantCulture)
            };

            if (skipEmptyWaves && entry.count == 0) continue;

            entries.Add(entry);
        }

        waveData.SetEntries(entries);
        waveData.name = Path.GetFileNameWithoutExtension(ctx.assetPath);

        // WHY SetMainObject: This makes the WaveData ScriptableObject
        // the "main" asset for the file. When you drag the .wavedata
        // file into an Inspector field typed WaveData, this is what you get.
        ctx.SetMainObject(waveData);
    }
}
#endif
```

#### Step 3: Use It

Drop a `.wavedata` file into your `Assets/` folder. Unity auto-imports it. The file now appears as a `WaveData` ScriptableObject in the Project window, draggable into any `WaveData` field.

```csharp
public class WaveSpawner : MonoBehaviour
{
    // WHY SerializeField WaveData: The designer edits the .wavedata CSV
    // in their preferred spreadsheet tool, saves, and Unity reimports
    // automatically. No manual copy-paste or converter scripts needed.
    [SerializeField] private WaveData _waveData;

    private void StartWave(int waveNumber)
    {
        foreach (var entry in _waveData.GetWave(waveNumber))
        {
            StartCoroutine(SpawnGroup(entry));
        }
    }
}
```

---

## Advanced: Multiple Sub-Assets

A single source file can produce multiple assets. This is common for sprite sheets, dialog files with multiple conversations, or tilemap definitions.

```csharp
[ScriptedImporter(version: 1, ext: "dialogpack")]
public class DialogPackImporter : ScriptedImporter
{
    public override void OnImportAsset(AssetImportContext ctx)
    {
        // Parse the source file into multiple dialog trees
        var pack = ScriptableObject.CreateInstance<DialogPack>();
        // ... parse logic ...

        // WHY SetMainObject first: The main object is what shows up
        // as the top-level asset in the Project window.
        ctx.SetMainObject(pack);

        // Add sub-assets — these appear as children in the Project window
        // (expand the main asset to see them), and are individually
        // referenceable from Inspector fields.
        foreach (var dialog in pack.Dialogs)
        {
            var dialogAsset = ScriptableObject.CreateInstance<DialogTree>();
            dialogAsset.name = dialog.Id;
            // ... populate dialogAsset ...

            // WHY AddObjectToAsset: Registers this as a sub-asset. The
            // identifier string must be unique within this import and
            // stable across reimports (so references don't break).
            ctx.AddObjectToAsset(dialog.Id, dialogAsset);
        }
    }
}
```

---

## Advanced: Import Dependencies

If your import depends on another asset (e.g., a texture referenced by path in the source file), declare the dependency so Unity reimports when it changes:

```csharp
public override void OnImportAsset(AssetImportContext ctx)
{
    // WHY DependsOnSourceAsset: Without this, changing the referenced
    // texture won't trigger reimport of this asset. The dependency
    // must be declared DURING import for the pipeline to track it.
    string texturePath = "Assets/Textures/enemy_icons.png";
    ctx.DependsOnSourceAsset(texturePath);

    var texture = UnityEditor.AssetDatabase.LoadAssetAtPath<Texture2D>(texturePath);
    // ... use texture in import ...
}
```

### Dependency Types

| Method | Use When |
|--------|----------|
| `DependsOnSourceAsset(path)` | Import depends on another asset file |
| `DependsOnCustomDependency(key)` | Import depends on a global setting / hash you define via `AssetDatabase.RegisterCustomDependency` |
| `DependsOnArtifactDependency(path)` | Import depends on the **imported result** of another asset (not just its source) |

---

## AssetPostprocessor: Modifying Built-in Imports

For file types Unity already handles (textures, models, audio), use `AssetPostprocessor` instead of `ScriptedImporter` to hook into the existing pipeline:

```csharp
#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;

// WHY AssetPostprocessor over ScriptedImporter: ScriptedImporter replaces
// the importer entirely. AssetPostprocessor hooks into the existing one —
// you can modify settings or post-process results without reimplementing
// texture/model/audio import from scratch.
public class TexturePostprocessor : AssetPostprocessor
{
    private void OnPreprocessTexture()
    {
        // WHY OnPreprocess: Runs BEFORE import. Change settings here
        // to affect how Unity imports the texture.
        TextureImporter importer = (TextureImporter)assetImporter;

        // Auto-configure textures in the "UI" folder for UI use
        if (assetPath.Contains("/UI/"))
        {
            importer.textureType = TextureImporterType.Sprite;
            importer.spritePixelsPerUnit = 100;
            importer.mipmapEnabled = false;  // UI sprites don't need mipmaps
            importer.filterMode = FilterMode.Bilinear;

            // WHY disable compression for UI: Compressed sprites can show
            // artifacts on sharp edges and text. UI is typically a small
            // fraction of texture memory, so the trade-off is worth it.
            importer.textureCompression = TextureImporterCompression.Uncompressed;
        }

        // Auto-set normal maps
        if (assetPath.Contains("_Normal") || assetPath.Contains("_normal"))
        {
            importer.textureType = TextureImporterType.NormalMap;
        }
    }

    private void OnPostprocessTexture(Texture2D texture)
    {
        // WHY OnPostprocess: Runs AFTER import. The texture is ready —
        // you can inspect or modify pixel data here.
        Debug.Log($"Imported texture: {assetPath} ({texture.width}x{texture.height})");
    }
}
#endif
```

---

## Custom Import Settings UI

Make your ScriptedImporter's Inspector user-friendly with a custom editor:

```csharp
#if UNITY_EDITOR
using UnityEditor;
using UnityEditor.AssetImporters;
using UnityEngine;

// WHY [CustomEditor]: The default Inspector for ScriptedImporter shows
// raw fields. A custom editor can add validation, previews, and help boxes.
[CustomEditor(typeof(WaveDataImporter))]
public class WaveDataImporterEditor : ScriptedImporterEditor
{
    public override void OnInspectorGUI()
    {
        // Draw default import settings
        base.OnInspectorGUI();

        EditorGUILayout.Space();
        EditorGUILayout.HelpBox(
            "Place .wavedata files in Assets/. Each file produces a " +
            "WaveData ScriptableObject with parsed wave entries.",
            MessageType.Info);

        // Show a preview of the imported data
        if (assetTarget is WaveData waveData)
        {
            EditorGUILayout.LabelField("Preview", EditorStyles.boldLabel);
            EditorGUILayout.LabelField($"Total entries: {waveData.Entries.Count}");

            int maxWave = 0;
            foreach (var entry in waveData.Entries)
            {
                if (entry.wave > maxWave) maxWave = entry.wave;
            }
            EditorGUILayout.LabelField($"Wave count: {maxWave}");
        }

        // WHY ApplyRevertGUI: Required for ScriptedImporterEditor.
        // Shows the Apply/Revert buttons that trigger reimport
        // when the user changes import settings.
        ApplyRevertGUI();
    }
}
#endif
```

---

## Batch Processing with AssetDatabase

For bulk operations (renaming, retagging, converting), use `AssetDatabase` APIs:

```csharp
#if UNITY_EDITOR
using UnityEditor;
using UnityEngine;

public static class AssetBatchTools
{
    [MenuItem("Tools/Batch/Tag All Enemy Prefabs")]
    private static void TagEnemyPrefabs()
    {
        // WHY StartAssetEditing/StopAssetEditing: Without this wrapper,
        // Unity reimports after every individual change. StartAssetEditing
        // batches all changes and processes them in one pass at the end.
        // On 500 prefabs, this is the difference between 30 seconds and 2 seconds.
        AssetDatabase.StartAssetEditing();
        try
        {
            string[] guids = AssetDatabase.FindAssets(
                "t:Prefab", new[] { "Assets/Prefabs/Enemies" });

            foreach (string guid in guids)
            {
                string path = AssetDatabase.GUIDToAssetPath(guid);
                GameObject prefab = AssetDatabase.LoadAssetAtPath<GameObject>(path);

                if (prefab.GetComponent<EnemyHealth>() != null)
                {
                    // Tag the asset for Addressables grouping or build filtering
                    AssetDatabase.SetLabels(
                        prefab, new[] { "Enemy", "Combatant" });
                }
            }
        }
        finally
        {
            // WHY finally: If an exception occurs mid-batch, the editor
            // gets stuck in "editing" mode. Always stop in a finally block.
            AssetDatabase.StopAssetEditing();
            AssetDatabase.Refresh();
        }
    }
}
#endif
```

---

## Performance Tips

1. **Increment the importer version** whenever you change import logic. Without this, existing assets use stale cached results.
2. **Keep `OnImportAsset` fast** — it blocks the import pipeline. For heavy processing (mesh generation, texture baking), consider generating intermediate cached data.
3. **Use `AssetDatabase.StartAssetEditing()` / `StopAssetEditing()`** for batch operations to avoid per-file reimport overhead.
4. **Avoid Unity main-thread APIs** in `OnImportAsset` where possible — Asset Database V2 may run imports on worker threads.
5. **Use `ctx.DependsOn*` methods** to declare dependencies explicitly. Missing dependencies cause stale imports; over-declaring causes unnecessary reimports.
6. **Test with the Unity Accelerator** for team workflows — it caches import artifacts across machines, turning a 20-minute first import into minutes.

---

## Common Pitfalls

### 1. Extension Conflicts

```csharp
// WRONG: Using an extension Unity already handles
[ScriptedImporter(version: 1, ext: "json")]  // Unity has a built-in JSON handler

// CORRECT: Use a unique extension for your custom format
[ScriptedImporter(version: 1, ext: "gamejson")]
```

You can override built-in importers, but it's fragile. Prefer unique extensions.

### 2. Forgetting to Increment Version

```csharp
// After changing parse logic, you MUST bump this number:
[ScriptedImporter(version: 2, ext: "wavedata")]  // Was 1, now 2
//                         ^^^ triggers reimport of all .wavedata files
```

### 3. Missing Meta Files in Version Control

`.meta` files store the importer GUID and settings. If they're not committed, teammates get different asset references and broken links. Always commit `.meta` files.

---

## Version Notes

| Feature | Minimum Version |
|---------|-----------------|
| ScriptedImporter | Unity 2017.1+ |
| Asset Database V2 | Unity 2019.3+ (opt-in), Unity 6 (default) |
| `AssetImportContext.DependsOnCustomDependency` | Unity 2020.1+ |
| `AssetImportContext.DependsOnArtifactDependency` | Unity 2021.2+ |
| `ctx.LogImportWarning` / `LogImportError` | Unity 2022.1+ |
| Parallel import (worker threads) | Unity 6 (Asset Database V2) |
| Unity Accelerator shared cache | Unity 2019.3+ |
