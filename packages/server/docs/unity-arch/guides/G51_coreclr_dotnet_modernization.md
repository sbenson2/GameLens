# G51 — CoreCLR & .NET Modernization: Preparing for Unity 6.7–6.8

> **Category:** guide · **Engine:** Unity 6.4+ (preparation), 6.7 (experimental CoreCLR player), 6.8 (Mono removal) · **Related:** [G44 Unity 6 Migration](G44_unity6_migration_new_features.md) · [G45 Source Generators](G45_source_generators.md) · [G42 Burst Compiler](G42_burst_compiler_jobs_system.md) · [Unity Rules](../unity-arch-rules.md)

Unity is replacing its Mono scripting runtime with Microsoft CoreCLR over the course of 2026. Unity 6.7 ships an experimental CoreCLR desktop player; Unity 6.8 removes Mono entirely. This is the largest scripting infrastructure change since Unity adopted C#. This guide covers what's changing, what breaks, and how to prepare your codebase today.

---

## Timeline

| Version | Target Date | Milestone |
|---------|-------------|-----------|
| Unity 6.4 | March 2026 | ECS as core package; `EntityId` replaces `InstanceID`; preparation APIs land |
| Unity 6.5 | Mid-2026 (beta) | Breaking changes finalized; `SerializeReference` validation; early CoreCLR-related deprecations |
| Unity 6.7 LTS | Late 2026 | Experimental CoreCLR desktop player; MSBuild-based project system |
| Unity 6.8 | 2027 | CoreCLR-only; Mono scripting backend fully removed |

> **Why CoreCLR?** Identical game code runs ~2.6× faster on CoreCLR vs Unity's Mono (benchmarked by Unity). Beyond raw speed, CoreCLR brings .NET 10, C# 14, modern `async`/`await`, `Span<T>` everywhere, and elimination of domain reloads in the editor.

---

## What CoreCLR Changes

### 1. Runtime Performance

CoreCLR's JIT (RyuJIT) produces substantially better native code than Mono's JIT, especially for:

- **Floating-point math** — tighter SIMD codegen on x64 and ARM64
- **Generics** — shared generic implementations reduce code size
- **Async/await** — `ValueTask<T>`, pooled `IValueTaskSource`, zero-alloc async paths
- **GC** — .NET's generational GC is more aggressive about compaction and has lower pause times

```csharp
// BEFORE (Mono): async allocates a state machine on the heap every call
async Task<int> LoadDataAsync()
{
    var data = await FetchFromDisk();
    return Process(data);
}

// AFTER (CoreCLR + .NET 10): ValueTask avoids heap allocation when
// the result is available synchronously (cache hit, pooled buffer, etc.)
// WHY: In game loops, many async calls complete synchronously —
// ValueTask prevents per-frame GC pressure in those cases.
async ValueTask<int> LoadDataAsync()
{
    var data = await FetchFromDisk();
    return Process(data);
}
```

### 2. Build System: Mono → MSBuild

Unity is moving from its custom compilation pipeline to standard MSBuild SDK-based `.csproj` files.

**What changes:**
- Assembly definitions (`.asmdef`) continue to work but generate standard `.csproj` files
- `mcs.rsp` / `csc.rsp` response files are replaced by MSBuild properties
- NuGet packages can be referenced directly (no more manual DLL imports for many libraries)
- Source generators use standard Roslyn tooling (no more special Unity labeling — see migration note below)

```xml
<!-- Future: Standard SDK-based .csproj generated from .asmdef -->
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <LangVersion>14</LangVersion>
    <AllowUnsafeBlocks>true</AllowUnsafeBlocks>
  </PropertyGroup>
  <ItemGroup>
    <!-- NuGet packages referenced directly -->
    <PackageReference Include="MessagePack" Version="3.1.0" />
  </ItemGroup>
</Project>
```

### 3. Serialization Changes

Unity's serialization system is being updated. Key changes to watch for:

- `[SerializeReference]` now validates that ancestor classes have `[Serializable]` (enforced starting Unity 6.4)
- Binary serialization via `BinaryFormatter` is removed in .NET 10 — any code using it will break
- `ISerializationCallbackReceiver` continues to work but verify custom serialization logic against CoreCLR's stricter type checking

```csharp
// WRONG: BinaryFormatter is removed in .NET 10 / CoreCLR
// This pattern was never recommended for Unity but some plugins use it
var formatter = new BinaryFormatter();  // WILL NOT COMPILE on CoreCLR
formatter.Serialize(stream, saveData);

// CORRECT: Use Unity's JsonUtility, or MessagePack, or a custom
// ISerializationCallbackReceiver for complex types
// WHY: BinaryFormatter has security vulnerabilities and is not
// portable across runtime versions.
string json = JsonUtility.ToJson(saveData);
File.WriteAllText(savePath, json);
```

### 4. Domain Reload Elimination

CoreCLR eliminates the need for domain reloads when entering Play Mode:

- **Current behavior:** Unity reloads the AppDomain to reset static state, causing multi-second delays
- **CoreCLR behavior:** Static state management is handled differently; enter-Play-Mode is near-instant
- **Your responsibility:** Code that relies on domain-reload side effects (static fields reset to default, static constructors re-running) must be updated

```csharp
// PROBLEM: This static field is reset to null on domain reload (Mono).
// Under CoreCLR without domain reloads, it retains its value across
// Play Mode entries, causing stale-state bugs.
public static class GameState
{
    private static List<Enemy> _activeEnemies = new();

    // WRONG: Assuming domain reload clears this
    public static void RegisterEnemy(Enemy e) => _activeEnemies.Add(e);
}

// CORRECT: Explicitly reset state using RuntimeInitializeOnLoadMethod.
// WHY: This attribute fires at the correct time regardless of domain
// reload settings, making code CoreCLR-ready today.
public static class GameState
{
    private static List<Enemy> _activeEnemies;

    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
    private static void Init()
    {
        // WHY: Explicitly clear state so behavior is identical whether
        // domain reload is on (Mono) or off (CoreCLR / fast enter Play Mode).
        _activeEnemies = new List<Enemy>();
    }

    public static void RegisterEnemy(Enemy e) => _activeEnemies.Add(e);
}
```

---

## Preparation Checklist — Start Today (Unity 6.4+)

These steps are safe to take now and will reduce friction when CoreCLR arrives.

### Step 1: Enable "Enter Play Mode Settings" Without Domain Reload

This is the single most impactful preparation step. It simulates CoreCLR's no-domain-reload behavior:

1. **Edit → Project Settings → Editor → Enter Play Mode Settings** → Enable
2. Uncheck **Reload Domain**
3. Run your game — any bugs you see are static-state issues that will also break under CoreCLR

Fix every static field that assumes domain-reload cleanup (see pattern above).

### Step 2: Eliminate BinaryFormatter Usage

Search your project and all plugins for `BinaryFormatter`, `IFormatter`, or `System.Runtime.Serialization.Formatters`:

```bash
# Search for BinaryFormatter usage in your Assets folder
grep -rn "BinaryFormatter\|IFormatter\|Formatters.Binary" Assets/ Packages/
```

Replace with `JsonUtility`, `MessagePack`, `MemoryPack`, or protocol buffers.

### Step 3: Audit Reflection-Heavy Code

CoreCLR with NativeAOT (used in IL2CPP builds) is stricter about reflection:

- `Type.GetType("Namespace.ClassName")` may fail if the type is stripped
- `Activator.CreateInstance` on types without parameterless constructors throws at runtime
- Prefer source generators over runtime reflection for serialization, DI, and event binding

```csharp
// FRAGILE: Runtime reflection — may be stripped by IL2CPP / NativeAOT
var type = Type.GetType("MyGame.Enemies.GoblinAI");
var instance = Activator.CreateInstance(type);

// ROBUST: Use [Preserve] attribute or link.xml to prevent stripping,
// or better yet, use a factory pattern / source generator
// WHY: The linker can prove this type is "unreachable" and strip it
// unless explicitly preserved.
[Preserve]
public class GoblinAI : IEnemy { }
```

### Step 4: Update Source Generators

Current Unity source generators must:
- Target .NET Standard 2.0
- Use `Microsoft.CodeAnalysis.CSharp` 4.3.x
- Be labeled `RoslynAnalyzer` in the Plugin Inspector

Under MSBuild, source generators will follow standard .NET conventions:
- Reference via `<PackageReference>` or `<Analyzer>` in `.csproj`
- Target the Roslyn version matching your .NET SDK
- No special Unity labeling needed

**Action:** Keep generators on .NET Standard 2.0 for now (backward compatible), but avoid hard dependencies on Unity's current compilation pipeline.

### Step 5: Replace Obsolete APIs

Unity 6.4 introduced `EntityId` to replace `InstanceID` for entity identification. More obsoletions are coming in 6.5+:

```csharp
// DEPRECATED in Unity 6.4
int id = myGameObject.GetInstanceID();  // Still works but marked obsolete for entities

// PREFERRED: Use EntityId for ECS entities (available in 6.4+)
// WHY: EntityId is 8 bytes in 6.5+ (up from 4), supporting larger worlds
// and providing a unified identifier across the GameObject/Entity boundary.
EntityId entityId = entity.Id;
```

### Step 6: Test With IL2CPP Regularly

IL2CPP already uses ahead-of-time compilation similar to CoreCLR's NativeAOT path. Projects that build cleanly with IL2CPP are less likely to hit CoreCLR surprises:

- Build for Windows/Mac with IL2CPP scripting backend
- Fix any `MissingMethodException` or `TypeLoadException` errors
- Verify all `[Preserve]` attributes and `link.xml` entries are correct

---

## Modern C# Features Available Under CoreCLR

Once CoreCLR ships, these C# 12–14 features become available (many already work with Unity 6.4's Mono if targeting C# 12):

| Feature | C# Version | Game Dev Use Case |
|---------|------------|-------------------|
| Primary constructors | 12 | Compact MonoBehaviour helper classes |
| Collection expressions `[1, 2, 3]` | 12 | Inline test data, constant arrays |
| `ref readonly` parameters | 12 | Zero-copy pass of large structs in ECS |
| Interceptors | 12 | Source generator optimization hooks |
| `params` collections (not just arrays) | 13 | `Span<T>`-based variadic methods — zero alloc |
| `Lock` object | 13 | Safer, more efficient thread synchronization |
| Extension types | 14 | Add methods + state to existing types without inheritance |
| `field` keyword in properties | 14 | Eliminate backing field boilerplate |

```csharp
// C# 14 — field keyword eliminates private backing field declaration
// WHY: Reduces boilerplate in data-heavy components while keeping
// validation logic in the property setter.
public class PlayerStats : MonoBehaviour
{
    // Before C# 14:
    // private int _health;
    // public int Health { get => _health; set => _health = Mathf.Clamp(value, 0, MaxHealth); }

    // C# 14 (CoreCLR):
    public int Health
    {
        get => field;
        set => field = Mathf.Clamp(value, 0, MaxHealth);
    }

    public int MaxHealth { get; set; } = 100;
}

// C# 13 — params Span<T> avoids array allocation for variadic methods
// WHY: In hot paths like damage calculations, avoiding a params array
// allocation per call eliminates GC pressure.
public static int CalculateTotal(params ReadOnlySpan<int> modifiers)
{
    int total = 0;
    foreach (var m in modifiers)
        total += m;
    return total;
}

// Called without allocating an array:
int damage = CalculateTotal(baseDamage, critBonus, elementalBonus);
```

---

## Plugin & Asset Store Compatibility

Third-party plugins are the highest risk area for CoreCLR migration:

1. **Audit all plugins for `BinaryFormatter`, `Remoting`, or `AppDomain` usage** — these are removed in .NET 10
2. **Check for Mono-specific P/Invoke patterns** — CoreCLR uses different marshaling for some types
3. **Verify native plugin ABI** — CoreCLR's calling conventions match .NET's standard; most native plugins work unchanged, but test early
4. **Contact plugin vendors** about their CoreCLR readiness — major vendors (Odin, DOTween, Mirror) are tracking this

> **Rule of thumb:** If a plugin builds and runs with IL2CPP today, it will likely work with CoreCLR. If it only works with Mono, it needs updating.

---

## FAQ

**Q: Will my existing Unity 6.3 LTS project break when I upgrade to 6.7?**
A: Not immediately — 6.7 ships CoreCLR as an *opt-in experimental* backend alongside Mono. The forced migration happens in 6.8.

**Q: Do Burst-compiled jobs need changes?**
A: No. Burst generates native code independently of the managed runtime. Burst-compiled code works identically under Mono and CoreCLR.

**Q: What about IL2CPP builds?**
A: IL2CPP continues to work. The CoreCLR change primarily affects the editor and Mono-based players. IL2CPP remains the recommended backend for console and mobile.

**Q: Will async/await finally be zero-allocation?**
A: For `ValueTask<T>` completions that resolve synchronously, yes. For truly asynchronous completions, allocations are pooled by the runtime, making them far cheaper than under Mono.

---

## Further Reading

- [Unity 2026 Roadmap](https://unity.com/blog/unity-engine-2025-roadmap) — Official roadmap overview
- [CoreCLR Status Update (March 2026)](https://discussions.unity.com/t/coreclr-scripting-and-ecs-status-update-march-2026/1711852) — Latest status from Unity
- [Path to CoreCLR Upgrade Guide](https://discussions.unity.com/t/path-to-coreclr-2026-upgrade-guide/1714279) — Community migration guide
- [Unity 6.5 Breaking Changes](https://discussions.unity.com/t/planned-breaking-changes-in-unity-6-5-updated-2026-03-27/1694205) — Tracked breaking changes
