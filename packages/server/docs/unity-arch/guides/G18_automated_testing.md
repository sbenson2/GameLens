# G18 — Automated Testing with the Unity Test Framework

> **Category:** guide · **Engine:** Unity 6 (6000.x, Test Framework 2.0+) · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [G11 Debugging & Profiling](G11_debugging_profiling.md) · [Unity Rules](../unity-arch-rules.md)

The Unity Test Framework (`com.unity.test-framework`) integrates NUnit into the editor, giving you two complementary testing modes: **Edit Mode** tests that run inside the editor update loop (great for testing pure logic, ScriptableObjects, and editor tools) and **Play Mode** tests that spin up the game runtime (for MonoBehaviour lifecycle, physics, coroutines, and integration tests). This guide covers setup, both modes, async testing, CI integration, and what to actually test in a game project.

---

## Why Test Games?

Games are notoriously undertested compared to other software. The common argument — "games are too creative / too visual to test" — misses the enormous amount of deterministic logic hiding underneath:

- **Damage formulas, loot tables, economy math** — these are pure functions; one broken coefficient can ruin balance
- **State machines** — player states, AI states, UI flows; a missing transition creates a soft-lock
- **Save/load serialization** — if your save format changes and deserialization silently fails, players lose progress
- **Inventory / crafting rules** — edge cases (full inventory, stacking limits, recipe conflicts) multiply fast

Automated tests catch regressions in these systems *before* QA or players do, and they run in seconds instead of requiring a manual playthrough.

---

## Setup: Assembly Definitions

Unity tests live in special assemblies. The Test Runner discovers test classes by scanning assemblies that reference `nunit.framework.dll`.

### Step 1 — Install the Package

The Test Framework ships with Unity 6 by default. Verify it's present via **Window → Package Manager → Unity Registry → Test Framework**.

### Step 2 — Create Test Assemblies

You need separate Assembly Definition (`.asmdef`) files for Edit Mode and Play Mode tests.

**Edit Mode test assembly** (`Tests/Editor/Tests.Editor.asmdef`):

```json
{
    "name": "Tests.Editor",
    "rootNamespace": "Tests.Editor",
    "references": [
        "MyGame.Runtime"
    ],
    "includePlatforms": [
        "Editor"
    ],
    "defineConstraints": [
        "UNITY_INCLUDE_TESTS"
    ],
    "optionalUnityReferences": [
        "TestAssemblies"
    ]
}
```

**Play Mode test assembly** (`Tests/Runtime/Tests.Runtime.asmdef`):

```json
{
    "name": "Tests.Runtime",
    "rootNamespace": "Tests.Runtime",
    "references": [
        "MyGame.Runtime"
    ],
    "includePlatforms": [],
    "defineConstraints": [
        "UNITY_INCLUDE_TESTS"
    ],
    "optionalUnityReferences": [
        "TestAssemblies"
    ]
}
```

> **Why `includePlatforms` differs:** Edit Mode tests set `["Editor"]` so they're stripped from builds. Play Mode tests use `[]` (empty = all platforms) so they *can* run on target devices like Android or iOS — but the `UNITY_INCLUDE_TESTS` constraint ensures they only compile when testing is active.

### Step 3 — Open the Test Runner

**Window → General → Test Runner**. Toggle between EditMode and PlayMode tabs. Hit "Run All" or right-click individual tests.

---

## Edit Mode Tests

Edit Mode tests run synchronously inside `EditorApplication.update`. They're fast, don't require Play Mode, and are ideal for:

- Pure C# logic (math, algorithms, data structures)
- ScriptableObject validation
- Editor tools and custom inspectors
- Asset import/processing rules

### Basic Example

```csharp
using NUnit.Framework;

namespace Tests.Editor
{
    public class DamageCalculatorTests
    {
        // [Test] marks a standard NUnit test — synchronous, no Unity frame loop
        [Test]
        public void CalculateDamage_WithCriticalHit_DoublesBaseDamage()
        {
            // Arrange
            var baseDamage = 50f;
            var isCritical = true;
            var armor = 10f;

            // Act — test the pure function directly, no MonoBehaviour needed
            var result = DamageCalculator.Calculate(baseDamage, isCritical, armor);

            // Assert
            // Critical hit doubles base (100), then armor reduces: 100 - 10 = 90
            Assert.AreEqual(90f, result, 0.01f);
        }

        [Test]
        public void CalculateDamage_NeverReturnsNegative()
        {
            // Edge case: armor exceeds damage — should clamp to 0, not go negative
            var result = DamageCalculator.Calculate(5f, false, 100f);
            Assert.GreaterOrEqual(result, 0f, "Damage should never be negative");
        }
    }
}
```

### Testing ScriptableObjects

```csharp
using NUnit.Framework;
using UnityEngine;

namespace Tests.Editor
{
    public class WeaponDataTests
    {
        private WeaponData _weapon;

        // [SetUp] runs before EACH test — gives you a fresh instance
        [SetUp]
        public void SetUp()
        {
            // ScriptableObject.CreateInstance works in Edit Mode without Play Mode
            _weapon = ScriptableObject.CreateInstance<WeaponData>();
            _weapon.baseDamage = 25f;
            _weapon.attackSpeed = 1.5f;
        }

        // [TearDown] runs after EACH test — clean up to avoid leaks
        [TearDown]
        public void TearDown()
        {
            Object.DestroyImmediate(_weapon);
        }

        [Test]
        public void DPS_IsCorrectlyCalculated()
        {
            // WeaponData.DPS should return baseDamage * attackSpeed
            Assert.AreEqual(37.5f, _weapon.DPS, 0.01f);
        }
    }
}
```

---

## Play Mode Tests

Play Mode tests spin up the Unity runtime, meaning `Awake()`, `Start()`, `Update()`, physics, and coroutines all execute normally. Use them for:

- MonoBehaviour lifecycle testing
- Physics interactions (raycasts, collisions, triggers)
- Scene loading and transitions
- Input simulation
- Integration tests across multiple systems

### Coroutine-Based Tests (UnityTest)

```csharp
using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.TestTools;

namespace Tests.Runtime
{
    public class PlayerHealthTests
    {
        private GameObject _playerObj;
        private PlayerHealth _health;

        // [UnitySetUp] returns IEnumerator — can yield across frames
        [UnitySetUp]
        public IEnumerator SetUp()
        {
            _playerObj = new GameObject("TestPlayer");
            _health = _playerObj.AddComponent<PlayerHealth>();

            // Wait one frame so Awake() and Start() have run
            // WHY: MonoBehaviour lifecycle methods need a frame tick to execute
            yield return null;
        }

        [UnityTearDown]
        public IEnumerator TearDown()
        {
            Object.Destroy(_playerObj);
            // Wait a frame for the destroy to process
            yield return null;
        }

        // [UnityTest] runs as a coroutine — can yield to advance frames
        [UnityTest]
        public IEnumerator TakeDamage_ReducesHealth()
        {
            var initialHealth = _health.CurrentHealth;

            _health.TakeDamage(30f);

            // Some health systems defer damage to the next frame (e.g., damage batching)
            yield return null;

            Assert.Less(_health.CurrentHealth, initialHealth);
            Assert.AreEqual(initialHealth - 30f, _health.CurrentHealth, 0.01f);
        }

        [UnityTest]
        public IEnumerator TakeDamage_BelowZero_TriggersDeath()
        {
            bool deathTriggered = false;
            _health.OnDeath += () => deathTriggered = true;

            _health.TakeDamage(9999f);
            yield return null;

            Assert.IsTrue(deathTriggered, "Death event should fire when health <= 0");
            Assert.AreEqual(0f, _health.CurrentHealth, "Health should clamp to 0");
        }
    }
}
```

### Async Tests (Task-Based)

Unity Test Framework 2.0+ supports `async Task` tests for cleaner async/await syntax:

```csharp
using System.Threading.Tasks;
using NUnit.Framework;
using UnityEngine;

namespace Tests.Runtime
{
    public class AsyncServiceTests
    {
        // Async tests use the standard [Test] attribute with async Task return type
        // WHY: cleaner than IEnumerator for testing async services, network mocks, etc.
        [Test]
        public async Task LoadPlayerProfile_ReturnsValidData()
        {
            var service = new PlayerProfileService();

            var profile = await service.LoadProfileAsync("test-player-id");

            Assert.IsNotNull(profile);
            Assert.AreEqual("test-player-id", profile.PlayerId);
        }
    }
}
```

### Scene-Based Tests

```csharp
using System.Collections;
using NUnit.Framework;
using UnityEngine;
using UnityEngine.SceneManagement;
using UnityEngine.TestTools;

namespace Tests.Runtime
{
    public class LevelLoadingTests
    {
        // WHY: Scene tests verify that prefabs, references, and scene setup are correct
        // — catches broken references that compile fine but fail at runtime
        [UnityTest]
        public IEnumerator MainMenu_LoadsWithoutErrors()
        {
            // Load the scene additively to avoid disrupting the test runner
            yield return SceneManager.LoadSceneAsync("MainMenu", LoadSceneMode.Additive);

            var menuController = Object.FindFirstObjectByType<MainMenuController>();
            Assert.IsNotNull(menuController, "MainMenu scene must contain a MainMenuController");

            // Clean up
            yield return SceneManager.UnloadSceneAsync("MainMenu");
        }
    }
}
```

> **Important:** Add test scenes to **Build Settings → Scenes in Build** or they won't load during Play Mode tests.

---

## What to Test (and What Not to Test)

### High-Value Test Targets

| System | Test Type | Why |
|--------|-----------|-----|
| Damage / health / stats | Edit Mode | Pure math — fast, easy, catches balance regressions |
| Inventory logic | Edit Mode | Complex edge cases (stacking, capacity, item removal) |
| Save/load serialization | Edit Mode | Verifies round-trip: serialize → deserialize → compare |
| State machines | Edit Mode | Every transition is a testable assertion |
| Physics interactions | Play Mode | Needs real physics ticks to verify collisions |
| Scene references | Play Mode | Catches broken prefab/component wiring |
| UI flows | Play Mode | Verifies navigation paths don't dead-end |

### Low-Value Test Targets (Skip These)

- **Visual output** — "does the particle look right?" isn't automatable
- **Subjective feel** — camera shake intensity, animation blend weights
- **Third-party packages** — test *your* integration, not their internals

---

## Running Tests from the Command Line

Essential for CI/CD pipelines (GitHub Actions, GitLab CI, Jenkins):

```bash
# Run Edit Mode tests and export JUnit XML results
Unity -runTests \
  -batchmode \
  -projectPath /path/to/project \
  -testPlatform EditMode \
  -testResults ./test-results/editmode.xml

# Run Play Mode tests
Unity -runTests \
  -batchmode \
  -projectPath /path/to/project \
  -testPlatform PlayMode \
  -testResults ./test-results/playmode.xml
```

> **Why `-batchmode`:** runs Unity without opening the editor GUI, which is required for headless CI environments. Add `-nographics` if the CI machine has no GPU.

### GitHub Actions Example

```yaml
name: Unity Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: game-ci/unity-test-runner@v4
        with:
          projectPath: .
          testMode: all        # runs both EditMode and PlayMode
          artifactsPath: test-results
          githubToken: ${{ secrets.GITHUB_TOKEN }}

      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: test-results
          path: test-results/
```

---

## Common Pitfalls

### 1. Tests Pass in Isolation but Fail Together

**Cause:** Shared static state between tests (singletons, static fields).
**Fix:** Reset or recreate singletons in `[SetUp]`. Better yet, inject dependencies instead of using statics.

### 2. Play Mode Tests Are Flaky

**Cause:** Timing-dependent assertions without enough frames yielded.
**Fix:** Use `WaitForSeconds`, `WaitUntil`, or yield multiple frames:

```csharp
// Bad — assumes physics resolves in one frame
yield return null;
Assert.IsTrue(player.IsGrounded);

// Good — wait until physics settles, with a timeout
float timeout = 2f;
float elapsed = 0f;
while (!player.IsGrounded && elapsed < timeout)
{
    elapsed += Time.deltaTime;
    yield return null;
}
Assert.IsTrue(player.IsGrounded, $"Player should be grounded within {timeout}s");
```

### 3. Assembly Reference Errors

**Cause:** Test assembly can't see your game code.
**Fix:** Ensure your game code has its own `.asmdef`, and the test `.asmdef` lists it in `"references"`.

### 4. Tests Don't Appear in Test Runner

**Cause:** Missing `"optionalUnityReferences": ["TestAssemblies"]` or wrong `includePlatforms`.
**Fix:** Double-check the assembly definition JSON matches the examples above.

---

## Project Structure Recommendation

```
Assets/
├── Scripts/
│   ├── MyGame.Runtime.asmdef       ← your game code
│   ├── Combat/
│   │   ├── DamageCalculator.cs
│   │   └── PlayerHealth.cs
│   └── Inventory/
│       └── InventorySystem.cs
├── Tests/
│   ├── Editor/
│   │   ├── Tests.Editor.asmdef     ← Edit Mode tests
│   │   ├── Combat/
│   │   │   └── DamageCalculatorTests.cs
│   │   └── Inventory/
│   │       └── InventorySystemTests.cs
│   └── Runtime/
│       ├── Tests.Runtime.asmdef    ← Play Mode tests
│       ├── Combat/
│       │   └── PlayerHealthTests.cs
│       └── Scenes/
│           └── LevelLoadingTests.cs
```

> **Why mirror the structure:** When `DamageCalculator.cs` changes, you know exactly where to find (and update) `DamageCalculatorTests.cs`. This convention scales cleanly as the project grows.
