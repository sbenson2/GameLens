# G63 — Enter Play Mode & Fast Iteration

> **Category:** guide · **Engine:** Unity 6 (6000.x) · **Related:** [Debugging & Profiling](G11_debugging_profiling.md) · [Serialization Deep Dive](G62_serialization_deep_dive.md) · [Unity Rules](../unity-arch-rules.md)

Entering Play Mode in Unity triggers domain reload (recompiling and reinitializing all scripts) and scene reload (reloading the active scene). On large projects this can take 10–30+ seconds per iteration. Unity's **Configurable Enter Play Mode** settings let you skip one or both reloads, cutting iteration time to under a second — but only if your code is designed for it. This guide covers how to configure, write compatible code, and avoid the subtle bugs that come with disabled reloads.

---

## The Problem: Slow Iteration

Every time you press Play in the Unity Editor, two things happen:

1. **Domain Reload** — Unity unloads and reloads all C# assemblies, resetting all static fields and re-running static constructors. This ensures a "fresh" scripting state.
2. **Scene Reload** — Unity destroys and reloads the active scene, recreating all GameObjects and running `Awake` / `OnEnable` / `Start` from scratch.

Both reloads guarantee clean state but cost time. On projects with many assemblies, large scenes, or Addressables catalogs, this delay compounds into minutes of lost flow per hour.

---

## Configuration

Navigate to **Edit → Project Settings → Editor**. Under **Enter Play Mode Settings**:

| Setting | What It Skips | Speed Gain | Risk Level |
|---------|---------------|------------|------------|
| **Reload Domain and Scene** (default) | Nothing — full reload | Baseline | None |
| **Reload Scene Only** | Domain reload | Large (2–15s saved) | Medium |
| **Reload Domain Only** | Scene reload | Small–moderate | Low |
| **Do Not Reload Domain or Scene** | Both reloads | Maximum | High |

> **Recommendation:** Start with **Reload Scene Only** (domain reload disabled). This gives the biggest speed win. Add scene reload skipping later if needed.

---

## Writing Domain-Reload-Safe Code

When domain reload is disabled, static fields, event subscriptions, and singleton state from the **previous Play session** persist into the next one. This causes some of the most confusing bugs in Unity development.

### Rule 1: Reset All Static State

```csharp
using UnityEngine;

public class GameManager : MonoBehaviour
{
    // WHY this is dangerous: With domain reload disabled, this static
    // counter keeps its value between Play sessions. Press Play twice
    // and enemiesKilled starts at whatever it was last time.
    private static int s_enemiesKilled;

    // FIX: Use [RuntimeInitializeOnLoadMethod] to reset statics.
    // This attribute runs your method when Play mode starts,
    // REGARDLESS of whether domain reload is enabled.
    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
    private static void ResetStatics()
    {
        s_enemiesKilled = 0;
    }
}
```

### RuntimeInitializeLoadType Execution Order

| Load Type | When It Runs | Use For |
|-----------|-------------|---------|
| `SubsystemRegistration` | Earliest — before any scene loads | Resetting statics, clearing caches |
| `AfterAssembliesLoaded` | After assemblies load | Plugin initialization |
| `BeforeSplashScreen` | Before splash screen | Analytics, crash reporting init |
| `BeforeSceneLoad` | Before the first scene | Service locators, DI containers |
| `AfterSceneLoad` (default) | After first scene loads | Spawning managers that need scene context |

> **WHY `SubsystemRegistration`:** It's the earliest possible hook. Static resets must happen before any other code runs that might read those statics.

### Rule 2: Guard Event Subscriptions

```csharp
using UnityEngine;

public class ScoreDisplay : MonoBehaviour
{
    private void OnEnable()
    {
        // WHY this breaks without domain reload: OnEnable runs each
        // Play session, but the previous subscription was never cleaned
        // up (OnDisable only runs when the object is disabled/destroyed,
        // not when Play stops without scene reload). The handler fires
        // twice on the second Play, three times on the third, etc.
        GameEvents.OnScoreChanged += UpdateScore;
    }

    private void OnDisable()
    {
        GameEvents.OnScoreChanged -= UpdateScore;
    }

    private void UpdateScore(int newScore)
    {
        // Update UI
    }
}

// FIX: Also reset the event in the static reset
public static class GameEvents
{
    public static event System.Action<int> OnScoreChanged;

    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
    private static void Reset()
    {
        // WHY clear the event: Any subscribers from the previous Play
        // session are still attached. Setting to null wipes the slate.
        OnScoreChanged = null;
    }
}
```

### Rule 3: Reset Singletons

```csharp
using UnityEngine;

public class AudioManager : MonoBehaviour
{
    public static AudioManager Instance { get; private set; }

    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
    private static void ResetInstance()
    {
        // WHY: The old Instance reference points to a destroyed
        // GameObject from the last Play session. Without this reset,
        // code that checks "if (Instance != null)" will see a
        // "destroyed" object that passes null checks in C# but
        // throws MissingReferenceException when accessed.
        Instance = null;
    }

    private void Awake()
    {
        if (Instance != null && Instance != this)
        {
            Destroy(gameObject);
            return;
        }
        Instance = this;
        DontDestroyOnLoad(gameObject);
    }
}
```

---

## Writing Scene-Reload-Safe Code

When scene reload is disabled, `Awake`, `OnEnable`, and `Start` do **not** re-run for objects already in the scene. Only newly instantiated objects get their lifecycle callbacks.

### Pattern: Explicit Scene Initialization

```csharp
using UnityEngine;
using UnityEngine.SceneManagement;

public class LevelSetup : MonoBehaviour
{
    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
    private static void OnBeforeSceneLoad()
    {
        // WHY: When scene reload is disabled, objects from the previous
        // Play session persist. Register a callback to manually reset
        // scene-level state when Play mode starts.
        SceneManager.sceneLoaded += OnSceneLoaded;
    }

    private static void OnSceneLoaded(Scene scene, LoadSceneMode mode)
    {
        // Reinitialize level-specific state that would normally
        // be handled by Awake/Start on fresh objects
        Debug.Log($"Scene loaded: {scene.name} — reinitializing level state");
    }
}
```

---

## Automated Compliance Checking

For teams, enforce domain-reload safety with a simple editor script:

```csharp
#if UNITY_EDITOR
using System;
using System.Linq;
using System.Reflection;
using UnityEditor;
using UnityEngine;

// WHY an automated check: On a team, one person forgetting to reset
// a static field causes intermittent bugs that are nightmarishly hard
// to track. This script catches it at edit time.
[InitializeOnLoad]
public static class DomainReloadSafetyChecker
{
    static DomainReloadSafetyChecker()
    {
        // Only warn if domain reload is actually disabled
        if (EditorSettings.enterPlayModeOptionsEnabled &&
            EditorSettings.enterPlayModeOptions.HasFlag(
                EnterPlayModeOptions.DisableDomainReload))
        {
            CheckForUnresetStatics();
        }
    }

    private static void CheckForUnresetStatics()
    {
        // Scan all user assemblies for static fields without a reset method
        var userAssemblies = AppDomain.CurrentDomain.GetAssemblies()
            .Where(a => a.FullName.StartsWith("Assembly-CSharp"));

        foreach (var assembly in userAssemblies)
        {
            foreach (var type in assembly.GetTypes())
            {
                var staticFields = type.GetFields(
                    BindingFlags.Static | BindingFlags.Public |
                    BindingFlags.NonPublic);

                if (staticFields.Length == 0) continue;

                // Check if the type has a [RuntimeInitializeOnLoadMethod] reset
                bool hasReset = type.GetMethods(
                    BindingFlags.Static | BindingFlags.Public |
                    BindingFlags.NonPublic)
                    .Any(m => m.GetCustomAttribute<
                        RuntimeInitializeOnLoadMethodAttribute>() != null);

                if (!hasReset)
                {
                    Debug.LogWarning(
                        $"[DomainReload] {type.Name} has {staticFields.Length} " +
                        $"static field(s) but no [RuntimeInitializeOnLoadMethod] " +
                        $"reset. This may cause state leaks between Play sessions.");
                }
            }
        }
    }
}
#endif
```

---

## Assembly Definitions for Faster Compilation

Domain reload speed is proportional to the number and size of assemblies. Splitting your code into **Assembly Definitions** (`.asmdef`) reduces recompilation scope — changing one script only recompiles its assembly and dependents.

```
Assets/
├── Scripts/
│   ├── Core/
│   │   ├── Core.asmdef             ← Shared types, interfaces
│   │   └── ...
│   ├── Gameplay/
│   │   ├── Gameplay.asmdef         ← References: Core
│   │   └── ...
│   ├── UI/
│   │   ├── UI.asmdef               ← References: Core
│   │   └── ...
│   └── Editor/
│       ├── Editor.asmdef           ← References: Core, Gameplay
│       └── ...                        Editor-only platform
```

### Asmdef Tips

- **Keep `Core` dependency-light** — it's referenced by everything, so changes there trigger full recompilation.
- **Editor code in its own asmdef** with platform set to "Editor" — never compiled into builds.
- **Third-party SDKs** often lack asmdefs; wrap their entry points to isolate recompilation.
- **`Auto Referenced: false`** on asmdefs that don't need global access. Reduces the default assembly's dependency graph.

---

## Performance Comparison

Measured on a mid-size project (50 scenes, 200 scripts, Addressables catalog):

| Configuration | Enter Play Time | Risk |
|---------------|----------------|------|
| Full reload (default) | ~12 seconds | None |
| Domain reload disabled | ~1.5 seconds | Static state leaks |
| Both disabled | ~0.3 seconds | Static + scene state leaks |
| + Assembly Definitions | ~8 seconds (full) / ~0.8s (partial recompile) | None |

> **Best practice:** Use Assembly Definitions regardless — they speed up both compilation and domain reload. Layer on disabled domain reload once your code is compliant.

---

## Checklist: Enabling Fast Enter Play Mode

1. **Audit statics** — Search your codebase for `static` fields. Every one needs a `[RuntimeInitializeOnLoadMethod(SubsystemRegistration)]` reset.
2. **Audit events** — Every `static event` must be nulled in a reset method.
3. **Audit singletons** — Set `Instance = null` in a reset method.
4. **Test twice** — Press Play, stop, press Play again. If anything behaves differently the second time, you have a state leak.
5. **Add the safety checker** — Use the editor script above (or a test) to catch new violations automatically.
6. **Enable gradually** — Start with domain reload disabled. Only disable scene reload after the team is comfortable.

---

## Version Notes

| Feature | Minimum Version |
|---------|-----------------|
| Configurable Enter Play Mode | Unity 2019.3+ |
| `RuntimeInitializeLoadType.SubsystemRegistration` | Unity 2019.3+ |
| Enter Play Mode options in Project Settings | Unity 2020.1+ |
| "Do Not Reload Domain or Scene" option | Unity 2021.1+ |
| Improved reload diagnostics | Unity 6.0 (6000.0) |
