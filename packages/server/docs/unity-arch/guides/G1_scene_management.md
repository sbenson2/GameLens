# G1 — Scene Management in Unity 6

> **Category:** guide · **Engine:** Unity 6 (6000.x) · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [Unity Rules](../unity-arch-rules.md)

Scene management is the backbone of how your game loads, unloads, and transitions between gameplay states. Unity 6 offers two complementary approaches — the built-in `SceneManager` API and the **Addressables** package — each suited to different project scales. This guide covers both, with emphasis on the **additive bootstrap pattern** used in most production games.

---

## Why Scene Management Matters

Every Unity project starts with a single scene, but production games almost always need multiple scenes to manage memory, parallelize artist work (fewer merge conflicts), and support loading screens. Getting this architecture right early prevents painful refactors later.

**Common problems when scene management is ignored:**
- `DontDestroyOnLoad` spaghetti — managers scattered across scenes with unclear ownership
- Long load times because entire worlds load synchronously
- Lost state when transitioning between levels
- Editor-only workflows that break in builds (testing a scene that depends on another being loaded first)

---

## Core Concepts

### Scene Loading Modes

Unity provides two loading modes via `LoadSceneMode`:

| Mode | Behavior | Use Case |
|------|----------|----------|
| `Single` | Unloads all current scenes, loads the new one | Full level transitions, returning to main menu |
| `Additive` | Loads the new scene alongside existing ones | Persistent managers, streaming chunks, layered environments |

### The Additive Bootstrap Pattern

The most widely-adopted production pattern in Unity. The idea: one small **bootstrap scene** loads first and never unloads. It owns all persistent managers. Game scenes are loaded/unloaded additively on top of it.

```
┌────────────────────────────────────────────┐
│          Bootstrap Scene (persistent)       │
│  ┌──────────┐ ┌────────┐ ┌──────────────┐ │
│  │ GameMgr  │ │AudioMgr│ │ SceneLoader  │ │
│  │ (state)  │ │(music) │ │ (transitions)│ │
│  └──────────┘ └────────┘ └──────────────┘ │
├────────────────────────────────────────────┤
│     Additive: "Level_Forest"  (gameplay)   │
│     Additive: "UI_HUD"       (overlay)     │
└────────────────────────────────────────────┘
```

**Why this pattern?**
- No `DontDestroyOnLoad` needed — the bootstrap scene IS the persistent scope
- Each game scene is self-contained and testable in isolation (with a fallback to auto-load bootstrap in editor)
- Clear ownership: the `SceneLoader` in bootstrap controls all transitions
- Artists and designers can work in separate scene files simultaneously

---

## Implementation: SceneManager API

### Basic Additive Loading

```csharp
using UnityEngine;
using UnityEngine.SceneManagement;
using System.Collections;

/// <summary>
/// Lives in the Bootstrap scene. Manages loading/unloading of game scenes.
/// WHY a dedicated manager: Centralizes all scene transitions so no individual
/// scene needs to know about any other scene. This is the single point of control.
/// </summary>
public class SceneLoader : MonoBehaviour
{
    [SerializeField] private string _startScene = "Level_01";

    // Track the currently loaded game scene so we can unload it later.
    // WHY track this: SceneManager.UnloadSceneAsync requires a reference
    // to the scene. Without tracking, you'd need string lookups every time.
    private string _currentGameScene;

    private void Start()
    {
        // Load the first game scene additively on startup
        LoadScene(_startScene);
    }

    /// <summary>
    /// Transition from the current game scene to a new one.
    /// </summary>
    public void LoadScene(string sceneName)
    {
        StartCoroutine(LoadSceneRoutine(sceneName));
    }

    private IEnumerator LoadSceneRoutine(string sceneName)
    {
        // Step 1: Unload the current game scene (if any)
        if (!string.IsNullOrEmpty(_currentGameScene))
        {
            AsyncOperation unload = SceneManager.UnloadSceneAsync(_currentGameScene);
            yield return unload;
        }

        // Step 2: Load the new scene additively
        // WHY Additive: The bootstrap scene stays loaded, preserving all managers.
        AsyncOperation load = SceneManager.LoadSceneAsync(sceneName, LoadSceneMode.Additive);
        yield return load;

        // Step 3: Set the new scene as active so Instantiate() places objects there
        // WHY SetActiveScene: Without this, newly instantiated objects land in the
        // bootstrap scene, causing them to persist when you unload the game scene.
        Scene newScene = SceneManager.GetSceneByName(sceneName);
        SceneManager.SetActiveScene(newScene);

        _currentGameScene = sceneName;
    }
}
```

### Editor Auto-Bootstrap

A critical quality-of-life feature: when a developer presses Play in a game scene (not the bootstrap), automatically load the bootstrap first. Without this, testing any scene requires manually loading the bootstrap, which kills iteration speed.

```csharp
#if UNITY_EDITOR
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine.SceneManagement;

/// <summary>
/// Ensures the bootstrap scene is always loaded when entering Play mode.
/// WHY: Developers frequently press Play in whatever scene they're editing.
/// Without bootstrap, managers are missing and the game crashes on null refs.
/// This script silently loads bootstrap first, then returns to the edited scene.
/// </summary>
[InitializeOnLoad]
public static class EditorBootstrap
{
    private const string BootstrapScene = "Assets/_Project/Scenes/Bootstrap.unity";

    static EditorBootstrap()
    {
        EditorApplication.playModeStateChanged += OnPlayModeChanged;
    }

    private static void OnPlayModeChanged(PlayModeStateChange state)
    {
        if (state == PlayModeStateChange.ExitingEditMode)
        {
            // Save the scene the developer is currently editing
            string currentScene = SceneManager.GetActiveScene().path;

            if (currentScene != BootstrapScene)
            {
                // Store which scene to load after bootstrap
                EditorPrefs.SetString("EditorBootstrap_ReturnScene", currentScene);

                // Switch to bootstrap before entering Play mode
                EditorSceneManager.SaveCurrentModifiedScenesIfUserWantsTo();
                EditorSceneManager.OpenScene(BootstrapScene);
            }
        }
        else if (state == PlayModeStateChange.EnteredPlayMode)
        {
            string returnScene = EditorPrefs.GetString("EditorBootstrap_ReturnScene", "");
            if (!string.IsNullOrEmpty(returnScene))
            {
                EditorPrefs.DeleteKey("EditorBootstrap_ReturnScene");
                // Load the developer's scene additively on top of bootstrap
                SceneManager.LoadSceneAsync(
                    System.IO.Path.GetFileNameWithoutExtension(returnScene),
                    LoadSceneMode.Additive
                );
            }
        }
    }
}
#endif
```

---

## Implementation: Addressables

For projects beyond prototype scale, **Addressables** (package `com.unity.addressables`) is the recommended approach. It replaces direct scene references with addressable keys, enabling remote content, content updates without rebuilding, and finer-grained memory control.

### Loading Scenes via Addressables

```csharp
using UnityEngine;
using UnityEngine.AddressableAssets;
using UnityEngine.ResourceManagement.AsyncOperations;
using UnityEngine.ResourceManagement.ResourceProviders;
using UnityEngine.SceneManagement;

/// <summary>
/// Addressable-based scene loader. Manages scenes by address string instead of
/// build index or name.
/// WHY Addressables over SceneManager: Scenes don't need to be in Build Settings,
/// can be loaded from remote servers (DLC/patches), and memory is tracked per-handle.
/// </summary>
public class AddressableSceneLoader : MonoBehaviour
{
    // Keep the operation handle so we can unload this specific scene later.
    // WHY: Unlike SceneManager, Addressables tracks loaded assets via handles.
    // You MUST release the handle to properly unload and free memory.
    private AsyncOperationHandle<SceneInstance> _currentSceneHandle;

    public void LoadScene(string sceneAddress)
    {
        StartCoroutine(LoadRoutine(sceneAddress));
    }

    private System.Collections.IEnumerator LoadRoutine(string sceneAddress)
    {
        // Unload previous scene if one is loaded
        if (_currentSceneHandle.IsValid())
        {
            AsyncOperationHandle<SceneInstance> unload =
                Addressables.UnloadSceneAsync(_currentSceneHandle);
            yield return unload;
        }

        // Load new scene additively
        _currentSceneHandle = Addressables.LoadSceneAsync(
            sceneAddress,
            LoadSceneMode.Additive,
            activateOnLoad: true  // false if you want to control activation timing
        );

        yield return _currentSceneHandle;

        if (_currentSceneHandle.Status == AsyncOperationStatus.Succeeded)
        {
            SceneManager.SetActiveScene(
                _currentSceneHandle.Result.Scene
            );
        }
    }
}
```

### When to Use Which

| Criteria | SceneManager | Addressables |
|----------|-------------|-------------|
| Prototype / game jam | Yes | Overkill |
| Scenes in Build Settings | Required | Not required |
| Remote / DLC content | No | Yes |
| Fine-grained memory tracking | Limited | Per-handle tracking |
| Learning curve | Low | Medium |
| Team size | 1-3 | Any |

---

## Loading Screens

A loading screen bridges the gap between unloading one scene and activating another. The key technique is **deferred activation** — load the scene in the background but don't activate it until the loading screen is ready to dismiss.

```csharp
private IEnumerator LoadWithLoadingScreen(string sceneName)
{
    // 1. Show loading screen (lives in bootstrap or its own additive scene)
    _loadingScreenUI.Show();

    // 2. Unload current game scene
    if (!string.IsNullOrEmpty(_currentGameScene))
    {
        yield return SceneManager.UnloadSceneAsync(_currentGameScene);
    }

    // 3. Start loading but DON'T activate yet
    // WHY allowSceneActivation = false: The final 10% of scene loading
    // (activation) runs on the main thread and causes a frame hitch.
    // By deferring it, we control exactly when the hitch happens.
    AsyncOperation load = SceneManager.LoadSceneAsync(sceneName, LoadSceneMode.Additive);
    load.allowSceneActivation = false;

    // 4. Update progress bar while loading (progress maxes at 0.9 when
    // allowSceneActivation is false — the last 0.1 is activation)
    while (load.progress < 0.9f)
    {
        _loadingScreenUI.SetProgress(load.progress / 0.9f);
        yield return null;
    }

    // 5. Loading complete — let the loading screen show 100% briefly
    _loadingScreenUI.SetProgress(1f);
    yield return new WaitForSeconds(0.3f);

    // 6. Activate the scene (causes a brief hitch — unavoidable)
    load.allowSceneActivation = true;
    yield return load;

    SceneManager.SetActiveScene(SceneManager.GetSceneByName(sceneName));
    _currentGameScene = sceneName;

    // 7. Hide loading screen
    _loadingScreenUI.Hide();
}
```

---

## Multi-Scene Editing in the Editor

Unity 6 supports editing multiple scenes simultaneously in the hierarchy. This mirrors the additive loading approach used at runtime:

- **Drag multiple scenes** into the Hierarchy to edit them side by side
- **Right-click a scene → Set Active Scene** to control where new objects are created
- **Right-click a scene → Unload Scene** to hide it without removing it from the hierarchy
- **Bake lighting per-scene** — each additively loaded scene can have its own lightmap

> **Tip:** Use the same multi-scene layout in the editor that your game uses at runtime. This ensures what you see in the editor matches what players experience.

---

## Common Pitfalls

1. **Forgetting `SetActiveScene`** — New objects default to the first loaded scene (bootstrap). Always set the game scene as active after loading.

2. **Cross-scene references** — GameObjects in one scene cannot directly reference objects in another. Use events, a service locator, or a shared ScriptableObject to communicate across scenes.

3. **Lighting conflicts** — Each additive scene has its own lighting settings. Only the active scene's environment lighting applies. Use Lighting Settings assets shared across scenes for consistency.

4. **Build Settings omission** — Every scene loaded via `SceneManager` must be in Build Settings. Forgetting this works in the editor but fails in builds. (Addressables avoids this requirement.)

5. **Unloading the active scene** — Calling `UnloadSceneAsync` on the active scene without first setting another scene as active causes undefined behavior. Always switch active scenes before unloading.

6. **`DontDestroyOnLoad` in additive scenes** — If a script in an additive scene calls `DontDestroyOnLoad(gameObject)`, that object moves to a hidden scene and can never be unloaded via `UnloadSceneAsync`. The bootstrap pattern eliminates the need for this entirely.

---

## Summary: Recommended Architecture

```
Build Settings:
  [0] Bootstrap         ← Loaded first, never unloaded
  [1] MainMenu
  [2] Level_01
  [3] Level_02
  ...

Bootstrap Scene contains:
  - GameManager         (game state, save/load references)
  - SceneLoader         (additive load/unload logic)
  - AudioManager        (music crossfade, SFX pools)
  - UIManager           (loading screen, modal dialogs)

Game scenes are loaded/unloaded additively by SceneLoader.
Each game scene is self-contained — no dependencies on other game scenes.
```

This pattern scales from small indie games to large open-world projects (where each chunk becomes an additive scene or Addressable group).
