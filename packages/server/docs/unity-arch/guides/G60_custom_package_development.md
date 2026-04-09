# G60 — Custom Package Development (UPM)

> **Category:** guide · **Engine:** Unity 6 (6000.x) · **Related:** [G18 Automated Testing](G18_automated_testing.md) · [G54 Build Automation CI/CD](G54_build_automation_cicd.md) · [G32 Editor Scripting](G32_editor_scripting_custom_tools.md) · [Unity Rules](../unity-arch-rules.md)

Unity Package Manager (UPM) lets you create reusable, versioned modules that install cleanly alongside other packages. Custom packages are the right way to share code, tools, and assets across projects — far better than copying folders or using `.unitypackage` files. This guide covers the full lifecycle: structure, assembly definitions, testing, publishing to Git and OpenUPM, and Unity 6.3+ package signing.

---

## When to Create a Package

| Situation | Package? | Alternative |
|-----------|:---:|---|
| Reusable utility library (math, pooling, extensions) | ✅ | |
| Editor tooling shared across team projects | ✅ | |
| Game-specific gameplay code (player controller) | | Keep in `Assets/_Project/` |
| Third-party integration wrapper (analytics, auth) | ✅ | |
| Art assets for one game | | AssetBundle or Addressables |
| Art assets reused across games (UI kit, materials) | ✅ | |

**Rule of thumb:** if you've copy-pasted the same code into three or more projects, it should be a package.

---

## Package Layout

UPM enforces a standard directory structure. Follow it exactly — deviations cause silent failures.

```
com.yourcompany.packagename/
├── package.json                    # Package manifest (REQUIRED)
├── README.md                       # Shown in Package Manager window
├── CHANGELOG.md                    # Version history (semver)
├── LICENSE.md                      # License file
├── Third Party Notices.md          # Attributions for included code
│
├── Runtime/                        # Runtime code (included in builds)
│   ├── com.yourcompany.packagename.runtime.asmdef
│   ├── YourMainClass.cs
│   └── Internal/                   # Internal implementation details
│       └── HelperUtils.cs
│
├── Editor/                         # Editor-only code (excluded from builds)
│   ├── com.yourcompany.packagename.editor.asmdef
│   ├── CustomInspector.cs
│   └── EditorWindow/
│       └── ToolWindow.cs
│
├── Tests/                          # Test assemblies
│   ├── Runtime/
│   │   ├── com.yourcompany.packagename.tests.runtime.asmdef
│   │   └── RuntimeTests.cs
│   └── Editor/
│       ├── com.yourcompany.packagename.tests.editor.asmdef
│       └── EditorTests.cs
│
├── Samples~/                       # Optional samples (note the ~)
│   └── BasicUsage/
│       ├── .sample.json            # Sample metadata
│       └── ExampleScene.unity
│
└── Documentation~/                 # Optional docs (note the ~)
    └── index.md
```

> **WHY the `~` suffix?** Folders ending with `~` are ignored by Unity's asset importer. Samples aren't imported until the user explicitly installs them via the Package Manager window, preventing namespace pollution and compile errors from sample code.

---

## Package Manifest (package.json)

The manifest defines everything UPM needs to manage your package:

```json
{
    "name": "com.yourcompany.gameutils",
    "version": "1.2.0",
    "displayName": "Game Utilities",
    "description": "Common utilities for game development: object pooling, math extensions, singleton patterns, and event bus.",
    "unity": "6000.0",
    "unityRelease": "0f1",
    "documentationUrl": "https://yourcompany.github.io/gameutils/",
    "changelogUrl": "https://yourcompany.github.io/gameutils/changelog",
    "licensesUrl": "https://yourcompany.github.io/gameutils/license",
    "dependencies": {
        "com.unity.mathematics": "1.3.2"
    },
    "keywords": [
        "utilities",
        "pooling",
        "events",
        "extensions"
    ],
    "author": {
        "name": "Your Company",
        "email": "tools@yourcompany.com",
        "url": "https://yourcompany.com"
    },
    "samples": [
        {
            "displayName": "Basic Usage",
            "description": "Shows pooling and event bus setup in a simple scene.",
            "path": "Samples~/BasicUsage"
        }
    ]
}
```

### Manifest Field Reference

| Field | Required | Notes |
|-------|:---:|-------|
| `name` | ✅ | Reverse-domain format. Must match across `package.json` and project manifest. Case-sensitive |
| `version` | ✅ | Semantic versioning (MAJOR.MINOR.PATCH). Increment MAJOR for breaking changes |
| `displayName` | ✅ | Human-readable name shown in Package Manager UI |
| `unity` | ✅ | Minimum Unity version (e.g., `"6000.0"` for Unity 6.0) |
| `dependencies` | | Other UPM packages this package requires |
| `samples` | | Array of importable sample folders |
| `type` | | Set to `"tool"` for editor-only packages to exclude from builds |

---

## Assembly Definitions (.asmdef)

Assembly definitions are **mandatory** for package code. They isolate compilation, prevent naming conflicts, and dramatically reduce recompilation time.

### Runtime Assembly

```json
// Runtime/com.yourcompany.gameutils.runtime.asmdef
{
    "name": "YourCompany.GameUtils.Runtime",
    "rootNamespace": "YourCompany.GameUtils",
    "references": [
        "Unity.Mathematics"
    ],
    "includePlatforms": [],
    "excludePlatforms": [],
    "allowUnsafeCode": false,
    "overrideReferences": false,
    "precompiledReferences": [],
    "autoReferenced": true,
    "defineConstraints": [],
    "versionDefines": [
        {
            "name": "com.unity.inputsystem",
            "expression": "1.7.0",
            "define": "GAMEUTILS_INPUT_SYSTEM"
        }
    ],
    "noEngineReferences": false
}
```

### Editor Assembly

```json
// Editor/com.yourcompany.gameutils.editor.asmdef
{
    "name": "YourCompany.GameUtils.Editor",
    "rootNamespace": "YourCompany.GameUtils.Editor",
    "references": [
        "YourCompany.GameUtils.Runtime"
    ],
    "includePlatforms": [
        "Editor"
    ],
    "excludePlatforms": [],
    "allowUnsafeCode": false,
    "overrideReferences": false,
    "precompiledReferences": [],
    "autoReferenced": true,
    "defineConstraints": [],
    "versionDefines": [],
    "noEngineReferences": false
}
```

> **CRITICAL:** The Editor assembly must reference the Runtime assembly in `references`, or editor scripts cannot access runtime types. This is the most common custom package bug — "type not found" errors in editor code.

### Version Defines for Optional Dependencies

```json
// WHY: versionDefines let your package conditionally support
// other packages without requiring them. This avoids forcing
// users to install packages they don't need.
"versionDefines": [
    {
        "name": "com.unity.inputsystem",
        "expression": "1.7.0",
        "define": "GAMEUTILS_INPUT_SYSTEM"
    },
    {
        "name": "com.unity.addressables",
        "expression": "2.0.0",
        "define": "GAMEUTILS_ADDRESSABLES"
    }
]
```

Then in your C# code:

```csharp
// WHY: Conditional compilation lets one package work with or
// without optional dependencies. Users who don't use Addressables
// won't see compile errors from Addressables-specific code.

#if GAMEUTILS_ADDRESSABLES
using UnityEngine.AddressableAssets;

public static class AddressableExtensions
{
    public static async Awaitable<T> LoadAssetSafe<T>(string address)
        where T : UnityEngine.Object
    {
        var handle = Addressables.LoadAssetAsync<T>(address);
        await handle.Task;
        return handle.Result;
    }
}
#endif
```

---

## Developing Locally

### Embedding a Package for Development

You **must** develop packages inside a Unity project — the editor handles `.meta` file generation, compilation, and testing.

**Option 1: Embed in `Packages/` folder**
```
YourProject/
├── Assets/
├── Packages/
│   ├── manifest.json
│   └── com.yourcompany.gameutils/   # ← Package source here
│       ├── package.json
│       ├── Runtime/
│       └── Editor/
```

**Option 2: Local file reference (recommended for multi-project dev)**
```json
// Packages/manifest.json
{
    "dependencies": {
        "com.yourcompany.gameutils": "file:../../shared-packages/com.yourcompany.gameutils"
    }
}
```

> **WHY file references?** They create a symlink, so changes in the package directory are immediately visible in every project that references it. No copy, no re-import.

---

## Writing Package Code

### Public API Design

```csharp
using UnityEngine;

namespace YourCompany.GameUtils
{
    // WHY: A clean public API makes the package easy to use and
    // hard to misuse. Internal implementation details are hidden.

    /// <summary>
    /// Lightweight event bus for decoupled communication between systems.
    /// Subscribe to events by type; publish from anywhere.
    /// </summary>
    public static class EventBus
    {
        // Public API — what users of your package see

        /// <summary>
        /// Subscribe a handler for events of type T.
        /// Returns a disposable subscription for easy cleanup.
        /// </summary>
        public static IDisposable Subscribe<T>(System.Action<T> handler)
            where T : struct
        {
            return EventBusInternal<T>.Subscribe(handler);
        }

        /// <summary>
        /// Publish an event to all subscribers of type T.
        /// </summary>
        public static void Publish<T>(T evt) where T : struct
        {
            EventBusInternal<T>.Publish(evt);
        }
    }

    // WHY: Internal class keeps implementation details out of
    // the public API surface. Users can't accidentally depend on it.
    internal static class EventBusInternal<T> where T : struct
    {
        private static readonly System.Collections.Generic.List<System.Action<T>>
            _handlers = new();

        internal static IDisposable Subscribe(System.Action<T> handler)
        {
            _handlers.Add(handler);
            return new Subscription(handler);
        }

        internal static void Publish(T evt)
        {
            // WHY: Iterate backwards so handlers can unsubscribe
            // during iteration without index errors.
            for (int i = _handlers.Count - 1; i >= 0; i--)
            {
                _handlers[i]?.Invoke(evt);
            }
        }

        private class Subscription : System.IDisposable
        {
            private readonly System.Action<T> _handler;

            public Subscription(System.Action<T> handler) => _handler = handler;

            public void Dispose() => _handlers.Remove(_handler);
        }
    }
}
```

### Static State and Domain Reload

```csharp
// WHY: Unity's Enter Play Mode without Domain Reload does not
// reset static fields. Package code MUST handle this, or users
// get stale state bugs. See G51 CoreCLR Migration.

[RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
private static void ResetStaticState()
{
    // Clear all static state that shouldn't persist between play sessions
    _handlers.Clear();
}
```

---

## Testing Your Package

Place tests in `Tests/Runtime/` and `Tests/Editor/` with their own assembly definitions:

```json
// Tests/Runtime/com.yourcompany.gameutils.tests.runtime.asmdef
{
    "name": "YourCompany.GameUtils.Tests.Runtime",
    "rootNamespace": "YourCompany.GameUtils.Tests",
    "references": [
        "YourCompany.GameUtils.Runtime"
    ],
    "includePlatforms": [],
    "excludePlatforms": [],
    "allowUnsafeCode": false,
    "overrideReferences": true,
    "precompiledReferences": [
        "nunit.framework.dll"
    ],
    "autoReferenced": false,
    "defineConstraints": [
        "UNITY_INCLUDE_TESTS"
    ],
    "versionDefines": [],
    "noEngineReferences": false
}
```

> **CRITICAL fields:** `overrideReferences: true` + `precompiledReferences: ["nunit.framework.dll"]` + `defineConstraints: ["UNITY_INCLUDE_TESTS"]`. Without all three, tests either don't compile or leak into player builds.

```csharp
using NUnit.Framework;
using YourCompany.GameUtils;

namespace YourCompany.GameUtils.Tests
{
    // WHY: Tests prove your package works before every release
    // and catch regressions when you add features.

    public class EventBusTests
    {
        [SetUp]
        public void SetUp()
        {
            // Reset state between tests to prevent cross-contamination
        }

        [Test]
        public void Publish_WithSubscriber_InvokesHandler()
        {
            bool received = false;
            var sub = EventBus.Subscribe<TestEvent>(e => received = true);

            EventBus.Publish(new TestEvent { Value = 42 });

            Assert.IsTrue(received, "Handler should have been invoked");
            sub.Dispose();
        }

        [Test]
        public void Dispose_RemovesSubscription()
        {
            int callCount = 0;
            var sub = EventBus.Subscribe<TestEvent>(e => callCount++);

            sub.Dispose();
            EventBus.Publish(new TestEvent { Value = 1 });

            Assert.AreEqual(0, callCount, "Disposed subscription should not fire");
        }

        private struct TestEvent
        {
            public int Value;
        }
    }
}
```

Run tests: Window → General → Test Runner → Run All.

---

## Publishing

### Option 1: Git Repository (Private Teams)

The simplest distribution method — users add a Git URL to their project manifest.

```json
// Consumer's Packages/manifest.json
{
    "dependencies": {
        "com.yourcompany.gameutils": "https://github.com/yourcompany/gameutils.git#v1.2.0"
    }
}
```

**Setup:**
1. Push your package folder as the repo root (not nested inside a Unity project)
2. Tag releases with semver: `git tag v1.2.0 && git push --tags`
3. Users pin to a tag (`#v1.2.0`) or branch (`#main`)

> **WHY tags, not branches?** Tags are immutable — `#v1.2.0` always resolves to the same commit. Branch references can change unexpectedly and break reproducible builds.

### Option 2: OpenUPM (Open Source)

[OpenUPM](https://openupm.com) is a community package registry. After your Git repo is public:

1. Go to https://openupm.com/packages/add/
2. Submit your Git repository URL
3. OpenUPM's CI builds and hosts packages automatically from Git tags

Users install via the OpenUPM CLI:
```bash
# Install the OpenUPM CLI
npm install -g openupm-cli

# Add package to a Unity project
cd /path/to/unity/project
openupm add com.yourcompany.gameutils
```

### Option 3: Private npm Registry (Enterprise)

For enterprise teams, host a private npm registry (Verdaccio, Artifactory, or GitHub Packages):

```json
// Consumer's Packages/manifest.json
{
    "scopedRegistries": [
        {
            "name": "YourCompany",
            "url": "https://npm.yourcompany.com/",
            "scopes": ["com.yourcompany"]
        }
    ],
    "dependencies": {
        "com.yourcompany.gameutils": "1.2.0"
    }
}
```

---

## Package Signing (Unity 6.3+)

Starting with Unity 6.3, the editor supports **signed packages** and displays trust indicators in the Package Manager.

- Signed packages show a verification badge
- Unsigned packages from scoped registries trigger a warning
- Unity's own packages are signed by default

To sign your packages:
1. Obtain a code signing certificate
2. Use the `com.unity.package-signing` tool (available to Unity partners) to sign your `.tgz` package
3. Host signed packages on a registry that supports signature verification

> **WHY signing matters:** It prevents supply-chain attacks where a compromised registry serves tampered package versions. For enterprise teams, require signatures in your organization's Package Manager policy.

---

## Versioning Strategy

Follow [Semantic Versioning](https://semver.org/) strictly:

| Change Type | Version Bump | Example |
|-------------|:---:|---------|
| Bug fix, no API changes | PATCH | 1.2.0 → 1.2.1 |
| New feature, backward compatible | MINOR | 1.2.1 → 1.3.0 |
| Breaking API change | MAJOR | 1.3.0 → 2.0.0 |
| Pre-release / experimental | Label | 2.0.0-preview.1 |

**CHANGELOG.md must be updated with every version bump.** Use the [Keep a Changelog](https://keepachangelog.com/) format:

```markdown
## [1.3.0] - 2026-04-01
### Added
- EventBus.PublishAsync for awaitable event handling
- Object pool warm-up API

### Fixed
- EventBus memory leak when handlers throw exceptions
```

---

## Common Pitfalls

1. **Missing `.meta` files** — never create package files outside the Unity Editor; meta files won't be generated and the package will fail to import
2. **Wrong asmdef references** — Editor assembly must reference Runtime assembly; Test assemblies must reference the code they test
3. **Forgetting `defineConstraints` on test assemblies** — without `UNITY_INCLUDE_TESTS`, test code compiles into player builds
4. **Using `Assets/` paths in package code** — packages live under `Packages/`, not `Assets/`. Use `AssetDatabase.FindAssets` with package path prefix
5. **Breaking changes without MAJOR bump** — consumers pinned to `^1.0.0` will auto-update to your breaking `1.5.0`, causing project-wide compile errors
6. **Not resetting static state** — packages with static state must handle domain reload correctly (see above)
7. **Samples without `~` suffix** — `Samples/` (no tilde) gets imported immediately, potentially causing compile errors from incomplete sample code

---

## Key Takeaways

- Follow the **standard UPM directory layout** exactly — deviations cause silent failures
- Every code folder needs an **assembly definition** with correct references and platform settings
- Use **version defines** for optional dependencies to avoid forcing installs
- **Test your package** in a clean Unity project before publishing
- Distribute via **Git tags** (private), **OpenUPM** (open source), or **private npm** (enterprise)
- Follow **semantic versioning** and maintain a **CHANGELOG.md**
- Reset **static state** for Enter Play Mode compatibility
