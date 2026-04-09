# G12 — Real-World SDL_GPU Deployment: Lessons from Terraria & Production Games

> **Category:** guide · **Engine:** FNA · **Related:** [G03 SDL3 GPU API](./G03_sdl3_gpu_api.md) · [G09 FNA3D SDL_GPU Migration](./G09_fna3d_sdl_gpu_migration.md) · [G08 Cross-Platform Deployment](./G08_cross_platform_deployment.md) · [G10 Debugging & Profiling](./G10_debugging_profiling_performance.md)

Practical lessons from deploying FNA games with SDL_GPU in production, drawn from Terraria 1.4.5's transition and community experience. Covers Intel GPU compatibility issues, driver blocklisting, backend fallback strategies, platform-specific pitfalls on Linux/macOS/Steam Deck, and defensive patterns for shipping SDL_GPU-based games to millions of players. If you've read G09 (the migration guide) and are preparing to ship, this is your deployment checklist.

---

## Background: SDL_GPU in the Wild

As of Terraria 1.4.5 (2025), all Linux and macOS Terraria players run on FNA with SDL_GPU as the primary rendering backend. This makes Terraria the largest real-world deployment of SDL_GPU through FNA — millions of installs across wildly different hardware configurations.

The transition surfaced compatibility issues that affect any FNA game shipping with SDL_GPU. Understanding these issues before your players hit them saves you support tickets and negative reviews.

---

## Intel GPU Compatibility

The most significant production issue is **Intel integrated graphics on pre-Broadwell architectures** (Haswell and earlier, roughly pre-2015 hardware). These GPUs have incomplete Vulkan support through Mesa's `hasvk` driver, and SDL_GPU's Vulkan backend can crash on them.

### The Problem

SDL_GPU selects a rendering backend (Vulkan, D3D12, Metal) at initialization. On Linux, Vulkan is typically preferred. Intel Haswell-era GPUs expose a Vulkan driver (`hasvk`) through Mesa, but it's incomplete — missing extensions, incorrect behavior for some operations, and prone to crashes during swapchain operations and resolution changes.

The crash pattern:

```
# Typical crash stack on Intel Haswell + Mesa 25.x
libSDL3.so → SDL_GPU_CreateDevice → vkCreateSwapchainKHR → SEGFAULT
# Or during gameplay:
libFNA3D.so → FNA3D_SwapBuffers → vkAcquireNextImageKHR → SEGFAULT
```

### Detection and Workarounds

**1. Environment Variable Backend Override**

The simplest user-facing workaround is forcing a different backend:

```bash
# Force OpenGL instead of Vulkan (Linux)
export SDL_GPU_DRIVER=opengl
./MyGame

# Or disable Vulkan entirely for SDL
export SDL_VULKAN_LIBRARY=

# On Windows, force D3D11 through FNA3D
export FNA3D_FORCE_DRIVER=D3D11
```

Ship a `launch_opengl.sh` alongside your Linux build for users who hit Vulkan issues.

**2. Programmatic Backend Detection**

Check GPU info at startup and fall back gracefully:

```csharp
public static class GpuCompat
{
    /// <summary>
    /// Check if the current GPU is known-problematic for Vulkan.
    /// Call before creating GraphicsDevice if possible.
    /// </summary>
    public static bool ShouldAvoidVulkan()
    {
        // Check for known-bad Intel generations via environment
        // SDL exposes GPU info after device creation, so for pre-creation
        // checks we rely on environment hints or OS-level detection.
        string gpuInfo = Environment.GetEnvironmentVariable("MESA_GL_VERSION_OVERRIDE");
        
        // More reliable: check lspci output on Linux
        if (OperatingSystem.IsLinux())
        {
            return IsPreBroadwellIntel();
        }
        return false;
    }

    private static bool IsPreBroadwellIntel()
    {
        try
        {
            // Parse /proc/driver/nvidia or lspci for Intel GPU generation
            // Haswell PCI device IDs: 0x0400-0x04FF range
            var pciDevices = File.ReadAllText("/proc/bus/pci/devices");
            // Implementation depends on your detection needs
            return false; // Conservative default
        }
        catch
        {
            return false;
        }
    }
}
```

**3. SDL's Built-in Driver Skipping**

SDL3 is actively working on skipping `hasvk` drivers automatically (see [SDL issue #14915](https://github.com/libsdl-org/SDL/issues/14915)). Future SDL3 versions may handle this transparently. In the meantime, you can set:

```bash
# Tell SDL to skip incomplete Vulkan drivers
export SDL_VULKAN_DRIVER=0  # Disable Vulkan, fall back to OpenGL
```

---

## Backend Fallback Strategy

A robust FNA game should handle backend initialization failure gracefully rather than crashing to desktop.

### Defensive Initialization Pattern

```csharp
public class RobustGame : Game
{
    private static readonly string[] BackendOrder = { "Vulkan", "D3D11", "OpenGL" };
    
    protected override void Initialize()
    {
        // Log the active backend for support/debugging
        string backend = Environment.GetEnvironmentVariable("FNA3D_FORCE_DRIVER") 
                         ?? "auto";
        Console.WriteLine($"[GPU] Backend: {backend}");
        Console.WriteLine($"[GPU] Adapter: {GraphicsDevice.Adapter.Description}");
        
        base.Initialize();
    }
}

// In Program.cs — wrap game creation with fallback
static void Main(string[] args)
{
    // Parse --force-opengl or --force-d3d11 from command line
    if (args.Contains("--force-opengl"))
    {
        Environment.SetEnvironmentVariable("FNA3D_FORCE_DRIVER", "OpenGL");
    }

    try
    {
        using var game = new MyGame();
        game.Run();
    }
    catch (Exception ex) when (IsGpuInitFailure(ex))
    {
        Console.Error.WriteLine($"[GPU] Primary backend failed: {ex.Message}");
        Console.Error.WriteLine("[GPU] Retrying with OpenGL backend...");
        
        Environment.SetEnvironmentVariable("FNA3D_FORCE_DRIVER", "OpenGL");
        try
        {
            using var game = new MyGame();
            game.Run();
        }
        catch (Exception fallbackEx)
        {
            Console.Error.WriteLine($"[GPU] All backends failed: {fallbackEx.Message}");
            ShowErrorDialog("Graphics initialization failed. Please update your GPU drivers.");
            Environment.Exit(1);
        }
    }
}

static bool IsGpuInitFailure(Exception ex)
{
    // FNA3D throws specific exceptions on backend init failure
    return ex.Message.Contains("FNA3D") 
        || ex.Message.Contains("GraphicsDevice")
        || ex is InvalidOperationException;
}
```

---

## Linux-Specific Deployment Issues

### Mesa Driver Versions

Mesa 25.x introduced regressions for some Intel GPUs that didn't exist in Mesa 24.x. Terraria's tModLoader community documented crashes specific to:

- Intel UHD Graphics (Haswell) + Mesa 25.0
- Resolution changes during gameplay
- Fullscreen ↔ windowed transitions

**Recommendation:** Test on both Mesa 24.x (Ubuntu 24.04 LTS default) and Mesa 25.x (rolling release distros like Arch, Fedora). Resolution switching is the highest-risk operation.

### Steam Runtime vs. Native Libraries

FNA ships its own SDL3 and FNA3D native libraries. On Steam, these interact with the Steam Runtime (a container of blessed library versions). Common issues:

```bash
# If your bundled SDL3 conflicts with Steam Runtime:
# Option 1: Use LD_PRELOAD to force your bundled version
export LD_PRELOAD="./lib64/libSDL3.so.0"

# Option 2: Set library path explicitly
export LD_LIBRARY_PATH="./lib64:$LD_LIBRARY_PATH"
```

### Steam Deck

The Steam Deck uses AMD RDNA2 graphics with Mesa's RADV Vulkan driver — this is well-tested and stable with SDL_GPU. Steam Deck is generally the *safest* Linux target for Vulkan-based FNA games.

Test the Deck-specific scenario of switching between docked (external display) and handheld mode, which triggers resolution and display output changes.

---

## macOS Deployment Notes

On macOS, SDL_GPU uses the **Metal** backend (Vulkan is not natively available). FNA3D translates XNA graphics calls through SDL_GPU → Metal. Key considerations:

- **MoltenVK is not used** — SDL_GPU's Metal backend is native, not a Vulkan translation layer
- **macOS 13+ required** — for full Metal feature set that SDL_GPU expects
- **Apple Silicon** — runs natively if your .NET build targets `osx-arm64`; Rosetta 2 works but adds overhead
- **Notarization** — your bundled native libraries (SDL3, FNA3D) must be signed for Gatekeeper

---

## Windows Deployment Notes

Windows is the most straightforward deployment target:

- SDL_GPU prefers **D3D12** on Windows, with **Vulkan** and **D3D11** as fallbacks
- D3D12 requires Windows 10 1607+ (virtually all gaming PCs)
- Intel integrated graphics on Windows use Intel's own drivers (not Mesa) — generally more stable than Linux Mesa for Vulkan

The main Windows-specific issue is **outdated Intel drivers** on OEM laptops where users haven't updated since purchase. Include a "please update your graphics drivers" message in your crash handler.

---

## Deployment Checklist

Before shipping an FNA game with SDL_GPU:

| Check | Details |
|-------|---------|
| **Backend fallback** | Game recovers if primary GPU backend fails |
| **Command-line override** | Ship `--force-opengl` / `--force-d3d11` flags |
| **Linux launch scripts** | Include `launch_opengl.sh` for Vulkan-problem users |
| **Intel pre-Broadwell** | Test on Haswell-era Intel or document minimum GPU |
| **Resolution switching** | Test windowed ↔ fullscreen on all platforms |
| **Steam Deck** | Test docked ↔ handheld transitions |
| **macOS notarization** | Sign all bundled `.dylib` files |
| **Crash reporting** | Log GPU adapter, driver version, and backend on startup |
| **Steam Runtime** | Verify bundled SDL3 loads correctly under Steam Linux Runtime |
| **Driver version logging** | Print adapter info at startup for support tickets |

---

## Updating FNA + Native Libraries

Ethan Lee maintains an [FNA update script](https://gist.github.com/flibitijibibo/f06e3f60eb66e5462da824e490229591) that pulls the latest FNA, FNA3D, and SDL3 builds. Run this before each release to pick up driver compatibility fixes:

```bash
# Download and run the FNA update script
curl -O https://gist.githubusercontent.com/flibitijibibo/f06e3f60eb66e5462da824e490229591/raw/update_fna.sh
chmod +x update_fna.sh
./update_fna.sh /path/to/your/game
```

SDL_GPU compatibility fixes land frequently — staying current with native libraries is the single most effective way to reduce GPU-related support tickets.
