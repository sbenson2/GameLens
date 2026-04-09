# G23 — Console Porting with NativeAOT

> **Category:** guide · **Engine:** FNA · **Related:** [G02 NativeAOT Publishing](./G02_nativeaot_publishing.md) · [G08 Cross-Platform Deployment](./G08_cross_platform_deployment.md) · [G22 Platform Backend Architecture](./G22_platform_backend_architecture.md) · [FNA Architecture Rules](../fna-arch-rules.md)

How FNA ships to Xbox, PlayStation 5, and Nintendo Switch using NativeAOT — the architecture that keeps all platform code in SDL and the NativeAOT bootstrap, with zero private framework branches. Covers the Xbox GDK public workflow, general console porting strategy, NDA boundaries, and compatibility considerations vs MonoGame's console story.

---

## Architecture: No Private Branches

FNA's console strategy is fundamentally different from MonoGame's. FNA does **not** maintain private branches for each console platform. The public `master` branch is exactly what ships on consoles. All platform-specific code lives in two separate projects:

```
┌─────────────────────────────────────┐
│         Your FNA Game               │
│   (identical code, all platforms)   │
├─────────────────────────────────────┤
│         FNA (public master)         │
├──────────┬──────────┬───────────────┤
│  FNA3D   │  FAudio  │ Theorafile    │
│ (public) │ (public) │ (public)      │
├──────────┴──────────┴───────────────┤
│    SDL3 (platform-specific port)    │
│    NativeAOT bootstrap (platform)  │
└─────────────────────────────────────┘
```

The SDL3 port and NativeAOT bootstrap are the only components that differ per console. Your game code, FNA itself, FNA3D, FAudio, and Theorafile are identical across all targets.

## Why NativeAOT for Consoles

Console platforms require native executables — they cannot run the .NET runtime or JIT compiler. NativeAOT compiles your C# game ahead-of-time into a single native binary:

- **No .NET runtime dependency** — the binary is self-contained
- **Predictable startup time** — no JIT warmup
- **Smaller memory footprint** — no runtime metadata overhead
- **Console certification friendly** — behaves like any native C/C++ game

NativeAOT was introduced in .NET 8 and is the production toolchain for FNA console ports, replacing the earlier BRUTE runtime. The first NativeAOT-based FNA Switch title has already passed certification.

## Xbox: Public GDK Workflow

Xbox is the most accessible console target because FNA's GDK support is **100% public source code**.

### Prerequisites

1. **Microsoft GDK Agreement** — Sign up through the ID@Xbox program
2. **Xbox GDK** — Install the Game Development Kit from Microsoft
3. **NativeAOT-Xbox repository** — Clone from `FNA-XNA/NativeAOT-Xbox` on GitHub
4. **Discord access** — Join both the FNA and ID@Xbox Discord servers, then request access to the `#xbox` channel

### Build Flow

```
Your Game (C#)
    │
    ▼
dotnet publish -c Release -r win-x64 /p:PublishAot=true
    │
    ▼
NativeAOT-Xbox bootstrap
    │  (links against GDK libraries)
    ▼
Xbox-compatible native executable
```

### Key Considerations

- The NativeAOT-Xbox repository is based on .NET 8.0.1 and will be updated for future .NET versions
- All fnalibs (SDL3, FNA3D, FAudio, Theorafile) must be compiled for the Xbox target
- Xbox uses Direct3D 12 through SDL_GPU — your FNA3D rendering code works unchanged
- GDK-specific features (achievements, save data, user management) require platform API calls outside FNA's scope

## PlayStation 5: SDL-PlayStation

PS5 support follows the same architecture — FNA public master plus platform-specific SDL and NativeAOT:

- **SDL-playstation** — The SDL3 port for PlayStation platforms (first draft completed as of 2025)
- **FAudio and Theorafile** — Already working on PlayStation targets
- **FNA3D** — PS5 graphics support via SDL_GPU (Vulkan-based on PlayStation)

### NDA Boundary

All PlayStation consulting and documentation is private per Sony NDA. If you are a licensed PlayStation developer:

1. Obtain access to SDL-playstation through the appropriate channels
2. Contact flibit on Discord for FNA-specific guidance
3. Your game code requires zero PlayStation-specific changes

## Nintendo Switch: NativeAOT + SDL

Switch support is production-proven — FNA titles have passed Nintendo certification using NativeAOT.

### Architecture

- 100% of platform code lives in SDL (SDL-switch) and the NativeAOT bootstrap
- No special FNA code needed for Switch
- Same build pipeline: `dotnet publish` with NativeAOT targeting the Switch runtime

### NDA Boundary

Like PlayStation, all Switch consulting and documentation is private per Nintendo NDA. Licensed developers should:

1. Get access to SDL-switch
2. Contact flibit on Discord for consulting

## Code Compatibility Checklist

NativeAOT imposes constraints on your C# code. These apply to all console targets:

### Must Avoid

| Pattern | Why | Alternative |
|---------|-----|-------------|
| `Assembly.Load()` / dynamic loading | No JIT available | Static references only |
| Unbounded `Reflection.Emit` | No code generation at runtime | Source generators or pre-generated code |
| Unattributed reflection | Trimmer removes unreferenced types | `[DynamicallyAccessedMembers]` attributes |
| COM Interop (Windows-only APIs) | Not available on consoles | Use SDL3 / platform APIs |

### Safe Patterns

- Standard generics (fully supported in NativeAOT)
- P/Invoke to native libraries (how FNA works internally)
- `System.Text.Json` with source generators
- Basic reflection on types that are statically referenced

### Testing for Compatibility

Before targeting consoles, validate your game builds with NativeAOT on PC:

```bash
# Test NativeAOT build on your development machine first
dotnet publish -c Release -r linux-x64 /p:PublishAot=true

# Enable trimming warnings to catch issues early
dotnet publish -c Release -r win-x64 /p:PublishAot=true /p:TrimmerSingleWarn=false
```

If the PC NativeAOT build runs correctly, the console build will almost certainly work — the FNA layer is identical.

## FNA vs MonoGame: Console Support Comparison

| Aspect | FNA | MonoGame |
|--------|-----|----------|
| **Xbox** | Public GDK + NativeAOT (shipping) | In progress (GDKX support evolving) |
| **PlayStation 5** | SDL-playstation + NativeAOT (in progress) | Community efforts, varies |
| **Nintendo Switch** | SDL-switch + NativeAOT (shipping, certified) | BRUTE→NativeAOT transition ongoing |
| **Architecture** | No private branches, all platform code in SDL | Platform-specific MonoGame branches |
| **Runtime** | NativeAOT (.NET 8+) | NativeAOT (transitioning from BRUTE) |
| **Mobile (iOS/Android)** | Not a target (use MonoGame) | Supported |

**Key takeaway:** FNA's console story is simpler architecturally (no framework forks), but MonoGame has broader platform ambitions including mobile. For desktop + console shipping, FNA's approach means your game code is truly identical everywhere.

## Workflow Summary

```
1. Develop and test on PC (desktop)
     │
2. Validate NativeAOT build on PC
     │  dotnet publish -c Release /p:PublishAot=true
     │
3. Fix any NativeAOT/trimming warnings
     │
4. Obtain console dev access (NDA agreements)
     │
5. Get platform-specific SDL port + NativeAOT bootstrap
     │
6. Build with console-targeted NativeAOT
     │
7. Test on devkit hardware
     │
8. Submit for certification
```

The critical insight: steps 1–3 use the **exact same FNA code** as steps 6–8. If your game works with NativeAOT on PC, the console port is a build configuration change, not a code change.
