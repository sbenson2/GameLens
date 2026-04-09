# G45 — Source Generators & Compile-Time Code Generation

> **Category:** guide · **Engine:** Unity 6 (6000.x, C#) · **Related:** [G13 ECS/DOTS](G13_ecs_dots.md) · [G8 Networking](G8_networking_netcode.md) · [G34 Dependency Injection](G34_dependency_injection_architecture.md) · [Unity Rules](../unity-arch-rules.md)

C# Source Generators run at compile time inside Roslyn and emit new `.cs` files that become part of your assembly — no reflection, no IL weaving, no runtime cost. Unity has supported them since 2021.2, and Unity 6 (6000.x) uses them extensively internally (DOTS, Netcode for Entities, Input System). This guide covers how to consume existing generators and how to author your own for gameplay boilerplate elimination.

---

## Why Source Generators Matter for Game Dev

Traditional Unity patterns rely on runtime reflection or manual boilerplate:

- `GetComponent<T>()` calls scattered through `Awake()`
- Serialization code for save systems
- Repetitive event binding for UI Toolkit
- Netcode RPC stubs and ghost component serialization

Source generators eliminate all of these at compile time, producing code that is:

1. **Burst-compatible** — generated code uses concrete types, no reflection
2. **AOT-safe** — critical for iOS, WebGL, and console builds where JIT is unavailable
3. **IDE-visible** — generated files appear in your IDE with full IntelliSense support
4. **Zero runtime overhead** — the generator runs during compilation only

---

## How Unity Integrates Source Generators

Unity treats source generator DLLs as Roslyn analyzers. The integration pipeline:

```
Your C# code → Roslyn compiler → Source Generator (runs here) → Generated .cs files → Final assembly
```

### Built-in Generators in Unity 6

Several Unity packages ship their own generators — you use them automatically:

| Package | What It Generates |
|---------|------------------|
| `com.unity.entities` | `ISystem` boilerplate, `SystemAPI.Query` iteration, aspect code |
| `com.unity.netcode` | Ghost component serialization, RPC command structs, `ICommandData` |
| `com.unity.inputsystem` | C# classes from `.inputactions` assets |
| `com.unity.mathematics` | Burst-friendly math type interop |

You don't need to configure anything for these — they work out of the box when you import the package.

---

## Consuming a Third-Party Source Generator

### Step 1: Build or Obtain the DLL

Source generators are distributed as `.dll` files targeting **.NET Standard 2.0**. Common sources:

- NuGet packages (e.g., `Cysharp/UnitGenerator` for value objects)
- GitHub releases
- Your own generator project (see "Authoring" section below)

### Step 2: Import into Unity

1. Copy the `.dll` into your Unity project (e.g., `Assets/Plugins/Analyzers/`)
2. Select the DLL in the Project window to open the **Plugin Inspector**
3. **Disable "Any Platform"** — source generators are compile-time only, not runtime plugins
4. Under **Labels**, add the label **`RoslynAnalyzer`** (case-sensitive, exact match required)

```
Assets/
├── Plugins/
│   └── Analyzers/
│       └── MySourceGenerator.dll   ← labeled "RoslynAnalyzer"
```

> **WHY the label?** Unity's compilation pipeline scans for DLLs with this label and passes them to Roslyn as analyzer/generator assemblies. Without it, Unity treats the DLL as a runtime plugin and ignores the generator.

### Step 3: Verify

After reimporting, check the Console for any generator errors. Generated files appear in:
- `Temp/GeneratedCode/<AssemblyName>/` during compilation
- Your IDE's "Analyzers" or "Source Generators" node (Rider, VS 2022+)

---

## Authoring a Custom Source Generator

### Project Setup

Create a **separate C# class library** (not inside your Unity project):

```xml
<!-- MyGenerator.csproj -->
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <!-- MUST target netstandard2.0 for Unity compatibility -->
    <TargetFramework>netstandard2.0</TargetFramework>
    <!-- Emit the generator as an analyzer -->
    <EnforceExtendedAnalyzerRules>true</EnforceExtendedAnalyzerRules>
    <LangVersion>latest</LangVersion>
  </PropertyGroup>
  <ItemGroup>
    <!-- Unity requires exactly version 4.3.x of the Roslyn APIs -->
    <PackageReference Include="Microsoft.CodeAnalysis.CSharp" Version="4.3.1" PrivateAssets="all" />
    <PackageReference Include="Microsoft.CodeAnalysis.Analyzers" Version="3.3.4" PrivateAssets="all" />
  </ItemGroup>
</Project>
```

> **CRITICAL:** Unity 6 requires `Microsoft.CodeAnalysis.CSharp` version **4.3.x**. Using a newer version (e.g., 4.8) will cause silent failures — the generator simply won't run.

### Example: Auto-Generate GetComponent Caching

This generator finds fields marked with `[AutoInject]` and generates an `InitializeComponents()` method that caches all `GetComponent` calls.

**Step 1 — Define the marker attribute** (emitted by the generator itself):

```csharp
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Text;
using System.Collections.Immutable;
using System.Linq;
using System.Text;

// WHY IIncrementalGenerator? It's the modern, performant API.
// Unlike ISourceGenerator, it only re-runs when inputs change,
// which keeps Unity's domain reload fast.
[Generator]
public class AutoInjectGenerator : IIncrementalGenerator
{
    // The attribute source — injected into the user's compilation
    // so they can write [AutoInject] without a separate assembly reference.
    private const string AttributeSource = @"
namespace GameCodex.Generated
{
    [System.AttributeUsage(System.AttributeTargets.Field)]
    internal class AutoInjectAttribute : System.Attribute { }
}";

    public void Initialize(IncrementalGeneratorInitializationContext context)
    {
        // Step 1: Register the marker attribute so user code can reference it
        context.RegisterPostInitializationOutput(ctx =>
            ctx.AddSource("AutoInjectAttribute.g.cs",
                SourceText.From(AttributeSource, Encoding.UTF8)));

        // Step 2: Find all classes that contain fields with [AutoInject]
        var classDeclarations = context.SyntaxProvider
            .CreateSyntaxProvider(
                // Fast predicate: only look at field declarations with attributes
                predicate: static (node, _) => node is FieldDeclarationSyntax f
                    && f.AttributeLists.Count > 0,
                // Transform: extract the class + field info
                transform: static (ctx, _) =>
                {
                    var field = (FieldDeclarationSyntax)ctx.Node;
                    var classDecl = field.Parent as ClassDeclarationSyntax;
                    return (classDecl, field);
                })
            .Where(static pair => pair.classDecl != null);

        // Step 3: Generate the InitializeComponents method
        context.RegisterSourceOutput(classDeclarations.Collect(), GenerateCode);
    }

    private static void GenerateCode(
        SourceProductionContext context,
        ImmutableArray<(ClassDeclarationSyntax classDecl, FieldDeclarationSyntax field)> items)
    {
        // Group fields by their containing class
        var grouped = items.GroupBy(i => i.classDecl!.Identifier.Text);

        foreach (var group in grouped)
        {
            var className = group.Key;
            var sb = new StringBuilder();
            sb.AppendLine("// <auto-generated by AutoInjectGenerator />");
            sb.AppendLine("using UnityEngine;");
            sb.AppendLine();
            sb.AppendLine($"public partial class {className}");
            sb.AppendLine("{");
            sb.AppendLine("    // WHY generated? Eliminates forgotten GetComponent calls");
            sb.AppendLine("    // and ensures all dependencies are cached in one place.");
            sb.AppendLine("    private void InitializeComponents()");
            sb.AppendLine("    {");

            foreach (var (_, field) in group)
            {
                // Extract the type name from the field declaration
                var typeName = field.Declaration.Type.ToString();
                var varName = field.Declaration.Variables.First().Identifier.Text;
                sb.AppendLine($"        {varName} = GetComponent<{typeName}>();");
            }

            sb.AppendLine("    }");
            sb.AppendLine("}");

            context.AddSource($"{className}.AutoInject.g.cs",
                SourceText.From(sb.ToString(), Encoding.UTF8));
        }
    }
}
```

**Step 2 — Use it in your Unity MonoBehaviour:**

```csharp
using GameCodex.Generated;
using UnityEngine;

// WHY partial? The source generator adds the InitializeComponents()
// method to the other half of this partial class at compile time.
public partial class EnemyController : MonoBehaviour
{
    [AutoInject] private Rigidbody _rb;
    [AutoInject] private Animator _animator;
    [AutoInject] private Collider _collider;

    private void Awake()
    {
        // This method is generated at compile time — no reflection needed
        InitializeComponents();
    }
}
```

**Generated output** (visible in `Temp/GeneratedCode/`):

```csharp
// <auto-generated by AutoInjectGenerator />
using UnityEngine;

public partial class EnemyController
{
    private void InitializeComponents()
    {
        _rb = GetComponent<Rigidbody>();
        _animator = GetComponent<Animator>();
        _collider = GetComponent<Collider>();
    }
}
```

---

## Debugging Source Generators

| Problem | Diagnosis | Fix |
|---------|-----------|-----|
| Generator doesn't run | Check the DLL label in Plugin Inspector | Must be exactly `RoslynAnalyzer` (case-sensitive) |
| Generator runs but produces errors | Check Console after domain reload | Fix the generated code — syntax errors in templates are common |
| Works in IDE but not Unity | Roslyn version mismatch | Pin `Microsoft.CodeAnalysis.CSharp` to **4.3.x** |
| Incremental generator never re-runs | Predicate too broad/narrow | Use `Debugger.Launch()` in the generator to attach VS debugger |
| Generated code not visible in IDE | IDE not configured | Rider: auto-detects. VS: enable "Source Generator" node in Solution Explorer |

### Attaching a Debugger

Add this temporarily to your generator's `Initialize` method:

```csharp
#if DEBUG
System.Diagnostics.Debugger.Launch();
#endif
```

When Unity recompiles, a debugger attach dialog appears. This lets you step through the generator's syntax tree traversal.

---

## Practical Use Cases for Game Development

### 1. Singleton Registration

Generate a static accessor and `RuntimeInitializeOnLoadMethod` registration from a `[GameService]` attribute — eliminates manual singleton boilerplate while keeping the pattern testable.

### 2. Event Bus Wiring

Scan for methods marked `[OnEvent(typeof(PlayerDied))]` and generate subscription/unsubscription code in `OnEnable`/`OnDisable`, preventing forgotten `-=` unsubscriptions that cause memory leaks.

### 3. Save System Serialization

Generate `Serialize()` / `Deserialize()` methods for `[Saveable]` classes, producing binary-compatible code without `System.Reflection` — essential for console and mobile performance.

### 4. Inspector Validation

Generate `OnValidate()` methods that check `[Required]`-marked fields are assigned, catching missing references at edit time instead of runtime `NullReferenceException`.

### 5. Netcode Ghost Components

Unity's Netcode for Entities uses source generators internally to produce serialization code for `[GhostComponent]` fields — this is how RPCs and ghost snapshots avoid reflection overhead.

---

## Best Practices

1. **Always use `IIncrementalGenerator`** over `ISourceGenerator` — the incremental API only re-runs when inputs change, keeping Unity's domain reload fast
2. **Keep generators in a separate solution** — they cannot reference `UnityEngine.dll` (they run inside Roslyn, not Unity)
3. **Emit the marker attribute via `RegisterPostInitializationOutput`** — this avoids a circular dependency between the generator DLL and the user's assembly
4. **Use `partial` classes** — generators can only *add* members, not modify existing code. The `partial` keyword lets generated code extend user-written classes
5. **Pin Roslyn to 4.3.x** — newer versions may work in your IDE but fail in Unity's compiler
6. **Test outside Unity first** — use a regular .NET test project with `CSharpGeneratorDriver` to verify generator output before importing the DLL
7. **Avoid heavy computation in generators** — they run on every recompilation; keep syntax tree traversal lean
8. **Add `// <auto-generated />` headers** — this tells code analysis tools and formatters to skip generated files

---

## Limitations

- **No runtime code generation** — source generators are compile-time only. For runtime needs, use `System.Reflection.Emit` (not available on AOT platforms) or pre-generated lookup tables
- **Cannot modify existing syntax trees** — generators can only *add* new files. Use Roslyn analyzers + code fixes for refactoring suggestions
- **Unity recompiles the entire assembly** — unlike hot reload in .NET, changing a generator triggers a full domain reload
- **No access to UnityEngine APIs** — the generator runs inside the Roslyn process, not the Unity runtime. Use string-based type references or shared constants
- **Debugging is awkward** — `Debugger.Launch()` works but requires manual attachment each time

---

## Further Reading

- [Unity Manual: Roslyn Analyzers and Source Generators](https://docs.unity3d.com/6000.3/Documentation/Manual/roslyn-analyzers.html)
- [Unity Manual: Create and Use a Source Generator](https://docs.unity3d.com/6000.0/Documentation/Manual/create-source-generator.html)
- [Cysharp/UnitGenerator](https://github.com/Cysharp/UnitGenerator) — open-source value-object generator for Unity
- [Microsoft: Source Generators Overview](https://learn.microsoft.com/en-us/dotnet/csharp/roslyn-sdk/source-generators-overview)
