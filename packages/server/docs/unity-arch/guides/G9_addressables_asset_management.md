# G9 — Addressables & Asset Management

> **Category:** guide · **Engine:** Unity 6 (6000.x, Addressables 1.21+) · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [G1 Scene Management](G1_scene_management.md) · [Unity Rules](../unity-arch-rules.md)

The Addressable Asset System (`com.unity.addressables`) is Unity's modern approach to loading, unloading, and organizing game assets. It replaces the manual Asset Bundle workflow with a label-and-address based system that handles dependency resolution, memory management, and optional remote content delivery. This guide covers the architecture, setup, loading patterns, memory management, and production best practices for Unity 6 projects.

---

## Why Addressables?

The traditional approaches to asset loading in Unity each have significant problems:

| Approach | Problem |
|----------|---------|
| `Resources.Load()` | Everything in `Resources/` ships in the build, inflating binary size. No selective loading, no remote updates. |
| Raw AssetBundles | Full manual dependency management. Easy to create memory leaks (double-loading, forgotten unloads). Complex build pipeline. |
| Direct scene references | Hard references load assets into memory at scene load even if unused. Large scenes become memory bombs. |

Addressables solves these with:

- **Address-based loading** — refer to assets by string address or `AssetReference`, not file path
- **Automatic dependency resolution** — loading one asset loads all its dependencies
- **Reference counting** — release handles to unload; system tracks when nothing references an asset
- **Remote content** — update game content without rebuilding the app (DLC, patches, seasonal events)
- **Async by default** — every load is non-blocking, preventing frame hitches

---

## Architecture Overview

```
┌───────────────────────────────────────────────────────┐
│                  Addressable Groups                     │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐ │
│  │ Local_Static  │  │ Remote_DLC   │  │ UI_Assets    │ │
│  │  (packed)     │  │  (packed)    │  │  (packed)    │ │
│  │               │  │              │  │              │ │
│  │ - Level1.fbx  │  │ - Map02.fbx  │  │ - MainMenu  │ │
│  │ - Player.prefab│  │ - Skins/*   │  │ - HUD.prefab│ │
│  │ - Shared.mat  │  │              │  │              │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘ │
│         │                 │                  │         │
│         ▼                 ▼                  ▼         │
│  ┌─────────────────────────────────────────────────┐   │
│  │              Content Catalog (.json)              │   │
│  │  Maps addresses → bundle locations (local/remote) │   │
│  └─────────────────────┬───────────────────────────┘   │
│                        │                               │
│                        ▼                               │
│  ┌─────────────────────────────────────────────────┐   │
│  │         Addressables Runtime (ResourceManager)    │   │
│  │  Resolves addresses → loads bundles → tracks refs │   │
│  └─────────────────────────────────────────────────┘   │
└───────────────────────────────────────────────────────┘
```

### Key Concepts

| Concept | Role |
|---------|------|
| **Address** | A string key (e.g., `"Prefabs/Player"`) that maps to an asset via the content catalog |
| **Label** | A tag applied to multiple assets (e.g., `"level1"`, `"enemies"`) for batch loading |
| **Group** | A collection of assets that build into the same Asset Bundle(s). Controls packing granularity |
| **AssetReference** | A serializable reference to an addressable asset — shows a picker in the Inspector |
| **Content Catalog** | A JSON manifest mapping addresses → bundle files → asset locations |
| **AsyncOperationHandle** | The ticket returned by every load operation. Must be released to decrement reference counts |

---

## Setup

### Install the Package

```
// Package Manager → Add package by name:
com.unity.addressables
```

### Mark Assets as Addressable

Select any asset in the Project window → check **Addressable** in the Inspector. Unity assigns a default address (the asset path) which you can customize.

### Organize Groups

Open **Window → Asset Management → Addressables → Groups**:

```
Groups window layout:

Default Local Group          ← ships with the build
├── PlayerCharacter.prefab   [address: Prefabs/Player]    [labels: core]
├── MainLevel.unity          [address: Scenes/MainLevel]  [labels: level1]
└── SharedMaterials.mat      [address: Materials/Shared]   [labels: core]

Remote DLC Group             ← downloaded at runtime
├── BonusLevel.unity         [address: Scenes/BonusLevel] [labels: dlc1]
└── BonusSkins/*             [address: Skins/Bonus/*]     [labels: dlc1]
```

---

## Loading Assets

### By Address (String Key)

```csharp
using UnityEngine;
using UnityEngine.AddressableAssets;
using UnityEngine.ResourceManagement.AsyncOperations;

public class AssetLoader : MonoBehaviour
{
    private AsyncOperationHandle<GameObject> _handle;

    async void Start()
    {
        // WHY LoadAssetAsync instead of Resources.Load: Addressables
        // loads asynchronously (no frame hitch), handles dependencies
        // automatically, and only loads what you ask for — assets not
        // marked Addressable don't ship in the build.
        _handle = Addressables.LoadAssetAsync<GameObject>("Prefabs/Player");
        await _handle.Task;

        if (_handle.Status == AsyncOperationStatus.Succeeded)
        {
            Instantiate(_handle.Result);
        }
        else
        {
            Debug.LogError($"Failed to load: {_handle.OperationException}");
        }
    }

    void OnDestroy()
    {
        // WHY release the handle: Addressables uses reference counting.
        // If you load an asset and never release the handle, the asset
        // (and its entire bundle) stays in memory forever — a classic
        // memory leak. Always release when you're done.
        Addressables.Release(_handle);
    }
}
```

### By AssetReference (Inspector-Assigned)

```csharp
using UnityEngine;
using UnityEngine.AddressableAssets;
using UnityEngine.ResourceManagement.AsyncOperations;

public class EnemySpawner : MonoBehaviour
{
    // WHY AssetReference instead of direct prefab reference: A direct
    // [SerializeField] GameObject reference creates a hard dependency —
    // the prefab loads into memory when THIS object loads, even if you
    // never spawn an enemy. AssetReference is a soft reference that
    // only loads when you explicitly call LoadAssetAsync.
    [SerializeField] private AssetReferenceGameObject enemyPrefab;

    private AsyncOperationHandle<GameObject> _loadHandle;

    public async void SpawnEnemy(Vector3 position)
    {
        // WHY check IsValid: If we already loaded this reference, don't
        // load again — the handle is cached. Loading twice on the same
        // AssetReference throws a warning.
        if (!_loadHandle.IsValid())
        {
            _loadHandle = enemyPrefab.LoadAssetAsync();
            await _loadHandle.Task;
        }

        if (_loadHandle.Status == AsyncOperationStatus.Succeeded)
        {
            Instantiate(_loadHandle.Result, position, Quaternion.identity);
        }
    }

    void OnDestroy()
    {
        if (_loadHandle.IsValid())
        {
            Addressables.Release(_loadHandle);
        }
    }
}
```

### By Label (Batch Loading)

```csharp
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.AddressableAssets;
using UnityEngine.ResourceManagement.AsyncOperations;

public class LevelLoader : MonoBehaviour
{
    private AsyncOperationHandle<IList<GameObject>> _levelAssetsHandle;

    public async void LoadLevel(string levelLabel)
    {
        // WHY load by label: Labels let you tag related assets across
        // different groups. Loading "level1" fetches all prefabs,
        // materials, and audio tagged with that label in one call.
        // This is ideal for preloading an entire level's assets.
        _levelAssetsHandle = Addressables.LoadAssetsAsync<GameObject>(
            levelLabel,
            // WHY per-asset callback: Fires for each asset as it loads,
            // letting you display progress or process assets incrementally
            // rather than waiting for the entire batch.
            asset => Debug.Log($"Loaded: {asset.name}")
        );

        await _levelAssetsHandle.Task;

        Debug.Log($"Loaded {_levelAssetsHandle.Result.Count} assets for {levelLabel}");
    }

    void OnDestroy()
    {
        if (_levelAssetsHandle.IsValid())
        {
            // WHY one release for the batch: Release the batch handle,
            // not individual assets. The system decrements all ref counts.
            Addressables.Release(_levelAssetsHandle);
        }
    }
}
```

---

## Scene Loading via Addressables

```csharp
using UnityEngine.AddressableAssets;
using UnityEngine.ResourceManagement.AsyncOperations;
using UnityEngine.ResourceManagement.ResourceProviders;

public class SceneLoader : MonoBehaviour
{
    private AsyncOperationHandle<SceneInstance> _sceneHandle;

    public async void LoadGameScene()
    {
        // WHY Addressables.LoadSceneAsync instead of SceneManager.LoadSceneAsync:
        // Addressable scenes can be in remote bundles (DLC, updates).
        // Addressables also handles loading all dependent assets
        // referenced by the scene automatically.
        _sceneHandle = Addressables.LoadSceneAsync(
            "Scenes/MainLevel",
            UnityEngine.SceneManagement.LoadSceneMode.Additive
        );

        await _sceneHandle.Task;

        if (_sceneHandle.Status == AsyncOperationStatus.Succeeded)
        {
            Debug.Log("Scene loaded additively");
        }
    }

    public async void UnloadGameScene()
    {
        // WHY UnloadSceneAsync with the handle: This ensures all
        // assets loaded for the scene are properly released, not
        // just the scene itself.
        if (_sceneHandle.IsValid())
        {
            await Addressables.UnloadSceneAsync(_sceneHandle).Task;
        }
    }
}
```

---

## Memory Management

### The Reference Counting Model

Every `LoadAssetAsync` increments a reference count. Every `Release` decrements it. When the count hits zero, the asset (and its bundle, if no other assets reference it) is unloaded.

```
Load("Sword")    → ref count: 1, bundle loaded
Load("Shield")   → ref count: 1 (different asset, same bundle keeps ref)
Release(sword)   → ref count: 0 for Sword, bundle still loaded (Shield)
Release(shield)  → ref count: 0 for Shield, bundle unloaded
```

### Common Memory Mistakes

| Mistake | Consequence | Fix |
|---------|------------|-----|
| Never calling `Release()` | Asset bundle stays in memory forever | Always release in `OnDestroy` or when switching contexts |
| Calling `Destroy()` on loaded asset | Breaks the reference system; other users of the asset get null | Use `Release()` instead of `Destroy()` on the loaded object |
| Loading same AssetReference twice | Warning + wasted handle | Check `_handle.IsValid()` before loading again |
| Releasing more than loading | Negative ref count, asset unloaded while still in use | Track handles carefully; one release per load |

### Preloading and Releasing Patterns

```csharp
public class PreloadManager : MonoBehaviour
{
    private List<AsyncOperationHandle> _preloadedHandles = new();

    // WHY preload: Loading assets on-demand causes micro-hitches
    // (even though it's async, the bundle decompression takes time).
    // Preloading during a loading screen ensures everything is
    // in memory before gameplay starts.
    public async Task PreloadLabel(string label)
    {
        var handle = Addressables.LoadAssetsAsync<Object>(
            label, null);
        _preloadedHandles.Add(handle);
        await handle.Task;
    }

    public void ReleaseAll()
    {
        foreach (var handle in _preloadedHandles)
        {
            if (handle.IsValid())
                Addressables.Release(handle);
        }
        _preloadedHandles.Clear();
    }

    void OnDestroy() => ReleaseAll();
}
```

---

## Group Strategy

How you organize assets into groups determines bundle granularity, build times, and download sizes.

### Recommended Group Layout

| Group | Contents | Build Path | Why |
|-------|----------|-----------|-----|
| `Core_Local` | Player prefab, main UI, shared materials | Local | Must be available immediately, never changes |
| `Level_{N}` | Per-level meshes, textures, audio | Local or Remote | Group by level to load/unload entire level packs |
| `Audio_Shared` | Music, SFX used across levels | Local | Shared assets avoid duplication across level groups |
| `DLC_{Name}` | Downloadable content packs | Remote | Downloaded on demand, can be updated independently |
| `Localization` | Per-language text, audio, textures | Remote | Only download the language the player selected |

### Packing Modes

| Mode | Behavior | Best For |
|------|----------|----------|
| **Pack Together** | All assets in the group → one bundle | Small groups, always loaded together |
| **Pack Separately** | Each asset → its own bundle | Large assets loaded independently |
| **Pack Together By Label** | Assets with the same label → one bundle | Flexible grouping within a group |

> **Rule of thumb:** If assets are always loaded together (e.g., a level's environment), pack them together. If they're loaded independently (e.g., character skins), pack separately.

---

## Remote Content & Updates

Addressables supports hosting bundles on a CDN for over-the-air updates:

```csharp
// In AddressableAssetSettings:
// - Remote Build Path: ServerData/[BuildTarget]
// - Remote Load Path: https://cdn.example.com/[BuildTarget]

// WHY catalog updates: When you rebuild Addressables content, a new
// catalog is generated. Calling CheckForCatalogUpdates at launch
// lets clients discover and download new/changed assets without
// a full app update.
public async void CheckForUpdates()
{
    var checkHandle = Addressables.CheckForCatalogUpdates(false);
    await checkHandle.Task;

    if (checkHandle.Status == AsyncOperationStatus.Succeeded
        && checkHandle.Result.Count > 0)
    {
        var updateHandle = Addressables.UpdateCatalogs(checkHandle.Result);
        await updateHandle.Task;

        Debug.Log("Content catalog updated — new assets available");
    }

    Addressables.Release(checkHandle);
}
```

---

## Profiling with the Event Viewer

Open **Window → Asset Management → Addressables → Event Viewer** while in Play mode. It shows:

- **Asset loads and releases** over time (a waterfall view)
- **Reference counts** per asset — spot leaks (count never reaches 0)
- **Bundle loads** — see which bundles are resident and why
- **Frame timing** — correlate asset loads with frame hitches

Enable **Send Profiler Events** in the Addressables settings to populate the Event Viewer.

---

## Production Checklist

- [ ] All assets that load at runtime are marked Addressable (nothing in `Resources/`)
- [ ] Groups organized by loading lifetime (per-level, shared, DLC)
- [ ] `AsyncOperationHandle` released for every load (check with Event Viewer)
- [ ] `AssetReference` used for Inspector-assigned assets instead of direct references
- [ ] Remote groups have correct Load Path pointing to CDN
- [ ] Catalog update check runs at app launch
- [ ] Build tested with **Use Existing Build** play mode (not **Use Asset Database**) to catch packaging issues
- [ ] Bundle sizes profiled — no single bundle > 50MB for mobile
- [ ] Preloading strategy implemented for loading screens
- [ ] Duplicate asset detection run (Addressables Analyze tool)

---

## Further Reading

- [Addressables Planning and Best Practices — Unity Blog](https://unity.com/blog/engine-platform/addressables-planning-and-best-practices)
- [Simplify Content Management with Addressables — Unity](https://unity.com/how-to/simplify-your-content-management-addressables)
- [Addressables Sample Project — GitHub](https://github.com/Unity-Technologies/Addressables-Sample)
- [Runtime Asset Loading Technology — Unity](https://unity.com/resources/runtime-asset-loading-technology-for-rt3d)
