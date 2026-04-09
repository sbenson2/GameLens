# G02 — NativeAOT Publishing with FNA

> **Category:** Guide · **Engine:** FNA · **Related:** [G01 Getting Started](./G01_getting_started.md) · [FNA Architecture Rules](../fna-arch-rules.md)

A comprehensive guide to ahead-of-time (AOT) compilation and deployment of FNA games using .NET NativeAOT. This guide covers what NativeAOT is, why you'd use it, project configuration, native library linking, code compatibility, platform-specific build procedures, and common deployment scenarios. NativeAOT produces single native executables with no .NET runtime dependency—essential for console ports, minimal deployment footprints, and predictable startup performance.

---

## Table of Contents

1. [What is NativeAOT?](#1--what-is-nativeaot)
2. [Prerequisites](#2--prerequisites)
3. [Project Configuration](#3--project-configuration)
4. [Native Library Linking](#4--native-library-linking)
5. [Code Compatibility](#5--code-compatibility)
6. [Building for Each Platform](#6--building-for-each-platform)
7. [SDL3 Integration Notes](#7--sdl3-integration-notes)
8. [Trimming and Size Optimization](#8--trimming-and-size-optimization)
9. [Console Deployment](#9--console-deployment)
10. [Common Issues and Troubleshooting](#10--common-issues-and-troubleshooting)

---

## 1 — What is NativeAOT?

NativeAOT (Native Ahead-of-Time) is a publishing mode that compiles C# code directly to native machine code at build time, eliminating the need for the .NET runtime to be present on the target machine. Unlike JIT (Just-in-Time) compilation, where the runtime compiles code at runtime, NativeAOT produces a single binary that contains everything needed to run your game.

### Benefits of NativeAOT

| Benefit | Impact |
|---------|--------|
| **No Runtime Dependency** | Your game binary runs anywhere—no .NET installation required |
| **Smaller Deployment** | Single executable instead of runtime + assemblies; typically 40-80% smaller |
| **Faster Startup** | Code is already compiled; no JIT warmup overhead |
| **Better Predictability** | No JIT pauses or garbage collection stutters during gameplay |
| **Console Support** | Mandatory for Nintendo Switch, PlayStation, Xbox, and Steam Deck |

### Trade-offs

NativeAOT requires discipline in your codebase. Anything that relies on runtime reflection or dynamic code generation will not work:

- No `Type.GetType()` with arbitrary type names
- No `Activator.CreateInstance()` without metadata hints
- No dynamic assembly loading or `Emit` IL generation
- No `TypeConverter` or complex type inference

These restrictions are **intentional**—they force the compiler to see all types at build time, which is why the binary can be standalone.

---

## 2 — Prerequisites

To publish FNA games with NativeAOT, you need:

| Tool | Version | Notes |
|------|---------|-------|
| .NET SDK | 8.0+ | LTS recommended; .NET 9 also works |
| Platform Compiler | varies | `clang` (Linux), `msvc` (Windows), `clang` (macOS) |
| Native Tools | varies | Build-essentials on Linux; MSVC on Windows; Xcode on macOS |
| FNA Source | Latest | Must build against `FNA.Core.csproj`, not `FNA.csproj` |

### Platform-Specific Build Tools

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get install build-essential clang lld
```

**Windows:**
- Install Visual Studio 2022 with C++ workload (or standalone MSVC)
- Or install Build Tools for Visual Studio

**macOS:**
- Install Xcode Command Line Tools: `xcode-select --install`
- Ensure clang is in `$PATH`: `which clang`

### Checking Your Setup

```bash
# Verify .NET SDK version
dotnet --version

# Verify native compiler (platform-specific)
clang --version        # Linux/macOS
cl.exe                 # Windows (MSVC)
```

---

## 3 — Project Configuration

NativeAOT requires FNA.Core, a special build target for AOT-safe code. Configure your `.csproj` as follows:

```xml
<Project Sdk="Microsoft.NET.Sdk">

  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <RootNamespace>MyFNAGame</RootNamespace>
    <AssemblyName>MyFNAGame</AssemblyName>
    
    <!-- Required for NativeAOT -->
    <PublishAot>true</PublishAot>
    
    <!-- Needed because FNA uses unsafe code -->
    <AllowUnsafeBlocks>true</AllowUnsafeBlocks>
    
    <!-- Optional: trim unused libraries to reduce binary size -->
    <TrimMode>link</TrimMode>
    
    <!-- Optional: language features for modern C# -->
    <LangVersion>latest</LangVersion>
  </PropertyGroup>

  <!-- Reference FNA.Core (not FNA.csproj) for NativeAOT -->
  <ItemGroup>
    <ProjectReference Include="../../lib/FNA/FNA.Core.csproj" />
  </ItemGroup>

  <!-- Native library declarations for AOT linking -->
  <ItemGroup>
    <NativeLibrary Include="SDL3" />
    <NativeLibrary Include="FNA3D" />
    <NativeLibrary Include="FAudio" />
    <NativeLibrary Include="Theorafile" />
    <DirectPInvoke Include="SDL3" />
    <DirectPInvoke Include="FNA3D" />
    <DirectPInvoke Include="FAudio" />
    <DirectPInvoke Include="Theorafile" />
  </ItemGroup>

  <!-- fnalibs copy targets: copy platform-specific binaries for runtime -->
  <ItemGroup Condition="'$(RuntimeIdentifier)' == 'linux-x64' Or ('$(RuntimeIdentifier)' == '' And $([MSBuild]::IsOSPlatform('Linux')))">
    <Content Include="../../lib/fnalibs/lib64/*" CopyToOutputDirectory="PreserveNewest" Link="%(Filename)%(Extension)" />
  </ItemGroup>
  <ItemGroup Condition="'$(RuntimeIdentifier)' == 'osx-x64' Or '$(RuntimeIdentifier)' == 'osx-arm64' Or ('$(RuntimeIdentifier)' == '' And $([MSBuild]::IsOSPlatform('OSX')))">
    <Content Include="../../lib/fnalibs/osx/*" CopyToOutputDirectory="PreserveNewest" Link="%(Filename)%(Extension)" />
  </ItemGroup>
  <ItemGroup Condition="'$(RuntimeIdentifier)' == 'win-x64' Or ('$(RuntimeIdentifier)' == '' And $([MSBuild]::IsOSPlatform('Windows')))">
    <Content Include="../../lib/fnalibs/x64/*" CopyToOutputDirectory="PreserveNewest" Link="%(Filename)%(Extension)" />
  </ItemGroup>

  <!-- Game content (textures, audio, etc.) -->
  <ItemGroup>
    <Content Include="Content/**/*" CopyToOutputDirectory="PreserveNewest" Link="Content/%(RecursiveDir)%(Filename)%(Extension)" />
  </ItemGroup>

</Project>
```

### Why FNA.Core?

`FNA.Core.csproj` is FNA's AOT-safe subset. It:
- Removes all reflection-heavy code
- Pre-defines all interop signatures
- Optimizes for minimal runtime overhead
- Requires explicit P/Invoke declarations (see Native Library Linking, below)

**Using `FNA.csproj` with `PublishAot=true` will fail.** Always reference `FNA.Core.csproj` for NativeAOT builds.

### Runtime Descriptor (rd.xml)

For types that use reflection at runtime, you may need to annotate them in a runtime descriptor file. Create `rd.xml` in your project root:

```xml
<Directives xmlns="http://schemas.microsoft.com/netfx/2013/01/metadata">
  <Application>
    <!-- Preserve reflection metadata for game types -->
    <Namespace Name="MyFNAGame" Serialize="Required All" />
    
    <!-- Preserve specific types if needed -->
    <Type Name="MyFNAGame.GameState" Browse="Required" Serialize="Required" />
  </Application>
</Directives>
```

Then reference it in your `.csproj`:

```xml
<ItemGroup>
  <RdXmlFile Include="rd.xml" />
</ItemGroup>
```

Most game code doesn't need `rd.xml`. Use it only if you encounter "metadata for type X is not available" errors during publish.

---

## 4 — Native Library Linking

NativeAOT compiles P/Invoke declarations at build time and links against native libraries statically or dynamically. Declare all native libraries explicitly in your project file.

### Declaring NativeLibrary Items

In your `.csproj`, declare which libraries to link:

```xml
<ItemGroup>
  <!-- SDL3: windowing, input, platform abstraction -->
  <NativeLibrary Include="SDL3" />
  
  <!-- FNA3D: graphics rendering -->
  <NativeLibrary Include="FNA3D" />
  
  <!-- FAudio: audio playback -->
  <NativeLibrary Include="FAudio" />
  
  <!-- Theorafile: Ogg Theora video decoding -->
  <NativeLibrary Include="Theorafile" />
</ItemGroup>
```

### DirectPInvoke for Direct Loading

`<DirectPInvoke>` tells the AOT compiler to load these libraries directly by name at runtime (not through managed wrappers):

```xml
<ItemGroup>
  <DirectPInvoke Include="SDL3" />
  <DirectPInvoke Include="FNA3D" />
  <DirectPInvoke Include="FAudio" />
  <DirectPInvoke Include="Theorafile" />
</ItemGroup>
```

### Platform-Specific Linking

You can vary library names and locations by platform:

```xml
<!-- Linux: link against .so files in standard locations -->
<ItemGroup Condition="'$(RuntimeIdentifier)' == 'linux-x64'">
  <NativeLibrary Include="SDL3" />
  <NativeLibrary Include="FNA3D" />
  <NativeLibrary Include="FAudio" />
</ItemGroup>

<!-- Windows: link against .lib import libraries -->
<ItemGroup Condition="'$(RuntimeIdentifier)' == 'win-x64'">
  <NativeLibrary Include="SDL3.lib" />
  <NativeLibrary Include="FNA3D.lib" />
  <NativeLibrary Include="FAudio.lib" />
</ItemGroup>

<!-- macOS: link against .dylib with framework support -->
<ItemGroup Condition="'$(RuntimeIdentifier)' == 'osx-x64' Or '$(RuntimeIdentifier)' == 'osx-arm64'">
  <NativeLibrary Include="SDL3" />
  <NativeLibrary Include="FNA3D" />
  <NativeLibrary Include="FAudio" />
</ItemGroup>
```

### Why Explicit Linking?

NativeAOT needs to know at compile time which functions are being called and which libraries define them. The compiler uses this metadata to:
- Verify all P/Invoke signatures exist
- Generate optimized calling stubs
- Eliminate unused library code when possible
- Create a predictable binary layout

This is more work upfront but results in **faster, smaller, more reliable executables** compared to runtime `dlopen()`.

---

## 5 — Code Compatibility

Not all C# code is compatible with NativeAOT. Here's what works, what doesn't, and how to fix it.

### Incompatible Patterns

**Pattern: Reflection on arbitrary types**
```csharp
// This will NOT work with NativeAOT
var type = Type.GetType("MyFNAGame.PlayerController");
var instance = Activator.CreateInstance(type);
```

**Fix: Static factory pattern**
```csharp
// This WILL work — no reflection, no metadata needed
public static PlayerController Create() => new PlayerController();

var instance = Create();
```

**Pattern: Dynamic IL emission**
```csharp
// This will NOT work with NativeAOT
var method = new DynamicMethod("GenerateCode", typeof(int), Type.EmptyTypes);
var il = method.GetILGenerator();
il.Emit(OpCodes.Ldc_I4, 42);
il.Emit(OpCodes.Ret);
var func = (Func<int>)method.CreateDelegate(typeof(Func<int>));
```

**Fix: Use a real method**
```csharp
// This WILL work
public static int GenerateCode() => 42;
var func = GenerateCode;
```

**Pattern: TypeConverter or type inference**
```csharp
// This may NOT work with NativeAOT
var converter = TypeDescriptor.GetConverter(typeof(Vector2));
var vector = (Vector2)converter.ConvertFromString("1.0, 2.0");
```

**Fix: Manual parsing**
```csharp
// This WILL work
public static Vector2 Parse(string input)
{
    var parts = input.Split(',');
    return new Vector2(float.Parse(parts[0]), float.Parse(parts[1]));
}

var vector = Vector2.Parse("1.0, 2.0");
```

### Best Practices for NativeAOT-Safe Code

1. **Prefer static constructors** — They run at compile time in AOT and initialize singleton state.
2. **Use factory methods** — Static methods that return instances beat reflection every time.
3. **Avoid generics with open parameters** — `List<T>` is fine; dynamic `T` inference is not.
4. **Keep serialization simple** — Use `JsonSerializer` or hand-rolled parsing, not `BinaryFormatter`.
5. **Pre-register P/Invoke stubs** — Declare all external functions in a single static class so the AOT compiler sees them.

### Checking for NativeAOT Warnings

The compiler emits warnings for unsafe patterns:

```bash
dotnet publish -c Release -r linux-x64 /p:PublishAot=true --no-restore
```

Look for warnings like:
- `warning IL3050: The following types or members were not AOT-analyzable`
- `warning IL3051: An instance of type 'T' could not be used as a parameter of type 'U' in the generic type or method`

Address these before shipping. Some warnings are benign; others indicate code that will crash at runtime.

---

## 6 — Building for Each Platform

NativeAOT produces platform-specific binaries. You must build separately for each target platform.

### Linux (x86_64)

```bash
# Install build dependencies (if not already done)
sudo apt-get install build-essential clang lld

# Navigate to project root
cd MyFNAGame

# Publish for Linux x64
dotnet publish -c Release -r linux-x64 /p:PublishAot=true --no-restore

# Output: bin/Release/net8.0/linux-x64/publish/MyFNAGame
# This is a single native executable
```

**Verify the binary:**
```bash
file bin/Release/net8.0/linux-x64/publish/MyFNAGame
# Output: ELF 64-bit LSB executable, x86-64, ...

# Run it
./bin/Release/net8.0/linux-x64/publish/MyFNAGame
```

### Windows (x86_64)

```bash
# Windows build requires MSVC (included with Visual Studio or Build Tools)
# Native tools must be in PATH; Visual Studio opens them automatically

cd MyFNAGame

# Publish for Windows x64
dotnet publish -c Release -r win-x64 /p:PublishAot=true --no-restore

# Output: bin\Release\net8.0\win-x64\publish\MyFNAGame.exe
```

**To build from command line without Visual Studio IDE open:**
```bash
# Open Visual Studio Developer Command Prompt, then:
cd MyFNAGame
dotnet publish -c Release -r win-x64 /p:PublishAot=true --no-restore
```

**Verify the binary:**
```cmd
:: Windows
dir bin\Release\net8.0\win-x64\publish\MyFNAGame.exe

:: Run it
bin\Release\net8.0\win-x64\publish\MyFNAGame.exe
```

### macOS (Universal / Apple Silicon + Intel)

```bash
# Requires Xcode or Command Line Tools
# xcode-select --install

cd MyFNAGame

# Build for ARM64 (Apple Silicon)
dotnet publish -c Release -r osx-arm64 /p:PublishAot=true --no-restore

# Build for x86_64 (Intel)
dotnet publish -c Release -r osx-x64 /p:PublishAot=true --no-restore

# Create universal binary (requires lipo)
lipo -create \
  bin/Release/net8.0/osx-arm64/publish/MyFNAGame \
  bin/Release/net8.0/osx-x64/publish/MyFNAGame \
  -output MyFNAGame.universal
```

**For app distribution, create an .app bundle:**
```bash
mkdir -p MyFNAGame.app/Contents/MacOS
mkdir -p MyFNAGame.app/Contents/Resources

cp MyFNAGame.universal MyFNAGame.app/Contents/MacOS/MyFNAGame
cp Info.plist MyFNAGame.app/Contents/  # See next section
cp -r Content MyFNAGame.app/Contents/Resources/
```

**Minimum Info.plist:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key>
  <string>MyFNAGame</string>
  <key>CFBundleIdentifier</key>
  <string>com.example.myfnagame</string>
  <key>CFBundleVersion</key>
  <string>1.0.0</string>
  <key>CFBundleExecutable</key>
  <string>MyFNAGame</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
</dict>
</plist>
```

**Code signing (for distribution):**
```bash
# Sign the bundle with your Developer ID
codesign -s "Developer ID Application: Your Name (XXX)" \
  --timestamp --entitlements Entitlements.plist \
  MyFNAGame.app

# Verify signature
codesign -vv MyFNAGame.app
```

---

## 7 — SDL3 Integration Notes

FNA NativeAOT uses **SDL3** (not SDL2) for windowing, input, and platform abstraction. SDL3 is designed with AOT in mind and provides better console support.

### What Changed from SDL2

| Aspect | SDL2 | SDL3 |
|--------|------|------|
| **Entry Point** | Implicit via `Game.Run()` | Explicit `SDL_RunApp` callback |
| **Input Events** | Poll-based (preferred in games) | Event queue or callbacks |
| **GPU APIs** | Fixed to driver + fallback | Explicit selection at startup |
| **Platforms** | Desktop-focused | Desktop + console-focused |

### SDL3 P/Invoke Declarations

FNA.Core pre-declares all SDL3 functions. You interact through FNA's `Game` class, not directly:

```csharp
// You write this (unchanged from XNA/MonoGame)
using Microsoft.Xna.Framework;

public class MyGame : Game
{
    protected override void Update(GameTime gameTime)
    {
        var keyState = Keyboard.GetState();  // FNA polls SDL3 internally
        if (keyState.IsKeyDown(Keys.Escape))
            Exit();
    }
}
```

FNA handles SDL3 initialization, event polling, and cleanup. You don't call SDL3 functions directly.

### Platform Quirks

**Consoles (Nintendo Switch, PlayStation, Xbox):**
SDL3 requires an explicit `SDL_RunApp` entry point. FNA abstracts this; your `Main()` calls `game.Run()` as normal. Console-specific details are handled by the console SDK.

**Desktop with Wayland (Linux):**
SDL3 is Wayland-native. If you encounter issues:
```bash
SDL_VIDEODRIVER=x11 ./MyFNAGame  # Fall back to X11
```

---

## 8 — Trimming and Size Optimization

NativeAOT automatically removes unused code. You can tune this further to reduce binary size.

### Trimming Configuration

```xml
<PropertyGroup>
  <!-- link: remove unused types and members -->
  <TrimMode>link</TrimMode>
  
  <!-- Don't trim warnings unless you're sure the code is unused -->
  <SuppressTrimAnalysisWarnings>false</SuppressTrimAnalysisWarnings>
  
  <!-- Optional: disable globalization to save space -->
  <InvariantGlobalization>false</InvariantGlobalization>
  <!-- Set to true only if your game doesn't use non-ASCII text -->
</PropertyGroup>
```

### Typical Binary Sizes

After NativeAOT publishing (Release mode, Linux x64):

| Configuration | Size | Notes |
|---------------|------|-------|
| Default | ~15–25 MB | With SDL3, FNA3D, FAudio, debug info |
| Trimmed + stripped | ~8–12 MB | Remove debug symbols: `strip MyFNAGame` |
| Trimmed + UPX | ~4–6 MB | Ultra-high compression (startup cost) |

**Strip debug info to reduce size:**
```bash
strip -s bin/Release/net8.0/linux-x64/publish/MyFNAGame
```

### Analyzing Trim Warnings

If the trimmer warns that a type is missing metadata, you have two options:

1. **Preserve it** — Add to `rd.xml` if it's truly needed at runtime
2. **Remove it** — If the warning is from unused code, suppress it:

```csharp
[System.Diagnostics.CodeAnalysis.DynamicallyAccessedMembers(...)]
public class MyClass { }
```

---

## 9 — Console Deployment

All console builds (Nintendo Switch, PlayStation, Xbox) **mandate NativeAOT**. There is no JIT option on consoles.

### Console Workflow

1. **Develop locally** with standard JIT (debug mode faster iteration)
2. **Publish with NativeAOT** for console SDK targets
3. **Console SDK** provides its own `RuntimeIdentifier` (e.g., `switch`, `ps5`)
4. **Link against console-specific fnalibs** — provided by the console SDK

### Example: Nintendo Switch

```bash
# Console SDK installed at ~/switch-sdk
# Set environment variables per console SDK documentation

dotnet publish -c Release -r switch /p:PublishAot=true

# Output goes to console SDK's deployment tools
```

**You cannot ship console ports without NativeAOT.** The console SDKs don't include the .NET runtime—NativeAOT is the only execution model.

See Appendix C (FNA on Consoles) in the FNA Architecture Rules for details.

---

## 10 — Common Issues and Troubleshooting

### "error: native compiler error when compiling"

The native compiler (clang/MSVC) failed. Check the full error output:

```bash
dotnet publish -c Release -r linux-x64 /p:PublishAot=true --no-restore 2>&1 | tee build.log
```

Common causes:
- Missing build tools (`apt install build-essential`)
- Incompatible C# code (reflection, dynamic IL)
- Missing `rd.xml` for complex types

### "error: metadata for type 'X' is not available"

A type is being accessed via reflection at runtime, but its metadata wasn't preserved at compile time.

**Fix:**
```xml
<!-- In rd.xml -->
<Type Name="MyFNAGame.PlayerController" Browse="Required" Serialize="Required" />
```

Or refactor to avoid reflection.

### "DllNotFoundException: SDL3"

Native libraries aren't in the executable's directory or `LD_LIBRARY_PATH` (Linux) / `DYLD_LIBRARY_PATH` (macOS) / system path (Windows).

**Fix:**
1. Verify fnalibs were copied to publish output: `ls bin/Release/net8.0/linux-x64/publish/`
2. Ensure `.csproj` has `<Content>` items for fnalibs
3. Run with debug: `SDL_DEBUG=3 ./MyFNAGame` to see where it's searching

### "warning IL3050: The following types or members were not AOT-analyzable"

The compiler couldn't prove a type is safe for AOT. Usually harmless if the type isn't actually called at runtime.

**Options:**
- Ignore if the warning is in unused code
- Fix the code to avoid reflection
- Suppress with `[DynamicallyAccessedMembers(...)]` attribute

### Binary size is unexpectedly large

NativeAOT includes all referenced code. Trim aggressively:

```bash
# Check what's in the binary
objdump -t bin/Release/net8.0/linux-x64/publish/MyFNAGame | grep -i "symbol" | wc -l

# Strip all symbols
strip -s bin/Release/net8.0/linux-x64/publish/MyFNAGame

# Verify new size
ls -lh bin/Release/net8.0/linux-x64/publish/MyFNAGame
```

### "No suitable build tools found"

The native compiler isn't in `$PATH`. Verify and add it:

**Linux:**
```bash
which clang
# If not found: sudo apt-get install clang
```

**Windows:**
```cmd
where cl.exe
:: If not found, open "Visual Studio Developer Command Prompt"
```

**macOS:**
```bash
which clang
# If not found: xcode-select --install
```

---

## Next Steps

With NativeAOT publishing working:

- **Optimize further** — Measure binary size, profile startup time, benchmark against JIT builds
- **Automate builds** — Set up CI/CD (GitHub Actions, GitLab CI) to publish for all platforms
- **Console targets** — If pursuing console ports, follow the console SDK documentation for NativeAOT specifics
- **Distribution** — Sign and notarize macOS builds; create Windows installers with innosetup or NSIS

For more on FNA architecture and best practices, see the [FNA Architecture Rules](../fna-arch-rules.md).
