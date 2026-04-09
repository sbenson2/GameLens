# G21 — Automated Testing in Unreal Engine 5

> **Category:** guide · **Engine:** Unreal Engine 5.4+ · **Related:** [Architecture Overview](../architecture/E1_architecture_overview.md) · [G15 Blueprint/C++ Workflow](G15_blueprint_cpp_workflow.md) · [G10 Debugging & Profiling](G10_debugging_profiling.md) · [Unreal Rules](../unreal-arch-rules.md)

Unreal Engine ships with a multi-layered testing infrastructure that ranges from fast C++ unit tests to full multiplayer integration tests running on cooked builds. This guide covers the Automation Test Framework (the runtime macro-based system), the newer Spec system (BDD-style), Low Level Tests (Catch2-based, out-of-process), Functional Tests (in-world Blueprint/C++ actors), and Gauntlet (CI orchestration for cooked builds). Knowing which layer to use and when is the key to a test suite that's both fast and trustworthy.

---

## Testing Layers at a Glance

```
Speed ◄────────────────────────────────────────────► Fidelity

  Low Level Tests    Automation Tests    Functional Tests    Gauntlet
  (Catch2, no UE     (in-editor,         (in-world actors,   (cooked build,
   runtime needed)    C++ macros)         Blueprint/C++)      CI orchestration)

  Milliseconds       Seconds             Seconds–Minutes     Minutes
  Pure C++ logic     UObject, subsystem  Full gameplay        Platform + MP
```

| Layer | Best For | Runs In |
|-------|----------|---------|
| **Low Level Tests** | Pure logic, math, data structures, algorithms | Standalone executable (no editor) |
| **Automation Tests** | Engine subsystems, UObject behavior, asset validation | Editor via Session Frontend |
| **Spec Tests** | BDD-style unit/integration tests with fixtures | Editor via Session Frontend |
| **Functional Tests** | Gameplay scenarios, actor interactions, level validation | Editor Play-In-Editor (PIE) |
| **Gauntlet** | Smoke tests on cooked builds, multiplayer, platform testing, CI | Command-line on packaged builds |

---

## Layer 1: Low Level Tests (Catch2)

Introduced in UE 5.1+, Low Level Tests use the Catch2 open-source C++ test library compiled as standalone executables — they don't load the Unreal runtime, so they're extremely fast.

### When to Use

- Testing pure C++ classes with no UObject dependencies
- Math libraries, serialization, custom containers, algorithms
- Tests that should run in under a second as part of a pre-commit check

### Setup

Low Level Tests live in a module's `Tests/` directory and compile into their own executable:

```
MyModule/
├── Source/
│   ├── MyModule/
│   │   ├── Private/
│   │   │   └── MyMathUtils.cpp
│   │   └── Public/
│   │       └── MyMathUtils.h
│   └── MyModuleTests/
│       ├── MyModuleTests.Build.cs    // Module type = Program
│       └── Private/
│           └── MyMathUtilsTest.cpp
```

### Writing a Low Level Test

```cpp
// MyMathUtilsTest.cpp
// Low Level Tests use Catch2 syntax — TEST_CASE, SECTION, REQUIRE, CHECK

#include "TestHarness.h"  // UE's Catch2 wrapper header
#include "MyMathUtils.h"

TEST_CASE("FMyMathUtils::Lerp", "[MyModule][Math]")
{
    // Tags in square brackets let you filter tests from the command line.
    // "[MyModule]" groups all tests in this module.

    SECTION("Returns Start when Alpha is 0")
    {
        float Result = FMyMathUtils::Lerp(10.0f, 20.0f, 0.0f);
        REQUIRE(Result == Catch::Approx(10.0f));
    }

    SECTION("Returns End when Alpha is 1")
    {
        float Result = FMyMathUtils::Lerp(10.0f, 20.0f, 1.0f);
        REQUIRE(Result == Catch::Approx(20.0f));
    }

    SECTION("Interpolates linearly for Alpha 0.5")
    {
        float Result = FMyMathUtils::Lerp(10.0f, 20.0f, 0.5f);
        REQUIRE(Result == Catch::Approx(15.0f));
    }
}
```

### Running

```bash
# Build and run the test executable directly
# The executable name matches your test module name
RunTests.bat MyModuleTests

# Or filter by tag
MyModuleTests.exe "[Math]"
```

---

## Layer 2: Automation Tests (Macro-Based)

The original Unreal testing system — C++ macros that register tests with the editor's **Session Frontend**. These tests run inside the editor process with full access to UObjects, subsystems, and assets.

### Test Types

| Macro | Use Case |
|-------|----------|
| `IMPLEMENT_SIMPLE_AUTOMATION_TEST` | Single-frame test — runs `RunTest()` once and returns pass/fail |
| `IMPLEMENT_COMPLEX_AUTOMATION_TEST` | Multi-parameter test — `GetTests()` returns a list of test names, `RunTest()` executes each |

### Test Flags

Flags control where and how tests appear:

```cpp
// Common flag combinations:
// Editor-only unit test:
EAutomationTestFlags::EditorContext | EAutomationTestFlags::ProductFilter

// Game-mode test (runs in PIE):
EAutomationTestFlags::ClientContext | EAutomationTestFlags::ProductFilter

// Stress test (opt-in, slow):
EAutomationTestFlags::EditorContext | EAutomationTestFlags::StressFilter
```

### Writing a Simple Test

```cpp
// InventorySystemTest.cpp
#include "Misc/AutomationTest.h"
#include "MyGame/InventorySystem.h"

// The second parameter is the test path — dots create a hierarchy
// in the Session Frontend tree view.
IMPLEMENT_SIMPLE_AUTOMATION_TEST(
    FInventoryAddItem,                              // Class name
    "MyGame.Inventory.AddItem",                     // Hierarchical path
    EAutomationTestFlags::EditorContext |
    EAutomationTestFlags::ProductFilter
)

bool FInventoryAddItem::RunTest(const FString& Parameters)
{
    // Arrange
    UInventorySystem* Inventory = NewObject<UInventorySystem>();
    FItemData Sword;
    Sword.ItemID = FName("Sword_Iron");
    Sword.StackSize = 1;

    // Act
    bool bAdded = Inventory->AddItem(Sword);

    // Assert
    TestTrue("Item was added", bAdded);
    TestEqual("Inventory count", Inventory->GetItemCount(), 1);

    // Return true to indicate the test body completed (not pass/fail).
    // Pass/fail is determined by whether any Test* assertion failed.
    return true;
}
```

### Writing a Complex (Parameterized) Test

```cpp
IMPLEMENT_COMPLEX_AUTOMATION_TEST(
    FInventoryStackLimits,
    "MyGame.Inventory.StackLimits",
    EAutomationTestFlags::EditorContext |
    EAutomationTestFlags::ProductFilter
)

// GetTests populates the list of sub-tests.
// Each entry in OutTestCommands becomes a separate run of RunTest.
void FInventoryStackLimits::GetTests(
    TArray<FString>& OutBeautifiedNames,
    TArray<FString>& OutTestCommands) const
{
    // Test with different stack sizes
    OutBeautifiedNames.Add("Stack of 1");
    OutTestCommands.Add("1");

    OutBeautifiedNames.Add("Stack of 64");
    OutTestCommands.Add("64");

    OutBeautifiedNames.Add("Stack of 999 (max)");
    OutTestCommands.Add("999");
}

bool FInventoryStackLimits::RunTest(const FString& Parameters)
{
    int32 StackSize = FCString::Atoi(*Parameters);

    UInventorySystem* Inventory = NewObject<UInventorySystem>();
    FItemData Potion;
    Potion.ItemID = FName("Potion_Health");
    Potion.StackSize = StackSize;

    bool bAdded = Inventory->AddItem(Potion);
    TestTrue(FString::Printf(TEXT("Added stack of %d"), StackSize), bAdded);
    TestEqual("Stack size matches", Inventory->GetStackSize(Potion.ItemID), StackSize);

    return true;
}
```

### Available Assertions

```cpp
// All inherited from FAutomationTestBase:
TestTrue("Description", bCondition);
TestFalse("Description", bCondition);
TestEqual("Description", Actual, Expected);
TestNotEqual("Description", Actual, Unexpected);
TestNull("Description", Pointer);
TestNotNull("Description", Pointer);

// For floating-point comparison with tolerance:
TestEqual("Description", ActualFloat, ExpectedFloat, Tolerance);
```

### Running Tests

1. **Editor:** Tools → Session Frontend → Automation tab
2. **Command line:** `-ExecCmds="Automation RunTests MyGame.Inventory"`
3. **CI:** Use `-unattended -nopause -NullRHI` flags for headless execution

---

## Layer 3: Spec Tests (BDD-Style)

Specs provide a Behavior-Driven Development syntax with `Describe`/`It` blocks and proper `BeforeEach`/`AfterEach` fixtures — much cleaner than the raw macros for tests that need shared setup.

### File Convention

Name test files `<Feature>.spec.cpp`. No header file needed.

### Writing a Spec

```cpp
// HealthComponent.spec.cpp
#if WITH_AUTOMATION_TESTS

#include "Misc/AutomationTest.h"
#include "MyGame/HealthComponent.h"

// BEGIN_DEFINE_SPEC declares the test class and member variables.
// The second parameter is the test path in Session Frontend.
BEGIN_DEFINE_SPEC(
    FHealthComponentSpec,
    "MyGame.Components.HealthComponent",
    EAutomationTestFlags::ApplicationContextMask |
    EAutomationTestFlags::ProductFilter
)
    // Member variables — accessible in all Describe/It blocks
    UHealthComponent* Health;
END_DEFINE_SPEC(FHealthComponentSpec)

void FHealthComponentSpec::Define()
{
    // BeforeEach runs before every It() block,
    // including those in nested Describe blocks.
    BeforeEach([this]()
    {
        Health = NewObject<UHealthComponent>();
        Health->SetMaxHealth(100.0f);
        Health->SetCurrentHealth(100.0f);
    });

    AfterEach([this]()
    {
        Health = nullptr;
    });

    Describe("TakeDamage()", [this]()
    {
        It("reduces current health by damage amount", [this]()
        {
            Health->TakeDamage(25.0f);
            TestEqual("Health after damage", Health->GetCurrentHealth(), 75.0f);
        });

        It("clamps health to zero", [this]()
        {
            Health->TakeDamage(999.0f);
            TestEqual("Health floor", Health->GetCurrentHealth(), 0.0f);
        });

        It("fires OnDeath when health reaches zero", [this]()
        {
            bool bDeathFired = false;
            Health->OnDeath.AddLambda([&bDeathFired]()
            {
                bDeathFired = true;
            });

            Health->TakeDamage(100.0f);
            TestTrue("OnDeath delegate fired", bDeathFired);
        });
    });

    Describe("Heal()", [this]()
    {
        It("does not exceed max health", [this]()
        {
            Health->TakeDamage(10.0f);
            Health->Heal(50.0f);
            TestEqual("Clamped to max", Health->GetCurrentHealth(), 100.0f);
        });
    });
}

#endif // WITH_AUTOMATION_TESTS
```

### Async / Latent Tests

For tests that need multiple frames (e.g., waiting for an animation or network response):

```cpp
// Use LatentIt instead of It. The FDoneDelegate signals completion.
LatentIt("spawns enemy after delay", [this](const FDoneDelegate& Done)
{
    // Start the spawn timer
    SpawnSystem->RequestSpawn(EnemyClass);

    // LatentBeforeEach can set up world state.
    // After the async work completes, broadcast Done:
    FTSTicker::GetCoreTicker().AddTicker(
        FTickerDelegate::CreateLambda([this, Done](float DeltaTime) -> bool
        {
            if (SpawnSystem->GetSpawnedCount() > 0)
            {
                TestEqual("One enemy spawned", SpawnSystem->GetSpawnedCount(), 1);
                Done.Broadcast();
                return false; // Stop ticking
            }
            return true; // Keep waiting
        })
    );
});
```

---

## Layer 4: Functional Tests (In-World)

Functional Tests are actor-based tests that run inside a level — ideal for testing gameplay scenarios, AI behavior, physics interactions, and level-specific validation.

### Setup

1. Place an `AFunctionalTest` actor (or subclass) in your test level
2. Override `RunTest()` or configure via Blueprint
3. Run from Session Frontend or command line

### Blueprint Functional Test

1. Create a Blueprint subclass of `AFunctionalTest`
2. Override the **Receive Prepare Test** and **Receive Start Test** events
3. Call **Finish Test** with a result when done

### C++ Functional Test

```cpp
// MyGameplayTest.h
#pragma once
#include "FunctionalTest.h"
#include "MyGameplayTest.generated.h"

UCLASS()
class AMyGameplayTest : public AFunctionalTest
{
    GENERATED_BODY()

public:
    virtual void RunTest() override
    {
        // The test level should have a player start and test fixtures.
        // Find the test actor placed in the level:
        AActor* TargetDummy = FindActorByTag(TEXT("TestDummy"));

        if (!TargetDummy)
        {
            FinishTest(EFunctionalTestResult::Failed, "TestDummy actor not found in level");
            return;
        }

        // Simulate damage
        UHealthComponent* Health = TargetDummy->FindComponentByClass<UHealthComponent>();
        Health->TakeDamage(50.0f);

        // Verify the result
        if (FMath::IsNearlyEqual(Health->GetCurrentHealth(), 50.0f))
        {
            FinishTest(EFunctionalTestResult::Succeeded, "Damage applied correctly");
        }
        else
        {
            FinishTest(EFunctionalTestResult::Failed,
                FString::Printf(TEXT("Expected 50, got %f"), Health->GetCurrentHealth()));
        }
    }
};
```

### Running Functional Tests

```bash
# Run all functional tests in a specific map from the command line
UE5Editor.exe MyProject /Game/Maps/TestLevel -ExecCmds="Automation RunTests Project.Functional Tests" -unattended -NullRHI -log
```

---

## Layer 5: Gauntlet (CI Orchestration)

Gauntlet orchestrates tests on **cooked/packaged builds** — the closest to what players actually run. It's designed for CI pipelines where you need to validate builds across platforms.

### Architecture

```
  Gauntlet Script (.cs)          ←  Defines test configuration
        │
        ▼
  RunUAT.bat / RunUAT.sh         ←  Unreal Automation Tool entry point
        │
        ▼
  Launch cooked game instance(s)  ←  With a GauntletController active
        │
        ▼
  GauntletController (C++)       ←  Ticked in-game, drives test logic
        │
        ▼
  Reports results → CI system
```

### Writing a Gauntlet Controller

```cpp
// MyPerformanceTest.h
#pragma once
#include "GauntletTestController.h"
#include "MyPerformanceTest.generated.h"

UCLASS()
class UMyPerformanceTest : public UGauntletTestController
{
    GENERATED_BODY()

public:
    virtual void OnInit() override
    {
        // Called once when the controller starts.
        // Use this to set up test state.
        FrameCount = 0;
        TotalFrameTime = 0.0;
    }

    virtual void OnTick(float TimeDelta) override
    {
        // Called every frame while the test is running.
        FrameCount++;
        TotalFrameTime += TimeDelta;

        // Run for 600 frames (~10 seconds at 60fps)
        if (FrameCount >= 600)
        {
            double AvgFrameTime = TotalFrameTime / FrameCount;
            double AvgFPS = 1.0 / AvgFrameTime;

            if (AvgFPS >= 30.0)
            {
                EndTest(0); // 0 = success exit code
            }
            else
            {
                UE_LOG(LogGauntlet, Error,
                    TEXT("Average FPS %.1f is below 30 FPS threshold"), AvgFPS);
                EndTest(1); // Non-zero = failure
            }
        }
    }

private:
    int32 FrameCount;
    double TotalFrameTime;
};
```

### Running Gauntlet from Command Line

```bash
# Run via the Unreal Automation Tool
RunUAT.bat RunUnreal \
  -project=MyProject \
  -platform=Win64 \
  -configuration=Development \
  -build=path/to/cooked/build \
  -test=MyPerformanceTest \
  -log
```

---

## Test Organization Best Practices

### File Layout

```
MyProject/
├── Source/
│   ├── MyGame/
│   │   └── Private/
│   │       └── Tests/              // Automation + Spec tests
│   │           ├── InventorySystem.spec.cpp
│   │           ├── HealthComponentTest.cpp
│   │           └── CombatSystemTest.cpp
│   └── MyGameTests/                // Low Level Tests (separate module)
│       ├── MyGameTests.Build.cs
│       └── Private/
│           └── MathUtilsTest.cpp
├── Content/
│   └── Tests/
│       └── Maps/
│           └── FunctionalTestLevel.umap   // Functional test levels
└── Config/
    └── DefaultEngine.ini           // Test configuration
```

### Module Dependencies

```csharp
// MyGame.Build.cs
// Add UnrealEd to test builds only:
if (Target.bBuildEditor)
{
    PrivateDependencyModuleNames.Add("UnrealEd");
}
// Always needed for automation tests:
PrivateDependencyModuleNames.Add("AutomationController");
```

### Choosing the Right Layer

| Question | Answer → Use This |
|----------|-------------------|
| Is it pure C++ with no UObject? | **Low Level Tests** |
| Does it test a UObject or subsystem in isolation? | **Spec Tests** (preferred) or **Automation Tests** |
| Does it need a spawned world / level? | **Functional Tests** |
| Does it need a cooked build or multiple clients? | **Gauntlet** |
| Is it validating asset data (materials, meshes, etc)? | **Asset Data Validation** (`IsDataValid()` override) |
| Is it validating map setup? | **Map Check** (`CheckForErrors()` override) |

---

## CI Integration

### Headless Test Execution

```bash
# Run all product-filter automation tests headlessly
UE5Editor.exe MyProject \
  -ExecCmds="Automation RunTests MyGame" \
  -unattended \
  -nopause \
  -NullRHI \
  -log \
  -ReportOutputPath="TestResults/"
```

### JUnit-Compatible Output

Unreal can produce JUnit XML reports that most CI tools (Jenkins, GitHub Actions, GitLab CI) can parse:

```bash
# Add these flags for CI-friendly output
-ReportExportPath="junit-results.xml"
```

### Recommended CI Pipeline

```
1. Compile (Editor + Game targets)
2. Low Level Tests              ← fastest, catches logic bugs early
3. Automation/Spec Tests        ← medium speed, catches system bugs
4. Functional Tests             ← slower, catches gameplay regressions
5. Cook build
6. Gauntlet smoke tests         ← slowest, catches platform/packaging issues
```

---

## Common Pitfalls

| Problem | Cause | Fix |
|---------|-------|-----|
| Tests don't appear in Session Frontend | Wrong flags or `#if WITH_AUTOMATION_TESTS` stripped | Verify flags include `ProductFilter` and the `WITH_AUTOMATION_TESTS` define is set |
| "UnrealEd module not found" link error | Test code references editor-only APIs in a game module | Guard with `if (Target.bBuildEditor)` in Build.cs |
| Spec `BeforeEach` not running | Forgot to wrap test body in `Define()` | All Describe/It/BeforeEach calls must be inside `Define()` |
| Functional test times out | Test never calls `FinishTest()` | Ensure all code paths lead to `FinishTest()`, including error paths |
| Gauntlet exits with code 1 but no error log | Controller didn't call `EndTest()` | Verify `OnTick` logic always reaches `EndTest()` within a reasonable frame count |
| Flaky tests on CI | Tests depend on frame timing or load order | Use latent commands with explicit completion conditions, not frame counts |

---

## Further Reading

- [Unreal Automation Test Framework Documentation](https://dev.epicgames.com/documentation/en-us/unreal-engine/automation-test-framework-in-unreal-engine)
- [Gauntlet Framework Overview](https://dev.epicgames.com/documentation/en-us/unreal-engine/gauntlet-automation-framework-overview-in-unreal-engine)
- [The Topography of Unreal Test Automation in 2025](https://andrewfray.wordpress.com/2025/04/09/the-topography-of-unreal-test-automation-in-2025/)
- [G10 — Debugging & Profiling](G10_debugging_profiling.md)
- [G15 — Blueprint/C++ Workflow](G15_blueprint_cpp_workflow.md)
