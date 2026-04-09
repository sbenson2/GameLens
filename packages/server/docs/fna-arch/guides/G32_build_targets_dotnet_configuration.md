# G32 — Build Targets & .NET Configuration

> **Category:** guide · **Engine:** FNA · **Related:** [G01 Getting Started](./G01_getting_started.md) · [G02 NativeAOT Publishing](./G02_nativeaot_publishing.md) · [G23 Console Porting NativeAOT](./G23_console_porting_nativeaot.md) · [FNA Architecture Rules](../fna-arch-rules.md)

FNA provides multiple project files targeting different .NET runtimes. This guide covers which build target to choose, how to configure your game project for each, and the trade-offs between .NET 8+, .NET Framework, .NET Standard, and NativeAOT.

---

## Table of Contents

1. [FNA's Multi-Target Strategy](#1--fnas-multi-target-strategy)
2. [Available Project Files](#2--available-project-files)
3. [Choosing the Right Target](#3--choosing-the-right-target)
4. [.NET 8+ (FNA.Core.csproj)](#4--net-8-fnacoresproj)
5. [.NET Framework 4.0 (FNA.NetFramework.csproj)](#5--net-framework-40-fnanetframeworkcsproj)
6. [.NET Standard 2.0 (FNA.NetStandard.csproj)](#6--net-standard-20-fnanetstandardcsproj)
7. [Mono / Makefile Builds](#7--mono--makefile-builds)
8. [FNA.Settings.props Customization](#8--fnasettingsprops-customization)
9. [NativeAOT Configuration](#9--nativeaot-configuration)
10. [Referencing FNA in Your Game](#10--referencing-fna-in-your-game)
11. [Common Build Issues](#11--common-build-issues)
12. [FNA vs MonoGame: Build System Differences](#12--fna-vs-monogame-build-system-differences)

---

## 1 — FNA's Multi-Target Strategy

FNA is not distributed as a NuGet package. You clone the FNA repository (or add it as a Git submodule) and reference one of its project files directly. This is intentional: FNA wants you to build against a known commit, ensuring reproducible builds and making it trivial to bisect regressions.

All FNA project files share the same source code under `src/`. The root namespace is always `Microsoft.Xna.Framework`, matching XNA exactly. The difference between project files is the target framework and build tooling.

---

## 2 — Available Project Files

| Project File | Target | SDK-Style | Use Case |
|---|---|---|---|
| `FNA.Core.csproj` | .NET 8.0 | Yes | **Recommended** for new projects |
| `FNA.NetFramework.csproj` | .NET Framework 4.0 | No | Legacy XNA ports on Windows |
| `FNA.NetStandard.csproj` | .NET Standard 2.0 | Yes | Maximum runtime compatibility |
| `Makefile` | Mono (mcs) | N/A | Linux/Unix CI, minimal tooling |

All project files enable `AllowUnsafeBlocks` (FNA uses unsafe code for performance-critical interop with native libraries like FNA3D and FAudio).

---

## 3 — Choosing the Right Target

**Starting a new game?** Use `FNA.Core.csproj` with .NET 8+. It gives you the best performance, modern C# features (spans, pattern matching, file-scoped namespaces), and the NativeAOT publish path for consoles.

**Porting an existing XNA game?** Start with `FNA.NetFramework.csproj` if the original project targets .NET Framework. Get it compiling and running first, then consider migrating to .NET 8 once it's stable.

**Building a library that targets both FNA and MonoGame?** Use `FNA.NetStandard.csproj`. Your library can reference FNA via .NET Standard and consumers pick their runtime.

**CI on a Linux box with minimal dependencies?** The `Makefile` builds FNA with `mcs` (Mono C# compiler) and requires no SDK installation beyond Mono.

---

## 4 — .NET 8+ (FNA.Core.csproj)

This is the modern SDK-style project file and the recommended choice for new FNA games.

```xml
<!-- Your game's .csproj -->
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <AllowUnsafeBlocks>true</AllowUnsafeBlocks>
  </PropertyGroup>
  <ItemGroup>
    <ProjectReference Include="lib/FNA/FNA.Core.csproj" />
  </ItemGroup>
</Project>
```

**Benefits:**
- Span-based APIs for zero-allocation texture/vertex data manipulation
- NativeAOT publishing (`dotnet publish /p:PublishAot=true`)
- Trimming support to reduce deployment size
- Modern `dotnet` CLI tooling
- ReadyToRun precompilation for faster startup

**Caveats:**
- Requires .NET 8 SDK installed (not just runtime)
- Some older XNA community libraries may not compile against .NET 8 without updates

---

## 5 — .NET Framework 4.0 (FNA.NetFramework.csproj)

The legacy project file for Windows-only builds. Useful when porting original XNA games that depend on .NET Framework assemblies.

```xml
<!-- Your game's .csproj (old-style) -->
<Project ...>
  <PropertyGroup>
    <TargetFrameworkVersion>v4.0</TargetFrameworkVersion>
  </PropertyGroup>
  <ItemGroup>
    <ProjectReference Include="lib\FNA\FNA.NetFramework.csproj" />
  </ItemGroup>
</Project>
```

**When to use:**
- The original XNA game uses .NET Framework 4.0 features or libraries
- You need compatibility with Visual Studio 2010–2017
- You're using Mono on Linux (MonoKickstart bundles a Mono runtime for shipping)

**Caveats:**
- No NativeAOT (console porting requires migrating to .NET 8+)
- No modern C# features beyond C# 5.0 (Mono) or C# 7.3 (.NET Framework)
- MSBuild XML format is more verbose

---

## 6 — .NET Standard 2.0 (FNA.NetStandard.csproj)

A compatibility-focused target for library authors.

```xml
<ProjectReference Include="lib/FNA/FNA.NetStandard.csproj" />
```

.NET Standard 2.0 assemblies run on .NET 8+, .NET Framework 4.6.1+, and Mono. This is ideal for shared code (engine libraries, ECS frameworks, utility packages) that should work across FNA runtimes.

**When to use:**
- You're building a reusable library (not a game executable)
- The library needs to work with both FNA.Core and FNA.NetFramework consumers
- You're publishing a NuGet package that targets FNA

**Caveats:**
- Limited to .NET Standard 2.0 API surface
- Cannot be the entry point of a game (no `OutputType=Exe`)

---

## 7 — Mono / Makefile Builds

For environments without the .NET SDK:

```bash
# Build FNA with Mono's C# compiler
cd lib/FNA
make

# Your game
mcs -r:lib/FNA/bin/Release/FNA.dll -out:MyGame.exe src/*.cs
```

This path is useful for Linux CI pipelines, minimal Docker containers, or systems where installing the .NET SDK is impractical. The resulting assembly runs under Mono.

---

## 8 — FNA.Settings.props Customization

FNA supports an optional `FNA.Settings.props` file adjacent to the FNA project file. This allows you to customize build behavior without modifying FNA's tracked files (keeping your submodule clean):

```xml
<!-- lib/FNA/FNA.Settings.props -->
<Project>
  <PropertyGroup>
    <!-- Example: disable a specific FNA warning -->
    <NoWarn>$(NoWarn);CS0618</NoWarn>
  </PropertyGroup>
</Project>
```

This file is `.gitignore`d by FNA, so your customizations stay local.

---

## 9 — NativeAOT Configuration

NativeAOT compiles your game to a native binary with no .NET runtime dependency. Required for console ports, beneficial for desktop distribution.

```bash
# Linux native binary
dotnet publish -c Release -r linux-x64 /p:PublishAot=true

# Windows native binary
dotnet publish -c Release -r win-x64 /p:PublishAot=true

# macOS (Intel)
dotnet publish -c Release -r osx-x64 /p:PublishAot=true
```

**Requirements:**
- .NET 8+ (`FNA.Core.csproj`)
- Native toolchain (GCC/Clang on Linux, MSVC on Windows, Xcode on macOS)
- All reflection usage must be AOT-compatible (FNA itself is; check your own code)

**Key setting for your `.csproj`:**

```xml
<PropertyGroup Condition="'$(PublishAot)' == 'true'">
  <TrimMode>link</TrimMode>
  <InvariantGlobalization>true</InvariantGlobalization>
</PropertyGroup>
```

See G02 and G23 for detailed NativeAOT workflows.

---

## 10 — Referencing FNA in Your Game

The standard approach is a Git submodule:

```bash
# Add FNA as a submodule
git submodule add https://github.com/FNA-XNA/FNA.git lib/FNA

# Initialize and fetch
git submodule update --init --recursive
```

Then in your `.csproj`:

```xml
<ProjectReference Include="lib/FNA/FNA.Core.csproj" />
```

**Do not use NuGet packages claiming to be FNA** unless you've verified they are official. The canonical source is the FNA-XNA GitHub repository. Third-party NuGet packages (like `FNA.NET`) are community-maintained wrappers and may lag behind or diverge.

---

## 11 — Common Build Issues

**"SDL3 not found" at runtime:** FNA builds fine (it's managed code) but fails at runtime if fnalibs aren't in the output directory. Copy the correct platform binaries from `fnalibs.zip` to your build output:

```bash
# Copy native libs to output (Linux example)
cp lib/fnalibs/lib64/* bin/Debug/net8.0/
```

**"Unsafe code requires AllowUnsafeBlocks":** Your game's `.csproj` must set `<AllowUnsafeBlocks>true</AllowUnsafeBlocks>` if you reference FNA types that expose unsafe members.

**NativeAOT trim warnings:** If NativeAOT trims a type you need (common with `ContentTypeReader` reflection), add a `rd.xml` file preserving the types:

```xml
<Directives>
  <Application>
    <Assembly Name="MyGame" Dynamic="Required All" />
  </Application>
</Directives>
```

**Multiple FNA project references:** If your solution accidentally references both `FNA.Core.csproj` and `FNA.NetFramework.csproj`, you'll get duplicate type errors. Each game project should reference exactly one FNA project file.

---

## 12 — FNA vs MonoGame: Build System Differences

| Aspect | FNA | MonoGame |
|---|---|---|
| Distribution | Git submodule + project reference | NuGet packages |
| Project files | Single .csproj per .NET target | Platform-specific templates |
| Platform defines | None — same code everywhere | `DESKTOPGL`, `WINDOWS`, `ANDROID`, etc. |
| Content pipeline | External (MGCB or raw) | Integrated MGCB Editor |
| Native libraries | Manual fnalibs.zip | Bundled in NuGet |
| Build customization | `FNA.Settings.props` | MSBuild props in NuGet |

FNA's approach trades convenience (no one-click NuGet install) for control (you own the exact FNA commit, build system is transparent, no platform-specific project files). MonoGame's approach is more turnkey but introduces platform-specific project fragmentation.
