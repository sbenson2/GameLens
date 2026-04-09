# G33 — Debugging & Diagnostics

> **Category:** Guide · **Engine:** Stride · **Related:** [Stride Architecture Rules](../stride-arch-rules.md), [G23 — Profiling & Performance](G23_profiling_performance.md)

Stride provides several layers of debugging support: an in-game profiler, integration with Visual Studio / Rider debuggers, Roslyn diagnostic analyzers for compile-time checks, and third-party GPU debuggers like RenderDoc. This guide covers the full debugging workflow from script breakpoints to GPU frame analysis.

---

## Table of Contents

1. [Script Debugging with IDE Breakpoints](#1--script-debugging-with-ide-breakpoints)
2. [Stride's Built-In Game Profiler](#2--strides-built-in-game-profiler)
3. [Logging System](#3--logging-system)
4. [Roslyn Diagnostic Analyzers](#4--roslyn-diagnostic-analyzers)
5. [GPU Debugging with RenderDoc](#5--gpu-debugging-with-renderdoc)
6. [Visual Studio Diagnostic Tools](#6--visual-studio-diagnostic-tools)
7. [Common Debugging Scenarios](#7--common-debugging-scenarios)
8. [Debugging Code-Only Projects](#8--debugging-code-only-projects)

---

## 1 — Script Debugging with IDE Breakpoints

Stride scripts are standard C# classes. You can debug them with any .NET debugger.

### Visual Studio

1. Open your game solution (`.sln`) in Visual Studio
2. Set breakpoints in any script (click the gutter or press **F9**)
3. Press **F5** to launch the game in debug mode (or use Game Studio's play button with the debugger attached)
4. When execution hits the breakpoint, inspect variables, call stack, and locals as normal

### Rider

1. Open the `.sln` in JetBrains Rider
2. Set breakpoints in scripts
3. Use **Run → Attach to Process** and select the running game process
4. Alternatively, launch the game project directly from Rider with debugging enabled

### VS Code

1. Install the C# Dev Kit extension
2. Open the game folder
3. Configure `launch.json` to target the Windows platform project:

```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "name": "Debug Stride Game",
            "type": "coreclr",
            "request": "launch",
            "program": "${workspaceFolder}/MyGame.Windows/bin/Debug/net10.0/MyGame.Windows.exe",
            "cwd": "${workspaceFolder}/MyGame.Windows"
        }
    ]
}
```

### Hot Reload

Stride Game Studio supports script hot-reload: edit a script in your IDE, save it, and Game Studio recompiles and reloads the script without restarting the game. This works for logic changes but not for structural changes (adding new components, changing serialized fields).

---

## 2 — Stride's Built-In Game Profiler

Stride includes a `GameProfiler` script component that renders real-time performance data as an overlay.

### Enabling the Profiler

**In Game Studio:**

1. Add the `GameProfiler` script to any entity in your scene
2. Run the game
3. Toggle the profiler at runtime with **Left Ctrl + Left Shift + P**

**In code (code-only projects):**

```csharp
using Stride.Profiling;

// The GameProfiler is a script — add it to an entity
var profilerEntity = new Entity("Profiler");
profilerEntity.Add(new GameProfiler());
rootScene.Entities.Add(profilerEntity);
```

### Profiler Display

The profiler overlay shows:

- **FPS** and frame time (ms)
- **Update time** — game logic cost per frame
- **Draw time** — rendering cost per frame
- **GPU time** — time the GPU spent on the frame
- Per-system breakdowns (physics, scripts, rendering sub-passes)
- **Memory** — managed heap size, GC collections

### Profiling Keys

Stride's profiling system uses `ProfilingKey` objects to tag sections of code:

```csharp
public class MySystem : SyncScript
{
    private static readonly ProfilingKey MyUpdateKey =
        new ProfilingKey("MySystem.Update");

    public override void Update()
    {
        using (Profiler.Begin(MyUpdateKey))
        {
            // Code measured by the profiler
            ProcessEnemies();
            UpdateSpawners();
        }
    }
}
```

Custom profiling keys appear in the profiler overlay alongside built-in keys, making it easy to identify which of your systems is expensive.

---

## 3 — Logging System

Stride provides a `Logger` accessible from any script via `this.Log`:

```csharp
public class PlayerController : SyncScript
{
    public override void Start()
    {
        Log.Info("PlayerController initialized");
        Log.Debug($"Player position: {Entity.Transform.Position}");
    }

    public override void Update()
    {
        if (Input.IsKeyPressed(Keys.Space))
        {
            Log.Warning("Jump requested but player is airborne");
        }
    }
}
```

### Log Levels

| Level | Method | Use Case |
|-------|--------|----------|
| Debug | `Log.Debug()` | Verbose data for development |
| Info | `Log.Info()` | Normal operational messages |
| Warning | `Log.Warning()` | Recoverable issues, unexpected states |
| Error | `Log.Error()` | Failures that affect functionality |
| Fatal | `Log.Fatal()` | Unrecoverable errors |

### Viewing Logs

- **Game Studio:** Output panel shows logs during play mode
- **Console:** Logs print to stdout when running from command line
- **Visual Studio:** Logs appear in the Output window (Debug output)

### Custom Log Modules

For non-script classes, create a logger by module name:

```csharp
public class InventorySystem
{
    private static readonly Logger Log = GlobalLogger.GetLogger("InventorySystem");

    public void AddItem(string itemId)
    {
        Log.Info($"Adding item: {itemId}");
    }
}
```

---

## 4 — Roslyn Diagnostic Analyzers

Stride ships Roslyn analyzers that catch common mistakes at compile time in your IDE. These appear as warnings or errors with squiggly underlines.

### Serialization Analyzers

The analyzers focus on Stride's serialization system, which determines what data is saved to assets and exposed in Game Studio:

- **Non-serializable field warning** — a public field or property with a type that Stride can't serialize
- **Missing DataContract attribute** — a class used as a component or asset without `[DataContract]`
- **DataMember on unsupported type** — `[DataMember]` on a field whose type has no serializer

### Example

```csharp
// Analyzer warning: 'Action' is not serializable by Stride
[DataContract]
public class MyComponent : ScriptComponent
{
    public Action OnDamage { get; set; } // ⚠️ STRDIAG001: not serializable

    public float Health { get; set; } = 100f; // ✓ serializable
}
```

### Configuring Analyzers

The analyzers are included in the Stride NuGet packages and activate automatically. To suppress a specific diagnostic:

```csharp
#pragma warning disable STRDIAG001
public Action OnDamage { get; set; }
#pragma warning restore STRDIAG001
```

Or in `.editorconfig`:

```ini
[*.cs]
dotnet_diagnostic.STRDIAG001.severity = none
```

---

## 5 — GPU Debugging with RenderDoc

RenderDoc is a free, open-source graphics debugger that captures individual frames for inspection. It works with Stride's Vulkan, DirectX 11, and OpenGL backends.

### Capture Workflow

1. **Install RenderDoc** from [renderdoc.org](https://renderdoc.org)
2. **Launch your game through RenderDoc:**
   - Open RenderDoc → File → Launch Application
   - Set the executable path to your game's `.exe`
   - Set the working directory to the game project folder
3. **Capture a frame:** press **F12** (default) or **Print Screen** during gameplay
4. **Inspect the capture:**
   - View every draw call in order
   - Inspect bound textures, shaders, render targets
   - View mesh data, vertex buffers, index buffers
   - Step through shader execution

### What to Look For

| Issue | RenderDoc Evidence |
|-------|-------------------|
| Missing object | Draw call not present, or culled (check frustum) |
| Black material | Texture binding is null or wrong slot |
| Z-fighting | Two draw calls at identical depth |
| Overdraw | Event browser shows many overlapping transparent draws |
| Shader error | Shader source tab shows compilation warnings |

### Programmatic Capture

Stride does not have a built-in RenderDoc integration API, but you can trigger captures programmatically through RenderDoc's in-application API if you load its DLL at startup.

---

## 6 — Visual Studio Diagnostic Tools

Visual Studio's built-in tools complement Stride's profiler:

### Performance Profiler (Alt + F2)

- **CPU Usage** — identify hot methods in your scripts
- **.NET Object Allocation** — find scripts allocating per frame (causes GC pressure)
- **Events Viewer** — trace ETW events from .NET runtime

### Memory Diagnostic

- Take heap snapshots during gameplay
- Compare snapshots to find memory leaks
- Track which objects are retained and by what

### Common Performance Patterns to Watch

```csharp
// BAD: allocates every frame
public override void Update()
{
    var enemies = Entity.Scene.Entities
        .Where(e => e.Get<EnemyTag>() != null)
        .ToList(); // ← GC allocation every frame
}

// GOOD: cache the list, update periodically
private readonly List<Entity> enemies = new();
private float refreshTimer;

public override void Update()
{
    refreshTimer -= (float)Game.UpdateTime.Elapsed.TotalSeconds;
    if (refreshTimer <= 0)
    {
        enemies.Clear();
        foreach (var entity in Entity.Scene.Entities)
        {
            if (entity.Get<EnemyTag>() != null)
                enemies.Add(entity);
        }
        refreshTimer = 0.5f; // refresh every 500ms
    }
}
```

---

## 7 — Common Debugging Scenarios

### Script Not Running

1. Check the entity is in the active scene (not a disabled child scene)
2. Verify the script component is enabled in Game Studio
3. Check for exceptions in `Start()` — an exception there prevents `Update()` from being called
4. Look at the Output panel for error messages

### Physics Collisions Not Firing

1. Ensure both entities have physics components (at least one dynamic/kinematic body)
2. Check collision groups — are the layers set to collide?
3. Verify trigger vs. solid body settings
4. Add `Log.Debug()` in the collision handler to confirm it's registered

### Asset Not Loading

1. Check the asset URL matches the path in the Asset folder (case-sensitive)
2. Verify the asset is included in the build (check Game Studio's asset properties)
3. Look for `ContentManagerException` in logs
4. Try `Content.Exists(url)` before loading to verify the asset is available

### Shader Compilation Errors

1. Check the Game Studio **Output** panel for SDSL compilation errors
2. SDSL errors include file and line information
3. Common issues: missing semicolons, wrong mixin syntax, referencing undefined streams
4. Use the **Effect Compiler** logs (verbose mode) for detailed shader pipeline output

---

## 8 — Debugging Code-Only Projects

Code-only projects (no Game Studio) use standard .NET debugging:

```bash
# Run with debugger from command line
dotnet run --project MyGame.Windows --configuration Debug

# Or attach Visual Studio / Rider to the running process
```

For profiling code-only projects, add the GameProfiler programmatically:

```csharp
using Stride.CommunityToolkit.Engine;
using Stride.Profiling;

var game = new Game();
game.Run(start: (Scene rootScene) =>
{
    game.SetupBase3DScene();

    // Add profiler overlay
    var profilerEntity = new Entity("Profiler");
    profilerEntity.Add(new GameProfiler());
    rootScene.Entities.Add(profilerEntity);

    // Toggle with Ctrl+Shift+P at runtime
});
```

Logs from code-only projects print to the console by default. Configure log level:

```csharp
// Set minimum log level before game.Run()
GlobalLogger.GlobalMessageLogged += (ref LogMessage msg) =>
{
    if (msg.Type >= LogMessageType.Warning)
        Console.WriteLine($"[{msg.Module}] {msg.Text}");
};
```
